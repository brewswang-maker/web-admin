<template>
  <div ref="pageRoot" class="campus-dashboard" :class="{ fullscreen: isFullscreen }">
    <!-- ===== 顶部标题栏 ===== -->
    <div class="dash-header">
      <div class="dash-title">
        <el-icon><Monitor /></el-icon>
        <span>校园态势大屏</span>
        <el-tag size="small" effect="plain">对标 ZT-AJPT / 南昌轨交智慧安检大屏</el-tag>
      </div>
      <div class="dash-actions">
        <el-radio-group v-model="hours" size="small" @change="loadAll">
          <el-radio-button :label="24">24h</el-radio-button>
          <el-radio-button :label="48">48h</el-radio-button>
          <el-radio-button :label="72">72h</el-radio-button>
        </el-radio-group>
        <el-button size="small" :icon="Refresh" :loading="loading" @click="loadAll">刷新</el-button>
        <el-button size="small" :icon="FullScreen" @click="toggleFullscreen">全 屏</el-button>
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
          <LazyChart v-if="trendOption" :option="trendOption" height="300px" />
          <el-empty v-else :image-size="60" description="窗口内暂无数据" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">重点安全事件趋势</span></template>
          <LazyChart v-if="keyTrendOption" :option="keyTrendOption" height="300px" />
          <el-empty v-else :image-size="60" description="窗口内暂无重点事件" />
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
          <template #header><span class="card-title">今日告警五级分布 <span class="title-sub">对标海康</span></span></template>
          <LazyChart v-if="levelPieOption" :option="levelPieOption" height="280px" />
          <el-empty v-else :image-size="60" description="今日暂无告警" />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 质控 + 出入口 ===== -->
    <el-row :gutter="12">
      <el-col :xs="24" :md="14">
        <el-card shadow="never" class="qc-card">
          <template #header><span class="card-title">复核质控汇总 ({{ days }} 天)</span></template>
          <div class="qc-summary" v-if="data">
            <div class="qc-item"><span class="qc-num">{{ data.feedback.total_feedback }}</span><span class="qc-label">已复核</span></div>
            <div class="qc-item"><span class="qc-num qc-good">{{ data.feedback.true_positives }}</span><span class="qc-label">真实告警</span></div>
            <div class="qc-item"><span class="qc-num qc-bad">{{ data.feedback.false_positives }}</span><span class="qc-label">误报</span></div>
            <div class="qc-item"><span class="qc-num">{{ data.feedback.unsure }}</span><span class="qc-label">存疑</span></div>
            <div class="qc-item"><span class="qc-num qc-teal">{{ data.action_latency?.sample_count ?? 0 }}</span><span class="qc-label">联动样本</span></div>
          </div>
          <div class="qc-rate-row" v-if="data">
            <span>标注误报率</span>
            <el-progress :percentage="Math.round((data.feedback.annotated_false_rate || 0) * 100)"
                         :stroke-width="14" :format="(p: number) => `${p}%`" />
          </div>
          <div class="qc-rate-row" v-if="data">
            <span>复核覆盖率</span>
            <el-progress :percentage="Math.round((data.kpi.review_rate || 0) * 100)" status="success"
                         :stroke-width="14" :format="(p: number) => `${p}%`" />
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="10">
        <el-card shadow="never" class="qc-card">
          <template #header><span class="card-title">今日出入口通行排行</span></template>
          <template v-if="passageChannels.length">
            <div v-for="c in passageChannels" :key="c.channel" class="rank-row">
              <div class="rank-head">
                <span class="rank-name">{{ c.channel.replace(/^ch_/, '') }}</span>
                <span class="rank-meta"><strong>{{ c.cnt }}</strong> 人次</span>
              </div>
              <div class="rank-bar-wrap">
                <div class="rank-bar" :style="{ width: c.pct + '%' }" />
              </div>
            </div>
          </template>
          <el-empty v-else :image-size="48" description="今日暂无通行数据" />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== [校园二期] 调度水位 (GET /stats/tpu 真实 IRM/Scheduler 统计) ===== -->
    <el-row :gutter="12">
      <el-col :span="24">
        <el-card shadow="never" class="qc-card">
          <template #header>
            <span class="card-title">推理调度水位
              <span class="title-sub">TPU 利用 / 队列深度 / 并发熔断态</span>
              <el-tag v-if="schedState" :type="schedState.type" size="small" class="sched-tag">
                {{ schedState.text }}
              </el-tag>
            </span>
          </template>
          <template v-if="hasTpu">
            <el-row :gutter="24">
              <el-col :xs="24" :md="10">
                <div class="qc-rate-row">
                  <span>TPU 利用率</span>
                  <el-progress :percentage="tpuPct" :stroke-width="14"
                               :status="tpuPct >= 90 ? 'exception' : (tpuPct >= 70 ? 'warning' : 'success')"
                               :format="(p: number) => `${p}%`" />
                </div>
                <div class="qc-rate-row">
                  <span>队列水位</span>
                  <el-progress :percentage="queuePct" :stroke-width="14"
                               :status="queuePct >= 80 ? 'exception' : (queuePct >= 60 ? 'warning' : 'success')"
                               :format="() => `${tpu?.irm.queued_tasks ?? 0} / ${tpu?.irm.config?.max_queue_depth ?? '—'}`" />
                </div>
                <div class="sched-note">队列水位 ≥80% 视为熔断风险 (IRM 丢帧保护触发阈值)</div>
              </el-col>
              <el-col :xs="24" :md="14">
                <div class="sched-tiles">
                  <div class="sched-tile" v-for="m in schedTiles" :key="m.label">
                    <span class="sched-num">{{ m.value }}</span>
                    <span class="sched-label">{{ m.label }}</span>
                  </div>
                </div>
              </el-col>
            </el-row>
          </template>
          <el-empty v-else :image-size="48" description="调度统计不可用 (设备离线或固件版本较旧)" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 校园态势大屏 — [校园方案 2026-08-30]
 * 对标: ZT-AJPT (过检三件套/判图状态) + 南昌轨交 (小时级态势曲线) + 海康五级告警
 * 数据源: GET /stats/campus_dashboard 全真实聚合 (禁 mock)
 * 范式基线: ScreeningDashboard (安检运行大屏) — hours 切换/全屏/三趋势/双分布/质控区
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Refresh, FullScreen, Monitor } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import type { EChartsOption } from 'echarts'
import { schoolApi, type CampusDashboard, type TpuStats } from '@/api/school'

