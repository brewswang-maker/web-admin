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

/** 默认相机参数 — 适用于工厂全景 */
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
  /** 默认 — 45度俯瞰全景 */
  overview: {
    name: 'overview',
    label: '全局俯瞰',
    position: [60, 50, 70],
    target: [0, 0, 0],
    fov: 50,
    duration: 1200,
  },
  /** 正面 — 从南大门方向看工厂 */
  front: {
    name: 'front',
    label: '正面视角',
    position: [0, 15, 80],
    target: [0, 5, 0],
    fov: 55,
    duration: 1000,
  },
  /** 侧面 — 从东面看工厂 */
  side: {
    name: 'side',
    label: '侧面视角',
    position: [80, 20, 0],
    target: [0, 5, 0],
    fov: 50,
    duration: 1000,
  },
  /** 顶部 — 正上方鸟瞰 */
  top: {
    name: 'top',
    label: '正上方',
    position: [0, 100, 0.1],
    target: [0, 0, 0],
    fov: 45,
    duration: 1400,
  },
  /** 1号车间 — 聚焦左侧车间区域 */
  workshop1: {
    name: 'workshop1',
    label: '1号车间',
    position: [-20, 12, -8],
    target: [-20, 4, -15],
    fov: 60,
    duration: 1000,
  },
  /** 大门 — 聚焦南大门入口 */
  gate: {
    name: 'gate',
    label: '大门入口',
    position: [0, 8, 55],
    target: [0, 4, 42],
    fov: 55,
    duration: 1000,
  },
  /** 仓库区域 */
  warehouse: {
    name: 'warehouse',
    label: '仓库区域',
    position: [-30, 10, 30],
    target: [-25, 3, 15],
    fov: 55,
    duration: 1000,
  },
  /** 办公楼 */
  office: {
    name: 'office',
    label: '办公楼',
    position: [30, 14, 25],
    target: [20, 6, 15],
    fov: 50,
    duration: 1000,
  },
}

/** 预设视角名称列表（用于下拉菜单渲染） */
export const PRESET_LIST = Object.values(CAMERA_PRESETS)
