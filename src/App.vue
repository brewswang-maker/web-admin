<template>
  <el-config-provider :locale="zhCn">
    <router-view v-slot="{ Component, route }">
      <transition name="page-fade" mode="out-in">
        <suspense :timeout="0">
          <template #default>
            <component :is="Component" :key="route.fullPath" />
          </template>
          <template #fallback>
            <SkeletonLoader :variant="isDashboard(route) ? 'dashboard' : 'generic'" />
          </template>
        </suspense>
      </transition>
    </router-view>

    <!-- =============================================
         SW 更新提示条
         当检测到新版本 SW 时，显示可关闭的提示
         ============================================= -->
    <Teleport to="body">
      <transition name="sw-update-slide">
        <div v-if="swUpdateAvailable" class="sw-update-banner">
          <span>🎉 新版本可用</span>
          <el-button type="primary" size="small" @click="applySWUpdate">
            立即刷新
          </el-button>
          <el-button text size="small" @click="swUpdateAvailable = false">
            稍后
          </el-button>
        </div>
      </transition>
    </Teleport>
  </el-config-provider>
</template>

<script setup lang="ts">
/**
 * App.vue — 华盾AI v6.0 Web管理控制台根组件
 *
 * 职责:
 *  1. 全局配置提供 (Element Plus Locale)
 *  2. 路由级 Suspense + 过渡动画
 *  3. Service Worker 更新提示
 *  4. Auth 初始化 (在路由守卫中完成)
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import type { RouteLocationNormalized } from 'vue-router'

// ── SW 更新提示 ──
const swUpdateAvailable = ref(false)

function onSWUpdate() {
  swUpdateAvailable.value = true
}

function applySWUpdate() {
  // 向 SW 发送 skipWaiting 消息
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
  }
  window.location.reload()
}

onMounted(() => {
  window.addEventListener('sw-update-available', onSWUpdate)
})

onUnmounted(() => {
  window.removeEventListener('sw-update-available', onSWUpdate)
})

// ── 骨架屏类型判断 ──
function isDashboard(route: RouteLocationNormalized) {
  return route.name === 'Dashboard'
}
</script>

<style>
/* 
 * 🛡️ FOUC 防护：index.html 内联 style 设置 #app { display: none } 防止未渲染内容闪现。
 * Vue 挂载后此全局样式覆盖 display:none，使应用正常显示。
 * App.vue 的 <style>（无 scoped）在 DOM 中位于内联 style 之后，优先级更高。
 */
#app {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
}

/* =========================================
   页面过渡动画
   ========================================= */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* =========================================
   SW 更新提示条
   ========================================= */
.sw-update-banner {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--el-color-primary-light-9, #ecf5ff);
  border: 1px solid var(--el-color-primary, #409eff);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-size: 14px;
}

.sw-update-slide-enter-active,
.sw-update-slide-leave-active {
  transition: all 0.3s ease;
}

.sw-update-slide-enter-from,
.sw-update-slide-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
