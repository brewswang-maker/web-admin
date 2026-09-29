// [P2-TRACK 2026-09-29] 检测框显示跟踪器（Display Tracker）
//   对标依据（一手公开资料，检索日期 2026-09-29）:
//   - NVIDIA DeepStream 官方文档: 低频检测 + tracker 预测位置是官方推荐架构
//     ("infer every other frame and use a tracker to predict the location",
//     docs.nvidia.com/metropolis/deepstream), 目标生命周期含
//     maxShadowTrackingAge(丢失后影子跟踪) / probationAge(试探期确认)。
//   - Frigate 官方文档: 默认 5fps 检测帧率, 直播流与检测流解耦,
//     检测框在客户端叠加 ("processes at 5 fps ... live view" docs.frigate.video)。
//   - 算能 sophon-stream 官方: 检测插件 + ByteTrack 插件按图编排串联
//     (github.com/sophgo/sophon-stream)。
//   本项目后端检测链实测 (2026-09-29 WS 取证): detection_result 单通道中位
//   550ms/帧, p90 1.6~1.8s, 长尾 4.3s。原实现把离散快照直绘 → 框在两次检测
//   间完全静止(不跟人), 误检单帧即显示(误标), 断流后靠 5s 过期才清(残影)。
//   本跟踪器在渲染侧闭环业界同构能力:
//     1) IoU+中心距匹配 → 相邻检测帧的目标关联(穿门帘级抖动容错)
//     2) 匀速外推(速度 EMA) → rAF 60fps 连续插值, 框跟着人走
//     3) minHits 确认 → 单帧孤立误检(阴影/行李误报)不显示;
//        高置信(≥0.6)单帧直通 — 快照兑底通道 2~3.5s/帧下 minHits
//        结构性凑不齐, 直通对齐 ByteTrack 首帧激活先例
//     4) shadow 外推(≤MAX_SHADOW_MS) + 渐隐(FADE_MS) → 目标离场
//        ≤500ms 平滑消失(对标 DeepStream shadow→terminate 生命周期,
//        maxShadowTrackingAge 默认 38 帧)
//   纯 TS 无 Vue 依赖, 便于 vitest 单测。

/** 单个检测输入(已完成坐标系归一化到 [0,1]) */
export interface TrackedDet {
  cls: string
  conf: number
  x1: number; y1: number; x2: number; y2: number
  /** face 识别结论(sticky: 一旦命中即保留, 识别抖动不闪名) */
  name?: string
  groupName?: string
  groupType?: number
  sim?: number
  warn?: boolean
}

/** 渲染输出: 外推后的显示框(alpha 用于淡出) */
export interface RenderedBox extends TrackedDet {
  alpha: number
  trackId: number
}

interface Track {
  id: number
  det: TrackedDet
  /** 中心速度 (归一化单位/秒), EMA 平滑 */
  vx: number; vy: number
  hits: number
  lastSeen: number
}

export interface TrackerTuning {
  /** IoU 匹配门限 (低于则视为新目标) */
  iouMatch?: number
  /** 中心距兜底门限(归一化, 快速位移时 IoU 失效仍可关联) */
  centerDist?: number
  /** 连续命中达到该值才显示 (单帧误检过滤, 对标 DeepStream probationAge) */
  minHits?: number
  /** 丢失后影子外推时长 ms (对标 DeepStream maxShadowTrackingAge) */
  maxShadowMs?: number
  /** 影子超时后渐隐时长 ms */
  fadeMs?: number
}

const DEFAULTS: Required<TrackerTuning> = {
  iouMatch: 0.25,
  centerDist: 0.28,
  minHits: 2,
  // [TUNE shadow<500 2026-09-29] 残影生命周期 1000+400→350+150=500ms:
  //   用户实测「人已离场框还在 (1.4s)」不可接受, 压到 ≤500ms。
  //   低帧供给通道的间隙闪烁不再靠长影子兜底, 改由「高置信直通」
  //   (DIRECT_CONFIRM_CONF) 让单帧命中即显示, 补齐检测间隙。
  maxShadowMs: 350,
  fadeMs: 150,
}

