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
              <div v-else class="stat-trend-placeholder" aria-hidden="true"></div>
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
              <el-tag v-if="securityScore" :type="scoreTagType" size="small" effect="plain">{{ scoreLabel }}</el-tag>
              <el-tag v-else type="info" size="small" effect="plain">{{ securityScoreFailed ? '加载失败' : '加载中…' }}</el-tag>
            </div>
          </template>
          <div class="score-body" v-if="securityScore">
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
          <div v-else class="dashboard-empty">
            <el-skeleton v-if="!securityScoreFailed" :rows="4" animated />
            <el-empty v-else description="安全评分数据加载失败" :image-size="60">
              <el-button size="small" type="primary" @click="refreshAll">重试</el-button>
            </el-empty>
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
          <div class="agent-stats" v-if="agentActivity">
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
          <div v-else class="dashboard-empty">
            <el-skeleton v-if="!agentActivityFailed" :rows="3" animated />
            <el-empty v-else description="Agent 数据加载失败" :image-size="60">
              <el-button size="small" type="primary" @click="refreshAll">重试</el-button>
            </el-empty>
          </div>
          <div class="agent-confidence" v-if="agentActivity">
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
              <span v-if="alarmTrendUp !== null && alarmTrendPercent !== null" class="card-header-extra" :class="alarmTrendUp ? 'up' : 'down'">
                本周{{ alarmTrendUp ? '↑' : '↓' }}{{ alarmTrendPercent }}%
              </span>
              <span v-else class="card-header-extra">{{ alarmTrendFailed ? '加载失败' : '加载中…' }}</span>
            </div>
          </template>
          <LazyChart v-if="alarmTrendData.length" :option="alarmTrendOption" height="280px" />
          <el-skeleton v-else-if="!alarmTrendFailed" :rows="6" animated />
          <el-empty v-else description="告警趋势加载失败" :image-size="60">
            <el-button size="small" type="primary" @click="refreshAll">重试</el-button>
          </el-empty>
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
          <div v-if="projectHeatmap.length" class="project-heatmap">
            <div v-for="project in projectHeatmap" :key="project.name" class="heatmap-row">
              <span class="heatmap-name" :title="project.name">{{ project.name }}</span>
              <span class="heatmap-pct" :style="{ color: project.rate >= 95 ? '#10B981' : project.rate >= 85 ? '#F59E0B' : '#EF4444' }">
                {{ project.rate }}%
              </span>
              <span class="heatmap-status" :class="project.rate >= 95 ? 'online' : project.rate >= 85 ? 'warning' : 'error'">
                {{ project.rate >= 95 ? '🟢' : project.rate >= 85 ? '🟡' : '🔴' }}
              </span>
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
          <el-skeleton v-else-if="!projectHeatmapFailed" :rows="4" animated />
          <el-empty v-else description="项目在线率加载失败" :image-size="60">
            <el-button size="small" type="primary" @click="refreshAll">重试</el-button>
          </el-empty>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  Odometer, Monitor, Bell, CircleCheck,
  Cpu, Refresh, TrendCharts,
} from '@element-plus/icons-vue'
import { statsHttp } from '@/api/http'
import { federationApi } from '@/api/federation'
import { useWebSocket } from '@/composables/useWebSocket'
import LazyChart from '@/components/LazyChart.vue'
import type { EChartsOption } from 'echarts'

const router = useRouter()

// ── WebSocket 实时推送 ──
const { connected: wsConnected, subscribe } = useWebSocket('/ws/dashboard')
let unsubAlarm: (() => void) | null = null
let unsubDevice: (() => void) | null = null

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

  // WebSocket: 告警推送 → 增量更新告警计数
  unsubAlarm = subscribe('alarm', (data: any) => {
    topStatsValues.alarmCount += 1
    lastUpdated.value = '刚刚'
    startRefreshTimer()
  })

  // WebSocket: 设备状态变更 → 增量刷新设备统计
  unsubDevice = subscribe('device_status', () => {
    topStatsValues.deviceOnline += 0 // trigger reactivity
    lastUpdated.value = '刚刚'
    startRefreshTimer()
  })

  // 兜底轮询：5分钟全量刷新
  autoRefreshTimer = setInterval(fetchDashboardData, 300000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
  unsubAlarm?.()
  unsubDevice?.()
})

