/**
 * 华盾AI智能视频盒子 v7.0 - 码率自适应 Composable
 * composables/useAdaptiveBitrate.ts — 基于网络健康状态动态切换视频质量
 *
 * 质量等级：
 *   high     → 1080p (高清)
 *   standard → 720p  (标清)
 *   smooth   → 480p  (流畅)
 *
 * 切换策略（基于 5 秒滑动窗口均值）：
 *   RTT > 200ms 或 丢包率 > 5%  → standard
 *   RTT > 500ms 或 丢包率 > 15% → smooth
 *   连续 10 秒恢复正常          → 尝试升级（smooth→standard→high）
 *
 * 防抖：切换间隔最少 5 秒
 */

import { ref, reactive, onUnmounted } from 'vue'
import { streamHttp } from '@/api/http'
import type { StreamHealthState } from './useStreamHealth'

export type QualityLevel = 'high' | 'standard' | 'smooth'

export interface QualityLevelInfo {
  level: QualityLevel
  label: string        // 展示给用户的中文标签
  labelShort: string   // 视频叠加层短标签
  resolution: string
}

export const QUALITY_LEVELS: Record<QualityLevel, QualityLevelInfo> = {
  high: { level: 'high', label: '高清', labelShort: 'HD', resolution: '1080p' },
  standard: { level: 'standard', label: '标清', labelShort: 'SD', resolution: '720p' },
  smooth: { level: 'smooth', label: '流畅', labelShort: '流畅', resolution: '480p' },
}

const QUALITY_UPGRADE_ORDER: QualityLevel[] = ['smooth', 'standard', 'high']

// 滑动窗口大小（秒）
const WINDOW_SIZE = 5
// 防抖最小切换间隔（毫秒）
const SWITCH_DEBOUNCE_MS = 5000
// 升级所需连续正常秒数
const UPGRADE_STABLE_SECS = 10

// 阈值
const RTT_WARN_MS = 200
const RTT_ERR_MS = 500
const LOSS_WARN = 0.05   // 5%
const LOSS_ERR = 0.15    // 15%

interface SlotAbrContext {
  channelId: string
  currentLevel: QualityLevel
  lastSwitchTime: number
  stableSeconds: number
  rttWindow: number[]      // 最近 WINDOW_SIZE 个 RTT 采样（ms）
  lossWindow: number[]     // 最近 WINDOW_SIZE 个 lossRate 采样
  intervalId: ReturnType<typeof setInterval> | null
  // [P3-VP1] 主/子码流自动切换回调
  onStreamQualitySwitch?: (quality: 'main' | 'sub') => void
  currentStreamQuality: 'main' | 'sub'
}

