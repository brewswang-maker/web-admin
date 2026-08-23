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
          <i class="iconfont1 icon1-monitor-camera-full legend-icon online" aria-hidden="true"></i>
          在线设备
        </span>
        <span class="legend-item">
          <i class="iconfont1 icon1-monitor-camera-full legend-icon alarm" aria-hidden="true"></i>
          告警点位
        </span>
        <span class="legend-item">
          <i class="iconfont1 icon1-monitor-camera-full legend-icon offline" aria-hidden="true"></i>
          离线设备
        </span>
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
        <!-- [WEB-GLB v1.9.8] 视频投放入口: 仅投 3D LED 大屏动态纹理, 不再弹预览窗;
             正在投放的设备菜单项切换为"停止投放" (toggle), 其它设备点击则切换投放源 -->
        <button
          class="context-menu-item"
          :class="{ 'context-menu-casting': isCastingThisDevice }"
          type="button"
          @click="onDeviceCastToBoard"
        >
          <i class="iconfont1 icon1-yingyanshexiangtou" aria-hidden="true"></i>
          <span>{{ isCastingThisDevice ? '停止投放' : '投放至大屏' }}</span>
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
// [WEB-GLB v1.8.0] 对标 Sketchfab 渲染管线调研结论:
// Sketchfab viewer 对户外模型使用 HDR 天空环境 IBL + ACES tone mapping
// (Sketchfab PBR 渲染文档); v1.6.0 的 RoomEnvironment 是室内箱体环境,
// 金属屋顶反射出室内灯带而非天空, 是与 Sketchfab 观感差距的主因。
// 改用 three.js 官方 Sky (Preetham 物理天空模型, 示例 webgl_shaders_sky 同款)
// 经 PMREMGenerator 生成户外环境贴图; 仅用于 IBL 反射, 不改变暗色背景风格
import { Sky } from 'three/examples/jsm/objects/Sky.js'
// [v1.9.4] 设备 3D 形态改造: 多部件几何合并为单 Mesh (保持 pickDevice
// 邻近匹配的 position=设备坐标 约束, 见 createDevice 注释)
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  PerformanceCollector,
  formatPerformanceReport,
  type PerformanceSnapshot,
  type PerformanceReport,
} from '@/utils/performance'
import aiGif from '@/assets/ai.gif'
import { DEFAULT_DEVICES, DEFAULT_BUILDINGS, STADIUM_SCENE_META } from './scene3d/constants/defaultSceneData'
import type { Building3DNode, SceneMeta } from './scene3d/types/scene3d'

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
  buildings?: Building3DNode[]
  /** 场景参数（地面尺寸/周界/方位角/装饰层开关），缺省兼容旧 120×100 场景 */
  sceneMeta?: SceneMeta
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
  /** [WEB-GLB v1.9.8] 正在 LED 大屏投放的设备 id（菜单项切换"停止投放"） */
  castingDeviceId?: string
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
  /** [WEB-GLB v1.9.8] 设备视频投放至 3D LED 大屏（仅 VideoTexture, 不弹窗; 
   *  同设备再次触发 = 停止投放, 异设备触发 = 切换投放源） */
  'device-cast': [device: { id: string; name: string; businessId?: string; deviceType?: string }]
}>()

const router = useRouter()
const containerRef = ref<HTMLElement>()
const aiTriggerRef = ref<HTMLButtonElement>()
const alarmPulse = ref(true)
const showLabels = ref(true)
const showPerfPanel = ref(props.showPerformance ?? false)
const hoveredDevice = ref<Device3D | null>(null)

// [WEB-GLB v1.9.8] 当前菜单设备是否正在向 LED 大屏投放 (菜单项切换"停止投放")
const isCastingThisDevice = computed(
  () => !!props.castingDeviceId && props.castingDeviceId === contextMenu.device?.id,
)

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
let sceneDecorEnabled = true
let deviceMeshes: Map<string, { mesh: THREE.Mesh; lens?: THREE.Mesh; pulse?: THREE.Mesh; label?: CSS2DObject }> = new Map()
let raycaster: THREE.Raycaster
let mouse: THREE.Vector2
let resizeObserver: ResizeObserver | null = null

// ── [WEB-GLB v1.9.0] 体育场层级容器（跟随场景整体缩放/旋转/平移）──
// 依据: three.js 官方 SceneGraph 文档 — 子节点继承父级 Group 的矩阵变换。
// 初始为 identity 变换（世界坐标 = 配置坐标），因此 pickDevice 的世界坐标
// 邻近匹配 / doDeviceDrag / minimap 等既有逻辑全部兼容；体育场 GLB、LED 大屏
// 与设备图标统一挂载到此层级，整体变换时不脱节、不错位、不残留原位
let stadiumGroup: THREE.Group

// ── [WEB-GLB v1.9.0] LED 大屏视频投放状态 ──
/** 4 块 LED 大屏 mesh（board 分支创建时收集，供 VideoTexture 材质替换） */
let boardMeshes: THREE.Mesh[] = []
/** 投放前的原屏面材质（关闭投放时还原） */
let boardOriginalMaterials: THREE.Material[] = []
/** 投放用动态视频纹理（three 0.184 VideoTexture: 构造时自动注册
 *  requestVideoFrameCallback 逐帧刷新 needsUpdate, dispose 时自动取消） */
let boardVideoTexture: THREE.VideoTexture | null = null
/** 投放用共享材质（VideoTexture 挂 map; MeshBasicMaterial 不受灯光/阴影影响, */
let boardCastMaterial: THREE.MeshBasicMaterial | null = null
/** 投放激活标志（animate 连续渲染判定: VideoTexture 每帧有新内容需持续 render） */
let isCastingVideo = false

