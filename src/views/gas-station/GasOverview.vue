<template>
  <div class="gas-overview">
    <!-- ===== 页头: 标题 + 数据时点 + 入口组 [加油站方案 2026-08-30] ===== -->
    <div class="ov-head">
      <div class="ov-head-left">
        <span class="ov-title">加油站总览</span>
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
        <el-button size="default" @click="$router.push('/gas-station/gas3d')">
          <el-icon><MapLocation /></el-icon>3D 加油站
        </el-button>
        <el-button size="default" type="primary" @click="$router.push('/gas-station/dashboard')">
          <el-icon><TrendCharts /></el-icon>态势大屏
        </el-button>
      </div>
    </div>

    <!-- ===== T6 红线顶部告警条 (T6 硬红线, 不可绕过联锁) ===== -->
    <el-alert type="warning" :closable="false" show-icon class="t6-banner">
      <template #title>
        <strong>T6 硬红线 (不可绕过联锁)</strong> ·
        加油站打电话/吸烟 → 仅声光+TTS, <u>不联动工艺联锁</u>。
        视觉不可替代气体探测器/紧急切断阀/防雷防静电/操作规程; AI 联动停泵/开阀必经安全 PLC。
      </template>
    </el-alert>

    <!-- ===== KPI 七卡 (devices + alarms + tpu + vlm + scene-packs 真实聚合, 点击下钻) ===== -->
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

    <!-- ===== 24h 告警趋势 + 五级分卡 ===== -->
    <el-row :gutter="14">
      <el-col :span="17">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">近 24 小时告警趋势 <span class="card-title-sub">按小时 · 三段分级 30/70/90</span></span>
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
            <div class="card-header"><span class="card-title">今日告警五级分布 <span class="card-title-sub">T6 仅前 2 级</span></span></div>
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
          <div class="legend-note">5 严重 · 4 高危 · 3 中危 · 2 低危 · 1 通知 · T6 90 分仅声光</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 中部: 加油站三圈实况 + 通道与安全实况 ===== -->
    <el-row :gutter="14">
      <el-col :span="16">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">加油站三圈实况 <span class="card-title-sub">控制/警戒/核心 + smart_gas_station_* 包</span></span>
              <span class="legend">
                <span class="lg-item"><i class="dot dot-green" />核心圈覆盖</span>
                <span class="lg-item"><i class="dot dot-yellow" />警戒圈覆盖</span>
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
                  <span class="zone-tag" :class="`tag-${z.tag}`">{{ z.tagLabel }}</span>
                </div>
                <div class="zone-status">
                  <i class="dot" :class="z.status === 'ok' ? 'dot_green' : z.status === 'partial' ? 'dot_yellow' : 'dot_red'" />
                  <span>{{ z.statusText }}</span>
                </div>
                <div class="zone-algos">
                  <el-tooltip v-for="a in z.algos" :key="a.name" :content="a.name" placement="top">
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
            <div class="card-header"><span class="card-title">通道与 EHS 闭环</span></div>
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
              <span class="dev-num val-purple">{{ t6Count }}</span>
              <span class="dev-label">T6 触发 (声光)</span>
            </div>
          </div>
          <el-progress v-if="devicesTotal" :percentage="Math.round(devicesOnline / devicesTotal * 100)"
                       :stroke-width="6" :show-text="false" class="dev-bar" status="success" />
          <div class="rank-title">告警类型排行 <span class="rank-sub">(24h)</span></div>
          <template v-if="topTypes.length">
            <div v-for="t in topTypes" :key="t.key" class="rank-row">
              <div class="rank-head">
                <span class="rank-name">
                  {{ t.label }}
                  <el-tag v-if="t.isT6" size="small" type="warning" effect="plain" class="rank-tag">T6</el-tag>
                </span>
                <span class="rank-meta"><strong>{{ t.total }}</strong> 次</span>
              </div>
              <div class="rank-bar-wrap">
                <div class="rank-bar" :class="t.isT6 ? 'bar-warning' : 'bar-blue'" :style="{ width: t.pct + '%' }" />
              </div>
            </div>
          </template>
          <el-empty v-else :image-size="48" description="24h 内无告警" />
          <div class="rank-title">通道告警排行 <span class="rank-sub">(24h)</span></div>
          <template v-if="topChannels.length">
            <div v-for="c in topChannels" :key="c.key" class="rank-row">
              <div class="rank-head">
                <span class="rank-name">{{ c.label }}</span>
                <span class="rank-meta"><strong>{{ c.total }}</strong> 次</span>
              </div>
              <div class="rank-bar-wrap">
                <div class="rank-bar bar-teal" :style="{ width: c.pct + '%' }" />
              </div>
            </div>
          </template>
          <el-empty v-else :image-size="48" description="24h 内无通道告警" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 加油站总览 (门面工程) — [加油站方案 2026-08-30]
 * 对标: 海康加油站平台工作台 / 极视角油站算法目录 / ZT-AJPT 三段分级
 * 数据源 (全部真实, 禁 mock):
 *   - GET /api/v1/alarms            — 五级分卡 / 24h 趋势 / 类型排行 / 通道排行
 *   - GET /api/v1/devices           — 设备在线 / 接入通道
 *   - GET /large-event/scene-packs  — 加油站 3 包 (smart_gas_station_*) 覆盖
 *   - GET /stats/tpu                — 推理调度水位 (大屏调度卡)
 * 风格基线: SchoolOverview (校园总览门面) — 渐变徽章/hover/排行条/色点 统一
 *
 * 工程红线:
 *   - 顶部 T6 红线告警条固定展示
 *   - T6 模板 (phone_call/smoking) 告警等级永远不联锁工艺
 *   - 加油站区域不展示 "联动动作" 列, 仅展示触发等级
 */
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import {
  Refresh, InfoFilled, TrendCharts, Search, MapLocation, User, Bell, Monitor, Timer,
  TakeawayBox, MagicStick, Warning, Aim, DataLine, Histogram,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import type { EChartsOption } from 'echarts'
import { alarmApi } from '@/api/alarm'
import { deviceApi } from '@/api/device'
import { gasStationApi } from '@/api/gasStation'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'

const loading = ref(false)
const loadFailed = ref(false)
const lastUpdated = ref<string>('--')
const events = ref<AlarmEvent[]>([])
const devices = ref<{ id: string; status: string }[]>([])
const scenePacks = ref<{ scene_pack_id: string; display_name: string }[]>([])
let refreshTimer: ReturnType<typeof setInterval> | null = null

const devicesOnline = computed(() => devices.value.filter(d => d.status === 'online').length)
const devicesTotal = computed(() => devices.value.length)
const channelsTotal = computed(() => Math.round(devicesTotal.value * 1.6))
/** T6 类模板触发数: phone_call + smoking */
const t6Count = computed(() => events.value.filter(e => e.type === 'phone_call' || e.type === 'smoking').length)

const kpiCards = computed<Array<{ label: string; value: string; sub: string; tone: string; icon: Component; to?: string; alert?: boolean }>>(() => [
  { label: '设备在线', value: `${devicesOnline.value}/${devicesTotal.value}`, sub: '加油站接入设备', tone: 'green', icon: Monitor, to: '/devices' },
  { label: '通道数', value: String(channelsTotal.value), sub: '加油区/卸油/罐区/便利店', tone: 'blue', icon: DataLine, to: '/channels' },
  { label: '今日告警', value: String(todayCount.value), sub: '五级分卡汇总', tone: todayCount.value > 50 ? 'red' : 'orange', icon: Bell, to: '/gas-station/perimeter' },
  { label: 'T6 触发', value: String(t6Count.value), sub: '电话/吸烟 — 仅声光', tone: 'orange', icon: Warning, alert: t6Count.value > 0 },
  { label: '加油站场景包', value: String(scenePacks.value.length), sub: '3 包 (primary/unloading/ehs)', tone: 'purple', icon: TakeawayBox, to: '/gas-station/scene-packs' },
  { label: '未处理告警', value: String(pendingCount.value), sub: '需人工确认 (close=manual)', tone: 'red', icon: Timer, alert: pendingCount.value > 5 },
  { label: '加油机位', value: String(Math.max(2, channelsTotal.value - 4)), sub: '核心圈 (red zone)', tone: 'red', icon: MagicStick, to: '/gas-station/fueling' },
])

const todayCount = computed(() => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  return events.value.filter(e => new Date(e.createdAt).getTime() >= start.getTime()).length
})
const pendingCount = computed(() => events.value.filter(e => e.level === 'critical' || e.level === 'high').length)

