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
  maxRetries: 1,  // 减少重试次数，之前是2
  baseDelay: 300,  // 减少初始延迟，之前是500
  maxDelay: 3000,  // 减少最大延迟，之前是5000
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
    /** 期望后端返回分页结构 (items/total/page/pageSize/totalPages) */
    expectPageShape?: boolean
  }
}

// ─────────────────────────────────────────────────────────
// 3.5. 响应数据归一化 (Phase 13 P0 #1, #2 + P1 timestamp)
// ─────────────────────────────────────────────────────────

/**
 * 后端列表端点使用 {plural,total} 风格 (如 {devices,total}、{alarms,total}),
 * 前端统一期望 {items,total,page,pageSize,totalPages}。
 * 已知 wrapper key 全清单见下方。
 */
const PLURAL_WRAPPER_KEYS = [
  'devices', 'alarms', 'channels', 'algos', 'algorithms', 'models',
  'recordings', 'teams', 'pipelines', 'rules', 'patterns', 'policies',
  'logs', 'users', 'keys', 'webhooks', 'plans', 'invoices', 'products',
  'orders', 'licenses', 'scenes', 'projects', 'notifications',
  'firmwares', 'tasks', 'streams', 'members', 'permissions', 'roles',
  'docs', 'endpoints', 'event_types', 'alerts', 'recognition_events',
  'face_records', 'behaviors', 'items',
] as const

/**
 * 将后端 {devices,total} / {items,total} 统一转换为 PageResponse。
 * 仅在 data[k] 是数组且非空场景下进行转换，避免误识别。
 */
function unwrapPageData<T = unknown>(data: any): T {
  if (!data || typeof data !== 'object') return data as T
  // 已是 PageResponse 形态 → 直接返回
  if (Array.isArray((data as any).items) && typeof (data as any).total === 'number') {
    return data as T
  }
  for (const k of PLURAL_WRAPPER_KEYS) {
    if (Array.isArray((data as any)[k])) {
      const arr = (data as any)[k]
      const total = typeof (data as any).total === 'number' ? (data as any).total : arr.length
      const page = typeof (data as any).page === 'number' ? (data as any).page : 1
      const pageSize = typeof (data as any).pageSize === 'number' ? (data as any).pageSize : arr.length
      const totalPages = typeof (data as any).totalPages === 'number'
        ? (data as any).totalPages
        : Math.max(1, Math.ceil(total / pageSize))
      return { items: arr, total, page, pageSize, totalPages } as any
    }
  }
  return data as T
}

/** 已知的时间字段 (unix_ms number) → ISO 字符串 */
const TIMESTAMP_KEY_PATTERNS = [
  /^timestamp$/i,
  /At$/,
  /_at$/,
  /Time$/,
  /_time$/,
  /timestamp_ms$/i,
]

function isTimestampKey(k: string): boolean {
  return TIMESTAMP_KEY_PATTERNS.some((p) => p.test(k))
}

function normalizeTimestamps(obj: any): any {
  if (obj == null) return obj
  if (obj instanceof Date) return obj
  if (Array.isArray(obj)) return obj.map(normalizeTimestamps)
  if (typeof obj !== 'object') return obj
  const result: any = {}
  for (const [k, v] of Object.entries(obj)) {
    if (isTimestampKey(k) && typeof v === 'number' && v > 0) {
      // unix_ms (>= 10^12) 或 unix_s (>= 10^9) 自动识别
      const ms = v > 1e12 ? v : v * 1000
      result[k] = new Date(ms).toISOString()
    } else {
      result[k] = normalizeTimestamps(v)
    }
  }
  return result
}

/** camelCase → snake_case (仅对纯 JSON body 生效) */
function camelToSnakeKey(k: string): string {
  // 已含下划线的全小写 key 不动
  if (/^[a-z0-9_]+$/.test(k)) return k
  return k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()).replace(/^_/, '')
}

function camelToSnake(obj: any): any {
  if (obj == null) return obj
  if (obj instanceof Date || obj instanceof File || obj instanceof FormData || obj instanceof Blob) return obj
  if (Array.isArray(obj)) return obj.map(camelToSnake)
  if (typeof obj !== 'object') return obj
  const result: any = {}
  for (const [k, v] of Object.entries(obj)) {
    result[camelToSnakeKey(k)] = camelToSnake(v)
  }
  return result
}

// [P0-2 修复 2026-06-23] snake_case → camelCase 逆转换
//   请求拦截器执行了 camelToSnake，后端存储的是 snake_case。
//   如果响应拦截器不做逆转换，前端加载后 fromNode 变成 undefined、hasROI 变成 false。
//   必须 bidirectional symmetric: 请求 camel→snake，响应 snake→camel。

