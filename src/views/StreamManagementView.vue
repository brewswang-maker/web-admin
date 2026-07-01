<template>
  <div class="stream-page">
    <!-- 顶部统计卡片 -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" style="color:#1890ff">{{ stats.activeStreams }}</div>
          <div class="stat-label">活跃流数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" style="color:#52c41a">{{ stats.totalViewers }}</div>
          <div class="stat-label">总观看数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" style="color:#722ed1">{{ formatBitrate(stats.totalBitrate) }}</div>
          <div class="stat-label">总码率</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" :style="{ color: zlmOnline ? '#52c41a' : '#ff4d4f' }">
            {{ zlmOnline ? '在线' : '离线' }}
          </div>
          <div class="stat-label">ZLMediaKit 状态</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 推理需求状态卡片 (需求驱动推理优化) -->
    <el-row :gutter="16" style="margin-bottom:16px" v-if="demandStatus">
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" style="color:#52c41a">{{ demandStatus.active_count }}</div>
          <div class="stat-label">推理活跃通道</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" style="color:#8c8c8c">{{ demandStatus.idle_count }}</div>
          <div class="stat-label">推理休眠通道 (资源节省)</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" :style="{ color: demandStatus.resource_saving === 'on' ? '#52c41a' : '#faad14' }">
            {{ demandStatus.resource_saving === 'on' ? '已启用' : '无休眠' }}
          </div>
          <div class="stat-label">需求驱动推理</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 活跃流列表 -->
    <el-card>
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:600">活跃流</span>
            <el-tag size="small" type="info">{{ streams.length }}</el-tag>
          </div>
          <div style="display:flex;gap:8px">
            <el-button @click="fetchStreams">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
            <el-button type="primary" @click="showProxyDialog = true">
              <el-icon><Plus /></el-icon>添加拉流代理
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="streams" stripe v-loading="streamsLoading">
        <el-table-column prop="streamId" label="流 ID" min-width="160" show-overflow-tooltip />
        <el-table-column label="应用名/流名" min-width="140">
          <template #default="{ row }">
            {{ row.app }} / {{ row.stream }}
          </template>
        </el-table-column>
        <el-table-column prop="schema" label="协议" width="80">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.schema }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sourceDevice" label="来源设备" min-width="120" show-overflow-tooltip />
        <el-table-column prop="viewerCount" label="观看数" width="80" align="center" />
        <el-table-column label="码率" width="100">
          <template #default="{ row }">
            {{ formatBitrate(row.bitrate) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="playStream(row)">播放</el-button>
            <el-button size="small" link type="danger" @click="stopStream(row)">停止</el-button>
            <el-button size="small" link @click="screenshot(row)">截图</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ZLMediaKit 状态面板 -->
    <el-card style="margin-top:16px">
      <template #header>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:600">ZLMediaKit 状态</span>
          <el-tag :type="zlmOnline ? 'success' : 'danger'" size="small" effect="dark">
            {{ zlmOnline ? '在线' : '离线' }}
          </el-tag>
          <span v-if="!zlmOnline && zlmMessage" style="color:#909399;font-size:12px">{{ zlmMessage }}</span>
        </div>
      </template>
      <el-row :gutter="24" v-loading="zlmLoading">
        <el-col :span="6">
          <el-statistic title="CPU 使用率">
            <template #default>
              <el-progress type="circle" :width="80" :percentage="zlmStatus.cpu" :color="cpuColor" />
            </template>
          </el-statistic>
        </el-col>
        <el-col :span="6">
          <el-statistic title="内存使用率">
            <template #default>
              <el-progress type="circle" :width="80" :percentage="zlmStatus.memory" :color="memColor" />
            </template>
          </el-statistic>
        </el-col>
        <el-col :span="6">
          <div style="text-align:center">
            <div style="font-size:28px;font-weight:700;color:#1890ff">{{ zlmStatus.threads }}</div>
            <div style="font-size:13px;color:#8c8c8c;margin-top:4px">线程数</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div style="text-align:center">
            <div style="font-size:28px;font-weight:700;color:#722ed1">{{ zlmStatus.streamCount }}</div>
            <div style="font-size:13px;color:#8c8c8c;margin-top:4px">流数量</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 播放弹窗（默认WebRTC超低延迟，H264/H265均支持，失败自动降级HTTP-FLV） -->
    <el-dialog v-model="showPlayer" title="流播放" width="720px" @closed="stopPlayer">
      <div style="background:#000;border-radius:6px;overflow:hidden;position:relative">
        <video ref="videoRef" autoplay controls muted style="width:100%;max-height:450px" />
        <div v-if="playerLoading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);color:#fff">
          <el-icon class="is-loading" style="font-size:32px"><Loading /></el-icon>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="color:#8c8c8c;font-size:12px">
          流：{{ playingStream?.app }}/{{ playingStream?.stream }}
          &nbsp;
          <el-tag size="small" :type="playerMode === 'flv' ? 'success' : 'primary'" effect="plain">
            {{ playerMode === 'flv' ? 'HTTP-FLV (低延迟)' : 'WebRTC (超低延迟)' }}
          </el-tag>
        </div>
        <div style="display:flex;gap:6px">
          <el-button size="small" :type="playerMode === 'flv' ? 'success' : ''" @click="switchToFlv">HTTP-FLV</el-button>
          <el-button size="small" :type="playerMode === 'webrtc' ? 'primary' : ''" @click="switchToWebRTC">WebRTC</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 添加拉流代理对话框 -->
    <el-dialog v-model="showProxyDialog" title="添加拉流代理" width="520px" @closed="resetProxyForm">
      <el-form :model="proxyForm" label-width="110px">
        <el-form-item label="源地址" required>
          <el-input v-model="proxyForm.url" placeholder="rtsp://192.168.1.100:554/stream1 或 rtmp://..." />
        </el-form-item>
        <el-form-item label="应用名" required>
          <el-input v-model="proxyForm.app" placeholder="live" />
        </el-form-item>
        <el-form-item label="流名" required>
          <el-input v-model="proxyForm.stream" placeholder="stream_001" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showProxyDialog = false">取消</el-button>
        <el-button type="primary" :loading="proxySubmitting" @click="addProxy">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { http, streamHttp } from '@/api/http'
import type { ApiResponse } from '@/types/common'
import { getInferenceDemandStatus, type DemandStatusResponse } from '@/api/inference'
import Hls from 'hls.js'
import flvjs from 'flv.js'

// ===== 类型 =====

// 推理需求状态
const demandStatus = ref<DemandStatusResponse | null>(null)

interface StreamInfo {
  streamId: string
  app: string
  stream: string
  schema: string
  sourceDevice: string
  viewerCount: number
  bitrate: number
  createdAt: string
}

interface ZlmStatus {
  cpu: number
  memory: number
  threads: number
  streamCount: number
  online: boolean
}

// ===== 统计 =====
const stats = reactive({
  activeStreams: 0,
  totalViewers: 0,
  totalBitrate: 0,
})

// ===== 流列表 =====
const streams = ref<StreamInfo[]>([])
const streamsLoading = ref(false)

async function fetchStreams() {
  streamsLoading.value = true
  try {
    const res = await http.get<ApiResponse<any>>('/zlm/streams')
    const data = res.data?.data ?? []
    const items = Array.isArray(data) ? data : data.items ?? []
    streams.value = items
    stats.activeStreams = items.length
    stats.totalViewers = items.reduce((s: number, i: any) => s + (i.viewerCount ?? i.viewer_count ?? 0), 0)
    stats.totalBitrate = items.reduce((s: number, i: any) => s + (i.bitrate ?? 0), 0)
  } catch {
    streams.value = []
  } finally {
    streamsLoading.value = false
  }
}

// ===== ZLM 状态 =====
const zlmStatus = reactive<ZlmStatus>({ cpu: 0, memory: 0, threads: 0, streamCount: 0, online: false })
const zlmLoading = ref(false)
const zlmMessage = ref('')
const zlmOnline = computed(() => zlmStatus.online)

const cpuColor = computed(() => zlmStatus.cpu > 80 ? '#ff4d4f' : zlmStatus.cpu > 60 ? '#faad14' : '#52c41a')
const memColor = computed(() => zlmStatus.memory > 80 ? '#ff4d4f' : zlmStatus.memory > 60 ? '#faad14' : '#52c41a')

async function fetchZlmStatus() {
  zlmLoading.value = true
  try {
    // 优先用 /streams/zlm-status (api/stream.ts)，fallback 到 /zlm/status
    let d: any = null
    try {
      const res = await streamHttp.get<ApiResponse<any>>('/zlm-status')
      d = res.data?.data
    } catch {
      const res = await http.get<ApiResponse<any>>('/zlm/status')
      d = res.data?.data
    }
    if (d) {
      zlmStatus.cpu = d.cpu ?? d.cpu_usage ?? 0
      zlmStatus.memory = d.memory ?? d.mem_usage ?? 0
      zlmStatus.threads = d.threads ?? 0
      zlmStatus.streamCount = d.streams ?? d.stream_count ?? d.streamCount ?? d.active_streams ?? 0
      zlmStatus.online = d.online ?? false
      zlmMessage.value = d.message ?? ''
    }
  } catch {
    zlmStatus.online = false
    zlmMessage.value = '请求失败'
  } finally {
    zlmLoading.value = false
  }
}

// ===== 流操作 =====
async function stopStream(row: StreamInfo) {
  try {
    await http.post('/zlm/stream/stop', { app: row.app, stream: row.stream, schema: row.schema })
    ElMessage.success('已停止')
    fetchStreams()
  } catch {
    ElMessage.error('停止失败')
  }
}

async function screenshot(row: StreamInfo) {
  try {
    const res = await http.post('/zlm/stream/screenshot', { app: row.app, stream: row.stream })
    ElMessage.success('截图已保存')
  } catch {
    ElMessage.error('截图失败')
  }
}

// ===== 播放器（默认WebRTC超低延迟，失败降级HTTP-FLV）=====
const showPlayer = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
const playingStream = ref<StreamInfo | null>(null)
// 默认 WebRTC（H264/H265均支持，失败自动降级HTTP-FLV）
const playerMode = ref<'flv' | 'webrtc'>('webrtc')
const playerLoading = ref(false)
let peerConnection: RTCPeerConnection | null = null
let flvPlayer: flvjs.Player | null = null
let hlsPlayer: Hls | null = null

async function playStream(row: StreamInfo) {
  playingStream.value = row
  showPlayer.value = true
  playerLoading.value = true

  // 调用智能协议选择API，根据设备编码和网络状况自动选择最优播放协议
  try {
    // 测量RTT（简化版：用整体响应时间作为估算）
    const rttStart = Date.now()
    let estimatedRtt = 0
    try {
      await http.get('/health')
      estimatedRtt = Date.now() - rttStart
    } catch {
      estimatedRtt = 200 // 请求失败假设高RTT
    }

    const res = await http.post<any>('/streams/playback-optimize', {
      stream_id: row.stream,
      client_rtt_ms: estimatedRtt,
    })
    const optData = res.data?.data ?? res.data
    // 服务端根据设备和网络状况返回最优协议
    const protocol = optData?.protocol ?? 'webrtc'

    // 根据推荐协议启动播放
    if (protocol === 'webrtc') {
      playerMode.value = 'webrtc'
      setTimeout(() => startWebRTC(row), 100)
    } else {
      playerMode.value = 'flv'
      setTimeout(() => startFlvPlay(row), 100)
    }
  } catch {
    // API调用失败，默认尝试WebRTC
    playerMode.value = 'webrtc'
    setTimeout(() => startWebRTC(row), 100)
  }
}

// HTTP-FLV 播放（降级备用，延迟 150-350ms）
// [一次性设计修正 2026-06-21] 必须用 flv.js MSE 解码，浏览器原生 video 不支持 .flv 流封装
//   之前直接 video.src=flvUrl 会导致 'DEMUXER_ERROR' → srcObject=null 黑屏循环
//   对标海康/大华：DSS 客户端同样使用 flv.js (MSE) 而非 video.src
function startFlvPlay(row: StreamInfo) {
  if (!videoRef.value) return
  stopWebRTC()
  stopFlv()  // [Fix] 清理旧的 flv 实例，避免内存泄漏
  playerLoading.value = true
  playerMode.value = 'flv'

  // ZLM HTTP-FLV 地址 — 通过 Vite 代理 /rtp → http://127.0.0.1:9080/rtp
  const flvUrl = `/rtp/${row.stream}.live.flv`

  const video = videoRef.value
  video.srcObject = null
  video.removeAttribute('src')
  video.load()

  if (!flvjs.isSupported()) {
    // 浏览器不支持 flv.js (老 Safari) — 退回 HLS
    return startHlsPlay(row)
  }

  const player = flvjs.createPlayer({
    type: 'flv', url: flvUrl, isLive: true,
    hasAudio: false, hasVideo: true,
  }, {
    enableStashBuffer: false,
    stashInitialSize: 128,
    autoCleanupSourceBuffer: false,
    lazyLoad: false,
    liveBufferLatencyChasing: true,
    liveSyncDurationCount: 1,
    liveMaxLatencyDurationCount: 1.5,
  } as any)

  player.attachMediaElement(video)
  player.load()
  const playPromise = player.play()
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {})
  }

  player.on(flvjs.Events.LOADING_COMPLETE, () => {
    playerLoading.value = false
  })

  player.on(flvjs.Events.ERROR, (errorType: any, errorDetail: any) => {
    console.error('[StreamMgmt] flv.js ERROR:', errorType, errorDetail)
    playerLoading.value = false
    try { player.destroy() } catch {}
    // FLV 失败 → 自动回退 HLS
    ElMessage.warning('HTTP-FLV 播放失败，已切换到 HLS')
    startHlsPlay(row)
  })

  flvPlayer = player
}

