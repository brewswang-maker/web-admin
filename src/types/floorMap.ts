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

/** [P0-1 2026-09-04 设备绑定通用化] 平面图设备类型 (与 RestApiHandlers validDeviceType / init_box.sql CHECK 同枚举)
 *  camera=GB28181 通道 (存量); 其余为多模态传感器 — 对标 NVIDIA Metropolis / 海康 iSecure 全量子系统上图 */
export type FloorMapDeviceType =
  | 'camera'
  | 'access'      // 门禁
  | 'smoke'       // 烟感
  | 'radar'       // 雷达
  | 'sos'         // 紧急按钮
  | 'broadcast'   // 广播
  | 'rfid'        // RFID
  | 'environment' // 温湿度

export const FLOOR_MAP_DEVICE_TYPES: { value: FloorMapDeviceType; label: string }[] = [
  { value: 'camera', label: '摄像头' },
  { value: 'access', label: '门禁' },
  { value: 'smoke', label: '烟感' },
  { value: 'radar', label: '雷达' },
  { value: 'sos', label: '紧急按钮' },
  { value: 'broadcast', label: '广播' },
  { value: 'rfid', label: 'RFID' },
  { value: 'environment', label: '温湿度' },
]

export function deviceTypeLabel(t: string): string {
  return FLOOR_MAP_DEVICE_TYPES.find((d) => d.value === t)?.label || t || '摄像头'
}

/** [P0-1] 分类型图标元数据 (24×24 viewBox 白色前景; 底色分类型 — 海康 iSecure
 *  全量子系统分图标 / NVIDIA Metropolis 多模态传感器上图对标)
 *  FloorMapCanvas 渲染层与 FloorMapView 添加工具箱共用 (SSOT) */
export const DEVICE_ICON_META: Record<string, { path: string; color: string }> = {
  camera: {   // 摄像机 — 枪机外形 + 镜头点 (存量形状保留)
    path: 'M8 9.5 16.5 7v7L8 12.5z M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z',
    color: '#3294ED',
  },
  access: {   // 门禁 — 门框 + 把手
    path: 'M6.2 20V5.6A1.6 1.6 0 0 1 7.8 4h8.4a1.6 1.6 0 0 1 1.6 1.6V20h-2.1V6.1H8.3V20z M13.1 10.9a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z',
    color: '#22C55E',
  },
  smoke: {    // 烟感 — 双波纹弧 + 感烟点
    path: 'M12 6.6a7.4 7.4 0 0 1 7.4 7.4h-2A5.4 5.4 0 0 0 6.6 14h-2A7.4 7.4 0 0 1 12 6.6z M12 10.4a3.6 3.6 0 0 1 3.6 3.6h-2a1.6 1.6 0 0 0-3.2 0h-2a3.6 3.6 0 0 1 3.6-3.6z M12 12.8a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z',
    color: '#F59E0B',
  },
  radar: {    // 雷达 — 扫描扇形 + 中心点
    path: 'M12 12 L12 3.4 A8.6 8.6 0 0 1 18.8 7.2 Z M12 14.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z',
    color: '#A78BFA',
  },
  sos: {      // 紧急按钮 — 感叹号
    path: 'M10.6 4.6h2.8v9.2h-2.8z M10.6 16.2h2.8v2.8h-2.8z',
    color: '#F93A55',
  },
  broadcast: {  // 广播 — 喇叭 + 声波
    path: 'M6.4 9.6h3.4l4.4-3.4v11.6l-4.4-3.4H6.4z M16.6 8.4a5 5 0 0 1 0 7.2l-1.3-1.4a3.1 3.1 0 0 0 0-4.4z',
    color: '#06B6D4',
  },
  rfid: {     // RFID — 左下角波纹弧
    path: 'M6 7.2A9.8 9.8 0 0 1 15.8 17h-2.5A7.3 7.3 0 0 0 6 9.7z M6 11.3A5.7 5.7 0 0 1 11.7 17H9.5A3.5 3.5 0 0 0 6 13.5z M7.2 15a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z',
    color: '#EC4899',
  },
  environment: {  // 温湿度 — 温度计
    path: 'M10.9 5.3a1.7 1.7 0 0 1 3.4 0v7.1a3.5 3.5 0 1 1-3.4 0z M11.8 13.4V5.7h1.6v7.7a2.3 2.3 0 1 1-1.6 0z',
    color: '#84CC16',
  },
}

export function deviceIconMeta(t?: string) {
  return DEVICE_ICON_META[t || 'camera'] || DEVICE_ICON_META.camera
}

/** 摄像头 ↔ 平面图 绑定 (camera_map_bindings 表)
 *  [P0-1] channel_id 语义泛化为「设备引用 ID」: camera=GB28181 通道, 其他=自定义设备编号 */
export interface CameraMapBinding {
  id: number
  map_id: number
  /** 设备引用 ID (camera=GB28181 完整通道编码 34020..._ch0; 其他=自定义编号) */
  channel_id: string
  channel_hash: number
  /** 归一化 [0,1] */
  pos_x: number
  pos_y: number
  /** 朝向角 (deg, 0=向上, 顺时针); 仅 camera 渲染扇形, 其他类型后端强制归零 */
  fov_yaw: number
  fov_radius_m: number
  /** 主平面图 (弹窗默认渲染; 每设备至多一个) */
  is_primary: boolean
  /** [P0-1] 设备类型 (存量行为 camera) */
  device_type: FloorMapDeviceType
  /** [P0-1] 非摄像头设备显示名 (摄像头走通道名动态解析) */
  label: string
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
