/**
 * axisRegionIds.ts — 时序条件 (穿越链 / 目标·前置区域) 的 region_id 域校验与序列化
 *
 * [FIX p1-axis-region-id-domain 2026-10-02] 缺陷 15-1 (红线: 必须用 ID, 不得用名称)
 *
 * 病灶: LinkageRuleView 的三个区域选择器 (穿越链每一步 / 进入的区域 / 应先经过的
 *   区域) 都是 `<el-select allow-create filterable>`, 下拉 **展示的是名称**
 *   (`label: roi_name`), 序列化 (`serializeAxisSequence` / `serializeAxisConditional`)
 *   只做 `String(v).trim()` 不做域校验 → 用户把看到的名称复制回来手工输入即可
 *   落库; 而消费侧 LinkageEngine 按 `event.region_id` **严格字符串直比**
 *   (LinkageEngine.cpp:1656/1731/1900, [R3-2 2026-09-10] 明确不做多形态回退)
 *   → 名称永不等于事件携带的 ID → 规则保存成功、开关可开、**永远不触发且零日志**。
 *
 * 本模块把「序列化 + 域校验」抽成纯函数 (可脱离组件单测), 校验口径为**白名单形态**
 *   而非「只允许当前画板候选集」—— 原因是实锚发现的第二层失配 (已作为新缺陷登记,
 *   本批不修, 见下):
 *   ① 画板候选值是 ROI 的 `pid` (`roi_<ts>_<rand>` / `roi_echo_*` / `roi_ch_*`);
 *   ② 事件侧 `metadata["region_id"]` 由插件写的是**区域库数字主键**
 *      (plugins/perimeter/intrusion_detector/intrusion_detector.cpp:724 `meta["region_id"] = r.id`,
 *      AlarmDispatcher.cpp:1748 数字→字符串);
 *   也就是说当前只有「手输区域库数字 ID」这一条形态可能与引擎对上, 画板 pid 形态
 *   同样永不命中。若按清单原文把校验写成「必须在画板候选集内」, 会把今天唯一
 *   可能生效的形态 (数字 ID) 一并拒绝 —— 故本批只做「**名称形态一律拒绝**」这一
 *   红线收敛, 形态白名单 = 画板 pid ∪ 纯数字 ID, 其余 (含中文/带空格的名称、任意
 *   文本) 视为非法, 由调用方 ElMessage.error 并**拒绝保存** (不再像旧实现那样
 *   静默丢掉一步让规则带着残缺链落库)。
 *
 * 新缺陷登记 (本批不修, 待决策): 时序条件的 ID 域 pid vs 区域库数字主键失配 ——
 *   要么前端候选改为区域库 ID (与画板形状 region_id 绑定同源), 要么插件改报 pid。
 *   需要引擎/插件/前端三方口径统一, 属跨 ABI/判定链决策, 不在 web-admin 单批范围。
 */

/** 穿越链单步 (与组件 axisSteps 形态一致) */
export interface AxisStepInput { region_id?: unknown; gap_s?: unknown }

export interface AxisSerializeResult {
  /** 合法时的序列化结果; 存在非法值时为 '' (调用方必须拒绝保存) */
  json: string;
  /** 非法值原文清单 (已 trim, 去重, 保序); 空数组 = 全部合法 */
  bad: string[];
  /** [FIX p1-15-1b-mapping 2026-10-04] 未绑定区域库 ID 的 ROI pid 清单 (调用方拒保存点名) */
  bad_pids?: string[];
}

/** 纯数字 = 区域库主键形态 (事件侧 metadata["region_id"] 的实际来源) */
const NUMERIC_ID_RE = /^\d{1,12}$/
/** 画板 ROI pid 形态 (pid 命名空间前缀 `roi_`): roi_<ts>_<rand> / roi_echo_<ts>_<i> /
 *  roi_ch_<ts>_<i> —— 字符集限定为 [A-Za-z0-9_], 因此带中文、带空格、带连字符的
 *  「区域名称」形态 (如「大门」「多边形 1」) 必然不匹配 */
const CANVAS_PID_RE = /^roi_[a-z0-9_]+$/i

/**
 * 单个 region_id 是否可落库。
 * 空值不算「非法」(未填 = 该步/该维度不生效, 与旧实现一致, 交由上层按「全空即空串」处理)。
 */
export function isAcceptableAxisRegionId(v: unknown, candidates: string[] = []): boolean {
  const s = String(v ?? '').trim()
  if (!s) return true
  if (candidates.includes(s)) return true
  return NUMERIC_ID_RE.test(s) || CANVAS_PID_RE.test(s)
}

/** 批量挑出非法值 (去重保序) */
export function auditAxisRegionIds(values: unknown[], candidates: string[] = []): string[] {
  const bad: string[] = []
  for (const v of values) {
    const s = String(v ?? '').trim()
    if (!s || isAcceptableAxisRegionId(s, candidates)) continue
    if (!bad.includes(s)) bad.push(s)
  }
  return bad
}

/** 间隔钳位 [1s,24h] (与引擎 matchAxisTemporal 同口径, 旧实现逐字保留) */
export function clampGapS(raw: unknown, fallback = 60): number {
  return Math.min(86400, Math.max(1, Math.round(Number(raw) || fallback)))
}

