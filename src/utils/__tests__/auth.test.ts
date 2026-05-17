/**
 * @file auth.test.ts
 * @brief 认证工具函数单元测试
 *
 * 覆盖:
 *   - getAuthToken / setAuthToken / removeAuthToken
 *   - isAuthenticated 状态判断
 *   - Token 过期处理
 *   - 边界条件 (空值、特殊字符)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  isAuthenticated,
} from '@/utils/auth'

// Mock js-cookie
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

import Cookies from 'js-cookie'

describe('utils/auth', () => {
  beforeEach(() => {
    // 清除所有 cookie
    vi.clearAllMocks()
    // 重置 mock store — 通过 removeAuthToken 清理
    removeAuthToken()
  })

  // ========================================================================
  // getAuthToken
  // ========================================================================
  describe('getAuthToken', () => {
    it('未设置Token时返回undefined', () => {
      expect(getAuthToken()).toBeUndefined()
    })

    it('设置Token后能正确获取', () => {
      setAuthToken('test-jwt-token-123')
      expect(getAuthToken()).toBe('test-jwt-token-123')
    })

    it('移除Token后返回undefined', () => {
      setAuthToken('some-token')
      removeAuthToken()
      expect(getAuthToken()).toBeUndefined()
    })
  })

  // ========================================================================
  // setAuthToken
  // ========================================================================
  describe('setAuthToken', () => {
    it('正确调用Cookies.set', () => {
      setAuthToken('my-token')
      expect(Cookies.set).toHaveBeenCalledWith(
        'shieldai_token',
        'my-token',
        { expires: 7 }
      )
    })

    it('支持自定义过期天数', () => {
      setAuthToken('my-token', 30)
      expect(Cookies.set).toHaveBeenCalledWith(
        'shieldai_token',
        'my-token',
        { expires: 30 }
      )
    })

    it('默认过期7天', () => {
      setAuthToken('token')
      const call = (Cookies.set as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call[2]).toEqual({ expires: 7 })
    })

    it('空字符串Token也能设置', () => {
      setAuthToken('')
      expect(Cookies.set).toHaveBeenCalledWith(
        'shieldai_token',
        '',
        expect.any(Object)
      )
    })
  })

  // ========================================================================
  // removeAuthToken
  // ========================================================================
  describe('removeAuthToken', () => {
    it('正确调用Cookies.remove', () => {
      removeAuthToken()
      expect(Cookies.remove).toHaveBeenCalledWith('shieldai_token')
    })

    it('重复移除不报错', () => {
      removeAuthToken()
      removeAuthToken()
      expect(Cookies.remove).toHaveBeenCalledTimes(2)
    })
  })

  // ========================================================================
  // isAuthenticated
  // ========================================================================
  describe('isAuthenticated', () => {
    it('无Token时返回false', () => {
      expect(isAuthenticated()).toBe(false)
    })

    it('有Token时返回true', () => {
      setAuthToken('valid-token')
      expect(isAuthenticated()).toBe(true)
    })

    it('空字符串Token视为未认证', () => {
      // Cookies.get 返回空字符串 → !!'' === false
      vi.mocked(Cookies.get).mockReturnValueOnce('')
      expect(isAuthenticated()).toBe(false)
    })

    it('Token被移除后返回false', () => {
      setAuthToken('token')
      removeAuthToken()
      expect(isAuthenticated()).toBe(false)
    })
  })

  // ========================================================================
  // 边界条件
  // ========================================================================
  describe('边界条件', () => {
    it('Token包含特殊字符时正常处理', () => {
      const specialToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc-def_123'
      setAuthToken(specialToken)
      expect(getAuthToken()).toBe(specialToken)
    })

    it('Token包含中文时正常处理', () => {
      setAuthToken('token-with-中文')
      expect(getAuthToken()).toBe('token-with-中文')
    })

    it('超长Token正常处理', () => {
      const longToken = 'a'.repeat(10000)
      setAuthToken(longToken)
      expect(getAuthToken()).toBe(longToken)
    })
  })
})
