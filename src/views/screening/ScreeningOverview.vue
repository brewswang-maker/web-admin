<template>
  <div class="screening-overview">
    <!-- ===== 页头: 标题 + 数据时点 + 子页面入口组 [安检门面工程 2026-08-30] ===== -->
    <div class="ov-head">
      <div class="ov-head-left">
        <span class="ov-title">安检总览</span>
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
        <el-button size="default" @click="$router.push('/screening/rule-manager')">
          <el-icon><Setting /></el-icon>规则管理
        </el-button>
        <el-button size="default" type="primary" @click="$router.push('/screening/dashboard')">
          <el-icon><TrendCharts /></el-icon>运行大屏
        </el-button>
      </div>
    </div>

    <!-- ===== KPI 六卡 (全部来自 /stats/screening_dashboard 真实聚合, 禁 mock) ===== -->
    <el-row :gutter="14" class="kpi-row">
      <el-col :span="4" v-for="k in kpiCards" :key="k.label">
        <div class="kpi-card" :class="{ 'kpi-alert': k.alert }">
          <div class="kpi-badge" :class="`badge-${k.tone}`">
            <el-icon :size="20"><component :is="k.icon" /></el-icon>
          </div>
          <div class="kpi-main">
            <div class="kpi-value" :class="`val-${k.tone}`">{{ k.value }}</div>
            <div class="kpi-label">{{ k.label }}</div>
            <div class="kpi-sub">{{ k.sub }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- ===== 24h 趋势 (告警 vs 通行, 真实小时桶) ===== -->
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

    <!-- ===== 中部: 动线六分区 + 通道/设备实况 ===== -->
    <el-row :gutter="14">
      <el-col :span="16">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">安检动线 × 算法覆盖 <span class="card-title-sub">方案 v1.0 §4 六分区</span></span>
              <span class="legend">
                <span class="lg-item"><i class="dot dot-green" />已上线</span>
                <span class="lg-item"><i class="dot dot-yellow" />部分/待真实化</span>
                <span class="lg-item"><i class="dot dot-red" />缺口</span>
              </span>
            </div>
          </template>
          <el-row :gutter="12">
            <el-col :span="8" v-for="z in zones" :key="z.id">
              <div class="zone-tile" :class="`zone-${z.status}`">
                <div class="zone-head">
                  <span class="zone-id">{{ z.id }}</span>
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
            <div class="card-header"><span class="card-title">通道与设备实况</span></div>
          </template>
          <!-- 设备在线 (deviceApi 真实 status) -->
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
          <!-- 通道告警排行 (dashboard.by_channel 真实聚合) -->
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
          <!-- 重点事件类型 Top (dashboard.by_type 真实聚合, 中文映射) -->
          <div class="rank-title">重点事件构成 <span class="rank-sub">(Top 5)</span></div>
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
          <el-empty v-else :image-size="48" description="窗口内无重点事件" />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 最近安检事件流 ===== -->
    <el-card shadow="never" class="block-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">最近安检事件 <span class="card-title-sub">security_screening 场景 · 每页 {{ listLimit }} 条</span></span>
          <el-button size="small" :loading="loading" @click="loadAll()">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>
      <el-table :data="pagedEvents" v-loading="loading" size="small"
                :empty-text="loading ? '加载中…' : '暂无安检事件'" @row-click="openDetail">
        <el-table-column label="类型" min-width="170">
          <template #default="{ row }">
            <div class="type-cell">
              <span class="evt-name">{{ typeName(row.type) }}</span>
              <span class="evt-key">{{ row.type }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="96">
          <template #default="{ row }">
            <span class="level-tag" :class="levelClass(row.level)">{{ levelText(row.level) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="channelId" label="通道" width="100" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="快照" width="80" align="center">
          <template #default="{ row }">
            <el-image v-if="row.snapshotUrl" :src="row.snapshotUrl"
                      :preview-src-list="[row.snapshotUrl]" fit="cover"
                      preview-teleported class="snap-thumb" @click.stop />
            <template v-else><div class="snap-none">—</div></template>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ shortTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="" width="70" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click.stop="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager" v-if="events.length > listLimit">
        <el-button size="small" :disabled="listLimit >= events.length" @click="loadMore">
          加载更多 ({{ events.length - listLimit }})
        </el-button>
      </div>
    </el-card>

    <!-- ===== 详情抽屉 ===== -->
    <el-drawer v-model="detailVisible" :title="detailTitle" size="540px" direction="rtl">
      <div v-if="current" class="detail-body">
        <div class="kv-row"><span class="k">事件类型</span><span>{{ current.type }} · {{ typeName(current.type) }}</span></div>
        <div class="kv-row"><span class="k">级别</span><span :class="levelClass(current.level)">{{ levelText(current.level) }}</span></div>
        <div class="kv-row"><span class="k">通道</span><span>{{ current.channelId }}</span></div>
        <div class="kv-row"><span class="k">置信度</span><span>{{ current.confidence != null ? (current.confidence * 100).toFixed(0) + '%' : '-' }}</span></div>
        <div class="kv-row"><span class="k">描述</span><span>{{ current.description || '-' }}</span></div>
        <div class="kv-row"><span class="k">时间</span><span>{{ formatTime(current.createdAt) }}</span></div>
        <el-image v-if="current.snapshotUrl" :src="current.snapshotUrl"
                  :preview-src-list="[current.snapshotUrl]" fit="contain"
                  preview-teleported class="detail-snap" />
        <template v-else><div class="snap-error">快照已清理</div></template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 安检总览 (门面工程 v2) — [安检对标优化 2026-08-30]
 * 对标: 海康/大华安检工作台首页, ZT-AJPT 智慧安检平台(过检量/违禁品构成/设备状态),
 *       Evolv Insights / R&S QPS (误报率即核心卖点), 南昌轨交智慧安检大屏(小时态势)
 * 数据源 (全部真实, 禁 mock):
 *   - GET /stats/screening_dashboard — KPI 聚合 + 小时趋势 + by_channel/by_type + 联动时延 + 复核反馈
 *   - GET /api/v1/devices — 设备在线状态
 *   - GET /api/v1/alarms — 最近事件流 (表格 + 动线分区计数)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Refresh, InfoFilled, TrendCharts, Search, Setting, User, Bell, Tickets, Monitor, Timer,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import { alarmApi } from '@/api/alarm'
import { deviceApi } from '@/api/device'
import eventTypesApi from '@/api/eventTypes'
import { screeningApi } from '@/api/screening'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import { normalizeAlarmCore, type AlarmEvent, type AlarmLevel } from '@/types/alarm'

// ── dashboard 响应结构 (与 RestApiHandlers GET /stats/screening_dashboard 实测对齐) ──

interface TrendBucket { hr: number; cnt: number }
interface ChannelAgg { key: string; total: number; false_alarms: number; false_alarm_rate: number }
interface DashData {
  kpi: { today_alarms: number; today_passages: number; pending_review: number; review_rate: number; total_events: number }
  alarm_trend: TrendBucket[]
  passage_trend: TrendBucket[]
  key_trend: TrendBucket[]
  by_channel: ChannelAgg[]
  by_type: ChannelAgg[]
  overall_rate: number
  feedback: { total_feedback: number; true_positives: number; false_positives: number; unsure: number; annotated_false_rate: number }
  action_latency: { p50_ms: number; p90_ms: number; avg_ms: number; sample_count: number }
}

// ── 状态 ──

const loading = ref(false)
const loadFailed = ref(false)
const lastUpdated = ref('--:--:--')
const dash = ref<DashData | null>(null)
const events = ref<AlarmEvent[]>([])
const devicesOnline = ref(0)
const devicesTotal = ref(0)
const channelsTotal = ref(0)
const listLimit = ref(20)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ── 事件类型名 (SSOT scene metadata) ──

const screeningEventTypes = ref<EventTypeMetadataItem[]>([])
const typeMap = computed(() => {
  const m: Record<string, string> = {}
  screeningEventTypes.value.forEach(t => { m[t.alarm_type] = t.display_name })
  return m
})
function typeName(key: string): string {
  return typeMap.value[key] || key
}

// ── KPI 六卡 ──

const kpiCards = computed(() => {
  const d = dash.value
  const todayKey = todayKeyCount()
  return [
    {
      label: '今日通行', value: fmtNum(d?.kpi.today_passages ?? 0), tone: 'blue', icon: User, alert: false,
      sub: `事件总量 ${fmtNum(d?.kpi.total_events ?? 0)}`,
    },
    {
      label: '今日告警', value: fmtNum(d?.kpi.today_alarms ?? 0), tone: 'red', icon: Bell, alert: (d?.kpi.today_alarms ?? 0) > 0,
      sub: `重点事件今日 ${fmtNum(todayKey)}`,
    },
    {
      label: '待复核', value: fmtNum(d?.kpi.pending_review ?? 0), tone: 'orange', icon: Tickets, alert: (d?.kpi.pending_review ?? 0) > 100,
      sub: `复核率 ${pct(d?.kpi.review_rate ?? 0, 2)}`,
    },
    {
      label: '标注误报率', value: d?.feedback.total_feedback ? pct(d.feedback.annotated_false_rate, 1) : '—', tone: 'purple', icon: TrendCharts, alert: false,
      sub: `已标注 ${d?.feedback.total_feedback ?? 0} 条 (误报 ${d?.feedback.false_positives ?? 0})`,
    },
    {
      label: '设备在线', value: `${devicesOnline.value}/${devicesTotal.value}`, tone: 'green', icon: Monitor,
      alert: devicesTotal.value > 0 && devicesOnline.value < devicesTotal.value,
      sub: `接入通道 ${channelsTotal.value}`,
    },
    {
      label: '联动时延', value: d?.action_latency.sample_count ? `${(d.action_latency.p50_ms).toFixed(1)} ms` : '—', tone: 'teal', icon: Timer, alert: false,
      sub: d?.action_latency.sample_count ? `p90 ${(d.action_latency.p90_ms).toFixed(0)} ms · ${d.action_latency.sample_count} 样本` : '暂无联动样本',
    },
  ]
})

function fmtNum(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`
}

/** 重点事件今日合计 (key_trend 今日小时桶, 真实聚合) */
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

// ── 24h 趋势图 (alarm_trend + passage_trend 按小时桶对齐) ──

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
      {
        name: '通行', type: 'bar', barMaxWidth: 14, data: hrs.map(h => passMap.get(h) ?? 0),
        itemStyle: { color: '#409eff', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: '告警', type: 'bar', barMaxWidth: 14, data: hrs.map(h => alarmMap.get(h) ?? 0),
        itemStyle: { color: '#f56c6c', borderRadius: [3, 3, 0, 0] },
      },
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

const topTypes = computed(() => {
  const list = [...(dash.value?.by_type || [])].sort((a, b) => b.total - a.total).slice(0, 5)
  const max = Math.max(...list.map(t => t.total), 1)
  return list.map(t => ({
    key: t.key, label: typeName(t.key), total: t.total, pct: Math.round(t.total / max * 100),
  }))
})

const feedbackTotal = computed(() => dash.value?.feedback.total_feedback ?? 0)

// ── 动线六分区 (方案 §4; 事件计数来自真实事件流聚合) ──

interface ZoneAlgo {
  name: string
  status: 'green' | 'yellow' | 'red'
  note?: string
}

interface Zone {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  name: string
  status: 'ok' | 'partial' | 'gap'
  statusText: string
  algos: ZoneAlgo[]
  todayCount: number
  lastEventTime: string
}

const zones = ref<Zone[]>([
  {
    id: 'A', name: '入口核验', status: 'ok', statusText: '最强能力域',
    algos: [
      { name: '人证合一 1:1', status: 'green' },
      { name: '黑名单/VIP', status: 'green' },
    ],
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'B', name: '候检排队区', status: 'partial', statusText: '部分覆盖',
    algos: [
      { name: '人群计数', status: 'green' },
      { name: '排队时长', status: 'yellow', note: 'stub 待真实化 (S3-6)' },
      { name: '奔跑/摔倒/打架', status: 'green' },
      { name: '插队检测', status: 'red', note: '缺口 (S3-5)' },
    ],
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'C', name: '通道/闸机', status: 'ok', statusText: '已上线',
    algos: [
      { name: '尾随/翻越', status: 'green' },
      { name: '人包三态', status: 'yellow', note: 'S0 训练收口' },
      { name: '传递物品', status: 'red', note: '需骨架动作 (S3-1)' },
      { name: '闸机 IO 联动', status: 'yellow', note: 'S1-5 待接 IO' },
    ],
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'D', name: '判图区', status: 'partial', statusText: '部分覆盖',
    algos: [
      { name: 'X 光判图', status: 'red', note: 'S2 核心攻坚' },
      { name: '可见光外露违禁品', status: 'yellow', note: '.tmp/weapons 半成品' },
      { name: '判图员合规', status: 'yellow', note: 'symlink 真实化 S1-1' },
      { name: '复检开包溯源', status: 'yellow', note: 'personal_item + ReID 待串' },
    ],
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'E', name: '通行拦截区', status: 'ok', statusText: '已上线',
    algos: [
      { name: '车辆/车牌布控', status: 'green' },
      { name: '遗留物/移走物', status: 'green' },
    ],
    todayCount: 0, lastEventTime: '-',
  },
  {
    id: 'F', name: '事后追溯', status: 'partial', statusText: '部分覆盖',
    algos: [
      { name: '跨镜 ReID', status: 'yellow', note: 'deepsort + OSNet 待产品化 (S3-3)' },
      { name: '录像检索/轨迹回放', status: 'green' },
    ],
    todayCount: 0, lastEventTime: '-',
  },
])

const zoneKeyMap: Record<string, string[]> = {
  A: ['face_blacklist', 'face_stranger', 'face_pass_vip', 'face_liveness_fail'],
  B: ['running', 'fall_detected', 'fighting', 'gathering', 'queue_length_abnormal', 'density_abnormal'],
  C: ['tailgate', 'climbing', 'intrusion', 'tripwire', 'person_with_backpack', 'unattended_baggage'],
  D: ['dangerous_item', 'weapon_detected', 'phone_call', 'smoking', 'sleep_on_duty', 'guard_absence'],
  E: ['abandoned', 'object_removal'],
  F: [],
}

function loadZoneCounts() {
  zones.value.forEach(z => {
    const keys = zoneKeyMap[z.id] || []
    const matched = events.value.filter(e => keys.includes(e.type))
    const now = new Date()
    z.todayCount = matched.filter(e => {
      const d = new Date(e.createdAt)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    }).length
    const latest = matched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    z.lastEventTime = latest ? shortTime(latest.createdAt) : '-'
  })
}

// ── 数据加载 (并行 + 部分失败提示 + 30s 自动刷新) ──

async function loadAll(silent = false) {
  if (!silent) loading.value = true
  const [dashR, devR, evtR] = await Promise.allSettled([
    screeningApi.getScreeningDashboard({ hours: 24, days: 7 }),
    deviceApi.getList({ page: 1, pageSize: 200 }),
    alarmApi.getList({ page: 1, pageSize: 100 }),
  ])
  let failed = 0
  if (dashR.status === 'fulfilled') {
    dash.value = (dashR.value.data?.data as DashData) || null
  } else { failed++; console.error('[ScreeningOverview] dashboard failed', dashR.reason) }
  if (devR.status === 'fulfilled') {
    const items = (devR.value.data?.data as any)?.items || []
    devicesTotal.value = items.length
    devicesOnline.value = items.filter((x: any) => x.status === 'online').length
    channelsTotal.value = items.reduce((s: number, x: any) => s + (x.channelCount || 0), 0)
  } else { failed++; console.error('[ScreeningOverview] devices failed', devR.reason) }
  if (evtR.status === 'fulfilled') {
    const all = (evtR.value.data?.data as any)?.items || []
    const keys = new Set(screeningEventTypes.value.map(t => t.alarm_type))
    // [normalize 修复 2026-09-01] 原始响应字段是 alarm_type (无 type), 直接
    //   keys.has(e.type) 全落空 → 事件恒空; 先走 normalizeAlarmCore (SSOT) 再过滤
    events.value = all.map((e: AlarmEvent) => normalizeAlarmCore(e)).filter(e => keys.has(e.type))
    loadZoneCounts()
  } else { failed++; console.error('[ScreeningOverview] events failed', evtR.reason) }
  loadFailed.value = failed === 3
  if (failed > 0 && !silent) {
    ElMessage.error(`${failed} 个数据源加载失败, 部分指标可能滞后`)
  }
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  lastUpdated.value = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  if (!silent) loading.value = false
}

function loadMore() {
  listLimit.value = Math.min(listLimit.value + 20, events.value.length)
}

// ── 详情抽屉 ──

const detailVisible = ref(false)
const current = ref<AlarmEvent | null>(null)
const detailTitle = computed(() => current.value ? `事件详情 · ${typeName(current.value.type)}` : '事件详情')
function openDetail(row: AlarmEvent) {
  current.value = row
  detailVisible.value = true
}

// ── 工具 ──

function levelClass(level: AlarmLevel): string {
  switch (level) {
    case 'critical': return 'lv-crit'
    case 'high': return 'lv-high'
    case 'medium': return 'lv-med'
    case 'low': return 'lv-low'
    default: return 'lv-info'
  }
}
function levelText(level: AlarmLevel): string {
  return level.toUpperCase()
}
function formatTime(ts?: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function shortTime(ts?: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 初始化 ──

async function loadSceneTypes() {
  try {
    const resp = await eventTypesApi.metadata({ scene: 'security_screening' })
    const data = resp.data?.data
    if (data && data.groups) {
      const items: EventTypeMetadataItem[] = []
      Object.values(data.groups).forEach(g => g.items.forEach(i => items.push(i)))
      screeningEventTypes.value = items
    }
  } catch (e) {
    console.error('[ScreeningOverview] load scene types failed', e)
  }
}

onMounted(async () => {
  await loadSceneTypes()
  await loadAll()
  refreshTimer = setInterval(() => loadAll(true), 30000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.screening-overview { padding: 16px; background: #f5f7fa; min-height: calc(100vh - 84px); }

/* ── 页头 ── */
.ov-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.ov-head-left { display: flex; align-items: baseline; gap: 12px; }
.ov-title { font-size: 20px; font-weight: 700; color: #1f2d3d; letter-spacing: 0.5px; }
.ov-sub { color: #909399; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
.ov-sub-icon { font-size: 12px; cursor: help; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #67c23a; display: inline-block; box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.18); }
.live-dot.stale { background: #f56c6c; box-shadow: 0 0 0 3px rgba(245, 108, 108, 0.18); }
.ov-head-actions { display: flex; gap: 8px; }

/* ── KPI 卡 ── */
.kpi-row { margin-bottom: 14px; }
.kpi-card {
  background: #fff; border-radius: 10px; padding: 16px 14px; display: flex; gap: 12px; align-items: flex-start;
  border: 1px solid #ebeef5; transition: box-shadow 0.2s, transform 0.2s; height: 100%;
}
.kpi-card:hover { box-shadow: 0 6px 18px rgba(31, 45, 61, 0.10); transform: translateY(-2px); }
.kpi-badge {
  width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
  color: #fff; flex-shrink: 0;
}
.badge-blue { background: linear-gradient(135deg, #409eff, #79bbff); }
.badge-red { background: linear-gradient(135deg, #f56c6c, #fab6b6); }
.badge-orange { background: linear-gradient(135deg, #e6a23c, #f3d19e); }
.badge-purple { background: linear-gradient(135deg, #8e6ce0, #c0a3f2); }
.badge-green { background: linear-gradient(135deg, #67c23a, #b3e19d); }
.badge-teal { background: linear-gradient(135deg, #14b8b8, #82dcdc); }
.kpi-main { min-width: 0; }
.kpi-value { font-size: 24px; font-weight: 700; line-height: 30px; font-variant-numeric: tabular-nums; }
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

/* ── 动线六分区 ── */
.zone-tile {
  background: #fafbfc; border-radius: 8px; padding: 12px; margin-bottom: 12px;
  border: 1px solid #ebeef5; transition: box-shadow 0.2s;
}
.zone-tile:hover { box-shadow: 0 4px 12px rgba(31, 45, 61, 0.08); }
.zone-tile.zone-ok { border-left: 4px solid #67c23a; }
.zone-tile.zone-partial { border-left: 4px solid #e6a23c; }
.zone-tile.zone-gap { border-left: 4px solid #f56c6c; }
.zone-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.zone-id { background: #409eff; color: #fff; border-radius: 4px; padding: 1px 7px; font-weight: 700; font-size: 12px; }
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

/* ── 事件表 ── */
.type-cell { display: flex; flex-direction: column; }
.evt-key { color: #909399; font-family: monospace; font-size: 11px; }
.evt-name { color: #303133; }
.level-tag { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.lv-crit { background: #fef0f0; color: #f56c6c; }
.lv-high { background: #fdf6ec; color: #e6a23c; }
.lv-med { background: #ecf5ff; color: #409eff; }
.lv-low { background: #f0f9eb; color: #67c23a; }
.lv-info { background: #f4f4f5; color: #909399; }
.snap-thumb { width: 50px; height: 32px; border-radius: 4px; }
.snap-none { color: #c0c4cc; }
.snap-error { color: #c0c4cc; font-size: 12px; padding: 4px 8px; background: #f5f7fa; border-radius: 4px; }
.pager { text-align: center; padding: 12px 0 0; }
.detail-body { padding: 0 16px; }
.kv-row { display: flex; padding: 8px 0; border-bottom: 1px dashed #ebeef5; }
.kv-row .k { width: 90px; color: #909399; }
.detail-snap { width: 100%; margin-top: 12px; border-radius: 4px; }
</style>
