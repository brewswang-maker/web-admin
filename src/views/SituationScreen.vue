<template>
  <div class="situation-screen">
    <!-- <div class="ss-header">
      <h1>🛡️ 华盾AI 安全态势大屏</h1>
      <div class="ss-header-right">
        <span class="ss-clock">{{ currentTime }}</span>
        <el-tag :type="connected ? 'success' : 'danger'" effect="dark" size="small">
          {{ connected ? '实时在线' : '连接断开' }}
        </el-tag>
      </div>
    </div> -->

    <div class="ss-body">
      <!-- 左侧面板 -->
      <div class="ss-col left-col">
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-anquanpingfen panel-title-icon" aria-hidden="true"></i>
            <span>{{ t('situationScreen.securityScore') }}</span>
          </div>
          <div class="score-gauge" ref="scoreGaugeRef" v-if="!overviewFailed && overview"></div>
          <div v-else-if="!overviewFailed" class="empty-state panel-empty">
            <!-- <i class="iconfont1 icon1-anquanpingfen score-empty-icon" aria-hidden="true"></i> -->
            <span>{{ t('situationScreen.noScoreData') }}</span>
          </div>
          <div v-else class="empty-state error">
            <span>{{ t('situationScreen.overviewFailed') }}</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">{{ t('situationScreen.retry') }}</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-jinritongji panel-title-icon" aria-hidden="true"></i>
            <span>{{ t('situationScreen.todayStats') }}</span>
          </div>
          <div class="stats-grid" v-if="!overviewFailed && todayStats.length">
            <div class="stat-card" v-for="s in todayStats" :key="s.label">
              <div class="stat-main">
                <i :class="['iconfont1', s.icon, 'stat-icon']" :style="{ color: s.iconColor }" aria-hidden="true"></i>
                <div class="stat-value">
                  {{ s.value }}<span v-if="s.suffix" class="stat-unit">{{ s.suffix }}</span>
                </div>
              </div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
          <div v-else-if="!overviewFailed" class="empty-state panel-empty">{{ t('situationScreen.noTodayStats') }}</div>
          <div v-else class="empty-state error">
            <span>{{ t('situationScreen.todayStatsFailed') }}</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">{{ t('situationScreen.retry') }}</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-shebeizhuangtai panel-title-icon" aria-hidden="true"></i>
            <span>{{ t('situationScreen.deviceStatus') }}</span>
          </div>
          <div class="device-status-list" v-if="!overviewFailed && deviceStatusGroups.length" role="list">
            <div
              v-for="device in deviceStatusGroups"
              :key="device.key"
              class="device-status-row"
              role="listitem"
            >
              <div
                :ref="el => setDevicePieRef(el, device.key)"
                class="device-status-pie"
                :aria-label="`${device.label}online rate ${deviceOnlineRate(device)}%，online ${device.online}，offline ${device.offline}，fault ${device.fault}`"
                role="img"
              ></div>
              <div class="device-status-info">
                <div class="device-status-heading">
                  <span class="device-status-icon">
                    <i
                      :class="['iconfont1', device.key === 'video-box' ? 'icon1-neicun' : 'icon1-shexiangtou2']"
                      aria-hidden="true"
                    ></i>
                  </span>
                  <span>{{ device.label }}（{{ device.total }}）</span>
                </div>
                <div class="device-status-counts">
                  <span class="device-count online"><i></i>{{ t('situationScreen.onlineLabel') }}：<b>{{ device.online }}</b></span>
                  <span class="device-count offline"><i></i>{{ t('situationScreen.offlineLabel') }}：<b>{{ device.offline }}</b></span>
                  <span class="device-count fault"><i></i>{{ t('situationScreen.faultLabel') }}：<b>{{ device.fault }}</b></span>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="!overviewFailed" class="empty-state panel-empty">{{ t('situationScreen.noDeviceData') }}</div>
          <div v-else class="empty-state error">
            <span>{{ t('situationScreen.deviceFailed') }}</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">{{ t('situationScreen.retry') }}</el-button>
          </div>
        </div>
      </div>

      <!-- 中间地图 -->
      <div class="ss-col center-col">
        <div class="ss-panel map-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-yuanqu1 panel-title-icon" aria-hidden="true"></i>
            <!-- 标题位置直接用下拉选择器替代 -->
            <el-tooltip :content="centerView === '3d' ? t('situationScreen.sceneHint') : ''" placement="bottom" :disabled="centerView !== '3d'">
              <el-select
                v-model="centerView"
                class="title-view-select"
                popper-class="title-view-popper"
                size="small"
                @change="onViewSelectChange"
              >
                <el-option label="园区态势图" value="3d" />
                <el-option label="视频监控" value="video" />
              </el-select>
            </el-tooltip>
            <span v-if="sceneIsDemo && centerView === '3d'" style="font-size:11px;color:#F4B400;border:1px solid rgba(244,180,0,0.6);border-radius:3px;padding:1px 6px;margin-left:4px;">演示数据</span>
            <!-- 3D视图操作按钮 -->
            <template v-if="centerView === '3d'">
              <el-select
                v-if="availableScenes.length > 1"
                v-model="currentSceneId"
                size="small"
                style="width: 110px"
                @change="onSceneSwitch"
              >
                <el-option v-for="s in availableScenes" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
              <button v-if="!sceneEditActive && sceneDevices.length && !sceneIsDemo" class="scene-edit-btn" @click="enterEditMode">编辑布局</button>
              <span v-if="sceneEditActive" style="font-size:11px;color:#F4B400;margin-left:4px;">编辑模式</span>
              <button v-if="sceneDevices.length" class="scene-edit-btn" @click="togglePatrol">{{ patrolActive ? '停止巡视' : '自动巡视' }}</button>
              <el-dropdown v-if="sceneDevices.length" trigger="click" @command="runPresetPlan">
                <button class="scene-edit-btn">预案演练 ▾</button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-for="(p, i) in presetPlans" :key="i" :command="i">{{ p.name }}</el-dropdown-item>
                    <el-dropdown-item divided @click="stopPresetPlan" v-if="sequenceActive">停止演练</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <button v-if="sceneDevices.length" class="scene-edit-btn" @click="showMiniMap = !showMiniMap">{{ showMiniMap ? '隐藏小地图' : '显示小地图' }}</button>
            </template>
            <!-- 视频监控视图操作按钮 -->
            <template v-if="centerView === 'video'">
              <button class="scene-edit-btn" :class="{active: videoLayout === 1}" @click="setVideoLayout(1)">1分屏</button>
              <button class="scene-edit-btn" :class="{active: videoLayout === 4}" @click="setVideoLayout(4)">4分屏</button>
              <button class="scene-edit-btn" :class="{active: videoPollingActive}" @click="toggleVideoPolling">{{ videoPollingActive ? '停止轮巡' : '开始轮巡' }}</button>
              <span style="font-size:11px;color:#236db7;">{{ videoDeviceList.length }}个通道</span>
            </template>
            <!-- 全屏按钮（推至右侧） -->
            <div class="title-right-controls">
              <el-tooltip content="全屏" placement="bottom">
                <button class="scene-edit-btn fullscreen-btn" type="button" @click="toggleFullscreen">
                  <i class="iconfont1 icon1-fangda" aria-hidden="true"></i>
                </button>
              </el-tooltip>
            </div>
          </div>
          <!-- 视图切换容器 -->
          <div class="swipe-container">
          <transition :name="slideDirection" mode="out-in">
          <div v-if="centerView === '3d'" key="3d" class="center-view-3d">
          <div class="scene-container-with-panel" v-if="sceneDevices.length">
            <Scene3D
              ref="scene3dRef"
              class="scene3d-wrapper"
              :devices="sceneDevices"
              :buildings="sceneBuildings"
              :edit-mode="sceneEditActive"
              :selected-device-id="selectedDeviceId"
              :show-mini-map="showMiniMap"
              @device-drag="onDeviceDrag"
              @device-select="onDeviceSelect"
              @building-hover="onBuildingHover"
              @minimap-select="onMinimapSelect"
              @device-video="onDeviceVideo"
            />
            <div class="building-hover-overlay" v-if="hoveredBuilding">
              <div class="building-hover-name">{{ hoveredBuilding.name }}</div>
              <div class="building-hover-stats">
                <span>设备 {{ hoveredBuilding.deviceCount }}</span>
                <span style="color:#0F9D58">在线 {{ hoveredBuilding.online }}</span>
                <span v-if="hoveredBuilding.alarm" style="color:#DB4437">告警 {{ hoveredBuilding.alarm }}</span>
              </div>
            </div>
            <SceneEditPanel
              v-if="sceneEditActive"
              :selected-device="selectedEditDevice"
              :buildings="sceneBuildings"
              @device-updated="onDeviceUpdated"
              @device-cleared="onDeviceCleared"
              @exit="exitEditMode"
            />
          </div>
          <div v-else-if="devicesFailed" class="empty-state error scene-empty">
            <span>{{ t('situationScreen.mapFailed') }}</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">{{ t('situationScreen.retry') }}</el-button>
          </div>
          <div v-else class="empty-state panel-empty scene-empty">{{ t('situationScreen.noMapDevice') }}</div>
          </div>
          </transition>
          <transition :name="slideDirection" mode="out-in">
          <div v-if="centerView === 'video' && !isFullscreen" key="video" class="center-view-video">
            <div class="video-monitor-grid" :class="'vm-grid-' + videoLayout">
              <div v-for="(slot, idx) in videoDisplaySlots" :key="idx" class="vm-cell">
                <video :ref="(el: any) => setVideoSlotRef(el, idx)" class="vm-video" muted autoplay playsinline
                  :style="{ display: slot.playing ? 'block' : 'none' }" />
                <div v-if="slot.loading" class="vm-loading">连接中...</div>
                <div v-if="!slot.playing && !slot.loading" class="vm-empty">
                  <i class="iconfont1 icon1-yingyanshexiangtou" style="font-size:32px;opacity:0.3"></i>
                  <span>{{ videoDeviceList.length ? '等待轮巡' : '无可用通道' }}</span>
                </div>
                <div v-if="slot.playing" class="vm-label">{{ slot.deviceName }}</div>
              </div>
            </div>
          </div>
          </transition>
          </div><!-- /swipe-container -->
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-gaojing panel-title-icon" aria-hidden="true"></i>
            <span>{{ t('situationScreen.realtimeAlarm') }}</span>
            <button class="alarm-more" type="button" :title="t('situationScreen.moreAlarms')" :aria-label="t('situationScreen.moreAlarms')" @click="goToAlarms">
              <i class="iconfont1 icon1-zuozuo-" aria-hidden="true"></i>
            </button>
          </div>
          <div class="alarm-table" v-if="!alarmsFailed">
            <div class="alarm-table-row alarm-table-head">
              <span>{{ t('situationScreen.colLevel') }}</span>
              <span>{{ t('situationScreen.colSnapshot') }}</span>
              <span>{{ t('situationScreen.colGroup') }}</span>
              <span>{{ t('situationScreen.colType') }}</span>
              <span>{{ t('situationScreen.colTime') }}</span>
              <span>{{ t('situationScreen.colStatus') }}</span>
              <span>{{ t('situationScreen.colAction') }}</span>
            </div>
            <el-scrollbar class="alarm-scroll">
              <div class="alarm-table-body">
                <div
                  v-for="alarm in latestAlarms"
                  :key="alarm.id"
                  :class="['alarm-table-row', 'alarm-row', alarm.level, { 'is-unhandled': alarm.status === '未处理' }]"
                >
                  <span class="alarm-level"><b>{{ alarmLevelText(alarm.level) }}</b></span>
                  <span class="alarm-snapshot">
                    <el-image
                      v-if="getSnapshotUrl(alarm)"
                      :src="getSnapshotUrl(alarm)"
                      :preview-src-list="getSnapshotUrl(alarm) ? [getSnapshotUrl(alarm)] : []"
                      fit="cover"
                      :alt="t('situationScreen.colSnapshot')"
                      preview-teleported
                      hide-on-click-modal
                      @error="onSnapshotError"
                    />
                    <span v-else class="alarm-snapshot-empty" :title="t('situationScreen.noSnapshot', { id: alarm.id })">
                      <i class="iconfont1 icon1-wushuju" aria-hidden="true"></i>
                    </span>
                  </span>
                  <span class="alarm-location" :title="alarm.location">{{ alarm.location }}</span>
                  <span class="alarm-type" :title="alarm.type">{{ alarm.type }}</span>
                  <span class="alarm-time">{{ alarm.time }}</span>
                  <span class="alarm-status">
                    <el-tag :type="alarm.status === '已处置' ? 'success' : 'warning'" size="small" effect="dark">
                      {{ alarmStatusText(alarm.status) }}
                    </el-tag>
                  </span>
                  <button class="alarm-action" type="button" @click="goToAlarms">
                    {{ alarm.status === '已处置' ? t('situationScreen.viewDetail') : t('situationScreen.toHandle') }}
                  </button>
                </div>
                <div v-if="!latestAlarms.length" class="empty-state panel-empty" style="margin-top:20px;">{{ t('situationScreen.noLatestAlarm') }}</div>
              </div>
            </el-scrollbar>
          </div>
          <div v-else class="empty-state error">
            <span>{{ t('situationScreen.alarmFailed') }}</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">{{ t('situationScreen.retry') }}</el-button>
          </div>
        </div>
      </div>

      <!-- 右侧面板 -->
      <div class="ss-col right-col">
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-zhongguohangtiantubiaoheji-weizhuanlunkuo- panel-title-icon" aria-hidden="true"></i>
            <span>{{ t('situationScreen.alarmTypeDist') }}</span>
          </div>
          <div class="chart-box" ref="alarmTypeRef" v-if="!overviewFailed && overview"></div>
          <div v-else-if="!overviewFailed" class="empty-state panel-empty">{{ t('situationScreen.noAlarmType') }}</div>
          <div v-else class="empty-state error">
            <span>{{ t('situationScreen.alarmTypeFailed') }}</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">{{ t('situationScreen.retry') }}</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-qushi panel-title-icon" aria-hidden="true"></i>
            <span>{{ t('situationScreen.alarmTrend') }}</span>
            <div class="trend-mode-switch" style="margin-left: auto">
              <button v-for="m in trendModes" :key="m.value" :class="['mode-btn', { active: alarmTrendMode === m.value }]" @click="switchAlarmTrendMode(m.value)">{{ m.label }}</button>
            </div>
          </div>
          <div class="chart-box" ref="alarmTrendRef" v-if="!hourlyFailed && (hourlyData.length || alarmTrendData.length)"></div>
          <div v-else-if="!hourlyFailed" class="empty-state panel-empty">{{ t('situationScreen.noHourlyData') }}</div>
          <div v-else class="empty-state error">
            <span>{{ t('situationScreen.hourlyFailed') }}</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">{{ t('situationScreen.retry') }}</el-button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="panel-title">
            <i class="iconfont1 icon1-agent panel-title-icon" aria-hidden="true"></i>
            <span>{{ t('situationScreen.agentBar') }}</span>
          </div>
          <div class="chart-box" ref="agentBarRef" v-if="!agentsFailed && agentData.length"></div>
          <div v-else-if="!agentsFailed" class="empty-state panel-empty">{{ t('situationScreen.noAgentData') }}</div>
          <div v-else class="empty-state error">
            <span>{{ t('situationScreen.agentFailed') }}</span>
            <el-button size="small" link type="primary" @click="fetchSituationData">{{ t('situationScreen.retry') }}</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 全屏覆盖层 -->
  <Teleport to="body">
    <div v-if="isFullscreen" class="fullscreen-overlay" @keydown.esc="exitFullscreen" tabindex="0">
      <button class="fullscreen-exit-btn" type="button" @click="exitFullscreen" title="退出全屏 (ESC)">
        <i class="iconfont1 icon1-suoxiao" aria-hidden="true"></i>
      </button>
      <div class="fullscreen-content">
        <div class="fullscreen-inner">
          <!-- 全屏：3D视图 -->
          <template v-if="centerView === '3d'">
            <div class="fullscreen-3d-scene" v-if="sceneDevices.length">
              <Scene3D
                ref="fullscreenScene3dRef"
                class="scene3d-wrapper"
                :devices="sceneDevices"
                :buildings="sceneBuildings"
                :show-mini-map="showMiniMap"
                @device-drag="onDeviceDrag"
                @device-select="onDeviceSelect"
                @building-hover="onBuildingHover"
                @minimap-select="onMinimapSelect"
                @device-video="onDeviceVideo"
              />
            </div>
            <div v-else class="fullscreen-empty">{{ t('situationScreen.noMapDevice') }}</div>
          </template>
          <!-- 全屏：视频监控 -->
          <template v-if="centerView === 'video'">
            <div class="fullscreen-video-area">
              <div class="fullscreen-video-toolbar">
                <button class="scene-edit-btn" :class="{active: videoLayout === 1}" @click="setVideoLayout(1)">1分屏</button>
                <button class="scene-edit-btn" :class="{active: videoLayout === 4}" @click="setVideoLayout(4)">4分屏</button>
                <button class="scene-edit-btn" :class="{active: videoPollingActive}" @click="toggleVideoPolling">{{ videoPollingActive ? '停止轮巡' : '开始轮巡' }}</button>
                <span style="font-size:12px;color:#236db7;margin-left:auto">{{ videoDeviceList.length }}个通道</span>
              </div>
              <div class="fullscreen-video-grid" :class="'vm-grid-' + videoLayout">
                <div v-for="(slot, idx) in videoDisplaySlots" :key="idx" class="vm-cell">
                  <video :ref="(el: any) => setVideoSlotRef(el, idx)" class="vm-video" muted autoplay playsinline
                    :style="{ display: slot.playing ? 'block' : 'none' }" />
                  <div v-if="slot.loading" class="vm-loading">连接中...</div>
                  <div v-if="!slot.playing && !slot.loading" class="vm-empty">
                    <i class="iconfont1 icon1-yingyanshexiangtou" style="font-size:32px;opacity:0.3"></i>
                    <span>{{ videoDeviceList.length ? '等待轮巡' : '无可用通道' }}</span>
                  </div>
                  <div v-if="slot.playing" class="vm-label">{{ slot.deviceName }}</div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>

  <el-dialog
    v-model="videoPreviewVisible"
    :title="'\u5b9e\u65f6\u9884\u89c8 - ' + (videoPreviewDevice?.name || '')"
    width="680px"
    append-to-body
    destroy-on-close
    @close="closeVideoPreview"
    class="video-preview-dialog"
  >
    <div class="video-preview-container">
      <div v-if="videoPreviewLoading" style="height:200px;display:flex;align-items:center;justify-content:center;color:#00B4FF">
        <span>\u89c6\u9891\u8fde\u63a5\u4e2d...</span>
      </div>
      <video ref="previewVideoRef" muted autoplay playsinline style="width:100%;max-height:420px;background:#000;display:block" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts/core'
