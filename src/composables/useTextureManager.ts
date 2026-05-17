import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import * as THREE from 'three'
import type {
  SceneTextureConfig,
  TextureConfig,
  TextureSource,
} from '@/types/texture'

// ════════════════════════════════════════════════════
// ── PRNG 工具函数 ──
// ════════════════════════════════════════════════════

/**
 * 创建种子伪随机数生成器 (Lehmer/Park-Miller LCG)
 * @param seed 种子值
 * @returns 返回 () => [0, 1) 的伪随机函数
 */
function createPRNG(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ════════════════════════════════════════════════════
// ── URL 安全校验 ──
// ════════════════════════════════════════════════════

/** 允许的纹理 URL 协议 */
const ALLOWED_URL_PROTOCOLS = ['https:', 'http:', 'data:']

/**
 * 校验纹理 URL 安全性
 * 防止非预期协议的 URL 被传入 TextureLoader
 */
function validateTextureUrl(url: string): void {
  try {
    // 相对路径（以 / 开头或无协议）视为安全（同源资源）
    if (url.startsWith('/') || url.startsWith('./') || (!url.includes('://') && !url.startsWith('data:'))) {
      return
    }
    const parsed = new URL(url)
    if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error(`不安全的纹理 URL 协议: ${parsed.protocol}`)
    }
  } catch (e) {
    if (e instanceof TypeError) {
      // URL 解析失败 — 可能是相对路径，放行
      return
    }
    throw e
  }
}

// ════════════════════════════════════════════════════
// ── 默认程序化纹理生成器（保留原有逻辑） ──
// ════════════════════════════════════════════════════

/** 生成工厂地面纹理：混凝土路面 + 车道标线 */
function createProceduralGround(seed = 42): THREE.CanvasTexture {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = createPRNG(seed)

  ctx.fillStyle = '#2a2f38'
  ctx.fillRect(0, 0, size, size)

  const imageData = ctx.getImageData(0, 0, size, size)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rand() - 0.5) * 18
    data[i] = Math.min(255, Math.max(0, data[i] + noise))
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise))
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise))
  }
  ctx.putImageData(imageData, 0, 0)

  ctx.strokeStyle = 'rgba(255, 200, 50, 0.25)'
  ctx.lineWidth = 3
  ctx.setLineDash([30, 20])
  for (let y = size * 0.25; y < size; y += size * 0.25) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke()
  }
  ctx.setLineDash([])

  ctx.strokeStyle = 'rgba(255, 200, 50, 0.15)'
  ctx.lineWidth = 2
  ctx.setLineDash([25, 18])
  for (let x = size * 0.2; x < size; x += size * 0.2) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke()
  }
  ctx.setLineDash([])

  ctx.strokeStyle = 'rgba(180, 200, 220, 0.18)'
  ctx.lineWidth = 2
  const parkingStart = size * 0.6
  for (let x = size * 0.55; x < size * 0.9; x += 48) {
    ctx.strokeRect(x, parkingStart, 40, 80)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 3)
  return tex
}

/** 生成建筑墙体纹理 */
function createProceduralBuildingWall(baseColor: string, seed = 42): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = createPRNG(seed)

  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, size, size)

  const imageData = ctx.getImageData(0, 0, size, size)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rand() - 0.5) * 12
    data[i] = Math.min(255, Math.max(0, data[i] + noise))
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise))
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise))
  }
  ctx.putImageData(imageData, 0, 0)

  const winW = 36, winH = 28, gapX = 52, gapY = 44
  for (let y = 20; y < size - 20; y += gapY) {
    for (let x = 16; x < size - 20; x += gapX) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.fillRect(x - 1, y - 1, winW + 2, winH + 2)
      const brightness = rand() > 0.3 ? 0.35 : 0.15
      ctx.fillStyle = `rgba(120, 180, 255, ${brightness})`
      ctx.fillRect(x, y, winW, winH)
    }
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'
  ctx.lineWidth = 1
  for (let y = 0; y < size; y += gapY - 2) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** 生成屋顶纹理 */
