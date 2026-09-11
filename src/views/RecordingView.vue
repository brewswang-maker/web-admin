<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deviceHttp, recordingHttp } from '@/api/http'
import { alarmApi } from '@/api/alarm'  // [P3-VP1] 时间轴告警标记
import { getRecordings, playRecording, stopPlayback as stopRecordingPlayback, controlPlayback, downloadRecording, recordUrlCandidates, toLocalISOString, type RecordingSegment as ApiRecordingSeg } from '@/api/recording'
import {
  getWatermark, updateWatermark,
  downloadSegment as downloadSegmentApi,
  type WatermarkConfig,
} from '@/api/recording'
import Hls from 'hls.js'
import flvjs from 'flv.js'
import axios from 'axios'
// [REC-UI 2026-09-11] 设计图回放页控制条图标 (上一段/播放暂停/下一段/全屏)
import { Search, VideoPlay, VideoPause, DArrowLeft, DArrowRight, FullScreen } from '@element-plus/icons-vue'
import { getDeviceChannels } from '@/api/devices'
// [UI 2026-09-11] 通道目录树 (区域→设备→通道) — 与 LiveView/ChannelView 同源工具
import { securityAreaApi } from '@/api/securityAreas'
import { buildAreaTree, areaTreeToElTreeData } from '@/utils/areaTree'

interface Device {
  id: string
  name: string
  channels: Channel[]
}
interface Channel {
  id: string
  name: string
  deviceId: string
}
interface RecordingSegment extends ApiRecordingSeg {
  filePath?: string
  /** [REC-PLAY 2026-09-11] ZLM 来源条目自带的 /record/ 静态直链 (MP4, HTTP Range 可精准 seek) */
  url?: string
  /** 数据源: zlm=本地告警联动 MP4 (直链播放) / gb28181=设备端录像 (回放流) */
  source?: string
}

interface LocalRecording {
  id: number
  channel_id: string
  device_id: string
  file_path: string
  start_time: string
  end_time: string
  file_size_bytes: number
  codec: string
  width: number
  height: number
  duration_seconds: number
}

const devices = ref<Device[]>([])
const selectedDeviceId = ref('')
const selectedChannelId = ref('')
const selectedDate = ref(new Date().toISOString().split('T')[0])
const recordings = ref<RecordingSegment[]>([])
const loading = ref(false)
const playingUrl = ref('')
const isPlaying = ref(false)
const isPaused = ref(false)
const playbackSpeed = ref(1)
const currentSessionId = ref('')
// [REC-PLAY 2026-09-11] 当前播放段起点 ms: jumpToTime 原按「当天 0 点秒数」设 currentTime,
//   对分段文件 (段 14:00 开始) 必越界 → 定位失效。playSegment 成功后记录段起点,
//   jumpToTime 换算为「段内 offset 秒」, stopPlay 清零。
const currentSegmentStartMs = ref(0)
// [REC-UI 2026-09-11] 当前播放段 id (控制条「上一段/下一段」导航 + 片段列表高亮)
const currentRecId = ref('')
// [REC-TSEEK 2026-09-11] 按时间点观看弹窗
const timeSeekVisible = ref(false)
const timeSeekDate = ref('')
const timeSeekTime = ref('14:30:25')
const timeSeekLoading = ref(false)
const videoRef = ref<HTMLVideoElement>()
const videoContainerRef = ref<HTMLElement>()  // [V4-X4 2026-07-08] 全屏容器
const canvasRef = ref<HTMLCanvasElement>()
// [REC-FUSE 2026-09-11] 智能检索抽屉内时间分布画布 (独立 ref, 避免与回放时间轴 canvasRef 冲突)
const smartCanvasRef = ref<HTMLCanvasElement>()
let playerInstance: Hls | flvjs.Player | null = null

// [V4-X4 2026-07-08] 进度条与全屏状态
const currentTime = ref(0)
const duration = ref(0)
const isSeeking = ref(false)
const seekValue = ref(0)
const isFullscreen = ref(false)
function formatHMS(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '00:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h > 0
    ? `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
    : `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
}

// Task #23: 本地录像 / 离线回放
// [REC-FUSE 2026-09-11] 源切换仅保留 设备录像/本地录像; 智能检索融合为抽屉, 计划/存储已迁出平台设置
const recordingSource = ref<'device' | 'local'>('device')
// [REC-FUSE 2026-09-11] AI 智能检索抽屉 + 存储位置过滤 (设计图「全部录像/中心储存」下拉)
const smartDrawerVisible = ref(false)
const recordTypeFilter = ref<'all' | 'zlm' | 'gb28181'>('all')
const localRecordings = ref<LocalRecording[]>([])
const localLoading = ref(false)
const isOffline = ref(false)
let offlineCheckTimer: ReturnType<typeof setInterval> | null = null

// [P3-VP1] 时间轴告警事件标记
const timelineAlarms = ref<Array<{ timestamp: number; alarm_type: string; level: string; description?: string }>>([])
watch([selectedChannelId, selectedDate], () => {
  fetchTimelineAlarms()
})

type PlaybackFormat = 'flv' | 'ws-flv' | 'hls'
const FORMAT_OPTIONS: { value: PlaybackFormat; label: string }[] = [
  { value: 'flv', label: 'HTTP-FLV' },
  { value: 'ws-flv', label: 'WS-FLV' },
  { value: 'hls', label: 'HLS' },
]
const playbackFormat = ref<PlaybackFormat>('flv')

// [REC-SCHEDULE 2026-09-11] 录像计划管理已整体迁出 → SettingsView「录像计划」Tab (复用既有 4 个 CRUD API)

// [P0-2] 水印配置状态
const watermarkDialogVisible = ref(false)
const watermarkConfig = ref<WatermarkConfig | null>(null)
const watermarkLoading = ref(false)

// [P1-2] 片段下载时间范围
const segmentDownloadVisible = ref(false)
const segStartTime = ref('')
const segEndTime = ref('')

// [REC-STORAGE 2026-09-11] 存储预估已迁出 → SettingsView「存储预估」Tab

const channels = computed(() => {
  const dev = devices.value.find(d => d.id === selectedDeviceId.value)
  return dev?.channels || []
})

watch(selectedDeviceId, () => {
  selectedChannelId.value = ''
  recordings.value = []
})

watch(selectedDate, () => { recordings.value = [] })

// ── [UI 2026-09-11] 左侧通道目录树 (替代设备/通道双下拉, 与视频预览页同款) ──
const recTreeRef = ref()
const recTreeFilter = ref('')
const recAreaRoots = ref<ReturnType<typeof buildAreaTree>>([])

const deviceById = computed(() => new Map(devices.value.map(d => [String(d.id), d] as const)))

/** 通道按设备分组 (树二级→三级挂接源; 内嵌 channels 已带 deviceId) */
const recChannelsByDevice = computed(() => {
  const m = new Map<string, Channel[]>()
  for (const d of devices.value) {
    for (const c of d.channels || []) {
      const k = String(c.deviceId || d.id)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(c)
    }
  }
  return m
})

const recDevLabel = (devId: string) => deviceById.value.get(devId)?.name || devId
const recChLabel = (c: Channel) => c.name || c.id
const recDevChannelCount = (data: { deviceId?: string }) =>
  (recChannelsByDevice.value.get(String(data.deviceId)) ?? []).length

// 安保区域树与设备主链解耦: 失败降级空 roots (全部设备进「未分组」)
async function loadRecAreaTree() {
  try {
    const res = await securityAreaApi.listAreas() as any
    const raw = res?.data?.data?.areas ?? res?.data?.data?.items ?? res?.data?.data ?? res?.data ?? []
    recAreaRoots.value = buildAreaTree(Array.isArray(raw) ? raw : [])
  } catch {
    recAreaRoots.value = []
  }
}

/** 三级树数据: 区域→设备→通道 + 「未分组」兜底 — 同 LiveView claimed 去重范式
 *  (node-key 全局唯一: 同设备/通道只挂首个管辖区域, 跨区域重复破坏选中态) */
const recTreeData = computed(() => {
  const claimed = new Set<string>()
  const areaNodes = areaTreeToElTreeData(recAreaRoots.value, (n) => {
    const out: Array<{ key: string; label: string; type: string; deviceId?: string; isLeaf?: boolean; children?: unknown[] }> = []
    for (const devId of n.area.device_ids ?? []) {
      if (claimed.has(`dev:${devId}`)) continue
      const chs = recChannelsByDevice.value.get(devId) ?? []
      if (!chs.length) continue
      claimed.add(`dev:${devId}`)
      out.push({
        key: `dev:${devId}`,
        label: recDevLabel(devId),
        type: 'device',
        deviceId: devId,
        children: chs
          .filter(c => !claimed.has(String(c.id)))
          .map(c => { claimed.add(String(c.id)); return { key: String(c.id), label: recChLabel(c), type: 'channel', deviceId: devId, isLeaf: true } }),
      })
    }
    for (const cid of n.area.channel_ids ?? []) {
      const hit = [...recChannelsByDevice.value.values()].flat().find(c => String(c.id) === String(cid))
      if (hit && !claimed.has(String(hit.id))) {
        const devId = String(hit.deviceId || '')
        claimed.add(String(hit.id))
        out.push({ key: String(hit.id), label: recChLabel(hit), type: 'channel', deviceId: devId, isLeaf: true })
      }
    }
    return out
  })
  // 未分组兜底: 未被任何区域领取的设备 (整设备) 与孤立通道
  const orphanNodes: Array<{ key: string; label: string; type: string; deviceId?: string; isLeaf?: boolean; children?: unknown[] }> = []
  for (const [devId, chs] of recChannelsByDevice.value) {
    const free = chs.filter(c => !claimed.has(String(c.id)))
    if (!free.length) continue
    if (devId !== '_' && deviceById.value.has(devId)) {
      claimed.add(`dev:${devId}`)
      orphanNodes.push({
        key: `dev:${devId}`,
        label: recDevLabel(devId),
        type: 'device',
        deviceId: devId,
        children: free.map(c => { claimed.add(String(c.id)); return { key: String(c.id), label: recChLabel(c), type: 'channel', deviceId: devId, isLeaf: true } }),
      })
    } else {
      for (const c of free) { claimed.add(String(c.id)); orphanNodes.push({ key: String(c.id), label: recChLabel(c), type: 'channel', deviceId: String(c.deviceId || ''), isLeaf: true }) }
    }
  }
  if (!orphanNodes.length) return areaNodes
  const ungrouped = { key: '__ungrouped__', label: '未分组', type: 'ungrouped', children: orphanNodes as unknown[] }
  return areaNodes.length ? [...areaNodes, ungrouped] : [ungrouped]
})

