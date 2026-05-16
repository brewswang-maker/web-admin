/**
 * 流管理 API
 */
import { http } from './http'

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
  return http.get('/api/v1/streams', { params })
}

/** 获取流详情 */
export function getStream(id: string) {
  return http.get(`/api/v1/streams/${id}`)
}

/** 获取流播放地址 */
export function getStreamPlayUrl(id: string, protocol: 'hls' | 'webrtc' | 'rtmp' = 'hls') {
  return http.get(`/api/v1/streams/${id}/${protocol}-url`)
}

/** WebRTC SDP交换 */
export function exchangeSDP(id: string, offer: string) {
  return http.post(`/api/v1/streams/${id}/webrtc-sdp`, { offer })
}

/** 停止流 */
export function stopStream(id: string) {
  return http.post(`/api/v1/streams/${id}/stop`)
}

/** 添加代理流 */
export function addProxy(data: { url: string; app: string; stream: string }) {
  return http.post('/api/v1/streams/proxy', data)
}

/** 获取ZLMediaKit状态 */
export function getZLMStatus() {
  return http.get('/api/v1/streams/zlm-status')
}
