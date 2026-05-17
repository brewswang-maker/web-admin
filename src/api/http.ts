/**
 * 华盾AI智能视频盒子 v7.0 - HTTP 客户端封装（优化版）
 * api/http.ts — 统一的 Axios 实例，所有 API 模块共用
 *
 * 🆕 优化内容：
 * 1. 请求重试机制 — 支持可配置重试次数、间隔、幂等性判断
 * 2. 超时分级策略 — 默认 30s，上传 120s，流式 60s
 * 3. 请求/响应拦截器增强 — 统一请求 ID、性能埋点、错误分类
 * 4. 统一错误码定义 — ApiErrorCode 枚举，业务/网络/认证全覆盖
 * 5. API 版本管理 — 集中版本号，自动注入 Header
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'
import { getAuthToken, removeAuthToken } from '@/utils/auth'
import type { ApiResponse } from '@/types/common'

// ─────────────────────────────────────────────────────────
// 1. 统一错误码定义
// ─────────────────────────────────────────────────────────

/** API 统一错误码枚举 */
export enum ApiErrorCode {
  // ── 成功 ──
  SUCCESS = 0,

  // ── 客户端错误 4xx ──
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  VALIDATION_FAILED = 422,
  RATE_LIMITED = 429,

  // ── 服务端错误 5xx ──
  INTERNAL_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,

  // ── 业务错误码 1xxxx ──
  BIZ_TOKEN_EXPIRED = 10001,
  BIZ_PERMISSION_DENIED = 10002,
  BIZ_RESOURCE_NOT_FOUND = 10003,
  BIZ_DUPLICATE_OPERATION = 10004,
  BIZ_QUOTA_EXCEEDED = 10005,

  // ── 网络/客户端错误 2xxxx ──
  NETWORK_ERROR = 20001,
  TIMEOUT_ERROR = 20002,
  RETRY_EXHAUSTED = 20003,
  CANCELLED = 20004,
}

/** 错误码 → 用户友好消息 */
const ERROR_MESSAGES: Record<number, string> = {
  [ApiErrorCode.BAD_REQUEST]: '请求参数错误',
  [ApiErrorCode.UNAUTHORIZED]: '未授权，请重新登录',
  [ApiErrorCode.FORBIDDEN]: '权限不足',
  [ApiErrorCode.NOT_FOUND]: '请求的资源不存在',
  [ApiErrorCode.CONFLICT]: '资源冲突，请刷新后重试',
  [ApiErrorCode.VALIDATION_FAILED]: '数据验证失败',
  [ApiErrorCode.RATE_LIMITED]: '请求过于频繁，请稍后重试',
  [ApiErrorCode.INTERNAL_ERROR]: '服务器内部错误',
  [ApiErrorCode.SERVICE_UNAVAILABLE]: '服务暂不可用',
  [ApiErrorCode.GATEWAY_TIMEOUT]: '网关超时',
  [ApiErrorCode.BIZ_TOKEN_EXPIRED]: '登录已过期，请重新登录',
  [ApiErrorCode.BIZ_PERMISSION_DENIED]: '无操作权限',
  [ApiErrorCode.BIZ_RESOURCE_NOT_FOUND]: '资源不存在',
  [ApiErrorCode.BIZ_DUPLICATE_OPERATION]: '请勿重复操作',
  [ApiErrorCode.BIZ_QUOTA_EXCEEDED]: '配额已用完',
  [ApiErrorCode.NETWORK_ERROR]: '网络连接异常，请检查网络',
  [ApiErrorCode.TIMEOUT_ERROR]: '请求超时，请稍后重试',
  [ApiErrorCode.RETRY_EXHAUSTED]: '请求重试次数耗尽',
  [ApiErrorCode.CANCELLED]: '请求已取消',
}

/** 根据错误码获取友好消息 */
export function getErrorMessage(code: number): string {
  return ERROR_MESSAGES[code] || '请求失败，请稍后重试'
}

