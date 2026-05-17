/**
 * 华盾AI智能视频盒子 v7.0 - 焦点指令
 * 
 * directives/focus.ts — v-focus 指令实现
 */

import type { Directive, DirectiveBinding } from 'vue'

/**
 * v-focus
 * 用法: <input v-focus />
 */
const vFocus: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    // 如果是 input 元素，直接聚焦
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.focus()
    } else {
      // 否则查找内部的 input
      const input = el.querySelector('input') as HTMLInputElement
      if (input) {
        input.focus()
      }
    }
  }
}

export default vFocus
