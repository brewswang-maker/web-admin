/**
 * @file videoPerimeter.ts
 * @brief 视频周界 REST API 客户端 — vp 轮 (方案: docs/plans/video-perimeter-solution-v1.0.md §6)
 *
 * 后端端点复用 (box-sdk/src/core/RestApiHandlers.cpp, 场景包/联动端点对全部 SSOT 包通用):
 *   GET  /api/v1/large-event/scene-packs              全量 22 包, 前端按
 *        scene_tag === 'video_perimeter' 过滤出 4 包 (后端不过滤, count 含全部)
 *   POST /api/v1/large-event/scene-packs/:id/apply    apply v2 幂等布防
 *        (deploy=true → stable rule_id "le-{pack}-{tid}"; 周界 4 包 id 直接可用)
 *   GET  /api/v1/linkage/rules?tag=video_perimeter    apply 合并 tag 含 scene_tag 本身,
 *        按 tag=video_perimeter 过滤即周界规则全集
 *   GET  /api/v1/linkage/rule-templates               全量模板, 前端取 VP-* 6 条
 *   GET  /api/v1/alarms                               告警列表 (Events 视图按
 *        video_perimeter 场景事件键并集过滤, 对齐 large-event EventListView 范式)
 *   GET  /api/v1/event-types/metadata?scene=video_perimeter  [EventTypeAliases.h
 *        scene_tags] SSOT 场景事件类型动态拉取 (8 键, 2026-08-31 补 tag)
 *   GET  /api/v1/fusion/status  [vp6 P1-1] 多模态融合引擎统计 (OverviewView 状态卡)
 *
 * 注意: 相对路径 (不带 /api/v1 前缀) — 由 http 实例 baseURL 统一拼接,
 *       规避 baseURL 双前缀陷阱 (同 api/hotelUnattended.ts 范式)。
 */

import { http } from './http'
import { getAuthToken } from '@/utils/auth'
import type { ApiResponse } from '@/types/common'
import type { ScenePack, ScenePackApplyResult } from '@/types/largeEvent'
import type { LinkageRule, RuleTemplate, RuleTriggerStat } from './linkage'
import type { AlarmEvent } from '@/types/alarm'

// ── 视频周界场景常量 (SSOT: EventTypeAliases.h scene_tags / ScenePackDefs.h) ──

/** 场景 tag (apply 合并 tags 之一, 规则过滤主键) */
export const PERIMETER_SCENE_TAG = 'video_perimeter'

/** video_perimeter 场景 19 事件键 (EventTypeAliases.h scene_tags: 8 键 2026-08-31
 *  vp 轮 + loitering vp2 轮事前预警域 + vp5 轮十键补 tag 2026-09-01: 烟火三源/
 *  遗留物双键/车辆违停双键/逆行/破拆/人脸交叉; 对齐海康四类检测分类学 +
 *  烟火/车辆/设施破坏外延; P1 VLM 周界复核同款 19 键) */
export const PERIMETER_EVENT_TYPES = [
  'intrusion', 'tripwire', 'climbing', 'tailgate',
  'gathering', 'field_intrusion', 'object_removal', 'vehicle_detected',
  'loitering',
  // [vp5] 十键补 tag (与 EventTypeAliases.h getEventSceneTags 同步)
  'fire', 'smoke', 'smolder',
  'abandoned', 'unattended_baggage',
  'illegal_parking', 'lpr_violation', 'wrong_direction',
  'vandalism', 'face_stranger',
] as const

/** 周界专属 VP-* 联动模板前缀 */
export const PERIMETER_TEMPLATE_PREFIX = 'VP-'

/** [vp6 P1-1] 多模态融合引擎状态 (GET /api/v1/fusion/status, D-S 五模态) */
export interface FusionStatus {
  initialized: boolean
  strategy: string
  total_fusions: number
  alerts_generated: number
  false_positives_filtered: number
  cross_validated_alerts: number
  avg_fusion_latency_ms: number
  video_reduction_pct: number
  weights: Record<string, number>
}

// ── API 封装 ──

