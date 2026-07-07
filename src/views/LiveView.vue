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
                <el-button :type="layout === 25 ? 'primary' : 'default'" @click="setLayout(25)" title="二十五分屏 (大屏模式)">25</el-button>
                <el-button :type="layout === 36 ? 'primary' : 'default'" @click="setLayout(36)" title="三十六分屏 (大屏模式)">36</el-button>
              </el-button-group>
              <!-- [P1-CO2] AI 检测框叠加开关 -->
              <el-button size="small" :type="detectionOverlay.enabled ? 'success' : 'default'" @click="detectionOverlay.enabled = !detectionOverlay.enabled" title="AI 检测框叠加">
                <el-icon><Aim /></el-icon>
              </el-button>
              <!-- [P3-CO3] E2E 延迟徽标 -->
              <el-tooltip v-if="e2eLatencyStats.lastMs > 0" :content="`推理传输延迟: 最新 ${e2eLatencyStats.lastMs}ms / 均值 ${e2eLatencyStats.avg}ms / P95 ${e2eLatencyStats.p95}ms`" placement="bottom">
                <span class="latency-badge" :class="{ 'latency-good': e2eLatencyStats.avg < 200, 'latency-warn': e2eLatencyStats.avg >= 200 && e2eLatencyStats.avg < 500, 'latency-bad': e2eLatencyStats.avg >= 500 }">
                  {{ e2eLatencyStats.avg }}ms
                </span>
              </el-tooltip>
              <el-button size="small" @click="snapshotActive" :disabled="!hasActive">
                <el-icon><Camera /></el-icon>截图
              </el-button>
              <el-button size="small" @click="toggleRecordActive" :disabled="!hasActive" :type="isRecording ? 'danger' : 'default'">
                <el-icon><VideoCamera /></el-icon>{{ isRecording ? '停止录像' : '录像' }}
              </el-button>
              <!-- 主/子码流切换 -->
              <el-button-group size="small">
                <el-button :type="streamQuality === 'main' ? 'primary' : 'default'" @click="switchStreamQuality('main')" title="主码流 (高清)">主码流</el-button>
                <el-button :type="streamQuality === 'sub' ? 'primary' : 'default'" @click="switchStreamQuality('sub')" title="子码流 (流畅)">子码流</el-button>
              </el-button-group>
              <el-button size="small" @click="openImageAdjust" :disabled="!hasActive">图像</el-button>
              <!-- P1-6: 电子放大 -->
              <el-button size="small" :type="eZoomActive ? 'primary' : 'default'" @click="toggleEZoom" :disabled="!hasActive" title="电子放大">
                <el-icon><Aim /></el-icon>
              </el-button>
              <!-- P1-4: 自动轮巡 -->
              <el-button size="small" :type="autoPatrolEnabled ? 'success' : 'default'" @click="openPatrolConfig" title="自动轮巡配置">
                <el-icon><RefreshRight /></el-icon>{{ autoPatrolEnabled ? patrolStatusText : '' }}
              </el-button>
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
                 @dblclick="maximizeSlot(idx, $event)">
              <!-- 真实视频播放 P2-2: CSS filter + P1-6: 电子放大 -->
              <video v-if="slot.playing"
                     :ref="el => setVideoRef(el, idx)"
                     class="video-player"
                     :style="{ filter: videoFilterStyle.filter, transform: (idx === activeSlotIdx && eZoomActive ? eZoomStyle.transform : '') + (videoFilterStyle.transform !== 'none' ? ' ' + videoFilterStyle.transform : '') }"
                     muted autoplay playsinline />
              <!-- [P1-CO2] AI 推理检测框 Canvas 叠加层 -->
              <canvas v-if="slot.playing && detectionOverlay.enabled"
                      :ref="(el: any) => setDetectionCanvasRef(el, idx)"
                      class="detection-canvas"
                      :style="{ transform: (idx === activeSlotIdx && eZoomActive ? eZoomStyle.transform : '') }" />
              <div v-if="slot.loading" class="video-loading">
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
            <!-- 巡航/轨迹 (P0-2 对标海康 iVMS PTZ 控制) -->
            <div class="ptz-advanced">
              <span>巡航</span>
              <el-button-group size="small">
                <el-button :type="isCruising ? 'warning' : 'default'" @click="toggleCruise">
                  {{ isCruising ? '停止巡航' : '启动巡航' }}
                </el-button>
                <el-button size="small" @click="ptzCruise(1)" title="路径1">C1</el-button>
                <el-button size="small" @click="ptzCruise(2)" title="路径2">C2</el-button>
              </el-button-group>
            </div>
            <div class="ptz-advanced">
              <span>轨迹</span>
              <el-button-group size="small">
                <el-button :type="isTracking ? 'warning' : 'default'" @click="toggleTrack">
                  {{ isTracking ? '停止跟踪' : '启动跟踪' }}
                </el-button>
                <el-button size="small" @click="ptzTrack(1)" title="轨迹1">T1</el-button>
                <el-button size="small" @click="ptzTrack(2)" title="轨迹2">T2</el-button>
              </el-button-group>
            </div>
            <!-- 3D 触摸放大 提示 -->
            <div class="ptz-3d-hint" v-if="hasActive">
              <el-icon :size="12"><Aim /></el-icon>
              <span>双击画面可 3D 放大定位</span>
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

    <!-- P2-2: 图像调节弹窗 (亮度/对比度/饱和度/色温 + 镜像/旋转 + 电子放大) -->
    <el-dialog v-model="imageDialogVisible" title="图像调节" width="480px" :append-to-body="true">
      <div class="image-adjust">
        <div class="adj-row"><span>亮度</span><el-slider v-model="imageAdjust.brightness" :min="0" :max="100" /></div>
        <div class="adj-row"><span>对比度</span><el-slider v-model="imageAdjust.contrast" :min="0" :max="100" /></div>
        <div class="adj-row"><span>饱和度</span><el-slider v-model="imageAdjust.saturation" :min="0" :max="100" /></div>
        <div class="adj-row"><span>色温</span><el-slider v-model="imageAdjust.hue" :min="0" :max="100" /></div>
        <el-divider content-position="center">画面变换</el-divider>
        <div style="display:flex;justify-content:center;gap:16px;margin-bottom:16px">
          <el-button :type="imageAdjust.mirrorH ? 'primary' : 'default'" @click="imageAdjust.mirrorH = !imageAdjust.mirrorH">水平镜像</el-button>
          <el-button :type="imageAdjust.mirrorV ? 'primary' : 'default'" @click="imageAdjust.mirrorV = !imageAdjust.mirrorV">垂直翻转</el-button>
          <el-select v-model="imageAdjust.rotate" size="small" style="width:100px" placeholder="旋转">
            <el-option :value="0" label="不旋转" />
            <el-option :value="90" label="90°" />
            <el-option :value="180" label="180°" />
            <el-option :value="270" label="270°" />
          </el-select>
        </div>
        <el-divider content-position="center">电子放大</el-divider>
        <div class="adj-row" v-if="eZoomActive"><span>缩放</span><el-slider v-model="eZoomScale" :min="1" :max="5" :step="0.1" /></div>
        <div class="adj-row" v-if="eZoomActive"><span>水平位置</span><el-slider v-model="eZoomX" :min="0" :max="100" /></div>
        <div class="adj-row" v-if="eZoomActive"><span>垂直位置</span><el-slider v-model="eZoomY" :min="0" :max="100" /></div>
        <div v-if="!eZoomActive" style="text-align:center;color:#9AA0A6;padding:8px">点击工具栏准星按钮开启电子放大</div>
        <div style="text-align:center;margin-top:12px">
          <el-button size="small" @click="resetImageAdjust">恢复默认</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- P2-VP3: 自动轮巡配置对话框 -->
    <el-dialog v-model="showPatrolConfig" title="自动轮巡配置 (对标海康轮巡组)" width="780px" :append-to-body="true">
      <div style="display:flex;gap:16px;height:420px">
        <!-- 左侧: 轮巡组列表 -->
        <div style="width:200px;border-right:1px solid var(--app-border,#252830);padding-right:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-weight:600">轮巡组</span>
            <el-button size="small" type="primary" text @click="addPatrolGroup">+ 新建</el-button>
          </div>
          <div
            v-for="g in patrolGroups"
            :key="g.id"
            @click="activePatrolGroupId = g.id"
            :class="['patrol-group-item', { active: activePatrolGroupId === g.id }]"
          >
            <span>{{ g.name }} <el-tag size="small" type="info">{{ g.channels.length }}</el-tag></span>
            <el-button size="small" text type="danger" @click.stop="removePatrolGroup(g.id)">×</el-button>
          </div>
        </div>

        <!-- 右侧: 选中组的详细配置 -->
        <div v-if="activePatrolGroup" style="flex:1;overflow-y:auto">
          <el-form :inline="true" size="small">
            <el-form-item label="名称">
              <el-input v-model="activePatrolGroup.name" @change="savePatrolGroups" style="width:180px" />
            </el-form-item>
            <el-form-item label="间隔(秒)">
              <el-input-number v-model="activePatrolGroup.intervalSec" :min="3" :max="300" @change="savePatrolGroups" />
            </el-form-item>
          </el-form>

          <div style="margin:12px 0;font-weight:600">该组通道列表 ({{ activePatrolGroup.channels.length }})</div>
          <el-table :data="activePatrolGroup.channels" size="small" max-height="200">
            <el-table-column label="序号" type="index" width="50" />
            <el-table-column prop="name" label="通道名称" />
            <el-table-column prop="channelId" label="通道ID" width="160" />
            <el-table-column label="操作" width="60">
              <template #default="{ row }">
                <el-button size="small" text type="danger" @click="removeChannelFromGroup(activePatrolGroup.id, row.channelId)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div style="margin-top:12px">
            <el-select v-model="channelToAdd" placeholder="选择通道添加到该组" filterable style="width:300px" size="small">
              <el-option v-for="ch in channels" :key="ch.id" :label="ch.name" :value="ch.id" />
            </el-select>
            <el-button size="small" type="primary" @click="channelToAdd && addChannelToGroup(activePatrolGroup.id, channelToAdd); channelToAdd = ''" style="margin-left:8px">+ 添加</el-button>
          </div>
        </div>
        <div v-else style="flex:1;display:flex;align-items:center;justify-content:center;color:#888">
          请选择或新建一个轮巡组
        </div>
      </div>

      <template #footer>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12px;color:#909399">
            {{ autoPatrolEnabled ? `✓ 轮巡运行中: ${patrolStatusText}` : '○ 轮巡未启动' }}
          </div>
          <div>
            <el-button @click="stopPatrol(); showPatrolConfig = false" :disabled="!autoPatrolEnabled">停止</el-button>
            <el-button type="primary" @click="startPatrol" :disabled="!activePatrolGroup || activePatrolGroup.channels.length === 0">
              {{ autoPatrolEnabled ? '重启' : '启动轮巡' }}
            </el-button>
            <el-button @click="showPatrolConfig = false">关闭</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
    <div v-if="!webCodecsSupported" style="position:fixed;bottom:12px;right:12px;background:#2A2A0A;color:#FFB800;padding:4px 10px;border-radius:4px;font-size:11px;z-index:999">
      ⚡ 软解码模式 (WebCodecs 不可用)
    </div>
    <div v-else style="position:fixed;bottom:12px;right:12px;background:#0A2A1A;color:#00D4AA;padding:4px 10px;border-radius:4px;font-size:11px;z-index:999">
      ⚡ GPU 硬解码已启用
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, reactive, nextTick, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import { getDeviceChannels } from '@/api/devices'
import { streamHttp, deviceHttp, http } from '@/api/http'
import { ptzControl as ptzApi, startCruise as ptzStartCruise, stopCruise as ptzStopCruise, startTrack as ptzStartTrack, stopTrack as ptzStopTrack, ptz3DPosition } from '@/api/ptz'
import { ElMessage } from 'element-plus'
import { Lock, Unlock } from '@element-plus/icons-vue'
import type { Channel, DeviceItem } from '@/types/device'
import Hls from 'hls.js'
import flvjs from 'flv.js'
import { useStreamHealth } from '@/composables/useStreamHealth'
import { useAdaptiveBitrate } from '@/composables/useAdaptiveBitrate'
import StreamStatsPanel from '@/components/StreamStatsPanel.vue'
import { normalizeStreamUrl, normalizeWsFlvUrl } from '@/utils/streamUrl'
import { useChannelStore } from '@/stores/channel'
import type { PlayerFormat as StorePlayerFormat, ActiveSlotData } from '@/stores/channel'
// [P3-CO3] E2E 延迟监控
import { e2eLatencyStats } from '@/composables/useGlobalAlarm'

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
  Array.from({ length: 36 }, () => ({
    channelId: '', name: '', status: '', urls: {}, codec: '', playing: false, loading: false, muted: true, deviceId: '', playerInstance: null, recording: false, talking: false, currentFormat: '', webrtcRetryCount: 0, reconnectCount: 0, encrypted: false, _lastReconnectTime: 0, _videoEventCleanups: []
  }))
)
const preferredFormat = ref<PlayerFormat>('webrtc')  // [P2-VP2] 默认 WebRTC 超低延迟
const videoRefs = ref<Record<number, HTMLVideoElement>>({})
const gridRef = ref<HTMLElement>()

