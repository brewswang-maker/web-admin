<template>
  <el-card shadow="never" class="aep-card">
    <!-- 页面级 header (标题/业务筛选/视图切换/刷新) — 由接入页透过插槽注入,
         列表主体 (表格/卡片/分页/弹窗) 由本面板统一渲染 -->
    <div v-if="$slots.header" class="aep-header"><slot name="header" /></div>

    <!-- ===== [P2] 卡片视图 (AlarmCard 栅格; 与 AlarmsView 卡片分支同构) ===== -->
    <div v-if="viewMode === 'card' && rows.length === 0" style="text-align:center;color:#888;padding:40px">{{ emptyText }}</div>
    <el-row v-if="viewMode === 'card' && rows.length > 0" :gutter="12">
      <el-col v-for="a in rows" :key="a.id" :xs="24" :sm="12" :md="8" :lg="6" style="margin-bottom:12px">
        <!-- 卡片点击 → 全局 AlarmPopup (统一详情路径) -->
        <AlarmCard :alarm="a" :group-name="groupNameOf(a)" @click="handleDetail(a)">
          <template #actions="{ alarm }">
            <!-- [P0-13 对齐] 未完结=「处警」(DisposeDialog), 已完结=「详情」(AlarmPopup) -->
            <el-button size="small" type="primary" link
                       @click.stop="openDisposeDialog(alarm)" v-if="isDisposeEditable(alarm)">处警</el-button>
            <el-button size="small" type="info" link
                       @click.stop="handleDetail(alarm)" v-else>详情</el-button>
          </template>
        </AlarmCard>
      </el-col>
    </el-row>

    <!-- ===== 告警表格 (与 AlarmsView.vue 表格分支逐列同构: 列集/顺序/宽度/格式化) ===== -->
    <el-table
      v-if="viewMode === 'table'"
      :data="rows"
      stripe
      :height="tableHeight"
      style="width: 100%"
      @selection-change="(val: any[]) => emit('selection-change', val)"
      @row-click="onRowClickDetail"
      :default-sort="{ prop: 'createdAt', order: 'descending' }"
      row-key="id"
      v-loading="loading"
    >
      <!-- 选择 -->
      <el-table-column type="selection" width="48" />

      <!-- 告警级别 (色点 + tag) -->
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
          />
          <span v-else class="text-secondary" style="font-size:11px">无</span>
        </template>
      </el-table-column>

      <!-- 告警类型 [P0-9] canonical zh 名 (useEventTypeZh SSOT) -->
      <el-table-column prop="type" label="类型" width="130">
        <template #default="{ row }">
          <span class="type-cell">
            <span class="type-badge">{{ zh(row.type) }}</span>
            <!-- [FIX-P1-2 2026-09-12] 长窗聚合合并计数: ×N (N>1 展示, 同键 10min 合并) -->
            <el-tooltip
              v-if="mergedCountOf(row) > 1"
              :content="`长窗口内已合并 ${mergedCountOf(row)} 条同类事件`"
              placement="top"
              :show-after="300"
            >
              <span class="merged-count-badge">×{{ mergedCountOf(row) }}</span>
            </el-tooltip>
          </span>
        </template>
      </el-table-column>

      <!-- [chan-col 2026-09-11] 所属区域 (安保区域反查; 未归属显示 '-') → 列头口径由「所属分组」正名 -->
      <el-table-column label="所属区域" width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ groupNameOf(row) }}</span>
        </template>
      </el-table-column>

      <!-- 设备 [P0-7/13] 设备友好名优先 (禁纯数字国标码裸奔; 目录反查不中 '-') -->
      <el-table-column prop="deviceName" label="设备" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="device-cell">
            <span class="device-status-dot" :class="row.deviceStatus || 'online'"></span>
            <span>{{ alarmDevLabel(row) }}</span>
          </div>
        </template>
      </el-table-column>

      <!-- 通道 [chan-col 2026-09-11] 通道名口径 (channelName 可读优先; 空名/纯数字反查,
           反查不中「通道{channelId}」占位) — 与 useAlarmTableHelpers.alarmChLabel SSOT 同源 -->
      <el-table-column label="通道" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ alarmChLabel(row) }}</span>
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

      <!-- [STAGE1 P0-1] 复核状态 (独立维度, 与业务状态并存) -->
      <el-table-column prop="reviewStatus" label="复核状态" width="110" align="center">
        <template #default="{ row }">
          <el-tooltip :content="reviewTooltip(row)" placement="top" :show-after="500" effect="dark">
            <el-tag :type="reviewTagType(row.reviewStatus)" size="small" effect="plain">
              {{ reviewLabel(row.reviewStatus) }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>

      <!-- [STAGE1 P0-1] 剩余 SLA (与 /alarms/review-sla 同口径; 宽度与 AlarmsView 同参 110) -->
      <el-table-column prop="reviewSlaRemainingMin" label="SLA 剩余" width="110" align="center" sortable>
        <template #default="{ row }">
          <span :class="['sla-remaining', slaRemainingClass(row.reviewSlaRemainingMin)]">
            {{ slaRemainingText(row) }}
          </span>
        </template>
      </el-table-column>

      <!-- 操作 [P0-13]: 未完结=「处警」, 已完结=「详情」, 其余收进「更多」 -->
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <div class="action-btns">
            <el-button
              size="small" type="primary" link
              @click="openDisposeDialog(row)"
              v-if="isDisposeEditable(row)"
            >
              处警
            </el-button>
            <el-button
              size="small" type="info" link
              @click="handleDetail(row)"
              v-else
            >
              详情
            </el-button>
            <el-dropdown @command="(cmd: string) => handleLifecycleCommand(cmd, row)" trigger="click">
              <el-button size="small" type="info" link>更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="close" v-if="row.status === 'acknowledged' || row.status === 'disposed' || row.status === 'escalated' || row.status === 'reassigned'">关闭告警</el-dropdown-item>
                  <el-dropdown-item command="escalate" v-if="row.status !== 'closed' && row.status !== 'false_alarm'">升级告警</el-dropdown-item>
                  <el-dropdown-item command="reassign" v-if="row.status !== 'closed'">转派处理</el-dropdown-item>
                  <el-dropdown-item command="false_alarm" :disabled="row.status === 'closed'">标记误报</el-dropdown-item>
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

    <!-- 空态 (表格分支) -->
    <el-empty v-if="viewMode === 'table' && !loading && rows.length === 0" :description="emptyText" :image-size="80" />

    <!-- 分页 (与 AlarmsView 同参: layout/sizes/background; 表格卡片两分支共用) -->
    <div class="pagination-wrap" v-if="total > pageSize">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @change="emit('page-change')"
      />
    </div>

    <!-- ===== 快照预览 (标注 overlay + 取证帧, 与 AlarmsView 同款) ===== -->
    <el-dialog v-model="previewVisible" title="告警快照" width="760px" destroy-on-close align-center>
      <SnapshotAnnotated :src="previewImageUrl" :metadata="previewMeta ?? undefined" />
      <EvidenceFrames :metadata="(previewMeta ?? undefined) as Record<string, unknown> | undefined" />
    </el-dialog>

    <!-- ===== 复核标注 dialog (判定独立于处置工作流) ===== -->
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
        <el-input v-model="reviewNote" type="textarea" :rows="3"
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

    <!-- ===== 证据链 dialog (多图画廊 + 录像 + AI 二次分析, 与 AlarmsView 同款) ===== -->
    <el-dialog v-model="showEvidenceDialog" title="告警证据链" width="720px" destroy-on-close
               :close-on-click-modal="false" :close-on-press-escape="false">
      <div v-loading="evidenceLoading">
        <template v-if="evidenceData">
          <el-row :gutter="16">
            <el-col :span="12">
              <div class="evidence-section">
                <div class="evidence-section-title">
                  告警快照
                  <span v-if="evidenceGallery.length > 1" class="evidence-gallery-counter">
                    {{ evidenceImageIndex + 1 }}/{{ evidenceGallery.length }}
                  </span>
                </div>
                <template v-if="evidenceGallery.length">
                  <div class="evidence-gallery">
                    <button class="evidence-gallery-nav" :disabled="evidenceImageIndex <= 0" @click="evidenceImageIndex--" aria-label="上一张">‹</button>
                    <el-image
                      :key="`evimg-${evidenceImageIndex}`"
                      :src="evidenceGallery[evidenceImageIndex].url"
                      fit="contain"
                      class="evidence-gallery-main"
                      :preview-src-list="evidenceGallery.map(g => g.url)"
                      :initial-index="evidenceImageIndex"
                      :preview-teleported="true"
                    />
                    <button class="evidence-gallery-nav" :disabled="evidenceImageIndex >= evidenceGallery.length - 1" @click="evidenceImageIndex++" aria-label="下一张">›</button>
                  </div>
                  <div v-if="evidenceGallery.length > 1" class="evidence-gallery-thumbs">
                    <div
                      v-for="(img, idx) in evidenceGallery" :key="idx"
                      class="evidence-gallery-thumb"
                      :class="{ 'is-active': idx === evidenceImageIndex, 'is-evidence': !!img.tag }"
                      :style="{ backgroundImage: `url(${img.url})` }"
                      :title="img.tag || '主快照'"
                      @click="evidenceImageIndex = idx"
                    >
                      <span v-if="img.tag" class="evidence-gallery-thumb-tag">{{ img.tag }}</span>
                    </div>
                  </div>
                </template>
                <el-empty v-else description="无快照" :image-size="60" />
              </div>
            </el-col>
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
          <div v-if="evidenceData.aiAnalysis" class="evidence-section" style="margin-top:16px">
            <div class="evidence-section-title">AI 分析结论</div>
            <div class="xai-detail">{{ evidenceData.aiAnalysis }}</div>
          </div>
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
          <div style="margin-top:16px;text-align:right">
            <el-button type="primary" :loading="analyzeLoading" @click="doAnalyze">
              AI 二次分析
            </el-button>
          </div>
        </template>
        <el-empty v-else-if="!evidenceLoading" description="无法获取证据链数据" />
      </div>
    </el-dialog>

    <!-- ===== [P0-10] 规范处警对话框 (类型可选/已处警只读/追加) ===== -->
    <DisposeDialog v-model="disposeDialogVisible" :alarm="disposeTarget" @submitted="onDisposeSubmitted" />
  </el-card>
</template>

<script setup lang="ts">
/**
 * AlarmEventsPanel.vue — [场景页对齐 2026-09-11] 告警事件列表共享面板
 *
 * 六个业务场景事件列表 (perimeter / hotel-unattended / large-event /
 * gas-station / school / screening) 对齐平台告警中心 (AlarmsView.vue) 的
 * 字段集合与展示规范: 表格 15 列 (选择/级别/快照/类型/所属区域/设备/通道/描述/
 * 置信度/AI解释/时间/状态/复核状态/SLA 剩余/操作) 与卡片栅格与 AlarmsView
 * 逐列同构 — 列集/顺序/宽度/格式化零分叉; 场景页不再各自维护表格模板。
 * [chan-col 2026-09-11] 列升级: 「所属分组」正名「所属区域」(数据源同为安保
 *   区域 securityAreaApi) + 新增「通道」列 (alarmChLabel SSOT 占位口径)。
 *
 * 处置/详情入口对齐 P0-13: 未完结=「处警」(DisposeDialog), 已完结=「详情」
 * (AlarmPopup); 卡片点击统一 AlarmPopup; 分页同参 (layout/sizes),
 * 表格与卡片两分支共用同一分页。
 *
 * 展示口径 helper (useAlarmTableHelpers) / 所属分组反查 (useAlarmGroups) /
 * 生命周期与复核/证据链 (useAlarmLifecycle) 全部共享 composable, 单一定义。
 */
import { computed, onMounted, ref } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import type { AlarmEvent } from '@/types/alarm'
import { useEventTypeZh } from '@/composables/useEventTypeZh'
import {
  severityLabel, levelTagType, statusLabel, statusTagType,
  reviewLabel, reviewTagType, reviewTooltip,
  slaRemainingClass, slaRemainingText,
  confidenceColor, confPct, formatTime,
  getSnapshotUrl, alarmDevLabel, alarmChLabel, isDisposeEditable, isRowClickInteractive,
  mergedCountOf,
} from '@/composables/useAlarmTableHelpers'
import { ensureAlarmGroups, groupNameOf } from '@/composables/useAlarmGroups'
import { useAlarmLifecycle } from '@/composables/useAlarmLifecycle'
import AlarmCard from '@/components/alarm/AlarmCard.vue'
import DisposeDialog from '@/components/alarm/DisposeDialog.vue'
import SnapshotAnnotated from '@/views/perimeter/SnapshotAnnotated.vue'
import EvidenceFrames from '@/components/EvidenceFrames.vue'

const props = withDefaults(defineProps<{
  /** 当前页行数据 (调用方完成筛选/分页切片后的切片) */
  rows: AlarmEvent[]
  /** 过滤后总条数 (分页 total) */
  total: number
  loading?: boolean
  /** 视图模式 (持久化由页面侧 AlarmViewToggle 负责) */
  viewMode: 'card' | 'table'
  /** 表格高度 (同 AlarmsView 默认; 内嵌区块可传 'auto' 关闭固定高) */
  tableHeight?: string
  emptyText?: string
}>(), {
  loading: false,
  tableHeight: 'max(calc(100vh - 360px), 300px)',
  emptyText: '暂无告警',
})

const emit = defineEmits<{
  (e: 'page-change'): void
  (e: 'selection-change', rows: any[]): void
}>()

// 分页双绑 (v-model:page / v-model:page-size; 前端切片页由调用方 v-model 持有)
const page = defineModel<number>('page', { default: 1 })
const pageSize = defineModel<number>('pageSize', { default: 20 })

const { zh, ensure: ensureEventTypes } = useEventTypeZh()

// ── 生命周期操作 (处警/详情/更多菜单/复核/证据链) ──
const lc = useAlarmLifecycle()
const {
  disposeDialogVisible, disposeTarget, openDisposeDialog, onDisposeSubmitted,
  handleDetail, handleLifecycleCommand,
  reviewVisible, reviewSubmitting, reviewTarget, reviewVerdict, reviewNote,
  verdictMap, verdictText, loadFeedbackMap, submitReview,
  showEvidenceDialog, evidenceLoading, evidenceData,
  deviceRecordings, recordingsLoading, analyzeLoading, evidenceAlarmRow,
  playEvidenceRecording, goToRecording, doAnalyze,
} = lc

// [UX 2026-08-31] 整行点击 → 详情弹窗; 排除行内交互元素 (同 AlarmsView onRowClickDetail)
function onRowClickDetail(row: any, _column: unknown, event: Event) {
  if (isRowClickInteractive(event)) return
  handleDetail(row)
}

// ── 快照预览 (标注 overlay; metadata 三形态防御, 与 AlarmsView openSnapshotPreview 同口径) ──
const previewVisible = ref(false)
const previewImageUrl = ref('')
const previewMeta = ref<Record<string, unknown> | null>(null)
function openSnapshotPreview(row: any) {
  previewImageUrl.value = getSnapshotUrl(row)
  let m = row?.metadata
  if (typeof m === 'string') {
    try { m = JSON.parse(m) } catch { m = null }
  }
  // [FIX 2026-09-04] AlarmDispatcher 直报链 metadata 为数组 [{bbox,...}]: 取首元素
  if (Array.isArray(m)) {
    m = (m[0] && typeof m[0] === 'object') ? m[0] : null
  }
  previewMeta.value = m && typeof m === 'object' ? m : null
  previewVisible.value = true
}

// ── 证据链多图画廊 (主快照 + 取证帧, 与 AlarmsView evidenceGallery 同构) ──
const evidenceImageIndex = ref(0)
const evidenceGallery = computed(() => {
  const list: Array<{ url: string; tag: string }> = []
  const main = evidenceData.value?.snapshotUrl
  if (main) list.push({ url: main, tag: '' })
  const frames = (evidenceData.value as any)?.evidenceFrames
    ?? (evidenceData.value as any)?.evidence_frames
  if (Array.isArray(frames)) {
    for (const f of frames) {
      const url = f?.snapshot_url || f?.snapshotUrl || f?.url
      if (url) list.push({ url, tag: f?.tag || f?.label || '取证帧' })
    }
  }
  return list
})

onMounted(() => {
  ensureAlarmGroups()   // 所属分组列反查目录 (单例)
  loadFeedbackMap()     // 复核结论回显 (dropdown「已复核: xx」)
  ensureEventTypes()    // 事件类型中文名预热 (非阻塞)
})
</script>

<style scoped>
/* ── 与 AlarmsView.vue 表格样式同款 (视觉零分叉) ── */
.aep-card :deep(.el-card__body) {
  padding: 0;
}

/* 页面级 header 区 (筛选/标题) */
.aep-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

/* 级别单元格 */
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

/* SLA 剩余时间列 — 三色分级 */
.sla-remaining { font-variant-numeric: tabular-nums; font-weight: 500; }
.sla-remaining.sla-ok { color: #22C55E; }
.sla-remaining.sla-warning { color: #F59E0B; }
.sla-remaining.sla-overdue { color: #DC2626; font-weight: 600; }

/* 类型徽章 */
.type-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.type-badge {
  font-size: var(--text-sm, 13px);
  color: var(--app-text-secondary);
}
/* [FIX-P1-2 2026-09-12] 合并计数角标 (长窗聚合 ×N) — 与 AlarmsView 同款 */
.merged-count-badge {
  flex-shrink: 0;
  padding: 0 5px;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.12);
  color: #6366F1;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  cursor: default;
}

/* 设备单元格 */
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

/* 描述单元格 */
.desc-cell {
  display: flex;
  align-items: center;
}
.desc-text {
  font-size: var(--text-sm, 13px);
}

/* AI解释文本 */
.xai-text {
  font-size: var(--text-xs, 12px);
  color: var(--color-ai-500);
  cursor: default;
  font-style: italic;
}

/* 时间文本 */
.time-text {
  font-family: var(--font-mono);
  font-size: var(--text-sm, 13px);
  color: var(--app-text-secondary);
}

/* 待处理状态静态提示 (同 AlarmsView §13 Fix L1) */
.status-pending {
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.25);
}

/* 操作按钮组 */
.action-btns {
  display: flex;
  gap: 2px;
}

/* 分页 */
.pagination-wrap {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 证据链 */
.evidence-section { margin-bottom: 8px; }
.evidence-gallery { display: flex; align-items: center; gap: 6px; }
.evidence-gallery-main {
  flex: 1; min-width: 0; width: 100%; max-height: 300px;
  border-radius: 8px; border: 1px solid var(--app-border);
}
.evidence-gallery-nav {
  flex: none; width: 26px; height: 40px; border: none; border-radius: 6px;
  background: rgba(0, 0, 0, 0.06); color: #606266; font-size: 18px;
  line-height: 1; cursor: pointer;
}
.evidence-gallery-nav:hover:not(:disabled) { background: rgba(0, 0, 0, 0.12); }
.evidence-gallery-nav:disabled { opacity: 0.3; cursor: default; }
.evidence-gallery-counter { margin-left: 8px; font-size: 12px; color: #999; font-weight: normal; }
.evidence-gallery-thumbs { display: flex; gap: 6px; margin-top: 8px; overflow-x: auto; }
.evidence-gallery-thumb {
  position: relative; flex: none; width: 56px; height: 40px;
  border-radius: 4px; background-size: cover; background-position: center;
  border: 2px solid transparent; cursor: pointer;
}
.evidence-gallery-thumb.is-active { border-color: var(--el-color-primary); }
.evidence-gallery-thumb.is-evidence::after {
  content: '';
  position: absolute; inset: 0;
  border-radius: 2px;
  box-shadow: inset 0 0 0 100px rgba(245, 158, 11, 0.12);
}
.evidence-gallery-thumb-tag {
  position: absolute; left: 0; bottom: 0; right: 0;
  font-size: 10px; line-height: 14px; text-align: center; color: #fff;
  background: rgba(245, 158, 11, 0.85); border-radius: 0 0 2px 2px;
}
.evidence-section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--app-text-primary);
  border-left: 3px solid #6366F1;
  padding-left: 8px;
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
.text-secondary { color: var(--app-text-secondary); }
</style>

<!-- [chan-col 2026-09-11 完成锚点] 列结构升级（所属区域+设备+通道）批次 · 部署产物 entry=index-wS8-Hc--kp.js tgz md5=57e4f6f0d728c29eeca8f2a8f6dd629b -->