export const videoPerimeterApi = {
  // ----- 场景包 (复用 SSOT 端点, 前端按 scene_tag 过滤 4 包) -----
  listScenePacks() {
    return http.get<ApiResponse<{ scene_packs: ScenePack[]; count: number }>>(
      '/large-event/scene-packs'
    )
  },

  /** apply v2: deploy=true → 幂等实例化 VP 模板为联动规则 (稳定 rule_id) */
  applyScenePack(packId: string, opts?: { deploy?: boolean; channel_ids?: number[] }) {
    return http.post<ApiResponse<ScenePackApplyResult>>(
      `/large-event/scene-packs/${encodeURIComponent(packId)}/apply`,
      opts ?? {}
    )
  },

  // ----- 联动规则 / 模板 -----
  /** 周界规则全集 (apply 布防产物, tag=video_perimeter 过滤) */
  listRules() {
    return http.get<ApiResponse<{ items: LinkageRule[] }>>('/linkage/rules', {
      params: { tag: PERIMETER_SCENE_TAG },
    })
  },

  /** 规则触发统计 (增强信息, 失败可静默降级) */
  listRuleStats() {
    return http.get<ApiResponse<{ rules: RuleTriggerStat[] }>>('/linkage/rule-stats')
  },

  /** 全量规则模板 (前端取 VP-* 前缀 6 条做落地对照; data {items,total}[t8g]/裸数组双兼容) */
  listRuleTemplates() {
    return http.get<ApiResponse<RuleTemplate[] | { items: RuleTemplate[]; total: number }>>('/linkage/rule-templates')
  },

  // ----- 事件 (告警列表 + SSOT 场景事件类型) -----
  listAlarms() {
    return http.get<ApiResponse<{ items?: AlarmEvent[] }>>('/alarms', {
      params: { page: 1, pageSize: 500 },
    })
  },

  /** SSOT 场景事件类型元数据 (scene=video_perimeter 后端按 scene_tags 过滤) */
  listEventMetadata() {
    return http.get<ApiResponse<{
      groups: Record<string, { items?: Array<{
        alarm_type: string
        display_name: string
        severity_cn: string
        severity_level: number
      }> }>
    }>>('/event-types/metadata', { params: { scene: PERIMETER_SCENE_TAG } })
  },

  // ----- 融合 (vp6 P1-1: 多模态 D-S 融合引擎状态, OverviewView 状态卡) -----
  /** GET /api/v1/fusion/status — 融合引擎统计+权重。
   *  [fix 2026-09-01 真机实测] 设备端 HttpServer/DrogonHttpAdapter 的 handler
   *  req = body∪query∪path, 不透传 Authorization 头 → axios 拦截器的 header
   *  传法恒 401 (与 auth/me 等 req.value("token") 式样端点同一约束), 故显式
   *  query token 传递。 */
  getFusionStatus() {
    const token = getAuthToken()
    return http.get<ApiResponse<FusionStatus>>(
      `/fusion/status${token ? `?token=${encodeURIComponent(token)}` : ''}`)
  },
}

// ── 前端组合辅助 (多数据源聚合, 视图层共用) ──

/** 从全量场景包中过滤周界 4 包 (防御式: 响应结构异常时返回空数组) */
export function pickPerimeterPacks(body: unknown): ScenePack[] {
  const d = (body as { data?: { scene_packs?: ScenePack[] } })?.data
  const list = Array.isArray(d?.scene_packs) ? d.scene_packs : []
  return list.filter(p => p?.scene_tag === PERIMETER_SCENE_TAG)
}

/**
 * VP-* 联动模板过滤 (6 条); body 双兼容 [t8g]: 新后端 {items,total} 对象 /
 * 旧固件裸数组, 与 api/linkage.ts unwrapRuleTemplates 同式。
 */
export function pickPerimeterTemplates(body: unknown): RuleTemplate[] {
  const list = Array.isArray(body)
    ? body
    : (body as { items?: RuleTemplate[] } | null | undefined)?.items
  return (Array.isArray(list) ? list : []).filter(
    t => t?.template_id?.startsWith(PERIMETER_TEMPLATE_PREFIX)
  )
}

/** 周界场景事件过滤 (alarm_type ∈ PERIMETER_EVENT_TYPES; 防御式容忍 string) */
export function isPerimeterEvent(type: unknown): boolean {
  return (PERIMETER_EVENT_TYPES as readonly string[]).includes(String(type))
}
