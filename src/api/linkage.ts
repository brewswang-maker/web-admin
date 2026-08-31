/**
 * 华盾AI智能视频盒子 v7.0 - 联动规则 API
 * api/linkage.ts — 事件联动规则 CRUD + 日志查询
 * 与后端 LinkageEngine.h / RestApiHandlers.cpp 格式完全对齐
 */

import { http } from './http'
import type { ApiResponse, PageResponse, PageQuery } from '@/types/common'
import { TEMPLATE_SCHEMA_VERSION } from './templateSchema'

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
  SYS_START_INFERENCE: 506,
  SYS_STOP_INFERENCE: 507,
  SYS_START_STREAM: 508,
  SYS_STOP_STREAM: 509,
  SYS_DEPLOY_PIPELINE: 510,
  SYS_UNDEPLOY_PIPELINE: 511,
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

/**
 * rule-templates 响应 data 双兼容解包 [酒店无人值守 t8g 2026-08-31]:
 * 新后端返回 {items,total} 对象 (RestApiHandlers rule-templates GET), 旧固件返回
 * 裸数组 — 统一收敛到 RuleTemplate[], 视图层零感知, 前后端部署顺序无关。
 */
export function unwrapRuleTemplates(body: unknown): RuleTemplate[] {
  if (Array.isArray(body)) return body as RuleTemplate[]
  const items = (body as { items?: RuleTemplate[] } | null | undefined)?.items
  return Array.isArray(items) ? items : []
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

/** 属性条件 (后端 AttributeCondition, [AttrDec β] + [P4-D 2026-08-29])
 *  op 协议字符串: == != > >= < <= exists not_exists (与 RestApiHandlers 对齐)
 *  key 白名单见 api/attributeKeys.ts (P4-B SSOT 前端移植) */
export interface AttributeCondition {
  key: string
  op: string
  value: number
}

/** 事件源条件 */
export interface SourceCondition {
  channel_ids: number[]
  device_ids: string[]
  event_types: string[]
  min_severity: number
  min_confidence: number
  algorithm_ids: string[]
  /** [P4-D] 属性条件集合 (AND 语义); LEAF:SOURCE 与 rule 级 source_cond 共用 */
  attribute_conditions?: AttributeCondition[]
}

/** 合并条件 */
export interface MergeCondition {
  enabled: boolean
  window_ms: number
  max_merge_count: number
  merge_by: string
}

/** 条件表达式树节点 (AND/OR/NOT/LEAF/CASE) */
export type ConditionNode =
  | { type: 'AND' | 'OR'; children: ConditionNode[] }
  | { type: 'NOT'; children: [ConditionNode] }
  | { type: 'LEAF'; leaf_type: 'time'; condition: TimeCondition }
  | { type: 'LEAF'; leaf_type: 'spatial'; condition: SpatialCondition }
  | { type: 'LEAF'; leaf_type: 'source'; condition: SourceCondition }
  | { type: 'LEAF'; leaf_type: 'merge'; condition: MergeCondition }
  // P0-4: v8.0 CASE 表达式节点
  | { type: 'CASE'; case_field: string; case_branches: Array<{ op: string; value: string; actions: any[] }>; default_actions: any[] }

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
  // [FIX P1-1] 冲突处理 + VLM 字段 (v7.1 后端已实现)
  mutex_group?: string
  suppress_after_rule?: string
  suppress_lower_priority?: boolean
  enable_vlm_verify?: boolean
  // [P2-1] 治理字段: 关闭条件 + 响应时限 (''|manual|auto_event_close|timeout, 0=未设)
  close_condition?: string
  response_deadline_s?: number
  version?: number
  is_archived?: boolean
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

/** [P2-LR2] 规则冲突报告 */
export interface RuleConflict {
  type: 'overlapping_trigger' | 'action_redundancy' | 'wildcard_shadowing' | 'cooldown_violation' | 'time_window_conflict'
  severity: 'warning' | 'info'
  rule_id_a: string
  rule_id_b: string
  message: string
  suggestion: string
}

/** [P3-LR3] 按规则触发统计 */
export interface RuleTriggerStat {
  rule_id: string
  rule_name: string
  trigger_count: number
  cooldown_hits: number
  action_success: number
  action_failed: number
  last_trigger_ms: number
  /** [P1-1] 规则当前启用状态 (禁用切换即清零统计) */
  enabled?: boolean
  /** [P1-1] 动作成功率 = action_success / (success + failed) */
  success_rate?: number
}

/** 规则模板 */
export interface RuleTemplate {
  template_id: string
  /** [P0-1 二期补充] 后端实测同时返回 id 字段 (部分路由别名) */
  id?: string
  name: string
  description: string
  category: string
  tags: string[]
  priority: number
  is_builtin: boolean
  /** [P0-1 二期补充] 合并抑制间隔毫秒 (LinkageEngine merge_cond 跨规则联动用) */
  cooldown_ms?: number
  actions: Partial<LinkageAction>[]
  time_cond?: TimeCondition
  spatial_cond?: SpatialCondition
  source_cond?: SourceCondition
  merge_cond?: MergeCondition
  // [P2-1] 治理字段: 关闭条件 + 响应时限 (旧模板缺省, 导入宽容)
  close_condition?: string
  response_deadline_s?: number
}

// ── API ──

/** 预案 (后端 LinkagePlan) */
export interface LinkagePlan {
  plan_id: string
  name: string
  description: string
  icon: string
  rule_ids: string[]
  enabled: boolean
  schedule: {
    enabled: boolean
    arm_time: string
    disarm_time: string
    weekdays: number[]
  }
  created_by: string
  created_at: number
  updated_at: number
}

/** CEP 模式步骤 */
export interface CEPPatternStep {
  step_id: string
  op: number  // 0=SEQUENCE, 1=AND, 2=OR, 3=NOT, 4=COUNT, 5=ABSENCE
  event_type: string
  channel_ids: number[]
  min_confidence: number
  count_threshold: number
}

/** CEP 模式 */
export interface CEPPattern {
  pattern_id: string
  name: string
  description: string
  enabled: boolean
  steps: CEPPatternStep[]
  window_ms: number
  window_type: 'sliding' | 'tumbling'
  output_event_type: string
  group_by: string
  cooldown_ms: number
  is_builtin: boolean
  created_at: number
  updated_at: number
}

/** 自动部署算法路由 */
export interface AlgoRoute {
  scene_pattern: string
  algo_plugin: string
  interval_ms: number
}

/** 自动部署策略 */
export interface DeployPolicy {
  policy_id: string
  name: string
  enabled: boolean
  priority: number
  vendor_patterns: string[]
  device_type_patterns: string[]
  channel_name_regex: string[]
  algo_plugin: string
  interval_ms: number
  auto_start_stream: boolean
  auto_start_inference: boolean
  algo_routes: AlgoRoute[]
  created_at: number
  updated_at: number
}

/** 自动部署状态 */
export interface DeployStatus {
  channel_id: string
  device_id: string
  policy_id: string
  stream_running: boolean
  inference_running: boolean
  algo_plugin: string
  deployed_at: number
  last_check_at: number
}

/** 动作执行日志条目 */
export interface ActionLogEntry {
  id: number
  trigger_log_id: number
  rule_id: string
  action_type: number
  action_name: string
  channel_id: number
  status: string  // pending/executing/success/failed/timeout
  retry_count: number
  max_retries: number
  started_at: number
  completed_at: number
  execution_ms: number
  error_code: number
  error_message: string
  response_data: Record<string, any>
  created_at: number
}

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

  // P2-4: 规则效能分析 — 延迟直方图和 TOP 触发
  getAnalytics() {
    return http.get<ApiResponse<{
      latency: { p50: number; p90: number; p99: number; samples: number }
      topTriggered: Array<{ rule_id: string; rule_name: string; trigger_count: number; avg_latency_ms: number }>
      actionStats: { total_executed: number; total_failed: number; cooldown_skips: number; merge_count: number; vlm_suppressed: number }
      ruleCount: number
      activeRuleCount: number
    }>>('/linkage/analytics')
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

  // [P2-LR2] 规则冲突检测
  /** 检测所有已启用规则之间的冲突 */
  detectConflicts() {
    return http.get<ApiResponse<{ conflicts: RuleConflict[]; total: number }>>('/linkage/rules/conflicts')
  },

  // [P3-LR3] 按规则触发统计
  /** 获取所有规则的触发/冷却/动作执行统计 */
  getRuleStats() {
    return http.get<ApiResponse<{ rules: RuleTriggerStat[]; total: number }>>('/linkage/rule-stats')
  },

  // ── 规则模板库 ──

  /** 获取所有规则模板 (data 为 {items,total} [t8g] 或旧固件裸数组, 用 unwrapRuleTemplates 解包) */
  getRuleTemplates() {
    return http.get<ApiResponse<RuleTemplate[] | { items: RuleTemplate[]; total: number }>>('/linkage/rule-templates')
  },

  /** 从模板创建规则 */
  applyRuleTemplate(templateId: string, name?: string) {
    return http.post<ApiResponse<{ message: string; rule_id: string }>>(`/linkage/rule-templates/${templateId}/apply`, { name })
  },

  /** 删除自定义规则模板 */
  deleteRuleTemplate(id: string) {
    return http.delete<ApiResponse<{ message: string }>>(`/linkage/rule-templates/${id}`)
  },

  // P1-7: 规则模板一键导入导出

  /** 导出所有规则模板为 JSON */
  async exportRuleTemplates(): Promise<Blob> {
    const resp = await http.get<ApiResponse<RuleTemplate[] | { items: RuleTemplate[]; total: number }>>('/linkage/rule-templates')
    const templates = unwrapRuleTemplates(resp.data?.data)
    return new Blob([JSON.stringify({ schema_version: TEMPLATE_SCHEMA_VERSION, version: TEMPLATE_SCHEMA_VERSION, exported_at: new Date().toISOString(), templates }, null, 2)], { type: 'application/json' })
  },

  /** 批量导入规则模板 */
  importRuleTemplates(templates: RuleTemplate[]) {
    return http.post<ApiResponse<{ message: string; imported: number }>>('/linkage/rule-templates/batch-import', { templates })
  },

  // ── 预案管理 (v7.1) ──

  /** 获取所有预案 */
  getPlans() {
    return http.get<ApiResponse<LinkagePlan[]>>('/linkage/plans')
  },

  /** 创建预案 */
  createPlan(data: Partial<LinkagePlan> & { plan_id: string; name: string }) {
    return http.post<ApiResponse<{ message: string; plan_id: string }>>('/linkage/plans', data)
  },

  /** 更新预案 */
  updatePlan(id: string, data: Partial<LinkagePlan>) {
    return http.put<ApiResponse<{ message: string; plan_id: string }>>(`/linkage/plans/${id}`, data)
  },

  /** 删除预案 */
  deletePlan(id: string) {
    return http.delete<ApiResponse<{ message: string; plan_id: string }>>(`/linkage/plans/${id}`)
  },

  /** 激活预案 */
  activatePlan(id: string) {
    return http.post<ApiResponse<{ message: string; plan_id: string }>>(`/linkage/plans/${id}/activate`)
  },

  /** 停用预案 */
  deactivatePlan(id: string) {
    return http.post<ApiResponse<{ message: string; plan_id: string }>>(`/linkage/plans/${id}/deactivate`)
  },

  // ── CEP 复杂事件处理 (v7.2) ──

  /** 获取所有CEP模式 */
  getCEPPatterns() {
    return http.get<ApiResponse<{ items: CEPPattern[]; total: number }>>('/cep/patterns')
  },

  /** 创建CEP模式 */
  createCEPPattern(data: Partial<CEPPattern> & { pattern_id: string; name: string }) {
    return http.post<ApiResponse<{ message: string; pattern_id: string }>>('/cep/patterns', data)
  },

  /** 更新CEP模式 */
  updateCEPPattern(id: string, data: Partial<CEPPattern>) {
    return http.put<ApiResponse<{ message: string; pattern_id: string }>>(`/cep/patterns/${id}`, data)
  },

  /** 删除CEP模式 */
  deleteCEPPattern(id: string) {
    return http.delete<ApiResponse<{ message: string; pattern_id: string }>>(`/cep/patterns/${id}`)
  },

  // ── 自动部署策略 (v7.1) ──

  /** 获取所有自动部署策略 */
  getDeployPolicies() {
    return http.get<ApiResponse<DeployPolicy[]>>('/auto-deploy/policies')
  },

  /** 创建自动部署策略 */
  createDeployPolicy(data: Partial<DeployPolicy> & { policy_id: string; name: string }) {
    return http.post<ApiResponse<{ message: string; policy_id: string }>>('/auto-deploy/policies', data)
  },

  /** 更新自动部署策略 */
  updateDeployPolicy(id: string, data: Partial<DeployPolicy>) {
    return http.put<ApiResponse<{ message: string; policy_id: string }>>(`/auto-deploy/policies/${id}`, data)
  },

  /** 删除自动部署策略 */
  deleteDeployPolicy(id: string) {
    return http.delete<ApiResponse<{ message: string; policy_id: string }>>(`/auto-deploy/policies/${id}`)
  },

  /** 获取自动部署状态 */
  getDeployStatus() {
    return http.get<ApiResponse<{
      items: DeployStatus[]
      total_deployments: number
      total_failures: number
      active_channels: number
    }>>('/auto-deploy/status')
  },

  // ── 动作执行日志 (v7.1) ──

  /** 获取动作执行日志 */
  getActionLog(params?: PageQuery & { rule_id?: string; status?: string }) {
    return http.get<ApiResponse<PageResponse<ActionLogEntry>>>('/linkage/action-log', { params })
  },

  /** 重试失败动作 */
  retryAction(id: number) {
    return http.post<ApiResponse<{ message: string; id: string }>>(`/linkage/action-log/${id}/retry`)
  },

  // ── P3-5: 规则GUI编辑器 API ──

  /** 规则校验 (dry-run) */
  validateRule(data: Partial<LinkageRule>) {
    return http.post<ApiResponse<{ valid: boolean; errors: string[]; warnings: string[] }>>('/rules/validate', data)
  },

  /** 保存为自定义模板 */
  saveAsTemplate(data: {
    template_id?: string
    name: string
    description?: string
    category?: string
    icon?: string
    priority?: number
    cooldown_ms?: number
    tags?: string[]
  }) {
    return http.post<ApiResponse<{ template_id: string; message: string }>>('/linkage/rule-templates', data)
  },

  // ── [FIX P1-2] 版本管理 API (后端已实现) ──

  /** 获取规则版本历史 */
  getRuleHistory(id: string) {
    return http.get<ApiResponse<{ rule_id: string; versions: Array<{ version: number; name: string; enabled: boolean; priority: number; updated_at: number; created_by: string; version_comment: string }>; total: number }>>(`/linkage/rules/${id}/history`)
  },

  /** 回滚规则到指定版本 */
  rollbackRule(id: string, targetVersion: number, reason?: string) {
    return http.post<ApiResponse<{ message: string; rule_id: string; target_version: number }>>(`/linkage/rules/${id}/rollback`, { target_version: targetVersion, reason })
  },

  /** 获取规则变更日志 */
  getChangeLog(params?: { rule_id?: string; limit?: number }) {
    return http.get<ApiResponse<{ items: Array<{ rule_id: string; rule_name: string; version: number; action: string; changed_by: string; changed_at: number; change_summary: string }>; total: number }>>('/linkage/change-log', { params })
  },

  // ── [FIX P1-3] 规则复制 ──

  /** 复制规则 */
  cloneRule(id: string, newName?: string) {
    return http.post<ApiResponse<{ message: string; id: string }>>(`/linkage/rules/${id}/clone`, { name: newName })
  },

  // ── [FIX P1-4] 批量删除 ──

  /** 批量删除规则 (原子操作) */
  batchDelete(ids: string[]) {
    return http.post<ApiResponse<{ message: string; deleted: number }>>('/linkage/rules/batch-delete', { ids })
  },

  // ── [FIX P2-3] 归档管理 ──

  /** 归档规则 (软删除, 不参与触发) */
  archiveRule(id: string, reason?: string) {
    return http.post<ApiResponse<{ message: string; rule_id: string }>>(`/linkage/rules/${id}/archive`, { reason })
  },

  /** 恢复归档规则 */
  restoreRule(id: string) {
    return http.post<ApiResponse<{ message: string; rule_id: string }>>(`/linkage/rules/${id}/restore`, {})
  },

  // ── [P1-1 2026-08-28] 按规则统计运营指标 ──

  /** 按规则统计报表 (新端点 /linkage/rules/stats: 数组结构 + success_rate) */
  getRuleStatsReport() {
    return http.get<ApiResponse<RuleTriggerStat[]>>('/linkage/rules/stats')
  },

  // ── [P1-2 2026-08-28] 端到端时延报表 ──

  /** 时延报表: 引擎直方图 (p50/p90/p99) + 按 trace_id 分段 (event→trigger→action) */
  getLatencyReport(params?: { limit?: number }) {
    return http.get<ApiResponse<{
      latency: {
        p50_ms: number; p90_ms: number; p99_ms: number
        avg_ms: number; max_ms: number; min_ms: number; sample_count: number
      }
      traces: Array<{
        trace_id: string; rule_id: string; action_name: string; status: string
        event_to_trigger_ms: number | null
        trigger_to_action_ms: number | null
        e2e_ms: number | null
      }>
    }>>('/linkage/stats/latency', { params })
  },
}
