/**
 * 华盾AI智能视频盒子 v7.0 - 3D 模型加载器
 * components/ThreeDRenderer/ModelLoader.ts
 *
 * @description 负责根据 modelConfigs.json 配置创建 Three.js 几何体、材质和网格对象。
 *              提供统一的工厂方法，对外暴露类型安全的创建接口。
 */

import * as THREE from 'three'
import type {
  SceneConfig,
  CameraConfig,
  RendererConfig,
  LightingConfig,
  WallConfig,
  MaterialConfig,
  BuildingModelConfig,
  DeviceModelConfig,
} from './SceneBuilder'

// ════════════════════════════════════════════════════
// ── 类型导出（供外部使用） ──
// ════════════════════════════════════════════════════

/** 已加载的3D模型资源 */
export interface LoadedModelResult {
  mesh: THREE.Mesh
  dispose: () => void
}

/** 已加载的建筑模型 */
export interface BuildingModelResult extends LoadedModelResult {
  edges: THREE.LineSegments
  label: THREE.Object3D | null
}

/** 已加载的设备模型 */
export interface DeviceModelResult {
  body: THREE.Mesh
  lens: THREE.Mesh
  cone: THREE.Mesh
  pulse?: THREE.Mesh
  label?: THREE.Object3D
  dispose: () => void
}

// ════════════════════════════════════════════════════
// ── 工具函数 ──
// ════════════════════════════════════════════════════

/** 解析 hex 颜色字符串为 Three.js Color 对象 */
export function parseHexColor(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  return parseInt(full, 16)
}

/** 获取状态对应的颜色值 */
export function getStatusColor(status: string, statusColors: Record<string, string>): number {
  const hex = statusColors[status] ?? statusColors['online'] ?? '#0F9D58'
  return parseHexColor(hex)
}

// ════════════════════════════════════════════════════
// ── ModelLoader 核心类 ──
// ════════════════════════════════════════════════════

export class ModelLoader {
  private materialConfig: MaterialConfig
  private statusColors: Record<string, string>
  private deviceDefaults: DeviceModelConfig

  constructor(
    materialConfig: MaterialConfig,
    statusColors: Record<string, string>,
    deviceDefaults: DeviceModelConfig,
  ) {
    this.materialConfig = materialConfig
    this.statusColors = statusColors
    this.deviceDefaults = deviceDefaults
  }

  // ── 场景初始化 ──

  /** 创建地面网格 */
  createGround(sceneConfig: SceneConfig): THREE.Mesh {
    const { ground } = sceneConfig
    const geo = new THREE.PlaneGeometry(ground.width, ground.height)
    const mat = new THREE.MeshStandardMaterial({
      color: parseHexColor(ground.color),
      roughness: ground.roughness,
      metalness: ground.metalness,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.receiveShadow = true
    return mesh
  }

  /** 创建网格辅助线 */
  createGrid(sceneConfig: SceneConfig): THREE.GridHelper {
    const { grid } = sceneConfig
    return new THREE.GridHelper(
      grid.size,
      grid.divisions,
      parseHexColor(grid.color1),
      parseHexColor(grid.color2),
    )
  }

  /** 创建场景雾效 */
  createFog(sceneConfig: SceneConfig): THREE.FogExp2 {
    return new THREE.FogExp2(
      parseHexColor(sceneConfig.fog.color),
      sceneConfig.fog.density,
    )
  }

  // ── 灯光 ──

  /** 创建环境光 */
  createAmbientLight(config: LightingConfig): THREE.AmbientLight {
    return new THREE.AmbientLight(
      parseHexColor(config.ambient.color),
      config.ambient.intensity,
    )
  }

  /** 创建方向光（带阴影） */
  createDirectionalLight(config: LightingConfig): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(
      parseHexColor(config.directional.color),
      config.directional.intensity,
    )
    light.position.set(...config.directional.position)
    light.castShadow = config.directional.castShadow
    light.shadow.mapSize.set(config.directional.shadowMapSize, config.directional.shadowMapSize)
    const sc = config.directional.shadowCamera
    light.shadow.camera.left = sc.left
    light.shadow.camera.right = sc.right
    light.shadow.camera.top = sc.top
    light.shadow.camera.bottom = sc.bottom
    return light
  }

  /** 创建点光源 */
  createPointLight(config: LightingConfig): THREE.PointLight {
    const light = new THREE.PointLight(
      parseHexColor(config.point.color),
      config.point.intensity,
      config.point.distance,
    )
    light.position.set(...config.point.position)
    return light
  }

  // ── 围墙 ──

  /** 创建单段围墙 */
  createWall(wall: WallConfig, wallColor: number, edgeColor: number): LoadedModelResult {
    const geo = new THREE.BoxGeometry(wall.width, wall.height, wall.depth)
    const mat = new THREE.MeshStandardMaterial({
      color: wallColor,
      transparent: true,
      opacity: this.materialConfig.building.opacity,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(wall.x, wall.y + wall.height / 2, wall.z)
    mesh.castShadow = true

    const edges = new THREE.EdgesGeometry(geo)
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: this.materialConfig.building.edgeOpacity * 0.5,
      }),
    )
    line.position.copy(mesh.position)

    // 将边缘线作为子对象附加到 mesh（便于统一管理）
    mesh.add(line)

    return {
      mesh,
      dispose: () => {
        geo.dispose()
        mat.dispose()
        edges.dispose()
        ;(line.material as THREE.Material).dispose()
      },
    }
  }

