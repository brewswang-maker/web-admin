import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NotificationItem, NotificationQuery } from '@/types/notification'
import { http } from '@/api/http'

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<NotificationItem[]>([])
  const loading = ref(false)
  const popupVisible = ref(false)

  const unreadCount = computed(() => notifications.value.filter(n => n.status === 'unread').length)
  const unreadByCategory = computed(() => {
    const map: Record<string, number> = {}
    notifications.value.filter(n => n.status === 'unread').forEach(n => {
      const cat = n.type
      map[cat] = (map[cat] || 0) + 1
    })
    return map
  })
  const latestNotifications = computed(() => notifications.value.slice(0, 10))

  function openPopup() { popupVisible.value = true }
  function closePopup() { popupVisible.value = false }
  function togglePopup() { popupVisible.value = !popupVisible.value }

  function markAsRead(id: string) {
    const item = notifications.value.find(n => n.id === id)
    if (item) item.status = 'read'
  }
  function markAllAsRead() {
    notifications.value.forEach(n => { if (n.status === 'unread') n.status = 'read' })
  }
  function markRead(id: string) { markAsRead(id) }
  function markAllRead() { markAllAsRead() }

  function remove(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }
  function clearAll() {
    notifications.value = []
  }

  function pushNotification(item: NotificationItem) {
    notifications.value.unshift(item)
  }

  async function fetchNotifications(query?: NotificationQuery) {
    loading.value = true
    try {
      const { data } = await http.get('/notifications', { params: query })
      if (data?.data?.items) notifications.value = data.data.items
      else if (Array.isArray(data?.data)) notifications.value = data.data
    } catch {
      // API may not exist yet — keep current notifications
    } finally { loading.value = false }
  }

  return {
    notifications, loading, popupVisible, unreadCount, unreadByCategory, latestNotifications,
    openPopup, closePopup, togglePopup,
    markAsRead, markAllAsRead, markRead, markAllRead,
    remove, clearAll, pushNotification, fetchNotifications,
  }
})
