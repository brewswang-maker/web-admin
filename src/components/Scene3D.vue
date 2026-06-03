<template>
  <div class="scene3d-container" ref="containerRef">
    <div class="scene-toolbar">
      <el-button-group size="small">
        <el-button @click="resetCamera"><el-icon><RefreshRight /></el-icon>复位</el-button>
        <el-button @click="toggleAlarmPulse">{{ alarmPulse ? '关闭脉冲' : '开启脉冲' }}</el-button>
        <el-button @click="toggleLabels">{{ showLabels ? '隐藏标签' : '显示标签' }}</el-button>
        <el-button @click="togglePerfPanel">{{ showPerfPanel ? '关闭性能面板' : '性能面板' }}</el-button>
      </el-button-group>
      <div class="legend-bar">
        <span class="legend-item"><span class="dot online"></span>在线设备</span>
        <span class="legend-item"><span class="dot alarm"></span>告警点位</span>
        <span class="legend-item"><span class="dot offline"></span>离线设备</span>
      </div>
    </div>
    <!-- 性能监控面板 -->
    <div class="perf-panel" v-if="showPerfPanel && perfSnapshot">
      <div class="perf-title">📊 性能监控</div>
      <div class="perf-row">
        <span class="perf-label">FPS</span>
        <span class="perf-value" :class="fpsClass">{{ perfSnapshot.fps }}</span>
      </div>
      <div class="perf-row">
        <span class="perf-label">Draw Calls</span>
        <span class="perf-value">{{ perfSnapshot.drawCalls }}</span>
      </div>
      <div class="perf-row">
        <span class="perf-label">三角面</span>
        <span class="perf-value">{{ formatNumber(perfSnapshot.triangles) }}</span>
      </div>
      <div class="perf-row">
        <span class="perf-label">几何体</span>
        <span class="perf-value">{{ perfSnapshot.geometries }}</span>
      </div>
      <div class="perf-row">
        <span class="perf-label">纹理</span>
        <span class="perf-value">{{ perfSnapshot.textures }}</span>
      </div>
      <div class="perf-row" v-if="perfSnapshot.jsHeapUsedMB !== null">
        <span class="perf-label">内存</span>
        <span class="perf-value">{{ perfSnapshot.jsHeapUsedMB.toFixed(1) }} MB</span>
      </div>
    </div>
    <div class="scene-overlay" v-if="hoveredDevice">
      <div class="device-tooltip">
        <div class="tooltip-name">{{ hoveredDevice.name }}</div>
        <div class="tooltip-status" :class="hoveredDevice.status">{{ statusLabel(hoveredDevice.status) }}</div>
        <div class="tooltip-info">{{ hoveredDevice.location }}</div>
        <div class="tooltip-info" v-if="hoveredDevice.alarmType">告警: {{ hoveredDevice.alarmType }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { RefreshRight } from '@element-plus/icons-vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import {
  PerformanceCollector,
  formatPerformanceReport,
  type PerformanceSnapshot,
  type PerformanceReport,
} from '@/utils/performance'

// ── Props ──
interface Device3D {
  id: string
  name: string
  x: number; y: number; z: number
  status: 'online' | 'offline' | 'alarm' | 'maintenance'
  location: string
  alarmType?: string
  fov?: number
  rotation?: number
}
const props = defineProps<{
  devices?: Device3D[]
  buildings?: { name: string; x: number; z: number; w: number; d: number; h: number; color?: string }[]
  /** 是否默认显示性能面板，默认 false */
  showPerformance?: boolean
  /** FPS 低于此阈值时自动卸载不可见设备（懒卸载优化），默认 15 */
  lowFpsThreshold?: number
  /** 是否启用模型懒加载优化，默认 false */
  enableLazyLoad?: boolean
}>()

const emit = defineEmits<{
  /** 性能报告就绪事件（可由外部触发导出） */
  'performance-report': [report: PerformanceReport]
}>()

