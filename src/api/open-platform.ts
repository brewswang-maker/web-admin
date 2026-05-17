/**
 * 华盾AI智能视频盒子 v7.0 - 开放平台 API
 * api/open-platform.ts — API Key、Webhook、第三方集成相关接口
 */

import { platformHttp } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'

/** API Key */
export interface APIKeyItem {
  id: string
  name: string
  key: string
  permissions: string[]
  rateLimit: number
  status: 'active' | 'revoked'
  lastUsedAt: string
  createdAt: string
  expiresAt?: string
}

/** 创建 API Key 请求 */
export interface CreateAPIKeyRequest {
  name: string
  permissions: string[]
  rateLimit: number
  expiresAt?: string
}

/** Webhook */
export interface WebhookItem {
  id: string
  name: string
  url: string
  secret: string
  events: string[]
  status: 'active' | 'disabled'
  lastDeliveryAt: string
  lastDeliveryStatus: 'success' | 'failure' | 'pending'
  failureCount: number
  successCount: number
  createdAt: string
}

/** 创建 Webhook 请求 */
export interface CreateWebhookRequest {
  name: string
  url: string
  events: string[]
  secret?: string
}

/** Webhook 投递记录 */
export interface WebhookDelivery {
  id: string
  webhookId: string
  event: string
  payload: Record<string, unknown>
  statusCode: number
  response: string
  duration: number
  success: boolean
  createdAt: string
}

/** API 端点文档 */
export interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  description: string
  auth: boolean
  category: string
}

export const openPlatformApi = {
  // ===== API Key 管理 =====

  /** 获取 API Key 列表 */
  getAPIKeys(params?: { status?: string; page?: number; pageSize?: number }) {
    return platformHttp.get<ApiResponse<PageResponse<APIKeyItem>>>('/keys', { params })
  },

  /** 创建 API Key */
  createAPIKey(data: CreateAPIKeyRequest) {
    return platformHttp.post<ApiResponse<APIKeyItem>>('/keys', data)
  },

  /** 吊销 API Key */
  revokeAPIKey(id: string) {
    return platformHttp.post<ApiResponse<void>>(`/keys/${id}/revoke`)
  },

  /** 删除 API Key */
  deleteAPIKey(id: string) {
    return platformHttp.delete<ApiResponse<void>>(`/keys/${id}`)
  },

  /** 获取 Key 使用统计 */
  getKeyUsage(id: string, params?: { period?: '1h' | '24h' | '7d' | '30d' }) {
    return platformHttp.get<ApiResponse<{
      totalCalls: number
      successRate: number
      avgLatency: number
      callsByDay: Array<{ date: string; count: number }>
    }>>(`/keys/${id}/usage`, { params })
  },

  // ===== Webhook 管理 =====

  /** 获取 Webhook 列表 */
  getWebhooks(params?: { status?: string; page?: number; pageSize?: number }) {
    return platformHttp.get<ApiResponse<PageResponse<WebhookItem>>>('/webhooks', { params })
  },

  /** 创建 Webhook */
  createWebhook(data: CreateWebhookRequest) {
    return platformHttp.post<ApiResponse<WebhookItem>>('/webhooks', data)
  },

  /** 更新 Webhook */
  updateWebhook(id: string, data: Partial<CreateWebhookRequest & { status?: 'active' | 'disabled' }>) {
    return platformHttp.put<ApiResponse<WebhookItem>>(`/webhooks/${id}`, data)
  },

  /** 删除 Webhook */
  deleteWebhook(id: string) {
    return platformHttp.delete<ApiResponse<void>>(`/webhooks/${id}`)
  },

  /** 测试 Webhook */
  testWebhook(id: string) {
    return platformHttp.post<ApiResponse<{ success: boolean; statusCode: number; latency: number }>>(`/webhooks/${id}/test`)
  },

  /** 获取 Webhook 投递记录 */
  getWebhookDeliveries(webhookId: string, params?: { page?: number; pageSize?: number }) {
    return platformHttp.get<ApiResponse<PageResponse<WebhookDelivery>>>(`/webhooks/${webhookId}/deliveries`, { params })
  },

  /** 重试投递 */
  retryDelivery(webhookId: string, deliveryId: string) {
    return platformHttp.post<ApiResponse<void>>(`/webhooks/${webhookId}/deliveries/${deliveryId}/retry`)
  },

  // ===== API 文档 =====

  /** 获取 API 端点列表 */
  getAPIDoc() {
    return platformHttp.get<ApiResponse<APIEndpoint[]>>('/docs/endpoints')
  },

  /** 获取订阅事件类型列表 */
  getEventTypes() {
    return platformHttp.get<ApiResponse<Array<{ value: string; label: string; description: string }>>>('/event-types')
  },

  /** 获取权限列表 */
  getPermissions() {
    return platformHttp.get<ApiResponse<Array<{ value: string; label: string; description: string }>>>('/permissions')
  }
}
