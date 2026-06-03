/**
 * 用户偏好设置 Pinia Store
 *
 * 负责:
 *  - 主题模式(light/dark)
 *  - 界面语言(zh-CN/en-US)
 *  - 侧边栏折叠状态
 *  - 通知偏好
 *
 * 持久化策略:
 *  1. 立即生效 → 写入 localStorage + 调用 vue-i18n/document data-theme
 *  2. 异步同步 → 后端 PUT /api/v1/user/preferences
 */

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { http } from '@/api/http'
import { setI18nLocale, getI18nLocale, type AppLocale } from '@/i18n'

export type ThemeMode = 'light' | 'dark'
export type SidebarCollapsed = boolean

export interface NotificationPrefs {
  sound: boolean
  popup: boolean
  email: boolean
}

export interface UserPreferences {
  themeMode: ThemeMode
  language: AppLocale
  sidebarCollapsed: SidebarCollapsed
  notifications: NotificationPrefs
}

const STORAGE_KEY = 'shieldai_preference'

const DEFAULT_PREFERENCES: UserPreferences = {
  themeMode: 'dark',
  language: 'zh-CN',
  sidebarCollapsed: false,
  notifications: {
    sound: true,
    popup: true,
    email: false
  }
}

function loadFromLocal(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFERENCES }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      notifications: { ...DEFAULT_PREFERENCES.notifications, ...(parsed.notifications ?? {}) }
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function saveToLocal(prefs: UserPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

function applyThemeToDocument(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else {
    root.setAttribute('data-theme', 'light')
  }
  root.classList.toggle('dark-theme', mode === 'dark')
  root.classList.toggle('light-theme', mode === 'light')
}

export const usePreferenceStore = defineStore('preference', () => {
  // ── 初始状态:从 localStorage 读,以保证首屏无白屏 ──
  const initial = loadFromLocal()

  const themeMode = ref<ThemeMode>(initial.themeMode)
  const language = ref<AppLocale>(initial.language)
  const sidebarCollapsed = ref<SidebarCollapsed>(initial.sidebarCollapsed)
  const notifications = ref<NotificationPrefs>({ ...initial.notifications })

  // 标记是否已与服务端同步过(用于判断是否覆盖本地默认值)
  const serverSynced = ref(false)
  // 同步状态
  const syncing = ref(false)
  const lastError = ref<string | null>(null)

  // ── Actions ──

  function setThemeMode(mode: ThemeMode) {
    themeMode.value = mode
    applyThemeToDocument(mode)
  }

  function toggleTheme() {
    setThemeMode(themeMode.value === 'dark' ? 'light' : 'dark')
  }

  function setLanguage(lang: AppLocale) {
    language.value = lang
    setI18nLocale(lang)
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setNotification<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    notifications.value[key] = value
  }

  /** 持久化(本地 + 远端) */
  async function persist() {
    saveToLocal(snapshot())
    await saveToServer()
  }

  function snapshot(): UserPreferences {
    return {
      themeMode: themeMode.value,
      language: language.value,
      sidebarCollapsed: sidebarCollapsed.value,
      notifications: { ...notifications.value }
    }
  }

  /** 从远端加载偏好 */
  async function loadFromServer(): Promise<void> {
    syncing.value = true
    lastError.value = null
    try {
      const res = await http.get('/user/preferences')
      const data = (res.data?.data ?? res.data) as Partial<UserPreferences> | undefined
      if (!data) return

      if (data.themeMode === 'light' || data.themeMode === 'dark') {
        themeMode.value = data.themeMode
        applyThemeToDocument(themeMode.value)
      }
      if (data.language === 'zh-CN' || data.language === 'en-US') {
        language.value = data.language
        setI18nLocale(language.value)
      }
      if (typeof data.sidebarCollapsed === 'boolean') {
        sidebarCollapsed.value = data.sidebarCollapsed
      }
      if (data.notifications) {
        notifications.value = { ...notifications.value, ...data.notifications }
      }
      serverSynced.value = true
      saveToLocal(snapshot())
    } catch (e: any) {
      lastError.value = e?.message || 'load failed'
      // 加载失败时回退到 localStorage 已生效
    } finally {
      syncing.value = false
    }
  }

  /** 保存到远端(失败不影响本地) */
  async function saveToServer(): Promise<void> {
    try {
      await http.put('/user/preferences', snapshot())
    } catch (e: any) {
      // 本地已保存,远端失败仅记录
      lastError.value = e?.message || 'save failed'
      console.warn('[preference] save to server failed:', e)
    }
  }

  // ── Watch:任意字段变化 → 自动持久化 ──
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    [themeMode, language, sidebarCollapsed, notifications],
    () => {
      saveToLocal(snapshot())
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        saveToServer()
      }, 800)
    },
    { deep: true }
  )

  // ── 启动时确保 DOM 状态一致 ──
  applyThemeToDocument(themeMode.value)
  // 同步 i18n locale(防止 i18n 初始化时与本地不一致)
  if (getI18nLocale() !== language.value) {
    setI18nLocale(language.value)
  }

  return {
    // state
    themeMode,
    language,
    sidebarCollapsed,
    notifications,
    serverSynced,
    syncing,
    lastError,
    // actions
    setThemeMode,
    toggleTheme,
    setLanguage,
    toggleSidebar,
    setNotification,
    persist,
    loadFromServer,
    saveToServer
  }
})
