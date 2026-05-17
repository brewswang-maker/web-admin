/**
 * 华盾AI智能视频盒子 v7.0 - 加载指令
 * 
 * directives/loading.ts — v-loading 指令实现
 */

import type { Directive, DirectiveBinding } from 'vue'
import { ElLoading } from 'element-plus'

const loadingInstances = new WeakMap<HTMLElement, any>()

/**
 * v-loading:[modifier]="options"
 * 用法: <div v-loading="isLoading">content</div>
 */
const vLoading: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const { value, modifiers } = binding
    
    if (value) {
      const options = {
        fullscreen: modifiers.fullscreen,
        body: modifiers.body,
        lock: modifiers.lock,
        text: modifiers.text ? '加载中...' : undefined,
        spinner: modifiers.spinner ? 'Loading...' : undefined,
        background: modifiers.background ? 'rgba(0, 0, 0, 0.7)' : undefined
      }
      
      const loading = ElLoading.service(options)
      loadingInstances.set(el, loading)
    }
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    const { value, oldValue } = binding
    
    if (value !== oldValue) {
      const loading = loadingInstances.get(el)
      
      if (value && !loading) {
        const loading = ElLoading.service({ target: el })
        loadingInstances.set(el, loading)
      } else if (!value && loading) {
        loading.close()
        loadingInstances.delete(el)
      }
    }
  },
  unmounted(el: HTMLElement) {
    const loading = loadingInstances.get(el)
    if (loading) {
      loading.close()
      loadingInstances.delete(el)
    }
  }
}

export default vLoading