// ── [WEB-GLB v1.9.0] 交互流畅度: 拾取缓存与复用对象（消除高频分配）──
/** 设备拾取网格缓存（避免每次 mousemove 重建数组，设备增删时置 dirty） */
let deviceMeshList: THREE.Mesh[] = []
let deviceMeshListDirty = true
/** 地面拾取复用 Plane/Vector3（原 pickBuilding 每次 new, 60~120Hz mousemove 下持续 GC 压力） */
const groundPickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const groundPickPoint = new THREE.Vector3()
/** 拖拽平面复用向量（原 doDeviceDrag 每次 new 两个 Vector3） */
const dragUpNormal = new THREE.Vector3(0, 1, 0)
const dragPlanePoint = new THREE.Vector3()

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
function detectBuilding(x: number, z: number, buildings: Building3DNode[]): Building3DNode | null {
  for (const b of buildings) {
    if (b.shape === 'anchor') continue
    const w = b.w ?? (b.rx ?? 3) * 2
    const d = b.d ?? (b.rz ?? 3) * 2
    const halfW = w / 2
    const halfD = d / 2
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
  // [WEB-GLB v1.9.0] 复用 groundPickPlane/groundPickPoint (见声明处注释):
  // 消除高频 mousemove 路径的临时 Plane/Vector3 分配; 并改为校验
  // intersectPlane 返回值 (three.js 官方 API: 未命中返回 null, 命中返回 target)
  const hit = raycaster.ray.intersectPlane(groundPickPlane, groundPickPoint)
  if (!hit) return null
  const buildings = (props.buildings || defaultBuildings) as Building3DNode[]
  const found = detectBuilding(hit.x, hit.z, buildings)
  return found ? { name: found.name, x: found.x, z: found.z } : null
}

// P1-3: building base rings (同色底座) and connection lines
let buildingRings: THREE.Mesh[] = []
let connectionLines: THREE.Line[] = []

// ── P2-1: CAD 底图叠加 ──
let groundImageMesh: THREE.Mesh | null = null
let gltfLoader: GLTFLoader | null = null
// [WEB-GLB v1.7.0] 各向异性过滤上限 (init 时从 renderer.capabilities 获取)。
// glTF 贴图斜视角采样必须靠 anisotropy 保清晰 (three.js GLTFLoader FAQ 推荐项)
let maxAnisotropy = 1
// [WEB-GLB v1.8.0] 按需渲染脏标记 (three.js 官方 OrbitControls 'change' 事件驱动模式):
// 相机无变化且无动画时跳过 WebGL render, 空闲帧 GPU 归零, 交互帧独享算力
let renderDirty = true
function requestRender() { renderDirty = true }

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

  // [WEB-GLB v1.9.2] 建筑底座环已移除 (用户反馈): 参数化模式遗留装饰, 会在
  // GLB 体育场中心草皮 (shape=model 条目无 w/d/rx/rz, 走默认 foot=6) 与 4 块
  // LED 大屏脚下画半透明圆环, 属"残留背景"; buildingRings 数组保留 (恒空)
  // 供上方 dispose 逻辑复用, editMode 设备-建筑连接线功能不受影响。

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
  // [WEB-GLB v1.8.0] 环/连接线重建后标脏渲染
  requestRender()
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
    requestRender()
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
  // [WEB-GLB v1.9.0] 复用拾取平面/交点对象 (高频 mousemove 路径零分配);
  // 调用方 (updateDrawPreview 只读 / drawStartPoint = hit.clone()) 均安全
  const result = raycaster.ray.intersectPlane(groundPickPlane, groundPickPoint)
  return result ? groundPickPoint : null
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
function loadBuildingModel(buildingName: string, modelUrl: string, transform?: { scale?: number; rotationDeg?: number; offsetY?: number }) {
  if (!scene || !modelUrl) return
  if (!gltfLoader) gltfLoader = new GLTFLoader()
  // 检查缓存
  if (loadedModels.has(modelUrl)) {
    const cached = loadedModels.get(modelUrl)!.clone()
    applyModelToBuilding(buildingName, cached, transform)
    return
  }
  gltfLoader.load(modelUrl, (gltf) => {
    loadedModels.set(modelUrl, gltf.scene)
    applyModelToBuilding(buildingName, gltf.scene.clone(), transform)
  }, undefined, (err) => {
    console.warn('[Scene3D] GLB load failed:', modelUrl, err)
  })
}

/** 将 GLB 模型应用到建筑（隐藏原 box 几何体）；
 *  可选 transform 支持缩放/旋转/垂直偏移以适配场景坐标。
 *  [WEB-GLB v1.6.0] 依据 three.js 官方 GLTFLoader 指南 (jb51/CSDN 参考文章同款):
 *  加载后必须 traverse 子节点配置阴影与材质; 节点层级/scale/rotation 由 GLTFLoader
 *  按 glTF 2.0 规范还原, 此处仅在根节点叠加业务 transform (T·R·S 顺序正确) */
function applyModelToBuilding(buildingName: string, model: THREE.Group, transform?: { scale?: number; rotationDeg?: number; offsetY?: number }) {
  // 移除旧 group
  const old = buildingGroups.get(buildingName)
  // [WEB-GLB v1.9.0] 从体育场层级移除旧 group (与 add 对称)
  if (old) { stadiumGroup.remove(old); buildingGroups.delete(buildingName) }
  // 应用 transform（根节点）
  if (transform?.scale && transform.scale !== 1) model.scale.setScalar(transform.scale)
  if (transform?.rotationDeg) model.rotation.y = (transform.rotationDeg * Math.PI) / 180
  if (transform?.offsetY) model.position.y = transform.offsetY
  // traverse 修正材质渲染行为（不改动任何几何/变换，保证 1:1 还原）
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true
      child.receiveShadow = true
      // GLB 模型不受场景暗雾影响，保持原始材质色彩
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) {
        if (!m) continue
        m.fog = false
        // [WEB-GLB v1.7.0] 清晰度修复 1/2: 各向异性过滤。
        // GLTFLoader 不自动设 anisotropy (默认 1), 草皮 2048×1024 贴图在
        // 斜视角下采样退化发糊; 设到 GPU 上限后斜视纹理清晰度显著提升
        // (three.js 官方 GLTFLoader FAQ / webgl_loader_gltf 同款做法)
        const std = m as THREE.MeshStandardMaterial
        const texSlots: Array<THREE.Texture | null | undefined> = [
          std.map, std.normalMap, std.roughnessMap, std.metalnessMap,
          std.aoMap, std.emissiveMap,
        ]
        for (const tex of texSlots) {
          if (tex && tex.anisotropy < maxAnisotropy) {
            tex.anisotropy = maxAnisotropy
            tex.needsUpdate = true
          }
        }
        // [WEB-GLB v1.7.0] 清晰度修复 2/2: 适当提升 IBL 反射强度,
        // 让高 metallic 材质 (看台铜顶/金属构0.9~1.0) 细节更鲜明
        if (std.envMapIntensity !== undefined) std.envMapIntensity = 1.25
      }
    }
  })
  // 记录新 group
  buildingGroups.set(buildingName, model)
  // [WEB-GLB v1.9.0] GLB 挂载体育场层级 stadiumGroup: 跟随场景整体缩放/旋转/
  // 平移 (three.js 官方 SceneGraph 文档: 子节点继承父级矩阵变换)
  stadiumGroup.add(model)
  // [WEB-GLB v1.8.0] 静态阴影模式: 新 GLB 几何入场景后需单次刷新 shadow map
  // (autoUpdate=false 时不会自动重算), 并标脏触发一帧渲染
  renderer.shadowMap.needsUpdate = true
  requestRender()
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
  // [WEB-GLB v1.8.0] 连续动画结束: 补一帧渲染收尾
  requestRender()
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
  // [WEB-GLB v1.8.0] 粒子清理后标脏渲染收尾
  requestRender()
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
  // [WEB-GLB v1.8.0] 相机/可见性/高亮/粒子变更后标脏渲染
  requestRender()
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

/**
 * [v1.9.4] 设备标签图标着色表（替代原 emoji 圆点 statusIcon）。
 * 标签用 iconfont 摄像头字符 icon1-monitor-camera-full + 状态着色，
 * 与图例 legend-icon 同一字符同一色系，视觉统一。
 */
