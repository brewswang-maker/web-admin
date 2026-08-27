/**
 * 事件类型 SSOT API — 后端 /api/v1/event-types/canonical
 *
 * 与后端 EventTypeAliases.h + RestApiHandlers.cpp 单一事实源 (SSOT) 对齐,
 * 用于联动规则 / CEP 引擎 / 告警订阅 / 前端下拉选择器.
 *
 * 关键修复 (v6.2 2026-06-21): 之前 useLinkageOptions 只能从 /algorithms 拉 31 个通用算法
 * (face / person / vehicle / intrusion), 无法订阅细分人脸告警 (face_blacklist / face_stranger /
 * face_pass_vip / face_liveness_fail 等). 这里新增 SSOT 端点暴露全部 30+ 事件类型.
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface CanonicalEventType {
  /** 规范 alarm_type (snake_case, e.g. "face_blacklist") */
  key: string
  /** 中文显示名 */
  name_zh: string
  /** 英文显示名 */
  name_en: string
  /** 分类: face / person / vehicle / behavior / perimeter / fire / safety / traffic / device */
  category: string
  /** 默认严重级别: 1=info 2=low 3=medium 4=high 5=critical (与 FaceDatabase.h EventSeverity 一致) */
  level: number
  /** 厂商对标: "hikvision/dahua/huawei/onvif/gov/all" */
  vendor: string
  /** 历史/兼容命名 (e.g. "face", "face_stranger", "whitelistface") */
  aliases: string[]
}

export interface CanonicalEventTypesResponse {
  types: CanonicalEventType[]
  count: number
  /** SSOT 标识, 提示数据来自 EventTypeAliases.h */
  ssot: string
}

// ============================================================
// v7.6 SSOT 事件类型元数据 (对标海康/大华事件配置面板)
// 来源: EventTypeAliases.h EventCategory + EventSeverity + EventTypeMeta
// 比 canonical 更丰富: 包含分类枚举/严重等级/中文名/UI分组/默认告警开关
// ============================================================

export interface EventTypeMetadataItem {
  /** 规范 alarm_type (snake_case) */
  alarm_type: string
  /** 事件大类: ALARM / NOTIFICATION / BUSINESS / STATE / PERCEPTION */
  category: string
  /** 大类中文名 */
  category_cn: string
  /** 严重等级: CRITICAL / HIGH / MEDIUM / LOW / INFO */
  severity: string
  /** 严重等级数值: 5=critical 4=high 3=medium 2=low 1=info */
  severity_level: number
  /** 严重等级中文名 */
  severity_cn: string
  /** 是否默认产生告警 */
  default_alarm_enabled: boolean
  /** 中文显示名 */
  display_name: string
  /** UI 分组: face / person / perimeter / behavior / fire / safety / traffic / device / object */
  ui_group: string
  /** 别名列表 */
  aliases: string[]
}

export interface EventTypeMetadataGroup {
  label: string
  items: EventTypeMetadataItem[]
}

export interface EventTypeMetadataResponse {
  /** 按 category 分组 */
  groups: Record<string, EventTypeMetadataGroup>
  total: number
  ssot: string
  /** [P0-1 二期补充] 全场景枚举 (EventTypeAliases.h getAllEventScenes),场景体系横向扩展入口 */
  scenes_available?: string[]
}

const eventTypesApi = {
  /** 获取所有 SSOT 事件类型, 可按 category 过滤 */
  list(params?: { category?: string }) {
    return http.get<ApiResponse<CanonicalEventTypesResponse>>(
      '/event-types/canonical',
      { params }
    )
  },

  /**
   * v7.6 获取 SSOT 事件类型元数据 (分类+严重等级+UI分组)
   * 对标海康/大华事件配置面板: 按大类分组, 每个事件带严重等级标签
   * [P0-1] scene: 场景标签过滤 (逗号分隔多值, e.g. "large_event_stadium,large_event_expo")
   */
  metadata(params?: { category?: string; severity?: string; scene?: string }) {
    return http.get<ApiResponse<EventTypeMetadataResponse>>(
      '/event-types/metadata',
      { params }
    )
  }
}

export default eventTypesApi
