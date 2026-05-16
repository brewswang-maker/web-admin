/**
 * 华盾AI智能视频盒子 v7.0 - 录像管理 API
 * api/recording.ts — 录像查询、回放、下载
 *
 * 🆕 优化：使用专用 recordingHttp 客户端，移除硬编码 URL
 */

import { recordingHttp } from './http'
import type { ApiResponse } from '@/types/common'

export interface RecordingSegment {
  id: string
  deviceId: string
  channelNo: number
  startTime: string
  endTime: string
  duration: number
  fileSize: number
  type: 'continuous' | 'event' | 'manual'
  status: 'available' | 'processing' | 'error'
}

/** 获取录像列表 */
export function getRecordings(params: {
  deviceId?: string
  channelNo?: number
  startTime?: string
  endTime?: string
  type?: string
  page?: number
  pageSize?: number
}) {
  return recordingHttp.get<ApiResponse<RecordingSegment[]>>('', { params })
}

/** 播放录像 */
export function playRecording(id: string, params?: { startTime?: string; speed?: number }) {
  return recordingHttp.post<ApiResponse<{ playUrl: string }>>(`/${id}/play`, params)
}

/** 停止播放 */
export function stopPlayback(id: string) {
  return recordingHttp.post<ApiResponse<void>>(`/${id}/stop`)
}

/** 下载录像 */
export function downloadRecording(id: string) {
  return recordingHttp.get(`/${id}/download`, { responseType: 'blob' })
}

/** 删除录像 */
export function deleteRecording(id: string) {
  return recordingHttp.delete<ApiResponse<void>>(`/${id}`)
}

/** 回放控制(暂停/恢复/倍速) */
export function controlPlayback(id: string, action: 'pause' | 'resume' | 'seek', params?: { position?: number; speed?: number }) {
  return recordingHttp.post<ApiResponse<void>>(`/${id}/control`, { action, ...params })
}
