/**
 * 华盾AI智能视频盒子 v7.0 - 通用业务类型定义
 * types/common.ts — 通用类型、API响应、分页等
 */

/** API 统一响应 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/** 分页响应 */
export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 分页查询参数 */
export interface PageQuery {
  page?: number
  pageSize?: number
  keyword?: string
}

/** 排序参数 */
export interface SortQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/** 时间范围 */
export interface TimeRange {
  startTime: string
  endTime: string
}

/** 键值对 */
export interface KeyValue {
  label: string
  value: string | number
}

/** 安全评分 */
export interface SecurityScore {
  overall: number
  trend: number
  dimensions: Array<{
    label: string
    value: number
    color: string
  }>
}

/** Agent 状态 */
export interface AgentStatus {
  name: string
  type: 'perception' | 'analysis' | 'decision' | 'expert'
  status: 'active' | 'idle' | 'error'
  calls: number
  avgLatency: number
  lastActiveAt: string
}

/** 系统健康 */
export interface SystemHealth {
  apiLatency: number
  dbLatency: number
  cacheHitRate: number
  uptime: number
  version: string
}

/** 选项项（下拉框等） */
export interface OptionItem {
  label: string
  value: string | number
  disabled?: boolean
}

/** 审计日志 */
export interface AuditLog {
  id: string
  timestamp: string
  username: string
  action: 'login' | 'create' | 'update' | 'delete' | 'export' | 'import' | 'config' | 'other'
  resource: string
  resourceId: string
  details: string
  result: 'success' | 'failure'
  ip: string
  userAgent?: string
}

/** 项目 */
export interface Project {
  id: string
  name: string
  description: string
  deviceCount: number
  alarmCount: number
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}
