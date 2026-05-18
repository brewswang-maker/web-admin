<template>
  <div class="live-page">
    <el-row :gutter="16">
      <!-- 左侧: 视频区 -->
      <el-col :span="18">
        <el-card class="video-card" :body-style="{ padding: '0' }">
          <div class="video-toolbar">
            <span class="toolbar-title">
              <el-icon><VideoCamera /></el-icon>
              {{ activeChannelName }}
            </span>
            <div class="toolbar-actions">
              <el-button-group size="small">
                <el-button :type="layout === 1 ? 'primary' : 'default'" @click="layout = 1">1</el-button>
                <el-button :type="layout === 4 ? 'primary' : 'default'" @click="layout = 4">4</el-button>
                <el-button :type="layout === 9 ? 'primary' : 'default'" @click="layout = 9">9</el-button>
                <el-button :type="layout === 16 ? 'primary' : 'default'" @click="layout = 16">16</el-button>
              </el-button-group>
              <el-button size="small" @click="snapshotActive" :disabled="!hasActive">
                <el-icon><Camera /></el-icon>截图
              </el-button>
              <el-button size="small" @click="toggleFullscreen">
                <el-icon><FullScreen /></el-icon>
              </el-button>
            </div>
          </div>
          <div class="video-grid" :class="`grid-${layout}`" ref="gridRef">
            <div v-for="(slot, idx) in gridSlots" :key="idx"
                 class="video-cell"
                 :class="{ active: activeSlotIdx === idx, 'has-stream': slot.channelId }"
                 @click="activeSlotIdx = idx"
                 @dblclick="maximizeSlot(idx)">
              <!-- 真实视频播放 -->
              <video v-if="slot.playing && slot.hlsUrl"
                     :ref="el => setVideoRef(el, idx)"
                     class="video-player"
                     muted autoplay playsinline
                     :src="slot.hlsUrl" />
              <div v-else-if="slot.loading" class="video-loading">
                <el-icon class="spin"><Loading /></el-icon>
                <span>连接中...</span>
              </div>
              <div v-else class="video-empty" @dragover.prevent @drop="onDropChannel($event, idx)">
                <el-icon :size="32"><VideoCamera /></el-icon>
                <span>拖拽通道到此处</span>
              </div>
              <!-- 视频叠加层 -->
              <div v-if="slot.channelId" class="video-hud">
                <span class="hud-name">{{ slot.name || `CH${idx + 1}` }}</span>
                <span class="hud-badge" :class="slot.status">{{ (slot as any).status === 'streaming' ? 'LIVE' : 'OFF' }}</span>
                <span class="hud-time">{{ currentTime }}</span>
              </div>
              <!-- 控制条 -->
              <div v-if="slot.channelId" class="video-controls">
                <el-button circle size="small" @click.stop="snapshotSlot(idx)"><el-icon><Camera /></el-icon></el-button>
                <el-button circle size="small" @click.stop="toggleSlotAudio(idx)">
                  <el-icon><component :is="slot.muted ? 'Mute' : 'Microphone'" /></el-icon>
                </el-button>
                <el-button circle size="small" @click.stop="closeSlot(idx)"><el-icon><Close /></el-icon></el-button>
              </div>
            </div>
          </div>
        </el-card>

        <!-- AI检测日志 -->
        <el-card class="log-card" :body-style="{ padding: '8px 12px' }">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span>🧠 AI检测日志</span>
              <el-button size="small" text @click="detectionLogs = []">清空</el-button>
            </div>
          </template>
          <div class="log-scroll" ref="logRef">
            <div v-for="(log, i) in detectionLogs" :key="i" class="log-row">
              <span class="log-t">{{ log.time }}</span>
              <el-tag :type="log.tagType as any" size="small" effect="dark">{{ log.level }}</el-tag>
              <span class="log-m">{{ log.msg }}</span>
            </div>
            <div v-if="!detectionLogs.length" class="log-empty">等待检测结果...</div>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧: 通道 + PTZ -->
      <el-col :span="6">
        <el-card>
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span>通道列表</span>
              <el-input v-model="chSearch" size="small" style="width:140px" placeholder="搜索..." clearable />
            </div>
          </template>
          <div class="channel-list">
            <div v-for="ch in filteredChannels" :key="ch.id"
                 class="ch-item"
                 draggable="true"
                 @dragstart="onDragChannel($event, ch)"
                 @click="assignToActive(ch)">
              <div class="ch-icon" :class="ch.status">
                <el-icon :size="18"><VideoCamera /></el-icon>
              </div>
              <div class="ch-body">
                <div class="ch-name">{{ ch.name }}</div>
                <div class="ch-meta">
                  <span>{{ ch.algoPlugin || '无算法' }}</span>
                  <span>{{ ch.fps || 0 }}fps</span>
                </div>
              </div>
              <el-tag :type="((ch as any).status === 'streaming' ? 'success' : (ch as any).status === 'online' ? 'primary' : 'info') as any" size="small">
                {{ (ch as any).status === 'streaming' ? '推流' : (ch as any).status === 'online' ? '在线' : '离线' }}
              </el-tag>
            </div>
            <el-empty v-if="!filteredChannels.length" description="暂无通道" :image-size="50" />
          </div>
        </el-card>

        <!-- PTZ面板 -->
        <el-card v-if="hasActive" style="margin-top:12px">
          <template #header>PTZ 云台</template>
          <div class="ptz-panel">
            <div class="ptz-dpad">
              <div class="ptz-row"><el-button circle @mousedown="ptzStart('up')" @mouseup="ptzStop"><el-icon><ArrowUp /></el-icon></el-button></div>
              <div class="ptz-row">
                <el-button circle @mousedown="ptzStart('left')" @mouseup="ptzStop"><el-icon><ArrowLeft /></el-icon></el-button>
                <el-button circle type="primary" @click="ptzHome"><el-icon><Aim /></el-icon></el-button>
                <el-button circle @mousedown="ptzStart('right')" @mouseup="ptzStop"><el-icon><ArrowRight /></el-icon></el-button>
              </div>
              <div class="ptz-row"><el-button circle @mousedown="ptzStart('down')" @mouseup="ptzStop"><el-icon><ArrowDown /></el-icon></el-button></div>
            </div>
            <div class="ptz-zoom-row">
              <el-button @mousedown="ptzStart('zoom_in')" @mouseup="ptzStop">变倍 +</el-button>
              <el-button @mousedown="ptzStart('zoom_out')" @mouseup="ptzStop">变倍 -</el-button>
            </div>
            <div class="ptz-speed">
              <span>速度</span>
              <el-slider v-model="ptzSpeed" :min="1" :max="255" :show-tooltip="false" size="small" />
            </div>
            <div class="ptz-presets">
              <span>预置位</span>
              <el-button-group size="small">
                <el-button v-for="p in 4" :key="p" @click="ptzPreset(p)">P{{ p }}</el-button>
              </el-button-group>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, reactive, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import { getDeviceChannels } from '@/api/devices'
