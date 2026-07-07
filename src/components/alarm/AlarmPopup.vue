<template>
  <Teleport to="body">
    <transition name="alarm-popup">
      <div v-if="popupVisible && currentAlarm" class="alarm-popup-overlay" @click.self="closePopup">
        <div class="alarm-popup" :class="{ 'alarm-flash': popupVisible }" :style="{ borderColor: levelColor }">

          <!-- ═══ 顶栏: 告警摘要 ═══ -->
          <div class="alarm-popup__header" :style="{ background: levelBg }">
            <div class="alarm-popup__header-left">
              <span class="alarm-popup__blink-dot" :style="{ background: levelColor }" />
              <span class="alarm-popup__type">{{ alarmTypeLabel }}</span>
              <el-tag v-if="targetCategoryLabel" size="small" type="info" effect="plain" class="alarm-popup__category-tag">
                {{ targetCategoryLabel }}: {{ targetNameLabel }}
              </el-tag>
              <el-tag :type="levelTagType" size="small" effect="dark" class="alarm-popup__level-tag">
                {{ levelLabel }}
              </el-tag>
              <span class="alarm-popup__device-info">
                {{ currentAlarm.deviceName || currentAlarm.deviceId }}
                {{ currentAlarm.channelName ? ` | ${currentAlarm.channelName}` : '' }}
              </span>
            </div>
            <div class="alarm-popup__header-right">
              <span v-if="queueInfo.total > 1" class="alarm-popup__queue">
                {{ queueInfo.current }}/{{ queueInfo.total }}
                <el-button size="small" text @click="prevAlarm" :disabled="queueInfo.current <= 1">‹</el-button>
                <el-button size="small" text @click="nextAlarm" :disabled="queueInfo.current >= queueInfo.total">›</el-button>
              </span>
              <span class="alarm-popup__countdown">{{ countdown }}s</span>
              <el-button size="small" text class="alarm-popup__close-btn" @click="closePopup">✕</el-button>
            </div>
          </div>

          <!-- ═══ 主体: 左侧 Tab + 右侧信息 ═══ -->
          <div class="alarm-popup__body">
            <!-- 左侧: 标签页切换 -->
            <div class="alarm-popup__left">
              <el-tabs v-model="activeTab" class="alarm-popup__tabs">
                <!-- 实时视频（始终显示，联动规则有 WEB_SHOW_LIVE 时自动激活） -->
                <el-tab-pane label="📹 实时视频" name="live">
                  <MiniPlayer
                    v-show="activeTab === 'live' && currentAlarm?.channelId"
                    :key="currentAlarm?.channelId || 'none'"
                    :channel-id="currentAlarm?.channelId || ''"
                    :show-controls="true"
                    stream-type="main"
                    :visible="activeTab === 'live'"
                    :skip-start-api="popupSkipStartApi"
                    @snapshot="onPlayerSnapshot"
                  />
                  <!-- [P1-CO2] 码流复用提示 -->
                  <div v-if="isChannelInLiveView" class="alarm-popup__stream-reused">
                    🔗 复用 LiveView 实时流
                  </div>
                  <div v-if="activeTab === 'live' && !currentAlarm?.channelId" class="alarm-popup__tab-content">
                    <div class="alarm-popup__placeholder">
                      <p>⚠️ 无通道信息</p>
                      <p class="alarm-popup__hint">该告警未关联视频通道</p>
                    </div>
                  </div>
                </el-tab-pane>

                <!-- 录像回放 (WEB_SHOW_PLAYBACK 或 WEB_RECORD_EVENT 时显示) -->
                <el-tab-pane v-if="hasAction('WEB_SHOW_PLAYBACK') || hasAction('WEB_RECORD_EVENT')" label="📼 录像回放" name="playback">
                  <div class="alarm-popup__tab-content">
                    <MiniPlayer
                      v-if="currentAlarm.videoClipUrl"
                      :key="`clip-${currentAlarm?.id || 'none'}-${currentAlarm.videoClipUrl}`"
                      :src="currentAlarm.videoClipUrl"
                      :channel-id="currentAlarm.channelId"
                      autoplay
                    />
                    <!-- 录像进行中：等待 record_complete 回调 -->
                    <div v-else-if="isRecordingInProgress" class="alarm-popup__recording-list">
                      <div class="alarm-popup__recording-state">
                        <div class="alarm-popup__recording-indicator">
                          <span class="alarm-popup__rec-dot" />
                          <span>录像中...</span>
                        </div>
                        <p class="alarm-popup__hint">告警事件录像正在录制中，预计 30~40 秒后完成</p>
                      </div>
                    </div>
                    <div v-else class="alarm-popup__recording-list">
                      <div v-if="recordingsLoading" style="text-align:center;color:#4A4D58;padding:20px">
                        <el-icon class="is-loading" :size="20"><Loading /></el-icon>
                        <span style="margin-left:8px">加载录像中...</span>
                      </div>
                      <div v-else-if="deviceRecordings.length === 0" class="alarm-popup__placeholder">
                        <p>📼 录像回放</p>
                        <p class="alarm-popup__hint">该告警暂无录像片段</p>
                        <el-button type="primary" size="small" @click="loadPlayback">加载设备录像</el-button>
                      </div>
                      <div v-else style="width:100%;overflow-y:auto;padding:8px">
                        <div style="font-size:12px;color:#8B8FA3;margin-bottom:8px">
                          找到 {{ deviceRecordings.length }} 段录像，点击播放：
                        </div>
                        <div
                          v-for="rec in deviceRecordings"
                          :key="rec.id"
                          class="alarm-popup__rec-item"
                          :class="{ 'alarm-popup__rec-item--active': selectedRecording?.id === rec.id }"
                          @click="playSelectedRecording(rec)"
                        >
                          <span class="alarm-popup__rec-time">
                            {{ rec.start_time?.split('T')[1]?.substring(0, 8) }} -
                            {{ rec.end_time?.split('T')[1]?.substring(0, 8) }}
                          </span>
                          <span class="alarm-popup__rec-size">
                            {{ rec.file_size ? (rec.file_size / 1048576).toFixed(1) + 'MB' : '' }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </el-tab-pane>

                <!-- 告警快照（始终显示） -->
                <el-tab-pane label="🖼️ 告警快照" name="snapshot">
                  <AlarmSnapshot
                    :key="`snap-${currentAlarm?.id || 'none'}`"
                    :image-url="snapshotImageUrl"
                    :bbox="(currentAlarm.metadata?.bbox as number[]) || []"
                    :target-label="(currentAlarm.metadata?.targetLabel as string) || ''"
                  />
                </el-tab-pane>
              </el-tabs>

              <!-- 联动动作标签栏 -->
              <div v-if="matchedRule?.actions?.length" class="alarm-popup__linkage-bar">
                <span class="alarm-popup__linkage-label">🔗 联动:</span>
                <span
                  v-for="action in matchedRule.actions.filter(a => a.enabled)"
                  :key="action.name + action.type"
                  class="alarm-popup__linkage-tag"
                >
                  {{ getActionIcon(action.type) }} {{ action.name || getActionName(action.type) }}
                </span>
              </div>
            </div>

            <!-- 右侧: 固定信息面板 -->
            <div class="alarm-popup__right">
              <el-scrollbar>
                <div class="alarm-popup__info">
                  <!-- 告警基本信息 -->
                  <div class="alarm-popup__section">
                    <div class="alarm-popup__section-title">📋 告警信息</div>
                    <div class="alarm-popup__info-grid">
                      <span class="alarm-popup__info-key">类型</span>
                      <span class="alarm-popup__info-val">{{ alarmTypeLabel }}</span>
                      <span class="alarm-popup__info-key">级别</span>
                      <span class="alarm-popup__info-val" :style="{ color: levelColor, fontWeight: 600 }">{{ levelLabel }}</span>
                      <span class="alarm-popup__info-key">时间</span>
                      <span class="alarm-popup__info-val">{{ formatTime(currentAlarm.createdAt) }}</span>
                      <span class="alarm-popup__info-key">设备</span>
                      <span class="alarm-popup__info-val">{{ currentAlarm.deviceName || currentAlarm.deviceId || '-' }}</span>
                      <span class="alarm-popup__info-key">通道</span>
                      <span class="alarm-popup__info-val">{{ currentAlarm.channelName || currentAlarm.channelId || '-' }}</span>
                      <span class="alarm-popup__info-key">位置</span>
                      <span class="alarm-popup__info-val">{{ currentAlarm.location || '-' }}</span>
                      <span class="alarm-popup__info-key">置信度</span>
                      <span class="alarm-popup__info-val" style="color:#00D4AA">{{ Math.round(currentAlarm.confidence * 100) }}%</span>
                      <span class="alarm-popup__info-key">目标</span>
                      <span class="alarm-popup__info-val">
                        <template v-if="targetCategoryLabel">
                          <el-tag size="small" type="info" effect="plain" style="margin-right:6px">
                            {{ targetCategoryLabel }}
                          </el-tag>
                        </template>
                        {{ targetNameLabel }}
                      </span>
                    </div>
                  </div>

                  <!-- AI 研判 -->
                  <div v-if="currentAlarm.aiConclusion" class="alarm-popup__section">
                    <div class="alarm-popup__section-title" style="color:#6C5CE7">🧠 AI研判</div>
                    <div class="alarm-popup__ai-box">{{ currentAlarm.aiConclusion }}</div>
                  </div>

                  <!-- 建议处置 -->
                  <div v-if="suggestedAction" class="alarm-popup__section">
                    <div class="alarm-popup__section-title" style="color:#FFB800">💡 建议处置</div>
                    <div class="alarm-popup__suggestion">{{ suggestedAction }}</div>
                  </div>

                  <!-- 联动执行状态 -->
                  <div v-if="linkageLogs.length" class="alarm-popup__section">
                    <div class="alarm-popup__section-title" style="color:#00D4AA">🔗 联动执行状态</div>
                    <div v-for="(log, i) in linkageLogs" :key="i" class="alarm-popup__log-item">
                      <span>{{ log.status === 'done' ? '✅' : '⏳' }}</span>
                      <span>{{ log.icon }}</span>
                      <span :style="{ color: log.status === 'running' ? '#FFB800' : '#8B8FA3' }">{{ log.text }}</span>
                    </div>
                  </div>
                </div>
              </el-scrollbar>
            </div>
          </div>

          <!-- ═══ 底栏: 操作按钮 ═══ -->
          <div class="alarm-popup__footer">
            <div class="alarm-popup__footer-left">
              <el-button type="primary" size="small" @click="handleAlarm('confirmed')">
                ✅ 确认告警
              </el-button>
              <el-button size="small" @click="handleAlarm('false_alarm')">
                ❌ 误报
              </el-button>
              <el-button size="small" @click="closePopup">
                🔇 静音
              </el-button>
              <!-- [P2-CO3] 跳转录像回放 -->
              <el-button size="small" type="warning" @click="jumpToPlayback" :disabled="!currentAlarm?.channelId" title="跳转到该告警时刻的录像回放">
                📼 跳转回放
              </el-button>
              <!-- 联动驱动按钮 -->
              <el-button
                v-for="btn in dynamicButtons"
                :key="btn.key"
                size="small"
                @click="onDynamicAction(btn.action)"
              >
                {{ btn.icon }} {{ btn.label }}
              </el-button>
            </div>
            <div class="alarm-popup__footer-right">
              <el-input
                v-model="handleNote"
                size="small"
                placeholder="处理备注..."
                class="alarm-popup__note-input"
              />
            </div>
          </div>

        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * AlarmPopup.vue — 海康威视风格报警弹窗
 *
 * 三区布局: 左侧 Tab 切换 + 右侧信息面板 + 底部操作栏
 * 联动规则集成: 根据 LinkageRule.actions[] 动态调整 Tab 和按钮
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import MiniPlayer from '@/components/video/MiniPlayer.vue'
import AlarmSnapshot from '@/components/alarm/AlarmSnapshot.vue'
import {
  popupVisible, currentAlarm, matchedRule, linkageLogs,
  hasAction, hasAnyMediaAction, dynamicButtons, defaultTab,
  queueInfo, nextAlarm, prevAlarm, handleAlarm as handleAlarmAction,
  closePopup,
} from '@/composables/useAlarmPopup'
import { ACTION_TYPE_REVERSE_MAP } from '@/api/linkage'
import { alarmApi } from '@/api/alarm'
import { queryRecordings, toLocalISOString, type DeviceRecording } from '@/api/recording'
import { recordingHttp } from '@/api/http'
import { useObjectLabel, type ObjectLabelMeta } from '@/composables/useObjectLabel'
import { useChannelStore } from '@/stores/channel'
// [P2-CO3] 告警 → 录像回放自动跳转
import { useRouter } from 'vue-router'

// 🆕 v6.3: 多类别检测标签翻译 (集中走 i18n + 后端 metadata 兜底)
const { getCategoryName, getTargetName, getAlarmTypeName } = useObjectLabel()

// [P1-CO2] 弹窗码流协调: 检测告警通道是否已在 LiveView 播放
const channelStore = useChannelStore()
const isChannelInLiveView = computed(() => {
  const chId = currentAlarm.value?.channelId
  if (!chId) return false
  return channelStore.activeChannelIds.includes(String(chId))
})
// 如果通道已在 LiveView 播放，弹窗复用现有流，跳过 /start 调用
const popupSkipStartApi = computed(() => isChannelInLiveView.value)

// [P2-CO3] 告警 → 录像回放跳转
const router = useRouter()
function jumpToPlayback() {
  const alarm = currentAlarm.value
  if (!alarm) return
  const t = alarm.createdAt ? new Date(alarm.createdAt).getTime() : Date.now()
  router.push({
    name: 'Recording',
    query: {
      channelId: alarm.channelId || '',
      deviceId: alarm.deviceId || '',
      time: String(t),
      alarmId: alarm.id || '',
    },
  })
  ElMessage.success('正在跳转到录像回放…')
  closePopup()
}

// ── 自动激活 Tab ──
const activeTab = ref('fallback')

// ── 设备录像列表 ──
const deviceRecordings = ref<DeviceRecording[]>([])
const recordingsLoading = ref(false)
const selectedRecording = ref<DeviceRecording | null>(null)

watch(defaultTab, (tab) => {
  if (tab) activeTab.value = tab
}, { immediate: true })

// ── 录像进行中状态（告警后 2 分钟内，无 clip URL 时视为正在录像） ──
const isRecordingInProgress = computed(() => {
  if (!currentAlarm.value) return false
  if (currentAlarm.value.videoClipUrl) return false
  if (!hasAction('WEB_RECORD_EVENT') && !hasAction('WEB_SHOW_PLAYBACK')) return false
  const age = Date.now() - new Date(currentAlarm.value.createdAt).getTime()
  return age < 120_000  // 2 minutes
})

// ── 录像完成轮询（每 8 秒查询一次 evidence API） ──
let recordingPollTimer: ReturnType<typeof setInterval> | null = null

function startRecordingPoll() {
  stopRecordingPoll()
  recordingPollTimer = setInterval(async () => {
    if (!isRecordingInProgress.value || !currentAlarm.value?.id) {
      stopRecordingPoll()
      return
    }
    try {
      const ev = await alarmApi.getEvidence(currentAlarm.value.id)
      if (ev?.videoClipUrl) {
        currentAlarm.value.videoClipUrl = ev.videoClipUrl
        activeTab.value = 'playback'
        stopRecordingPoll()
      }
    } catch { /* continue polling */ }
  }, 8000)
}

function stopRecordingPoll() {
  if (recordingPollTimer) {
    clearInterval(recordingPollTimer)
    recordingPollTimer = null
  }
}

// ── 自动关闭倒计时 ──
const AUTO_CLOSE_SECONDS = 30
const countdown = ref(AUTO_CLOSE_SECONDS)
let countdownTimer: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  countdown.value = AUTO_CLOSE_SECONDS
  stopCountdown()
  countdownTimer = setInterval(() => {
    // 录像进行中时，倒计时到 5 秒自动续期（等 record_complete 到达）
    if (countdown.value <= 5 && isRecordingInProgress.value) {
      countdown.value = 15
      return
    }
    countdown.value--
    if (countdown.value <= 0) {
      closePopup()
    }
  }, 1000)
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

watch(popupVisible, (v) => {
  if (v) {
    startCountdown()
    loadPlayback()
    // 无 clip URL 时启动轮询（等待 record_complete）
    if (!currentAlarm.value?.videoClipUrl) {
      startRecordingPoll()
    }
  } else {
    stopCountdown()
    stopRecordingPoll()
  }
})

// ── 计算属性 ──
// 🆕 v6.3: 改用 useObjectLabel 集中翻译，删除 ALARM_TYPE_CN 硬编码表
const alarmTypeLabel = computed(() => {
  const type = currentAlarm.value?.type || ''
  if (!type) return '告警'
  return getAlarmTypeName(type) || type
})

// 🆕 v6.3: 目标翻译元数据（类别 + 目标名）
const targetMeta = computed<ObjectLabelMeta>(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  return {
    objectCategory: m.objectCategory as string | undefined,
    targetLabel:    m.targetLabel as string | undefined,
    targetLabelZh:  m.targetLabelZh as string | undefined,
    targetLabelEn:  m.targetLabelEn as string | undefined,
  }
})

