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
import { ElMessage } from 'element-plus'
import { useAlarmStore } from '@/stores/alarm'
import { linkageApi, ACTION_TYPE_MAP } from '@/api/linkage'
import { alarmApi } from '@/api/alarm'
import type { LinkageRule, LinkageAction } from '@/api/linkage'
import type { AlarmEvent } from '@/types/alarm'
import { normalizeAlarmCore, ALARM_CATEGORY } from '@/types/alarm'

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
let audioUnlockCleanup: (() => void) | null = null

// 联动规则缓存
let cachedRules: LinkageRule[] | null = null
let ruleCacheTime = 0
const RULE_CACHE_TTL_MS = 30000

// ── WS 数据适配 (snake_case → camelCase) ──
// 委派给 types/alarm.ts 的统一实现 normalizeAlarmCore,
// 避免与 AlarmsView.vue / stores/alarm.ts 三处各自实现漂移
// [vp6-P1.3 2026-09-01] metadata 原始形态解包: REST 链落库为 JSON 字符串,
// GB28181 既有告警存在数组形态 (治理字段注入首元素) — 与 types/alarm.ts gov
// 解包语义对齐, 字符串 parse / 数组取首元素 / 对象直用。
function unpackRawMetadata(md: unknown): Record<string, unknown> {
  if (typeof md === 'string') {
    try { return JSON.parse(md) as Record<string, unknown> } catch { return {} }
  }
  if (Array.isArray(md)) {
    return (md[0] && typeof md[0] === 'object' ? md[0] : {}) as Record<string, unknown>
  }
  return (md && typeof md === 'object' ? md : {}) as Record<string, unknown>
}

export function normalizeAlarmPayload(raw: any): AlarmEvent {
  const n = normalizeAlarmCore(raw)
  // [vp6-P1.3 2026-09-01] 兜底合并原始 metadata: normalizeAlarmCore 白名单重建只取
  //   顶层 raw.bbox/target_label, metadata 内的 detections/class_name (检测直报链
  //   person_detected 等, 原图像素坐标) 等原始键被丢弃 → 弹窗快照标注兜底链断。
  //   原始键保留 (camel 标准键优先), AlarmPopup 据此回退 detections 提取标注框。
  n.metadata = { ...unpackRawMetadata(raw?.metadata), ...n.metadata } as typeof n.metadata
  return n
}

// ── 时间条件检查 (与后端 matchTimeConditionWithCtx 逻辑一致) ──
function checkTimeCondition(rule: LinkageRule): boolean {
  const tc = rule.time_cond
  if (!tc) return true // 无时间条件 = 始终匹配
  if (!tc.time_start && !tc.time_end && !(tc.weekdays?.length) && !(tc.monthdays?.length)) return true

  const now = new Date()
  // 星期: JS getDay() 返回 0=Sunday..6=Saturday, 需转换为 1=Monday..7=Sunday
  const wday = now.getDay() === 0 ? 7 : now.getDay()
  const mday = now.getDate()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // 星期过滤
  if (tc.weekdays?.length && !tc.weekdays.includes(wday)) return false
  // 每月日期过滤
  if (tc.monthdays?.length && !tc.monthdays.includes(mday)) return false
  // 时间段过滤
  if (tc.time_start && tc.time_end) {
    const [sh, sm] = tc.time_start.split(':').map(Number)
    const [eh, em] = tc.time_end.split(':').map(Number)
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    if (startMin <= endMin) {
      if (nowMinutes < startMin || nowMinutes > endMin) return false
    } else {
      // 跨天逻辑 (e.g. 22:00-06:00)
      if (nowMinutes < startMin && nowMinutes > endMin) return false
    }
  }
  return true
}

