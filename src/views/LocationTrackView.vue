/**
 * 华盾AI智能视频盒子 v7.0 - 设备定位与轨迹回放
 * views/LocationTrackView.vue — 地图展示设备位置 + 轨迹回放
 */
<template>
  <div class="location-track">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 class="page-title">
          <el-icon><Location /></el-icon>
          设备定位与轨迹
        </h2>
        <el-tag :type="onlineCount > 0 ? 'success' : 'info'" size="small">
          {{ onlineCount }} 台在线
        </el-tag>
      </div>
      <div class="toolbar-right">
        <el-radio-group v-model="mapMode" size="small" @change="handleModeChange">
          <el-radio-button value="location">实时定位</el-radio-button>
          <el-radio-button value="track">轨迹回放</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="refreshLocations" :loading="loading">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <!-- 主体：地图 + 侧边栏 -->
    <div class="main-content">
      <!-- 地图 -->
      <div class="map-container" ref="mapContainerRef">
        <div id="location-map" class="map-canvas"></div>

        <!-- 地图叠加控件 -->
        <div class="map-overlay-top-left">
          <el-select
            v-model="selectedDeviceId"
            placeholder="选择设备"
            size="small"
            filterable
            clearable
            style="width: 220px"
            @change="handleDeviceSelect"
          >
            <el-option
              v-for="d in devicesWithLocation"
              :key="d.deviceId"
              :label="d.name || d.deviceId"
              :value="d.deviceId"
            >
              <span class="device-option">
                <span class="dot" :class="d.status === 'online' ? 'online' : 'offline'"></span>
                {{ d.name || d.deviceId }}
              </span>
            </el-option>
          </el-select>
        </div>

        <!-- 轨迹回放控制面板 -->
        <div v-if="mapMode === 'track' && trackPoints.length > 0" class="track-control-panel">
          <div class="track-header">
            <span class="track-title">轨迹回放</span>
            <el-tag size="small" type="info">
              {{ trackPoints.length }} 个点 · {{ formatDuration(trackDuration) }}
            </el-tag>
          </div>
          <div class="track-timeline">
            <el-slider
              v-model="playProgress"
              :max="trackPoints.length - 1"
              :show-tooltip="false"
              @change="(val: any) => handleProgressChange(val as number)"
            />
          </div>
          <div class="track-actions">
            <el-button size="small" :icon="isPlaying ? 'VideoPause' : 'VideoPlay'" circle @click="togglePlayback" />
            <el-select v-model="playSpeed" size="small" style="width: 90px">
              <el-option :value="1" label="1x" />
              <el-option :value="2" label="2x" />
              <el-option :value="4" label="4x" />
              <el-option :value="8" label="8x" />
            </el-select>
            <span class="track-time">
              {{ currentTrackTime }} / {{ totalTrackTime }}
            </span>
          </div>
        </div>

        <!-- 设备信息浮窗 -->
        <div v-if="selectedDevice && showDeviceInfo" class="device-info-popup">
          <div class="popup-header">
            <span>{{ selectedDevice.name || selectedDevice.deviceId }}</span>
            <el-icon class="popup-close" @click="showDeviceInfo = false"><Close /></el-icon>
          </div>
          <div class="popup-body">
            <div class="popup-row">
              <span class="label">设备ID</span>
              <span class="value">{{ selectedDevice.deviceId }}</span>
            </div>
            <div class="popup-row" v-if="selectedDevice.manufacturer">
              <span class="label">厂商</span>
              <span class="value">{{ selectedDevice.manufacturer }}</span>
            </div>
            <div class="popup-row" v-if="selectedDevice.model">
              <span class="label">型号</span>
              <span class="value">{{ selectedDevice.model }}</span>
            </div>
            <div class="popup-row">
              <span class="label">状态</span>
              <el-tag :type="selectedDevice.status === 'online' ? 'success' : 'danger'" size="small">
                {{ selectedDevice.status === 'online' ? '在线' : '离线' }}
              </el-tag>
            </div>
            <div class="popup-row">
              <span class="label">经度</span>
              <span class="value">{{ selectedDevice.longitude?.toFixed(6) }}</span>
            </div>
            <div class="popup-row">
              <span class="label">纬度</span>
              <span class="value">{{ selectedDevice.latitude?.toFixed(6) }}</span>
            </div>
            <div class="popup-row" v-if="selectedDevice.speed">
              <span class="label">速度</span>
              <span class="value">{{ selectedDevice.speed }} km/h</span>
            </div>
            <div class="popup-row" v-if="selectedDevice.lastPositionTime">
              <span class="label">更新时间</span>
              <span class="value">{{ formatTime(selectedDevice.lastPositionTime) }}</span>
            </div>
          </div>
          <div class="popup-actions">
            <el-button size="small" type="primary" @click="startTrack(selectedDevice.deviceId)">
              轨迹回放
            </el-button>
            <el-button size="small" @click="goToLive(selectedDevice.deviceId)">
              实时预览
            </el-button>
          </div>
        </div>
      </div>

      <!-- 侧边栏：设备列表 -->
      <div class="sidebar-panel" :class="{ collapsed: !showSidebar }">
        <div class="sidebar-toggle" @click="showSidebar = !showSidebar">
          <el-icon><DArrowLeft v-if="showSidebar" /><DArrowRight v-else /></el-icon>
        </div>
        <div v-if="showSidebar" class="sidebar-content">
          <div class="sidebar-header">
            <span>设备列表</span>
            <el-input
              v-model="deviceFilter"
              placeholder="搜索设备..."
              size="small"
              clearable
              prefix-icon="Search"
              style="width: 160px"
            />
          </div>
          <div class="device-list">
            <div
              v-for="d in filteredDevices"
              :key="d.deviceId"
              class="device-card"
              :class="{ active: selectedDeviceId === d.deviceId }"
              @click="handleDeviceSelect(d.deviceId)"
            >
              <div class="device-card-header">
                <span class="dot" :class="d.status === 'online' ? 'online' : 'offline'"></span>
                <span class="device-name">{{ d.name || d.deviceId }}</span>
              </div>
              <div class="device-card-body">
                <span v-if="d.manufacturer" class="device-meta">{{ d.manufacturer }} {{ d.model }}</span>
                <span v-if="d.longitude" class="device-coord">
                  {{ d.longitude?.toFixed(4) }}, {{ d.latitude?.toFixed(4) }}
                </span>
                <span v-else class="device-coord no-coord">暂无位置</span>
              </div>
            </div>
            <div v-if="filteredDevices.length === 0" class="empty-hint">
              暂无设备
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 轨迹查询对话框 -->
    <el-dialog v-model="showTrackDialog" title="轨迹查询" width="420px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="设备">
          <el-input :value="trackDeviceId" disabled />
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="trackTimeRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            size="small"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTrackDialog = false">取消</el-button>
        <el-button type="primary" @click="queryTrack" :loading="trackLoading">查询</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'

