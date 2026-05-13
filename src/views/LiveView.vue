<template>
  <div class="live-page">
    <el-row :gutter="16">
      <el-col :span="18">
        <el-card class="video-card">
          <template #header>
            <div class="video-header">
              <span>{{ selectedChannel ? selectedChannel.name : '请选择通道预览' }}</span>
              <div class="video-actions">
                <el-button-group>
                  <el-button size="small" @click="layoutMode = '1x1'">
                    <el-icon><FullScreen /></el-icon>
                  </el-button>
                  <el-button size="small" @click="layoutMode = '2x2'">
                    <el-icon><Grid /></el-icon>
                  </el-button>
                  <el-button size="small" @click="layoutMode = '3x3'">
                    <el-icon><Platform /></el-icon>
                  </el-button>
                </el-button-group>
                <el-button size="small" @click="handleSnapshot" :disabled="!selectedChannel">
                  <el-icon><Camera /></el-icon>抓拍
                </el-button>
                <el-button size="small" @click="handleRecord" :disabled="!selectedChannel"
                  :type="recording ? 'danger' : 'default'">
                  <el-icon><VideoCamera /></el-icon>{{ recording ? '停止' : '录像' }}
                </el-button>
              </div>
            </div>
          </template>
          <div class="video-grid" :class="layoutMode">
            <div v-for="n in layoutCount" :key="n" class="video-cell">
              <div class="video-placeholder">
                <el-icon :size="48"><VideoCamera /></el-icon>
                <span>CH{{ n }} {{ selectedChannel?.name || '无信号' }}</span>
                <div class="video-overlay">
                  <span class="algo-tag">{{ selectedChannel?.algoPlugin || '无' }}</span>
                  <span class="fps-tag">{{ selectedChannel?.fps || 0 }}fps</span>
                </div>
              </div>
            </div>
          </div>
        </el-card>

        <el-card header="AI检测实时日志" style="margin-top: 16px">
          <div class="log-container" ref="logContainer">
            <div v-for="(log, idx) in detectionLogs" :key="idx" class="log-item">
              <span class="log-time">{{ log.time }}</span>
              <el-tag :type="levelLogTag(log.level)" size="small" class="log-level">{{ log.level }}</el-tag>
              <span class="log-msg">{{ log.message }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card :header="queryDeviceId ? `${currentDeviceLabel} 的通道` : '设备列表'">
          <template v-if="queryDeviceId">
            <el-button size="small" link type="primary" @click="router.push({})" style="margin-bottom: 10px">
              <el-icon><ArrowLeft /></el-icon> 返回设备列表
            </el-button>
            <el-divider style="margin: 8px 0" />
          </template>
          <div v-if="!queryDeviceId" class="device-select-list">
            <div v-for="dev in devices" :key="dev.id" class="device-select-item"
              @click="switchToDevice(dev.id)">
              <div class="device-select-icon">
                <el-icon :size="20"><Monitor /></el-icon>
              </div>
              <div class="device-select-info">
                <div class="device-select-name">{{ dev.name }}</div>
                <div class="device-select-meta">
                  <el-tag :type="dev.status === 'online' ? 'success' : 'info'" size="small">
                    {{ dev.status === 'online' ? '在线' : '离线' }}
                  </el-tag>
                  <span class="device-select-channels">{{ dev.channelCount }}通道</span>
                </div>
              </div>
            </div>
            <el-empty v-if="!devices.length" description="暂无设备" :image-size="60" />
          </div>
          <template v-if="queryDeviceId">
            <el-input v-model="channelSearch" placeholder="搜索通道..." size="small" clearable />
          </template>
        </el-card>

        <el-card header="通道列表" v-if="queryDeviceId" style="margin-top: 12px" v-loading="channelsLoading">
          <div class="channel-list">
            <div v-for="ch in filteredChannels" :key="ch.id"
              :class="['channel-item', { active: selectedChannel?.id === ch.id }]"
              @click="selectChannel(ch)">
              <div class="channel-thumb">
                <el-icon :size="24"><VideoCamera /></el-icon>
              </div>
              <div class="channel-info">
                <div class="channel-name">{{ ch.name }}</div>
                <div class="channel-meta">
                  <el-tag :type="channelStatusType(ch)" size="small">
                    {{ channelStatusText(ch) }}
                  </el-tag>
                </div>
                <div class="channel-stats">
                  <span>{{ ch.algoPlugin || '无' }}</span>
                  <span>{{ ch.fps }}fps</span>
                </div>
              </div>
            </div>
            <el-empty v-if="!filteredChannels.length && !channelsLoading" description="暂无通道" :image-size="60" />
          </div>
        </el-card>

        <el-card header="PTZ控制" style="margin-top: 16px" v-if="selectedChannel">
          <div class="ptz-pad">
            <div class="ptz-row">
              <el-button circle @click="ptzMove('up')"><el-icon><ArrowUp /></el-icon></el-button>
            </div>
            <div class="ptz-row">
              <el-button circle @click="ptzMove('left')"><el-icon><ArrowLeft /></el-icon></el-button>
              <el-button circle @click="ptzMove('home')"><el-icon><Aim /></el-icon></el-button>
              <el-button circle @click="ptzMove('right')"><el-icon><ArrowRight /></el-icon></el-button>
            </div>
            <div class="ptz-row">
              <el-button circle @click="ptzMove('down')"><el-icon><ArrowDown /></el-icon></el-button>
            </div>
            <div class="ptz-zoom">
              <el-button circle @click="ptzZoom('in')"><el-icon><ZoomIn /></el-icon></el-button>
              <el-button circle @click="ptzZoom('out')"><el-icon><ZoomOut /></el-icon></el-button>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import { getDeviceChannels } from '@/api/devices'
import { ElMessage } from 'element-plus'
import type { Channel, DeviceItem } from '@/types/device'

const route = useRoute()
const router = useRouter()
const deviceStore = useDeviceStore()

const queryDeviceId = computed(() => (route.query.deviceId as string) || '')
const queryChannelNo = computed(() => {
  const v = parseInt(route.query.channel as string)
  return isNaN(v) ? 0 : v
})

const devices = ref<DeviceItem[]>([])

const layoutMode = ref<'1x1' | '2x2' | '3x3'>('2x2')
const layoutCount = computed(() => {
  return layoutMode.value === '1x1' ? 1 : layoutMode.value === '2x2' ? 4 : 9
})

const channelSearch = ref('')
const selectedChannel = ref<Channel | null>(null)
const recording = ref(false)
const channels = ref<Channel[]>([])
const channelsLoading = ref(false)

const currentDeviceLabel = computed(() => {
  const dev = devices.value.find(d => d.id === queryDeviceId.value)
  return dev?.name || ''
})

const filteredChannels = computed(() => {
  if (!channelSearch.value) return channels.value
  const s = channelSearch.value.toLowerCase()
  return channels.value.filter(c => c.name.toLowerCase().includes(s))
})

function channelStatusText(ch: Channel): string {
  if (ch.isRecording) return '录像中'
  if (ch.status === 'streaming') return '推流中'
  if (ch.status === 'error') return '异常'
  return '待机'
}
function channelStatusType(ch: Channel): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  if (ch.isRecording) return 'danger'
  if (ch.status === 'streaming') return 'success'
  if (ch.status === 'error') return 'danger'
  return 'info'
}

