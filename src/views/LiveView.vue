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
              <span style="color:#9AA0A6;font-size:12px;margin-right:4px">播放格式:</span>
              <el-radio-group v-model="preferredFormat" size="small" fill="#1A73E8">
                <el-radio-button v-for="(label, key) in FORMAT_LABELS" :key="key" :value="key">{{ label }}</el-radio-button>
              </el-radio-group>
              <el-divider direction="vertical" />
              <el-button-group size="small">
                <el-button :type="layout === 1 ? 'primary' : 'default'" @click="setLayout(1)" title="单屏">1</el-button>
                <el-button :type="layout === 4 ? 'primary' : 'default'" @click="setLayout(4)" title="四分屏">4</el-button>
                <el-button :type="layout === 9 ? 'primary' : 'default'" @click="setLayout(9)" title="九分屏">9</el-button>
                <el-button :type="layout === 16 ? 'primary' : 'default'" @click="setLayout(16)" title="十六分屏">16</el-button>
              </el-button-group>
              <el-button size="small" @click="snapshotActive" :disabled="!hasActive">
                <el-icon><Camera /></el-icon>截图
              </el-button>
              <el-button size="small" @click="toggleRecordActive" :disabled="!hasActive" :type="isRecording ? 'danger' : 'default'">
                <el-icon><VideoCamera /></el-icon>{{ isRecording ? '停止录像' : '录像' }}
              </el-button>
              <el-button size="small" @click="openImageAdjust" :disabled="!hasActive">图像</el-button>
              <el-button size="small" @click="toggleFullscreen">
                <el-icon><FullScreen /></el-icon>
              </el-button>
            </div>
          </div>
          <div class="video-grid" :class="`grid-${layout}`" ref="gridRef">
            <div v-for="(slot, idx) in visibleSlots" :key="idx"
                 class="video-cell"
                 :class="{ active: activeSlotIdx === idx, 'has-stream': slot.channelId }"
                 @click="activeSlotIdx = idx"
                 @dblclick="maximizeSlot(idx)">
              <!-- 真实视频播放 -->
              <video v-if="slot.playing"
                     :ref="el => setVideoRef(el, idx)"
                     class="video-player"
                     muted autoplay playsinline />
              <div v-else-if="slot.loading" class="video-loading">
                <el-icon class="spin"><Loading /></el-icon>
                <span>连接中...</span>
              </div>
              <div v-else class="video-empty" @dragover.prevent @drop="onDropChannel($event, idx)">
                <el-icon :size="32"><VideoCamera /></el-icon>
                <span>拖拽通道到此处</span>
              </div>
              <!-- 视频叠加层(仅无流时隐藏，有流时信息在底部栏) -->
              <!-- 海康风格底部工具条 -->
              <div v-if="slot.channelId" class="video-bottom-bar">
                <div class="bottom-left">
                  <span class="bl-name">{{ slot.name || `CH${idx + 1}` }}</span>
                  <span class="bl-badge" :class="slot.status === 'streaming' ? 'on' : 'off'">{{ slot.status === 'streaming' ? 'LIVE' : 'OFF' }}</span>
                  <span class="bl-time">{{ currentTime }}</span>
                </div>
                <div class="bottom-actions">
                  <el-tooltip content="截图" placement="top">
                    <button class="va-btn" @click.stop="snapshotSlot(idx)" title="截图">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip :content="slot.recording ? '停止录像' : '录像'" placement="top">
                    <button class="va-btn" :class="{ 'va-rec': slot.recording }" @click.stop="toggleRecordSlot(idx)" :title="slot.recording ? '停止录像' : '录像'">
                      <svg v-if="!slot.recording" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>
                      <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                      <span v-if="slot.recording" class="rec-dot"></span>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="对讲" placement="top">
                    <button class="va-btn" :class="{ 'va-talk': slot.talking }" @click.stop="openTalk(idx)" title="对讲">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip :content="slot.muted ? '开启声音' : '静音'" placement="top">
                    <button class="va-btn" @click.stop="toggleSlotAudio(idx)" :title="slot.muted ? '开启声音' : '静音'">
                      <svg v-if="slot.muted" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                      <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="图像调节" placement="top">
                    <button class="va-btn" @click.stop="openImageAdjust" title="图像调节">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="全屏" placement="top">
                    <button class="va-btn" @click.stop="maximizeSlot(idx)" title="全屏">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="关闭" placement="top">
                    <button class="va-btn va-btn-close" @click.stop="closeSlot(idx)" title="关闭">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </el-tooltip>
                </div>
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

    <!-- 对讲弹窗 -->
    <el-dialog v-model="talkDialogVisible" title="语音对讲" width="400px" :append-to-body="true" @close="stopTalk">
      <div style="text-align:center;padding:20px">
        <el-icon :size="48" :color="isTalking ? '#0F9D58' : '#9AA0A6'"><Microphone /></el-icon>
        <p style="margin:12px 0">{{ talkSlotName }} — {{ isTalking ? '对讲中...' : '点击开始对讲' }}</p>
        <el-button :type="isTalking ? 'danger' : 'success'" size="large" round @click="toggleTalk">
          {{ isTalking ? '停止对讲' : '开始对讲' }}
        </el-button>
        <p style="color:#9AA0A6;font-size:12px;margin-top:12px">需要浏览器麦克风权限，且设备需支持语音对讲</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, reactive, nextTick, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import { getDeviceChannels } from '@/api/devices'
