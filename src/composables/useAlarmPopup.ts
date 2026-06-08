/**
 * 全局告警弹窗管理（单例模式）
 *
 * composable: useAlarmPopup
 * 职责:
 *   1. 管理弹窗可见性、当前告警、告警队列
 *   2. WS 数据字段适配 (snake_case → camelCase)
 *   3. 查询匹配的联动规则 → 决定弹窗 Tab 和操作按钮
 *   4. 追踪联动执行状态（WS linkage_action 消息）
 *   5. 报警音效播放
 */
import { ref, computed } from 'vue'
import { useAlarmStore } from '@/stores/alarm'
import { linkageApi, ACTION_TYPE_MAP } from '@/api/linkage'
import type { LinkageRule, LinkageAction } from '@/api/linkage'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'

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
  ppe: '安全帽检测',
  crowd: '人群密度',
  plate: '车牌识别',
}

// ── 联动动作 → Tab/按钮 映射 ──
const WEB_SHOW_LIVE = ACTION_TYPE_MAP.WEB_SHOW_LIVE         // 210
const WEB_SHOW_PLAYBACK = ACTION_TYPE_MAP.WEB_SHOW_PLAYBACK // 211
const WEB_SHOW_IMAGE = ACTION_TYPE_MAP.WEB_SHOW_IMAGE       // 212
const WEB_PLAY_TONE = ACTION_TYPE_MAP.WEB_PLAY_TONE         // 213
const WEB_TTS_BROADCAST = ACTION_TYPE_MAP.WEB_TTS_BROADCAST // 214
const WEB_CAPTURE_IMAGE = ACTION_TYPE_MAP.WEB_CAPTURE_IMAGE // 215
const WEB_RECORD_EVENT = ACTION_TYPE_MAP.WEB_RECORD_EVENT   // 217
const WEB_POPUP = ACTION_TYPE_MAP.WEB_POPUP                 // 200
const CLIENT_VOICE_TALK = ACTION_TYPE_MAP.CLIENT_VOICE_TALK         // 103
const CLIENT_PTZ_CONTROL = ACTION_TYPE_MAP.CLIENT_PTZ_CONTROL       // 116
const CLIENT_ALARM_OUTPUT = ACTION_TYPE_MAP.CLIENT_ALARM_OUTPUT     // 115
const CLIENT_TTS_BROADCAST = ACTION_TYPE_MAP.CLIENT_TTS_BROADCAST   // 105

// ── 单例状态（模块级） ──

export const popupVisible = ref(false)
export const currentAlarm = ref<AlarmEvent | null>(null)
export const matchedRule = ref<LinkageRule | null>(null)
export const linkageLogs = ref<Array<{ action: string; status: string; icon: string; text: string }>>([])

// 告警队列（从 alarmStore.realtimeAlarms 过滤未处理）
const queueIndex = ref(0)

// 音频实例（懒加载）
let alarmAudio: HTMLAudioElement | null = null

// ── Severity 数字 → AlarmLevel 映射 ──
function mapSeverity(severity: number): AlarmLevel {
  if (severity >= 5) return 'critical'
  if (severity >= 4) return 'high'
  if (severity >= 3) return 'medium'
  return 'low'
}