  // ── 建筑 ──

  /** 创建建筑模型（含边缘线） */
  createBuilding(b: BuildingModelConfig): BuildingModelResult {
    const color = parseHexColor(b.color)
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d)
    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: this.materialConfig.building.opacity,
      roughness: this.materialConfig.building.roughness,
      metalness: this.materialConfig.building.metalness,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(b.x, b.h / 2, b.z)
    mesh.castShadow = true
    mesh.receiveShadow = true

    // 边缘线
    const edgesGeo = new THREE.EdgesGeometry(geo)
    const line = new THREE.LineSegments(
      edgesGeo,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: this.materialConfig.building.edgeOpacity,
      }),
    )
    line.position.copy(mesh.position)

    return {
      mesh,
      edges: line,
      label: null,
      dispose: () => {
        geo.dispose()
        mat.dispose()
        edgesGeo.dispose()
        ;(line.material as THREE.Material).dispose()
      },
    }
  }

  // ── 设备（摄像头） ──

  /** 创建设备模型（摄像头主体 + 镜头 + FOV 视锥 + 告警脉冲） */
  createDevice(d: {
    id: string
    name: string
    x: number; y: number; z: number
    status: string
    fov?: number
    rotation?: number
  }): DeviceModelResult {
    const color = getStatusColor(d.status, this.statusColors)
    const defaults = this.deviceDefaults
    const fov = d.fov ?? defaults.fov
    const viewDist = defaults.viewDistance
    const bodyRadius = defaults.bodyRadius
    const bodyHeight = defaults.bodyHeight
    const lensRadius = defaults.lensRadius

    // 摄像头主体（圆柱）
    const bodyGeo = new THREE.CylinderGeometry(bodyRadius, bodyRadius + 0.1, bodyHeight, 8)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: parseHexColor(this.materialConfig.deviceBody.color),
      roughness: this.materialConfig.deviceBody.roughness,
      metalness: this.materialConfig.deviceBody.metalness,
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.set(d.x, d.y, d.z)
    body.castShadow = true

    // 镜头（小球，发光）
    const lensGeo = new THREE.SphereGeometry(lensRadius, 12, 12)
    const lensMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: this.materialConfig.deviceLens.emissiveIntensity,
      roughness: this.materialConfig.deviceLens.roughness,
    })
    const lens = new THREE.Mesh(lensGeo, lensMat)
    lens.position.set(d.x, d.y + 0.8, d.z)

    // FOV 视锥
    const angle = (fov * Math.PI) / 360
    const coneGeo = new THREE.ConeGeometry(
      Math.tan(angle) * viewDist,
      viewDist,
      16,
      1,
      true,
    )
    const coneMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: this.materialConfig.fovCone.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const cone = new THREE.Mesh(coneGeo, coneMat)
    cone.position.set(d.x, d.y + 0.5, d.z)
    const rot = d.rotation ?? 0
    cone.rotation.x = Math.PI / 2
    cone.rotation.z = rot
    cone.translateY(-viewDist / 2)

    // 告警脉冲球
    let pulse: THREE.Mesh | undefined
    if (d.status === 'alarm') {
      const pulseGeo = new THREE.SphereGeometry(
        this.materialConfig.alarmPulse.radius,
        this.materialConfig.alarmPulse.segments,
        this.materialConfig.alarmPulse.segments,
      )
      const pulseMat = new THREE.MeshBasicMaterial({
        color: parseHexColor(this.materialConfig.alarmPulse.color),
        transparent: true,
        opacity: this.materialConfig.alarmPulse.opacity,
        depthWrite: false,
      })
      pulse = new THREE.Mesh(pulseGeo, pulseMat)
      pulse.position.set(d.x, d.y + 1, d.z)
    }

    return {
      body,
      lens,
      cone,
      pulse,
      dispose: () => {
        bodyGeo.dispose(); bodyMat.dispose()
        lensGeo.dispose(); lensMat.dispose()
        coneGeo.dispose(); coneMat.dispose()
        if (pulse) {
          pulse.geometry.dispose()
          ;(pulse.material as THREE.Material).dispose()
        }
      },
    }
  }

  // ── 相机 ──

  /** 创建透视相机 */
  createCamera(config: CameraConfig, aspect: number): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(config.fov, aspect, config.near, config.far)
    camera.position.set(...config.defaultPosition)
    camera.lookAt(...config.defaultTarget)
    return camera
  }

  // ── WebGL 渲染器 ──

  /** 创建 WebGL 渲染器 */
  createRenderer(config: RendererConfig, width: number, height: number): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
      antialias: config.antialias,
      alpha: config.alpha,
    })
    renderer.setSize(Math.max(width, 1), Math.max(height, 1))
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.pixelRatioCap))
    renderer.shadowMap.enabled = config.shadowMap.enabled
    renderer.shadowMap.type = THREE.PCFShadowMap
    return renderer
  }

  // ── 批量资源释放 ──

  /** 递归释放场景中所有 GPU 资源 */
  static disposeSceneResources(scene: THREE.Scene): void {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose()
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach(m => {
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
}
