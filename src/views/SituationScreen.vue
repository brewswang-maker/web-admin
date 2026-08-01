<template>
  <div class="situation-screen">
    <!-- <div class="ss-header">
      <h1>🛡️ 华盾AI 安全态势大屏</h1>
      <div class="ss-header-right">
        <span class="ss-clock">{{ currentTime }}</span>
        <el-tag :type="connected ? 'success' : 'danger'" effect="dark" size="small">
          {{ connected ? '实时在线' : '连接断开' }}
        </el-tag>
      </div>
    </div> -->

    <div class="ss-body">
      <!-- 左侧面板 -->
      <div class="ss-col left-col">
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-anquanpingfen panel-title-icon" aria-hidden="true"></i>
            <span>安全评分</span>
          </div>
          <div class="score-gauge" ref="scoreGaugeRef" v-if="!overviewFailed && overview"></div>
          <div v-else-if="!overviewFailed" class="empty-state panel-empty">
            <!-- <i class="iconfont1 icon1-anquanpingfen score-empty-icon" aria-hidden="true"></i> -->
            <span>暂无安全评分数据</span>
          </div>
          <div v-else class="empty-state error">
            <span>概览数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-jinritongji panel-title-icon" aria-hidden="true"></i>
            <span>今日统计</span>
          </div>
          <div class="stats-grid" v-if="!overviewFailed && todayStats.length">
            <div class="stat-card" v-for="s in todayStats" :key="s.label">
              <div class="stat-main">
                <i :class="['iconfont1', s.icon, 'stat-icon']" :style="{ color: s.iconColor }" aria-hidden="true"></i>
                <div class="stat-value">
                  {{ s.value }}<span v-if="s.suffix" class="stat-unit">{{ s.suffix }}</span>
                </div>
              </div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
          <div v-else-if="!overviewFailed" class="empty-state panel-empty">暂无今日统计数据</div>
          <div v-else class="empty-state error">
            <span>今日统计数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-shebeizhuangtai panel-title-icon" aria-hidden="true"></i>
            <span>设备状态</span>
          </div>
          <div class="device-status-list" v-if="!overviewFailed && deviceStatusGroups.length" role="list">
            <div
              v-for="device in deviceStatusGroups"
              :key="device.key"
              class="device-status-row"
              role="listitem"
            >
              <div
                :ref="el => setDevicePieRef(el, device.key)"
                class="device-status-pie"
                :aria-label="`${device.label}在线率 ${deviceOnlineRate(device)}%，在线 ${device.online}，离线 ${device.offline}，故障 ${device.fault}`"
                role="img"
              ></div>
              <div class="device-status-info">
                <div class="device-status-heading">
                  <span class="device-status-icon">
                    <i
                      :class="['iconfont1', device.key === 'video-box' ? 'icon1-neicun' : 'icon1-shexiangtou2']"
                      aria-hidden="true"
                    ></i>
                  </span>
                  <span>{{ device.label }}（{{ device.total }}）</span>
                </div>
                <div class="device-status-counts">
                  <span class="device-count online"><i></i>在线：<b>{{ device.online }}</b></span>
                  <span class="device-count offline"><i></i>离线：<b>{{ device.offline }}</b></span>
                  <span class="device-count fault"><i></i>故障：<b>{{ device.fault }}</b></span>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="!overviewFailed" class="empty-state panel-empty">暂无设备数据</div>
          <div v-else class="empty-state error">
            <span>设备数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
      </div>

      <!-- 中间地图 -->
      <div class="ss-col center-col">
        <div class="ss-panel map-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-yuanqu1 panel-title-icon" aria-hidden="true"></i>
            <span>3D 厂区态势地图</span>
            <span style="font-size:12px;color:#236db7;margin-left:8px">拖拽旋转 · 滚轮缩放</span>
          </div>
          <Scene3D v-if="sceneDevices.length" class="scene3d-wrapper" :devices="sceneDevices" :buildings="sceneBuildings" />
          <div v-else-if="devicesFailed" class="empty-state error scene-empty">
            <span>地图设备数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
          <div v-else class="empty-state panel-empty scene-empty">暂无地图设备</div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-gaojing panel-title-icon" aria-hidden="true"></i>
            <span>实时告警</span>
            <button class="alarm-more" type="button" title="进入告警中心" aria-label="进入告警中心" @click="goToAlarms">
              <i class="iconfont1 icon1-zuozuo-" aria-hidden="true"></i>
            </button>
          </div>
          <div class="alarm-table" v-if="!alarmsFailed">
            <div class="alarm-table-row alarm-table-head">
              <span>级别</span>
              <span>抓拍缩略图</span>
              <span>所属分组</span>
              <span>告警类型</span>
              <span>告警时间</span>
              <span>处理状态</span>
              <span>操作</span>
            </div>
            <el-scrollbar class="alarm-scroll">
              <div class="alarm-table-body">
                <div
                  v-for="alarm in latestAlarms"
                  :key="alarm.id"
                  :class="['alarm-table-row', 'alarm-row', alarm.level, { 'is-unhandled': alarm.status === '未处理' }]"
                >
                  <span class="alarm-level"><b>{{ alarmLevelText(alarm.level) }}</b></span>
                  <span class="alarm-snapshot">
                    <el-image
                      v-if="getSnapshotUrl(alarm)"
                      :src="getSnapshotUrl(alarm)"
                      :preview-src-list="getSnapshotUrl(alarm) ? [getSnapshotUrl(alarm)] : []"
                      fit="cover"
                      alt="告警抓拍"
                      preview-teleported
                      hide-on-click-modal
                      @error="onSnapshotError"
                    />
                    <span v-else class="alarm-snapshot-empty" :title="`告警 ${alarm.id} 暂无抓拍图`">
                      <i class="iconfont1 icon1-wushuju" aria-hidden="true"></i>
                    </span>
                  </span>
                  <span class="alarm-location" :title="alarm.location">{{ alarm.location }}</span>
                  <span class="alarm-type" :title="alarm.type">{{ alarm.type }}</span>
                  <span class="alarm-time">{{ alarm.time }}</span>
                  <span class="alarm-status">
                    <el-tag :type="alarm.status === '已处置' ? 'success' : 'warning'" size="small" effect="dark">
                      {{ alarm.status }}
                    </el-tag>
                  </span>
                  <button class="alarm-action" type="button" @click="goToAlarms">
                    {{ alarm.status === '已处置' ? '查看' : '去处警' }}
                  </button>
                </div>
                <div v-if="!latestAlarms.length" class="empty-state panel-empty" style="margin-top:20px;">暂无最新告警</div>
              </div>
            </el-scrollbar>
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
          <div class="panel-title">
            <i class="iconfont1 icon1-zhongguohangtiantubiaoheji-weizhuanlunkuo- panel-title-icon" aria-hidden="true"></i>
            <span>告警类型分布</span>
          </div>
          <div class="chart-box" ref="alarmTypeRef" v-if="!overviewFailed && overview"></div>
          <div v-else-if="!overviewFailed" class="empty-state panel-empty">暂无告警类型数据</div>
          <div v-else class="empty-state error">
            <span>告警类型数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-qushi panel-title-icon" aria-hidden="true"></i>
            <span>告警趋势 (24h)</span>
          </div>
          <div class="chart-box" ref="alarmTrendRef" v-if="!hourlyFailed && hourlyData.length"></div>
          <div v-else-if="!hourlyFailed" class="empty-state panel-empty">暂无时段数据</div>
          <div v-else class="empty-state error">
            <span>时段统计加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-agent panel-title-icon" aria-hidden="true"></i>
            <span>多盒子算力负载活跃度柱状图</span>
          </div>
          <div class="chart-box" ref="agentBarRef" v-if="!agentsFailed && agentData.length"></div>
          <div v-else-if="!agentsFailed" class="empty-state panel-empty">暂无Agent数据</div>
          <div v-else class="empty-state error">
            <span>Agent数据加载失败</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">重试</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts/core'
