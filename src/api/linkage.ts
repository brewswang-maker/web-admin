/**
 * 华盾AI智能视频盒子 v7.0 - 联动规则 API
 * api/linkage.ts — 事件联动规则 CRUD + 日志查询
 * 与后端 LinkageEngine.h / RestApiHandlers.cpp 格式完全对齐
 */

import { http } from './http'
import type { ApiResponse, PageResponse, PageQuery } from '@/types/common'

// ── 动作类型枚举映射 ──

/** 前端动作类型字符串 → 后端整数值 */
export const ACTION_TYPE_MAP: Record<string, number> = {
  CLIENT_SHOW_LIVE: 100,
  CLIENT_SHOW_PLAYBACK: 101,
  CLIENT_SHOW_IMAGE: 102,
  CLIENT_VOICE_TALK: 103,
  CLIENT_PLAY_TONE: 104,
  CLIENT_TTS_BROADCAST: 105,
  CLIENT_OVERLAY_INFO: 106,
  CLIENT_SHOW_MAP: 107,
  CLIENT_SUPPRESS_POPUP: 108,
  CLIENT_EXECUTE_PLAN: 109,
  CLIENT_TV_WALL: 110,
  CLIENT_RECORD_VIDEO: 111,
  CLIENT_RECORD_EVENT: 112,
  CLIENT_ADD_BOOKMARK: 113,
  CLIENT_CAPTURE_IMAGE: 114,
  CLIENT_ALARM_OUTPUT: 115,
  CLIENT_PTZ_CONTROL: 116,
  CLIENT_PTZ_PRESET_START: 117,
  CLIENT_PTZ_PRESET_END: 118,
  CLIENT_PTZ_CRUISE: 119,
  CLIENT_PTZ_TRACK: 120,
  CLIENT_ACCESS_OPEN: 121,
  CLIENT_SEND_SMS: 122,
  CLIENT_SEND_EMAIL: 123,
  CLIENT_ALARM_MODE: 124,
  CLIENT_ESCALATE: 125,
  WEB_POPUP: 200,
  WEB_EMAIL: 201,
  WEB_WEBHOOK: 202,
  WEB_DASHBOARD_ALERT: 203,
  WEB_SHOW_LIVE: 210,
  WEB_SHOW_PLAYBACK: 211,
  WEB_SHOW_IMAGE: 212,
  WEB_PLAY_TONE: 213,
  WEB_TTS_BROADCAST: 214,
  WEB_CAPTURE_IMAGE: 215,
  WEB_SEND_SMS: 216,
  WEB_RECORD_EVENT: 217,
  APP_PUSH_NOTIFY: 300,
  APP_SHOW_LIVE: 301,
  APP_SHOW_IMAGE: 302,
  APP_SHOW_PLAYBACK: 303,
  APP_HANDLE_DISPOSE: 304,
  MP_SUBSCRIBE_MSG: 400,
  MP_SHOW_IMAGE: 401,
  MP_SHOW_LIVE: 402,
  SYS_MQTT_PUBLISH: 500,
  SYS_MODBUS_WRITE: 501,
  SYS_ONVIF_TRIGGER: 502,
  SYS_RELAY_SWITCH: 503,
  SYS_HTTP_CALLBACK: 504,
  SYS_CLOUD_FORWARD: 505,
}

/** 后端整数值 → 前端动作类型字符串 */
export const ACTION_TYPE_REVERSE_MAP: Record<number, string> = Object.fromEntries(
  Object.entries(ACTION_TYPE_MAP).map(([k, v]) => [v, k])
)

/** 根据动作类型字符串推断 target 枚举值 */
export function getTargetForActionType(typeStr: string): number {
  if (typeStr.startsWith('CLIENT_')) return 0
  if (typeStr.startsWith('WEB_')) return 1
  if (typeStr.startsWith('APP_')) return 2
  if (typeStr.startsWith('MP_')) return 4
  if (typeStr.startsWith('SYS_')) return 5
  return 0
}

// ── 后端数据模型 (与 LinkageEngine.h 对齐) ──

/** 时间条件 */
export interface TimeCondition {
  time_start: string
  time_end: string
  weekdays: number[]
  monthdays: number[]
}

/** 空间条件 */
export interface SpatialCondition {
  region_id: string
  location_id: string
  device_group_id: string
  roi_polygon: number[]
}

