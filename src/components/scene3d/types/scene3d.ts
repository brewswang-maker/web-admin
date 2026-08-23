/**
 * 华盾AI智能视频盒子 v7.0 - 3D场景统一类型定义
 * components/scene3d/types/scene3d.ts
 *
 * @version 2.0.0
 * @description Scene3D 组件重构后的完整类型系统
 */

import type { SceneTextureConfig } from '@/types/texture'

// ════════════════════════════════════════════════════
// ── 核心坐标类型 ──
// ════════════════════════════════════════════════════

/** Three.js 标准三维坐标元组 */
export type Vector3Tuple = [number, number, number]

// ════════════════════════════════════════════════════
// ── 3D 场景节点类型 ──
// ════════════════════════════════════════════════════

/** 3D场景中的设备节点 */
export interface Device3DNode {
  id: string
  name: string
  /** 世界坐标 [x, y, z] */
  x: number
  y: number
  z: number
  /** 设备运行状态 */
  status: 'online' | 'offline' | 'alarm' | 'maintenance'
  /** 安装位置描述 */
  location: string
  /** 告警类型（仅 status=alarm 时有值） */
  alarmType?: string
  /** 摄像头视锥角度(度)，默认60 */
  fov?: number
  /** 设备朝向(弧度) */
  rotation?: number
  /** 设备类型 — 用于决定3D模型形状 */
  deviceType?: 'IPCamera' | 'NVR' | 'DVR' | 'EdgeBox' | 'sensor'
  /** 业务关联ID — 对应 DeviceItem.id */
  businessId?: string
  /** 业务路由目标（覆盖默认路由策略） */
  routeTarget?: string
}

/**
 * @deprecated 使用 Device3DNode 替代，保留向后兼容
 * 旧版 Props 中的 Device3D 接口，Scene3D.vue 同时兼容两种类型
 */
export interface Device3DLegacy {
  id: string
  name: string
  x: number; y: number; z: number
  status: 'online' | 'offline' | 'alarm' | 'maintenance'
  location: string
  alarmType?: string
  fov?: number
  rotation?: number
}

/** 3D场景中的建筑节点 */
export interface Building3DNode {
  /** 建筑唯一标识 */
  id?: string
  name: string
  /** 建筑中心位置 [x, z] */
  x: number
  z: number
  /** 建筑尺寸 [宽度, 高度, 深度]（box 形状） */
  w?: number
  h?: number
  d?: number
  /** 建筑颜色 (hex字符串)，默认根据建筑类型自动选择 */
  color?: string
  /** 建筑类型 — 用于决定纹理和样式 */
  buildingType?: 'workshop' | 'warehouse' | 'office' | 'guardhouse' | 'powerhouse'
  /** 关联的项目/区域ID */
  projectId?: string
  /** 关联设备数（只读，由后端统计） */
  deviceCount?: number
  // ── 体育场场景扩展（与内置应用端 1:1 同源，数据源 scene_config.json）──
  /** 形状元：box/cylinder/disc/ring/shell/shell-cap/pylon/board/cone/anchor/model
   *         + 风格化散件: palm-tree/street-lamp/metro-arch/hotel-tower/road-segment/flagpole-row */
  shape?: 'box' | 'cylinder' | 'disc' | 'ring' | 'shell' | 'shell-cap' | 'pylon' | 'board' | 'cone' | 'anchor' | 'model'
    | 'palm-tree' | 'street-lamp' | 'metro-arch' | 'hotel-tower' | 'road-segment' | 'flagpole-row'
  /** GLB 模型 URL（shape='model' 时生效，相对站点根，例如 /models/stadium.glb） */
  modelUrl?: string
  /** 模型缩放系数（GLB 原始尺寸常为真实米数，需压缩到场景单位），默认 1 */
  modelScale?: number
  /** 模型绕 Y 轴旋转（度），默认 0 */
  modelRotationDeg?: number
  /** 模型垂直偏移（米），用于把 GLB 原点贴到地面或抬升到指定高度，默认 0 */
  modelOffsetY?: number
  /** 椭圆半径（cylinder/disc/ring/shell/shell-cap/cone） */
  rx?: number
  rz?: number
  /** ring 内半径 */
  innerRx?: number
  innerRz?: number
  /** 朝向角（度）: shell-cap 切片朝向 / board LED 大屏绕 Y 朝向（BoxGeometry 正面默认朝 +z，旋转 θ 后朝 (sinθ, 0, cosθ)） */
  thetaDeg?: number
  /** 看台三色环带（蓝/黄/绿） */
  tiers?: string[]
  /** 自发光色（board LED 屏 / fountain 喷泉芯） */
  emissive?: string
  /** 透明度覆盖（玻璃连廊等） */
  opacity?: number
  /** 草坪标线（中线/中圈/禁区） */
  pitchLines?: boolean
  /** 塔桅顶部向上光束 */
  beam?: boolean
  /** 旗杆数量（disc 上附加） */
  flagpoles?: number
  /** 喷泉中央水柱 */
  jet?: boolean
  /** 层叠数量（波浪馆/建筑群错位叠放） */
  stack?: number
  /** 半球顶（水滴馆/红瓦小屋尖顶近似） */
  cap?: boolean
  /** 地面边缘发光线（停车场 LED 描边） */
  edgeGlow?: string
  /** 装饰层节点（受场景 decor 开关控制） */
  decor?: boolean
  /** cone 簇数量 */
  count?: number
  /** board 悬浮高度 */
  y?: number
  /** 不可见锚点（看台分区告警联动，仅设备挂载） */
  selectable?: boolean
}

