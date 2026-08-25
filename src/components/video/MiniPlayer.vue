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
  /** fatal=true 表示确定性失败 (设备离线等), 重试无意义, 父组件可立即降级 */
  error: [msg: string, fatal?: boolean]
  snapshot: [blob: Blob]
}>()

// ── [P0-4 2026-08-20] 流失败自动兜底: 指数退避重试 1s/3s/10s × 3 次 ──
//   3 次都失败才向父组件 emit error (避免 AlarmPopup 过早降级);
//   拿到流 URL (attachPlayer) 后计数清零 — 运行时短暂抖动重新从 1s 退避
const RETRY_DELAYS_MS = [1000, 3000, 10000]
let autoRetryCount = 0
let autoRetryTimer: ReturnType<typeof setTimeout> | null = null

function clearAutoRetry() {
  if (autoRetryTimer) { clearTimeout(autoRetryTimer); autoRetryTimer = null }
}

/** 调度一次自动重试; 已达上限则报错给父组件 (弹窗此时才降级快照 tab)
 *  [P0-E 2026-08-24] fatal=确定性失败 (设备离线等): 跳过退避立即 emit —
 *    原逻辑 3 次退避 ≈14s 才报错, 对离线设备纯属无效等待 */
function scheduleAutoRetry(stage: string, fatal = false) {
  if (autoRetryTimer) return  // 已有 pending 重试
  if (fatal || autoRetryCount >= RETRY_DELAYS_MS.length) {
    errorMsg.value = fatal ? `${stage} · 设备不可达` : `${stage} · 重试 ${RETRY_DELAYS_MS.length} 次仍失败`
    loading.value = false
    emit('error', errorMsg.value, fatal)
    return
  }
  const delay = RETRY_DELAYS_MS[autoRetryCount++]
  console.warn(`[MiniPlayer] ${stage} 失败, ${Math.round(delay / 1000)}s 后自动重试 (${autoRetryCount}/${RETRY_DELAYS_MS.length})`)
  errorMsg.value = ''
  loading.value = true
  autoRetryTimer = setTimeout(() => {
    autoRetryTimer = null
    destroyPlayer()
    startPlay()
  }, delay)
}

const videoRef = ref<HTMLVideoElement>()
const loading = ref(false)
const playing = ref(false)
const errorMsg = ref('')
const muted = ref(props.muted)

let playerInstance: Hls | flvjs.Player | null = null
let currentFormat: PlayerFormat | '' = ''
let codec = ''
let currentUrls: Partial<Record<PlayerFormat, string>> = {}  // P0-1.2: WebRTC 降级用

// ── [P0-C 2026-08-24] 真实首帧管理 ──
//   原问题: attachPlayer 后立即 playing=true + emit('playing') 是"假首帧" —
//           实际画面要等 video 'playing' 事件 (数据到达浏览器并渲染), FLV 场景
//           最多滞后 8s; 期间 LIVE 徽章已亮、AlarmPopup onPlayerPlaying 误清降级态
//   修复: 统一由 video 'playing' 事件驱动 markPlaying(), 并加 8s 首帧超时兜底
//         (同时覆盖 HLS/WebRTC 原本无超时检测的路径)
let firstFrameTimer: ReturnType<typeof setTimeout> | null = null

function clearFirstFrameTimer() {
  if (firstFrameTimer) { clearTimeout(firstFrameTimer); firstFrameTimer = null }
}

/** 真实首帧回调 (video 'playing' 事件): 幂等 */
function markPlaying() {
  clearFirstFrameTimer()
  loading.value = false
  autoRetryCount = 0  // 确有画面才重置退避计数 (原在 attach 后重置, 现延后到真实首帧)
  if (!playing.value) {
    playing.value = true
    emit('playing')
  }
}

/** attach 后启动首帧超时监视: 8s 无真实首帧 → 退避重试 */
function watchFirstFrame() {
  clearFirstFrameTimer()
  firstFrameTimer = setTimeout(() => {
    if (!playing.value) {
      console.warn('[MiniPlayer] 8s 无真实首帧 (format=' + currentFormat + ')')
      destroyPlayer()
      scheduleAutoRetry('首帧超时')
    }
  }, 8000)
}

// [P0-E 2026-08-24] fetchStreamUrls 与 startPlay 间传递"确定性失败"标记
let lastStartFatal = false