const targetCategoryLabel = computed(() => getCategoryName(targetMeta.value))
const targetNameLabel = computed(() => getTargetName(targetMeta.value) || '-')

// [FIX 2026-06-28] 人脸告警的快照以 snapshot_base64 存在 metadata 中 (非 snapshot_url)。
//   AlarmPopup 之前只读 currentAlarm.snapshotUrl (URL 路径), 导致人脸告警快照不显示。
//   修复: 当 snapshotUrl 为空时, 回退到 metadata.snapshot_base64 构造 data URL。
const snapshotImageUrl = computed(() => {
  const alarm = currentAlarm.value
  if (!alarm) return ''
  // 1. 优先用 snapshotUrl (文件路径/绝对URL)
  if (alarm.snapshotUrl) return alarm.snapshotUrl
  // 2. 回退到 metadata.snapshot_base64 → data:image/bmp;base64,...
  const meta = (alarm.metadata || {}) as Record<string, unknown>
  const b64 = meta.snapshot_base64 as string | undefined
  if (!b64) return ''
  if (b64.startsWith('data:')) return b64
  const fmt = (meta.snapshot_format as string) || 'bmp'
  const mime = fmt === 'raw_bgr' ? 'image/bmp' : `image/${fmt}`
  const padded = b64.replace(/[^A-Za-z0-9+/=]/g, '')
  const fixed = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  return `data:${mime};base64,${fixed}`
})

