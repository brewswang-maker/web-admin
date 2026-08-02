<template>
  <div class="scene3d-container" ref="containerRef">
    <div class="scene-toolbar">
      <!-- <el-button-group size="small">
        <el-button @click="resetCamera"><el-icon><RefreshRight /></el-icon>复位</el-button>
        <el-button @click="toggleAlarmPulse">{{ alarmPulse ? '关闭脉冲' : '开启脉冲' }}</el-button>
        <el-button @click="toggleLabels">{{ showLabels ? '隐藏标签' : '显示标签' }}</el-button>
        <el-button @click="togglePerfPanel">{{ showPerfPanel ? '关闭性能面板' : '性能面板' }}</el-button>
      </el-button-group> -->
      <div class="legend-bar">
        <span class="legend-item">
          <i class="iconfont1 icon1-yingyanshexiangtou legend-icon online" aria-hidden="true"></i>
          在线设备
        </span>
        <span class="legend-item">
          <i class="iconfont1 icon1-yingyanshexiangtou legend-icon alarm" aria-hidden="true"></i>
          告警点位
        </span>
        <span class="legend-item">
          <i class="iconfont1 icon1-yingyanshexiangtou legend-icon offline" aria-hidden="true"></i>
          离线设备
        </span>
        <button class="scene-tool-button" type="button" aria-label="复位视角" @click="resetCamera">
          <i class="iconfont1 icon1-fuwei" aria-hidden="true"></i>
          <span>复位</span>
        </button>
        <button
          class="scene-tool-button"
          type="button"
          :aria-label="showLabels ? '隐藏标签' : '显示标签'"
          :aria-pressed="!showLabels"
          @click="toggleLabels"
        >
          <i class="iconfont1 icon1-xianshiyincangbiaoqian" aria-hidden="true"></i>
          <span>{{ showLabels ? '隐藏标签' : '显示标签' }}</span>
        </button>
      </div>
    </div>
    <Teleport to="body">
      <div
        class="scene-ai-assistant"
        :class="{ dragging: aiDragging, 'message-on-right': aiMessagePlacement === 'right' }"
        :style="aiAssistantStyle"
      >
        <button
          ref="aiTriggerRef"
          class="ai-trigger"
          type="button"
          aria-label="打开 AI 助手"
          @pointerdown="startAiDrag"
          @pointermove="moveAiDrag"
          @pointerup="endAiDrag"
          @pointercancel="endAiDrag"
          @click="openAiChat"
        >
          <img :src="aiGif" alt="AI 助手" draggable="false" />
        </button>
        <div class="ai-message" role="tooltip">
          <span>随时待命：巡检、调策略、数据分析都交给我</span>
        </div>
      </div>
    </Teleport>
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
        <div class="tooltip-info">位置: {{ hoveredDevice.location }}</div>
        <div class="tooltip-info" v-if="hoveredDevice.projectName">项目: {{ hoveredDevice.projectName }}</div>
        <div class="tooltip-info" v-if="hoveredDevice.alarmType">告警: {{ hoveredDevice.alarmType }}</div>
        <div class="tooltip-hint" v-if="hoveredDevice.businessId">点击查看设备详情 →</div>
      </div>
    </div>
    <!-- T4: 设备操作上下文菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="device-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div class="context-menu-header">{{ contextMenu.device?.name || '未知设备' }}</div>
        <button class="context-menu-item" type="button" @click="onDeviceLivePreview">
          <i class="iconfont1 icon1-yingyanshexiangtou" aria-hidden="true"></i>
          <span>实时预览</span>
        </button>
        <button class="context-menu-item" type="button" @click="onDevicePlayback">
          <i class="iconfont1 icon1-gaojing" aria-hidden="true"></i>
          <span>录像回放</span>
        </button>
        <button v-if="contextMenu.device?.businessId" class="context-menu-item" type="button" @click="onDeviceDetailNav">
          <i class="iconfont1 icon1-shebeizhuangtai" aria-hidden="true"></i>
          <span>设备详情</span>
        </button>
      </div>
      <div v-if="contextMenu.visible" class="context-menu-backdrop" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  PerformanceCollector,
  formatPerformanceReport,
  type PerformanceSnapshot,
  type PerformanceReport,
} from '@/utils/performance'
import aiGif from '@/assets/ai.gif'

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
  /** 所属项目（悬停展示） */
  projectName?: string
  /** 设备业务 ID（点击跳转设备详情；演示数据无此字段） */
  businessId?: string
  /** 设备类型 */
  deviceType?: string
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
  /** 编辑模式：启用设备拖拽编辑 */
  editMode?: boolean
  /** 选中的设备ID — 高亮显示 */
  selectedDeviceId?: string
  /** P2-1: CAD 底图 URL（叠加到地面） */
  groundImageUrl?: string
  /** P2-2: 建筑绘制模式（在2D底图上画矩形拉伸为建筑） */
  drawBuildingMode?: boolean
  /** P2-3: 建筑模型映射 { buildingName: modelUrl } */
  buildingModels?: Record<string, string>
  /** P2-6: 是否显示2D俯视小地图 */
  showMiniMap?: boolean
}>()

