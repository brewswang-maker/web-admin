/**
 * 华盾AI智能视频盒子 v7.0 - 流健康监测 Composable
 * composables/useStreamHealth.ts — 多路视频流健康状态监测与卡顿恢复
 */

import { reactive, onUnmounted } from 'vue'
import flvjs from 'flv.js'
import Hls from 'hls.js'

export interface StreamHealthState {
  status: 'good' | 'warning' | 'error'
  bytesPerSec: number
  packetsLost: number
  lossRate: number
  rttMs: number        // P2-4: WebRTC RTT（毫秒），FLV 模式下为 0
  latencyMs: number   // 视频延迟（毫秒），通过 currentTime 与实际时间差计算
  stallCount: number
  lastDataTime: number
  firstFrameTime: number  // 首帧到达时间戳（用于计算首帧延迟）
  playbackStartTime: number  // 播放开始时间戳
  fps: number  // 实时帧率
}

type HealthStates = Record<number, StreamHealthState>

  // 每个 slot 的监测上下文
interface MonitorContext {
  player: RTCPeerConnection | flvjs.Player | Hls | null
  type: 'webrtc' | 'flv' | 'hls' | null
  intervalId: ReturnType<typeof setInterval> | null
  // WebRTC 统计快照
  prevBytesReceived: number
  prevPacketsLost: number
  prevPacketsReceived: number
  // FLV 统计
  lastSpeed: number
  // 无数据连续秒数
  noDataSeconds: number
  // 启动时间戳（用于计算宽限期）
  createdAt: number
  // 视频元素引用（用于检测卡顿）
  videoElement: HTMLVideoElement | null
  // 上一次检测的视频时间（用于比较时间轴是否卡住）
  lastVideoTime: number
  // 连续 error 评估次数（用于防误判：需连续 2 次才真正触发 error）
  consecutiveErrorEvaluations: number
  // FLV 事件回调引用（保存以便正确移除）
  flvOnStats?: (info: any) => void
  flvOnLoadingComplete?: () => void
  // FPS 统计：帧计数 + 上次计数时间
  frameCount: number
  lastFpsTime: number
}

// 卡顿回调类型
type StallCallback = (slotIdx: number, stallCount: number) => void
// 重连耗尽回调类型：上层收到后可决定停止监测
type ReconnectExhaustedCallback = (slotIdx: number) => void

