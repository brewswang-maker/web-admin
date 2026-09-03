/**
 * [ALGO-RULE-SYNC 2026-09-03] 算法行开关 ↔ 事件规则启停 双向联动 (AlgoConfigView ↔ LinkageRuleView)
 *
 * 正向 (算法→规则, AlgoConfigView.toggleAlgoEnabled 调用):
 *   关算法 → 停用「明确绑定本通道 + 依赖该算法」的启用规则, 记入 rule_disabled_by_algo;
 *   开算法 → 仅恢复该记忆中的规则 (用户手动停用的不误拉起)。
 * 反向 (规则→算法, LinkageRuleView.toggleRule / handleSave 调用):
 *   关规则 → 对规则明确绑定的每个通道, 关闭其依赖的算法行 (串移出 + 禁用集合记入),
 *   记入 algo_disabled_by_rule; 开规则 → 仅恢复该记忆中的算法。
 *
 * 一致性约束:
 *   - 联动记忆 localStorage 持久化, 刷新/重启后仍在;
 *   - 联动失败不阻塞主流程 (调用方 try/catch, 此处仅 console.warn);
 *   - 反向仅作用于规则明确绑定的通道 (通道维度隔离; [REF-COUNT] 通配规则纳入
 *     计数 — 作用于所有部署了依赖算法的通道, 逐通道检查本地消费者);
 *   - [REF-COUNT 2026-09-03] 消费者引用计数: 关规则仅停「无其他启用消费者」的
 *     算法行 (共享场景保留生产者), 镜像 AutoDeploy 部署哲学「无消费者不生产」;
 *   - 算法页手动重开算法时清反向记忆 (forgetAlgoInRuleMemory), 防旧记忆残留
 *     导致后续「规则再关」不联动 (验收 V5)。
 *
 * 算法 id 双形态: 串/算法目录为插件 id (shield.algo.perimeter.intrusion), 而 UI 保存的
 * 规则 source_cond.algorithm_ids 实存事件类型字符串 ("intrusion", LinkageRuleView L2592)。
 * 依赖匹配用尾段双向匹配 (algoIdMatches) 兼容两种形态, 与 unbindRulesLostSupport 同族。
 */
import { linkageApi, type LinkageRule } from '@/api/linkage'
import { startSchedule, stopSchedule, getInferenceChannels, type ScheduledChannel } from '@/api/inference'

// ── 联动记忆 (localStorage 三键: 通道禁用集 / 正向记忆 / 反向记忆) ──
const ALGO_DISABLED_KEY = 'algo_disabled_by_channel'
const RULE_DISABLED_BY_ALGO_KEY = 'rule_disabled_by_algo'
const ALGO_DISABLED_BY_RULE_KEY = 'algo_disabled_by_rule'

function loadJsonMap(key: string): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
}
function saveJsonMap(key: string, m: Record<string, string[]>) {
  try { localStorage.setItem(key, JSON.stringify(m)) } catch { /* 隐私模式忽略 */ }
}

/** 算法行禁用集合 {chId: [algoId...]} — 禁用=移出串+记入此表, 刷新后仍显示禁用行 */
export function loadChannelDisabledMap(): Record<string, string[]> { return loadJsonMap(ALGO_DISABLED_KEY) }
export function saveChannelDisabledMap(m: Record<string, string[]>) { saveJsonMap(ALGO_DISABLED_KEY, m) }

/** 正向联动记忆 {`${chId}|${algoId}`: [ruleId...]} — 因算法停用而被联动停用的规则 */
export function loadRuleDisabledByAlgo(): Record<string, string[]> { return loadJsonMap(RULE_DISABLED_BY_ALGO_KEY) }
export function saveRuleDisabledByAlgo(m: Record<string, string[]>) { saveJsonMap(RULE_DISABLED_BY_ALGO_KEY, m) }

/** 反向联动记忆 {ruleId: [`${chId}|${algoId`...]} — 因规则停用而被联动关闭的算法 */
export function loadAlgoDisabledByRule(): Record<string, string[]> { return loadJsonMap(ALGO_DISABLED_BY_RULE_KEY) }
export function saveAlgoDisabledByRule(m: Record<string, string[]>) { saveJsonMap(ALGO_DISABLED_BY_RULE_KEY, m) }

