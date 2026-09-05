/**
 * useAlarmShapes.ts — 告警快照原始几何形状叠加 (2026-09-04)
 *
 * 需求: 告警弹窗「快照」Tab (AlarmSnapshot) 与事件详情抽屉 (SnapshotAnnotated)
 *   在快照上叠加触发算法/通道的原始检测区/排除区/绊线/方向线/计数区,
 *   与检测框同用归一化 [0,1] 基准, 支撑值守人员核对「目标是否真的进区/越线」。
 *
 * 数据源优先级:
 *   ⓪ 告警自包含快照 metadata.alarm_shapes ([FEAT 2026-09-04] 插件上报时冻结的
 *      当时生效区域几何, intrusion_detector.cpp 上报链写入) — 历史告警取证:
 *      区域库后续增删不影响已产生告警的形状还原; per-alarm 数据绕过共享缓存
 *   ① 联动规则 source_cond.roi_shapes_json (画板多形状快照, 含类型/方向/角点)
 *      — 通道匹配: channel_ids ∪ bound_channel_ids (GB 编码 _ch0 后缀双向归一)
 *   ② 回退 /api/v1/algos/{regions,tripwires,counting-zones} 算法区域库
 *      — regions/counting-zones: int32 通道维度 GB 场景全 0 → 按 algo_id 匹配
 *      — tripwires: channel_id_str 字符串主键本地过滤 (对齐 AlgoConfigView)
 *
 * 坐标兼容: 区域库存量数据归一化 [0,1] 与旧版像素坐标并存 (真机实证
 *   region#12 polygon=[[1078,1023],...]), 任一顶点 >1 判像素 → 按写入侧画布
 *   基准 1920×1080 归一 (与 LinkageRuleView buildNormPoints 同基准)。
 */
import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { linkageApi } from '@/api/linkage'
import { regionApi } from '@/api/region'
import { safeChannelHash } from '@/composables/useAlgoRuleSync'

/** 叠加形状类型 (RoiType 全集; 渲染层五类区分色) */
export type OverlayShapeType =
  | 'detection_zone' | 'exclusion_zone' | 'counting_zone'
  | 'tripwire' | 'directional_line' | 'rectangle' | 'point'

/** 归一化叠加形状 (points 恒 [0,1], 两组件 SVG/Canvas 同源消费) */
export interface OverlayShape {
  type: OverlayShapeType
  name: string
  direction: string                 // 'both' | 'a_to_b' | 'b_to_a' | ''
  points: Array<[number, number]>
  source: 'rule' | 'region' | 'tripwire'
}

/** 形状区分色 (用户规格: 检测/排除区蓝、绊线橙、方向线绿、计数区紫) */
export const SHAPE_STYLES: Record<OverlayShapeType, { stroke: string; fill: string; dashed: boolean }> = {
  detection_zone: { stroke: '#409EFF', fill: 'rgba(64,158,255,0.08)', dashed: false },
  exclusion_zone: { stroke: '#409EFF', fill: 'rgba(64,158,255,0.04)', dashed: true },
  rectangle: { stroke: '#409EFF', fill: 'rgba(64,158,255,0.08)', dashed: false },
  counting_zone: { stroke: '#6C5CE7', fill: 'rgba(108,92,231,0.07)', dashed: true },
  tripwire: { stroke: '#E6A23C', fill: 'none', dashed: false },
  directional_line: { stroke: '#67C23A', fill: 'none', dashed: false },
  point: { stroke: '#409EFF', fill: 'rgba(64,158,255,0.20)', dashed: false },
}

/** 检测目标类别调色板 (源头一份, AlarmSnapshot/SnapshotAnnotated 共用) */
export const CLASS_COLORS: Record<string, string> = {
  person: '#FF3D71',
  car: '#00D4AA',
  truck: '#FFB800',
  bus: '#6C5CE7',
  fire: '#FF4444',
  smoke: '#888888',
  face: '#3B82F6',
}

