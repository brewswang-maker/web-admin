/**
 * 华盾AI智能视频盒子 v7.0 - 设备状态管理
 * stores/device.ts — 设备列表、统计、选中、CRUD操作
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { deviceApi } from '@/api/device'
import { http } from '@/api/http'
import type { DeviceItem, DeviceStats, DeviceQuery, DeviceForm, DiscoveredDevice, DeviceConfig, DeviceDetail, DeviceMetrics, DeviceSyncRecord } from '@/types/device'
import { ElMessage, ElMessageBox } from 'element-plus'
import { normalizeDeviceMetrics } from '@/utils/deviceMetrics'

export const useDeviceStore = defineStore('device', () => {
  // ===== 状态 =====
  const devices = ref<DeviceItem[]>([])
  const currentDevice = ref<DeviceItem | null>(null)
  const stats = ref<DeviceStats | null>(null)
  const loading = ref(false)
  const total = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(20)
  const query = ref<DeviceQuery>({})
  const deviceMetrics = ref<DeviceMetrics[]>([])
  const syncRecords = ref<DeviceSyncRecord[]>([])
  const templates = ref<Array<{ id: string; name: string; type: string }>>([])

  // ===== 计算属性 =====
  const onlineCount = computed(() => devices.value.filter(d => d.status === 'online').length)
  const offlineCount = computed(() => devices.value.filter(d => d.status === 'offline').length)
  const alarmingCount = computed(() => devices.value.filter(d => d.status === 'alarming').length)
  const onlineRate = computed(() => {
    if (!stats.value || stats.value.total === 0) return 0
    return Math.round((stats.value.online / stats.value.total) * 100)
  })
  const latestMetrics = computed(() => deviceMetrics.value[deviceMetrics.value.length - 1] || null)

  // ===== Actions =====
  async function fetchDevices(params?: DeviceQuery) {
    loading.value = true
    try {
      query.value = { ...query.value, ...params }
      const res = await deviceApi.getList({ page: currentPage.value, pageSize: pageSize.value, ...query.value })
      const resData = (res.data as any).data ?? res.data
      devices.value = resData.items || resData.devices || []
      total.value = resData.total || 0
      currentPage.value = resData.page || 1
    } catch (e: any) {
      ElMessage.error('加载设备列表失败: ' + (e.message || '未知错误'))
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    try {
      const res = await deviceApi.getStats()
      stats.value = (res.data as any).data ?? res.data
    } catch (e: any) {
      console.error('[DeviceStore] 获取统计失败:', e)
    }
  }

  async function fetchDetail(id: string) {
    loading.value = true
    try {
      const res = await deviceApi.getDetail(id)
      currentDevice.value = (res.data as any).data ?? res.data
      return currentDevice.value
    } catch (e: any) {
      ElMessage.error('加载设备详情失败')
      return null
    } finally {
      loading.value = false
    }
  }

  async function fetchDeviceDetail(id: string) { return fetchDetail(id) }

  async function createDevice(data: DeviceForm) {
    try {
      await deviceApi.create(data)
      ElMessage.success('设备创建成功')
      await fetchDevices()
      await fetchStats()
      return true
    } catch (e: any) {
      ElMessage.error('创建设备失败: ' + (e.message || '未知错误'))
      return false
    }
  }

  async function addDevice(data: DeviceForm) { return createDevice(data) }

  async function updateDevice(id: string, data: Partial<DeviceForm>) {
    try {
      await deviceApi.update(id, data)
      ElMessage.success('设备更新成功')
      if (currentDevice.value?.id === id) await fetchDetail(id)
      await fetchDevices()
      return true
    } catch (e: any) {
      ElMessage.error('更新设备失败: ' + (e.message || '未知错误'))
      return false
    }
  }

  async function deleteDevice(id: string) {
    try {
      await deviceApi.delete(id)
      ElMessage.success('设备删除成功')
      if (currentDevice.value?.id === id) currentDevice.value = null
      await fetchDevices()
      await fetchStats()
      return true
    } catch (e: any) {
      ElMessage.error('删除设备失败: ' + (e.message || '未知错误'))
      return false
    }
  }

  async function removeDevice(id: string) { return deleteDevice(id) }

  async function reboot(id: string) {
    try {
      await deviceApi.reboot(id)
      ElMessage.success('重启指令已发送')
      return true
    } catch (e: any) {
      ElMessage.error('重启失败: ' + (e.message || '未知错误'))
      return false
    }
  }

  async function discoverOnvif(subnet?: string): Promise<DiscoveredDevice[]> {
    try {
      const res = await deviceApi.discoverOnvif(subnet)
      return (res.data as any).data ?? res.data ?? []
    } catch { return [] }
  }

  async function discoverGB28181(): Promise<DiscoveredDevice[]> {
    try {
      const res = await deviceApi.discoverGB28181()
      return (res.data as any).data ?? res.data ?? []
    } catch { return [] }
  }

  async function syncDevice(id: string) {
    try {
      await deviceApi.sync(id)
      ElMessage.success('同步指令已发送')
      await fetchDetail(id)
      return true
    } catch (e: any) {
      ElMessage.error('同步失败: ' + (e.message || '未知错误'))
      return false
    }
  }

  async function fetchDeviceMetrics(id: string) {
    try {
      const res = await deviceApi.getDetail(id) as any
      const payload = res?.data?.data ?? res?.data ?? res
      deviceMetrics.value = normalizeDeviceMetrics(payload)
    } catch { deviceMetrics.value = [] }
  }

  async function fetchLatestMetrics(id: string) { return fetchDeviceMetrics(id) }

  async function fetchSyncRecords(id: string) {
    try {
      const { data: resp } = await http.get(`/devices/${id}/sync-records`)
      syncRecords.value = resp?.data?.records ?? []
    } catch { syncRecords.value = [] }
  }

  async function fetchTemplates() {
    try {
      const { data: resp } = await http.get('/devices/templates')
      templates.value = resp?.data?.templates ?? []
    } catch { templates.value = [] }
  }

  return {
    devices, currentDevice, stats, loading, total, currentPage, pageSize, query,
    deviceMetrics, syncRecords, templates, latestMetrics,
    onlineCount, offlineCount, alarmingCount, onlineRate,
    fetchDevices, fetchStats, fetchDetail, fetchDeviceDetail,
    createDevice, addDevice, updateDevice, deleteDevice, removeDevice,
    reboot, discoverOnvif, discoverGB28181, syncDevice,
    fetchDeviceMetrics, fetchLatestMetrics, fetchSyncRecords, fetchTemplates,
  }
})
