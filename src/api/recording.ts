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

/**
 * 下载录像
 * Phase 14 P0 修复 14.3: BE 返回 JSON {download_url, recording_id},前端解析 URL 后触发浏览器下载
 */
export async function downloadRecording(id: string): Promise<void> {
  const resp = await recordingHttp.get<ApiResponse<{ download_url: string; recording_id: string }>>(
    `/${id}/download`
  )
  const url = resp.data?.data?.download_url
  if (!url) {
    throw new Error('download_url not provided by backend')
  }
  // 浏览器触发下载: 创建隐藏 <a download> 元素
  const a = document.createElement('a')
  a.href = url
  a.download = `${id}.mp4`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** 删除录像 */
export function deleteRecording(id: string) {
  return recordingHttp.delete<ApiResponse<void>>(`/${id}`)
}

/** 回放控制(暂停/恢复/跳转/倍速) */
export function controlPlayback(id: string, action: 'pause' | 'resume' | 'seek' | 'speed', params?: { position?: number; speed?: number; scale?: number }) {
  return recordingHttp.post<ApiResponse<void>>(`/${id}/control`, { action, ...params })
}

// ── GB28181 设备录像查询 ──

/** POST /recordings/query 返回的录像条目 */
export interface DeviceRecording {
  id: string
  device_id: string
  channel_id: string
  start_time: string
  end_time: string
  type: string
  file_size: number
}

/** 按设备/通道/时间范围查询 GB28181 录像 */
export async function queryRecordings(params: {
  device_id: string
  channel_id?: string
  start_time: string
  end_time: string
}): Promise<DeviceRecording[]> {
  const { data } = await recordingHttp.post('/query', params)
  const d = data?.data ?? data
  return d?.recordings ?? d ?? []
}