const containerRef = ref<HTMLElement>()
const alarmPulse = ref(true)
const showLabels = ref(true)
const showPerfPanel = ref(props.showPerformance ?? false)
const hoveredDevice = ref<Device3D | null>(null)
const perfSnapshot = ref<PerformanceSnapshot | null>(null)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let labelRenderer: CSS2DRenderer
let controls: OrbitControls
let animationId: number
let startTime = 0
let deviceMeshes: Map<string, { mesh: THREE.Mesh; cone: THREE.Mesh; pulse?: THREE.Mesh; label?: CSS2DObject }> = new Map()
let raycaster: THREE.Raycaster
let mouse: THREE.Vector2
let resizeObserver: ResizeObserver | null = null

// ── 性能采集器 ──
let perfCollector: PerformanceCollector | null = null

// ── 懒加载/卸载优化 ──
/** 被懒卸载的设备 ID 集合（数据保留，仅移除 3D 对象释放 GPU） */
const lazyUnloadedIds = new Set<string>()
/** 懒卸载前缓存的设备数据 */
const lazyDeviceCache = new Map<string, Device3D>()
/** 低 FPS 持续帧数计数 */
let lowFpsFrames = 0
/** 上次 FPS 状态（用于判断是否需要恢复） */
let wasLowFps = false

// ── 工具函数 ──

/** 解析 hex 颜色字符串为整数（支持 3 位缩写 #RGB → #RRGGBB） */
function parseHexColor(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  return parseInt(full, 16)
}

/** 设备状态显示文本 */
function statusLabel(status: string): string {
  switch (status) {
    case 'online': return '🟢 在线'
    case 'alarm': return '🔴 告警'
    case 'maintenance': return '🟡 维护中'
    case 'offline': return '⚫ 离线'
    default: return '⚫ 未知'
  }
}

/** 设备状态图标 */
function statusIcon(status: string): string {
  switch (status) {
    case 'online': return '🟢'
    case 'alarm': return '🔴'
    case 'maintenance': return '🟡'
    case 'offline': return '⚫'
    default: return '⚫'
  }
}

/** 格式化大数字 */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

/** FPS 颜色等级 */
const fpsClass = computed(() => {
  const fps = perfSnapshot.value?.fps ?? 60
  if (fps >= 50) return 'fps-good'
  if (fps >= 30) return 'fps-warn'
  return 'fps-bad'
})

/** 递归释放场景中所有 GPU 资源（geometry + material） */
function disposeSceneResources(sc: THREE.Scene) {
  sc.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose()
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach(m => {
        // 释放材质引用的纹理
        if (m instanceof THREE.MeshStandardMaterial) {
          m.map?.dispose()
          m.normalMap?.dispose()
          m.roughnessMap?.dispose()
          m.metalnessMap?.dispose()
        } else if (m instanceof THREE.MeshBasicMaterial) {
          m.map?.dispose()
        }
        m.dispose()
      })
    }
    if (obj instanceof THREE.LineSegments) {
      obj.geometry?.dispose()
      obj.material?.dispose()
    }
  })
}

