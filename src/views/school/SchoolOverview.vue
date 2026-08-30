<template>
  <div class="school-overview">
    <!-- ===== 页头: 标题 + 数据时点 + 入口组 [校园方案 2026-08-30] ===== -->
    <div class="ov-head">
      <div class="ov-head-left">
        <span class="ov-title">校园总览</span>
        <span class="ov-sub">
          <span class="live-dot" :class="{ stale: loadFailed }" />
          {{ loadFailed ? '数据加载异常' : `数据更新于 ${lastUpdated}` }}
          <el-tooltip content="每 30 秒自动刷新; 全部为设备真实统计数据" placement="bottom">
            <el-icon class="ov-sub-icon"><InfoFilled /></el-icon>
          </el-tooltip>
        </span>
      </div>
      <div class="ov-head-actions">
        <el-button size="default" @click="$router.push('/retrieval')">
          <el-icon><Search /></el-icon>智能检索
        </el-button>
        <el-button size="default" @click="$router.push('/school/campus3d')">
          <el-icon><MapLocation /></el-icon>3D 校园
        </el-button>
        <el-button size="default" type="primary" @click="$router.push('/school/dashboard')">
          <el-icon><TrendCharts /></el-icon>态势大屏
        </el-button>
      </div>
    </div>

    <!-- ===== KPI 七卡 (campus_dashboard + devices + vlm/stats 真实聚合, 点击下钻) ===== -->
    <div class="kpi-grid">
      <div v-for="k in kpiCards" :key="k.label" class="kpi-card" :class="{ 'kpi-alert': k.alert }"
           role="button" @click="k.to && $router.push(k.to)">
        <div class="kpi-badge" :class="`badge-${k.tone}`">
          <el-icon :size="20"><component :is="k.icon" /></el-icon>
        </div>
        <div class="kpi-main">
          <div class="kpi-value" :class="`val-${k.tone}`">{{ k.value }}</div>
          <div class="kpi-label">{{ k.label }}</div>
          <div class="kpi-sub">{{ k.sub }}</div>
        </div>
      </div>
    </div>

    <!-- ===== 24h 态势 + 五级分卡 ===== -->
    <el-row :gutter="14">
      <el-col :span="17">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">近 24 小时态势 <span class="card-title-sub">告警 / 通行 · 小时粒度</span></span>
              <el-button size="small" :loading="loading" @click="loadAll()">
                <el-icon><Refresh /></el-icon>刷新
              </el-button>
            </div>
          </template>
          <LazyChart v-if="trendOption && !loading" :option="trendOption" height="240px" />
          <el-skeleton v-else :rows="5" animated style="padding: 8px" />
        </el-card>
      </el-col>
      <el-col :span="7">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-header"><span class="card-title">今日告警五级分布 <span class="card-title-sub">对标海康 1-5 级</span></span></div>
          </template>
          <template v-if="levelRows.length">
            <div v-for="l in levelRows" :key="l.level" class="level-row">
              <span class="level-name" :class="`lname-${l.level}`">{{ l.label }}</span>
              <div class="level-bar-wrap">
                <div class="level-bar" :class="`lbar-${l.level}`" :style="{ width: l.pct + '%' }" />
              </div>
              <span class="level-cnt">{{ l.cnt }}</span>
            </div>
          </template>
          <el-empty v-else :image-size="48" description="今日暂无告警" />
          <div class="legend-note">5 严重 · 4 高危 · 3 中危 · 2 低危 · 1 通知</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 中部: 校园分区实况 + 通道与安全实况 ===== -->
    <el-row :gutter="14">
      <el-col :span="16">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">校园分区实况 <span class="card-title-sub">算法覆盖 × 今日事件 (smart_campus 场景)</span></span>
              <span class="legend">
                <span class="lg-item"><i class="dot dot-green" />覆盖良好</span>
                <span class="lg-item"><i class="dot dot-yellow" />部分覆盖</span>
                <span class="lg-item"><i class="dot dot-red" />待建设</span>
              </span>
            </div>
          </template>
          <el-row :gutter="12">
            <el-col :span="8" v-for="z in zones" :key="z.id">
              <div class="zone-tile" :class="`zone-${z.status}`">
                <div class="zone-head">
                  <span class="zone-icon"><el-icon :size="15"><component :is="z.icon" /></el-icon></span>
                  <span class="zone-name">{{ z.name }}</span>
                </div>
                <div class="zone-status">
                  <i class="dot" :class="z.status === 'ok' ? 'dot-green' : z.status === 'partial' ? 'dot-yellow' : 'dot-red'" />
                  <span>{{ z.statusText }}</span>
                </div>
                <div class="zone-algos">
                  <el-tooltip v-for="a in z.algos" :key="a.name" :content="a.note || a.name" placement="top">
                    <span class="algo-chip" :class="`algo-${a.status}`">{{ a.name }}</span>
                  </el-tooltip>
                </div>
                <div class="zone-events">
                  <span>今日 <strong>{{ z.todayCount }}</strong></span>
                  <span class="zone-sub">最近 {{ z.lastEventTime }}</span>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card shadow="never" class="block-card side-card">
          <template #header>
            <div class="card-header"><span class="card-title">通道与安全实况</span></div>
          </template>
          <div class="dev-line">
            <div class="dev-stat">
              <span class="dev-num val-green">{{ devicesOnline }}<i class="dev-total">/{{ devicesTotal }}</i></span>
              <span class="dev-label">设备在线</span>
            </div>
            <div class="dev-stat">
              <span class="dev-num val-blue">{{ channelsTotal }}</span>
              <span class="dev-label">接入通道</span>
            </div>
            <div class="dev-stat">
              <span class="dev-num val-purple">{{ feedbackTotal }}</span>
              <span class="dev-label">复核标注</span>
            </div>
          </div>
          <el-progress v-if="devicesTotal" :percentage="Math.round(devicesOnline / devicesTotal * 100)"
                       :stroke-width="6" :show-text="false" class="dev-bar" status="success" />
          <div class="rank-title">通道告警排行 <span class="rank-sub">(窗口内)</span></div>
          <template v-if="topChannels.length">
            <div v-for="c in topChannels" :key="c.key" class="rank-row">
              <div class="rank-head">
                <span class="rank-name">{{ c.label }}</span>
                <span class="rank-meta">
                  <strong>{{ c.total }}</strong> 次
                  <el-tag v-if="c.falseAlarmRate > 0" size="small" type="danger" effect="plain"
                          class="rank-tag">误报 {{ (c.falseAlarmRate * 100).toFixed(1) }}%</el-tag>
                </span>
              </div>
              <div class="rank-bar-wrap">
                <div class="rank-bar" :style="{ width: c.pct + '%' }" />
              </div>
            </div>
          </template>
          <el-empty v-else :image-size="48" description="窗口内无通道告警" />
          <div class="rank-title">安全事件构成 <span class="rank-sub">(Top 5)</span></div>
          <template v-if="topTypes.length">
            <div v-for="t in topTypes" :key="t.key" class="rank-row">
              <div class="rank-head">
                <span class="rank-name">{{ t.label }}</span>
                <span class="rank-meta"><strong>{{ t.total }}</strong> 次</span>
              </div>
              <div class="rank-bar-wrap">
                <div class="rank-bar bar-teal" :style="{ width: t.pct + '%' }" />
              </div>
            </div>
          </template>
          <el-empty v-else :image-size="48" description="窗口内无安全事件" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 校园总览 (门面工程) — [校园方案 2026-08-30]
 * 对标: 海康 iSchool 工作台 / ZT-AJPT 三件套 / Evolv 误报率卖点 / 研华设备运维 / NVIDIA VLM pipeline
 * 数据源 (全部真实, 禁 mock):
 *   - GET /stats/campus_dashboard — KPI + 小时三路趋势 + 五级分卡 + by_channel/by_type + 联动时延 + 复核反馈
 *   - GET /api/v1/devices — 设备在线状态
 *   - GET /vlm/stats — VLM 异步研判量 (Qwen3-VL 端侧 pipeline)
 *   - GET /api/v1/alarms — 分区计数聚合
 * 风格基线: ScreeningOverview (安检总览门面) — 渐变徽章/hover/排行条/色点 统一
 */
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import {
  Refresh, InfoFilled, TrendCharts, Search, MapLocation, User, Bell, Tickets, Monitor, Timer,
  MagicStick, School, OfficeBuilding, Basketball, House, Food, Reading,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import { alarmApi } from '@/api/alarm'
import { deviceApi } from '@/api/device'
import { schoolApi, type CampusDashboard } from '@/api/school'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'

// ── 状态 ──

const loading = ref(false)
const loadFailed = ref(false)
const lastUpdated = ref('--:--:--')
const dash = ref<CampusDashboard | null>(null)
const events = ref<AlarmEvent[]>([])
const vlmSubmitted = ref<number | null>(null)
const vlmReady = ref(false)
const devicesOnline = ref(0)
const devicesTotal = ref(0)
const channelsTotal = ref(0)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ── KPI 七卡 (全部真实聚合; to = 下钻路由) ──

const kpiCards = computed(() => {
  const d = dash.value
  return [
    {
      label: '今日通行', value: fmtNum(d?.kpi.today_passages ?? 0), tone: 'blue', icon: User,
      alert: false, to: '/school/attendance',
      sub: `人脸通行事件 (刷脸闸机/出入口)`,
    },
    {
      label: '今日告警', value: fmtNum(d?.kpi.today_alarms ?? 0), tone: 'red', icon: Bell,
      alert: (d?.kpi.today_alarms ?? 0) > 0, to: '/school/dashboard',
      sub: `重点安全事件 ${fmtNum(todayKeyCount())}`,
    },
    {
      label: '待处理', value: fmtNum(d?.kpi.pending_review ?? 0), tone: 'orange', icon: Tickets,
      alert: (d?.kpi.pending_review ?? 0) > 100, to: '/school/perimeter',
      sub: `处理率 ${pct(d?.kpi.review_rate ?? 0, 2)}`,
    },
    {
      label: '标注误报率', value: d?.feedback.total_feedback ? pct(d.feedback.annotated_false_rate, 1) : '—',
      tone: 'purple', icon: MagicStick, alert: false, to: '/school/security',
      sub: `已标注 ${d?.feedback.total_feedback ?? 0} 条 (误报 ${d?.feedback.false_positives ?? 0})`,
    },
    {
      label: '设备在线', value: `${devicesOnline.value}/${devicesTotal.value}`, tone: 'green', icon: Monitor,
      alert: devicesTotal.value > 0 && devicesOnline.value < devicesTotal.value, to: '/school/campus3d',
      sub: `接入通道 ${channelsTotal.value}`,
    },
    {
      label: 'VLM 研判量', value: vlmSubmitted.value == null ? '—' : fmtNum(vlmSubmitted.value),
      tone: 'teal', icon: TrendCharts, alert: false, to: '/school/dashboard',
      sub: vlmReady.value ? 'Qwen3-VL 端侧就绪' : '端侧待挂载',
    },
    {
      label: '联动时延', value: d?.action_latency?.sample_count ? `${d.action_latency.p50_ms.toFixed(1)} ms` : '—',
      tone: 'teal', icon: Timer, alert: false, to: '/school/dashboard',
      sub: d?.action_latency?.sample_count ? `p90 ${d.action_latency.p90_ms.toFixed(0)} ms · ${d.action_latency.sample_count} 样本` : '暂无联动样本',
    },
  ]
})

function fmtNum(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`
}

/** 重点事件今日合计 (key_trend 今日小时桶) */
function todayKeyCount(): number {
  const buckets = dash.value?.key_trend || []
  const now = new Date()
  return buckets
    .filter(b => {
      const d = new Date(b.hr * 3600000)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    })
    .reduce((s, b) => s + b.cnt, 0)
}

// ── 五级分布 (by_level 真实聚合, 对标海康 1-5 级) ──

const LEVEL_LABELS: Record<number, string> = { 5: '严重', 4: '高危', 3: '中危', 2: '低危', 1: '通知' }
const levelRows = computed(() => {
  const list = [...(dash.value?.by_level || [])]
  const max = Math.max(...list.map(l => l.cnt), 1)
  return list
    .sort((a, b) => b.level - a.level)
    .map(l => ({
      level: l.level, label: LEVEL_LABELS[l.level] || `L${l.level}`,
      cnt: l.cnt, pct: Math.round(l.cnt / max * 100),
    }))
})

// ── 24h 趋势图 (alarm_trend + passage_trend 小时桶对齐) ──

const trendOption = computed(() => {
  const d = dash.value
  if (!d) return null
  const alarmB = d.alarm_trend || []
  const passB = d.passage_trend || []
  if (!alarmB.length && !passB.length) return null
  const hrs = Array.from(new Set([...alarmB.map(b => b.hr), ...passB.map(b => b.hr)])).sort((a, b) => a - b).slice(-24)
  const alarmMap = new Map(alarmB.map(b => [b.hr, b.cnt]))
  const passMap = new Map(passB.map(b => [b.hr, b.cnt]))
  const labels = hrs.map(h => {
    const dt = new Date(h * 3600000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:00`
  })
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['通行', '告警'], top: 0, right: 8, itemWidth: 12, itemHeight: 8, textStyle: { color: '#606266', fontSize: 12 } },
    grid: { left: 44, right: 16, top: 30, bottom: 24 },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#dcdfe6' } }, axisLabel: { color: '#909399', fontSize: 11 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f2f5' } }, axisLabel: { color: '#909399', fontSize: 11 } },
    series: [
      { name: '通行', type: 'bar', barMaxWidth: 14, data: hrs.map(h => passMap.get(h) ?? 0),
        itemStyle: { color: '#409eff', borderRadius: [3, 3, 0, 0] } },
      { name: '告警', type: 'bar', barMaxWidth: 14, data: hrs.map(h => alarmMap.get(h) ?? 0),
        itemStyle: { color: '#f56c6c', borderRadius: [3, 3, 0, 0] } },
    ],
  }
})

