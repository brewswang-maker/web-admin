/**
 * @file LinkageRuleView.cascade.test.ts
 * @brief 空间条件 UI 修复 [FIX area-cascade-label 2026-09-11] 纯函数回归
 *
 * 覆盖 (用户验收: 保存后回显通道名为「通道名 (设备名)」格式, 而非数字串):
 *   1. friendlyChannelLabelOf 三形态 (设备名/IP/裸名)
 *   2. channelFallbackLabel 四段降级 (池命中/子码流/目录通道名/目录设备名/兜底)
 *   3. narrowChannelsToArea 区域收窄双形态 (20 位主形态 vs _chN 子码流)
 *   4. narrowSnapshotChannels 快照池收窄 (区域过滤无关通道 + 绑定通道并入)
 *   5. narrowSnapshotChannels 回显兜底: 池外 20 位串 currentId → 目录反查 label
 *   6. narrowSnapshotChannels 未选区域 → 全量维持 (现状不变)
 */
import { describe, it, expect } from 'vitest'
import {
  friendlyChannelLabelOf,
  channelFallbackLabel,
  narrowChannelsToArea,
  narrowSnapshotChannels,
  type FriendlyChannelLike,
} from '@/composables/useFriendlyChannelLabel'

const pool: FriendlyChannelLike[] = [
  { label: '前门', value: '34020000001320000001', deviceName: '前门半球', deviceIp: '192.168.1.10' },
  { label: '大厅', value: '34020000001320000002_ch0', deviceName: '大厅枪机' },
  { label: '周界东', value: '34020000001320000003', deviceIp: '192.168.1.11' },
  { label: '停车场', value: '34020000001320000004' },
  { label: '后巷(NVR子通道)', value: '34020000001320000005_ch1', deviceName: '后巷NVR' },
]

describe('friendlyChannelLabelOf 三形态', () => {
  it('设备名优先 → 「通道名 (设备名)」', () => {
    expect(friendlyChannelLabelOf(pool[0]!)).toBe('前门 (前门半球)')
  })
  it('无设备名有 IP → 「通道名 · IP」; 都无 → 裸通道名', () => {
    expect(friendlyChannelLabelOf(pool[2]!)).toBe('周界东 · 192.168.1.11')
    expect(friendlyChannelLabelOf(pool[3]!)).toBe('停车场')
  })
})

describe('channelFallbackLabel 四段降级 (症状 3: 回显不裸显数字)', () => {
  const dir = {
    chNameOf: (id: unknown) => (id === '34020000001320000009' ? '仓库顶' : ''),
    devNameOf: (id: unknown) => (id === '34020000001320000008' ? '围墙球机' : ''),
  }

  it('① 池命中 (主形态) → 友好 label', () => {
    expect(channelFallbackLabel('34020000001320000001', pool)).toBe('前门 (前门半球)')
  })
  it('① 池命中 (子码流 base 双形态) → 友好 label + (子码流) 后缀', () => {
    expect(channelFallbackLabel('34020000001320000002_ch1', pool)).toBe('大厅 (大厅枪机) (子码流)')
  })
  it('② 池不中, 目录通道名反查命中', () => {
    expect(channelFallbackLabel('34020000001320000009', pool, dir)).toBe('仓库顶')
  })
  it('③ 目录设备名反查命中 → 「设备名 通道 <id>」; ④ 全不中 → 「通道 <id>」', () => {
    expect(channelFallbackLabel('34020000001320000008_ch0', pool, dir)).toBe('围墙球机 通道 34020000001320000008_ch0')
    expect(channelFallbackLabel('9999', pool, dir)).toBe('通道 9999')
  })
})

describe('narrowChannelsToArea 区域收窄 (双形态)', () => {
  it('resolved 20 位主形态匹配剥后缀 value; extra 注入去重', () => {
    const out = narrowChannelsToArea(
      pool,
      ['34020000001320000002', '34020000001320000004'],
      ['34020000001320000005_ch1', '34020000001320000002'],
    )
    // 大厅 (_ch0 剥后缀命中 resolved[0]) + 停车场 + 后巷子通道 (extra)
    expect(out.map(c => c.value)).toEqual([
      '34020000001320000002_ch0',
      '34020000001320000004',
      '34020000001320000005_ch1',
    ])
  })
  it('resolved 为空 → 不收窄 (返回空集, 调用方应短路为全量)', () => {
    expect(narrowChannelsToArea(pool, [], [])).toEqual([])
  })
})

describe('narrowSnapshotChannels 快照背景池 (症状 2/3 主链路)', () => {
  it('区域已选: 无关通道被过滤, 绑定通道并入, label 全部友好化', () => {
    const out = narrowSnapshotChannels(
      pool,
      ['34020000001320000002'],
      ['34020000001320000004'],
      '',
    )
    expect(out.map(c => c.label)).toEqual(['大厅 (大厅枪机)', '停车场'])
  })

  it('保存后回显: 池外 20 位串 currentId → 目录反查 label (非数字串)', () => {
    const out = narrowSnapshotChannels(
      pool,
      ['34020000001320000002'],
      [],
      '34020000001320000009',
      { chNameOf: (id) => (id === '34020000001320000009' ? '仓库顶' : '') },
    )
    expect(out.map(c => c.value)).toEqual(['34020000001320000002_ch0', '34020000001320000009'])
    expect(out[1]!.label).toBe('仓库顶')
    expect(out[1]!.label).not.toMatch(/^\d+$/) // 禁止裸显数字串
  })

  it('未选区域 → 全量摄像头维持现状, 友好 label 化', () => {
    const out = narrowSnapshotChannels(pool, [], [], '')
    expect(out).toHaveLength(pool.length)
    expect(out[0]!.label).toBe('前门 (前门半球)')
  })
})