/** 事件源条件 */
export interface SourceCondition {
  channel_ids: number[]
  device_ids: string[]
  event_types: string[]
  min_severity: number
  min_confidence: number
  algorithm_ids: string[]
}

/** 合并条件 */
export interface MergeCondition {
  enabled: boolean
  window_ms: number
  max_merge_count: number
  merge_by: string
}

/** 条件表达式树节点 (AND/OR/NOT/LEAF) */
export type ConditionNode =
  | { type: 'AND' | 'OR'; children: ConditionNode[] }
  | { type: 'NOT'; children: [ConditionNode] }
  | { type: 'LEAF'; leaf_type: 'time'; condition: TimeCondition }
  | { type: 'LEAF'; leaf_type: 'spatial'; condition: SpatialCondition }
  | { type: 'LEAF'; leaf_type: 'source'; condition: SourceCondition }
  | { type: 'LEAF'; leaf_type: 'merge'; condition: MergeCondition }

/** 联动动作 (后端格式) */
export interface LinkageAction {
  type: number
  target: number
  name: string
  enabled: boolean
  channel_id: string
  device_id: string
  delay_ms: number
  // TTS
  tts_text?: string
  tts_repeat?: number
  // 提示音
  tone_file?: string
  // 电视墙
  tv_wall_id?: string
  tv_wall_duration_s?: number
  // 抓图
  capture_interval_s?: number
  capture_count?: number
  // 报警输出
  alarm_output_id?: string
  alarm_output_duration_s?: number
  // 云台
  preset_id_start?: string
  preset_id_end?: string
  cruise_path_id?: string
  track_id?: string
  // 门禁
  access_point_id?: string
  // 通知
  user_ids?: string[]
  // 逐级推送
  escalate_interval_s?: number
  escalate_user_ids?: string[]
  // WebHook / HTTP
  callback_url?: string
  callback_method?: string
  // MQTT
  mqtt_topic?: string
  mqtt_payload?: string
  // Modbus
  modbus_host?: string
  modbus_port?: number
  modbus_register?: number
  modbus_value?: number
  // 报警模式
  alarm_ip?: string
  alarm_mode?: string
  // 录像标记
  bookmark_type?: string
  bookmark_desc?: string
  // 预案
  plan_id?: string
  // 扩展参数
  params?: Record<string, any>
}

/** 联动规则 (后端格式) */
export interface LinkageRule {
  id: string
  name: string
  description: string
  enabled: boolean
  priority: number
  cooldown_ms: number
  time_cond: TimeCondition
  spatial_cond: SpatialCondition
  source_cond: SourceCondition
  merge_cond: MergeCondition
  actions: LinkageAction[]
  tags: string[]
  condition_tree?: ConditionNode
  created_by: string
  created_at: number
  updated_at: number
}

/** 联动规则查询参数 */
export interface LinkageRuleQuery extends PageQuery {
  enabled?: boolean
  sortBy?: 'priority' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
  tag?: string
}

/** 联动日志 (后端格式) */
export interface LinkageLog {
  id: number
  rule_id: string
  rule_name: string
  event_id: string
  event_type: string
  channel_id: number
  severity: number
  actions_executed: string[]
  trigger_at: number
  duration_ms: number
}

/** 联动日志查询参数 */
export interface LinkageLogQuery extends PageQuery {
  ruleId?: string
  result?: string
  startTime?: string
  endTime?: string
}

/** 动作类型描述符 (后端 ActionDescriptor) */
export interface ActionDescriptor {
  type_id: number
  type_name: string
  display_name: string
  category: string
  sub_category: string
  target: number
  needs_channel: boolean
  param_schema: Record<string, any>
  description: string
  is_builtin: boolean
}

/** 时间段模板 */
export interface TimeTemplate {
  template_id: string
  name: string
  time_start: string
  time_end: string
  weekdays: number[]
  monthdays: number[]
  created_at: number
}

/** Dry-Run 匹配详情 */
export interface DryRunMatchDetail {
  rule_id: string
  rule_name: string
  matched: boolean
  time_matched: boolean
  spatial_matched: boolean
  source_matched: boolean
  cooldown_active: boolean
  match_reason: string
}

/** Dry-Run 结果 */
export interface DryRunResult {
  matched: boolean
  rule_details: DryRunMatchDetail[]
  simulated_actions: string[]
}

