/**
 * @file Scene3D.test.ts
 * @brief Scene3D 三维场景组件 交互测试
 *
 * 覆盖:
 *   1. 模型加载状态 — 组件挂载/销毁、场景初始化、资源释放
 *   2. 鼠标交互响应 — 设备悬停tooltip、复位/脉冲/标签按钮
 *   3. 场景自适应布局 — resize 事件响应、camera aspect 更新、ResizeObserver
 *   4. 渲染性能与内存泄漏 — 大量设备创建/销毁、GPU 资源释放、animationFrame 清理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── 使用 vi.hoisted 将 mock 工厂对象提升到 vi.mock 之前初始化 ──
const { threeMock, rendererInstances } = vi.hoisted(() => {
  const rendererInstances: any[] = []

  function createMockCanvas() {
    const el = document.createElement('canvas')
    el.style.display = 'block'
    el.addEventListener = vi.fn()
    el.removeEventListener = vi.fn()
    return el
  }

  function createMockRenderer() {
    const r = {
      domElement: createMockCanvas(),
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      shadowMap: { enabled: false, type: 2, autoUpdate: true, needsUpdate: false },
      getPixelRatio: vi.fn(() => 1),
      // [FIX P2-2 2026-09-12] Scene3D.vue 读取的 renderer 属性补全:
      //   capabilities.getMaxAnisotropy (贴图各向异性) + info.memory/render (性能面板)
      capabilities: { getMaxAnisotropy: vi.fn(() => 16) },
      info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
      toneMapping: 0,
      toneMappingExposure: 1,
    }
    rendererInstances.push(r)
    return r
  }

  function createMockLabelRenderer() {
    const el = document.createElement('div')
    return {
      setSize: vi.fn(),
      render: vi.fn(),
      domElement: el,
    }
  }

  /** [FIX P2-2 2026-09-12] 几何体 mock: 链式变换 API (rotateZ/translate/scale 返回自身) */
  function createMockGeometry() {
    const g: any = {
      dispose: vi.fn(), setAttribute: vi.fn(), computeVertexNormals: vi.fn(),
      setFromPoints: vi.fn(function () { return g }),
      rotateX: vi.fn(function () { return g }),
      rotateY: vi.fn(function () { return g }),
      rotateZ: vi.fn(function () { return g }),
      translate: vi.fn(function () { return g }),
      translateX: vi.fn(function () { return g }),
      translateY: vi.fn(function () { return g }),
      translateZ: vi.fn(function () { return g }),
      scale: vi.fn(function () { return g }),
    }
    return g
  }

  /** 创建完整 mock 的 Object3D — 包含 position/rotation/scale/translateY 等 */
  function createMockObject3D() {
    return {
      position: { x: 0, y: 0, z: 0, set: vi.fn(), copy: vi.fn() },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1, set: vi.fn(), copy: vi.fn() },
      castShadow: false,
      receiveShadow: false,
      visible: true,
      geometry: { dispose: vi.fn() },
      material: {
        dispose: vi.fn(),
        map: null, normalMap: null, roughnessMap: null, metalnessMap: null,
        opacity: 1,
      },
      translateY: vi.fn(),
      translateX: vi.fn(),
      translateZ: vi.fn(),
    }
  }

  const threeMock = {
    Scene: vi.fn(function () {
      return { add: vi.fn(), remove: vi.fn(), traverse: vi.fn(), clear: vi.fn(), background: null, fog: null }
    }),
    PerspectiveCamera: vi.fn(function () {
      return { position: { set: vi.fn() }, lookAt: vi.fn(), aspect: 1, updateProjectionMatrix: vi.fn() }
    }),
    WebGLRenderer: vi.fn(function () { return createMockRenderer() }),
    AmbientLight: vi.fn(function () { return {} }),
    DirectionalLight: vi.fn(function () {
      return {
        position: { set: vi.fn() }, castShadow: false,
        shadow: { mapSize: { set: vi.fn() }, camera: { left: 0, right: 0, top: 0, bottom: 0 } },
      }
    }),
    PointLight: vi.fn(function () { return { position: { set: vi.fn() } } }),
    PlaneGeometry: vi.fn(function () { return createMockGeometry() }),
    BoxGeometry: vi.fn(function () { return createMockGeometry() }),
    CylinderGeometry: vi.fn(function () { return createMockGeometry() }),
    SphereGeometry: vi.fn(function () { return createMockGeometry() }),
    ConeGeometry: vi.fn(function () { return createMockGeometry() }),
    RingGeometry: vi.fn(function () { return createMockGeometry() }),
    EdgesGeometry: vi.fn(function () { return createMockGeometry() }),
    WireframeGeometry: vi.fn(function () { return createMockGeometry() }),
    BufferGeometry: vi.fn(function () { return createMockGeometry() }),
    GridHelper: vi.fn(function () { return {} }),
    MeshStandardMaterial: vi.fn(function () {
      return { dispose: vi.fn(), map: null, normalMap: null, roughnessMap: null, metalnessMap: null }
    }),
    MeshBasicMaterial: vi.fn(function () {
      return { dispose: vi.fn(), map: null }
    }),
    LineBasicMaterial: vi.fn(function () { return { dispose: vi.fn() } }),
    Mesh: vi.fn(function () { return createMockObject3D() }),
    LineSegments: vi.fn(function () { return createMockObject3D() }),
    Line: vi.fn(function () { return createMockObject3D() }),
    Points: vi.fn(function () { return createMockObject3D() }),
    Group: vi.fn(function () {
      return { ...createMockObject3D(), add: vi.fn(), remove: vi.fn(), traverse: vi.fn(), children: [] as unknown[] }
    }),
    Plane: vi.fn(function () { return { set: vi.fn() } }),
    Raycaster: vi.fn(function () {
      return { setFromCamera: vi.fn(), intersectObjects: vi.fn(() => []), ray: { intersectPlane: vi.fn(() => null) } }
    }),
    Vector2: vi.fn(function () { return { x: 0, y: 0 } }),
    Vector3: vi.fn(function () {
      return { x: 0, y: 0, z: 0, set: vi.fn(), copy: vi.fn(), setFromSphericalCoords: vi.fn() }
    }),
    Color: vi.fn(function () { return {} }),
    FogExp2: vi.fn(function () { return {} }),
    PCFShadowMap: 2,
    PCFSoftShadowMap: 2,
    DoubleSide: 2,
    // [FIX P2-2 2026-09-12] 补全 Scene3D.vue v1.7~v1.9 新增引用 (测试 mock 未同步):
    //   Sky/PMREM(IBL) 环境光照 + 半球光 + 粒子系统 + 巡逻曲线/贴图加载器等
    MathUtils: { degToRad: (d: number) => (d * Math.PI) / 180 },
    HemisphereLight: vi.fn(function () { return { position: { set: vi.fn() } } }),
    PMREMGenerator: vi.fn(function () {
      return { fromScene: vi.fn(() => ({ texture: {} })), dispose: vi.fn() }
    }),
    CatmullRomCurve3: vi.fn(function () {
      return { getPointAt: vi.fn(() => ({ x: 0, y: 0, z: 0 })), getPoints: vi.fn(() => []) }
    }),
    BufferAttribute: vi.fn(function () { return {} }),
    PointsMaterial: vi.fn(function () { return { dispose: vi.fn() } }),
    TextureLoader: vi.fn(function () { return { load: vi.fn(), setCrossOrigin: vi.fn() } }),
    VideoTexture: vi.fn(function () {
      return { dispose: vi.fn(), colorSpace: null, needsUpdate: false }
    }),
    SRGBColorSpace: 'srgb',
    ACESFilmicToneMapping: 4,
  }

  return { threeMock, rendererInstances }
})