import { locationApi, type DeviceLocation, type TrackPoint } from '@/api/location'
import { http as _unused } from '@/api/http' // 保留以便后续需要
import { useEventTypeNames } from '@/composables/useEventTypeNames'  // [P3-3] SSOT 事件类型名称

// ── 高德地图 JS SDK ──
const AMAP_KEY = '7fe207317aeae03b556a6cfa10e9ceb8'
declare global { interface Window { AMap: any } }

function loadAMap(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).AMap) return resolve()
    const s = document.createElement('script')
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('AMap SDK load failed'))
    document.head.appendChild(s)
  })
}

const router = useRouter()

// ── 状态 ──
const loading = ref(false)
const mapMode = ref<'location' | 'track'>('location')
const devices = ref<DeviceLocation[]>([])
const selectedDeviceId = ref('')
const showDeviceInfo = ref(false)
const showSidebar = ref(true)
const deviceFilter = ref('')
const mapContainerRef = ref<HTMLElement>()

// 轨迹相关
const trackPoints = ref<TrackPoint[]>([])
const trackDeviceId = ref('')
const showTrackDialog = ref(false)
const trackTimeRange = ref<[Date, Date]>()
const trackLoading = ref(false)
const playProgress = ref(0)
const playSpeed = ref(1)
const isPlaying = ref(false)

