/**
 * @file screening.ts
 * @brief 安检场景模块 API 客户端 — Phase 2 S1-3/S1-4 (2026-08-27)
 *
 * 后端端点 (box-sdk/src/core/RestApiHandlers.cpp):
 *   GET  /algo/personal-item/status              L3836 人包部署状态 (平铺 JSON)
 *   POST /linkage/rule-templates/:id/apply       L14445 一键应用模板 (createRuleFromTemplate)
 *   GET  /linkage/rule-templates?scene=<tags>    L14385 模板列表 (仅支持 scene 过滤)
 *
 * [FIX 2026-08-28] URL 双前缀 404 修复:
 *   http.ts baseURL 已含 /api/v1, 此前请求误带 /api/v1 前缀 →
 *   实际请求 /api/v1/api/v1/... → 404「请求的资源不存在」。
 *   全部改为相对路径, 与 alarm.ts / linkage.ts / eventTypes.ts 同口径。
 *
 * [FIX 2026-08-28] 响应结构对齐 (设备 v6.2.0 实测):
 *   personal-item/status 返回 data 下平铺字段 (无 status 嵌套);
 *   rule-templates 的 actions 为 {enabled,name,type}[] 对象数组,
 *   event_types 位于 source_cond.event_types (非顶层)。
 *
 * 三态 SSOT (plugins/object/personal_item_detector/personal_item_detector.h L18):
 *   PERSON_WITH_BAGGAGE → "person_with_backpack" (NOTIFICATION, severity 30)
 *   UNATTENDED_BAGGAGE  → "unattended_baggage"   (ALARM, severity 70)
 *   ABANDONED_OBJECT    → "abandoned"            (ALARM, severity 90, 复用存量)
 *
 * 方案: docs/security_screening_solution_plan.md §3 + §4 + §5 (S1)
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'

// ── 人包核验状态 (§4 行 C, 设备实测平铺结构) ────────────────

/** personal_item 插件运行时配置 (box_config 节透传, 含三态阈值) */
export interface PersonalItemConfig {
  enabled?: boolean
  /** 无人看管告警阈值 (秒, 主人离开累计; 默认 30) */
  unattended_alarm_seconds?: number
  /** 无主静止遗留阈值 (秒; 默认 120) */
  abandoned_alarm_seconds?: number
  /** 主人消失确认窗 (秒, 短于 unattended; 默认 10) */
  owner_lost_seconds?: number
  conf_threshold?: number
  min_continous_frames?: number
  owner_binding_enabled?: boolean
  enable_owner_face_match?: boolean
  /** [大华] 同轨同类型去重窗 (秒) */
  dedup_window_seconds?: number
  /** [华为] 同源告警最小间隔 (秒) */
  alarm_min_interval_seconds?: number
  target_fps?: number
  /** 6 类随身物品细分类 */
  classes?: string[]
  [k: string]: unknown
}

/** 人包核验部署状态 — GET /algo/personal-item/status 的 data (平铺) */
export interface PersonalItemStatus {
  algo_id: string
  /** 插件是否已在 AlgoRegistry 注册 */
  algo_registered: boolean
  /** 最近状态采样时间 (ISO8601, 前端判断新鲜度) */
  checked_at: string
  /** 运行时配置 (含三态阈值) */
  config: PersonalItemConfig
  /** 内置默认配置 */
  default_config?: PersonalItemConfig
  /** 近 24h 三态事件计数 (键为 SSOT 事件名) */
  event_counts_24h?: Record<string, number>
  model_actual_file: string
  model_deployed: boolean
  model_file: string
  /** true=专属 bmodel 缺失回退通用 COCO 模型 */
  model_is_fallback: boolean
  model_path: string
  /** 模型文件字节数: 0=未部署, -1=stat 失败, >0=实际大小 */
  model_size_bytes: number
  /** dedicated=专属 / fallback=回退 / missing=未部署 */
  model_status: 'dedicated' | 'fallback' | 'missing' | string
}

// ── 安检联动模板 (设备实测结构, RestApiHandlers L14419-14431) ──

/** 模板动作 (设备实测: {enabled, name, type}) */
export interface TemplateAction {
  enabled: boolean
  name: string
  /** LinkageActionType 数值 (200=Web弹窗 105=TTS 100=实时视频 114=抓图 ...) */
  type: number
}

