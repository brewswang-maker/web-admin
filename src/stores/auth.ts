/**
 * 华盾AI智能视频盒子 v7.0 - 认证状态管理
 * stores/auth.ts — 认证与权限代理（基于 user store）
 */

import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useUserStore } from './user'

export const useAuthStore = defineStore('auth', () => {
  const userStore = useUserStore()

  // 代理 user store 的状态
  const isLoggedIn = computed(() => userStore.isLoggedIn)
  const token = computed(() => userStore.token)
  const userInfo = computed(() => userStore.userInfo)
  const user = computed(() => userStore.userInfo)
  const roles = computed(() => userStore.roles)
  const permissions = computed(() => userStore.permissions)

  /** 检查权限 */
  function can(resource: string, action: string): boolean {
    return userStore.hasPermission(`${resource}:${action}`)
  }

  /** 检查角色 */
  function hasRole(role: string): boolean {
    return userStore.roles.includes(role)
  }

  /** 检查权限（代理） */
  function hasPermission(permission: string): boolean {
    return userStore.hasPermission(permission)
  }

  /** 登录 */
  async function login(loginForm: { username: string; password: string; rememberMe?: boolean }) {
    return userStore.login(loginForm)
  }

  /** 登出 */
  async function logout() {
    return userStore.logout()
  }

  /** 获取用户信息 */
  async function fetchUserInfo() {
    return userStore.fetchUserInfo()
  }

  return {
    username: computed(() => userInfo.value?.name || userInfo.value?.username || ''),
    isLoggedIn,
    token,
    userInfo,
    user,
    roles,
    permissions,
    can,
    hasRole,
    hasPermission,
    login,
    logout,
    fetchUserInfo,
  }
})
