/**
 * useMetricDetail — 态势大屏关键指标下钻 (Task-99f)
 * composables/useMetricDetail.ts — 指标详情抽屉的状态中枢
 *
 * 设计要点:
 * - 模块级单例: 抽屉全局唯一 (SituationScreen 挂载单个 MetricDetailDrawer),
 *   openMetric(key, ctx?) 打开并按「实时值 / 趋势 / 明细」三段加载。
 * - 竞态防护: 模块级 loadSeq + 段级 sectionSeq 双令牌 —— openMetric/closeMetric
 *   递增 loadSeq 作废全部在途请求; retrySection 只递增目标段 sectionSeq,
 *   其余段在途请求保持有效 (旧响应不落地、loading 不悬挂)。
 * - 段级容错: 三段各自 loading/error 互不阻塞; 失败段可单段重试; 无历史
 *   数据的指标显示空态占位, 不造假。
 * - 深链契约: 告警单条 → /alarms?alarm_type&level&start_ms&end_ms (±5min 窗口);
 *   设备单条 → /devices/:id; 算法行内展开 (前往 /algo-config); Agent 行纯展示。
 * - 数据口径 (真实数据):
 *   算法启用总数 = GET /algorithms/all 的 enabled 计数 (替代后端 overview
 *   totalAgents 硬编码 4, 见计划 §3.1); 设备在线率趋势 = /stats/device-analytics
 *   (7 天日粒度, 0-100); 告警类趋势 = /situation/hourly-stats (今日 0..当前小时)。
 */
import { reactive } from 'vue'
import { i18n } from '@/i18n'
import algorithmsApi, { type AlgorithmInfo } from '@/api/algorithms'
import { situationApi, type SituationOverview, type SituationAgentStatus } from '@/api/situation'
import { alarmApi } from '@/api/alarm'
import { statsHttp } from '@/api/http'
import { normalizeAlarmCore, type AlarmEvent } from '@/types/alarm'

// ─────────────────────────────────────────────────────────
// 1. 类型定义 (9 项指标注册表, 计划 §一)
// ─────────────────────────────────────────────────────────

export type MetricKey =
  | 'securityScore'
  | 'totalAgents'
  | 'todayAlarms'
  | 'handleRate'
  | 'edgeCompute'
  | 'deviceStatus'
  | 'alarmDist'
  | 'alarmTrendSlot'
  | 'agentLoad'

export interface MetricCtx {
  /** alarmDist: 预筛级别 (critical/high/medium/low) */
  level?: string
  /** alarmTrendSlot: 点击数据点对应的时间窗 (epoch ms) */
  windowStartMs?: number
  windowEndMs?: number
  /** alarmTrendSlot: 数据点标签 (x 轴原值, 展示用) */
  windowLabel?: string
  /** agentLoad: 目标 Agent 名 */
  agentName?: string
}

export type MetricSection = 'live' | 'trend' | 'items'

export type CompositionAction =
  | { type: 'metric'; key: MetricKey; ctx?: MetricCtx }
  | { type: 'route'; to: string }

export interface CompositionRow {
  label: string
  value: string
  action?: CompositionAction
}

/** 明细行 (四形态; kind 决定 Drawer 渲染与点击行为) */
export type MetricItem =
  | { kind: 'alarm'; id: string; tsMs: number; level: string; alarmType: string; description: string; status: string; deviceName: string }
  | { kind: 'device'; id: string; name: string; online: boolean; type: string }
  | { kind: 'algo'; id: string; name: string; category: string; version: string; status: string; available: boolean; enabled: boolean; description: string; accuracy: number; fps: number; modelSource: string; alarmType: string }
  | { kind: 'agent'; name: string; status: string; calls: number; avgLatency: number }

export interface TrendData {
  labels: string[]
  values: number[]
  unit: string
  note: string
}

