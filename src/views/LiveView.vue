<template>
  <div class="live-page">
    <el-row :gutter="16">
      <!-- 左侧: 视频区 -->
      <el-col :span="18">
        <el-card class="video-card" :body-style="{ padding: '0' }">
          <div class="video-toolbar">
            <span class="toolbar-title">
              <el-icon><VideoCamera /></el-icon>
              {{ activeChannelName }}
            </span>
            <div class="toolbar-actions">
              <span style="color:#9AA0A6;font-size:12px;margin-right:4px">播放格式:</span>
              <el-radio-group v-model="preferredFormat" size="small" fill="#1A73E8">
                <el-radio-button v-for="(label, key) in FORMAT_LABELS" :key="key" :value="key">{{ label }}</el-radio-button>
              </el-radio-group>
              <el-divider direction="vertical" />
              <el-button-group size="small">
                <el-button :type="layout === 1 ? 'primary' : 'default'" @click="setLayout(1)" title="单屏">1</el-button>
                <el-button :type="layout === 4 ? 'primary' : 'default'" @click="setLayout(4)" title="四分屏">4</el-button>
                <el-button :type="layout === 9 ? 'primary' : 'default'" @click="setLayout(9)" title="九分屏">9</el-button>
                <el-button :type="layout === 16 ? 'primary' : 'default'" @click="setLayout(16)" title="十六分屏">16</el-button>
              </el-button-group>
              <el-button size="small" @click="snapshotActive" :disabled="!hasActive">
                <el-icon><Camera /></el-icon>截图
              </el-button>
              <el-button size="small" @click="toggleRecordActive" :disabled="!hasActive" :type="isRecording ? 'danger' : 'default'">
                <el-icon><VideoCamera /></el-icon>{{ isRecording ? '停止录像' : '录像' }}
              </el-button>
              <el-button size="small" @click="openImageAdjust" :disabled="!hasActive">图像</el-button>
              <el-button size="small" @click="toggleFullscreen">
                <el-icon><FullScreen /></el-icon>
              </el-button>
              <el-divider direction="vertical" />
              <el-button size="small" @click="statsPanelVisible = true">
                <el-icon><DataAnalysis /></el-icon>统计
              </el-button>
            </div>
          </div>
          <div class="video-grid" :class="`grid-${layout}`" ref="gridRef">
            <div v-for="(slot, idx) in visibleSlots" :key="idx"
                 class="video-cell"
                 :class="{ active: activeSlotIdx === idx, 'has-stream': slot.channelId }"
                 @click="activeSlotIdx = idx"
                 @dblclick="maximizeSlot(idx)">
              <!-- 真实视频播放 -->
              <video v-if="slot.playing"
                     :ref="el => setVideoRef(el, idx)"
                     class="video-player"
                     muted autoplay playsinline />
              <!-- 检测框 Canvas 叠加层 -->
              <canvas v-if="slot.playing"
                      :ref="el => setOverlayRef(idx, el)"
                      class="detection-overlay" />
              <div v-else-if="slot.loading" class="video-loading">
                <el-icon class="spin"><Loading /></el-icon>
                <span>连接中...</span>
              </div>
              <div v-else class="video-empty" @dragover.prevent @drop="onDropChannel($event, idx)">
                <el-icon :size="32"><VideoCamera /></el-icon>
                <span>拖拽通道到此处</span>
              </div>
              <!-- 安全加密指示器 -->
              <div class="slot-security-badge" v-if="slot.playing">
                <el-icon :color="slot.encrypted ? '#67c23a' : '#909399'" :size="14">
                  <Lock v-if="slot.encrypted" />
                  <Unlock v-else />
                </el-icon>
              </div>
              <!-- 检测计数徽章 -->
              <div v-if="slot.playing && slot.detections && slot.detections.length > 0" class="detection-badge">
                {{ slot.detections.length }} 检测
              </div>
              <!-- 健康状态指示灯 -->
              <div v-if="slot.playing" class="health-indicator" :class="streamHealth.getHealth(idx).status"></div>
              <!-- 质量等级标签 -->
              <div v-if="slot.playing && adaptiveBitrate.qualityLevels[idx]" class="quality-badge">
                {{ adaptiveBitrate.getQualityInfo(idx).labelShort }}
              </div>
              <!-- 视频叠加层(仅无流时隐藏，有流时信息在底部栏) -->
              <!-- 海康风格底部工具条 -->
              <div v-if="slot.channelId" class="video-bottom-bar">
                <div class="bottom-left">
                  <span class="bl-name">{{ slot.name || `CH${idx + 1}` }}</span>
                  <span class="bl-badge" :class="slot.status === 'streaming' ? 'on' : 'off'">{{ slot.status === 'streaming' ? 'LIVE' : 'OFF' }}</span>
                  <span v-if="slot.codec" class="bl-codec">{{ slot.codec }}</span>
                  <span v-if="slot.currentFormat && slot.status === 'streaming'" class="bl-latency">{{ FORMAT_LATENCY_INFO[slot.currentFormat] }}</span>
                  <span class="bl-time">{{ currentTime }}</span>
                </div>
                <div class="bottom-actions">
                  <el-tooltip content="截图" placement="top">
                    <button class="va-btn" @click.stop="snapshotSlot(idx)" title="截图">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip :content="slot.recording ? '停止录像' : '录像'" placement="top">
                    <button class="va-btn" :class="{ 'va-rec': slot.recording }" @click.stop="toggleRecordSlot(idx)" :title="slot.recording ? '停止录像' : '录像'">
                      <svg v-if="!slot.recording" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>
                      <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                      <span v-if="slot.recording" class="rec-dot"></span>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="对讲" placement="top">
                    <button class="va-btn" :class="{ 'va-talk': slot.talking }" @click.stop="openTalk(idx)" title="对讲">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip :content="slot.muted ? '开启声音' : '静音'" placement="top">
                    <button class="va-btn" @click.stop="toggleSlotAudio(idx)" :title="slot.muted ? '开启声音' : '静音'">
                      <svg v-if="slot.muted" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                      <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="图像调节" placement="top">
                    <button class="va-btn" @click.stop="openImageAdjust" title="图像调节">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="全屏" placement="top">
                    <button class="va-btn" @click.stop="maximizeSlot(idx)" title="全屏">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="关闭" placement="top">
                    <button class="va-btn va-btn-close" @click.stop="closeSlot(idx)" title="关闭">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </el-tooltip>
                </div>
              </div>
            </div>
          </div>
        </el-card>

        <!-- AI检测日志 -->
        <el-card class="log-card" :body-style="{ padding: '8px 12px' }">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span>🧠 AI检测日志</span>
              <el-button size="small" text @click="detectionLogs = []">清空</el-button>
            </div>
          </template>
          <div class="log-scroll" ref="logRef">
            <div v-for="(log, i) in detectionLogs" :key="i" class="log-row">
              <span class="log-t">{{ log.time }}</span>
              <el-tag :type="log.tagType as any" size="small" effect="dark">{{ log.level }}</el-tag>
              <span class="log-m">{{ log.msg }}</span>
            </div>
            <div v-if="!detectionLogs.length" class="log-empty">等待检测结果...</div>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧: 通道 + PTZ -->
      <el-col :span="6">
        <el-card>
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span>通道列表</span>
              <el-input v-model="chSearch" size="small" style="width:140px" placeholder="搜索..." clearable />
            </div>
          </template>
          <div class="channel-list">
            <div v-for="ch in filteredChannels" :key="ch.id"
                 class="ch-item"
                 draggable="true"
                 @dragstart="onDragChannel($event, ch)"
                 @click="assignToActive(ch)">
              <div class="ch-icon" :class="ch.status">
                <el-icon :size="18"><VideoCamera /></el-icon>
              </div>
              <div class="ch-body">
                <div class="ch-name">{{ ch.name }}</div>
                <div class="ch-meta">
                  <span>{{ ch.algoPlugin || '无算法' }}</span>
                  <span>{{ ch.fps || 0 }}fps</span>
                </div>
              </div>
              <el-tag :type="((ch as any).status === 'streaming' ? 'success' : (ch as any).status === 'online' ? 'primary' : 'info') as any" size="small">
                {{ (ch as any).status === 'streaming' ? '推流' : (ch as any).status === 'online' ? '在线' : '离线' }}
              </el-tag>
            </div>
            <el-empty v-if="!filteredChannels.length" description="暂无通道" :image-size="50" />
          </div>
        </el-card>

        <!-- PTZ面板 -->
        <el-card v-if="hasActive" style="margin-top:12px">
          <template #header>PTZ 云台</template>
          <div class="ptz-panel">
            <div class="ptz-dpad">
              <div class="ptz-row"><el-button circle @mousedown="ptzStart('up')" @mouseup="ptzStop"><el-icon><ArrowUp /></el-icon></el-button></div>
              <div class="ptz-row">
                <el-button circle @mousedown="ptzStart('left')" @mouseup="ptzStop"><el-icon><ArrowLeft /></el-icon></el-button>
                <el-button circle type="primary" @click="ptzHome"><el-icon><Aim /></el-icon></el-button>
                <el-button circle @mousedown="ptzStart('right')" @mouseup="ptzStop"><el-icon><ArrowRight /></el-icon></el-button>
              </div>
              <div class="ptz-row"><el-button circle @mousedown="ptzStart('down')" @mouseup="ptzStop"><el-icon><ArrowDown /></el-icon></el-button></div>
            </div>
            <div class="ptz-zoom-row">
              <el-button @mousedown="ptzStart('zoom_in')" @mouseup="ptzStop">变倍 +</el-button>
              <el-button @mousedown="ptzStart('zoom_out')" @mouseup="ptzStop">变倍 -</el-button>
            </div>
            <div class="ptz-speed">
              <span>速度</span>
              <el-slider v-model="ptzSpeed" :min="1" :max="255" :show-tooltip="false" size="small" />
            </div>
            <div class="ptz-presets">
              <span>预置位</span>
              <el-button-group size="small">
                <el-button v-for="p in 4" :key="p" @click="ptzPreset(p)">P{{ p }}</el-button>
              </el-button-group>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 统计面板 -->
    <StreamStatsPanel
      v-model="statsPanelVisible"
      :slots="activeSlotList"
      :health-states="streamHealth.healthStates"
    />

    <!-- 对讲弹窗 -->
    <el-dialog v-model="talkDialogVisible" title="语音对讲" width="400px" :append-to-body="true"
      :close-on-click-modal="false" :close-on-press-escape="false" @close="stopTalk">
      <div style="text-align:center;padding:20px">
        <el-icon :size="48" :color="isTalking ? '#0F9D58' : '#9AA0A6'"><Microphone /></el-icon>
        <p style="margin:12px 0">{{ talkSlotName }} — {{ isTalking ? '对讲中...' : '点击开始对讲' }}</p>
        <el-button :type="isTalking ? 'danger' : 'success'" size="large" round @click="toggleTalk">
          {{ isTalking ? '停止对讲' : '开始对讲' }}
        </el-button>
        <p style="color:#9AA0A6;font-size:12px;margin-top:12px">需要浏览器麦克风权限，且设备需支持语音对讲</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, reactive, nextTick, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import { getDeviceChannels } from '@/api/devices'
