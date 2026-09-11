/**
 * 华盾AI智能视频盒子 — 安保区域与位置 API
 * api/securityAreas.ts — [P1.3 2026-09-10 全量更名] 安保区域管理
 *   (原 api/deviceGroups.ts "设备分组"; 语义对标海康 iSC 区域树+通道分配到区域)
 *
 * 后端: 边缘盒 RestApiHandlers /api/v1/security-areas|devices/locations
 *       (linkage.db security_areas / device_locations 两表, SecurityAreaStore 单例;
 *        旧路径 /api/v1/devices/groups 保留别名 deprecated)。
 * 对标: 华为"分组即管理单位" / 海康 iSC"区域树+通道分配到区域" / 大华组织树。
 */

import { http, deviceHttp } from './http'
import type { ApiResponse } from '@/types/common'

/** 安保区域 (宇视三分法: 按位置 LOCATION / 按用途 PURPOSE / 自定义 CUSTOM) */
export interface SecurityArea {
  id: string
  name: string
  description: string
  area_type: 'LOCATION' | 'PURPOSE' | 'CUSTOM' | string
  /** 旧字段镜像 (后端双键输出, 部署窗口内旧前端兼容读) */
  group_type?: 'LOCATION' | 'PURPOSE' | 'CUSTOM' | string
  parent_id: string
  sort_order: number
  status: 'active' | 'archived' | string
  /** 设备级成员 (设备 ID 列表) */
  device_ids: string[]
  /** 通道级成员 (国标 20 位编码, 海康"通道分配到区域"语义) */
  channel_ids: string[]
  /** 快照展开 = channel_ids ∪ 各 device 的全部通道 (运行时匹配实际生效集合) */
  resolved_channel_ids: string[]
  /** 展开后实际覆盖设备数 (规则表单确认范围用) */
  device_count?: number
  /** 展开后实际覆盖通道数 */
  channel_count?: number
  created_at?: number
  updated_at?: number
}

/** 位置实体 (华为好望点位 / 海康区域: 独立于设备表的层级树) — 路径/语义不变 */
export interface DeviceLocation {
  id: string
  name: string
  parent_location_id: string
  description: string
  sort_order: number
  created_at?: number
  updated_at?: number
}

export interface SecurityAreaPatch {
  name?: string
  description?: string
  area_type?: string
  parent_id?: string
  sort_order?: number
  /** 'archived' = 归档不删数据 (华为语义); 'active' = 恢复 */
  status?: string
}

export const securityAreaApi = {
  // ── 安保区域 CRUD (新路径 SSOT: /api/v1/security-areas) ──
  /** 区域列表 (include_archived=true 含归档) */
  listAreas(params?: { include_archived?: boolean }) {
    return http.get<ApiResponse<{ items: SecurityArea[]; total: number }>>('/security-areas', { params })
  },
  getArea(id: string) {
    return http.get<ApiResponse<SecurityArea>>(`/security-areas/${id}`)
  },
  createArea(data: { name: string; area_type?: string; description?: string; parent_id?: string; sort_order?: number }) {
    return http.post<ApiResponse<SecurityArea>>('/security-areas', data)
  },
  updateArea(id: string, patch: SecurityAreaPatch) {
    return http.put<ApiResponse<SecurityArea>>(`/security-areas/${id}`, patch)
  },
  /** 删除区域 (子区域 parent_id 置空; 规则引用保留原值 — 老规则按旧语义工作) */
  deleteArea(id: string) {
    return http.delete<ApiResponse<{ deleted: string }>>(`/security-areas/${id}`)
  },
  /**
   * 成员绑定 (全量覆盖) — 通道级绑定不止设备层。
   * 后端自动重算 resolved 快照 (channel_ids ∪ 各 device 全部通道) 并返回最新区域。
   */
  setMembers(id: string, data: { device_ids: string[]; channel_ids: string[] }) {
    return http.put<ApiResponse<SecurityArea>>(`/security-areas/${id}/members`, data)
  },

  // ── 位置 CRUD (物理位置树, 楼层图绑定在用; 路径 /api/v1/devices/locations 不变) ──
  listLocations() {
    return deviceHttp.get<ApiResponse<{ items: DeviceLocation[]; total: number }>>('/locations')
  },
  getLocation(id: string) {
    return deviceHttp.get<ApiResponse<DeviceLocation>>(`/locations/${id}`)
  },
  createLocation(data: { name: string; parent_location_id?: string; description?: string; sort_order?: number }) {
    return deviceHttp.post<ApiResponse<DeviceLocation>>('/locations', data)
  },
  updateLocation(id: string, patch: Partial<Pick<DeviceLocation, 'name' | 'parent_location_id' | 'description' | 'sort_order'>>) {
    return deviceHttp.put<ApiResponse<DeviceLocation>>(`/locations/${id}`, patch)
  },
  deleteLocation(id: string) {
    return deviceHttp.delete<ApiResponse<{ deleted: string }>>(`/locations/${id}`)
  },
}
