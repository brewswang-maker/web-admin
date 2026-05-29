/**
 * 华盾AI智能视频盒子 v7.0 - 模型管理 API (BM1684X BModel)
 * api/model.ts — AI 模型 CRUD、TPU 用率
 *
 * 🆕 优化：使用专用 modelHttp 客户端，移除硬编码 URL
 */

import { modelHttp } from './http'
import type { ApiResponse } from '@/types/common'
import { TIMEOUT_PRESETS } from './http'

export interface ModelInfo {
  id: string
  model_id?: string
  name: string          // 显示用（中文优先）
  name_zh?: string     // 中文名称
  name_en?: string     // 英文名称
  version: string
  type: 'detection' | 'classification' | 'segmentation' | 'recognition' | 'tracking' | 'YOLO' | 'ReID' | 'Classify' | 'TinyLLM' | 'MultiModal'
  framework: 'TPU-MLIR' | 'ONNX' | 'TensorFlow'
  precision: 'INT8' | 'FP16' | 'FP32' | 'MIXED'
  inputShape?: string
  input_shape?: number[]
  tpuUsage: number
  tpu_usage?: number
  status: 'active' | 'inactive' | 'loading' | 'error' | 'loaded' | 'unloaded'
  size: number
  memory_mb?: number
  description?: string
  priority?: string
  uploadedAt?: string
  created_at?: string
  activatedAt?: string
}

/** 获取模型列表 */
export function getModels(params?: { type?: string; status?: string }) {
  return modelHttp.get<ApiResponse<ModelInfo[]>>('', { params })
}

/** 上传模型（使用上传超时） */
export function uploadModel(formData: FormData) {
  return modelHttp.post<ApiResponse<ModelInfo>>('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeoutMs: TIMEOUT_PRESETS.upload,
    skipRetry: true,
  })
}

/** 激活模型 */
export function activateModel(id: string) {
  return modelHttp.post<ApiResponse<void>>(`/${id}/activate`)
}

/** 停用模型 */
export function deactivateModel(id: string) {
  return modelHttp.post<ApiResponse<void>>(`/${id}/deactivate`)
}

/** 删除模型 */
export function deleteModel(id: string) {
  return modelHttp.delete<ApiResponse<void>>(`/${id}`)
}

/** 获取TPU使用率 */
export function getTpuUsage() {
  return modelHttp.get<ApiResponse<{ usage: number; total: number }>>('/tpu-usage')
}
