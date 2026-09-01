/**
 * @file hotelUnattended.ts
 * @brief 酒店员工无人值守 REST API 客户端 — t8f D3 (方案: docs/plans/hotel-unattended-solution-v1.0.md §5.7)
 *
 * 后端端点复用 (box-sdk/src/core/RestApiHandlers.cpp, 场景包/联动端点对全部 SSOT 包通用):
 *   GET  /api/v1/large-event/scene-packs              [L21305] 全量 19 包, 前端按
 *        scene_tag === 'hotel_unattended' 过滤出 6 包 (后端不过滤, count 含全部;
 *        [P1-2 v2.1] 恰 5→6: +hotel_unattended_receiving_v1 §5.4-C 收货补包)
 *   POST /api/v1/large-event/scene-packs/:id/apply    [L21332] apply v2 幂等布防
 *        (deploy=true → stable rule_id "le-{pack}-{tid}"; 酒店 6 包 id 直接可用)
 *   GET  /api/v1/linkage/rules?tag=hotel_unattended   apply 合并 tag 含 scene_tag 本身
 *        [L21396-21403], 按 tag=hotel_unattended 过滤即酒店规则全集
 *   GET  /api/v1/linkage/rule-templates               [L15883] 全量模板, 前端取 HT-* 21 条
 *        ([P1-2 v2.1] 18→21: +HT-receiving-unauthorized/loitering/tailgate)
 *   GET  /api/v1/linkage/rule-stats                   触发统计 (RulesView 增强信息)
 *   GET  /api/v1/alarms                               告警列表 (CorridorEvents 前端按
 *        hotel_unattended 场景事件键并集过滤, 对齐 large-event EventListView 范式)
 *   GET  /api/v1/event-types/metadata?scene=hotel_unattended  [EventTypeAliases.h
 *        scene_tags L353+] SSOT 场景事件类型动态拉取 (16 键)
 *
 * 注意: 相对路径 (不带 /api/v1 前缀) — 由 http 实例 baseURL 统一拼接,
 *       规避 baseURL 双前缀陷阱 (同 api/largeEvent.ts 范式)。
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'
import type { ScenePack, ScenePackApplyResult } from '@/types/largeEvent'
import type { LinkageRule, RuleTemplate, RuleTriggerStat } from './linkage'
import type { AlarmEvent } from '@/types/alarm'
import type { FaceDatabaseResponse, FaceDatabaseStats, FacePassRecord } from './face'

// ── 酒店无人值守场景常量 (SSOT: EventTypeAliases.h scene_tags / ScenePackDefs.h) ──

/** 场景 tag (apply 合并 tags 之一, 规则过滤主键) */
export const HOTEL_SCENE_TAG = 'hotel_unattended'

/** hotel_unattended 场景 16 事件键 (EventTypeAliases.h 既有行补 tag, 2026-08-30) */
export const HOTEL_EVENT_TYPES = [
  'face_stranger', 'face_tailgate', 'gathering', 'queue_length',
  'running', 'fall_detected', 'fight', 'tailgate', 'intrusion',
  'loitering', 'person_with_backpack', 'unattended_baggage',
  'abandoned', 'object_removal', 'climbing', 'tripwire',
] as const

/** 员工通道 fusion 插件核心拦截事件 (canonical 归一后) */
export const CORRIDOR_INTERCEPT_TYPES = ['tailgate', 'intrusion'] as const

/** 酒店专属 HT-* 联动模板前缀 */
export const HOTEL_TEMPLATE_PREFIX = 'HT-'

// ── 人员分类 (SSOT: FaceGroupType 六分类, FaceDatabase.h / api/face.ts) ──
// 酒店人员体系: 黑名单 / 白名单 / 访客 / VIP / 员工 / 自定义。
// color 沿 Element 色板语义: 危险红/成功绿/信息青/警示金/主蓝/中性灰。

export interface PersonGroupDef {
  key: 'blacklist' | 'whitelist' | 'visitor' | 'vip' | 'staff' | 'custom'
  /** i18n 键 (hotel.person.groups.*) */
  i18nKey: string
  color: string
  /** el-tag type (分类标签着色) */
  tagType: 'danger' | 'success' | 'warning' | 'primary' | 'info'
}

export const PERSON_GROUPS: readonly PersonGroupDef[] = [
  { key: 'blacklist', i18nKey: 'hotel.person.groups.blacklist', color: '#f56c6c', tagType: 'danger' },
  { key: 'whitelist', i18nKey: 'hotel.person.groups.whitelist', color: '#67c23a', tagType: 'success' },
  { key: 'visitor',   i18nKey: 'hotel.person.groups.visitor',   color: '#00b8a9', tagType: 'success' },
  { key: 'vip',       i18nKey: 'hotel.person.groups.vip',       color: '#e6a23c', tagType: 'warning' },
  { key: 'staff',     i18nKey: 'hotel.person.groups.staff',     color: '#409eff', tagType: 'primary' },
  { key: 'custom',    i18nKey: 'hotel.person.groups.custom',    color: '#909399', tagType: 'info' },
]

export type PersonGroupKey = PersonGroupDef['key']

/**
 * 通行记录 pass_type → 六分类 key (通行端点用 pass_type 而非 group_type;
 * blacklist_hit 归黑名单, unknown/unknown_type 归 'unknown' 不参与六分类)。
 */