watch(recTreeFilter, (v) => recTreeRef.value?.filter(v))

function filterRecTreeNode(value: string, data: { label?: string }) {
  if (!value) return true
  return String(data?.label ?? '').toLowerCase().includes(value.toLowerCase())
}

/** 点击通道叶子: 设备变化先切设备 (watch 清空效果由 nextTick 覆盖, 同 URL 定位范式), 再设通道 */
function onRecNodeClick(data: { type?: string; key?: unknown; deviceId?: string }) {
  if (data?.type !== 'channel') return
  const chId = String(data.key)
  if (data.deviceId && data.deviceId !== selectedDeviceId.value) selectedDeviceId.value = data.deviceId
  nextTick(() => { selectedChannelId.value = chId })
}

// 树高亮同步当前通道 (URL 定位/程序赋值同生效)
watch(selectedChannelId, (id) => {
  if (!id) return
  nextTick(() => recTreeRef.value?.setCurrentKey(id))
})

async function fetchDevices() {
  try {
    const { data } = await deviceHttp.get('', { params: { protocol: 'GB28181,ONVIF' } })
    // [D2-FIX] 后端返回 { data: { devices: [...], items: [...] } } 对象
    //   之前直接 data?.data 得到的是对象而非数组, .map() 抛 TypeError 被 catch 静默
    //   修复: 从 devices/items 数组中提取, 兼容直接返回数组的场景
    const respData = data?.data ?? data
    const list: any[] = Array.isArray(respData)
      ? respData
      : (respData?.devices || respData?.items || [])
    devices.value = list.map((d: any) => ({
      id: d.device_id || d.id,
      name: d.device_name || d.name || d.id,
      channels: (d.channels || [{ id: d.device_id || d.id, name: '通道1', deviceId: d.device_id || d.id }]).map((c: any) => ({
        id: c.channel_id || c.id,
        name: c.channel_name || c.name || `通道${c.id}`,
        deviceId: d.device_id || d.id
      }))
    }))
    // [FIX rec-ch-name 2026-09-11] 设备列表接口不内嵌通道详情 → 旧兑底给每设备
    //   造假「通道1」且只有 1 路: 名称错 + 数量缺双 BUG 同源。
    //   与 LiveView.loadData 同款: 逐设备拉通道主数据 (/devices/{id}/channels),
    //   真实名称 + 完整通道数; 失败保留内嵌兑底保可用。
    await Promise.allSettled(devices.value.map(async (dev) => {
      try {
        const res = await getDeviceChannels(dev.id) as any
        const chs: any[] = res?.data?.data ?? res?.data ?? res ?? []
        if (!Array.isArray(chs) || !chs.length) return
        dev.channels = chs.map((c: any) => ({
          id: String(c.channel_id || c.id),
          name: c.channel_name || c.name || (c.channel_no != null ? `通道${c.channel_no}` : String(c.channel_id || c.id)),
          deviceId: dev.id,
        }))
      } catch { /* 保留内嵌兑底 */ }
    }))
    // 选中校正: 已选 id 不在补齐后的真实通道集 (内嵌兑底假 id) → 清空, 避免拿假 id 查空
    //   (GB28181 单通道设备真实通道 id 常等于 device_id, 此时命中集合不清空)
    const validIds = new Set(devices.value.flatMap(d => (d.channels || []).map(c => c.id)))
    if (selectedChannelId.value && !validIds.has(selectedChannelId.value)) {
      selectedChannelId.value = ''
    }
    // 通道补齐为深层变更 (watch(devices) 浅层不感知) → 手动消费挂起的
    //   告警跳转 channelId 反查 (旧逻辑反查失败仅赋值 pendingChannelId, 无重试)
    if (pendingChannelId.value) {
      const chId = pendingChannelId.value
      pendingChannelId.value = ''
      const hit = devices.value
        .flatMap(d => (d.channels || []).map(c => ({ dev: d, c })))
        .find(({ c }) => c.id === chId)
      if (hit) {
        selectedDeviceId.value = hit.dev.id
        nextTick(() => { selectedChannelId.value = chId })
      }
    }
  } catch { /* 静默 */ }
}

/**
 * [FIX rec-snake 2026-09-11] 后端 POST /recordings/query 返回 snake_case 原始条目:
 *   ZLM 来源   { id: 磁盘绝对路径, start_time, end_time, file_size, url: /record/... , source: 'zlm' }
 *   GB28181 来源 { id: device_starttime, start_time, end_time, file_size, source: 'gb28181' }
 * 旧代码直接赋值 → 表格 startTime/endTime/fileSize 与 playSegment 入参全 undefined,
 *   播放/下载/时间轴三链齐断 (时长列恒 0 另有后端 end_time=start_iso bug, 已同修)。
 * 统一在此映射为 camelCase RecordingSegment, 并保留 url/source 供播放分流。
 */
function normalizeDeviceRecording(raw: Record<string, unknown>): RecordingSegment {
  const startTime = String(raw.start_time ?? raw.startTime ?? '')
  const endTime = String(raw.end_time ?? raw.endTime ?? '')
  const startMs = startTime ? Date.parse(startTime) : NaN
  const endMs = endTime ? Date.parse(endTime) : NaN
  let duration = Number(raw.duration ?? 0)
  if ((!duration || duration <= 0) && !isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
    duration = Math.round((endMs - startMs) / 1000)
  }
  return {
    id: String(raw.id ?? ''),
    deviceId: String(raw.device_id ?? raw.deviceId ?? ''),
    channelNo: Number(raw.channel_no ?? raw.channelNo ?? 0),
    startTime,
    endTime,
    duration,
    fileSize: Number(raw.file_size ?? raw.fileSize ?? 0),
    type: (raw.type as RecordingSegment['type']) ?? 'event',
    status: 'available',
    url: raw.url ? String(raw.url) : undefined,
    source: raw.source ? String(raw.source) : undefined,
  }
}

async function fetchRecordings() {
  if (!selectedDeviceId.value || !selectedChannelId.value || !selectedDate.value) {
    ElMessage.warning('请选择设备、通道和日期')
    return
  }
  loading.value = true
  try {
    // 使用 POST /api/v1/recordings/query 查询GB28181设备录像
    const { data } = await recordingHttp.post('/query', {
      device_id: selectedDeviceId.value,
      channel_id: selectedChannelId.value,
      start_time: selectedDate.value + 'T00:00:00',
      end_time: selectedDate.value + 'T23:59:59',
    })
    // [FIX rec-snake 2026-09-11] 见 normalizeDeviceRecording 注释: 先映射再入 store
    const rawList: Array<Record<string, unknown>> = data?.data?.recordings || data?.data || []
    recordings.value = rawList.map(normalizeDeviceRecording)
    await nextTick()
    drawTimeline()
  } catch (e: any) {
    ElMessage.error('查询录像失败: ' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

function drawTimeline() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width = canvas.offsetWidth * 2
  const H = canvas.height = 80
  ctx.clearRect(0, 0, W, H)

  // 背景
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, W, H)

  // 时间刻度
  ctx.fillStyle = '#666'
  ctx.font = '20px monospace'
  for (let h = 0; h <= 24; h++) {
    const x = (h / 24) * W
    ctx.fillStyle = '#444'
    ctx.fillRect(x, 0, 1, H)
    ctx.fillStyle = '#888'
    ctx.fillText(`${h}:00`, x + 4, H - 8)
  }

  // 录像段
  ctx.fillStyle = '#3b82f6'
  for (const rec of recordings.value) {
    const start = timeToPercent(rec.startTime)
    const end = timeToPercent(rec.endTime)
    ctx.fillRect(start * W, 10, (end - start) * W, H - 30)
  }

  // [P3-VP1] 告警事件标记 (红色三角形/方块) — 可点击跳转
  if (timelineAlarms.value.length > 0) {
    for (const a of timelineAlarms.value) {
      const pct = alarmToPercent(a.timestamp)
      if (pct < 0 || pct > 1) continue
      const x = pct * W
      const level = a.level || 'low'
      const color = level === 'critical' ? '#FF3D71'
        : level === 'high' ? '#FF6B35'
        : level === 'medium' ? '#FFB800'
        : '#00D4AA'
      ctx.fillStyle = color
      // 告警事件：底部三角形标记
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x - 5, 10)
      ctx.lineTo(x + 5, 10)
      ctx.closePath()
      ctx.fill()
      // 竖线
      ctx.fillRect(x - 1, 10, 2, H - 24)
    }
  }

  // 当前时间线
  const now = new Date()
  if (selectedDate.value === now.toISOString().split('T')[0]) {
    const nowPct = (now.getHours() + now.getMinutes() / 60) / 24
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(nowPct * W, 0)
    ctx.lineTo(nowPct * W, H)
    ctx.stroke()
  }
}

function timeToPercent(timeStr: string): number {
  const parts = timeStr.match(/(\d{2}):(\d{2}):(\d{2})/)
  if (!parts) return 0
  return (parseInt(parts[1]) + parseInt(parts[2]) / 60 + parseInt(parts[3]) / 3600) / 24
}