import { streamHttp, deviceHttp, http } from '@/api/http'
import { ptzControl as ptzApi } from '@/api/ptz'
import { detectFromBase64, getInferenceStatus } from '@/api/inference'
import type { DetectionResult } from '@/api/inference'
import { ElMessage, ElNotification } from 'element-plus'
import { Lock, Unlock } from '@element-plus/icons-vue'
import type { Channel, DeviceItem } from '@/types/device'
import Hls from 'hls.js'
import flvjs from 'flv.js'
import { useStreamHealth } from '@/composables/useStreamHealth'
import { useAdaptiveBitrate } from '@/composables/useAdaptiveBitrate'
import StreamStatsPanel from '@/components/StreamStatsPanel.vue'
import { useChannelStore } from '@/stores/channel'
import type { PlayerFormat as StorePlayerFormat, ActiveSlotData } from '@/stores/channel'

type PlayerFormat = 'flv' | 'ws-flv' | 'hls' | 'webrtc'

const FORMAT_LABELS: Record<PlayerFormat, string> = {
  'flv': 'HTTP-FLV',
  'ws-flv': 'WS-FLV',
  'hls': 'HLS',
  'webrtc': 'WebRTC',
}

const FORMAT_LATENCY_INFO: Record<PlayerFormat, string> = {
  'webrtc': '超低延迟 (<500ms)',
  'flv': '低延迟 (<1s)',
  'ws-flv': '低延迟 (<1s)',
  'hls': '标准延迟 (3-5s)',
}

interface GridSlot {
  channelId: string
  name: string
  status: string
  urls: Partial<Record<PlayerFormat, string>>
  codec: string  // 视频编码格式（H.264/H.265/HEVC，用于播放器选择）
  playing: boolean
  loading: boolean
  muted: boolean
  deviceId: string
  playerInstance: Hls | flvjs.Player | null
  recording: boolean
  talking: boolean
  currentFormat: PlayerFormat | ''
  webrtcRetryCount: number
  reconnectCount: number
  encrypted: boolean
  detections: DetectionResult[]
  detectionTime: number
  _lastReconnectTime: number
  _videoEventCleanups: Array<() => void>  // video 事件监听器清理函数
}

const route = useRoute()
const router = useRouter()
const deviceStore = useDeviceStore()

// 视频网格
const layout = ref(4)
const activeSlotIdx = ref(0)
const gridSlots = reactive<GridSlot[]>(
  Array.from({ length: 16 }, () => ({
    channelId: '', name: '', status: '', urls: {}, codec: '', playing: false, loading: false, muted: true, deviceId: '', playerInstance: null, recording: false, talking: false, currentFormat: '', webrtcRetryCount: 0, reconnectCount: 0, encrypted: false, detections: [] as DetectionResult[], detectionTime: 0, _lastReconnectTime: 0, _videoEventCleanups: []
  }))
)
const preferredFormat = ref<PlayerFormat>('flv')
const videoRefs = ref<Record<number, HTMLVideoElement>>({})
const overlayRefs = ref<Record<number, HTMLCanvasElement | null>>({})
const gridRef = ref<HTMLElement>()
const logRef = ref<HTMLElement>()

function setOverlayRef(idx: number, el: any) {
  if (el) overlayRefs.value[idx] = el as HTMLCanvasElement
}

// 检测框颜色映射
const CLASS_COLORS: Record<string, string> = {
  person: '#EF4444', bicycle: '#F59E0B', car: '#3B82F6', motorcycle: '#3B82F6',
  bus: '#3B82F6', truck: '#3B82F6', dog: '#22C55E', cat: '#22C55E',
}

// 流健康监测（传入卡顿回调用于强制刷新）
// onReconnectExhausted: 重连耗尽时停止监测，避免 setInterval 持续触发日志洪泛
const streamHealth = useStreamHealth(
  (slotIdx, stallCount) => {
    // 检测到卡顿，强制刷新视频元素
    const slot = gridSlots[slotIdx]
    const video = videoRefs.value[slotIdx]
    if (!slot || !video) return

    // HLS 格式的卡顿：不重建播放器（HLS 重建不会改善流质量，反而引入黑屏闪烁）
    // 让 hls.js 内置的 error recovery（startLoad / recoverMediaError）自行恢复
    if (slot.currentFormat === 'hls') {
      console.warn(`[LiveView] slot${slotIdx} HLS 卡顿（stallCount=${stallCount}），跳过重建（由 hls.js 自行恢复）`)
      return
    }

    console.warn(`[LiveView] slot${slotIdx} 卡顿检测触发（stallCount=${stallCount}），强制刷新视频`)

    // 尝试通过跳帧方式恢复（不重建播放器）
    if (slot.currentFormat === 'flv' || slot.currentFormat === 'ws-flv') {
      const player = slot.playerInstance as any
      if (player && typeof player.refreshLogo === 'function') {
        // flv.js 提供 refreshLogo 方法强制刷新画面
        player.refreshLogo()
      }
    }

    // [关键修复] 仅在启用了自动重连时才自动重建播放器
    // 禁用时只刷新画面，不重建播放器，避免画面闪烁
    if (AUTO_RECONNECT_ENABLED && stallCount >= 2 && slot.channelId && !formatSwitching.has(slotIdx)) {
      console.warn(`[LiveView] slot${slotIdx} 连续卡顿 ${stallCount} 次，重建播放器`)
      formatSwitching.add(slotIdx)
      const fmt = slot.currentFormat as PlayerFormat
      if (fmt && slot.urls[fmt]) {
        // 延迟 300ms 重建，避免频繁重建
        setTimeout(() => {
          destroyPlayer(slot, slotIdx)
          attachPlayerByFormat(slotIdx, fmt)
          setTimeout(() => formatSwitching.delete(slotIdx), 3000)
        }, 300)
      }
    }
  },
  (slotIdx) => {
    // 重连耗尽回调：停止该 slot 的健康监测，防止 setInterval 持续触发日志洪泛
    console.warn(`[LiveView] slot${slotIdx} 重连耗尽，停止健康监测`)
    streamHealth.stopMonitoring(slotIdx)
  }
)

// 码率自适应
const adaptiveBitrate = useAdaptiveBitrate()

// 全局通道状态 Store（跨路由持久化）
const channelStore = useChannelStore()

// 统计面板
const statsPanelVisible = ref(false)

// 用于统计面板的活跃 slot 列表
const activeSlotList = computed(() =>
  gridSlots
    .map((slot, idx) => ({ slotIdx: idx, channelId: slot.channelId, name: slot.name }))
    .filter(s => !!s.channelId)
)

// 重连锁（防止并发重连）
const reconnecting = new Set<number>()
// 格式切换锁（防止 format watcher 和 health watcher 竞争）
const formatSwitching = new Set<number>()
// 重连防抖（防止快速重复触发）
const reconnectDebounce = new Map<number, number>() // slotIdx -> lastTriggerTime
// 协议降级冷却时间（防止频繁切换导致的闪烁）
const formatCooldown = new Map<number, number>() // slotIdx -> lastSwitchTime
const FORMAT_COOLDOWN_MS = 15000  // 15 秒内不允许再次降级

// 统一降级链常量：所有降级逻辑引用此定义，消除三处分散的矛盾
// H.264: FLV → WS-FLV → WebRTC → HLS
// H.265: HLS → WebRTC（FLV/WS-FLV 的 MSE 不支持 H.265）
const DEGRADATION_CHAINS: Record<'h264' | 'h265', PlayerFormat[]> = {
  h264: ['flv', 'ws-flv', 'webrtc', 'hls'],
  h265: ['hls', 'webrtc'],
}

/** 获取指定编码的降级链中，当前格式之后第一个可用的格式 */
function getNextFallbackFormat(currentFmt: PlayerFormat, codec: string, urls: Partial<Record<PlayerFormat, string>>): PlayerFormat | null {
  const chain = (codec && (codec.toUpperCase().includes('H265') || codec.toUpperCase().includes('HEVC')))
    ? DEGRADATION_CHAINS.h265 : DEGRADATION_CHAINS.h264
  const currentIdx = chain.indexOf(currentFmt)
  // 从当前格式之后开始找
  for (let i = currentIdx + 1; i < chain.length; i++) {
    if (urls[chain[i]]) return chain[i]
  }
  return null
}

