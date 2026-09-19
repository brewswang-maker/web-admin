/**
 * @file useMetricDetail.test.ts
 * @brief 态势大屏关键指标下钻 composable 单元测试 (Task-99f)
 *
 * 覆盖:
 *   - 深链契约: alarmsDeepLink ±5min 窗口 / status 透传 / deviceDeepLink 编码
 *   - 算法清单提取口径: algorithms/items 双写 + 裸形态 + 空响应
 *   - computeAlgoStats: enabled !== false 计数 + byStatus 分组
 *   - openMetric 正常流: totalAgents 三段 (live/composition/items + 无历史空态)
 *   - 竞态防护: loadSeq 旧代际响应丢弃 (切指标后旧响应不落地)
 *   - 段级失败与重试: live 段失败 → retrySection 真正重拉并恢复
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ── Mock 网络层 (归一化/i18n/深链走真实实现) ──────────────
vi.mock('@/api/algorithms', () => ({
  default: { listAll: vi.fn() },
}))
vi.mock('@/api/situation', () => ({
  situationApi: {
    getOverview: vi.fn(),
    getAgentStatuses: vi.fn(),
    getHourlyStats: vi.fn(),
  },
}))
vi.mock('@/api/alarm', () => ({
  alarmApi: { getList: vi.fn() },
}))
vi.mock('@/api/http', () => ({
  statsHttp: { get: vi.fn() },
}))

import algorithmsApi from '@/api/algorithms'
import { situationApi } from '@/api/situation'
import { alarmApi } from '@/api/alarm'
import { statsHttp } from '@/api/http'
import { setI18nLocale } from '@/i18n'
import {
  ALARM_LINK_WINDOW_MS,
  alarmsDeepLink,
  deviceDeepLink,
  extractAlgorithmList,
  computeAlgoStats,
  openMetric,
  closeMetric,
  retrySection,
  useMetricDetail,
} from '@/composables/useMetricDetail'

/** AxiosResponse<ApiResponse<T>> 形态包装 (对齐拦截器返回 response 的口径) */
const ok = <T>(data: T) => ({ data: { code: 0, message: 'ok', data } })

/** 等待微任务与短定时器全部落定 */
const flushAll = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 0))
  }
}

// ── 测试数据 ──────────────────────────────────────────────
const algoRows = [
  { id: 'alg-1', algo_id: 'fire_smoke', name: 'fire_smoke', name_zh: '烟火检测', type: 'detection', version: '1.2.0', description: '烟雾与明火检测', category: 'fire_safety', accuracy: 0.93, fps: 25, enabled: true, status: 'normal', available: true, model_source: 'builtin', alarm_type: 'fire' },
  { id: 'alg-2', algo_id: 'helmet', name: 'helmet', name_zh: '安全帽佩戴', type: 'detection', version: '1.0.0', description: '安全帽检测', category: 'production_safety', accuracy: 0.9, fps: 30, enabled: false, status: 'stub', available: true, model_source: 'builtin', alarm_type: 'helmet' },
  { id: 'alg-3', algo_id: 'loiter', name: 'loiter', name_zh: '人员徘徊', type: 'analysis', version: '0.9.0', description: '徘徊检测', category: 'behavior_analysis', accuracy: 0.85, fps: 15, status: 'degraded', available: false, model_source: 'generic', alarm_type: 'loitering' },
]

const overviewData = {
  deviceStats: { online: 8, total: 10, onlineRate: 0.8, alarming: 1 },
  alarmStats: { total: 10, critical: 2, high: 3, medium: 4, low: 1, todayTotal: 10 },
  securityScore: { overall: 86, trend: 0 },
  systemHealth: {},
  activeAgents: 3,
  totalAgents: 4,
  handleRate: 75,
}

const alarmRows = [
  { id: 'al-1', severity: 5, type: 'fire', status: 'unhandled', description: '明火告警', created_at: '2026-09-20T02:00:00Z', device_name: 'Cam1' },
  { id: 'al-2', severity: 4, type: 'intrusion', status: 'confirmed', description: '入侵告警', created_at: '2026-09-20T03:00:00Z', device_name: 'Cam2' },
]

