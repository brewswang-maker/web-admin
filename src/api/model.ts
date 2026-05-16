/**
 * 模型管理 API (BM1684X BModel)
 */
import { http } from './http'

export interface ModelInfo {
  id: string
  name: string
  version: string
  type: 'detection' | 'classification' | 'segmentation' | 'recognition' | 'tracking'
  framework: 'TPU-MLIR' | 'ONNX' | 'TensorFlow'
  precision: 'INT8' | 'FP16' | 'FP32' | 'MIXED'
  inputShape: string
  tpuUsage: number
  status: 'active' | 'inactive' | 'loading' | 'error'
  size: number
  description?: string
  uploadedAt?: string
  activatedAt?: string
}

/** 获取模型列表 */
export function getModels(params?: { type?: string; status?: string }) {
  return http.get('/api/v1/models', { params })
}

/** 上传模型 */
export function uploadModel(formData: FormData) {
  return http.post('/api/v1/models/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 激活模型 */
export function activateModel(id: string) {
  return http.post(`/api/v1/models/${id}/activate`)
}

/** 停用模型 */
export function deactivateModel(id: string) {
  return http.post(`/api/v1/models/${id}/deactivate`)
}

/** 删除模型 */
export function deleteModel(id: string) {
  return http.delete(`/api/v1/models/${id}`)
}

/** 获取TPU使用率 */
export function getTpuUsage() {
  return http.get('/api/v1/models/tpu-usage')
}