export function useStreamHealth(onStall?: StallCallback, onReconnectExhausted?: ReconnectExhaustedCallback) {
  const healthStates = reactive<HealthStates>({})
  const contexts = new Map<number, MonitorContext>()
  // 连续 error 确认后是否已通知过上层（防止重复触发）
  const reconnectExhaustedNotified = new Set<number>()

  function getDefaultState(): StreamHealthState {
    return {
      status: 'good',
      bytesPerSec: 0,
      packetsLost: 0,
      lossRate: 0,
      rttMs: 0,
      latencyMs: 0,
      stallCount: 0,
      lastDataTime: Date.now(),
      firstFrameTime: 0,
      playbackStartTime: 0,
      fps: 0,
    }
  }

  /** 开始监测某个 slot（支持 WebRTC/FLV/HLS） */
  function startMonitoring(slotIdx: number, player: RTCPeerConnection | flvjs.Player | Hls, videoEl?: HTMLVideoElement) {
    // 先停止旧监测
    stopMonitoring(slotIdx)

    const isWebRTC = player instanceof RTCPeerConnection
    // flv.js 使用 createPlayer 创建，不存在 flvjs.Player 类，用 duck typing 检测
    const isHls = !isWebRTC && !('on' in player && typeof (player as any).on === 'function') && player instanceof Hls
    const isFlv = 'on' in player && typeof (player as any).on === 'function' && 'off' in player

    healthStates[slotIdx] = getDefaultState()

    const ctx: MonitorContext = {
      player,
      type: isWebRTC ? 'webrtc' : isFlv ? 'flv' : 'hls',
      intervalId: null,
      prevBytesReceived: 0,
      prevPacketsLost: 0,
      prevPacketsReceived: 0,
      lastSpeed: 0,
      noDataSeconds: 0,
      createdAt: Date.now(),
      videoElement: videoEl || null,
      lastVideoTime: 0,
      consecutiveErrorEvaluations: 0,
      frameCount: 0,
      lastFpsTime: Date.now(),
    }

    if (isWebRTC) {
      ctx.intervalId = setInterval(() => pollWebRtcStats(slotIdx, ctx), 1000)
    } else if (isFlv) {
      // FLV: 监听 statistics_info 事件（保存回调引用以便正确移除）
      const flvPlayer = player as flvjs.Player
      const onStatsInfo = (info: any) => {
        if (info && typeof info.speed === 'number') {
          ctx.lastSpeed = info.speed // KB/s
          healthStates[slotIdx].bytesPerSec = info.speed * 1024 // 转换为 bytes/s
          healthStates[slotIdx].lastDataTime = Date.now()
          if (info.speed > 0) {
            ctx.noDataSeconds = 0
          }
        }
        // P2诊断: 记录实际延迟信息
        if (info && typeof info.latency === 'number') {
          // info.latency 是 flv.js 内部计算的延迟（秒）
          healthStates[slotIdx].latencyMs = info.latency * 1000
          if (slotIdx === 0 && info.latency > 0) {
            // 只在 slot0 时输出诊断信息，避免刷屏
            console.debug(`[StreamHealth] slot${slotIdx} flv延迟=${info.latency.toFixed(2)}s speed=${info.speed?.toFixed(1)}KB/s`)
          }
        }
      }
      flvPlayer.on(flvjs.Events.STATISTICS_INFO, onStatsInfo)
      ctx.flvOnStats = onStatsInfo

      // 监听首帧事件，记录首帧时间
      const onLoadingComplete = () => {
        const now = Date.now()
        if (healthStates[slotIdx].firstFrameTime === 0) {
          healthStates[slotIdx].firstFrameTime = now
          healthStates[slotIdx].playbackStartTime = now
          console.debug(`[StreamHealth] slot${slotIdx} 首帧到达，延迟=${now - ctx.createdAt}ms`)
        }
      }
      flvPlayer.on(flvjs.Events.LOADING_COMPLETE, onLoadingComplete)
      ctx.flvOnLoadingComplete = onLoadingComplete

      ctx.intervalId = setInterval(() => pollFlvStats(slotIdx, ctx), 1000)
    } else if (isHls) {
      // HLS: 依赖 video 元素事件检测播放状态
      const hlsPlayer = player as Hls
      const video = videoEl

      if (video) {
        // HLS 播放事件：用于检测数据流
        const onPlaying = () => {
          const now = Date.now()
          if (healthStates[slotIdx].firstFrameTime === 0) {
            healthStates[slotIdx].firstFrameTime = now
            healthStates[slotIdx].playbackStartTime = now
            console.debug(`[StreamHealth] slot${slotIdx} HLS首帧到达，延迟=${now - ctx.createdAt}ms`)
          }
          ctx.noDataSeconds = 0
          healthStates[slotIdx].lastDataTime = now
        }

        const onWaiting = () => {
          // HLS 等待/缓冲中（正常行为，不计入卡顿）
          console.debug(`[StreamHealth] slot${slotIdx} HLS 缓冲中`)
        }

        const onError = (e: Event) => {
          console.warn(`[StreamHealth] slot${slotIdx} HLS 错误:`, e)
          // HLS 错误由播放器处理，这里不触发 stall
        }

        video.addEventListener('playing', onPlaying)
        video.addEventListener('waiting', onWaiting)
        video.addEventListener('error', onError)

        // 保存事件处理器引用以便清理
        ;(ctx as any).hlsEvents = { onPlaying, onWaiting, onError }
      }

      // HLS 使用基于时间轴的检测：依赖 video.currentTime 变化
      // 注意：HLS 初始化需要时间（加载 m3u8 + 下载 segment），给予合理宽限期
      // 延迟 1.5 秒后再开始轮询检测，减少首帧确认延迟
      const pollDelayMs = 1500
      setTimeout(() => {
        // 检查 slot 是否仍然使用同一个 HLS 实例（可能被销毁重建了）
        const currentCtx = contexts.get(slotIdx)
        if (currentCtx && currentCtx.player === player && currentCtx.type === 'hls') {
          ctx.intervalId = setInterval(() => pollHlsStats(slotIdx, ctx), 1000)
          console.debug(`[StreamHealth] slot${slotIdx} HLS 监测启动（延迟 ${pollDelayMs}ms）`)
        }
      }, pollDelayMs)
    }

    contexts.set(slotIdx, ctx)
  }

  /** 停止监测某个 slot */
  function stopMonitoring(slotIdx: number) {
    const ctx = contexts.get(slotIdx)
    if (ctx) {
      if (ctx.intervalId) {
        clearInterval(ctx.intervalId)
      }
      // FLV: 移除事件监听（使用保存的回调引用）
      if (ctx.type === 'flv' && ctx.player) {
        try {
          const flvPlayer = ctx.player as flvjs.Player
          if (ctx.flvOnStats) {
            flvPlayer.off(flvjs.Events.STATISTICS_INFO, ctx.flvOnStats)
          }
          if (ctx.flvOnLoadingComplete) {
            flvPlayer.off(flvjs.Events.LOADING_COMPLETE, ctx.flvOnLoadingComplete)
          }
        } catch { /* ignore */ }
      }
      // HLS: 移除视频事件监听
      if (ctx.type === 'hls' && ctx.videoElement) {
        const events = (ctx as any).hlsEvents
        if (events) {
          ctx.videoElement.removeEventListener('playing', events.onPlaying)
          ctx.videoElement.removeEventListener('waiting', events.onWaiting)
          ctx.videoElement.removeEventListener('error', events.onError)
        }
      }
      contexts.delete(slotIdx)
    }
    reconnectExhaustedNotified.delete(slotIdx)
    delete healthStates[slotIdx]
  }

  /** 轮询 HLS 统计 + 基于视频时间轴的卡顿检测 */
  function pollHlsStats(slotIdx: number, ctx: MonitorContext) {
    const state = healthStates[slotIdx]
    if (!state) return

    const video = ctx.videoElement
    if (!video) return

    const prevNoData = ctx.noDataSeconds

    // HLS 场景：主要依赖 video.currentTime 变化检测播放状态
    // HLS 有 segment 缓冲，正常情况下播放时间会持续前进
    if (video.readyState >= 2 && !video.paused) {
      const currentTime = video.currentTime

      // 检查时间轴是否有进展
      if (ctx.lastVideoTime > 0) {
        const timeDelta = Math.abs(currentTime - ctx.lastVideoTime)

        // HLS 正常播放时，时间轴应该持续前进（至少每 1 秒前进一些）
        // 如果时间轴几乎没动，可能是缓冲耗尽或网络问题
        if (timeDelta < 0.05) {
          // 时间轴几乎没动（<50ms），检查是否有缓冲区数据
          const buffered = video.buffered
          const hasBufferData = buffered.length > 0 && buffered.end(buffered.length - 1) > currentTime + 0.5

          if (!hasBufferData) {
            // 无缓冲区数据 → 可能的卡顿
            if (prevNoData < 1) {
              console.warn(`[StreamHealth] slot${slotIdx} HLS 无数据（时间轴=${currentTime.toFixed(2)}s 无变化，无缓冲）`)
            }
            ctx.noDataSeconds = Math.min(ctx.noDataSeconds + 1, 30)
          } else {
            // 有缓冲区但可能是 GOP 等待（首帧或大帧期间），降低敏感度
            // H.265 等高压缩编码的 GOP 可能很长，宽限 3 秒
            ctx.noDataSeconds = Math.max(0, ctx.noDataSeconds - 0.3)
          }
        } else {
          // 时间轴有进展 → 正常播放，noDataSeconds 保持或递减
          ctx.noDataSeconds = Math.max(0, ctx.noDataSeconds - 0.5)
          state.lastDataTime = Date.now()
        }
      }
      ctx.lastVideoTime = currentTime
    } else if (video.readyState < 2) {
      // 视频还在加载中（正常启动阶段，不计入卡顿）
      // HLS 初始化时间较长，宽限期设为 8 秒
      const uptimeMs = Date.now() - ctx.createdAt
      if (uptimeMs > 8000) {
        ctx.noDataSeconds = Math.min(ctx.noDataSeconds + 1, 30)
      }
    }

    // FPS 计算：通过 getVideoPlaybackQuality 统计解码帧数
    computeFpsFromVideo(slotIdx, ctx)
    state.lossRate = 0
    evaluateHealth(slotIdx, ctx)
  }

  /** 轮询 WebRTC getStats */
  async function pollWebRtcStats(slotIdx: number, ctx: MonitorContext) {
    const pc = ctx.player as RTCPeerConnection
    if (!pc || pc.connectionState === 'closed') {
      stopMonitoring(slotIdx)
      return
    }

    try {
      const stats = await pc.getStats()

      const state = healthStates[slotIdx]
      if (!state) return

      let bytesReceived = 0
      let packetsLost = 0
      let packetsReceived = 0
      let rttMs = 0

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          bytesReceived = report.bytesReceived ?? 0
          packetsLost = report.packetsLost ?? 0
          packetsReceived = report.packetsReceived ?? 0
          // FPS: framesPerSecond 是标准 inbound-rtp 字段 (Chrome 80+)
          const fps = (report as any).framesPerSecond
          if (typeof fps === 'number' && fps >= 0) {
            state.fps = Math.round(fps)
          }
        }
        // P2-4: candidate-pair 包含 RTT（往返延迟），只取成功连接的
        if (report.type === 'candidate-pair' && (report as any).state === 'succeeded') {
          const rtt = (report as any).currentRoundTripTime
          rttMs = rtt != null ? Math.round(rtt * 1000) : 0
        }
      })

      // 计算增量
      const deltaBytes = bytesReceived - ctx.prevBytesReceived
      const deltaLost = packetsLost - ctx.prevPacketsLost
      const deltaReceived = packetsReceived - ctx.prevPacketsReceived

      state.bytesPerSec = deltaBytes
      state.packetsLost = packetsLost
      state.rttMs = rttMs  // P2-4: 保存 RTT 到状态

      // 丢包率
      const totalDelta = deltaLost + deltaReceived
      state.lossRate = totalDelta > 0 ? deltaLost / totalDelta : 0

      // 无数据检测（限制每秒最多+1，防止极端情况无限累加）
      if (deltaBytes === 0) {
        ctx.noDataSeconds = Math.min(ctx.noDataSeconds + 1, 30)  // 封顶30秒
      } else {
        ctx.noDataSeconds = 0
        state.lastDataTime = Date.now()
      }

      // 更新快照
      ctx.prevBytesReceived = bytesReceived
      ctx.prevPacketsLost = packetsLost
      ctx.prevPacketsReceived = packetsReceived

      // 判定状态
      evaluateHealth(slotIdx, ctx)
    } catch (e) {
      console.warn(`[StreamHealth] slot${slotIdx} getStats failed:`, e)
    }
  }

  /** 轮询 FLV 统计 + 视频元素卡顿检测（简化版：避免误触发） */
  function pollFlvStats(slotIdx: number, ctx: MonitorContext) {
    const state = healthStates[slotIdx]
    if (!state) return

    // 记录本次检测前的值
    const prevNoData = ctx.noDataSeconds

    // [简化逻辑] 只依赖 flv.js 的 speed 来判断是否有数据
    // video.currentTime 检测容易误触发（正常播放时也可能有 0.1s 不变）
    if (ctx.videoElement) {
      const video = ctx.videoElement
      const currentTime = video.currentTime

      // 仅在视频加载完成且正在播放时检查时间轴
      if (video.readyState >= 2 && !video.paused && ctx.lastVideoTime > 0) {
        const timeDelta = Math.abs(currentTime - ctx.lastVideoTime)

        // 如果时间轴几乎没动（变化 < 100ms），检查缓冲区状态
        if (timeDelta < 0.1) {
          const buffered = video.buffered
          const hasBufferData = buffered.length > 0 && buffered.end(buffered.length - 1) > currentTime + 0.5

          if (hasBufferData) {
            // 有数据但不解码 → 解码器卡住（可能是 GOP 期间正常现象）
            // 只记录日志，不触发 error（避免误触发导致闪烁）
            if (prevNoData < 1) {
              console.warn(`[StreamHealth] slot${slotIdx} 解码器卡住（时间轴 ${currentTime.toFixed(2)}s，但缓冲区有数据）`)
            }
          } else {
            // 无缓冲区数据 → 网络中断，这是真正的错误
            if (prevNoData < 1) {
              console.warn(`[StreamHealth] slot${slotIdx} 网络中断（时间轴 ${currentTime.toFixed(2)}s 不变，无缓冲区）`)
            }
            // 递增 noDataSeconds
            if (ctx.noDataSeconds === prevNoData) {
              ctx.noDataSeconds = Math.min(ctx.noDataSeconds + 1, 30)
            }
          }
        }
      }
      ctx.lastVideoTime = currentTime
    }

    // 基于 flv.js 速度判断（主要判断依据）
    if (ctx.lastSpeed === 0 && ctx.noDataSeconds === prevNoData) {
      ctx.noDataSeconds = Math.min(ctx.noDataSeconds + 1, 30)
    } else if (ctx.lastSpeed > 0) {
      ctx.noDataSeconds = 0
    }

    // FPS 计算：通过 getVideoPlaybackQuality 统计解码帧数
    computeFpsFromVideo(slotIdx, ctx)

    state.lossRate = 0
    evaluateHealth(slotIdx, ctx)
  }

  /** 通过 getVideoPlaybackQuality 计算 FPS（FLV/HLS 通用） */
  function computeFpsFromVideo(slotIdx: number, ctx: MonitorContext) {
    const video = ctx.videoElement
    if (!video) return
    const state = healthStates[slotIdx]
    if (!state) return

    const now = Date.now()
    const elapsed = now - ctx.lastFpsTime
    // 至少间隔 800ms 再计算一次 fps
    if (elapsed < 800) return

    try {
      const pq = (video as any).getVideoPlaybackQuality?.() as any
      if (pq && typeof pq.totalVideoFrames === 'number') {
        const totalFrames = pq.totalVideoFrames as number
        const delta = totalFrames - ctx.frameCount
        if (delta > 0 && ctx.frameCount > 0) {
          state.fps = Math.round(delta / (elapsed / 1000))
        }
        ctx.frameCount = totalFrames
      }
    } catch { /* 不支持 getVideoPlaybackQuality，忽略 */ }
    ctx.lastFpsTime = now
  }

  /** 综合评估健康状态（优化阈值：减少 GB28181 低帧率设备误触发） */
  function evaluateHealth(slotIdx: number, ctx: MonitorContext) {
    const state = healthStates[slotIdx]
    if (!state) return

    // 启动宽限期：HLS 15秒（H.265 GOP可能很长），FLV/WebRTC 12秒
    // GB28181 设备推流需要 SIP INVITE + RTP 传输建立，初始化时间较长
    const startupGraceMs = ctx.type === 'hls' ? 15000 : 12000
    const uptimeMs = Date.now() - ctx.createdAt
    const inStartupGrace = uptimeMs < startupGraceMs

    if (inStartupGrace) {
      // 在宽限期内，无数据只标记 warning 而非 error
      if (ctx.noDataSeconds >= 5) {
        state.status = 'warning'
      }
      return
    }

    // 连续 10 秒无数据或卡顿 → error
    // GB28181 设备 GOP 间隔可能较长（低帧率设备），需要更宽松的阈值
    if (ctx.noDataSeconds >= 10) {
      // 连续 error 确认：需连续 2 次 error 评估才真正触发（防止单次网络抖动误判）
      ctx.consecutiveErrorEvaluations++
      if (ctx.consecutiveErrorEvaluations >= 2) {
        if (state.status !== 'error') {
          state.stallCount++
          console.warn(`[StreamHealth] slot${slotIdx} 检测到持续卡顿（连续${ctx.consecutiveErrorEvaluations}次确认），stallCount=${state.stallCount}`)

          // 触发卡顿回调，让上层强制刷新视频
          if (onStall) {
            onStall(slotIdx, state.stallCount)
          }
        }
        state.status = 'error'
      } else {
        // 第一次检测到无数据，只标记 warning 不触发 error
        state.status = 'warning'
        console.warn(`[StreamHealth] slot${slotIdx} 无数据检测（第${ctx.consecutiveErrorEvaluations}次），待下次确认`)
      }
      return
    }

    // 丢包率 > 30% → error
    if (state.lossRate > 0.3) {
      state.status = 'error'
      return
    }

    // 数据正常 — 重置连续 error 计数器
    ctx.consecutiveErrorEvaluations = 0
    state.status = 'good'
    // 状态恢复时重置无数据秒数（防止之前卡顿后恢复但 noDataSeconds 未清零）
    ctx.noDataSeconds = 0
  }

  /** 获取某个 slot 的健康状态 */
  function getHealth(slotIdx: number): StreamHealthState {
    return healthStates[slotIdx] || getDefaultState()
  }

  /** 清理所有监测 */
  function cleanup() {
    for (const idx of contexts.keys()) {
      stopMonitoring(idx)
    }
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    cleanup()
  })

  return {
    healthStates,
    startMonitoring,
    stopMonitoring,
    getHealth,
    cleanup,
  }
}