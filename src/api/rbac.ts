/**
 * 华盾AI智能视频盒子 v7.0 - RBAC 权限管理 API
 * api/rbac.ts — 角色、权限、用户管理相关接口
 */

import { http } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'
import type { UserInfo } from '@/types/user'

/** 角色 */
export interface Role {
  id: string
  name: string
  code: string
  description: string
  permissions: string[]
  userCount: number
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

/** 权限项 */
export interface Permission {
  id: string
  name: string
  code: string
  resource: string
  action: 'read' | 'write' | 'delete' | 'admin'
  description: string
  module: string
}

/** 创建角色请求 */
export interface CreateRoleRequest {
  name: string
  code: string
  description?: string
  permissions: string[]
}

/** 更新角色请求 */
export interface UpdateRoleRequest {
  name?: string
  description?: string
  permissions?: string[]
}

/** 团队 */
export interface Team {
  id: string
  name: string
  description: string
  memberCount: number
  projectIds: string[]
  createdAt: string
}

/** 创建团队请求 */
export interface CreateTeamRequest {
  name: string
  description?: string
  projectIds?: string[]
}

export const rbacApi = {
  // ===== 角色管理 =====

  /** 获取角色列表 */
  getRoles(params?: { page?: number; pageSize?: number; keyword?: string }) {
    return http.get<ApiResponse<PageResponse<Role>>>('/rbac/roles', { params })
  },

  /** 获取角色详情 */
  getRoleDetail(id: string) {
    return http.get<ApiResponse<Role>>(`/rbac/roles/${id}`)
  },

  /** 创建角色 */
  createRole(data: CreateRoleRequest) {
    return http.post<ApiResponse<Role>>('/rbac/roles', data)
  },

  /** 更新角色 */
  updateRole(id: string, data: UpdateRoleRequest) {
    return http.put<ApiResponse<Role>>(`/rbac/roles/${id}`, data)
  },

  /** 删除角色 */
  deleteRole(id: string) {
    return http.delete<ApiResponse<void>>(`/rbac/roles/${id}`)
  },

  /** 为角色分配权限 */
  assignPermissions(roleId: string, permissionIds: string[]) {
    return http.post<ApiResponse<void>>(`/rbac/roles/${roleId}/permissions`, { permissionIds })
  },

  // ===== 权限管理 =====

  /** 获取所有权限 */
  getPermissions(params?: { module?: string }) {
    return http.get<ApiResponse<Permission[]>>('/rbac/permissions', { params })
  },

  /** 获取权限树形结构 */
  getPermissionTree() {
    return http.get<ApiResponse<Array<{
      module: string
      label: string
      permissions: Permission[]
    }>>>('/rbac/permissions/tree')
  },

  // ===== 用户角色 =====

  /** 获取用户列表（带角色） */
  getUsers(params?: { page?: number; pageSize?: number; keyword?: string; roleId?: string }) {
    return http.get<ApiResponse<PageResponse<UserInfo & { roles: Role[] }>>>('/rbac/users', { params })
  },

  /** 为用户分配角色 */
  assignRoles(userId: string, roleIds: string[]) {
    return http.post<ApiResponse<void>>(`/rbac/users/${userId}/roles`, { roleIds })
  },

  /** 移除用户角色 */
  removeUserRole(userId: string, roleId: string) {
    return http.delete<ApiResponse<void>>(`/rbac/users/${userId}/roles/${roleId}`)
  },

  // ===== 团队管理 =====

  /** 获取团队列表 */
  getTeams(params?: { page?: number; pageSize?: number; keyword?: string }) {
    return http.get<ApiResponse<PageResponse<Team>>>('/rbac/teams', { params })
  },

  /** 获取团队详情 */
  getTeamDetail(id: string) {
    return http.get<ApiResponse<Team & { members: UserInfo[] }>>(`/rbac/teams/${id}`)
  },

  /** 创建团队 */
  createTeam(data: CreateTeamRequest) {
    return http.post<ApiResponse<Team>>('/rbac/teams', data)
  },

  /** 更新团队 */
  updateTeam(id: string, data: Partial<CreateTeamRequest>) {
    return http.put<ApiResponse<Team>>(`/rbac/teams/${id}`, data)
  },

  /** 删除团队 */
  deleteTeam(id: string) {
    return http.delete<ApiResponse<void>>(`/rbac/teams/${id}`)
  },

  /** 添加团队成员 */
  addTeamMember(teamId: string, userId: string, roleIds?: string[]) {
    return http.post<ApiResponse<void>>(`/rbac/teams/${teamId}/members`, { userId, roleIds })
  },

  /** 移除团队成员 */
  removeTeamMember(teamId: string, userId: string) {
    return http.delete<ApiResponse<void>>(`/rbac/teams/${teamId}/members/${userId}`)
  }
}
