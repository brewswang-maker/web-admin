<template>
  <Teleport to="body">
    <transition name="alarm-popup">
      <div v-if="popupVisible && currentAlarm" class="alarm-popup-overlay" @click.self="closePopup">
        <div
          class="alarm-popup"
          :class="{ 'alarm-flash': popupVisible }"
          :style="{ '--alarm-header-color': alarmHeaderColor, '--alarm-header-rgb': levelRgb  }"
        >

          <!-- ═══ 顶栏: 红色短标题 + 倒计时 + ✕ ═══ -->
          <div class="alarm-popup__header">
            <!-- [FIX camera-icon 2026-09-06] 顶栏补摄像头图标: 与平面图
                 deviceIconMeta('camera') 同形状 (枪机+镜头, 视觉识别一致);
                 包 flex 容器防 header space-between 把标题挤到中间 -->
            <span class="alarm-popup__title-wrap">
              <el-icon class="alarm-popup__title-icon" :size="22" aria-hidden="true"><BellFilled /></el-icon>
              <span class="alarm-popup__title">事件详情</span>
            </span>
            <div class="alarm-popup__header-right">
              <!-- [POPUP-AUTOCLOSE 2026-09-03] 仅 autoCloseSeconds>0 时显示倒计时, 0=永不自动关闭 -->
              <span v-if="currentPopupAutoCloseS > 0" class="alarm-popup__countdown">{{ countdown }}s</span>
              <button class="alarm-popup__close-btn" @click="closePopup" aria-label="关闭弹窗">✕</button>
            </div>
          </div>

          <!-- ═══ 一级 Tab + 右侧二级 Tab (同行: 一级居左, 详情/处警居右) ═══ -->
          <div class="alarm-popup__tabs" role="tablist">
            <div
              v-for="t in primaryTabs" :key="t.name"
              class="alarm-popup__tab"
              :class="{ 'alarm-popup__tab--active': activePrimaryTab === t.name }"
              @click="activePrimaryTab = t.name"
            >{{ t.label }}</div>

            <!-- 二级 Tab (详情/处警): 与一级 Tab 同行, 宽度对齐右侧面板 -->
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
          </div>

          <!-- ═══ 主体: 左主区 + 右侧二级 Tab ═══ -->
          <div class="alarm-popup__body">
            <!-- 左侧主区 -->
            <div class="alarm-popup__main">

              <!-- 联动预览 -->
              <div v-show="activePrimaryTab === 'preview'" class="alarm-popup__pane alarm-popup__pane--preview">
                <div class="alarm-popup__preview-wrap">
                  <MiniPlayer
                    v-show="previewChannelId && !playerError"
                    :key="`preview-${previewChannelId}#${liveRebuildEpoch}`"
                    :channel-id="previewChannelId"
                    :show-controls="true" stream-type="main"
                    :visible="activePrimaryTab === 'preview'"
                    :skip-start-api="popupSkipStartApi"
                    @snapshot="onPlayerSnapshot" @error="onPlayerError" @playing="onPlayerPlaying"
                  />
                  <div v-if="isChannelStreaming" class="alarm-popup__stream-reused">🔗 复用现有视频流</div>
                  <!-- [FLOOR-MAP 2026-09-05 v2] 点位点击预览非告警通道时提示可返回 -->
                  <div v-if="activePrimaryTab === 'preview' && previewChannelOverride" class="alarm-popup__preview-src-tag">
                    📍 平面图点位 · {{ previewChannelOverrideLabel }}
                    <span class="alarm-popup__preview-src-back" @click="clearPreviewOverride">返回告警通道</span>
                  </div>
                  <div v-if="activePrimaryTab === 'preview' && playerError" class="alarm-popup__preview-empty">
                    <p>⚠️ 实时视频不可用</p>
                    <p class="alarm-popup__hint">{{ playerError }}</p>
                    <p class="alarm-popup__hint alarm-popup__hint--small">可查看「图片」或「联动回放」</p>
                  </div>
                  <div v-else-if="activePrimaryTab === 'preview' && !previewChannelId" class="alarm-popup__preview-empty">
                    <p>⚠️ 无通道信息</p>
                    <p class="alarm-popup__hint">该告警未关联视频通道</p>
                  </div>

                  <div class="alarm-popup__preview-tags">
                    <span class="alarm-popup__switch-tag">切换中</span>
                    <span class="alarm-popup__location-tag">{{ locationNote }}</span>
                  </div>

                  <!-- <div class="alarm-popup__preview-underlay">
                    <div class="alarm-popup__snapshot-thumb" @click="takePreviewSnapshot" title="截取当前画面 (Alt + A)">
                      <span class="alarm-popup__snapshot-label">截图(Alt + A)</span>
                    </div>
                  </div> -->
                </div>
              </div>

              <!-- 联动回放: [POPUP-3MIN 2026-09-11] 事件前后各 1.5 分钟 (共 3 分钟) 自动连播,
                   取代旧「找到 N 段录像, 点击播放」人工选片列表 (用户反馈要求) -->
              <div v-show="activePrimaryTab === 'playback'" class="alarm-popup__pane">
                <div class="alarm-popup__playback-wrap">
                  <MiniPlayer
                    v-if="playerSrc"
                    :key="`pb-${currentAlarm?.id || 'none'}-${queueEpoch}-${playerSrc}`"
                    :src="playerSrc" :channel-id="currentAlarm.channelId"
                    :src-fallbacks="playbackFallbackUrls"
                    :seek-start="queueActive ? queueSeekStart : undefined"
                    :stop-at="queueActive ? queueStopAt : undefined"
                    autoplay :show-controls="true"
                    @ended="onPlaybackEnded"
                    @error="onPlaybackError"
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
                  <div v-else class="alarm-popup__recording-state">
                    <p><i class="iconfont1 icon1-luxianghuifang_" aria-hidden="true"></i> 录像回放</p>
                    <p class="alarm-popup__hint">该告警暂无录像片段</p>
                    <el-button type="primary" size="small" @click="loadPlayback">加载设备录像</el-button>
                  </div>
                  <!-- [POPUP-3MIN 2026-09-11] 连播进度: 已播段数 + 播完重播 (替代原人工选片列表) -->
                  <div v-if="queueActive" class="alarm-popup__queue-tip">
                    <span>{{ queueRangeLabel }} · 第 {{ Math.min(queueIndex + 1, playbackQueue.length) }}/{{ playbackQueue.length }} 段{{ queueFinished ? ' · 已播完' : '' }}{{ skippedSegments ? ' · 已跳过 ' + skippedSegments + ' 段' : '' }}</span>
                    <span v-if="queueFinished" class="alarm-popup__queue-replay" @click="replayQueue">↻ 重播</span>
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
                    :channel-id="currentAlarm?.channelId || ''"
                    :algo-id="popupAlgoId"
                    :alarm-shapes="popupAlarmShapes"
                  />
                  <!-- [POPUP-EV-MERGE 2026-09-07] 取证帧并入下方缩略图画廊 (pre/mid/post
                       带语义角标, 左右翻页/点击查看) — 原 EvidenceFrames compact
                       独立区块随之移除避免重复; 组件保留供 AlarmsView 详情使用 -->
                  <div class="alarm-popup__thumbs">
                    <button class="alarm-popup__thumbs-nav" :disabled="imageIndex <= 0" @click="prevImage" aria-label="上一张">‹</button>
                    <div class="alarm-popup__thumbs-track">
                      <div
                        v-for="(img, idx) in alarmImageList" :key="idx"
                        class="alarm-popup__thumb"
                        :class="{
                          'alarm-popup__thumb--active': idx === imageIndex,
                          'alarm-popup__thumb--evidence': !!img.tag,
                        }"
                        :style="{ backgroundImage: `url(${img.url})` }"
                        :title="img.tag || '主快照'"
                        @click="imageIndex = idx"
                      >
                        <span v-if="img.tag" class="alarm-popup__thumb-tag">{{ img.tag }}</span>
                      </div>
                    </div>
                    <button class="alarm-popup__thumbs-nav" :disabled="imageIndex >= totalImageCount - 1" @click="nextImage" aria-label="下一张">›</button>
                  </div>
                </div>
              </div>

              <!-- 联动地图位置 -->
              <div v-show="activePrimaryTab === 'map'" class="alarm-popup__pane">
                <div class="alarm-popup__map">
                  <!-- [FLOOR-MAP 2026-09-03] 真实平面图渲染: plan 模式且通道已绑定 →
                       FloorMapCanvas 只读 (底图+全部摄像头+告警高亮涟漪+bbox);
                       多图楼层切换 (华为 IVS 对标), 主图在前为默认 -->
                  <div v-if="mapMode === 'plan' && mapPairs.length" class="alarm-popup__map-live">
                    <div v-if="mapPairs.length > 1" class="alarm-popup__map-floors">
                      <button
                        v-for="(p, i) in mapPairs"
                        :key="p.map.id"
                        class="alarm-popup__map-floor"
                        :class="{ 'is-active': i === activeMapIdx }"
                        @click="activeMapIdx = i"
                      >{{ p.map.floor || p.map.name }}<span v-if="p.binding.is_primary" class="alarm-popup__map-floor-primary">主</span></button>
                    </div>
                    <div class="alarm-popup__map-livecanvas">
                      <!-- [FLOOR-MAP 2026-09-05 v2] panZoom 只读自动启用 (缩放/平移/双击复位);
                           @device-click: 点位点击跳联动预览 (海康通道点击展开预览对标) -->
                      <FloorMapCanvas
                        :map="activeMapPair.map"
                        :bindings="activeMapBindings"
                        :alarm-channel-id="alarmChannelIdStr"
                        :alarm-metadata="alarmMetadataObj"
                        @device-click="onMapDeviceClick"
                      />
                    </div>
                    <!-- 右下角真实换算 (比例尺 scale_m_per_px) -->
                    <div class="alarm-popup__map-livecoords">
                      <span>{{ activeMapPair.map.building || '' }}{{ activeMapPair.map.floor ? ' ' + activeMapPair.map.floor : '' }}</span>
                      <span class="alarm-popup__map-divider">|</span>
                      <span>1px = {{ activeMapPair.map.scale_m_per_px }}m</span>
                      <span class="alarm-popup__map-divider">|</span>
                      <span>FOV 半径: {{ activeMapPair.binding.fov_radius_m }}m</span>
                    </div>
                  </div>
                  <!-- GPS 占位兑底: 未绑定通道 或 3d 模式 (保留原有渲染不动 — 零破坏) -->
                  <div v-show="!(mapMode === 'plan' && mapPairs.length)" class="alarm-popup__map-placeholder">
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
                  </div>
                  <!-- 右下角: 平面图 / 3D 视图切换缩略图 (提到容器级: 绑定/占位两态共用) -->
                  <div class="alarm-popup__map-switcher">
                    <div
                      class="alarm-popup__map-thumb"
                      :class="{
                        'alarm-popup__map-thumb--active': mapMode === 'plan',
                        'alarm-popup__map-thumb--dot': mapPairs.length > 0 && mapMode !== 'plan',
                      }"
                      title="平面图"
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

              <!-- ═══ 主区底栏: 上一条 / 计数 / 下一条 + 优先级 ═══ -->
              <div class="alarm-popup__footer">
                <div class="alarm-popup__footer-left">
                  <button class="alarm-popup__nav-btn" :disabled="queueInfo.current <= 1" @click="prevAlarm">上一条</button>
                  <span class="alarm-popup__nav-counter">{{ queueInfo.current }}/{{ queueInfo.total }}</span>
                  <button class="alarm-popup__nav-btn" :disabled="queueInfo.current >= queueInfo.total" @click="nextAlarm">下一条</button>
                </div>
                <div class="alarm-popup__footer-right">
                  <el-radio-group v-model="priorityMode" size="small" class="alarm-popup__priority-group">
                    <el-radio label="newest">优先显示新事件</el-radio>
                    <el-radio label="highest">优先显示最高等级事件</el-radio>
                  </el-radio-group>
                </div>
              </div>

            </div>

            <!-- 右侧: 详情/处警面板 -->
            <div class="alarm-popup__side">
              <div class="alarm-popup__side-body">
                <el-scrollbar>
                  <!-- 详情 -->
                  <div v-show="activeSecondaryTab === 'detail'" class="alarm-popup__detail">
                    <div
                      class="alarm-popup__detail-ai"
                      :class="`alarm-popup__detail-ai--${currentAlarm.level}`"
                    >{{ alarmTypeLabel }}告警</div>
                    <div class="alarm-popup__detail-row alarm-popup__detail-row--level">
                      <div>
                        <span class="alarm-popup__detail-key">报警等级:</span>
                        <span class="alarm-popup__detail-val">
                          <span class="alarm-popup__level-badge" :class="`alarm-popup__level-badge--${currentAlarm.level}`">{{ levelLabel }}</span>
                        </span>
                      </div>
                      <div>
                           <span class="alarm-popup__detail-key">状态:</span>
                          <span class="alarm-popup__status">{{ statusLabel(currentAlarm.status) }}</span>
                      </div>

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
                    <!-- [FIX-P1-2 2026-09-12] 长窗聚合合并计数 (后端 aggregated_count > 1 展示) -->
                    <div v-if="mergedCount > 1" class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">合并计数:</span>
                      <span class="alarm-popup__detail-val">×{{ mergedCount }} 条（同类事件已合并）</span>
                    </div>
                    <!-- [FIX-P0-1 2026-09-12] 目标轨迹 (后端 track_id >= 0 展示, 供追溯) -->
                    <div v-if="currentTrackId >= 0" class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">目标轨迹:</span>
                      <span class="alarm-popup__detail-val">#{{ currentTrackId }}</span>
                    </div>
                    <div class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">设备名称:</span>
                      <!-- [FIX align 2026-09-07] 移除装饰性摄像头小图标: 设备名称值与告警类型/
                           设备编号行错位 ~18px, 视觉上疑似隐藏字符; 三行同构对齐 -->
                      <span class="alarm-popup__detail-val">{{ resolvedDeviceName || '-' }}</span>
                    </div>
                    <div class="alarm-popup__detail-row">
                      <span class="alarm-popup__detail-key">设备编号:</span>
                      <span class="alarm-popup__detail-val">{{ currentAlarm.deviceId || '-' }}</span>
                    </div>
                    <!-- 告警图片: 本次事件的快照, 多张可翻页, 点击跳转「图片」Tab -->
                    <div class="alarm-popup__detail-images">
                      <div class="alarm-popup__detail-images-header">
                        <span class="alarm-popup__detail-key alarm-popup__accent-title">告警图片</span>
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
                    <!-- [AI 复核恢复 2026-09-10 P4 → 本轮移位] 详情面板「告警图片」缩略图紧下方
                         AI 复核模块: VLM 二次复核结论 (后端 AlarmRetractionService 回写
                         metadata.ai_review 字段组, 前端经 normalizeAlarmCore.aiReview 归一化);
                         无复核数据时"未复核"占位不隐藏, 布局稳定 — 看图即看 AI 研判 -->
                    <div class="alarm-popup__ai-review">
                      <div class="alarm-popup__ai-review-head">
                        <span class="alarm-popup__ai-review-title">AI 复核</span>
                        <span
                          class="alarm-popup__ai-review-tag"
                          :class="`alarm-popup__ai-review-tag--${aiReviewTagKind}`"
                        >{{ aiReviewVerdictLabel(currentAlarm?.aiReview) }}</span>
                      </div>
                      <div class="alarm-popup__ai-review-body">
                        <div class="alarm-popup__ai-review-row">
                          <span class="alarm-popup__ai-review-label">识别算法</span>
                          <span class="alarm-popup__ai-review-value">{{ alarmTypeLabel }}</span>
                          <span class="alarm-popup__ai-review-label">检测置信度</span>
                          <span class="alarm-popup__ai-review-value">{{ Math.round((currentAlarm?.confidence || 0) * 100) }}%</span>
                          <span class="alarm-popup__ai-review-label">复核置信度</span>
                          <span class="alarm-popup__ai-review-value">{{ aiReviewConfidenceText }}</span>
                        </div>
                        <div class="alarm-popup__ai-review-row">
                          <span class="alarm-popup__ai-review-label">复核时间</span>
                          <span class="alarm-popup__ai-review-value">{{ currentAlarm?.aiReview?.reviewedAt ? formatTime(currentAlarm.aiReview.reviewedAt) : '—' }}</span>
                          <template v-if="currentAlarm?.aiReview?.verifier && currentAlarm.aiReview.verifier !== 'none'">
                            <span class="alarm-popup__ai-review-label">复核引擎</span>
                            <span class="alarm-popup__ai-review-value">{{ currentAlarm.aiReview.verifier }}</span>
                          </template>
                          <template v-if="currentAlarm?.aiReview?.latencyMs">
                            <span class="alarm-popup__ai-review-label">耗时</span>
                            <span class="alarm-popup__ai-review-value">{{ currentAlarm.aiReview.latencyMs }}ms</span>
                          </template>
                        </div>
                        <div v-if="currentAlarm?.aiReview?.reason" class="alarm-popup__ai-review-row">
                          <span class="alarm-popup__ai-review-label">复核结论</span>
                          <span class="alarm-popup__ai-review-value alarm-popup__ai-review-value--wrap">{{ currentAlarm.aiReview.reason }}</span>
                        </div>
                      </div>
                    </div>
                    <!-- [P0-8 2026-09-04 人脸比对] 抓拍 vs 注册照并列对比 (大华式) -->
                    <div v-if="faceCompare" class="alarm-popup__detail-section">
                      <div class="alarm-popup__detail-section-title alarm-popup__accent-title">人脸比对</div>
                      <div class="alarm-popup__face-compare">
                        <div class="alarm-popup__face-compare-item">
                          <img :src="faceCompare.snapshot" alt="现场抓拍" />
                          <span>现场抓拍</span>
                        </div>
                        <div class="alarm-popup__face-compare-item">
                          <img v-if="faceCompare.enroll" :src="faceCompare.enroll" alt="注册照" />
                          <div v-else class="alarm-popup__face-compare-none">未注册</div>
                          <span>注册照片</span>
                        </div>
                        <div class="alarm-popup__face-compare-info">
                          <div class="alarm-popup__face-compare-sim">相似度: {{ faceCompare.similarityPct }}</div>
                          <div class="alarm-popup__face-compare-verdict" :class="{ 'is-known': faceCompare.known }">
                            判定: {{ faceCompare.verdict }}
                          </div>
                        </div>
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
                  </div>

                  <!-- 处警: 未处置 = 表单 + 确认处置; 已处置 = 只读 + 追加处警 -->
                  <div v-show="activeSecondaryTab === 'dispose'" class="alarm-popup__dispose">
                    <div class="alarm-popup__dispose-row alarm-popup__dispose-row--level">
                      <div>
                        <span class="alarm-popup__dispose-key">接警单号:</span>
                        <span class="alarm-popup__dispose-val">{{ receiverUnit }}</span>
                      </div>
                      <div>
                        <span class="alarm-popup__dispose-key">接警员:</span>
                        <span class="alarm-popup__dispose-val">{{ receiverName }}</span>
                      </div>
                    </div>
                    <!-- 编辑态: 未处置, 或已处置后点击「追加处警」进入 -->
                    <template v-if="!isDisposed || appendEditing">
                      <div class="alarm-popup__dispose-row alarm-popup__dispose-row--col">
                        <span class="alarm-popup__dispose-key alarm-popup__dispose-key--required">告警类型:</span>
                        <el-select v-model="disposeType" placeholder="请选择" size="small" class="alarm-popup__dispose-select" popper-class="alarm-popup__dispose-popper">
                          <el-option label="误报" value="false_alarm" />
                          <!-- [接警单号 2026-09-09] '真实告警'原值 true_positive 落库为筛选不可见的
                               非标准状态, 改用反馈同步路径同款 'confirmed' (recordFalseAlarmFeedback:
                               true_positive→confirmed), 状态筛选“已确认”可直接捕获 -->
                          <el-option label="真实告警" value="confirmed" />
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
                        <span class="alarm-popup__dispose-val">{{ originalNote }}</span>
                      </div>
                      <div class="alarm-popup__dispose-row">
                        <span class="alarm-popup__dispose-key">处置时间:</span>
                        <span class="alarm-popup__dispose-val">{{ formatTime(currentAlarm.handledAt || currentAlarm.createdAt) }}</span>
                      </div>
                    </template>
                    <!-- <div class="alarm-popup__dispose-section">
                      <div class="alarm-popup__dispose-section-title">追加信息</div>
                      <div v-if="!currentAlarm.appendLogs?.length" class="alarm-popup__dispose-row">
                        <span class="alarm-popup__dispose-val alarm-popup__dispose-val--muted">暂无追加信息</span>
                      </div>
                      <div v-for="(log, i) in currentAlarm.appendLogs" :key="i" class="alarm-popup__append-log">
                        <span class="alarm-popup__append-log-text">[{{ formatAppendTime(log) }}] {{ log.content }}</span>
                        <span v-if="log.by" class="alarm-popup__append-log-by">追加人: {{ log.by }}</span>
                      </div>
                      <div class="alarm-popup__dispose-row alarm-popup__dispose-row--col">
                        <span class="alarm-popup__dispose-key">追加内容:</span>
                        <el-input v-model="appendNoteInput" type="textarea" :rows="2" resize="none" placeholder="请输入追加信息" class="alarm-popup__dispose-textarea" />
                      </div>
                    </div> -->
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
              <div v-if="activeSecondaryTab === 'detail'" class="alarm-popup__detail-footer">
                <button
                  class="alarm-popup__dispose-entry"
                  :class="{ 'alarm-popup__dispose-entry--append': isDisposed }"
                  @click="activeSecondaryTab = 'dispose'"
                >{{ isDisposed ? '追加处警' : '处警' }}</button>
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
import EvidenceFrames from '@/components/EvidenceFrames.vue' // [POPUP-EV-MERGE 2026-09-07] 弹窗内已并入画廊, import 保留给未来复用 (无副作用)
import {
  popupVisible, currentAlarm, matchedRule, linkageLogs,
  currentPopupAutoCloseS,  // [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭秒数 (0=不启用)
  hasAction, dynamicButtons,
  queueInfo, nextAlarm, prevAlarm, handleAlarm as handleAlarmAction,
  appendAlarmNote, closePopup,
} from '@/composables/useAlarmPopup'
import { ACTION_TYPE_REVERSE_MAP } from '@/api/linkage'
import { alarmApi } from '@/api/alarm'
import { useAuthStore } from '@/stores/auth'  // [接警单号 2026-09-09] 处置提交带当前登录用户 (handled_by)
import { queryRecordings, toLocalISOString, recordUrlCandidates, type DeviceRecording } from '@/api/recording'
import { recordingHttp } from '@/api/http'
import { checkStreamAlive, stopStream } from '@/api/stream'
import { useObjectLabel, type ObjectLabelMeta } from '@/composables/useObjectLabel'
// [P0-14 2026-09-04 SSOT] 弹窗类型名优先走 canonical zh (与列表/规则页同源), 本地映射降为 fallback
import { useEventTypeZh } from '@/composables/useEventTypeZh'
import { useChannelStore } from '@/stores/channel'
// [AI 复核恢复 2026-09-10 P4] verdict 短标 (真事件/误报/未复核)
import { aiReviewVerdictLabel } from '@/types/alarm'
import { useRouter } from 'vue-router'
// [FLOOR-MAP 2026-09-03] 地图 Tab 真实渲染: 只读画布 + 通道反查 (复用共享缓存)
import FloorMapCanvas from '@/components/map/FloorMapCanvas.vue'
import { useFloorMap } from '@/composables/useFloorMap'
// [FIX dev-name-num 2026-09-11] 设备名称数字形态治理 (face 插件 channel_id 截断等历史数据)
import { resolveAlarmDeviceName } from '@/composables/useAlarmDeviceLabel'
import type { MapChannelPair, CameraMapBinding } from '@/types/floorMap'

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
//   数据源优先级: metadata.snapshot_urls[] > metadata.snapshot_urls_json > alarm.snapshotUrl/base64 兑底 1 张
// [POPUP-EV-MERGE 2026-09-07] 取证帧并入画廊: pre/mid/post_snapshot_url 追加在主快照后
//   (带语义角标), metadata 兼容数组/对象两形态 (DB 存数组, REST 部分路径 flatten);
//   与已有 URL 去重 (同一帧可能既是主快照又入 evidence)
interface GalleryImage { url: string; tag: string }
const imageIndex = ref(0)
const alarmImageList = computed<GalleryImage[]>(() => {
  const alarm = currentAlarm.value
  if (!alarm) return []
  const rawMeta = (alarm.metadata || {}) as unknown
  const metaSrc = Array.isArray(rawMeta) && rawMeta.length && typeof rawMeta[0] === 'object'
    ? rawMeta[0] as Record<string, unknown>
    : (rawMeta && typeof rawMeta === 'object' ? rawMeta as Record<string, unknown> : {})
  // [P0-8 2026-09-04 人脸比对] 场景图优先 (保留"场景+人"画面, 对标大华; 后端 face_detector 落盘)
  const scene = typeof metaSrc.scene_url === 'string' && metaSrc.scene_url ? metaSrc.scene_url : ''
  const direct = metaSrc.snapshot_urls as string[] | undefined
  let list: string[] = []
  if (Array.isArray(direct) && direct.length > 0) list = direct.filter(Boolean)
  else {
    const raw = metaSrc.snapshot_urls_json as string | undefined
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length > 0) list = arr.filter((u: unknown): u is string => typeof u === 'string' && !!u)
      } catch { /* 非法 JSON 忽略, 走单图兑底 */ }
    }
  }
  if (list.length === 0) {
    // [FIX bbox-align 2026-09-08] 检测对齐帧优先: metadata.snapshot_url (单数) 是
    //   推理同帧落盘 ([FIX F] 连续解码帧/快照推理帧), bbox 归一化基准与它严格
    //   对齐; 落库主快照 (snapshotImageUrl) 是告警链后另行抓帧 (实测滞后 3~5s,
    //   ZLM 主码流) — 走动目标上红框会漂移。对齐帧放首位, 落库帧次位供对比。
    const aligned = typeof metaSrc.snapshot_url === 'string' ? metaSrc.snapshot_url : ''
    const primary = snapshotImageUrl.value
    if (aligned && aligned !== primary) list = [aligned, primary].filter(Boolean)
    else if (primary) list = [primary]
  }
  const mainUrls = scene ? [scene, ...list] : list
  // [POPUP-EV-MERGE] 取证帧 (语义顺序 pre→mid→post, 与 EvidenceFrames 组件口径一致)
  const evidenceDefs: Array<[string, string]> = [
    ['pre_snapshot_url', '事前'],
    ['mid_snapshot_url', '事中'],
    ['post_snapshot_url', '事后'],
  ]
  const evidence: GalleryImage[] = []
  for (const [key, tag] of evidenceDefs) {
    const u = typeof metaSrc[key] === 'string' ? metaSrc[key] as string : ''
    if (u && !mainUrls.includes(u) && !evidence.some(e => e.url === u)) {
      evidence.push({ url: u, tag })
    }
  }
  return [...mainUrls.map(u => ({ url: u, tag: '' })), ...evidence]
})
const totalImageCount = computed(() => Math.max(1, alarmImageList.value.length))

