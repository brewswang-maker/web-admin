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
          <div class="score-gauge" ref="scoreGaugeRef"></div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">🚨 告警趋势 (24h)</div>
          <div class="chart-box" ref="alarmTrendRef"></div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">📹 设备状态</div>
          <div class="chart-box" ref="devicePieRef"></div>
        </div>
      </div>

      <!-- 中间地图 -->
      <div class="ss-col center-col">
        <div class="ss-panel map-panel">
          <div class="panel-title">🗺️ 3D 厂区态势地图
            <span style="font-size:11px;color:#9AA0A6;margin-left:8px">拖拽旋转 · 滚轮缩放</span>
          </div>
          <Scene3D class="scene3d-wrapper" :devices="sceneDevices" :buildings="sceneBuildings" />
        </div>
        <div class="ss-panel">
          <div class="panel-title">🚨 最新告警</div>
          <div class="alarm-scroll">
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
          </div>
        </div>
      </div>

      <!-- 右侧面板 -->
      <div class="ss-col right-col">
        <div class="ss-panel">
          <div class="panel-title">🥧 告警类型分布</div>
          <div class="chart-box" ref="alarmTypeRef"></div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">🧠 Agent活跃度</div>
          <div class="chart-box" ref="agentBarRef"></div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">⚡ 今日统计</div>
          <div class="stats-grid">
            <div class="stat-card" v-for="s in todayStats" :key="s.label">
              <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
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

// ── Fallback 假数据（API 不可用时使用，确保大屏始终有内容展示） ──
const fallbackOverview: SituationOverview = {
  securityScore: { overall: 85, trend: 2 },
  systemHealth: { apiLatency: 12, dbLatency: 3, cacheHitRate: 0.95, uptime: 864000, version: '7.0.0' },
  deviceStats: { total: 132, online: 128, offline: 3, maintaining: 0, maintenance: 1, onlineRate: 0.97, alarming: 1 },
  alarmStats: { total: 156, critical: 4, high: 8, medium: 7, low: 4, todayTotal: 23 },
  totalAgents: 4,
  activeAgents: 4,
}
const fallbackHourlyData = Array.from({ length: 24 }, (_, i) => ({
  hour: i,
  alarmCount: [2, 1, 0, 1, 0, 3, 5, 8, 12, 9, 7, 6, 8, 10, 11, 9, 6, 4, 7, 8, 5, 3, 2, 1][i],
  onlineDevices: 128,
}))
const fallbackAgentData: SituationAgentStatus[] = [
  { name: '感知Agent', type: 'perception', status: 'active', calls: 1245, avgLatency: 32, lastActiveAt: '' },
  { name: '研判Agent', type: 'analysis', status: 'active', calls: 892, avgLatency: 45, lastActiveAt: '' },
  { name: '决策Agent', type: 'decision', status: 'active', calls: 456, avgLatency: 28, lastActiveAt: '' },
  { name: '专家Agent', type: 'expert', status: 'idle', calls: 67, avgLatency: 15, lastActiveAt: '' },
]
const fallbackAlarms: Alarm[] = Array.from({ length: 8 }, (_, i) => {
  const types = ['周界入侵', '安全帽未佩戴', '人员聚集', '烟火检测', '绊线告警', '离岗检测']
  const locations = ['3号厂区东围墙', '2号车间入口', '1号大门', '仓库区域', '停车场B区']
  const levels = ['critical', 'high', 'medium']
  const now = new Date()
  now.setMinutes(now.getMinutes() - i * 15)
  return {
    id: `a${i}`,
    time: now.toLocaleTimeString('zh-CN', { hour12: false }),
    location: locations[i % locations.length],
    type: types[i % types.length],
    level: levels[i % levels.length],
    status: i < 3 ? '已处置' : '未处理',
  }
})

// ── API 返回的原始数据（用于图表更新） ──
const overview = ref<SituationOverview | null>(null)
const hourlyData = ref<Array<{ hour: number; alarmCount: number; onlineDevices: number }>>([])
const agentData = ref<SituationAgentStatus[]>([])

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

