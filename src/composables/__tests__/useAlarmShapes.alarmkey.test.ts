/**
 * useAlarmShapes.alarmkey.test.ts — [FIX p1-shape-cache-key 2026-10-02] 缺陷 12-2
 *
 * 背景: 模块级 shapeCache 原以 `${ch}|${algo}` 为键 + CACHE_TTL=30s, 同通道同算法的
 *   两条**不同规则/不同告警**在 30s 内共用同一份几何 → 「弹窗有形状、列表无形状」/
 *   串画。本批: ① load 增第 4 参 alarmKey, 缓存键升为 `${ch}|${algo}|${alarmKey}`;
 *   ② alarmKey 为空 → 不走缓存 (宁可不缓存, 不返回可能属于别的规则的几何);
 *   ③ 静默降级可见化: catch 不再只置空数组, 而是每键一次 console.warn + 返回 'error',
 *      成功无区域返回 'none' (调用方可区分「拉取失败」与「真没画区域」)。
 *   ⓪①② 优先级顺序本批不动 (Spec 明确: 原 12-2 的 alarm_row<rule_row<region_store
 *   排序已被 09-08/09-09 现场纠偏取代)。
 *
 * 判据纪律 (每条都要能被「坏实现」证伪):
 *   1. 规则集在两次 load 之间变化 + alarmKey 不同 → 第二次必须拿到新几何
 *      (坏实现: 键里没 alarmKey → 第二次命中 30s 旧缓存, 拿到第一份几何 → 红);
 *   2. alarmKey 相同 → 第二次必须命中缓存 (getAllRules 只调一次)
 *      (坏实现: 干脆禁用缓存 → 调用两次 → 红 —— 这条防「以去掉缓存冒充修复」);
 *   3. alarmKey 缺省 → 每次都发请求, 且不得写缓存 (随后带 key 的新键首查不能被
 *      上一条的旧结果污染);
 *   4. 两级链都空 → 返回 'none' 且 shapes 为空;
 *   5. 两级链抛错 → 返回 'error' + console.warn 恰一次 + 不写缓存 (下一次仍会重试);
 *   6. alarmShapeKey 口径: matched_rule_ids[0] > rule_id > metadata.rule_id > 告警 id,
 *      非对象入参返回空串;
 *   7. ⓪ 快照链仍优先且绕过缓存;
 *   8. normalizeAlarmCore (归一化层) 必须把命中规则 id 集带到行上 —— 真机取证
 *      发现旧归一化白名单丢弃 matched_rule_ids, identity 只能退到告警 id。
 *
 * 通道键/告警 id 各用例取唯一值: shapeCache 是模块级 Map, vitest 同文件内共享进程。
 *
 * [NOTE mockReset 陷阱 2026-10-02] vitest.config.ts 开了 mockReset:true —— 每个用例
 *   执行前会清空所有 vi.fn() 的**实现**, 包括 vi.mock 工厂里 .mockResolvedValue() 设的
 *   实现。因此区域库三个 mock 必须在 beforeEach 里重新装配 (只在工厂里设的话,
 *   只有本文件第一个用例能用, 之后返回 undefined → 产品代码 .catch() 前是 undefined
 *   → TypeError → 被降级链吞成 'error', 用例④ 首跑即由此产生)。同一陷阱也使既有
 *   perchannel 用例②③ 的 "shapes 为空" 变成空断言 (崩溃也能得到空) —— 已在该文件
 *   补 beforeEach 并把断言收紧到数据源标记 'none'。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/linkage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/linkage')>()
  return {
    ...actual,
    linkageApi: { ...actual.linkageApi, getAllRules: vi.fn() },
  }
})
vi.mock('@/api/region', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/region')>()
  return {
    ...actual,
    regionApi: {
      ...actual.regionApi,
      // 实现体由 beforeEach 装配 (见文件头 mockReset 陷阱说明), 工厂只保证函数存在
      listRegions: vi.fn(),
      listTripwires: vi.fn(),
      listCountingZones: vi.fn(),
    },
  }
})

import { linkageApi } from '@/api/linkage'
import { regionApi } from '@/api/region'
import { normalizeAlarmCore } from '@/types/alarm'
import { alarmShapeKey, useAlarmShapes } from '../useAlarmShapes'

/** 区域库两级链置空: 让 ② 回退链「干净地返回空」而不是因缺实现而抛错 */
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

/** 通用模式规则 (无 roi_shapes_by_channel): 绑定通道 = bound_channel_ids */
function ruleWithShape(ch: string, name: string) {
  return {
    enabled: true,
    source_cond: { event_types: ['intrusion'], channel_ids: [], device_ids: [] },
    spatial_cond: {
      bound_channel_ids: [ch],
      location_id: '',
      roi_shapes_json: JSON.stringify({ combine: 'union', shapes: [zone(name)] }),
    },
  }
}

