/**
 * evidenceFrames — 告警取证帧语义共享模块 (EV-TRIPLE 2026-09-14)
 *
 * 弹窗快照画廊 (AlarmPopup) 与多帧取证块 (EvidenceFrames) 双处复用:
 *   ① 语义标签 (按算法 id 尾段三级链解析) — pre=空场景/动作起始,
 *      mid=触发帧 (人/物必在场), post=触发后延时抓帧 (非触发时刻);
 *   ② evidence_ts 帧时刻戳 → 相对时间角标 (T-12s/T+0/T+6s, 视频
 *      时间轴范式, 对标海康 S-VIVE 触发前/后偏移与 GB 报警预录);
 *   ③ 帧构建 (pre/mid/post 固定序, 契约过滤: 非 data:image|/ 开头一律
 *      不收 — 宁缺毋假) + post 采集中占位判定 (补位链延时回写窗口)。
 *
 * 纯函数模块 (无 Vue 依赖); 语义与 EvidenceFrames.vue 原实现逐字一致,
 * 抽共享防两处渲染漂移 (弹窗 gallery 与详情抽屉标签不同步的历史问题)。
 */

/** 取证帧键序 (固定, 与后端 fillMeta/补位链三键对齐) */
export const EVIDENCE_FRAME_KEYS = ['pre', 'mid', 'post'] as const
export type EvidenceFrameKey = typeof EVIDENCE_FRAME_KEYS[number]

export interface EvidenceFrameMeta {
  key: EvidenceFrameKey
  label: string
  url: string
  /** 相对时间角标 (T-12s/T+0/T+6s), 无 evidence_ts 时缺省 */
  rel?: string
  /** 绝对时刻 (HH:mm:ss, hover title) */
  abs?: string
}

/**
 * 算法语义标签 (按算法 id 尾段映射; 未知算法退回通用文案)
 * [EV-TRIPLE 2026-09-14] 语义分离后语义:
 *   pre=空场景/动作起始 (prefer_empty_scene 类为最后无目标帧),
 *   mid=触发帧 (人/物必在场), post=触发后延时抓帧 (非触发时刻)
 *   — post 标签统一摈弃旧"触发时刻/触发确认"措辞 (旧实现偷写触发帧)。
 */
export const EVIDENCE_ALGO_LABELS: Record<string, { pre: string; mid: string; post: string }> = {
  tailgating: { pre: '通过前', mid: '过程中', post: '通过后' },
  object_removal: { pre: '消失前', mid: '过程中', post: '消失后' },
  abandoned_luggage: { pre: '遗留时', mid: '滞留中', post: '事后' },
  climbing: { pre: '攀爬前', mid: '攀爬中', post: '翻越后' },
  intrusion: { pre: '入侵前', mid: '触发时刻', post: '事后' },
  // [ROI-GAP 2026-09-06] fall 三帧链 (include_mid=true) / gathering 双帧链补齐
  fall: { pre: '倒地前', mid: '倒地中', post: '事后' },
  gathering: { pre: '聚集前', mid: '聚集中', post: '事后' },
  // [trash-misclass 2026-09-06] personal_item 遗留/无人看管双帧链
  //   (abandoned/unattended fillMeta, carried 高频低危不加帧)
  personal_item: { pre: '遗留前', mid: '滞留中', post: '事后' },
  // [FIX evidence-label 2026-09-07] canonical 兼容: AlarmDispatcher SSOT 归一后
  //   algo_id 尾段是 canonical 名 (abandoned), 非插件名 (personal_item) —
  //   语义两源通用 (遗留前/滞留中/事后), 双保险直配。
  abandoned: { pre: '遗留前', mid: '滞留中', post: '事后' },
  unattended_baggage: { pre: '看管前', mid: '离开中', post: '事后' },
}

/** 通用兜底标签 (未命中算法映射时) */
const GENERIC_LABELS = { pre: '事发前', mid: '过程中', post: '事发后' }

/**
 * 标签解析三级链: 调用方 algoId 尾段 → metadata.algo_id 尾段 →
 * description_key 首段 ("personal_item.abandoned" → personal_item)。
 * [FIX evidence-label 2026-09-07] 此前只看 algoId 一级, SSOT 归一后的
 * canonical 名 (abandoned) 未命中时直接退通用文案 (真机弹窗实录"事发前/事发后")。
 */
export function resolveEvidenceAlgo(
  algoId: unknown,
  metadata?: Record<string, unknown> | null,
): string {
  const m = metadata || {}
  const tails = [
    String(algoId || '').split('.').pop(),
    String(m.algo_id || '').split('.').pop(),
    String(m.description_key || '').split('.')[0],
  ].filter((t): t is string => Boolean(t))
  return tails.find((t) => EVIDENCE_ALGO_LABELS[t]) || ''
}

