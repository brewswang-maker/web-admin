/**
 * 全局告警 WebSocket 管理（单例模式）
 *
 * 不依赖组件生命周期，由 App.vue 在 onMounted 时调用 start() 启动。
 * 负责：
 *   1. 维持 WebSocket 长连接
 *   2. 将告警推送至 alarmStore（realtimeAlarms + unhandledCount）
 *   3. 弹出海康风格报警弹窗（通过 useAlarmPopup，防抖 10 秒/同类型同通道）
 */
import { ref } from 'vue'
import { useAlarmStore } from '@/stores/alarm'
import { showAlarmPopup, pushLinkageLog, normalizeAlarmPayload } from './useAlarmPopup'

// ── 单例状态（模块级，不随组件销毁） ──

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const maxReconnectAttempts = 10
const reconnectDelay = 3000
const THROTTLE_MS = 10_000

export const connected = ref(false)

/** 防抖：同 alarm_type + channel_id 在 THROTTLE_MS 内只弹一次 */
const lastPopupTime = new Map<string, number>()

let started = false

// ── 告警类型中文映射 ──
const alarmTypeCn: Record<string, string> = {
  person_detected: '人员检测',
  intrusion: '入侵检测',
  fire: '烟火检测',
  smoke: '烟雾检测',
  fall: '倒地检测',
  violence: '打架检测',
  loitering: '徘徊检测',
  gathering: '聚集检测',
  vehicle_detected: '车辆检测',
  object_detected: '物体检测',
  face_blacklist: '黑名单告警',
  gb28181_alarm: '设备告警',
}

// ── 内部方法 ──

function attemptReconnect() {
  if (reconnectAttempts >= maxReconnectAttempts) return
  reconnectAttempts++
  const delay = reconnectDelay * reconnectAttempts
  reconnectTimer = setTimeout(() => doConnect(), delay)
}

function doConnect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${window.location.host}/ws`

  ws = new WebSocket(url)

  ws.onopen = () => {
    connected.value = true
    reconnectAttempts = 0
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      // 兼容 msg.data (pushSystemEvent) / msg.alarm (pushAlarm)
      const payload = msg.data ?? msg.alarm ?? msg

      // 处理告警类型消息（兼容所有后端推送类型）
      // alarm.new: WebSocketServer.pushAlarm 直接推送
      // alarm: 通用告警类型
      // linkage_alarm: LinkageEngine WEB_POPUP 动作推送
      // dashboard_alert: Dashboard 告警嵌入
      if (msg.type === 'alarm' || msg.type === 'alarm.new' ||
          msg.type === 'linkage_alarm' || msg.type === 'dashboard_alert') {
        handleAlarm(payload)
      }

      // 处理联动动作状态消息（实时更新弹窗联动状态）
      if (msg.type === 'system.linkage_action' && payload) {
        pushLinkageLog({
          action: payload.action || '',
          status: payload.status || 'running',
          icon: getActionIcon(payload.action),
          text: getActionText(payload),
        })
      }
    } catch {
      // 忽略非 JSON 消息
    }
  }

  ws.onclose = () => {
    connected.value = false
    attemptReconnect()
  }

  ws.onerror = () => {
    // onclose 会处理重连
  }
}

function handleAlarm(alarm: any) {
  if (!alarm) return

  // 1. 推入 alarmStore（更新 realtimeAlarms + unhandledCount）
  try {
    const alarmStore = useAlarmStore()
    // 关键: WS 推过来的原始 payload 没有 status/normalized 字段, 必须先 normalize,
    // 否则 useAlarmPopup 的 alarmQueue.filter(a => a.status === 'unhandled') 永远空.
    const normalized = normalizeAlarmPayload(alarm)
    alarmStore.pushRealtimeAlarm(normalized)
  } catch {
    // Store 未初始化时忽略
  }

  // 2. 防抖弹窗
  const alarmType = alarm.alarm_type || alarm.type || 'unknown'
  const channelId = alarm.channel_id ?? alarm.channel ?? ''
  const throttleKey = `${alarmType}_${channelId}`
  const now = Date.now()

  if (lastPopupTime.has(throttleKey) && now - lastPopupTime.get(throttleKey)! < THROTTLE_MS) {
    return // 10 秒内同类型同通道不重复弹窗
  }
  lastPopupTime.set(throttleKey, now)

  // 3. 弹出海康风格报警弹窗
  showAlarmPopup(alarm)
}

// ── 联动动作图标映射 ──
function getActionIcon(action: string): string {
  const icons: Record<string, string> = {
    show_live: '📹', show_playback: '📼', show_image: '📸',
    play_tone: '🔊', tts_broadcast: '📢', capture_image: '📸',
    record_event: '📼', popup: '🔔',
  }
  return icons[action] || '🔗'
}

function getActionText(payload: any): string {
  const action = payload.action || ''
  const labels: Record<string, string> = {
    show_live: '弹出实时视频', show_playback: '弹出录像回放', show_image: '弹出事件图片',
    play_tone: '播放提示音', tts_broadcast: '语音播报', capture_image: '自动抓图',
    record_event: '事件录像', popup: '弹窗通知',
  }
  return labels[action] || action
}

// ── 公开 API ──

/** 启动全局告警 WebSocket（由 App.vue onMounted 调用） */
export function startGlobalAlarm() {
  if (started) return
  started = true
  doConnect()
}

/** 停止全局告警 WebSocket（由 App.vue onUnmounted 调用） */
export function stopGlobalAlarm() {
  started = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.onclose = null // 防止触发重连
    ws.close()
    ws = null
  }
  connected.value = false
  lastPopupTime.clear()
}
