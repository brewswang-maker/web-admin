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
import { settingsApi } from '@/api/settings'
import { showAlarmPopup, pushLinkageLog, normalizeAlarmPayload, playAlarmSound } from './useAlarmPopup'

// ── 单例状态（模块级，不随组件销毁） ──

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const maxReconnectAttempts = 10
const reconnectDelay = 3000

export const connected = ref(false)

let started = false

// ── 报警弹窗防抖（参考主流安防厂商：TP-LINK 30s, 海康可配置, 小米 3-10min） ──
// 同一通道 + 同一告警类型在窗口内只弹一次弹窗，告警仍然入库
// 值从后端 /settings/alarm-policy 动态加载，默认 30 秒
let popupDebounceMs = 30_000
const lastPopupTime = new Map<string, number>()  // key: "channelId:alarmType" → timestamp

async function loadAlarmConfig() {
  try {
    const { data: res } = await settingsApi.getAlarmPolicy()
    const d = res?.data
    if (d?.dedupWindow) {
      popupDebounceMs = d.dedupWindow * 1000  // 秒 → 毫秒
      console.log('[useGlobalAlarm] popup debounce loaded:', d.dedupWindow, 's')
    }
  } catch { /* 使用默认值 */ }
}

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
    console.log('[useGlobalAlarm] WS connected to', url)
    connected.value = true
    reconnectAttempts = 0
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      // 兼容 msg.data (pushSystemEvent) / msg.alarm (pushAlarm)
      const payload = msg.data ?? msg.alarm ?? msg
      console.log('[useGlobalAlarm] WS msg type:', msg.type, '| keys:', Object.keys(msg).join(','))

      // 处理告警类型消息（兼容所有后端推送类型）
      // alarm.new: WebSocketServer.pushAlarm 直接推送
      // alarm: 通用告警类型
      // linkage_alarm: LinkageEngine WEB_POPUP 动作推送
      // dashboard_alert: Dashboard 告警嵌入
      // system.dashboard_alert / system.alarm: pushSystemEvent 路径
      if (msg.type === 'alarm' || msg.type === 'alarm.new' ||
          msg.type === 'linkage_alarm' || msg.type === 'dashboard_alert' ||
          msg.type === 'system.dashboard_alert' || msg.type === 'system.alarm') {
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

        // 录像完成后更新当前告警的 videoClipUrl
        // - 更新 alarmStore.realtimeAlarms (供弹窗使用)
        // - 派发 CustomEvent 让 AlarmsView 自己更新其 alarms[] 数组
        if (payload.action === 'record_complete' && payload.video_clip_url) {
          try {
            const store = useAlarmStore()
            const idx = store.realtimeAlarms.findIndex(a => a.id === payload.alarm_id)
            if (idx >= 0) store.realtimeAlarms[idx].videoClipUrl = payload.video_clip_url
          } catch { /* store not ready */ }
          // 通知 AlarmsView (它维护自己的 alarms 数组, 不会自动同步 store.realtimeAlarms)
          window.dispatchEvent(new CustomEvent('alarm-clip-updated', {
            detail: { alarmId: payload.alarm_id, videoClipUrl: payload.video_clip_url },
          }))
        }

        // 播放提示音
        if (payload.action === 'play_tone' && payload.status === 'completed') {
          playAlarmSound()
        }

        // TTS 语音播报 - 修复: 增加错误处理和用户交互检查
        if (payload.action === 'tts_broadcast' && payload.status === 'completed') {
          const text = payload.text || payload.tts_text || payload.description || ''
          if (text) {
            // 检查浏览器是否支持语音合成
            if ('speechSynthesis' in window) {
              // 取消当前正在播放的语音
              window.speechSynthesis.cancel()

              const utterance = new SpeechSynthesisUtterance(text)
              utterance.lang = 'zh-CN'  // 中文
              utterance.rate = 1.0
              utterance.volume = 1.0
              utterance.pitch = 1.0

              // 错误处理
              utterance.onerror = (e) => {
                console.warn('[useGlobalAlarm] TTS 播放失败:', e)
              }

              utterance.onstart = () => {
                console.log('[useGlobalAlarm] TTS 开始播放:', text.substring(0, 50))
              }

              // 尝试播放（可能需要用户交互 — App.vue 已注册首次交互解锁）
              try {
                window.speechSynthesis.speak(utterance)
              } catch (e) {
                console.warn('[useGlobalAlarm] TTS speak() 异常:', e)
              }
            } else {
              console.warn('[useGlobalAlarm] 浏览器不支持 SpeechSynthesis')
            }
          }
        }
      }
    } catch {
      // 忽略非 JSON 消息
    }
  }

  ws.onclose = () => {
    console.warn('[useGlobalAlarm] WS closed, will attempt reconnect #' + (reconnectAttempts + 1))
    connected.value = false
    attemptReconnect()
  }

  ws.onerror = (e) => {
    console.error('[useGlobalAlarm] WS error:', e)
  }
}