const pageRoot = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const loading = ref(false)
const hours = ref(24)
const days = ref(7)
const data = ref<CampusDashboard | null>(null)
const tpu = ref<TpuStats | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null
// [校园二期增强 2026-08-30] 水位快刷新: 调度水位是准实时指标, 独立 10s 轻量拉取
//   (不重拉态势聚合; 失败保留旧值, 由水位卡降级空态兼容)
let tpuTimer: ReturnType<typeof setInterval> | null = null

const TYPE_NAMES: Record<string, string> = {
  phone_call: '接打电话', loitering: '徘徊逗留', unattended_baggage: '遗留物', face_stranger: '陌生人',
  face_blacklist: '黑名单', intrusion: '周界入侵', face_pass_vip: 'VIP通行', tripwire: '越界',
  face_pass_whitelist: '白名单通行', abandoned: '遗弃物', face_pass_visitor: '访客通行',
  fall_detected: '跌倒', tailgate: '尾随', gathering: '聚集', climbing: '攀爬', smoking: '吸烟',
  running: '奔跑', fighting: '打架', field_intrusion: '冲场', object_removal: '物品移走',
  face_verify_fail: '识别失败', face_tailgate: '人脸尾随', person_with_backpack: '携包通行',
  person_detected: '人员检测', face_pass_staff: '员工通行', face_pass_custom: '自定义名单通行',
  fire_smoke: '烟火', mask_violation: '未戴口罩', fight: '打架',
}
const LEVEL_NAMES: Record<number, string> = { 5: '严重', 4: '高危', 3: '中危', 2: '低危', 1: '通知' }
const LEVEL_COLORS: Record<number, string> = {
  5: '#f56c6c', 4: '#e6a23c', 3: '#409eff', 2: '#67c23a', 1: '#909399',
}

