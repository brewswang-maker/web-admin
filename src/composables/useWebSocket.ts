/**
 * WebSocket实时推送 Composable
 * 告警/设备状态/Agent状态实时更新
 */
import { ref, onUnmounted, reactive } from 'vue'

interface WSMessage {
  type: 'alarm' | 'device_status' | 'agent_status' | 'heartbeat'
  data: unknown
  timestamp: string
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
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5
  const reconnectDelay = 3000

  function connect(wsPath: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}${wsPath}`

    ws = new WebSocket(url)

    ws.onopen = () => {
      connected.value = true
      reconnectAttempts = 0
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        lastMessage.value = msg
        messages.push(msg)
        if (messages.length > 100) messages.splice(0, messages.length - 100)
        // Dispatch to subscribers
        const typeHandlers = handlers.get(msg.type)
        if (typeHandlers) {
          typeHandlers.forEach(handler => handler(msg.data))
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
    if (reconnectAttempts >= maxReconnectAttempts) return
    reconnectAttempts++
    reconnectTimer = setTimeout(() => connect(path || '/ws'), reconnectDelay * reconnectAttempts)
  }

  function send(data: unknown) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
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
  const { connected, lastMessage, messages, send, subscribe } = useWebSocket('/ws/alarms')
  const newAlarms = reactive<unknown[]>([])

  subscribe('alarm', (data: unknown) => {
    newAlarms.push(data)
  })

  return { connected, lastMessage, messages, newAlarms, send }
}