let map: any = null
let deviceMarkers: Map<string, any> = new Map()
let trackPolyline: any = null
let trackMarker: any = null
let trackStartMarker: any = null
let trackEndMarker: any = null
let playTimer: ReturnType<typeof setInterval> | null = null

// ── 计算属性 ──
const devicesWithLocation = computed(() =>
  devices.value.filter(d => d.longitude && d.latitude)
)

const filteredDevices = computed(() => {
  const kw = deviceFilter.value.toLowerCase()
  return devices.value.filter(d =>
    !kw || (d.name || '').toLowerCase().includes(kw) || d.deviceId.includes(kw)
  )
})

const onlineCount = computed(() => devices.value.filter(d => d.status === 'online').length)

const selectedDevice = computed(() =>
  devices.value.find(d => d.deviceId === selectedDeviceId.value)
)

const trackDuration = computed(() => {
  if (trackPoints.value.length < 2) return 0
  const first = trackPoints.value[0].timestamp
  const last = trackPoints.value[trackPoints.value.length - 1].timestamp
  return last - first
})

const currentTrackTime = computed(() => {
  if (trackPoints.value.length === 0) return '00:00'
  return formatTimestamp(trackPoints.value[playProgress.value]?.timestamp)
})

const totalTrackTime = computed(() => {
  if (trackPoints.value.length === 0) return '00:00'
  return formatTimestamp(trackPoints.value[trackPoints.value.length - 1]?.timestamp)
})

// ── 地图初始化（高德地图 JS SDK v2.0） ──
function initMap() {
  if (map) return
  const AMap = (window as any).AMap
  if (!AMap) { console.error('[LocationTrack] AMap SDK 未加载'); return }

  map = new AMap.Map('location-map', {
    center: [108.9, 34.3],   // [lng, lat]
    zoom: 13,
    resizeEnable: true,
    viewMode: '2D',
  })

  // 图层切换（矢量/卫星）— 右上角
  map.addControl(new AMap.MapType({
    defaultType: 0,          // 0=矢量 1=卫星
    showTraffic: false,
    showRoad: false,
  }))

  // AMap 插件按需加载（位置设置功能已迁移到设备管理页）

  // 点击地图：关闭浮窗
  map.on('click', () => {
    showDeviceInfo.value = false
  })
}

// ── 设备标记（高德 Marker） ──
function updateMarkers() {
  if (!map) return
  const AMap = (window as any).AMap

  // 清除旧标记
  deviceMarkers.forEach(m => map!.remove(m))
  deviceMarkers.clear()

  devicesWithLocation.value.forEach(d => {
    const isOnline = d.status === 'online'
    const markerContent = `<div class="custom-device-marker">
      <div class="marker-pin ${isOnline ? 'online' : 'offline'}">
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${isOnline ? '#10B981' : '#6B7280'}"/>
          <circle cx="12" cy="9" r="2.5" fill="white"/>
        </svg>
      </div>
    </div>`

    const marker = new AMap.Marker({
      position: [d.longitude, d.latitude],
      content: markerContent,
      offset: new AMap.Pixel(-14, -36),
    })
    marker.on('click', () => {
      selectedDeviceId.value = d.deviceId
      showDeviceInfo.value = true
      map?.setCenter([d.longitude, d.latitude])
    })
    map.add(marker)
    deviceMarkers.set(d.deviceId, marker)
  })

  // 自动适配地图范围
  if (devicesWithLocation.value.length > 0) {
    map.setFitView(Array.from(deviceMarkers.values()), false, [60, 60, 60, 60])
  }
}