/** 设备3D放置信息（后端 device_attributes scene_* 键的聚合） */
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

/** 场景元参数（地面/周界/方位/装饰层，Scene3D props 使用） */
export interface SceneMeta {
  ground?: { width: number; height: number }
  perimeter?: { halfW: number; halfD: number }
  rotationDeg?: number
  decor?: boolean
}

/** 场景方案（对应后端 scene_config.json） */
export interface SceneScheme {
  id: string
  name: string
  buildings: Building3DNode[]
  fences?: Fence3DSegment[]
  ground?: { width: number; height: number }
  /** 周界兜底布局参数（无坐标设备的均匀分布矩形） */
  perimeter?: { halfW: number; halfD: number }
  /** 整体方位校准角（度） */
  rotationDeg?: number
  /** 装饰层开关（树列/地面灯线） */
  decor?: boolean
}

/** 3D场景中的围墙段 */
export interface Fence3DSegment {
  /** 围墙段起点 */
  x: number; y: number; z: number
  /** 围墙尺寸 [宽, 高, 深] */
  width: number
  height: number
  depth: number
}

// ════════════════════════════════════════════════════
// ── Camera 相关类型 ──
// ════════════════════════════════════════════════════

/** 相机预设视角 */
export interface CameraPreset {
  /** 预设唯一标识 */
  name: string
  /** 预设显示名称 */
  label: string
  /** 相机位置 [x, y, z] */
  position: Vector3Tuple
  /** 看向目标点 [x, y, z] */
  target: Vector3Tuple
  /** 视野角度（度），不传则保持当前 */
  fov?: number
  /** 过渡动画时长(ms)，默认1200 */
  duration?: number
}

/** 相机完整配置 */
export interface CameraConfig {
  /** 视野角度（度） */
  fov: number
  /** 近裁面 */
  near: number
  /** 远裁面 */
  far: number
  /** 初始相机位置 */
  position: Vector3Tuple
  /** 初始看向目标 */
  target: Vector3Tuple
  /** 最大极角(弧度)，限制相机不能翻到地下 */
  maxPolarAngle: number
  /** 最小缩放距离 */
  minDistance: number
  /** 最大缩放距离 */
  maxDistance: number
  /** 阻尼系数 */
  dampingFactor: number
}

/** 相机控制模式 */
export type CameraControlMode = 'free' | 'presentation' | 'focused'

// ════════════════════════════════════════════════════
// ── Lighting 相关类型 ──
// ════════════════════════════════════════════════════

/** 灯光模式 */
export type LightingMode = 'day' | 'night' | 'dusk'

