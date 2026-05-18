/**
 * 3D 场景模型资源类型定义
 * Scene3D Model Resource Type Definitions
 *
 * @version 1.0.0
 * @description 3D工厂场景模型资源的元数据结构、缓存策略类型
 * @see docs/api/3d_model_resource_api.md — API 接口规范文档
 */

// ════════════════════════════════════════════════════
// ── 模型格式枚举 ──
// ════════════════════════════════════════════════════

/** 3D 模型文件格式 */
export enum Model3DFormat {
  /** glTF 2.0 JSON + 二进制分离 */
  GLTF = 'gltf',
  /** glTF 二进制容器 (推荐首选) */
  GLB = 'glb',
  /** Draco 压缩的 glTF/GLB (最高压缩比) */
  GLB_DRACO = 'glb_draco',
  /** Apple 通用场景描述 */
  USDZ = 'usdz',
  /** SceneKit 原生格式 */
  SCN = 'scn',
  /** COLLADA 交换格式 */
  DAE = 'dae',
  /** Wavefront OBJ */
  OBJ = 'obj',
}

/** 模型压缩方式 */
export enum Model3DCompression {
  /** 无压缩 */
  NONE = 'none',
  /** Draco 几何压缩 (70-90% 压缩比) */
  DRACO = 'draco',
  /** Meshopt 压缩 (更适合 WebGL) */
  MESHOPT = 'meshopt',
  /** 通用 gzip/brotli 传输压缩 */
  GZIP = 'gzip',
}

// ════════════════════════════════════════════════════
// ── 模型元数据接口 ──
// ════════════════════════════════════════════════════

/** 3D 模型资源元数据 */
export interface Scene3DModelMeta {
  /** 唯一标识 */
  id: string
  /** 模型名称 (如 "factory-main-building") */
  name: string
  /** 模型显示标题 */
  displayName: string
  /** 模型描述 */
  description?: string
  /** 模型分类标签 */
  category: Model3DCategory
  /** 文件格式 */
  format: Model3DFormat
  /** 压缩方式 */
  compression: Model3DCompression

  // ── 文件信息 ──
  /** 文件大小 (字节) */
  fileSize: number
  /** 文件 MD5 哈希 (用于缓存验证) */
  fileHash: string
  /** 模型文件下载 URL */
  url: string
  /** 缩略图 URL */
  thumbnailUrl?: string

  // ── 几何信息 ──
  /** 三角面数 */
  triangleCount: number
  /** 顶点数 */
  vertexCount: number
  /** 纹理数量 */
  textureCount: number
  /** 动画轨道数 */
  animationCount: number
  /** 包围盒 [minX, minY, minZ, maxX, maxY, maxZ] */
  boundingBox: [number, number, number, number, number, number]

  // ── 性能规格 ──
  /** LOD 级别 (0=最高精度) */
  lodLevel: number
  /** 预估 GPU 显存占用 (MB) */
  estimatedGpuMemory: number

  // ── 关联信息 ──
  /** 所属场景 ID */
  sceneId?: string
  /** 父模型 ID (LOD 关联) */
  parentModelId?: string
  /** LOD 子模型列表 (从高到低精度) */
  lodChildren?: string[]

  // ── 状态 ──
  /** 资源状态 */
  status: Model3DStatus
  /** 版本号 (语义化版本) */
  version: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
  /** 创建者 */
  createdBy?: string
}

/** 3D 模型分类 */
export enum Model3DCategory {
  /** 完整工厂场景 */
  FACTORY_SCENE = 'factory_scene',
  /** 单体建筑 */
  BUILDING = 'building',
  /** 设备模型 */
  EQUIPMENT = 'equipment',
  /** 周界设施 */
  PERIMETER = 'perimeter',
  /** 地形/地面 */
  TERRAIN = 'terrain',
  /** 摄像头模型 */
  CAMERA = 'camera',
  /** 装饰/植被 */
  DECORATION = 'decoration',
  /** 传感器标记 */
  SENSOR_MARKER = 'sensor_marker',
  /** 自定义模型 */
  CUSTOM = 'custom',
}

