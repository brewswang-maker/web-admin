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
 *
 * [SOUND-ORIGIN 2026-09-11] 音效来源治理:
 *   showAlarmPopup(alarm, { origin }) 区分入口来源 —
 *   - 'manual' (默认): 手动入口 (列表点行/卡片/详情按钮/路由进入/规则页) 静音
 *   - 'auto': WS alarm.new 推送自动弹窗 (useGlobalAlarm) → 播音
 *   - 'linkage': 联动规则 CLIENT_PLAY_TONE 触发 → 播音
 *   旧调用点不传 origin 即默认 manual → 自动静音, 行为兼容 (自动链已显式传 auto)。
 *
 * [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭字段透传:
 *   - showAlarmPopup(options?: { autoCloseSeconds?: number })
 *   - 详情入口 (openAlarmDetailById): 不传 options, 默认永不自关
 *   - WS 推送 (useGlobalAlarm.handleAlarm): 传 rule.popup_auto_close_s, 由规则决定
 *   - 字段独立存放 (currentPopupAutoCloseS), 不污染 AlarmEvent 类型
 *
 * [POPUP-AUTOCLOSE-TEST 2026-09-03 调试钩子]
 *   URL ?popuptest=1 时挂载 window.__popupTest = { showAlarmPopup, currentPopupAutoCloseS, closePopup, normalizeAlarmPayload }
 *   供 Playwright 注入假告警验证 autoCloseSeconds 透传 + 倒计时 + 自动关闭全链路;
 *   生产默认不启用 (无 URL 参数时 window.__popupTest === undefined, 不影响 bundle 行为)。
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAlarmStore } from '@/stores/alarm'
import { linkageApi, ACTION_TYPE_MAP } from '@/api/linkage'
import { alarmApi } from '@/api/alarm'
import type { LinkageRule, LinkageAction } from '@/api/linkage'
import type { AlarmEvent, AlarmAppendLog } from '@/types/alarm'
import { normalizeAlarmCore, ALARM_CATEGORY } from '@/types/alarm'
// [FIX 2026-09-05 弹窗不显示回归] 通道 hash 契约: 与后端 LinkageEngine.cpp/
//   AlgoConfigView.loadRuleCounts 同源 (FNV-1a int32), GB 双流 _ch0 双形态参命中
import { safeChannelHash } from '@/utils/channelHash'

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
// [POPUP-AUTOCLOSE 2026-09-03] 当前弹窗的自动关闭秒数: 0=永不自动关闭 (默认),
//   >0=打开 N 秒后自动关闭 (由 WS 命中规则的 popup_auto_close_s 字段透传)
export const currentPopupAutoCloseS = ref(0)

// 告警队列（从 alarmStore.realtimeAlarms 过滤未处理）
const queueIndex = ref(0)

// 音频实例（懒加载）
let alarmAudio: HTMLAudioElement | null = null
let audioUnlockCleanup: (() => void) | null = null

// 联动规则缓存
let cachedRules: LinkageRule[] | null = null
let ruleCacheTime = 0
// [PERF Q7 2026-09-16] 规则缓存 TTL 30s→300s: nginx 日志 linkage/rules/all 全量拉取
//   365 次/窗口 top4 (30s TTL 下弹窗高频期几乎每次告警都过期重拉)。规则变更已由
//   rules.changed WS → invalidateRuleCache() 主动失效兜底 (useGlobalAlarm L217),
//   长 TTL 无一致性风险。
const RULE_CACHE_TTL_MS = 300000

/** [SSOT R2 2026-09-12] 规则缓存刷新 (抽自 findMatchingRule 内联拉取):
 *  TTL 内直用缓存; 过期/无缓存时拉 /rules/all 全量端点。
 *  @returns true=缓存可用 (命中或刚拉到); false=拉取失败 (旧缓存仍在但可能过期)
 *  消费点: findMatchingRule 主路径 + handleAlarm 双写对比打点 (拉取失败跳过比对)。 */
