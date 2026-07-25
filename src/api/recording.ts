/**
 * 华盾AI智能视频盒子 v7.0 - 录像管理 API
 * api/recording.ts — 录像查询、回放、下载
 *
 * 🆕 优化：使用专用 recordingHttp 客户端，移除硬编码 URL
 */

import { recordingHttp, channelHttp } from './http'
import axios from 'axios'
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

/**
 * 将 Date 格式化为本地时间 ISO 字符串 (YYYY-MM-DDTHH:mm:ss)
 * 后端 mktime() 按本地时间解析，不能使用 toISOString() (会转 UTC 导致 8 小时偏差)
 */
export function toLocalISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

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
  stream_name?: string
  start_time: string
  end_time: string
}): Promise<DeviceRecording[]> {
  const { data } = await recordingHttp.post('/query', params)
  const d = data?.data ?? data
  return d?.recordings ?? d ?? []
}

// ╒═════════════════════════════════════════════════════
// [P0-1] 录像计划表 (Recording Schedule) CRUD
// ═════════════════════════════════════════════════════

export interface TimeSegment {
  /** 0=周日, 1-6=周一~周六, 7=每天 */
  day: number
  /** "HH:mm" */
  start: string
  /** "HH:mm" */
  end: string
}

export interface RecordingSchedule {
  id?: number
  channel_id: string
  device_id?: string
  schedule_name?: string
  schedule_type: 'continuous' | 'time_segment' | 'event'
  time_segments: TimeSegment[]
  event_types?: string
  stream_type?: 'main' | 'sub'
  pre_record_seconds?: number
  post_record_seconds?: number
  enabled: boolean
  created_at?: string
  updated_at?: string
}

/** 查询录像计划列表 */
export async function getRecordingSchedules(channelId?: string): Promise<RecordingSchedule[]> {
  const { data } = await axios.get('/api/v1/recording-schedules', {
    params: channelId ? { channel_id: channelId } : {},
  })
  const d = data?.data ?? data
  if (!Array.isArray(d)) return []
  return d.map((s: any) => ({
    ...s,
    time_segments: typeof s.time_segments === 'string' ? JSON.parse(s.time_segments || '[]') : (s.time_segments || []),
    enabled: s.enabled === 1 || s.enabled === true,
  }))
}

/** 创建录像计划 */
export async function createRecordingSchedule(schedule: RecordingSchedule): Promise<RecordingSchedule> {
  const { data } = await axios.post('/api/v1/recording-schedules', {
    ...schedule,
    time_segments: JSON.stringify(schedule.time_segments || []),
    enabled: schedule.enabled ? 1 : 0,
  })
  return data?.data ?? data
}

/** 更新录像计划 */
export async function updateRecordingSchedule(id: number, updates: Partial<RecordingSchedule>): Promise<void> {
  const payload: any = { ...updates }
  if (updates.time_segments) {
    payload.time_segments = JSON.stringify(updates.time_segments)
  }
  if (updates.enabled !== undefined) {
    payload.enabled = updates.enabled ? 1 : 0
  }
  await axios.put(`/api/v1/recording-schedules/${id}`, payload)
}

/** 删除录像计划 */
export async function deleteRecordingSchedule(id: number): Promise<void> {
  await axios.delete(`/api/v1/recording-schedules/${id}`)
}

// ╒═════════════════════════════════════════════════════
// [P0-2] 录像水印配置
// ═════════════════════════════════════════════════════

export interface WatermarkConfig {
  channel_id: string
  enabled: boolean
  show_timestamp: boolean
  show_channel_name: boolean
  custom_text: string
  position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'
  font_size: number
  color: string
  bg_color: string
}

/** 获取通道水印配置 */
export async function getWatermark(channelId: string): Promise<WatermarkConfig> {
  const { data } = await channelHttp.get(`/${channelId}/watermark`)
  return data?.data ?? data
}

/** 设置通道水印配置 */
export async function updateWatermark(channelId: string, config: Partial<WatermarkConfig>): Promise<WatermarkConfig> {
  const { data } = await channelHttp.put(`/${channelId}/watermark`, config)
  return data?.data ?? data
}

// ╒═════════════════════════════════════════════════════
// [P1-2] 片段下载
// ═════════════════════════════════════════════════════

/** 下载指定时间范围的录像片段 */
export async function downloadSegment(params: {
  device_id: string
  channel_id?: string
  start_time: string
  end_time: string
}): Promise<void> {
  const { data } = await recordingHttp.post('/download-segment', params)
  const url = data?.data?.download_url
  if (!url) throw new Error('download_url not provided by backend')
  const a = document.createElement('a')
  a.href = url
  a.download = `segment_${params.start_time}_${params.end_time}.mp4`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ╒═════════════════════════════════════════════════════
// [P2-1] 存储容量预估
// ═════════════════════════════════════════════════════

export interface StorageEstimate {
  channels: number
  hours_per_day: number
  bitrate_kbps: number
  retention_days: number
  gb_per_channel_per_day: number
  total_gb: number
  total_tb: number
  recommended_disk_tb: number
}

/** 计算存储容量预估 */
export async function getStorageEstimate(params: {
  channel_count?: number
  hours_per_day?: number
  bitrate_kbps?: number
  retention_days?: number
}): Promise<StorageEstimate> {
  const { data } = await axios.get('/api/v1/recording/storage-estimate', { params })
  return data?.data?.estimation ?? data?.estimation
}