// ── [P0-8 2026-09-04 人脸比对] 抓拍 vs 注册照对比 (大华式双图 + 相似度 + 名单判定) ──
const GROUP_TYPE_ZH: Record<string, string> = {
  whitelist: '白名单', blacklist: '黑名单', visitor: '访客',
  vip: 'VIP', staff: '员工', custom: '自定义', unknown: '陌生人', stranger: '陌生人',
}
const faceCompare = computed(() => {
  const alarm = currentAlarm.value
  if (!alarm) return null
  // 仅人脸系告警展示比对卡
  if (!String(alarm.type || '').startsWith('face')) return null
  const meta = (alarm.metadata || {}) as Record<string, unknown>
  const snap = snapshotImageUrl.value || String(meta.scene_url || '')
  if (!snap) return null
  const enroll = String(meta.enroll_photo_url || '')
  const sim = Number(meta.similarity ?? 0)
  const groupZh = GROUP_TYPE_ZH[String(meta.group_type || '').toLowerCase()] || ''
  const name = String(meta.name || meta.enroll_name || '')
  const pid = String(meta.person_id || '')
  const known = !!pid && pid !== 'unknown'
  const verdict = known ? `${groupZh || '已识别'}${name ? ' · ' + name : ''}` : '未命中名单'
  return { snapshot: snap, enroll, similarityPct: sim > 0 ? `${(sim * 100).toFixed(1)}%` : '-', verdict, known }
})
const currentSnapshotUrl = computed(() => alarmImageList.value[imageIndex.value]?.url || snapshotImageUrl.value)
watch(totalImageCount, (n) => { if (imageIndex.value >= n) imageIndex.value = Math.max(0, n - 1) })
watch(currentAlarm, () => { imageIndex.value = 0 })
function prevImage() { if (imageIndex.value > 0) imageIndex.value-- }
function nextImage() { if (imageIndex.value < totalImageCount.value - 1) imageIndex.value++ }

