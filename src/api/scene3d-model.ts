/**
 * 华盾AI智能视频盒子 v7.0 - 3D 场景模型资源 API
 * api/scene3d-model.ts — 3D 模型资源的 CRUD、下载、缓存策略
 *
 * @version 1.0.0
 * @description 工厂场景 3D 模型资源的增删改查、LOD 管理、缓存控制
 * @see docs/api/3d_model_resource_api.md — 完整接口规范
 *
 * 与 api/model.ts 的区别:
 *   - model.ts → AI 推理模型 (BM1684X BModel)，TPU 加载
 *   - 本文件 → 3D 场景模型资源 (glTF/GLB)，GPU/WebGL 渲染
 */

import { scene3dModelHttp } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'
import { TIMEOUT_PRESETS } from './http'
import type {
  Scene3DModelMeta,
  GetScene3DModelsParams,
  UploadScene3DModelParams,
  UpdateScene3DModelParams,
  Scene3DModelDownload,
  Model3DCachePolicy,
} from '@/types/scene3d-model'

// ─────────────────────────────────────────────────────────
// 模型资源 CRUD
// ─────────────────────────────────────────────────────────

/**
 * GET /api/scene3d/models
 * 获取 3D 模型资源列表（分页）
 */
export function getScene3DModels(params?: GetScene3DModelsParams) {
  return scene3dModelHttp.get<ApiResponse<PageResponse<Scene3DModelMeta>>>('', { params })
}

/**
 * GET /api/scene3d/models/:id
 * 获取单个 3D 模型资源详情
 */
export function getScene3DModelById(id: string) {
  return scene3dModelHttp.get<ApiResponse<Scene3DModelMeta>>(`/${id}`)
}

/**
 * POST /api/scene3d/models
 * 上传 3D 模型资源文件
 */
export function uploadScene3DModel(params: UploadScene3DModelParams) {
  const formData = new FormData()
  formData.append('file', params.file)
  formData.append('name', params.name)
  if (params.displayName) formData.append('displayName', params.displayName)
  if (params.description) formData.append('description', params.description)
  formData.append('category', params.category)
  if (params.sceneId) formData.append('sceneId', params.sceneId)
  if (params.parentModelId) formData.append('parentModelId', params.parentModelId)
  if (params.autoThumbnail !== undefined) {
    formData.append('autoThumbnail', String(params.autoThumbnail))
  }

  return scene3dModelHttp.post<ApiResponse<Scene3DModelMeta>>('', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeoutMs: TIMEOUT_PRESETS.upload,
    skipRetry: true,
  })
}

/**
 * PUT /api/scene3d/models/:id
 * 更新 3D 模型元数据（不含文件替换）
 */
export function updateScene3DModel(id: string, params: UpdateScene3DModelParams) {
  return scene3dModelHttp.put<ApiResponse<Scene3DModelMeta>>(`/${id}`, params)
}

/**
 * DELETE /api/scene3d/models/:id
 * 删除 3D 模型资源
 */
export function deleteScene3DModel(id: string) {
  return scene3dModelHttp.delete<ApiResponse<void>>(`/${id}`)
}

// ─────────────────────────────────────────────────────────
// 模型下载 & 缓存
// ─────────────────────────────────────────────────────────

/**
 * GET /api/scene3d/models/:id/download
 * 获取模型文件下载地址（含 CDN 预签名、缓存策略）
 */
export function getScene3DModelDownload(id: string) {
  return scene3dModelHttp.get<ApiResponse<Scene3DModelDownload>>(`/${id}/download`)
}

/**
 * GET /api/scene3d/models/:id/cache-policy
 * 获取模型资源的缓存策略配置
 */
export function getScene3DModelCachePolicy(id: string) {
  return scene3dModelHttp.get<ApiResponse<Model3DCachePolicy>>(`/${id}/cache-policy`)
}

/**
 * POST /api/scene3d/models/:id/invalidate-cache
 * 手动失效模型资源的 CDN/浏览器缓存
 */
export function invalidateScene3DModelCache(id: string) {
  return scene3dModelHttp.post<ApiResponse<void>>(`/${id}/invalidate-cache`)
}

// ─────────────────────────────────────────────────────────
// LOD 管理
// ─────────────────────────────────────────────────────────

/**
 * GET /api/scene3d/models/:id/lod
 * 获取模型的 LOD 子模型列表
 */
export function getScene3DModelLodChain(id: string) {
  return scene3dModelHttp.get<ApiResponse<Scene3DModelMeta[]>>(`/${id}/lod`)
}

/**
 * GET /api/scene3d/models/:id/best-lod
 * 根据客户端性能参数获取最佳 LOD 模型
 */
export function getBestLodModel(id: string, params: {
  /** 目标 FPS */
  targetFps?: number
  /** 可用 GPU 显存 (MB) */
  gpuMemory?: number
  /** 网络带宽 (kbps) */
  bandwidth?: number
  /** 屏幕像素比 */
  devicePixelRatio?: number
}) {
  return scene3dModelHttp.get<ApiResponse<Scene3DModelMeta>>(`/${id}/best-lod`, { params })
}

// ─────────────────────────────────────────────────────────
// 批量操作
// ─────────────────────────────────────────────────────────

/**
 * POST /api/scene3d/models/batch-delete
 * 批量删除模型资源
 */
export function batchDeleteScene3DModels(ids: string[]) {
  return scene3dModelHttp.post<ApiResponse<{ deleted: number; failed: string[] }>>('/batch-delete', { ids })
}

/**
 * POST /api/scene3d/models/batch-cache-policy
 * 批量更新模型缓存策略
 */
export function batchUpdateCachePolicy(params: {
  ids: string[]
  cachePolicy: Model3DCachePolicy
}) {
  return scene3dModelHttp.post<ApiResponse<{ updated: number }>>('/batch-cache-policy', params)
}
