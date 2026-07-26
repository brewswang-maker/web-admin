<template>
  <div class="statistics-page">
    <div class="page-title">
      <h2>📈 数据统计分析</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <el-button size="small" @click="exportCSV"><el-icon><Download /></el-icon>导出CSV</el-button>
        <el-radio-group v-model="timeRange" size="small" @change="loadData">
          <el-radio-button value="7d">近7天</el-radio-button>
          <el-radio-button value="30d">近30天</el-radio-button>
          <el-radio-button value="90d">近90天</el-radio-button>
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
          <div class="score-label">全局安全态势评分</div>
        </el-card>
      </el-col>
      <el-col :span="18">
        <el-card header="安全维度分布" class="dimension-card">
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
        <el-card header="告警趋势">
          <LazyChart :option="alarmTrendOption" height="320px" />
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card header="告警分布">
          <LazyChart :option="alarmPieOption" height="320px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 设备分析 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="12">
        <el-card header="设备在线率趋势">
          <LazyChart :option="onlineRateOption" height="280px" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="平均资源使用">
          <LazyChart :option="resourceUsageOption" height="280px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- AI Agent 活跃度 + 项目告警统计 -->
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card header="🟣 AI Agent 活跃度">
          <LazyChart :option="agentActivityOption" height="280px" />
          <div class="agent-metrics">
            <div class="agent-metric">
              <span class="am-label">感知Agent</span>
              <span class="am-value">{{ agentActivity?.perceptionCalls?.toLocaleString() ?? '-' }}</span>
            </div>
            <div class="agent-metric">
              <span class="am-label">研判Agent</span>
              <span class="am-value">{{ agentActivity?.analysisCalls?.toLocaleString() ?? '-' }}</span>
            </div>
            <div class="agent-metric">
              <span class="am-label">决策Agent</span>
              <span class="am-value">{{ agentActivity?.decisionCalls?.toLocaleString() ?? '-' }}</span>
            </div>
            <div class="agent-metric">
              <span class="am-label">专家唤醒</span>
              <span class="am-value">{{ agentActivity?.expertInvokes ?? '-' }}</span>
            </div>
            <div class="agent-metric">
              <span class="am-label">平均置信度</span>
              <span class="am-value">{{ agentActivity?.avgConfidence ? (agentActivity.avgConfidence * 100).toFixed(1) + '%' : '-' }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="各项目告警统计">
          <LazyChart :option="projectAlarmOption" height="280px" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCloudStore } from '@/stores/cloud'
import LazyChart from '@/components/LazyChart.vue'
import type { AlarmStats, SecurityScore, AgentActivity } from '@/types/analytics'
import { Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { exportApi } from '@/api/export'

const cloudStore = useCloudStore()
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
    legend: { data: ['严重', '高', '中', '低'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: data.map((d: any) => d.date.slice(5)) },
    yAxis: { type: 'value' as const },
    series: [
      { name: '严重', type: 'line', smooth: true, data: data.map((d: any) => d.critical), itemStyle: { color: '#f5222d' }, areaStyle: { opacity: 0.1, color: '#f5222d' } },
      { name: '高', type: 'line', smooth: true, data: data.map((d: any) => d.high), itemStyle: { color: '#fa8c16' }, areaStyle: { opacity: 0.1, color: '#fa8c16' } },
      { name: '中', type: 'line', smooth: true, data: data.map((d: any) => d.medium), itemStyle: { color: '#1890ff' }, areaStyle: { opacity: 0.1, color: '#1890ff' } },
      { name: '低', type: 'line', smooth: true, data: data.map((d: any) => d.low), itemStyle: { color: '#52c41a' }, areaStyle: { opacity: 0.1, color: '#52c41a' } }
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
      name: '告警分布', type: 'pie', radius: ['45%', '75%'], center: ['40%', '50%'],
      label: { show: false },
      data: [
        { value: s.critical, name: '严重', itemStyle: { color: '#f5222d' } },
        { value: s.high, name: '高', itemStyle: { color: '#fa8c16' } },
        { value: s.medium, name: '中', itemStyle: { color: '#1890ff' } },
        { value: s.low, name: '低', itemStyle: { color: '#52c41a' } }
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
      name: '在线率', type: 'line', smooth: true, data: data.map((d: any) => d.rate),
      itemStyle: { color: '#52c41a' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(82,196,26,0.3)' }, { offset: 1, color: 'rgba(82,196,26,0)' }] } },
      markLine: { data: [{ type: 'average', name: '均值' }] }
    }]
  }
})