async function playSegment(rec: RecordingSegment, opts?: { startAtMs?: number }) {
  try {
    // [FIX rec-play 2026-09-11] 三处断点修复:
    //   ① rec.id 为 ZLM 磁盘绝对路径 (含 '/'), 拼进 /${id}/play 路由必 404
    //      → 改占位段 '0' (后端处理器仅回显 id, 真实参数全从 body 取);
    //   ② ZLM 条目自带 url (/record/ MP4 直链, Range 可 seek) → 直链优先,
    //      无需起 GB28181 回放流, 且「按时间点」可直接 currentTime 精准定位;
    //   ③ 播放成功后补写 playingUrl (原缺, jumpToTime 的守卫恒触发) 与
    //      currentSegmentStartMs (jumpToTime 段内 offset 换算基准)。
    if (rec.url) {
      if (playerInstance) {
        if ('destroy' in playerInstance) playerInstance.destroy()
        playerInstance = null
      }
      currentSegmentStartMs.value = Date.parse(rec.startTime) || 0
      currentRecId.value = rec.id
      currentSessionId.value = ''
      isPlaying.value = true
      isPaused.value = false
      await nextTick()
      const video = videoRef.value
      if (!video) return
      // [FIX rec-url 2026-09-11] 相对路径 /record/... 在 nginx 未配路由时 404 →
      //   候选链: 同源双层优先, 失败 (video error) 回退 8088 双层 (LAN 兜底)
      const cands = recordUrlCandidates(rec.url)
      let candIdx = 0
      video.onerror = () => {
        if (candIdx + 1 < cands.length) {
          candIdx += 1
          playingUrl.value = cands[candIdx]
          video.src = cands[candIdx]
          video.play().catch(() => {})
        }
      }
      playingUrl.value = cands[candIdx]
      video.src = cands[candIdx]
      video.play().catch(() => {})
      if (opts?.startAtMs) await jumpToTime(opts.startAtMs)
      return
    }

    // GB28181 设备录像: 回放流从 start_time 起推; startAtMs 传入时设备直接
    //   从目标时刻开播 (GB28181 Playback 原生支持任意起点), 无需本地 seek 未来缓冲。
    const startIso = opts?.startAtMs ? toLocalISOString(new Date(opts.startAtMs)) : rec.startTime
    if (opts?.startAtMs) currentSegmentStartMs.value = opts.startAtMs
    const { data } = await recordingHttp.post(`/0/play`, {
      id: rec.id,
      device_id: selectedDeviceId.value,
      channel_id: selectedChannelId.value,
      start_time: startIso,
      end_time: rec.endTime,
    })
    const result = data?.data || data
    if (!result?.urls) {
      ElMessage.warning('未获取到播放地址，设备可能不支持回放')
      return
    }
    const urls = result.urls
    currentSessionId.value = result.call_id || ''
    currentRecId.value = rec.id

    // 清理旧播放器
    if (playerInstance) {
      if ('destroy' in playerInstance) playerInstance.destroy()
      playerInstance = null
    }

    isPlaying.value = true
    isPaused.value = false
    await nextTick()

    const video = videoRef.value
    if (!video) return

    // 按选定格式播放，不可用时降级
    const fmt = playbackFormat.value
    const urlMap: Record<string, string> = {
      'flv': urls.flv,
      'ws-flv': urls.wsFlv,
      'hls': urls.hls,
    }

    let playUrl = urlMap[fmt] || ''
    if (!playUrl) {
      // 降级链
      for (const fb of ['flv', 'hls', 'ws-flv']) {
        if (urlMap[fb]) { playUrl = urlMap[fb]; break }
      }
    }
    if (!playUrl) { ElMessage.warning('无可用的播放格式'); return }

    // [FIX rec-play 2026-09-11] 原缺: 不写 playingUrl 则 jumpToTime 守卫恒警告返回
    playingUrl.value = playUrl
    if (!currentSegmentStartMs.value) {
      currentSegmentStartMs.value = Date.parse(rec.startTime) || 0
    }

    // RTSP 浏览器不支持，强制降级
    if (playUrl.startsWith('rtsp://') || playUrl.startsWith('rtmp://')) {
      ElMessage.warning({ message: '浏览器不支持 RTSP/RTMP 播放，已切换为 HTTP-FLV', duration: 3000 })
      const fbUrl = urlMap['flv'] || urlMap['hls'] || ''
      if (!fbUrl) { ElMessage.warning('无可用的播放格式'); return }
      playUrl = fbUrl
    }

    if (playUrl.endsWith('.flv') && flvjs.isSupported()) {
      const player = flvjs.createPlayer({
        type: 'flv', url: playUrl, isLive: false,
        hasAudio: true, hasVideo: true,
      }, { enableStashBuffer: false })
      player.attachMediaElement(video)
      player.load()
      player.play()
      player.on(flvjs.Events.ERROR, () => {
        player.destroy()
        playerInstance = null
        if (urls.hls) attachHls(urls.hls)
      })
      playerInstance = player
    } else if (playUrl.includes('.m3u8') || playUrl.includes('hls')) {
      attachHls(playUrl)
    } else {
      video.src = playUrl
      video.play().catch(() => {})
    }
  } catch (e: any) {
    ElMessage.error('回放失败: ' + (e.message || ''))
  }
}

function attachHls(hlsUrl: string) {
  const video = videoRef.value
  if (!video) return
  if (Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, maxBufferLength: 30 })
    hls.loadSource(hlsUrl)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      }
    })
    playerInstance = hls
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = hlsUrl
    video.addEventListener('loadedmetadata', () => video.play().catch(() => {}))
  }
}

// [FIX rec-dl 2026-09-11] 原 window.open('/recordings/${id}/download'):
//   ① id 为磁盘路径含 '/' → URL 撕裂; ② 该路由后端不存在 → 恒 404。
//   改走已治本的 download-file?path= 链 (nginx /record/ 静态直链, Range 206 实测)。
async function downloadSegment(rec: RecordingSegment) {
  try {
    await downloadRecording(rec.id)
    ElMessage.success('下载已开始')
  } catch (e: any) {
    ElMessage.error('下载失败: ' + (e?.message || ''))
  }
}

// ── [REC-UI 2026-09-11] 设计图回放页交互增强 ──

/** 查询面板「已选择」展示 (设计图左侧栏) */
const qpDeviceLabel = computed(() => {
  const dev = devices.value.find(d => String(d.id) === String(selectedDeviceId.value))
  return dev?.name || '未选择设备'
})
const qpChannelLabel = computed(() => {
  const dev = devices.value.find(d => String(d.id) === String(selectedDeviceId.value))
  const ch = (dev?.channels || []).find(c => String(c.id) === String(selectedChannelId.value))
  return ch ? (ch.name || ch.id) : '未选择通道'
})

/** 存储位置过滤 (设计图「全部录像 / 中心储存」下拉): zlm=中心存储 MP4 / gb28181=设备端录像 */
const filteredRecordings = computed(() => {
  if (recordTypeFilter.value === 'zlm') return recordings.value.filter(r => r.source === 'zlm')
  if (recordTypeFilter.value === 'gb28181') return recordings.value.filter(r => r.source !== 'zlm')
  return recordings.value
})

/** 回放钟 (设计图控制条时间框): 段起点 + 播放进度 → 绝对时刻 */
const playbackClockLabel = computed(() => {
  if (!isPlaying.value || !currentSegmentStartMs.value) return '--'
  const d = new Date(currentSegmentStartMs.value + currentTime.value * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
})

function timeOnly(s: string): string {
  return s?.split('T')[1]?.substring(0, 8) || s || '--'
}
function segRangeLabel(rec: RecordingSegment): string {
  return `${timeOnly(rec.startTime)} - ${timeOnly(rec.endTime)}`
}

/** 控制条「上一段/下一段」 (设计图控制条导航) */
function navSegment(dir: -1 | 1) {
  const list = filteredRecordings.value
  if (!list.length) return
  let idx = list.findIndex(r => r.id === currentRecId.value)
  if (idx < 0) idx = dir > 0 ? -1 : 0
  const next = list[idx + dir]
  if (next) playSegment(next)
  else ElMessage.info(dir > 0 ? '已是最后一段' : '已是第一段')
}
function playPrevSegment() { navSegment(-1) }
function playNextSegment() { navSegment(1) }

/** 批量下载 (设计图「录像下载」入口): 逐段 fetch→blob→objectURL 强制落盘 */
async function batchDownload() {
  const list = filteredRecordings.value
  if (!list.length) {
    ElMessage.warning('暂无可下载的录像段')
    return
  }
  try {
    await ElMessageBox.confirm(`将逐段下载 ${list.length} 个录像文件，是否继续？`, '提示', { type: 'warning' })
  } catch { return }
  let ok = 0
  let fail = 0
  for (const rec of list) {
    try {
      await downloadRecording(rec.id)
      ok++
    } catch { fail++ }
    await new Promise(r => setTimeout(r, 300))  // 间隔触发, 避免浏览器并发下载拦截
  }
  if (fail) ElMessage.warning(`下载完成: 成功 ${ok} 段, 失败 ${fail} 段`)
  else ElMessage.success(`已触发 ${ok} 段录像下载`)
}

/** 设计图查询按钮: 按当前源分流 (设备录像 / 本地录像) */
async function onQueryClick() {
  if (recordingSource.value === 'local') await fetchLocalRecordings()
  else await fetchRecordings()
}

async function togglePause() {
  // [REC-UI 2026-09-11] 设计图控制条「暂停/恢复」: GB28181 回放会话走后端控制;
  //   ZLM/本地 MP4 直链无会话 → 直接操作 video 元素 (原实现无会话直接 return, 按钮形同虚设)
  if (currentSessionId.value) {
    try {
      const action = isPaused.value ? 'resume' : 'pause'
      await recordingHttp.post(`/${currentSessionId.value}/control`, { action })
      isPaused.value = !isPaused.value
    } catch (e: any) {
      ElMessage.error('控制失败: ' + (e.message || ''))
    }
    return
  }
  const video = videoRef.value
  if (!video) return
  if (video.paused) {
    video.play().catch(() => {})
    isPaused.value = false
  } else {
    video.pause()
    isPaused.value = true
  }
}

async function changeSpeed(speed: number) {
  playbackSpeed.value = speed
  // 设置本地 video 播放速率（立即生效，不中断播放）
  if (videoRef.value) {
    videoRef.value.playbackRate = speed
  }
  // 通知后端（GB28181 设备端控速，设备可能不支持）
  if (currentSessionId.value) {
    try {
      await controlPlayback(currentSessionId.value, 'speed', { scale: speed })
    } catch {
      // 设备可能不支持倍速控制，本地速率仍生效
    }
  }
}

async function stopPlay() {
  if (currentSessionId.value) {
    try { await recordingHttp.post(`/${currentSessionId.value}/stop`) } catch { /* ignore */ }
  }
  if (playerInstance) {
    if ('destroy' in playerInstance) playerInstance.destroy()
    playerInstance = null
  }
  const video = videoRef.value
  if (video) { video.pause(); video.removeAttribute('src'); video.load() }
  isPlaying.value = false
  isPaused.value = false
  playingUrl.value = ''
  currentSessionId.value = ''
  currentSegmentStartMs.value = 0  // [REC-PLAY 2026-09-11] 同步清段起点基准
  currentRecId.value = ''          // [REC-UI 2026-09-11] 清段导航游标
  // [V4-X4 2026-07-08] 重置进度条状态
  currentTime.value = 0
  duration.value = 0
  seekValue.value = 0
}

// [V4-X4 2026-07-08] 进度条事件回调
function onLoadedMetadata() {
  const video = videoRef.value
  if (!video) return
  duration.value = isFinite(video.duration) ? video.duration : 0
}
function onTimeUpdate() {
  const video = videoRef.value
  if (!video) return
  if (!isSeeking.value) currentTime.value = video.currentTime
  if (duration.value === 0 && isFinite(video.duration)) duration.value = video.duration
}
function onSeekStart() { isSeeking.value = true }
function onSeekChange(v: number | number[]) {
  seekValue.value = Array.isArray(v) ? v[0] : v
}
function onSeekEnd(v: number | number[]) {
  const target = Array.isArray(v) ? v[0] : v
  const video = videoRef.value
  if (video && isFinite(target)) {
    video.currentTime = target
    currentTime.value = target
  }
  isSeeking.value = false
}

// [V4-X4 2026-07-08] 快捷键处理 (空格:暂停/播放  ←/→:快退/快进 5s  Shift+←/→:30s  Esc:退出全屏)
//   输入框聚焦时不响应避免误触
function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target) {
    const tag = (target.tagName || '').toUpperCase()
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return
    if ((target as any).isContentEditable) return
  }
  if (!isPlaying.value || !videoRef.value) return
  switch (e.key) {
    case ' ':
    case 'Spacebar':
      e.preventDefault()
      if (recordingSource.value === 'device') togglePause()
      else {
        const v = videoRef.value!
        if (v.paused) v.play().catch(() => {})
        else v.pause()
      }
      break
    case 'ArrowLeft':
      e.preventDefault()
      videoRef.value.currentTime = Math.max(0, videoRef.value.currentTime - (e.shiftKey ? 30 : 5))
      break
    case 'ArrowRight':
      e.preventDefault()
      if (isFinite(duration.value))
        videoRef.value.currentTime = Math.min(duration.value, videoRef.value.currentTime + (e.shiftKey ? 30 : 5))
      break
    case 'Escape':
      if (isFullscreen.value) toggleFullscreen()
      break
  }
}