// ── WS 数据适配 (snake_case → camelCase) ──
export function normalizeAlarmPayload(raw: any): AlarmEvent {
  const severityNum = raw.severity ?? raw.level ?? 2
  const alarmType = raw.alarm_type || raw.type || 'other'
  const channelId = String(raw.channel_id ?? raw.channelId ?? raw.channel ?? '')
  const ts = raw.timestamp_ms || raw.timestamp || Date.now()

  return {
    id: raw.id || raw.alarm_id || `${raw.device_id || ''}_${channelId}_${ts}`,
    type: alarmType as AlarmEvent['type'],
    level: mapSeverity(severityNum),
    description: raw.description || `${alarmTypeCn[alarmType] || alarmType}`,
    channelId,
    channelName: raw.channel_name || raw.channelName || (channelId ? `通道${channelId}` : ''),
    deviceId: raw.device_id || raw.deviceId || '',
    deviceName: raw.device_name || raw.deviceName || '',
    snapshotUrl: raw.snapshot_url || raw.snapshotUrl || '',
    videoClipUrl: raw.video_clip_url || raw.videoClipUrl || '',
    aiConclusion: raw.ai_analysis || raw.aiConclusion || raw.ai_analysis || '',
    confidence: Number(raw.confidence ?? 0),
    status: 'unhandled',
    location: raw.location_name || raw.location || raw.location_id || '',
    metadata: {
      bbox: raw.bbox || [],
      targetLabel: raw.target_label || raw.target_label || '',
      regionId: raw.region_id || '',
      severityNum,
      suggestedAction: raw.suggested_action || '',
    },
    createdAt: new Date(ts).toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ── 联动规则匹配 ──
async function findMatchingRule(alarm: AlarmEvent): Promise<LinkageRule | null> {
  try {
    const { data: res } = await linkageApi.getRules({ pageSize: 200 })
    const rules = (res?.data?.items ?? res?.data ?? []) as LinkageRule[]
    const alarmType = alarm.type
    const chId = Number(alarm.channelId) || 0
    const severity = (alarm.metadata?.severityNum as number) ?? 2
    const confidence = alarm.confidence

    // 按 priority 降序排列
    const sorted = [...rules]
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority)

    for (const rule of sorted) {
      const src = rule.source_cond
      // 事件类型匹配
      if (src.event_types?.length) {
        const typeMatch = src.event_types.some(t =>
          t === alarmType ||
          alarmType.includes(t) ||
          t.includes(alarmType)
        )
        if (!typeMatch) continue
      }
      // 通道匹配
      if (src.channel_ids?.length && !src.channel_ids.includes(chId)) continue
      // 严重度匹配
      if (severity < src.min_severity) continue
      // 置信度匹配
      if (confidence < src.min_confidence) continue

      return rule // 首个匹配的规则
    }
    return null
  } catch (e) {
    console.warn('[useAlarmPopup] findMatchingRule failed:', e)
    return null
  }
}

// ── 判断规则是否包含指定动作类型 ──
function hasActionType(rule: LinkageRule | null, actionType: number): boolean {
  if (!rule) return false
  return rule.actions.some(a => a.enabled && a.type === actionType)
}

export function hasAction(actionName: string): boolean {
  const typeId = ACTION_TYPE_MAP[actionName as keyof typeof ACTION_TYPE_MAP]
  if (typeId === undefined) return false
  return hasActionType(matchedRule.value, typeId)
}

export const hasAnyMediaAction = computed(() => {
  return hasAction('WEB_SHOW_LIVE') || hasAction('WEB_SHOW_PLAYBACK') ||
         hasAction('WEB_SHOW_IMAGE') || hasAction('WEB_CAPTURE_IMAGE')
})

// ── 动态 Tab 和按钮 ──
export const availableTabs = computed(() => {
  const tabs: Array<{ name: string; label: string; icon: string }> = []
  if (hasAction('WEB_SHOW_LIVE')) tabs.push({ name: 'live', label: '实时视频', icon: '📹' })
  if (hasAction('WEB_SHOW_PLAYBACK')) tabs.push({ name: 'playback', label: '录像回放', icon: '📼' })
  if (hasAction('WEB_SHOW_IMAGE') || hasAction('WEB_CAPTURE_IMAGE'))
    tabs.push({ name: 'snapshot', label: '抓图', icon: '📸' })
  // Fallback
  if (tabs.length === 0) tabs.push({ name: 'fallback', label: '告警快照', icon: '🖼️' })
  return tabs
})

export const defaultTab = computed(() => {
  // 始终优先显示实时视频（有 channelId 时）
  if (currentAlarm.value?.channelId) return 'live'
  if (hasAction('WEB_SHOW_LIVE')) return 'live'
  if (hasAction('WEB_SHOW_PLAYBACK')) return 'playback'
  return 'snapshot'
})

export const dynamicButtons = computed(() => {
  const btns: Array<{ key: string; label: string; icon: string; action: string }> = []
  if (hasAction('CLIENT_VOICE_TALK'))
    btns.push({ key: 'talk', label: '对讲', icon: '🎙️', action: 'talk' })
  if (hasAction('CLIENT_PTZ_CONTROL'))
    btns.push({ key: 'ptz', label: 'PTZ', icon: '🎯', action: 'ptz' })
  if (hasAction('CLIENT_ALARM_OUTPUT'))
    btns.push({ key: 'alarm_out', label: '声光', icon: '🔔', action: 'alarm_output' })
  if (hasAction('WEB_RECORD_EVENT'))
    btns.push({ key: 'record', label: '录像', icon: '📼', action: 'record' })
  if (hasAction('WEB_CAPTURE_IMAGE'))
    btns.push({ key: 'capture', label: '抓图', icon: '📸', action: 'capture' })
  return btns
})

// ── 告警队列管理 ──
const alarmQueue = computed(() => {
  try {
    const store = useAlarmStore()
    return store.realtimeAlarms.filter(a => a.status === 'unhandled')
  } catch {
    return []
  }
})

export const queueInfo = computed(() => ({
  current: queueIndex.value + 1,
  total: alarmQueue.value.length,
}))

export function nextAlarm() {
  if (queueIndex.value < alarmQueue.value.length - 1) {
    queueIndex.value++
    currentAlarm.value = alarmQueue.value[queueIndex.value]
    linkageLogs.value = []
    // 不重新查询规则（同一批告警通常匹配同一规则）
  }
}

export function prevAlarm() {
  if (queueIndex.value > 0) {
    queueIndex.value--
    currentAlarm.value = alarmQueue.value[queueIndex.value]
    linkageLogs.value = []
  }
}

// ── 处警操作 ──
export async function handleAlarm(action: 'confirmed' | 'false_alarm' | 'forwarded' | 'ignored', note?: string) {
  if (!currentAlarm.value) return
  try {
    const store = useAlarmStore()
    await store.handleAlarm(currentAlarm.value.id, { status: action, note })
    // 跳到下一条或关闭
    if (queueIndex.value < alarmQueue.value.length - 1) {
      nextAlarm()
    } else {
      closePopup()
    }
  } catch (e) {
    console.error('[useAlarmPopup] handleAlarm failed:', e)
  }
}

// ── 音效 ──
let audioUnlocked = false
function ensureAudioUnlock() {
  if (audioUnlocked) return
  audioUnlocked = true
  if (!alarmAudio) {
    alarmAudio = new Audio('/audio/alarm.m4a')
    alarmAudio.volume = 0.6
  }
  const unlock = () => {
    alarmAudio!.play().then(() => {
      alarmAudio!.pause()
      alarmAudio!.currentTime = 0
    }).catch(() => {})
    document.removeEventListener('click', unlock)
    document.removeEventListener('keydown', unlock)
  }
  document.addEventListener('click', unlock)
  document.addEventListener('keydown', unlock)
}

export function playAlarmSound() {
  try {
    ensureAudioUnlock()
    if (!alarmAudio) {
      alarmAudio = new Audio('/audio/alarm.m4a')
      alarmAudio.volume = 0.6
    }
    alarmAudio.currentTime = 0
    alarmAudio.play().catch(() => {})
  } catch { /* 静默 */ }
}

// ── 联动执行状态更新（被 useGlobalAlarm WS 消息调用） ──
export function pushLinkageLog(log: { action: string; status: string; icon?: string; text?: string }) {
  linkageLogs.value.push({
    action: log.action,
    status: log.status || 'running',
    icon: log.icon || '🔗',
    text: log.text || log.action,
  })
}

// ── 核心入口：弹出告警弹窗 ──
export async function showAlarmPopup(rawAlarm: any) {
  if (!rawAlarm) return

  // 1. 数据适配
  const alarm = normalizeAlarmPayload(rawAlarm)

  // 2. 先更新状态 + 打开弹窗（用户立即看到，不被下游 await 阻塞）
  currentAlarm.value = alarm
  linkageLogs.value = []
  queueIndex.value = 0
  if (!popupVisible.value) {
    popupVisible.value = true
  }

  // 3. 音效
  playAlarmSound()

  // 4. 异步查询联动规则（弹窗已开，匹配结果后续填入；失败不阻塞弹窗）
  try {
    const rule = await findMatchingRule(alarm)
    matchedRule.value = rule
  } catch {
    matchedRule.value = null
  }
}

// ── 关闭弹窗 ──
export function closePopup() {
  popupVisible.value = false
  // 延迟清理，等 transition 结束
  setTimeout(() => {
    currentAlarm.value = null
    matchedRule.value = null
    linkageLogs.value = []
  }, 300)
}