const kpiCards = computed(() => {
  const d = data.value
  return [
    { label: '今日通行', value: String(d?.kpi.today_passages ?? 0), color: '#409eff' },
    { label: '今日告警', value: String(d?.kpi.today_alarms ?? 0), color: '#f56c6c' },
    { label: '待处理', value: String(d?.kpi.pending_review ?? 0), color: '#e6a23c' },
    { label: '标注误报率', value: d?.feedback.total_feedback ? `${((d.feedback.annotated_false_rate || 0) * 100).toFixed(1)}%` : '—', color: '#8e6ce0' },
    { label: '联动时延 p50', value: d?.action_latency?.sample_count ? `${d.action_latency.p50_ms.toFixed(1)}ms` : '—', color: '#14b8b8' },
    { label: '事件总量', value: String(d?.kpi.total_events ?? 0), color: '#303133' },
  ]
})

function hourLabels(buckets: { hr: number }[]): string[] {
  return [...buckets].sort((a, b) => a.hr - b.hr).map(b => {
    const dt = new Date(b.hr * 3600000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:00`
  })
}

const trendOption = computed(() => {
  const d = data.value
  if (!d) return null
  const alarmB = [...(d.alarm_trend || [])].sort((a, b) => a.hr - b.hr).slice(-hours.value)
  const passB = [...(d.passage_trend || [])].sort((a, b) => a.hr - b.hr).slice(-hours.value)
  if (!alarmB.length && !passB.length) return null
  const hrs = Array.from(new Set([...alarmB.map(b => b.hr), ...passB.map(b => b.hr)])).sort((a, b) => a - b)
  const alarmMap = new Map(alarmB.map(b => [b.hr, b.cnt]))
  const passMap = new Map(passB.map(b => [b.hr, b.cnt]))
  void hourLabels
  const labels = hrs.map(h => {
    const dt = new Date(h * 3600000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:00`
  })
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['通行', '告警'], top: 0, right: 8, textStyle: { color: '#606266', fontSize: 12 } },
    grid: { left: 44, right: 16, top: 30, bottom: 24 },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#909399', fontSize: 11 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f2f5' } }, axisLabel: { color: '#909399', fontSize: 11 } },
    series: [
      { name: '通行', type: 'bar', barMaxWidth: 14, data: hrs.map(h => passMap.get(h) ?? 0),
        itemStyle: { color: '#409eff', borderRadius: [3, 3, 0, 0] } },
      { name: '告警', type: 'bar', barMaxWidth: 14, data: hrs.map(h => alarmMap.get(h) ?? 0),
        itemStyle: { color: '#f56c6c', borderRadius: [3, 3, 0, 0] } },
    ],
  } as EChartsOption
})

const keyTrendOption = computed(() => {
  const list = [...(data.value?.key_trend || [])].sort((a, b) => a.hr - b.hr).slice(-hours.value)
  if (!list.length) return null
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 14, top: 20, bottom: 24 },
    xAxis: { type: 'category', data: hourLabels(list), axisLabel: { color: '#909399', fontSize: 11 } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f0f2f5' } }, axisLabel: { color: '#909399', fontSize: 11 } },
    series: [{
      name: '重点事件', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
      data: list.map(b => b.cnt), lineStyle: { color: '#e6a23c', width: 2 },
      itemStyle: { color: '#e6a23c' }, areaStyle: { color: 'rgba(230,162,60,0.15)' },
    }],
  } as EChartsOption
})