const DEVICE_ICON_COLORS: Record<string, string> = {
  online: '#39C76F',
  alarm: '#F45B69',
  offline: '#667386',
  maintenance: '#F4B400',
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

// ── 默认场景数据（体育场，与 box-sdk/config/scene_config.json 同源）──
const defaultDevices = DEFAULT_DEVICES as Device3D[]

const defaultBuildings: Building3DNode[] = DEFAULT_BUILDINGS

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
  // [WEB-GLB v1.9.0] 体育场层级容器（identity 初始变换, 见声明处注释）
  stadiumGroup = new THREE.Group()
  scene.add(stadiumGroup)
  // [WEB-GLB v1.6.0] 雾密度 0.008→0.0035: 原密度在相机距离 80m 处将模型
  // 40% 混入暗背景, 导致"部分看不到/发灰"; 新密度同距离仅 ~7%
  scene.fog = new THREE.FogExp2(0x0a0c10, 0.0035)

  // Camera
  // [WEB-GLB v1.6.0] 基于 glTF 2.0 规范严格校验后的修正:
  // GLB 实际几何 (POSITION accessor min/max): 草皮 y=0, 看台 y=0→30.7×0.5=15.4,
  // 屋顶 y=37→57×0.5=18.5→28.5。模型中心视觉焦点在 y≈5 (看台中段)
  // near 0.1→1.0: 深度缓冲 near/far 比率从 1:5000 降到 1:500,
  // 消除 GLB 草皮(y=0)与看台底板(y=0)的 z-fighting 闪烁/黑斑
  camera = new THREE.PerspectiveCamera(50, safeW / safeH, 1.0, 500)
  // [v1.9.5] 默认相机回滚 (52,46,64)→(45,35,55): v1.9.4 拉远是为收纳
  // CAM_14 波浪馆东入口标签(原屏幕 y=1097 超 1080 视口)，该场外点位已删；
  // 馆内 11 台 + 真机场边兜底位(z≤24)全部在 (45,35,55) 视野内
  camera.position.set(45, 35, 55)
  camera.lookAt(0, 5, 0)

  // Renderer
  // [WEB-GLB v1.7.0] 清晰度修复: 回退 v1.5 性能降级, 恢复高质量渲染管线。
  // 1) MSAA 4x (antialias:true) 替代 FXAA 后处理——FXAA 原理上牺牲锐度换平滑,
  //    是"画面发糊"的直接来源之一; MSAA 在几何边缘做多点采样, 不模糊纹理
  // 2) pixelRatio 1.5→2 (three.js 官方推荐 min(DPR, 2)): 高分屏下画布物理
  //    分辨率不足是整体模糊的直接来源
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setSize(safeW, safeH)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
  renderer.shadowMap.enabled = true
  // [WEB-GLB v1.7.0] BasicShadowMap → PCFSoftShadowMap: 软阴影边缘平滑,
  // 消除 Basic 硬锅齿造成的画面脏感 (官方示例默认 PCFSoft)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // [WEB-GLB v1.8.0] 静态阴影 (three.js 官方文档 WebGLRenderer.shadowMap.autoUpdate):
  // 场景光源/几何静态时关闭阴影逐帧重渲染, 节省每帧 2048×2048 shadow pass
  // (65+ GLB mesh 重绘) ——交互帧率提升的最大来源;
  // GLB 加载完成/设备拖拽时置 needsUpdate=true 单次刷新
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  // [WEB-GLB v1.6.0] 官方示例 webgl_loader_gltf 标准配置: ACES 色调映射。
  // GLB 材质为 PBR (pbrMetallicRoughness), 无 toneMapping 时高光溢出、
  // 中间调发灰——"球场质量太差"的直接原因之一 (three.js 官方 glTF 加载指南)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // [WEB-GLB v1.8.0] exposure 1.1→1.0: Sky 户外 IBL 照明量高于 RoomEnvironment,
  // 回调曝光避免高光过曝 (ACES 官方推荐区间 0.8~1.2)
  renderer.toneMappingExposure = 1.0
  container.appendChild(renderer.domElement)

  // [WEB-GLB v1.8.0] 户外天空 IBL: Sky (Preetham 物理天空) → PMREMGenerator。
  // 依据: Sketchfab viewer 对户外场景用天空 HDR 环境驱动 PBR 反射/漫射;
  // three.js 官方示例 webgl_shaders_sky 参数化模式 (turbidity/rayleigh/mie)。
  // 一次性生成 (~10ms), 无逐帧开销; 太阳方位与 dirLight (60,80,40) 保持一致
  const sky = new Sky()
  sky.scale.setScalar(2000)
  const skyUniforms = sky.material.uniforms
  skyUniforms['turbidity'].value = 6
  skyUniforms['rayleigh'].value = 1.8
  skyUniforms['mieCoefficient'].value = 0.005
  skyUniforms['mieDirectionalG'].value = 0.8
  const sunPosition = new THREE.Vector3().setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(35),
  )
  skyUniforms['sunPosition'].value.copy(sunPosition)
  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  envScene.add(sky)
  scene.environment = pmremGenerator.fromScene(envScene, 0.04).texture
  pmremGenerator.dispose()
  // 背景仍保持暗色数字孪生风格 (0x0a0c10), Sky 仅贡献 IBL
  // [WEB-GLB v1.7.0] EffectComposer/FXAA 管线已移除: 直接 renderer.render(),
  // MSAA 在默认帧缓冲中生效 (FXAA 后处理无法访问 MSAA 缓冲且自带模糊)

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
  // [WEB-GLB v1.8.0] 交互响应: rotate/zoom 速度 1.0→1.15 (OrbitControls 官方参数),
  // 手感更跟手; dampingFactor 保持 0.08 平滑惯性
  controls.rotateSpeed = 1.15
  controls.zoomSpeed = 1.15
  // [WEB-GLB v1.8.0] 按需渲染: 相机变化时标脏 (官方 'change' 事件契约)
  controls.addEventListener('change', requestRender)
  controls.maxPolarAngle = Math.PI / 2.2
  controls.minDistance = 20
  controls.maxDistance = 100
  // [WEB-GLB v1.6.0] v1.5.0 target 修正: GLB 草皮实际在 y=0 (glTF 规范校验),
  // 看台 scale=0.5 后高 ~15.4, 视觉焦点取看台中段 y=5
  controls.target.set(0, 5, 0)

  startTime = performance.now()
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  // ── 灯光 (性能优化: 减灯减阴影) ──
  // [WEB-GLB 2026-08-21] 方案 A 优化: 仅保留 3 盏灯 (删除 fillLight2 与 stadiumInterior pointLight)
  // 每盏灯都增加 fragment shader 开销, PointLight 尤甚
  // [WEB-GLB v1.6.0] IBL 环境贴图已提供基础照明, ambient/hemi 适当下调避免过曝
  // [WEB-GLB v1.8.0] Sky 户外 IBL 漫射分量更强, 再下调避免发白:
  // ambient 0.8→0.5, hemi 0.6→0.4
  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambient)

  // 半球光 (天光 + 地面反射)
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.4)
  hemiLight.position.set(0, 80, 0)
  scene.add(hemiLight)

  // 主方向光 (太阳) - 唯一投射阴影的灯
  const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.4)
  dirLight.position.set(60, 80, 40)
  dirLight.castShadow = true
  // [WEB-GLB 2026-08-21] shadow.mapSize 2048→1024 (4x 速度提升, 阴影略显粗但不明显)
  // [WEB-GLB v1.7.0] 回调 2048: PCFSoft 配合高分辨率 shadow map 边缘更细腻
  dirLight.shadow.mapSize.set(2048, 2048)
  // [WEB-GLB 2026-08-21] v1.5.0 阴影相机范围缩小 (模型 scale=0.5, ground 80×55)
  dirLight.shadow.camera.left = -45; dirLight.shadow.camera.right = 45
  dirLight.shadow.camera.top = 35; dirLight.shadow.camera.bottom = -35
  dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 150
  // [WEB-GLB v1.8.0] 阴影 bias (three.js 官方 LightShadow 文档):
  // bias 防阴影痤疮(acne), normalBias 沿法线偏移防大场景浮影/peter-panning;
  // 消除看台曲面上阴影黑斑, 提升材质表面观感
  dirLight.shadow.bias = -0.0004
  dirLight.shadow.normalBias = 0.02
  scene.add(dirLight)

  // 补光 (不开阴影)
  const fillLight1 = new THREE.DirectionalLight(0xffe8c8, 0.5)
  fillLight1.position.set(-40, 50, -20)
  scene.add(fillLight1)
  // fillLight2 与 stadiumInterior PointLight 已删除 (性能)

  // ── 地面（尺寸读场景参数，默认 120×100 兼容旧场景）──
  const sceneMeta = props.sceneMeta ?? (props.buildings ? undefined : STADIUM_SCENE_META)
  sceneDecorEnabled = sceneMeta?.decor ?? true
  const groundW = sceneMeta?.ground?.width ?? 120
  const groundH = sceneMeta?.ground?.height ?? 100
  // [WEB-GLB v1.9.2] periHalfW/periHalfD (周界围墙参数) 随四面围墙一并移除
  const groundGeo = new THREE.PlaneGeometry(groundW, groundH)
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x151820,
    roughness: 0.9,
    metalness: 0.1,
  })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  // [WEB-GLB v1.6.0] 下沉 0.05: GLB 草皮与看台底板都在 y=0 (包围盒校验),
  // 参数化地面与其共面会 z-fighting; 下沉后仅作体育场外围基底
  ground.position.y = -0.05
  ground.receiveShadow = true
  scene.add(ground)

  // [WEB-GLB v1.9.2] 网格线已移除 (用户反馈): GridHelper 是参数化模式遗留,
  // 在体育场外围地面残留网格背景, 与 GLB 1:1 体育场观感冲突。

  // P2-1: 加载 CAD 底图（如果 prop 提供）
  if (props.groundImageUrl) {
    loadGroundImage(props.groundImageUrl)
  }

  // [WEB-GLB v1.9.2] 四面围墙 + 顶部发光线已移除 (用户反馈): 参数化模式
  // 遗留的半透明围墙 (h=3) 圈住体育场四周, 属"残留背景", 干扰 GLB 整体观感。

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
  // [WEB-GLB v1.8.0] 新设备入场景: 单次刷新阴影 + 标脏渲染
  renderer.shadowMap.needsUpdate = true
  requestRender()
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
  // [WEB-GLB v1.8.0] 设备移除后刷新阴影 + 标脏
  renderer.shadowMap.needsUpdate = true
  requestRender()
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
  // [WEB-GLB v1.8.0] 设备重新入场景: 刷新阴影 + 标脏
  renderer.shadowMap.needsUpdate = true
  requestRender()
}

