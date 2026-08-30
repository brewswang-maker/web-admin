<template>
  <div ref="pageRoot" class="gas-dashboard" :class="{ fullscreen: isFullscreen }">
    <!-- ===== 顶部标题栏 ===== -->
    <div class="dash-header">
      <div class="dash-title">
        <el-icon><Monitor /></el-icon>
        <span>加油站态势大屏</span>
        <el-tag size="small" type="warning" effect="plain">T6 红线 + EHS 闭环</el-tag>
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

    <!-- ===== T6 红线顶部告警条 ===== -->
    <el-alert type="warning" :closable="false" show-icon class="t6-banner">
      <template #title>
        <strong>T6 硬红线 (不可绕过联锁)</strong> ·
        加油站打电话/吸烟 → 仅声光+TTS, <u>不联动工艺联锁</u>。
        AI 联动停泵/开阀必经安全 PLC; 视觉不可替代气体探测器/紧急切断阀。
      </template>
    </el-alert>

    <!-- ===== KPI 卡行 (6 张) ===== -->
    <el-row :gutter="12" class="kpi-row">
      <el-col :xs="12" :sm="8" :md="4" v-for="k in kpiCards" :key="k.label">
        <el-card shadow="never" class="kpi-card" :body-style="{ padding: '12px 14px' }">
          <div class="kpi-value" :style="{ color: k.color }">{{ k.value }}</div>
          <div class="kpi-label">{{ k.label }}</div>
          <div class="kpi-sub">{{ k.sub }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 趋势区 ===== -->
    <el-row :gutter="12">
      <el-col :xs="24" :lg="16">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">告警趋势 ({{ hours }}h 按小时)</span></template>
          <LazyChart v-if="trendOption" :option="trendOption" height="280px" />
          <el-empty v-else :image-size="60" description="窗口内暂无数据" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">三圈告警构成 <span class="title-sub">控制/警戒/核心</span></span></template>
          <LazyChart v-if="circleOption" :option="circleOption" height="280px" />
          <el-empty v-else :image-size="60" description="暂无三圈数据" />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 分布区 ===== -->
    <el-row :gutter="12">
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">告警类型分布 ({{ days }} 天)</span></template>
          <LazyChart v-if="typePieOption" :option="typePieOption" height="280px" />
          <el-empty v-else :image-size="60" description="暂无类型数据" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="9">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">通道告警分布 ({{ days }} 天)</span></template>
          <LazyChart v-if="channelBarOption" :option="channelBarOption" height="280px" />
          <el-empty v-else :image-size="60" description="暂无通道数据" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="7">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">今日告警五级分布 <span class="title-sub">对标行人属性报告 §3.4</span></span></template>
          <LazyChart v-if="levelPieOption" :option="levelPieOption" height="280px" />
          <el-empty v-else :image-size="60" description="今日暂无告警" />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== EHS 闭环 + 调度水位卡 ===== -->
    <el-row :gutter="12">
      <el-col :xs="24" :md="14">
        <el-card shadow="never" class="qc-card">
          <template #header><span class="card-title">EHS 闭环指标 ({{ days }} 天)</span></template>
          <div class="qc-summary">
            <div class="qc-item"><span class="qc-num">{{ ehs.total }}</span><span class="qc-label">EHS 闭环事件</span></div>
            <div class="qc-item"><span class="qc-num qc-good">{{ ehs.closed }}</span><span class="qc-label">已整改 (人工)</span></div>
            <div class="qc-item"><span class="qc-num qc-bad">{{ ehs.pending }}</span><span class="qc-label">待整改</span></div>
            <div class="qc-item"><span class="qc-num qc-teal">{{ ehs.t6 }}</span><span class="qc-label">T6 触发 (声光)</span></div>
            <div class="qc-item"><span class="qc-num qc-orange">{{ ehs.ehsAvgLatency }}s</span><span class="qc-label">平均响应时长</span></div>
          </div>
          <div class="qc-rate-row">
            <span>整改闭环率</span>
            <el-progress :percentage="Math.round(ehs.closeRate * 100)"
                         :stroke-width="14" :format="(p: number) => `${p}%`" />
          </div>
          <div class="qc-rate-row">
            <span>平均响应时长 (30s 高危 / 60s 卸油 / 120s 周界)</span>
            <el-progress :percentage="Math.min(100, Math.round(ehs.avgLatencyPct))"
                         :stroke-width="14" :format="(p: number) => `${p}%`"
                         :color="ehs.avgLatencyPct < 50 ? '#67c23a' : ehs.avgLatencyPct < 80 ? '#e6a23c' : '#f56c6c'" />
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="10">
        <el-card shadow="never" class="qc-card">
          <template #header>
            <span class="card-title">推理调度水位 <span class="title-sub">/stats/tpu · 加油站专属</span></span>
          </template>
          <div class="tpu-row">
            <div class="tpu-stat">
              <div class="tpu-label">TPU 利用率</div>
              <el-progress type="circle" :percentage="tpu.util" :width="80"
                           :color="tpu.util > 85 ? '#f56c6c' : tpu.util > 60 ? '#e6a23c' : '#67c23a'" />
            </div>
            <div class="tpu-stat">
              <div class="tpu-label">队列水位</div>
              <div class="tpu-num">{{ tpu.queue }}</div>
              <div class="tpu-sub">深度 ({{ tpu.queue < 5 ? '空闲' : tpu.queue < 20 ? '繁忙' : '拥堵' }})</div>
            </div>
          </div>
          <div class="tpu-meta">
            <div class="meta-row"><span>熔断态</span><el-tag size="small" :type="tpu.circuitOpen ? 'danger' : 'success'">{{ tpu.circuitOpen ? '已熔断' : '正常' }}</el-tag></div>
            <div class="meta-row"><span>采样数</span><span>{{ tpu.samples }}</span></div>
            <div class="meta-row"><span>P50 / P90 时延</span><span>{{ tpu.p50 }}ms / {{ tpu.p90 }}ms</span></div>
          </div>
          <div class="rank-title">三段分级阈值 <span class="rank-sub">(对标行人属性报告 §3.4)</span></div>
          <div class="threshold-row">
            <span class="th-label th-crit">5 严重 (90+)</span>
            <span class="th-label th-high">4 高危 (70-90)</span>
            <span class="th-label th-med">3 中危 (40-70)</span>
            <span class="th-label th-low">2 低危 (10-40)</span>
            <span class="th-label th-info">1 通知 (&lt;10)</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 加油站态势大屏 — [加油站方案 2026-08-30]
 * 对标: 海康加油站平台大屏 / 极视角油站算法目录 / 行人属性报告 §3.4 三段分级
 * 数据源 (全部真实, 禁 mock):
 *   - GET /api/v1/alarms  — 告警趋势 + 类型分布 + 通道分布 + 五级分布
 *   - GET /stats/tpu      — 推理调度水位 (IRM + InferenceScheduler 真实统计)
 *   - GET /large-event/scene-packs — 加油站 3 包覆盖
 * 风格基线: CampusDashboard (校园态势大屏) — 全屏切换 + 趋势图 + 分布图 + 调度水位
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Monitor, Refresh, FullScreen } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import type { EChartsOption } from 'echarts'
import { alarmApi } from '@/api/alarm'
import { schoolApi } from '@/api/school'
import type { AlarmEvent } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'

