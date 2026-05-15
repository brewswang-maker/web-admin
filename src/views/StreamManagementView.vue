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
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-weight:600">ZLMediaKit 状态</span>
          <el-tag :type="zlmOnline ? 'success' : 'danger'" size="small" effect="dark">
            {{ zlmOnline ? '在线' : '离线' }}
          </el-tag>
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

    <!-- WebRTC 播放弹窗 -->
    <el-dialog v-model="showPlayer" title="流播放" width="720px" @closed="stopPlayer">
      <div style="background:#000;border-radius:6px;overflow:hidden">
        <video ref="videoRef" autoplay controls style="width:100%;max-height:450px" />
      </div>
      <div style="margin-top:8px;color:#8c8c8c;font-size:12px">
        流：{{ playingStream?.app }}/{{ playingStream?.stream }}
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { http } from '@/api/http'
import type { ApiResponse } from '@/types/common'

// ===== 类型 =====
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
const zlmOnline = computed(() => zlmStatus.online)

const cpuColor = computed(() => zlmStatus.cpu > 80 ? '#ff4d4f' : zlmStatus.cpu > 60 ? '#faad14' : '#52c41a')
const memColor = computed(() => zlmStatus.memory > 80 ? '#ff4d4f' : zlmStatus.memory > 60 ? '#faad14' : '#52c41a')

async function fetchZlmStatus() {
  zlmLoading.value = true
  try {
    const res = await http.get<ApiResponse<any>>('/zlm/status')
    const d = res.data?.data
    if (d) {
      zlmStatus.cpu = d.cpu ?? d.cpu_usage ?? 0
      zlmStatus.memory = d.memory ?? d.mem_usage ?? 0
      zlmStatus.threads = d.threads ?? 0
      zlmStatus.streamCount = d.stream_count ?? d.streamCount ?? 0
      zlmStatus.online = d.online ?? true
    }
  } catch {
    zlmStatus.online = false
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

// ===== WebRTC 播放 =====
const showPlayer = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
const playingStream = ref<StreamInfo | null>(null)
let peerConnection: RTCPeerConnection | null = null

async function playStream(row: StreamInfo) {
  playingStream.value = row
  showPlayer.value = true
  // 等待 DOM 渲染
  setTimeout(() => startWebRTC(row), 100)
}

async function startWebRTC(row: StreamInfo) {
  if (!videoRef.value) return
  try {
    peerConnection = new RTCPeerConnection()
    peerConnection.ontrack = (event) => {
      if (videoRef.value && event.streams[0]) {
        videoRef.value.srcObject = event.streams[0]
      }
    }
    peerConnection.addTransceiver('video', { direction: 'recvonly' })
    peerConnection.addTransceiver('audio', { direction: 'recvonly' })

    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    const res = await http.post('/zlm/webrtc/play', {
      app: row.app,
      stream: row.stream,
      sdp: offer.sdp,
      type: 'offer',
    })
    const data = res.data?.data ?? res.data
    if (data?.sdp) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }))
    }
  } catch {
    // WebRTC 不可用时，尝试直接 HLS/FLV 播放
    try {
      const hlsUrl = `/api/v1/zlm/${row.app}/${row.stream}/hls/live/index.m3u8`
      if (videoRef.value) videoRef.value.src = hlsUrl
    } catch {
      ElMessage.error('播放失败')
    }
  }
}

function stopPlayer() {
  if (peerConnection) {
    peerConnection.close()
    peerConnection = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
    videoRef.value.src = ''
  }
  playingStream.value = null
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
})
</script>

<style scoped>
.stream-page { padding: 0 4px; }
.stat-card { text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; }
.stat-label { font-size: 13px; color: #8c8c8c; margin-top: 4px; }
</style>
