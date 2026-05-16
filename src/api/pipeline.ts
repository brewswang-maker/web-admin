/**
 * 华盾AI智能视频盒子 v7.0 - Pipeline 管理 API
 * api/pipeline.ts — Pipeline CRUD、启停控制
 *
 * 🆕 优化：使用专用 pipelineHttp 客户端，移除硬编码 URL
 */

import { pipelineHttp } from './http'
import type { ApiResponse } from '@/types/common'

export interface PipelineNode {
  id: string
  type: string
  label: string
  icon: string
  x: number
  y: number
  inputs: string[]
  outputs: string[]
  props: Record<string, any>
  hasROI?: boolean
  hasSchedule?: boolean
  hasActions?: boolean
}

export interface PipelineConnection {
  fromNode: string
  fromPort: string
  toNode: string
  toPort: string
}

export interface Pipeline {
  id?: string
  name: string
  nodes: PipelineNode[]
  connections: PipelineConnection[]
  created_at?: string
  updated_at?: string
}

/** 获取Pipeline列表 */
export function getPipelines(params?: { project?: string }) {
  return pipelineHttp.get<ApiResponse<Pipeline[]>>('', { params })
}

/** 获取单个Pipeline */
export function getPipeline(id: string) {
  return pipelineHttp.get<ApiResponse<Pipeline>>(`/${id}`)
}

/** 创建/保存Pipeline */
export function savePipeline(data: Pipeline) {
  return pipelineHttp.post<ApiResponse<Pipeline>>('', data)
}

/** 更新Pipeline */
export function updatePipeline(id: string, data: Partial<Pipeline>) {
  return pipelineHttp.put<ApiResponse<Pipeline>>(`/${id}`, data)
}

/** 删除Pipeline */
export function deletePipeline(id: string) {
  return pipelineHttp.delete<ApiResponse<void>>(`/${id}`)
}

/** 启动Pipeline */
export function startPipeline(id: string) {
  return pipelineHttp.post<ApiResponse<void>>(`/${id}/start`)
}

/** 停止Pipeline */
export function stopPipeline(id: string) {
  return pipelineHttp.post<ApiResponse<void>>(`/${id}/stop`)
}