// HLS fallback (H.265 兼容)
function startHlsPlay(row: StreamInfo) {
  if (!videoRef.value) return
  stopWebRTC()
  stopFlv()
  stopHls()
  playerLoading.value = true
  const video = videoRef.value
  const hlsUrl = `/rtp/${row.stream}.live.m3u8`
  if (Hls.isSupported()) {
    hlsPlayer = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      liveSyncDurationCount: 1,
      liveMaxLatencyDurationCount: 2,
      liveDurationInfinity: true,
    })
    hlsPlayer.loadSource(hlsUrl)
    hlsPlayer.attachMedia(video)
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {})
      playerLoading.value = false
    })
    hlsPlayer.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hlsPlayer?.startLoad()
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hlsPlayer?.recoverMediaError()
      }
    })
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = hlsUrl
    video.play().catch(() => {})
    video.onloadeddata = () => { playerLoading.value = false }
  }
}

function stopFlv() {
  if (flvPlayer) {
    try { flvPlayer.destroy() } catch {}
    flvPlayer = null
  }
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.removeAttribute('src')
    videoRef.value.load()
  }
}

function stopHls() {
  if (hlsPlayer) {
    try { hlsPlayer.destroy() } catch {}
    hlsPlayer = null
  }
}

// WebRTC 播放（超低延迟，默认首选）
async function startWebRTC(row: StreamInfo) {
  if (!videoRef.value) return
  playerLoading.value = true
  try {
    peerConnection = new RTCPeerConnection()
    peerConnection.ontrack = (event) => {
      if (videoRef.value && event.streams[0]) {
        videoRef.value.srcObject = event.streams[0]
        playerLoading.value = false
      }
    }
    peerConnection.addTransceiver('video', { direction: 'recvonly' })
    peerConnection.addTransceiver('audio', { direction: 'recvonly' })

    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    const res = await http.post('/api/v1/webrtc/exchange', {
      stream_id: `${row.app}/${row.stream}`,
      sdp: offer.sdp,
      type: 'offer',
    })
    const data = res.data?.data ?? res.data
    if (data?.sdp) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }))
    } else {
      throw new Error('no sdp')
    }
  } catch {
    playerLoading.value = false
    ElMessage.error('WebRTC 连接失败，已自动回退到 HTTP-FLV')
    switchToFlv()
  }
}