// ── 联动规则匹配 ──
// [规则驱动弹窗 2026-09-01] 导出供 useGlobalAlarm 弹窗前置门槛复用
export async function findMatchingRule(alarm: AlarmEvent): Promise<LinkageRule | null> {
  try {
    const now = Date.now()
    if (!cachedRules || now - ruleCacheTime > RULE_CACHE_TTL_MS) {
      const { data: res } = await linkageApi.getRules({ pageSize: 200 })
      cachedRules = (res?.data?.items ?? res?.data ?? []) as LinkageRule[]
      ruleCacheTime = now
    }
    const rules = cachedRules
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
      // 时间条件匹配 (与后端 LinkageEngine 一致)
      if (!checkTimeCondition(rule)) {
        console.log('[useAlarmPopup] Rule skipped by time condition:', rule.name,
          'time_cond:', rule.time_cond)
        continue
      }

      return rule // 首个匹配的规则
    }
    return null
  } catch (e) {
    console.warn('[useAlarmPopup] findMatchingRule failed:', e)
    // 失败时尝试使用缓存
    if (cachedRules) {
      const alarmType = alarm.type
      const chId = Number(alarm.channelId) || 0
      const severity = (alarm.metadata?.severityNum as number) ?? 2
      const confidence = alarm.confidence
      const sorted = [...cachedRules]
        .filter(r => r.enabled)
        .sort((a, b) => b.priority - a.priority)
      for (const rule of sorted) {
        const src = rule.source_cond
        if (src.event_types?.length) {
          const typeMatch = src.event_types.some(t =>
            t === alarmType || alarmType.includes(t) || t.includes(alarmType)
          )
          if (!typeMatch) continue
        }
        if (src.channel_ids?.length && !src.channel_ids.includes(chId)) continue
        if (severity < src.min_severity) continue
        if (confidence < src.min_confidence) continue
        if (!checkTimeCondition(rule)) continue
        return rule
      }
    }
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

// ── 音效（修复：解锁失败时不设置 audioUnlocked） ──
let audioUnlocked = false
function ensureAudioUnlock() {
  if (audioUnlocked) return
  // 先清理旧的监听器（防止重复调用时泄漏）
  audioUnlockCleanup?.()
  // 尝试解锁音频上下文（需要用户交互）
  if (!alarmAudio) {
    alarmAudio = new Audio('/audio/alarm.wav')
    alarmAudio.volume = 0.6
    alarmAudio.load()
  }
  const unlock = () => {
    if (!alarmAudio) return
    alarmAudio.play().then(() => {
      alarmAudio!.pause()
      alarmAudio!.currentTime = 0
      audioUnlocked = true
    }).catch((e) => {
      console.warn('[useAlarmPopup] 音频解锁失败（需要用户交互）:', e)
    }).finally(() => {
      // 确保无论成功失败都清理监听器
      audioUnlockCleanup?.()
    })
  }
  // 清理函数：移除所有监听器
  audioUnlockCleanup = () => {
    document.removeEventListener('click', unlock)
    document.removeEventListener('keydown', unlock)
    audioUnlockCleanup = null
  }
  document.addEventListener('click', unlock)
  document.addEventListener('keydown', unlock)
}

/**
 * [FIX 2026-06-28] 播放报警音效 —— 按告警类型区分是否播放
 * - ALARM 类 (face_blacklist / face_stranger / intrusion / fire 等): 播放报警音
 * - BUSINESS / NOTIFICATION 类 (face_detected / object_detected / face_pass_*): 不播放报警音
 *   (TTS 语音播报已由 speakAlarm 处理, 无需额外报警音)
 */
export function playAlarmSound(alarmType?: string) {
  // 告警类型分类: 只有 ALARM 类才播放报警音
  if (alarmType) {
    const category = ALARM_CATEGORY[alarmType]
    if (category && category !== 'alarm') {
      console.log('[useAlarmPopup] skip alarm sound for non-alarm category:', alarmType, '→', category)
      return
    }
  }
  try {
    ensureAudioUnlock()
    if (!alarmAudio) {
      alarmAudio = new Audio('/audio/alarm.wav')
      alarmAudio.volume = 0.6
    }
    alarmAudio.currentTime = 0
    alarmAudio.play().catch((e) => {
      console.warn('[useAlarmPopup] 报警音效播放失败:', e?.message || e)
    })
  } catch (e) {
    console.warn('[useAlarmPopup] playAlarmSound 异常:', e)
  }
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

  // 取消待执行的关闭定时器，防止新告警被旧 300ms 定时器清除
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }

  console.log('[useAlarmPopup] showAlarmPopup called, id:', rawAlarm.id || rawAlarm.alarm_id, 'type:', rawAlarm.type || rawAlarm.alarm_type)

  // 1. 数据适配
  const alarm = normalizeAlarmPayload(rawAlarm)
  console.log('[useAlarmPopup] normalized alarm:', {
    id: alarm.id,
    type: alarm.type,
    channelId: alarm.channelId,
    snapshotUrl: alarm.snapshotUrl,
    videoClipUrl: alarm.videoClipUrl,
    rawSnapshotUrl: rawAlarm.snapshot_url || rawAlarm.snapshotUrl || rawAlarm.snapshot_path,
  })

  // 2. 先更新状态 + 打开弹窗
  //    [FIX 2026-06-28] 优先级防覆盖: 如果当前弹窗是 critical/high，
  //    新告警优先级更低则不覆盖 (避免黑名单弹窗被 object_detected 覆盖)
  const HIGH_PRIORITY: string[] = ['critical', 'high']
  if (popupVisible.value && currentAlarm.value) {
    const curIsHigh = HIGH_PRIORITY.includes(currentAlarm.value.level)
    const newIsHigh = HIGH_PRIORITY.includes(alarm.level)
    if (curIsHigh && !newIsHigh) {
      console.log('[useAlarmPopup] skip overwrite: current is high-priority, new is', alarm.level, alarm.type)
      return
    }
  }

  currentAlarm.value = alarm
  linkageLogs.value = []
  queueIndex.value = 0
  if (!popupVisible.value) {
    popupVisible.value = true
    console.log('[useAlarmPopup] popupVisible set to true, alarm:', alarm.id, 'ch:', alarm.channelId)
  } else {
    console.log('[useAlarmPopup] popup already visible, updated alarm to:', alarm.id)
  }

  // 3. 音效 —— 传入告警类型, 仅 ALARM 类播放报警音
  playAlarmSound(alarm.type)

  // 4. 异步查询联动规则（弹窗已开，匹配结果后续填入；失败不阻塞弹窗）
  try {
    const rule = await findMatchingRule(alarm)
    matchedRule.value = rule
  } catch {
    matchedRule.value = null
  }
}

