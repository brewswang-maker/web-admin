/**
 * 华盾AI智能视频盒子 v7.0 - 设备操作 Composable
 * composables/useDevice.ts — 封装设备常用操作逻辑
 */

import { ref, onMounted } from 'vue'
import { useDeviceStore } from '@/stores/device'
import { channelApi } from '@/api/channel'
import type { ChannelItem } from '@/types/device'
import type { DiscoveredDevice } from '@/types/device'

/** 设备详情页数据 */
export function useDeviceDetail(deviceId: string) {
  const deviceStore = useDeviceStore()
  const channels = ref<ChannelItem[]>([])
  const channelsLoading = ref(false)

  async function loadDevice() {
    await deviceStore.fetchDetail(deviceId)
  }

  async function loadChannels() {
    channelsLoading.value = true
    try {
      const res = await channelApi.getDeviceChannels(deviceId)
      channels.value = res.data.data
    } catch {
      channels.value = []
    } finally {
      channelsLoading.value = false
    }
  }

  async function loadAll() {
    await Promise.all([loadDevice(), loadChannels()])
  }

  onMounted(loadAll)

  return {
    device: deviceStore.currentDevice,
    channels,
    channelsLoading,
    deviceStore,
    loadDevice,
    loadChannels,
    loadAll
  }
}

/** 设备发现 */
export function useDeviceDiscovery() {
  const discovering = ref(false)
  const discoveredDevices = ref<DiscoveredDevice[]>([])

  async function discoverOnvif(subnet?: string) {
    discovering.value = true
    try {
      const deviceStore = useDeviceStore()
      discoveredDevices.value = await deviceStore.discoverOnvif(subnet) || []
    } finally {
      discovering.value = false
    }
  }

  async function discoverGB28181() {
    discovering.value = true
    try {
      const deviceStore = useDeviceStore()
      discoveredDevices.value = await deviceStore.discoverGB28181() || []
    } finally {
      discovering.value = false
    }
  }

  function clearDiscovered() {
    discoveredDevices.value = []
  }

  return {
    discovering,
    discoveredDevices,
    discoverOnvif,
    discoverGB28181,
    clearDiscovered
  }
}

/** 设备状态标签辅助 */
export function useDeviceLabels() {
  function statusTagType(status: string) {
    const map: Record<string, string> = {
      online: 'success',
      offline: 'danger',
      maintaining: 'warning',
      alarming: 'danger'
    }
    return (map[status] || 'info') as any
  }

  function statusLabel(status: string) {
    const map: Record<string, string> = {
      online: '在线',
      offline: '离线',
      maintaining: '维护中',
      alarming: '告警中'
    }
    return map[status] || status
  }

  function syncTagType(status: string) {
    const map: Record<string, string> = {
      synced: 'success',
      syncing: 'warning',
      outdated: 'danger',
      failed: 'danger',
      never: 'info'
    }
    return (map[status] || 'info') as any
  }

  function syncLabel(status: string) {
    const map: Record<string, string> = {
      synced: '已同步',
      syncing: '同步中',
      outdated: '待更新',
      failed: '同步失败',
      never: '未同步'
    }
    return map[status] || status
  }

  return { statusTagType, statusLabel, syncTagType, syncLabel }
}
