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
  /** [P3-2 2026-09-11] 按目标身份 (track) 去重总开关 → box_config alarm.dedup.dedup_by_track_enabled (默认 true) */
  dedupByTrackEnabled: boolean
  /** [P3-2 2026-09-11] 告警冷却时间窗 (秒) → box_config alarm.dedup.window_seconds (默认 30) */
  dedupWindowSeconds: number
}

/** [P1-1 2026-09-13] 事件级尺寸过滤 (round2 P1-1): 全局统一门 bbox 归一化面积过滤 */
export interface SizeFilterOverride {
  min_area: number
  max_area: number
}
export interface SizeFilterSettings {
  enabled: boolean
  /** 归一化面积下限 (0=关) */
  default_min_area: number
  /** 归一化面积上限 (0=关) */
  default_max_area: number
  /** 按 alarm_type 覆盖默认 (键=alarm_type 如 intrusion/tripwire) */
  overrides: Record<string, SizeFilterOverride>
  stats?: { size_filtered: number; size_filter_skipped: number }
}

/** [P1-2 2026-09-25 免打扰] 全局静默时段: 推送集成层按窗口过滤 WS 推送
 *  (电话/语音播报走 executor 独立链路, 不受影响 — 对标乐橙「电话不受免打扰限制」) */
export interface QuietHoursSettings {
  enabled: boolean
  /** "HH:MM" 24h */
  start: string
  /** "HH:MM" 24h; start > end = 跨天窗口, start == end 被后端拒绝 (歧义) */
  end: string
  /** 运行期已抑制推送计数 (进程生命周期累计) */
  suppressed?: number
}

/** [P2 2026-09-25 NL事件订阅 短信通道] 腾讯云短信直连配置 (box_config alarm.sms_notify)
 *  语义: enabled 且五要素齐 (secret_id/secret_key/sdk_app_id/sign_name/template_id)
 *  时, 订阅「短信」通道的 CLIENT_SEND_SMS 执行器走盒子直连腾讯云 (TC3 签名);
 *  否则维持 WS-only 兜底 (action.params.sms_api_url 网关优先)。 */
export interface SmsNotifySettings {
  enabled: boolean
  /** 腾讯云 API SecretId (非机密公开标识, 便于识别用哪把 key) */
  secret_id: string
  /** [脱敏] SecretKey 是否已设置 — 明文永不出后端 (GET 只回布尔) */
  secret_key_set?: boolean
  /** 明文 SecretKey — 仅 PUT 输入使用 (空串 = 保留现值); GET 响应中永远不存在 */
  secret_key?: string
  /** 短信应用 SdkAppId (1400xxxxxx, 腾讯云控制台创建) */
  sdk_app_id: string
  /** 已审核短信签名内容 (非签名 ID) */
  sign_name: string
  /** 已审核正文模板 ID */
  template_id: string
  /** 地域 (签名 Host 固定 sms.tencentcloudapi.com, region 仅作 Header) */
  region: string
  /** 模板参数取值顺序 (元素 ∈ {sub_name,alarm_type,channel,time}, 其余字面量原样; 空 = 默认) */
  param_order: string[]
  /** 五要素齐 + enabled (后端 configured() 判定: 短信通道当前是否真正生效) */
  configured?: boolean
}

/** [P2 2026-09-25 NL事件订阅 聚合摘要] 每日动态汇总 (box_config alarm.subscription_digest)
 *  对标萤石「今日动态」: 每日 time 时刻汇总订阅近 24h 命中动态, 有动态才推 WS 帧。 */
export interface SubscriptionDigestSettings {
  enabled: boolean
  /** "HH:MM" 本地时区 (缺省 09:00) */
  time: string
  /** 当前近 24h 摘要预览 (GET 附带; 部署前即可预览汇总口径) */
  digest?: {
    date: string
    window_hours: number
    total: number
    subscriptions: Array<Record<string, unknown>>
    generated_at: number
  }
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
  /** [M2-4 2026-09-21] Linux 启动标识 (升级完成校验: 变化=设备已重启=升级生效) */
  bootId?: string
  /** [M2-4 2026-09-21] 软件版本 (与服务 health.version 同源) */
  softwareVersion?: string
}