/** 场景灯光配置（简化版，不依赖 texture.ts 中的 LightingConfig） */
export interface SceneLightingPreset {
  /** 环境光 */
  ambient: { color: number; intensity: number }
  /** 半球光 */
  hemisphere?: { skyColor: number; groundColor: number; intensity: number }
  /** 主方向光 */
  directional: {
    color: number; intensity: number
    position: Vector3Tuple
    castShadow: boolean
    shadowMapSize: number
  }
  /** 补光点光源 */
  point?: { color: number; intensity: number; position: Vector3Tuple; distance: number }
}

// ════════════════════════════════════════════════════
// ┐─ 事件系统类型 ──
// ════════════════════════════════════════════════════

/** 3D场景业务事件 */
export interface Scene3DEvent {
  type: 'device-click' | 'device-hover' | 'device-doubleclick'
    | 'building-click' | 'ground-click'
    | 'camera-animation-complete'
  payload: {
    deviceId?: string
    deviceName?: string
    buildingName?: string
    deviceStatus?: string
    businessId?: string
    routeTarget?: string
    position?: Vector3Tuple
    alarmType?: string
  }
}

// ════════════════════════════════════════════════════
// ── 组件 Props & Emits ──
// ════════════════════════════════════════════════════

/** Scene3D 组件 Props */
export interface Scene3DProps {
  /** 设备列表 */
  devices?: Device3DNode[]
  /** 建筑列表 */
  buildings?: Building3DNode[]
  /** 纹理配置 — 对接 useTextureManager */
  textureConfig?: SceneTextureConfig
  /** 相机配置 — 不传则使用默认 */
  cameraConfig?: Partial<CameraConfig>
  /** 灯光模式 */
  lightingMode?: LightingMode
  /** 是否显示标签 */
  showLabels?: boolean
  /** 是否显示脉冲告警动画 */
  alarmPulse?: boolean
  /** 是否启用交互事件 */
  interactive?: boolean
  /** 选中的设备ID — 高亮显示 */
  selectedDeviceId?: string
  /** 性能模式 */
  performanceMode?: 'quality' | 'balanced' | 'performance'
}

// ════════════════════════════════════════════════════
// ── 设备 Mesh 注册表 ──
// ════════════════════════════════════════════════════

import type { Mesh } from 'three'
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

/** 单个设备在3D场景中的渲染实体 */
export interface DeviceMeshEntry {
  /** 摄像头主体 */
  mesh: Mesh
  /** FOV视锥体 */
  cone: Mesh
  /** 告警脉冲球（仅 alarm 状态时存在） */
  pulse?: Mesh
  /** CSS2D 标签 */
  label?: CSS2DObject
  /** 设备数据引用 */
  deviceData: Device3DNode
}

/** 单个建筑在3D场景中的渲染实体 */
export interface BuildingMeshEntry {
  /** 建筑主体 */
  mesh: Mesh
  /** 边框线 */
  edges: import('three').LineSegments
  /** 建筑数据引用 */
  buildingData: Building3DNode
}

// ════════════════════════════════════════════════════
// ── 工具函数 ──
// ════════════════════════════════════════════════════

/** 设备状态 → 显示文本 */
export function getDeviceStatusLabel(status: string): string {
  switch (status) {
    case 'online': return '🟢 在线'
    case 'alarm': return '🔴 告警'
    case 'maintenance': return '🟡 维护中'
    case 'offline': return '⚫ 离线'
    default: return '⚫ 未知'
  }
}

/** 设备状态 → 图标 emoji */
export function getDeviceStatusIcon(status: string): string {
  switch (status) {
    case 'online': return '🟢'
    case 'alarm': return '🔴'
    case 'maintenance': return '🟡'
    case 'offline': return '⚫'
    default: return '⚫'
  }
}

/** 设备状态 → 颜色值(number) */
export function getDeviceStatusColor(status: string): number {
  switch (status) {
    case 'online': return 0x0F9D58
    case 'alarm': return 0xDB4437
    case 'offline': return 0x555555
    case 'maintenance': return 0xF4B400
    default: return 0x0F9D58
  }
}

/** 解析 hex 颜色字符串为整数（支持 3 位缩写 #RGB → #RRGGBB） */
export function parseHexColor(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  return parseInt(full, 16)
}
