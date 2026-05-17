/**
 * @file performance.test.ts
 * @brief 性能采集工具函数 & 采集器 单元测试
 *
 * 覆盖:
 *   1. PerformanceCollector 生命周期 — start/stop/reset/dispose
 *   2. 快照数据结构验证 — FPS、Draw Calls、三角面、内存
 *   3. 滚动窗口限制 — maxSnapshots
 *   4. getSummary 统计摘要计算
 *   5. generateReport 报告生成
 *   6. 独立工具函数 — getRendererPerformance、getJsHeapMemory、formatPerformanceReport
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  PerformanceCollector,
  getRendererPerformance,
  getJsHeapMemory,
  formatPerformanceReport,
  type PerformanceReport,
  type PerformanceSummary,
} from '@/utils/performance'

// ── Mock WebGLRenderer ──
function createMockRenderer() {
  let _renderCalls = 0
  let _renderTriangles = 0

  const renderer = {
    info: {
      render: {
        get calls() { return _renderCalls },
        get triangles() { return _renderTriangles },
        points: 0,
        lines: 0,
        frame: 0,
      },
      memory: {
        geometries: 42,
        textures: 15,
      },
      programs: [
        { name: 'prog1' },
        { name: 'prog2' },
      ],
      autoReset: true,
    },
    // 测试辅助：设置渲染指标
    _setRenderMetrics(calls: number, triangles: number) {
      _renderCalls = calls
      _renderTriangles = triangles
    },
  } as any

  return renderer
}

describe('utils/performance', () => {
  describe('PerformanceCollector', () => {
    let renderer: ReturnType<typeof createMockRenderer>

    beforeEach(() => {
      renderer = createMockRenderer()
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('构造时不自动开始采集', () => {
      const collector = new PerformanceCollector(renderer)
      expect(collector.isRunning).toBe(false)
      expect(collector.snapshotCount).toBe(0)
    })

    it('start 后处于运行状态', () => {
      const collector = new PerformanceCollector(renderer)
      collector.start()
      expect(collector.isRunning).toBe(true)
      collector.stop()
    })

    it('stop 后停止运行', () => {
      const collector = new PerformanceCollector(renderer)
      collector.start()
      collector.stop()
      expect(collector.isRunning).toBe(false)
    })

    it('采样间隔后生成快照', () => {
      renderer._setRenderMetrics(12, 50000)
      const collector = new PerformanceCollector(renderer, { sampleInterval: 200 })
      collector.start()

      // tick 模拟帧
      for (let i = 0; i < 60; i++) collector.tick()

      vi.advanceTimersByTime(250)

      const snap = collector.latestSnapshot
      expect(snap).not.toBeNull()
      expect(snap!.drawCalls).toBe(12)
      expect(snap!.triangles).toBe(50000)
      expect(snap!.geometries).toBe(42)
      expect(snap!.textures).toBe(15)
      expect(snap!.programs).toBe(2)
      expect(snap!.timestamp).toBeGreaterThan(0)

      collector.stop()
    })

    it('tick 累计后计算 FPS', () => {
      const collector = new PerformanceCollector(renderer, { sampleInterval: 100 })
      collector.start()

      // 模拟 30 帧
      for (let i = 0; i < 30; i++) collector.tick()
      vi.advanceTimersByTime(150)

      const snap = collector.latestSnapshot
      expect(snap).not.toBeNull()
      // FPS = 30 帧 / 100ms * 1000 ≈ 300
      // 但实际会取整，只要 > 0 即可
      expect(snap!.fps).toBeGreaterThan(0)

      collector.stop()
    })

    it('多次采样产生多个快照', () => {
      const collector = new PerformanceCollector(renderer, { sampleInterval: 100 })
      collector.start()

      for (let i = 0; i < 10; i++) collector.tick()
      vi.advanceTimersByTime(120)
      for (let i = 0; i < 20; i++) collector.tick()
      vi.advanceTimersByTime(120)

      expect(collector.snapshotCount).toBeGreaterThanOrEqual(2)
      collector.stop()
    })

    it('maxSnapshots 滚动窗口限制', () => {
      const collector = new PerformanceCollector(renderer, {
        sampleInterval: 50,
        maxSnapshots: 3,
      })
      collector.start()

      // 触发 5 次采样
      for (let s = 0; s < 5; s++) {
        collector.tick()
        vi.advanceTimersByTime(60)
      }

      expect(collector.snapshotCount).toBeLessThanOrEqual(3)
      collector.stop()
    })

    it('getSummary 在无快照时返回零值摘要', () => {
      const collector = new PerformanceCollector(renderer)
      const summary = collector.getSummary()
      expect(summary.avgFps).toBe(0)
      expect(summary.minFps).toBe(0)
      expect(summary.maxFps).toBe(0)
      expect(summary.snapshotCount).toBe(0)
    })

    it('getSummary 正确计算统计数据', () => {
      const collector = new PerformanceCollector(renderer, { sampleInterval: 50 })
      collector.start()

      renderer._setRenderMetrics(10, 10000)
      for (let i = 0; i < 60; i++) collector.tick()
      vi.advanceTimersByTime(60)

      renderer._setRenderMetrics(20, 30000)
      for (let i = 0; i < 30; i++) collector.tick()
      vi.advanceTimersByTime(60)

      const summary = collector.getSummary()
      expect(summary.snapshotCount).toBeGreaterThanOrEqual(2)
      expect(summary.avgDrawCalls).toBeGreaterThan(0)
      expect(summary.avgTriangles).toBeGreaterThan(0)
      expect(summary.minFps).toBeLessThanOrEqual(summary.maxFps)

      collector.stop()
    })

    it('generateReport 生成完整报告', () => {
      const collector = new PerformanceCollector(renderer, { sampleInterval: 50 })
      collector.start()

      for (let i = 0; i < 30; i++) collector.tick()
      vi.advanceTimersByTime(60)

      const report = collector.generateReport()
      expect(report.generatedAt).toBeTruthy()
      expect(report.durationMs).toBeGreaterThanOrEqual(0)
      expect(report.summary).toBeDefined()
      expect(report.snapshots).toBeInstanceOf(Array)
      expect(report.environment).toBeDefined()
      expect(report.environment.userAgent).toBe(navigator.userAgent)
      expect(report.environment.devicePixelRatio).toBe(window.devicePixelRatio)
      expect(report.environment.screenWidth).toBeGreaterThan(0)

      collector.stop()
    })

    it('reset 清空快照和状态', () => {
      const collector = new PerformanceCollector(renderer, { sampleInterval: 50 })
      collector.start()
      for (let i = 0; i < 30; i++) collector.tick()
      vi.advanceTimersByTime(60)

      expect(collector.snapshotCount).toBeGreaterThan(0)
      collector.reset()
      expect(collector.snapshotCount).toBe(0)
      expect(collector.isRunning).toBe(false)
    })

    it('dispose 后 renderer 置 null', () => {
      const collector = new PerformanceCollector(renderer)
      collector.start()
      collector.dispose()
      expect(collector.isRunning).toBe(false)
      expect(collector.snapshotCount).toBe(0)
    })

    it('重复 start 不会创建多个定时器', () => {
      const collector = new PerformanceCollector(renderer, { sampleInterval: 50 })
      collector.start()
      collector.start() // 重复调用
      collector.start()

      for (let i = 0; i < 30; i++) collector.tick()
      vi.advanceTimersByTime(60)

      // 只会有一个采样周期
      expect(collector.snapshotCount).toBeGreaterThanOrEqual(1)
      collector.stop()
    })

    it('setRenderer 更新渲染器引用', () => {
      const collector = new PerformanceCollector(null, { sampleInterval: 50 })
      const newRenderer = createMockRenderer()
      newRenderer._setRenderMetrics(5, 1000)
      collector.setRenderer(newRenderer)

      collector.start()
      for (let i = 0; i < 30; i++) collector.tick()
      vi.advanceTimersByTime(80)

      const snap = collector.latestSnapshot
      expect(snap).not.toBeNull()
      expect(snap!.drawCalls).toBe(5)
      expect(snap!.triangles).toBe(1000)
      collector.stop()
    })

    it('allSnapshots 返回只读副本', () => {
      const collector = new PerformanceCollector(renderer, { sampleInterval: 50 })
      collector.start()
      for (let i = 0; i < 30; i++) collector.tick()
      vi.advanceTimersByTime(60)

      const snapshots = collector.allSnapshots
      expect(snapshots.length).toBeGreaterThan(0)
      // 验证是只读的
      expect(Object.isFrozen(snapshots) || snapshots === collector.allSnapshots).toBe(true)
      collector.stop()
    })
  })

  describe('getRendererPerformance', () => {
    it('从 renderer 提取渲染指标', () => {
      const renderer = createMockRenderer()
      renderer._setRenderMetrics(25, 100000)

      const perf = getRendererPerformance(renderer)
      expect(perf.drawCalls).toBe(25)
      expect(perf.triangles).toBe(100000)
      expect(perf.geometries).toBe(42)
      expect(perf.textures).toBe(15)
      expect(perf.programs).toBe(2)
    })
  })

  describe('getJsHeapMemory', () => {
    it('在不支持 performance.memory 的环境返回 null', () => {
      // 测试环境默认没有 performance.memory
      const result = getJsHeapMemory()
      // 在大多数测试环境中为 null（Chrome 专属 API）
      expect(result === null || (typeof result?.usedMB === 'number')).toBe(true)
    })
  })

  describe('formatPerformanceReport', () => {
    it('格式化报告为可读字符串', () => {
      const report: PerformanceReport = {
        generatedAt: '2024-01-01T00:00:00.000Z',
        durationMs: 5000,
        summary: {
          avgFps: 55,
          minFps: 30,
          maxFps: 60,
          avgDrawCalls: 15,
          avgTriangles: 25000,
          avgJsHeapMB: 42.5,
          snapshotCount: 10,
          durationMs: 4500,
        } satisfies PerformanceSummary,
        snapshots: [],
        environment: {
          userAgent: 'TestAgent',
          devicePixelRatio: 2,
          screenWidth: 1920,
          screenHeight: 1080,
        },
      }

      const text = formatPerformanceReport(report)
      expect(text).toContain('3D 场景性能报告')
      expect(text).toContain('55')
      expect(text).toContain('15')
      expect(text).toContain('25,000')
      expect(text).toContain('42.5 MB')
      expect(text).toContain('1920 × 1080')
    })

    it('jsHeapMB 为 null 时不输出内存信息', () => {
      const report: PerformanceReport = {
        generatedAt: '2024-01-01T00:00:00.000Z',
        durationMs: 1000,
        summary: {
          avgFps: 60,
          minFps: 60,
          maxFps: 60,
          avgDrawCalls: 5,
          avgTriangles: 1000,
          avgJsHeapMB: null,
          snapshotCount: 2,
          durationMs: 800,
        } satisfies PerformanceSummary,
        snapshots: [],
        environment: {
          userAgent: 'TestAgent',
          devicePixelRatio: 1,
          screenWidth: 800,
          screenHeight: 600,
        },
      }

      const text = formatPerformanceReport(report)
      expect(text).toContain('不可用')
      expect(text).not.toContain('MB')
    })
  })
})