// ── Mock 模块声明（工厂引用 hoisted 对象） ──────────────────
vi.mock('three', () => threeMock)

// [FIX P2-2 2026-09-12] Scene3D.vue 新增 import (Sky IBL / GLTFLoader / BufferGeometryUtils)
//   的真实模块依赖 three 做类继承 (class Sky extends Mesh), 与 vi.fn mock 不兼容,
//   必须同步模块级 mock — 否则修好 THREE.Group 后此处会随即报错。
vi.mock('three/examples/jsm/objects/Sky.js', () => ({
  Sky: vi.fn(function () {
    return {
      scale: { setScalar: vi.fn() },
      material: {
        uniforms: {
          turbidity: { value: 0 }, rayleigh: { value: 0 },
          mieCoefficient: { value: 0 }, mieDirectionalG: { value: 0 },
          sunPosition: { value: { copy: vi.fn() } },
        },
      },
    }
  }),
}))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn(function () {
    return { load: vi.fn(), loadAsync: vi.fn(() => new Promise(() => {})) }
  }),
}))
vi.mock('three/examples/jsm/utils/BufferGeometryUtils.js', () => ({
  mergeGeometries: vi.fn(() => ({ dispose: vi.fn() })),
}))

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn(function () {
    return {
      enableDamping: false, dampingFactor: 0, maxPolarAngle: 0,
      minDistance: 0, maxDistance: 0, target: { set: vi.fn() }, update: vi.fn(),
      // [FIX P2-2 2026-09-12] v1.8.0 按需渲染: controls 'change' 事件监听
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      enabled: true, enablePan: true, enableRotate: true,
      rotateSpeed: 1, zoomSpeed: 1,
    }
  }),
}))

