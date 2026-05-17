/**
 * 账单 & 计费类型定义
 */

export interface BillingRecord {
  id: string
  period: string
  deviceId: string
  deviceName: string
  planName: string
  baseFee: number
  usageFee: number
  totalFee: number
  status: 'paid' | 'pending' | 'overdue'
  createdAt: number
}

export interface BillingSummary {
  totalSpent: number
  currentMonth: number
  lastMonth: number
  pendingAmount: number
  monthlyTrend: { month: string; amount: number }[]
}

export interface BillingListParams {
  page?: number
  pageSize?: number
  period?: string
  status?: BillingRecord['status']
  deviceId?: string
}
