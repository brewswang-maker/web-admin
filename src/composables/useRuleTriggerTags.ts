/**
 * @file useRuleTriggerTags.ts
 * @brief 规则「触发条件」列 + 「报警级别」列展示统一口径 (5 场景 + 安检规则实例页共用)
 *
 * [TRIGGER-DETAIL 2026-09-14] 需求背景:
 *   各场景规则实例列表重构为: 序号 / 报警级别 / 事件类型 / 联动规则名称 /
 *   绑定设备通道 / 状态 / 触发条件 / 操作。触发条件列与平台管理→联动规则页
 *   事件规则列表项逐字对齐 — 本文件将 LinkageRuleView.getActiveConditions
 *   抽取为 SSOT (平台页改为调用本文件, 两处渲染永不漂移):
 *     时间 / 空间 / 事件源 / 合并 四类标签; 全空 = 无条件。
 *
 * 报警级别口径 (与安检规则页「级别」列同源):
 *   source_cond.min_severity (0/缺省 = 不限) → 词汇 SEVERITY_LEVELS
 *   (1 通知 / 2 低危 / 3 中危 / 4 高危 / 5 严重);
 *   语色阈值与安检 sevTagType 一致 (>=4 danger, ==3 warning, else info)。
 */

/** 规则触发面相 (LinkageRule 子集, 避免页面类型循环依赖) */
export interface RuleTriggerLike {
  time_cond?: {
    time_start?: unknown
    time_end?: unknown
    weekdays?: unknown[] | null
    monthdays?: unknown[] | null
  } | null
  spatial_cond?: {
    region_id?: unknown
    location_id?: unknown
    area_id?: unknown
    /** 旧键 (area_id 更名前存量规则), 只读兼容 */
    device_group_id?: unknown
    roi_polygon?: unknown[] | null
    tripwire_id?: unknown
    direction?: unknown
    roi_shapes_json?: unknown
  } | null
  source_cond?: {
    event_types?: unknown[] | null
    channel_ids?: unknown[] | null
    algorithm_ids?: unknown[] | null
    min_severity?: number | null
  } | null
  merge_cond?: {
    enabled?: unknown
  } | null
}

/** 触发条件标签 (key 供 :key/测试断言, label 展示文本) */
export interface RuleTriggerTag {
  key: string
  label: string
}

/**
 * 规则激活的触发条件标签集 (平台 LinkageRuleView 同款逻辑, 逐字迁移):
 * 四类 — time(时间)/spatial(空间)/source(事件源)/merge(合并); 全空 = 无条件。
 */
export function ruleTriggerTags(rule: RuleTriggerLike): RuleTriggerTag[] {
  const tags: RuleTriggerTag[] = []
  const tc = rule.time_cond
  if (tc && (tc.time_start || tc.time_end || tc.weekdays?.length || tc.monthdays?.length))
    tags.push({ key: 'time', label: '🕐 时间' })
  const sc = rule.spatial_cond
  if (sc && (sc.region_id || sc.location_id || sc.area_id || sc.device_group_id || sc.roi_polygon?.length || sc.tripwire_id || sc.direction || sc.roi_shapes_json))
    tags.push({ key: 'spatial', label: '📍 空间' })
  const src = rule.source_cond
  if (src && (src.event_types?.length || src.channel_ids?.length || src.algorithm_ids?.length))
    tags.push({ key: 'source', label: '🎯 事件源' })
  const mc = rule.merge_cond
  if (mc && mc.enabled)
    tags.push({ key: 'merge', label: '🔄 合并' })
  return tags
}

/** 报警级别词汇 (与安检规则页 SEVERITY_LEVELS 同源, 1-based 5 级制) */
export const RULE_SEVERITY_LEVELS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1 通知' },
  { value: 2, label: '2 低危' },
  { value: 3, label: '3 中危' },
  { value: 4, label: '4 高危' },
  { value: 5, label: '5 严重' },
]

/** 报警级别展示结构 */
export interface RuleLevelInfo {
  /** 展示文本: '不限' | '通知' | '低危' | '中危' | '高危' | '严重' */
  label: string
  /** el-tag type 语色 (阈值与安检 sevTagType 一致) */
  tagType: 'danger' | 'warning' | 'info'
  /** 归一后 min_severity (0=不限) */
  severity: number
}

/** 规则 source_cond.min_severity → 报警级别展示 (0/缺省/越界 = 不限) */
export function ruleLevelInfo(minSeverity?: number | null): RuleLevelInfo {
  const raw = Number(minSeverity ?? 0)
  const s = Number.isFinite(raw) ? Math.trunc(raw) : 0
  if (s >= 1 && s <= 5) {
    return {
      label: RULE_SEVERITY_LEVELS[s - 1].label.split(' ')[1],
      tagType: s >= 4 ? 'danger' : s === 3 ? 'warning' : 'info',
      severity: s,
    }
  }
  return { label: '不限', tagType: 'info', severity: 0 }
}
