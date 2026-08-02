/**
 * 华盾AI智能视频盒子 v7.0 - 3D 态势地图设备数据映射器
 * utils/sceneDeviceMapper.ts
 *
 * @description 将"设备管理"的真实设备数据规范化并映射为 3D 厂区态势地图可消费的节点。
 *
 * 数据链路与字段适配背景：
 *   - GET /api/v1/situation/map/devices   → 设备状态/告警/项目，坐标来自 DeviceInfo（未选点时为 0）
 *   - GET /api/v1/system/gb28181/devices  → 用户"地图选点"保存的坐标（持久化表，可能为字符串）
 *   两个端点的坐标来源不一致：地图选点写入 device_attributes，而态势地图读 DeviceInfo。
 *   因此前端需要合并：**用户选点坐标（gb28181）优先**，其次 DeviceInfo 坐标，最后周界布局兜底。
 *
 * 兜底策略：
 *   - 坐标无效（缺失 / 为 0,0 / 越界）的设备 → 沿厂区周界矩形均匀布局，避免全部重叠在中心。
 *   - 接口为空 / 请求失败 → 由调用方使用 DEMO_SCENE_DEVICES 演示数据并显式标注"演示数据"。
 */

// ════════════════════════════════════════════════════
// ── 类型定义 ──
// ════════════════════════════════════════════════════

/** 3D 场景设备状态（Scene3D 组件消费的视觉状态） */
export type SceneDeviceStatus = 'online' | 'offline' | 'alarm' | 'maintenance'

/** 3D 场景设备节点（Scene3D 组件直接消费） */
export interface SceneDevice3D {
  id: string
  name: string
  x: number
  y: number
  z: number
  status: SceneDeviceStatus
  /** 安装位置 / 所在区域（悬停展示） */
  location: string
  fov?: number
  rotation?: number
  /** 告警类型（告警设备高亮展示） */
  alarmType?: string
  /** 所属项目（悬停展示） */
  projectName?: string
  /** 设备业务 ID（点击跳转设备详情；演示数据无此字段） */
  businessId?: string
  /** 设备类型 */
  deviceType?: string
}

/**
 * 态势地图设备点位（后端原始形态，宽松类型以兼容字段差异）
 * - 后端实际返回 `type` 而非 `deviceType`，两者都兼容。
 * - 坐标可能为 number 或 string。
 */
export interface RawMapDevicePoint {
  id?: string
  name?: string
  lat?: number | string
  lng?: number | string
  status?: string
  type?: string
  deviceType?: string
  alarmCount?: number
  projectName?: string
  lastAlarmType?: string
  address?: string
  [key: string]: unknown
}

/** GB28181 设备位置（用户地图选点保存，坐标可能为字符串） */
export interface Gb28181DeviceLocation {
  deviceId: string
  longitude?: number | string
  latitude?: number | string
  address?: string
  /** 是否为用户通过地图选点设置 */
  userSetLocation: boolean
}

/** 规范化后的设备（合并坐标与状态，映射前的中间形态） */
export interface NormalizedDevice {
  id: string
  name: string
  lat: number | null
  lng: number | null
  status: SceneDeviceStatus
  deviceType: string
  alarmCount: number
  projectName: string
  lastAlarmType?: string
  address: string
  /** 坐标是否来自用户地图选点 */
  userSetLocation: boolean
}

// ════════════════════════════════════════════════════
// ── 坐标解析与校验 ──
// ════════════════════════════════════════════════════

