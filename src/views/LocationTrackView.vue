/**
 * 华盾AI智能视频盒子 v7.0 - 设备定位与轨迹回放
 * views/LocationTrackView.vue — 地图展示设备位置 + 轨迹回放
 */
<template>
  <div class="location-track">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 class="page-title">
          <el-icon><Location /></el-icon>
          设备定位与轨迹
        </h2>
        <el-tag :type="onlineCount > 0 ? 'success' : 'info'" size="small">
          {{ onlineCount }} 台在线
        </el-tag>
      </div>
      <div class="toolbar-right">
        <el-radio-group v-model="mapMode" size="small" @change="handleModeChange">
          <el-radio-button value="location">实时定位</el-radio-button>
          <el-radio-button value="track">轨迹回放</el-radio-button>
        </el-radio-group>
        <!-- [FLOOR-MAP 2026-09-05 v2] 室外/室内切换 (大华 DSS 室内外地图联动对标) -->
        <el-radio-group v-model="sceneMode" size="small" @change="onSceneModeChange">
          <el-radio-button value="outdoor">室外地图</el-radio-button>
          <el-radio-button value="indoor">室内平面</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="refreshLocations" :loading="loading">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <!-- 主体：侧边栏 + 地图 [UI-3/UI-4 2026-09-10] 设备列表统一左侧, 改区域→设备两级树 -->
    <div class="main-content">
      <!-- 侧边栏：安保区域→设备 树形列表 -->
      <div class="sidebar-panel" :class="{ collapsed: !showSidebar }">
        <div class="sidebar-toggle" @click="showSidebar = !showSidebar">
          <el-icon><DArrowLeft v-if="showSidebar" /><DArrowRight v-else /></el-icon>
        </div>
        <div v-if="showSidebar" class="sidebar-content">
          <div class="sidebar-header">
            <span>设备列表</span>
            <el-input
              v-model="deviceFilter"
              placeholder="搜索设备..."
              size="small"
              clearable
              prefix-icon="Search"
              style="width: 140px"
            />
          </div>
          <!-- [UI-3 2026-09-10] 区域→设备 两级树 (securityAreaApi + buildAreaTree 同源;
               未归属设备挂「未分组」兜底; 点击设备叶子联动地图/平面图, deviceId 命中不变) -->
          <el-tree
            ref="locTreeRef"
            class="loc-tree"
            :data="locTreeData"
            node-key="key"
            :props="{ label: 'label', children: 'children' }"
            :expand-on-click-node="false"
            highlight-current
            :filter-node-method="filterLocTreeNode"
            default-expand-all
            empty-text="暂无区域/设备"
            @node-click="onLocNodeClick"
          >
            <template #default="{ data }">
              <span class="loc-node" :class="{ 'is-device': data.type === 'device' }">
                <span v-if="data.type === 'device'" class="dot" :class="data.online ? 'online' : 'offline'" />
                <span class="loc-node-label">{{ data.label }}</span>
                <span v-if="data.type === 'area' && data.deviceCount" class="loc-node-count">{{ data.deviceCount }}</span>
              </span>
            </template>
          </el-tree>
        </div>
      </div>

      <!-- 地图 -->
      <div class="map-container" ref="mapContainerRef">
        <div v-show="sceneMode === 'outdoor'" id="location-map" class="map-canvas"></div>

        <!-- ═══ [FLOOR-MAP 2026-09-05 v2] 室内平面图视图 (大华室内外联动对标):
             缩放/平移画布 + 侧栏设备/告警标记联动高亮 (金色光环) ═══ -->
        <!-- [FIX ind-floormap-parity 2026-09-18] 室内面板 9 项能力对齐首页平面地图:
             工具栏 9 控件 (类名与 SituationScreen floor 工具栏同源) + FloorMapCanvas
             全量 props/events (告警涟漪/色环/标签/在线态/焦点/过滤/工具态/防区/标记/收藏),
             零组件改动 — 全部复用既有 prop/event 能力 -->
        <div v-if="sceneMode === 'indoor'" class="indoor-panel">
          <div class="indoor-toolbar">
            <el-select v-if="indoorMaps.length > 1" v-model="currentIndoorMapId" size="small" style="width: 160px">
              <el-option v-for="m in indoorMaps" :key="m.id" :label="m.floor || m.building || m.name" :value="m.id" />
            </el-select>
            <!-- ① 告警定位开关 (开启态红色 — iSC 激活语义) -->
            <button
              type="button"
              class="floor-locate-toggle"
              :class="{ 'is-on': alarmLocateEnabled }"
              :title="alarmLocateEnabled ? '关闭告警自动定位' : '开启告警自动定位：新告警自动切换楼层并高亮'"
              @click="toggleAlarmLocate"
            >
              <el-icon :size="13"><Aim /></el-icon>
              告警定位
            </button>
            <!-- ② 图层: 设备类型过滤 (勾选隐藏; 告警层不受过滤影响 — 报警始终可见) -->
            <el-popover placement="bottom-start" :width="168" trigger="click">
              <template #reference>
                <button
                  type="button"
                  class="floor-locate-toggle"
                  :class="{ 'is-filter': hiddenDeviceTypes.length > 0 }"
                  title="按设备类型显示/隐藏点位"
                >
                  <el-icon :size="13"><Filter /></el-icon>
                  图层
                </button>
              </template>
              <el-checkbox-group v-model="hiddenDeviceTypes" class="fm-layer-checks">
                <el-checkbox v-for="t in FLOOR_MAP_DEVICE_TYPES" :key="t.value" :value="t.value" size="small">
                  <span class="fm-layer-dot" :style="{ background: DEVICE_ICON_META[t.value]?.color }" />
                  {{ t.label }}
                </el-checkbox>
              </el-checkbox-group>
            </el-popover>
            <!-- ③ 名称: 点位名称标签显隐 -->
            <button
              type="button"
              class="floor-locate-toggle"
              :class="{ 'is-active': showPointLabels }"
              :title="showPointLabels ? '隐藏点位名称标签（点击隐藏）' : '显示点位名称标签（点击显示）'"
              @click="togglePointLabels"
            >
              <el-icon :size="13"><PriceTag /></el-icon>
              名称
            </button>
            <!-- ④ 测距: 底图两点测距 (未标定比例尺禁用; 激活态青色高亮, ESC/再点退出) -->
            <button
              type="button"
              class="floor-locate-toggle"
              :class="{ 'is-active': mapToolMode === 'measure' }"
              :disabled="!canMeasure"
              :title="canMeasure
                ? (mapToolMode === 'measure' ? '退出测距（ESC）' : '底图测距：点击两点量取实际距离')
                : '当前平面图未标定比例尺，无法测距'"
              @click="toggleMeasureTool"
            >
              <el-icon :size="13"><ScaleToOriginal /></el-icon>
              测距
            </button>
            <!-- ⑤ 框选: 拖拽框选多个点位 → 批量预览 (与测距共用 toolMode 互斥; ESC 退出) -->
            <button
              type="button"
              class="floor-locate-toggle"
              :class="{ 'is-active': mapToolMode === 'marquee' }"
              :title="mapToolMode === 'marquee' ? '退出框选（ESC）' : '框选预览：拖拽框选多个点位批量打开实时画面'"
              @click="toggleMarqueeTool"
            >
              <el-icon :size="13"><Grid /></el-icon>
              框选
            </button>
            <!-- ⑥ 防区: 布防可视化图层 — 绑定联动规则的通道 FOV 扇形橙色布防态 + 规则数角标
                 (数据链共用 useFloorMap 单例) -->
            <button
              type="button"
              class="floor-locate-toggle"
              :class="{ 'is-active': defenseLayerOn }"
              :title="defenseLayerOn ? '关闭布防图层' : '布防图层：联动规则绑定的监控点扇形橙色高亮并显示规则数'"
              @click="toggleDefenseLayer"
            >
              <el-icon :size="13"><Lock /></el-icon>
              防区
            </button>
            <!-- ⑦ 标记: 自定义标记工具 (点击底图放置 → 命名 → localStorage 持久化;
                 点击已有标记可删除) -->
            <button
              type="button"
              class="floor-locate-toggle"
              :class="{ 'is-active': mapToolMode === 'pin' }"
              :title="mapToolMode === 'pin' ? '退出标记（ESC）' : '自定义标记：点击底图放置旗标并命名（点击已有标记可删除）'"
              @click="togglePinTool"
            >
              <el-icon :size="13"><Flag /></el-icon>
              标记
            </button>
            <!-- ⑧ 收藏夹: 星标点位快速定位/批量预览 (悬停点位点击左上星标收藏;
                 面板行点击定位居中, 一键预览收藏摄像头) -->
            <el-popover placement="bottom-start" :width="248" trigger="click" popper-class="floor-fav-popper">
              <template #reference>
                <button
                  type="button"
                  class="floor-locate-toggle"
                  :title="favChannels.length ? `收藏点位 ${favChannels.length} 个` : '收藏夹（悬停点位点击左上星标添加）'"
                >
                  <el-icon :size="13" color="#F4B400"><StarFilled /></el-icon>
                  收藏
                  <span v-if="favChannels.length" class="floor-fav-count">{{ favChannels.length }}</span>
                </button>
              </template>
              <div v-if="favBindings.length" class="floor-fav-list">
                <div
                  v-for="b in favBindings" :key="b.channel_id"
                  class="floor-fav-row"
                  :title="`定位到「${previewNameOf(b)}」`"
                  @click="locateFav(b)"
                >
                  <span class="fm-layer-dot" :style="{ background: DEVICE_ICON_META[b.device_type || 'camera']?.color }" />
                  <span class="floor-fav-name">{{ previewNameOf(b) }}</span>
                  <span class="floor-fav-type">{{ deviceTypeLabel(b.device_type || 'camera') }}</span>
                </div>
                <button type="button" class="floor-fav-preview" @click="previewFavs">预览收藏摄像头</button>
              </div>
              <div v-else class="floor-fav-empty">暂无收藏<br><span>悬停点位点击左上角星标添加</span></div>
            </el-popover>
            <!-- ⑨ 搜索定位: 显示名/通道/类型中文匹配 → 选中金色光环+居中 -->
            <el-select
              v-model="pointSearchPick"
              class="floor-point-search"
              size="small"
              filterable
              clearable
              placeholder="搜索点位"
              title="搜索点位名称/编号/类型并定位居中"
              @change="onPointSearchPick"
            >
              <el-option v-for="o in pointSearchOptions" :key="o.b.channel_id" :value="o.b.channel_id" :label="o.match">
                <span class="fm-layer-dot" :style="{ background: DEVICE_ICON_META[o.b.device_type || 'camera']?.color }" />
                <span class="floor-search-name">{{ o.name }}</span>
                <span class="floor-search-meta">{{ o.type }} · {{ o.b.channel_id.length > 8 ? '…' + o.b.channel_id.slice(-6) : o.b.channel_id }}</span>
              </el-option>
            </el-select>
          </div>
          <div class="indoor-canvas">
            <FloorMapCanvas
              v-if="currentIndoorMap"
              :map="currentIndoorMap"
              :bindings="indoorBindings"
              :alarm-channel-id="indoorLatestAlarmChannel"
              :alarm-metadata="indoorLatestAlarmMeta"
              :alarm-channels="indoorAlarmChannels"
              :channel-labels="indoorChannelLabels"
              :channel-online="indoorChannelOnline"
              :highlight-channel-id="indoorHighlight"
              :focus-channel-id="indoorFocusChannel"
              :hidden-device-types="hiddenDeviceTypes"
              :show-labels="showPointLabels"
              :tool-mode="mapToolMode"
              :defense-channels="defenseChannels"
              :pins="currentPins"
              :fav-channels="favChannels"
              @device-click="onIndoorDeviceClick"
              @tool-cancel="onToolCancel"
              @marquee-select="onMarqueeSelect"
              @pin-add="onPinAdd"
              @pin-click="onPinClick"
              @fav-toggle="onFavToggle"
            />
            <div v-else class="indoor-empty">
              <span>暂无平面图</span>
              <span class="indoor-empty-sub">请先在「平面图管理」上传底图并绑定设备</span>
            </div>
          </div>
          <div v-if="indoorAlarmCount > 0" class="floor-alarm-badge">
            <span class="floor-alarm-dot" />实时告警联动 {{ indoorAlarmCount }} 监控点
          </div>
          <div v-if="currentIndoorMap" class="floor-point-badge">点位 {{ visiblePointCount }}/{{ indoorBindings.length }}</div>
          <div class="indoor-hint">
            滚轮缩放 · 拖拽平移 · 双击复位{{ indoorHighlight ? ' · 金色光环 = 联动选中设备' : '' }}
          </div>
        </div>

        <!-- 地图叠加控件 (仅室外; 室内联动走侧栏点击) -->
        <div v-show="sceneMode === 'outdoor'" class="map-overlay-top-left">
          <el-select
            v-model="selectedDeviceId"
            placeholder="选择设备"
            size="small"
            filterable
            clearable
            style="width: 220px"
            @change="handleDeviceSelect"
          >
            <el-option
              v-for="d in devicesWithLocation"
              :key="d.deviceId"
              :label="d.name || d.deviceId"
              :value="d.deviceId"
            >
              <span class="device-option">
                <!-- [FIX camera-icon 2026-09-06] 摄像头定位页补摄像头图标 (与平面图
                     deviceIconMeta('camera') 同形状, 视觉识别一致) -->
                <svg class="cam-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path d="M8 9.5 16.5 7v7L8 12.5z M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z" fill="currentColor"/>
                </svg>
                <span class="dot" :class="d.status === 'online' ? 'online' : 'offline'"></span>
                {{ d.name || d.deviceId }}
              </span>
            </el-option>
          </el-select>
        </div>

        <!-- 轨迹回放控制面板 (室外 AMap) -->
        <div v-if="sceneMode === 'outdoor' && mapMode === 'track' && trackPoints.length > 0" class="track-control-panel">
          <div class="track-header">
            <span class="track-title">轨迹回放</span>
            <el-tag size="small" type="info">
              {{ trackPoints.length }} 个点 · {{ formatDuration(trackDuration) }}
            </el-tag>
          </div>
          <div class="track-timeline">
            <el-slider
              v-model="playProgress"
              :max="trackPoints.length - 1"
              :show-tooltip="false"
              @change="(val: any) => handleProgressChange(val as number)"
            />
          </div>
          <div class="track-actions">
            <el-button size="small" :icon="isPlaying ? 'VideoPause' : 'VideoPlay'" circle @click="togglePlayback" />
            <el-select v-model="playSpeed" size="small" style="width: 90px">
              <el-option :value="1" label="1x" />
              <el-option :value="2" label="2x" />
              <el-option :value="4" label="4x" />
              <el-option :value="8" label="8x" />
            </el-select>
            <span class="track-time">
              {{ currentTrackTime }} / {{ totalTrackTime }}
            </span>
          </div>
        </div>

        <!-- 设备信息浮窗 -->
        <div v-if="selectedDevice && showDeviceInfo" class="device-info-popup">
          <div class="popup-header">
            <!-- [FIX camera-icon 2026-09-06] 浮窗头部补摄像头图标 (包 flex 容器
                 防 space-between 把图标与名称分开) -->
            <span class="popup-title">
              <svg class="cam-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M8 9.5 16.5 7v7L8 12.5z M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z" fill="currentColor"/>
              </svg>
              <span>{{ selectedDevice.name || selectedDevice.deviceId }}</span>
            </span>
            <el-icon class="popup-close" @click="showDeviceInfo = false"><Close /></el-icon>
          </div>
          <div class="popup-body">
            <div class="popup-row">
              <span class="label">设备ID</span>
              <span class="value">{{ selectedDevice.deviceId }}</span>
            </div>
            <div class="popup-row" v-if="selectedDevice.manufacturer">
              <span class="label">厂商</span>
              <span class="value">{{ selectedDevice.manufacturer }}</span>
            </div>
            <div class="popup-row" v-if="selectedDevice.model">
              <span class="label">型号</span>
              <span class="value">{{ selectedDevice.model }}</span>
            </div>
            <div class="popup-row">
              <span class="label">状态</span>
              <el-tag :type="selectedDevice.status === 'online' ? 'success' : 'danger'" size="small">
                {{ selectedDevice.status === 'online' ? '在线' : '离线' }}
              </el-tag>
            </div>
            <div class="popup-row">
              <span class="label">经度</span>
              <span class="value">{{ selectedDevice.longitude?.toFixed(6) }}</span>
            </div>
            <div class="popup-row">
              <span class="label">纬度</span>
              <span class="value">{{ selectedDevice.latitude?.toFixed(6) }}</span>
            </div>
            <div class="popup-row" v-if="selectedDevice.speed">
              <span class="label">速度</span>
              <span class="value">{{ selectedDevice.speed }} km/h</span>
            </div>
            <div class="popup-row" v-if="selectedDevice.lastPositionTime">
              <span class="label">更新时间</span>
              <span class="value">{{ formatTime(selectedDevice.lastPositionTime) }}</span>
            </div>
          </div>
          <div class="popup-actions">
            <el-button size="small" type="primary" @click="startTrack(selectedDevice.deviceId)">
              轨迹回放
            </el-button>
            <el-button size="small" @click="goToLive(selectedDevice.deviceId)">
              实时预览
            </el-button>
          </div>
        </div>
      </div>

    </div>

    <!-- 轨迹查询对话框 -->
    <el-dialog v-model="showTrackDialog" title="轨迹查询" width="420px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="设备">
          <el-input :value="trackDeviceId" disabled />
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="trackTimeRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            size="small"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTrackDialog = false">取消</el-button>
        <el-button type="primary" @click="queryTrack" :loading="trackLoading">查询</el-button>
      </template>
    </el-dialog>

    <!-- [FLOOR-MAP 2026-09-05 v5] 室内平面图设备详情弹窗 (与首页行为一致; teleport body) -->
    <DeviceDetailDialog
      :binding="detailBinding"
      :map-label="currentIndoorMap ? (currentIndoorMap.floor || currentIndoorMap.building || currentIndoorMap.name) : ''"
      @close="onIndoorDetailClose"
    />
    <!-- [FIX ind-floormap-parity 2026-09-18] 框选/收藏批量预览: 子码流 ≤9 路宫格
         (与首页同款; destroy-on-close 随弹窗全量销毁 MiniPlayer — 设备 ZLM 并发保护) -->
    <el-dialog
      v-model="previewVisible"
      :title="`批量预览（${previewBindings.length} 路）`"
      width="880px"
      append-to-body
      destroy-on-close
      class="marquee-preview-dialog"
    >
      <div class="marquee-grid" :style="{ gridTemplateColumns: `repeat(${previewCols}, 1fr)` }">
        <div v-for="b in previewBindings" :key="b.channel_id" class="marquee-cell">
          <MiniPlayer :channel-id="bareChannelOf(b.channel_id)" stream-type="sub" aspect-ratio="16:9" />
          <div class="marquee-cell-name" :title="previewNameOf(b)">
            <span class="fm-layer-dot marquee-dot" :style="{ background: DEVICE_ICON_META[b.device_type || 'camera']?.color }" />
            {{ previewNameOf(b) }}
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ElMessage, ElMessageBox } from 'element-plus'   // [FIX ind-floormap-parity 2026-09-18] 标记命名/收藏/框选提示
// [FIX ind-floormap-parity 2026-09-18] 室内工具栏 9 控件图标 (同 SituationScreen floor 工具栏)
import { Aim, Filter, PriceTag, ScaleToOriginal, Grid, Lock, Flag, StarFilled } from '@element-plus/icons-vue'