// [V4-X4 2026-07-08] 全屏切换 (浏览器 Fullscreen API + 兼容 webkit)
async function toggleFullscreen() {
  const el = videoContainerRef.value
  if (!el) return
  try {
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen()
      else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen()
    } else {
      if (document.exitFullscreen) await document.exitFullscreen()
      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen()
    }
  } catch (e) {
    // 用户拒绝或浏览器不支持,仅前端提示
    console.warn('[V4-X4] fullscreen toggle failed:', (e as Error)?.message)
  }
}
function onFullscreenChange() {
  isFullscreen.value = !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
}

async function handleTimelineClick(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const pct = x / rect.width

  // [P3-VP1] 检测是否点击了告警标记 (容差 12px ≈ 0.5h)
  const tolerance = 12 / rect.width
  for (const a of timelineAlarms.value) {
    if (Math.abs(alarmToPercent(a.timestamp) - pct) < tolerance) {
      const ts = a.timestamp
      const d = new Date(ts)
      // [FIX rec-jump 2026-09-11] 与 jumpToTime 同源换算 (原「当天 0 点秒数」对分段文件越界)
      if (playingUrl.value && videoRef.value) {
        await jumpToTime(ts)
        ElMessage.success(`已跳转到告警: ${a.alarm_type} @ ${d.toLocaleTimeString('zh-CN')}`)
      } else {
        pendingJumpMs.value = ts
        ElMessage.info(`已记录跳转目标: ${d.toLocaleString('zh-CN')}，请先加载录像`)
      }
      return
    }
  }

  // [REC-UI 2026-09-11] 设计图: 点击时间轴蓝色录像块 → 从点击时刻开始回放
  const dayStartMs = new Date(`${selectedDate.value}T00:00:00`).getTime()
  const clickedMs = dayStartMs + pct * 24 * 3600 * 1000
  const segs = recordings.value
    .map(x => ({ r: x, s: Date.parse(x.startTime || ''), e: Date.parse(x.endTime || '') }))
    .filter(x => !isNaN(x.s))
    .sort((a, b) => a.s - b.s)
  const hit = segs.find(x => x.s <= clickedMs && clickedMs <= x.e + 5000)
  if (hit) {
    await playSegment(hit.r, { startAtMs: clickedMs })
    ElMessage.success(`已从 ${new Date(clickedMs).toLocaleTimeString('zh-CN')} 开始播放`)
    return
  }

  const hours = pct * 24
  const h = Math.floor(hours)
  const m = Math.floor((hours - h) * 60)
  ElMessage.info(`点击时间: ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
}

// [P3-VP1] 告警时间戳 → 时间轴百分比
function alarmToPercent(ts: number): number {
  const d = new Date(ts)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime()
  return (ts - dayStart) / (24 * 3600 * 1000)
}

// [P3-VP1] 加载通道当天的告警事件用于时间轴标记
async function fetchTimelineAlarms() {
  if (!selectedChannelId.value || !selectedDate.value) {
    timelineAlarms.value = []
    return
  }
  try {
    const dayStart = new Date(selectedDate.value + 'T00:00:00').getTime()
    const dayEnd = dayStart + 24 * 3600 * 1000
    const { data: res } = await alarmApi.getList({
      channelId: String(selectedChannelId.value),
      start_time: dayStart,
      end_time: dayEnd,
      pageSize: 200,
    } as any)
    timelineAlarms.value = (res?.data?.items || []) as unknown as Array<{
      timestamp: number; alarm_type: string; level: string; description?: string
    }>
    await nextTick()
    drawTimeline()
    ElMessage.success(`[P3-VP1] 已加载 ${timelineAlarms.value.length} 个告警标记`)
  } catch (e: any) {
    console.warn('[P3-VP1] fetchTimelineAlarms failed:', e?.message)
  }
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h}时${m}分${s}秒`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1048576).toFixed(1) + 'MB'
}

// ---- Task #23: 本地录像查询 ----
async function fetchLocalRecordings() {
  localLoading.value = true
  try {
    const params: Record<string, string | number> = {
      start_date: selectedDate.value,
      end_date: selectedDate.value,
      page: 1,
      page_size: 200,
    }
    if (selectedChannelId.value) params.channel_id = selectedChannelId.value
    if (selectedDeviceId.value) params.device_id = selectedDeviceId.value

    const { data } = await recordingHttp.get('/local', { params })
    localRecordings.value = data?.data?.recordings || []
  } catch (e: any) {
    ElMessage.error('查询本地录像失败: ' + (e.message || ''))
  } finally {
    localLoading.value = false
  }
}

// ---- Task #23: 本地录像播放 ----
async function playLocalRecording(rec: LocalRecording) {
  await playLocalRecordingById(rec.id, Date.parse(rec.start_time) || 0)
}

/** [REC-FUSE 2026-09-11] recording_id→/local/{id}/play 独立播放 (智能检索兜底链路, 原播放逻辑抽出)
 *  startMs: 磁盘录像起点 → 回放钟基准 (段起点 + 进度 = 绝对时刻) */
async function playLocalRecordingById(id: number, startMs = 0) {
  try {
    // 获取播放 URL
    const { data } = await recordingHttp.get(`/local/${id}/play`)
    const playUrl = data?.data?.play_url
    if (!playUrl) {
      ElMessage.warning('未获取到本地录像播放地址')
      return
    }

    // 清理旧播放器
    if (playerInstance) {
      if ('destroy' in playerInstance) playerInstance.destroy()
      playerInstance = null
    }

    isPlaying.value = true
    isPaused.value = false
    currentSessionId.value = ''
    currentRecId.value = ''
    currentSegmentStartMs.value = startMs
    await nextTick()

    const video = videoRef.value
    if (!video) return

    // 本地录像 MP4 原生播放
    video.src = playUrl
    video.play().catch(() => {})
  } catch (e: any) {
    ElMessage.error('本地回放失败: ' + (e.message || ''))
  }
}

// ---- Task #23: 删除本地录像 ----
async function deleteLocalRecording(rec: LocalRecording) {
  try {
    await recordingHttp.delete(`/local/${rec.id}`)
    ElMessage.success('删除成功')
    localRecordings.value = localRecordings.value.filter(r => r.id !== rec.id)
  } catch (e: any) {
    ElMessage.error('删除失败: ' + (e.message || ''))
  }
}

// ---- Task #26: AI 智能检索 ----
// [FIX rec-fuse2 2026-09-11] 后端实际返回: timestamp 为 int 毫秒, channel_id 为告警库
//   hash 整型字符串, 无 device_id/recording_id (老库表结构); 类型放宽以保证渲染与
//   跳转逻辑不再对数字调用字符串方法。
interface SmartSearchResult {
  id: number | string
  alarm_type: string
  target_type: string
  confidence: number
  timestamp: number | string
  channel_id: string
  device_id?: string
  snapshot_path: string
  recording_id?: number
  recording_start?: string
  recording_end?: string
}

const smartAlarmTypes = ref<string[]>([])
const smartTargetTypes = ref<string[]>([])
const smartQuery = ref({
  alarm_type: '',
  target_type: '',
  start_time: '',
  end_time: '',
  min_confidence: 0,
  channel_id: '',
  page: 1,
  page_size: 20,
})
const smartResults = ref<SmartSearchResult[]>([])
const smartTotal = ref(0)
const smartLoading = ref(false)

async function fetchSmartFilterOptions() {
  try {
    const [alarmRes, targetRes] = await Promise.all([
      recordingHttp.get('/smart-search/alarm-types'),
      recordingHttp.get('/smart-search/target-types'),
    ])
    smartAlarmTypes.value = alarmRes.data?.data?.alarm_types || []
    smartTargetTypes.value = targetRes.data?.data?.target_types || []
  } catch { /* 静默 */ }
}

async function doSmartSearch() {
  smartLoading.value = true
  try {
    const payload: Record<string, unknown> = { ...smartQuery.value }
    // 移除空字段避免不必要的过滤
    Object.keys(payload).forEach(k => { if (payload[k] === '' || payload[k] === 0) delete payload[k] })
    const { data } = await recordingHttp.post('/smart-search', payload)
    smartResults.value = data?.data?.results || []
    smartTotal.value = data?.data?.total || 0
    await nextTick()
    drawTimelineWithDetections()
  } catch (e: any) {
    ElMessage.error('智能检索失败: ' + (e.message || ''))
  } finally {
    smartLoading.value = false
  }
}

function drawTimelineWithDetections() {
  const canvas = smartCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width = canvas.offsetWidth * 2
  const H = canvas.height = 80
  ctx.clearRect(0, 0, W, H)

  // 背景
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, W, H)

  // 时间刻度
  ctx.font = '20px monospace'
  for (let h = 0; h <= 24; h++) {
    const x = (h / 24) * W
    ctx.fillStyle = '#444'
    ctx.fillRect(x, 0, 1, H)
    ctx.fillStyle = '#888'
    ctx.fillText(`${h}:00`, x + 4, H - 8)
  }

  // 用红色标记 AI 检测时间点
  for (const r of smartResults.value) {
    // [FIX rec-fuse2 2026-09-11] ts 经 smartTsMs 归一 (后端为 int 毫秒, 旧 new Date(字符串数字) 恒 Invalid)
    const ms = smartTsMs(r.timestamp)
    if (isNaN(ms)) continue
    const t = new Date(ms)
    const pct = (t.getHours() + t.getMinutes() / 60 + t.getSeconds() / 3600) / 24
    const x = pct * W
    ctx.fillStyle = 'rgba(239,68,68,0.7)'
    ctx.fillRect(x - 2, 8, 4, H - 24)
  }
}

