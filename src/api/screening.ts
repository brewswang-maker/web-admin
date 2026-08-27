/**
 * @file screening.ts
 * @brief 安检场景模块 API 客户端 — Phase 2 S1-3/S1-4 (2026-08-27)
 *
 * 后端端点 (box-sdk/src/core/RestApiHandlers.cpp):
 *   GET  /api/v1/algo/personal-item/status  [T-S1-3] 人包状态 (model_size_bytes/checked_at)
 *   POST /api/v1/linkage/rules:apply-template [T-S1-3] 联动模板应用
 *   GET  /api/v1/event-types/metadata?scene=security_screening 场景过滤
 *   GET  /api/v1/linkage/rule-templates?category=安检 模板列表
 *
 * 方案: docs/security_screening_solution_plan.md §3 + §4 + §5 (S1)
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'

// ── 人包核验状态 (§4 行 C) ──────────────────────────────

/** 三态告警阈值 (Phase 2 personal_item 插件) */
export interface PersonalItemThresholds {
  /** 三态判定 1/2/3 阶段阈值 (秒, 默认 30/70/90) */
  phase1_sec: number
  phase2_sec: number
  phase3_sec: number
}

export interface PersonalItemStatus {
  /** 插件是否已注册 (true=已在 AlgoRegistry 注册) */
  registered: boolean
  /** 插件/模型文件存在性: 0=未部署, -1=stat 失败, >0=字节数 */
  model_size_bytes: number
  /** 最近状态采样时间 ISO8601 (前端判断新鲜度) */
  checked_at: string
  /** 当前告警状态: ok / missing / dedicated / mixed */
  state: 'ok' | 'missing' | 'dedicated' | 'mixed' | 'unknown'
  /** 三态阈值 */
  thresholds: PersonalItemThresholds
  /** 最近 24h 事件计数 (按事件类型) */
  recent_event_counts: Record<string, number>
}

export interface PersonalItemStatusResponse {
  status: PersonalItemStatus
  ssot: string
}

// ── 安检模板应用 (§4 行 C) ──────────────────────────────

export interface ScreeningRuleTemplate {
  template_id: string
  id?: string
  name: string
  description: string
  category: string
  tags: string[]
  priority: number
  is_builtin: boolean
  cooldown_ms?: number
  /** 触发事件类型 (canonical, e.g. person_with_backpack / unattended_baggage / tailgate) */
  event_types: string[]
  /** 动作类型列表 (LinkageActionType 字符串) */
  actions: string[]
  /** 时间窗/空间/合并条件 */
  time_cond?: Record<string, unknown>
  spatial_cond?: Record<string, unknown>
  merge_cond?: Record<string, unknown>
}

export interface ApplyTemplateRequest {
  template_id: string
  name?: string
}

export interface ApplyTemplateResult {
  rule_id: string
  template_id: string
  /** 创建后规则 enabled 数 (sanitize 后真实状态, P0-1 一期修复口径) */
  enabled_actions: number
  /** 创建后规则总动作数 */
  total_actions: number
}

// ── API ──

export const screeningApi = {
  /** GET /api/v1/algo/personal-item/status — 三态告警 + 模型部署状态 */
  getPersonalItemStatus() {
    return http.get<ApiResponse<PersonalItemStatusResponse>>(
      '/api/v1/algo/personal-item/status'
    )
  },

  /** POST /api/v1/linkage/rules:apply-template — 一键应用安检模板 */
  applyTemplate(body: ApplyTemplateRequest) {
    return http.post<ApiResponse<ApplyTemplateResult>>(
      '/api/v1/linkage/rules/apply-template',
      body
    )
  },

  /** GET /api/v1/linkage/rule-templates?category=安检 — 安检分类模板列表 */
  listTemplates(category: string = '安检') {
    return http.get<ApiResponse<ScreeningRuleTemplate[]>>(
      '/api/v1/linkage/rule-templates',
      { params: { category } }
    )
  }
}

export default screeningApi