/** 解析坐标值（兼容 number / string / null / undefined / 非法值） */
export function parseCoord(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * 判断坐标对是否有效。
 * 排除：缺失、(0,0)（DeviceInfo 默认值，表示未设置）、越界值。
 */
export function isValidCoord(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false
  if (lat === 0 && lng === 0) return false
  if (lat < -90 || lat > 90) return false
  if (lng < -180 || lng > 180) return false
  return true
}

// ════════════════════════════════════════════════════
// ── 规范化函数 ──
// ════════════════════════════════════════════════════

/** 后端设备状态 → 3D 场景视觉状态 */
export function normalizeStatus(status: string | undefined): SceneDeviceStatus {
  switch (status) {
    case 'online':
      return 'online'
    case 'offline':
      return 'offline'
    case 'alarming':
    case 'alarm':
      return 'alarm'
    case 'maintenance':
    case 'maintaining':
      return 'maintenance'
    default:
      return 'offline'
  }
}

/** 规范化态势地图设备点位（兼容 type/deviceType、string/number 坐标） */
export function normalizeMapDevicePoint(raw: RawMapDevicePoint): NormalizedDevice | null {
  const id = String(raw.id ?? '').trim()
  if (!id) return null
  return {
    id,
    name: String(raw.name ?? '') || id,
    lat: parseCoord(raw.lat),
    lng: parseCoord(raw.lng),
    status: normalizeStatus(raw.status),
    deviceType: String(raw.deviceType ?? raw.type ?? ''),
    alarmCount: typeof raw.alarmCount === 'number' ? raw.alarmCount : 0,
    projectName: String(raw.projectName ?? ''),
    lastAlarmType: raw.lastAlarmType ? String(raw.lastAlarmType) : undefined,
    address: String(raw.address ?? ''),
    userSetLocation: false,
  }
}

/** 规范化 GB28181 设备位置（坐标为字符串也能解析） */
export function normalizeGb28181Location(raw: Record<string, unknown>): Gb28181DeviceLocation | null {
  const deviceId = String(raw.deviceId ?? raw.device_id ?? '').trim()
  if (!deviceId) return null
  return {
    deviceId,
    longitude: raw.longitude as number | string | undefined,
    latitude: raw.latitude as number | string | undefined,
    address: String(raw.address ?? ''),
    userSetLocation: String(raw.user_set_location ?? raw.userSetLocation ?? '') === 'true',
  }
}

// ════════════════════════════════════════════════════
// ── 位置合并 ──
// ════════════════════════════════════════════════════

/**
 * 合并设备位置：用户地图选点坐标（gb28181 持久化表）优先于 DeviceInfo 坐标。
 * 修复"地图选点保存后态势地图不更新"的位置来源错位问题。
 */
export function mergeDeviceLocations(
  mapPoints: NormalizedDevice[],
  gbLocations: Gb28181DeviceLocation[],
): NormalizedDevice[] {
  const locMap = new Map<string, Gb28181DeviceLocation>()
  for (const loc of gbLocations) locMap.set(loc.deviceId, loc)

  return mapPoints.map(dev => {
    const loc = locMap.get(dev.id)
    if (!loc) return dev
    const gbLat = parseCoord(loc.latitude)
    const gbLng = parseCoord(loc.longitude)
    if (isValidCoord(gbLat, gbLng)) {
      return {
        ...dev,
        lat: gbLat,
        lng: gbLng,
        address: loc.address || dev.address,
        userSetLocation: loc.userSetLocation,
      }
    }
    return dev
  })
}

// ════════════════════════════════════════════════════
// ── 坐标映射 ──
// ════════════════════════════════════════════════════

/** 有坐标设备的 bounding box 归一化半径（场景坐标范围 [-SCALE, SCALE]） */
const SCALE = 38

/**
 * 周界矩形布局：为无坐标设备沿厂区周界均匀分配位置。
 * 矩形半宽 halfW=48、半深 halfD=42（位于围墙 ±55/±48 内侧）。
 */
export function perimeterPoint(index: number, total: number): { x: number; z: number } {
  const halfW = 48
  const halfD = 42
  if (total <= 0) return { x: 0, z: 0 }
  const top = 2 * halfW
  const right = 2 * halfD
  const bottom = 2 * halfW
  const perimeter = top + right + bottom + 2 * halfD
  // +0.5 偏移避免设备恰好落在角落
  let t = ((index + 0.5) / total) * perimeter
  if (t < top) return { x: -halfW + t, z: -halfD }
  t -= top
  if (t < right) return { x: halfW, z: -halfD + t }
  t -= right
  if (t < bottom) return { x: halfW - t, z: halfD }
  t -= bottom
  return { x: -halfW, z: halfD - t }
}

/** 将规范化设备转换为 3D 场景节点 */
function toSceneNode(dev: NormalizedDevice, x: number, z: number): SceneDevice3D {
  return {
    id: dev.id,
    name: dev.name,
    x,
    y: 4 + (dev.status === 'alarm' ? 1 : 0),
    z,
    status: dev.status,
    location: dev.address || dev.projectName || dev.name,
    fov: 65,
    rotation: 0,
    alarmType: dev.lastAlarmType,
    projectName: dev.projectName,
    businessId: dev.id,
    deviceType: dev.deviceType,
  }
}

/**
 * 将设备列表映射为 3D 场景节点。
 * - 有有效坐标的设备：bounding box 归一化到 [-SCALE, SCALE]。
 * - 无有效坐标的设备：沿周界矩形均匀布局（兜底，避免重叠在中心）。
 */
export function mapDevicesToScene(devices: NormalizedDevice[]): SceneDevice3D[] {
  if (!devices.length) return []

  const withCoords = devices.filter(d => isValidCoord(d.lat, d.lng))
  const withoutCoords = devices.filter(d => !isValidCoord(d.lat, d.lng))

  const positioned: Array<{ dev: NormalizedDevice; x: number; z: number }> = []

  if (withCoords.length) {
    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity
    for (const d of withCoords) {
      const lat = d.lat as number
      const lng = d.lng as number
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    }
    const latRange = maxLat - minLat || 1
    const lngRange = maxLng - minLng || 1
    for (const d of withCoords) {
      positioned.push({
        dev: d,
        x: (((d.lng as number) - minLng) / lngRange - 0.5) * 2 * SCALE,
        z: (((d.lat as number) - minLat) / latRange - 0.5) * 2 * SCALE,
      })
    }
  }

  withoutCoords.forEach((d, i) => {
    const { x, z } = perimeterPoint(i, withoutCoords.length)
    positioned.push({ dev: d, x, z })
  })

  return positioned.map(({ dev, x, z }) => toSceneNode(dev, x, z))
}

// ════════════════════════════════════════════════════
// ── 演示数据兜底 ──
// ════════════════════════════════════════════════════

// ════════════════════════════════════════════════════
// ── 手动放置位置合并（P0: 3D场景设备位置编辑） ──
// ════════════════════════════════════════════════════

/** 设备3D放置信息（后端 device_attributes scene_* 键的聚合） */
export interface DevicePlacement {
  deviceId: string
  sceneX?: number | string
  sceneY?: number | string
  sceneZ?: number | string
  rotation?: number | string
  fov?: number | string
  buildingId?: string
  manual?: boolean
}

/** 将后端返回的放置信息原始对象规范化为 DevicePlacement */
export function normalizePlacement(raw: Record<string, unknown>): DevicePlacement | null {
  const deviceId = String(raw.deviceId ?? raw.device_id ?? '').trim()
  if (!deviceId) return null
  const toVal = (v: unknown): string | number | undefined => {
    if (v == null) return undefined
    if (typeof v === 'number') return v
    return String(v)
  }
  return {
    deviceId,
    sceneX: toVal(raw.sceneX ?? raw.scene_x),
    sceneY: toVal(raw.sceneY ?? raw.scene_y),
    sceneZ: toVal(raw.sceneZ ?? raw.scene_z),
    rotation: toVal(raw.rotation ?? raw.scene_rotation),
    fov: toVal(raw.fov ?? raw.scene_fov),
    buildingId: raw.buildingId ? String(raw.buildingId) : (raw.scene_building ? String(raw.scene_building) : undefined),
    manual: String(raw.manual ?? raw.scene_manual ?? '') === 'true',
  }
}

/**
 * 将手动放置位置（device_attributes 中 scene_x/y/z）与自动映射结果合并。
 * 优先级链：手动拖拽位置 > GB28181坐标 > 周界兜底。
 * 手动位置优先级最高，一旦用户在3D场景中调整了设备位置，就以此为准。
 */
export function mergePlacements(
  autoMapped: SceneDevice3D[],
  placements: Map<string, DevicePlacement>,
): SceneDevice3D[] {
  return autoMapped.map(node => {
    const key = node.businessId ?? node.id
    const p = placements.get(key)
    if (!p) return node
    const sx = parseCoord(p.sceneX)
    const sy = parseCoord(p.sceneY)
    const sz = parseCoord(p.sceneZ)
    // 至少需要一个有效坐标才覆盖
    if (sx == null && sy == null && sz == null) return node
    return {
      ...node,
      x: sx ?? node.x,
      y: sy ?? node.y,
      z: sz ?? node.z,
      rotation: parseCoord(p.rotation) ?? node.rotation,
      fov: parseCoord(p.fov) ?? node.fov,
      // buildingId 附在 location 前缀展示
      location: p.buildingId
        ? `${p.buildingId} - ${node.location}`
        : node.location,
    }
  })
}

// ════════════════════════════════════════════════════
// ── 演示数据兜底 ──
// ════════════════════════════════════════════════════

/**
 * 演示设备数据（接口为空 / 请求失败时兜底）。
 * 注意：演示数据不含 businessId，点击不会跳转设备详情。
 * 调用方使用时应显式标注"演示数据"，避免误导。
 */
export const DEMO_SCENE_DEVICES: SceneDevice3D[] = [
  { id: 'demo-cam1', name: 'CAM_01 东门', x: -40, y: 4, z: -35, status: 'online', location: '1号厂区东门', fov: 60, rotation: 0 },
  { id: 'demo-cam2', name: 'CAM_02 围墙北', x: 20, y: 4, z: -38, status: 'online', location: '北围墙', fov: 75, rotation: Math.PI / 4 },
  { id: 'demo-cam3', name: 'CAM_03 车间A', x: -15, y: 5, z: 5, status: 'online', location: '2号车间入口', fov: 60, rotation: Math.PI / 2 },
  { id: 'demo-cam4', name: 'CAM_04 车间B', x: 25, y: 5, z: 10, status: 'alarm', location: '3号厂区东围墙', alarmType: '周界入侵', fov: 65, rotation: -Math.PI / 3 },
  { id: 'demo-cam5', name: 'CAM_05 仓库', x: -30, y: 4, z: 20, status: 'online', location: '仓库区域', fov: 70, rotation: Math.PI },
  { id: 'demo-cam6', name: 'CAM_06 停车场', x: 35, y: 4, z: 25, status: 'online', location: '停车场B区', fov: 80, rotation: Math.PI / 6 },
  { id: 'demo-cam7', name: 'CAM_07 大门', x: 0, y: 5, z: 40, status: 'online', location: '1号大门', fov: 60, rotation: Math.PI },
  { id: 'demo-cam8', name: 'CAM_08 办公楼', x: -35, y: 6, z: -10, status: 'maintenance', location: '办公楼', fov: 55, rotation: -Math.PI / 2 },
  { id: 'demo-cam9', name: 'CAM_09 配电房', x: 40, y: 4, z: -15, status: 'offline', location: '配电房', fov: 60, rotation: 0 },
  { id: 'demo-cam10', name: 'CAM_10 围墙南', x: -10, y: 4, z: 38, status: 'online', location: '南围墙', fov: 75, rotation: Math.PI },
]