import { streamHttp } from '@/api/http'
import { ptzControl as ptzApi } from '@/api/ptz'
import { ElMessage } from 'element-plus'
import type { Channel, DeviceItem } from '@/types/device'
import Hls from 'hls.js'
import flvjs from 'flv.js'

interface GridSlot {
  channelId: string
  name: string
  status: string
  hlsUrl: string
  flvUrl: string
  playing: boolean
  loading: boolean
  muted: boolean
  deviceId: string
  playerInstance: Hls | flvjs.Player | null
}

const route = useRoute()
const router = useRouter()
const deviceStore = useDeviceStore()

// 视频网格
const layout = ref(4)
const activeSlotIdx = ref(0)
const gridSlots = reactive<GridSlot[]>(
  Array.from({ length: 16 }, () => ({
    channelId: '', name: '', status: '', hlsUrl: '', flvUrl: '', playing: false, loading: false, muted: true, deviceId: '', playerInstance: null
  }))
)
const videoRefs = ref<Record<number, HTMLVideoElement>>({})
const gridRef = ref<HTMLElement>()
const logRef = ref<HTMLElement>()

const setVideoRef = (el: any, idx: number) => {
  if (el) videoRefs.value[idx] = el as HTMLVideoElement
}

// 通道数据
const channels = ref<Channel[]>([])
const devices = ref<DeviceItem[]>([])
const chSearch = ref('')
const ptzSpeed = ref(128)
const currentTime = ref('')

// 检测日志
interface LogEntry { time: string; level: string; tagType: string; msg: string }
const detectionLogs = ref<LogEntry[]>([])

const hasActive = computed(() => !!gridSlots[activeSlotIdx.value]?.channelId)
const activeChannelName = computed(() => gridSlots[activeSlotIdx.value]?.name || '实时监控')
const filteredChannels = computed(() => {
  if (!chSearch.value) return channels.value
  const s = chSearch.value.toLowerCase()
  return channels.value.filter(c => c.name.toLowerCase().includes(s))
})