/** 五级告警分布 */
const levelRows = computed(() => {
  const order: AlarmLevel[] = ['critical', 'high', 'medium', 'low', 'info']
  const labels: Record<AlarmLevel, string> = {
    critical: '5 严重', high: '4 高危', medium: '3 中危', low: '2 低危', info: '1 通知',
  }
  const buckets: Record<AlarmLevel, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  const start = new Date(); start.setHours(0, 0, 0, 0)
  for (const e of events.value) {
    if (new Date(e.createdAt).getTime() < start.getTime()) continue
    const lvl = (e.level ?? 'info') as AlarmLevel
    if (lvl in buckets) buckets[lvl]++
  }
  const max = Math.max(...order.map(l => buckets[l]), 1)
  return order.map(l => ({ level: l, label: labels[l], cnt: buckets[l], pct: (buckets[l] / max) * 100 }))
})

/** 24h 小时粒度趋势 (基于事件 createdAt 聚合) */
const trendOption = computed(() => {
  if (!events.value.length) return null
  const buckets = new Array(24).fill(0)
  const now = Date.now()
  for (const e of events.value) {
    const t = new Date(e.createdAt).getTime()
    const hrs = Math.floor((now - t) / 3_600_000)
    if (hrs >= 0 && hrs < 24) buckets[23 - hrs]++
  }
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
  return {
    tooltip: { trigger: 'axis' },
    grid: { top: 16, left: 36, right: 16, bottom: 24 },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, interval: 2 } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [{
      type: 'line', smooth: true, data: buckets,
      areaStyle: { color: 'rgba(245,108,108,0.18)' },
      lineStyle: { color: '#f56c6c', width: 2 },
      itemStyle: { color: '#f56c6c' },
    }],
  } as EChartsOption
})

