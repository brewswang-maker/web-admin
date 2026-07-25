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
    | 'cruise_start' | 'cruise_stop' | 'track_start' | 'track_stop' | 'set_preset' | 'clear_preset'
    // [P0-3] GB28181 PTZ扩展: 聚焦/光圈/辅助开关
    | 'focus_near' | 'focus_far' | 'iris_open' | 'iris_close' | 'aux_on' | 'aux_off' | 'wiper_on' | 'wiper_off'
    | 'light_on' | 'light_off' | 'heater_on' | 'heater_off'
  speed?: number
  preset?: number
  pan?: number
  tilt?: number
  zoom?: number
  /** 巡航路径编号 */
  cruisePath?: number
  /** 轨迹编号 */
  trackId?: number
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

/** 启动巡航路径 */
export function startCruise(deviceId: string, params: { channelId?: string; cruisePath: number; speed?: number }) {
  return ptzHttp.post<ApiResponse<void>>('/control', {
    deviceId,
    channelId: params.channelId,
    direction: 'cruise_start',
    cruisePath: params.cruisePath,
    speed: params.speed || 128,
  })
}

/** 停止巡航 */
export function stopCruise(deviceId: string, channelId?: string) {
  return ptzHttp.post<ApiResponse<void>>('/control', {
    deviceId,
    channelId,
    direction: 'cruise_stop',
  })
}

/** 启动轨迹跟踪 */
export function startTrack(deviceId: string, params: { channelId?: string; trackId: number }) {
  return ptzHttp.post<ApiResponse<void>>('/control', {
    deviceId,
    channelId: params.channelId,
    direction: 'track_start',
    trackId: params.trackId,
  })
}

/** 停止轨迹跟踪 */
export function stopTrack(deviceId: string, channelId?: string) {
  return ptzHttp.post<ApiResponse<void>>('/control', {
    deviceId,
    channelId,
    direction: 'track_stop',
  })
}

/** [P0-3] 辅助开关控制 (雨刷/灯光/加热等) */
export function ptzAuxControl(deviceId: string, params: {
  channelId?: string
  /** 辅助设备: wiper(雨刷) / light(灯光) / heater(加热) / fan(风扇) */
  auxType: 'wiper' | 'light' | 'heater' | 'fan'
  enable: boolean
}) {
  const dirMap: Record<string, string> = {
    wiper: 'wiper',
    light: 'light',
    heater: 'heater',
    fan: 'aux',
  }
  const auxName = dirMap[params.auxType] || 'aux'
  return ptzHttp.post<ApiResponse<void>>('/control', {
    deviceId,
    channelId: params.channelId,
    direction: params.enable ? `${auxName}_on` : `${auxName}_off`,
  })
}

/** 3D 定位 (点击画面放大特定区域) */
export function ptz3DPosition(deviceId: string, params: {
  channelId?: string
  /** 归一化坐标 0.0~1.0 */
  centerPan: number
  centerTilt: number
  /** 放大倍数 1~8 */
  zoomLevel: number
}) {
  return ptzHttp.post<ApiResponse<void>>('/control', {
    deviceId,
    channelId: params.channelId,
    direction: 'goto_preset',
    pan: params.centerPan,
    tilt: params.centerTilt,
    zoom: params.zoomLevel,
  })
}
