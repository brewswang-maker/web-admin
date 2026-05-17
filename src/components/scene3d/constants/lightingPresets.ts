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
    ambient: { color: 0x404040, intensity: 0.6 },
    directional: {
      color: 0xffffff,
      intensity: 0.8,
      position: [30, 40, 20],
      castShadow: true,
      shadowMapSize: 2048,
    },
    point: { color: 0xffeedd, intensity: 0.2, position: [0, 20, 0], distance: 100 },
  },

  /** 夜间 — 暗蓝调，模拟夜间工厂环境 */
  night: {
    ambient: { color: 0x1a1a2e, intensity: 0.3 },
    directional: {
      color: 0x4466aa,
      intensity: 0.3,
      position: [30, 40, 20],
      castShadow: true,
      shadowMapSize: 2048,
    },
    point: { color: 0xffaa44, intensity: 0.5, position: [0, 15, 0], distance: 100 },
  },

  /** 黄昏 — 暖橙色，营造氛围感 */
  dusk: {
    ambient: { color: 0x332211, intensity: 0.4 },
    directional: {
      color: 0xff8844,
      intensity: 0.5,
      position: [-30, 15, -10],
      castShadow: true,
      shadowMapSize: 2048,
    },
    point: { color: 0xff6600, intensity: 0.3, position: [0, 20, 0], distance: 100 },
  },
}

/** 场雾配置（按灯光模式） */
export const FOG_PRESETS: Record<LightingMode, { color: number; density: number }> = {
  day:   { color: 0x0a0e17, density: 0.008 },
  night: { color: 0x050810, density: 0.012 },
  dusk:  { color: 0x0a0805, density: 0.010 },
}

/** 场景背景色（按灯光模式） */
export const BACKGROUND_PRESETS: Record<LightingMode, number> = {
  day:   0x0a0e17,
  night: 0x050810,
  dusk:  0x0a0805,
}
