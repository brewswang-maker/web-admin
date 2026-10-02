/**
 * @file roiSchema.test.ts
 * @brief ROI 归一契约前端侧锁定 (缺陷 14-1 / P2-1)
 *
 * 为什么必须有这个文件 (completion audit 发现的覆盖缺口):
 *   14-1 把 ROI 归一基准从「写死 1920×1080」改为「按通道真实帧尺寸」, 前端
 *   侧全部经由本文件导出的 `normalizePoint` 落地:
 *     - views/LinkageRuleView.vue:4977/5003/5269  (buildNormPoints, 传 frameW/frameH)
 *     - components/TripwireEditor.vue:92            (normPt, 走 FALLBACK 回退)
 *     - composables/useAlarmShapes.ts:91            (告警形状, 无帧尺寸)
 *   但 G7 的 `scripts/check_roi_schema_sync.py` **只比对三个常量的字面值**
 *   (1.5 / 1920 / 1080), **不校验函数行为**。若有人把 `normalizePoint` 里的
 *   `x / bw` 改回 `x / FALLBACK_WIDTH`, 全部门禁仍全绿, 而 14-1 的前端修复
 *   静默回退 —— 属「无锁通道」。本文件补上前端行为锁。
 *
 * 覆盖:
 *   1. §4.1 明写条款: 1280×960 通道满幅 (0,0)-(1280,960) → (0,0)-(1,1)
 *   2. 像素/归一双刻度判定 (isPixelScale 阈值 1.5, 含边界)
 *   3. w/h 非法 (≤0) → 回退 FALLBACK_*, 不抛错不返回 NaN
 *   4. 不做 clamp: 超界像素透传 (clamp 责任在调用方, 见 useAlarmShapes.ts:92)
 *   5. 常量值与后端 RoiCoordinateSchema.h 一致 (前端镜像契约)
 */

import { describe, it, expect } from 'vitest'
import {
  PIXEL_HEURISTIC_THRESHOLD,
  FALLBACK_WIDTH,
  FALLBACK_HEIGHT,
  isPixelScale,
  clamp01,
  normalizePoint,
} from '@/composables/roiSchema'

