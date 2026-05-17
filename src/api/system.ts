/**
 * System API — 系统管理操作
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface SystemInfo {
  deviceId: string
  hardware: string
  firmwareVersion: string
  serialNumber: string
  uptime: number
  cpuUsage: number
  memTotal: number
  memUsed: number
  diskTotal: number
  diskUsed: number
  temperature: number
  npuUsage: number
  npuType: string
}

export interface GB28181Config {
  enabled: boolean
  sipServerId: string
  sipServerDomain: string
  sipServerIp: string
  sipServerPort: number
  sipUsername: string
  expires: number
  heartbeatInterval: number
}

const systemApi = {
  /** 系统信息 */
  getInfo() {
    return http.get<ApiResponse<SystemInfo>>('/system/info')
  },

  /** GB28181配置 */
  getGB28181Config() {
    return http.get<ApiResponse<GB28181Config>>('/system/gb28181/config')
  },

  /** 系统重启 */
  reboot(delay?: number) {
    return http.post<ApiResponse<void>>('/system/reboot', { delay })
  },

  /** 系统重置 */
  reset() {
    return http.post<ApiResponse<void>>('/system/reset')
  }
}

export default systemApi
