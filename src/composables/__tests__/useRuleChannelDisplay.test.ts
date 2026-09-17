/**
 * useRuleChannelDisplay.test.ts — [CH-BINDING-DISPLAY 2026-09-14] 缺陷修复回归锁
 *
 * 背景 (真机截图 + 后端数据双取证): 5 场景页规则列表「绑定通道」列原只读
 * source_cond.channel_ids 判空 — 布防链路把真实绑定写入 bound_channel_ids /
 * device_ids / location_id 三源, channel_ids 恒空 ⇒ 一律误判「全部通道」
 * (真机 11 条周界规则 6 条误判)。
 *
 * 本测试注入 fake 目录 lookup (不触真网) 锁定修复后口径:
 *   ① 四源全空 → allChannels (真「全部通道」唯一入口; 含 undefined 防御);
 *   ② bound_channel_ids 命中通道目录 → 通道名 (通道级精确绑定);
 *   ③ device_ids 命中设备目录 → 展开该设备全部通道 (勾设备 = 全部通道语义);
 *   ④ 设备无通道数据 → 设备名兜底;
 *   ⑤ channel_ids int32 → 哈希反投影; 反投影不中 →「监控点 <n>」诚实兜底;
 *   ⑥ location_id 命中计入 / 反查不中忽略;
 *   ⑦ _chN 归一去重 (bound ⊕ 设备展开重叠只留一条);
 *   ⑧ 空串/非法项剔除; 反查不中绝不回退「全部通道」(核心防回归);
 *   ⑨ tooltip 顿号拼接; 真机形态复刻 (bound+dev 双源 → 多 chip)。
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/api/channel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/channel')>()
  return { ...actual, channelApi: { ...actual.channelApi, getList: vi.fn() } }
})
vi.mock('@/api/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/device')>()
  return { ...actual, deviceApi: { ...actual.deviceApi, getList: vi.fn() } }
})

import { baseChannelId, type ChannelBrief } from '../useAlarmDeviceLabel'
import {
  displayRuleBoundChannels,
  type RuleChannelLookup,
} from '../useRuleChannelDisplay'

// ── fake 目录 (形态贴近真机: 设备 id 16 位内部码 / 通道 20 位国标码) ──
const CH_A = '11010500001110000001'                // 通道: 周界测试摄像头 照楼下 通道01
const CH_B1 = '1101050000111000000201'             // 通道: 华盾互联办公室摄像头 通道01
const CH_B2 = '1101050000111000000202'             // 通道: 华盾互联办公室摄像头 通道02 (base)
const DEV_A = '13120000001320002001'               // 设备: 周界测试摄像头 照楼下
const DEV_B = '13120000001320002002'               // 设备: 华盾互联办公室摄像头
const DEV_C = '13120000001320002003'               // 设备: 华盾展厅东门 (无通道数据)
const HASH_A = 1225162990                          // CH_A 的 int32 截断哈希 (假值, 仅作匹配键)

const chNames = new Map<string, string>([
  [CH_A, '周界测试摄像头 照楼下 通道01'],
  [CH_B1, '华盾互联办公室摄像头 通道01'],
  [CH_B2, '华盾互联办公室摄像头 通道02'],
])
const devNames = new Map<string, string>([
  [DEV_A, '周界测试摄像头 照楼下'],
  [DEV_B, '华盾互联办公室摄像头'],
  [DEV_C, '华盾展厅东门'],
])
const devChs = new Map<string, ChannelBrief[]>([
  [DEV_A, [{ raw: CH_A, base: CH_A, name: '周界测试摄像头 照楼下 通道01' }]],
  [DEV_B, [
    { raw: CH_B1, base: CH_B1, name: '华盾互联办公室摄像头 通道01' },
    { raw: `${CH_B2}_ch0`, base: CH_B2, name: '华盾互联办公室摄像头 通道02' },
  ]],
])

/** 注入面 (复刻 useAlarmDeviceLabel 真实行为: raw/base 双形态互认) */
const fakeLookup: RuleChannelLookup = {
  chNameOf: (id) =>
    chNames.get(String(id ?? '').trim()) ?? chNames.get(baseChannelId(id)) ?? '',
  devNameOf: (id) => devNames.get(baseChannelId(id)) ?? '',
  devChannelsOf: (id) => devChs.get(baseChannelId(id)) ?? [],
  findChannelByHash: (h) =>
    h === HASH_A ? { raw: CH_A, base: CH_A, name: '周界测试摄像头 照楼下 通道01' } : undefined,
}

function labels(items: { label: string }[]): string[] {
  return items.map((i) => i.label)
}

