<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { deviceHttp, recordingHttp } from '@/api/http'
import { getRecordings, playRecording, stopPlayback as stopRecordingPlayback, controlPlayback, type RecordingSegment as ApiRecordingSeg } from '@/api/recording'
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
const canvasRef = ref<HTMLCanvasElement>()
let playerInstance: Hls | flvjs.Player | null = null

// Task #23: 本地录像 / 离线回放
const recordingSource = ref<'device' | 'local' | 'smart'>('device')
const localRecordings = ref<LocalRecording[]>([])
const localLoading = ref(false)
const isOffline = ref(false)
let offlineCheckTimer: ReturnType<typeof setInterval> | null = null

type PlaybackFormat = 'flv' | 'ws-flv' | 'hls'
const FORMAT_OPTIONS: { value: PlaybackFormat; label: string }[] = [
  { value: 'flv', label: 'HTTP-FLV' },
  { value: 'ws-flv', label: 'WS-FLV' },
  { value: 'hls', label: 'HLS' },
]
const playbackFormat = ref<PlaybackFormat>('flv')

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
    const list = data?.data || data || []
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
}

function handleTimelineClick(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const pct = x / rect.width
  const hours = pct * 24
  const h = Math.floor(hours)
  const m = Math.floor((hours - h) * 60)
  ElMessage.info(`点击时间: ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
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

onMounted(() => {
  fetchDevices()
  fetchSmartFilterOptions()
  startOfflineCheck()
})
onUnmounted(() => {
  stopPlay()
  stopOfflineCheck()
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
            </el-radio-group>
            <el-tag v-if="isOffline" type="warning" size="small" style="margin-left:4px">离线模式</el-tag>
            <span>日期:</span>
            <el-date-picker v-model="selectedDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
            <el-button v-if="recordingSource === 'device'" type="primary" @click="fetchRecordings" :loading="loading">查询设备录像</el-button>
            <el-button v-else-if="recordingSource === 'local'" type="primary" @click="fetchLocalRecordings" :loading="localLoading">查询本地录像</el-button>
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
              <div style="display:flex;gap:8px">
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
              </div>
            </div>
          </template>
          <video ref="videoRef" autoplay muted playsinline style="width:100%;max-height:360px;background:#000" />
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recording-view { padding: 20px; }
.speed-btn-group .el-button { padding-left: 10px; padding-right: 10px; }

/* AI 智能检索表单 */
.smart-search-form { display: flex; flex-direction: column; gap: 12px; }
.smart-form-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.smart-label { font-size: 13px; color: #606266; white-space: nowrap; flex-shrink: 0; }
</style>
