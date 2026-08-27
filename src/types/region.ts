/**
 * @file region.ts
 * @brief 28 算法补齐 P0-A4 — 算法区域/绊线/计数区类型定义
 *
 * 与 box-sdk/include/pipeline/RegionStore.h 一一对应
 */

export type RegionType = 'detection_zone' | 'exclusion_zone' | 'counting_zone'
export type TripwireDirection = 'both' | 'a_to_b' | 'b_to_a'

export interface RegionDef {
  id: number
  channel_id: number
  algo_id: string
  name: string
  region_type: RegionType
  /** 归一化坐标 [0,1] - [[x1, y1], [x2, y2], ...] */
  polygon: [number, number][]
  enabled: boolean
  created_at: number
  updated_at: number
}

export interface TripwireDef {
  id: number
  channel_id: number
  algo_id: string
  name: string
  /** 归一化坐标 [0,1] */
  point_a: [number, number]
  point_b: [number, number]
  direction: TripwireDirection
  enabled: boolean
  created_at: number
  updated_at: number
}

export interface CountingZoneDef {
  id: number
  channel_id: number
  algo_id: string
  name: string
  /** 归一化坐标 [0,1] */
  polygon: [number, number][]
  target_class: string
  enabled: boolean
  created_at: number
}

/**
 * 🆕 v5.0 [Tailgating 区域版]: 通行通道 (多边形通行区)
 * 与 box-sdk PassagewayDef / RegionStore.h 一一对应。
 * 判定参数 -1 哨兵 = 未显式覆盖, 由 sensitivity 按映射表派生。
 */
export type SuppressMode = 'off' | 'fixed' | 'escalating'

export interface PassagewayDef {
  id: number
  channel_id: number
  /** GB28181 完整 20 位编码 (主查询键) */
  channel_id_str?: string
  algo_id: string
  name: string
  /** 通行区多边形 (≥3 点, 归一化) */
  transit_polygon: [number, number][]
  /** 前置缓冲区 (可选) */
  approach_polygon?: [number, number][]
  /** true=关注进入 / false=关注离开 */
  direction_in: boolean
  gate_device_id?: string
  gate_open_coil?: number
  gate_close_coil?: number
  card_source_label?: string
  /** 灵敏度 1-100 (唯一推荐入口) */
  sensitivity: number
  min_excess?: number
  window_ms?: number
  vote_window?: number
  vote_min?: number
  conf_threshold?: number
  min_bbox_h_ratio?: number
  max_bbox_h_ratio?: number
  count_head_class?: boolean
  suppress_mode: SuppressMode
  cooldown_sec?: number
  min_interval_ms?: number
  /** >0 = 由老 tripwire id 自动迁移 (幂等键) */
  migrated_from_tripwire?: number
  enabled: boolean
  created_at: number
  updated_at: number
}
