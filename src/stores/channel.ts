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

  // ===== Getters =====
  const hasActive = computed(() => slots.value.size > 0)

  const activeChannels = computed(() =>
    Array.from(slots.value.entries()).map(([idx, data]) => ({ idx, ...data }))
  )

  const activeChannelIds = computed(() =>
    Array.from(slots.value.values()).map(s => s.channelId)
  )

  // ===== Actions =====

  /** 注册一个活跃通道（LiveView assignChannel 成功后调用） */
  function registerSlot(idx: number, data: ActiveSlotData) {
    slots.value.set(idx, { ...data })
  }

  /** 注销通道（用户硬关闭时调用） */
  function unregisterSlot(idx: number) {
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
  }
})
