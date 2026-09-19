import { describe, expect, it } from 'vitest'
import {
  buildEvidenceFrames,
  buildEvidenceSlots,
  hasEvidenceChain,
  evidenceAlgoHint,
  extractEvidenceTs,
  fmtEvidenceAbs,
  fmtEvidenceRel,
  isEvidencePostPending,
  resolveEvidenceLabels,
} from '@/utils/evidenceFrames'

// [EV-TRIPLE 2026-09-14] 取证帧语义共享模块单测 — 弹窗画廊 (AlarmPopup) 与
// 详情抽屉 (EvidenceFrames) 双处消费; 覆盖帧构建契约/语义标签三级链/
// evidence_ts 时间角标/post 采集中判定。

const T_MID = 1757222400000            // 触发时刻 (T+0 锚点)
const T_PRE = T_MID - 12000            // T-12s
const T_POST = T_MID + 6000            // T+6s

const URL_PRE = '/snapshots/evidence/ev_a_pre_snapshot_url.jpg'
const URL_MID = '/snapshots/evidence/ev_a_mid_snapshot_url.jpg'
const URL_POST = '/snapshots/evidence/ev_a_post_snapshot_url.jpg'

describe('buildEvidenceFrames', () => {
  it('三帧全写: pre→mid→post 固定序 + T-12s/T+0/T+6s 相对时间角标', () => {
    const frames = buildEvidenceFrames({
      pre_snapshot_url: URL_PRE,
      mid_snapshot_url: URL_MID,
      post_snapshot_url: URL_POST,
      evidence_ts: { pre: T_PRE, mid: T_MID, post: T_POST },
    }, 'intrusion')

    expect(frames.map(f => f.key)).toEqual(['pre', 'mid', 'post'])
    expect(frames.map(f => f.rel)).toEqual(['T-12s', 'T+0', 'T+6s'])
    expect(frames[0].label).toBe('入侵前')
    expect(frames[1].label).toBe('触发时刻')
    expect(frames[2].label).toBe('事后')
    expect(frames[0].abs).toBe(fmtEvidenceAbs(T_PRE))
  })

  it('契约过滤 (宁缺毋假): 非 data:image|/ 开头/非字符串一律不收', () => {
    const frames = buildEvidenceFrames({
      pre_snapshot_url: 'http://evil.example.com/x.jpg',  // 非 / 开头不收
      mid_snapshot_url: '',                                // 空串不收
      post_snapshot_url: 123 as unknown as string,         // 非字符串不收
    })
    expect(frames).toHaveLength(0)
  })

  it('rel 锚点退化: mid 缺失时用 alarmTsMs 作 T+0 基准', () => {
    const frames = buildEvidenceFrames({
      pre_snapshot_url: URL_PRE,
      evidence_ts: { pre: T_PRE },
    }, 'intrusion', T_MID)
    expect(frames).toHaveLength(1)
    expect(frames[0].rel).toBe('T-12s')
  })

  it('无 evidence_ts 时帧仍构建, rel/abs 缺省 (老告警兼容)', () => {
    const frames = buildEvidenceFrames({ pre_snapshot_url: URL_PRE }, 'intrusion')
    expect(frames).toHaveLength(1)
    expect(frames[0].rel).toBeUndefined()
    expect(frames[0].abs).toBeUndefined()
  })
})

describe('语义标签三级链', () => {
  it('algoId 尾段命中 (cluster.intrusion → intrusion)', () => {
    expect(resolveEvidenceLabels('cluster.intrusion', {}).pre).toBe('入侵前')
  })

  it('algoId 未命中 → metadata.algo_id 尾段 (SSOT 归一 canonical 名)', () => {
    expect(resolveEvidenceLabels('', { algo_id: 'some.abandoned' }).pre).toBe('遗留前')
  })

  it('前两级未命中 → description_key 首段 (personal_item.abandoned)', () => {
    expect(resolveEvidenceLabels('', { description_key: 'personal_item.abandoned' }).pre).toBe('遗留前')
  })

  it('全未命中 → 通用文案', () => {
    const l = resolveEvidenceLabels('', {})
    expect(l).toEqual({ pre: '事发前', mid: '过程中', post: '事发后' })
    expect(evidenceAlgoHint('', {})).toBe('取证帧')
  })
})

describe('extractEvidenceTs', () => {
  it('非数字/<=0 键忽略', () => {
    const ts = extractEvidenceTs({
      evidence_ts: { pre: T_PRE, mid: 'x', post: -1 },
    })
    expect(ts).toEqual({ pre: T_PRE })
  })
})

