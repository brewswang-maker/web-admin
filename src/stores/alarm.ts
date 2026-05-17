/**
 * 华盾AI智能视频盒子 v7.0 - 告警状态管理
 * stores/alarm.ts — 告警列表、统计、实时推送、批量操作
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { alarmApi } from '@/api/alarm'
import type { AlarmEvent, AlarmStats, AlarmQuery, AlarmHandleForm, AlarmType } from '@/types/alarm'
import { ElMessage, ElMessageBox } from 'element-plus'

export const useAlarmStore = defineStore('alarm', () => {
  // ===== 状态 =====
  const alarms = ref<AlarmEvent[]>([])
  const stats = ref<AlarmStats | null>(null)
  const loading = ref(false)
  const total = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(20)
  const query = ref<AlarmQuery>({})
  const unhandledCount = ref(0)
  const realtimeAlarms = ref<AlarmEvent[]>([])

  // ===== 计算属性 =====
  const criticalCount = computed(() => alarms.value.filter(a => a.level === 'critical').length)
  const highCount = computed(() => alarms.value.filter(a => a.level === 'high').length)
  const hasUnhandled = computed(() => unhandledCount.value > 0)

  // ===== Actions =====

  /** 加载告警列表 */
  async function fetchAlarms(params?: AlarmQuery) {
    loading.value = true
    try {
      query.value = { ...query.value, ...params }
      const res = await alarmApi.getList({ page: currentPage.value, pageSize: pageSize.value, ...query.value })
      alarms.value = res.data.data.items
      total.value = res.data.data.total
      currentPage.value = res.data.data.page
    } catch (e: any) {
      ElMessage.error('加载告警列表失败: ' + (e.message || '未知错误'))
    } finally {
      loading.value = false
    }
  }

  /** 加载告警统计 */
  async function fetchStats() {
    try {
      const res = await alarmApi.getStats()
      stats.value = res.data.data
    } catch (e: any) {
      console.error('[AlarmStore] 获取统计失败:', e)
    }
  }

  /** 获取未处理告警数 */
  async function fetchUnhandledCount() {
    try {
      const res = await alarmApi.getUnhandledCount()
      unhandledCount.value = res.data.data.count
    } catch {
      // 静默失败
    }
  }

  /** 处理告警 */
  async function handleAlarm(id: string, form: AlarmHandleForm) {
    try {
      await alarmApi.handle(id, form)
      const statusLabels: Record<string, string> = { confirmed: '已确认', false_alarm: '已标记误报', forwarded: '已转发' }
      ElMessage.success(statusLabels[form.status] || '处理成功')
      await fetchAlarms()
      await fetchUnhandledCount()
      return true
    } catch (e: any) {
      ElMessage.error('处理告警失败')
      return false
    }
  }

  /** 批量确认 */
  async function batchConfirm(ids: string[], note?: string) {
    try {
      await alarmApi.batchConfirm(ids, note)
      ElMessage.success(`已确认 ${ids.length} 条告警`)
      await fetchAlarms()
      await fetchUnhandledCount()
      return true
    } catch {
      ElMessage.error('批量确认失败')
      return false
    }
  }

  /** 批量标记误报 */
  async function batchFalseAlarm(ids: string[], note?: string) {
    try {
      await alarmApi.batchFalseAlarm(ids, note)
      ElMessage.success(`已标记 ${ids.length} 条误报`)
      await fetchAlarms()
      await fetchUnhandledCount()
      return true
    } catch {
      ElMessage.error('批量标记失败')
      return false
    }
  }

  /** 转发告警 */
  async function forwardAlarm(id: string, forwardTo: string, note?: string) {
    try {
      await alarmApi.forward(id, forwardTo, note)
      ElMessage.success('告警已转发')
      await fetchAlarms()
      return true
    } catch {
      ElMessage.error('转发失败')
      return false
    }
  }

  /** 接收实时告警（WebSocket推送） */
  function pushRealtimeAlarm(alarm: AlarmEvent) {
    realtimeAlarms.value.unshift(alarm)
    // 保持最近50条
    if (realtimeAlarms.value.length > 50) {
      realtimeAlarms.value = realtimeAlarms.value.slice(0, 50)
    }
    unhandledCount.value++
  }

  /** 导出告警 */
  async function exportAlarms(params?: AlarmQuery) {
    try {
      const res = await alarmApi.exportAlarms(params || query.value)
      const blob = new Blob([res.data as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `告警报表_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
      ElMessage.success('导出成功')
    } catch {
      ElMessage.error('导出失败')
    }
  }

  /** 分页切换 */
  function setPage(page: number) {
    currentPage.value = page
    fetchAlarms()
  }

  function setPageSize(size: number) {
    pageSize.value = size
    currentPage.value = 1
    fetchAlarms()
  }

  /** 重置筛选条件 */
  function resetQuery() {
    query.value = {}
    currentPage.value = 1
    fetchAlarms()
  }

  function $reset() {
    alarms.value = []
    stats.value = null
    total.value = 0
    currentPage.value = 1
    query.value = {}
    unhandledCount.value = 0
    realtimeAlarms.value = []
  }

  return {
    // state
    alarms, stats, loading, total, currentPage, pageSize, query, unhandledCount, realtimeAlarms,
    // computed
    criticalCount, highCount, hasUnhandled,
    // actions
    fetchAlarms, fetchStats, fetchUnhandledCount,
    handleAlarm, batchConfirm, batchFalseAlarm, forwardAlarm,
    pushRealtimeAlarm, exportAlarms,
    setPage, setPageSize, resetQuery, $reset
  }
})