const levelColor = computed(() => {
  switch (currentAlarm.value?.level) {
    case 'critical': return '#FF3D71'
    case 'high': return '#FF6B35'
    case 'medium': return '#FFB800'
    default: return '#00D4AA'
  }
})

const levelBg = computed(() => {
  switch (currentAlarm.value?.level) {
    case 'critical': return 'rgba(255,61,113,0.08)'
    case 'high': return 'rgba(255,107,53,0.06)'
    case 'medium': return 'rgba(255,184,0,0.06)'
    default: return 'rgba(0,212,170,0.06)'
  }
})

const levelLabel = computed(() => {
  switch (currentAlarm.value?.level) {
    case 'critical': return '🔴 严重'
    case 'high': return '🟠 高'
    case 'medium': return '🟡 中'
    default: return '🟢 低'
  }
})

const levelTagType = computed(() => {
  switch (currentAlarm.value?.level) {
    case 'critical': return 'danger'
    case 'high': return 'warning'
    case 'medium': return 'warning'
    default: return 'success'
  }
})

const suggestedAction = computed(() =>
  (currentAlarm.value?.metadata?.suggestedAction as string) || ''
)

const handleNote = ref('')

// ── 操作 ──
function handleAlarm(status: 'confirmed' | 'false_alarm' | 'forwarded' | 'ignored') {
  handleAlarmAction(status, handleNote.value || undefined)
  handleNote.value = ''
}

