/**
 * @file performance.ts
 * @brief 3D 场景性能数据采集工具
 * @description 提供 FPS、Draw Calls、三角面数、内存占用等性能指标采集，
 *              支持生成性能报告供后续测试阶段使用。
 * @version 1.0.0
 */

import type * as THREE from 'three'

// ════════════════════════════════════════════════════
// ── 类型定义 ──
// ════════════════════════════════════════════════════

/** 单帧性能快照 */
export interface PerformanceSnapshot {
  /** 帧率 (FPS) */
  fps: number
  /** 渲染调用次数 */
  drawCalls: number
  /** 三角面数量 */
  triangles: number
  /** 几何体数量 */
  geometries: number
  /** 纹理数量 */
  textures: number
  /** 着色器程序数量 */
  programs: number
  /** 内存占用估算 (MB)，仅在支持 performance.memory 的浏览器可用 */
  jsHeapUsedMB: number | null
  /** 采集时间戳 (ms) */
  timestamp: number
}

/** 性能采集器配置 */
export interface PerformanceCollectorOptions {
  /** 采样间隔（毫秒），默认 500ms */
  sampleInterval?: number
  /** 最大保留快照数（用于滚动统计），默认 120 */
  maxSnapshots?: number
}

/** 性能统计摘要 */
export interface PerformanceSummary {
  /** 平均 FPS */
  avgFps: number
  /** 最低 FPS */
  minFps: number
  /** 最高 FPS */
  maxFps: number
  /** 平均 Draw Calls */
  avgDrawCalls: number
  /** 平均三角面数 */
  avgTriangles: number
  /** 平均 JS 堆内存 (MB)，不可用时为 null */
  avgJsHeapMB: number | null
  /** 快照数量 */
  snapshotCount: number
  /** 采集时长 (ms) */
  durationMs: number
}

/** 完整性能报告 */
export interface PerformanceReport {
  /** 报告生成时间 */
  generatedAt: string
  /** 采集总时长 (ms) */
  durationMs: number
  /** 统计摘要 */
  summary: PerformanceSummary
  /** 所有快照数据 */
  snapshots: PerformanceSnapshot[]
  /** 运行环境信息 */
  environment: {
    userAgent: string
    devicePixelRatio: number
    screenWidth: number
    screenHeight: number
  }
}

// ════════════════════════════════════════════════════
// ── PerformanceCollector 采集器类 ──
// ════════════════════════════════════════════════════

/**
 * 3D 场景性能数据采集器
 *
 * @example
 * ```ts
 * const collector = new PerformanceCollector(renderer)
 * collector.start()
 * // ... 运行场景一段时间
 * const report = collector.generateReport()
 * collector.stop()
 * ```
 */
export class PerformanceCollector {
  private renderer: THREE.WebGLRenderer | null = null
  private snapshots: PerformanceSnapshot[] = []
  private sampleInterval: number
  private maxSnapshots: number
  private timerId: ReturnType<typeof setInterval> | null = null
  private startTime = 0

  /** FPS 计算用帧计数 */
  private frameCount = 0
  private lastFpsTime = 0
  private currentFps = 0

  constructor(renderer: THREE.WebGLRenderer | null, options?: PerformanceCollectorOptions) {
    this.renderer = renderer
    this.sampleInterval = options?.sampleInterval ?? 500
    this.maxSnapshots = options?.maxSnapshots ?? 120
  }

