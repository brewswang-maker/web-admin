/**
 * Logs API — 系统日志
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface LogEntry {
  id: string
  level: 'debug' | 'info' | 'warn' | 'error'
  module: string
  message: string
  timestamp: string
  details?: string
}

export interface LogExportOptions {
  level?: string
  startTime?: string
  endTime?: string
  format?: 'csv' | 'json' | 'txt'
  limit?: number
}

const logsApi = {
  /** 日志列表 */
  list(params?: { level?: string; module?: string; page?: number; pageSize?: number }) {
    return http.get<ApiResponse<{ items: LogEntry[]; total: number }>>('/logs', { params })
  },

  /** 导出日志 */
  exportLogs(options: LogExportOptions = {}) {
    return http.post<ApiResponse<{ url: string }>>('/logs/export', options)
  }
}

export default logsApi