// ── 播放器销毁 ──
function destroyPlayer() {
  destroyWebRtc()  // P0-1.2: 清理 WebRTC 连接
  clearFirstFrameTimer()  // [P0-C] 首帧监视随播放器销毁而取消
  videoRef.value?.removeEventListener('playing', markPlaying)
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
  lastStartFatal = false  // [P0-E] 每次拉流重置确定性失败标记
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
    // [POPUP-FIX 2026-08-25] 移除 consecutiveNotAlive>=5 快速失败:
    //   multi-urls 无流 ≠ 设备离线, 更可能是 INVITE 后 RTP/ZLM 注册进行中 (需 2-5s);
    //   原截断使名义 2.4s/4.5s 窗口实际 ~1.75s 即终止 → 过早回退 /start 重发 INVITE
    //   → 打断正在建立的推流 → 恶性循环 (弹窗间歇性打不开的直接原因);
    //   设备离线的确定性识别已由 /start 400 离线 (P0-E fatal) 承担, 此处无需重复拦截
    const initialAttempts = forceSkipStart ? 15 : 8
    for (let attempt = 0; attempt < initialAttempts; attempt++) {
      const result = await queryMultiUrls()
      if (result) return result
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
      // [P1-1 2026-08-24] 走单飞: 与 useGlobalAlarm 预热 (P0-A) / 其他实例共享在途 /start
      //   — 消除"防抖窗口内并发回退 /start → 同通道双 INVITE → RTP 冲突"竞态
      const resp: any = await channelStore.sharedStartStream(chId, props.streamType)
      const startData = resp?.data?.data || resp?.data
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
    } catch (err: any) {
      // [P0-E 2026-08-24] 确定性失败识别: 设备离线 (后端 badRequest code=1001, 消息含"离线")
      //   后端 [FIX 2026-06-28] INVITE 前心跳检查: 90s 无心跳直接拒绝, 重试无意义
      const body = err?.response?.data
      const msg: string = body?.message || body?.error || ''
      if ((err?.response?.status === 400 || body?.code === 1001) && /离线/.test(msg)) {
        console.warn(`[MiniPlayer] ch=${chId} /start 确定性失败: ${msg}`)
        lastStartFatal = true
      }
      /* 其余失败 (网络抖动/超时等) 维持原语义: 可能已在推流, 走后续轮询 */
    }

    // start 后等待流就绪 (GB28181 INVITE + RTP 建立需 2-5 秒)
    // [STABILITY-FIX] 10×300ms=3s → 15×300ms=4.5s, 覆盖完整 INVITE 超时窗口
    // [POPUP-FIX 2026-08-25] 15×300ms → 25×300ms=7.5s 且移除 5 次截断:
    //   后端 /start 就绪窗口已扩至 ~6s (waitForStreamReady 4s + fallback 2s),
    //   返回 zlmReady=false 说明流仍在注册中, 前端轮询必须覆盖完整窗口;
    //   原截断 ~1.75s 即终止 → 冷流必退避重试 → 重复 INVITE 打断推流 → 弹窗 5-15s 黑屏或最终失败
    for (let attempt = 0; attempt < 25; attempt++) {
      const result = await queryMultiUrls()
      if (result) return result
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
        // [POPUP-FIX 2026-08-25] 断流自愈: NETWORK_ERROR 时 flv.js 不会自动重连
        //   取证 (nginx access log): 后端 watchdog 对活流重发 INVITE → auto-cleanup 杀流
        //   → 播放中的 FLV 连接连坐掐断 (~60s 节律); 原注释 "flv.js 内部会自动重连"
        //   是错误假设 → 断流后黑屏挂死, 用户必须刷新页面 (弹窗间歇性打不开的元凶之一).
        //   修复: 统一走 scheduleAutoRetry 退避重连 (1s/3s/10s); 重连的 fetchStreamUrls
        //   phase1 会命中杀流后 ~80ms 内重 INVITE 恢复的流 → 实际秒级自愈;
        //   每次真实首帧 (markPlaying) 重置退避计数 → 周期性扰动也能持续自愈.
        player.on(flvjs.Events.ERROR, (errorType: string, errorDetail: string) => {
          console.error('[MiniPlayer FLV] error:', errorType, errorDetail, 'url=', url)
          destroyPlayer()
          scheduleAutoRetry(`FLV ${errorDetail}`)
        })
        // [P0-C] 超时检测统一为 attachPlayer 末尾的 watchFirstFrame (8s 无真实首帧),
        //   FLV 不再单独计时 — 原两处 8s 计时语义重复
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
  // [P0-C] 统一真实首帧监听 + 8s 超时监视 (覆盖 flv/ws-flv/hls/webrtc 全格式);
  //   destroyPlayer 时移除, 避免跨次 attach 残留
  video.addEventListener('playing', markPlaying)
  watchFirstFrame()
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
        // [P0-C] track 到达 ≠ 首帧渲染, 真实首帧由统一 'playing' 监听 (markPlaying) 上报
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
      // [P0-4] 无降级可用 → 指数退避自动重试
      destroyPlayer()
      scheduleAutoRetry('WebRTC 连接失败')
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
  // [P0-C] loading 不在此清除 — 保持"等待流..."动画直到真实首帧 (markPlaying);
  //   失败路径由 scheduleAutoRetry 自行管理 loading

  if (!result || !result.urls) {
    // [P0-4] 拿不到流 URL → 指数退避自动重试 (3 次后才 emit error)
    //   [P0-E] lastStartFatal=设备离线等确定性失败 → 跳过退避立即报错
    scheduleAutoRetry('视频流获取失败', lastStartFatal)
    return
  }

  codec = result.codec || ''
  currentUrls = result.urls  // P0-1.2: 保存 URLs 供 WebRTC 降级使用
  const fmt = selectBestFormat(result.urls)
  if (!fmt || !result.urls[fmt]) {
    scheduleAutoRetry('无可用播放格式')
    return
  }

  attachPlayer(video, fmt, result.urls[fmt]!)
  // [P0-C 2026-08-24] 移除 attach 后立即置 playing/emit — 假首帧 (画面最多滞后 8s):
  //   LIVE 徽章先于画面出现、AlarmPopup onPlayerPlaying 误清降级态。
  //   真实首帧由 attachPlayer 内统一 'playing' 监听 (markPlaying) 上报,
  //   退避计数也移至 markPlaying (确有画面才重置)。
}

// [STABILITY-FIX 2026-07-29] 失败重试：清除防抖记录后重新拉流
function retryPlay() {
  errorMsg.value = ''
  loading.value = true
  // [P0-4] 手动重试 → 清除自动退避状态, 重新获得 3 次机会
  clearAutoRetry()
  autoRetryCount = 0
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
    // [P0-4] 换通道 → 重置退避计数 (新通道独立计)
    clearAutoRetry()
    autoRetryCount = 0
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
  clearAutoRetry()  // [P0-4] 清理退避定时器, 防止卸载后仍触发 startPlay
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
