<template>
  <!-- =============================================
       NotificationBell - 通知铃铛 + 未读计数徽标
       功能:
        - 显示未读通知数量
        - 点击切换弹窗
        - 新通知到达时铃铛抖动动画
        - 支持不同优先级的徽标颜色
       ============================================= -->
  <el-popover
    placement="bottom-end"
    :width="420"
    :visible="store.popupVisible"
    trigger="click"
    :hide-after="0"
    :show-arrow="false"
    popper-class="notification-popover"
    @show="store.openPopup()"
    @hide="store.closePopup()"
  >
    <!-- ── 触发器：铃铛图标 ── -->
    <template #reference>
      <div
        class="notification-bell"
        :class="{ 'has-urgent': hasUrgent, 'is-shaking': shaking }"
        @click.stop="handleBellClick"
      >
        <el-badge
          :value="displayCount"
          :hidden="store.unreadCount === 0"
          :max="99"
          class="bell-badge"
        >
          <el-icon :size="20">
            <Bell />
          </el-icon>
        </el-badge>
      </div>
    </template>

    <!-- ── 弹窗内容 ── -->
    <NotificationPopup
      @close="store.closePopup()"
      @mark-all="store.markAllRead()"
    />
  </el-popover>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Bell } from '@element-plus/icons-vue'
import { useNotificationStore } from '@/stores/notification'
import NotificationPopup from './NotificationPopup.vue'

const store = useNotificationStore()

// ── 新通知抖动动画 ──
const shaking = ref(false)
let shakeTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => store.unreadCount,
  (newVal, oldVal) => {
    if (newVal > oldVal) {
      shaking.value = true
      if (shakeTimer) clearTimeout(shakeTimer)
      shakeTimer = setTimeout(() => {
        shaking.value = false
      }, 600)
    }
  }
)

// ── 是否有紧急通知 ──
const hasUrgent = computed(() =>
  store.notifications.some((n) => !n.read && n.priority === 'urgent')
)

// ── 显示计数（99+ 时显示 "99+"） ──
const displayCount = computed(() =>
  store.unreadCount > 99 ? '99+' : store.unreadCount
)

// ── 点击处理 ──
function handleBellClick() {
  store.togglePopup()
}
</script>

<style scoped>
.notification-bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  color: #606266;
  transition: all 0.25s ease;
}

.notification-bell:hover {
  background: #f0f2f5;
  color: #409EFF;
}

/* 有紧急通知 — 红色 */
.notification-bell.has-urgent {
  color: #F56C6C;
}

.notification-bell.has-urgent:hover {
  background: #fef0f0;
}

/* ── 抖动动画 ── */
.notification-bell.is-shaking {
  animation: bell-shake 0.5s ease-in-out;
}

@keyframes bell-shake {
  0%, 100% { transform: rotate(0deg); }
  15% { transform: rotate(12deg); }
  30% { transform: rotate(-10deg); }
  45% { transform: rotate(8deg); }
  60% { transform: rotate(-6deg); }
  75% { transform: rotate(3deg); }
  90% { transform: rotate(-1deg); }
}

/* ── Badge 微调 ── */
.bell-badge :deep(.el-badge__content) {
  font-size: 11px;
}

/* ── 弹窗容器重置 ── */
.notification-bell :deep(.el-popover__reference-wrapper) {
  display: inline-flex;
}
</style>

<!-- ── 全局样式（非 scoped，popover 渲染到 body） ── -->
<style>
.notification-popover {
  padding: 0 !important;
  border-radius: 12px !important;
  box-shadow: 0 6px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06) !important;
  overflow: hidden;
}
</style>