// ── 联动地图位置（GPS + 扇形 FOV + 平面/3D 切换） ──
const mapMode = ref<'plan' | '3d'>('3d')
// [FLOOR-MAP 2026-09-03] 真实平面图: channelId 反查绑定地图 (主图在前);
//   空结果负缓存 10s — 未绑定通道弹窗不重复打反查; 无绑定 → GPS 占位兑底不动
const { mapsByChannel: mapsByChannelQ, loadMaps: loadFloorMapsQ, bindingsOfMap } = useFloorMap()
const mapPairs = ref<MapChannelPair[]>([])
const activeMapIdx = ref(0)
const activeMapPair = computed<MapChannelPair>(() => mapPairs.value[activeMapIdx.value] || mapPairs.value[0])
const alarmChannelIdStr = computed(() => String(currentAlarm.value?.channelId || ''))
const alarmMetadataObj = computed<Record<string, unknown>>(() =>
  (currentAlarm.value?.metadata || {}) as Record<string, unknown>
)
/** 当前图全部摄像头绑定 (弹窗展示同图所有点位; 缓存 miss 时退化为仅当前告警通道) */
const activeMapBindings = computed(() => {
  const p = activeMapPair.value
  if (!p) return []
  const all = bindingsOfMap(p.map.id)
  return all.length ? all : [p.binding]
})

