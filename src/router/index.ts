/**
 * 华盾AI智能视频盒子 v7.0 - 路由配置
 * 
 * router/index.ts — 路由定义与导航守卫
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import MainLayout from '@/layouts/MainLayout.vue'

// 路由懒加载
const DashboardView = () => import('@/views/DashboardView.vue')
const DevicesView = () => import('@/views/DevicesView.vue')
const DeviceDetailView = () => import('@/views/DeviceDetailView.vue')
const LiveView = () => import('@/views/LiveView.vue')
const AlarmsView = () => import('@/views/AlarmsView.vue')
const StatisticsView = () => import('@/views/StatisticsView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')
const ProjectsView = () => import('@/views/ProjectsView.vue')
const AuditCenterView = () => import('@/views/AuditCenterView.vue')
const ChannelView = () => import('@/views/ChannelView.vue')
const OTAUpgradeView = () => import('@/views/OTAUpgradeView.vue')
const AIChatView = () => import('@/views/AIChatView.vue')
const SituationScreen = () => import('@/views/SituationScreen.vue')
const OpenPlatformView = () => import('@/views/OpenPlatformView.vue')
const TeamListView = () => import('@/views/team/TeamListView.vue')
const TeamDetailView = () => import('@/views/team/TeamDetailView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const NotFoundView = () => import('@/views/NotFoundView.vue')
const GB28181View = () => import('@/views/GB28181View.vue')
const ONVIFDiscoveryView = () => import('@/views/ONVIFDiscoveryView.vue')
const StreamManagementView = () => import('@/views/StreamManagementView.vue')
const ModelManagementView = () => import('@/views/ModelManagementView.vue')
const RecordingView = () => import('@/views/RecordingView.vue')
const PipelineListView = () => import('@/views/PipelineListView.vue')
const PipelineEditorView = () => import('@/views/PipelineEditorView.vue')
const LinkageRuleView = () => import('@/views/LinkageRuleView.vue')
const FederationDashboard = () => import('@/views/FederationDashboard.vue')
const FLConfigView = () => import('@/views/FLConfigView.vue')
const PermissionManagementView = () => import('@/views/rbac/PermissionManagementView.vue')
const RoleManagementView = () => import('@/views/rbac/RoleManagementView.vue')
const UserManagementView = () => import('@/views/rbac/UserManagementView.vue')
const LocationTrackView = () => import('@/views/LocationTrackView.vue')
const TopologyView = () => import('@/views/TopologyView.vue')
const AlgorithmStoreView = () => import('@/views/AlgorithmStoreView.vue')
const BillingView = () => import('@/views/BillingView.vue')
const FaceDatabaseView = () => import('@/views/FaceDatabaseView.vue')
const FaceRealtimeView = () => import('@/views/FaceRealtimeView.vue')
const SystemLogsView = () => import('@/views/SystemLogsView.vue')
const AlgoConfigView = () => import('@/views/AlgoConfigView.vue')
const AlgoQualityView = () => import('@/views/AlgoQualityView.vue')
const PipelineHealthView = () => import('@/views/PipelineHealthView.vue')
const AnnotationView = () => import('@/views/AnnotationView.vue')
const TrainingView = () => import('@/views/TrainingView.vue')

// 基础路由（无需权限）
export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { title: '登录', hidden: true }
  },
  {
    path: '/404',
    name: 'NotFound',
    component: NotFoundView,
    meta: { title: '页面不存在', hidden: true }
  }
]

// 异步路由（需要权限）— 包裹在 MainLayout 下
export const asyncRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    redirect: '/situation',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: DashboardView,
        meta: { title: '控制台', icon: 'Odom', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'devices',
        name: 'Devices',
        component: DevicesView,
        meta: { title: '设备管理', icon: 'Monitor', roles: ['admin', 'user'] }
      },
      {
        path: 'devices/:id',
        name: 'DeviceDetail',
        component: DeviceDetailView,
        meta: { title: '设备详情', icon: 'Monitor', hidden: true, roles: ['admin', 'user'] },
        props: true
      },
      {
        path: 'devices/:id/channels',
        name: 'DeviceChannels',
        component: ChannelView,
        meta: { title: '设备通道', icon: 'Grid', hidden: true, roles: ['admin', 'user'] }
      },
      {
        path: 'live',
        name: 'Live',
        component: LiveView,
        meta: { title: '实时监控', icon: 'VideoCamera', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'channels',
        name: 'Channels',
        component: ChannelView,
        meta: { title: '通道管理', icon: 'Grid', roles: ['admin', 'user'] }
      },
      {
        path: 'alarms',
        name: 'Alarms',
        component: AlarmsView,
        meta: { title: '告警中心', icon: 'Bell', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'statistics',
        name: 'Statistics',
        component: StatisticsView,
        meta: { title: '统计分析', icon: 'DataLine', roles: ['admin', 'user'] }
      },
      {
        path: 'projects',
        name: 'Projects',
        component: ProjectsView,
        meta: { title: '项目管理', icon: 'FolderOpened', roles: ['admin', 'user'] }
      },
      {
        path: 'teams',
        name: 'Teams',
        component: TeamListView,
        meta: { title: '团队管理', icon: 'User', roles: ['admin'] }
      },
      {
        path: 'teams/:id',
        name: 'TeamDetail',
        component: TeamDetailView,
        meta: { title: '团队详情', icon: 'User', hidden: true, roles: ['admin'] },
        props: true
      },
      {
        path: 'audit',
        name: 'Audit',
        component: AuditCenterView,
        meta: { title: '审计中心', icon: 'Document', roles: ['admin'] }
      },
      {
        path: 'upgrade',
        name: 'OTAUpgrade',
        component: OTAUpgradeView,
        meta: { title: 'OTA升级', icon: 'Upload', roles: ['admin'] }
      },
      {
        path: 'ai-chat',
        name: 'AIChat',
        component: AIChatView,
        meta: { title: 'AI助手', icon: 'ChatDotRound', roles: ['admin', 'user'] }
      },
      {
        path: 'situation',
        name: 'Situation',
        component: SituationScreen,
        meta: { title: '态势大屏', icon: 'DataBoard', roles: ['admin'] }
      },
      {
        path: 'open-platform',
        name: 'OpenPlatform',
        component: OpenPlatformView,
        meta: { title: '开放平台', icon: 'Connection', roles: ['admin'] }
      },
      {
        path: 'linkage',
        name: 'LinkageRule',
        component: LinkageRuleView,
        meta: { title: '联动规则', icon: 'Connection', roles: ['admin', 'user'] }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: SettingsView,
        meta: { title: '系统设置', icon: 'Setting', roles: ['admin'] }
      },
      {
        path: 'gb28181',
        name: 'GB28181',
        component: GB28181View,
        meta: { title: 'GB28181配置', icon: 'Connection', roles: ['admin', 'user'] }
      },
      {
        path: 'onvif',
        name: 'ONVIFDiscovery',
        component: ONVIFDiscoveryView,
        meta: { title: 'ONVIF发现', icon: 'Search', roles: ['admin', 'user'] }
      },
      {
        path: 'streams',
        name: 'StreamManagement',
        component: StreamManagementView,
        meta: { title: '流管理', icon: 'VideoPlay', roles: ['admin', 'user'] }
      },
      {
        path: 'models',
        name: 'ModelManagement',
        component: ModelManagementView,
        meta: { title: '模型管理', icon: 'Cpu', roles: ['admin'] }
      },
      {
        path: 'algorithm-store',
        name: 'AlgorithmStore',
        component: AlgorithmStoreView,
        meta: { title: '算法商城', icon: 'ShoppingCart', roles: ['admin'] }
      },
      {
        path: 'billing',
        name: 'Billing',
        component: BillingView,
        meta: { title: '账单查看', icon: 'Wallet', roles: ['admin'] }
      },
      {
        path: 'face-database',
        name: 'FaceDatabase',
        component: FaceDatabaseView,
        meta: { title: '人脸库管理', icon: 'User', roles: ['admin', 'user'] }
      },
      {
        path: 'face-realtime',
        name: 'FaceRealtime',
        component: FaceRealtimeView,
        meta: { title: '人脸实时识别', icon: 'Aim', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'topology',
        name: 'Topology',
        component: TopologyView,
        meta: { title: '设备拓扑', icon: 'Connection', roles: ['admin', 'viewer'] }
      },
      {
        path: 'system-logs',
        name: 'SystemLogs',
        component: SystemLogsView,
        meta: { title: '系统日志', icon: 'Document', roles: ['admin'] }
      },
      {
        path: 'location',
        name: 'LocationTrack',
        component: LocationTrackView,
        meta: { title: '定位与轨迹', icon: 'Location', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'recordings',
        name: 'Recording',
        component: RecordingView,
        meta: { title: '录像回放', icon: 'Film', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'pipelines',
        name: 'PipelineList',
        component: PipelineListView,
        meta: { title: '流水线', icon: 'SetUp', roles: ['admin', 'user'] }
      },
      {
        path: 'pipelines/editor',
        name: 'PipelineEditorNew',
        component: PipelineEditorView,
        meta: { title: '新建流水线', icon: 'SetUp', hidden: true, roles: ['admin', 'user'] }
      },
      {
        path: 'pipelines/editor/:id',
        name: 'PipelineEditor',
        component: PipelineEditorView,
        meta: { title: '编辑流水线', icon: 'SetUp', hidden: true, roles: ['admin', 'user'] },
        props: true
      },
      {
        path: 'federation',
        name: 'FederationDashboard',
        component: FederationDashboard,
        meta: { title: '联邦学习', icon: 'Share', roles: ['admin'] }
      },
      {
        path: 'fl-config',
        name: 'FLConfig',
        component: FLConfigView,
        meta: { title: 'FL高级配置', icon: 'Setting', roles: ['admin'] }
      },
      {
        path: 'permissions',
        name: 'PermissionManagement',
        component: PermissionManagementView,
        meta: { title: '权限管理', icon: 'Lock', hidden: true, roles: ['admin'] }
      },
      {
        path: 'roles',
        name: 'RoleManagement',
        component: RoleManagementView,
        meta: { title: '角色管理', icon: 'UserFilled', hidden: true, roles: ['admin'] }
      },
      {
        path: 'users',
        name: 'UserManagement',
        component: UserManagementView,
        meta: { title: '用户管理', icon: 'Avatar', hidden: true, roles: ['admin'] }
      },
      {
        path: 'algo-config',
        name: 'AlgoConfig',
        component: AlgoConfigView,
        meta: { title: '算法配置', icon: 'Setting', roles: ['admin'] }
      },
      {
        path: 'algo-quality',
        name: 'AlgoQuality',
        component: AlgoQualityView,
        meta: { title: '算法质检', icon: 'DataLine', roles: ['admin', 'user'] }
      },
      {
        path: 'pipeline-health',
        name: 'PipelineHealth',
        component: PipelineHealthView,
        meta: { title: 'Pipeline健康', icon: 'Monitor', roles: ['admin', 'user'] }
      },
      {
        path: 'annotation',
        name: 'Annotation',
        component: AnnotationView,
        meta: { title: '标注管理', icon: 'Edit', roles: ['admin', 'user'] }
      },
      {
        path: 'training',
        name: 'Training',
        component: TrainingView,
        meta: { title: '零代码训练', icon: 'Cpu', roles: ['admin', 'user'] }
      },
    ]
  },
  // 捕获所有未匹配路由（放在 MainLayout 外部）
  { 
    path: '/:pathMatch(.*)*', 
    redirect: '/404',
    meta: { hidden: true }
  }
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: constantRoutes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  }
})

// 路由导航守卫 - 权限验证
router.beforeEach(async (to, _from, next) => {
  const userStore = useUserStore()
  const permissionStore = usePermissionStore()

  // 设置页面标题
  document.title = `${to.meta.title || '华盾AI'} - 华盾智能视频盒子`

  // 如果是登录页面
  if (to.path === '/login') {
    // 已登录则跳转首页
    if (userStore.isLoggedIn) {
      return next('/')
    }
    return next()
  }

  // 检查是否已登录
  if (!userStore.isLoggedIn) {
    // 跳转到登录页
    return next('/login')
  }

  // 动态添加异步路由（所有角色都需要，只添加一次）
  if (permissionStore.routes.length === 0) {
    try {
      await permissionStore.generateRoutes()
      for (const route of permissionStore.routes) {
        router.addRoute(route)
      }
      // 重新触发导航以匹配新添加的路由
      return next({ ...to, replace: true })
    } catch (error) {
      console.error('[Router] 生成路由失败:', error)
      return next('/login')
    }
  }

  // 如果是超级管理员，直接放行
  if (userStore.roles.includes('admin')) {
    return next()
  }

  // 检查角色权限
  const requiredRoles = to.meta.roles as string[] | undefined
  if (requiredRoles && requiredRoles.length > 0) {
    const hasPermission = requiredRoles.some(role => userStore.roles.includes(role))
    if (!hasPermission) {
      console.warn('[Router] 无权限访问:', to.path)
      return next('/404')
    }
  }

  next()
})

// 路由导航后置处理
router.afterEach((to) => {
  // 记录访问日志
  console.debug('[Router] 导航至:', to.path, to.meta.title)
})

export default router
