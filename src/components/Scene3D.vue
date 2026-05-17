<template>
  <div class="scene3d-container" ref="containerRef">
    <div class="scene-toolbar">
      <el-button-group size="small">
        <el-button @click="resetCamera"><el-icon><RefreshRight /></el-icon>复位</el-button>
        <el-button @click="toggleAlarmPulse">{{ alarmPulse ? '关闭脉冲' : '开启脉冲' }}</el-button>
        <el-button @click="toggleLabels">{{ showLabels ? '隐藏标签' : '显示标签' }}</el-button>
      </el-button-group>
      <div class="legend-bar">
        <span class="legend-item"><span class="dot online"></span>在线设备</span>
        <span class="legend-item"><span class="dot alarm"></span>告警点位</span>
        <span class="legend-item"><span class="dot offline"></span>离线设备</span>
      </div>
    </div>
    <div class="scene-overlay" v-if="hoveredDevice">
      <div class="device-tooltip">
        <div class="tooltip-name">{{ hoveredDevice.name }}</div>
        <div class="tooltip-status" :class="hoveredDevice.status">{{ hoveredDevice.status === 'online' ? '🟢 在线' : hoveredDevice.status === 'alarm' ? '🔴 告警' : '⚫ 离线' }}</div>
        <div class="tooltip-info">{{ hoveredDevice.location }}</div>
        <div class="tooltip-info" v-if="hoveredDevice.alarmType">告警: {{ hoveredDevice.alarmType }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { RefreshRight } from '@element-plus/icons-vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

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
}>()

const containerRef = ref<HTMLElement>()
const alarmPulse = ref(true)
const showLabels = ref(true)
const hoveredDevice = ref<Device3D | null>(null)

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

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0c10)
  scene.fog = new THREE.FogExp2(0x0a0c10, 0.008)

  // Camera
  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500)
  camera.position.set(60, 50, 70)
  camera.lookAt(0, 0, 0)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.appendChild(renderer.domElement)

  // CSS2D Label renderer
  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(w, h)
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

  // ── 设备 ──
  const devices = props.devices || defaultDevices
  devices.forEach(d => createDevice(d))

  // ── 事件 ──
  renderer.domElement.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)
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
  const color = b.color ? parseInt(b.color.replace('#', '0x')) : 0x1A73E8
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
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.5, metalness: 0.6 })
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
  const statusIcon = d.status === 'online' ? '🟢' : d.status === 'alarm' ? '🔴' : d.status === 'maintenance' ? '🟡' : '⚫'
  labelDiv.textContent = `${statusIcon} ${d.name}`
  labelDiv.style.cssText = `color:${d.status === 'alarm' ? '#DB4437' : '#E8EAED'};font-size:11px;font-family:system-ui;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:3px;white-space:nowrap;`
  const label = new CSS2DObject(labelDiv)
  label.position.set(d.x, d.y + 2.5, d.z)
  scene.add(label)
  entry.label = label

  deviceMeshes.set(d.id, entry)
}

function onMouseMove(event: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

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
}

function onResize() {
  if (!containerRef.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  labelRenderer.setSize(w, h)
}

function resetCamera() {
  camera.position.set(60, 50, 70)
  controls.target.set(0, 0, 0)
  controls.update()
}

function toggleAlarmPulse() { alarmPulse.value = !alarmPulse.value }
function toggleLabels() { showLabels.value = !showLabels.value }

// ── Watch devices prop ──
watch(() => props.devices, (newDevices) => {
  if (!newDevices) return
  // 移除旧设备
  deviceMeshes.forEach((entry) => {
    scene.remove(entry.mesh)
    scene.remove(entry.cone)
    if (entry.pulse) scene.remove(entry.pulse)
    if (entry.label) scene.remove(entry.label)
  })
  deviceMeshes.clear()
  newDevices.forEach(d => createDevice(d))
}, { deep: true })

onMounted(() => {
  init()
  animate()
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  renderer?.domElement.removeEventListener('mousemove', onMouseMove)
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
.tooltip-info { font-size: 11px; color: #9AA0A6; }
</style>
