/**
 * 华盾AI智能视频盒子 v7.0 - 权限状态管理
 * 
 * stores/permission.ts — 动态路由与权限控制
 */

import { defineStore } from 'pinia'
import { ref, markRaw } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { asyncRoutes } from '@/router'

export const usePermissionStore = defineStore('permission', () => {
  // 状态
  const routes = ref<RouteRecordRaw[]>([])
  const dynamicRoutesAdded = ref(false)

  // Actions
  function generateRoutes() {
    return new Promise<void>((resolve) => {
      // 从后端获取动态路由（如果有）
      // 目前直接使用本地配置的异步路由
      // markRaw prevents Vue from making route component objects reactive
      routes.value = markRaw(asyncRoutes) as RouteRecordRaw[]
      dynamicRoutesAdded.value = true
      resolve()
    })
  }

  function resetRoutes() {
    routes.value = []
    dynamicRoutesAdded.value = false
  }

  return {
    routes,
    dynamicRoutesAdded,
    generateRoutes,
    resetRoutes
  }
})
