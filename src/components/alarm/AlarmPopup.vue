<template>
  <Teleport to="body">
    <transition name="alarm-popup">
      <div v-if="popupVisible && currentAlarm" class="alarm-popup-overlay" @click.self="closePopup">
        <div
          class="alarm-popup"
          :class="{ 'alarm-flash': popupVisible }"
          :style="{
            borderColor: levelColor,
            '--alarm-level-color': levelColor,
            '--alarm-level-rgb': levelRgb,
          }"
        >

          <!-- ═══ 顶栏: 告警摘要 ═══ -->
          <div class="alarm-popup__header">
            <div class="alarm-popup__header-left">
              <span class="alarm-popup__type">{{ alarmTypeLabel }}</span>
              <el-tag v-if="targetCategoryLabel" size="small" type="info" effect="plain" class="alarm-popup__category-tag">
                {{ targetCategoryLabel }}: {{ targetNameLabel }}
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
                <el-tab-pane label="实时视频" name="live">
                  <MiniPlayer
                    v-show="activeTab === 'live' && currentAlarm?.channelId && !playerError"
                    :key="`${currentAlarm?.channelId || 'none'}#${liveRebuildEpoch}`"
                    :channel-id="currentAlarm?.channelId || ''"
                    :show-controls="true"
                    stream-type="main"
                    :visible="activeTab === 'live'"
                    :skip-start-api="popupSkipStartApi"
                    @snapshot="onPlayerSnapshot"
                    @error="onPlayerError"
                    @playing="onPlayerPlaying"
                  />
                  <!-- [P1-CO2] 码流复用提示 -->
                  <div v-if="isChannelStreaming" class="alarm-popup__stream-reused">
                    🔗 复用现有视频流
                  </div>
                  <!-- [FIX 2026-08-17] 视频流加载失败时提示，避免黑屏无反馈 -->
                  <div v-if="activeTab === 'live' && playerError" class="alarm-popup__tab-content">
                    <div class="alarm-popup__placeholder">
                      <p>⚠️ 实时视频不可用</p>
                      <p class="alarm-popup__hint">{{ playerError }}</p>
                      <p class="alarm-popup__hint alarm-popup__hint--small">
                        可查看“告警快照” 或 “录像回放”
                      </p>
                    </div>
                  </div>
                  <div v-else-if="activeTab === 'live' && !currentAlarm?.channelId" class="alarm-popup__tab-content">
                    <div class="alarm-popup__placeholder">
                      <p>⚠️ 无通道信息</p>
                      <p class="alarm-popup__hint">该告警未关联视频通道</p>
                    </div>
                  </div>
                </el-tab-pane>

                <!-- 录像回放 (WEB_SHOW_PLAYBACK 或 WEB_RECORD_EVENT 时显示) -->
                <el-tab-pane v-if="hasAction('WEB_SHOW_PLAYBACK') || hasAction('WEB_RECORD_EVENT')" label="录像回放" name="playback">
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
                        <p><i class="iconfont1 icon1-luxianghuifang_ alarm-popup__inline-icon" aria-hidden="true"></i>录像回放</p>
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
                <el-tab-pane label="告警快照" name="snapshot">
                  <!-- [P0-4-c] live 失败 30s 自动切到本 tab 时显示的提示条 -->
                  <div v-if="liveFallbackHint" class="alarm-popup__live-fallback-hint">⚠️ {{ liveFallbackHint }}</div>
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
                    <div class="alarm-popup__section-title">告警信息</div>
                    <div class="alarm-popup__info-list">
                      <div class="alarm-popup__info-row">
                        <span class="alarm-popup__info-key">类型：</span>
                        <span class="alarm-popup__info-val">{{ alarmTypeLabel }}</span>
                      </div>
                      <div class="alarm-popup__info-row">
                        <span class="alarm-popup__info-key">级别：</span>
                        <div class="alarm-popup__info-val alarm-popup__level-value">
                          <div class="alarm-popup__level-dot" :style="{ backgroundColor: levelColor }" aria-hidden="true"></div>
                          <span>{{ levelLabel }}</span>
                        </div>
                      </div>
                      <div class="alarm-popup__info-row">
                        <span class="alarm-popup__info-key">时间：</span>
                        <span class="alarm-popup__info-val">{{ formatTime(currentAlarm.createdAt) }}</span>
                      </div>
                      <div class="alarm-popup__info-row">
                        <span class="alarm-popup__info-key">设备：</span>
                        <span class="alarm-popup__info-val">{{ currentAlarm.deviceName || currentAlarm.deviceId || '-' }}</span>
                      </div>
                      <div class="alarm-popup__info-row">
                        <span class="alarm-popup__info-key">通道：</span>
                        <span class="alarm-popup__info-val">{{ currentAlarm.channelName || currentAlarm.channelId || '-' }}</span>
                      </div>
                      <div class="alarm-popup__info-row">
                        <span class="alarm-popup__info-key">位置：</span>
                        <span class="alarm-popup__info-val">{{ currentAlarm.location || '-' }}</span>
                      </div>
                      <div class="alarm-popup__info-row">
                        <span class="alarm-popup__info-key">置信度：</span>
                        <span class="alarm-popup__info-val" style="color:#00D4AA">{{ Math.round(currentAlarm.confidence * 100) }}%</span>
                      </div>
                      <div class="alarm-popup__info-row">
                        <span class="alarm-popup__info-key">目标：</span>
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
                  </div>

                  <!-- 处理备注 -->
                  <div class="alarm-popup__section alarm-popup__note-section">
                    <div class="alarm-popup__section-title">处理备注</div>
                    <el-input
                      v-model="handleNote"
                      type="textarea"
                      :rows="5"
                      resize="none"
                      aria-label="处理备注"
                      placeholder="请输入处理备注"
                      class="alarm-popup__note-input"
                    />
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
                    <div class="alarm-popup__section-title" style="color:#00D4AA">联动执行状态</div>
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
                <i class="iconfont1 icon1-duigou alarm-popup__button-icon" aria-hidden="true"></i>
                确认告警
              </el-button>
              <el-button size="small" @click="handleAlarm('false_alarm')">
                <i class="iconfont1 icon1-cuowu alarm-popup__button-icon" aria-hidden="true"></i>
                误报
              </el-button>
              <el-button size="small" @click="closePopup">
                <i class="iconfont1 icon1-a-5Flabajingyin-copy alarm-popup__button-icon" aria-hidden="true"></i>
                静音
              </el-button>
              <!-- [P2-CO3] 跳转录像回放 -->
              <el-button size="small" type="warning" @click="jumpToPlayback" :disabled="!currentAlarm?.channelId" title="跳转到该告警时刻的录像回放">
                <i class="iconfont1 icon1-luxianghuifang_ alarm-popup__button-icon" aria-hidden="true"></i>
                跳转回放
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
import { checkStreamAlive, stopStream } from '@/api/stream'
import { useObjectLabel, type ObjectLabelMeta } from '@/composables/useObjectLabel'
import { useChannelStore } from '@/stores/channel'
// [P2-CO3] 告警 → 录像回放自动跳转
import { useRouter } from 'vue-router'