import { GaugeChart, LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  GraphicComponent, GridComponent, TooltipComponent, LegendComponent, TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { situationApi, type SituationOverview, type SituationAlarmStream, type SituationAgentStatus } from '@/api/situation'
import { statsHttp, streamHttp } from '@/api/http'
import { normalizeStreamUrl } from '@/utils/streamUrl'
import { locationApi } from '@/api/location'
import { sceneApi } from '@/api/scene'
import { useWebSocket } from '@/composables/useWebSocket'
import Scene3D from '@/components/Scene3D.vue'
import SceneEditPanel from '@/components/SceneEditPanel.vue'
import flvjs from 'flv.js'
import { channelApi } from '@/api/channel'
import { useChannelStore } from '@/stores/channel'
import {
  normalizeMapDevicePoint,
  normalizeGb28181Location,
  normalizePlacement,
  mergeDeviceLocations,
  mergePlacements,
  mapDevicesToScene,
  DEMO_SCENE_DEVICES,
  type SceneDevice3D,
  type RawMapDevicePoint,
} from '@/utils/sceneDeviceMapper'

echarts.use([GaugeChart, LineChart, PieChart, BarChart, GraphicComponent, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const router = useRouter()
const { t } = useI18n()

// ── WebSocket实时推送 ──
const { connected, subscribe } = useWebSocket('/ws/situation')
let unsubAlarm: (() => void) | null = null

// 时钟
const currentTime = ref('')
let clockTimer: ReturnType<typeof setInterval> | null = null

// ECharts refs
const scoreGaugeRef = ref<HTMLElement>()
const alarmTrendRef = ref<HTMLElement>()
const alarmTypeRef = ref<HTMLElement>()
const agentBarRef = ref<HTMLElement>()
const devicePieRefs = new Map<string, HTMLElement>()

function setDevicePieRef(el: unknown, key: string) {
  if (el instanceof HTMLElement) devicePieRefs.set(key, el)
  else devicePieRefs.delete(key)
}

// ── 数据状态 ──
interface Alarm {
  id: string
  time: string
  location: string
  type: string
  level: string
  status: string
  snapshotUrl?: string
  /** 后端 metadata 透传: 含 snapshot_base64/snapshot_format, 用于 base64 兜底 */
  metadata?: Record<string, unknown>
}
const latestAlarms = ref<Alarm[]>([])

function goToAlarms() {
  router.push('/alarms')
}

function alarmLevelText(level: string): string {
  return ({ critical: t('situationScreen.levelCritical'), high: t('situationScreen.levelHigh'), medium: t('situationScreen.levelMedium'), low: t('situationScreen.levelLow') } as Record<string, string>)[level] ?? level
}

function alarmStatusText(status: string): string {
  if (status === '已处置') return t('situationScreen.handled')
  if (status === '未处理') return t('situationScreen.unhandled')
  return status
}

const todayStats = ref<Array<{ label: string; value: string; suffix: string; icon: string; iconColor: string }>>([])

function formatRate(value: number | null | undefined): string {
  if (value == null) return '--'
  return String(Number(value.toFixed(1)))
}

// ── API 返回的原始数据（用于图表更新） ──
const overview = ref<SituationOverview | null>(null)
const hourlyData = ref<Array<{ hour: number; alarmCount: number; onlineDevices: number }>>([])

// ── 告警趋势切换 (24h/7d/30d) ──
const trendModes = computed(() => [
  { value: '24h' as const, label: t('situationScreen.trendToday') },
  { value: '7d' as const, label: t('situationScreen.trend7d') },
  { value: '30d' as const, label: t('situationScreen.trend30d') },
])
const alarmTrendMode = ref<'24h' | '7d' | '30d'>('24h')
const alarmTrendData = ref<Array<{ hour: string; count: number }>>([])
const agentData = ref<SituationAgentStatus[]>([])
// 设备状态
interface DeviceStatusGroup {
  key: string
  label: string
  total: number
  online: number
  offline: number
  fault: number
}
const deviceStatusGroups = ref<DeviceStatusGroup[]>([])
const alarmFalsePositiveRate = ref<number | null>(null)

function deviceOnlineRate(device: DeviceStatusGroup): number {
  if (device.total <= 0) return 0
  return Math.round((device.online / device.total) * 100)
}

// 各端点的加载/失败状态（用于显式提示）
const overviewLoading = ref(false)
const overviewFailed = ref(false)
const devicesFailed = ref(false)
const alarmsFailed = ref(false)
const agentsFailed = ref(false)
const hourlyFailed = ref(false)

// ── 3D场景数据 ──
const DEFAULT_SCENE_BUILDINGS = [
  { name: '1号车间', x: -20, z: -15, w: 24, d: 16, h: 8, color: '#1A73E8' },
  { name: '2号车间', x: 15, z: -15, w: 20, d: 14, h: 7, color: '#0F9D58' },
  { name: '仓库', x: -25, z: 15, w: 18, d: 12, h: 6, color: '#F4B400' },
  { name: '办公楼', x: 20, z: 15, w: 16, d: 12, h: 12, color: '#7C3AED' },
  { name: '配电房', x: 35, z: -5, w: 8, d: 8, h: 4, color: '#666666' },
  { name: '门卫室', x: 0, z: 42, w: 6, d: 4, h: 3, color: '#888888' },
]
const sceneBuildings = ref(DEFAULT_SCENE_BUILDINGS)

// ── 编辑模式状态 ──
const sceneEditActive = ref(false)
const selectedDeviceId = ref<string | undefined>(undefined)
const selectedEditDevice = ref<{
  id: string
  name: string
  businessId?: string
  x: number; y: number; z: number
  rotation: number; fov: number
  buildingId?: string
  isManual?: boolean
} | null>(null)

// P1-6: 场景切换
const availableScenes = ref<Array<{ id: string; name: string }>>([])
const currentSceneId = ref('default')
function onSceneSwitch(sceneId: string) {
  void loadSceneDevices()
}

const sceneDevices = ref<SceneDevice3D[]>([])
/** 当前 3D 场景是否使用演示数据兜底（真实设备为空/接口失败时） */
const sceneIsDemo = ref(false)

// P2: Scene3D 组件引用（用于调用 exposed 方法）
const scene3dRef = ref<InstanceType<typeof Scene3D> | null>(null)

// P2-4: 巡视路线
const patrolActive = ref(false)
function togglePatrol() {
  if (!scene3dRef.value) return
  if (patrolActive.value) {
    scene3dRef.value.stopPatrol()
    patrolActive.value = false
  } else {
    // 预定义巡视路径（环绕厂区）
    const waypoints = [
      { x: 55, y: 35, z: 45 },
      { x: 0, y: 40, z: 55 },
      { x: -55, y: 35, z: 45 },
      { x: -60, y: 30, z: 0 },
      { x: -55, y: 35, z: -45 },
      { x: 0, y: 40, z: -55 },
      { x: 55, y: 35, z: -45 },
      { x: 60, y: 30, z: 0 },
    ]
    scene3dRef.value.startPatrol(waypoints, 0.0003)
    patrolActive.value = true
  }
}

// P2-5: 预案演练
const presetPlans = [
  {
    name: '入侵告警演练',
    actions: [
      { time: 0, type: 'camera' as const, params: { x: 25, y: 15, z: 10, lookX: 35, lookY: 4, lookZ: 25 } },
      { time: 1, type: 'highlight' as const, target: 'cam4' },
      { time: 1, type: 'particle' as const, target: 'intrusion', params: { x: 35, y: 4, z: 25 } },
      { time: 4, type: 'camera' as const, params: { x: 0, y: 50, z: 70, lookX: 0, lookY: 0, lookZ: 0 } },
    ],
  },
  {
    name: '设备巡检',
    actions: [
      { time: 0, type: 'camera' as const, params: { x: -40, y: 10, z: -35, lookX: -40, lookY: 4, lookZ: -35 } },
      { time: 2, type: 'camera' as const, params: { x: 20, y: 10, z: -38, lookX: 20, lookY: 4, lookZ: -38 } },
      { time: 4, type: 'camera' as const, params: { x: -15, y: 10, z: 5, lookX: -15, lookY: 5, lookZ: 5 } },
      { time: 6, type: 'camera' as const, params: { x: 0, y: 50, z: 70, lookX: 0, lookY: 0, lookZ: 0 } },
    ],
  },
]
const sequenceActive = ref(false)
function runPresetPlan(planIndex: number) {
  if (!scene3dRef.value) return
  scene3dRef.value.stopSequence()
  scene3dRef.value.playSequence(presetPlans[planIndex].actions)
  sequenceActive.value = true
  ElMessage.success('开始演练: ' + presetPlans[planIndex].name)
}
function stopPresetPlan() {
  if (!scene3dRef.value) return
  scene3dRef.value.stopSequence()
  sequenceActive.value = false
}

// P2-6: 小地图
const showMiniMap = ref(true)
function onMinimapSelect(deviceId: string) {
  selectedDeviceId.value = deviceId
  const dev = sceneDevices.value.find(d => d.id === deviceId)
  if (dev) {
    ElMessage.info('已定位: ' + dev.name)
  }
}

// ── T2: 中间面板 3D/视频 手动切换 ──
const centerView = ref<'3d' | 'video'>('3d')
const slideDirection = ref<'slide-left' | 'slide-right'>('slide-left')

// 全屏状态
const isFullscreen = ref(false)
const fullscreenScene3dRef = ref<InstanceType<typeof Scene3D> | null>(null)

function setCenterView(view: '3d' | 'video') {
  slideDirection.value = view === '3d' ? 'slide-right' : 'slide-left'
  centerView.value = view
}

function onViewSelectChange(val: '3d' | 'video') {
  slideDirection.value = val === '3d' ? 'slide-right' : 'slide-left'
}

// 视图切换: 进入视频视图自动开始轮巡，离开则停止
let centerViewTimer: ReturnType<typeof setTimeout> | null = null
watch(centerView, (newView) => {
  // 清除上一次的延迟启动（防止快速切换 3D↔视频 时竞态）
  if (centerViewTimer) { clearTimeout(centerViewTimer); centerViewTimer = null }
  if (newView === 'video') {
    // 等待 transition (out-in 模式: 先离开 0.35s + 后进入 0.35s) 完成
    // 确保 video DOM 元素已创建后再开始轮巡
    centerViewTimer = setTimeout(() => {
      centerViewTimer = null
      if (centerView.value !== 'video') return
      if (!videoDeviceList.value.length) {
        loadVideoDeviceList().then(() => {
          if (videoDeviceList.value.length && centerView.value === 'video') startVideoPolling()
        })
      } else if (!videoPollingActive.value) {
        startVideoPolling()
      }
    }, 800)
  } else {
    stopVideoPolling()
  }
})

// 全屏切换: 仅重建 flv.js 播放器，不 teardown/start 流（避免 SIP INVITE/BYE 风暴）
// 原因: v-if 互斥渲染导致 video DOM 元素重建，旧 flv.js player 绑定在已移除的元素上。
//       解决方案: 销毁旧 player → 等待新 DOM → 用存储的 flvUrl 重新 attach（不调 /start）
let fullscreenTimer: ReturnType<typeof setTimeout> | null = null
watch(isFullscreen, () => {
  if (fullscreenTimer) { clearTimeout(fullscreenTimer); fullscreenTimer = null }
  if (centerView.value !== 'video') return
  // 先销毁所有旧播放器（不调 stopStream，保留服务端推流）
  for (let i = 0; i < 4; i++) {
    const slot = videoSlots[i]
    if (slot.flvPlayer) { try { slot.flvPlayer.destroy() } catch {} slot.flvPlayer = null }
  }
  // 暂停轮巡定时器（防止 reattach 期间定时器触发新拉流）
  if (videoPollTimer) { clearInterval(videoPollTimer); videoPollTimer = null }
  // 等待 transition leave 完成(~350ms) + 新 video DOM 挂载后重新绑定播放器
  fullscreenTimer = setTimeout(() => {
    fullscreenTimer = null
    if (centerView.value !== 'video') return
    for (let i = 0; i < 4; i++) reattachPlayer(i)
    // 恢复轮巡定时器
    if (videoPollingActive.value) {
      videoPollTimer = setInterval(() => pollVideoBatch(), videoPollIntervalSec.value * 1000)
    }
  }, 500)
})

// 全屏功能
function toggleFullscreen() {
  if (isFullscreen.value) exitFullscreen()
  else enterFullscreen()
}

function enterFullscreen() {
  isFullscreen.value = true
  nextTick(() => {
    const overlay = document.querySelector('.fullscreen-overlay') as HTMLElement
    overlay?.focus()
    // 全屏3D需要重新初始化场景
    if (centerView.value === '3d') {
      setTimeout(() => {
        fullscreenScene3dRef.value?.resetCamera?.()
      }, 200)
    }
  })
}

function exitFullscreen() {
  isFullscreen.value = false
}

// ── T3: 视频监控布局 + 轮巡 (完整 GB28181 推流实现) ──
const videoLayout = ref<1 | 4>(4)
interface VideoSlot {
  channelId: string
  deviceName: string
  playing: boolean
  loading: boolean
  flvPlayer: flvjs.Player | null
  flvUrl: string  // 最近一次成功拉取的 FLV URL（全屏切换时复用，避免重新 SIP INVITE）
  _gen: number  // 异步取消计数器，每次新拉流递增
}
const videoSlots = reactive<VideoSlot[]>(
  Array.from({ length: 4 }, () => ({ channelId: '', deviceName: '', playing: false, loading: false, flvPlayer: null, flvUrl: '', _gen: 0 }))
)
// 全局防抖 store: 防止短时间内对同一通道重复 SIP INVITE (与 MiniPlayer/LiveView 共享)
const channelStore = useChannelStore()
const videoDisplaySlots = computed(() => videoLayout.value === 1 ? [videoSlots[0]] : videoSlots)
const videoSlotRefs = ref<Record<number, HTMLVideoElement>>({})
const videoPollingActive = ref(false)
let videoPollTimer: ReturnType<typeof setInterval> | null = null
const videoDeviceList = ref<Array<{ channelId: string; deviceName: string }>>([])
const videoPollOffset = ref(0)
// GB28181 设备需要 BYE 冷却(~5s) + SIP INVITE + RTP 建立(~5s) = ~10s 开销
// 30s 间隔确保至少 20s 实际观看时间，避免设备频繁断连
const videoPollIntervalSec = ref(30)

function setVideoSlotRef(el: any, idx: number) {
  if (el) videoSlotRefs.value[idx] = el as HTMLVideoElement
  else delete videoSlotRefs.value[idx]
}

async function loadVideoDeviceList() {
  try {
    const res = await channelApi.getList({ pageSize: 100 })
    const raw = res.data?.data as any
    // PageResponse<ChannelItem> 结构: { items, total, ... }
    const channels = Array.isArray(raw) ? raw : (raw?.items || raw?.list || raw?.channels || [])
    if (Array.isArray(channels) && channels.length) {
      videoDeviceList.value = channels.map((ch: any) => ({
        channelId: ch.id || ch.channel_id || ch.deviceId || '',
        deviceName: ch.name || ch.channel_name || ch.deviceName || '未命名通道',
      })).filter((c: any) => c.channelId)
    }
  } catch { /* ignore */ }
  if (!videoDeviceList.value.length && sceneDevices.value.length) {
    videoDeviceList.value = sceneDevices.value
      .filter(d => d.businessId || d.deviceType === 'camera')
      .map(d => ({ channelId: d.id, deviceName: d.name }))
  }
}

/**
 * 获取可播放的 FLV URL（含全局防抖保护，防止 SIP INVITE 风暴）。
 *
 * 策略 (对齐 MiniPlayer.vue):
 * 1. 先查 multi-urls 复用已有流（避免不必要的 SIP INVITE）
 * 2. 流不存活时，检查全局防抖窗口（5s 内同通道只允许一次 /start）
 * 3. 防抖窗口内: 等待其他调用者的 INVITE 完成
 * 4. 防抖窗口外: 触发 SIP INVITE 后轮询等待就绪
 */
async function startStreamAndGetFlvUrl(channelId: string): Promise<string> {
  // 查询 multi-urls 的可复用辅助函数（返回 URL 或空串，附带 streamAlive 状态）
  const queryMultiUrls = async (): Promise<{ url: string; alive: boolean | null }> => {
    try {
      const { data } = await streamHttp.get(`/${channelId}/multi-urls`)
      const d = data?.data || data
      if (d?.streamAlive && d?.flvUrl) {
        return { url: normalizeStreamUrl(d.flvUrl), alive: true }
      }
      return { url: '', alive: d ? d.streamAlive === false ? false : null : null }
    } catch { return { url: '', alive: null } }
  }

  // 1. 先查 multi-urls 复用已有流 (3 次 × 300ms = 0.9s)
  for (let attempt = 0; attempt < 3; attempt++) {
    const { url } = await queryMultiUrls()
    if (url) return url
    await new Promise(r => setTimeout(r, 300))
  }

  // 2. 流不存活 → 检查全局防抖
  const inDebounce = channelStore.checkSkipStart(channelId)
  if (inDebounce) {
    // 防抖窗口内: 其他调用者最近调过 /start，等待其流就绪
    console.debug(`[SituationScreen] ch=${channelId} 全局防抖窗口内，跳过 SIP INVITE，等待复用`)
    for (let attempt = 0; attempt < 15; attempt++) {
      const { url } = await queryMultiUrls()
      if (url) return url
      await new Promise(r => setTimeout(r, 300))
    }
    return ''
  }

  // 3. 防抖窗口外 → 触发 SIP INVITE
  channelStore.markStartCalled(channelId)
  let startData: any = null
  try {
    const { data: startResp } = await streamHttp.post(`/${channelId}/start`)
    startData = startResp?.data || startResp
  } catch (e: any) {
    console.warn(`[SituationScreen] /streams/${channelId}/start failed (may already be streaming):`, e?.message || e)
  }

  // /start 响应中 zlmReady=true 时直接有 URL
  if (startData && startData.flvUrl && startData.zlmReady) {
    return normalizeStreamUrl(startData.flvUrl)
  }

  // 4. 轮询 multi-urls 等待流就绪 (最多 ~4.5s)
  let consecutiveNotAlive = 0
  for (let attempt = 0; attempt < 15; attempt++) {
    const { url, alive } = await queryMultiUrls()
    if (url) return url
    // 连续 5 次 streamAlive=false → 设备可能离线，提前终止
    if (alive === false) {
      consecutiveNotAlive++
      if (consecutiveNotAlive >= 5) break
    } else {
      consecutiveNotAlive = 0
    }
    await new Promise(r => setTimeout(r, 300))
  }

  return ''
}

/** 停止服务端推流 (释放 SIP 会话) */
async function stopStream(channelId: string) {
  if (!channelId) return
  try { await streamHttp.post(`/${channelId}/stop`) } catch { /* ignore */ }
}

async function playVideoInSlot(slotIdx: number, channelId: string, deviceName: string) {
  const slot = videoSlots[slotIdx]
  // 递增 generation，使旧异步操作的结果失效
  slot._gen++
  const myGen = slot._gen

  // 记住旧通道 ID，稍后用于停止推流
  const oldChannelId = slot.channelId

  // 先清理旧播放器（但不停止服务端推流——延迟到新流就绪后）
  if (slot.flvPlayer) { try { slot.flvPlayer.destroy() } catch {} slot.flvPlayer = null }

  slot.channelId = channelId
  slot.deviceName = deviceName
  slot.loading = true
  slot.playing = false

  try {
    // 启动 GB28181 推流并等待就绪
    const flvUrl = await startStreamAndGetFlvUrl(channelId)
    // 如果在等待期间又有新的拉流请求，放弃这次结果
    if (myGen !== slot._gen) return

    // 新流已就绪，现在安全地停止旧通道推流（减少空窗期）
    if (oldChannelId && oldChannelId !== channelId) {
      stopStream(oldChannelId)
    }

    if (!flvUrl) {
      slot.loading = false
      console.warn(`[SituationScreen] 无法获取通道 ${channelId} 的视频流`)
      return
    }

    // 保存 URL 供全屏切换时复用（避免重新 SIP INVITE）
    slot.flvUrl = flvUrl
    // video 元素已常驻 DOM（v-show 模式），直接获取
    slot.playing = true
    slot.loading = false
    await nextTick()

    // 再次检查 generation
    if (myGen !== slot._gen) return

    const video = videoSlotRefs.value[slotIdx]
    if (!video) { slot.playing = false; return }

    // 清理 video 元素旧状态
    try { video.pause() } catch {}
    video.removeAttribute('src')
    try { video.load() } catch {}

    if (flvjs.isSupported()) {
      const player = flvjs.createPlayer(
        { type: 'flv', url: flvUrl, isLive: true, hasAudio: false, hasVideo: true },
        {
          enableStashBuffer: false,
          stashInitialSize: 128,
          autoCleanupSourceBuffer: false,  // GB28181 PS 封装流时间戳可能不连续
          lazyLoad: false,
          liveBufferLatencyChasing: true,
          liveBufferLatencyChasingOnPaused: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 1.5,
        } as any
      )
      player.attachMediaElement(video)
      player.load()
      // 显式设 muted=true 满足浏览器自动播放策略
      video.muted = true
      player.play().catch(() => {
        // 自动播放可能被浏览器策略阻止（异步等待 SIP INVITE 后丢失用户手势上下文）
        // 延迟重试：此时 MSE 数据已填充，video.play() 通常可以成功
        setTimeout(() => {
          if (myGen !== slot._gen) return
          video.muted = true
          video.play().catch(() => {})
        }, 200)
      })
      // 最终检查：如果又被取消了，销毁刚创建的 player
      if (myGen !== slot._gen) {
        try { player.destroy() } catch {}
        return
      }
      slot.flvPlayer = player
    } else {
      slot.playing = false
      slot.loading = false
      console.warn('[SituationScreen] 浏览器不支持 flv.js')
    }
  } catch (e: any) {
    if (myGen === slot._gen) {
      slot.loading = false
      console.error(`[SituationScreen] 播放通道 ${channelId} 失败:`, e?.message || e)
    }
  }
}

function stopVideoSlot(slotIdx: number) {
  const slot = videoSlots[slotIdx]
  slot._gen++  // 使任何在途的异步拉流失效
  if (slot.flvPlayer) { try { slot.flvPlayer.destroy() } catch {} slot.flvPlayer = null }
  // 清理 video 元素
  const video = videoSlotRefs.value[slotIdx]
  if (video) { try { video.pause() } catch {} video.removeAttribute('src') }
  // 停止服务端推流
  if (slot.channelId) {
    stopStream(slot.channelId)
  }
  slot.playing = false; slot.loading = false; slot.channelId = ''; slot.deviceName = ''; slot.flvUrl = ''
}

/**
 * 仅重建 flv.js 播放器（不调 /start 或 /stop），用于全屏切换时 DOM 重建后重新绑定。
 * 关键: 不触发 SIP INVITE/teardown，避免设备压力。
 */
function reattachPlayer(slotIdx: number) {
  const slot = videoSlots[slotIdx]
  if (!slot.flvUrl || !slot.playing) return
  let video = videoSlotRefs.value[slotIdx]
  // 回退: transition leave 动画可能清空了 ref，从 DOM 直接查询当前可见的 video
  if (!video) {
    const grid = document.querySelector(isFullscreen.value ? '.fullscreen-video-grid' : '.video-monitor-grid')
    const videos = grid?.querySelectorAll('video.vm-video')
    if (videos && videos[slotIdx]) {
      video = videos[slotIdx] as HTMLVideoElement
      videoSlotRefs.value[slotIdx] = video
    }
  }
  if (!video) return

  // 清理旧播放器
  if (slot.flvPlayer) { try { slot.flvPlayer.destroy() } catch {} slot.flvPlayer = null }
  try { video.pause() } catch {}
  video.removeAttribute('src')
  try { video.load() } catch {}

  if (flvjs.isSupported()) {
    const player = flvjs.createPlayer(
      { type: 'flv', url: slot.flvUrl, isLive: true, hasAudio: false, hasVideo: true },
      {
        enableStashBuffer: false,
        stashInitialSize: 128,
        autoCleanupSourceBuffer: false,
        lazyLoad: false,
        liveBufferLatencyChasing: true,
        liveBufferLatencyChasingOnPaused: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 1.5,
      } as any
    )
    player.attachMediaElement(video)
    player.load()
    video.muted = true
    player.play().catch(() => {
      setTimeout(() => { video.muted = true; video.play().catch(() => {}) }, 200)
    })
    slot.flvPlayer = player
  }
}

function stopAllVideoSlots() { for (let i = 0; i < 4; i++) stopVideoSlot(i) }

function setVideoLayout(layout: 1 | 4) {
  videoLayout.value = layout
  if (videoPollingActive.value) { stopAllVideoSlots(); pollVideoBatch() }
}

function pollVideoBatch() {
  if (!videoDeviceList.value.length) return
  const step = videoLayout.value
  const total = videoDeviceList.value.length
  for (let i = 0; i < step; i++) {
    const idx = (videoPollOffset.value + i) % total
    const dev = videoDeviceList.value[idx]
    const slot = videoSlots[i]
    // 跳过: 正在加载中（上一次拉流还在进行，防止重叠 SIP INVITE）
    if (slot.loading) continue
    // 跳过: 已在播放同一通道（无需重新拉流）
    if (slot.channelId === dev.channelId && slot.playing && slot.flvPlayer) {
      continue
    }
    playVideoInSlot(i, dev.channelId, dev.deviceName)
  }
  // 只有通道数 > 分屏数时才有轮巡意义
  if (total > step) {
    videoPollOffset.value = (videoPollOffset.value + step) % total
  }
}

function startVideoPolling() {
  if (videoPollingActive.value) return
  if (!videoDeviceList.value.length) {
    loadVideoDeviceList().then(() => { if (videoDeviceList.value.length) startVideoPolling() })
    return
  }
  videoPollingActive.value = true
  videoPollOffset.value = 0
  pollVideoBatch()
  videoPollTimer = setInterval(() => pollVideoBatch(), videoPollIntervalSec.value * 1000)
}

function stopVideoPolling() {
  videoPollingActive.value = false
  if (videoPollTimer) { clearInterval(videoPollTimer); videoPollTimer = null }
  stopAllVideoSlots()
}

function toggleVideoPolling() {
  if (videoPollingActive.value) stopVideoPolling()
  else startVideoPolling()
}

// ── T4: 设备视频预览弹窗 ──
const videoPreviewVisible = ref(false)
const videoPreviewDevice = ref<{ id: string; name: string } | null>(null)
const videoPreviewLoading = ref(false)
let previewFlvPlayer: flvjs.Player | null = null
const previewVideoRef = ref<HTMLVideoElement>()

let previewChannelId = ''

async function onDeviceVideo(device: { id: string; name: string; businessId?: string }) {
  videoPreviewDevice.value = device
  videoPreviewVisible.value = true
  videoPreviewLoading.value = true
  await nextTick()
  try {
    let channelId = device.id
    if (device.businessId) {
      try {
        const chRes = await channelApi.getDeviceChannels(device.businessId)
        const channels = (chRes.data?.data as any) || []
        if (Array.isArray(channels) && channels.length) {
          channelId = channels[0].id || channels[0].channel_id || device.id
        }
      } catch {}
    }
    // 启动 GB28181 推流并等待流就绪
    const flvUrl = await startStreamAndGetFlvUrl(channelId)
    if (!flvUrl) { videoPreviewLoading.value = false; ElMessage.warning('无法获取视频流地址'); return }
    previewChannelId = channelId
    const video = previewVideoRef.value
    if (!video) { videoPreviewLoading.value = false; return }
    if (previewFlvPlayer) { try { previewFlvPlayer.destroy() } catch {} previewFlvPlayer = null }
    if (flvjs.isSupported()) {
      const player = flvjs.createPlayer(
        { type: 'flv', url: flvUrl, isLive: true, hasAudio: false, hasVideo: true },
        {
          enableStashBuffer: false,
          stashInitialSize: 128,
          autoCleanupSourceBuffer: false,
          lazyLoad: false,
          liveBufferLatencyChasing: true,
          liveBufferLatencyChasingOnPaused: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 1.5,
        } as any
      )
      player.attachMediaElement(video)
      player.load()
      player.play().catch(() => {})
      previewFlvPlayer = player
      videoPreviewLoading.value = false
    }
  } catch { videoPreviewLoading.value = false; ElMessage.warning('视频连接失败') }
}

function closeVideoPreview() {
  if (previewFlvPlayer) { try { previewFlvPlayer.destroy() } catch {} previewFlvPlayer = null }
  if (previewChannelId) { stopStream(previewChannelId); previewChannelId = '' }
  videoPreviewVisible.value = false
  videoPreviewDevice.value = null
  videoPreviewLoading.value = false
}

/**
 * 加载 3D 场景设备（真实设备数据驱动，三路合并）。
 * 1. 场景配置 API (buildings/fences) 替换硬编码；
 * 2. 态势点位 + gb28181选点 + 手动放置(scene_*) 三路合并；
 * 3. 优先级: 手动放置 > GB28181坐标 > 周界兜底；
 * 4. 无有效设备时使用演示数据兜底。
 */
async function loadSceneDevices() {
  devicesFailed.value = false
  const [mapRes, gbRes] = await Promise.allSettled([
    situationApi.getMapDevices(),
    locationApi.getDeviceLocations(),
  ])

  const rawPoints = mapRes.status === 'fulfilled'
    ? ((mapRes.value.data?.data as unknown as RawMapDevicePoint[]) ?? [])
    : []
  const normalized = rawPoints
    .map(p => normalizeMapDevicePoint(p))
    .filter((d): d is NonNullable<typeof d> => d !== null)

  const gbLocations = gbRes.status === 'fulfilled'
    ? ((gbRes.value.data?.data as unknown as Record<string, unknown>[]) ?? [])
        .map(l => normalizeGb28181Location(l))
        .filter((l): l is NonNullable<typeof l> => l !== null)
    : []

  let merged = mergeDeviceLocations(normalized, gbLocations)
  let sceneNodes = mapDevicesToScene(merged)

  if (sceneNodes.length) {
    sceneDevices.value = sceneNodes
    sceneIsDemo.value = false
  } else {
    sceneDevices.value = DEMO_SCENE_DEVICES
    sceneIsDemo.value = true
  }
}

// ── 编辑模式事件处理 ──
function enterEditMode() {
  sceneEditActive.value = true
  selectedEditDevice.value = null
}

function exitEditMode() {
  sceneEditActive.value = false
  selectedDeviceId.value = undefined
  selectedEditDevice.value = null
  void loadSceneDevices()
}

function onDeviceDrag(payload: { deviceId: string; x: number; y: number; z: number; buildingId?: string }) {
  const dev = sceneDevices.value.find(d => d.id === payload.deviceId)
  if (dev) {
    dev.x = payload.x
    dev.y = payload.y
    dev.z = payload.z
    if (payload.buildingId) {
      dev.location = payload.buildingId + ' - ' + dev.location.split(' - ').pop()
    }
    selectedDeviceId.value = payload.deviceId
    selectedEditDevice.value = {
      id: dev.id, name: dev.name, businessId: dev.businessId,
      x: dev.x, y: dev.y, z: dev.z,
      rotation: dev.rotation || 0, fov: dev.fov || 65,
      buildingId: payload.buildingId, isManual: true,
    }
  }
}

// P1-2: building hover handler
const hoveredBuilding = ref<{ name: string; deviceCount: number; online: number; alarm: number } | null>(null)
function onBuildingHover(payload: { buildingName: string | null; deviceCount: number; x: number; z: number }) {
  if (!payload.buildingName) {
    hoveredBuilding.value = null
    return
  }
  // count devices associated with this building
  const devices = sceneDevices.value.filter(d => d.location?.startsWith(payload.buildingName!))
  const online = devices.filter(d => d.status === 'online').length
  const alarm = devices.filter(d => d.status === 'alarm').length
  hoveredBuilding.value = {
    name: payload.buildingName,
    deviceCount: devices.length,
    online,
    alarm,
  }
}

function onDeviceSelect(deviceId: string) {
  const dev = sceneDevices.value.find(d => d.id === deviceId)
  if (!dev) return
  selectedDeviceId.value = deviceId
  selectedEditDevice.value = {
    id: dev.id, name: dev.name, businessId: dev.businessId,
    x: dev.x, y: dev.y, z: dev.z,
    rotation: dev.rotation || 0, fov: dev.fov || 65, isManual: false,
  }
}

function onDeviceUpdated(deviceId: string, data: { x: number; y: number; z: number; rotation: number; fov: number }) {
  const dev = sceneDevices.value.find(d => d.id === deviceId)
  if (dev) {
    dev.x = data.x; dev.y = data.y; dev.z = data.z
    dev.rotation = data.rotation; dev.fov = data.fov
  }
}

function onDeviceCleared(_deviceId: string) {
  void loadSceneDevices()
  selectedDeviceId.value = undefined
  selectedEditDevice.value = null
}

let charts: echarts.ECharts[] = []

function initCharts() {
  // [v8.6] 幂等渲染: 先销毁旧实例, 避免重复创建
  charts.forEach(c => { try { c?.dispose?.() } catch {} })
  charts = []
  // 安全评分仪表盘
  if (scoreGaugeRef.value) {
    const c = echarts.init(scoreGaugeRef.value)
    const score = overview.value?.securityScore?.overall ?? 0
    c.setOption({
      backgroundColor: 'transparent',
      graphic: [
        {
          type: 'text',
          left: '15%',
          top: '48%',
          silent: true,
          z: 10,
          style: {
            text: t('situationScreen.levelHigh'),
            fill: '#FC4F55',
            font: '600 16px "Microsoft YaHei", sans-serif',
            textVerticalAlign: 'middle',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '6%',
          silent: true,
          z: 10,
          style: {
            text: t('situationScreen.levelMedium'),
            fill: '#FFC569',
            font: '600 16px "Microsoft YaHei", sans-serif',
            textAlign: 'center',
          },
        },
        {
          type: 'text',
          right: '15%',
          top: '48%',
          silent: true,
          z: 10,
          style: {
            text: t('situationScreen.levelLow'),
            fill: '#42B112',
            font: '600 16px "Microsoft YaHei", sans-serif',
            textVerticalAlign: 'middle',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '80%',
          silent: true,
          z: 10,
          style: {
            text: '扣分明细',
            fill: '#00B4FF',
            font: '500 14px "Microsoft YaHei", sans-serif',
            textAlign: 'center',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '90%',
          silent: true,
          z: 10,
          style: {
            text: t('situationScreen.deductionHint'),
            fill: '#00B4FF',
            font: '500 12px "Microsoft YaHei", sans-serif',
            textAlign: 'center',
          },
        },
      ],
      series: [
        {
          type: 'gauge',
          center: ['50%', '54%'],
          radius: '80%',
          min: 0,
          // 仅用于指针视觉角度，中心分数仍显示真实的 0-100 分。
          max: 120,
          splitNumber: 2,
          startAngle: 180,
          endAngle: 0,
          pointer: {
            show: true,
            length: '78%',
            width: 10,
            itemStyle: {
              color: '#00E4FF',
              shadowBlur: 5, // 外发光，匹配你图里的荧光效果
              shadowColor: '#00DFFF'
            },
          },
          anchor: { show: false }, // 隐藏圆心小圆点
          progress: { show: false },// 不开启进度条模式
          roundCap: true, // 弧形条左右两端自动变成半圆圆角
          axisLine: {
            lineStyle: {
              width: 12,// 圆弧厚度12px
              color: [[1, new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: '#FC4F55' },
                { offset: 0.52, color: '#FFC569' },
                { offset: 1, color: '#42B112' },
              ])]],
            },
          },
          axisTick: { show: false },// 隐藏刻度短线
          splitLine: { show: false },// 隐藏分割线
          axisLabel: { show: false },
          detail: { show: false }, // 隐藏仪表盘默认中间数字
          title: { show: false }, // 隐藏仪表盘标题
          data: [{ value: score }],
          z: 2,
        },
        {
          type: 'pie',
          center: ['50%', '52%'],
          radius: ['0%', '43%'],
          silent: true,
          animation: false,
          label: { show: false },
          tooltip: { show: false },
          data: [{ value: 1, itemStyle: { color: '#071A4B' } }],
          z: 3,
        },
        {
          type: 'gauge',
          center: ['50%', '52%'],
          radius: '43%',
          startAngle: 90,
          endAngle: -269.999,
          pointer: { show: false },
          progress: { show: false },
          axisLine: { lineStyle: { width: 2, color: [[1, '#0754A8']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: { show: false },
          detail: {
            show: true,
            offsetCenter: [0, '5%'],
            formatter: (value: number) => `{score|${Math.round(value)}}{unit|${t('situationScreen.scoreUnit')}}`,
            rich: {
              score: { color: '#00DFFF', fontSize: 40, fontWeight: 600, lineHeight: 48 },
              unit: { color: '#00DFFF', fontSize: 16, fontWeight: 600, padding: [15, 0, 0, 2] },
            },
          },
          data: [{ value: score }],
          z: 4,
        },
      ],
    })
    charts.push(c)
  }

  // 设备状态环形饼图
  deviceStatusGroups.value.forEach(device => {
    const chartEl = devicePieRefs.get(device.key)
    if (!chartEl) return

    const c = echarts.init(chartEl)
    const onlineRate = deviceOnlineRate(device)
    c.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        confine: false,
        position: ['108%', '6%'],
        formatter: `${device.label}<br/>{b}：{c}（{d}%）`,
        backgroundColor: 'rgba(3, 14, 50, 0.96)',
        borderColor: '#0079AB',
        borderWidth: 1,
        textStyle: { color: '#AADDFF', fontSize: 13 },
        extraCssText: 'z-index: 9999;',
      },
      graphic: [{
        type: 'text',
        left: 'center',
        top: 'middle',
        silent: true,
        style: {
          text: `{value|${onlineRate}}{unit|%}`,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          rich: {
            value: { fill: '#00F333', fontSize: 30, fontWeight: 700 },
            unit: { fill: '#00F333', fontSize: 14, fontWeight: 600, padding: [10, 0, 0, 1] },
          },
        },
      }],
      series: [{
        type: 'pie',
        radius: ['63%', '84%'],
        center: ['50%', '50%'],
        startAngle: 220,
        clockwise: true,
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 4,
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0, 180, 255, 0.35)' },
        },
        data: [
          // 扇区顺序：在线、离线、故障。
          { value: device.online, name: t('situationScreen.onlineLabel'), itemStyle: { color: '#2FC414' } },
          { value: device.offline, name: t('situationScreen.offlineLabel'), itemStyle: { color: '#FC4F55' } },
          { value: device.fault, name: t('situationScreen.faultLabel'), itemStyle: { color: '#7D817B' } },
        ],
      }],
    })
    charts.push(c)
  })

  // 告警趋势
  if (alarmTrendRef.value) {
    renderAlarmTrendChart()
  }

  // 告警类型分布
  if (alarmTypeRef.value) {
    const c = echarts.init(alarmTypeRef.value)
    const as = overview.value?.alarmStats
    const alarmTypeTotal = as
      ? as.critical + as.high + as.medium + as.low
      : 0
    const createAlarmTypeItem = (value: number, name: string, color: string) => {
      const percent = alarmTypeTotal > 0 ? (value / alarmTypeTotal) * 100 : 0
      const percentText = String(Number(percent.toFixed(1)))
      return {
        value,
        name,
        itemStyle: { color },
        label: {
          formatter: `{name|${name}}\n{percent|${percentText}%}`,
          rich: {
            name: { color: '#AADDFF', fontSize: 14, lineHeight: 26 },
            percent: { color, fontSize: 16, fontWeight: 600, lineHeight: 26 },
          },
        },
        labelLine: { lineStyle: { color, width: 1.5 } },
      }
    }
    const alarmTypeData = as
      ? [
          createAlarmTypeItem(as.critical, t('situationScreen.criticalAlarm'), '#FC1526'),
          createAlarmTypeItem(as.high, t('situationScreen.highAlarm'), '#F97141'),
          createAlarmTypeItem(as.medium, t('situationScreen.mediumAlarm'), '#FBB040'),
          createAlarmTypeItem(as.low, t('situationScreen.lowAlarm'), '#00B4FF'),
        ]
      : []
    c.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        confine: false,
        backgroundColor: 'rgba(3, 14, 50, 0.96)',
        borderColor: '#0079AB',
        borderWidth: 1,
        textStyle: { color: '#AADDFF', fontSize: 13 },
        extraCssText: 'z-index: 9999;',
      },
      graphic: alarmFalsePositiveRate.value == null
        ? []
        : [{
            type: 'text',
            left: 'center',
            bottom: 20,
            silent: true,
            style: {
              text: `{label|${t('situationScreen.falsePositiveRate')}{value|${formatRate(alarmFalsePositiveRate.value)}%}`,
              textAlign: 'center',
              rich: {
                label: { fill: '#AADDFF', fontSize: 16, fontWeight: 500 },
                value: { fill: '#00B4FF', fontSize: 18, fontWeight: 600 },
              },
            },
          }],
      series: [{
        type: 'pie',
        radius: '48%',
        center: ['50%', '43%'],
        startAngle: 90,
        clockwise: true,
        avoidLabelOverlap: true,
        label: {
          show: true,
          position: 'outside',
          alignTo: 'edge',
          edgeDistance: 12,
          bleedMargin: 4,
          distanceToLabelLine: 0,
        },
        labelLine: {
          show: true,
          length: 30,
          length2: 10,
          smooth: false,
        },
        labelLayout: params => {
          const isLeft = params.labelRect.x < c.getWidth() / 2
          const labelX = isLeft ? 12 : c.getWidth() - 12
          const points = params.labelLinePoints
          const labelY = params.labelRect.y + params.labelRect.height / 2
          const lineY = labelY + 2
          if (points?.[1] && points[2]) {
            points[1][1] = lineY
            points[2][0] = labelX
            points[2][1] = lineY
          }
          return {
            x: labelX,
            y: labelY,
            align: isLeft ? 'left' : 'right',
            verticalAlign: 'middle',
            labelLinePoints: points,
          }
        },
        data: alarmTypeData,
      }]
    })
    charts.push(c)
  }

  // 多盒子算力负载活跃度柱状图
  if (agentBarRef.value) {
    const c = echarts.init(agentBarRef.value)
    const labels = agentData.value.map(agent => agent.name)
    const values = agentData.value.map(agent => Math.min(100, Math.max(0, agent.calls ?? 0)))
    c.setOption({
      backgroundColor: 'transparent',
      grid: { left: 54, right: 18, top: 32, bottom: 42 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: value => `${value}%` },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          color: '#00B4FF',
          fontSize: 14,
          interval: 0,
          formatter: (value: string) => value.replace(/\s*Agent$/i, ''),
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#0079AB' } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 20,
        axisLabel: {
          color: '#0079AB',
          fontSize: 14,
          formatter: (value: number) => value === 0 ? '0' : `${value}%`,
        },
        axisTick: { show: true, lineStyle: { color: '#0079AB' } },
        axisLine: { show: true, lineStyle: { color: '#0079AB' } },
        splitLine: { show: false, lineStyle: { color: '#0079AB', opacity: 0.35 } },
      },
      series: [{
        type: 'bar',
        data: values,
        barWidth: 12,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#00B4FF' },
            { offset: 1, color: '#033F6C' },
          ]),
        },
        label: {
          show: true,
          position: 'top',
          color: '#00B4FF',
          fontSize: 14,
          formatter: '{c}%',
        },
      }]
    })
    charts.push(c)
  }

  window.addEventListener('resize', handleResize)
}

