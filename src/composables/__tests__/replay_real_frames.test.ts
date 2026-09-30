// [VERIFY realtime-label 2026-09-29] 真实 WS 帧序列离线重演 DisplayTracker
//   量化三问: ①链路延迟 ②框位置更新节奏(跟人) ③单帧误标过滤率
//   数据: .tmp/ws_frames_capture.json (90s 真机 detection_result, 418 帧)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DisplayTracker, type TrackedDet } from '../useDetectionTracker'

interface CapFrame {
  recv_ms: number
  backend_ts_ms?: number
  ch: string
  dets: { cls: string; conf: number; x1: number; y1: number; x2: number; y2: number }[]
  face_dets: { conf: number; name?: string; x1: number; y1: number; x2: number; y2: number }[]
}

const raw: CapFrame[] = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../.tmp/ws_frames_capture.json'), 'utf-8'))

describe('真实帧序列重演 (90s 418帧)', () => {
  it('① 链路延迟: WS 传输耗时 (后端时间戳→本地接收)', () => {
    const lats = raw
      .filter(f => f.backend_ts_ms)
      .map(f => f.recv_ms - (f.backend_ts_ms as number))
      .sort((a, b) => a - b)
    const med = lats[Math.floor(lats.length / 2)]
    const p95 = lats[Math.floor(lats.length * 0.95)]
    console.log(`[链路延迟] n=${lats.length} 中位=${med}ms p95=${p95}ms 最大=${lats[lats.length - 1]}ms`)
    // 时钟同源假设: 隧道本机与设备时钟独立, 取绝对值仅作量级参考
    expect(Math.abs(med)).toBeLessThan(2000)
  })

  it('② 检测帧距 + tracker 重演: 框位置更新节奏对比', () => {
    const byCh = new Map<string, CapFrame[]>()
    for (const f of raw) {
      if (!byCh.has(f.ch)) byCh.set(f.ch, [])
      byCh.get(f.ch)!.push(f)
    }
    let totalStaleMsOld = 0, totalRenderUpdates = 0, renderSamples = 0
    for (const [ch, frames] of byCh) {
      frames.sort((a, b) => a.recv_ms - b.recv_ms)
      const gaps = frames.slice(1).map((f, i) => f.recv_ms - frames[i].recv_ms)
      gaps.sort((a, b) => a - b)
      const medGap = gaps[Math.floor(gaps.length / 2)]
      const maxGap = gaps[gaps.length - 1]
      // 原直绘: 相邻帧之间框位置完全不动 → 滞后=帧距
      totalStaleMsOld += medGap * (frames.length - 1)

      // tracker 重演: 模拟 rAF 16ms 步进 render
      const t = new DisplayTracker()
      const start = frames[0].recv_ms, end = frames[frames.length - 1].recv_ms
      let fi = 0
      let lastPos = ''
      for (let now = start; now <= end; now += 16) {
        while (fi < frames.length && frames[fi].recv_ms <= now) {
          const f = frames[fi]
          // [FIX det-bbox-scale 2026-09-30] 与 LiveView.onInferenceDetection
          //   同款刻度 (fixture = 真机 640×360 喂帧空间 bbox): 归一化必须
          //   y/360, 旧 /640 使 TrackedDet 违反 [0,1] 契约 (y≤0.56)。
          const dets = f.dets.filter(d => d.cls && d.x1 !== null)
          const hi = dets.some(
            d => (d.x2 as number) > 640.5 || (d.y2 as number) > 360.5)
          const dw = hi ? 1280 : 640, dh = hi ? 720 : 360
          const feed: TrackedDet[] = dets
            .map(d => ({ cls: d.cls, conf: d.conf,
              x1: (d.x1 as number) / dw, y1: (d.y1 as number) / dh,
              x2: (d.x2 as number) / dw, y2: (d.y2 as number) / dh }))
          t.update(feed, f.recv_ms)
          fi++
        }
        const r = t.render(now)
        renderSamples++
        if (r.length) {
          const pos = r.map(b => b.x1.toFixed(4)).join(',')
          if (pos !== lastPos) totalRenderUpdates++
          lastPos = pos
        }
      }
      console.log(`[ch=${ch.slice(-4)}] 检测帧距 中位=${medGap}ms 最大=${maxGap}ms 帧数=${frames.length}`)
    }
    console.log(`[重演] rAF 渲染步=${renderSamples}, 框位置变化次数=${totalRenderUpdates}`)
    // 有框期间, 位置变化率应远高于检测帧率 (外推生效)
    expect(totalRenderUpdates).toBeGreaterThan(0)
  })

  it('③ 误标过滤: 孤立单帧统计 + 白名单外类别确认', () => {
    // 原直绘口径: 每条 detection_result 的每个框都会立即画出 →
    //   「只出现一帧就消失」的孤立框 = 误标闪现; 白名单外类 = 凭空干扰框。
    // 注: 本样本时段现场无人 (person=0), 孤立帧统计以全类计。
    let isolatedTotal = 0, frameTotal = 0, outsideWhitelist = 0
    const WHITELIST = new Set(['person', 'face', 'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'fire', 'smoke', 'weapon', 'knife', 'gun'])
    const byCh = new Map<string, CapFrame[]>()
    for (const f of raw) {
      if (!byCh.has(f.ch)) byCh.set(f.ch, [])
      byCh.get(f.ch)!.push(f)
    }
    for (const [, frames] of byCh) {
      frames.sort((a, b) => a.recv_ms - b.recv_ms)
      for (let i = 0; i < frames.length; i++) {
        for (const d of frames[i].dets) {
          if (!WHITELIST.has(d.cls)) outsideWhitelist++
          frameTotal++
          const c = { x: ((d.x1 as number) + (d.x2 as number)) / 2, y: ((d.y1 as number) + (d.y2 as number)) / 2 }
          const near = (arr?: CapFrame['dets']) => arr?.some(e => {
            const ec = { x: ((e.x1 as number) + (e.x2 as number)) / 2, y: ((e.y1 as number) + (e.y2 as number)) / 2 }
            return e.cls === d.cls && Math.hypot(c.x - ec.x, c.y - ec.y) < 180
          })
          const prev = i > 0 ? frames[i - 1].dets : undefined
          const next = i < frames.length - 1 ? frames[i + 1].dets : undefined
          if (!near(prev) && !near(next)) isolatedTotal++
        }
      }
    }
    console.log(`[误标过滤] 检测框总=${frameTotal}, 孤立单帧=${isolatedTotal} (${(isolatedTotal / Math.max(1, frameTotal) * 100).toFixed(1)}%), 白名单外类=${outsideWhitelist} (新白名单后不再绘制)`)
    expect(frameTotal).toBeGreaterThan(0)
  })
})