// ─────────────────────────────────────────────────────────
// 2. 重试配置
// ─────────────────────────────────────────────────────────

export interface RetryConfig {
  /** 最大重试次数（默认 2） */
  maxRetries: number
  /** 重试间隔基数（ms），实际延迟 = baseDelay * 2^attempt */
  baseDelay: number
  /** 最大重试间隔（ms，默认 5000） */
  maxDelay: number
  /** 判断是否可重试的 HTTP 状态码集合 */
  retryableStatuses: number[]
  /** 判断是否可重试的业务错误码集合 */
  retryableBizCodes: number[]
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelay: 500,
  maxDelay: 5000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableBizCodes: [],
}

/** 附加到 AxiosRequestConfig 上的重试元数据 */
interface RetryMeta {
  retryCount: number
  retryConfig: RetryConfig
}

declare module 'axios' {
  interface AxiosRequestConfig {
    _retryMeta?: RetryMeta
    /** 自定义超时（毫秒），优先于全局默认 */
    timeoutMs?: number
    /** 是否跳过重试 */
    skipRetry?: boolean
  }
}

// ─────────────────────────────────────────────────────────
// 3. 超时分级策略
// ─────────────────────────────────────────────────────────

export const TIMEOUT_PRESETS = {
  /** 默认请求 30s */
  default: 30_000,
  /** 文件上传 120s */
  upload: 120_000,
  /** 流式/SSE 请求 60s */
  streaming: 60_000,
  /** 快速查询 10s */
  fast: 10_000,
} as const

// ─────────────────────────────────────────────────────────
// 4. API 版本管理
// ─────────────────────────────────────────────────────────

/** 当前 API 版本号 */
export const API_VERSION = 'v1'

/** API 版本 Header 名 */
const API_VERSION_HEADER = 'X-API-Version'

/** 基础 URL（含版本） */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || `/api/${API_VERSION}`

// ─────────────────────────────────────────────────────────
// 5. 请求 ID 生成（用于链路追踪）
// ─────────────────────────────────────────────────────────

let requestSeq = 0

function generateRequestId(): string {
  requestSeq = (requestSeq + 1) % 1_000_000
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `req_${ts}_${rand}_${requestSeq}`
}

// ─────────────────────────────────────────────────────────
// 6. 创建 HTTP 客户端
// ─────────────────────────────────────────────────────────

/**
 * 创建带鉴权、重试、拦截器的 HTTP 客户端
 * @param basePath API 子路径，如 '/devices'
 * @param retryOverride 可选重试配置覆盖
 */
