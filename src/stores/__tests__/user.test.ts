/**
 * @file user.test.ts
 * @brief 用户状态管理 Store 单元测试
 *
 * 覆盖:
 *   - 初始状态 (token / userInfo / roles / permissions)
 *   - login 登录流程 (成功/失败)
 *   - logout 登出清理
 *   - fetchUserInfo 获取用户信息
 *   - hasPermission 权限检查
 *   - computed 属性 (isLoggedIn / isAdmin / userName / userAvatar)
 *   - Token持久化 (Cookie + localStorage)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/stores/user'
import type { UserInfo } from '@/types/user'

// ── Mock localStorage (happy-dom 需 --localstorage-file 参数，这里用内存 mock) ──
const localStorageStore: Record<string, string> = {}
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore[key] = value }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key] }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]) }),
  get length() { return Object.keys(localStorageStore).length },
  key: vi.fn((index: number) => Object.keys(localStorageStore)[index] ?? null),
}

vi.stubGlobal('localStorage', mockLocalStorage)

// ── Mock 依赖 ──────────────────────────────────────────────
vi.mock('js-cookie', () => {
  const store: Record<string, string> = {}
  return {
    default: {
      get: vi.fn((key: string) => store[key] || undefined),
      set: vi.fn((key: string, value: string) => { store[key] = value }),
      remove: vi.fn((key: string) => { delete store[key] }),
    },
  }
})

vi.mock('@/api/user', () => ({
  userApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getUserInfo: vi.fn(),
  },
}))

import { userApi } from '@/api/user'

// ── 测试数据工厂 ──────────────────────────────────────────
function makeUserInfo(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 'user-001',
    username: 'admin',
    name: '管理员',
    avatar: '/avatar/admin.png',
    roles: ['admin'],
    permissions: ['device:read', 'device:write', 'alarm:read', 'alarm:handle', 'system:config'],
    ...overrides,
  } as UserInfo
}

function makeAuthResponse(token = 'jwt-token-123', user = makeUserInfo()) {
  return {
    data: {
      code: 0,
      message: 'success',
      data: { token, user },
    },
  }
}

// ── 测试 ──────────────────────────────────────────────────
describe('stores/user', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // 清理 localStorage mock 内部数据
    Object.keys(localStorageStore).forEach(k => delete localStorageStore[k])
  })

  // ========================================================================
  // 初始状态
  // ========================================================================
  describe('初始状态', () => {
    it('无Token时isLoggedIn为false', () => {
      const store = useUserStore()
      expect(store.isLoggedIn).toBe(false)
    })

    it('无Token时userName为"未登录"', () => {
      const store = useUserStore()
      expect(store.userName).toBe('未登录')
    })

    it('无Token时isAdmin为false', () => {
      const store = useUserStore()
      expect(store.isAdmin).toBe(false)
    })

    it('默认avatar路径', () => {
      const store = useUserStore()
      expect(store.userAvatar).toBe('/default-avatar.png')
    })
  })

  // ========================================================================
  // Login
  // ========================================================================
  describe('login', () => {
    it('登录成功 — 保存token和用户信息', async () => {
      const authRes = makeAuthResponse()
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)

      const store = useUserStore()
      const result = await store.login({
        username: 'admin',
        password: 'admin123',
      })

      expect(result.success).toBe(true)
      expect(store.token).toBe('jwt-token-123')
      expect(store.isLoggedIn).toBe(true)
    })

    it('登录成功 — 保存角色和权限', async () => {
      const user = makeUserInfo({
        roles: ['admin', 'operator'],
        permissions: ['device:read', 'alarm:handle'],
      })
      const authRes = makeAuthResponse('token-abc', user)
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(store.roles).toEqual(['admin', 'operator'])
      expect(store.permissions).toEqual(['device:read', 'alarm:handle'])
    })

    it('登录成功 — 持久化到 localStorage', async () => {
      const authRes = makeAuthResponse()
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'shieldai_user',
        expect.any(String)
      )
    })

    it('登录失败 — 返回错误信息', async () => {
      vi.mocked(userApi.login).mockRejectedValueOnce({
        response: { data: { message: '密码错误' } },
      })

      const store = useUserStore()
      const result = await store.login({ username: 'admin', password: 'wrong' })

      expect(result.success).toBe(false)
      expect(result.message).toContain('密码错误')
    })

    it('登录失败后 isLoading 恢复为 false', async () => {
      vi.mocked(userApi.login).mockRejectedValueOnce(new Error('Network error'))

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(store.isLoading).toBe(false)
    })
  })

  // ========================================================================
  // Logout
  // ========================================================================
  describe('logout', () => {
    it('登出后清除所有状态', async () => {
      // 先登录
      const authRes = makeAuthResponse()
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)
      vi.mocked(userApi.logout).mockResolvedValueOnce({})

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })
      expect(store.isLoggedIn).toBe(true)

      // 再登出
      await store.logout()
      expect(store.token).toBe('')
      expect(store.userInfo).toBeNull()
      expect(store.isLoggedIn).toBe(false)
    })

    it('登出API失败时仍清除本地状态', async () => {
      const authRes = makeAuthResponse()
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)
      vi.mocked(userApi.logout).mockRejectedValueOnce(new Error('Network error'))

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })
      await store.logout()

      expect(store.token).toBe('')
      expect(store.userInfo).toBeNull()
    })
  })

  // ========================================================================
  // fetchUserInfo
  // ========================================================================
  describe('fetchUserInfo', () => {
    it('成功获取用户信息', async () => {
      const user = makeUserInfo()
      vi.mocked(userApi.getUserInfo).mockResolvedValueOnce({
        data: { code: 0, data: user },
      } as any)

      const store = useUserStore()
      // 设置 token 以通过守卫
      store.token = 'valid-token'
      const result = await store.fetchUserInfo()

      expect(result).toBeDefined()
      expect(store.userInfo?.name).toBe('管理员')
    })

    it('无token时返回null', async () => {
      const store = useUserStore()
      store.token = ''
      const result = await store.fetchUserInfo()

      expect(result).toBeNull()
    })

    it('Token失效时自动登出', async () => {
      vi.mocked(userApi.getUserInfo).mockRejectedValueOnce(new Error('401 Unauthorized'))

      const store = useUserStore()
      store.token = 'expired-token'
      await store.fetchUserInfo()

      // 登出后 token 清空
      expect(store.token).toBe('')
    })
  })

  // ========================================================================
  // 权限检查
  // ========================================================================
  describe('hasPermission', () => {
    it('有权限时返回true', async () => {
      const authRes = makeAuthResponse()
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(store.hasPermission('device:read')).toBe(true)
    })

    it('无权限时返回false', async () => {
      const user = makeUserInfo({ roles: ['operator'], permissions: ['device:read'] })
      const authRes = makeAuthResponse('token', user)
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(store.hasPermission('system:delete')).toBe(false)
    })
  })

  // ========================================================================
  // computed 属性
  // ========================================================================
  describe('computed 属性', () => {
    it('admin 角色时 isAdmin 为 true', async () => {
      const authRes = makeAuthResponse()
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(store.isAdmin).toBe(true)
    })

    it('非 admin 角色时 isAdmin 为 false', async () => {
      const user = makeUserInfo({ roles: ['operator'] })
      const authRes = makeAuthResponse('token', user)
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)

      const store = useUserStore()
      await store.login({ username: 'op', password: 'pass' })

      expect(store.isAdmin).toBe(false)
    })

    it('userName 返回用户名', async () => {
      const user = makeUserInfo({ name: '张三' })
      const authRes = makeAuthResponse('token', user)
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)

      const store = useUserStore()
      await store.login({ username: 'zhangsan', password: 'pass' })

      expect(store.userName).toBe('张三')
    })

    it('userAvatar 返回用户头像', async () => {
      const user = makeUserInfo({ avatar: '/custom-avatar.png' })
      const authRes = makeAuthResponse('token', user)
      vi.mocked(userApi.login).mockResolvedValueOnce(authRes as any)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(store.userAvatar).toBe('/custom-avatar.png')
    })
  })
})
