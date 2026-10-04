/**
 * useAlarmShapes.metaRoiFrame.test.ts — [FIX p1-13-5srv 2026-10-04] 缺陷 13-5 服务端根治
 *
 * 背景：13-5 前端以 chFrameOf(channelId) 作为 ROI 归一除数, 但仍需面对
 *   两型场景:
 *     A. 插件已知推理帧尺寸而前端通道目录 resolution 缺失;
 *     B. 历史像素形态存量区域库数据 —— 弹窗形状链需要与插件 isInRegion 同尺。
 *   本批 intrusion_detector.cpp:720-790 冻结像素形态 alarm_shapes 时同报
 *   `meta["roi_frame"]=[w,h]` (与 isInRegion L1062-L1065 判定同尺)。
 *   前端 `metaRoiFrameOf(metadata)` 提取该字段, AlarmSnapshot/SnapshotAnnotated
 *   `shapeFrame` computed 优先取本字段, 回退 chFrameOf。
 *
 * 判据纪律 (每条都要能被「坏实现」证伪):
 *   ① 双层壳 m[0].roi_frame 命中 → 返回 {w,h} (坏实现: 未识别 m[0] → undefined);
 *   ② 单层 m.roi_frame 命中 → 返回 {w,h} (坏实现: 只看双层壳 → undefined);
 *   ③ 无 roi_frame → undefined → 调用方回退 chFrameOf (兼容旧告警);
 *   ④ 脏数据保护: 非数组 / 长度 <2 / w|h ≤ 0 / NaN → undefined
 *      (坏实现: 直接返回 {w:NaN,h:NaN} 让 normPoints 得 Inf → 红);
 *   ⑤ AlarmSnapshot 接线: props.alarmShapesFrame 优先于 chFrameOf
 *      (坏实现: 反序 → 精确基准失效);
 *   ⑥ SnapshotAnnotated 接线: metaRoiFrame 优先于 chFrameOf
 *      (坏实现: 忘接 → 事件面板与弹窗不同源);
 *   ⑦ 向后兼容: 无本字段时 shapeFrame 完全等价 chFrameOf, 13-5 契约不变。
 */
import { describe, it, expect } from 'vitest'
import { metaRoiFrameOf } from '../useAlarmShapes'

describe('useAlarmShapes 13-5 服务端根治接线 (metaRoiFrameOf)', () => {
  it('① 双层壳 m[0].roi_frame → 提取 {w,h}', () => {
    const meta = [{ roi_frame: [1280, 720], alarm_shapes: [] }]
    expect(metaRoiFrameOf(meta)).toEqual({ w: 1280, h: 720 })
  })

  it('② 单层 m.roi_frame → 提取 {w,h}', () => {
    const meta = { roi_frame: [1920, 1080] }
    expect(metaRoiFrameOf(meta)).toEqual({ w: 1920, h: 1080 })
  })

  it('③ 无 roi_frame → undefined (旧告警/其它插件保持 13-5 chFrameOf 回退)', () => {
    expect(metaRoiFrameOf({})).toBeUndefined()
    expect(metaRoiFrameOf({ alarm_shapes: [] })).toBeUndefined()
    expect(metaRoiFrameOf(undefined)).toBeUndefined()
    expect(metaRoiFrameOf(null)).toBeUndefined()
  })

  it('④ 脏数据保护: 非数组/短数组/w≤0/h≤0/NaN → undefined', () => {
    expect(metaRoiFrameOf({ roi_frame: 'not-array' })).toBeUndefined()
    expect(metaRoiFrameOf({ roi_frame: [1280] })).toBeUndefined()  // 长度 <2
    expect(metaRoiFrameOf({ roi_frame: [0, 720] })).toBeUndefined()  // w≤0
    expect(metaRoiFrameOf({ roi_frame: [1280, -1] })).toBeUndefined()  // h<0
    expect(metaRoiFrameOf({ roi_frame: ['abc', 'def'] })).toBeUndefined()  // NaN
  })

  it('⑤ 与 isInRegion 同尺: 插件端 infer_frame_w_/h_ 直接透传', () => {
    // 640×360 子码流场景 (真机 intr-frame-base 2026-09-08 实锚)
    expect(metaRoiFrameOf({ roi_frame: [640, 360] })).toEqual({ w: 640, h: 360 })
    // 1920×1080 主码流场景
    expect(metaRoiFrameOf({ roi_frame: [1920, 1080] })).toEqual({ w: 1920, h: 1080 })
  })
})

// ── 组件接线判据 (只验 shapeFrame 依赖 props/metaRoiFrameOf 优先) ──
//   AlarmSnapshot 接 props.alarmShapesFrame → shapeFrame computed 优先;
//   SnapshotAnnotated 接 props.metadata → metaRoiFrame → shapeFrame 优先。
//   vue 组件级 mount 需要 @vue/test-utils + jsdom 成本较大, 且 S32/S33
//   静态门禁已能锁接线形态不回退; 此处仅锁 metaRoiFrameOf 自身的
//   纯函数语义 (⑤ 与 S32/S33 门禁互补: 单测锁语义、门禁锁接线)。
