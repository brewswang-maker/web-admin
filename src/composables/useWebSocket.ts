/**
 * WebSocket实时推送 Composable
 * 告警/设备状态/Agent状态实时更新
 */
import { ref, onUnmounted, reactive } from 'vue'

interface WSMessage {
  // [FIX 2026-08-22] 放宽为 string: 后端实际推送 'alarm.new'/'linkage_alarm'/
  //   'system.dashboard_alert'/'system.device_status'/'detection_result' 等
  //   多种 type, 原联合类型字面量与实际不符 (仅编译期约束, 运行时未校验)。
  type: string
  data: unknown
  timestamp: string
}

/**
 * [FIX 2026-08-22] 后端推送 type → 页面订阅 type 的别名归一化表。
 * 后端推送 (RestApiHandlers): 'alarm.new' (pushAlarm 默认) / 'linkage_alarm'
 * (WEB_POPUP 联动) / 'system.dashboard_alert' (pushSystemEvent 前缀拼接) /
 * 'system.device_status', 而页面 (DashboardView/SituationScreen 等) 订阅的是
 * 'alarm'/'device_status' → 精确匹配 miss, 推送被静默丢弃 → 首页不实时。
 * 策略: 仅当原始 type 无订阅者时才按归一化别名匹配, 避免同一消息双分发
 * (FaceRealtimeView/useAlarmStream 已同时订阅 'alarm'+'alarm.new', 不受影响)。
 */
const TYPE_ALIASES: Record<string, string> = {
  'alarm.new': 'alarm',
  'linkage_alarm': 'alarm',
  'dashboard_alert': 'alarm',
  'system.dashboard_alert': 'alarm',
  'system.device_status': 'device_status',
}

type MessageHandler = (data: any) => void

export function useWebSocket(path?: string) {
  const connected = ref(false)
  const lastMessage = ref<WSMessage | null>(null)
  const messages = reactive<WSMessage[]>([])
  const error = ref<Event | null>(null)
  const handlers = new Map<string, Set<MessageHandler>>()

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let reconnectAttempts = 0
  let disposed = false
  // [FIX 2026-08-03] 重连不再设上限 (原 5 次后永久放弃, 后台标签页被节流时
  //   45s 内 5 次重连全部失败 → 数据永久断流)。改为指数退避封顶 30s 无限重连。
  const reconnectBaseDelay = 3000
  const reconnectMaxDelay = 30000

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() })) } catch { /* ignore */ }
      }
    }, 30000)
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  }

  function connect(wsPath: string) {
    if (disposed) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}${wsPath}`

    ws = new WebSocket(url)

    ws.onopen = () => {
      connected.value = true
      reconnectAttempts = 0
      startHeartbeat()
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        lastMessage.value = msg
        messages.push(msg)
        if (messages.length > 100) messages.splice(0, messages.length - 100)
        // Dispatch to subscribers
        // 兼容两种载荷字段名: msg.data(pushSystemEvent) / msg.alarm(pushAlarm)
        // [FIX 2026-08-22] 先按原始 type 精确匹配, 无订阅者再按归一化别名匹配
        const rawType = String(msg.type ?? '')
        const normType = TYPE_ALIASES[rawType]
        const typeHandlers = handlers.get(rawType) ?? (normType ? handlers.get(normType) : undefined)
        if (typeHandlers) {
          const payload = (msg as any).data ?? (msg as any).alarm ?? msg
          typeHandlers.forEach(handler => handler(payload))
        }
        // Also notify wildcard subscribers
        const wildcardHandlers = handlers.get('*')
        if (wildcardHandlers) {
          wildcardHandlers.forEach(handler => handler(msg))
        }
      } catch {
        console.warn('[WS] Failed to parse message')
      }
    }

    ws.onclose = () => {
      connected.value = false
      attemptReconnect()
    }

    ws.onerror = (e) => {
      error.value = e
    }
  }

  function attemptReconnect() {
    if (disposed) return
    if (reconnectTimer) return
    reconnectAttempts++
    const delay = Math.min(reconnectBaseDelay * Math.pow(2, reconnectAttempts - 1), reconnectMaxDelay)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect(path || '/ws')
    }, delay)
  }

  // [FIX 2026-08-03] 标签页重新可见时立即检查连接: 后台节流期间重连定时器
  //   可能被压滞, 回来后若连接已死则立即重建, 不等退避周期。
  function onVisibilityChange() {
    if (document.hidden || disposed) return
    const state = ws ? ws.readyState : WebSocket.CLOSED
    if (state === WebSocket.CLOSED || state === WebSocket.CLOSING) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      reconnectAttempts = 0
      connect(path || '/ws')
    }
  }

  function send(data: unknown) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }

  function disconnect() {
    disposed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    stopHeartbeat()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (ws) ws.close()
    ws = null
    connected.value = false
  }

  /** Subscribe to a specific message type */
  function subscribe(type: string, handler: MessageHandler): () => void {
    if (!handlers.has(type)) {
      handlers.set(type, new Set())
    }
    handlers.get(type)!.add(handler)
    // Return unsubscribe function
    return () => {
      handlers.get(type)?.delete(handler)
    }
  }

  // Auto-connect if path provided
  if (path) {
    connect(path)
    document.addEventListener('visibilitychange', onVisibilityChange)
    onUnmounted(disconnect)
  } else {
    onUnmounted(() => {
      disconnect()
      handlers.clear()
    })
  }

  return { connected, lastMessage, messages, error, send, disconnect, subscribe }
}

/** 告警推送专用 */
export function useAlarmStream() {
  const { connected, lastMessage, messages, send, subscribe } = useWebSocket('/ws')
  const newAlarms = reactive<unknown[]>([])

  subscribe('alarm', (data: unknown) => {
    newAlarms.push(data)
  })
  // Also handle alarm.new from pushAlarm
  subscribe('alarm.new', (data: unknown) => {
    newAlarms.push(data)
  })

  return { connected, lastMessage, messages, newAlarms, send }
}
