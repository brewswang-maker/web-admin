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
    <!-- Error + Retry -->
    <div v-if="errorMsg" class="mini-player__overlay mini-player__error">
      <span>{{ errorMsg }}</span>
      <el-button size="small" type="primary" @click="retryPlay" style="margin-top:8px">🔄 重试</el-button>
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
import { normalizeStreamUrl, normalizeWsFlvUrl } from '@/utils/streamUrl'
import { useChannelStore } from '@/stores/channel'

type PlayerFormat = 'flv' | 'ws-flv' | 'hls' | 'webrtc'

const DEGRADATION_CHAINS: Record<string, PlayerFormat[]> = {
  h264: ['flv', 'ws-flv', 'webrtc', 'hls'],
  h265: ['hls', 'webrtc'],
}

const props = withDefaults(defineProps<{
  channelId: string
  /** 直接 URL 播放（证据回放 / 已知流地址），跳过 fetchStreamUrls */
  src?: string
  autoPlay?: boolean
  muted?: boolean
  aspectRatio?: string
  showControls?: boolean
  /** 跳过 /start 调用（流已在推时使用，如浮窗预览） */
  skipStartApi?: boolean
  /** 码流类型: 'main' (高清) 或 'sub' (子码流, 低分辨率) */
  streamType?: 'main' | 'sub'
  /** 组件是否可见 (v-show 场景下控制是否启动流) */
  visible?: boolean
}>(), {
  autoPlay: true,
  muted: true,
  aspectRatio: '16:9',
  showControls: false,
  skipStartApi: false,
  streamType: 'main',
  visible: true,
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
let currentUrls: Partial<Record<PlayerFormat, string>> = {}  // P0-1.2: WebRTC 降级用

// ── 播放器销毁 ──
function destroyPlayer() {
  destroyWebRtc()  // P0-1.2: 清理 WebRTC 连接
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
// [一次性设计修正 2026-06-23] 增加 forceSkipStart 参数：防抖窗口内跳过 /start
//   原因：startPlay() 中的防抖逻辑只记录日志但不 return，fetchStreamUrls 内部
//   仍然调 /start → 多个 MiniPlayer 实例（AlarmPopup + FloatingPreview）同时
//   对同一 channelId 发起 SIP INVITE → 设备 INVITE 冲突 → 流重建死循环
async function fetchStreamUrls(
  chId: string,
  forceSkipStart = false,
): Promise<{ urls: Partial<Record<PlayerFormat, string>>, codec: string } | null> {
  // URL 规范化辅助：将后端返回的绝对 URL 转为相对路径走 Vite 代理
  const norm = (u: string, isWs = false) =>
    isWs ? normalizeWsFlvUrl(u) : normalizeStreamUrl(u)

  // [STABILITY-FIX 2026-07-29] 提取 multi-urls 查询为可复用函数
  const queryMultiUrls = async (): Promise<{ urls: Partial<Record<PlayerFormat, string>>, codec: string } | null> => {
    try {
      const { data } = await streamHttp.get(`/${chId}/multi-urls`)
      const d = data?.data || data
      if (d?.streamAlive && (d?.flvUrl || d?.webrtcUrl || d?.hlsUrl)) {
        return {
          urls: {
            flv: norm(d.flvUrl || ''),
            webrtc: norm(d.webrtcUrl || ''),
            'ws-flv': norm(d.wsFlvUrl || '', true),
            hls: norm(d.hlsUrl || ''),
          },
          codec: d.codec || '',
        }
      }
    } catch { /* */ }
    return null
  }

  try {
    // [STABILITY-FIX 2026-07-29] 统一轮询策略：
    //   - forceSkipStart=true（防抖窗口内）: 15×300ms = 4.5s, 等待其他播放器的 INVITE 完成
    //   - 普通模式: 8×300ms = 2.4s, 复用已有流
    //   - 新增 consecutiveNotAlive 快速失败（5次 streamAlive=false 终止）
    const initialAttempts = forceSkipStart ? 15 : 8
    let consecutiveNotAlive = 0
    for (let attempt = 0; attempt < initialAttempts; attempt++) {
      const result = await queryMultiUrls()
      if (result) return result
      consecutiveNotAlive++
      if (consecutiveNotAlive >= 5 && attempt >= 2) {
        // 离线设备快速失败
        console.warn(`[MiniPlayer] ch=${chId} 连续 ${consecutiveNotAlive} 次 streamAlive=false, 终止初始轮询`)
        break
      }
      await new Promise(r => setTimeout(r, 300))
    }

    // 2. multi-urls 未找到流 → 回退到 /start 触发拉流
    //    [STABILITY-FIX 2026-08-02] skipStartApi/forceSkipStart 只是"优先复用"提示,
    //    当 multi-urls 查不到流时必须回退到 /start, 否则弹窗永远打不开已断开的流
    if (props.skipStartApi || forceSkipStart) {
      console.warn(`[MiniPlayer] ch=${chId} skipStart=true 但 multi-urls 无流, 回退到 /start`)
    }
    // 标记全局防抖，使并发调用者复用本次拉流
    channelStore.markStartCalled(chId)
    try {
      const { data: startResp } = await streamHttp.post(`/${chId}/start`, {
        stream_type: props.streamType,
      })
      const startData = startResp?.data || startResp
      if (startData && (startData.flvUrl || startData.webrtcUrl) && startData.zlmReady) {
        return {
          urls: {
            flv: norm(startData.flvUrl || ''),
            webrtc: norm(startData.webrtcUrl || ''),
            'ws-flv': norm(startData.wsFlvUrl || '', true),
            hls: norm(startData.hlsUrl || ''),
          },
          codec: startData.codec || '',
        }
      }
    } catch { /* 可能已在推流 */ }

    // start 后等待流就绪 (GB28181 INVITE + RTP 建立需 2-5 秒)
    // [STABILITY-FIX] 10×300ms=3s → 15×300ms=4.5s, 覆盖完整 INVITE 超时窗口
    consecutiveNotAlive = 0
    for (let attempt = 0; attempt < 15; attempt++) {
      const result = await queryMultiUrls()
      if (result) return result
      consecutiveNotAlive++
      if (consecutiveNotAlive >= 5 && attempt >= 4) {
        console.warn(`[MiniPlayer] ch=${chId} /start 后连续 ${consecutiveNotAlive} 次无流, 终止轮询`)
        break
      }
      await new Promise(r => setTimeout(r, 300))
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
        // [STABILITY-FIX 2026-07-29] FLV 错误处理：防止静默失败导致黑屏
        //   原因：flv.js 无 error handler → 网络抖动/流中断时静默失败 → 用户看到黑屏
        player.on(flvjs.Events.ERROR, (errorType: string, errorDetail: string) => {
          console.error('[MiniPlayer FLV] error:', errorType, errorDetail, 'url=', url)
          // 网络错误且已播放过 → 静默重连一次（短暂网络抖动）
          if (errorType === flvjs.ErrorTypes.NETWORK_ERROR && playing.value) {
            console.warn('[MiniPlayer FLV] Network error during playback, attempting silent reconnect...')
            return  // flv.js 内部会自动重连
          }
          // 其他错误 → 显示错误提示
          errorMsg.value = `播放错误: ${errorDetail}`
          emit('error', errorDetail)
          destroyPlayer()
        })
        // [STABILITY-FIX] 加载超时检测：8秒无数据 → 报错
        let loadTimeout: ReturnType<typeof setTimeout> | null = null
        loadTimeout = setTimeout(() => {
          if (!playing.value && playerInstance === player) {
            console.warn('[MiniPlayer FLV] 8s loading timeout, url=', url)
            errorMsg.value = '视频流加载超时'
            destroyPlayer()
          }
        }, 8000)
        video.addEventListener('playing', () => {
          if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null }
        }, { once: true })
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
      // P0-1.2: WebRTC 超低延迟播放 (SDP 交换 via 后端代理 ZLM)
      attachWebRtcMini(video)
      break
    }
  }
}

// ── WebRTC 播放实现 ──
let peerConnection: RTCPeerConnection | null = null

function destroyWebRtc() {
  if (peerConnection) {
    peerConnection.close()
    peerConnection = null
  }
}

async function attachWebRtcMini(video: HTMLVideoElement) {
  destroyWebRtc()
  const chId = props.channelId
  if (!chId) {
    errorMsg.value = 'WebRTC: 缺少通道ID'
    return
  }

  try {
    // ICE 配置: 局域网使用空数组 (纯 host candidate)
    const iceServers: RTCIceServer[] = []
    try {
      const { data: iceResp } = await streamHttp.get('/ice-config')
      const servers = iceResp?.data?.iceServers
      if (Array.isArray(servers) && servers.length > 0) iceServers.push(...servers)
    } catch { /* 后端不支持, 使用空配置 */ }

    const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' })
    peerConnection = pc
    pc.addTransceiver('video', { direction: 'recvonly' })
    pc.addTransceiver('audio', { direction: 'recvonly' })

    pc.ontrack = (ev) => {
      if (ev.streams && ev.streams[0]) {
        video.srcObject = ev.streams[0]
        video.play().catch(() => {})
        loading.value = false
        playing.value = true
        emit('playing')
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        // WebRTC 失败, 降级到 FLV
        console.warn('[MiniPlayer WebRTC] ICE failed, fallback to FLV')
        destroyWebRtc()
        if (currentUrls['flv']) {
          attachPlayer(video, 'flv', currentUrls['flv'])
        } else if (currentUrls['hls']) {
          attachPlayer(video, 'hls', currentUrls['hls'])
        }
      }
    }

    // 创建 SDP offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // 通过后端代理与 ZLM 交换 SDP
    const { data: resp } = await streamHttp.post(`/${chId}/webrtc`, {
      type: 'offer',
      sdp: offer.sdp,
    })
    const answerSdp = resp?.data?.sdp || resp?.sdp
    if (!answerSdp) {
      throw new Error('WebRTC SDP answer empty')
    }

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }))

    // 3s 超时检测: 如果还没收到 track, 降级
    setTimeout(() => {
      if (peerConnection === pc && !playing.value) {
        console.warn('[MiniPlayer WebRTC] timeout, fallback')
        destroyWebRtc()
        if (currentUrls['flv']) attachPlayer(video, 'flv', currentUrls['flv'])
        else if (currentUrls['hls']) attachPlayer(video, 'hls', currentUrls['hls'])
      }
    }, 3000)
  } catch (err: any) {
    console.warn('[MiniPlayer WebRTC] failed:', err?.message)
    destroyWebRtc()
    // 降级到 FLV/HLS
    if (currentUrls['flv']) attachPlayer(video, 'flv', currentUrls['flv'])
    else if (currentUrls['hls']) attachPlayer(video, 'hls', currentUrls['hls'])
    else {
      errorMsg.value = 'WebRTC 连接失败'
      emit('error', 'WebRTC failed')
    }
  }
}

