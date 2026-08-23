/**
 * 华盾AI智能视频盒子 v7.0 - 3D 场景管理 API 封装
 * api/scene.ts
 *
 * @description 场景配置读写 + 设备3D放置位置管理
 *
 * 后端端点:
 *   GET    /api/v1/scene/config                  读取场景配置 JSON
 *   PUT    /api/v1/scene/config                  保存场景配置（全量替换）
 *   GET    /api/v1/scene/devices/placement       批量获取设备3D放置信息
 *   PUT    /api/v1/scene/devices/:id/placement   更新设备3D位置
 *   DELETE /api/v1/scene/devices/:id/placement   清除手动位置（恢复自动映射）
 */

import { http } from './http'

// ─────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────

/** 设备3D放置信息（后端 device_attributes 中 scene_* 键的聚合） */
export interface DevicePlacement {
  deviceId: string
  sceneX?: number | string
  sceneY?: number | string
  sceneZ?: number | string
  rotation?: number | string
  fov?: number | string
  buildingId?: string
  manual?: boolean
}

/** 场景方案 */
export interface SceneScheme {
  version?: string
  activeSceneId?: string
  scenes: SceneConfig[]
}

/** 单个场景配置 */
export interface SceneConfig {
  id: string
  name: string
  buildings: SceneBuilding[]
  fences?: SceneFence[]
  ground?: { width: number; height: number }
  /** 周界兜底布局参数 */
  perimeter?: { halfW: number; halfD: number }
  /** 整体方位校准角（度） */
  rotationDeg?: number
  /** 装饰层开关 */
  decor?: boolean
  /** 演示设备点位（无真实设备时兜底） */
  demoDevices?: Array<Record<string, unknown>>
}

/** 场景建筑（对应前端 Building3DNode，含体育场形状扩展） */
export interface SceneBuilding {
  id?: string
  name: string
  x: number
  z: number
  w?: number
  d?: number
  h?: number
  color?: string
  buildingType?: string
  // ── 体育场场景形状扩展（与 Building3DNode 同名同义）──
  shape?: 'box' | 'cylinder' | 'disc' | 'ring' | 'shell' | 'shell-cap' | 'pylon' | 'board' | 'cone' | 'anchor'
  rx?: number
  rz?: number
  innerRx?: number
  innerRz?: number
  thetaDeg?: number
  tiers?: string[]
  emissive?: string
  opacity?: number
  pitchLines?: boolean
  beam?: boolean
  flagpoles?: number
  jet?: boolean
  stack?: number
  cap?: boolean
  edgeGlow?: string
  decor?: boolean
  count?: number
  y?: number
  selectable?: boolean
}

/** 场景围墙段 */
export interface SceneFence {
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
}

// ─────────────────────────────────────────────────────────
// API 方法
// ─────────────────────────────────────────────────────────

export const sceneApi = {
  /** 获取场景配置 */
  getConfig() {
    return http.get<SceneScheme>('/scene/config')
  },

  /** 保存场景配置（全量替换） */
  saveConfig(config: SceneScheme) {
    return http.put('/scene/config', config)
  },

  /** 批量获取所有设备的3D放置信息 */
  getDevicePlacements() {
    return http.get<DevicePlacement[]>('/scene/devices/placement')
  },

  /** 更新单个设备的3D放置位置 */
  updatePlacement(deviceId: string, placement: Partial<DevicePlacement>) {
    return http.put(`/scene/devices/${deviceId}/placement`, placement)
  },

  /** 清除设备的手动3D位置（恢复自动映射） */
  clearPlacement(deviceId: string) {
    return http.delete(`/scene/devices/${deviceId}/placement`)
  },
}