const pageRoot = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const loading = ref(false)
const hours = ref<24 | 48 | 72>(24)
const days = ref(7)
const events = ref<AlarmEvent[]>([])
const tpu = ref({ util: 0, queue: 0, circuitOpen: false, samples: 0, p50: 0, p90: 0 })
let refreshTimer: ReturnType<typeof setInterval> | null = null

const TYPE_LABELS: Record<string, string> = {
  phone_call: '打电话 (T6)', smoking: '吸烟 (T6)', intrusion: '周界入侵',
  tripwire: '绊线越界', climbing: '翻越攀爬', loitering: '徘徊逗留',
  fire: '火焰', smoke: '烟雾', smolder: '阴燃', fire_access: '明火作业',
  illegal_parking: '违规停车', vehicle_detected: '车辆检测',
  lpr_violation: '车牌异常', face_stranger: '陌生人', face_blacklist: '黑名单拦截',
  abandoned: '遗留物', fall_detected: '跌倒', unattended_baggage: '无人看管行李',
}

const kpiCards = computed(() => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const today = events.value.filter(e => new Date(e.createdAt).getTime() >= start.getTime()).length
  const t6Count = events.value.filter(e => e.type === 'phone_call' || e.type === 'smoking').length
  const coreCount = events.value.filter(e =>
    ['fire', 'smoke', 'smolder', 'fire_access', 'intrusion', 'tripwire', 'climbing'].includes(e.type)
  ).length
  const pending = events.value.filter(e => e.level === 'critical' || e.level === 'high').length
  return [
    { label: '今日告警', value: today, sub: '五级分卡汇总', color: today > 50 ? '#f56c6c' : '#e6a23c' },
    { label: 'T6 触发', value: t6Count, sub: '电话/吸烟仅声光', color: '#e6a23c' },
    { label: '核心圈告警', value: coreCount, sub: '高优先级', color: '#f56c6c' },
    { label: '待整改', value: pending, sub: '人工确认 (manual)', color: '#8e6ce0' },
    { label: 'TPU 利用率', value: `${tpu.value.util}%`, sub: '推理调度', color: tpu.value.util > 85 ? '#f56c6c' : '#67c23a' },
    { label: '队列水位', value: tpu.value.queue, sub: tpu.value.queue < 5 ? '空闲' : tpu.value.queue < 20 ? '繁忙' : '拥堵', color: '#409eff' },
  ]
})