/**
 * [REC-FUSE 2026-09-11] 智能检索「跳转到该时刻回放」融入设备录像链路:
 *   ① 关闭抽屉 → 切设备录像 Tab → 反查/选中结果所属通道;
 *   ② 同步日期并查询设备录像 → 覆盖段匹配 → playSegment(startAtMs) 精准跳转
 *      (ZLM: MP4 Range seek / GB28181: 设备从目标时刻起推流);
 *   ③ 无覆盖段时保留原 recording_id→/local/{id}/play 独立播放链路兜底。
 * [FIX rec-fuse2 2026-09-11] 两处线上缺陷:
 *   a) timestamp 为 int 毫秒, 旧 Date.parse(String()) 恒 NaN → 统一经 smartTsMs 归一;
 *   b) channel_id 为告警库 hash 整型 (如 -705635631), 反查树必 miss 且旧逻辑会把
 *      hash 写入 selectedChannelId 投毒后续查询。现从 snapshot_path
 *      (/snapshots/rtp/gb_<真实通道>/) 或 id (det_<真实通道>_...) 提取真实 20 位
 *      国标码, 树内三级反查 (精确/剥 _chN/尾 10 位); 树外也直接用真实通道
 *      (后端 queryRecordings 已兼容裸码), 不再写入 hash。
 */

/** [FIX rec-fuse2] 统一解析 smart-search 时间戳为毫秒: number / 纯数字字符串 / ISO 均可, 失败 NaN */
function smartTsMs(ts: unknown): number {
  if (ts === null || ts === undefined || ts === '') return NaN
  if (typeof ts === 'number') return ts
  const s = String(ts)
  return /^\d+$/.test(s) ? Number(s) : Date.parse(s)
}

/** [FIX rec-fuse2] 从检索结果提取真实 20 位国标通道码: snapshot_path 优先, id 兜底, 无则 '' */
function extractRealChannel(r: SmartSearchResult): string {
  const mSnap = String(r.snapshot_path || '').match(/\/snapshots\/rtp\/gb_([^/]+)\//)
  if (mSnap) return mSnap[1]
  const mId = String(r.id || '').match(/^det_([^_]+)_/)
  return mId ? mId[1] : ''
}

async function playSmartResult(r: SmartSearchResult) {
  smartDrawerVisible.value = false
  // [FIX rec-fuse2 a] ts 兼容 int 毫秒 / 数字字符串 / ISO
  const ts = smartTsMs(r.timestamp)
  // ① 切源 + 反查通道: 真实通道优先 (hash channel_id 不可用于录像查询)
  recordingSource.value = 'device'
  let changed = false
  const realCh = extractRealChannel(r)
  const target = realCh || String(r.channel_id || '')
  if (target && target !== selectedChannelId.value) {
    const allCh = devices.value.flatMap(d => (d.channels || []).map(c => ({ d, c })))
    const tail = target.length >= 10 ? target.slice(-10) : target
    const hitCh = allCh.find(({ c }) => String(c.id) === target)
      || allCh.find(({ c }) => String(c.id).replace(/_ch\d+$/, '') === target)
      || allCh.find(({ c }) => String(c.id).replace(/_ch\d+$/, '').slice(-10) === tail)
    if (hitCh) {
      if (hitCh.d.id !== selectedDeviceId.value) {
        selectedDeviceId.value = hitCh.d.id
        await nextTick()
      }
      if (selectedChannelId.value !== hitCh.c.id) {
        selectedChannelId.value = hitCh.c.id
        changed = true
      }
    } else if (realCh) {
      // 树内未命中但提取到真实通道 → 直接使用 (后端已兼容裸码), 不投毒 hash
      selectedChannelId.value = realCh
      changed = true
    }
    // 既无真实通道又未命中树 → 保留当前选择, 仅走时间跳转 + recording_id 兜底
  }
  if (!isNaN(ts)) {
    // ② 日期同步 (toLocalISOString 本地时区, 与录像条目标签同基准)
    const wantDate = toLocalISOString(new Date(ts)).split('T')[0]
    if (selectedDate.value !== wantDate) {
      selectedDate.value = wantDate
      changed = true
    }
    // 通道/设备/日期任一变化都需强制重查, 避免用旧通道的残留列表做覆盖段匹配
    if (changed || !recordings.value.length) {
      await fetchRecordings()
    }
    // 覆盖段匹配 (含 +5s 容差, 同 doTimeSeek 口径)
    const segs = recordings.value
      .map(x => ({ r: x, s: Date.parse(x.startTime || ''), e: Date.parse(x.endTime || '') }))
      .filter(x => !isNaN(x.s))
      .sort((a, b) => a.s - b.s)
    const hitSeg = segs.find(x => x.s <= ts && ts <= x.e + 5000)
    if (hitSeg) {
      await playSegment(hitSeg.r, { startAtMs: ts })
      ElMessage.success(`已跳转到检测时刻 ${new Date(ts).toLocaleTimeString('zh-CN')}`)
      return
    }
  }
  // ③ 兜底: 原 recording_id→/local/{id}/play 链路 (无设备录像覆盖时独立播放)
  if (r.recording_id) {
    await playLocalRecordingById(r.recording_id)
    return
  }
  ElMessage.warning('该时刻附近无录像记录')
}

function formatConfidence(v: number): string {
  return (v * 100).toFixed(1) + '%'
}

/** [FIX rec-fuse2] 「检测时间」列: 后端 timestamp 为 int 毫秒, 旧模板 .replace 对数字崩溃致列恒空 */
function fmtSmartTs(ts: unknown): string {
  const ms = smartTsMs(ts)
  if (isNaN(ms)) return ts === null || ts === undefined || ts === '' ? '-' : String(ts)
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** [FIX rec-fuse2] 「通道」列: 树内反查显示 设备/通道 名, 未命中显示真实国标码 (旧版显示告警库 hash) */
function fmtSmartChannel(r: SmartSearchResult): string {
  const ch = extractRealChannel(r) || String(r.channel_id || '')
  if (!ch) return '-'
  const hit = devices.value
    .flatMap(d => (d.channels || []).map(c => ({ d, c })))
    .find(({ c }) => String(c.id) === ch || String(c.id).replace(/_ch\d+$/, '') === ch)
  if (hit) return `${hit.d.name || hit.d.id} / ${hit.c.name || hit.c.id}`
  return ch
}

const router = useRouter()
const route = useRoute()

// [P2-CO3] 从告警弹窗自动跳转: 解析 route.query 中的 channelId/deviceId/time
// [FIX 2026-07-15] 重构: 自动选中设备/通道 -> 自动触发录像查询 -> 自动定位到告警时刻
const autoFetchTriggered = ref(false)
function applyAlarmJumpParams() {
  const q = route.query
  if (!q.channelId && !q.deviceId && !q.time && !q.alarmId) return

  const chId = String(q.channelId || '')
  const devId = String(q.deviceId || '')
  const t = String(q.time || '')

  // 1. 设置设备
  if (devId) selectedDeviceId.value = devId

  // 2. 尝试从 channelId 反查 deviceId (通过已知设备列表)
  if (chId) {
    let found = false
    for (const dev of devices.value) {
      const ch = (dev.channels || []).find((c: any) =>
        c.id === chId || (c as any).channel_id === chId || c.id === String(chId))
      if (ch) {
        selectedDeviceId.value = dev.id
        // nextTick 后设置 channelId (因为 watch(selectedDeviceId) 会清空 channelId)
        nextTick(() => {
          selectedChannelId.value = ch.id
        })
        found = true
        break
      }
    }
    if (!found) {
      pendingChannelId.value = chId
    }
  }

  // 3. 设置日期和跳转时间
  if (t) {
    const ms = isFinite(Number(t)) ? Number(t) : new Date(t).getTime()
    if (!isNaN(ms)) {
      pendingJumpMs.value = ms
      const d = new Date(ms)
      selectedDate.value = d.toISOString().split('T')[0]
      ElMessage.info(`已定位到告警时刻: ${d.toLocaleString('zh-CN')}`)
    }
  }
}

// [FIX 2026-07-15] 自动触发录像查询 (设备/通道/日期均就绪后)
async function autoFetchRecordingsIfNeeded() {
  if (autoFetchTriggered.value) return
  if (!selectedDeviceId.value || !selectedChannelId.value || !selectedDate.value) return

  // 等待 watch(selectedDeviceId) 的清空效果被 nextTick 覆盖
  await nextTick()
  if (!selectedChannelId.value) return

  autoFetchTriggered.value = true
  ElMessage.info('正在自动查询告警时间段的录像...')
  await fetchRecordings()
  // 如果有跳转时间，等录像加载后尝试定位
  if (pendingJumpMs.value) {
    await nextTick()
    // 自动播放包含告警时间的录像段
    const alarmMs = pendingJumpMs.value
    const alarmDate = new Date(alarmMs)
    const alarmStr = alarmDate.toTimeString().substring(0, 8)
    // [T5-P5 2026-09-06] 告警详情「回放页」跳转带 recordingId: 优先精确命中
    //   该录像段; 时间区间匹配仅是兜底 (跨段边界时刻可能选中相邻段)。
    //   空字符串时恒 false 走兜底, 无副作用。
    const wantedRecId = String(route.query.recordingId || '')
    const matching = (wantedRecId && recordings.value.find(r => String(r.id) === wantedRecId)) ||
      recordings.value.find(r => {
      const s = r.startTime?.split('T')[1]?.substring(0, 8) || ''
      const e = r.endTime?.split('T')[1]?.substring(0, 8) || ''
      return s <= alarmStr && e >= alarmStr
    })
    if (matching) {
      ElMessage.success('已找到包含告警时刻的录像，正在播放...')
      await playSegment(matching)
      // 播放后跳转到精确时间
      if (pendingJumpMs.value) {
        setTimeout(() => jumpToTime(pendingJumpMs.value), 1500)
      }
    } else {
      ElMessage.warning('告警时刻附近无录像记录')
    }
  }
}

const pendingChannelId = ref('')
const pendingJumpMs = ref(0)

// 跳转到指定时刻: [FIX rec-jump 2026-09-11] 原按「当天 0 点秒数」设 currentTime,
//   对分段文件 (段 14:00 开始, 时长 1h) 必越界 → 定位失效。改为:
//   ① 有 currentSegmentStartMs 基准时换算「段内 offset 秒」并 clamp 到时长内;
//   ② MP4 src 刚设置时元数据未就绪, 直接设 currentTime 会丢 → 等 loadedmetadata
//     (2.5s 超时兜底), 保障「按时间点观看」5 秒内生效。
async function jumpToTime(ms: number) {
  if (!ms) return
  // 等待录像加载完成
  if (!playingUrl.value) {
    ElMessage.warning('请先加载录像后再跳转')
    return
  }
  const video = videoRef.value
  if (!video) return
  const d = new Date(ms)
  let seconds: number
  if (currentSegmentStartMs.value > 0) {
    seconds = (ms - currentSegmentStartMs.value) / 1000
    if (seconds < 0) seconds = 0
    if (duration.value > 0 && seconds > duration.value) seconds = Math.max(0, duration.value - 1)
  } else {
    // 兜底: 无段起点基准 (历史链路), 保持当天秒数
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime()
    seconds = (ms - dayStart) / 1000
  }
  // 元数据就绪等待 (MP4 Range seek 依赖 duration 已知)
  if (video.readyState < 1) {
    await new Promise<void>((resolve) => {
      const onReady = () => { video.removeEventListener('loadedmetadata', onReady); resolve() }
      video.addEventListener('loadedmetadata', onReady)
      setTimeout(onReady, 2500)
    })
  }
  try {
    video.currentTime = Math.max(0, seconds)
    video.play().catch(() => {})
    ElMessage.success(`已跳转到 ${d.toLocaleTimeString('zh-CN')}`)
  } catch (e: any) {
    ElMessage.error('跳转失败: ' + (e?.message || ''))
  }
}

// ---- Task #23: 离线检测 ----
async function checkBackendOnline() {
  try {
    await axios.get('/api/v1/health', { timeout: 5000 })
    if (isOffline.value) {
      isOffline.value = false
      ElMessage.success('后端已恢复连接')
    }
  } catch {
    if (!isOffline.value) {
      isOffline.value = true
      ElMessage.warning('后端连接断开，已自动切换到本地录像模式')
      recordingSource.value = 'local'
    }
  }
}

function startOfflineCheck() {
  if (offlineCheckTimer) return
  offlineCheckTimer = setInterval(checkBackendOnline, 30000) // 每 30 秒检测
}

function stopOfflineCheck() {
  if (offlineCheckTimer) {
    clearInterval(offlineCheckTimer)
    offlineCheckTimer = null
  }
}

// [REC-SCHEDULE 2026-09-11] 计划管理函数已迁出 → SettingsView (fetchSchedules/openScheduleDialog/saveSchedule/toggleScheduleEnabled/removeSchedule)

// ---- [P0-2] 水印配置 ----
async function openWatermarkDialog() {
  if (!selectedChannelId.value) {
    ElMessage.warning('请先选择通道')
    return
  }
  watermarkLoading.value = true
  watermarkDialogVisible.value = true
  try {
    watermarkConfig.value = await getWatermark(selectedChannelId.value)
  } catch {
    watermarkConfig.value = {
      channel_id: selectedChannelId.value,
      enabled: false,
      show_timestamp: true,
      show_channel_name: true,
      custom_text: '',
      position: 'top_left',
      font_size: 16,
      color: '#FFFFFF',
      bg_color: '#00000080',
    }
  } finally {
    watermarkLoading.value = false
  }
}

async function saveWatermark() {
  if (!watermarkConfig.value || !selectedChannelId.value) return
  try {
    await updateWatermark(selectedChannelId.value, watermarkConfig.value)
    ElMessage.success('水印配置已保存')
    watermarkDialogVisible.value = false
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.message || ''))
  }
}