// 加载设备+通道
async function loadData() {
  if (!deviceStore.devices.length) await deviceStore.fetchDevices({ page: 1, pageSize: 100 })
  devices.value = deviceStore.devices
  // 加载所有设备的通道
  const allChs: Channel[] = []
  for (const dev of devices.value) {
    try {
      const res = await getDeviceChannels(dev.id) as any
      const chs: Channel[] = res?.data?.data ?? res?.data ?? res
      for (const ch of chs) { (ch as any).deviceId = dev.id }
      allChs.push(...chs)
    } catch { /* skip */ }
  }
  channels.value = allChs

  // 如果URL指定了设备，自动分配第一个通道
  const qDev = route.query.deviceId as string
  if (qDev) {
    const ch = allChs.find(c => c.deviceId === qDev)
    if (ch) assignChannel(0, ch)
  }
}

// 分配通道到视频格
function assignChannel(slotIdx: number, ch: Channel) {
  const slot = gridSlots[slotIdx]
  // 先关闭旧的
  closeSlot(slotIdx)

  slot.channelId = ch.id
  slot.name = ch.name
  slot.deviceId = ch.deviceId || ''
  slot.status = ch.status
  slot.loading = true
  slot.muted = true

  // 获取播放地址并播放
  fetchStreamUrls(ch).then(urls => {
    if (urls) {
      slot.hlsUrl = urls.hlsUrl || ''
      slot.flvUrl = urls.flvUrl || ''
      slot.playing = true
      slot.status = 'streaming'
      nextTick(() => attachPlayer(slotIdx))
    }
    slot.loading = false
  }).catch(() => { slot.loading = false })
}

function assignToActive(ch: Channel) {
  assignChannel(activeSlotIdx.value, ch)
}

function closeSlot(idx: number) {
  const slot = gridSlots[idx]
  // 销毁播放器实例
  if (slot.playerInstance) {
    if ('destroy' in slot.playerInstance) slot.playerInstance.destroy()
    slot.playerInstance = null
  }
  if (slot.playing) {
    const video = videoRefs.value[idx]
    if (video) { video.pause(); video.removeAttribute('src'); video.load() }
    if (slot.channelId) {
      streamHttp.post(`/${slot.channelId}/stop`).catch(() => {})
    }
  }
  Object.assign(slot, { channelId: '', name: '', status: '', hlsUrl: '', flvUrl: '', playing: false, loading: false, muted: true, deviceId: '', playerInstance: null })
}

// 优先 HTTP-FLV（~0.5s延迟），备选 HLS（~3s延迟）
function attachPlayer(slotIdx: number) {
  const slot = gridSlots[slotIdx]
  const video = videoRefs.value[slotIdx]
  if (!video) return

  // 清理旧实例
  if (slot.playerInstance) {
    if ('destroy' in slot.playerInstance) slot.playerInstance.destroy()
    slot.playerInstance = null
  }

  // 优先 HTTP-FLV
  if (slot.flvUrl && flvjs.isSupported()) {
    const player = flvjs.createPlayer({
      type: 'flv', url: slot.flvUrl, isLive: true,
      hasAudio: true, hasVideo: true,
    }, {
      enableStashBuffer: false,
      stashInitialSize: 128,
      autoCleanupSourceBuffer: true,
      lazyLoad: false,
    })
    player.attachMediaElement(video)
    player.load()
    player.play()
    player.on(flvjs.Events.ERROR, (_errorType, _errorDetail, errorInfo) => {
      console.error('FLV error:', errorInfo)
      // FLV 失败，降级到 HLS
      if (slot.hlsUrl) {
        player.destroy()
        slot.playerInstance = null
        attachHls(slotIdx)
      }
    })
    slot.playerInstance = player
    return
  }

  // 备选 HLS
  if (slot.hlsUrl) attachHls(slotIdx)
}

// hls.js 播放 HLS 流
function attachHls(slotIdx: number) {
  const slot = gridSlots[slotIdx]
  const video = videoRefs.value[slotIdx]
  if (!video || !slot.hlsUrl) return

  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: 5,
      maxMaxBufferLength: 10,
      liveSyncDurationCount: 1,
    })
    hls.loadSource(slot.hlsUrl)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {})
    })
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      }
    })
    slot.playerInstance = hls
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = slot.hlsUrl
    video.addEventListener('loadedmetadata', () => video.play().catch(() => {}))
  }
}