import { GaugeChart, LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  GraphicComponent, GridComponent, TooltipComponent, LegendComponent, TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { situationApi, type SituationOverview, type MapDevicePoint, type SituationAlarmStream, type SituationAgentStatus } from '@/api/situation'
import { useWebSocket } from '@/composables/useWebSocket'
import Scene3D from '@/components/Scene3D.vue'

echarts.use([GaugeChart, LineChart, PieChart, BarChart, GraphicComponent, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const router = useRouter()

// ── WebSocket实时推送 ──
const { connected, subscribe } = useWebSocket('/ws/situation')
let unsubAlarm: (() => void) | null = null

// 时钟
const currentTime = ref('')
let clockTimer: ReturnType<typeof setInterval> | null = null

// ECharts refs
const scoreGaugeRef = ref<HTMLElement>()
const alarmTrendRef = ref<HTMLElement>()
const alarmTypeRef = ref<HTMLElement>()
const agentBarRef = ref<HTMLElement>()
const devicePieRefs = new Map<string, HTMLElement>()

function setDevicePieRef(el: unknown, key: string) {
  if (el instanceof HTMLElement) devicePieRefs.set(key, el)
  else devicePieRefs.delete(key)
}

// ── 数据状态 ──
interface Alarm {
  id: string
  time: string
  location: string
  type: string
  level: string
  status: string
  snapshotUrl?: string
  /** 后端 metadata 透传: 含 snapshot_base64/snapshot_format, 用于 base64 兜底 */
  metadata?: Record<string, unknown>
}
const latestAlarms = ref<Alarm[]>([])

function goToAlarms() {
  router.push('/alarms')
}

function alarmLevelText(level: string): string {
  return ({ critical: '严重', high: '高', medium: '中', low: '低' } as Record<string, string>)[level] ?? level
}

const todayStats = ref<Array<{ label: string; value: string; suffix: string; icon: string; iconColor: string }>>([])

function formatRate(value: number | null | undefined): string {
  if (value == null) return '--'
  return String(Number(value.toFixed(1)))
}

// ── API 返回的原始数据（用于图表更新） ──
const overview = ref<SituationOverview | null>(null)
const hourlyData = ref<Array<{ hour: number; alarmCount: number; onlineDevices: number }>>([])
const agentData = ref<SituationAgentStatus[]>([])
// 设备状态
interface DeviceStatusGroup {
  key: string
  label: string
  total: number
  online: number
  offline: number
  fault: number
}
const deviceStatusGroups = ref<DeviceStatusGroup[]>([])
const alarmFalsePositiveRate = ref<number | null>(null)

function deviceOnlineRate(device: DeviceStatusGroup): number {
  if (device.total <= 0) return 0
  return Math.round((device.online / device.total) * 100)
}

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
      graphic: [
        {
          type: 'text',
          left: '15%',
          top: '48%',
          silent: true,
          z: 10,
          style: {
            text: '高',
            fill: '#FC4F55',
            font: '600 16px "Microsoft YaHei", sans-serif',
            textVerticalAlign: 'middle',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '6%',
          silent: true,
          z: 10,
          style: {
            text: '中',
            fill: '#FFC569',
            font: '600 16px "Microsoft YaHei", sans-serif',
            textAlign: 'center',
          },
        },
        {
          type: 'text',
          right: '15%',
          top: '48%',
          silent: true,
          z: 10,
          style: {
            text: '低',
            fill: '#42B112',
            font: '600 16px "Microsoft YaHei", sans-serif',
            textVerticalAlign: 'middle',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '80%',
          silent: true,
          z: 10,
          style: {
            text: '扣分明细',
            fill: '#00B4FF',
            font: '500 14px "Microsoft YaHei", sans-serif',
            textAlign: 'center',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '90%',
          silent: true,
          z: 10,
          style: {
            text: '(离线设备、未闭环告警、算法异常)',
            fill: '#00B4FF',
            font: '500 12px "Microsoft YaHei", sans-serif',
            textAlign: 'center',
          },
        },
      ],
      series: [
        {
          type: 'gauge',
          center: ['50%', '54%'],
          radius: '80%',
          min: 0,
          // 仅用于指针视觉角度，中心分数仍显示真实的 0-100 分。
          max: 120,
          splitNumber: 2,
          startAngle: 180,
          endAngle: 0,
          pointer: {
            show: true,
            length: '78%',
            width: 10,
            itemStyle: {
              color: '#00E4FF',
              shadowBlur: 5, // 外发光，匹配你图里的荧光效果
              shadowColor: '#00DFFF'
            },
          },
          anchor: { show: false }, // 隐藏圆心小圆点
          progress: { show: false },// 不开启进度条模式
          roundCap: true, // 弧形条左右两端自动变成半圆圆角
          axisLine: {
            lineStyle: {
              width: 12,// 圆弧厚度12px
              color: [[1, new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: '#FC4F55' },
                { offset: 0.52, color: '#FFC569' },
                { offset: 1, color: '#42B112' },
              ])]],
            },
          },
          axisTick: { show: false },// 隐藏刻度短线
          splitLine: { show: false },// 隐藏分割线
          axisLabel: { show: false },
          detail: { show: false }, // 隐藏仪表盘默认中间数字
          title: { show: false }, // 隐藏仪表盘标题
          data: [{ value: score }],
          z: 2,
        },
        {
          type: 'pie',
          center: ['50%', '52%'],
          radius: ['0%', '43%'],
          silent: true,
          animation: false,
          label: { show: false },
          tooltip: { show: false },
          data: [{ value: 1, itemStyle: { color: '#071A4B' } }],
          z: 3,
        },
        {
          type: 'gauge',
          center: ['50%', '52%'],
          radius: '43%',
          startAngle: 90,
          endAngle: -269.999,
          pointer: { show: false },
          progress: { show: false },
          axisLine: { lineStyle: { width: 2, color: [[1, '#0754A8']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: { show: false },
          detail: {
            show: true,
            offsetCenter: [0, '5%'],
            formatter: (value: number) => `{score|${Math.round(value)}}{unit|分}`,
            rich: {
              score: { color: '#00DFFF', fontSize: 40, fontWeight: 600, lineHeight: 48 },
              unit: { color: '#00DFFF', fontSize: 16, fontWeight: 600, padding: [15, 0, 0, 2] },
            },
          },
          data: [{ value: score }],
          z: 4,
        },
      ],
    })
    charts.push(c)
  }

  // 设备状态环形饼图
  deviceStatusGroups.value.forEach(device => {
    const chartEl = devicePieRefs.get(device.key)
    if (!chartEl) return

    const c = echarts.init(chartEl)
    const onlineRate = deviceOnlineRate(device)
    c.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        confine: false,
        position: ['108%', '6%'],
        formatter: `${device.label}<br/>{b}：{c}（{d}%）`,
        backgroundColor: 'rgba(3, 14, 50, 0.96)',
        borderColor: '#0079AB',
        borderWidth: 1,
        textStyle: { color: '#AADDFF', fontSize: 13 },
        extraCssText: 'z-index: 9999;',
      },
      graphic: [{
        type: 'text',
        left: 'center',
        top: 'middle',
        silent: true,
        style: {
          text: `{value|${onlineRate}}{unit|%}`,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          rich: {
            value: { fill: '#00F333', fontSize: 30, fontWeight: 700 },
            unit: { fill: '#00F333', fontSize: 14, fontWeight: 600, padding: [10, 0, 0, 1] },
          },
        },
      }],
      series: [{
        type: 'pie',
        radius: ['63%', '84%'],
        center: ['50%', '50%'],
        startAngle: 220,
        clockwise: true,
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 4,
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0, 180, 255, 0.35)' },
        },
        data: [
          // 扇区顺序：在线、离线、故障。
          { value: device.online, name: '在线', itemStyle: { color: '#2FC414' } },
          { value: device.offline, name: '离线', itemStyle: { color: '#FC4F55' } },
          { value: device.fault, name: '故障', itemStyle: { color: '#7D817B' } },
        ],
      }],
    })
    charts.push(c)
  })

  // 告警趋势
  if (alarmTrendRef.value) {
    const c = echarts.init(alarmTrendRef.value)
     // 如果接口有小时数据，把每一条的hour补零成 "00:00"、"01:00" ... "23:00"
     // 接口无数据时，自动生成完整24小时时间轴
    const hours = hourlyData.value.length
      ? hourlyData.value.map(item => `${String(item.hour).padStart(2, '0')}:00`)
      : Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
    // 有无数据显示
    const trendData = hourlyData.value.length
      ? hourlyData.value.map(h => h.alarmCount)
      : Array(24).fill(0)

    const alarmStats = overview.value?.alarmStats
    const levelTotals = [
      alarmStats?.critical ?? 0,
      alarmStats?.high ?? 0,
      alarmStats?.medium ?? 0,
      alarmStats?.low ?? 0,
    ]
    // 全部告警求和
    const levelTotal = levelTotals.reduce((sum, value) => sum + value, 0)
    // 占比权重
    const levelWeights = levelTotal
      ? levelTotals.map(value => value / levelTotal)
      : [0.15, 0.25, 0.25, 0.35]
    const levelSeries = [
      { name: '严重', color: '#FC1526', weight: levelWeights[0] ?? 0.15 },
      { name: '高', color: '#F97141', weight: levelWeights[1] ?? 0.25 },
      { name: '中', color: '#FBB040', weight: levelWeights[2] ?? 0.25 },
      { name: '低', color: '#00B4FF', weight: levelWeights[3] ?? 0.35 },
    ]
    c.setOption({
      backgroundColor: 'transparent',
      color: levelSeries.map(item => item.color),
      legend: {
        symbol: 'circle',
        top: 4,
        right: 0,
        itemWidth: 10,    // 宽高保持一致，正圆
        itemHeight: 10,
        itemGap: 14,
        textStyle: { color: '#0079AB', fontSize: 14 },
      },
      grid: { left: 42, right: 16, top: 42, bottom: 28 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: hours,
        axisLabel: { fontSize: 14, color: '#0079AB', interval: 3 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#0079AB' } },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { fontSize: 14, color: '#0079AB' },
        axisTick: { show: false },
        axisLine: { show: false, lineStyle: { color: '#0079AB' } },
        splitLine: { lineStyle: { color: '#0079AB', opacity: 0.35 } },
      },
      series: levelSeries.map(item => ({
        name: item.name,
        type: 'line',
        data: trendData.map(value => Math.round(value * item.weight)),
        smooth: true,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: item.color, width: 2 },
        itemStyle: { color: item.color },
        emphasis: { focus: 'series' },
      })),
    })
    charts.push(c)
  }

  // 告警类型分布
  if (alarmTypeRef.value) {
    const c = echarts.init(alarmTypeRef.value)
    const as = overview.value?.alarmStats
    const alarmTypeTotal = as
      ? as.critical + as.high + as.medium + as.low
      : 0
    const createAlarmTypeItem = (value: number, name: string, color: string) => {
      const percent = alarmTypeTotal > 0 ? (value / alarmTypeTotal) * 100 : 0
      const percentText = String(Number(percent.toFixed(1)))
      return {
        value,
        name,
        itemStyle: { color },
        label: {
          formatter: `{name|${name}}\n{percent|${percentText}%}`,
          rich: {
            name: { color: '#AADDFF', fontSize: 14, lineHeight: 26 },
            percent: { color, fontSize: 16, fontWeight: 600, lineHeight: 26 },
          },
        },
        labelLine: { lineStyle: { color, width: 1.5 } },
      }
    }
    const alarmTypeData = as
      ? [
          createAlarmTypeItem(as.critical, '严重告警', '#FC1526'),
          createAlarmTypeItem(as.high, '高级告警', '#F97141'),
          createAlarmTypeItem(as.medium, '中级告警', '#FBB040'),
          createAlarmTypeItem(as.low, '低级告警', '#00B4FF'),
        ]
      : []
    c.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        confine: false,
        backgroundColor: 'rgba(3, 14, 50, 0.96)',
        borderColor: '#0079AB',
        borderWidth: 1,
        textStyle: { color: '#AADDFF', fontSize: 13 },
        extraCssText: 'z-index: 9999;',
      },
      graphic: alarmFalsePositiveRate.value == null
        ? []
        : [{
            type: 'text',
            left: 'center',
            bottom: 20,
            silent: true,
            style: {
              text: `{label|误报率：}{value|${formatRate(alarmFalsePositiveRate.value)}%}`,
              textAlign: 'center',
              rich: {
                label: { fill: '#AADDFF', fontSize: 16, fontWeight: 500 },
                value: { fill: '#00B4FF', fontSize: 18, fontWeight: 600 },
              },
            },
          }],
      series: [{
        type: 'pie',
        radius: '48%',
        center: ['50%', '43%'],
        startAngle: 90,
        clockwise: true,
        avoidLabelOverlap: true,
        label: {
          show: true,
          position: 'outside',
          alignTo: 'edge',
          edgeDistance: 12,
          bleedMargin: 4,
          distanceToLabelLine: 0,
        },
        labelLine: {
          show: true,
          length: 30,
          length2: 10,
          smooth: false,
        },
        labelLayout: params => {
          const isLeft = params.labelRect.x < c.getWidth() / 2
          const labelX = isLeft ? 12 : c.getWidth() - 12
          const points = params.labelLinePoints
          const labelY = params.labelRect.y + params.labelRect.height / 2
          const lineY = labelY + 2
          if (points?.[1] && points[2]) {
            points[1][1] = lineY
            points[2][0] = labelX
            points[2][1] = lineY
          }
          return {
            x: labelX,
            y: labelY,
            align: isLeft ? 'left' : 'right',
            verticalAlign: 'middle',
            labelLinePoints: points,
          }
        },
        data: alarmTypeData,
      }]
    })
    charts.push(c)
  }

  // 多盒子算力负载活跃度柱状图
  if (agentBarRef.value) {
    const c = echarts.init(agentBarRef.value)
    const labels = agentData.value.map(agent => agent.name)
    const values = agentData.value.map(agent => Math.min(100, Math.max(0, agent.calls ?? 0)))
    c.setOption({
      backgroundColor: 'transparent',
      grid: { left: 54, right: 18, top: 32, bottom: 42 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: value => `${value}%` },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          color: '#00B4FF',
          fontSize: 14,
          interval: 0,
          formatter: (value: string) => value.replace(/\s*Agent$/i, ''),
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#0079AB' } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 20,
        axisLabel: {
          color: '#0079AB',
          fontSize: 14,
          formatter: (value: number) => value === 0 ? '0' : `${value}%`,
        },
        axisTick: { show: true, lineStyle: { color: '#0079AB' } },
        axisLine: { show: true, lineStyle: { color: '#0079AB' } },
        splitLine: { show: false, lineStyle: { color: '#0079AB', opacity: 0.35 } },
      },
      series: [{
        type: 'bar',
        data: values,
        barWidth: 12,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#00B4FF' },
            { offset: 1, color: '#033F6C' },
          ]),
        },
        label: {
          show: true,
          position: 'top',
          color: '#00B4FF',
          fontSize: 14,
          formatter: '{c}%',
        },
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
    // [FIX 2026-07-30] 兼容 snake/camel 双形态, 与 AlarmsView.vue 行为一致
    snapshotUrl: s.snapshotUrl || s.snapshot_url,
    metadata: s.metadata,
  }
}

