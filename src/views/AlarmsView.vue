<template>
  <div class="alarms-page">
    <!-- ===== 统计卡片 ===== -->
    <el-row :gutter="16" class="alarm-stats-row">
      <el-col :span="6" v-for="s in alarmStatCards" :key="s.label">
        <el-card shadow="hover" class="alarm-stat-card" :body-style="{ padding: '16px 20px' }">
          <div class="alarm-stat-content">
            <div class="alarm-stat-icon" :style="{ background: s.color }">
              <el-icon :size="20"><component :is="s.icon" /></el-icon>
            </div>
            <div class="alarm-stat-body">
              <div class="alarm-stat-value" :style="{ color: s.color }">{{ s.value }}</div>
              <div class="alarm-stat-label">{{ s.label }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 工具栏 ===== -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <!-- 告警级别筛选 -->
          <el-select v-model="levelFilter" placeholder="告警级别" style="width: 130px" clearable @change="handleFilterChange">
            <el-option label="全部" value="" />
            <el-option label="🔴 严重" value="critical" />
            <el-option label="🟠 高" value="high" />
            <el-option label="🟡 中" value="medium" />
            <el-option label="🟢 低" value="low" />
          </el-select>

          <!-- 告警类型筛选 -->
          <el-select v-model="typeFilter" placeholder="告警类型" style="width: 140px" clearable @change="handleFilterChange">
            <el-option label="全部" value="" />
            <el-option label="入侵检测" value="intrusion" />
            <el-option label="烟火检测" value="fire" />
            <el-option label="徘徊检测" value="loitering" />
            <el-option label="安全帽检测" value="helmet" />
            <el-option label="打架检测" value="violence" />
          </el-select>

          <!-- 处理状态筛选 -->
          <el-select v-model="statusFilter" placeholder="处理状态" style="width: 130px" clearable @change="handleFilterChange">
            <el-option label="全部" value="" />
            <el-option label="未处理" value="unhandled" />
            <el-option label="已确认收到" value="acknowledged" />
            <el-option label="处置中" value="disposed" />
            <el-option label="已升级" value="escalated" />
            <el-option label="已确认" value="confirmed" />
            <el-option label="误报" value="false_alarm" />
            <el-option label="已关闭" value="closed" />
            <el-option label="已解决" value="resolved" />
          </el-select>

          <!-- 时间范围 -->
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 360px"
            :shortcuts="dateShortcuts"
            @change="handleFilterChange"
          />

          <!-- 搜索 -->
          <el-input
            v-model="search"
            placeholder="搜索告警描述/设备名..."
            style="width: 200px"
            clearable
            @change="handleFilterChange"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>

        <div class="toolbar-right">
          <!-- [P3-VP2] 视图切换 -->
          <el-radio-group v-model="viewMode" size="small" style="margin-right:8px">
            <el-radio-button label="table">列表</el-radio-button>
            <el-radio-button label="gallery">证据库</el-radio-button>
          </el-radio-group>
          <el-button @click="refreshAlarms" :loading="loading">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
          <el-button @click="exportAlarms">
            <el-icon><Download /></el-icon>导出
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- ===== [安检对标优化 2026-08-30] 复核质控统计条 ===== -->
    <el-alert
      v-if="fbStats"
      type="info" :closable="false" class="qc-strip" show-icon
      :title="`复核质控: 已标注 ${fbStats.total} 条 · 误报 ${fbStats.falsePositives} · 标注误报率 ${(fbStats.falseRate * 100).toFixed(1)}% · 待复核约 ${fbStats.pending} 条 (近 30 天)`" />

    <!-- ===== 批量操作栏 ===== -->
    <div v-if="selected.length > 0" class="batch-bar" :class="{ visible: selected.length > 0 }">
      <span class="batch-info">已选 <strong>{{ selected.length }}</strong> 条告警</span>
      <el-button size="small" type="success" @click="handleBatchConfirm">
        <el-icon><CircleCheck /></el-icon>批量确认 ({{ selected.length }})
      </el-button>
      <el-button size="small" type="warning" @click="handleBatchFalse">
        <el-icon><WarningFilled /></el-icon>批量误报 ({{ selected.length }})
      </el-button>
      <el-button size="small" @click="selected = []">取消选择</el-button>
    </div>

    <!-- ===== [安检对标优化 2026-08-30] 复核标注 dialog ===== -->
    <!--   判定标注独立于处置工作流: verdict 写 false_alarm_feedback 并同步 status -->
    <!-- [UX 2026-08-31] 告警类弹窗统一关闭策略: 禁遮罩点击/禁 ESC (需求 2d) -->
    <el-dialog v-model="reviewVisible" title="告警复核标注" width="480px"
               :close-on-click-modal="false" :close-on-press-escape="false">
      <div v-if="reviewTarget" class="review-body">
        <div class="review-target">
          {{ reviewTarget.description || reviewTarget.type }} · {{ reviewTarget.channelName || reviewTarget.channelId }}
        </div>
        <el-radio-group v-model="reviewVerdict" class="review-verdicts">
          <el-radio-button label="true_positive">真实告警</el-radio-button>
          <el-radio-button label="false_positive">误报</el-radio-button>
          <el-radio-button label="unsure">存疑</el-radio-button>
        </el-radio-group>
        <el-input
          v-model="reviewNote" type="textarea" :rows="3"
          placeholder="备注 (可选): 误报原因 / 处置说明..." />
        <div class="review-hint">
          提交后写入复核库并同步处置状态 (误报→false_alarm / 真实→confirmed), 同时反馈自适应阈值优化器用于误报抑制。
        </div>
      </div>
      <template #footer>
        <el-button @click="reviewVisible = false">取消</el-button>
        <el-button type="primary" :loading="reviewSubmitting" @click="submitReview">提交复核</el-button>
      </template>
    </el-dialog>

    <!-- ===== [P3-VP2] 证据库视图（截图/录像统一管理） ===== -->
    <el-card v-if="viewMode === 'gallery'" shadow="never" class="evidence-gallery">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:600">证据库 — 告警截图/录像集中查看</span>
          <span style="font-size:12px;color:#909399">
            共 {{ galleryItems.length }} 个告警，含 {{ galleryItems.filter(i => i.snapshot).length }} 个截图、{{ galleryItems.filter(i => i.videoClip).length }} 个录像
          </span>
        </div>
      </template>
      <div v-if="galleryItems.length === 0" style="text-align:center;color:#888;padding:40px">
        暂无告警证据
      </div>
      <el-row v-else :gutter="12">
        <el-col v-for="item in galleryItems" :key="item.id" :xs="24" :sm="12" :md="8" :lg="6" style="margin-bottom:12px">
          <el-card shadow="hover" class="evidence-item" :body-style="{ padding: '8px' }">
            <!-- 截图预览 -->
            <div class="evidence-thumb">
              <img
                v-if="item.snapshot"
                :src="item.snapshot"
                loading="lazy"
                style="width:100%;height:120px;object-fit:cover;border-radius:4px;cursor:pointer"
                @click="openGalleryPreview(item)"
              />
              <div v-else style="width:100%;height:120px;background:#1a1a2e;display:flex;align-items:center;justify-content:center;color:#555;border-radius:4px">
                无截图
              </div>
              <div v-if="item.videoClip" class="evidence-clip-badge">📼 录像</div>
            </div>
            <div style="margin-top:8px;font-size:12px">
              <div style="font-weight:600;display:flex;justify-content:space-between">
                <span>{{ item.type }}</span>
                <el-tag size="small" :type="levelTagType(item.severity)" effect="light">{{ severityLabel(item.severity) }}</el-tag>
              </div>
              <div style="color:#909399;margin-top:4px">{{ item.deviceName || item.deviceId }} · {{ item.channelName || item.channelId }}</div>
              <div style="color:#666;margin-top:2px">{{ formatTime(item.createdAt) }}</div>
            </div>
            <!-- 三个操作入口 -->
            <div class="evidence-actions">
              <el-tooltip content="查看图片" placement="top" :show-after="300">
                <el-button
                  v-if="item.snapshot"
                  size="small"
                  @click="openGalleryPreview(item)"
                >
                  <el-icon><Picture /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="查看回放" placement="top" :show-after="300">
                <el-button
                  size="small"
                  type="primary"
                  @click="openInlineVideo(item)"
                >
                  <el-icon><VideoPlay /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="去回放页面" placement="top" :show-after="300">
                <el-button
                  size="small"
                  @click="jumpToAlarmPlayback(item)"
                >
                  <el-icon><Position /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 证据库分页 -->
      <div class="pagination-wrap" v-if="totalAlarms > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="totalAlarms"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- ===== 告警表格 ===== -->
    <el-card v-if="viewMode === 'table'" shadow="never" class="table-card">
      <el-table
        :data="paginatedAlarms"
        stripe
        height="max(calc(100vh - 360px), 300px)"
        style="width: 100%"
        @selection-change="(val: any[]) => selected = val"
        @row-click="onRowClickDetail"
        :default-sort="{ prop: 'createdAt', order: 'descending' }"
        row-key="id"
        v-loading="loading"
      >
        <!-- 选择 -->
        <el-table-column type="selection" width="48" />

        <!-- 告警级别 -->
        <el-table-column prop="severity" label="级别" width="80" sortable>
          <template #default="{ row }">
            <div class="level-cell">
              <span class="level-dot" :class="row.severity"></span>
              <el-tag :type="levelTagType(row.severity)" size="small" effect="light">
                {{ severityLabel(row.severity) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <!-- 快照缩略图 -->
        <el-table-column label="快照" width="80" align="center">
          <template #default="{ row }">
            <img
              v-if="getSnapshotUrl(row)"
              :src="getSnapshotUrl(row)"
              loading="lazy"
              style="width:56px;height:32px;object-fit:cover;border-radius:4px;cursor:pointer"
              @click.stop="openSnapshotPreview(row)"
              @error="() => console.warn('[AlarmsView] snapshot load failed:', getSnapshotUrl(row))"
            />
            <span v-else class="text-secondary" style="font-size:11px">无</span>
          </template>
        </el-table-column>

        <!-- 告警类型 -->
        <el-table-column prop="type" label="类型" width="130">
          <template #default="{ row }">
            <span class="type-badge">{{ row.type }}</span>
          </template>
        </el-table-column>

        <!-- 设备 -->
        <el-table-column prop="deviceName" label="设备" width="160">
          <template #default="{ row }">
            <div class="device-cell">
              <span class="device-status-dot" :class="row.deviceStatus || 'online'"></span>
              <span>{{ row.deviceName || row.deviceId }}</span>
            </div>
          </template>
        </el-table-column>

        <!-- 描述 -->
        <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="desc-cell">
              <span class="desc-text">{{ row.description || row.title }}</span>
            </div>
          </template>
        </el-table-column>

        <!-- 置信度 -->
        <el-table-column prop="aiConfidence" label="置信度" width="100" sortable align="center">
          <template #default="{ row }">
            <el-progress
              :percentage="confPct(row)"
              :color="confidenceColor(row.aiConfidence)"
              :stroke-width="6"
              :show-text="true"
            >
              <span style="font-size: 11px; color: var(--app-text-secondary)">
                {{ confPct(row) }}%
              </span>
            </el-progress>
          </template>
        </el-table-column>

        <!-- AI解释 -->
        <el-table-column prop="aiAnalysis" label="AI解释" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tooltip :content="row.aiAnalysis || '无AI解释'" placement="top" :show-after="1500" effect="dark">
              <span class="xai-text">{{ row.aiAnalysis || '-' }}</span>
            </el-tooltip>
          </template>
        </el-table-column>

        <!-- 时间 -->
        <el-table-column prop="createdAt" label="时间" width="170" sortable>
          <template #default="{ row }">
            <span class="time-text">{{ formatTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <!-- 状态 -->
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(row.status)"
              size="small"
              effect="plain"
              :class="{ 'status-pending': row.status === 'unhandled' }"
            >
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 操作 -->
        <el-table-column label="操作" width="340" fixed="right">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button
                size="small"
                type="primary"
                link
                @click="handleAck(row)"
                v-if="row.status === 'unhandled'"
              >
                确认
              </el-button>
              <el-button
                size="small"
                type="success"
                link
                @click="handleDispose(row)"
                v-if="row.status === 'unhandled' || row.status === 'acknowledged' || row.status === 'escalated'"
              >
                处置
              </el-button>
              <el-button
                size="small"
                type="warning"
                link
                @click="handleCloseAlarm(row)"
                v-if="row.status === 'acknowledged' || row.status === 'disposed' || row.status === 'escalated' || row.status === 'reassigned'"
              >
                关闭
              </el-button>
              <el-dropdown @command="(cmd: string) => handleLifecycleCommand(cmd, row)" trigger="click">
                <el-button size="small" type="info" link>更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="escalate" v-if="row.status !== 'closed' && row.status !== 'false_alarm'">升级告警</el-dropdown-item>
                    <el-dropdown-item command="reassign" v-if="row.status !== 'closed'">转派处理</el-dropdown-item>
                    <el-dropdown-item command="false_alarm" :disabled="row.status === 'closed'">标记误报</el-dropdown-item>
                    <!-- [安检对标优化 2026-08-30] 复核判定标注 (独立于处置工作流) -->
                    <el-dropdown-item command="review" divided>
                      {{ verdictMap.has(row.id) ? `已复核: ${verdictText(verdictMap.get(row.id))}` : '复核标注' }}
                    </el-dropdown-item>
                    <el-dropdown-item command="ignore" :disabled="row.status === 'closed'">忽略</el-dropdown-item>
                    <el-dropdown-item command="evidence" divided>证据链</el-dropdown-item>
                    <el-dropdown-item command="detail">详情</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrap" v-if="totalAlarms > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="totalAlarms"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- ===== 告警详情弹窗 [UX 2026-08-31 已拆除]: 详情统一走全局 AlarmPopup
         (components/alarm/AlarmPopup.vue, 含快照/实时流/回放/AI研判/确认/误报),
         由 handleDetail → showAlarmPopup 触发 -->

    <!-- ===== 证据链弹窗 ===== -->
    <el-dialog v-model="showEvidenceDialog" title="告警证据链" width="720px" destroy-on-close
               :close-on-click-modal="false" :close-on-press-escape="false">
      <div v-loading="evidenceLoading">
        <template v-if="evidenceData">
          <el-row :gutter="16">
            <!-- 快照 -->
            <el-col :span="12">
              <div class="evidence-section">
                <div class="evidence-section-title">告警快照</div>
                <el-image
                  v-if="evidenceData?.snapshotUrl"
                  :src="evidenceData?.snapshotUrl"
                  fit="contain"
                  style="width:100%;max-height:300px;border-radius:8px;border:1px solid var(--app-border)"
                  :preview-src-list="evidenceData?.snapshotUrl ? [evidenceData.snapshotUrl] : []"
                  :preview-teleported="true"
                />
                <el-empty v-else description="无快照" :image-size="60" />
              </div>
            </el-col>
            <!-- 视频片段 -->
            <el-col :span="12">
              <div class="evidence-section">
                <div class="evidence-section-title">视频片段</div>
                <video
                  v-if="evidenceData?.videoClipUrl"
                  :src="evidenceData?.videoClipUrl"
                  controls
                  style="width:100%;max-height:300px;border-radius:8px;background:#000"
                />
                <el-empty v-else description="无视频片段" :image-size="60" />
              </div>
            </el-col>
          </el-row>
          <!-- AI 检测框 -->
          <div v-if="evidenceData.detectionBoxes?.length" class="evidence-section" style="margin-top:16px">
            <div class="evidence-section-title">AI 检测目标</div>
            <el-table :data="evidenceData.detectionBoxes" size="small" stripe>
              <el-table-column prop="label" label="目标" width="120" />
              <el-table-column label="置信度" width="100">
                <template #default="{ row }">
                  <span :style="{ color: row.confidence >= 0.8 ? '#10B981' : row.confidence >= 0.5 ? '#F59E0B' : '#EF4444' }">
                    {{ (row.confidence * 100).toFixed(1) }}%
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="位置">
                <template #default="{ row }">[{{ row.x }}, {{ row.y }}, {{ row.w }}, {{ row.h }}]</template>
              </el-table-column>
            </el-table>
          </div>
          <!-- AI 分析 -->
          <div v-if="evidenceData.aiAnalysis" class="evidence-section" style="margin-top:16px">
            <div class="evidence-section-title">AI 分析结论</div>
            <div class="xai-detail">{{ evidenceData.aiAnalysis }}</div>
          </div>
          <!-- 设备录像 -->
          <div class="evidence-section" style="margin-top:16px">
            <div class="evidence-section-title">
              设备录像
              <el-tag v-if="evidenceAlarmRow?.deviceName" size="small" type="info" style="margin-left:8px">
                {{ evidenceAlarmRow.deviceName }}
              </el-tag>
              <span v-if="recordingsLoading" style="margin-left:8px;font-size:12px;color:#999">加载中...</span>
              <span v-else-if="deviceRecordings.length" style="margin-left:8px;font-size:12px;color:#999">
                找到 {{ deviceRecordings.length }} 段录像
              </span>
            </div>
            <div v-if="evidenceData.relatedRecordingId" style="margin-bottom:8px">
              <el-button type="primary" size="small" @click="goToRecording(evidenceData.relatedRecordingId!)">
                跳转到关联录像 {{ evidenceData.relatedRecordingTime ? '(' + evidenceData.relatedRecordingTime + ')' : '' }}
              </el-button>
            </div>
            <el-table
              v-if="deviceRecordings.length > 0"
              :data="deviceRecordings"
              v-loading="recordingsLoading"
              size="small"
              stripe
              max-height="240"
              style="width:100%"
            >
              <el-table-column label="开始时间" width="100">
                <template #default="{ row }">
                  {{ row.start_time?.split('T')[1]?.substring(0, 8) || row.start_time }}
                </template>
              </el-table-column>
              <el-table-column label="结束时间" width="100">
                <template #default="{ row }">
                  {{ row.end_time?.split('T')[1]?.substring(0, 8) || row.end_time }}
                </template>
              </el-table-column>
              <el-table-column label="大小" width="100">
                <template #default="{ row }">
                  {{ row.file_size ? (row.file_size / 1048576).toFixed(1) + ' MB' : '-' }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button type="primary" size="small" link @click="playEvidenceRecording(row)">播放</el-button>
                  <el-button size="small" link @click="goToRecording(row.id)">回放页</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-else-if="!recordingsLoading && evidenceAlarmRow?.deviceId" style="padding:12px 0;color:#999;font-size:13px">
              该设备在报警时间前后1小时内无录像记录
            </div>
            <div v-else-if="!recordingsLoading && !evidenceAlarmRow?.deviceId" style="padding:12px 0;color:#999;font-size:13px">
              该告警未关联视频设备，无法查询录像
            </div>
          </div>
          <!-- AI 二次分析 -->
          <div style="margin-top:16px;text-align:right">
            <el-button type="primary" :loading="analyzeLoading" @click="doAnalyze">
              AI 二次分析
            </el-button>
          </div>
        </template>
        <el-empty v-else-if="!evidenceLoading" description="无法获取证据链数据" />
      </div>
    </el-dialog>

    <!-- 图片预览 + 检测框标注 (vp6 P1-3 2026-09-01: el-image-viewer 无叠层能力,
         改 dialog + SnapshotAnnotated SVG overlay, 检测直报链 detections 像素坐标
         在组件内按图像自然尺寸归一化) -->
    <el-dialog
      v-model="previewVisible"
      title="告警快照"
      width="760px"
      destroy-on-close
      align-center
    >
      <SnapshotAnnotated :src="previewImageUrl" :metadata="previewMeta ?? undefined" />
    </el-dialog>

    <!-- Gallery 灯箱预览 (支持左右切换) -->
    <el-image-viewer
      v-if="galleryPreviewVisible"
      :url-list="galleryPreviewList"
      :initial-index="galleryPreviewIndex"
      @close="galleryPreviewVisible = false"
    />

    <!-- 内嵌视频播放弹窗 -->
    <el-dialog
      v-model="inlineVideoVisible"
      :title="inlineVideoTitle"
      width="760px"
      destroy-on-close
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      @close="inlineVideoUrl = ''; inlineVideoMode = 'none'"
    >
      <div v-loading="inlineVideoLoading" style="min-height:300px">
        <!-- 模式1: 录像片段直接播放 -->
        <video
          v-if="inlineVideoMode === 'clip' && inlineVideoUrl"
          :src="inlineVideoUrl"
          controls
          autoplay
          style="width:100%;max-height:420px;background:#000;border-radius:4px"
        />
        <!-- 模式2: 实时 FLV 流播放 (使用 flv.js) -->
        <div v-else-if="inlineVideoMode === 'live' && inlineVideoUrl" style="width:100%">
          <div style="font-size:12px;color:#909399;margin-bottom:6px">
            ⚠️ 无告警录像片段，正在播放该通道实时画面
          </div>
          <video
            ref="inlineFlvVideoRef"
            muted
            autoplay
            style="width:100%;max-height:420px;background:#000;border-radius:4px"
          />
        </div>
        <!-- 模式3: 无可用视频 -->
        <div v-else-if="inlineVideoMode === 'none' && !inlineVideoLoading" style="text-align:center;padding:60px 20px">
          <el-icon :size="48" color="#555"><VideoPlay /></el-icon>
          <p style="margin-top:16px;color:#909399">该告警暂无录像片段</p>
          <el-button type="primary" style="margin-top:12px" @click="inlineVideoVisible = false; jumpToAlarmPlayback(inlineVideoItem)">
            去回放页面查看设备录像
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Bell, Warning, CircleCheck, Clock,
  Search, Refresh, Download, WarningFilled,
  Picture, VideoPlay, Position, ArrowDown,
} from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import { screeningApi, type AlarmFeedbackItem } from '@/api/screening'
import { exportApi } from '@/api/export'
import { queryRecordings, toLocalISOString, type DeviceRecording } from '@/api/recording'
import { recordingHttp } from '@/api/http'
import type { AlarmHandleForm, AlarmEvidence, AlarmEvent } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'
import { useAuthStore } from '@/stores/auth'
import { useWebSocket } from '@/composables/useWebSocket'
// [UX 2026-08-31] 1b: 列表行点击 → 全局告警详情弹窗 (与首页同套 AlarmPopup)
import { showAlarmPopup } from '@/composables/useAlarmPopup'
import SnapshotAnnotated from '@/views/perimeter/SnapshotAnnotated.vue'
import { useRouter } from 'vue-router'
import flvjs from 'flv.js'

// ── 严重等级中文映射 ──
const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '信息',
}

// ── 筛选状态 ──
const levelFilter = ref('')
const typeFilter = ref('')
const statusFilter = ref('')
const dateRange = ref<any[]>([])
const search = ref('')
const selected = ref<any[]>([])
const currentPage = ref(1)
const pageSize = ref(20)
const loading = ref(false)

// ── 告警数据 ──
const alarms = shallowRef<any[]>([])
const totalAlarms = ref(0)

// ── 详情弹窗 ──
const showDetailDialog = ref(false) // [UX 2026-08-31] 已废弃: 原 detail dialog 拆除, 详情统一走全局 AlarmPopup
void showDetailDialog

// ── 证据链弹窗 ──
const router = useRouter()
const showEvidenceDialog = ref(false)
const evidenceLoading = ref(false)
const evidenceData = ref<AlarmEvidence | null>(null)
const evidenceAlarmId = ref('')
const analyzeLoading = ref(false)
const previewVisible = ref(false)
const previewImageUrl = ref('')
// [vp6 P1-3 2026-09-01] 预览快照的标注 metadata (store normalizeAlarm 已兜底合并
//   原始键; 此处再防御字符串形态 — 历史/直赋值链不至于又断)
const previewMeta = ref<Record<string, unknown> | null>(null)
function openSnapshotPreview(row: any) {
  previewImageUrl.value = getSnapshotUrl(row)
  let m = row?.metadata
  if (typeof m === 'string') {
    try { m = JSON.parse(m) } catch { m = null }
  }
  previewMeta.value = m && typeof m === 'object' && !Array.isArray(m) ? m : null
  previewVisible.value = true
}
// [P3-VP2] 视图切换 + 证据库
const viewMode = ref<'table' | 'gallery'>('table')
const galleryItems = computed(() => {
  return paginatedAlarms.value.map(a => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    deviceName: a.deviceName,
    deviceId: a.deviceId,
    channelName: a.channelName,
    channelId: a.channelId,
    createdAt: a.createdAt,
    snapshot: getSnapshotUrl(a),
    videoClip: getVideoClipUrl(a),
  }))
})
function getVideoClipUrl(alarm: any): string {
  return alarm?.videoClipUrl || alarm?.video_clip_url || ''
}
// [FIX 2026-07-15] 内嵌视频播放弹窗 — 支持 video_clip / live FLV / 提示跳转
const inlineVideoVisible = ref(false)
const inlineVideoUrl = ref('')
const inlineVideoTitle = ref('')
const inlineVideoLoading = ref(false)
const inlineVideoMode = ref<'clip' | 'live' | 'none'>('none')
const inlineVideoItem = ref<any>(null)
const inlineVideoIsPlayback = ref(false)  // true=设备录像回放, false=实时流

async function openInlineVideo(item: any) {
  inlineVideoItem.value = item
  inlineVideoTitle.value = `${item.type} · ${item.deviceName || item.deviceId} · ${formatTime(item.createdAt)}`
  inlineVideoVisible.value = true
  inlineVideoLoading.value = true
  inlineVideoUrl.value = ''
  inlineVideoMode.value = 'none'

  // 1. 如果已有 videoClip URL，直接用
  if (item.videoClip) {
    inlineVideoUrl.value = item.videoClip
    inlineVideoMode.value = 'clip'
    inlineVideoLoading.value = false
    return
  }

  // 2. 尝试调 evidence API 获取 video_clip
  try {
    const ev = await alarmApi.getEvidence(item.id)
    if (ev?.videoClipUrl) {
      inlineVideoUrl.value = ev.videoClipUrl
      inlineVideoMode.value = 'clip'
      inlineVideoLoading.value = false
      return
    }
  } catch { /* 继续降级 */ }

  // 3. 降级: 查询告警时间段的设备录像 → 调 play 获取回放 FLV URL
  const channelId = item.channelId || item.deviceId || ''
  const deviceId = item.deviceId || ''
  // [FIX 2026-07-15] 从 snapshot_url 中提取真实 ZLM stream name
  //   snapshot_url 格式: /snapshots/rtp/gb_13120000001320000013/snap_xxx.jpg
  //   告警的 channel_id 可能是国标编码(340开头), 而 ZLM stream 用设备注册ID(131开头)
  let streamName = ''
  if (item.snapshot) {
    const m = item.snapshot.match(/\/snapshots\/rtp\/([^/]+)\//)
    if (m) streamName = m[1]
  }
  if ((channelId || streamName) && deviceId && item.createdAt) {
    try {
      const alarmMs = new Date(item.createdAt).getTime()
      const startMs = alarmMs - 60_000   // 告警前 60 秒
      const endMs = alarmMs + 60_000     // 告警后 60 秒
      const startTime = toLocalISOString(new Date(startMs))
      const endTime = toLocalISOString(new Date(endMs))

      // 传 stream_name 帮助后端用正确路径查 ZLM 录像
      const recs = await queryRecordings({
        device_id: deviceId,
        channel_id: channelId,
        start_time: startTime,
        end_time: endTime,
        ...(streamName ? { stream_name: streamName } : {}),
      })
      if (recs && recs.length > 0) {
        // 调用 play 获取回放 URL
        const rec = recs[0]
        const playRes = await recordingHttp.post('/play', {
          id: rec.id,
          device_id: deviceId,
          channel_id: channelId,
          start_time: rec.start_time || startTime,
          end_time: rec.end_time || endTime,
        })
        const playData = playRes?.data?.data ?? playRes?.data ?? {}
        const urls = playData?.urls || {}
        // 优先 wsFlv(浏览器内嵌播放最佳), 然后普通 flv
        const flvUrl = urls.wsFlv || urls.ws_flv || urls.flv || urls['ws-flv'] || ''
        if (flvUrl) {
          inlineVideoUrl.value = flvUrl
          inlineVideoMode.value = 'live'  // 用 flv.js 播放
          inlineVideoIsPlayback.value = true  // 录像回放
          inlineVideoLoading.value = false
          return
        }
        // 如果有 HLS 也可以用 video 标签直接播
        if (urls.hls) {
          inlineVideoUrl.value = urls.hls
          inlineVideoMode.value = 'clip'  // HLS 用 video 标签
          inlineVideoLoading.value = false
          return
        }
      }
    } catch { /* 继续降级 */ }
  }

  // 4. 最终降级: 查询通道是否有实时流
  if (channelId) {
    try {
      const { data } = await recordingHttp.get(`/streams/${encodeURIComponent(channelId)}/multi-urls`)
      const urls = data?.data?.urls || data?.data || {}
      const flvUrl = urls.flv || urls['ws-flv'] || urls.wsFlv || urls.ws_flv || ''
      if (flvUrl) {
        inlineVideoUrl.value = flvUrl
        inlineVideoMode.value = 'live'
        inlineVideoLoading.value = false
        return
      }
    } catch { /* 继续降级 */ }
  }

  // 5. 全部失败 — 提示用户去回放页面
  inlineVideoMode.value = 'none'
  inlineVideoLoading.value = false
}

// [FIX 2026-07-15] FLV 直播流播放器: 当 mode=live 时自动初始化 flv.js
const inlineFlvVideoRef = ref<HTMLVideoElement>()
let inlineFlvPlayer: flvjs.Player | null = null

watch(inlineVideoMode, async (mode) => {
  // 清理旧播放器
  if (inlineFlvPlayer) {
    try { inlineFlvPlayer.destroy() } catch { /* ignore */ }
    inlineFlvPlayer = null
  }
  if (mode !== 'live') return
  await nextTick()
  const video = inlineFlvVideoRef.value
  if (!video || !inlineVideoUrl.value) return
  if (flvjs.isSupported()) {
    const player = flvjs.createPlayer({
      type: 'flv',
      url: inlineVideoUrl.value,
      isLive: !inlineVideoIsPlayback.value,
      hasAudio: true,
      hasVideo: true,
    }, { enableStashBuffer: false })
    player.attachMediaElement(video)
    player.load()
    const playPromise = player.play()
    if (playPromise && typeof (playPromise as any).catch === 'function') {
      (playPromise as Promise<void>).catch(() => {})
    }
    inlineFlvPlayer = player
  }
})

// 弹窗关闭时清理 FLV 播放器
watch(inlineVideoVisible, (visible) => {
  if (!visible && inlineFlvPlayer) {
    try { inlineFlvPlayer.destroy() } catch { /* ignore */ }
    inlineFlvPlayer = null
  }
})

// [FIX 2026-07-15] Gallery 图片灯箱预览 (收集当前页所有截图)
const galleryPreviewVisible = ref(false)
const galleryPreviewList = ref<string[]>([])
const galleryPreviewIndex = ref(0)
function openGalleryPreview(item: any) {
  // 收集当前页所有有截图的条目
  galleryPreviewList.value = galleryItems.value
    .filter(i => i.snapshot)
    .map(i => i.snapshot)
  galleryPreviewIndex.value = Math.max(0, galleryPreviewList.value.indexOf(item.snapshot))
  galleryPreviewVisible.value = true
}

function playVideoClip(url: string) {
  window.open(url, '_blank')
}
function jumpToAlarmPlayback(alarm: any) {
  // 跳转到录像回放页面，定位到告警时刻
  const t = alarm.createdAt ? new Date(alarm.createdAt).getTime() : Date.now()
  const routeData = router.resolve({
    name: 'Recording',
    query: {
      channelId: String(alarm.channelId || ''),
      deviceId: String(alarm.deviceId || ''),
      time: String(t),
      alarmId: String(alarm.id || ''),
    },
  })
  window.open(routeData.href, '_blank')
}

// ── 设备录像列表 ──
const deviceRecordings = ref<DeviceRecording[]>([])
const recordingsLoading = ref(false)
const evidenceAlarmRow = ref<any>(null)

// ── 日期快捷选项 ──
const dateShortcuts = [
  {
    text: '最近1小时',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setHours(start.getHours() - 1)
      return [start, end]
    },
  },
  {
    text: '最近24小时',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setHours(start.getHours() - 24)
      return [start, end]
    },
  },
  {
    text: '最近7天',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      return [start, end]
    },
  },
]