describe('displayRuleBoundChannels 四源综合展示 (CH-BINDING-DISPLAY)', () => {
  it('① 四源全空 → allChannels (唯一「全部通道」入口)', () => {
    const r1 = displayRuleBoundChannels(
      { source_cond: { channel_ids: [], device_ids: [] }, spatial_cond: { bound_channel_ids: [], location_id: '' } },
      fakeLookup,
    )
    expect(r1.allChannels).toBe(true)
    expect(r1.items).toEqual([])
    expect(r1.tooltip).toBe('')
    // undefined 防御: 字段缺失同样视为未限定
    expect(displayRuleBoundChannels({}, fakeLookup).allChannels).toBe(true)
    expect(displayRuleBoundChannels({ source_cond: null, spatial_cond: null }, fakeLookup).allChannels).toBe(true)
  })

  it('② bound_channel_ids 命中 → 通道名 (通道级精确绑定)', () => {
    const r = displayRuleBoundChannels(
      { spatial_cond: { bound_channel_ids: [CH_A] } }, fakeLookup,
    )
    expect(r.allChannels).toBe(false)
    expect(labels(r.items)).toEqual(['周界测试摄像头 照楼下 通道01'])
    expect(r.items[0].raw).toBe(CH_A)
  })

  it('③ device_ids 命中设备 → 展开该设备全部通道 (勾设备语义)', () => {
    const r = displayRuleBoundChannels(
      { source_cond: { device_ids: [DEV_B] } }, fakeLookup,
    )
    expect(r.allChannels).toBe(false)
    expect(labels(r.items)).toEqual([
      '华盾互联办公室摄像头 通道01',
      '华盾互联办公室摄像头 通道02',
    ])
  })

  it('④ 设备无通道数据 → 设备名兜底 (不误判全通道)', () => {
    const r = displayRuleBoundChannels(
      { source_cond: { device_ids: [DEV_C] } }, fakeLookup,
    )
    expect(r.allChannels).toBe(false)
    expect(labels(r.items)).toEqual(['华盾展厅东门'])
  })

  it('⑤ channel_ids int32 → 哈希反投影; 反投影不中 →「监控点 <n>」诚实兜底', () => {
    const r = displayRuleBoundChannels(
      { source_cond: { channel_ids: [HASH_A, 999] } }, fakeLookup,
    )
    expect(r.allChannels).toBe(false)
    expect(labels(r.items)).toEqual(['周界测试摄像头 照楼下 通道01', '监控点 999'])
  })

  it('⑥ location_id 命中计入 / 反查不中忽略 (位置文本非通道域不误导)', () => {
    const hit = displayRuleBoundChannels(
      { spatial_cond: { location_id: DEV_A } }, fakeLookup,
    )
    expect(hit.allChannels).toBe(false)
    expect(labels(hit.items)).toEqual(['周界测试摄像头 照楼下 通道01'])
    // 纯位置文本反查不中 → 忽略; 与其他源同空时仍为全通道 (不无中生有)
    const miss = displayRuleBoundChannels(
      { spatial_cond: { location_id: '展厅一层东侧' } }, fakeLookup,
    )
    expect(miss.allChannels).toBe(true)
    expect(miss.items).toEqual([])
  })

  it('⑦ _chN 归一去重: bound (子码流形态) ⊕ 设备展开 (主形态) 只留一条', () => {
    const r = displayRuleBoundChannels(
      { spatial_cond: { bound_channel_ids: [`${CH_A}_ch0`] }, source_cond: { device_ids: [DEV_A] } },
      fakeLookup,
    )
    expect(r.allChannels).toBe(false)
    expect(r.items).toHaveLength(1)
    expect(r.items[0].label).toBe('周界测试摄像头 照楼下 通道01')
  })

  it('⑧ 空串/非法项剔除; 反查不中绝不回退「全部通道」(核心防回归)', () => {
    const junk = displayRuleBoundChannels(
      {
        source_cond: { channel_ids: ['abc', 0, null], device_ids: [null, '   ', true, {}] },
        spatial_cond: { bound_channel_ids: ['', '  ', null, undefined] },
      },
      fakeLookup,
    )
    expect(junk.allChannels).toBe(true)

    // 目录未就绪窗口期: 合法形态但反查不中 → 原始标识兜底 (监控点 <id>), 非全通道
    const UNKNOWN = '13999999999999999999'
    const pending = displayRuleBoundChannels(
      { spatial_cond: { bound_channel_ids: ['', UNKNOWN] } }, fakeLookup,
    )
    expect(pending.allChannels).toBe(false)
    expect(labels(pending.items)).toEqual([`监控点 ${UNKNOWN}`])
  })

  it('⑨ tooltip 顿号拼接 + 真机形态复刻 (bound+dev 双源 → 多 chip)', () => {
    const r = displayRuleBoundChannels(
      {
        source_cond: { channel_ids: [], device_ids: [DEV_A] },
        spatial_cond: { bound_channel_ids: [CH_B1], location_id: '' },
      },
      fakeLookup,
    )
    expect(r.allChannels).toBe(false)
    expect(labels(r.items)).toEqual([
      '华盾互联办公室摄像头 通道01',
      '周界测试摄像头 照楼下 通道01',
    ])
    expect(r.tooltip).toBe('华盾互联办公室摄像头 通道01、周界测试摄像头 照楼下 通道01')
  })
})