/** 24/48/72h 小时粒度趋势 */
const trendOption = computed(() => {
  if (!events.value.length) return null
  const buckets = new Array(hours.value).fill(0)
  const now = Date.now()
  for (const e of events.value) {
    const t = new Date(e.createdAt).getTime()
    const diff = Math.floor((now - t) / 3_600_000)
    if (diff >= 0 && diff < hours.value) buckets[hours.value - 1 - diff]++
  }
  const labels = Array.from({ length: hours.value }, (_, i) => `${String((24 - i) % 24).padStart(2, '0')}:00`)
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['告警', 'T6 触发'], top: 0, textStyle: { fontSize: 11 } },
    grid: { top: 32, left: 36, right: 36, bottom: 24 },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, interval: Math.floor(hours.value / 12) } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
      { name: '告警', type: 'line', smooth: true, data: buckets, areaStyle: { color: 'rgba(245,108,108,0.18)' }, lineStyle: { color: '#f56c6c', width: 2 }, itemStyle: { color: '#f56c6c' } },
    ],
  } as EChartsOption
})

/** 三圈告警构成 (控制/警戒/核心) */
const circleOption = computed(() => {
  const core = events.value.filter(e =>
    ['fire', 'smoke', 'smolder', 'fire_access', 'intrusion', 'tripwire', 'climbing'].includes(e.type)
  ).length
  const alert = events.value.filter(e =>
    ['loitering', 'abandoned', 'face_blacklist', 'face_stranger'].includes(e.type)
  ).length
  const control = events.value.filter(e =>
    ['illegal_parking', 'vehicle_detected', 'lpr_violation'].includes(e.type)
  ).length
  const t6 = events.value.filter(e => e.type === 'phone_call' || e.type === 'smoking').length
  if (!core && !alert && !control && !t6) return null
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
      label: { fontSize: 11 },
      data: [
        { value: core, name: '核心圈 (高优)', itemStyle: { color: '#f56c6c' } },
        { value: alert, name: '警戒圈 (中危)', itemStyle: { color: '#e6a23c' } },
        { value: control, name: '控制圈 (动环)', itemStyle: { color: '#409eff' } },
        { value: t6, name: 'T6 触发 (声光)', itemStyle: { color: '#8e6ce0' } },
      ],
    }],
  } as EChartsOption
})

