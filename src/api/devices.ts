/**
 * 华盾AI智能视频盒子 v7.0 - 设备 API 兼容层
 * api/devices.ts — 从 device.ts / channel.ts 重新导出，兼容旧引用
 */

export { deviceApi, deviceApi as default } from './device'
export { channelApi } from './channel'

// 从 deviceApi 重新导出便捷函数
import { deviceApi } from './device'
import { http } from './http'
export const discoverDevices = deviceApi.discoverOnvif
export const discoverGB28181 = deviceApi.discoverGB28181

// GB28181 配置
// [FIX 2026-07-30] 字段命名已与 DevicesView.vue 的 snake→camel 映射对齐
//   后端 /api/v1/system/gb28181/config 实际返回 snake_case,
//   在 fetchSipConfig 中映射到本接口的驼峰字段.
export interface GB28181CascadeConfig {
  enabled?: boolean
  superiorSipServerIp?: string
  superiorSipServerPort?: number
  superiorSipId?: string
  superiorSipDomain?: string
  localSipId?: string
}

export interface GB28181Config {
  serverId?: string
  sipServerId?: string
  sipServerDomain?: string
  sipServerIp?: string
  sipServerPort?: number
  sipRealm?: string
  sipTimeoutSec?: number
  domain?: string
  port?: number
  expires?: number
  heartbeatInterval?: number
  enabled?: boolean
  authEnabled?: boolean
  sipServerRunning?: boolean
  sipAdvertiseIp?: string
  sdpIp?: string
  cascade?: boolean | GB28181CascadeConfig
  cascadeRegistered?: boolean
  transportProtocol?: 'UDP' | 'TCP'
  rtpPortRange?: string
  registeredDevices?: number
  activeSessions?: number
  description?: string
}

export const getGB28181Config = () => http.get('/system/gb28181/config')

// 从 channelApi 重新导出便捷函数
import { channelApi } from './channel'
export const getDeviceChannels = channelApi.getDeviceChannels
export const updateChannel = channelApi.update
