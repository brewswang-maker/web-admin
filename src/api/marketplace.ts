/**
 * 华盾AI智能视频盒子 v7.0 - 算法商城 API
 * api/marketplace.ts — 商品浏览、购买、许可证管理、用量统计
 *
 * 复用已有 api/http.ts 的 axios 实例、认证机制、错误处理
 * 响应格式对齐 ApiResponse<T> / PageResponse<T>
 */

import { http } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'
import type {
  AlgorithmProduct,
  AlgorithmListQuery,
  AlgorithmVersion,
  AlgorithmReview,
  AlgorithmCategory,
  AlgorithmTag,
  AlgorithmOrder,
  CreateAlgorithmOrderRequest,
  AlgorithmLicense,
  LicenseQueryParams,
  AlgorithmUsage,
  UsageSummaryResponse,
  OrderQueryParams,
} from '@/types/marketplace'

// ============================================================================
// 算法商品
// ============================================================================

const marketplaceApi = {
  // ── 商品浏览 ──────────────────────────────────────────────

  /** 算法商品列表（分页、筛选、排序） */
  listAlgorithms(params?: AlgorithmListQuery) {
    return http.get<ApiResponse<PageResponse<AlgorithmProduct>>>('/marketplace/algorithms', { params })
  },

  /** 算法详情 */
  getAlgorithm(id: string) {
    return http.get<ApiResponse<AlgorithmProduct>>(`/marketplace/algorithms/${id}`)
  },

  /** 精选推荐列表 */
  getFeatured() {
    return http.get<ApiResponse<AlgorithmProduct[]>>('/marketplace/algorithms/featured')
  },

  /** 关键词搜索 */
  searchAlgorithms(params: { keyword: string; page?: number; pageSize?: number }) {
    return http.get<ApiResponse<PageResponse<AlgorithmProduct>>>('/marketplace/algorithms/search', { params })
  },

  /** 版本列表 */
  getVersions(algorithmId: string) {
    return http.get<ApiResponse<AlgorithmVersion[]>>(`/marketplace/algorithms/${algorithmId}/versions`)
  },

  // ── 评价 ──────────────────────────────────────────────────

  /** 评价列表 */
  getReviews(algorithmId: string, params?: { page?: number; pageSize?: number; sortBy?: string }) {
    return http.get<ApiResponse<PageResponse<AlgorithmReview>>>(`/marketplace/algorithms/${algorithmId}/reviews`, { params })
  },

  /** 提交评价 */
  createReview(algorithmId: string, data: { rating: number; title: string; content: string; images?: string[] }) {
    return http.post<ApiResponse<AlgorithmReview>>(`/marketplace/algorithms/${algorithmId}/reviews`, data)
  },

  /** 标记评价有用 */
  markReviewHelpful(reviewId: string) {
    return http.post<ApiResponse<void>>(`/marketplace/reviews/${reviewId}/helpful`)
  },

  // ── 分类与标签 ────────────────────────────────────────────

  /** 获取分类树 */
  getCategories() {
    return http.get<ApiResponse<AlgorithmCategory[]>>('/marketplace/categories')
  },

  /** 获取热门标签 */
  getTags() {
    return http.get<ApiResponse<AlgorithmTag[]>>('/marketplace/tags')
  },

  // ── 购买/试用 ────────────────────────────────────────────

  /** 创建订单 */
  createOrder(data: CreateAlgorithmOrderRequest) {
    return http.post<ApiResponse<AlgorithmOrder>>('/marketplace/orders', data)
  },

  /** 我的订单列表 */
  getOrders(params?: OrderQueryParams) {
    return http.get<ApiResponse<PageResponse<AlgorithmOrder>>>('/marketplace/orders', { params })
  },

  /** 订单详情 */
  getOrder(id: string) {
    return http.get<ApiResponse<AlgorithmOrder>>(`/marketplace/orders/${id}`)
  },

  /** 发起支付 */
  payOrder(id: string, data: { paymentMethod: string }) {
    return http.post<ApiResponse<{ payUrl: string; qrCode: string }>>(`/marketplace/orders/${id}/pay`, data)
  },

  /** 取消订单 */
  cancelOrder(id: string) {
    return http.post<ApiResponse<void>>(`/marketplace/orders/${id}/cancel`)
  },

  /** 申请试用 */
  requestTrial(algorithmId: string, data: { boundBoxId?: string }) {
    return http.post<ApiResponse<AlgorithmLicense>>(`/marketplace/algorithms/${algorithmId}/trial`, data)
  },

  // ── 许可证管理 ────────────────────────────────────────────

  /** 我的已购算法列表 */
  getLicenses(params?: LicenseQueryParams) {
    return http.get<ApiResponse<PageResponse<AlgorithmLicense>>>('/marketplace/licenses', { params })
  },

  /** 许可证详情 */
  getLicense(id: string) {
    return http.get<ApiResponse<AlgorithmLicense>>(`/marketplace/licenses/${id}`)
  },

  /** 激活到指定盒子 */
  activateLicense(id: string, data: { boxId: string }) {
    return http.post<ApiResponse<void>>(`/marketplace/licenses/${id}/activate`, data)
  },

  /** 停用 */
  deactivateLicense(id: string) {
    return http.post<ApiResponse<void>>(`/marketplace/licenses/${id}/deactivate`)
  },

  /** 续费 */
  renewLicense(id: string, data: { paymentMethod: string }) {
    return http.post<ApiResponse<AlgorithmOrder>>(`/marketplace/licenses/${id}/renew`, data)
  },

  /** 升级版本 */
  upgradeLicense(id: string, data: { targetVersionId: string }) {
    return http.post<ApiResponse<AlgorithmLicense>>(`/marketplace/licenses/${id}/upgrade`, data)
  },

  /** 取消订阅 */
  cancelLicense(id: string, data?: { reason?: string }) {
    return http.post<ApiResponse<void>>(`/marketplace/licenses/${id}/cancel`, data)
  },

  // ── 用量统计 ──────────────────────────────────────────────

  /** 总体用量概览 */
  getUsageSummary() {
    return http.get<ApiResponse<UsageSummaryResponse>>('/marketplace/usage/summary')
  },

  /** 单个许可证用量 */
  getLicenseUsage(licenseId: string, params?: { period?: string }) {
    return http.get<ApiResponse<AlgorithmUsage>>(`/marketplace/usage/licenses/${licenseId}`, { params })
  },

  /** 日用量明细 */
  getLicenseDailyUsage(licenseId: string, params?: { startDate?: string; endDate?: string }) {
    return http.get<ApiResponse<AlgorithmUsage['dailyUsage']>>(`/marketplace/usage/licenses/${licenseId}/daily`, { params })
  },

  /** 导出统计报表(CSV) */
  exportUsageReport(licenseId: string, params?: { period?: string }) {
    return http.get(`/marketplace/usage/licenses/${licenseId}/export`, {
      params,
      responseType: 'blob',
    })
  },

  // ── 开发者接口 ────────────────────────────────────────────

  /** 提交算法（开发者） */
  submitAlgorithm(data: FormData) {
    return http.post<ApiResponse<AlgorithmProduct>>('/marketplace/developer/algorithms', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** 更新算法信息 */
  updateAlgorithm(id: string, data: Partial<AlgorithmProduct>) {
    return http.put<ApiResponse<AlgorithmProduct>>(`/marketplace/developer/algorithms/${id}`, data)
  },

  /** 发布新版本 */
  publishVersion(algorithmId: string, data: FormData) {
    return http.post<ApiResponse<AlgorithmVersion>>(`/marketplace/developer/algorithms/${algorithmId}/versions`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** 开发者统计 */
  getDeveloperStats(algorithmId: string) {
    return http.get<ApiResponse<{
      downloads: number;
      purchases: number;
      revenue: number;
      dailyDownloads: Array<{ date: string; count: number }>;
    }>>(`/marketplace/developer/algorithms/${algorithmId}/stats`)
  },
}

export default marketplaceApi