// ── 直接 URL 播放（证据回放） ──
function playSrc(url: string) {
  const video = videoRef.value
  if (!video) return
  destroyPlayer()

  if (url.endsWith('.mp4') || url.startsWith('blob:') || url.startsWith('data:')) {
    video.src = url
    video.play().catch(() => {})
    playing.value = true
    emit('playing')
    return
  }
  if (url.includes('.m3u8')) {
    if (Hls.isSupported()) {
      const hls = new Hls()
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
        playing.value = true
        emit('playing')
      })
      playerInstance = hls
      currentFormat = 'hls'
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.play().catch(() => {})
      playing.value = true
      emit('playing')
    }
    return
  }
  if (flvjs.isSupported() && (url.includes('.flv') || url.includes('ws-flv') || url.includes('ws://'))) {
    const isWs = url.startsWith('ws')
    const player = flvjs.createPlayer({
      type: 'flv', url,
      isLive: !url.endsWith('.flv'),
    }, { enableStashBuffer: false })
    player.attachMediaElement(video)
    player.load()
    player.play()
    playerInstance = player
    currentFormat = isWs ? 'ws-flv' : 'flv'
    playing.value = true
    emit('playing')
    return
  }
  video.src = url
  video.play().catch(() => {})
  playing.value = true
  emit('playing')
}

