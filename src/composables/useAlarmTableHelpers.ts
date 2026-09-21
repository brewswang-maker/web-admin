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
// [FIX dev-col-ip 2026-09-19] 占位链/设备列治理补依赖: devNameOf/parentDevOfChannel/devChannelsOf/
//   baseChannelId 目录反查 + alarmChannelIdOf 真通道码解析 (监控点序号链)
import { resolveAlarmDeviceName, isNumericId, chNameOf, devNameOf, parentDevOfChannel, devChannelsOf, baseChannelId, alarmChannelIdOf } from '@/composables/useAlarmDeviceLabel'

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
    // [FIX status-cn-complete 2026-09-21] 场景页/态势屏共用本表, 补 new/pending
    //   (落库初始态/详情 fallback, 场景事件列表原样裸显英文) + forwarded
    new: '待处理', pending: '待处理', forwarded: '已转发',
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
    // [FIX status-cn-complete 2026-09-21] 补 new/pending/forwarded (同 statusLabel)
    new: 'danger', pending: 'danger', forwarded: 'primary',
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
    // [FIX status-cn-complete 2026-09-21] VLM 误报建议 (未自动撤警) — 场景页原样裸显
    false_alarm_suggested: '疑似误报',
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
    // [FIX status-cn-complete 2026-09-21] 同 reviewLabel 补 false_alarm_suggested
    false_alarm_suggested: 'warning',
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
// [FIX dev-col-ip 2026-09-19 用户「越改越差」二次治理] 「设备」列语义纯净化 (设备级标识):
//   撤销 channelName 优先传入 (原实现把通道名当设备名直显 = 两列完全重复的传送门, 真机
//   摄像头1/Camera 02 行 设备列=监控点列); 通道名泄漏 (值等于通道目录名/后端「未知设备」
//   占位) 由 resolveAlarmDeviceName 内统一拦截; 反查链: 设备名可读 → 设备 IP → 父设备链
//   → 通道名可读, 全不中 '-'; 设备列永不回落通道名, 与监控点列零重复。
export function alarmDevLabel(a: Pick<AlarmEvent, 'deviceName' | 'deviceId' | 'channelId'> & { channelName?: string }): string {
  return resolveAlarmDeviceName(a.deviceName || '', a.deviceId, a.channelId) || '-'
}

