<template>
  <div class="mini-player" :style="{ aspectRatio }">
    <video
      ref="videoRef"
      muted
      autoplay
      playsinline
      @play="onVideoPlay"
      @pause="onVideoPause"
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
      <!-- [H265-HINT 2026-09-13] 拉流地址返回 200 却始终无首帧 → 多为源流 H265
           (GB28181 NVR 常见), flv.js/hls.js 均不解 H265; 提示用户换路径而非反复重试 -->
      <!-- [NVR-PB 2026-09-13] 补充命中路径: FLV CodecUnsupported 快速失败 (NVR 回放流
           非标封装/HEVC, 不经首帧超时) 原本只会落到通用「已尝试全部格式」误导文案 -->
      <span v-if="errorMsg.includes('首帧') || h265Suspect" class="mini-player__hint" style="margin-top:4px;font-size:12px;opacity:.85">
        该回放流编码为本播放器不支持的 H.265/非标封装 (NVR 回放常见)；可在录像管理页验证同段录像，或联系现场将 NVR 码流改为 H.264
      </span>
      <el-button size="small" type="primary" @click="retryPlay" style="margin-top:8px">🔄 重试</el-button>
    </div>
    <!-- LIVE badge -->
    <div v-if="showLiveBadge && playing && !loading" class="mini-player__live-badge">
      <span class="mini-player__live-dot" />
      <span>LIVE</span>
    </div>
    <!-- Controls -->
    <div v-if="showControls && playing" class="mini-player__controls">
      <!-- [FIX mp4-playpause 2026-09-16] 3.2 播放/暂停 (仅 mp4 回放; 直播流无暂停语义):
           暂停中显示「▶ 播放」点击恢复; 播完 (ended) 后再点 = 从头重播 -->
      <el-button v-if="srcIsMp4 || isWindowPlayback" size="small" text style="cursor: pointer" @click="togglePlay">
        {{ paused ? '▶ 播放' : '⏸ 暂停' }}
      </el-button>
      <!-- [FIX mp4-seek-ctl 2026-09-16] 3.3 快退/快进 (仅 mp4 直链回放; 直播流无文件时间轴):
           ±seekStepSec 秒段内 seek (默认 10s, 可配), 越界自动 clamp 到 [0, duration] -->
      <template v-if="srcIsMp4 || isWindowPlayback">
        <el-button size="small" text style="cursor: pointer" @click="seekStepBy(-seekStep)">⏪{{ seekStep }}s</el-button>
        <el-button size="small" text style="cursor: pointer" @click="seekStepBy(seekStep)">{{ seekStep }}s⏩</el-button>
      </template>
      <!-- [VCR-WIN 2026-09-18] 停止 (仅窗口回放): 暂停画面 + 请求父组件回窗口起点重开 -->
      <el-button v-if="isWindowPlayback" size="small" text style="cursor: pointer" @click="stopWinPlayback">⏹ 停止</el-button>
      <el-button size="small" text style="cursor: pointer" @click="takeSnapshot">📸 截图</el-button>
      <el-button size="small" text style="cursor: pointer" @click="toggleMute">{{ muted ? '🔊 开声' : '🔇 静音' }}</el-button>
      <!-- [FIX seek-feedback 2026-09-19] 跳转受理指示 (重开信令 5~17s 期画面零变化, 见 armSeekPending 头注) -->
      <span v-if="seekPending" class="mini-player__seek-hint">⟳ 跳转中…</span>
    </div>
    <!-- [FIX mp4-playpause 2026-09-16] 3.2 暂停覆盖层: 画面中央大播放按钮 (点击恢复;
         z-index 1 低于控件条/进度条 — 暂停时仍可操作快退/快进/截图/开声) -->
    <div v-if="showControls && playing && paused" class="mini-player__pause-overlay" title="继续播放" @click="togglePlay">
      <div class="mini-player__pause-btn">▶</div>
    </div>
    <!-- [FIX mp4-progress 2026-09-16] 3.4 进度条+时间+可拖 seek (仅 mp4 直链回放):
         拖动中仅 UI 跟手 (@input), 松手才真正 seek (@change) — 避免 Range 拖动中连续 seek 卡顿 -->
    <div v-if="srcIsMp4 && playing && srcDur > 0" class="mini-player__progress" @mousedown.stop>
      <span class="mini-player__time">{{ fmtSec(srcCur) }}</span>
      <!-- [FIX seek-ux 2026-09-19] 指针拖拽统一由 track 承担 (原仅 4px 高 input 可拖, 极易脱靶) -->
      <div
        ref="trackRef" class="mini-player__track"
        @pointerdown="onTrackPointerDown" @pointermove="onTrackPointerMove"
        @pointerup="onTrackPointerUp" @pointercancel="onTrackPointerCancel"
      >
        <input
          class="mini-player__range"
          type="range" min="0" :max="srcDur" step="0.1" :value="mp4ThumbSec"
          @input="onProgressInput" @change="onProgressChange"
        >
      </div>
      <span class="mini-player__time">{{ fmtSec(srcDur) }}</span>
    </div>
    <!-- [VCR-WIN 2026-09-18] 窗口回放进度条 (NVR/GB28181 回放流无文件时间轴): 两端显示
         绝对时刻, 轨道叠加事件时刻红标; 拖动中仅 UI 跟手, 松手 emit seekTo 由父组件重开流 -->
    <div v-if="isWindowPlayback && playing && windowDurSec > 0" class="mini-player__progress" @mousedown.stop>
      <span class="mini-player__time">{{ fmtClock(windowStart) }}</span>
      <div
        ref="trackRef" class="mini-player__track"
        @pointerdown="onTrackPointerDown" @pointermove="onTrackPointerMove"
        @pointerup="onTrackPointerUp" @pointercancel="onTrackPointerCancel"
      >
        <input
          class="mini-player__range"
          type="range" min="0" :max="windowDurSec" step="0.1" :value="thumbSec"
          @input="onWinProgressInput" @change="onWinProgressChange"
        >
        <span v-if="eventMarkerPct != null" class="mini-player__evmark" :style="{ left: eventMarkerPct + '%' }" title="事件时刻" />
      </div>
      <span class="mini-player__time">{{ fmtClock(windowEnd) }}</span>
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
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'  // [FIX seek-accum 2026-09-19] 贴边点击轻提示
// [PERF 2026-09-14] 播放器库改按需加载: hls.js + flv.js ≈1.1MB, 原静态导入经
//   App.vue→AlarmPopup→MiniPlayer 静态链拖进首屏 vendor-misc (首页被迫下载)。
//   类型仅编译期引用 (擦除), 运行时首次播放才 import() — 见 ensurePlayerLibs。
import { ref, watch, onBeforeUnmount, nextTick, computed } from 'vue'
import type Hls from 'hls.js'
import type flvjs from 'flv.js'
import { streamHttp } from '@/api/http'
import { normalizeStreamUrl, normalizeWsFlvUrl } from '@/utils/streamUrl'
import { useChannelStore } from '@/stores/channel'