/** 规则模板 */
export interface RuleTemplate {
  template_id: string
  name: string
  description: string
  category: string
  tags: string[]
  priority: number
  is_builtin: boolean
  actions: Partial<LinkageAction>[]
  time_cond?: TimeCondition
  spatial_cond?: SpatialCondition
  source_cond?: SourceCondition
  merge_cond?: MergeCondition
}

// ── API ──

export const linkageApi = {
  /** 获取联动规则列表 */
  getRules(params?: LinkageRuleQuery) {
    return http.get<ApiResponse<PageResponse<LinkageRule>>>('/linkage/rules', { params })
  },

  /** 获取联动规则详情 */
  getRule(id: string) {
    return http.get<ApiResponse<LinkageRule>>(`/linkage/rules/${id}`)
  },

  /** 创建联动规则 */
  createRule(data: Partial<LinkageRule> & { name: string }) {
    return http.post<ApiResponse<{ message: string; id: string }>>('/linkage/rules', data)
  },

  /** 更新联动规则 */
  updateRule(id: string, data: Partial<LinkageRule>) {
    return http.put<ApiResponse<{ message: string; id: string }>>(`/linkage/rules/${id}`, data)
  },

  /** 删除联动规则 */
  deleteRule(id: string) {
    return http.delete<ApiResponse<{ message: string; id: string }>>(`/linkage/rules/${id}`)
  },

  /** 批量启用/停用规则 */
  batchToggle(ids: string[], enabled: boolean) {
    return http.post<ApiResponse<{ message: string; updated: number }>>('/linkage/rules/batch-toggle', { ids, enabled })
  },

  /** 获取联动日志 */
  getLogs(params?: LinkageLogQuery) {
    return http.get<ApiResponse<PageResponse<LinkageLog>>>('/linkage/logs', { params })
  },

  /** 获取联动统计 */
  getStats() {
    return http.get<ApiResponse<{
      totalRules: number
      activeRules: number
      triggeredToday: number
      successRate: number
      totalTriggers: number
      totalActionsExecuted: number
      totalActionsFailed: number
      totalCooldownSkips: number
      totalMergeCount: number
    }>>('/linkage/stats')
  },

  /** 获取动作类型列表 */
  getActionTypes(params?: { category?: string }) {
    return http.get<ApiResponse<ActionDescriptor[]>>('/linkage/action-types', { params })
  },

  /** 注册自定义动作类型 */
  registerActionType(data: Partial<ActionDescriptor> & { type_id: number; type_name: string; display_name: string }) {
    return http.post<ApiResponse<{ message: string; type_id: number }>>('/linkage/action-types', data)
  },

  // ── 时间段模板 ──

  /** 获取所有时间段模板 */
  getTimeTemplates() {
    return http.get<ApiResponse<TimeTemplate[]>>('/linkage/time-templates')
  },

  /** 创建时间段模板 */
  createTimeTemplate(data: Partial<TimeTemplate> & { template_id: string; name: string }) {
    return http.post<ApiResponse<{ message: string; template_id: string }>>('/linkage/time-templates', data)
  },

  /** 更新时间段模板 */
  updateTimeTemplate(id: string, data: Partial<TimeTemplate> & { name: string }) {
    return http.put<ApiResponse<{ message: string; template_id: string }>>(`/linkage/time-templates/${id}`, data)
  },

  /** 删除时间段模板 */
  deleteTimeTemplate(id: string) {
    return http.delete<ApiResponse<{ message: string }>>(`/linkage/time-templates/${id}`)
  },

  // ── 规则模拟 (Dry-Run) ──

  /** 模拟规则匹配 */
  dryRun(data: {
    rule_id?: string
    alarm_type?: string
    channel_id?: number
    device_id?: string
    confidence?: number
    severity?: number
    region_id?: string
    location_id?: string
  }) {
    return http.post<ApiResponse<DryRunResult>>('/linkage/rules/dry-run', data)
  },

  // ── 规则模板库 ──

  /** 获取所有规则模板 */
  getRuleTemplates() {
    return http.get<ApiResponse<RuleTemplate[]>>('/linkage/rule-templates')
  },

  /** 从模板创建规则 */
  applyRuleTemplate(templateId: string, name?: string) {
    return http.post<ApiResponse<{ message: string; rule_id: string }>>(`/linkage/rule-templates/${templateId}/apply`, { name })
  },

  /** 删除自定义规则模板 */
  deleteRuleTemplate(id: string) {
    return http.delete<ApiResponse<{ message: string }>>(`/linkage/rule-templates/${id}`)
  },
}