const typePieOption = computed(() => {
  const list = [...(data.value?.by_type || [])].sort((a, b) => b.total - a.total).slice(0, 8)
  if (!list.length) return null
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { type: 'scroll', orient: 'vertical', right: 4, top: 'middle', textStyle: { color: '#606266', fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['42%', '68%'], center: ['38%', '50%'],
      data: list.map(t => ({ name: TYPE_NAMES[t.key] || t.key, value: t.total })),
      label: { show: false }, emphasis: { label: { show: true, formatter: '{b}\n{c}' } },
    }],
  } as EChartsOption
})

const channelBarOption = computed(() => {
  const list = [...(data.value?.by_channel || [])].sort((a, b) => b.total - a.total).slice(0, 6)
  if (!list.length) return null
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 70, right: 20, top: 10, bottom: 24 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f2f5' } }, axisLabel: { color: '#909399', fontSize: 11 } },
    yAxis: { type: 'category', data: list.map(c => c.key.replace(/^ch_/, '')), axisLabel: { color: '#606266', fontSize: 11 } },
    series: [{
      type: 'bar', barMaxWidth: 16, data: list.map(c => c.total),
      itemStyle: { color: '#409eff', borderRadius: [0, 4, 4, 0] },
    }],
  } as EChartsOption
})

const levelPieOption = computed(() => {
  const list = [...(data.value?.by_level || [])]
  if (!list.length) return null
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie', radius: ['40%', '66%'], center: ['50%', '52%'],
      data: list.map(l => ({
        name: LEVEL_NAMES[l.level] || `L${l.level}`,
        value: l.cnt,
        itemStyle: { color: LEVEL_COLORS[l.level] || '#909399' },
      })),
      label: { color: '#606266', fontSize: 11, formatter: '{b} {c}' },
    }],
  } as EChartsOption
})

const passageChannels = computed(() => {
  const list = [...(data.value?.passage_by_channel || [])]
  const max = Math.max(...list.map(c => c.cnt), 1)
  return list.map(c => ({ ...c, pct: Math.round(c.cnt / max * 100) }))
})

// ─── [校园二期 2026-08-30] 调度水位 (GET /stats/tpu, 失败降级空态) ───
const hasTpu = computed(() => tpu.value?.irm?.tpu_utilization_pct != null)
const tpuPct = computed(() => Math.min(100, Math.round(tpu.value?.irm?.tpu_utilization_pct ?? 0)))
const queuePct = computed(() => {
  const q = tpu.value?.irm?.queued_tasks ?? 0
  const max = tpu.value?.irm?.config?.max_queue_depth ?? 0
  return max > 0 ? Math.min(100, Math.round((q / max) * 100)) : 0
})
/** 熔断态: 队列水位 ≥80% 熔断风险 / TPU ≥90% 高负载 / 其余正常 */
const schedState = computed(() => {
  if (!hasTpu.value) return null
  if (queuePct.value >= 80) return { type: 'danger' as const, text: '熔断风险' }
  if (tpuPct.value >= 90) return { type: 'warning' as const, text: '高负载' }
  return { type: 'success' as const, text: '运行正常' }
})
const schedTiles = computed(() => {
  const s = tpu.value?.scheduler
  const irm = tpu.value?.irm
  return [
    { label: '并发推理', value: s?.active_inferences != null ? String(s.active_inferences) : '—' },
    { label: '活跃通道', value: s?.active_channels != null ? String(s.active_channels) : '—' },
    { label: '均推理延迟', value: irm?.avg_inference_ms != null ? `${irm.avg_inference_ms}ms` : '—' },
    { label: '吞吐', value: irm?.throughput_fps != null ? `${irm.throughput_fps}fps` : '—' },
    { label: '跳帧率', value: s?.motion_gate?.skip_rate_pct != null ? `${s.motion_gate.skip_rate_pct}%` : '—' },
    { label: '待处理任务', value: s?.pending_tasks != null ? String(s.pending_tasks) : '—' },
  ]
})

