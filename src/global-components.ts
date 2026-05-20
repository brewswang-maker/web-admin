/**
 * 全局组件注册
 * 
 * 用于注册需要在所有页面中直接使用的组件，无需逐页 import
 */
import type { App } from 'vue'

export function setupGlobalComponents(app: App) {
  // 全局组件通过 unplugin-vue-components 自动按需注册
  // Element Plus 图标通过 vite.config.ts 的 IconsResolver 自动导入
  // 此函数保留作为未来手动注册全局组件的入口
}