function onDynamicAction(action: string) {
  ElMessage.info(`联动操作: ${action}（待实现）`)
}

function onPlayerSnapshot(_blob: Blob) {
  ElMessage.success('截图已保存')
}

function startPlayback() {
  // fix #C4: 切到 playback tab, 让 MiniPlayer 真正渲染 (之前是 stub)
  activeTab.value = 'playback'
  if (currentAlarm.value && !currentAlarm.value.videoClipUrl) {
    loadPlayback()
  }
}

async function loadPlayback() {
  if (!currentAlarm.value?.id) return
  recordingsLoading.value = true
  deviceRecordings.value = []
  try {
    const ev = await alarmApi.getEvidence(currentAlarm.value.id)
    if (ev) {
      if (ev.videoClipUrl) currentAlarm.value.videoClipUrl = ev.videoClipUrl
      if (ev.snapshotUrl && !currentAlarm.value.snapshotUrl) {
        currentAlarm.value.snapshotUrl = ev.snapshotUrl
      }
    }
    // 同时查询设备录像列表
    if (currentAlarm.value.deviceId) {
      const alarmTime = new Date(currentAlarm.value.createdAt)
      const start = new Date(alarmTime.getTime() - 3600_000)
      const end = new Date(alarmTime.getTime() + 3600_000)
      deviceRecordings.value = await queryRecordings({
        device_id: currentAlarm.value.deviceId,
        channel_id: currentAlarm.value.channelId || undefined,
        start_time: toLocalISOString(start),
        end_time: toLocalISOString(end),
      })
    }
  } catch (e) {
    console.warn('[AlarmPopup] loadPlayback failed:', e)
  } finally {
    recordingsLoading.value = false
  }
}

