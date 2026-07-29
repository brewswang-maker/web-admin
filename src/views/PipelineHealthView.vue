<template>
  <div class="pipeline-health" v-loading="loading">
    <el-row :gutter="16" class="overview-row">
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="SLM Active Streams">
            <template #prefix>
              <el-tag :type="slmStats.active_streams > 0 ? 'success' : 'info'" effect="dark" size="small">
                {{ slmStats.active_streams }} / {{ slmStats.total_streams }}
              </el-tag>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="IRM Throughput (FPS)" :value="irmStats.throughput_fps" :precision="1" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="IRM Tasks (completed/skipped)">
            <template #default>
              {{ irmStats.total_completed }} / <span class="text-warning">{{ irmStats.total_skipped }}</span>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="TPU Utilization">
            <template #default>
              <span :class="tpuClass">{{ (irmStats.tpu_utilization || 0).toFixed(0) }}%</span>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="14">
        <el-card header="IRM Worker Threads" shadow="never" class="mt-16">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="Worker Threads">{{ irmStats.worker_threads }}</el-descriptions-item>
            <el-descriptions-item label="Active Channels">{{ irmStats.active_channels }}</el-descriptions-item>
            <el-descriptions-item label="Queued Tasks">{{ irmStats.queued_tasks }}</el-descriptions-item>
            <el-descriptions-item label="Avg Batch Size">{{ irmStats.avg_batch_size.toFixed(1) }}</el-descriptions-item>
            <el-descriptions-item label="Avg Inference (ms)">
              <span :class="latencyClass(irmStats.avg_inference_ms)">{{ irmStats.avg_inference_ms.toFixed(1) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="Total Submitted">{{ irmStats.total_submitted }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card header="SLM Stream States" shadow="never" class="mt-16">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="Total Streams">{{ slmStats.total_streams }}</el-descriptions-item>
            <el-descriptions-item label="Active">
              <el-tag type="success" size="small">{{ slmStats.active_streams }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="Degraded">
              <el-tag :type="slmStats.degraded_streams > 0 ? 'warning' : 'info'" size="small">
                {{ slmStats.degraded_streams }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="Disconnected">
              <el-tag :type="slmStats.disconnected_streams > 0 ? 'danger' : 'info'" size="small">
                {{ slmStats.disconnected_streams }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="Frames Dispatched">{{ slmStats.total_frames_dispatched }}</el-descriptions-item>
            <el-descriptions-item label="Reconnect Attempts">{{ slmStats.total_reconnect_attempts }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card header="Registered Plugins" shadow="never" class="mt-16" v-if="plugins.length > 0">
          <el-tag v-for="p in plugins" :key="p.type" size="small" class="plugin-tag">
            {{ p.display_name || p.type }}
          </el-tag>
        </el-card>
      </el-col>
    </el-row>

    <el-card header="SLM Channel States (每通道独立指标)" shadow="never" class="mt-16" v-if="slmStats.streams && slmStats.streams.length > 0">
      <el-table :data="slmStats.streams" size="small" stripe>
        <el-table-column prop="channel_id" label="Channel ID" width="140" />
        <el-table-column prop="state" label="State" width="140">
          <template #default="{ row }">
            <el-tag :type="stateTag(row.state)" effect="dark" size="small">{{ row.state }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="FPS" width="100">
          <template #default="{ row }">
            <span :style="{ color: (row.fps ?? 0) < 5 ? '#f56c6c' : '#67c23a' }">{{ (row.fps ?? 0).toFixed(1) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Latency (ms)" width="120">
          <template #default="{ row }">
            <span :style="{ color: (row.avg_latency_ms ?? 0) > 100 ? '#f56c6c' : '#606266' }">{{ (row.avg_latency_ms ?? 0).toFixed(1) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Frames" width="100">
          <template #default="{ row }">{{ row.frame_count ?? '--' }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- P2-3: Pipeline History Trend + 性能基线对比 -->
    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="metrics-history-header">
          <span>Pipeline Performance Trend</span>
          <div class="metrics-history-controls">
            <el-select v-model="selectedPipelineId" placeholder="Select Pipeline" size="small" style="width:280px" @change="fetchMetricsHistory">
              <el-option v-for="p in pipelineList" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <el-radio-group v-model="metricsRange" size="small" @change="fetchMetricsHistory">
              <el-radio-button label="1h">1h</el-radio-button>
              <el-radio-button label="24h">24h</el-radio-button>
              <el-radio-button label="7d">7d</el-radio-button>
            </el-radio-group>
            <!-- [P2-3] 性能基线对比 -->
            <el-button size="small" :type="baseline ? 'success' : 'info'" @click="saveBaseline" :disabled="!metricsData.length">
              {{ baseline ? '✓ 基线已保存' : '保存为基线' }}
            </el-button>
            <el-button v-if="baseline" size="small" @click="clearBaseline">清除基线</el-button>
          </div>
        </div>
      </template>
      <div ref="metricsChartEl" style="width:100%;height:360px" v-loading="metricsLoading"></div>
      <el-empty v-if="!metricsLoading && !selectedPipelineId" description="Select a pipeline to view trend" />
    </el-card>

    <!-- P1-10: Event Timeline -->
    <el-card shadow="never" class="mt-16" v-if="eventTimeline.length > 0">
      <template #header>Event Timeline (recent {{ eventTimeline.length }})</template>
      <el-timeline>
        <el-timeline-item
          v-for="(evt, idx) in eventTimeline"
          :key="idx"
          :timestamp="evt.time"
          :type="evt.severity === 'danger' ? 'danger' : evt.severity === 'warning' ? 'warning' : 'primary'"
          placement="top"
        >
          <span class="event-text">{{ evt.message }}</span>
        </el-timeline-item>
      </el-timeline>
    </el-card>

    <el-empty v-if="!loading && irmStats.active_channels === 0 && slmStats.total_streams === 0"
              description="No active pipelines. Deploy a pipeline to see runtime metrics." />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getIRMStats, getSLMStats, getPluginTypes, getPipelines,
         getPipelineMetricsHistory,
         type IRMStats, type SLMStats, type PluginTypeInfo } from '@/api/pipeline'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

const loading = ref(true)

const irmStats = ref<IRMStats>({
  active_channels: 0, queued_tasks: 0, worker_threads: 0,
  tpu_utilization: 0, avg_inference_ms: 0, avg_batch_size: 0,
  total_submitted: 0, total_completed: 0, total_skipped: 0,
  throughput_fps: 0,
})

const slmStats = ref<SLMStats>({
  total_streams: 0, active_streams: 0, degraded_streams: 0,
  disconnected_streams: 0, total_frames_dispatched: 0,
  total_reconnect_attempts: 0, streams: [],
})

const plugins = ref<PluginTypeInfo[]>([])
let refreshTimer: ReturnType<typeof setInterval> | null = null

// P2-3: Pipeline metrics history
const metricsChartEl = ref<HTMLElement>()
let metricsChart: echarts.ECharts | null = null
const metricsLoading = ref(false)
const metricsRange = ref('1h')
const selectedPipelineId = ref('')
const pipelineList = ref<{id: string; name: string}[]>([])

// [P2-3] 性能基线对比
const metricsData = ref<{fps: number; latency: number; tpu: number}[]>([])
interface BaselineData { avg_fps: number; avg_latency: number; avg_tpu: number; saved_at: string }
const baseline = ref<BaselineData | null>(null)

// P1-10: Event timeline
interface TimelineEvent { time: string; message: string; severity: 'danger' | 'warning' | 'primary' }
const eventTimeline = ref<TimelineEvent[]>([])
const MAX_EVENTS = 20
function addEvent(message: string, severity: 'danger' | 'warning' | 'primary') {
  eventTimeline.value.unshift({
    time: new Date().toLocaleString('zh-CN'),
    message, severity,
  })
  if (eventTimeline.value.length > MAX_EVENTS) eventTimeline.value.pop()
}

async function fetchStats() {
  try {
    const [irmRes, slmRes, pluginRes] = await Promise.allSettled([
      getIRMStats(), getSLMStats(), getPluginTypes(),
    ])
    if (irmRes.status === 'fulfilled') {
      const d = irmRes.value.data?.data
      if (d) {
        if (d.tpu_utilization > 85 && irmStats.value.tpu_utilization <= 85) {
          addEvent(`TPU > 85%: ${(d.tpu_utilization || 0).toFixed(0)}%`, 'danger')
        }
        if (d.avg_inference_ms > 35 && irmStats.value.avg_inference_ms <= 35) {
          addEvent(`Inference latency > 35ms: ${d.avg_inference_ms.toFixed(1)}ms`, 'warning')
        }
        Object.assign(irmStats.value, d)
      }
    }
    if (slmRes.status === 'fulfilled') {
      const d = slmRes.value.data?.data
      if (d) {
        const newDisc = d.disconnected_streams - slmStats.value.disconnected_streams
        if (newDisc > 0) addEvent(`${newDisc} stream(s) disconnected`, 'danger')
        const newDegr = d.degraded_streams - slmStats.value.degraded_streams
        if (newDegr > 0) addEvent(`${newDegr} stream(s) degraded`, 'warning')
        Object.assign(slmStats.value, d)
      }
    }
    if (pluginRes.status === 'fulfilled') {
      const d = pluginRes.value.data?.data
      if (d?.plugins) plugins.value = d.plugins
    }
  } catch { /* ignore */ }
  loading.value = false
}

async function fetchPipelineList() {
  try {
    const { data: resp } = await getPipelines()
    const list = (resp as any)?.data || resp
    if (Array.isArray(list)) {
      pipelineList.value = list.map((p: any) => ({ id: p.id || '', name: p.name || p.id || '' }))
    }
  } catch { /* ignore */ }
}

async function fetchMetricsHistory() {
  if (!selectedPipelineId.value) return
  metricsLoading.value = true
  try {
    const { data: resp } = await getPipelineMetricsHistory(selectedPipelineId.value, metricsRange.value)
    const d = (resp as any)?.data || resp
    if (!d || !d.timestamps || d.timestamps.length === 0) {
      metricsData.value = []
      renderEmptyChart()
      return
    }
    const xLabels = d.timestamps.map((ts: number) => {
      const dt = new Date(ts)
      return dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    })
    // 缓存最新数据供基线使用
    metricsData.value = d.fps.map((v: number, i: number) => ({ fps: v, latency: d.latency_ms[i], tpu: d.tpu_utilization[i] }))
    renderChart(xLabels, d.fps, d.latency_ms, d.tpu_utilization)
  } catch {
    metricsData.value = []
    renderEmptyChart()
  } finally {
    metricsLoading.value = false
  }
}

function renderChart(xLabels: string[], fps: number[], latency: number[], tpu: number[]) {
  if (!metricsChartEl.value) return
  if (!metricsChart) metricsChart = echarts.init(metricsChartEl.value)
  const tpuPct = tpu.map((v: number) => +(v).toFixed(1))

  // [P2-3] 基线对比 — 计算当前均值
  const curAvgFps = fps.reduce((a: number, b: number) => a + b, 0) / (fps.length || 1)
  const curAvgLat = latency.reduce((a: number, b: number) => a + b, 0) / (latency.length || 1)

  const series: any[] = [
    { name: 'FPS', type: 'line', data: fps, smooth: true, itemStyle: { color: '#1A73E8' }, areaStyle: { opacity: 0.1 } },
    { name: 'Latency(ms)', type: 'line', data: latency, smooth: true, itemStyle: { color: '#e6a23c' } },
    { name: 'TPU(%)', type: 'line', data: tpuPct, smooth: true, yAxisIndex: 1, itemStyle: { color: '#f56c6c' } },
  ]
  const legendData = ['FPS', 'Latency(ms)', 'TPU(%)']

  // 添加基线参考线
  if (baseline.value) {
    const bl = baseline.value
    const fpsDelta = curAvgFps - bl.avg_fps
    const latDelta = curAvgLat - bl.avg_latency
    series.push({
      name: `基线 FPS (${bl.avg_fps.toFixed(1)})  Δ=${fpsDelta >= 0 ? '+' : ''}${fpsDelta.toFixed(1)}`,
      type: 'line', data: fps.map(() => bl.avg_fps),
      lineStyle: { type: 'dashed', color: '#1A73E8', width: 1 },
      symbol: 'none',
    })
    series.push({
      name: `基线 Latency (${bl.avg_latency.toFixed(1)})  Δ=${latDelta >= 0 ? '+' : ''}${latDelta.toFixed(1)}`,
      type: 'line', data: latency.map(() => bl.avg_latency),
      lineStyle: { type: 'dashed', color: '#e6a23c', width: 1 },
      symbol: 'none',
    })
    legendData.push(`基线 FPS (${bl.avg_fps.toFixed(1)})  Δ=${fpsDelta >= 0 ? '+' : ''}${fpsDelta.toFixed(1)}`)
    legendData.push(`基线 Latency (${bl.avg_latency.toFixed(1)})  Δ=${latDelta >= 0 ? '+' : ''}${latDelta.toFixed(1)}`)
  }

  metricsChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: legendData, top: 5, textStyle: { fontSize: 10 } },
    grid: { left: 60, right: 60, bottom: 60, top: 60 },
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    xAxis: { type: 'category', data: xLabels, axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: 'value', name: 'FPS / ms', position: 'left' },
      { type: 'value', name: 'TPU(%)', position: 'right', max: 100 },
    ],
    series,
  })
}

function renderEmptyChart() {
  if (!metricsChartEl.value) return
  if (!metricsChart) metricsChart = echarts.init(metricsChartEl.value)
  metricsChart.setOption({
    title: { text: 'No data', left: 'center', top: 'center', textStyle: { color: '#909399', fontSize: 14 } },
    xAxis: { type: 'category', data: [] },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: [] }],
  })
}

onMounted(async () => {
  loadBaseline()  // [P2-3] 恢复基线
  await fetchStats()
  refreshTimer = setInterval(fetchStats, 10000)
  await fetchPipelineList()
  if (pipelineList.value.length > 0) {
    selectedPipelineId.value = pipelineList.value[0].id
    await fetchMetricsHistory()
  }
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  window.removeEventListener('resize', handleResize)
  if (metricsChart) { metricsChart.dispose(); metricsChart = null }
})

function handleResize() { metricsChart?.resize() }

// [P2-3] 性能基线对比 — 保存/加载/清除
function saveBaseline() {
  if (!metricsData.value.length) return
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
  const bl: BaselineData = {
    avg_fps: avg(metricsData.value.map(d => d.fps)),
    avg_latency: avg(metricsData.value.map(d => d.latency)),
    avg_tpu: avg(metricsData.value.map(d => d.tpu)),
    saved_at: new Date().toISOString(),
  }
  baseline.value = bl
  try { localStorage.setItem('fl_pipeline_baseline', JSON.stringify(bl)) } catch {}
  // 重绘图表显示基线
  fetchMetricsHistory()
}
function clearBaseline() {
  baseline.value = null
  try { localStorage.removeItem('fl_pipeline_baseline') } catch {}
  fetchMetricsHistory()
}
function loadBaseline() {
  try {
    const s = localStorage.getItem('fl_pipeline_baseline')
    if (s) baseline.value = JSON.parse(s)
  } catch {}
}

const tpuClass = computed(() => {
  const pct = irmStats.value.tpu_utilization || 0
  if (pct > 85) return 'latency-danger'
  if (pct > 60) return 'latency-warn'
  return 'latency-ok'
})

function latencyClass(ms: number): string {
  if (ms > 35) return 'latency-danger'
  if (ms > 20) return 'latency-warn'
  return 'latency-ok'
}

function stateTag(state: string): 'success' | 'warning' | 'danger' | 'info' {
  if (state === 'STREAMING') return 'success'
  if (state === 'DEGRADED' || state === 'RECONNECTING' || state === 'CONNECTING') return 'warning'
  if (state === 'DISCONNECTED' || state === 'ERROR') return 'danger'
  return 'info'
}
</script>

<style scoped>
.pipeline-health { padding: 20px; }
.mt-16 { margin-top: 16px; }
.latency-ok { color: #67c23a; font-weight: 600; }
.latency-warn { color: #e6a23c; font-weight: 600; }
.latency-danger { color: #f56c6c; font-weight: 600; }
.text-warning { color: #e6a23c; }
.plugin-tag { margin: 2px 4px; }
.metrics-history-header { display: flex; justify-content: space-between; align-items: center; }
.metrics-history-controls { display: flex; gap: 12px; align-items: center; }
.event-text { font-size: 13px; color: #303133; }
</style>