// 🆕 v6.3: 多类别检测标签翻译 (集中走 i18n + 后端 metadata 兜底)
const { getCategoryName, getTargetName, getAlarmTypeName } = useObjectLabel()

// [P1-CO2] 弹窗码流协调: 检测告警通道是否已在其他组件播放（LiveView / SituationScreen 轮巡）
const channelStore = useChannelStore()
const isChannelStreaming = computed(() => {
  const chId = currentAlarm.value?.channelId
  if (!chId) return false
  return channelStore.activeChannelIds.includes(String(chId))
})
// 如果通道已在其他组件播放，弹窗复用现有流，跳过 /start 调用
const popupSkipStartApi = computed(() => isChannelStreaming.value)

// [FIX 2026-08-17] MiniPlayer 流加载失败时提示，避免黑屏无反馈
//   跟 MiniPlayer 的 @error/@playing 事件联动:
//   - error: 加载/播放失败（连续 streamAlive=false + /start 失败 + 协议错误等）
//   - playing: 重新成功播放时清除错误信息
const playerError = ref('')
function onPlayerError(msg: string) {
  playerError.value = msg || '视频流加载失败'
  // [P0-4-c] 失败持续 30s → 自动降级到告警快照 tab
  startLiveFailTimer()
}
function onPlayerPlaying() {
  playerError.value = ''
  // [P0-4-c] 播放恢复 → 清除降级提示
  stopLiveFailTimer()
  liveFallbackHint.value = ''
}