/** 模型资源状态 */
export enum Model3DStatus {
  /** 上传中 */
  UPLOADING = 'uploading',
  /** 处理中 (格式转换/压缩) */
  PROCESSING = 'processing',
  /** 可用 */
  ACTIVE = 'active',
  /** 已归档 (被新版本替代) */
  ARCHIVED = 'archived',
  /** 处理失败 */
  ERROR = 'error',
}

// ════════════════════════════════════════════════════
// ── API 请求参数 ──
// ════════════════════════════════════════════════════

/** GET /api/models 查询参数 */
export interface GetScene3DModelsParams {
  /** 按分类过滤 */
  category?: Model3DCategory
  /** 按格式过滤 */
  format?: Model3DFormat
  /** 按状态过滤 */
  status?: Model3DStatus
  /** 按场景 ID 过滤 */
  sceneId?: string
  /** 关键词搜索 (name/displayName) */
  keyword?: string
  /** LOD 级别过滤 */
  lodLevel?: number
  /** 最大文件体积 (字节) */
  maxSize?: number
  /** 排序字段 */
  sortBy?: 'createdAt' | 'updatedAt' | 'fileSize' | 'name'
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc'
  /** 页码 (从 1 开始) */
  page?: number
  /** 每页条数 */
  pageSize?: number
}

/** POST /api/models 上传参数 */
export interface UploadScene3DModelParams {
  /** 模型文件 (FormData) */
  file: File
  /** 模型名称 */
  name: string
  /** 显示标题 */
  displayName?: string
  /** 描述 */
  description?: string
  /** 分类 */
  category: Model3DCategory
  /** 场景 ID */
  sceneId?: string
  /** 父模型 ID (用于 LOD 关联) */
  parentModelId?: string
  /** 是否自动生成缩略图 */
  autoThumbnail?: boolean
}

/** PUT /api/models/:id 更新参数 */
export interface UpdateScene3DModelParams {
  /** 模型名称 */
  name?: string
  /** 显示标题 */
  displayName?: string
  /** 描述 */
  description?: string
  /** 分类 */
  category?: Model3DCategory
  /** 场景 ID */
  sceneId?: string
}

// ════════════════════════════════════════════════════
// ── 缓存策略接口 ──
// ════════════════════════════════════════════════════

/** 模型资源缓存策略 */
export interface Model3DCachePolicy {
  /** 缓存策略类型 */
  strategy: Model3DCacheStrategy
  /** 缓存过期时间 (秒) */
  maxAge: number
  /** 是否使用 ETag 验证 */
  useETag: boolean
  /** 是否允许协商缓存 (304) */
  allowRevalidate: boolean
  /** CDN 预热节点数 */
  cdnPreloadNodes?: number
}

/** 缓存策略类型 */
export enum Model3DCacheStrategy {
  /** 强缓存：客户端缓存期内直接使用 */
  FORCE_CACHE = 'force_cache',
  /** 协商缓存：每次验证后使用 */
  STALE_WHILE_REVALIDATE = 'stale_while_revalidate',
  /** 不缓存：每次从源拉取 */
  NO_CACHE = 'no_cache',
  /** immutable：版本变更则 URL 变化 */
  IMMUTABLE = 'immutable',
}

/** 模型资源 HTTP 缓存响应头 */
export interface Model3DCacheHeaders {
  /** Cache-Control 头 */
  cacheControl: string
  /** ETag (模型版本哈希) */
  etag: string
  /** 最后修改时间 */
  lastModified: string
  /** CDN 缓存命中 */
  xCdnCache?: 'HIT' | 'MISS' | 'STALE'
}

/** 模型资源下载响应 (含缓存头) */
export interface Scene3DModelDownload {
  /** 下载 URL (CDN 预签名地址) */
  downloadUrl: string
  /** 缓存策略 */
  cachePolicy: Model3DCachePolicy
  /** 文件哈希 (客户端校验) */
  fileHash: string
  /** 文件体积 (字节) */
  fileSize: number
  /** URL 过期时间 (预签名有效期) */
  expiresAt: string
}