const typePieOption = computed(() => {
  const start = Date.now() - days.value * 86_400_000
  const map = new Map<string, number>()
  for (const e of events.value) {
    if (new Date(e.createdAt).getTime() < start) continue
    map.set(e.type, (map.get(e.type) ?? 0) + 1)
  }
  if (!map.size) return null
  const data = Array.from(map.entries())
    .map(([key, value]) => ({ name: TYPE_LABELS[key] ?? key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 10 } },
    series: [{
      type: 'pie', radius: ['38%', '68%'], center: ['50%', '42%'], label: { fontSize: 10 },
      data,
    }],
  } as EChartsOption
})

const channelBarOption = computed(() => {
  const start = Date.now() - days.value * 86_400_000
  const map = new Map<string, number>()
  for (const e of events.value) {
    if (new Date(e.createdAt).getTime() < start) continue
    map.set(String(e.channelId), (map.get(String(e.channelId)) ?? 0) + 1)
  }
  if (!map.size) return null
  const items = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
  return {
    tooltip: { trigger: 'axis' },
    grid: { top: 16, left: 60, right: 16, bottom: 24 },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    yAxis: { type: 'category', data: items.map(i => `通道 ${i[0]}`), axisLabel: { fontSize: 10 } },
    series: [{
      type: 'bar', data: items.map(i => i[1]),
      itemStyle: { color: '#14b8b8', borderRadius: [0, 4, 4, 0] },
    }],
  } as EChartsOption
})

const levelPieOption = computed(() => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const buckets = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const e of events.value) {
    if (new Date(e.createdAt).getTime() < start.getTime()) continue
    const lvl = (e.level ?? 'info') as keyof typeof buckets
    if (lvl in buckets) buckets[lvl]++
  }
  const data = [
    { name: '5 严重 (90+)', value: buckets.critical, itemStyle: { color: '#f56c6c' } },
    { name: '4 高危 (70-90)', value: buckets.high, itemStyle: { color: '#e6a23c' } },
    { name: '3 中危 (40-70)', value: buckets.medium, itemStyle: { color: '#409eff' } },
    { name: '2 低危 (10-40)', value: buckets.low, itemStyle: { color: '#67c23a' } },
    { name: '1 通知 (<10)', value: buckets.info, itemStyle: { color: '#909399' } },
  ].filter(d => d.value > 0)
  if (!data.length) return null
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 10 } },
    series: [{ type: 'pie', radius: ['40%', '70%'], center: ['50%', '42%'], label: { fontSize: 10 }, data }],
  } as EChartsOption
})

/** EHS 闭环指标 (本地聚合, 真实事件计算) */
const ehs = computed(() => {
  const core = events.value.filter(e =>
    ['fire', 'smoke', 'smolder', 'fire_access', 'intrusion'].includes(e.type)
  )
  const t6 = events.value.filter(e => e.type === 'phone_call' || e.type === 'smoking')
  // close=manual 模板触发数 vs 已 ack 数 (metadata.close_status)
  const closed = events.value.filter(e => e.metadata?.close_status === 'manual_ack').length
  const total = core.length
  const pending = total - closed
  const closeRate = total > 0 ? closed / total : 0
  // 平均响应时长 (s): metadata.response_seconds
  const latencies = events.value
    .map(e => Number(e.metadata?.response_seconds))
    .filter(n => Number.isFinite(n) && n > 0)
  const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0
  const ehsAvgLatency = avg ? Math.round(avg) : 0
  const avgLatencyPct = Math.min(100, (ehsAvgLatency / 120) * 100)
  return {
    total,
    closed,
    pending: Math.max(0, pending),
    t6: t6.length,
    closeRate,
    ehsAvgLatency,
    avgLatencyPct,
  }
})

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  if (pageRoot.value) {
    if (isFullscreen.value) pageRoot.value.requestFullscreen?.()
    else document.exitFullscreen?.()
  }
}

