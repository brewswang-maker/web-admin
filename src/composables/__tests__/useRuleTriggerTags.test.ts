/**
 * useRuleTriggerTags.test.ts — [TRIGGER-DETAIL 2026-09-14] 触发条件列 +
 * 报警级别列展示口径回归锁
 *
 * 背景: 5 场景规则实例页 + 安检规则页新增「触发条件」列, 与平台管理→联动规则页
 * 事件规则列表项逐字对齐 (LinkageRuleView.getActiveConditions 抽取为 SSOT,
 * 平台页改为委托调用 — 本文件锁定抽取后行为, 防两处渲染漂移)。
 *
 * 锁定口径:
 *   ① 四类全空 / 字段缺失 → [] (渲染层展示「无条件」唯一入口);
 *   ② time: time_start / time_end / weekdays / monthdays 任一非空激活;
 *   ③ spatial: region_id / location_id / area_id / device_group_id(旧键) /
 *      roi_polygon / tripwire_id / direction / roi_shapes_json 任一非空激活;
 *   ④ source: event_types / channel_ids / algorithm_ids 任一非空激活;
 *   ⑤ merge: enabled 真值激活; falsy 不激活;
 *   ⑥ 顺序固定 time→spatial→source→merge; label 与平台页逐字一致;
 *   ⑦ ruleLevelInfo: 0/缺省/越界 = 不限; 1-5 词汇与语色阈值 (≥4 danger / ==3 warning);
 *   ⑧ 脏数据防御: 浮点截断 / 数字字符串 / NaN → 不抛不歪;
 *   ⑨ RULE_SEVERITY_LEVELS 5 级制词汇 (与安检规则页 SEVERITY_LEVELS 同源)。
 */
import { describe, it, expect } from 'vitest'
import {
  ruleTriggerTags,
  ruleLevelInfo,
  RULE_SEVERITY_LEVELS,
  type RuleTriggerLike,
} from '../useRuleTriggerTags'

function keys(rule: RuleTriggerLike): string[] {
  return ruleTriggerTags(rule).map((t) => t.key)
}

describe('ruleTriggerTags 触发条件标签 (TRIGGER-DETAIL)', () => {
  it('① 四类全空/字段缺失 → 空标签集 (渲染层「无条件」唯一入口)', () => {
    expect(ruleTriggerTags({})).toEqual([])
    expect(
      ruleTriggerTags({ time_cond: null, spatial_cond: null, source_cond: null, merge_cond: null }),
    ).toEqual([])
    // 空数组/空串均不算激活 (与平台页判空口径一致)
    expect(
      keys({
        time_cond: { weekdays: [], monthdays: [] },
        spatial_cond: { roi_polygon: [] },
        source_cond: { event_types: [], channel_ids: [], algorithm_ids: [] },
        merge_cond: { enabled: false },
      }),
    ).toEqual([])
  })

  it('② time 条件任一子字段非空 → 🕐 时间', () => {
    expect(keys({ time_cond: { time_start: '08:00' } })).toEqual(['time'])
    expect(keys({ time_cond: { time_end: '18:00' } })).toEqual(['time'])
    expect(keys({ time_cond: { weekdays: [1, 2] } })).toEqual(['time'])
    expect(keys({ time_cond: { monthdays: [1] } })).toEqual(['time'])
  })

  it('③ spatial 条件 8 键任一非空 → 📍 空间 (含旧键 device_group_id 兼容)', () => {
    expect(keys({ spatial_cond: { region_id: 'r1' } })).toEqual(['spatial'])
    expect(keys({ spatial_cond: { location_id: '14000000000000000001' } })).toEqual(['spatial'])
    expect(keys({ spatial_cond: { area_id: 'a1' } })).toEqual(['spatial'])
    // 旧键 (area_id 更名前存量规则), 只读兼容
    expect(keys({ spatial_cond: { device_group_id: 'g1' } })).toEqual(['spatial'])
    expect(keys({ spatial_cond: { roi_polygon: [1, 2, 3, 4] } })).toEqual(['spatial'])
    expect(keys({ spatial_cond: { tripwire_id: 't1' } })).toEqual(['spatial'])
    expect(keys({ spatial_cond: { direction: 'in' } })).toEqual(['spatial'])
    expect(keys({ spatial_cond: { roi_shapes_json: '{"a":1}' } })).toEqual(['spatial'])
  })

  it('④ source 条件 3 键任一非空 → 🎯 事件源', () => {
    expect(keys({ source_cond: { event_types: ['intrusion'] } })).toEqual(['source'])
    expect(keys({ source_cond: { channel_ids: [1] } })).toEqual(['source'])
    expect(keys({ source_cond: { algorithm_ids: ['yolov8'] } })).toEqual(['source'])
  })

  it('⑤ merge 仅 enabled 真值激活; falsy/缺省不激活', () => {
    expect(ruleTriggerTags({ merge_cond: { enabled: true } })[0]).toEqual({
      key: 'merge',
      label: '🔄 合并',
    })
    expect(keys({ merge_cond: { enabled: 0 } })).toEqual([])
    expect(keys({ merge_cond: {} })).toEqual([])
  })

  it('⑥ 组合: 顺序固定 time→spatial→source→merge; label 与平台页逐字一致', () => {
    const tags = ruleTriggerTags({
      // 乱序传入, 断言输出顺序固定
      merge_cond: { enabled: 1 },
      source_cond: { event_types: ['fight'] },
      spatial_cond: { region_id: 'r1' },
      time_cond: { time_start: '00:00', time_end: '23:59' },
    })
    expect(tags).toEqual([
      { key: 'time', label: '🕐 时间' },
      { key: 'spatial', label: '📍 空间' },
      { key: 'source', label: '🎯 事件源' },
      { key: 'merge', label: '🔄 合并' },
    ])
  })
})