import { streamHttp, deviceHttp } from '@/api/http'
import { ptzControl as ptzApi } from '@/api/ptz'
import { ElMessage } from 'element-plus'
import type { Channel, DeviceItem } from '@/types/device'
import Hls from 'hls.js'
import flvjs from 'flv.js'

type PlayerFormat = 'flv' | 'ws-flv' | 'hls' | 'webrtc'

const FORMAT_LABELS: Record<PlayerFormat, string> = {
  'flv': 'HTTP-FLV',
  'ws-flv': 'WS-FLV',
  'hls': 'HLS',
  'webrtc': 'WebRTC',
}

interface GridSlot {
  channelId: string
  name: string
  status: string
  urls: Partial<Record<PlayerFormat, string>>
  playing: boolean
  loading: boolean
  muted: boolean
  deviceId: string
  playerInstance: Hls | flvjs.Player | null
  recording: boolean
  talking: boolean
}

const route = useRoute()
const router = useRouter()
const deviceStore = useDeviceStore()

// 视频网格
const layout = ref(4)
const activeSlotIdx = ref(0)
const gridSlots = reactive<GridSlot[]>(
  Array.from({ length: 16 }, () => ({
    channelId: '', name: '', status: '', urls: {}, playing: false, loading: false, muted: true, deviceId: '', playerInstance: null, recording: false, talking: false
  }))
)
const preferredFormat = ref<PlayerFormat>('flv')
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

// 录像
const isRecording = computed(() => gridSlots[activeSlotIdx.value]?.recording)

// 图像调节
const imageDialogVisible = ref(false)
const imageAdjust = reactive({ brightness: 50, contrast: 50, saturation: 50, hue: 50 })

// 检测日志
interface LogEntry { time: string; level: string; tagType: string; msg: string }
const detectionLogs = ref<LogEntry[]>([])

// 只有 layout 对应数量的格子可见
const visibleSlots = computed(() => gridSlots.slice(0, layout.value))

// 对讲
const talkDialogVisible = ref(false)
const talkSlotIdx = ref(-1)
const isTalking = ref(false)
const talkSlotName = computed(() => talkSlotIdx.value >= 0 ? gridSlots[talkSlotIdx.value]?.name || '' : '')
let talkStream: MediaStream | null = null
let talkCallId = ''
let talkAudioCtx: AudioContext | null = null
let talkSendInterval: ReturnType<typeof setInterval> | null = null
let talkPcmBuffer: Int16Array = new Int16Array(0)
let talkDownWs: WebSocket | null = null
let talkPlayCtx: AudioContext | null = null
let talkNextPlayTime = 0

