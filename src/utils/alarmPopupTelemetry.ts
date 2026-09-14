/**
 * @file alarmPopupTelemetry.ts
 * @brief 告警弹窗端到端埋点 (P3 轮 / §6.2 W-7 收口)
 * @description 纯日志埋点: 记录弹窗渲染 (show) / 处置确认 (dispose-confirm) /
 *              弹窗关闭 (close) 三个时点, 输出可 grep 的 `[ALARM_POPUP_E2E]` 控制台日志,
 *              并挂载 window.__alarmPopupTelemetry 供真机 E2E 采集 (dump/summary/clear)。
 *              不改变任何业务语义 (无网络请求、无状态干预), 采集失败静默。
 *
 *              用途: 补齐 N-7「可检出→弹窗」前端段实采 — 与后端 [ALARM_E2E]
 *              日志按 alarm id 关联, 计算 created→弹窗可见延迟 与 弹窗确认时延。
 */

// ── 类型定义 ──

/** 埋点阶段 */
export type PopupTelemetryPhase = 'show' | 'dispose-confirm' | 'close'

/** 单条弹窗埋点记录 */
export interface AlarmPopupTelemetryRecord {
  /** 自增序号 */
  seq: number
  /** 阶段 */
  phase: PopupTelemetryPhase
  /** 告警 id */
  alarmId: string
  /** 告警类型 */
  type: string
  /** 通道 id */
  channelId: string
  /** 告警等级 */
  level: string
  /** 本时点时间戳 (ms, 前端 Date.now) */
  tsMs: number
  /** 告警创建时间 (ms, 由 createdAt 解析; 无效为 0) */
  createdMs: number
  /** created → 本时点延迟 (ms; createdMs 无效为 undefined) */
  createdLagMs?: number
  /** show 时点 → 本时点延迟 (ms; 仅 dispose-confirm/close 有) */
  sinceShowMs?: number
  /** show → close 驻留时长 (ms; 仅 close 有) */
  dwellMs?: number
  /** 处置类型 (仅 dispose-confirm) */
  disposeType?: string
  /** 处置提交结果 (仅 dispose-confirm) */
  ok?: boolean
}

// ── 采集器 ──

/** 滚动缓冲上限 */
const MAX_RECORDS = 200
const records: AlarmPopupTelemetryRecord[] = []
let seq = 0
/** 最近一次 show 锚点 (供 dispose/close 计算相对时延) */
let activeShow: { alarmId: string; tsMs: number } | null = null
/** 当前弹窗内已确认处置的告警 id 集合 (close 时判定 disposed) */
const disposedIds = new Set<string>()

/** 解析告警 createdAt (ISO 字符串) → ms; 无效返回 0 */
function parseCreatedMs(createdAt: unknown): number {
  if (typeof createdAt !== 'string' || !createdAt) return 0
  const t = Date.parse(createdAt)
  return Number.isFinite(t) ? t : 0
}

/** 记录一条埋点 (压入缓冲 + 输出 [ALARM_POPUP_E2E] 日志); 异常静默不影响业务 */
function push(rec: Omit<AlarmPopupTelemetryRecord, 'seq'>) {
  try {
    const full: AlarmPopupTelemetryRecord = { seq: ++seq, ...rec }
    records.push(full)
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS)
    // 单行可 grep 日志 (与后端 [ALARM_E2E] 同链: 按 alarmId 关联)
    const parts = [
      `seq=${full.seq}`,
      `phase=${full.phase}`,
      `id=${full.alarmId}`,
      `type=${full.type}`,
      `ch=${full.channelId}`,
      `level=${full.level}`,
    ]
    if (full.createdLagMs !== undefined) parts.push(`created_lag_ms=${full.createdLagMs}`)
    if (full.sinceShowMs !== undefined) parts.push(`since_show_ms=${full.sinceShowMs}`)
    if (full.dwellMs !== undefined) parts.push(`dwell_ms=${full.dwellMs}`)
    if (full.disposeType !== undefined) parts.push(`dispose_type=${full.disposeType}`)
    if (full.ok !== undefined) parts.push(`ok=${full.ok}`)
    console.log(`[ALARM_POPUP_E2E] ${parts.join(' ')}`)
  } catch {
    /* 埋点失败静默 */
  }
}

