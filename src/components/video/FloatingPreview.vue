<template>
  <Teleport to="body">
    <transition name="float-slide">
      <div
        v-if="channelStore.showFloatingPreview && channelStore.hasActive"
        class="floating-preview"
        :style="{ bottom: posY + 'px', right: posX + 'px' }"
        @mousedown="startDrag"
      >
        <!-- Header -->
        <div class="float-header">
          <div class="float-header__left">
            <span class="float-live-dot" />
            <span class="float-channel-name">{{ currentChannelName }}</span>
          </div>
          <div class="float-header__actions">
            <el-button size="small" text @click="prevChannel" :disabled="channelList.length <= 1">
              <el-icon><ArrowLeft /></el-icon>
            </el-button>
            <el-button size="small" text @click="nextChannel" :disabled="channelList.length <= 1">
              <el-icon><ArrowRight /></el-icon>
            </el-button>
            <el-button size="small" text @click="goToLive">
              <el-icon><FullScreen /></el-icon>
            </el-button>
            <el-button size="small" text @click="close">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>

        <!-- Player -->
        <div class="float-player">
          <MiniPlayer
            v-if="currentChannelId"
            :key="currentChannelId"
            :channel-id="currentChannelId"
            :skip-start-api="true"
            aspect-ratio="16:9"
          />
          <div v-else class="float-empty">
            <el-icon :size="24"><VideoCamera /></el-icon>
            <span>无活跃通道</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="float-footer">
          <span class="float-footer__info">{{ channelList.length }} 路活跃</span>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * FloatingPreview.vue — 右下角迷你视频预览浮窗
 *
 * 离开 /live 页面后自动出现，使用 MiniPlayer 播放活跃通道。
 * 可拖拽、切换通道、跳回监控页。
 * 关闭仅隐藏浮窗，不停流。
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, FullScreen, Close, VideoCamera } from '@element-plus/icons-vue'
import { useChannelStore } from '@/stores/channel'
import MiniPlayer from '@/components/video/MiniPlayer.vue'

const router = useRouter()
const channelStore = useChannelStore()

// 拖拽状态
const posX = ref(24)
const posY = ref(24)
const dragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragStartPosX = 0
let dragStartPosY = 0

// 当前显示的通道索引
const currentIndex = ref(0)

const channelList = computed(() => channelStore.activeChannels)

const currentChannelId = computed(() => {
  const ch = channelList.value[currentIndex.value]
  return ch?.channelId || channelStore.floatingPreviewChannelId || ''
})

const currentChannelName = computed(() => {
  const ch = channelList.value[currentIndex.value]
  return ch?.name || ''
})

// 监听浮窗显隐，初始化当前通道
watch(() => channelStore.showFloatingPreview, (visible) => {
  if (visible && channelStore.floatingPreviewChannelId) {
    const idx = channelList.value.findIndex(
      c => c.channelId === channelStore.floatingPreviewChannelId
    )
    currentIndex.value = idx >= 0 ? idx : 0
  }
})

function prevChannel() {
  if (channelList.value.length <= 1) return
  currentIndex.value = (currentIndex.value - 1 + channelList.value.length) % channelList.value.length
}

function nextChannel() {
  if (channelList.value.length <= 1) return
  currentIndex.value = (currentIndex.value + 1) % channelList.value.length
}

function goToLive() {
  router.push('/live')
}

/** 关闭浮窗（仅隐藏，不停流） */
function close() {
  channelStore.showFloatingPreview = false
}

// ── 拖拽 ──
function startDrag(e: MouseEvent) {
  // 只从 header 区域拖拽
  if ((e.target as HTMLElement).closest('.float-header')) {
    dragging.value = true
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragStartPosX = posX.value
    dragStartPosY = posY.value
    document.addEventListener('mousemove', onDrag)
    document.addEventListener('mouseup', stopDrag)
  }
}

function onDrag(e: MouseEvent) {
  if (!dragging.value) return
  const dx = dragStartX - e.clientX
  const dy = dragStartY - e.clientY
  posX.value = Math.max(24, dragStartPosX + dx)
  posY.value = Math.max(24, dragStartPosY + dy)
}

function stopDrag() {
  dragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}
</script>

<style scoped>
.floating-preview {
  position: fixed;
  z-index: 8000;
  width: 320px;
  background: #1a1d23;
  border: 1px solid #3c4043;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  user-select: none;
}

.float-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: #25282e;
  cursor: move;
}

.float-header__left {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e8eaed;
  font-size: 12px;
  font-weight: 500;
}

.float-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f44336;
  animation: pulse-dot 1.5s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.float-channel-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.float-header__actions {
  display: flex;
  gap: 2px;
}

.float-header__actions :deep(.el-button) {
  color: #9aa0a6;
  padding: 2px;
}

.float-header__actions :deep(.el-button:hover) {
  color: #e8eaed;
}

.float-player {
  background: #000;
}

.float-empty {
  height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #9aa0a6;
  font-size: 12px;
}

.float-footer {
  padding: 4px 10px;
  background: #25282e;
  text-align: center;
}

.float-footer__info {
  color: #9aa0a6;
  font-size: 11px;
}

/* 过渡动画 */
.float-slide-enter-active,
.float-slide-leave-active {
  transition: all 0.3s ease;
}

.float-slide-enter-from,
.float-slide-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
