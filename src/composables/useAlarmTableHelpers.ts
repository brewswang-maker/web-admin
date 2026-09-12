/**
 * @file useAlarmTableHelpers.ts — 告警列表展示口径 SSOT (共享 composable)
 *
 * [场景页对齐 2026-09-11] 六个业务场景事件列表 (perimeter / hotel-unattended /
 *   large-event / gas-station / school / screening) 统一对齐平台告警中心
 *   (AlarmsView.vue) 的字段集合与展示规范 — 列格式化/标签映射/时间格式/
 *   设备友好名全部以本模块单一定义为准, 场景页禁止再各自实现。
 *
 * 实现与 AlarmsView.vue 内联函数逐一同款 (severityLabel/statusLabel/
 * formatTime/getSnapshotUrl/alarmDevLabel/...); AlarmsView 作为规范基准
 * 本次不动, 后续可迁移为消费本模块达成单一文本源。
 */
import type { AlarmEvent } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'
import { resolveAlarmDeviceName, isNumericId } from '@/composables/useAlarmDeviceLabel'

// ── 归一化 + 旧字段兼容补丁 (与 AlarmsView.normalizeAlarm 同款) ──
// normalizeAlarmCore 产出 level/aiConclusion/confidence; AlarmsView 模板与筛选
// 仍消费旧字段 severity/aiAnalysis/aiConfidence — 场景页共享同一补丁,
// 保证级别/置信度/AI解释三列与基准取值完全一致。
export type AlarmRow = AlarmEvent & {
  severity?: string
  aiAnalysis?: string
  aiConfidence?: number
}
export function normalizeAlarmCompat(raw: any): AlarmRow {
  const norm = normalizeAlarmCore(raw)
  return {
    ...norm,
    // 兼容旧字段: severity 字符串 (等同 level), aiAnalysis 与 aiConclusion 同义
    severity: norm.level,
    aiAnalysis: norm.aiConclusion,
    aiConfidence: norm.confidence,
  }
}

// ── 严重等级中文映射 (同 AlarmsView SEVERITY_LABELS) ──
export const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '信息',
}

export function severityLabel(severity: string) {
  return SEVERITY_LABELS[severity] || severity
}

export function levelLabel(level: string) {
  return SEVERITY_LABELS[level] || level
}

export function levelTagType(level: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = { critical: 'danger', high: 'warning', medium: 'warning', low: 'success' }
  return map[level] || 'info'
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    unhandled: '未处理', handling: '处理中', handled: '已处理',
    confirmed: '已确认', false_alarm: '误报', ignored: '已忽略',
    // [P0-3] 工单流转状态
    acknowledged: '已确认收到', disposed: '处置中',
    escalated: '已升级', reassigned: '已转派',
    resolved: '已解决', closed: '已关闭',
    // [接警单号 2026-09-09] 弹窗研判判定历史值 (true_positive 新提交已改 confirmed)
    true_positive: '真实告警', unsure: '存疑', known: '已知事件',
  }
  return map[status] || status
}

export function statusTagType(status: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
    unhandled: 'danger', handling: 'warning', handled: 'success',
    confirmed: 'success', false_alarm: 'warning', ignored: 'info',
    // [P0-3] 工单流转状态
    acknowledged: 'primary', disposed: 'warning',
    escalated: 'danger', reassigned: 'info',
    resolved: 'success', closed: 'success',
    true_positive: 'success', unsure: 'warning', known: 'info',
  }
  return map[status] || 'info'
}

// [STAGE1 P0-1 2026-09-10] 复核状态显示 — 与 statusLabel 独立
export function reviewLabel(rs: string | undefined): string {
  const map: Record<string, string> = {
    none: '未复核',
    confirmed: '已确认',
    retracted: '已撤',
    false_alarm: '误报',
    unverified: 'VLM未决',
  }
  return map[rs || 'none'] || (rs || '未复核')
}

export function reviewTagType(rs: string | undefined): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
    none: 'info',
    confirmed: 'success',
    retracted: 'warning',
    false_alarm: 'warning',
    unverified: 'primary',
  }
  return map[rs || 'none'] || 'info'
}

export function reviewTooltip(row: any): string {
  const srcMap: Record<string, string> = {
    '': '未接入复核',
    retraction: 'AlarmRetractionService (已撤/已确认/未决)',
    vlm: 'VLM 研判 (alarm_events.metadata.ai_review.verdict)',
    feedback: '人工 false_alarm_feedback 表标注',
    vlm_confirmed: 'VLM 已确认',
  }
  // 兼容 REST snake_case 与已归一化 camelCase；空来源但已有复核状态时仍显示来源未知，
  // 避免 feedback 状态在 tooltip 中被误显示为"未接入复核"。
  const rawSource = String(row.reviewSource ?? row.review_source ?? '').trim()
  const src = srcMap[rawSource] || (rawSource || (row.reviewStatus && row.reviewStatus !== 'none' ? '复核来源未知' : '未接入复核'))
  const dueMs = Number(row.reviewSlaDueAt ?? row.review_sla_due_at ?? 0)
  const due = dueMs > 0 ? new Date(dueMs).toLocaleString() : '—'
  const remaining = Number(row.reviewSlaRemainingMin ?? row.review_sla_remaining_min ?? 0)
  return `来源: ${src}\nSLA 期限: ${due}\n剩余: ${Number.isFinite(remaining) ? remaining : 0} 分钟`
}

