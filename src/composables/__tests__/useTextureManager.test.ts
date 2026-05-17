/**
 * @file useTextureManager.test.ts
 * @brief 纹理管理 Composable 单元测试
 *
 * 覆盖:
 *   - 程序化纹理生成 (ground/buildingWall/roof)
 *   - 配置加载与降级策略
 *   - 纹理缓存
 *   - 资源释放
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TextureSource } from '@/types/texture'

// ════════════════════════════════════════════════════
// ── Canvas Mock (Node.js 没有 document.createElement) ──
// ════════════════════════════════════════════════════

const mockCtx = {
  fillStyle: '',
  fillRect: vi.fn(),
  strokeStyle: '',
  lineWidth: 0,
  setLineDash: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  strokeRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(1024 * 1024 * 4) })),
  putImageData: vi.fn(),
}

beforeEach(() => {
  const orig = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockCtx),
        style: {},
      } as any
    }
    return orig(tag)
  })
})

// ════════════════════════════════════════════════════
// ── THREE.js Mock ──
// ════════════════════════════════════════════════════
//
// 关键: 每次调用 CanvasTexture/TextureLoader 构造函数都必须返回
//       包含完整的 repeat / offset / dispose 的对象，
//       否则源码中 tex.repeat.set(...) 会报 TypeError。

/** 创建一个完整的 mock 纹理对象 */
function createMockTexture() {
  return {
    wrapS: 0,
    wrapT: 0,
    repeat: { set: vi.fn() },
    offset: { set: vi.fn() },
    rotation: 0,
    colorSpace: '',
    dispose: vi.fn(),
  }
}

vi.mock('three', () => {
  // 用闭包函数保证每次 new 都返回新实例
  const _MockCanvasTexture = vi.fn(() => createMockTexture())

  return {
    __esModule: true,
    CanvasTexture: _MockCanvasTexture,
    TextureLoader: vi.fn(() => ({
      load: vi.fn(),
    })),
    RepeatWrapping: 1000,
    SRGBColorSpace: 'srgb',
    NoToneMapping: 0,
    LinearToneMapping: 1,
    ReinhardToneMapping: 2,
    CineonToneMapping: 3,
    ACESFilmicToneMapping: 4,
    Color: vi.fn(() => ({ r: 0, g: 0, b: 0 })),
    AmbientLight: vi.fn(() => ({ position: { set: vi.fn() } })),
    HemisphereLight: vi.fn(() => ({ position: { set: vi.fn() } })),
    DirectionalLight: vi.fn(() => ({
      position: { set: vi.fn() },
      castShadow: false,
      shadow: {
        mapSize: { set: vi.fn() },
        camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0 },
        bias: 0,
      },
    })),
    PointLight: vi.fn(() => ({ position: { set: vi.fn() } })),
    FogExp2: vi.fn(),
    Fog: vi.fn(),
  }
})

// ════════════════════════════════════════════════════
// ── 共用的测试配置工厂 ──
// ════════════════════════════════════════════════════

function makeLightingConfig() {
  return {
    ambientColor: '#b8c8e0',
    ambientIntensity: 1.2,
    hemisphereSkyColor: '#88aacc',
    hemisphereGroundColor: '#445533',
    hemisphereIntensity: 0.8,
    directionalColor: '#ffeedd',
    directionalIntensity: 1.8,
    directionalPosition: [40, 60, 30] as [number, number, number],
    castShadow: true,
    fillColor: '#aabbdd',
    fillIntensity: 0.5,
    fillPosition: [-30, 30, -20] as [number, number, number],
    pointColor: '#4488ff',
    pointIntensity: 0.6,
    pointPosition: [0, 25, 0] as [number, number, number],
  }
}

function makeSceneConfig(overrides: Record<string, any> = {}) {
  return {
    id: 'test-scene',
    name: '测试场景',
    backgroundColor: '#151a28',
    textures: [
      { id: 'ground-1', type: 'ground' as const, source: TextureSource.PROCEDURAL, seed: 42, tileable: true },
    ],
    buildingTextures: [],
    lighting: makeLightingConfig(),
    toneMapping: { mode: 'ACESFilmic' as const, exposure: 1.4 },
    fog: { type: 'exp2' as const, color: '#151a28', density: 0.005 },
    ...overrides,
  }
}

// ════════════════════════════════════════════════════
// ── 测试 ──
// ════════════════════════════════════════════════════

