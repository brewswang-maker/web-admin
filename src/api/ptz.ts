/**
 * PTZ 云台控制 API
 */
import { http } from './http'

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
  return http.post('/api/v1/ptz/control', params)
}

/** PTZ停止 */
export function ptzStop(deviceId: string, channelId?: string) {
  return http.post('/api/v1/ptz/stop', { deviceId, channelId })
}

/** PTZ绝对定位 */
export function ptzAbsolute(deviceId: string, params: { pan: number; tilt: number; zoom: number; channelId?: string }) {
  return http.post(`/api/v1/ptz/${deviceId}/absolute`, params)
}

/** 获取预置位列表 */
export function getPresets(deviceId: string, channelId?: string) {
  return http.get(`/api/v1/ptz/${deviceId}/presets`, { params: { channelId } })
}

/** 设置预置位 */
export function setPreset(deviceId: string, params: { name: string; channelId?: string }) {
  return http.post(`/api/v1/ptz/${deviceId}/presets`, params)
}

/** 删除预置位 */
export function deletePreset(deviceId: string, presetId: number) {
  return http.delete(`/api/v1/ptz/${deviceId}/presets/${presetId}`)
}
