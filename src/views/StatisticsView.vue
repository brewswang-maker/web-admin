<template>
  <div class="statistics-page">
    <div class="page-title">
      <h2>{{ t('statistics.title') }}</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <el-button size="small" @click="exportCSV"><el-icon><Download /></el-icon>{{ t('statistics.exportCSV') }}</el-button>
        <el-radio-group v-model="timeRange" size="small" @change="loadData">
          <el-radio-button value="7d">{{ t('statistics.range7d') }}</el-radio-button>
          <el-radio-button value="30d">{{ t('statistics.range30d') }}</el-radio-button>
          <el-radio-button value="90d">{{ t('statistics.range90d') }}</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 安全态势评分 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="6">
        <el-card shadow="hover" class="score-card">
          <div class="score-main">
            <div class="score-circle" :style="{ '--score': scorePercent }">
              <span class="score-num">{{ securityScore?.overall ?? '--' }}</span>
            </div>
            <div class="score-trend" :class="(securityScore?.trend ?? 0) >= 0 ? 'up' : 'down'">
              {{ (securityScore?.trend ?? 0) >= 0 ? '↑' : '↓' }} {{ Math.abs(securityScore?.trend ?? 0) }}%
            </div>
          </div>
          <div class="score-label">{{ t('statistics.globalScore') }}</div>
        </el-card>
      </el-col>
      <el-col :span="18">
        <el-card :header="t('statistics.securityDimensions')" class="dimension-card">
          <div class="dimension-bars">
            <div v-for="d in dimensions" :key="d.label" class="dimension-item">
              <span class="dim-label">{{ d.label }}</span>
              <el-progress :percentage="d.value" :color="d.color" :stroke-width="10" />
              <span class="dim-value">{{ d.value }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 告警统计 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="16">
        <el-card :header="t('statistics.alarmTrend')">
          <LazyChart :option="alarmTrendOption" height="320px" />
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card :header="t('statistics.alarmDist')">
          <LazyChart :option="alarmPieOption" height="320px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 设备分析 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="12">
        <el-card :header="t('statistics.deviceOnlineRate')">
          <LazyChart :option="onlineRateOption" height="280px" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card :header="t('statistics.avgResourceUsage')">
          <LazyChart :option="resourceUsageOption" height="280px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- AI Agent 活跃度 + 项目告警统计 -->
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card :header="'🟣 ' + t('statistics.agentActivity')">
          <LazyChart :option="agentActivityOption" height="280px" />
          <div class="agent-metrics">
            <div class="agent-metric">
              <span class="am-label">{{ t('statistics.perceptionAgent') }}</span>
              <span class="am-value">{{ agentActivity?.perceptionCalls?.toLocaleString() ?? '-' }}</span>
            </div>
            <div class="agent-metric">
              <span class="am-label">{{ t('statistics.analysisAgent') }}</span>
              <span class="am-value">{{ agentActivity?.analysisCalls?.toLocaleString() ?? '-' }}</span>
            </div>
            <div class="agent-metric">
              <span class="am-label">{{ t('statistics.decisionAgent') }}</span>
              <span class="am-value">{{ agentActivity?.decisionCalls?.toLocaleString() ?? '-' }}</span>
            </div>
            <div class="agent-metric">
              <span class="am-label">{{ t('statistics.expertInvoke') }}</span>
              <span class="am-value">{{ agentActivity?.expertInvokes ?? '-' }}</span>
            </div>
            <div class="agent-metric">
              <span class="am-label">{{ t('statistics.avgConfidence') }}</span>
              <span class="am-value">{{ agentActivity?.avgConfidence ? (agentActivity.avgConfidence * 100).toFixed(1) + '%' : '-' }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card :header="t('statistics.projectAlarmStats')">
          <LazyChart :option="projectAlarmOption" height="280px" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCloudStore } from '@/stores/cloud'
import LazyChart from '@/components/LazyChart.vue'
import type { AlarmStats, SecurityScore, AgentActivity } from '@/types/analytics'
import { Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { exportApi } from '@/api/export'

const cloudStore = useCloudStore()
const { t } = useI18n()
const timeRange = ref('7d')
const securityScore = computed(() => cloudStore.securityScore)
const alarmStats = computed(() => cloudStore.alarmStats)
const agentActivity = computed(() => cloudStore.agentActivity)
const deviceAnalytics = computed(() => cloudStore.deviceAnalytics)

const scorePercent = computed(() => {
  const s = securityScore.value?.overall
  return s !== undefined ? `${s}%` : '0%'
})

const dimensions = computed(() => {
  const d = securityScore.value?.dimensions
  if (!d) return []
  if (!Array.isArray(d)) return []
  return d
})

// ---- 告警趋势 ----
const alarmTrendOption = computed<any>(() => {
  const data = alarmStats.value?.trendData ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: [t('statistics.levelCritical'), t('statistics.levelHigh'), t('statistics.levelMedium'), t('statistics.levelLow')] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: data.map((d: any) => d.date.slice(5)) },
    yAxis: { type: 'value' as const },
    series: [
      { name: t('statistics.levelCritical'), type: 'line', smooth: true, data: data.map((d: any) => d.critical), itemStyle: { color: '#f5222d' }, areaStyle: { opacity: 0.1, color: '#f5222d' } },
      { name: t('statistics.levelHigh'), type: 'line', smooth: true, data: data.map((d: any) => d.high), itemStyle: { color: '#fa8c16' }, areaStyle: { opacity: 0.1, color: '#fa8c16' } },
      { name: t('statistics.levelMedium'), type: 'line', smooth: true, data: data.map((d: any) => d.medium), itemStyle: { color: '#1890ff' }, areaStyle: { opacity: 0.1, color: '#1890ff' } },
      { name: t('statistics.levelLow'), type: 'line', smooth: true, data: data.map((d: any) => d.low), itemStyle: { color: '#52c41a' }, areaStyle: { opacity: 0.1, color: '#52c41a' } }
    ]
  }
})