// ── 后端 snake_case → 前端 camelCase 字段映射 ──
// 委派给 types/alarm.ts 的统一实现 normalizeAlarmCore, 并补一份兼容旧字段 (severity/aiAnalysis/aiConfidence).
// 旧字段在模板和筛选中仍在用, 不要破坏这些用法.
function normalizeAlarm(raw: any): any {
  const norm: AlarmEvent = normalizeAlarmCore(raw)
  return {
    ...norm,
    // 兼容旧字段: severity 字符串 (等同 level), aiAnalysis 与 aiConclusion 同义
    severity: norm.level,
    aiAnalysis: norm.aiConclusion,
    aiConfidence: norm.confidence,
  }
}

// ── 从真实API获取告警数据 ──
async function fetchAlarms() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: currentPage.value,
      pageSize: pageSize.value,
      // count: 不发 — 让后端 default 50 生效, 之前 pageSize*5 远大于默认造成过度拉取
    }

    if (levelFilter.value) {
      params.severity = levelFilter.value
      params.level = levelFilter.value  // 后端用 level 字段
    }
    if (typeFilter.value) {
      params.type = typeFilter.value
      params.alarm_type = typeFilter.value  // 后端用 alarm_type 字段
    }
    if (statusFilter.value) params.status = statusFilter.value
    if (search.value) params.search = search.value

    if (dateRange.value && dateRange.value.length === 2 && dateRange.value[0] && dateRange.value[1]) {
      params.startTime = dateRange.value[0].toISOString()
      params.endTime = dateRange.value[1].toISOString()
      params.start_ms = dateRange.value[0].getTime()
      params.end_ms = dateRange.value[1].getTime()
    }

    const response = await alarmApi.getList(params)
    const respData: any = response.data?.data ?? response.data

    // 后端返回 {alarms: [...], total: N} 或 {items: [...], total: N}
    let rawList: any[] = []
    let total = 0

    if (respData) {
      if (Array.isArray(respData.alarms)) {
        rawList = respData.alarms
        total = respData.total ?? respData.alarms.length
      } else if (Array.isArray(respData.items)) {
        rawList = respData.items
        total = respData.total ?? respData.items.length
      } else if (Array.isArray(respData)) {
        rawList = respData
        total = respData.length
      }
    }

    // 字段名归一化
    alarms.value = rawList.map(normalizeAlarm)
    totalAlarms.value = total
  } catch (err: any) {
    console.error('[AlarmsView] fetchAlarms failed:', err)
    // 不弹错误提示，避免首次加载后端未启动时刷屏
    alarms.value = []
    totalAlarms.value = 0
  } finally {
    loading.value = false
  }
}