interface MetricDetailState {
  isOpen: boolean
  key: MetricKey | null
  ctx: MetricCtx
  title: string
  live: { value: string; subtitle: string } | null
  composition: CompositionRow[]
  trend: TrendData | null
  items: MetricItem[]
  itemsNote: string
  loading: Record<MetricSection, boolean>
  error: Record<MetricSection, string>
}

// ─────────────────────────────────────────────────────────
// 2. 模块级单例状态与竞态令牌
// ─────────────────────────────────────────────────────────

const state = reactive<MetricDetailState>({
  isOpen: false,
  key: null,
  ctx: {},
  title: '',
  live: null,
  composition: [],
  trend: null,
  items: [],
  itemsNote: '',
  loading: { live: false, trend: false, items: false },
  error: { live: '', trend: '', items: '' },
})

/** 全局代际令牌: openMetric/closeMetric 递增, 作废全部在途请求 */
let loadSeq = 0
/** 段级令牌: retrySection 只递增目标段, 旧同名段响应作废 */
const sectionSeq: Record<MetricSection, number> = { live: 0, trend: 0, items: 0 }

// ─────────────────────────────────────────────────────────
// 3. 工具函数 (i18n / 深链 / 算法提取, 计划 §2.3)
// ─────────────────────────────────────────────────────────

/** i18n 助手 (非组件上下文直取全局 t; 键为动态拼接, 走宽松转型) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mdt(key: string, named?: Record<string, unknown>): string {
  const t = (i18n.global as any).t as (k: string, n?: Record<string, unknown>) => string
  return named ? t(key, named) : t(key)
}

/** 告警深链时间窗半径 ±5min */
export const ALARM_LINK_WINDOW_MS = 300000

/** 告警深链: /alarms?alarm_type=&level=&start_ms=&end_ms= (status 为客户端口径, 可选) */
export function alarmsDeepLink(opts: { tsMs?: number; level?: string; alarmType?: string; status?: string }): string {
  const q = new URLSearchParams()
  if (opts.alarmType) q.set('alarm_type', opts.alarmType)
  if (opts.level) q.set('level', opts.level)
  if (opts.status) q.set('status', opts.status)
  if (typeof opts.tsMs === 'number' && Number.isFinite(opts.tsMs)) {
    q.set('start_ms', String(opts.tsMs - ALARM_LINK_WINDOW_MS))
    q.set('end_ms', String(opts.tsMs + ALARM_LINK_WINDOW_MS))
  }
  return `/alarms?${q.toString()}`
}

/** 设备深链: /devices/:id (既有路由 name=DeviceDetail) */
export function deviceDeepLink(id: string): string {
  return `/devices/${encodeURIComponent(String(id || ''))}`
}

/** 算法分类中文映射 (对齐后端 catFromString 15 类 + custom 兜底) */
export const ALGO_CATEGORY_ZH: Record<string, string> = {
  perimeter: '周界防护',
  object_detection: '目标检测',
  behavior_analysis: '行为分析',
  fire_safety: '消防安全',
  production_safety: '安全生产',
  traffic: '交通',
  campus_safety: '校园安全',
  tracking: '目标跟踪',
  attribute: '属性识别',
  image_enhance: '图像增强',
  image_quality: '图像质量',
  metric_stat: '指标统计',
  ocr_text: 'OCR 文字识别',
  animal: '动物识别',
  open_vocab_detection: '开放词汇检测',
  custom: '自定义',
}

export function algoCategoryZh(cat: string): string {
  const key = String(cat || '').toLowerCase()
  return ALGO_CATEGORY_ZH[key] ?? (key || '-')
}