// P2-4: 安全自动重连 — 启用但限制为同格式重连，不自动降级协议
// 同格式最多重试 3 次，超过后停止自动重连
const AUTO_RECONNECT_ENABLED = true
const MAX_SAME_FORMAT_RETRIES = 3

const setVideoRef = (el: any, idx: number) => {
  if (el) videoRefs.value[idx] = el as HTMLVideoElement
}

// 通道数据
const channels = ref<Channel[]>([])
const devices = ref<DeviceItem[]>([])
const chSearch = ref('')
const ptzSpeed = ref(128)
const currentTime = ref('')

// 录像
const isRecording = computed(() => gridSlots[activeSlotIdx.value]?.recording)

// 图像调节
const imageDialogVisible = ref(false)
const imageAdjust = reactive({ brightness: 50, contrast: 50, saturation: 50, hue: 50 })

// 检测日志
interface LogEntry { time: string; level: string; tagType: string; msg: string }
const detectionLogs = ref<LogEntry[]>([])

// 告警弹窗节流:同一通道+目标类型 30 秒内只弹一次
const ALERT_THROTTLE_MS = 30_000
const lastAlertTime: Record<string, number> = {}

// 只有 layout 对应数量的格子可见
const visibleSlots = computed(() => gridSlots.slice(0, layout.value))

// 对讲
const talkDialogVisible = ref(false)
const talkSlotIdx = ref(-1)
const isTalking = ref(false)
const talkSlotName = computed(() => talkSlotIdx.value >= 0 ? gridSlots[talkSlotIdx.value]?.name || '' : '')
let talkStream: MediaStream | null = null
let talkCallId = ''
let talkAudioCtx: AudioContext | null = null
let talkSendInterval: ReturnType<typeof setInterval> | null = null
let talkPcmBuffer: Int16Array = new Int16Array(0)
let talkDownWs: WebSocket | null = null
let talkPlayCtx: AudioContext | null = null
let talkNextPlayTime = 0

const hasActive = computed(() => !!gridSlots[activeSlotIdx.value]?.channelId)
const activeChannelName = computed(() => gridSlots[activeSlotIdx.value]?.name || '实时监控')
const filteredChannels = computed(() => {
  if (!chSearch.value) return channels.value
  const s = chSearch.value.toLowerCase()
  return channels.value.filter(c => c.name.toLowerCase().includes(s))
})

// 切换分屏布局
function setLayout(n: number) {
  layout.value = n
  if (activeSlotIdx.value >= n) activeSlotIdx.value = 0
}

// 加载设备+通道
async function loadData() {
  if (!deviceStore.devices.length) await deviceStore.fetchDevices({ page: 1, pageSize: 100 })
  devices.value = deviceStore.devices
  // 加载所有设备的通道（仅在线设备）
  const allChs: Channel[] = []
  for (const dev of devices.value) {
    if (dev.status === 'offline') continue
    try {
      const res = await getDeviceChannels(dev.id) as any
      const chs: Channel[] = res?.data?.data ?? res?.data ?? res
      for (const ch of chs) {
        (ch as any).deviceId = dev.id
        if (ch.status === 'offline') continue
      }
      allChs.push(...chs)
    } catch { /* skip */ }
  }
  channels.value = allChs

  // 如果URL指定了设备，自动分配通道
  const qDev = route.query.deviceId as string
  const qCh = route.query.channelId as string
  if (qDev || qCh) {
    let ch: Channel | undefined
    if (qCh) {
      // 精确匹配通道 ID
      ch = allChs.find(c => c.id === qCh)
    }
    if (!ch && qDev) {
      // 匹配设备下的第一个通道
      ch = allChs.find(c => c.deviceId === qDev)
    }
    if (ch) assignChannel(0, ch)
  }
}

// 分配通道到视频格
function assignChannel(slotIdx: number, ch: Channel) {
  const slot = gridSlots[slotIdx]
  // 先关闭旧的播放器（不重置 slot 状态，避免闪烁）
  if (slot.playerInstance) {
    if ('destroy' in slot.playerInstance) slot.playerInstance.destroy()
    slot.playerInstance = null
  }
  if (slot.playing) {
    const video = videoRefs.value[slotIdx]
    if (video) { video.pause(); video.removeAttribute('src'); video.load() }
  }
  streamHealth.stopMonitoring(slotIdx)
  adaptiveBitrate.deactivate(slotIdx)

  // 保留旧画面直到新流就绪（避免黑屏闪烁）
  const wasPlaying = slot.playing

  slot.channelId = ch.id
  slot.name = ch.name
  slot.deviceId = ch.deviceId || ''
  slot.status = ch.status
  slot.muted = true
  // 仅在之前未播放时显示 loading，避免闪烁
  if (!wasPlaying) {
    slot.loading = true
  }

  // 获取播放地址并播放（智能选择低延迟格式）
  fetchStreamUrls(ch).then(result => {
    if (result && result.urls) {
      slot.urls = result.urls
      slot.codec = result.codec || ''  // 保存编码格式用于播放策略选择
      slot.playing = true
      slot.loading = false
      slot.status = 'streaming'
      // 根据编码格式智能选择播放格式：H.265 优先 WebRTC/HLS，H.264 使用 FLV
      const bestFmt = selectBestFormat(result.urls, result.codec)
      console.debug(`[LiveView] slot${slotIdx} 播放格式选择: codec=${result.codec || 'unknown'}, format=${bestFmt}, flv=${!!result.urls.flv}, webrtc=${!!result.urls.webrtc}, hls=${!!result.urls.hls}`)
      // 不更新 preferredFormat.value，避免触发 watcher 连锁重建其他 slot
      nextTick(() => {
          attachPlayerByFormat(slotIdx, bestFmt)
          // 激活码率自适应
          adaptiveBitrate.activate(
            slotIdx,
            ch.id,
            () => streamHealth.getHealth(slotIdx),
          )
        })
      // 注册到全局通道 Store（跨路由持久化）
      channelStore.registerSlot(slotIdx, {
        channelId: ch.id,
        deviceId: ch.deviceId || '',
        name: ch.name,
        urls: result.urls as any,
        codec: result.codec || '',
        format: bestFmt,
        inferenceEnabled: false,
        registeredAt: Date.now(),
      })
    } else {
      slot.loading = false
      // 流获取失败，清除旧画面
      if (wasPlaying) {
        slot.playing = false
      }
    }
  }).catch(() => {
    slot.loading = false
    if (wasPlaying) {
      slot.playing = false
    }
  })
}

function assignToActive(ch: Channel) {
  assignChannel(activeSlotIdx.value, ch)
}

function closeSlot(idx: number, hard: boolean = true) {
  const slot = gridSlots[idx]
  // 销毁播放器实例（所有场景都执行）
  if (slot.playerInstance) {
    if ('destroy' in slot.playerInstance) slot.playerInstance.destroy()
    slot.playerInstance = null
  }
  if (slot.playing) {
    const video = videoRefs.value[idx]
    if (video) { video.pause(); video.removeAttribute('src'); video.load() }
    // 关闭预览时不再通知后端停流 —— 保持流活跃以便算法持续运行
    // 仅注销前端通道映射，后端流和推理继续工作
    if (hard && slot.channelId) {
      channelStore.unregisterSlot(idx)
    }
  }
  Object.assign(slot, { channelId: '', name: '', status: '', urls: {}, playing: false, loading: false, muted: true, deviceId: '', playerInstance: null, currentFormat: '', webrtcRetryCount: 0, reconnectCount: 0, encrypted: false, _lastReconnectTime: 0 })
  streamHealth.stopMonitoring(idx)
  adaptiveBitrate.deactivate(idx)
}