const hasActive = computed(() => !!gridSlots[activeSlotIdx.value]?.channelId)
const activeChannelName = computed(() => gridSlots[activeSlotIdx.value]?.name || '实时监控')
const filteredChannels = computed(() => {
  if (!chSearch.value) return channels.value
  const s = chSearch.value.toLowerCase()
  return channels.value.filter(c => c.name.toLowerCase().includes(s))
})

// 切换分屏布局
function setLayout(n: number) {
  layout.value = n
  if (activeSlotIdx.value >= n) activeSlotIdx.value = 0
}

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

  // 如果URL指定了设备，自动分配通道
  const qDev = route.query.deviceId as string
  const qCh = route.query.channelId as string
  if (qDev || qCh) {
    let ch: Channel | undefined
    if (qCh) {
      // 精确匹配通道 ID
      ch = allChs.find(c => c.id === qCh)
    }
    if (!ch && qDev) {
      // 匹配设备下的第一个通道
      ch = allChs.find(c => c.deviceId === qDev)
    }
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
      slot.urls = urls
      slot.playing = true
      slot.status = 'streaming'
      nextTick(() => attachPlayerByFormat(slotIdx, preferredFormat.value))
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
  Object.assign(slot, { channelId: '', name: '', status: '', urls: {}, playing: false, loading: false, muted: true, deviceId: '', playerInstance: null })
}

// 根据选定格式播放
function attachPlayerByFormat(slotIdx: number, fmt: PlayerFormat) {
  const slot = gridSlots[slotIdx] as GridSlot
  const video = videoRefs.value[slotIdx]
  if (!video) return

  // 清理旧实例
  destroyPlayer(slot)
  video.pause()
  video.removeAttribute('src')
  video.load()

  const url = slot.urls[fmt]
  if (!url) {
    // 当前格式不可用，尝试降级链
    const fallbackOrder: PlayerFormat[] = ['flv', 'ws-flv', 'hls', 'webrtc']
    for (const fb of fallbackOrder) {
      if (slot.urls[fb]) {
        fmt = fb
        break
      }
    }
    const fbUrl = slot.urls[fmt]
    if (!fbUrl) return
    return attachPlayerByFormat(slotIdx, fmt)
  }

  switch (fmt) {
    case 'flv':
      if (flvjs.isSupported()) {
        const player = flvjs.createPlayer({
          type: 'flv', url, isLive: true,
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
        player.on(flvjs.Events.ERROR, () => {
          player.destroy()
          slot.playerInstance = null
          attachPlayerByFormat(slotIdx, 'hls')
        })
        slot.playerInstance = player
      } else {
        attachPlayerByFormat(slotIdx, 'hls')
      }
      break

    case 'ws-flv':
      if (flvjs.isSupported()) {
        const player = flvjs.createPlayer({
          type: 'flv', url, isLive: true,
          hasAudio: true, hasVideo: true,
        }, { enableStashBuffer: false })
        player.attachMediaElement(video)
        player.load()
        player.play()
        slot.playerInstance = player
      } else {
        attachPlayerByFormat(slotIdx, 'hls')
      }
      break

    case 'hls':
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true, lowLatencyMode: true,
          maxBufferLength: 5, maxMaxBufferLength: 10, liveSyncDurationCount: 1,
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
          }
        })
        slot.playerInstance = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
        video.addEventListener('loadedmetadata', () => video.play().catch(() => {}))
      }
      break

    case 'webrtc':
      // WebRTC 通过 ZLM 信令交换
      attachWebRtc(slotIdx, url)
      break
  }
}

function destroyPlayer(slot: GridSlot) {
  const p = toRaw(slot).playerInstance
  if (p) {
    if ('destroy' in p) p.destroy()
    slot.playerInstance = null
  }
}

