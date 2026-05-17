/**
 * 工厂图纹理配置类型定义
 * Factory Texture Configuration Type Definitions
 *
 * @version 1.0.0
 * @description 定义3D场景中所有可替换纹理的规格、格式及光照色调方案
 */

// ════════════════════════════════════════════════════
// ── 纹理来源枚举 ──
// ════════════════════════════════════════════════════

/** 纹理素材来源 */
export enum TextureSource {
  /** 程序化 Canvas 生成（默认，无外部依赖） */
  PROCEDURAL = 'procedural',
  /** 自有素材：项目 assets 目录中的图片 */
  LOCAL_ASSET = 'local_asset',
  /** 公开资源：CC0/PD 协议的免费纹理 */
  PUBLIC_RESOURCE = 'public_resource',
  /** 客户提供：上传的工厂实景图 */
  CLIENT_UPLOADED = 'client_uploaded',
  /** 远程 URL：CDN 或 API 返回的纹理地址 */
  REMOTE_URL = 'remote_url',
}

// ════════════════════════════════════════════════════
// ── 纹理规格常量 ──
// ════════════════════════════════════════════════════

/** 纹理图片推荐规格 */
export const TEXTURE_SPECS = {
  /** 地面纹理 */
  ground: {
    width: 2048,
    height: 2048,
    format: 'image/png' as const,
    maxSizeKB: 512,
    description: '工厂地面纹理，混凝土/沥青材质',
    notes: '需可无缝平铺 (seamless tileable)',
  },
  /** 建筑墙体纹理 */
  buildingWall: {
    width: 1024,
    height: 1024,
    format: 'image/png' as const,
    maxSizeKB: 256,
    description: '工厂建筑外墙纹理',
    notes: '支持按建筑类型配置不同纹理',
  },
  /** 屋顶纹理 */
  roof: {
    width: 512,
    height: 512,
    format: 'image/png' as const,
    maxSizeKB: 128,
    description: '建筑屋顶纹理',
    notes: '彩钢瓦/水泥屋顶',
  },
  /** 围墙纹理 */
  fence: {
    width: 512,
    height: 256,
    format: 'image/png' as const,
    maxSizeKB: 64,
    description: '围墙纹理，铁丝网/砖墙',
    notes: '水平可平铺',
  },
} as const

/** 支持的图片格式 */
export const SUPPORTED_TEXTURE_FORMATS = ['png', 'jpg', 'jpeg', 'webp'] as const
export type SupportedTextureFormat = typeof SUPPORTED_TEXTURE_FORMATS[number]

// ════════════════════════════════════════════════════
// ── 纹理配置接口 ──
// ════════════════════════════════════════════════════

/** 单张纹理配置 */
export interface TextureConfig {
  /** 唯一标识 */
  id: string
  /** 纹理类型 */
  type: 'ground' | 'buildingWall' | 'roof' | 'fence' | 'custom'
  /** 纹理来源 */
  source: TextureSource
  /** 纹理资源路径（LOCAL_ASSET 为相对路径, REMOTE_URL 为完整 URL） */
  url?: string
  /** 程序化纹理的种子值（仅 source=PROCEDURAL 时使用） */
  seed?: number
  /** UV 重复次数 [repeatX, repeatY] */
  repeat?: [number, number]
  /** UV 偏移 [offsetX, offsetY] */
  offset?: [number, number]
  /** 纹理旋转角度 (弧度) */
  rotation?: number
  /** 是否可无缝平铺 */
  tileable?: boolean
  /** 备注说明 */
  description?: string
}

/** 建筑纹理集：同一建筑可配置不同的墙面/屋顶纹理 */
export interface BuildingTextureSet {
  /** 建筑名称（与 Scene3D buildings prop 中的 name 对应） */
  buildingName: string
  /** 墙体纹理 ID */
  wallTextureId?: string
  /** 屋顶纹理 ID */
  roofTextureId?: string
  /** 自定义基础色（会与纹理叠加） */
  tintColor?: string
}