// ── 关闭弹窗 ──
let closeTimer: ReturnType<typeof setTimeout> | null = null
export function closePopup() {
  popupVisible.value = false
  // 清理音频监听器
  audioUnlockCleanup?.()
  // 延迟清理，等 transition 结束
  closeTimer = setTimeout(() => {
    closeTimer = null
    currentAlarm.value = null
    matchedRule.value = null
    linkageLogs.value = []
  }, 300)
}

// ── [UX 2026-08-31] 按 ID 打开告警详情弹窗 (统一入口) ──
//   供首页态势屏/检索结果等只有告警 ID 的入口复用:
//   先 GET /alarms/:id 拉全量 (条目数据通常缺 channelId/deviceId 等),
//   再走 showAlarmPopup 完整链路 (normalize + 规则匹配 + 视频/快照/操作按钮)。
export async function openAlarmDetailById(id: string) {
  if (!id) return
  try {
    const res: any = await alarmApi.getDetail(id)
    const detail = res?.data?.data ?? res?.data ?? res
    if (!detail || (!detail.id && !detail.alarm_id)) {
      ElMessage.warning('未找到该告警的详情数据')
      return
    }
    await showAlarmPopup(detail)
  } catch (e: any) {
    console.error('[useAlarmPopup] openAlarmDetailById failed:', e)
    ElMessage.error('打开告警详情失败: ' + (e?.message || ''))
  }
}
