<template>
  <div class="situation-screen">
    <!-- 全屏模式头部 -->
    <div class="screen-header" v-if="!isFullscreen">
      <h2>📊 3D 态势大屏</h2>
      <div class="header-actions">
        <el-button @click="enterFullscreen">
          <el-icon><FullScreen /></el-icon>全屏
        </el-button>
        <el-button @click="refreshData">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <!-- 主屏幕内容 -->
    <div class="screen-body" :class="{ fullscreen: isFullscreen }">
      <!-- 退出全屏 -->
      <div v-if="isFullscreen" class="exit-fullscreen">
        <el-button @click="exitFullscreen" link>
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <!-- 顶部统计条 -->
      <div class="top-stats">
        <div class="stat-item">
          <div class="stat-icon blue"><el-icon><Monitor /></el-icon></div>
          <div class="stat-info">
            <div class="stat-num">{{ deviceStore.stats?.total ?? 0 }}</div>
            <div class="stat-label">设备总数</div>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-icon green"><el-icon><CircleCheck /></el-icon></div>
          <div class="stat-info">
            <div class="stat-num">{{ deviceStore.stats?.onlineRate ?? 0 }}%</div>
            <div class="stat-label">在线率</div>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-icon orange"><el-icon><WarningFilled /></el-icon></div>
          <div class="stat-info">
            <div class="stat-num">{{ alarmStats?.total ?? 0 }}</div>
            <div class="stat-label">今日告警</div>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-icon purple"><el-icon><Cpu /></el-icon></div>
          <div class="stat-info">
            <div class="stat-num">{{ systemHealth?.apiLatency ?? 0 }}ms</div>
            <div class="stat-label">平均延迟</div>
          </div>
        </div>
      </div>

      <!-- 中间地图 + 侧边栏 -->
      <div class="screen-main">
        <!-- 左侧面板 -->
        <div class="side-panel left-panel">
          <div class="panel-card">
            <div class="panel-title">🟣 Agent 实时状态</div>
            <div class="agent-row" v-for="a in agentList" :key="a.name">
              <span class="agent-name">{{ a.name }}</span>
              <span class="agent-status" :class="a.status">{{ a.status === 'active' ? '活跃' : '休眠' }}</span>
              <span class="agent-calls">{{ a.calls }}/s</span>
            </div>
          </div>
          <div class="panel-card">
            <div class="panel-title">🔴 实时告警流</div>
            <div class="alarm-stream">
              <div v-for="a in recentAlarms" :key="a.id" class="alarm-item">
                <span class="alarm-level" :class="a.level">{{ alarmLevelIcon(a.level) }}</span>
                <span class="alarm-msg">{{ a.description }}</span>
                <span class="alarm-time">{{ a.time }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 中央地图 -->
        <div class="map-container">
          <div class="map-placeholder">
            <div class="map-grid">
              <!-- 模拟园区地图和设备点位 -->
              <div class="map-area park">
                <div class="area-label">🏢 智慧园区</div>
                <div class="device-dot" v-for="i in 4" :key="'park-'+i"
                  :class="['dot-'+i, i === 3 ? 'alarming' : 'online']"
                  :style="getDotPosition('park', i)">
                  <span class="dot-tooltip">IPC-A{{i}} ({{ i === 3 ? '告警' : '在线' }})</span>
                </div>
              </div>
              <div class="map-area construction">
                <div class="area-label">🏗️ 智慧工地</div>
                <div class="device-dot" v-for="i in 3" :key="'cons-'+i"
                  :class="['dot-'+i, 'online']"
                  :style="getDotPosition('construction', i)">
                  <span class="dot-tooltip">IPC-B{{i}} (在线)</span>
                </div>
              </div>
              <div class="map-area parking">
                <div class="area-label">🅿️ 停车场</div>
                <div class="device-dot" v-for="i in 2" :key="'parking-'+i"
                  :class="['dot-'+i, i === 1 ? 'offline' : 'online']"
                  :style="getDotPosition('parking', i)">
                  <span class="dot-tooltip">IPC-C{{i}} ({{ i === 1 ? '离线' : '在线' }})</span>
                </div>
              </div>
              <!-- 围墙线 -->
              <svg class="perimeter-line" viewBox="0 0 800 500">
                <line x1="150" y1="100" x2="350" y2="100" stroke="#1890ff" stroke-width="2" stroke-dasharray="8,4" />
                <line x1="350" y1="100" x2="350" y2="300" stroke="#1890ff" stroke-width="2" stroke-dasharray="8,4" />
                <line x1="150" y1="100" x2="150" y2="300" stroke="#1890ff" stroke-width="2" stroke-dasharray="8,4" />
                <line x1="150" y1="300" x2="350" y2="300" stroke="#1890ff" stroke-width="2" stroke-dasharray="8,4" />
              </svg>
            </div>
            <div class="map-legend">
              <span><span class="dot online"></span>在线</span>
              <span><span class="dot offline"></span>离线</span>
              <span><span class="dot alarming"></span>告警</span>
            </div>
          </div>
        </div>

        <!-- 右侧面板 -->
        <div class="side-panel right-panel">
          <div class="panel-card">
            <div class="panel-title">📋 项目概览</div>
            <div v-for="p in projectOverview" :key="p.name" class="project-row">
              <span class="proj-name">{{ p.name }}</span>
              <el-progress :percentage="p.rate" :color="p.rate >= 95 ? '#52c41a' : p.rate >= 80 ? '#faad14' : '#f5222d'" :stroke-width="6" />
              <span class="proj-rate">{{ p.rate }}%</span>
            </div>
          </div>
          <div class="panel-card">
            <div class="panel-title">🛡️ 系统健康</div>
            <div class="health-grid">
              <div v-for="s in serviceStatuses" :key="s.name" class="health-item">
                <span class="health-dot" :class="s.status"></span>
                <span class="health-name">{{ s.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useDeviceStore } from '@/stores/device'
import { useCloudStore } from '@/stores/cloud'
import type { AlarmStats, SystemHealth } from '@/types/analytics'

const deviceStore = useDeviceStore()
const cloudStore = useCloudStore()

const isFullscreen = ref(false)
const alarmStats = ref<AlarmStats | null>(null)
const systemHealth = ref<SystemHealth | null>(null)

const agentList = [
  { name: '感知Agent', status: 'active', calls: 12 },
  { name: '研判Agent', status: 'active', calls: 8 },
  { name: '决策Agent', status: 'active', calls: 5 },
  { name: '元认知Agent', status: 'idle', calls: 1 },
  { name: '专家Agent-1', status: 'idle', calls: 0 }
]

const recentAlarms = ref([
  { id: 1, level: 'critical', description: '东门围栏入侵告警', time: '14:32:15' },
  { id: 2, level: 'high', description: 'B区烟雾传感器触发', time: '14:30:42' },
  { id: 3, level: 'medium', description: '停车场徘徊行为检测', time: '14:28:10' },
  { id: 4, level: 'low', description: '南门人脸未注册', time: '14:25:33' },
  { id: 5, level: 'critical', description: '化工厂区域温度异常', time: '14:20:01' }
])

const projectOverview = [
  { name: '智慧园区', rate: 98 },
  { name: '智慧工地', rate: 96 },
  { name: '停车场', rate: 100 },
  { name: '商场客流', rate: 100 },
  { name: '化工厂', rate: 89 }
]

const serviceStatuses = [
  { name: 'API网关', status: 'up' },
  { name: '设备服务', status: 'up' },
  { name: '告警服务', status: 'up' },
  { name: 'AI引擎', status: 'up' },
  { name: '消息队列', status: 'up' },
  { name: 'Redis', status: 'up' },
  { name: 'PostgreSQL', status: 'up' },
  { name: 'Milvus', status: 'degraded' },
  { name: 'Neo4j', status: 'up' }
]

function alarmLevelIcon(level: string) {
  const m: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }
  return m[level] ?? '⚪'
}

function getDotPosition(area: string, index: number) {
  const positions: Record<string, Record<number, { left: string; top: string }>> = {
    park: { 1: { left: '25%', top: '25%' }, 2: { left: '60%', top: '20%' }, 3: { left: '40%', top: '55%' }, 4: { left: '70%', top: '50%' } },
    construction: { 1: { left: '30%', top: '25%' }, 2: { left: '50%', top: '50%' }, 3: { left: '70%', top: '35%' } },
    parking: { 1: { left: '35%', top: '40%' }, 2: { left: '65%', top: '45%' } }
  }
  return positions[area]?.[index] ?? { left: '50%', top: '50%' }
}

function enterFullscreen() {
  document.documentElement.requestFullscreen?.()
  isFullscreen.value = true
}

function exitFullscreen() {
  document.exitFullscreen?.()
  isFullscreen.value = false
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

async function refreshData() {
  await Promise.all([
    deviceStore.fetchStats(),
    cloudStore.fetchAlarmStats({ range: '1d' }),
    cloudStore.fetchSystemHealth()
  ])
  alarmStats.value = cloudStore.alarmStats
  systemHealth.value = cloudStore.systemHealth
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  refreshData()
  // 模拟实时告警更新
  setInterval(() => {
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    recentAlarms.value.unshift({
      id: Date.now(),
      level: ['critical', 'high', 'medium', 'low'][Math.floor(Math.random() * 4)],
      description: ['区域入侵检测', '徘徊行为告警', '烟火检测触发', '人脸识别异常'][Math.floor(Math.random() * 4)],
      time
    })
    if (recentAlarms.value.length > 10) recentAlarms.value.pop()
  }, 8000)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})
</script>

<style scoped>
.situation-screen { padding: 0 4px; min-height: calc(100vh - 140px); }
.screen-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.screen-header h2 { margin: 0; font-size: 20px; }
.header-actions { display: flex; gap: 8px; }
.screen-body { background: linear-gradient(135deg, #0a1628 0%, #132347 50%, #1a3454 100%); border-radius: 12px; padding: 16px; position: relative; }
.screen-body.fullscreen { position: fixed; inset: 0; z-index: 9999; border-radius: 0; padding: 24px; overflow: auto; }
.exit-fullscreen { position: absolute; top: 12px; right: 12px; z-index: 10; }
.exit-fullscreen .el-button { color: #fff; font-size: 20px; }

/* 顶部统计 */
.top-stats { display: flex; gap: 16px; margin-bottom: 16px; }
.stat-item { flex: 1; display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.06); border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); }
.stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #fff; }
.stat-icon.blue { background: rgba(24,144,255,0.3); }
.stat-icon.green { background: rgba(82,196,26,0.3); }
.stat-icon.orange { background: rgba(250,173,20,0.3); }
.stat-icon.purple { background: rgba(124,58,237,0.3); }
.stat-num { font-size: 24px; font-weight: 700; color: #fff; }
.stat-label { font-size: 12px; color: rgba(255,255,255,0.6); }

/* 主体 */
.screen-main { display: flex; gap: 16px; }
.side-panel { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; }
.panel-card { padding: 12px; background: rgba(255,255,255,0.05); border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); }
.panel-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 10px; }

/* Agent */
.agent-row { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.agent-row:last-child { border: none; }
.agent-name { font-size: 12px; color: rgba(255,255,255,0.7); }
.agent-status { font-size: 11px; padding: 1px 6px; border-radius: 4px; }
.agent-status.active { background: rgba(82,196,26,0.2); color: #52c41a; }
.agent-status.idle { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); }
.agent-calls { font-size: 11px; color: rgba(255,255,255,0.5); }

/* 告警流 */
.alarm-stream { max-height: 220px; overflow-y: auto; }
.alarm-item { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
.alarm-level { flex-shrink: 0; }
.alarm-msg { flex: 1; color: rgba(255,255,255,0.75); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.alarm-time { color: rgba(255,255,255,0.4); flex-shrink: 0; }

/* 地图 */
.map-container { flex: 1; min-height: 420px; position: relative; }
.map-placeholder { height: 100%; min-height: 420px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); position: relative; overflow: hidden; }
.map-grid { position: relative; width: 100%; height: 100%; }
.map-area { position: absolute; border: 1px dashed rgba(255,255,255,0.15); border-radius: 8px; padding: 8px; }
.map-area.park { left: 8%; top: 8%; width: 38%; height: 55%; }
.map-area.construction { left: 50%; top: 6%; width: 30%; height: 40%; }
.map-area.parking { left: 20%; top: 65%; width: 28%; height: 28%; }
.area-label { font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 600; }

.device-dot { position: absolute; width: 14px; height: 14px; border-radius: 50%; cursor: pointer; z-index: 2; }
.device-dot.online { background: #52c41a; box-shadow: 0 0 8px rgba(82,196,26,0.6); }
.device-dot.offline { background: #8c8c8c; }
.device-dot.alarming { background: #f5222d; box-shadow: 0 0 12px rgba(245,34,45,0.7); animation: alarm-pulse 1.2s infinite; }
.device-dot .dot-tooltip { display: none; position: absolute; bottom: 120%; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap; }
.device-dot:hover .dot-tooltip { display: block; }
@keyframes alarm-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.5); } }

.perimeter-line { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }

.map-legend { position: absolute; bottom: 10px; right: 14px; display: flex; gap: 12px; font-size: 11px; color: rgba(255,255,255,0.6); }
.map-legend .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px; }
.map-legend .dot.online { background: #52c41a; }
.map-legend .dot.offline { background: #8c8c8c; }
.map-legend .dot.alarming { background: #f5222d; }

/* 右侧面板 */
.project-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.proj-name { width: 70px; font-size: 12px; color: rgba(255,255,255,0.7); flex-shrink: 0; }
.proj-rate { width: 36px; font-size: 12px; color: rgba(255,255,255,0.6); text-align: right; flex-shrink: 0; }
.project-row :deep(.el-progress) { flex: 1; }

.health-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.health-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255,255,255,0.65); }
.health-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.health-dot.up { background: #52c41a; }
.health-dot.degraded { background: #faad14; }
.health-dot.down { background: #f5222d; }
</style>
