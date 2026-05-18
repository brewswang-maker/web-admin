/**
 * 华盾AI智能视频盒子 v7.0 - 位置与轨迹 API
 * api/location.ts — 设备定位、轨迹查询、MobilePosition
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'

/** 设备位置信息 */
export interface DeviceLocation {
  deviceId: string
  name: string
  longitude: number
  latitude: number
  gcjLongitude: number
  gcjLatitude: number
  speed?: number
  direction?: number
  altitude?: number
  lastPositionTime?: number
  status: string
  manufacturer?: string
  model?: string
}

/** 轨迹点 */
export interface TrackPoint {
  longitude: number
  latitude: number
  speed?: number
  direction?: number
  altitude?: number
  timestamp: number
}

/** 轨迹查询结果 */
export interface TrackResult {
  deviceId: string
  points: TrackPoint[]
  totalDistance: number
  duration: number
}

export const locationApi = {
  /** 获取所有设备当前位置 */
  getDeviceLocations() {
    return http.get<ApiResponse<DeviceLocation[]>>('/system/gb28181/devices')
  },

  /** 获取单个设备位置 */
  getDeviceLocation(deviceId: string) {
    return http.get<ApiResponse<DeviceLocation>>(`/system/gb28181/devices/${deviceId}`)
  },

  /** 查询设备轨迹（时间段内） */
  getDeviceTrack(deviceId: string, startTime: string, endTime: string) {
    return http.get<ApiResponse<TrackResult>>(`/system/gb28181/devices/${deviceId}/track`, {
      params: { start_time: startTime, end_time: endTime }
    })
  },

  /** 订阅设备位置更新 */
  subscribePosition(deviceId: string, interval = 5, expiry = 3600) {
    return http.post<ApiResponse<{ subscriptionId: string }>>(
      `/system/gb28181/devices/${deviceId}/subscribe/mobile-position`,
      { interval, expiry }
    )
  },

  /** 取消位置订阅 */
  unsubscribePosition(deviceId: string) {
    return http.delete<ApiResponse<void>>(
      `/system/gb28181/devices/${deviceId}/subscribe/mobile-position`
    )
  },
}
