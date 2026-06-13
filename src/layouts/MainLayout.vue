<template>
  <el-container class="main-layout" :class="{ 'dark-theme': prefStore.themeMode === 'dark' }">
    <!-- ===== 侧边栏 ===== -->
    <el-aside :width="isCollapsed ? '64px' : '230px'" class="sidebar" :class="{ collapsed: isCollapsed }">
      <!-- Logo -->
      <div class="logo" @click="router.push('/dashboard')">
        <img src="/favicon.svg" alt="logo" width="32" height="32" />
        <transition name="logo-fade">
          <span v-if="!isCollapsed" class="logo-text">{{ $t('menu.shieldBox') }} v7.0</span>
        </transition>
      </div>

      <!-- 导航菜单 -->
      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapsed"
        router
        background-color="transparent"
        text-color="rgba(255,255,255,0.85)"
        active-text-color="#3B82F6"
        class="sidebar-menu"
        :collapse-transition="false"
      >
        <!-- ===== 监控总览 ===== -->
        <el-menu-item-group>
          <template #title v-if="!isCollapsed">
            <span class="group-title">{{ $t('menuGroup.monitor') }}</span>
          </template>
          <el-menu-item index="/dashboard">
            <el-icon><Odometer /></el-icon>
            <template #title>{{ $t('menu.dashboard') }}</template>
          </el-menu-item>
          <el-menu-item index="/situation">
            <el-icon><DataAnalysis /></el-icon>
            <template #title>{{ $t('menu.situationScreen') }}</template>
          </el-menu-item>
        </el-menu-item-group>

        <!-- ===== 设备与监控 ===== -->
        <el-menu-item-group>
          <template #title v-if="!isCollapsed">
            <span class="group-title">{{ $t('menuGroup.device') }}</span>
          </template>
          <el-menu-item index="/devices">
            <el-icon><Monitor /></el-icon>
            <template #title>{{ $t('menu.devices') }}</template>
          </el-menu-item>
          <el-menu-item index="/live">
            <el-icon><VideoCamera /></el-icon>
            <template #title>{{ $t('menu.live') }}</template>
          </el-menu-item>
          <el-menu-item index="/alarms">
            <el-icon><Bell /></el-icon>
            <template #title>
              <span class="alarm-menu-label">{{ $t('menu.alarms') }}</span>
              <el-badge
                v-if="alarmStore.unhandledCount > 0"
                :value="alarmStore.unhandledCount > 99 ? '99+' : alarmStore.unhandledCount"
                class="menu-badge"
              />
            </template>
          </el-menu-item>
        </el-menu-item-group>

        <!-- ===== 视频与流 ===== -->
        <el-menu-item-group>
          <template #title v-if="!isCollapsed">
            <span class="group-title">{{ $t('menuGroup.video') }}</span>
          </template>
          <el-menu-item index="/channels">
            <el-icon><VideoPlay /></el-icon>
            <template #title>{{ $t('menu.channels') }}</template>
          </el-menu-item>
          <el-menu-item index="/streams">
            <el-icon><Film /></el-icon>
            <template #title>{{ $t('menu.streams') }}</template>
          </el-menu-item>
          <el-menu-item index="/recordings">
            <el-icon><VideoPause /></el-icon>
            <template #title>{{ $t('menu.recording') }}</template>
          </el-menu-item>
          <el-menu-item index="/location">
            <el-icon><Location /></el-icon>
            <template #title>{{ $t('menu.location') }}</template>
          </el-menu-item>
          <el-menu-item index="/topology">
            <el-icon><Share /></el-icon>
            <template #title>{{ $t('menu.topology') }}</template>
          </el-menu-item>
          <el-menu-item index="/gb28181">
            <el-icon><Connection /></el-icon>
            <template #title>{{ $t('menu.gb28181') }}</template>
          </el-menu-item>
          <el-menu-item index="/onvif">
            <el-icon><Camera /></el-icon>
            <template #title>{{ $t('menu.onvif') }}</template>
          </el-menu-item>
        </el-menu-item-group>

        <!-- ===== 🧩 算法与AI ===== -->
        <el-menu-item-group>
          <template #title v-if="!isCollapsed">
            <span class="group-title">{{ $t('menuGroup.algorithm') }}</span>
          </template>
          <el-menu-item index="/pipelines">
            <el-icon><SetUp /></el-icon>
            <template #title>{{ $t('menu.pipelineEditor') }}</template>
          </el-menu-item>
          <el-menu-item index="/models">
            <el-icon><Cpu /></el-icon>
            <template #title>{{ $t('menu.models') }}</template>
          </el-menu-item>
          <el-menu-item index="/ai-chat">
            <el-icon><ChatDotRound /></el-icon>
            <template #title>{{ $t('menu.aiChat') }}</template>
          </el-menu-item>
          <el-menu-item index="/statistics">
            <el-icon><TrendCharts /></el-icon>
            <template #title>{{ $t('menu.statistics') }}</template>
          </el-menu-item>
          <el-menu-item index="/federation">
            <el-icon><Connection /></el-icon>
            <template #title>{{ $t('menu.federation') }}</template>
          </el-menu-item>
          <el-menu-item index="/algorithm-store">
            <el-icon><ShoppingCart /></el-icon>
            <template #title>{{ $t('menu.algorithms') }}</template>
          </el-menu-item>
          <el-menu-item index="/face-database">
            <el-icon><User /></el-icon>
            <template #title>{{ $t('menu.face') }}</template>
          </el-menu-item>
          <el-menu-item index="/face-realtime">
            <el-icon><Aim /></el-icon>
            <template #title>{{ $t('menu.faceRealtime') }}</template>
          </el-menu-item>
        </el-menu-item-group>

        <!-- ===== ⚙️ 管理 ===== -->
        <el-menu-item-group>
          <template #title v-if="!isCollapsed">
            <span class="group-title">{{ $t('menuGroup.management') }}</span>
          </template>
          <el-menu-item index="/linkage">
            <el-icon><Connection /></el-icon>
            <template #title>{{ $t('menu.linkage') }}</template>
          </el-menu-item>
          <el-menu-item index="/projects" v-if="auth.can('projects', 'read')">
            <el-icon><FolderOpened /></el-icon>
            <template #title>{{ $t('menu.projects') }}</template>
          </el-menu-item>
          <el-menu-item index="/teams">
            <el-icon><User /></el-icon>
            <template #title>{{ $t('menu.team') }}</template>
          </el-menu-item>
          <el-menu-item index="/upgrade">
            <el-icon><Upload /></el-icon>
            <template #title>{{ $t('menu.ota') }}</template>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <template #title>{{ $t('menu.settings') }}</template>
          </el-menu-item>
        </el-menu-item-group>

        <!-- ===== 安全与集成 ===== -->
        <el-menu-item-group>
          <template #title v-if="!isCollapsed">
            <span class="group-title">{{ $t('menuGroup.security') }}</span>
          </template>
          <el-menu-item index="/audit">
            <el-icon><DocumentChecked /></el-icon>
            <template #title>{{ $t('menu.audit') }}</template>
          </el-menu-item>
          <el-menu-item index="/open-platform">
            <el-icon><Link /></el-icon>
            <template #title>{{ $t('menu.openPlatform') }}</template>
          </el-menu-item>
          <el-menu-item index="/users">
            <el-icon><User /></el-icon>
            <template #title>{{ $t('menu.user') }}</template>
          </el-menu-item>
          <el-menu-item index="/roles">
            <el-icon><Avatar /></el-icon>
            <template #title>{{ $t('menu.role') }}</template>
          </el-menu-item>
          <el-menu-item index="/permissions">
            <el-icon><Lock /></el-icon>
            <template #title>{{ $t('menu.permission') }}</template>
          </el-menu-item>
          <el-menu-item index="/billing">
            <el-icon><Wallet /></el-icon>
            <template #title>{{ $t('menu.billing') }}</template>
          </el-menu-item>
        </el-menu-item-group>
      </el-menu>

      <!-- 折叠按钮 -->
      <div class="sidebar-collapse-btn" @click="toggleCollapse">
        <el-icon :size="18">
          <DArrowLeft v-if="!isCollapsed" />
          <DArrowRight v-else />
        </el-icon>
      </div>
    </el-aside>

    <!-- ===== 主内容区 ===== -->
    <el-container class="content-container">
      <!-- 顶部导航 -->
      <el-header class="header">
        <div class="header-left">
          <!-- 全局搜索 -->
          <div class="global-search" @click="showSearch = true">
            <el-icon><Search /></el-icon>
            <span class="search-hint">{{ $t('search.hint') }}</span>
          </div>
        </div>

        <div class="header-right">
          <!-- 语言切换 -->
          <el-tooltip :content="$t('language.title')" placement="bottom">
            <el-dropdown trigger="click" @command="onLanguageChange">
              <div class="header-icon-btn">
                <el-icon :size="20"><Position /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="loc in SUPPORTED_LOCALES"
                    :key="loc"
                    :command="loc"
                    :disabled="prefStore.language === loc"
                  >
                    {{ LOCALE_LABELS[loc] }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </el-tooltip>

          <!-- 主题切换 -->
          <el-tooltip :content="themeTip" placement="bottom">
            <div class="header-icon-btn" @click="prefStore.toggleTheme()">
              <el-icon :size="20">
                <Sunny v-if="prefStore.themeMode === 'dark'" />
                <Moon v-else />
              </el-icon>
            </div>
          </el-tooltip>

          <!-- 通知铃铛 -->
          <NotificationBell />

          <!-- AI 助手快捷入口 -->
          <el-tooltip :content="$t('layout.aiAssistant')" placement="bottom">
            <div class="header-icon-btn ai-btn" @click="router.push('/ai-chat')">
              <el-icon :size="20"><Cpu /></el-icon>
            </div>
          </el-tooltip>

          <!-- 用户菜单 -->
          <el-dropdown trigger="click" @command="handleUserCommand">
            <div class="user-menu">
              <el-avatar :size="32" :icon="UserFilled" />
              <span class="username hidden-mobile">{{ auth.username || $t('layout.defaultUser') }}</span>
              <el-icon class="dropdown-icon"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>{{ $t('layout.profile') }}
                </el-dropdown-item>
                <el-dropdown-item command="settings">
                  <el-icon><Setting /></el-icon>{{ $t('layout.settings') }}
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>{{ $t('menu.logout') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 页面内容 -->
      <el-main class="main-content">
        <router-view v-slot="{ Component, route }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </router-view>
      </el-main>
    </el-container>

    <!-- ===== 全局搜索弹窗 ===== -->
    <el-dialog
      v-model="showSearch"
      :title="$t('search.title')"
      width="560px"
      :show-close="true"
      class="search-dialog"
      destroy-on-close
    >
      <el-input
        ref="searchInputRef"
        v-model="searchQuery"
        :placeholder="$t('search.placeholder')"
        size="large"
        clearable
        @keyup.enter="handleGlobalSearch"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <div class="search-results" v-if="searchQuery">
        <div v-if="searchLoading" class="search-hint-text">{{ $t('search.searching') }}</div>
        <div v-else-if="searchResults.length === 0" class="search-hint-text">{{ $t('search.noResults') }}</div>
        <div v-else class="search-list">
          <div v-for="r in searchResults" :key="r.path + r.title" class="search-result-item" @click="goToResult(r)">
            <span class="result-type">{{ r.type }}</span>
            <span class="result-title">{{ r.title }}</span>
            <span class="result-desc">{{ r.desc }}</span>
          </div>
        </div>
      </div>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import {
  Odometer, DataAnalysis, Monitor, VideoCamera, Bell, TrendCharts,
  ChatDotRound, Connection, FolderOpened, Upload, Setting,
  DocumentChecked, Link, User, Avatar, Lock, Search,
  Sunny, Moon, Cpu, UserFilled, ArrowDown, SwitchButton,
  DArrowLeft, DArrowRight, VideoPlay, Film, VideoPause, Camera, SetUp,
  Location, Share, ShoppingCart, Wallet, Position,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useAlarmStore } from '@/stores/alarm'
import { usePreferenceStore } from '@/stores/preference'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type AppLocale } from '@/i18n'
import NotificationBell from '@/components/NotificationBell.vue'
import { http } from '@/api/http'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const alarmStore = useAlarmStore()
const prefStore = usePreferenceStore()
const { t } = useI18n()

// ── 侧边栏折叠(双向同步到 prefStore) ──
const isCollapsed = computed({
  get: () => prefStore.sidebarCollapsed,
  set: (v: boolean) => {
    if (prefStore.sidebarCollapsed !== v) prefStore.sidebarCollapsed = v
  }
})

function toggleCollapse() {
  prefStore.toggleSidebar()
}

// ── 主题提示文案 ──
const themeTip = computed(() =>
  prefStore.themeMode === 'dark' ? t('layout.switchToLight') : t('layout.switchToDark')
)

// ── 语言切换 ──
function onLanguageChange(loc: AppLocale) {
  prefStore.setLanguage(loc)
}

// ── 激活菜单 ──
const activeMenu = computed(() => {
  const path = route.path
  if (path.startsWith('/devices/')) return '/devices'
  return path
})

// ── 全局搜索 ──
const showSearch = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<any>(null)
const searchResults = ref<Array<{ type: string; title: string; path: string; desc: string }>>([])
const searchLoading = ref(false)

watch(showSearch, (val) => {
  if (val) {
    nextTick(() => { searchInputRef.value?.focus() })
  } else {
    searchQuery.value = ''
    searchResults.value = []
  }
})

watch(searchQuery, async (q) => {
  if (!q.trim() || q.length < 2) { searchResults.value = []; return }
  searchLoading.value = true
  try {
    const { data } = await http.get('/api/v1/search', { params: { q: q.trim(), limit: 20 } })
    searchResults.value = data?.data || data || []
  } catch {
    // fallback: 本地菜单匹配
    const keyword = q.toLowerCase()
    const menuItems = [
      { type: t('search.page'), title: t('menu.dashboard'), path: '/dashboard', desc: t('menu.dashboard') + ' Overview' },
      { type: t('search.page'), title: t('menu.situationScreen'), path: '/situation', desc: '3D GIS' },
      { type: t('search.page'), title: t('menu.devices'), path: '/devices', desc: t('device.title') },
      { type: t('search.page'), title: t('menu.live'), path: '/live', desc: t('menu.live') },
      { type: t('search.page'), title: t('menu.alarms'), path: '/alarms', desc: t('alarm.title') },
      { type: t('search.page'), title: t('menu.pipelineEditor'), path: '/pipelines', desc: t('menu.pipeline') },
      { type: t('search.page'), title: t('menu.models'), path: '/models', desc: t('menu.models') },
      { type: t('search.page'), title: t('menu.aiChat'), path: '/ai-chat', desc: t('menu.aiChat') },
      { type: t('search.page'), title: t('menu.location'), path: '/location', desc: t('menu.location') },
      { type: t('search.page'), title: t('menu.topology'), path: '/topology', desc: t('menu.topology') },
      { type: t('search.page'), title: t('menu.algorithms'), path: '/algorithm-store', desc: t('menu.algorithms') },
      { type: t('search.page'), title: t('menu.billing'), path: '/billing', desc: t('menu.billing') },
      { type: t('search.page'), title: t('menu.linkage'), path: '/linkage', desc: t('menu.linkage') },
      { type: t('search.page'), title: t('menu.gb28181'), path: '/gb28181', desc: t('menu.gb28181') },
      { type: t('search.page'), title: t('menu.onvif'), path: '/onvif', desc: t('menu.onvif') },
      { type: t('search.page'), title: t('menu.streams'), path: '/streams', desc: t('menu.streams') },
      { type: t('search.page'), title: t('menu.recording'), path: '/recordings', desc: t('menu.recording') },
      { type: t('search.page'), title: t('menu.statistics'), path: '/statistics', desc: t('menu.statistics') },
      { type: t('search.page'), title: t('menu.settings'), path: '/settings', desc: t('menu.settings') },
      { type: t('search.page'), title: t('menu.user'), path: '/users', desc: t('menu.user') },
      { type: t('search.page'), title: t('menu.role'), path: '/roles', desc: t('menu.role') },
      { type: t('search.page'), title: t('menu.audit'), path: '/audit', desc: t('menu.audit') },
      { type: t('search.page'), title: t('menu.openPlatform'), path: '/open-platform', desc: t('menu.openPlatform') },
    ]
    searchResults.value = menuItems.filter(m =>
      m.title.toLowerCase().includes(keyword) || m.desc.toLowerCase().includes(keyword) || m.path.includes(keyword)
    )
  } finally {
    searchLoading.value = false
  }
})

function handleGlobalSearch() {
  if (searchResults.value.length > 0) {
    router.push(searchResults.value[0].path)
    showSearch.value = false
  }
}

function goToResult(r: { path: string }) {
  router.push(r.path)
  showSearch.value = false
}

// ── 键盘快捷键 ──
function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    showSearch.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  // 初始化未处理告警数，驱动侧边栏徽章
  alarmStore.fetchUnhandledCount().catch(() => {})
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// ── 用户菜单 ──
function handleUserCommand(command: string) {
  switch (command) {
    case 'profile':
      router.push('/settings')
      break
    case 'settings':
      router.push('/settings')
      break
    case 'logout':
      ElMessageBox.confirm(t('logout.confirm'), t('logout.title'), {
        confirmButtonText: t('logout.confirmBtn'),
        cancelButtonText: t('logout.cancelBtn'),
        type: 'warning',
      }).then(() => {
        auth.logout?.()
        router.push('/login')
      }).catch(() => {})
      break
  }
}
</script>

<style scoped>
/* ============================================================
 * MainLayout — 主布局 v6.0 暗色主题优先
 * ============================================================ */
.main-layout {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
}

/* ── 侧边栏 ── */
.sidebar {
  background: var(--app-sidebar-bg, #0F1419);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width var(--transition-normal, 0.2s ease);
  position: relative;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.sidebar.collapsed {
  width: 64px;
}

/* Logo */
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.logo img {
  flex-shrink: 0;
}

.logo-text {
  font-size: 16px;
  font-weight: var(--font-bold, 700);
  color: #FFFFFF;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.logo-fade-enter-active,
.logo-fade-leave-active {
  transition: opacity 0.15s ease;
}
.logo-fade-enter-from,
.logo-fade-leave-to {
  opacity: 0;
}

/* 菜单 */
.sidebar-menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: none;
  padding: 8px 0;
}

.sidebar-menu :deep(.el-menu-item-group__title) {
  padding: 12px 20px 4px;
}

.group-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: var(--font-semibold, 600);
}

.sidebar-menu :deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  margin: 2px 8px;
  border-radius: 8px;
  font-size: 14px;
  transition: all var(--transition-fast, 0.15s ease);
}

.sidebar-menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.08) !important;
  color: rgba(255, 255, 255, 0.95);
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  background: rgba(59, 130, 246, 0.15);
  color: var(--app-sidebar-active, #3B82F6) !important;
  font-weight: var(--font-medium, 500);
}

.sidebar-menu :deep(.el-menu-item .el-icon) {
  font-size: 18px;
}

.alarm-menu-label {
  display: inline;
}

.menu-badge {
  margin-left: 8px;
  vertical-align: middle;
}

.menu-badge :deep(.el-badge__content) {
  font-size: 10px;
  transform: none;
  position: relative;
  top: auto;
  right: auto;
}

/* 折叠按钮 */
.sidebar-collapse-btn {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  transition: all var(--transition-fast, 0.15s ease);
  flex-shrink: 0;
}

.sidebar-collapse-btn:hover {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.03);
}