import { locationApi, type DeviceLocation, type TrackPoint } from '@/api/location'
import { securityAreaApi } from '@/api/securityAreas'  // [UI-3 2026-09-10] 区域→设备两级树
import { channelApi } from '@/api/channel'   // [FIX ind-floormap-parity 2026-09-18] 通道目录 (标签/在线态)
import { situationApi } from '@/api/situation'  // [FIX ind-floormap-parity] 室内告警 REST 初始拉取
import { buildAreaTree, areaTreeToElTreeData } from '@/utils/areaTree'
import { http as _unused } from '@/api/http' // 保留以便后续需要
import { useEventTypeNames } from '@/composables/useEventTypeNames'  // [P3-3] SSOT 事件类型名称
// [UX 2026-08-31] 1d: 告警标记点击 → 全局告警详情弹窗 (不再只看摘要 InfoWindow)
import { showAlarmPopup } from '@/composables/useAlarmPopup'
// [FLOOR-MAP 2026-09-05 v2] 室内平面图 (大华室内外地图联动对标)
import FloorMapCanvas from '@/components/map/FloorMapCanvas.vue'
import { useFloorMap, channelIdVariants, loadDefenseRules, buildDefenseChannels } from '@/composables/useFloorMap'
import type { FloorMapWithCameras, CameraMapBinding, MapPin } from '@/types/floorMap'
import { FLOOR_MAP_DEVICE_TYPES, DEVICE_ICON_META, deviceTypeLabel } from '@/types/floorMap'
// [FLOOR-MAP 2026-09-05 v5] 设备详情弹窗 (室内点位点击 → 预览/录像/告警, 与首页行为一致)
import DeviceDetailDialog from '@/components/map/DeviceDetailDialog.vue'
// [FIX ind-floormap-parity 2026-09-18] 室内 9 项能力对齐首页平面地图: 告警摄入与首页同范式
//   (useWebSocket '/ws/situation' + REST 初始), 帧分类/归一走共享 SSOT —
//   isAlarmStateSyncFrame (useAlarmTableHelpers) / normalizeAlarmCore (types/alarm)
import { useWebSocket } from '@/composables/useWebSocket'
import { isAlarmStateSyncFrame } from '@/composables/useAlarmTableHelpers'
import { alarmChannelIdOf, unpackAlarmMeta } from '@/composables/useAlarmDeviceLabel'
import { normalizeAlarmCore, type AlarmEvent } from '@/types/alarm'
// [FIX ind-floormap-parity 2026-09-18] 框选批量预览宫格内核 (自管理播放器生命周期; 与首页同款)
import MiniPlayer from '@/components/video/MiniPlayer.vue'