/** 极简告警视图 (仅取埋点所需字段, 兼容 undefined) */
interface AlarmLike {
  id?: unknown
  type?: unknown
  channelId?: unknown
  level?: unknown
  createdAt?: unknown
}

function pick(alarm: AlarmLike | null | undefined) {
  return {
    alarmId: String(alarm?.id ?? ''),
    type: String(alarm?.type ?? ''),
    channelId: String(alarm?.channelId ?? ''),
    level: String(alarm?.level ?? ''),
    createdMs: parseCreatedMs(alarm?.createdAt),
  }
}

/**
 * 弹窗渲染埋点 — 在 popupVisible 变为 true 时调用 (弹窗可见即触发)
 * @param alarm 当前弹窗告警 (AlarmEvent)
 */
export function trackPopupShow(alarm: AlarmLike | null | undefined) {
  const p = pick(alarm)
  const tsMs = Date.now()
  activeShow = p.alarmId ? { alarmId: p.alarmId, tsMs } : null
  push({
    phase: 'show',
    ...p,
    tsMs,
    createdLagMs: p.createdMs > 0 ? tsMs - p.createdMs : undefined,
  })
}

/**
 * 处置确认埋点 — 在 confirmDispose 的 handleAlarmAction 返回后调用
 * @param alarm 当前弹窗告警
 * @param disposeType 处置类型 (false_alarm/confirmed/...)
 * @param ok 后端处置提交结果
 */
export function trackPopupDispose(
  alarm: AlarmLike | null | undefined,
  disposeType: string,
  ok: boolean,
) {
  const p = pick(alarm)
  const tsMs = Date.now()
  if (ok && p.alarmId) disposedIds.add(p.alarmId)
  push({
    phase: 'dispose-confirm',
    ...p,
    tsMs,
    sinceShowMs: activeShow && activeShow.alarmId === p.alarmId ? tsMs - activeShow.tsMs : undefined,
    disposeType,
    ok,
  })
}

/**
 * 弹窗关闭埋点 — 在 popupVisible 变为 false 时调用
 */
export function trackPopupClose() {
  const tsMs = Date.now()
  const anchor = activeShow
  activeShow = null
  const alarmId = anchor?.alarmId ?? ''
  push({
    phase: 'close',
    alarmId,
    type: '',
    channelId: '',
    level: '',
    tsMs,
    createdMs: 0,
    sinceShowMs: anchor ? tsMs - anchor.tsMs : undefined,
    dwellMs: anchor ? tsMs - anchor.tsMs : undefined,
  })
  if (alarmId) disposedIds.delete(alarmId)
}

// ── 调试/采集钩子 (只读, 不干预业务) ──

if (typeof window !== 'undefined') {
  ;(window as any).__alarmPopupTelemetry = {
    /** 全量记录快照 */
    dump: (): AlarmPopupTelemetryRecord[] => [...records],
    /** 按阶段计数 + 关键分位 (created→show 延迟) */
    summary: () => {
      const byPhase: Record<string, number> = {}
      const showLags: number[] = []
      for (const r of records) {
        byPhase[r.phase] = (byPhase[r.phase] || 0) + 1
        if (r.phase === 'show' && r.createdLagMs !== undefined) showLags.push(r.createdLagMs)
      }
      showLags.sort((a, b) => a - b)
      const q = (p: number) =>
        showLags.length ? showLags[Math.min(showLags.length - 1, Math.floor(p * showLags.length))] : null
      return {
        total: records.length,
        byPhase,
        createdToShowMs: showLags.length
          ? { n: showLags.length, p50: q(0.5), p95: q(0.95), max: showLags[showLags.length - 1] }
          : null,
        disposedIds: [...disposedIds],
      }
    },
    /** 清空缓冲 */
    clear: () => {
      records.length = 0
      seq = 0
      activeShow = null
      disposedIds.clear()
    },
  }
}