/** 安检联动模板 */
export interface ScreeningRuleTemplate {
  template_id: string
  /** 后端同时返回 id (= template_id), P0-1 二期补齐 */
  id?: string
  name: string
  description: string
  category: string
  icon?: string
  is_builtin: boolean
  priority: number
  /** 合并抑制间隔 (毫秒), P0-1 二期补齐 */
  cooldown_ms?: number
  tags: string[]
  /** 模板场景并集 (后端按事件标签计算) */
  scenes?: string[]
  created_at?: number
  /** 触发条件 — event_types 在此而非顶层 */
  source_cond: {
    event_types: string[]
    min_severity?: number
    min_confidence?: number
    channel_ids?: string[]
    [k: string]: unknown
  }
  actions: TemplateAction[]
  time_cond?: { time_start: string; time_end: string; weekdays: number[] }
}

/** 应用模板响应 (后端 L14460-14474, 创建后的完整规则 JSON) */
export interface AppliedRuleResult {
  id: string
  name: string
  description: string
  enabled: boolean
  priority: number
  cooldown_ms: number
  actions: Array<{ type: number; target?: number; name: string; enabled: boolean; channel_id?: string }>
  source_cond?: { event_types?: string[]; min_severity?: number }
  [k: string]: unknown
}

// ── 生效规则 CRUD (P2-1 2026-08-29 安检 gap audit) ──────────
//   后端已就绪 (RestApiHandlers L13872-14409), 此前前端未封装:
//   GET/POST /linkage/rules, GET/PUT/DELETE /linkage/rules/:id,
//   GET /linkage/rules/stats, GET /linkage/rules/all

/** 生效联动规则 (serializeRuleToJson L13802 实测结构) */
export interface LinkageRuleInfo {
  id: string
  name: string
  description: string
  enabled: boolean
  priority: number
  cooldown_ms: number
  time_cond?: { time_start: string; time_end: string; weekdays: number[]; monthdays?: number[] }
  spatial_cond?: Record<string, unknown>
  source_cond?: {
    channel_ids?: string[]
    device_ids?: string[]
    event_types?: string[]
    /** 注意: 后端序列化 min_confidence 已 ×100 (0.5→50) */
    min_severity?: number
    min_confidence?: number
    algorithm_ids?: string[]
    [k: string]: unknown
  }
  merge_cond?: { enabled?: boolean; window_ms?: number; max_merge_count?: number; merge_by?: string }
  actions: TemplateAction[] & Array<Record<string, unknown>>
  tags?: string[]
  [k: string]: unknown
}

/** 规则运营指标 (GET /linkage/rules/stats) */
export interface RuleStatsInfo {
  [rule_id: string]: unknown
  [k: string]: unknown
}

// ── API ──

