/**
 * useAlarmShapes.framebasis.test.ts — [FIX p1-roi-frame-basis 2026-10-02] 缺陷 13-1
 *
 * 背景: 同一张证据图上存在两套归一基准 —— 检测框 (AlarmSnapshot.normBBox /
 *   parseDetections) 按 <img> 的 naturalWidth/Height 归一, 而 ROI 形状链
 *   (normPoints) 无帧尺寸入参, 像素尺度顶点恒按写入侧回退基准 1920×1080 归一。
 *   4:3 通道 (1280×960) 的区域库像素多边形满幅被画成 (0.667, 0.889) 缩在左上,
 *   与检测框错位 (清单 13-1 实锚)。本批: normPoints 接 ShapeFrame 透传
 *   normalizePoint(x, y, w, h), 三条数据链 (规则 roi_shapes_json / 区域库 /
 *   告警冻结快照) 统一按证据帧尺寸归一, 并把尺寸纳入模块级缓存键。
 *
 * 判据纪律 (每条都要能被「坏实现」证伪):
 *   1. 传 1280×960 → 区域库像素多边形按 1280/960 归一
 *      (坏实现: frame 未透传 normPoints → 仍按 1920×1080 → 0.667 → 红);
 *   2. 不传尺寸 (0×0) → 回退 1920×1080
 *      (坏实现: 尺寸必填/无回退 → NaN 或空 → 存量无尺寸调用链断 → 红 —— 兼容性保护);
 *   3. 已归一顶点 (≤1.5) 不受尺寸影响
 *      (坏实现: 无条件除以尺寸 → 0.1/1280 → 红 —— 零回归保护, 14-1 后主流形态);
 *   4. 同 (通道,算法,alarmKey) 但尺寸不同 → **不共用缓存条目**, 第二次重新拉取
 *      (坏实现: 尺寸不入缓存键 → 首次回退结果被当真结果复用 30s → 红);
 *   5. 规则链 roi_shapes_json 的像素顶点同样按 frame 归一
 *      (坏实现: loadFromRules 未收 frame → 红);
 *   6. 告警自包含快照 (metadata.alarm_shapes) 冻结链的像素顶点按 frame 归一
 *      (坏实现: ⓪ 链漏传 fr → 红)。
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
      // 实现体由 beforeEach 装配 (mockReset:true 会清空工厂里设的实现)
      listRegions: vi.fn(),
      listTripwires: vi.fn(),
      listCountingZones: vi.fn(),
    },
  }
})

import { linkageApi } from '@/api/linkage'
import { regionApi } from '@/api/region'
import { useAlarmShapes } from '../useAlarmShapes'

const CH = '13120000001320900002'
const ALGO = 'shield.algo.perimeter.intrusion'
/** 4:3 证据帧 (非 16:9 —— 两套基准在此比例下差异最大, 判据最敏感) */
const FRAME_43 = { w: 1280, h: 960 }

/** 4:3 画面右侧三角像素多边形: 按 1280×960 归一 → (0.5,0.5)(1,0.5)(1,1);
 *  按 1920×1080 回退 → (0.333,0.444)(0.667,0.444)(0.667,0.889) —— 两者可分 */
const PIX_POLY: Array<[number, number]> = [[640, 480], [1280, 480], [1280, 960]]
const PIX_FLAT = [640, 480, 1280, 480, 1280, 960]

function armRulesEmpty() {
  vi.mocked(linkageApi.getAllRules).mockResolvedValue({
    data: { code: 0, data: { items: [] } },
  } as any)
}

function armRegionPolygon(polygon: Array<[number, number]>) {
  vi.mocked(regionApi.listRegions).mockResolvedValue({
    data: { code: 0, data: { regions: [{ name: '区A', region_type: 'detection_zone', algo_id: ALGO, enabled: true, polygon }] } },
  } as any)
  vi.mocked(regionApi.listTripwires).mockResolvedValue({ data: { code: 0, data: { tripwires: [] } } } as any)
  vi.mocked(regionApi.listCountingZones).mockResolvedValue({ data: { code: 0, data: { counting_zones: [] } } } as any)
}

