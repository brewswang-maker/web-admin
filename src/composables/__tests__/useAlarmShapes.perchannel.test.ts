/**
 * useAlarmShapes.perchannel.test.ts — [ROI-PC 2026-09-12] 弹窗链逐通道严格模式
 *
 * 依据: 用户任务「1 个事件规则绘制多个通道」(对标海康"不绘制则不告警"),
 *   与后端 C++ test_ssot_consistency.cpp::PerChannelShapesStrictGating 同构
 *   (前端渲染侧):
 *   ① 严格模式 (roi_shapes_by_channel 非空) + 本通道条目命中 → 仅渲染该通道
 *      专属几何 (通用键 roi_shapes_json 退役, 引擎同口径);
 *   ② 严格模式 + 本通道未绘 (条目缺失) → 本规则不渲染 (不得回退通用键,
 *      否则"该通道有检测区"的标注误导);
 *   ③ 条目命中但形状全停用 → 不渲染 (对齐引擎 [ROI-PC-INACTIVE]);
 *   ④ point 仅关注点 → 照常渲染 (显示层语义, 与判定层无关);
 *   ⑤ 无 by_channel 键 = 通用模式 → 存量路径回归锁 (不得误伤)。
 *
 * 通道键/告警通道双形态归一: '_chN' 后缀双向剥离 (stripChSuffix)。
 */
import { describe, it, expect, vi } from 'vitest'

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
      // 区域库回退链置空: 本测试只验证 ① 规则链的逐通道分支
      listRegions: vi.fn().mockResolvedValue({ data: { code: 0, data: { regions: [] } } }),
      listTripwires: vi.fn().mockResolvedValue({ data: { code: 0, data: { tripwires: [] } } }),
      listCountingZones: vi.fn().mockResolvedValue({ data: { code: 0, data: { counting_zones: [] } } }),
    },
  }
})

import { linkageApi } from '@/api/linkage'
import { useAlarmShapes } from '../useAlarmShapes'

const K_A = '13120000001320000009'
const K_B = '13120000001320000008'
const K_C = '13120000001320000007'
const K_D = '13120000001320000006'
const K_E = '13120000001320000005'

/** v2 形态形状集 (归一化 flat 顶点) */
function zone(name: string, active = true) {
  return { shape: 'detection_zone', name, active, points: [0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9] }
}

function mockRules(items: any[]) {
  vi.mocked(linkageApi.getAllRules).mockResolvedValue({
    data: { code: 0, data: { items } },
  } as any)
}

function rule(channelKeys: string[], spExtra: Record<string, unknown> = {}) {
  return {
    enabled: true,
    source_cond: { event_types: ['intrusion'], channel_ids: [], device_ids: [] },
    spatial_cond: {
      bound_channel_ids: channelKeys,
      location_id: '',
      ...spExtra,
    },
  }
}

describe('useAlarmShapes 逐通道严格模式 (ROI-PC)', () => {
  it('① 条目命中 (含 _ch0 双形态归一) → 仅渲染本通道几何, 不含通用键', async () => {
    mockRules([rule([K_A], {
      roi_shapes_json: JSON.stringify({ combine: 'union', shapes: [zone('通用区')] }),
      roi_shapes_by_channel: JSON.stringify({
        [K_A]: { combine: 'union', shapes: [zone('A专属区')], tripwire_refs: [] },
      }),
    })])
    const { shapes, load } = useAlarmShapes()
    await load(`${K_A}_ch0`, 'intrusion')
    expect(shapes.value.map((s) => s.name)).toEqual(['A专属区'])
  })

  it('② 未绘通道 (条目缺失) → 不渲染且不回退通用键', async () => {
    mockRules([rule([K_A, K_B], {
      roi_shapes_json: JSON.stringify({ combine: 'union', shapes: [zone('通用区')] }),
      roi_shapes_by_channel: JSON.stringify({
        [K_A]: { combine: 'union', shapes: [zone('A专属区')], tripwire_refs: [] },
      }),
    })])
    const { shapes, load } = useAlarmShapes()
    await load(K_B, 'intrusion')
    expect(shapes.value).toEqual([])
  })

  it('③ 条目命中但形状全停用 → 不渲染 (同引擎 ROI-PC-INACTIVE)', async () => {
    mockRules([rule([K_D], {
      roi_shapes_by_channel: JSON.stringify({
        [K_D]: { combine: 'union', shapes: [zone('已停用区', false)], tripwire_refs: [] },
      }),
    })])
    const { shapes, load } = useAlarmShapes()
    await load(K_D, 'intrusion')
    expect(shapes.value).toEqual([])
  })

  it('④ 仅关注点 (point) → 照常渲染 (显示层放行)', async () => {
    mockRules([rule([K_E], {
      roi_shapes_by_channel: JSON.stringify({
        [K_E]: {
          combine: 'union',
          shapes: [{ shape: 'point', name: '关注点1', active: true, points: [0.5, 0.5] }],
          tripwire_refs: [],
        },
      }),
    })])
    const { shapes, load } = useAlarmShapes()
    await load(K_E, 'intrusion')
    expect(shapes.value.map((s) => s.name)).toEqual(['关注点1'])
  })

  it('⑤ 无 by_channel 键 = 通用模式回归锁 (绑定通道照常渲染通用键)', async () => {
    mockRules([rule([K_C], {
      roi_shapes_json: JSON.stringify({ combine: 'union', shapes: [zone('通用区')] }),
    })])
    const { shapes, load } = useAlarmShapes()
    await load(K_C, 'intrusion')
    expect(shapes.value.map((s) => s.name)).toEqual(['通用区'])
  })
})
