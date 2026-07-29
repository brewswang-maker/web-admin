/**
 * 华盾AI智能视频盒子 v7.0 - WebRTC 播放 Composable
 * composables/useWebRTC.ts — SDP 交换 + ICE 处理 + 自动降级
 *
 * P0-1.2: 集成 ZLMediaKit WebRTC API (/index/api/webrtc)
 * 实现 WHIP/WHEP 协议，支持超低延迟 (<400ms) 视频播放
 *
 * 用法:
 *   const { start, stop, state, error } = useWebRTC(videoRef)
 *   await start(channelId, webrtcUrl)
 */

import { ref, type Ref } from 'vue'

export type WebRTCState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed'

export interface UseWebRTCOptions {
  /** ICE 连接超时 (ms)，超时后触发 onTimeout 降级 */
  iceTimeout?: number
  /** 降级回调 (通常切换到 FLV) */
  onFallback?: (reason: string) => void
  /** 连接成功回调 */
  onConnected?: () => void
  /** 错误回调 */
  onError?: (err: string) => void
}

export interface UseWebRTCReturn {
  state: Ref<WebRTCState>
  error: Ref<string>
  /** 启动 WebRTC 播放 */
  start: (channelId: string, webrtcApiUrl?: string) => Promise<boolean>
  /** 停止并清理 */
  stop: () => void
  /** 是否正在连接 */
  isConnecting: Ref<boolean>
}

/**
 * WebRTC 播放 Composable
 * @param videoRef - 目标 <video> 元素的 ref
 * @param options - 配置选项
 */
export function useWebRTC(
  videoRef: Ref<HTMLVideoElement | undefined>,
  options: UseWebRTCOptions = {}
): UseWebRTCReturn {
  const {
    iceTimeout = 3000,
    onFallback,
    onConnected,
    onError,
  } = options

  const state = ref<WebRTCState>('idle')
  const error = ref('')
  const isConnecting = ref(false)

  let pc: RTCPeerConnection | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 启动 WebRTC 播放
   * @param channelId - 通道ID (用于构造 API URL)
   * @param webrtcApiUrl - 可选自定义 API 端点
   */
  async function start(channelId: string, webrtcApiUrl?: string): Promise<boolean> {
    stop() // 清理旧连接

    const video = videoRef.value
    if (!video) {
      error.value = 'Video element not ready'
      return false
    }

    state.value = 'connecting'
    isConnecting.value = true
    error.value = ''

    try {
      // 1. 创建 PeerConnection
      pc = new RTCPeerConnection({
        iceServers: [], // 同网段直连，无需 STUN/TURN
        bundlePolicy: 'max-bundle',
      })

      // 2. 添加 transceiver (recvonly)
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      // 3. 监听 track 事件
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          video.srcObject = event.streams[0]
          video.play().catch(() => {})
        }
      }

      // 4. 监听 ICE 连接状态
      pc.oniceconnectionstatechange = () => {
        if (!pc) return
        const iceState = pc.iceConnectionState
        if (iceState === 'connected' || iceState === 'completed') {
          state.value = 'connected'
          isConnecting.value = false
          clearIceTimeout()
          onConnected?.()
        } else if (iceState === 'failed' || iceState === 'disconnected') {
          handleFailure(`ICE ${iceState}`)
        }
      }

      pc.onconnectionstatechange = () => {
        if (!pc) return
        if (pc.connectionState === 'failed') {
          handleFailure('connection failed')
        }
      }

      // 5. 创建 SDP offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // 6. SDP 交换 — POST 到后端代理 ZLM
      const apiUrl = webrtcApiUrl || `/api/v1/streams/${channelId}/webrtc`
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: offer.sdp,
          type: 'offer',
        }),
      })

      if (!resp.ok) {
        throw new Error(`SDP exchange failed: HTTP ${resp.status}`)
      }

      const result = await resp.json()
      const answerSdp = result?.data?.sdp || result?.sdp

      if (!answerSdp) {
        throw new Error('No SDP answer received')
      }

      // 7. 设置 remote description
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })

      // 8. 设置 ICE 超时
      startIceTimeout()

      return true

    } catch (e: any) {
      handleFailure(e.message || 'WebRTC start failed')
      return false
    }
  }

  function startIceTimeout() {
    clearIceTimeout()
    timeoutTimer = setTimeout(() => {
      if (state.value === 'connecting') {
        handleFailure('ICE timeout')
      }
    }, iceTimeout)
  }

  function clearIceTimeout() {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  function handleFailure(reason: string) {
    error.value = reason
    state.value = 'failed'
    isConnecting.value = false
    clearIceTimeout()
    onError?.(reason)
    onFallback?.(reason)
    stop()
  }

  function stop() {
    clearIceTimeout()
    if (pc) {
      pc.ontrack = null
      pc.oniceconnectionstatechange = null
      pc.onconnectionstatechange = null
      pc.close()
      pc = null
    }
    const video = videoRef.value
    if (video) {
      video.srcObject = null
    }
    if (state.value !== 'failed') {
      state.value = 'closed'
    }
    isConnecting.value = false
  }

  return {
    state,
    error,
    start,
    stop,
    isConnecting,
  }
}

export default useWebRTC