async function playSelectedRecording(rec: DeviceRecording) {
  selectedRecording.value = rec
  try {
    const { data } = await recordingHttp.post(`/${rec.id}/play`, {
      device_id: rec.device_id,
      channel_id: rec.channel_id,
      start_time: rec.start_time,
      end_time: rec.end_time,
    })
    const result = data?.data || data
    if (result?.urls) {
      const url = result.urls.flv || result.urls.hls || result.urls.wsFlv || ''
      if (url) {
        currentAlarm.value!.videoClipUrl = url
      } else {
        ElMessage.warning('无可用播放地址')
      }
    } else {
      ElMessage.warning('设备不支持回放')
    }
  } catch (e: any) {
    ElMessage.error('回放失败: ' + (e.message || ''))
  }
}

// ── 动作图标 ──
function getActionName(typeNum: number): string {
  return ACTION_TYPE_REVERSE_MAP[typeNum] || `动作${typeNum}`
}

const ACTION_ICONS: Record<string, string> = {
  WEB_SHOW_LIVE: '📹', WEB_SHOW_PLAYBACK: '📼', WEB_SHOW_IMAGE: '📸',
  WEB_POPUP: '🔔', WEB_PLAY_TONE: '🔊', WEB_TTS_BROADCAST: '📢',
  WEB_CAPTURE_IMAGE: '📸', WEB_RECORD_EVENT: '📼',
  CLIENT_VOICE_TALK: '🎙️', CLIENT_PTZ_CONTROL: '🎯',
  CLIENT_ALARM_OUTPUT: '🔔', CLIENT_TTS_BROADCAST: '📢',
}