/** [REC-ARCH 2026-09-17] 录像存储策略 (全局): 连续录像默认关 + 事件录像不本地落盘 */
export interface RecordingSettings {
  /** 设备连续录像总闸 (默认 false; 17G eMMC 撑不住连续录像, 关时通道覆盖不生效) */
  continuousEnabled: boolean
  /** 事件录像来源: nvr=GB28181 回放流拉取(默认) / device=设备自身录像(同款 GB28181) / disabled=禁用 */
  eventSource: 'nvr' | 'device' | 'disabled'
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
  /** [P1-1 2026-09-13] 获取事件级尺寸过滤配置 (alarm.size_filter) */
  getSizeFilter() {
    return http.get<ApiResponse<SizeFilterSettings>>('/alarm/size-filter')
  },
  /** [P1-1 2026-09-13] 保存事件级尺寸过滤配置 (即时生效 + 持久化 box_config) */
  saveSizeFilter(data: Partial<SizeFilterSettings>) {
    return http.put<ApiResponse<SizeFilterSettings>>('/alarm/size-filter', data)
  },
  /** [P1-2 2026-09-25] 获取推送免打扰配置 (alarm.quiet_hours) */
  getQuietHours() {
    return http.get<ApiResponse<QuietHoursSettings>>('/alarm/quiet-hours')
  },
  /** [P1-2 2026-09-25] 保存推送免打扰配置 (即时生效 + 持久化 box_config alarm.quiet_hours) */
  saveQuietHours(data: Partial<QuietHoursSettings>) {
    return http.put<ApiResponse<{ applied: boolean; enabled: boolean; start: string; end: string; persisted: string }>>(
      '/alarm/quiet-hours', data)
  },
  /** [P2 2026-09-25] 获取腾讯云短信配置 (alarm.sms_notify; secret_key 脱敏仅回布尔) */
  getSmsNotify() {
    return http.get<ApiResponse<SmsNotifySettings>>('/alarm/sms-notify')
  },
  /** [P2 2026-09-25] 保存腾讯云短信配置 (即时生效 + 持久化 alarm.sms_notify;
   *  secret_key 传空串 = 保留现值, 仅重新输入才覆盖) */
  saveSmsNotify(data: Partial<SmsNotifySettings>) {
    return http.put<ApiResponse<{ applied: boolean; enabled: boolean; configured: boolean; param_order: string[]; persisted: string }>>(
      '/alarm/sms-notify', data)
  },
  /** [P2 2026-09-25] 获取订阅聚合摘要配置 + 当前近 24h 摘要预览 (alarm.subscription_digest) */
  getSubscriptionDigest() {
    return http.get<ApiResponse<SubscriptionDigestSettings>>('/alarm/subscription-digest')
  },
  /** [P2 2026-09-25] 保存订阅聚合摘要配置 (即时生效 + 持久化; 重开时重置当日哨兵允许当天补推) */
  saveSubscriptionDigest(data: { enabled?: boolean; time?: string }) {
    return http.put<ApiResponse<{ applied: boolean; enabled: boolean; time: string; persisted: string }>>(
      '/alarm/subscription-digest', data)
  },
  /** 获取系统信息 */
  getSystemInfo() {
    return http.get<ApiResponse<SystemInfo>>('/settings/system-info')
  },
  /** [REC-ARCH 2026-09-17] 获取录像存储策略 (全局) */
  getRecording() {
    return http.get<ApiResponse<RecordingSettings>>('/settings/recording')
  },
  /** [REC-ARCH 2026-09-17] 保存录像存储策略 (即时生效: 触发侧每次直读配置) */
  saveRecording(data: Partial<RecordingSettings>) {
    return http.put<ApiResponse<{ message: string; persisted: boolean }>>('/settings/recording', data)
  },
}