// ── [P0-4-c 2026-08-20] live tab 持续失败 ≥30s 自动切 snapshot + 探活心跳 ──
//   ① onPlayerError 置位后 30s 仍无 playing → 切到"告警快照"并提示"正在录像"
//      (30s = MiniPlayer 3 次指数退避 ≈14s + 观察余量; 对标海康: 视频失败回落抓拍图)
//   ② streamAliveHeartbeat: 弹窗打开期间每 10s GET /streams/:id/alive,
//      连续 3 次 alive=false → POST /streams/:id/stop 释放 GB28181 会话 (防幽灵会话)
//   ③ 恢复: 探活转 alive=true → 自动切回 live; 会话已 stop 则每 ~30s 重建拉流尝试
const LIVE_FAIL_SWITCH_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 10_000
const HEARTBEAT_MAX_FAILS = 3
const REBUILD_TICKS = 3  // 已 stop 后每 3 个心跳 tick (≈30s) 做一次重建尝试

let liveFailTimer: ReturnType<typeof setTimeout> | null = null
let switchedAwayFromLive = false       // 因失败自动切走 → 恢复后需切回
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let heartbeatFails = 0
let heartbeatStopped = false           // 已调用过 /stop (单次弹窗会话只 stop 一次)
let rebuildTicks = 0
const liveRebuildEpoch = ref(0)        // ++ → MiniPlayer :key 变化强制重建重拉
const liveFallbackHint = ref('')

function startLiveFailTimer() {
  if (liveFailTimer) return  // 已在计时
  liveFailTimer = setTimeout(() => {
    liveFailTimer = null
    if (activeTab.value !== 'live' || !playerError.value) return
    switchedAwayFromLive = true
    activeTab.value = 'snapshot'
    liveFallbackHint.value = '实时视频不可用，正在录像…'
    console.warn('[AlarmPopup] live failed ≥30s, fallback to snapshot tab')
  }, LIVE_FAIL_SWITCH_MS)
}

function stopLiveFailTimer() {
  if (liveFailTimer) { clearTimeout(liveFailTimer); liveFailTimer = null }
}

