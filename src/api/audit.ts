/**
 * 华盾AI智能视频盒子 v7.0 - 审计日志 API
 * api/audit.ts — 审计日志查询、统计、导出
 */

import { http } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'
import type { AuditLogItem, AuditStats } from '@/types/analytics'

/** 审计日志查询参数 */
export interface AuditLogQuery {
  page?: number
  pageSize?: number
  username?: string
  action?: string
  result?: string
  startTime?: string
  endTime?: string
}

export const auditApi = {
  /** 获取审计日志列表 */
  getLogs(params?: AuditLogQuery) {
    return http.get<ApiResponse<PageResponse<AuditLogItem>>>('/audit/logs', { params })
  },

  /** 获取审计统计 */
  getStats() {
    return http.get<ApiResponse<AuditStats>>('/audit/stats')
  },

  /** 导出审计报告 */
  exportReport(params?: { format?: 'csv' | 'xlsx'; startTime?: string; endTime?: string }) {
    return http.post<ApiResponse<{ url: string }>>('/audit/export', params)
  },
}