// ── 通道排行 / 事件构成 (真实聚合 Top5) ──

const topChannels = computed(() => {
  const list = [...(dash.value?.by_channel || [])].sort((a, b) => b.total - a.total).slice(0, 5)
  const max = Math.max(...list.map(c => c.total), 1)
  return list.map(c => ({
    key: c.key,
    label: c.key.replace(/^ch_/, '').length > 12 ? `${c.key.replace(/^ch_/, '').slice(0, 12)}…` : c.key.replace(/^ch_/, ''),
    total: c.total, falseAlarmRate: c.false_alarm_rate, pct: Math.round(c.total / max * 100),
  }))
})

const TYPE_NAMES: Record<string, string> = {
  phone_call: '接打电话', loitering: '徘徊逗留', unattended_baggage: '遗留物', face_stranger: '陌生人',
  face_blacklist: '黑名单', intrusion: '周界入侵', face_pass_vip: 'VIP通行', tripwire: '越界',
  face_pass_whitelist: '白名单通行', abandoned: '遗弃物', face_pass_visitor: '访客通行',
  fall_detected: '跌倒', tailgate: '尾随', gathering: '聚集', climbing: '攀爬', smoking: '吸烟',
  running: '奔跑', fighting: '打架', field_intrusion: '冲场', object_removal: '物品移走',
  face_verify_fail: '识别失败', face_tailgate: '人脸尾随', person_with_backpack: '携包通行',
  person_detected: '人员检测', face_pass_staff: '员工通行', face_pass_custom: '自定义名单通行',
  fight: '打架',
}
const topTypes = computed(() => {
  const list = [...(dash.value?.by_type || [])].sort((a, b) => b.total - a.total).slice(0, 5)
  const max = Math.max(...list.map(t => t.total), 1)
  return list.map(t => ({
    key: t.key, label: TYPE_NAMES[t.key] || t.key, total: t.total, pct: Math.round(t.total / max * 100),
  }))
})

