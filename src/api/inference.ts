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
  algoPlugin: string = 'yolov8n'
) {
  return inferenceHttp.post<ApiResponse<{ channel_id: string; scheduled: boolean; interval_ms: number }>>(
    '/schedule/start',
    {
      channel_id: channelId,
      device_id: deviceId,
      interval_ms: intervalMs,
      algo_plugin: algoPlugin,
    }
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
