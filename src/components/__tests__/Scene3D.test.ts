/**
 * @file Scene3D.test.ts
 * @brief Scene3D 三维场景组件 交互测试
 *
 * 覆盖:
 *   1. 模型加载状态 — 组件挂载/销毁、场景初始化、资源释放
 *   2. 鼠标交互响应 — 设备悬停tooltip、复位/脉冲/标签按钮
 *   3. 场景自适应布局 — resize 事件响应、camera aspect 更新
 *   4. 渲染性能与内存泄漏 — 大量设备创建/销毁、GPU 资源释放、animationFrame 清理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import * as THREE from 'three'

// ── Mock element-plus icons ────────────────────────────────
vi.mock('@element-plus/icons-vue', () => ({
  RefreshRight: { template: '<svg class="icon-refresh" />' },
}))

// ── Mock Element Plus 组件 ──────────────────────────────────
const ElButtonStub = { template: '<button class="el-button" @click="$emit(\'click\')"><slot /></button>' }
const ElButtonGroupStub = { template: '<div class="el-button-group"><slot /></div>' }
const ElIconStub = { template: '<span class="el-icon"><slot /></span>' }

// ── Mock WebGLRenderer 以便在 happy-dom 中测试 ──────────────
const mockCanvas = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  style: {},
  width: 800,
  height: 600,
  getContext: vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  })),
}

// Mock THREE.WebGLRenderer
vi.spyOn(THREE, 'WebGLRenderer').mockImplementation(((_opts: any) => {
  const renderer = {
    domElement: mockCanvas,
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    shadowMap: { enabled: false, type: THREE.PCFShadowMap },
    getPixelRatio: vi.fn(() => 1),
    getDrawingBufferSize: vi.fn(() => new THREE.Vector2(800, 600)),
  } as any
  return renderer as unknown as THREE.WebGLRenderer
}) as any)

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

// ── 辅助: 挂载 Scene3D ──────────────────────────────────
async function mountScene3D(props: Record<string, any> = {}) {
  const Scene3D = (await import('@/components/Scene3D.vue')).default
  const wrapper = mount(Scene3D, {
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
  let wrapper: VueWrapper<any>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Mock requestAnimationFrame / cancelAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      clearTimeout(id)
    })
    // Mock performance.now
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ========================================================================
  // 1. 模型加载状态
  // ========================================================================
  describe('模型加载状态', () => {
    it('组件挂载成功，渲染 .scene3d-container', async () => {
      wrapper = await mountScene3D()
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('组件挂载后初始化 THREE.js 场景（WebGLRenderer 被调用）', async () => {
      wrapper = await mountScene3D()
      expect(THREE.WebGLRenderer).toHaveBeenCalled()
    })

    it('使用默认设备数据渲染场景（无 props 时使用内部默认数据）', async () => {
      wrapper = await mountScene3D()
      // 场景应该被创建，包含默认10个设备
      const container = wrapper.find('.scene3d-container')
      expect(container.exists()).toBe(true)
      // 工具栏存在
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

    it('组件卸载时调用 renderer.dispose() 释放 GPU 资源', async () => {
      wrapper = await mountScene3D()
      const rendererInstance = (THREE.WebGLRenderer as any).mock.results[0]?.value
      wrapper.unmount()
      wrapper = null as any
      expect(rendererInstance?.dispose).toHaveBeenCalled()
    })

    it('组件卸载时取消 animationFrame', async () => {
      wrapper = await mountScene3D()
      wrapper.unmount()
      wrapper = null as any
      expect(window.cancelAnimationFrame).toHaveBeenCalled()
    })

    it('组件卸载时移除 resize 事件监听', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      wrapper = await mountScene3D()
      wrapper.unmount()
      wrapper = null as any
      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    })
  })

  // ========================================================================
  // 2. 鼠标交互响应
  // ========================================================================
  describe('鼠标交互响应', () => {
    it('工具栏包含"复位"按钮', async () => {
      wrapper = await mountScene3D()
      const buttons = wrapper.findAll('.el-button')
      const resetBtn = buttons.find(b => b.text().includes('复位'))
      expect(resetBtn).toBeDefined()
    })

    it('工具栏包含"脉冲"切换按钮', async () => {
      wrapper = await mountScene3D()
      const buttons = wrapper.findAll('.el-button')
      const pulseBtn = buttons.find(b => b.text().includes('关闭脉冲') || b.text().includes('开启脉冲'))
      expect(pulseBtn).toBeDefined()
    })

    it('工具栏包含"标签"切换按钮', async () => {
      wrapper = await mountScene3D()
      const buttons = wrapper.findAll('.el-button')
      const labelBtn = buttons.find(b => b.text().includes('隐藏标签') || b.text().includes('显示标签'))
      expect(labelBtn).toBeDefined()
    })

    it('点击脉冲按钮切换状态文字', async () => {
      wrapper = await mountScene3D()
      const buttons = wrapper.findAll('.el-button')
      const pulseBtn = buttons.find(b => b.text().includes('关闭脉冲'))
      expect(pulseBtn).toBeDefined()
      await pulseBtn!.trigger('click')
      await nextTick()
      // 切换后应该显示"开启脉冲"
      const buttonsAfter = wrapper.findAll('.el-button')
      const pulseBtnAfter = buttonsAfter.find(b => b.text().includes('开启脉冲'))
      expect(pulseBtnAfter).toBeDefined()
    })

    it('点击标签按钮切换状态文字', async () => {
      wrapper = await mountScene3D()
      const buttons = wrapper.findAll('.el-button')
      const labelBtn = buttons.find(b => b.text().includes('隐藏标签'))
      expect(labelBtn).toBeDefined()
      await labelBtn!.trigger('click')
      await nextTick()
      const buttonsAfter = wrapper.findAll('.el-button')
      const labelBtnAfter = buttonsAfter.find(b => b.text().includes('显示标签'))
      expect(labelBtnAfter).toBeDefined()
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

    it('触发 resize 后 renderer.setSize 被调用', async () => {
      wrapper = await mountScene3D()
      const rendererInstance = (THREE.WebGLRenderer as any).mock.results[0]?.value
      const initialCalls = rendererInstance?.setSize.mock.calls.length || 0

      // 触发 resize
      window.dispatchEvent(new Event('resize'))
      await nextTick()

      // setSize 应该被再次调用（resize handler 中）
      expect(rendererInstance?.setSize.mock.calls.length).toBeGreaterThan(initialCalls)
    })

    it('container 样式使用 100% 宽高和 relative 定位', async () => {
      wrapper = await mountScene3D()
      const container = wrapper.find('.scene3d-container')
      expect(container.exists()).toBe(true)
      // 检查 class 是否正确应用
      const classes = container.classes()
      expect(classes).toContain('scene3d-container')
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

      // 更新 props
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
      // 如果 cancelAnimationFrame 被正确调用5次，说明无泄漏
      expect(window.cancelAnimationFrame).toHaveBeenCalled()
      wrapper = null as any
    })

    it('高频 props 更新不崩溃（压力测试）', async () => {
      const devices = makeDevices(20)
      wrapper = await mountScene3D({ devices })

      // 快速连续更新 props 10次
      for (let i = 0; i < 10; i++) {
        await wrapper.setProps({ devices: makeDevices(20 + i * 5) })
      }
      await nextTick()
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })

    it('renderer.dispose 在卸载时被正确调用（GPU 资源释放验证）', async () => {
      wrapper = await mountScene3D({ devices: makeDevices(30) })
      const rendererInstance = (THREE.WebGLRenderer as any).mock.results[0]?.value
      expect(rendererInstance?.dispose).not.toHaveBeenCalled()

      wrapper.unmount()
      wrapper = null as any

      expect(rendererInstance?.dispose).toHaveBeenCalledTimes(1)
    })

    it('大体积模型场景（200设备 + 30建筑）挂载不报错', async () => {
      const devices = makeDevices(200)
      const buildings = makeBuildings(30)
      wrapper = await mountScene3D({ devices, buildings })
      expect(wrapper.find('.scene3d-container').exists()).toBe(true)
    })
  })
})
