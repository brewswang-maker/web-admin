/**
 * 华盾AI智能视频盒子 v7.0 - 告警相关类型定义
 * types/alarm.ts — 告警事件、统计、处理相关类型
 */

/** 告警级别 */
export type AlarmLevel = 'critical' | 'high' | 'medium' | 'low'
/** 告警类型 */
export type AlarmType = 'intrusion' | 'fire' | 'loitering' | 'helmet' | 'violence' | 'fall' | 'gathering' | 'illegal_parking' | 'wrong_way' | 'other'
/** 告警状态 */
export type AlarmStatus = 'unhandled' | 'confirmed' | 'false_alarm' | 'forwarded' | 'auto_resolved'

/** 告警事件 */
export interface AlarmEvent {
  id: string
  type: AlarmType
  level: AlarmLevel
  description: string
  channelId: string
  channelName?: string
  deviceId: string
  deviceName?: string
  snapshotUrl?: string
  videoClipUrl?: string
  aiConclusion?: string
  confidence: number
  status: AlarmStatus
  location?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  handledBy?: string
  handledAt?: string
  handleNote?: string
}

/** 告警统计 */
export interface AlarmStats {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  unhandled: number
  confirmed: number
  falseAlarm: number
  todayTotal: number
  todayUnhandled: number
}

/** 告警处理表单 */
export interface AlarmHandleForm {
  status: 'confirmed' | 'false_alarm' | 'forwarded' | 'ignored'
  note?: string
  forwardTo?: string
}

/** 告警查询参数 */
export interface AlarmQuery {
  page?: number
  pageSize?: number
  keyword?: string
  level?: AlarmLevel
  type?: AlarmType
  status?: AlarmStatus
  deviceId?: string
  channelId?: string
  startTime?: string
  endTime?: string
  dateRange?: [string, string]
}

/** 告警趋势数据 */
export interface AlarmTrendItem {
  date: string
  critical: number
  high: number
  medium: number
  low: number
}

/** 告警类型分布 */
export interface AlarmTypeDistribution {
  type: string
  label: string
  count: number
  percentage: number
}