// [WEB-GLB v1.9.2] createWall 函数已移除: 四面围墙 + 顶部发光线属参数化
// 模式遗留"残留背景" (用户反馈), 唯一调用点 (init 围墙段) 已同步删除。

// ══ 建筑形状渲染（形状元与内置应用端 StadiumScene3D.qml 1:1 对应）══

function buildingMaterial(b: Building3DNode, color: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: b.opacity ?? 0.35,
    roughness: 0.7,
    metalness: 0.2,
    side: THREE.DoubleSide,
  })
  if (b.emissive) {
    mat.emissive = new THREE.Color(parseHexColor(b.emissive))
    mat.emissiveIntensity = 0.6
  }
  return mat
}

/** 椭圆 disc（扁圆柱），支持 stack 错位叠放（波浪馆/建筑群） */
function addDiscMesh(b: Building3DNode, color: number, radiusX: number, radiusZ: number, height: number, baseY: number, stack = 1): THREE.Mesh {
  let mesh: THREE.Mesh | null = null
  for (let i = 0; i < stack; i++) {
    const shrink = 1 - i * 0.12
    const geo = new THREE.CylinderGeometry(radiusX * shrink, radiusX * shrink, height, 32)
    const m = new THREE.Mesh(geo, buildingMaterial(b, color))
    m.position.set(b.x + i * 0.8, baseY + height / 2 + i * height, b.z + i * 0.6)
    m.scale.z = radiusZ / radiusX
    m.castShadow = true
    m.receiveShadow = true
    scene.add(m)
    if (!mesh) mesh = m
  }
  return mesh!
}

function addBuildingEdges(geo: THREE.BufferGeometry, color: number, position: THREE.Vector3, scaleZ = 1, rotationY = 0) {
  const edges = new THREE.EdgesGeometry(geo)
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }))
  line.position.copy(position)
  line.scale.z = scaleZ
  // [WEB-GLB v1.9.0] 新增 rotationY 参数: 边线随主体朝向同步旋转 (board
  // thetaDeg); 同时挂体育场层级, 与主体 mesh 同父级不脱节
  if (rotationY) line.rotation.y = rotationY
  stadiumGroup.add(line)
}

function addBuildingLabel(b: Building3DNode, topY: number) {
  const labelDiv = document.createElement('div')
  labelDiv.className = 'building-label'
  labelDiv.textContent = b.name
  labelDiv.style.cssText = 'color:rgba(255,255,255,0.5);font-size:10px;font-family:system-ui;text-align:center;white-space:nowrap;'
  const label = new CSS2DObject(labelDiv)
  label.position.set(b.x, topY + 1, b.z)
  scene.add(label)
}

// [WEB-GLB 2026-08-21] v1.4.0: addPitchLines 整体废弃 (GLB 已含草坪+标线)
function addPitchLines(b: Building3DNode, topY: number): void {
  // no-op: GLB 已含完整草坪+标线+球门+角旗
}

function addFlagpoles(b: Building3DNode) {
  const n = b.flagpoles ?? 3
  const rx = b.rx ?? 3
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xB8C4D8, roughness: 0.4, metalness: 0.6 })
  for (let i = 0; i < n; i++) {
    const geo = new THREE.CylinderGeometry(0.06, 0.08, 5, 6)
    const pole = new THREE.Mesh(geo, poleMat)
    pole.position.set(b.x - rx / 2 + (i * rx) / Math.max(n - 1, 1), 2.5, b.z)
    scene.add(pole)
  }
}

