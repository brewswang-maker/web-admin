/**
 * 华盾AI智能视频盒子 v7.0 - 导出 API
 * api/export.ts — 报表导出、下载相关接口
 */

import { exportHttp } from './http'
import type { ApiResponse } from '@/types/common'

/** 导出任务状态 */
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed'

/** 导出任务 */
export interface ExportTask {
  id: string
  type: 'alarm' | 'device' | 'audit' | 'statistics' | 'custom'
  format: 'xlsx' | 'csv' | 'pdf'
  status: ExportStatus
  progress: number
  fileUrl?: string
  fileName?: string
  fileSize?: number
  params: Record<string, unknown>
  createdBy: string
  createdAt: string
  completedAt?: string
  errorMessage?: string
}

/** 创建导出请求 */
export interface CreateExportRequest {
  type: 'alarm' | 'device' | 'audit' | 'statistics' | 'custom'
  format: 'xlsx' | 'csv' | 'pdf'
  params: Record<string, unknown>
  fileName?: string
}

export const exportApi = {
  /** 创建导出任务 */
  create(data: CreateExportRequest) {
    return exportHttp.post<ApiResponse<ExportTask>>('', data)
  },

  /** 获取导出任务列表 */
  getTasks(params?: { type?: string; status?: ExportStatus; page?: number; pageSize?: number }) {
    return exportHttp.get<ApiResponse<ExportTask[]>>('', { params })
  },

  /** 获取导出任务详情 */
  getTaskDetail(id: string) {
    return exportHttp.get<ApiResponse<ExportTask>>(`/${id}`)
  },

  /** 下载导出文件 */
  downloadFile(id: string) {
    return exportHttp.get(`/${id}/download`, { responseType: 'blob' })
  },

  /** 删除导出任务 */
  deleteTask(id: string) {
    return exportHttp.delete<ApiResponse<void>>(`/${id}`)
  },

  /** 导出告警报表（快捷方式） */
  exportAlarms(params: { startTime?: string; endTime?: string; level?: string; format?: 'xlsx' | 'csv' | 'pdf' }) {
    return exportApi.create({
      type: 'alarm',
      format: params.format || 'xlsx',
      params: {
        startTime: params.startTime,
        endTime: params.endTime,
        level: params.level
      },
      fileName: `告警报表_${new Date().toISOString().slice(0, 10)}`
    })
  },

  /** 导出设备报表（快捷方式） */
  exportDevices(params: { status?: string; format?: 'xlsx' | 'csv' }) {
    return exportApi.create({
      type: 'device',
      format: params.format || 'xlsx',
      params: { status: params.status },
      fileName: `设备报表_${new Date().toISOString().slice(0, 10)}`
    })
  },

  /** 导出审计日志（快捷方式） */
  exportAuditLogs(params: { startTime?: string; endTime?: string; format?: 'xlsx' | 'csv' }) {
    return exportApi.create({
      type: 'audit',
      format: params.format || 'xlsx',
      params: {
        startTime: params.startTime,
        endTime: params.endTime
      },
      fileName: `审计日志_${new Date().toISOString().slice(0, 10)}`
    })
  }
}
