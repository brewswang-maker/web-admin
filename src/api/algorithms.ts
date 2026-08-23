/**
 * Algorithms API — 算法插件管理
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface AlgorithmInfo {
  id: string
  name: string
  name_zh?: string
  name_en?: string
  algo_id?: string
  type: string
  version: string
  description: string
  category: string
  accuracy: number
  fps: number
  enabled: boolean
  alarm_type?: string
  config?: Record<string, unknown>
}

const algorithmsApi = {
  /** 算法列表 (分页, 默认 pageSize=50, 仅适合分页展示场景) */
  list(params?: { category?: string; enabled?: boolean }) {
    return http.get<ApiResponse<AlgorithmInfo[]>>('/algorithms', { params })
  },

  /**
   * 全量算法列表 (不分页)
   * [FIX 2026-08-15] /algorithms 默认只返回前 50 条, 需要完整算法清单的
   * 场景 (事件测试抽屉算法选择等) 必须用此接口, 否则睡岗/危险物品/OCR
   * 等后 15 个算法不可见。
   */
  listAll(params?: { category?: string; enabled?: boolean }) {
    return http.get<ApiResponse<AlgorithmInfo[]>>('/algorithms/all', { params })
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