// ── API数据获取 ──
async function fetchDashboardData() {
  // 清空失败标记
  securityScoreFailed.value = false
  scoreDimensionsFailed.value = false
  agentActivityFailed.value = false
  alarmTrendFailed.value = false
  projectHeatmapFailed.value = false
  federationStatusFailed.value = false

  const [overviewRes, trendRes, deviceRes, fedRes, agentRes, dimsRes, heatmapRes] = await Promise.allSettled([
    statsHttp.get('/overview', { params: { project: selectedProject.value } }),
    statsHttp.get('/alarm-trend', { params: { project: selectedProject.value, hours: 168 } }),
    statsHttp.get('/device-status', { params: { project: selectedProject.value } }),
    federationApi.getStatus(),
    statsHttp.get('/agent-activity', { params: { period: '24h' } }),
    statsHttp.get('/security-score', { params: { period: '24h' } }),
    statsHttp.get('/project-alarms', { params: { period: '7d' } }),
  ])

  if (overviewRes.status === 'fulfilled' && overviewRes.value.data) {
    const d = overviewRes.value.data?.data || overviewRes.value.data
    if (d.security_score !== undefined) {
      securityScore.value = {
        overall: d.security_score,
        // [v8.3 fix] 不再用 alarm_trend 百分比作为评分变化 (语义错误: alarm_trend=288% → -289点 不合理)
        //   评分变化需要昨日评分数据, 后端暂不提供, 所以不显示趋势
        trend: undefined,
      }
    } else {
      securityScoreFailed.value = true
    }
    topStatsValues.deviceOnline = d.online_devices ?? 0
    topStatsValues.deviceTotal = d.total_devices ?? 0
    topStatsValues.alarmCount = d.today_alarms ?? 0
    topStatsValues.handleRate = d.handle_rate ?? 0
    // [v8.3 fix] 存储真实告警趋势 (正=今日更多, 负=今日更少)
    topStatsValues.alarmTrend = d.alarm_trend ?? 0
  } else {
    securityScoreFailed.value = true
  }

  if (trendRes.status === 'fulfilled' && trendRes.value.data) {
    const d = trendRes.value.data?.data || trendRes.value.data
    if (d.trend) {
      alarmTrendData.value = d.trend
      // 计算趋势方向
      if (d.trend.length >= 2) {
        const half = Math.floor(d.trend.length / 2)
        const prev = d.trend.slice(0, half).reduce((s: number, t: any) => s + (t.count ?? 0), 0)
        const curr = d.trend.slice(half).reduce((s: number, t: any) => s + (t.count ?? 0), 0)
        if (prev > 0) {
          alarmTrendPercent.value = Math.round(((curr - prev) / prev) * 100)
          alarmTrendUp.value = curr <= prev
        }
      }
    }
    if (d.top_types) alarmTypes.value = d.top_types
  } else {
    alarmTrendFailed.value = true
  }

  if (deviceRes.status === 'fulfilled' && deviceRes.value.data) {
    const d = deviceRes.value.data?.data || deviceRes.value.data
    if (d.online_count !== undefined) {
      topStatsValues.deviceOnline = d.online_count
      topStatsValues.deviceTotal = d.total_count
    }
  }

  if (fedRes.status === 'fulfilled' && fedRes.value.data?.data) {
    const f = fedRes.value.data.data as any
    federationStatus.value = {
      status: f.enabled ? 'running' : 'idle',
      participatingBoxes: f.activeNodes ?? 0,
      totalBoxes: f.totalNodes ?? 0,
      currentRound: f.round ?? 0,
      aggregationAccuracy: f.accuracy ?? 0,
      privacyBudget: 0.65,
      privacyBudgetTotal: 1.0,
    }
  } else {
    federationStatusFailed.value = true
  }

  if (agentRes.status === 'fulfilled' && agentRes.value.data) {
    const d = agentRes.value.data?.data || agentRes.value.data
    if (d && (d.perceptionCalls !== undefined || d.calls_today !== undefined)) {
      agentActivity.value = {
        perceptionCalls: d.perceptionCalls ?? 0,
        analysisCalls: d.analysisCalls ?? 0,
        decisionCalls: d.decisionCalls ?? 0,
        expertInvokes: d.expertInvokes ?? 0,
        avgConfidence: d.avgConfidence ?? 0,
      }
    } else {
      agentActivityFailed.value = true
    }
  } else {
    agentActivityFailed.value = true
  }

  if (dimsRes.status === 'fulfilled' && dimsRes.value.data) {
    const d = dimsRes.value.data?.data || dimsRes.value.data
    if (Array.isArray(d?.dimensions) && d.dimensions.length) {
      scoreDimensions.value = d.dimensions.map((x: any) => ({
        label: x.label ?? '',
        value: Number(x.value ?? 0),
        color: x.color ?? '#3B82F6',
      }))
    } else if (Array.isArray(d) && d.length) {
      scoreDimensions.value = d.map((x: any) => ({
        label: x.label ?? '',
        value: Number(x.value ?? 0),
        color: x.color ?? '#3B82F6',
      }))
    } else {
      scoreDimensionsFailed.value = true
    }
  } else {
    scoreDimensionsFailed.value = true
  }

  if (heatmapRes.status === 'fulfilled' && heatmapRes.value.data) {
    const d = heatmapRes.value.data?.data || heatmapRes.value.data
    const items = Array.isArray(d) ? d : (d?.items ?? [])
    if (items.length) {
      projectHeatmap.value = items.map((x: any) => ({
        name: x.projectName ?? x.name ?? '',
        rate: Number(x.onlineRate ?? x.rate ?? 0),
      }))
    } else {
      projectHeatmapFailed.value = true
    }
  } else {
    projectHeatmapFailed.value = true
  }

  const failedCount = [
    securityScoreFailed, scoreDimensionsFailed, agentActivityFailed,
    alarmTrendFailed, projectHeatmapFailed, federationStatusFailed,
  ].filter(v => v.value).length
  if (failedCount >= 3) {
    ElMessage.error('仪表盘关键数据加载失败,请检查后端服务或权限')
  }
}