// ---- 告警饼图 ----
const alarmPieOption = computed<any>(() => {
  const s = alarmStats.value
  if (!s) return {}
  return {
    tooltip: { trigger: 'item' as const },
    legend: { orient: 'vertical' as const, right: '5%', top: 'center' },
    series: [{
      name: t('statistics.alarmDist'), type: 'pie', radius: ['45%', '75%'], center: ['40%', '50%'],
      label: { show: false },
      data: [
        { value: s.critical, name: t('statistics.levelCritical'), itemStyle: { color: '#f5222d' } },
        { value: s.high, name: t('statistics.levelHigh'), itemStyle: { color: '#fa8c16' } },
        { value: s.medium, name: t('statistics.levelMedium'), itemStyle: { color: '#1890ff' } },
        { value: s.low, name: t('statistics.levelLow'), itemStyle: { color: '#52c41a' } }
      ]
    }]
  }
})

// ---- 设备在线率 ----
const onlineRateOption = computed<any>(() => {
  const data = deviceAnalytics.value?.onlineRateTrend ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: data.map((d: any) => d.date.slice(5)) },
    yAxis: { type: 'value' as const, min: 80, max: 100 },
    series: [{
      name: t('statistics.onlineRate'), type: 'line', smooth: true, data: data.map((d: any) => d.rate),
      itemStyle: { color: '#52c41a' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(82,196,26,0.3)' }, { offset: 1, color: 'rgba(82,196,26,0)' }] } },
      markLine: { data: [{ type: 'average', name: t('statistics.average') }] }
    }]
  }
})

// ---- 资源使用 ----
const resourceUsageOption = computed<any>(() => {
  const trend = deviceAnalytics.value?.resourceUsageTrend ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: [t('statistics.avgCPU'), t('statistics.avgMemory')] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: trend.map((d: any) => d.date.slice(5)) },
    yAxis: { type: 'value' as const, max: 100 },
    series: [
      { name: t('statistics.avgCPU'), type: 'line', smooth: true, data: trend.map((d: any) => d.cpu), itemStyle: { color: '#1890ff' } },
      { name: t('statistics.avgMemory'), type: 'line', smooth: true, data: trend.map((d: any) => d.mem), itemStyle: { color: '#52c41a' } }
    ]
  }
})

// ---- Agent 活跃度 ----
const agentActivityOption = computed<any>(() => {
  const data = agentActivity.value?.trendData ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: [t('statistics.perception'), t('statistics.analysis'), t('statistics.decision')] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: data.map((d: any) => d.date.slice(5)) },
    yAxis: { type: 'value' as const },
    series: [
      { name: t('statistics.perception'), type: 'line', smooth: true, data: data.map((d: any) => d.calls), itemStyle: { color: '#1890ff' } },
      { name: t('statistics.analysis'), type: 'line', smooth: true, data: data.map((d: any) => d.calls), itemStyle: { color: '#722ed1' } },
      { name: t('statistics.decision'), type: 'line', smooth: true, data: data.map((d: any) => d.calls), itemStyle: { color: '#fa8c16' } }
    ]
  }
})