/** 算法清单兼容提取 (与 EventTestDrawer L289 口径一致: algorithms/items 双写) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractAlgorithmList(resp: any): AlgorithmInfo[] {
  const raw = resp?.data ?? resp // AxiosResponse.data → ApiResponse
  const list = raw?.data?.algorithms ?? raw?.data?.items ?? raw?.algorithms ?? raw?.items ?? []
  return Array.isArray(list) ? list : []
}

export interface AlgoStats {
  enabled: number
  total: number
  byStatus: Record<string, number>
  list: AlgorithmInfo[]
}

/** 算法统计: enabled 计数 (a.enabled !== false) + byStatus 分组 */
export function computeAlgoStats(list: AlgorithmInfo[]): AlgoStats {
  const byStatus: Record<string, number> = {}
  for (const a of list) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = String((a as any).status ?? 'normal') || 'normal'
    byStatus[st] = (byStatus[st] ?? 0) + 1
  }
  return {
    enabled: list.filter((a) => (a as unknown as { enabled?: boolean }).enabled !== false).length,
    total: list.length,
    byStatus,
    list,
  }
}

/** 百分比格式化 (默认 1 位小数) */
function pct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '--'
  return `${(Math.round(v * 10) / 10).toFixed(digits)}%`
}

function todayStartMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const LEVEL_ORDER = ['critical', 'high', 'medium', 'low'] as const

/** ApiResponse 解包 (makeOkResponse 包装端点; 与 AlarmsView L1417 口径一致) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapData<T>(resp: any): T | null {
  const d = resp?.data?.data ?? resp?.data
  return d === undefined ? null : (d as T)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAlarmList(resp: any): { list: any[]; total: number } {
  const d = resp?.data?.data ?? resp?.data
  if (!d) return { list: [], total: 0 }
  if (Array.isArray(d.alarms)) return { list: d.alarms, total: d.total ?? d.alarms.length }
  if (Array.isArray(d.items)) return { list: d.items, total: d.total ?? d.items.length }
  if (Array.isArray(d)) return { list: d, total: d.length }
  return { list: [], total: 0 }
}

function toAlarmItem(a: AlarmEvent): MetricItem {
  return {
    kind: 'alarm',
    id: String(a.id ?? ''),
    tsMs: new Date(a.createdAt).getTime() || Date.now(),
    level: String(a.level || 'low'),
    alarmType: String(a.type || ''),
    description: String(a.description || a.type || ''),
    status: String(a.status || 'unhandled'),
    deviceName: String(a.deviceName || a.channelName || ''),
  }
}

function levelLabel(level: string): string {
  return mdt(`metricDetail.level.${level || 'low'}`)
}

// ─────────────────────────────────────────────────────────
// 4. 共享数据拉取 (openMetric 内重置缓存, 一次点击只拉一份)
// ─────────────────────────────────────────────────────────

/** 今日告警拉取上限 (趋势分桶 + 明细共用; 防御性上限) */
export const TODAY_LIST_PAGE_SIZE = 500

let ovPromise: Promise<SituationOverview | null> | null = null
let algoStatsPromise: Promise<AlgoStats | null> | null = null
let agentsPromise: Promise<SituationAgentStatus[]> | null = null
let hourlyPromise: Promise<Array<{ hour: number; alarmCount: number }>> | null = null
let todayListPromise: Promise<AlarmEvent[]> | null = null
let windowListPromise: Promise<AlarmEvent[]> | null = null
let deviceStatusPromise: Promise<Array<{ id: string; name: string; online: boolean; type: string }>> | null = null
let deviceTrendPromise: Promise<{ labels: string[]; values: number[] } | null> | null = null

function resetSharedCaches(): void {
  ovPromise = null
  algoStatsPromise = null
  agentsPromise = null
  hourlyPromise = null
  todayListPromise = null
  windowListPromise = null
  deviceStatusPromise = null
  deviceTrendPromise = null
}

function getOverview(): Promise<SituationOverview | null> {
  if (!ovPromise) {
    ovPromise = (async () => {
      try {
        const r = await situationApi.getOverview()
        const d = unwrapData<SituationOverview>(r)
        return d && typeof d === 'object' ? d : null
      } catch {
        ovPromise = null // [Task-99f] 失败不缓存: 段级重试可真正重拉
        return null
      }
    })()
  }
  return ovPromise
}

