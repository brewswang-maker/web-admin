<template>
  <div class="school-attendance">
    <!-- KPI 行 -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-badge badge-blue"><el-icon :size="20"><User /></el-icon></div>
        <div class="kpi-main">
          <div class="kpi-value val-blue">{{ kpi.todayPassages }}</div>
          <div class="kpi-label">今日通行人次</div>
          <div class="kpi-sub">face_pass 刷脸通行事件</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-badge badge-teal"><el-icon :size="20"><Timer /></el-icon></div>
        <div class="kpi-main">
          <div class="kpi-value val-teal">{{ peakLabel }}</div>
          <div class="kpi-label">通行高峰时段</div>
          <div class="kpi-sub">峰值 {{ peakCount }} 人次/小时</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-badge badge-green"><el-icon :size="20"><Location /></el-icon></div>
        <div class="kpi-main">
          <div class="kpi-value val-green">{{ passageChannels.length }}</div>
          <div class="kpi-label">活跃出入口</div>
          <div class="kpi-sub">今日有通行记录的通道</div>
        </div>
      </div>
    </div>

    <el-row :gutter="14">
      <el-col :span="15">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">24 小时通行流量 <span class="card-title-sub">到校/离校高峰分布 · 小时粒度</span></span>
              <el-button size="small" :loading="loading" @click="loadAll()"><el-icon><Refresh /></el-icon>刷新</el-button>
            </div>
          </template>
          <LazyChart v-if="trendOption && !loading" :option="trendOption" height="300px" />
          <el-skeleton v-else :rows="6" animated style="padding: 8px" />
          <el-empty v-if="!loading && !trendOption" description="窗口内暂无通行记录 (face_pass)" >
            <el-button size="small" @click="loadAll()">重试</el-button>
          </el-empty>
        </el-card>
      </el-col>
      <el-col :span="9">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-header"><span class="card-title">出入口通行排行 <span class="card-title-sub">(今日)</span></span></div>
          </template>
          <template v-if="passageChannels.length">
            <div v-for="c in passageChannels" :key="c.channel" class="rank-row">
              <div class="rank-head">
                <span class="rank-name">{{ c.label }}</span>
                <span class="rank-meta"><strong>{{ c.cnt }}</strong> 人次</span>
              </div>
              <div class="rank-bar-wrap">
                <div class="rank-bar" :style="{ width: c.pct + '%' }" />
              </div>
            </div>
          </template>
          <el-empty v-else :image-size="56" description="今日暂无通行数据" >
            <el-button size="small" @click="loadAll()">重试</el-button>
          </el-empty>
          <div class="note-block">
            考勤说明: 以人脸通行事件 (face_pass) 为真实签到依据, 按通道/出入口聚合;
            人员身份级考勤报表需门禁系统对接 (二期 GA/T 2000.273 联动)。
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 考勤统计 — [校园方案 2026-08-30]
 * 数据源: campus_dashboard.passage_trend (24h face_pass 小时桶) + passage_by_channel (出入口)
 * 红线: alarm_events 无身份列 → 不伪造个人考勤, 只呈现真实通行流量 (禁 mock)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Refresh, User, Timer, Location } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import { schoolApi } from '@/api/school'

const loading = ref(false)
const dash = ref<Awaited<ReturnType<typeof schoolApi.getCampusDashboard>>['data']['data'] | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const kpi = computed(() => ({
  todayPassages: dash.value?.kpi.today_passages ?? 0,
}))

/** 高峰时段 (passage_trend 峰值小时) */
const peak = computed(() => {
  const list = [...(dash.value?.passage_trend || [])]
  if (!list.length) return null
  return list.reduce((a, b) => (b.cnt > a.cnt ? b : a))
})
const peakLabel = computed(() => {
  const p = peak.value
  if (!p || p.cnt === 0) return '—'
  const d = new Date(p.hr * 3600000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:00-${pad((d.getHours() + 1) % 24)}:00`
})
const peakCount = computed(() => peak.value?.cnt ?? 0)

const trendOption = computed(() => {
  const list = dash.value?.passage_trend || []
  if (!list.length) return null
  const hrs = [...list].sort((a, b) => a.hr - b.hr).slice(-24)
  const labels = hrs.map(h => {
    const dt = new Date(h.hr * 3600000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:00`
  })
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 16, top: 24, bottom: 24 },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#dcdfe6' } }, axisLabel: { color: '#909399', fontSize: 11 } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f0f2f5' } }, axisLabel: { color: '#909399', fontSize: 11 } },
    series: [{
      name: '通行人次', type: 'bar', barMaxWidth: 18, data: hrs.map(h => h.cnt),
      itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
    }],
  }
})

const passageChannels = computed(() => {
  const list = [...(dash.value?.passage_by_channel || [])]
  const max = Math.max(...list.map(c => c.cnt), 1)
  return list.map(c => ({
    ...c,
    label: c.channel.replace(/^ch_/, ''),
    pct: Math.round(c.cnt / max * 100),
  }))
})

async function loadAll(silent = false) {
  if (!silent) loading.value = true
  try {
    const resp = await schoolApi.getCampusDashboard({ hours: 24, days: 7 })
    dash.value = (resp.data?.data as any) || null
  } catch (e) {
    console.error('[Attendance] load failed', e)
    if (!silent) ElMessage.error('考勤数据加载失败, 请检查设备连接')
  }
  if (!silent) loading.value = false
}

onMounted(async () => {
  await loadAll()
  refreshTimer = setInterval(() => loadAll(true), 30000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.school-attendance { padding: 16px; background: #f5f7fa; min-height: calc(100vh - 84px); }
.kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
.kpi-card {
  background: #fff; border-radius: 10px; padding: 16px; display: flex; gap: 12px;
  border: 1px solid #ebeef5; transition: box-shadow 0.2s, transform 0.2s;
}
.kpi-card:hover { box-shadow: 0 6px 18px rgba(31,45,61,0.10); transform: translateY(-2px); }
.kpi-badge { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; }
.badge-blue { background: linear-gradient(135deg, #409eff, #79bbff); }
.badge-teal { background: linear-gradient(135deg, #14b8b8, #82dcdc); }
.badge-green { background: linear-gradient(135deg, #67c23a, #b3e19d); }
.kpi-value { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
.val-blue { color: #409eff; } .val-teal { color: #14b8b8; } .val-green { color: #67c23a; }
.kpi-label { color: #606266; font-size: 13px; margin-top: 2px; }
.kpi-sub { color: #909399; font-size: 11px; margin-top: 2px; }
.block-card { border-radius: 10px; }
.block-card :deep(.el-card__header) { padding: 12px 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-weight: 600; color: #303133; font-size: 14px; }
.card-title-sub { color: #909399; font-weight: 400; font-size: 12px; margin-left: 8px; }
.rank-row { margin-bottom: 10px; }
.rank-head { display: flex; justify-content: space-between; margin-bottom: 3px; }
.rank-name { color: #606266; font-size: 12px; }
.rank-meta { color: #909399; font-size: 12px; }
.rank-meta strong { color: #303133; }
.rank-bar-wrap { height: 6px; background: #f0f2f5; border-radius: 3px; overflow: hidden; }
.rank-bar { height: 100%; background: linear-gradient(90deg, #67c23a, #b3e19d); border-radius: 3px; transition: width 0.4s; }
.note-block {
  margin-top: 12px; padding: 10px 12px; background: #ecf5ff; border-radius: 6px;
  color: #606266; font-size: 12px; line-height: 1.6;
}
</style>