const feedbackTotal = computed(() => dash.value?.feedback.total_feedback ?? 0)

// ── 校园六分区 (smart_campus.json roi_zones 语义; 计数来自真实事件流) ──

interface ZoneAlgo { name: string; status: 'green' | 'yellow' | 'red'; note?: string }
interface Zone {
  id: string
  name: string
  icon: Component
  status: 'ok' | 'partial' | 'gap'
  statusText: string
  algos: ZoneAlgo[]
  match: (type: string) => boolean
  todayCount: number
  lastEventTime: string
}

const zones = ref<Zone[]>([
  {
    id: 'gate', name: '校门出入口', icon: School, status: 'ok', statusText: '人-证-行-物全覆盖',
    algos: [
      { name: '人脸通行/黑名单', status: 'green' },
      { name: '陌生人告警', status: 'green' },
      { name: '尾随检测', status: 'green' },
      { name: '携包/遗留物', status: 'green' },
    ],
    match: t => t.startsWith('face_') || ['tailgate', 'unattended_baggage', 'abandoned', 'person_with_backpack'].includes(t),
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'teach', name: '教学楼', icon: OfficeBuilding, status: 'partial', statusText: '部分覆盖',
    algos: [
      { name: '接打电话', status: 'green' },
      { name: '吸烟检测', status: 'green' },
      { name: '遗留物', status: 'green' },
      { name: '考勤联动', status: 'yellow', note: 'face_pass 通道级考勤' },
    ],
    match: t => ['phone_call', 'smoking', 'unattended_baggage', 'abandoned'].includes(t),
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'playground', name: '操场', icon: Basketball, status: 'partial', statusText: '部分覆盖',
    algos: [
      { name: '聚集检测', status: 'green' },
      { name: '打架/奔跑', status: 'green' },
      { name: '跌倒检测', status: 'green' },
      { name: '冲场入侵', status: 'green' },
    ],
    match: t => ['fighting', 'gathering', 'running', 'field_intrusion', 'fall_detected'].includes(t),
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'dorm', name: '宿舍区', icon: House, status: 'ok', statusText: '夜间防控重点',
    algos: [
      { name: '周界入侵', status: 'green' },
      { name: '攀爬/越界', status: 'green' },
      { name: '徘徊逗留', status: 'green' },
      { name: '23:00-06:00 布防', status: 'green', note: 'smart_campus schedule' },
    ],
    match: t => ['loitering', 'intrusion', 'climbing', 'tripwire', 'abandoned'].includes(t),
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'canteen', name: '食堂', icon: Food, status: 'partial', statusText: '部分覆盖',
    algos: [
      { name: '烟火检测', status: 'green' },
      { name: '聚集/踩踏', status: 'green' },
      { name: '跌倒检测', status: 'green' },
      { name: '燃气/环境', status: 'red', note: 'OPC UA 工业协议二期' },
    ],
    match: t => ['gathering', 'fire_smoke', 'smoke_fire', 'fall_detected', 'unattended_baggage'].includes(t),
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'lib', name: '图书馆', icon: Reading, status: 'partial', statusText: '部分覆盖',
    algos: [
      { name: '遗留物(反恐)', status: 'green' },
      { name: '物品移走', status: 'green' },
      { name: '安静秩序', status: 'yellow', note: '接打电话/吸烟' },
      { name: '人流密度', status: 'red', note: '二期 density pipeline' },
    ],
    match: t => ['unattended_baggage', 'abandoned', 'object_removal', 'phone_call', 'smoking', 'gathering'].includes(t),
    todayCount: 0, lastEventTime: '-',
  },
])

