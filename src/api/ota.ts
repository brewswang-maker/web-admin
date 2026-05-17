/**
 * 华盾AI智能视频盒子 v7.0 - OTA 升级 API
 * api/ota.ts — 固件管理、升级任务相关接口
 */

import { otaHttp } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'

/** 固件状态 */
export type FirmwareStatus = 'draft' | 'published' | 'deprecated'

/** 固件项 */
export interface FirmwareItem {
  id: string
  version: string
  description: string
  fileSize: number
  targetHardware: string[]
  isForce: boolean
  status: FirmwareStatus
  publishedAt: string
  createdAt: string
  downloadUrl: string
  checksum: string
}

/** 升级任务状态 */
export type TaskStatus = 'draft' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled'

/** 升级任务 */
export interface OTATask {
  id: string
  firmwareId: string
  firmwareVer: string
  deviceCount: number
  successCount: number
  failedCount: number
  progress: number
  status: TaskStatus
  scheduledAt: string
  startedAt: string
  completedAt: string
  targetDeviceIds: string[]
  targetHardware?: string
  createdBy: string
  createdAt: string
}

/** 创建升级任务请求 */
export interface CreateTaskRequest {
  firmwareId: string
  targetDeviceIds: string[]
  scheduledAt?: string
  isForce?: boolean
}

/** 固件上传请求 */
export interface UploadFirmwareRequest {
  version: string
  description: string
  targetHardware: string[]
  isForce: boolean
}

export const otaApi = {
  // ===== 固件管理 =====

  /** 获取固件列表 */
  getFirmwares(params?: { status?: FirmwareStatus; page?: number; pageSize?: number }) {
    return otaHttp.get<ApiResponse<PageResponse<FirmwareItem>>>('/firmwares', { params })
  },

  /** 获取固件详情 */
  getFirmwareDetail(id: string) {
    return otaHttp.get<ApiResponse<FirmwareItem>>(`/firmwares/${id}`)
  },

  /** 上传固件 */
  uploadFirmware(file: File, meta: UploadFirmwareRequest) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('version', meta.version)
    formData.append('description', meta.description)
    meta.targetHardware.forEach(h => formData.append('targetHardware', h))
    formData.append('isForce', String(meta.isForce))
    return otaHttp.post<ApiResponse<FirmwareItem>>('/firmwares/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  /** 发布固件 */
  publishFirmware(id: string) {
    return otaHttp.post<ApiResponse<void>>(`/firmwares/${id}/publish`)
  },

  /** 废弃固件 */
  deprecateFirmware(id: string) {
    return otaHttp.post<ApiResponse<void>>(`/firmwares/${id}/deprecate`)
  },

  /** 删除固件 */
  deleteFirmware(id: string) {
    return otaHttp.delete<ApiResponse<void>>(`/firmwares/${id}`)
  },

  // ===== 升级任务 =====

  /** 获取升级任务列表 */
  getTasks(params?: { status?: TaskStatus; page?: number; pageSize?: number }) {
    return otaHttp.get<ApiResponse<PageResponse<OTATask>>>('/tasks', { params })
  },

  /** 获取任务详情 */
  getTaskDetail(id: string) {
    return otaHttp.get<ApiResponse<OTATask>>(`/tasks/${id}`)
  },

  /** 创建升级任务 */
  createTask(data: CreateTaskRequest) {
    return otaHttp.post<ApiResponse<OTATask>>('/tasks', data)
  },

  /** 取消升级任务 */
  cancelTask(id: string) {
    return otaHttp.post<ApiResponse<void>>(`/tasks/${id}/cancel`)
  },

  /** 重试失败任务 */
  retryTask(id: string) {
    return otaHttp.post<ApiResponse<void>>(`/tasks/${id}/retry`)
  },

  /** 获取任务下设备升级明细 */
  getTaskDevices(taskId: string, params?: { status?: 'pending' | 'upgrading' | 'success' | 'failed'; page?: number; pageSize?: number }) {
    return otaHttp.get<ApiResponse<PageResponse<{
      deviceId: string
      deviceName: string
      currentVersion: string
      targetVersion: string
      status: 'pending' | 'upgrading' | 'success' | 'failed'
      progress: number
      errorMessage?: string
      startedAt: string
      completedAt: string
    }>>>(`/tasks/${taskId}/devices`, { params })
  },

  /** 获取OTA统计概览 */
  getStats() {
    return otaHttp.get<ApiResponse<{
      totalFirmwares: number
      activeTasks: number
      totalDevices: number
      upgradedDevices: number
      pendingDevices: number
    }>>('/stats')
  }
}
