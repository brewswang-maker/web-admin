import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export type AppLocale = 'zh-CN' | 'en-US'

export const SUPPORTED_LOCALES: AppLocale[] = ['zh-CN', 'en-US']

export const LOCALE_LABELS: Record<AppLocale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English'
}

const STORAGE_KEY = 'shieldai_locale'

function detectInitialLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh-CN' || stored === 'en-US') {
      return stored
    }
  } catch {
    // ignore
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN'
  return nav.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detectInitialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

export function setI18nLocale(locale: AppLocale) {
  ;(i18n.global.locale as unknown as { value: AppLocale }).value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // ignore
  }
  document.documentElement.setAttribute('lang', locale)
}

export function getI18nLocale(): AppLocale {
  return (i18n.global.locale as unknown as { value: AppLocale }).value
}

export default i18n
