/**
 * @file useAlarm.test.ts
 * @brief 告警操作 Composable 单元测试
 *
 * 覆盖:
 *   - useAlarmList: 过滤/搜索/批量操作/生命周期
 *   - useAlarmRealtime: 实时推送集成
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// ── Mock 依赖 ──────────────────────────────────────────────
vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    connected: { value: true },
    lastMessage: { value: null },
    messages: [],
    error: { value: null },
    send: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

vi.mock('@/stores/alarm', () => ({
  useAlarmStore: vi.fn(() => ({
    alarms: [],
    stats: null,
    unhandledCount: 0,
    realtimeAlarms: [],
    fetchAlarms: vi.fn(),
    fetchStats: vi.fn(),
    fetchUnhandledCount: vi.fn(),
    batchConfirm: vi.fn(async () => true),
    batchFalseAlarm: vi.fn(async () => true),
    pushRealtimeAlarm: vi.fn(),
  })),
}))

// ── 测试 ──────────────────────────────────────────────────
describe('composables/useAlarm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ========================================================================
  // useAlarmList
  // ========================================================================
  describe('useAlarmList', () => {
    it('返回所有需要的响应式属性和方法', async () => {
      const { useAlarmList } = await import('@/composables/useAlarm')
      const result = useAlarmList()

      expect(result).toHaveProperty('alarmStore')
      expect(result).toHaveProperty('selected')
      expect(result).toHaveProperty('levelFilter')
      expect(result).toHaveProperty('typeFilter')
      expect(result).toHaveProperty('statusFilter')
      expect(result).toHaveProperty('search')
      expect(result).toHaveProperty('dateRange')
      expect(result).toHaveProperty('filteredAlarms')
      expect(result).toHaveProperty('applyFilters')
      expect(result).toHaveProperty('batchConfirm')
      expect(result).toHaveProperty('batchFalseAlarm')
    })

    it('filteredAlarms — 无过滤时返回全部告警', async () => {
      const { useAlarmList } = await import('@/composables/useAlarm')
      const { useAlarmStore } = await import('@/stores/alarm')

      // Mock store 返回告警列表
      vi.mocked(useAlarmStore).mockReturnValue({
        alarms: [
          { id: '1', level: 'critical', type: 'intrusion', status: 'unhandled', description: '入侵告警', deviceName: 'Cam1' },
          { id: '2', level: 'high', type: 'fire', status: 'confirmed', description: '烟火告警', deviceName: 'Cam2' },
          { id: '3', level: 'medium', type: 'loitering', status: 'unhandled', description: '徘徊告警', deviceName: 'Cam3' },
        ],
        stats: null,
        unhandledCount: 2,
        realtimeAlarms: [],
        fetchAlarms: vi.fn(),
        fetchStats: vi.fn(),
        fetchUnhandledCount: vi.fn(),
        batchConfirm: vi.fn(async () => true),
        batchFalseAlarm: vi.fn(async () => true),
        pushRealtimeAlarm: vi.fn(),
      } as any)

      const { filteredAlarms } = useAlarmList()

      expect(filteredAlarms.value.length).toBe(3)
    })

    it('applyFilters 调用 fetchAlarms 并传递过滤条件', async () => {
      const mockFetchAlarms = vi.fn()
      const { useAlarmList } = await import('@/composables/useAlarm')
      const { useAlarmStore } = await import('@/stores/alarm')

      vi.mocked(useAlarmStore).mockReturnValue({
        alarms: [],
        stats: null,
        unhandledCount: 0,
        realtimeAlarms: [],
        fetchAlarms: mockFetchAlarms,
        fetchStats: vi.fn(),
        fetchUnhandledCount: vi.fn(),
        batchConfirm: vi.fn(async () => true),
        batchFalseAlarm: vi.fn(async () => true),
        pushRealtimeAlarm: vi.fn(),
      } as any)

      const { applyFilters, levelFilter, statusFilter } = useAlarmList()
      levelFilter.value = 'critical'
      statusFilter.value = 'unhandled'

      applyFilters()

      expect(mockFetchAlarms).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'critical',
          status: 'unhandled',
        })
      )
    })

    it('batchConfirm — 无选中项时不操作', async () => {
      const mockBatchConfirm = vi.fn(async () => true)
      const { useAlarmList } = await import('@/composables/useAlarm')
      const { useAlarmStore } = await import('@/stores/alarm')

      vi.mocked(useAlarmStore).mockReturnValue({
        alarms: [],
        stats: null,
        unhandledCount: 0,
        realtimeAlarms: [],
        fetchAlarms: vi.fn(),
        fetchStats: vi.fn(),
        fetchUnhandledCount: vi.fn(),
        batchConfirm: mockBatchConfirm,
        batchFalseAlarm: vi.fn(async () => true),
        pushRealtimeAlarm: vi.fn(),
      } as any)

      const { batchConfirm, selected } = useAlarmList()
      selected.value = []

      await batchConfirm()

      expect(mockBatchConfirm).not.toHaveBeenCalled()
    })

    it('batchConfirm — 有选中项时调用store', async () => {
      const mockBatchConfirm = vi.fn(async () => true)
      const { useAlarmList } = await import('@/composables/useAlarm')
      const { useAlarmStore } = await import('@/stores/alarm')

      vi.mocked(useAlarmStore).mockReturnValue({
        alarms: [],
        stats: null,
        unhandledCount: 0,
        realtimeAlarms: [],
        fetchAlarms: vi.fn(),
        fetchStats: vi.fn(),
        fetchUnhandledCount: vi.fn(),
        batchConfirm: mockBatchConfirm,
        batchFalseAlarm: vi.fn(async () => true),
        pushRealtimeAlarm: vi.fn(),
      } as any)

      const { batchConfirm, selected } = useAlarmList()
      selected.value = [{ id: 'a1' }, { id: 'a2' }] as any

      await batchConfirm()

      expect(mockBatchConfirm).toHaveBeenCalledWith(['a1', 'a2'])
    })

    it('batchFalseAlarm — 有选中项时调用store', async () => {
      const mockBatchFalseAlarm = vi.fn(async () => true)
      const { useAlarmList } = await import('@/composables/useAlarm')
      const { useAlarmStore } = await import('@/stores/alarm')

      vi.mocked(useAlarmStore).mockReturnValue({
        alarms: [],
        stats: null,
        unhandledCount: 0,
        realtimeAlarms: [],
        fetchAlarms: vi.fn(),
        fetchStats: vi.fn(),
        fetchUnhandledCount: vi.fn(),
        batchConfirm: vi.fn(async () => true),
        batchFalseAlarm: mockBatchFalseAlarm,
        pushRealtimeAlarm: vi.fn(),
      } as any)

      const { batchFalseAlarm, selected } = useAlarmList()
      selected.value = [{ id: 'a3' }] as any

      await batchFalseAlarm()

      expect(mockBatchFalseAlarm).toHaveBeenCalledWith(['a3'])
    })

    it('搜索过滤 — 关键词匹配description和deviceName', async () => {
      const { useAlarmList } = await import('@/composables/useAlarm')
      const { useAlarmStore } = await import('@/stores/alarm')

      vi.mocked(useAlarmStore).mockReturnValue({
        alarms: [
          { id: '1', level: 'critical', type: 'intrusion', status: 'unhandled', description: '周界入侵告警', deviceName: 'Cam1' },
          { id: '2', level: 'high', type: 'fire', status: 'confirmed', description: '烟火检测', deviceName: 'Front-Gate' },
          { id: '3', level: 'medium', type: 'loitering', status: 'unhandled', description: '徘徊检测', deviceName: 'Warehouse' },
        ],
        stats: null,
        unhandledCount: 2,
        realtimeAlarms: [],
        fetchAlarms: vi.fn(),
        fetchStats: vi.fn(),
        fetchUnhandledCount: vi.fn(),
        batchConfirm: vi.fn(async () => true),
        batchFalseAlarm: vi.fn(async () => true),
        pushRealtimeAlarm: vi.fn(),
      } as any)

      const { filteredAlarms, search } = useAlarmList()

      // 搜索"入侵"
      search.value = '入侵'
      expect(filteredAlarms.value.length).toBe(1)
      expect(filteredAlarms.value[0].id).toBe('1')

      // 搜索"Front"
      search.value = 'Front'
      expect(filteredAlarms.value.length).toBe(1)
      expect(filteredAlarms.value[0].id).toBe('2')
    })
  })

  // ========================================================================
  // useAlarmRealtime
  // ========================================================================
  describe('useAlarmRealtime', () => {
    it('返回实时告警相关属性', async () => {
      const { useAlarmRealtime } = await import('@/composables/useAlarm')
      const { useAlarmStore } = await import('@/stores/alarm')

      vi.mocked(useAlarmStore).mockReturnValue({
        alarms: [],
        stats: null,
        unhandledCount: 5,
        realtimeAlarms: [],
        fetchAlarms: vi.fn(),
        fetchStats: vi.fn(),
        fetchUnhandledCount: vi.fn(),
        batchConfirm: vi.fn(async () => true),
        batchFalseAlarm: vi.fn(async () => true),
        pushRealtimeAlarm: vi.fn(),
      } as any)

      const result = useAlarmRealtime()

      expect(result).toHaveProperty('connected')
      expect(result).toHaveProperty('realtimeAlarms')
      expect(result).toHaveProperty('unhandledCount')
    })
  })
})