const emit = defineEmits<{
  /** 性能报告就绪事件（可由外部触发导出） */
  'performance-report': [report: PerformanceReport]
  /** 设备拖拽事件（编辑模式下拖拽设备后触发） */
  'device-drag': [payload: { deviceId: string; x: number; y: number; z: number; buildingId?: string }]
  /** 编辑模式下点击设备选中 */
  'device-select': [deviceId: string]
  /** P1-2: 建筑悬停事件 */
  'building-hover': [payload: { buildingName: string | null; deviceCount: number; x: number; z: number }]
  /** P2-2: 建筑绘制完成事件（画矩形拉伸后） */
  'building-create': [payload: { x: number; z: number; w: number; d: number }]
  /** P2-6: 2D小地图设备点击 */
  'minimap-select': [deviceId: string]
  /** T4: 设备视频操作 — 实时预览请求 */
  'device-video': [device: { id: string; name: string; businessId?: string; deviceType?: string }]
}>()

const router = useRouter()
const containerRef = ref<HTMLElement>()
const aiTriggerRef = ref<HTMLButtonElement>()
const alarmPulse = ref(true)
const showLabels = ref(true)
const showPerfPanel = ref(props.showPerformance ?? false)
const hoveredDevice = ref<Device3D | null>(null)

// T4: 设备右键/点击上下文菜单
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  device: null as Device3D | null,
})
const perfSnapshot = ref<PerformanceSnapshot | null>(null)
const aiDragging = ref(false)
const aiMessagePlacement = ref<'left' | 'right'>('left')
const aiOffset = ref({ x: 0, y: 0 })
const aiAssistantStyle = computed(() => ({
  transform: `translate3d(${aiOffset.value.x}px, ${aiOffset.value.y}px, 0)`,
}))
let aiDragPointerId: number | null = null
let aiDragStartX = 0
let aiDragStartY = 0
let aiDragStartOffsetX = 0
let aiDragStartOffsetY = 0
let aiDragStartLeft = 0
let aiDragStartTop = 0
let aiDragMoved = false
let suppressAiNavigation = false

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let labelRenderer: CSS2DRenderer
let controls: OrbitControls
let animationId: number
let startTime = 0
let deviceMeshes: Map<string, { mesh: THREE.Mesh; cone: THREE.Mesh; lens?: THREE.Mesh; pulse?: THREE.Mesh; label?: CSS2DObject }> = new Map()
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

// ── 编辑模式拖拽状态 ──
let isDragging = false
let dragDeviceId: string | null = null
let dragFixedY = 0
let dragPlane: THREE.Plane = new THREE.Plane()
let dragIntersect: THREE.Vector3 = new THREE.Vector3()

/** P1-1: detect if a point falls within a building bounding box */
function detectBuilding(x: number, z: number, buildings: Array<{ name: string; x: number; z: number; w: number; d: number; h: number; color?: string }>): { name: string; x: number; z: number; w: number; d: number; h: number; color?: string } | null {
  for (const b of buildings) {
    const halfW = b.w / 2
    const halfD = b.d / 2
    if (x >= b.x - halfW && x <= b.x + halfW && z >= b.z - halfD && z <= b.z + halfD) {
      return b
    }
  }
  return null
}

/** P1-2: pick building at pointer position */
function pickBuilding(event: MouseEvent): { name: string; x: number; z: number } | null {
  if (!containerRef.value) return null
  const rect = containerRef.value.getBoundingClientRect()
  const w = rect.width || 1
  const h = rect.height || 1
  mouse.x = ((event.clientX - rect.left) / w) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / h) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hit = new THREE.Vector3()
  raycaster.ray.intersectPlane(groundPlane, hit)
  if (!hit) return null
  const buildings = (props.buildings || defaultBuildings) as Array<{ name: string; x: number; z: number; w: number; d: number; h: number; color?: string }>
  const found = detectBuilding(hit.x, hit.z, buildings)
  return found ? { name: found.name, x: found.x, z: found.z } : null
}

// P1-3: building base rings (同色底座) and connection lines
let buildingRings: THREE.Mesh[] = []
let connectionLines: THREE.Line[] = []

// ── P2-1: CAD 底图叠加 ──
let groundImageMesh: THREE.Mesh | null = null
let gltfLoader: GLTFLoader | null = null

// ── P2-2: 2D 建筑绘制模式 ──
let drawStartPoint: THREE.Vector3 | null = null
let drawPreviewMesh: THREE.Mesh | null = null

// ── P2-3: GLB 模型缓存 ──
const loadedModels: Map<string, THREE.Group> = new Map()
const buildingGroups: Map<string, THREE.Group> = new Map()

// ── P2-4: 3D 巡视路线 ──
let patrolCurve: THREE.CatmullRomCurve3 | null = null
let patrolProgress = 0
let patrolSpeed = 0.0002
let isPatrolling = false
let patrolLookTargets: THREE.Vector3[] = []

// ── P2-5: 预案演练动作序列 ──
interface SceneAction {
  time: number
  type: 'camera' | 'visibility' | 'highlight' | 'particle'
  target?: string
  params?: Record<string, number | string | boolean | undefined>
}
let sequenceActions: SceneAction[] = []
let sequenceStartTime = 0
let isPlayingSequence = false
let sequenceFiredIndices = new Set<number>()
let particleSystems: Map<string, THREE.Points> = new Map()