async function loadChannels() {
  if (!queryDeviceId.value) {
    channels.value = []
    selectedChannel.value = null
    return
  }
  channelsLoading.value = true
  try {
    const chs = await getDeviceChannels(queryDeviceId.value)
    channels.value = chs
    if (queryChannelNo.value > 0) {
      const target = chs.find(c => c.channelNo === queryChannelNo.value)
      if (target) selectedChannel.value = target
    }
    if (!selectedChannel.value && chs.length) {
      selectedChannel.value = chs[0]
    }
  } catch {
    ElMessage.error('加载通道失败')
  } finally {
    channelsLoading.value = false
  }
}

function selectChannel(ch: Channel) {
  selectedChannel.value = ch
  ElMessage.info(`正在加载 ${ch.name} 视频流...`)
}

function switchToDevice(deviceId: string) {
  router.push({ query: { deviceId } })
}

function ptzMove(dir: string) { ElMessage.info(`PTZ: ${dir}`) }
function ptzZoom(dir: string) { ElMessage.info(`变焦: ${dir}`) }

function handleSnapshot() { ElMessage.success('抓拍已保存') }
function handleRecord() {
  recording.value = !recording.value
  ElMessage.info(recording.value ? '开始录像' : '停止录像')
}

const detectionLogs = ref([
  { time: '14:32:10', level: 'high', message: '[入侵检测] 检测到人员进入警戒区域 | 置信度92%' },
  { time: '14:28:05', level: 'critical', message: '[烟火检测] 检测到烟雾+温度异常85°C | 置信度97%' },
  { time: '14:15:22', level: 'medium', message: '[徘徊检测] 目标徘徊超30秒 | 置信度78%' },
  { time: '14:10:47', level: 'low', message: '[安全帽检测] 未佩戴安全帽 | 置信度65%' }
])

