/**
 * 华盾AI智能视频盒子 v7.0 - WebSocket 主题订阅 Composable
 * composables/useWebSocketTopic.ts — 基于 useWebSocket 的强类型 topic 订阅封装
 *
 * Phase 13 P3 #1: 提供 useWebSocketTopic(topic, handler) 糖, 内部用 WS_TOPICS 枚举
 * 避免硬编码字符串; 共享单例 WebSocket 连接 (按 path 维度), 多组件订阅同一 topic
 * 不会创建多个 WS 连接
 */

import { onUnmounted } from 'vue'
import { useWebSocket } from './useWebSocket'
import { WS_TOPICS, type WsTopic, type WsMessageHandler, type WsPayload } from './wsTopics'

/** 简易共享连接注册表 (按 path) */
const pathConnections = new Map<string, ReturnType<typeof useWebSocket>>()

/** 获取或创建共享 WebSocket 连接 */
function getSharedConnection(path: string): ReturnType<typeof useWebSocket> {
  let conn = pathConnections.get(path)
  if (!conn) {
    conn = useWebSocket(path)
    pathConnections.set(path, conn)
  }
  return conn
}

/** 订阅单个 topic (返回 unsubscribe) */
export function useWebSocketTopic<T = unknown>(
  topic: WsTopic | string,
  handler: WsMessageHandler<T>,
  options: { path?: string; immediate?: boolean } = {}
) {
  const { path = '/ws', immediate = true } = options
  const conn = getSharedConnection(path)
  let unsub: (() => void) | null = null
  if (immediate) {
    unsub = conn.subscribe(topic, (data: any) => {
      const raw: WsPayload<T> = { type: topic, data, timestamp: new Date().toISOString() }
      handler(data as T, raw)
    })
  }
  onUnmounted(() => {
    unsub?.()
  })
  return {
    connected: conn.connected,
    error: conn.error,
    disconnect: () => conn.disconnect(),
    send: conn.send,
  }
}

/** 订阅多个 topic (任一触发都回调, 第二个参数为触发的 topic) */
export function useWebSocketTopics<T = unknown>(
  topics: Array<WsTopic | string>,
  handler: (topic: string, data: T) => void,
  options: { path?: string } = {}
) {
  const { path = '/ws' } = options
  const conn = getSharedConnection(path)
  const unsubs: Array<() => void> = []
  for (const t of topics) {
    unsubs.push(
      conn.subscribe(t, (data: any) => {
        handler(t, data as T)
      })
    )
  }
  onUnmounted(() => {
    unsubs.forEach(u => u())
  })
  return {
    connected: conn.connected,
    send: conn.send,
  }
}

/** 订阅告警事件 (高频使用, 走 useWebSocket 内置 path '/ws/alarms') */
export function useAlarmEvents<T = unknown>(handler: WsMessageHandler<T>) {
  return useWebSocketTopic<T>(WS_TOPICS.ALARM_NEW, handler, { path: '/ws/alarms' })
}

/** 订阅设备状态变更 */
export function useDeviceStatusEvents<T = unknown>(handler: WsMessageHandler<T>) {
  return useWebSocketTopics<T>(
    [WS_TOPICS.DEVICE_ONLINE, WS_TOPICS.DEVICE_OFFLINE, WS_TOPICS.DEVICE_ERROR],
    (topic, data) => handler(data, { type: topic, data }),
    { path: '/ws/devices' }
  )
}

/** 订阅 Agent 状态 */
export function useAgentStatusEvents<T = unknown>(handler: WsMessageHandler<T>) {
  return useWebSocketTopic<T>(WS_TOPICS.AGENT_STATUS, handler, { path: '/ws/agents' })
}

export { WS_TOPICS, type WsTopic, type WsMessageHandler, type WsPayload }