function loadZoneCounts() {
  const now = new Date()
  zones.value.forEach(z => {
    // 防御: 事件 type 缺失时不让谓词抛错 (undefined.startsWith 会中断 loadAll 尾部)
    const matched = events.value.filter(e => {
      try { return z.match(String((e as any).type || '')) } catch { return false }
    })
    z.todayCount = matched.filter(e => {
      const d = new Date(e.createdAt)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    }).length
    const latest = matched
      .map(e => ({ e, t: new Date(e.createdAt).getTime() || 0 }))
      .sort((a, b) => b.t - a.t)[0]?.e
    z.lastEventTime = latest ? shortTime(latest.createdAt) : '-'
  })
}

// ── 数据加载 (并行 4 源 + 失败提示 + 30s 自动刷新) ──

async function loadAll(silent = false) {
  if (!silent) loading.value = true
  const [dashR, devR, evtR, vlmR] = await Promise.allSettled([
    schoolApi.getCampusDashboard({ hours: 24, days: 7 }),
    deviceApi.getList({ page: 1, pageSize: 200 }),
    alarmApi.getList({ page: 1, pageSize: 200 }),
    schoolApi.getVlmStats(),
  ])
  let failed = 0
  // [真机修复 2026-08-30] 分支内包 try/catch: 任何单源处理异常不得中断尾部
  //   loading/lastUpdated 复位 (曾致态势图骨架屏永久卡死 + 更新时间占位符)
  if (dashR.status === 'fulfilled') {
    try { dash.value = (dashR.value.data?.data as CampusDashboard) || null }
    catch (e) { failed++; console.error('[SchoolOverview] dashboard parse failed', e) }
  } else { failed++; console.error('[SchoolOverview] dashboard failed', dashR.reason) }
  if (devR.status === 'fulfilled') {
    try {
      const items = (devR.value.data?.data as any)?.items || []
      devicesTotal.value = items.length
      devicesOnline.value = items.filter((x: any) => x.status === 'online').length
      channelsTotal.value = items.reduce((s: number, x: any) => s + (x.channelCount || 0), 0)
    } catch (e) { failed++; console.error('[SchoolOverview] devices parse failed', e) }
  } else { failed++; console.error('[SchoolOverview] devices failed', devR.reason) }
  if (evtR.status === 'fulfilled') {
    try {
      const items = (evtR.value.data?.data as any)?.items || []
      // 归一化 snake_case → camelCase (六分区 match/时间过滤依赖 type/createdAt)
      events.value = items.map((x: any) => normalizeAlarmCore(x))
      loadZoneCounts()
    } catch (e) { failed++; console.error('[SchoolOverview] events parse failed', e) }
  } else { failed++; console.error('[SchoolOverview] events failed', evtR.reason) }
  if (vlmR.status === 'fulfilled') {
    try {
      const v = vlmR.value.data?.data as any
      if (v) { vlmSubmitted.value = v.images_submitted ?? null; vlmReady.value = !!v.ready }
    } catch (e) { console.error('[SchoolOverview] vlm parse failed', e) }
  } else { vlmSubmitted.value = null; console.error('[SchoolOverview] vlm failed', vlmR.reason) }
  loadFailed.value = failed >= 3
  if (failed > 0 && !silent) {
    ElMessage.error(`${failed} 个数据源加载失败, 部分指标可能滞后`)
  }
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  lastUpdated.value = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  if (!silent) loading.value = false
}