// ── 刷新告警 ──
function refreshAlarms() {
  fetchAlarms()
  ElMessage.success('正在刷新告警列表...')
}

// ── WebSocket实时推送新告警 ──
const { connected: wsConnected, subscribe: wsSubscribe } = useWebSocket('/ws')

// 导出轮询 timer（需要在 onUnmounted 时清理）
let exportPollTimer: ReturnType<typeof setInterval> | null = null

const unsubscribeAlarm = wsSubscribe('alarm.new', (data: any) => {
  // 关键: WS 推过来的 payload 是 snake_case 原始数据, 必须先 normalize,
  // 否则 snapshotUrl/videoClipUrl/level 等 camelCase 字段都是 undefined.
  const normalized = normalizeAlarm(data)
  // §13 Fix L2: 上限 200, 避免 alarms.value 持续增长导致 filter 链 O(n²) 退化
  alarms.value = [normalized, ...alarms.value].slice(0, 200)
  totalAlarms.value++
  // 仅在前 3 页弹 ElMessage, 深层页静默更新避免刷屏
  if (currentPage.value <= 3) {
    ElMessage({
      type: (normalized.level || normalized.severity) === 'critical' ? 'error' : 'warning',
      message: `🚨 新告警: ${normalized.type || normalized.alarm_type} — ${normalized.deviceName || normalized.location || ''}`,
      duration: 5000,
    })
  }
})

