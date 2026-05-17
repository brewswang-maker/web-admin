<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { deviceHttp } from '@/api/http'
import { getRecordings } from '@/api/recording'

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
interface RecordingSegment {
  id: string
  startTime: string
  endTime: string
  duration: number
  fileSize: number
  filePath: string
}

const devices = ref<Device[]>([])
const selectedDeviceId = ref('')
const selectedChannelId = ref('')
const selectedDate = ref(new Date().toISOString().split('T')[0])
const recordings = ref<RecordingSegment[]>([])
const loading = ref(false)
const playingUrl = ref('')
const isPlaying = ref(false)
const canvasRef = ref<HTMLCanvasElement>()

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
    const { data } = await getRecordings({
      params: {
        deviceId: selectedDeviceId.value,
        channelId: selectedChannelId.value,
        date: selectedDate.value
      }
    })
    recordings.value = data?.data || data || []
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

function playSegment(rec: RecordingSegment) {
  playingUrl.value = `/api/v1/recordings/${rec.id}/play`
  isPlaying.value = true
}

function downloadSegment(rec: RecordingSegment) {
  window.open(`/api/v1/recordings/${rec.id}/download`, '_blank')
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

onMounted(fetchDevices)
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
        <!-- 日期选择 + 查询 -->
        <el-card shadow="never">
          <div style="display:flex;align-items:center;gap:12px">
            <span>日期:</span>
            <el-date-picker v-model="selectedDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
            <el-button type="primary" @click="fetchRecordings" :loading="loading">查询录像</el-button>
          </div>
        </el-card>

        <!-- 时间轴 -->
        <el-card shadow="never">
          <template #header>24小时时间轴</template>
          <canvas ref="canvasRef" style="width:100%;height:40px;cursor:pointer" @click="handleTimelineClick" />
        </el-card>

        <!-- 录像片段列表 -->
        <el-card shadow="never" style="flex:1;overflow:auto">
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

        <!-- 播放器 -->
        <el-card v-if="isPlaying" shadow="never">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span>回放播放</span>
              <el-button size="small" @click="isPlaying = false; playingUrl = ''">关闭</el-button>
            </div>
          </template>
          <video :src="playingUrl" controls autoplay style="width:100%;max-height:360px;background:#000" />
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recording-view { padding: 20px; }
</style>
