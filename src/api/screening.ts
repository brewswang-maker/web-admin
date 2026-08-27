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
   * 后端仅支持 scene 过滤 (L14387); category 过滤由前端本地执行
   * (scene=security_screening 返回含安检事件标签的全集, 再按分类收敛)。
   */
  listTemplates(params?: { scene?: string; category?: string }) {
    return http.get<ApiResponse<ScreeningRuleTemplate[]>>(
      '/linkage/rule-templates',
      { params }
    )
  },
}

export default screeningApi