// ── P2-6: 2D 小地图 ──
let miniMapCanvas: HTMLCanvasElement | null = null
let miniMapCtx: CanvasRenderingContext2D | null = null

function updateBuildingAssociations(buildings: any[]) {
  // Remove old rings
  buildingRings.forEach(r => { scene.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose() })
  buildingRings = []
  // Remove old lines
  connectionLines.forEach(l => { scene.remove(l); l.geometry.dispose(); (l.material as THREE.Material).dispose() })
  connectionLines = []

  if (!buildings.length) return

  // For each building, draw a colored ring on the ground
  for (const b of buildings) {
    const color = b.color ? parseHexColor(b.color) : 0x1A73E8
    const ringGeo = new THREE.RingGeometry(
      Math.max(b.w, b.d) / 2 + 0.5,
      Math.max(b.w, b.d) / 2 + 1.0,
      32
    )
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(b.x, 0.05, b.z)
    scene.add(ring)
    buildingRings.push(ring)
  }

  // Draw connection lines from devices to their buildings (edit mode only)
  if (props.editMode) {
    const devices = props.devices || defaultDevices
    for (const dev of devices) {
      const bld = detectBuilding(dev.x, dev.z, buildings)
      if (!bld) continue
      const points = [
        new THREE.Vector3(dev.x, dev.y - 0.5, dev.z),
        new THREE.Vector3(bld.x, bld.h / 2, bld.z),
      ]
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
      const lineMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.3 })
      const line = new THREE.Line(lineGeo, lineMat)
      scene.add(line)
      connectionLines.push(line)
    }
  }
}

// ── P2-1: CAD 底图叠加 ──
/** 加载 CAD/参考底图并叠加到地面 */
function loadGroundImage(url: string) {
  if (!scene) return
  // 移除旧底图
  if (groundImageMesh) {
    scene.remove(groundImageMesh)
    groundImageMesh.geometry.dispose()
    ;(groundImageMesh.material as THREE.Material).dispose()
    groundImageMesh = null
  }
  if (!url) return
  const loader = new THREE.TextureLoader()
  loader.load(url, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace
    const aspect = texture.image.width / texture.image.height
    const planeW = 120
    const planeH = planeW / aspect
    const geo = new THREE.PlaneGeometry(planeW, planeH)
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.6, depthWrite: false })
    groundImageMesh = new THREE.Mesh(geo, mat)
    groundImageMesh.rotation.x = -Math.PI / 2
    groundImageMesh.position.y = 0.02
    scene.add(groundImageMesh)
  })
}

// ── P2-2: 2D 建筑绘制 ──
/** 在地面上获取鼠标投影坐标 */
function getGroundIntersect(event: MouseEvent): THREE.Vector3 | null {
  if (!containerRef.value || !camera) return null
  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hit = new THREE.Vector3()
  const result = raycaster.ray.intersectPlane(groundPlane, hit)
  return result ? hit : null
}

/** 更新建筑绘制预览 */
function updateDrawPreview(start: THREE.Vector3, end: THREE.Vector3) {
  if (drawPreviewMesh) {
    scene.remove(drawPreviewMesh)
    drawPreviewMesh.geometry.dispose()
    ;(drawPreviewMesh.material as THREE.Material).dispose()
  }
  const w = Math.abs(end.x - start.x)
  const d = Math.abs(end.z - start.z)
  const cx = (start.x + end.x) / 2
  const cz = (start.z + end.z) / 2
  if (w < 1 || d < 1) return
  const geo = new THREE.BoxGeometry(w, 0.1, d)
  const mat = new THREE.MeshBasicMaterial({ color: 0x00B4FF, transparent: true, opacity: 0.3 })
  drawPreviewMesh = new THREE.Mesh(geo, mat)
  drawPreviewMesh.position.set(cx, 0.2, cz)
  scene.add(drawPreviewMesh)
}

// ── P2-3: GLB 模型加载 ──
/** 为建筑加载 GLB 模型替换程序化几何体 */
function loadBuildingModel(buildingName: string, modelUrl: string) {
  if (!scene || !modelUrl) return
  if (!gltfLoader) gltfLoader = new GLTFLoader()
  // 检查缓存
  if (loadedModels.has(modelUrl)) {
    const cached = loadedModels.get(modelUrl)!.clone()
    applyModelToBuilding(buildingName, cached)
    return
  }
  gltfLoader.load(modelUrl, (gltf) => {
    loadedModels.set(modelUrl, gltf.scene)
    applyModelToBuilding(buildingName, gltf.scene.clone())
  }, undefined, (err) => {
    console.warn('[Scene3D] GLB load failed:', modelUrl, err)
  })
}

/** 将 GLB 模型应用到建筑（隐藏原 box 几何体） */
function applyModelToBuilding(buildingName: string, model: THREE.Group) {
  // 移除旧 group
  const old = buildingGroups.get(buildingName)
  if (old) { scene.remove(old); buildingGroups.delete(buildingName) }
  // 记录新 group
  buildingGroups.set(buildingName, model)
  scene.add(model)
}

