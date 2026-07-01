import { inferenceHttp } from './http'
import type { ApiResponse } from '@/types/common'

export interface DetectionBBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface DetectionResult {
  class_name: string
  confidence: number
  class_id: number
  bbox: DetectionBBox
}

export interface DetectResponse {
  detections: DetectionResult[]
  num_detections: number
  inference_time_ms: number
  model_id: string
  channel_id?: string
  device_id?: string
  snapshot_url?: string
}

export interface InferenceModelInfo {
  handle: number
  name: string
  input_shape: string
  output_shape: string
}

export interface InferenceStatus {
  engine_available: boolean
  loaded_models: InferenceModelInfo[]
  total_inferences: number
  avg_latency_ms: number
}

export interface ScheduledChannel {
  channel_id: string
  device_id: string
  stream_id: string
  algo_plugin: string
  enabled: boolean
  interval_ms: number
  total_inferences: number
  total_detections: number
  last_inference_time_ms: number
  last_inference_ms: number
  running: boolean
  num_last_detections: number
}

export interface ChannelDetections {
  channel_id: string
  device_id?: string
  detections: DetectionResult[]
}

/** 提交 base64 图片进行目标检测 */
export function detectFromBase64(imageBase64: string, channelId?: string, deviceId?: string) {
  return inferenceHttp.post<ApiResponse<DetectResponse>>('/detect', {
    image_base64: imageBase64,
    ...(channelId ? { channel_id: channelId } : {}),
    ...(deviceId ? { device_id: deviceId } : {}),
  })
}

/** 获取推理引擎状态 */
export function getInferenceStatus() {
  return inferenceHttp.get<ApiResponse<InferenceStatus>>('/status')
}

/** 服务端从 ZLM 截帧推理 */
export function detectChannel(channelId: string, deviceId: string) {
  return inferenceHttp.post<ApiResponse<DetectResponse>>('/detect-channel', {
    channel_id: channelId,
    device_id: deviceId,
  })
}

/** 启动通道定期推理 */
export function startSchedule(
  channelId: string,
  deviceId: string,
  intervalMs: number = 3000,
  algoPlugin: string = 'yolov8n',
  extra?: { confidence?: number; nmsThreshold?: number; inferenceMode?: string }
) {
  const payload: Record<string, any> = {
    channel_id: channelId,
    device_id: deviceId,
    interval_ms: intervalMs,
    algo_plugin: algoPlugin,
  }
  if (extra?.confidence != null) payload.confidence = extra.confidence
  if (extra?.nmsThreshold != null) payload.nms_threshold = extra.nmsThreshold
  if (extra?.inferenceMode) payload.inference_mode = extra.inferenceMode
  return inferenceHttp.post<ApiResponse<{ channel_id: string; scheduled: boolean; interval_ms: number }>>(
    '/schedule/start', payload
  )
}

/** 停止通道定期推理 */
export function stopSchedule(channelId: string) {
  return inferenceHttp.post<ApiResponse<{ channel_id: string; scheduled: boolean }>>(
    '/schedule/stop',
    { channel_id: channelId }
  )
}

/** 获取推理调度通道列表 */
export function getInferenceChannels() {
  return inferenceHttp.get<ApiResponse<{ channels: ScheduledChannel[]; total: number }>>('/channels')
}

/** 获取最近检测结果 */
export function getLatestDetections(channelId?: string) {
  const params = channelId ? { channel_id: channelId } : {}
  return inferenceHttp.get<ApiResponse<{ channels: ChannelDetections[] }>>('/detections/latest', { params })
}

// ============================================================
// Phase 13 P2 #1 — 流式推理 (continuous frame processing)
// ============================================================

/** 启动流式推理通道 */
export function startStreamingInference(params: {
  channel_id: string
  device_id?: string
  rtsp_url: string
  algo_plugin?: string
  target_fps?: number
}) {
  const payload = {
    channel_id: params.channel_id,
    device_id: params.device_id ?? '',
    rtsp_url: params.rtsp_url,
    algo_plugin: params.algo_plugin ?? 'yolov8n',
    target_fps: params.target_fps ?? 15,
  }
  return inferenceHttp.post<ApiResponse<{
    channel_id: string
    mode: 'streaming'
    rtsp_url: string
    target_fps: number
    algo_plugin: string
  }>>('/streaming/start', payload)
}

/** 停止流式推理通道 */
export function stopStreamingInference(channelId: string) {
  return inferenceHttp.post<ApiResponse<{ channel_id: string; disabled: boolean }>>(
    '/streaming/stop',
    { channel_id: channelId }
  )
}

/** 获取流式推理实时检测结果快照 (REST 轮询模式) */
export function getStreamingLiveDetections(channelId: string) {
  return inferenceHttp.get<ApiResponse<{
    channel_id: string
    worker_active: boolean
    detections: Array<{
      class_name: string
      confidence: number
      class_id: number
      x1: number; y1: number; x2: number; y2: number
    }>
    last_inference_ms?: number
    total_inferences?: number
  }>>('/streaming/live', { params: { channel_id: channelId } })
}

// ============================================================
// 需求驱动推理: 前端查看注册/注销
// 当前端打开 LiveView 时注册查看者, 使该通道即使没有联动规则也会执行推理 (画检测框).
// 关闭 LiveView 时注销, 让无规则通道恢复跳过推理, 节省 CPU/TPU 资源.
// ============================================================

/** 注册前端查看者 (LiveView 打开时调用) */
export function registerInferenceViewer(channelId: string) {
  return inferenceHttp.post<ApiResponse<{
    channel_id: string
    viewers: number
    inference_active: boolean
  }>>('/viewer/register', { channel_id: channelId })
}

/** 注销前端查看者 (LiveView 关闭时调用) */
export function unregisterInferenceViewer(channelId: string) {
  return inferenceHttp.post<ApiResponse<{
    channel_id: string
    viewers: number
    inference_active: boolean
  }>>('/viewer/unregister', { channel_id: channelId })
}

// ============================================================
// 通道推理需求状态
// ============================================================

export interface ChannelDemandStatus {
  channel_id: string
  device_id: string
  inference_running: boolean
  has_rule_subscription: boolean
  viewer_count: number
  demand_reason: 'rule' | 'viewer' | 'none'
}

export interface DemandStatusResponse {
  channels: ChannelDemandStatus[]
  total: number
  active_count: number
  idle_count: number
  resource_saving: 'on' | 'off'
}

/** 获取所有通道的推理需求状态 */
export function getInferenceDemandStatus() {
  return inferenceHttp.get<ApiResponse<DemandStatusResponse>>('/demand-status')
}
