/**
 * 华盾AI智能视频盒子 v7.0 - 告警相关类型定义
 * types/alarm.ts — 告警事件、统计、处理相关类型
 *
 * [v6.2 2026-06-21] 事件分类体系重构
 * 对标一线厂商:
 *   海康威视 iVMS-8700 (facedetection 10015 / whitelistface 10042 / MINOR_* 0x4b 0x50 0x68 等)
 *   大华 DSS / ICC (1001000 陌生人 / 1001001 白名单 / 1001002 黑名单 / 1001003 内部 / 1001004 访客 / 1001005 VIP)
 *   华为 HoloSens IVS (黑名单布控/白名单策略/VIP 库/陌生人识别)
 *   ONVIF Profile M (tns1:FaceRecognition)
 *   GA/T 2000.273-2019 (视频图像事件告警类型代码)
 *   GA/T 1470-2018 (安全防范人脸识别应用分类)
 *
 * SSOT 原则: alarm_type 字符串必须与
 *   - 后端 include/service/EventTypeAliases.h (C++)
 *   - 后端 plugins/face/face_detector/FaceDatabase.h (C++ helper 函数)
 * 保持一致, 任何新增须三处同步.
 */

/** 告警级别 — 对标大华 ICC (1 严重/2 一般/3 轻微) + 海康+华为语义 */
export type AlarmLevel = 'critical' | 'high' | 'medium' | 'low' | 'info'

/** 事件大类 — 对标海康/大华事件分类 (alarm/state/business/perception) */
export type AlarmCategory = 'alarm' | 'notification' | 'business' | 'state' | 'perception'

/**
 * 告警类型 — 完整 v6.2 事件分类
 *
 * 分组:
 *   [通用检测] person_detected / vehicle_detected / object_detected
 *   [人脸报警] face_blacklist / face_stranger / face_force_open / face_door_bypassed /
 *              face_tailgate / face_anti_sneak / face_liveness_fail / face_verify_fail /
 *              face_recog_failed / face_quality_low / face_visitor_expired
 *   [人脸通行] face_pass_whitelist / face_pass_visitor / face_pass_vip / face_pass_staff / face_pass_blacklist_hit
 *   [人脸业务] face_detected / face_verified / face_recognized
 *   [人脸其他] face_unknown / face_whitelist / face_visitor
 *   [周界行为] intrusion / tripwire / climbing / crowd / loitering / fall / running /
 *              wrong_direction / illegal_parking / abandoned
 *   [烟火环境] fire / smoke
 *   [安全合规] helmet_violation / uniform_violation / mask_violation / guard_absence /
 *              ppe_violation / phone_call / smoking
 *   [设备状态] gb28181_alarm / camera_tamper / brightness_abnormal / image_freeze / glare
 *   [危险物] weapon_detected / dangerous_item
 *   [其他] other
 */