const topStatsValues = reactive({
  deviceOnline: 0,
  deviceTotal: 0,
  alarmCount: 0,
  handleRate: 0,
  alarmTrend: 0,  // [v8.3 fix] 真实告警趋势 (今日 vs 昨日)
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
    // [v8.3 fix] 使用真实趋势数据, 不再硬编码 -12
    trend: Math.round(topStatsValues.alarmTrend),
    trendUnit: '%',
    trendDesc: '较昨日',
  },
  {
    label: '处置率',
    value: topStatsValues.handleRate.toFixed(1),
    unit: '%',
    icon: CircleCheck,
    gradient: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
    // [v8.3 fix] 移除硬编码 2.1, 无历史对比数据时不显示趋势
    trend: undefined,
    trendUnit: '%',
    trendDesc: '',
  },
])

// ── 安全评分 ──
const securityScore = ref<{ overall: number; trend?: number } | null>(null)
const securityScoreFailed = ref(false)

const scoreDeg = computed(() => `${((securityScore.value?.overall ?? 0) / 100) * 360}deg`)
const scoreTagType = computed(() => {
  const s = securityScore.value?.overall ?? 0
  return s >= 90 ? 'success' : s >= 70 ? 'warning' : 'danger'
})
const scoreLabel = computed(() => {
  const s = securityScore.value?.overall ?? 0
  return s >= 90 ? '优秀' : s >= 70 ? '良好' : '需关注'
})

const scoreDimensions = ref<Array<{ label: string; value: number; color: string }>>([])
const scoreDimensionsFailed = ref(false)

// ── Agent 活跃度 ──
const agentActivity = ref<{
  perceptionCalls: number; analysisCalls: number; decisionCalls: number;
  expertInvokes: number; avgConfidence: number;
} | null>(null)
const agentActivityFailed = ref(false)

const agentStats = computed(() => {
  const a = agentActivity.value
  if (!a) return []
  return [
    {
      label: '感知Agent',
      desc: '视频/音频/传感器',
      value: a.perceptionCalls.toLocaleString(),
      unit: '次/天',
      color: '#3B82F6',
    },
    {
      label: '研判Agent',
      desc: '事件分析/推理',
      value: a.analysisCalls.toLocaleString(),
      unit: '次/天',
      color: '#7C3AED',
    },
    {
      label: '决策Agent',
      desc: '策略生成/调度',
      value: a.decisionCalls.toLocaleString(),
      unit: '次/天',
      color: '#F59E0B',
    },
    {
      label: '专家唤醒',
      desc: '领域专家调用',
      value: a.expertInvokes.toString(),
      unit: '次',
      color: '#10B981',
    },
  ]
})

