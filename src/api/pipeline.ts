/**
 * 华盾AI智能视频盒子 v7.0 - Pipeline 管理 API
 * api/pipeline.ts — Pipeline CRUD、启停控制
 *
 * 🆕 优化：使用专用 pipelineHttp 客户端，移除硬编码 URL
 */

import { pipelineHttp } from './http'
import type { ApiResponse } from '@/types/common'

// [BUG 4 修复] Props 格式统一：使用数组格式（与 PipelineEditorView 一致）
//   原因：前端 UI 需要每个 prop 的 label/type/min/max/options 等元数据渲染表单控件，
//         对象格式 Record<string, any> 无法携带这些元数据。
//         后端 buildNodeConfigStatic() 已兼容数组格式。
export interface PropItem {
  key: string
  label: string
  type: 'text' | 'number' | 'slider' | 'select' | 'switch'
  value: any
  min?: number
  max?: number
  step?: number
  options?: string[]
  multiline?: boolean
}

export interface PipelineNode {
  id: string
  type: string
  label: string
  icon: string
  x: number
  y: number
  inputs: string[]
  outputs: string[]
  props: PropItem[]
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

// ============================================================================
// v7.0: 流与推理解耦 Pipeline API
// ============================================================================

export interface PipelineValidateResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  node_count: number
  edge_count: number
}

export interface NodeRuntimeStatus {
  node_id: string
  type: string
  state: string
  fps: number
  avg_latency_ms: number
  frame_count: number
}

export interface PipelineRuntimeStatus {
  pipeline_id: string
  deploy_state: string
  total_fps: number
  avg_latency_ms: number
  active_channels: number
  tpu_utilization: number
  buffer_pool_utilization: number
  total_frames: number
  nodes: NodeRuntimeStatus[]
}

export interface IRMStats {
  active_channels: number
  queued_tasks: number
  worker_threads: number
  tpu_utilization: number
  avg_inference_ms: number
  avg_batch_size: number
  total_submitted: number
  total_completed: number
  total_skipped: number
  throughput_fps: number
}

export interface SLMStats {
  total_streams: number
  active_streams: number
  degraded_streams: number
  disconnected_streams: number
  total_frames_dispatched: number
  total_reconnect_attempts: number
  streams: { channel_id: number; state: string; fps?: number; avg_latency_ms?: number; frame_count?: number }[]
}

export interface PluginTypeInfo {
  type: string
  display_name?: string
  category?: string
  description?: string
}

/** 保存Pipeline定义（不部署） */
export function savePipelineDefinition(id: string, definition: any) {
  return pipelineHttp.post<ApiResponse<{ pipeline_id: string; state: string }>>(
    `/${id}/save`, { pipeline_id: id, definition }
  )
}

/** 验证Pipeline配置 */
export function validatePipeline(id: string, definition?: any) {
  const payload: any = { pipeline_id: id }
  if (definition) payload.definition = definition
  return pipelineHttp.post<ApiResponse<PipelineValidateResult>>(
    `/${id}/validate`, payload
  )
}

/** 部署Pipeline */
export function deployPipeline(id: string, definition?: any) {
  const payload: any = { pipeline_id: id }
  if (definition) payload.definition = definition
  return pipelineHttp.post<ApiResponse<{ pipeline_id: string; state: string }>>(
    `/${id}/deploy`, payload
  )
}

/** 卸载Pipeline */
export function undeployPipeline(id: string) {
  return pipelineHttp.post<ApiResponse<{ pipeline_id: string; state: string }>>(
    `/${id}/undeploy`, { pipeline_id: id }
  )
}

/** 获取Pipeline运行时状态 */
export function getPipelineRuntime(id: string) {
  return pipelineHttp.get<ApiResponse<PipelineRuntimeStatus>>(`/${id}/runtime`, {
    params: { pipeline_id: id }
  })
}

/** 获取Pipeline定义 */
export function getPipelineDefinition(id: string) {
  return pipelineHttp.get<ApiResponse<{ definition: any }>>(`/${id}/definition`, {
    params: { pipeline_id: id }
  })
}

/** 热替换算法节点 */
export function swapPipelineNode(pipelineId: string, nodeId: string, config: any) {
  return pipelineHttp.put<ApiResponse<void>>(`/${pipelineId}/nodes/${nodeId}`, {
    pipeline_id: pipelineId, node_id: nodeId, config
  })
}

/** 热更新节点参数 */
export function updateNodeParams(pipelineId: string, nodeId: string, params: any) {
  return pipelineHttp.put<ApiResponse<void>>(`/${pipelineId}/nodes/${nodeId}/params`, {
    pipeline_id: pipelineId, node_id: nodeId, params
  })
}

// [P2-3] Pipeline 指标历史趋势
export interface PipelineMetricsHistory {
  pipeline_id: string
  range: string
  count: number
  timestamps: number[]
  fps: number[]
  latency_ms: number[]
  tpu_utilization: number[]
  active_channels: number[]
}

/** 获取Pipeline指标历史趋势 */
export function getPipelineMetricsHistory(id: string, range: string = '1h') {
  return pipelineHttp.get<ApiResponse<PipelineMetricsHistory>>(
    `/${id}/metrics-history`, { params: { pipeline_id: id, range } }
  )
}

/** 获取IRM统计 */
export function getIRMStats() {
  return pipelineHttp.get<ApiResponse<IRMStats>>('/irm/stats')
}

/** 获取SLM统计 */
export function getSLMStats() {
  return pipelineHttp.get<ApiResponse<SLMStats>>('/slm/stats')
}

/** 获取已注册插件类型 */
export function getPluginTypes() {
  return pipelineHttp.get<ApiResponse<{ plugins: PluginTypeInfo[]; total: number }>>('/plugin-factory/types')
}
