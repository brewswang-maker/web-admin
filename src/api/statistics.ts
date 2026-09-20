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

/** [P1-1 2026-08-28] 误报基线分桶 (channel/type/day/camera×day) */
export interface FalseAlarmBucket {
  key: string
  total: number
  false_alarms: number
  false_alarm_rate: number
}

/** [P1-1] 误报基线响应 (含每相机日误报运营指标, 竞品报告 v2.1 §9.3) */
export interface FalseAlarmBaselineResponse {
  days: number
  total_alarms: number
  total_false_alarms: number
  overall_rate: number
  false_alarms_per_camera_day: number
  per_camera_day: FalseAlarmBucket[]
  by_channel: FalseAlarmBucket[]
  by_type: FalseAlarmBucket[]
  by_day: FalseAlarmBucket[]
}

/** [P1-1 2026-09-20] 去重比口径 (当日窗口 / 累计; 分子 duplicated 来自 AlarmService 去重,
 *  分母 produced 为全量产生口径 — 含被闸门压制帧, 在去重之前埋点) */
export interface AlarmDupRatio {
  duplicated: number
  produced: number
  dup_ratio: number
}

/** [P1-1 2026-09-20] 告警漏斗五环节计数器快照 (GET /api/v1/stats/alarm-funnel,
 *  服务端 AlarmFunnelCounters; 漂移检测/排障口径, 与列表统计独立) */
export interface AlarmFunnelResponse {
  /** ① 产生: AlarmDispatcher 三入口埋点 (去重之前) */
  alarm_produced_total: {
    total: number
    origin: { algo: number; device_native: number; injected: number }
  }
  /** ② 闸门: 通过/压制 (订阅闸门+去重等, suppressed_by 为压制原因分布) */
  alarm_gated_total: {
    result: { pass: number; suppressed: number }
    suppressed_by: Record<string, number>
  }
  /** ③ 规则匹配: 命中/未命中 + 未命中类型 TopN (有告警无规则缺口) */
  alarm_verdict_total: {
    result: { matched: number; unmatched: number }
    unmatched_top_types: Array<{ type: string; count: number }>
  }
  /** ④ 推送: WS 推送成功/丢弃 (drop_by 为丢弃原因分布) */
  alarm_pushed_total: {
    result: { pushed: number; drop: number }
    drop_by: Record<string, number>
  }
  /** ⑤ 弹窗: 前端打点 (shown/debounced/offline_fallback) */
  alarm_popup_total: {
    total: number
    result: { shown: number; debounced: number; offline_fallback: number }
  }
  /** 双写期前后端判定分歧 (P0 验收「7 天零分歧」数据源) */
  verdict_frontend_diff_total: {
    kind: { frontend_only: number; backend_only: number }
  }
  /** 去重比: 当日窗口 (每日对账) + 累计口径 (与 g1~g7 闸门计数交叉对账) */
  alarm_dup_total: { today: AlarmDupRatio; total: AlarmDupRatio }
}

export const statisticsApi = {
  /** [P1-1] 误报基线 (含每相机日误报 false_alarms_per_camera_day) */
  getFalseAlarmBaseline(params?: { days?: number; include_feedback?: boolean }) {
    return statsHttp.get<ApiResponse<FalseAlarmBaselineResponse>>('/false_alarm_baseline', { params })
  },

  /** [P1-1 2026-09-20] 告警漏斗五环节快照 (低频排障端点, 展开告警页漏斗卡片时懒加载) */
  getAlarmFunnel() {
    return statsHttp.get<ApiResponse<AlarmFunnelResponse>>('/alarm-funnel')
  },

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
