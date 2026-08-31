/**
 * 加油站模块 API — [加油站方案 2026-08-30]
 * 数据源: GET /large-event/scene-packs (SSOT, 三个加油站包 scene_tag=gas_station)
 *        GET /stats/tpu (复用, 推理调度水位 — 大屏调度卡)
 * 禁 mock: 全部字段与后端 RestApiHandlers 契约对齐
 *          (docs/plans/加油站整体解决方案设计_v1.0.md §3 + §6)
 *
 * 工程红线:
 *   T6 打电话/吸烟 不联动工艺联锁 (前端仅展示声光+TTS 类模板, 不展示 OPC UA)
 *   SYS_RELAY_SWITCH 仅辅助设备 (前端不显示工艺联锁类动作)
 *   安全 PLC 隔离: OPC UA 必经安全 PLC (前端不下发, 仅显示已配置模板)
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'
import type { ScenePack, ScenePackApplyResult } from '@/types/largeEvent'
import type { LinkageRule, RuleTemplate, RuleTriggerStat } from './linkage'

/** 加油站 T6 红线提示常量 (前端卡片顶部展示) */
export const GAS_T6_REDLINE = 'T6 硬红线: 打电话/吸烟 — 仅声光+TTS, 不联动工艺联锁'
export const GAS_EHS_CLOSED_LOOP = 'EHS 闭环: 视频 + 可燃气体 + 液位 + 温度 + 门禁, 视觉不可替代物理传感器'
export const GAS_PLC_ISOLATION = '安全 PLC 隔离: OPC UA 必经安全 PLC, SYS_RELAY_SWITCH 仅辅助设备'

/** 加油站事件分组 SSOT — 与设计文档 §6.2 (GS-* 模板 22 个) 对齐 */
export const GAS_EVENT_SECTIONS = {
  perimeter: ['intrusion', 'tripwire', 'climbing', 'loitering'],         // GS-yard-*
  fueling: ['phone_call', 'smoking', 'fire', 'smoke', 'smolder'],       // GS-fueling-* (T6 红线 + 紧急)
  unload: ['fire_access', 'illegal_parking', 'vehicle_detected',
          'lpr_violation', 'intrusion', 'face_stranger'],               // GS-unloading-*
  tank: ['intrusion', 'smoke', 'smolder', 'tripwire', 'climbing'],      // GS-tank-*
  store: ['abandoned', 'unattended_baggage', 'face_blacklist',
          'fall_detected', 'smoke'],                                    // GS-store-*
} as const

export type GasSectionKey = keyof typeof GAS_EVENT_SECTIONS

export const gasStationApi = {
  /** 加油站场景包清单 (复用 /large-event/scene-packs SSOT 端点, ScenePackDefs gas_station tag 过滤) */
  listScenePacks() {
    return http.get<ApiResponse<{ scene_packs: ScenePack[]; count: number }>>(
      '/large-event/scene-packs')
  },

  /** apply: 仅校验 / 校验并布防 (deploy=true 实例化 GS-* 模板为规则, 幂等) */
  applyScenePack(packId: string, opts?: { deploy?: boolean; channel_ids?: number[] }) {
    return http.post<ApiResponse<ScenePackApplyResult>>(
      `/large-event/scene-packs/${encodeURIComponent(packId)}/apply`,
      opts ?? {})
  },

  // ─── [vp4 2026-09-01] 联动规则 / 模板 (RulesView 数据源, 范式对齐 hotel) ───
  /** 加油站规则全集 (apply 布防产物, tag=gas_station 过滤) */
  listRules() {
    return http.get<ApiResponse<{ items: LinkageRule[] }>>('/linkage/rules', {
      params: { tag: GAS_SCENE_TAG },
    })
  },

  /** 全量规则模板 (前端取 GS-* 前缀做落地对照; {items,total}/裸数组双兼容) */
  listRuleTemplates() {
    return http.get<ApiResponse<RuleTemplate[] | { items: RuleTemplate[]; total: number }>>(
      '/linkage/rule-templates')
  },

  /** 规则触发统计 (增强信息, 失败可静默降级) */
  listRuleStats() {
    return http.get<ApiResponse<{ rules: RuleTriggerStat[] }>>('/linkage/rule-stats')
  },
}

// ── [vp4 2026-09-01] 加油站场景常量 (SSOT: ScenePackDefs.h gas_station 包组) ──

/** 场景 tag (apply 合并 tags 之一, 规则过滤主键) */
export const GAS_SCENE_TAG = 'gas_station'

/** 加油站专属 GS-* 联动模板前缀 */
export const GAS_TEMPLATE_PREFIX = 'GS-'

/** 从全量场景包中过滤加油站 3 包 (防御式: 响应结构异常时返回空数组) */
export function pickGasPacks(body: unknown): ScenePack[] {
  const d = (body as { data?: { scene_packs?: ScenePack[] } })?.data
  const list = Array.isArray(d?.scene_packs) ? d.scene_packs : []
  return list.filter(p => p?.scene_tag === GAS_SCENE_TAG)
}

/** GS-* 联动模板过滤; body 双兼容: 新后端 {items,total} / 旧固件裸数组 */
export function pickGasTemplates(body: unknown): RuleTemplate[] {
  const list = Array.isArray(body)
    ? body
    : (body as { items?: RuleTemplate[] } | null | undefined)?.items
  return (Array.isArray(list) ? list : []).filter(
    t => t?.template_id?.startsWith(GAS_TEMPLATE_PREFIX)
  )
}