// 根据选定格式播放
function attachPlayerByFormat(slotIdx: number, fmt: PlayerFormat) {
  const slot = gridSlots[slotIdx] as GridSlot
  const video = videoRefs.value[slotIdx]
  if (!video) return

  // 清理旧实例
  destroyPlayer(slot)
  video.pause()
  video.removeAttribute('src')
  video.load()

  // 记录当前格式
  slot.currentFormat = fmt

  const url = slot.urls[fmt]
  if (!url) {
    // 当前格式不可用，使用统一降级链查找可用格式
    const isH265 = slot.codec && (slot.codec.toUpperCase().includes('H265') || slot.codec.toUpperCase().includes('HEVC'))
    const chain = isH265 ? DEGRADATION_CHAINS.h265 : DEGRADATION_CHAINS.h264
    for (const fb of chain) {
      if (slot.urls[fb]) {
        fmt = fb
        break
      }
    }
    const fbUrl = slot.urls[fmt]
    if (!fbUrl) {
      // 无可用格式：根据编码给出明确提示
      if (isH265) {
        ElMessage.warning('此设备使用 H.265 编码，当前仅支持 HLS/WebRTC 播放，请检查流媒体配置')
      } else {
        ElMessage.warning('视频播放地址不可用，请检查设备推流状态')
      }
      return
    }
    return attachPlayerByFormat(slotIdx, fmt)
  }

  switch (fmt) {
    case 'flv':
      if (flvjs.isSupported()) {
        const player = flvjs.createPlayer({
          type: 'flv', url, isLive: true,
          hasAudio: false, hasVideo: true,
        }, {
          enableStashBuffer: false,
          stashInitialSize: 128,                    // 64→128 减少不完整帧送入MSE导致解码错误
          // GB28181 PS 封装流时间戳可能不连续，autoCleanup 会因负值 DTS 崩溃
          autoCleanupSourceBuffer: false,
          lazyLoad: false,
          // 局域网低延迟配置（autoCleanupSourceBuffer=false 已防崩溃）
          liveBufferLatencyChasing: true,
          liveBufferLatencyChasingOnPaused: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 1.5,         // 1.0→1.5 放宽延迟追赶阈值，避免频繁跳帧闪烁
          liveSyncMaxLatencyDurationCount: 1.2,     // 0.8→1.2 同上，减少 GB28181 低帧率设备误触发
        } as any)

        player.attachMediaElement(video)
        player.load()

        // 首帧显示事件（保存回调引用以便销毁时移除）
        let firstFramePlayed = false
        let firstFrameTimeout: ReturnType<typeof setTimeout> | null = null

        // 如果 2 秒内没有收到 playing 事件，发送 I 帧请求
        firstFrameTimeout = setTimeout(() => {
          if (!firstFramePlayed && slot.channelId) {
            console.warn(`[LiveView] slot${slotIdx} 2秒内未收到首帧，发送I帧请求`)
            streamHttp.post(`/${slot.channelId}/quality`, {
              id: slot.channelId,
              quality: 'high'
            }).catch(() => {})
          }
        }, 2000)

        const onFlvFirstFrame = () => {
          if (!firstFramePlayed) {
            firstFramePlayed = true
            if (firstFrameTimeout) {
              clearTimeout(firstFrameTimeout)
              firstFrameTimeout = null
            }
            console.debug(`[LiveView] slot${slotIdx} 首帧已显示`)
          }
        }
        video.addEventListener('playing', onFlvFirstFrame)
        slot._videoEventCleanups.push(() => video.removeEventListener('playing', onFlvFirstFrame))

        const playPromise = player.play()
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((e: any) => {
            console.warn('[LiveView] flv play() rejected (autoplay policy):', e?.message || e)
          })
        }
        player.on(flvjs.Events.ERROR, (errorType: any, errorDetail: any, errorInfo: any) => {
          console.error('[LiveView] flv.js ERROR:', errorType, errorDetail, errorInfo)
          player.destroy()
          slot.playerInstance = null
          // 使用统一降级链查找下一个可用格式
          const nextFmt = getNextFallbackFormat('flv', slot.codec, slot.urls)
          if (nextFmt) {
            console.debug(`[LiveView] FLV 失败，降级到 ${nextFmt}`)
            attachPlayerByFormat(slotIdx, nextFmt)
          } else {
            ElMessage.warning('视频播放失败（不支持此编码格式），请刷新重试')
          }
        })


        slot.playerInstance = player
        streamHealth.startMonitoring(slotIdx, player, video)
      } else {
        attachPlayerByFormat(slotIdx, 'hls')
      }
      break

    case 'ws-flv':
      if (flvjs.isSupported()) {
        const player = flvjs.createPlayer({
          type: 'flv', url, isLive: true,
          hasAudio: false, hasVideo: true,
        }, {
          enableStashBuffer: false,
          stashInitialSize: 128,                    // 64→128 减少不完整帧送入MSE导致解码错误
          // GB28181 PS 封装流时间戳可能不连续，autoCleanup 会因负值 DTS 崩溃
          autoCleanupSourceBuffer: false,
          lazyLoad: false,
          // 局域网低延迟配置（autoCleanupSourceBuffer=false 已防崩溃）
          liveBufferLatencyChasing: true,
          liveBufferLatencyChasingOnPaused: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 1.5,         // 1.0→1.5 放宽延迟追赶阈值，避免频繁跳帧闪烁
          liveSyncMaxLatencyDurationCount: 1.2,     // 0.8→1.2 同上，减少 GB28181 低帧率设备误触发
        } as any)

        // 首帧显示事件（保存回调引用以便销毁时移除）
        let wsFirstFramePlayed = false
        const onWsFlvFirstFrame = () => {
          if (!wsFirstFramePlayed) {
            wsFirstFramePlayed = true
            console.debug(`[LiveView] slot${slotIdx} WS-FLV 首帧已显示`)
          }
        }
        video.addEventListener('playing', onWsFlvFirstFrame)
        slot._videoEventCleanups.push(() => video.removeEventListener('playing', onWsFlvFirstFrame))

        // H.265/编码错误降级（flv.js 不支持 H.265 MSE 解码）
        player.on(flvjs.Events.ERROR, (_errorType: string, _errorDetail: string, _errorInfo: any) => {
          console.error(`[LiveView] ws-flv ERROR:`, _errorType, _errorDetail, _errorInfo)
          player.destroy()
          slot.playerInstance = null
          const nextFmt = getNextFallbackFormat('ws-flv', slot.codec, slot.urls)
          if (nextFmt) {
            attachPlayerByFormat(slotIdx, nextFmt)
          }
        })

        player.attachMediaElement(video)
        player.load()
        const wsPlayPromise = player.play()
        if (wsPlayPromise && typeof wsPlayPromise.catch === 'function') {
          wsPlayPromise.catch((e: any) => {
            console.warn('[LiveView] ws-flv play() rejected (autoplay policy):', e?.message || e)
          })
        }
        slot.playerInstance = player
        streamHealth.startMonitoring(slotIdx, player, video)
      } else {
        attachPlayerByFormat(slotIdx, 'hls')
      }
      break

    case 'hls':
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          // 低延迟模式核心配置
          lowLatencyMode: true,
          // P1-4: 局域网低延迟缓冲区配置
          maxBufferLength: 0.3,                   // P1-4: 0.5→0.3 更激进
          maxMaxBufferLength: 0.8,                // P1-4: 1→0.8 限制缓冲增长
          maxBufferSize: 1 * 1000 * 1000,         // 1MB 缓冲区上限
          maxBufferHole: 0.1,                      // 缓冲区缺口容忍度
          // 直播同步参数（控制延迟）
          liveSyncDurationCount: 0.5,              // P1-4: 1→0.5 更积极同步到最新
          liveMaxLatencyDurationCount: 1.5,        // P1-4: 2→1.5 最大延迟容忍 1.5s
          liveDurationInfinity: true,
          highBufferWatchdogPeriod: 1,
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.debug(`[LiveView] slot${slotIdx} HLS MANIFEST_PARSED，开始播放`)
          video.play().catch(() => {})
        })
        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          console.debug(`[LiveView] slot${slotIdx} HLS 切换到级别 ${data.level}`)
        })
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
          }
        })
        slot.playerInstance = hls
        // HLS 健康监测：传入 Hls 实例和 video 元素
        streamHealth.startMonitoring(slotIdx, hls, video)
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
        video.addEventListener('loadedmetadata', () => video.play().catch(() => {}))
      }
      break

    case 'webrtc':
      // WebRTC 通过 ZLM 信令交换
      attachWebRtc(slotIdx, url)
      break
  }
}

function destroyPlayer(slot: any, slotIdx?: number) {
  const slotOrIdx = slotIdx ?? gridSlots.indexOf(slot)
  if (slotOrIdx < 0) return

  // 获取原始对象（避免响应式代理导致的 undefined）
  const rawSlot = toRaw(gridSlots[slotOrIdx])
  const p = rawSlot?.playerInstance
  if (p) {
    // 停止健康监测
    streamHealth.stopMonitoring(slotOrIdx)
    if ('destroy' in p) {
      try { p.destroy() } catch (e) { console.warn('[LiveView] destroy player error:', e) }
    }
    rawSlot.playerInstance = null
  }
  // 清理 video 元素事件监听器
  if (rawSlot?._videoEventCleanups?.length) {
    for (const cleanup of rawSlot._videoEventCleanups) {
      try { cleanup() } catch { /* ignore */ }
    }
    rawSlot._videoEventCleanups.length = 0
  }
}

// 智能选择最佳播放格式（使用统一降级链）
function selectBestFormat(urls: Partial<Record<PlayerFormat, string>>, codec?: string): PlayerFormat {
  const isH265 = !!(codec && (codec.toUpperCase().includes('H265') || codec.toUpperCase().includes('HEVC')))
  const chain = isH265 ? DEGRADATION_CHAINS.h265 : DEGRADATION_CHAINS.h264

  if (isH265) {
    console.debug(`[LiveView] 检测到 H.265 编码，降级链: ${chain.join(' → ')}, codec=${codec}`)
  }

  // 返回降级链中第一个有 URL 的格式
  for (const fmt of chain) {
    if (urls[fmt]) return fmt
  }
  return chain[0] // 默认返回链头
}

