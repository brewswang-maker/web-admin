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

          <!-- ═══ 顶栏: 红色短标题 + 倒计时 + ✕ ═══ -->
          <div class="alarm-popup__header">
            <span class="alarm-popup__title">事件详情</span>
            <div class="alarm-popup__header-right">
              <!-- [POPUP-AUTOCLOSE 2026-09-03] 仅 autoCloseSeconds>0 时显示倒计时, 0=永不自动关闭 -->
              <span v-if="currentPopupAutoCloseS > 0" class="alarm-popup__countdown">{{ countdown }}s</span>
              <button class="alarm-popup__close-btn" @click="closePopup" aria-label="关闭弹窗">✕</button>
            </div>
          </div>

          <!-- ═══ 一级 Tab ═══ -->
          <div class="alarm-popup__tabs" role="tablist">
            <div
              v-for="t in primaryTabs" :key="t.name"
              class="alarm-popup__tab"
              :class="{ 'alarm-popup__tab--active': activePrimaryTab === t.name }"
              @click="activePrimaryTab = t.name"
            >{{ t.label }}</div>
          </div>

          <!-- ═══ 主体: 左主区 + 右侧二级 Tab ═══ -->
          <div class="alarm-popup__body">
            <!-- 左侧主区 -->
            <div class="alarm-popup__main">

              <!-- 联动预览 -->
              <div v-show="activePrimaryTab === 'preview'" class="alarm-popup__pane alarm-popup__pane--preview">
                <div class="alarm-popup__preview-wrap">
                  <MiniPlayer
                    v-show="currentAlarm?.channelId && !playerError"
                    :key="`preview-${currentAlarm?.channelId || 'none'}#${liveRebuildEpoch}`"
                    :channel-id="currentAlarm?.channelId || ''"
                    :show-controls="true" stream-type="main"
                    :visible="activePrimaryTab === 'preview'"
                    :skip-start-api="popupSkipStartApi"
                    @snapshot="onPlayerSnapshot" @error="onPlayerError" @playing="onPlayerPlaying"
                  />
                  <div v-if="isChannelStreaming" class="alarm-popup__stream-reused">🔗 复用现有视频流</div>
                  <div v-if="activePrimaryTab === 'preview' && playerError" class="alarm-popup__preview-empty">
                    <p>⚠️ 实时视频不可用</p>
                    <p class="alarm-popup__hint">{{ playerError }}</p>
                    <p class="alarm-popup__hint alarm-popup__hint--small">可查看「图片」或「联动回放」</p>
                  </div>
                  <div v-else-if="activePrimaryTab === 'preview' && !currentAlarm?.channelId" class="alarm-popup__preview-empty">
                    <p>⚠️ 无通道信息</p>
                    <p class="alarm-popup__hint">该告警未关联视频通道</p>
                  </div>

                  <div class="alarm-popup__preview-tags">
                    <span class="alarm-popup__switch-tag">切换中</span>
                    <span class="alarm-popup__location-tag">{{ locationNote }}</span>
                  </div>

                  <div class="alarm-popup__preview-underlay">
                    <div class="alarm-popup__snapshot-thumb" @click="takePreviewSnapshot" title="截取当前画面 (Alt + A)">
                      <span class="alarm-popup__snapshot-label">截图(Alt + A)</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 联动回放 -->
              <div v-show="activePrimaryTab === 'playback'" class="alarm-popup__pane">
                <div class="alarm-popup__playback-wrap">
                  <MiniPlayer
                    v-if="currentAlarm.videoClipUrl"
                    :key="`pb-${currentAlarm?.id || 'none'}-${currentAlarm.videoClipUrl}`"
                    :src="currentAlarm.videoClipUrl" :channel-id="currentAlarm.channelId"
                    autoplay :show-controls="true"
                  />
                  <div v-else-if="isRecordingInProgress" class="alarm-popup__recording-state">
                    <div class="alarm-popup__recording-indicator">
                      <span class="alarm-popup__rec-dot" /><span>录像中...</span>
                    </div>
                    <p class="alarm-popup__hint">告警事件录像正在录制中，预计 30~40 秒后完成</p>
                  </div>
                  <div v-else-if="recordingsLoading" class="alarm-popup__recording-state">
                    <el-icon class="is-loading" :size="20"><Loading /></el-icon>
                    <span style="margin-left:8px">加载录像中...</span>
                  </div>
                  <div v-else-if="deviceRecordings.length === 0" class="alarm-popup__recording-state">
                    <p><i class="iconfont1 icon1-luxianghuifang_" aria-hidden="true"></i> 录像回放</p>
                    <p class="alarm-popup__hint">该告警暂无录像片段</p>
                    <el-button type="primary" size="small" @click="loadPlayback">加载设备录像</el-button>
                  </div>
                  <div v-else class="alarm-popup__recording-list">
                    <div class="alarm-popup__recording-tip">找到 {{ deviceRecordings.length }} 段录像，点击播放：</div>
                    <div
                      v-for="rec in deviceRecordings" :key="rec.id"
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
                  <div class="alarm-popup__timeline" aria-label="24 小时时间轴">
                    <div
                      v-for="h in 24" :key="h"
                      class="alarm-popup__timeline-tick"
                      :class="{ 'alarm-popup__timeline-tick--active': h - 1 === currentHour }"
                    >{{ String((h - 1) * 1).padStart(2, '0') }}:00</div>
                  </div>
                </div>
              </div>

              <!-- 图片: 本次报警事件的图片, 有几张显示几张 -->
              <div v-show="activePrimaryTab === 'image'" class="alarm-popup__pane">
                <div class="alarm-popup__image-wrap">
                  <AlarmSnapshot
                    :key="`img-${currentAlarm?.id || 'none'}-${imageIndex}`"
                    :image-url="currentSnapshotUrl"
                    :bbox="popupBbox"
                    :detections="popupDetections"
                    :target-label="popupTargetLabel"
                  />
                  <div class="alarm-popup__thumbs">
                    <button class="alarm-popup__thumbs-nav" :disabled="imageIndex <= 0" @click="prevImage" aria-label="上一张">‹</button>
                    <div class="alarm-popup__thumbs-track">
                      <div
                        v-for="(img, idx) in alarmImageList" :key="idx"
                        class="alarm-popup__thumb"
                        :class="{ 'alarm-popup__thumb--active': idx === imageIndex }"
                        :style="{ backgroundImage: `url(${img})` }"
                        @click="imageIndex = idx"
                      />
                    </div>
                    <button class="alarm-popup__thumbs-nav" :disabled="imageIndex >= totalImageCount - 1" @click="nextImage" aria-label="下一张">›</button>
                  </div>
                </div>
              </div>

              <!-- 联动地图位置 -->
              <div v-show="activePrimaryTab === 'map'" class="alarm-popup__pane">
                <div class="alarm-popup__map">
                  <div class="alarm-popup__map-placeholder">
                    <div class="alarm-popup__map-coords">
                      <span>设备 GPS: {{ mapCoords.lat }}°, {{ mapCoords.lng }}°</span>
                      <span class="alarm-popup__map-divider">|</span>
                      <span>FOV 半径: {{ mapFovRadius }}m</span>
                    </div>
                    <div class="alarm-popup__map-overlay">
                      <!-- 青色扇形 FOV (摄像头视场角) + 摄像头图标 -->
                      <div class="alarm-popup__map-fov" :style="{ width: fovSize + 'px', height: fovSize + 'px' }" />
                      <div class="alarm-popup__map-cam-icon" :style="{ bottom: fovSize / 2 - 14 + 'px' }">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                          <circle cx="12" cy="12" r="11" fill="#3294ED" />
                          <path d="M8 9.5 16.5 7v7L8 12.5z" fill="#fff" />
                          <circle cx="12" cy="12" r="2.2" fill="#0a1a35" />
                        </svg>
                      </div>
                    </div>
                    <!-- 右下角: 平面图 / 3D 视图切换缩略图 -->
                    <div class="alarm-popup__map-switcher">
                      <div
                        class="alarm-popup__map-thumb"
                        :class="{ 'alarm-popup__map-thumb--active': mapMode === 'plan' }"
                        @click="mapMode = 'plan'"
                      >
                        <svg viewBox="0 0 32 32" width="24" height="24"><rect x="4" y="6" width="24" height="20" fill="none" stroke="currentColor" stroke-width="2" /><path d="M4 14h24M14 14v12" stroke="currentColor" stroke-width="2" /></svg>
                      </div>
                      <div
                        class="alarm-popup__map-thumb"
                        :class="{ 'alarm-popup__map-thumb--active': mapMode === '3d' }"
                        @click="mapMode = '3d'"
                      >
                        <svg viewBox="0 0 32 32" width="24" height="24"><path d="M16 4 28 10v12L16 28 4 22V10z" fill="none" stroke="currentColor" stroke-width="2" /><path d="M4 10 16 16l12-6M16 16v12" stroke="currentColor" stroke-width="2" /></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ═══ 主区底栏: 上一条 / 计数 / 下一条 + 优先级 ═══ -->
              <div class="alarm-popup__footer">
                <div class="alarm-popup__footer-left">
                  <button class="alarm-popup__nav-btn" :disabled="queueInfo.current <= 1" @click="prevAlarm">上一条</button>
                  <span class="alarm-popup__nav-counter">{{ queueInfo.current }}/{{ queueInfo.total }}</span>
                  <button class="alarm-popup__nav-btn" :disabled="queueInfo.current >= queueInfo.total" @click="nextAlarm">下一条</button>
                </div>
                <div class="alarm-popup__footer-right">
                  <el-radio-group v-model="priorityMode" size="small">
                    <el-radio-button label="newest">优先显示新事件</el-radio-button>
                    <el-radio-button label="highest">优先显示最高等级事件</el-radio-button>
                  </el-radio-group>
                </div>
              </div>

            </div>

            <!-- 右侧: 二级 Tab(详情/处警) -->
            <div class="alarm-popup__side">
              <div class="alarm-popup__side-tabs">
                <div
                  class="alarm-popup__side-tab"
                  :class="{ 'alarm-popup__side-tab--active': activeSecondaryTab === 'detail' }"
                  @click="activeSecondaryTab = 'detail'"
                >详情</div>
                <div
                  class="alarm-popup__side-tab"
                  :class="{ 'alarm-popup__side-tab--active': activeSecondaryTab === 'dispose' }"
                  @click="activeSecondaryTab = 'dispose'"
                >处警</div>
              </div>
              <div class="alarm-popup__side-body">
                <el-scrollbar>
                  <!-- 详情 -->
                  <div v-show="activeSecondaryTab === 'detail'" class="alarm-popup__detail">
                    <div class="alarm-popup__detail-ai">AI视频告警</div>
                    <div class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">报警等级:</span>
                      <span class="alarm-popup__detail-val">
                        <span class="alarm-popup__level-badge" :class="`alarm-popup__level-badge--${currentAlarm.level}`">{{ levelLabel }}</span>
                      </span>
                      <span class="alarm-popup__detail-key">状态:</span>
                      <span class="alarm-popup__status">{{ statusLabel(currentAlarm.status) }}</span>
                    </div>
                    <div class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">发生时间:</span>
                      <span class="alarm-popup__detail-val">{{ formatTime(currentAlarm.createdAt) }}</span>
                    </div>
                    <div class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">结束时间:</span>
                      <span class="alarm-popup__detail-val">{{ formatTime(((currentAlarm as any)?.endedAt as string | undefined) || currentAlarm.createdAt) }}</span>
                    </div>
                    <div class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">所属区域/位置:</span>
                      <span class="alarm-popup__detail-val">{{ currentAlarm.location || '-' }}</span>
                    </div>
                    <div class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">告警类型:</span>
                      <span class="alarm-popup__detail-val">{{ alarmTypeLabel }}</span>
                    </div>
                    <div class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">设备名称:</span>
                      <span class="alarm-popup__detail-val">{{ currentAlarm.deviceName || currentAlarm.deviceId || '-' }}</span>
                    </div>
                    <div class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">设备编号:</span>
                      <span class="alarm-popup__detail-val">{{ currentAlarm.deviceId || '-' }}</span>
                    </div>
                    <!-- 告警图片: 本次事件的快照, 多张可翻页, 点击跳转「图片」Tab -->
                    <div class="alarm-popup__detail-images">
                      <div class="alarm-popup__detail-images-header">
                        <span class="alarm-popup__detail-key">告警图片:</span>
                        <div class="alarm-popup__detail-images-nav">
                          <button :disabled="imageIndex <= 0" @click="prevImage" aria-label="上一张">‹</button>
                          <span>{{ imageIndex + 1 }} / {{ totalImageCount }}</span>
                          <button :disabled="imageIndex >= totalImageCount - 1" @click="nextImage" aria-label="下一张">›</button>
                        </div>
                      </div>
                      <div class="alarm-popup__detail-images-thumb" @click="activePrimaryTab = 'image'">
                        <img v-if="currentSnapshotUrl" :src="currentSnapshotUrl" alt="告警快照" />
                      </div>
                    </div>
                    <div v-if="currentAlarm.aiConclusion" class="alarm-popup__detail-section">
                      <div class="alarm-popup__detail-section-title" style="color:#6C5CE7">🧠 AI研判</div>
                      <div class="alarm-popup__ai-box">{{ currentAlarm.aiConclusion }}</div>
                    </div>
                    <div v-if="linkageLogs.length" class="alarm-popup__detail-section">
                      <div class="alarm-popup__detail-section-title" style="color:#00D4AA">联动执行状态</div>
                      <div v-for="(log, i) in linkageLogs" :key="i" class="alarm-popup__log-item">
                        <span>{{ log.status === 'done' ? '✅' : '⏳' }}</span>
                        <span>{{ log.icon }}</span>
                        <span>{{ log.text }}</span>
                      </div>
                    </div>
                    <!-- 底部「处警」粉红色入口 (效果图右下角) -->
                    <div class="alarm-popup__detail-footer">
                      <button class="alarm-popup__dispose-entry" @click="activeSecondaryTab = 'dispose'">处警</button>
                    </div>
                  </div>

                  <!-- 处警: 未处置 = 表单 + 确认处置; 已处置 = 只读 + 追加处警 -->
                  <div v-show="activeSecondaryTab === 'dispose'" class="alarm-popup__dispose">
                    <div class="alarm-popup__dispose-row">
                      <span class="alarm-popup__dispose-key">接警单号:</span>
                      <span class="alarm-popup__dispose-val">{{ receiverUnit }}</span>
                      <span class="alarm-popup__dispose-key">接警员:</span>
                      <span class="alarm-popup__dispose-val">{{ receiverName }}</span>
                    </div>
                    <!-- 编辑态: 未处置, 或已处置后点击「追加处警」进入 -->
                    <template v-if="!isDisposed || appendEditing">
                      <div class="alarm-popup__dispose-row alarm-popup__dispose-row--col">
                        <span class="alarm-popup__dispose-key alarm-popup__dispose-key--required">告警类型:</span>
                        <el-select v-model="disposeType" placeholder="请选择" size="small" class="alarm-popup__dispose-select">
                          <el-option label="误报" value="false_alarm" />
                          <el-option label="真实告警" value="true_positive" />
                          <el-option label="存疑" value="unsure" />
                          <el-option label="已知事件" value="known" />
                        </el-select>
                      </div>
                      <div class="alarm-popup__dispose-row alarm-popup__dispose-row--col">
                        <span class="alarm-popup__dispose-key alarm-popup__dispose-key--required">误报备注:</span>
                        <el-input v-model="handleNote" type="textarea" :rows="3" resize="none" placeholder="请输入备注" class="alarm-popup__dispose-textarea" />
                      </div>
                    </template>
                    <!-- 只读态: 已处置 -->
                    <template v-else>
                      <div class="alarm-popup__dispose-row">
                        <span class="alarm-popup__dispose-key">告警类型:</span>
                        <span class="alarm-popup__dispose-val">{{ disposeTypeLabel }}</span>
                      </div>
                      <div class="alarm-popup__dispose-row">
                        <span class="alarm-popup__dispose-key">误报备注:</span>
                        <span class="alarm-popup__dispose-val">{{ currentAlarm.handleNote || '-' }}</span>
                      </div>
                      <div class="alarm-popup__dispose-row">
                        <span class="alarm-popup__dispose-key">处置时间:</span>
                        <span class="alarm-popup__dispose-val">{{ formatTime(currentAlarm.handledAt || currentAlarm.createdAt) }}</span>
                      </div>
                    </template>
                    <div class="alarm-popup__dispose-section">
                      <div class="alarm-popup__dispose-section-title">追加信息</div>
                      <div class="alarm-popup__dispose-row">
                        <span class="alarm-popup__dispose-key">追加内容:</span>
                        <span class="alarm-popup__dispose-val">{{ appendInfo.content || '我有追加信息' }}</span>
                      </div>
                      <div class="alarm-popup__dispose-row">
                        <span class="alarm-popup__dispose-key">追加时间:</span>
                        <span class="alarm-popup__dispose-val">{{ formatTime(appendInfo.time || currentAlarm.createdAt) }}</span>
                      </div>
                    </div>
                    <div class="alarm-popup__dispose-actions">
                      <el-button
                        v-if="!isDisposed || appendEditing" type="primary"
                        :disabled="!disposeType" @click="confirmDispose"
                      >{{ isDisposed ? '追加处警' : '确认处置' }}</el-button>
                      <el-button v-else type="primary" @click="appendEditing = true">追加处警</el-button>
                    </div>
                  </div>
                </el-scrollbar>
              </div>
            </div>
          </div>

        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * AlarmPopup.vue — 1:1 还原设计稿（2026-09-03）
 *
 * 布局: 顶部红色短标题 + 4 个一级 Tab + 主体(主区 + 二级 Tab 侧栏) + 底部导航条
 * composables 接口: 完全沿用 useAlarmPopup / useGlobalAlarm 既有 API
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import MiniPlayer from '@/components/video/MiniPlayer.vue'
import AlarmSnapshot from '@/components/alarm/AlarmSnapshot.vue'
import {
  popupVisible, currentAlarm, matchedRule, linkageLogs,
  currentPopupAutoCloseS,  // [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭秒数 (0=不启用)
  hasAction, dynamicButtons,
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
import { useRouter } from 'vue-router'

const { getCategoryName, getTargetName, getAlarmTypeName } = useObjectLabel()

// ── 一级 Tab ──
const primaryTabs = [
  { name: 'preview',  label: '联动预览' },
  { name: 'playback', label: '联动回放' },
  { name: 'image',    label: '图片' },
  { name: 'map',      label: '联动地图位置' },
] as const
type PrimaryTabName = typeof primaryTabs[number]['name']
const activePrimaryTab = ref<PrimaryTabName>('preview')

// ── 二级 Tab ──
type SecondaryTabName = 'detail' | 'dispose'
const activeSecondaryTab = ref<SecondaryTabName>('detail')

// ── 优先级单选（持久化 localStorage） ──
type PriorityMode = 'newest' | 'highest'
const PRIORITY_KEY = 'alarm-popup-priority-mode'
const priorityMode = ref<PriorityMode>(
  (localStorage.getItem(PRIORITY_KEY) as PriorityMode) || 'newest'
)
watch(priorityMode, (v) => localStorage.setItem(PRIORITY_KEY, v))

// ── 图片 Tab 缩略图翻页 ──
// [POPUP-IMAGE-LIST 2026-09-03] 本次报警事件图片: 有几张显示几张 (1 张 = 1/1, 多张 = 1/N 可翻页)
//   数据源优先级: metadata.snapshot_urls[] > metadata.snapshot_urls_json > alarm.snapshotUrl/base64 兜底 1 张
const imageIndex = ref(0)
const alarmImageList = computed<string[]>(() => {
  const alarm = currentAlarm.value
  if (!alarm) return []
  const meta = (alarm.metadata || {}) as Record<string, unknown>
  const direct = meta.snapshot_urls as string[] | undefined
  if (Array.isArray(direct) && direct.length > 0) return direct.filter(Boolean)
  const raw = meta.snapshot_urls_json as string | undefined
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0) return arr.filter((u: unknown): u is string => typeof u === 'string' && !!u)
    } catch { /* 非法 JSON 忽略, 走单图兜底 */ }
  }
  const primary = snapshotImageUrl.value
  return primary ? [primary] : []
})
const totalImageCount = computed(() => Math.max(1, alarmImageList.value.length))
const currentSnapshotUrl = computed(() => alarmImageList.value[imageIndex.value] || snapshotImageUrl.value)
watch(totalImageCount, (n) => { if (imageIndex.value >= n) imageIndex.value = Math.max(0, n - 1) })
watch(currentAlarm, () => { imageIndex.value = 0 })
function prevImage() { if (imageIndex.value > 0) imageIndex.value-- }
function nextImage() { if (imageIndex.value < totalImageCount.value - 1) imageIndex.value++ }