// ── P2-4: 3D 巡视路线 ──
/** 开始自动巡视（沿路径点飞行） */
function startPatrol(waypoints: Array<{ x: number; y: number; z: number }>, speed?: number) {
  if (waypoints.length < 2 || !camera || !controls) return
  const points = waypoints.map(wp => new THREE.Vector3(wp.x, wp.y, wp.z))
  patrolCurve = new THREE.CatmullRomCurve3(points, true)
  patrolProgress = 0
  patrolSpeed = speed ?? 0.0002
  isPatrolling = true
  controls.enabled = false
}

/** 停止巡视 */
function stopPatrol() {
  isPatrolling = false
  patrolCurve = null
  if (controls) controls.enabled = true
}

/** 巡视动画帧更新 */
function updatePatrol() {
  if (!isPatrolling || !patrolCurve || !camera) return
  patrolProgress += patrolSpeed
  if (patrolProgress > 1) patrolProgress = 0
  const pos = patrolCurve.getPointAt(patrolProgress)
  camera.position.copy(pos)
  const lookAhead = patrolCurve.getPointAt((patrolProgress + 0.05) % 1)
  camera.lookAt(lookAhead)
}

// ── P2-5: 预案演练动作序列 ──
/** 播放动作序列 */
function playSequence(actions: SceneAction[]) {
  sequenceActions = actions.sort((a, b) => a.time - b.time)
  sequenceStartTime = performance.now()
  isPlayingSequence = true
  sequenceFiredIndices.clear()
}

/** 停止动作序列 */
function stopSequence() {
  isPlayingSequence = false
  sequenceActions = []
  sequenceFiredIndices.clear()
  // 清理粒子效果
  particleSystems.forEach((ps) => {
    scene.remove(ps)
    ps.geometry.dispose()
    ;(ps.material as THREE.Material).dispose()
  })
  particleSystems.clear()
}

/** 动作序列帧更新 */
function updateSequence() {
  if (!isPlayingSequence || !sequenceActions.length) return
  const elapsed = (performance.now() - sequenceStartTime) / 1000
  for (let i = 0; i < sequenceActions.length; i++) {
    if (sequenceFiredIndices.has(i)) continue
    const action = sequenceActions[i]
    if (elapsed >= action.time) {
      executeAction(action)
      sequenceFiredIndices.add(i)
    }
  }
  // 全部执行完毕
  if (sequenceFiredIndices.size >= sequenceActions.length) {
    isPlayingSequence = false
  }
}

/** 执行单个动作 */
function executeAction(action: SceneAction) {
  switch (action.type) {
    case 'camera': {
      if (camera && action.params) {
        const tx = Number(action.params.x ?? 0)
        const ty = Number(action.params.y ?? 30)
        const tz = Number(action.params.z ?? 0)
        camera.position.set(tx, ty, tz)
        if (controls && action.params.lookX !== undefined) {
          controls.target.set(Number(action.params.lookX), Number(action.params.lookY ?? 0), Number(action.params.lookZ ?? 0))
          controls.update()
        }
      }
      break
    }
    case 'visibility': {
      if (action.target) {
        const group = buildingGroups.get(action.target)
        if (group) group.visible = action.params?.visible !== false
      }
      break
    }
    case 'highlight': {
      if (action.target) {
        const entry = deviceMeshes.get(action.target)
        if (entry?.mesh) {
          const mat = entry.mesh.material as THREE.MeshStandardMaterial
          if (mat.emissive) {
            mat.emissive.setHex(0xFF6600)
            mat.emissiveIntensity = 1.0
          }
        }
      }
      break
    }
    case 'particle': {
      if (action.target && action.params) {
        createParticleSystem(
          action.target,
          Number(action.params.x ?? 0),
          Number(action.params.y ?? 5),
          Number(action.params.z ?? 0),
        )
      }
      break
    }
  }
}

/** 创建简易粒子效果 */
function createParticleSystem(id: string, x: number, y: number, z: number) {
  if (particleSystems.has(id)) return
  const count = 100
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = x + (Math.random() - 0.5) * 4
    positions[i * 3 + 1] = y + Math.random() * 6
    positions[i * 3 + 2] = z + (Math.random() - 0.5) * 4
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({ color: 0xFF6600, size: 0.5, transparent: true, opacity: 0.7 })
  const points = new THREE.Points(geo, mat)
  scene.add(points)
  particleSystems.set(id, points)
}

// ── P2-6: 2D 俯视小地图 ──
/** 初始化小地图 canvas */
function initMiniMap() {
  if (!containerRef.value) return
  // 移除旧 canvas
  if (miniMapCanvas) { miniMapCanvas.remove(); miniMapCanvas = null }
  miniMapCanvas = document.createElement('canvas')
  miniMapCanvas.width = 180
  miniMapCanvas.height = 150
  miniMapCanvas.style.cssText = 'position:absolute;bottom:8px;right:8px;z-index:10;border:1px solid rgba(0,180,255,0.3);border-radius:6px;background:rgba(10,12,16,0.8);pointer-events:auto;cursor:crosshair;'
  miniMapCanvas.addEventListener('click', onMiniMapClick)
  containerRef.value.appendChild(miniMapCanvas)
  miniMapCtx = miniMapCanvas.getContext('2d')
}