export async function ensureRulesLoaded(): Promise<boolean> {
  const now = Date.now()
  if (cachedRules && now - ruleCacheTime <= RULE_CACHE_TTL_MS) return true
  try {
    // [FIX F1 2026-09-11] getRules({pageSize:200}) 走分页端点, 后端 page_size
    //   钳制上限 100 → 规则超 100 条时尾部规则永远不参与弹窗门槛 (漏弹;
    //   8-31 事故同源)。改用 /rules/all 全量端点 (无分页, 字段同构)。
    const { data: res } = await linkageApi.getAllRules()
    cachedRules = ((res?.data?.items as LinkageRule[]) ?? res?.data ?? []) as LinkageRule[]
    ruleCacheTime = now
    return true
  } catch (e) {
    console.warn('[useAlarmPopup] ensureRulesLoaded failed:', e)
    return false
  }
}

/** [SSOT R2 2026-09-12] rules.changed 端到端 (P0-3): 规则变更 WS 广播 → 失效本地
 *  规则缓存, 避免 30s TTL 窗口内双写对比/兜底链用旧规则产生假分歧。 */
export function invalidateRuleCache(): void {
  cachedRules = null
  ruleCacheTime = 0
}

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
  // [A2 2026-09-14 时间语义治理 P0-B] 补推帧分类标记透传 (normalizeAlarmCore
  //   白名单重建不含该字段, 此处补挂 — 与上方 metadata 兜底同模式, 红线文件零触碰):
  //   WS backfill/backfill_ts → camel; useGlobalAlarm 据此早退不弹窗。
  if (raw?.backfill === true || raw?.backfill === 1) {
    ;(n as any).backfill = true
    const bt = Number(raw?.backfill_ts ?? raw?.backfillTs)
    if (Number.isFinite(bt) && bt > 0) (n as any).backfillTs = bt
  }
  // [EV-TRIPLE 2026-09-14] 取证补位帧标记透传 (post 帧回写, 后端
  //   AlarmService::pushAlarmUpdate 置 evidence_update): 同被 normalizeAlarmCore
  //   白名单丢弃, 此处补挂 camel — useGlobalAlarm 据此走「已开弹窗就地合并」
  //   专用分支 (非新事件, 不走弹窗判定链/不播 TTS)。
  if (raw?.evidence_update === true || raw?.evidence_update === 1) {
    ;(n as any).evidenceUpdate = true
  }
  // [FIX ws-frame-classify 2026-09-18 三方对齐] 剩余两分类标记补挂 (同 backfill/
  //   evidenceUpdate 模式, 白名单重建丢弃后此处回补): isDuplicate (去重/聚合帧,
  //   store 兜底判定用) + eventPhase (start/update/end 生命周期相位, update|end
  //   =状态同步帧) — 语义定义见 useAlarmTableHelpers.isAlarmStateSyncFrame 注释。
  if (raw?.is_duplicate === true || raw?.is_duplicate === 1) {
    ;(n as any).isDuplicate = true
  }
  const phase = String(raw?.event_phase ?? raw?.eventPhase ?? '')
  if (phase === 'update' || phase === 'end' || phase === 'start') {
    ;(n as any).eventPhase = phase
  }
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
// [FIX tsc 2026-09-07] normMinConf 提升为模块级 (原定义在首个匹配分支内,
//   第二分支 (cachedRules 缓存链) L215 引用不到 → TS2304; 纯函数无状态提升零风险)
const normMinConf = (mc: number) => (mc > 1 ? mc / 100 : mc)
// [规则驱动弹窗 2026-09-01] 导出供 useGlobalAlarm 弹窗前置门槛复用
// [CID-P2 2026-09-17] channel_ids string 化后的前端匹配口径 (与后端 chanStrIdListMatches
//   /chanStrListMatches 同域): 规则条目 ① 事件全串/基码直比 ② 条目 FNV hash ∈ 事件
//   hash 集 ③ 纯数字串 stamp 直取数值比对 (channelEntryProjCandidates 直取分支,
//   老 hash 形态存量/数字通道兼容), 双形态家族失配结构性消除。
function channelEntryHit(entries: string[] | undefined, evFull: string, evBase: string, evHashes: Set<number>): boolean {
  if (!entries?.length) return true
  for (const raw of entries) {
    const c = String(raw ?? '').trim()
    if (!c) continue
    // [FIX g1-zero-sentinel 2026-09-19] 与后端 chanStrIdListMatches 对齐:
    //   数值 0 条目 = 无信息哨兵 (channelEntryProjCandidates 剔除 proj=0, 事件侧
    //   channelIdCandidates 剔除 0 候选) → 永不匹配任何事件 (含空通道事件)。
    //   防双实现劈叉 (fixture G1 帧 3 空串事件不得命中 "0" 条目)。
    if (/^-?\d+$/.test(c) && Number(c) === 0) continue
    if (c === evFull || c === evBase) return true
    if (evHashes.has(safeChannelHash(c))) return true
    if (/^\d+$/.test(c)) {
      const n = Number(c)
      if (Number.isSafeInteger(n) && evHashes.has(n)) return true
    }
  }
  return false
}
export async function findMatchingRule(alarm: AlarmEvent): Promise<LinkageRule | null> {
  try {
    // [SSOT R2 2026-09-12] 缓存刷新抽为 ensureRulesLoaded (双写对比打点复用);
    //   拉取失败且无缓存 → 走 catch 兜底 (与重构前行为一致)
    const loaded = await ensureRulesLoaded()
    if (!loaded && !cachedRules) return null
    const rules = cachedRules
    if (!rules) return null
    const alarmType = alarm.type
    // [FIX 2026-09-05 弹窗不显示回归] 原 Number(alarm.channelId)||0 与规则库 hash 形态
    //   channel_ids 永不匹配 (GB 20 位→NaN→0, 数字通道→原值≠hash) → 带通道条件的
    //   规则全被 continue → findMatchingRule 恒 null → popup suppressed 不弹窗。
    //   设备端 isAlarmTypeSubscribed 用 safeChannelHash 正常放行 → 告警落库/WS 推送
    //   均正常, 仅前端弹窗门槛失配 (症状: 列表有事件但弹窗不弹)。
    //   修复: 双形态 hash 集合匹配 (chIdStr + 去 _ch0 后缀 baseId), 与 loadRuleCounts 同构。
    const chIdStr = String(alarm.channelId || '')
    const baseId = chIdStr.replace(/_ch\d+$/, '')
    const chHashes = new Set<number>([safeChannelHash(chIdStr)])
    if (baseId && baseId !== chIdStr) chHashes.add(safeChannelHash(baseId))
    // [FIX F2 2026-09-11] 补 device_ids 白名单检查: 后端 matchSourceCondition
    //   是 device_ids 双形态 (d==device_id || d==channel_id_str), 前端门槛原
    //   只查 channel_ids → 只选了 NVR 整机/同名设备独立通道的规则在前端永远
    //   通过 (后端可能不通过), 弹窗与规则库状态错位。
    const alarmDevIds = new Set<string>(
      [String(alarm.deviceId || ''), chIdStr, baseId].filter(v => v && v !== 'null' && v !== 'undefined')
    )
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
      // 通道匹配 (hash 口径, 与后端 LinkageEngine 同源)
      if (!channelEntryHit(src.channel_ids, chIdStr, baseId, chHashes)) continue
      // [FIX F2 2026-09-11] 设备白名单双形态匹配 (对齐后端 d==device_id || d==channel_id_str)
      if (src.device_ids?.length && !src.device_ids.some((d) => alarmDevIds.has(String(d)))) continue
      // 严重度匹配
      if (severity < src.min_severity) continue
      // 置信度匹配 (刻度归一后比较)
      if (confidence < normMinConf(src.min_confidence)) continue
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
      // hash 口径同主路径 (try 块内 chHashes 作用域出不来, 此处重算)
      const chIdStr2 = String(alarm.channelId || '')
      const baseId2 = chIdStr2.replace(/_ch\d+$/, '')
      const chHashes2 = new Set<number>([safeChannelHash(chIdStr2)])
      if (baseId2 && baseId2 !== chIdStr2) chHashes2.add(safeChannelHash(baseId2))
      const severity = (alarm.metadata?.severityNum as number) ?? 2
      const confidence = alarm.confidence
      // [FIX F2 2026-09-11] 回退路径同步: device_ids 双形态检查
      const alarmDevIds2 = new Set<string>(
        [String(alarm.deviceId || ''), chIdStr2, baseId2].filter(v => v && v !== 'null' && v !== 'undefined')
      )
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
        // 通道匹配 (hash 口径, 同上)
        if (!channelEntryHit(src.channel_ids, chIdStr2, baseId2, chHashes2)) continue
        // [FIX F2 2026-09-11] 回退路径同步: 设备白名单双形态检查
        if (src.device_ids?.length && !src.device_ids.some((d) => alarmDevIds2.has(String(d)))) continue
        if (severity < src.min_severity) continue
        if (confidence < normMinConf(src.min_confidence)) continue
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

// [FIX prevnext-shape 2026-09-11] prev/next 与列表入口同一归一化入口:
//   原直取队列对象赋 currentAlarm, 绕过 normalizeAlarmPayload 的 metadata
//   字符串/数组形态解包兜底 (unpackRawMetadata) → 部分队列条目 (如
//   useAlarm.ts/useAlarmStreamSSE.ts 原始 WS 帧直入队) metadata 形态漂移
//   → popupAlarmShapes 取空 → 叠加层 fallback 区域库渲染「区域」,
//   与列表入口 (normalizeAlarmPayload → 冻结快照「绊线」) 视觉分裂。
//   条件归一化: 已带 status 的队列条目是 useGlobalAlarm normalizeAlarmPayload
//   产物 (形态已正确), 直接用 — 避免二次 normalize 时白名单重建把顶层无
//   平铺的 bbox 重置为空数组后覆盖合并源 (幂等缺口); 无 status 的原始帧
//   走完整 normalizeAlarmPayload (normalize + 解包合并)。
function loadQueueAlarm(idx: number) {
  const q = alarmQueue.value[idx] as AlarmEvent | undefined
  if (!q) return
  currentAlarm.value = (q as any)?.status ? q : normalizeAlarmPayload(q)
  linkageLogs.value = []
}

export function nextAlarm() {
  if (queueIndex.value < alarmQueue.value.length - 1) {
    queueIndex.value++
    loadQueueAlarm(queueIndex.value)
    // 不重新查询规则（同一批告警通常匹配同一规则）
  }
}

export function prevAlarm() {
  if (queueIndex.value > 0) {
    queueIndex.value--
    loadQueueAlarm(queueIndex.value)
  }
}

// ── 处警操作 ──
// [接警单号 2026-09-09] 返回 boolean 供弹窗区分成功/失败 (原 void + 调用方无 await,
//   后端失败也弹“已确认处置”假成功); handler 透传当前登录用户 (后端写 handled_by,
//   原缺省恒 'admin'); action 扩 unsure/known 研判判定值 (后端 else 兕底直写 status)
export async function handleAlarm(
  action: 'confirmed' | 'false_alarm' | 'forwarded' | 'ignored' | 'unsure' | 'known',
  note?: string,
  handler?: string,
): Promise<boolean> {
  if (!currentAlarm.value) return false
  try {
    const store = useAlarmStore()
    const alarmId = currentAlarm.value.id
    const ok = await store.handleAlarm(alarmId, { status: action, note, handler })
    if (!ok) return false
    // [FIX 备注回显 2026-09-09] 处置成功就地回写 + 全局广播:
    //   ① currentAlarm 就地更新 — 弹窗只读态 (appendEditing 收起后) 立即显示
    //      备注/状态, 不闪空 (原 currentAlarm 是处置前快照, 只读态恒 '-');
    //   ② dispatch 'alarm-handled' — store.handleAlarm 只刷 store.alarms,
    //      AlarmsView 等自维护本地列表的视图行对象停留在处置前快照
    //      (status='unhandled'/handleNote 空), 重开弹窗走编辑态空输入框,
    //      看似"没保存"; 视图监听后重拉当前页即拿到回填治理字段。
    const cur = currentAlarm.value as any
    cur.status = action
    if (note) cur.handleNote = note
    if (handler) cur.handledBy = handler
    window.dispatchEvent(new CustomEvent('alarm-handled', { detail: { alarmId } }))
    // 跳到下一条或关闭
    if (queueIndex.value < alarmQueue.value.length - 1) {
      nextAlarm()
    } else {
      closePopup()
    }
    return true
  } catch (e) {
    console.error('[useAlarmPopup] handleAlarm failed:', e)
    return false
  }
}

// ── [追加信息 2026-09-09] 已处置告警追加处警信息 ──
//   与 handleAlarm 不同: 追加后弹窗保持打开 (只读区就地追加一行展示),
//   不跳队列/不关闭; 后端 status='append' 不动状态机 (主状态/接警单号不变)。
//   [FIX disposed-readonly 2026-09-14] handler 透传当前登录用户 (对齐
//   handleAlarm 的 handled_by 归属; 原缺省时后端兜底 'admin', 非 admin
//   用户追加会被错误记录为 admin)。
export async function appendAlarmNote(content: string, handler?: string): Promise<boolean> {
  if (!currentAlarm.value || !content.trim()) return false
  try {
    const res: any = await alarmApi.appendNote(currentAlarm.value.id, content.trim(), handler)
    const d = res?.data?.data ?? res?.data ?? res
    const appended = (d?.appended ?? {}) as Record<string, unknown>
    const cur = currentAlarm.value as any
    // 后端合并结果就地更新 (disposition 全文 + 接警单号沿用回显; 双源兼容
    //   响应拦截器可能已 snake→camel)
    const merged = d?.disposition ?? d?.dispositionNew
    if (merged) cur.handleNote = String(merged)
    const tk = d?.ticket_id ?? d?.ticketId
    if (tk) cur.ticketId = String(tk)
    // 结构化追加记录列表追加一行 (只读区立即显示, 带时间戳前缀)
    const logs: AlarmAppendLog[] = Array.isArray(cur.appendLogs) ? [...cur.appendLogs] : []
    logs.push({
      content: String(appended.content ?? content.trim()),
      by: String(appended.by ?? '') || undefined,
      time: String(appended.time ?? '') || undefined,
      timeMs: Number(appended.time_ms ?? appended.timeMs ?? 0) || undefined,
    })
    cur.appendLogs = logs
    // 广播刷新列表 (AlarmsView 重拉拿到回填的 gov.append_logs + 新 disposition)
    window.dispatchEvent(new CustomEvent('alarm-handled', { detail: { alarmId: cur.id } }))
    return true
  } catch (e) {
    console.error('[useAlarmPopup] appendAlarmNote failed:', e)
    return false
  }
}

// ── 音效（修复：解锁失败时不设置 audioUnlocked） ──
// [SOUND-ORIGIN 2026-09-11] 解锁专用静音 wav (8kHz/16bit/50ms data URI):
//   autoplay 授权来自「手势上下文内调用 play」, 不需要真的出声 —
//   两处首次手势解锁 (App.vue / 本文件 ensureAudioUnlock) 均用它替代 alarm.wav,
//   手动入口点击/按键零告警音, auto 播音链路不受影响。
export const AUDIO_UNLOCK_SILENT_WAV =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
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
    // [SOUND-ORIGIN] 解锁动作用静音 wav (独立临时元素, 正式播音元素 alarmAudio
    //   保持 alarm.wav) — autoplay 授权来自手势上下文内调用 play, 不需要出声:
    //   手动入口的首次点击不再播放任何告警音
    if (audioUnlocked) return
    const un = new Audio(AUDIO_UNLOCK_SILENT_WAV)
    un.volume = 0.001
    un.play().then(() => { un.pause() }).catch(() => {
      console.warn('[useAlarmPopup] 音频解锁失败（需要用户交互）')
    }).finally(() => {
      audioUnlocked = true
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

// [FIX dispose-edit-guard 2026-09-14] 处警编辑中标记 (AlarmPopup.vue 表单输入同步上报):
//   disposeType 已选 / 备注非空 / 追加编辑态 → true。新告警 WS 帧到达时非高优先级
//   不覆盖当前弹窗 (真机 14:47 实测: 用户填表期间连续新告警/富化帧推送静默替换
//   currentAlarm → 处警表单被清空 → 点击确认处置无请求发出, 用户误判"未保存成功")。
export const disposeEditing = ref(false)

// ── 核心入口：弹出告警弹窗 ──
// [POPUP-AUTOCLOSE 2026-09-03] options.autoCloseSeconds:
//   - 详情入口 (openAlarmDetailById) 不传 → 0 → 永不自动关闭
//   - WS 推送 (useGlobalAlarm) 透传 rule.popup_auto_close_s → 0=不启用, >0=N 秒后关闭
// [SOUND-ORIGIN 2026-09-11] options.origin: 'manual' | 'auto' | 'linkage' (默认 manual)
//   仅 auto/linkage 播放报警音; 手动打开一律静音 (旧调用点不传即静音, 自动链已显式传)
// [FIX situation-status 2026-09-14] options.force: 手动详情入口 (openAlarmDetailById)
//   显式切换意图 — 跳过下方两类防覆盖守卫, 保证弹窗最终显示用户点击的告警:
//   慢链下 WS 新告警先弹 (origin=auto) 后, 点击目标到达时不再被拦
//   (真机 2026-09-14 16:04 实测: 点击 loitering 行处置后 PUT 打到先弹的
//   intrusion 28b500b1, 列表点击行状态不变, 用户误判"处置不生效")。
export type AlarmPopupOrigin = 'manual' | 'auto' | 'linkage'
export async function showAlarmPopup(
  rawAlarm: any,
  options?: { autoCloseSeconds?: number; origin?: AlarmPopupOrigin; force?: boolean },
): Promise<boolean> {
  if (!rawAlarm) return false

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
  //    [FIX situation-status 2026-09-14] force (手动入口): 用户显式打开目标告警,
  //    跳过下列两类防覆盖守卫; 同时清处置编辑标记 — 切换告警即放弃未提交表单
  //    (弹窗侧 watch 重置表单, 避免旧编辑态残留拦截后续 WS 帧)。
  const HIGH_PRIORITY: string[] = ['critical', 'high']
  if (options?.force) disposeEditing.value = false
  if (popupVisible.value && currentAlarm.value) {
    const curIsHigh = HIGH_PRIORITY.includes(currentAlarm.value.level)
    const newIsHigh = HIGH_PRIORITY.includes(alarm.level)
    if (!options?.force && curIsHigh && !newIsHigh) {
      console.log('[useAlarmPopup] skip overwrite: current is high-priority, new is', alarm.level, alarm.type)
      return false
    }
    // [FIX dispose-edit-guard 2026-09-14] 处警编辑保护: 用户已选类型/输入备注 (未提交) 时,
    //   非高优先级新告警不覆盖弹窗 — 原行为直接替换 currentAlarm → 弹窗侧 watch 静默
    //   清空处置表单, 用户点击"确认处置"时按钮已 disabled / 首行 return, PUT 从不发出
    //   (真机 2026-09-14 14:47-14:55 实测: 6ff003ed 至今 status=new, nginx 无 PUT 记录;
    //   期间连续新告警推送 14:50:46/14:52:46/14:53:22/14:54:34 不断重置表单)。
    //   高优先级 (critical/high) 仍可抢断 — 安全提醒优先; 用户提交/清空/关闭后自动解除。
    //   同 id 富化/补位帧不受此拦 (走下方同 id 合并分支, 本就不换告警不清表单)。
    if (!options?.force && disposeEditing.value && !newIsHigh && alarm.id !== currentAlarm.value.id) {
      console.log('[useAlarmPopup] dispose editing guard: skip overwrite by new alarm', alarm.id,
        'level:', alarm.level, 'current:', currentAlarm.value.id)
      return false
    }
  }

  // [FIX popup-anno 2026-09-06] 同告警双推送富化合并 — 同一条告警有两个 WS
  //   推送 (setWsPushFn alarm.new 全量 metadata 先发 / WEB_POPUP executor
  //   精简字段后发), findMatchingRule 首查慢二查快 (缓存) → 竞态下精简帧
  //   常先弹且防抖挡掉富帧 → 实时弹窗快照无标注而列表详情有 (用户实测)。
  //   同 id 后到帧不重置弹窗, 只补稀疏字段 (metadata 深合并/快照/视频 URL)。
  if (popupVisible.value && currentAlarm.value && currentAlarm.value.id === alarm.id) {
    const cur = currentAlarm.value as any
    const mergedMeta = { ...(cur.metadata || {}), ...(alarm.metadata || {}) } as any
    // detections/bbox: 后到帧非空才覆盖 (富帧在前被清空的风险隔离)
    for (const k of ['detections', 'bbox', 'face_box', 'alarm_shapes'] as const) {
      const nv = (alarm.metadata as any)?.[k]
      const ov = (cur.metadata as any)?.[k]
      if ((Array.isArray(nv) && nv.length === 0) || nv === undefined) {
        if (ov !== undefined) mergedMeta[k] = ov
      }
    }
    currentAlarm.value = {
      ...alarm,
      // 弹窗态字段保持 (不重置自动关闭秒数/规则匹配)
      snapshotUrl: alarm.snapshotUrl || cur.snapshotUrl,
      videoClipUrl: alarm.videoClipUrl || cur.videoClipUrl,
      deviceName: alarm.deviceName || cur.deviceName,
      channelName: alarm.channelName || cur.channelName,
      metadata: mergedMeta,
      // [A3 2026-09-14 时间语义治理 P0-C] 时间锚不可回退: 同 id 后到帧
      //   (富化/精简/补推) 不刷新显示时间 — 保留首帧 createdAt
      //   (对齐腾讯云监控「重复触发不覆盖 FirstOccurTime」; 历史行为:
      //   后到帧 createdAt 覆盖首帧 → 弹窗「发生时间」被推后)。
      createdAt: cur.createdAt,
    } as typeof alarm
    console.log('[useAlarmPopup] same-alarm enrich merged, id:', alarm.id,
      'meta keys:', Object.keys(mergedMeta).length)
    return true
  }

  currentAlarm.value = alarm
  linkageLogs.value = []
  // [FIX prevnext-shape 2026-09-11] 队列索引对齐: 弹窗告警若在队列内 (WS
  //   推送链先 pushRealtimeAlarm 再 showAlarmPopup), queueIndex 对齐其真实
  //   位置 — 原恒置 0, 点「下一条」从 0→1 跳号 (队列[0] 即当前告警时被
  //   重显/非当前时被跳过); 队列外条目 (详情/列表入口历史告警) 保持 0。
  const qIdx = alarmQueue.value.findIndex((a) => a.id === alarm.id)
  queueIndex.value = qIdx >= 0 ? qIdx : 0
  // [POPUP-AUTOCLOSE 2026-09-03] 写入当前弹窗的自动关闭秒数 (独立 ref, 不污染 AlarmEvent)
  currentPopupAutoCloseS.value = Math.max(0, Number(options?.autoCloseSeconds ?? 0)) || 0
  if (!popupVisible.value) {
    popupVisible.value = true
    console.log('[useAlarmPopup] popupVisible set to true, alarm:', alarm.id, 'ch:', alarm.channelId,
      'autoCloseSeconds:', currentPopupAutoCloseS.value)
  } else {
    console.log('[useAlarmPopup] popup already visible, updated alarm to:', alarm.id,
      'autoCloseSeconds:', currentPopupAutoCloseS.value)
  }

  // [FIX popup-enrich 2026-09-17] 打开即富化: WS 实时帧可能缺数据 —
  //   linkage_alarm 双写精简帧 (LinkageEvent 无 metadata 成员, 仅顶层
  //   bbox/detections) → metadata 空; 精简帧顶层 confidence 亦可能缺。
  //   真机 DB 12/12 metadata 全齐 (bbox/detections/三帧/置信度), 显示层
  //   缺数据只是链路问题。归一化对象不满足富化门槛 (confidence>0 且
  //   metadata 含 detections) 时异步 GET /alarms/:id 回填 — 弹窗已先开
  //   不阻塞; 合并方向 rich(DB 全量) 为底, 已有 cur 稀疏键不丢; 弹窗已
  //   切换/关闭 (id 不一致) 放弃。失败静默 (仅少富化)。
  const needsEnrich =
    !(Number(alarm.confidence) > 0) ||
    !alarm.metadata ||
    !Array.isArray((alarm.metadata as any)?.detections) ||
    (alarm.metadata as any)?.detections.length === 0
  const enrichId = alarm.id ? String(alarm.id) : ''
  if (needsEnrich && enrichId && !enrichId.startsWith('linkage_')) {
    alarmApi.getDetail(enrichId).then((res: any) => {
      const detail = res?.data?.data ?? res?.data ?? res
      if (!detail) return
      if (currentAlarm.value?.id !== alarm.id) return  // 已切换/关闭
      const rich = normalizeAlarmPayload(detail)
      const cur = currentAlarm.value as any
      currentAlarm.value = {
        ...cur,
        confidence: Number(cur.confidence) > 0 ? cur.confidence : rich.confidence,
        snapshotUrl: cur.snapshotUrl || rich.snapshotUrl,
        videoClipUrl: cur.videoClipUrl || rich.videoClipUrl,
        metadata: { ...(rich.metadata || {}), ...(cur.metadata || {}) },
      } as typeof alarm
      console.log('[useAlarmPopup] popup enrich merged from REST, id:', enrichId)
    }).catch(() => {})
  }

  // 3. 音效 —— [SOUND-ORIGIN 2026-09-11] 仅自动弹窗 (WS 推送) / 联动触发播音,
  //    手动入口 (列表点行/卡片/详情按钮) 一律静音; 仍按告警类型过滤 (仅 ALARM 类)
  if (options?.origin === 'auto' || options?.origin === 'linkage') {
    playAlarmSound(alarm.type)
  }

  // 4. 异步查询联动规则（弹窗已开，匹配结果后续填入；失败不阻塞弹窗）
  try {
    const rule = await findMatchingRule(alarm)
    matchedRule.value = rule
  } catch {
    matchedRule.value = null
  }
  return true
}

// ── 关闭弹窗 ──
let closeTimer: ReturnType<typeof setTimeout> | null = null
export function closePopup() {
  popupVisible.value = false
  // [FIX dispose-edit-guard 2026-09-14] 关闭即解除编辑保护 (防 closeTimer 300ms
  //   窗口内 disposeEditing 残留误拦新告警)
  disposeEditing.value = false
  // [POPUP-AUTOCLOSE 2026-09-03] 立即清零自动关闭秒数, 防下一弹窗误用旧值
  currentPopupAutoCloseS.value = 0
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
    // [FIX situation-status 2026-09-14] force: 手动入口显式切换 (跳过防覆盖守卫),
    //   保证弹窗最终显示本次点击的告警 — 见 showAlarmPopup options.force 注释。
    await showAlarmPopup(detail, { force: true })
  } catch (e: any) {
    console.error('[useAlarmPopup] openAlarmDetailById failed:', e)
    ElMessage.error('打开告警详情失败: ' + (e?.message || ''))
  }
}

// ── [POPUP-AUTOCLOSE-TEST 2026-09-03] 调试钩子 ──
// URL ?popuptest=1 时挂载 window.__popupTest, 注入假告警验证 autoCloseSeconds 全链路
// 生产默认不启用 (无 URL 参数时 window.__popupTest === undefined, 不影响 bundle 行为)
if (typeof window !== 'undefined') {
  const sp = new URLSearchParams(window.location.search)
  if (sp.get('popuptest') === '1') {
    (window as any).__popupTest = {
      showAlarmPopup,
      closePopup,
      currentPopupAutoCloseS,
      normalizeAlarmPayload,
      // 辅助: 直接读 ref 当前值
      snapshot: () => ({
        popupVisible: popupVisible.value,
        currentPopupAutoCloseS: currentPopupAutoCloseS.value,
        currentAlarmId: currentAlarm.value?.id || null,
        disposeEditing: disposeEditing.value,
      }),
    }
    console.log('[useAlarmPopup] 调试钩子已挂载 (window.__popupTest), popuptest=1 模式')
  }
}
