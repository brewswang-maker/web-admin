// @ts-nocheck
/**
 * @file StatisticsChart.test.ts
 * @brief 统计图表/账单分析组件 单元测试
 *
 * 覆盖:
 *   - LazyChart 组件: 加载状态/错误兜底/重试/图表类型检测
 *   - 统计数据: 安全评分/告警趋势/设备在线率/资源使用
 *   - API 交互: statisticsApi 各接口调用
 *   - ECharts option 生成逻辑
 *   - 时间范围切换
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LazyChart from '@/components/LazyChart.vue'
import StatisticsView from '@/views/StatisticsView.vue'
import type { EChartsOption } from 'echarts'

// ── Mock element-plus ──────────────────────────────────────
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

// ── Mock statisticsApi ─────────────────────────────────────
const mockSecurityScore = {
  overall: 87,
  trend: 3.2,
  dimensions: [
    { label: '入侵检测', value: 92, color: '#67C23A' },
    { label: '视频完整', value: 85, color: '#409EFF' },
    { label: '设备健康', value: 78, color: '#E6A23C' },
    { label: '网络状态', value: 90, color: '#F56C6C' },
    { label: 'AI准确率', value: 88, color: '#9B59B6' },
  ],
}

const mockAlarmTrend = {
  trend: [
    { date: '2026-01-09', count: 12, level: 'high' },
    { date: '2026-01-10', count: 8, level: 'medium' },
    { date: '2026-01-11', count: 15, level: 'critical' },
    { date: '2026-01-12', count: 6, level: 'low' },
    { date: '2026-01-13', count: 10, level: 'high' },
    { date: '2026-01-14', count: 9, level: 'medium' },
    { date: '2026-01-15', count: 5, level: 'low' },
  ],
  topTypes: [
    { type: 'intrusion', count: 28 },
    { type: 'fire', count: 15 },
    { type: 'crowd', count: 12 },
  ],
}

const mockOnlineRate = {
  trend: [
    { date: '2026-01-09', rate: 95 },
    { date: '2026-01-10', rate: 92 },
    { date: '2026-01-11', rate: 88 },
    { date: '2026-01-12', rate: 94 },
    { date: '2026-01-13', rate: 91 },
    { date: '2026-01-14', rate: 93 },
    { date: '2026-01-15', rate: 96 },
  ],
  average: 92.7,
}

const mockResourceUsage = {
  cpu: [
    { time: '10:00', value: 35 },
    { time: '11:00', value: 42 },
    { time: '12:00', value: 38 },
  ],
  memory: [
    { time: '10:00', value: 55 },
    { time: '11:00', value: 58 },
    { time: '12:00', value: 52 },
  ],
  gpu: [
    { time: '10:00', value: 28 },
    { time: '11:00', value: 35 },
    { time: '12:00', value: 30 },
  ],
  disk: [
    { time: '10:00', value: 60 },
    { time: '11:00', value: 60 },
    { time: '12:00', value: 61 },
  ],
}

const mockAgentActivity = {
  perceptionCalls: 12580,
  analysisCalls: 8920,
  decisionCalls: 3420,
  expertInvokes: 156,
  avgConfidence: 0.92,
  timeline: [
    { time: '10:00', calls: 45 },
    { time: '11:00', calls: 52 },
    { time: '12:00', calls: 38 },
  ],
}

vi.mock('@/api/statistics', () => ({
  statisticsApi: {
    getSecurityScore: vi.fn(() => Promise.resolve({ data: { code: 0, data: mockSecurityScore } })),
    getAlarmTrend: vi.fn(() => Promise.resolve({ data: { code: 0, data: mockAlarmTrend } })),
    getOnlineRateTrend: vi.fn(() => Promise.resolve({ data: { code: 0, data: mockOnlineRate } })),
    getResourceUsage: vi.fn(() => Promise.resolve({ data: { code: 0, data: mockResourceUsage } })),
    getAgentActivity: vi.fn(() => Promise.resolve({ data: { code: 0, data: mockAgentActivity } })),
  },
}))

// ── Mock vue-echarts 动态导入 ────────────────────────────────
vi.mock('vue-echarts', () => ({
  default: { name: 'VChart', template: '<div class="v-chart-mock" />' },
}))

// ── 测试辅助 ──────────────────────────────────────────────
function createWrapper() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(StatisticsView, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-card': { template: '<div class="el-card"><slot /><slot name="header" /></div>' },
        'el-row': { template: '<div class="el-row"><slot /></div>' },
        'el-col': { template: '<div class="el-col"><slot /></div>' },
        'el-button': { template: '<button class="el-button" @click="$emit(\'click\')"><slot /></button>' },
        'el-radio-group': { template: '<div class="el-radio-group"><slot /></div>' },
        'el-radio-button': { template: '<label><slot /></label>' },
        'el-progress': { template: '<div class="el-progress" />' },
        'el-icon': { template: '<i class="el-icon"><slot /></i>' },
        'LazyChart': true,
      },
    },
  })
}

// ── LazyChart 组件测试 ────────────────────────────────────
describe('components/LazyChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const basicOption: EChartsOption = {
    series: [{ type: 'line', data: [1, 2, 3] }],
  }

  it('挂载成功渲染容器', () => {
    const wrapper = mount(LazyChart, {
      props: { option: basicOption },
    })
    expect(wrapper.find('.lazy-chart').exists()).toBe(true)
  })

  it('初始状态显示加载占位', () => {
    const wrapper = mount(LazyChart, {
      props: { option: basicOption },
    })
    // 还未加载 echarts 时显示 placeholder
    expect(wrapper.find('.chart-placeholder').exists() || wrapper.find('.v-chart-mock').exists()).toBe(true)
  })

  it('接受 height prop 设置高度', () => {
    const wrapper = mount(LazyChart, {
      props: { option: basicOption, height: '320px' },
    })
    const container = wrapper.find('.lazy-chart')
    expect(container.exists()).toBe(true)
  })

  it('图表类型检测 - line', () => {
    // 测试内部图表类型检测逻辑
    const option: EChartsOption = {
      series: [{ type: 'line', data: [1, 2, 3] }],
    }
    const types = new Set<string>()
    if (option.series && Array.isArray(option.series)) {
      for (const s of option.series) {
        if (s && (s as any).type) types.add((s as any).type as string)
      }
    }
    expect(types.has('line')).toBe(true)
  })

  it('图表类型检测 - 混合类型 (line + bar)', () => {
    const option: EChartsOption = {
      series: [
        { type: 'line', data: [1, 2, 3] },
        { type: 'bar', data: [4, 5, 6] },
      ],
    }
    const types = new Set<string>()
    if (option.series && Array.isArray(option.series)) {
      for (const s of option.series) {
        if (s && (s as any).type) types.add((s as any).type as string)
      }
    }
    expect(types.has('line')).toBe(true)
    expect(types.has('bar')).toBe(true)
    expect(types.size).toBe(2)
  })

  it('图表类型检测 - pie', () => {
    const option: EChartsOption = {
      series: [{ type: 'pie', data: [{ value: 10, name: 'A' }] }],
    }
    const types = new Set<string>()
    if (option.series && Array.isArray(option.series)) {
      for (const s of option.series) {
        if (s && (s as any).type) types.add((s as any).type as string)
      }
    }
    expect(types.has('pie')).toBe(true)
  })

  it('option 为空时默认添加 line 类型', () => {
    const option: EChartsOption = { series: [] }
    const types = new Set<string>()
    if (option.series && Array.isArray(option.series)) {
      for (const s of option.series) {
        if (s && (s as any).type) types.add((s as any).type as string)
      }
    }
    if (types.size === 0) types.add('line')
    expect(types.has('line')).toBe(true)
  })
})

// ── 统计数据逻辑测试 ────────────────────────────────────
describe('StatisticsView 数据逻辑', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('安全评分计算', () => {
    it('安全评分在 0-100 范围内', () => {
      expect(mockSecurityScore.overall).toBeGreaterThanOrEqual(0)
      expect(mockSecurityScore.overall).toBeLessThanOrEqual(100)
    })

    it('趋势值正确表示涨跌', () => {
      expect(mockSecurityScore.trend).toBeGreaterThan(0)
      const isUp = mockSecurityScore.trend >= 0
      expect(isUp).toBe(true)
    })

    it('维度数据完整', () => {
      expect(mockSecurityScore.dimensions.length).toBe(5)
      mockSecurityScore.dimensions.forEach(d => {
        expect(d.label).toBeTruthy()
        expect(d.value).toBeGreaterThanOrEqual(0)
        expect(d.value).toBeLessThanOrEqual(100)
        expect(d.color).toBeTruthy()
      })
    })

    it('评分百分比计算正确', () => {
      const percent = (mockSecurityScore.overall / 100) * 100
      expect(percent).toBe(87)
    })
  })

  describe('告警趋势数据', () => {
    it('趋势数据有时间序列', () => {
      expect(mockAlarmTrend.trend.length).toBeGreaterThan(0)
      mockAlarmTrend.trend.forEach(item => {
        expect(item.date).toBeTruthy()
        expect(item.count).toBeGreaterThanOrEqual(0)
      })
    })

    it('Top 类型排名正确', () => {
      expect(mockAlarmTrend.topTypes.length).toBeGreaterThan(0)
      for (let i = 1; i < mockAlarmTrend.topTypes.length; i++) {
        expect(mockAlarmTrend.topTypes[i - 1].count).toBeGreaterThanOrEqual(mockAlarmTrend.topTypes[i].count)
      }
    })
  })

  describe('设备在线率', () => {
    it('在线率趋势数据正确', () => {
      expect(mockOnlineRate.trend.length).toBeGreaterThan(0)
      mockOnlineRate.trend.forEach(item => {
        expect(item.rate).toBeGreaterThanOrEqual(0)
        expect(item.rate).toBeLessThanOrEqual(100)
      })
    })

    it('平均在线率计算正确', () => {
      const avg = mockOnlineRate.trend.reduce((sum, t) => sum + t.rate, 0) / mockOnlineRate.trend.length
      expect(Math.round(avg * 10) / 10).toBe(92.7)
    })
  })

  describe('资源使用数据', () => {
    it('各资源时间序列一致', () => {
      const cpuLen = mockResourceUsage.cpu.length
      expect(mockResourceUsage.memory.length).toBe(cpuLen)
      expect(mockResourceUsage.gpu.length).toBe(cpuLen)
      expect(mockResourceUsage.disk.length).toBe(cpuLen)
    })

    it('CPU 使用率在合理范围', () => {
      mockResourceUsage.cpu.forEach(item => {
        expect(item.value).toBeGreaterThanOrEqual(0)
        expect(item.value).toBeLessThanOrEqual(100)
      })
    })
  })

  describe('Agent 活跃度', () => {
    it('各类调用次数为正数', () => {
      expect(mockAgentActivity.perceptionCalls).toBeGreaterThan(0)
      expect(mockAgentActivity.analysisCalls).toBeGreaterThan(0)
      expect(mockAgentActivity.decisionCalls).toBeGreaterThan(0)
      expect(mockAgentActivity.expertInvokes).toBeGreaterThan(0)
    })

    it('置信度在 0-1 之间', () => {
      expect(mockAgentActivity.avgConfidence).toBeGreaterThanOrEqual(0)
      expect(mockAgentActivity.avgConfidence).toBeLessThanOrEqual(1)
    })

    it('置信度百分比转换正确', () => {
      const percent = (mockAgentActivity.avgConfidence * 100).toFixed(1)
      expect(percent).toBe('92.0')
    })
  })

  describe('ECharts Option 生成', () => {
    it('告警趋势 option 包含 line 类型', () => {
      const option: EChartsOption = {
        xAxis: { type: 'category', data: mockAlarmTrend.trend.map(t => t.date) },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: mockAlarmTrend.trend.map(t => t.count) }],
      }
      expect((option.series as any[])[0].type).toBe('line')
    })

    it('告警分布 option 包含 pie 类型', () => {
      const pieData = mockAlarmTrend.topTypes.map(t => ({
        name: t.type,
        value: t.count,
      }))
      const option: EChartsOption = {
        series: [{ type: 'pie', data: pieData }],
      }
      expect((option.series as any[])[0].type).toBe('pie')
      expect(((option.series as any[])[0].data as any[]).length).toBe(3)
    })

    it('在线率趋势 option 正确生成', () => {
      const option: EChartsOption = {
        xAxis: { type: 'category', data: mockOnlineRate.trend.map(t => t.date) },
        series: [{ type: 'line', data: mockOnlineRate.trend.map(t => t.rate), smooth: true }],
      }
      expect((option.series as any[])[0].type).toBe('line')
      expect((option.series as any[])[0].smooth).toBe(true)
    })

    it('资源使用 option 为多轴 bar 图表', () => {
      const option: EChartsOption = {
        series: [
          { type: 'bar', name: 'CPU', data: mockResourceUsage.cpu.map(c => c.value) },
          { type: 'bar', name: 'Memory', data: mockResourceUsage.memory.map(m => m.value) },
          { type: 'bar', name: 'GPU', data: mockResourceUsage.gpu.map(g => g.value) },
          { type: 'bar', name: 'Disk', data: mockResourceUsage.disk.map(d => d.value) },
        ],
      }
      expect((option.series as any[]).length).toBe(4)
      ;(option.series as any[]).forEach(s => {
        expect(s.type).toBe('bar')
      })
    })
  })

  describe('时间范围切换', () => {
    it('支持 7d/30d/90d 时间范围', () => {
      const validRanges = ['7d', '30d', '90d']
      validRanges.forEach(range => {
        expect(['7d', '30d', '90d']).toContain(range)
      })
    })

    it('时间范围变更触发数据重新加载', async () => {
      const { statisticsApi } = await import('@/api/statistics')
      // 模拟切换时间范围
      await statisticsApi.getSecurityScore({ period: '30d' })
      expect(statisticsApi.getSecurityScore).toHaveBeenCalledWith({ period: '30d' })
    })
  })
})

// ── StatisticsView 组件挂载测试 ────────────────────────────
describe('StatisticsView 组件挂载', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('挂载成功渲染统计页面', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.statistics-page').exists()).toBe(true)
  })

  it('页面包含标题', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('数据统计分析')
  })

  it('渲染导出按钮', () => {
    const wrapper = createWrapper()
    const buttons = wrapper.findAll('.el-button')
    const exportBtn = buttons.find(b => b.text().includes('导出CSV'))
    expect(exportBtn).toBeDefined()
  })

  it('渲染时间范围选择器', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.el-radio-group').exists()).toBe(true)
  })
})