/** 带 rule_id + 像素 flat 顶点的规则 (对齐 /linkage/rules/all 下发形态) */
function ruleWithPixelShapes(id: string, ch: string, name: string): any {
  return {
    rule_id: id,
    enabled: true,
    source_cond: { event_types: ['intrusion'], channel_ids: [], device_ids: [] },
    spatial_cond: {
      bound_channel_ids: [ch],
      location_id: '',
      roi_shapes_json: JSON.stringify({
        combine: 'union',
        shapes: [{ shape: 'detection_zone', name, active: true, points: PIX_FLAT }],
      }),
    },
  }
}

describe('useAlarmShapes 区域框与检测框同基准归一 (13-1)', () => {
  beforeEach(() => { armRulesEmpty() })

  it('① 传 1280×960 → 区域库像素多边形按 1280/960 归一 (判据 1)', async () => {
    armRegionPolygon(PIX_POLY)
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO, undefined, 'key-1', FRAME_43)).toBe('region')
    const pts = shapes.value[0].points
    expect(pts.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]))
      .toEqual([[0.5, 0.5], [1, 0.5], [1, 1]])
  })

  it('② 未传尺寸 (0×0) → 回退写入侧基准 1920×1080, 存量调用链不断 (判据 2)', async () => {
    armRegionPolygon(PIX_POLY)
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO, undefined, 'key-2')).toBe('region')
    const pts = shapes.value[0].points
    expect(pts.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]))
      .toEqual([[0.3333, 0.4444], [0.6667, 0.4444], [0.6667, 0.8889]])
  })

  it('③ 已归一顶点 (≤1.5) 不受尺寸影响 → 14-1 之后主流形态零行为变化 (判据 3)', async () => {
    const normPoly: Array<[number, number]> = [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]]
    armRegionPolygon(normPoly)
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO, undefined, 'key-3a', FRAME_43)).toBe('region')
    expect(shapes.value[0].points).toEqual(normPoly)
  })

  it('④ 同 (通道,算法,alarmKey) 尺寸不同 → 不共用缓存, 第二次按真基准重拉 (判据 4)', async () => {
    armRegionPolygon(PIX_POLY)
    const key = 'key-4'
    const a = useAlarmShapes()
    // 首次: 尺寸未就绪 (0×0) → 回退基准 0.6667 并缓存到 …|0x0
    expect(await a.load(CH, ALGO, undefined, key)).toBe('region')
    expect(a.shapes.value[0].points[1][0].toFixed(4)).toBe('0.6667')
    expect(vi.mocked(regionApi.listRegions)).toHaveBeenCalledTimes(1)

    // 尺寸就绪 (1280×960) → 必须重新拉取并按真基准归一, 不得复用 …|0x0 缓存
    const b = useAlarmShapes()
    expect(await b.load(CH, ALGO, undefined, key, FRAME_43)).toBe('region')
    expect(vi.mocked(regionApi.listRegions)).toHaveBeenCalledTimes(2)
    expect(b.shapes.value[0].points[1][0].toFixed(4)).toBe('1.0000')
  })

  it('⑤ 规则链 roi_shapes_json 像素顶点同样按 frame 归一 (判据 5)', async () => {
    vi.mocked(linkageApi.getAllRules).mockResolvedValue({
      data: { code: 0, data: { items: [ruleWithPixelShapes('Rpx', CH, '像素区')] } },
    } as any)
    armRegionPolygon([])
    const { shapes, load } = useAlarmShapes()
    expect(await load(CH, ALGO, undefined, 'Rpx', FRAME_43)).toBe('rule')
    expect(shapes.value[0].points.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]))
      .toEqual([[0.5, 0.5], [1, 0.5], [1, 1]])
  })

  it('⑥ 告警冻结快照 (alarm_shapes) 像素顶点按 frame 归一 (判据 6)', async () => {
    const { shapes, load } = useAlarmShapes()
    const snap = [{ type: 'detection_zone', name: '冻结区', points: PIX_POLY }]
    expect(await load(CH, ALGO, snap, 'key-6', FRAME_43)).toBe('snapshot')
    expect(shapes.value[0].points.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]))
      .toEqual([[0.5, 0.5], [1, 0.5], [1, 1]])
  })
})
