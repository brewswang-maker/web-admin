/**
 * useAlarmShapes.ruleprivate.test.ts — [FIX p1-rule-private-shapes 2026-10-02] 缺陷 10-5
 *
 * 背景: ① 规则链原按 (通道, 算法/事件类型) 取「首个双命中规则」即 return, 另有仅通道
 *   命中候补桶与通配候补桶。告警携带命中规则 id 时它仍可能取到**别的规则**的几何 ——
 *   12-2 把 alarmKey 加进缓存键只解决了「缓存身份维」, 没有过滤数据源 (台账 §5.1.37
 *   如实登记的边界)。本批: load 的第 4 参同时作为数据选择维下传 loadFromRules,
 *   该 key 能在本次规则响应中匹配到 rule_id 时只看该规则, 首命中越界与通配回退同时失效。
 *
 * 判据纪律 (每条都要能被「坏实现」证伪):
 *   1. 同通道两条规则 R1(区A)/R2(区B), 响应顺序 R1 在前 + alarmKey='R2'
 *      → 必须拿到「区B」 (坏实现: 无 ruleId 过滤 → 首个双命中即 return → 拿到区A → 红);
 *   2. alarmKey 是告警 id 形态 (响应中查无此规则) → 必须仍是现行链结果 (区A)
 *      (坏实现: 把「查无」也当严格模式 → 返回空 → 存量告警形状消失 → 红 —— 保护性用例);
 *   3. 命中规则存在但 enabled=false → 返回空, **不得**越界取 R1
 *      (坏实现: 只看 enabled 过滤, 落到 R1 → 红);
 *   4. 命中规则为逐通道严格模式且本通道未绘 → 返回空 (未绘即不画, 同引擎 [ROI-PC-UNDRAWN]);
 *   5. alarmKey 指认通配规则自身 → 取该通配规则的几何 (通配规则也可被精确指认)。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/linkage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/linkage')>()
  return { ...actual, linkageApi: { ...actual.linkageApi, getAllRules: vi.fn() } }
})
vi.mock('@/api/region', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/region')>()
  return {
    ...actual,
    regionApi: {
      ...actual.regionApi,
      // 实现体由 beforeEach 装配 (mockReset:true 会清空工厂里设的实现, 见 alarmkey 文件头说明)
      listRegions: vi.fn(),
      listTripwires: vi.fn(),
      listCountingZones: vi.fn(),
    },
  }
})

import { linkageApi } from '@/api/linkage'
import { regionApi } from '@/api/region'
import { useAlarmShapes } from '../useAlarmShapes'

function armRegionEmpty() {
  vi.mocked(regionApi.listRegions).mockResolvedValue({ data: { code: 0, data: { regions: [] } } } as any)
  vi.mocked(regionApi.listTripwires).mockResolvedValue({ data: { code: 0, data: { tripwires: [] } } } as any)
  vi.mocked(regionApi.listCountingZones).mockResolvedValue({ data: { code: 0, data: { counting_zones: [] } } } as any)
}

function zone(name: string) {
  return {
    shape: 'detection_zone', name, active: true,
    points: [0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9],
  }
}

/** 带 rule_id 的通用模式规则 (对齐后端 /linkage/rules/all 下发形态) */
function rule(o: {
  id: string
  ch?: string
  name: string
  enabled?: boolean
  byChannel?: Record<string, unknown>
}): any {
  const spatial: any = {
    bound_channel_ids: o.ch ? [o.ch] : [],
    location_id: '',
    roi_shapes_json: JSON.stringify({ combine: 'union', shapes: [zone(o.name)] }),
  }
  if (o.byChannel) {
    delete spatial.roi_shapes_json
    spatial.roi_shapes_by_channel = JSON.stringify(o.byChannel)
  }
  return {
    rule_id: o.id,
    enabled: o.enabled !== false,
    source_cond: { event_types: ['intrusion'], channel_ids: [], device_ids: [] },
    spatial_cond: spatial,
  }
}

function mockRules(items: any[]) {
  vi.mocked(linkageApi.getAllRules).mockResolvedValue({
    data: { code: 0, data: { items } },
  } as any)
}

const CH = '13120000001320900002'
const ALGO = 'shield.algo.perimeter.intrusion'

describe('useAlarmShapes 形状按规则私有取 (10-5)', () => {
  beforeEach(() => { armRegionEmpty() })

  it('① alarmKey 指认 R2 → 取 R2 几何, 不被排在前面的 R1 越界 (判据 1)', async () => {
    mockRules([rule({ id: 'R1', ch: CH, name: '区A' }), rule({ id: 'R2', ch: CH, name: '区B' })])
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO, undefined, 'R2')).toBe('rule')
    expect(shapes.value.map((s) => s.name)).toEqual(['区B'])
  })

  it('② alarmKey 为告警 id 形态 (查无此规则) → 保持现行首命中, 不退化成空 (判据 2)', async () => {
    mockRules([rule({ id: 'R1x', ch: CH, name: '区A' }), rule({ id: 'R2x', ch: CH, name: '区B' })])
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO, undefined, 'alarm-9001')).toBe('rule')
    expect(shapes.value.map((s) => s.name)).toEqual(['区A'])
  })

  it('③ 命中规则存在但已禁用 → 空且不越界取启用中的 R1 (判据 3)', async () => {
    mockRules([
      rule({ id: 'R1', ch: CH, name: '区A' }),
      rule({ id: 'R2off', ch: CH, name: '区B', enabled: false }),
    ])
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO, undefined, 'R2off')).toBe('none')
    expect(shapes.value).toHaveLength(0)
  })

  it('④ 命中规则为逐通道严格模式且本通道未绘 → 空 (未绘即不画, 判据 4)', async () => {
    const other = '13120000001320900009'
    mockRules([
      rule({ id: 'R1', ch: CH, name: '区A' }),
      rule({
        id: 'R2pc',
        name: '区B',
        byChannel: { [other]: { shapes: [zone('区B')] } },
      }),
    ])
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO, undefined, 'R2pc')).toBe('none')
    expect(shapes.value).toHaveLength(0)
  })

  it('⑤ alarmKey 精确指认通配规则自身 → 取该通配规则而非显式绑定规则 (判据 5)', async () => {
    mockRules([
      rule({ id: 'Rwild', name: '通配区' }),
      rule({ id: 'Rbind', ch: CH, name: '显式绑定区' }),
    ])
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO, undefined, 'Rwild')).toBe('rule')
    expect(shapes.value.map((s) => s.name)).toEqual(['通配区'])
  })

  it('⑥ 无 alarmKey → 现行三级收集不变 (显式绑定优先于通配, 兼容性保护)', async () => {
    mockRules([
      rule({ id: 'Rwild2', name: '通配区2' }),
      rule({ id: 'Rbind2', ch: CH, name: '显式绑定区2' }),
    ])
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO)).toBe('rule')
    expect(shapes.value.map((s) => s.name)).toEqual(['显式绑定区2'])
  })
})
