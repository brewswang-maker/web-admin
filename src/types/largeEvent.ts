/**
 * 大型活动 EventGuard 类型定义 — Phase 0-1 (2026-08-27)
 *
 * 与后端单一事实源对齐:
 *   - CapacityProfileStore.h CapacityProfileDef  (容量档案 §4.3.1)
 *   - ScenePackDefs.h ScenePackDef               (场景包 §5)
 *   - FlowFieldAnalyzer.h FlowFieldSnapshot      (矢量场 §4.3.2)
 *   - DensityHistoryService.h DensityPredictResult (预测 §4.3.4)
 */

// ── 容量档案 (§4.3.1) ──────────────────────────────────────

export interface CapacityLevel {
  name: string              // "yellow" / "orange" / "red"
  capacity_ratio: number    // 触发阈值 (占用比)
  severity: number          // 事件级别 1-5
  action: string            // 预案动作 (逗号分隔)
}

export interface CapacityHysteresis {
  release_ratio_delta: number
  min_hold_sec: number
}

export interface CapacityProfile {
  id: number
  region_id: string
  channel_id: number
  scene_tag: string
  name: string
  design_capacity: number
  max_density_per_sqm: number
  area_sqm: number
  levels: CapacityLevel[]
  hysteresis: CapacityHysteresis
  enabled: boolean
  created_at: number
  updated_at: number
}

// ── 场景包 (§5) ────────────────────────────────────────────

export interface ScenePack {
  scene_pack_id: string
  display_name: string
  scene_tag: string
  description: string
  algo_set: string[]
  /** 三圈布防: core_circle / alert_circle / control_circle → 区域名列表
   *  [加油站三期] 加油站 3 包 key 为 gas_station_{core,alert,control}_circle */
  zones: Record<string, string[]>
  /** [加油站三期 2026-08-30] 三圈半径 (米): Gas3D 动态半径数据源, 仅加油站 3 包非空 */
  circle_radii_m?: Record<string, number>
  threshold_profile: string
  linkage_templates: string[]
  deploy_eta_min: number
  highlights: string[]
}

export interface ScenePackAlgoCheck {
  algo_id: string
  registered: boolean
  display_name?: string
}

export interface ScenePackApplyDetail {
  template_id: string
  rule_id?: string
  rule_name?: string
  status: 'created' | 'skipped_exists' | 'template_missing' | 'add_failed' | string
  error?: string
}

export interface ScenePackApplyResult {
  scene_pack_id: string
  scene_tag: string
  algo_check: ScenePackAlgoCheck[]
  missing_algos: string[]
  ready: boolean
  /** apply v2 (2026-08-28): deploy=true 时 LE 模板实例化结果 */
  deployed?: boolean
  rules_created?: number
  rules_skipped?: number
  rules_legacy_purged?: number
  rules_failed?: string[]
  instantiate_detail?: ScenePackApplyDetail[]
  [key: string]: unknown
}

// ── 场景包导出/导入 [M3-1 2026-09-21] ────────────────────────
//   导出: shield-scene-pack-v1 JSON (算法参数+区域+联动模板+部署实例快照)
//   导入: 分块协议 init → chunks/:index → status → complete (断点续传/幂等)

export interface ScenePackCapabilities {
  required_algos: string[]
  algo_availability: ScenePackAlgoCheck[]
  missing_algos: string[]
  ready: boolean
  /** init 预检未携带 required_algos 时为 false (报告字段缺失) */
  checked?: boolean
}

/** 导出文档 (GET .../scene-packs/:id/export → shield-scene-pack-v1) */
export interface ScenePackExportDoc {
  format: string
  catalog_version: string
  exported_at_ms: number
  exported_from: { boot_id: string; software_version: string }
  suggested_filename: string
  scene_pack: ScenePack
  /** 本机已部署的同场景包联动规则快照 (tags 含 pack id; 空 = 未部署) */
  deployed_state: Array<{
    rule_id: string
    rule_name: string
    enabled: boolean
    channel_ids: string[]
  }>
  capabilities: ScenePackCapabilities
}