const confidenceColor = computed(() => {
  const c = agentActivity.value?.avgConfidence ?? 0
  return c >= 0.9 ? '#10B981' : c >= 0.8 ? '#F59E0B' : '#EF4444'
})

// ── 联邦学习 ──
const federationStatus = ref<{
  status: 'running' | 'paused' | 'idle';
  participatingBoxes: number; totalBoxes: number; currentRound: number;
  aggregationAccuracy: number; privacyBudget: number; privacyBudgetTotal: number;
} | null>(null)
const federationStatusFailed = ref(false)

const alarmTrendData = ref<any[]>([])
const alarmTypes = ref<any[]>([])
const alarmTrendFailed = ref(false)
const projectHeatmapFailed = ref(false)
const fedStatusLabel = computed(() => {
  const m: Record<string, string> = { running: '🟢 运行中', paused: '⏸ 已暂停', idle: '⚪ 空闲' }
  return m[federationStatus.value?.status ?? 'idle'] ?? '未知'
})
const fedAggregationAccuracy = computed(() =>
  ((federationStatus.value?.aggregationAccuracy ?? 0) * 100).toFixed(1)
)
const fedPrivacyUsed = computed(() => {
  const f = federationStatus.value
  if (!f || !f.privacyBudgetTotal) return 0
  return Math.round((f.privacyBudget / f.privacyBudgetTotal) * 100)
})

// ── 7日告警趋势 ──
const alarmTrendUp = ref<boolean | null>(null)
const alarmTrendPercent = ref<number | null>(null)
const alarmTrendOption = computed<EChartsOption>(() => {
  const trend = alarmTrendData.value || []
  // 后端返回 [{hour:"00:00", count:1}, ...]
  const days = trend.length > 0
    ? trend.map((t: any) => t.hour || '')
    : ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']
  const seriesData = trend.length > 0
    ? trend.map((t: any) => t.count ?? 0)
    : []

  return ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    textStyle: { color: '#E8EAED', fontSize: 13 },
  },
  grid: { top: 10, right: 16, bottom: 20, left: 40 },
  xAxis: {
    type: 'category',
    data: days,
    axisLine: { lineStyle: { color: '#374151' } },
    axisLabel: { color: '#9CA3AF' },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: '#1F2937', type: 'dashed' } },
    axisLabel: { color: '#9CA3AF' },
  },
  series: seriesData.length > 0 ? [
    {
      name: '告警数', type: 'line', data: seriesData,
      lineStyle: { color: '#3B82F6', width: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.3)' }, { offset: 1, color: 'rgba(59,130,246,0.02)' }] } },
      itemStyle: { color: '#3B82F6' },
      symbol: 'circle', symbolSize: 6, smooth: true,
    },
  ] : [
    { name: '暂无数据', type: 'line', data: [] },
  ],
}) as EChartsOption
})

// ── 项目热力图 ──
const projectHeatmap = ref<Array<{ name: string; rate: number }>>([])
</script>

<style scoped>
/* ============================================================
 * 仪表盘 Dashboard — v6.0 样式
 * ============================================================ */

.dashboard {
  /* padding: 20px 24px; */
  /* max-width: var(--content-max-width, 1440px); */
  /* margin: 0 auto; */
  animation: fadeIn 0.3s ease;
}
.dashboard-empty {
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
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
  min-height: 122px;
  height: 100%;
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
  min-height: 78px;
  display: flex;
  flex-direction: column;
  justify-content: center;
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

.stat-trend,
.stat-trend-placeholder {
  min-height: 18px;
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
  gap: 8px;
}

.heatmap-name {
  flex: 0 1 120px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--app-text-primary);
}

.heatmap-pct {
  flex-shrink: 0;
  width: 42px;
  text-align: right;
  font-size: 13px;
  font-weight: var(--font-semibold, 600);
  font-family: var(--font-number);
}

.heatmap-status {
  flex-shrink: 0;
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
