/**
 * 华盾AI智能视频盒子 v7.0 - 告警 SSE Stream Composable
 * composables/useAlarmStreamSSE.ts — 通过 fetch + ReadableStream 订阅 /api/v1/alarms/stream
 *
 * Phase 13 P2 #2: 与 useWebSocket 互补的 SSE 通道, 当 WebSocket 不可用或鉴权 header 无法
 * 通过 EventSource 发送时, 使用本 composable 走 fetch+ReadableStream 拉取告警推送
 *
 * 注意: useWebSocket.ts 已导出 useAlarmStream(走 WebSocket), 本 composable 走 SSE 命名 SSE
 * 后缀避免命名冲突
 */

import { ref, onUnmounted } from 'vue'
import { useAlarmStore } from '@/stores/alarm'
import type { AlarmEvent } from '@/types/alarm'

export interface AlarmStreamMessage {
  event: 'connected' | 'alarm' | 'heartbeat' | 'error'
  data: any
  ts: number
}

export interface UseAlarmStreamOptions {
  /** 自动重连 (默认 true) */
  autoReconnect?: boolean
  /** 重连退避基准 ms (默认 3000) */
  reconnectBaseMs?: number
  /** 最大重连次数 (默认 10, 0=无限) */
  maxReconnect?: number
  /** 收到 alarm 时的额外回调 (store 自动 push 之后) */
  onAlarm?: (alarm: AlarmEvent) => void
  /** 收到 error 时的额外回调 */
  onError?: (err: Error) => void
}

export function useAlarmStream(options: UseAlarmStreamOptions = {}) {
  const {
    autoReconnect = true,
    reconnectBaseMs = 3000,
    maxReconnect = 10,
    onAlarm,
    onError,
  } = options

  const alarmStore = useAlarmStore()

  const connected = ref(false)
  const lastEventAt = ref<number>(0)
  const reconnectCount = ref(0)
  const totalAlarms = ref(0)

  let controller: AbortController | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function buildUrl(): string {
    const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
    return `${baseURL}/alarms/stream`
  }

  function getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem('shield_token') || sessionStorage.getItem('shield_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  function scheduleReconnect() {
    if (!autoReconnect || stopped) return
    if (maxReconnect > 0 && reconnectCount.value >= maxReconnect) return
    clearReconnect()
    const delay = Math.min(reconnectBaseMs * Math.pow(1.5, reconnectCount.value), 30000)
    reconnectCount.value++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  async function connect() {
    if (stopped) return
    clearReconnect()
    controller = new AbortController()
    connected.value = false
    try {
      const resp = await fetch(buildUrl(), {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...getAuthHeader(),
        },
        signal: controller.signal,
        credentials: 'include',
      })
      if (!resp.ok) {
        const err = new Error(`SSE HTTP ${resp.status} ${resp.statusText}`)
        onError?.(err)
        scheduleReconnect()
        return
      }
      if (!resp.body) {
        const err = new Error('SSE response has no body')
        onError?.(err)
        scheduleReconnect()
        return
      }
      connected.value = true
      reconnectCount.value = 0
      lastEventAt.value = Date.now()

      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // SSE 事件以 \n\n 分隔
        const blocks = buf.split('\n\n')
        buf = blocks.pop() ?? ''
        for (const block of blocks) {
          if (!block.trim()) continue
          const dataLines: string[] = []
          for (const line of block.split('\n')) {
            if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
          }
          if (!dataLines.length) continue
          const payload = dataLines.join('\n')
          handleMessage(payload)
          lastEventAt.value = Date.now()
        }
      }
      // 流自然结束 → 尝试重连
      connected.value = false
      scheduleReconnect()
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      connected.value = false
      onError?.(err instanceof Error ? err : new Error(String(err)))
      scheduleReconnect()
    }
  }

  function handleMessage(raw: string) {
    let msg: AlarmStreamMessage | null = null
    try {
      const parsed = JSON.parse(raw)
      // 后端 SSE 数据包: { event, data, code, message, ts? }
      // /api/v1/alarms/stream 当前返回: { event: 'connected', data: {} }
      msg = {
        event: parsed.event ?? 'alarm',
        data: parsed.data ?? parsed,
        ts: parsed.ts ?? Date.now(),
      }
    } catch {
      msg = { event: 'alarm', data: raw, ts: Date.now() }
    }
    if (!msg) return
    if (msg.event === 'connected' || msg.event === 'heartbeat') return
    if (msg.event === 'alarm' && msg.data) {
      const alarm = msg.data as AlarmEvent
      alarmStore.pushRealtimeAlarm(alarm)
      totalAlarms.value++
      onAlarm?.(alarm)
      return
    }
    if (msg.event === 'error') {
      onError?.(new Error(JSON.stringify(msg.data)))
    }
  }

  function stop() {
    stopped = true
    clearReconnect()
    if (controller) {
      controller.abort()
      controller = null
    }
    connected.value = false
  }

  function start() {
    stopped = false
    reconnectCount.value = 0
    connect()
  }

  onUnmounted(() => {
    stop()
  })

  return {
    connected,
    lastEventAt,
    reconnectCount,
    totalAlarms,
    start,
    stop,
  }
}