// [P1-CO2] AI 推理检测框 Canvas 叠加层
const detectionOverlay = reactive({
  enabled: true,  // 默认开启
})
const detectionCanvasRefs = ref<Record<number, HTMLCanvasElement>>({})
// channelId → 最新检测结果（后端 pushDetectionResult 推送）
interface DetectionBox {
  class_name: string
  confidence: number
  x1: number; y1: number; x2: number; y2: number
}
const latestDetections = ref<Record<string, { boxes: DetectionBox[]; ts: number; imgW?: number; imgH?: number }>>({})
let detectionRafId = 0

function setDetectionCanvasRef(el: any, idx: number) {
  if (el) detectionCanvasRefs.value[idx] = el as HTMLCanvasElement
  else delete detectionCanvasRefs.value[idx]
}

// [P1-CO2] 推理检测结果事件处理
function onInferenceDetection(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail?.channel_id || !detail?.detections) return
  // 从 gridSlots 查找对应的 channel 以获取原始推理分辨率
  const slot = gridSlots.find(s => s.channelId === detail.channel_id)
  latestDetections.value[detail.channel_id] = {
    boxes: detail.detections.map((d: any) => ({
      class_name: d.class_name || d.class || '',
      confidence: d.confidence || d.score || 0,
      x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
    })),
    ts: detail.timestamp_ms || Date.now(),
  }
  // 后端 detections 的 bbox 是相对于模型输入分辨率 (640x640)，
  // 由 drawDetections 根据 video 实际分辨率缩放
}