function mockRules(items: any[]) {
  vi.mocked(linkageApi.getAllRules).mockResolvedValue({
    data: { code: 0, data: { items } },
  } as any)
}

describe('useAlarmShapes 缓存键告警维度 + 降级可见化 (12-2)', () => {
  // 类型由 helper 推导 (直接写 ReturnType<typeof vi.spyOn> 会与 mockImplementation
  //   链返回的 MockInstance<any[], void> 不兼容, vue-tsc 报 TS2322)
  function armWarnSpy() { return vi.spyOn(console, 'warn').mockImplementation(() => {}) }
  let warnSpy: ReturnType<typeof armWarnSpy>
  beforeEach(() => {
    armRegionEmpty()
    warnSpy = armWarnSpy()
  })
  afterEach(() => { warnSpy.mockRestore() })

  it('① 不同 alarmKey → 各取自己规则集的几何, 不互相污染', async () => {
    const ch = '13120000001320900001'
    const algo = 'shield.algo.perimeter.intrusion'
    mockRules([ruleWithShape(ch, '规则A区')])
    const a = useAlarmShapes()
    const srcA = await a.load(ch, algo, undefined, 'rule-A')
    expect(srcA).toBe('rule')
    expect(a.shapes.value[0]?.name).toBe('规则A区')

    // 规则库变化 (另一条规则的告警): 旧键 ${ch}|${algo} 会命中 30s 缓存拿到「规则A区」
    mockRules([ruleWithShape(ch, '规则B区')])
    const b = useAlarmShapes()
    const srcB = await b.load(ch, algo, undefined, 'rule-B')
    expect(srcB).toBe('rule')
    expect(b.shapes.value[0]?.name).toBe('规则B区')
    expect(b.shapes.value[0]?.name).not.toBe('规则A区')
    expect(vi.mocked(linkageApi.getAllRules)).toHaveBeenCalledTimes(2)
  })

  it('② 相同 alarmKey → 30s 内命中缓存 (不得以禁缓存冒充修复)', async () => {
    const ch = '13120000001320900002'
    const algo = 'shield.algo.perimeter.intrusion'
    mockRules([ruleWithShape(ch, '同键区')])
    const s = useAlarmShapes()
    expect(await s.load(ch, algo, undefined, 'rule-SAME')).toBe('rule')
    // 换底层数据: 同键第二次必须走缓存 (仍拿首次结果, 且不再发请求)
    mockRules([ruleWithShape(ch, '已被改写区')])
    const s2 = useAlarmShapes()
    expect(await s2.load(ch, algo, undefined, 'rule-SAME')).toBe('rule')
    expect(s2.shapes.value[0]?.name).toBe('同键区')
    expect(vi.mocked(linkageApi.getAllRules)).toHaveBeenCalledTimes(1)
  })

  it('③ alarmKey 缺省 → 不走缓存 (每次都发请求, 也不写缓存)', async () => {
    const ch = '13120000001320900003'
    const algo = 'shield.algo.perimeter.intrusion'
    mockRules([ruleWithShape(ch, '缺省第一次')])
    const s = useAlarmShapes()
    expect(await s.load(ch, algo)).toBe('rule')
    mockRules([ruleWithShape(ch, '缺省第二次')])
    const s2 = useAlarmShapes()
    expect(await s2.load(ch, algo)).toBe('rule')
    // 旧实现: 第二次命中 ${ch}|${algo} 缓存 → 拿到「缺省第一次」且只发一次请求
    expect(s2.shapes.value[0]?.name).toBe('缺省第二次')
    expect(vi.mocked(linkageApi.getAllRules)).toHaveBeenCalledTimes(2)
    // 缺省态不得留下缓存条目: 随后带任意 key 的首查必须重新发请求
    mockRules([ruleWithShape(ch, '带键首查')])
    const s3 = useAlarmShapes()
    expect(await s3.load(ch, algo, undefined, 'rule-FRESH')).toBe('rule')
    expect(s3.shapes.value[0]?.name).toBe('带键首查')
    expect(vi.mocked(linkageApi.getAllRules)).toHaveBeenCalledTimes(3)
  })

  it('④ 两级链皆空 → 返回 none (与「拉取失败」可区分), 且空结果按新键分缓存', async () => {
    const ch = '13120000001320900004'
    const algo = 'shield.algo.perimeter.intrusion'
    mockRules([])
    const s = useAlarmShapes()
    expect(await s.load(ch, algo, undefined, 'rule-EMPTY')).toBe('none')
    expect(s.shapes.value).toHaveLength(0)
    // 空结果同样按 alarmKey 维度隔离 (旧实现会把某规则的「真没画」复用给另一规则)
    mockRules([ruleWithShape(ch, '刚补画区')])
    const s2 = useAlarmShapes()
    expect(await s2.load(ch, algo, undefined, 'rule-OTHER')).toBe('rule')
    expect(s2.shapes.value[0]?.name).toBe('刚补画区')
  })

  it('⑤ 拉取失败 → 返回 error + 每键恰一次 console.warn + 不写缓存', async () => {
    const ch = '13120000001320900005'
    const algo = 'shield.algo.perimeter.intrusion'
    vi.mocked(linkageApi.getAllRules).mockRejectedValueOnce(new Error('500 boom'))
    const s = useAlarmShapes()
    expect(await s.load(ch, algo, undefined, 'rule-ERR')).toBe('error')
    expect(s.shapes.value).toHaveLength(0)
    expect(s.fullscreenGuard.value).toBe(false)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    // 失败不得被固化: 下一次同键必须重试并成功 (若写了缓存则这里会拿到空)
    mockRules([ruleWithShape(ch, '重试成功区')])
    const s2 = useAlarmShapes()
    expect(await s2.load(ch, algo, undefined, 'rule-ERR')).toBe('rule')
    expect(s2.shapes.value[0]?.name).toBe('重试成功区')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('⑥ alarmShapeKey 口径: 命中规则 > 规则字段 > metadata > 告警 id', () => {
    expect(alarmShapeKey({ matched_rule_ids: ['r-1', 'r-2'], id: 77 })).toBe('r-1')
    expect(alarmShapeKey({ matched_rule_ids: [], rule_id: 'r-3', id: 78 })).toBe('r-3')
    expect(alarmShapeKey({ metadata: { rule_id: 'r-4' }, id: 79 })).toBe('r-4')
    expect(alarmShapeKey({ id: '80' })).toBe('80')
    expect(alarmShapeKey(undefined)).toBe('')
    expect(alarmShapeKey('not-an-object')).toBe('')
    // metadata 为字符串形态 (历史/直报链) 不得抛, 退到告警 id
    expect(alarmShapeKey({ metadata: '{"rule_id":"r-5"}', id: 81 })).toBe('81')
  })

  it('⑦ ⓪ 告警自包含快照仍最高优先且绕过缓存, 返回 snapshot', async () => {
    const ch = '13120000001320900006'
    const algo = 'shield.algo.perimeter.intrusion'
    mockRules([ruleWithShape(ch, '规则区不该出现')])
    const s = useAlarmShapes()
    const snap = [{ type: 'detection_zone', name: '冻结区', points: [[0.2, 0.2], [0.6, 0.6]] }]
    expect(await s.load(ch, algo, snap, 'rule-SNAP')).toBe('snapshot')
    expect(s.shapes.value[0]?.name).toBe('冻结区')
    expect(vi.mocked(linkageApi.getAllRules)).not.toHaveBeenCalled()
  })

  it('⑧ 归一化行 (normalizeAlarmCore) 必须带出规则身份 —— 12-2 真机实锚缺口', () => {
    // 真机取证发现: REST 行有 matched_rule_ids, 但 normalizeAlarmCore 白名单重建
    //   只留 matchedRuleName → 列表预览的 alarmKey 退到告警 id (同规则不共享缓存)。
    //   本用例锁定归一化→alarmShapeKey 的链条, 防止归一化层再次丢失身份字段。
    const norm = normalizeAlarmCore({
      alarm_id: 'al-9001',
      channel_id_str: '13120000001320900007',
      alarm_type: 'intrusion',
      matched_rule_ids: ['rule-NORM-1', 'rule-NORM-2'],
      matched_rule_name: '夜间闯入告警',
    } as any)
    expect(norm.matchedRuleIds).toEqual(['rule-NORM-1', 'rule-NORM-2'])
    expect(alarmShapeKey(norm)).toBe('rule-NORM-1')
    // WS 行形态 (无顶层 id 集, 仅 verdict 快照): 取 verdict.matched_rule_ids 首元素
    const ws = normalizeAlarmCore({
      alarm_id: 'al-9002',
      channel_id_str: '13120000001320900008',
      alarm_type: 'loitering',
      linkage_verdict: { matched: true, rule_id: 'rule-WS-9', matched_rule_ids: ['rule-WS-9'] },
    } as any)
    expect(alarmShapeKey(ws)).toBe('rule-WS-9')
    // 旧行无规则快照 → 仍退告警 id (不得抛, 也不得返回空串让不同告警共用同一缓存键)
    const legacy = normalizeAlarmCore({ alarm_id: 'al-9003', channel_id_str: '13120000001320900009', alarm_type: 'other' } as any)
    expect(alarmShapeKey(legacy)).toBe(String(legacy.id))
    expect(alarmShapeKey(legacy)).not.toBe('')
  })
})