function getAlgoStats(): Promise<AlgoStats | null> {
  if (!algoStatsPromise) {
    algoStatsPromise = (async () => {
      try {
        const res = await algorithmsApi.listAll()
        return computeAlgoStats(extractAlgorithmList(res))
      } catch {
        algoStatsPromise = null // [Task-99f] 失败不缓存: 段级重试可真正重拉
        return null
      }
    })()
  }
  return algoStatsPromise
}

function getAgents(): Promise<SituationAgentStatus[]> {
  if (!agentsPromise) {
    const p = (async () => {
      const r = await situationApi.getAgentStatuses()
      const d = unwrapData<unknown>(r)
      const list = Array.isArray(d) ? d : (d as { agents?: unknown[] } | null)?.agents ?? []
      return list as SituationAgentStatus[]
    })()
    agentsPromise = p
    p.catch(() => { if (agentsPromise === p) agentsPromise = null })
  }
  return agentsPromise
}

function getHourly(): Promise<Array<{ hour: number; alarmCount: number }>> {
  if (!hourlyPromise) {
    const p = (async () => {
      const r = await situationApi.getHourlyStats()
      const d = unwrapData<Array<{ hour: number; alarmCount: number }>>(r)
      return Array.isArray(d) ? d : []
    })()
    hourlyPromise = p
    p.catch(() => { if (hourlyPromise === p) hourlyPromise = null })
  }
  return hourlyPromise
}

function getTodayAlarms(): Promise<AlarmEvent[]> {
  if (!todayListPromise) {
    const p = (async () => {
      const r = await alarmApi.getList({
        page: 1,
        pageSize: TODAY_LIST_PAGE_SIZE,
        start_ms: todayStartMs(),
        include_merged: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const { list } = extractAlarmList(r)
      return list.map(normalizeAlarmCore)
    })()
    todayListPromise = p
    p.catch(() => { if (todayListPromise === p) todayListPromise = null })
  }
  return todayListPromise
}

function getWindowAlarms(): Promise<AlarmEvent[]> {
  if (!windowListPromise) {
    const p = (async () => {
      const { windowStartMs, windowEndMs } = state.ctx
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = { page: 1, pageSize: TODAY_LIST_PAGE_SIZE, include_merged: 1 }
      if (typeof windowStartMs === 'number' && Number.isFinite(windowStartMs)) params.start_ms = windowStartMs
      if (typeof windowEndMs === 'number' && Number.isFinite(windowEndMs)) params.end_ms = windowEndMs
      const r = await alarmApi.getList(params)
      const { list } = extractAlarmList(r)
      return list.map(normalizeAlarmCore)
    })()
    windowListPromise = p
    p.catch(() => { if (windowListPromise === p) windowListPromise = null })
  }
  return windowListPromise
}

function getDeviceStatus(): Promise<Array<{ id: string; name: string; online: boolean; type: string }>> {
  if (!deviceStatusPromise) {
    const p = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: any = await statsHttp.get('/device-status')
      const d = unwrapData<{ devices?: unknown[] } | unknown[]>(r)
      const list = Array.isArray(d) ? d : (d?.devices ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (list as any[]).map((x) => ({
        id: String(x?.id ?? ''),
        name: String(x?.name ?? x?.id ?? ''),
        online: x?.online === true,
        type: String(x?.type ?? ''),
      }))
    })()
    deviceStatusPromise = p
    p.catch(() => { if (deviceStatusPromise === p) deviceStatusPromise = null })
  }
  return deviceStatusPromise
}

function getDeviceTrend(): Promise<{ labels: string[]; values: number[] } | null> {
  if (!deviceTrendPromise) {
    const p = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: any = await statsHttp.get('/device-analytics')
      const d = unwrapData<{ onlineRateTrend?: Array<{ date?: string; rate?: number }> }>(r)
      const rows = Array.isArray(d?.onlineRateTrend) ? d!.onlineRateTrend! : []
      if (!rows.length) return null
      return {
        labels: rows.map((x) => String(x?.date ?? '').slice(5)),
        values: rows.map((x) => Number(x?.rate) || 0),
      }
    })()
    deviceTrendPromise = p
    p.catch(() => { if (deviceTrendPromise === p) deviceTrendPromise = null })
  }
  return deviceTrendPromise
}