/** 小地图点击 → 拾取设备 */
function onMiniMapClick(event: MouseEvent) {
  if (!miniMapCanvas) return
  const rect = miniMapCanvas.getBoundingClientRect()
  const mx = event.clientX - rect.left
  const my = event.clientY - rect.top
  // 转换为场景坐标 (180x150 → 120x100)
  const sceneX = (mx / 180) * 120 - 60
  const sceneZ = (my / 150) * 100 - 50
  // 找最近的设备
  const devices = props.devices || defaultDevices
  let nearest: Device3D | null = null
  let minDist = Infinity
  for (const d of devices) {
    const dist = Math.hypot(d.x - sceneX, d.z - sceneZ)
    if (dist < minDist) { minDist = dist; nearest = d }
  }
  if (nearest && minDist < 10) {
    emit('minimap-select', nearest.id)
  }
}

/** 渲染小地图帧 */
function drawMiniMapFrame() {
  if (!miniMapCtx || !miniMapCanvas) return
  const ctx = miniMapCtx
  ctx.clearRect(0, 0, 180, 150)
  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 180; i += 18) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 150); ctx.stroke() }
  for (let i = 0; i <= 150; i += 15) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(180, i); ctx.stroke() }
  // 建筑
  const buildings = props.buildings || defaultBuildings
  ctx.lineWidth = 1
  for (const b of buildings) {
    const bx = ((b.x + 60) / 120) * 180
    const bz = ((b.z + 50) / 100) * 150
    const bw = (b.w / 120) * 180
    const bd = (b.d / 100) * 150
    ctx.fillStyle = (b.color || '#1A73E8') + '33'
    ctx.strokeStyle = b.color || '#1A73E8'
    ctx.fillRect(bx - bw / 2, bz - bd / 2, bw, bd)
    ctx.strokeRect(bx - bw / 2, bz - bd / 2, bw, bd)
  }
  // 设备
  const devices = props.devices || defaultDevices
  for (const d of devices) {
    const dx = ((d.x + 60) / 120) * 180
    const dz = ((d.z + 50) / 100) * 150
    const colorMap: Record<string, string> = { online: '#0F9D58', alarm: '#DB4437', offline: '#666', maintenance: '#F4B400' }
    ctx.fillStyle = colorMap[d.status] || '#0F9D58'
    ctx.beginPath()
    ctx.arc(dx, dz, d.id === props.selectedDeviceId ? 4 : 2.5, 0, Math.PI * 2)
    ctx.fill()
    if (d.id === props.selectedDeviceId) {
      ctx.strokeStyle = '#FFF'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  // 相机位置指示器
  if (camera) {
    const cx = ((camera.position.x + 60) / 120) * 180
    const cz = ((camera.position.z + 50) / 100) * 150
    ctx.fillStyle = 'rgba(0,180,255,0.8)'
    ctx.beginPath()
    ctx.arc(cx, cz, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

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

function startAiDrag(event: PointerEvent) {
  if (event.button !== 0 || !aiTriggerRef.value) return
  const triggerRect = aiTriggerRef.value.getBoundingClientRect()

  aiDragging.value = true
  aiDragPointerId = event.pointerId
  aiDragStartX = event.clientX
  aiDragStartY = event.clientY
  aiDragStartOffsetX = aiOffset.value.x
  aiDragStartOffsetY = aiOffset.value.y
  aiDragStartLeft = triggerRect.left
  aiDragStartTop = triggerRect.top
  aiDragMoved = false
  aiTriggerRef.value.setPointerCapture(event.pointerId)
}

function moveAiDrag(event: PointerEvent) {
  if (!aiDragging.value || aiDragPointerId !== event.pointerId || !aiTriggerRef.value) return
  const triggerRect = aiTriggerRef.value.getBoundingClientRect()
  const deltaX = event.clientX - aiDragStartX
  const deltaY = event.clientY - aiDragStartY
  const maxLeft = Math.max(0, window.innerWidth - triggerRect.width)
  const maxTop = Math.max(0, window.innerHeight - triggerRect.height)
  const nextLeft = Math.min(maxLeft, Math.max(0, aiDragStartLeft + deltaX))
  const nextTop = Math.min(maxTop, Math.max(0, aiDragStartTop + deltaY))

  if (Math.hypot(deltaX, deltaY) > 4) aiDragMoved = true
  aiMessagePlacement.value = nextLeft < window.innerWidth / 2 ? 'right' : 'left'
  aiOffset.value = {
    x: aiDragStartOffsetX + nextLeft - aiDragStartLeft,
    y: aiDragStartOffsetY + nextTop - aiDragStartTop,
  }
  event.preventDefault()
}

function endAiDrag(event: PointerEvent) {
  if (aiDragPointerId !== event.pointerId) return
  if (aiTriggerRef.value?.hasPointerCapture(event.pointerId)) {
    aiTriggerRef.value.releasePointerCapture(event.pointerId)
  }
  aiDragging.value = false
  aiDragPointerId = null
  if (aiDragMoved) {
    suppressAiNavigation = true
    setTimeout(() => { suppressAiNavigation = false }, 200)
  }
}

function openAiChat() {
  if (suppressAiNavigation) return
  void router.push('/ai-chat')
}

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

  // P2-1: 加载 CAD 底图（如果 prop 提供）
  if (props.groundImageUrl) {
    loadGroundImage(props.groundImageUrl)
  }

  // 围墙（四面）
  createWall(-55, 0, 0, 0.3, 3, 100, 0x1a2040)   // 左
  createWall(55, 0, 0, 0.3, 3, 100, 0x1a2040)    // 右
  createWall(0, 0, -48, 110, 3, 0.3, 0x1a2040)   // 后
  createWall(0, 0, 48, 110, 3, 0.3, 0x1a2040)    // 前

  // ── 建筑 ──
  const buildings = props.buildings || defaultBuildings
  buildings.forEach(b => createBuilding(b))

  // P2-3: 为有模型映射的建筑加载 GLB
  if (props.buildingModels) {
    for (const [name, url] of Object.entries(props.buildingModels)) {
      loadBuildingModel(name, url)
    }
  }

  // P2-6: 初始化小地图
  if (props.showMiniMap) {
    initMiniMap()
  }

  // P1-3: Draw building rings
  updateBuildingAssociations(buildings)

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
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
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

  // P2-5: 记录建筑 mesh 到 buildingGroups 以支持 visibility 动作
  buildingGroups.set(b.name, mesh as unknown as THREE.Group)
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

  const entry = { mesh: body, cone, lens } as any

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

/** 根据指针事件拾取设备（raycast 按位置邻近匹配） */
function pickDevice(event: MouseEvent): Device3D | null {
  if (!containerRef.value) return null
  const rect = containerRef.value.getBoundingClientRect()
  const w = rect.width || 1
  const h = rect.height || 1
  mouse.x = ((event.clientX - rect.left) / w) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / h) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const meshes = Array.from(deviceMeshes.values()).map(e => e.mesh)
  const intersects = raycaster.intersectObjects(meshes)
  if (intersects.length === 0) return null
  const hit = intersects[0].object
  return (props.devices || defaultDevices).find(d =>
    Math.abs(d.x - hit.position.x) < 0.1 && Math.abs(d.z - hit.position.z) < 0.1
  ) || null
}

function onMouseMove(event: MouseEvent) {
  // P2-2: 建筑绘制模式 — 实时预览矩形
  if (props.drawBuildingMode && drawStartPoint) {
    const hit = getGroundIntersect(event)
    if (hit) updateDrawPreview(drawStartPoint, hit)
    return
  }
  // 编辑模式拖拽中：实时更新设备位置
  if (isDragging && dragDeviceId) {
    doDeviceDrag(event)
    return
  }
  const found = pickDevice(event)
  hoveredDevice.value = found
  if (containerRef.value) {
    if (props.editMode && found) {
      containerRef.value.style.cursor = 'move'
    } else {
      containerRef.value.style.cursor = found?.businessId ? 'pointer' : ''
    }
  }
  // P1-2: building hover detection (only when no device hovered)
  if (!found) {
    const bld = pickBuilding(event)
    if (bld) {
      const buildings = props.buildings || defaultBuildings
      emit('building-hover', {
        buildingName: bld.name,
        deviceCount: 0,
        x: bld.x,
        z: bld.z,
      })
    } else {
      emit('building-hover', { buildingName: null, deviceCount: 0, x: 0, z: 0 })
    }
  }
}

/** 编辑模式拖拽中：将设备 mesh 投影到水平面并更新所有子对象 */
function doDeviceDrag(event: MouseEvent) {
  if (!containerRef.value || !camera || !dragDeviceId) return
  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  // 水平面 Y = dragFixedY
  dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, dragFixedY, 0))
  raycaster.ray.intersectPlane(dragPlane, dragIntersect)
  if (!dragIntersect) return

  const entry = deviceMeshes.get(dragDeviceId)
  if (!entry) return
  const nx = dragIntersect.x
  const nz = dragIntersect.z
  // 更新主体 + 镜头 + 视锥 + 脉冲球 + 标签
  entry.mesh.position.x = nx
  entry.mesh.position.z = nz
  if (entry.lens) { entry.lens.position.x = nx; entry.lens.position.z = nz }
  if (entry.cone) { entry.cone.position.x = nx; entry.cone.position.z = nz }
  if (entry.pulse) { entry.pulse.position.x = nx; entry.pulse.position.z = nz }
  if (entry.label) { entry.label.position.x = nx; entry.label.position.z = nz }
}

// ── 点击跳转设备详情 ──
let pointerDownX = 0
let pointerDownY = 0
let pointerDownTime = 0

function onPointerDown(event: MouseEvent) {
  pointerDownX = event.clientX
  pointerDownY = event.clientY
  pointerDownTime = performance.now()

  // P2-2: 建筑绘制模式 — 记录起始点
  if (props.drawBuildingMode) {
    const hit = getGroundIntersect(event)
    if (hit) {
      drawStartPoint = hit.clone()
      event.preventDefault()
    }
    return
  }

  // 编辑模式：开始拖拽设备
  if (props.editMode) {
    const dev = pickDevice(event)
    if (dev) {
      isDragging = true
      dragDeviceId = dev.id
      dragFixedY = dev.y
      controls.enabled = false
      event.preventDefault()
    }
  }
}

function onPointerUp(event: MouseEvent) {
  // P2-2: 建筑绘制模式 — 完成绘制
  if (props.drawBuildingMode && drawStartPoint) {
    const end = getGroundIntersect(event)
    if (end) {
      const w = Math.abs(end.x - drawStartPoint.x)
      const d = Math.abs(end.z - drawStartPoint.z)
      if (w >= 3 && d >= 3) {
        const cx = (drawStartPoint.x + end.x) / 2
        const cz = (drawStartPoint.z + end.z) / 2
        emit('building-create', { x: cx, z: cz, w, d })
      }
    }
    drawStartPoint = null
    if (drawPreviewMesh) {
      scene.remove(drawPreviewMesh)
      drawPreviewMesh.geometry.dispose()
      ;(drawPreviewMesh.material as THREE.Material).dispose()
      drawPreviewMesh = null
    }
    return
  }

  // 编辑模式：结束拖拽并 emit
  if (isDragging && dragDeviceId) {
    const entry = deviceMeshes.get(dragDeviceId)
    isDragging = false
    controls.enabled = true
    if (entry) {
      const buildings = (props.buildings || defaultBuildings) as Array<{ name: string; x: number; z: number; w: number; d: number; h: number; color?: string }>
      const detectedBuilding = detectBuilding(entry.mesh.position.x, entry.mesh.position.z, buildings)
      emit('device-drag', {
        deviceId: dragDeviceId,
        x: entry.mesh.position.x,
        y: dragFixedY,
        z: entry.mesh.position.z,
        buildingId: detectedBuilding?.name,
      })
    }
    dragDeviceId = null
    return
  }

  const dx = event.clientX - pointerDownX
  const dy = event.clientY - pointerDownY
  const dt = performance.now() - pointerDownTime
  // 位移小且时间短 → 判定为点击（排除拖拽旋转视角）
  if (Math.hypot(dx, dy) > 6 || dt > 400) return
  const dev = pickDevice(event)

  // 编辑模式：点击选中设备
  if (props.editMode) {
    if (dev) emit('device-select', dev.id)
    return
  }

  // T4: 非编辑/非绘制模式下，点击设备弹出操作菜单
  if (dev) {
    contextMenu.visible = true
    contextMenu.x = event.clientX
    contextMenu.y = event.clientY
    contextMenu.device = dev
    event.preventDefault()
    return
  }
}

// T4: 关闭上下文菜单
function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.device = null
}

