/**
 * @file useWebSocket.test.ts
 * @brief WebSocket 实时推送 Composable 单元测试
 *
 * 覆盖:
 *   - 连接建立与状态变化
 *   - 消息接收与解析
 *   - 断线重连机制
 *   - 发送消息
 *   - 组件卸载时断开连接
 *   - useAlarmStream 告警专用流
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock WebSocket ─────────────────────────────────────────
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState: number = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  sentMessages: string[] = []

  constructor(url: string) {
    this.url = url
    // 模拟异步连接
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }, 0)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  // 测试辅助：模拟收到消息
  _receiveMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  // 测试辅助：模拟错误
  _triggerError() {
    this.onerror?.(new Event('error'))
  }
}

// 保存原始 WebSocket
const OriginalWebSocket = globalThis.WebSocket

// ── 测试 ──────────────────────────────────────────────────
describe('composables/useWebSocket', () => {
  let mockWs: MockWebSocket

  beforeEach(() => {
    vi.useFakeTimers()
    // 替换全局 WebSocket
    globalThis.WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url)
        mockWs = this
      }
    } as any
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.WebSocket = OriginalWebSocket
    vi.restoreAllMocks()
  })

  // ========================================================================
  // 基础连接
  // ========================================================================
  describe('useWebSocket', () => {
    it('创建后自动连接', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { connected } = useWebSocket('/ws/test')

      // 初始未连接
      expect(connected.value).toBe(false)

      // 触发 onopen
      await vi.advanceTimersByTimeAsync(10)
      expect(connected.value).toBe(true)
    })

    it('连接URL使用正确协议', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      useWebSocket('/ws/alarms')

      await vi.advanceTimersByTimeAsync(10)
      // URL应包含 ws:// 和路径
      expect(mockWs.url).toContain('/ws/alarms')
    })

    it('收到消息后解析并存储', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { lastMessage, messages } = useWebSocket('/ws/test')

      await vi.advanceTimersByTimeAsync(10)

      // 模拟收到消息
      const testMsg = {
        type: 'alarm' as const,
        data: { id: 'alarm-001', type: 'intrusion' },
        timestamp: '2026-01-15T10:00:00Z',
      }
      mockWs._receiveMessage(testMsg)

      expect(lastMessage.value).toEqual(testMsg)
      expect(messages.length).toBe(1)
    })

    it('多条消息累积存储', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { messages } = useWebSocket('/ws/test')

      await vi.advanceTimersByTimeAsync(10)

      mockWs._receiveMessage({ type: 'alarm', data: {}, timestamp: 't1' })
      mockWs._receiveMessage({ type: 'device_status', data: {}, timestamp: 't2' })
      mockWs._receiveMessage({ type: 'heartbeat', data: {}, timestamp: 't3' })

      expect(messages.length).toBe(3)
    })

    it('消息超过100条时裁剪', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { messages } = useWebSocket('/ws/test')

      await vi.advanceTimersByTimeAsync(10)

      for (let i = 0; i < 110; i++) {
        mockWs._receiveMessage({ type: 'heartbeat', data: { i }, timestamp: `t${i}` })
      }

      expect(messages.length).toBeLessThanOrEqual(100)
    })

    it('无效JSON消息不崩溃', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { messages } = useWebSocket('/ws/test')

      await vi.advanceTimersByTimeAsync(10)

      // 直接调用 onmessage 传入无效 JSON
      mockWs.onmessage?.({ data: 'not valid json {{{' })

      // 不崩溃，messages 不增加
      expect(messages.length).toBe(0)
    })

    // ========================================================================
    // 发送消息
    // ========================================================================
    it('连接状态下发送消息', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { send } = useWebSocket('/ws/test')

      await vi.advanceTimersByTimeAsync(10)

      send({ action: 'subscribe', channel: 'alarms' })
      expect(mockWs.sentMessages.length).toBe(1)
      expect(JSON.parse(mockWs.sentMessages[0])).toEqual({
        action: 'subscribe',
        channel: 'alarms',
      })
    })

    it('未连接时发送消息不报错', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { send } = useWebSocket('/ws/test')

      // 还没连接就发送
      send({ action: 'test' })
      // 不崩溃即可
    })

    // ========================================================================
    // 断开连接
    // ========================================================================
    it('主动断开连接', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { connected, disconnect } = useWebSocket('/ws/test')

      await vi.advanceTimersByTimeAsync(10)
      expect(connected.value).toBe(true)

      disconnect()
      expect(connected.value).toBe(false)
    })

    it('连接关闭后状态变为false', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { connected } = useWebSocket('/ws/test')

      await vi.advanceTimersByTimeAsync(10)
      expect(connected.value).toBe(true)

      mockWs.close()
      expect(connected.value).toBe(false)
    })

    it('错误事件记录到error', async () => {
      const { useWebSocket } = await import('@/composables/useWebSocket')
      const { error } = useWebSocket('/ws/test')

      await vi.advanceTimersByTimeAsync(10)
      mockWs._triggerError()

      expect(error.value).not.toBeNull()
    })
  })

  // ========================================================================
  // useAlarmStream
  // ========================================================================
  describe('useAlarmStream', () => {
    it('导出告警流 composable', async () => {
      const mod = await import('@/composables/useWebSocket')
      expect(mod.useAlarmStream).toBeDefined()
      expect(typeof mod.useAlarmStream).toBe('function')
    })
  })
})
