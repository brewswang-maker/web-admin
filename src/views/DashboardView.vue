<template>
  <div class="dashboard">
    <!-- ===== 页面标题 ===== -->
    <div class="page-header">
      <div class="page-title-wrap">
        <h1 class="page-title">🏠 全局仪表盘</h1>
        <span class="page-subtitle">
          最后更新: {{ lastUpdated }}
          <el-button link type="primary" size="small" @click="refreshAll" class="refresh-btn">
            <el-icon :class="{ spinning: refreshing }"><Refresh /></el-icon>
          </el-button>
        </span>
      </div>
      <!-- 项目选择器 -->
      <div class="header-actions">
        <el-select
          v-model="selectedProject"
          placeholder="选择项目"
          size="default"
          style="width: 180px"
          @change="onProjectChange"
        >
          <el-option label="全部项目" value="all" />
          <el-option label="智慧园区" value="park" />
          <el-option label="智慧工地" value="construction" />
          <el-option label="停车场" value="parking" />
          <el-option label="商场客流" value="mall" />
          <el-option label="化工厂" value="chemical" />
        </el-select>
      </div>
    </div>

    <!-- ===== 顶部四指标卡片 ===== -->
    <el-row :gutter="16" class="top-stats-row">
      <el-col :span="6" v-for="stat in topStats" :key="stat.label">
        <el-card shadow="hover" class="stat-card" :body-style="{ padding: '20px' }">
          <div class="stat-content">
            <div class="stat-icon-wrap" :style="{ background: stat.gradient }">
              <el-icon :size="26"><component :is="stat.icon" /></el-icon>
            </div>
            <div class="stat-body">
              <div class="stat-value">
                <span class="value-num">{{ stat.value }}</span>
                <span v-if="stat.unit" class="value-unit">{{ stat.unit }}</span>
              </div>
              <div class="stat-label">{{ stat.label }}</div>
              <div v-if="stat.trend !== undefined" class="stat-trend" :class="stat.trend >= 0 ? 'up' : 'down'">
                <span class="trend-arrow">{{ stat.trend >= 0 ? '↑' : '↓' }}</span>
                {{ Math.abs(stat.trend) }}{{ stat.trendUnit ?? '%' }}
                <span class="trend-desc">{{ stat.trendDesc }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 中间行: 安全评分 + Agent活跃度 + 联邦学习 ===== -->
    <el-row :gutter="16" class="mid-row">
      <!-- 安全评分 -->
      <el-col :span="8">
        <el-card class="score-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">🛡️ 全局安全态势</span>
              <el-tag :type="scoreTagType" size="small" effect="plain">{{ scoreLabel }}</el-tag>
            </div>
          </template>
          <div class="score-body">
            <div class="score-ring-wrap">
              <div class="score-ring" :style="{ '--score-deg': scoreDeg }">
                <div class="score-ring-inner">
                  <span class="score-big">{{ securityScore?.overall ?? '--' }}</span>
                  <span class="score-unit-label">分</span>
                </div>
              </div>
            </div>
            <div class="score-dimensions">
              <div v-for="d in scoreDimensions" :key="d.label" class="score-dim-item">
                <div class="dim-header">
                  <span class="dim-label">{{ d.label }}</span>
                  <span class="dim-value" :style="{ color: d.color }">{{ d.value }}</span>
                </div>
                <el-progress
                  :percentage="d.value"
                  :color="d.color"
                  :stroke-width="6"
                  :show-text="false"
                />
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- Agent 活跃度 -->
      <el-col :span="8">
        <el-card class="agent-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">🟣 AI Agent 活跃度</span>
              <el-tag type="primary" size="small" effect="light">Hermes</el-tag>
            </div>
          </template>
          <div class="agent-stats">
            <div
              v-for="agent in agentStats"
              :key="agent.label"
              class="agent-row"
            >
              <div class="agent-dot" :style="{ background: agent.color }"></div>
              <div class="agent-info">
                <span class="agent-label">{{ agent.label }}</span>
                <span class="agent-sub">{{ agent.desc }}</span>
              </div>
              <div class="agent-val-wrap">
                <span class="agent-val">{{ agent.value }}</span>
                <span class="agent-unit">{{ agent.unit }}</span>
              </div>
            </div>
          </div>
          <div class="agent-confidence">
            <div class="confidence-ring">
              <el-progress
                type="circle"
                :percentage="agentActivity?.avgConfidence ? agentActivity.avgConfidence * 100 : 0"
                :width="80"
                :color="confidenceColor"
                :stroke-width="6"
              />
            </div>
            <div class="confidence-text">
              <span class="conf-label">平均置信度</span>
              <span class="conf-value">{{ agentActivity?.avgConfidence ? (agentActivity.avgConfidence * 100).toFixed(1) + '%' : '--' }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 联邦学习 -->
      <el-col :span="8">
        <el-card class="fed-mini-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">🧠 联邦学习状态</span>
              <el-button link size="small" type="primary" @click="$router.push('/federation')">
                查看详情 →
              </el-button>
            </div>
          </template>
          <div class="fed-content" v-if="federationStatus">
            <div class="fed-status-badge" :class="federationStatus.status">
              <span class="fed-dot-pulse"></span>
              <span>{{ fedStatusLabel }}</span>
            </div>
            <div class="fed-metrics-grid">
              <div class="fed-metric-item">
                <span class="fed-metric-num">{{ federationStatus.participatingBoxes }}/{{ federationStatus.totalBoxes }}</span>
                <span class="fed-metric-label">参与盒子</span>
              </div>
              <div class="fed-metric-item">
                <span class="fed-metric-num">R{{ federationStatus.currentRound }}</span>
                <span class="fed-metric-label">当前轮次</span>
              </div>
              <div class="fed-metric-item">
                <span class="fed-metric-num accent">{{ fedAggregationAccuracy }}%</span>
                <span class="fed-metric-label">聚合精度</span>
              </div>
              <div class="fed-metric-item">
                <span class="fed-metric-num">{{ fedPrivacyUsed }}%</span>
                <span class="fed-metric-label">隐私预算</span>
              </div>
            </div>
          </div>
          <el-empty v-else description="联邦学习未启动" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 底部行: 告警趋势图 + 项目热力图 ===== -->
    <el-row :gutter="16" class="bottom-row">
      <!-- 7日告警趋势 -->
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">📈 7日告警趋势</span>
              <span class="card-header-extra" :class="alarmTrendUp ? 'up' : 'down'">
                本周{{ alarmTrendUp ? '↑' : '↓' }}{{ alarmTrendPercent }}%
              </span>
            </div>
          </template>
          <LazyChart :option="alarmTrendOption" height="280px" />
        </el-card>
      </el-col>

      <!-- 项目热力图 -->
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">🗺️ 项目设备在线率</span>
              <el-button link size="small" type="primary" @click="$router.push('/projects')">全部项目 →</el-button>
            </div>
          </template>
          <div class="project-heatmap">
            <div v-for="project in projectHeatmap" :key="project.name" class="heatmap-row">
              <div class="heatmap-info">
                <span class="heatmap-name">{{ project.name }}</span>
                <span class="heatmap-pct" :style="{ color: project.rate >= 95 ? '#10B981' : project.rate >= 85 ? '#F59E0B' : '#EF4444' }">
                  {{ project.rate }}%
                </span>
                <span class="heatmap-status" :class="project.rate >= 95 ? 'online' : project.rate >= 85 ? 'warning' : 'error'">
                  {{ project.rate >= 95 ? '🟢' : project.rate >= 85 ? '🟡' : '🔴' }}
                </span>
              </div>
              <div class="heatmap-bar-wrap">
                <div
                  class="heatmap-bar"
                  :style="{
                    width: project.rate + '%',
                    background: project.rate >= 95
                      ? 'linear-gradient(90deg, #10B981, #34D399)'
                      : project.rate >= 85
                        ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                        : 'linear-gradient(90deg, #EF4444, #F87171)'
                  }"
                ></div>
              </div>
              <span v-if="project.rate < 95" class="heatmap-warn">⚠</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Odometer, Monitor, Bell, CircleCheck,
  Cpu, Refresh, TrendCharts,
} from '@element-plus/icons-vue'
import { http } from '@/api/http'
import LazyChart from '@/components/LazyChart.vue'
import type { EChartsOption } from 'echarts'

