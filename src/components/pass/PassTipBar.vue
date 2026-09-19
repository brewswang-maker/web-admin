<template>
  <!-- 通行提示条: header 正下方, 队列轮播 + 静音开关 (v2.2 2026-09-19) -->
  <transition name="passtip-slide">
    <div v-if="current" class="pass-tip-bar" role="status" aria-live="polite">
      <el-icon class="tip-icon" :class="'tip-icon--' + iconKind"><component :is="iconComp" /></el-icon>
      <span class="tip-badge" :class="'tip-badge--' + iconKind">{{ label }}</span>
      <span class="tip-text">
        <b>{{ current.personName }}</b>
        <template v-if="current.channelName"> · {{ current.channelName }}</template>
        · {{ timeText }}
      </span>
      <span v-if="store.queue.length > 1" class="tip-more">等 {{ store.queue.length }} 条</span>
      <div class="tip-actions">
        <button
          type="button" class="tip-btn" :aria-label="store.muted ? '开启语音播报' : '静音语音播报'"
          :title="store.muted ? '开启语音播报' : '静音语音播报'"
          @click="store.setMuted(!store.muted)"
        >
          <el-icon><Bell v-if="store.muted" /><BellFilled v-else /></el-icon>
        </button>
        <button type="button" class="tip-btn" aria-label="关闭提示" title="关闭" @click="store.dismiss(current.id)">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
/**
 * PassTipBar — 人脸分组通行顶部滚动提示条
 * 数据源: usePassTipStore 队列 (useGlobalAlarm.handleAlarm 对 face_pass_whitelist/
 *   vip/staff/custom 四类分流写入); 展示首条 4s 后自动轮换, 关闭/静音即时生效。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Bell, BellFilled, Close, User, Medal, Star, UserFilled } from '@element-plus/icons-vue'
import { usePassTipStore, PASS_TIP_LABEL } from '@/stores/passTip'

const store = usePassTipStore()
const current = computed(() => store.queue[0] ?? null)

const KIND_BY_TYPE: Record<string, 'vip' | 'staff' | 'white' | 'custom'> = {
  face_pass_vip: 'vip',
  face_pass_staff: 'staff',
  face_pass_whitelist: 'white',
  face_pass_custom: 'custom',
}
const ICON_BY_KIND: Record<string, any> = { vip: Medal, staff: UserFilled, white: Star, custom: User }

const iconKind = computed(() => KIND_BY_TYPE[current.value?.type ?? ''] ?? 'custom')
const iconComp = computed(() => ICON_BY_KIND[iconKind.value])
const label = computed(() => PASS_TIP_LABEL[current.value?.type ?? ''] ?? '通行')

const timeText = computed(() => {
  if (!current.value) return ''
  const d = new Date(current.value.createdAt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
})

// 首条 4s 自动轮换 (手关/新条目插入均重置计时)
let rotateTimer: ReturnType<typeof setTimeout> | null = null
function armRotate() {
  if (rotateTimer) clearTimeout(rotateTimer)
  if (!current.value) return
  const id = current.value.id
  rotateTimer = setTimeout(() => {
    if (current.value?.id === id) store.dismiss(id)
  }, 4000)
}
watch(current, armRotate, { immediate: true })
onBeforeUnmount(() => { if (rotateTimer) clearTimeout(rotateTimer) })
</script>

<style scoped>
.pass-tip-bar {
  position: sticky;
  top: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  background: linear-gradient(90deg, rgba(103, 194, 58, 0.12), rgba(64, 158, 255, 0.10) 60%, transparent);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
:global(.dark-theme) .pass-tip-bar {
  background: linear-gradient(90deg, rgba(103, 194, 58, 0.18), rgba(64, 158, 255, 0.14) 60%, transparent);
}
.tip-icon { font-size: 16px; }
.tip-icon--vip { color: var(--el-color-warning); }
.tip-icon--staff { color: var(--el-color-primary); }
.tip-icon--white { color: var(--el-color-success); }
.tip-icon--custom { color: var(--el-color-info); }
.tip-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 18px;
  color: #fff;
}
.tip-badge--vip { background: var(--el-color-warning); }
.tip-badge--staff { background: var(--el-color-primary); }
.tip-badge--white { background: var(--el-color-success); }
.tip-badge--custom { background: var(--el-color-info); }
.tip-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tip-text b { font-weight: 600; }
.tip-more { flex: none; color: var(--el-text-color-secondary); font-size: 12px; }
.tip-actions { display: flex; align-items: center; gap: 2px; }
.tip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.tip-btn:hover { background: var(--el-fill-color); color: var(--el-text-color-primary); }
.passtip-slide-enter-active, .passtip-slide-leave-active { transition: all .25s ease; }
.passtip-slide-enter-from, .passtip-slide-leave-to { opacity: 0; transform: translateY(-100%); }
</style>
