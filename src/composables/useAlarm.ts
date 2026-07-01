/**
 * 华盾AI智能视频盒子 v7.0 - 告警操作 Composable
 * composables/useAlarm.ts — 封装告警常用操作逻辑
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAlarmStore } from '@/stores/alarm'
import { useWebSocket } from '@/composables/useWebSocket'
import type { AlarmEvent, AlarmQuery, AlarmLevel, AlarmType, AlarmStatus } from '@/types/alarm'
// [v6.2 2026-06-21] AlarmType 联合扩到 70+ 后, typeLabel 需要从 ALARM_TYPE_CN 兑底查中文
import { ALARM_TYPE_CN } from '@/types/alarm'

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
  // [v6.2 2026-06-21] AlarmLevel 扩到 5 级 (含 'info'), 对标大华 1 严重 / 2 一般 / 3 轻微 + 状态 / 提示
  //   使用 Partial<Record> + 默认值兑底, 避免联合类型扩位时要补 5 个字段
  function levelTagType(level: AlarmLevel): string {
    const map: Partial<Record<AlarmLevel, string>> = {
      critical: 'danger',
      high: 'warning',
      medium: '',
      low: 'info',
      info: 'info'
    }
    return map[level] ?? 'info'
  }

  function levelLabel(level: AlarmLevel): string {
    const map: Partial<Record<AlarmLevel, string>> = {
      critical: '严重',
      high: '高',
      medium: '中',
      low: '低',
      info: '提示'
    }
    return map[level] ?? level
  }

  function levelIcon(level: AlarmLevel): string {
    const map: Partial<Record<AlarmLevel, string>> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
      info: '⚪'
    }
    return map[level] ?? '⚪'
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

  // [v6.2 2026-06-21] AlarmType 扩到 70+ 后, typeLabel 不可能枚举完, 改为告警分类中文表 ALARM_TYPE_CN 兑底
  //   保留重点告警的独中文文案 (与 alibi/3rd-party 集成), 未列出的返回 ALARM_TYPE_CN[type] 或 type 本身
  function typeLabel(type: AlarmType): string {
    const map: Partial<Record<AlarmType, string>> = {
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
    if (map[type]) return map[type]!
    // 兑底: 从 alarm.ts 的 ALARM_TYPE_CN 查
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cn = (ALARM_TYPE_CN as any)[type]
    return typeof cn === 'string' ? cn : (type as string)
  }

  return { levelTagType, levelLabel, levelIcon, statusLabel, typeLabel }
}
