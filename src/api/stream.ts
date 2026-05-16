/**
 * 华盾AI智能视频盒子 v7.0 - 流管理 API
 * api/stream.ts — 流媒体管理、代理、ZLMediaKit 状态
 *
 * 🆕 优化：使用专用 streamHttp 客户端，移除硬编码 URL
 */

import { streamHttp } from './http'
import type { ApiResponse } from '@/types/common'

export interface StreamInfo {
  streamId: string
  app: string
  stream: string
  protocol: 'rtsp' | 'rtmp' | 'hls' | 'webrtc'
  status: 'active' | 'idle' | 'error'
  srcUrl?: string
  createdAt?: string
  bytesPerSecond?: number
  clientCount?: number
}

export interface ZLMStatus {
  online: boolean
  streamCount: number
  cpuUsage: number
  memUsage: number
  bandwidth: number
}

/** 获取流列表 */
export function getStreams(params?: { status?: string; protocol?: string }) {
  return streamHttp.get<ApiResponse<StreamInfo[]>>('', { params })
}

/** 获取流详情 */
export function getStream(id: string) {
  return streamHttp.get<ApiResponse<StreamInfo>>(`/${id}`)
}

/** 获取流播放地址 */
export function getStreamPlayUrl(id: string, protocol: 'hls' | 'webrtc' | 'rtmp' = 'hls') {
  return streamHttp.get<ApiResponse<{ url: string }>>(`/${id}/${protocol}-url`)
}

/** WebRTC SDP交换 */
export function exchangeSDP(id: string, offer: string) {
  return streamHttp.post<ApiResponse<{ answer: string }>>(`/${id}/webrtc-sdp`, { offer })
}

/** 停止流 */
export function stopStream(id: string) {
  return streamHttp.post<ApiResponse<void>>(`/${id}/stop`)
}

/** 添加代理流 */
export function addProxy(data: { url: string; app: string; stream: string }) {
  return streamHttp.post<ApiResponse<StreamInfo>>('/proxy', data)
}

/** 获取ZLMediaKit状态 */
export function getZLMStatus() {
  return streamHttp.get<ApiResponse<ZLMStatus>>('/zlm-status')
}