function levelClass(level: AlarmLevel): string {
  switch (level) {
    case 'critical': return 'lv-crit'
    case 'high': return 'lv-high'
    case 'medium': return 'lv-med'
    case 'low': return 'lv-low'
    default: return 'lv-info'
  }
}
function shortTime(ts?: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
.school-overview { padding: 16px; background: #f5f7fa; min-height: calc(100vh - 84px); }

/* ── 页头 ── */
.ov-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.ov-head-left { display: flex; align-items: baseline; gap: 12px; }
.ov-title { font-size: 20px; font-weight: 700; color: #1f2d3d; letter-spacing: 0.5px; }
.ov-sub { color: #909399; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
.ov-sub-icon { font-size: 12px; cursor: help; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #67c23a; display: inline-block; box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.18); }
.live-dot.stale { background: #f56c6c; box-shadow: 0 0 0 3px rgba(245, 108, 108, 0.18); }
.ov-head-actions { display: flex; gap: 8px; }

/* ── KPI 七卡 (grid 等分, 小屏折行) ── */
.kpi-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; margin-bottom: 14px; }
@media (max-width: 1600px) { .kpi-grid { grid-template-columns: repeat(4, 1fr); } }
.kpi-card {
  background: #fff; border-radius: 10px; padding: 15px 13px; display: flex; gap: 11px; align-items: flex-start;
  border: 1px solid #ebeef5; transition: box-shadow 0.2s, transform 0.2s; cursor: pointer;
}
.kpi-card:hover { box-shadow: 0 6px 18px rgba(31, 45, 61, 0.10); transform: translateY(-2px); }
.kpi-badge {
  width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
  color: #fff; flex-shrink: 0;
}
.badge-blue { background: linear-gradient(135deg, #409eff, #79bbff); }
.badge-red { background: linear-gradient(135deg, #f56c6c, #fab6b6); }
.badge-orange { background: linear-gradient(135deg, #e6a23c, #f3d19e); }
.badge-purple { background: linear-gradient(135deg, #8e6ce0, #c0a3f2); }
.badge-green { background: linear-gradient(135deg, #67c23a, #b3e19d); }
.badge-teal { background: linear-gradient(135deg, #14b8b8, #82dcdc); }
.kpi-main { min-width: 0; }
.kpi-value { font-size: 22px; font-weight: 700; line-height: 28px; font-variant-numeric: tabular-nums; }
.val-blue { color: #409eff; } .val-red { color: #f56c6c; } .val-orange { color: #e6a23c; }
.val-green { color: #67c23a; } .val-purple { color: #8e6ce0; } .val-teal { color: #14b8b8; }
.kpi-label { color: #606266; font-size: 13px; margin-top: 2px; }
.kpi-sub { color: #909399; font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kpi-alert .kpi-value { animation: pulse 2.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

/* ── 通用卡片 ── */
.block-card { margin-bottom: 14px; border-radius: 10px; }
.block-card :deep(.el-card__header) { padding: 12px 16px; border-bottom: 1px solid #f0f2f5; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-weight: 600; color: #303133; font-size: 14px; }
.card-title-sub { color: #909399; font-weight: 400; font-size: 12px; margin-left: 8px; }
.legend { display: flex; gap: 12px; }
.lg-item { color: #909399; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot-green { background: #67c23a; } .dot-yellow { background: #e6a23c; } .dot-red { background: #f56c6c; }

/* ── 五级分布 ── */
.level-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.level-name { width: 38px; font-size: 12px; color: #606266; text-align: right; }
.lname-5 { color: #f56c6c; font-weight: 700; } .lname-4 { color: #e6a23c; font-weight: 600; }
.level-bar-wrap { flex: 1; height: 8px; background: #f0f2f5; border-radius: 4px; overflow: hidden; }
.level-bar { height: 100%; border-radius: 4px; transition: width 0.4s; }
.lbar-5 { background: linear-gradient(90deg, #f56c6c, #fab6b6); }
.lbar-4 { background: linear-gradient(90deg, #e6a23c, #f3d19e); }
.lbar-3 { background: linear-gradient(90deg, #409eff, #79bbff); }
.lbar-2 { background: linear-gradient(90deg, #67c23a, #b3e19d); }
.lbar-1 { background: linear-gradient(90deg, #909399, #c0c4cc); }
.level-cnt { width: 42px; font-size: 13px; font-weight: 700; color: #303133; font-variant-numeric: tabular-nums; }
.legend-note { color: #909399; font-size: 11px; margin-top: 4px; text-align: center; }

/* ── 分区 tile ── */
.zone-tile {
  background: #fafbfc; border-radius: 8px; padding: 12px; margin-bottom: 12px;
  border: 1px solid #ebeef5; transition: box-shadow 0.2s;
}
.zone-tile:hover { box-shadow: 0 4px 12px rgba(31, 45, 61, 0.08); }
.zone-tile.zone-ok { border-left: 4px solid #67c23a; }
.zone-tile.zone-partial { border-left: 4px solid #e6a23c; }
.zone-tile.zone-gap { border-left: 4px solid #f56c6c; }
.zone-head { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
.zone-icon { color: #409eff; display: inline-flex; }
.zone-name { font-weight: 600; color: #303133; }
.zone-status { display: flex; align-items: center; gap: 5px; color: #909399; font-size: 12px; margin-bottom: 8px; }
.zone-algos { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.algo-chip {
  font-size: 11px; padding: 2px 8px; border-radius: 10px; cursor: help;
  background: #f0f9eb; color: #67c23a; border: 1px solid #e1f3d8;
}
.algo-chip.algo-yellow { background: #fdf6ec; color: #e6a23c; border-color: #faecd8; }
.algo-chip.algo-red { background: #fef0f0; color: #f56c6c; border-color: #fde2e2; }
.zone-events { color: #606266; font-size: 12px; display: flex; align-items: center; gap: 10px; }
.zone-events strong { color: #409eff; }
.zone-events .zone-sub { color: #909399; }

/* ── 右侧实况卡 ── */
.side-card :deep(.el-card__body) { padding: 14px 16px; }
.dev-line { display: flex; justify-content: space-between; margin-bottom: 6px; }
.dev-stat { text-align: center; flex: 1; }
.dev-num { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dev-num .dev-total { font-style: normal; font-size: 14px; color: #909399; font-weight: 500; }
.dev-label { display: block; color: #909399; font-size: 12px; margin-top: 2px; }
.dev-bar { margin-bottom: 12px; }
.rank-title { font-size: 13px; font-weight: 600; color: #303133; margin: 12px 0 8px; }
.rank-sub { color: #909399; font-weight: 400; font-size: 11px; }
.rank-row { margin-bottom: 9px; }
.rank-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
.rank-name { color: #606266; font-size: 12px; }
.rank-meta { color: #909399; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
.rank-meta strong { color: #303133; }
.rank-tag { transform: scale(0.9); }
.rank-bar-wrap { height: 6px; background: #f0f2f5; border-radius: 3px; overflow: hidden; }
.rank-bar { height: 100%; background: linear-gradient(90deg, #409eff, #79bbff); border-radius: 3px; transition: width 0.4s; }
.rank-bar.bar-teal { background: linear-gradient(90deg, #14b8b8, #82dcdc); }
</style>