.main-layout:not(.dark-theme) .sidebar {
  background: var(--app-sidebar-bg, #001529);
}

.main-layout:not(.dark-theme) .sidebar .logo-text {
  color: #FFFFFF;
}

.main-layout:not(.dark-theme) .sidebar .group-title {
  color: rgba(255, 255, 255, 0.45);
}

.main-layout:not(.dark-theme) .sidebar .sidebar-collapse-btn {
  color: rgba(255, 255, 255, 0.45);
}

.main-layout:not(.dark-theme) .sidebar .sidebar-collapse-btn:hover {
  color: rgba(255, 255, 255, 0.85);
}

.main-layout.dark-theme .sidebar {
  background: var(--app-sidebar-bg, #0F1419);
}

/* ── 内容容器 ── */
.content-container {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-bg);
}

/* ── 顶部导航 ── */
.header {
  height: var(--header-height, 56px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--app-header-bg, #1A1D23);
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
  z-index: var(--z-header);
}

.header-left {
  display: flex;
  align-items: center;
}

.global-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-lg, 8px);
  cursor: pointer;
  color: var(--app-text-secondary);
  font-size: 13px;
  transition: all var(--transition-fast, 0.15s ease);
  min-width: 200px;
}

.global-search:hover {
  border-color: var(--color-primary-400);
  color: var(--app-text-primary);
}

