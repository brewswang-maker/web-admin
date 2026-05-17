/**
 * 华盾AI智能视频盒子 v7.0 - 联动规则 API
 * api/linkage.ts — 事件联动规则 CRUD + 日志查询
 */

import { http } from './http'
import type { ApiResponse, PageResponse, PageQuery } from '@/types/common'

// ── 类型定义 ──

/** 联动规则 */
export interface LinkageRule {
  id: string
  name: string
  enabled: boolean
  priority: number
  cooldownMs: number
  /** 触发条件 */
  conditions: LinkageCondition[]
  /** 联动动作 */
  actions: LinkageAction[]
  createdAt: string
  updatedAt: string
}

/** 条件类型 */
export type ConditionType = 'time' | 'region' | 'location' | 'eventType' | 'eventSource' | 'autoMerge'

/** 触发条件 */
export interface LinkageCondition {
  type: ConditionType
  enabled: boolean
  config: Record<string, any>
}

/** 联动动作 */
export interface LinkageAction {
  actionType: string
  enabled: boolean
  params: Record<string, any>
}

/** 联动规则查询参数 */
export interface LinkageRuleQuery extends PageQuery {
  enabled?: boolean
  sortBy?: 'priority' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

/** 联动日志 */
export interface LinkageLog {
  id: string
  ruleId: string
  ruleName: string
  triggeredAt: string
  eventType: string
  channelId: string
  channelName: string
  actionsExecuted: string[]
  result: 'success' | 'partial' | 'failed'
  duration: number
}

/** 联动日志查询参数 */
export interface LinkageLogQuery extends PageQuery {
  ruleId?: string
  result?: string
  startTime?: string
  endTime?: string
}

// ── API ──

export const linkageApi = {
  /** 获取联动规则列表 */
  getRules(params?: LinkageRuleQuery) {
    return http.get<ApiResponse<PageResponse<LinkageRule>>>('/linkage/rules', { params })
  },

  /** 获取联动规则详情 */
  getRule(id: string) {
    return http.get<ApiResponse<LinkageRule>>(`/linkage/rules/${id}`)
  },

  /** 创建联动规则 */
  createRule(data: Omit<LinkageRule, 'id' | 'createdAt' | 'updatedAt'>) {
    return http.post<ApiResponse<LinkageRule>>('/linkage/rules', data)
  },

  /** 更新联动规则 */
  updateRule(id: string, data: Partial<LinkageRule>) {
    return http.put<ApiResponse<LinkageRule>>(`/linkage/rules/${id}`, data)
  },

  /** 删除联动规则 */
  deleteRule(id: string) {
    return http.delete<ApiResponse<void>>(`/linkage/rules/${id}`)
  },

  /** 批量启用/停用规则 */
  batchToggle(ids: string[], enabled: boolean) {
    return http.post<ApiResponse<{ updated: number }>>('/linkage/rules/batch-toggle', { ids, enabled })
  },

  /** 获取联动日志 */
  getLogs(params?: LinkageLogQuery) {
    return http.get<ApiResponse<PageResponse<LinkageLog>>>('/linkage/logs', { params })
  },

  /** 获取联动统计 */
  getStats() {
    return http.get<ApiResponse<{
      totalRules: number
      enabledRules: number
      todayTriggers: number
      topTriggeredRules: Array<{ ruleId: string; ruleName: string; count: number }>
    }>>('/linkage/stats')
  },
}
