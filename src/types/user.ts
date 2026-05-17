/**
 * 华盾AI智能视频盒子 v7.0 - 用户相关类型定义
 * 
 * types/user.ts — 用户、认证相关类型
 */

export interface UserInfo {
  id: string | number
  username: string
  name: string
  email?: string
  phone?: string
  avatar?: string
  roles: string[]
  permissions: string[]
  teamId?: string | number
  teamName?: string
  createTime?: string
  lastLoginTime?: string
}

export interface LoginForm {
  username: string
  password: string
  rememberMe?: boolean
}

export interface AuthResponse {
  token: string
  user: UserInfo
  expireAt?: string
}

export interface RegisterForm {
  username: string
  password: string
  confirmPassword: string
  email?: string
  phone?: string
  teamName?: string
}

export interface PasswordChangeForm {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}