// [P1-CO2] Canvas 绘制检测框
const DETECTION_COLORS: Record<string, string> = {
  person: '#00E676',
  face: '#FFEB3B',
  fire: '#FF1744',
  smoke: '#FF9100',
  weapon: '#D500F9',
  knife: '#D500F9',
  gun: '#D500F9',
}
const DEFAULT_DET_COLOR = '#00B0FF'

function drawDetections() {
  detectionRafId = requestAnimationFrame(drawDetections)
  if (!detectionOverlay.enabled) return

  for (let idx = 0; idx < layout.value; idx++) {
    const canvas = detectionCanvasRefs.value[idx]
    const video = videoRefs.value[idx]
    if (!canvas || !video) continue

    const slot = gridSlots[idx]
    if (!slot?.channelId) continue

    const detData = latestDetections.value[slot.channelId]
    // 3秒内无新检测 → 清空 canvas
    if (!detData || Date.now() - detData.ts > 5000) {
      const ctx = canvas.getContext('2d')
      if (ctx && (canvas.width > 0 || canvas.height > 0)) ctx.clearRect(0, 0, canvas.width, canvas.height)
      continue
    }

    // 同步 canvas 尺寸到 video 显示区域
    const vw = video.videoWidth || 0
    const vh = video.videoHeight || 0
    if (vw === 0 || vh === 0) continue
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw
      canvas.height = vh
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 后端 bbox 坐标系 = 模型输入 (通常 640x640)
    // 需缩放到 video 原始分辨率
    // 但 pushDetectionResult 里的坐标已经是模型输入坐标 (0~model_input_size)
    // 假设模型输入为 640x640（YOLOv8 默认），按比例缩放
    const MODEL_INPUT = 640
    const scaleX = canvas.width / MODEL_INPUT
    const scaleY = canvas.height / MODEL_INPUT

    ctx.lineWidth = Math.max(2, canvas.width / 320)
    ctx.font = `${Math.max(12, canvas.width / 50)}px sans-serif`

    for (const box of detData.boxes) {
      const x = box.x1 * scaleX
      const y = box.y1 * scaleY
      const w = (box.x2 - box.x1) * scaleX
      const h = (box.y2 - box.y1) * scaleY
      const color = DETECTION_COLORS[box.class_name] || DEFAULT_DET_COLOR

      // 半透明填充
      ctx.fillStyle = color + '22'
      ctx.fillRect(x, y, w, h)

      // 边框
      ctx.strokeStyle = color
      ctx.strokeRect(x, y, w, h)

      // 标签背景
      const label = `${box.class_name} ${(box.confidence * 100).toFixed(0)}%`
      const textW = ctx.measureText(label).width
      const labelH = Math.max(16, canvas.width / 40)
      ctx.fillStyle = color
      ctx.fillRect(x, y - labelH, textW + 8, labelH)

      // 标签文字
      ctx.fillStyle = '#000'
      ctx.fillText(label, x + 4, y - 4)
    }
  }
}