// ── 联动录像完成后, 全局 CustomEvent 通知列表更新 videoClipUrl ──
// useGlobalAlarm 在收到 system.linkage_action=record_complete 时派发 alarm-clip-updated 事件.
// 我们维护自己的 alarms[] 数组 (不和 store.realtimeAlarms 共享), 需要单独更新.
function onAlarmClipUpdated(e: Event) {
  const detail = (e as CustomEvent<{ alarmId: string; videoClipUrl: string }>).detail
  if (!detail?.alarmId || !detail.videoClipUrl) return
  const idx = alarms.value.findIndex(a => a.id === detail.alarmId)
  if (idx >= 0) {
    alarms.value = [
      ...alarms.value.slice(0, idx),
      { ...alarms.value[idx], videoClipUrl: detail.videoClipUrl },
      ...alarms.value.slice(idx + 1),
    ]
  }
}

// [FIX 2026-06-28] 人脸告警快照以 snapshot_base64 存在 metadata 中。
//   此函数在 snapshotUrl 为空时回退到 metadata.snapshot_base64 构造 data URL。
function getSnapshotUrl(row: any): string {
  if (row.snapshotUrl) return row.snapshotUrl
  const b64 = row.metadata?.snapshot_base64
  if (!b64) return ''
  if (typeof b64 === 'string' && b64.startsWith('data:')) return b64
  const fmt = row.metadata?.snapshot_format || 'bmp'
  const mime = fmt === 'raw_bgr' ? 'image/bmp' : `image/${fmt}`
  const padded = String(b64).replace(/[^A-Za-z0-9+/=]/g, '')
  const fixed = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  return `data:${mime};base64,${fixed}`
}

