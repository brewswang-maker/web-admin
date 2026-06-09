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
  count?: number          // 后端 count 参数
  keyword?: string
  level?: AlarmLevel
  severity?: string      // 兼容前端 severity 筛选
  type?: AlarmType
  alarm_type?: string    // 后端 alarm_type 参数
  status?: AlarmStatus
  deviceId?: string
  channelId?: string
  startTime?: string
  endTime?: string
  start_ms?: number      // 后端时间戳参数
  end_ms?: number
  search?: string
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

/** 告警证据链 */
export interface AlarmEvidence {
  snapshotUrl: string
  videoClipUrl?: string
  detectionBoxes?: Array<{ x: number; y: number; w: number; h: number; label: string; confidence: number }>
  aiAnalysis?: string
  relatedRecordingId?: string
  relatedRecordingTime?: string
}

// ════════════════════════════════════════════════════════════════════
// 统一字段归一化 (snake_case → camelCase)
// 历史问题: useAlarmPopup / stores/alarm / AlarmsView 三处各自实现归一化,
// 任一处字段名遗漏或更新不同步, 就会导致"快照不显示/录像空"等回归.
// 现在统一到此处, 所有模块 import 这一个函数.
// ════════════════════════════════════════════════════════════════════

const ALARM_TYPE_CN: Record<string, string> = {
  person_detected: '人员检测', intrusion: '入侵检测', fire: '烟火检测',
  smoke: '烟雾检测', fall: '倒地检测', violence: '打架检测',
  loitering: '徘徊检测', gathering: '聚集检测', vehicle_detected: '车辆检测',
  object_detected: '物体检测', face_blacklist: '黑名单告警', gb28181_alarm: '设备告警',
  ppe: '安全帽检测', crowd: '人群密度', plate: '车牌识别',
}

function mapSeverity(severity: number | string | undefined): AlarmLevel {
  const n = Number(severity ?? 0)
  if (n >= 5) return 'critical'
  if (n >= 4) return 'high'
  if (n >= 3) return 'medium'
  if (n >= 1) return 'low'
  return 'low'
}

function toAbsoluteUrl(url: string | undefined): string {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('data:')) return url
  if (typeof window === 'undefined') return url
  const base = window.location.origin
  return url.startsWith('/') ? base + url : base + '/' + url
}

/**
 * 统一归一化: 后端 snake_case (或部分 camelCase) → 前端 AlarmEvent
 * 所有模块 (WS / REST / 缓存) 必须走这一个函数, 避免字段漂移.
 */
export function normalizeAlarmCore(raw: any): AlarmEvent {
  if (!raw) {
    console.warn('[normalizeAlarmCore] raw is null/undefined, using empty fallback')
    raw = {}
  }
  const severityNum = Number(raw.severity ?? raw.level ?? 2)
  const alarmType = raw.alarm_type || raw.type || 'other'
  const channelId = String(raw.channel_id ?? raw.channelId ?? raw.channel ?? '')
  const ts = raw.timestamp_ms || raw.timestamp || raw.created_at || raw.createdAt || Date.now()

  return {
    id: raw.id || raw.alarm_id || `${raw.device_id || ''}_${channelId}_${ts}`,
    type: alarmType as AlarmType,
    level: mapSeverity(severityNum),
    description: raw.description || raw.title || ALARM_TYPE_CN[alarmType] || alarmType,
    channelId,
    channelName: raw.channel_name || raw.channelName || (channelId ? `通道${channelId}` : ''),
    deviceId: raw.device_id || raw.deviceId || raw.channel_id || '',
    deviceName: raw.device_name || raw.deviceName || raw.zone || '',
    snapshotUrl: toAbsoluteUrl(raw.snapshot_url || raw.snapshotUrl || raw.snapshot_path),
    videoClipUrl: toAbsoluteUrl(raw.video_clip_url || raw.videoClipUrl),
    aiConclusion: raw.ai_conclusion || raw.aiConclusion || raw.ai_analysis || raw.aiAnalysis || '',
    confidence: Number(raw.confidence ?? raw.ai_confidence ?? raw.aiConfidence ?? 0),
    status: (raw.status as AlarmStatus) || 'unhandled',
    location: raw.location || raw.location_name || raw.zone || '',
    metadata: {
      bbox: raw.bbox || [],
      targetLabel: raw.target_label || raw.targetLabel || '',
      regionId: raw.region_id || '',
      severityNum,
      suggestedAction: raw.suggested_action || '',
      ...(raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}),
    },
    createdAt: raw.created_at || raw.createdAt
      || (typeof ts === 'number' ? new Date(ts).toISOString() : new Date().toISOString()),
    updatedAt: raw.updated_at || raw.updatedAt || raw.created_at || raw.createdAt
      || new Date().toISOString(),
    handledBy: raw.handled_by || raw.handledBy || '',
    handledAt: raw.handled_at || raw.handledAt || '',
    handleNote: raw.handle_note || raw.handleNote || '',
  }
}
