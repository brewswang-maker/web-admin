/**
 * 华盾AI智能视频盒子 v7.0 - 设备 API
 * api/device.ts — 设备CRUD、发现、同步、重启
 */

import { deviceHttp, http } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'
import type { DeviceItem, DeviceStats, DeviceForm, DiscoveredDevice, DeviceConfig } from '@/types/device'

export const deviceApi = {
  /** 获取设备列表 */
  getList(params?: Record<string, any>) {
    return deviceHttp.get<ApiResponse<PageResponse<DeviceItem>>>('', { params })
  },

  /** 获取设备详情 */
  getDetail(id: string) {
    return deviceHttp.get<ApiResponse<DeviceItem>>(`/${id}`)
  },

  /** 创建设备 */
  create(data: DeviceForm) {
    return deviceHttp.post<ApiResponse<DeviceItem>>('', data)
  },

  /** 更新设备 */
  update(id: string, data: Partial<DeviceForm>) {
    return deviceHttp.put<ApiResponse<DeviceItem>>(`/${id}`, data)
  },

  /** 删除设备 */
  delete(id: string) {
    return deviceHttp.delete<ApiResponse<void>>(`/${id}`)
  },

  /** 获取设备统计 */
  getStats() {
    return deviceHttp.get<ApiResponse<DeviceStats>>('/stats')
  },

  /** ONVIF 发现 */
  discoverOnvif(subnet?: string) {
    return http.get<ApiResponse<{ devices: DiscoveredDevice[]; total: number }>>('/devices/discover/onvif', { params: { subnet } })
  },

  /** GB28181 发现 */
  discoverGB28181() {
    return http.get<ApiResponse<{ devices: DiscoveredDevice[]; total: number }>>('/devices/discover/gb28181')
  },

  /** 同步设备 */
  sync(id: string) {
    return deviceHttp.post<ApiResponse<void>>(`/${id}/sync`)
  },

  /** 重启设备 */
  reboot(id: string) {
    return deviceHttp.post<ApiResponse<void>>(`/${id}/reboot`)
  },

  /** NTP 校时（GB28181 设备校时） */
  syncTime(id: string) {
    return deviceHttp.post<ApiResponse<{ message: string; deviceId: string }>>(`/${id}/sync-time`)
  },

  /** 获取设备通道列表 */
  getChannels(id: string) {
    return http.get<ApiResponse<any>>(`/devices/${id}/channels`)
  },

  /** 获取设备配置 */
  getConfig(id: string) {
    return deviceHttp.get<ApiResponse<DeviceConfig>>(`/${id}/config`)
  },

  /** 更新设备配置 */
  updateConfig(id: string, config: Partial<DeviceConfig>) {
    return deviceHttp.put<ApiResponse<DeviceConfig>>(`/${id}/config`, config)
  },
}
