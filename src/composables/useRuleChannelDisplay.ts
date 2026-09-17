/**
 * @file useRuleChannelDisplay.ts
 * @brief 规则「绑定通道」列展示统一口径 (周界/校园/加油站/酒店/大活 5 场景页共用)
 *
 * [CH-BINDING-DISPLAY 2026-09-14] 缺陷修复背景 (真机截图 + 后端数据双取证):
 *   各场景规则列表原逻辑只读 row.source_cond.channel_ids (int32 口径) 判空展示 —
 *   channel_ids 空 ⇒ 一律「全部通道」。但 2026-09 起布防链路 (周界三级树勾选 /
 *   场景包 apply v2) 把真实绑定写入其余三源:
 *     · spatial_cond.bound_channel_ids  通道级精确绑定 (LinkageRuleView 树勾选)
 *     · source_cond.device_ids          设备/通道级绑定 (树勾设备 / _chN 双形态)
 *     · spatial_cond.location_id        设备编码域收窄 (场景包 location 复用设备码)
 *   → channel_ids 恒空, 真实绑定被误判「全部通道」(真机 11 条周界规则 6 条误判)。
 *
 * 口径对齐 (与后端 LinkageEngine 运行时收窄同源, 逐字段核对):
 *   真实绑定 = bound_channel_ids (matchSpatialChannelBinding L1246)
 *            ∪ device_ids / channel_ids (matchSourceCondition + AutoDeployOrchestrator L669)
 *            ∪ location_id (matchSpatialCondition chanStrListMatches match_device=true)
 *   四源全空 = 确实未限定通道 = 「全部通道」。
 *
 * 展示解析链 (逐项, 与 channelFallbackLabel 四段降级同范式):
 *   ① 目录通道名 chNameOf (raw/base 双形态互认) → 通道名;
 *   ② 目录设备名 devNameOf → 展开该设备全部通道 (devChannelsOf); 无通道数据 → 设备名;
 *   ③ int32 项 → 目录哈希反投影 findChannelByHash (FNV-1a &0x7FFFFFFF 同口径);
 *   ④ 全不中 → 「通道 <id>」(不裸显 20 位串, 不误判全通道)。
 *   location_id 反查不中时不计入 (位置文本非通道域, 避免误导)。
 *
 * 去重: 剥 _chN 子码流后缀 base 归一 (同 useAlarmDeviceLabel.baseChannelId 口径)。
 */
import {
  baseChannelId,
  chNameOf,
  devNameOf,
  devChannelsOf,
  findChannelByHash,
  type ChannelBrief,
} from './useAlarmDeviceLabel'

/** 规则绑定字段最小面 (LinkageRule 的子集, 避免页面类型循环依赖) */
export interface RuleChannelBindingLike {
  source_cond?: {
    channel_ids?: unknown[] | null
    device_ids?: unknown[] | null
  } | null
  spatial_cond?: {
    bound_channel_ids?: unknown[] | null
    location_id?: unknown
  } | null
}

/** 单个绑定条目 (label=展示文本, raw=原始标识, 排查/回显用) */
export interface BoundChannelItem {
  label: string
  raw: string
}

/** 目录反查注入面 (默认 useAlarmDeviceLabel 单例; 单测注入 fake) */
export interface RuleChannelLookup {
  chNameOf: (id: unknown) => string
  devNameOf: (id: unknown) => string
  devChannelsOf: (id: unknown) => ChannelBrief[]
  findChannelByHash: (hash: number) => ChannelBrief | undefined
}

const defaultLookup: RuleChannelLookup = { chNameOf, devNameOf, devChannelsOf, findChannelByHash }

/** string 化过滤 (空串/非法项剔除; number 项转十进制文本) */
function toStr(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return ''
}

/**
 * 解析单值 → 绑定条目集 (可能展开为多条: 设备展开为全部通道)。
 * 返回空数组 = 该值无法归属通道/设备域 (调用方决定是否忽略)。
 */
function resolveValue(
  v: string,
  lookup: RuleChannelLookup,
): BoundChannelItem[] {
  const items: BoundChannelItem[] = []
  // ① 通道目录名 (raw/base 双形态互认)
  const chName = lookup.chNameOf(v)
  if (chName) return [{ label: chName, raw: v }]
  // ② 设备目录名 → 展开全部通道 (勾设备 = 该设备全部通道语义)
  const devName = lookup.devNameOf(v)
  if (devName) {
    const chs = lookup.devChannelsOf(v)
    if (chs.length) {
      for (const c of chs) items.push({ label: c.name || `监控点 ${c.raw}`, raw: c.raw })
      return items
    }
    return [{ label: devName, raw: v }]
  }
  return [] // 无法归属 → 由调用方决定 fallback/忽略
}

/**
 * 规则真实绑定通道条目集 (展示序: bound_channels → device_ids → channel_ids → location)。
 * 全空 = 未限定通道 (「全部通道」语义)。
 */
export function collectRuleBoundChannels(
  rule: RuleChannelBindingLike,
  lookup: RuleChannelLookup = defaultLookup,
): BoundChannelItem[] {
  const items: BoundChannelItem[] = []
  const seen = new Set<string>()
  const push = (it: BoundChannelItem) => {
    const key = baseChannelId(it.raw)
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    items.push(it)
  }
  const resolveInto = (v: string, unknownFallback: string) => {
    const resolved = resolveValue(v, lookup)
    if (resolved.length) {
      for (const it of resolved) push(it)
      return
    }
    // 反查不中: channel/device 域字段 → 「通道 <id>」诚实兜底
    push({ label: `${unknownFallback} ${v}`, raw: v })
  }

  // ① bound_channel_ids — 通道级精确绑定 (空项剔除)
  for (const v of rule.spatial_cond?.bound_channel_ids ?? []) {
    const s = toStr(v)
    if (s) resolveInto(s, '监控点')
  }
  // ② device_ids — 设备/通道级 (树勾设备展开通道 id 集)
  for (const v of rule.source_cond?.device_ids ?? []) {
    const s = toStr(v)
    if (s) resolveInto(s, '监控点')
  }
  // ③ channel_ids — int32 哈希口径 (老规则): 目录反投影, 不中诚实兜底
  for (const v of rule.source_cond?.channel_ids ?? []) {
    const n = typeof v === 'number' ? v : Number(toStr(v))
    if (!Number.isFinite(n) || n === 0) continue
    const hit = lookup.findChannelByHash(n)
    if (hit) push({ label: hit.name || `监控点 ${hit.raw}`, raw: hit.raw })
    else push({ label: `监控点 ${n}`, raw: String(n) })
  }
  // ④ location_id — 设备编码域收窄; 仅反查命中时计入 (位置文本非通道域不误导)
  const loc = toStr(rule.spatial_cond?.location_id)
  if (loc && !seen.has(baseChannelId(loc))) {
    const resolved = resolveValue(loc, lookup)
    for (const it of resolved) push(it)
  }
  return items
}

/** 列表列展示结构 (allChannels=true 时 items 恒空) */
export interface BoundChannelDisplay {
  allChannels: boolean
  items: BoundChannelItem[]
  /** tooltip 全文 (通道名顿号连接; 全通道时为空串) */
  tooltip: string
}

/** 单条规则 → 列表列展示结构 (页面 computed 预映射用) */
export function displayRuleBoundChannels(
  rule: RuleChannelBindingLike,
  lookup?: RuleChannelLookup,
): BoundChannelDisplay {
  const items = collectRuleBoundChannels(rule, lookup)
  return {
    allChannels: items.length === 0,
    items,
    tooltip: items.map(i => i.label).join('、'),
  }
}
