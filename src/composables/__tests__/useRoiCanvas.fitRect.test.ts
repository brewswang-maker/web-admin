/**
 * @file useRoiCanvas.fitRect.test.ts
 * @brief 缺陷 14-1 letterbox 坐标反算防回归锁 (contain letterbox 适配矩形)
 *
 * 背景 (为什么这组断言存在):
 *   14-1 把 ROI 画板底图从「非等比拉伸铺满画布」改成「contain 等比 + 黑边」。
 *   只改渲染不改坐标换算, 会产生比修复前**更隐蔽**的「看得对、存错」缺陷:
 *   4:3 通道 (基准 1280×960) 的底图在 640×360 画布里只占 x=80..560, 用户在
 *   图像内 x=100 处落点 (真值归一 100/1280=0.078), 画布 px=117.5, 若仍按
 *   整幅画布换算得 117.5/640×1280=235 (归一 0.184) → 偏差 2.35 倍; 而正确的
 *   等比渲染会**掩盖**这个数据错误, 用户照着画面画却把 ROI 存到了别处。
 *
 * 覆盖:
 *   1. computeFitRect letterbox 几何 (4:3 底图进 16:9 画布)
 *   2. 同宽高比底图 → 退化为全画布 (无黑边, 与修复前行为一致)
 *   3. 无效底图尺寸 → 退化为全画布 (无背景图时网格铺满画布)
 *   4. 核心反例: 4:3 通道图像内落点必须落回真值 (旧逻辑偏差 2.35 倍)
 *   5. 归一 ↔ 画布 往返一致性 (映射可逆)
 *   6. isPixelInFit: 黑边区必须拒绝落点
 *   7. 越界钳制 (拖顶点出图像 → 吸附边界, 不存越界坐标)
 *   8. 向后兼容: 不传 fit 时等价于修复前行为
 */

import { describe, it, expect } from 'vitest'
import {
  computeFitRect,
  isPixelInFit,
  normalizedToCanvas,
  canvasToNormalized,
  type FitRect,
} from '@/composables/useRoiCanvas'

/** 画板默认尺寸 (RoiPolygonEditor props 默认值) */
const CANVAS_W = 640
const CANVAS_H = 360

describe('缺陷 14-1 — letterbox 适配矩形几何', () => {
  it('4:3 底图进 16:9 画布 → 左右留黑边, 几何正确', () => {
    const fit = computeFitRect(CANVAS_W, CANVAS_H, 1280, 960)
    // scale 取宽高约束较小者: min(640/1280, 360/960) = min(0.5, 0.375) = 0.375
    expect(fit.scale).toBeCloseTo(0.375, 10)
    expect(fit.w).toBeCloseTo(480, 10)   // 1280 × 0.375
    expect(fit.h).toBeCloseTo(360, 10)   // 960 × 0.375 = 画布高 (不溢出)
    expect(fit.x).toBeCloseTo(80, 10)    // (640 - 480) / 2 居中
    expect(fit.y).toBeCloseTo(0, 10)
  })

  it('16:9 底图进 16:9 画布 → 退化为全画布 (无黑边, 等价修复前行为)', () => {
    const fit = computeFitRect(CANVAS_W, CANVAS_H, 1920, 1080)
    expect(fit.x).toBe(0)
    expect(fit.y).toBe(0)
    expect(fit.w).toBe(CANVAS_W)
    expect(fit.h).toBe(CANVAS_H)
  })

  it('底图尺寸未知 → 退化为全画布 (无背景图时网格铺满画布)', () => {
    for (const [iw, ih] of [[0, 0], [-1, 100], [100, 0], [NaN, 100]] as [number, number][]) {
      const fit = computeFitRect(CANVAS_W, CANVAS_H, iw, ih)
      expect(fit).toEqual({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H, scale: 1 })
    }
  })
})

describe('缺陷 14-1 — 核心反例: 落点必须落回真值', () => {
  it('4:3 通道: 图像内 x=100 落点 → 归一 100 (修复前为 235, 偏差 2.35 倍)', () => {
    const fit = computeFitRect(CANVAS_W, CANVAS_H, 1280, 960)
    // 用户看着画面在图像 x=100 处落点 → 画布 px = fit.x + 100 × scale
    const canvasX = fit.x + 100 * fit.scale
    expect(canvasX).toBeCloseTo(117.5, 10)

    const norm = canvasToNormalized(
      { x: canvasX, y: 0 }, CANVAS_W, CANVAS_H, 1280, 960, fit,
    )
    // 真值 = 100/1280; 修复前按整幅画布算 = 117.5/640×1280 = 235
    expect(norm.x).toBe(100)
    expect(norm.x).not.toBe(235)
  })

  it('4:3 通道: 满幅四角 (0,0)-(1280,960) 归一往返无损', () => {
    const fit = computeFitRect(CANVAS_W, CANVAS_H, 1280, 960)
    const corners = [
      { x: 0, y: 0 },
      { x: 1280, y: 0 },
      { x: 1280, y: 960 },
      { x: 0, y: 960 },
    ]
    for (const c of corners) {
      const px = normalizedToCanvas(c, CANVAS_W, CANVAS_H, 1280, 960, fit)
      // 底图四边必须贴合适配矩形
      expect(px.x).toBeGreaterThanOrEqual(fit.x - 1e-9)
      expect(px.x).toBeLessThanOrEqual(fit.x + fit.w + 1e-9)
      expect(px.y).toBeGreaterThanOrEqual(fit.y - 1e-9)
      expect(px.y).toBeLessThanOrEqual(fit.y + fit.h + 1e-9)
      // 往返还原 (canvasToNormalized 取整, 容差 1)
      const back = canvasToNormalized(px, CANVAS_W, CANVAS_H, 1280, 960, fit)
      expect(Math.abs(back.x - c.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.y - c.y)).toBeLessThanOrEqual(1)
    }
  })
})