// WebRTC 播放：通过 ZLM 后端 SDP 交换
async function attachWebRtc(slotIdx: number, webrtcUrl: string) {
  const slot = gridSlots[slotIdx] as GridSlot
  const video = videoRefs.value[slotIdx]
  if (!video || !slot.channelId) {
    console.warn(`[WebRTC] slot${slotIdx} 缺少 video 或 channelId，降级到 HLS`)
    if (slot.urls['hls']) {
      attachPlayerByFormat(slotIdx, 'hls')
    } else if (slot.urls['ws-flv']) {
      attachPlayerByFormat(slotIdx, 'ws-flv')
    } else if (slot.urls.flv) {
      attachPlayerByFormat(slotIdx, 'flv')
    }
    return
  }

  // 连续失败 2 次后该 slot 直接走 HLS
  if (slot.webrtcRetryCount >= 2) {
    console.warn(`[WebRTC] slot${slotIdx} 已连续失败 ${slot.webrtcRetryCount} 次，直接使用 HLS`)
    if (slot.urls['hls']) {
      attachPlayerByFormat(slotIdx, 'hls')
    } else if (slot.urls['ws-flv']) {
      attachPlayerByFormat(slotIdx, 'ws-flv')
    } else {
      attachPlayerByFormat(slotIdx, 'flv')
    }
    return
  }

  // ICE candidate 质量检测变量
  let hasSrflxOrRelay = false
  let candidateCheckTimer: ReturnType<typeof setTimeout> | null = null

  // ICE 超时检测定时器
  let iceTimeoutTimer: ReturnType<typeof setTimeout> | null = null

  try {
    // ICE 配置：局域网使用空数组（纯 host candidate 即可穿透）
    // 公网部署时通过 /api/v1/media/ice-config 获取 STUN/TURN 配置
    const iceServers: RTCIceServer[] = []
    try {
      const { data: iceResp } = await streamHttp.get('/ice-config')
      const servers = iceResp?.data?.iceServers
      if (Array.isArray(servers) && servers.length > 0) {
        iceServers.push(...servers)
      }
    } catch { /* 后端不支持此接口，使用空配置 */ }

    const pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: 'max-bundle',
    })
    pc.addTransceiver('video', { direction: 'recvonly' })
    pc.addTransceiver('audio', { direction: 'recvonly' })

    pc.ontrack = (ev) => {
      if (ev.streams && ev.streams[0]) {
        video.srcObject = ev.streams[0]
        video.play().catch(() => {})
      }
    }

    // ICE candidate 质量检测：检查是否收到 srflx/relay 候选
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return
      const candidateType = ev.candidate.type
      if (candidateType === 'srflx' || candidateType === 'relay') {
        hasSrflxOrRelay = true
      }
    }

    // 启动 ICE candidate 质量检测定时器：3 秒内仅收到 host 候选则发出警告
    candidateCheckTimer = setTimeout(() => {
      if (!hasSrflxOrRelay) {
        console.warn(`[WebRTC] slot${slotIdx} 3秒内未收到 srflx/relay 候选，可能存在 NAT 穿透问题`)
        ElMessage.warning('WebRTC 仅收到本地候选，可能存在 NAT 穿透问题')
      }
    }, 3000)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // ZLM 模式 - 通过后端 API 交换 SDP
    await exchangeSdpViaBackend(pc, slot.channelId, offer)

    // ICE 超时检测：创建 offer 后启动 3 秒定时器
    iceTimeoutTimer = setTimeout(() => {
      const state = pc.iceConnectionState
      if (state === 'new' || state === 'checking') {
        console.warn(`[WebRTC] slot${slotIdx} ICE 超时（状态=${state}），降级到 HLS`)
        slot.webrtcRetryCount++
        pc.close()
        slot.playerInstance = null
        ElMessage.warning('WebRTC 连接超时，已切换为 HLS')
        // WebRTC 失败后降级到 HLS（HLS 支持 H.265）
        if (slot.urls['hls']) {
          attachPlayerByFormat(slotIdx, 'hls')
        } else {
          ElMessage.error('WebRTC 和 HLS 均不可用，视频播放失败')
        }
      }
    }, 3000)

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        slot.webrtcRetryCount++
        // 清理定时器
        if (iceTimeoutTimer) { clearTimeout(iceTimeoutTimer); iceTimeoutTimer = null }
        if (candidateCheckTimer) { clearTimeout(candidateCheckTimer); candidateCheckTimer = null }
        pc.close()
        slot.playerInstance = null
        ElMessage.warning('WebRTC 连接断开，已切换为 HLS')
        // WebRTC 失败后降级到 HLS（HLS 支持 H.265）
        if (slot.urls['hls']) {
          attachPlayerByFormat(slotIdx, 'hls')
        } else if (slot.urls['ws-flv']) {
          attachPlayerByFormat(slotIdx, 'ws-flv')
        } else {
          ElMessage.error('WebRTC、HLS 均不可用，视频播放失败')
        }
      } else if (pc.iceConnectionState === 'connected') {
        // 连接成功：重置重试计数器
        slot.webrtcRetryCount = 0
        // 清理定时器
        if (iceTimeoutTimer) { clearTimeout(iceTimeoutTimer); iceTimeoutTimer = null }
        if (candidateCheckTimer) { clearTimeout(candidateCheckTimer); candidateCheckTimer = null }
        // 验证 DTLS-SRTP 加密状态
        pc.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'transport') {
              slot.encrypted = report.dtlsState === 'connected'
            }
          })
        }).catch(() => {})
      }
    }

    // 包装 pc 为可销毁对象
    slot.playerInstance = {
      destroy() {
        if (iceTimeoutTimer) { clearTimeout(iceTimeoutTimer); iceTimeoutTimer = null }
        if (candidateCheckTimer) { clearTimeout(candidateCheckTimer); candidateCheckTimer = null }
        streamHealth.stopMonitoring(slotIdx)
        pc.close()
        video.srcObject = null
      },
    } as any
    // WebRTC 健康监测
    streamHealth.startMonitoring(slotIdx, pc)
  } catch (e: any) {
    slot.webrtcRetryCount++
    if (iceTimeoutTimer) { clearTimeout(iceTimeoutTimer); iceTimeoutTimer = null }
    if (candidateCheckTimer) { clearTimeout(candidateCheckTimer); candidateCheckTimer = null }
    console.error('WebRTC failed:', e)
    ElMessage.warning(`WebRTC 连接失败(${e.message || '未知'})，已切换为 HLS`)
    // WebRTC 失败后降级到 HLS（HLS 支持 H.265）
    if (slot.urls['hls']) {
      attachPlayerByFormat(slotIdx, 'hls')
    } else if (slot.urls['ws-flv']) {
      attachPlayerByFormat(slotIdx, 'ws-flv')
    } else {
      ElMessage.error('WebRTC、HLS 均不可用，视频播放失败')
    }
  }
}

// 后端 SDP 交换（ZLM 模式）
async function exchangeSdpViaBackend(pc: RTCPeerConnection, channelId: string, offer: RTCSessionDescriptionInit) {
  try {
    const resp = await streamHttp.post(`/${channelId}/webrtc-sdp`, {
      offer: offer.sdp,
    })
    const answer = resp.data?.data?.answer || resp.data?.data?.sdp
    if (!answer) {
      console.error(`[WebRTC] SDP 交换返回空 answer: channelId=${channelId}, resp=`, resp.data)
      throw new Error('WebRTC backend SDP exchange failed: empty answer')
    }
    await pc.setRemoteDescription(new RTCSessionDescription({
      type: 'answer',
      sdp: answer,
    }))
  } catch (e: any) {
    // 增强诊断：区分后端错误和网络错误
    if (e.code) {
      console.error(`[WebRTC] SDP 交换业务错误: channelId=${channelId}, code=${e.code}, msg=${e.message}`)
    } else {
      console.error(`[WebRTC] SDP 交换网络/系统错误: channelId=${channelId}, msg=${e.message}`)
    }
    throw e
  }
}

// 切换格式时重新播放所有活跃 slot
watch(preferredFormat, (fmt) => {
  for (let i = 0; i < 16; i++) {
    if (gridSlots[i].playing) {
      formatSwitching.add(i)
      nextTick(() => {
        attachPlayerByFormat(i, fmt)
        // 格式切换完成后解除锁定
        setTimeout(() => formatSwitching.delete(i), 3000)
      })
    }
  }
})

// 自动重连逻辑：watch healthStates，当某 slot status 变为 error 时触发重连
watch(
  () => ({ ...streamHealth.healthStates }),
  (newStates) => {
    for (const [idxStr, health] of Object.entries(newStates)) {
      const idx = Number(idxStr)
      if (isNaN(idx)) continue

      const slot = gridSlots[idx]

      // 连接恢复时重置重连计数器
      // 防止重连后短暂 good 立即重置计数器导致无限循环：
      // 必须持续 good 状态超过 10 秒才重置（确保真正有视频数据在播放）
      if (health.status === 'good' && slot) {
        const now = Date.now()
        const lastReconnectTime = slot._lastReconnectTime || 0
        if (lastReconnectTime === 0 || (now - lastReconnectTime) > 10000) {
          slot.reconnectCount = 0
          reconnectDebounce.delete(idx)
        }
      }

      if (health.status !== 'error') continue
      if (!AUTO_RECONNECT_ENABLED) continue  // [关键修复] 禁用自动重连，防止画面闪烁
      if (reconnecting.has(idx)) continue
      // 格式切换中跳过（避免格式切换触发时又重建播放器）
      if (formatSwitching.has(idx)) continue

      // 协议降级冷却期：15 秒内不允许再次降级（防止频繁切换导致的闪烁）
      const now = Date.now()
      const lastSwitch = formatCooldown.get(idx) || 0
      if (now - lastSwitch < FORMAT_COOLDOWN_MS) {
        console.warn(`[StreamHealth] slot${idx} 在降级冷却期内，跳过`)
        continue
      }

      // 重连防抖：距离上次重连不足 1 秒则跳过
      const lastTrigger = reconnectDebounce.get(idx) || 0
      if (now - lastTrigger < 1000) continue

      if (!slot?.channelId || !slot.playing) continue

      // P2-4: 安全重连 — 同格式重试，不自动降级协议
      if (slot.reconnectCount > MAX_SAME_FORMAT_RETRIES) {
        console.warn(`[StreamHealth] slot${idx} 已达最大重连次数(${MAX_SAME_FORMAT_RETRIES})，停止自动重连`)
        reconnecting.delete(idx)
        continue
      }

      reconnecting.add(idx)
      slot.reconnectCount++
      slot._lastReconnectTime = Date.now()
      reconnectDebounce.set(idx, now)

      const currentFmt = slot.currentFormat as PlayerFormat
      // P2-4: 始终使用同格式重连，不自动降级（避免画面闪烁）
      let targetFmt = currentFmt

      // WebRTC 特殊处理：回退到 FLV（WebRTC 不稳定时直接切换）
      if (currentFmt === 'webrtc') {
        targetFmt = slot.urls['flv'] ? 'flv' : (slot.urls['hls'] ? 'hls' : 'webrtc')
        console.warn(`[StreamHealth] slot${idx} WebRTC 重连失败，切换到 ${targetFmt}`)
      } else {
        console.warn(`[StreamHealth] slot${idx} status=error, 同格式重连 ${targetFmt} (${slot.reconnectCount}/${MAX_SAME_FORMAT_RETRIES})`)
      }

      // 先停止监测
      streamHealth.stopMonitoring(idx)

      // 销毁当前播放器
      destroyPlayer(slot, idx)
      const video = videoRefs.value[idx]
      if (video) { video.pause(); video.removeAttribute('src'); video.load() }

      // 延迟 500ms 后重连
      setTimeout(() => {
        if (slot.channelId) {
          formatSwitching.add(idx)
          attachPlayerByFormat(idx, targetFmt)
          setTimeout(() => formatSwitching.delete(idx), 3000)
        }
        reconnecting.delete(idx)
      }, 500)
    }
  },
  { deep: true }
)

