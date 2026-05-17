/** 审计日志类型 */
export type AuditAction = 'login' | 'logout' | 'create' | 'update' | 'delete' | 'export' | 'import' | 'config' | 'other'
export type AuditResult = 'success' | 'failure'

/** 审计日志 */
export interface AuditLogItem {
  id: string; timestamp: string; username: string; userId?: string; action: AuditAction
  resource: string; resourceId: string; details: string; result: AuditResult
  ip: string; userAgent?: string
}
/** 兼容别名 */ export type AuditLog = AuditLogItem

/** 审计统计 */
export interface AuditStats {
  total: number; todayTotal: number; todayOps?: number; totalOps?: number; successRate: number; failureRate?: number
  topActions: Array<{ action: string; count: number }>
  topUsers: Array<{ username: string; count: number }>
  actionTrend: Array<{ date: string; count: number }>
  hourlyDistribution?: Array<{ hour: number; count: number }>
}

/** 云服务状态 */
export interface CloudServiceStatus {
  connected: boolean; lastSyncAt: string; syncInterval: number
  services: Array<{ name: string; status: 'active' | 'inactive' | 'error'; message?: string }>
}

/** 安全态势评分 */
export interface SecurityScore {
  overall: number; trend: number
  dimensions: Array<{ label: string; value: number; color: string }>
}

/** AI Agent 活跃度 */
export interface AgentActivity {
  perceptionCalls: number; analysisCalls: number; decisionCalls: number
  expertInvokes: number; avgConfidence: number
  trendData: Array<{ date: string; calls: number }>
}

/** 设备分析数据 */
export interface DeviceAnalytics {
  onlineRateTrend: Array<{ date: string; rate: number }>
  resourceUsage: { cpu: number; mem: number; gpu: number; disk: number }
  resourceUsageTrend: Array<{ date: string; cpu: number; mem: number; gpu: number; disk: number }>
}

/** 告警统计 (用于 StatisticsView) */
export interface AlarmStats {
  total: number; critical: number; high: number; medium: number; low: number
  unhandled: number; confirmed: number; falseAlarm: number
  todayTotal: number; todayUnhandled: number
  trendData: Array<{ date: string; critical: number; high: number; medium: number; low: number }>
  distribution: Array<{ name: string; value: number }>
}

/** 联邦学习仪表盘数据 */
export interface FederationDashboardData {
  status: 'idle' | 'running' | 'completed' | 'error'
  currentRound: number; totalRounds: number; accuracy: number
  participatingBoxes: number; totalBoxes: number
  accuracyHistory: Array<{ round: number; accuracy: number }>
  boxContributions: Array<{ boxId: string; name: string; contribution: number }>
  lastUpdatedAt: string
}

/** 开放平台统计 */
export interface OpenPlatformStats {
  totalApiKeys: number; activeApiKeys: number; totalWebhooks: number
  totalApiCalls: number; apiCallsToday: number; avgLatency: number; errorRate: number
  topEndpoints: Array<{ path: string; calls: number }>
  callsTrend: Array<{ date: string; calls: number; errors: number }>
}

/** OTA 升级统计 */
export interface OTAStats {
  totalDevices: number; upToDate: number; pendingUpdate: number; updating: number; failed: number
  firmwareVersions: Array<{ version: string; count: number }>
}
