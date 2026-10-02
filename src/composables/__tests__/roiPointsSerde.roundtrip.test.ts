/**
 * roiPointsSerde.roundtrip.test.ts — [FIX p1-roi-roundtrip 2026-10-02] 缺陷 14-2
 *
 * 背景: ROI 顶点在「库内归一 [0,1]」与「画板像素域」之间往返两次量化 ——
 *   保存侧 4 位小数 (buildNormPoints) + 回显侧 Math.round 取整到像素
 *   (LinkageRuleView 两处)。用户「打开规则不改任何顶点直接保存」这条最常见
 *   路径也会让顶点向整像素靠拢, 亚像素信息逐次丢失; 小 ROI (关注点/细绊线)
 *   多轮编辑后漂移, 且与后端引擎判定的浮点边界不一致 (dry-run 边界抖动)。
 *   本批: 两个方向抽成 roiPointsSerde 纯函数, 回显不取整 + 写入精度 4→6 位。
 *
 * 判据纪律 (每条都要能被「坏实现」证伪):
 *   1. 连续 20 次「归一 → 回显 → 归一」逐点差 < 1e-6 (清单 §14-2 验证 1 原文)
 *      (坏实现: 回显侧留 Math.round → 首往返即差 ~3.7e-5 → 红);
 *   2. 存量高精度归一值 (7 位小数) 一次往返后仍 < 1e-6
 *      (坏实现: 精度回 4 位 → 0.1234567 → 0.1235 → 红);
 *   3. 1280 宽上相差 1e-5 (≈0.013 像素) 的相邻顶点往返后仍可区分
 *      (坏实现: 4 位精度把两者抹成同一个 0.1234 → 红 —— 细绊线塌陷的直接对应);
 *   4. 回显方向保留浮点 (非整像素) (坏实现同 1, 但从输出形态直接锁);
 *   5. 兼容面: 未知基准回退 1920×1080 / 已归一值直通 / 长度为奇不越界
 *      (坏实现: 去掉 SSOT 回退或改成无条件除法 → 红 —— 保护性用例);
 *   6. 序列化文本幂等: 连续两次「保存」的顶点串完全相等
 *      (清单 §14-2 验证 2「实机连续保存 10 次 diff 为空」的单元镜像)。
 */
import { describe, it, expect } from 'vitest'
import {
  NORM_PRECISION,
  roundNormValue,
  buildNormPoints,
  denormalizePoints,
} from '../roiPointsSerde'

/** 4:3 通道真实帧尺寸 (14-1 起保存/回显同源基准) */
const W = 1280
const H = 960

/** 一次「打开规则 → 直接保存」= 归一 → 回显像素 → 再归一 */
function saveRoundTrip(norm: number[]): number[] {
  return buildNormPoints(denormalizePoints(norm, W, H), W, H)
}

describe('roiPointsSerde 往返精度 (14-2)', () => {
  it('① 连续 20 次往返逐点差 < 1e-6 (判据 1)', () => {
    const base = buildNormPoints([157.952, 480.3, 1280, 960, 640, 120], W, H)
    let cur = base.slice()
    for (let k = 0; k < 20; k++) {
      cur = saveRoundTrip(cur)
      expect(cur.length).toBe(base.length)
      cur.forEach((v, i) => {
        expect(Math.abs(v - base[i])).toBeLessThan(1e-6)
      })
    }
  })

  it('② 存量 7 位小数归一值一次往返后仍 < 1e-6, 不被截到 4 位 (判据 2)', () => {
    const legacy = [0.1234567, 0.7654321, 0.5, 0.25]
    const back = saveRoundTrip(legacy)
    back.forEach((v, i) => {
      expect(Math.abs(v - legacy[i])).toBeLessThan(1e-6)
    })
  })

  it('③ 1280 宽上相差 1e-5 (≈0.013 像素) 的相邻顶点往返后仍可区分 (判据 3)', () => {
    // 158px → 0.123438, 158.0128px → 0.123448: 6 位精度可分, 4 位精度会抹平成同一个 0.1234
    const norm = buildNormPoints([158, 480, 158.0128, 480], W, H)
    expect(norm[0]).not.toBe(norm[2])
    expect(Math.abs(norm[2] - norm[0])).toBeGreaterThan(1e-6)
    const back = saveRoundTrip(norm)
    expect(Math.abs(back[2] - back[0])).toBeGreaterThan(1e-6)
  })

  it('④ 回显方向保留浮点, 不量化到整像素 (判据 4)', () => {
    const pix = denormalizePoints([0.123457, 0.5], W, H)
    expect(Number.isInteger(pix[0])).toBe(false)
    expect(pix[0]).toBeCloseTo(0.123457 * W, 10)
    expect(pix[1]).toBe(480)  // 0.5 × 960 恰为整像素, 也仍是 number 形态
  })

  it('⑤ 兼容面: 未知基准回退 1920×1080 / 已归一值直通 / 奇数长度不越界 (判据 5)', () => {
    // 未知帧尺寸 (0/0) → roiSchema SSOT 回退写入侧基准
    expect(buildNormPoints([1280, 960], 0, 0)).toEqual([0.666667, 0.888889])
    // ≤1.5 判已归一 → 直通 (存量归一形态数据不被再除一次)
    expect(buildNormPoints([0.1, 0.2], W, H)).toEqual([0.1, 0.2])
    // 长度为奇的脏数据: 成对消费, 丢弃半个顶点而非读 undefined
    expect(buildNormPoints([100, 200, 300], W, H)).toEqual([0.078125, 0.208333])
    // 回显方向按奇偶逐元素映射 (与旧实现同形态, 不丢尾元素)
    expect(denormalizePoints([0.1, 0.2, 0.3], W, H)).toEqual([128, 192, 0.3 * W])
  })

  it('⑥ 序列化文本幂等: 连续两次保存顶点串完全相等 (判据 6)', () => {
    const first = buildNormPoints([157.952, 480.3, 1280, 720], W, H)
    const s1 = JSON.stringify(first)
    let cur = first
    for (let k = 0; k < 10; k++) cur = saveRoundTrip(cur)  // 清单: 实机连续保存 10 次
    expect(JSON.stringify(cur)).toBe(s1)
  })

  it('⑦ NORM_PRECISION=6 与 roundNormValue 口径自洽 (常量锁, 防被改回 4 位)', () => {
    expect(NORM_PRECISION).toBe(6)
    expect(roundNormValue(0.1234567)).toBe(0.123457)
    expect(roundNormValue(0.1234444)).toBe(0.123444)
  })
})