function addBuilding(b: Building3DNode, color: number): { topY: number; mesh: THREE.Mesh } {
  const h = b.h ?? 6
  switch (b.shape) {
    // [WEB-GLB 2026-08-21] 方案 B-prime: Three.js 几何拼接 "Lusail 风" 风格化散件
    case 'palm-tree': {
      // 中东风棕榈树: 树干 (圆柱) + 8片叶子 (扁锥形) + 椰果簇
      const trunkH = h
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, trunkH, 8)
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6B4F3A, roughness: 0.9 })
      const trunk = new THREE.Mesh(trunkGeo, trunkMat)
      trunk.position.set(b.x, trunkH / 2, b.z)
      trunk.castShadow = true
      scene.add(trunk)
      // 叶簇 (8片扇形)
      const leafMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 })
      for (let i = 0; i < 8; i++) {
        const leafGeo = new THREE.ConeGeometry(0.85, 2.5, 4, 1, true)
        const leaf = new THREE.Mesh(leafGeo, leafMat)
        const angle = (i / 8) * Math.PI * 2
        leaf.position.set(b.x + Math.cos(angle) * 1.0, trunkH + 1.2, b.z + Math.sin(angle) * 1.0)
        leaf.rotation.z = Math.PI / 2 - 0.5
        leaf.rotation.y = angle
        scene.add(leaf)
      }
      // 椰果簇
      for (let i = 0; i < 5; i++) {
        const cocoGeo = new THREE.SphereGeometry(0.18, 6, 6)
        const coco = new THREE.Mesh(cocoGeo, new THREE.MeshStandardMaterial({ color: 0x4A2A18 }))
        const angle = (i / 5) * Math.PI * 2
        coco.position.set(b.x + Math.cos(angle) * 0.5, trunkH + 0.8, b.z + Math.sin(angle) * 0.5)
        scene.add(coco)
      }
      return { topY: trunkH + 2.5, mesh: trunk }
    }
    case 'street-lamp': {
      // 路灯: 底座 + 圆柱杆 + 弯曲横杆 + 灯头 (发光球)
      const totalH = h
      const baseGeo = new THREE.BoxGeometry(0.8, 0.5, 0.8)
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x2A3140, roughness: 0.6 })
      const base = new THREE.Mesh(baseGeo, baseMat)
      base.position.set(b.x, 0.25, b.z)
      scene.add(base)
      // 杆
      const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, totalH - 0.5, 8)
      const pole = new THREE.Mesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x555E70, roughness: 0.4, metalness: 0.6 }))
      pole.position.set(b.x, (totalH - 0.5) / 2 + 0.5, b.z)
      pole.castShadow = true
      scene.add(pole)
      // 横杆 (向体育场方向伸出)
      const armLen = 2.5
      const armGeo = new THREE.CylinderGeometry(0.06, 0.06, armLen, 6)
      const arm = new THREE.Mesh(armGeo, pole.material)
      arm.position.set(b.x + armLen / 2 - 0.2, totalH - 0.8, b.z)
      arm.rotation.z = Math.PI / 2
      scene.add(arm)
      // 灯头
      const lampGeo = new THREE.SphereGeometry(0.4, 12, 12)
      const lampMat = new THREE.MeshStandardMaterial({
        color: 0xFFF5D0, emissive: 0xFFC850, emissiveIntensity: 0.9,
        transparent: true, opacity: 0.95,
      })
      const lamp = new THREE.Mesh(lampGeo, lampMat)
      lamp.position.set(b.x + armLen - 0.4, totalH - 0.8, b.z)
      scene.add(lamp)
      // 灯下点光源
      const ptLight = new THREE.PointLight(0xFFC850, 0.6, 8)
      ptLight.position.set(b.x + armLen - 0.4, totalH - 0.8, b.z)
      scene.add(ptLight)
      return { topY: totalH, mesh: pole }
    }
    case 'metro-arch': {
      // 地铁站入口拱门: 双立柱 + 拱顶 + 站名牌
      const totalH = h
      const archW = b.w ?? 8
      const archD = 4
      const stoneMat = new THREE.MeshStandardMaterial({ color: color ?? 0xD9C7A0, roughness: 0.7 })
      // 左立柱
      const leftCol = new THREE.Mesh(
        new THREE.BoxGeometry(1, totalH, archD),
        stoneMat,
      )
      leftCol.position.set(b.x - archW / 2, totalH / 2, b.z)
      leftCol.castShadow = true
      scene.add(leftCol)
      // 右立柱
      const rightCol = new THREE.Mesh(
        new THREE.BoxGeometry(1, totalH, archD),
        stoneMat,
      )
      rightCol.position.set(b.x + archW / 2, totalH / 2, b.z)
      rightCol.castShadow = true
      scene.add(rightCol)
      // 拱顶 (半圆柱)
      const archGeo = new THREE.CylinderGeometry(archW / 2, archW / 2, archD, 16, 1, false, Math.PI, Math.PI)
      const arch = new THREE.Mesh(archGeo, stoneMat)
      arch.position.set(b.x, totalH, b.z)
      arch.rotation.z = Math.PI / 2
      arch.castShadow = true
      scene.add(arch)
      // 站名牌
      const signGeo = new THREE.BoxGeometry(archW - 1, 1.2, 0.2)
      const signMat = new THREE.MeshStandardMaterial({
        color: 0x0F1A2E, emissive: 0x2E8FFF, emissiveIntensity: 0.6,
      })
      const sign = new THREE.Mesh(signGeo, signMat)
      sign.position.set(b.x, totalH - 1, b.z + archD / 2 + 0.1)
      scene.add(sign)
      return { topY: totalH + archW / 2, mesh: leftCol }
    }
    case 'hotel-tower': {
      // 高层酒店楼: 多层错位 box + 顶部冠顶
      const baseW = b.w ?? 14
      const baseD = b.d ?? 14
      const tiers = b.tiers ?? 3
      let mesh: THREE.Mesh | null = null
      for (let i = 0; i < tiers; i++) {
        const shrink = 1 - i * 0.12
        const tierH = h / tiers
        const geo = new THREE.BoxGeometry(baseW * shrink, tierH, baseD * shrink)
        const m = new THREE.Mesh(geo, buildingMaterial(b, color))
        m.position.set(b.x, tierH / 2 + i * tierH, b.z)
        m.castShadow = true
        m.receiveShadow = true
        scene.add(m)
        if (!mesh) mesh = m
        // 中间错位
        if (i < tiers - 1) {
          const offsetX = (i % 2 === 0 ? 1 : -1) * 0.6
        }
      }
      // 顶部冠顶 (锥形)
      const capGeo = new THREE.ConeGeometry(Math.max(baseW, baseD) * 0.5, h * 0.15, 6)
      const cap = new THREE.Mesh(capGeo, buildingMaterial(b, color))
      cap.position.set(b.x, h + h * 0.075, b.z)
      scene.add(cap)
      // LED 灯带 (发光边缘)
      const stripMat = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF, emissive: b.emissive ? parseHexColor(b.emissive) : 0xFFD58A,
        emissiveIntensity: 1.5,
      })
      for (let i = 0; i < tiers; i++) {
        const tierH = h / tiers
        const stripGeo = new THREE.BoxGeometry(baseW * (1 - i * 0.12) * 1.01, 0.15, baseD * (1 - i * 0.12) * 1.01)
        const strip = new THREE.Mesh(stripGeo, stripMat)
        strip.position.set(b.x, tierH * (i + 1), b.z)
        scene.add(strip)
      }
      return { topY: h + h * 0.15, mesh: mesh! }
    }
    case 'road-segment': {
      // 道路段: 灰色平面 + 中间黄色分道线
      const roadW = b.w ?? 6
      const roadD = b.d ?? 30
      const roadGeo = new THREE.BoxGeometry(roadW, 0.3, roadD)
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x2A2D33, roughness: 0.95 })
      const road = new THREE.Mesh(roadGeo, roadMat)
      road.position.set(b.x, 0.15, b.z)
      road.receiveShadow = true
      scene.add(road)
      // 边缘线 (白)
      const lineGeo = new THREE.BoxGeometry(0.2, 0.05, roadD)
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xCCCCCC, emissiveIntensity: 0.3 })
      for (const s of [-1, 1]) {
        const line = new THREE.Mesh(lineGeo, lineMat)
        line.position.set(b.x + s * (roadW / 2 - 0.5), 0.35, b.z)
        scene.add(line)
      }
      // 中间虚线 (黄)
      for (let i = -2; i <= 2; i++) {
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.05, 2),
          new THREE.MeshStandardMaterial({ color: 0xFFC850, emissive: 0xFFC850, emissiveIntensity: 0.5 }),
        )
        dash.position.set(b.x, 0.35, b.z + i * (roadD / 5))
        scene.add(dash)
      }
      return { topY: 0.3, mesh: road }
    }
    case 'flagpole-row': {
      // 旗杆列: n 根旗杆 + 卡塔尔风双色旗
      const count = b.count ?? 5
      const spacing = (b.w ?? count * 2) / count
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xC8CDD6, roughness: 0.3, metalness: 0.7 })
      const flagWhiteMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, roughness: 0.9 })
      const flagMaroonMat = new THREE.MeshStandardMaterial({ color: 0x8D1B3D, side: THREE.DoubleSide, roughness: 0.9 })
      let mesh: THREE.Mesh | null = null
      for (let i = 0; i < count; i++) {
        const px = b.x - (b.w ?? count * 2) / 2 + spacing * (i + 0.5)
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h, 8), poleMat)
        pole.position.set(px, h / 2, b.z)
        pole.castShadow = true
        scene.add(pole)
        if (!mesh) mesh = pole
        // 双色旗 (上半白, 下半酒红)
        const flagW = 1.6
        const flagH = 1.0
        const topFlag = new THREE.Mesh(
          new THREE.PlaneGeometry(flagW, flagH / 2),
          flagWhiteMat,
        )
        topFlag.position.set(px + flagW / 2 + 0.1, h - flagH * 0.75, b.z)
        scene.add(topFlag)
        const botFlag = new THREE.Mesh(
          new THREE.PlaneGeometry(flagW, flagH / 2),
          flagMaroonMat,
        )
        botFlag.position.set(px + flagW / 2 + 0.1, h - flagH * 0.25, b.z)
        scene.add(botFlag)
        // 锯齿边
        for (let z = -3; z <= 3; z++) {
          const tooth = new THREE.Mesh(
            new THREE.PlaneGeometry(0.15, 0.1),
            flagWhiteMat,
          )
          tooth.position.set(px + flagW + 0.1, h - flagH / 2 + z * 0.16, b.z)
          scene.add(tooth)
        }
      }
      return { topY: h + 0.5, mesh: mesh! }
    }
    case 'cylinder': {
      const mesh = addDiscMesh(b, color, b.rx ?? 4, b.rz ?? b.rx ?? 4, h, 0, b.stack ?? 1)
      if (b.cap) {
        const capGeo = new THREE.SphereGeometry((b.rx ?? 4) * 0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
        const cap = new THREE.Mesh(capGeo, buildingMaterial(b, color))
        cap.position.set(b.x, h, b.z)
        cap.scale.set(1, 0.6, (b.rz ?? b.rx ?? 4) / (b.rx ?? 4))
        scene.add(cap)
      }
      return { topY: h, mesh }
    }
    case 'disc': {
      const mesh = addDiscMesh(b, color, b.rx ?? 4, b.rz ?? b.rx ?? 4, h, 0)
      if (b.flagpoles) addFlagpoles(b)
      if (b.jet) {
        const jetGeo = new THREE.CylinderGeometry(0.3, 0.5, 2.2, 8)
        const jetMat = new THREE.MeshStandardMaterial({
          color: 0x9FD8FF, emissive: b.emissive ? parseHexColor(b.emissive) : 0x2E8FFF,
          emissiveIntensity: 0.8, transparent: true, opacity: 0.7,
        })
        const jet = new THREE.Mesh(jetGeo, jetMat)
        jet.position.set(b.x, h + 1.1, b.z)
        scene.add(jet)
      }
      return { topY: h, mesh }
    }
    case 'ring': {
      // 跑道：外椭圆 disc，内圈由草坪节点叠色覆盖
      const mesh = addDiscMesh(b, color, b.rx ?? 5, b.rz ?? b.rx ?? 5, h, 0)
      return { topY: h, mesh }
    }
    case 'shell': {
      // 看台碗体：openEnded 椭圆壳体，tiers 三色环带自内向外叠放
      const rx = b.rx ?? 20
      const rz = b.rz ?? 16
      const tiers = b.tiers && b.tiers.length > 0 ? b.tiers : [b.color ?? '#3E5C8F']
      let mesh: THREE.Mesh | null = null
      tiers.forEach((tierColor, i) => {
        const inset = 1 - i * 0.08
        const tierH = h / tiers.length
        const geo = new THREE.CylinderGeometry(rx * (1 - i * 0.12), rx * (1 - (i + 1) * 0.12) + rx * 0.06, tierH, 32, 1, true)
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          color: parseHexColor(tierColor), transparent: true, opacity: 0.5, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide,
        }))
        m.position.set(b.x, tierH / 2 + i * tierH, b.z)
        m.scale.z = (rz / rx) * inset
        m.castShadow = true
        scene.add(m)
        if (!mesh) mesh = m
      })
      return { topY: h, mesh: mesh! }
    }
    case 'shell-cap': {
      // 花瓣屋盖：半球切片 + 经线肋纹近似
      const rx = b.rx ?? 12
      const rz = b.rz ?? 8
      const phiLen = Math.PI * 0.75
      const phiStart = -phiLen / 2
      const geo = new THREE.SphereGeometry(rx, 24, 12, phiStart, phiLen, 0, Math.PI / 2)
      const m = new THREE.Mesh(geo, buildingMaterial(b, color))
      m.position.set(b.x, h * 0.45, b.z)
      m.scale.set(1, h / rx, rz / rx)
      m.rotation.y = ((b.thetaDeg ?? 0) * Math.PI) / 180
      m.castShadow = true
      scene.add(m)
      const edges = new THREE.LineSegments(
        new THREE.WireframeGeometry(geo),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 }),
      )
      edges.position.copy(m.position)
      edges.scale.copy(m.scale)
      edges.rotation.y = m.rotation.y
      scene.add(edges)
      return { topY: h * 0.45 + h, mesh: m }
    }
    case 'pylon': {
      // 塔桅：细圆柱 + 顶部发光球 + 向上光束
      const pylonGeo = new THREE.CylinderGeometry(0.25, 0.45, h, 10)
      const m = new THREE.Mesh(pylonGeo, buildingMaterial(b, color))
      m.position.set(b.x, h / 2, b.z)
      m.castShadow = true
      scene.add(m)
      const topGeo = new THREE.SphereGeometry(0.7, 12, 12)
      const topMat = new THREE.MeshStandardMaterial({ color: 0xE8EEF7, emissive: 0xBBD4FF, emissiveIntensity: 0.9 })
      const top = new THREE.Mesh(topGeo, topMat)
      top.position.set(b.x, h + 0.5, b.z)
      scene.add(top)
      if (b.beam) {
        const beamGeo = new THREE.CylinderGeometry(0.12, 0.3, 10, 8)
        const beamMat = new THREE.MeshBasicMaterial({ color: 0xBBD4FF, transparent: true, opacity: 0.18, depthWrite: false })
        const beam = new THREE.Mesh(beamGeo, beamMat)
        beam.position.set(b.x, h + 6, b.z)
        scene.add(beam)
      }
      return { topY: h + 1, mesh: m }
    }
    case 'board': {
      // LED 大屏：悬浮薄板 + 发光面
      const w = b.w ?? 6
      const bh = b.h ?? 3
      const baseY = b.y ?? 6
      const geo = new THREE.BoxGeometry(w, bh, 0.3)
      const m = new THREE.Mesh(geo, buildingMaterial(b, color))
      m.position.set(b.x, baseY + bh / 2, b.z)
      // [WEB-GLB v1.9.0] 大屏朝向: BoxGeometry 正面朝 +z, 绕 Y 旋转 thetaDeg 后
      // 正面朝 (sinθ, 0, cosθ)。thetaDeg 由双端同源配置 (scene_config.json /
      // StadiumSceneData.js 的 board 节点) 提供 — 朝场心角 ± 观众席修正;
      // 同款先例: shell-cap 分支 m.rotation.y (thetaDeg 弧度制)
      m.rotation.y = ((b.thetaDeg ?? 0) * Math.PI) / 180
      m.castShadow = true
      // [WEB-GLB v1.9.0] 挂体育场层级 (跟随整体变换) + 收集 mesh 供视频投放
      stadiumGroup.add(m)
      boardMeshes.push(m)
      boardOriginalMaterials.push(m.material as THREE.Material)
      addBuildingEdges(geo, color, m.position, 1, m.rotation.y)
      // 支撑立柱
      const postGeo = new THREE.CylinderGeometry(0.15, 0.15, baseY, 6)
      const post = new THREE.Mesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x333A48, roughness: 0.6 }))
      post.position.set(b.x, baseY / 2, b.z)
      stadiumGroup.add(post)
      return { topY: baseY + bh, mesh: m }
    }
    case 'cone': {
      // 棕榈树簇（装饰层，受 decor 开关控制）
      const count = b.count ?? 3
      const rx = b.rx ?? 4
      const rz = b.rz ?? rx
      let mesh: THREE.Mesh | null = null
      if (sceneDecorEnabled) {
        for (let i = 0; i < count; i++) {
          const tx = b.x - rx + (2 * rx * i) / Math.max(count - 1, 1)
          const tz = b.z + (i % 2 === 0 ? -rz * 0.4 : rz * 0.4)
          const geo = new THREE.ConeGeometry(0.9, h, 8)
          const m = new THREE.Mesh(geo, buildingMaterial(b, color))
          m.position.set(tx, h / 2, tz)
          m.castShadow = true
          scene.add(m)
          if (!mesh) mesh = m
        }
      }
      if (!mesh) {
        // decor 关闭时占位（保证 buildingGroups 注册不缺失）
        const geo = new THREE.ConeGeometry(0.01, 0.01, 4)
        mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }))
        mesh.position.set(b.x, 0, b.z)
        scene.add(mesh)
      }
      return { topY: h, mesh }
    }
    case 'model': {
      // GLB 模型：占位 mesh 由 GLB 异步加载后 applyModelToBuilding 替换
      const placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.01, 0.01),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      placeholder.position.set(b.x, 0, b.z)
      scene.add(placeholder)
      if (b.modelUrl) {
        loadBuildingModel(b.name, b.modelUrl, {
          scale: b.modelScale,
          rotationDeg: b.modelRotationDeg,
          offsetY: b.modelOffsetY,
        })
      }
      return { topY: b.h ?? 0, mesh: placeholder }
    }
    case 'box':
    default: {
      const w = b.w ?? 6
      const d = b.d ?? 6
      const geo = new THREE.BoxGeometry(w, h, d)
      const m = new THREE.Mesh(geo, buildingMaterial(b, color))
      m.position.set(b.x, h / 2, b.z)
      m.castShadow = true
      m.receiveShadow = true
      scene.add(m)
      addBuildingEdges(geo, b.edgeGlow ? parseHexColor(b.edgeGlow) : color, m.position)
      // [WEB-GLB 2026-08-21] v1.4.0: 删除了替补席/教练区/球员通道的遮阳棚代码
      // (GLB cabin_2 已含完整更衣室结构)
      if (b.cap) {
        // 尖顶近似（红瓦小屋）
        const capGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.6, 4)
        const cap = new THREE.Mesh(capGeo, buildingMaterial(b, 0xA05A45))
        cap.position.set(b.x, h + h * 0.3, b.z)
        cap.rotation.y = Math.PI / 4
        scene.add(cap)
      }
      if (b.stack && b.stack > 1) {
        for (let i = 1; i < b.stack; i++) {
          const shrink = 1 - i * 0.15
          const sGeo = new THREE.BoxGeometry(w * shrink, h * 0.5, d * shrink)
          const sMesh = new THREE.Mesh(sGeo, buildingMaterial(b, color))
          sMesh.position.set(b.x + i * 1.2, h + (h * 0.5) / 2 + (i - 1) * h * 0.5, b.z + i * 0.8)
          sMesh.castShadow = true
          scene.add(sMesh)
        }
      }
      return { topY: h, mesh: m }
    }
  }
}

