// @ts-nocheck
/**
 * @file alarm.test.ts — [P4 2026-09-10] normalizeAlarmCore ai_review 取数断层修复验收
 *
 * 背景: 后端 AlarmRetractionService 回写 metadata.ai_review (verdict/confidence/
 *       verifier/reviewed_at/latency_ms/reason) 且 API 透出全量 metadata, 但原
 *       normalizeAlarmCore 只读顶层 ai_conclusion (后端不存在) → AI 复核恒空。
 * 覆盖: parseAiReview 各形态 (snake/camel/缺失/非法/占位) + aiConclusion 兜底链
 *       + aiReviewText/aiReviewVerdictLabel 锚点词契约 ('误报'/'真告警' 供
 *       EventsView 短标/筛选分类消费)。
 */
import { describe, it, expect } from 'vitest'
import { normalizeAlarmCore, aiReviewText, aiReviewVerdictLabel } from '@/types/alarm'

const BASE_RAW = { id: 'al-1', type: 'person_intrusion', description: '测试告警' }

describe('normalizeAlarmCore — metadata.ai_review 结构化解析', () => {
  it('全字段 snake_case 解析 (后端回写形态)', () => {
    const a = normalizeAlarmCore({
      ...BASE_RAW,
      metadata: {
        ai_review: {
          verdict: 'retracted', confidence: 0.92, verifier: 'VLM',
          reviewed_at: 1700000000000, latency_ms: 830, reason: '画面无人员活动',
        },
      },
    })
    expect(a.aiReview).toBeDefined()
    expect(a.aiReview.verdict).toBe('retracted')
    expect(a.aiReview.confidence).toBeCloseTo(0.92)
    expect(a.aiReview.verifier).toBe('VLM')
    expect(a.aiReview.reviewedAt).toBe(new Date(1700000000000).toISOString())
    expect(a.aiReview.latencyMs).toBe(830)
    expect(a.aiReview.reason).toBe('画面无人员活动')
  })

  it('camelCase 键兼容 (aiReview.reviewedAt)', () => {
    const a = normalizeAlarmCore({
      ...BASE_RAW,
      metadata: { aiReview: { verdict: 'confirmed', reviewedAt: 1700000000001 } },
    })
    expect(a.aiReview.verdict).toBe('confirmed')
    expect(a.aiReview.reviewedAt).toBe(new Date(1700000000001).toISOString())
  })

  it('缺 ai_review → aiReview undefined', () => {
    const a = normalizeAlarmCore({ ...BASE_RAW, metadata: { bbox: [] } })
    expect(a.aiReview).toBeUndefined()
  })

  it('metadata 缺失 → aiReview undefined', () => {
    const a = normalizeAlarmCore({ ...BASE_RAW })
    expect(a.aiReview).toBeUndefined()
  })

  it('ai_review 非法形态 (数组/字符串) → undefined', () => {
    const arr = normalizeAlarmCore({ ...BASE_RAW, metadata: { ai_review: [] } })
    expect(arr.aiReview).toBeUndefined()
    const str = normalizeAlarmCore({ ...BASE_RAW, metadata: { ai_review: 'confirmed' } })
    expect(str.aiReview).toBeUndefined()
  })

  it('verdict+reason 全空占位对象 → undefined (不产空结构)', () => {
    const a = normalizeAlarmCore({ ...BASE_RAW, metadata: { ai_review: { confidence: 0.5 } } })
    expect(a.aiReview).toBeUndefined()
  })

  it('verdict 空 reason 有 → verdict 兜底 unverified', () => {
    const a = normalizeAlarmCore({
      ...BASE_RAW, metadata: { ai_review: { reason: '仅记录' } },
    })
    expect(a.aiReview.verdict).toBe('unverified')
  })

  it('reviewed_at 缺失/0 → reviewedAt 空串', () => {
    const a = normalizeAlarmCore({
      ...BASE_RAW, metadata: { ai_review: { verdict: 'confirmed', reviewed_at: 0 } },
    })
    expect(a.aiReview.reviewedAt).toBe('')
  })
})

