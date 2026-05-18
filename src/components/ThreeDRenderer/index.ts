/**
 * 华盾AI智能视频盒子 v7.0 - ThreeDRenderer 模块入口
 * components/ThreeDRenderer/index.ts
 *
 * @description 统一导出3D渲染模块的所有公共 API
 */

export { ModelLoader, parseHexColor, getStatusColor } from './ModelLoader'
export type {
  LoadedModelResult,
  BuildingModelResult,
  DeviceModelResult,
} from './ModelLoader'

export { SceneBuilder } from './SceneBuilder'
export type {
  SceneConfig,
  CameraConfig,
  RendererConfig,
  LightingConfig,
  WallConfig,
  WallsConfig,
  MaterialConfig,
  BuildingModelConfig,
  DeviceModelConfig,
  FullModelConfig,
} from './SceneBuilder'

import modelConfigRaw from './modelConfigs.json'
import type { FullModelConfig } from './SceneBuilder'

/** 加载后的完整模型配置（带类型断言） */
export const modelConfig = modelConfigRaw as unknown as FullModelConfig