// ---- 资源使用 ----
const resourceUsageOption = computed<any>(() => {
  const trend = deviceAnalytics.value?.resourceUsageTrend ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['平均CPU', '平均内存'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: trend.map((d: any) => d.date.slice(5)) },
    yAxis: { type: 'value' as const, max: 100 },
    series: [
      { name: '平均CPU', type: 'line', smooth: true, data: trend.map((d: any) => d.cpu), itemStyle: { color: '#1890ff' } },
      { name: '平均内存', type: 'line', smooth: true, data: trend.map((d: any) => d.mem), itemStyle: { color: '#52c41a' } }
    ]
  }
})

// ---- Agent 活跃度 ----
const agentActivityOption = computed<any>(() => {
  const data = agentActivity.value?.trendData ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['感知', '研判', '决策'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: data.map((d: any) => d.date.slice(5)) },
    yAxis: { type: 'value' as const },
    series: [
      { name: '感知', type: 'line', smooth: true, data: data.map((d: any) => d.calls), itemStyle: { color: '#1890ff' } },
      { name: '研判', type: 'line', smooth: true, data: data.map((d: any) => d.calls), itemStyle: { color: '#722ed1' } },
      { name: '决策', type: 'line', smooth: true, data: data.map((d: any) => d.calls), itemStyle: { color: '#fa8c16' } }
    ]
  }
})

// ---- 项目告警 ----
const projectAlarmOption = computed<any>(() => {
  const data = alarmStats.value?.distribution ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['告警总数', '已处理'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: data.map((d: any) => d.name) },
    yAxis: { type: 'value' as const },
    series: [
      { name: '告警总数', type: 'bar', data: data.map((d: any) => d.value), itemStyle: { color: '#f5222d', borderRadius: [4, 4, 0, 0] } },
      { name: '已处理', type: 'bar', data: data.map((d: any) => d.value), itemStyle: { color: '#52c41a', borderRadius: [4, 4, 0, 0] } }
    ]
  }
})

async function loadData() {
  await Promise.all([
    cloudStore.fetchSecurityScore(),
    cloudStore.fetchAlarmStats(),
    cloudStore.fetchDeviceAnalytics(),
    cloudStore.fetchAgentActivity()
  ])
}

onMounted(loadData)

// ── 导出报表 ──
async function exportCSV() {
  const stats = cloudStore.alarmStats
  if (!stats) {
    ElMessage.warning('暂无数据可导出')
    return
  }
  try {
    ElMessage.info('正在生成统计报表...')
    const res = await exportApi.create({
      type: 'statistics',
      format: 'xlsx',
      params: { timeRange: timeRange.value },
      fileName: `统计报表_${timeRange.value}_${new Date().toISOString().slice(0, 10)}`,
    })
    const task = res.data?.data
    if (task?.id) {
      const poll = setInterval(async () => {
        try {
          const detail = await exportApi.getTaskDetail(task.id)
          const t = detail.data?.data
          if (t?.status === 'completed' && t.fileUrl) {
            clearInterval(poll)
            const blob = await exportApi.downloadFile(task.id)
            const url = URL.createObjectURL(blob.data as any)
            const a = document.createElement('a')
            a.href = url
            a.download = t.fileName || `统计报表.xlsx`
            a.click()
            URL.revokeObjectURL(url)
            ElMessage.success('导出完成')
          } else if (t?.status === 'failed') {
            clearInterval(poll)
            ElMessage.error(t.errorMessage || '导出失败')
          }
        } catch { clearInterval(poll) }
      }, 2000)
    }
  } catch {
    ElMessage.error('导出请求失败')
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