async function probeStreamAlive() {
  const chId = currentAlarm.value?.channelId
  if (!chId || !popupVisible.value) return
  try {
    const res: any = await checkStreamAlive(String(chId))
    const d = res?.data?.data ?? res?.data
    if (d?.alive) {
      heartbeatFails = 0
      rebuildTicks = 0
      // 流恢复: 若之前因失败切到 snapshot → 自动切回 live (visible 变化触发重拉)
      if (switchedAwayFromLive && activeTab.value !== 'live') {
        switchedAwayFromLive = false
        heartbeatStopped = false
        playerError.value = ''
        liveFallbackHint.value = ''
        stopLiveFailTimer()
        activeTab.value = 'live'
        console.log('[AlarmPopup] stream alive again, switch back to live tab')
      }
    } else {
      heartbeatFails++
      // 连续 3 次无流 → 主动释放会话 (GB28181 BYE, 防幽灵会话占用设备连接数)
      if (heartbeatFails >= HEARTBEAT_MAX_FAILS && !heartbeatStopped) {
        heartbeatStopped = true
        try {
          await stopStream(String(chId))
          console.warn('[AlarmPopup] stream dead ×3, session stopped:', chId)
        } catch { /* stop 失败不阻塞 */ }
        // MiniPlayer 可能仍在退避重试, 提前置位让 UI 立即反馈
        if (!playerError.value) onPlayerError('流已中断（探活连续失败）')
      }
      // 会话已释放且用户在快照页 → 每 ~30s 重建一次拉流 (RTSP 恢复后自动切回)
      if (heartbeatStopped && switchedAwayFromLive) {
        rebuildTicks++
        if (rebuildTicks >= REBUILD_TICKS) {
          rebuildTicks = 0
          switchedAwayFromLive = false
          playerError.value = ''
          liveRebuildEpoch.value++   // :key 变化 → MiniPlayer 重建 → 重新拉流
          activeTab.value = 'live'
          console.log('[AlarmPopup] rebuild attempt epoch', liveRebuildEpoch.value)
        }
      }
    }
  } catch { /* 单次探活网络失败忽略 */ }
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeatFails = 0
  heartbeatStopped = false
  rebuildTicks = 0
  heartbeatTimer = setInterval(probeStreamAlive, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

// 切换告警或关闭弹窗时重置错误状态
watch(() => currentAlarm.value?.id, () => {
  playerError.value = ''
  stopLiveFailTimer()
  switchedAwayFromLive = false
  liveFallbackHint.value = ''
  if (popupVisible.value) startHeartbeat()  // 新通道重新探活
})
watch(popupVisible, (v) => {
  if (!v) {
    playerError.value = ''
    stopLiveFailTimer()
    stopHeartbeat()
    switchedAwayFromLive = false
    liveFallbackHint.value = ''
  }
})

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

// [STABILITY-FIX 2026-07-29] 30s → 60s: GB28181 流建立需 5-10s, 30s 太短
const AUTO_CLOSE_SECONDS = 60
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
    // [P0-4-c] 弹窗打开 → 启动流探活心跳 (每 10s, 连续 3 次失败停流)
    startHeartbeat()
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

const levelRgb = computed(() => {
  switch (currentAlarm.value?.level) {
    case 'critical': return '255, 61, 113'
    case 'high': return '255, 107, 53'
    case 'medium': return '255, 184, 0'
    default: return '0, 212, 170'
  }
})

const levelLabel = computed(() => {
  switch (currentAlarm.value?.level) {
    case 'critical': return '严重'
    case 'high': return '高'
    case 'medium': return '中'
    default: return '低'
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
  // [P0-4-c] 清理探活心跳与降级定时器
  stopHeartbeat()
  stopLiveFailTimer()
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

/* [P0-4-c] live 失败降级提示条 (显示在 snapshot tab 顶部) */
.alarm-popup__tabs :deep(.el-tab-pane) {
  position: relative;
}
.alarm-popup__live-fallback-hint {
  position: absolute;
  top: 6px;
  left: 10px;
  z-index: 10;
  padding: 3px 10px;
  border-radius: 4px;
  color: #FFB800;
  background: rgba(255, 184, 0, 0.15);
  font-size: 12px;
  pointer-events: none;
}

/* ── Recording list ── */
.alarm-popup__recording-list {
  width: 100%;
  height: 100%;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  background: #262626;
}
.alarm-popup__recording-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 280px;
  background: #262626;
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
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(37, 52, 76, 0.72);
  backdrop-filter: blur(1px);
}

/* ── 弹窗容器 ── */
.alarm-popup {
  display: flex;
  width: min(1040px, calc(100vw - 32px));
  height: min(640px, calc(100vh - 32px));
  max-height: calc(100vh - 32px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #F93A55;
  border-radius: 6px 10px 6px 6px;
  background: #F93A55;
  box-shadow: 0 14px 42px rgba(0, 0, 0, 0.5);
}

/* ── 顶栏 ── */
.alarm-popup__header {
  display: flex;
  min-height: 38px;
  flex: 0 0 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: linear-gradient(90deg, var(--alarm-level-color) 0%, #050E30 100%);
}
.alarm-popup__header-left,
.alarm-popup__header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.alarm-popup__header-left {
  min-width: 0;
  overflow: hidden;
}
.alarm-popup__header-right {
  flex-shrink: 0;
}
.alarm-popup__blink-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  animation: alarm-blink 1.2s ease-in-out infinite;
}
@keyframes alarm-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
.alarm-popup__type {
  overflow: hidden;
  color: #FFFFFF;
  font-size: 16px;
  font-weight: 600;
  line-height: 38px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alarm-popup__category-tag {
  flex-shrink: 0;
  border-color: rgba(255, 255, 255, 0.38) !important;
  color: #FFFFFF !important;
  background: transparent !important;
}
.alarm-popup__level-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border: 0;
  border-radius: 50%;
}
.alarm-popup__level-value {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}
.alarm-popup__device-info {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #FFFFFF;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alarm-popup__queue {
  color: #AADDFF;
  font-size: 12px;
  white-space: nowrap;
}
.alarm-popup__queue :deep(.el-button) {
  margin-left: 2px;
  color: #AADDFF;
}
.alarm-popup__countdown {
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 600;
}
.alarm-popup__close-btn {
  color: #00FFFF !important;
  font-size: 14px;
}
.alarm-popup__close-btn.el-button.is-text:not(.is-disabled):hover {
  background-color: transparent !important;
}

/* ── 主体 ── */
.alarm-popup__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #071B4B;
}

/* ── 左侧 Tab ── */
.alarm-popup__left {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid #2A5C8F;
  background: #071B4B;
}
.alarm-popup__tabs {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: #262626;
}
.alarm-popup__tabs :deep(.el-tabs__content) {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  padding: 0;
  background: #262626;
}
.alarm-popup__tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
}
.alarm-popup__tabs :deep(.el-tabs__header) {
  flex: 0 0 40px;
  margin: 0;
  padding: 0 10px;
  background: #050E30;
}
.alarm-popup__tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: #050E30;
}
.alarm-popup__tabs :deep(.el-tabs__active-bar) {
  height: 2px;
  background: #00FFFF;
}
.alarm-popup__tabs :deep(.el-tabs__item) {
  height: 40px;
  padding: 0 18px;
  color: #AADDFF;
  font-size: 13px;
  line-height: 40px;
  letter-spacing: 0;
}
.alarm-popup__tabs :deep(.el-tabs__item:hover),
.alarm-popup__tabs :deep(.el-tabs__item.is-active) {
  color: #00FFFF;
}
.alarm-popup__tabs :deep(.mini-player) {
  height: 100%;
  max-height: 100%;
  aspect-ratio: auto !important;
  border-radius: 0;
  background: #262626;
}
.alarm-popup__tabs :deep(.mini-player video) {
  border-radius: 0 !important;
  background: #262626 !important;
}
.alarm-popup__tab-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 0;
  background: #262626;
}
.alarm-popup__placeholder {
  text-align: center;
  color: #AADDFF;
}
.alarm-popup__inline-icon {
  margin-right: 6px;
  color: currentColor;
  font-size: 16px;
  vertical-align: -1px;
}
.alarm-popup__button-icon {
  margin-right: 2px;
  color: currentColor;
  font-size: 12px;
}
.alarm-popup__placeholder p { margin: 0 0 8px; }
.alarm-popup__hint { color: #7397BC; font-size: 12px; }

/* ── 联动标签栏 ── */
.alarm-popup__linkage-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-top: 1px solid #1C4A7D;
  background: #071B4B;
  overflow-x: auto;
}
.alarm-popup__linkage-label {
  flex-shrink: 0;
  color: #AADDFF;
  font-size: 10px;
}
.alarm-popup__linkage-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  font-size: 10px;
  border: 1px solid rgba(0, 255, 255, 0.3);
  border-radius: 2px;
  color: #00FFFF;
  background: rgba(0, 255, 255, 0.08);
  white-space: nowrap;
}

