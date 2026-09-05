/**
 * @file useFloorMap.ts
 * @brief [FLOOR-MAP 2026-09-03] 平面图共享 composable — 三层联动的消费侧数据底座
 *
 * 职责 (复用优先, 单例缓存):
 *   1. 地图列表缓存 (TTL 30s, findMatchingRule 缓存同款模式) —
 *      FloorMapView / LinkageRuleView 编辑抽屉共用, 避免双拉
 *   2. channelId → 绑定反查 (AlarmPopup 地图 Tab; 空结果负缓存 10s 防穿透)
 *   3. 告警落点近似投影: bbox 画面归一化 x → FOV 扇形角度偏移 (无标定简化方案)
 *      — 文案注明 "近似定位"; 有标定数据后可替换为单应变换
 *
 * bbox 来源: alarm.metadata.bbox = [x1, y1, x2, y2] (画面归一化 0-1),
 *   兜底 alarm.metadata.box / metadata_json 同字段。
 */

import { ref } from 'vue'
import { floorMapApi } from '@/api/floorMap'
import type { CameraMapBinding, FloorMapWithCameras, MapChannelPair } from '@/types/floorMap'

const LIST_TTL_MS = 30_000
const BY_CH_NEG_TTL_MS = 10_000   // 空结果负缓存: 未绑定通道每次弹窗不重复打反查

// ── 模块级单例状态 (多组件共享; composable 只做引用) ──
const maps = ref<FloorMapWithCameras[]>([])
const mapsLoading = ref(false)
const mapsLoadedAt = ref(0)

const byChannelCache = new Map<string, { pairs: MapChannelPair[]; at: number }>()

/** 拉取地图列表 (TTL 内直接吃缓存; force=true 强刷) */
async function loadMaps(force = false): Promise<FloorMapWithCameras[]> {
  if (!force && mapsLoadedAt.value && Date.now() - mapsLoadedAt.value < LIST_TTL_MS) {
    return maps.value
  }
  if (mapsLoading.value) return maps.value
  mapsLoading.value = true
  try {
    maps.value = await floorMapApi.listMaps()
    mapsLoadedAt.value = Date.now()
  } catch (e) {
    console.warn('[useFloorMap] loadMaps failed:', e)
  } finally {
    mapsLoading.value = false
  }
  return maps.value
}

/** 失效缓存 (CRUD 后调用) */
function invalidateMaps() {
  mapsLoadedAt.value = 0
  byChannelCache.clear()
}

/**
 * [FIX 2026-09-05 平面图未关联] GB 双流通道形态变体: 原样 / 去 _chN 后缀 / 主流 _ch0 后缀。
 * 绑定库存通道表形态 (..._ch0), 告警 REST/WS 的 channel_id 是裸 20 位 — 互为异构,
 * 后端 getBindingsByChannel 精确字符串匹配 (FloorMapStore.cpp L386) → 裸形态反查恒空
 * → 弹窗 map Tab 退 GPS 占位。与联动规则 safeChannelHash 双形态同构 (useAlarmPopup)。
 */
export function channelIdVariants(ch: string): string[] {
  if (!ch) return []
  const base = ch.replace(/_ch\d+$/, '')
  const out = [ch]
  if (base && base !== ch) out.push(base)
  if (base && !/_ch\d+$/.test(ch)) out.push(base + '_ch0')
  return [...new Set(out)]
}

/** 通道 → 绑定地图对 (主图在前; 未绑定返回 [])
 *  [FIX 2026-09-05] GB 双流形态兼容: 原样查空后依次试变体, 任一命中即返回;
 *  各形态分别写缓存 (负缓存 10s 口径不变), 避免同告警重复串行请求。 */
async function mapsByChannel(channelId: string, force = false): Promise<MapChannelPair[]> {
  if (!channelId) return []
  const hit = byChannelCache.get(channelId)
  const ttl = hit && hit.pairs.length > 0 ? LIST_TTL_MS : BY_CH_NEG_TTL_MS
  if (!force && hit && Date.now() - hit.at < ttl) return hit.pairs
  let pairs: MapChannelPair[] = []
  try {
    for (const id of channelIdVariants(channelId)) {
      pairs = await floorMapApi.mapsByChannel(id)
      byChannelCache.set(id, { pairs, at: Date.now() })
      if (pairs.length) break
    }
  } catch (e) {
    console.warn('[useFloorMap] mapsByChannel failed:', e)
    return hit?.pairs ?? []
  }
  byChannelCache.set(channelId, { pairs, at: Date.now() })
  return pairs
}

