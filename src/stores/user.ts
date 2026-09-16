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
  // 从 localStorage 恢复 userInfo，避免刷新后丢失
  const savedUser = (() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })()
  const userInfo = ref<UserInfo | null>(savedUser)
  const roles = ref<string[]>(savedUser?.roles || savedUser?.roleIds || [])
  const permissions = ref<string[]>(savedUser?.permissions || [])
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
      const body: any = (response as any)?.data
      // [FIX login-toast 2026-09-15] 后端约定: 登录端点 HTTP 恒 200, 业务成败在 body.code
      //   (0=成功, 401=凭据错误)。原逻辑直接解构 body.data, 密码错误时 data={} →
      //   user.roles 抛 TypeError 被 catch 吞掉 → 返回 {success:false} 不 throw →
      //   LoginView 走成功分支 (欢迎回来+跳转) 被守卫踢回 → 用户看不到任何错误提示
      if (!body || body.code !== 0) {
        return { success: false, message: body?.message || '用户名或密码错误' }
      }
      const authData: AuthResponse | undefined = body.data
      if (!authData?.token || !authData?.user) {
        return { success: false, message: '登录响应缺少凭据, 请稍后重试' }
      }
      const { token: newToken, user } = authData

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

  function logout() {
    // [FIX logout-twice 2026-09-16] 原实现先 await userApi.logout() 再于 finally 清
    //   本地态: MainLayout 同步紧跟 router.push('/login') 时 token 尚未清, 路由守卫
    //   (router/index.ts L756) 见 isLoggedIn=true → next('/') 踢回首页 → 第一次点
    //   退出"无反应", 第二次才生效(此时首次请求已返回、finally 已清)。
    //   修法: 本地状态同步先清 (isLoggedIn 立即 false), 后端吊销 fire-and-forget
    //   (失败仅打日志; 服务端 token 自然过期兜底, 不阻塞登出跳转)。
    token.value = ''
    userInfo.value = null
    roles.value = []
    permissions.value = []
    clearAuthToken()
    Cookies.remove(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    // Promise.resolve 兼容 mock/异常场景下 logout 返回非 promise (undefined.catch 会炸)
    Promise.resolve(userApi.logout()).catch((error) => {
      console.error('[UserStore] 登出请求失败(本地态已清, 忽略):', error)
    })
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