function handleAlarm(alarm: any) {
  if (!alarm) {
    console.warn('[useGlobalAlarm] handleAlarm called with null payload')
    return
  }
  try {
    console.log('[useGlobalAlarm] handleAlarm type:', alarm.alarm_type || alarm.type, 'ch:', alarm.channel_id || alarm.channelId)

    // 1. 规整: WS 推过来的原始 payload 字段是 snake_case, 前端需要驼峰 + status='unhandled'
    const normalized = normalizeAlarmPayload(alarm)
    console.log('[useGlobalAlarm] normalized alarm:', normalized.id, 'type:', normalized.type)

    // 2. 推入 alarmStore（更新 realtimeAlarms + unhandledCount）
    try {
      const alarmStore = useAlarmStore()
      alarmStore.pushRealtimeAlarm(normalized)
    } catch (e) {
      console.warn('[useGlobalAlarm] pushRealtimeAlarm failed:', e)
    }

    // 3. 弹窗防抖: 同一通道+同一类型在 POPUP_DEBOUNCE_MS 内不重复弹窗
    //    (参考: TP-LINK 30s / 海康可配置 / 小米 3-10min)
    const debounceKey = `${normalized.channelId || ''}:${normalized.type || ''}`
    const now = Date.now()
    const lastTime = lastPopupTime.get(debounceKey) || 0
    if (now - lastTime < popupDebounceMs) {
      console.log('[useGlobalAlarm] popup debounced, key:', debounceKey,
        'elapsed:', Math.round((now - lastTime) / 1000) + 's')
    } else {
      lastPopupTime.set(debounceKey, now)
      showAlarmPopup(normalized)
    }

    // 4. 每条告警都播报 TTS（不依赖联动规则的 tts_broadcast 动作）
    speakAlarm(normalized)
  } catch (e) {
    console.error('[useGlobalAlarm] handleAlarm exception:', e)
  }
}

// ── 告警 TTS 播报（每条告警都触发，不依赖联动动作） ──
let ttsResumeTimer: ReturnType<typeof setInterval> | null = null

function speakAlarm(alarm: any) {
  if (!('speechSynthesis' in window)) return
  const desc = alarm?.description || alarmTypeCn[alarm?.type] || '告警'
  const where = alarm?.channelName || alarm?.location || ''
  const text = where ? `${desc}，${where}` : desc

  // 清除上次的 resume 定时器
  if (ttsResumeTimer) { clearInterval(ttsResumeTimer); ttsResumeTimer = null }

  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'; u.rate = 1.1; u.volume = 1.0
  u.onerror = (e) => {
    console.warn('[useGlobalAlarm] TTS 播放失败:', e)
    if (ttsResumeTimer) { clearInterval(ttsResumeTimer); ttsResumeTimer = null }
  }
  u.onend = () => {
    if (ttsResumeTimer) { clearInterval(ttsResumeTimer); ttsResumeTimer = null }
  }

  try {
    window.speechSynthesis.speak(u)
    // Chrome bug workaround: speechSynthesis 在 ~15s 后自动暂停，
    // 定时调用 resume() 保持播放
    ttsResumeTimer = setInterval(() => {
      if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      } else if (!window.speechSynthesis.speaking) {
        clearInterval(ttsResumeTimer!)
        ttsResumeTimer = null
      }
    }, 10000)
  } catch {}
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
  if (started) {
    console.log('[useGlobalAlarm] already started, skipping')
    return
  }
  started = true
  console.log('[useGlobalAlarm] starting WS connection...')
  loadAlarmConfig()  // 异步加载弹窗防抖配置
  doConnect()
}

/** 停止全局告警 WebSocket（由 App.vue onUnmounted 调用） */
export function stopGlobalAlarm() {
  started = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ttsResumeTimer) {
    clearInterval(ttsResumeTimer)
    ttsResumeTimer = null
  }
  if (ws) {
    ws.onclose = null // 防止触发重连
    ws.close()
    ws = null
  }
  connected.value = false
  lastPopupTime.clear()
}
