export type NotificationType = 'system' | 'alarm' | 'device' | 'security' | 'update' | 'billing' | 'ai'
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical' | 'urgent'
export type NotificationStatus = 'unread' | 'read' | 'archived'
export type NotificationCategory = 'system' | 'alarm' | 'device' | 'security' | 'update' | 'billing' | 'ai'

export interface NotificationItem {
  id: string
  type: NotificationType
  priority: NotificationPriority
  status: NotificationStatus
  title: string
  content: string
  /** 通知正文（兼容字段） */
  body: string
  /** 分类标签 */
  category: NotificationCategory
  /** 是否已读 */
  read: boolean
  /** 创建时间 */
  createdAt: string
  /** 兼容旧字段 */
  timestamp: string
  source?: string
  link?: string
  /** 跳转路由 */
  route?: string
  readAt?: string
  archivedAt?: string
}
/** 兼容别名 */ export type Notification = NotificationItem

export interface NotificationQuery {
  page?: number; pageSize?: number; type?: NotificationType
  status?: NotificationStatus; priority?: NotificationPriority; keyword?: string
}

export const CATEGORY_META: Record<NotificationCategory, { label: string; color: string; icon: string }> = {
  system: { label: '系统', color: '#909399', icon: 'Setting' },
  alarm: { label: '告警', color: '#F56C6C', icon: 'Bell' },
  device: { label: '设备', color: '#409EFF', icon: 'Monitor' },
  security: { label: '安全', color: '#E6A23C', icon: 'Lock' },
  update: { label: '更新', color: '#67C23A', icon: 'Upload' },
  billing: { label: '计费', color: '#9B59B6', icon: 'Wallet' },
  ai: { label: 'AI', color: '#1ABC9C', icon: 'MagicStick' },
}

export const PRIORITY_META: Record<NotificationPriority, { label: string; color: string; tagType: string }> = {
  low: { label: '低', color: '#909399', tagType: 'info' },
  medium: { label: '中', color: '#E6A23C', tagType: 'warning' },
  high: { label: '高', color: '#F56C6C', tagType: 'danger' },
  critical: { label: '严重', color: '#FF0000', tagType: 'danger' },
  urgent: { label: '紧急', color: '#8B0000', tagType: 'danger' },
}
