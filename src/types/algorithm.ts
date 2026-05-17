/**
 * 算法商城类型定义
 */

export type AlgorithmStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED' | 'OFFLINE'
export type AlgorithmPricingModel = 'FREE' | 'ONE_TIME' | 'SUBSCRIPTION' | 'PAY_PER_USE'
export type AlgorithmOrderStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED'

export interface AlgorithmCategory {
  id: string
  name: string
  icon: string
  description: string
  sortWeight: number
  algorithmCount: number
}

export interface AlgorithmProduct {
  id: string
  name: string
  description: string
  detail: string
  coverImage: string
  previewImages: string[]
  categoryId: string
  categoryName: string
  version: string
  vendor: string
  status: AlgorithmStatus
  pricingModel: AlgorithmPricingModel
  price: number
  originalPrice: number
  currency: string
  pricePerCall: number
  subscriptionPeriodDays: number
  tags: string[]
  supportedPlatforms: string[]
  minFirmwareVersion: string
  accuracyMetrics: Record<string, number>
  avgLatencyMs: number
  downloadCount: number
  rating: number
  ratingCount: number
  purchased: boolean
  publishedAt: number
}

export interface AlgorithmOrder {
  id: string
  algorithmId: string
  algorithmName: string
  pricingModel: AlgorithmPricingModel
  amount: number
  currency: string
  status: AlgorithmOrderStatus
  createdAt: number
  paidAt: number | null
}
