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
          <Scene3D class="scene3d-wrapper" :devices="sceneDevices as any" :buildings="sceneBuildings" />
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
import { statsHttp } from '@/api/http'
import { useWebSocket } from '@/composables/useWebSocket'
import Scene3D from '@/components/Scene3D.vue'

echarts.use([GaugeChart, LineChart, PieChart, BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

// WebSocket实时推送
const { connected } = useWebSocket('/ws/situation')

// 时钟
const currentTime = ref('')
let clockTimer: ReturnType<typeof setInterval> | null = null

// ECharts refs
const scoreGaugeRef = ref<HTMLElement>()
const alarmTrendRef = ref<HTMLElement>()
const devicePieRef = ref<HTMLElement>()
const alarmTypeRef = ref<HTMLElement>()
const agentBarRef = ref<HTMLElement>()

// 数据
interface Alarm { id: string; time: string; location: string; type: string; level: string; status: string }
const latestAlarms = ref<Alarm[]>([])

const todayStats = ref([
  { label: '在线设备', value: '128', color: '#0F9D58' },
  { label: '今日告警', value: '23', color: '#F4B400' },
  { label: '处置率', value: '96.5%', color: '#1A73E8' },
  { label: 'Agent调用', value: '2,660', color: '#7C3AED' },
])

// ── 3D场景数据 ──
const sceneBuildings = [
  { name: '1号车间', x: -20, z: -15, w: 24, d: 16, h: 8, color: '#1A73E8' },
  { name: '2号车间', x: 15, z: -15, w: 20, d: 14, h: 7, color: '#0F9D58' },
  { name: '仓库', x: -25, z: 15, w: 18, d: 12, h: 6, color: '#F4B400' },
  { name: '办公楼', x: 20, z: 15, w: 16, d: 12, h: 12, color: '#7C3AED' },
  { name: '配电房', x: 35, z: -5, w: 8, d: 8, h: 4, color: '#666666' },
  { name: '门卫室', x: 0, z: 42, w: 6, d: 4, h: 3, color: '#888888' },
]

const sceneDevices = ref([
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
])

let charts: any[] = []

function initCharts() {
  // 安全评分仪表盘
  if (scoreGaugeRef.value) {
    const c = echarts.init(scoreGaugeRef.value)
    c.setOption({
      backgroundColor: 'transparent',
      series: [{
        type: 'gauge', startAngle: 200, endAngle: -20,
        pointer: { show: true, length: '60%', width: 4 },
        detail: { formatter: '{value}', fontSize: 32, color: '#E8EAED', offsetCenter: [0, '70%'] },
        data: [{ value: 85, name: '安全评分' }],
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
    const data = [2, 1, 0, 1, 0, 3, 5, 8, 12, 9, 7, 6, 8, 10, 11, 9, 6, 4, 7, 8, 5, 3, 2, 1]
    c.setOption({
      backgroundColor: 'transparent',
      grid: { left: 36, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: hours, axisLabel: { fontSize: 10, color: '#666' }, axisLine: { lineStyle: { color: '#3C4043' } } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#666' }, splitLine: { lineStyle: { color: '#2D3039' } } },
      series: [{
        type: 'line', data, smooth: true,
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
    c.setOption({
      backgroundColor: 'transparent',
      series: [{
        type: 'pie', radius: ['45%', '70%'], center: ['50%', '50%'],
        label: { color: '#9AA0A6', fontSize: 11 },
        data: [
          { value: 128, name: '在线', itemStyle: { color: '#0F9D58' } },
          { value: 3, name: '离线', itemStyle: { color: '#DB4437' } },
          { value: 1, name: '维护中', itemStyle: { color: '#F4B400' } },
        ]
      }]
    })
    charts.push(c)
  }

  // 告警类型分布
  if (alarmTypeRef.value) {
    const c = echarts.init(alarmTypeRef.value)
    c.setOption({
      backgroundColor: 'transparent',
      series: [{
        type: 'pie', radius: ['40%', '65%'], center: ['50%', '50%'],
        roseType: 'radius',
        label: { color: '#9AA0A6', fontSize: 11 },
        data: [
          { value: 40, name: '周界入侵', itemStyle: { color: '#DB4437' } },
          { value: 30, name: '行为分析', itemStyle: { color: '#F4B400' } },
          { value: 20, name: '安全合规', itemStyle: { color: '#1A73E8' } },
          { value: 10, name: '交通违章', itemStyle: { color: '#7C3AED' } },
        ]
      }]
    })
    charts.push(c)
  }

  // Agent活跃度柱状图
  if (agentBarRef.value) {
    const c = echarts.init(agentBarRef.value)
    c.setOption({
      backgroundColor: 'transparent',
      grid: { left: 80, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'value', axisLabel: { color: '#666', fontSize: 10 }, splitLine: { lineStyle: { color: '#2D3039' } } },
      yAxis: { type: 'category', data: ['元认知', '执行', '决策', '研判', '感知'], axisLabel: { color: '#9AA0A6', fontSize: 11 } },
      series: [{
        type: 'bar',
        data: [
          { value: 67, itemStyle: { color: '#7C3AED' } },
          { value: 456, itemStyle: { color: '#0F9D58' } },
          { value: 892, itemStyle: { color: '#F4B400' } },
          { value: 1245, itemStyle: { color: '#1A73E8' } },
        ],
        barWidth: 16,
        label: { show: true, position: 'right', color: '#9AA0A6', fontSize: 10 },
      }]
    })
    charts.push(c)
  }

  // resize handler
  window.addEventListener('resize', handleResize)
}

function handleResize() {
  charts.forEach(c => c?.resize?.())
}

// 初始化告警数据
function initAlarms() {
  const types = ['周界入侵', '安全帽未佩戴', '人员聚集', '烟火检测', '绊线告警', '离岗检测']
  const locations = ['3号厂区东围墙', '2号车间入口', '1号大门', '仓库区域', '停车场B区']
  const levels = ['critical', 'high', 'medium']
  const statuses = ['已处置', '未处理']
  latestAlarms.value = Array.from({ length: 8 }, (_, i) => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - i * 15)
    return {
      id: `a${i}`,
      time: now.toLocaleTimeString('zh-CN', { hour12: false }),
      location: locations[i % locations.length],
      type: types[i % types.length],
      level: levels[i % levels.length],
      status: statuses[i % statuses.length],
    }
  })
}

async function fetchSituationData() {
  try {
    const { data } = await statsHttp.get('/situation')
    const d = data?.data || data
    if (d?.todayStats) todayStats.value = d.todayStats
    if (d?.alarms) latestAlarms.value = d.alarms
  } catch { /* keep defaults */ }
}

onMounted(() => {
  const updateClock = () => {
    currentTime.value = new Date().toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
  updateClock()
  clockTimer = setInterval(updateClock, 1000)

  initAlarms()
  fetchSituationData()

  nextTick(() => initCharts())
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  charts.forEach(c => c?.dispose?.())
  charts = []
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.situation-screen {
  height: 100vh;
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
}

.ss-col { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.left-col { width: 280px; flex-shrink: 0; }
.center-col { flex: 1; min-width: 0; min-height: 0; }
.right-col { width: 280px; flex-shrink: 0; }

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
.scene3d-wrapper { flex: 1; min-height: 320px; position: relative; }

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