/** 导入 init 响应 (resumed=true = client_request_id 命中, 已收分片即续传起点) */
export interface ScenePackImportInitResult {
  upload_id: string
  chunk_size: number
  total_chunks: number
  received_chunks: number[]
  resumed: boolean
  completed: boolean
  capabilities: ScenePackCapabilities
}

/** 导入 chunk 响应 (分片覆盖写 = 重传幂等) */
export interface ScenePackImportChunkResult {
  upload_id: string
  received_chunks: number[]
  done: boolean
}

/** 导入 status 响应 (断点续传查询) */
export interface ScenePackImportStatus {
  upload_id: string
  filename: string
  filesize: number
  total_chunks: number
  chunk_size: number
  received_chunks: number[]
  done: boolean
  completed: boolean
  created_at_ms: number
}

/** 导入 complete 响应 (合并+校验+实例化; deploy=false 仅校验 dry-run) */
export interface ScenePackImportResult {
  upload_id: string
  scene_pack_id: string
  imported: boolean
  file: string
  catalog_compat: {
    export_catalog_version: string
    local_catalog_version: string
    compatible: boolean
  }
  capabilities: ScenePackCapabilities
  deployed: boolean
  rules_created: number
  rules_skipped: number
  rules_legacy_purged: number
  rules_failed: string[]
  instantiate_detail: ScenePackApplyDetail[]
  note: string
}

// ── 流速矢量场 (§4.3.2) ───────────────────────────────────

export interface FlowFieldCell {
  count: number
  mean_vx: number
  mean_vy: number
  speed_avg: number
  direction_entropy: number
}

export interface FlowFieldResponse {
  found: boolean
  channel_id: number
  timestamp_ms: number
  grid: number
  /** row-major 嵌套: cells[y][x] */
  cells: FlowFieldCell[][]
  moving_samples: number
  max_entropy: number
  mean_entropy: number
  entropy_threshold: number
  sustain_ms: number
  anomaly: boolean
  anomaly_sustained_ms: number
}

// ── 密度预测 (§4.3.4) ──────────────────────────────────────

export interface DensityPredictPoint {
  timestamp_ms: number
  density: number
  lower: number
  upper: number
}

export interface DensityPredictResponse {
  found: boolean
  channel_id: number
  horizon_min?: number
  history_samples?: number
  step_min?: number
  fit_mape?: number
  ema_last?: number
  slope_per_min?: number
  points: DensityPredictPoint[]
  reason?: string
}

// ── 密度快照 / 热力 (既有 v7.2 端点) ───────────────────────

export interface DensityLatestResponse {
  found: boolean
  channel_id?: number
  snapshot_ms: number
  grid_w: number
  grid_h: number
  counts: number[][]
}

export interface DensityHeatmapResponse {
  found: boolean
  channel_id?: number
  snapshot_ms: number
  grid_w: number
  grid_h: number
  total_count: number
  max_cell: number
  color_scheme: string
  normalized: number[][]
  /** rgba[y][x] = [r, g, b, a] (0-255) */
  rgba: number[][][]
}

export interface DensityHistoryEntry {
  id: number
  channel_id: number
  grid_id: number
  snapshot_ms: number
  counts: number[][] | string
}

// ── 大型活动四场景 tag (SSOT EventTypeAliases.h) ──────────

export const LARGE_EVENT_SCENES = [
  'large_event_stadium',
  'large_event_openair',
  'large_event_expo',
  'large_event_marathon',
] as const

export const LARGE_EVENT_CIRCLES = [
  { tag: 'large_event_core_circle', label: '核心圈' },
  { tag: 'large_event_alert_circle', label: '警戒圈' },
  { tag: 'large_event_control_circle', label: '管控圈' },
] as const

/** 9 新事件 canonical 键 (meta_table §5.4) */
export const NEW_LARGE_EVENT_TYPES = [
  'crowd_density_yellow',
  'crowd_density_orange',
  'crowd_density_red',
  'stampede_risk',
  'crowd_pre_warning',
  'crowd_flow_anomaly',
  'queue_overflow',
  'field_intrusion',
  'closing_clearance',
] as const