/** 跳过这些 key 不做 snake→camel 转换 (全大写缩写、已知 snake_case 常量等) */
const SNAKE_TO_CAMEL_SKIP_KEYS = new Set([
  'id', 'url', 'uri', 'fps', 'tpu', 'cpu', 'gpu', 'rtsp', 'rtmp', 'http', 'https',
  'tcp', 'udp', 'sns', 'sms', 'api', 'sdk', 'cli', 'dns', 'cdn', 'mac', 'ip',
  'osd', 'roi', 'json', 'xml', 'csv', 'sql', 'uuid', 'ml', 'ai', 'ocr', 'lpr',
  'reid', 'ppe', 'yolo', 'onvif', 'sip', 'mqtt', 'ws', 'wss',
  'created_at', 'updated_at', 'deleted_at', // 这些由 normalizeTimestamps 处理
])

/** snake_case key → camelCase key */
function snakeToCamelKey(k: string): string {
  // 不含下划线 → 已经是 camelCase 或单词，跳过
  if (!k.includes('_')) return k
  // 在跳过名单中 → 保持原样
  if (SNAKE_TO_CAMEL_SKIP_KEYS.has(k)) return k
  // snake_case → camelCase: from_node → fromNode
  return k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
}

/** 递归 snake_case → camelCase */
function snakeToCamel(obj: any): any {
  if (obj == null) return obj
  if (obj instanceof Date || obj instanceof File || obj instanceof FormData || obj instanceof Blob) return obj
  if (Array.isArray(obj)) return obj.map(snakeToCamel)
  if (typeof obj !== 'object') return obj
  const result: any = {}
  for (const [k, v] of Object.entries(obj)) {
    result[snakeToCamelKey(k)] = snakeToCamel(v)
  }
  return result
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
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || `/api/${API_VERSION}`

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

      // [Fix 2026-06-23] 移除全局 camelToSnake 自动转换
      //   与响应拦截器的 snakeToCamel 配对移除。项目中的 API 模块（face.ts 等）
      //   已经使用 snake_case 字段名，全局转换会导致双重转换问题。
      //   需要做 snake_case 转换的模块应自行处理。
      // if (
      //   config.data &&
      //   typeof config.data === 'object' &&
      //   !(config.data instanceof FormData) &&
      //   !(config.data instanceof Blob) &&
      //   !(config.data instanceof ArrayBuffer) &&
      //   !(config.data instanceof URLSearchParams)
      // ) {
      //   config.data = camelToSnake(config.data)
      // }

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

      // Phase 13 P0 #1: 分页结构归一化
      if (config.expectPageShape && data && typeof data === 'object' && 'data' in data) {
        data.data = unwrapPageData(data.data)
      } else if (config.expectPageShape && Array.isArray(data)) {
        // 兼容后端直接返回数组的场景
        response.data = {
          code: 0,
          message: 'ok',
          data: unwrapPageData({ items: data }),
        } as any
      }

      // [Fix 2026-06-23] 移除全局 snakeToCamel 自动转换
      //   原因：项目中 face.ts / alarm.ts 等大量 API 模块的类型定义使用 snake_case
      //   （如 person_id, alarm_type, group_type），与后端返回格式一致。
      //   全局 snakeToCamel 会把 person_id → personId、alarm_type → alarmType，
      //   导致前端代码访问 row.person_id / raw.alarm_type 时得到 undefined。
      //   需要做 camelCase 转换的模块应自行处理，不应在全局拦截器中强制执行。
      // if (data && typeof data === 'object' && 'data' in data && data.data) {
      //   data.data = snakeToCamel(data.data)
      // }

      // [Fix 2026-06-23] 移除全局 normalizeTimestamps 自动转换
      //   原因：FaceRecord.created_at 类型为 number(unix秒)，全局转换会把它变成 ISO 字符串，
      //   导致 formatDate 函数处理类型不一致。各模块应自行处理时间戳格式。
      // if (data && typeof data === 'object' && 'data' in data && data.data) {
      //   data.data = normalizeTimestamps(data.data)
      // }

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

/** 3D 场景模型资源客户端 (glTF/GLB 场景模型，非 AI 推理模型) */
export const scene3dModelHttp = createHttpClient('/scene3d/models', {
  maxRetries: 2,
  baseDelay: 1000,
})

/** 推理服务客户端 */
export const inferenceHttp = createHttpClient('/inference')