/** GB28181 通道编码去子码流后缀 (34020...02_ch0 → 34020...02) */
function stripChSuffix(chId: string): string {
  return String(chId || '').replace(/_ch\d+$/, '')
}

/** 像素/归一化双形态顶点 → 归一化 [0,1] (任一 >1 判像素, 1920×1080 画布基准) */
function normPoints(raw: Array<[number, number]>): Array<[number, number]> {
  if (!raw.length) return []
  const isPixel = raw.some(([x, y]) => x > 1 || y > 1)
  return raw
    .map(([x, y]) => (isPixel ? [x / 1920, y / 1080] : [x, y]) as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
}

/** flat [x1,y1,x2,y2,...] → [[x,y],...] 再归一化 (roi_shapes_json 形态) */
function normFlatPoints(flat: number[]): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i], flat[i + 1]])
  return normPoints(pts)
}

/** 算法 ID 匹配 (区域库存短名 'person_with_backpack' 与全名 'shield.algo.*' 并存):
 *  全等, 或任一尾段 (最后一个 '.' 段) 相等 */
function algoMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const tail = (s: string) => s.split('.').pop() || s
  return tail(a) === tail(b)
}

// ─────────────────────────── 数据获取 (两级链 + 模块级缓存) ───────────────────────────

interface ShapeCacheEntry { list: OverlayShape[]; ts: number }
const shapeCache = new Map<string, ShapeCacheEntry>()
const CACHE_TTL = 30_000

/** ① 规则链: enabled 规则 roi_shapes_json, 通道交集命中即取 (空间条件本身即通道绑定)
 *  [FIX 2026-09-04] 对齐后端 SSOT + 多规则竞争优先级:
 *    a. roi_shapes_json 存取均在 spatial_cond (RestApiHandlers L15023 写/L14952 回读,
 *       LinkageRuleView 提交同位; 原 source_cond 读取恒空)
 *    b. source_cond.channel_ids 是 int32 number 数组, 存 safeChannelHash(GB码)
 *       FNV-1a 值 (非 GB 码字符串, LinkageEngine.cpp L1123 事件匹配同哈希);
 *       bound_channel_ids 是字符串 GB 码 (number 项后端转 to_string)
 *    c. [真机实证] 多条带形状规则并存时 (如通配规则 le-video...-loiter 排序在前)
 *       原首命中即 return 会拿错形状 — 显式绑定本通道的规则优先, 通配规则
 *       (双池全空) 仅在无显式绑定命中时回退 (告警溯源: 显式绑定最相关)。 */
async function loadFromRules(channelId: string): Promise<OverlayShape[]> {
  const res = await linkageApi.getAllRules()
  // http 封装 TS 类型层不反映运行时双层壳 (res.data={code,data:{...}}),
  // 对齐 AlgoConfigView 惯例 any 双形态解包
  const items: any[] = (res.data as any)?.data?.items ?? (res.data as any)?.items ?? []
  const chNorm = stripChSuffix(channelId)
  const chHash = safeChannelHash(chNorm)
  let wildcardShapes: OverlayShape[] | null = null // 通候选补 (无显式绑定时回退)
  for (const r of items) {
    if (!r?.enabled) continue
    const sc = r.source_cond || {}
    const sp = r.spatial_cond || {}
    // spatial_cond 优先 (后端 SSOT), source_cond 兼容历史/异构写入
    const rawJson: unknown = sp.roi_shapes_json ?? sc.roi_shapes_json
    if (typeof rawJson !== 'string' || !rawJson) continue
    const srcChs: number[] = ((sc.channel_ids as any[]) || []).map(Number)
    const bound: string[] = ((sp.bound_channel_ids as any[]) || []).map(String)
    // 通道命中 (channel_ids hash 值 / bound GB 码双形态, 后缀双向归一);
    // 双池全空 = 通配规则 (不限定通道)
    const chHit = srcChs.some((c) => c === chHash)
      || bound.some((c) => Number(c) === chHash || stripChSuffix(c) === chNorm)
    const isWildcard = srcChs.length + bound.length === 0
    if (!chHit && !isWildcard) continue
    try {
      const parsed = JSON.parse(rawJson) as Array<{
        shape?: string; name?: string; active?: boolean; direction?: string; points?: number[]
      }>
      const list = (Array.isArray(parsed) ? parsed : [])
        .filter((s) => s && s.active !== false && Array.isArray(s.points) && s.points.length >= 4)
        .map((s) => ({
          type: (s.shape || 'detection_zone') as OverlayShapeType,
          name: s.name || '',
          direction: s.direction || '',
          points: normFlatPoints(s.points as number[]),
          source: 'rule' as const,
        }))
        .filter((s) => s.points.length >= 2)
      if (!list.length) continue
      if (chHit) return list // 显式绑定优先, 即取
      if (!wildcardShapes) wildcardShapes = list
    } catch { /* 非法 JSON 跳过该规则 */ }
  }
  return wildcardShapes ?? []
}