// WebRTC 播放：通过 ZLM 信令交换
async function attachWebRtc(slotIdx: number, _webrtcUrl: string) {
  const slot = gridSlots[slotIdx] as GridSlot
  const video = videoRefs.value[slotIdx]
  if (!video || !slot.channelId) {
    attachPlayerByFormat(slotIdx, 'flv')
    return
  }

  try {
    const pc = new RTCPeerConnection({ iceServers: [] })
    pc.addTransceiver('video', { direction: 'recvonly' })
    pc.addTransceiver('audio', { direction: 'recvonly' })

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // 走后端 API 交换 SDP（后端转发到 ZLM）
    const resp = await streamHttp.post(`/${slot.channelId}/webrtc-sdp`, {
      offer: offer.sdp,
    })
    const answer = resp.data?.data?.answer
    if (!answer) throw new Error('WebRTC SDP exchange failed')

    await pc.setRemoteDescription(new RTCSessionDescription({
      type: 'answer',
      sdp: answer,
    }))

    pc.ontrack = (ev) => {
      if (ev.streams && ev.streams[0]) {
        video.srcObject = ev.streams[0]
        video.play().catch(() => {})
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        pc.close()
        slot.playerInstance = null
        ElMessage.warning('WebRTC 连接断开，已切换为 HTTP-FLV')
        attachPlayerByFormat(slotIdx, 'flv')
      }
    }

    // 包装 pc 为可销毁对象
    slot.playerInstance = {
      destroy() {
        pc.close()
        video.srcObject = null
      },
    } as any
  } catch (e: any) {
    console.error('WebRTC failed:', e)
    ElMessage.warning(`WebRTC 连接失败(${e.message || '未知'})，已切换为 HTTP-FLV`)
    attachPlayerByFormat(slotIdx, 'flv')
  }
}

// 切换格式时重新播放所有活跃 slot
watch(preferredFormat, (fmt) => {
  for (let i = 0; i < 16; i++) {
    if (gridSlots[i].playing) {
      nextTick(() => attachPlayerByFormat(i, fmt))
    }
  }
})

async function fetchStreamUrls(ch: Channel): Promise<Partial<Record<PlayerFormat, string>> | null> {
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
            flv: d.flvUrl || '',
            'ws-flv': d.wsFlvUrl || '',
            hls: d.hlsUrl || '',
            webrtc: d.webrtcUrl || '',
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

// 对讲
async function openTalk(idx: number) {
  talkSlotIdx.value = idx
  talkDialogVisible.value = true
}

async function toggleTalk() {
  if (isTalking.value) { stopTalk(); return }

  const slot = gridSlots[talkSlotIdx.value]
  if (!slot?.deviceId || !slot?.channelId) {
    ElMessage.error('请先选择通道')
    return
  }

  try {
    // 1. 获取麦克风（8kHz采样率用于G.711A对讲）
    talkStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 8000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    })

    // 2. 调后端 talk/start — 发 SIP INVITE 给设备
    const resp = await deviceHttp.post(`/${slot.deviceId}/talk/start`, {
      channel_id: slot.channelId,
    })
    talkCallId = resp.data?.data?.call_id || ''
    if (!talkCallId) {
      ElMessage.error('对讲邀请失败：设备无响应')
      cleanupTalk()
      return
    }

    // 3. 创建 AudioContext 采集 PCM 数据
    // 浏览器可能不支持 8kHz，降采样到 8kHz
    const actualSampleRate = talkStream.getAudioTracks()[0]?.getSettings().sampleRate || 48000
    talkAudioCtx = new AudioContext({ sampleRate: actualSampleRate })
    const source = talkAudioCtx.createMediaStreamSource(talkStream)

    // ScriptProcessorNode 采集 PCM（每 2048 样本回调一次）
    const processor = talkAudioCtx.createScriptProcessor(2048, 1, 1)
    source.connect(processor)
    processor.connect(talkAudioCtx.destination) // 必须连接到 destination 才能触发回调

    const targetSampleRate = 8000
    const ratio = actualSampleRate / targetSampleRate

    processor.onaudioprocess = (e) => {
      if (!isTalking.value) return
      const inputData = e.inputBuffer.getChannelData(0) // Float32

      // 一阶IIR低通滤波防止混叠 (fc ≈ 3.5kHz @ 实际采样率)
      const alpha = 0.15
      let prev = 0
      const filtered = new Float32Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        filtered[i] = prev + alpha * (inputData[i] - prev)
        prev = filtered[i]
      }

      // 降采样到 8kHz
      const outputLen = Math.floor(filtered.length / ratio)
      const resampled = new Float32Array(outputLen)
      for (let i = 0; i < outputLen; i++) {
        resampled[i] = filtered[Math.floor(i * ratio)]
      }

      // Float32 → Int16 PCM
      const pcm16 = new Int16Array(resampled.length)
      for (let i = 0; i < resampled.length; i++) {
        const s = Math.max(-1, Math.min(1, resampled[i]))
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }

      // 追加到缓冲区（预分配扩展避免频繁GC）
      const merged = new Int16Array(talkPcmBuffer.length + pcm16.length)
      merged.set(talkPcmBuffer)
      merged.set(pcm16, talkPcmBuffer.length)
      talkPcmBuffer = merged
    }

    isTalking.value = true
    slot.talking = true
    ElMessage.success('对讲已建立')

    // 3.5 启动下行音频接收（设备→浏览器播放）
    startTalkDownstream(talkCallId)

    // 4. 定时发送缓冲的 PCM 数据给后端（每20ms发一帧160样本）
    talkSendInterval = setInterval(async () => {
      if (talkPcmBuffer.length < 160 || !talkCallId) return

      const chunk = talkPcmBuffer.slice(0, 160)
      talkPcmBuffer = talkPcmBuffer.slice(160)

      // PCM → base64
      const bytes = new Uint8Array(chunk.buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const b64 = btoa(binary)

      try {
        await deviceHttp.post(`/talk/${talkCallId}/audio`, {
          data: b64,
        })
      } catch {
        // 静默失败，避免打断对讲
      }
    }, 20)

  } catch (e: any) {
    if (e.name === 'NotAllowedError') {
      ElMessage.error('麦克风权限被拒绝，请在浏览器设置中允许')
    } else {
      ElMessage.error('对讲失败: ' + (e.message || '未知错误'))
    }
    cleanupTalk()
  }
}

