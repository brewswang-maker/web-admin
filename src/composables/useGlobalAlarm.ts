/**
 * 全局告警 WebSocket 管理（单例模式）
 *
 * 不依赖组件生命周期，由 App.vue 在 onMounted 时调用 start() 启动。
 * 负责：
 *   1. 维持 WebSocket 长连接
 *   2. 将告警推送至 alarmStore（realtimeAlarms + unhandledCount）
 *   3. 弹出海康风格报警弹窗（通过 useAlarmPopup，防抖 10 秒/同类型同通道）
 */
import { ref, reactive } from 'vue'
import { useAlarmStore } from '@/stores/alarm'
import { settingsApi } from '@/api/settings'
import { alarmApi } from '@/api/alarm'
import { showAlarmPopup, pushLinkageLog, normalizeAlarmPayload, playAlarmSound } from './useAlarmPopup'

// ── 单例状态（模块级，不随组件销毁） ──

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
// [FIX 2026-08-03] 重连不再设上限 (原 10 次后永久放弃, 后台标签页被节流时
//   重连窗口内全部失败 → 告警推送永久断流)。改为指数退避封顶 30s 无限重连,
//   并在页面重新可见时立即尝试恢复。
const reconnectBaseDelay = 3000
const reconnectMaxDelay = 30000

export const connected = ref(false)

// [P3-CO3] 端到端延迟监控统计
export const e2eLatencyStats = reactive({
  samples: [] as number[],  // 最近 100 个延迟采样 (ms)
  lastMs: 0,               // 最近一次延迟
  get avg() { return this.samples.length > 0 ? Math.round(this.samples.reduce((a, b) => a + b, 0) / this.samples.length) : 0 },
  get p95() {
    if (this.samples.length < 5) return 0
    const sorted = [...this.samples].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.95)]
  },
})

let started = false

// [P0-4-d 2026-08-20] WS 断线重连补拉:
//   断线期间后端推送的告警全部丢失 → 重连成功后 GET /alarms?since=<lastAlarmTs>&count=20 拉回。
//   since 为排他语义 (created_at > since, 后端 RestApiHandlers.cpp [P0-4] 参数),
//   配合前端按 id 去重 (pushRealtimeAlarm 无去重), 保证断线期间告警不缺失、不重复。
let lastAlarmTs = 0        // 最近一条实时告警的 created_at (ms), 补拉断点
let sawDisconnect = false  // 本次会话曾断线 → 重连后触发补拉
let backfilling = false

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

// ── 告警类型中文映射 (镜像 alarm.ts ALARM_TYPE_CN, 用于 TTS 播报) ──
const alarmTypeCn: Record<string, string> = {
  // 通用检测
  person_detected: '人员检测', person: '人员检测',
  vehicle_detected: '车辆检测', vehicle: '车辆检测',
  object_detected: '物体检测', object: '物体检测',
  // 人脸报警
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
  // 人脸通行
  face_pass_whitelist: '白名单通行',
  face_pass_visitor: '访客通行',
  face_pass_vip: 'VIP通行',
  face_pass_staff: '内部员工通行',
  // 人脸业务
  face_detected: '人脸检测',
  face_verified: '活体认证通过',
  face_recognized: '识别成功',
  face_unknown: '未知人员',
  // 周界行为
  intrusion: '区域入侵', tripwire: '绊线入侵', climbing: '攀高检测',
  crowd: '人群聚集', loitering: '徘徊检测',
  fall: '倒地检测', fall_detected: '倒地检测',
  running: '奔跑检测', fighting: '打架斗殴', violence: '打架斗殴',
  wrong_direction: '逆行检测', abandoned: '物品遗留',
  // 烟火环境
  fire: '烟火检测', smoke: '烟雾检测',
  // 安全合规
  ppe_violation: '安全防护违规', phone_call: '打电话检测', smoking: '吸烟检测',
  helmet_violation: '未戴安全帽', mask_violation: '未戴口罩',
  // 设备状态
  gb28181_alarm: '设备告警', camera_tamper: '视频遮挡',
  // 危险物
  weapon_detected: '危险物检测',
  // 其他
  other: '其他事件',
}

// ── 内部方法 ──

function attemptReconnect() {
  reconnectAttempts++
  const delay = Math.min(reconnectBaseDelay * Math.pow(2, reconnectAttempts - 1), reconnectMaxDelay)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => doConnect(), delay)
}

