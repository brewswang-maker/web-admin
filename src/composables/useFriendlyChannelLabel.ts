/**
 * @file useFriendlyChannelLabel.ts
 * @brief 通道友好 label / 回显反查兜底 / 区域收窄 纯函数集
 *        [FIX area-cascade-label 2026-09-11] 从 LinkageRuleView 内联实现提取,
 *        供联动规则页快照背景/绑定通道与告警处警弹窗共用; 纯函数形态可直接 vitest。
 *
 * 复用背景:
 *   - [AREA-CASCADE 2026-09-11] LinkageRuleView.boundChannelOptions 首建
 *     「友好 label + 区域收窄 + 池外 fallback 注入」范式 (e806cf7);
 *   - [FIX dev-name-num 2026-09-11] DisposeDialog 沉淀「目录反查, 不裸显数字串」;
 *   - 本文件将两者合并为可复用纯函数, 并升级 fallback 反查链:
 *     通道池 → 目录通道名 → 目录设备名 → 「通道 <id>」兜底 (四段降级)。
 */
import { baseChannelId as fallbackBaseId } from './useAlarmDeviceLabel'

/** 与 useLinkageOptions.ChannelOption 结构兼容的最小面 (避免循环依赖) */
export interface FriendlyChannelLike {
  label: string
  value: string
  deviceName?: string
  deviceIp?: string
}

/** 目录反查注入面 (useAlarmDeviceLabel 的 devNameOf/chNameOf 签名兼容) */
export interface NameDirectoryLookup {
  chNameOf?: (id: unknown) => string
  devNameOf?: (id: unknown) => string
}

/** 通道 option → 「通道名 (设备名)」/「通道名 · 设备IP」/「通道名」 */
export function friendlyChannelLabelOf(ch: FriendlyChannelLike): string {
  if (ch.deviceName) return `${ch.label} (${ch.deviceName})`
  if (ch.deviceIp) return `${ch.label} · ${ch.deviceIp}`
  return ch.label
}

const fallbackBaseId = (v: string): string =>
  typeof v === 'string' ? v.replace(/_ch\d+$/, '') : String(v ?? '')

/**
 * 池外已选值 → 可读 label (禁止裸显 GB28181 20 位串 / int32 id):
 *   ① 通道池命中 (value/剥子码流 base 双形态) → 友好 label (+ 子码流后缀);
 *   ② 目录 chNameOf 反查 → 通道名 (+ 子码流后缀);
 *   ③ 目录 devNameOf 反查 → 「设备名 通道 <id>」;
 *   ④ 全不中 → 「通道 <id>」
 */
export function channelFallbackLabel(
  v: string,
  pool: FriendlyChannelLike[],
  lookup?: NameDirectoryLookup,
): string {
  const base = fallbackBaseId(v)
  const suffix = v === base ? '' : ' (子码流)'
  const hit = pool.find(ch => fallbackBaseId(ch.value) === base)
  if (hit) return `${friendlyChannelLabelOf(hit)}${suffix}`
  const chName = lookup?.chNameOf?.(base) ?? ''
  if (chName) return `${chName}${suffix}`
  const devName = lookup?.devNameOf?.(base) ?? ''
  if (devName) return `${devName} 通道 ${v}`
  return `通道 ${v}`
}

/**
 * 区域收窄 (双形态): pool ∩ 区域 resolved 通道 (20 位主形态 vs _chN 子码流,
 * 剥后缀比对) + extraIds 中池内命中项置顶在前 — 与 LinkageRuleView
 * boundChannelOptions 的 [AREA-CASCADE] 收窄口径逐位一致。
 * 返回按池原序的收窄子集 (extras 追加在后, 去重)。
 */
export function narrowChannelsToArea(
  pool: FriendlyChannelLike[],
  areaResolvedIds: string[],
  extraIds: string[],
): FriendlyChannelLike[] {
  const resolvedBase = new Set((areaResolvedIds || []).map(fallbackBaseId))
  const inArea = pool.filter(ch => resolvedBase.has(fallbackBaseId(ch.value)))
  const known = new Set(inArea.map(c => c.value))
  const extras = pool.filter(ch => (extraIds || []).includes(ch.value) && !known.has(ch.value))
  return [...inArea, ...extras]
}

/**
 * 快照背景通道池收窄 (症状 2): 区域已选 (resolved 非空) 时收窄为
 * 「区域 resolved 摄像头通道 ∪ 绑定通道中摄像头」, 并保证当前选中值
 * (含老规则 20 位串回填) 池外注入 fallback — el-select tag 永不裸显数字。
 * 未选区域 → 全量 camPool 维持现状。
 */
export function narrowSnapshotChannels(
  camPool: FriendlyChannelLike[],
  areaResolvedIds: string[],
  boundIds: string[],
  currentId: string,
  lookup?: NameDirectoryLookup,
): Array<FriendlyChannelLike & { __fallback?: boolean }> {
  let list = camPool
  if (areaResolvedIds?.length) {
    list = narrowChannelsToArea(camPool, areaResolvedIds, boundIds)
  }
  const knownAll = new Set(list.map(c => c.value))
  const fallbacks: Array<FriendlyChannelLike & { __fallback?: boolean }> = []
  if (currentId && !knownAll.has(currentId)) {
    fallbacks.push({
      label: channelFallbackLabel(currentId, camPool, lookup),
      value: currentId,
      __fallback: true,
    })
  }
  return [...list.map(ch => ({ ...ch, label: friendlyChannelLabelOf(ch) })), ...fallbacks]
}

export { fallbackBaseId as baseChannelIdCompat }