/** 兜底函数: 返回抓拍图 URL, 优先 snapshotUrl, 其次 metadata.snapshot_base64 dataURL
 *  与 AlarmsView.vue:995-1005 / AlarmPopup.vue:415-433 实现保持一致 */
function getSnapshotUrl(alarm: Alarm): string {
  if (alarm.snapshotUrl) return alarm.snapshotUrl
  const meta = alarm.metadata as { snapshot_base64?: string; snapshot_format?: string } | undefined
  const b64 = meta?.snapshot_base64
  if (!b64) return ''
  if (typeof b64 === 'string' && b64.startsWith('data:')) return b64
  const fmt = meta?.snapshot_format || 'jpg'
  const mime = fmt === 'raw_bgr' ? 'image/bmp' : `image/${fmt}`
  // 补齐 base64 padding (避免 +/= 被转义后导致浏览器拒绝)
  const cleaned = String(b64).replace(/[^A-Za-z0-9+/=]/g, '')
  const fixed = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4)
  return `data:${mime};base64,${fixed}`
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
      const aStats = d.alarmStats
      todayStats.value = [
        { label: '算法启用总数', value: String(d.totalAgents ?? 0), suffix: '', icon: 'icon1-AIsuanfa', iconColor: '#01B9E7' },
        { label: '今日告警总数', value: String(aStats?.todayTotal ?? 0), suffix: '', icon: 'icon1-gaojing', iconColor: '#D13838' },
        // [v8.3 fix] 使用 overview 返回的真实处置率, 不再用 deviceStats.onlineRate (语义错误)
        { label: '告警处置率', value: formatRate(d.handleRate), suffix: d.handleRate != null ? '%' : '', icon: 'icon1-anquanguanli', iconColor: '#3EB011' },
        { label: '边缘算力调用', value: d.totalAgents > 0 ? String(d.activeAgents) : '--', suffix: '', icon: 'icon1-agent', iconColor: '#7938D1' },
      ]

      // [P1-FIX] 从 overview.deviceStats 填充设备状态分组 (之前遗漏导致“暂无设备数据”)
      const ds = d.deviceStats
      if (ds) {
        deviceStatusGroups.value = [{
          key: 'video-box',
          label: '视频设备',
          total: ds.total ?? 0,
          online: ds.online ?? 0,
          offline: ds.offline ?? Math.max(0, (ds.total ?? 0) - (ds.online ?? 0)),
          fault: ds.maintenance ?? 0,
        }]
      }
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

