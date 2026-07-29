<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { deviceHttp, recordingHttp } from '@/api/http'
import { alarmApi } from '@/api/alarm'  // [P3-VP1] 时间轴告警标记
import { getRecordings, playRecording, stopPlayback as stopRecordingPlayback, controlPlayback, type RecordingSegment as ApiRecordingSeg } from '@/api/recording'
import {
  getRecordingSchedules, createRecordingSchedule, updateRecordingSchedule, deleteRecordingSchedule,
  getWatermark, updateWatermark,
  downloadSegment as downloadSegmentApi,
  getStorageEstimate,
  type RecordingSchedule, type WatermarkConfig, type StorageEstimate,
} from '@/api/recording'
import Hls from 'hls.js'
import flvjs from 'flv.js'
import axios from 'axios'

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
const videoRef = ref<HTMLVideoElement>()
const videoContainerRef = ref<HTMLElement>()  // [V4-X4 2026-07-08] 全屏容器
const canvasRef = ref<HTMLCanvasElement>()
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
const recordingSource = ref<'device' | 'local' | 'smart' | 'schedule' | 'storage'>('device')
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

// [P0-1] 录像计划状态
const schedules = ref<RecordingSchedule[]>([])
const scheduleLoading = ref(false)
const scheduleDialogVisible = ref(false)
const editingSchedule = ref<RecordingSchedule | null>(null)
const defaultSchedule = (): RecordingSchedule => ({
  channel_id: '',
  schedule_name: '',
  schedule_type: 'time_segment',
  time_segments: [{ day: 7, start: '08:00', end: '18:00' }],
  stream_type: 'main',
  pre_record_seconds: 10,
  post_record_seconds: 60,
  enabled: true,
  // [P2-3] 节假日排除策略
  holiday_exclusion: {
    enabled: false,
    holiday_dates: [] as string[],  // ['2026-01-01', '2026-02-10', ...]
    holiday_name: '',               // 节假日名称
  },
})

// [P0-2] 水印配置状态
const watermarkDialogVisible = ref(false)
const watermarkConfig = ref<WatermarkConfig | null>(null)
const watermarkLoading = ref(false)

// [P1-2] 片段下载时间范围
const segmentDownloadVisible = ref(false)
const segStartTime = ref('')
const segEndTime = ref('')

// [P2-1] 存储预估状态
const storageEstimate = ref<StorageEstimate | null>(null)
const estParams = ref({ channel_count: 8, hours_per_day: 24, bitrate_kbps: 2048, retention_days: 30 })

const channels = computed(() => {
  const dev = devices.value.find(d => d.id === selectedDeviceId.value)
  return dev?.channels || []
})

watch(selectedDeviceId, () => {
  selectedChannelId.value = ''
  recordings.value = []
})

watch(selectedDate, () => { recordings.value = [] })

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
  } catch { /* 静默 */ }
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
    recordings.value = data?.data?.recordings || data?.data || []
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