const router = useRouter()

// ── 状态 ──
const refreshing = ref(false)
const selectedProject = ref('all')
const lastUpdated = ref('刚刚')
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ── 更新计时器 ──
function startRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer)
  let sec = 0
  refreshTimer = setInterval(() => {
    sec++
    lastUpdated.value = sec < 60 ? `${sec}秒前` : `${Math.floor(sec / 60)}分钟前`
  }, 1000)
}

onMounted(async () => {
  startRefreshTimer()
  await fetchDashboardData()
  // 30秒自动刷新
  autoRefreshTimer = setInterval(fetchDashboardData, 30000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
})

// ── API数据获取 ──
async function fetchDashboardData() {
  try {
    const [overviewRes, trendRes, deviceRes] = await Promise.allSettled([
      http.get('/api/v1/stats/overview', { params: { project: selectedProject.value } }),
      http.get('/api/v1/stats/alarm-trend', { params: { project: selectedProject.value, hours: 24 } }),
      http.get('/api/v1/stats/device-status', { params: { project: selectedProject.value } }),
    ])
    if (overviewRes.status === 'fulfilled' && overviewRes.value.data) {
      const d = overviewRes.value.data?.data || overviewRes.value.data
      if (d.securityScore) securityScore.value = d.securityScore
      if (d.agentActivity) agentActivity.value = d.agentActivity
    }
    if (trendRes.status === 'fulfilled' && trendRes.value.data) {
      const d = trendRes.value.data?.data || trendRes.value.data
      if (d.trend) alarmTrendData.value = d.trend
    }
    if (deviceRes.status === 'fulfilled' && deviceRes.value.data) {
      const d = deviceRes.value.data?.data || deviceRes.value.data
      if (d.online !== undefined) {
        topStatsValues.value.deviceOnline = d.online
        topStatsValues.value.deviceTotal = d.total
      }
    }
  } catch (e) {
    console.warn('[Dashboard] 数据获取失败:', e)
  }
}

const topStatsValues = reactive({
  deviceOnline: 128,
  deviceTotal: 132,
  alarmCount: 23,
  handleRate: 96.5,
})

let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

async function refreshAll() {
  refreshing.value = true
  await fetchDashboardData()
  refreshing.value = false
  lastUpdated.value = '刚刚'
  startRefreshTimer()
}

function onProjectChange() {
  refreshAll()
}

// ── 顶部统计卡片 ──
const topStats = computed(() => [
  {
    label: '安全评分',
    value: securityScore.value?.overall ?? '--',
    unit: '',
    icon: Odometer,
    gradient: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    trend: securityScore.value?.trend,
    trendUnit: '点',
    trendDesc: '较昨日',
  },
  {
    label: '设备在线',
    value: `${topStatsValues.deviceOnline}/${topStatsValues.deviceTotal}`,
    unit: '',
    icon: Monitor,
    gradient: 'linear-gradient(135deg, #10B981, #059669)',
    trend: topStatsValues.deviceTotal > 0 ? +((topStatsValues.deviceOnline / topStatsValues.deviceTotal * 100 - 96).toFixed(1)) : 0,
    trendUnit: '%',
    trendDesc: `在线率 ${topStatsValues.deviceTotal > 0 ? (topStatsValues.deviceOnline / topStatsValues.deviceTotal * 100).toFixed(1) : '--'}%`,
  },
  {
    label: '今日告警',
    value: topStatsValues.alarmCount,
    unit: '',
    icon: Bell,
    gradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
    trend: -12,
    trendUnit: '%',
    trendDesc: '较昨日',
  },
  {
    label: '处置率',
    value: topStatsValues.handleRate.toFixed(1),
    unit: '%',
    icon: CircleCheck,
    gradient: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
    trend: 2.1,
    trendUnit: '%',
    trendDesc: '较上周',
  },
])

// ── 安全评分 ──
const securityScore = ref({
  overall: 92,
  trend: 3,
})

const scoreDeg = computed(() => `${((securityScore.value?.overall ?? 0) / 100) * 360}deg`)
const scoreTagType = computed(() => {
  const s = securityScore.value?.overall ?? 0
  return s >= 90 ? 'success' : s >= 70 ? 'warning' : 'danger'
})
const scoreLabel = computed(() => {
  const s = securityScore.value?.overall ?? 0
  return s >= 90 ? '优秀' : s >= 70 ? '良好' : '需关注'
})

const scoreDimensions = [
  { label: '周界防护', value: 95, color: '#3B82F6' },
  { label: '行为分析', value: 88, color: '#7C3AED' },
  { label: '烟火检测', value: 97, color: '#10B981' },
  { label: '设备健康', value: 89, color: '#F59E0B' },
]

// ── Agent 活跃度 ──
const agentActivity = ref({
  perceptionCalls: 1245,
  analysisCalls: 892,
  decisionCalls: 456,
  expertInvokes: 67,
  avgConfidence: 0.912,
})

const agentStats = computed(() => [
  {
    label: '感知Agent',
    desc: '视频/音频/传感器',
    value: agentActivity.value.perceptionCalls.toLocaleString(),
    unit: '次/天',
    color: '#3B82F6',
  },
  {
    label: '研判Agent',
    desc: '事件分析/推理',
    value: agentActivity.value.analysisCalls.toLocaleString(),
    unit: '次/天',
    color: '#7C3AED',
  },
  {
    label: '决策Agent',
    desc: '策略生成/调度',
    value: agentActivity.value.decisionCalls.toLocaleString(),
    unit: '次/天',
    color: '#F59E0B',
  },
  {
    label: '专家唤醒',
    desc: '领域专家调用',
    value: agentActivity.value.expertInvokes.toString(),
    unit: '次',
    color: '#10B981',
  },
])

const confidenceColor = computed(() => {
  const c = agentActivity.value.avgConfidence ?? 0
  return c >= 0.9 ? '#10B981' : c >= 0.8 ? '#F59E0B' : '#EF4444'
})

// ── 联邦学习 ──
const federationStatus = ref({
  status: 'running' as 'running' | 'paused' | 'idle',
  participatingBoxes: 8,
  totalBoxes: 12,
  currentRound: 42,
  aggregationAccuracy: 0.943,
  privacyBudget: 7.2,
  privacyBudgetTotal: 12,
})

const alarmTrendData = ref<number[]>([])
const fedStatusLabel = computed(() => {
  const m = { running: '🟢 运行中', paused: '⏸ 已暂停', idle: '⚪ 空闲' }
  return m[federationStatus.value.status] ?? '未知'
})
const fedAggregationAccuracy = computed(() =>
  (federationStatus.value.aggregationAccuracy * 100).toFixed(1)
)
const fedPrivacyUsed = computed(() =>
  Math.round((federationStatus.value.privacyBudget / federationStatus.value.privacyBudgetTotal) * 100)
)

// ── 7日告警趋势 ──
const alarmTrendUp = ref(true)
const alarmTrendPercent = ref(8)
const alarmTrendOption = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    textStyle: { color: '#E8EAED', fontSize: 13 },
  },
  grid: { top: 10, right: 16, bottom: 20, left: 40 },
  xAxis: {
    type: 'category',
    data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    axisLine: { lineStyle: { color: '#374151' } },
    axisLabel: { color: '#9CA3AF' },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: '#1F2937', type: 'dashed' } },
    axisLabel: { color: '#9CA3AF' },
  },
  series: [
    {
      name: '严重',
      type: 'bar',
      stack: 'total',
      data: [2, 1, 3, 2, 1, 0, 1],
      itemStyle: { color: '#DC2626', borderRadius: [0, 0, 0, 0] },
      barWidth: 24,
    },
    {
      name: '高',
      type: 'bar',
      stack: 'total',
      data: [5, 4, 6, 5, 3, 2, 4],
      itemStyle: { color: '#EA580C' },
    },
    {
      name: '中',
      type: 'bar',
      stack: 'total',
      data: [8, 9, 10, 8, 6, 5, 7],
      itemStyle: { color: '#F59E0B' },
    },
    {
      name: '低',
      type: 'bar',
      stack: 'total',
      data: [10, 11, 12, 9, 8, 7, 10],
      itemStyle: { color: '#22C55E', borderRadius: [4, 4, 0, 0] },
    },
    {
      type: 'line',
      data: [25, 25, 31, 24, 18, 14, 22],
      lineStyle: { color: '#7C3AED', width: 2 },
      itemStyle: { color: '#7C3AED', borderColor: '#7C3AED' },
      symbol: 'circle',
      symbolSize: 6,
      smooth: true,
    },
  ],
  legend: {
    bottom: 0,
    textStyle: { color: '#9CA3AF', fontSize: 12 },
    itemWidth: 12,
    itemHeight: 12,
  },
}))

