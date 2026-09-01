/**
 * 华盾AI智能视频盒子 v7.0 - 告警状态管理
 * stores/alarm.ts — 告警列表、统计、实时推送、批量操作
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { alarmApi } from '@/api/alarm'
import type { AlarmEvent, AlarmStats, AlarmQuery, AlarmHandleForm, AlarmType } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'
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

  /** 后端 snake_case → 前端 AlarmEvent 归一化 (委派给 types/alarm.ts 统一实现)。
   *  [vp6-P1.3 2026-09-01] 兜底合并原始 metadata (同 useAlarmPopup.normalizeAlarmPayload):
   *  normalizeAlarmCore 白名单重建只取顶层 raw.bbox/target_label, metadata 内
   *  detections/class_name (检测直报链, REST 落库为 JSON 字符串) 被丢弃 →
   *  事件视图/快照标注兜底链断。原始键保留, camel 标准键优先。 */
  function normalizeAlarm(raw: any): AlarmEvent {
    const n = normalizeAlarmCore(raw)
    let rm: Record<string, unknown> = {}
    const md = raw?.metadata
    if (typeof md === 'string') {
      try { rm = JSON.parse(md) as Record<string, unknown> } catch { rm = {} }
    } else if (Array.isArray(md)) {
      rm = (md[0] && typeof md[0] === 'object' ? md[0] : {}) as Record<string, unknown>
    } else if (md && typeof md === 'object') {
      rm = md as Record<string, unknown>
    }
    n.metadata = { ...rm, ...n.metadata } as typeof n.metadata
    return n
  }

  /** 加载告警列表 */
  async function fetchAlarms(params?: AlarmQuery) {
    loading.value = true
    try {
      query.value = { ...query.value, ...params }
      const res = await alarmApi.getList({
        page: currentPage.value,
        pageSize: pageSize.value,
        // [FIX 2026-07-24] 移除 count 参数: 后端会将 count 误解为 pageSize 覆盖,
        //   导致分页 total/pagesize 计算混乱
        ...query.value,
      })
      const respData: any = res.data?.data ?? res.data

      // 后端返回 {alarms: [...], total: N} 或 {items: [...], total: N}
      let rawList: any[] = []
      if (respData) {
        if (Array.isArray(respData.alarms)) {
          rawList = respData.alarms
          total.value = respData.total ?? respData.alarms.length
        } else if (Array.isArray(respData.items)) {
          rawList = respData.items
          total.value = respData.total ?? respData.items.length
        } else if (Array.isArray(respData)) {
          rawList = respData
          total.value = respData.length
        }
      }

      alarms.value = rawList.map(normalizeAlarm)

      // 从加载的数据中计算未处理数（后端可能没有 unhandled-count 端点）
      if (rawList.length > 0) {
        const unhandled = rawList.filter((a: any) => (a.status || 'unhandled') === 'unhandled').length
        // 只在列表较大时更新（避免只加载部分数据时低估）
        if (rawList.length >= 10 || alarms.value.length <= pageSize.value) {
          unhandledCount.value = unhandled
        }
      }
    } catch (e: any) {
      console.error('[AlarmStore] fetchAlarms failed:', e)
    } finally {
      loading.value = false
    }
  }

  /** 加载告警统计 */
  async function fetchStats() {
    try {
      const res = await alarmApi.getStats()
      const respData: any = res.data?.data ?? res.data
      stats.value = respData
      // stats 端点可能返回 unhandled 计数
      if (respData && typeof respData.unhandled === 'number') {
        unhandledCount.value = respData.unhandled
      }
    } catch (e: any) {
      console.error('[AlarmStore] 获取统计失败:', e)
    }
  }

  /** 获取未处理告警数 */
  async function fetchUnhandledCount() {
    try {
      const res = await alarmApi.getUnhandledCount()
      const respData: any = res.data?.data ?? res.data
      // 后端可能返回 {count: N} 或直接数字
      unhandledCount.value = typeof respData === 'number' ? respData : (respData?.count ?? respData?.unhandled ?? 0)
    } catch {
      // 静默失败，尝试从已加载列表计算
      unhandledCount.value = alarms.value.filter(a => a.status === 'unhandled').length
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
    // 防御性兜底: 如果调用方忘了 normalize, 内部补一次.
    // 否则 store 里的 status 为 undefined, 依赖 status==='unhandled' 的过滤全部失败.
    const norm = (alarm as any)?.status ? alarm : normalizeAlarmCore(alarm)
    realtimeAlarms.value.unshift(norm)
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