// ── 统计 + 筛选（单次遍历） ──
const { alarmStatCards, filteredAlarms } = (() => {
  const filtered = computed(() => {
    const src = alarms.value
    let crit = 0, unhandled = 0, falseAlarms = 0
    const out: any[] = []
    const lf = levelFilter.value
    const tf = typeFilter.value
    const sf = statusFilter.value
    const q = search.value ? search.value.toLowerCase() : ''
    const hasDate = dateRange.value && dateRange.value.length === 2 && dateRange.value[0] && dateRange.value[1]
    const dateStart = hasDate ? dateRange.value![0]!.getTime() : 0
    const dateEnd = hasDate ? dateRange.value![1]!.getTime() : 0

    for (const a of src) {
      // 统计（全量）
      if (a.severity === 'critical' || a.level === 'critical') crit++
      if (a.status === 'unhandled') unhandled++
      if (a.status === 'false_alarm' || a.status === 'ignored') falseAlarms++

      // 筛选
      if (lf && (a.severity || a.level) !== lf) continue
      if (tf && a.type !== tf) continue
      if (sf && a.status !== sf) continue
      if (q) {
        if (!((a.description || '').toLowerCase().includes(q) ||
              (a.title || '').toLowerCase().includes(q) ||
              (a.deviceName || '').toLowerCase().includes(q))) continue
      }
      if (hasDate) {
        const t = new Date(a.createdAt).getTime()
        if (t < dateStart || t > dateEnd) continue
      }
      out.push(a)
    }

    const total = totalAlarms.value || src.length
    return { stats: [
      { label: '总告警', value: total, color: '#6366F1', icon: Bell },
      { label: '严重', value: crit, color: '#DC2626', icon: Warning },
      { label: '未处理', value: unhandled, color: '#F59E0B', icon: Clock },
      { label: '误报', value: falseAlarms, color: '#22C55E', icon: CircleCheck },
    ], filtered: out }
  })
  return {
    alarmStatCards: computed(() => filtered.value.stats),
    filteredAlarms: computed(() => filtered.value.filtered),
  }
})()