function handleResize() {
  charts.forEach(c => c?.resize?.())
}

/** 将 SituationAlarmStream 转为模板使用的 Alarm 格式 */
function toAlarm(s: SituationAlarmStream): Alarm {
  return {
    id: s.id,
    time: s.time,
    location: s.deviceName,
    type: s.description,
    level: s.level,
    status: '未处理',
    // [FIX 2026-07-30] 兼容 snake/camel 双形态, 与 AlarmsView.vue 行为一致
    snapshotUrl: s.snapshotUrl || s.snapshot_url,
    metadata: s.metadata,
  }
}

/** 兜底函数: 返回抓拍图 URL, 优先 snapshotUrl, 其次 metadata.snapshot_base64 dataURL
 *  与 AlarmsView.vue:995-1005 / AlarmPopup.vue:415-433 实现保持一致 */
function getSnapshotUrl(alarm: Alarm): string {
  if (alarm.snapshotUrl) return alarm.snapshotUrl
  const meta = alarm.metadata as { snapshot_base64?: string; snapshot_format?: string } | undefined
  const b64 = meta?.snapshot_base64
  if (!b64) return ''
  if (typeof b64 === 'string' && b64.startsWith('data:')) return b64
  const fmt = meta?.snapshot_format || 'jpg'
  const mime = fmt === 'raw_bgr' ? 'image/bmp' : `image/${fmt}`
  // 补齐 base64 padding (避免 +/= 被转义后导致浏览器拒绝)
  const cleaned = String(b64).replace(/[^A-Za-z0-9+/=]/g, '')
  const fixed = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4)
  return `data:${mime};base64,${fixed}`
}

