<template>
  <!-- =============================================
       NotificationPopup - 通知下拉面板
       功能:
        - 分类 Tab 筛选（全部/告警/系统/设备/AI）
        - 通知列表（虚拟滚动占位，可扩展）
        - 单条已读 / 全部已读
        - 点击跳转
        - 空状态占位
       ============================================= -->
  <div class="notif-popup">
    <!-- ── 顶部操作栏 ── -->
    <div class="notif-popup__header">
      <h4 class="notif-popup__title">
        通知中心
        <span v-if="store.unreadCount > 0" class="notif-popup__count">
          {{ store.unreadCount > 99 ? '99+' : store.unreadCount }} 条未读
        </span>
      </h4>
      <el-button
        v-if="store.unreadCount > 0"
        link
        type="primary"
        size="small"
        @click="$emit('markAll')"
      >
        全部已读
      </el-button>
    </div>

    <!-- ── 分类 Tab ── -->
    <div class="notif-popup__tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="notif-popup__tab"
        :class="{ 'is-active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="tab.count > 0" class="notif-popup__tab-badge">
          {{ tab.count > 99 ? '99+' : tab.count }}
        </span>
      </button>
    </div>

    <!-- ── 通知列表 ── -->
    <div class="notif-popup__body" ref="listRef">
      <template v-if="filteredNotifications.length > 0">
        <div
          v-for="item in filteredNotifications"
          :key="item.id"
          class="notif-item"
          :class="{
            'is-unread': !item.read,
            'is-urgent': item.priority === 'urgent',
            'is-high': item.priority === 'high',
          }"
          @click="handleItemClick(item)"
        >
          <!-- 左侧图标 -->
          <div class="notif-item__icon" :style="{ background: categoryMeta(item.category).color }">
            <el-icon :size="14">
              <component :is="categoryMeta(item.category).icon" />
            </el-icon>
          </div>

          <!-- 中间内容 -->
          <div class="notif-item__body">
            <div class="notif-item__header">
              <span class="notif-item__title">{{ item.title }}</span>
              <span class="notif-item__time">{{ formatTime(item.createdAt) }}</span>
            </div>
            <p class="notif-item__text">{{ item.body }}</p>
            <div class="notif-item__meta">
              <span
                class="notif-item__priority"
                :style="{ color: priorityColor(item.priority) }"
              >
                {{ priorityLabel(item.priority) }}
              </span>
              <span class="notif-item__category">
                {{ categoryMeta(item.category).label }}
              </span>
            </div>
          </div>

          <!-- 右侧未读点 -->
          <div v-if="!item.read" class="notif-item__dot" />

          <!-- 删除按钮 -->
          <button
            class="notif-item__close"
            @click.stop="store.remove(item.id)"
            title="删除"
          >
            <el-icon :size="12"><Close /></el-icon>
          </button>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else class="notif-popup__empty">
        <el-icon :size="48" color="#c0c4cc"><Bell /></el-icon>
        <p>暂无通知</p>
      </div>
    </div>

    <!-- ── 底部操作 ── -->
    <div v-if="store.notifications.length > 0" class="notif-popup__footer">
      <el-button link size="small" type="danger" @click="handleClearAll">
        清空全部通知
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, Close } from '@element-plus/icons-vue'
import { useNotificationStore } from '@/stores/notification'
import { CATEGORY_META, PRIORITY_META } from '@/types/notification'
import type { Notification, NotificationCategory, NotificationPriority } from '@/types/notification'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

// ── Props / Emits ──
defineProps<{
  // （预留扩展）
}>()

const emit = defineEmits<{
  close: []
  markAll: []
}>()

// ── Store ──
const store = useNotificationStore()
const router = useRouter()

// ── Tab 定义 ──
const activeTab = ref<string>('all')

const tabs = computed(() => [
  { key: 'all',        label: '全部',   count: store.unreadCount },
  { key: 'alarm',      label: '告警',   count: store.unreadByCategory.alarm },
  { key: 'system',     label: '系统',   count: store.unreadByCategory.system },
  { key: 'device',     label: '设备',   count: store.unreadByCategory.device },
  { key: 'ai',         label: 'AI分析', count: store.unreadByCategory.ai },
])

// ── 筛选 ──
const filteredNotifications = computed(() => {
  let list = store.latestNotifications
  if (activeTab.value !== 'all') {
    list = list.filter((n) => n.category === activeTab.value)
  }
  return list
})

// ── 类别元数据 ──
function categoryMeta(cat: NotificationCategory) {
  return CATEGORY_META[cat] ?? CATEGORY_META.system
}