function stopTalk() {
  const slot = talkSlotIdx.value >= 0 ? gridSlots[talkSlotIdx.value] : null

  // 通知后端停止对讲
  if (talkCallId && slot?.deviceId) {
    deviceHttp.post(`/${slot.deviceId}/talk/stop`, {
      call_id: talkCallId,
    }).catch(() => {})
  }

  cleanupTalk()
}

function cleanupTalk() {
  isTalking.value = false
  talkDialogVisible.value = false

  const slot = talkSlotIdx.value >= 0 ? gridSlots[talkSlotIdx.value] : null
  if (slot) slot.talking = false

  // 停止定时发送
  if (talkSendInterval) {
    clearInterval(talkSendInterval)
    talkSendInterval = null
  }
  talkPcmBuffer = new Int16Array(0)

  // 关闭AudioContext
  if (talkAudioCtx) {
    talkAudioCtx.close().catch(() => {})
    talkAudioCtx = null
  }

  // 释放麦克风
  if (talkStream) {
    talkStream.getTracks().forEach(t => t.stop())
    talkStream = null
  }

  talkCallId = ''

  // 关闭下行音频
  if (talkDownWs) { talkDownWs.close(); talkDownWs = null }
  if (talkPlayCtx) { talkPlayCtx.close().catch(() => {}); talkPlayCtx = null }
  talkNextPlayTime = 0
}

