<template>
  <div class="face-realtime-view">
    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="5">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <el-icon class="stat-icon" :size="36" color="#409EFF"><Picture /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.total }}</div>
              <div class="stat-label">{{ $t('faceRealtime.stats.total') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card class="stat-card" shadow="hover" :class="{ 'highlight-blacklist': stats.blacklist > 0 }">
          <div class="stat-content">
            <el-icon class="stat-icon" :size="36" color="#F56C6C"><WarningFilled /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.blacklist }}</div>
              <div class="stat-label">{{ $t('faceRealtime.stats.blacklist') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <el-icon class="stat-icon" :size="36" color="#67C23A"><CircleCheckFilled /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.whitelist }}</div>
              <div class="stat-label">{{ $t('faceRealtime.stats.whitelist') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <el-icon class="stat-icon" :size="36" color="#909399"><QuestionFilled /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.unknown }}</div>
              <div class="stat-label">{{ $t('faceRealtime.stats.unknown') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="4" >
        <el-card class="stat-card stat-conn" shadow="hover">
          <div class="stat-content">
            <el-icon class="stat-icon" :size="28" :color="connected ? '#67C23A' : '#F56C6C'">
              <Connection v-if="connected" />
              <CircleClose v-else />
            </el-icon>
            <div class="stat-info">
              <div class="stat-value-small">
                {{ connected ? $t('faceRealtime.conn.connected') : $t('faceRealtime.conn.disconnected') }}
              </div>
              <div class="stat-label">{{ $t('faceRealtime.conn.title') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 控制栏 -->
    <el-card class="control-card">
      <div class="control-bar">
        <div class="control-left">
          <el-radio-group v-model="filterGroup" @change="onFilterChange">
            <el-radio-button value="all">{{ $t('faceRealtime.filter.all') }}</el-radio-button>
            <el-radio-button value="blacklist">
              <span class="dot dot-red" />{{ $t('faceRealtime.filter.blacklist') }}
            </el-radio-button>
            <el-radio-button value="whitelist">
              <span class="dot dot-green" />{{ $t('faceRealtime.filter.whitelist') }}
            </el-radio-button>
            <el-radio-button value="visitor">
              <span class="dot dot-orange" />{{ $t('faceRealtime.filter.visitor') }}
            </el-radio-button>
            <el-radio-button value="unknown">
              <span class="dot dot-gray" />{{ $t('faceRealtime.filter.unknown') }}
            </el-radio-button>
          </el-radio-group>
          <el-checkbox v-model="soundEnabled" class="sound-toggle">
            <el-icon><Bell /></el-icon>
            {{ $t('faceRealtime.control.soundOn') }}
          </el-checkbox>
          <el-checkbox v-model="autoScroll" class="sound-toggle">
            {{ $t('faceRealtime.control.autoScroll') }}
          </el-checkbox>
        </div>
        <div class="control-right">
          <span class="window-label">{{ $t('faceRealtime.control.window') }}:</span>
          <el-select v-model="windowMinutes" style="width: 100px">
            <el-option :value="5" :label="`5 ${$t('faceRealtime.minutes')}`" />
            <el-option :value="15" :label="`15 ${$t('faceRealtime.minutes')}`" />
            <el-option :value="30" :label="`30 ${$t('faceRealtime.minutes')}`" />
            <el-option :value="60" :label="`60 ${$t('faceRealtime.minutes')}`" />
          </el-select>
          <el-button :icon="Delete" size="small" @click="clearList">
            {{ $t('faceRealtime.control.clear') }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 事件流 -->
    <el-card class="event-card">
      <template #header>
        <el-tabs v-model="activeTab" class="event-tabs">
          <el-tab-pane name="realtime">
            <template #label>
              <span class="tab-label">
                <el-icon><VideoCamera /></el-icon>
                {{ $t('faceRealtime.title') }}
                <el-tag v-if="filteredEvents.length" type="info" size="small">
                  {{ filteredEvents.length }}
                </el-tag>
              </span>
            </template>
          </el-tab-pane>
          <el-tab-pane name="passrecords" lazy>
            <template #label>
              <span class="tab-label">
                <el-icon><Histogram /></el-icon>
                {{ $t('faceRealtime.passRecords.title') }}
                <el-tag v-if="passRecords.length" type="success" size="small">
                  {{ passRecords.length }}
                </el-tag>
              </span>
            </template>
            <!-- 通行记录查询栏 -->
            <div class="pass-record-toolbar">
              <el-select v-model="passRecordHours" style="width: 120px" @change="loadPassRecords">
                <el-option :value="1" :label="`1 ${$t('faceRealtime.hours')}`" />
                <el-option :value="6" :label="`6 ${$t('faceRealtime.hours')}`" />
                <el-option :value="24" :label="`24 ${$t('faceRealtime.hours')}`" />
                <el-option :value="72" :label="`72 ${$t('faceRealtime.hours')}`" />
              </el-select>
              <el-button :icon="Refresh" size="small" :loading="passLoading" @click="loadPassRecords">
                {{ $t('faceRealtime.refresh') }}
              </el-button>
            </div>
            <!-- 通行记录表格 -->
            <el-table :data="passRecords" v-loading="passLoading" stripe border size="small" class="pass-record-table">
              <el-table-column :label="$t('faceRealtime.passRecords.time')" prop="timestamp" width="160">
                <template #default="{ row }">
                  {{ new Date(row.timestamp).toLocaleString('zh-CN', { hour12: false }) }}
                </template>
              </el-table-column>
              <el-table-column :label="$t('faceRealtime.passRecords.type')" prop="pass_type" width="120">
                <template #default="{ row }">
                  <el-tag :type="passTypeTag(row.pass_type)" size="small">
                    {{ $t(`faceRealtime.passRecords.type_${row.pass_type}`) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="$t('faceRealtime.passRecords.name')" prop="name" min-width="100" show-overflow-tooltip />
              <el-table-column :label="$t('faceRealtime.passRecords.personId')" prop="person_id" width="140" show-overflow-tooltip />
              <el-table-column :label="$t('faceRealtime.passRecords.similarity')" prop="similarity" width="100">
                <template #default="{ row }">
                  <span :class="similarityClass(row.similarity)">{{ (row.similarity * 100).toFixed(1) }}%</span>
                </template>
              </el-table-column>
              <el-table-column :label="$t('faceRealtime.passRecords.liveness')" prop="is_live" width="90">
                <template #default="{ row }">
                  <el-tag v-if="row.liveness_score > 0" :type="row.is_live ? 'success' : 'danger'" size="small">
                    {{ row.is_live ? $t('faceRealtime.liveness.live') : $t('faceRealtime.liveness.fake') }}
                  </el-tag>
                  <span v-else class="text-muted">—</span>
                </template>
              </el-table-column>
              <el-table-column :label="$t('faceRealtime.passRecords.channel')" prop="device_id" width="120" show-overflow-tooltip />
              <el-table-column :label="$t('faceRealtime.passRecords.description')" prop="description" min-width="120" show-overflow-tooltip />
            </el-table>
            <el-empty v-if="!passLoading && !passRecords.length" :description="$t('faceRealtime.passRecords.empty')" :image-size="80" />
          </el-tab-pane>
        </el-tabs>
        <div v-if="activeTab === 'realtime'" class="event-card-header">
          <span class="card-title">
            <el-icon><VideoCamera /></el-icon>
            {{ $t('faceRealtime.title') }}
            <el-tag v-if="filteredEvents.length" type="info" size="small">
              {{ filteredEvents.length }}
            </el-tag>
          </span>
          <span v-if="!filteredEvents.length" class="empty-hint">
            <el-icon class="blink"><Loading /></el-icon>
            {{ $t('faceRealtime.waiting') }}
          </span>
        </div>
      </template>

      <div ref="scrollContainer" class="event-grid">
        <transition-group name="event-fade">
          <el-empty
            v-if="!filteredEvents.length"
            :description="$t('faceRealtime.empty')"
            :image-size="120"
            key="empty"
          />
          <div
            v-for="evt in filteredEvents"
            :key="evt.uid"
            class="event-item"
            :class="`event-${evt.group}`"
          >
            <!-- 抓拍图 -->
            <div class="event-image-wrap">
              <el-image
                v-if="evt.snapshotDataUrl"
                :src="evt.snapshotDataUrl"
                fit="cover"
                class="event-image"
                :preview-src-list="[evt.snapshotDataUrl]"
                hide-on-click-modal
              />
              <div v-else class="event-image-placeholder">
                <el-icon :size="48" color="#909399"><User /></el-icon>
                <div class="placeholder-text">{{ $t('faceRealtime.noSnapshot') }}</div>
              </div>
              <!-- 角标: 分组类型 -->
              <div class="event-group-tag" :class="`tag-${evt.group}`">
                {{ groupLabel(evt.group) }}
              </div>
              <!-- 活体标签 -->
              <div v-if="evt.livenessBadge" class="event-liveness-tag" :class="evt.livenessBadge.cls">
                {{ evt.livenessBadge.text }}
              </div>
            </div>

            <!-- 信息区 -->
            <div class="event-info">
              <div class="event-name" :class="`name-${evt.group}`">
                <el-icon v-if="evt.group === 'blacklist'" :size="16" color="#F56C6C"><WarningFilled /></el-icon>
                {{ evt.name }}
              </div>
              <div class="event-meta-row">
                <el-icon :size="12"><User /></el-icon>
                <span class="meta-text">{{ evt.personId || '—' }}</span>
              </div>
              <div v-if="evt.similarity > 0" class="event-meta-row">
                <el-icon :size="12"><Aim /></el-icon>
                <span class="meta-text">
                  {{ $t('faceRealtime.field.similarity') }}:
                  <span :class="similarityClass(evt.similarity)">
                    {{ (evt.similarity * 100).toFixed(1) }}%
                  </span>
                </span>
              </div>
              <div class="event-meta-row">
                <el-icon :size="12"><VideoCamera /></el-icon>
                <span class="meta-text">{{ evt.channelName }}</span>
              </div>
              <div v-if="evt.livenessScore > 0" class="event-meta-row">
                <el-icon :size="12"><Histogram /></el-icon>
                <span class="meta-text">
                  {{ $t('faceRealtime.field.liveness') }}:
                  <span :class="evt.livenessScore >= 0.5 ? 'val-good' : 'val-bad'">
                    {{ (evt.livenessScore * 100).toFixed(0) }}%
                  </span>
                </span>
              </div>
              <div v-if="evt.qualityScore > 0" class="event-meta-row">
                <el-icon :size="12"><Star /></el-icon>
                <span class="meta-text">
                  {{ $t('faceRealtime.field.quality') }}:
                  <span :class="qualityClass(evt.qualityScore)">
                    {{ (evt.qualityScore * 100).toFixed(0) }}%
                  </span>
                </span>
              </div>
              <div class="event-time">
                <el-icon :size="11"><Clock /></el-icon>
                {{ formatRelative(evt.timestamp) }}
              </div>
            </div>
          </div>
        </transition-group>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 人脸识别实时叠加视图
 * 订阅 /ws,过滤 face_* 类型,实时渲染人脸告警
 *
 * [v6.2 2026-06-21 修复]
 *  1. WebSocket 路径修正 /ws/alarms → /ws (与 DrogonWsAdapter 实际注册一致)
 *  2. onMounted 时拉一次 /api/v1/alarms?count=20 加载历史 face_* 事件
 *     (用户 SQL/手工录入的数据不会触发 pushAlarm 走 WS 链路,
 *      但会落到 alarm_events 表,需要主动拉取才能在"实时"页看到)
 *  3. WS 收流时按 alarm_type.startsWith('face_') 过滤,防非人脸告警噪音
 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Delete, Loading, User, Bell, VideoCamera, Clock, Aim, Histogram, Star,
  WarningFilled, CircleCheckFilled, QuestionFilled, Picture, Connection, CircleClose, Refresh
} from '@element-plus/icons-vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useI18n } from 'vue-i18n'
import { faceApi, FacePassRecord, alarmApi } from '@/api'

const { t } = useI18n()

// ── 类型 ──
interface FaceRealtimeEvent {
  uid: string
  alarmId: string | number
  timestamp: number
  personId: string
  name: string
  group: 'blacklist' | 'whitelist' | 'visitor' | 'unknown'
  similarity: number
  livenessScore: number
  isLive: boolean
  qualityScore: number
  channelId: number | string
  channelName: string
  snapshotBase64: string
  snapshotFormat: string
  snapshotDataUrl: string
  livenessBadge: { text: string; cls: string } | null
}

// ── WebSocket ──
// [v6.2 2026-06-21 修复] 后端 DrogonWsAdapter 只注册 /ws 一条路径
// (DrogonWsAdapter.cpp:70 WS_PATH_ADD("/ws")), 主题分发用 channel 名
// (WebSocketServer.cpp:373 publish("alarms", msg)). 原代码 useWebSocket('/ws/alarms')
// 永远 404 → connected=false, 即便真实 detector 推送 face 事件前端也收不到.
// 对标 AlarmsView.vue:611 的正确写法.
const { connected, subscribe } = useWebSocket('/ws')
let unsubAlarm: (() => void) | null = null
let unsubAlarmNew: (() => void) | null = null
let unsubWildcard: (() => void) | null = null
let recentLoadAbort: AbortController | null = null

// ── 状态 ──
const events = ref<FaceRealtimeEvent[]>([])
const filterGroup = ref<'all' | 'blacklist' | 'whitelist' | 'visitor' | 'unknown'>('all')
const soundEnabled = ref(false)
const autoScroll = ref(true)
const windowMinutes = ref(30)
const scrollContainer = ref<HTMLElement | null>(null)
const channelNameCache = new Map<string | number, string>()

// ── 通行记录状态 ──
const activeTab = ref<'realtime' | 'passrecords'>('realtime')
const passRecords = ref<FacePassRecord[]>([])
const passLoading = ref(false)
const passRecordHours = ref(24)

async function loadPassRecords() {
  passLoading.value = true
  try {
    const res = await faceApi.getPassRecords({ hours: passRecordHours.value, limit: 500 })
    if (res.data.code === 0) {
      passRecords.value = res.data.data?.pass_records ?? []
    } else {
      ElMessage.error(res.data.message || t('faceRealtime.passRecords.loadFailed'))
    }
  } catch (e) {
    ElMessage.error(t('faceRealtime.passRecords.loadFailed'))
  } finally {
    passLoading.value = false
  }
}

function passTypeTag(type: string): 'success' | 'warning' | 'danger' | 'info' {
  switch (type) {
    case 'whitelist':    return 'success'
    case 'visitor':      return 'warning'
    case 'blacklist_hit': return 'danger'
    case 'unknown':      return 'info'
    default:             return 'info'
  }
}

let alarmAudio: HTMLAudioElement | null = null
let audioUnlocked = false

// ── 统计 ──
const stats = computed(() => {
  const now = Date.now()
  const cutoff = now - windowMinutes.value * 60 * 1000
  const recent = events.value.filter(e => e.timestamp >= cutoff)
  return {
    total: recent.length,
    blacklist: recent.filter(e => e.group === 'blacklist').length,
    whitelist: recent.filter(e => e.group === 'whitelist').length,
    unknown: recent.filter(e => e.group === 'unknown').length,
  }
})

// ── 过滤 ──
const filteredEvents = computed(() => {
  const now = Date.now()
  const cutoff = now - windowMinutes.value * 60 * 1000
  return events.value
    .filter(e => e.timestamp >= cutoff)
    .filter(e => filterGroup.value === 'all' || e.group === filterGroup.value)
    .sort((a, b) => b.timestamp - a.timestamp)
})

// ── 辅助 ──
function groupLabel(g: FaceRealtimeEvent['group']) {
  return t(`faceRealtime.group.${g}`)
}

function similarityClass(s: number) {
  if (s >= 0.85) return 'val-great'
  if (s >= 0.7) return 'val-good'
  if (s >= 0.5) return 'val-mid'
  return 'val-bad'
}

function qualityClass(s: number) {
  if (s >= 0.7) return 'val-good'
  if (s >= 0.5) return 'val-mid'
  return 'val-bad'
}

function formatRelative(ts: number) {
  const diff = Date.now() - ts
  if (diff < 5000) return t('faceRealtime.time.justNow')
  if (diff < 60_000) return t('faceRealtime.time.secondsAgo', { n: Math.floor(diff / 1000) })
  if (diff < 3_600_000) return t('faceRealtime.time.minutesAgo', { n: Math.floor(diff / 60_000) })
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function classifyAlarmType(alarmType: string | number | undefined, group: string): FaceRealtimeEvent['group'] {
  const s = String(alarmType || '').toLowerCase()
  if (s.includes('black') || s === 'face_blacklist') return 'blacklist'
  if (s.includes('white') || s === 'face_whitelist') return 'whitelist'
  if (s.includes('visitor') || s === 'face_visitor') return 'visitor'
  // 没有明确分组时根据原 group_type 字符串
  if (group === 'blacklist' || group === 'whitelist' || group === 'visitor') return group
  return 'unknown'
}

function ensureAudio() {
  if (alarmAudio) return
  alarmAudio = new Audio('/audio/alarm.wav')
  alarmAudio.volume = 0.5
  alarmAudio.load()
}

function tryUnlockAudio() {
  if (audioUnlocked) return
  ensureAudio()
  alarmAudio?.play().then(() => {
    alarmAudio?.pause()
    if (alarmAudio) alarmAudio.currentTime = 0
    audioUnlocked = true
  }).catch(() => {
    /* needs user gesture */
  })
}

function playAlert() {
  if (!soundEnabled.value) return
  ensureAudio()
  if (alarmAudio) {
    alarmAudio.currentTime = 0
    alarmAudio.play().catch(() => { /* autoplay blocked */ })
  }
}

function buildSnapshotUrl(b64: string, format: string): string {
  if (!b64) return ''
  // b64 已带 data: 前缀直接用
  if (b64.startsWith('data:')) return b64
  // F5: 后端现在输出 bmp 格式, 浏览器原生支持; raw_bgr 降级处理
  const mime = format === 'raw_bgr' ? 'image/bmp' : `image/${format || 'jpeg'}`
  // 后端有可能直接给 raw bytes 的 base64,无 padding 修正
  const padded = b64.replace(/[^A-Za-z0-9+/=]/g, '')
  const fixed = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  return `data:${mime};base64,${fixed}`
}

// [v6.2 2026-06-21] 从 /api/v1/alarms 查到的快照是 URL, 需要转成绝对路径供 el-image 用
function normalizeSnapshotUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) return window.location.origin + url
  return window.location.origin + '/' + url
}

function buildLivenessBadge(isLive: boolean, score: number) {
  if (score <= 0) return null
  return isLive
    ? { text: t('faceRealtime.liveness.live'), cls: 'liveness-live' }
    : { text: t('faceRealtime.liveness.fake'), cls: 'liveness-fake' }
}

async function resolveChannelName(channelId: number | string): Promise<string> {
  if (!channelId && channelId !== 0) return t('faceRealtime.unknownChannel')
  if (channelNameCache.has(channelId)) return channelNameCache.get(channelId)!
  // 尝试从通道名后端拉,失败回退 ID
  try {
    const res = await fetch(`/api/v1/channels/${channelId}`, { credentials: 'include' })
    if (res.ok) {
      const json = await res.json()
      const name = json?.data?.name || json?.data?.channel_name
      if (name) {
        channelNameCache.set(channelId, name)
        return name
      }
    }
  } catch { /* ignore */ }
  channelNameCache.set(channelId, `Ch-${channelId}`)
  return `Ch-${channelId}`
}

let eventCounter = 0
async function handleAlarmEvent(raw: any) {
  if (!raw) return

  // 1. 字段归一 (snake_case + camelCase 兼容)
  const alarmType = raw.alarm_type ?? raw.type ?? raw.alarmType
  const typeStr = String(alarmType || '').toLowerCase()
  // 只处理人脸告警 (face_blacklist / face_whitelist / face_visitor / face_unknown)
  if (!typeStr.startsWith('face')) return

  const meta = raw.metadata || raw.meta || {}
  const personId = String(meta.person_id ?? raw.person_id ?? raw.personId ?? '')
  const name = meta.name ?? raw.name ?? t('faceRealtime.unknownPerson')
  const group = classifyAlarmType(alarmType, meta.group_type ?? raw.group_type ?? '')
  const similarity = Number(meta.similarity ?? raw.similarity ?? 0)
  const livenessScore = Number(meta.liveness_score ?? meta.livenessScore ?? 0)
  const isLive = meta.is_live !== undefined ? !!meta.is_live : (meta.isLive !== undefined ? !!meta.isLive : false)
  const qualityScore = Number(meta.quality_score ?? meta.qualityScore ?? 0)
  // channel_id 优先取数字, 缺失时降级 device_id (GB28181 20位 ID), 再用 0
  let channelId: number | string = raw.channel_id ?? raw.channelId ?? meta.channel_id ?? 0
  if ((!channelId || channelId === '0' || channelId === 0) && raw.device_id) {
    channelId = String(raw.device_id)
  }
  const snapshotBase64 = meta.snapshot_base64 ?? meta.snapshotBase64 ?? raw.snapshot_base64 ?? ''
  const snapshotFormat = meta.snapshot_format ?? meta.snapshotFormat ?? 'jpeg'

  const channelName = await resolveChannelName(channelId)

  // 2. 黑名单触发音效
  if (group === 'blacklist' && isLive) playAlert()

  // 3. 构造 UI 事件
  // [v6.2 2026-06-21] snapshot 优先用 base64, 其次用 /api/v1/alarms 返回的 URL (转绝对路径)
  const snapshotDataUrl = buildSnapshotUrl(snapshotBase64, snapshotFormat)
    || normalizeSnapshotUrl(raw.snapshot_url ?? raw.snapshotUrl ?? meta.snapshot_url ?? '')
  const evt: FaceRealtimeEvent = {
    uid: `evt-${Date.now()}-${++eventCounter}`,
    alarmId: raw.id ?? raw.alarm_id ?? '',
    timestamp: Number(raw.timestamp ?? raw.time ?? Date.now()) || Date.now(),
    personId,
    name,
    group,
    similarity,
    livenessScore,
    isLive,
    qualityScore,
    channelId,
    channelName,
    snapshotBase64,
    snapshotFormat,
    snapshotDataUrl,
    livenessBadge: buildLivenessBadge(isLive, livenessScore),
  }

  // 4. 压入头部,保留最近 200 条
  events.value = [evt, ...events.value].slice(0, 200)
}

// [v6.2 2026-06-21] 历史人脸事件加载
// 原因: SQL/手工录入或后端离线重放场景下, 事件只入 alarm_events DB, 不走 pushAlarm
//      → WS 收不到。需要主动从 /api/v1/alarms 拉取, 按 alarm_type.startsWith('face_') 过滤
// 注意: 该函数只负责"首次加载" + 后续周期拉取增量 (since = lastTimestamp - 1min)
// 周期拉取可以补齐"后端离线期间" 遗漏的事件, 同时不与 WS 重复 (前端有去重: alarmId 唯一)
let lastSeenAlarmId: string | null = null
async function loadRecentFaceAlarms() {
  if (recentLoadAbort) recentLoadAbort.abort()
  recentLoadAbort = new AbortController()
  try {
    const res = await alarmApi.getList({ count: 20, pageSize: 20, page: 1 } as any)
    const payload = (res as any).data?.data ?? (res as any).data ?? res
    const items: any[] = payload?.items ?? payload?.alarms ?? []
    if (!Array.isArray(items) || items.length === 0) return
    // 过滤 face_*, 同时按时间倒序
    const faceItems = items
      .filter((a) => String(a?.alarm_type || '').toLowerCase().startsWith('face_'))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    if (faceItems.length === 0) return
    // 倒序压入, 保持 head=最新. 跳过已经在 events 里出现过的 alarmId.
    for (let i = faceItems.length - 1; i >= 0; i--) {
      const it = faceItems[i]
      const id = String(it.alarm_id ?? it.id ?? '')
      if (id && events.value.some((e) => String(e.alarmId) === id)) continue
      await handleAlarmEvent(it)
    }
    if (!lastSeenAlarmId) lastSeenAlarmId = String(faceItems[0].alarm_id ?? faceItems[0].id ?? '')
  } catch (e: any) {
    if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
      console.warn('[FaceRealtime] loadRecentFaceAlarms failed:', e?.message || e)
    }
  }
}

// ── 用户交互 ──
function onFilterChange() {
  // 仅触发重渲染,过滤在 computed 中
}

function clearList() {
  events.value = []
  ElMessage.success(t('faceRealtime.cleared'))
}

// ── 通行记录 tab 懒加载 ──
watch(activeTab, (tab) => {
  if (tab === 'passrecords' && !passRecords.value.length) {
    loadPassRecords()
  }
})

// ── 自动滚动 ──
watch(filteredEvents, async () => {
  if (!autoScroll.value) return
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0
  }
})

// ── 生命周期 ──
let recentLoadTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  // 监听 alarm 消息
  unsubAlarm = subscribe('alarm', handleAlarmEvent)
  // 兼容 alarm.new 事件类型
  unsubAlarmNew = subscribe('alarm.new', handleAlarmEvent)
  // 也订阅 wildcard (某些推送会把整个消息直接当 alarm)
  // [v6.2 2026-06-21 修复] 原代码遗漏了 subscribe 返回值的保存, 导致多次进入页面会重复订阅
  unsubWildcard = subscribe('*', (msg: any) => {
    if (msg && (msg.alarm || msg.data)) {
      handleAlarmEvent(msg.alarm ?? msg.data)
    }
  })

  // [v6.2 2026-06-21] 补齐历史 face 事件, 避免页面打开一片空白
  loadRecentFaceAlarms()
  // 周期拉取补齐后端离线期间遗漏事件 (与 WS 推送去重)
  recentLoadTimer = setInterval(loadRecentFaceAlarms, 30_000)

  // 解锁音频
  const unlockHandler = () => {
    tryUnlockAudio()
    window.removeEventListener('click', unlockHandler)
  }
  window.addEventListener('click', unlockHandler, { once: true })
})

onUnmounted(() => {
  unsubAlarm?.()
  unsubAlarmNew?.()
  unsubWildcard?.()  // [v6.2 2026-06-21] 补全 cleanup
  if (recentLoadTimer) {
    clearInterval(recentLoadTimer)
    recentLoadTimer = null
  }
  recentLoadAbort?.abort()
  recentLoadAbort = null
})

defineOptions({ name: 'FaceRealtimeView' })
</script>

<style scoped>
/* .face-realtime-view { padding: 16px; } */

/* ── 统计卡片 ── */
.stats-row { margin-bottom: 12px; display: flex;align-items: center;}
.stat-card { min-height: 88px; }
.stat-content { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
.stat-info { flex: 1; }
.stat-value { font-size: 26px; font-weight: 600; color: #303133; line-height: 1.2; }
.stat-value-small { font-size: 13px; font-weight: 500; color: #303133; line-height: 1.2; }
.stat-label { font-size: 12px; color: #909399; margin-top: 4px; }
.stat-card.highlight-blacklist {
  border: 1px solid #F56C6C;
  animation: pulse-red 1.4s ease-in-out infinite;
}
@keyframes pulse-red {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0); }
  50% { box-shadow: 0 0 0 6px rgba(245, 108, 108, 0.18); }
}

/* ── 控制栏 ── */
.control-card { margin-bottom: 12px; }
.control-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.control-left, .control-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sound-toggle { margin-left: 8px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
.dot-red { background: #F56C6C; }
.dot-green { background: #67C23A; }
.dot-orange { background: #E6A23C; }
.dot-gray { background: #909399; }
.window-label { font-size: 12px; color: #606266; }

/* ── 事件卡片 ── */
.event-card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; }
.empty-hint { font-size: 12px; color: #909399; display: flex; align-items: center; gap: 6px; }
.blink { animation: rotate 1.2s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.event-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  max-height: calc(100vh - 360px);
  min-height: 240px;
  overflow-y: auto;
  padding-right: 4px;
}
.event-grid::-webkit-scrollbar { width: 6px; }
.event-grid::-webkit-scrollbar-thumb { background: #c0c4cc; border-radius: 3px; }
.event-grid::-webkit-scrollbar-track { background: transparent; }

/* ── 单个事件 ── */
.event-item {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.18s, box-shadow 0.18s;
}
.event-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.event-blacklist { border-color: rgba(245, 108, 108, 0.5); }
.event-whitelist { border-color: rgba(103, 194, 58, 0.4); }

.event-image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #f4f4f5;
  overflow: hidden;
}
.event-image { width: 100%; height: 100%; display: block; }
.event-image-placeholder {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 6px; color: #909399;
}
.placeholder-text { font-size: 12px; }

.event-group-tag {
  position: absolute; top: 8px; left: 8px;
  padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 500;
  color: #fff; backdrop-filter: blur(4px);
}
.tag-blacklist { background: rgba(245, 108, 108, 0.92); }
.tag-whitelist { background: rgba(103, 194, 58, 0.92); }
.tag-visitor   { background: rgba(230, 162, 60, 0.92); }
.tag-unknown   { background: rgba(144, 147, 153, 0.92); }

.event-liveness-tag {
  position: absolute; top: 8px; right: 8px;
  padding: 2px 6px; border-radius: 4px;
  font-size: 10px; font-weight: 500;
  color: #fff;
}
.liveness-live  { background: rgba(103, 194, 58, 0.92); }
.liveness-fake  { background: rgba(245, 108, 108, 0.92); }

.event-info {
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 4px;
}
.event-name {
  font-size: 15px; font-weight: 600; color: #303133;
  display: flex; align-items: center; gap: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.name-blacklist { color: #F56C6C; }
.name-whitelist { color: #67C23A; }
.name-visitor   { color: #E6A23C; }
.name-unknown   { color: #606266; }

.event-meta-row {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: #606266;
}
.meta-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.event-time {
  font-size: 11px; color: #909399;
  margin-top: 4px; display: flex; align-items: center; gap: 4px;
}

.val-great { color: #67C23A; font-weight: 600; }
.val-good  { color: #67C23A; }
.val-mid   { color: #E6A23C; }
.val-bad   { color: #F56C6C; }

/* ── 通行记录 ── */
.event-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }
.tab-label { display: flex; align-items: center; gap: 6px; }
.pass-record-toolbar {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 12px;
}
.pass-record-table { max-height: calc(100vh - 440px); overflow-y: auto; }
.text-muted { color: #c0c4cc; }

/* ── 进入动画 ── */
.event-fade-enter-active { transition: all 0.3s ease-out; }
.event-fade-leave-active { transition: all 0.2s ease-in; position: absolute; }
.event-fade-enter-from { opacity: 0; transform: translateY(-12px); }
.event-fade-leave-to   { opacity: 0; transform: scale(0.92); }

/* ── 移动端 ── */
@media (max-width: 768px) {
  .stats-row .el-col { margin-bottom: 8px; }
  .event-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); max-height: 60vh; }
  .control-bar { flex-direction: column; align-items: stretch; }
  .control-left, .control-right { justify-content: flex-start; }
}
</style>