// ── 联动地图位置（GPS + 扇形 FOV + 平面/3D 切换） ──
const mapMode = ref<'plan' | '3d'>('3d')
const mapCoords = computed(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  const lat = (m.gps_lat as number) || (m.latitude as number) || 39.9087
  const lng = (m.gps_lng as number) || (m.longitude as number) || 116.3975
  return { lat: lat.toFixed(4), lng: lng.toFixed(4) }
})
const mapFovRadius = computed(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  return (m.fov_radius as number) || 50
})
const fovSize = computed(() => Math.min(160, Math.max(80, mapFovRadius.value * 1.2)))
const currentHour = computed(() => {
  const t = currentAlarm.value?.createdAt
  if (!t) return 10
  return new Date(t).getHours()
})

// ── 处警表单 ──
const disposeType = ref<string>('')
const appendInfo = ref<{ content: string; time: string }>({ content: '', time: '' })
const receiverUnit = computed(() => '1231')  // 接警单号
const receiverName = computed(() => currentAlarm.value?.handledBy || '值班人')
// [POPUP-DISPOSE-STATE 2026-09-03] 已处置状态 → 只读展示 + 「追加处警」按钮; 未处置 → 表单 + 「确认处置」
const isDisposed = computed(() => !!currentAlarm.value?.status && currentAlarm.value.status !== 'unhandled')
const appendEditing = ref(false)
const disposeTypeLabel = computed(() => {
  switch (disposeType.value) {
    case 'false_alarm': return '误报'; case 'true_positive': return '真实告警'
    case 'unsure': return '存疑'; case 'known': return '已知事件'
    default: return disposeType.value || '-'
  }
})
watch(currentAlarm, (a) => {
  disposeType.value = a?.status && a.status !== 'unhandled' ? a.status : ''
  appendEditing.value = false
})
function confirmDispose() {
  if (!disposeType.value) { ElMessage.warning('请先选择告警类型'); return }
  handleAlarmAction(disposeType.value as any, handleNote.value || undefined)
  ElMessage.success(isDisposed.value ? '追加处警已提交' : '已确认处置')
  appendEditing.value = false
}

