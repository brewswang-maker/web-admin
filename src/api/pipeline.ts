/**
 * Pipeline管理 API
 */
import { http } from './http'

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
  return http.get('/api/v1/pipelines', { params })
}

/** 获取单个Pipeline */
export function getPipeline(id: string) {
  return http.get(`/api/v1/pipelines/${id}`)
}

/** 创建/保存Pipeline */
export function savePipeline(data: Pipeline) {
  return http.post('/api/v1/pipelines', data)
}

/** 更新Pipeline */
export function updatePipeline(id: string, data: Partial<Pipeline>) {
  return http.put(`/api/v1/pipelines/${id}`, data)
}

/** 删除Pipeline */
export function deletePipeline(id: string) {
  return http.delete(`/api/v1/pipelines/${id}`)
}

/** 启动Pipeline */
export function startPipeline(id: string) {
  return http.post(`/api/v1/pipelines/${id}/start`)
}

/** 停止Pipeline */
export function stopPipeline(id: string) {
  return http.post(`/api/v1/pipelines/${id}/stop`)
}