/** 抓拍图加载失败时的兜底 — 自动隐藏并打印 warn, 避免列表卡顿 */
function onSnapshotError(evt: Event) {
  const target = evt.target as HTMLImageElement
  if (target) {
    console.warn(`[situation] 抓拍图加载失败: ${target.src?.slice(0, 80)}...`)
    target.style.display = 'none'
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
  gap: 6px;
  padding: 8px;
  overflow: hidden;
  min-height: 0;
}

.ss-col {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 6px;
  min-height: 0;
  overflow: hidden;
}
.left-col { width: 400px; flex-shrink: 0; flex: none; overflow: hidden; }
.center-col { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.right-col { width: 400px; flex-shrink: 0; flex: none; overflow: hidden; }

.left-col > .ss-panel,
.right-col > .ss-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.center-col > .ss-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.center-col > .map-panel {
  grid-row: span 2;
}

.ss-panel {
  background: #040C2B;
  border: 1px solid #05357C;
  /*border-radius: 8px;*/
  overflow: hidden;
  padding:4px;
  box-shadow: inset 0 0 17px 0px #061e79;
}

.panel-title {
  display: flex;
  align-items: center;
  height: 32px;
  line-height: 32px;
  padding: 0 10px;
  font-size: 14px;
  color: #00B4FF;
  background: linear-gradient(90deg, #003076 0%, rgba(0, 48, 118, 0) 100%);
}

.panel-title-icon {
  font-size: 24px;
  color: #00B4FF;
}

.alarm-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: auto;
  padding: 0;
  border: 0;
  color: #00B4FF;
  background: transparent;
  cursor: pointer;
}

.alarm-more i {
  font-size: 17px;
}

.alarm-more:hover,
.alarm-more:focus-visible {
  color: #00E4FF;
}

.chart-box { width: 100%; height: 200px; padding:10px;box-sizing: border-box;}
.score-gauge { width: 100%; height: 180px; }
.left-col .chart-box,
.left-col .score-gauge,
.right-col .chart-box {
  flex: 1;
  min-height: 0;
  height: auto;
}

.device-status-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
  gap: 16px;
  padding: 10px 18px 12px 22px;
}

.device-status-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  align-items: center;
  column-gap: 20px;
}