// ─────────────────────────────────────────────────────────
// 5. 三段构建器 (纯数据拉取; 写入 state 由 runSection 统一在 seq 校验后执行)
// ─────────────────────────────────────────────────────────

async function buildLive(key: MetricKey): Promise<{ live: { value: string; subtitle: string }; composition: CompositionRow[] }> {
  switch (key) {
    case 'securityScore': {
      const ov = await getOverview()
      if (!ov) throw new Error('overview')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ds: any = ov.deviceStats || {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const as: any = ov.alarmStats || {}
      const online = Number(ds.online ?? 0)
      const total = Number(ds.total ?? 0)
      const offline = Math.max(0, total - online)
      const onlineRate = Number(ds.onlineRate ?? (total > 0 ? online / total : 0))
      const critical = Number(as.critical ?? 0)
      return {
        live: {
          value: String(Math.round(Number(ov.securityScore?.overall ?? 0))),
          subtitle: mdt('metricDetail.live.scoreSub', { rate: pct(onlineRate * 100), critical }),
        },
        composition: [
          { label: mdt('metricDetail.comp.onlineRate'), value: pct(onlineRate * 100), action: { type: 'metric', key: 'deviceStatus' } },
          { label: mdt('metricDetail.comp.criticalAlarms'), value: String(critical), action: { type: 'metric', key: 'alarmDist', ctx: { level: 'critical' } } },
          { label: mdt('metricDetail.comp.offlineDevices'), value: String(offline), action: { type: 'metric', key: 'deviceStatus' } },
        ],
      }
    }
    case 'totalAgents': {
      const stats = await getAlgoStats()
      if (!stats) throw new Error('algorithms')
      return {
        live: {
          value: String(stats.enabled),
          subtitle: mdt('metricDetail.live.enabledSub', { enabled: stats.enabled, total: stats.total }),
        },
        composition: (['normal', 'degraded', 'stub', 'routed'] as const)
          .filter((st) => (stats.byStatus[st] ?? 0) > 0)
          .map((st) => ({
            label: mdt(`metricDetail.algo.status${st.charAt(0).toUpperCase()}${st.slice(1)}`),
            value: String(stats.byStatus[st] ?? 0),
          })),
      }
    }
    case 'todayAlarms': {
      const ov = await getOverview()
      if (!ov) throw new Error('overview')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const as: any = ov.alarmStats || {}
      return {
        live: { value: String(Number(as.todayTotal ?? 0)), subtitle: mdt('metricDetail.live.today') },
        composition: LEVEL_ORDER.map((lv) => ({
          label: levelLabel(lv),
          value: String(Number(as[lv] ?? 0)),
          action: { type: 'metric' as const, key: 'alarmDist' as const, ctx: { level: lv } },
        })),
      }
    }
    case 'handleRate': {
      const ov = await getOverview()
      if (!ov) throw new Error('overview')
      const alarms = await getTodayAlarms()
      const handled = alarms.filter((a) => String(a.status) !== 'unhandled').length
      const unhandled = alarms.length - handled
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todayTotal = Number((ov.alarmStats as any)?.todayTotal ?? alarms.length)
      const total = Math.max(alarms.length, todayTotal)
      return {
        live: {
          value: pct(Number(ov.handleRate ?? 0)),
          subtitle: mdt('metricDetail.live.handleSub', { handled, total }),
        },
        composition: [
          { label: mdt('metricDetail.comp.handled'), value: String(handled) },
          { label: mdt('metricDetail.comp.unhandled'), value: String(Math.max(0, total - handled) || unhandled) },
        ],
      }
    }
    case 'edgeCompute': {
      const agents = await getAgents()
      const calls = agents.reduce((s, a) => s + (Number(a.calls) || 0), 0)
      return {
        live: { value: String(calls), subtitle: mdt('metricDetail.live.agentsCount', { n: agents.length }) },
        composition: agents.map((a) => ({
          label: String(a.name || '-'),
          value: String(Number(a.calls) || 0),
          action: { type: 'metric' as const, key: 'agentLoad' as const, ctx: { agentName: String(a.name || '') } },
        })),
      }
    }
    case 'deviceStatus': {
      const ov = await getOverview()
      if (!ov) throw new Error('overview')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ds: any = ov.deviceStats || {}
      const online = Number(ds.online ?? 0)
      const total = Number(ds.total ?? 0)
      const rate = Number(ds.onlineRate ?? (total > 0 ? online / total : 0))
      const alarming = Number(ds.alarming ?? 0)
      const rows: CompositionRow[] = [
        { label: mdt('metricDetail.comp.onlineDevices'), value: String(online) },
        { label: mdt('metricDetail.comp.offlineDevices'), value: String(Math.max(0, total - online)) },
      ]
      if (alarming > 0) rows.push({ label: mdt('metricDetail.comp.alarmingDevices'), value: String(alarming) })
      return {
        live: { value: pct(rate * 100), subtitle: mdt('metricDetail.live.deviceSub', { online, total }) },
        composition: rows,
      }
    }
    case 'alarmDist': {
      const ov = await getOverview()
      if (!ov) throw new Error('overview')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const as: any = ov.alarmStats || {}
      const level = String(state.ctx.level || '')
      const count = level ? Number(as[level] ?? 0) : Number(as.todayTotal ?? 0)
      return {
        live: {
          value: String(count),
          subtitle: level ? levelLabel(level) : mdt('metricDetail.live.todayTotal'),
        },
        composition: LEVEL_ORDER.map((lv) => ({
          label: levelLabel(lv),
          value: String(Number(as[lv] ?? 0)),
          action: { type: 'metric' as const, key: 'alarmDist' as const, ctx: { level: lv } },
        })),
      }
    }
    case 'alarmTrendSlot': {
      const alarms = await getWindowAlarms()
      const byLevel: Record<string, number> = {}
      for (const a of alarms) {
        const lv = String(a.level || 'low')
        byLevel[lv] = (byLevel[lv] ?? 0) + 1
      }
      return {
        live: {
          value: String(alarms.length),
          subtitle: String(state.ctx.windowLabel || mdt('metricDetail.live.windowCount')),
        },
        composition: LEVEL_ORDER.map((lv) => ({
          label: levelLabel(lv),
          value: String(byLevel[lv] ?? 0),
          action: { type: 'metric' as const, key: 'alarmDist' as const, ctx: { level: lv } },
        })),
      }
    }
    case 'agentLoad': {
      const agents = await getAgents()
      const name = String(state.ctx.agentName || '')
      const target = agents.find((a) => String(a.name) === name) ?? agents[0]
      if (!target) throw new Error('agents')
      const statusLabel = mdt(`metricDetail.agentStatus.${String(target.status || 'idle')}`)
      return {
        live: {
          value: String(Number(target.calls) || 0),
          subtitle: mdt('metricDetail.live.agentSub', { name: String(target.name || '-'), status: statusLabel }),
        },
        composition: [
          { label: mdt('metricDetail.comp.calls'), value: String(Number(target.calls) || 0) },
          { label: mdt('metricDetail.comp.status'), value: statusLabel },
          { label: mdt('metricDetail.comp.lastActive'), value: String(target.lastActiveAt || '—') },
        ],
      }
    }
  }
}

async function buildTrend(key: MetricKey): Promise<TrendData | null> {
  switch (key) {
    case 'todayAlarms':
    case 'alarmDist':
    case 'alarmTrendSlot': {
      // /situation/hourly-stats: 今日 0..当前小时 1h 桶 (后端只返回到当前小时)
      const hourly = await getHourly()
      if (!hourly.length) return null
      return {
        labels: hourly.map((h) => `${String(Number(h.hour) || 0).padStart(2, '0')}:00`),
        values: hourly.map((h) => Number(h.alarmCount) || 0),
        unit: '',
        note: '',
      }
    }
    case 'handleRate': {
      // 今日告警客户端按小时分桶: 该小时处置率 = 已处置 / 该小时告警数
      const alarms = await getTodayAlarms()
      const nowH = new Date().getHours()
      const totals = new Array<number>(nowH + 1).fill(0)
      const handled = new Array<number>(nowH + 1).fill(0)
      for (const a of alarms) {
        const h = new Date(a.createdAt).getHours()
        if (h >= 0 && h <= nowH) {
          totals[h]++
          if (String(a.status) !== 'unhandled') handled[h]++
        }
      }
      return {
        labels: totals.map((_, i) => `${String(i).padStart(2, '0')}:00`),
        values: totals.map((t, i) => (t > 0 ? Math.round((handled[i] / t) * 1000) / 10 : 0)),
        unit: '%',
        note: mdt('metricDetail.trend.handleNote'),
      }
    }
    case 'deviceStatus': {
      // /stats/device-analytics: 7 天日粒度在线率 (0-100)
      const t = await getDeviceTrend()
      if (!t) return null
      return { labels: t.labels, values: t.values, unit: '%', note: '' }
    }
    default:
      // securityScore / totalAgents / edgeCompute / agentLoad: 后端无历史数据 → 空态
      return null
  }
}

async function buildItems(key: MetricKey): Promise<{ items: MetricItem[]; note: string }> {
  switch (key) {
    case 'totalAgents': {
      const stats = await getAlgoStats()
      if (!stats) throw new Error('algorithms')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: MetricItem[] = stats.list.map((a: any) => ({
        kind: 'algo' as const,
        id: String(a.algo_id || a.id || ''),
        name: String(a.name_zh || a.name || a.algo_id || a.id || '-'),
        category: String(a.category || ''),
        version: String(a.version || ''),
        status: String(a.status || 'normal'),
        available: a.available !== false,
        enabled: a.enabled !== false,
        description: String(a.description || ''),
        accuracy: Number(a.accuracy) || 0,
        fps: Number(a.fps) || 0,
        modelSource: String(a.model_source || ''),
        alarmType: String(a.alarm_type || ''),
      }))
      return { items, note: items.length ? '' : mdt('metricDetail.empty.noItems') }
    }
    case 'todayAlarms': {
      const alarms = await getTodayAlarms()
      return {
        items: alarms.slice(0, 20).map(toAlarmItem),
        note: alarms.length ? '' : mdt('metricDetail.empty.noItems'),
      }
    }
    case 'handleRate': {
      const alarms = await getTodayAlarms()
      const unhandled = alarms.filter((a) => String(a.status) === 'unhandled')
      return {
        items: unhandled.slice(0, 20).map(toAlarmItem),
        note: unhandled.length ? '' : mdt('metricDetail.empty.noUnhandled'),
      }
    }
    case 'alarmDist': {
      const alarms = await getTodayAlarms()
      const lv = String(state.ctx.level || '')
      const list = lv ? alarms.filter((a) => String(a.level) === lv) : alarms
      return {
        items: list.slice(0, 20).map(toAlarmItem),
        note: list.length ? '' : mdt('metricDetail.empty.noItems'),
      }
    }
    case 'alarmTrendSlot': {
      const alarms = await getWindowAlarms()
      return {
        items: alarms.slice(0, 20).map(toAlarmItem),
        note: alarms.length ? '' : mdt('metricDetail.empty.noItems'),
      }
    }
    case 'deviceStatus': {
      const devices = await getDeviceStatus()
      return {
        items: devices.map((d) => ({ kind: 'device' as const, id: d.id, name: d.name, online: d.online, type: d.type })),
        note: devices.length ? '' : mdt('metricDetail.empty.noItems'),
      }
    }
    case 'edgeCompute': {
      const agents = await getAgents()
      return {
        items: agents.map((a) => ({
          kind: 'agent' as const,
          name: String(a.name || '-'),
          status: String(a.status || 'idle'),
          calls: Number(a.calls) || 0,
          avgLatency: Number(a.avgLatency) || 0,
        })),
        note: '',
      }
    }
    default:
      // securityScore / agentLoad: 无单条明细跳转目标 → 空态
      return { items: [], note: mdt('metricDetail.empty.noItems') }
  }
}

// ─────────────────────────────────────────────────────────
// 6. 段级执行 (竞态防护 + 段级 loading/error)
// ─────────────────────────────────────────────────────────

async function runSection<T>(
  sec: MetricSection,
  seq: number,
  fn: () => Promise<T>,
  commit: (result: T) => void,
): Promise<void> {
  const my = ++sectionSeq[sec]
  state.loading[sec] = true
  state.error[sec] = ''
  try {
    const result = await fn()
    // 旧代际 (抽屉已切指标/关闭) 或旧同名段 (已被重试取代) 响应丢弃
    if (seq !== loadSeq || my !== sectionSeq[sec]) return
    commit(result)
  } catch {
    if (seq !== loadSeq || my !== sectionSeq[sec]) return
    state.error[sec] = mdt('metricDetail.empty.loadFailed')
  } finally {
    if (seq === loadSeq && my === sectionSeq[sec]) state.loading[sec] = false
  }
}

function runLive(seq: number): void {
  void runSection('live', seq, () => buildLive(state.key as MetricKey), (r) => {
    state.live = r.live
    state.composition = r.composition
  })
}

function runTrend(seq: number): void {
  void runSection('trend', seq, () => buildTrend(state.key as MetricKey), (r) => {
    state.trend = r
  })
}

function runItems(seq: number): void {
  void runSection('items', seq, () => buildItems(state.key as MetricKey), (r) => {
    state.items = r.items
    state.itemsNote = r.note
  })
}

// ─────────────────────────────────────────────────────────
// 7. 对外 API
// ─────────────────────────────────────────────────────────

/** 打开指标详情抽屉 (ctx 携带预过滤: alarmDist 级别 / 趋势窗口 / agent 名) */
export function openMetric(key: MetricKey, ctx?: MetricCtx): void {
  const seq = ++loadSeq
  resetSharedCaches()

  state.isOpen = true
  state.key = key
  state.ctx = ctx ? { ...ctx } : {}
  state.title = mdt(`metricDetail.title.${key}`)
  state.live = null
  state.composition = []
  state.trend = null
  state.items = []
  state.itemsNote = ''
  state.loading = { live: true, trend: true, items: true }
  state.error = { live: '', trend: '', items: '' }

  runLive(seq)
  runTrend(seq)
  runItems(seq)
}

/** 关闭抽屉 (递增 loadSeq 作废全部在途请求) */
export function closeMetric(): void {
  loadSeq++
  state.isOpen = false
  state.key = null
  state.loading = { live: false, trend: false, items: false }
}

/** 单段重试 (不递增 loadSeq; 仅作废旧同名段响应, 其余段在途请求保持有效) */
export function retrySection(sec: MetricSection): void {
  if (!state.isOpen || !state.key) return
  const seq = loadSeq
  if (sec === 'live') runLive(seq)
  else if (sec === 'trend') runTrend(seq)
  else runItems(seq)
}

export function useMetricDetail() {
  return {
    state,
    openMetric,
    closeMetric,
    retrySection,
    alarmsDeepLink,
    deviceDeepLink,
    algoCategoryZh,
    ALGO_CATEGORY_ZH,
  }
}