describe('ruleLevelInfo 报警级别 (与安检规则页「级别」列同源)', () => {
  it('⑦ 0/缺省/越界 → 不限/info/0', () => {
    expect(ruleLevelInfo()).toEqual({ label: '不限', tagType: 'info', severity: 0 })
    expect(ruleLevelInfo(0)).toEqual({ label: '不限', tagType: 'info', severity: 0 })
    expect(ruleLevelInfo(null)).toEqual({ label: '不限', tagType: 'info', severity: 0 })
    expect(ruleLevelInfo(6)).toEqual({ label: '不限', tagType: 'info', severity: 0 })
    expect(ruleLevelInfo(-1)).toEqual({ label: '不限', tagType: 'info', severity: 0 })
  })

  it('⑧ 1-5 词汇与语色阈值 (≥4 danger / ==3 warning / 其余 info)', () => {
    expect(ruleLevelInfo(1)).toEqual({ label: '通知', tagType: 'info', severity: 1 })
    expect(ruleLevelInfo(2)).toEqual({ label: '低危', tagType: 'info', severity: 2 })
    expect(ruleLevelInfo(3)).toEqual({ label: '中危', tagType: 'warning', severity: 3 })
    expect(ruleLevelInfo(4)).toEqual({ label: '高危', tagType: 'danger', severity: 4 })
    expect(ruleLevelInfo(5)).toEqual({ label: '严重', tagType: 'danger', severity: 5 })
  })

  it('⑨ 脏数据防御: 浮点截断 / 数字字符串 / NaN → 不抛不歪', () => {
    expect(ruleLevelInfo(3.9)).toEqual({ label: '中危', tagType: 'warning', severity: 3 })
    expect(ruleLevelInfo('4' as unknown as number)).toEqual({
      label: '高危',
      tagType: 'danger',
      severity: 4,
    })
    expect(ruleLevelInfo(Number.NaN)).toEqual({ label: '不限', tagType: 'info', severity: 0 })
  })

  it('⑩ 词汇表 5 级制 (1 通知 ... 5 严重) — 与安检 SEVERITY_LEVELS 同源口径', () => {
    expect(RULE_SEVERITY_LEVELS.map((s) => s.value)).toEqual([1, 2, 3, 4, 5])
    expect(RULE_SEVERITY_LEVELS.map((s) => s.label.split(' ')[1])).toEqual([
      '通知',
      '低危',
      '中危',
      '高危',
      '严重',
    ])
  })
})