type PlayerFormat = 'flv' | 'ws-flv' | 'hls' | 'webrtc' | 'mp4'

const DEGRADATION_CHAINS: Record<string, PlayerFormat[]> = {
  h264: ['flv', 'ws-flv', 'webrtc', 'hls'],
  h265: ['hls', 'webrtc'],
}

const props = withDefaults(defineProps<{
  channelId: string
  /** 直接 URL 播放（证据回放 / 已知流地址），跳过 fetchStreamUrls */
  src?: string
  /** [POPUP-PLAYBACK 2026-09-11] src 播放的候选回退列表：按序尝试，前一候选失敗
   *  (flv ERROR / hls fatal / video error / 8s 无首帧) 自动切下一个 */
  srcFallbacks?: string[]
  /** [POPUP-3MIN 2026-09-11] 回放起始偏移(秒): mp4 直链 loadedmetadata 后 seek 到该位置
   *  (告警弹窗「事件前后各 1.5 分钟」连播的首段从 T-90s 处开播); 流媒体格式忽略 */
  seekStart?: number
  /** [POPUP-3MIN 2026-09-11] 回放截止偏移(秒): mp4 播到该位置时暂停并 emit ended
   *  (末段播到 T+90s 即停); undefined = 播到文件自然结束 */
  stopAt?: number
  autoPlay?: boolean
  muted?: boolean
  aspectRatio?: string
  showControls?: boolean
  /** 跳过 /start 调用（流已在推时使用，如浮窗预览） */
  skipStartApi?: boolean
  /** [FIX nvr-playback 2026-09-13] 显式指定 src 候选的播放格式, 不依赖 URL 后缀:
   *   NVR 回放流的相对路径 (ZLM /rtp/gb_playback_xxx.live.flv 等) 未必含 .flv/.m3u8,
   *   而 hls_url 形如 /index/api/hls/... 也不含 .m3u8 → URL 后缀推断常常误判 mp4,
   *   喂进原生 <video> 拉一个 flv 流 = 解析失败 + 「回放地址不可用」。
   *   未指定时按 URL 后缀兜底 (向后兼容). */
  srcFormat?: '' | 'flv' | 'ws-flv' | 'hls' | 'mp4'
  /** [FIX nvr-playback 2026-09-13] 是否直播语义. 默认 true (直播预览行为不变);
   *   回放流传 false 启用 flv.js 的 seek/duration/不循环 (对齐 RecordingView 回放配置). */
  srcIsLive?: boolean
  /** [VCR-WIN 2026-09-18] 窗口回放模式: 回放窗口绝对起止 (ms)。NVR/GB28181 回放流为
   *   flv 直播语义 (duration=NaN), 进度条以「流内相对秒 → 绝对时刻」映射显示, 拖动/
   *   快退快进经 seekTo 由父组件重开流定位; 仅非 mp4 源且二者有限时启用 (mp4 零回归) */
  windowStart?: number
  windowEnd?: number
  /** [FIX seek-ux 2026-09-19] 当前回放流 rel-0 的绝对时刻 (ms): 窗口进度条以「固定窗口
   *   [windowStart, windowEnd]」显示, 滑块位置 = streamStart + 流内秒 - windowStart。
   *   缺省回落 windowStart (旧语义: windowStart 即流起点, 向后兼容) */
  streamStart?: number
  /** [VCR-WIN] 事件发生绝对时刻 (ms): 进度条红色标记 (可选) */
  eventTs?: number
  /** 码流类型: 'main' (高清) 或 'sub' (子码流, 低分辨率) */
  streamType?: 'main' | 'sub'
  /** [FIX mp4-seek-ctl 2026-09-16] 3.3 mp4 回放快退/快进步长 (秒), 默认 10 */
  seekStepSec?: number
  /** 组件是否可见 (v-show 场景下控制是否启动流) */
  visible?: boolean
  /** 录像回放应关闭live */
  showLiveBadge?: boolean
}>(), {
  autoPlay: true,
  muted: true,
  showLiveBadge: true,
  aspectRatio: '16:9',
  showControls: false,
  skipStartApi: false,
  streamType: 'main',
  seekStepSec: 10,
  srcFormat: '',
  srcIsLive: true,
  windowStart: undefined,
  windowEnd: undefined,
  streamStart: undefined,
  eventTs: undefined,
  visible: true,
  srcFallbacks: () => [],
  seekStart: undefined,
  stopAt: undefined,
})