// T4: 实时预览 — emit 给父组件打开视频弹窗
function onDeviceLivePreview() {
  const dev = contextMenu.device
  if (!dev) return
  emit('device-video', { id: dev.id, name: dev.name, businessId: dev.businessId, deviceType: dev.deviceType })
  closeContextMenu()
}

// T4: 录像回放 — 跳转到录像页面
function onDevicePlayback() {
  const dev = contextMenu.device
  if (!dev) return
  closeContextMenu()
  const q = dev.businessId ? `?deviceId=${dev.businessId}` : ''
  void router.push(`/recordings${q}`)
}

// T4: 设备详情 — 跳转到设备详情页
function onDeviceDetailNav() {
  const dev = contextMenu.device
  if (!dev || !dev.businessId) return
  closeContextMenu()
  void router.push(`/devices/${dev.businessId}`)
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

  // P2-4: 巡视路线更新
  updatePatrol()

  // P2-5: 动作序列更新
  updateSequence()

  // P2-6: 小地图渲染（每帧更新）
  if (props.showMiniMap) {
    drawMiniMapFrame()
  }
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
  resetCamera,
  // P2-1
  loadGroundImage,
  // P2-3
  loadBuildingModel,
  // P2-4
  startPatrol,
  stopPatrol,
  // P2-5
  playSequence,
  stopSequence,
  // P2-6
  initMiniMap,
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

// Watch editMode: toggle OrbitControls
watch(() => props.editMode, (isEdit) => {
  if (!controls) return
  controls.enableRotate = !isEdit
  controls.enablePan = !isEdit
  // P1-3: Update connection lines visibility on edit mode toggle
  const buildings = (props.buildings || defaultBuildings) as any[]
  updateBuildingAssociations(buildings)
})

// P2-1: Watch groundImageUrl
watch(() => props.groundImageUrl, (url) => {
  if (url !== undefined) loadGroundImage(url || '')
})

// P2-2: Watch drawBuildingMode — 更改光标样式
watch(() => props.drawBuildingMode, (isDraw) => {
  if (containerRef.value) {
    containerRef.value.style.cursor = isDraw ? 'crosshair' : ''
  }
  if (!isDraw && drawStartPoint) {
    drawStartPoint = null
    if (drawPreviewMesh) {
      scene.remove(drawPreviewMesh)
      drawPreviewMesh = null
    }
  }
})

// P2-3: Watch buildingModels — 新增映射时加载 GLB
watch(() => props.buildingModels, (models) => {
  if (!models || !scene) return
  for (const [name, url] of Object.entries(models)) {
    if (!loadedModels.has(url)) {
      loadBuildingModel(name, url)
    }
  }
}, { deep: true })

// P2-6: Watch showMiniMap
watch(() => props.showMiniMap, (show) => {
  if (show && !miniMapCanvas) {
    initMiniMap()
  } else if (!show && miniMapCanvas) {
    miniMapCanvas.remove()
    miniMapCanvas = null
    miniMapCtx = null
  }
})

onMounted(() => {
  init()
  animate()
})

onUnmounted(() => {
  // 停止巡视/序列
  stopPatrol()
  stopSequence()

  // P2-1: 清理底图
  if (groundImageMesh) {
    groundImageMesh.geometry.dispose()
    ;(groundImageMesh.material as THREE.Material).dispose()
    groundImageMesh = null
  }

  // P2-6: 清理小地图
  if (miniMapCanvas) {
    miniMapCanvas.remove()
    miniMapCanvas = null
    miniMapCtx = null
  }

  // 停止性能采集
  perfCollector?.dispose()
  perfCollector = null

  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  renderer?.domElement.removeEventListener('mousemove', onMouseMove)
  renderer?.domElement.removeEventListener('pointerdown', onPointerDown)
  renderer?.domElement.removeEventListener('pointerup', onPointerUp)

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
  align-items: center;
  justify-content: flex-end;
  /* 防止工具栏超出容器 */
  max-width: calc(100% - 16px);
  width: 100%;
  flex-wrap: wrap;
}

.legend-bar {
  display: flex;
  margin-left: auto;
  gap: 10px;
  font-size: 14px;
  color:#AADDFF;
  padding: 4px 10px;
  border-radius: 4px;
}

.legend-item { display: flex; align-items: center; gap: 4px; }
.legend-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  font-size: 17px;
  line-height: 1;
}
.legend-icon.online { color: #39C76F; }
.legend-icon.alarm { color: #F45B69; animation: pulse-dot 1.5s infinite; }
.legend-icon.offline { color: #667386; }

.scene-tool-button {
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid #05357C;
  border-radius: 2px;
  background: rgba(0, 47, 117, 0.35);
  color: #00B4FF;
  font-family: inherit;
  font-size: 13px;
  line-height: 26px;
  white-space: nowrap;
  cursor: pointer;
}

.scene-tool-button i {
  font-size: 15px;
  line-height: 1;
}

.scene-tool-button:hover,
.scene-tool-button:focus-visible {
  border-color: #00B4FF;
  background: #003076;
  outline: none;
}

.scene-ai-assistant {
  position: fixed;
  right: 14px;
  bottom: 12px;
  z-index: 3000;
  width: 100px;
  height: 100px;
  will-change: transform;
}

.ai-message {
  position: absolute;
  top: 50%;
  right: 110px;
  box-sizing: border-box;
  /*width: 340px;*/
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px 12px;
  border: 1px solid #05357C;
  border-radius: 8px;
  background: #002F75;
  color: #03C6DE;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-50%) translateX(6px);
  pointer-events: none;
  transition: opacity 0.12s ease, transform 0.12s ease, visibility 0s linear 0.12s;
}

.ai-trigger:hover + .ai-message,
.ai-trigger:focus-visible + .ai-message {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%) translateX(0);
  transition-delay: 0s;
}

.ai-message span {
  display: block;
  width: max-content;
}

.scene-ai-assistant.message-on-right .ai-message {
  right: auto;
  left: 110px;
  transform: translateY(-50%) translateX(-6px);
}

.scene-ai-assistant.message-on-right .ai-trigger:hover + .ai-message,
.scene-ai-assistant.message-on-right .ai-trigger:focus-visible + .ai-message {
  transform: translateY(-50%) translateX(0);
}

.ai-trigger {
  width: 100px;
  height: 100px;
  display: block;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.scene-ai-assistant.dragging .ai-trigger {
  cursor: grabbing;
}

.ai-trigger:focus-visible {
  outline: 1px solid #00B4FF;
  outline-offset: 2px;
}

.ai-trigger img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

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
.tooltip-hint { font-size: 10px; color: #1A73E8; margin-top: 6px; border-top: 1px solid #1E2028; padding-top: 4px; }

/* T4: 设备操作上下文菜单 */
.context-menu-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9998;
  background: transparent;
}

.device-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  background: rgba(3, 27, 78, 0.96);
  border: 1px solid rgba(0, 180, 255, 0.5);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(0, 180, 255, 0.15);
  padding: 4px 0;
  backdrop-filter: blur(8px);
}

.context-menu-header {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #00E4FF;
  border-bottom: 1px solid rgba(0, 180, 255, 0.2);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: #AADDFF;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.context-menu-item:hover {
  background: rgba(0, 180, 255, 0.15);
  color: #00E4FF;
}

.context-menu-item i {
  font-size: 16px;
  width: 18px;
  text-align: center;
}
</style>
