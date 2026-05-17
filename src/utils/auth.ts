/**
 * 华盾AI智能视频盒子 v7.0 - 认证工具函数
 * 
 * utils/auth.ts — Token 与认证相关工具
 */

import Cookies from 'js-cookie'

const TOKEN_KEY = 'shieldai_token'

/**
 * 获取认证 Token
 */
export function getAuthToken(): string | undefined {
  return Cookies.get(TOKEN_KEY)
}

/**
 * 设置认证 Token
 */
export function setAuthToken(token: string, expiresDays = 7): void {
  Cookies.set(TOKEN_KEY, token, { expires: expiresDays })
}

/**
 * 移除认证 Token
 */
export function removeAuthToken(): void {
  Cookies.remove(TOKEN_KEY)
}

/**
 * 检查是否已认证
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken()
}