// ── 项目热力图 ──
const projectHeatmap = [
  { name: '智慧园区', rate: 98 },
  { name: '智慧工地', rate: 96 },
  { name: '停车场', rate: 100 },
  { name: '商场客流', rate: 100 },
  { name: '化工厂', rate: 89 },
]
</script>

<style scoped>
/* ============================================================
 * 仪表盘 Dashboard — v6.0 样式
 * ============================================================ */

.dashboard {
  padding: 20px 24px;
  max-width: var(--content-max-width, 1440px);
  margin: 0 auto;
  animation: fadeIn 0.3s ease;
}

/* ── 页面标题 ── */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.page-title {
  font-size: var(--text-xl, 20px);
  font-weight: var(--font-bold, 700);
  color: var(--app-text-primary);
  margin: 0;
}

.page-subtitle {
  font-size: var(--text-sm, 13px);
  color: var(--app-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.refresh-btn {
  padding: 2px;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

/* ── 统计卡片 ── */
.top-stats-row {
  margin-bottom: 16px;
}

.stat-card {
  border-radius: var(--radius-xl, 12px);
  transition: all var(--transition-normal, 0.2s ease);
  border: 1px solid var(--app-border);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xl, 12px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-body {
  flex: 1;
  min-width: 0;
}

.stat-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin-bottom: 2px;
}

.value-num {
  font-size: 28px;
  font-weight: var(--font-bold, 700);
  color: var(--app-text-primary);
  font-family: var(--font-number);
}

.value-unit {
  font-size: 14px;
  color: var(--app-text-secondary);
}

.stat-label {
  font-size: var(--text-sm, 13px);
  color: var(--app-text-secondary);
  margin-bottom: 4px;
}

.stat-trend {
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-medium, 500);
  display: flex;
  align-items: center;
  gap: 2px;
}

.stat-trend.up { color: #10B981; }
.stat-trend.down { color: #EF4444; }

.trend-arrow {
  font-size: 12px;
}

.trend-desc {
  color: var(--app-text-secondary);
  margin-left: 2px;
  font-weight: var(--font-normal, 400);
}

/* ── 中间行 ── */
.mid-row {
  margin-bottom: 16px;
}

/* ── 安全评分卡片 ── */
.score-card {
  border-radius: var(--radius-xl, 12px);
  height: 100%;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-title {
  font-weight: var(--font-semibold, 600);
  font-size: var(--text-base, 14px);
}

.card-header-extra {
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-medium, 500);
}

.card-header-extra.up { color: #10B981; }
.card-header-extra.down { color: #EF4444; }

.score-body {
  display: flex;
  gap: 24px;
  align-items: center;
}

.score-ring-wrap {
  flex-shrink: 0;
}

.score-ring {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: conic-gradient(
    #3B82F6 0deg,
    #3B82F6 var(--score-deg, 0deg),
    #1F2937 var(--score-deg, 0deg),
    #1F2937 360deg
  );
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.score-ring-inner {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: var(--app-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.score-big {
  font-size: 32px;
  font-weight: var(--font-bold, 700);
  color: var(--app-text-primary);
  font-family: var(--font-number);
  line-height: 1;
}

.score-unit-label {
  font-size: 12px;
  color: var(--app-text-secondary);
  margin-top: 2px;
}

.score-dimensions {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.score-dim-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dim-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dim-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.dim-value {
  font-size: 13px;
  font-weight: var(--font-semibold, 600);
  font-family: var(--font-number);
}

/* ── Agent 卡片 ── */
.agent-card {
  border-radius: var(--radius-xl, 12px);
  height: 100%;
}

.agent-stats {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.agent-label {
  font-size: 13px;
  font-weight: var(--font-medium, 500);
  color: var(--app-text-primary);
}

.agent-sub {
  font-size: 11px;
  color: var(--app-text-secondary);
}

.agent-val-wrap {
  text-align: right;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.agent-val {
  font-size: 16px;
  font-weight: var(--font-bold, 700);
  color: var(--app-text-primary);
  font-family: var(--font-number);
}

.agent-unit {
  font-size: 11px;
  color: var(--app-text-secondary);
}

.agent-confidence {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--app-border);
  justify-content: center;
}

.confidence-text {
  display: flex;
  flex-direction: column;
}

.conf-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.conf-value {
  font-size: 18px;
  font-weight: var(--font-bold, 700);
  color: var(--app-text-primary);
  font-family: var(--font-number);
}

/* ── 联邦学习迷你卡片 ── */
.fed-mini-card {
  border-radius: var(--radius-xl, 12px);
  height: 100%;
}

.fed-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fed-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: var(--radius-full);
  width: fit-content;
  font-size: 13px;
  font-weight: var(--font-medium, 500);
}

.fed-status-badge.running {
  background: rgba(16, 185, 129, 0.1);
  color: #10B981;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.fed-dot-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10B981;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.3); }
}

.fed-metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.fed-metric-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fed-metric-num {
  font-size: 20px;
  font-weight: var(--font-bold, 700);
  color: var(--app-text-primary);
  font-family: var(--font-number);
}

.fed-metric-num.accent {
  color: #3B82F6;
}

.fed-metric-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

/* ── 底部行 ── */
.bottom-row {
  margin-bottom: 0;
}

/* ── 项目热力图 ── */
.project-heatmap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.heatmap-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.heatmap-info {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 130px;
  flex-shrink: 0;
}

.heatmap-name {
  font-size: 13px;
  color: var(--app-text-primary);
}

.heatmap-pct {
  font-size: 13px;
  font-weight: var(--font-semibold, 600);
  font-family: var(--font-number);
}

.heatmap-status {
  font-size: 10px;
}

.heatmap-bar-wrap {
  flex: 1;
  height: 10px;
  background: var(--app-surface-hover);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.heatmap-bar {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.heatmap-warn {
  font-size: 14px;
  flex-shrink: 0;
  color: #F59E0B;
}
</style>