function getActionIcon(typeNum: number): string {
  const name = ACTION_TYPE_REVERSE_MAP[typeNum] || ''
  return ACTION_ICONS[name] || '🔗'
}

// ── 时间格式化 ──
function formatTime(isoStr: string): string {
  if (!isoStr) return '-'
  try {
    const d = new Date(isoStr)
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return isoStr
  }
}

// ── 键盘快捷键 ──
function onKeydown(e: KeyboardEvent) {
  if (!popupVisible.value) return
  if (e.key === 'Escape') closePopup()
  if (e.key === 'ArrowLeft') prevAlarm()
  if (e.key === 'ArrowRight') nextAlarm()
}

// 监听录像完成事件，更新当前告警的 videoClipUrl
function onAlarmClipUpdated(e: Event) {
  const detail = (e as CustomEvent).detail
  // [v6.2 2026-06-21] TS strictNullChecks: currentAlarm 可能为 null, 加非空守卫
  const cur = currentAlarm.value
  if (cur && cur.id === detail.alarmId && detail.videoClipUrl) {
    cur.videoClipUrl = detail.videoClipUrl
    activeTab.value = 'playback'
    stopRecordingPoll()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('alarm-clip-updated', onAlarmClipUpdated)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('alarm-clip-updated', onAlarmClipUpdated)
  stopCountdown()
  stopRecordingPoll()
})
</script>

