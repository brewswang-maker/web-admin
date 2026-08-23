/**
 * @file ThreeDRenderer.test.ts
 * @brief ThreeDRenderer 模块（ModelLoader + SceneBuilder）单元测试
 *
 * 覆盖:
 *   1. 工具函数 — parseHexColor、getStatusColor 颜色解析
 *   2. ModelLoader — 模型创建（地面/灯光/围墙/建筑/设备/相机/渲染器）
 *   3. SceneBuilder — 场景初始化、设备管理、渲染循环、射线检测、资源释放
 *   4. modelConfigs.json — 配置文件结构完整性校验
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ════════════════════════════════════════════════════
// ── Three.js Mock（统一管理） ──
// ════════════════════════════════════════════════════

const mockGeometries: Array<{ dispose: ReturnType<typeof vi.fn> }> = []
const mockMaterials: Array<{ dispose: ReturnType<typeof vi.fn> }> = []
const mockMeshes: Array<Record<string, unknown>> = []

function createMockGeometry() {
  const g = { dispose: vi.fn() }
  mockGeometries.push(g)
  return g
}

function createMockMaterial(extra: Record<string, unknown> = {}) {
  const m = { dispose: vi.fn(), map: null, normalMap: null, roughnessMap: null, metalnessMap: null, ...extra }
  mockMaterials.push(m)
  return m
}

function createMockMesh(overrides: Record<string, unknown> = {}) {
  const mesh = {
    position: { x: 0, y: 0, z: 0, set: vi.fn(), copy: vi.fn() },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set: vi.fn() },
    castShadow: false,
    receiveShadow: false,
    visible: true,
    geometry: createMockGeometry(),
    material: createMockMaterial(),
    add: vi.fn(),
    translateY: vi.fn(),
    translateX: vi.fn(),
    translateZ: vi.fn(),
    ...overrides,
  }
  mockMeshes.push(mesh)
  return mesh
}

vi.mock('three', () => {
  return {
    Scene: vi.fn(function () {
      return {
        add: vi.fn(),
        remove: vi.fn(),
        traverse: vi.fn(),
        clear: vi.fn(),
        background: null,
        fog: null,
      }
    }),
    PerspectiveCamera: vi.fn(function () {
      return {
        position: { set: vi.fn() },
        lookAt: vi.fn(),
        aspect: 1,
        updateProjectionMatrix: vi.fn(),
      }
    }),
    WebGLRenderer: vi.fn(function () {
      const el = document.createElement('canvas')
      return {
        domElement: el,
        setSize: vi.fn(),
        setPixelRatio: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
        shadowMap: { enabled: false, type: 2 },
        getPixelRatio: vi.fn(() => 1),
        info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, programs: [], autoReset: true },
      }
    }),
    Color: vi.fn(function (hex: number) { return { hex } }),
    FogExp2: vi.fn(function (color: number, density: number) { return { color, density } }),
    AmbientLight: vi.fn(function (color: number, intensity: number) { return { color, intensity } }),
    DirectionalLight: vi.fn(function (color: number, intensity: number) {
      return {
        color,
        intensity,
        position: { set: vi.fn() },
        castShadow: false,
        shadow: { mapSize: { set: vi.fn() }, camera: { left: 0, right: 0, top: 0, bottom: 0 } },
      }
    }),
    PointLight: vi.fn(function (color: number, intensity: number, distance: number) {
      return { color, intensity, distance, position: { set: vi.fn() } }
    }),
    PlaneGeometry: vi.fn(() => createMockGeometry()),
    BoxGeometry: vi.fn(() => createMockGeometry()),
    CylinderGeometry: vi.fn(() => createMockGeometry()),
    SphereGeometry: vi.fn(() => createMockGeometry()),
    ConeGeometry: vi.fn(() => createMockGeometry()),
    EdgesGeometry: vi.fn(() => createMockGeometry()),
    GridHelper: vi.fn(() => ({})),
    MeshStandardMaterial: vi.fn((opts: Record<string, unknown>) => createMockMaterial(opts)),
    MeshBasicMaterial: vi.fn((opts: Record<string, unknown>) => createMockMaterial(opts)),
    LineBasicMaterial: vi.fn((opts: Record<string, unknown>) => createMockMaterial(opts)),
    Mesh: vi.fn((geo: unknown, mat: unknown) => createMockMesh({ geometry: geo, material: mat })),
    LineSegments: vi.fn(() => ({
      position: { copy: vi.fn() },
      geometry: createMockGeometry(),
      material: createMockMaterial(),
    })),
    Raycaster: vi.fn(function () {
      return { setFromCamera: vi.fn(), intersectObjects: vi.fn(() => []) }
    }),
    Vector2: vi.fn(function (x: number, y: number) { return { x, y } }),
    DoubleSide: 2,
    PCFShadowMap: 2,
    ACESFilmicToneMapping: 4,
  }
})

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn(function () {
    return {
      enableDamping: false,
      dampingFactor: 0,
      maxPolarAngle: 0,
      minDistance: 0,
      maxDistance: 0,
      target: { set: vi.fn() },
      update: vi.fn(),
    }
  }),
}))

vi.mock('three/examples/jsm/renderers/CSS2DRenderer.js', () => ({
  CSS2DRenderer: vi.fn(function () {
    const el = document.createElement('div')
    return {
      domElement: el,
      setSize: vi.fn(),
      render: vi.fn(),
    }
  }),
  CSS2DObject: vi.fn(function (el: HTMLElement) {
    return {
      element: el,
      position: { set: vi.fn() },
      visible: true,
    }
  }),
}))

// ════════════════════════════════════════════════════
// ── 导入待测模块（在 mock 之后） ──
// ════════════════════════════════════════════════════

import * as THREE from 'three'
import { ModelLoader, parseHexColor, getStatusColor } from '../ThreeDRenderer/ModelLoader'
import { SceneBuilder } from '../ThreeDRenderer/SceneBuilder'
import { modelConfig } from '../ThreeDRenderer/index'
import type { FullModelConfig, MaterialConfig, DeviceModelConfig } from '../ThreeDRenderer/SceneBuilder'

// ════════════════════════════════════════════════════
// ── 测试用配置 ──
// ════════════════════════════════════════════════════

const minimalMaterials: MaterialConfig = {
  building: { opacity: 0.35, roughness: 0.7, metalness: 0.2, edgeOpacity: 0.6 },
  deviceBody: { color: '#2a2d35', roughness: 0.5, metalness: 0.6 },
  deviceLens: { roughness: 0.3, emissiveIntensity: 0.8 },
  fovCone: { opacity: 0.2, side: 'DoubleSide' },
  alarmPulse: { color: '#DB4437', opacity: 0.15, radius: 0.8, segments: 16 },
}

const minimalDeviceDefaults: DeviceModelConfig = {
  fov: 90,
  viewDistance: 10,
  bodyRadius: 0.3,
  bodyHeight: 0.6,
  lensRadius: 0.15,
}

const statusColors: Record<string, string> = {
  online: '#0F9D58',
  offline: '#999999',
  alarm: '#DB4437',
  maintenance: '#F4B400',
}

/** 创建最小化的 FullModelConfig */
function createMinimalConfig(): FullModelConfig {
  return {
    version: '1.0.0-test',
    scene: {
      background: '#0a0c10',
      fog: { type: 'FogExp2', color: '#0a0c10', density: 0.008 },
      ground: { width: 100, height: 80, color: '#151820', roughness: 0.9, metalness: 0.1 },
      grid: { size: 100, divisions: 20, color1: '#1a1d23', color2: '#111318' },
    },
    camera: {
      fov: 50, near: 0.1, far: 500,
      defaultPosition: [60, 50, 70],
      defaultTarget: [0, 0, 0],
      maxPolarAngle: 1.428, minDistance: 20, maxDistance: 150,
      dampingFactor: 0.08,
    },
    renderer: { antialias: true, alpha: true, shadowMap: { enabled: true, type: 'PCFShadowMap' }, pixelRatioCap: 2 },
    lighting: {
      ambient: { color: '#334455', intensity: 0.6 },
      directional: {
        color: '#ffffff', intensity: 0.8, position: [30, 40, 20],
        castShadow: true, shadowMapSize: 2048,
        shadowCamera: { left: -60, right: 60, top: 60, bottom: -60 },
      },
      point: { color: '#1A73E8', intensity: 0.3, position: [0, 20, 0], distance: 100 },
    },
    walls: {
      color: '#1a2040', opacity: 0.4, edgeColor: '#1A73E8', edgeOpacity: 0.3,
      segments: [
        { x: -50, y: 0, z: 0, width: 0.3, height: 3, depth: 80 },
        { x: 50, y: 0, z: 0, width: 0.3, height: 3, depth: 80 },
      ],
    },
    materials: minimalMaterials,
    statusColors,
    defaults: { device: minimalDeviceDefaults },
    buildings: [
      { name: '厂房A', x: -15, z: -10, w: 20, d: 15, h: 8, color: '#1A73E8' },
      { name: '厂房B', x: 15, z: 10, w: 18, d: 12, h: 6, color: '#0F9D58' },
    ],
    devices: [
      { id: 'cam-01', name: '摄像头1', x: 5, y: 3, z: 5, status: 'online', location: '入口' },
      { id: 'cam-02', name: '摄像头2', x: -5, y: 3, z: -5, status: 'alarm', location: '仓库', alarmType: '入侵检测' },
      { id: 'cam-03', name: '摄像头3', x: 0, y: 3, z: 0, status: 'offline', location: '车间' },
    ],
  }
}