function stopWebRTC() {
  if (peerConnection) {
    peerConnection.close()
    peerConnection = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

function switchToFlv() {
  if (!playingStream.value) return
  playerMode.value = 'flv'
  stopWebRTC()
  stopFlv()
  startFlvPlay(playingStream.value)
}

function switchToWebRTC() {
  if (!playingStream.value) return
  playerMode.value = 'webrtc'
  stopFlv()
  stopHls()
  if (videoRef.value) {
    videoRef.value.src = ''
    videoRef.value.load()
  }
  startWebRTC(playingStream.value)
}

function stopPlayer() {
  stopWebRTC()
  stopFlv()
  stopHls()
  if (videoRef.value) {
    videoRef.value.src = ''
    videoRef.value.load()
  }
  playingStream.value = null
  playerLoading.value = false
}

// ===== 拉流代理 =====
const showProxyDialog = ref(false)
const proxySubmitting = ref(false)
const proxyForm = reactive({ url: '', app: 'live', stream: '' })

async function addProxy() {
  if (!proxyForm.url || !proxyForm.app || !proxyForm.stream) {
    ElMessage.warning('请填写完整信息')
    return
  }
  proxySubmitting.value = true
  try {
    await http.post('/zlm/proxy/add', {
      url: proxyForm.url,
      app: proxyForm.app,
      stream: proxyForm.stream,
    })
    ElMessage.success('拉流代理已添加')
    showProxyDialog.value = false
    fetchStreams()
  } catch {
    ElMessage.error('添加失败')
  } finally {
    proxySubmitting.value = false
  }
}

function resetProxyForm() {
  proxyForm.url = ''
  proxyForm.app = 'live'
  proxyForm.stream = ''
}

// ===== 工具函数 =====
function formatBitrate(bps: number): string {
  if (!bps) return '0 bps'
  if (bps >= 1_000_000) return (bps / 1_000_000).toFixed(1) + ' Mbps'
  if (bps >= 1_000) return (bps / 1_000).toFixed(1) + ' Kbps'
  return bps + ' bps'
}

function formatTime(ts: string): string {
  if (!ts) return '-'
  try { return new Date(ts).toLocaleString('zh-CN') } catch { return ts }
}

onMounted(() => {
  fetchStreams()
  fetchZlmStatus()
  fetchDemandStatus()
})

onBeforeUnmount(() => {
  stopPlayer()
})

async function fetchDemandStatus() {
  try {
    const res = await getInferenceDemandStatus()
    if (res.data?.code === 0) {
      demandStatus.value = res.data.data
    }
  } catch {
    // 静默失败: 推理状态面板是辅助信息
  }
}
</script>

<style scoped>
.stream-page { padding: 0 4px; }
.stat-card { text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; }
.stat-label { font-size: 13px; color: #8c8c8c; margin-top: 4px; }
</style>
