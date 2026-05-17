/**
 * 华盾AI智能视频盒子 v7.0 - 算法商城类型定义
 * types/marketplace.ts — 算法商品、许可证、订单、用量统计等核心类型
 *
 * @description 与已有 Billing SDK (@shieldbox/billing-sdk-web) 类型体系对齐
 *              复用 ApiResponse/PageResponse/PaymentChannel 等通用类型
 */

// ============================================================================
// 分类与标签
// ============================================================================

/**
 * 算法商品分类（支持二级树结构）
 */
export interface AlgorithmCategory {
  id: string;
  name: string;                    // "目标检测", "行为分析", "人脸识别"
  slug: string;                    // "object-detection"
  icon: string;                    // Element Plus icon name
  description: string;
  parentId: string | null;         // 支持二级分类
  sortOrder: number;
  algorithmCount: number;
}

/**
 * 算法标签
 */
export interface AlgorithmTag {
  id: string;
  name: string;                    // "YOLOv8", "TPU加速", "实时"
  color: string;                   // "#1890ff"
  usageCount: number;
}

// ============================================================================
// 算法开发者
// ============================================================================

/**
 * 算法开发者/供应商
 */
export interface AlgorithmDeveloper {
  id: string;
  name: string;
  avatar: string;
  description: string;
  verified: boolean;               // 是否认证开发者
  totalAlgorithms: number;
  totalDownloads: number;
}

// ============================================================================
// 算法商品（核心实体）
// ============================================================================

/**
 * 算法类型枚举
 */
export type AlgorithmType =
  | 'detection'
  | 'classification'
  | 'segmentation'
  | 'recognition'
  | 'tracking'
  | 'anomaly'
  | 'multi-modal';

/**
 * 算法框架枚举
 */
export type AlgorithmFramework =
  | 'TPU-MLIR'
  | 'ONNX'
  | 'TensorRT'
  | 'OpenVINO'
  | 'NCNN';

/**
 * 算法输入类型
 */
export type AlgorithmInputType =
  | 'image'
  | 'video'
  | 'rtsp_stream'
  | 'multi_camera';

/**
 * 算法输出类型
 */
export type AlgorithmOutputType =
  | 'bounding_box'
  | 'keypoint'
  | 'mask'
  | 'feature_vector'
  | 'text'
  | 'alert';

/**
 * 算法商品状态
 */
export type AlgorithmProductStatus =
  | 'draft'
  | 'reviewing'
  | 'published'
  | 'deprecated'
  | 'removed';

/**
 * 算法商品（核心实体）
 */
export interface AlgorithmProduct {
  id: string;
  name: string;                    // "周界入侵检测算法"
  slug: string;                    // "perimeter-intrusion-detection"
  summary: string;                 // 一句话描述
  description: string;             // 详细介绍（Markdown）
  icon: string;                    // 商品图标 URL
  coverImage: string;              // 封面大图 URL
  screenshots: string[];           // 效果截图列表

  // 分类与标签
  categoryId: string;
  category: AlgorithmCategory;
  tags: AlgorithmTag[];

  // 算法技术属性
  algorithmType: AlgorithmType;
  framework: AlgorithmFramework;
  inputTypes: AlgorithmInputType[];
  outputTypes: AlgorithmOutputType[];

  // 性能指标
  accuracy: number;                // 0-100 精确率
  recall: number;                  // 0-100 召回率
  avgLatencyMs: number;            // 平均推理延迟(ms)
  maxFps: number;                  // 最大 FPS
  supportedResolution: string[];   // ["1080p", "720p", "D1"]
  tpuMemoryUsage: number;          // TPU 显存占用(MB)

  // 版本
  latestVersion: AlgorithmVersion | null;
  versions: AlgorithmVersion[];

  // 定价
  pricing: AlgorithmPricing;

  // 统计
  downloadCount: number;
  purchaseCount: number;
  ratingAvg: number;               // 0-5
  ratingCount: number;
  commentCount: number;

  // 状态
  status: AlgorithmProductStatus;
  isFeatured: boolean;             // 是否精选推荐
  isFree: boolean;
  developer: AlgorithmDeveloper;

  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 版本与资源
// ============================================================================

/**
 * 算法版本
 */
export interface AlgorithmVersion {
  id: string;
  algorithmId: string;
  version: string;                 // "1.2.0" (semver)
  changelog: string;               // Markdown

  // 模型资源
  resources: AlgorithmResource[];
  totalSizeMb: number;

  // 硬件要求
  minTpuMemory: number;            // MB
  supportedPlatforms: AlgorithmPlatform[];

  status: 'draft' | 'published' | 'deprecated';
  publishedAt: string;
  createdAt: string;
}

/**
 * 支持的硬件平台
 */
export type AlgorithmPlatform =
  | 'BM1684X'
  | 'BM1688'
  | 'CV186AH'
  | 'RK3588'
  | 'x86_GPU';

/**
 * 算法资源文件
 */
export interface AlgorithmResource {
  id: string;
  versionId: string;
  filename: string;                // "yolov8n_int8.bmodel"
  fileType: 'bmodel' | 'onnx' | 'so' | 'wasm' | 'config';
  sizeBytes: number;
  downloadUrl: string;
  checksumSha256: string;
}

// ============================================================================
// 定价方案
// ============================================================================

/**
 * 计价模式
 */
export type PricingModel =
  | 'free'
  | 'one_time'
  | 'subscription'
  | 'pay_per_use'
  | 'tiered';

/**
 * 算法定价方案
 */
export interface AlgorithmPricing {
  model: PricingModel;

