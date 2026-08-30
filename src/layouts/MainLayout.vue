<template>
  <el-container class="main-layout" :class="{ 'dark-theme': prefStore.themeMode === 'dark' }">
    <!-- ===== 顶部导航 ===== -->
    <el-header class="header">
      <button class="logo" type="button" aria-label="ShieldAI 首页" @click="router.push('/situation')">
        <img :src="logoUrl" alt="ShieldAI" height="48" />
        <span class="logo-text">v7.0</span>
      </button>

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
            <span class="line" aria-hidden="true">|</span>
          </button>
        </nav>
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
      <el-menu
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

type PrimaryMenuKey = 'home' | 'location' | 'video' | 'alarm' | 'ai' | 'screening' | 'school' | 'gas-station' | 'large-event' | 'platform'
type SidebarItem = {
  path: string
  label: string
  icon: Component
  iconFont?: string
}
type PrimaryMenu = {
  key: PrimaryMenuKey
  label: string
  items: SidebarItem[]
}

const primaryMenus = computed<PrimaryMenu[]>(() => [
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
    key: 'ai',
    label: t('menuPrimary.ai'),
    items: [
      { path: '/dashboard', label: t('menu.dashboard'), icon: Odometer },
      { path: '/pipelines', label: t('menu.pipelineEditor'), icon: SetUp },
      // [ADD 2026-08-28] 算法配置入口: 路由 /algo-config 早已存在但未挂菜单,
      //   仅 admin 可见 (与路由 meta.roles: ['admin'] 对齐)
      { path: '/algo-config', label: t('menu.algoConfig'), icon: SetUp },
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
    key: 'screening',
    label: t('menuPrimary.screening'),
    items: [
      { path: '/screening/overview', label: t('menu.screeningOverview'), icon: DataAnalysis },
      { path: '/screening/channel-order', label: t('menu.screeningChannelOrder'), icon: Connection },
      { path: '/screening/personal-item', label: t('menu.screeningPersonalItem'), icon: ShoppingCart },
      { path: '/screening/xray', label: t('menu.screeningXray'), icon: Aim },
      { path: '/screening/rules', label: t('menu.screeningRules'), icon: DocumentChecked },
      // [安检对标优化 2026-08-30] 安检专属事件规则列表入口 (页面已存在, 此前漏接入菜单)
      { path: '/screening/rule-manager', label: t('menu.screeningRuleManager'), icon: Setting },
    ],
  },
  {
    // [校园方案 2026-08-30] 一级菜单「校园」: 9 子模块 (总览/门禁/周界/行为/考勤/访客/安检/大屏/3D)
    key: 'school',
    label: t('menuPrimary.school'),
    items: [
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
    ],
  },
  {
    // [加油站方案 2026-08-30] 一级菜单「加油站」: 7 子模块 (总览/加油区/卸油区/周界/油罐区/态势大屏/3D)
    //   设计: docs/plans/加油站整体解决方案设计_v1.0.md §4
    //   T6 红线 (电话/吸烟不联锁) + EHS 闭环 + 安全 PLC 隔离
    key: 'gas-station',
    label: t('menuPrimary.gasStation'),
    items: [
      { path: '/gas-station/overview',    label: t('menu.gasStationOverview'),    icon: DataAnalysis },
      { path: '/gas-station/fueling',     label: t('menu.gasStationFueling'),     icon: TakeawayBox },
      { path: '/gas-station/unloading',   label: t('menu.gasStationUnloading'),   icon: MagicStick },
      { path: '/gas-station/perimeter',   label: t('menu.gasStationPerimeter'),   icon: Warning },
      { path: '/gas-station/tank',        label: t('menu.gasStationTank'),        icon: Histogram },
      { path: '/gas-station/dashboard',   label: t('menu.gasStationDashboard'),   icon: DataBoard },
      { path: '/gas-station/gas3d',       label: t('menu.gasStationGas3D'),       icon: MapLocation },
      { path: '/gas-station/scene-packs', label: t('menu.gasStationScenePacks'),  icon: Box },
    ],
  },
  {
    key: 'large-event',
    label: t('menuPrimary.largeEvent'),
    items: [
      { path: '/large-event/overview', label: t('menu.largeEventOverview'), icon: DataAnalysis },
      { path: '/large-event/density', label: t('menu.largeEventDensity'), icon: Position },
      { path: '/large-event/events', label: t('menu.largeEventEvents'), icon: Bell },
      { path: '/large-event/scene-packs', label: t('menu.largeEventPacks'), icon: FolderOpened },
      { path: '/large-event/rules', label: t('menu.largeEventRules'), icon: List },
    ],
  },
  {
    key: 'platform',
    label: t('menuPrimary.platform'),
    items: [
      { path: '/devices', label: t('menu.devices'), icon: Monitor },
      { path: '/scene-management', label: '3D场景管理', icon: MapLocation },
      { path: '/topology', label: t('menu.topology'), icon: Share },
      { path: '/linkage', label: t('menu.linkage'), icon: Connection },
      { path: '/projects', label: t('menu.projects'), icon: FolderOpened },
      { path: '/teams', label: t('menu.team'), icon: User },
      { path: '/upgrade', label: t('menu.ota'), icon: Upload },
      { path: '/settings', label: t('menu.settings'), icon: Setting },
      { path: '/audit', label: t('menu.audit'), icon: DocumentChecked },
      { path: '/open-platform', label: t('menu.openPlatform'), icon: Link },
      { path: '/users', label: t('menu.user'), icon: User },
      { path: '/roles', label: t('menu.role'), icon: Avatar, iconFont: 'icon1-jiaoseguanli' },
      { path: '/permissions', label: t('menu.permission'), icon: Lock },
      { path: '/billing', label: t('menu.billing'), icon: Wallet },
    ].filter(item => item.path !== '/projects' || auth.can('projects', 'read')),
  },
])

const activePrimaryKey = ref<PrimaryMenuKey>('home')
const activePrimaryMenu = computed(() =>
  primaryMenus.value.find(item => item.key === activePrimaryKey.value) ?? primaryMenus.value[0]
)
const showSidebar = computed(() => activePrimaryKey.value !== 'home')
const pendingMenuPath = ref<string | null>(null)
const routeLoading = ref(false)
let navigationSequence = 0

function findPrimaryKey(path: string): PrimaryMenuKey | undefined {
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
  margin-left:50px;
  height: 100%;
}

.primary-nav {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.primary-nav::-webkit-scrollbar {
  display: none;
}

.primary-nav-item {
  position: relative;
  padding: 0 35px;
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
  padding: 20px 24px;
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