function createBuilding(b: Building3DNode) {
  // 不可见锚点（看台分区告警联动），不渲染
  if (b.shape === 'anchor') return
  const color = b.color ? parseHexColor(b.color) : 0x1A73E8
  const { topY, mesh } = addBuilding(b, color)

  // 草坪标线
  if (b.pitchLines) addPitchLines(b, b.h ?? 0.3)

  // 建筑名称标签（装饰层关闭时不显示树簇标签）
  if (!(b.decor && !sceneDecorEnabled)) addBuildingLabel(b, topY)

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

  // [v1.9.4] 3D 形态: 立柱圆柱+球 → 枪机摄像头(机身/镜头筒/吊装块
  // 合并几何)。硬约束: entry.mesh 必须保持单 Mesh 且 position=(d.x,d.y,d.z)
  // (pickDevice 邻近匹配 ±0.1 依赖), 因此用 mergeGeometries 而非 Group
  // 或多 Mesh 子节点。rotation 复用数据字段作为机身朝向(视锥 v1.9.1
  // 移除后该字段闲置)。
  const bodyGeo = new THREE.BoxGeometry(1.05, 0.48, 0.42)
  const lensTubeGeo = new THREE.CylinderGeometry(0.13, 0.17, 0.42, 12)
    .rotateZ(Math.PI / 2)
    .translate(-0.72, 0, 0)
  const mountGeo = new THREE.BoxGeometry(0.15, 0.4, 0.15)
    .translate(0.28, 0.4, 0)
  const camGeo = mergeGeometries([bodyGeo, lensTubeGeo, mountGeo])!
  bodyGeo.dispose()
  lensTubeGeo.dispose()
  mountGeo.dispose()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.5, metalness: 0.6 })
  const body = new THREE.Mesh(camGeo, bodyMat)
  body.position.set(d.x, d.y, d.z)
  body.rotation.y = d.rotation ?? 0
  body.castShadow = true
  // [WEB-GLB v1.9.0] 设备图标挂体育场层级: 跟随整体变换; stadiumGroup 为
  // identity 变换时本地坐标=世界坐标, pickDevice 邻近匹配/doDeviceDrag 兼容
  stadiumGroup.add(body)

  // 状态指示灯（吊装块顶部发光珠）。原"镜头球"职责拆分: 镜头并入机身
  // 几何, 球仅显示状态色; doDeviceDrag 仅改 x/z, y 偏移变化仍兼容
  const lensGeo = new THREE.SphereGeometry(0.15, 10, 10)
  const lensMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.3 })
  const lens = new THREE.Mesh(lensGeo, lensMat)
  lens.position.set(d.x, d.y + 0.68, d.z)
  stadiumGroup.add(lens)

  // [WEB-GLB v1.9.1] FOV 视锥已移除 (用户反馈): 初始化时 19 个半透明锥体
  // (opacity 0.08 + DoubleSide) 从设备水平延伸 12 单位, 内场/看台/球门
  // 设备的视锥互相叠加横跨草皮上空, 形成"球场铺一层东西"的雾状观感,
  // 干扰 GLB 体育场 1:1 还原的整体效果; 且视锥无任何选中/悬停联动逻辑,
  // 纯静态装饰无信息量。fov/rotation 数据字段保留 (配置兼容), 仅不再渲染。
  const entry = { mesh: body, lens } as any

  // 告警脉冲球
  if (d.status === 'alarm') {
    const pulseGeo = new THREE.SphereGeometry(1.5, 16, 16)
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xDB4437, transparent: true, opacity: 0.25, depthWrite: false })
    const pulse = new THREE.Mesh(pulseGeo, pulseMat)
    pulse.position.set(d.x, d.y + 1, d.z)
    stadiumGroup.add(pulse)
    entry.pulse = pulse
  }

  // 设备标签
  const labelDiv = document.createElement('div')
  labelDiv.className = 'device-label-3d'
  // [v1.9.4] 图标: emoji 状态圆点(🟢🔴) → iconfont 摄像头图标 + 状态
  // 着色(用户反馈"摄像头的图标不对")。CSS2DObject 是挂在场景容器内的
  // 真实 DOM, main.ts 全局引入的 iconfont.css 对其生效
  const iconColor = DEVICE_ICON_COLORS[d.status] || DEVICE_ICON_COLORS.offline
  labelDiv.innerHTML = `<i class="iconfont1 icon1-monitor-camera-full" style="color:${iconColor};font-size:12px;font-style:normal;margin-right:3px;" aria-hidden="true"></i>${d.name}`
  labelDiv.style.cssText = `color:${d.status === 'alarm' ? '#DB4437' : '#E8EAED'};font-size:11px;font-family:system-ui;background:rgba(20,25,40,0.7);padding:2px 6px;border-radius:3px;white-space:nowrap;`
  const label = new CSS2DObject(labelDiv)
  label.position.set(d.x, d.y + 2.5, d.z)
  stadiumGroup.add(label)
  entry.label = label

  deviceMeshes.set(d.id, entry)
  // [WEB-GLB v1.9.0] 设备新增: 拾取缓存失效 (自动覆盖 lazy load / watch
  // devices 全量重建路径 — 均经由本函数创建)
  deviceMeshListDirty = true
}