<style scoped>
/* [P1-CO2] 码流复用提示 */
.alarm-popup__stream-reused {
  position: absolute;
  bottom: 36px;
  left: 8px;
  padding: 2px 8px;
  background: rgba(0,212,170,0.2);
  color: #00D4AA;
  font-size: 10px;
  border-radius: 4px;
  z-index: 10;
  pointer-events: none;
}

/* ── Recording list ── */
.alarm-popup__recording-list {
  width: 100%;
  height: 100%;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  background: #000;
}
.alarm-popup__recording-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 280px;
  background: #000;
}
.alarm-popup__recording-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  color: #FF3D71;
  font-weight: bold;
}
.alarm-popup__rec-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #FF3D71;
  animation: rec-pulse 1s ease-in-out infinite;
}
@keyframes rec-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(0.8); }
}
.alarm-popup__rec-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.alarm-popup__rec-item:hover {
  background: rgba(0, 212, 170, 0.1);
}
.alarm-popup__rec-item--active {
  background: rgba(0, 212, 170, 0.15);
  border-left: 2px solid #00D4AA;
}
.alarm-popup__rec-time {
  font-size: 12px;
  color: #E8E8E8;
  font-family: monospace;
}
.alarm-popup__rec-size {
  font-size: 11px;
  color: #8B8FA3;
}

/* ── Overlay ── */
.alarm-popup-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 60px 24px 24px 24px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
}

/* ── 弹窗容器 ── */
.alarm-popup {
  width: 860px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #141720;
  border-radius: 12px;
  border: 2px solid #FF3D71;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  overflow: hidden;
}