// ── 当前页告警 ──
// [FIX 2026-07-24] 双重分页修复:
//   原: filteredAlarms.value.slice((page-1)*pageSize, page*pageSize)
//   后端已按 page/pageSize 返回正确切片, 前端再 slice 导致 page>=2 时取到空数组 (第二页空白)
//   修: 服务端分页模式下, 直接使用后端返回的当前页数据, 不再二次切片
const paginatedAlarms = computed(() => filteredAlarms.value)

// ── 工具函数 ──
function severityLabel(severity: string) {
  return SEVERITY_LABELS[severity] || severity
}

function levelLabel(level: string) {
  return SEVERITY_LABELS[level] || level
}

function levelTagType(level: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = { critical: 'danger', high: 'warning', medium: 'warning', low: 'success' }
  return map[level] || 'info'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    unhandled: '未处理', handling: '处理中', handled: '已处理',
    confirmed: '已确认', false_alarm: '误报', ignored: '已忽略',
    // [P0-3] 工单流转状态
    acknowledged: '已确认收到', disposed: '处置中',
    escalated: '已升级', reassigned: '已转派',
    resolved: '已解决', closed: '已关闭'
  }
  return map[status] || status
}

function statusTagType(status: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
    unhandled: 'danger', handling: 'warning', handled: 'success',
    confirmed: 'success', false_alarm: 'warning', ignored: 'info',
    // [P0-3] 工单流转状态
    acknowledged: 'primary', disposed: 'warning',
    escalated: 'danger', reassigned: 'info',
    resolved: 'success', closed: 'success'
  }
  return map[status] || 'info'
}

function confidenceColor(c: number | undefined) {
  if (!c) return '#9CA3AF'
  if (c >= 0.9) return '#10B981'
  if (c >= 0.7) return '#F59E0B'
  return '#EF4444'
}

// §13 Fix L3: WeakMap 缓存 Math.round 结果, 避免模板里重复计算
const confCache = new WeakMap<object, number>()
function confPct(row: any): number {
  let v = confCache.get(row)
  if (v === undefined) {
    v = Math.round((row?.aiConfidence ?? 0) * 100)
    confCache.set(row, v)
  }
  return v
}


const _timeCache = new Map<string, string>()
function formatTime(isoString: string | undefined) {
  if (!isoString) return '-'
  let v = _timeCache.get(isoString)
  if (v !== undefined) return v
  try {
    v = new Date(isoString).toLocaleString('zh-CN')
  } catch {
    v = isoString
  }
  _timeCache.set(isoString, v)
  if (_timeCache.size > 2000) { const first = _timeCache.keys().next().value as string; if (first) _timeCache.delete(first) }
  return v
}

// ── 操作函数 ──
function handleFilterChange() {
  currentPage.value = 1
  fetchAlarms()
}

function handlePageChange() {
  // 分页变化后重新获取数据
  fetchAlarms()
}

// 确认告警
async function handleConfirm(row: any) {
  // [P0-3] 保留旧版兼容, 映射到 acknowledge
  handleAck(row)
}

// [P0-3] 工单流转 handler 函数
async function handleAck(row: any) {
  ElMessageBox.confirm(`确认收到告警：「${row.description || row.title}」?`, '确认告警', {
    confirmButtonText: '确认收到',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    try {
      await alarmApi.acknowledge(row.id)
      row.status = 'acknowledged'
      ElMessage.success('已确认收到')
      fetchAlarms()  // 刷新列表
    } catch (err) {
      ElMessage.error('操作失败')
    }
  }).catch(() => {})
}

async function handleDispose(row: any) {
  ElMessageBox.prompt('请输入处置结果说明', `处置告警：${row.description || row.title}`, {
    confirmButtonText: '提交处置',
    cancelButtonText: '取消',
    inputPlaceholder: '处置结果说明...',
    inputType: 'textarea',
  }).then(async ({ value }) => {
    try {
      await alarmApi.dispose(row.id, value || '已处置')
      row.status = 'disposed'
      ElMessage.success('已提交处置')
      fetchAlarms()
    } catch (err) {
      ElMessage.error('操作失败')
    }
  }).catch(() => {})
}

async function handleCloseAlarm(row: any) {
  ElMessageBox.confirm(`确认关闭告警：「${row.description || row.title}」?`, '关闭告警', {
    confirmButtonText: '确认关闭',
    cancelButtonText: '取消',
    type: 'success',
  }).then(async () => {
    try {
      await alarmApi.close(row.id, '人工关闭')
      row.status = 'closed'
      ElMessage.success('已关闭')
      fetchAlarms()
    } catch (err) {
      ElMessage.error('操作失败')
    }
  }).catch(() => {})
}

// ── [安检对标优化 2026-08-30] 复核标注 (false_alarm_feedback 质控闭环) ──
//   判定标注独立于处置工作流: 提交 POST /stats/false_alarm_baseline/feedback,
//   后端 UPSERT + 同步 alarm_events.status + 反馈 AdaptiveThreshold 优化器。
const verdictMap = ref<Map<string, string>>(new Map())
const reviewVisible = ref(false)
const reviewTarget = ref<any>(null)
const reviewVerdict = ref('true_positive')
const reviewNote = ref('')
const reviewSubmitting = ref(false)
const fbStats = ref<{ total: number; falsePositives: number; falseRate: number; pending: number } | null>(null)

function verdictText(v?: string | null) {
  return v === 'true_positive' ? '真实' : v === 'false_positive' ? '误报' : '存疑'
}

/** 拉复核明细建 alarm_id→verdict 映射 (dropdown 回显), 失败不阻断列表 */
async function loadFeedbackMap() {
  try {
    const resp = await screeningApi.queryFeedback({ limit: 500 })
    const items = resp.data?.data || []
    verdictMap.value = new Map(items.map((it: AlarmFeedbackItem) => [it.alarm_id, it.verdict]))
  } catch { /* 明细不可达时 dropdown 显示「复核标注」原文案 */ }
}

/** 拉复核统计 (标注总数/误报率/待复核近似值) */
async function loadFbStats() {
  try {
    const resp = await screeningApi.getFalseAlarmBaseline({ days: 30, include_feedback: true })
    const d: any = resp.data?.data || {}
    const fb: any = d.feedback || {}
    fbStats.value = {
      total: fb.total_feedback || 0,
      falsePositives: fb.false_positives || 0,
      falseRate: fb.annotated_false_rate || 0,
      pending: Math.max(0, (d.total_alarms || 0) - (fb.total_feedback || 0))
    }
  } catch { fbStats.value = null }
}

