/**
 * 华盾AI智能视频盒子 v7.0 - 告警操作 Composable
 * composables/useAlarm.ts — 封装告警常用操作逻辑
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAlarmStore } from '@/stores/alarm'
import { useWebSocket } from '@/composables/useWebSocket'
import type { AlarmEvent, AlarmQuery, AlarmLevel, AlarmType, AlarmStatus } from '@/types/alarm'

/** 告警列表页数据 */
export function useAlarmList() {
  const alarmStore = useAlarmStore()
  const selected = ref<AlarmEvent[]>([])
  const levelFilter = ref<AlarmLevel | ''>('')
  const typeFilter = ref<AlarmType | ''>('')
  const statusFilter = ref<AlarmStatus | ''>('')
  const search = ref('')
  const dateRange = ref<[string, string] | null>(null)

  const filteredAlarms = computed(() => {
    let list = alarmStore.alarms
    if (levelFilter.value) list = list.filter(a => a.level === levelFilter.value)
    if (typeFilter.value) list = list.filter(a => a.type === typeFilter.value)
    if (statusFilter.value) list = list.filter(a => a.status === statusFilter.value)
    if (search.value) {
      const kw = search.value.toLowerCase()
      list = list.filter(a => a.description.toLowerCase().includes(kw) || (a.deviceName || '').toLowerCase().includes(kw))
    }
    return list
  })

  function applyFilters() {
    const q: AlarmQuery = {
      level: levelFilter.value || undefined,
      type: typeFilter.value || undefined,
      status: statusFilter.value || undefined,
      keyword: search.value || undefined
    } as AlarmQuery
    if (dateRange.value) {
      q.startTime = dateRange.value[0]
      q.endTime = dateRange.value[1]
    }
    alarmStore.fetchAlarms(q)
  }

  async function batchConfirm() {
    if (!selected.value.length) return
    const ids = selected.value.map(a => a.id)
    const ok = await alarmStore.batchConfirm(ids)
    if (ok) selected.value = []
  }

  async function batchFalseAlarm() {
    if (!selected.value.length) return
    const ids = selected.value.map(a => a.id)
    const ok = await alarmStore.batchFalseAlarm(ids)
    if (ok) selected.value = []
  }

  onMounted(() => {
    alarmStore.fetchAlarms()
    alarmStore.fetchStats()
    alarmStore.fetchUnhandledCount()
  })

  return {
    alarmStore,
    selected,
    levelFilter,
    typeFilter,
    statusFilter,
    search,
    dateRange,
    filteredAlarms,
    applyFilters,
    batchConfirm,
    batchFalseAlarm
  }
}

/** 告警实时推送 */
export function useAlarmRealtime() {
  const alarmStore = useAlarmStore()
  const { connected, subscribe } = useWebSocket('/ws/alarms')

  let unsubAlarm: (() => void) | null = null

  onMounted(() => {
    unsubAlarm = subscribe('alarm', (data: any) => {
      if (data) {
        alarmStore.pushRealtimeAlarm(data as AlarmEvent)
      }
    })
  })

  onUnmounted(() => unsubAlarm?.())

  return {
    connected,
    realtimeAlarms: alarmStore.realtimeAlarms,
    unhandledCount: computed(() => alarmStore.unhandledCount)
  }
}

/** 告警标签辅助 */
export function useAlarmLabels() {
  function levelTagType(level: AlarmLevel) {
    const map: Record<AlarmLevel, string> = {
      critical: 'danger',
      high: 'warning',
      medium: '',
      low: 'info'
    }
    return map[level] as any
  }

  function levelLabel(level: AlarmLevel) {
    const map: Record<AlarmLevel, string> = {
      critical: '严重',
      high: '高',
      medium: '中',
      low: '低'
    }
    return map[level]
  }

  function levelIcon(level: AlarmLevel) {
    const map: Record<AlarmLevel, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢'
    }
    return map[level]
  }

  function statusLabel(status: AlarmStatus) {
    const map: Record<AlarmStatus, string> = {
      unhandled: '未处理',
      confirmed: '已确认',
      false_alarm: '误报',
      forwarded: '已转发',
      auto_resolved: '自动解决'
    }
    return map[status] || status
  }

  function typeLabel(type: AlarmType) {
    const map: Record<AlarmType, string> = {
      intrusion: '入侵检测',
      fire: '烟火检测',
      loitering: '徘徊检测',
      helmet: '安全帽检测',
      violence: '打架检测',
      fall: '倒地检测',
      gathering: '聚集检测',
      illegal_parking: '违停检测',
      wrong_way: '逆行检测',
      other: '其他'
    }
    return map[type] || type
  }

  return { levelTagType, levelLabel, levelIcon, statusLabel, typeLabel }
}