// Fallback 3D 设备数据（API不可用时展示）
const fallbackDevices: Device3D[] = [
  { id: 'cam1', name: 'CAM_01 东门', x: -40, y: 4, z: -35, status: 'online', location: '1号厂区东门', fov: 60, rotation: 0 },
  { id: 'cam2', name: 'CAM_02 围墙北', x: 20, y: 4, z: -38, status: 'online', location: '北围墙', fov: 75, rotation: Math.PI / 4 },
  { id: 'cam3', name: 'CAM_03 车间A', x: -15, y: 5, z: 5, status: 'online', location: '2号车间入口', fov: 60, rotation: Math.PI / 2 },
  { id: 'cam4', name: 'CAM_04 车间B', x: 25, y: 5, z: 10, status: 'alarm', location: '3号厂区东围墙', alarmType: '周界入侵', fov: 65, rotation: -Math.PI / 3 },
  { id: 'cam5', name: 'CAM_05 仓库', x: -30, y: 4, z: 20, status: 'online', location: '仓库区域', fov: 70, rotation: Math.PI },
  { id: 'cam6', name: 'CAM_06 停车场', x: 35, y: 4, z: 25, status: 'online', location: '停车场B区', fov: 80, rotation: Math.PI / 6 },
  { id: 'cam7', name: 'CAM_07 大门', x: 0, y: 5, z: 40, status: 'online', location: '1号大门', fov: 60, rotation: Math.PI },
  { id: 'cam8', name: 'CAM_08 办公楼', x: -35, y: 6, z: -10, status: 'maintenance', location: '办公楼', fov: 55, rotation: -Math.PI / 2 },
  { id: 'cam9', name: 'CAM_09 配电房', x: 40, y: 4, z: -15, status: 'offline', location: '配电房', fov: 60, rotation: 0 },
  { id: 'cam10', name: 'CAM_10 围墙南', x: -10, y: 4, z: 38, status: 'online', location: '南围墙', fov: 75, rotation: Math.PI },
]

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

/** 当 API 全部不可用时，使用 fallback 假数据确保大屏始终有内容 */
function applyFallbackData() {
  if (!overview.value) {
    overview.value = fallbackOverview
    const ds = fallbackOverview.deviceStats
    const aStats = fallbackOverview.alarmStats
    todayStats.value = [
      { label: '在线设备', value: String(ds.online), color: '#0F9D58' },
      { label: '今日告警', value: String(aStats.todayTotal), color: '#F4B400' },
      { label: '处置率', value: `${(ds.onlineRate * 100).toFixed(1)}%`, color: '#1A73E8' },
      { label: 'Agent调用', value: String(fallbackOverview.totalAgents), color: '#7C3AED' },
    ]
  }
  if (!sceneDevices.value.length) sceneDevices.value = fallbackDevices
  if (!latestAlarms.value.length) latestAlarms.value = fallbackAlarms
  if (!agentData.value.length) agentData.value = fallbackAgentData
  if (!hourlyData.value.length) hourlyData.value = fallbackHourlyData
}

async function fetchSituationData() {
  try {
    const [overviewRes, devicesRes, alarmsRes, agentsRes, hourlyRes] = await Promise.allSettled([
      situationApi.getOverview(),
      situationApi.getMapDevices(),
      situationApi.getRealtimeAlarms({ limit: 20 }),
      situationApi.getAgentStatuses(),
      situationApi.getHourlyStats(),
    ])

    // 概览数据
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
      }
    }

    // 地图设备 → 3D场景
    if (devicesRes.status === 'fulfilled') {
      const points = devicesRes.value.data?.data
      if (points?.length) {
        sceneDevices.value = mapDevicesToScene(points)
      }
    }

    // 实时告警
    if (alarmsRes.status === 'fulfilled') {
      const alarms = alarmsRes.value.data?.data
      if (alarms?.length) {
        latestAlarms.value = alarms.map(toAlarm)
      }
    }

    // Agent状态
    if (agentsRes.status === 'fulfilled') {
      const agents = agentsRes.value.data?.data
      if (agents?.length) agentData.value = agents
    }

    // 时段统计
    if (hourlyRes.status === 'fulfilled') {
      const hourly = hourlyRes.value.data?.data
      if (hourly?.length) hourlyData.value = hourly
    }
  } catch { /* keep defaults */ }

  // API 返回空数据时，使用 fallback 确保大屏始终有内容展示
  applyFallbackData()
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
</style>