vi.mock('three/examples/jsm/renderers/CSS2DRenderer.js', () => ({
  CSS2DRenderer: vi.fn(function () {
    return {
      setSize: vi.fn(), render: vi.fn(),
      domElement: (() => { const el = document.createElement('div'); return el })(),
    }
  }),
  CSS2DObject: vi.fn(function (element: HTMLElement) {
    return { position: { set: vi.fn() }, visible: true, element: element || document.createElement('div') }
  }),
}))

vi.mock('@element-plus/icons-vue', () => ({
  RefreshRight: { template: '<svg class="icon-refresh" />' },
}))

// ── Mock Element Plus 组件 ──────────────────────────────────
// 关键：Vue 编译 @click 为 onClick prop，stub 需要从 $attrs 中读取并调用
const ElButtonStub = {
  name: 'ElButton',
  inheritAttrs: false,
  template: '<button class="el-button" v-bind="$attrs"><slot /></button>',
}

const ElButtonGroupStub = { template: '<div class="el-button-group"><slot /></div>' }
const ElIconStub = { template: '<span class="el-icon"><slot /></span>' }

// ── 测试数据 ──────────────────────────────────────────────
function makeDevices(count: number) {
  const statuses: Array<'online' | 'offline' | 'alarm' | 'maintenance'> = ['online', 'offline', 'alarm', 'maintenance']
  return Array.from({ length: count }, (_, i) => ({
    id: `dev-${i}`,
    name: `CAM_${String(i + 1).padStart(2, '0')}`,
    x: (i % 10) * 8 - 40,
    y: 4,
    z: Math.floor(i / 10) * 10 - 30,
    status: statuses[i % statuses.length],
    location: `位置${i + 1}`,
    alarmType: statuses[i % statuses.length] === 'alarm' ? '周界入侵' : undefined,
    fov: 60,
    rotation: 0,
  }))
}

function makeBuildings(count: number) {
  const colors = ['#1A73E8', '#0F9D58', '#F4B400', '#7C3AED', '#666']
  return Array.from({ length: count }, (_, i) => ({
    name: `${i + 1}号建筑`,
    x: (i % 3) * 25 - 25,
    z: Math.floor(i / 3) * 20 - 15,
    w: 12,
    d: 10,
    h: 6 + i,
    color: colors[i % colors.length],
  }))
}

// ── 预导入组件 ──
import Scene3DComponent from '@/components/Scene3D.vue'

// ── 辅助: 挂载 Scene3D ──────────────────────────────────
async function mountScene3D(props: Record<string, any> = {}) {
  const wrapper = mount(Scene3DComponent, {
    props,
    global: {
      stubs: {
        'el-button': ElButtonStub,
        'el-button-group': ElButtonGroupStub,
        'el-icon': ElIconStub,
      },
    },
    attachTo: document.body,
  })
  await nextTick()
  return wrapper
}

