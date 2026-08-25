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
 * - deviceType   → device_type
 * - 缺 device_id 时根据 ip+port 自动生成
 *
 * [Fix 2026-08-25] 兼容两种入参风格(http.ts 全局 camelToSnake 已移除):
 * - camelCase(DeviceForm: name/deviceType/ip/rtspPort...)
 * - snake_case 直传(后端字段: device_name/device_type/ip_address/port/config...)
 *   DevicesView.confirmEdit 等调用点直接传后端字段名,若不识别会被整体丢弃,
 *   导致 PUT body 只剩 device_id、后端空值保护跳过更新却仍返回成功(假成功)。
 */
function mapDeviceFormToBackend(data: DeviceForm | Partial<DeviceForm> | Record<string, any>, idForUpdate?: string): Record<string, unknown> {
  const d = data as any
  const out: Record<string, unknown> = {}

  if (idForUpdate) out.device_id = idForUpdate
  else if (d.device_id) out.device_id = d.device_id
  else if (d.ip || d.ip_address) {
    // 创建设备时若前端没填 device_id,使用 ip:port 形式
    const port = d.rtspPort ?? d.port ?? 554
    out.device_id = `${d.ip ?? d.ip_address}:${port}`
  }

  if (d.name !== undefined) out.device_name = d.name
  else if (d.device_name !== undefined) out.device_name = d.device_name
  if (d.deviceType !== undefined) out.device_type = d.deviceType
  else if (d.device_type !== undefined) out.device_type = d.device_type
  if (d.ip !== undefined) out.ip_address = d.ip
  else if (d.ip_address !== undefined) out.ip_address = d.ip_address
  if (d.rtspPort !== undefined) out.port = d.rtspPort
  else if (d.port !== undefined) out.port = d.port
  if (d.channelCount !== undefined) out.channel_count = d.channelCount
  else if (d.channel_count !== undefined) out.channel_count = d.channel_count
  if (d.algoPlugin !== undefined) out.algo_plugin = d.algoPlugin
  else if (d.algo_plugin !== undefined) out.algo_plugin = d.algo_plugin
  // 单词字段 camel/snake 同名,直接透传
  for (const k of ['vendor', 'model', 'username', 'password', 'description']) {
    if (d[k] !== undefined) out[k] = d[k]
  }

  // config 对象透传:后端 PUT /devices/:id 支持携带 config 同步更新设备配置
  if (d.config !== undefined && typeof d.config === 'object') out.config = d.config

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