// ── 默认设备数据 ──
const defaultDevices: Device3D[] = [
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

const defaultBuildings = [
  { name: '1号车间', x: -20, z: -15, w: 24, d: 16, h: 8, color: '#1A73E8' },
  { name: '2号车间', x: 15, z: -15, w: 20, d: 14, h: 7, color: '#0F9D58' },
  { name: '仓库', x: -25, z: 15, w: 18, d: 12, h: 6, color: '#F4B400' },
  { name: '办公楼', x: 20, z: 15, w: 16, d: 12, h: 12, color: '#7C3AED' },
  { name: '配电房', x: 35, z: -5, w: 8, d: 8, h: 4, color: '#666' },
  { name: '门卫室', x: 0, z: 42, w: 6, d: 4, h: 3, color: '#888' },
]

function init() {
  if (!containerRef.value) return
  const container = containerRef.value
  const w = container.clientWidth
  const h = container.clientHeight

  // 防止零尺寸导致 Canvas/WebGL 异常
  const safeW = Math.max(w, 1)
  const safeH = Math.max(h, 1)

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0c10)
  scene.fog = new THREE.FogExp2(0x0a0c10, 0.008)

  // Camera
  camera = new THREE.PerspectiveCamera(50, safeW / safeH, 0.1, 500)
  camera.position.set(60, 50, 70)
  camera.lookAt(0, 0, 0)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(safeW, safeH)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.appendChild(renderer.domElement)

  // CSS2D Label renderer
  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(safeW, safeH)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.top = '0'
  labelRenderer.domElement.style.left = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  container.appendChild(labelRenderer.domElement)

  // Controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = Math.PI / 2.2
  controls.minDistance = 20
  controls.maxDistance = 150
  controls.target.set(0, 0, 0)

  startTime = performance.now()
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  // ── 灯光 ──
  const ambient = new THREE.AmbientLight(0x334455, 0.6)
  scene.add(ambient)

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(30, 40, 20)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.set(2048, 2048)
  dirLight.shadow.camera.left = -60; dirLight.shadow.camera.right = 60
  dirLight.shadow.camera.top = 60; dirLight.shadow.camera.bottom = -60
  scene.add(dirLight)

  const pointLight = new THREE.PointLight(0x1A73E8, 0.3, 100)
  pointLight.position.set(0, 20, 0)
  scene.add(pointLight)

  // ── 地面 ──
  const groundGeo = new THREE.PlaneGeometry(120, 100)
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x151820,
    roughness: 0.9,
    metalness: 0.1,
  })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // 网格线
  const gridHelper = new THREE.GridHelper(120, 30, 0x1a1d23, 0x111318)
  scene.add(gridHelper)

  // 围墙（四面）
  createWall(-55, 0, 0, 0.3, 3, 100, 0x1a2040)   // 左
  createWall(55, 0, 0, 0.3, 3, 100, 0x1a2040)    // 右
  createWall(0, 0, -48, 110, 3, 0.3, 0x1a2040)   // 后
  createWall(0, 0, 48, 110, 3, 0.3, 0x1a2040)    // 前

  // ── 建筑 ──
  const buildings = props.buildings || defaultBuildings
  buildings.forEach(b => createBuilding(b))

  // ── 设备（懒加载模式下延迟创建） ──
  const devices = props.devices || defaultDevices
  if (props.enableLazyLoad && devices.length > 20) {
    // 懒加载：先加载前 20 个设备，其余在后续帧中分批加载
    const firstBatch = devices.slice(0, 20)
    const remaining = devices.slice(20)
    firstBatch.forEach(d => createDevice(d))
    scheduleLazyLoad(remaining)
  } else {
    devices.forEach(d => createDevice(d))
  }

  // ── 性能采集器 ──
  perfCollector = new PerformanceCollector(renderer, {
    sampleInterval: 500,
    maxSnapshots: 120,
  })

  // ── 事件 ──
  renderer.domElement.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)

  // ── ResizeObserver: 监听容器尺寸变化（侧边栏折叠/展开等） ──
  resizeObserver = new ResizeObserver((entries) => {
    // 使用 requestAnimationFrame 防止在同一帧内多次触发
    requestAnimationFrame(() => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          updateSize(width, height)
        }
      }
    })
  })
  resizeObserver.observe(container)
}

// ── 懒加载：分批调度 ──
let lazyLoadQueue: Device3D[] = []
let lazyLoadScheduled = false

function scheduleLazyLoad(devices: Device3D[]) {
  lazyLoadQueue = [...devices]
  lazyLoadScheduled = true
}

function processLazyLoadBatch() {
  if (!lazyLoadScheduled || lazyLoadQueue.length === 0) {
    lazyLoadScheduled = false
    return
  }
  // 每帧最多加载 5 个设备
  const batch = lazyLoadQueue.splice(0, 5)
  batch.forEach(d => createDevice(d))
  if (lazyLoadQueue.length === 0) {
    lazyLoadScheduled = false
  }
}

// ── 懒卸载优化：低 FPS 时自动卸载离线/维护设备 ──
function checkLazyUnload() {
  if (!props.enableLazyLoad) return

  const fps = perfSnapshot.value?.fps ?? 60
  const threshold = props.lowFpsThreshold ?? 15

  if (fps < threshold) {
    lowFpsFrames++
    wasLowFps = true
    // 连续 60 帧（约 1 秒）低 FPS，触发懒卸载
    if (lowFpsFrames >= 60 && lazyUnloadedIds.size === 0) {
      performLazyUnload()
    }
  } else {
    // FPS 恢复后，重新加载被卸载的设备
    if (wasLowFps && fps >= threshold + 10 && lazyUnloadedIds.size > 0) {
      performLazyReload()
    }
    lowFpsFrames = 0
    wasLowFps = false
  }
}