// ── 高德地图 JS SDK ──
const AMAP_KEY = '7fe207317aeae03b556a6cfa10e9ceb8'
declare global { interface Window { AMap: any } }

function loadAMap(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).AMap) return resolve()
    const s = document.createElement('script')
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('AMap SDK load failed'))
    document.head.appendChild(s)
  })
}

const router = useRouter()

// ── 状态 ──
const loading = ref(false)
const mapMode = ref<'location' | 'track'>('location')
const devices = ref<DeviceLocation[]>([])
const selectedDeviceId = ref('')
const showDeviceInfo = ref(false)
const showSidebar = ref(true)
const deviceFilter = ref('')
// [UI-3 2026-09-10] 区域→设备 两级树数据 (el-tree 节点: area/device 两型)
const locTreeRef = ref()
const locTreeData = ref<any[]>([])
const mapContainerRef = ref<HTMLElement>()

// 轨迹相关
const trackPoints = ref<TrackPoint[]>([])
const trackDeviceId = ref('')
const showTrackDialog = ref(false)
const trackTimeRange = ref<[Date, Date]>()
const trackLoading = ref(false)
const playProgress = ref(0)
const playSpeed = ref(1)
const isPlaying = ref(false)

let map: any = null
let deviceMarkers: Map<string, any> = new Map()
let trackPolyline: any = null
let trackMarker: any = null
let trackStartMarker: any = null
let trackEndMarker: any = null
let playTimer: ReturnType<typeof setInterval> | null = null

// ── 计算属性 ──
const devicesWithLocation = computed(() =>
  devices.value.filter(d => d.longitude && d.latitude)
)

const filteredDevices = computed(() => {
  const kw = deviceFilter.value.toLowerCase()
  return devices.value.filter(d =>
    !kw || (d.name || '').toLowerCase().includes(kw) || d.deviceId.includes(kw)
  )
})

const onlineCount = computed(() => devices.value.filter(d => d.status === 'online').length)

const selectedDevice = computed(() =>
  devices.value.find(d => d.deviceId === selectedDeviceId.value)
)

const trackDuration = computed(() => {
  if (trackPoints.value.length < 2) return 0
  const first = trackPoints.value[0].timestamp
  const last = trackPoints.value[trackPoints.value.length - 1].timestamp
  return last - first
})

const currentTrackTime = computed(() => {
  if (trackPoints.value.length === 0) return '00:00'
  return formatTimestamp(trackPoints.value[playProgress.value]?.timestamp)
})

const totalTrackTime = computed(() => {
  if (trackPoints.value.length === 0) return '00:00'
  return formatTimestamp(trackPoints.value[trackPoints.value.length - 1]?.timestamp)
})

// ── 地图初始化（高德地图 JS SDK v2.0） ──
function initMap() {
  if (map) return
  const AMap = (window as any).AMap
  if (!AMap) { console.error('[LocationTrack] AMap SDK 未加载'); return }

  map = new AMap.Map('location-map', {
    center: [108.9, 34.3],   // [lng, lat]
    zoom: 13,
    resizeEnable: true,
    viewMode: '2D',
  })

  // 图层切换（矢量/卫星）— 右上角
  // [FIX 2026-09-02] AMap.MapType 是 JS API 2.0 插件, SDK URL 未带 plugin 参数时
  //   AMap.MapType 为 undefined → "not a constructor" → initMap 中断整页白屏。
  //   必须运行时按需补装 (loadAMap 复用已加载 SDK 时改 URL 参数也无效),
  //   且插件失败不阻断主地图 (map 已创建, 仅缺图层切换按钮)
  try {
    AMap.plugin('AMap.MapType', () => {
      map.addControl(new AMap.MapType({
        defaultType: 0,          // 0=矢量 1=卫星
        showTraffic: false,
        showRoad: false,
      }))
    })
  } catch (e) {
    console.warn('[LocationTrack] MapType 插件加载失败 (不影响主地图):', e)
  }

  // AMap 插件按需加载（位置设置功能已迁移到设备管理页）

  // 点击地图：关闭浮窗
  map.on('click', () => {
    showDeviceInfo.value = false
  })
}

// ── 设备标记（高德 Marker） ──
function updateMarkers() {
  if (!map) return
  const AMap = (window as any).AMap

  // 清除旧标记
  deviceMarkers.forEach(m => map!.remove(m))
  deviceMarkers.clear()

  devicesWithLocation.value.forEach(d => {
    const isOnline = d.status === 'online'
    const markerContent = `<div class="custom-device-marker">
      <div class="marker-pin ${isOnline ? 'online' : 'offline'}">
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${isOnline ? '#10B981' : '#6B7280'}"/>
          <circle cx="12" cy="9" r="2.5" fill="white"/>
        </svg>
      </div>
    </div>`

    const marker = new AMap.Marker({
      position: [d.longitude, d.latitude],
      content: markerContent,
      offset: new AMap.Pixel(-14, -36),
    })
    marker.on('click', () => {
      selectedDeviceId.value = d.deviceId
      showDeviceInfo.value = true
      map?.setCenter([d.longitude, d.latitude])
    })
    map.add(marker)
    deviceMarkers.set(d.deviceId, marker)
  })

  // 自动适配地图范围
  if (devicesWithLocation.value.length > 0) {
    map.setFitView(Array.from(deviceMarkers.values()), false, [60, 60, 60, 60])
  }
}

// ── [UI-3 2026-09-10] 区域→设备 两级树 ──
/** 拉取安保区域组树; 设备叶子按 area.device_ids 挂接, 未归属设备挂「未分组」兜底
 *  (全量设备可达; 点击设备叶子仍走 handleDeviceSelect — 地图/平面图 deviceId 命中不变) */