.search-hint {
  margin-left: auto;
  font-size: 11px;
  padding: 1px 6px;
  background: var(--app-surface-hover);
  border-radius: 4px;
  font-family: var(--font-mono);
  color: var(--app-text-disabled);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  color: var(--app-text-secondary);
  transition: all var(--transition-fast, 0.15s ease);
}

.header-icon-btn:hover {
  background: var(--app-surface-hover);
  color: var(--app-text-primary);
}

.ai-btn:hover {
  color: var(--color-ai);
}

/* 用户菜单 */
.user-menu {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 4px;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.user-menu:hover {
  background: var(--app-surface-hover);
}

.username {
  font-size: 13px;
  color: var(--app-text-primary);
  font-weight: var(--font-medium, 500);
}

.dropdown-icon {
  font-size: 12px;
  color: var(--app-text-secondary);
}

/* ── 主内容区域 ── */
.main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
  background: var(--app-bg);
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

/* ── 页面过渡动画 ── */
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
  transform: translateY(-4px);
}

/* ── 搜索弹窗 ── */
.search-dialog :deep(.el-dialog__header) {
  margin: 0;
  padding: 20px 24px 0;
}

.search-dialog :deep(.el-dialog__body) {
  padding: 16px 24px 24px;
}

.search-results {
  margin-top: 16px;
  min-height: 120px;
}

.search-hint-text {
  font-size: 13px;
  color: var(--app-text-disabled);
  text-align: center;
  padding: 40px 0;
}

.search-list { max-height: 320px; overflow-y: auto; }
.search-result-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 6px; cursor: pointer;
  transition: background 0.15s;
}
.search-result-item:hover { background: var(--app-surface-hover); }
.result-type {
  font-size: 10px; padding: 2px 6px; border-radius: 3px;
  background: rgba(26,115,232,0.15); color: #1A73E8; text-transform: uppercase;
}
.result-title { font-size: 13px; color: var(--app-text-primary); font-weight: 500; }
.result-desc { font-size: 11px; color: var(--app-text-secondary); margin-left: auto; }

/* ── 响应式 ── */
@media (max-width: 768px) {
  .hidden-mobile {
    display: none;
  }

  .global-search {
    min-width: 0;
    width: 36px;
    justify-content: center;
    padding: 6px;
  }

  .search-hint {
    display: none;
  }
}
</style>