// [FIX direct-confirm 2026-09-29] 高置信单帧直通阈值 (对标一手资料, 检索
//   同日): ByteTrack activate() 首帧 is_activated=true 单帧激活先例 +
//   新轨迹门槛 det_thresh=track_thresh+0.1 典型 0.6 (github.com/ifzhang/
//   ByteTrack yolox/tracker/byte_tracker.py); NVIDIA 官方论坛低帧率调优
//   配置 probationAge:0 (forums.developer.nvidia.com tuning-nvdcf-tracker-
//   for-low-fps)。因果: 快照兑底通道供给 2~3.5s/帧 (真机 2004 实测
//   getSnapshot sync 1.86s/张 + idle gate ×3), minHits=2 结构性凑不齐
//   (人走过仅 1 帧命中, 下一帧早已 IoU/中心距双失配) = 「真人不出框」
//   机制性根因。0.6 以上单帧直显; 误检防线不弱化: 低置信单帧仍需
//   minHits 确认 + 后端形状防火墙/STATIC-CELL 前置已拦。
const DIRECT_CONFIRM_CONF = 0.6

function iou(a: TrackedDet, b: TrackedDet): number {
  const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1)
  const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
  const union = areaA + areaB - inter
  return union > 0 ? inter / union : 0
}

export class DisplayTracker {
  private tracks: Track[] = []
  private nextId = 1
  private tuning: Required<TrackerTuning>

  constructor(tuning?: TrackerTuning) {
    this.tuning = { ...DEFAULTS, ...tuning }
  }

  /** 注入一帧检测结果(now=performance.now()/Date.now() 口径, ms) */
  update(dets: TrackedDet[], now: number): void {
    const unmatchedDets = new Set(dets.map((_, i) => i))

    // 贪心匹配: 按候选分数(IoU 优先, 中心距兜底)降序逐对关联。
    //   [FIX cls-isolation 2026-09-29] 同类隔离: face 框套在人头部, 与 person
    //   框中心距可 <0.28 (中心距兜底) 而 IoU 不足 — face 框回位后 (双态修复)
    //   两类互吸会把 person track 拉到脸上/互相抖动。cls 不同不参与匹配。
    interface Cand { ti: number; di: number; score: number; byIou: boolean }
    const cands: Cand[] = []
    this.tracks.forEach((t, ti) => {
      dets.forEach((d, di) => {
        if (t.det.cls !== d.cls) return
        const ov = iou(t.det, d)
        if (ov >= this.tuning.iouMatch) {
          cands.push({ ti, di, score: ov, byIou: true })
          return
        }
        // 中心距兜底: 550ms~数秒位移下 IoU 可为 0(人快速走动),
        // 中心足够近且面积同量级视为同一目标
        const cax = (t.det.x1 + t.det.x2) / 2, cay = (t.det.y1 + t.det.y2) / 2
        const cbx = (d.x1 + d.x2) / 2, cby = (d.y1 + d.y2) / 2
        const dist = Math.hypot(cax - cbx, cay - cby)
        const areaT = (t.det.x2 - t.det.x1) * (t.det.y2 - t.det.y1)
        const areaD = (d.x2 - d.x1) * (d.y2 - d.y1)
        if (dist <= this.tuning.centerDist &&
            areaD > areaT * 0.4 && areaD < areaT * 2.5) {
          cands.push({ ti, di, score: 1 - dist / this.tuning.centerDist * 0.5, byIou: false })
        }
      })
    })
    cands.sort((a, b) => b.score - a.score)

    const usedT = new Set<number>()
    for (const c of cands) {
      if (usedT.has(c.ti) || !unmatchedDets.has(c.di)) continue
      usedT.add(c.ti)
      unmatchedDets.delete(c.di)
      const t = this.tracks[c.ti]
      const d = dets[c.di]
      const prev = t.det
      const dt = Math.min(2, Math.max(0.001, (now - t.lastSeen) / 1000))
      const pcx = (prev.x1 + prev.x2) / 2, pcy = (prev.y1 + prev.y2) / 2
      const ncx = (d.x1 + d.x2) / 2, ncy = (d.y1 + d.y2) / 2
      // 速度 EMA (α=0.5): 两次观测的瞬时速度平滑, 供丢失期外推
      t.vx = t.vx * 0.5 + ((ncx - pcx) / dt) * 0.5
      t.vy = t.vy * 0.5 + ((ncy - pcy) / dt) * 0.5
      // 位置 EMA (α=0.65 新值权重高): 去抖同时保持跟手
      const blend = (o: number, n: number) => o * 0.35 + n * 0.65
      const merged: TrackedDet = {
        ...d,
        x1: blend(prev.x1, d.x1), y1: blend(prev.y1, d.y1),
        x2: blend(prev.x2, d.x2), y2: blend(prev.y2, d.y2),
        // name/分组 sticky: 识别结论一旦命中即保留, 无名帧不冲掉
        name: d.name || prev.name,
        groupName: d.groupName || prev.groupName,
        groupType: d.groupType ?? prev.groupType,
        sim: d.sim ?? prev.sim,
        warn: d.warn || prev.warn,
      }
      t.det = merged
      t.hits += 1
      t.lastSeen = now
    }

    // 未匹配 det → 新 track。高置信单帧直通确认 (见 DIRECT_CONFIRM_CONF
    //   注释), 低置信维持 hits=1 待 minHits 确认。
    for (const di of unmatchedDets) {
      const d = dets[di]
      this.tracks.push({
        id: this.nextId++,
        det: { ...d },
        vx: 0, vy: 0,
        hits: d.conf >= DIRECT_CONFIRM_CONF ? this.tuning.minHits : 1,
        lastSeen: now,
      })
    }

    // 回收: 影子超时(含渐隐完毕)的 track 删除。
    //   丢失判定基于 lastSeen (而非仅在 update 时打标): 检测断流后无新
    //   update 调用, render 仍能按 lastSeen 推进生命周期 (否则断流期
    //   track 永远「在线」→ 残影复污)。
    this.tracks = this.tracks.filter(t =>
      now - t.lastSeen <= this.tuning.maxShadowMs + this.tuning.fadeMs)
  }