/** 渲染告警趋势图表 (从 renderCharts 和切换 mode 时调用) */
function renderAlarmTrendChart() {
  if (!alarmTrendRef.value) return
  // 销毁旧实例并重新创建
  const oldIdx = charts.findIndex(c => {
    try { return c.getDom() === alarmTrendRef.value } catch { return false }
  })
  if (oldIdx >= 0) {
    charts[oldIdx].dispose()
    charts.splice(oldIdx, 1)
  }
  const c = echarts.init(alarmTrendRef.value)

  // 根据模式选择数据源
  let hours: string[] = []
  let trendData: number[] = []
  if (alarmTrendMode.value === '24h') {
    // 今日模式：用 hourlyData (后端已截断到当前小时)
    hours = hourlyData.value.length
      ? hourlyData.value.map(item => `${String(item.hour).padStart(2, '0')}:00`)
      : []
    trendData = hourlyData.value.length
      ? hourlyData.value.map(h => h.alarmCount)
      : []
  } else {
    // 7d/30d 模式：用 alarmTrendData
    hours = alarmTrendData.value.map(t => t.hour || '')
    trendData = alarmTrendData.value.map(t => t.count ?? 0)
  }

  const alarmStats = overview.value?.alarmStats
  const levelTotals = [
    alarmStats?.critical ?? 0,
    alarmStats?.high ?? 0,
    alarmStats?.medium ?? 0,
    alarmStats?.low ?? 0,
  ]
  const levelTotal = levelTotals.reduce((sum, value) => sum + value, 0)
  const levelWeights = levelTotal
    ? levelTotals.map(value => value / levelTotal)
    : [0.15, 0.25, 0.25, 0.35]
  const levelSeries = [
    { name: t('situationScreen.levelCritical'), color: '#FC1526', weight: levelWeights[0] ?? 0.15 },
    { name: t('situationScreen.levelHigh'), color: '#F97141', weight: levelWeights[1] ?? 0.25 },
    { name: t('situationScreen.levelMedium'), color: '#FBB040', weight: levelWeights[2] ?? 0.25 },
    { name: t('situationScreen.levelLow'), color: '#00B4FF', weight: levelWeights[3] ?? 0.35 },
  ]
  // 7d/30d 模式 X 轴标签间距自适应
  const labelInterval = alarmTrendMode.value === '30d' ? 4 : alarmTrendMode.value === '7d' ? 0 : 3
  c.setOption({
    backgroundColor: 'transparent',
    color: levelSeries.map(item => item.color),
    legend: {
      symbol: 'circle',
      top: 4,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: { color: '#0079AB', fontSize: 14 },
    },
    grid: { left: 42, right: 16, top: 42, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: hours,
      axisLabel: { fontSize: 14, color: '#0079AB', interval: labelInterval },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#0079AB' } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { fontSize: 14, color: '#0079AB' },
      axisTick: { show: false },
      axisLine: { show: false, lineStyle: { color: '#0079AB' } },
      splitLine: { lineStyle: { color: '#0079AB', opacity: 0.35 } },
    },
    series: levelSeries.map(item => ({
      name: item.name,
      type: 'line',
      data: trendData.map(value => Math.round(value * item.weight)),
      smooth: true,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: item.color, width: 2 },
      itemStyle: { color: item.color },
      emphasis: { focus: 'series' },
    })),
  })
  charts.push(c)
}

