<template>
  <Teleport to="body">
    <transition name="alarm-popup">
      <div v-if="popupVisible && currentAlarm" class="alarm-popup-overlay" @click.self="closePopup">
        <div class="alarm-popup" :style="{ borderColor: levelColor }">

          <!-- ═══ 顶栏: 告警摘要 ═══ -->
          <div class="alarm-popup__header" :style="{ background: levelBg }">
            <div class="alarm-popup__header-left">
              <span class="alarm-popup__blink-dot" :style="{ background: levelColor }" />
              <span class="alarm-popup__type">{{ alarmTypeLabel }}</span>
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
                    :channel-id="currentAlarm?.channelId || ''"
                    :show-controls="true"
                    stream-type="sub"
                    :visible="activeTab === 'live' && !!currentAlarm?.channelId"
                    :skip-start-api="false"
                    @snapshot="onPlayerSnapshot"
                  />
                  <div v-if="activeTab === 'live' && !currentAlarm?.channelId" class="alarm-popup__tab-content">
                    <div class="alarm-popup__placeholder">
                      <p>⚠️ 无通道信息</p>
                      <p class="alarm-popup__hint">该告警未关联视频通道</p>
                    </div>
                  </div>
                </el-tab-pane>

                <!-- 录像回放 (fix #C4: 之前是 stub, 现在用 MiniPlayer 真实播放) -->
                <el-tab-pane v-if="hasAction('WEB_SHOW_PLAYBACK')" label="📼 录像回放" name="playback">
                  <div class="alarm-popup__tab-content">
                    <MiniPlayer
                      v-if="currentAlarm.videoClipUrl"
                      :src="currentAlarm.videoClipUrl"
                      :channel-id="currentAlarm.channelId"
                      autoplay
                    />
                    <div v-else class="alarm-popup__placeholder">
                      <p>📼 录像回放</p>
                      <p class="alarm-popup__hint">该告警暂无录像片段</p>
                      <el-button type="primary" size="small" @click="loadPlayback">加载录像</el-button>
                    </div>
                  </div>
                </el-tab-pane>

                <!-- 告警快照（始终显示） -->
                <el-tab-pane label="🖼️ 告警快照" name="snapshot">
                  <AlarmSnapshot
                    :image-url="currentAlarm.snapshotUrl || ''"
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
                      <span class="alarm-popup__info-val">{{ (currentAlarm.metadata?.targetLabel as string) || '-' }}</span>
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

// ── 告警类型中文 ──
const ALARM_TYPE_CN: Record<string, string> = {
  person_detected: '人员检测', intrusion: '入侵检测', fire: '烟火检测',
  smoke: '烟雾检测', fall: '倒地检测', violence: '打架检测',
  loitering: '徘徊检测', gathering: '聚集检测', vehicle_detected: '车辆检测',
  object_detected: '物体检测', face_blacklist: '黑名单告警', gb28181_alarm: '设备告警',
  ppe: '安全帽检测', crowd: '人群密度', plate: '车牌识别',
}

// ── 自动激活 Tab ──
const activeTab = ref('fallback')

watch(defaultTab, (tab) => {
  if (tab) activeTab.value = tab
}, { immediate: true })

// ── 自动关闭倒计时 ──
const AUTO_CLOSE_SECONDS = 30
const countdown = ref(AUTO_CLOSE_SECONDS)
let countdownTimer: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  countdown.value = AUTO_CLOSE_SECONDS
  stopCountdown()
  countdownTimer = setInterval(() => {
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
  if (v) startCountdown()
  else stopCountdown()
})

// ── 计算属性 ──
const alarmTypeLabel = computed(() =>
  ALARM_TYPE_CN[currentAlarm.value?.type || ''] || currentAlarm.value?.type || '告警'
)

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
  // §13 Fix E: getEvidence 现在直接返回扁平字段 (snapshotUrl/videoClipUrl)
  if (!currentAlarm.value?.id) return
  try {
    const ev = await alarmApi.getEvidence(currentAlarm.value.id)
    if (ev) {
      if (ev.videoClipUrl) currentAlarm.value.videoClipUrl = ev.videoClipUrl
      if (ev.snapshotUrl && !currentAlarm.value.snapshotUrl) {
        currentAlarm.value.snapshotUrl = ev.snapshotUrl
      }
    } else {
      ElMessage.warning('该告警无可用证据')
    }
  } catch (e) {
    console.warn('[AlarmPopup] loadPlayback failed:', e)
    ElMessage.warning('加载录像失败')
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

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopCountdown()
})
</script>

<style scoped>
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
</style>