/* ── 右侧信息面板 ── */
.alarm-popup__right {
  min-width: 250px;
  max-width: 300px;
  flex: 0 0 clamp(250px, 29%, 300px);
  overflow: hidden;
  color: #172333;
  background: #FFFFFF;
}
.alarm-popup__right :deep(.el-scrollbar),
.alarm-popup__right :deep(.el-scrollbar__wrap) {
  height: 100%;
}
.alarm-popup__info {
  min-height: 100%;
  padding: 0;
}
.alarm-popup__section {
  margin: 0;
  padding: 6px 10px;
  border-bottom: 0;
}
.alarm-popup__section-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}
.alarm-popup__info-list {
  display: flex;
  flex-direction: column;
  font-size: 14px;
  line-height: 1.5;
}
.alarm-popup__info-row {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 2px;
  padding: 2px 0;
}
.alarm-popup__info-key {
  flex: 0 0 auto;
  color: #42566D;
  font-weight: 600;
  white-space: nowrap;
}
.alarm-popup__info-val {
  min-width: 0;
  flex: 1;
  color: #172333;
  overflow-wrap: anywhere;
}
.alarm-popup__info-val :deep(.el-tag) {
  border-color: #91B5D8;
  color: #245C88;
  background: #DCEAFF;
}

.alarm-popup__ai-box {
  padding: 9px 10px;
  border: 1px solid #C4D7ED;
  border-radius: 2px;
  color: #283C52;
  background: #DCEAFF;
  font-size: 12px;
  line-height: 1.6;
}
.alarm-popup__suggestion {
  color: #8A5A0A;
  font-size: 12px;
  line-height: 1.6;
}
.alarm-popup__log-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
  color: #42566D;
  font-size: 12px;
}