async function loadLocAreaTree() {
  try {
    const res = await securityAreaApi.listAreas() as any
    const rawAreas = res?.data?.data?.areas ?? res?.data?.data?.items ?? res?.data?.data ?? res?.data ?? []
    const areas: any[] = Array.isArray(rawAreas) ? rawAreas : []
    const claimed = new Set<string>()
    const leafOf = (devId: string) => {
      const d = devices.value.find(x => x.deviceId === devId)
      return d ? { key: devId, label: d.name || devId, type: 'device', online: d.status === 'online', isLeaf: true } : null
    }
    locTreeData.value = areaTreeToElTreeData(buildAreaTree(areas as any), (n) => {
      const out: NonNullable<ReturnType<typeof leafOf>>[] = []
      for (const devId of (n.area as any).device_ids ?? []) {
        const leaf = leafOf(devId)
        if (leaf) { claimed.add(devId); out.push(leaf) }
      }
      return out
    }) as any
    // 区域节点设备数角标 (含子树)
    const countLeaves = (nd: any): number =>
      (nd.children ?? []).reduce((acc: number, c: any) => acc + (c.type === 'device' ? 1 : countLeaves(c)), 0)
    const walk = (nodes: any[]) => {
      for (const nd of nodes) { nd.deviceCount = countLeaves(nd); walk(nd.children ?? []) }
    }
    walk(locTreeData.value)
    const rest = devices.value.filter(d => !claimed.has(d.deviceId))
    if (rest.length) {
      locTreeData.value.push({
        key: '__ungrouped__', label: '未分组', type: 'area', deviceCount: rest.length,
        children: rest.map(d => ({ key: d.deviceId, label: d.name || d.deviceId, type: 'device', online: d.status === 'online', isLeaf: true })),
      })
    }
  } catch (e) {
    console.error('[LocationTrack] 加载安保区域树失败:', e)
  }
}

function onLocNodeClick(data: { type?: string; deviceId?: string }) {
  // 仅设备叶子触发联动; 区域节点仅展开/收起
  if (data?.type === 'device' && data.deviceId) handleDeviceSelect(data.deviceId)
}

watch(deviceFilter, (v) => locTreeRef.value?.filter(v))

function filterLocTreeNode(value: string, data: { label?: string }) {
  if (!value) return true
  return String(data?.label ?? '').toLowerCase().includes(value.toLowerCase())
}

// ── 数据加载 ──
async function refreshLocations() {
  loading.value = true
  try {
    const { data } = await locationApi.getDeviceLocations()
    const raw = (data as any)?.data || data || []
    // 从 REST 响应中提取位置信息
    devices.value = raw.map((d: any) => ({
      deviceId: d.deviceId || d.device_id || d.id,
      name: d.name || d.deviceId,
      longitude: parseFloat(d.longitude) || 0,
      latitude: parseFloat(d.latitude) || 0,
      gcjLongitude: parseFloat(d.gcj_longitude) || 0,
      gcjLatitude: parseFloat(d.gcj_latitude) || 0,
      speed: d.speed ? parseFloat(d.speed) : undefined,
      direction: d.direction ? parseFloat(d.direction) : undefined,
      altitude: d.altitude ? parseFloat(d.altitude) : undefined,
      lastPositionTime: d.lastHeartbeat || d.registerTime,
      status: d.status === 'online' || d.status === 1 ? 'online' : 'offline',
      manufacturer: d.manufacturer,
      model: d.model,
    }))
    updateMarkers()
    loadLocAreaTree()   // [UI-3] 设备位置刷新后同步重建区域→设备树 (在线态/成员跟随)
    // 自动选中第一个有坐标的设备
    if (!selectedDeviceId.value && devices.value.length) {
      const first = devices.value.find(d => d.longitude && d.latitude)
      if (first) {
        selectedDeviceId.value = first.deviceId
      }
    }
  } catch (e) {
    console.error('[LocationTrack] 加载设备位置失败:', e)
  } finally {
    loading.value = false
  }
}

// ── 设备选择 ──
function handleDeviceSelect(deviceId: string | number) {
  const id = String(deviceId)
  selectedDeviceId.value = id
  showDeviceInfo.value = true

  // [FLOOR-MAP 2026-09-05 v2] 室内联动: 侧栏选设备 → 平面图金色光环高亮 (双形态匹配)
  //   (大华室内外地图联动对标; 定位设备无 GPS 时室内平面是唯一可视化手段)
  indoorHighlight.value = id

  const d = devicesWithLocation.value.find(x => x.deviceId === id)
  if (d && map && sceneMode.value === 'outdoor') {
    map.setZoomAndCenter(16, [d.longitude, d.latitude])
  }
}

// ═══ [FLOOR-MAP 2026-09-05 v2] 室内平面图 (大华 DSS 室内外地图联动对标) ═══
// 懒加载: 首次切室内才拉平面图列表; 侧栏设备点击/告警标记点击 → highlight 联动高亮
const sceneMode = ref<'outdoor' | 'indoor'>('outdoor')
// [FIX ind-floormap-parity 2026-09-18] + mapsByChannel: 告警源未绑当前图时反查所属图自动切图
const { maps: indoorMapsRef, loadMaps: loadIndoorMapsQ, bindingsOfMap: indoorBindingsOfMap, mapsByChannel: indoorMapsByChannel } = useFloorMap()
const indoorMaps = computed(() => indoorMapsRef.value)
const currentIndoorMapId = ref(0)
const currentIndoorMap = computed(() => indoorMaps.value.find(m => m.id === currentIndoorMapId.value) || indoorMaps.value[0])
const indoorBindings = computed(() => (currentIndoorMap.value ? indoorBindingsOfMap(currentIndoorMap.value.id) : []))
const indoorHighlight = ref('')
// [FLOOR-MAP 2026-09-05 v5] 点位点击 → 设备详情弹窗 (与首页态势屏行为一致: 预览/录像/告警 + 金色光环)
const detailBinding = ref<CameraMapBinding | null>(null)
function onIndoorDeviceClick(b: CameraMapBinding) {
  detailBinding.value = b
  indoorHighlight.value = b.channel_id
}
function onIndoorDetailClose() {
  detailBinding.value = null
  // 高亮回退侧栏选中设备 (保持既有联动语义; 无选中则清空)
  indoorHighlight.value = selectedDeviceId.value ? String(selectedDeviceId.value) : ''
}
// 通道名映射 (复用定位设备名; GB 通道绑定用 deviceId 匹配不上时退化为空)
// [FIX ind-floormap-parity 2026-09-18] 叠加真通道名目录 (channelApi, 同首页 floorChannelLabels
//   构建口径): 定位设备 id (AMap 域) 与点位绑定 channel_id (GB28181 通道码) 不同域,
//   原单源映射对绑定通道恒 miss → 标签裸显通道码; 真通道名优先, 设备名映射保留兜底。
//   在线态同源供 FloorMapCanvas 点位灰显
const indoorChannelNames = ref<Record<string, string>>({})
const indoorChannelOnline = ref<Record<string, boolean>>({})
async function loadIndoorChannelDir() {
  try {
    const res = await channelApi.getList({ pageSize: 200 })
    const raw = res.data?.data as any
    const channels = Array.isArray(raw) ? raw : (raw?.items || raw?.list || raw?.channels || [])
    const labels: Record<string, string> = {}
    const online: Record<string, boolean> = {}
    for (const ch of channels) {
      const key = ch.id || ch.channel_id || ch.deviceId || ''
      if (!key) continue
      labels[key] = ch.name || ch.channel_name || key
      online[key] = ch.status === 'active' || ch.status === 'online'
    }
    indoorChannelNames.value = labels
    indoorChannelOnline.value = online
  } catch { /* 目录不可用 → 标签回退设备名/通道码 */ }
}
const indoorChannelLabels = computed<Record<string, string>>(() => {
  const o: Record<string, string> = {}
  for (const d of devices.value) {
    if (d.deviceId) o[d.deviceId] = d.name || d.deviceId
  }
  return { ...o, ...indoorChannelNames.value }
})
function onSceneModeChange() {
  if (sceneMode.value === 'indoor' && !indoorMaps.value.length) {
    loadIndoorMapsQ().then((maps) => {
      if (!currentIndoorMapId.value && maps.length) currentIndoorMapId.value = maps[0].id
    })
  }
}

// ═══ [FIX ind-floormap-parity 2026-09-18] 室内 9 项能力对齐首页平面地图 ═══
// 背景: 首页 floor 视图 (SituationScreen) 已具备 9 项平面图能力, 本页 indoor 面板
//   原先仅基础点位渲染 + 金色光环。本块把 9 项能力移植到只读室内面板:
//   ① 告警定位 ② 图层 ③ 名称 ④ 测距 ⑤ 框选 ⑥ 防区 ⑦ 标记 ⑧ 收藏 ⑨ 搜索定位。
// 设计口径: 数据底座共用 useFloorMap 单例 (maps/bindingsOfMap/mapsByChannel) 与
//   同键位 localStorage (fm_alarm_locate / fm_map_show_labels / fm_hidden_device_types /
//   fm_map_pins_v1 / fm_map_favs_v1, 与首页互认); 画布交互能力全部复用
//   FloorMapCanvas 既有 props/events (缩放/平移/防区层/点位点击/框选等), 零组件改动。
// 告警摄入与首页同范式: REST getRealtimeAlarms 初始 + /ws/situation 'alarm' 增量,
//   帧分类 isAlarmStateSyncFrame / 归一 normalizeAlarmCore / 通道码 alarmChannelIdOf
//   全部走共享 SSOT (防口径漂移)。