/** 语义标签 (pre/mid/post 三键; 未命中算法映射退通用文案) */
export function resolveEvidenceLabels(
  algoId: unknown,
  metadata?: Record<string, unknown> | null,
): { pre: string; mid: string; post: string } {
  return EVIDENCE_ALGO_LABELS[resolveEvidenceAlgo(algoId, metadata)] || GENERIC_LABELS
}

/** 头部提示文案 ("入侵 取证帧" / "取证帧") */
export function evidenceAlgoHint(
  algoId: unknown,
  metadata?: Record<string, unknown> | null,
): string {
  const hit = resolveEvidenceAlgo(algoId, metadata)
  return hit ? `${hit} 取证帧` : '取证帧'
}

/**
 * evidence_ts 帧时刻戳提取 (metadata.evidence_ts = {pre,mid,post})
 * — fillMeta 写入 / 补位链回写 (全量三键合并); 仅数字且 >0 视为有效。
 */
export function extractEvidenceTs(
  metadata?: Record<string, unknown> | null,
): Partial<Record<EvidenceFrameKey, number>> {
  const out: Partial<Record<EvidenceFrameKey, number>> = {}
  const raw = metadata?.evidence_ts
  if (raw && typeof raw === 'object') {
    for (const k of EVIDENCE_FRAME_KEYS) {
      const v = (raw as Record<string, unknown>)[k]
      if (typeof v === 'number' && v > 0) out[k] = v
    }
  }
  return out
}

/** 相对时间锚点 = mid 帧 (触发时刻, 视频时间轴 T+0 基准); 退化告警时刻 */
export function evidenceRelAnchor(
  metadata?: Record<string, unknown> | null,
  alarmTsMs?: number,
): number {
  return extractEvidenceTs(metadata).mid || alarmTsMs || 0
}

/** 相对时间角标: T-12s / T+0 / T+6s (锚点取整对齐) */
export function fmtEvidenceRel(frameTs: number, anchor: number): string {
  if (!anchor || !frameTs) return ''
  const d = Math.round((frameTs - anchor) / 1000)
  if (d === 0) return 'T+0'
  return d > 0 ? `T+${d}s` : `T-${-d}s`
}

/** 绝对时刻 HH:mm:ss (hover title) */
export function fmtEvidenceAbs(frameTs: number): string {
  if (!frameTs) return ''
  const dt = new Date(frameTs)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`
}

/** metadata 内帧字段契约过滤 (字段缺失/非字符串/非 data:image|/ 开头不收) */
function frameUrl(metadata: Record<string, unknown>, key: EvidenceFrameKey): string {
  const url = metadata[`${key}_snapshot_url`]
  if (typeof url === 'string' && url
      && (url.startsWith('data:image/') || url.startsWith('/'))) {
    return url
  }
  return ''
}

/**
 * 构建取证帧列表 (pre→mid→post 固定序, 仅真实数据存在时产出 —
 * 老告警无字段自动为空, 不伪造占位)。rel/abs 由 evidence_ts 派生。
 */
export function buildEvidenceFrames(
  metadata?: Record<string, unknown> | null,
  algoId?: unknown,
  alarmTsMs?: number,
): EvidenceFrameMeta[] {
  const m = metadata || {}
  const labels = resolveEvidenceLabels(algoId, m)
  const ts = extractEvidenceTs(m)
  const anchor = ts.mid || alarmTsMs || 0
  const out: EvidenceFrameMeta[] = []
  for (const key of EVIDENCE_FRAME_KEYS) {
    const url = frameUrl(m, key)
    if (!url) continue
    const f: EvidenceFrameMeta = { key, label: labels[key], url }
    const t = ts[key]
    if (t) {
      f.rel = fmtEvidenceRel(t, anchor)
      f.abs = fmtEvidenceAbs(t)
    }
    out.push(f)
  }
  return out
}

/**
 * [EV-TS] post 采集中占位: 有证据帧但 post 未到 (补位链 delay+抓帧途中),
 * 且告警新鲜 (<20s 窗口, 防历史告警/已失败场景常驻假占位)。
 * evidence_update 帧到达后 post 写入 → 本占位自然消失。
 */
export function isEvidencePostPending(
  metadata?: Record<string, unknown> | null,
  framesCount?: number,
  alarmTsMs?: number,
): boolean {
  const m = metadata || {}
  const hasPost = typeof m.post_snapshot_url === 'string' && Boolean(m.post_snapshot_url)
  if (hasPost) return false
  const n = framesCount ?? buildEvidenceFrames(m).length
  if (n < 1) return false
  const ts = alarmTsMs || extractEvidenceTs(m).mid || extractEvidenceTs(m).pre || 0
  if (!ts) return false
  const age = Date.now() - ts
  return age >= 0 && age < 20000
}