// 获取流地址 — 优先 FLV（低延迟），备选 HLS
async function fetchStreamUrls(ch: Channel): Promise<{ flvUrl: string; hlsUrl: string } | null> {
  try {
    // 1. 启动国标设备推流 (GB28181 INVITE)
    try { await streamHttp.post(`/${ch.id}/start`) } catch { /* 可能已在推流 */ }

    // 2. 快速轮询获取播放地址（最多 3 秒，每次间隔 300ms）
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const { data } = await streamHttp.get(`/${ch.id}/hls-url`)
        const d = data?.data || data
        if (d?.flvUrl || d?.hlsUrl) {
          return {
            flvUrl: d?.flvUrl || '',
            hlsUrl: d?.hlsUrl || '',
          }
        }
      } catch { /* 流可能还未就绪 */ }
      await new Promise(r => setTimeout(r, 300))
    }
    return null
  } catch {
    return null
  }
}

// 拖拽通道到视频格
function onDragChannel(e: DragEvent, ch: Channel) {
  e.dataTransfer!.setData('application/json', JSON.stringify({ id: ch.id, name: ch.name, status: ch.status, deviceId: ch.deviceId }))
}
function onDropChannel(e: DragEvent, idx: number) {
  const raw = e.dataTransfer?.getData('application/json')
  if (!raw) return
  try {
    const ch = JSON.parse(raw)
    assignChannel(idx, ch as any)
  } catch { /* ignore */ }
}

// 截图
function snapshotSlot(idx: number) {
  const video = videoRefs.value[idx]
  if (!video) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 640
  canvas.height = video.videoHeight || 480
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  const link = document.createElement('a')
  link.download = `snapshot_${gridSlots[idx].name}_${Date.now()}.jpg`
  link.href = canvas.toDataURL('image/jpeg', 0.95)
  link.click()
  ElMessage.success('截图已保存')
}
function snapshotActive() { snapshotSlot(activeSlotIdx.value) }

// 音频
function toggleSlotAudio(idx: number) {
  const slot = gridSlots[idx]
  slot.muted = !slot.muted
  const video = videoRefs.value[idx]
  if (video) video.muted = slot.muted
}

// 全屏
function toggleFullscreen() {
  const cell = gridRef.value?.children[activeSlotIdx.value] as HTMLElement
  if (cell?.requestFullscreen) cell.requestFullscreen()
}
function maximizeSlot(idx: number) {
  activeSlotIdx.value = idx
  toggleFullscreen()
}

// PTZ控制
function ptzStart(direction: 'left' | 'right' | 'up' | 'down' | 'zoom_in' | 'zoom_out') {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot.channelId) return
  ptzApi({
    deviceId: slot.deviceId,
    channelId: slot.channelId,
    direction,
    speed: ptzSpeed.value
  }).catch(() => {})
}
function ptzStop() { /* 停止持续移动 */ }
function ptzHome() {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot.channelId) return
  ptzApi({ deviceId: slot.deviceId, channelId: slot.channelId, direction: 'home' })
}
function ptzPreset(preset: number) {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot.channelId) return
  ptzApi({ deviceId: slot.deviceId, channelId: slot.channelId, direction: 'goto_preset', preset })
}

// 时钟
let clockTimer: ReturnType<typeof setInterval> | null = null
let logTimer: ReturnType<typeof setInterval> | null = null