/** 切换告警趋势模式 (今日/7天/30天) */
async function switchAlarmTrendMode(mode: '24h' | '7d' | '30d') {
  if (alarmTrendMode.value === mode) return
  alarmTrendMode.value = mode
  hourlyFailed.value = false

  if (mode === '24h') {
    // 今日模式用 hourlyData，如果已有数据则直接渲染
    if (hourlyData.value.length) {
      await nextTick()
      renderAlarmTrendChart()
    }
  } else {
    // 7d/30d 模式调用 alarm-trend API
    alarmTrendData.value = []
    try {
      const res = await statsHttp.get('/alarm-trend', { params: { mode } })
      const d = res.data?.data || res.data
      if (d.trend && Array.isArray(d.trend)) {
        alarmTrendData.value = d.trend
        await nextTick()
        renderAlarmTrendChart()
      } else {
        hourlyFailed.value = true
      }
    } catch {
      hourlyFailed.value = true
    }
  }
}

/** 加载态势大屏数据 — 非阻塞并行加载, 各面板独立渲染 */
function fetchSituationData() {
  overviewLoading.value = true
  overviewFailed.value = false
  devicesFailed.value = false
  alarmsFailed.value = false
  agentsFailed.value = false
  hourlyFailed.value = false

  // 1. 概览 (安全评分 + 今日统计 + 设备状态 + 告警类型分布)
  situationApi.getOverview().then(res => {
    const d = res.data?.data
    if (d) {
      overview.value = d
      const aStats = d.alarmStats
      todayStats.value = [
        { label: t('situationScreen.totalAgents'), value: String(d.totalAgents ?? 0), suffix: '', icon: 'icon1-AIsuanfa', iconColor: '#01B9E7' },
        { label: t('situationScreen.todayAlarmTotal'), value: String(aStats?.todayTotal ?? 0), suffix: '', icon: 'icon1-gaojing', iconColor: '#D13838' },
        { label: t('situationScreen.alarmHandleRate'), value: formatRate(d.handleRate), suffix: d.handleRate != null ? '%' : '', icon: 'icon1-anquanguanli', iconColor: '#3EB011' },
        { label: t('situationScreen.edgeCompute'), value: d.totalAgents > 0 ? String(d.activeAgents) : '--', suffix: '', icon: 'icon1-agent', iconColor: '#7938D1' },
      ]
      const ds = d.deviceStats
      if (ds) {
        deviceStatusGroups.value = [{
          key: 'video-box',
          label: t('situationScreen.videoDevice'),
          total: ds.total ?? 0,
          online: ds.online ?? 0,
          offline: ds.offline ?? Math.max(0, (ds.total ?? 0) - (ds.online ?? 0)),
          fault: ds.maintenance ?? 0,
        }]
      }
      // 渲染评分仪表盘 + 设备状态饼图 + 告警类型分布
      nextTick(() => initCharts())
    } else {
      overviewFailed.value = true
    }
    overviewLoading.value = false
  }).catch(() => { overviewFailed.value = true; overviewLoading.value = false })

  // 2. 地图设备 → 3D场景（真实设备数据 + 选点坐标合并 + 演示兜底）
  loadSceneDevices()

  // 3. 实时告警
  situationApi.getRealtimeAlarms({ limit: 20 }).then(res => {
    const alarms = res.data?.data
    if (alarms?.length) latestAlarms.value = alarms.map(toAlarm)
    else alarmsFailed.value = true
  }).catch(() => { alarmsFailed.value = true })

  // 4. Agent状态
  situationApi.getAgentStatuses().then(res => {
    const agents = res.data?.data
    if (agents?.length) {
      agentData.value = agents
      nextTick(() => initCharts())
    } else agentsFailed.value = true
  }).catch(() => { agentsFailed.value = true })

  // 5. 时段统计 (告警趋势 24h)
  situationApi.getHourlyStats().then(res => {
    const hourly = res.data?.data
    if (hourly?.length) {
      hourlyData.value = hourly
      nextTick(() => initCharts())
    } else hourlyFailed.value = true
  }).catch(() => { hourlyFailed.value = true })
}