function createHttpClient(basePath = '', retryOverride?: Partial<RetryConfig>): AxiosInstance {
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryOverride }

  const client = axios.create({
    baseURL: `${BASE_URL}${basePath}`,
    timeout: TIMEOUT_PRESETS.default,
    headers: {
      'Content-Type': 'application/json',
      [API_VERSION_HEADER]: API_VERSION,
    },
  })

  // ── 请求拦截器 ─────────────────────────────────────────
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // 注入 Token
      const token = getAuthToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }

      // 注入请求 ID（链路追踪）
      config.headers['X-Request-Id'] = generateRequestId()

      // 自定义超时
      if (config.timeoutMs) {
        config.timeout = config.timeoutMs
      }

      // 初始化重试元数据
      if (!config._retryMeta) {
        config._retryMeta = { retryCount: 0, retryConfig }
      }

      return config
    },
    (error) => Promise.reject(error)
  )

  // ── 响应拦截器 ─────────────────────────────────────────
  client.interceptors.response.use(
    (response: AxiosResponse<ApiResponse>) => {
      const { data, config } = response
      const requestId = config.headers?.['X-Request-Id'] as string

      // 业务错误码处理
      if (data?.code !== undefined && data.code !== ApiErrorCode.SUCCESS && data.code !== 200) {
        const bizCode = data.code as ApiErrorCode

        // Token 过期 → 特殊处理
        if (bizCode === ApiErrorCode.BIZ_TOKEN_EXPIRED) {
          handleAuthExpired()
        }

        const err = new ApiError(
          bizCode,
          data.message || getErrorMessage(bizCode),
          requestId,
          config.url
        )
        return Promise.reject(err)
      }

      return response
    },
    async (error: AxiosError) => {
      const config = error.config as InternalAxiosRequestConfig & { _retryMeta?: RetryMeta }
      const requestId = config?.headers?.['X-Request-Id'] as string

      // ── 401 未授权 → 跳转登录 ──
      if (error.response?.status === ApiErrorCode.UNAUTHORIZED) {
        handleAuthExpired()
        return Promise.reject(
          new ApiError(ApiErrorCode.UNAUTHORIZED, getErrorMessage(ApiErrorCode.UNAUTHORIZED), requestId, config?.url)
        )
      }

      // ── 403 禁止 ──
      if (error.response?.status === ApiErrorCode.FORBIDDEN) {
        console.error(`[HTTP] 权限不足: ${config?.url} (reqId=${requestId})`)
        return Promise.reject(
          new ApiError(ApiErrorCode.FORBIDDEN, getErrorMessage(ApiErrorCode.FORBIDDEN), requestId, config?.url)
        )
      }

      // ── 429 限流 → 自动重试 ──
      if (error.response?.status === 429) {
        const retryAfter = Number(error.response.headers['retry-after']) || 1
        if (canRetry(config)) {
          config._retryMeta!.retryCount++
          await sleep(Math.min(retryAfter * 1000, config._retryMeta!.retryConfig.maxDelay))
          return client.request(config)
        }
      }

      // ── 重试逻辑（网络错误 / 可重试状态码）──
      if (shouldRetry(error, config)) {
        const meta = config._retryMeta!
        meta.retryCount++
        const delay = calcRetryDelay(meta.retryCount, meta.retryConfig)
        console.warn(
          `[HTTP] 请求重试 (${meta.retryCount}/${meta.retryConfig.maxRetries}): ` +
          `${config?.url} delay=${delay}ms (reqId=${requestId})`
        )
        await sleep(delay)
        return client.request(config)
      }

      // ── 超时错误 ──
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return Promise.reject(
          new ApiError(ApiErrorCode.TIMEOUT_ERROR, getErrorMessage(ApiErrorCode.TIMEOUT_ERROR), requestId, config?.url)
        )
      }

      // ── 取消请求 ──
      if (axios.isCancel(error)) {
        return Promise.reject(
          new ApiError(ApiErrorCode.CANCELLED, getErrorMessage(ApiErrorCode.CANCELLED), requestId, config?.url)
        )
      }

      // ── 网络错误（无响应） ──
      if (!error.response) {
        return Promise.reject(
          new ApiError(ApiErrorCode.NETWORK_ERROR, getErrorMessage(ApiErrorCode.NETWORK_ERROR), requestId, config?.url)
        )
      }

      // ── 其他 HTTP 错误 ──
      const status = error.response.status as ApiErrorCode
      return Promise.reject(
        new ApiError(status, getErrorMessage(status) || error.message, requestId, config?.url)
      )
    }
  )

  return client
}

// ─────────────────────────────────────────────────────────
// 7. 自定义错误类
// ─────────────────────────────────────────────────────────

/** API 错误（包含错误码、请求ID、请求路径） */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly requestId: string
  readonly url?: string
  readonly timestamp: string

  constructor(code: ApiErrorCode, message: string, requestId: string, url?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.requestId = requestId
    this.url = url
    this.timestamp = new Date().toISOString()
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  /** 是否可被用户重试 */
  get retryable(): boolean {
    return [
      ApiErrorCode.NETWORK_ERROR,
      ApiErrorCode.TIMEOUT_ERROR,
      ApiErrorCode.SERVICE_UNAVAILABLE,
      ApiErrorCode.GATEWAY_TIMEOUT,
      ApiErrorCode.RETRY_EXHAUSTED,
    ].includes(this.code)
  }

  /** 是否为认证相关错误 */
  get isAuthError(): boolean {
    return [ApiErrorCode.UNAUTHORIZED, ApiErrorCode.BIZ_TOKEN_EXPIRED].includes(this.code)
  }

  /** 格式化为可展示的字符串 */
  toString(): string {
    return `[ApiError] code=${this.code} msg="${this.message}" url=${this.url} reqId=${this.requestId}`
  }
}