export type AlarmType =
  // ── 通用检测 ──
  | 'person_detected' | 'person'
  | 'vehicle_detected' | 'vehicle'
  | 'object_detected' | 'object'
  // ── 人脸报警 (大华 1001002/1001000 / 海康 10042 / 华为 VIP/黑名单) ──
  | 'face_blacklist' | 'face_stranger' | 'face_force_open' | 'face_door_bypassed'
  | 'face_tailgate' | 'face_anti_sneak' | 'face_liveness_fail' | 'face_verify_fail'
  | 'face_recog_failed' | 'face_quality_low' | 'face_visitor_expired'
  // ── 人脸通行 (大华 1001001/1001004/1001005/1001003) ──
  | 'face_pass_whitelist' | 'face_pass_visitor' | 'face_pass_vip' | 'face_pass_staff'
  | 'face_pass_blacklist_hit'
  // ── 人脸业务 ──
  | 'face_detected' | 'face_verified' | 'face_recognized'
  // ── 人脸其他/兼容 ──
  | 'face_unknown' | 'face_whitelist' | 'face_visitor'
  // ── 周界行为 (GA/T 2000.273 06/07/08) ──
  | 'intrusion' | 'tripwire' | 'climbing' | 'crowd' | 'loitering'
  | 'fall' | 'running' | 'wrong_direction' | 'illegal_parking' | 'abandoned'
  // ── 烟火环境 (海康 10005/10006) ──
  | 'fire' | 'smoke'
  // ── 安全合规 ──
  | 'helmet' | 'helmet_violation' | 'uniform_violation' | 'mask_violation'
  | 'guard_absence' | 'ppe_violation' | 'phone_call' | 'smoking'
  | 'seatbelt' | 'seatbelt_violation'
  // [FIX IllegalRider 2026-08-18] 违规载人 (叉车/货车载人检测)
  | 'illegal_rider'
  // ── 设备状态 ──
  | 'gb28181_alarm' | 'camera_tamper' | 'brightness_abnormal' | 'image_freeze' | 'glare'
  // ── 危险物 ──
  | 'weapon_detected' | 'weapon' | 'dangerous_item'
  // ── 兼容别名 ──
  | 'plate' | 'plate_detected' | 'wrong_way' | 'intruder' | 'wandering' | 'fighting' | 'violence'
  | 'fall_detected' | 'falling' | 'crowd_density' | 'gathering' | 'punch' | 'kick'
  // ── [P0-1 2026-08-20] 补齐 SSOT 99 项 (对齐后端 EventTypeAliases.h meta_table) ──
  // 前端原仅 72 keys, 48 项 canonical 类型缺失 (审计: SSOT 99 vs 前端 72)
  | 'fight' | 'tailgate' | 'sleep_on_duty' | 'object_removal' | 'drowsy' | 'yawn'
  | 'fatigue_detected' | 'drowning_detected' | 'unsafe_operation' | 'body_temp_abnormal'
  | 'traffic_accident' | 'traffic_violation' | 'traffic_congestion' | 'speeding'
  | 'environment_anomaly' | 'water_leak' | 'gas_leak' | 'air_quality' | 'garbage_overflow'
  | 'facility_damage' | 'fire_exit_blocked' | 'elevator_anomaly' | 'power_anomaly'
  | 'theft_suspected' | 'shelf_anomaly' | 'animal_detected'
  | 'smolder' | 'firework' | 'fire_access' | 'smog' | 'illegal_occupation' | 'vandalism'
  | 'door_open_timeout' | 'line_cross_count'
  | 'parking_occupancy' | 'parking_vacancy' | 'queue_length' | 'people_count' | 'density_heatmap'
  | 'ocr_text' | 'safety_sign_violation' | 'lpr_pass' | 'lpr_violation'
  | 'stream_connected' | 'stream_disconnected' | 'stream_recovered' | 'stream_error' | 'stream_degraded'
  // ── 其他 ──
  | 'other'

/** 告警状态 */
// [P0-3] 完整工单流转: new → acknowledged → disposed → closed (或 escalated/reassigned/false_alarm/resolved)
export type AlarmStatus =
  | 'unhandled'        // new - 新告警
  | 'acknowledged'     // 已确认收到 (非终态)
  | 'disposed'         // 处置中 (非终态)
  | 'escalated'        // 已升级 (非终态)
  | 'reassigned'       // 已转派 (非终态)
  | 'confirmed'        // [兼容] 旧版已确认
  | 'false_alarm'      // 误报 (终态)
  | 'forwarded'        // [兼容] 旧版已转发
  | 'resolved'         // 已解决 (终态)
  | 'closed'           // 已关闭 (终态)
  | 'auto_resolved'

/** 告警事件 */
export interface AlarmEvent {
  id: string
  type: AlarmType
  level: AlarmLevel
  category?: AlarmCategory   // [v6.2] 事件大类
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
  info?: number
  unhandled: number
  confirmed: number
  falseAlarm: number
  todayTotal: number
  todayUnhandled: number
}