/* ── 顶栏 ── */
.alarm-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid #252830;
}
.alarm-popup__header-left,
.alarm-popup__header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.alarm-popup__blink-dot {
  width: 8px; height: 8px; border-radius: 4px;
  animation: alarm-blink 1.2s ease-in-out infinite;
}
@keyframes alarm-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
.alarm-popup__type {
  font-size: 14px; font-weight: bold; color: #FF3D71;
}
.alarm-popup__level-tag { margin-left: 4px; }
.alarm-popup__device-info { font-size: 11px; color: #4A4D58; }
.alarm-popup__queue { font-size: 11px; color: #8B8FA3; }
.alarm-popup__countdown { font-size: 11px; color: #FF6B35; font-weight: bold; }
.alarm-popup__close-btn { color: #4A4D58 !important; font-size: 16px; }

/* ── 主体 ── */
.alarm-popup__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── 左侧 Tab ── */
.alarm-popup__left {
  flex: 3;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #252830;
}
.alarm-popup__tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.alarm-popup__tabs :deep(.el-tabs__content) {
  flex: 1;
  padding: 0;
}
.alarm-popup__tabs :deep(.el-tab-pane) {
  height: 100%;
}
.alarm-popup__tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 12px;
  background: #1a1d26;
}
.alarm-popup__tabs :deep(.el-tabs__item) {
  color: #8B8FA3;
  font-size: 12px;
}
.alarm-popup__tabs :deep(.el-tabs__item.is-active) {
  color: #00D4AA;
}
.alarm-popup__tab-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 280px;
  background: #000;
}
.alarm-popup__placeholder {
  text-align: center;
  color: #4A4D58;
}
.alarm-popup__placeholder p { margin: 0 0 8px; }
.alarm-popup__hint { font-size: 12px; color: #4A4D58; }

/* ── 联动标签栏 ── */
.alarm-popup__linkage-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: #1a1d26;
  border-top: 1px solid #252830;
  overflow-x: auto;
}
.alarm-popup__linkage-label {
  font-size: 10px;
  color: #8B8FA3;
  flex-shrink: 0;
}
.alarm-popup__linkage-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  font-size: 10px;
  color: #00D4AA;
  background: #0a2a1a;
  border-radius: 4px;
  white-space: nowrap;
}

/* ── 右侧信息面板 ── */
.alarm-popup__right {
  flex: 2;
  min-width: 260px;
  max-width: 320px;
  overflow: hidden;
}
.alarm-popup__info {
  padding: 12px;
}
.alarm-popup__section {
  margin-bottom: 12px;
}
.alarm-popup__section-title {
  font-size: 12px;
  font-weight: bold;
  color: #FFB800;
  margin-bottom: 8px;
}
.alarm-popup__info-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  font-size: 11px;
}
.alarm-popup__info-key { color: #4A4D58; }
.alarm-popup__info-val { color: #E8E8E8; }

.alarm-popup__ai-box {
  padding: 8px;
  background: #0a0a2a;
  border-radius: 6px;
  color: #B8B8FF;
  font-size: 11px;
  line-height: 1.5;
}
.alarm-popup__suggestion {
  color: #FFB800;
  font-size: 11px;
}
.alarm-popup__log-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 0;
}

/* ── 底栏 ── */
.alarm-popup__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: #1a1d26;
  border-top: 1px solid #252830;
}
.alarm-popup__footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.alarm-popup__footer-right {
  flex-shrink: 0;
}
.alarm-popup__note-input {
  width: 200px;
}

/* ── 过渡动画 ── */
.alarm-popup-enter-active {
  transition: all 0.3s ease-out;
}
.alarm-popup-leave-active {
  transition: all 0.2s ease-in;
}
.alarm-popup-enter-from {
  opacity: 0;
  transform: translateX(60px);
}
.alarm-popup-leave-to {
  opacity: 0;
  transform: translateX(60px);
}

/* ── 弹窗边框闪烁动画（即使没有声音也能引起注意） ── */
@keyframes alarm-flash-border {
  0%, 100% { border-color: #FF3D71; box-shadow: 0 8px 32px rgba(255,61,113,0.3); }
  50% { border-color: #FFB800; box-shadow: 0 8px 40px rgba(255,184,0,0.5); }
}
.alarm-flash {
  animation: alarm-flash-border 0.5s ease 3;
}
</style>