/* ── 底栏 ── */
.alarm-popup__footer {
  display: flex;
  min-height: 52px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  background: #050E30;
}
.alarm-popup__footer-left {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: end;
  gap: 6px;
  flex-wrap: wrap;
}
.alarm-popup__footer :deep(.el-button) {
  margin-left: 0;
  border-color: #2B78B5;
  border-radius: 2px;
  color: #AADDFF;
  background: rgba(25, 87, 145, 0.28);
}
.alarm-popup__footer :deep(.el-button:hover),
.alarm-popup__footer :deep(.el-button:focus-visible) {
  border-color: #00FFFF;
  color: #00FFFF;
  background: rgba(0, 255, 255, 0.1);
}
.alarm-popup__footer :deep(.el-button--primary) {
  border-color: #3294ED;
  color: #FFFFFF;
  background: #3294ED;
}
.alarm-popup__note-input {
  width: 100%;
  --el-input-bg-color: #FFFFFF;
  --el-input-border-color: #D3DCE8;
  --el-input-text-color: #172333;
  --el-input-placeholder-color: #708399;
}
.alarm-popup__note-input :deep(.el-textarea__inner) {
  min-height: 116px !important;
  padding: 9px 10px;
  border: 1px solid #D3DCE8;
  border-radius: 2px;
  color: #172333;
  background: #FFFFFF;
  box-shadow: none;
  font-size: 12px;
  line-height: 1.6;
}
.alarm-popup__note-input :deep(.el-textarea__inner:hover) {
  border-color: #9EB7D2;
}
.alarm-popup__note-input :deep(.el-textarea__inner:focus) {
  border-color: #3294ED;
  box-shadow: 0 0 0 1px rgba(50, 148, 237, 0.16);
}

.alarm-popup__right,
.alarm-popup__right :deep(*) {
  color: #111111 !important;
  text-decoration: none !important;
}
.alarm-popup__right .alarm-popup__section {
  border-bottom: 0;
}
.alarm-popup__note-input {
  --el-input-text-color: #111111;
  --el-input-placeholder-color: #111111;
}
.alarm-popup__note-input :deep(.el-textarea__inner::placeholder) {
  color: #111111 !important;
  opacity: 1;
}

/* ── 过渡动画 ── */
.alarm-popup-enter-active {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}
.alarm-popup-leave-active {
  transition: opacity 0.16s ease-in, transform 0.16s ease-in;
}
.alarm-popup-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.alarm-popup-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ── 弹窗边框闪烁动画（即使没有声音也能引起注意） ── */
@keyframes alarm-flash-border {
  0%, 100% { box-shadow: 0 14px 42px rgba(var(--alarm-level-rgb), 0.24); }
  50% { box-shadow: 0 14px 50px rgba(var(--alarm-level-rgb), 0.48); }
}
.alarm-flash {
  animation: alarm-flash-border 0.5s ease infinite;
}

@media (max-width: 760px) {
  .alarm-popup-overlay {
    padding: 8px;
  }

  .alarm-popup {
    width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    max-height: none;
  }

  .alarm-popup__device-info,
  .alarm-popup__category-tag {
    display: none;
  }

  .alarm-popup__body {
    flex-direction: column;
    overflow-y: auto;
  }

  .alarm-popup__left {
    min-height: 360px;
    flex: 0 0 58%;
    border-right: 0;
    border-bottom: 1px solid #2A5C8F;
  }

  .alarm-popup__right {
    min-width: 0;
    max-width: none;
    flex: 1 0 auto;
  }

  .alarm-popup__footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
