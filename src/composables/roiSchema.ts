/**
 * roiSchema.ts — ROI/检测框坐标刻度判定与归一化前端镜像 (P2-1 2026-09-14)
 *
 * 与 box-sdk/include/core/RoiCoordinateSchema.h 保持同步, 修改必须双侧同步
 *   (常量值由 scripts/check_roi_schema_sync.py 对账, 不一致 exit 1)。
 *
 * 契约: 坐标存在「内存像素 / 上报归一 [0,1]」双刻度 (后端声明见
 *   AlgoPlugin.h DetectionBox [FIX bbox-contract 2026-09-08 R3]):
 *   任一分量 >1.5 判像素, 按帧尺寸 (或写入侧画布基准 1920×1080 回退) 归一。
 */

/** 判像素启发式阈值 (= 后端 kPixelHeuristicThreshold) */
export const PIXEL_HEURISTIC_THRESHOLD = 1.5
/** 写入侧画布基准回退帧宽 (= 后端 kFallbackFrameWidth) */
export const FALLBACK_WIDTH = 1920
/** 写入侧画布基准回退帧高 (= 后端 kFallbackFrameHeight) */
export const FALLBACK_HEIGHT = 1080

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