function openReview(row: any) {
  reviewTarget.value = row
  reviewVerdict.value = verdictMap.value.get(row.id) || 'true_positive'
  reviewNote.value = ''
  reviewVisible.value = true
}

async function submitReview() {
  if (!reviewTarget.value) return
  reviewSubmitting.value = true
  try {
    await screeningApi.submitFeedback({
      alarm_id: reviewTarget.value.id,
      verdict: reviewVerdict.value,
      note: reviewNote.value.trim()
    })
    verdictMap.value.set(reviewTarget.value.id, reviewVerdict.value)
    verdictMap.value = new Map(verdictMap.value)  // 重赋触发响应式
    reviewVisible.value = false
    ElMessage.success(`已复核: ${verdictText(reviewVerdict.value)}`)
    loadFbStats()
  } catch (e: any) {
    ElMessage.error(`复核提交失败: ${e?.message || e}`)
  } finally {
    reviewSubmitting.value = false
  }
}

async function handleLifecycleCommand(cmd: string, row: any) {
  switch (cmd) {
    case 'review':
      openReview(row)
      break
    case 'escalate':
      ElMessageBox.confirm(`升级此告警到更高优先级?`, '升级告警', {
        confirmButtonText: '升级',
        cancelButtonText: '取消',
        type: 'warning',
      }).then(async () => {
        try {
          await alarmApi.escalate(row.id)
          row.status = 'escalated'
          ElMessage.success('已升级')
          fetchAlarms()
        } catch { ElMessage.error('操作失败') }
      }).catch(() => {})
      break
    case 'reassign':
      ElMessageBox.prompt('请输入转派目标人', '转派告警', {
        confirmButtonText: '转派',
        cancelButtonText: '取消',
        inputPlaceholder: '处理人用户名...',
      }).then(async ({ value }) => {
        try {
          await alarmApi.reassign(row.id, value)
          row.status = 'reassigned'
          ElMessage.success(`已转派给 ${value}`)
          fetchAlarms()
        } catch { ElMessage.error('操作失败') }
      }).catch(() => {})
      break
    case 'false_alarm':
      handleFalse(row)
      break
    case 'ignore':
      handleIgnore(row)
      break
    case 'evidence':
      showEvidence(row)
      break
    case 'detail':
      handleDetail(row)
      break
  }
}


// 标记误报
async function handleFalse(row: any) {
  ElMessageBox.confirm(`将告警「${row.description || row.title}」标记为误报?`, '标记误报', {
    confirmButtonText: '标记误报',
    cancelButtonText: '取消',
    type: 'info',
  }).then(async () => {
    try {
      await alarmApi.handle(row.id, { status: 'false_alarm', note: '' })
      row.status = 'false_alarm'
      row.handledBy = useAuthStore().user?.name || '当前用户'
      ElMessage.success('已标记为误报')
    } catch (err) {
      ElMessage.error('操作失败')
    }
  }).catch(() => {})
}

// 忽略告警
async function handleIgnore(row: any) {
  ElMessageBox.confirm(`忽略此告警?`, '忽略告警', {
    confirmButtonText: '忽略',
    cancelButtonText: '取消',
  }).then(async () => {
    try {
      await alarmApi.handle(row.id, { status: 'ignored', note: '' })
      row.status = 'ignored'
      ElMessage.success('已忽略')
    } catch (err) {
      ElMessage.error('操作失败')
    }
  }).catch(() => {})
}

function handleDetail(row: any) {
  // [UX 2026-08-31] 1b: 详情统一走全局 AlarmPopup (含快照/实时流/回放/AI研判/操作按钮),
  //   替换原简版 descriptions 弹窗 — 与首页实时告警条目同一套弹窗
  showAlarmPopup(row)
}

// [UX 2026-08-31] 整行点击 → 详情弹窗; 排除行内交互元素 (按钮/下拉/图片预览/链接/选择框)
function onRowClickDetail(row: any, _column: unknown, event: Event) {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, a, input, label, .el-dropdown, .el-switch, .el-checkbox, .el-image, .el-tag__close')) return
  handleDetail(row)
}

// ── 证据链 ──
async function showEvidence(row: any) {
  evidenceAlarmId.value = row.id
  evidenceAlarmRow.value = row
  showEvidenceDialog.value = true
  evidenceLoading.value = true
  evidenceData.value = null
  deviceRecordings.value = []
  recordingsLoading.value = true
  try {
    const ev = await alarmApi.getEvidence(row.id)
    if (ev) {
      evidenceData.value = ev
    } else {
      evidenceData.value = { snapshotUrl: getSnapshotUrl(row), videoClipUrl: row.videoClipUrl }
    }
  } catch {
    evidenceData.value = { snapshotUrl: getSnapshotUrl(row), videoClipUrl: row.videoClipUrl }
  } finally {
    evidenceLoading.value = false
  }

  // 自动查询告警设备在报警时间前后的录像
  // [FIX evidence-AI 2026-08-18] 从证据 video_clip URL 提取 ZLM 流名 (gb_131...) 传入,
  // 避免 channel_id (国标 340 开头) 与实际流名 (设备注册 131 开头) 不匹配导致查不到录像
  const clipUrl = evidenceData.value?.videoClipUrl || row.videoClipUrl || ''
  const streamMatch = clipUrl.match(/^\/record\/rtp\/([^/]+)\//)
  if (row.deviceId) {
    try {
      const alarmTime = new Date(row.createdAt)
      const start = new Date(alarmTime.getTime() - 3600_000)
      const end = new Date(alarmTime.getTime() + 3600_000)
      deviceRecordings.value = await queryRecordings({
        device_id: row.deviceId,
        channel_id: row.channelId || undefined,
        stream_name: streamMatch ? streamMatch[1] : undefined,
        start_time: toLocalISOString(start),
        end_time: toLocalISOString(end),
      })
    } catch (e) {
      console.warn('[AlarmsView] 查询设备录像失败:', e)
    } finally {
      recordingsLoading.value = false
    }
  } else {
    recordingsLoading.value = false
  }
}

async function playEvidenceRecording(rec: DeviceRecording) {
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
        window.open(url, '_blank')
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

function goToRecording(recordingId: string) {
  showEvidenceDialog.value = false
  router.push({ name: 'Recording', query: { recordingId, alarmId: evidenceAlarmId.value } })
}

async function doAnalyze() {
  analyzeLoading.value = true
  try {
    const res = await alarmApi.analyzeAlarm(evidenceAlarmId.value)
    const analysis = (res as any)?.data?.data?.analysis ?? (res as any)?.data?.data
    if (analysis && evidenceData.value) {
      evidenceData.value = { ...evidenceData.value, aiAnalysis: analysis }
    }
    ElMessage.success('AI 分析完成')
  } catch {
    ElMessage.error('AI 分析失败')
  } finally {
    analyzeLoading.value = false
  }
}

// 批量确认
async function handleBatchConfirm() {
  ElMessageBox.confirm(`确认 ${selected.value.length} 条告警为真实告警?`, '批量确认', {
    confirmButtonText: '确认',
    type: 'warning',
  }).then(async () => {
    try {
      for (const alarm of selected.value) {
        if (alarm.status === 'unhandled') {
          await alarmApi.handle(alarm.id, { status: 'confirmed', note: '' })
          alarm.status = 'handled'
          alarm.handledBy = useAuthStore().user?.name || '当前用户'
        }
      }
      ElMessage.success(`已确认 ${selected.value.length} 条告警`)
      selected.value = []
      fetchAlarms()
    } catch (err) {
      ElMessage.error('批量操作部分失败')
    }
  }).catch(() => {})
}

// 批量误报
async function handleBatchFalse() {
  ElMessageBox.confirm(`将 ${selected.value.length} 条告警标记为误报?`, '批量误报', {
    confirmButtonText: '标记',
    type: 'info',
  }).then(async () => {
    try {
      for (const alarm of selected.value) {
        if (alarm.status === 'unhandled') {
          await alarmApi.handle(alarm.id, { status: 'false_alarm', note: '' })
          alarm.status = 'false_alarm'
          alarm.handledBy = useAuthStore().user?.name || '当前用户'
        }
      }
      ElMessage.success(`已标记 ${selected.value.length} 条为误报`)
      selected.value = []
      fetchAlarms()
    } catch (err) {
      ElMessage.error('批量操作部分失败')
    }
  }).catch(() => {})
}

// 导出告警
async function exportAlarms() {
  try {
    ElMessage.info('正在生成告警报表...')
    const res = await exportApi.exportAlarms({
      level: levelFilter.value || undefined,
      format: 'xlsx',
      startTime: dateRange.value?.[0],
      endTime: dateRange.value?.[1],
    })
    const task = res.data?.data
    if (task?.id) {
      exportPollTimer = setInterval(async () => {
        try {
          const detail = await exportApi.getTaskDetail(task.id)
          const t = detail.data?.data
          if (t?.status === 'completed' && t.fileUrl) {
            clearInterval(exportPollTimer!)
            exportPollTimer = null
            const blob = await exportApi.downloadFile(task.id)
            const url = URL.createObjectURL(blob.data as any)
            const a = document.createElement('a')
            a.href = url
            a.download = t.fileName || `告警报表.xlsx`
            a.click()
            URL.revokeObjectURL(url)
            ElMessage.success('导出完成')
          } else if (t?.status === 'failed') {
            clearInterval(exportPollTimer!)
            exportPollTimer = null
            ElMessage.error(t.errorMessage || '导出失败')
          }
        } catch {
          clearInterval(exportPollTimer!)
          exportPollTimer = null
        }
      }, 2000)
    }
  } catch {
    ElMessage.error('导出请求失败')
  }
}

// 页面加载时获取数据
onMounted(() => {
  fetchAlarms()
  loadFeedbackMap()
  loadFbStats()
  window.addEventListener('alarm-clip-updated', onAlarmClipUpdated)
})

onUnmounted(() => {
  unsubscribeAlarm?.()
  window.removeEventListener('alarm-clip-updated', onAlarmClipUpdated)
  if (exportPollTimer) {
    clearInterval(exportPollTimer)
    exportPollTimer = null
  }
})
</script>

<style scoped>
/* ============================================================
 * 告警中心 AlarmsView — v6.0 样式
 * ============================================================ */
/* [UX 2026-08-31] 1b: 整行可点击 → 详情弹窗 */
.alarms-page :deep(.el-table__row) {
  cursor: pointer;
}
.alarms-page {
  /* padding: 20px 24px; */
  /* max-width: var(--content-max-width, 1440px); */
  /* margin: 0 auto; */
  animation: fadeIn 0.3s ease;
}

/* [P3-VP2] 证据库网格 */
.evidence-gallery { margin-top: 16px; margin-bottom: 16px; }
.evidence-item { transition: transform 0.2s; }
.evidence-item:hover { transform: translateY(-2px); }
.evidence-thumb { position: relative; }
.evidence-clip-badge {
  position: absolute; top: 6px; right: 6px;
  background: rgba(0,0,0,0.7); color: #FFB800;
  padding: 2px 6px; border-radius: 4px; font-size: 11px;
}
.evidence-actions {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  justify-content: center;
}
.evidence-actions .el-button {
  padding: 6px 10px;
}

/* ── 统计卡片 ── */
.alarm-stats-row {
  margin-bottom: 16px;
}

.alarm-stat-card {
  border-radius: var(--radius-xl, 12px);
  border: 1px solid var(--app-border);
  transition: all var(--transition-normal, 0.2s ease);
}

.alarm-stat-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-card-hover);
}