async function fetchStreamUrls(ch: Channel): Promise<{urls: Partial<Record<PlayerFormat, string>>, codec: string} | null> {
  try {
    // 1. 启动国标设备推流 (GB28181 INVITE)，直接从响应中获取播放URL
    let startData: any = null
    let codec = ''
    try {
      const { data: startResp } = await streamHttp.post(`/${ch.id}/start`)
      startData = startResp?.data || startResp
    } catch (e: any) { console.warn('[LiveView] start stream failed (may already be streaming):', e?.message || e) }

    // /start 响应已包含 flvUrl/webrtcUrl，zlmReady=true 时直接使用
    if (startData && (startData.flvUrl || startData.webrtcUrl) && startData.zlmReady) {
      // /start 响应中包含 codec（从 ZLM tracks 检测，或从设备配置缓存读取）
      // 优先使用 /start 的 codec，避免 multi-urls 因时序问题返回空值
      codec = startData.codec || ''
      // 使用 /start 已有的 URL，不阻塞等待 multi-urls（后台已优化，大部分场景足够）
      return {
        urls: {
          flv: startData.flvUrl || '',
          webrtc: startData.webrtcUrl || '',
          'ws-flv': startData.wsFlvUrl || '',
          hls: startData.hlsUrl || '',
        },
        codec,
      }
    }

    // 2. zlmReady=false 或 start 失败时，轮询 multi-urls 等待流就绪（8×80ms=640ms）
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const { data } = await streamHttp.get(`/${ch.id}/multi-urls`)
        const d = data?.data || data
        if (d?.flvUrl || d?.webrtcUrl || d?.hlsUrl) {
          return {
            urls: {
              flv: d.flvUrl || '',
              webrtc: d.webrtcUrl || '',
              'ws-flv': d.wsFlvUrl || '',
              hls: d.hlsUrl || '',
            },
            codec: d.codec || '',
          }
        }
      } catch {
        try {
          const { data } = await streamHttp.get(`/${ch.id}/hls-url`)
          const d = data?.data || data
          if (d?.flvUrl || d?.hlsUrl) {
            return {
              urls: {
                flv: d.flvUrl || '',
                'ws-flv': d.wsFlvUrl || '',
                hls: d.hlsUrl || '',
                webrtc: d.webrtcUrl || '',
              },
              codec: d.codec || '',
            }
          }
        } catch { /* 流可能还未就绪 */ }
      }
      await new Promise(r => setTimeout(r, 80))
    }
    return null
  } catch (e) {
    console.error('[LiveView] fetchStreamUrls error:', e)
    return null
  }
}

// 拖拽通道到视频格
function onDragChannel(e: DragEvent, ch: Channel) {
  e.dataTransfer!.setData('application/json', JSON.stringify({ id: ch.id, name: ch.name, status: ch.status, deviceId: ch.deviceId }))
}
function onDropChannel(e: DragEvent, idx: number) {
  const raw = e.dataTransfer?.getData('application/json')
  if (!raw) return
  try {
    const ch = JSON.parse(raw)
    assignChannel(idx, ch as any)
  } catch { /* ignore */ }
}

// 截图
function snapshotSlot(idx: number) {
  const video = videoRefs.value[idx]
  if (!video) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 640
  canvas.height = video.videoHeight || 480
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  const link = document.createElement('a')
  link.download = `snapshot_${gridSlots[idx].name}_${Date.now()}.jpg`
  link.href = canvas.toDataURL('image/jpeg', 0.95)
  link.click()
  ElMessage.success('截图已保存')
}
function snapshotActive() { snapshotSlot(activeSlotIdx.value) }

// 音频
function toggleSlotAudio(idx: number) {
  const slot = gridSlots[idx]
  slot.muted = !slot.muted
  const video = videoRefs.value[idx]
  if (video) video.muted = slot.muted
}

// 全屏
function toggleFullscreen() {
  const cell = gridRef.value?.children[activeSlotIdx.value] as HTMLElement
  if (cell?.requestFullscreen) cell.requestFullscreen()
}
function maximizeSlot(idx: number) {
  activeSlotIdx.value = idx
  toggleFullscreen()
}

// PTZ控制
function ptzStart(direction: 'left' | 'right' | 'up' | 'down' | 'zoom_in' | 'zoom_out') {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot.channelId) return
  ptzApi({
    deviceId: slot.deviceId,
    channelId: slot.channelId,
    direction,
    speed: ptzSpeed.value
  }).catch(() => {})
}
function ptzStop() { /* 停止持续移动 */ }
function ptzHome() {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot.channelId) return
  ptzApi({ deviceId: slot.deviceId, channelId: slot.channelId, direction: 'home' })
}
function ptzPreset(preset: number) {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot.channelId) return
  ptzApi({ deviceId: slot.deviceId, channelId: slot.channelId, direction: 'goto_preset', preset })
}

// 对讲
async function openTalk(idx: number) {
  talkSlotIdx.value = idx
  talkDialogVisible.value = true
}

async function toggleTalk() {
  if (isTalking.value) { stopTalk(); return }

  const slot = gridSlots[talkSlotIdx.value]
  if (!slot?.deviceId || !slot?.channelId) {
    ElMessage.error('请先选择通道')
    return
  }

  try {
    // 1. 获取麦克风（8kHz采样率用于G.711A对讲）
    talkStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 8000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    })

    // 2. 调后端 talk/start — 发 SIP INVITE 给设备
    const resp = await deviceHttp.post(`/${slot.deviceId}/talk/start`, {
      channel_id: slot.channelId,
    })
    talkCallId = resp.data?.data?.call_id || ''
    if (!talkCallId) {
      ElMessage.error('对讲邀请失败：设备无响应')
      cleanupTalk()
      talkDialogVisible.value = false
      return
    }

    // 3. 创建 AudioContext 采集 PCM 数据
    // 浏览器可能不支持 8kHz，降采样到 8kHz
    const actualSampleRate = talkStream.getAudioTracks()[0]?.getSettings().sampleRate || 48000
    talkAudioCtx = new AudioContext({ sampleRate: actualSampleRate })
    const source = talkAudioCtx.createMediaStreamSource(talkStream)

    // ScriptProcessorNode 采集 PCM（每 2048 样本回调一次）
    const processor = talkAudioCtx.createScriptProcessor(2048, 1, 1)
    source.connect(processor)
    processor.connect(talkAudioCtx.destination) // 必须连接到 destination 才能触发回调

    const targetSampleRate = 8000
    const ratio = actualSampleRate / targetSampleRate

    processor.onaudioprocess = (e) => {
      if (!isTalking.value) return
      const inputData = e.inputBuffer.getChannelData(0) // Float32

      // 一阶IIR低通滤波防止混叠 (fc ≈ 3.5kHz @ 实际采样率)
      const alpha = 0.15
      let prev = 0
      const filtered = new Float32Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        filtered[i] = prev + alpha * (inputData[i] - prev)
        prev = filtered[i]
      }

      // 降采样到 8kHz
      const outputLen = Math.floor(filtered.length / ratio)
      const resampled = new Float32Array(outputLen)
      for (let i = 0; i < outputLen; i++) {
        resampled[i] = filtered[Math.floor(i * ratio)]
      }

      // Float32 → Int16 PCM
      const pcm16 = new Int16Array(resampled.length)
      for (let i = 0; i < resampled.length; i++) {
        const s = Math.max(-1, Math.min(1, resampled[i]))
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }

      // 追加到缓冲区（预分配扩展避免频繁GC）
      const merged = new Int16Array(talkPcmBuffer.length + pcm16.length)
      merged.set(talkPcmBuffer)
      merged.set(pcm16, talkPcmBuffer.length)
      talkPcmBuffer = merged
    }

    isTalking.value = true
    slot.talking = true
    ElMessage.success('对讲已建立')

    // 3.5 启动下行音频接收（设备→浏览器播放）
    startTalkDownstream(talkCallId)

    // 4. 定时发送缓冲的 PCM 数据给后端（每20ms发一帧160样本）
    let talkErrorCount = 0
    const TALK_MAX_ERRORS = 3  // 连续失败3次后停止发送
    talkSendInterval = setInterval(async () => {
      if (talkPcmBuffer.length < 160 || !talkCallId) return

      const chunk = talkPcmBuffer.slice(0, 160)
      talkPcmBuffer = talkPcmBuffer.slice(160)

      // PCM → base64
      const bytes = new Uint8Array(chunk.buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const b64 = btoa(binary)

      try {
        // 后端路由: POST /api/v1/talk/:call_id/audio（无 /devices 前缀）
        await http.post(`/talk/${talkCallId}/audio`, {
          data: b64,
        })
        talkErrorCount = 0
      } catch {
        talkErrorCount++
        if (talkErrorCount >= TALK_MAX_ERRORS) {
          console.error(`[Talk] 音频上行连续失败 ${TALK_MAX_ERRORS} 次，停止发送`)
          stopTalk()
          ElMessage.error('对讲音频发送失败，已停止对讲')
        }
      }
    }, 20)

  } catch (e: any) {
    if (e.name === 'NotAllowedError') {
      ElMessage.error('麦克风权限被拒绝，请在浏览器设置中允许')
    } else {
      ElMessage.error('对讲失败: ' + (e.message || '未知错误'))
    }
    cleanupTalk()
    talkDialogVisible.value = false
  }
}