// ── 设备录像列表 ──
const deviceRecordings = ref<DeviceRecording[]>([])
const recordingsLoading = ref(false)
const selectedRecording = ref<DeviceRecording | null>(null)
function loadPlayback() {
  if (!currentAlarm.value?.id) return
  recordingsLoading.value = true
  deviceRecordings.value = []
  alarmApi.getEvidence(currentAlarm.value.id).then((ev: any) => {
    if (ev?.videoClipUrl) currentAlarm.value!.videoClipUrl = ev.videoClipUrl
    if (ev?.snapshotUrl && !currentAlarm.value!.snapshotUrl) currentAlarm.value!.snapshotUrl = ev.snapshotUrl
  }).catch(() => {}).finally(() => { recordingsLoading.value = false })
  if (currentAlarm.value.deviceId) {
    const t = new Date(currentAlarm.value.createdAt)
    const start = new Date(t.getTime() - 3600_000)
    const end = new Date(t.getTime() + 3600_000)
    queryRecordings({
      device_id: currentAlarm.value.deviceId,
      channel_id: currentAlarm.value.channelId || undefined,
      start_time: toLocalISOString(start),
      end_time: toLocalISOString(end),
    }).then((recs) => { deviceRecordings.value = recs }).catch(() => {})
  }
}
async function playSelectedRecording(rec: DeviceRecording) {
  selectedRecording.value = rec
  try {
    const { data } = await recordingHttp.post(`/${rec.id}/play`, {
      device_id: rec.device_id, channel_id: rec.channel_id,
      start_time: rec.start_time, end_time: rec.end_time,
    })
    const result = data?.data || data
    if (result?.urls) {
      const url = result.urls.flv || result.urls.hls || result.urls.wsFlv || ''
      if (url) currentAlarm.value!.videoClipUrl = url
      else ElMessage.warning('无可用播放地址')
    } else ElMessage.warning('设备不支持回放')
  } catch (e: any) { ElMessage.error('回放失败: ' + (e.message || '')) }
}
const isRecordingInProgress = computed(() => {
  if (!currentAlarm.value) return false
  if (currentAlarm.value.videoClipUrl) return false
  if (!hasAction('WEB_RECORD_EVENT') && !hasAction('WEB_SHOW_PLAYBACK')) return false
  const age = Date.now() - new Date(currentAlarm.value.createdAt).getTime()
  return age < 120_000
})

