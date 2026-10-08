/**
 * roiSchema.ts — ROI/检测框坐标刻度判定与归一化前端镜像 (P2-1 2026-09-14)
 *
 * 与 box-sdk/include/core/RoiCoordinateSchema.h 保持同步, 修改必须双侧同步
 *   (常量值由 scripts/check_roi_schema_sync.py 对账, 不一致 exit 1)。
 *
 * 契约: 坐标存在「内存像素 / 上报归一 [0,1]」双刻度 (后端声明见
 *   AlgoPlugin.h DetectionBox [FIX bbox-contract 2026-09-08 R3]):
 *   任一分量 >1.5 判像素, 按帧尺寸 (或写入侧画布基准 1920×1080 回退) 归一。
 *
 * [FIX roi-ssot-converge 2026-10-08] 两个坐标域分治 (与后端 roi-domain-unify
 *   同批镜像, 口径必须一致):
 *     R 域 = 区域多边形 / 绊线端点 / transit_polygon 这类「用户画出来的形状」
 *       —— 归一除数**恒为写入侧画布基准**, 与本次推理帧尺寸无关
 *       (normalizeRegionPoint / normalizeFlatRegionPolygon / normalizeRegionRect);
 *     D 域 = 检测框 / 中心点 / track 点 —— 除数 = 本次喂帧真实尺寸,
 *       未知 (传 0) 才回退画布基准
 *       (normalizeDetectionPoint / normalizeDetectionBox)。
 *   两侧各自归一到 [0,1] 后比较, **永不互相放大** —— 后端被收口的反模式
 *   「把已归一的检测点乘回帧像素再与像素多边形直比」在喂帧 ≠ 画布时是跨域
 *   直比 (loitering 真机实锚: 17 个真实 person 框漏判 5 / 误判 6, 取证
 *   .tmp/roi_geom_evidence.txt)。前端弹窗/快照如果拿该习语回显, 会重现
 *   同一个「图形保存后位置与绘制时不一样」的观感, 故本镜像同步提供两侧入口。
 */

/** 判像素启发式阈值 (= 后端 kPixelHeuristicThreshold) */
export const PIXEL_HEURISTIC_THRESHOLD = 1.5
/** 写入侧画布基准回退帧宽 (= 后端 kFallbackFrameWidth) */
export const FALLBACK_WIDTH = 1920
/** 写入侧画布基准回退帧高 (= 后端 kFallbackFrameHeight) */
export const FALLBACK_HEIGHT = 1080
/** 单个 polygon 顶点数上限 (= 后端 kMaxPolygonVertices, [FIX p2-14-4 2026-10-04])
 *  后端写入侧 RoiPayloadSchema.h / 消费侧 LinkageEngine 已双侧判顶; 本常量供
 *  编辑器在加第 513 个点时就提示 (比后端 400 更早、更可解释), 数值由对账脚本锁死。 */
export const MAX_POLYGON_VERTICES = 512

/** 单值刻度判定: v 超过启发式阈值 → 像素坐标 */
export function isPixelScale(v: number): boolean {
  return Math.abs(v) > PIXEL_HEURISTIC_THRESHOLD
}

/** clamp 到 [0,1] */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * 单点归一化: 已归一 (≤阈值) 直通, 否则按 w×h 归一; w/h 非法 (≤0) 时
 * 回退写入侧基准 1920×1080。不做 clamp — 由调用方按语义决定是否 clamp01。
 */
export function normalizePoint(x: number, y: number, w = FALLBACK_WIDTH, h = FALLBACK_HEIGHT): [number, number] {
  if (!isPixelScale(x) && !isPixelScale(y)) return [x, y]
  const bw = w > 0 ? w : FALLBACK_WIDTH
  const bh = h > 0 ? h : FALLBACK_HEIGHT
  return [x / bw, y / bh]
}

/**
 * R 域 · 区域/绊线端点归一: 除数**恒为写入侧画布基准** (1920×1080) ——
 * 区域是用户在固定尺寸画布上画出来的, 与本次喂帧尺寸无关。已归一顶点直通,
 * 幂等可重入。(= 后端 normalizeRegionPoint)
 */
export function normalizeRegionPoint(x: number, y: number): [number, number] {
  return normalizePoint(x, y, FALLBACK_WIDTH, FALLBACK_HEIGHT)
}

/**
 * D 域 · 检测点/中心点归一: 除数 = 本次喂帧真实尺寸, 仅当帧尺寸未知
 * (传 ≤0) 时才回退画布基准。(= 后端 normalizeDetectionPoint)
 */
export function normalizeDetectionPoint(
  x: number, y: number, frameW = 0, frameH = 0,
): [number, number] {
  return normalizePoint(x, y, frameW, frameH)
}

/**
 * D 域 · 检测框归一 (四角**整体**判域后一次性除法): 任一分量 |v| 超阈值 →
 * 整框按喂帧尺寸归一; 四角全部归一则直通。(= 后端 normalizeDetectionBox)
 *
 * 为什么整体判域而不是逐角: 像素框的 x1 可能恰好落在 [-1.5, 1.5] (贴左边框),
 * 逐角判定会让该角保持像素值、其余角被除法 → 同一个框内出现两种量纲,
 * 底边中点/高度计算全错。
 *
 * 注: 展示侧在「帧尺寸未知」时常常宁可不画 (等 naturalWidth 就绪后重算),
 * 而不是按回退基准硬归 —— 那种场景保留调用方自己的 unknown 守卫, 只用
 * isPixelScale 判域 (不再本地写 1.5)。
 */
export function normalizeDetectionBox(
  x1: number, y1: number, x2: number, y2: number, frameW = 0, frameH = 0,
): [number, number, number, number] {
  if (!isPixelScale(x1) && !isPixelScale(y1) && !isPixelScale(x2) && !isPixelScale(y2)) {
    return [x1, y1, x2, y2]
  }
  const bw = frameW > 0 ? frameW : FALLBACK_WIDTH
  const bh = frameH > 0 ? frameH : FALLBACK_HEIGHT
  return [x1 / bw, y1 / bh, x2 / bw, y2 / bh]
}

/**
 * R 域 · 区域矩形归一 (x1,y1,x2,y2 四角整体判域): 除数恒为写入侧画布基准
 * —— 与 normalizeRegionPoint 同域, 仅形态为 4 标量矩形 (direction_zones /
 * detection_zone 一类以 rect 存的区域)。(= 后端 normalizeRegionRect)
 */
export function normalizeRegionRect(
  x1: number, y1: number, x2: number, y2: number,
): [number, number, number, number] {
  return normalizeDetectionBox(x1, y1, x2, y2, FALLBACK_WIDTH, FALLBACK_HEIGHT)
}

/**
 * R 域 · 扁平形态 ([x0,y0,x1,y1,...]) 区域多边形逐顶点归一 (返回新数组)。
 * (= 后端 normalizeFlatRegionPolygon)
 */
export function normalizeFlatRegionPolygon(flat: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const [nx, ny] = normalizeRegionPoint(flat[i], flat[i + 1])
    out.push(nx, ny)
  }
  if (flat.length % 2) out.push(flat[flat.length - 1])
  return out
}

/** 顶点数是否超出 SSOT 上限 (编辑器加数时前置拦截; flat 形态按对计) */
export function exceedsPolygonVertexCap(count: number): boolean {
  return count > MAX_POLYGON_VERTICES
}