function stopTalk() {
  talkDialogVisible.value = false
  const slot = talkSlotIdx.value >= 0 ? gridSlots[talkSlotIdx.value] : null

  // 通知后端停止对讲
  if (talkCallId && slot?.deviceId) {
    deviceHttp.post(`/${slot.deviceId}/talk/stop`, {
      call_id: talkCallId,
    }).catch(() => {})
  }

  cleanupTalk()
}

function cleanupTalk() {
  isTalking.value = false

  const slot = talkSlotIdx.value >= 0 ? gridSlots[talkSlotIdx.value] : null
  if (slot) slot.talking = false

  // 停止定时发送
  if (talkSendInterval) {
    clearInterval(talkSendInterval)
    talkSendInterval = null
  }
  talkPcmBuffer = new Int16Array(0)

  // 关闭AudioContext
  if (talkAudioCtx) {
    talkAudioCtx.close().catch(() => {})
    talkAudioCtx = null
  }

  // 释放麦克风
  if (talkStream) {
    talkStream.getTracks().forEach(t => t.stop())
    talkStream = null
  }

  talkCallId = ''

  // 关闭下行音频
  if (talkDownWs) { talkDownWs.close(); talkDownWs = null }
  if (talkPlayCtx) { talkPlayCtx.close().catch(() => {}); talkPlayCtx = null }
  talkNextPlayTime = 0
}

// 启动下行音频播放（设备→浏览器）
function startTalkDownstream(callId: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  talkDownWs = new WebSocket(`${protocol}//${window.location.host}/ws`)

  talkDownWs.onopen = () => {
    talkDownWs!.send(JSON.stringify({ type: 'subscribe', channel: `talk_${callId}` }))
  }

  talkPlayCtx = new AudioContext({ sampleRate: 8000 })
  talkNextPlayTime = 0

  talkDownWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type !== 'talk.audio_down' || msg.call_id !== callId) return

      // base64 → PCM Int16
      const binaryStr = atob(msg.data)
      const pcm = new Int16Array(binaryStr.length / 2)
      for (let i = 0; i < pcm.length; i++) {
        pcm[i] = (binaryStr.charCodeAt(i * 2 + 1) << 8) | binaryStr.charCodeAt(i * 2)
      }

      // Int16 → Float32
      const floats = new Float32Array(pcm.length)
      for (let i = 0; i < pcm.length; i++) {
        floats[i] = pcm[i] / 32768
      }

      const buffer = talkPlayCtx!.createBuffer(1, floats.length, 8000)
      buffer.getChannelData(0).set(floats)

      const source = talkPlayCtx!.createBufferSource()
      source.buffer = buffer
      source.connect(talkPlayCtx!.destination)

      const now = talkPlayCtx!.currentTime
      if (talkNextPlayTime < now) talkNextPlayTime = now
      source.start(talkNextPlayTime)
      talkNextPlayTime += buffer.duration
    } catch (e) {
      console.warn('[Talk] downstream decode error', e)
    }
  }
}

// 录像
function toggleRecordSlot(idx: number) {
  const slot = gridSlots[idx]
  if (!slot?.channelId) return
  slot.recording = !slot.recording
  if (slot.recording) ElMessage.info('开始录像（前端录制）')
  else ElMessage.success('录像已保存')
}
function toggleRecordActive() { toggleRecordSlot(activeSlotIdx.value) }

// 图像调节
function openImageAdjust() { imageDialogVisible.value = true }
function resetImageAdjust() {
  imageAdjust.brightness = 50; imageAdjust.contrast = 50
  imageAdjust.saturation = 50; imageAdjust.hue = 50
}

// 时钟
let clockTimer: ReturnType<typeof setInterval> | null = null
let logTimer: ReturnType<typeof setInterval> | null = null

function updateClock() {
  currentTime.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

// 推理引擎可用状态
const inferenceAvailable = ref(false)

// 检查推理引擎状态
async function checkInferenceStatus() {
  try {
    const resp = await getInferenceStatus()
    const data = resp.data?.data
    inferenceAvailable.value = data?.engine_available ?? false
    if (inferenceAvailable.value && data?.loaded_models?.length) {
      const model = data.loaded_models[0]
      console.debug(`[Inference] 引擎就绪, 模型: ${model.name}, 输入: ${model.input_shape}`)
    }
  } catch {
    inferenceAvailable.value = false
  }
}

// 在 Canvas 上绘制检测结果
function drawDetections(idx: number) {
  const slot = gridSlots[idx]
  const canvas = overlayRefs.value[idx]
  const video = videoRefs.value[idx]
  if (!canvas || !video || !slot.detections.length) {
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    return
  }

  // 5秒无新检测则清除
  if (Date.now() - (slot.detectionTime || 0) > 5000) {
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    slot.detections = []
    return
  }

  const videoW = video.videoWidth || 640
  const videoH = video.videoHeight || 480
  const displayW = video.clientWidth || canvas.clientWidth
  const displayH = video.clientHeight || canvas.clientHeight

  canvas.width = displayW
  canvas.height = displayH

  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, displayW, displayH)

  // object-fit: contain 宽高比映射
  const videoRatio = videoW / videoH
  const displayRatio = displayW / displayH
  let renderW: number, renderH: number, offsetX: number, offsetY: number
  if (videoRatio > displayRatio) {
    renderW = displayW
    renderH = displayW / videoRatio
    offsetX = 0
    offsetY = (displayH - renderH) / 2
  } else {
    renderH = displayH
    renderW = displayH * videoRatio
    offsetX = (displayW - renderW) / 2
    offsetY = 0
  }

  const scaleX = renderW
  const scaleY = renderH

  for (const det of slot.detections) {
    if (!det.bbox) continue
    const { x1, y1, x2, y2 } = det.bbox
    const px = offsetX + x1 * scaleX
    const py = offsetY + y1 * scaleY
    const pw = (x2 - x1) * scaleX
    const ph = (y2 - y1) * scaleY

    const color = CLASS_COLORS[det.class_name] || '#A78BFA'

    // 绘制矩形框
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(px, py, pw, ph)

    // 绘制标签背景 + 文字
    const label = `${det.class_name} ${Math.round(det.confidence * 100)}%`
    ctx.font = 'bold 11px sans-serif'
    const textW = ctx.measureText(label).width + 8
    ctx.fillStyle = color
    ctx.fillRect(px, py - 18, textW, 18)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, px + 4, py - 5)
  }
}

// 从视频帧捕获并执行推理
async function runInferenceOnFrame() {
  const playingSlots = gridSlots.filter(s => s.playing)
  if (!playingSlots.length) return

  // 随机选择一个正在播放的 slot
  const slot = playingSlots[Math.floor(Math.random() * playingSlots.length)]
  const idx = gridSlots.indexOf(slot)
  const video = videoRefs.value[idx]
  if (!video || video.videoWidth === 0) return

  try {
    // 捕获视频帧到 canvas 并转为 base64 JPEG
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]

    // 调用推理 API(传入通道信息,用于告警管道触发)
    const resp = await detectFromBase64(base64, slot.channelId || undefined, slot.deviceId || undefined)
    const result = resp.data?.data
    if (!result) return

    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })

    if (result.detections.length === 0) {
      detectionLogs.value.unshift({
        time,
        level: 'INFO',
        tagType: 'info',
        msg: `[${slot.name}] 帧分析完成, 无目标检测 | ${result.inference_time_ms.toFixed(0)}ms`
      })
    } else {
      // 有检测结果 - 按类型分组
      const classCounts: Record<string, { count: number; maxConf: number }> = {}
      for (const det of result.detections) {
        const name = det.class_name
        if (!classCounts[name]) classCounts[name] = { count: 0, maxConf: 0 }
        classCounts[name].count++
        classCounts[name].maxConf = Math.max(classCounts[name].maxConf, det.confidence)
      }

      for (const [className, info] of Object.entries(classCounts)) {
        const conf = Math.round(info.maxConf * 100)
        // 所有检测结果统一用 INFO 级别(普通目标检测不等同告警)
        // 真正的告警(入侵、烟火、打架等行为)由后端 AlarmService 推送
        const level = 'INFO'
        const tagType = 'info'
        detectionLogs.value.unshift({
          time,
          level,
          tagType,
          msg: `[${slot.name}] ${info.count}x ${className} | 置信度${conf}% | ${result.inference_time_ms.toFixed(0)}ms`
        })

        // 检测告警弹窗通知(节流：同一通道+目标类型 30秒内只弹一次)
        // 对异常场景和人员检测弹窗,普通目标检测(car/bicycle等)不弹窗
        const alertClasses = ['fire', 'smoke', 'fall', 'violence', 'intrusion', 'loitering', 'gathering', 'person']
        if (alertClasses.includes(className) && conf >= 60) {
          const alertKey = `${slot.name}_${className}`
          const now = Date.now()
          if (!lastAlertTime[alertKey] || now - lastAlertTime[alertKey] > ALERT_THROTTLE_MS) {
            lastAlertTime[alertKey] = now
            const classNameCn: Record<string, string> = {
              person: '人员', bicycle: '自行车', car: '车辆', motorcycle: '摩托车', bus: '公交车', truck: '卡车'
            }
            const label = classNameCn[className] || className
            ElNotification({
              title: 'AI 检测告警',
              message: `通道 [${slot.name}] 检测到 ${info.count}x ${label}，置信度 ${conf}%`,
              type: 'warning',
              duration: 4000,
              position: 'top-right',
            })
          }
        }
      }
    }
    if (detectionLogs.value.length > 200) detectionLogs.value.length = 200

    // 存储检测结果并绘制检测框
    slot.detections = result.detections || []
    slot.detectionTime = Date.now()
    nextTick(() => drawDetections(idx))
  } catch (e: any) {
    if (inferenceAvailable.value) {
      console.warn('[Inference] 推理请求失败:', e?.message || e)
    }
  }
}

