/**
 * 华盾AI智能视频盒子 v7.0 - 统计分析 API
 * api/statistics.ts — 数据统计、报表、趋势相关接口
 */

import { statsHttp } from './http'
import type { ApiResponse, SecurityScore, AgentStatus } from '@/types/common'
import type { AlarmTrendItem } from '@/types/alarm'

/** 安全评分响应 */
export interface ScoreResponse {
  overall: number
  trend: number
  dimensions: Array<{ label: string; value: number; color: string }>
}

/** 告警趋势响应 */
export interface AlarmTrendResponse {
  trend: AlarmTrendItem[]
  topTypes: Array<{ type: string; count: number }>
}

/** 设备健康响应 */
export interface DeviceHealthResponse {
  items: Array<{
    deviceId: string
    name: string
    uptime: number
    alerts: number
    cpuUsage: number
    memUsage: number
  }>
}

/** Agent 活跃度响应 */
export interface AgentActivityResponse {
  perceptionCalls: number
  analysisCalls: number
  decisionCalls: number
  expertInvokes: number
  avgConfidence: number
  timeline: Array<{ time: string; calls: number }>
}

/** 在线率趋势响应 */
export interface OnlineRateResponse {
  trend: Array<{ date: string; rate: number }>
  average: number
}

/** 资源使用响应 */
export interface ResourceUsageResponse {
  cpu: Array<{ time: string; value: number }>
  memory: Array<{ time: string; value: number }>
  gpu: Array<{ time: string; value: number }>
  disk: Array<{ time: string; value: number }>
}

/** 项目告警响应 */
export interface ProjectAlarmResponse {
  items: Array<{ projectName: string; critical: number; high: number; medium: number; low: number }>
}

/** 算法性能指标 (P14 修复 14.11) */
export interface AlgoPerformanceItem {
  name: string
  algo_id: string
  precision: number
  recall: number
  f1_score: number
  mAP50: number
  avg_inference_ms: number
  fps: number
  sample_count: number
  last_benchmark_time: string
  status: 'active' | 'beta' | 'deprecated'
}

export interface AlgoPerformanceTrendPoint {
  date: string
  avg_latency_ms: number
  avg_fps: number
  run_count: number
}

export interface AlgoPerformanceResponse {
  items: AlgoPerformanceItem[]
  trend: AlgoPerformanceTrendPoint[]
  last_updated: string
  total: number
}

export const statisticsApi = {
  /** 获取安全评分 */
  getSecurityScore(params?: { period?: '7d' | '30d' | '90d'; projectId?: string }) {
    return statsHttp.get<ApiResponse<ScoreResponse>>('/security-score', { params })
  },

  /** 获取告警趋势 */
  getAlarmTrend(params?: { period?: '7d' | '30d' | '90d'; projectId?: string }) {
    return statsHttp.get<ApiResponse<AlarmTrendResponse>>('/alarm-trend', { params })
  },

  /** 获取设备健康数据 */
  getDeviceHealth(params?: { period?: string }) {
    return statsHttp.get<ApiResponse<DeviceHealthResponse>>('/device-health', { params })
  },

  /** 获取Agent活跃度 */
  getAgentActivity(params?: { period?: '7d' | '30d' | '90d' }) {
    return statsHttp.get<ApiResponse<AgentActivityResponse>>('/agent-activity', { params })
  },

  /** 获取设备在线率趋势 */
  getOnlineRateTrend(params?: { period?: '7d' | '30d' | '90d'; projectId?: string }) {
    return statsHttp.get<ApiResponse<OnlineRateResponse>>('/online-rate', { params })
  },

  /** 获取资源使用趋势 */
  getResourceUsage(params?: { period?: string; deviceId?: string }) {
    return statsHttp.get<ApiResponse<ResourceUsageResponse>>('/resource-usage', { params })
  },

  /** 获取项目告警统计 */
  getProjectAlarms(params?: { period?: string }) {
    return statsHttp.get<ApiResponse<ProjectAlarmResponse>>('/project-alarms', { params })
  },

  /** 获取综合仪表盘数据 */
  getDashboardSummary(params?: { projectId?: string }) {
    return statsHttp.get<ApiResponse<{
      deviceStats: { total: number; online: number; offline: number; onlineRate: number }
      alarmStats: { todayTotal: number; todayUnhandled: number; critical: number }
      securityScore: ScoreResponse
      activeAgents: number
      recentAlarms: Array<{ id: string; description: string; level: string; createdAt: string }>
    }>>('/dashboard-summary', { params })
  },

  /** P14 修复 14.11: 获取算法性能统计 (从 IRM algo_perf_logs) */
  getAlgorithmPerformance(params?: { algoId?: string; days?: number }) {
    return statsHttp.get<ApiResponse<AlgoPerformanceResponse>>('/algorithm-performance', { params })
  }
}
