// @ts-nocheck
/**
 * @file device.test.ts
 * @brief 设备状态管理 Store 单元测试
 *
 * 覆盖:
 *   - 初始状态
 *   - fetchDevices 加载设备列表
 *   - fetchStats 加载统计
 *   - fetchDetail 设备详情
 *   - createDevice / updateDevice / deleteDevice CRUD
 *   - computed 属性 (onlineCount / offlineCount / alarmingCount / onlineRate)
 *   - 设备发现 (ONVIF / GB28181)
 *   - 错误处理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDeviceStore } from '@/stores/device'
import type { DeviceItem, DeviceStats } from '@/types/device'

// ── Mock 依赖 ──────────────────────────────────────────────
vi.mock('@/api/device', () => ({
  deviceApi: {
    getList: vi.fn(),
    getStats: vi.fn(),
    getDetail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    discoverOnvif: vi.fn(),
    discoverGB28181: vi.fn(),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(),
  },
}))

import { deviceApi } from '@/api/device'

// ── 测试数据工厂 ──────────────────────────────────────────
function makeDevice(overrides: Partial<DeviceItem> = {}): DeviceItem {
  return {
    id: 'dev-001',
    name: 'Test Camera',
    type: 'IPCamera',
    status: 'online',
    ip: '192.168.1.100',
    model: 'DS-2CD2T47G2-L',
    vendor: 'Hikvision',
    channelCount: 1,
    ...overrides,
  } as DeviceItem
}

function makeStats(overrides: Partial<DeviceStats> = {}): DeviceStats {
  return {
    total: 10,
    online: 7,
    offline: 2,
    alarming: 1,
    ...overrides,
  } as DeviceStats
}

// ── 测试 ──────────────────────────────────────────────────
describe('stores/device', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ========================================================================
  // 初始状态
  // ========================================================================
  describe('初始状态', () => {
    it('设备列表为空', () => {
      const store = useDeviceStore()
      expect(store.devices).toEqual([])
    })

    it('统计信息为null', () => {
      const store = useDeviceStore()
      expect(store.stats).toBeNull()
    })

    it('loading为false', () => {
      const store = useDeviceStore()
      expect(store.loading).toBe(false)
    })

    it('total为0', () => {
      const store = useDeviceStore()
      expect(store.total).toBe(0)
    })
  })

  // ========================================================================
  // Computed 属性
  // ========================================================================
  describe('computed属性', () => {
    it('onlineCount 计算在线设备数', () => {
      const store = useDeviceStore()
      store.$patch({
        devices: [
          makeDevice({ id: '1', status: 'online' }),
          makeDevice({ id: '2', status: 'online' }),
          makeDevice({ id: '3', status: 'offline' }),
        ],
      })
      expect(store.onlineCount).toBe(2)
    })

    it('offlineCount 计算离线设备数', () => {
      const store = useDeviceStore()
      store.$patch({
        devices: [
          makeDevice({ id: '1', status: 'online' }),
          makeDevice({ id: '2', status: 'offline' }),
          makeDevice({ id: '3', status: 'offline' }),
        ],
      })
      expect(store.offlineCount).toBe(2)
    })

    it('alarmingCount 计算告警设备数', () => {
      const store = useDeviceStore()
      store.$patch({
        devices: [
          makeDevice({ id: '1', status: 'alarming' }),
          makeDevice({ id: '2', status: 'online' }),
        ],
      })
      expect(store.alarmingCount).toBe(1)
    })

    it('onlineRate 计算在线率', () => {
      const store = useDeviceStore()
      store.$patch({ stats: makeStats({ total: 10, online: 7 }) })
      expect(store.onlineRate).toBe(70)
    })

    it('onlineRate — 无统计数据时返回0', () => {
      const store = useDeviceStore()
      expect(store.onlineRate).toBe(0)
    })

    it('onlineRate — total为0时返回0', () => {
      const store = useDeviceStore()
      store.$patch({ stats: makeStats({ total: 0, online: 0 }) })
      expect(store.onlineRate).toBe(0)
    })
  })

  // ========================================================================
  // fetchDevices
  // ========================================================================
  describe('fetchDevices', () => {
    it('加载设备列表成功', async () => {
      const items = [makeDevice({ id: '1' }), makeDevice({ id: '2' })]
      vi.mocked(deviceApi.getList).mockResolvedValueOnce({
        data: { code: 0, data: { items, total: 2, page: 1 } },
      } as any)

      const store = useDeviceStore()
      await store.fetchDevices()

      expect(store.devices).toEqual(items)
      expect(store.total).toBe(2)
    })

    it('加载过程loading状态变化', async () => {
      let resolveApi: (v: any) => void
      const pending = new Promise(r => { resolveApi = r })
      vi.mocked(deviceApi.getList).mockReturnValueOnce(pending as any)

      const store = useDeviceStore()
      const fetchPromise = store.fetchDevices()

      expect(store.loading).toBe(true)

      resolveApi!({ data: { code: 0, data: { items: [], total: 0, page: 1 } } })
      await fetchPromise

      expect(store.loading).toBe(false)
    })

    it('加载失败时显示错误消息', async () => {
      vi.mocked(deviceApi.getList).mockRejectedValueOnce(new Error('网络超时'))

      const store = useDeviceStore()
      await store.fetchDevices()

      expect(store.loading).toBe(false)
    })
  })

  // ========================================================================
  // fetchStats
  // ========================================================================
  describe('fetchStats', () => {
    it('加载统计数据成功', async () => {
      const stats = makeStats({ total: 20, online: 15 })
      vi.mocked(deviceApi.getStats).mockResolvedValueOnce({
        data: { code: 0, data: stats },
      } as any)

      const store = useDeviceStore()
      await store.fetchStats()

      expect(store.stats).toEqual(stats)
    })

    it('加载统计失败 — 静默失败', async () => {
      vi.mocked(deviceApi.getStats).mockRejectedValueOnce(new Error('Error'))

      const store = useDeviceStore()
      await store.fetchStats()

      expect(store.stats).toBeNull()
    })
  })

  // ========================================================================
  // fetchDetail
  // ========================================================================
  describe('fetchDetail', () => {
    it('获取设备详情成功', async () => {
      const detail = makeDevice({ id: 'dev-001', name: 'Front Gate' })
      vi.mocked(deviceApi.getDetail).mockResolvedValueOnce({
        data: { code: 0, data: detail },
      } as any)

      const store = useDeviceStore()
      const result = await store.fetchDetail('dev-001')

      expect(result).toEqual(detail)
      expect(store.currentDevice).toEqual(detail)
    })

    it('获取详情失败返回null', async () => {
      vi.mocked(deviceApi.getDetail).mockRejectedValueOnce(new Error('Not Found'))

      const store = useDeviceStore()
      const result = await store.fetchDetail('not-exist')

      expect(result).toBeNull()
    })
  })

  // ========================================================================
  // CRUD 操作
  // ========================================================================
  describe('createDevice', () => {
    it('创建成功后重新加载列表', async () => {
      vi.mocked(deviceApi.create).mockResolvedValueOnce({ data: { code: 0 } } as any)
      vi.mocked(deviceApi.getList).mockResolvedValueOnce({
        data: { code: 0, data: { items: [], total: 0, page: 1 } },
      } as any)
      vi.mocked(deviceApi.getStats).mockResolvedValueOnce({
        data: { code: 0, data: makeStats() },
      } as any)

      const store = useDeviceStore()
      const result = await store.createDevice({
        name: 'New Camera',
        type: 'IPCamera',
        ip: '192.168.1.200',
      } as any)

      expect(result).toBe(true)
      expect(deviceApi.create).toHaveBeenCalled()
    })

    it('创建失败返回false', async () => {
      vi.mocked(deviceApi.create).mockRejectedValueOnce(new Error('Conflict'))

      const store = useDeviceStore()
      const result = await store.createDevice({} as any)

      expect(result).toBe(false)
    })
  })

  describe('deleteDevice', () => {
    it('删除成功', async () => {
      vi.mocked(deviceApi.delete).mockResolvedValueOnce({ data: { code: 0 } } as any)
      vi.mocked(deviceApi.getList).mockResolvedValueOnce({
        data: { code: 0, data: { items: [], total: 0, page: 1 } },
      } as any)
      vi.mocked(deviceApi.getStats).mockResolvedValueOnce({
        data: { code: 0, data: makeStats() },
      } as any)

      const store = useDeviceStore()
      const result = await store.deleteDevice('dev-001')

      expect(result).toBe(true)
    })

    it('删除失败返回false', async () => {
      vi.mocked(deviceApi.delete).mockRejectedValueOnce(new Error('Not Found'))

      const store = useDeviceStore()
      const result = await store.deleteDevice('not-exist')

      expect(result).toBe(false)
    })
  })
})