.alarm-stat-content {
  display: flex;
  align-items: center;
  gap: 14px;
}

.alarm-stat-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  flex-shrink: 0;
}

.alarm-stat-body {
  display: flex;
  flex-direction: column;
}

.alarm-stat-value {
  font-size: 24px;
  font-weight: var(--font-bold, 700);
  font-family: var(--font-number);
  line-height: 1;
}

.alarm-stat-label {
  font-size: var(--text-xs, 12px);
  color: var(--app-text-secondary);
  margin-top: 2px;
}

/* ── 工具栏 ── */
.toolbar-card {
  border-radius: var(--radius-lg, 8px);
  margin-bottom: 0;
}

.toolbar-card :deep(.el-card__body) {
  padding: 12px 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

/* ── 批量操作栏 ── */
/* [安检对标优化 2026-08-30] 复核质控条 + 复核 dialog */
.qc-strip { margin-bottom: 12px; }
.review-body { display: flex; flex-direction: column; gap: 12px; }
.review-target { color: #606266; font-size: 13px; }
.review-verdicts { margin: 4px 0; }
.review-hint { color: #909399; font-size: 12px; line-height: 1.5; }

.batch-bar {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  transition: all var(--transition-normal, 0.2s ease);
  background: var(--color-primary-50, #F0F7FF);
  border: 1px solid var(--color-primary-200);
  border-radius: var(--radius-lg, 8px);
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 0;
}

.batch-bar.visible {
  opacity: 1;
  max-height: 60px;
  padding: 10px 16px;
  margin-top: 12px;
}

.batch-info {
  font-size: var(--text-sm, 13px);
  color: var(--app-text-primary);
}

/* ── 表格卡片 ── */
.table-card {
  margin-top: 12px;
  border-radius: var(--radius-lg, 8px);
}

.table-card :deep(.el-card__body) {
  padding: 0;
}

/* ── 级别单元格 ── */
.level-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.level-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.level-dot.critical { background: #DC2626; box-shadow: 0 0 6px rgba(220, 38, 38, 0.4); }
.level-dot.high { background: #EA580C; }
.level-dot.medium { background: #F59E0B; }
.level-dot.low { background: #22C55E; }

/* ── 类型徽章 ── */
.type-badge {
  font-size: var(--text-sm, 13px);
  color: var(--app-text-secondary);
}

/* ── 设备单元格 ── */
.device-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.device-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.device-status-dot.online { background: #10B981; }
.device-status-dot.offline { background: #EF4444; }
.device-status-dot.alarming { background: #DC2626; box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.4); }

/* ── 描述单元格 ── */
.desc-cell {
  display: flex;
  align-items: center;
}

.desc-text {
  font-size: var(--text-sm, 13px);
}

/* ── AI解释文本 ── */
.xai-text {
  font-size: var(--text-xs, 12px);
  color: var(--color-ai-500);
  cursor: default;
  font-style: italic;
}

/* ── 时间文本 ── */
.time-text {
  font-family: var(--font-mono);
  font-size: var(--text-sm, 13px);
  color: var(--app-text-secondary);
}

/* ── 待处理状态动画 ──
   §13 Fix L1: 删除 pulse 无限动画 (20 行 × 2s 周期 = 浏览器每帧都在合成).
   改用静态 box-shadow 视觉提示, 性能提升 ~30-50%. */
.status-pending {
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.25);
}

/* ── 操作按钮组 ── */
.action-btns {
  display: flex;
  gap: 2px;
}

/* ── 分页 ── */
.pagination-wrap {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
}

/* ── 详情弹窗 ── */
.alarm-detail-dialog :deep(.el-descriptions__label) {
  font-weight: var(--font-medium, 500);
}

.xai-detail {
  font-size: 13px;
  color: var(--color-ai-500);
  line-height: 1.6;
  background: rgba(124, 58, 237, 0.05);
  padding: 8px 12px;
  border-radius: var(--radius-md, 6px);
  border-left: 3px solid var(--color-ai-400);
}

.font-mono {
  font-family: var(--font-mono);
  font-size: 13px;
}

/* ── 证据链 ── */
.evidence-section { margin-bottom: 8px; }
.evidence-section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--app-text-primary);
  border-left: 3px solid #6366F1;
  padding-left: 8px;
}
.text-secondary { color: var(--app-text-secondary); }
</style>