describe('composables/useTextureManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── 1. 导出完整性 ────────────────────────────────

  it('useTextureManager 返回所有必要的属性和方法', async () => {
    const { useTextureManager } = await import('@/composables/useTextureManager')
    const manager = useTextureManager()

    // 属性
    expect(manager).toHaveProperty('activeConfig')
    expect(manager).toHaveProperty('loadedTextures')
    expect(manager).toHaveProperty('loading')
    expect(manager).toHaveProperty('error')

    // 方法
    expect(typeof manager.applyConfig).toBe('function')
    expect(typeof manager.getTexture).toBe('function')
    expect(typeof manager.getBuildingTextureSet).toBe('function')
    expect(typeof manager.buildLighting).toBe('function')
    expect(typeof manager.applyToneMapping).toBe('function')
    expect(typeof manager.applyFog).toBe('function')
    expect(typeof manager.dispose).toBe('function')

    // 程序化纹理生成器
    expect(typeof manager.createProceduralGround).toBe('function')
    expect(typeof manager.createProceduralBuildingWall).toBe('function')
    expect(typeof manager.createProceduralRoof).toBe('function')
  })

  // ─── 2. 程序化纹理生成 ────────────────────────────

  describe('程序化纹理生成', () => {
    it('createProceduralGround 生成 Canvas 纹理并设置 repeat', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { createProceduralGround } = useTextureManager()

      const tex = createProceduralGround()
      expect(tex).toBeDefined()
      expect(tex.dispose).toBeDefined()
      // 源码中 createProceduralGround 设置了 repeat.set(4, 3)
      expect(tex.repeat).toBeDefined()
      expect(tex.repeat.set).toHaveBeenCalledWith(4, 3)
    })

    it('createProceduralBuildingWall 生成 Canvas 纹理', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { createProceduralBuildingWall } = useTextureManager()

      const tex = createProceduralBuildingWall('#4488cc', 42)
      expect(tex).toBeDefined()
      expect(tex.dispose).toBeDefined()
      expect(tex.repeat).toBeDefined()
    })

    it('createProceduralRoof 生成 Canvas 纹理', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { createProceduralRoof } = useTextureManager()

      const tex = createProceduralRoof('#4488cc', 42)
      expect(tex).toBeDefined()
      expect(tex.dispose).toBeDefined()
      expect(tex.repeat).toBeDefined()
    })

    it('不同种子值生成不同纹理实例', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { createProceduralGround } = useTextureManager()

      const tex1 = createProceduralGround(42)
      const tex2 = createProceduralGround(100)

      // 每次 new CanvasTexture 都是新实例
      expect(tex1).not.toBe(tex2)
    })
  })

  // ─── 3. 纹理图片加载 ──────────────────────────────

  describe('纹理图片加载（applyConfig）', () => {
    it('加载程序化纹理配置成功', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const manager = useTextureManager()

      const config = makeSceneConfig({ id: 'test-procedural' })
      const textureMap = await manager.applyConfig(config)

      expect(textureMap).toBeInstanceOf(Map)
      expect(textureMap.has('ground-1')).toBe(true)
      expect(manager.activeConfig.value).not.toBeNull()
      expect(manager.activeConfig.value?.id).toBe('test-procedural')
      expect(manager.loading.value).toBe(false)
      expect(manager.error.value).toBeNull()
    })

    it('加载多张纹理（ground + buildingWall + roof）', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const manager = useTextureManager()

      const config = makeSceneConfig({
        id: 'test-multi',
        textures: [
          { id: 'ground-1', type: 'ground' as const, source: TextureSource.PROCEDURAL, seed: 42 },
          { id: 'wall-1', type: 'buildingWall' as const, source: TextureSource.PROCEDURAL, seed: 10 },
          { id: 'roof-1', type: 'roof' as const, source: TextureSource.PROCEDURAL, seed: 20 },
        ],
      })

      const textureMap = await manager.applyConfig(config)
      expect(textureMap.size).toBe(3)
      expect(textureMap.has('ground-1')).toBe(true)
      expect(textureMap.has('wall-1')).toBe(true)
      expect(textureMap.has('roof-1')).toBe(true)
    })

    it('加载时应用 UV repeat / offset / rotation', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const manager = useTextureManager()

      const config = makeSceneConfig({
        id: 'test-uv',
        textures: [
          {
            id: 'ground-uv',
            type: 'ground' as const,
            source: TextureSource.PROCEDURAL,
            seed: 7,
            repeat: [2, 5] as [number, number],
            offset: [0.1, 0.2] as [number, number],
            rotation: 1.57,
          },
        ],
      })

      const textureMap = await manager.applyConfig(config)
      const tex = textureMap.get('ground-uv')!
      expect(tex).toBeDefined()

      // applyConfig 中在 resolveTexture 之后调用了 tex.repeat.set / tex.offset.set
      expect(tex.repeat.set).toHaveBeenCalledWith(2, 5)
      expect(tex.offset.set).toHaveBeenCalledWith(0.1, 0.2)
      expect(tex.rotation).toBe(1.57)
    })

    it('getTexture 返回已加载纹理 / undefined', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const manager = useTextureManager()

      await manager.applyConfig(makeSceneConfig({ id: 'test-get' }))
      expect(manager.getTexture('ground-1')).toBeDefined()
      expect(manager.getTexture('non-existent')).toBeUndefined()
    })
  })

  // ─── 4. 材质应用（建筑纹理集） ──────────────────

  describe('建筑纹理映射', () => {
    it('getBuildingTextureSet 返回正确的建筑纹理集', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const manager = useTextureManager()

      const config = makeSceneConfig({
        id: 'test-building-tex',
        textures: [
          { id: 'wall-1', type: 'buildingWall' as const, source: TextureSource.PROCEDURAL, seed: 100 },
        ],
        buildingTextures: [
          { buildingName: '1号车间', wallTextureId: 'wall-1', roofTextureId: 'roof-default', tintColor: '#1A73E8' },
        ],
      })

      await manager.applyConfig(config)

      const btSet = manager.getBuildingTextureSet('1号车间')
      expect(btSet).not.toBeNull()
      expect(btSet?.wallTextureId).toBe('wall-1')
      expect(btSet?.tintColor).toBe('#1A73E8')

      // Array.find 返回 undefined，源码逻辑: return ...find(...) || null
      // 取决于实现 — 接受 undefined 或 null
      const missing = manager.getBuildingTextureSet('不存在的建筑')
      expect(missing == null).toBe(true) // 兼容 null 和 undefined
    })

    it('未加载配置时 getBuildingTextureSet 返回 null', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const manager = useTextureManager()

      expect(manager.getBuildingTextureSet('任何建筑')).toBeNull()
    })
  })

  // ─── 5. 光照参数调整 ────────────────────────────

  describe('光照参数', () => {
    it('buildLighting 创建完整光照链', async () => {
      const THREE = await import('three')
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { buildLighting } = useTextureManager()

      const mockScene = { add: vi.fn() }
      const config = makeSceneConfig()

      buildLighting(config, mockScene as any)

      // 场景应添加 5 个光源: Ambient + Hemisphere + Directional + Fill + Point
      expect(mockScene.add).toHaveBeenCalledTimes(5)
      expect(THREE.AmbientLight).toHaveBeenCalled()
      expect(THREE.HemisphereLight).toHaveBeenCalled()
      expect(THREE.DirectionalLight).toHaveBeenCalled()
      expect(THREE.PointLight).toHaveBeenCalled()
    })

    it('buildLighting 传递正确的光照强度参数', async () => {
      const THREE = await import('three')
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { buildLighting } = useTextureManager()

      const mockScene = { add: vi.fn() }
      const lighting = makeLightingConfig()
      const config = makeSceneConfig({ lighting })

      buildLighting(config, mockScene as any)

      // AmbientLight(color, intensity)
      expect(THREE.AmbientLight).toHaveBeenCalledWith(
        expect.anything(),
        lighting.ambientIntensity,
      )
      // DirectionalLight(color, intensity)
      expect(THREE.DirectionalLight).toHaveBeenCalledWith(
        expect.anything(),
        lighting.directionalIntensity,
      )
    })

    it('castShadow=true 时设置阴影参数', async () => {
      const THREE = await import('three')
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { buildLighting } = useTextureManager()

      const mockScene = { add: vi.fn() }
      const config = makeSceneConfig({
        lighting: { ...makeLightingConfig(), castShadow: true },
      })

      buildLighting(config, mockScene as any)

      // DirectionalLight 被调用（主方向光 + 补光 = 2 次）
      expect(THREE.DirectionalLight).toHaveBeenCalledTimes(2)

      // 获取第一次调用的返回实例（主方向光）
      const DirLight = THREE.DirectionalLight as any
      const lastInstance = DirLight.mock.results[DirLight.mock.results.length - 1]?.value

      // castShadow=true 时源码设置 shadow.mapSize.set(2048, 2048)
      // 验证至少有一个 DirectionalLight 实例的 shadow.mapSize.set 被调用
      const found = DirLight.mock.results.some((r: any) => {
        try { return r.value.shadow.mapSize.set.mock.calls.length > 0 } catch { return false }
      })
      expect(found).toBe(true)
    })
  })

  // ─── 6. 色调映射 ──────────────────────────────────

  describe('色调映射', () => {
    it('applyToneMapping 设置渲染器参数', async () => {
      const THREE = await import('three')
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { applyToneMapping } = useTextureManager()

      const mockRenderer = {
        toneMapping: 0,
        toneMappingExposure: 1,
      }

      const config = makeSceneConfig({
        toneMapping: { mode: 'ACESFilmic' as const, exposure: 1.8 },
      })

      applyToneMapping(config, mockRenderer as any)

      expect(mockRenderer.toneMapping).toBe(THREE.ACESFilmicToneMapping)
      expect(mockRenderer.toneMappingExposure).toBe(1.8)
    })

    it('不同的 toneMapping 模式映射正确', async () => {
      const THREE = await import('three')
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { applyToneMapping } = useTextureManager()

      const modes: Array<[string, number]> = [
        ['None', THREE.NoToneMapping],
        ['Linear', THREE.LinearToneMapping],
        ['Reinhard', THREE.ReinhardToneMapping],
        ['Cineon', THREE.CineonToneMapping],
        ['ACESFilmic', THREE.ACESFilmicToneMapping],
      ]

      for (const [mode, expected] of modes) {
        const renderer = { toneMapping: -1, toneMappingExposure: 1 }
        applyToneMapping(
          makeSceneConfig({ toneMapping: { mode: mode as any, exposure: 1.0 } }),
          renderer as any,
        )
        expect(renderer.toneMapping).toBe(expected)
      }
    })
  })

  // ─── 7. 雾效 ─────────────────────────────────────

  describe('雾效', () => {
    it('fog type=exp2 创建 FogExp2', async () => {
      const THREE = await import('three')
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { applyFog } = useTextureManager()

      const mockScene = { fog: null }
      const config = makeSceneConfig({ fog: { type: 'exp2', color: '#151a28', density: 0.008 } })

      applyFog(config, mockScene as any)
      expect(THREE.FogExp2).toHaveBeenCalled()
    })

    it('fog type=linear 创建 Fog', async () => {
      const THREE = await import('three')
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { applyFog } = useTextureManager()

      const mockScene = { fog: null }
      const config = makeSceneConfig({
        fog: { type: 'linear', color: '#151a28', near: 30, far: 150 },
      })

      applyFog(config, mockScene as any)
      expect(THREE.Fog).toHaveBeenCalled()
    })

    it('fog type=none 清除雾效', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const { applyFog } = useTextureManager()

      const mockScene = { fog: 'some-fog' as any }
      const config = makeSceneConfig({ fog: { type: 'none', color: '#000000' } })

      applyFog(config, mockScene as any)
      expect(mockScene.fog).toBeNull()
    })
  })

  // ─── 8. 资源释放 ──────────────────────────────────

  describe('资源释放', () => {
    it('dispose 清理所有资源', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const manager = useTextureManager()

      await manager.applyConfig(makeSceneConfig({ id: 'test-dispose' }))
      expect(manager.activeConfig.value).not.toBeNull()

      manager.dispose()
      expect(manager.activeConfig.value).toBeNull()
      expect(manager.loadedTextures.value.size).toBe(0)
    })

    it('dispose 调用每个纹理的 dispose', async () => {
      const { useTextureManager } = await import('@/composables/useTextureManager')
      const manager = useTextureManager()

      await manager.applyConfig(makeSceneConfig({
        id: 'test-dispose-call',
        textures: [
          { id: 'g1', type: 'ground' as const, source: TextureSource.PROCEDURAL },
          { id: 'g2', type: 'ground' as const, source: TextureSource.PROCEDURAL, seed: 99 },
        ],
      }))

      // 获取纹理引用
      const tex1 = manager.getTexture('g1')!
      const tex2 = manager.getTexture('g2')!

      manager.dispose()
      expect(tex1.dispose).toHaveBeenCalled()
      expect(tex2.dispose).toHaveBeenCalled()
    })
  })
})