export const screeningApi = {
  /**
   * GET /algo/personal-item/status — 三态告警 + 模型部署状态
   * 响应 data 为平铺 PersonalItemStatus (无 status 嵌套)。
   */
  getPersonalItemStatus() {
    return http.get<ApiResponse<PersonalItemStatus>>(
      '/algo/personal-item/status'
    )
  },

  /**
   * POST /linkage/rule-templates/:templateId/apply — 一键应用安检模板
   * 后端 createRuleFromTemplate 写入引擎并持久化 DB, 响应为创建后的完整规则。
   * [注] 后端同时接受 name / rule_name (v3 FIX Bug-B); 规则重启后生效。
   */
  applyTemplate(templateId: string, name?: string) {
    return http.post<ApiResponse<AppliedRuleResult>>(
      `/linkage/rule-templates/${encodeURIComponent(templateId)}/apply`,
      { name }
    )
  },

  /**
   * GET /linkage/rule-templates — 模板列表
   * 后端仅支持 scene 过滤 (L14387→现 L15883); category 过滤由前端本地执行
   * (scene=security_screening 返回含安检事件标签的全集, 再按分类收敛)。
   * [t8g] data 为 {items,total} 对象 (新后端) 或裸数组 (旧固件), 解包双兼容。
   */
  listTemplates(params?: { scene?: string; category?: string }) {
    return http.get<ApiResponse<ScreeningRuleTemplate[] | { items: ScreeningRuleTemplate[]; total: number }>>(
      '/linkage/rule-templates',
      { params }
    )
  },

  // ── 生效规则 CRUD (P2-1) ──

  /** GET /linkage/rules — 规则列表 (分页, 默认 page_size=100) */
  listRules(params?: { page?: number; page_size?: number; tag?: string }) {
    return http.get<ApiResponse<{ items: LinkageRuleInfo[]; total: number; page: number; page_size: number }>>(
      '/linkage/rules',
      { params }
    )
  },

  /** GET /linkage/rules/all — 全量规则 (enabled_only=true 只返回启用) */
  listAllRules(params?: { enabled_only?: boolean }) {
    return http.get<ApiResponse<{ items: LinkageRuleInfo[]; total: number }>>(
      '/linkage/rules/all',
      { params }
    )
  },

  /** GET /linkage/rules/:id — 单条规则 */
  getRule(ruleId: string) {
    return http.get<ApiResponse<LinkageRuleInfo>>(
      `/linkage/rules/${encodeURIComponent(ruleId)}`
    )
  },

  /** PUT /linkage/rules/:id — 更新规则 (启停/改名/改动作等, 只传变更字段) */
  updateRule(ruleId: string, patch: Partial<Record<string, unknown>>) {
    return http.put<ApiResponse<LinkageRuleInfo>>(
      `/linkage/rules/${encodeURIComponent(ruleId)}`,
      patch
    )
  },

  /** DELETE /linkage/rules/:id — 删除规则 */
  deleteRule(ruleId: string) {
    return http.delete<ApiResponse<unknown>>(
      `/linkage/rules/${encodeURIComponent(ruleId)}`
    )
  },

  /** GET /linkage/rules/stats — 按规则运营指标 (触发次数/最近触发等) */
  getRuleStats() {
    return http.get<ApiResponse<RuleStatsInfo>>('/linkage/rules/stats')
  },

  // ── 告警复核闭环 + 大屏 (安检对标优化 2026-08-30) ──
  //   后端: POST /stats/false_alarm_baseline/feedback (UPSERT + 同步 alarm_events.status)
  //         GET  /stats/false_alarm_feedback (复核明细, RestApiHandlers 2026-08-30 新增)
  //         GET  /stats/screening_dashboard (大屏聚合, 同上新增)

  /** 提交复核标注 (verdict: true_positive|false_positive|unsure) — 后端同步处置状态 */
  submitFeedback(body: { alarm_id: string; verdict: string; note?: string }) {
    return http.post<ApiResponse<{ alarm_id: string; verdict: string; recorded_at_ms: number }>>(
      '/stats/false_alarm_baseline/feedback', body
    )
  },

  /** 复核明细 (alarm_id 精确查或 limit 倒序列表, 默认 100) */
  queryFeedback(params?: { alarm_id?: string; limit?: number }) {
    return http.get<ApiResponse<AlarmFeedbackItem[]>>('/stats/false_alarm_feedback', { params })
  },

  /** 误报基线聚合 (by_type/by_channel/by_labeler/feedback 维度) */
  getFalseAlarmBaseline(params?: { days?: number; include_feedback?: boolean }) {
    return http.get<ApiResponse<Record<string, unknown>>>('/stats/false_alarm_baseline', { params })
  },

  /** 安检大屏聚合 (趋势/KPI/时延/基线一次拉齐) */
  getScreeningDashboard(params?: { hours?: number; days?: number }) {
    return http.get<ApiResponse<ScreeningDashboard>>('/stats/screening_dashboard', { params })
  },
}

/** 单条复核标注 (false_alarm_feedback 行, GET /stats/false_alarm_feedback) */
export interface AlarmFeedbackItem {
  alarm_id: string
  channel_id: number
  alarm_type: string
  verdict: 'true_positive' | 'false_positive' | 'unsure'
  labeler: string
  confidence_at_feedback: number
  note: string
  created_at: number
}

/** 安检大屏聚合响应 (GET /stats/screening_dashboard) */
export interface ScreeningDashboard {
  hours: number
  days: number
  /** 按小时趋势: hr=epoch 小时, cnt=计数 */
  alarm_trend: Array<{ hr: number; cnt: number }>
  passage_trend: Array<{ hr: number; cnt: number }>
  key_trend: Array<{ hr: number; cnt: number }>
  kpi: {
    today_alarms: number
    today_passages: number
    pending_review: number
    total_events: number
    review_rate: number
  }
  action_latency: { p50_ms: number; p90_ms: number; avg_ms: number; sample_count: number } | null
  overall_rate: number
  by_type: Array<{ key: string; total: number; false_alarms: number; false_alarm_rate: number }>
  by_channel: Array<{ key: string; total: number; false_alarms: number; false_alarm_rate: number }>
  feedback: {
    total_feedback: number
    true_positives: number
    false_positives: number
    unsure: number
    annotated_false_rate: number
    by_labeler: Array<{ key: string; total: number; false_alarms: number; false_alarm_rate: number }>
  }
}

export default screeningApi
