/**
 * 华盾AI智能视频盒子 v7.0 - 全局组件注册
 * 
 * global-components/index.ts — 自动注册全局组件
 */

import type { App } from 'vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import NotificationBell from '@/components/NotificationBell.vue'
import NotificationPopup from '@/components/NotificationPopup.vue'
import ImageUpload from '@/components/ImageUpload.vue'
import LazyChart from '@/components/LazyChart.vue'

export function setupGlobalComponents(app: App) {
  // 注册全局组件
  app.component('ErrorBoundary', ErrorBoundary)
  app.component('NotificationBell', NotificationBell)
  app.component('NotificationPopup', NotificationPopup)
  app.component('ImageUpload', ImageUpload)
  app.component('LazyChart', LazyChart)
}
