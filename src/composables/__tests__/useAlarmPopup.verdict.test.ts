/**
 * useAlarmPopup.verdict.test.ts — [SSOT R3 2026-09-12] golden case 双实现一致性 (前端侧)
 *
 * 依据: docs/plans/rule-algo-popup-ssot-refactor-v1.0.md §7.3 (P0-4)
 * 计划: 规则-算法-弹窗 SSOT 重构 R3 — 与后端 box-sdk/tests/test_alarm_verdict_contract.cpp
 *       的 GoldenCasesDualImplementation 读同一 fixture, 断言 findMatchingRule 兜底链
 *       与后端 matchAndVerdict 判定结果一致 (same alarm + same rules => same matched/rule_id)。
 *
 * 语义对齐说明 (fixture 用例设计时已核对双端实现):
 *   - G1 通道 hash 双形态: 前端 safeChannelHash(chIdStr)+baseId 集合 ↔ 后端 safeChannelHash
 *   - G2 >100 条规则尾部: 前端走 /rules/all 全量端点 (F1 事故修复) ↔ 后端全量遍历
 *   - G3 device_ids 双形态: 前端 alarmDevIds{deviceId,chIdStr,baseId} ↔ 后端 d==device_id||d==channel_id_str
 *   - G4 时间条件: 双端公式同源 (start<=end 含端点闭区间; start>end 跨天 now>=start||now<=end)
 *   - G5 别名展开: 仅使用子串兼容别名 (stranger ⊂ face_stranger); 非子串别名 (face_unknown)
 *     后端可展开而前端子串不命中, 属已知兼容差异, 不纳入本 fixture (判定权收归后端后
 *     兜底链仅服务旧后端兼容期, 见计划「操作门」)
 *   - G6 同告警双帧: findMatchingRule 无防抖语义 (防抖在 handleAlarm 本地状态),
 *     两帧均命中; debounced 期望为后端专属, 前端忽略
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/linkage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/linkage')>()
  return {
    ...actual,
    linkageApi: { ...actual.linkageApi, getAllRules: vi.fn() },
  }
})

import { linkageApi } from '@/api/linkage'
import type { LinkageRule } from '@/api/linkage'
import { findMatchingRule, invalidateRuleCache } from '../useAlarmPopup'
import type { AlarmEvent, AlarmType, AlarmLevel, AlarmStatus } from '@/types/alarm'
// [SSOT R3] 与后端 C++ 测试读同一 fixture (相对路径: src/composables/__tests__ → 仓库根)
import goldenRaw from '../../../../../box-sdk/tests/fixtures/verdict_golden_cases.json'

// ── fixture 类型 (宽松声明, 仅覆盖本测试消费的字段; 运行时以 JSON 实值为准) ──
interface GoldenSourceCond {
  event_types?: string[]
  channel_ids?: number[]
  device_ids?: string[]
  min_severity?: number
  min_confidence?: number
}
interface GoldenTimeCond {
  time_start?: string
  time_end?: string
  weekdays?: number[]
  monthdays?: number[]
}
interface GoldenRuleSpec {
  rule_id: string
  name?: string
  enabled?: boolean
  priority?: number
  cooldown_ms?: number
  popup_auto_close_s?: number
  time_cond?: GoldenTimeCond
  source_cond?: GoldenSourceCond
}
interface GoldenBulkSpec {
  count: number
  rule_id_prefix: string
  event_type_prefix: string
  priority?: number
  min_severity?: number
  min_confidence?: number
}
interface GoldenAlarm {
  type: string
  channel_id_str: string
  device_id: string
  severity: number
  confidence: number
}
interface GoldenExpected {
  matched: boolean | 'auto_cross_day'
  rule_id?: string
  auto_close_s?: number
  debounced?: boolean
}
interface GoldenFrame {
  alarm: GoldenAlarm
  expected: GoldenExpected
}
interface GoldenCaseDoc {
  id: string
  desc: string
  debounce_window_s?: number
  min_rule_total?: number
  bulk_rules?: GoldenBulkSpec
  rules: GoldenRuleSpec[]
  frames: GoldenFrame[]
}
const golden = goldenRaw as unknown as { version: number; cases: GoldenCaseDoc[] }

// ── 适配器: fixture → 前端原生形态 (与 C++ 侧 ruleFromFixtureJson/generateBulkRules 同规则) ──

const pad4 = (i: number) => String(i).padStart(4, '0')

function toFrontendRule(spec: GoldenRuleSpec): LinkageRule {
  const tc = spec.time_cond
  const sc = spec.source_cond
  return {
    id: spec.rule_id,
    name: spec.name ?? spec.rule_id,
    description: '',
    enabled: spec.enabled ?? true,
    priority: spec.priority ?? 50,
    cooldown_ms: spec.cooldown_ms ?? 0,
    time_cond: {
      time_start: tc?.time_start ?? '',
      time_end: tc?.time_end ?? '',
      weekdays: tc?.weekdays ?? [],
      monthdays: tc?.monthdays ?? [],
    },
    spatial_cond: {} as LinkageRule['spatial_cond'],
    source_cond: {
      channel_ids: sc?.channel_ids ?? [],
      device_ids: sc?.device_ids ?? [],
      event_types: sc?.event_types ?? [],
      min_severity: sc?.min_severity ?? 1,
      min_confidence: sc?.min_confidence ?? 0,
      algorithm_ids: [],
    },
    merge_cond: {} as LinkageRule['merge_cond'],
    actions: [],
    tags: [],
    popup_auto_close_s: spec.popup_auto_close_s ?? 0,
    created_by: '',
    created_at: 0,
    updated_at: 0,
  }
}

/** G2 bulk_rules 生成器: 与 C++ generateBulkRules 同规则 (前缀 + 4 位零填充) */
function buildCaseRules(c: GoldenCaseDoc): LinkageRule[] {
  const specs: GoldenRuleSpec[] = []
  if (c.bulk_rules) {
    const b = c.bulk_rules
    for (let i = 0; i < b.count; i++) {
      const suffix = pad4(i)
      specs.push({
        rule_id: `${b.rule_id_prefix}${suffix}`,
        name: `bulk ${b.rule_id_prefix}${suffix}`,
        priority: b.priority ?? 10,
        source_cond: {
          event_types: [`${b.event_type_prefix}${suffix}`],
          min_severity: b.min_severity ?? 1,
          min_confidence: b.min_confidence ?? 0,
        },
      })
    }
  }
  specs.push(...c.rules)
  return specs.map(toFrontendRule)
}