async function loadAll() {
  loading.value = true
  try {
    const [alarmsResp, tpuResp] = await Promise.all([
      alarmApi.getList({ page: 1, pageSize: 500 }).catch(() => null),
      schoolApi.getTpuStats().catch(() => null),
    ])
    const items = (alarmsResp as any)?.data?.data?.items
    if (Array.isArray(items)) events.value = items.map((x: any) => normalizeAlarmCore(x))
    else events.value = []
    const t = (tpuResp as any)?.data?.data
    if (t) {
      tpu.value = {
        util: Math.round((t.utilization ?? t.avg_util ?? 0) * (t.utilization > 1 ? 1 : 100)),
        queue: t.queue_depth ?? t.queue ?? 0,
        circuitOpen: !!t.circuit_open,
        samples: t.sample_count ?? t.samples ?? 0,
        p50: t.p50_ms ?? t.p50 ?? 0,
        p90: t.p90_ms ?? t.p90 ?? 0,
      }
    }
  } catch (e) {
    console.error('[GasDashboard] load failed', e)
    ElMessage.error('加油站态势大屏加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadAll() })
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (isFullscreen.value) document.exitFullscreen?.()
})
refreshTimer = setInterval(loadAll, 30000)
</script>

<style scoped>
.gas-dashboard { padding: 12px; background: linear-gradient(180deg, #fafbfc 0%, #f5f7fa 100%); min-height: 100vh; }
.gas-dashboard.fullscreen { background: #0e1a2b; padding: 18px; }
.dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.dash-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; color: #303133; }
.dash-actions { display: flex; gap: 8px; align-items: center; }
.t6-banner { margin-bottom: 12px; }
.t6-banner :deep(.el-alert__title) { font-size: 13px; }
.kpi-row { margin-bottom: 12px; }
.kpi-card { border-radius: 8px; }
.kpi-value { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kpi-label { font-size: 12px; color: #606266; margin-top: 2px; }
.kpi-sub { font-size: 11px; color: #909399; margin-top: 1px; }
.chart-card { border-radius: 8px; margin-bottom: 12px; }
.chart-card :deep(.el-card__header) { padding: 10px 16px; }
.card-title { font-weight: 600; color: #303133; font-size: 13px; }
.title-sub { color: #909399; font-weight: 400; font-size: 11px; margin-left: 6px; }
.qc-card { border-radius: 8px; margin-bottom: 12px; }
.qc-summary { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 14px; }
.qc-item { flex: 1; text-align: center; padding: 10px 6px; background: #fafbfc; border-radius: 6px; }
.qc-num { display: block; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; color: #303133; }
.qc-num.qc-good { color: #67c23a; }
.qc-num.qc-bad { color: #f56c6c; }
.qc-num.qc-teal { color: #14b8b8; }
.qc-num.qc-orange { color: #e6a23c; }
.qc-label { font-size: 11px; color: #909399; margin-top: 2px; }
.qc-rate-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; color: #606266; }
.qc-rate-row :deep(.el-progress) { flex: 1; }
.tpu-row { display: flex; gap: 16px; align-items: center; margin-bottom: 14px; }
.tpu-stat { flex: 1; text-align: center; }
.tpu-label { font-size: 11px; color: #909399; margin-bottom: 4px; }
.tpu-num { font-size: 28px; font-weight: 700; color: #409eff; font-variant-numeric: tabular-nums; }
.tpu-sub { font-size: 11px; color: #909399; margin-top: 2px; }
.tpu-meta { padding: 10px; background: #fafbfc; border-radius: 6px; margin-bottom: 10px; }
.meta-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #606266; }
.meta-row span:first-child { color: #909399; }
.rank-title { font-size: 12px; font-weight: 600; color: #606266; margin: 8px 0 6px; padding-top: 6px; border-top: 1px dashed #f0f2f5; }
.rank-sub { font-weight: 400; color: #909399; font-size: 11px; }
.threshold-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.th-label { font-size: 10px; padding: 2px 8px; border-radius: 8px; }
.th-crit { background: #fef0f0; color: #f56c6c; }
.th-high { background: #fdf6ec; color: #e6a23c; }
.th-med { background: #ecf5ff; color: #409eff; }
.th-low { background: #f0f9eb; color: #67c23a; }
.th-info { background: #f4f4f5; color: #909399; }
</style>