describe('fmtEvidenceRel / fmtEvidenceAbs', () => {
  it('相对角标四舍五入到秒; 锚点缺失返回空串', () => {
    expect(fmtEvidenceRel(T_MID + 6400, T_MID)).toBe('T+6s')
    expect(fmtEvidenceRel(T_MID - 5900, T_MID)).toBe('T-6s')
    expect(fmtEvidenceRel(T_MID, 0)).toBe('')
  })
})

describe('isEvidencePostPending (post 采集中占位)', () => {
  const now = Date.now()

  it('有 post → false', () => {
    expect(isEvidencePostPending(
      { post_snapshot_url: URL_POST, evidence_ts: { mid: now } }, 2, 0)).toBe(false)
  })

  it('无任何帧 → false (老告警不显示假占位)', () => {
    expect(isEvidencePostPending({ evidence_ts: { mid: now } }, 0, 0)).toBe(false)
  })

  it('新鲜告警 (mid 在 20s 内) → true', () => {
    expect(isEvidencePostPending(
      { pre_snapshot_url: URL_PRE, evidence_ts: { mid: now - 5000 } }, 1, 0)).toBe(true)
  })

  it('老告警 (>20s) → false', () => {
    expect(isEvidencePostPending(
      { pre_snapshot_url: URL_PRE, evidence_ts: { mid: now - 60000 } }, 1, 0)).toBe(false)
  })

  it('锚点退化 alarmTsMs (evidence_ts 缺失)', () => {
    expect(isEvidencePostPending({ pre_snapshot_url: URL_PRE }, 1, now - 3000)).toBe(true)
  })
})

// [EV-STABLE3 2026-09-19] 三格固定槽位 (画廊数量稳定化根治) — 每格必有产出,
// 缺失格携后端 missing_frames 原因码中文映射。
describe('buildEvidenceSlots (三格固定槽位)', () => {
  it('三帧全写: 三格 missing=false + 标签/相对角标', () => {
    const slots = buildEvidenceSlots({
      pre_snapshot_url: URL_PRE,
      mid_snapshot_url: URL_MID,
      post_snapshot_url: URL_POST,
      evidence_ts: { pre: T_PRE, mid: T_MID, post: T_POST },
    }, 'intrusion')
    expect(slots.map(s => s.key)).toEqual(['pre', 'mid', 'post'])
    expect(slots.every(s => !s.missing)).toBe(true)
    expect(slots[0].label).toBe('入侵前')
    expect(slots[1].rel).toBe('T+0')
  })

  it('缺失格占位 + missing_frames 原因码中文映射', () => {
    const slots = buildEvidenceSlots({
      mid_snapshot_url: URL_MID,
      missing_frames: { pre: 'same_as_mid', post: 'no_cache' },
    }, 'intrusion')
    expect(slots).toHaveLength(3)
    expect(slots[0].missing).toBe(true)
    expect(slots[0].missingReason).toBe('与触发帧相同')
    expect(slots[1].missing).toBe(false)
    expect(slots[2].missingReason).toBe('缓存未就绪')
  })

  it('无 missing_frames 字段 → 缺失格退通用「未采集」', () => {
    const slots = buildEvidenceSlots({ pre_snapshot_url: URL_PRE }, '')
    expect(slots).toHaveLength(3)
    expect(slots[1].missing).toBe(true)
    expect(slots[1].missingReason).toBe('未采集')
    expect(slots[2].missing).toBe(true)
  })

  it('未知原因码 → 「未采集」(前向兼容)', () => {
    const slots = buildEvidenceSlots({ missing_frames: { post: 'xx_future_code' } })
    expect(slots[2].missingReason).toBe('未采集')
  })
})

describe('hasEvidenceChain (取证链痕迹判定)', () => {
  it('任一帧字段 → true', () => {
    expect(hasEvidenceChain({ pre_snapshot_url: URL_PRE })).toBe(true)
  })

  it('仅 missing_frames → true (全缺但有链痕迹)', () => {
    expect(hasEvidenceChain({ missing_frames: { pre: 'no_cache' } })).toBe(true)
  })

  it('仅 evidence_ts → true', () => {
    expect(hasEvidenceChain({ evidence_ts: { mid: T_MID } })).toBe(true)
  })

  it('空 metadata / 纯主快照 → false (历史告警不标)', () => {
    expect(hasEvidenceChain({})).toBe(false)
    expect(hasEvidenceChain({ snapshot_url: '/x.jpg', missing_frames: {} })).toBe(false)
    expect(hasEvidenceChain(null)).toBe(false)
  })
})
