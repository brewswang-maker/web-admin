<template>
  <div class="dashboard">
    <!-- ===== 页面标题 ===== -->
    <div class="page-header">
      <div class="page-title-wrap">
        <h1 class="page-title">{{ t('dashboard.title') }}</h1>
        <span class="page-subtitle">
          {{ t('dashboard.lastUpdate') }}: {{ lastUpdated }}
          <el-button link type="primary" size="small" @click="refreshAll" class="refresh-btn">
            <el-icon :class="{ spinning: refreshing }"><Refresh /></el-icon>
          </el-button>
        </span>
      </div>
      <!-- 项目选择器 -->
      <div class="header-actions">
        <el-select
          v-model="selectedProject"
          :placeholder="t('dashboard.selectProject')"
          size="default"
          style="width: 180px"
          @change="onProjectChange"
        >
          <el-option :label="t('dashboard.allProjects')" value="all" />
          <el-option :label="t('dashboard.projectSmartPark')" value="park" />
          <el-option :label="t('dashboard.projectConstruction')" value="construction" />
          <el-option :label="t('dashboard.projectParking')" value="parking" />
          <el-option :label="t('dashboard.projectMall')" value="mall" />
          <el-option :label="t('dashboard.projectChemical')" value="chemical" />
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
              <span class="card-header-title">{{ t('dashboard.securityPosture') }}</span>
              <el-tag v-if="securityScore" :type="scoreTagType" size="small" effect="plain">{{ scoreLabel }}</el-tag>
              <el-tag v-else type="info" size="small" effect="plain">{{ securityScoreFailed ? t('dashboard.loadFailed') : t('dashboard.loading') }}</el-tag>
            </div>
          </template>
          <div class="score-body" v-if="securityScore">
            <div class="score-ring-wrap">
              <div class="score-ring" :style="{ '--score-deg': scoreDeg }">
                <div class="score-ring-inner">
                  <span class="score-big">{{ securityScore?.overall ?? '--' }}</span>
                  <span class="score-unit-label">{{ t('dashboard.scoreUnitLabel') }}</span>
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
            <el-empty v-else :description="t('dashboard.securityScoreFailed')" :image-size="60">
              <el-button size="small" type="primary" @click="refreshAll">{{ t('dashboard.retry') }}</el-button>
            </el-empty>
          </div>
        </el-card>
      </el-col>

      <!-- Agent 活跃度 -->
      <el-col :span="8">
        <el-card class="agent-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">{{ t('dashboard.agentActivity') }}</span>
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
            <el-empty v-else :description="t('dashboard.agentActivityFailed')" :image-size="60">
              <el-button size="small" type="primary" @click="refreshAll">{{ t('dashboard.retry') }}</el-button>
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
              <span class="conf-label">{{ t('dashboard.avgConfidence') }}</span>
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
              <span class="card-header-title">{{ t('dashboard.federationStatus') }}</span>
              <el-button link size="small" type="primary" @click="$router.push('/federation')">
                {{ t('dashboard.fedDetailLink') }} →
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
                <span class="fed-metric-label">{{ t('dashboard.fedParticipating') }}</span>
              </div>
              <div class="fed-metric-item">
                <span class="fed-metric-num">R{{ federationStatus.currentRound }}</span>
                <span class="fed-metric-label">{{ t('dashboard.fedRound') }}</span>
              </div>
              <div class="fed-metric-item">
                <span class="fed-metric-num accent">{{ fedAggregationAccuracy }}%</span>
                <span class="fed-metric-label">{{ t('dashboard.fedAccuracy') }}</span>
              </div>
              <div class="fed-metric-item">
                <span class="fed-metric-num">{{ fedPrivacyUsed }}%</span>
                <span class="fed-metric-label">{{ t('dashboard.fedPrivacy') }}</span>
              </div>
            </div>
          </div>
          <el-empty v-else :description="t('dashboard.fedNotStarted')" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 底部行: 告警趋势图 + 项目热力图 ===== -->
    <el-row :gutter="16" class="bottom-row">
      <!-- 告警趋势 -->
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">{{ t('dashboard.alarmTrend7d') }}</span>
              <el-radio-group v-model="alarmTrendMode" size="small" @change="fetchAlarmTrend" style="margin-left: 12px">
                <el-radio-button value="24h">{{ t('dashboard.trendToday') }}</el-radio-button>
                <el-radio-button value="7d">{{ t('dashboard.trend7d') }}</el-radio-button>
                <el-radio-button value="30d">{{ t('dashboard.trend30d') }}</el-radio-button>
              </el-radio-group>
              <span v-if="alarmTrendUp !== null && alarmTrendPercent !== null && alarmTrendMode !== '24h'" class="card-header-extra" :class="alarmTrendUp ? 'up' : 'down'">
                {{ alarmTrendMode === '30d' ? t('dashboard.trendThisMonth') : t('dashboard.trendThisWeekLabel') }}{{ alarmTrendUp ? '↑' : '↓' }}{{ alarmTrendPercent }}%
              </span>
            </div>
          </template>
          <LazyChart v-if="alarmTrendData.length" :option="alarmTrendOption" height="280px" />
          <el-skeleton v-else-if="!alarmTrendFailed" :rows="6" animated />
          <el-empty v-else :description="t('dashboard.alarmTrendFailed')" :image-size="60">
            <el-button size="small" type="primary" @click="fetchAlarmTrend">{{ t('dashboard.retry') }}</el-button>
          </el-empty>
        </el-card>
      </el-col>

      <!-- 项目热力图 -->
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">{{ t('dashboard.projectHeatmap') }}</span>
              <el-button link size="small" type="primary" @click="$router.push('/projects')">{{ t('dashboard.allProjectsLink') }} →</el-button>
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
          <el-empty v-else :description="t('dashboard.projectHeatmapFailed')" :image-size="60">
            <el-button size="small" type="primary" @click="refreshAll">{{ t('dashboard.retry') }}</el-button>
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
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()

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
    lastUpdated.value = sec < 60 ? `${sec}${t('dashboard.secondsAgo')}` : `${Math.floor(sec / 60)}${t('dashboard.minutesAgo')}`
  }, 1000)
}