/** 与后端 LinkageEngine.cpp safeChannelHash 逐位一致 (FNV-1a 32位 & 0x7FFFFFFF) */
export function safeChannelHash(idStr: string): number {
  if (!idStr) return 0
  let hash = 2166136261
  for (let i = 0; i < idStr.length; i++) {
    hash ^= idStr.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash & 0x7FFFFFFF
}

/** 依赖 id ↔ 算法 id 匹配: 精确 → 尾段双向 (插件 id 前缀形态 vs 事件类型字符串形态) */
export function algoIdMatches(dep: string, algoId: string): boolean {
  return dep === algoId || dep.endsWith('.' + algoId) || algoId.endsWith('.' + dep)
}

/** 调度通道表 (channel_id → ScheduledChannel) */
async function fetchSchedMap(): Promise<Map<string, ScheduledChannel & { [k: string]: any }>> {
  const res: any = await getInferenceChannels()
  const list: any[] = res?.data?.data?.channels ?? (res.data as any)?.channels ?? []
  const m = new Map<string, ScheduledChannel & { [k: string]: any }>()
  for (const c of list) m.set(String(c.channel_id ?? ''), c)
  return m
}

/** 通道有效启用集: 通道停用 (enabled=false) 时串是重启记忆而非启用集 → 视为空 */
function effectiveActiveOf(sc: any): string[] {
  if (!sc || sc.enabled === false) return []
  return String(sc.algo_plugin || '').split(',').map((s: string) => s.trim()).filter(Boolean)
}

/**
 * 通道上启停一个算法 (等效算法页行开关的串维护):
 * 启用=串加回+禁用集合移除 / 禁用=串移出+禁用集合记入; 串空 → stopSchedule。
 * confidence/nms/inferenceMode 不在此处覆盖 (无编辑表单上下文), 由后端默认接管。
 * @returns 是否实际发生变更 (已是目标态返回 false)
 */
export async function setAlgoOnChannel(chId: string, algoId: string, enable: boolean, intervalMs = 1000): Promise<boolean> {
  const sched = await fetchSchedMap()
  const sc = sched.get(chId)
  const deviceId = String(sc?.device_id ?? '') || chId
  const active = effectiveActiveOf(sc)
  const dmap = loadChannelDisabledMap()
  const dlist = new Set(dmap[chId] ?? [])
  const alreadyActive = active.includes(algoId)
  // 目标态与现状一致 (串与禁用集合均无差异) → 无变更
  if (enable === alreadyActive && enable === !dlist.has(algoId)) return false
  let ids: string[]
  if (enable) {
    if (!alreadyActive) active.push(algoId)
    dlist.delete(algoId)
    ids = active
  } else {
    ids = active.filter((id) => id !== algoId)
    dlist.add(algoId)
  }
  dmap[chId] = Array.from(dlist)
  saveChannelDisabledMap(dmap)
  if (ids.length === 0) {
    await stopSchedule(chId)
  } else {
    await startSchedule(chId, deviceId, Number(sc?.interval_ms ?? intervalMs) || intervalMs, ids.join(','))
  }
  return true
}

/**
 * 正向: 算法启停 → 关联规则 enabled 同步。
 * enable=false: 停用「明确绑定本通道 + 依赖该算法」的启用规则并记入正向记忆
 * (通配规则不动 — 可能被其他通道/算法触发, 避免误伤);
 * enable=true: 仅恢复记忆中因本通道本算法停用的规则。
 * 返回同步条数; 调用方 catch — 同步失败不阻塞算法启停主流程。
 */
export async function syncRulesForAlgo(chId: string, algoId: string, enable: boolean): Promise<number> {
  const key = `${chId}|${algoId}`
  if (enable) {
    const m = loadRuleDisabledByAlgo()
    const ids = m[key] ?? []
    if (ids.length === 0) return 0
    let ok = 0
    for (const rid of ids) {
      try { await linkageApi.updateRule(rid, { enabled: true } as Partial<LinkageRule>); ok++ }
      catch (e) { console.warn('[algoRuleSync] 联动恢复规则失败', rid, e) }
    }
    delete m[key]
    saveRuleDisabledByAlgo(m)
    return ok
  }
  const res = await linkageApi.getAllRules()
  const items: any[] = res.data?.data?.items ?? (res.data as any)?.items ?? []
  const chHash = safeChannelHash(chId)
  const targets = items.filter((r: any) => {
    if (!r.enabled) return false
    const sc: any = r.source_cond ?? {}
    const chs: number[] = sc.channel_ids ?? []
    const algos: string[] = sc.algorithm_ids ?? []
    return chs.length > 0 && chs.includes(chHash) && algos.some((a) => algoIdMatches(a, algoId))
  })
  if (targets.length === 0) return 0
  const m = loadRuleDisabledByAlgo()
  const disabledIds: string[] = []
  for (const r of targets) {
    try { await linkageApi.updateRule(r.id, { enabled: false } as Partial<LinkageRule>); disabledIds.push(r.id) }
    catch (e) { console.warn('[algoRuleSync] 联动停用规则失败', r.id, e) }
  }
  if (disabledIds.length > 0) {
    m[key] = Array.from(new Set([...(m[key] ?? []), ...disabledIds]))
    saveRuleDisabledByAlgo(m)
  }
  return disabledIds.length
}

/**
 * 反向: 规则启停 → 依赖算法行同步 (消费者引用计数模型)。
 * [REF-COUNT 2026-09-03] 生产者的去留 = 是否还有 ≥1 条启用中的规则消费它:
 *  enable=false: 作用范围 = 规则明确绑定的通道; 通配规则 (channel_ids 空) 纳入计数,
 *    作用于调度列表中所有部署了依赖算法的通道 (逐通道检查本地消费者)。
 *    每个通道×算法仅当「无其他启用消费者」时才关 (共享场景保留 — 关规则 A 时
 *    规则 B 仍启用且依赖同一算法 → 不断 B 的推理来源); 仅关「当前启用态」的
 *    算法行 (已是禁用态不记 — 别的联动/用户手动的记忆, 保持隔离)。
 *  enable=true: 仅恢复反向记忆中因本规则关闭的算法行 (本规则自任消费者, 合法),
 *    恢复后删记忆键。
 * 返回同步算法行数; 调用方 catch — 同步失败不阻塞规则启停主流程。
 */
export async function syncAlgosForRule(ruleId: string, sourceCond: any, enable: boolean): Promise<number> {
  const src = sourceCond ?? {}
  if (enable) {
    const m = loadAlgoDisabledByRule()
    const keys = m[ruleId] ?? []
    if (keys.length === 0) return 0
    const sched = await fetchSchedMap()
    let ok = 0
    for (const k of keys) {
      const sep = k.lastIndexOf('|')
      const cid = k.slice(0, sep)
      const algoId = k.slice(sep + 1)
      try {
        if (await setAlgoOnChannel(cid, algoId, true, Number(sched.get(cid)?.interval_ms) || 1000)) ok++
      } catch (e) { console.warn('[algoRuleSync] 联动恢复算法失败', k, e) }
    }
    delete m[ruleId]
    saveAlgoDisabledByRule(m)
    return ok
  }
  const aids: string[] = src.algorithm_ids ?? []
  const deps = aids.length > 0 ? aids : ((src.event_types ?? []) as string[])
  if (deps.length === 0) return 0
  const sched = await fetchSchedMap()
  // 作用范围: 绑定规则 → 哈希映射回的绑定通道; 通配规则 → 所有部署了依赖算法的通道
  const chs: number[] = src.channel_ids ?? []
  let targetCids: string[] = []
  if (chs.length === 0) {
    for (const [cid, sc] of sched) {
      if (effectiveActiveOf(sc).some((a) => deps.some((d) => algoIdMatches(d, a)))) targetCids.push(cid)
    }
  } else {
    const hashToId = new Map<number, string>()
    for (const [cid] of sched) hashToId.set(safeChannelHash(cid), cid)
    targetCids = chs.map((h) => hashToId.get(Number(h))).filter((c): c is string => !!c)
  }
  if (targetCids.length === 0) return 0
  // 消费者计数查询: 除本规则外, 是否还有启用规则 (绑定该通道或通配) 依赖该算法。
  // 依赖口径与作用范围一致: algorithm_ids (空则 event_types) 尾段双向匹配。
  const res = await linkageApi.getAllRules()
  const items: any[] = res.data?.data?.items ?? (res.data as any)?.items ?? []
  const hasOtherConsumer = (cid: string, algoId: string): boolean => {
    const chHash = safeChannelHash(cid)
    return items.some((r: any) => {
      if (!r.enabled || r.id === ruleId) return false
      const s: any = r.source_cond ?? {}
      const rchs: number[] = s.channel_ids ?? []
      if (rchs.length > 0 && !rchs.includes(chHash)) return false
      const raids: string[] = s.algorithm_ids ?? []
      const rdeps = raids.length > 0 ? raids : ((s.event_types ?? []) as string[])
      return rdeps.some((d) => algoIdMatches(d, algoId))
    })
  }
  const m = loadAlgoDisabledByRule()
  const recorded: string[] = []
  for (const cid of targetCids) {
    const sc = sched.get(cid)!
    for (const a of effectiveActiveOf(sc)) {
      if (!deps.some((d) => algoIdMatches(d, a))) continue
      if (hasOtherConsumer(cid, a)) continue // 共享: 其他启用消费者仍在, 保留生产者
      try {
        if (await setAlgoOnChannel(cid, a, false, Number(sc.interval_ms) || 1000)) recorded.push(`${cid}|${a}`)
      } catch (e) { console.warn('[algoRuleSync] 联动关闭算法失败', cid, a, e) }
    }
  }
  if (recorded.length > 0) {
    m[ruleId] = Array.from(new Set([...(m[ruleId] ?? []), ...recorded]))
    saveAlgoDisabledByRule(m)
  }
  return recorded.length
}

/**
 * 算法页手动 (非联动) 开启算法时, 清掉反向记忆中该算法的所有条目:
 * 手动重开 = 用户接管该算法状态, 旧「因规则关闭」记忆失效 —
 * 否则后续规则再关闭时残留记忆会让联动误判「已关过」而跳过 (验收 V5)。
 */
export function forgetAlgoInRuleMemory(chId: string, algoId: string) {
  const m = loadAlgoDisabledByRule()
  const target = `${chId}|${algoId}`
  let dirty = false
  for (const rid of Object.keys(m)) {
    const before = m[rid].length
    m[rid] = m[rid].filter((k) => k !== target)
    if (m[rid].length !== before) dirty = true
    if (m[rid].length === 0) delete m[rid]
  }
  if (dirty) saveAlgoDisabledByRule(m)
}