// ═══ [FLOOR-MAP 2026-09-05 v2] 平面图点位点击 → 联动预览跳转 (海康通道点击展开预览对标) ═══
// 点位点击后预览通道临时切换到该点位 (裸 20 位形态 — ZLM stream_id=gb_<裸>);
// 非摄像头设备无视频可跳, 提示即可; 告警切换/关闭时自动回归告警通道
const previewChannelOverride = ref('')
const previewChannelOverrideLabel = ref('')
const previewChannelId = computed(() =>
  previewChannelOverride.value || String(currentAlarm.value?.channelId || ''))
function onMapDeviceClick(b: CameraMapBinding) {
  if (b.device_type && b.device_type !== 'camera') {
    ElMessage.info(`${camDeviceLabel(b)} · 非视频设备, 无实时预览`)
    return
  }
  previewChannelOverride.value = b.channel_id.replace(/_ch\d+$/, '')
  previewChannelOverrideLabel.value = b.label || camLabelOf(b) || previewChannelOverride.value
  playerError.value = ''
  activePrimaryTab.value = 'preview'
}
function clearPreviewOverride() {
  previewChannelOverride.value = ''
  previewChannelOverrideLabel.value = ''
  playerError.value = ''
}
function camDeviceLabel(b: CameraMapBinding): string {
  const t = b.device_type || 'camera'
  const zh: Record<string, string> = {
    camera: '摄像头', access: '门禁', smoke: '烟感', radar: '雷达',
    sos: '紧急按钮', broadcast: '广播', rfid: 'RFID', environment: '温湿度',
  }
  return `${zh[t] || t}${b.label ? ' ' + b.label : ''}`
}
function camLabelOf(b: CameraMapBinding): string {
  return b.label || ''
}
watch(currentAlarm, (a) => {
  resetQueue()  // [POPUP-3MIN] 切告警重置连播队列 (播放源/进度清零, 由新告警 loadPlayback 重建)
  clearPreviewOverride()
  playbackFallbackUrls.value = []
  // [FIX rec-direct-layer 2026-09-11] 直显路径立即补层: 告警自带 video_clip_url 常为
  //   单层 /record/rtp/... (nginx 实测恒 404); 原逻辑要等 loadPlayback 证据接口返回
  //   才修成双层 → MiniPlayer 先用死链播 3~4s (404 请求 + :key 变化重建闪烁,
  //   run5 场景 b 实证 src 前 3 采样单层)。现弹窗一打开 (watch pre-flush, 早于首次
  //   渲染) 即补双层, MiniPlayer 首帧即双层直链; loadPlayback 后续赋同值幂等。
  const u = a?.videoClipUrl
  if (u) {
    const cands = recordUrlCandidates(u)
    if (cands.length && cands[0] !== u) {
      playbackFallbackUrls.value = cands.slice(1)
      a.videoClipUrl = cands[0]
    }
  }
})

watch(currentAlarm, async (a) => {
  activeMapIdx.value = 0
  mapPairs.value = []
  const ch = String(a?.channelId || '')
  if (!ch) return
  try {
    const pairs = await mapsByChannelQ(ch)
    // 弹窗已切到下一条告警 → 丢弃过期结果
    if (String(currentAlarm.value?.channelId || '') !== ch) return
    mapPairs.value = pairs
    if (pairs.length) {
      // [FLOOR-MAP 2026-09-04] 触发即定位 (海康 iVMS-8700 对标): 有平面图绑定的告警
      //   弹窗自动切 plan 模式聚焦落点涟漪 (无 bbox 时画面中心兜底亦有落点);
      //   用户手动切 3d 后, 下一条新告警再次自动定位 — 每条告警重置一次, 不覆盖用户操作中的切换
      mapMode.value = 'plan'
      loadFloorMapsQ().catch(() => {})  // 预热全量缓存 (同图全部点位)
    }
  } catch { /* 反查失败 → GPS 占位兑底 */ }
}, { immediate: true })
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
const auth = useAuthStore()
const disposeType = ref<string>('')
const appendNoteInput = ref('')
const appending = ref(false)
/** [接警单号 2026-09-09] 原 UI 原型硬编码 '1231' (所有告警同号) → 后端 handle 时
 *  自动生成落库 ticket_id 列 (JJ+时间戳+毫秒), 列表 SELECT 经 metadata 治理回填,
 *  normalizeAlarmCore 四源透出; 未处置告警尚无接警单, 显示 '-' */
const receiverUnit = computed(() => currentAlarm.value?.ticketId || '-')
const receiverName = computed(() => currentAlarm.value?.handledBy || '值班人')
// [POPUP-DISPOSE-STATE 2026-09-03] 已处置状态 → 只读展示 + 「追加处警」按钮; 未处置 → 表单 + 「确认处置」
const isDisposed = computed(() => !!currentAlarm.value?.status && currentAlarm.value.status !== 'unhandled')
const appendEditing = ref(false)
const disposeTypeLabel = computed(() => {
  switch (disposeType.value) {
    case 'false_alarm': return '误报'
    // 'true_positive' 历史库值兼容: 新提交已改用 'confirmed' (与反馈同步路径 status 对齐)
    case 'confirmed': case 'true_positive': return '真实告警'
    case 'unsure': return '存疑'; case 'known': return '已知事件'
    default: return disposeType.value || '-'
  }
})
watch(currentAlarm, (a) => {
  disposeType.value = a?.status && a.status !== 'unhandled' ? a.status : ''
  appendEditing.value = false
})
/** [FIX 2026-09-09] await 真实结果: 原实现无 await, 后端失败也弹“已确认处置”假成功
 *  (store.handleAlarm 失败时弹错误提示, 此处不再叠加成功 toast);
 *  成功提示统一由 store 弹 (statusLabels), 此处仅收起追加编辑态 */
async function confirmDispose() {
  if (!disposeType.value || !currentAlarm.value) return
  const ok = await handleAlarmAction(
    disposeType.value as any,
    handleNote.value || undefined,
    auth.username || undefined,
  )
  if (ok) appendEditing.value = false
}