function levelLogTag(level: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = { critical: 'danger', high: 'warning', medium: 'info', low: 'info' }
  return map[level] || 'info'
}

let logTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  if (!deviceStore.devices.length) {
    await deviceStore.fetchDevices({ page: 1, pageSize: 100 })
  }
  devices.value = deviceStore.devices
  if (queryDeviceId.value) {
    await loadChannels()
  }
  logTimer = setInterval(() => {
    const now = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    const ch = selectedChannel.value
    const algo = ch?.algoPlugin && ch.algoPlugin !== '无' ? ch.algoPlugin : 'AI检测'
    const chName = ch?.name || '未知通道'
    detectionLogs.value.unshift({
      time: now,
      level: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
      message: `[${algo}] ${chName} 检测到目标活动 | 置信度${Math.floor(Math.random()*30+70)}%`
    })
    if (detectionLogs.value.length > 100) detectionLogs.value.pop()
  }, 5000)
})

watch(() => route.query.deviceId, async (newId) => {
  channels.value = []
  selectedChannel.value = null
  if (newId) await loadChannels()
})

onUnmounted(() => {
  if (logTimer) clearInterval(logTimer)
})
</script>

<style scoped>
.live-page { max-width: 1920px; }
.video-card .el-card__body { padding: 12px; }
.video-header { display: flex; justify-content: space-between; align-items: center; }
.video-actions { display: flex; gap: 8px; align-items: center; }
.video-grid { display: grid; gap: 4px; min-height: 400px; }
.video-grid.\31 x1 { grid-template-columns: 1fr; }
.video-grid.\32 x2 { grid-template-columns: 1fr 1fr; }
.video-grid.\33 x3 { grid-template-columns: 1fr 1fr 1fr; }
.video-cell { background: #1a1a2e; border-radius: 6px; min-height: 200px; }
.video-placeholder { width: 100%; height: 100%; min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #ffffff60; gap: 8px; position: relative; }
.video-overlay { position: absolute; top: 8px; left: 8px; display: flex; gap: 6px; }
.algo-tag { background: rgba(24,144,255,0.8); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.fps-tag { background: rgba(0,0,0,0.6); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.log-container { max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 13px; }
.log-item { padding: 4px 0; border-bottom: 1px solid #f0f0f0; display: flex; gap: 8px; align-items: center; }
.log-time { color: #8c8c8c; white-space: nowrap; }
.log-msg { flex: 1; }
.device-select-list { max-height: 380px; overflow-y: auto; }
.device-select-item { display: flex; gap: 10px; padding: 10px; border-radius: 8px; cursor: pointer; margin-bottom: 6px; transition: background 0.2s; border: 2px solid transparent; }
.device-select-item:hover { background: #f5f5f5; border-color: #1890ff; }
.device-select-icon { width: 40px; height: 40px; background: #e6f7ff; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #1890ff; flex-shrink: 0; }
.device-select-info { flex: 1; }
.device-select-name { font-weight: 600; font-size: 14px; }
.device-select-meta { margin-top: 4px; display: flex; gap: 8px; align-items: center; }
.device-select-channels { font-size: 12px; color: #8c8c8c; }
.channel-list { max-height: 400px; overflow-y: auto; }
.channel-item { display: flex; gap: 10px; padding: 10px; border-radius: 8px; cursor: pointer; margin-bottom: 6px; transition: background 0.2s; border: 2px solid transparent; }
.channel-item:hover { background: #f5f5f5; }
.channel-item.active { border-color: #1890ff; background: #e6f7ff; }
.channel-thumb { width: 56px; height: 40px; background: #1a1a2e; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #ffffff40; flex-shrink: 0; }
.channel-info { flex: 1; }
.channel-name { font-weight: 600; font-size: 14px; }
.channel-meta { margin-top: 2px; }
.channel-stats { font-size: 12px; color: #8c8c8c; margin-top: 4px; display: flex; gap: 12px; }
.ptz-pad { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ptz-row { display: flex; gap: 12px; }
.ptz-zoom { display: flex; gap: 12px; margin-top: 8px; }
</style>
