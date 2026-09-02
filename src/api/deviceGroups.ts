/**
 * 华盾AI智能视频盒子 — 设备分组与位置 API
 * api/deviceGroups.ts — [vp9 2026-09-01] 分组/位置独立实体管理 (对标 9 厂商)
 *
 * 后端: 边缘端 RestApiHandlers /api/v1/devices/groups|locations (linkage.db
 *       device_groups / device_locations 两表, DeviceGroupStore 单例)。
 * 对标: 华为"分组即管理单位" / 海康 iSC"区域树+通道分配到区域" / 大华组织树。
 */

import { deviceHttp } from './http'
import type { ApiResponse } from '@/types/common'

/** 设备分组 (宇视三分法: 按位置 LOCATION / 按用途 PURPOSE / 自定义 CUSTOM) */
export interface DeviceGroup {
  id: string
  name: string
  description: string
  group_type: 'LOCATION' | 'PURPOSE' | 'CUSTOM' | string
  parent_id: string
  sort_order: number
  status: 'active' | 'archived' | string
  /** 设备级成员 (设备 ID 列表) */
  device_ids: string[]
  /** 通道级成员 (国标 20 位编码, 海康"通道分配到区域"语义) */
  channel_ids: string[]
  /** 快照展开 = channel_ids ∪ 各 device 的全部通道 (运行时匹配实际生效集合) */
  resolved_channel_ids: string[]
  /** 展开后实际覆盖设备数 (华为"分组视图"语义, 规则表单确认范围用) */
  device_count?: number
  /** 展开后实际覆盖通道数 */
  channel_count?: number
  created_at?: number
  updated_at?: number
}

/** 位置实体 (华为好望点位 / 海康区域: 独立于设备表的层级树) */
export interface DeviceLocation {
  id: string
  name: string
  parent_location_id: string
  description: string
  sort_order: number
  created_at?: number
  updated_at?: number
}

export interface DeviceGroupPatch {
  name?: string
  description?: string
  group_type?: string
  parent_id?: string
  sort_order?: number
  /** 'archived' = 归档不删数据 (华为语义); 'active' = 恢复 */
  status?: string
}

export const deviceGroupApi = {
  // ── 分组 CRUD ──
  /** 分组列表 (include_archived=true 含归档) */
  listGroups(params?: { include_archived?: boolean }) {
    return deviceHttp.get<ApiResponse<{ items: DeviceGroup[]; total: number }>>('/groups', { params })
  },
  getGroup(id: string) {
    return deviceHttp.get<ApiResponse<DeviceGroup>>(`/groups/${id}`)
  },
  createGroup(data: { name: string; group_type?: string; description?: string; parent_id?: string; sort_order?: number }) {
    return deviceHttp.post<ApiResponse<DeviceGroup>>('/groups', data)
  },
  updateGroup(id: string, patch: DeviceGroupPatch) {
    return deviceHttp.put<ApiResponse<DeviceGroup>>(`/groups/${id}`, patch)
  },
  /** 删除分组 (子分组 parent_id 置空; 规则引用保留原值 — 老规则按旧语义工作) */
  deleteGroup(id: string) {
    return deviceHttp.delete<ApiResponse<{ deleted: string }>>(`/groups/${id}`)
  },
  /**
   * 成员绑定 (全量覆盖) — 通道级绑定不止设备层。
   * 后端自动重算 resolved 快照 (channel_ids ∪ 各 device 全部通道) 并返回最新分组。
   */
  setMembers(id: string, data: { device_ids: string[]; channel_ids: string[] }) {
    return deviceHttp.put<ApiResponse<DeviceGroup>>(`/groups/${id}/members`, data)
  },

  // ── 位置 CRUD ──
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
