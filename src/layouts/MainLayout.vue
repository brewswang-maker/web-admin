<template>
  <el-container class="main-layout" :class="{ 'dark-theme': prefStore.themeMode === 'dark' }">
    <!-- ===== 顶部导航 ===== -->
    <el-header class="header">
      <button class="logo" type="button" aria-label="ShieldAI 首页" @click="router.push('/situation')">
        <img :src="logoUrl" alt="ShieldAI" height="48" />
        <span class="logo-text">v1.0</span>
      </button>

      <div class="header-left">
        <div class="primary-nav-wrap">
          <!-- [布局优化] 一级导航溢出时显示滚动箭头，避免"平台管理"等尾部菜单被截断丢失 -->
          <button
            v-if="navCanLeft"
            type="button"
            class="nav-scroll-btn nav-scroll-left"
            aria-label="向左滚动主导航"
            @click="scrollPrimaryNav(-1)"
          >
            <el-icon><DArrowLeft /></el-icon>
          </button>
          <nav
            ref="primaryNavRef"
            class="primary-nav"
            aria-label="主导航"
            @scroll.passive="updateNavOverflow"
          >
            <button
              v-for="item in primaryMenus"
              :key="item.key"
              type="button"
              class="primary-nav-item"
              :class="{ 'is-active': item.key === activePrimaryKey }"
              :aria-current="item.key === activePrimaryKey ? 'page' : undefined"
              @click="selectPrimary(item.key)"
            >
              {{ item.label }}
              <span class="line" aria-hidden="true">|</span>
            </button>
          </nav>
          <button
            v-if="navCanRight"
            type="button"
            class="nav-scroll-btn nav-scroll-right"
            aria-label="向右滚动主导航"
            @click="scrollPrimaryNav(1)"
          >
            <el-icon><DArrowRight /></el-icon>
          </button>
        </div>
        <!-- <div class="global-search" @click="showSearch = true">
          <el-icon><Search /></el-icon>
          <span class="search-hint">{{ $t('search.hint') }}</span>
        </div> -->
      </div>

      <div class="header-right">
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

        <el-tooltip :content="themeTip" placement="bottom">
          <div class="header-icon-btn" @click="prefStore.toggleTheme()">
            <el-icon :size="20">
              <Sunny v-if="prefStore.themeMode === 'dark'" />
              <Moon v-else />
            </el-icon>
          </div>
        </el-tooltip>

        <NotificationBell />

        <el-tooltip :content="$t('layout.aiAssistant')" placement="bottom">
          <div class="header-icon-btn ai-btn" @click="router.push('/ai-chat')">
            <el-icon :size="20"><Cpu /></el-icon>
          </div>
        </el-tooltip>

        <el-dropdown trigger="click" @command="handleUserCommand">
          <div class="user-menu">
            <el-avatar :size="32" :src="userAvatarUrl" />
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

    <el-container class="workspace">
    <!-- ===== 侧边栏 ===== -->
    <el-aside
      v-if="showSidebar"
      :width="isCollapsed ? '64px' : '245px'"
      class="sidebar"
      :class="{ collapsed: isCollapsed }"
    >
      <!-- 导航菜单 -->
      <!-- [场景菜单 2026-09-16] 普通组 (home/location/video/alarm/ai/platform) + 单场景账号沿用 el-menu-item-group (上一轮 2ac8cd6 已落地的单场景账号侧边栏子菜单化);
           admin 多场景组 (scenarios) 用 .scenario-menu + 点击展开内联 tabs (取代之前的 hover-flyout, 与单场景账号体感一致: tabs 一眼可见) -->
      <el-menu
        v-if="!isMultiScenariosGroup"
        class="sidebar-menu"
        :default-active="displayedActiveMenu"
        :collapse="isCollapsed"
        background-color="transparent"
        :text-color="prefStore.themeMode === 'dark' ? '#AADDFF' : '#1F2937'"
        :active-text-color="prefStore.themeMode === 'dark' ? '#60A5FA' : '#1890FF'"
        :collapse-transition="false"
        @select="handleSidebarSelect"
      >
        <el-menu-item-group>
          <template #title>
            <span class="group-title">
              <span v-if="!isCollapsed">{{ activePrimaryMenu.label }}</span>
            </span>
          </template>
          <el-menu-item v-for="item in activePrimaryMenu.items" :key="item.path" :index="item.path" :class="{ 'role-menu-item': item.path === '/roles' }">
            <i v-if="item.iconFont" :class="['iconfont1', 'sidebar-iconfont', item.iconFont]" aria-hidden="true"></i>
            <el-icon v-else><component :is="item.icon" /></el-icon>
            <template #title>
              <span v-if="item.path === '/alarms'" class="alarm-menu-label">{{ item.label }}</span>
              <span v-else>{{ item.label }}</span>
              <el-badge
                v-if="item.path === '/alarms' && alarmStore.unhandledCount > 0"
                :value="alarmStore.unhandledCount > 99 ? '99+' : alarmStore.unhandledCount"
                class="menu-badge"
              />
            </template>
          </el-menu-item>
        </el-menu-item-group>
      </el-menu>

      <!-- [场景菜单 2026-09-16] admin 多场景组: 6 场景入口 + 点击展开内联 tabs (无 flyout, 无 hover 延迟) -->
      <div v-else class="sidebar-menu scenario-menu">
        <div class="scenario-group-title">
          <span v-if="!isCollapsed">{{ activePrimaryMenu.label }}</span>
        </div>
        <div v-for="entry in displayedScenarioEntries" :key="entry.key" class="scenario-entry-block">
          <div
            class="scenario-entry"
            :class="{
              'is-current': isCurrentScenario(entry),
              'is-expanded': expandedScenarioKey === entry.key
            }"
            @click="onScenarioTriggerClick(entry)"
          >
            <el-icon><component :is="entry.icon" /></el-icon>
            <span v-if="!isCollapsed" class="scenario-entry-label">{{ entry.label }}</span>
            <el-icon
              v-if="!isCollapsed && entry.scenario.tabs.length > 0"
              class="scenario-entry-caret"
            >
              <CaretTop v-if="expandedScenarioKey === entry.key" />
              <CaretBottom v-else />
            </el-icon>
          </div>
          <!-- 展开的 tabs 纵向列表 (内联, 无浮层) -->
          <div
            v-if="!isCollapsed && expandedScenarioKey === entry.key"
            class="scenario-tabs"
          >
            <button
              v-for="tab in entry.scenario.tabs"
              :key="tab.path"
              type="button"
              class="scenario-tab"
              :class="{ 'is-active': route.path === tab.path || route.path.startsWith(`${tab.path}/`) }"
              @click="navigateToMenu(tab.path)"
            >
              <el-icon><component :is="tab.icon" /></el-icon>
              <span>{{ tab.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Legacy groups remain in the template as a compatibility fallback, but are not rendered. -->
      <el-menu
        v-if="false"
        class="sidebar-menu legacy-sidebar-menu"
        :default-active="activeMenu"
        :collapse="isCollapsed"
        router
        background-color="transparent"
        :text-color="prefStore.themeMode === 'dark' ? '#AADDFF' : '#1F2937'"
        :active-text-color="prefStore.themeMode === 'dark' ? '#60A5FA' : '#1890FF'"
        :collapse-transition="false"
      >
        <!-- ===== 监控总览 ===== -->
        <el-menu-item-group>
          <template #title v-if="!isCollapsed">
            <span class="group-title">{{ $t('menuGroup.monitor') }}</span>
          </template>
          <el-menu-item index="/situation">
            <el-icon><DataAnalysis /></el-icon>
            <template #title>{{ $t('menu.situationScreen') }}</template>
          </el-menu-item>
          <el-menu-item index="/dashboard">
            <el-icon><Odometer /></el-icon>
            <template #title>{{ $t('menu.dashboard') }}</template>
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
      <el-header v-if="false" class="header">
        <div class="header-left">
          <nav class="primary-nav" aria-label="主导航">
            <button
              v-for="item in primaryMenus"
              :key="item.key"
              type="button"
              class="primary-nav-item"
              :class="{ 'is-active': item.key === activePrimaryKey }"
              :aria-current="item.key === activePrimaryKey ? 'page' : undefined"
              @click="selectPrimary(item.key)"
            >
              {{ item.label }}
            </button>
          </nav>
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
              <el-avatar :size="32" :src="userAvatarUrl" />
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

      <!-- [场景菜单 2026-09-16] 场景子页顶部页签 (admin 多场景组) 已移除: 现在侧栏内联 tabs 负贵导航, 不再重复 -->

      <!-- 页面内容 -->
      <el-main
        v-loading="routeLoading"
        class="main-content"
        element-loading-background="rgba(3, 43, 104, 0.18)"
      >
        <!-- [FIX 2026-07-14] 移除 transition mode="out-in" — SituationScreen 卸载时
             three.js/echarts/flv.js 的重量级清理干扰 transitionend 监听，导致
             out-in 模式下 leave 完成后 enter 永不触发，router-view 渲染空注释 → 白屏。
             App.vue 已有顶层路由过渡动画，内层无需重复。 -->
        <router-view v-slot="{ Component, route }">
          <component :is="Component" :key="route.fullPath" />
        </router-view>
      </el-main>
    </el-container>
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick, type Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import {
  Odometer, DataAnalysis, Monitor, VideoCamera, Bell, TrendCharts,
  ChatDotRound, Connection, FolderOpened, Upload, Setting, List,
  DocumentChecked, Link, User, Avatar, Lock, Search,
  Sunny, Moon, Cpu, ArrowDown, SwitchButton,
  DArrowLeft, DArrowRight, VideoPlay, Film, VideoPause, Camera, SetUp,
  Location, Share, ShoppingCart, Wallet, Position, Aim, MapLocation,
  School, Warning, Basketball, Clock, DataBoard, Box, Histogram,
  // [加油站方案 2026-08-30] 一级菜单加油站 (T6 硬红线 + EHS 闭环)
  TakeawayBox, MagicStick,
  Files,   // [vp9 2026-09-01] 设备分组菜单
  OfficeBuilding, // [UI-5 2026-09-10] 组织架构管理菜单
  // [场景菜单 2026-09-16] admin 多场景组展开收起指示器
  CaretBottom, CaretTop,
} from '@element-plus/icons-vue'
import logoUrl from '@/assets/logo.png'
import userAvatarUrl from '@/assets/photo2.jpg'
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

type PrimaryMenuKey = 'home' | 'location' | 'video' | 'alarm' | 'ai' | 'scenarios' | 'screening' | 'school' | 'gas-station' | 'large-event' | 'hotel-unattended' | 'video-perimeter' | 'platform'
type SidebarItem = {
  path: string
  label: string
  icon: Component
  iconFont?: string
  // [场景账号 2026-08-31] 可选角色限制: 声明后仅与用户角色有交集才可见 (admin 恒通过)
  roles?: string[]
}
type PrimaryMenu = {
  key: PrimaryMenuKey
  label: string
  items: SidebarItem[]
  roles?: string[]
}

// [场景菜单重构 2026-09-15] 6 场景数据源: 原 6 个独立一级菜单收敛为「应用场景」组。
//   tabs = 原一级菜单 items 原样迁入 (内容区顶部 Tab 数据源, 路由 path 全部不变);
//   Tab 文案沿用现有 menu.* 键; entryKey 为「应用场景」组下入口的 menuSecondary 键。
type ScenarioDef = {
  key: PrimaryMenuKey
  entryKey: 'smartPerimeter' | 'unattended' | 'smartGasStation' | 'smartCampus' | 'smartScreening' | 'largeEvent'
  prefix: string
  roles: string[]
  tabs: SidebarItem[]
}
const scenarioMenus = computed<ScenarioDef[]>(() => [
  {
    // [视频周界 2026-08-31 vp] 跨行业通用能力场景; 普通用户可见保持不变
    //   (admin/user/viewer), 场景周界账号 scenario_perimeter 追加
    key: 'video-perimeter',
    entryKey: 'smartPerimeter',
    prefix: '/video-perimeter',
    roles: ['admin', 'user', 'viewer', 'scenario_perimeter'],
    tabs: [
      { path: '/video-perimeter/overview', label: t('menu.perimeterOverview'), icon: School },
      { path: '/video-perimeter/events', label: t('menu.perimeterEvents'), icon: Bell },
      { path: '/video-perimeter/packs', label: t('menu.perimeterPacks'), icon: FolderOpened },
      { path: '/video-perimeter/rules', label: t('menu.perimeterRules'), icon: List },
    ],
  },
  {
    // [酒店员工无人值守 2026-08-30 t8f] 方案 §5.7 四视图
    key: 'hotel-unattended',
    entryKey: 'unattended',
    prefix: '/hotel-unattended',
    roles: ['scenario_hotel'],
    tabs: [
      { path: '/hotel-unattended/overview', label: t('menu.hotelOverview'), icon: School },
      { path: '/hotel-unattended/corridor-events', label: t('menu.hotelCorridorEvents'), icon: Bell },
      { path: '/hotel-unattended/scene-packs', label: t('menu.hotelPacks'), icon: FolderOpened },
      { path: '/hotel-unattended/rules', label: t('menu.hotelRules'), icon: List },
    ],
  },
  {
    // [加油站方案 2026-08-30] 设计: docs/plans/加油站整体解决方案设计_v1.0.md §4
    key: 'gas-station',
    entryKey: 'smartGasStation',
    prefix: '/gas-station',
    roles: ['scenario_gas_station'],
    tabs: [
      { path: '/gas-station/overview',    label: t('menu.gasStationOverview'),    icon: School },
      { path: '/gas-station/fueling',     label: t('menu.gasStationFueling'),     icon: TakeawayBox },
      { path: '/gas-station/unloading',   label: t('menu.gasStationUnloading'),   icon: MagicStick },
      { path: '/gas-station/perimeter',   label: t('menu.gasStationPerimeter'),   icon: Warning },
      { path: '/gas-station/tank',        label: t('menu.gasStationTank'),        icon: Histogram },
      { path: '/gas-station/dashboard',   label: t('menu.gasStationDashboard'),   icon: DataBoard },
      { path: '/gas-station/gas3d',       label: t('menu.gasStationGas3D'),       icon: MapLocation },
      { path: '/gas-station/scene-packs', label: t('menu.gasStationScenePacks'),  icon: Box },
      { path: '/gas-station/rules',       label: t('menu.gasStationRules'),       icon: List },
      { path: '/gas-station/events',      label: '加油站事件', icon: Bell },
    ],
  },
  {
    // [校园方案 2026-08-30] 9 子模块 + packs/rules/events
    key: 'school',
    entryKey: 'smartCampus',
    prefix: '/school',
    roles: ['scenario_school'],
    tabs: [
      { path: '/school/overview', label: t('menu.schoolOverview'), icon: School },
      { path: '/school/access', label: t('menu.schoolAccess'), icon: Lock },
      { path: '/school/perimeter', label: t('menu.schoolPerimeter'), icon: Warning },
      { path: '/school/behavior', label: t('menu.schoolBehavior'), icon: Basketball },
      { path: '/school/attendance', label: t('menu.schoolAttendance'), icon: Clock },
      { path: '/school/visitor', label: t('menu.schoolVisitor'), icon: User },
      { path: '/school/security', label: t('menu.campusSecurity'), icon: Aim },
      { path: '/school/dashboard', label: t('menu.campusDashboard'), icon: DataBoard },
      { path: '/school/campus3d', label: t('menu.campus3d'), icon: MapLocation },
      { path: '/school/scene-packs', label: t('menu.schoolScenePacks'), icon: Box },
      { path: '/school/rules', label: t('menu.schoolRules'), icon: List },
      { path: '/school/events', label: '校园事件', icon: Bell },
    ],
  },
  {
    key: 'screening',
    entryKey: 'smartScreening',
    prefix: '/screening',
    roles: ['scenario_screening'],
    tabs: [
      { path: '/screening/overview', label: t('menu.screeningOverview'), icon: School },
      { path: '/screening/channel-order', label: t('menu.screeningChannelOrder'), icon: Connection },
      { path: '/screening/personal-item', label: t('menu.screeningPersonalItem'), icon: ShoppingCart },
      { path: '/screening/xray', label: t('menu.screeningXray'), icon: Aim },
      { path: '/screening/rules', label: t('menu.screeningRules'), icon: DocumentChecked },
      // [安检对标优化 2026-08-30] 安检专属事件规则列表入口
      { path: '/screening/rule-manager', label: t('menu.screeningRuleManager'), icon: Setting },
      // [UI-4b 2026-09-10] 安检事件列表 (SSOT scene=security_screening)
      { path: '/screening/events', label: '安检事件', icon: Bell },
    ],
  },
  {
    key: 'large-event',
    entryKey: 'largeEvent',
    prefix: '/large-event',
    roles: ['scenario_large_event'],
    tabs: [
      { path: '/large-event/overview', label: t('menu.largeEventOverview'), icon: School },
      { path: '/large-event/density', label: t('menu.largeEventDensity'), icon: Position },
      { path: '/large-event/events', label: t('menu.largeEventEvents'), icon: Bell },
      { path: '/large-event/scene-packs', label: t('menu.largeEventPacks'), icon: FolderOpened },
      { path: '/large-event/rules', label: t('menu.largeEventRules'), icon: List },
    ],
  },
])

// [场景账号 2026-08-31] 菜单角色过滤: 未声明 roles 恒可见; admin 恒通过;
//   声明后要求与当前用户角色有交集 (场景用户 scenario_* 仅见本场景组)
function matchMenuRoles(roles?: string[]): boolean {
  if (!roles || roles.length === 0) return true
  if (auth.roles.includes('admin')) return true
  return roles.some(role => auth.roles.includes(role))
}

const primaryMenus = computed<PrimaryMenu[]>(() => {
  // 显式注解: 中间 filter/map 链需完整 PrimaryMenu 类型 (匿名推断会丢失可选 roles)
  const menus: PrimaryMenu[] = [
  {
    key: 'home',
    label: t('menuPrimary.home'),
    items: [{ path: '/situation', label: t('menu.situationScreen'), icon: DataAnalysis }],
  },
  {
    key: 'location',
    label: t('menuPrimary.location'),
    items: [{ path: '/location', label: t('menu.location'), icon: Location }],
  },
  {
    key: 'video',
    label: t('menuPrimary.video'),
    items: [
      { path: '/live', label: t('menu.live'), icon: VideoCamera },
      { path: '/channels', label: t('menu.channels'), icon: VideoPlay },
      { path: '/streams', label: t('menu.streams'), icon: Film },
      { path: '/recordings', label: t('menu.recording'), icon: VideoPause },
      { path: '/gb28181', label: t('menu.gb28181'), icon: Connection },
      { path: '/onvif', label: t('menu.onvif'), icon: Camera },
    ],
  },
  {
    key: 'alarm',
    label: t('menuPrimary.alarm'),
    items: [{ path: '/alarms', label: t('menu.alarms'), icon: Bell }],
  },
  {
    // [场景账号 2026-08-31] AI 智能组 admin 专属 (与组内 /algo-config 过滤对齐)
    key: 'ai',
    label: t('menuPrimary.ai'),
    roles: ['admin'],
    items: [
      { path: '/dashboard', label: t('menu.dashboard'), icon: Odometer },
      { path: '/pipelines', label: t('menu.pipelineEditor'), icon: SetUp },
      // [ADD 2026-08-28] 算法查看入口: 路由 /algo-config 早已存在但未挂菜单,
      //   仅 admin 可见 (与路由 meta.roles: ['admin'] 对齐)
      // [algo-view-readonly 2026-09-12] 更名「算法配置→算法查看」: 页面全面只读化
      //   (编辑/开关/删除全部下线, 全部绘制收敛到事件规则), 菜单标签随 i18n 更新
      { path: '/algo-config', label: t('menu.algoConfig'), icon: SetUp },
      // [FLOOR-MAP 2026-09-03] 平面图入口: /maps 三层联动·管理层 (admin 专属,
      //   与路由 meta.roles: ['admin'] 对齐; 挂 ai 组照 algo-config 写法)
      { path: '/maps', label: t('menu.floorMap'), icon: MapLocation },
      { path: '/models', label: t('menu.models'), icon: Cpu },
      { path: '/ai-chat', label: t('menu.aiChat'), icon: ChatDotRound },
      { path: '/statistics', label: t('menu.statistics'), icon: TrendCharts, iconFont: 'icon1-jinritongji' },
      { path: '/federation', label: t('menu.federation'), icon: Connection },
      { path: '/algorithm-store', label: t('menu.algorithms'), icon: ShoppingCart },
      { path: '/face-database', label: t('menu.face'), icon: User },
      { path: '/face-realtime', label: t('menu.faceRealtime'), icon: Aim },
      // [P0-B 2026-08-30] 智能检索三合一 (P4-E 混合/以文搜图/以图搜图)
      { path: '/retrieval', label: t('menu.retrieval'), icon: Search },
    ].filter(item => item.path !== '/algo-config' || auth.hasRole('admin')),
  },
  {
    key: 'platform',
    label: t('menuPrimary.platform'),
    items: [
      // [场景账号 2026-08-31] devices/topology/linkage/projects 全员可见 (守卫等效控制,
      //   projects 仍叠加既有 auth.can); 其余 admin-only 项标 roles
      // [vp9-fix 2026-09-02] 设备分组菜单项必须加在此 primaryMenus 数据源
      //   (首次误加到 v-if="false" 的 legacy 兼容菜单致不可见)
      { path: '/devices', label: t('menu.devices'), icon: Monitor },
      { path: '/security-areas', label: t('menu.securityAreas'), icon: Files },
      // [UI-5 2026-09-10] 组织架构管理 (OrgStore 后端已建, 本轮前端 UI 落地)
      { path: '/org-management', label: '组织架构', icon: OfficeBuilding, roles: ['admin'] },
      { path: '/scene-management', label: '3D场景管理', icon: MapLocation, roles: ['admin'] },
      { path: '/topology', label: t('menu.topology'), icon: Share },
      { path: '/linkage', label: t('menu.linkage'), icon: Connection },
      { path: '/projects', label: t('menu.projects'), icon: FolderOpened },
      { path: '/teams', label: t('menu.team'), icon: User, roles: ['admin'] },
      { path: '/upgrade', label: t('menu.ota'), icon: Upload, roles: ['admin'] },
      { path: '/settings', label: t('menu.settings'), icon: Setting, roles: ['admin'] },
      { path: '/audit', label: t('menu.audit'), icon: DocumentChecked, roles: ['admin'] },
      { path: '/open-platform', label: t('menu.openPlatform'), icon: Link, roles: ['admin'] },
      { path: '/users', label: t('menu.user'), icon: User, roles: ['admin'] },
      { path: '/roles', label: t('menu.role'), icon: Avatar, iconFont: 'icon1-jiaoseguanli', roles: ['admin'] },
      { path: '/permissions', label: t('menu.permission'), icon: Lock, roles: ['admin'] },
      { path: '/billing', label: t('menu.billing'), icon: Wallet, roles: ['admin'] },
    ].filter(item => item.path !== '/projects' || auth.can('projects', 'read')),
  },
  ]

  // [场景菜单重构 2026-09-15] 「应用场景」组拼装: 多场景用户 (admin 等) 显示组 +
  //   侧边栏场景入口 (按任务书顺序); 单场景用户 (仅持一个 scenario_*;
  //   普通 user/viewer 仅周界可见) 场景一级菜单 items = 该场景全部 tabs
  //   (子菜单左侧纵向展示, 体验与 admin 二级一致; 顶部 Tab 对单场景账号隐藏);
  //   无任何场景权限不插入。插入位置: 'ai' 之后、'platform' 之前。
  const visibleScenarios = scenarioMenus.value.filter(s => matchMenuRoles(s.roles))
  if (visibleScenarios.length > 0) {
    const insertAt = Math.max(0, menus.findIndex(m => m.key === 'ai') + 1)
    if (visibleScenarios.length > 1) {
      menus.splice(insertAt, 0, {
        key: 'scenarios',
        label: t('menuPrimary.scenarios'),
        items: visibleScenarios.map(s => ({
          path: s.tabs[0].path,
          label: t(`menuSecondary.${s.entryKey}`),
          icon: s.tabs[0].icon,
        })),
      })
    } else {
      // [SIMPLE-SC-SIDEBAR 2026-09-15] 单场景账号取消 entryPath 直达:
      //   一级 key/label 沿用场景 key/文案, items = 场景全部 tabs (纵向子菜单);
      //   路由 path 不变 (历史链接/收藏不受影响)
      const only = visibleScenarios[0]
      menus.splice(insertAt, 0, {
        key: only.key,
        label: t(`menuSecondary.${only.entryKey}`),
        items: only.tabs.map(tab => ({ ...tab })),
      })
    }
  }
  return menus
    .filter(menu => matchMenuRoles(menu.roles))
    .map(menu => ({ ...menu, items: menu.items.filter(item => matchMenuRoles(item.roles)) }))
    .filter(menu => menu.items.length > 0)
})

const activePrimaryKey = ref<PrimaryMenuKey>('home')
const activePrimaryMenu = computed(() =>
  primaryMenus.value.find(item => item.key === activePrimaryKey.value) ?? primaryMenus.value[0]
)
// [SIMPLE-SC-SIDEBAR 2026-09-15] 单场景账号场景页 items = 全部子菜单 (非空) →
//   侧边栏正常展示; home 页仍隐藏侧边栏
const showSidebar = computed(() =>
  activePrimaryKey.value !== 'home' && (activePrimaryMenu.value?.items.length ?? 0) > 0
)
// [场景 Tab 2026-09-15] 当前路由命中的场景 (内容区顶部页签数据源)
const activeScenario = computed(() =>
  scenarioMenus.value.find(s => route.path === s.prefix || route.path.startsWith(`${s.prefix}/`))
)
// [SIMPLE-SC-SIDEBAR 2026-09-15] 单场景账号 (仅持一个可见场景): 子菜单在侧边栏
//   纵向展示, 顶部 Tab 隐藏; admin (多场景) 保持现状 Tab 交互
const isSingleScenarioUser = computed(() =>
  scenarioMenus.value.filter(s => matchMenuRoles(s.roles)).length === 1
)

// [场景菜单 2026-09-16] admin 多场景组: 侧栏 6 入口 + 点击展开内联 tabs (取代之前的 hover-flyout)。
//   单场景账号仍走 primaryMenus + el-menu-item 路径 (上一轮 2ac8cd6 设计的 tabs 侧边栏子菜单化)。
//   路由 path / menu.* / menuPrimary.* / menuSecondary.* 全部不变。
const isMultiScenariosGroup = computed(() => activePrimaryKey.value === 'scenarios')
const activeScenarioMenu = computed(() => {
  const k = activePrimaryKey.value
  return scenarioMenus.value.find(s => matchMenuRoles(s.roles) && s.key === k)
})
const isActivePrimaryScenario = computed(() => isMultiScenariosGroup.value || !!activeScenarioMenu.value)
// [场景菜单 2026-09-16] 哪些场景在侧栏可见 (供 admin 6 入口拼装; 单场景账号走 primaryMenus 不走这里)
const visibleScenariosForSidebar = computed(() => scenarioMenus.value.filter(s => matchMenuRoles(s.roles)))
const displayedScenarioEntries = computed<Array<{ key: PrimaryMenuKey; label: string; icon: Component; scenario: ScenarioDef }>>(() => {
  if (isMultiScenariosGroup.value) {
    return visibleScenariosForSidebar.value.map(s => ({
      key: s.key,
      label: t(`menuSecondary.${s.entryKey}`),
      icon: s.tabs[0].icon,
      scenario: s,
    }))
  }
  if (activeScenarioMenu.value) {
    const s = activeScenarioMenu.value
    return [{
      key: s.key,
      label: t(`menuSecondary.${s.entryKey}`),
      icon: s.tabs[0].icon,
      scenario: s,
    }]
  }
  return []
})
function isCurrentScenario(entry: { scenario: ScenarioDef }): boolean {
  return route.path === entry.scenario.prefix || route.path.startsWith(`${entry.scenario.prefix}/`)
}

// [场景菜单 2026-09-16] admin 模式下当前展开的场景 key (点 trigger toggle, 点 tab 跳路由后同步)
const expandedScenarioKey = ref<PrimaryMenuKey | null>(null)
function onScenarioTriggerClick(entry: { scenario: ScenarioDef }) {
  // 单场景账号走的是 primaryMenus + el-menu-item 路径, 此函数仅被 admin 多场景场景触发
  if (expandedScenarioKey.value === entry.key) {
    // 同一 trigger 二次点击 -> 收起 (不放路由)
    expandedScenarioKey.value = null
    return
  }
  // 切换场景: 展开新场景 + 跳第一个 tab (路由变化后 watch 会再同步一次)
  expandedScenarioKey.value = entry.key
  navigateToMenu(entry.scenario.tabs[0].path)
}
// [场景菜单 2026-09-16] 路由命中某场景 tab -> 自动同步展开 (点击顶部 Tab / 书签 / 浏览器后退均覆盖)
watch(activeScenario, (newScen) => {
  if (newScen && isMultiScenariosGroup.value) {
    expandedScenarioKey.value = newScen.key
  }
}, { immediate: true })
const pendingMenuPath = ref<string | null>(null)
const routeLoading = ref(false)
let navigationSequence = 0

// ── [布局优化] 一级导航溢出检测与滚动：菜单 11 项较宽，溢出时两端显示滚动箭头 ──
const primaryNavRef = ref<HTMLElement | null>(null)
const navCanLeft = ref(false)
const navCanRight = ref(false)

function updateNavOverflow() {
  const el = primaryNavRef.value
  if (!el) return
  navCanLeft.value = el.scrollLeft > 1
  navCanRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollPrimaryNav(direction: 1 | -1) {
  primaryNavRef.value?.scrollBy({ left: direction * 280, behavior: 'smooth' })
}

// 语言切换 / 菜单集合变化后重测溢出状态
watch(primaryMenus, () => nextTick(updateNavOverflow))

function findPrimaryKey(path: string): PrimaryMenuKey | undefined {
  // [场景 Tab 2026-09-15] 场景页优先按 section 归组: 多场景用户激活 'scenarios'
  //   (侧边栏显示场景入口列表, 当前场景入口高亮); 单场景用户激活其场景一级
  //   (items = 子菜单, 当前子菜单高亮); 未命中场景段再回退原 items path 匹配。
  const hit = scenarioMenus.value.find(s => path === s.prefix || path.startsWith(`${s.prefix}/`))
  if (hit) {
    if (primaryMenus.value.some(m => m.key === 'scenarios')) return 'scenarios'
    if (primaryMenus.value.some(m => m.key === hit.key)) return hit.key
  }
  return primaryMenus.value.find(menu => menu.items.some(item => path === item.path || path.startsWith(`${item.path}/`)))?.key
}

async function navigateToMenu(path: string) {
  if (pendingMenuPath.value === path) return
  if (route.path === path) {
    pendingMenuPath.value = null
    routeLoading.value = false
    return
  }

  const sequence = ++navigationSequence
  pendingMenuPath.value = path
  routeLoading.value = true

  try {
    await router.push(path)
  } finally {
    if (sequence === navigationSequence) {
      pendingMenuPath.value = null
      routeLoading.value = false
    }
  }
}

async function selectPrimary(key: PrimaryMenuKey) {
  const menu = primaryMenus.value.find(item => item.key === key)
  const firstItem = menu?.items[0]
  if (!firstItem) return

  activePrimaryKey.value = key
  await navigateToMenu(firstItem.path)
}

async function handleSidebarSelect(path: string) {
  await navigateToMenu(path)
}

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
const displayedActiveMenu = computed(() => pendingMenuPath.value ?? activeMenu.value)

watch(() => route.path, path => {
  const key = findPrimaryKey(path)
  if (key) activePrimaryKey.value = key
}, { immediate: true })

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
    return
  }
  // [场景菜单 2026-09-16] ESC 收起 admin 多场景组展开的场景 (单场景账号走 el-menu-item, 不受影响)
  if (e.key === 'Escape' && isMultiScenariosGroup.value && expandedScenarioKey.value) {
    expandedScenarioKey.value = null
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateNavOverflow)
  nextTick(updateNavOverflow)
  // 初始化未处理告警数，驱动侧边栏徽章
  alarmStore.fetchUnhandledCount().catch(() => {})
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateNavOverflow)
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
      }).then(async () => {
        // [FIX logout-twice 2026-09-16] store.logout 本地态同步先清 (见 stores/user.ts),
        //   此处 await 收尾并重置联动告警 store (徽章/实时流残留), 首次点击即生效跳转。
        await auth.logout?.()
        alarmStore.$reset()
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
  --header-height: 64px;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
}

.workspace {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ── 侧边栏 ── */
.sidebar {
  background: var(--app-sidebar-bg, #002C73);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width var(--transition-normal, 0.2s ease);
  position: relative;
  border-right: 0;
}

.sidebar.collapsed {
  width: 64px;
}

/* Logo */
.logo {
  display: flex;
  align-items: center;
  /*gap: 8px;*/
  /*width: 245px;*/
  height: 100%;
  box-sizing: border-box;
  /*padding: 0 18px;*/
  cursor: pointer;
  user-select: none;
  border: 0;
  /*border-right: 1px solid rgba(0, 148, 210, 0.28);*/
  flex-shrink: 0;
  background-color: #032b68;
  background-image: linear-gradient(0deg, rgba(9,107,236,0.7), rgba(9,107,236,0.01));
}

.sidebar.collapsed .logo {
  justify-content: center;
  padding: 0;
}

.sidebar.collapsed .logo img {
  width: 32px;
  height: 32px;
}

.logo img {
  flex-shrink: 0;
  height: 48px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}

.logo-text {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #00e4ff;
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
  /*padding: 8px 0;*/
  scrollbar-color: transparent transparent;
  scrollbar-width: thin;
}

.sidebar-menu:hover {
  scrollbar-color: rgba(43, 91, 158, 0.9) rgba(5, 28, 75, 0.72);
}

.sidebar-menu::-webkit-scrollbar {
  width: 5px;
}

.sidebar-menu::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.sidebar-menu::-webkit-scrollbar-thumb {
  min-height: 28px;
  background: transparent;
  border-radius: 4px;
}

.sidebar-menu:hover::-webkit-scrollbar-track {
  background: rgba(5, 28, 75, 0.72);
}

.sidebar-menu:hover::-webkit-scrollbar-thumb {
  background: rgba(43, 91, 158, 0.9);
  box-shadow: inset 0 0 0 1px rgba(73, 133, 207, 0.22);
}

.sidebar-menu:hover::-webkit-scrollbar-thumb:hover {
  background: rgba(57, 112, 184, 0.96);
}

.legacy-sidebar-menu {
  display: none;
}

.sidebar-menu :deep(.el-menu-item-group__title) {
  height: 42px;
  /*margin: 0 8px 8px;*/
  padding: 0 !important;
  line-height: 42px;
  background-image: url('../assets/siderbar.png');
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}

.group-title {
  position: relative;
  display: flex;
  align-items: center;
  height: 42px;
  padding-left: 45px;
  font-size: 18px;
  /*color: #8ff7ff;*/
  font-weight: 700;
  letter-spacing: 0;
  /*text-shadow: 0 0 8px rgba(0, 228, 255, 0.65);*/
  background: linear-gradient(to bottom, #0EC5EC, #00D8F4, #FFFFFF);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}

.group-title::before {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 32px;
  height: 32px;
  background-image: url('../assets/siderbar1.png');
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  content: '';
  transform: translateY(-50%);
}

.sidebar.collapsed .sidebar-menu :deep(.el-menu-item-group__title) {
  height: 42px;
  padding: 0 !important;
}

.sidebar.collapsed .group-title {
  justify-content: center;
  width: 100%;
  height: 42px;
  padding-left: 0;
}

.sidebar.collapsed .group-title::before {
  left: 50%;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
}

.sidebar.collapsed .sidebar-menu :deep(.el-menu-item) {
  position: relative;
  justify-content: center;
  width: 100%;
  margin: 0;
  padding: 0 !important;
  border-radius: 0;
}

.sidebar.collapsed .sidebar-menu :deep(.el-menu-item .el-icon) {
  margin: 0;
}

.sidebar.collapsed .sidebar-menu :deep(.el-menu-item.is-active)::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: #00e4ff;
  box-shadow: 0 0 8px rgba(0, 228, 255, 0.7);
  content: '';
}

.sidebar-menu :deep(.el-menu-item) {
  height: 50px;
  line-height: 50px;
  /*margin: 2px 8px;*/
  /*border-radius: 8px;*/
  font-size: 14px;
  transition: all var(--transition-fast, 0.15s ease);
}

.sidebar-menu :deep(.el-menu-item:hover) {
  background: #002c73 !important;
  color: var(--app-sidebar-active, #3B82F6) !important;
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  background: rgba(59, 130, 246, 0.15);
  color: var(--app-sidebar-active, #3B82F6) !important;
  font-weight: var(--font-medium, 500);
}

.sidebar-menu :deep(.el-menu-item .el-icon) {
  font-size: 18px;
}

.sidebar-iconfont {
  width: 18px;
  margin-right:8px;
  margin-left: 2px;
  color: inherit;
  font-size: 17px;
  line-height: 1;
  text-align: center;
}

.sidebar.collapsed .sidebar-iconfont { margin-right: 0; }

.role-menu-item .sidebar-iconfont {
  width: 18px;
  margin-left: 2px;
  margin-right: 8px;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  text-align: center;
}

.sidebar.collapsed .role-menu-item .sidebar-iconfont { margin-right: 0; }

.alarm-menu-label {
  display: inline;
}

.menu-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  vertical-align: middle;
}

.menu-badge :deep(.el-badge__content) {
  font-size: 10px;
  position: static;
  transform: none;
}

/* ── [场景菜单 2026-09-16] admin 多场景组: 侧栏 6 入口 + 点击展开内联 tabs (取代之前的 hover-flyout) ── */
.scenario-menu {
  display: flex;
  flex-direction: column;
}

.scenario-group-title {
  display: flex;
  align-items: center;
  height: 42px;
  padding: 0 14px 0 45px;
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(to bottom, #0EC5EC, #00D8F4, #FFFFFF);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.scenario-entry-block {
  display: flex;
  flex-direction: column;
}

.scenario-entry {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  background: transparent;
  color: #C5DDF0;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease, color 0.15s ease;
}

.scenario-entry .el-icon {
  flex-shrink: 0;
  font-size: 16px;
  opacity: 0.9;
}

.scenario-entry:hover {
  background: rgba(96, 165, 250, 0.12);
  color: #FFFFFF;
}

.scenario-entry.is-current {
  background: rgba(24, 144, 255, 0.18);
  color: #FFFFFF;
}

.scenario-entry-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scenario-entry-caret {
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.55;
  transition: transform 0.15s ease;
}

.sidebar.collapsed .scenario-entry {
  justify-content: center;
  padding: 0;
}

.sidebar.collapsed .scenario-entry-label,
.sidebar.collapsed .scenario-entry-caret {
  display: none;
}

/* ── 侧栏展开的 tabs 纵向列表 (内联, 与上一轮单场景账号侧边栏子菜单化体验一致;
   扁平简洁样式 (参照 智慧安保一体化平台 侧栏, 不要太“设计感”) ── */
.sidebar .scenario-tabs {
  display: flex;
  flex-direction: column;
  background: transparent;
  margin: 0;
  padding: 0;
  animation: sidebar-scenario-tabs-fade 0.18s ease;
}

@keyframes sidebar-scenario-tabs-fade {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}

.sidebar .scenario-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px 0 32px;
  border: 0;
  background: transparent;
  color: #98B8D0;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}

.sidebar .scenario-tab .el-icon {
  flex-shrink: 0;
  font-size: 13px;
  opacity: 0.8;
}

.sidebar .scenario-tab:hover {
  background: rgba(96, 165, 250, 0.1);
  color: #FFFFFF;
}

.sidebar .scenario-tab.is-active {
  background: rgba(24, 144, 255, 0.18);
  color: #FFFFFF;
}

/* ── 浅色主题适配 (场景菜单) ── */
.main-layout:not(.dark-theme) .scenario-entry {
  color: #374151;
}

.main-layout:not(.dark-theme) .scenario-entry:hover {
  background: rgba(31, 41, 55, 0.05);
  color: #111827;
}

.main-layout:not(.dark-theme) .scenario-entry.is-current {
  background: rgba(24, 144, 255, 0.1);
  color: var(--app-sidebar-active, #1890FF);
}

.main-layout:not(.dark-theme) .sidebar .scenario-tabs {
  background: transparent;
}

.main-layout:not(.dark-theme) .sidebar .scenario-tab {
  color: #4B5563;
}

.main-layout:not(.dark-theme) .sidebar .scenario-tab:hover {
  background: rgba(31, 41, 55, 0.05);
}

.main-layout:not(.dark-theme) .sidebar .scenario-tab.is-active {
  background: rgba(24, 144, 255, 0.1);
  color: var(--app-sidebar-active, #1890FF);
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
  background: var(--app-sidebar-bg, #FFFFFF);
}

.main-layout:not(.dark-theme) .sidebar .logo-text {
  color: #000000;
}

.main-layout:not(.dark-theme) .sidebar .group-title {
  color: #8ff7ff;
}

.main-layout:not(.dark-theme) .sidebar-menu :deep(.el-menu-item:hover) {
  background: rgba(31, 41, 55, 0.06) !important;
  color: #1F2937;
}

.main-layout:not(.dark-theme) .sidebar-menu :deep(.el-menu-item.is-active) {
  background: rgba(24, 144, 255, 0.12);
  color: var(--app-sidebar-active, #1890FF) !important;
}

.main-layout:not(.dark-theme) .sidebar-menu :deep(.el-menu-item .el-icon) {
  color: #1F2937;
}

.main-layout:not(.dark-theme) .sidebar-menu :deep(.el-menu-item.is-active .el-icon) {
  color: var(--app-sidebar-active, #1890FF);
}

.main-layout:not(.dark-theme) .sidebar .sidebar-collapse-btn {
  color: rgba(31, 41, 55, 0.55);
}

.main-layout:not(.dark-theme) .sidebar .sidebar-collapse-btn:hover {
  color: #1F2937;
  background: rgba(31, 41, 55, 0.06);
}

.main-layout.dark-theme .sidebar {
  background: var(--app-sidebar-bg, #002C73);
}

.main-layout.dark-theme .sidebar-menu :deep(.el-menu-item) {
  color: #AADDFF;
}

.main-layout.dark-theme .sidebar-menu :deep(.el-menu-item .el-icon) {
  color: #AADDFF;
}

.main-layout.dark-theme .sidebar-menu :deep(.el-menu-item.is-active) {
  background: #00419E;
  color: #00FFFF !important;
}

.main-layout.dark-theme .sidebar-menu :deep(.el-menu-item.is-active .el-icon) {
  color: #00FFFF;
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
  height: var(--header-height, 64px);
  min-height: var(--header-height, 64px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 22px 0 0;
  box-sizing: border-box;
  background-color: #032b68;
  background-image: linear-gradient(0deg, rgba(9,107,236,0.7), rgba(9,107,236,0.01));
  /*border-bottom: 8px solid #00265e;*/
  flex-shrink: 0;
  z-index: var(--z-header);
}

.header-left {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
  margin-left: 8px;
  height: 100%;
}

/* 一级导航溢出包裹层：溢出时两端显示滚动箭头（渐变底与顶部栏同色，保证可读） */
.primary-nav-wrap {
  position: relative;
  display: flex;
  align-items: stretch;
  min-width: 0;
  flex: 1;
  height: 100%;
}

.primary-nav {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  min-width: 0;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.nav-scroll-btn {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border: 0;
  cursor: pointer;
  color: #0094D2;
  background: transparent;
  transition: color 0.18s ease;
}

.nav-scroll-btn:hover,
.nav-scroll-btn:focus-visible {
  color: #00E4FF;
}

.nav-scroll-left {
  left: 0;
  background: linear-gradient(90deg, rgba(3, 43, 104, 0.95) 45%, rgba(3, 43, 104, 0));
}

.nav-scroll-right {
  right: 0;
  background: linear-gradient(270deg, rgba(3, 43, 104, 0.95) 45%, rgba(3, 43, 104, 0));
}

.primary-nav::-webkit-scrollbar {
  display: none;
}

.primary-nav-item {
  position: relative;
  padding: 0 20px;
  border: 0;
  background: transparent;
  color: #0094D2;
  font: inherit;
  font-size: 16px;
  font-weight: 400;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.18s ease, background-color 0.18s ease;
}

.primary-nav-item::after {
  position: absolute;
  bottom: 8px;
  left: 0;
  width: 100%;
  height: 2px;
  background-image: url('../assets/line.png');
  background-position: top;
  background-repeat: no-repeat;
  background-size: 100%;
  content: '';
  opacity: 0;
  transform: scaleX(0.45);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.primary-nav-item .line {
  position: absolute;
  top: 50%;
  right: -5px;
  width: 11px;
  height: 28px;
  color: #0094d280 !important;
  font-weight: 100;
  line-height: 28px;
  text-align: center;
  transform: translateY(-50%);
}

.primary-nav-item:last-child .line {
  display: none;
}

.primary-nav-item:hover,
.primary-nav-item:focus-visible,
.primary-nav-item.is-active {
  color: #00E4FF;
}

.primary-nav-item.is-active {
  font-weight: 700;
}

.primary-nav-item.is-active::after {
  opacity: 1;
  transform: scaleX(1);
}

.primary-nav-item:focus-visible,
.logo:focus-visible {
  outline: 2px solid #00E4FF;
  outline-offset: -2px;
}

/* ── [场景菜单 2026-09-16] 顶部 nav.scenario-tabs 及其子级 .scenario-tab 样式已删除 (顶部页签移除) ── */

.global-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(1, 31, 86, 0.32);
  border: 1px solid rgba(0, 148, 210, 0.5);
  border-radius: var(--radius-lg, 8px);
  cursor: pointer;
  color: #0094D2;
  font-size: 13px;
  transition: all var(--transition-fast, 0.15s ease);
  min-width: 200px;
}

.global-search:hover {
  border-color: #00E4FF;
  color: #00E4FF;
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
  flex-shrink: 0;
}

.header-right :deep(.el-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  vertical-align: middle;
}

.header-icon-btn,
.header-right :deep(.notification-bell) {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  color: #0094D2;
  transition: all var(--transition-fast, 0.15s ease);
}

.header-icon-btn:hover {
  background: rgba(0, 228, 255, 0.1);
  color: #00E4FF;
}

.ai-btn:hover {
  color: var(--color-ai);
}

.main-layout.dark-theme .header {
  color: #FFFFFF;
}

.main-layout:not(.dark-theme) .header,
.main-layout.dark-theme .header {
  color: #0094D2;
}

.main-layout.dark-theme .global-search {
  background: rgba(1, 31, 86, 0.32);
  border-color: rgba(0, 148, 210, 0.5);
  color: #0094D2;
}

.main-layout.dark-theme .global-search:hover {
  border-color: #00E4FF;
  color: #00E4FF;
}

.main-layout.dark-theme .search-hint {
  background: rgba(0, 228, 255, 0.1);
  color: #0094D2;
}

.main-layout.dark-theme .header-icon-btn,
.main-layout.dark-theme .username,
.main-layout.dark-theme .dropdown-icon,
.main-layout.dark-theme :deep(.notification-bell) {
  color: #0094D2;
}

.main-layout.dark-theme .header-icon-btn:hover,
.main-layout.dark-theme .user-menu:hover,
.main-layout.dark-theme :deep(.notification-bell:hover) {
  background: rgba(0, 228, 255, 0.1);
  color: #00E4FF;
}

.main-layout.dark-theme :deep(.notification-bell.has-urgent) {
  color: #F56C6C;
}

.main-layout:not(.dark-theme) .logo-text,
.main-layout.dark-theme .logo-text {
  /*color: #00E4FF;*/
  background: linear-gradient(0deg, #096bec, #00e4ff);
  -webkit-background-clip: text;
  color: transparent;
}

/* 用户菜单 */
.user-menu {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 2px 12px 2px 4px;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.user-menu:hover {
  background: var(--app-surface-hover);
}

.username {
  font-size: 13px;
  /*color: var(--app-text-primary);*/
  color:#0094D2;
  font-weight: var(--font-medium, 500);
}

.dropdown-icon {
  font-size: 12px;
  /*color: var(--app-text-secondary);*/
   color:#0094D2;
}

/* 顶部栏背景不随主题变化，右侧工具区也固定使用同一套颜色。 */
.header-right .header-icon-btn,
.header-right .username,
.header-right .dropdown-icon,
.header-right :deep(.notification-bell) {
  color: #0094d2;
}

.header-right .header-icon-btn:hover,
.header-right .user-menu:hover,
.header-right :deep(.notification-bell:hover) {
  color: #00e4ff;
  background: rgba(0, 228, 255, 0.1);
}

.header-right :deep(.el-avatar) {
  color: #ffffff;
  background: #b8c3d4;
}

.header-right :deep(.notification-bell.has-urgent) {
  color: #f56c6c;
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
  padding: 20px 14px;
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

  .primary-nav-item {
    min-width: 72px;
    padding: 0 10px;
  }

  .primary-nav-item::after {
    right: auto;
    left: 0;
  }

  .search-hint {
    display: none;
  }
}
</style>