// ---- [P1-2] 片段下载 ----
async function doSegmentDownload() {
  if (!selectedDeviceId.value || !segStartTime.value || !segEndTime.value) {
    ElMessage.warning('请填写完整的时间范围')
    return
  }
  try {
    await downloadSegmentApi({
      device_id: selectedDeviceId.value,
      channel_id: selectedChannelId.value,
      start_time: segStartTime.value,
      end_time: segEndTime.value,
    })
    ElMessage.success('下载请求已发送')
    segmentDownloadVisible.value = false
  } catch (e: any) {
    ElMessage.error('下载失败: ' + (e.message || ''))
  }
}

// ---- [REC-TSEEK 2026-09-11] 按时间点观看 ----
// 行业通用回放交互: 选日期 + HH:mm:ss → 定位到该时刻播放。
// 链路: 同步日期 → queryRecordings (fetchRecordings) → 覆盖段匹配 →
//   playSegment(seg, {startAtMs}) → ZLM: MP4 Range seek / GB28181: 设备从目标时刻起推流。
function openTimeSeek() {
  if (!selectedDeviceId.value || !selectedChannelId.value) {
    ElMessage.warning('请先选择设备和通道')
    return
  }
  timeSeekDate.value = selectedDate.value
  timeSeekVisible.value = true
}

async function doTimeSeek() {
  if (!selectedDeviceId.value || !selectedChannelId.value) {
    ElMessage.warning('请先选择设备和通道')
    return
  }
  if (!timeSeekDate.value || !timeSeekTime.value) {
    ElMessage.warning('请选择日期和时间点')
    return
  }
  timeSeekLoading.value = true
  try {
    // 1. 目标日期与列表日期不同步时先刷新录像列表 (fetchRecordings 按 selectedDate 查询)
    if (selectedDate.value !== timeSeekDate.value) {
      selectedDate.value = timeSeekDate.value
      await fetchRecordings()
    } else if (!recordings.value.length) {
      await fetchRecordings()
    }
    // 2. 目标时刻 ms (本地时区, 与录像条目 ISO 同基准)
    const targetMs = new Date(`${timeSeekDate.value}T${timeSeekTime.value}`).getTime()
    if (isNaN(targetMs)) {
      ElMessage.error('时间格式无效')
      return
    }
    // 3. 找覆盖段 (end 容差 +5s); 无覆盖取目标前最近段 (MP4 可任意 Range seek, 仍能精准定位)
    const segs = recordings.value
      .map(r => ({ r, s: Date.parse(r.startTime || ''), e: Date.parse(r.endTime || '') }))
      .filter(x => !isNaN(x.s))
      .sort((a, b) => a.s - b.s)
    let hit = segs.find(x => x.s <= targetMs && targetMs <= x.e + 5000)
    if (!hit && segs.length) {
      const before = segs.filter(x => x.s <= targetMs)
      hit = before.length ? before[before.length - 1] : segs[0]
      ElMessage.info('无精确覆盖段，已定位到最近录像段')
    }
    if (!hit) {
      ElMessage.warning('该时间段无录像记录')
      return
    }
    // 4. 播放 + 精确定位 (ZLM: loadedmetadata 后 Range seek; GB28181: 设备从目标时刻开播)
    await playSegment(hit.r, { startAtMs: targetMs })
    timeSeekVisible.value = false
  } catch (e: any) {
    ElMessage.error('时间点定位失败: ' + (e?.message || ''))
  } finally {
    timeSeekLoading.value = false
  }
}

// [REC-STORAGE 2026-09-11] 存储预估已迁出 → SettingsView「存储预估」Tab (calculateStorage/estParams)

onMounted(() => {
  fetchDevices()
  fetchSmartFilterOptions()
  startOfflineCheck()
  loadRecAreaTree()  // [UI 2026-09-11] 区域树与设备主链解耦加载
  // [V4-X4 2026-07-08] 注册全局快捷键 + 全屏状态监听
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
  // [FIX 2026-07-15] 从告警自动跳转: 在设备加载后应用路由参数, 并自动触发录像查询
  watch(devices, async () => {
    if (route.query.channelId || route.query.deviceId || route.query.time || route.query.alarmId) {
      applyAlarmJumpParams()
      // 等待设备/通道选中完成后触发自动查询
      await nextTick()
      await autoFetchRecordingsIfNeeded()
    }
  }, { immediate: true })

  // [FIX 2026-07-15] 监听 channelId 变化, 处理 nextTick 延迟设置的情况
  watch(selectedChannelId, async (newVal) => {
    if (newVal && !autoFetchTriggered.value && route.query.time) {
      await nextTick()
      await autoFetchRecordingsIfNeeded()
    }
  })
})
onUnmounted(() => {
  stopPlay()
  stopOfflineCheck()
  // [V4-X4 2026-07-08] 注销快捷键 + 全屏监听 (避免内存泄漏)
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
})
</script>

