/**
 * 账单 & 计费 API
 */
import { http } from './http'
import type { BillingRecord, BillingSummary, BillingListParams } from '@/types/billing'

export function fetchBillingSummary() {
  return http.get<{ data: BillingSummary }>('/billing/summary')
}

export function fetchBillingList(params?: BillingListParams) {
  return http.get<{ data: { list: BillingRecord[]; total: number } }>('/billing/list', { params })
}

export function fetchBillingDetail(id: string) {
  return http.get<{ data: BillingRecord }>(`/billing/${id}`)
}

export function exportBilling(params?: { period?: string; format?: 'csv' | 'pdf' }) {
  return http.get('/billing/export', { params, responseType: 'blob' })
}
