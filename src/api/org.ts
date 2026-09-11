/**
 * 华盾AI智能视频盒子 — 组织机构 API
 * api/org.ts — [P1.4 2026-09-10] "组织机构→部门"任意多级树 + 人员挂载
 *
 * 后端: 边缘盒 RestApiHandlers /api/v1/org/units (rbac.db org_units,
 *       OrgStore 单例, 与 rbac_users 同库同域)。
 * 人员挂载: PUT /api/v1/users/:id 的 orgId 字段 (RbacService 白名单透传)。
 * 对标: 海康 iSC 组织机构树 / 大华组织树 (人员→部门→机构)。
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'

/** 组织单元 (平表存储, 前端按 parent_id 组树; 复用 areaTree.buildAreaTree 同款范式) */
export interface OrgUnit {
  id: string
  name: string
  parent_id: string
  /** 驼峰镜像 (后端双输出) */
  parentId?: string
  sort_order: number
  description: string
  created_at?: number
  updated_at?: number
}

export const orgUnitApi = {
  /** 组织单元平表 (前端组树) */
  list() {
    return http.get<ApiResponse<{ items: OrgUnit[]; total: number }>>('/org/units')
  },
  create(data: { name: string; parent_id?: string; sort_order?: number; description?: string }) {
    return http.post<ApiResponse<OrgUnit>>('/org/units', data)
  },
  update(id: string, patch: { name?: string; parent_id?: string; sort_order?: number; description?: string }) {
    return http.put<ApiResponse<OrgUnit>>(`/org/units/${id}`, patch)
  },
  /** 删除: 子节点 parent_id 置空 + 人员 org_id 置空 (后端同库事务防悬垂) */
  remove(id: string) {
    return http.delete<ApiResponse<{ deleted: string }>>(`/org/units/${id}`)
  },
}