<template>
  <div class="recording-view">
    <div style="display:flex;gap:16px;height:calc(100vh - 120px)">
      <!-- 左侧: 设备通道树 + 录像查询面板 (设计图左侧栏布局) -->
      <div class="rec-left-col">
        <el-card shadow="never" class="rec-tree-card">
          <template #header>设备通道</template>
          <!-- [UI 2026-09-11] 通道目录树 (区域→设备→通道, 与视频预览 LiveView 同款) -->
          <el-input
            v-model="recTreeFilter"
            placeholder="筛选设备/通道..."
            size="small"
            clearable
            style="margin-bottom:8px"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-scrollbar class="rec-tree-scroll">
            <el-tree
              ref="recTreeRef"
              :data="recTreeData"
              node-key="key"
              :props="{ label: 'label', children: 'children' }"
              default-expand-all
              :expand-on-click-node="false"
              :filter-node-method="filterRecTreeNode"
              highlight-current
              empty-text="暂无区域/设备/通道"
              class="rec-tree"
              @node-click="onRecNodeClick"
            >
              <template #default="{ data }">
                <div class="rt-node" :class="['rt-' + data.type]">
                  <span class="rt-label" :title="data.label">{{ data.label }}</span>
                  <span v-if="data.type === 'device'" class="rt-badge">{{ recDevChannelCount(data) }}</span>
                </div>
              </template>
            </el-tree>
          </el-scrollbar>
        </el-card>

        <!-- 查询面板 (设计图: 已选择/全部录像/中心储存/起止时间/查询/录像下载) -->
        <el-card shadow="never" class="rec-query-card">
          <template #header>录像查询</template>
          <div class="qp-selected">
            <div class="qp-label">已选择</div>
            <div class="qp-value" :title="qpDeviceLabel">{{ qpDeviceLabel }}</div>
            <div class="qp-sub" :title="qpChannelLabel">{{ qpChannelLabel }}</div>
          </div>
          <el-radio-group v-model="recordingSource" size="small" class="qp-block">
            <el-radio-button value="device">设备录像</el-radio-button>
            <el-radio-button value="local">本地录像</el-radio-button>
          </el-radio-group>
          <el-select v-model="recordTypeFilter" size="small" class="qp-block">
            <el-option label="全部录像" value="all" />
            <el-option label="中心储存" value="zlm" />
            <el-option label="设备存储" value="gb28181" />
          </el-select>
          <el-date-picker v-model="selectedDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" size="small" class="qp-block" />
          <el-button type="primary" class="qp-block-btn" :loading="loading || localLoading" @click="onQueryClick">查询</el-button>
          <el-button class="qp-block-btn" :disabled="recordingSource !== 'device' || !filteredRecordings.length" @click="batchDownload">录像下载</el-button>
          <div class="qp-links">
            <el-link type="primary" :underline="false" @click="openTimeSeek">按时间点观看</el-link>
            <el-link type="primary" :underline="false" @click="segmentDownloadVisible = true">片段下载</el-link>
            <el-link type="primary" :underline="false" @click="openWatermarkDialog">水印设置</el-link>
            <el-link type="primary" :underline="false" @click="smartDrawerVisible = true">AI 智能检索</el-link>
          </div>
          <el-tag v-if="isOffline" type="warning" size="small" style="margin-top:8px">离线模式</el-tag>
        </el-card>
      </div>

      <!-- 主区: 回放播放器 + 时间轴 + 控制条 + 片段列表 (设计图中部/底部布局) -->
      <div style="flex:1;display:flex;flex-direction:column;gap:12px;min-width:0">
        <!-- 播放器 (常驻: 未播放时显示空态提示) -->
        <el-card shadow="never" class="player-card">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:8px">
                <span>{{ recordingSource === 'local' ? '本地回放' : '设备回放' }}</span>
                <el-tag v-if="recordingSource === 'device' && recordTypeFilter === 'zlm'" size="small" type="success">中心储存</el-tag>
                <el-tag v-else-if="recordingSource === 'device' && recordTypeFilter === 'gb28181'" size="small">设备存储</el-tag>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <el-select v-if="recordingSource === 'device'" v-model="playbackFormat" size="small" style="width:110px">
                  <el-option v-for="f in FORMAT_OPTIONS" :key="f.value" :label="f.label" :value="f.value" />
                </el-select>
                <el-button size="small" :icon="Search" @click="smartDrawerVisible = true">AI 智能检索</el-button>
              </div>
            </div>
          </template>
          <!-- [V4-X4] 全屏容器 + 进度条 + 时间轴 + 控制条 -->
          <div ref="videoContainerRef" class="video-container">
            <video
              ref="videoRef"
              autoplay muted playsinline
              class="player-video"
              @loadedmetadata="onLoadedMetadata"
              @timeupdate="onTimeUpdate"
              @ended="stopPlay"
            />
            <div v-if="!isPlaying" class="player-empty">
              <div>请选择左侧通道并点击「查询」</div>
              <div style="font-size:12px;margin-top:4px">点击片段列表或时间轴上的蓝色录像块开始回放</div>
            </div>
            <!-- 进度条 + 时间显示 -->
            <div class="player-progress-row">
              <span class="player-time">{{ formatHMS(currentTime) }}</span>
              <el-slider
                class="player-progress-slider"
                :model-value="isSeeking ? seekValue : currentTime"
                :max="duration || 0"
                :step="1"
                :show-tooltip="false"
                @change="onSeekChange"
                @input="onSeekChange"
                @start="onSeekStart"
                @end="onSeekEnd"
              />
              <span class="player-time">{{ formatHMS(duration) }}</span>
            </div>
            <!-- 24小时时间轴 (设计图: 播放器底部; 蓝色块=录像段, 可点击选段) -->
            <canvas v-if="recordingSource === 'device'" ref="canvasRef" class="player-timeline" @click="handleTimelineClick" />
            <!-- 控制条 (设计图: 上一段/播放暂停/下一段 + 回放钟 + 倍速 + 停止/全屏) -->
            <div class="player-controls">
              <div class="pc-group">
                <el-button size="small" :icon="DArrowLeft" text :disabled="!filteredRecordings.length" title="上一段" @click="playPrevSegment" />
                <el-button size="small" :icon="isPaused ? VideoPlay : VideoPause" type="primary" circle :disabled="!isPlaying" title="暂停/恢复" @click="togglePause" />
                <el-button size="small" :icon="DArrowRight" text :disabled="!filteredRecordings.length" title="下一段" @click="playNextSegment" />
              </div>
              <div class="pc-clock" title="回放钟 (段起点+进度)">{{ playbackClockLabel }}</div>
              <div class="pc-group">
                <el-button-group size="small" class="speed-btn-group">
                  <el-button v-for="spd in [0.5, 1, 2, 4, 8, 16]" :key="spd"
                    :type="playbackSpeed === spd ? 'primary' : 'default'"
                    @click="changeSpeed(spd)">
                    {{ spd }}x
                  </el-button>
                </el-button-group>
              </div>
              <div class="pc-group">
                <el-button size="small" :disabled="!isPlaying" @click="stopPlay">停止</el-button>
                <el-button size="small" :icon="FullScreen" @click="toggleFullscreen">{{ isFullscreen ? '退出全屏' : '全屏' }}</el-button>
              </div>
            </div>
          </div>
          <!-- 快捷键提示 -->
          <div class="player-hint">
            💡 快捷键: <kbd>空格</kbd> 暂停/播放 · <kbd>←/→</kbd> 快退/快进 5s · <kbd>Shift+←/→</kbd> 30s
          </div>
        </el-card>

        <!-- 片段列表 (设计图时间轴录像块明细; 紧凑行卡片替代 6 列表格) -->
        <el-card v-if="recordingSource === 'device'" shadow="never" class="seg-list-card">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span>录像片段 ({{ filteredRecordings.length }})</span>
              <el-button size="small" type="primary" plain :disabled="!filteredRecordings.length" @click="batchDownload">批量下载</el-button>
            </div>
          </template>
          <el-scrollbar class="seg-scroll">
            <div
              v-for="rec in filteredRecordings"
              :key="rec.id"
              class="seg-row"
              :class="{ active: rec.id === currentRecId }"
              @click="playSegment(rec)"
            >
              <span class="seg-range">{{ segRangeLabel(rec) }}</span>
              <span class="seg-meta">{{ formatDuration(rec.duration) }}</span>
              <span class="seg-meta">{{ formatSize(rec.fileSize) }}</span>
              <span class="seg-tag" :class="rec.source === 'zlm' ? 'seg-tag-center' : 'seg-tag-device'">
                {{ rec.source === 'zlm' ? '中心储存' : '设备存储' }}
              </span>
              <span class="seg-actions" @click.stop>
                <el-button size="small" type="primary" @click="playSegment(rec)">播放</el-button>
                <el-button size="small" @click="downloadSegment(rec)">下载</el-button>
              </span>
            </div>
            <el-empty v-if="!filteredRecordings.length && !loading" description="暂无录像片段" :image-size="60" />
          </el-scrollbar>
        </el-card>

        <!-- 本地录像片段列表 -->
        <el-card v-if="recordingSource === 'local'" shadow="never" style="flex:1;overflow:auto">
          <template #header>本地录像 ({{ localRecordings.length }})</template>
          <el-table :data="localRecordings" v-loading="localLoading" stripe size="small">
            <el-table-column label="通道" width="120">
              <template #default="{ row }">{{ row.channel_id }}</template>
            </el-table-column>
            <el-table-column label="开始时间" width="160">
              <template #default="{ row }">{{ row.start_time?.replace('T', ' ')?.substring(0, 19) || row.start_time }}</template>
            </el-table-column>
            <el-table-column label="时长" width="100">
              <template #default="{ row }">{{ formatDuration(row.duration_seconds) }}</template>
            </el-table-column>
            <el-table-column label="大小" width="100">
              <template #default="{ row }">{{ formatSize(row.file_size_bytes) }}</template>
            </el-table-column>
            <el-table-column label="编码" width="80">
              <template #default="{ row }">{{ row.codec }}</template>
            </el-table-column>
            <el-table-column label="分辨率" width="100">
              <template #default="{ row }">{{ row.width }}x{{ row.height }}</template>
            </el-table-column>
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="playLocalRecording(row)">播放</el-button>
                <el-button type="danger" size="small" @click="deleteLocalRecording(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- [REC-FUSE 2026-09-11] 智能检索面板已迁入右侧抽屉 (左栏/播放器卡头部「AI 智能检索」按钮打开);
             录像计划与存储预估已整体迁出 → SettingsView 对应 Tab (计划 CRUD 复用 api/recording.ts 既有 4 个 API) -->

        <!-- [REC-STORAGE 2026-09-11] 存储预估已迁出 → SettingsView「存储预估」Tab -->
        <!-- [REC-UI 2026-09-11] 旧版独立播放器卡已移除: 播放器改为上方常驻卡片 (v-if="isPlaying" 不再需要) -->
      </div>
    </div>

    <!-- [REC-SCHEDULE 2026-09-11] 录像计划编辑弹窗已迁出 → SettingsView「录像计划」Tab -->

    <!-- [P0-2] 水印配置弹窗 -->
    <el-dialog v-model="watermarkDialogVisible" title="录像水印配置" width="480px">
      <el-form v-if="watermarkConfig" label-width="100px" v-loading="watermarkLoading">
        <el-form-item label="启用水印">
          <el-switch v-model="watermarkConfig.enabled" />
        </el-form-item>
        <el-form-item label="显示时间戳">
          <el-switch v-model="watermarkConfig.show_timestamp" />
        </el-form-item>
        <el-form-item label="显示通道名">
          <el-switch v-model="watermarkConfig.show_channel_name" />
        </el-form-item>
        <el-form-item label="自定义文字">
          <el-input v-model="watermarkConfig.custom_text" placeholder="如: 华盾智能安防" />
        </el-form-item>
        <el-form-item label="位置">
          <el-select v-model="watermarkConfig.position" style="width:160px">
            <el-option label="左上" value="top_left" />
            <el-option label="右上" value="top_right" />
            <el-option label="左下" value="bottom_left" />
            <el-option label="右下" value="bottom_right" />
          </el-select>
        </el-form-item>
        <el-form-item label="字号">
          <el-input-number v-model="watermarkConfig.font_size" :min="10" :max="48" />
        </el-form-item>
        <el-form-item label="文字颜色">
          <el-color-picker v-model="watermarkConfig.color" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="watermarkDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveWatermark">保存</el-button>
      </template>
    </el-dialog>

    <!-- [P1-2] 片段下载弹窗 -->
    <el-dialog v-model="segmentDownloadVisible" title="按时间范围下载录像片段" width="460px">
      <el-form label-width="100px">
        <el-form-item label="设备">
          <el-input :model-value="selectedDeviceId" disabled />
        </el-form-item>
        <el-form-item label="通道">
          <el-input :model-value="selectedChannelId" disabled />
        </el-form-item>
        <el-form-item label="开始时间">
          <el-date-picker v-model="segStartTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="选择开始时间" style="width:100%" />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-date-picker v-model="segEndTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="选择结束时间" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="segmentDownloadVisible = false">取消</el-button>
        <el-button type="primary" @click="doSegmentDownload">下载片段</el-button>
      </template>
    </el-dialog>

    <!-- [REC-TSEEK 2026-09-11] 按时间点观看弹窗 (与片段下载同级) -->
    <el-dialog v-model="timeSeekVisible" title="按时间点观看" width="420px">
      <el-form label-width="90px">
        <el-form-item label="设备">
          <el-input :model-value="selectedDeviceId" disabled />
        </el-form-item>
        <el-form-item label="通道">
          <el-input :model-value="selectedChannelId" disabled />
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="timeSeekDate" type="date" value-format="YYYY-MM-DD"
            placeholder="选择日期" style="width:100%" />
        </el-form-item>
        <el-form-item label="时间点">
          <el-time-picker v-model="timeSeekTime" value-format="HH:mm:ss" format="HH:mm:ss"
            placeholder="HH:mm:ss" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="timeSeekVisible = false">取消</el-button>
        <el-button type="primary" :loading="timeSeekLoading" @click="doTimeSeek">定位播放</el-button>
      </template>
    </el-dialog>

    <!-- [REC-FUSE 2026-09-11] AI 智能检索常驻抽屉 (原 Tab 面板迁入; 结果一键「跳转到该时刻回放」复用 playSmartResult 融合链路) -->
    <el-drawer v-model="smartDrawerVisible" title="AI 智能检索" :size="720" direction="rtl">
      <div class="smart-drawer-body">
        <div class="smart-search-form">
          <div class="smart-form-row">
            <span class="smart-label">告警类型:</span>
            <el-select v-model="smartQuery.alarm_type" placeholder="全部" clearable style="width:150px">
              <el-option v-for="t in smartAlarmTypes" :key="t" :label="t" :value="t" />
            </el-select>
            <span class="smart-label">目标类型:</span>
            <el-select v-model="smartQuery.target_type" placeholder="全部" clearable style="width:150px">
              <el-option v-for="t in smartTargetTypes" :key="t" :label="t" :value="t" />
            </el-select>
            <span class="smart-label">通道:</span>
            <el-select v-model="smartQuery.channel_id" placeholder="全部" clearable style="width:150px">
              <el-option v-for="ch in channels" :key="ch.id" :label="ch.name" :value="ch.id" />
            </el-select>
          </div>
          <div class="smart-form-row">
            <span class="smart-label">开始时间:</span>
            <el-date-picker v-model="smartQuery.start_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss"
              placeholder="开始时间" style="width:190px" />
            <span class="smart-label">结束时间:</span>
            <el-date-picker v-model="smartQuery.end_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss"
              placeholder="结束时间" style="width:190px" />
          </div>
          <div class="smart-form-row">
            <span class="smart-label">最低置信度: {{ Math.round(smartQuery.min_confidence * 100) }}%</span>
            <el-slider v-model="smartQuery.min_confidence" :min="0" :max="1" :step="0.01"
              style="width:200px;margin:0 16px" :format-tooltip="(v: number) => Math.round(v*100)+'%'" />
            <el-button type="primary" @click="doSmartSearch" :loading="smartLoading">开始检索</el-button>
          </div>
        </div>

        <!-- AI 检测时间分布 (24小时) -->
        <el-card v-if="smartResults.length" shadow="never" class="smart-dist-card">
          <template #header>AI 检测时间分布 (24小时)——红色为检测时间点</template>
          <canvas ref="smartCanvasRef" class="smart-dist-canvas" />
        </el-card>

        <!-- 检索结果 (一键跳转到该时刻回放) -->
        <el-card shadow="never" class="smart-result-card">
          <template #header>检索结果 ({{ smartTotal }})</template>
          <el-table :data="smartResults" v-loading="smartLoading" stripe size="small" empty-text="暂无检索结果，请设置条件后点击「开始检索」">
            <el-table-column label="检测时间" width="160">
              <template #default="{ row }">{{ fmtSmartTs(row.timestamp) }}</template>
            </el-table-column>
            <el-table-column label="通道" width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ fmtSmartChannel(row) }}</template>
            </el-table-column>
            <el-table-column label="告警类型" width="110">
              <template #default="{ row }">
                <el-tag type="danger" size="small">{{ row.alarm_type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="目标类型" width="90">
              <template #default="{ row }">{{ row.target_type }}</template>
            </el-table-column>
            <el-table-column label="置信度" width="80">
              <template #default="{ row }">
                <el-progress :percentage="Math.round(row.confidence * 100)" :status="row.confidence >= 0.8 ? 'success' : row.confidence >= 0.6 ? 'warning' : 'exception'" :stroke-width="8" />
              </template>
            </el-table-column>
            <el-table-column label="缩略图" width="70">
              <template #default="{ row }">
                <el-image v-if="row.snapshot_path" :src="row.snapshot_path" style="width:56px;height:36px;object-fit:cover;border-radius:3px" :preview-src-list="[row.snapshot_path]" />
                <span v-else style="color:#666;font-size:11px">无截图</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="playSmartResult(row)">跳转到该时刻回放</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="smartTotal > smartQuery.page_size" style="margin-top:12px;text-align:right">
            <el-pagination
              v-model:current-page="smartQuery.page"
              :page-size="smartQuery.page_size"
              :total="smartTotal"
              layout="prev, pager, next"
              @current-change="doSmartSearch"
            />
          </div>
        </el-card>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
/* .recording-view { padding: 20px; } */
.speed-btn-group .el-button { padding-left: 10px; padding-right: 10px; }

/* AI 智能检索表单 */
.smart-search-form { display: flex; flex-direction: column; gap: 12px; }
.smart-form-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.smart-label { font-size: 13px; color: #606266; white-space: nowrap; flex-shrink: 0; }

/* [V4-X4 2026-07-08] 播放器进度条与全屏 */
.video-container {
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}
.video-container:fullscreen,
.video-container:-webkit-full-screen {
  background: #000;
}
.video-container:fullscreen video,
.video-container:-webkit-full-screen video {
  max-height: 100vh !important;
  height: 100vh;
  width: 100%;
  object-fit: contain;
}
.player-progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.85);
}
.player-time {
  color: #fff;
  font-family: monospace;
  font-size: 12px;
  min-width: 60px;
  text-align: center;
  user-select: none;
}
.player-progress-slider {
  flex: 1;
  margin: 0 !important;
}
.player-progress-slider :deep(.el-slider__bar) {
  background-color: #00D4AA;
}
.player-progress-slider :deep(.el-slider__button) {
  border: 2px solid #00D4AA;
  background-color: #fff;
}
.player-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
  padding: 4px 8px;
}
.player-hint kbd {
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  font-family: monospace;
  color: #606266;
  background: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 3px;
  box-shadow: 0 1px 0 rgba(0,0,0,0.05);
  margin: 0 2px;
}

