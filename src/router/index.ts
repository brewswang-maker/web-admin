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
const ChannelDetailView = () => import('@/views/ChannelDetailView.vue')
const OTAUpgradeView = () => import('@/views/OTAUpgradeView.vue')
const AIChatView = () => import('@/views/AIChatView.vue')
const SituationScreen = () => import('@/views/SituationScreen.vue')
const SceneManagementView = () => import('@/views/SceneManagement.vue')
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
// 大型活动 EventGuard (Phase 0-1)
const LargeEventOverviewView = () => import('@/views/large-event/OverviewView.vue')
const LargeEventDensityView = () => import('@/views/large-event/DensityScreenView.vue')
const LargeEventEventsView = () => import('@/views/large-event/EventListView.vue')
const LargeEventScenePacksView = () => import('@/views/large-event/ScenePacksView.vue')
const LargeEventRulesView = () => import('@/views/large-event/RulesView.vue') // [EventGuard apply v2 2026-08-28] 事件规则聚合页
// 酒店员工无人值守 (t8f 2026-08-30 — 方案: docs/plans/hotel-unattended-solution-v1.0.md §5.7)
const HotelOverviewView = () => import('@/views/hotel-unattended/OverviewView.vue')
const HotelCorridorEventsView = () => import('@/views/hotel-unattended/CorridorEventsView.vue')
const HotelScenePacksView = () => import('@/views/hotel-unattended/ScenePacksView.vue')
const HotelRulesView = () => import('@/views/hotel-unattended/RulesView.vue')
// 视频周界 (vp 2026-08-31 — 方案: docs/plans/video-perimeter-solution-v1.0.md §6)
const PerimeterOverviewView = () => import('@/views/perimeter/OverviewView.vue')
const PerimeterEventsView = () => import('@/views/perimeter/EventsView.vue')
const PerimeterScenePacksView = () => import('@/views/perimeter/ScenePacksView.vue')
// 安检场景 (Phase 2 S1-3/S1-4 — 2026-08-27)
const ScreeningOverviewView = () => import('@/views/screening/ScreeningOverview.vue')
const ScreeningChannelOrderView = () => import('@/views/screening/ScreeningChannelOrder.vue')
const ScreeningPersonalItemView = () => import('@/views/screening/ScreeningPersonalItem.vue')
const ScreeningXrayView = () => import('@/views/screening/ScreeningXray.vue')
const ScreeningRulesView = () => import('@/views/screening/ScreeningRules.vue')
const ScreeningRuleManagerView = () => import('@/views/screening/ScreeningRuleManager.vue')
// [校园方案 2026-08-30] 校园一级模块 9 子页 (docs/plans/校园整体解决方案设计_v1.0.md §3)
const SchoolOverviewView = () => import('@/views/school/SchoolOverview.vue')
const AccessControlView = () => import('@/views/school/AccessControl.vue')
const PerimeterView = () => import('@/views/school/Perimeter.vue')
const BehaviorView = () => import('@/views/school/Behavior.vue')
const AttendanceView = () => import('@/views/school/Attendance.vue')
const VisitorManagementView = () => import('@/views/school/VisitorManagement.vue')
const CampusSecurityView = () => import('@/views/school/CampusSecurity.vue')
const CampusDashboardView = () => import('@/views/school/CampusDashboard.vue')
const Campus3DView = () => import('@/views/school/Campus3D.vue')
const SchoolScenePacksView = () => import('@/views/school/SchoolScenePacks.vue')
// [加油站方案 2026-08-30] 一级菜单加油站 (设计 docs/plans/加油站整体解决方案设计_v1.0.md §4)
const GasScenePacksView = () => import('@/views/gas-station/GasScenePacks.vue')
const GasOverviewView = () => import('@/views/gas-station/GasOverview.vue')
const FuelingAreaView = () => import('@/views/gas-station/FuelingArea.vue')
const UnloadingAreaView = () => import('@/views/gas-station/UnloadingArea.vue')
const GasPerimeterView = () => import('@/views/gas-station/Perimeter.vue')
const TankAreaView = () => import('@/views/gas-station/TankArea.vue')
const GasDashboardView = () => import('@/views/gas-station/GasDashboard.vue')
const Gas3DView = () => import('@/views/gas-station/Gas3D.vue')
// 智能检索 (P0-B: P4-E 混合检索 / 以文搜图 / 以图搜图 三合一)
const RetrievalView = () => import('@/views/RetrievalView.vue')

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
        path: 'channels/:id',
        name: 'ChannelDetail',
        component: ChannelDetailView,
        meta: { title: '通道详情', hidden: true, roles: ['admin', 'user'] },
        props: true
      },
      {
        path: 'alarms',
        name: 'Alarms',
        component: AlarmsView,
        meta: { title: '告警中心', icon: 'Bell', roles: ['admin', 'user', 'viewer'] }
      },
      {
        // [P0-B 2026-08-30 智能检索三合一] face/hybrid 涉 retrieval:face 授权, viewer 不开放
        path: 'retrieval',
        name: 'Retrieval',
        component: RetrievalView,
        meta: { title: '智能检索', icon: 'Search', roles: ['admin', 'user'] }
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
        meta: { title: '态势大屏', icon: 'DataBoard', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'scene-management',
        name: 'SceneManagement',
        component: SceneManagementView,
        meta: { title: '3D场景管理', icon: 'MapLocation', roles: ['admin'] }
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
      // ── 大型活动 EventGuard (Phase 0-1) ──
      {
        path: 'large-event/overview',
        name: 'LargeEventOverview',
        component: LargeEventOverviewView,
        meta: { title: '大型活动总览', icon: 'DataBoard', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'large-event/density',
        name: 'LargeEventDensity',
        component: LargeEventDensityView,
        meta: { title: '密度热力大屏', icon: 'Histogram', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'large-event/events',
        name: 'LargeEventEvents',
        component: LargeEventEventsView,
        meta: { title: '大型活动事件', icon: 'Bell', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'large-event/scene-packs',
        name: 'LargeEventScenePacks',
        component: LargeEventScenePacksView,
        meta: { title: '场景包', icon: 'Files', roles: ['admin', 'user'] }
      },
      {
        path: 'large-event/rules',
        name: 'LargeEventRules',
        component: LargeEventRulesView,
        meta: { title: '事件规则', icon: 'List', roles: ['admin', 'user', 'viewer'] }
      },
      // ── 酒店员工无人值守 (t8f 2026-08-30) ──
      {
        path: 'hotel-unattended/overview',
        name: 'HotelOverview',
        component: HotelOverviewView,
        meta: { title: '无人值守总览', icon: 'Odometer', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'hotel-unattended/corridor-events',
        name: 'HotelCorridorEvents',
        component: HotelCorridorEventsView,
        meta: { title: '通道事件', icon: 'Bell', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'hotel-unattended/scene-packs',
        name: 'HotelScenePacks',
        component: HotelScenePacksView,
        meta: { title: '酒店场景包', icon: 'FolderOpened', roles: ['admin', 'user'] }
      },
      {
        path: 'hotel-unattended/rules',
        name: 'HotelRules',
        component: HotelRulesView,
        meta: { title: '联动规则', icon: 'List', roles: ['admin', 'user', 'viewer'] }
      },
      // ── 视频周界 (vp 2026-08-31, 跨行业通用能力场景) ──
      {
        path: 'video-perimeter/overview',
        name: 'PerimeterOverview',
        component: PerimeterOverviewView,
        meta: { title: '周界总览', icon: 'Odometer', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'video-perimeter/events',
        name: 'PerimeterEvents',
        component: PerimeterEventsView,
        meta: { title: '周界事件', icon: 'Bell', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'video-perimeter/packs',
        name: 'PerimeterScenePacks',
        component: PerimeterScenePacksView,
        meta: { title: '周界布防', icon: 'FolderOpened', roles: ['admin', 'user'] }
      },
      // ── 安检场景 (Phase 2 S1-3/S1-4) ──
      {
        // [安检对标优化 2026-08-30] 运行大屏 (对标海康可视化安检中枢)
        path: 'screening/dashboard',
        name: 'ScreeningDashboard',
        component: () => import('@/views/screening/ScreeningDashboard.vue'),
        meta: { title: '运行大屏', icon: 'DataLine', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'screening/overview',
        name: 'ScreeningOverview',
        component: ScreeningOverviewView,
        meta: { title: '安检总览', icon: 'DataBoard', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'screening/channel-order',
        name: 'ScreeningChannelOrder',
        component: ScreeningChannelOrderView,
        meta: { title: '通道秩序', icon: 'Connection', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'screening/personal-item',
        name: 'ScreeningPersonalItem',
        component: ScreeningPersonalItemView,
        meta: { title: '人包核验', icon: 'ShoppingCart', roles: ['admin', 'user'] }
      },
      {
        path: 'screening/xray',
        name: 'ScreeningXray',
        component: ScreeningXrayView,
        meta: { title: '判图辅助', icon: 'Aim', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'screening/rules',
        name: 'ScreeningRules',
        component: ScreeningRulesView,
        meta: { title: '安检模板', icon: 'Document', roles: ['admin', 'user'] }
      },
      {
        // [P2-1 2026-08-29 安检 gap audit] 生效规则管理 (与模板页互补)
        path: 'screening/rule-manager',
        name: 'ScreeningRuleManager',
        component: ScreeningRuleManagerView,
        meta: { title: '规则管理', icon: 'Setting', roles: ['admin', 'user'] }
      },
      // ═══ [校园方案 2026-08-30] 校园一级模块 9 子路由 ═══
      {
        path: 'school/overview',
        name: 'SchoolOverview',
        component: SchoolOverviewView,
        meta: { title: '校园总览', icon: 'School', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'school/access',
        name: 'SchoolAccessControl',
        component: AccessControlView,
        meta: { title: '门禁管理', icon: 'Lock', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'school/perimeter',
        name: 'SchoolPerimeter',
        component: PerimeterView,
        meta: { title: '周界防范', icon: 'Warning', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'school/behavior',
        name: 'SchoolBehavior',
        component: BehaviorView,
        meta: { title: '行为分析', icon: 'Basketball', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'school/attendance',
        name: 'SchoolAttendance',
        component: AttendanceView,
        meta: { title: '考勤统计', icon: 'Clock', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'school/visitor',
        name: 'SchoolVisitor',
        component: VisitorManagementView,
        meta: { title: '访客管理', icon: 'User', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'school/security',
        name: 'CampusSecurity',
        component: CampusSecurityView,
        meta: { title: '校园安检', icon: 'Aim', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'school/dashboard',
        name: 'CampusDashboard',
        component: CampusDashboardView,
        meta: { title: '校园态势大屏', icon: 'DataBoard', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'school/campus3d',
        name: 'Campus3D',
        component: Campus3DView,
        meta: { title: '3D 校园', icon: 'MapLocation', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'school/scene-packs',
        name: 'SchoolScenePacks',
        component: SchoolScenePacksView,
        meta: { title: '校园场景包', icon: 'Box', roles: ['admin', 'user', 'viewer'] }
      },
      // ═══ [加油站方案 2026-08-30] 加油站一级模块场景包子页 ═══
      {
        path: 'gas-station/scene-packs',
        name: 'GasScenePacks',
        component: GasScenePacksView,
        meta: { title: '加油站场景包', icon: 'Box', roles: ['admin', 'user', 'viewer'] }
      },
      // [加油站方案 2026-08-30] 加油站 7 子页 (总览/加油区/卸油区/周界/油罐区/态势大屏/3D)
      {
        path: 'gas-station/overview',
        name: 'GasOverview',
        component: GasOverviewView,
        meta: { title: '加油站总览', icon: 'DataAnalysis', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'gas-station/fueling',
        name: 'FuelingArea',
        component: FuelingAreaView,
        meta: { title: '加油区', icon: 'TakeawayBox', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'gas-station/unloading',
        name: 'UnloadingArea',
        component: UnloadingAreaView,
        meta: { title: '卸油区', icon: 'MagicStick', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'gas-station/perimeter',
        name: 'GasPerimeter',
        component: GasPerimeterView,
        meta: { title: '加油站周界', icon: 'Warning', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'gas-station/tank',
        name: 'TankArea',
        component: TankAreaView,
        meta: { title: '油罐区', icon: 'Histogram', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'gas-station/dashboard',
        name: 'GasDashboard',
        component: GasDashboardView,
        meta: { title: '加油站态势大屏', icon: 'DataBoard', roles: ['admin', 'user', 'viewer'] }
      },
      {
        path: 'gas-station/gas3d',
        name: 'Gas3D',
        component: Gas3DView,
        meta: { title: '3D 加油站', icon: 'MapLocation', roles: ['admin', 'user', 'viewer'] }
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
  // [场景账号 2026-08-31] 场景专属用户 (scenario_* 前缀) 等效普通用户:
  //   追加 'user'/'viewer' 使其可进场景页与 devices/linkage/topology,
  //   但 ['admin'] 路由 (用户/角色/权限/设置/OTA/审计等) 仍不可进
  const userRoles = [...userStore.roles]
  if (userRoles.some(role => role.startsWith('scenario_'))) {
    userRoles.push('user', 'viewer')
  }
  const requiredRoles = to.meta.roles as string[] | undefined
  if (requiredRoles && requiredRoles.length > 0) {
    const hasPermission = requiredRoles.some(role => userRoles.includes(role))
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

// [FIX 2026-08-03] 懒加载 chunk 失败自动恢复 (长时间挂机后白屏根因)
//   场景: 页面开着期间前端重新部署 (vite hash 变化, 旧 chunk 被替换),
//   回来后切路由 import() 失败 → router-view 渲染空 → 白屏。
//   处理: 捕获 chunk 加载错误 → 强制整页重载拿最新 index.html。
//   用 sessionStorage 做 10s 防抖, 避免资源真缺失时无限刷新循环。
const CHUNK_ERR_RE = /Failed to fetch dynamically imported module|Loading chunk [^\s]+ failed|error loading dynamically imported module|Unable to preload CSS/i
router.onError((error) => {
  const msg = String(error?.message || '')
  if (!CHUNK_ERR_RE.test(msg)) return
  const KEY = 'shieldbox_chunk_reload_ts'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 10000) {
    console.error('[Router] chunk 加载持续失败, 跳过自动重载:', msg)
    return
  }
  sessionStorage.setItem(KEY, String(Date.now()))
  console.warn('[Router] chunk 版本失效, 自动重载页面:', msg)
  window.location.reload()
})

export default router