/** 卸载离线/维护状态的设备以释放 GPU 资源 */
function performLazyUnload() {
  const devices = props.devices || defaultDevices
  for (const d of devices) {
    // 只卸载离线和维护中的设备（告警和在线设备保留）
    if ((d.status === 'offline' || d.status === 'maintenance') && deviceMeshes.has(d.id)) {
      const entry = deviceMeshes.get(d.id)!
      removeDeviceEntry(entry)
      deviceMeshes.delete(d.id)
      lazyUnloadedIds.add(d.id)
      lazyDeviceCache.set(d.id, d)
    }
  }
}

/** FPS 恢复后重新加载被卸载的设备 */
function performLazyReload() {
  for (const id of lazyUnloadedIds) {
    const d = lazyDeviceCache.get(id)
    if (d) {
      createDevice(d)
    }
  }
  lazyUnloadedIds.clear()
  lazyDeviceCache.clear()
}

function createWall(x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
  const geo = new THREE.BoxGeometry(w, h, d)
  const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.4 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y + h / 2, z)
  mesh.castShadow = true
  scene.add(mesh)

  // 围墙顶部发光线
  const edges = new THREE.EdgesGeometry(geo)
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1A73E8, transparent: true, opacity: 0.3 }))
  line.position.copy(mesh.position)
  scene.add(line)
}

function createBuilding(b: { name: string; x: number; z: number; w: number; d: number; h: number; color?: string }) {
  const color = b.color ? parseHexColor(b.color) : 0x1A73E8
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d)
  const mat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    roughness: 0.7,
    metalness: 0.2,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(b.x, b.h / 2, b.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)

  // 边缘线
  const edges = new THREE.EdgesGeometry(geo)
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }))
  line.position.copy(mesh.position)
  scene.add(line)

  // 建筑名称标签
  const labelDiv = document.createElement('div')
  labelDiv.className = 'building-label'
  labelDiv.textContent = b.name
  labelDiv.style.cssText = 'color:rgba(255,255,255,0.5);font-size:10px;font-family:system-ui;text-align:center;white-space:nowrap;'
  const label = new CSS2DObject(labelDiv)
  label.position.set(b.x, b.h + 1, b.z)
  scene.add(label)
}

function createDevice(d: Device3D) {
  const statusColors: Record<string, number> = {
    online: 0x0F9D58,
    alarm: 0xDB4437,
    offline: 0x555555,
    maintenance: 0xF4B400,
  }
  const color = statusColors[d.status] || 0x0F9D58

  // 摄像头主体（圆柱+球）
  const bodyGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.5, metalness: 0.6 })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(d.x, d.y, d.z)
  body.castShadow = true
  scene.add(body)

  // 镜头（小球）
  const lensGeo = new THREE.SphereGeometry(0.35, 12, 12)
  const lensMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3 })
  const lens = new THREE.Mesh(lensGeo, lensMat)
  lens.position.set(d.x, d.y + 0.8, d.z)
  scene.add(lens)

  // FOV视锥
  const fov = d.fov || 60
  const dist = 12
  const angle = (fov * Math.PI) / 360
  const coneGeo = new THREE.ConeGeometry(Math.tan(angle) * dist, dist, 16, 1, true)
  const coneMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  const cone = new THREE.Mesh(coneGeo, coneMat)
  cone.position.set(d.x, d.y + 0.5, d.z)
  const rot = d.rotation || 0
  cone.rotation.x = Math.PI / 2
  cone.rotation.z = rot
  cone.translateY(-dist / 2)
  scene.add(cone)

  const entry = { mesh: body, cone } as any

  // 告警脉冲球
  if (d.status === 'alarm') {
    const pulseGeo = new THREE.SphereGeometry(1.5, 16, 16)
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xDB4437, transparent: true, opacity: 0.25, depthWrite: false })
    const pulse = new THREE.Mesh(pulseGeo, pulseMat)
    pulse.position.set(d.x, d.y + 1, d.z)
    scene.add(pulse)
    entry.pulse = pulse
  }

  // 设备标签
  const labelDiv = document.createElement('div')
  labelDiv.className = 'device-label-3d'
  const icon = statusIcon(d.status)
  labelDiv.textContent = `${icon} ${d.name}`
  labelDiv.style.cssText = `color:${d.status === 'alarm' ? '#DB4437' : '#E8EAED'};font-size:11px;font-family:system-ui;background:rgba(20,25,40,0.7);padding:2px 6px;border-radius:3px;white-space:nowrap;`
  const label = new CSS2DObject(labelDiv)
  label.position.set(d.x, d.y + 2.5, d.z)
  scene.add(label)
  entry.label = label

  deviceMeshes.set(d.id, entry)
}

