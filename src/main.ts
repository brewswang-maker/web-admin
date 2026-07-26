/**
 * 华盾AI智能视频盒子 v7.0 - Web管理后台入口
 * 
 * main.ts — 应用启动入口
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupDirectives } from './directives'
import { setupGlobalComponents } from './global-components'
import i18n from './i18n'
import { usePreferenceStore } from './stores/preference'

// 全局样式
import './styles/main.scss'
import './styles/global.css'

// ElNotification 命令式 API 样式（全局告警弹窗需要）
import 'element-plus/es/components/notification/style/css'

// 创建 Vue 应用实例
const app = createApp(App)

// 创建 Pinia 状态管理实例
const pinia = createPinia()

// 注册插件
app.use(pinia)
app.use(router)
app.use(i18n)

// 注册全局指令
setupDirectives(app)

// 注册全局组件
setupGlobalComponents(app)

// 初始化偏好(应用 localStorage 中已保存的主题/语言,避免首屏闪烁)
usePreferenceStore()

// 异步从后端拉取最新偏好(失败时仍使用本地)
usePreferenceStore()
  .loadFromServer()
  .catch(() => {
    /* keep local */
  })

// 挂载应用
app.mount('#app')

// 开发环境热更新
if (import.meta.env.DEV) {
  console.log('[华盾AI] 开发模式已启动')
  console.log('[华盾AI] 版本: v7.0.0 (灵犀架构)')
}

// 生产环境性能监控
if (import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const perfMarks = (window as any).__PERF_MARKS__ || {}
    console.debug('[华盾AI] 生产环境已部署')
    console.debug('[华盾AI] FCP:', perfMarks.fcp?.toFixed(2) + 'ms')
    console.debug('[华盾AI] LCP:', perfMarks.lcp?.toFixed(2) + 'ms')
  })
}

export default app