// 流健康监测（参考海康 iVMS-8700 / 大华 DSS / 华为 HoloSens IVS 策略）
// [一次性设计修正 2026-06-23] 核心原则：onStall 仅作为 watcher 的安全网，
//   且必须遵守 reconnectCount + 全局冷却限制，不能绕过它们独立触发重建。
//   之前的 onStall 回调在 stallCount>=5 时无条件重建，绕过了 reconnectCount 上限，
//   导致 watcher 放弃后 onStall 仍无限重建 → 停止/开始循环。
// onReconnectExhausted: 重连耗尽时停止监测，避免 setInterval 持续触发日志洪泛
const streamHealth = useStreamHealth(
  (slotIdx, stallCount) => {
    const slot = gridSlots[slotIdx]
    const video = videoRefs.value[slotIdx]
    if (!slot || !video) return

    // HLS 永远不重建（hls.js 内置 recovery 已处理）
    if (slot.currentFormat === 'hls') {
      console.debug(`[LiveView] slot${slotIdx} HLS stallCount=${stallCount}，由 hls.js 自行恢复（不重建）`)
      return
    }

    // [P0-Fix 2026-06-29] 去重防护: 如果 status watcher 已经在重连中，onStall 跳过
    //   原因: evaluateHealth() 中 stallCount++ 和 status='error' 几乎同时发生，
    //         导致 onStall 回调和 status watcher 双触发，对同一 slot 执行两次 reconnectStream
    //   对标海康 iVMS: 仅有一条重连路径（后端 SSE 驱动），不存在前端双触发问题
    if (reconnecting.has(slotIdx)) {
      console.debug(`[LiveView] slot${slotIdx} onStall(${stallCount}) 但已在重连中，跳过`)
      return
    }

    // [关键修复] onStall 必须遵守与 watcher 相同的限制条件
    // [P3-1] stallCount 阈值协议感知: FLV/WebRTC=3 (更快恢复), HLS 不触发(已在上面跳过)
    const stallThreshold = (slot.currentFormat === 'flv' || slot.currentFormat === 'ws-flv' || slot.currentFormat === 'webrtc') ? 3 : 5
    if (stallCount >= stallThreshold && slot.channelId && !formatSwitching.has(slotIdx)) {
      // 检查 reconnectCount 上限
      if (slot.reconnectCount > MAX_SAME_FORMAT_RETRIES) {
        console.warn(`[LiveView] slot${slotIdx} stallCount=${stallCount} 但已达重连上限(${MAX_SAME_FORMAT_RETRIES})，停止重建`)
        streamHealth.stopMonitoring(slotIdx)
        return
      }
      // 检查全局冷却
      const now = Date.now()
      if (now - lastGlobalRebuildAt < GLOBAL_REBUILD_COOLDOWN_MS) {
        console.debug(`[LiveView] slot${slotIdx} stallCount=${stallCount} 但全局冷却期内，跳过`)
        return
      }
      // [P3-1] 检查 per-slot 冷却
      const slotLastRebuild = slotLastRebuildAt.get(slotIdx) || 0
      if (now - slotLastRebuild < PER_SLOT_REBUILD_COOLDOWN_MS) {
        const remain = Math.ceil((PER_SLOT_REBUILD_COOLDOWN_MS - (now - slotLastRebuild)) / 1000)
        console.debug(`[LiveView] slot${slotIdx} stallCount=${stallCount} 但 slot 冷却期内 (${remain}s)，跳过`)
        return
      }

      console.warn(`[LiveView] slot${slotIdx} 严重卡顿 stallCount=${stallCount}，重建播放器 (reconnect=${slot.reconnectCount})`)
      lastGlobalRebuildAt = now
      slotLastRebuildAt.set(slotIdx, now)
      slot.reconnectCount++
      slot._lastReconnectTime = Date.now()
      reconnecting.add(slotIdx)  // [P0-Fix] 标记重连中，防止 status watcher 双触发
      // [Fix 2026-06-23] 使用 reconnectStream 重新获取流地址，而非复用陈旧 URL
      const fmt = slot.currentFormat as PlayerFormat
      setTimeout(() => {
        reconnectStream(slotIdx, fmt || undefined).finally(() => {
          reconnecting.delete(slotIdx)  // [P0-Fix] 重连完成后释放锁
        })
      }, 500)
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
// [P2-VP2] WebRTC 提升为首选 (超低延迟 <500ms, 对标海康/大华实时预览)
// H.264: WebRTC → FLV → WS-FLV → HLS
// H.265: WebRTC → HLS（FLV/WS-FLV 的 MSE 不支持 H.265）
const DEGRADATION_CHAINS: Record<'h264' | 'h265', PlayerFormat[]> = {
  h264: ['webrtc', 'flv', 'ws-flv', 'hls'],
  h265: ['webrtc', 'hls'],
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

// [一次性设计修正 2026-06-23] 自动重连策略：对标海康 iVMS-8700
//   海康策略：仅在播放器发出致命错误（Network/Media fatal error）时重连，
//   不依赖前端健康监测的 noDataSeconds 判断（容易因 GOP/低帧率误判）。
//   重连冷却 60s，同格式最多 2 次，超后停止自动重连。
//   flv.js / hls.js 的内部 error recovery 已处理大部分瞬时问题。
const AUTO_RECONNECT_ENABLED = true
const MAX_SAME_FORMAT_RETRIES = 2
// 全局重建冷却：任何 slot 重建后 60s 内不再触发自动重连
//   防止多个 slot 同时 error 导致连锁重建
const GLOBAL_REBUILD_COOLDOWN_MS = 60_000
let lastGlobalRebuildAt = 0
// [P3-1] per-slot 重建冷却：同一 slot 重建后 30s 内不再触发
//   防止单路问题设备频繁重建导致资源浪费
//   对标大华 DSS 单路重连冷却 30s
const PER_SLOT_REBUILD_COOLDOWN_MS = 30_000
const slotLastRebuildAt = new Map<number, number>()
// [一次性设计修正 2026-06-23] status 转换追踪：仅在 status 真正变化时处理
//   deep watcher 每秒因 bytesPerSec/fps 变化触发，但只有 status 转换才需要行动
const prevStatusMap = new Map<number, string>()

const setVideoRef = (el: any, idx: number) => {
  // [FIX-RC3 2026-06-28] 清理 null 引用: 当 v-if="slot.playing" 变为 false 时,
  //   Vue 用 null 调用 ref 回调。必须清理 stale 引用, 否则 videoRefs 指向已分离的 DOM 元素。
  if (el) {
    videoRefs.value[idx] = el as HTMLVideoElement
  } else {
    delete videoRefs.value[idx]
  }
}

// 通道数据
const channels = ref<Channel[]>([])
const devices = ref<DeviceItem[]>([])
const chSearch = ref('')
// 主/子码流切换状态 (P0-1 对标海康/大华双码流策略)
// 主码流: 高清 1080P/4Mbps → 单屏/4分屏预览
// 子码流: 流畅 720P/0.5Mbps → 9/16分屏多路预览
const streamQuality = ref<'main' | 'sub'>('main')
// PTZ 巡航/轨迹状态 (P0-2)
const isCruising = ref(false)
const isTracking = ref(false)
const ptzSpeed = ref(128)
const currentTime = ref('')

// 录像
const isRecording = computed(() => gridSlots[activeSlotIdx.value]?.recording)

// 图像调节 (P2-2: CSS filter 绑定到 video 元素)
const imageDialogVisible = ref(false)
const imageAdjust = reactive({ brightness: 50, contrast: 50, saturation: 50, hue: 50, mirrorH: false, mirrorV: false, rotate: 0 })
// 构建 CSS filter 字符串
const videoFilterStyle = computed(() => {
  const brightness = imageAdjust.brightness / 50  // 50=normal
  const contrast = imageAdjust.contrast / 50
  const saturate = imageAdjust.saturation / 50
  const hueRotate = (imageAdjust.hue - 50) * 1.8  // -90~90deg
  let transform = ''
  if (imageAdjust.mirrorH) transform += ' scaleX(-1)'
  if (imageAdjust.mirrorV) transform += ' scaleY(-1)'
  if (imageAdjust.rotate !== 0) transform += ` rotate(${imageAdjust.rotate}deg)`
  return {
    filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) hue-rotate(${hueRotate}deg)`,
    transform: transform.trim() || 'none'
  }
})

// P1-3: WebCodecs 硬件解码检测
const webCodecsSupported = ref(false)
const hardwareDecoding = ref(false)
async function checkWebCodecsSupport() {
  try {
    // @ts-ignore - VideoDecoder is experimental
    if (typeof VideoDecoder === 'undefined') { webCodecsSupported.value = false; return }
    // @ts-ignore
    const config = { codec: 'avc1.42E01E', hardwareAcceleration: 'prefer-hardware' }
    // @ts-ignore
    const support = await VideoDecoder.isConfigSupported(config)
    webCodecsSupported.value = support?.supported ?? false
    hardwareDecoding.value = webCodecsSupported.value
  } catch { webCodecsSupported.value = false }
}

// P2-VP3: 自动轮巡 — 轮巡组系统 (对标海康 iVMS 轮巡功能)
interface PatrolGroup {
  id: string
  name: string
  channels: Array<{ channelId: string; name: string; deviceId: string }>
  intervalSec: number  // 该轮巡组的切换间隔 (秒)
  enabled: boolean
}

const PATROL_STORAGE_KEY = 'smartgateway.patrolGroups.v1'
const patrolGroups = ref<PatrolGroup[]>([])
const activePatrolGroupId = ref<string>('')
const autoPatrolEnabled = ref(false)
let autoPatrolTimer: ReturnType<typeof setInterval> | null = null
let patrolChannelIndex = 0

// 加载轮巡组配置 (从 localStorage)
function loadPatrolGroups() {
  try {
    const raw = localStorage.getItem(PATROL_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) patrolGroups.value = parsed
    }
  } catch { /* ignore */ }
  if (patrolGroups.value.length === 0) {
    // 默认空轮巡组
    patrolGroups.value = [
      { id: 'group_default', name: '默认轮巡组', channels: [], intervalSec: 10, enabled: true },
    ]
  }
}
function savePatrolGroups() {
  try {
    localStorage.setItem(PATROL_STORAGE_KEY, JSON.stringify(patrolGroups.value))
  } catch { /* ignore */ }
}

const activePatrolGroup = computed(() =>
  patrolGroups.value.find(g => g.id === activePatrolGroupId.value)
)
const patrolStatusText = computed(() => {
  if (!autoPatrolEnabled.value || !activePatrolGroup.value) return ''
  return `${activePatrolGroup.value.name} (${activePatrolGroup.value.intervalSec}s)`
})

// 打开轮巡配置对话框
const showPatrolConfig = ref(false)
const channelToAdd = ref('')
function openPatrolConfig() {
  loadPatrolGroups()
  showPatrolConfig.value = true
}

// 启动轮巡
function startPatrol() {
  if (!activePatrolGroup.value || activePatrolGroup.value.channels.length === 0) {
    ElMessage.warning('请先选择轮巡组并添加通道')
    return
  }
  stopPatrol()  // 先停旧定时器
  autoPatrolEnabled.value = true
  patrolChannelIndex = 0
  // 立即跳转到第一个通道
  switchToPatrolChannel(0)
  autoPatrolTimer = setInterval(() => {
    patrolChannelIndex = (patrolChannelIndex + 1) % activePatrolGroup.value!.channels.length
    switchToPatrolChannel(patrolChannelIndex)
  }, activePatrolGroup.value.intervalSec * 1000)
  ElMessage.success(`轮巡已启动: ${activePatrolGroup.value.name}`)
}

// 停止轮巡
function stopPatrol() {
  autoPatrolEnabled.value = false
  if (autoPatrolTimer) { clearInterval(autoPatrolTimer); autoPatrolTimer = null }
}

// 切换轮巡通道
function switchToPatrolChannel(idx: number) {
  const group = activePatrolGroup.value
  if (!group || idx < 0 || idx >= group.channels.length) return
  const ch = group.channels[idx]
  const channelObj = channels.value.find(c => c.id === ch.channelId)
  if (channelObj && activeSlotIdx.value >= 0) {
    closeSlot(activeSlotIdx.value)
    nextTick(() => assignChannel(activeSlotIdx.value, channelObj))
    console.log(`[P2-VP3 轮巡] ${group.name} → ${ch.name}`)
  }
}

// 轮巡组管理
function addPatrolGroup() {
  const id = `group_${Date.now()}`
  patrolGroups.value.push({
    id, name: `轮巡组 ${patrolGroups.value.length + 1}`,
    channels: [], intervalSec: 10, enabled: true,
  })
  savePatrolGroups()
}
function removePatrolGroup(id: string) {
  patrolGroups.value = patrolGroups.value.filter(g => g.id !== id)
  if (activePatrolGroupId.value === id) activePatrolGroupId.value = ''
  savePatrolGroups()
}
function addChannelToGroup(groupId: string, channelId: string) {
  const group = patrolGroups.value.find(g => g.id === groupId)
  const ch = channels.value.find(c => c.id === channelId)
  if (!group || !ch) return
  if (group.channels.some(c => c.channelId === ch.id)) return
  group.channels.push({ channelId: ch.id, name: ch.name, deviceId: ch.deviceId })
  savePatrolGroups()
}
function removeChannelFromGroup(groupId: string, channelId: string) {
  const group = patrolGroups.value.find(g => g.id === groupId)
  if (!group) return
  group.channels = group.channels.filter(c => c.channelId !== channelId)
  savePatrolGroups()
}

// P1-4: 保留原版 slot-rotation 作为轮巡启动的备份逻辑
function toggleAutoPatrol() {
  if (autoPatrolEnabled.value) {
    stopPatrol()
    ElMessage.info('自动轮巡已停止')
  } else {
    const activeCount = gridSlots.slice(0, layout.value).filter(s => s.channelId).length
    if (activeCount === 0) { ElMessage.warning('没有可轮巡的通道'); return }
    autoPatrolEnabled.value = true
    autoPatrolTimer = setInterval(() => {
      const slots = gridSlots.slice(0, layout.value)
      const activeChannels = slots.filter(s => s.channelId).map(s => ({ channelId: s.channelId, name: s.name, deviceId: s.deviceId }))
      if (activeChannels.length <= 1) return
      const first = activeChannels[0]
      for (let i = 0; i < activeChannels.length - 1; i++) {
        activeChannels[i] = activeChannels[i + 1]
      }
      activeChannels[activeChannels.length - 1] = first
      let acIdx = 0
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].channelId && acIdx < activeChannels.length) {
          const ch = activeChannels[acIdx++]
          if (slots[i].channelId !== ch.channelId) {
            closeSlot(i)
            const channelObj = channels.value.find(c => c.id === ch.channelId)
            if (channelObj) nextTick(() => assignChannel(i, channelObj))
          }
        }
      }
    }, 10 * 1000)
    ElMessage.success('自动轮巡已启动 (简单模式)')
  }
}

// P1-6: 电子放大 (数字变倍)
const eZoomActive = ref(false)
const eZoomScale = ref(1)
const eZoomX = ref(50)  // 中心点百分比 0-100
const eZoomY = ref(50)
function toggleEZoom() {
  eZoomActive.value = !eZoomActive.value
  if (!eZoomActive.value) { eZoomScale.value = 1; eZoomX.value = 50; eZoomY.value = 50 }
}
const eZoomStyle = computed(() => {
  if (!eZoomActive.value || eZoomScale.value <= 1) return { transform: 'none' }
  const tx = (50 - eZoomX.value) * (eZoomScale.value - 1) / eZoomScale.value
  const ty = (50 - eZoomY.value) * (eZoomScale.value - 1) / eZoomScale.value
  return { transform: `scale(${eZoomScale.value}) translate(${tx}%, ${ty}%)` }
})

// [FIX 2026-07-03] 前端弹窗由 useGlobalAlarm.ts (WebSocket) 统一驱动。

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
  // [FIX] 加载所有设备的通道（包括离线设备）
  const allChs: Channel[] = []
  for (const dev of devices.value) {
    try {
      const res = await getDeviceChannels(dev.id) as any
      const chs: Channel[] = res?.data?.data ?? res?.data ?? res
      for (const ch of chs) {
        (ch as any).deviceId = dev.id
        if (dev.status === 'offline' && !(ch as any).status) {
          (ch as any).status = 'offline'
        }
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

  // [FIX] 设备离线拦截：提前提示，避免无效 SIP INVITE
  const chStatus = (ch as any).status || ''
  if (chStatus === 'offline') {
    ElMessage.warning(`设备"${ch.name}"当前离线，请检查网络连接或设备电源`)
    slot.channelId = ch.id
    slot.name = ch.name
    slot.deviceId = ch.deviceId || ''
    slot.status = 'offline'
    slot.playing = false
    slot.loading = false
    return
  }

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
          // 激活码率自适应 + [P3-VP1] 主/子码流自动切换
          adaptiveBitrate.activate(
            slotIdx,
            ch.id,
            () => streamHealth.getHealth(slotIdx),
            'high',
            // [P3-VP1] 网络质量降级时自动切换子码流
            (quality) => {
              if (quality === 'sub' && streamQuality.value === 'main') {
                console.info('[P3-VP1] 网络质量下降，自动切换到子码流')
                switchStreamQuality('sub')
              } else if (quality === 'main' && streamQuality.value === 'sub') {
                console.info('[P3-VP1] 网络质量恢复，自动切换回主码流')
                switchStreamQuality('main')
              }
            },
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

// [Fix 2026-06-23] 重连时重新获取流地址，而非使用陈旧 URL
//   原因：重连时 GB28181 INVITE 会话可能已超时，RTP 端口可能已释放，
//         ZLM RTP server 可能已关闭。slot.urls 中缓存的 URL 已失效。
//   对标海康 iVMS：重连 = 重新调用 /start 发送新 INVITE + 获取新 URL
async function reconnectStream(slotIdx: number, preferredFmt?: PlayerFormat) {
  const slot = gridSlots[slotIdx]
  if (!slot?.channelId) return

  const video = videoRefs.value[slotIdx]
  if (!video) return

  // 1. 销毁旧播放器
  destroyPlayer(slot, slotIdx)
  video.pause()
  video.removeAttribute('src')
  video.load()

  // 2. 重新获取流地址（触发新 INVITE 或复用已有流）
  const ch: Channel = {
    id: slot.channelId,
    name: slot.name,
    deviceId: slot.deviceId,
    status: slot.status,
  } as any

  const result = await fetchStreamUrls(ch)
  if (!result || !result.urls) {
    console.warn(`[LiveView] slot${slotIdx} 重连获取流地址失败`)
    return
  }

  // 3. 更新 slot 中的 URL 和 codec
  slot.urls = result.urls
  slot.codec = result.codec || slot.codec

  // 4. 选择播放格式
  const fmt = preferredFmt || selectBestFormat(result.urls, result.codec)
  console.debug(`[LiveView] slot${slotIdx} 重连成功，format=${fmt}, codec=${result.codec}`)

  // 5. 重新播放
  formatSwitching.add(slotIdx)
  nextTick(() => {
    attachPlayerByFormat(slotIdx, fmt)
    setTimeout(() => formatSwitching.delete(slotIdx), 5000)
  })
}

// 智能选择最佳播放格式（使用统一降级链）
function selectBestFormat(urls: Partial<Record<PlayerFormat, string>>, codec?: string): PlayerFormat {
  const isH265 = !!(codec && (codec.toUpperCase().includes('H265') || codec.toUpperCase().includes('HEVC')))

  // [P1-VP2] H.265 WebRTC 可用性预检：检测浏览器是否支持 H.265 硬解
  // Safari 全支持 H.265 WebRTC；Chrome 仅在特定编解码器配置下支持；Firefox 不支持
  const h265WebRtcSupported = (() => {
    try {
      const caps = RTCRtpReceiver.getCapabilities('video')
      if (!caps?.codecs) return false
      return caps.codecs.some(c =>
        c.mimeType.toLowerCase() === 'video/h265' ||
        c.mimeType.toLowerCase() === 'video/hvc1' ||
        c.mimeType.toLowerCase() === 'video/hevc'
      )
    } catch { return false }
  })()

  // H.265 + 浏览器不支持 WebRTC H.265 → 使用纯 HLS 降级链
  const chain = (isH265 && !h265WebRtcSupported)
    ? ['hls']
    : (isH265 ? DEGRADATION_CHAINS.h265 : DEGRADATION_CHAINS.h264)

  if (isH265) {
    console.debug(`[LiveView] H.265 编码, WebRTC H.265 支持=${h265WebRtcSupported}, 降级链: ${chain.join(' → ')}, codec=${codec}`)
  }

  // [P2-VP2] 用户显式选择了格式时，优先使用该格式（如果可用且兼容编码）
  if (preferredFormat.value && urls[preferredFormat.value]) {
    // H.265 时检查格式兼容性
    if (!isH265 || (preferredFormat.value === 'webrtc' && h265WebRtcSupported) || preferredFormat.value === 'hls') {
      console.debug(`[LiveView] 使用用户首选格式: ${preferredFormat.value}`)
      return preferredFormat.value
    }
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

    // [P1-VP1] ICE 连接状态监控：disconnected 宽限期 5s + failed 立即降级
    let iceDisconnectTimer: ReturnType<typeof setTimeout> | null = null
    const ICE_DISCONNECT_GRACE_MS = 5000  // disconnected 状态宽限期

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState
      console.debug(`[WebRTC] slot${slotIdx} ICE state: ${iceState}`)

      if (iceState === 'failed') {
        // failed = 不可恢复，立即降级
        slot.webrtcRetryCount++
        if (iceTimeoutTimer) { clearTimeout(iceTimeoutTimer); iceTimeoutTimer = null }
        if (candidateCheckTimer) { clearTimeout(candidateCheckTimer); candidateCheckTimer = null }
        if (iceDisconnectTimer) { clearTimeout(iceDisconnectTimer); iceDisconnectTimer = null }
        pc.close()
        slot.playerInstance = null
        ElMessage.warning('WebRTC 连接失败，已切换为 HLS')
        degradeFromWebRtc(slotIdx, slot)
      } else if (iceState === 'disconnected') {
        // disconnected = 可能是瞬态网络抖动，等待 5s 恢复，超时再降级
        if (!iceDisconnectTimer) {
          console.warn(`[WebRTC] slot${slotIdx} ICE disconnected, 等待 ${ICE_DISCONNECT_GRACE_MS}ms 恢复`)
          iceDisconnectTimer = setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              console.warn(`[WebRTC] slot${slotIdx} ICE disconnected 超过 ${ICE_DISCONNECT_GRACE_MS}ms 未恢复，降级`)
              slot.webrtcRetryCount++
              pc.close()
              slot.playerInstance = null
              ElMessage.warning('WebRTC 连接中断，已切换为 HLS')
              degradeFromWebRtc(slotIdx, slot)
            }
          }, ICE_DISCONNECT_GRACE_MS)
        }
      } else if (iceState === 'connected' || iceState === 'completed') {
        // 连接成功/恢复：清除定时器，重置重试计数
        slot.webrtcRetryCount = 0
        if (iceTimeoutTimer) { clearTimeout(iceTimeoutTimer); iceTimeoutTimer = null }
        if (candidateCheckTimer) { clearTimeout(candidateCheckTimer); candidateCheckTimer = null }
        if (iceDisconnectTimer) { clearTimeout(iceDisconnectTimer); iceDisconnectTimer = null }
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
        if (iceDisconnectTimer) { clearTimeout(iceDisconnectTimer); iceDisconnectTimer = null }
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
    degradeFromWebRtc(slotIdx, slot)
  }
}

// [P1-VP1] WebRTC 降级辅助函数：按优先级尝试 HLS → WS-FLV → FLV
function degradeFromWebRtc(slotIdx: number, slot: GridSlot) {
  if (slot.urls['hls']) {
    attachPlayerByFormat(slotIdx, 'hls')
  } else if (slot.urls['ws-flv']) {
    attachPlayerByFormat(slotIdx, 'ws-flv')
  } else if (slot.urls.flv) {
    attachPlayerByFormat(slotIdx, 'flv')
  } else {
    ElMessage.error('WebRTC 降级失败：所有播放格式均不可用')
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
// [Fix #8 一次性设计修正 2026-06-21] 防止页面加载时误触发
//   原因: preferredFormat 默认值 'flv' 可能在组件挂载时触发 watcher → 16 个 slot 全部重建
//   对标海康 iVMS-8700: 监听 preferredFormat 仅在用户手动点击切换时触发，不默认触发
watch(preferredFormat, (fmt) => {
  // 仅在 fmt 是有效格式时才重建，避免初始化默认值时的误触发
  if (!fmt || (fmt !== 'flv' && fmt !== 'ws-flv' && fmt !== 'hls' && fmt !== 'webrtc')) return
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

// 自动重连逻辑：[一次性设计修正 2026-06-23]
//   deep watcher 每秒因 bytesPerSec/fps 等字段变化而触发，但只有 status 真正转换时才需要行动。
//   对标海康 iVMS-8700：仅在状态转换(good/warning → error)时执行一次重连决策，
//   不重复处理同一状态。全局重建冷却 60s 防止连锁重建。
watch(
  () => {
    // 构建一个仅包含 status 的快照，减少不必要的深拷贝
    const snap: Record<number, string> = {}
    for (const [k, v] of Object.entries(streamHealth.healthStates)) {
      snap[Number(k)] = v.status
    }
    return snap
  },
  (newStatuses) => {
    for (const [idxStr, currentStatus] of Object.entries(newStatuses)) {
      const idx = Number(idxStr)
      if (isNaN(idx)) continue

      const prevStatus = prevStatusMap.get(idx)
      // [关键修复] 仅在 status 发生真正转换时处理，跳过每秒重复触发
      if (prevStatus === currentStatus) continue
      prevStatusMap.set(idx, currentStatus)

      const slot = gridSlots[idx]

      // 连接恢复时重置重连计数器
      // [Fix 2026-06-23] 要求 sustained good 持续 30s 才重置，防止瞬时 good 重置计数器
      //   原因：流注册/注销转换期间可能出现 1-2 秒瞬时 good（ZLM 残留数据），
      //         10s 后重置 reconnectCount → 下次 stall 重新计数 → 无限循环
      //   对标海康 iVMS：连续 30s 稳定播放才视为真正恢复
      if (currentStatus === 'good' && slot) {
        const now = Date.now()
        const lastReconnectTime = slot._lastReconnectTime || 0
        // 要求距上次重连至少 30s（之前是 10s），确保流真正稳定
        if (lastReconnectTime === 0 || (now - lastReconnectTime) > 30000) {
          slot.reconnectCount = 0
          reconnectDebounce.delete(idx)
          console.debug(`[LiveView] slot${idx} 持续稳定 30s+，重置重连计数器`)
        }
        continue
      }

      // 仅 error 状态触发重连
      if (currentStatus !== 'error') continue
      if (!AUTO_RECONNECT_ENABLED) continue
      if (reconnecting.has(idx)) continue
      if (formatSwitching.has(idx)) continue

      const now = Date.now()

      // [关键修复] 全局重建冷却：任何 slot 重建后 60s 内不再触发自动重连
      //   防止多 slot 同时 error 导致连锁重建（对标海康 iVMS 全局冷却机制）
      if (now - lastGlobalRebuildAt < GLOBAL_REBUILD_COOLDOWN_MS) {
        const remain = Math.ceil((GLOBAL_REBUILD_COOLDOWN_MS - (now - lastGlobalRebuildAt)) / 1000)
        console.warn(`[StreamHealth] slot${idx} 全局重建冷却期（${remain}s 后解除），跳过`)
        continue
      }

      // 协议降级冷却期
      const lastSwitch = formatCooldown.get(idx) || 0
      if (now - lastSwitch < FORMAT_COOLDOWN_MS) {
        console.warn(`[StreamHealth] slot${idx} 在降级冷却期内，跳过`)
        continue
      }

      if (!slot?.channelId || !slot.playing) continue

      if (slot.reconnectCount > MAX_SAME_FORMAT_RETRIES) {
        console.warn(`[StreamHealth] slot${idx} 已达最大重连次数(${MAX_SAME_FORMAT_RETRIES})，停止自动重连`)
        reconnecting.delete(idx)
        continue
      }

      // 记录全局重建时间戳
      lastGlobalRebuildAt = now
      reconnecting.add(idx)
      slot.reconnectCount++
      slot._lastReconnectTime = Date.now()
      reconnectDebounce.set(idx, now)

      const currentFmt = slot.currentFormat as PlayerFormat
      let targetFmt = currentFmt

      if (currentFmt === 'webrtc') {
        targetFmt = slot.urls['flv'] ? 'flv' : (slot.urls['hls'] ? 'hls' : 'webrtc')
        console.warn(`[StreamHealth] slot${idx} WebRTC 重连失败，切换到 ${targetFmt}`)
      } else {
        console.warn(`[StreamHealth] slot${idx} status→error，同格式重连 ${targetFmt} (${slot.reconnectCount}/${MAX_SAME_FORMAT_RETRIES})`)
      }

      streamHealth.stopMonitoring(idx)

      // [Fix 2026-06-23] 使用 reconnectStream 重新获取流地址，而非复用陈旧 URL
      //   reconnectStream 内部会销毁旧播放器、调用 /start 获取新 URL、重新播放
      setTimeout(() => {
        reconnectStream(idx, targetFmt || undefined).finally(() => {
          reconnecting.delete(idx)
        })
      }, 500)
    }
  },
  { deep: true }
)

// [一次性设计修正 2026-06-23] URL 规范化：后端可能返回绝对 URL (http://127.0.0.1:9080/...)
//   绝对 URL 走直连 → CORS 失败 → 黑屏。统一转相对路径走 Vite 代理。
async function fetchStreamUrls(ch: Channel): Promise<{urls: Partial<Record<PlayerFormat, string>>, codec: string} | null> {
  // URL 规范化辅助函数
  const norm = (u: string, isWs = false) =>
    isWs ? normalizeWsFlvUrl(u) : normalizeStreamUrl(u)

  try {
    // 1. 启动国标设备推流 (GB28181 INVITE)，直接从响应中获取播放URL
    //    [Fix 2026-06-23] 使用全局防抖，同通道 5s 内不重复发 SIP INVITE
    let startData: any = null
    let codec = ''
    const skipStart = channelStore.shouldSkipStart(ch.id)
    if (!skipStart) {
      try {
        const { data: startResp } = await streamHttp.post(`/${ch.id}/start`)
        startData = startResp?.data || startResp
      } catch (e: any) { console.warn('[LiveView] start stream failed (may already be streaming):', e?.message || e) }
    } else {
      console.debug(`[LiveView] ch=${ch.id} /start 全局防抖窗口内，跳过 SIP INVITE`)
    }

    // /start 响应已包含 flvUrl/webrtcUrl，zlmReady=true 时直接使用
    if (startData && (startData.flvUrl || startData.webrtcUrl) && startData.zlmReady) {
      codec = startData.codec || ''
      return {
        urls: {
          flv: norm(startData.flvUrl || ''),
          webrtc: norm(startData.webrtcUrl || ''),
          'ws-flv': norm(startData.wsFlvUrl || '', true),
          hls: norm(startData.hlsUrl || ''),
        },
        codec,
      }
    }

    // 2. zlmReady=false 或 start 失败时，轮询 multi-urls 等待流就绪（8×80ms=640ms）
    //    [Fix 2026-06-23] 必须检查 streamAlive=true，防止使用幻影 URL
    let streamWasAlive = false  // [FIX-RC4] 追踪 multi-urls 是否检测到过活的流
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const { data } = await streamHttp.get(`/${ch.id}/multi-urls`)
        const d = data?.data || data
        if (d?.streamAlive && (d?.flvUrl || d?.webrtcUrl || d?.hlsUrl)) {
          streamWasAlive = true
          return {
            urls: {
              flv: norm(d.flvUrl || ''),
              webrtc: norm(d.webrtcUrl || ''),
              'ws-flv': norm(d.wsFlvUrl || '', true),
              hls: norm(d.hlsUrl || ''),
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
                flv: norm(d.flvUrl || ''),
                'ws-flv': norm(d.wsFlvUrl || '', true),
                hls: norm(d.hlsUrl || ''),
                webrtc: norm(d.webrtcUrl || ''),
              },
              codec: d.codec || '',
            }
          }
        } catch { /* 流可能还未就绪 */ }
      }
      await new Promise(r => setTimeout(r, 80))
    }

    // [FIX-RC4 2026-06-28] 防抖窗口内复用失败时，强制 /start 重试一次
    //   原问题: 防抖窗口内 skipStart=true 跳过 /start，但 ZLM 流可能已被关闭
    //   (streamNoneReaderDelayMS 到期)，multi-urls 返回 streamAlive=false
    //   前端直接返回 null → 黑屏
    //   修复: 强制发一次 /start 触发重新 SIP INVITE
    if (skipStart && !streamWasAlive) {
      console.warn(`[LiveView] ch=${ch.id} 防抖窗口内但流已失效，强制 /start 重试`)
      try {
        const { data: retryResp } = await streamHttp.post(`/${ch.id}/start`)
        const retryData = retryResp?.data || retryResp
        if (retryData && (retryData.flvUrl || retryData.webrtcUrl) && retryData.zlmReady) {
          return {
            urls: {
              flv: norm(retryData.flvUrl || ''),
              webrtc: norm(retryData.webrtcUrl || ''),
              'ws-flv': norm(retryData.wsFlvUrl || '', true),
              hls: norm(retryData.hlsUrl || ''),
            },
            codec: retryData.codec || '',
          }
        }
      } catch (e: any) {
        console.error('[LiveView] forced /start retry failed:', e?.message || e)
      }
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
function maximizeSlot(idx: number, event?: MouseEvent) {
  activeSlotIdx.value = idx
  if (event && (event.target as HTMLElement)?.tagName === 'VIDEO') {
    onVideoDblClick3D(idx, event)
    return
  }
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

// ═══ P0-1: 主/子码流切换 (对标海康 iVMS 双码流策略) ═══
async function switchStreamQuality(quality: 'main' | 'sub') {
  if (streamQuality.value === quality) return
  streamQuality.value = quality
  ElMessage.info(quality === 'sub' ? '已切换到子码流 (流畅模式)' : '已切换到主码流 (高清模式)')
  for (let i = 0; i < gridSlots.length; i++) {
    const slot = gridSlots[i]
    if (slot.playing && slot.channelId) {
      const fmt = slot.currentFormat as PlayerFormat
      try { await streamHttp.post(`/${slot.channelId}/stop`) } catch { /* ignore */ }
      destroyPlayer(slot, i)
      const ch: Channel = { id: slot.channelId, name: slot.name, deviceId: slot.deviceId, status: slot.status } as any
      const result = await fetchStreamUrls(ch)
      if (result && result.urls) {
        slot.urls = result.urls
        slot.codec = result.codec || slot.codec
        nextTick(() => attachPlayerByFormat(i, fmt || undefined))
      }
    }
  }
}
watch(layout, (newLayout) => {
  if (newLayout >= 9 && streamQuality.value === 'main') {
    ElMessage.info('多路预览已自动切换到子码流')
    switchStreamQuality('sub')
  }
})

// ═══ P0-2: PTZ 巡航/轨迹/3D zoom ═══
function toggleCruise() {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot?.deviceId) return
  if (isCruising.value) {
    ptzStopCruise(slot.deviceId, slot.channelId).catch(() => {})
    isCruising.value = false
    ElMessage.info('已停止巡航')
  } else {
    ptzApi({ deviceId: slot.deviceId, channelId: slot.channelId, direction: 'cruise_start', speed: ptzSpeed.value }).catch(() => {})
    isCruising.value = true
    ElMessage.success('已启动巡航')
  }
}
function ptzCruise(path: number) {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot?.deviceId) return
  ptzStartCruise(slot.deviceId, { channelId: slot.channelId, cruisePath: path, speed: ptzSpeed.value }).catch(() => {})
  isCruising.value = true
  ElMessage.success(`已切换到巡航路径 ${path}`)
}
function toggleTrack() {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot?.deviceId) return
  if (isTracking.value) {
    ptzStopTrack(slot.deviceId, slot.channelId).catch(() => {})
    isTracking.value = false
    ElMessage.info('已停止轨迹跟踪')
  } else {
    ptzApi({ deviceId: slot.deviceId, channelId: slot.channelId, direction: 'track_start' }).catch(() => {})
    isTracking.value = true
    ElMessage.success('已启动轨迹跟踪')
  }
}
function ptzTrack(trackId: number) {
  const slot = gridSlots[activeSlotIdx.value]
  if (!slot?.deviceId) return
  ptzStartTrack(slot.deviceId, { channelId: slot.channelId, trackId }).catch(() => {})
  isTracking.value = true
  ElMessage.success(`已切换到轨迹 ${trackId}`)
}
function onVideoDblClick3D(idx: number, event: MouseEvent) {
  const slot = gridSlots[idx]
  if (!slot?.deviceId) return
  const video = videoRefs.value[idx]
  if (!video) return
  const rect = video.getBoundingClientRect()
  const centerX = (event.clientX - rect.left) / rect.width
  const centerY = (event.clientY - rect.top) / rect.height
  const currentZoom = (slot as any)._zoomLevel || 1
  const newZoom = Math.min(currentZoom * 2, 8)
  ;(slot as any)._zoomLevel = newZoom
  ptz3DPosition(slot.deviceId, {
    channelId: slot.channelId,
    centerPan: Math.max(0, Math.min(1, centerX)),
    centerTilt: Math.max(0, Math.min(1, centerY)),
    zoomLevel: newZoom,
  }).catch(() => {})
  ElMessage.info(`3D 定位: (${Math.round(centerX * 100)}%, ${Math.round(centerY * 100)}%) 放大 ${newZoom}x`)
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
  imageAdjust.mirrorH = false; imageAdjust.mirrorV = false; imageAdjust.rotate = 0
}

// 时钟
let clockTimer: ReturnType<typeof setInterval> | null = null

function updateClock() {
  currentTime.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

onMounted(() => {
  loadData()
  loadPatrolGroups()  // [P2-VP3] 加载轮巡组配置
  updateClock()
  clockTimer = setInterval(updateClock, 1000)

  // 恢复之前活跃的通道（从全局 Store）
  restoreFromStore()

  // P1-3: 检测 WebCodecs 硬件解码支持
  checkWebCodecsSupport()

  // [P1-CO2] 推理检测框叠加: 监听全局 WS 事件 + 启动 Canvas 绘制循环
  window.addEventListener('inference-detection', onInferenceDetection)
  detectionRafId = requestAnimationFrame(drawDetections)
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
  // P1-4: 清理自动轮巡
  if (autoPatrolTimer) clearInterval(autoPatrolTimer)
  // 清理健康监测
  streamHealth.cleanup()
  // [P1-CO2] 清理检测框叠加
  window.removeEventListener('inference-detection', onInferenceDetection)
  if (detectionRafId) cancelAnimationFrame(detectionRafId)
  // 有活跃通道时软关闭（不通知后端停流），否则硬关闭
  if (channelStore.hasActive) {
    for (let i = 0; i < gridSlots.length; i++) closeSlot(i, false)  // soft close
    channelStore.showFloatingPreview = true
  } else {
    for (let i = 0; i < gridSlots.length; i++) closeSlot(i)  // hard close
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
/* [P1-CO2] AI 检测框 Canvas 叠加层 */
.detection-canvas {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  object-fit: contain; pointer-events: none; z-index: 5;
}
/* [P3-CO3] E2E 延迟徽标 */
.latency-badge {
  display: inline-flex; align-items: center; padding: 2px 8px;
  border-radius: 10px; font-size: 11px; font-weight: 600;
  font-family: var(--font-mono, monospace); cursor: default;
}
.latency-good { background: rgba(103,194,58,0.15); color: #67c23a; }
.latency-warn { background: rgba(230,162,60,0.15); color: #e6a23c; }
.latency-bad { background: rgba(245,108,108,0.15); color: #f56c6c; }
/* [P2-VP3] 轮巡组列表项 */
.patrol-group-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px; margin-bottom: 4px; border-radius: 4px; cursor: pointer;
  transition: background 0.15s;
}
.patrol-group-item:hover { background: rgba(0,212,170,0.1); }
.patrol-group-item.active {
  background: rgba(0,212,170,0.15);
  border-left: 2px solid #00D4AA;
}
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
.ptz-advanced { display: flex; align-items: center; gap: 8px; width: 100%; font-size: 12px; color: #9AA0A6; }
.ptz-advanced > span { width: 32px; flex-shrink: 0; }
.ptz-3d-hint { display: flex; align-items: center; gap: 4px; width: 100%; font-size: 11px; color: #4A4D58; margin-top: 4px; }
/* 25/36 宫格大屏模式 */
.video-grid.grid-25 { display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(5, 1fr); }
.video-grid.grid-36 { display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(6, 1fr); }
</style>