/** 从场景中移除设备对象并释放其 GPU 资源 */
function removeDeviceEntry(entry: { mesh: THREE.Mesh; pulse?: THREE.Mesh; label?: CSS2DObject }) {
  // [WEB-GLB v1.9.0] 与 createDevice 对称: 从体育场层级移除 (懒卸载路径同样经由本函数)
  stadiumGroup.remove(entry.mesh)
  if (entry.pulse) stadiumGroup.remove(entry.pulse)
  if (entry.label) stadiumGroup.remove(entry.label)

  // 释放 GPU 资源
  entry.mesh.geometry?.dispose()
  ;(entry.mesh.material as THREE.Material)?.dispose()
  if (entry.pulse) {
    entry.pulse.geometry?.dispose()
    ;(entry.pulse.material as THREE.Material)?.dispose()
  }
  // [WEB-GLB v1.9.0] 设备移除: 拾取缓存失效 (deviceMeshList 下次拾取时重建)
  deviceMeshListDirty = true
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
  // [WEB-GLB v1.9.0] 拾取网格缓存: 设备增删时置 dirty (createDevice/
  // removeDeviceEntry), 避免每次 mousemove 都 Array.from + map 重建数组
  // (60~120Hz 高频分配 → GC 卡顿); stadiumGroup identity 下 mesh 本地坐标
  // = 世界坐标, 邻近匹配语义不变
  if (deviceMeshListDirty) {
    deviceMeshList = Array.from(deviceMeshes.values()).map(e => e.mesh)
    deviceMeshListDirty = false
  }
  const intersects = raycaster.intersectObjects(deviceMeshList)
  if (intersects.length === 0) return null
  const hit = intersects[0].object
  return (props.devices || defaultDevices).find(d =>
    Math.abs(d.x - hit.position.x) < 0.1 && Math.abs(d.z - hit.position.z) < 0.1
  ) || null
}

// [WEB-GLB v1.9.0] mousemove 悬停拾取 rAF 合并节流: 指针事件可达 120Hz+,
// 每次全量 raycast + 设备/建筑双向拾取是交互卡顿主因之一。将普通悬停拾取
// 合并到每帧至多一次 (同帧多次 mousemove 只处理最后一次坐标); 绘制预览与
// 拖拽路径保持即时响应。依据: MDN 'Event handler performance' 推荐的
// requestAnimationFrame 合并写入模式
let pointerMovePending = false
let pointerMoveEvent: MouseEvent | null = null
let pointerPickRafId = 0

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
  // [WEB-GLB v1.9.0] 普通悬停拾取: rAF 合并 (每帧至多一次)
  pointerMoveEvent = event
  if (!pointerMovePending) {
    pointerMovePending = true
    pointerPickRafId = requestAnimationFrame(processHoverPick)
  }
}

