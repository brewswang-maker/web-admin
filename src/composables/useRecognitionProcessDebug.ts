/**
 * 华盾AI智能视频盒子 v7.0 - 识别过程调试 Composable
 * composables/useRecognitionProcessDebug.ts — REST 拉取 + 可选轮询,
 *   为 RecognitionProcessDebugPanel (调试页) 提供数据.
 *
 * 设计要点:
 *  1. [FEAT face-recog-process 2026-09-28 C 形态] 调试面板是事后回看, 不需要 WS 30Hz 推送.
 *     REST 端点 GET /api/v1/face/recognition-process/latest (RestApiHandlers L34148) 已真实化,
 *     调 PluginManager 拿 face_detector 实例 + getRecognitionProcessJSON + ?channel_id 过滤.
 *  2. 可选 2Hz 轮询: 调试场景下慢一点也能看清 (≤2s 延迟即可); 不用 WS 节省推送开销.
 *  3. 错误分类:
 *     - 503 = 插件未加载 → "face_detector 插件未启用"
 *     - 204 = 插件加载但未推理 → "暂无识别过程数据"
 *     - 200 = 正常
 *     - 网络错误 → "REST 调用失败"
 *  4. onUnmounted 自动停止轮询 + 清理 timer.
 */
import { ref, onUnmounted, shallowRef } from 'vue'
import faceApi, { type RecognitionProcessDebugData } from '@/api/face'

/** 拉取状态 */
export type DebugFetchState =
  | 'idle'      // 初始, 未拉取
  | 'loading'   // 拉取中
  | 'empty'     // 200 但无数据 (204 也归此类)
  | 'success'   // 拉取成功
  | 'no_plugin' // 503 插件未加载
  | 'error'     // 网络/其他错误

/** useRecognitionProcessDebug 选项 */
export interface UseRecognitionProcessDebugOptions {
  /** 仅拉取该 channel_id 的过程; undefined = 最新一帧 (不限通道) */
  channelId?: number
  /** 是否开启自动轮询 (默认 false, 用户手动控制) */
  autoPoll?: boolean
  /** 轮询间隔 (毫秒), 默认 500ms = 2Hz (调试场景平衡实时性与带宽) */
  pollIntervalMs?: number
}

const DEFAULT_POLL_INTERVAL_MS = 500

/** useRecognitionProcessDebug 返回 API */
export interface UseRecognitionProcessDebugReturn {
  /** 最新一帧调试数据 (shallowRef, 整个对象替换) */
  data: ReturnType<typeof shallowRef<RecognitionProcessDebugData | null>>
  /** 拉取状态 */
  state: ReturnType<typeof ref<DebugFetchState>>
  /** 错误信息 (state==='error' 时显示) */
  errorMessage: ReturnType<typeof ref<string>>
  /** 最后一次拉取时间戳 (Date.now()) */
  lastFetchedAt: ReturnType<typeof ref<number>>
  /** 是否在轮询中 */
  polling: ReturnType<typeof ref<boolean>>
  /** 手动触发一次拉取 */
  refresh: () => Promise<void>
  /** 启动轮询 (已启动则忽略) */
  startPolling: () => void
  /** 停止轮询 */
  stopPolling: () => void
}

export function useRecognitionProcessDebug(
  options: UseRecognitionProcessDebugOptions = {},
): UseRecognitionProcessDebugReturn {
  const {
    channelId,
    autoPoll = false,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = options

  const data = shallowRef<RecognitionProcessDebugData | null>(null)
  const state = ref<DebugFetchState>('idle')
  const errorMessage = ref<string>('')
  const lastFetchedAt = ref<number>(0)
  const polling = ref<boolean>(false)

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let inFlight = false  // 防重叠: 上一轮未完成则跳过本轮 (避免积压)

  async function refresh(): Promise<void> {
    if (inFlight) return
    inFlight = true
    state.value = 'loading'
    try {
      // [FIX vuetsc-axios 2026-09-28] http.ts 返回的是 AxiosResponse<T>, data 才是后端包体
      //   FaceDatabaseResponse<T> = { code, message, data, timestamp }; 外层 resp 没有 code 字段.
      //   参考 FaceDatabaseView.vue L547 正确解包: res.data.code === 0.
      const resp = await faceApi.getRecognitionProcessLatest(
        channelId !== undefined ? { channel_id: channelId } : {},
      )
      const body = resp.data
      // 后端响应约定: 200 + data 非空 = success; 503 = no_plugin; 204 = empty
      if (body.code === 0 && body.data) {
        data.value = body.data
        state.value = 'success'
      } else if (body.code === 204 || (body.code === 0 && !body.data)) {
        data.value = null
        state.value = 'empty'
      } else if (body.code === 503) {
        data.value = null
        state.value = 'no_plugin'
        errorMessage.value = body.message || 'face_detector 插件未加载'
      } else {
        // 其他非 0 code: 视为业务错误 (例如 404 channel_id mismatch)
        data.value = null
        state.value = 'empty'
        if (body.message) errorMessage.value = body.message
      }
      lastFetchedAt.value = Date.now()
    } catch (e: any) {
      // 网络/超时 → 'error'
      data.value = null
      state.value = 'error'
      // 兼容 axios 错误与 fetch 错误
      const msg = e?.response?.data?.message ?? e?.message ?? String(e)
      errorMessage.value = msg || 'REST 调用失败'
    } finally {
      inFlight = false
    }
  }

  function startPolling(): void {
    if (pollTimer !== null) return
    polling.value = true
    // 立即拉一次, 然后按间隔轮询
    refresh()
    pollTimer = setInterval(refresh, pollIntervalMs)
  }

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    polling.value = false
  }

  // autoPoll 开启时直接启动
  if (autoPoll) {
    startPolling()
  }

  onUnmounted(() => {
    stopPolling()
  })

  return {
    data,
    state,
    errorMessage,
    lastFetchedAt,
    polling,
    refresh,
    startPolling,
    stopPolling,
  }
}