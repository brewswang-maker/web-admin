/**
 * 账单 & 计费 API
 *
 * Phase 13 P0 #12: 后端实际路由是:
 *   /api/v1/billing/plans
 *   /api/v1/billing/subscription
 *   /api/v1/billing/usage
 *   /api/v1/billing/invoices
 *   /api/v1/billing/invoices/:id
 *   /api/v1/billing/invoices/export
 * 原 FE 调 /billing/{summary,list,:id,export} 全部 404,这里对齐到后端真实路径。
 */
import { http } from './http'
import type { BillingRecord, BillingSummary, BillingListParams } from '@/types/billing'

export function fetchBillingSummary() {
  return http.get<{ data: BillingSummary }>('/billing/subscription')
}

export function fetchBillingList(params?: BillingListParams) {
  return http.get<{ data: { items: BillingRecord[]; total: number } }>('/billing/invoices', { params })
}

export function fetchBillingDetail(id: string) {
  return http.get<{ data: BillingRecord }>(`/billing/invoices/${id}`)
}

export function exportBilling(params?: { period?: string; format?: 'csv' | 'pdf' }) {
  return http.get('/billing/invoices/export', { params, responseType: 'blob' })
}