.device-status-pie {
  width: 110px;
  height: 110px;
  min-width: 0;
  min-height: 0;
}

.device-status-info {
  min-width: 0;
}

.device-status-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #00B4FF;
  font-size: 18px;
  line-height: 42px;
  white-space: nowrap;
}

.device-status-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid #00B4FF;
  border-radius: 4px;
  color: #00B4FF;
  box-shadow: inset 0 0 8px rgba(0, 180, 255, 0.12);
}

.device-status-icon i {
  font-size: 24px;
}

.device-status-counts {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  white-space: nowrap;
}

.device-count {
  display: inline-flex;
  align-items: center;
  color: #AADDFF;
  font-size: 15px;
  line-height: 24px;
}

.device-count i {
  width: 8px;
  height: 8px;
  margin-right: 6px;
  background: currentColor;
}

.device-count b {
  margin-left: 2px;
  color: #AADDFF;
  font-weight: 500;
}

.device-count.online { color: #17D71E; }
.device-count.offline { color: #FC4F55; }
.device-count.fault { color: #7D817B; }

.map-panel { display: flex; flex-direction: column; min-height: 0; }
.scene3d-wrapper { flex: 1; min-height: 0; position: relative; overflow: hidden; }

/* 告警列表 */
.alarm-scroll {
  flex: 1;
  min-height: 0;
}

.alarm-table {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  padding: 4px 6px 6px;
  color: #0079AB;
}

.alarm-table-row {
  display: grid;
  grid-template-columns: 54px 100px minmax(180px, 1.5fr) minmax(105px, 0.9fr) 150px 88px 70px;
  align-items: center;
}

.alarm-table-row > span,
.alarm-table-row > button {
  display: flex;
  align-self: stretch;
  align-items: center;
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-table-row > :not(:last-child) {
  border-right: 1px solid #00245A;
}

.alarm-table-head {
  flex: 0 0 31px;
  height: 31px;
  color: #AADDFF;
  background: rgba(0, 36, 96, 0.6);
  border: 1px solid #00245A;
  font-size: 14px;
}

.alarm-row {
  min-height: 44px;
  margin-top: -1px;
  border: 1px solid #00245A;
  color: #0079AB;
  background: rgba(4, 24, 64, 0.3);
  font-size: 14px;
  transition: background-color 0.12s ease;
}

.alarm-row:nth-child(odd) {
  background: rgba(3, 14, 50, 0.3);
}

.alarm-row:hover {
  background: rgba(12, 112, 189, 0.3);
}

.alarm-row.is-unhandled {
  color: #FF4747;
}

.alarm-level b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 20px;
  padding: 0 4px;
  border-radius: 2px;
  color: #EAF8FF;
  background: #1676D2;
  font-size: 13px;
  font-weight: 500;
}

.alarm-row.critical .alarm-level b { background: #D51F3D; }
.alarm-row.high .alarm-level b { background: #E85720; }
.alarm-row.medium .alarm-level b { background: #B88D12; }
.alarm-row.low .alarm-level b { background: #1676D2; }

.alarm-snapshot {
  justify-content: center;
}

.alarm-snapshot :deep(.el-image),
.alarm-snapshot-empty {
  display: block;
  width: 56px;
  height: 36px;
}

.alarm-snapshot :deep(.el-image) {
  cursor: zoom-in;
}

.alarm-time {
  font-variant-numeric: tabular-nums;
}

.alarm-status :deep(.el-tag) {
  height: auto;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font-size: 14px;
}

.alarm-action {
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.alarm-action:hover,
.alarm-action:focus-visible {
  color: #00E4FF;
}

.alarm-scroll :deep(.el-scrollbar__bar.is-vertical) {
  width: 4px;
  right: 1px;
}

.alarm-scroll :deep(.el-scrollbar__bar.is-horizontal) {
  height: 4px;
  bottom: 1px;
}

.alarm-scroll :deep(.el-scrollbar__thumb) {
  border-radius: 2px;
  background-color: #059EF4;
}

.alarm-scroll :deep(.el-scrollbar__bar.is-vertical .el-scrollbar__thumb) {
  min-height: 40px;
}

/* 统计格子 */
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
.left-col .stats-grid { flex: 1; grid-template-rows: repeat(2, minmax(0, 1fr)); min-height: 0; }
.stat-card { text-align: center; padding: 6px 2px; background: transparent; }
.left-col .stat-card { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 0; }
.stat-main { display: flex; align-items: center;width: 50%; }
.stat-icon { flex: 0 0 auto; font-size: 50px;line-height: 30px;width: 28px;height: 30px;text-align: center;margin-right: 20px; }
.stat-value { color: #00DFFA; font-size: 32px; font-weight: 600; height:30px; line-height: 30px; }
.stat-unit { margin-left: 1px; font-size: 16px; font-weight: 600; }
.stat-label { margin-top:10px;color: #00B4FF; font-size: 14px;  white-space: nowrap; }

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
.panel-empty {
  flex: 1;
  min-height: 0;
  padding: 0;
  color: #4F8DBD;
  font-size: 14px;
}
.empty-state.error { color: #ef4444; }
.scene-empty { min-height: 200px; }
</style>