const deviceRows = [
  { id: 'dev-1', name: '大门球机', online: true, type: 'camera' },
  { id: 'dev-2', name: '仓库枪机', online: false, type: 'camera' },
]

describe('composables/useMetricDetail', () => {
  const { state } = useMetricDetail()

  beforeAll(() => {
    setI18nLocale('zh-CN')
  })

  beforeEach(() => {
    closeMetric()
    vi.mocked(algorithmsApi.listAll).mockResolvedValue(ok({ algorithms: algoRows, total: 3 }) as never)
    vi.mocked(situationApi.getOverview).mockResolvedValue(ok(overviewData) as never)
    vi.mocked(situationApi.getAgentStatuses).mockResolvedValue(ok([]) as never)
    vi.mocked(situationApi.getHourlyStats).mockResolvedValue(
      ok([{ hour: 0, alarmCount: 1, onlineDevices: 5 }, { hour: 1, alarmCount: 2, onlineDevices: 6 }]) as never,
    )
    vi.mocked(alarmApi.getList).mockResolvedValue(ok({ alarms: alarmRows, total: 2 }) as never)
    vi.mocked(statsHttp.get).mockImplementation((async (url: string) => {
      if (String(url).includes('device-status')) return ok({ devices: deviceRows, online_count: 1, total_count: 2 })
      if (String(url).includes('device-analytics')) return ok({ onlineRateTrend: [{ date: '2026-09-14', rate: 90 }] })
      return ok(null)
    }) as never)
  })

  // ========================================================================
  // 深链契约 (§2.3)
  // ========================================================================
  it('alarmsDeepLink — 生成 ±5min 窗口与级别/类型过滤', () => {
    const t0 = new Date('2026-09-20T10:30:00').getTime()
    const q = new URLSearchParams(alarmsDeepLink({ tsMs: t0, level: 'critical', alarmType: 'fire' }).split('?')[1])
    expect(q.get('start_ms')).toBe(String(t0 - ALARM_LINK_WINDOW_MS))
    expect(q.get('end_ms')).toBe(String(t0 + ALARM_LINK_WINDOW_MS))
    expect(q.get('level')).toBe('critical')
    expect(q.get('alarm_type')).toBe('fire')
    expect(q.get('status')).toBeNull()
  })

  it('alarmsDeepLink — status 透传; 无时间戳不输出时间窗', () => {
    const t0 = Date.now()
    const q1 = new URLSearchParams(alarmsDeepLink({ tsMs: t0, status: 'unhandled' }).split('?')[1])
    expect(q1.get('status')).toBe('unhandled')
    const q2 = new URLSearchParams(alarmsDeepLink({ level: 'high' }).split('?')[1])
    expect(q2.get('start_ms')).toBeNull()
    expect(q2.get('end_ms')).toBeNull()
    expect(q2.get('level')).toBe('high')
  })

  it('deviceDeepLink — id 经 encodeURIComponent 编码', () => {
    expect(deviceDeepLink('dev/001')).toBe('/devices/dev%2F001')
  })

  // ========================================================================
  // 算法清单提取口径 (§3.1)
  // ========================================================================
  it('extractAlgorithmList — algorithms/items/裸形态/空响应四口径兼容', () => {
    expect(extractAlgorithmList(ok({ algorithms: algoRows, total: 3 }))).toHaveLength(3)
    expect(extractAlgorithmList(ok({ items: algoRows }))).toHaveLength(3)
    expect(extractAlgorithmList({ data: { code: 0, algorithms: algoRows } })).toHaveLength(3)
    expect(extractAlgorithmList({ data: null })).toEqual([])
    expect(extractAlgorithmList(null)).toEqual([])
  })

  it('computeAlgoStats — enabled !== false 计数与 byStatus 分组', () => {
    const stats = computeAlgoStats(algoRows as never)
    // alg-1 enabled=true, alg-3 enabled 缺失 (视为启用), alg-2 enabled=false
    expect(stats.enabled).toBe(2)
    expect(stats.total).toBe(3)
    expect(stats.byStatus).toEqual({ normal: 1, stub: 1, degraded: 1 })
  })

  // ========================================================================
  // openMetric 正常流 (§2.2 三段式)
  // ========================================================================
  it('openMetric(totalAgents) — 三段正常流 + 无历史趋势空态', async () => {
    openMetric('totalAgents')
    expect(state.isOpen).toBe(true)
    expect(state.title).toBe('算法启用总数')
    expect(state.loading.live).toBe(true)
    await flushAll()

    expect(state.loading.live).toBe(false)
    expect(state.error.live).toBe('')
    expect(state.live?.value).toBe('2')
    expect(state.live?.subtitle).toBe('已启用 2 / 共 3')
    // 构成: byStatus 按 normal/degraded/stub/routed 顺序
    expect(state.composition.map((c) => c.value)).toEqual(['1', '1', '1'])
    // 明细: 全量算法行
    expect(state.items).toHaveLength(3)
    expect(state.items[0]).toMatchObject({ kind: 'algo', id: 'fire_smoke', name: '烟火检测', enabled: true, available: true })
    // 趋势: 后端无历史 → 空态 (null)
    expect(state.trend).toBeNull()
    expect(state.loading.trend).toBe(false)
    expect(state.error.trend).toBe('')
  })

  it('openMetric(todayAlarms) — 级别构成 + 小时趋势 + 告警明细', async () => {
    openMetric('todayAlarms')
    await flushAll()

    expect(state.live?.value).toBe('10')
    expect(state.composition.map((c) => c.value)).toEqual(['2', '3', '4', '1'])
    expect(state.trend?.labels).toEqual(['00:00', '01:00'])
    expect(state.trend?.values).toEqual([1, 2])
    expect(state.items).toHaveLength(2)
    expect(state.items[0]).toMatchObject({ kind: 'alarm', id: 'al-1', alarmType: 'fire', level: 'critical', status: 'unhandled' })
    expect(Number.isFinite((state.items[0] as { tsMs: number }).tsMs)).toBe(true)
  })

  // ========================================================================
  // 竞态防护 (§2.2 loadSeq 双令牌)
  // ========================================================================
  it('openMetric — 切指标后旧代际算法响应不落地', async () => {
    let releaseList: ((v: unknown) => void) | undefined
    vi.mocked(algorithmsApi.listAll).mockImplementation((() => new Promise((res) => { releaseList = res })) as never)

    openMetric('totalAgents') // 第 1 代: listAll 挂起
    openMetric('deviceStatus') // 第 2 代: 算法响应应作废
    await flushAll()

    expect(state.key).toBe('deviceStatus')
    expect(state.live?.value).toBe('80.0%')

    releaseList!(ok({ algorithms: algoRows, total: 3 }))
    await flushAll()

    // 旧响应被丢弃: 仍是设备指标, 不混入算法行
    expect(state.live?.value).toBe('80.0%')
    expect(state.items).toHaveLength(2)
    expect(state.items.every((i) => i.kind === 'device')).toBe(true)
  })

  // ========================================================================
  // 段级失败与重试 (§2.2 段级容错)
  // ========================================================================
  it('段级失败 — live 失败后可单段重试恢复; 其余段空态不受影响', async () => {
    vi.mocked(situationApi.getOverview)
      .mockRejectedValueOnce(new Error('net down'))
      .mockResolvedValue(ok(overviewData) as never)

    openMetric('securityScore')
    await flushAll()

    // live 段失败
    expect(state.error.live).toBe('加载失败，请重试')
    expect(state.loading.live).toBe(false)
    expect(state.live).toBeNull()
    // 无历史趋势 + 无明细跳转目标 → 空态
    expect(state.trend).toBeNull()
    expect(state.items).toHaveLength(0)
    expect(state.itemsNote).toBe('暂无明细数据')

    retrySection('live')
    expect(state.loading.live).toBe(true)
    await flushAll()

    expect(state.error.live).toBe('')
    expect(state.live?.value).toBe('86')
    expect(state.composition).toHaveLength(3)
  })
})