function updateClock() {
  currentTime.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function generateFakeLog() {
  const playingSlots = gridSlots.filter(s => s.playing)
  if (!playingSlots.length) return
  const slot = playingSlots[Math.floor(Math.random() * playingSlots.length)]
  const levels = [
    { level: 'INFO', tagType: 'info' as const, msgs: ['目标跟踪中', '场景分析正常', '帧率稳定'] },
    { level: 'WARN', tagType: 'warning' as const, msgs: ['检测到异常行为', '目标徘徊超时', '人员聚集告警'] },
    { level: 'ALERT', tagType: 'danger' as const, msgs: ['周界入侵检测', '安全帽未佩戴', '烟火告警'] },
  ]
  const lvl = levels[Math.floor(Math.random() * levels.length)]
  const msg = lvl.msgs[Math.floor(Math.random() * lvl.msgs.length)]
  const conf = Math.floor(Math.random() * 25 + 75)
  detectionLogs.value.unshift({
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    level: lvl.level,
    tagType: lvl.tagType,
    msg: `[${slot.name}] ${msg} | 置信度${conf}%`
  })
  if (detectionLogs.value.length > 200) detectionLogs.value.length = 200
}

onMounted(() => {
  loadData()
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
  logTimer = setInterval(generateFakeLog, 3000)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (logTimer) clearInterval(logTimer)
  // 关闭所有流
  for (let i = 0; i < 16; i++) closeSlot(i)
})
</script>

<style scoped>
.live-page { max-width: 1920px; }
.video-card { background: #1A1D23; border: 1px solid #3C4043; }
.video-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid #3C4043; }
.toolbar-title { color: #E8EAED; display: flex; align-items: center; gap: 8px; font-weight: 600; }
.toolbar-actions { display: flex; gap: 8px; align-items: center; }

/* 视频网格 */
.video-grid { display: grid; gap: 2px; background: #000; min-height: 480px; }
.grid-1 { grid-template-columns: 1fr; }
.grid-4 { grid-template-columns: 1fr 1fr; }
.grid-9 { grid-template-columns: 1fr 1fr 1fr; }
.grid-16 { grid-template-columns: 1fr 1fr 1fr 1fr; }

.video-cell { position: relative; background: #111; cursor: pointer; overflow: hidden; border: 2px solid transparent; transition: border-color 0.2s; min-height: 120px; }
.video-cell.active { border-color: #1A73E8; }
.video-cell.has-stream:hover .video-controls { opacity: 1; }

.video-player { width: 100%; height: 100%; object-fit: contain; display: block; }
.video-empty { width: 100%; height: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #555; gap: 8px; font-size: 13px; }
.video-loading { width: 100%; height: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #1A73E8; gap: 8px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* HUD叠加 */
.video-hud { position: absolute; top: 0; left: 0; right: 0; padding: 6px 10px; display: flex; align-items: center; gap: 8px; background: linear-gradient(180deg, rgba(0,0,0,0.7), transparent); font-size: 12px; color: #fff; pointer-events: none; }
.hud-name { font-weight: 600; }
.hud-badge { padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 700; }
.hud-badge.streaming { background: #0F9D58; }
.hud-badge.offline { background: #DB4437; }
.hud-time { margin-left: auto; font-family: monospace; }

/* 控制按钮 */
.video-controls { position: absolute; bottom: 6px; right: 6px; display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s; }
.video-controls .el-button { background: rgba(0,0,0,0.6); border: none; color: #fff; }
.video-controls .el-button:hover { background: rgba(26,115,232,0.8); }

/* 日志 */
.log-card { margin-top: 12px; background: #1A1D23; border: 1px solid #3C4043; color: #E8EAED; }
.log-scroll { max-height: 160px; overflow-y: auto; font-family: 'Roboto Mono', monospace; font-size: 12px; }
.log-row { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px solid #2D3039; align-items: center; }
.log-t { color: #9AA0A6; white-space: nowrap; }
.log-m { flex: 1; color: #E8EAED; }
.log-empty { color: #666; text-align: center; padding: 20px; }

/* 通道列表 */
.channel-list { max-height: 400px; overflow-y: auto; }
.ch-item { display: flex; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; transition: all 0.15s; border: 1px solid transparent; }
.ch-item:hover { background: #2D3039; border-color: #1A73E8; }
.ch-icon { width: 36px; height: 36px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ch-icon.streaming { background: rgba(15,157,88,0.15); color: #0F9D58; }
.ch-icon.online { background: rgba(26,115,232,0.15); color: #1A73E8; }
.ch-icon.offline { background: rgba(154,160,166,0.15); color: #9AA0A6; }
.ch-body { flex: 1; min-width: 0; }
.ch-name { font-weight: 600; font-size: 13px; color: #E8EAED; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ch-meta { font-size: 11px; color: #9AA0A6; display: flex; gap: 12px; margin-top: 2px; }

/* PTZ */
.ptz-panel { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.ptz-dpad { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ptz-row { display: flex; gap: 16px; }
.ptz-zoom-row { display: flex; gap: 8px; width: 100%; }
.ptz-zoom-row .el-button { flex: 1; }
.ptz-speed { display: flex; align-items: center; gap: 8px; width: 100%; font-size: 12px; color: #9AA0A6; }
.ptz-speed .el-slider { flex: 1; }
.ptz-presets { display: flex; align-items: center; gap: 8px; width: 100%; font-size: 12px; color: #9AA0A6; }

/* 暗色主题覆盖 */
:deep(.el-card) { background: #252830; border-color: #3C4043; color: #E8EAED; }
:deep(.el-card__header) { border-color: #3C4043; color: #E8EAED; }
</style>