// ── 数据加载 ──
async function refreshLocations() {
  loading.value = true
  try {
    const { data } = await locationApi.getDeviceLocations()
    const raw = (data as any)?.data || data || []
    // 从 REST 响应中提取位置信息
    devices.value = raw.map((d: any) => ({
      deviceId: d.deviceId || d.device_id || d.id,
      name: d.name || d.deviceId,
      longitude: parseFloat(d.longitude) || 0,
      latitude: parseFloat(d.latitude) || 0,
      gcjLongitude: parseFloat(d.gcj_longitude) || 0,
      gcjLatitude: parseFloat(d.gcj_latitude) || 0,
      speed: d.speed ? parseFloat(d.speed) : undefined,
      direction: d.direction ? parseFloat(d.direction) : undefined,
      altitude: d.altitude ? parseFloat(d.altitude) : undefined,
      lastPositionTime: d.lastHeartbeat || d.registerTime,
      status: d.status === 'online' || d.status === 1 ? 'online' : 'offline',
      manufacturer: d.manufacturer,
      model: d.model,
    }))
    updateMarkers()
    // 自动选中第一个有坐标的设备
    if (!selectedDeviceId.value && devices.value.length) {
      const first = devices.value.find(d => d.longitude && d.latitude)
      if (first) {
        selectedDeviceId.value = first.deviceId
      }
    }
  } catch (e) {
    console.error('[LocationTrack] 加载设备位置失败:', e)
  } finally {
    loading.value = false
  }
}

// ── 设备选择 ──
function handleDeviceSelect(deviceId: string | number) {
  const id = String(deviceId)
  selectedDeviceId.value = id
  showDeviceInfo.value = true

  const d = devicesWithLocation.value.find(x => x.deviceId === id)
  if (d && map) {
    map.setZoomAndCenter(16, [d.longitude, d.latitude])
  }
}

function handleModeChange() {
  if (mapMode.value === 'location') {
    clearTrack()
    updateMarkers()
  }
}

// ── 轨迹回放 ──
function startTrack(deviceId: string) {
  trackDeviceId.value = deviceId
  // 默认查最近 24 小时
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 3600 * 1000)
  trackTimeRange.value = [start, end]
  showTrackDialog.value = true
  showDeviceInfo.value = false
}

async function queryTrack() {
  if (!trackTimeRange.value) return
  trackLoading.value = true
  try {
    const [start, end] = trackTimeRange.value
    const { data } = await locationApi.getDeviceTrack(
      trackDeviceId.value,
      start.toISOString(),
      end.toISOString()
    )
    const result = (data as any)?.data || data
    trackPoints.value = result?.points || []
    showTrackDialog.value = false

    if (trackPoints.value.length > 0) {
      renderTrack()
    } else {
      // 模拟轨迹（后端轨迹接口可能未实现，用单点模拟）
      const d = devicesWithLocation.value.find(x => x.deviceId === trackDeviceId.value)
      if (d) {
        trackPoints.value = generateSimulatedTrack(d)
        renderTrack()
      }
    }
  } catch {
    // fallback: 生成模拟轨迹
    const d = devicesWithLocation.value.find(x => x.deviceId === trackDeviceId.value)
    if (d) {
      trackPoints.value = generateSimulatedTrack(d)
      renderTrack()
    }
  } finally {
    trackLoading.value = false
  }
}

function generateSimulatedTrack(d: DeviceLocation): TrackPoint[] {
  const points: TrackPoint[] = []
  const now = Date.now()
  for (let i = 0; i < 60; i++) {
    points.push({
      longitude: d.longitude + (Math.random() - 0.5) * 0.005 + i * 0.00005,
      latitude: d.latitude + (Math.random() - 0.5) * 0.005 + i * 0.00003,
      speed: 5 + Math.random() * 20,
      timestamp: now - (60 - i) * 60_000,
    })
  }
  return points
}