// ════════════════════════════════════════════════════
// ── 光照与色调配置 ──
// ════════════════════════════════════════════════════

/** 光照配置 */
export interface LightingConfig {
  /** 环境光颜色 (hex) */
  ambientColor: string
  /** 环境光强度 [0, 3] */
  ambientIntensity: number

  /** 半球光：天空色 (hex) */
  hemisphereSkyColor: string
  /** 半球光：地面色 (hex) */
  hemisphereGroundColor: string
  /** 半球光强度 [0, 3] */
  hemisphereIntensity: number

  /** 主方向光颜色 (hex) */
  directionalColor: string
  /** 主方向光强度 [0, 5] */
  directionalIntensity: number
  /** 主方向光位置 [x, y, z] */
  directionalPosition: [number, number, number]
  /** 是否投射阴影 */
  castShadow: boolean

  /** 补光颜色 (hex) */
  fillColor: string
  /** 补光强度 [0, 3] */
  fillIntensity: number
  /** 补光位置 [x, y, z] */
  fillPosition: [number, number, number]

  /** 点光源颜色 (hex) */
  pointColor: string
  /** 点光源强度 [0, 3] */
  pointIntensity: number
  /** 点光源位置 [x, y, z] */
  pointPosition: [number, number, number]
}

/** 色调映射配置 */
export interface ToneMappingConfig {
  /** 色调映射算法 */
  mode: 'None' | 'Linear' | 'Reinhard' | 'Cineon' | 'ACESFilmic'
  /** 曝光度 [0.1, 3.0] */
  exposure: number
}

/** 场景雾效配置 */
export interface FogConfig {
  /** 雾效类型 */
  type: 'none' | 'exp2' | 'linear'
  /** 雾效颜色 (hex) */
  color: string
  /** FogExp2 密度 (仅 type=exp2) */
  density?: number
  /** 线性雾近裁面 (仅 type=linear) */
  near?: number
  /** 线性雾远裁面 (仅 type=linear) */
  far?: number
}

// ════════════════════════════════════════════════════
// ── 场景整体纹理配置 ──
// ════════════════════════════════════════════════════

/** 完整场景纹理配置方案 */
export interface SceneTextureConfig {
  /** 配置方案 ID */
  id: string
  /** 方案名称 */
  name: string
  /** 方案描述 */
  description?: string
  /** 场景背景色 (hex) */
  backgroundColor: string
  /** 纹理列表 */
  textures: TextureConfig[]
  /** 建筑纹理映射 */
  buildingTextures: BuildingTextureSet[]
  /** 光照配置 */
  lighting: LightingConfig
  /** 色调映射配置 */
  toneMapping: ToneMappingConfig
  /** 雾效配置 */
  fog: FogConfig
  /** 是否为当前激活方案 */
  active?: boolean
  /** 创建时间 */
  createdAt?: string
  /** 更新时间 */
  updatedAt?: string
}

// ════════════════════════════════════════════════════
// ── 纹理资源元数据 ──
// ════════════════════════════════════════════════════

/** 纹理资源的详细元信息（用于纹理管理界面） */
export interface TextureResourceMeta {
  /** 纹理 ID */
  id: string
  /** 显示名称 */
  name: string
  /** 纹理类型 */
  type: TextureConfig['type']
  /** 来源 */
  source: TextureSource
  /** 来源说明（如 "Poly Haven CC0"） */
  sourceAttribution?: string
  /** 许可协议 */
  license?: 'CC0' | 'CC-BY-4.0' | 'MIT' | 'proprietary' | 'unknown'
  /** 预览缩略图 URL */
  thumbnailUrl?: string
  /** 文件大小 (bytes) */
  fileSize?: number
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
  /** 格式 */
  format: SupportedTextureFormat
  /** 是否可无缝平铺 */
  tileable: boolean
  /** 标签 */
  tags?: string[]
}