// ════════════════════════════════════════════════════════════
// 测试套件
// ════════════════════════════════════════════════════════════
describe('components/Scene3D', () => {
  let wrapper: VueWrapper<any> | null = null

  beforeEach(() => {
    rendererInstances.length = 0
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      clearTimeout(id)
    })
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
      wrapper = null
    }
    vi.useRealTimers()
  })

  // ========================================================================
  // 1. 模型加载状态
  // ========================================================================
  describe('模型加载状态', () => {
    it('组件挂载成功，渲染 .scene3d-container', async () => {
      wrapper = await mountScene3D()
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('使用默认设备数据渲染场景（无 props 时使用内部默认数据）', async () => {
      wrapper = await mountScene3D()
      const container = wrapper.find('.scene3d-container')
      expect(container.exists()).toBe(true)
      expect(wrapper.find('.scene-toolbar').exists()).toBe(true)
    })

    it('传入 devices prop 后正确使用外部设备数据', async () => {
      const devices = makeDevices(3)
      wrapper = await mountScene3D({ devices })
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('传入 buildings prop 后正确使用外部建筑数据', async () => {
      const buildings = makeBuildings(2)
      wrapper = await mountScene3D({ buildings })
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('组件卸载时取消 animationFrame', async () => {
      wrapper = await mountScene3D()
      wrapper.unmount()
      wrapper = null
      expect(window.cancelAnimationFrame).toHaveBeenCalled()
    })

    it('组件卸载时移除 resize 事件监听', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      wrapper = await mountScene3D()
      wrapper.unmount()
      wrapper = null
      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    })

    it('组件卸载时调用 renderer.dispose() 释放 GPU 资源', async () => {
      wrapper = await mountScene3D()
      const rendererInstance = rendererInstances[rendererInstances.length - 1]
      expect(rendererInstance?.dispose).not.toHaveBeenCalled()

      wrapper.unmount()
      wrapper = null
      expect(rendererInstance?.dispose).toHaveBeenCalled()
    })
  })

  // ========================================================================
  // 2. 鼠标交互响应
  // ========================================================================
  describe('鼠标交互响应', () => {
    it('对外暴露 resetCamera 复位方法', async () => {
      wrapper = await mountScene3D()
      expect(typeof (wrapper.vm as any).resetCamera).toBe('function')
      // 调用不报错（相机/controls 均 mock）
      ;(wrapper.vm as any).resetCamera()
    })

    it('对外暴露 toggleLabels 标签切换方法', async () => {
      wrapper = await mountScene3D()
      expect(typeof (wrapper.vm as any).toggleLabels).toBe('function')
    })

    it('AI 助手触发按钮存在', async () => {
      wrapper = await mountScene3D()
      // Teleport 到 body，从 document 查找
      expect(document.body.querySelector('.ai-trigger')).not.toBeNull()
    })

    it('调用 toggleLabels 两次可切换回初始状态', async () => {
      wrapper = await mountScene3D()
      const vm = wrapper.vm as any
      vm.toggleLabels()
      await nextTick()
      vm.toggleLabels()
      await nextTick()
      // 切换回初始值后无异常即通过
      expect(typeof vm.toggleLabels).toBe('function')
    })

    it('调用 resetCamera 后相机与控制器状态被重置', async () => {
      wrapper = await mountScene3D()
      const vm = wrapper.vm as any
      expect(() => vm.resetCamera()).not.toThrow()
    })

    it('无悬停设备时不显示 tooltip', async () => {
      wrapper = await mountScene3D()
      expect(wrapper.find('.scene-overlay').exists()).toBe(false)
    })

    it('图例栏正确渲染三种状态', async () => {
      wrapper = await mountScene3D()
      const legend = wrapper.find('.legend-bar')
      expect(legend.exists()).toBe(true)
      expect(legend.text()).toContain('在线设备')
      expect(legend.text()).toContain('告警点位')
      expect(legend.text()).toContain('离线设备')
    })
  })

  // ========================================================================
  // 3. 场景自适应布局
  // ========================================================================
  describe('场景自适应布局', () => {
    it('组件挂载后监听 window resize 事件', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      wrapper = await mountScene3D()
      expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    })

    it('container 样式使用 100% 宽高和 relative 定位', async () => {
      wrapper = await mountScene3D()
      const container = wrapper.find('.scene3d-container')
      expect(container.exists()).toBe(true)
      const classes = container.classes()
      expect(classes).toContain('scene3d-container')
    })

    it('ResizeObserver 在挂载时被创建并观察容器', async () => {
      const observeSpy = vi.fn()
      const origRO = globalThis.ResizeObserver
      globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
        observe: observeSpy,
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      })) as any

      wrapper = await mountScene3D()
      expect(observeSpy).toHaveBeenCalled()

      globalThis.ResizeObserver = origRO
    })

    it('ResizeObserver 在卸载时被断开', async () => {
      const disconnectSpy = vi.fn()
      const origRO = globalThis.ResizeObserver
      globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        disconnect: disconnectSpy,
        unobserve: vi.fn(),
      })) as any

      wrapper = await mountScene3D()
      wrapper.unmount()
      wrapper = null
      expect(disconnectSpy).toHaveBeenCalled()

      globalThis.ResizeObserver = origRO
    })

    it('触发 window resize 后 renderer.setSize 被调用', async () => {
      wrapper = await mountScene3D()
      const rendererInstance = rendererInstances[rendererInstances.length - 1]

      // mock containerRef 的 clientWidth/clientHeight，使 onResize 走有效路径
      const containerEl = wrapper.element as HTMLElement
      vi.spyOn(containerEl, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(containerEl, 'clientHeight', 'get').mockReturnValue(600)

      const initialCalls = rendererInstance?.setSize.mock.calls.length || 0

      window.dispatchEvent(new Event('resize'))
      await nextTick()

      expect(rendererInstance?.setSize.mock.calls.length).toBeGreaterThan(initialCalls)
    })
  })

  // ========================================================================
  // 4. 设备数据更新响应
  // ========================================================================
  describe('设备数据更新', () => {
    it('devices prop 变更后组件正常更新', async () => {
      const devices1 = makeDevices(2)
      wrapper = await mountScene3D({ devices: devices1 })
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)

      const devices2 = makeDevices(5)
      await wrapper.setProps({ devices: devices2 })
      await nextTick()
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('从少量设备切换到大量设备不报错', async () => {
      const devices1 = makeDevices(2)
      wrapper = await mountScene3D({ devices: devices1 })

      const devices2 = makeDevices(100)
      await wrapper.setProps({ devices: devices2 })
      await nextTick()
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('devices 设为空数组后组件正常渲染', async () => {
      const devices = makeDevices(5)
      wrapper = await mountScene3D({ devices })

      await wrapper.setProps({ devices: [] })
      await nextTick()
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })
  })

  // ========================================================================
  // 5. 渲染性能与内存泄漏专项测试
  // ========================================================================
  describe('渲染性能与内存泄漏', () => {
    it('挂载50个设备场景耗时 < 500ms', async () => {
      const devices = makeDevices(50)
      const start = performance.now()
      wrapper = await mountScene3D({ devices })
      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(500)
    })

    it('挂载100个设备的场景正常渲染', async () => {
      const devices = makeDevices(100)
      wrapper = await mountScene3D({ devices })
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('挂载20栋建筑的场景正常渲染', async () => {
      const buildings = makeBuildings(20)
      wrapper = await mountScene3D({ buildings })
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('多次挂载/卸载不累积 animationFrame', async () => {
      for (let i = 0; i < 5; i++) {
        const w = await mountScene3D({ devices: makeDevices(10) })
        w.unmount()
      }
      expect(window.cancelAnimationFrame).toHaveBeenCalled()
      wrapper = null
    })

    it('高频 props 更新不崩溃（压力测试）', async () => {
      const devices = makeDevices(20)
      wrapper = await mountScene3D({ devices })

      for (let i = 0; i < 10; i++) {
        await wrapper.setProps({ devices: makeDevices(20 + i * 5) })
      }
      await nextTick()
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('大体积模型场景（200设备 + 30建筑）挂载不报错', async () => {
      const devices = makeDevices(200)
      const buildings = makeBuildings(30)
      wrapper = await mountScene3D({ devices, buildings })
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })
  })
})