/**
 * [FIX p1-15-1b-mapping 2026-10-04] 缺陷 15-1(b) 前端保存侧规一化。
 * 画板候选值 `roi_<ts>_<rand>` 与事件侧 `metadata["region_id"]` (区域库 int64
 * 主键) 同一字段位上存在二形 ID 域失配 —— 插件 `intrusion_detector.cpp:754` 把
 * r.id (int64) 写入事件元数据, 而画板候选由 `RoiPolygonEditor.vue:543` 生成的
 * roi_id 是字符串形态, 若直接落库, 引擎严格字符串直比 (LinkageEngine.cpp:2067-2078
 * [R3-2 2026-09-10]) 永远不命中 → 规则静默失效。
 *
 * RoiData 由 [ROI-ID-BIND 2026-09-29] 已新增 `region_id?: number` 字段 (画板首次同步
 * 后由后端响应回填, 经快照 `roi_shapes_json` / `roi_shapes_by_channel` 持久化),
 * 本函数以该字段为锚点做规一化:
 *   • 传入 `roi_` 前缀 pid 且命中绑表 → 返回对应 String(region_id) (数字形态落库)
 *   • 传入 `roi_` 前缀 pid 但未绑定 (region_id 缺失) → ok:false + pid (调用方拒保存)
 *   • 纯数字 / 空串 / 其他合法形态 → 原值透传 (ok:true + passthrough:true)
 */
export interface RoiBinding {
  roi_id: string
  region_id?: number
}

export function resolvePidToRegionId(
  raw: unknown,
  bindings: RoiBinding[] | undefined | null,
): { ok: true; value: string } | { ok: false; reason: 'unbound_pid'; pid: string } | { ok: true; value: string; passthrough: true } {
  const s = String(raw ?? '').trim()
  if (!s) return { ok: true, value: '', passthrough: true }
  if (NUMERIC_ID_RE.test(s)) return { ok: true, value: s, passthrough: true }
  if (!CANVAS_PID_RE.test(s)) return { ok: true, value: s, passthrough: true }
  // [FIX p1-15-1b-mapping] 向后兼容: 旧调用方未传 roiBindings (undefined/null) 时
  //   保留旧形态 (pid 直接落库), 仅当明确传入数组时才启用 pid→region_id 规一化。
  if (!Array.isArray(bindings)) return { ok: true, value: s, passthrough: true }
  const hit = bindings.find((b) => b && b.roi_id === s)
  if (hit && typeof hit.region_id === 'number' && hit.region_id > 0) {
    return { ok: true, value: String(hit.region_id) }
  }
  return { ok: false, reason: 'unbound_pid', pid: s }
}

/**
 * 顺序穿越 → [{region_id, max_gap_ms}]。
 * 模式非 sequence = 空串 (切模式即清链); 全空步骤 = 空串 (回普通几何);
 * **存在非法值 → 整条返回空串 + bad 清单** (调用方拒绝保存, 不落残缺链)。
 */
export function serializeAxisSequencePure(
  mode: string,
  steps: AxisStepInput[] | undefined | null,
  candidates: string[] = [],
  roiBindings?: RoiBinding[] | null,
): AxisSerializeResult {
  if (mode !== 'sequence') return { json: '', bad: [] }
  const list = Array.isArray(steps) ? steps : []
  const bad = auditAxisRegionIds(list.map((s) => s?.region_id), candidates)
  if (bad.length) return { json: '', bad }
  // [FIX p1-15-1b-mapping 2026-10-04] 逐步规一化: 画板 pid → 区域库 int64 主键; 未绑定者列入 bad_pids 拒保存
  const resolved: string[] = []
  const unbound: string[] = []
  for (const s of list) {
    const raw = String(s?.region_id ?? '').trim()
    if (!raw) { resolved.push(''); continue }
    const r = resolvePidToRegionId(raw, roiBindings)
    if (!r.ok) { unbound.push(r.pid); resolved.push('') }
    else resolved.push(r.value)
  }
  if (unbound.length) return { json: '', bad: unbound.map((p) => `${p} (ROI 未绑定区域库 ID)`), bad_pids: unbound }
  const arr = list
    .map((s, i) => ({ region_id: resolved[i], gap_s: clampGapS(s?.gap_s) }))
    .filter((s) => s.region_id)
    .map((s) => ({ region_id: s.region_id, max_gap_ms: s.gap_s * 1000 }))
  return { json: arr.length > 0 ? JSON.stringify(arr) : '', bad: [] }
}

/**
 * 时序条件 → {target_region_id, prior_region_id, lookback_ms}。
 * 模式非 conditional = 空串; 目标区域为空 = 不生效 (空串);
 * 存在非法值 → 空串 + bad 清单 (同序列, 拒绝保存由调用方负责)。
 */
export function serializeAxisConditionalPure(
  mode: string,
  targetRegion: unknown,
  priorRegion: unknown,
  lookbackS: unknown,
  candidates: string[] = [],
  roiBindings?: RoiBinding[] | null,
): AxisSerializeResult {
  if (mode !== 'conditional') return { json: '', bad: [] }
  const bad = auditAxisRegionIds([targetRegion, priorRegion], candidates)
  if (bad.length) return { json: '', bad }
  // [FIX p1-15-1b-mapping 2026-10-04] target/prior 各自规一化; 任一未绑定 → 拒保存
  const rt = resolvePidToRegionId(targetRegion, roiBindings)
  if (!rt.ok) return { json: '', bad: [`${rt.pid} (ROI 未绑定区域库 ID)`], bad_pids: [rt.pid] }
  const rp = resolvePidToRegionId(priorRegion, roiBindings)
  if (!rp.ok) return { json: '', bad: [`${rp.pid} (ROI 未绑定区域库 ID)`], bad_pids: [rp.pid] }
  const t = rt.value
  if (!t) return { json: '', bad: [] }
  const lookMs = clampGapS(lookbackS, 300) * 1000
  return {
    json: JSON.stringify({ target_region_id: t, prior_region_id: rp.value, lookback_ms: lookMs }),
    bad: [],
  }
}
