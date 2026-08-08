/**
 * 华盾AI智能视频盒子 v7.0 - WebSocket 主题枚举
 * composables/wsTopics.ts — 集中管理 WS 推送消息 type 字段
 *
 * Phase 13 P3 #1: 把 useWebSocket.ts 中散落的 'alarm' | 'device_status' | 'agent_status' |
 * 'heartbeat' 字符串集中, 防止 typo 漏订阅
 *
 * 后端对应 (BoxService::pushSystemEvent / pushAlarm):
 *   - alarm.*        → 告警事件 (pushAlarm type="alarm.new")
 *   - device.*       → 设备状态 (online/offline/error)
 *   - agent.*        → Agent 状态 (running/idle/error)
 *   - stream.*       → 流状态 (started/stopped/quality)
 *   - system.*       → 系统级 (heartbeat/version/notification)
 */

export const WS_TOPICS = {
  // 告警
  ALARM: 'alarm',
  ALARM_NEW: 'alarm.new',
  ALARM_RESOLVED: 'alarm.resolved',
  ALARM_MAP_MARKER: 'alarm_map_marker',  // [Audit-Add] 地图联动告警标记

  // [P1-3 FIX 2026-07-14] 联动引擎推送主题
  //   后端 BoxService 执行器通过 pushSystemEvent("linkage_action", ...) 推送
  //   和 pushAlarm({type:"linkage_alarm",...}) 推送.
  //   前端必须订阅这两个主题才能接收联动弹窗/动作执行通知.
  LINKAGE_ALARM: 'linkage_alarm',      // 联动规则触发的告警弹窗 (WEB_POPUP 执行器)
  LINKAGE_ACTION: 'linkage_action',    // 联动动作执行通知 (所有执行器通用)
  DASHBOARD_ALERT: 'dashboard_alert',  // Dashboard 嵌入告警 (WEB_DASHBOARD_ALERT)

  // 设备
  DEVICE_STATUS: 'device.status',
  DEVICE_ONLINE: 'device.online',
  DEVICE_OFFLINE: 'device.offline',
  DEVICE_ERROR: 'device.error',

  // Agent
  AGENT_STATUS: 'agent.status',
  AGENT_RESPONSE: 'agent.response',
  AGENT_ERROR: 'agent.error',

  // 流
  STREAM_STARTED: 'stream.started',
  STREAM_STOPPED: 'stream.stopped',
  STREAM_QUALITY: 'stream.quality',

  // 系统
  HEARTBEAT: 'heartbeat',
  SYSTEM_VERSION: 'system.version',
  SYSTEM_NOTIFICATION: 'system.notification',
  SYSTEM_ALARM_MAP_MARKER: 'system.alarm_map_marker',  // [Audit-Add] pushSystemEvent 路径

  // 通配
  WILDCARD: '*',
} as const

export type WsTopic = (typeof WS_TOPICS)[keyof typeof WS_TOPICS]

/** WS payload 结构 (后端 pushSystemEvent / pushAlarm 通用 schema) */
export interface WsPayload<T = unknown> {
  type: WsTopic | string
  data?: T
  alarm?: T  // 兼容 pushAlarm 老 payload
  timestamp?: string
  ts?: number
}

/** 消息处理器签名 */
export type WsMessageHandler<T = unknown> = (data: T, raw: WsPayload<T>) => void