/** 从场景中移除设备对象并释放其 GPU 资源 */
function removeDeviceEntry(entry: { mesh: THREE.Mesh; cone: THREE.Mesh; pulse?: THREE.Mesh; label?: CSS2DObject }) {
  scene.remove(entry.mesh)
  scene.remove(entry.cone)
  if (entry.pulse) scene.remove(entry.pulse)
  if (entry.label) scene.remove(entry.label)

  // 释放 GPU 资源
  entry.mesh.geometry?.dispose()
  ;(entry.mesh.material as THREE.Material)?.dispose()
  entry.cone.geometry?.dispose()
  ;(entry.cone.material as THREE.Material)?.dispose()
  if (entry.pulse) {
    entry.pulse.geometry?.dispose()
    ;(entry.pulse.material as THREE.Material)?.dispose()
  }
}

function onMouseMove(event: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const w = rect.width || 1
  const h = rect.height || 1
  mouse.x = ((event.clientX - rect.left) / w) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / h) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const meshes = Array.from(deviceMeshes.values()).map(e => e.mesh)
  const intersects = raycaster.intersectObjects(meshes)
  if (intersects.length > 0) {
    const hit = intersects[0].object
    const found = (props.devices || defaultDevices).find(d =>
      Math.abs(d.x - hit.position.x) < 0.1 && Math.abs(d.z - hit.position.z) < 0.1
    )
    hoveredDevice.value = found || null
  } else {
    hoveredDevice.value = null
  }
}

function animate() {
  animationId = requestAnimationFrame(animate)
  const t = (performance.now() - startTime) / 1000

  // 性能采集器 tick（精确计算 FPS）
  perfCollector?.tick()

  // 告警脉冲动画
  if (alarmPulse.value) {
    deviceMeshes.forEach((entry) => {
      if (entry.pulse) {
        const s = 1 + 0.3 * Math.sin(t * 3);
        (entry.pulse.scale as any).set(s, s, s);
        (entry.pulse.material as any).opacity = 0.15 + 0.1 * Math.sin(t * 3);
      }
    })
  }

  // 标签可见性
  deviceMeshes.forEach((entry) => {
    if (entry.label) entry.label.visible = showLabels.value
  })

  controls.update()
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)

  // 更新性能面板数据（从采集器获取最新快照）
  if (showPerfPanel.value && perfCollector) {
    const snap = perfCollector.latestSnapshot
    if (snap) {
      // 补充 renderer 实时数据（采集器的快照是采样间隔的，但 renderer.info 每帧更新）
      perfSnapshot.value = {
        ...snap,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      }
    }
  }

  // 懒加载分批调度
  processLazyLoadBatch()

  // 懒卸载检查
  checkLazyUnload()
}

/**
 * 统一的尺寸更新函数
 * 确保 Canvas、Camera aspect、LabelRenderer 三者同步
 */
function updateSize(w: number, h: number) {
  if (!renderer || !camera || !labelRenderer) return
  const safeW = Math.max(Math.round(w), 1)
  const safeH = Math.max(Math.round(h), 1)

  camera.aspect = safeW / safeH
  camera.updateProjectionMatrix()
  renderer.setSize(safeW, safeH)
  labelRenderer.setSize(safeW, safeH)
}

