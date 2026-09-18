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
// [FIX ws-frame-classify 2026-09-18 三方对齐] 状态同步帧判定 (归一化对象版) —
//   弹窗/列表/首页/store 四处共用单一实现 (useAlarmTableHelpers), 防口径漂移
import { isAlarmStateSyncNormalized } from '@/composables/useAlarmTableHelpers'

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
      // [接警单号 2026-09-09] 补 unsure/known/true_positive 文案 (弹窗研判判定提交路径)
      const statusLabels: Record<string, string> = {
        confirmed: '已确认', true_positive: '已确认为真实告警',
        false_alarm: '已标记误报', forwarded: '已转发',
        unsure: '已标记存疑', known: '已标记已知事件',
      }
      ElMessage.success(statusLabels[form.status] || '处理成功')
      // [FIX handle-latency 2026-09-14] PUT 成功即刻返回: 列表/计数刷新转后台 —
      //   原 await fetchAlarms + fetchUnhandledCount 把慢链 (隧道高负载下可达
      //   数十秒) 归入返回路径, 调用方 useAlarmPopup.handleAlarm 的
      //   'alarm-handled' 广播 (行状态/按钮即时切换) 被一并阻塞 → 成功 toast
      //   已弹但列表行数十秒不变「查看」(真机 E2E 实测 D2: 按钮文案=去处警)。
      //   fire-and-forget 后 store 仍后台刷新 (两函数自带 try/catch 静默失败),
      //   对唯一调用方语义仍为「PUT 成功 = true」, 列表/计数最终一致。
      void fetchAlarms()
      void fetchUnhandledCount()
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
    // [P0-4 2026-09-14] 事件结束帧分支 (后端 event_ended, P0-4 事件生命周期):
    //   end 帧 alarm_id 是 'event_end_<track>_<ts>' 新 id (同 id 合并链不命中),
    //   按 ch+track+type 匹配列表已有条目更新结束态 — 不新增条目/不重复计数
    //   (end 帧不落库不推未处理数, 仅列表态刷新); 两侧列表 (实时+已拉取)
    //   均刷新; 匹配未结束条目 (eventEnded 未置) 才改写, 未命中静默丢弃。
    if ((norm as any).eventEnded) {
      const tid = Number((norm as any).trackId ?? -1)
      const matches = (a: AlarmEvent) =>
        String(a.channelId) === String(norm.channelId)
        && Number((a as any).trackId ?? -1) === tid
        && a.type === norm.type
      for (const list of [realtimeAlarms.value, alarms.value]) {
        for (const a of list) {
          if (!matches(a) || (a as any).eventEnded) continue
          const cur = a as any
          if (norm.eventStartMs) cur.eventStartMs = norm.eventStartMs
          if (norm.lastSeenMs) cur.lastSeenMs = norm.lastSeenMs
          if (norm.eventEndMs) cur.eventEndMs = norm.eventEndMs
          cur.eventEnded = true
        }
      }
      return
    }
    // [FIX prevnext-shape 2026-09-11] 同告警双帧去重富化 — 后端双推送
    //   (alarm.new 全量 metadata 含 alarm_shapes / BoxService WEB_POPUP executor
    //   平铺精简字段无 metadata) 原各自 unshift → 队列同 id 两条, 弹窗
    //   「上一条/下一条」在两帧间跳动: 精简帧无 alarm_shapes 走区域库回退
    //   渲染「区域」, 富帧渲染「绊线」— 同一告警两形态 (入口分裂根因一)。
    //   与 useAlarmPopup.showAlarmPopup 同 id 富化合并同语义: 同 id 后到帧
    //   不重复入队/不重复计数, 只补稀疏字段 (metadata 深合并/快照/视频 URL)。
    const existIdx = realtimeAlarms.value.findIndex((a) => a.id === norm.id)
    // [FIX ws-frame-classify 2026-09-18 三方对齐] 状态同步帧兜底 (与列表/
    //   首页 onAlarmPush 同口径, helper 共用): 同 id 不在实时窗口 (50 条滑出/
    //   会话早期帧) → 丢弃不新增 — is_duplicate 短窗去重帧不落库 (DB 无行),
    //   unshift 会造出幽灵条目污染弹窗队列/未处理计数 (原实现仅靠同 id 合并
    //   兜底, 窗口外状态帧漏网)。命中窗口仍走下方富化合并。
    if (existIdx < 0 && isAlarmStateSyncNormalized(norm)) return
    if (existIdx >= 0) {
      const cur = realtimeAlarms.value[existIdx] as any
      const mergedMeta = { ...(cur.metadata || {}), ...(norm.metadata || {}) } as any
      // detections/bbox/face_box/alarm_shapes: 后到帧非空才覆盖
      //   (富帧在前被清空的风险隔离, 同 showAlarmPopup 口径)
      for (const k of ['detections', 'bbox', 'face_box', 'alarm_shapes'] as const) {
        const nv = (norm.metadata as any)?.[k]
        const ov = (cur.metadata as any)?.[k]
        if ((Array.isArray(nv) && nv.length === 0) || nv === undefined) {
          if (ov !== undefined) mergedMeta[k] = ov
        }
      }
      cur.metadata = mergedMeta
      cur.snapshotUrl = norm.snapshotUrl || cur.snapshotUrl
      cur.videoClipUrl = norm.videoClipUrl || cur.videoClipUrl
      cur.channelName = norm.channelName || cur.channelName
      cur.deviceName = norm.deviceName || cur.deviceName
      // [P0-4 2026-09-14] 进行中帧的生命周期富化 (start/last_seen 刷新;
      //   end 在 end 帧分支写入, 此处不覆盖已有结束态)
      if (!cur.eventEnded) {
        if (norm.eventStartMs) cur.eventStartMs = norm.eventStartMs
        if (norm.lastSeenMs) cur.lastSeenMs = norm.lastSeenMs
      }
      return
    }
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