/** 创建带指定宽高的容器 */
function createContainer(width = 800, height = 600): HTMLElement {
  const div = document.createElement('div')
  Object.defineProperty(div, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(div, 'clientHeight', { value: height, configurable: true })
  div.appendChild = vi.fn(() => div) as any
  return div
}

// ════════════════════════════════════════════════════
// ── 测试套件 ──
// ════════════════════════════════════════════════════

describe('ThreeDRenderer 模块', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGeometries.length = 0
    mockMaterials.length = 0
    mockMeshes.length = 0
  })

  // ────────────────────────────────────────
  // 1. 工具函数
  // ────────────────────────────────────────
  describe('工具函数 parseHexColor / getStatusColor', () => {
    it('parseHexColor 正确解析 6 位 hex 颜色', () => {
      expect(parseHexColor('#1A73E8')).toBe(0x1A73E8)
      expect(parseHexColor('#ffffff')).toBe(0xFFFFFF)
      expect(parseHexColor('#000000')).toBe(0x000000)
    })

    it('parseHexColor 正确解析 3 位缩写 hex 颜色', () => {
      expect(parseHexColor('#FFF')).toBe(0xFFFFFF)
      expect(parseHexColor('#abc')).toBe(0xAABBCC)
      expect(parseHexColor('#000')).toBe(0x000000)
    })

    it('parseHexColor 处理无 # 前缀的颜色', () => {
      expect(parseHexColor('1A73E8')).toBe(0x1A73E8)
      expect(parseHexColor('fff')).toBe(0xFFFFFF)
    })

    it('getStatusColor 返回正确状态颜色', () => {
      const colors: Record<string, string> = { online: '#0F9D58', offline: '#999999', alarm: '#DB4437' }
      expect(getStatusColor('online', colors)).toBe(parseHexColor('#0F9D58'))
      expect(getStatusColor('alarm', colors)).toBe(parseHexColor('#DB4437'))
      expect(getStatusColor('offline', colors)).toBe(parseHexColor('#999999'))
    })

    it('getStatusColor 对未知状态 fallback 到 online 颜色', () => {
      const colors: Record<string, string> = { online: '#0F9D58' }
      expect(getStatusColor('unknown_status', colors)).toBe(parseHexColor('#0F9D58'))
    })

    it('getStatusColor 在无 online 键时 fallback 到默认颜色', () => {
      const colors: Record<string, string> = {}
      expect(getStatusColor('unknown', colors)).toBe(parseHexColor('#0F9D58'))
    })
  })

  // ────────────────────────────────────────
  // 2. ModelLoader
  // ────────────────────────────────────────
  describe('ModelLoader 模型创建', () => {
    let loader: ModelLoader

    beforeEach(() => {
      loader = new ModelLoader(minimalMaterials, statusColors, minimalDeviceDefaults)
    })

    it('createGround 返回接收阴影的地面 Mesh', () => {
      const ground = loader.createGround(createMinimalConfig().scene)
      expect(ground).toBeDefined()
      expect(ground.receiveShadow).toBe(true)
      expect(ground.rotation.x).toBe(-Math.PI / 2)
    })

    it('createGround 使用配置中的颜色和尺寸', () => {
      loader.createGround(createMinimalConfig().scene)
      // PlaneGeometry mock 是 vi.fn，可直接断言调用参数
      expect(THREE.PlaneGeometry).toHaveBeenCalledWith(100, 80)
    })

    it('createGrid 返回 GridHelper 对象', () => {
      const grid = loader.createGrid(createMinimalConfig().scene)
      expect(grid).toBeDefined()
    })

    it('createFog 返回 FogExp2 实例', () => {
      const fog = loader.createFog(createMinimalConfig().scene)
      expect(fog).toBeDefined()
    })

    it('createAmbientLight 创建环境光', () => {
      const light = loader.createAmbientLight(createMinimalConfig().lighting)
      expect(light).toBeDefined()
      expect(light.color).toBe(parseHexColor('#334455'))
      expect(light.intensity).toBe(0.6)
    })

    it('createDirectionalLight 创建带阴影的方向光', () => {
      const config = createMinimalConfig()
      const light = loader.createDirectionalLight(config.lighting)
      expect(light).toBeDefined()
      expect(light.castShadow).toBe(true)
      expect(light.position.set).toHaveBeenCalledWith(30, 40, 20)
    })

    it('createPointLight 创建点光源', () => {
      const light = loader.createPointLight(createMinimalConfig().lighting)
      expect(light).toBeDefined()
      expect(light.position.set).toHaveBeenCalledWith(0, 20, 0)
    })

    it('createWall 返回含 dispose 方法的模型结果', () => {
      const result = loader.createWall(
        { x: 0, y: 0, z: 0, width: 1, height: 3, depth: 20 },
        parseHexColor('#1a2040'),
        parseHexColor('#1A73E8'),
      )
      expect(result.mesh).toBeDefined()
      expect(typeof result.dispose).toBe('function')
    })

    it('createWall 的 dispose 释放几何体和材质', () => {
      const result = loader.createWall(
        { x: 0, y: 0, z: 0, width: 1, height: 3, depth: 20 },
        0x1a2040,
        0x1A73E8,
      )
      const geoDisposeSpy = result.mesh.geometry.dispose
      const matDisposeSpy = (result.mesh.material as unknown as { dispose: ReturnType<typeof vi.fn> }).dispose
      result.dispose()
      expect(geoDisposeSpy).toHaveBeenCalled()
      expect(matDisposeSpy).toHaveBeenCalled()
    })

    it('createBuilding 返回含 mesh、edges、label 的结果', () => {
      const result = loader.createBuilding({
        name: '厂房A', x: -15, z: -10, w: 20, d: 15, h: 8, color: '#1A73E8',
      })
      expect(result.mesh).toBeDefined()
      expect(result.edges).toBeDefined()
      expect(result.label).toBeNull()
      expect(typeof result.dispose).toBe('function')
    })

    it('createBuilding 正确设置建筑位置和高度', () => {
      const result = loader.createBuilding({
        name: '厂房A', x: -15, z: -10, w: 20, d: 15, h: 8, color: '#1A73E8',
      })
      // position.set should be called with (x, h/2, z)
      expect(result.mesh.position.set).toHaveBeenCalledWith(-15, 4, -10)
    })

    it('createDevice 返回 body、lens、cone、pulse（仅 alarm 状态有脉冲）', () => {
      const onlineDevice = loader.createDevice({
        id: 'd1', name: '在线', x: 0, y: 3, z: 0, status: 'online',
      })
      expect(onlineDevice.body).toBeDefined()
      expect(onlineDevice.lens).toBeDefined()
      expect(onlineDevice.cone).toBeDefined()
      expect(onlineDevice.pulse).toBeUndefined()

      const alarmDevice = loader.createDevice({
        id: 'd2', name: '告警', x: 5, y: 3, z: 5, status: 'alarm',
      })
      expect(alarmDevice.pulse).toBeDefined()
    })

    it('createDevice 使用自定义 fov 和 rotation 调用 ConeGeometry', () => {
      loader.createDevice({
        id: 'd3', name: '自定义', x: 0, y: 3, z: 0,
        status: 'online', fov: 120, rotation: 1.57,
      })
      // ConeGeometry 应被调用（自定义 fov 影响锥体角度）
      expect(THREE.ConeGeometry).toHaveBeenCalled()
    })

    it('createDevice 的 dispose 释放所有子模型资源', () => {
      const device = loader.createDevice({
        id: 'd4', name: '测试', x: 0, y: 3, z: 0, status: 'alarm',
      })
      const beforeDisposeCalls = mockGeometries.filter(g => g.dispose.mock.calls.length > 0).length
      device.dispose()
      // 至少 body/lens/cone 的 geometry 被 dispose
      const afterDisposeCalls = mockGeometries.filter(g => g.dispose.mock.calls.length > 0).length
      expect(afterDisposeCalls).toBeGreaterThan(beforeDisposeCalls)
    })

    it('createCamera 创建指定 fov 的透视相机', () => {
      const config = createMinimalConfig().camera
      const camera = loader.createCamera(config, 16 / 9)
      expect(camera).toBeDefined()
      expect(camera.position.set).toHaveBeenCalledWith(60, 50, 70)
    })

    it('createRenderer 创建 WebGLRenderer 并设置尺寸', () => {
      const config = createMinimalConfig().renderer
      const renderer = loader.createRenderer(config, 800, 600)
      expect(renderer).toBeDefined()
      expect(renderer.setSize).toHaveBeenCalledWith(800, 600)
      expect(renderer.shadowMap.enabled).toBe(true)
    })

    it('createRenderer 限制像素比不超过 pixelRatioCap', () => {
      const config = createMinimalConfig().renderer
      const renderer = loader.createRenderer(config, 800, 600)
      expect(renderer.setPixelRatio).toHaveBeenCalled()
    })

    it('disposeSceneResources 递归释放场景中的 GPU 资源', () => {
      const scene = {
        traverse: vi.fn((cb: (obj: any) => void) => {
          // 模拟场景中有一个 Mesh 对象
          cb({
            geometry: { dispose: vi.fn() },
            material: { dispose: vi.fn(), map: { dispose: vi.fn() } },
          })
        }),
      }
      ModelLoader.disposeSceneResources(scene as any)
      expect(scene.traverse).toHaveBeenCalled()
    })
  })

  // ────────────────────────────────────────
  // 3. SceneBuilder
  // ────────────────────────────────────────
  describe('SceneBuilder 场景构建', () => {
    let builder: SceneBuilder
    let container: HTMLElement
    let config: FullModelConfig

    beforeEach(() => {
      config = createMinimalConfig()
      builder = new SceneBuilder(config)
      container = createContainer(800, 600)
    })

    afterEach(() => {
      try { builder.dispose() } catch (_) { /* ignore */ }
    })

    it('构造函数正确初始化 loader 和 config', () => {
      expect(builder.config).toBe(config)
      expect(builder.loader).toBeInstanceOf(ModelLoader)
      expect(builder.deviceCount).toBe(0)
    })

    it('init 初始化后 scene / camera / renderer / controls 均已创建', () => {
      builder.init(container)
      expect(builder.scene).toBeDefined()
      expect(builder.camera).toBeDefined()
      expect(builder.renderer).toBeDefined()
      expect(builder.controls).toBeDefined()
      expect(builder.labelRenderer).toBeDefined()
    })

    it('init 后 devices 从 config 加载到 deviceEntries', () => {
      builder.init(container)
      expect(builder.deviceCount).toBe(3) // cam-01, cam-02, cam-03
    })

    it('init 后 renderer.domElement 被添加到容器', () => {
      builder.init(container)
      expect(container.appendChild).toHaveBeenCalled()
    })

    it('addDevice 添加单个设备', () => {
      builder.init(container)
      const before = builder.deviceCount
      builder.addDevice({
        id: 'cam-new', name: '新设备', x: 10, y: 5, z: 10,
        status: 'online', location: '测试区',
      })
      expect(builder.deviceCount).toBe(before + 1)
    })

    it('addDevice 对已存在 id 先移除再添加（幂等）', () => {
      builder.init(container)
      const count = builder.deviceCount
      builder.addDevice({
        id: 'cam-01', name: '覆盖摄像头', x: 99, y: 99, z: 99,
        status: 'online', location: '更新',
      })
      // 数量不变（先 remove 再 add）
      expect(builder.deviceCount).toBe(count)
    })

    it('removeDevice 移除指定设备并释放资源', () => {
      builder.init(container)
      expect(builder.deviceCount).toBe(3)
      builder.removeDevice('cam-01')
      expect(builder.deviceCount).toBe(2)
    })

    it('removeDevice 对不存在的 id 不报错', () => {
      builder.init(container)
      expect(() => builder.removeDevice('non-existent')).not.toThrow()
      expect(builder.deviceCount).toBe(3)
    })

    it('reloadDevices 清除旧设备并加载新设备列表', () => {
      builder.init(container)
      expect(builder.deviceCount).toBe(3)
      builder.reloadDevices([
        { id: 'new-1', name: '新1', x: 0, y: 0, z: 0, status: 'online', location: 'A' },
        { id: 'new-2', name: '新2', x: 1, y: 1, z: 1, status: 'offline', location: 'B' },
      ])
      expect(builder.deviceCount).toBe(2)
    })

    it('reloadDevices 传入空数组清空所有设备', () => {
      builder.init(container)
      builder.reloadDevices([])
      expect(builder.deviceCount).toBe(0)
    })

    it('resetCamera 将相机和 target 恢复到配置默认值', () => {
      builder.init(container)
      builder.resetCamera()
      expect(builder.camera.position.set).toHaveBeenCalledWith(60, 50, 70)
      expect(builder.controls.target.set).toHaveBeenCalledWith(0, 0, 0)
    })

    it('updateSize 更新 camera aspect 和 renderer 尺寸', () => {
      builder.init(container)
      builder.updateSize(1024, 768)
      expect(builder.camera.updateProjectionMatrix).toHaveBeenCalled()
      expect(builder.renderer.setSize).toHaveBeenCalledWith(1024, 768)
    })

    it('updateSize 对 0 值使用最小值 1（防止除零）', () => {
      builder.init(container)
      expect(() => builder.updateSize(0, 0)).not.toThrow()
      expect(builder.renderer.setSize).toHaveBeenCalledWith(1, 1)
    })

    it('animate 调用 renderer.render 和 controls.update', () => {
      builder.init(container)
      // 取消由 animate 产生的后续帧
      const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
      builder.animate(true, true)
      expect(builder.renderer.render).toHaveBeenCalled()
      expect(builder.controls.update).toHaveBeenCalled()
      // 清理挂起的帧
      cancelSpy.mockRestore()
    })

    it('animate 返回有效的 animationFrame id', () => {
      builder.init(container)
      const id = builder.animate()
      expect(id).toBeDefined()
      cancelAnimationFrame(id as number)
    })

    it('raycastDevice 返回 null（无命中时）', () => {
      builder.init(container)
      const hitId = builder.raycastDevice(0, 0)
      expect(hitId).toBeNull()
    })

    it('dispose 释放所有资源且不抛异常', () => {
      builder.init(container)
      expect(() => builder.dispose()).not.toThrow()
    })

    it('dispose 后再次调用不报错（幂等）', () => {
      builder.init(container)
      builder.dispose()
      expect(() => builder.dispose()).not.toThrow()
    })

    it('rendererInfo 返回 renderer.info', () => {
      builder.init(container)
      const info = builder.rendererInfo
      expect(info).toBeDefined()
    })
  })

  // ────────────────────────────────────────
  // 4. modelConfigs.json 配置完整性
  // ────────────────────────────────────────
  describe('modelConfigs.json 配置校验', () => {
    it('配置文件包含顶层必要字段', () => {
      expect(modelConfig).toHaveProperty('version')
      expect(modelConfig).toHaveProperty('scene')
      expect(modelConfig).toHaveProperty('camera')
      expect(modelConfig).toHaveProperty('renderer')
      expect(modelConfig).toHaveProperty('lighting')
      expect(modelConfig).toHaveProperty('walls')
      expect(modelConfig).toHaveProperty('materials')
      expect(modelConfig).toHaveProperty('statusColors')
      expect(modelConfig).toHaveProperty('defaults')
      expect(modelConfig).toHaveProperty('buildings')
      expect(modelConfig).toHaveProperty('devices')
    })

    it('scene 配置包含 ground 和 fog', () => {
      expect(modelConfig.scene).toHaveProperty('ground')
      expect(modelConfig.scene).toHaveProperty('fog')
      expect(modelConfig.scene).toHaveProperty('grid')
      expect(modelConfig.scene.ground.width).toBeGreaterThan(0)
      expect(modelConfig.scene.ground.height).toBeGreaterThan(0)
    })

    it('camera 配置包含有效的 fov 和距离范围', () => {
      const cam = modelConfig.camera
      expect(cam.fov).toBeGreaterThan(0)
      expect(cam.near).toBeGreaterThan(0)
      expect(cam.far).toBeGreaterThan(cam.near)
      expect(cam.minDistance).toBeLessThan(cam.maxDistance)
    })

    it('walls 包含至少 2 段围墙壁', () => {
      expect(modelConfig.walls.segments.length).toBeGreaterThanOrEqual(2)
    })

    it('statusColors 包含 online/offline/alarm 三种状态', () => {
      expect(modelConfig.statusColors).toHaveProperty('online')
      expect(modelConfig.statusColors).toHaveProperty('offline')
      expect(modelConfig.statusColors).toHaveProperty('alarm')
    })

    it('buildings 数组中的每个建筑包含必要字段', () => {
      for (const b of modelConfig.buildings) {
        expect(b).toHaveProperty('name')
        expect(b).toHaveProperty('x')
        expect(b).toHaveProperty('z')
        expect(b).toHaveProperty('w')
        expect(b).toHaveProperty('d')
        expect(b).toHaveProperty('h')
        expect(b).toHaveProperty('color')
        expect(b.h).toBeGreaterThan(0)
        expect(b.w).toBeGreaterThan(0)
      }
    })

    it('devices 数组中的每个设备包含 id 和 status', () => {
      for (const d of modelConfig.devices) {
        expect(d).toHaveProperty('id')
        expect(d).toHaveProperty('name')
        expect(d).toHaveProperty('status')
        expect(d).toHaveProperty('location')
      }
    })

    it('版本号为非空字符串', () => {
      expect(typeof modelConfig.version).toBe('string')
      expect(modelConfig.version.length).toBeGreaterThan(0)
    })
  })
})