async function playSegment(rec: RecordingSegment) {
  try {
    const { data } = await recordingHttp.post(`/${rec.id}/play`, {
      device_id: selectedDeviceId.value,
      channel_id: selectedChannelId.value,
      start_time: rec.startTime,
      end_time: rec.endTime,
    })
    const result = data?.data || data
    if (!result?.urls) {
      ElMessage.warning('未获取到播放地址，设备可能不支持回放')
      return
    }
    const urls = result.urls
    currentSessionId.value = result.call_id || ''

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

function downloadSegment(rec: RecordingSegment) {
  window.open(`/api/v1/recordings/${rec.id}/download`, '_blank')
}

async function togglePause() {
  if (!currentSessionId.value) return
  try {
    const action = isPaused.value ? 'resume' : 'pause'
    await recordingHttp.post(`/${currentSessionId.value}/control`, { action })
    isPaused.value = !isPaused.value
  } catch (e: any) {
    ElMessage.error('控制失败: ' + (e.message || ''))
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

function handleTimelineClick(e: MouseEvent) {
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
      // 跳转到告警时刻
      const d = new Date(ts)
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime()
      const secondsFromStart = (ts - dayStart) / 1000
      const video = videoRef.value
      if (video && playingUrl.value) {
        video.currentTime = Math.max(0, secondsFromStart)
        video.play().catch(() => {})
        ElMessage.success(`已跳转到告警: ${a.alarm_type} @ ${d.toLocaleTimeString('zh-CN')}`)
      } else {
        pendingJumpMs.value = ts
        ElMessage.info(`已记录跳转目标: ${d.toLocaleString('zh-CN')}，请先加载录像`)
      }
      return
    }
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
  try {
    // 获取播放 URL
    const { data } = await recordingHttp.get(`/local/${rec.id}/play`)
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
    currentSessionId.value = '' // 本地播放无后端 session
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
interface SmartSearchResult {
  id: number
  alarm_type: string
  target_type: string
  confidence: number
  timestamp: string
  channel_id: string
  device_id: string
  snapshot_path: string
  recording_id: number
  recording_start: string
  recording_end: string
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
    if (!r.timestamp) continue
    const t = new Date(r.timestamp)
    const pct = (t.getHours() + t.getMinutes() / 60 + t.getSeconds() / 3600) / 24
    const x = pct * W
    ctx.fillStyle = 'rgba(239,68,68,0.7)'
    ctx.fillRect(x - 2, 8, 4, H - 24)
  }
}

async function playSmartResult(r: SmartSearchResult) {
  if (!r.recording_id) {
    ElMessage.warning('此检测结果无关联录像')
    return
  }
  try {
    const { data } = await recordingHttp.get(`/local/${r.recording_id}/play`)
    const playUrl = data?.data?.play_url
    if (!playUrl) { ElMessage.warning('未获取到播放地址'); return }

    if (playerInstance) {
      if ('destroy' in playerInstance) playerInstance.destroy()
      playerInstance = null
    }
    isPlaying.value = true
    isPaused.value = false
    currentSessionId.value = ''
    await nextTick()

    const video = videoRef.value
    if (!video) return
    video.src = playUrl
    video.play().catch(() => {})
  } catch (e: any) {
    ElMessage.error('智能检索录像播放失败: ' + (e.message || ''))
  }
}

function formatConfidence(v: number): string {
  return (v * 100).toFixed(1) + '%'
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
    const matching = recordings.value.find(r => {
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

// 跳转到指定时刻: 修改播放 URL 后调用 video.currentTime
async function jumpToTime(ms: number) {
  if (!ms) return
  // 等待录像加载完成
  if (!playingUrl.value) {
    ElMessage.warning('请先加载录像后再跳转')
    return
  }
  const video = videoRef.value
  if (!video) return
  // 计算相对当天 0 点的秒数
  const d = new Date(ms)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime()
  const secondsFromStart = (ms - dayStart) / 1000
  // 加载当天对应时间段的录像
  // 简化: 如果播放已开始，直接设置 currentTime
  try {
    video.currentTime = Math.max(0, secondsFromStart)
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

// ---- [P0-1] 录像计划管理 ----
async function fetchSchedules() {
  scheduleLoading.value = true
  try {
    schedules.value = await getRecordingSchedules(selectedChannelId.value || undefined)
  } catch (e: any) {
    ElMessage.error('加载录像计划失败: ' + (e.message || ''))
  } finally {
    scheduleLoading.value = false
  }
}

function openScheduleDialog(schedule?: RecordingSchedule) {
  editingSchedule.value = schedule ? { ...schedule, time_segments: [...(schedule.time_segments || [])] } : defaultSchedule()
  if (!editingSchedule.value.channel_id && selectedChannelId.value) {
    editingSchedule.value.channel_id = selectedChannelId.value
  }
  if (!editingSchedule.value.device_id && selectedDeviceId.value) {
    editingSchedule.value.device_id = selectedDeviceId.value
  }
  scheduleDialogVisible.value = true
}

function addTimeSegment() {
  if (!editingSchedule.value) return
  editingSchedule.value.time_segments.push({ day: 7, start: '08:00', end: '18:00' })
}

function removeTimeSegment(idx: number) {
  if (!editingSchedule.value) return
  editingSchedule.value.time_segments.splice(idx, 1)
}

async function saveSchedule() {
  if (!editingSchedule.value) return
  if (!editingSchedule.value.channel_id) {
    ElMessage.warning('请选择通道')
    return
  }
  try {
    if (editingSchedule.value.id) {
      await updateRecordingSchedule(editingSchedule.value.id, editingSchedule.value)
      ElMessage.success('录像计划已更新')
    } else {
      await createRecordingSchedule(editingSchedule.value)
      ElMessage.success('录像计划已创建')
    }
    scheduleDialogVisible.value = false
    await fetchSchedules()
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.message || ''))
  }
}

async function toggleScheduleEnabled(schedule: RecordingSchedule) {
  if (!schedule.id) return
  try {
    await updateRecordingSchedule(schedule.id, { enabled: !schedule.enabled })
    schedule.enabled = !schedule.enabled
    ElMessage.success(`计划已${schedule.enabled ? '启用' : '禁用'}`)
  } catch (e: any) {
    ElMessage.error('操作失败: ' + (e.message || ''))
  }
}

async function removeSchedule(schedule: RecordingSchedule) {
  if (!schedule.id) return
  try {
    await deleteRecordingSchedule(schedule.id)
    ElMessage.success('删除成功')
    await fetchSchedules()
  } catch (e: any) {
    ElMessage.error('删除失败: ' + (e.message || ''))
  }
}

const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六', '每天']

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

// ---- [P2-1] 存储预估 ----
async function calculateStorage() {
  try {
    storageEstimate.value = await getStorageEstimate(estParams.value)
  } catch (e: any) {
    ElMessage.error('预估失败: ' + (e.message || ''))
  }
}

onMounted(() => {
  fetchDevices()
  fetchSmartFilterOptions()
  startOfflineCheck()
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
      <!-- 左侧: 设备通道树 -->
      <el-card shadow="never" style="width:260px;flex-shrink:0">
        <template #header>设备通道</template>
        <el-select v-model="selectedDeviceId" placeholder="选择设备" style="width:100%;margin-bottom:12px">
          <el-option v-for="d in devices" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <el-select v-model="selectedChannelId" placeholder="选择通道" style="width:100%">
          <el-option v-for="ch in channels" :key="ch.id" :label="ch.name" :value="ch.id" />
        </el-select>
      </el-card>

      <!-- 右侧 -->
      <div style="flex:1;display:flex;flex-direction:column;gap:16px">
        <!-- 录像源切换 + 日期选择 + 查询 -->
        <el-card shadow="never">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <el-radio-group v-model="recordingSource" size="small" style="margin-bottom:0">
              <el-radio-button value="device">设备录像</el-radio-button>
              <el-radio-button value="local">本地录像</el-radio-button>
              <el-radio-button value="smart">智能检索</el-radio-button>
              <el-radio-button value="schedule">录像计划</el-radio-button>
              <el-radio-button value="storage">存储预估</el-radio-button>
            </el-radio-group>
            <el-tag v-if="isOffline" type="warning" size="small" style="margin-left:4px">离线模式</el-tag>
            <span>日期:</span>
            <el-date-picker v-model="selectedDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
            <el-button v-if="recordingSource === 'device'" type="primary" @click="fetchRecordings" :loading="loading">查询设备录像</el-button>
            <el-button v-if="recordingSource === 'device'" size="small" @click="openWatermarkDialog">水印设置</el-button>
            <el-button v-if="recordingSource === 'device'" size="small" @click="segmentDownloadVisible = true">片段下载</el-button>
            <el-button v-if="recordingSource === 'schedule'" type="primary" @click="fetchSchedules" :loading="scheduleLoading">加载计划</el-button>
            <el-button v-if="recordingSource === 'schedule'" type="success" size="small" @click="openScheduleDialog()">+ 新增计划</el-button>
            <el-button v-if="recordingSource === 'storage'" type="primary" @click="calculateStorage">计算预估</el-button>
            <el-button v-if="recordingSource === 'local'" type="primary" @click="fetchLocalRecordings" :loading="localLoading">查询本地录像</el-button>
          </div>
        </el-card>

        <!-- 时间轴（仅设备录像模式） -->
        <el-card v-if="recordingSource === 'device'" shadow="never">
          <template #header>24小时时间轴</template>
          <canvas ref="canvasRef" style="width:100%;height:40px;cursor:pointer" @click="handleTimelineClick" />
        </el-card>

        <!-- 设备录像片段列表 -->
        <el-card v-if="recordingSource === 'device'" shadow="never" style="flex:1;overflow:auto">
          <template #header>录像片段 ({{ recordings.length }})</template>
          <el-table :data="recordings" v-loading="loading" stripe size="small">
            <el-table-column label="开始时间" width="100">
              <template #default="{ row }">{{ row.startTime?.split('T')[1]?.substring(0, 8) || row.startTime }}</template>
            </el-table-column>
            <el-table-column label="结束时间" width="100">
              <template #default="{ row }">{{ row.endTime?.split('T')[1]?.substring(0, 8) || row.endTime }}</template>
            </el-table-column>
            <el-table-column label="时长" width="120">
              <template #default="{ row }">{{ formatDuration(row.duration) }}</template>
            </el-table-column>
            <el-table-column label="大小" width="100">
              <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="playSegment(row)">播放</el-button>
                <el-button size="small" @click="downloadSegment(row)">下载</el-button>
              </template>
            </el-table-column>
          </el-table>
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

        <!-- AI 智能检索面板 -->
        <el-card v-if="recordingSource === 'smart'" shadow="never">
          <template #header>🧠 AI 智能检索条件</template>
          <div class="smart-search-form">
            <div class="smart-form-row">
              <span class="smart-label">告警类型:</span>
              <el-select v-model="smartQuery.alarm_type" placeholder="全部" clearable style="width:160px">
                <el-option v-for="t in smartAlarmTypes" :key="t" :label="t" :value="t" />
              </el-select>
              <span class="smart-label">目标类型:</span>
              <el-select v-model="smartQuery.target_type" placeholder="全部" clearable style="width:160px">
                <el-option v-for="t in smartTargetTypes" :key="t" :label="t" :value="t" />
              </el-select>
              <span class="smart-label">通道:</span>
              <el-select v-model="smartQuery.channel_id" placeholder="全部" clearable style="width:160px">
                <el-option v-for="ch in channels" :key="ch.id" :label="ch.name" :value="ch.id" />
              </el-select>
            </div>
            <div class="smart-form-row">
              <span class="smart-label">开始时间:</span>
              <el-date-picker v-model="smartQuery.start_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss"
                placeholder="开始时间" style="width:200px" />
              <span class="smart-label">结束时间:</span>
              <el-date-picker v-model="smartQuery.end_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss"
                placeholder="结束时间" style="width:200px" />
            </div>
            <div class="smart-form-row">
              <span class="smart-label">最低置信度: {{ Math.round(smartQuery.min_confidence * 100) }}%</span>
              <el-slider v-model="smartQuery.min_confidence" :min="0" :max="1" :step="0.01"
                style="width:240px;margin:0 16px" :format-tooltip="(v: number) => Math.round(v*100)+'%'" />
              <el-button type="primary" @click="doSmartSearch" :loading="smartLoading">🔍开始检索</el-button>
            </div>
          </div>
        </el-card>

        <!-- AI 检索时间轴 -->
        <el-card v-if="recordingSource === 'smart' && smartResults.length" shadow="never">
          <template #header>AI 检测时间分布 (24小时)——红色为检测时间点</template>
          <canvas ref="canvasRef" style="width:100%;height:40px" />
        </el-card>

        <!-- AI 检索结果列表 -->
        <el-card v-if="recordingSource === 'smart'" shadow="never" style="flex:1;overflow:auto">
          <template #header>检索结果 ({{ smartTotal }})</template>
          <el-table :data="smartResults" v-loading="smartLoading" stripe size="small" empty-text="暂无检索结果，请设置条件后点击「开始检索」">
            <el-table-column label="检测时间" width="160">
              <template #default="{ row }">{{ row.timestamp?.replace('T', ' ')?.substring(0, 19) || row.timestamp }}</template>
            </el-table-column>
            <el-table-column label="通道" width="120">
              <template #default="{ row }">{{ row.channel_id }}</template>
            </el-table-column>
            <el-table-column label="告警类型" width="120">
              <template #default="{ row }">
                <el-tag type="danger" size="small">{{ row.alarm_type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="目标类型" width="100">
              <template #default="{ row }">{{ row.target_type }}</template>
            </el-table-column>
            <el-table-column label="置信度" width="90">
              <template #default="{ row }">
                <el-progress :percentage="Math.round(row.confidence * 100)" :status="row.confidence >= 0.8 ? 'success' : row.confidence >= 0.6 ? 'warning' : 'exception'" :stroke-width="8" />
              </template>
            </el-table-column>
            <el-table-column label="缩略图" width="80">
              <template #default="{ row }">
                <el-image v-if="row.snapshot_path" :src="row.snapshot_path" style="width:60px;height:40px;object-fit:cover;border-radius:3px" :preview-src-list="[row.snapshot_path]" />
                <span v-else style="color:#666;font-size:11px">无截图</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="playSmartResult(row)" :disabled="!row.recording_id">播放关联录像</el-button>
              </template>
            </el-table-column>
          </el-table>
          <!-- 分页 -->
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

        <!-- [P0-1] 录像计划列表 -->
        <el-card v-if="recordingSource === 'schedule'" shadow="never" style="flex:1;overflow:auto">
          <template #header>录像计划 ({{ schedules.length }})
            <span style="font-size:12px;color:#909399;margin-left:8px">按通道/时段/事件触发自动启停录像</span>
          </template>
          <el-table :data="schedules" v-loading="scheduleLoading" stripe size="small" empty-text="暂无计划，点击「+ 新增计划」创建">
            <el-table-column label="计划名称" width="140">
              <template #default="{ row }">{{ row.schedule_name || `#${row.id}` }}</template>
            </el-table-column>
            <el-table-column label="通道" width="120">
              <template #default="{ row }">{{ row.channel_id }}</template>
            </el-table-column>
            <el-table-column label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.schedule_type === 'continuous' ? 'success' : row.schedule_type === 'event' ? 'danger' : 'primary'">
                  {{ row.schedule_type === 'continuous' ? '连续录像' : row.schedule_type === 'event' ? '事件触发' : '分时段' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间段" min-width="200">
              <template #default="{ row }">
                <span v-if="row.schedule_type === 'continuous'">24小时不间断</span>
                <span v-else-if="row.schedule_type === 'event'">触发类型: {{ row.event_types || '(未设置)' }}</span>
                <div v-else>
                  <el-tag v-for="(seg, i) in (row.time_segments || [])" :key="i" size="small" style="margin:2px">
                    {{ DAY_LABELS[seg.day] || `D${seg.day}` }} {{ seg.start }}-{{ seg.end }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="预录/延录" width="100">
              <template #default="{ row }">{{ row.pre_record_seconds }}s / {{ row.post_record_seconds }}s</template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-switch :model-value="row.enabled" @change="toggleScheduleEnabled(row)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130">
              <template #default="{ row }">
                <el-button size="small" @click="openScheduleDialog(row)">编辑</el-button>
                <el-button type="danger" size="small" @click="removeSchedule(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- [P2-1] 存储容量预估 -->
        <el-card v-if="recordingSource === 'storage'" shadow="never">
          <template #header>存储容量预估计算器</template>
          <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-start">
            <div style="display:flex;flex-direction:column;gap:16px">
              <div style="display:flex;align-items:center;gap:12px">
                <span style="width:100px">通道数量:</span>
                <el-input-number v-model="estParams.channel_count" :min="1" :max="256" />
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <span style="width:100px">每日录像时长:</span>
                <el-input-number v-model="estParams.hours_per_day" :min="1" :max="24" /> 小时
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <span style="width:100px">码率:</span>
                <el-input-number v-model="estParams.bitrate_kbps" :min="256" :max="16384" :step="512" /> kbps
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <span style="width:100px">保留天数:</span>
                <el-input-number v-model="estParams.retention_days" :min="1" :max="365" /> 天
              </div>
            </div>
            <div v-if="storageEstimate" class="storage-result">
              <div class="storage-row">
                <span class="storage-label">单通道/天</span>
                <span class="storage-value">{{ storageEstimate.gb_per_channel_per_day }} GB</span>
              </div>
              <div class="storage-row highlight">
                <span class="storage-label">总容量需求</span>
                <span class="storage-value">{{ storageEstimate.total_tb }} TB</span>
              </div>
              <div class="storage-row">
                <span class="storage-label">含20%冗余</span>
                <span class="storage-value">{{ storageEstimate.recommended_disk_tb }} TB</span>
              </div>
              <div class="storage-formula">
                公式: 码率 ÷ 8 × 3600 × 小时/天 × 通道数 × 天数
              </div>
            </div>
          </div>
        </el-card>

        <!-- 播放器 -->
        <el-card v-if="isPlaying" shadow="never">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:8px">
                <span>{{ recordingSource === 'local' ? '本地回放' : '回放播放' }}</span>
                <el-select v-if="recordingSource === 'device'" v-model="playbackFormat" size="small" style="width:110px">
                  <el-option v-for="f in FORMAT_OPTIONS" :key="f.value" :label="f.label" :value="f.value" />
                </el-select>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <el-button v-if="recordingSource === 'device'" size="small" @click="togglePause">
                  {{ isPaused ? '恢复' : '暂停' }}
                </el-button>
                <el-button-group size="small" class="speed-btn-group">
                  <el-button v-for="spd in [0.5, 1, 2, 4, 8, 16]" :key="spd"
                    :type="playbackSpeed === spd ? 'primary' : 'default'"
                    @click="changeSpeed(spd)">
                    {{ spd }}x
                  </el-button>
                </el-button-group>
                <el-button size="small" @click="stopPlay">停止</el-button>
                <!-- [V4-X4 2026-07-08] 全屏按钮 -->
                <el-button size="small" @click="toggleFullscreen">
                  {{ isFullscreen ? '退出全屏' : '全屏' }}
                </el-button>
              </div>
            </div>
          </template>
          <!-- [V4-X4 2026-07-08] 全屏容器 + 进度条 + 时间显示 -->
          <div ref="videoContainerRef" class="video-container">
            <video
              ref="videoRef"
              autoplay muted playsinline
              style="width:100%;max-height:360px;background:#000;display:block"
              @loadedmetadata="onLoadedMetadata"
              @timeupdate="onTimeUpdate"
              @ended="stopPlay"
            />
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
          </div>
          <!-- [V4-X4 2026-07-08] 快捷键提示 -->
          <div class="player-hint">
            💡 快捷键: <kbd>空格</kbd> 暂停/播放 · <kbd>←/→</kbd> 快退/快进 5s · <kbd>Shift+←/→</kbd> 30s
          </div>
        </el-card>
      </div>
    </div>

    <!-- [P0-1] 录像计划编辑弹窗 -->
    <el-dialog v-model="scheduleDialogVisible" :title="editingSchedule?.id ? '编辑录像计划' : '新增录像计划'" width="640px">
      <el-form v-if="editingSchedule" label-width="100px" size="default">
        <el-form-item label="计划名称">
          <el-input v-model="editingSchedule.schedule_name" placeholder="如: 工作日白天录像" />
        </el-form-item>
        <el-form-item label="通道">
          <el-input v-model="editingSchedule.channel_id" placeholder="通道ID" :disabled="!!editingSchedule.id" />
        </el-form-item>
        <el-form-item label="录像类型">
          <el-radio-group v-model="editingSchedule.schedule_type">
            <el-radio value="continuous">24小时连续</el-radio>
            <el-radio value="time_segment">分时段</el-radio>
            <el-radio value="event">事件触发</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="editingSchedule.schedule_type === 'event'" label="触发类型">
          <el-input v-model="editingSchedule.event_types" placeholder="如: fire_smoke,perimeter_intrusion" />
        </el-form-item>
        <el-form-item v-if="editingSchedule.schedule_type === 'time_segment'" label="时间段">
          <div v-for="(seg, i) in editingSchedule.time_segments" :key="i" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <el-select v-model="seg.day" style="width:80px">
              <el-option v-for="(label, di) in DAY_LABELS" :key="di" :label="label" :value="di" />
            </el-select>
            <el-time-picker v-model="seg.start" value-format="HH:mm" format="HH:mm" placeholder="开始" style="width:120px" />
            <span>—</span>
            <el-time-picker v-model="seg.end" value-format="HH:mm" format="HH:mm" placeholder="结束" style="width:120px" />
            <el-button type="danger" size="small" circle @click="removeTimeSegment(i)">−</el-button>
          </div>
          <el-button size="small" @click="addTimeSegment">+ 添加时段</el-button>
        </el-form-item>
        <el-form-item label="码流类型">
          <el-radio-group v-model="editingSchedule.stream_type">
            <el-radio value="main">主码流</el-radio>
            <el-radio value="sub">子码流</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="预录时间">
          <el-input-number v-model="editingSchedule.pre_record_seconds" :min="0" :max="300" /> 秒
        </el-form-item>
        <el-form-item label="延录时间">
          <el-input-number v-model="editingSchedule.post_record_seconds" :min="0" :max="600" /> 秒
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editingSchedule.enabled" />
        </el-form-item>
        <!-- [P2-3] 节假日排除策略 -->
        <el-form-item label="节假日排除">
          <el-switch v-model="editingSchedule.holiday_exclusion!.enabled" />
          <span style="margin-left:8px;color:#909399;font-size:12px">启用后指定日期不录像</span>
        </el-form-item>
        <el-form-item v-if="editingSchedule.holiday_exclusion?.enabled" label="排除日期">
          <el-input
            v-model="editingSchedule.holiday_exclusion.holiday_name"
            placeholder="节假日名称（如：春节）"
            style="margin-bottom:8px"
          />
          <el-select
            v-model="editingSchedule.holiday_exclusion.holiday_dates"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入日期 (YYYY-MM-DD)"
            style="width:100%"
          >
            <el-option label="元旦 01-01" value="2026-01-01" />
            <el-option label="春节 除夕" value="2026-02-09" />
            <el-option label="春节 初一" value="2026-02-10" />
            <el-option label="清明节" value="2026-04-04" />
            <el-option label="劳动节" value="2026-05-01" />
            <el-option label="端午节" value="2026-06-10" />
            <el-option label="中秋节" value="2026-09-17" />
            <el-option label="国庆节" value="2026-10-01" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scheduleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSchedule">保存</el-button>
      </template>
    </el-dialog>

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

/* [P2-1] 存储预估结果 */
.storage-result {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: linear-gradient(135deg, #e8f5e9, #f3e5f5);
  border-radius: 8px;
  min-width: 280px;
}
.storage-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}
.storage-row.highlight {
  font-size: 18px;
  font-weight: bold;
  color: #0066cc;
  border-top: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
  padding: 12px 0;
}
.storage-label { color: #606266; }
.storage-value { font-weight: bold; }
.storage-formula {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}
</style>