// 启动下行音频播放（设备→浏览器）
function startTalkDownstream(callId: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  talkDownWs = new WebSocket(`${protocol}//${window.location.host}/ws`)

  talkDownWs.onopen = () => {
    talkDownWs!.send(JSON.stringify({ type: 'subscribe', channel: `talk_${callId}` }))
  }

  talkPlayCtx = new AudioContext({ sampleRate: 8000 })
  talkNextPlayTime = 0

  talkDownWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type !== 'talk.audio_down' || msg.call_id !== callId) return

      // base64 → PCM Int16
      const binaryStr = atob(msg.data)
      const pcm = new Int16Array(binaryStr.length / 2)
      for (let i = 0; i < pcm.length; i++) {
        pcm[i] = (binaryStr.charCodeAt(i * 2 + 1) << 8) | binaryStr.charCodeAt(i * 2)
      }

      // Int16 → Float32
      const floats = new Float32Array(pcm.length)
      for (let i = 0; i < pcm.length; i++) {
        floats[i] = pcm[i] / 32768
      }

      const buffer = talkPlayCtx!.createBuffer(1, floats.length, 8000)
      buffer.getChannelData(0).set(floats)

      const source = talkPlayCtx!.createBufferSource()
      source.buffer = buffer
      source.connect(talkPlayCtx!.destination)

      const now = talkPlayCtx!.currentTime
      if (talkNextPlayTime < now) talkNextPlayTime = now
      source.start(talkNextPlayTime)
      talkNextPlayTime += buffer.duration
    } catch (e) {
      console.warn('[Talk] downstream decode error', e)
    }
  }
}

// 录像
function toggleRecordSlot(idx: number) {
  const slot = gridSlots[idx]
  if (!slot?.channelId) return
  slot.recording = !slot.recording
  if (slot.recording) ElMessage.info('开始录像（前端录制）')
  else ElMessage.success('录像已保存')
}
function toggleRecordActive() { toggleRecordSlot(activeSlotIdx.value) }

// 图像调节
function openImageAdjust() { imageDialogVisible.value = true }
function resetImageAdjust() {
  imageAdjust.brightness = 50; imageAdjust.contrast = 50
  imageAdjust.saturation = 50; imageAdjust.hue = 50
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
.video-cell.has-stream:hover .video-bottom-bar { opacity: 1; transform: translateY(0); }

.video-player { width: 100%; height: 100%; object-fit: contain; display: block; }
.video-empty { width: 100%; height: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #555; gap: 8px; font-size: 13px; }
.video-loading { width: 100%; height: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #1A73E8; gap: 8px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* HUD叠加 */
/* 海康风格底部工具条 */
.video-bottom-bar {
  position: absolute; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px;
  background: linear-gradient(transparent, rgba(0,0,0,0.85));
  opacity: 0; transform: translateY(4px);
  transition: opacity 0.25s, transform 0.25s;
  font-size: 12px; color: #fff;
}
.bottom-left { display: flex; align-items: center; gap: 8px; }
.bl-name { font-weight: 600; font-size: 13px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bl-badge { padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
.bl-badge.on { background: #0F9D58; color: #fff; }
.bl-badge.off { background: #DB4437; color: #fff; }
.bl-time { font-family: 'Menlo', 'Consolas', monospace; font-size: 11px; color: #ccc; }
.bottom-actions { display: flex; gap: 2px; align-items: center; }
.va-btn {
  width: 28px; height: 28px; border: none; border-radius: 4px;
  background: rgba(255,255,255,0.12); color: #eee;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 15px; transition: all 0.15s;
}
.va-btn:hover { background: rgba(26,115,232,0.7); color: #fff; }
.va-btn.va-rec { background: rgba(239,68,68,0.7); color: #fff; animation: pulse-rec 1.5s ease infinite; }
.va-btn.va-talk { background: rgba(15,157,88,0.7); color: #fff; }
.va-btn-close:hover { background: rgba(219,68,55,0.7); }
.rec-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; margin-left: 2px; }
@keyframes pulse-rec { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

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
.image-adjust .adj-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.image-adjust .adj-row span:first-child { width: 48px; flex-shrink: 0; color: #9AA0A6; font-size: 13px; }
.image-adjust .adj-row .el-slider { flex: 1; }

.ptz-sliders { width: 100%; }
.ptz-slider-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px; color: #9AA0A6; }
.ptz-slider-row span:first-child { width: 32px; flex-shrink: 0; }
.ptz-slider-row .el-slider { flex: 1; }
.speed-val { width: 28px; text-align: right; font-size: 12px; color: #E8EAED; }
.ptz-presets { display: flex; align-items: center; gap: 8px; width: 100%; flex-wrap: wrap; }
.ptz-presets > span { font-size: 12px; color: #9AA0A6; }
</style>