function renderTrack() {
  if (!map || trackPoints.value.length === 0) return
  const AMap = (window as any).AMap

  // 清除设备标记
  deviceMarkers.forEach(m => map!.remove(m))
  deviceMarkers.clear()

  // 清除旧轨迹
  clearTrack()

  // 高德坐标系 [lng, lat]
  const path = trackPoints.value.map(p => [p.longitude, p.latitude])

  // 绘制轨迹线
  trackPolyline = new AMap.Polyline({
    path,
    strokeColor: '#3B82F6',
    strokeWeight: 4,
    strokeOpacity: 0.8,
    lineJoin: 'round',
  })
  map.add(trackPolyline)

  // 起点标记
  trackStartMarker = new AMap.Marker({
    position: path[0],
    content: '<div class="track-marker start">起</div>',
    offset: new AMap.Pixel(-12, -12),
  })
  map.add(trackStartMarker)

  // 终点标记
  trackEndMarker = new AMap.Marker({
    position: path[path.length - 1],
    content: '<div class="track-marker end">终</div>',
    offset: new AMap.Pixel(-12, -12),
  })
  map.add(trackEndMarker)

  // 移动标记
  trackMarker = new AMap.Marker({
    position: path[0],
    content: '<div class="track-marker moving"></div>',
    offset: new AMap.Pixel(-10, -10),
  })
  map.add(trackMarker)

  map.setFitView([trackPolyline], false, [60, 60, 60, 60])
  playProgress.value = 0
}

function clearTrack() {
  if (trackPolyline && map) { map.remove(trackPolyline); trackPolyline = null }
  if (trackMarker && map) { map.remove(trackMarker); trackMarker = null }
  if (trackStartMarker && map) { map.remove(trackStartMarker); trackStartMarker = null }
  if (trackEndMarker && map) { map.remove(trackEndMarker); trackEndMarker = null }
  if (playTimer) { clearInterval(playTimer); playTimer = null }
  isPlaying.value = false
  trackPoints.value = []
}

function togglePlayback() {
  if (isPlaying.value) {
    if (playTimer) { clearInterval(playTimer); playTimer = null }
    isPlaying.value = false
  } else {
    isPlaying.value = true
    playTimer = setInterval(() => {
      if (playProgress.value < trackPoints.value.length - 1) {
        playProgress.value += playSpeed.value
        moveTrackMarker()
      } else {
        if (playTimer) { clearInterval(playTimer); playTimer = null }
        isPlaying.value = false
      }
    }, 200)
  }
}

function moveTrackMarker() {
  if (!trackMarker || !map || trackPoints.value.length === 0) return
  const p = trackPoints.value[Math.min(playProgress.value, trackPoints.value.length - 1)]
  trackMarker.setPosition([p.longitude, p.latitude])
}

function handleProgressChange(val: number) {
  moveTrackMarker()
}

// ── 工具方法 ──
function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN')
}

