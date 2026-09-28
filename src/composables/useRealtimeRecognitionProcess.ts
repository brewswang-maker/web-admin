/**
 * 华盾AI智能视频盒子 v7.0 - 实时识别过程 Composable
 * composables/useRealtimeRecognitionProcess.ts — 订阅 WS_TOPICS.RECOGNITION_PROCESS,
 *   为 RecognitionProcessLivePanel 提供节流 + per-channel 环形缓冲的最新一帧数据.
 *
 * 设计要点:
 *  1. [FEAT face-recog-process 2026-09-28 B 形态] 后端 face_detector 推理末尾每帧推 WS
 *     (face.recognition.process, 紧凑 JSON). 30 fps 视频 = 30 Hz 推送; 若前端直接 setRef
 *     会触发 30 次/秒视图重渲染 → 200ms 节流 → 实际刷新 ≤5 Hz, UI 流畅且保留过程感.
 *  2. per-channel 环形缓冲 (默认 60 帧 = ~2s @ 30fps): RecognitionProcessLivePanel 折线图
 *     数据源. 新帧到达时 push 进去, 超过上限 shift 最早的 (O(1)).
 *  3. channel_id 过滤: 调用方可指定 channelFilter, 仅缓存该通道帧 (LiveView 默认传当前激活通道,
 *     AlarmsView 不传 = 全量). 多通道场景下避免污染其他通道折线.
 *  4. onUnmounted 自动 unsubscribe + 清理 buffer + 清理节流 timer.
 */
import { ref, reactive, onUnmounted, shallowRef } from 'vue'
import { useWebSocket } from './useWebSocket'
import { WS_TOPICS } from './wsTopics'

/**
 * 实时识别过程单帧数据结构 (与后端 face_detector.cpp RP pushSystemEvent 紧凑 JSON 对齐)
 * 字段命名严格 1:1 对应, 不要在中间层做 key 转换.
 */
export interface RecognitionProcessFrame {
  channel_id: number
  frame_id: number
  timestamp_ms: number
  // 六段时间 (毫秒) — 与 stages_desc 元数据一一对应
  preprocess_ms: number
  detection_ms: number
  nms_ms: number
  quality_ms: number
  recognition_ms: number
  alarm_ms: number
  // 总耗时 (毫秒, 由后端 sum 给出)
  total_ms: number
  // 计数指标
  faces_detected: number
  faces_after_nms: number
  faces_passed: number
  faces_recognized: number
  alarms_triggered: number
  // 匹配详情 (后端限长 5, 见 face_detector.cpp constexpr kMaxMatchedShown = 5)
  matched_person_ids: string[]
  similarities: number[]
  alarm_types: string[]
  // 状态
  success: boolean
  // 本地接收时间戳 (Date.now(), 用于节流时序判定)
  received_at_ms?: number
}

/** useRealtimeRecognitionProcess 选项 */
export interface UseRealtimeRecognitionProcessOptions {
  /** 仅缓存该 channel_id 的帧 (LiveView 用例); undefined = 全部通道 */
  channelId?: number
  /** 环形缓冲上限 (帧数). 默认 60 ≈ 30fps 下 2 秒历史. */
  bufferSize?: number
  /** 节流刷新间隔 (毫秒). 默认 200ms = 5Hz, 平衡过程感与渲染负载. */
  throttleMs?: number
}

/** useRealtimeRecognitionProcess 返回 API */
export interface UseRealtimeRecognitionProcessReturn {
  /** 当前过滤后最新一帧 (节流刷新) */
  currentFrame: ReturnType<typeof ref<RecognitionProcessFrame | null>>
  /** 当前 channel_id 下历史环形缓冲 (按时间正序, 最新在末尾) */
  history: RecognitionProcessFrame[]
  /** 所有通道最新一帧 Map<channel_id, frame> (节流刷新) — 多通道总览用 */
  channelLatestMap: Record<number, RecognitionProcessFrame>
  /** 全局最新一帧 (不论 channel, 节流刷新) — 给调试栏顶部信息条用 */
  rawLatest: ReturnType<typeof ref<RecognitionProcessFrame | null>>
  /** WS 连接状态 (来自 useWebSocket) */
  connected: ReturnType<typeof ref<boolean>>
  /** 累计接收帧数 (诊断用) */
  totalReceived: ReturnType<typeof ref<number>>
  /** 清空历史 buffer (切换通道/调试时手动调用) */
  reset: () => void
}

const DEFAULT_BUFFER_SIZE = 60
const DEFAULT_THROTTLE_MS = 200

export function useRealtimeRecognitionProcess(
  options: UseRealtimeRecognitionProcessOptions = {},
): UseRealtimeRecognitionProcessReturn {
  const {
    channelId,
    bufferSize = DEFAULT_BUFFER_SIZE,
    throttleMs = DEFAULT_THROTTLE_MS,
  } = options

  // shallowRef: frame 内部字段会被覆写 (整个对象替换), 不需要深响应
  const rawLatest = shallowRef<RecognitionProcessFrame | null>(null)
  const currentFrame = shallowRef<RecognitionProcessFrame | null>(null)
  const totalReceived = ref(0)
  const channelLatestMap = reactive<Record<number, RecognitionProcessFrame>>({})

  // 当前 channel 的环形缓冲 (reactive 数组, push/shift)
  const history = reactive<RecognitionProcessFrame[]>([])

  // 节流: 收集 buffer + 到时间点批量 flush 到视图
  let throttleTimer: ReturnType<typeof setTimeout> | null = null
  let pendingFlush = false

  function flush(): void {
    throttleTimer = null
    if (!pendingFlush) return
    pendingFlush = false
    // 把 rawLatest 推到 currentFrame (触发响应)
    if (channelId !== undefined) {
      const chFrame = channelLatestMap[channelId]
      currentFrame.value = chFrame ?? null
    } else {
      currentFrame.value = rawLatest.value
    }
  }

  function scheduleFlush(): void {
    if (throttleTimer !== null) return
    throttleTimer = setTimeout(flush, throttleMs)
  }

  // ── WS 订阅 ──
  // useWebSocket('/ws') 共享全局单例 (L182-195 useAlarmStream 同款模式), 多组件订阅互不影响
  const { connected, subscribe } = useWebSocket('/ws')

  const unsubscribe = subscribe(WS_TOPICS.RECOGNITION_PROCESS, (data: unknown) => {
    const f = data as RecognitionProcessFrame
    if (!f || typeof f.channel_id !== 'number') return
    f.received_at_ms = Date.now()

    // 全局最新 (浅替换)
    rawLatest.value = f

    // per-channel 最新 (reactive Map, 触发监听)
    channelLatestMap[f.channel_id] = f

    totalReceived.value++

    // 环形缓冲 (仅在 channelId 匹配时)
    if (channelId === undefined || f.channel_id === channelId) {
      history.push(f)
      while (history.length > bufferSize) history.shift()
    }

    scheduleFlush()
  })

  function reset(): void {
    history.splice(0, history.length)
    // 不清 rawLatest / channelLatestMap — 全局共享状态, 重置仅清本地缓冲
    pendingFlush = false
    if (throttleTimer !== null) {
      clearTimeout(throttleTimer)
      throttleTimer = null
    }
    currentFrame.value = null
  }

  onUnmounted(() => {
    unsubscribe()
    if (throttleTimer !== null) {
      clearTimeout(throttleTimer)
      throttleTimer = null
    }
  })

  return {
    currentFrame,
    history,
    channelLatestMap,
    rawLatest,
    connected,
    totalReceived,
    reset,
  }
}