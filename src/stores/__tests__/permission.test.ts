/**
 * @file permission.test.ts
 * @brief 权限状态管理 Store 单元测试
 *
 * 覆盖:
 *   - 初始状态 (routes / dynamicRoutesAdded)
 *   - generateRoutes 动态路由生成
 *   - resetRoutes 重置路由
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePermissionStore } from '@/stores/permission'

// ── Mock 依赖 ──────────────────────────────────────────────
vi.mock('@/router', () => ({
  asyncRoutes: [
    {
      path: '/devices',
      name: 'Devices',
      component: 'DevicesView',
      meta: { title: '设备管理', icon: 'Monitor' },
    },
    {
      path: '/alarms',
      name: 'Alarms',
      component: 'AlarmsView',
      meta: { title: '告警中心', icon: 'Bell' },
    },
    {
      path: '/settings',
      name: 'Settings',
      component: 'SettingsView',
      meta: { title: '系统设置', icon: 'Setting' },
    },
  ],
}))

// ── 测试 ──────────────────────────────────────────────────
describe('stores/permission', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ========================================================================
  // 初始状态
  // ========================================================================
  describe('初始状态', () => {
    it('routes为空数组', () => {
      const store = usePermissionStore()
      expect(store.routes).toEqual([])
    })

    it('dynamicRoutesAdded为false', () => {
      const store = usePermissionStore()
      expect(store.dynamicRoutesAdded).toBe(false)
    })
  })

  // ========================================================================
  // generateRoutes
  // ========================================================================
  describe('generateRoutes', () => {
    it('生成动态路由成功', async () => {
      const store = usePermissionStore()
      await store.generateRoutes()

      expect(store.routes.length).toBeGreaterThan(0)
      expect(store.dynamicRoutesAdded).toBe(true)
    })

    it('生成的路由包含设备管理', async () => {
      const store = usePermissionStore()
      await store.generateRoutes()

      const deviceRoute = store.routes.find(r => r.path === '/devices')
      expect(deviceRoute).toBeDefined()
    })

    it('生成的路由包含告警中心', async () => {
      const store = usePermissionStore()
      await store.generateRoutes()

      const alarmRoute = store.routes.find(r => r.path === '/alarms')
      expect(alarmRoute).toBeDefined()
    })

    it('重复调用不报错', async () => {
      const store = usePermissionStore()
      await store.generateRoutes()
      await store.generateRoutes()

      expect(store.dynamicRoutesAdded).toBe(true)
    })
  })

  // ========================================================================
  // resetRoutes
  // ========================================================================
  describe('resetRoutes', () => {
    it('重置后routes为空', async () => {
      const store = usePermissionStore()
      await store.generateRoutes()
      expect(store.routes.length).toBeGreaterThan(0)

      store.resetRoutes()

      expect(store.routes).toEqual([])
    })

    it('重置后dynamicRoutesAdded为false', async () => {
      const store = usePermissionStore()
      await store.generateRoutes()
      store.resetRoutes()

      expect(store.dynamicRoutesAdded).toBe(false)
    })

    it('重置后可重新生成路由', async () => {
      const store = usePermissionStore()
      await store.generateRoutes()
      store.resetRoutes()
      await store.generateRoutes()

      expect(store.routes.length).toBeGreaterThan(0)
      expect(store.dynamicRoutesAdded).toBe(true)
    })
  })
})