function toFrontendAlarm(a: GoldenAlarm): AlarmEvent {
  return {
    id: 'golden_case_alarm',
    type: a.type as AlarmType,
    level: 'medium' as AlarmLevel,
    description: 'golden case fixture alarm',
    channelId: a.channel_id_str,
    deviceId: a.device_id,
    confidence: a.confidence,
    status: 'unhandled' as AlarmStatus,
    metadata: { severityNum: a.severity },
    createdAt: '',
    updatedAt: '',
  }
}

/** 跨天/同日窗口公式 (与后端 crossDayWindowMatch / 前端 checkTimeCondition 同源) */
function crossDayWindowMatch(nowMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes
  }
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const getAllRulesMock = linkageApi.getAllRules as ReturnType<typeof vi.fn>

describe('verdict golden cases — fixture 双实现一致性 (R3)', () => {
  beforeEach(() => {
    getAllRulesMock.mockReset()
    invalidateRuleCache()
  })

  for (const c of golden.cases) {
    it(`${c.id}: ${c.desc}`, async () => {
      const rules = buildCaseRules(c)
      // mock 形态与 ensureRulesLoaded 消费链一致: { data: { data: { items } } }
      getAllRulesMock.mockResolvedValue({ data: { data: { items: rules, total: rules.length } } })
      invalidateRuleCache()

      if (c.min_rule_total) {
        expect(rules.length).toBeGreaterThanOrEqual(c.min_rule_total)
      }

      for (const frame of c.frames) {
        const alarm = toFrontendAlarm(frame.alarm)
        const ex = frame.expected

        if (ex.matched === 'auto_cross_day') {
          // G4: 按本地时钟推导期望 (分钟翻转竞态重试; 与 C++ 侧同策略)
          const tc = c.rules[0].time_cond
          const startMin = parseHHMM(tc?.time_start ?? '00:00')
          const endMin = parseHHMM(tc?.time_end ?? '00:00')
          let rule: LinkageRule | null = null
          let stableMinute = -1
          for (let attempt = 0; attempt < 3; attempt++) {
            const d0 = new Date()
            const minute0 = Math.floor(d0.getTime() / 60000)
            stableMinute = d0.getHours() * 60 + d0.getMinutes()
            rule = await findMatchingRule(alarm)
            if (Math.floor(Date.now() / 60000) === minute0) break
          }
          const expectedMatched = crossDayWindowMatch(stableMinute, startMin, endMin)
          expect(!!rule, `${c.id} frame ${frame.alarm.type} (cross_day)`).toBe(expectedMatched)
          if (expectedMatched) {
            expect(rule!.id).toBe(ex.rule_id)
          }
          continue
        }

        const rule = await findMatchingRule(alarm)
        if (ex.matched === true) {
          expect(rule, `${c.id} frame ${frame.alarm.type} 应命中`).toBeTruthy()
          expect(rule!.id).toBe(ex.rule_id)
          if (ex.auto_close_s !== undefined) {
            expect(rule!.popup_auto_close_s ?? 0).toBe(ex.auto_close_s)
          }
        } else {
          expect(rule, `${c.id} frame ${frame.alarm.type} 不应命中`).toBeNull()
        }
      }
    })
  }

  it('fixture 完整性: G1-G6 齐备且每 case 有 frames', () => {
    const ids = golden.cases.map((c) => c.id)
    expect(ids).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
    for (const c of golden.cases) {
      expect(c.frames.length, `${c.id} 缺 frames`).toBeGreaterThan(0)
      expect(c.rules.length, `${c.id} 缺 rules`).toBeGreaterThan(0)
    }
  })
})