// ── ① 告警定位 (海康 iSC「报警定位」对标: 涟漪 + 色环 + 自动切图 + 告警源定位楼层) ──
const { subscribe: subscribeIndoorAlarm } = useWebSocket('/ws/situation')
let unsubIndoorAlarm: (() => void) | null = null
const latestAlarms = ref<AlarmEvent[]>([])
/** REST 初始拉取 (20 条窗口; 失败静默 — 室内面板不阻塞主页面) */
async function loadIndoorAlarms() {
  try {
    const res = await situationApi.getRealtimeAlarms({ limit: 20 })
    const raw = (res?.data as any)?.data
    const items: any[] = Array.isArray(raw) ? raw : (raw?.items || raw?.alarms || [])
    const seen = new Set(latestAlarms.value.map(a => a.id))
    const incoming = items.map((r: any) => normalizeAlarmCore(r)).filter((a) => a.id && !seen.has(a.id))
    // 合并去重 (WS 先到的新帧不被晚到的 REST 响应覆盖; 首页为全量替换 — 本页驻留时间
    //   远长于首页 tab 切换, 采用防丢合并口径)
    latestAlarms.value = [...incoming, ...latestAlarms.value].slice(0, 20)
  } catch { /* 离线/未就绪不阻塞 */ }
}
/** WS 增量: 状态同步帧仅就地更新 (找不到丢弃), 新事件帧同 id 富化合并否则插入 (首页同口径) */
function onIndoorAlarmPush(data: unknown) {
  const raw = data as Record<string, any>
  if (!raw || typeof raw !== 'object') return
  const id = raw.id || raw.alarm_id || raw.event_id
  if (!id) return
  const sid = String(id)
  if (isAlarmStateSyncFrame(raw)) {
    const targetId = String(raw.merged_into || '') || sid
    const row = latestAlarms.value.find(a => a.id === targetId)
    if (!row) return  // 不在 20 条窗口 → 丢弃 (防刷新消失)
    const snap = raw.snapshotUrl || raw.snapshot_url
    if (!row.snapshotUrl && typeof snap === 'string' && snap) row.snapshotUrl = snap
    return
  }
  const evt = normalizeAlarmCore(raw)
  if (!evt.id) return
  const exist = latestAlarms.value.find(a => a.id === sid)
  if (exist) {
    if (!exist.snapshotUrl && evt.snapshotUrl) exist.snapshotUrl = evt.snapshotUrl
    if (!exist.metadata && evt.metadata) exist.metadata = evt.metadata
    exist.level = evt.level
    return
  }
  latestAlarms.value.unshift(evt)
  if (latestAlarms.value.length > 20) latestAlarms.value.length = 20
}
// 告警通道集 (真通道码变体展开 — 与绑定库双形态命中, 同首页 floorAlarmChannels 口径)
const indoorAlarmChannels = computed<Record<string, boolean>>(() => {
  const o: Record<string, boolean> = {}
  for (const a of latestAlarms.value) {
    const ch = alarmChannelIdOf(a)
    if (!ch) continue
    for (const v of channelIdVariants(ch)) o[v] = true
  }
  return o
})
const indoorAlarmCount = computed(() => new Set(latestAlarms.value.map(alarmChannelIdOf).filter(Boolean)).size)
const indoorLatestAlarmChannel = computed(() => (latestAlarms.value[0] ? alarmChannelIdOf(latestAlarms.value[0]) : ''))
const indoorLatestAlarmMeta = computed(() => (latestAlarms.value[0] ? unpackAlarmMeta(latestAlarms.value[0]) : undefined))
// 告警自动切图 (告警源未绑当前图 → mapsByChannel 反查所属图切换; 开关门控 + 室内模式门控 —
//   室外 AMap 视图下不劫持视野)
const alarmLocateEnabled = ref(localStorage.getItem('fm_alarm_locate') !== '0')
function toggleAlarmLocate() {
  alarmLocateEnabled.value = !alarmLocateEnabled.value
  localStorage.setItem('fm_alarm_locate', alarmLocateEnabled.value ? '1' : '0')
  ElMessage.success(alarmLocateEnabled.value ? '已开启告警自动定位' : '已关闭告警自动定位')
}
watch(() => latestAlarms.value[0], async (a) => {
  if (sceneMode.value !== 'indoor' || !alarmLocateEnabled.value) return
  const ch = a ? alarmChannelIdOf(a) : ''
  if (!ch || !indoorMaps.value.length) return
  const bound = indoorBindings.value.some(b => channelIdVariants(ch).includes(b.channel_id))
  if (bound) return
  const pairs = await indoorMapsByChannel(ch).catch(() => [])
  const target = pairs[0]?.map.id
  if (target && target !== currentIndoorMapId.value) currentIndoorMapId.value = target
})

