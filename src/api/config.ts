/**
 * System Config API — 系统配置管理
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface SystemConfig {
  deviceId: string
  network: { ip: string; gateway: string; dns: string; mask: string; mode: string }
  video: { resolution: string; fps: number; bitrate: number }
  ai: { enabled: boolean; sensitivity: number }
  [key: string]: unknown
}

const configApi = {
  /** 获取配置 */
  get() {
    return http.get<ApiResponse<SystemConfig>>('/config')
  },

  /** 更新配置 */
  update(config: Partial<SystemConfig>) {
    return http.put<ApiResponse<void>>('/config', config)
  },

  /** 导出配置 */
  exportConfig() {
    return http.post<ApiResponse<{ url: string }>>('/config/export')
  },

  /** 导入配置 */
  importConfig(configJson: string) {
    return http.post<ApiResponse<void>>('/config/import', { config: configJson })
  },

  /** 网络配置 */
  getNetwork() {
    return http.get<ApiResponse<SystemConfig['network']>>('/config/network')
  }
}

export default configApi