export function passTypeToGroup(passType: unknown): PersonGroupKey | 'unknown' {
  const p = String(passType ?? '')
  if (p === 'blacklist_hit') return 'blacklist'
  if (p === 'whitelist' || p === 'visitor' || p === 'vip' || p === 'staff' || p === 'custom') {
    return p
  }
  return 'unknown'
}

// ── API 封装 ──

export const hotelUnattendedApi = {
  // ----- 场景包 (复用 SSOT 端点, 前端按 scene_tag 过滤 6 包) -----
  listScenePacks() {
    return http.get<ApiResponse<{ scene_packs: ScenePack[]; count: number }>>(
      '/large-event/scene-packs'
    )
  },

  /** apply v2: deploy=true → 幂等实例化 HT 模板为联动规则 (稳定 rule_id) */
  applyScenePack(packId: string, opts?: { deploy?: boolean; channel_ids?: number[] }) {
    return http.post<ApiResponse<ScenePackApplyResult>>(
      `/large-event/scene-packs/${encodeURIComponent(packId)}/apply`,
      opts ?? {}
    )
  },

  // ----- 联动规则 / 模板 -----
  /** 酒店规则全集 (apply 布防产物, tag=hotel_unattended 过滤) */
  listRules() {
    return http.get<ApiResponse<{ items: LinkageRule[] }>>('/linkage/rules', {
      params: { tag: HOTEL_SCENE_TAG },
    })
  },

  /** 全量规则模板 (前端取 HT-* 前缀 18 条做落地对照; data {items,total}[t8g]/裸数组双兼容) */
  listRuleTemplates() {
    return http.get<ApiResponse<RuleTemplate[] | { items: RuleTemplate[]; total: number }>>('/linkage/rule-templates')
  },

  /** 规则触发统计 (增强信息, 失败可静默降级) */
  listRuleStats() {
    return http.get<ApiResponse<{ rules: RuleTriggerStat[] }>>('/linkage/rule-stats')
  },

  // ----- 事件 (告警列表 + SSOT 场景事件类型) -----
  listAlarms() {
    return http.get<ApiResponse<{ items?: AlarmEvent[] }>>('/alarms', {
      params: { page: 1, pageSize: 500 },
    })
  },

  // ----- 人员分类 (人脸库六分类: 黑名单/白名单/访客/VIP/员工/自定义) -----
  /** 人脸库六分类统计 (FaceDatabaseStats: 各分组人数) */
  listFaceStats() {
    return http.get<FaceDatabaseResponse<FaceDatabaseStats>>('/face/database/stats')
  },

  /** 通行记录 (pass_type 六分类 + blacklist_hit/unknown; hours 默认 24h) */
  listPassRecords(params: { hours?: number; limit?: number } = {}) {
    return http.get<FaceDatabaseResponse<{ pass_records: FacePassRecord[]; total: number }>>(
      '/face/database/pass-records', { params }
    )
  },

  /** SSOT 场景事件类型元数据 (scene=hotel_unattended 后端按 scene_tags 过滤) */
  listEventMetadata() {
    return http.get<ApiResponse<{
      groups: Record<string, { items?: Array<{
        alarm_type: string
        display_name: string
        severity_cn: string
        severity_level: number
      }> }>
    }>>('/event-types/metadata', { params: { scene: HOTEL_SCENE_TAG } })
  },
}

// ── 前端组合辅助 (多数据源聚合, 视图层共用) ──

/** 从全量场景包中过滤酒店 6 包 (防御式: 响应结构异常时返回空数组) */
export function pickHotelPacks(body: unknown): ScenePack[] {
  const d = (body as { data?: { scene_packs?: ScenePack[] } })?.data
  const list = Array.isArray(d?.scene_packs) ? d.scene_packs : []
  return list.filter(p => p?.scene_tag === HOTEL_SCENE_TAG)
}

/**
 * HT-* 联动模板过滤 (18 条); body 双兼容 [t8g]: 新后端 {items,total} 对象 /
 * 旧固件裸数组, 与 api/linkage.ts unwrapRuleTemplates 同式。
 */
export function pickHotelTemplates(body: unknown): RuleTemplate[] {
  const list = Array.isArray(body)
    ? body
    : (body as { items?: RuleTemplate[] } | null | undefined)?.items
  return (Array.isArray(list) ? list : []).filter(
    t => t?.template_id?.startsWith(HOTEL_TEMPLATE_PREFIX)
  )
}

/** 酒店场景事件过滤 (alarm_type ∈ HOTEL_EVENT_TYPES; 防御式容忍 string) */
export function isHotelEvent(type: unknown): boolean {
  return (HOTEL_EVENT_TYPES as readonly string[]).includes(String(type))
}

/** metadata 明细摘要键 (员工通道 fusion 插件 14 维中的关键拦截证据维度) */
export const CORRIDOR_METADATA_KEYS = [
  'card_person_id', 'direction', 'person_ge2_ratio', 'tailgating_confidence',
  'spoof_confidence', 'spoof_ratio', 'has_backpack', 'backpack_tracks',
  'replay_attack', 'anti_passback', 'liveness_frames', 'embedding_match',
] as const