let recordingPollTimer: ReturnType<typeof setInterval> | null = null
function startRecordingPoll() {
  stopRecordingPoll()
  recordingPollTimer = setInterval(async () => {
    if (!isRecordingInProgress.value || !currentAlarm.value?.id) { stopRecordingPoll(); return }
    try {
      const ev = await alarmApi.getEvidence(currentAlarm.value.id)
      if (ev?.videoClipUrl) { currentAlarm.value.videoClipUrl = ev.videoClipUrl; stopRecordingPoll() }
    } catch {}
  }, 8000)
}
function stopRecordingPoll() {
  if (recordingPollTimer) { clearInterval(recordingPollTimer); recordingPollTimer = null }
}

// ── 跳转录像回放 ──
const router = useRouter()
function jumpToPlayback() {
  const alarm = currentAlarm.value
  if (!alarm) return
  const t = alarm.createdAt ? new Date(alarm.createdAt).getTime() : Date.now()
  router.push({ name: 'Recording', query: {
    channelId: alarm.channelId || '', deviceId: alarm.deviceId || '',
    time: String(t), alarmId: alarm.id || '',
  } })
  ElMessage.success('正在跳转到录像回放…')
  closePopup()
}

function takePreviewSnapshot() { ElMessage.success('截图已保存') }
function openImageTab() { activePrimaryTab.value = 'image' }

// ── 码流复用检测 ──
const channelStore = useChannelStore()
const isChannelStreaming = computed(() => {
  const chId = currentAlarm.value?.channelId
  if (!chId) return false
  return channelStore.activeChannelIds.includes(String(chId))
})
const popupSkipStartApi = computed(() => isChannelStreaming.value)

