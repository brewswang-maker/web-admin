/**
 * 华盾AI智能视频盒子 v7.0 - 设备 API
 * api/device.ts — 设备CRUD、发现、同步、重启
 *
 * Phase 14 P0 修复 14.1: FE DeviceForm 字段(ip/name/rtspPort) 与 BE 期望字段
 * (ip_address/device_name/port) 不一致,需要 transformRequest 显式映射
 */

import { deviceHttp, http } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'
import type { DeviceItem, DeviceStats, DeviceForm, DiscoveredDevice, DeviceConfig } from '@/types/device'

/**
 * 将前端 DeviceForm 映射为后端期望的 snake_case 字段。
 * - name         → device_name
 * - ip           → ip_address
 * - rtspPort     → port
 * - deviceType   → device_type (camelToSnake 拦截器自动处理)
 * - 缺 device_id 时根据 ip+port 自动生成
 */
function mapDeviceFormToBackend(data: DeviceForm | Partial<DeviceForm>, idForUpdate?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (idForUpdate) out.device_id = idForUpdate
  else if ((data as DeviceForm).ip && !(data as any).device_id) {
    // 创建设备时若前端没填 device_id,使用 ip:port 形式
    const port = (data as DeviceForm).rtspPort ?? 554
    out.device_id = `${(data as DeviceForm).ip}:${port}`
  }

  if (data.name !== undefined) out.device_name = data.name
  if (data.deviceType !== undefined) out.device_type = data.deviceType
  if (data.ip !== undefined) out.ip_address = data.ip
  if (data.rtspPort !== undefined) out.port = data.rtspPort
  if ((data as any).channelCount !== undefined) out.channel_count = (data as any).channelCount
  if ((data as any).vendor !== undefined) out.vendor = (data as any).vendor
  if ((data as any).model !== undefined) out.model = (data as any).model
  if ((data as any).username !== undefined) out.username = (data as any).username
  if ((data as any).password !== undefined) out.password = (data as any).password
  if ((data as any).description !== undefined) out.description = (data as any).description
  if (data.algoPlugin !== undefined) out.algo_plugin = data.algoPlugin

  return out
}

export const deviceApi = {
  /** 获取设备列表 */
  getList(params?: Record<string, any>) {
    return deviceHttp.get<ApiResponse<PageResponse<DeviceItem>>>('', {
      params,
      expectPageShape: true,
    })
  },

  /** 获取设备详情 */
  getDetail(id: string) {
    return deviceHttp.get<ApiResponse<DeviceItem>>(`/${id}`)
  },

  /** 创建设备 */
  create(data: DeviceForm) {
    return deviceHttp.post<ApiResponse<DeviceItem>>('', mapDeviceFormToBackend(data))
  },

  /** 更新设备 */
  update(id: string, data: Partial<DeviceForm>) {
    return deviceHttp.put<ApiResponse<DeviceItem>>(`/${id}`, mapDeviceFormToBackend(data, id))
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

  /** 设置设备 RTP 传输模式 (GB28181 专用) */
  setRtpTransport(id: string, mode: 'UDP' | 'TCP-PASSIVE' | 'TCP-ACTIVE') {
    return http.post<ApiResponse<{ device_id: string; stream_mode: string }>>(
      `/devices/${id}/rtp-transport`, { mode }
    )
  },
}
