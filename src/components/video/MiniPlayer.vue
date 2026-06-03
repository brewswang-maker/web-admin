<template>
  <div class="mini-player" :style="{ aspectRatio }">
    <video
      ref="videoRef"
      muted
      autoplay
      playsinline
      style="width:100%;height:100%;object-fit:contain;background:#000;border-radius:6px"
    />
    <!-- Loading -->
    <div v-if="loading" class="mini-player__overlay">
      <el-icon class="is-loading" :size="28"><Loading /></el-icon>
      <span class="mini-player__hint">等待流...</span>
    </div>
    <!-- Error -->
    <div v-if="errorMsg" class="mini-player__overlay mini-player__error">
      <span>{{ errorMsg }}</span>
    </div>
    <!-- LIVE badge -->
    <div v-if="playing && !loading" class="mini-player__live-badge">
      <span class="mini-player__live-dot" />
      <span>LIVE</span>
    </div>
    <!-- Controls -->
    <div v-if="showControls && playing" class="mini-player__controls">
      <el-button size="small" text @click="takeSnapshot">📸 截图</el-button>
      <el-button size="small" text @click="toggleMute">{{ muted ? '🔊 开声' : '🔇 静音' }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * MiniPlayer.vue — 独立可复用迷你视频播放器
 *
 * 从 LiveView.vue 抽取核心播放逻辑，用于告警弹窗等场景。
 * 自管理 flv.js / HLS 实例的创建与销毁。
 */
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import Hls from 'hls.js'
import flvjs from 'flv.js'
import { streamHttp } from '@/api/http'

type PlayerFormat = 'flv' | 'ws-flv' | 'hls' | 'webrtc'

const DEGRADATION_CHAINS: Record<string, PlayerFormat[]> = {
  h264: ['flv', 'ws-flv', 'webrtc', 'hls'],
  h265: ['hls', 'webrtc'],
}

const props = withDefaults(defineProps<{
  channelId: string
  autoPlay?: boolean
  muted?: boolean
  aspectRatio?: string
  showControls?: boolean
  /** 跳过 /start 调用（流已在推时使用，如浮窗预览） */
  skipStartApi?: boolean
}>(), {
  autoPlay: true,
  muted: true,
  aspectRatio: '16:9',
  showControls: false,
  skipStartApi: false,
})

const emit = defineEmits<{
  playing: []
  error: [msg: string]
  snapshot: [blob: Blob]
}>()

const videoRef = ref<HTMLVideoElement>()
const loading = ref(false)
const playing = ref(false)
const errorMsg = ref('')
const muted = ref(props.muted)

let playerInstance: Hls | flvjs.Player | null = null
let currentFormat: PlayerFormat | '' = ''
let codec = ''

// ── 播放器销毁 ──
function destroyPlayer() {
  if (playerInstance) {
    try {
      if ('destroy' in playerInstance) playerInstance.destroy()
    } catch { /* ignore */ }
    playerInstance = null
  }
  const video = videoRef.value
  if (video) {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  currentFormat = ''
  playing.value = false
}

// ── 获取流 URL ──
async function fetchStreamUrls(chId: string): Promise<{ urls: Partial<Record<PlayerFormat, string>>, codec: string } | null> {
  try {
    let startData: any = null
    let c = ''
    // skipStartApi=true 时跳过 /start 调用（流已在推）
    if (!props.skipStartApi) {
      try {
        const { data: startResp } = await streamHttp.post(`/${chId}/start`)
        startData = startResp?.data || startResp
      } catch { /* 可能已在推流 */ }
    }

    if (startData && (startData.flvUrl || startData.webrtcUrl) && startData.zlmReady) {
      c = startData.codec || ''
      return {
        urls: {
          flv: startData.flvUrl || '',
          webrtc: startData.webrtcUrl || '',
          'ws-flv': startData.wsFlvUrl || '',
          hls: startData.hlsUrl || '',
        },
        codec: c,
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { data } = await streamHttp.get(`/${chId}/multi-urls`)
        const d = data?.data || data
        if (d?.flvUrl || d?.webrtcUrl || d?.hlsUrl) {
          return {
            urls: { flv: d.flvUrl || '', webrtc: d.webrtcUrl || '', 'ws-flv': d.wsFlvUrl || '', hls: d.hlsUrl || '' },
            codec: d.codec || '',
          }
        }
      } catch { /* */ }
      await new Promise(r => setTimeout(r, 100))
    }
    return null
  } catch {
    return null
  }
}

// ── 选择最佳格式 ──
function selectBestFormat(urls: Partial<Record<PlayerFormat, string>>): PlayerFormat | null {
  const isH265 = codec && (codec.toUpperCase().includes('H265') || codec.toUpperCase().includes('HEVC'))
  const chain = isH265 ? DEGRADATION_CHAINS.h265 : DEGRADATION_CHAINS.h264
  for (const fmt of chain) {
    if (urls[fmt]) return fmt
  }
  return null
}

// ── 按格式播放 ──
function attachPlayer(video: HTMLVideoElement, fmt: PlayerFormat, url: string) {
  destroyPlayer()
  currentFormat = fmt

  switch (fmt) {
    case 'flv':
    case 'ws-flv':
      if (flvjs.isSupported()) {
        const player = flvjs.createPlayer({
          type: 'flv', url, isLive: true, hasAudio: false, hasVideo: true,
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
        const p = player.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
        playerInstance = player
      }
      break

    case 'hls':
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 2,
          liveDurationInfinity: true,
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const p = video.play()
          if (p && typeof p.catch === 'function') p.catch(() => {})
        })
        playerInstance = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
        const p = video.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      }
      break

    case 'webrtc': {
      // 简化 WebRTC：直接设置 src 为 HTTP-FLV/WebSocket URL
      // 完整 WebRTC 需要 SDP 交换，这里 fallback 到 HLS
      errorMsg.value = 'WebRTC 暂不支持弹窗播放'
      emit('error', 'WebRTC not supported in mini player')
      return
    }
  }
}

// ── 启动播放 ──
async function startPlay() {
  if (!props.channelId) return
  const video = videoRef.value
  if (!video) return

  loading.value = true
  errorMsg.value = ''

  const result = await fetchStreamUrls(props.channelId)
  loading.value = false

  if (!result || !result.urls) {
    errorMsg.value = '视频流获取失败'
    emit('error', '无法获取视频流')
    return
  }

  codec = result.codec || ''
  const fmt = selectBestFormat(result.urls)
  if (!fmt || !result.urls[fmt]) {
    errorMsg.value = '无可用播放格式'
    emit('error', '无可用播放格式')
    return
  }

  attachPlayer(video, fmt, result.urls[fmt]!)
  playing.value = true
  emit('playing')
}

// ── 截图 ──
function takeSnapshot() {
  const video = videoRef.value
  if (!video) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 640
  canvas.height = video.videoHeight || 480
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  canvas.toBlob((blob) => {
    if (blob) emit('snapshot', blob)
  }, 'image/jpeg', 0.95)
}

function toggleMute() {
  muted.value = !muted.value
  if (videoRef.value) videoRef.value.muted = muted.value
}

// ── 监听 channelId 变化 ──
watch(() => props.channelId, (newId) => {
  destroyPlayer()
  if (newId && props.autoPlay) {
    nextTick(() => startPlay())
  }
}, { immediate: true })

onBeforeUnmount(() => {
  destroyPlayer()
})
</script>

<style scoped>
.mini-player {
  position: relative;
  width: 100%;
  background: #000;
  border-radius: 6px;
  overflow: hidden;
}
.mini-player__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #8b8fa3;
  font-size: 13px;
}
.mini-player__error {
  color: #f56c6c;
}
.mini-player__hint {
  font-size: 12px;
}
.mini-player__live-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  border-radius: 4px;
}
.mini-player__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: #fff;
  animation: live-blink 1s ease-in-out infinite;
}
@keyframes live-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.mini-player__controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 4px;
  background: linear-gradient(transparent, rgba(0,0,0,0.6));
}
</style>