function priorityColor(pri: NotificationPriority) {
  return PRIORITY_META[pri]?.color ?? '#909399'
}

function priorityLabel(pri: NotificationPriority) {
  return PRIORITY_META[pri]?.label ?? pri
}

// ── 时间格式化 ──
function formatTime(iso: string): string {
  const d = dayjs(iso)
  const now = dayjs()
  const diffMinutes = now.diff(d, 'minute')

  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes}分钟前`

  const diffHours = now.diff(d, 'hour')
  if (diffHours < 24) return `${diffHours}小时前`

  const diffDays = now.diff(d, 'day')
  if (diffDays < 7) return `${diffDays}天前`

  return d.format('MM-DD HH:mm')
}

// ── 点击通知项 ──
function handleItemClick(item: Notification) {
  // 标记已读
  if (!item.read) {
    store.markRead(item.id)
  }

  // 跳转
  if (item.route) {
    router.push(item.route)
    emit('close')
  }
}

// ── 清空全部 ──
function handleClearAll() {
  store.clearAll()
}
</script>

<style scoped>
/* ── 容器 ── */
.notif-popup {
  display: flex;
  flex-direction: column;
  max-height: 520px;
}

/* ── 头部 ── */
.notif-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.notif-popup__title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.notif-popup__count {
  font-size: 12px;
  font-weight: 400;
  color: #F56C6C;
  background: #fef0f0;
  padding: 2px 8px;
  border-radius: 10px;
}

/* ── Tab 栏 ── */
.notif-popup__tabs {
  display: flex;
  gap: 0;
  padding: 0 12px;
  border-bottom: 1px solid #f0f0f0;
  overflow-x: auto;
}

.notif-popup__tab {
  position: relative;
  flex-shrink: 0;
  padding: 10px 14px;
  border: none;
  background: none;
  font-size: 13px;
  color: #909399;
  cursor: pointer;
  transition: color 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.notif-popup__tab:hover {
  color: #409EFF;
}

.notif-popup__tab.is-active {
  color: #409EFF;
  font-weight: 600;
}

.notif-popup__tab.is-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 14px;
  right: 14px;
  height: 2px;
  background: #409EFF;
  border-radius: 1px;
}

.notif-popup__tab-badge {
  font-size: 11px;
  background: #F56C6C;
  color: #fff;
  border-radius: 9px;
  padding: 0 6px;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
}

/* ── 列表区 ── */
.notif-popup__body {
  flex: 1;
  overflow-y: auto;
  max-height: 360px;
  padding: 4px 0;
}

/* ── 通知项 ── */
.notif-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
  border-bottom: 1px solid #fafafa;
}

.notif-item:hover {
  background: #f5f7fa;
}

.notif-item.is-unread {
  background: #f0f7ff;
}

.notif-item.is-urgent {
  background: #fef0f0;
}

.notif-item.is-urgent:hover {
  background: #fde2e2;
}

/* ── 图标 ── */
.notif-item__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  margin-top: 2px;
}

/* ── 正文 ── */
.notif-item__body {
  flex: 1;
  min-width: 0;
}

.notif-item__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.notif-item__title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notif-item.is-unread .notif-item__title {
  font-weight: 600;
}

.notif-item__time {
  font-size: 11px;
  color: #c0c4cc;
  flex-shrink: 0;
}

.notif-item__text {
  font-size: 12px;
  color: #909399;
  margin: 4px 0 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notif-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.notif-item__priority {
  font-size: 11px;
  font-weight: 500;
}

.notif-item__category {
  font-size: 11px;
  color: #c0c4cc;
  background: #f5f7fa;
  padding: 1px 6px;
  border-radius: 4px;
}

/* ── 未读点 ── */
.notif-item__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #409EFF;
  flex-shrink: 0;
  margin-top: 6px;
}

.notif-item.is-urgent .notif-item__dot {
  background: #F56C6C;
}

/* ── 删除按钮 ── */
.notif-item__close {
  position: absolute;
  top: 8px;
  right: 8px;
  border: none;
  background: none;
  color: #c0c4cc;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.notif-item:hover .notif-item__close {
  opacity: 1;
}

.notif-item__close:hover {
  color: #F56C6C;
  background: #fef0f0;
}

/* ── 空状态 ── */
.notif-popup__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: #c0c4cc;
  gap: 12px;
}

.notif-popup__empty p {
  font-size: 14px;
  margin: 0;
}

/* ── 底部 ── */
.notif-popup__footer {
  display: flex;
  justify-content: center;
  padding: 10px 0;
  border-top: 1px solid #f0f0f0;
}
</style>
