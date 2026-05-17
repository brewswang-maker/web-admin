/**
 * 华盾AI智能视频盒子 v7.0 - 权限指令
 * 
 * directives/permission.ts — v-permission 指令实现
 */

import type { Directive, DirectiveBinding } from 'vue'
import { useUserStore } from '@/stores/user'

/**
 * v-permission:xx="permissionCode"
 * 用法: <el-button v-permission:click="['user:create']">创建用户</el-button>
 */
const vPermission: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const { value } = binding
    
    if (value && typeof value === 'string') {
      const userStore = useUserStore()
      const [action, permission] = value.split(':')
      
      if (!userStore.hasPermission(permission)) {
        // 无权限，禁用或隐藏元素
        if (action === 'click') {
          el.setAttribute('disabled', 'true')
          el.classList.add('is-disabled')
          el.addEventListener('click', stopEvent, true)
        } else {
          el.style.display = 'none'
        }
      }
    }
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    const { value, oldValue } = binding
    
    if (value !== oldValue) {
      const userStore = useUserStore()
      const [action, permission] = (value as string).split(':')
      
      if (userStore.hasPermission(permission)) {
        el.removeAttribute('disabled')
        el.classList.remove('is-disabled')
        el.removeEventListener('click', stopEvent, true)
        el.style.display = ''
      }
    }
  }
}

function stopEvent(e: Event) {
  e.stopPropagation()
  e.preventDefault()
}

export default vPermission
