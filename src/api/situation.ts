/**
 * 华盾AI智能视频盒子 v7.0 - 态势大屏 API
 * api/situation.ts — 3D态势大屏、地图数据、实时状态相关接口
 */

import { situationHttp } from './http'
import type { ApiResponse, SystemHealth, AgentStatus } from '@/types/common'
import type { AlarmEvent } from '@/types/alarm'
import type { DeviceStats } from '@/types/device'

/** 态势总览数据 */
export interface SituationOverview {
  deviceStats: DeviceStats & { onlineRate: number }
  alarmStats: { total: number; critical: number; high: number; medium: number; low: number; todayTotal: number }
  securityScore: { overall: number; trend: number }
  systemHealth: SystemHealth
  activeAgents: number
  totalAgents: number
  handleRate?: number  // [v8.3 fix] 真实处置率 (0~100)
}

/** 地图设备点位 */
export interface MapDevicePoint {
  id: string
  name: string
  lat: number
  lng: number
  status: 'online' | 'offline' | 'alarming'
  deviceType: string
  alarmCount: number
  projectName: string
  lastAlarmType?: string
}

/** 区域聚合数据 */
export interface MapCluster {
  lat: number
  lng: number
  count: number
  onlineCount: number
  alarmingCount: number
  projectName: string
}

/** 实时告警流 */
export interface SituationAlarmStream {
  id: string
  level: string
  description: string
  deviceName: string
  time: string
  snapshotUrl?: string
}

/** Agent实时状态 */
export interface SituationAgentStatus {
  name: string
  type: 'perception' | 'analysis' | 'decision' | 'expert'
  status: 'active' | 'idle' | 'error'
  calls: number
  avgLatency: number
  lastActiveAt: string
}

export const situationApi = {
  /** 获取态势总览 */
  getOverview(params?: { projectId?: string }) {
    return situationHttp.get<ApiResponse<SituationOverview>>('/overview', { params })
  },

  /** 获取地图设备点位 */
  getMapDevices(params?: { projectId?: string; status?: string }) {
    return situationHttp.get<ApiResponse<MapDevicePoint[]>>('/map/devices', { params })
  },

  /** 获取地图区域聚合 */
  getMapClusters(params?: { zoom: number; bounds: { north: number; south: number; east: number; west: number } }) {
    return situationHttp.get<ApiResponse<MapCluster[]>>('/map/clusters', { params })
  },

  /** 获取实时告警流（最近N条） */
  getRealtimeAlarms(params?: { limit?: number; projectId?: string }) {
    return situationHttp.get<ApiResponse<SituationAlarmStream[]>>('/realtime-alarms', { params })
  },

  /** 获取Agent实时状态 */
  getAgentStatuses() {
    return situationHttp.get<ApiResponse<SituationAgentStatus[]>>('/agents')
  },

  /** 获取系统健康指标 */
  getSystemHealth() {
    return situationHttp.get<ApiResponse<SystemHealth>>('/system-health')
  },

  /** 获取项目区域分布（用于地图渲染） */
  getProjectAreas() {
    return situationHttp.get<ApiResponse<Array<{
      id: string
      name: string
      bounds: { north: number; south: number; east: number; west: number }
      deviceCount: number
      alarmCount: number
    }>>>('/project-areas')
  },

  /** 获取告警热力图数据 */
  getAlarmHeatmap(params?: { period?: '1h' | '6h' | '24h' | '7d'; projectId?: string }) {
    return situationHttp.get<ApiResponse<Array<{ lat: number; lng: number; weight: number }>>>('/alarm-heatmap', { params })
  },

  /** 获取时段统计（24小时分布） */
  getHourlyStats() {
    return situationHttp.get<ApiResponse<Array<{ hour: number; alarmCount: number; onlineDevices: number }>>>('/hourly-stats')
  }
}
