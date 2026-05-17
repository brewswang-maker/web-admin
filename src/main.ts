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

// 全局样式
import './styles/main.scss'

// 创建 Vue 应用实例
const app = createApp(App)

// 创建 Pinia 状态管理实例
const pinia = createPinia()

// 注册插件
app.use(pinia)
app.use(router)

// 注册全局指令
setupDirectives(app)

// 注册全局组件
setupGlobalComponents(app)

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
    console.log('[华盾AI] 生产环境已部署')
    console.log('[华盾AI] FCP:', perfMarks.fcp?.toFixed(2) + 'ms')
    console.log('[华盾AI] LCP:', perfMarks.lcp?.toFixed(2) + 'ms')
  })
}

export default app
