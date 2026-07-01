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

/** 多协议播放地址（ZLM 全协议） */
export interface MultiPlayUrls {
  /** ZLMediaKit 播放地址 */
  flvUrl?: string
  wsFlvUrl?: string
  hlsUrl?: string
  webrtcUrl?: string
}

/** 获取流列表 */
export function getStreams(params?: { status?: string; protocol?: string }) {
  return streamHttp.get<ApiResponse<StreamInfo[]>>('', { params })
}

/** 获取流详情 */
export function getStream(id: string) {
  return streamHttp.get<ApiResponse<StreamInfo>>(`/${id}`)
}

/**
 * 获取流播放地址
 * Phase 14 P0 修复 14.2: BE 已有 /hls-url 返回包含 hls/flv/rtsp/rtmp/wsFlv/webrtc 全协议 URL 的响应,
 * 前端调用 hls-url 即可,根据 protocol 提取对应字段
 */
export function getStreamPlayUrl(id: string, protocol: 'hls' | 'webrtc' | 'rtmp' = 'hls') {
  // hls-url handler 实际返回所有协议 URL,统一从此处取
  return streamHttp.get<ApiResponse<{ hlsUrl: string; flvUrl: string; rtspUrl: string; rtmpUrl: string; wsFlvUrl: string; webrtcUrl: string }>>(`/${id}/hls-url`)
    .then(resp => {
      const data = resp.data?.data
      if (!data) return resp
      const urlMap: Record<string, string> = {
        hls: data.hlsUrl,
        webrtc: data.webrtcUrl,
        rtmp: data.rtmpUrl,
      }
      return {
        ...resp,
        data: {
          ...resp.data,
          data: { url: urlMap[protocol] || data.hlsUrl },
        },
      } as unknown as typeof resp
    })
}

/** 获取多协议播放地址（ZLM 全协议） */
export function getMultiUrls(id: string) {
  return streamHttp.get<ApiResponse<MultiPlayUrls>>(`/${id}/multi-urls`)
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
