/**
 * @file floorMap.ts
 * @brief [FLOOR-MAP 2026-09-03] 2D 室内定位平面图类型定义
 *
 * 与 box-sdk/include/pipeline/FloorMapStore.h 一一对应 (snake_case 直传,
 * http 拦截器已移除全局 camel↔snake 转换 — [Fix 2026-06-23] 既有规范)。
 */

/** 平面图资产 (floor_maps 表) */
export interface FloorMapDef {
  id: number
  name: string
  /** 楼层标签: "F1" / "-1" / "厂区总平" */
  floor: string
  building: string
  /** 场景标签 (对齐 ScenePackDefs.h): school_campus / hotel_unattended / gas_station / factory_industrial / park_estate / video_perimeter */
  scene_tag: string
  /** 静态 URL: /floormaps/{id}.{svg|png|jpg} (HttpServer 拦截伺服) */
  image_path: string
  image_type: 'svg' | 'png' | 'jpg' | ''
  width_px: number
  height_px: number
  origin_x: number
  origin_y: number
  /** 每像素代表的米数 (比例尺), FOV 半径米→像素换算用 */
  scale_m_per_px: number
  created_at: number
  updated_at: number
}

/** 摄像头 ↔ 平面图 绑定 (camera_map_bindings 表) */
export interface CameraMapBinding {
  id: number
  map_id: number
  /** GB28181 完整通道编码 (34020..._ch0) */
  channel_id: string
  channel_hash: number
  /** 归一化 [0,1] */
  pos_x: number
  pos_y: number
  /** 朝向角 (deg, 0=向上, 顺时针) */
  fov_yaw: number
  fov_radius_m: number
  /** 主平面图 (弹窗默认渲染; 每通道至多一个) */
  is_primary: boolean
  created_at: number
  updated_at: number
}

/** 列表项: 地图 + 图内全部摄像头绑定 (GET /api/v1/maps) */
export interface FloorMapWithCameras extends FloorMapDef {
  cameras: CameraMapBinding[]
}

/** 弹窗反查项: {map, binding} 对 (GET /api/v1/maps/by-channel/:chId, 主图在前) */
export interface MapChannelPair {
  map: FloorMapDef
  binding: CameraMapBinding
}

/** 场景标签选项 (对齐后端 ScenePackDefs.h 场景 id) */
export const FLOOR_MAP_SCENES: { value: string; label: string }[] = [
  { value: 'school_campus', label: '校园' },
  { value: 'hotel_unattended', label: '酒店' },
  { value: 'gas_station', label: '加油站' },
  { value: 'factory_industrial', label: '工厂' },
  { value: 'park_estate', label: '园区' },
  { value: 'video_perimeter', label: '周界' },
]

export function sceneTagLabel(tag: string): string {
  return FLOOR_MAP_SCENES.find((s) => s.value === tag)?.label || tag || '-'
}
