/**
 * composables/useWebRTCPlayer.ts
 * [P0-2] WebRTC Player — WHEP protocol integration with ZLMediaKit
 *
 * Features:
 *   - RTCPeerConnection lifecycle management
 *   - WHEP (WebRTC-HTTP Egress Protocol) for pulling streams from ZLMediaKit
 *   - ICE candidate gathering + reconnect
 *   - Stats monitoring (bitrate, packet loss, jitter)
 *   - Graceful degradation when WebRTC unavailable
 *
 * Usage:
 *   const player = useWebRTCPlayer()
 *   await player.play(videoEl, whepUrl)
 *   player.destroy()
 *
 * @see LiveView.vue (uses this as highest-priority protocol in fallback chain)
 */

import { ref, onUnmounted } from 'vue'

export interface WebRTCStats {
  bitrate_kbps: number
  packets_lost: number
  jitter_ms: number
  rtt_ms: number
  resolution: string
  fps: number
}

export function useWebRTCPlayer() {
  const pc = ref<RTCPeerConnection | null>(null)
  const isPlaying = ref(false)
  const stats = ref<WebRTCStats>({
    bitrate_kbps: 0,
    packets_lost: 0,
    jitter_ms: 0,
    rtt_ms: 0,
    resolution: '',
    fps: 0,
  })
  const reconnectAttempts = ref(0)
  const maxReconnects = 3

  let statsInterval: ReturnType<typeof setInterval> | null = null
  let currentStream: MediaStream | null = null

  /**
   * Create RTCPeerConnection and play via WHEP protocol
   * @param videoEl Target video element
   * @param whepUrl WHEP endpoint URL (e.g., http://host:port/index/api/webrtc?type=play&app=live&stream=xxx)
   * @returns true if successfully connected
   */
  async function play(videoEl: HTMLVideoElement, whepUrl: string): Promise<boolean> {
    try {
      // Clean up any existing connection
      destroy()

      // Create RTCPeerConnection with STUN config
      pc.value = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          // For local network, no STUN needed
        ],
        iceTransportPolicy: 'all',
      })

      // Add transceiver for receiving video + audio
      pc.value.addTransceiver('video', { direction: 'recvonly' })
      pc.value.addTransceiver('audio', { direction: 'recvonly' })

      // Handle incoming track
      pc.value.ontrack = (event) => {
        if (event.streams.length > 0) {
          currentStream = event.streams[0]
          videoEl.srcObject = currentStream
          videoEl.play().then(() => {
            isPlaying.value = true
            console.info('[WebRTCPlayer] Playing via WebRTC')
          }).catch((e) => {
            console.warn('[WebRTCPlayer] Auto-play failed:', e)
          })
        }
      }

      // Handle ICE connection state changes
      pc.value.oniceconnectionstatechange = () => {
        const state = pc.value?.iceConnectionState
        console.debug(`[WebRTCPlayer] ICE state: ${state}`)

        if (state === 'failed' || state === 'disconnected') {
          console.warn('[WebRTCPlayer] ICE disconnected, attempting reconnect...')
          if (reconnectAttempts.value < maxReconnects) {
            reconnectAttempts.value++
            setTimeout(() => reconnect(whepUrl, videoEl), 1000 * reconnectAttempts.value)
          } else {
            console.error('[WebRTCPlayer] Max reconnects exhausted')
            isPlaying.value = false
          }
        } else if (state === 'connected') {
          reconnectAttempts.value = 0
          console.info('[WebRTCPlayer] ICE connected')
        }
      }

      // Create SDP offer
      const offer = await pc.value.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      await pc.value.setLocalDescription(offer)

      // Wait for ICE gathering to complete
      await waitForIceGathering(pc.value)

      // Send offer to WHEP endpoint (ZLMediaKit)
      const response = await fetch(whepUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
        },
        body: pc.value.localDescription!.sdp,
      })

      if (!response.ok) {
        throw new Error(`WHEP request failed: ${response.status} ${response.statusText}`)
      }

      const answerSdp = await response.text()
      await pc.value.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })

      // Start stats monitoring
      startStatsMonitoring()

      return true
    } catch (e) {
      console.error('[WebRTCPlayer] Play failed:', e)
      destroy()
      return false
    }
  }

  /**
   * Wait for ICE candidate gathering to complete
   */
  function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve()
        return
      }
      const timer = setTimeout(() => {
        console.warn('[WebRTCPlayer] ICE gathering timeout, proceeding with partial candidates')
        resolve()
      }, timeoutMs)
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer)
          resolve()
        }
      }
    })
  }

  /**
   * Attempt to reconnect
   */
  async function reconnect(whepUrl: string, videoEl: HTMLVideoElement): Promise<void> {
    console.info(`[WebRTCPlayer] Reconnecting (attempt ${reconnectAttempts.value}/${maxReconnects})...`)
    await play(videoEl, whepUrl)
  }

  /**
   * Start periodic stats collection
   */
  function startStatsMonitoring(): void {
    if (statsInterval) clearInterval(statsInterval)
    statsInterval = setInterval(async () => {
      if (!pc.value) return
      try {
        const report = await pc.value.getStats()
        let lastBytes = 0
        let lastTimestamp = 0

        report.forEach((entry) => {
          if (entry.type === 'inbound-rtp' && entry.kind === 'video') {
            const now = entry.timestamp || 0
            const bytes = entry.bytesReceived || 0
            if (lastTimestamp > 0 && now > lastTimestamp) {
              const bitrate = ((bytes - lastBytes) * 8) / (now - lastTimestamp)
              stats.value.bitrate_kbps = Math.round(bitrate)
            }
            lastBytes = bytes
            lastTimestamp = now

            stats.value.packets_lost = entry.packetsLost || 0
            stats.value.jitter_ms = Math.round((entry.jitter || 0) * 1000)
            if (entry.frameWidth && entry.frameHeight) {
              stats.value.resolution = `${entry.frameWidth}x${entry.frameHeight}`
            }
            stats.value.fps = entry.framesPerSecond || 0
          }
          if (entry.type === 'candidate-pair' && entry.state === 'succeeded') {
            stats.value.rtt_ms = Math.round((entry.currentRoundTripTime || 0) * 1000)
          }
        })
      } catch (e) {
        // Stats collection is non-critical
      }
    }, 1000)
  }

  /**
   * Destroy the WebRTC connection and clean up
   */
  function destroy(): void {
    if (statsInterval) {
      clearInterval(statsInterval)
      statsInterval = null
    }
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop())
      currentStream = null
    }
    if (pc.value) {
      pc.value.ontrack = null
      pc.value.oniceconnectionstatechange = null
      pc.value.close()
      pc.value = null
    }
    isPlaying.value = false
    stats.value = {
      bitrate_kbps: 0,
      packets_lost: 0,
      jitter_ms: 0,
      rtt_ms: 0,
      resolution: '',
      fps: 0,
    }
  }

  /**
   * Check if WebRTC is supported in this browser
   */
  function isSupported(): boolean {
    return typeof RTCPeerConnection !== 'undefined'
  }

  onUnmounted(() => {
    destroy()
  })

  return {
    pc,
    isPlaying,
    stats,
    reconnectAttempts,
    play,
    destroy,
    isSupported,
  }
}