describe('aiConclusion 兜底链 (顶层 ai_conclusion 不存在 → ai_review 恢复取数)', () => {
  it('顶层 ai_conclusion 存在时优先 (不被 ai_review 覆盖)', () => {
    const a = normalizeAlarmCore({
      ...BASE_RAW,
      ai_conclusion: '顶层既有结论',
      metadata: { ai_review: { verdict: 'retracted', reason: '底层结论' } },
    })
    expect(a.aiConclusion).toBe('顶层既有结论')
  })

  it('顶层缺省 + retracted → 「误报：reason」兜底', () => {
    const a = normalizeAlarmCore({
      ...BASE_RAW,
      metadata: { ai_review: { verdict: 'retracted', reason: '画面无人员活动' } },
    })
    expect(a.aiConclusion).toBe('误报：画面无人员活动')
  })

  it('顶层缺省 + confirmed → 「真告警：reason」兜底', () => {
    const a = normalizeAlarmCore({
      ...BASE_RAW,
      metadata: { ai_review: { verdict: 'confirmed', reason: '人员越界清晰' } },
    })
    expect(a.aiConclusion).toBe('真告警：人员越界清晰')
  })

  it('无任何复核数据 → aiConclusion 空串 (不产 undefined)', () => {
    const a = normalizeAlarmCore({ ...BASE_RAW })
    expect(a.aiConclusion).toBe('')
  })
})

describe('deviceId 链 — 二次归一化幂等 (FIX devcode-idem 2026-09-18)', () => {
  /** 模拟弹窗链: AlarmsView 列表行 (已归一化对象) → showAlarmPopup 再 normalize。
   *  隐患: metadata 白名单 `...gov` 展开携带原始治理 device_id (通道码), 二次归一
   *  化时覆盖已算好的父设备号 → 弹窗「设备编号」+ 回放 query device_id 用通道码
   *  → 后端 device==channel 误判 NVR 自查 skip RecordInfo → 0 条「无录像可用」。 */
  it('列表行二次归一化: camel deviceId (父设备号) 不被 metadata 通道码覆盖', () => {
    const first = normalizeAlarmCore({
      id: 'al-dc-1', type: 'camera_tamper', description: '视频遮挡',
      device_id: '34020000001320002002',        // 告警库形态: 通道码
      device_admin_id: '34020000001180000002',  // REST enrich: 父设备码
      metadata: [{ device_id: '34020000001320002002', algo_id: 'camera_tamper' }],
    })
    expect(first.deviceId).toBe('34020000001180000002')
    // 二次归一化 (弹窗链): 修复前 = 通道码 (md.device_id 命中), 修复后 = 父设备号
    const second = normalizeAlarmCore(first)
    expect(second.deviceId).toBe('34020000001180000002')
  })

  it('camel deviceId 单源 (无 admin 字段) 优先于 metadata 通道码', () => {
    const a = normalizeAlarmCore({
      id: 'al-dc-2', type: 'camera_tamper', description: '视频遮挡',
      deviceId: '34020000001180000002',
      metadata: { device_id: '34020000001320002002' },
    })
    expect(a.deviceId).toBe('34020000001180000002')
  })

  it('裸 API 行不受影响: 无 admin/camel → device_id 兜底行为保持', () => {
    const a = normalizeAlarmCore({
      id: 'al-dc-3', type: 'camera_tamper', description: '视频遮挡',
      device_id: '34020000001320002002',
    })
    expect(a.deviceId).toBe('34020000001320002002')
  })
})

describe('aiReviewText / aiReviewVerdictLabel 锚点词契约', () => {
  it('retracted → 误报：reason (EventsView 筛选「误报」锚点)', () => {
    expect(aiReviewText({ verdict: 'retracted', reason: '树影晃动' }))
      .toBe('误报：树影晃动')
    expect(aiReviewVerdictLabel({ verdict: 'retracted' })).toBe('误报')
  })

  it('confirmed → 真告警：reason (筛选「真告警」锚点)', () => {
    expect(aiReviewText({ verdict: 'confirmed', reason: '目标明确' }))
      .toBe('真告警：目标明确')
    expect(aiReviewVerdictLabel({ verdict: 'confirmed' })).toBe('真事件')
  })

  it('unverified → 空文案 / 未复核短标', () => {
    expect(aiReviewText({ verdict: 'unverified', reason: '' })).toBe('')
    expect(aiReviewVerdictLabel({ verdict: 'unverified' })).toBe('未复核')
  })

  it('undefined → 空文案 / 未复核短标', () => {
    expect(aiReviewText(undefined)).toBe('')
    expect(aiReviewVerdictLabel(undefined)).toBe('未复核')
  })

  it('未知 verdict → reason 原文 / 已复核 (前向兼容)', () => {
    expect(aiReviewText({ verdict: 'pending_v2', reason: '复核排队中' })).toBe('复核排队中')
    expect(aiReviewVerdictLabel({ verdict: 'pending_v2' })).toBe('已复核')
  })

  it('无 reason 时文案不带冒号', () => {
    expect(aiReviewText({ verdict: 'retracted', reason: '' })).toBe('误报')
  })
})
