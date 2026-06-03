/**
 * 华盾AI智能视频盒子 v7.0 - 场景灯光预设
 * components/scene3d/constants/lightingPresets.ts
 *
 * @description 定义3种灯光模式（日间/夜间/黄昏）的完整配置
 */

import type { SceneLightingPreset, LightingMode } from '../types/scene3d'

/** 三种灯光模式预设 */
export const LIGHTING_PRESETS: Record<LightingMode, SceneLightingPreset> = {
  /** 日间 — 明亮、清晰，适合日常监控 */
  day: {
    ambient: { color: 0x99aabb, intensity: 1.5 },
    hemisphere: { skyColor: 0xc8d8e8, groundColor: 0x444422, intensity: 1.0 },
    directional: {
      color: 0xffffff,
      intensity: 3.0,
      position: [30, 40, 20],
      castShadow: true,
      shadowMapSize: 2048,
    },
    point: { color: 0xddeeff, intensity: 1.2, position: [0, 20, 0], distance: 150 },
  },

  /** 夜间 — 深蓝调，模拟夜间工厂环境 */
  night: {
    ambient: { color: 0x445566, intensity: 1.0 },
    hemisphere: { skyColor: 0x6688aa, groundColor: 0x222211, intensity: 0.6 },
    directional: {
      color: 0x8899bb,
      intensity: 1.5,
      position: [30, 40, 20],
      castShadow: true,
      shadowMapSize: 2048,
    },
    point: { color: 0xffaa44, intensity: 0.8, position: [0, 15, 0], distance: 100 },
  },

  /** 黄昏 — 暖橙色，营造氛围感 */
  dusk: {
    ambient: { color: 0x665533, intensity: 1.2 },
    hemisphere: { skyColor: 0xddaa66, groundColor: 0x332211, intensity: 0.8 },
    directional: {
      color: 0xff9955,
      intensity: 2.0,
      position: [-30, 15, -10],
      castShadow: true,
      shadowMapSize: 2048,
    },
    point: { color: 0xff7700, intensity: 0.8, position: [0, 20, 0], distance: 120 },
  },
}

/** 场雾配置（按灯光模式） */
export const FOG_PRESETS: Record<LightingMode, { color: number; density: number }> = {
  day:   { color: 0x1e2233, density: 0.003 },
  night: { color: 0x121620, density: 0.004 },
  dusk:  { color: 0x1e1a15, density: 0.004 },
}

/** 场景背景色（按灯光模式） */
export const BACKGROUND_PRESETS: Record<LightingMode, number> = {
  day:   0x1e2233,
  night: 0x121620,
  dusk:  0x1e1a15,
}