async function loadAll() {
  loading.value = true
  try {
    // [校园二期] 双路并行: 态势聚合 + 调度水位 (/stats/tpu, 各自失败降级不互相阻塞)
    const [dash, tpuResp] = await Promise.all([
      schoolApi.getCampusDashboard({ hours: hours.value, days: days.value }).catch(() => null),
      schoolApi.getTpuStats().catch(() => null),
    ])
    if (dash) data.value = (dash.data?.data as CampusDashboard) || null
    tpu.value = tpuResp ? (tpuResp.data?.data ?? null) : tpu.value
  } catch (e) {
    console.error('[CampusDashboard] load failed', e)
    ElMessage.error('大屏数据加载失败, 请检查设备连接')
  }
  loading.value = false
}

/** 水位快刷新: 仅拉 /stats/tpu (准实时: 利用率/队列/并发秒级变化) */
async function refreshTpu() {
  try {
    const tpuResp = await schoolApi.getTpuStats()
    tpu.value = tpuResp.data?.data ?? tpu.value
  } catch { /* 保留旧值 */ }
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

onMounted(async () => {
  await loadAll()
  refreshTimer = setInterval(loadAll, 30000)
  tpuTimer = setInterval(refreshTpu, 10000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (tpuTimer) clearInterval(tpuTimer)
})
</script>

<style scoped>
.campus-dashboard {
  padding: 14px; background: #f0f2f5; min-height: calc(100vh - 84px);
}
.campus-dashboard.fullscreen {
  position: fixed; inset: 0; z-index: 2000; overflow-y: auto; min-height: 100vh;
}
.dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.dash-title { display: flex; align-items: center; gap: 10px; font-size: 19px; font-weight: 700; color: #1f2d3d; }
.dash-actions { display: flex; gap: 8px; align-items: center; }
.kpi-row { margin-bottom: 12px; }
.kpi-card { border-radius: 10px; }
.kpi-value { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kpi-label { color: #909399; font-size: 12px; margin-top: 2px; }
.chart-card { border-radius: 10px; margin-bottom: 12px; }
.chart-card :deep(.el-card__header) { padding: 10px 16px; }
.card-title { font-weight: 600; color: #303133; font-size: 14px; }
.title-sub { color: #909399; font-weight: 400; font-size: 11px; margin-left: 6px; }
.qc-card { border-radius: 10px; margin-bottom: 12px; }
.qc-card :deep(.el-card__header) { padding: 10px 16px; }
.qc-summary { display: flex; justify-content: space-between; margin: 6px 0 12px; }
.qc-item { text-align: center; }
.qc-num { display: block; font-size: 22px; font-weight: 700; color: #303133; font-variant-numeric: tabular-nums; }
.qc-good { color: #67c23a; } .qc-bad { color: #f56c6c; } .qc-teal { color: #14b8b8; }
.qc-label { color: #909399; font-size: 12px; }
.qc-rate-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.qc-rate-row > span { color: #606266; font-size: 13px; width: 80px; }
.qc-rate-row :deep(.el-progress) { flex: 1; }
.rank-row { margin-bottom: 10px; }
.rank-head { display: flex; justify-content: space-between; margin-bottom: 3px; }
.rank-name { color: #606266; font-size: 12px; }
.rank-meta { color: #909399; font-size: 12px; }
.rank-meta strong { color: #303133; }
.rank-bar-wrap { height: 6px; background: #f0f2f5; border-radius: 3px; overflow: hidden; }
.rank-bar { height: 100%; background: linear-gradient(90deg, #409eff, #79bbff); border-radius: 3px; transition: width 0.4s; }
/* [校园二期] 调度水位卡 */
.sched-tag { margin-left: 10px; }
.sched-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.sched-tile { text-align: center; padding: 8px 0 6px; background: #fafbfc; border: 1px solid #f0f2f5; border-radius: 8px; }
.sched-num { display: block; font-size: 20px; font-weight: 700; color: #303133; font-variant-numeric: tabular-nums; }
.sched-label { color: #909399; font-size: 12px; }
.sched-note { color: #c0c4cc; font-size: 11px; margin-top: 6px; }
</style>