// ---- 项目告警 ----
const projectAlarmOption = computed<any>(() => {
  const data = alarmStats.value?.distribution ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: [t('statistics.alarmTotal'), t('statistics.handled')] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: data.map((d: any) => d.name) },
    yAxis: { type: 'value' as const },
    series: [
      { name: t('statistics.alarmTotal'), type: 'bar', data: data.map((d: any) => d.value), itemStyle: { color: '#f5222d', borderRadius: [4, 4, 0, 0] } },
      { name: t('statistics.handled'), type: 'bar', data: data.map((d: any) => d.value), itemStyle: { color: '#52c41a', borderRadius: [4, 4, 0, 0] } }
    ]
  }
})

// [v8.6] 非阻塞并行加载 — 各面板独立渲染
function loadData() {
  cloudStore.fetchSecurityScore()
  cloudStore.fetchAlarmStats()
  cloudStore.fetchDeviceAnalytics()
  cloudStore.fetchAgentActivity()
}

onMounted(loadData)

// ── 导出报表 ──
async function exportCSV() {
  const stats = cloudStore.alarmStats
  if (!stats) {
    ElMessage.warning(t('statistics.noDataExport'))
    return
  }
  try {
    ElMessage.info(t('statistics.generating'))
    const res = await exportApi.create({
      type: 'statistics',
      format: 'xlsx',
      params: { timeRange: timeRange.value },
      fileName: `${t('statistics.title')}_${timeRange.value}_${new Date().toISOString().slice(0, 10)}`,
    })
    const task = res.data?.data
    if (task?.id) {
      const poll = setInterval(async () => {
        try {
          const detail = await exportApi.getTaskDetail(task.id)
          const td = detail.data?.data
          if (td?.status === 'completed' && td.fileUrl) {
            clearInterval(poll)
            const blob = await exportApi.downloadFile(task.id)
            const url = URL.createObjectURL(blob.data as any)
            const a = document.createElement('a')
            a.href = url
            a.download = td.fileName || `${t('statistics.title')}.xlsx`
            a.click()
            URL.revokeObjectURL(url)
            ElMessage.success(t('statistics.exportComplete'))
          } else if (td?.status === 'failed') {
            clearInterval(poll)
            ElMessage.error(td.errorMessage || t('statistics.exportFailed'))
          }
        } catch { clearInterval(poll) }
      }, 2000)
    }
  } catch {
    ElMessage.error(t('statistics.exportRequestFailed'))
  }
}
</script>

<style scoped>
/* .statistics-page { padding: 0 4px; } */
.page-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title h2 { margin: 0; font-size: 20px; }
.score-card { text-align: center; padding: 8px 0; }
.score-main { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.score-circle {
  width: 100px; height: 100px; border-radius: 50%;
  background: conic-gradient(#52c41a 0% var(--score, 0%), #f0f0f0 var(--score, 0%) 100%);
  display: flex; align-items: center; justify-content: center; position: relative;
}
.score-circle::after {
  content: ''; width: 78px; height: 78px; border-radius: 50%; background: #fff;
  position: absolute;
}
.score-num { font-size: 28px; font-weight: 700; z-index: 1; color: #1f2937; }
.score-trend { font-size: 14px; font-weight: 600; margin-top: 4px; }
.score-trend.up { color: #52c41a; }
.score-trend.down { color: #f5222d; }
.score-label { font-size: 14px; color: #6b7280; margin-top: 8px; }
.dimension-bars { display: flex; flex-direction: column; gap: 8px; }
.dimension-item { display: flex; align-items: center; gap: 12px; }
.dim-label { width: 70px; font-size: 13px; color: #6b7280; text-align: right; flex-shrink: 0; }
.dim-value { width: 40px; font-size: 13px; font-weight: 600; flex-shrink: 0; }
.dimension-item :deep(.el-progress) { flex: 1; }
.agent-metrics { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.agent-metric { flex: 1; min-width: 100px; text-align: center; padding: 8px; background: #f5f3ff; border-radius: 8px; }
.am-label { display: block; font-size: 12px; color: #7c3aed; margin-bottom: 2px; }
.am-value { font-size: 16px; font-weight: 700; color: #4c1d95; }
</style>
