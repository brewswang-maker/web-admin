/**
 * 华盾AI智能视频盒子 v7.0 - 类型统一导出
 * types/index.ts — 解决模块间同名导出冲突
 */

// user — 独立，无冲突
export * from './user'

// device — 独立，无冲突
export * from './device'

// alarm — AlarmStats 与 analytics 冲突，此处仅导出非冲突部分
export type {
  AlarmLevel, AlarmType, AlarmStatus,
  AlarmEvent, AlarmHandleForm, AlarmQuery,
  AlarmTrendItem, AlarmTypeDistribution
} from './alarm'

// common — AuditLog/SecurityScore 与 analytics 冲突，此处仅导出非冲突部分
export type {
  ApiResponse, PageResponse, PageQuery, SortQuery,
  TimeRange, KeyValue, AgentStatus, SystemHealth,
  OptionItem, Project
} from './common'

// notification — 独立，无冲突
export * from './notification'

// analytics — 包含 AlarmStats/AuditLog/SecurityScore 的扩展版本
export * from './analytics'

// scene3d-model — 3D 场景模型资源类型（glTF/GLB，非 AI 推理模型）
export * from './scene3d-model'