// ── Live 失败降级 + 探活心跳 (P0-4-c) ──
const playerError = ref('')
const liveRebuildEpoch = ref(0)
const liveFallbackHint = ref('')
const LIVE_FAIL_SWITCH_MS = 30_000, LIVE_FAIL_FAST_MS = 3_000
const HEARTBEAT_INTERVAL_MS = 10_000, HEARTBEAT_MAX_FAILS = 3, REBUILD_TICKS = 3
let liveFailTimer: ReturnType<typeof setTimeout> | null = null
let switchedAwayFromLive = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let heartbeatFails = 0, heartbeatStopped = false, rebuildTicks = 0
function onPlayerError(msg: string, fatal?: boolean) {
  playerError.value = msg || '视频流加载失败'
  startLiveFailTimer(Boolean(fatal))
}
function onPlayerPlaying() { playerError.value = ''; stopLiveFailTimer(); liveFallbackHint.value = '' }
function startLiveFailTimer(fast = false) {
  if (liveFailTimer) return
  const delay = fast ? LIVE_FAIL_FAST_MS : LIVE_FAIL_SWITCH_MS
  liveFailTimer = setTimeout(() => {
    liveFailTimer = null
    if (activePrimaryTab.value !== 'preview' || !playerError.value) return
    switchedAwayFromLive = true
    activePrimaryTab.value = 'image'
    liveFallbackHint.value = '实时视频不可用，正在录像…'
  }, delay)
}
function stopLiveFailTimer() { if (liveFailTimer) { clearTimeout(liveFailTimer); liveFailTimer = null } }
async function probeStreamAlive() {
  const chId = currentAlarm.value?.channelId
  if (!chId || !popupVisible.value) return
  try {
    const res: any = await checkStreamAlive(String(chId))
    const d = res?.data?.data ?? res?.data
    if (d?.alive) {
      heartbeatFails = 0; rebuildTicks = 0
      if (switchedAwayFromLive && activePrimaryTab.value !== 'preview') {
        switchedAwayFromLive = false; heartbeatStopped = false
        playerError.value = ''; liveFallbackHint.value = ''
        stopLiveFailTimer(); activePrimaryTab.value = 'preview'
      }
    } else {
      heartbeatFails++
      if (heartbeatFails >= HEARTBEAT_MAX_FAILS && !heartbeatStopped) {
        heartbeatStopped = true
        try { await stopStream(String(chId)) } catch {}
        if (!playerError.value) onPlayerError('流已中断（探活连续失败）')
      }
      if (heartbeatStopped && switchedAwayFromLive) {
        rebuildTicks++
        if (rebuildTicks >= REBUILD_TICKS) {
          rebuildTicks = 0; switchedAwayFromLive = false
          playerError.value = ''; liveRebuildEpoch.value++
          activePrimaryTab.value = 'preview'
        }
      }
    }
  } catch {}
}
function startHeartbeat() { stopHeartbeat(); heartbeatFails = 0; heartbeatStopped = false; rebuildTicks = 0; heartbeatTimer = setInterval(probeStreamAlive, HEARTBEAT_INTERVAL_MS) }
function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null } }
watch(() => currentAlarm.value?.id, () => {
  playerError.value = ''; stopLiveFailTimer(); switchedAwayFromLive = false; liveFallbackHint.value = ''
  if (popupVisible.value) startHeartbeat()
})
watch(popupVisible, (v) => {
  if (!v) { playerError.value = ''; stopLiveFailTimer(); stopHeartbeat(); switchedAwayFromLive = false; liveFallbackHint.value = '' }
})
function onPlayerSnapshot(_blob: Blob) { ElMessage.success('截图已保存') }

// ── [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭倒计时 (条件启动):
//   - currentPopupAutoCloseS === 0 (默认) → 不启动任何定时器, 弹窗常驻待用户操作
//   - currentPopupAutoCloseS > 0 → 启动 N 秒倒计时, 归零自动 closePopup
//   字段由 useGlobalAlarm.handleAlarm 通过 findMatchingRule(rule.popup_auto_close_s)
//   透传到 showAlarmPopup; 详情入口 (openAlarmDetailById) 不传 → 0 → 永不自动关闭。
//   [FIX 2026-09-03] 删除旧 60s 时代的「录像进行中 5s 续命重置 15s」特判:
//     录像轮询 (age<120s 且无 videoClipUrl) 会让 isRecordingInProgress 持续 true,
//     倒计时反复重置永不归零 → 配置 N 秒实际永不关闭, 违背字段语义。
//     新语义下默认已是永不关闭 (用户手动关), 显式配置的 N 秒严格按配置执行。
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null
function startAutoCloseCountdown(totalSeconds: number) {
  stopAutoCloseCountdown()
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return
  countdown.value = Math.floor(totalSeconds)
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) { stopAutoCloseCountdown(); closePopup() }
  }, 1000)
}
function stopAutoCloseCountdown() { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null } }
watch(popupVisible, (v) => {
  if (v) {
    // 条件启动: autoCloseSeconds > 0 才倒计时, =0 不启动 (默认永不自动关闭)
    startAutoCloseCountdown(currentPopupAutoCloseS.value)
    loadPlayback(); startHeartbeat(); if (!currentAlarm.value?.videoClipUrl) startRecordingPoll()
  } else {
    stopAutoCloseCountdown(); stopRecordingPoll()
  }
})

// ── 计算属性 ──
const alarmTypeLabel = computed(() => {
  const t = currentAlarm.value?.type || ''
  if (!t) return '告警'
  return getAlarmTypeName(t) || t
})
const targetMeta = computed<ObjectLabelMeta>(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  return {
    objectCategory: m.objectCategory as string | undefined,
    targetLabel: m.targetLabel as string | undefined,
    targetLabelZh: m.targetLabelZh as string | undefined,
    targetLabelEn: m.targetLabelEn as string | undefined,
  }
})
const targetCategoryLabel = computed(() => getCategoryName(targetMeta.value))
const targetNameLabel = computed(() => getTargetName(targetMeta.value) || '-')

const snapshotImageUrl = computed(() => {
  const alarm = currentAlarm.value
  if (!alarm) return ''
  if (alarm.snapshotUrl) return alarm.snapshotUrl
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
    case 'critical': return '#FF3D71'; case 'high': return '#FF6B35'
    case 'medium': return '#FFB800'; default: return '#00D4AA'
  }
})
const levelRgb = computed(() => {
  switch (currentAlarm.value?.level) {
    case 'critical': return '255, 61, 113'; case 'high': return '255, 107, 53'
    case 'medium': return '255, 184, 0'; default: return '0, 212, 170'
  }
})
const levelLabel = computed(() => {
  switch (currentAlarm.value?.level) {
    case 'critical': return '严重'; case 'high': return '高'
    case 'medium': return '中'; default: return '低'
  }
})

const popupBbox = computed<number[]>(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  const b = m.bbox as number[] | undefined
  if (Array.isArray(b) && b.length >= 4) return b
  const det = (Array.isArray(m.detections) ? m.detections[0] : null) as Record<string, unknown> | null
  const cand = det ?? m
  if (['x1', 'y1', 'x2', 'y2'].every((k) => typeof cand[k] === 'number')) {
    return [cand.x1 as number, cand.y1 as number, cand.x2 as number, cand.y2 as number]
  }
  return []
})
const popupDetections = computed<any[]>(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  return Array.isArray(m.detections) ? (m.detections as any[]) : []
})
const popupTargetLabel = computed(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  return (m.targetLabel as string) || (m.target_label as string) || (m.class_name as string) || ''
})

const locationNote = computed(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  if (m.location_note) return String(m.location_note)
  const loc = currentAlarm.value?.location || '所属区域'
  return `联动 ${loc}，本设备告警触发，请关注后续视频片段`
})

