/**
 * 华盾AI智能视频盒子 v7.0 - 全局指令
 * 
 * directives/index.ts — 注册全局 Vue 指令
 */

import type { App } from 'vue'
import vPermission from './permission'
import vLoading from './loading'
import vFocus from './focus'

export function setupDirectives(app: App) {
  app.directive('permission', vPermission)
  app.directive('loading', vLoading)
  app.directive('focus', vFocus)
}