describe('roiSchema 归一契约 (缺陷 14-1 前端 SSOT 镜像)', () => {
  describe('§4.1 明写条款: 4:3 通道满幅归一', () => {
    it('1280×960 通道上 (0,0)-(1280,960) 归一后必须为 (0,0)-(1,1)', () => {
      const tl = normalizePoint(0, 0, 1280, 960)
      const br = normalizePoint(1280, 960, 1280, 960)
      expect(tl[0]).toBe(0)
      expect(tl[1]).toBe(0)
      expect(br[0]).toBeCloseTo(1, 10)
      expect(br[1]).toBeCloseTo(1, 10)
    })

    it('同一满幅在 16:9 基准下亦为 (1,1) —— 归一与帧尺寸无关, 由除数决定', () => {
      const br = normalizePoint(1920, 1080, 1920, 1080)
      expect(br[0]).toBeCloseTo(1, 10)
      expect(br[1]).toBeCloseTo(1, 10)
    })

    it('子码流 (640×360) 满幅归一为 (1,1) —— 14-1 缺陷原文点名的第二个失真源', () => {
      const br = normalizePoint(640, 360, 640, 360)
      expect(br[0]).toBeCloseTo(1, 10)
      expect(br[1]).toBeCloseTo(1, 10)
    })

    it('回归反例: 满幅若仍按写死 1920×1080 归一必偏左上 (1280×960 → 0.667/0.889)', () => {
      // 本例固化缺陷 14-1 的原始症状, 防止有人「优化」回退到硬编码基准
      const wrong = normalizePoint(1280, 960) // 不传 w/h → 走 FALLBACK 1920×1080
      expect(wrong[0]).toBeCloseTo(1280 / 1920, 10) // 0.6667
      expect(wrong[1]).toBeCloseTo(960 / 1080, 10) // 0.8889
      expect(wrong[0]).toBeLessThan(1)
      expect(wrong[1]).toBeLessThan(1)
    })
  })

  describe('像素 / 归一双刻度判定', () => {
    it('阈值内视为已归一 → 原样直通', () => {
      expect(isPixelScale(0)).toBe(false)
      expect(isPixelScale(0.5)).toBe(false)
      expect(isPixelScale(1)).toBe(false)
      expect(isPixelScale(PIXEL_HEURISTIC_THRESHOLD)).toBe(false) // 边界含等号
    })

    it('超阈值视为像素 → 需除以帧尺寸', () => {
      expect(isPixelScale(1.5 + 1e-9)).toBe(true)
      expect(isPixelScale(2)).toBe(true)
      expect(isPixelScale(1920)).toBe(true)
    })

    it('normalizePoint 对已归一输入直通 (不重复缩放)', () => {
      expect(normalizePoint(0.5, 0.25, 1280, 960)).toEqual([0.5, 0.25])
    })

    it('混合刻度 (x 像素 + y 已归一) → 双分量同除, 与后端 RoiCoordinateSchema.h:46 逐字一致', () => {
      // 双侧契约原文 (roiSchema.ts:34 ≡ RoiCoordinateSchema.h:46):
      //   if (!isPixelScale(x) && !isPixelScale(y)) return;
      // 即「任一分量为像素 ⇒ 整点判为像素刻度」, 而非逐分量独立判定。
      // 真实链路中 ROI 点的 x/y 恒来自同一数据源 (同一刻度), 不会产生
      // 混合输入; 此处锁死双侧同构, 防止前端单方面改成逐分量判定
      // (会让 y=0.5 被静默除成 0.0005) 而后端不动 → 双侧语义漂移。
      const [nx, ny] = normalizePoint(640, 0.5, 1280, 960)
      expect(nx).toBeCloseTo(640 / 1280, 10) // 0.5
      expect(ny).toBeCloseTo(0.5 / 960, 10) // 已归一分量也被同除
    })
  })

  describe('帧尺寸非法时的 SSOT 回退', () => {
    it('w/h ≤0 → 回退 FALLBACK_*, 不抛错不返回 NaN', () => {
      const [nx, ny] = normalizePoint(1280, 960, 0, 0)
      expect(Number.isNaN(nx)).toBe(false)
      expect(Number.isNaN(ny)).toBe(false)
      expect(nx).toBeCloseTo(1280 / FALLBACK_WIDTH, 10)
      expect(ny).toBeCloseTo(960 / FALLBACK_HEIGHT, 10)
    })

    it('负数帧尺寸同样回退 (LinkageRuleView:2574 离线态传 0 的路径)', () => {
      const [nx, ny] = normalizePoint(1280, 960, -640, -360)
      expect(nx).toBeCloseTo(1280 / FALLBACK_WIDTH, 10)
      expect(ny).toBeCloseTo(960 / FALLBACK_HEIGHT, 10)
    })

    it('仅 w 非法时: w 回退、h 仍用传入值', () => {
      const [nx, ny] = normalizePoint(1280, 480, 0, 960)
      expect(nx).toBeCloseTo(1280 / FALLBACK_WIDTH, 10)
      expect(ny).toBeCloseTo(0.5, 10)
    })
  })

  describe('不做 clamp —— 钳制责任在调用方', () => {
    it('超出帧尺寸的像素原样透传 (契约明写, 供调用方按语义决定)', () => {
      const [nx, ny] = normalizePoint(2560, 1920, 1280, 960)
      expect(nx).toBe(2)
      expect(ny).toBe(2)
    })

    it('clamp01 独立可用 (useAlarmShapes.ts:92 的告警形状路径依赖)', () => {
      expect(clamp01(-0.5)).toBe(0)
      expect(clamp01(0.5)).toBe(0.5)
      expect(clamp01(1.5)).toBe(1)
    })
  })

  describe('与后端 RoiCoordinateSchema.h 的镜像一致性', () => {
    it('三个常量值 = 后端 kPixelHeuristicThreshold / kFallbackFrameWidth / Height', () => {
      // 与 box-sdk/include/core/RoiCoordinateSchema.h 逐值对齐;
      // 数值漂移由 scripts/check_roi_schema_sync.py 阻断, 此处锁函数侧同源假设
      expect(PIXEL_HEURISTIC_THRESHOLD).toBe(1.5)
      expect(FALLBACK_WIDTH).toBe(1920)
      expect(FALLBACK_HEIGHT).toBe(1080)
    })
  })
})