/** 抓拍图加载失败时的兜底 — 自动隐藏并打印 warn, 避免列表卡顿 */
function onSnapshotError(evt: Event) {
  const target = evt.target as HTMLImageElement
  if (target) {
    console.warn(`[situation] 抓拍图加载失败: ${target.src?.slice(0, 80)}...`)
    target.style.display = 'none'
  }
}

/** WebSocket 推送新告警时更新列表 */
function onAlarmPush(data: unknown) {
  const raw = data as SituationAlarmStream
  if (raw?.id) {
    latestAlarms.value.unshift(toAlarm(raw))
    if (latestAlarms.value.length > 20) latestAlarms.value.length = 20
  }
}

function onFullscreenEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && isFullscreen.value) exitFullscreen()
}

onMounted(async () => {
  const updateClock = () => {
    currentTime.value = new Date().toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
  updateClock()
  clockTimer = setInterval(updateClock, 1000)

  // 订阅实时告警推送
  unsubAlarm = subscribe('alarm', onAlarmPush)

  // [v8.6] 非阻塞: 并行加载各面板数据, 到达即渲染
  fetchSituationData()

  // T3: 预加载视频通道列表
  loadVideoDeviceList()
  // 全屏ESC退出
  window.addEventListener('keydown', onFullscreenEsc)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (unsubAlarm) unsubAlarm()
  charts.forEach(c => c?.dispose?.())
  charts = []
  window.removeEventListener('resize', handleResize)
  // 清理延迟定时器
  if (centerViewTimer) { clearTimeout(centerViewTimer); centerViewTimer = null }
  if (fullscreenTimer) { clearTimeout(fullscreenTimer); fullscreenTimer = null }
  // T3/T4 cleanup
  stopVideoPolling()
  closeVideoPreview()
  isFullscreen.value = false
  window.removeEventListener('keydown', onFullscreenEsc)
})
</script>

<style scoped>
.situation-screen {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #0D0F12;
  color: #E8EAED;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ss-header {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background: linear-gradient(180deg, #151820, #0D0F12);
  border-bottom: 1px solid #1E2028;
  flex-shrink: 0;
}

.ss-header h1 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(90deg, #1A73E8, #0F9D58);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.ss-header-right { display: flex; align-items: center; gap: 12px; }
.ss-clock { font-family: 'Roboto Mono', monospace; font-size: 14px; color: #9AA0A6; }

.ss-body {
  flex: 1;
  display: flex;
  gap: 6px;
  padding: 8px;
  overflow: hidden;
  min-height: 0;
}

.ss-col {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 6px;
  min-height: 0;
  overflow: hidden;
}
.left-col { width: 400px; flex-shrink: 0; flex: none; overflow: hidden; }
.center-col { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.right-col { width: 400px; flex-shrink: 0; flex: none; overflow: hidden; }

.left-col > .ss-panel,
.right-col > .ss-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.center-col > .ss-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.center-col > .map-panel {
  grid-row: span 2;
}

.ss-panel {
  background: #040C2B;
  border: 1px solid #05357C;
  /*border-radius: 8px;*/
  overflow: hidden;
  padding:4px;
  box-shadow: inset 0 0 17px 0px #061e79;
}

.map-panel .panel-title {
  flex-wrap: wrap;
  gap: 4px 6px;
  min-height: 32px;
  height: auto;
  padding: 4px 10px;
  line-height: 1.5;
}

/* 3D 标题栏提示文字不缩滘 */
.map-panel .panel-title > span {
  white-space: nowrap;
  flex-shrink: 0;
}

/* 标题栏内所有按钮、下拉不压缩 */
.map-panel .panel-title .scene-edit-btn,
.map-panel .panel-title .el-select,
.map-panel .panel-title .el-dropdown {
  flex-shrink: 0;
}

.panel-title {
  display: flex;
  align-items: center;
  height: 32px;
  line-height: 32px;
  padding: 0 10px;
  font-size: 14px;
  color: #00B4FF;
  background: linear-gradient(90deg, #003076 0%, rgba(0, 48, 118, 0) 100%);
}

.panel-title-icon {
  font-size: 24px;
  color: #00B4FF;
}

.alarm-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: auto;
  padding: 0;
  border: 0;
  color: #00B4FF;
  background: transparent;
  cursor: pointer;
}

.alarm-more i {
  font-size: 17px;
}

.alarm-more:hover,
.alarm-more:focus-visible {
  color: #00E4FF;
}

.chart-box { width: 100%; height: 200px; padding:10px;box-sizing: border-box;}
.score-gauge { width: 100%; height: 180px; }
.left-col .chart-box,
.left-col .score-gauge,
.right-col .chart-box {
  flex: 1;
  min-height: 0;
  height: auto;
}

.device-status-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
  gap: 16px;
  padding: 10px 18px 12px 22px;
}

.device-status-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  align-items: center;
  column-gap: 20px;
}

.device-status-pie {
  width: 110px;
  height: 110px;
  min-width: 0;
  min-height: 0;
}

.device-status-info {
  min-width: 0;
}

.device-status-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #00B4FF;
  font-size: 18px;
  line-height: 42px;
  white-space: nowrap;
}

.device-status-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid #00B4FF;
  border-radius: 4px;
  color: #00B4FF;
  box-shadow: inset 0 0 8px rgba(0, 180, 255, 0.12);
}

