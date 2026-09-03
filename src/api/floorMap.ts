/**
 * @file floorMap.ts
 * @brief [FLOOR-MAP 2026-09-03] 2D 室内定位平面图 REST API 客户端 (照 region.ts 范式)
 *
 * 后端端点 (box-sdk/src/core/RestApiHandlers.cpp [FLOOR-MAP] 路由块):
 *   GET    /api/v1/maps?scene_tag=
 *   POST   /api/v1/maps
 *   PUT    /api/v1/maps/:id
 *   DELETE /api/v1/maps/:id
 *   POST   /api/v1/maps/:id/image        base64 底图上传 {image_data, filename}
 *   GET    /api/v1/maps/:id/cameras
 *   POST   /api/v1/maps/:id/cameras      upsert 绑定 (后端算 channel_hash)
 *   DELETE /api/v1/maps/:id/cameras/:chId
 *   GET    /api/v1/maps/by-channel/:chId 弹窗反查 (主图在前 {map,binding} 对)
 *
 * 底图静态服务: GET /floormaps/{id}.{ext} (HttpServer 前缀拦截, 非 /api/v1)。
 * 上传走 JSON + base64 (后端无真 multipart — face upload L25779 同款模式)。
 */

import { http } from './http'
import type {
  CameraMapBinding,
  FloorMapDef,
  FloorMapWithCameras,
  MapChannelPair,
} from '@/types/floorMap'

export type FloorMapUpsertBody = Partial<Omit<FloorMapDef, 'id' | 'created_at' | 'updated_at' | 'image_path' | 'image_type' | 'width_px' | 'height_px'>> & {
  name: string
}

export type CameraBindingBody = {
  channel_id: string
  pos_x?: number
  pos_y?: number
  fov_yaw?: number
  fov_radius_m?: number
  is_primary?: boolean
}

export const floorMapApi = {
  /** 地图列表 (每项带 cameras 绑定数组) */
  async listMaps(sceneTag?: string): Promise<FloorMapWithCameras[]> {
    const res = await http.get<{ items: FloorMapWithCameras[]; total: number }>(
      '/maps',
      { params: sceneTag ? { scene_tag: sceneTag } : undefined }
    )
    const d = (res.data as any)?.data ?? res.data
    return Array.isArray(d?.items) ? d.items : []
  },

  async createMap(body: FloorMapUpsertBody): Promise<FloorMapDef> {
    const res = await http.post('/maps', body)
    return (res.data as any)?.data ?? res.data
  },

  async updateMap(id: number, body: Partial<FloorMapUpsertBody>): Promise<FloorMapDef> {
    const res = await http.put(`/maps/${id}`, body)
    return (res.data as any)?.data ?? res.data
  },

  async deleteMap(id: number): Promise<{ deleted: number }> {
    const res = await http.delete(`/maps/${id}`)
    return (res.data as any)?.data ?? res.data
  },

  /**
   * 底图上传 (JSON + base64 — 后端解码写 /data/shield/floor_maps/{id}.{ext},
   * 解析宽高回写)。File → dataURL 由调用方或此处内部完成。
   */
  async uploadImage(id: number, file: File): Promise<FloorMapDef> {
    const b64 = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(new Error('read file failed'))
      fr.readAsDataURL(file)
    })
    const res = await http.post(`/maps/${id}/image`, {
      image_data: b64,
      filename: file.name,
    }, { timeout: 120_000 })
    return (res.data as any)?.data ?? res.data
  },

  /** 底图静态 URL (HttpServer /floormaps/ 前缀拦截; 加时间戳防缓存) */
  getImageUrl(map: Pick<FloorMapDef, 'id' | 'image_path' | 'image_type' | 'updated_at'>): string {
    if (!map.image_path) return ''
    return `${map.image_path}?v=${map.updated_at || 0}`
  },

  /** 图内摄像头绑定列表 */
  async listBindings(mapId: number): Promise<CameraMapBinding[]> {
    const res = await http.get<{ items: CameraMapBinding[]; total: number }>(
      `/maps/${mapId}/cameras`
    )
    const d = (res.data as any)?.data ?? res.data
    return Array.isArray(d?.items) ? d.items : []
  },

  /** upsert 绑定 by (map_id, channel_id); channel_hash 由后端计算 */
  async upsertBinding(mapId: number, body: CameraBindingBody): Promise<CameraMapBinding> {
    const res = await http.post(`/maps/${mapId}/cameras`, body)
    return (res.data as any)?.data ?? res.data
  },

  async deleteBinding(mapId: number, channelId: string): Promise<{ deleted: string }> {
    const res = await http.delete(`/maps/${mapId}/cameras/${encodeURIComponent(channelId)}`)
    return (res.data as any)?.data ?? res.data
  },

  /** 弹窗反查: 通道 → 绑定地图列表 (主图在前) */
  async mapsByChannel(channelId: string): Promise<MapChannelPair[]> {
    const res = await http.get<{ items: MapChannelPair[]; total: number }>(
      `/maps/by-channel/${encodeURIComponent(channelId)}`
    )
    const d = (res.data as any)?.data ?? res.data
    return Array.isArray(d?.items) ? d.items : []
  },
}
