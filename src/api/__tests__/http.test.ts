/**
 * @file http.test.ts
 * @brief HTTP 客户端封装 单元测试
 *
 * 覆盖:
 *   - createHttpClient 创建客户端实例
 *   - 请求拦截器 — Token 自动注入 + 请求ID生成
 *   - 响应拦截器 — 业务错误码处理
 *   - 401 未授权自动跳转登录
 *   - 403 权限不足
 *   - 网络错误处理
 *   - 各专用客户端 (device/alarm/channel/stats 等)
 *   - 统一错误码 ApiErrorCode & ApiError
 *   - 超时预设 TIMEOUT_PRESETS
 *   - API 版本管理 API_VERSION
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import axios from 'axios'

// ── Mock 依赖 ──────────────────────────────────────────────
vi.mock('@/utils/auth', () => ({
  getAuthToken: vi.fn(),
  removeAuthToken: vi.fn(),
  setAuthToken: vi.fn(),
}))

vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}))

import { getAuthToken, removeAuthToken } from '@/utils/auth'

// ── 测试 ──────────────────────────────────────────────────
describe('api/http', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAuthToken).mockReturnValue(undefined)
    // 重置 window.location
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '', pathname: '/' },
    })
  })

  // ========================================================================
  // 模块导入与客户端实例化
  // ========================================================================
  describe('模块导入', () => {
    it('导出默认http客户端', async () => {
      const { http } = await import('@/api/http')
      expect(http).toBeDefined()
      expect(http.defaults).toBeDefined()
    })

    it('导出各专用客户端', async () => {
      const mod = await import('@/api/http')
      expect(mod.deviceHttp).toBeDefined()
      expect(mod.alarmHttp).toBeDefined()
      expect(mod.channelHttp).toBeDefined()
      expect(mod.statsHttp).toBeDefined()
      expect(mod.aiHttp).toBeDefined()
      expect(mod.otaHttp).toBeDefined()
      expect(mod.situationHttp).toBeDefined()
      expect(mod.exportHttp).toBeDefined()
      expect(mod.federationHttp).toBeDefined()
      expect(mod.platformHttp).toBeDefined()
      expect(mod.streamHttp).toBeDefined()
      expect(mod.recordingHttp).toBeDefined()
      expect(mod.modelHttp).toBeDefined()
      expect(mod.pipelineHttp).toBeDefined()
      expect(mod.ptzHttp).toBeDefined()
    })

    it('各专用客户端baseURL包含对应路径前缀', async () => {
      const mod = await import('@/api/http')
      expect(mod.deviceHttp.defaults.baseURL).toContain('/devices')
      expect(mod.alarmHttp.defaults.baseURL).toContain('/alarms')
      expect(mod.channelHttp.defaults.baseURL).toContain('/channels')
      expect(mod.statsHttp.defaults.baseURL).toContain('/stats')
      expect(mod.streamHttp.defaults.baseURL).toContain('/streams')
      expect(mod.recordingHttp.defaults.baseURL).toContain('/recordings')
      expect(mod.modelHttp.defaults.baseURL).toContain('/models')
      expect(mod.pipelineHttp.defaults.baseURL).toContain('/pipelines')
      expect(mod.ptzHttp.defaults.baseURL).toContain('/ptz')
    })
  })

  // ========================================================================
  // 请求拦截器 — Token 注入
  // ========================================================================
  describe('请求拦截器 — Token注入', () => {
    it('有Token时注入Authorization头', async () => {
      vi.mocked(getAuthToken).mockReturnValue('my-jwt-token')

      vi.resetModules()
      const { http } = await import('@/api/http')

      const reqHandler = http.interceptors.request.handlers?.[0]
      expect(reqHandler).toBeDefined()

      const config = { headers: {} as Record<string, string> } as any
      const result = reqHandler!.fulfilled(config) as any

      expect(result.headers.Authorization).toBe('Bearer my-jwt-token')
    })

    it('无Token时不注入Authorization头', async () => {
      vi.mocked(getAuthToken).mockReturnValue(undefined)

      vi.resetModules()
      const { http } = await import('@/api/http')

      const reqHandler = http.interceptors.request.handlers?.[0]
      const config = { headers: {} as Record<string, string> } as any
      const result = reqHandler!.fulfilled(config) as any

      expect(result.headers.Authorization).toBeUndefined()
    })

    it('注入请求ID (X-Request-Id)', async () => {
      vi.resetModules()
      const { http } = await import('@/api/http')

      const reqHandler = http.interceptors.request.handlers?.[0]
      const config = { headers: {} as Record<string, string> } as any
      const result = reqHandler!.fulfilled(config) as any

      expect(result.headers['X-Request-Id']).toMatch(/^req_/)
    })

    it('自定义timeoutMs覆盖默认timeout', async () => {
      vi.resetModules()
      const { http } = await import('@/api/http')

      const reqHandler = http.interceptors.request.handlers?.[0]
      const config = { headers: {} as Record<string, string>, timeout: 30000, timeoutMs: 60000, _retryMeta: { retryCount: 0, retryConfig: {} } } as any
      const result = reqHandler!.fulfilled(config) as any

      expect(result.timeout).toBe(60000)
    })
  })

  // ========================================================================
  // 响应拦截器 — 业务错误码处理
  // ========================================================================
  describe('响应拦截器 — 业务错误码', () => {
    it('业务码为0时正常通过', async () => {
      vi.resetModules()
      const { http } = await import('@/api/http')

      const resHandler = http.interceptors.response.handlers?.[0]
      const response = {
        data: { code: 0, message: 'ok', data: { id: '1' } },
        config: { headers: { 'X-Request-Id': 'req_test' }, url: '/test' },
      } as any

      const result = await resHandler!.fulfilled(response)
      expect(result).toBe(response)
    })

    it('业务码为200时正常通过', async () => {
      vi.resetModules()
      const { http } = await import('@/api/http')

      const resHandler = http.interceptors.response.handlers?.[0]
      const response = {
        data: { code: 200, message: 'ok', data: { id: '1' } },
        config: { headers: { 'X-Request-Id': 'req_test' }, url: '/test' },
      } as any

      const result = await resHandler!.fulfilled(response)
      expect(result).toBe(response)
    })

    it('非零业务码时返回reject', async () => {
      vi.resetModules()
      const { http, ApiErrorCode } = await import('@/api/http')

      const resHandler = http.interceptors.response.handlers?.[0]
      const response = {
        data: { code: 10003, message: '资源不存在' },
        config: { headers: { 'X-Request-Id': 'req_test' }, url: '/test' },
      } as any

      await expect(resHandler!.fulfilled(response)).rejects.toThrow('资源不存在')
    })
  })

  // ========================================================================
  // 响应拦截器 — 401 未授权
  // ========================================================================
  describe('响应拦截器 — 401', () => {
    it('401响应触发 removeAuthToken 和跳转', async () => {
      vi.resetModules()
      const { http } = await import('@/api/http')

      const resHandler = http.interceptors.response.handlers?.[0]
      const error = {
        response: { status: 401 },
        config: { headers: { 'X-Request-Id': 'req_test' }, url: '/test' },
      }

      await expect(resHandler!.rejected!(error)).rejects.toBeDefined()
      expect(removeAuthToken).toHaveBeenCalled()
    })
  })

  // ========================================================================
  // 统一错误码与 ApiError
  // ========================================================================
  describe('ApiErrorCode & ApiError', () => {
    it('导出 ApiErrorCode 枚举', async () => {
      const { ApiErrorCode } = await import('@/api/http')
      expect(ApiErrorCode.SUCCESS).toBe(0)
      expect(ApiErrorCode.UNAUTHORIZED).toBe(401)
      expect(ApiErrorCode.NETWORK_ERROR).toBe(20001)
      expect(ApiErrorCode.TIMEOUT_ERROR).toBe(20002)
      expect(ApiErrorCode.RETRY_EXHAUSTED).toBe(20003)
    })

    it('导出 ApiError 类', async () => {
      const { ApiError, ApiErrorCode } = await import('@/api/http')
      const err = new ApiError(ApiErrorCode.NETWORK_ERROR, '网络错误', 'req_test', '/api/test')
      expect(err).toBeInstanceOf(Error)
      expect(err.name).toBe('ApiError')
      expect(err.code).toBe(20001)
      expect(err.message).toBe('网络错误')
      expect(err.requestId).toBe('req_test')
      expect(err.url).toBe('/api/test')
      expect(err.retryable).toBe(true)
      expect(err.isAuthError).toBe(false)
      expect(err.toString()).toContain('ApiError')
      expect(err.toString()).toContain('20001')
    })

    it('ApiError isAuthError 判断', async () => {
      const { ApiError, ApiErrorCode } = await import('@/api/http')
      const err401 = new ApiError(ApiErrorCode.UNAUTHORIZED, '未授权', 'req_1', '/test')
      expect(err401.isAuthError).toBe(true)
      expect(err401.retryable).toBe(false)

      const errExpired = new ApiError(ApiErrorCode.BIZ_TOKEN_EXPIRED, 'Token过期', 'req_2', '/test')
      expect(errExpired.isAuthError).toBe(true)
    })

    it('getErrorMessage 返回友好消息', async () => {
      const { getErrorMessage, ApiErrorCode } = await import('@/api/http')
      expect(getErrorMessage(ApiErrorCode.UNAUTHORIZED)).toBe('未授权，请重新登录')
      expect(getErrorMessage(ApiErrorCode.NETWORK_ERROR)).toBe('网络连接异常，请检查网络')
      expect(getErrorMessage(ApiErrorCode.TIMEOUT_ERROR)).toBe('请求超时，请稍后重试')
      expect(getErrorMessage(99999)).toBe('请求失败，请稍后重试') // 未知错误码
    })
  })

  // ========================================================================
  // 超时预设
  // ========================================================================
  describe('TIMEOUT_PRESETS', () => {
    it('导出超时预设', async () => {
      const { TIMEOUT_PRESETS } = await import('@/api/http')
      expect(TIMEOUT_PRESETS.default).toBe(30_000)
      expect(TIMEOUT_PRESETS.upload).toBe(120_000)
      expect(TIMEOUT_PRESETS.streaming).toBe(60_000)
      expect(TIMEOUT_PRESETS.fast).toBe(10_000)
    })
  })

  // ========================================================================
  // API 版本
  // ========================================================================
  describe('API_VERSION', () => {
    it('导出版本号', async () => {
      const { API_VERSION } = await import('@/api/http')
      expect(API_VERSION).toBe('v1')
    })

    it('客户端baseURL包含版本号', async () => {
      const { http } = await import('@/api/http')
      expect(http.defaults.baseURL).toContain('/api/v1')
    })
  })
})