function createProceduralRoof(baseColor: string, seed = 42): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = createPRNG(seed)

  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
  ctx.lineWidth = 2
  for (let i = 0; i < size; i += 20) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 40, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - 40, size); ctx.stroke()
  }

  ctx.fillStyle = 'rgba(60, 70, 80, 0.5)'
  for (let i = 0; i < 5; i++) {
    const rx = rand() * (size - 20)
    const ry = rand() * (size - 20)
    ctx.fillRect(rx, ry, 12 + rand() * 8, 8 + rand() * 6)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

// ════════════════════════════════════════════════════
// ── Composable: useTextureManager ──
// ════════════════════════════════════════════════════

export function useTextureManager() {
  /** 实例级纹理加载器（延迟初始化，避免 SSR 时执行） */
  let textureLoader: THREE.TextureLoader | null = null

  /** 实例级纹理缓存 */
  const textureCache = new Map<string, THREE.Texture>()

  /** 获取或创建 TextureLoader（延迟初始化） */
  function getLoader(): THREE.TextureLoader {
    if (!textureLoader) {
      textureLoader = new THREE.TextureLoader()
    }
    return textureLoader
  }

  /** 当前激活的场景纹理配置 */
  const activeConfig: Ref<SceneTextureConfig | null> = ref(null)

  /** 已加载的纹理映射 (textureId -> THREE.Texture) */
  const loadedTextures: ShallowRef<Map<string, THREE.Texture>> = shallowRef(new Map())

  /** 加载状态 */
  const loading = ref(false)
  const error: Ref<string | null> = ref(null)

  /** 加载图片纹理（带缓存） */
  function loadImageTexture(url: string, repeat?: [number, number]): Promise<THREE.Texture> {
    validateTextureUrl(url)

    const cacheKey = `${url}_${repeat?.join(',') || 'default'}`
    if (textureCache.has(cacheKey)) {
      return Promise.resolve(textureCache.get(cacheKey)!)
    }

    return new Promise((resolve, reject) => {
      getLoader().load(
        url,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          if (repeat) {
            texture.repeat.set(repeat[0], repeat[1])
          }
          texture.colorSpace = THREE.SRGBColorSpace
          textureCache.set(cacheKey, texture)
          resolve(texture)
        },
        undefined,
        (err) => reject(new Error(`纹理加载失败: ${url} - ${err}`))
      )
    })
  }

  /**
   * 根据 TextureConfig 生成/加载纹理
   */
  async function resolveTexture(config: TextureConfig): Promise<THREE.Texture> {
    switch (config.source) {
      case 'procedural': {
        const seed = config.seed ?? 42
        switch (config.type) {
          case 'ground':
            return createProceduralGround(seed)
          case 'buildingWall':
            return createProceduralBuildingWall(config.description || '#4488cc', seed)
          case 'roof':
            return createProceduralRoof(config.description || '#4488cc', seed)
          default:
            return createProceduralGround(seed)
        }
      }
      case 'local_asset':
      case 'public_resource':
      case 'client_uploaded':
      case 'remote_url': {
        if (!config.url) {
          throw new Error(`纹理 "${config.id}" 来源为 ${config.source} 但未提供 url`)
        }
        return loadImageTexture(config.url, config.repeat)
      }
      default:
        throw new Error(`未知纹理来源: ${config.source}`)
    }
  }

  /**
   * 应用完整的场景纹理配置
   * 加载所有纹理并返回映射
   */
  async function applyConfig(config: SceneTextureConfig): Promise<Map<string, THREE.Texture>> {
    loading.value = true
    error.value = null

    try {
      const textureMap = new Map<string, THREE.Texture>()

      // 并行加载所有纹理
      const loadPromises = config.textures.map(async (texConfig) => {
        try {
          const tex = await resolveTexture(texConfig)
          // 应用 UV 配置
          if (texConfig.repeat) tex.repeat.set(texConfig.repeat[0], texConfig.repeat[1])
          if (texConfig.offset) tex.offset.set(texConfig.offset[0], texConfig.offset[1])
          if (texConfig.rotation) tex.rotation = texConfig.rotation
          textureMap.set(texConfig.id, tex)
        } catch (e) {
          console.warn(`纹理加载失败，使用程序化降级: ${texConfig.id}`, e)
          // 降级到程序化纹理
          const fallback = await resolveTexture({
            ...texConfig,
            source: 'procedural' as TextureSource,
          })
          textureMap.set(texConfig.id, fallback)
        }
      })

      await Promise.all(loadPromises)

      loadedTextures.value = textureMap
      activeConfig.value = config
      return textureMap
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取指定 ID 的已加载纹理
   */
  function getTexture(textureId: string): THREE.Texture | undefined {
    return loadedTextures.value.get(textureId)
  }

  /**
   * 根据建筑名称获取对应的纹理集
   */
  function getBuildingTextureSet(buildingName: string) {
    if (!activeConfig.value) return null
    return activeConfig.value.buildingTextures.find(bt => bt.buildingName === buildingName)
  }

  /**
   * 构建场景光照（根据配置）
   */
  function buildLighting(config: SceneTextureConfig, scene: THREE.Scene): void {
    const { lighting } = config

    // 环境光
    const ambient = new THREE.AmbientLight(
      new THREE.Color(lighting.ambientColor),
      lighting.ambientIntensity
    )
    scene.add(ambient)

    // 半球光
    const hemiLight = new THREE.HemisphereLight(
      new THREE.Color(lighting.hemisphereSkyColor),
      new THREE.Color(lighting.hemisphereGroundColor),
      lighting.hemisphereIntensity
    )
    hemiLight.position.set(0, 50, 0)
    scene.add(hemiLight)

    // 主方向光
    const dirLight = new THREE.DirectionalLight(
      new THREE.Color(lighting.directionalColor),
      lighting.directionalIntensity
    )
    dirLight.position.set(...lighting.directionalPosition)
    if (lighting.castShadow) {
      dirLight.castShadow = true
      dirLight.shadow.mapSize.set(2048, 2048)
      dirLight.shadow.camera.left = -70
      dirLight.shadow.camera.right = 70
      dirLight.shadow.camera.top = 70
      dirLight.shadow.camera.bottom = -70
      dirLight.shadow.camera.near = 0.5
      dirLight.shadow.camera.far = 200
      dirLight.shadow.bias = -0.0005
    }
    scene.add(dirLight)

    // 补光
    const fillLight = new THREE.DirectionalLight(
      new THREE.Color(lighting.fillColor),
      lighting.fillIntensity
    )
    fillLight.position.set(...lighting.fillPosition)
    scene.add(fillLight)

    // 点光源
    const pointLight = new THREE.PointLight(
      new THREE.Color(lighting.pointColor),
      lighting.pointIntensity,
      120
    )
    pointLight.position.set(...lighting.pointPosition)
    scene.add(pointLight)
  }

  /**
   * 应用色调映射配置到渲染器
   */
  function applyToneMapping(config: SceneTextureConfig, renderer: THREE.WebGLRenderer): void {
    const { toneMapping } = config
    const mappingMap: Record<string, THREE.ToneMapping> = {
      'None': THREE.NoToneMapping,
      'Linear': THREE.LinearToneMapping,
      'Reinhard': THREE.ReinhardToneMapping,
      'Cineon': THREE.CineonToneMapping,
      'ACESFilmic': THREE.ACESFilmicToneMapping,
    }
    renderer.toneMapping = mappingMap[toneMapping.mode] ?? THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = toneMapping.exposure
  }

  /**
   * 应用雾效配置到场景
   */
  function applyFog(config: SceneTextureConfig, scene: THREE.Scene): void {
    const { fog } = config
    switch (fog.type) {
      case 'exp2':
        scene.fog = new THREE.FogExp2(new THREE.Color(fog.color), fog.density ?? 0.005)
        break
      case 'linear':
        scene.fog = new THREE.Fog(new THREE.Color(fog.color), fog.near ?? 50, fog.far ?? 200)
        break
      case 'none':
      default:
        scene.fog = null
        break
    }
  }

  /**
   * 清理资源（释放 GPU 内存 + 清空缓存）
   */
  function dispose() {
    loadedTextures.value.forEach(tex => tex.dispose())
    loadedTextures.value = new Map()
    textureCache.forEach(tex => tex.dispose())
    textureCache.clear()
    textureLoader = null
    activeConfig.value = null
  }

  return {
    activeConfig,
    loadedTextures,
    loading,
    error,
    applyConfig,
    getTexture,
    getBuildingTextureSet,
    buildLighting,
    applyToneMapping,
    applyFog,
    dispose,
    // 暴露程序化纹理生成器供外部直接使用
    createProceduralGround,
    createProceduralBuildingWall,
    createProceduralRoof,
  }
}