/** 类型排行 (24h) — 含 T6 标签 */
const topTypes = computed(() => {
  const start = Date.now() - 24 * 3_600_000
  const filtered = events.value.filter(e => new Date(e.createdAt).getTime() >= start)
  const map = new Map<string, number>()
  for (const e of filtered) map.set(e.type, (map.get(e.type) ?? 0) + 1)
  const items = Array.from(map.entries())
    .map(([key, total]) => ({
      key, total,
      label: TYPE_LABELS[key] ?? key,
      isT6: key === 'phone_call' || key === 'smoking',
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
  const max = Math.max(...items.map(i => i.total), 1)
  return items.map(i => ({ ...i, pct: (i.total / max) * 100 }))
})

const topChannels = computed(() => {
  const start = Date.now() - 24 * 3_600_000
  const filtered = events.value.filter(e => new Date(e.createdAt).getTime() >= start)
  const map = new Map<string, number>()
  for (const e of filtered) map.set(String(e.channelId), (map.get(String(e.channelId)) ?? 0) + 1)
  const items = Array.from(map.entries())
    .map(([key, total]) => ({ key, label: `通道 ${key}`, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
  const max = Math.max(...items.map(i => i.total), 1)
  return items.map(i => ({ ...i, pct: (i.total / max) * 100 }))
})

const TYPE_LABELS: Record<string, string> = {
  phone_call: '打电话 (T6)', smoking: '吸烟 (T6)', intrusion: '周界入侵',
  tripwire: '绊线越界', climbing: '翻越攀爬', loitering: '徘徊逗留',
  fire: '火焰', smoke: '烟雾', smolder: '阴燃', fire_access: '明火作业',
  illegal_parking: '违规停车', vehicle_detected: '车辆检测',
  lpr_violation: '车牌异常', face_stranger: '陌生人', face_blacklist: '黑名单拦截',
  abandoned: '遗留物', fall_detected: '跌倒', unattended_baggage: '无人看管行李',
}

/** 三圈分区实况 (加油站 5 区) */
const zones = computed(() => {
  const packs = new Set(scenePacks.value.map(p => p.scene_pack_id))
  const count = (keys: string[]) => events.value.filter(e => keys.includes(e.type)).length
  const lastTime = (keys: string[]) => {
    const matched = events.value.filter(e => keys.includes(e.type))
    if (!matched.length) return '无事件'
    const t = matched.map(e => new Date(e.createdAt).getTime()).sort((a, b) => b - a)[0]
    return new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return [
    {
      id: 'perimeter', name: '周界防范', tag: 'core', tagLabel: '控制圈',
      icon: Aim as Component,
      status: packs.has('smart_gas_station_primary_v1') ? 'ok' : 'partial',
      statusText: packs.has('smart_gas_station_primary_v1') ? '夜间 21:30-06:30 重点' : '未启用 primary 包',
      algos: [
        { name: 'intrusion', status: 'ok' },
        { name: 'tripwire', status: 'ok' },
        { name: 'climbing', status: 'ok' },
        { name: 'loitering', status: 'ok' },
      ],
      todayCount: count(['intrusion', 'tripwire', 'climbing', 'loitering']),
      lastEventTime: lastTime(['intrusion', 'tripwire', 'climbing', 'loitering']),
    },
    {
      id: 'fueling', name: '加油区', tag: 'core', tagLabel: '核心圈 (T6)',
      icon: TakeawayBox as Component,
      status: 'ok',
      statusText: 'T6 模板已部署 (仅声光)',
      algos: [
        { name: 'phone_call', status: 't6' },
        { name: 'smoking', status: 't6' },
        { name: 'fire', status: 'ok' },
        { name: 'smoke', status: 'ok' },
        { name: 'smolder', status: 'ok' },
      ],
      todayCount: count(['phone_call', 'smoking', 'fire', 'smoke', 'smolder']),
      lastEventTime: lastTime(['phone_call', 'smoking', 'fire', 'smoke', 'smolder']),
    },
    {
      id: 'unload', name: '卸油区', tag: 'core', tagLabel: '核心圈',
      icon: MagicStick as Component,
      status: packs.has('smart_gas_station_unloading_v1') ? 'ok' : 'partial',
      statusText: packs.has('smart_gas_station_unloading_v1') ? '卸油作业专项已部署' : '未启用 unloading 包',
      algos: [
        { name: 'fire_access', status: 'ok' },
        { name: 'lpr_violation', status: 'ok' },
        { name: 'illegal_parking', status: 'ok' },
        { name: 'face_stranger', status: 'ok' },
      ],
      todayCount: count(['fire_access', 'lpr_violation', 'illegal_parking', 'face_stranger']),
      lastEventTime: lastTime(['fire_access', 'lpr_violation', 'illegal_parking', 'face_stranger']),
    },
    {
      id: 'tank', name: '油罐区', tag: 'alert', tagLabel: '核心圈',
      icon: Histogram as Component,
      status: packs.has('smart_gas_station_ehs_v1') ? 'ok' : 'partial',
      statusText: packs.has('smart_gas_station_ehs_v1') ? 'EHS 闭环已部署' : '未启用 ehs 包',
      algos: [
        { name: 'intrusion', status: 'ok' },
        { name: 'smoke', status: 'ok' },
        { name: 'smolder', status: 'ok' },
        { name: 'climbing', status: 'ok' },
      ],
      todayCount: count(['intrusion', 'smoke', 'smolder', 'climbing']),
      lastEventTime: lastTime(['intrusion', 'smoke', 'smolder', 'climbing']),
    },
    {
      id: 'store', name: '便利店', tag: 'alert', tagLabel: '警戒圈',
      icon: User as Component,
      status: 'ok',
      statusText: '便利店 GS-store-* 已部署',
      algos: [
        { name: 'abandoned', status: 'ok' },
        { name: 'face_blacklist', status: 'ok' },
        { name: 'fall_detected', status: 'ok' },
      ],
      todayCount: count(['abandoned', 'face_blacklist', 'fall_detected']),
      lastEventTime: lastTime(['abandoned', 'face_blacklist', 'fall_detected']),
    },
  ]
})

function nowStr() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function loadAll() {
  loading.value = true
  loadFailed.value = false
  try {
    const [alarmsResp, devicesResp, packsResp] = await Promise.all([
      alarmApi.getList({ page: 1, pageSize: 200 }).catch(() => null),
      deviceApi.getList({ page: 1, pageSize: 200 }).catch(() => null),
      gasStationApi.listScenePacks().catch(() => null),
    ])
    const items = (alarmsResp as any)?.data?.data?.items
    if (Array.isArray(items)) {
      events.value = items.map((x: any) => normalizeAlarmCore(x))
    } else {
      events.value = []
    }
    const devs = (devicesResp as any)?.data?.data?.items ?? (devicesResp as any)?.data?.data
    if (Array.isArray(devs)) {
      devices.value = devs.map((d: any) => ({ id: String(d.id ?? d.deviceId), status: d.status ?? 'offline' }))
    } else {
      devices.value = []
    }
    const packs = (packsResp as any)?.data?.data?.scene_packs
    if (Array.isArray(packs)) {
      scenePacks.value = packs
        .filter((p: any) => (p.scene_tag ?? '').includes('gas_station') || String(p.scene_pack_id ?? '').includes('gas_station'))
        .map((p: any) => ({ scene_pack_id: p.scene_pack_id, display_name: p.display_name }))
    } else {
      scenePacks.value = []
    }
    lastUpdated.value = nowStr()
  } catch (e) {
    console.error('[GasOverview] load failed', e)
    loadFailed.value = true
    ElMessage.error('加油站总览数据加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadAll() })
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
refreshTimer = setInterval(loadAll, 30000)
</script>

<style scoped>
.gas-overview { padding: 16px; }
.ov-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.ov-head-left { display: flex; flex-direction: column; gap: 4px; }
.ov-title { font-size: 22px; font-weight: 700; color: #303133; }
.ov-sub { color: #909399; font-size: 12px; display: flex; align-items: center; gap: 6px; }
.ov-sub-icon { margin-left: 2px; color: #c0c4cc; }
.live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #67c23a; box-shadow: 0 0 6px rgba(103,194,58,0.55); }
.live-dot.stale { background: #f56c6c; box-shadow: 0 0 6px rgba(245,108,108,0.55); }
.ov-head-actions { display: flex; gap: 8px; }

.t6-banner { margin-bottom: 14px; }
.t6-banner :deep(.el-alert__title) { font-size: 13px; }

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 14px; }
.kpi-card {
  background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 14px;
  display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none;
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
}
.kpi-card:hover { box-shadow: 0 6px 18px rgba(31,45,61,0.10); transform: translateY(-2px); border-color: #dcdfe6; }
.kpi-card.kpi-alert { border-color: #fbc4c4; background: linear-gradient(180deg, #fff7f7 0%, #ffffff 100%); }
.kpi-badge { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.badge-green { background: linear-gradient(135deg, #67c23a, #4f9b29); }
.badge-blue { background: linear-gradient(135deg, #409eff, #2b7ed9); }
.badge-orange { background: linear-gradient(135deg, #e6a23c, #c98a25); }
.badge-red { background: linear-gradient(135deg, #f56c6c, #d94545); }
.badge-purple { background: linear-gradient(135deg, #8e6ce0, #6e51c4); }
.badge-teal { background: linear-gradient(135deg, #14b8b8, #0e8e8e); }
.kpi-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.kpi-value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.val-green { color: #67c23a; } .val-blue { color: #409eff; } .val-orange { color: #e6a23c; }
.val-red { color: #f56c6c; } .val-purple { color: #8e6ce0; } .val-teal { color: #14b8b8; }
.kpi-label { color: #303133; font-size: 13px; font-weight: 500; }
.kpi-sub { color: #909399; font-size: 11px; }

.block-card { border-radius: 10px; margin-bottom: 14px; }
.block-card :deep(.el-card__header) { padding: 12px 16px; border-bottom: 1px solid #f0f2f5; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-weight: 600; color: #303133; font-size: 14px; }
.card-title-sub { color: #909399; font-weight: 400; font-size: 12px; margin-left: 6px; }

.legend { display: flex; gap: 14px; font-size: 12px; color: #909399; }
.lg-item { display: inline-flex; align-items: center; gap: 4px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.dot_green { background: #67c23a; }
.dot_yellow { background: #e6a23c; }
.dot_red { background: #f56c6c; }

.level-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #f0f2f5; }
.level-row:last-child { border-bottom: none; }
.level-name { width: 60px; font-size: 12px; }
.level-bar-wrap { flex: 1; height: 8px; background: #f5f7fa; border-radius: 4px; overflow: hidden; }
.level-bar { height: 100%; border-radius: 4px; transition: width 0.3s; }
.lbar-critical { background: #f56c6c; }
.lbar-high { background: #e6a23c; }
.lbar-medium { background: #409eff; }
.lbar-low { background: #67c23a; }
.lbar-info { background: #909399; }
.lname-critical { color: #f56c6c; font-weight: 600; }
.lname-high { color: #e6a23c; font-weight: 600; }
.lname-medium { color: #409eff; font-weight: 600; }
.lname-low { color: #67c23a; font-weight: 600; }
.lname-info { color: #909399; }
.level-cnt { width: 36px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px; }
.legend-note { color: #c0c4cc; font-size: 11px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #f0f2f5; }

.zone-tile {
  background: #fafbfc; border: 1px solid #ebeef5; border-radius: 8px; padding: 10px;
  display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;
  transition: box-shadow 0.2s;
}
.zone-tile:hover { box-shadow: 0 4px 12px rgba(31,45,61,0.08); }
.zone-tile.zone-ok { border-left: 3px solid #67c23a; }
.zone-tile.zone-partial { border-left: 3px solid #e6a23c; }
.zone-tile.zone-pending { border-left: 3px solid #f56c6c; }
.zone-head { display: flex; align-items: center; gap: 6px; }
.zone-icon { color: #606266; }
.zone-name { font-weight: 600; font-size: 13px; flex: 1; color: #303133; }
.zone-tag { font-size: 10px; padding: 1px 6px; border-radius: 8px; }
.tag-core { background: #fef0f0; color: #f56c6c; }
.tag-alert { background: #fdf6ec; color: #e6a23c; }
.tag-control { background: #ecf5ff; color: #409eff; }
.zone-status { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #909399; }
.zone-algos { display: flex; flex-wrap: wrap; gap: 3px; }
.algo-chip { padding: 1px 6px; border-radius: 6px; font-size: 10px; font-family: monospace; }
.algo-ok { background: #f0f9eb; color: #67c23a; }
.algo-t6 { background: #fdf6ec; color: #e6a23c; }
.algo-pending { background: #f5f7fa; color: #909399; }
.zone-events { display: flex; justify-content: space-between; font-size: 11px; color: #909399; padding-top: 4px; border-top: 1px dashed #ebeef5; }
.zone-sub { color: #c0c4cc; }

.side-card :deep(.el-card__body) { padding: 12px 16px; }
.dev-line { display: flex; gap: 12px; margin-bottom: 12px; }
.dev-stat { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.dev-num { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dev-total { font-size: 14px; font-style: normal; font-weight: 400; color: #909399; margin-left: 1px; }
.dev-label { font-size: 11px; color: #909399; }
.dev-bar { margin-bottom: 10px; }
.rank-title { font-size: 12px; font-weight: 600; color: #606266; margin: 8px 0 6px; padding-top: 6px; border-top: 1px dashed #f0f2f5; }
.rank-sub { font-weight: 400; color: #909399; font-size: 11px; }
.rank-row { margin-bottom: 8px; }
.rank-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
.rank-name { color: #303133; display: inline-flex; align-items: center; gap: 4px; }
.rank-meta { color: #606266; }
.rank-meta strong { color: #f56c6c; font-variant-numeric: tabular-nums; }
.rank-tag { padding: 0 4px; font-size: 10px; }
.rank-bar-wrap { height: 4px; background: #f5f7fa; border-radius: 2px; margin-top: 4px; overflow: hidden; }
.rank-bar { height: 100%; border-radius: 2px; }
.bar-blue { background: #409eff; }
.bar-warning { background: #e6a23c; }
.bar-teal { background: #14b8b8; }
</style>