/** 告警处理表单 */
// [P0-3] 扩展工单流转动作
export interface AlarmHandleForm {
  status: 'acknowledged' | 'disposed' | 'closed' | 'escalated' | 'reassigned'
        | 'confirmed' | 'false_alarm' | 'forwarded' | 'ignored'
  note?: string
  forwardTo?: string
  assignee?: string        // [P0-3] 指派/转派目标人
  ticketId?: string        // [P0-3] 关联工单号
  disposition?: string     // [P0-3] 处置结果说明
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
  category?: AlarmCategory  // [v6.2]
  alarm_type?: string    // 后端 alarm_type 参数
  status?: AlarmStatus
  deviceId?: string
  channelId?: string
  startTime?: string
  endTime?: string
  start_ms?: number      // 后端时间戳参数
  end_ms?: number
  since?: number         // [P0-4-d] WS 断线重连补拉: 只返回 created_at > since 的告警 (ms, 排他)
  scene?: string         // [校园方案 2026-08-30] 场景过滤 (逗号分隔多值, 后端 SSOT 展开 SQL IN)
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

/**
 * 告警类型 → 中文展示文案
 * 对标海康/大华前端展示规范:
 *   - 海康: 标准化中文 + 类别 (黑名单报警/陌生人报警/区域入侵等)
 *   - 大华: 标准化中文 + 通道
 *
 * 必须是后端 faceEventTypeToCN 的镜像 (SSOT 原则).
 * 新增告警类型时, 必须同时更新本表 + 后端 FaceDatabase.h helper.
 */
export const ALARM_TYPE_CN: Record<string, string> = {
  // ── 通用检测 ──
  person_detected: '人员检测',
  person: '人员检测',
  vehicle_detected: '车辆检测',
  vehicle: '车辆检测',
  object_detected: '物体检测',
  object: '物体检测',
  // ── 人脸报警 (对标大华 1001002/1001000/1001005) ──
  face_blacklist: '黑名单告警',
  face_stranger: '陌生人告警',
  face_force_open: '强行闯入',
  face_door_bypassed: '门禁绕行',
  face_tailgate: '尾随通行',
  face_anti_sneak: '反潜回失败',
  face_liveness_fail: '活体检测失败',
  face_verify_fail: '人脸认证失败',
  face_recog_failed: '人脸识别失败',
  face_quality_low: '底库质量低',
  face_visitor_expired: '访客已过期',
  // ── 人脸通行 ──
  face_pass_whitelist: '白名单通行',
  face_pass_visitor: '访客通行',
  face_pass_vip: 'VIP通行',
  face_pass_staff: '内部员工通行',
  face_pass_blacklist_hit: '黑名单记录',
  // ── 人脸业务 ──
  face_detected: '人脸检测',
  face_verified: '活体认证通过',
  face_recognized: '识别成功',
  // ── 人脸其他/兼容 ──
  // [v6.2.1 2026-06-26 FIX] face_unknown 对齐 face_stranger (SSOT 原则)
  face_unknown: '陌生人告警',
  face_whitelist: '白名单通行',
  face_visitor: '访客通行',
  // ── 周界行为 (GA/T 2000.273) ──
  intrusion: '区域入侵',
  tripwire: '绊线入侵',
  climbing: '攀高检测',
  crowd: '人群聚集',
  loitering: '徘徊检测',
  fall: '倒地检测',
  fall_detected: '倒地检测',
  running: '奔跑检测',
  wrong_direction: '逆行检测',
  wrong_way: '逆行检测',
  illegal_parking: '违停检测',
  abandoned: '物品遗留',
  fighting: '打架斗殴',
  violence: '打架斗殴',
  // ── 烟火环境 ──
  fire: '烟火检测',
  smoke: '烟雾检测',
  // ── 安全合规 ──
  helmet: '安全帽检测',
  helmet_violation: '未戴安全帽',
  uniform_violation: '未穿工服',
  mask_violation: '未戴口罩',
  guard_absence: '值班离岗',
  ppe_violation: 'PPE违规',
  phone_call: '打电话检测',
  smoking: '吸烟检测',
  seatbelt: '未系安全带',
  seatbelt_violation: '未系安全带',
  illegal_rider: '违规载人',
  // ── 设备状态 ──
  gb28181_alarm: '设备告警',
  camera_tamper: '视频遮挡',
  brightness_abnormal: '亮度异常',
  image_freeze: '画面冻结',
  glare: '强光干扰',
  // ── 危险物 ──
  weapon_detected: '危险物检测',
  weapon: '危险物检测',
  dangerous_item: '危险物检测',
  // ── 兼容别名 ──
  plate: '车牌识别',
  plate_detected: '车牌识别',
  ppe: '安全帽检测',
  crowd_density: '人群密度',
  gathering: '聚集检测',
  intruder: '区域入侵',
  wandering: '徘徊检测',
  falling: '倒地检测',
  // ── [P0-1 2026-08-20] 补齐 SSOT 99 项镜像 (48 项缺失, 中文名 = meta_table display_name_cn) ──
  // 审计: SSOT meta_table 99 vs 前端 72 keys; 服务端 getEventTypes() 已改遍历 meta_table,
  // 前端翻译表必须同步, 否则新 30 项事件类型在通知中心显示英文原名.
  // ── 周界/行为补充 ──
  fight: '打架检测',
  tailgate: '尾随通行',
  sleep_on_duty: '睡岗检测',
  object_removal: '物品移除',
  // ── DMS 疲劳 ──
  fatigue_detected: '疲劳检测',
  drowsy: '驾驶员闭眼',
  yawn: '驾驶员哈欠',
  // ── 人员安全/医疗 ──
  drowning_detected: '溺水检测',
  unsafe_operation: '危险操作',
  body_temp_abnormal: '体温异常',
  // ── 交通事件 ──
  traffic_accident: '交通事故',
  traffic_violation: '交通违章',
  traffic_congestion: '交通拥堵',
  speeding: '超速检测',
  // ── 环境异常 ──
  environment_anomaly: '环境异常',
  water_leak: '漏水积水',
  gas_leak: '燃气泄漏',
  air_quality: '空气质量异常',
  garbage_overflow: '垃圾溢出',
  // ── 设施/建筑 ──
  facility_damage: '设施损坏',
  fire_exit_blocked: '消防通道堵塞',
  elevator_anomaly: '电梯异常',
  power_anomaly: '电力异常',
  // ── 零售/经营 ──
  theft_suspected: '疑似盗窃',
  shelf_anomaly: '货架异常',
  // ── 动物检测 ──
  animal_detected: '动物检测',
  // ── 烟火/消防扩充 ──
  smolder: '阴燃检测',
  firework: '烟花识别',
  fire_access: '明火作业',
  smog: '雾霾检测',
  // ── 行为异常扩充 ──
  illegal_occupation: '非法占用',
  vandalism: '故意破坏',
  door_open_timeout: '门超时未关',
  line_cross_count: '越线计数',
  // ── 停车场/客流/OCR ──
  parking_occupancy: '车位占用',
  parking_vacancy: '车位空闲',
  queue_length: '排队长度',
  people_count: '人数统计',
  density_heatmap: '密度热力图',
  ocr_text: '文字识别',
  safety_sign_violation: '安全标识违规',
  lpr_pass: '车牌通行',
  lpr_violation: '车牌违规',
  // ── 流状态 ──
  stream_connected: '流已连接',
  stream_disconnected: '流已断开',
  stream_recovered: '流已恢复',
  stream_error: '流错误',
  stream_degraded: '流质量降级',
  // ── 其他 ──
  other: '其他事件',
}

/**
 * 告警类型 → 事件大类 (对标海康/大华/华为)
 * 必须与后端 faceEventTypeToCategory 保持一致.
 */
export const ALARM_CATEGORY: Record<string, AlarmCategory> = {
  // ALARM 类 (报警, 需人工处置)
  face_blacklist: 'alarm', face_stranger: 'alarm', face_force_open: 'alarm',
  face_door_bypassed: 'alarm', face_tailgate: 'alarm', face_anti_sneak: 'alarm',
  face_liveness_fail: 'alarm', face_verify_fail: 'alarm', face_recog_failed: 'alarm',
  face_quality_low: 'alarm', face_visitor_expired: 'alarm',
  intrusion: 'alarm', tripwire: 'alarm', climbing: 'alarm', crowd: 'alarm',
  loitering: 'alarm', fall: 'alarm', running: 'alarm', wrong_direction: 'alarm',
  illegal_parking: 'alarm', abandoned: 'alarm', fighting: 'alarm',
  fire: 'alarm', smoke: 'alarm',
  helmet_violation: 'alarm', uniform_violation: 'alarm', mask_violation: 'alarm',
  guard_absence: 'alarm', ppe_violation: 'alarm', phone_call: 'alarm', smoking: 'alarm',
  seatbelt: 'alarm', seatbelt_violation: 'alarm',
  illegal_rider: 'alarm',
  weapon_detected: 'alarm', weapon: 'alarm', dangerous_item: 'alarm',
  // NOTIFICATION 类 (通行通知)
  face_pass_whitelist: 'notification', face_pass_visitor: 'notification',
  face_pass_vip: 'notification', face_pass_staff: 'notification',
  face_pass_blacklist_hit: 'notification',
  // BUSINESS 类 (检测/识别)
  face_detected: 'business', face_verified: 'business', face_recognized: 'business',
  // [v6.2.1 2026-06-26 FIX] face_unknown/person_detected/person 对齐 SSOT 为 alarm
  face_unknown: 'alarm', face_whitelist: 'business', face_visitor: 'business',
  person_detected: 'alarm', vehicle_detected: 'business', object_detected: 'business',
  person: 'alarm', vehicle: 'business', object: 'business',
  // STATE 类
  gb28181_alarm: 'state', camera_tamper: 'state',
  brightness_abnormal: 'state', image_freeze: 'state', glare: 'state',
  stream_connected: 'state', stream_disconnected: 'state', stream_recovered: 'state',
  stream_error: 'state', stream_degraded: 'state',
  // [P0-1 2026-08-20] 补齐 SSOT 99 项分类 (对齐 meta_table EventCategory)
  fight: 'alarm', tailgate: 'alarm', sleep_on_duty: 'alarm', object_removal: 'alarm',
  fatigue_detected: 'alarm', drowsy: 'alarm', yawn: 'alarm',
  drowning_detected: 'alarm', unsafe_operation: 'alarm', body_temp_abnormal: 'alarm',
  traffic_accident: 'alarm', traffic_violation: 'alarm', traffic_congestion: 'alarm',
  speeding: 'alarm', wrong_way: 'alarm',
  environment_anomaly: 'alarm', water_leak: 'alarm', gas_leak: 'alarm',
  air_quality: 'alarm', garbage_overflow: 'alarm',
  facility_damage: 'alarm', fire_exit_blocked: 'alarm', elevator_anomaly: 'alarm',
  power_anomaly: 'alarm', theft_suspected: 'alarm', animal_detected: 'alarm',
  smolder: 'alarm', firework: 'alarm', fire_access: 'alarm', smog: 'alarm',
  illegal_occupation: 'alarm', vandalism: 'alarm', door_open_timeout: 'alarm',
  safety_sign_violation: 'alarm', lpr_violation: 'alarm',
  parking_occupancy: 'business', parking_vacancy: 'business', queue_length: 'business',
  people_count: 'business', density_heatmap: 'business', ocr_text: 'business',
  shelf_anomaly: 'business', line_cross_count: 'business',
  lpr_pass: 'notification',
}

/**
 * [FIX severity-scale 2026-08-24] severity 刻度归一化
 * 后端链路存在两种刻度历史:
 *   - AlarmInfo.level / LinkageEvent.severity: 1-5 整数 (现行契约)
 *   - BehaviorEvent.severity: 0-1 浮点 (插件上报); 旧版 WEB_POPUP 曾未经换算
 *     直接透传, float→int 截断后 0.95 变 0 → 级别显示"低" (8/24 12:52 危险物告警实测)
 * 归一化规则:
 *   1. NaN (字符串标签/缺失) → level 兜底 → 2
 *   2. (0,1) 浮点 → round(n*5), 下限 2 (0.95→5 critical, 0.7→4 high)
 *   3. 越界时夹紧到 [1,5]
 */
function normalizeSeverityScale(sev: unknown, level?: unknown): number {
  let n = Number(sev)
  if (!Number.isFinite(n)) n = Number(level)
  if (!Number.isFinite(n)) n = 2
  if (n > 0 && n < 1) n = Math.max(2, Math.round(n * 5))
  return Math.max(1, Math.min(5, n))
}

/** 数字 severity → AlarmLevel 字符串 */
function mapSeverity(severity: number | string | undefined): AlarmLevel {
  // [FIX severity-scale 2026-08-24] NaN 防御: 字符串标签 (如 "critical")
  //   Number() 后为 NaN, 全部比较 false → 兜底 'low'. 改用归一化后再映射.
  const n = Number.isFinite(Number(severity)) ? Number(severity) : normalizeSeverityScale(severity)
  if (n >= 5) return 'critical'
  if (n >= 4) return 'high'
  if (n >= 3) return 'medium'
  if (n >= 2) return 'low'
  if (n >= 1) return 'info'
  return 'low'
}

/** 数字 severity → 事件大类 (与后端 faceEventTypeToCategory 对齐) */
function mapCategory(alarmType: string, severityNum: number): AlarmCategory {
  // 优先按显式 category 映射
  const explicit = ALARM_CATEGORY[alarmType]
  if (explicit) return explicit
  // 后备: 按 severity 推断 (向后兼容)
  if (severityNum >= 4) return 'alarm'
  if (severityNum >= 3) return 'business'
  return 'notification'
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
  // [FIX severity-scale 2026-08-24] 统一走刻度归一化 (兼容 0-1 浮点 / 1-5 整数 / 缺失)
  const severityNum = normalizeSeverityScale(raw.severity, raw.level)
  const alarmType = raw.alarm_type || raw.type || 'other'
  // [FIX PhoneCall 2026-07-29] 优先取 metadata.channel_id_str (完整 GB28181 20位 ID)
  //   原因: phone_call 等 specialized plugin 路径的 channel_id 会被截断为 int32 hash
  //   (e.g. "1756644621"), 弹窗查 /api/v1/streams/{id}/multi-urls 时 404, 视频流获取失败.
  //   修复: 按 channel_id_str → metadata.channel_id_str → channel_id 顺序回退
  const md = raw.metadata
  // [加油站三期 2026-08-30 EHS 闭环] 治理字段解包: 后端 metadata 落库为 JSON 数组
  //   (设备实况 [{algo_id,...}], 状态机回填字段注入首元素), 对象形态直接用 —
  //   供 status 与 acked_at/resolved_at/closed_at 读取及 metadata 展开。
  const gov: Record<string, unknown> =
    Array.isArray(md) ? (md[0] && typeof md[0] === 'object' ? md[0] : {})
      : (md && typeof md === 'object' ? md : {})
  const rawCh = raw.channel_id ?? raw.channelId ?? raw.channel ?? ''
  // [FIX 2026-08-21] 过滤无效通道哨兵: "-1" (测试告警 reportSimple(-1) /
  //   WEB_POPUP 透传)、"0"、URL 型、负数截断值都不是合法流 ID; 原逻辑
  //   用 || 短路, 首个非空候选即使是 "-1" 也直接生效 → MiniPlayer 对
  //   /streams/-1/ 永久轮询, 报警弹窗一直显示"等待流"。改为在候选链中
  //   择首个有效值; 全无效时置空, AlarmPopup 自动走"无通道信息"占位。
  const isValidChannelId = (v: string) =>
    v !== '' && v !== '0' && !v.startsWith('-') && !v.includes('://')
  const channelId = [
    String(raw.channel_id_str ?? ''),
    md && typeof md === 'object' ? String(md.channel_id_str ?? '') : '',
    Array.isArray(md) && md[0] && typeof md[0] === 'object' ? String(md[0].channel_id_str ?? '') : '',
    String(rawCh),
  ].find(v => isValidChannelId(v)) || ''
  const rawChStr = String(rawCh)
  // [status 映射 2026-09-01] 后端初始状态是 'new' (实测顶层 status 缺省时由
  //   metadata 治理字段 gov.status 回填 'new'), 前端 SSOT 值域是 'unhandled'
  //   (见 AlarmStatus 注释 "unhandled // new - 新告警"); 直接透传致视图 i18n
  //   拼出 status_new 裸 key (真机实测状态列显示 "perimeter.events.status_new")。
  //   双源取值后再统一映射, 全视图受益。
  const rawStatusVal = (raw.status as AlarmStatus) || (gov.status as AlarmStatus)

  return {
    id: raw.id || raw.alarm_id || `${raw.device_id || ''}_${channelId}_${raw.timestamp_ms || Date.now()}`,
    type: alarmType as AlarmType,
    level: mapSeverity(severityNum),
    category: mapCategory(alarmType, severityNum),
    description: raw.description || raw.title || ALARM_TYPE_CN[alarmType] || alarmType,
    channelId,
    channelName: raw.channel_name || raw.channelName || (channelId ? `通道${channelId}` : ''),
    deviceId:
      (md && typeof md === 'object' ? String(md.device_id ?? '') : '') ||
      (Array.isArray(md) && md[0] && typeof md[0] === 'object' ? String(md[0].device_id ?? '') : '') ||
      raw.device_id || raw.deviceId || raw.channel_id || '',
    deviceName: raw.device_name || raw.deviceName || raw.zone || '',
    snapshotUrl: toAbsoluteUrl(raw.snapshot_url || raw.snapshotUrl || raw.snapshot_path),
    videoClipUrl: toAbsoluteUrl(raw.video_clip_url || raw.videoClipUrl),
    aiConclusion: raw.ai_conclusion || raw.aiConclusion || raw.ai_analysis || raw.aiAnalysis || '',
    confidence: Number(raw.confidence ?? raw.ai_confidence ?? raw.aiConfidence ?? 0),
    // [加油站三期 2026-08-30 EHS 闭环] status 双源: 后端顶层字段优先,
    //    兜底工单状态机回填的 metadata 治理字段 (handleAlarm 持久化 →
    //    getRecentAlarmsPaged SELECT 回填数组首元素), 未处理保持 'unhandled'
    status: rawStatusVal === 'new' ? 'unhandled' : (rawStatusVal || 'unhandled'),
    location: raw.location || raw.location_name || raw.zone || '',
    metadata: {
      bbox: raw.bbox || [],
      targetLabel: raw.target_label || raw.targetLabel || '',
      // 🆕 v6.3: 多类别检测元数据（后端 AlarmLabels 注入 + 前端透传）
      objectCategory: raw.object_category || raw.objectCategory || '',
      targetLabelZh:  raw.target_label_zh || raw.targetLabelZh || '',
      targetLabelEn:  raw.target_label_en || raw.targetLabelEn || '',
      categoryZh:     raw.category_zh || raw.categoryZh || '',
      categoryEn:     raw.category_en || raw.categoryEn || '',
      regionId: raw.region_id || '',
      severityNum,
      suggestedAction: raw.suggested_action || '',
      // 🆕 v6.2: 人脸事件元数据 (透传后端 face_* metadata)
      person_id: raw.person_id || raw.metadata?.person_id,
      name: raw.name || raw.metadata?.name,
      group_type: raw.group_type || raw.metadata?.group_type,
      similarity: raw.similarity || raw.metadata?.similarity,
      is_live: raw.is_live || raw.metadata?.is_live,
      liveness_score: raw.liveness_score || raw.metadata?.liveness_score,
      quality_score: raw.quality_score || raw.metadata?.quality_score,
      face_box: raw.face_box || raw.metadata?.face_box,
      algo_id: raw.algo_id || gov.algo_id,
      snapshot_base64: raw.snapshot_base64 || raw.metadata?.snapshot_base64,
      snapshot_format: raw.snapshot_format || raw.metadata?.snapshot_format,
      // [加油站三期 2026-08-30] 治理字段显式透出 (EHS 闭环指标数据源):
      //   acked_at/resolved_at/closed_at + track_id 等原始字段随 gov 展开
      //   (原直接展开 raw.metadata, 数组形态会展开为索引键导致字段丢失)
      acked_at: gov.acked_at,
      resolved_at: gov.resolved_at,
      closed_at: gov.closed_at,
      ...gov,
    },
    // [Fix 2026-06-24] 支持 raw.timestamp 字段（后端实际返回的时间戳字段名）
    //   优先级: created_at > createdAt > timestamp > timestamp_ms > 当前时间
    createdAt: raw.created_at || raw.createdAt
      || (typeof raw.timestamp === 'number' ? new Date(raw.timestamp).toISOString() : '')
      || (typeof raw.timestamp_ms === 'number' ? new Date(raw.timestamp_ms).toISOString() : '')
      || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || raw.created_at || raw.createdAt
      || (typeof raw.timestamp === 'number' ? new Date(raw.timestamp).toISOString() : new Date().toISOString()),
    handledBy: raw.handled_by || raw.handledBy || '',
    handledAt: raw.handled_at || raw.handledAt || '',
    handleNote: raw.handle_note || raw.handleNote || '',
  }
}