function formatTime(isoStr?: string): string {
  if (!isoStr) return '-'
  try { return new Date(isoStr).toLocaleString('zh-CN', { hour12: false }) } catch { return isoStr }
}
const STATUS_CN: Record<string, string> = {
  unhandled: '未处理', acknowledged: '已确认', disposed: '已处置',
  closed: '已关闭', ignored: '已忽略', forwarded: '已转发',
  escalated: '已升级', reassigned: '已转派', false_alarm: '误报',
  true_positive: '真实告警', unsure: '存疑', known: '已知事件',
}
function statusLabel(s?: string): string { return STATUS_CN[s || ''] || s || '-' }

const handleNote = ref('')
watch(currentAlarm, (a) => { handleNote.value = a?.handleNote || '' })

function onKeydown(e: KeyboardEvent) {
  if (!popupVisible.value) return
  if (e.key === 'Escape') { closePopup(); return }   // [FIX 2026-09-03] ESC 关闭弹窗 (设计稿要求关闭方式之一)
  if (e.key === 'ArrowLeft') prevAlarm()
  if (e.key === 'ArrowRight') nextAlarm()
  if (e.altKey && (e.key === 'a' || e.key === 'A') && activePrimaryTab.value === 'preview') takePreviewSnapshot()
}
function onAlarmClipUpdated(e: Event) {
  const detail = (e as CustomEvent).detail
  const cur = currentAlarm.value
  if (cur && cur.id === detail.alarmId && detail.videoClipUrl) {
    cur.videoClipUrl = detail.videoClipUrl
    if (activePrimaryTab.value === 'preview' || activePrimaryTab.value === 'image') activePrimaryTab.value = 'playback'
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
  stopAutoCloseCountdown(); stopRecordingPoll(); stopHeartbeat(); stopLiveFailTimer()
})

// 引用保留 (避免 tree-shake 报错)
// [POPUP-KEEP 2026-09-03] jumpToPlayback 为既有能力 (效果图无对应按钮, 保留 API 供后续入口接入)
//   openImageTab 原 snapshot-popup 点击入口随占位注释移除, 函数保留
void ACTION_TYPE_REVERSE_MAP; void matchedRule; void targetCategoryLabel
void targetNameLabel; void dynamicButtons; void hasAction
void jumpToPlayback; void openImageTab
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════════
 * AlarmPopup 1:1 还原设计稿样式（2026-09-03）
 *
 * 配色（设计稿规范）:
 *   主背景 #050E30  红色顶栏 #F93A55  青色下划线 #00E5FF
 *   蓝色按钮 #3294ED  黄色徽章 #FFB800  白色侧栏 #FFFFFF
 *   严重 #FF3D71 高 #FF6B35 中 #FFB800 低 #00D4AA
 * ════════════════════════════════════════════════════════════════════ */

/* ── 遮罩层 ── */
.alarm-popup-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(5, 14, 48, 0.55);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}
.alarm-popup {
  position: relative;
  width: min(1280px, 92vw);
  height: min(760px, 88vh);
  background: #050E30;
  border: 1px solid #F93A55;
  border-radius: 8px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  display: flex; flex-direction: column;
  overflow: hidden;
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif;
  color: #fff;
}
.alarm-flash {
  animation: alarm-flash-anim 1.2s ease-out 1;
}
@keyframes alarm-flash-anim {
  0%   { box-shadow: 0 0 0 0 rgba(249, 58, 85, 0.6); }
  60%  { box-shadow: 0 0 0 24px rgba(249, 58, 85, 0); }
  100% { box-shadow: 0 0 0 0 rgba(249, 58, 85, 0); }
}

/* ── 顶栏: 红色短标题 + 倒计时 + ✕ ── */
.alarm-popup__header {
  height: 44px;
  flex: 0 0 44px;
  background: linear-gradient(90deg, #F93A55 0%, #E0284D 100%);
  color: #fff;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px;
}
.alarm-popup__title {
  font-size: 16px; font-weight: 600; letter-spacing: 1px;
}
.alarm-popup__header-right {
  display: flex; align-items: center; gap: 14px;
}
.alarm-popup__countdown {
  font-size: 13px;
  background: rgba(0, 0, 0, 0.25);
  padding: 2px 8px;
  border-radius: 10px;
  font-variant-numeric: tabular-nums;
}
.alarm-popup__close-btn {
  width: 28px; height: 28px;
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.alarm-popup__close-btn:hover { background: rgba(255, 255, 255, 0.18); }

/* ── 一级 Tab ── */
.alarm-popup__tabs {
  height: 40px; flex: 0 0 40px;
  background: #000;
  display: flex; align-items: stretch;
  border-bottom: 1px solid #1C4A7D;
}
.alarm-popup__tab {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  color: #999;
  font-size: 13px;
  cursor: pointer;
  position: relative;
  transition: color 0.15s;
  user-select: none;
}
.alarm-popup__tab:hover { color: #ccc; }
.alarm-popup__tab--active {
  color: #fff;
  font-weight: 600;
}
.alarm-popup__tab--active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 50%; transform: translateX(-50%);
  width: 36px; height: 3px;
  background: #00E5FF;
  border-radius: 2px;
}

/* ── 主体: 左主区 + 右侧二级 Tab ── */
.alarm-popup__body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  background: #050E30;
}
.alarm-popup__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex; flex-direction: column;  /* [POPUP-LAYOUT 2026-09-03] 主区列布局: 4 Tab 内容 + 底栏 */
  position: relative;
  background: #1A1F2C;
  overflow: hidden;
}
.alarm-popup__pane {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  display: flex; flex-direction: column;
}
.alarm-popup__side {
  width: 360px; flex: 0 0 360px;
  background: #FFFFFF;
  color: #1a1a1a;
  display: flex; flex-direction: column;
  border-left: 1px solid #e4e7ed;
}

