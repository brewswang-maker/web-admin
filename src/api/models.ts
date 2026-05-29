/**
 * Models API — 算法模型管理
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface ModelInfo {
  id: string
  name: string
  name_zh: string
  name_en: string
  type: string
  model_id: string
  precision: string
  version: string
  status: string
  device: string
  tpu_usage: number
  inference_latency_ms: number
  description: string
}

export interface ModelsResponse {
  code: number
  data: {
    models: ModelInfo[]
  }
  message: string
}

const modelsApi = {
  /** 获取算法模型列表（用于下拉选择） */
  getList() {
    return http.get<ModelsResponse>('/models')
  }
}

export default modelsApi