  // 一次性购买
  oneTimePrice?: number;

  // 订阅制
  subscriptionPlans?: AlgorithmSubscriptionPlan[];

  // 按量计费
  perUsePrice?: number;            // 每次调用价格
  freeQuota?: number;              // 免费额度

  // 阶梯定价
  tiers?: AlgorithmPricingTier[];

  // 试用
  trialAvailable: boolean;
  trialDuration?: number;          // 试用天数
  trialQuota?: number;             // 试用调用次数

  currency: string;                // "CNY"
}

/**
 * 订阅计划
 */
export interface AlgorithmSubscriptionPlan {
  cycle: 'monthly' | 'quarterly' | 'yearly';
  price: number;
  originalPrice?: number;
  includedQuota: number;           // 包含调用次数（-1=无限）
}

/**
 * 阶梯定价档位
 */
export interface AlgorithmPricingTier {
  from: number;
  to: number | null;               // null = 无上限
  unitPrice: number;
}

// ============================================================================
// 授权许可证
// ============================================================================

/**
 * 许可证状态
 */
export type LicenseStatus =
  | 'trial'
  | 'active'
  | 'expired'
  | 'cancelled';

/**
 * 算法许可证（授权）
 */
export interface AlgorithmLicense {
  id: string;
  userId: string;
  algorithmId: string;
  algorithm: Pick<AlgorithmProduct, 'id' | 'name' | 'icon'>;
  versionId: string;
  version: string;

  pricingModel: PricingModel;
  status: LicenseStatus;

  // 授权范围
  boundBoxId: string | null;       // 绑定的盒子ID
  boundBoxName: string | null;     // 盒子名称（冗余展示）
  boundNodeId: string | null;      // 绑定的边缘节点ID
  maxInstances: number;            // 最大实例数

  // 用量
  usage: AlgorithmUsage;

  // 时间
  startedAt: string;
  expiresAt: string | null;
  autoRenew: boolean;

  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 用量统计
// ============================================================================

/**
 * 算法调用统计
 */
export interface AlgorithmUsage {
  licenseId: string;
  period: string;                  // "2025-01"

  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  avgLatencyMs: number;
  p99LatencyMs: number;

  // 配额
  quotaLimit: number;              // -1 = 无限
  quotaUsed: number;
  quotaRemaining: number;
  quotaResetAt: string | null;

  // 趋势
  dailyUsage: AlgorithmDailyUsage[];
}

/**
 * 日用量明细
 */
export interface AlgorithmDailyUsage {
  date: string;
  calls: number;
  avgLatency: number;
  errors: number;
}

/**
 * 用量总览（仪表盘）
 */
export interface UsageSummaryResponse {
  totalAlgorithms: number;
  totalCalls: number;
  totalCost: number;
  activeLicenses: number;
  expiringLicenses: AlgorithmLicense[];
  topAlgorithms: Array<{
    algorithm: Pick<AlgorithmProduct, 'id' | 'name' | 'icon'>;
    calls: number;
    cost: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    calls: number;
    cost: number;
  }>;
}

// ============================================================================
// 订单
// ============================================================================

/**
 * 订单状态
 */
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'fulfilled'
  | 'refunded'
  | 'cancelled';

/**
 * 算法订单
 */
export interface AlgorithmOrder {
  id: string;
  orderNo: string;
  userId: string;
  algorithmId: string;
  algorithm: Pick<AlgorithmProduct, 'id' | 'name' | 'icon'>;
  versionId: string;

  pricingModel: PricingModel;
  amount: number;
  currency: string;
  status: OrderStatus;

  paymentMethod: string;
  paidAt: string | null;

  createdAt: string;
}

/**
 * 创建订单请求
 */
export interface CreateAlgorithmOrderRequest {
  algorithmId: string;
  versionId: string;
  pricingModel: PricingModel;
  subscriptionCycle?: 'monthly' | 'quarterly' | 'yearly';
  boundBoxId?: string;             // 绑定到哪个盒子
  paymentMethod: string;
  promoCode?: string;
}

// ============================================================================
// 评价
// ============================================================================

/**
 * 算法评价
 */
export interface AlgorithmReview {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  algorithmId: string;
  version: string;

  rating: number;                  // 1-5
  title: string;
  content: string;
  images: string[];

  helpful: number;                 // 有用数
  developerReply: string | null;
  repliedAt: string | null;

  createdAt: string;
}

// ============================================================================
// 查询参数
// ============================================================================

/**
 * 算法列表查询参数
 */
export interface AlgorithmListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;               // category slug
  tags?: string[];                 // tag IDs
  algorithmType?: AlgorithmType;
  framework?: AlgorithmFramework[];
  pricingModel?: PricingModel;
  sortBy?: 'popular' | 'newest' | 'rating' | 'price_asc' | 'price_desc';
  minAccuracy?: number;
  maxLatency?: number;
}

/**
 * 许可证查询参数
 */
export interface LicenseQueryParams {
  status?: LicenseStatus;
  page?: number;
  pageSize?: number;
}

/**
 * 订单查询参数
 */
export interface OrderQueryParams {
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
}