  /**
   * 渲染帧: 返回当前应显示的框(含逐帧外推位置与淡出 alpha)。
   * rAF 每帧调用; 无新检测输入时 track 仍按速度外推(显示连续)。
   */
  render(now: number): RenderedBox[] {
    const out: RenderedBox[] = []
    for (const t of this.tracks) {
      // 未确认 (hits < minHits): 不显示 — 单帧孤立误检过滤;
      // 确认后的 track 丢失期照常显示 (外推/渐隐)。
      if (t.hits < this.tuning.minHits) continue

      let alpha = 1
      let { x1, y1, x2, y2 } = t.det
      const lostMs = now - t.lastSeen
      if (lostMs > 0) {
        if (lostMs > this.tuning.maxShadowMs + this.tuning.fadeMs) continue
        if (lostMs <= this.tuning.maxShadowMs) {
          // 影子期: 匀速外推 (dt clamp 防长尾断流时外推爆炸)
          const dt = Math.min(0.5, lostMs / 1000)
          const cx = (x1 + x2) / 2 + t.vx * dt
          const cy = (y1 + y2) / 2 + t.vy * dt
          const w = x2 - x1, h = y2 - y1
          // 中心 clamp 在画面内, 尺寸不膨胀
          const ncx = Math.min(1, Math.max(0, cx))
          const ncy = Math.min(1, Math.max(0, cy))
          x1 = ncx - w / 2; y1 = ncy - h / 2; x2 = ncx + w / 2; y2 = ncy + h / 2
          // 影子期 alpha 保持 1: 检测间隙 (中位 550ms) 常态 lostMs>0,
          // 若给 0.9 则所有框常态半透明; 仅渐隐期衰减才有视觉意义。
          alpha = 1
        } else {
          // 渐隐期: 位置冻结在影子终点, alpha 线性衰减
          x1 = Math.min(1, Math.max(0, x1)); y1 = Math.min(1, Math.max(0, y1))
          x2 = Math.min(1, Math.max(0, x2)); y2 = Math.min(1, Math.max(0, y2))
          alpha = Math.max(0, 1 - (lostMs - this.tuning.maxShadowMs) / this.tuning.fadeMs)
        }
      }
      out.push({ ...t.det, x1, y1, x2, y2, alpha, trackId: t.id })
    }
    return out
  }

  /** 清空(通道下墙/切换时) */
  reset(): void {
    this.tracks = []
  }

  /** 当前 track 数(调试) */
  get size(): number { return this.tracks.length }
}