.device-status-icon i {
  font-size: 24px;
}

.device-status-counts {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  white-space: nowrap;
}

.device-count {
  display: inline-flex;
  align-items: center;
  color: #AADDFF;
  font-size: 15px;
  line-height: 24px;
}

.device-count i {
  width: 8px;
  height: 8px;
  margin-right: 6px;
  background: currentColor;
}

.device-count b {
  margin-left: 2px;
  color: #AADDFF;
  font-weight: 500;
}

.device-count.online { color: #17D71E; }
.device-count.offline { color: #FC4F55; }
.device-count.fault { color: #7D817B; }

.map-panel { display: flex; flex-direction: column; min-height: 0; }
.scene3d-wrapper { flex: 1; min-height: 0; position: relative; overflow: hidden; }

.scene-edit-btn {
  padding: 2px 10px;
  font-size: 12px;
  color: #00B4FF;
  background: rgba(0, 180, 255, 0.1);
  border: 1px solid rgba(0, 180, 255, 0.3);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.scene-edit-btn:hover { background: rgba(0, 180, 255, 0.25); }
.scene-edit-btn.active {
  background: rgba(0, 180, 255, 0.25);
  color: #00E4FF;
  border-color: rgba(0, 228, 255, 0.5);
}

.scene-container-with-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
  overflow: hidden;
}
.scene-container-with-panel .scene3d-wrapper { flex: 1; }
.scene-container-with-panel > :deep(.scene-edit-panel) {
  flex-shrink: 0;
  align-self: flex-start;
}

/* 告警列表 */
.alarm-scroll {
  flex: 1;
  min-height: 0;
}

.alarm-table {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  padding: 4px 6px 6px;
  color: #0079AB;
}

.alarm-table-row {
  display: grid;
  grid-template-columns: 54px 100px minmax(180px, 1.5fr) minmax(105px, 0.9fr) 150px 88px 70px;
  align-items: center;
}

.alarm-table-row > span,
.alarm-table-row > button {
  display: flex;
  align-self: stretch;
  align-items: center;
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-table-row > :not(:last-child) {
  border-right: 1px solid #00245A;
}

.alarm-table-head {
  flex: 0 0 31px;
  height: 31px;
  color: #AADDFF;
  background: rgba(0, 36, 96, 0.6);
  border: 1px solid #00245A;
  font-size: 14px;
}

.alarm-row {
  min-height: 44px;
  margin-top: -1px;
  border: 1px solid #00245A;
  color: #0079AB;
  background: rgba(4, 24, 64, 0.3);
  font-size: 14px;
  transition: background-color 0.12s ease;
}

.alarm-row:nth-child(odd) {
  background: rgba(3, 14, 50, 0.3);
}

.alarm-row:hover {
  background: rgba(12, 112, 189, 0.3);
}

.alarm-row.is-unhandled {
  color: #FF4747;
}

.alarm-level b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 20px;
  padding: 0 4px;
  border-radius: 2px;
  color: #EAF8FF;
  background: #1676D2;
  font-size: 13px;
  font-weight: 500;
}

.alarm-row.critical .alarm-level b { background: #D51F3D; }
.alarm-row.high .alarm-level b { background: #E85720; }
.alarm-row.medium .alarm-level b { background: #B88D12; }
.alarm-row.low .alarm-level b { background: #1676D2; }

.alarm-snapshot {
  justify-content: center;
}

.alarm-snapshot :deep(.el-image),
.alarm-snapshot-empty {
  display: block;
  width: 56px;
  height: 36px;
}

.alarm-snapshot :deep(.el-image) {
  cursor: zoom-in;
}

.alarm-time {
  font-variant-numeric: tabular-nums;
}

.alarm-status :deep(.el-tag) {
  height: auto;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font-size: 14px;
}

.alarm-action {
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.alarm-action:hover,
.alarm-action:focus-visible {
  color: #00E4FF;
}

.alarm-scroll :deep(.el-scrollbar__bar.is-vertical) {
  width: 4px;
  right: 1px;
}

.alarm-scroll :deep(.el-scrollbar__bar.is-horizontal) {
  height: 4px;
  bottom: 1px;
}

.alarm-scroll :deep(.el-scrollbar__thumb) {
  border-radius: 2px;
  background-color: #059EF4;
}

.alarm-scroll :deep(.el-scrollbar__bar.is-vertical .el-scrollbar__thumb) {
  min-height: 40px;
}

/* 统计格子 */
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
.left-col .stats-grid { flex: 1; grid-template-rows: repeat(2, minmax(0, 1fr)); min-height: 0; }
.stat-card { text-align: center; padding: 6px 2px; background: transparent; }
.left-col .stat-card { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 0; }
.stat-main { display: flex; align-items: center;width: 50%; }
.stat-icon { flex: 0 0 auto; font-size: 50px;line-height: 30px;width: 28px;height: 30px;text-align: center;margin-right: 20px; }
.stat-value { color: #00DFFA; font-size: 32px; font-weight: 600; height:30px; line-height: 30px; }
.stat-unit { margin-left: 1px; font-size: 16px; font-weight: 600; }
.stat-label { margin-top:10px;color: #00B4FF; font-size: 14px;  white-space: nowrap; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #6b7280;
  font-size: 13px;
  min-height: 80px;
}
.panel-empty {
  flex: 1;
  min-height: 0;
  padding: 0;
  color: #4F8DBD;
  font-size: 14px;
}
.empty-state.error { color: #ef4444; }
.scene-empty { min-height: 200px; }

.building-hover-overlay {
  position: absolute;
  top: 50px;
  right: 16px;
  background: rgba(15, 20, 35, 0.92);
  border: 1px solid rgba(100, 150, 255, 0.3);
  border-radius: 6px;
  padding: 10px 14px;
  z-index: 5;
  pointer-events: none;
  min-width: 140px;
}
.building-hover-name {
  font-size: 14px;
  font-weight: 600;
  color: #8ab4f8;
  margin-bottom: 4px;
}
.building-hover-stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}
.trend-mode-switch { display: inline-flex; gap: 2px; }
.mode-btn { padding: 2px 10px; font-size: 12px; color: #0079AB; background: rgba(0,180,255,0.1); border: 1px solid rgba(0,180,255,0.3); border-radius: 3px; cursor: pointer; transition: all .2s; }
.mode-btn:hover { background: rgba(0,180,255,0.25); }
.mode-btn.active { color: #fff; background: linear-gradient(135deg, #00B4FF, #0079AB); border-color: #00B4FF; }

/* 标题栏右侧控件（推到最右） */
.title-right-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.fullscreen-btn {
  padding: 2px 8px !important;
  font-size: 16px;
}

/* 深色主题 el-select — 标题栏视图选择器 */
.title-view-select {
  width: auto !important;
  min-width: 150px;
  flex-shrink: 0;
}
.title-view-select :deep(.el-select__wrapper) {
  background: transparent !important;
  box-shadow: 0 0 0 1px rgba(0, 180, 255, 0.3) inset !important;
  border-radius: 4px;
  min-height: 28px;
}
.title-view-select :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(0, 180, 255, 0.6) inset !important;
}
.title-view-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px rgba(0, 228, 255, 0.7) inset !important;
}
.title-view-select :deep(.el-select__selected-item),
.title-view-select :deep(.el-select__placeholder) {
  color: #00E4FF !important;
  font-size: 14px !important;
  font-weight: 600 !important;
}
.title-view-select :deep(.el-select__caret) {
  color: #00B4FF !important;
}
.title-view-select :deep(.el-select__suffix) {
  color: #00B4FF !important;
}

/* 滑动容器 */
.swipe-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  user-select: none;
}

.center-view-3d {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.center-view-video {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 滑动过渡动画 */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* 全屏覆盖层 */
.fullscreen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
  background: #040C2B;
  display: flex;
  flex-direction: column;
  outline: none;
}

.fullscreen-exit-btn {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 10001;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 180, 255, 0.4);
  border-radius: 8px;
  background: rgba(3, 27, 78, 0.9);
  color: #00B4FF;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.fullscreen-exit-btn:hover {
  background: rgba(0, 180, 255, 0.2);
  color: #00E4FF;
}

.fullscreen-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fullscreen-inner {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fullscreen-3d-scene {
  flex: 1;
  min-height: 0;
  position: relative;
}

.fullscreen-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #236db7;
  font-size: 16px;
}

.fullscreen-video-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fullscreen-video-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  height: 48px;
  flex-shrink: 0;
}

.fullscreen-video-toolbar .scene-edit-btn.active {
  background: rgba(0, 180, 255, 0.25);
  color: #00E4FF;
  border-color: rgba(0, 228, 255, 0.5);
}

.fullscreen-video-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 4px;
  padding: 8px;
  overflow: hidden;
}

/* T3: 视频监控 */
.video-monitor-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 2px;
  padding: 4px;
  overflow: hidden;
}

.vm-grid-1 {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}

.vm-grid-4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.vm-cell {
  position: relative;
  background: #000;
  border: 1px solid #05357C;
  overflow: hidden;
  min-height: 0;
}

.vm-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.vm-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #00B4FF;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.vm-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #236db7;
  font-size: 13px;
}

.vm-label {
  position: absolute;
  bottom: 4px;
  left: 4px;
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 12px;
  border-radius: 3px;
  max-width: calc(100% - 8px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* T4: 视频预览弹窗 */
.video-preview-container {
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Center view transition */
.center-view-3d, .center-view-video {
  width: 100%;
  flex: 1;
}
</style>

<!-- 全局样式：深色主题下拉弹出面板（popper teleport 到 body） -->
<style>
.el-select__popper.title-view-popper {
  background: rgba(3, 27, 78, 0.97) !important;
  border: 1px solid rgba(0, 180, 255, 0.35) !important;
}
.el-select__popper.title-view-popper .el-select-dropdown__item {
  color: #AADDFF !important;
}
.el-select__popper.title-view-popper .el-select-dropdown__item.is-hovering,
.el-select__popper.title-view-popper .el-select-dropdown__item:hover {
  background: rgba(0, 180, 255, 0.15) !important;
  color: #00E4FF !important;
}
.el-select__popper.title-view-popper .el-select-dropdown__item.is-selected {
  color: #00E4FF !important;
  font-weight: 600 !important;
}
.el-select__popper.title-view-popper .el-popper__arrow::before {
  background: rgba(3, 27, 78, 0.97) !important;
  border-color: rgba(0, 180, 255, 0.35) !important;
}
</style>