onMounted(() => {
  loadData()
  updateClock()
  clockTimer = setInterval(updateClock, 1000)

  // 恢复之前活跃的通道（从全局 Store）
  restoreFromStore()

  // 检查推理引擎状态，然后启动推理定时器
  checkInferenceStatus().then(() => {
    if (inferenceAvailable.value) {
      logTimer = setInterval(runInferenceOnFrame, 3000)
    } else {
      // 推理引擎不可用时，5秒后重试一次
      setTimeout(() => {
        checkInferenceStatus().then(() => {
          if (inferenceAvailable.value) {
            logTimer = setInterval(runInferenceOnFrame, 3000)
          }
        })
      }, 5000)
    }
  })
})

/** 从全局 Store 恢复之前的通道播放状态 */
function restoreFromStore() {
  const snapshot = channelStore.snapshot()
  if (!snapshot.length) return

  for (const { idx, data } of snapshot) {
    const slot = gridSlots[idx]
    slot.channelId = data.channelId
    slot.name = data.name
    slot.deviceId = data.deviceId
    slot.urls = data.urls as any
    slot.codec = data.codec
    slot.status = 'streaming'
    slot.playing = true
    slot.loading = false
    slot.currentFormat = data.format

    nextTick(() => {
      attachPlayerByFormat(idx, data.format)
      adaptiveBitrate.activate(idx, data.channelId, () => streamHealth.getHealth(idx))
    })
  }
  // 恢复后隐藏浮窗
  channelStore.showFloatingPreview = false
  console.info(`[LiveView] 已恢复 ${snapshot.length} 个通道`)
}

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (logTimer) clearInterval(logTimer)
  // 清理健康监测
  streamHealth.cleanup()
  // 有活跃通道时软关闭（不通知后端停流），否则硬关闭
  if (channelStore.hasActive) {
    for (let i = 0; i < 16; i++) closeSlot(i, false)  // soft close
    channelStore.showFloatingPreview = true
  } else {
    for (let i = 0; i < 16; i++) closeSlot(i)  // hard close
  }
})
</script>

<style scoped>
.live-page { max-width: 1920px; }
.video-card { background: #1A1D23; border: 1px solid #3C4043; }
.video-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid #3C4043; }
.toolbar-title { color: #E8EAED; display: flex; align-items: center; gap: 8px; font-weight: 600; }
.toolbar-actions { display: flex; gap: 8px; align-items: center; }

/* 视频网格 */
.video-grid { display: grid; gap: 2px; background: #000; min-height: 480px; }
.grid-1 { grid-template-columns: 1fr; }
.grid-4 { grid-template-columns: 1fr 1fr; }
.grid-9 { grid-template-columns: 1fr 1fr 1fr; }
.grid-16 { grid-template-columns: 1fr 1fr 1fr 1fr; }

.video-cell { position: relative; background: #111; cursor: pointer; overflow: hidden; border: 2px solid transparent; transition: border-color 0.2s; min-height: 120px; }
.video-cell.active { border-color: #1A73E8; }
.video-cell.has-stream:hover .video-bottom-bar { opacity: 1; transform: translateY(0); }

/* 检测框叠加 canvas */
.detection-overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 5;
}

/* 检测计数徽章 */
.detection-badge {
  position: absolute; top: 6px; right: 6px; z-index: 6;
  background: rgba(46, 213, 115, 0.9); color: #fff;
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 10px; pointer-events: none;
}

/* 健康状态指示灯 */
.health-indicator {
  position: absolute;
  right: 8px;
  bottom: 40px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  z-index: 10;
  pointer-events: none;
}
.health-indicator.good { background: #0F9D58; box-shadow: 0 0 4px #0F9D58; }
.health-indicator.warning { background: #F9AB00; box-shadow: 0 0 4px #F9AB00; }
.health-indicator.error { background: #DB4437; box-shadow: 0 0 4px #DB4437; animation: blink-health 1s ease infinite; }
@keyframes blink-health { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

/* 安全加密指示器 */
.slot-security-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
  background: rgba(0,0,0,0.5);
  border-radius: 50%;
  padding: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

/* 质量等级标签 */
.quality-badge {
  position: absolute;
  top: 6px;
  left: 8px;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: rgba(26,115,232,0.75);
  color: #fff;
  pointer-events: none;
  z-index: 10;
  backdrop-filter: blur(2px);
}

.video-player { width: 100%; height: 100%; object-fit: contain; display: block; }
.video-empty { width: 100%; height: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #555; gap: 8px; font-size: 13px; }
.video-loading { width: 100%; height: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #1A73E8; gap: 8px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* HUD叠加 */
/* 海康风格底部工具条 */
.video-bottom-bar {
  position: absolute; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px;
  background: linear-gradient(transparent, rgba(0,0,0,0.85));
  opacity: 0; transform: translateY(4px);
  transition: opacity 0.25s, transform 0.25s;
  font-size: 12px; color: #fff;
}
.bottom-left { display: flex; align-items: center; gap: 8px; }
.bl-name { font-weight: 600; font-size: 13px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bl-badge { padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
.bl-badge.on { background: #0F9D58; color: #fff; }
.bl-badge.off { background: #DB4437; color: #fff; }
.bl-latency { padding: 1px 5px; border-radius: 3px; font-size: 10px; font-weight: 600; background: rgba(26,115,232,0.3); color: #8AB4F8; white-space: nowrap; }
.bl-codec { padding: 1px 5px; border-radius: 3px; font-size: 10px; font-weight: 600; background: rgba(255,152,0,0.3); color: #FFB74D; white-space: nowrap; }
.bl-time { font-family: 'Menlo', 'Consolas', monospace; font-size: 11px; color: #ccc; }
.bottom-actions { display: flex; gap: 2px; align-items: center; }
.va-btn {
  width: 28px; height: 28px; border: none; border-radius: 4px;
  background: rgba(255,255,255,0.12); color: #eee;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 15px; transition: all 0.15s;
}
.va-btn:hover { background: rgba(26,115,232,0.7); color: #fff; }
.va-btn.va-rec { background: rgba(239,68,68,0.7); color: #fff; animation: pulse-rec 1.5s ease infinite; }
.va-btn.va-talk { background: rgba(15,157,88,0.7); color: #fff; }
.va-btn-close:hover { background: rgba(219,68,55,0.7); }
.rec-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; margin-left: 2px; }
@keyframes pulse-rec { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

/* 日志 */
.log-card { margin-top: 12px; background: #1A1D23; border: 1px solid #3C4043; color: #E8EAED; }
.log-scroll { max-height: 160px; overflow-y: auto; font-family: 'Roboto Mono', monospace; font-size: 12px; }
.log-row { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px solid #2D3039; align-items: center; }
.log-t { color: #9AA0A6; white-space: nowrap; }
.log-m { flex: 1; color: #E8EAED; }
.log-empty { color: #666; text-align: center; padding: 20px; }

/* 通道列表 */
.channel-list { max-height: 400px; overflow-y: auto; }
.ch-item { display: flex; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; transition: all 0.15s; border: 1px solid transparent; }
.ch-item:hover { background: #2D3039; border-color: #1A73E8; }
.ch-icon { width: 36px; height: 36px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ch-icon.streaming { background: rgba(15,157,88,0.15); color: #0F9D58; }
.ch-icon.online { background: rgba(26,115,232,0.15); color: #1A73E8; }
.ch-icon.offline { background: rgba(154,160,166,0.15); color: #9AA0A6; }
.ch-body { flex: 1; min-width: 0; }
.ch-name { font-weight: 600; font-size: 13px; color: #E8EAED; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ch-meta { font-size: 11px; color: #9AA0A6; display: flex; gap: 12px; margin-top: 2px; }

/* PTZ */
.ptz-panel { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.ptz-dpad { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ptz-row { display: flex; gap: 16px; }
.ptz-zoom-row { display: flex; gap: 8px; width: 100%; }
.ptz-zoom-row .el-button { flex: 1; }
.ptz-speed { display: flex; align-items: center; gap: 8px; width: 100%; font-size: 12px; color: #9AA0A6; }
.ptz-speed .el-slider { flex: 1; }
.ptz-presets { display: flex; align-items: center; gap: 8px; width: 100%; font-size: 12px; color: #9AA0A6; }

/* 暗色主题覆盖 */
:deep(.el-card) { background: #252830; border-color: #3C4043; color: #E8EAED; }
:deep(.el-card__header) { border-color: #3C4043; color: #E8EAED; }
.image-adjust .adj-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.image-adjust .adj-row span:first-child { width: 48px; flex-shrink: 0; color: #9AA0A6; font-size: 13px; }
.image-adjust .adj-row .el-slider { flex: 1; }

.ptz-sliders { width: 100%; }
.ptz-slider-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px; color: #9AA0A6; }
.ptz-slider-row span:first-child { width: 32px; flex-shrink: 0; }
.ptz-slider-row .el-slider { flex: 1; }
.speed-val { width: 28px; text-align: right; font-size: 12px; color: #E8EAED; }
.ptz-presets { display: flex; align-items: center; gap: 8px; width: 100%; flex-wrap: wrap; }
.ptz-presets > span { font-size: 12px; color: #9AA0A6; }
</style>