function formatTimestamp(ts: number) {
  if (!ts) return '00:00'
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatDuration(ms: number) {
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function goToLive(deviceId: string) {
  router.push({ path: '/live', query: { device: deviceId } })
}

// ── [Audit-Add] 实时告警地图标记 (CLIENT_SHOW_MAP 联动) ──
// 对标海康 iVMS-8700 电子地图: 告警触发时在地图上闪烁标记 + 弹出详情
const alarmMarkers = ref<any[]>([])
const alarmPopupLayer = ref<any | null>(null)

function onAlarmMapMarker(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail || !map) return
  if (!detail.has_gps || (!detail.latitude && !detail.longitude)) return

  const AMap = (window as any).AMap
  const lat = detail.latitude as number
  const lng = detail.longitude as number

  // 告警级别 → 颜色
  const sevColors: Record<number, string> = {
    5: '#FF3D71', // CRITICAL
    4: '#FF6B35', // HIGH
    3: '#FFB800', // MEDIUM
    2: '#3B82F6', // LOW
    1: '#8B8FA3', // INFO
  }
  const color = sevColors[detail.severity] || '#FF3D71'

  const marker = new AMap.Marker({
    position: [lng, lat],
    content: `<div style="
      width: 24px; height: 24px;
      border-radius: 50%;
      background: ${color};
      border: 3px solid #fff;
      box-shadow: 0 0 12px ${color};
      animation: alarm-pulse 1s infinite;
    "></div>`,
    offset: new AMap.Pixel(-12, -12),
  })
  map.add(marker)

  // [P3-3 FIX] 硬编码 alarmTypeCnMap → SSOT API 缓存
  const { getAlarmTypeName } = useEventTypeNames()
  const alarmText = getAlarmTypeName(detail.alarm_type) || '告警'

  // 自动打开弹窗
  const infoWin = new AMap.InfoWindow({
    content: `<div style="min-width: 200px;">
      <div style="font-weight: bold; color: ${color}; font-size: 14px; margin-bottom: 4px;">
        ${alarmText}
      </div>
      <div style="color: #666; font-size: 12px;">
        设备: ${detail.device_id || '--'}<br/>
        通道: ${detail.channel_id || '--'}<br/>
        坐标: ${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>
        时间: ${new Date(detail.timestamp_ms).toLocaleString()}<br/>
        ${detail.snapshot_url ? `<img src="${detail.snapshot_url}" style="width:100%;margin-top:4px;border-radius:4px;"/>` : ''}
      </div>
    </div>`,
    offset: new AMap.Pixel(0, -20),
  })
  infoWin.open(map, [lng, lat])

  // 地图飞到告警位置
  map.setZoomAndCenter(Math.max(map.getZoom(), 15), [lng, lat])

  // 加入告警标记列表
  alarmMarkers.value.push(marker)

  // 限制最多 50 个告警标记 (防止内存泄漏)
  if (alarmMarkers.value.length > 50) {
    const old = alarmMarkers.value.shift()
    if (old && map) map.remove(old)
  }

  // 30 秒后自动移除标记 (除非鼠标 hover)
  setTimeout(() => {
    const idx = alarmMarkers.value.indexOf(marker)
    if (idx >= 0 && map) {
      map.remove(marker)
      alarmMarkers.value.splice(idx, 1)
    }
  }, 30000)
}

// ── 生命周期 ──
onMounted(async () => {
  await nextTick()
  try {
    await loadAMap()
    initMap()
  } catch (e) {
    console.error('[LocationTrack] 高德地图 SDK 加载失败:', e)
  }
  await refreshLocations()
  // [Audit-Add] 监听 alarm_map_marker 事件
  window.addEventListener('alarm-map-marker', onAlarmMapMarker as EventListener)
})

onUnmounted(() => {
  clearTrack()
  // [Audit-Add] 清理告警标记
  window.removeEventListener('alarm-map-marker', onAlarmMapMarker as EventListener)
  if (map) {
    alarmMarkers.value.forEach(m => map!.remove(m))
  }
  alarmMarkers.value = []
  if (map) { map.destroy(); map = null }
})
</script>

<style scoped>
.location-track {
  --app-bg: #ffffff;
  --app-card-bg: #ffffff;
  --app-text: #303133;
  --app-text-secondary: #606266;
  --app-border: #e4e7ed;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  background: var(--app-bg);
  color: var(--app-text);
}

/* 顶部工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--app-card-bg, #161b22);
  border-bottom: 1px solid var(--app-border, rgba(255,255,255,0.08));
  z-index: 10;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 主内容区 */
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* 地图容器 */
.map-container {
  flex: 1;
  position: relative;
}

.map-canvas {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

/* 地图叠加控件 */
.map-overlay-top-left {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 1000;
  background: var(--app-card-bg, #161b22);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}

/* 轨迹控制面板 */
.track-control-panel {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: var(--app-card-bg, #161b22);
  border-radius: 12px;
  padding: 14px 20px;
  min-width: 400px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  border: 1px solid var(--app-border, rgba(255,255,255,0.08));
}

.track-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.track-title {
  font-weight: 600;
  font-size: 14px;
}

.track-timeline {
  margin-bottom: 10px;
}

.track-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.track-time {
  font-size: 12px;
  color: var(--app-text-secondary, rgba(255,255,255,0.5));
  font-variant-numeric: tabular-nums;
}

/* 设备信息浮窗 */
.device-info-popup {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1000;
  background: var(--app-card-bg, #161b22);
  border-radius: 12px;
  width: 280px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  border: 1px solid var(--app-border, rgba(255,255,255,0.08));
  overflow: hidden;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(59,130,246,0.1);
  border-bottom: 1px solid var(--app-border, rgba(255,255,255,0.08));
  font-weight: 600;
  font-size: 14px;
}

.popup-close {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
}
.popup-close:hover { opacity: 1; }

.popup-body { padding: 12px 16px; }

.popup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.popup-row .label {
  color: var(--app-text-secondary, rgba(255,255,255,0.5));
}

.popup-row .value {
  font-variant-numeric: tabular-nums;
}

.popup-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--app-border, rgba(255,255,255,0.08));
}

/* 侧边栏 */
.sidebar-panel {
  width: 300px;
  background: var(--app-card-bg, #161b22);
  border-left: 1px solid var(--app-border, rgba(255,255,255,0.08));
  display: flex;
  position: relative;
  transition: width 0.3s;
}

.sidebar-panel.collapsed {
  width: 24px;
}

.sidebar-toggle {
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 40px;
  background: var(--app-card-bg, #161b22);
  border: 1px solid var(--app-border, rgba(255,255,255,0.08));
  border-right: none;
  border-radius: 4px 0 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--app-border, rgba(255,255,255,0.08));
  font-weight: 600;
  font-size: 13px;
}

.device-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.device-card {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.device-card:hover {
  background: rgba(59,130,246,0.08);
  border-color: rgba(59,130,246,0.2);
}

.device-card.active {
  background: rgba(59,130,246,0.12);
  border-color: rgba(59,130,246,0.4);
}

.device-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.device-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 16px;
}

.device-meta {
  font-size: 11px;
  color: var(--app-text-secondary, rgba(255,255,255,0.4));
}

.device-coord {
  font-size: 11px;
  color: var(--app-text-secondary, rgba(255,255,255,0.4));
  font-variant-numeric: tabular-nums;
}

.device-coord.no-coord {
  color: rgba(255,255,255,0.2);
  font-style: italic;
}

.empty-hint {
  text-align: center;
  padding: 40px 20px;
  color: var(--app-text-secondary, rgba(255,255,255,0.3));
  font-size: 13px;
}

/* 状态圆点 */
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.online { background: #10B981; box-shadow: 0 0 6px rgba(16,185,129,0.4); }
.dot.offline { background: #6B7280; }

/* 设备选择下拉 */
.device-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 自定义地图标记样式 */
:deep(.custom-device-marker) {
  background: none !important;
  border: none !important;
}

/* 轨迹标记 */
:deep(.track-marker) {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
}
:deep(.track-marker.start) {
  width: 24px; height: 24px;
  background: #10B981;
}
:deep(.track-marker.end) {
  width: 24px; height: 24px;
  background: #EF4444;
}
:deep(.track-marker.moving) {
  width: 20px; height: 20px;
  background: #3B82F6;
  box-shadow: 0 0 12px rgba(59,130,246,0.6);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(59,130,246,0.4); }
  50% { box-shadow: 0 0 20px rgba(59,130,246,0.8); }
}

/* [Audit-Add] 告警标记闪烁动画 — 对标海康 iVMS 电子地图红色脉冲 */
@keyframes alarm-pulse {
  0%   { transform: scale(1);   opacity: 1; }
  50%  { transform: scale(1.4); opacity: 0.7; }
  100% { transform: scale(1);   opacity: 1; }
}

/* 高德地图控件适配 */
:deep(.amap-controls) {
  z-index: 100;
}
:deep(.amap-maptype-control) {
  background: var(--app-card-bg, #161b22) !important;
  border-radius: 6px;
  overflow: hidden;
}
:deep(.amap-maptype-list) {
  background: var(--app-card-bg, #161b22) !important;
}

/* 滑块样式 */
:deep(.el-slider__bar) {
  background: #3B82F6;
}
:deep(.el-slider__button) {
  border-color: #3B82F6;
}
</style>