/** map_id → 该图绑定列表 (吃 listMaps 缓存里的 cameras) */
function bindingsOfMap(mapId: number): CameraMapBinding[] {
  return maps.value.find((m) => m.id === mapId)?.cameras ?? []
}

/** map_id → 地图定义 (缓存查询) */
function mapById(mapId: number): FloorMapWithCameras | undefined {
  return maps.value.find((m) => m.id === mapId)
}

// ── 告警落点近似投影 (bbox → 平面图坐标) ──

export interface AlarmMapPoint {
  /** 归一化 [0,1] 平面图坐标 */
  x: number
  y: number
  /** 命中的绑定 (投影基准) */
  binding: CameraMapBinding
}

/**
 * 从告警 metadata 提取 bbox (画面归一化 [x1,y1,x2,y2], 0-1)
 */
function extractBbox(metadata: Record<string, unknown> | undefined): [number, number, number, number] | null {
  if (!metadata) return null
  for (const key of ['bbox', 'box', 'target_bbox']) {
    const v = metadata[key]
    if (Array.isArray(v) && v.length >= 4 && v.every((n) => typeof n === 'number')) {
      return [v[0], v[1], v[2], v[3]] as [number, number, number, number]
    }
  }
  return null
}

/**
 * 告警落点近似投影 — bbox 画面归一化 x → FOV 扇形角度偏移:
 *   假设水平视场角 HFOV=90°, bbox 中心 x ∈ [0,1] 线性映射扇形偏移角 [-45°, +45°];
 *   距离取 bbox 中心 y 映射 [0.35, 1.0] × fov_radius_m (y 大 = 目标近 = 落点近摄像头)。
 *   最终: 落点 = 摄像头点 + 距离(米→归一化) × (sin θ, -cos θ)。
 * [FLOOR-MAP 2026-09-04] bbox 缺失兜底: 取画面中心 (0.5, 0.5) — 中轴 0.675×半径
 *   落点, 有告警即有涟漪 (极视角稳健性对标; 此前无 bbox 时涟漪不渲染)。
 * [无标定简化] 误差 ±半径 20%, 文案注明 "近似定位"。
 */
export function projectAlarmPoint(
  binding: CameraMapBinding,
  map: { width_px: number; height_px: number; scale_m_per_px: number },
  metadata: Record<string, unknown> | undefined
): AlarmMapPoint | null {
  if (!map.width_px || !map.height_px) return null
  const bbox = extractBbox(metadata)
  const cx = bbox ? (bbox[0] + bbox[2]) / 2 : 0.5
  const cy = bbox ? (bbox[1] + bbox[3]) / 2 : 0.5
  const HFOV = 90
  const yawOffset = (cx - 0.5) * HFOV                     // deg, 画面右 = 扇形右
  const angleDeg = binding.fov_yaw + yawOffset
  const distM = binding.fov_radius_m * (0.35 + 0.65 * (1 - Math.min(1, Math.max(0, cy))))
  const pxPerM = map.scale_m_per_px > 0 ? 1 / map.scale_m_per_px : 20
  const dxPx = Math.sin((angleDeg * Math.PI) / 180) * distM * pxPerM
  const dyPx = -Math.cos((angleDeg * Math.PI) / 180) * distM * pxPerM
  return {
    x: Math.min(1, Math.max(0, binding.pos_x + dxPx / map.width_px)),
    y: Math.min(1, Math.max(0, binding.pos_y + dyPx / map.height_px)),
    binding,
  }
}

/** FOV 半径 (米) → 归一化画布半径 (取宽向; 供 conic-gradient 扇形尺寸) */
export function fovRadiusNormalized(
  binding: Pick<CameraMapBinding, 'fov_radius_m'>,
  map: { width_px: number; scale_m_per_px: number }
): number {
  if (!map.width_px || map.scale_m_per_px <= 0) return 0.15
  return Math.min(0.5, (binding.fov_radius_m / map.scale_m_per_px) / map.width_px)
}

export function useFloorMap() {
  return {
    maps,
    mapsLoading,
    loadMaps,
    invalidateMaps,
    mapsByChannel,
    bindingsOfMap,
    mapById,
    projectAlarmPoint,
    fovRadiusNormalized,
  }
}
