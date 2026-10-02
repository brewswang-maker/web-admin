/**
 * roiPointsSerde.ts — ROI 坐标「库内归一 [0,1] ↔ 画板像素域」序列化的前端单一实现
 *
 * [FIX p1-roi-roundtrip 2026-10-02] 缺陷 14-2: 原来这两步分别内联在
 *   views/LinkageRuleView.vue 的保存侧 (buildNormPoints) 与回显侧
 *   (`s.points.map((v, k) => Math.round(...))` 两处), 各自量化:
 *   ① 写入按 4 位小数截断;
 *   ② 回显把归一值反乘帧尺寸后再 Math.round 取整到像素。
 *   于是「打开规则 → 直接保存」这一条最常见路径 (用户没有拖动任何顶点)
 *   也会让顶点逐次向整像素靠拢, 亚像素信息丢失; 小 ROI (关注点 / 细绊线)
 *   多轮编辑后顶点漂移, 且与后端引擎判定使用的浮点边界不一致 (dry-run
 *   与实测边界抖动)。
 *
 * 本模块把两个方向抽成纯函数并收敛量化口径:
 *   - denormalizePoints: 库内 [0,1] → 画板像素, **不取整** (保留浮点);
 *   - buildNormPoints: 画板像素 → 库内 [0,1], 精度由 4 位提到 6 位。
 * 两者互逆且在 6 位精度下是幂等不动点 → 反复「打开即保存」不再漂移。
 *
 * 为什么提到 6 位而不是「直接序列化原浮点」: roi_shapes_json 是落库文本,
 *   JS 默认 toString 会把 0.12345678901234567 这类值整串写出 (体积与噪声都
 *   不必要); 6 位在 4K 帧上约 0.004 像素, 远高于任何实际标注精度需求,
 *   同时保证 1 像素以内的相邻顶点不被合并 (4 位在 1280 宽上约 0.1 像素,
 *   会把 <0.1 像素的差别抹平)。
 *
 * 注: 判像素阈值 / 回退基准仍由 roiSchema.ts SSOT 负责 (与后端
 *   RoiCoordinateSchema.h 对账), 本模块只做「画板像素 → 归一」方向的复用。
 */
import { normalizePoint } from './roiSchema'

/** 归一值序列化精度 (位小数) —— [FIX p1-roi-roundtrip 2026-10-02] 14-2: 原 4 位 */
export const NORM_PRECISION = 6

/** 单点归一值按 NORM_PRECISION 量化 (非负/正负同口径, 不 clamp) */
export function roundNormValue(v: number): number {
  const f = 10 ** NORM_PRECISION
  return Math.round(v * f) / f
}

/**
 * 画板像素域 flat 顶点 [x1,y1,x2,y2,...] → 库内归一 flat 顶点。
 * frameW/frameH ≤0 时由 roiSchema SSOT 内部回退 FALLBACK_WIDTH/HEIGHT
 * (与 14-1 的「按通道真实帧尺寸」口径一致); 任一分量 ≤1.5 判已归一并直通
 * (旧行为保留, 存量归一形态数据不受影响)。
 */
export function buildNormPoints(poly: number[], frameW = 0, frameH = 0): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < poly.length; i += 2) {
    const [nx, ny] = normalizePoint(poly[i], poly[i + 1], frameW, frameH)
    out.push(roundNormValue(nx), roundNormValue(ny))
  }
  return out
}

/**
 * 库内归一 flat 顶点 → 画板像素域 flat 顶点 (回显方向)。
 * baseW/baseH 必须与画板 normalizeWidth/Height 同源 (14-1 起 = 通道真实帧尺寸),
 * 否则「打开就错位, 保存即写错」。
 * [FIX p1-roi-roundtrip 2026-10-02] 14-2: 原实现外层包了 Math.round 把顶点量化到
 *   整像素 —— 去之, 直接保留浮点。按奇偶下标逐元素映射 (与旧实现同形态,
 *   长度为奇的脏数据不丢尾元素)。
 */
export function denormalizePoints(points: number[], baseW: number, baseH: number): number[] {
  return points.map((v, k) => (k % 2 === 0 ? v * baseW : v * baseH))
}