// [FIX 2026-08-22] WS 推送触发去抖重拉: 原告警 handler 仅 alarmCount += 1、
//   设备 handler 仅 deviceOnline += 0 (假更新), 趋势图/热力图/评分等卡片数据
//   仍依赖 5 分钟兜底轮询 → 首页不实时。改为收到推送后 3s 合并窗口内去抖
//   全量重拉 (告警风暴时不打爆 API)。
let wsRefreshDebounce: ReturnType<typeof setTimeout> | null = null
function scheduleWsRefresh() {
  if (wsRefreshDebounce) return
  wsRefreshDebounce = setTimeout(() => {
    wsRefreshDebounce = null
    fetchDashboardData()
  }, 3000)
}

onMounted(async () => {
  startRefreshTimer()
  fetchDashboardData()  // [v8.6] 非阻塞并行加载

  // WebSocket: 告警推送 → 乐观计数 + 去抖全量重拉
  unsubAlarm = subscribe('alarm', (data: any) => {
    topStatsValues.alarmCount += 1
    lastUpdated.value = t('dashboard.justNow')
    startRefreshTimer()
    scheduleWsRefresh()
  })

  // WebSocket: 设备状态变更 → 去抖全量重拉 (deviceOnline 真值由重拉覆盖)
  unsubDevice = subscribe('device_status', () => {
    lastUpdated.value = t('dashboard.justNow')
    startRefreshTimer()
    scheduleWsRefresh()
  })

  // 兜底轮询：5分钟全量刷新
  autoRefreshTimer = setInterval(fetchDashboardData, 300000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
  if (wsRefreshDebounce) clearTimeout(wsRefreshDebounce)
  unsubAlarm?.()
  unsubDevice?.()
})

// ── API数据获取 ──
// [v8.6] 非阻塞并行加载 — 各卡片独立渲染, 不等待其他 API
function fetchDashboardData() {
  // 清空失败标记
  securityScoreFailed.value = false
  scoreDimensionsFailed.value = false
  agentActivityFailed.value = false
  alarmTrendFailed.value = false
  projectHeatmapFailed.value = false
  federationStatusFailed.value = false

  const proj = selectedProject.value

  // 1. 概览 (安全评分 + 顶部统计)
  statsHttp.get('/overview', { params: { project: proj } }).then(res => {
    const d = res.data?.data || res.data
    if (d.security_score !== undefined) {
      securityScore.value = { overall: d.security_score, trend: undefined }
    } else securityScoreFailed.value = true
    topStatsValues.deviceOnline = d.online_devices ?? 0
    topStatsValues.deviceTotal = d.total_devices ?? 0
    topStatsValues.alarmCount = d.today_alarms ?? 0
    topStatsValues.handleRate = d.handle_rate ?? 0
    topStatsValues.alarmTrend = d.alarm_trend ?? 0
  }).catch(() => { securityScoreFailed.value = true })

  // 2. 告警趋势
  statsHttp.get('/alarm-trend', { params: { project: proj, mode: alarmTrendMode.value } }).then(res => {
    const d = res.data?.data || res.data
    if (d.trend) {
      alarmTrendData.value = d.trend
      if (d.trend.length >= 2) {
        const half = Math.floor(d.trend.length / 2)
        const prev = d.trend.slice(0, half).reduce((s: number, t: any) => s + (t.count ?? 0), 0)
        const curr = d.trend.slice(half).reduce((s: number, t: any) => s + (t.count ?? 0), 0)
        if (prev > 0) { alarmTrendPercent.value = Math.round(((curr - prev) / prev) * 100); alarmTrendUp.value = curr <= prev }
      }
    }
    if (d.top_types) alarmTypes.value = d.top_types
  }).catch(() => { alarmTrendFailed.value = true })

  // 3. 设备状态
  statsHttp.get('/device-status', { params: { project: proj } }).then(res => {
    const d = res.data?.data || res.data
    if (d.online_count !== undefined) { topStatsValues.deviceOnline = d.online_count; topStatsValues.deviceTotal = d.total_count }
  }).catch(() => {})

  // 4. 联邦学习状态
  federationApi.getStatus().then(res => {
    const f = res.data?.data as any
    if (f) {
      federationStatus.value = { status: f.enabled ? 'running' : 'idle', participatingBoxes: f.activeNodes ?? 0, totalBoxes: f.totalNodes ?? 0, currentRound: f.round ?? 0, aggregationAccuracy: f.accuracy ?? 0, privacyBudget: 0.65, privacyBudgetTotal: 1.0 }
    } else federationStatusFailed.value = true
  }).catch(() => { federationStatusFailed.value = true })

  // 5. Agent 活跃度
  statsHttp.get('/agent-activity', { params: { period: '24h' } }).then(res => {
    const d = res.data?.data || res.data
    if (d && (d.perceptionCalls !== undefined || d.calls_today !== undefined)) {
      agentActivity.value = { perceptionCalls: d.perceptionCalls ?? 0, analysisCalls: d.analysisCalls ?? 0, decisionCalls: d.decisionCalls ?? 0, expertInvokes: d.expertInvokes ?? 0, avgConfidence: d.avgConfidence ?? 0 }
    } else agentActivityFailed.value = true
  }).catch(() => { agentActivityFailed.value = true })

  // 6. 安全评分维度
  statsHttp.get('/security-score', { params: { period: '24h' } }).then(res => {
    const d = res.data?.data || res.data
    if (Array.isArray(d?.dimensions) && d.dimensions.length) {
      scoreDimensions.value = d.dimensions.map((x: any) => ({ label: x.label ?? '', value: Number(x.value ?? 0), color: x.color ?? '#3B82F6' }))
    } else if (Array.isArray(d) && d.length) {
      scoreDimensions.value = d.map((x: any) => ({ label: x.label ?? '', value: Number(x.value ?? 0), color: x.color ?? '#3B82F6' }))
    } else scoreDimensionsFailed.value = true
  }).catch(() => { scoreDimensionsFailed.value = true })

  // 7. 项目热力图
  statsHttp.get('/project-alarms', { params: { period: '7d' } }).then(res => {
    const d = res.data?.data || res.data
    const items = Array.isArray(d) ? d : (d?.items ?? [])
    if (items.length) { projectHeatmap.value = items.map((x: any) => ({ name: x.projectName ?? x.name ?? '', rate: Number(x.onlineRate ?? x.rate ?? 0) })) }
    else projectHeatmapFailed.value = true
  }).catch(() => { projectHeatmapFailed.value = true })

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
  fetchDashboardData()  // [v8.6] 非阻塞并行加载
  refreshing.value = false
  lastUpdated.value = t('dashboard.justNow')
  startRefreshTimer()
}

/** 独立拉取告警趋势 (切换 mode 时调用, 不重新拉取其他数据) */
async function fetchAlarmTrend() {
  alarmTrendFailed.value = false
  alarmTrendData.value = []
  alarmTrendUp.value = null
  alarmTrendPercent.value = null
  try {
    const res = await statsHttp.get('/alarm-trend', { params: { project: selectedProject.value, mode: alarmTrendMode.value } })
    const d = res.data?.data || res.data
    if (d.trend) {
      alarmTrendData.value = d.trend
      if (alarmTrendMode.value !== '24h' && d.trend.length >= 2) {
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
  } catch {
    alarmTrendFailed.value = true
  }
}

function onProjectChange() {
  refreshAll()
}

// ── 顶部统计卡片 ──
const topStats = computed(() => [
  {
    label: t('dashboard.securityScore'),
    value: securityScore.value?.overall ?? '--',
    unit: '',
    icon: Odometer,
    gradient: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    trend: securityScore.value?.trend,
    trendUnit: t('dashboard.scorePointUnit'),
    trendDesc: t('dashboard.vsYesterday'),
  },
  {
    label: t('dashboard.deviceOnline'),
    value: `${topStatsValues.deviceOnline}/${topStatsValues.deviceTotal}`,
    unit: '',
    icon: Monitor,
    gradient: 'linear-gradient(135deg, #10B981, #059669)',
    trend: topStatsValues.deviceTotal > 0 ? +((topStatsValues.deviceOnline / topStatsValues.deviceTotal * 100 - 96).toFixed(1)) : 0,
    trendUnit: '%',
    trendDesc: `${t('dashboard.onlineRate')} ${topStatsValues.deviceTotal > 0 ? (topStatsValues.deviceOnline / topStatsValues.deviceTotal * 100).toFixed(1) : '--'}%`,
  },
  {
    label: t('dashboard.todayAlarms'),
    value: topStatsValues.alarmCount,
    unit: '',
    icon: Bell,
    gradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
    // [v8.3 fix] 使用真实趋势数据, 不再硬编码 -12
    trend: Math.round(topStatsValues.alarmTrend),
    trendUnit: '%',
    trendDesc: t('dashboard.vsYesterday'),
  },
  {
    label: t('dashboard.handleRate'),
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
  return s >= 90 ? t('dashboard.scoreExcellent') : s >= 70 ? t('dashboard.scoreGood') : t('dashboard.scoreWarn')
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
      label: t('dashboard.agentPerception'),
      desc: t('dashboard.agentDescPerception'),
      value: a.perceptionCalls.toLocaleString(),
      unit: t('dashboard.perDay'),
      color: '#3B82F6',
    },
    {
      label: t('dashboard.agentAnalysis'),
      desc: t('dashboard.agentDescAnalysis'),
      value: a.analysisCalls.toLocaleString(),
      unit: t('dashboard.perDay'),
      color: '#7C3AED',
    },
    {
      label: t('dashboard.agentDecision'),
      desc: t('dashboard.agentDescDecision'),
      value: a.decisionCalls.toLocaleString(),
      unit: t('dashboard.perDay'),
      color: '#F59E0B',
    },
    {
      label: t('dashboard.agentExpert'),
      desc: t('dashboard.agentDescExpert'),
      value: a.expertInvokes.toString(),
      unit: t('dashboard.times'),
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
  const m: Record<string, string> = { running: t('dashboard.fedRunning'), paused: t('dashboard.fedPaused'), idle: t('dashboard.fedIdle') }
  return m[federationStatus.value?.status ?? 'idle'] ?? t('dashboard.unknown')
})
const fedAggregationAccuracy = computed(() =>
  ((federationStatus.value?.aggregationAccuracy ?? 0) * 100).toFixed(1)
)
const fedPrivacyUsed = computed(() => {
  const f = federationStatus.value
  if (!f || !f.privacyBudgetTotal) return 0
  return Math.round((f.privacyBudget / f.privacyBudgetTotal) * 100)
})

// ── 告警趋势 ──
const alarmTrendMode = ref<'24h' | '7d' | '30d'>('24h')
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
      name: t('dashboard.alarmCount'), type: 'line', data: seriesData,
      lineStyle: { color: '#3B82F6', width: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.3)' }, { offset: 1, color: 'rgba(59,130,246,0.02)' }] } },
      itemStyle: { color: '#3B82F6' },
      symbol: 'circle', symbolSize: 6, smooth: true,
    },
  ] : [
    { name: t('dashboard.noData'), type: 'line', data: [] },
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
