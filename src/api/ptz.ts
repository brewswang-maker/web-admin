/**
 * 华盾AI智能视频盒子 v7.0 - PTZ 云台控制 API
 * api/ptz.ts — PTZ 方向控制、预置位、绝对定位
 *
 * 🆕 优化：使用专用 ptzHttp 客户端，移除硬编码 URL
 */

import { ptzHttp } from './http'
import type { ApiResponse } from '@/types/common'

export interface PTZParams {
  deviceId: string
  channelId?: string
  direction?: 'up' | 'down' | 'left' | 'right' | 'home' | 'zoom_in' | 'zoom_out' | 'goto_preset'
  speed?: number
  preset?: number
  pan?: number
  tilt?: number
  zoom?: number
}

/** PTZ控制(持续移动) */
export function ptzControl(params: PTZParams) {
  return ptzHttp.post<ApiResponse<void>>('/control', params)
}

/** PTZ停止 */
export function ptzStop(deviceId: string, channelId?: string) {
  return ptzHttp.post<ApiResponse<void>>('/stop', { deviceId, channelId })
}

/** PTZ绝对定位 */
export function ptzAbsolute(deviceId: string, params: { pan: number; tilt: number; zoom: number; channelId?: string }) {
  return ptzHttp.post<ApiResponse<void>>(`/${deviceId}/absolute`, params)
}

/** 获取预置位列表 */
export function getPresets(deviceId: string, channelId?: string) {
  return ptzHttp.get<ApiResponse<Array<{ id: number; name: string }>>>(`/${deviceId}/presets`, { params: { channelId } })
}

/** 设置预置位 */
export function setPreset(deviceId: string, params: { name: string; channelId?: string }) {
  return ptzHttp.post<ApiResponse<{ presetId: number }>>(`/${deviceId}/presets`, params)
}

/** 删除预置位 */
export function deletePreset(deviceId: string, presetId: number) {
  return ptzHttp.delete<ApiResponse<void>>(`/${deviceId}/presets/${presetId}`)
}