// ── [追加信息 2026-09-09] 已处置告警追加处警信息 ──
//   disposition 追加后为多行全文 (原备注 + [追加 ...] 行), 只读区"误报备注"
//   仅显示原处置记录, 追加行在下方追加信息区结构化展示 (独立表回填)。
const originalNote = computed(() => {
  const full = currentAlarm.value?.handleNote || ''
  if (full.startsWith('[追加 ')) return '-'  // 原备注为空, 全是追加行
  const idx = full.indexOf('\n[追加 ')
  return idx >= 0 ? full.slice(0, idx) : (full || '-')
})
function formatAppendTime(log: { time?: string; timeMs?: number }): string {
  if (log.time) return log.time
  if (log.timeMs) {
    const d = new Date(log.timeMs)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
  return '-'
}
async function confirmAppend() {
  if (!appendNoteInput.value.trim() || appending.value) return
  appending.value = true
  try {
    const ok = await appendAlarmNote(appendNoteInput.value)
    if (ok) {
      appendNoteInput.value = ''   // 清空输入框
      appendEditing.value = false  // 关闭追加编辑态
      ElMessage.success('已追加信息')
    }
  } finally {
    appending.value = false
  }
}

// ── [POPUP-3MIN 2026-09-11] 联动回放: 事件前后各 1.5 分钟 (共 3 分钟) 自动连播 ──
//   规格 (用户反馈): 打开「联动回放」tab 直接播放 T-90s ~ T+90s, 取代 6 月引入的
//   「找到 N 段录像, 点击播放」人工选片列表。设备 ZLM 录像为 60s 切片
//   (mp4_max_second=60) → 3 分钟 = 3~4 片连播: 首片 seek 到 T-90s 片内偏移,
//   片间由 MiniPlayer @ended 推进, 末片播到 T+90s 截止 (0.5s 容差内视为播全片)。
const CLIP_HALF_MS = 90_000        // 事件前后各 1.5 分钟
const CLIP_QUERY_PAD_MS = 150_000  // 查询窗口前后各 2.5 分钟 (含片边界余量)
interface PlaybackQueueItem { url: string; seekStart: number; stopAt?: number; rec: DeviceRecording }
const deviceRecordings = ref<DeviceRecording[]>([])
const recordingsLoading = ref(false)
// [POPUP-PLAYBACK 2026-09-11] 回放候选链的尾部回退 (MiniPlayer src 逐个尝试)
const playbackFallbackUrls = ref<string[]>([])
// [POPUP-3MIN] 连播状态机: queueSrc=当前段播放源, queueSeekStart/queueStopAt=当前段裁剪点;
//   queueEpoch 在重播时自增, 强制 MiniPlayer 重建 (同 URL 重播也重新触发).
const playbackQueue = ref<PlaybackQueueItem[]>([])
const queueIndex = ref(0)
const queueActive = ref(false)
const queueFinished = ref(false)
const queueSrc = ref('')
const queueSeekStart = ref(0)
const queueStopAt = ref<number | undefined>(undefined)
const queueEpoch = ref(0)
// [FIX pb-skip 2026-09-12] 失败段自动跳过计数 (onPlaybackError): 进度行提示
//   「已跳过 N 段」; 新队列/重播/tab 重入时归零
const skippedSegments = ref(0)
// [POPUP-3MIN] 播放源优先级: 连播队列 > clip 直显; 且仅在「联动回放」tab 激活时输出 —
//   避免弹窗打开 (默认联动预览 tab) 时后台空播, 切到回放 tab 才从头 (T-90s) 开始.
const playerSrc = computed(() => {
  if (activePrimaryTab.value !== 'playback') return ''
  if (queueActive.value && queueSrc.value) return queueSrc.value
  return currentAlarm.value?.videoClipUrl || ''
})
// [POPUP-3MIN] 回放区间提示 (播放器下方进度条): "HH:mm:ss ~ HH:mm:ss"
const queueRangeLabel = computed(() => {
  const a = currentAlarm.value
  if (!a) return ''
  const t = new Date(a.createdAt).getTime()
  if (!Number.isFinite(t)) return ''
  const f = (ms: number) => {
    const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
  return `${f(t - CLIP_HALF_MS)} ~ ${f(t + CLIP_HALF_MS)}`
})

function parseRecTime(s: string): number {
  if (!s) return NaN
  return new Date(String(s).replace(' ', 'T')).getTime()
}
// [POPUP-3MIN] ZLM 本地片直链 (后端口径: url 已是双层 /record/record/...; id 为磁盘
//   绝对路径时转换同款双层); 非本地片 (GB28181 条目) 返回 '' 不参与连播.
function recordingDirectUrl(rec: DeviceRecording): string {
  const u = String(rec.url || '')
  if (u.startsWith('/record/') || /^https?:\/\//.test(u)) return u
  return recordingMp4DirectUrl(rec)
}
// [POPUP-3MIN] 构建 [T-90s, T+90s] 连播队列: 与窗口相交的直链片按时间升序 +
//   首片 seekStart / 末片 stopAt 裁剪点.
function buildPlaybackQueue(recs: DeviceRecording[]): PlaybackQueueItem[] {
  const alarm = currentAlarm.value
  if (!alarm) return []
  const t = new Date(alarm.createdAt).getTime()
  if (!Number.isFinite(t)) return []
  const from = t - CLIP_HALF_MS, to = t + CLIP_HALF_MS
  return recs
    .map((r) => ({ r, url: recordingDirectUrl(r), rs: parseRecTime(r.start_time), re: parseRecTime(r.end_time) }))
    .filter((x) => x.url && Number.isFinite(x.rs) && Number.isFinite(x.re) && x.rs < to && x.re > from)
    .sort((a, b) => a.rs - b.rs)
    .map((x) => {
      const full = (x.re - x.rs) / 1000
      const seekStart = Math.max(0, (from - x.rs) / 1000)
      const stopRaw = Math.min(full, (to - x.rs) / 1000)
      const stopAt = stopRaw < full - 0.5 ? Math.max(seekStart + 1, stopRaw) : undefined
      return { url: x.url, seekStart, stopAt, rec: x.r }
    })
}
// [POPUP-3MIN] GB28181 (NVR) 兜底: 无法多片连播时自动播覆盖事件时刻的那片
function pickCoveringRecording(recs: DeviceRecording[], tMs: number): DeviceRecording | null {
  if (!recs.length || !Number.isFinite(tMs)) return null
  const scored = recs.map((r) => {
    const rs = parseRecTime(r.start_time), re = parseRecTime(r.end_time)
    if (!Number.isFinite(rs) || !Number.isFinite(re)) return { r, covers: 0, dist: Number.MAX_SAFE_INTEGER }
    const covers = rs <= tMs && tMs < re ? 1 : 0
    const dist = tMs < rs ? rs - tMs : (tMs >= re ? tMs - re : 0)
    return { r, covers, dist }
  }).sort((a, b) => (b.covers - a.covers) || (a.dist - b.dist))
  return scored[0]?.r ?? null
}
function playQueueItem(i: number) {
  const item = playbackQueue.value[i]
  if (!item) return
  queueIndex.value = i
  const cands = recordUrlCandidates(item.url)
  const src = cands[0] || item.url
  playbackFallbackUrls.value = cands.slice(1)
  queueSeekStart.value = item.seekStart
  queueStopAt.value = item.stopAt
  queueSrc.value = src
}
function startQueuePlayback(items: PlaybackQueueItem[]) {
  playbackQueue.value = items
  queueIndex.value = 0
  queueFinished.value = false
  queueActive.value = true
  skippedSegments.value = 0
  tailRefreshes = 0
  playQueueItem(0)
  stopRecordingPoll()  // 连播接管后无需再等 clip 回填
}
function replayQueue() {
  if (!playbackQueue.value.length) return
  queueEpoch.value++
  queueFinished.value = false
  skippedSegments.value = 0
  tailRefreshes = 0
  stopTailRefresh()
  playQueueItem(0)
}
function onPlaybackEnded() {
  if (!queueActive.value) return
  const next = queueIndex.value + 1
  if (next < playbackQueue.value.length) { playQueueItem(next); return }
  queueFinished.value = true
  maybeRefreshQueueTail()
}
// [FIX pb-skip 2026-09-12] 段播放失败兜底 (越界检测告警 014ee3e0 联动回放死局):
//   播放 tab 原未监听 MiniPlayer @error — 任一段候选链全败 (显示「回放地址不
//   可用 · 已尝试全部格式」) 后队列永久卡死: 不跳过坏段 / 不推进后续段 / 无重播
//   入口, 用户只能关闭弹窗重开。现失败段自动跳过继续连播 (末段失败 → 同「已播
//   完」态挂「重播」入口); 跳过计数在进度行提示, 失败段 URL 打 console 供取证。
function onPlaybackError() {
  if (!queueActive.value) return
  const cur = playbackQueue.value[queueIndex.value]
  console.warn('[AlarmPopup] segment playback failed, skip:', queueIndex.value + 1,
    '/', playbackQueue.value.length, cur?.url)
  skippedSegments.value++
  const next = queueIndex.value + 1
  if (next < playbackQueue.value.length) { playQueueItem(next); return }
  queueFinished.value = true
  maybeRefreshQueueTail()
}
// [POPUP-3MIN] 尾部补片: 告警新鲜时片仍在完成中 (实测新片最迟 T+92s 可见), 队列可能
//   缺尾段; 播完现有段后每 8s 补查一次 (≤6 次且告警 5 分钟内), 补到即自动续播.
let tailRefreshes = 0
let tailTimer: ReturnType<typeof setTimeout> | null = null
function stopTailRefresh() { if (tailTimer) { clearTimeout(tailTimer); tailTimer = null } }
function resetQueue() {
  playbackQueue.value = []
  queueIndex.value = 0
  queueActive.value = false
  queueFinished.value = false
  skippedSegments.value = 0
  queueSrc.value = ''
  queueSeekStart.value = 0
  queueStopAt.value = undefined
  tailRefreshes = 0
  stopTailRefresh()
}
function maybeRefreshQueueTail() {
  const alarm = currentAlarm.value
  if (!alarm || tailRefreshes >= 6) return
  const t = new Date(alarm.createdAt).getTime()
  if (!Number.isFinite(t) || Date.now() > t + 300_000) return
  const last = playbackQueue.value[playbackQueue.value.length - 1]
  const coveredTo = last ? parseRecTime(last.rec.end_time) : NaN
  if (Number.isFinite(coveredTo) && coveredTo >= t + CLIP_HALF_MS - 15_000) return
  tailRefreshes++
  stopTailRefresh()
  tailTimer = setTimeout(() => { void refreshQueueTail() }, 8000)
}
async function refreshQueueTail() {
  const alarm = currentAlarm.value
  if (!alarm?.deviceId) return
  const alarmId = alarm.id
  const t = new Date(alarm.createdAt).getTime()
  try {
    const recs = await queryRecordings({
      device_id: alarm.deviceId,
      channel_id: alarm.channelId || undefined,
      start_time: toLocalISOString(new Date(t - CLIP_QUERY_PAD_MS)),
      end_time: toLocalISOString(new Date(t + CLIP_QUERY_PAD_MS)),
    })
    if (currentAlarm.value?.id !== alarmId) return  // 补查期间已切告警
    const items = buildPlaybackQueue(recs)
    const seen = new Set(playbackQueue.value.map((i) => i.url))
    const fresh = items.filter((i) => !seen.has(i.url))
    if (fresh.length) {
      playbackQueue.value = [...playbackQueue.value, ...fresh]
      if (queueFinished.value) {  // 播完等待中 → 补到的段直接续播
        queueFinished.value = false
        playQueueItem(playbackQueue.value.length - fresh.length)
      }
    }
  } catch { /* 补片失败下轮再试 */ }
  maybeRefreshQueueTail()
}
// [POPUP-3MIN] 切回「联动回放」tab → 从头 (T-90s) 重播, 保证完整回看 3 分钟.
watch(activePrimaryTab, (t, prev) => {
  if (t === 'playback' && prev !== 'playback' && queueActive.value && playbackQueue.value.length) {
    queueFinished.value = false
    skippedSegments.value = 0
    playbackFallbackUrls.value = []
    playQueueItem(0)
  }
})

function loadPlayback() {
  if (!currentAlarm.value?.id) return
  recordingsLoading.value = true
  deviceRecordings.value = []
  alarmApi.getEvidence(currentAlarm.value.id).then((ev: any) => {
    if (ev?.videoClipUrl) {
      // [FIX rec-layer 2026-09-11] 证据接口 video_clip.url 是单层 /record/rtp/... (实测
      //   播放恒 404）；经 recordUrlCandidates 补齐双层同源作首选，失败链兜底。
      const cands = recordUrlCandidates(ev.videoClipUrl)
      // [FIX pb-fb-race 2026-09-12] 队列已接管时候选链归 playQueueItem 按当前段维护,
      //   证据回调异步晚到不得覆盖 (原无条件覆盖会盖掉队列段的 :8088 兜底候选)
      if (!queueActive.value) playbackFallbackUrls.value = cands.slice(1)
      currentAlarm.value!.videoClipUrl = cands[0]
    }
    if (ev?.snapshotUrl && !currentAlarm.value!.snapshotUrl) currentAlarm.value!.snapshotUrl = ev.snapshotUrl
  }).catch(() => {}).finally(() => { recordingsLoading.value = false })
  if (currentAlarm.value.deviceId) {
    const alarmId = currentAlarm.value.id
    const t = new Date(currentAlarm.value.createdAt)
    // [POPUP-3MIN] 查询窗口收紧为前后各 2.5 分钟 (原 ±1h): 只需覆盖 3 分钟回放区间
    queryRecordings({
      device_id: currentAlarm.value.deviceId,
      channel_id: currentAlarm.value.channelId || undefined,
      start_time: toLocalISOString(new Date(t.getTime() - CLIP_QUERY_PAD_MS)),
      end_time: toLocalISOString(new Date(t.getTime() + CLIP_QUERY_PAD_MS)),
    }).then((recs) => {
      if (currentAlarm.value?.id !== alarmId) return  // 查询期间已切告警
      deviceRecordings.value = recs
      const items = buildPlaybackQueue(recs)
      if (items.length) {
        // [POPUP-3MIN] 有相交片 → 自动连播 3 分钟 (取代人工选片列表)
        if (!queueActive.value) startQueuePlayback(items)
        return
      }
      // 无本地片 → GB28181 兜底: 自动播覆盖事件时刻的那片 (NVR 场景无法多片连播)
      const covering = pickCoveringRecording(recs, t.getTime())
      if (covering && !currentAlarm.value!.videoClipUrl && !queueActive.value) {
        void playSelectedRecording(covering, { silent: true })
      }
    }).catch(() => {})
  }
}
// [POPUP-PLAYBACK 2026-09-11] GB28181 设备录像 id 即磁盘绝对路径
//   (/data/shield/record/record/rtp/...mp4); nginx ^~ /record/ alias
//   /data/shield/record/ 静态直发 (206 Range + video/mp4 真机实测)
//   → 可作浏览器直链兜底 (设备回放流失败时仍能播本地录像文件)
function recordingMp4DirectUrl(rec: DeviceRecording): string {
  const id = String(rec?.id || '')
  if (!id.startsWith('/data/shield/record/') || !/\.mp4$/i.test(id)) return ''
  return '/record/' + id.slice('/data/shield/record/'.length)
}

// [POPUP-PLAYBACK 2026-09-11] 黑屏修复: 原实现直取 result.urls.flv 原文
//   (后端 ZLM 绝对地址 http://127.0.0.1:9080 = 设备本机 → 浏览器中指向用户
//   自己的电脑, 死链) 且固定 flv 优先 (flv.js 不支持 H265), 全链无容错。
//   现候选链委交 MiniPlayer src 模式: 统一归一化 + 逐候选回退:
//   flv → hls → wsFlv → 录像文件直链 (mp4, 任何浏览器可走原生媒体栈);
//   设备离线/回放流启动失败 (5002) 直接落直链, 无直链才明确报错。
async function playSelectedRecording(rec: DeviceRecording, opts?: { silent?: boolean }) {
  const silent = opts?.silent === true  // [POPUP-3MIN] GB28181 兜底自动播放时不弹 toast
  playbackFallbackUrls.value = []
  const mp4Direct = recordingMp4DirectUrl(rec)
  // [FIX rec-play-url 2026-09-11] 磁盘路径 id (/data/shield/...) 无法拼 /play:
  //   `/${id}/play` → `//data/shield/...` 被浏览器按 protocol-relative URL 解析
  //   (host="data") → ERR_NAME_NOT_RESOLVED + "网络连接异常" 噪音 (探针实证)。
  //   本地 zlm 录像 → 跳过 /play 直接走直链候选链 (双层同源 nginx 206)。
  if (mp4Direct) {
    const cands = recordUrlCandidates(mp4Direct)
    playbackFallbackUrls.value = cands.slice(1)
    currentAlarm.value!.videoClipUrl = cands[0]
    if (!silent) ElMessage.info('已切换到录像文件直链播放')
    return
  }
  try {
    const { data } = await recordingHttp.post(`/${rec.id}/play`, {
      device_id: rec.device_id, channel_id: rec.channel_id,
      start_time: rec.start_time, end_time: rec.end_time,
    })
    const result = data?.data || data
    if (result?.urls) {
      // [FIX rec-layer 2026-09-11] mp4 兜底直链同样经候选链展开 (双层同源优先)
      const mp4Cands = mp4Direct ? recordUrlCandidates(mp4Direct) : []
      const cands = [result.urls.flv, result.urls.hls, result.urls.wsFlv, ...mp4Cands]
        .filter((u): u is string => !!u)
      if (cands.length) {
        playbackFallbackUrls.value = cands.slice(1)
        currentAlarm.value!.videoClipUrl = cands[0]
      } else ElMessage.warning('无可用播放地址')
    } else if (mp4Direct) {
      currentAlarm.value!.videoClipUrl = mp4Direct
      if (!silent) ElMessage.info('设备不支持回放流，已切换录像文件直链')
    } else if (!silent) ElMessage.warning('设备不支持回放')
  } catch (e: any) {
    const body = e?.response?.data
    const msg: string = body?.message || body?.error || e?.message || ''
    if (mp4Direct) {
      // 设备离线 / 回放流启动失败 → 磁盘录像直链兜底 (不再黑屏)
      // [FIX rec-layer 2026-09-11] 直链经候选链展开: 同源双层首选 + 8088 双层兜底
      const cands = recordUrlCandidates(mp4Direct)
      playbackFallbackUrls.value = cands.slice(1)
      currentAlarm.value!.videoClipUrl = cands[0]
      if (!silent) ElMessage.info('设备回放流不可用，已切换录像文件直链播放')
      console.warn('[AlarmPopup] /play 失败落直链:', msg)
    } else if (!silent) {
      ElMessage.error('回放失败: ' + (msg || '设备可能离线'))
    }
  }
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
    if (queueActive.value) { stopRecordingPoll(); return }  // [POPUP-3MIN] 连播已接管
    const alarmId = currentAlarm.value.id
    try {
      // [POPUP-3MIN 2026-09-11] 先探连播队列 (录像片就绪即接管 3 分钟回放), 再退 clip 直显
      const alarm = currentAlarm.value
      if (alarm.deviceId) {
        const t = new Date(alarm.createdAt).getTime()
        const recs = await queryRecordings({
          device_id: alarm.deviceId,
          channel_id: alarm.channelId || undefined,
          start_time: toLocalISOString(new Date(t - CLIP_QUERY_PAD_MS)),
          end_time: toLocalISOString(new Date(t + CLIP_QUERY_PAD_MS)),
        })
        if (currentAlarm.value?.id !== alarmId) return
        const items = buildPlaybackQueue(recs)
        if (items.length) { startQueuePlayback(items); return }
      }
      const ev = await alarmApi.getEvidence(alarmId)
      if (currentAlarm.value?.id !== alarmId) return
      if (ev?.videoClipUrl) {
        playbackFallbackUrls.value = []
        currentAlarm.value.videoClipUrl = ev.videoClipUrl
        stopRecordingPoll()
      }
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
  // [FLOOR-MAP 2026-09-05 v2] 按预览实际通道判断 (点位点击 override 后与告警通道不同;
  //   原按告警通道判断会在 override 时误判"复用中"而跳过 start → 播放失败)
  const chId = previewChannelId.value
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
const { ensure: ensureEventTypes, zh: eventTypeZh } = useEventTypeZh()
ensureEventTypes()
// [FIX dev-name-num 2026-09-11] 设备名称: 空名/纯数字形态 (历史 int32 截断 hash) → 目录反查
//   设备/通道名; 反查不中返回 '' → 模板兜底 '-' (不再裸显 deviceId 数字串)
const resolvedDeviceName = computed(() => {
  const a = currentAlarm.value
  if (!a) return ''
  return resolveAlarmDeviceName(a.deviceName, a.deviceId, a.channelId)
})
// [FIX-P0-1/P1-2 2026-09-12] 目标轨迹 + 合并计数 (后端 track_id/aggregated_count,
//   归一化于 AlarmEvent): track>=0 才展示轨迹行; 计数 >1 才展示合并行
const mergedCount = computed(() => {
  const n = Number(currentAlarm.value?.aggregatedCount ?? 1)
  return Number.isFinite(n) && n > 1 ? n : 1
})
const currentTrackId = computed(() => {
  const n = Number(currentAlarm.value?.trackId ?? -1)
  return Number.isFinite(n) ? n : -1
})
const alarmTypeLabel = computed(() => {
  const t = currentAlarm.value?.type || ''
  if (!t) return '告警'
  // [P0-14] canonical SSOT 优先 (113 事件类型 zh 名), 本地映射兜底
  const viaCanonical = eventTypeZh(t)
  if (viaCanonical && viaCanonical !== t) return viaCanonical
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

// ── [AI 复核恢复 2026-09-10 P4] 图片 Tab AI 复核卡片数据 ──
const aiReviewTagKind = computed(() => {
  const v = currentAlarm.value?.aiReview?.verdict
  if (v === 'confirmed') return 'success'
  if (v === 'retracted') return 'danger'
  return 'info'
})
const aiReviewConfidenceText = computed(() => {
  const c = currentAlarm.value?.aiReview?.confidence
  return c && c > 0 ? `${Math.round(c * 100)}%` : '—'
})

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
const alarmHeaderColor = computed(() => {
  switch (currentAlarm.value?.level) {
    case 'critical': return '#FF3D71'
    case 'high': return '#FF6B35'
    case 'medium': return '#FFB800'
    default: return '#00D4AA'
  }
})

const popupBbox = computed<number[]>(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  // [FIX 2026-09-04] AlarmDispatcher 直报链 (尾随/聚集/入侵等行为插件)
  //   metadata 为数组 [{bbox,...}]: normalize 展开后成 {0:{...}} —
  //   m.bbox/m.detections 均取不到 → 弹窗快照标注恒空 (真机 tailgate
  //   bbox=[0.53,0.51,0.66,0.99] 已落库但弹窗无框实锚)。数组形态取首元素,
  //   与 EventsView 兜底口径对齐。
  const src = ((m[0] && typeof m[0] === 'object') ? m[0] : m) as Record<string, unknown>
  let b = src.bbox as number[] | undefined
  // [FIX face_box 2026-09-08 R3] 人脸链字段兑底: face_detector metadata 用
  //   face_box [x1,y1,x2,y2] 归一 (基准=scene_url 场景图, 画廊已置首位);
  //   无此兑底实时弹窗人脸告警恒无框。
  if (!Array.isArray(b) || b.length < 4) {
    b = src.face_box as number[] | undefined
  }
  if (Array.isArray(b) && b.length >= 4) return b
  const det = (Array.isArray(src.detections) ? src.detections[0] : null) as Record<string, unknown> | null
  const cand = det ?? src
  if (['x1', 'y1', 'x2', 'y2'].every((k) => typeof cand[k] === 'number')) {
    return [cand.x1 as number, cand.y1 as number, cand.x2 as number, cand.y2 as number]
  }
  return []
})
const popupDetections = computed<any[]>(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  const src = ((m[0] && typeof m[0] === 'object') ? m[0] : m) as Record<string, unknown>
  return Array.isArray(src.detections) ? (src.detections as any[]) : []
})
const popupTargetLabel = computed(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  const src = ((m[0] && typeof m[0] === 'object') ? m[0] : m) as Record<string, unknown>
  return (src.targetLabel as string) || (src.target_label as string) || (src.class_name as string) || ''
})
/** [FEAT 2026-09-04 告警自包含] 插件上报时冻结的区域形状快照 (当时生效几何,
 *  区域库后续增删不影响历史告警取证), 传给 AlarmSnapshot 最高优先级消费 */
const popupAlarmShapes = computed<unknown[]>(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  const src = ((m[0] && typeof m[0] === 'object') ? m[0] : m) as Record<string, unknown>
  return Array.isArray(src.alarm_shapes) ? (src.alarm_shapes as unknown[]) : []
})
/** [FEAT 2026-09-04] 触发算法 id (形状叠加区域库回退链匹配键) */
const popupAlgoId = computed(() => {
  const m = (currentAlarm.value?.metadata || {}) as Record<string, unknown>
  const src = ((m[0] && typeof m[0] === 'object') ? m[0] : m) as Record<string, unknown>
  return String(src.algo_id ?? src.algoId ?? '')
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
    // [POPUP-3MIN 2026-09-11] 连播接管期间不切播放源 (队列已含覆盖片, 避免打断 3 分钟回看)
    if (!queueActive.value) {
      cur.videoClipUrl = detail.videoClipUrl
      if (activePrimaryTab.value === 'preview' || activePrimaryTab.value === 'image') activePrimaryTab.value = 'playback'
    }
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
  stopTailRefresh()  // [POPUP-3MIN] 连播尾段补片定时器
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
  border: 1px solid var(--alarm-header-color, #F93A55);
  border-radius: 8px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  display: flex; flex-direction: column;
  overflow: hidden;
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif;
  color: #fff;
}
.alarm-flash {
  /*animation: alarm-flash-anim 1.2s ease-out 1;*/
}
@keyframes alarm-flash-anim {
    0%   { box-shadow: 0 0 0 0 rgba(var(--alarm-header-rgb, 249, 58, 85), 0.6); }
    60%  { box-shadow: 0 0 0 24px rgba(var(--alarm-header-rgb, 249, 58, 85), 0); }
    100% { box-shadow: 0 0 0 0 rgba(var(--alarm-header-rgb, 249, 58, 85), 0); }
}

/* ── 顶栏: 红色短标题 + 倒计时 + ✕ ── */
.alarm-popup__header {
  height: 44px;
  flex: 0 0 44px;
  color: #fff;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 10px;
  background: linear-gradient(90deg, var(--alarm-header-color, #F93A55) 0%, #050E30 100%);
}
.alarm-popup__title {
  font-size: 18px; font-weight: 400;
}
/* [FIX camera-icon 2026-09-06] 顶栏摄像头图标: 随标题色, 微降饱和 */
.alarm-popup__title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.alarm-popup__title-icon {
  opacity: 0.9;
  flex: none;
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
  color: #00B2FD;
  border: 1px solid transparent;
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
  background: #050E30;
  display: flex; align-items: stretch;
}
.alarm-popup__tab {
  flex: 0 0 auto;
  min-width: 88px;
  padding: 0 24px;
  display: flex; align-items: center; justify-content: center;
  color: #AADDFF;
  font-size: 15px;
  cursor: pointer;
  position: relative;
  user-select: none;
}
.alarm-popup__tab:hover { color: #00FFFF; }
.alarm-popup__tab--active {
  color: #00FFFF;
  font-weight: 600;
}
.alarm-popup__tab--active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
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
  /* border-left: 1px solid #e4e7ed; */
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
/* [FLOOR-MAP 2026-09-05 v2] 平面图点位预览来源标签 (点位点击跳预览) */
.alarm-popup__preview-src-tag {
  position: absolute; top: 10px; left: 10px;
  z-index: 2;
  display: flex; align-items: center; gap: 8px;
  padding: 2px 10px;
  background: rgba(5, 14, 48, 0.85);
  border: 1px solid #F4B400;
  border-radius: 4px;
  color: #F4B400;
  font-size: 11px;
}
.alarm-popup__preview-src-back {
  color: #00E5FF;
  cursor: pointer;
  text-decoration: underline;
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
/* [POPUP-3MIN 2026-09-11] 连播进度提示条 (替代原人工选片列表) */
.alarm-popup__queue-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 0 0 auto;
  margin-top: 8px;
  padding: 5px 10px;
  font-size: 12px;
  color: #8B8FA3;
  background: rgba(0, 229, 255, 0.06);
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
}
.alarm-popup__queue-replay {
  color: #00E5FF;
  cursor: pointer;
  user-select: none;
}
.alarm-popup__queue-replay:hover { text-decoration: underline; }

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
  width: 100%;
  /* [AI 复核恢复 2026-09-10] 原 height:100% 独占 pane; 改 flex 自适应后
     图片下方为 AI 复核卡片让出空间 (pane 为 flex column) */
  flex: 1 1 auto;
  min-height: 0;
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
  position: relative;
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
/* [POPUP-EV-MERGE 2026-09-07] 取证帧缩略图: 青色边框区分主快照 + 语义角标 */
.alarm-popup__thumb--evidence {
  border-color: #1C6E8C;
}
.alarm-popup__thumb-tag {
  position: absolute; left: 0; right: 0; bottom: 0;
  font-size: 9px; line-height: 12px;
  color: #9BE8FF;
  background: rgba(5, 30, 60, 0.85);
  text-align: center;
  border-radius: 0 0 3px 3px;
  pointer-events: none;
}
.alarm-popup__thumbs-counter {
  font-size: 11px; color: #00E5FF;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── 联动地图位置 ── */
.alarm-popup__map {
  width: 100%; height: 100%;
  /* background: linear-gradient(135deg, #1F2D4A 0%, #2A3F66 50%, #1F2D4A 100%); */
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
/* ── [FLOOR-MAP 2026-09-03] 真实平面图渲染 (plan + 已绑定) ── */
.alarm-popup__map-live {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
}
.alarm-popup__map-floors {
  display: flex; gap: 4px;
  padding: 8px 8px 0;
  flex-shrink: 0;
}
.alarm-popup__map-floor {
  padding: 3px 12px;
  background: rgba(5, 14, 48, 0.78);
  border: 1px solid #3A5A8C;
  border-radius: 3px;
  color: #B7CDE6; font-size: 12px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
}
.alarm-popup__map-floor.is-active {
  border-color: #00E5FF;
  color: #00E5FF;
}
.alarm-popup__map-floor-primary {
  padding: 0 4px;
  background: rgba(0, 229, 255, 0.18);
  border-radius: 2px;
  font-size: 10px;
}
.alarm-popup__map-livecanvas {
  flex: 1;
  min-height: 0;
  margin: 8px;
  border-radius: 4px;
  overflow: hidden;
}
.alarm-popup__map-livecoords {
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px 34px;   /* 避开右下角视图切换器 */
  justify-content: flex-end;
  color: #B7CDE6; font-size: 12px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.alarm-popup__map-switcher {
  position: absolute; right: 12px; bottom: 12px;
  display: flex; gap: 6px;
  z-index: 3;
}
.alarm-popup__map-thumb {
  position: relative;
  width: 44px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(5, 14, 48, 0.78);
  border: 1px solid #3A5A8C;
  border-radius: 3px;
  color: #B7CDE6;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
/* [FLOOR-MAP 2026-09-04] plan 缩略图红点: 有平面图绑定但当前在 3d 视图时提示可切回 */
.alarm-popup__map-thumb--dot::after {
  content: '';
  position: absolute; top: 3px; right: 3px;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #00E5FF;
  box-shadow: 0 0 4px rgba(0, 229, 255, 0.9);
}
.alarm-popup__map-thumb:hover { border-color: #00E5FF; color: #00E5FF; }
.alarm-popup__map-thumb--active {
  border-color: #00E5FF;
  border-width: 2px;
  color: #00E5FF;
}

/* ── 右侧: 二级 Tab (详情/处警) ── */
.alarm-popup__side-tabs {
  flex: 0 0 360px;
  margin-left: auto;
  background: #fff;
  display: flex; align-items: stretch; justify-content: flex-start;
  padding: 0 14px;
  gap: 28px;
  border-left: none;
  border-bottom: 1px solid #E4E7ED;
}
.alarm-popup__side-tab {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: #666;
  cursor: pointer;
  position: relative;
  transition: color 0.15s;
  user-select: none;
  padding: 0 12px;
  font-weight: bold;
}
.alarm-popup__side-tab:hover { color: #0088C1; }
.alarm-popup__side-tab--active {
  color: #0088C1;
  font-weight: 600;
  background: transparent;
}
.alarm-popup__side-tab--active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0;
  width: 100%; height: 1px;
  background: #3294ED;
}
.alarm-popup__side-body {
  flex: 1 1 auto;
  min-height: 0;
  background: #FFFFFF;
}

/* ── 详情面板 ── */
.alarm-popup__detail {
  padding: 12px 14px;
  font-size: 14px;
  color: #303133;
}
.alarm-popup__detail-ai {
  display: inline-block;
  /* background: linear-gradient(90deg, #6C5CE7 0%, #A29BFE 100%); */
  color: #111;
  font-size: 14px; font-weight: 600;
  padding: 2px 0;
  border-radius: 4px;
  margin-bottom: 8px;
}
.alarm-popup__detail-ai--critical { color: #FF3D71; }
.alarm-popup__detail-ai--high { color: #FF6B35; }
.alarm-popup__detail-ai--medium { color: #FFB800; }
.alarm-popup__detail-ai--low { color: #00D4AA; }
.alarm-popup__detail-row {
  display: flex; align-items: center;
  gap: 8px;
  padding: 4px 0;
  flex-wrap: wrap;
}
.alarm-popup__detail-row--level {
  justify-content: space-between;
}
.alarm-popup__detail-key {
  color: #111111; font-size: 14px;
  white-space: nowrap;
  font-weight: bold;
}
.alarm-popup__detail-val {
  color: #111111; font-size: 14px;
}
/* [POPUP-STRIP 2026-09-03] detail-hint 已随占位注释移除 */

/* [POPUP-IMG-LIST 2026-09-03] 详情面板「告警图片」缩略图 + 翻页器 */
.alarm-popup__detail-images {
  margin-top: 20px;
}
.alarm-popup__detail-images-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px solid #ebeef5;
}
.alarm-popup__detail-images-header .alarm-popup__detail-key {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.alarm-popup__accent-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: #111111 !important;
  font-size: 14px;
  font-weight: bold;
}
.alarm-popup__accent-title::before {
  content: '';
  width: 2px;
  height: 1em;
  margin-right: 3px;
  background: #0088C1;
  flex: 0 0 2px;
}
.alarm-popup__detail-images-nav {
  display: flex; align-items: center; gap: 12px;
  font-size: 14px; color: #303133;
  font-variant-numeric: tabular-nums;
}
.alarm-popup__detail-images-nav button {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  background: transparent;  /* 去掉灰色底块, 仅留箭头字符 */
  border: none;
  color: #606266; font-size: 24px; line-height: 1;
  cursor: pointer;
}
.alarm-popup__detail-images-nav button:hover:not(:disabled) {
  color: #3294ED;
}
.alarm-popup__detail-images-nav button:disabled {
  opacity: 1; cursor: not-allowed;
}
.alarm-popup__detail-images-thumb {
  margin-top: 6px;
  width: 100%;
  height: 185px;
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

/* [P0-8 2026-09-04 人脸比对] 抓拍 vs 注册照双图对比卡 */
.alarm-popup__face-compare {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  align-items: stretch;
}
.alarm-popup__face-compare-item {
  flex: 0 0 96px;
  display: flex; flex-direction: column;
  gap: 4px;
  text-align: center;
}
.alarm-popup__face-compare-item img {
  width: 96px; height: 96px;
  object-fit: cover;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #0a0e1c;
}
.alarm-popup__face-compare-item span {
  font-size: 11px;
  color: #909399;
}
.alarm-popup__face-compare-none {
  width: 96px; height: 96px;
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  font-size: 12px;
  color: #c0c4cc;
  background: #0a0e1c;
}
.alarm-popup__face-compare-info {
  flex: 1;
  display: flex; flex-direction: column;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
}
.alarm-popup__face-compare-sim {
  color: #e6a23c;
  font-weight: 600;
}
.alarm-popup__face-compare-verdict {
  color: #909399;
}
.alarm-popup__face-compare-verdict.is-known {
  /*color: #00d4aa;*/
  color:#333;
  font-weight: 600;
}

/* [POPUP-DISPOSE-ENTRY 2026-09-03] 详情面板底部「处警」粉红色入口按钮 */
/* [LAYOUT 2026-09-03] 钉在侧栏最底部: 深蓝底条 + 居中粉红按钮, 不随内容滚动 */
.alarm-popup__detail-footer {
  flex: 0 0 auto;
  display: flex; justify-content: flex-end;
  padding: 8px 0;
  background: #081649;
}
.alarm-popup__dispose-entry {
  min-width: 112px; height: 32px;
  background: #F45C73;
  color: #fff;
  border: none; border-radius: 4px;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  margin-right: 14px;
  transition: background 0.15s;
}
.alarm-popup__dispose-entry:hover { background: #E12D48; }
.alarm-popup__dispose-entry--append {
  background: var(--el-color-primary, #409eff);
}
.alarm-popup__dispose-entry--append:hover {
  background: var(--el-color-primary-light-3, #66b1ff);
}

/* 报警等级徽章 */
.alarm-popup__level-badge {
  display: inline-block;
  padding: 0px 14px;
  font-size: 13px;
  color: #fff;
  margin-left: 4px;
}
.alarm-popup__level-badge--critical { background: #FF3D71; }
.alarm-popup__level-badge--high     { background: #FF6B35; }
.alarm-popup__level-badge--medium   { background: #FFB800;  }
.alarm-popup__level-badge--low      { background: #00D4AA; }

.alarm-popup__status {
  display: inline-block;
  color: #3294ED;
  font-size: 14px;
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
  font-size: 15px; font-weight: 600;
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
.alarm-popup__dispose-row--level {
  justify-content: space-between;
}
.alarm-popup__dispose-row--col {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}
.alarm-popup__dispose-key {
  color: #111; font-size: 14px;
  white-space: nowrap;
  font-weight: bold;
}
.alarm-popup__dispose-key--required::before {
  content: '*';
  color: #F56C6C;
  margin-right: 2px;
}
.alarm-popup__dispose-val {
  color: #111; font-size: 14px;
}
.alarm-popup__dispose-select,
.alarm-popup__dispose-textarea {
  width: 100%;
}
.alarm-popup__dispose-select :deep(.el-select__wrapper) {
  min-height: 32px;
}
:global(.alarm-popup__dispose-popper) {
  z-index: 10000 !important;
}
.alarm-popup__dispose-section {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px 10px;
  margin-top: 10px;
}
/* [追加信息 2026-09-09] 追加记录条目 + 输入区 */
.alarm-popup__append-log {
  padding: 6px 10px;
  margin-top: 6px;
  background: rgba(245, 247, 250, 0.8);
  border-left: 3px solid #409EFF;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.alarm-popup__append-log-text {
  font-size: 13px;
  color: #303133;
  line-height: 1.5;
  word-break: break-all;
  white-space: pre-wrap;
}
.alarm-popup__append-log-by {
  font-size: 12px;
  color: #909399;
}
.alarm-popup__dispose-val--muted {
  color: #909399;
}
.alarm-popup__append-btn {
  margin-top: 8px;
  width: 100%;
}
.alarm-popup__dispose-section-title {
  font-size: 14px; font-weight: 600;
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
  /* border-top: 1px solid #1C4A7D; */
  display: flex; align-items: center;
  padding: 0 16px;
}
.alarm-popup__footer-left {
  display: flex; align-items: center; gap: 12px;
}
.alarm-popup__nav-btn {
  background: transparent;
  color: #00B2FD;
  border: 1px solid transparent;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 14px;
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
  color: #AADDFF; font-size: 14px;
  font-variant-numeric: tabular-nums;
  min-width: 50px; text-align: center;
}
.alarm-popup__footer-right :deep(.el-radio) {
  height: auto;
  margin-left: 24px;
  margin-right: 0;
}
.alarm-popup__footer-right :deep(.el-radio:last-child) {
  margin-right: 0;
}
.alarm-popup__footer-right :deep(.el-radio__label) {
  color: #AADDFF;
  font-size: 13px;
  padding-left: 6px;
}
.alarm-popup__footer-right :deep(.el-radio__inner) {
  background: transparent;
  border-color: #3294ED;
  width: 14px; height: 14px;
}
.alarm-popup__footer-right :deep(.el-radio__input.is-checked .el-radio__inner) {
  background: #3294ED;
  border-color: #3294ED;
}
.alarm-popup__footer-right :deep(.el-radio__input.is-checked + .el-radio__label) {
  color: #3294ED;
}
.alarm-popup__footer-right :deep(.el-radio__inner::after) {
  background: #fff;
  width: 5px; height: 5px;
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
.alarm-popup__thumbs-track::-webkit-scrollbar {
  height: 6px; width: 6px;
}
.alarm-popup__thumbs-track::-webkit-scrollbar-thumb {
  background: rgba(0, 229, 255, 0.3); border-radius: 3px;
}
.alarm-popup__thumbs-track::-webkit-scrollbar-track {
  background: transparent;
}

/* ── [AI 复核恢复 2026-09-10 P4 → 本轮移位详情面板] 缩略图下方 AI 复核卡片
   (浅色风格对齐详情面板: 原 image Tab 暗色变体随卡片移位同步改造) ── */
.alarm-popup__ai-review {
  flex: 0 0 auto;
  margin: 8px 0 4px;
  padding: 8px 12px;
  background: #f7f9fc;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}
.alarm-popup__ai-review-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 6px;
}
.alarm-popup__ai-review-title {
  font-size: 12px; font-weight: 600; color: #3294ED;
  letter-spacing: 1px;
}
.alarm-popup__ai-review-tag {
  font-size: 11px; padding: 1px 8px; border-radius: 9px; line-height: 16px;
}
.alarm-popup__ai-review-tag--success { background: rgba(0, 212, 170, 0.15); color: #00D4AA; border: 1px solid rgba(0, 212, 170, 0.5); }
.alarm-popup__ai-review-tag--danger  { background: rgba(245, 108, 108, 0.15); color: #f56c6c; border: 1px solid rgba(245, 108, 108, 0.5); }
.alarm-popup__ai-review-tag--info    { background: rgba(255, 255, 255, 0.08); color: #909399; border: 1px solid rgba(255, 255, 255, 0.15); }
.alarm-popup__ai-review-body { display: flex; flex-direction: column; gap: 4px; }
.alarm-popup__ai-review-row {
  display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
  font-size: 12px; line-height: 18px;
}
.alarm-popup__ai-review-label { color: #909399; flex: 0 0 auto; }
.alarm-popup__ai-review-value { color: #303133; }
.alarm-popup__ai-review-value--wrap {
  flex: 1 1 auto; min-width: 0;
  word-break: break-all;
  color: #606266;
}
</style>
