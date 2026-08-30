<template>
  <div ref="pageRoot" class="screening-dashboard" :class="{ fullscreen: isFullscreen }">
    <!-- ===== 顶部标题栏 ===== -->
    <div class="dash-header">
      <div class="dash-title">
        <el-icon><Monitor /></el-icon>
        <span>安检运行大屏</span>
        <el-tag size="small" effect="plain">对标海康可视化安检中枢</el-tag>
      </div>
      <div class="dash-actions">
        <el-radio-group v-model="hours" size="small" @change="loadAll">
          <el-radio-button :label="24">24h</el-radio-button>
          <el-radio-button :label="48">48h</el-radio-button>
          <el-radio-button :label="72">72h</el-radio-button>
        </el-radio-group>
        <el-button size="small" :icon="Refresh" :loading="loading" @click="loadAll">刷新</el-button>
        <el-button size="small" :icon="FullScreen" @click="toggleFullscreen">全屏</el-button>
      </div>
    </div>

    <!-- ===== KPI 卡行 ===== -->
    <el-row :gutter="12" class="kpi-row">
      <el-col :xs="12" :sm="8" :md="4" v-for="k in kpiCards" :key="k.label">
        <el-card shadow="never" class="kpi-card" :body-style="{ padding: '12px 14px' }">
          <div class="kpi-value" :style="{ color: k.color }">{{ k.value }}</div>
          <div class="kpi-label">{{ k.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 趋势区 ===== -->
    <el-row :gutter="12">
      <el-col :xs="24" :lg="16">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">告警 / 通行趋势 ({{ hours }}h 按小时)</span></template>
          <LazyChart :option="trendOption" height="300px" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">重点安检事件趋势</span></template>
          <LazyChart :option="keyTrendOption" height="300px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 分布区 ===== -->
    <el-row :gutter="12">
      <el-col :xs="24" :lg="10">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">告警类型分布 ({{ days }} 天)</span></template>
          <LazyChart :option="typePieOption" height="280px" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="14">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">通道告警分布 ({{ days }} 天)</span></template>
          <LazyChart :option="channelBarOption" height="280px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 质控区块 (对标同方威视安检质控) ===== -->
    <el-row :gutter="12">
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="qc-card">
          <template #header><span class="card-title">复核质控汇总</span></template>
          <div class="qc-summary" v-if="data">
            <div class="qc-item"><span class="qc-num">{{ data.feedback.total_feedback }}</span><span class="qc-label">已复核</span></div>
            <div class="qc-item"><span class="qc-num qc-good">{{ data.feedback.true_positives }}</span><span class="qc-label">真实告警</span></div>
            <div class="qc-item"><span class="qc-num qc-bad">{{ data.feedback.false_positives }}</span><span class="qc-label">误报</span></div>
            <div class="qc-item"><span class="qc-num">{{ data.feedback.unsure }}</span><span class="qc-label">存疑</span></div>
          </div>
          <div class="qc-rate-row">
            <span>标注误报率</span>
            <el-progress :percentage="Math.round((data?.feedback.annotated_false_rate || 0) * 100)"
                         :stroke-width="14" :format="(p: number) => `${p}%`" />
          </div>
          <div class="qc-rate-row">
            <span>复核覆盖率</span>
            <el-progress :percentage="Math.round((data?.kpi.review_rate || 0) * 100)"
                         :stroke-width="14" status="success" :format="(p: number) => `${p}%`" />
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="16">
        <el-card shadow="never" class="qc-card">
          <template #header><span class="card-title">复核员标注排行 ({{ days }} 天)</span></template>
          <el-table :data="labelerRows" size="small" height="220" v-loading="loading">
            <el-table-column prop="key" label="复核员" min-width="120" />
            <el-table-column prop="total" label="标注数" width="90" sortable />
            <el-table-column prop="false_alarms" label="误报数" width="90" sortable />
            <el-table-column label="误报率" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="(row.false_alarm_rate || 0) > 0.5 ? 'danger' : (row.false_alarm_rate || 0) > 0.2 ? 'warning' : 'success'"
                        effect="plain">{{ ((row.false_alarm_rate || 0) * 100).toFixed(1) }}%</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 安检运行大屏 — [安检对标优化 2026-08-30]
 * 对标海康「可视化安检中枢」+ 同方威视「安检质控系统」:
 *   GET /stats/screening_dashboard 一次拉齐 趋势/KPI/时延/基线聚合。
 *   复核数据由 AlarmsView 复核标注闭环产出 (false_alarm_feedback)。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Monitor, Refresh, FullScreen } from '@element-plus/icons-vue'
import LazyChart from '@/components/LazyChart.vue'
import { screeningApi, type ScreeningDashboard } from '@/api/screening'
import type { EChartsOption } from 'echarts'

const loading = ref(false)
const isFullscreen = ref(false)
const hours = ref(24)
const days = ref(30)
const data = ref<ScreeningDashboard | null>(null)
const pageRoot = ref<HTMLElement>()
let refreshTimer: ReturnType<typeof setInterval> | null = null

/** epoch 小时 → MM-DD HH:00 标签 */
function hrLabel(hr: number): string {
  const d = new Date(hr * 3600000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`
}

const kpiCards = computed(() => {
  const k = data.value?.kpi
  const lat = data.value?.action_latency
  return [
    { label: '今日告警', value: k?.today_alarms ?? '-', color: '#e6a23c' },
    { label: '今日通行', value: k?.today_passages ?? '-', color: '#67c23a' },
    { label: '待复核', value: k?.pending_review ?? '-', color: '#f56c6c' },
    { label: '标注误报率', value: data.value ? `${((data.value.feedback.annotated_false_rate || 0) * 100).toFixed(1)}%` : '-', color: '#f56c6c' },
    { label: '联动时延 P50', value: lat ? `${lat.p50_ms}ms` : '-', color: '#409eff' },
    { label: '近30天告警', value: data.value ? sumBuckets(data.value.by_type) : '-', color: '#909399' }
  ]
})

function sumBuckets(buckets: Array<{ total: number }>): number {
  return buckets.reduce((s, b) => s + (b.total || 0), 0)
}

/** 双轴趋势: 告警(柱) + 通行(线) */
const trendOption = computed<EChartsOption>(() => {
  const d = data.value
  const hrs = d?.alarm_trend.map(t => hrLabel(t.hr)) || []
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['告警', '通行'], top: 0 },
    grid: { left: 48, right: 48, top: 30, bottom: 24 },
    xAxis: { type: 'category', data: hrs, axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: 'value', name: '告警', splitLine: { show: false } },
      { type: 'value', name: '通行', splitLine: { show: false } }
    ],
    series: [
      { name: '告警', type: 'bar', data: d?.alarm_trend.map(t => t.cnt) || [],
        itemStyle: { color: '#e6a23c' }, barMaxWidth: 18 },
      { name: '通行', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false,
        data: d?.passage_trend.map(t => t.cnt) || [], itemStyle: { color: '#67c23a' },
        areaStyle: { opacity: 0.12 } }
    ]
  }
})

/** 重点安检事件趋势 */
const keyTrendOption = computed<EChartsOption>(() => {
  const d = data.value?.key_trend || []
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 20, bottom: 24 },
    xAxis: { type: 'category', data: d.map(t => hrLabel(t.hr)), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      name: '重点事件', type: 'line', smooth: true, data: d.map(t => t.cnt),
      itemStyle: { color: '#f56c6c' }, areaStyle: { opacity: 0.15 }
    }]
  }
})

/** 告警类型饼图 (top 8) */
const typePieOption = computed<EChartsOption>(() => {
  const items = [...(data.value?.by_type || [])]
    .sort((a, b) => b.total - a.total).slice(0, 8)
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { type: 'scroll', orient: 'vertical', right: 4, top: 'middle', textStyle: { fontSize: 10 } },
    series: [{
      type: 'pie', radius: ['38%', '66%'], center: ['38%', '50%'],
      data: items.map(i => ({ name: i.key, value: i.total })),
      label: { show: false }
    }]
  }
})

/** 通道告警柱图 */
const channelBarOption = computed<EChartsOption>(() => {
  const items = [...(data.value?.by_channel || [])].sort((a, b) => b.total - a.total).slice(0, 12)
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 90, right: 24, top: 12, bottom: 24 },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: items.map(i => `通道 ${i.key}`).reverse(),
             axisLabel: { fontSize: 10 } },
    series: [{
      type: 'bar', data: items.map(i => i.total).reverse(),
      itemStyle: { color: '#409eff' }, barMaxWidth: 14,
      label: { show: true, position: 'right', fontSize: 10 }
    }]
  }
})

/** 复核员排行 (含系统标注) */
const labelerRows = computed(() => [...(data.value?.feedback.by_labeler || [])]
  .sort((a, b) => b.total - a.total))

async function loadAll() {
  loading.value = true
  try {
    const resp = await screeningApi.getScreeningDashboard({ hours: hours.value, days: days.value })
    data.value = resp.data?.data || null
  } catch (e) {
    console.error('[ScreeningDashboard] load failed', e)
  } finally {
    loading.value = false
  }
}

function toggleFullscreen() {
  const el = pageRoot.value
  if (!el) return
  if (!document.fullscreenElement) {
    el.requestFullscreen?.()
    isFullscreen.value = true
  } else {
    document.exitFullscreen?.()
    isFullscreen.value = false
  }
}

onMounted(() => {
  loadAll()
  refreshTimer = setInterval(loadAll, 30000)
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.screening-dashboard { padding: 12px; background: #f5f7fa; min-height: calc(100vh - 84px); }
.screening-dashboard.fullscreen { background: #1a1a2e; overflow-y: auto; }

.dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.dash-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; }
.dash-actions { display: flex; gap: 8px; align-items: center; }

.kpi-row { margin-bottom: 12px; }
.kpi-card { text-align: center; }
.kpi-value { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kpi-label { color: #909399; font-size: 12px; margin-top: 2px; }

.chart-card { margin-bottom: 12px; }
.card-title { font-size: 13px; font-weight: 600; }

.qc-card { margin-bottom: 12px; }
.qc-summary { display: flex; justify-content: space-around; margin-bottom: 14px; }
.qc-item { display: flex; flex-direction: column; align-items: center; }
.qc-num { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.qc-good { color: #67c23a; }
.qc-bad { color: #f56c6c; }
.qc-label { color: #909399; font-size: 12px; }
.qc-rate-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.qc-rate-row > span { width: 76px; color: #606266; font-size: 13px; flex-shrink: 0; }
.qc-rate-row :deep(.el-progress) { flex: 1; }
</style>
