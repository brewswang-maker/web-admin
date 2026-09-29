// [P2-TRACK 2026-09-29] DisplayTracker 单测: 标注实时性改造的核心行为锁定
//   (单帧误检过滤 / 确认显示 / 丢失外推渐隐 / 中心距兜底 / name sticky)
import { describe, it, expect } from 'vitest'
import { DisplayTracker, type TrackedDet } from '../useDetectionTracker'

const det = (over: Partial<TrackedDet> = {}): TrackedDet => ({
  cls: 'person', conf: 0.8,
  x1: 0.4, y1: 0.3, x2: 0.5, y2: 0.6,
  ...over,
})

describe('DisplayTracker', () => {
  it('低置信单帧孤立误检不显示 (minHits 确认过滤)', () => {
    const t = new DisplayTracker()
    t.update([det({ conf: 0.45 })], 1000)
    expect(t.render(1100)).toHaveLength(0)  // 首帧: 待确认不画
  })

  it('高置信单帧直通显示 (快照兑底通道, 对标 ByteTrack 首帧激活)', () => {
    // 快照兑底通道 2~3.5s/帧: 真人走过仅 1 帧命中, 若强制 minHits=2
    //   则结构性永不出框 (真机 2004 实测 2026-09-29)
    const t = new DisplayTracker()
    t.update([det({ conf: 0.72 })], 1000)
    const r = t.render(1100)
    expect(r).toHaveLength(1)
    expect(r[0].alpha).toBe(1)
  })

  it('连续两帧确认后显示', () => {
    const t = new DisplayTracker()
    t.update([det()], 1000)
    t.update([det()], 1550)  // 550ms 后第二帧
    const r = t.render(1600)
    expect(r).toHaveLength(1)
    expect(r[0].alpha).toBe(1)
  })

  it('丢失后影子外推 → 渐隐 → 删除 (生命周期 ≤500ms)', () => {
    const t = new DisplayTracker()
    t.update([det()], 1000)
    t.update([det({ x1: 0.5, x2: 0.6 })], 1550)  // confirmed, 有向右速度
    expect(t.render(1600)).toHaveLength(1)
    // 丢失: 200ms 处仍在影子期(外推继续右移), alpha=1;
    //   外推位置应大于丢失瞬间静止基准 (速度 EMA 首帧减半, 用相对断言)
    const baseX1 = t.render(1600)[0].x1
    const shadow = t.render(1750)
    expect(shadow).toHaveLength(1)
    expect(shadow[0].alpha).toBe(1)
    expect(shadow[0].x1).toBeGreaterThan(baseX1)  // 外推右移
    // 400ms 处进入渐隐期: 位置冻结, alpha 线性衰减
    const fading = t.render(1950)
    expect(fading).toHaveLength(1)
    expect(fading[0].alpha).toBeGreaterThan(0)
    expect(fading[0].alpha).toBeLessThan(1)
    // 350+150ms 后彻底消失 (离场→消失 ≤500ms)
    expect(t.render(2150)).toHaveLength(0)
  })

  it('IoU=0 但中心距近的快速位移仍可关联 (centerDist 兑底)', () => {
    const t = new DisplayTracker()
    t.update([det()], 1000)
    // 550ms 内大位移 → IoU=0, 但中心距 <0.28 且面积同量级
    t.update([det({ x1: 0.62, y1: 0.3, x2: 0.72, y2: 0.6 })], 1550)
    const r = t.render(1600)
    expect(r).toHaveLength(1)  // 若判为新目标则 hits=1 不显示
  })

  it('face name sticky: 识别抖动不闪名', () => {
    const t = new DisplayTracker()
    t.update([det({ cls: 'face', name: '张三', groupType: 3 })], 1000)
    t.update([det({ cls: 'face' })], 1550)  // 本帧识别未命中
    const r = t.render(1600)
    expect(r[0].name).toBe('张三')
  })

  it('reset 清空所有 track', () => {
    const t = new DisplayTracker()
    t.update([det()], 1000)
    t.update([det()], 1550)
    t.reset()
    expect(t.size).toBe(0)
    expect(t.render(1600)).toHaveLength(0)
  })

  it('cls 隔离: person det 不被吸进 face track (中心距兑底跨类防护)', () => {
    const t = new DisplayTracker()
    t.update([det({ cls: 'face', conf: 0.9, x1: 0.35, y1: 0.05, x2: 0.65, y2: 0.45 })], 1000)
    t.update([det({ cls: 'face', conf: 0.9, x1: 0.35, y1: 0.05, x2: 0.65, y2: 0.45 })], 1200)
    // face det 大位移 (IoU=0, 中心距 0.3>0.28 失配 → 右建新 track);
    //   person det 与原 face track 中心距 0.25<0.28 且面积比在约束内 —
    //   无 cls 隔离时 person det 会被吸进 face track (位置被拉向人身体)
    t.update([
      det({ cls: 'face', conf: 0.9, x1: 0.05, y1: 0.05, x2: 0.35, y2: 0.45 }),
      det({ cls: 'person', conf: 0.7, x1: 0.42, y1: 0.2, x2: 0.58, y2: 0.8 }),
    ], 1400)
    const r = t.render(1500)
    const oldFace = r.find(b => b.cls === 'face' && b.x1 > 0.3 && b.y2 < 0.5)
    expect(oldFace).toBeDefined()   // 原 face track 位置未被 person det 拉走
    expect(r.filter(b => b.cls === 'person')).toHaveLength(1)  // person 独立成框
  })
})
