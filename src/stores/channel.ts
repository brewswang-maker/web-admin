/**
 * 全局通道状态 Store — 跨路由持久化活跃通道信息
 *
 * 核心职责：
 * 1. 记录当前所有活跃通道的流信息（channelId, urls, codec, format 等）
 * 2. 控制 FloatingPreview 浮窗的显隐和通道切换
 * 3. 提供 snapshot() 用于 LiveView 返回时恢复播放
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { registerInferenceViewer, unregisterInferenceViewer } from '@/api/inference'

/** PlayerFormat 与 LiveView 一致 */
export type PlayerFormat = 'flv' | 'ws-flv' | 'hls' | 'webrtc'

/** 活跃通道数据 */
export interface ActiveSlotData {
  channelId: string
  deviceId: string
  name: string
  urls: Partial<Record<PlayerFormat, string>>
  codec: string
  format: PlayerFormat
  inferenceEnabled: boolean
  registeredAt: number
}

export const useChannelStore = defineStore('channel', () => {
  // ===== State =====
  const slots = ref<Map<number, ActiveSlotData>>(new Map())
  const showFloatingPreview = ref(false)
  const floatingPreviewChannelId = ref<string | null>(null)

  // [Fix 2026-06-23] 全局 /start 跨组件防抖
  //   原因：MiniPlayer 的防抖是 per-instance 的，AlarmPopup + FloatingPreview + LiveView
  //         各有独立实例，无法协调。多个组件同时对同一 channelId 调 /start → SIP INVITE 风暴。
  //   方案：防抖记录提升到 Pinia store，所有组件共享同一个 Map。
  //   对标海康 iVMS：同通道 5s 内只允许一次 /start 调用。
  const GLOBAL_START_DEBOUNCE_MS = 5000
  const lastStartApiAt = ref<Map<string, number>>(new Map())

  // ===== Getters =====
  const hasActive = computed(() => slots.value.size > 0)

  const activeChannels = computed(() =>
    Array.from(slots.value.entries()).map(([idx, data]) => ({ idx, ...data }))
  )

  const activeChannelIds = computed(() =>
    Array.from(slots.value.values()).map(s => s.channelId)
  )

  // ===== Actions =====

  // [FIX-P3.4 2026-07-07] shouldSkipStart 拆分为纯查询 + 显式 mark
  //   原问题: shouldSkipStart 有副作用（自动写时间戳），调用者难控制
  //           同一表达式多次调用结果不一致
  //   修复: 拆分 checkSkipStart (纯查询) + markStartCalled (显式写入)
  function checkSkipStart(channelId: string): boolean {
    const last = lastStartApiAt.value.get(channelId) || 0
    return Date.now() - last < GLOBAL_START_DEBOUNCE_MS
  }

  /** 手动标记 /start 已调用（用于非防抖路径记录） */
  function markStartCalled(channelId: string) {
    lastStartApiAt.value.set(channelId, Date.now())
  }

  /** [STABILITY-FIX 2026-07-29] 清除指定通道的 /start 防抖记录（重试时使用） */
  function clearStartDebounce(channelId: string) {
    lastStartApiAt.value.delete(channelId)
  }

  /** @deprecated 已拆分为 checkSkipStart + markStartCalled（向后兼容保留） */
  function shouldSkipStart(channelId: string): boolean {
    const last = lastStartApiAt.value.get(channelId) || 0
    const inDebounce = Date.now() - last < GLOBAL_START_DEBOUNCE_MS
    if (!inDebounce) {
      lastStartApiAt.value.set(channelId, Date.now())
    }
    return inDebounce
  }

  /** 注册一个活跃通道（LiveView assignChannel 成功后调用） */
  function registerSlot(idx: number, data: ActiveSlotData) {
    slots.value.set(idx, { ...data })
    // 通知后端该通道有前端查看者 → 即使无联动规则也执行推理 (画检测框)
    registerInferenceViewer(data.channelId).catch(() => {
      // 静默失败: 查看者注册是优化项, 不影响核心功能
    })
  }

  /** 注销通道（用户硬关闭时调用） */
  function unregisterSlot(idx: number) {
    const old = slots.value.get(idx)
    if (old) {
      // 通知后端该通道的前端查看者减少 → 无规则时恢复跳过推理
      unregisterInferenceViewer(old.channelId).catch(() => {})
    }
    slots.value.delete(idx)
    // 如果浮窗显示的是被注销的通道，切换到下一个
    if (floatingPreviewChannelId.value) {
      const deleted = slots.value.size === 0 ||
        !Array.from(slots.value.values()).some(s => s.channelId === floatingPreviewChannelId.value)
      if (deleted) {
        floatingPreviewChannelId.value = activeChannelIds.value[0] || null
      }
    }
    if (slots.value.size === 0) {
      showFloatingPreview.value = false
    }
  }

  /** 清空全部（用户主动全部关闭或退出登录） */
  function clearAll() {
    // 注销所有活跃通道的查看者
    for (const [, data] of slots.value) {
      unregisterInferenceViewer(data.channelId).catch(() => {})
    }
    slots.value.clear()
    showFloatingPreview.value = false
    floatingPreviewChannelId.value = null
  }

  /** 获取指定 slot */
  function getSlot(idx: number) {
    return slots.value.get(idx)
  }

  /** 返回所有 slot 快照（用于 LiveView 恢复） */
  function snapshot() {
    return Array.from(slots.value.entries()).map(([idx, data]) => ({ idx, data }))
  }

  /** 设置浮窗显示的通道 */
  function setFloatingChannel(channelId: string | null) {
    floatingPreviewChannelId.value = channelId
  }

  return {
    slots,
    showFloatingPreview,
    floatingPreviewChannelId,
    hasActive,
    activeChannels,
    activeChannelIds,
    registerSlot,
    unregisterSlot,
    clearAll,
    getSlot,
    snapshot,
    setFloatingChannel,
    shouldSkipStart,
    markStartCalled,
    clearStartDebounce,
    checkSkipStart,
  }
})