/* ── [REC-UI 2026-09-11] 设计图回放页: 左栏 / 查询面板 / 播放器卡 / 片段列表 / 检索抽屉 ── */
.rec-left-col { width: 270px; min-width: 250px; display: flex; flex-direction: column; gap: 12px; }
.rec-tree-card { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.rec-tree-card :deep(.el-card__body) { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.rec-tree-scroll { flex: 1; }

/* 查询面板 (设计图: 已选择/全部录像/中心储存/日期/查询/录像下载) */
.rec-query-card { flex-shrink: 0; }
.qp-selected { background: var(--el-fill-color-light); border-radius: 4px; padding: 8px 10px; margin-bottom: 10px; }
.qp-label { font-size: 12px; color: var(--el-text-color-secondary); }
.qp-value { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qp-sub { font-size: 12px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qp-block { width: 100%; margin-bottom: 10px; }
.qp-block :deep(.el-radio-button) { flex: 1; }
.qp-block :deep(.el-radio-button__inner) { width: 100%; }
.qp-block-btn { display: flex; width: 100%; margin-left: 0 !important; margin-bottom: 10px; }
.qp-links { display: flex; flex-wrap: wrap; gap: 6px 14px; }

/* 播放器卡 (设计图中部) */
.video-container { position: relative; }
.player-video { width: 100%; min-height: 220px; max-height: 360px; background: #000; display: block; }
.player-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: #999; font-size: 14px; background: rgba(0, 0, 0, 0.9); pointer-events: none; text-align: center;
}
.player-timeline { width: 100%; height: 40px; display: block; cursor: pointer; margin-top: 8px; }
.player-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; background: rgba(0, 0, 0, 0.85); }
.pc-group { display: flex; align-items: center; gap: 6px; }
.pc-clock { color: #00D4AA; font-family: monospace; font-size: 14px; user-select: none; white-space: nowrap; }

/* 片段列表 (设计图时间轴录像块明细紧凑行) */
.seg-list-card { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.seg-list-card :deep(.el-card__body) { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0; }
.seg-scroll { flex: 1; min-height: 120px; }
.seg-row { display: flex; align-items: center; gap: 12px; padding: 7px 12px; border-bottom: 1px solid var(--el-border-color-lighter); cursor: pointer; font-size: 12px; }
.seg-row:hover { background: var(--el-fill-color-light); }
.seg-row.active { background: var(--el-color-primary-light-9); box-shadow: inset 3px 0 0 var(--el-color-primary); }
.seg-range { flex: 1; font-family: monospace; color: var(--el-text-color-primary); }
.seg-meta { color: var(--el-text-color-secondary); width: 64px; text-align: right; }
.seg-tag { font-size: 11px; padding: 0 6px; border-radius: 3px; flex-shrink: 0; }
.seg-tag-center { color: #67c23a; background: rgba(103, 194, 58, 0.12); }
.seg-tag-device { color: #409eff; background: rgba(64, 158, 255, 0.12); }
.seg-actions { display: flex; gap: 6px; flex-shrink: 0; }

/* AI 智能检索抽屉 */
.smart-drawer-body { display: flex; flex-direction: column; gap: 12px; }
.smart-dist-canvas { width: 100%; height: 40px; display: block; }

/* ── [UI 2026-09-11] 通道目录树节点 (同 LiveView lt-node 视觉) ── */
.rt-node { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; padding-right: 4px; }
.rt-node.rt-ungrouped > .rt-label { color: var(--el-text-color-secondary); }
.rt-label {
  font-size: 12px; color: var(--el-text-color-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rt-badge {
  font-size: 10px; color: var(--el-text-color-secondary); background: var(--el-fill-color);
  padding: 0 6px; border-radius: 8px; flex-shrink: 0; line-height: 16px;
}
.rec-tree :deep(.el-tree-node__content) { height: 26px; }
</style>