/** [WEB-GLB v1.9.0] rAF 回调: 每帧至多一次悬停拾取（含建筑 hover 检测） */
function processHoverPick() {
  pointerMovePending = false
  const event = pointerMoveEvent
  if (!event) return
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
  // [WEB-GLB v1.9.0] 复用 dragUpNormal/dragPlanePoint (见声明处注释):
  // 拖拽高频路径不再每次 new 两个 Vector3
  // 水平面 Y = dragFixedY
  dragPlanePoint.set(0, dragFixedY, 0)
  dragPlane.setFromNormalAndCoplanarPoint(dragUpNormal, dragPlanePoint)
  raycaster.ray.intersectPlane(dragPlane, dragIntersect)
  if (!dragIntersect) return

  const entry = deviceMeshes.get(dragDeviceId)
  if (!entry) return
  const nx = dragIntersect.x
  const nz = dragIntersect.z
  // 更新主体 + 镜头 + 脉冲球 + 标签
  entry.mesh.position.x = nx
  entry.mesh.position.z = nz
  if (entry.lens) { entry.lens.position.x = nx; entry.lens.position.z = nz }
  if (entry.pulse) { entry.pulse.position.x = nx; entry.pulse.position.z = nz }
  if (entry.label) { entry.label.position.x = nx; entry.label.position.z = nz }
  // [WEB-GLB v1.8.0] 拖拽中设备位移: 单次刷新阴影 + 标脏 (静态阴影模式)
  renderer.shadowMap.needsUpdate = true
  requestRender()
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
      const buildings = (props.buildings || defaultBuildings) as Building3DNode[]
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

// [WEB-GLB v1.9.8] 投放至大屏 — 仅投 3D LED 大屏动态纹理不弹窗: SituationScreen
// onDeviceCast 独立拉流(隐藏 video)后回调 castVideoToBoards; 同设备再次点击
// 由父组件 toggle 停止 (stopVideoCast 还原材质并释放视频纹理)
function onDeviceCastToBoard() {
  const dev = contextMenu.device
  if (!dev) return
  emit('device-cast', { id: dev.id, name: dev.name, businessId: dev.businessId, deviceType: dev.deviceType })
  closeContextMenu()
}

/** [WEB-GLB v1.9.0] 将视频元素投放到 4 块 LED 大屏 (动态视频纹理)。
 *  依据 three.js 0.184 VideoTexture 源码: 构造时自动注册
 *  requestVideoFrameCallback, 视频每一新帧自动置 needsUpdate=true,
 *  dispose() 时自动取消回调; 默认 LinearFilter + generateMipmaps=false,
 *  无需手动逐帧刷新。colorSpace=SRGB: 视频帧为 sRGB 编码, r152+ 默认色彩
 *  管理下须显式标注才能正确 sRGB→linear→输出转换 (官方 webgl_materials_video
 *  同款)。MeshBasicMaterial 自发光不受灯光/阴影影响, 与 LED 屏发光属性一致
 *  [WEB-GLB v1.9.8] 返回是否投放成功 — GLB 异步加载期间 boardMeshes 未
 *  就绪时返回 false, 父组件 (全屏切换迁移投放) 据此轮询重投 */
function castVideoToBoards(video: HTMLVideoElement): boolean {
  if (!scene || boardMeshes.length === 0) return false
  // 重复投放: 先还原上一次 (材质/纹理资源正确释放)
  if (isCastingVideo) stopVideoCast()
  boardVideoTexture = new THREE.VideoTexture(video)
  boardVideoTexture.colorSpace = THREE.SRGBColorSpace
  boardCastMaterial = new THREE.MeshBasicMaterial({ map: boardVideoTexture })
  boardMeshes.forEach((m, i) => {
    if (boardOriginalMaterials[i]) m.material = boardCastMaterial!
  })
  isCastingVideo = true
  // [WEB-GLB v1.8.0 契约延续] 场景变化: 单次刷新阴影 + 标脏
  renderer.shadowMap.needsUpdate = true
  requestRender()
  return true
}

/** [WEB-GLB v1.9.0] 停止投放: 还原 4 块大屏原材质并释放视频纹理
 *  (VideoTexture.dispose 自动取消 requestVideoFrameCallback 注册) */
function stopVideoCast() {
  if (!isCastingVideo) return
  boardMeshes.forEach((m, i) => {
    if (boardOriginalMaterials[i]) m.material = boardOriginalMaterials[i]
  })
  boardCastMaterial?.dispose()
  boardVideoTexture?.dispose()
  boardCastMaterial = null
  boardVideoTexture = null
  isCastingVideo = false
  requestRender()
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

  // 性能采集器 tick（精确计算 FPS）——轻量, 每帧保留
  perfCollector?.tick()

  // 告警脉冲动画 (连续动画源之一)
  let anyPulse = false
  if (alarmPulse.value) {
    deviceMeshes.forEach((entry) => {
      if (entry.pulse) {
        anyPulse = true
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

  // controls.update() 内部阻尼会让相机持续微调, 相机变化时派发 'change' 事件
  // → requestRender(), 因此惯性滑动期间仍会渲染, 停下后自动停渲
  controls.update()

  // 巡视/序列更新 (各自推进相机或触发 action, 均为连续动画源)
  updatePatrol()
  updateSequence()

  // [WEB-GLB v1.8.0] 按需渲染: 仅在脏标或存在连续动画时执行 WebGL 渲染。
  // 依据 three.js 官方 "Rendering on demand" 模式: 静态帧 GPU 归零,
  // 把算力让给交互帧, 旋转/缩放更流畅
  // [WEB-GLB v1.9.0] isCastingVideo: VideoTexture 的 rVFC 只置纹理脏标,
  // 不触发本组件渲染循环 — 投放期间必须持续渲染才能呈现动态视频帧
  const animating = anyPulse || isPatrolling || isPlayingSequence || lazyLoadScheduled || isCastingVideo
  if (renderDirty || animating) {
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
    renderDirty = false

    // 性能面板数据 (仅在实际渲染帧更新)
    if (showPerfPanel.value && perfCollector) {
      const snap = perfCollector.latestSnapshot
      if (snap) {
        perfSnapshot.value = {
          ...snap,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        }
      }
    }
  }

  // 懒加载分批调度 / 懒卸载检查
  processLazyLoadBatch()
  checkLazyUnload()

  // P2-6: 小地图渲染（2D canvas, 开销低, 保持每帧）
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
  // [WEB-GLB v1.8.0] 尺寸变化后标脏重渲
  requestRender()
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
  // [v1.9.5] 与 init 默认相机同步回滚 (见 init 处注释)
  camera.position.set(45, 35, 55)
  controls.target.set(0, 5, 0)
  controls.update()
}

function toggleAlarmPulse() { alarmPulse.value = !alarmPulse.value; requestRender() }
function toggleLabels() { showLabels.value = !showLabels.value; requestRender() }
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
  toggleLabels,
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
  // [WEB-GLB v1.9.0] LED 大屏视频投放 (SituationScreen 拉流就绪后调用)
  castVideoToBoards,
  stopVideoCast,
  isVideoCasting: () => isCastingVideo,
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
  // [WEB-GLB v1.8.0] 设备重建后刷新阴影 + 标脏
  renderer.shadowMap.needsUpdate = true
  requestRender()
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

  // [WEB-GLB v1.9.0] 停止 LED 大屏视频投放 (还原材质 + 释放 VideoTexture,
  // 避免卸载后 rVFC 回调残留) + 取消悬停拾取 pending rAF
  stopVideoCast()
  cancelAnimationFrame(pointerPickRafId)

  // P2-1: 清理底图
  if (groundImageMesh) {
    groundImageMesh.geometry.dispose()
    ;(groundImageMesh.material as THREE.Material).dispose()
    groundImageMesh = null
  }
  // [WEB-GLB v1.9.0] 清理大屏收集数组 (disposeSceneResources 已释放 mesh 资源)
  boardMeshes = []
  boardOriginalMaterials = []

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
  flex-wrap: nowrap;
}

.legend-bar {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  color: #AADDFF;
  font-size: 14px;
  line-height: 1;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
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

/* [WEB-GLB v1.9.8] 正在投放至 LED 大屏的设备菜单项高亮 (切换"停止投放") */
.context-menu-item.context-menu-casting {
  color: #35E08C;
}

.context-menu-item.context-menu-casting:hover {
  color: #5CF0A6;
  background: rgba(53, 224, 140, 0.12);
}
</style>