const emit = defineEmits<{
  playing: []
  /** fatal=true 表示确定性失败 (设备离线等), 重试无意义, 父组件可立即降级 */
  error: [msg: string, fatal?: boolean]
  snapshot: [blob: Blob]
  /** [POPUP-3MIN 2026-09-11] mp4 播放结束 (自然结束或到达 stopAt): 父组件据此推进连播队列 */
  ended: []
  /** [VCR-WIN 2026-09-18] 窗口回放跳转请求 (绝对 ms): 拖动进度条/快退快进/停止时发射,
   *   父组件断流并重开回放流从该时刻起播 (流式回放无段内 seek 语义) */
  seekTo: [ms: number]
  /** [VCR-WIN] 流内相对秒上报 (timeupdate): 父组件以 windowStart + relSec 估算已播绝对
   *   时刻 (断流续播定位 + 进度行显示) */
  progress: [relSec: number]
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
// [FIX mp4-playpause 2026-09-16] 3.2 暂停状态: 由 video @play/@pause 事件统一回写
//   (含 stopAt 裁剪暂停/播完前的自然暂停), UI 仅做展示
const paused = ref(false)
const errorMsg = ref('')
const muted = ref(props.muted)
// [NVR-PB 2026-09-13] 候选链内出现过 FLV CodecUnsupported (非标/HEVC 编码) → 模板提示分支
const h265Suspect = ref(false)
// [FIX mp4-progress 2026-09-16] 3.3/3.4 mp4 回放 seek 支持: srcIsMp4=当前候选为 mp4 直链
//   (进度条/快退快进仅此形态可用; 直播 flv/hls 无文件时间轴); srcCur/srcDur=进度条状态;
//   isSeekingDrag=拖动中 (timeupdate 暂停回写 srcCur, 松手 @change 才真正 seek)
const srcIsMp4 = ref(false)
const srcCur = ref(0)
const srcDur = ref(0)
const isSeekingDrag = ref(false)
const seekStep = computed(() => props.seekStepSec ?? 10)
/** 秒 → mm:ss / h:mm:ss (进度条两侧时间显示) */
function fmtSec(s: number): string {
  if (!isFinite(s) || s < 0) return '--:--'
  const sec = Math.floor(s % 60), m = Math.floor(s / 60) % 60, h = Math.floor(s / 3600)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p2(m)}:${p2(sec)}` : `${p2(m)}:${p2(sec)}`
}
/** 3.3 快退/快进: 段内 ±seekStep 秒, clamp 到 [0, duration-0.1] (越 stopAt 由
 *  srcTimeUpdateHandler 自然触发 ended → 连播推进下一段, 无需特殊处理)
 *  [REC-SEEK 2026-09-19] ① duration 未知 (元数据未就绪/H265 异常) 不再静默 return
 *  (「点击无反应」观感) — 改无上界写入由浏览器收敛; ② 贴边 (位移 <0.05s) 给 1s 节流
 *  轻提示, 对齐窗口模式 seekEdgeHintTs 的反馈体验 */
let mp4EdgeHintTs = 0
function seekByMp4(deltaSec: number) {
  const video = videoRef.value
  if (!video) return
  const cur = video.currentTime
  const target = isFinite(video.duration) && video.duration > 0
    ? Math.min(Math.max(0, cur + deltaSec), Math.max(0, video.duration - 0.1))
    : Math.max(0, cur + deltaSec)
  if (Math.abs(target - cur) < 0.05) {
    const now = Date.now()
    if (now - mp4EdgeHintTs > 1000) {
      mp4EdgeHintTs = now
      ElMessage.info(deltaSec < 0 ? '已到录像开头' : '已到录像末尾')
    }
    return
  }
  video.currentTime = target
  srcCur.value = video.currentTime
}
/** [FIX seek-ux 2026-09-19] mp4 进度条键盘路径: input 仅更新待提交值 (指针路径由 track 承担) */
function onProgressInput(e: Event) {
  isSeekingDrag.value = true
  dragThumbSec.value = Number((e.target as HTMLInputElement).value)
}
/** 3.4 提交段内 seek: 写入 video.currentTime (mp4 无重开, 即时生效) */
function commitMp4Seek(v: number) {
  const video = videoRef.value
  if (video && isFinite(v)) video.currentTime = v
  srcCur.value = v
}
/** 3.4 键盘 change: 提交 seek */
function onProgressChange(e: Event) {
  isSeekingDrag.value = false
  const v = Number((e.target as HTMLInputElement).value)
  dragThumbSec.value = null
  commitMp4Seek(v)
}

// ── [VCR-WIN 2026-09-18] 窗口回放模式 (NVR/GB28181 回放流) ──
//   NVR 回放流走 flv.js (srcIsLive=false 但不含文件时长) — video.currentTime 为「流内
//   相对秒」(attach 起从 0 单调推进), 进度条以 windowStart + relSec 映射为绝对时刻;
//   段内 seek 无法完成 → emit seekTo 由父组件重开流定位 (对齐 AlarmPopup 联动回放)
const winCur = ref(0)
/** 窗口时长 (秒); <=0 视为窗口参数缺失, 窗口模式关闭 */
const windowDurSec = computed(() => {
  const a = props.windowStart, b = props.windowEnd
  if (a == null || b == null || !isFinite(a) || !isFinite(b) || b <= a) return 0
  return (b - a) / 1000
})
/** 窗口回放模式: 非 mp4 源且窗口有效 (mp4 路径控件行为保持零回归) */
const isWindowPlayback = computed(() => !srcIsMp4.value && windowDurSec.value > 0)
/** 事件时刻在进度条上的位置 (%) */
const eventMarkerPct = computed(() => {
  const a = props.windowStart, b = props.windowEnd, e = props.eventTs
  if (a == null || b == null || e == null || !isFinite(a) || !isFinite(b) || b <= a) return null
  return Math.min(100, Math.max(0, (e - a) / (b - a) * 100))
})
/** 绝对 ms → HH:mm:ss (窗口进度条两端显示绝对时刻) */
function fmtClock(ms?: number): string {
  if (ms == null || !isFinite(ms)) return '--:--:--'
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
/** 窗口模式提交跳转 (track 拖动松手/键盘 change 共用): v = 窗口内相对秒 → seekTo(绝对 ms) */
function commitWinSeek(v: number) {
  const a = props.windowStart
  if (a == null || !isFinite(a) || !isFinite(v)) return
  seekBaseMs.value = a + v * 1000  // [FIX seek-accum] 目标记基准供挂起期连点叠加 + 乐观滑块
  armSeekPending()  // [FIX seek-feedback] 受理指示
  emit('seekTo', a + v * 1000)
}
/** [FIX seek-ux] 窗口进度条键盘路径: input 仅更新待提交值 (指针路径由 track 承担) */
function onWinProgressInput(e: Event) {
  isSeekingDrag.value = true
  dragThumbSec.value = Number((e.target as HTMLInputElement).value)
}
/** [FIX seek-ux] 窗口进度条键盘 change: 提交跳转 */
function onWinProgressChange(e: Event) {
  isSeekingDrag.value = false
  const v = Number((e.target as HTMLInputElement).value)
  dragThumbSec.value = null
  commitWinSeek(v)
}
/** [FIX seek-accum/seek-feedback 2026-09-19] 快退快进「不起作用」三根因治理 ──
 *  实锚 (真机 2026-09-19 复现): NVR 重开流信令实测 5~17s 期间 winCur 不推进,
 *  连点 ⏪/⏩ 每次基于同一停滞位置计算 → 目标被覆盖不累计 (点 3 次只前进 1 次);
 *  贴边 (本流起点/窗口尾) 点击被 `|target-cur|<500` 静默丢弃 (用户主观"没反应");
 *  点击后画面零变化无受理反馈 → 三态叠加被感知为「前进/后退10秒不起作用」。
 *  ① 挂起期连点叠加: 以最后目标为基准 (实例随 queueEpoch++ 重建时天然归零);
 *  ② 贴边不再静默: 轻提示 (1s 节流); ③ 点击即挂「跳转中…」到新流首帧/卸载/30s 超时。 */
/** [FIX seek-ux 2026-09-19] 进度条「拖不动/跳转弹回」治理 (真机 Firefox 真实事件实测):
 *  实锚 ① 拖拽命中带仅 4px (range input 本体高) — 用户抓可视滑块偏移数像素 mousedown
 *  落在 track 上=零响应; ② 父组件每轮重开把窗口头覆盖为跳转目标 → 窗口收缩、滑块弹
 *  回最左 (视觉上"跳转没生效"); ③ seek 链路无界等待 + 无乐观反馈。
 *  现: ① 指针拖拽统一由 track 承担 (16px 命中带 + pointer capture), input 仅可视化/键盘;
 *  ② 新增 streamStart (流 rel-0 绝对时刻): 滑块 = streamStart+winCur-windowStart,
 *  窗口固定后跳转完成滑块停在目标处继续前进; ③ 点击/拖动即置 seekBaseMs 乐观移动滑块。 */
/** 用户最后跳转目标 (ms): 重开流生效前连点 ⏪/⏩ 的叠加基准 + 乐观滑块位置
 *  (重建完成 queueEpoch++ 使本实例销毁, 基准随新流起点自然迁移); ref 化供滑块响应 */
const seekBaseMs = ref<number | null>(null)
/** 当前流 rel-0 绝对时刻: streamStart 缺省 = 窗口头 (旧语义向后兼容) */
const streamAbs0 = computed(() => {
  const s = props.streamStart
  return s != null && isFinite(s) ? s : (props.windowStart ?? 0)
})
/** 拖动中/键盘待提交的进度秒 (两进度条互斥挂载, 共用此拖拽值) */
const dragThumbSec = ref<number | null>(null)
/** [FIX seek-ux] 指针拖拽统一由 track 承担: 原仅 range input 本体可拖 (命中带 4px,
 *  抓可视滑块偏移数像素即零响应) → 指针事件挂 16px 轨道容器, pointer capture
 *  保证移出轨道仍跟手; track 内 input pointer-events:none 仅可视化/键盘 */
const trackRef = ref<HTMLElement>()
let trackDragId = -1
function trackPctToSec(clientX: number): number | null {
  const el = trackRef.value
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width <= 0) return null
  const dur = isWindowPlayback.value ? windowDurSec.value : srcDur.value
  if (dur <= 0) return null
  return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * dur
}
function onTrackPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const v = trackPctToSec(e.clientX)
  if (v == null) return
  trackDragId = e.pointerId
  isSeekingDrag.value = true  // 拖动中暂停 timeupdate 回写 (滑块=手指位置)
  dragThumbSec.value = v
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  e.preventDefault()
}
function onTrackPointerMove(e: PointerEvent) {
  if (e.pointerId !== trackDragId) return
  const v = trackPctToSec(e.clientX)
  if (v != null) dragThumbSec.value = v
}
function onTrackPointerUp(e: PointerEvent) {
  if (e.pointerId !== trackDragId) return
  trackDragId = -1
  isSeekingDrag.value = false
  const v = dragThumbSec.value
  dragThumbSec.value = null
  if (v == null) return
  if (isWindowPlayback.value) commitWinSeek(v)
  else commitMp4Seek(v)
}
function onTrackPointerCancel(e: PointerEvent) {
  if (e.pointerId !== trackDragId) return
  trackDragId = -1
  isSeekingDrag.value = false
  dragThumbSec.value = null  // 取消不提交: 滑块回落真实位置
}
/** 滑块位置 (窗口内相对秒): 拖动值 > 跳转目标(乐观) > 流真实位置 */
const thumbSec = computed(() => {
  const dur = windowDurSec.value
  if (dur <= 0) return 0
  const clamp = (v: number) => Math.min(dur, Math.max(0, v))
  if (dragThumbSec.value != null) return clamp(dragThumbSec.value)
  const base = props.windowStart ?? 0
  if (seekBaseMs.value != null) return clamp((seekBaseMs.value - base) / 1000)
  return clamp((streamAbs0.value + winCur.value - base) / 1000)
})
/** mp4 进度条滑块值 */
const mp4ThumbSec = computed(() => dragThumbSec.value ?? srcCur.value)
/** 贴边提示节流时间戳 (1s 内不重复弹) */
let seekEdgeHintTs = 0
/** 跳转受理指示 (重开信令期画面零变化, 无反馈即「按钮失灵」观感) */
const seekPending = ref(false)
let seekPendingTimer: ReturnType<typeof setTimeout> | null = null
function armSeekPending() {
  seekPending.value = true
  if (seekPendingTimer) clearTimeout(seekPendingTimer)
  seekPendingTimer = setTimeout(() => {
    seekPending.value = false
    seekPendingTimer = null
    seekBaseMs.value = null  // [FIX seek-ux] 超时未达成: 撤乐观滑块, 回落流真实位置
  }, 30000)
}
function clearSeekPending() {
  seekPending.value = false
  if (seekPendingTimer) { clearTimeout(seekPendingTimer); seekPendingTimer = null }
  seekBaseMs.value = null  // [FIX seek-ux] 跳转达成 (新流首帧): 乐观基准交还流真实位置
}
/** 窗口模式快退/快进: ±delta 秒 → seekTo(绝对 ms), clamp 到窗口范围 [start, end-1s] */
function seekWindowBy(deltaSec: number) {
  const a = props.windowStart, b = props.windowEnd
  if (a == null || b == null || windowDurSec.value <= 0) return
  const actual = streamAbs0.value + Math.max(0, winCur.value) * 1000  // [FIX seek-ux] 流锚定
  const cur = seekBaseMs.value ?? actual  // ① 挂起期优先最后目标 (重开在途时用户心理位置=上次目标)
  const target = Math.min(Math.max(cur + deltaSec * 1000, a), b - 1000)
  if (Math.abs(target - cur) < 500) {
    // ② 贴边/无位移: 原静默 return 改为轻提示 (用户不知为何无反应)
    const now = Date.now()
    if (now - seekEdgeHintTs > 1000) {
      seekEdgeHintTs = now
      ElMessage.info(deltaSec < 0 ? '已到回放窗口起点' : '已到回放窗口终点')
    }
    return
  }
  seekBaseMs.value = target  // ③ 乐观滑块: 点击即移到目标位 (重开信令期可见跳转已受理)
  armSeekPending()
  emit('seekTo', target)
}
/** 统一快退/快进入口: 窗口模式走 seekTo (父组件重开流), mp4 保持段内 seek */
function seekStepBy(deltaSec: number) {
  if (isWindowPlayback.value) seekWindowBy(deltaSec)
  else seekByMp4(deltaSec)
}
/** [VCR-WIN] 停止: 暂停画面 + 请求父组件回窗口起点重开 (流式回放无真停机语义) */
function stopWinPlayback() {
  videoRef.value?.pause()
  const a = props.windowStart
  if (a != null && isFinite(a)) { seekBaseMs.value = a; armSeekPending(); emit('seekTo', a) }
}

/** [FIX mp4-playpause 2026-09-16] 3.2 播放/暂停切换 (mp4 回放):
 *   暂停中 → play() 恢复; mp4 播完 (ended) 后再点播放 → currentTime 归零重播 */
function togglePlay() {
  const video = videoRef.value
  if (!video) return
  if (video.paused) {
    if (video.ended) video.currentTime = 0
    const p = video.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } else {
    video.pause()
  }
}
function onVideoPlay() { paused.value = false }
function onVideoPause() { paused.value = true }

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
  // [FIX seek-ux2 2026-09-19] 撤「跳转中…」以「跳转达成」为判据: 本回调也由旧流缓冲恢复
  //   (waiting→playing) 触发 — 原无条件 clearSeekPending 把点击后刚置上的乐观滑块/受理
  //   指示一并撤掉。真机取证 (vcr-seek5): 点击 +15ms 乐观态就位 → +949ms waiting →
  //   +1487ms playing (旧流恢复) → +1521ms 滑块弹回/指示消失。现仅当流位置已达跳转
  //   目标 (±2s) 或本就无跳转在途才撤; 未达成则留待新流接管 (实例重建) / 30s 超时。
  const target = seekBaseMs.value
  const pos = streamAbs0.value + (videoRef.value?.currentTime || 0) * 1000
  if (target == null || Math.abs(pos - target) < 2000) clearSeekPending()
  if (!playing.value) {
    playing.value = true
    emit('playing')
  }
}

/** attach 后启动首帧超时监视: 无真实首帧 → 退避重试 (src 模式 → 下一候选) */
function watchFirstFrame() {
  clearFirstFrameTimer()
  // [FIX rec-mp4-timeout 2026-09-11] ZLM 录制 mp4 的 moov 在文件尾部 (非 faststart),
  //   浏览器需两次 Range (头 1KB + 尾 1KB) 才能解析出音视频参数; 慢网/拥塞下尾包实测
  //   15.8s 才到 (探针) → 原 8s 上限会在数据仍在正常下载时误切候选/误报全败。
  //   流媒体格式 (flv/hls) 保持 8s 快速降级不变。
  const timeoutMs = currentFormat === 'mp4' ? 20000 : 8000
  firstFrameTimer = setTimeout(() => {
    if (!playing.value) {
      console.warn(`[MiniPlayer] ${timeoutMs / 1000}s 无真实首帧 (format=` + currentFormat + ')')
      if (srcMode) {
        tryNextSrcCandidate()  // 内含 destroyPlayer; 防 hls 挂起不报错死等
      } else {
        destroyPlayer()
        scheduleAutoRetry('首帧超时')
      }
    }
  }, timeoutMs)
}

// [P0-E 2026-08-24] fetchStreamUrls 与 startPlay 间传递"确定性失败"标记
let lastStartFatal = false

// ── 播放器销毁 ──
function destroyPlayer() {
  destroyWebRtc()  // P0-1.2: 清理 WebRTC 连接
  clearFirstFrameTimer()  // [P0-C] 首帧监视随播放器销毁而取消
  const video = videoRef.value
  video?.removeEventListener('playing', markPlaying)
  // [POPUP-PLAYBACK 2026-09-11] src 模式的 video 级错误监听随销毁移除 (防切换候选后残留)
  if (video && srcVideoErrorHandler) {
    video.removeEventListener('error', srcVideoErrorHandler)
    srcVideoErrorHandler = null
  }
  // [POPUP-3MIN 2026-09-11] 连播监听 (seek/stopAt/ended) 随销毁移除, 防候选切换残留
  if (video) {
    if (srcLoadedMetaHandler) { video.removeEventListener('loadedmetadata', srcLoadedMetaHandler); srcLoadedMetaHandler = null }
    if (srcTimeUpdateHandler) { video.removeEventListener('timeupdate', srcTimeUpdateHandler); srcTimeUpdateHandler = null }
    if (srcEndedHandler) { video.removeEventListener('ended', srcEndedHandler); srcEndedHandler = null }
    if (srcWinEndedHandler) { video.removeEventListener('ended', srcWinEndedHandler); srcWinEndedHandler = null }
    if (srcWinTimeUpdateHandler) { video.removeEventListener('timeupdate', srcWinTimeUpdateHandler); srcWinTimeUpdateHandler = null }
  }
  if (playerInstance) {
    try {
      if ('destroy' in playerInstance) playerInstance.destroy()
    } catch { /* ignore */ }
    playerInstance = null
  }
  if (video) {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  currentFormat = ''
  playing.value = false
  // [FIX mp4-progress 2026-09-16] 进度条/seek 状态随播放器销毁重置 (候选切换/通道切换/卸载)
  srcIsMp4.value = false
  srcCur.value = 0
  srcDur.value = 0
  winCur.value = 0  // [VCR-WIN 2026-09-18] 窗口回放进度随销毁复位 (候选切换/通道切换/卸载)
  winStallSince = 0  // [VCR-WIN] 看门狗随销毁复位
  isSeekingDrag.value = false
  paused.value = false  // [FIX mp4-playpause 2026-09-16] 暂停态随销毁复位 (旧 video 事件跨实例不残留)
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

// ── [PERF 2026-09-14] 播放器库按需加载（单例, 失败可重试） ──
let HlsLib: typeof import('hls.js').default | null = null
let flvjsLib: typeof import('flv.js').default | null = null
let playerLibsLoading: Promise<void> | null = null

function ensurePlayerLibs(): Promise<void> {
  if (!playerLibsLoading) {
    playerLibsLoading = Promise.all([
      import('hls.js').then(m => { HlsLib = m.default }),
      import('flv.js').then(m => { flvjsLib = m.default }),
    ]).then(() => undefined).catch((err) => {
      playerLibsLoading = null  // 失败允许下次重试
      throw err
    })
  }
  return playerLibsLoading
}

// ── 按格式播放 ──
//   [PERF 2026-09-14] async 化: flv/ws-flv/hls 分支先 await 播放器库再建实例;
//   attachSeq 防竞态 — 库加载期间若有更新的 attach 请求, 旧请求直接放弃。
let attachSeq = 0
async function attachPlayer(video: HTMLVideoElement, fmt: PlayerFormat, url: string) {
  const seq = ++attachSeq
  if (fmt === 'flv' || fmt === 'ws-flv' || fmt === 'hls') {
    try {
      await ensurePlayerLibs()
    } catch {
      if (seq !== attachSeq) return
      errorMsg.value = '播放组件加载失败'
      scheduleAutoRetry('播放组件加载失败')
      return
    }
    if (seq !== attachSeq || videoRef.value !== video) return
  }
  destroyPlayer()
  currentFormat = fmt

  switch (fmt) {
    case 'flv':
    case 'ws-flv':
      if (flvjsLib && flvjsLib.isSupported()) {
        const player = flvjsLib.createPlayer({
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
        player.on(flvjsLib.Events.ERROR, (errorType: string, errorDetail: string) => {
          // [NVR-PB 2026-09-13] destroy 后旧实例异步 emit 防护 (flv.js 库 bug, 同 src 模式)
          if (playerInstance !== player) return
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
      if (HlsLib && HlsLib.isSupported()) {
        const hls = new HlsLib({
          enableWorker: true,
          lowLatencyMode: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 2,
          liveDurationInfinity: true,
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
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
    errorMsg.value = 'WebRTC: 缺少监控点ID'
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

// ── 直接 URL 播放（证据回放 / 设备回放流）: 候选链 + 归一化 + 真实首帧 + 失败回退 ──
// [POPUP-PLAYBACK 2026-09-11] src 模式重构 (告警弹窗点击录像黑屏修复):
//   原实现裸挂 video/flv/hls 三路都不归一化 — 后端 /recordings/:id/play 返回的
//   ZLM 绝对地址 (http://127.0.0.1:9080/...; apiHost 非远程模式恒为 127.0.0.1)
//   在用户浏览器里指向“用户自己的电脑” → 死链; 且全链无错误监听 (静默黑屏)、
//   立即置假首帧 (黑屏上挂 LIVE 徽章)。现改为候选链: 归一化 (http→同源相对
//   路径 / ws→同源 ws) → 按 [src, ...srcFallbacks] 逐一尝试 (flv ERROR /
//   hls fatal / video error / 8s 无首帧 → 下一候选) → 全败 emit error 显示
//   重试。候选组装责任在调用方 (AlarmPopup: flv→hls→wsFlv→录像文件直链)。
let srcCandidates: string[] = []
let srcIndex = 0
let srcMode = false
let srcVideoErrorHandler: (() => void) | null = null
// [NVR-PB 2026-09-13] 候选链中出现过 CodecUnsupported (FLV 非标/HEVC 编码) → 耗尽后
//   错误文案切 H265/非标提示分支 (h265Suspect), 取代误导性的「已尝试全部格式」
//   (h265Suspect 为响应式 ref, 模板 v-if 直接消费; srcCodecUnsupported 语义合并入内)
// [POPUP-3MIN 2026-09-11] 回放连播: mp4 起点 seek / 截止暂停 / 结束转发 监听引用
let srcLoadedMetaHandler: (() => void) | null = null
let srcTimeUpdateHandler: (() => void) | null = null
let srcEndedHandler: (() => void) | null = null
let srcEndedFired = false
// [VCR-WIN-FIX 2026-09-18] 窗口回放 ended 转发监听引用 (NVR 有限段流结束后 video
//   播完 buffer 触发 ended → 转发父组件走断点续播; 原仅 mp4 分支挂 ended → NVR 流
//   结束静默停在事件时刻之前, 实测缺陷根因)
let srcWinEndedHandler: (() => void) | null = null
// [VCR-WIN 2026-09-18] 窗口回放 (非 mp4 源) timeupdate: 回写流内相对秒 + 上报父组件
let srcWinTimeUpdateHandler: (() => void) | null = null

function playSrc(url: string) {
  srcMode = true
  h265Suspect.value = false  // [NVR-PB] 新候选链重置编码不支持标记
  // [FIX rec-cand-dedup 2026-09-12] 候选去重: src 与 srcFallbacks 可能含相同 URL
  //   (同源 :8088 场景 recordUrlCandidates 双候选同址) — 同址重复尝试白耗一整个
  //   mp4 首帧超时周期 (20s), 去重后同址只试一次
  srcCandidates = [...new Set([url, ...(props.srcFallbacks || [])].filter(Boolean))]
  srcIndex = 0
  tryNextSrcCandidate()
}

function tryNextSrcCandidate() {
  const video = videoRef.value
  if (!video) return
  destroyPlayer()
  if (srcIndex >= srcCandidates.length) {
    loading.value = false
    // [NVR-PB 2026-09-13] CodecUnsupported → H265/非标编码提示 (原通用文案误导用户以为地址坏)
    errorMsg.value = h265Suspect.value
      ? '回放流编码不支持 (H.265/非标封装)'
      : '回放地址不可用 · 已尝试全部格式'
    emit('error', errorMsg.value)
    return
  }
  loading.value = true
  errorMsg.value = ''
  attachSrcPlayer(video, srcCandidates[srcIndex++])
}

/** 挂载单个 src 候选; 任一失败路径统一走 tryNextSrcCandidate
 *  [FIX nvr-playback 2026-09-13] 格式判定重构:
 *    优先级: srcFormat prop (显式) → URL 后缀兜底 (.m3u8/hls → hls, .flv/ws → flv, 其他 → mp4).
 *    NVR 回放流 URL 路径形态不稳定, 显式 srcFormat 是报警弹窗联动回放可用的关键.
 *  [FIX nvr-playback 2026-09-13] flv 路径 hasAudio 改 true (原 false), isLive 用 srcIsLive
 *    (默认 true 保持直播行为, 回放传 false 启用 seek/duration) — 与录像管理页同款配置 */
//   [PERF 2026-09-14] async 化 + 播放器库按需加载 (同 attachPlayer, 见 ensurePlayerLibs)
async function attachSrcPlayer(video: HTMLVideoElement, raw: string) {
  const seq = ++attachSeq
  const isWs = /^wss?:\/\//i.test(raw)
  const url = isWs ? normalizeWsFlvUrl(raw) : normalizeStreamUrl(raw)
  const lower = url.toLowerCase()
  srcEndedFired = false  // [POPUP-3MIN] 新候选重新计结束状态
  const failNext = (why: string) => {
    if (!srcMode) return
    console.warn(`[MiniPlayer src] ${why} (候选 ${srcIndex}/${srcCandidates.length}), url=${url}`)
    tryNextSrcCandidate()
  }

  // 格式推断: 显式 prop > URL 后缀; 兜底为 mp4
  let mode: 'hls' | 'flv' | 'mp4'
  const explicit = props.srcFormat
  if (explicit === 'flv' || explicit === 'ws-flv') mode = 'flv'
  else if (explicit === 'hls') mode = 'hls'
  else if (explicit === 'mp4') mode = 'mp4'
  else if (lower.includes('.m3u8') || lower.includes('hls')) mode = 'hls'
  else if (isWs || lower.includes('.flv')) mode = 'flv'
  else mode = 'mp4'

  if (mode === 'hls' || mode === 'flv') {
    try {
      await ensurePlayerLibs()
    } catch {
      if (seq !== attachSeq) return
      failNext('播放组件加载失败')
      return
    }
    if (seq !== attachSeq || videoRef.value !== video) return
  }

  if (mode === 'hls') {
    if (HlsLib && HlsLib.isSupported()) {
      const hls = new HlsLib({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,
      })
      hls.on(HlsLib.Events.ERROR, (_evt: any, data: any) => {
        if (data?.fatal) failNext(`HLS ${data.type}/${data.details}`)
      })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
        const p = video.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      })
      playerInstance = hls
      currentFormat = 'hls'
      srcIsMp4.value = false  // [FIX mp4-progress 2026-09-16] 非 mp4 候选隐藏进度条/快退快进
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.play().catch(() => {})
      currentFormat = 'hls'
      srcIsMp4.value = false
    } else {
      failNext('HLS 不受支持')
      return
    }
  } else if (mode === 'flv') {
    if (!flvjsLib || !flvjsLib.isSupported()) { failNext('flv.js 不受支持'); return }
    const player = flvjsLib.createPlayer({
      // [FIX nvr-playback] hasAudio=true + isLive=srcIsLive (回放传 false 启用 seek)
      type: 'flv', url, isLive: props.srcIsLive, hasAudio: true, hasVideo: true,
    }, {
      enableStashBuffer: false,
      stashInitialSize: 128,
      lazyLoad: false,
      // [FIX nvr-playback] 回放场景不需要直播追帧/追延迟; 直播场景默认 isLive=true 走追帧
      liveBufferLatencyChasing: props.srcIsLive,
    } as any)
    player.on(flvjsLib.Events.ERROR, (errorType: string, errorDetail: string) => {
      // [NVR-PB 2026-09-13] 非标/HEVC 编码标记 (文案分支) + destroy 后旧实例异步 emit 防护
      if (playerInstance !== player) return
      if (`${errorType}/${errorDetail}`.includes('CodecUnsupported')) h265Suspect.value = true
      failNext(`FLV ${errorType}/${errorDetail}`)
    })
    player.attachMediaElement(video)
    player.load()
    const p = player.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
    playerInstance = player
    currentFormat = isWs ? 'ws-flv' : 'flv'
    srcIsMp4.value = false  // [FIX mp4-progress 2026-09-16] 非 mp4 候选隐藏进度条/快退快进
  } else {
    // mp4 / blob / data / 其他原生可播地址 (录像文件直链走此路)
    video.src = url
    video.play().catch(() => {})
    currentFormat = 'mp4'
    srcIsMp4.value = true  // [FIX mp4-progress 2026-09-16] mp4 候选启用进度条+快退快进
  }

  // 真实首帧 (取代原“立即 playing”假首帧) + video 级错误监听 (flv.js 走自身 ERROR)
  video.addEventListener('playing', markPlaying)
  srcVideoErrorHandler = () => {
    if (!srcMode || currentFormat === 'flv' || currentFormat === 'ws-flv') return
    failNext('video error')
  }
  video.addEventListener('error', srcVideoErrorHandler)
  // [POPUP-3MIN 2026-09-11] 连播支持 (仅 mp4 直链; flv/hls 流为直播语义无文件时间轴):
  //   - seekStart: loadedmetadata 后 seek 到片内偏移 (首段从 T-90s 开播; moov 解析
  //     出 duration 才可 seek, 越界收敛到 [0, duration-0.5])
  //   - stopAt: timeupdate 采样到了即暂停并发 ended (末段 T+90s 截止; 0.2s 容差)
  //   - ended: 自然播完转发 (单次触发防重; 与 stopAt 之和构成"片播完"单一信号)
  if (currentFormat === 'mp4') {
    srcLoadedMetaHandler = () => {
      // [FIX mp4-progress 2026-09-16] 元数据就绪: 记录总时长供进度条显示
      srcDur.value = isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      const seek = props.seekStart
      if (seek && seek > 0.3 && isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(seek, Math.max(0, video.duration - 0.5))
      }
    }
    srcTimeUpdateHandler = () => {
      // [FIX mp4-progress 2026-09-16] 进度条当前时刻回写 (拖动中暂停, 松手后恢复)
      if (!isSeekingDrag.value) srcCur.value = video.currentTime
      if (srcEndedFired) return
      const stop = props.stopAt
      if (stop != null && video.currentTime >= stop - 0.2) {
        srcEndedFired = true
        video.pause()
        emit('ended')
      }
    }
    srcEndedHandler = () => {
      if (srcEndedFired) return
      srcEndedFired = true
      emit('ended')
    }
    video.addEventListener('loadedmetadata', srcLoadedMetaHandler)
    video.addEventListener('timeupdate', srcTimeUpdateHandler)
    video.addEventListener('ended', srcEndedHandler)
  } else {
    // [VCR-WIN 2026-09-18] 窗口回放 (非 mp4 源, NVR 回放流): timeupdate 回写流内相对
    //   秒 (winCur) 并上报父组件 — 父组件以 streamStart + relSec 估算已播绝对时刻
    //   (断流续播定位 + 进度行显示); flv 直播语义下 duration=NaN 不可依赖
    srcWinTimeUpdateHandler = () => {
      // [FIX seek-ux] 跳转挂起期冻结 winCur: 旧流续推不让乐观滑块/基准回退
      if (!isSeekingDrag.value && seekBaseMs.value == null) winCur.value = video.currentTime
      winStallSince = 0  // [VCR-WIN] 有推进 → 看门狗复位
      emit('progress', video.currentTime)
    }
    // [VCR-WIN-FIX 2026-09-18] 窗口模式流结束转发: NVR 回放为有限段推流, 服务端
    //   endOfStream 后 video 播完 buffer → ended + 自动暂停 (无 error、看门狗因
    //   paused 复位不触发) — 原实现该事件无人监听 → 父组件续播链永远收不到信号
    //   → 回放静默停在事件时刻之前。现同 mp4 语义转发 emit('ended'), 由父组件
    //   maybeResumeNvr 决定「续播 / 已播完终态」
    srcWinEndedHandler = () => {
      if (srcEndedFired) return
      srcEndedFired = true
      emit('ended')
    }
    video.addEventListener('timeupdate', srcWinTimeUpdateHandler)
    video.addEventListener('ended', srcWinEndedHandler)
  }
  watchFirstFrame()
}

// [VCR-WIN 2026-09-18] 窗口回放静默断流看门狗: flv.js 对流被服务端静默关闭可能既不报错
//   也不推进 (画面冻结且无任何事件) — 8s 无 timeupdate 推进且非暂停 → emit error 触发
//   父组件断点续播链 (暂停态不误报; 普通 mp4/直播路径不启用)
let winStallSince = 0
let winStallTimer: ReturnType<typeof setInterval> | null = null
function winStallCheck() {
  if (!isWindowPlayback.value) { winStallSince = 0; return }
  const video = videoRef.value
  if (!video || video.paused || video.ended) { winStallSince = 0; return }
  const now = Date.now()
  if (!winStallSince) { winStallSince = now; return }
  if (now - winStallSince >= 8000) {
    winStallSince = 0
    console.warn('[MiniPlayer] 窗口回放流 8s 无推进, 视为断流 (交父组件续播)')
    emit('error', '回放流中断')
  }
}
winStallTimer = setInterval(winStallCheck, 2000)

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
  // [POPUP-PLAYBACK 2026-09-11] src 模式: 从头重跑候选链 (/start 防抖对 src 无意义)
  if (srcMode) {
    srcIndex = 0
    nextTick(() => tryNextSrcCandidate())
    return
  }
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

// [FIX snapshot-dl 2026-09-16] 4. 命令式控制出口 (AlarmPopup Alt+A 快捷键等父组件场景):
//   父组件 ref → takeSnapshot() → emit('snapshot') → 父组件下载落盘
//   (defineExpose 同时补齐 play/pause 控制, 供父组件按需调用)
defineExpose({ takeSnapshot, toggleMute, togglePlay })

onBeforeUnmount(() => {
  clearAutoRetry()  // [P0-4] 清理退避定时器, 防止卸载后仍触发 startPlay
  if (winStallTimer) { clearInterval(winStallTimer); winStallTimer = null }  // [VCR-WIN] 看门狗清理
  clearSeekPending()  // [FIX seek-feedback] 跳转指示随卸载清理 (重建接替新实例)
  destroyPlayer()  // [Fix 2026-06-23] 防抖记录已移至 Pinia store，无需在此清理
})
</script>

<style scoped>
.mini-player {
  position: relative;
  width: 100%;
  height: 100%;  /* 占满父容器高度 (video 为 height:100%, 需要明确高度链) */
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
  z-index: 2;  /* [FIX mp4-playpause 2026-09-16] 高于暂停覆盖层 (z-index 1), 暂停时控件条可点 */
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 4px;
  background: linear-gradient(transparent, rgba(0,0,0,0.6));
}
/* [FIX seek-feedback 2026-09-19] 跳转受理指示: 重开信令期唯一可见反馈 (呼吸动画区分静态文案) */
.mini-player__seek-hint {
  align-self: center;
  font-size: 12px;
  color: #E6A23C;
  white-space: nowrap;
  animation: mini-seek-blink 1.2s ease-in-out infinite;
}
@keyframes mini-seek-blink { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
/* [FIX mp4-playpause 2026-09-16] 3.2 暂停覆盖层: 中央大播放按钮 (点击恢复) */
.mini-player__pause-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.25);
}
.mini-player__pause-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  border: 2px solid rgba(255, 255, 255, 0.85);
  color: #fff;
  font-size: 22px;
  line-height: 1;
  padding-left: 5px;  /* ▶ 字形视觉居中补偿 */
  user-select: none;
}
/* [FIX mp4-progress 2026-09-16] 3.4 mp4 回放进度条行 (控件条上方): 时间 + range + 总时长 */
.mini-player__progress {
  position: absolute;
  bottom: 34px;
  left: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 2;
  padding: 2px 4px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 4px;
}
.mini-player__time {
  flex: 0 0 auto;
  font-size: 11px;
  color: #aaddff;
  font-variant-numeric: tabular-nums;
  user-select: none;
}
.mini-player__range {
  flex: 1;
  min-width: 0;
  height: 4px;
  accent-color: #409eff;
  cursor: pointer;
}
/* [VCR-WIN 2026-09-18] 窗口进度条轨道容器: range + 事件时刻红标叠层锚点 */
.mini-player__track {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  /* [FIX seek-ux 2026-09-19] 指针拖拽命中带 (原仅 range input 本体 4px, 用户极易脱靶) */
  height: 16px;
  cursor: pointer;
  touch-action: none;  /* 触屏拖动不被页面滚动劫持 */
  user-select: none;
}
/* [FIX seek-ux] 指针交互统一由 track 承担 (mp4/窗口两条进度条共用) */
.mini-player__track .mini-player__range { width: 100%; pointer-events: none; }
.mini-player__evmark {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: #f56c6c;
  border-radius: 1px;
  pointer-events: none;
}
</style>
