<template>
  <div class="situation-screen">
    <div class="ss-header">
      <h1>🛡️ 华盾AI 安全态势大屏</h1>
      <div class="ss-header-right">
        <span class="ss-clock">{{ currentTime }}</span>
        <el-tag :type="connected ? 'success' : 'danger'" effect="dark" size="small">
          {{ connected ? '实时在线' : '连接断开' }}
        </el-tag>
      </div>
    </div>

    <div class="ss-body">
      <!-- 左侧面板 -->
      <div class="ss-col left-col">
        <div class="ss-panel">
          <div class="panel-title">📊 安全评分</div>
          <div class="score-gauge" ref="scoreGaugeRef" v-if="!overviewFailed"></div>
          <div v-else class="empty-state error">
            <span>概览数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">🚨 告警趋势 (24h)</div>
          <div class="chart-box" ref="alarmTrendRef" v-if="!hourlyFailed && hourlyData.length"></div>
          <div v-else-if="!hourlyFailed" class="empty-state">暂无时段数据</div>
          <div v-else class="empty-state error">
            <span>时段统计加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">📹 设备状态</div>
          <div class="chart-box" ref="devicePieRef" v-if="!overviewFailed && overview"></div>
          <div v-else-if="!overviewFailed" class="empty-state">暂无设备数据</div>
          <div v-else class="empty-state error">
            <span>设备数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
      </div>

      <!-- 中间地图 -->
      <div class="ss-col center-col">
        <div class="ss-panel map-panel">
          <div class="panel-title">🗺️ 3D 厂区态势地图
            <span style="font-size:11px;color:#9AA0A6;margin-left:8px">拖拽旋转 · 滚轮缩放</span>
          </div>
          <Scene3D v-if="sceneDevices.length" class="scene3d-wrapper" :devices="sceneDevices" :buildings="sceneBuildings" />
          <div v-else-if="devicesFailed" class="empty-state error scene-empty">
            <span>地图设备数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
          <div v-else class="empty-state scene-empty">暂无地图设备</div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">🚨 最新告警</div>
          <div class="alarm-scroll" v-if="!alarmsFailed">
            <div v-for="alarm in latestAlarms" :key="alarm.id"
                 :class="['alarm-row', alarm.level]">
              <span class="alarm-dot"></span>
              <span class="alarm-time">{{ alarm.time }}</span>
              <span class="alarm-location">{{ alarm.location }}</span>
              <span class="alarm-type">{{ alarm.type }}</span>
              <el-tag :type="alarm.status === '已处置' ? 'success' : 'warning'" size="small" effect="dark">
                {{ alarm.status }}
              </el-tag>
            </div>
            <div v-if="!latestAlarms.length" class="empty-state">暂无最新告警</div>
          </div>
          <div v-else class="empty-state error">
            <span>告警数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
      </div>

      <!-- 右侧面板 -->
      <div class="ss-col right-col">
        <div class="ss-panel">
          <div class="panel-title">🥧 告警类型分布</div>
          <div class="chart-box" ref="alarmTypeRef" v-if="!overviewFailed && overview"></div>
          <div v-else-if="!overviewFailed" class="empty-state">暂无告警类型数据</div>
          <div v-else class="empty-state error">
            <span>告警类型数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">🧠 Agent活跃度</div>
          <div class="chart-box" ref="agentBarRef" v-if="!agentsFailed && agentData.length"></div>
          <div v-else-if="!agentsFailed" class="empty-state">暂无Agent数据</div>
          <div v-else class="empty-state error">
            <span>Agent数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">⚡ 今日统计</div>
          <div class="stats-grid" v-if="!overviewFailed">
            <div class="stat-card" v-for="s in todayStats" :key="s.label">
              <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
          <div v-else class="empty-state error">
            <span>今日统计数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts/core'
