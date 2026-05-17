/**
 * 华盾AI智能视频盒子 v7.0 - 系统设置 API
 * api/settings.ts — 基本设置、云端连接、告警策略、系统信息
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'

/** 基本设置 */
export interface BasicSettings {
  deviceName: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  maxChannels: number
  recordRetentionDays: number
  ntpServer: string
  dataRetentionDays?: number
  autoRestart?: boolean
}

/** 云端连接设置 */
export interface CloudSettings {
  mqttBroker: string
  mqttPort: number
  heartbeatInterval: number
  tlsEnabled: boolean
  maxOfflineEvents: number
  syncMode: 'auto' | 'manual' | 'scheduled'
}

/** 告警策略设置 */
export interface AlarmPolicySettings {
  dedupWindow: number
  minConfidence: number
  criticalMaxLatency: number
  linkageActions: string[]
}

/** 系统信息 */
export interface SystemInfo {
  productName: string
  version: string
  sdkVersion: string
  hermesVersion: string
  hardware: string
  architecture: string
  algorithmPlugins: number
  maxChannels: number
  inferencePrecision: string
}

export const settingsApi = {
  /** 获取基本设置 */
  getBasic() {
    return http.get<ApiResponse<BasicSettings>>('/settings/basic')
  },
  /** 保存基本设置 */
  saveBasic(data: BasicSettings) {
    return http.put<ApiResponse<void>>('/settings/basic', data)
  },
  /** 获取云端连接设置 */
  getCloud() {
    return http.get<ApiResponse<CloudSettings>>('/settings/cloud')
  },
  /** 保存云端连接设置 */
  saveCloud(data: CloudSettings) {
    return http.put<ApiResponse<void>>('/settings/cloud', data)
  },
  /** 测试MQTT连接 */
  testConnection(data: { mqttBroker: string; mqttPort: number; tlsEnabled: boolean }) {
    return http.post<ApiResponse<{ success: boolean; latency: number }>>('/settings/cloud/test', data)
  },
  /** 获取告警策略 */
  getAlarmPolicy() {
    return http.get<ApiResponse<AlarmPolicySettings>>('/settings/alarm-policy')
  },
  /** 保存告警策略 */
  saveAlarmPolicy(data: AlarmPolicySettings) {
    return http.put<ApiResponse<void>>('/settings/alarm-policy', data)
  },
  /** 获取系统信息 */
  getSystemInfo() {
    return http.get<ApiResponse<SystemInfo>>('/settings/system-info')
  },
}