// ─────────────────────────────────────────────────────────
// 8. 辅助函数
// ─────────────────────────────────────────────────────────

/** 判断是否可重试 */
function canRetry(config: InternalAxiosRequestConfig & { _retryMeta?: RetryMeta }): boolean {
  if (!config._retryMeta) return false
  if (config.skipRetry) return false
  return config._retryMeta.retryCount < config._retryMeta.retryConfig.maxRetries
}

/** 判断是否应该重试（幂等方法 + 可重试状态码） */
function shouldRetry(error: AxiosError, config?: InternalAxiosRequestConfig & { _retryMeta?: RetryMeta }): boolean {
  if (!config?._retryMeta) return false
  if (config.skipRetry) return false
  if (config._retryMeta.retryCount >= config._retryMeta.retryConfig.maxRetries) return false

  // 只重试幂等方法
  const method = (config.method || 'get').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method)) return false

  const { retryableStatuses } = config._retryMeta.retryConfig

  // 网络错误（无响应）
  if (!error.response) return true

  return retryableStatuses.includes(error.response.status)
}

/** 计算重试延迟（指数退避 + 抖动） */
function calcRetryDelay(attempt: number, cfg: RetryConfig): number {
  const exponential = cfg.baseDelay * Math.pow(2, attempt - 1)
  const jitter = Math.random() * cfg.baseDelay * 0.5
  return Math.min(exponential + jitter, cfg.maxDelay)
}

/** sleep 工具 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 认证过期处理（防抖，避免多个 401 并发触发多次跳转） */
let authExpiredTimer: ReturnType<typeof setTimeout> | null = null
function handleAuthExpired(): void {
  if (authExpiredTimer) return
  authExpiredTimer = setTimeout(() => {
    authExpiredTimer = null
  }, 5000)
  removeAuthToken()
  const current = window.location.pathname
  if (current !== '/login') {
    window.location.href = `/login?redirect=${encodeURIComponent(current)}`
  }
}

// ─────────────────────────────────────────────────────────
// 9. 导出客户端实例
// ─────────────────────────────────────────────────────────

/** 默认客户端（无前缀） */
export const http = createHttpClient()

/** 设备服务客户端 */
export const deviceHttp = createHttpClient('/devices')

/** 告警服务客户端 */
export const alarmHttp = createHttpClient('/alarms')

/** 通道服务客户端 */
export const channelHttp = createHttpClient('/channels')

/** 统计服务客户端 */
export const statsHttp = createHttpClient('/stats')

/** AI 服务客户端 */
export const aiHttp = createHttpClient('/ai')

/** OTA 服务客户端（上传需要更长超时） */
export const otaHttp = createHttpClient('/ota', {
  maxRetries: 1, // 上传类请求少重试
})

/** 态势服务客户端 */
export const situationHttp = createHttpClient('/situation')

/** 导出服务客户端 */
export const exportHttp = createHttpClient('/export')

/** 联邦学习服务客户端 */
export const federationHttp = createHttpClient('/federation')

/** 开放平台客户端 */
export const platformHttp = createHttpClient('/platform')

/** 流媒体服务客户端 */
export const streamHttp = createHttpClient('/streams')

/** 录像服务客户端 */
export const recordingHttp = createHttpClient('/recordings')

/** 模型管理客户端 */
export const modelHttp = createHttpClient('/models')

/** Pipeline 客户端 */
export const pipelineHttp = createHttpClient('/pipelines')

/** PTZ 云台客户端 */
export const ptzHttp = createHttpClient('/ptz')
