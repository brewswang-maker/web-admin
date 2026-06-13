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