import { GaugeChart, LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { situationApi, type SituationOverview, type MapDevicePoint, type SituationAlarmStream, type SituationAgentStatus } from '@/api/situation'
import { useWebSocket } from '@/composables/useWebSocket'
import Scene3D from '@/components/Scene3D.vue'

echarts.use([GaugeChart, LineChart, PieChart, BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

// ── WebSocket实时推送 ──
const { connected, subscribe } = useWebSocket('/ws/situation')
let unsubAlarm: (() => void) | null = null

// 时钟
const currentTime = ref('')
let clockTimer: ReturnType<typeof setInterval> | null = null

// ECharts refs
const scoreGaugeRef = ref<HTMLElement>()
const alarmTrendRef = ref<HTMLElement>()
const devicePieRef = ref<HTMLElement>()
const alarmTypeRef = ref<HTMLElement>()
const agentBarRef = ref<HTMLElement>()

// ── 数据状态 ──
interface Alarm { id: string; time: string; location: string; type: string; level: string; status: string }
const latestAlarms = ref<Alarm[]>([])

const todayStats = ref([
  { label: '在线设备', value: '--', color: '#0F9D58' },
  { label: '今日告警', value: '--', color: '#F4B400' },
  { label: '处置率', value: '--', color: '#1A73E8' },
  { label: 'Agent调用', value: '--', color: '#7C3AED' },
])

// ── API 返回的原始数据（用于图表更新） ──
const overview = ref<SituationOverview | null>(null)
const hourlyData = ref<Array<{ hour: number; alarmCount: number; onlineDevices: number }>>([])
const agentData = ref<SituationAgentStatus[]>([])

// 各端点的加载/失败状态（用于显式提示）
const overviewLoading = ref(false)
const overviewFailed = ref(false)
const devicesFailed = ref(false)
const alarmsFailed = ref(false)
const agentsFailed = ref(false)
const hourlyFailed = ref(false)

// ── 3D场景数据 ──
const sceneBuildings = [
  { name: '1号车间', x: -20, z: -15, w: 24, d: 16, h: 8, color: '#1A73E8' },
  { name: '2号车间', x: 15, z: -15, w: 20, d: 14, h: 7, color: '#0F9D58' },
  { name: '仓库', x: -25, z: 15, w: 18, d: 12, h: 6, color: '#F4B400' },
  { name: '办公楼', x: 20, z: 15, w: 16, d: 12, h: 12, color: '#7C3AED' },
  { name: '配电房', x: 35, z: -5, w: 8, d: 8, h: 4, color: '#666666' },
  { name: '门卫室', x: 0, z: 42, w: 6, d: 4, h: 3, color: '#888888' },
]

interface Device3D {
  id: string; name: string; x: number; y: number; z: number
  status: 'online' | 'offline' | 'alarm' | 'maintenance'
  location: string; fov?: number; rotation?: number; alarmType?: string
}
const sceneDevices = ref<Device3D[]>([])

/** 将经纬度映射到3D场景坐标（bounding box 归一化到 [-40, 40]） */
function mapDevicesToScene(points: MapDevicePoint[]): Device3D[] {
  if (!points.length) return []
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  const latRange = maxLat - minLat || 1
  const lngRange = maxLng - minLng || 1
  const SCALE = 40
  return points.map(p => ({
    id: p.id,
    name: p.name,
    x: ((p.lng - minLng) / lngRange - 0.5) * 2 * SCALE,
    y: 4 + (p.status === 'alarming' ? 1 : 0),
    z: ((p.lat - minLat) / latRange - 0.5) * 2 * SCALE,
    status: p.status === 'alarming' ? 'alarm' : p.status,
    location: p.projectName,
    fov: 65,
    rotation: 0,
    alarmType: p.lastAlarmType,
  }))
}

let charts: echarts.ECharts[] = []

function initCharts() {
  // 安全评分仪表盘
  if (scoreGaugeRef.value) {
    const c = echarts.init(scoreGaugeRef.value)
    const score = overview.value?.securityScore?.overall ?? 0
    c.setOption({
      backgroundColor: 'transparent',
      series: [{
        type: 'gauge', startAngle: 200, endAngle: -20,
        pointer: { show: true, length: '60%', width: 4 },
        detail: { formatter: '{value}', fontSize: 32, color: '#E8EAED', offsetCenter: [0, '70%'] },
        data: [{ value: score, name: '安全评分' }],
        axisLine: { lineStyle: { width: 12, color: [[0.3, '#DB4437'], [0.7, '#F4B400'], [1, '#0F9D58']] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        title: { show: true, offsetCenter: [0, '90%'], color: '#9AA0A6', fontSize: 12 },
      }]
    })
    charts.push(c)
  }

  // 告警趋势
  if (alarmTrendRef.value) {
    const c = echarts.init(alarmTrendRef.value)
    const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
    const trendData = hourlyData.value.length
      ? hourlyData.value.map(h => h.alarmCount)
      : Array(24).fill(0)
    c.setOption({
      backgroundColor: 'transparent',
      grid: { left: 36, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: hours, axisLabel: { fontSize: 10, color: '#666' }, axisLine: { lineStyle: { color: '#3C4043' } } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#666' }, splitLine: { lineStyle: { color: '#2D3039' } } },
      series: [{
        type: 'line', data: trendData, smooth: true,
        areaStyle: { color: 'rgba(26,115,232,0.25)' },
        lineStyle: { color: '#1A73E8', width: 2 },
        itemStyle: { color: '#1A73E8' },
      }]
    })
    charts.push(c)
  }

  // 设备饼图
  if (devicePieRef.value) {
    const c = echarts.init(devicePieRef.value)
    const ds = overview.value?.deviceStats
    const online = ds?.online ?? 0
    const offline = (ds?.total ?? 0) - online - (ds?.maintenance ?? 0)
    const maintenance = ds?.maintenance ?? 0
    c.setOption({
      backgroundColor: 'transparent',
      series: [{
        type: 'pie', radius: ['45%', '70%'], center: ['50%', '50%'],
        label: { color: '#9AA0A6', fontSize: 11 },
        data: [
          { value: online, name: '在线', itemStyle: { color: '#0F9D58' } },
          { value: offline, name: '离线', itemStyle: { color: '#DB4437' } },
          { value: maintenance, name: '维护中', itemStyle: { color: '#F4B400' } },
        ]
      }]
    })
    charts.push(c)
  }

  // 告警类型分布
  if (alarmTypeRef.value) {
    const c = echarts.init(alarmTypeRef.value)
    const as = overview.value?.alarmStats
    const alarmTypeData = as
      ? [
          { value: as.critical, name: '严重告警', itemStyle: { color: '#DB4437' } },
          { value: as.high, name: '高级告警', itemStyle: { color: '#F4B400' } },
          { value: as.medium, name: '中级告警', itemStyle: { color: '#1A73E8' } },
          { value: as.low, name: '低级告警', itemStyle: { color: '#7C3AED' } },
        ]
      : []
    c.setOption({
      backgroundColor: 'transparent',
      series: [{
        type: 'pie', radius: ['40%', '65%'], center: ['50%', '50%'],
        roseType: 'radius',
        label: { color: '#9AA0A6', fontSize: 11 },
        data: alarmTypeData,
      }]
    })
    charts.push(c)
  }

  // Agent活跃度柱状图
  if (agentBarRef.value) {
    const c = echarts.init(agentBarRef.value)
    const typeLabels: Record<string, string> = { perception: '感知', analysis: '研判', decision: '决策', expert: '专家' }
    const typeColors: Record<string, string> = { perception: '#0F9D58', analysis: '#1A73E8', decision: '#F4B400', expert: '#7C3AED' }
    const categories = ['perception', 'analysis', 'decision', 'expert']
    const labels = categories.map(t => typeLabels[t] ?? t)
    const values = categories.map(t => {
      const agent = agentData.value.find(a => a.type === t)
      return { value: agent?.calls ?? 0, itemStyle: { color: typeColors[t] ?? '#666' } }
    })
    c.setOption({
      backgroundColor: 'transparent',
      grid: { left: 80, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'value', axisLabel: { color: '#666', fontSize: 10 }, splitLine: { lineStyle: { color: '#2D3039' } } },
      yAxis: { type: 'category', data: labels, axisLabel: { color: '#9AA0A6', fontSize: 11 } },
      series: [{
        type: 'bar',
        data: values,
        barWidth: 16,
        label: { show: true, position: 'right', color: '#9AA0A6', fontSize: 10 },
      }]
    })
    charts.push(c)
  }

  window.addEventListener('resize', handleResize)
}

function handleResize() {
  charts.forEach(c => c?.resize?.())
}

/** 将 SituationAlarmStream 转为模板使用的 Alarm 格式 */
function toAlarm(s: SituationAlarmStream): Alarm {
  return {
    id: s.id,
    time: s.time,
    location: s.deviceName,
    type: s.description,
    level: s.level,
    status: '未处理',
  }
}

/** 加载态势大屏数据（任一端点失败即置 failed 标记，UI 显式空态） */
async function fetchSituationData() {
  overviewLoading.value = true
  overviewFailed.value = false
  devicesFailed.value = false
  alarmsFailed.value = false
  agentsFailed.value = false
  hourlyFailed.value = false

  const results = await Promise.allSettled([
    situationApi.getOverview(),
    situationApi.getMapDevices(),
    situationApi.getRealtimeAlarms({ limit: 20 }),
    situationApi.getAgentStatuses(),
    situationApi.getHourlyStats(),
  ])

  const [overviewRes, devicesRes, alarmsRes, agentsRes, hourlyRes] = results

  // 概览
  if (overviewRes.status === 'fulfilled') {
    const d = overviewRes.value.data?.data
    if (d) {
      overview.value = d
      const ds = d.deviceStats
      const aStats = d.alarmStats
      todayStats.value = [
        { label: '在线设备', value: String(ds?.online ?? 0), color: '#0F9D58' },
        { label: '今日告警', value: String(aStats?.todayTotal ?? 0), color: '#F4B400' },
        { label: '处置率', value: ds?.onlineRate != null ? `${(ds.onlineRate * 100).toFixed(1)}%` : '--', color: '#1A73E8' },
        { label: 'Agent调用', value: d.totalAgents > 0 ? String(d.activeAgents) : '--', color: '#7C3AED' },
      ]
    } else {
      overviewFailed.value = true
    }
  } else {
    overviewFailed.value = true
    const reason = (overviewRes as PromiseRejectedResult).reason
    console.warn('[situation] overview 加载失败:', reason)
  }

  // 地图设备 → 3D场景
  if (devicesRes.status === 'fulfilled') {
    const points = devicesRes.value.data?.data
    if (points?.length) sceneDevices.value = mapDevicesToScene(points)
    else devicesFailed.value = true
  } else {
    devicesFailed.value = true
    console.warn('[situation] map devices 加载失败:', (devicesRes as PromiseRejectedResult).reason)
  }

  // 实时告警
  if (alarmsRes.status === 'fulfilled') {
    const alarms = alarmsRes.value.data?.data
    if (alarms?.length) latestAlarms.value = alarms.map(toAlarm)
    else alarmsFailed.value = true
  } else {
    alarmsFailed.value = true
    console.warn('[situation] alarms 加载失败:', (alarmsRes as PromiseRejectedResult).reason)
  }

  // Agent状态
  if (agentsRes.status === 'fulfilled') {
    const agents = agentsRes.value.data?.data
    if (agents?.length) agentData.value = agents
    else agentsFailed.value = true
  } else {
    agentsFailed.value = true
    console.warn('[situation] agents 加载失败:', (agentsRes as PromiseRejectedResult).reason)
  }

  // 时段统计
  if (hourlyRes.status === 'fulfilled') {
    const hourly = hourlyRes.value.data?.data
    if (hourly?.length) hourlyData.value = hourly
    else hourlyFailed.value = true
  } else {
    hourlyFailed.value = true
    console.warn('[situation] hourly stats 加载失败:', (hourlyRes as PromiseRejectedResult).reason)
  }

  overviewLoading.value = false

  // 关键端点（概览/告警）全失败时给一次性提示
  if (overviewFailed.value && alarmsFailed.value) {
    ElMessage.error('态势大屏核心数据加载失败,请检查后端服务或权限')
  }
}

/** WebSocket 推送新告警时更新列表 */
function onAlarmPush(data: unknown) {
  const raw = data as SituationAlarmStream
  if (raw?.id) {
    latestAlarms.value.unshift(toAlarm(raw))
    if (latestAlarms.value.length > 20) latestAlarms.value.length = 20
  }
}

onMounted(async () => {
  const updateClock = () => {
    currentTime.value = new Date().toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
  updateClock()
  clockTimer = setInterval(updateClock, 1000)

  // 订阅实时告警推送
  unsubAlarm = subscribe('alarm', onAlarmPush)

  // 拉取API数据，完成后初始化图表
  await fetchSituationData()
  await nextTick()
  initCharts()
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (unsubAlarm) unsubAlarm()
  charts.forEach(c => c?.dispose?.())
  charts = []
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.situation-screen {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #0D0F12;
  color: #E8EAED;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ss-header {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background: linear-gradient(180deg, #151820, #0D0F12);
  border-bottom: 1px solid #1E2028;
  flex-shrink: 0;
}

.ss-header h1 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(90deg, #1A73E8, #0F9D58);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.ss-header-right { display: flex; align-items: center; gap: 12px; }
.ss-clock { font-family: 'Roboto Mono', monospace; font-size: 14px; color: #9AA0A6; }

.ss-body {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
  min-height: 0;
}

.ss-col { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; }
.left-col { width: 280px; flex-shrink: 0; flex: none; }
.center-col { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.right-col { width: 280px; flex-shrink: 0; flex: none; }

.ss-panel {
  background: #151820;
  border: 1px solid #1E2028;
  border-radius: 8px;
  overflow: hidden;
}

.panel-title {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #E8EAED;
  border-bottom: 1px solid #1E2028;
}

.chart-box { width: 100%; height: 200px; }
.score-gauge { width: 100%; height: 180px; }
.map-panel { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.scene3d-wrapper { flex: 1; min-height: 320px; position: relative; overflow: hidden; }

/* 告警列表 */
.alarm-scroll {
  max-height: 180px;
  overflow-y: auto;
  padding: 6px;
}
.alarm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  margin-bottom: 2px;
  background: rgba(255,255,255,0.02);
}
.alarm-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.alarm-row.critical .alarm-dot { background: #DB4437; }
.alarm-row.high .alarm-dot { background: #F4B400; }
.alarm-row.medium .alarm-dot { background: #1A73E8; }
.alarm-time { color: #666; font-family: monospace; font-size: 11px; white-space: nowrap; }
.alarm-location { color: #9AA0A6; flex: 1; }
.alarm-type { color: #E8EAED; font-weight: 500; }

/* 统计格子 */
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
.stat-card { text-align: center; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px; }
.stat-value { font-size: 22px; font-weight: 700; }
.stat-label { font-size: 11px; color: #9AA0A6; margin-top: 4px; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #6b7280;
  font-size: 13px;
  min-height: 80px;
}
.empty-state.error { color: #ef4444; }
.scene-empty { min-height: 200px; }
</style>
