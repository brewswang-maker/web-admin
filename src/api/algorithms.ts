/**
 * Algorithms API — 算法插件管理
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface AlgorithmInfo {
  id: string
  name: string
  type: string
  version: string
  description: string
  category: string
  accuracy: number
  fps: number
  enabled: boolean
  config?: Record<string, unknown>
}

const algorithmsApi = {
  /** 算法列表 */
  list(params?: { category?: string; enabled?: boolean }) {
    return http.get<ApiResponse<AlgorithmInfo[]>>('/algorithms', { params })
  },

  /** 算法配置 */
  getConfig(id: string) {
    return http.get<ApiResponse<Record<string, unknown>>>(`/algorithms/${id}/config`)
  },

  /** 更新算法配置 */
  updateConfig(id: string, config: Record<string, unknown>) {
    return http.put<ApiResponse<void>>(`/algorithms/${id}/config`, config)
  }
}

export default algorithmsApi