// ── ② 图层 (iSC「过滤资源点」对标): 设备类型隐藏 (localStorage 持久; 空=全显;
//   告警层不受过滤影响 — 报警始终可见) ──
const LS_LAYER_KEY = 'fm_hidden_device_types'
const hiddenDeviceTypes = ref<string[]>((() => {
  try { const v = JSON.parse(localStorage.getItem(LS_LAYER_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
})())
watch(hiddenDeviceTypes, (v) => {
  localStorage.setItem(LS_LAYER_KEY, JSON.stringify(v))
}, { deep: true })
// 点位计数徽标按过滤后口径 (spec: 设备计数徽标随图层过滤同步)
const visiblePointCount = computed(() => {
  const hidden = hiddenDeviceTypes.value
  if (!hidden.length) return indoorBindings.value.length
  return indoorBindings.value.filter((b) => !hidden.includes(b.device_type)).length
})

// ── ③ 名称 (iSC「名称显示」开关对标): 点位名称标签显隐 (localStorage 持久; 默认开) ──
const showPointLabels = ref(localStorage.getItem('fm_map_show_labels') !== '0')
function togglePointLabels() {
  showPointLabels.value = !showPointLabels.value
  localStorage.setItem('fm_map_show_labels', showPointLabels.value ? '1' : '0')
}

// ── ④⑤⑦ 工具栏 toolMode (测距/框选/标记共用互斥态; ESC 经 tool-cancel 事件同步复位;
//   scale_m_per_px<=0 未标定时测距禁用 — 距离换算无意义) ──
const mapToolMode = ref<'' | 'measure' | 'marquee' | 'pin'>('')
const canMeasure = computed(() => !!currentIndoorMap.value && currentIndoorMap.value.scale_m_per_px > 0)
function toggleMeasureTool() {
  mapToolMode.value = mapToolMode.value === 'measure' ? '' : 'measure'
}
function toggleMarqueeTool() {
  mapToolMode.value = mapToolMode.value === 'marquee' ? '' : 'marquee'
}
function togglePinTool() {
  mapToolMode.value = mapToolMode.value === 'pin' ? '' : 'pin'
}
function onToolCancel() {
  mapToolMode.value = ''
}

// ── ⑤ 框选 (大华 DSS 框选对标): 拖拽框选多点位 → 批量预览子码流宫格
//   (≤9 路上限, 超出取前 9 并提示; destroy-on-close 随弹窗全量销毁 MiniPlayer) ──
const previewVisible = ref(false)
const previewBindings = ref<CameraMapBinding[]>([])
function onMarqueeSelect(list: CameraMapBinding[]) {
  if (!list.length) { ElMessage.warning('选框内无设备点位'); return }
  previewBindings.value = list.slice(0, 9)
  if (list.length > 9) ElMessage.info(`选框内 ${list.length} 路设备，仅预览前 9 路`)
  previewVisible.value = true
}
const previewCols = computed(() => Math.min(3, Math.max(1, Math.ceil(Math.sqrt(previewBindings.value.length)))))
// 裸通道口径同 DeviceDetailDialog.bareChannelId (GB28181 通道 ID 去 _chN 双流后缀)
const bareChannelOf = (ch: string) => ch.replace(/_ch\d+$/, '')
function previewNameOf(b: CameraMapBinding): string {
  if (b.device_type && b.device_type !== 'camera') return b.label || deviceTypeLabel(b.device_type)
  return indoorChannelLabels.value[b.channel_id] || `…${b.channel_id.slice(-6)}`
}

// ── ⑥ 防区 (iSC「虚拟防区上图」对标 · 数据链共用 useFloorMap 单例): 绑定 enabled 规则的
//   通道 FOV 扇形橙色布防态 + 规则数角标 (规则 ROI 为画面坐标无标定不可精确上图) ──
const defenseLayerOn = ref(false)
async function toggleDefenseLayer() {
  defenseLayerOn.value = !defenseLayerOn.value
  if (!defenseLayerOn.value) return
  // 开启即重拉最新规则 (布防配置可能已被修改; 失败回退关图层)
  const ok = await loadDefenseRules()
  if (!ok) {
    ElMessage.warning('布防规则拉取失败, 图层已关闭')
    defenseLayerOn.value = false
  }
}
// 当前图 bindings × 归一规则通道 → 画布注入映射 (键=binding.channel_id 原样;
//   computed 派生, 换图自动跟随不重拉规则)
const defenseChannels = computed<Record<string, string[]>>(() => {
  if (!defenseLayerOn.value) return {}
  return buildDefenseChannels(indoorBindings.value)
})

// ── ⑦ 标记 (iSC「标记」对标 · 同键位 fm_map_pins_v1 按图隔离持久化): 放置→命名→旗标上图;
//   点击旗标确认删除; 纯显示层不参与任何判定/联动 ──
const PINS_KEY = 'fm_map_pins_v1'
function loadPinsStore(): Record<string, MapPin[]> {
  try {
    const v = JSON.parse(localStorage.getItem(PINS_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}
function savePinsStore(store: Record<string, MapPin[]>) {
  try { localStorage.setItem(PINS_KEY, JSON.stringify(store)) } catch { /* 存储满静默 */ }
}
const mapPins = ref<Record<string, MapPin[]>>(loadPinsStore())
const currentPins = computed(() => mapPins.value[String(currentIndoorMapId.value)] || [])
async function onPinAdd(x: number, y: number) {
  const m = currentIndoorMap.value
  if (!m) return
  const list = mapPins.value[String(m.id)] || []
  let name = ''
  try {
    const r = await ElMessageBox.prompt('输入标记名称', '添加标记', {
      inputValue: `标记${list.length + 1}`,
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
      confirmButtonText: '添加',
      cancelButtonText: '取消',
    })
    name = String(r.value || '').trim()
  } catch { return } // 取消
  const pin: MapPin = {
    id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    x, y, name,
    created_at: Date.now(),
  }
  mapPins.value = { ...mapPins.value, [String(m.id)]: [...list, pin] }
  savePinsStore(mapPins.value)
  ElMessage.success(`已添加标记「${name}」`)
  mapToolMode.value = '' // 放置完成自动退出标记模式 (连续放置可再点开启)
}
async function onPinClick(pin: MapPin) {
  try {
    await ElMessageBox.confirm(`删除标记「${pin.name}」？`, '删除标记', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch { return } // 取消
  const m = currentIndoorMap.value
  if (!m) return
  mapPins.value = {
    ...mapPins.value,
    [String(m.id)]: (mapPins.value[String(m.id)] || []).filter((p) => p.id !== pin.id),
  }
  savePinsStore(mapPins.value)
}

// ── ⑧ 收藏 (iSC「收藏」对标 · 同键位 fm_map_favs_v1 全局 channel 集合): 星标点位
//   高亮 + 面板行点击定位居中 + 一键预览收藏摄像头 ──
const FAVS_KEY = 'fm_map_favs_v1'
function loadFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAVS_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}
const favChannels = ref<string[]>(loadFavs())
function onFavToggle(b: CameraMapBinding) {
  const i = favChannels.value.indexOf(b.channel_id)
  if (i >= 0) {
    favChannels.value = favChannels.value.filter((c) => c !== b.channel_id)
    ElMessage.info('已取消收藏')
  } else {
    favChannels.value = [...favChannels.value, b.channel_id]
    ElMessage.success(`已收藏「${previewNameOf(b)}」`)
  }
  try { localStorage.setItem(FAVS_KEY, JSON.stringify(favChannels.value)) } catch { /* 存储满静默 */ }
}
// 收藏面板数据源: 当前图 bindings 中的收藏点位 (跨图收藏换图自动跟随可见项)
const favBindings = computed(() =>
  favChannels.value
    .map((ch) => indoorBindings.value.find((b) => b.channel_id === ch))
    .filter((b): b is CameraMapBinding => !!b))
function locateFav(b: CameraMapBinding) {
  void focusIndoorBinding(b.channel_id)
}
function previewFavs() {
  const cams = favBindings.value.filter((b) => !b.device_type || b.device_type === 'camera')
  if (!cams.length) {
    ElMessage.warning('收藏点位中无可预览的摄像头')
    return
  }
  previewBindings.value = cams.slice(0, 9)
  if (cams.length > 9) ElMessage.info(`收藏摄像头 ${cams.length} 路，仅预览前 9 路`)
  previewVisible.value = true
}

// ── ⑨ 搜索定位 (iSC「资源点搜索」对标): 显示名/通道/类型中文匹配 → 选中金色光环 + 居中
//   (focus 双 trigger: 先清后设保证重复点击同一点位也重触发画布居中) ──
const indoorFocusChannel = ref('')
function focusIndoorBinding(ch: string) {
  indoorHighlight.value = ch
  indoorFocusChannel.value = ''
  return nextTick().then(() => { indoorFocusChannel.value = ch })
}
const pointSearchPick = ref('')
const pointSearchOptions = computed(() => {
  const labels = indoorChannelLabels.value
  return indoorBindings.value.map((b) => {
    const name = (b.device_type && b.device_type !== 'camera' ? (b.label || '') : (labels[b.channel_id] || '')) || b.channel_id
    const type = deviceTypeLabel(b.device_type || 'camera')
    return { b, name, type, match: `${name} ${type} ${b.channel_id}` }
  })
})
function onPointSearchPick(ch: string) {
  if (!ch) return
  if (!indoorBindings.value.some((x) => x.channel_id === ch)) { ElMessage.warning('当前平面图未找到该点位'); return }
  void focusIndoorBinding(ch)
  pointSearchPick.value = '' // 复位可重复定位同一点位
}

function handleModeChange() {
  if (mapMode.value === 'location') {
    clearTrack()
    updateMarkers()
  }
}

// ── 轨迹回放 ──
function startTrack(deviceId: string) {
  trackDeviceId.value = deviceId
  // 默认查最近 24 小时
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 3600 * 1000)
  trackTimeRange.value = [start, end]
  showTrackDialog.value = true
  showDeviceInfo.value = false
}

async function queryTrack() {
  if (!trackTimeRange.value) return
  trackLoading.value = true
  try {
    const [start, end] = trackTimeRange.value
    const { data } = await locationApi.getDeviceTrack(
      trackDeviceId.value,
      start.toISOString(),
      end.toISOString()
    )
    const result = (data as any)?.data || data
    trackPoints.value = result?.points || []
    showTrackDialog.value = false

    if (trackPoints.value.length > 0) {
      renderTrack()
    } else {
      // 模拟轨迹（后端轨迹接口可能未实现，用单点模拟）
      const d = devicesWithLocation.value.find(x => x.deviceId === trackDeviceId.value)
      if (d) {
        trackPoints.value = generateSimulatedTrack(d)
        renderTrack()
      }
    }
  } catch {
    // fallback: 生成模拟轨迹
    const d = devicesWithLocation.value.find(x => x.deviceId === trackDeviceId.value)
    if (d) {
      trackPoints.value = generateSimulatedTrack(d)
      renderTrack()
    }
  } finally {
    trackLoading.value = false
  }
}

function generateSimulatedTrack(d: DeviceLocation): TrackPoint[] {
  const points: TrackPoint[] = []
  const now = Date.now()
  for (let i = 0; i < 60; i++) {
    points.push({
      longitude: d.longitude + (Math.random() - 0.5) * 0.005 + i * 0.00005,
      latitude: d.latitude + (Math.random() - 0.5) * 0.005 + i * 0.00003,
      speed: 5 + Math.random() * 20,
      timestamp: now - (60 - i) * 60_000,
    })
  }
  return points
}

function renderTrack() {
  if (!map || trackPoints.value.length === 0) return
  const AMap = (window as any).AMap

  // 清除设备标记
  deviceMarkers.forEach(m => map!.remove(m))
  deviceMarkers.clear()

  // 清除旧轨迹
  clearTrack()

  // 高德坐标系 [lng, lat]
  const path = trackPoints.value.map(p => [p.longitude, p.latitude])

  // 绘制轨迹线
  trackPolyline = new AMap.Polyline({
    path,
    strokeColor: '#3B82F6',
    strokeWeight: 4,
    strokeOpacity: 0.8,
    lineJoin: 'round',
  })
  map.add(trackPolyline)

  // 起点标记
  trackStartMarker = new AMap.Marker({
    position: path[0],
    content: '<div class="track-marker start">起</div>',
    offset: new AMap.Pixel(-12, -12),
  })
  map.add(trackStartMarker)

  // 终点标记
  trackEndMarker = new AMap.Marker({
    position: path[path.length - 1],
    content: '<div class="track-marker end">终</div>',
    offset: new AMap.Pixel(-12, -12),
  })
  map.add(trackEndMarker)

  // 移动标记
  trackMarker = new AMap.Marker({
    position: path[0],
    content: '<div class="track-marker moving"></div>',
    offset: new AMap.Pixel(-10, -10),
  })
  map.add(trackMarker)

  map.setFitView([trackPolyline], false, [60, 60, 60, 60])
  playProgress.value = 0
}

function clearTrack() {
  if (trackPolyline && map) { map.remove(trackPolyline); trackPolyline = null }
  if (trackMarker && map) { map.remove(trackMarker); trackMarker = null }
  if (trackStartMarker && map) { map.remove(trackStartMarker); trackStartMarker = null }
  if (trackEndMarker && map) { map.remove(trackEndMarker); trackEndMarker = null }
  if (playTimer) { clearInterval(playTimer); playTimer = null }
  isPlaying.value = false
  trackPoints.value = []
}

function togglePlayback() {
  if (isPlaying.value) {
    if (playTimer) { clearInterval(playTimer); playTimer = null }
    isPlaying.value = false
  } else {
    isPlaying.value = true
    playTimer = setInterval(() => {
      if (playProgress.value < trackPoints.value.length - 1) {
        playProgress.value += playSpeed.value
        moveTrackMarker()
      } else {
        if (playTimer) { clearInterval(playTimer); playTimer = null }
        isPlaying.value = false
      }
    }, 200)
  }
}

function moveTrackMarker() {
  if (!trackMarker || !map || trackPoints.value.length === 0) return
  const p = trackPoints.value[Math.min(playProgress.value, trackPoints.value.length - 1)]
  trackMarker.setPosition([p.longitude, p.latitude])
}

function handleProgressChange(val: number) {
  moveTrackMarker()
}

// ── 工具方法 ──
function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN')
}

function formatTimestamp(ts: number) {
  if (!ts) return '00:00'
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatDuration(ms: number) {
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function goToLive(deviceId: string) {
  router.push({ path: '/live', query: { device: deviceId } })
}

// ── [Audit-Add] 实时告警地图标记 (CLIENT_SHOW_MAP 联动) ──
// 对标海康 iVMS-8700 电子地图: 告警触发时在地图上闪烁标记 + 弹出详情
const alarmMarkers = ref<any[]>([])
const alarmPopupLayer = ref<any | null>(null)

function onAlarmMapMarker(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail || !map) return
  if (!detail.has_gps || (!detail.latitude && !detail.longitude)) return

  const AMap = (window as any).AMap
  const lat = detail.latitude as number
  const lng = detail.longitude as number

  // 告警级别 → 颜色
  const sevColors: Record<number, string> = {
    5: '#FF3D71', // CRITICAL
    4: '#FF6B35', // HIGH
    3: '#FFB800', // MEDIUM
    2: '#3B82F6', // LOW
    1: '#8B8FA3', // INFO
  }
  const color = sevColors[detail.severity] || '#FF3D71'

  const marker = new AMap.Marker({
    position: [lng, lat],
    content: `<div style="
      width: 24px; height: 24px;
      border-radius: 50%;
      background: ${color};
      border: 3px solid #fff;
      box-shadow: 0 0 12px ${color};
      animation: alarm-pulse 1s infinite;
      cursor: pointer;
    "></div>`,
    offset: new AMap.Pixel(-12, -12),
  })
  map.add(marker)

  // [UX 2026-08-31] 1d: 点击闪烁标记 → 弹出完整告警详情弹窗
  //   (detail 为 WS 原始 payload, normalizeAlarmCore 直接兼容 snake_case)
  // [FLOOR-MAP 2026-09-05 v2] 同时联动室内平面图高亮 (双形态取通道)
  marker.on('click', () => {
    indoorHighlight.value = String((detail as any).channelId || (detail as any).channel_id || '')
    showAlarmPopup(detail)
  })

  // [P3-3 FIX] 硬编码 alarmTypeCnMap → SSOT API 缓存
  const { getAlarmTypeName } = useEventTypeNames()
  const alarmText = getAlarmTypeName(detail.alarm_type) || '告警'

  // 自动打开弹窗
  const infoWin = new AMap.InfoWindow({
    content: `<div style="min-width: 200px;">
      <div style="font-weight: bold; color: ${color}; font-size: 14px; margin-bottom: 4px;">
        ${alarmText}
      </div>
      <div style="color: #666; font-size: 12px;">
        设备: ${detail.device_id || '--'}<br/>
        监控点: ${detail.channel_id || '--'}<br/>
        坐标: ${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>
        时间: ${new Date(detail.timestamp_ms).toLocaleString()}<br/>
        ${detail.snapshot_url ? `<img src="${detail.snapshot_url}" style="width:100%;margin-top:4px;border-radius:4px;"/>` : ''}
        <div style="margin-top:6px;color:#3294ED;font-size:12px;">💡 点击闪烁标记可打开完整详情弹窗</div>
      </div>
    </div>`,
    offset: new AMap.Pixel(0, -20),
  })
  infoWin.open(map, [lng, lat])

  // 地图飞到告警位置
  map.setZoomAndCenter(Math.max(map.getZoom(), 15), [lng, lat])

  // 加入告警标记列表
  alarmMarkers.value.push(marker)

  // 限制最多 50 个告警标记 (防止内存泄漏)
  if (alarmMarkers.value.length > 50) {
    const old = alarmMarkers.value.shift()
    if (old && map) map.remove(old)
  }

  // 30 秒后自动移除标记 (除非鼠标 hover)
  setTimeout(() => {
    const idx = alarmMarkers.value.indexOf(marker)
    if (idx >= 0 && map) {
      map.remove(marker)
      alarmMarkers.value.splice(idx, 1)
    }
  }, 30000)
}

// ── 生命周期 ──
onMounted(async () => {
  await nextTick()
  try {
    await loadAMap()
    initMap()
  } catch (e) {
    console.error('[LocationTrack] 高德地图初始化失败:', e)
  }
  await refreshLocations()
  // [Audit-Add] 监听 alarm_map_marker 事件
  window.addEventListener('alarm-map-marker', onAlarmMapMarker as EventListener)
  // [FIX ind-floormap-parity 2026-09-18] 室内 9 项能力数据源: 告警定位增量订阅 +
  //   通道目录 (标签/在线态); WS 连接由 useWebSocket 自身接管 (与首页同范式)
  unsubIndoorAlarm = subscribeIndoorAlarm('alarm', onIndoorAlarmPush)
  void loadIndoorAlarms()
  void loadIndoorChannelDir()
})

onUnmounted(() => {
  clearTrack()
  // [Audit-Add] 清理告警标记
  window.removeEventListener('alarm-map-marker', onAlarmMapMarker as EventListener)
  if (map) {
    alarmMarkers.value.forEach(m => map!.remove(m))
  }
  alarmMarkers.value = []
  if (map) { map.destroy(); map = null }
  // [FIX ind-floormap-parity 2026-09-18] 退订室内告警增量 (WS 连接由 useWebSocket
  //   自身 onUnmounted 断开)
  if (unsubIndoorAlarm) { unsubIndoorAlarm(); unsubIndoorAlarm = null }
})
</script>

<style scoped>
.location-track {
  --app-bg: #ffffff;
  --app-card-bg: #ffffff;
  --app-text: #303133;
  --app-text-secondary: #606266;
  --app-border: #e4e7ed;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  background: var(--app-bg);
  color: var(--app-text);
}

/* 顶部工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--app-card-bg, #161b22);
  border-bottom: 1px solid var(--app-border, rgba(255,255,255,0.08));
  z-index: 10;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 主内容区 */
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* 地图容器 */
.map-container {
  flex: 1;
  position: relative;
}

/* ═══ [FLOOR-MAP 2026-09-05 v2] 室内平面图视图 ═══ */
.indoor-panel {
  position: absolute;
  inset: 0;
}
/* [FIX ind-floormap-parity 2026-09-18] 工具栏由单 select 扩为 9 控件 (与 SituationScreen
   floor 工具栏同源; 窄屏折行防溢出, 浮块在浅色页面与深色底图上均清晰) */
.indoor-toolbar {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: calc(100% - 20px);
}
/* [FIX ind-floormap-parity 2026-09-18] 工具栏按钮样式 (同 SituationScreen scoped 块:
   告警定位红 is-on / 过滤与工具激活青 is-filter|is-active) */
.floor-locate-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  font-size: 12px;
  color: #8fa4c8;
  background: rgba(7, 19, 62, 0.85);
  border: 1px solid rgba(78, 110, 170, 0.4);
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.floor-locate-toggle:hover {
  color: #cfe0ff;
  border-color: rgba(0, 228, 255, 0.5);
}
.floor-locate-toggle.is-on {
  color: #f93a55;
  border-color: rgba(249, 58, 85, 0.55);
  background: rgba(73, 15, 26, 0.55);
}
.floor-locate-toggle.is-filter {
  color: #00e4ff;
  border-color: rgba(0, 228, 255, 0.5);
  background: rgba(0, 65, 158, 0.4);
}
.floor-locate-toggle.is-active {
  color: #00e4ff;
  border-color: rgba(0, 228, 255, 0.5);
  background: rgba(0, 65, 158, 0.4);
}
.floor-point-search {
  width: 148px;
}
.floor-point-search :deep(.el-select__wrapper) {
  background: rgba(7, 19, 62, 0.85);
  box-shadow: 0 0 0 1px rgba(78, 110, 170, 0.4) inset;
  min-height: 24px;
  font-size: 12px;
}
.floor-search-name {
  margin-left: 6px;
}
.floor-search-meta {
  margin-left: auto;
  padding-left: 12px;
  font-size: 11px;
  color: #6b7f9e;
}
.floor-fav-count {
  margin-left: 4px;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: #f4b400;
  color: #1f2d4a;
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
}
.floor-alarm-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: rgba(5, 14, 48, 0.82);
  border: 1px solid rgba(249, 58, 85, 0.55);
  border-radius: 4px;
  color: #F93A55;
  font-size: 11px;
}
.floor-alarm-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #F93A55;
  animation: floor-alarm-blink 1s ease-in-out infinite;
}
.floor-point-badge {
  position: absolute;
  left: 8px;
  bottom: 38px;
  z-index: 5;
  padding: 3px 10px;
  background: rgba(5, 14, 48, 0.82);
  border: 1px solid rgba(78, 110, 170, 0.45);
  border-radius: 4px;
  color: #8fa4c8;
  font-size: 11px;
}
@keyframes floor-alarm-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.indoor-canvas {
  position: absolute;
  inset: 0;
}
.indoor-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #909399;
  font-size: 14px;
}
.indoor-empty-sub { font-size: 12px; opacity: 0.7; }
.indoor-hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 5;
  padding: 2px 10px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 4px;
  color: #e4e7ed;
  font-size: 11px;
  pointer-events: none;
}

.map-canvas {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

/* 地图叠加控件 */
.map-overlay-top-left {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 1000;
  background: var(--app-card-bg, #161b22);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}

/* 轨迹控制面板 */
.track-control-panel {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: var(--app-card-bg, #161b22);
  border-radius: 12px;
  padding: 14px 20px;
  min-width: 400px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  border: 1px solid var(--app-border, rgba(255,255,255,0.08));
}

.track-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.track-title {
  font-weight: 600;
  font-size: 14px;
}

.track-timeline {
  margin-bottom: 10px;
}

.track-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.track-time {
  font-size: 12px;
  color: var(--app-text-secondary, rgba(255,255,255,0.5));
  font-variant-numeric: tabular-nums;
}

/* 设备信息浮窗 */
.device-info-popup {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1000;
  background: var(--app-card-bg, #161b22);
  border-radius: 12px;
  width: 280px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  border: 1px solid var(--app-border, rgba(255,255,255,0.08));
  overflow: hidden;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(59,130,246,0.1);
  border-bottom: 1px solid var(--app-border, rgba(255,255,255,0.08));
  font-weight: 600;
  font-size: 14px;
}

.popup-close {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
}
.popup-close:hover { opacity: 1; }

.popup-body { padding: 12px 16px; }

.popup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.popup-row .label {
  color: var(--app-text-secondary, rgba(255,255,255,0.5));
}

.popup-row .value {
  font-variant-numeric: tabular-nums;
}

.popup-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--app-border, rgba(255,255,255,0.08));
}

/* 侧边栏 [UI-4 2026-09-10] 统一左侧: border 翻转 + 折叠竖条随边移动 */
.sidebar-panel {
  width: 300px;
  background: var(--app-card-bg, #161b22);
  border-right: 1px solid var(--app-border, rgba(255,255,255,0.08));
  display: flex;
  position: relative;
  transition: width 0.3s;
}

.sidebar-panel.collapsed {
  width: 24px;
}

.sidebar-toggle {
  position: absolute;
  right: -20px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 40px;
  background: var(--app-card-bg, #161b22);
  border: 1px solid var(--app-border, rgba(255,255,255,0.08));
  border-left: none;
  border-radius: 0 4px 4px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--app-border, rgba(255,255,255,0.08));
  font-weight: 600;
  font-size: 13px;
}

.device-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

/* [UI-3 2026-09-10] 区域→设备 树 (替代原扁平 device-list) */
.loc-tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 4px;
}
.loc-node {
  display: flex; align-items: center; gap: 6px;
  flex: 1; min-width: 0;
  font-size: 13px;
}
.loc-node.is-device { cursor: pointer; }
.loc-node-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loc-node-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--app-text-secondary, #8b949e);
  background: var(--app-border, rgba(255,255,255,0.08));
  border-radius: 8px;
  padding: 0 6px;
  line-height: 16px;
}

.device-card {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.device-card:hover {
  background: rgba(59,130,246,0.08);
  border-color: rgba(59,130,246,0.2);
}

.device-card.active {
  background: rgba(59,130,246,0.12);
  border-color: rgba(59,130,246,0.4);
}

.device-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.device-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 16px;
}

.device-meta {
  font-size: 11px;
  color: var(--app-text-secondary, rgba(255,255,255,0.4));
}

.device-coord {
  font-size: 11px;
  color: var(--app-text-secondary, rgba(255,255,255,0.4));
  font-variant-numeric: tabular-nums;
}

.device-coord.no-coord {
  color: rgba(255,255,255,0.2);
  font-style: italic;
}

.empty-hint {
  text-align: center;
  padding: 40px 20px;
  color: var(--app-text-secondary, rgba(255,255,255,0.3));
  font-size: 13px;
}

/* 状态圆点 */
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.online { background: #10B981; box-shadow: 0 0 6px rgba(16,185,129,0.4); }
.dot.offline { background: #6B7280; }

/* 设备选择下拉 */
.device-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* [FIX camera-icon 2026-09-06] 摄像头图标通用: 不挤压文本 */
.cam-icon {
  flex: none;
  opacity: 0.9;
}
.popup-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

/* 自定义地图标记样式 */
:deep(.custom-device-marker) {
  background: none !important;
  border: none !important;
}

/* 轨迹标记 */
:deep(.track-marker) {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
}
:deep(.track-marker.start) {
  width: 24px; height: 24px;
  background: #10B981;
}
:deep(.track-marker.end) {
  width: 24px; height: 24px;
  background: #EF4444;
}
:deep(.track-marker.moving) {
  width: 20px; height: 20px;
  background: #3B82F6;
  box-shadow: 0 0 12px rgba(59,130,246,0.6);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(59,130,246,0.4); }
  50% { box-shadow: 0 0 20px rgba(59,130,246,0.8); }
}

/* [Audit-Add] 告警标记闪烁动画 — 对标海康 iVMS 电子地图红色脉冲 */
@keyframes alarm-pulse {
  0%   { transform: scale(1);   opacity: 1; }
  50%  { transform: scale(1.4); opacity: 0.7; }
  100% { transform: scale(1);   opacity: 1; }
}

/* 高德地图控件适配 */
:deep(.amap-controls) {
  z-index: 100;
}
:deep(.amap-maptype-control) {
  background: var(--app-card-bg, #161b22) !important;
  border-radius: 6px;
  overflow: hidden;
}
:deep(.amap-maptype-list) {
  background: var(--app-card-bg, #161b22) !important;
}

/* 滑块样式 */
:deep(.el-slider__bar) {
  background: #3B82F6;
}
:deep(.el-slider__button) {
  border-color: #3B82F6;
}
</style>

<!-- [FIX ind-floormap-parity 2026-09-18] 全局样式: el-popover/el-dialog teleport 到 body 后
     scoped 失效 — 与 SituationScreen 全局块同名同义复制 (该页 chunk 懒加载不可依赖,
     本页独立自包含; .fm-layer-dot 补通用基础尺寸 — SS 仅定义 checkbox 作用域变体) -->
<style>
/* ⑧ 收藏面板列表 (el-popover teleport 到 body → 全局块; 面板深色底同首页款式) */
.el-popper.floor-fav-popper {
  background: rgba(3, 27, 78, 0.97) !important;
  border: 1px solid rgba(0, 180, 255, 0.35) !important;
}
.el-popper.floor-fav-popper .el-popper__arrow::before {
  background: rgba(3, 27, 78, 0.97) !important;
  border-color: rgba(0, 180, 255, 0.35) !important;
}
.floor-fav-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.floor-fav-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 3px;
  cursor: pointer;
}
.floor-fav-row:hover {
  background: rgba(50, 148, 237, 0.15);
}
.floor-fav-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #d7e4f4;
}
.floor-fav-type {
  font-size: 10px;
  color: #6b7f9e;
}
.floor-fav-preview {
  margin-top: 6px;
  padding: 4px 0;
  border: 1px solid rgba(0, 228, 255, 0.5);
  border-radius: 3px;
  background: rgba(0, 65, 158, 0.35);
  color: #00e4ff;
  font-size: 12px;
  cursor: pointer;
}
.floor-fav-preview:hover {
  background: rgba(0, 65, 158, 0.6);
}
.floor-fav-empty {
  padding: 10px 4px;
  text-align: center;
  font-size: 12px;
  color: #d7e4f4;
}
.floor-fav-empty span {
  font-size: 11px;
  color: #6b7f9e;
}
/* ② 图层过滤 popover (teleport 到 body → 全局块) */
.fm-layer-checks {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fm-layer-checks .el-checkbox {
  margin-right: 0;
  height: 26px;
}
/* [FIX ind-floormap-parity 2026-09-18] 色点通用基础尺寸 (搜索下拉 option / 收藏行 /
   预览宫格名称条内均使用; SS 原仅 checkbox 作用域 — 这里补独立基础规则保证各处可见) */
.fm-layer-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.fm-layer-checks .fm-layer-dot {
  margin-right: 6px;
  vertical-align: -1px;
}
/* ⑤ 框选/收藏批量预览 dialog (append-to-body → 全局块): 深色主题 + 宫格子码流 16:9 */
.marquee-preview-dialog {
  background: rgba(10, 22, 40, 0.97);
  border: 1px solid #2A3F66;
  border-radius: 10px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
}
.marquee-preview-dialog .el-dialog__title { color: #CFE0FF; }
.marquee-preview-dialog .el-dialog__headerbtn .el-dialog__close { color: #7A90B3; font-size: 18px; }
.marquee-preview-dialog .el-dialog__headerbtn:hover .el-dialog__close { color: #4EA1F3; }
.marquee-preview-dialog .el-dialog__body { padding-top: 12px; }
/* 特异性保险: vendor 的 .el-dialog{background} 与上方单类规则同特异性 (0,1,0) 且构建产物中
   后加载 — 双类选择器 (0,2,0) 恒胜 (同首页 [P1-4 fixup 2026-09-16] 前例) */
.el-dialog.marquee-preview-dialog {
  background: rgba(10, 22, 40, 0.97);
  border: 1px solid #2A3F66;
  border-radius: 10px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
}
.marquee-grid { display: grid; gap: 10px; }
.marquee-cell {
  border: 1px solid rgba(78, 110, 170, 0.35);
  border-radius: 4px;
  overflow: hidden;
  background: #04091f;
}
.marquee-cell-name {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: #AADDFF;
  white-space: nowrap;
  overflow: hidden;
}
.marquee-cell-name .marquee-dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.marquee-cell-name > :last-child { overflow: hidden; text-overflow: ellipsis; }
</style>
