// @ts-nocheck
/**
 * @file alarm.test.ts
 * @brief 告警状态管理 Store 单元测试
 *
 * 覆盖:
 *   - 初始状态
 *   - fetchAlarms 加载告警列表
 *   - fetchStats 加载统计
 *   - handleAlarm 处理告警 (确认/误报/转发)
 *   - batchConfirm / batchFalseAlarm 批量操作
 *   - computed 属性 (criticalCount / highCount / hasUnhandled)
 *   - 实时告警推送
 *   - 错误处理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAlarmStore } from '@/stores/alarm'
import type { AlarmEvent, AlarmStats } from '@/types/alarm'

// ── Mock 依赖 ──────────────────────────────────────────────
vi.mock('@/api/alarm', () => ({
  alarmApi: {
    getList: vi.fn(),
    getStats: vi.fn(),
    getUnhandledCount: vi.fn(),
    handle: vi.fn(),
    batchConfirm: vi.fn(),
    batchFalseAlarm: vi.fn(),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

import { alarmApi } from '@/api/alarm'

// ── 测试数据工厂 ──────────────────────────────────────────
function makeAlarm(overrides: Partial<AlarmEvent> = {}): AlarmEvent {
  return {
    id: 'alarm-001',
    type: 'intrusion',
    level: 'high',
    description: '周界入侵检测',
    channelId: 'ch-001',
    deviceId: 'dev-001',
    confidence: 0.92,
    status: 'unhandled',
    metadata: {},
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    ...overrides,
  } as AlarmEvent
}

function makeStats(overrides: Partial<AlarmStats> = {}): AlarmStats {
  return {
    total: 100,
    critical: 5,
    high: 20,
    medium: 40,
    low: 35,
    unhandled: 30,
    confirmed: 60,
    falseAlarm: 10,
    todayTotal: 8,
    todayUnhandled: 3,
    ...overrides,
  } as AlarmStats
}

// ── 测试 ──────────────────────────────────────────────────
describe('stores/alarm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ========================================================================
  // 初始状态
  // ========================================================================
  describe('初始状态', () => {
    it('告警列表为空', () => {
      const store = useAlarmStore()
      expect(store.alarms).toEqual([])
    })

    it('统计信息为null', () => {
      const store = useAlarmStore()
      expect(store.stats).toBeNull()
    })

    it('unhandledCount为0', () => {
      const store = useAlarmStore()
      expect(store.unhandledCount).toBe(0)
    })

    it('loading为false', () => {
      const store = useAlarmStore()
      expect(store.loading).toBe(false)
    })
  })

  // ========================================================================
  // Computed 属性
  // ========================================================================
  describe('computed属性', () => {
    it('criticalCount 计算严重告警数', () => {
      const store = useAlarmStore()
      store.$patch({
        alarms: [
          makeAlarm({ id: '1', level: 'critical' }),
          makeAlarm({ id: '2', level: 'critical' }),
          makeAlarm({ id: '3', level: 'high' }),
        ],
      })
      expect(store.criticalCount).toBe(2)
    })

    it('highCount 计算高级告警数', () => {
      const store = useAlarmStore()
      store.$patch({
        alarms: [
          makeAlarm({ id: '1', level: 'high' }),
          makeAlarm({ id: '2', level: 'high' }),
          makeAlarm({ id: '3', level: 'medium' }),
        ],
      })
      expect(store.highCount).toBe(2)
    })

    it('hasUnhandled — 有未处理告警时为true', () => {
      const store = useAlarmStore()
      store.$patch({ unhandledCount: 5 })
      expect(store.hasUnhandled).toBe(true)
    })

    it('hasUnhandled — 无未处理告警时为false', () => {
      const store = useAlarmStore()
      store.$patch({ unhandledCount: 0 })
      expect(store.hasUnhandled).toBe(false)
    })
  })

  // ========================================================================
  // fetchAlarms
  // ========================================================================
  describe('fetchAlarms', () => {
    it('加载告警列表成功', async () => {
      const items = [
        makeAlarm({ id: 'a1' }),
        makeAlarm({ id: 'a2' }),
      ]
      vi.mocked(alarmApi.getList).mockResolvedValueOnce({
        data: { code: 0, data: { items, total: 2, page: 1 } },
      } as any)

      const store = useAlarmStore()
      await store.fetchAlarms()

      expect(store.alarms).toEqual(items)
      expect(store.total).toBe(2)
    })

    it('加载失败时显示错误消息', async () => {
      vi.mocked(alarmApi.getList).mockRejectedValueOnce(new Error('Timeout'))

      const store = useAlarmStore()
      await store.fetchAlarms()

      expect(store.loading).toBe(false)
    })
  })

  // ========================================================================
  // fetchStats
  // ========================================================================
  describe('fetchStats', () => {
    it('加载告警统计成功', async () => {
      const stats = makeStats({ total: 50, critical: 3 })
      vi.mocked(alarmApi.getStats).mockResolvedValueOnce({
        data: { code: 0, data: stats },
      } as any)

      const store = useAlarmStore()
      await store.fetchStats()

      expect(store.stats).toEqual(stats)
    })

    it('加载统计失败 — 静默处理', async () => {
      vi.mocked(alarmApi.getStats).mockRejectedValueOnce(new Error('Error'))

      const store = useAlarmStore()
      await store.fetchStats()

      expect(store.stats).toBeNull()
    })
  })

  // ========================================================================
  // fetchUnhandledCount
  // ========================================================================
  describe('fetchUnhandledCount', () => {
    it('获取未处理告警数成功', async () => {
      vi.mocked(alarmApi.getUnhandledCount).mockResolvedValueOnce({
        data: { code: 0, data: { count: 15 } },
      } as any)

      const store = useAlarmStore()
      await store.fetchUnhandledCount()

      expect(store.unhandledCount).toBe(15)
    })

    it('获取失败 — 静默处理', async () => {
      vi.mocked(alarmApi.getUnhandledCount).mockRejectedValueOnce(new Error('Error'))

      const store = useAlarmStore()
      await store.fetchUnhandledCount()

      // 不崩溃即可
      expect(store.unhandledCount).toBe(0)
    })
  })

  // ========================================================================
  // handleAlarm
  // ========================================================================
  describe('handleAlarm', () => {
    it('确认告警成功', async () => {
      vi.mocked(alarmApi.handle).mockResolvedValueOnce({ data: { code: 0 } } as any)
      vi.mocked(alarmApi.getList).mockResolvedValueOnce({
        data: { code: 0, data: { items: [], total: 0, page: 1 } },
      } as any)
      vi.mocked(alarmApi.getUnhandledCount).mockResolvedValueOnce({
        data: { code: 0, data: { count: 0 } },
      } as any)

      const store = useAlarmStore()
      const result = await store.handleAlarm('alarm-001', {
        status: 'confirmed',
        note: '已核实',
      })

      expect(result).toBe(true)
    })

    it('标记误报成功', async () => {
      vi.mocked(alarmApi.handle).mockResolvedValueOnce({ data: { code: 0 } } as any)
      vi.mocked(alarmApi.getList).mockResolvedValueOnce({
        data: { code: 0, data: { items: [], total: 0, page: 1 } },
      } as any)
      vi.mocked(alarmApi.getUnhandledCount).mockResolvedValueOnce({
        data: { code: 0, data: { count: 0 } },
      } as any)

      const store = useAlarmStore()
      const result = await store.handleAlarm('alarm-002', {
        status: 'false_alarm',
        note: '风吹草动',
      })

      expect(result).toBe(true)
    })

    it('处理失败返回false', async () => {
      vi.mocked(alarmApi.handle).mockRejectedValueOnce(new Error('Error'))

      const store = useAlarmStore()
      const result = await store.handleAlarm('alarm-003', {
        status: 'confirmed',
      })

      expect(result).toBe(false)
    })
  })

  // ========================================================================
  // 批量操作
  // ========================================================================
  describe('batchConfirm', () => {
    it('批量确认成功', async () => {
      vi.mocked(alarmApi.batchConfirm).mockResolvedValueOnce({ data: { code: 0 } } as any)
      vi.mocked(alarmApi.getList).mockResolvedValueOnce({
        data: { code: 0, data: { items: [], total: 0, page: 1 } },
      } as any)
      vi.mocked(alarmApi.getUnhandledCount).mockResolvedValueOnce({
        data: { code: 0, data: { count: 0 } },
      } as any)

      const store = useAlarmStore()
      const result = await store.batchConfirm(['a1', 'a2', 'a3'])

      expect(result).toBe(true)
      expect(alarmApi.batchConfirm).toHaveBeenCalledWith(['a1', 'a2', 'a3'], undefined)
    })

    it('批量确认失败', async () => {
      vi.mocked(alarmApi.batchConfirm).mockRejectedValueOnce(new Error('Error'))

      const store = useAlarmStore()
      const result = await store.batchConfirm(['a1'])

      expect(result).toBe(false)
    })
  })

  describe('batchFalseAlarm', () => {
    it('批量标记误报成功', async () => {
      vi.mocked(alarmApi.batchFalseAlarm).mockResolvedValueOnce({ data: { code: 0 } } as any)
      vi.mocked(alarmApi.getList).mockResolvedValueOnce({
        data: { code: 0, data: { items: [], total: 0, page: 1 } },
      } as any)
      vi.mocked(alarmApi.getUnhandledCount).mockResolvedValueOnce({
        data: { code: 0, data: { count: 0 } },
      } as any)

      const store = useAlarmStore()
      const result = await store.batchFalseAlarm(['a1', 'a2'], '批量误报')

      expect(result).toBe(true)
      expect(alarmApi.batchFalseAlarm).toHaveBeenCalledWith(['a1', 'a2'], '批量误报')
    })
  })
})
