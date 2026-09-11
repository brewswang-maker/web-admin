/**
 * @file useAlarmGroups.ts — 告警「所属分组」列共享反查 (单例)
 *
 * [场景页对齐 2026-09-11] AlarmsView.vue「所属分组」列口径:
 *   device_groups (安保区域, securityAreaApi.listAreas) → 行归属判定
 *   (resolved_channel_ids 精确 / device_ids 剥 _chN 后缀) → id→name 反查,
 *   未分组 '-'。模块级单例拉取一次全站共享, 场景页/面板直接消费。
 */
import { ref } from 'vue'
import { securityAreaApi } from '@/api/securityAreas'

export interface AlarmGroupItem { id: string; name: string; device_ids?: string[]; resolved_channel_ids?: string[] }

const groups = ref<AlarmGroupItem[]>([])
let started = false

/** 拉取安保区域分组 (单例; 失败静默 → 列显示 '-') */
export function ensureAlarmGroups(): void {
  if (started) return
  started = true
  ;(async () => {
    try {
      // [FIX 2026-09-06 同 AlarmsView] 正主 securityAreaApi (原 recordingHttp
      //   双重前缀恒 404 根修后的选择)
      const r = await securityAreaApi.listAreas()
      const data = (r.data?.data ?? r.data) as { items?: AlarmGroupItem[] } | undefined
      groups.value = data?.items ?? []
    } catch {
      groups.value = []
    }
  })()
}

/** 行归属判定: resolved_channel_ids 精确匹配 / device_ids 剥 _chN 后缀匹配 (同 AlarmsView groupHasAlarm) */
export function groupHasAlarm(g: AlarmGroupItem, a: any): boolean {
  const ch = String(a.channelId || '')
  if (ch && (g.resolved_channel_ids || []).includes(ch)) return true
  const dev = String(a.deviceId || '').replace(/_ch\d+$/, '')
  return !!dev && (g.device_ids || []).includes(dev)
}

/** 分组列渲染: id→name 反查, 未分组 '-' (同 AlarmsView groupNameOf) */
export function groupNameOf(row: any): string {
  if (groups.value.length === 0) return '-'
  const hit = groups.value.find((g) => groupHasAlarm(g, row))
  return hit?.name || '-'
}

/** 响应式分组列表 (筛选下拉等场景消费) */
export function alarmGroups() {
  ensureAlarmGroups()
  return groups
}
