/**
 * 华盾AI智能视频盒子 v7.0 - 设备相关类型定义
 * types/device.ts — 设备、通道、同步相关类型
 */

/** 设备状态 */
export type DeviceStatus = 'online' | 'offline' | 'maintaining' | 'alarming'
/** 设备类型 */
export type DeviceType = 'IPCamera' | 'NVR' | 'DVR' | 'EdgeBox'
/** 同步状态 */
export type SyncStatus = 'synced' | 'syncing' | 'outdated' | 'failed' | 'never'
/** 接入协议 */
export type Protocol = 'onvif' | 'gb28181' | 'rtsp' | 'sdk' | 'GB28181' | 'ONVIF' | 'RTSP' | 'EHOME' | 'DAHUA' | 'dahua' | 'ehome'

/** 设备项 */
export interface DeviceItem {
  id: string
  name: string
  sn: string
  deviceType: DeviceType
  status: DeviceStatus
  ip: string
  rtspPort: number
  channelCount: number
  algoPlugin: string
  algoPlugins: string[]  // 支持多算法配置
  syncStatus: SyncStatus
  projectName: string
  projectId: string
  location: string
  firmwareVer: string
  hardwareModel: string
  lastSyncAt: string
  lastHeartbeat: string
  uptime: string
  protocol: Protocol
  /** 实时指标 */
  cpuUsage: number
  memUsage: number
  gpuUsage: number
  diskUsage: number
  temperature: number
  aiInferenceCount: number
  metadata: Record<string, unknown>
}

/** 设备统计 */
export interface DeviceStats {
  total: number
  online: number
  offline: number
  maintaining: number
  onlineRate: number
  alarming: number
  maintenance: number
}

/** 设备创建/编辑表单 */
export interface DeviceForm {
  name: string
  deviceType: DeviceType
  ip: string
  rtspPort: number
  protocol: Protocol
  username?: string
  password?: string
  projectId?: string
  location?: string
  description?: string
  algoPlugin?: string
}

/** 设备发现结果 */
export interface DiscoveredDevice {
  ip: string
  port: number
  deviceType: DeviceType
  manufacturer: string
  model: string
  serialNumber: string
  id?: string
  name?: string
  vendor?: string
  protocol: Protocol
  discoveredAt: string
}

/** 通道项 */
export interface ChannelItem {
  id: string
  deviceId: string
  channelNo: number
  name: string
  status: 'active' | 'inactive' | 'error'
  resolution: string
  codec: string
  fps: number
  bitrate: number
  latency: number
  packetLoss: number
  rtspUrl: string
  streamUrl: string
  isRecording: boolean
  algoPlugin: string
  snapshotUrl?: string
  metadata: Record<string, unknown>
}

/** 设备配置 */
export interface DeviceConfig {
  deviceName: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  maxChannels: number
  recordRetentionDays: number
  ntpServer: string
  mqttBroker: string
  mqttPort: number
  heartbeatInterval: number
  tlsEnabled: boolean
  maxOfflineEvents: number
  syncMode: 'auto' | 'manual' | 'scheduled'
  alarmDedupWindow: number
  minConfidence: number
  criticalMaxLatency: number
  linkageActions: string[]
}

/** 设备查询参数 */
export interface DeviceQuery {
  page?: number
  pageSize?: number
  keyword?: string
  status?: DeviceStatus
  deviceType?: DeviceType
  projectId?: string
}

/** 设备详情（含通道和配置） */
export interface DeviceDetail extends DeviceItem {
  channels: ChannelItem[]
  config: DeviceConfig
  latestMetrics: DeviceMetrics
  syncRecords: DeviceSyncRecord[]
}

/** 设备配置 */
export interface DeviceConfig {
  id: string
  deviceId: string
  videoCodec: string
  resolution: string
  fps: number
  bitrate: number
  algorithmPlugins: string[]
  snapshotInterval: number
  recordingEnabled: boolean
  recordingMode: 'continuous' | 'event' | 'schedule'
  updatedAt: string
}

/** 设备实时指标 */
export interface DeviceMetrics {
  timestamp: string
  cpuUsage: number
  memUsage: number
  gpuUsage: number
  diskUsage: number
  temperature: number
  networkIn: number
  networkOut: number
  aiInferenceCount: number
  aiInferenceLatency: number
}

/** 设备同步记录 */
export interface DeviceSyncRecord {
  id: string
  deviceId: string
  type: 'full' | 'incremental' | 'config'
  status: 'success' | 'failed' | 'in_progress'
  startTime: string
  endTime?: string
  details?: string
}

/** 通道别名 */
export type Channel = ChannelItem

/** 协议选项 */
export const PROTOCOL_OPTIONS: Array<{ label: string; value: Protocol; defaultPort?: number; description?: string }> = [
  { label: 'ONVIF', value: 'onvif', defaultPort: 80, description: 'ONVIF标准协议' },
  { label: 'GB28181', value: 'gb28181', defaultPort: 5060, description: '国标GB/T 28181协议' },
  { label: 'RTSP', value: 'rtsp', defaultPort: 554, description: 'RTSP流媒体协议' },
  { label: 'SDK', value: 'sdk', defaultPort: 8000, description: '设备厂商SDK' },
  { label: 'EHOME', value: 'ehome', defaultPort: 7660, description: '海康EHOME协议' },
  { label: 'DAHUA', value: 'dahua', defaultPort: 37777, description: '大华私有协议' },
]

/** 协议类型别名 */
export type ProtocolType = Protocol
