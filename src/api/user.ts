/**
 * 华盾AI智能视频盒子 v7.0 - 用户 API
 *
 * api/user.ts — 用户认证与管理 API
 *
 * 🆕 优化：移除独立 axios 实例，统一使用 http 模块共享客户端
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'
import type { LoginForm, AuthResponse, UserInfo, PasswordChangeForm, RegisterForm } from '@/types/user'

export const userApi = {
  /**
   * 用户登录
   */
  login(loginForm: LoginForm) {
    return http.post<ApiResponse<AuthResponse>>('/auth/login', loginForm)
  },

  /**
   * 用户登出
   */
  logout() {
    return http.post('/auth/logout')
  },

  /**
   * 获取当前用户信息
   */
  getUserInfo() {
    return http.get<ApiResponse<UserInfo>>('/auth/me')
  },

  /**
   * 刷新Token
   */
  refreshToken(token: string) {
    return http.post<ApiResponse<{ token: string; expiresIn: number }>>('/auth/refresh', { token })
  },

  /**
   * 修改密码
   */
  changePassword(data: PasswordChangeForm) {
    return http.post('/auth/change-password', data)
  },

  /**
   * 注册新用户（仅管理员）
   */
  register(data: RegisterForm) {
    return http.post('/auth/register', data)
  },

  /**
   * 更新用户信息
   */
  updateUser(userId: string | number, data: Partial<UserInfo>) {
    return http.put(`/users/${userId}`, data)
  },

  /**
   * 获取用户列表（仅管理员）
   */
  getUserList(params?: {
    page?: number
    pageSize?: number
    keyword?: string
    role?: string
  }) {
    return http.get<ApiResponse<UserInfo[]>>('/users', { params })
  },

  /**
   * 删除用户（仅管理员）
   */
  deleteUser(userId: string | number) {
    return http.delete(`/users/${userId}`)
  },

  /**
   * 重置用户密码（仅管理员）
   */
  resetPassword(userId: string | number) {
    return http.post(`/users/${userId}/reset-password`)
  },

  /**
   * 批量导入用户（仅管理员）
   */
  importUsers(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return http.post('/users/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      skipRetry: true,
    })
  },
}