  /** 更新渲染器引用（懒加载场景创建后可能需要更新） */
  setRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer
  }

  /** 每帧调用一次，用于精确计算 FPS */
  tick(): void {
    this.frameCount++
  }

  /** 开始采集 */
  start(): void {
    if (this.timerId !== null) return // 已在采集中
    this.startTime = performance.now()
    this.lastFpsTime = performance.now()
    this.frameCount = 0
    this.currentFps = 0
    this.snapshots = []

    this.timerId = setInterval(() => {
      this.sample()
    }, this.sampleInterval)
  }

  /** 停止采集 */
  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  /** 是否正在采集 */
  get isRunning(): boolean {
    return this.timerId !== null
  }

  /** 获取最新一次快照 */
  get latestSnapshot(): PerformanceSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null
  }

  /** 获取所有快照 */
  get allSnapshots(): readonly PerformanceSnapshot[] {
    return this.snapshots
  }

  /** 获取快照数量 */
  get snapshotCount(): number {
    return this.snapshots.length
  }

  /** 单次采样 */
  private sample(): void {
    const now = performance.now()

    // 计算自上次采样以来的 FPS
    const elapsed = now - this.lastFpsTime
    if (elapsed > 0) {
      this.currentFps = Math.round((this.frameCount / elapsed) * 1000)
    }
    this.frameCount = 0
    this.lastFpsTime = now

    const info = this.renderer?.info
    const memory = this.renderer?.info?.memory

    // 尝试获取 Chrome 特有的 JS 堆内存信息
    let jsHeapUsedMB: number | null = null
    const perf = performance as any
    if (perf.memory && typeof perf.memory.usedJSHeapSize === 'number') {
      jsHeapUsedMB = Math.round(perf.memory.usedJSHeapSize / 1048576 * 100) / 100
    }

    const snapshot: PerformanceSnapshot = {
      fps: this.currentFps,
      drawCalls: info?.render?.calls ?? 0,
      triangles: info?.render?.triangles ?? 0,
      geometries: memory?.geometries ?? 0,
      textures: memory?.textures ?? 0,
      programs: info?.programs?.length ?? 0,
      jsHeapUsedMB,
      timestamp: now,
    }

    this.snapshots.push(snapshot)

    // 滚动窗口：超出最大快照数时删除最早的
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift()
    }
  }

  /** 计算当前快照窗口的统计摘要 */
  getSummary(): PerformanceSummary {
    const snaps = this.snapshots
    if (snaps.length === 0) {
      return {
        avgFps: 0, minFps: 0, maxFps: 0,
        avgDrawCalls: 0, avgTriangles: 0,
        avgJsHeapMB: null, snapshotCount: 0,
        durationMs: 0,
      }
    }

    const fpsValues = snaps.map(s => s.fps)
    const drawCallsValues = snaps.map(s => s.drawCalls)
    const trianglesValues = snaps.map(s => s.triangles)
    const heapValues = snaps.map(s => s.jsHeapUsedMB).filter((v): v is number => v !== null)

    return {
      avgFps: Math.round(fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length),
      minFps: Math.min(...fpsValues),
      maxFps: Math.max(...fpsValues),
      avgDrawCalls: Math.round(drawCallsValues.reduce((a, b) => a + b, 0) / drawCallsValues.length),
      avgTriangles: Math.round(trianglesValues.reduce((a, b) => a + b, 0) / trianglesValues.length),
      avgJsHeapMB: heapValues.length > 0
        ? Math.round(heapValues.reduce((a, b) => a + b, 0) / heapValues.length * 100) / 100
        : null,
      snapshotCount: snaps.length,
      durationMs: snaps[snaps.length - 1].timestamp - snaps[0].timestamp,
    }
  }

  /** 生成完整性能报告（JSON 格式，可供导出/分析） */
  generateReport(): PerformanceReport {
    return {
      generatedAt: new Date().toISOString(),
      durationMs: performance.now() - this.startTime,
      summary: this.getSummary(),
      snapshots: [...this.snapshots],
      environment: {
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio ?? 1,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
      },
    }
  }

  /** 重置采集器状态 */
  reset(): void {
    this.stop()
    this.snapshots = []
    this.frameCount = 0
    this.currentFps = 0
  }

  /** 释放资源 */
  dispose(): void {
    this.stop()
    this.renderer = null
    this.snapshots = []
  }
}

// ════════════════════════════════════════════════════
// ── 独立工具函数（可直接在组件外使用） ──
// ════════════════════════════════════════════════════

/**
 * 从 Three.js renderer 中快速获取当前渲染信息快照
 * 适用于单次采集（无需启动采集器）
 */
export function getRendererPerformance(renderer: THREE.WebGLRenderer): {
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
} {
  const info = renderer.info
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
  }
}

/**
 * 获取当前 JS 堆内存使用情况（仅 Chrome 系浏览器可用）
 */
export function getJsHeapMemory(): { usedMB: number; totalMB: number; limitMB: number } | null {
  const perf = performance as any
  if (!perf.memory) return null
  return {
    usedMB: Math.round(perf.memory.usedJSHeapSize / 1048576 * 100) / 100,
    totalMB: Math.round(perf.memory.totalJSHeapSize / 1048576 * 100) / 100,
    limitMB: Math.round(perf.memory.jsHeapSizeLimit / 1048576 * 100) / 100,
  }
}

/**
 * 将性能报告格式化为可读字符串（用于 console 输出或日志）
 */
export function formatPerformanceReport(report: PerformanceReport): string {
  const { summary: s, environment: env } = report
  const lines = [
    '═══════════════════════════════════════════',
    '  3D 场景性能报告',
    '═══════════════════════════════════════════',
    `  采集时间: ${report.generatedAt}`,
    `  采集时长: ${(report.durationMs / 1000).toFixed(1)}s`,
    `  快照数量: ${report.summary.snapshotCount}`,
    '',
    '── FPS ──',
    `  平均: ${s.avgFps}  最低: ${s.minFps}  最高: ${s.maxFps}`,
    '',
    '── 渲染指标 ──',
    `  平均 Draw Calls: ${s.avgDrawCalls}`,
    `  平均三角面数: ${s.avgTriangles.toLocaleString()}`,
    s.avgJsHeapMB !== null ? `  平均 JS 堆内存: ${s.avgJsHeapMB} MB` : '  JS 堆内存: 不可用',
    '',
    '── 运行环境 ──',
    `  DPR: ${env.devicePixelRatio}`,
    `  屏幕: ${env.screenWidth} × ${env.screenHeight}`,
    '═══════════════════════════════════════════',
  ]
  return lines.join('\n')
}