describe('缺陷 14-1 — 映射可逆性 (任意归一点往返一致)', () => {
  it('16:9 底图 (无黑边) 往返一致', () => {
    const fit = computeFitRect(CANVAS_W, CANVAS_H, 1920, 1080)
    for (const p of [{ x: 0, y: 0 }, { x: 960, y: 540 }, { x: 1920, y: 1080 }, { x: 123, y: 456 }]) {
      const px = normalizedToCanvas(p, CANVAS_W, CANVAS_H, 1920, 1080, fit)
      const back = canvasToNormalized(px, CANVAS_W, CANVAS_H, 1920, 1080, fit)
      expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(1)
    }
  })

  it('4:3 底图 (有黑边) 往返一致 —— 落点与回显同源', () => {
    const fit = computeFitRect(CANVAS_W, CANVAS_H, 1280, 960)
    for (const p of [{ x: 0, y: 0 }, { x: 640, y: 480 }, { x: 1280, y: 960 }, { x: 321, y: 654 }]) {
      const px = normalizedToCanvas(p, CANVAS_W, CANVAS_H, 1280, 960, fit)
      const back = canvasToNormalized(px, CANVAS_W, CANVAS_H, 1280, 960, fit)
      expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(1)
    }
  })
})

describe('缺陷 14-1 — 黑边区语义', () => {
  const fit = computeFitRect(CANVAS_W, CANVAS_H, 1280, 960)

  it('黑边区落点必须被识别为图像外 (应拒绝存点)', () => {
    expect(isPixelInFit({ x: 0, y: 180 }, fit)).toBe(false)     // 左侧黑边
    expect(isPixelInFit({ x: 639, y: 180 }, fit)).toBe(false)   // 右侧黑边
    expect(isPixelInFit({ x: 320, y: -1 }, fit)).toBe(false)    // 上方溢出
    expect(isPixelInFit({ x: 320, y: 361 }, fit)).toBe(false)   // 下方溢出
  })

  it('图像内落点 (含边界) 必须被接受', () => {
    expect(isPixelInFit({ x: fit.x, y: fit.y }, fit)).toBe(true)
    expect(isPixelInFit({ x: fit.x + fit.w, y: fit.y + fit.h }, fit)).toBe(true)
    expect(isPixelInFit({ x: 320, y: 180 }, fit)).toBe(true)
  })

  it('越界像素换算被钳制到 [0, 基准], 不产生负/越界坐标', () => {
    const n = canvasToNormalized({ x: -50, y: 9999 }, CANVAS_W, CANVAS_H, 1280, 960, fit)
    expect(n.x).toBe(0)
    expect(n.y).toBe(960)
    const n2 = canvasToNormalized({ x: 9999, y: -50 }, CANVAS_W, CANVAS_H, 1280, 960, fit)
    expect(n2.x).toBe(1280)
    expect(n2.y).toBe(0)
  })
})

describe('缺陷 14-1 — 向后兼容 (不传 fit 等价于修复前行为)', () => {
  it('不传 fit → 铺满画布, 与旧公式逐点一致', () => {
    const p = { x: 960, y: 540 }
    const c = normalizedToCanvas(p, CANVAS_W, CANVAS_H, 1920, 1080)
    expect(c.x).toBeCloseTo((960 / 1920) * CANVAS_W, 10)
    expect(c.y).toBeCloseTo((540 / 1080) * CANVAS_H, 10)

    const px = { x: 320, y: 180 }
    const n = canvasToNormalized(px, CANVAS_W, CANVAS_H, 1920, 1080)
    expect(n.x).toBe(Math.round((320 / CANVAS_W) * 1920))
    expect(n.y).toBe(Math.round((180 / CANVAS_H) * 1080))
  })

  it('显式传全画布 fit 与不传 fit 结果一致 (无背景图路径)', () => {
    const full: FitRect = { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H, scale: 1 }
    const p = { x: 137, y: 892 }
    expect(normalizedToCanvas(p, CANVAS_W, CANVAS_H, 1920, 1080, full))
      .toEqual(normalizedToCanvas(p, CANVAS_W, CANVAS_H, 1920, 1080))
  })
})