/** window resize 回调 */
function onResize() {
  if (!containerRef.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  if (w > 0 && h > 0) {
    updateSize(w, h)
  }
}

function resetCamera() {
  camera.position.set(60, 50, 70)
  controls.target.set(0, 0, 0)
  controls.update()
}

function toggleAlarmPulse() { alarmPulse.value = !alarmPulse.value }
function toggleLabels() { showLabels.value = !showLabels.value }
function togglePerfPanel() {
  showPerfPanel.value = !showPerfPanel.value
  if (showPerfPanel.value) {
    // 打开面板时启动采集
    perfCollector?.start()
  } else {
    perfSnapshot.value = null
  }
}

/**
 * 导出性能报告（供外部调用）
 */
function exportPerformanceReport(): PerformanceReport | null {
  if (!perfCollector) return null
  const report = perfCollector.generateReport()
  emit('performance-report', report)
  console.debug(formatPerformanceReport(report))
  return report
}

// 暴露给父组件的方法
defineExpose({
  exportPerformanceReport,
  perfCollector: () => perfCollector,
})

// ── Watch devices prop ──
watch(() => props.devices, (newDevices) => {
  if (!newDevices) return
  // 移除旧设备并释放 GPU 资源
  deviceMeshes.forEach((entry) => {
    removeDeviceEntry(entry)
  })
  deviceMeshes.clear()
  lazyUnloadedIds.clear()
  lazyDeviceCache.clear()

  if (props.enableLazyLoad && newDevices.length > 20) {
    const firstBatch = newDevices.slice(0, 20)
    const remaining = newDevices.slice(20)
    firstBatch.forEach(d => createDevice(d))
    scheduleLazyLoad(remaining)
  } else {
    newDevices.forEach(d => createDevice(d))
  }
}, { deep: true })

onMounted(() => {
  init()
  animate()
})

onUnmounted(() => {
  // 停止性能采集
  perfCollector?.dispose()
  perfCollector = null

  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  renderer?.domElement.removeEventListener('mousemove', onMouseMove)

  // 断开 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  // 递归释放所有 GPU 资源后再清空场景
  if (scene) disposeSceneResources(scene)
  renderer?.dispose()
  labelRenderer?.domElement.remove()
  scene?.clear()
})
</script>

<style scoped>
.scene3d-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  border-radius: 0 0 8px 8px;
  min-height: 0;
  /* 确保 flex 子项能正确收缩 */
  flex-shrink: 1;
}

.scene3d-container canvas {
  display: block;
}

.scene-toolbar {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  display: flex;
  gap: 12px;
  align-items: center;
  /* 防止工具栏超出容器 */
  max-width: calc(100% - 16px);
  flex-wrap: wrap;
}

.legend-bar {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  background: rgba(0,0,0,0.4);
  padding: 4px 10px;
  border-radius: 4px;
}

.legend-item { display: flex; align-items: center; gap: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.online { background: #0F9D58; }
.dot.alarm { background: #DB4437; animation: pulse-dot 1.5s infinite; }
.dot.offline { background: #555; }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

/* ── 性能监控面板 ── */
.perf-panel {
  position: absolute;
  top: 50px;
  left: 8px;
  z-index: 10;
  background: rgba(10, 12, 16, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 180px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  color: #E8EAED;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  user-select: none;
}

.perf-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.perf-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
}

.perf-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.perf-value {
  font-weight: 600;
  font-size: 13px;
  color: #E8EAED;
  font-variant-numeric: tabular-nums;
}

.perf-value.fps-good { color: #0F9D58; }
.perf-value.fps-warn { color: #F4B400; }
.perf-value.fps-bad { color: #DB4437; }

.scene-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
}

.device-tooltip {
  background: rgba(13, 15, 18, 0.92);
  border: 1px solid #1E2028;
  border-radius: 6px;
  padding: 10px 14px;
  min-width: 140px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.tooltip-name { font-size: 13px; font-weight: 600; color: #E8EAED; margin-bottom: 4px; }
.tooltip-status { font-size: 11px; margin-bottom: 2px; }
.tooltip-status.alarm { color: #DB4437; }
.tooltip-status.online { color: #0F9D58; }
.tooltip-status.offline { color: #666; }
.tooltip-status.maintenance { color: #F4B400; }
.tooltip-info { font-size: 11px; color: #9AA0A6; }
</style>