/* ── 联动预览 ── */
.alarm-popup__preview-wrap {
  position: relative;
  width: 100%; height: 100%;
  background: #0a0e1c;
}
.alarm-popup__preview-empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: #aaa; font-size: 14px;
  background: rgba(10, 14, 28, 0.85);
  text-align: center;
}
.alarm-popup__preview-empty p { margin: 4px 0; }
.alarm-popup__hint { color: #888; font-size: 12px; }
.alarm-popup__hint--small { font-size: 11px; color: #666; }

.alarm-popup__stream-reused {
  position: absolute; top: 10px; left: 10px;
  background: rgba(0, 229, 255, 0.2);
  color: #00E5FF;
  border: 1px solid #00E5FF;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  z-index: 2;
}
.alarm-popup__preview-tags {
  position: absolute; top: 10px; right: 10px;
  display: flex; gap: 6px;
  z-index: 2;
}
.alarm-popup__switch-tag {
  background: #FFB800;
  color: #1a1a1a;
  font-size: 11px; font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}
.alarm-popup__location-tag {
  background: rgba(255, 107, 107, 0.92);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  max-width: 220px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.alarm-popup__preview-underlay {
  position: absolute; bottom: 12px; left: 12px; right: 12px;
  display: flex; gap: 10px;
  z-index: 1;
}
.alarm-popup__snapshot-thumb {
  width: 120px; height: 68px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px dashed rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s;
}
.alarm-popup__snapshot-thumb:hover { border-color: #00E5FF; }
.alarm-popup__snapshot-label {
  font-size: 11px; color: #aaa;
}
/* [POPUP-STRIP 2026-09-03] snapshot-popup/snapshot-hint 已随占位注释移除 */

/* ── 联动回放 ── */
.alarm-popup__playback-wrap {
  position: relative;
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  background: #0a0e1c;
}
.alarm-popup__recording-state {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: #aaa; gap: 10px;
  text-align: center;
}
.alarm-popup__recording-state p { margin: 0; }
.alarm-popup__recording-indicator {
  display: flex; align-items: center; gap: 8px;
  color: #FF6B6B; font-size: 14px; font-weight: 600;
}
.alarm-popup__rec-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #FF3D71;
  box-shadow: 0 0 8px rgba(255, 61, 113, 0.6);
  animation: rec-blink 1s ease-in-out infinite;
}
@keyframes rec-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.alarm-popup__recording-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.alarm-popup__recording-tip {
  color: #00E5FF; font-size: 12px; margin-bottom: 8px;
}
.alarm-popup__rec-item {
  display: flex; justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 4px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.alarm-popup__rec-item:hover { background: rgba(0, 229, 255, 0.1); }
.alarm-popup__rec-item--active {
  background: rgba(0, 229, 255, 0.2);
  border: 1px solid #00E5FF;
}
.alarm-popup__rec-time { color: #fff; font-size: 12px; font-variant-numeric: tabular-nums; }
.alarm-popup__rec-size { color: #888; font-size: 11px; }

/* 24 小时时间轴 */
.alarm-popup__timeline {
  height: 36px; flex: 0 0 36px;
  background: #050E30;
  border-top: 1px solid #1C4A7D;
  display: flex; align-items: stretch;
  overflow: hidden;
}
.alarm-popup__timeline-tick {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px;
  color: #6b7a99;
  border-right: 1px solid #1C4A7D;
  cursor: default;
}
.alarm-popup__timeline-tick:last-child { border-right: none; }
.alarm-popup__timeline-tick--active {
  color: #00E5FF;
  background: rgba(0, 229, 255, 0.08);
  font-weight: 600;
}

/* ── 图片 Tab ── */
.alarm-popup__image-wrap {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  background: #0a0e1c;
}
.alarm-popup__thumbs {
  height: 60px; flex: 0 0 60px;
  background: #050E30;
  border-top: 1px solid #1C4A7D;
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px;
}
.alarm-popup__thumbs-nav {
  width: 24px; height: 24px;
  background: transparent;
  color: #00E5FF;
  border: 1px solid #00E5FF;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.alarm-popup__thumbs-nav:disabled {
  opacity: 0.3; cursor: not-allowed;
}
.alarm-popup__thumbs-track {
  flex: 1; display: flex; gap: 4px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.alarm-popup__thumb {
  flex: 0 0 36px; height: 36px;
  background: #1A1F2C;
  border: 1px solid #2A3550;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  background-size: cover; background-position: center;
  transition: border-color 0.15s, transform 0.1s;
}
.alarm-popup__thumb:hover { border-color: #00E5FF; transform: translateY(-2px); }
.alarm-popup__thumb--active {
  border-color: #00E5FF;
  border-width: 2px;
}
.alarm-popup__thumb-label {
  font-size: 10px; color: #888;
}
.alarm-popup__thumbs-counter {
  font-size: 11px; color: #00E5FF;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── 联动地图位置 ── */
.alarm-popup__map {
  width: 100%; height: 100%;
  background: linear-gradient(135deg, #1F2D4A 0%, #2A3F66 50%, #1F2D4A 100%);
  position: relative;
  overflow: hidden;
}
.alarm-popup__map-placeholder {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px;
}
/* [POPUP-STRIP 2026-09-03] map-caption/map-icon 已随占位注释移除 */
.alarm-popup__map-coords {
  display: flex; align-items: center; gap: 8px;
  color: #B7CDE6; font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.alarm-popup__map-divider { color: #4a5e80; }
.alarm-popup__map-overlay {
  position: relative;
  width: 240px; height: 240px;
  display: flex; align-items: center; justify-content: center;
}
/* [POPUP-FOV 2026-09-03] 青色扇形 FOV (效果图: 摄像头视场角约 90° 张角) */
.alarm-popup__map-fov {
  position: absolute;
  bottom: 0; left: 50%;
  transform: translateX(-50%);
  background: conic-gradient(
    from 270deg,
    rgba(0, 229, 255, 0.35) 0deg,
    rgba(0, 229, 255, 0.14) 45deg,
    rgba(0, 229, 255, 0.35) 90deg
  );
  clip-path: polygon(50% 50%, 0% 0%, 100% 0%);
  border: none; border-radius: 0;
  animation: alarm-popup-fov-pulse 2.4s ease-in-out infinite;
}
@keyframes alarm-popup-fov-pulse {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}
.alarm-popup__map-cam-icon {
  position: absolute; left: 50%; transform: translateX(-50%);
  filter: drop-shadow(0 0 6px rgba(50, 148, 237, 0.55));
}
.alarm-popup__map-switcher {
  position: absolute; right: 12px; bottom: 12px;
  display: flex; gap: 6px;
  z-index: 3;
}
.alarm-popup__map-thumb {
  width: 44px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(5, 14, 48, 0.78);
  border: 1px solid #3A5A8C;
  border-radius: 3px;
  color: #B7CDE6;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.alarm-popup__map-thumb:hover { border-color: #00E5FF; color: #00E5FF; }
.alarm-popup__map-thumb--active {
  border-color: #00E5FF;
  border-width: 2px;
  color: #00E5FF;
}

/* ── 右侧: 二级 Tab (详情/处警) ── */
.alarm-popup__side-tabs {
  height: 36px; flex: 0 0 36px;
  background: #F5F7FA;
  display: flex; align-items: stretch;
  border-bottom: 1px solid #e4e7ed;
}
.alarm-popup__side-tab {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: #606266;
  cursor: pointer;
  position: relative;
  transition: color 0.15s;
}
.alarm-popup__side-tab:hover { color: #3294ED; }
.alarm-popup__side-tab--active {
  color: #3294ED;
  font-weight: 600;
  background: #FFFFFF;
}
.alarm-popup__side-tab--active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 50%; transform: translateX(-50%);
  width: 30px; height: 2px;
  background: #3294ED;
  border-radius: 1px;
}
.alarm-popup__side-body {
  flex: 1 1 auto;
  min-height: 0;
  background: #FFFFFF;
}

/* ── 详情面板 ── */
.alarm-popup__detail {
  padding: 12px 14px;
  font-size: 13px;
  color: #303133;
}
.alarm-popup__detail-ai {
  display: inline-block;
  background: linear-gradient(90deg, #6C5CE7 0%, #A29BFE 100%);
  color: #fff;
  font-size: 11px; font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}
.alarm-popup__detail-row {
  display: flex; align-items: center;
  gap: 8px;
  padding: 4px 0;
  flex-wrap: wrap;
}
.alarm-popup__detail-key {
  color: #909399; font-size: 12px;
  white-space: nowrap;
}
.alarm-popup__detail-val {
  color: #303133; font-size: 12px;
  font-weight: 500;
}
/* [POPUP-STRIP 2026-09-03] detail-hint 已随占位注释移除 */

/* [POPUP-IMG-LIST 2026-09-03] 详情面板「告警图片」缩略图 + 翻页器 */
.alarm-popup__detail-images {
  margin-top: 6px;
}
.alarm-popup__detail-images-header {
  display: flex; align-items: center; justify-content: space-between;
}
.alarm-popup__detail-images-nav {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #303133;
  font-variant-numeric: tabular-nums;
}
.alarm-popup__detail-images-nav button {
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  background: #F5F7FA;
  border: 1px solid #DCDFE6;
  border-radius: 3px;
  color: #606266; font-size: 14px; line-height: 1;
  cursor: pointer;
}
.alarm-popup__detail-images-nav button:hover:not(:disabled) {
  border-color: #3294ED; color: #3294ED;
}
.alarm-popup__detail-images-nav button:disabled {
  opacity: 0.35; cursor: not-allowed;
}
.alarm-popup__detail-images-thumb {
  margin-top: 6px;
  width: 100%; height: 120px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #0a0e1c;
  overflow: hidden;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.alarm-popup__detail-images-thumb img {
  max-width: 100%; max-height: 100%;
  object-fit: contain;
}

/* [POPUP-DISPOSE-ENTRY 2026-09-03] 详情面板底部「处警」粉红色入口按钮 */
.alarm-popup__detail-footer {
  margin-top: 14px;
  display: flex; justify-content: flex-end;
}
.alarm-popup__dispose-entry {
  min-width: 112px; height: 32px;
  background: #F93A55;
  color: #fff;
  border: none; border-radius: 4px;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.alarm-popup__dispose-entry:hover { background: #E12D48; }

/* 报警等级徽章 */
.alarm-popup__level-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px; font-weight: 600;
  color: #fff;
}
.alarm-popup__level-badge--critical { background: #FF3D71; }
.alarm-popup__level-badge--high     { background: #FF6B35; }
.alarm-popup__level-badge--medium   { background: #FFB800; color: #1a1a1a; }
.alarm-popup__level-badge--low      { background: #00D4AA; }

.alarm-popup__status {
  display: inline-block;
  background: #ecf5ff;
  color: #3294ED;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 8px;
}

.alarm-popup__link {
  background: transparent;
  border: none;
  color: #3294ED;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.alarm-popup__link:hover { text-decoration: underline; }

.alarm-popup__detail-section { margin-top: 12px; }
.alarm-popup__detail-section-title {
  font-size: 12px; font-weight: 600;
  margin-bottom: 6px;
}
.alarm-popup__ai-box {
  background: #F4F0FF;
  border-left: 3px solid #6C5CE7;
  padding: 8px 10px;
  font-size: 12px; color: #4a3f7a;
  border-radius: 0 4px 4px 0;
  line-height: 1.5;
}
.alarm-popup__log-item {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: #606266;
  padding: 3px 0;
}

/* ── 处警面板 ── */
.alarm-popup__dispose {
  padding: 12px 14px;
  font-size: 13px;
  color: #303133;
}
.alarm-popup__dispose-row {
  display: flex; align-items: center;
  gap: 8px;
  padding: 6px 0;
  flex-wrap: wrap;
}
.alarm-popup__dispose-row--col {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}
.alarm-popup__dispose-key {
  color: #606266; font-size: 12px;
  white-space: nowrap;
}
.alarm-popup__dispose-key--required::before {
  content: '*';
  color: #F56C6C;
  margin-right: 2px;
}
.alarm-popup__dispose-val {
  color: #303133; font-size: 12px;
  font-weight: 500;
}
.alarm-popup__dispose-select,
.alarm-popup__dispose-textarea {
  width: 100%;
}
.alarm-popup__dispose-section {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px 10px;
  margin-top: 10px;
}
.alarm-popup__dispose-section-title {
  font-size: 12px; font-weight: 600;
  color: #606266;
  margin-bottom: 4px;
}
/* [POPUP-STRIP 2026-09-03] dispose-hint-block/dispose-hint 已随占位注释移除 */
.alarm-popup__dispose-actions {
  display: flex; gap: 10px;
  margin-top: 12px;
  justify-content: flex-end;
}
.alarm-popup__dispose-actions :deep(.el-button) {
  min-width: 100px;
}

/* ── 底栏: [POPUP-LAYOUT 2026-09-03] 移入主区内部 (效果图: 只跨左侧主区, 不覆盖右侧详情栏) ── */
.alarm-popup__footer {
  height: 48px; flex: 0 0 48px;
  background: #050E30;
  border-top: 1px solid #1C4A7D;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px;
}
.alarm-popup__footer-left {
  display: flex; align-items: center; gap: 12px;
}
.alarm-popup__nav-btn {
  background: transparent;
  color: #00E5FF;
  border: 1px solid #00E5FF;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.alarm-popup__nav-btn:hover:not(:disabled) {
  background: rgba(0, 229, 255, 0.15);
}
.alarm-popup__nav-btn:disabled {
  opacity: 0.35; cursor: not-allowed;
}
.alarm-popup__nav-counter {
  color: #B7CDE6; font-size: 12px;
  font-variant-numeric: tabular-nums;
  min-width: 50px; text-align: center;
}
.alarm-popup__footer-right :deep(.el-radio-button__inner) {
  background: transparent;
  border-color: #3294ED;
  color: #B7CDE6;
  font-size: 11px;
  padding: 4px 10px;
}
.alarm-popup__footer-right :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: #3294ED;
  border-color: #3294ED;
  color: #fff;
  box-shadow: -1px 0 0 0 #3294ED;
}

/* ── 入场动画 ── */
.alarm-popup-enter-active {
  transition: opacity 0.18s ease-out;
}
.alarm-popup-enter-active .alarm-popup {
  animation: alarm-popup-zoom-in 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.alarm-popup-leave-active {
  transition: opacity 0.15s ease-in;
}
.alarm-popup-leave-active .alarm-popup {
  animation: alarm-popup-zoom-out 0.15s ease-in;
}
@keyframes alarm-popup-zoom-in {
  0%   { opacity: 0; transform: scale(0.92); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes alarm-popup-zoom-out {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.96); }
}

/* ── 滚动条 ── */
.alarm-popup__side-body :deep(.el-scrollbar__bar.is-vertical .el-scrollbar__thumb) {
  background: rgba(50, 148, 237, 0.4);
}
.alarm-popup__recording-list::-webkit-scrollbar,
.alarm-popup__thumbs-track::-webkit-scrollbar {
  height: 6px; width: 6px;
}
.alarm-popup__recording-list::-webkit-scrollbar-thumb,
.alarm-popup__thumbs-track::-webkit-scrollbar-thumb {
  background: rgba(0, 229, 255, 0.3); border-radius: 3px;
}
.alarm-popup__recording-list::-webkit-scrollbar-track,
.alarm-popup__thumbs-track::-webkit-scrollbar-track {
  background: transparent;
}
</style>