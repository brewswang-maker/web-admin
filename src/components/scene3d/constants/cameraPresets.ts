/**
 * 华盾AI智能视频盒子 v7.0 - 相机预设位置常量
 * components/scene3d/constants/cameraPresets.ts
 *
 * @description 定义3D场景中所有可用的预设视角
 */

import type { CameraPreset, CameraConfig } from '../types/scene3d'

// ════════════════════════════════════════════════════
// ── 默认相机配置 ──
// ════════════════════════════════════════════════════

/** 默认相机参数 — 适用于体育场全景 */
export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  fov: 50,
  near: 0.1,
  far: 500,
  position: [60, 50, 70],
  target: [0, 0, 0],
  maxPolarAngle: Math.PI / 2.2,
  minDistance: 20,
  maxDistance: 150,
  dampingFactor: 0.08,
}

// ════════════════════════════════════════════════════
// ── 预设视角列表 ──
// ════════════════════════════════════════════════════

/** 所有可用的相机预设视角 */
export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  /** 默认 — 45度俯瞰体育场全场 */
  overview: {
    name: 'overview',
    label: '全场俯瞰',
    position: [70, 55, 85],
    target: [0, 0, 0],
    fov: 50,
    duration: 1200,
  },
  /** 正面 — 从主入口方向看体育场 */
  front: {
    name: 'front',
    label: '正面视角',
    position: [0, 15, 90],
    target: [0, 5, 0],
    fov: 55,
    duration: 1000,
  },
  /** 侧面 — 从东侧看体育场 */
  side: {
    name: 'side',
    label: '侧面视角',
    position: [90, 22, 0],
    target: [0, 5, 0],
    fov: 50,
    duration: 1000,
  },
  /** 顶部 — 正上方鸟瞰 */
  top: {
    name: 'top',
    label: '正上方',
    position: [0, 110, 0.1],
    target: [0, 0, 0],
    fov: 45,
    duration: 1400,
  },
  /** 主入口 — 聚焦南侧主入口广场 */
  gate: {
    name: 'gate',
    label: '主入口',
    position: [0, 10, 58],
    target: [0, 4, 24],
    fov: 55,
    duration: 1000,
  },
  /** 看台 — 聚焦主体育场看台与内场 */
  stands: {
    name: 'stands',
    label: '看台区域',
    position: [0, 28, 34],
    target: [0, 6, -8],
    fov: 55,
    duration: 1000,
  },
  /** 停车场 — 聚焦南侧停车场 */
  parking: {
    name: 'parking',
    label: '停车场',
    position: [0, 30, 82],
    target: [0, 2, 46],
    fov: 55,
    duration: 1000,
  },
}

/** 预设视角名称列表（用于下拉菜单渲染） */
export const PRESET_LIST = Object.values(CAMERA_PRESETS)
