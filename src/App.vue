<template>
  <el-config-provider :locale="currentElementPlusLocale">
    <router-view v-slot="{ Component, route }">
      <transition name="page-fade" mode="out-in">
        <suspense :timeout="0">
          <template #default>
            <!-- <component :is="Component" :key="route.fullPath" /> -->
            <component :is="Component" />
          </template>
          <template #fallback>
            <SkeletonLoader :variant="isDashboard(route) ? 'dashboard' : 'generic'" />
          </template>
        </suspense>
      </transition>
    </router-view>

    <!-- 全局告警弹窗（海康威视风格） -->
    <Alarm-popup />

    <!-- 全局视频浮窗（离开 LiveView 后持续预览） -->
    <FloatingPreview />
  </el-config-provider>
</template>

<script setup lang="ts">
/**
 * App.vue — 华盾AI v6.0 Web管理控制台根组件
 *
 * 职责:
 *  1. 全局配置提供 (Element Plus Locale + i18n 联动)
 *  2. 路由级 Suspense + 过渡动画
 *  3. Auth 初始化 (在路由守卫中完成)
 *  5. 首次用户交互时解锁音频/语音合成 (autoplay policy)
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import { usePreferenceStore } from '@/stores/preference'
import { startGlobalAlarm, stopGlobalAlarm } from '@/composables/useGlobalAlarm'
import AlarmPopup from '@/components/alarm/AlarmPopup.vue'
import FloatingPreview from '@/components/video/FloatingPreview.vue'
import type { RouteLocationNormalized } from 'vue-router'

// ── Element Plus Locale 随 i18n 联动 ──
const prefStore = usePreferenceStore()
const currentElementPlusLocale = computed(() => {
  return prefStore.language === 'en-US' ? en : zhCn
})

// ── 首次用户交互 → 解锁音频 + 预热 SpeechSynthesis ──
// 浏览器 autoplay policy: 未交互前 Audio.play() / speechSynthesis.speak() 静默失败.
// 把解锁挂到 document 级别, 用户第一次 click/keydown/touchstart 即触发, 之后告警音效和 TTS 才能响.
let mediaUnlocked = false
function unlockMediaOnFirstGesture() {
  if (mediaUnlocked) return
  mediaUnlocked = true

  // 1) 解锁 audio: 创建一个 <audio> 元素, play 一下再 pause.
  try {
    const a = new Audio('/audio/alarm.wav')
    a.volume = 0.001 // 极小音量, 避免吓到用户
    a.play().then(() => { a.pause(); a.currentTime = 0 }).catch(() => { /* still ok */ })
  } catch { /* noop */ }

  // 2) 预热 Web Speech API: 一次 speak() 让浏览器标记"已授权语音".
  //    volume 不能为 0，否则某些浏览器不认为"已播放音频"
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      window.speechSynthesis.resume()
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0.01
      u.lang = 'zh-CN'
      u.rate = 10  // 最快速，尽快结束
      window.speechSynthesis.speak(u)
    }
  } catch { /* noop */ }

  document.removeEventListener('click', unlockMediaOnFirstGesture)
  document.removeEventListener('keydown', unlockMediaOnFirstGesture)
  document.removeEventListener('touchstart', unlockMediaOnFirstGesture)
}

onMounted(() => {
  // 启动全局告警 WebSocket（全页面共用，弹窗不依赖 LiveView）
  startGlobalAlarm()
  // 注册首次交互解锁监听器 (passive, 不阻塞)
  document.addEventListener('click', unlockMediaOnFirstGesture, { once: true, passive: true })
  document.addEventListener('keydown', unlockMediaOnFirstGesture, { once: true, passive: true })
  document.addEventListener('touchstart', unlockMediaOnFirstGesture, { once: true, passive: true })
})

onUnmounted(() => {
  document.removeEventListener('click', unlockMediaOnFirstGesture)
  document.removeEventListener('keydown', unlockMediaOnFirstGesture)
  document.removeEventListener('touchstart', unlockMediaOnFirstGesture)
  stopGlobalAlarm()
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

</style>