// ── 监听 src prop ──
watch(() => props.src, (url) => {
  if (url) nextTick(() => playSrc(url))
}, { immediate: true })

// ── 启动播放 ──
// [Fix 2026-06-23] 使用 Pinia store 全局防抖，替换 per-instance 防抖
//   原因：per-instance 防抖无法跨组件协调（AlarmPopup + FloatingPreview + LiveView）
//   方案：channelStore.shouldSkipStart() 全局共享，同通道 5s 内只允许一次 /start
const channelStore = useChannelStore()

async function startPlay() {
  if (!props.channelId) return
  const video = videoRef.value
  if (!video) return

  // 全局防抖检查：同通道 5s 内复用已有流，跳过 /start（防止 SIP INVITE 风暴）
  // [STABILITY-FIX] 使用 checkSkipStart (纯查询) 替换废弃的 shouldSkipStart (有副作用)
  const inDebounce = channelStore.checkSkipStart(props.channelId)
  if (inDebounce) {
    console.debug(`[MiniPlayer] ch=${props.channelId} /start 全局防抖窗口内，跳过 SIP INVITE`)
  }

  loading.value = true
  errorMsg.value = ''

  // 防抖窗口内 forceSkipStart=true，仅查 multi-urls 复用已有流
  const result = await fetchStreamUrls(props.channelId, inDebounce)
  loading.value = false

  if (!result || !result.urls) {
    errorMsg.value = '视频流获取失败'
    emit('error', '无法获取视频流')
    return
  }

  codec = result.codec || ''
  currentUrls = result.urls  // P0-1.2: 保存 URLs 供 WebRTC 降级使用
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

// [STABILITY-FIX 2026-07-29] 失败重试：清除防抖记录后重新拉流
function retryPlay() {
  errorMsg.value = ''
  loading.value = true
  // 清除全局防抖记录，允许重新调用 /start
  channelStore.clearStartDebounce(props.channelId)
  // 直接重试
  destroyPlayer()
  nextTick(() => startPlay())
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
// [一次性设计修正 2026-06-23] 移除 watcher 中的重复防抖逻辑
//   原因：watcher 和 startPlay() 都检查 lastStartAt，watcher 先设置时间戳后
//   调 startPlay()，导致 startPlay() 误判为“防抖窗口内”跳过 /start
//   修复：watcher 只负责销毁旧播放器 + 调用 startPlay()，防抖由 startPlay 内部统一处理
watch(() => props.channelId, (newId, oldId) => {
  if (props.src) return  // src 已提供时跳过直播流获取
  // 只在 channelId 真正变化时销毁并重建，避免同通道不必要重连
  if (newId && newId !== oldId) {
    destroyPlayer()
    if (props.autoPlay && props.visible) {
      nextTick(() => startPlay())
    }
  }
}, { immediate: true })

// ── 监听可见性变化 ──
watch(() => props.visible, (vis) => {
  if (props.src) return
  if (vis && props.channelId && !playerInstance) {
    nextTick(() => startPlay())
  }
  // 不在不可见时销毁播放器 — 保持流持续，避免 TAB 切换时闪烁重连
})

onBeforeUnmount(() => {
  destroyPlayer()
  // [Fix 2026-06-23] 防抖记录已移至 Pinia store，无需在此清理
})
</script>

<style scoped>
.mini-player {
  position: relative;
  width: 100%;
  background: #000;
  border-radius: 6px;
  overflow: hidden;
  will-change: transform;
}
.mini-player__overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #AADDFF;
  background: #262626;
  font-size: 13px;
  text-align: center;
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