// 通道标签 [chan-col 2026-09-11]: 可读 channelName 直接用; 空名/纯数字形态
//   (20 位国标码 / 截断 hash) → 目录反查通道名, 反查不中回落「监控点{channelId}」占位
//   (任务书口径: 无名称时回落占位, 不裸显数字也不吞成 '-')
//   [FIX channel-monitor-point 2026-09-17] 对标海康术语统一"通道"→"监控点":
//   占位词改为「监控点」— 本函数为告警列表/场景事件页显示值 SSOT, 一处改全平台生效;
//   目录命中时显示的 channelName (设备侧命名如「...通道01」) 属数据内容不改。
//   [FIX mon-point-name 2026-09-17] 监控点列显示设备名修复 (海康口径: 监控点=通道级):
//   多通道设备 (展厅 CH2 等) 告警顶层 channel_id_str=父设备码, 后端 channel_name 兜底
//   拼出的又是设备名 → 旧「可读名直用」把设备名当监控点名 (监控点列 ≈ 设备列, 用户投诉)。
//   真通道码在 metadata.channel_id_str (normalizeAlarmCore 已将 gov 首元素展开透传) —
//   改为目录反查优先: ① metadata.channel_id_str → ② 顶层 channelId (本身即通道码的告警)
//   → ③ 可读 channelName 直用 (目录未收录/未就绪兜底) → ④ 反查/占位。
export function alarmChLabel(a: Pick<AlarmEvent, 'channelId'> & { channelName?: string; metadata?: Record<string, unknown> }): string {
  // ① 通道码 (metadata 首元素) 目录反查: 用户配置的监控点级名优先
  // [FIX mon-name-enc 2026-09-19] 目录名过 isNumericId 二次校验: 通道注册未命名时
  //   目录 name=国标编码 (真机 192.168.0.100 AudioOut 通道 1312…137…001), 直用致
  //   监控点列裸显编码 (用户投诉「有的通道名称不对」残项)。编码形态视为无效继续
  //   下沉, 全不中回落「监控点{id}」占位 — 与 ③ 可读名校验同口径 (不裸显数字)。
  const mch = String(a.metadata?.channel_id_str ?? '').trim()
  if (mch) {
    const hit = chNameOf(mch)
    if (hit && !isNumericId(hit)) return hit
  }
  // ② 顶层 channelId 目录反查 (channelId 自身即通道码形态的告警)
  const topHit = chNameOf(a.channelId)
  if (topHit && !isNumericId(topHit)) return topHit
  // ③ 可读 channelName 直用 (目录未收录/未就绪 — 兼容插件 meta 通道级名;
  //    normalize 合成占位「监控点<id>」已由 isNumericId 拦截 [FIX mon-ph 2026-09-19])
  const cn = String(a.channelName ?? '').trim()
  if (cn && !isNumericId(cn)) return cn
  // ④ [FIX mon-point-seq 2026-09-19] 占位链重构 (原「监控点{20位编码}」长串裸显 — 真机
  //    137 未命名通道告警: 监控点13120000…, 用户「越改越差」投诉项):
  //    真通道码解析 (metadata 真码 / int32 hash 反投影 / 顶层) → 设备内监控点序号
  //    (多通道设备按通道码字典序位, 137 → 监控点 3) → 父设备可读名 → 尾4位短占位。
  const realId = alarmChannelIdOf(a)
  if (!realId) return '-'
  const pid = parentDevOfChannel(realId)
  if (pid) {
    const chs = devChannelsOf(pid)
    if (chs.length > 1) {
      const sorted = [...chs].sort((x, y) => (x.base < y.base ? -1 : x.base > y.base ? 1 : 0))
      const idx = sorted.findIndex(c => c.base === baseChannelId(realId))
      if (idx >= 0) return `监控点 ${idx + 1}`
    }
    const devHit = devNameOf(pid)
    if (devHit && !isNumericId(devHit)) return devHit
  }
  // ⑥ 末级兜底: 数字编码短占位 (不裸显 20 位长串); 非数字流名 (corridor_gate_01 等) 原值可读保留
  const base = baseChannelId(realId)
  return isNumericId(base) ? `监控点…${base.slice(-4)}` : base
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

/** [FIX ws-frame-classify 2026-09-18 三方对齐] WS 告警帧分类判定 (报警弹窗/告警列表/
 *  首页态势同口径, 单一实现防三处漂移): 状态同步帧 = 仅就地更新、绝不新增行。
 *  后端 BoxService.cpp alarm.new 推送体字段 (REST 无此字段, merged_into 仅在
 *  REST 响应侧): is_duplicate=true (短窗去重帧 — 不落库, DB 无行; unshift 即
 *  幽灵帧, REST 重拉整行消失) / backfill (clip 回填) / evidence_update (取证
 *  补位) / event_phase=update|end (事件生命周期; start=新事件)。注意 is_duplicate
 *  聚合帧可能携带 event_phase=start (聚合命中但事件未结束) → is_duplicate 必须
 *  独立判定, 不能只看 event_phase。 */
export function isAlarmStateSyncFrame(raw: unknown): boolean {
  const r = raw as Record<string, unknown> | null | undefined
  if (!r || typeof r !== 'object') return false
  return r.is_duplicate === true || r.backfill === true || r.evidence_update === true
    || r.event_phase === 'update' || r.event_phase === 'end'
}

/** [FIX ws-frame-classify 2026-09-18] 同上判定的归一化对象版 (camelCase):
 *  供 stores/alarm.pushRealtimeAlarm 对已 normalize 的条目做兜底判定 —
 *  normalizeAlarmPayload 补挂 isDuplicate/eventPhase 后语义与 raw 版严格等价。 */
export function isAlarmStateSyncNormalized(a: unknown): boolean {
  const n = a as Record<string, unknown> | null | undefined
  if (!n || typeof n !== 'object') return false
  return n.isDuplicate === true || n.backfill === true || n.evidenceUpdate === true
    || n.eventEnded === true || n.eventPhase === 'update' || n.eventPhase === 'end'
}

/** [C3 2026-09-18] 携带来源 marker (插件 personal_item meta.carry_source 出站):
 *  person_with_backpack 行区分「属性合成路线」与「检测路线」携带告警 —
 *  合成=弱证据 (受运动门/速度同向校验), 检测=真包检出; 两路误报率可分别
 *  评估 (分桶调参依据)。metadata 数组形态取首元素 (设备实况落库链),
 *  字符串形态尝试解析; 非携带类/无字段/非法值 → '' (不渲染 marker)。 */
export function carrySourceOf(row: any): string {
  const t = String(row?.type || row?.alarm_type || row?.alarmType || '')
  if (t !== 'person_with_backpack') return ''
  let m = row?.metadata
  if (typeof m === 'string') {
    try { m = JSON.parse(m) } catch { return '' }
  }
  const gov = Array.isArray(m) ? m[0] : m
  if (!gov || typeof gov !== 'object') return ''
  const v = String((gov as any).carry_source ?? (gov as any).carrySource ?? '')
  return v === 'attr_synth' || v === 'detect' ? v : ''
}

/** [FIX carry-display 2026-09-21] 携带类显示名细分 (9803 实锚: 真包检出
 *  类别 handbag 被 canonical 统一显示为「人员携带背包」→ 用户视"非背包"
 *  为误报, 类别语义丢失)。
 *  插件 meta.class_name_zh (C++ 端 bagClassZh SSOT) 优先 — 背包/斜挎包/
 *  手提包/单肩包/行李箱; 无 _zh 时按 class_name (英文 snake_case) 本地
 *  映射兜底; 均缺 → '' (调用方回退 canonical zh 名, 零副作用)。
 *  仅 person_with_backpack 生效 (三态中 unattended/abandoned 的物品细分
 *  由 description/meta 呈现, 不改)。metadata 读取模式同 carrySourceOf。 */
export function carriedItemLabel(row: any): string {
  const t = String(row?.type || row?.alarm_type || row?.alarmType || '')
  if (t !== 'person_with_backpack') return ''
  let m = row?.metadata
  if (typeof m === 'string') {
    try { m = JSON.parse(m) } catch { return '' }
  }
  const gov = Array.isArray(m) ? m[0] : m
  if (!gov || typeof gov !== 'object') return ''
  const zh = String((gov as any).class_name_zh ?? (gov as any).classNameZh ?? '')
  if (zh) return `人员携带${zh}`
  const en = String((gov as any).class_name ?? (gov as any).className ?? '')
  const map: Record<string, string> = {
    backpack: '背包',
    crossbody_bag: '斜挎包',
    handbag: '手提包',
    shoulder_bag: '单肩包',
    suitcase: '行李箱',
    other_bag: '随身物品',
  }
  return map[en] ? `人员携带${map[en]}` : ''
}
