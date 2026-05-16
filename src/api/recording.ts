/**
 * 录像管理 API
 */
import { http } from './http'

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
  return http.get('/api/v1/recordings', { params })
}

/** 播放录像 */
export function playRecording(id: string, params?: { startTime?: string; speed?: number }) {
  return http.post(`/api/v1/recordings/${id}/play`, params)
}

/** 停止播放 */
export function stopPlayback(id: string) {
  return http.post(`/api/v1/recordings/${id}/stop`)
}

/** 下载录像 */
export function downloadRecording(id: string) {
  return http.get(`/api/v1/recordings/${id}/download`, { responseType: 'blob' })
}

/** 删除录像 */
export function deleteRecording(id: string) {
  return http.delete(`/api/v1/recordings/${id}`)
}

/** 回放控制(暂停/恢复/倍速) */
export function controlPlayback(id: string, action: 'pause' | 'resume' | 'seek', params?: { position?: number; speed?: number }) {
  return http.post(`/api/v1/recordings/${id}/control`, { action, ...params })
}