export function useAdaptiveBitrate() {
  // slot -> 当前质量等级
  const qualityLevels = reactive<Record<number, QualityLevel>>({})
  const contexts = new Map<number, SlotAbrContext>()

  /**
   * 为某个 slot 激活码率自适应
   * @param slotIdx   视频格下标
   * @param channelId 通道 ID（用于调用后端 API）
   * @param getHealth 返回该 slot 最新健康状态的函数（来自 useStreamHealth）
   * @param initialLevel 初始质量等级，默认 high
   * @param onStreamQualitySwitch [P3-VP1] 主/子码流切换回调，网络质量下降时自动切子码流
   */
  function activate(
    slotIdx: number,
    channelId: string,
    getHealth: () => StreamHealthState,
    initialLevel: QualityLevel = 'high',
    onStreamQualitySwitch?: (quality: 'main' | 'sub') => void,
  ) {
    deactivate(slotIdx)

    qualityLevels[slotIdx] = initialLevel

    const ctx: SlotAbrContext = {
      channelId,
      currentLevel: initialLevel,
      lastSwitchTime: 0,
      stableSeconds: 0,
      rttWindow: [],
      lossWindow: [],
      intervalId: null,
      onStreamQualitySwitch,
      currentStreamQuality: 'main',
    }

    ctx.intervalId = setInterval(() => {
      tick(slotIdx, ctx, getHealth)
    }, 1000)

    contexts.set(slotIdx, ctx)
  }

  /** 停止某个 slot 的码率自适应 */
  function deactivate(slotIdx: number) {
    const ctx = contexts.get(slotIdx)
    if (ctx?.intervalId) {
      clearInterval(ctx.intervalId)
    }
    contexts.delete(slotIdx)
    delete qualityLevels[slotIdx]
  }

  /** 每秒执行的决策逻辑 */
  function tick(
    slotIdx: number,
    ctx: SlotAbrContext,
    getHealth: () => StreamHealthState,
  ) {
    const health = getHealth()

    // 从 healthStates 中提取 RTT（useStreamHealth 目前仅暴露 lossRate/bytesPerSec）
    // RTT 从 bytesPerSec 衍生：若无真实 RTT 则用 0（降级逻辑仍依赖 lossRate）
    const rttMs = (health as any).rttMs ?? 0
    const lossRate = health.lossRate ?? 0

    // 维护滑动窗口
    ctx.rttWindow.push(rttMs)
    ctx.lossWindow.push(lossRate)
    if (ctx.rttWindow.length > WINDOW_SIZE) ctx.rttWindow.shift()
    if (ctx.lossWindow.length > WINDOW_SIZE) ctx.lossWindow.shift()

    const avgRtt = ctx.rttWindow.reduce((a, b) => a + b, 0) / ctx.rttWindow.length
    const avgLoss = ctx.lossWindow.reduce((a, b) => a + b, 0) / ctx.lossWindow.length

    const now = Date.now()
    const sinceLast = now - ctx.lastSwitchTime

    // 防抖：距上次切换不足 5 秒则跳过
    if (sinceLast < SWITCH_DEBOUNCE_MS) return

    // 判断目标质量
    let targetLevel: QualityLevel

    if (avgRtt > RTT_ERR_MS || avgLoss > LOSS_ERR) {
      targetLevel = 'smooth'
    } else if (avgRtt > RTT_WARN_MS || avgLoss > LOSS_WARN) {
      targetLevel = 'standard'
    } else {
      // 网络良好，尝试升级
      ctx.stableSeconds++
      if (ctx.stableSeconds >= UPGRADE_STABLE_SECS) {
        ctx.stableSeconds = 0
        const curIdx = QUALITY_UPGRADE_ORDER.indexOf(ctx.currentLevel)
        if (curIdx < QUALITY_UPGRADE_ORDER.length - 1) {
          targetLevel = QUALITY_UPGRADE_ORDER[curIdx + 1]
        } else {
          // 已是最高质量，维持
          return
        }
      } else {
        return
      }
    }

    // 降级时重置稳定计数
    if (targetLevel !== 'high') {
      ctx.stableSeconds = 0
    }

    // 无需切换（目标与当前相同）
    if (targetLevel === ctx.currentLevel) return

    // 执行切换
    ctx.currentLevel = targetLevel
    ctx.lastSwitchTime = now
    qualityLevels[slotIdx] = targetLevel

    // [P3-VP1] 主/子码流自动切换: quality=high→主码流, standard/smooth→子码流
    handleStreamQualitySwitch(ctx, targetLevel)

    requestQualityChange(ctx.channelId, targetLevel)
      .catch(err => console.warn(`[ABR] slot${slotIdx} quality change failed:`, err))
  }

  // [P3-VP1] 根据质量等级自动切换主/子码流（对标海康/大华双码流自适应）
  function handleStreamQualitySwitch(ctx: SlotAbrContext, level: QualityLevel) {
    if (!ctx.onStreamQualitySwitch) return
    const targetStream: 'main' | 'sub' = level === 'high' ? 'main' : 'sub'
    if (targetStream !== ctx.currentStreamQuality) {
      ctx.currentStreamQuality = targetStream
      ctx.onStreamQualitySwitch(targetStream)
      console.debug(`[ABR] [P3-VP1] auto-switching to ${targetStream} stream (quality=${level})`)
    }
  }

  /** 调用后端 API 请求质量切换 */
  async function requestQualityChange(channelId: string, level: QualityLevel) {
    try {
      await streamHttp.post(`/${channelId}/quality`, { id: channelId, quality: level })
      console.debug(`[ABR] quality changed to ${level} for ${channelId}`)
    } catch (err: any) {
      // 4xx 可能是设备未注册，静默跳过；其他错误上报
      if (err?.status >= 500) {
        console.warn(`[ABR] quality change failed for ${channelId}:`, err)
      }
      // 静默忽略 4xx（后端未注册设备时返回错误，不影响播控逻辑）
    }
  }

  /** 获取某 slot 当前质量等级（默认 high） */
  function getQuality(slotIdx: number): QualityLevel {
    return qualityLevels[slotIdx] ?? 'high'
  }

  /** 获取某 slot 质量等级信息 */
  function getQualityInfo(slotIdx: number): QualityLevelInfo {
    return QUALITY_LEVELS[getQuality(slotIdx)]
  }

  /** 清理所有监测 */
  function cleanup() {
    for (const idx of contexts.keys()) {
      deactivate(idx)
    }
  }

  onUnmounted(() => cleanup())

  return {
    qualityLevels,
    activate,
    deactivate,
    getQuality,
    getQualityInfo,
    cleanup,
  }
}