/** ② 区域库回退: regions/counting-zones 按 algo 匹配; tripwires 按通道字符串匹配 */
async function loadFromRegionStore(channelId: string, algoId: string): Promise<OverlayShape[]> {
  const chNorm = stripChSuffix(channelId)
  const [rRes, tRes, czRes] = await Promise.all([
    regionApi.listRegions({ channel_id: 0 }).catch(() => null),
    regionApi.listTripwires({ channel_id: 0 }).catch(() => null),
    regionApi.listCountingZones({ channel_id: 0 }).catch(() => null),
  ])
  const out: OverlayShape[] = []
  // 检测/排除区 (int32 通道维度 GB 全 0 → 按 algo 收紧, 防「一区多算法」串扰;
  //   [FIX 2026-09-04] algo_id 缺失的告警 (如内置徘徊旧数据) algoId 为空 →
  //   全量 regions 误画一堆框 (弹窗 vs 详情不一致实锚) → 空 algo 一律不画)
  const regions: any[] = (rRes?.data as any)?.data?.regions ?? (rRes?.data as any)?.regions ?? []
  if (!algoId) regions.length = 0
  for (const r of regions) {
    if (r?.enabled === false) continue
    if (!algoMatch(r.algo_id, algoId)) continue
    const pts = normPoints((r.polygon || []) as Array<[number, number]>)
    if (pts.length >= 3) out.push({ type: r.region_type || 'detection_zone', name: r.name || '', direction: '', points: pts, source: 'region' })
  }
  // 计数区 (同 int32 维度, algo 匹配; 无 algo 时跳过防误画)
  const zones: any[] = (czRes?.data as any)?.data?.counting_zones ?? (czRes?.data as any)?.counting_zones ?? []
  if (!algoId) zones.length = 0
  for (const z of zones) {
    if (z?.enabled === false) continue
    if (!algoMatch(z.algo_id, algoId)) continue
    const pts = normPoints((z.polygon || []) as Array<[number, number]>)
    if (pts.length >= 3) out.push({ type: 'counting_zone', name: z.name || '', direction: '', points: pts, source: 'region' })
  }
  // 绊线 (channel_id_str 字符串主键本地过滤; GB 主/子码流镜像双条按几何去重)
  const tripwires: any[] = (tRes?.data as any)?.data?.tripwires ?? (tRes?.data as any)?.tripwires ?? []
  const seen = new Set<string>()
  for (const t of tripwires) {
    if (t?.enabled === false) continue
    const tCh = stripChSuffix(t.channel_id_str || '')
    if (tCh !== chNorm) continue
    const pts = normPoints([t.point_a, t.point_b].filter(Boolean) as Array<[number, number]>)
    if (pts.length !== 2) continue
    const key = `${t.name}|${pts.map((p) => p.map((v) => v.toFixed(4)).join(',')).join('|')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ type: 'tripwire', name: t.name || '', direction: t.direction || '', points: pts, source: 'tripwire' })
  }
  return out
}

/** 形状叠加 composable: 两组件各自实例化, 缓存模块级共享 (30s TTL, 空结果也缓存) */
export function useAlarmShapes() {
  const shapes: Ref<OverlayShape[]> = ref([])
  const loading: Ref<boolean> = ref(false)
  async function load(channelId?: string, algoId?: string, alarmShapes?: unknown) {
    // ⓪ 告警自包含快照 (metadata.alarm_shapes): 插件上报告警时冻结的当时生效
    //    区域几何 — 区域被删后历史告警仍可核对「当时为什么报警」。
    //    per-alarm 数据, 绕过模块级共享缓存 (同 key 不同告警不可互相污染)。
    if (Array.isArray(alarmShapes) && alarmShapes.length) {
      shapes.value = alarmShapes
        .filter((s: any) => s && Array.isArray(s.points) && s.points.length >= 2)
        .map((s: any) => ({
          type: (s.type || 'detection_zone') as OverlayShapeType,
          name: s.name || '',
          direction: s.direction || '',
          points: normPoints(s.points),
          // source 复用 'region' 渲染分支 (绘制按 type 不按 source),
          // 与区域库回退同色同形, 语义差异仅在于数据已冻结在告警里
          source: 'region' as const,
        }))
      return
    }
    const ch = String(channelId || '')
    const algo = String(algoId || '')
    const key = `${ch}|${algo}`
    const cached = shapeCache.get(key)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      shapes.value = cached.list
      return
    }
    loading.value = true
    try {
      let list: OverlayShape[] = []
      if (ch) list = await loadFromRules(ch)
      if (!list.length && (ch || algo)) list = await loadFromRegionStore(ch, algo)
      shapeCache.set(key, { list, ts: Date.now() })
      shapes.value = list
    } catch {
      shapes.value = []
    } finally {
      loading.value = false
    }
  }
  return { shapes, loading, load }
}

// ─────────────────────────── 检测框解析 (两组件共用) ───────────────────────────

/** 归一化检测框 (x/y/w/h 均为 [0,1] 相对量) */
export interface ParsedDet {
  x: number; y: number; w: number; h: number
  label: string; confidence: number
  danger: boolean
}

/** detections 数组三形态解析: {x1,y1,x2,y2} / {x,y,w,h} / [x1,y1,x2,y2];
 *  像素坐标 (任一 >1) 按图像自然尺寸归一 (与 AlarmSnapshot 既有语义一致) */
export function parseDetections(
  dets: any[],
  imgNat: { w: number; h: number },
  fallbackLabel = 'target',
): ParsedDet[] {
  const out: ParsedDet[] = []
  for (const d of dets) {
    let x1 = d?.x1, y1 = d?.y1, x2 = d?.x2, y2 = d?.y2
    if (x1 === undefined && d?.x !== undefined && d?.w !== undefined) {
      x1 = d.x; y1 = d.y; x2 = d.x + d.w; y2 = d.y + d.h
    }
    if (x1 === undefined && Array.isArray(d) && d.length >= 4) {
      x1 = d[0]; y1 = d[1]; x2 = d[2]; y2 = d[3]
    }
    if (typeof x1 !== 'number' || typeof y1 !== 'number' || typeof x2 !== 'number' || typeof y2 !== 'number') continue
    if (x1 > 1 || y1 > 1 || x2 > 1 || y2 > 1) {
      if (!imgNat.w || !imgNat.h) continue
      x1 /= imgNat.w; y1 /= imgNat.h; x2 /= imgNat.w; y2 /= imgNat.h
    }
    out.push({
      x: x1, y: y1, w: x2 - x1, h: y2 - y1,
      label: d?.label || d?.class_name || d?.targetLabel || fallbackLabel,
      confidence: typeof d?.confidence === 'number' ? d.confidence : (typeof d?.score === 'number' ? d.score : 1),
      danger: false,
    })
  }
  return out
}

/** 触发目标标记: bbox 触发框 IoU 最大且 >0.5 → danger; 无 bbox 时同名 label 首个 */
export function markTriggerDet(dets: ParsedDet[], triggerBox: number[] | null, targetLabel = '') {
  if (!dets.length) return dets
  let marked = false
  if (triggerBox && triggerBox.length >= 4) {
    let best = -1, bestIou = 0.5
    dets.forEach((d, i) => {
      const iou = boxIoU([d.x, d.y, d.x + d.w, d.y + d.h], triggerBox)
      if (iou > bestIou) { bestIou = iou; best = i }
    })
    if (best >= 0) { dets[best].danger = true; marked = true }
  }
  if (!marked && targetLabel) {
    const i = dets.findIndex((d) => d.label === targetLabel)
    if (i >= 0) { dets[i].danger = true; marked = true }
  }
  if (!marked) dets[0].danger = true // detections[0] 即后端 full_meta 触发目标序
  return dets
}

/** 两归一化框 IoU */
export function boxIoU(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3])
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  if (inter <= 0) return 0
  const areaA = (a[2] - a[0]) * (a[3] - a[1])
  const areaB = (b[2] - b[0]) * (b[3] - b[1])
  return inter / (areaA + areaB - inter)
}

// ─────────────────────────── Canvas 绘制 (屏幕与导出同源) ───────────────────────────

/** 线段方向箭头 (tripwire: both=中点双向 / a_to_b=B 端 / b_to_a=A 端;
 *  directional_line 默认 B 端) */
function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - size * Math.cos(angle - 0.42), y - size * Math.sin(angle - 0.42))
  ctx.lineTo(x - size * Math.cos(angle + 0.42), y - size * Math.sin(angle + 0.42))
  ctx.closePath()
  ctx.fill()
}

/** 在 2D 上下文按归一化形状绘制 (w/h=画布像素尺寸, scale=导出分辨率放大倍数)。
 *  区类半透明填充+描边 (虚线区区别), 线类端点圆+方向箭头, 顶点小字名称。 */
export function drawShapesOnCtx(
  ctx: CanvasRenderingContext2D,
  shapes: OverlayShape[],
  w: number,
  h: number,
  scale = 1,
) {
  for (const s of shapes) {
    if (!s.points.length) continue
    const st = SHAPE_STYLES[s.type] || SHAPE_STYLES.detection_zone
    const pts = s.points.map(([x, y]) => [x * w, y * h] as [number, number])
    ctx.save()
    ctx.globalAlpha = 0.82
    ctx.strokeStyle = st.stroke
    ctx.lineWidth = Math.max(1.4, 1.6 * scale)
    if (st.dashed) ctx.setLineDash([6 * scale, 4 * scale])

    if (s.type === 'tripwire' || s.type === 'directional_line') {
      const [a, b] = [pts[0], pts[pts.length - 1]]
      ctx.beginPath()
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = st.stroke
      // 端点圆
      for (const p of [a, b]) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.6 * scale, 0, Math.PI * 2); ctx.fill()
      }
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
      const dir = s.direction || (s.type === 'directional_line' ? 'a_to_b' : '')
      if (dir === 'both') {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
        drawArrow(ctx, mx + 6 * scale * Math.cos(angle), my + 6 * scale * Math.sin(angle), angle, 7 * scale)
        drawArrow(ctx, mx - 6 * scale * Math.cos(angle), my - 6 * scale * Math.sin(angle), angle + Math.PI, 7 * scale)
      } else if (dir === 'b_to_a') {
        drawArrow(ctx, a[0], a[1], angle + Math.PI, 8 * scale)
      } else if (dir) {
        drawArrow(ctx, b[0], b[1], angle, 8 * scale)
      } else if (s.type === 'directional_line') {
        drawArrow(ctx, b[0], b[1], angle, 8 * scale)
      }
    } else if (s.type === 'point') {
      ctx.fillStyle = st.fill
      ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 3.5 * scale, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 6 * scale, 0, Math.PI * 2); ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.closePath()
      if (st.fill !== 'none') { ctx.fillStyle = st.fill; ctx.fill() }
      ctx.setLineDash(st.dashed ? [6 * scale, 4 * scale] : [])
      ctx.stroke()
      ctx.setLineDash([])
      // 角点 (多边形顶点可视化, 探针/肉眼确认形状渲染)
      ctx.fillStyle = st.stroke
      for (const p of pts) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 2 * scale, 0, Math.PI * 2); ctx.fill()
      }
    }
    // 名称小字 (黑底描边白字, 不与检测框 label 抢色)
    if (s.name) {
      ctx.globalAlpha = 0.95
      ctx.font = `bold ${Math.max(10, 10 * scale)}px sans-serif`
      const tx = pts[0][0] + 3 * scale
      const ty = pts[0][1] - 3 * scale
      ctx.lineWidth = 3 * scale
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.strokeText(s.name, tx, ty)
      ctx.fillStyle = '#fff'
      ctx.fillText(s.name, tx, ty)
    }
    ctx.restore()
  }
}

/** PNG 导出 (跨域污染降级): 合成图 (原图+标注) 成功 → 单文件;
 *  污染 canvas 的 toBlob Chrome 回调 null / Firefox 同步抛 → 降级为透明底
 *  标注层 + 原图直链分别导出 (需求 3: 视觉不受限时与屏幕一致)。 */
export function downloadPngWithFallback(
  composite: () => HTMLCanvasElement,
  annotateOnly: () => HTMLCanvasElement,
  imageUrl: string,
  prefix: string,
) {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const save = (canvas: HTMLCanvasElement, name: string) => new Promise<boolean>((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(false); return }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = name; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        resolve(true)
      }, 'image/png')
    } catch { resolve(false) }
  })
  function fallback() {
    save(annotateOnly(), `${prefix}-annotation-${ts}.png`).then((ok) => {
      if (!ok) { ElMessage.error('标注图导出失败'); return }
      if (imageUrl) {
        const a = document.createElement('a')
        a.href = imageUrl; a.download = `${prefix}-origin-${ts}.png`; a.click()
      }
      ElMessage.info('原图跨域受限, 已分别导出标注层与原图')
    })
  }
  try {
    save(composite(), `${prefix}-${ts}.png`).then((ok) => { if (!ok) fallback() })
  } catch { fallback() }
}

/** 检测框绘制 (屏幕/导出共用视觉: danger 红 #f56c6c, 其余类别调色板) */
export function drawDetsOnCtx(
  ctx: CanvasRenderingContext2D,
  dets: ParsedDet[],
  w: number,
  h: number,
  scale = 1,
  forceDanger = false,
) {
  for (const d of dets) {
    const color = (forceDanger || d.danger) ? '#f56c6c' : (CLASS_COLORS[d.label] || '#FF3D71')
    const x = d.x * w, y = d.y * h, bw = d.w * w, bh = d.h * h
    ctx.strokeStyle = color
    ctx.lineWidth = 2 * scale
    ctx.strokeRect(x, y, bw, bh)
    const label = `${d.label} ${Math.round(d.confidence * 100)}%`
    ctx.font = `bold ${Math.round(11 * scale)}px sans-serif`
    const tw = ctx.measureText(label).width + 8 * scale
    const th = 18 * scale
    ctx.fillStyle = color
    ctx.fillRect(x, y - th, tw, th)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, x + 4 * scale, y - 5 * scale)
  }
}
