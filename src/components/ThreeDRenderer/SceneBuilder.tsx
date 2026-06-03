/**
 * 华盾AI智能视频盒子 v7.0 - 3D 场景构建器
 * components/ThreeDRenderer/SceneBuilder.tsx
 *
 * @description 基于配置文件构建完整的 Three.js 3D 工厂场景。
 *              整合 WebGL 材质、灯光、相机控制、围墙、建筑、设备模型。
 *              导出为 Vue composable (useSceneBuilder) 和独立类 SceneBuilder。
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { ModelLoader, parseHexColor, getStatusColor } from './ModelLoader'
import type { BuildingModelResult, DeviceModelResult, LoadedModelResult } from './ModelLoader'

// ════════════════════════════════════════════════════
// ── 配置类型定义（从 modelConfigs.json 推导） ──
// ════════════════════════════════════════════════════

export interface SceneConfig {
  background: string
  fog: { type: string; color: string; density: number }
  ground: { width: number; height: number; color: string; roughness: number; metalness: number }
  grid: { size: number; divisions: number; color1: string; color2: string }
}

export interface CameraConfig {
  fov: number
  near: number
  far: number
  defaultPosition: [number, number, number]
  defaultTarget: [number, number, number]
  maxPolarAngle: number
  minDistance: number
  maxDistance: number
  dampingFactor: number
}

export interface RendererConfig {
  antialias: boolean
  alpha: boolean
  shadowMap: { enabled: boolean; type: string }
  pixelRatioCap: number
  toneMapping?: string
  toneMappingExposure?: number
}

export interface LightingConfig {
  ambient: { color: string; intensity: number }
  directional: {
    color: string; intensity: number
    position: [number, number, number]
    castShadow: boolean
    shadowMapSize: number
    shadowCamera: { left: number; right: number; top: number; bottom: number }
  }
  point: { color: string; intensity: number; position: [number, number, number]; distance: number }
}

export interface WallConfig {
  x: number; y: number; z: number
  width: number; height: number; depth: number
}

export interface WallsConfig {
  color: string
  opacity: number
  edgeColor: string
  edgeOpacity: number
  segments: WallConfig[]
}

export interface MaterialConfig {
  building: { opacity: number; roughness: number; metalness: number; edgeOpacity: number }
  deviceBody: { color: string; roughness: number; metalness: number }
  deviceLens: { roughness: number; emissiveIntensity: number }
  fovCone: { opacity: number; side: string }
  alarmPulse: { color: string; opacity: number; radius: number; segments: number }
}

export interface BuildingModelConfig {
  name: string
  x: number; z: number
  w: number; d: number; h: number
  color: string
  type?: string
}

export interface DeviceModelConfig {
  fov: number
  viewDistance: number
  bodyRadius: number
  bodyHeight: number
  lensRadius: number
}

export interface FullModelConfig {
  version: string
  scene: SceneConfig
  camera: CameraConfig
  renderer: RendererConfig
  lighting: LightingConfig
  walls: WallsConfig
  materials: MaterialConfig
  statusColors: Record<string, string>
  defaults: { device: DeviceModelConfig }
  buildings: BuildingModelConfig[]
  devices: Array<{
    id: string; name: string
    x: number; y: number; z: number
    status: string; location: string
    alarmType?: string; fov?: number; rotation?: number
  }>
}

// ════════════════════════════════════════════════════
// ── 内部映射类型 ──
// ════════════════════════════════════════════════════

interface DeviceEntry {
  deviceModel: DeviceModelResult
  label?: CSS2DObject
}

// ════════════════════════════════════════════════════
// ── SceneBuilder 类 ──
// ════════════════════════════════════════════════════

export class SceneBuilder {
  // Three.js 核心
  scene!: THREE.Scene
  camera!: THREE.PerspectiveCamera
  renderer!: THREE.WebGLRenderer
  labelRenderer!: CSS2DRenderer
  controls!: OrbitControls

  // 配置
  config: FullModelConfig
  loader: ModelLoader

  // 已加载资源（用于清理）
  private wallEntries: LoadedModelResult[] = []
  private buildingEntries: BuildingModelResult[] = []
  private deviceEntries: Map<string, DeviceEntry> = new Map()

  // 状态
  startTime = 0
  animationId = 0

  constructor(config: FullModelConfig) {
    this.config = config
    this.loader = new ModelLoader(
      config.materials,
      config.statusColors,
      config.defaults.device,
    )
  }

  // ── 初始化 ──

  /**
   * 初始化完整的3D场景（灯光、地面、围墙、建筑、设备）
   * @param container 挂载容器 DOM 元素
   * @param showLabels 是否显示设备标签
   */
  init(container: HTMLElement, showLabels = true): void {
    const w = Math.max(container.clientWidth, 1)
    const h = Math.max(container.clientHeight, 1)

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(parseHexColor(this.config.scene.background))
    this.scene.fog = this.loader.createFog(this.config.scene)

    // Camera
    this.camera = this.loader.createCamera(this.config.camera, w / h)

    // WebGL Renderer
    this.renderer = this.loader.createRenderer(this.config.renderer, w, h)
    container.appendChild(this.renderer.domElement)

    // CSS2D Label Renderer
    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.setSize(w, h)
    this.labelRenderer.domElement.style.position = 'absolute'
    this.labelRenderer.domElement.style.top = '0'
    this.labelRenderer.domElement.style.left = '0'
    this.labelRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(this.labelRenderer.domElement)

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = this.config.camera.dampingFactor
    this.controls.maxPolarAngle = this.config.camera.maxPolarAngle
    this.controls.minDistance = this.config.camera.minDistance
    this.controls.maxDistance = this.config.camera.maxDistance
    this.controls.target.set(...this.config.camera.defaultTarget)

    this.startTime = performance.now()

    // 构建场景元素
    this.setupLighting()
    this.setupGround()
    this.setupWalls()
    this.setupBuildings()
    this.setupDevices(showLabels)
  }

  // ── 灯光 ──

  private setupLighting(): void {
    const ambient = this.loader.createAmbientLight(this.config.lighting)
    this.scene.add(ambient)

    const dirLight = this.loader.createDirectionalLight(this.config.lighting)
    this.scene.add(dirLight)

    const pointLight = this.loader.createPointLight(this.config.lighting)
    this.scene.add(pointLight)
  }

  // ── 地面 + 网格 ──

  private setupGround(): void {
    const ground = this.loader.createGround(this.config.scene)
    this.scene.add(ground)

    const grid = this.loader.createGrid(this.config.scene)
    this.scene.add(grid)
  }

  // ── 围墙 ──

  private setupWalls(): void {
    const wallsConfig = this.config.walls
    const wallColor = parseHexColor(wallsConfig.color)
    const edgeColor = parseHexColor(wallsConfig.edgeColor)

    for (const seg of wallsConfig.segments) {
      const entry = this.loader.createWall(seg, wallColor, edgeColor)
      this.scene.add(entry.mesh)
      this.wallEntries.push(entry)
    }
  }

  // ── 建筑 ──

  private setupBuildings(): void {
    for (const b of this.config.buildings) {
      const result = this.loader.createBuilding(b)
      this.scene.add(result.mesh)
      this.scene.add(result.edges)

      // 建筑名称标签
      const labelDiv = document.createElement('div')
      labelDiv.className = 'building-label'
      labelDiv.textContent = b.name
      labelDiv.style.cssText =
        'color:rgba(255,255,255,0.5);font-size:10px;font-family:system-ui;text-align:center;white-space:nowrap;'
      const label = new CSS2DObject(labelDiv)
      label.position.set(b.x, b.h + 1, b.z)
      this.scene.add(label)
      result.label = label

      this.buildingEntries.push(result)
    }
  }

  // ── 设备 ──

  private setupDevices(showLabels: boolean): void {
    for (const d of this.config.devices) {
      this.addDevice(d, showLabels)
    }
  }

  /**
   * 添加单个设备到场景
   */
  addDevice(
    d: {
      id: string; name: string
      x: number; y: number; z: number
      status: string; location: string
      alarmType?: string; fov?: number; rotation?: number
    },
    showLabels = true,
  ): void {
    // 如果已存在，先移除
    if (this.deviceEntries.has(d.id)) {
      this.removeDevice(d.id)
    }

    const deviceModel = this.loader.createDevice(d)
    this.scene.add(deviceModel.body)
    this.scene.add(deviceModel.lens)
    this.scene.add(deviceModel.cone)
    if (deviceModel.pulse) {
      this.scene.add(deviceModel.pulse)
    }

    // 设备标签
    let label: CSS2DObject | undefined
    if (showLabels) {
      const icon = this.statusIcon(d.status)
      const labelDiv = document.createElement('div')
      labelDiv.className = 'device-label-3d'
      labelDiv.textContent = `${icon} ${d.name}`
      const labelColor = d.status === 'alarm' ? '#DB4437' : '#E8EAED'
      labelDiv.style.cssText = `color:${labelColor};font-size:11px;font-family:system-ui;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:3px;white-space:nowrap;`
      label = new CSS2DObject(labelDiv)
      label.position.set(d.x, d.y + 2.5, d.z)
      label.visible = showLabels
      this.scene.add(label)
    }

    this.deviceEntries.set(d.id, { deviceModel, label })
  }

  /**
   * 移除单个设备（释放 GPU 资源）
   */
  removeDevice(id: string): void {
    const entry = this.deviceEntries.get(id)
    if (!entry) return

    this.scene.remove(entry.deviceModel.body)
    this.scene.remove(entry.deviceModel.lens)
    this.scene.remove(entry.deviceModel.cone)
    if (entry.deviceModel.pulse) this.scene.remove(entry.deviceModel.pulse)
    if (entry.label) this.scene.remove(entry.label)

    entry.deviceModel.dispose()
    this.deviceEntries.delete(id)
  }

  /**
   * 清除所有设备并重新加载
   */
  reloadDevices(
    devices: Array<{
      id: string; name: string
      x: number; y: number; z: number
      status: string; location: string
      alarmType?: string; fov?: number; rotation?: number
    }>,
    showLabels = true,
  ): void {
    // 移除所有旧设备
    for (const id of this.deviceEntries.keys()) {
      this.removeDevice(id)
    }

    // 加载新设备
    for (const d of devices) {
      this.addDevice(d, showLabels)
    }
  }

  // ── 渲染循环 ──

  /**
   * 动画帧更新（告警脉冲 + 控制器 + 标签可见性）
   * @returns animationId（用于 cancelAnimationFrame）
   */
  animate(alarmPulse = true, showLabels = true): number {
    this.animationId = requestAnimationFrame(() =>
      this.animate(alarmPulse, showLabels),
    )

    const t = (performance.now() - this.startTime) / 1000

    // 告警脉冲动画
    if (alarmPulse) {
      this.deviceEntries.forEach((entry) => {
        const pulse = entry.deviceModel.pulse
        if (pulse) {
          const s = 1 + 0.3 * Math.sin(t * 3)
          pulse.scale.set(s, s, s)
          ;(pulse.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.1 * Math.sin(t * 3)
        }
      })
    }

    // 标签可见性
    this.deviceEntries.forEach((entry) => {
      if (entry.label) entry.label.visible = showLabels
    })

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.labelRenderer.render(this.scene, this.camera)

    return this.animationId
  }

  // ── 相机控制 ──

  /** 重置相机到默认位置 */
  resetCamera(): void {
    this.camera.position.set(...this.config.camera.defaultPosition)
    this.controls.target.set(...this.config.camera.defaultTarget)
    this.controls.update()
  }

  /** 统一更新 Canvas、Camera、LabelRenderer 尺寸 */
  updateSize(w: number, h: number): void {
    const safeW = Math.max(Math.round(w), 1)
    const safeH = Math.max(Math.round(h), 1)
    this.camera.aspect = safeW / safeH
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(safeW, safeH)
    this.labelRenderer.setSize(safeW, safeH)
  }

  // ── 射线检测 ──

  /** 射线检测：返回被命中的设备ID或 null */
  raycastDevice(mouseX: number, mouseY: number): string | null {
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2(mouseX, mouseY)
    raycaster.setFromCamera(mouse, this.camera)

    const bodies = Array.from(this.deviceEntries.values()).map(e => e.deviceModel.body)
    const intersects = raycaster.intersectObjects(bodies)
    if (intersects.length === 0) return null

    const hit = intersects[0].object
    for (const [id, entry] of this.deviceEntries.entries()) {
      if (entry.deviceModel.body === hit) return id
    }
    return null
  }

  // ── 清理 ──

  /** 释放所有 GPU 资源（组件卸载时调用） */
  dispose(): void {
    cancelAnimationFrame(this.animationId)

    // 释放设备
    for (const id of this.deviceEntries.keys()) {
      this.removeDevice(id)
    }

    // 释放建筑
    this.buildingEntries.forEach(e => e.dispose())
    this.buildingEntries = []

    // 释放围墙
    this.wallEntries.forEach(e => e.dispose())
    this.wallEntries = []

    // 递归释放剩余资源
    ModelLoader.disposeSceneResources(this.scene)

    this.renderer?.dispose()
    this.labelRenderer?.domElement.remove()
    this.scene?.clear()
  }

  // ── 工具 ──

  private statusIcon(status: string): string {
    switch (status) {
      case 'online': return '🟢'
      case 'alarm': return '🔴'
      case 'maintenance': return '🟡'
      case 'offline': return '⚫'
      default: return '⚫'
    }
  }

  /** 获取当前设备数量 */
  get deviceCount(): number {
    return this.deviceEntries.size
  }

  /** 获取 renderer 的 info（用于性能监控） */
  get rendererInfo(): THREE.WebGLRenderer['info'] {
    return this.renderer.info
  }
}
