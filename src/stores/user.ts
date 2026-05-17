/**
 * 华盾AI智能视频盒子 v7.0 - 用户状态管理
 * stores/user.ts — 用户状态、认证与权限信息
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo, LoginForm, AuthResponse } from '@/types/user'
import { userApi } from '@/api/user'
import { setAuthToken, removeAuthToken as clearAuthToken } from '@/utils/auth'
import Cookies from 'js-cookie'

const TOKEN_KEY = 'shieldai_token'
const USER_KEY = 'shieldai_user'

export const useUserStore = defineStore('user', () => {
  // 状态
  const token = ref<string>(Cookies.get(TOKEN_KEY) || '')
  const userInfo = ref<UserInfo | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<string[]>([])
  const isLoading = ref(false)

  // 计算属性
  const isLoggedIn = computed(() => !!token.value && !!userInfo.value)
  const isAdmin = computed(() => roles.value.includes('admin'))
  const userName = computed(() => userInfo.value?.name || userInfo.value?.username || '未登录')
  const userAvatar = computed(() => userInfo.value?.avatar || '/default-avatar.png')

  // Actions
  async function login(loginForm: LoginForm) {
    isLoading.value = true
    try {
      const response = await userApi.login(loginForm)
      const resData = response.data as any
      const authData: AuthResponse = resData.data ?? resData
      let { token: newToken, user } = authData

      // 后端返回 roleIds 而非 roles，做字段映射
      if (!user.roles && (user as any).roleIds) {
        (user as any).roles = (user as any).roleIds
      }
      if (!user.name && (user as any).displayName) {
        (user as any).name = (user as any).displayName
      }

      token.value = newToken
      setAuthToken(newToken)
      Cookies.set(TOKEN_KEY, newToken, { expires: 7 })

      userInfo.value = user
      // 后端返回 roleIds，前端统一为 roles
      roles.value = user.roles || (user as any).roleIds || []
      permissions.value = user.permissions || []
      localStorage.setItem(USER_KEY, JSON.stringify(user))

      return { success: true, message: '登录成功' }
    } catch (error: any) {
      console.error('[UserStore] 登录失败:', error)
      return { success: false, message: error.response?.data?.message || '登录失败，请检查用户名和密码' }
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      await userApi.logout()
    } catch (error) {
      console.error('[UserStore] 登出请求失败:', error)
    } finally {
      token.value = ''
      userInfo.value = null
      roles.value = []
      permissions.value = []
      clearAuthToken()
      Cookies.remove(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  }

  async function fetchUserInfo() {
    if (!token.value) return null
    isLoading.value = true
    try {
      const response = await userApi.getUserInfo()
      const resData = response.data as any
      const info: UserInfo = resData.data ?? resData
      userInfo.value = info
      roles.value = info.roles || (info as any).roleIds || []
      permissions.value = info.permissions || []
      return userInfo.value
    } catch (error) {
      console.error('[UserStore] 获取用户信息失败:', error)
      await logout()
      return null
    } finally {
      isLoading.value = false
    }
  }

  function hasPermission(permission: string): boolean {
    if (isAdmin.value) return true
    return permissions.value.includes(permission) || permissions.value.includes('*')
  }

  function hasRole(role: string): boolean {
    return roles.value.includes(role)
  }

  return {
    token, userInfo, roles, permissions, isLoading,
    isLoggedIn, isAdmin, userName, userAvatar,
    login, logout, fetchUserInfo, hasPermission, hasRole,
  }
})