export function slaRemainingClass(min: number | undefined): string {
  if (min === undefined || min === null) return ''
  if (min < 0) return 'sla-overdue'
  if (min < 1) return 'sla-warning'
  return 'sla-ok'
}

export function slaRemainingText(row: any): string {
  const min = row.reviewSlaRemainingMin
  if (min === undefined || min === null || row.reviewSlaDueAt === 0) return '—'
  if (row.reviewStatus && row.reviewStatus !== 'none') return reviewLabel(row.reviewStatus)
  if (min < 0) return `超期 ${Math.abs(min)}分`
  if (min < 1) return '<1分'
  return `${min}分`
}

export function confidenceColor(c: number | undefined) {
  if (!c) return '#9CA3AF'
  if (c >= 0.9) return '#10B981'
  if (c >= 0.7) return '#F59E0B'
  return '#EF4444'
}

// §13 Fix L3: WeakMap 缓存 Math.round 结果, 避免模板里重复计算
const confCache = new WeakMap<object, number>()
export function confPct(row: any): number {
  let v = confCache.get(row)
  if (v === undefined) {
    v = Math.round((row?.aiConfidence ?? 0) * 100)
    confCache.set(row, v)
  }
  return v
}

const _timeCache = new Map<string, string>()
/** 时间列格式化 (同 AlarmsView formatTime: toLocaleString zh-CN + LRU 缓存) */
export function formatTime(isoString: string | undefined) {
  if (!isoString) return '-'
  let v = _timeCache.get(isoString)
  if (v !== undefined) return v
  try {
    v = new Date(isoString).toLocaleString('zh-CN')
  } catch {
    v = isoString
  }
  _timeCache.set(isoString, v)
  if (_timeCache.size > 2000) {
    const first = _timeCache.keys().next().value as string
    if (first) _timeCache.delete(first)
  }
  return v
}

// [FIX 2026-06-28] 人脸告警快照以 snapshot_base64 存在 metadata 中。
//   此函数在 snapshotUrl 为空时回退到 metadata.snapshot_base64 构造 data URL。
export function getSnapshotUrl(row: any): string {
  if (row.snapshotUrl) return row.snapshotUrl
  const b64 = row.metadata?.snapshot_base64
  if (!b64) return ''
  if (typeof b64 === 'string' && b64.startsWith('data:')) return b64
  const fmt = row.metadata?.snapshot_format || 'bmp'
  const mime = fmt === 'raw_bgr' ? 'image/bmp' : `image/${fmt}`
  const padded = String(b64).replace(/[^A-Za-z0-9+/=]/g, '')
  const fixed = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  return `data:${mime};base64,${fixed}`
}

// [FIX dev-name-num 2026-09-11] 设备标签: 空名/纯数字形态 (face 插件截断 hash 等历史数据)
//   → 目录反查设备/通道名, 反查不中兜底 '-' (不裸显 deviceId 数字串)
export function alarmDevLabel(a: Pick<AlarmEvent, 'deviceName' | 'deviceId' | 'channelId'> & { channelName?: string }): string {
  // deviceName 可读直接用; 数字形态/空 → channelName 兜底传入 (resolve 内部同形态拦截)
  return resolveAlarmDeviceName(a.deviceName || a.channelName || '', a.deviceId, a.channelId) || '-'
}

// 通道标签 [chan-col 2026-09-11]: 可读 channelName 直接用; 空名/纯数字形态
//   (20 位国标码 / 截断 hash) → 目录反查通道名, 反查不中回落「通道{channelId}」占位
//   (任务书口径: 无名称时回落占位, 不裸显数字也不吞成 '-')
export function alarmChLabel(a: Pick<AlarmEvent, 'channelId'> & { channelName?: string }): string {
  const cn = String(a.channelName ?? '').trim()
  if (cn && !isNumericId(cn)) return cn
  const resolved = resolveAlarmDeviceName('', '', a.channelId)
  if (resolved) return resolved
  const id = String(a.channelId ?? '').trim()
  return id ? `通道${id}` : '-'
}

/** [P0-10/13] 未完结生命周期 = 可处警态 (与 DisposeDialog.EDITABLE_STATUSES 对齐) */
export function isDisposeEditable(row: any): boolean {
  return ['unhandled', 'acknowledged', 'escalated', 'reassigned', 'handling'].includes(String(row.status))
}

/** [UX 2026-08-31] 整行点击 → 详情弹窗; 排除行内交互元素 (按钮/下拉/图片预览/链接/选择框) */
export function isRowClickInteractive(event: Event): boolean {
  const target = event.target as HTMLElement | null
  return !!target?.closest('button, a, input, label, .el-dropdown, .el-switch, .el-checkbox, .el-image, .el-tag__close')
}

// [FIX-P1-1/P1-2 2026-09-12] 长窗聚合合并计数标签: 后端 aggregated_count > 1 时
//   返回 N (列表/详情 ×N 角标数据源, N>1 才展示); 缺省/非法/新告警(=1) → 1。
//   归一化已在 normalizeAlarmCore 完成 (camelCase), snake_case 兼容为容错双源。
export function mergedCountOf(row: any): number {
  const raw = row?.aggregatedCount ?? row?.aggregated_count ?? 1
  const n = Number(raw)
  return Number.isFinite(n) && n > 1 ? n : 1
}

// [chan-col 2026-09-11 完成锚点] alarmChLabel 占位口径批次 · 部署产物 entry=index-wS8-Hc--kp.js tgz md5=57e4f6f0d728c29eeca8f2a8f6dd629b