// [FIX 2026-08-03] 标签页从后台恢复时: 若连接已断, 立即重连 (不等退避定时器)
function onVisibilityChange() {
  if (document.hidden || !started) return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  reconnectAttempts = 0
  doConnect()
}

function doConnect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${window.location.host}/ws`

  ws = new WebSocket(url)

  ws.onopen = () => {
    console.log('[useGlobalAlarm] WS connected to', url)
    connected.value = true
    reconnectAttempts = 0
    // [P0-4-d] 断线后重连成功 → 补拉断线期间错过的告警
    if (sawDisconnect) {
      sawDisconnect = false
      backfillMissedAlarms()
    }
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
        // P2-5: 派发 linkage-ws-event 供 LinkageFlowDiagram 实时展示
        window.dispatchEvent(new CustomEvent('linkage-ws-event', { detail: payload }))
      }

      // [P1-CO2] 推理检测结果实时分发: 供 LiveView Canvas 叠加检测框
      // [P3-CO3] 端到端延迟监控: 计算后端推理 → 前端接收的传输延迟
      if (msg.type === 'detection_result' && payload) {
        // 计算推理结果传输延迟
        const detectTs = payload.timestamp_ms || 0
        if (detectTs > 0) {
          const e2eLatency = Date.now() - detectTs
          e2eLatencyStats.samples.push(e2eLatency)
          if (e2eLatencyStats.samples.length > 100) e2eLatencyStats.samples.shift()
          e2eLatencyStats.lastMs = e2eLatency
        }
        window.dispatchEvent(new CustomEvent('inference-detection', { detail: payload }))
      }

      // 处理联动动作状态消息（实时更新弹窗联动状态）
      // [Audit-Add] 地图联动标记: CLIENT_SHOW_MAP 动作推送的 GPS 坐标
      //   派发 CustomEvent 供 LocationTrackView / SituationScreen 地图组件监听
      if (msg.type === 'system.alarm_map_marker' && payload) {
        window.dispatchEvent(new CustomEvent('alarm-map-marker', { detail: payload }))
        console.log('[useGlobalAlarm] alarm_map_marker: dev=', payload.device_id,
                     'gps=(', payload.latitude, ',', payload.longitude, ')')
      }

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
    sawDisconnect = true   // [P0-4-d] 标记断线, 重连成功后补拉
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

    // [P0-4-d] 记录最新告警时间戳 (补拉断点; since 排他语义保证不重复拉到本条)
    const ts = Date.parse(normalized.createdAt)
    if (!Number.isNaN(ts)) lastAlarmTs = Math.max(lastAlarmTs, ts)
    else lastAlarmTs = Date.now()

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

// ── [P0-4-d 2026-08-20] WS 断线重连后补拉缺失告警 ──
//   拉回的告警逐条走 handleAlarm 复用完整链路 (normalize + store + 弹窗防抖 + TTS);
//   pushRealtimeAlarm 无去重 → 先按 id 过滤已入库的, 避免 realtimeAlarms 重复插入。
async function backfillMissedAlarms() {
  if (backfilling) return
  if (lastAlarmTs <= 0) return  // 从未收到过告警, 无断点基准 (首次连接不补拉)
  backfilling = true
  try {
    const res: any = await alarmApi.getList({ since: lastAlarmTs, count: 20 })
    const d: any = res?.data?.data ?? res?.data
    const list: any[] = Array.isArray(d?.alarms) ? d.alarms : (Array.isArray(d?.items) ? d.items : [])
    if (!list.length) return
    // 响应按 created_at DESC → 反转为时间正序, 按发生顺序处理
    list.reverse()
    let store: any
    try { store = useAlarmStore() } catch { return }
    const known = new Set(store.realtimeAlarms.map((a: any) => a.id))
    let recovered = 0
    for (const raw of list) {
      const id = raw?.alarm_id ?? raw?.id ?? ''
      if (id && known.has(id)) continue  // 断线前已收到, 跳过
      handleAlarm(raw)
      recovered++
    }
    if (recovered > 0) {
      console.log('[useGlobalAlarm] backfill recovered', recovered, 'alarm(s) since',
        new Date(lastAlarmTs).toISOString())
    }
  } catch (e) {
    console.warn('[useGlobalAlarm] backfill failed:', e)
  } finally {
    backfilling = false
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
  document.addEventListener('visibilitychange', onVisibilityChange)
  doConnect()
}

/** 停止全局告警 WebSocket（由 App.vue onUnmounted 调用） */
export function stopGlobalAlarm() {
  started = false
  document.removeEventListener('visibilitychange', onVisibilityChange)
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
