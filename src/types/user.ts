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
  /** [SCENE-ISOLATION 2026-09-29] 用户场景归属 (后端 users.scene_tags /
   *  scenario_* 角色推导, 对齐 EventTypeAliases.h scene_tags):
   *  非空 = scenario_* 场景用户, 报警列表/WS 推送/弹窗/联动规则全链路
   *  按此隔离; 空 = admin/普通用户, 全量可见 */
  sceneTags?: string[]
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
