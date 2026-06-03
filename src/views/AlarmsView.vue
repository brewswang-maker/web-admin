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
            <el-option label="已确认" value="confirmed" />
            <el-option label="误报" value="false_alarm" />
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
          <el-button @click="refreshAlarms" :loading="loading">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
          <el-button @click="exportAlarms">
            <el-icon><Download /></el-icon>导出
          </el-button>
        </div>
      </div>
    </el-card>

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

    <!-- ===== 告警表格 ===== -->
    <el-card shadow="never" class="table-card">
      <el-table
        :data="paginatedAlarms"
        stripe
        style="width: 100%"
        @selection-change="(val: any[]) => selected = val"
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
            <el-image
              v-if="row.snapshotUrl"
              :src="row.snapshotUrl"
              :preview-src-list="[row.snapshotUrl]"
              fit="cover"
              style="width: 56px; height: 32px; border-radius: 4px; cursor: pointer"
              :preview-teleported="true"
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
              :percentage="Math.round((row.aiConfidence ?? 0) * 100)"
              :color="confidenceColor(row.aiConfidence)"
              :stroke-width="8"
              :show-text="true"
            >
              <span style="font-size: 11px; color: var(--app-text-secondary)">
                {{ Math.round((row.aiConfidence ?? 0) * 100) }}%
              </span>
            </el-progress>
          </template>
        </el-table-column>

        <!-- AI解释 -->
        <el-table-column prop="aiAnalysis" label="AI解释" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tooltip :content="row.aiAnalysis || '无AI解释'" placement="top" :show-after="400" effect="dark">
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
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button
                size="small"
                type="primary"
                link
                @click="handleConfirm(row)"
                :disabled="row.status !== 'unhandled'"
              >
                确认
              </el-button>
              <el-button
                size="small"
                type="warning"
                link
                @click="handleFalse(row)"
                :disabled="row.status !== 'unhandled'"
              >
                误报
              </el-button>
              <el-button size="small" link @click="handleIgnore(row)">忽略</el-button>
              <el-button size="small" type="primary" link @click="showEvidence(row)">
                证据链
              </el-button>
              <el-button size="small" type="info" link @click="handleDetail(row)">
                详情
              </el-button>
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

    <!-- ===== 告警详情弹窗 ===== -->
    <el-dialog
      v-model="showDetailDialog"
      title="告警详情"
      width="640px"
      destroy-on-close
      class="alarm-detail-dialog"
    >
      <template v-if="detailAlarm">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="告警ID">
            <span class="font-mono">{{ detailAlarm.id }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="级别">
            <el-tag :type="levelTagType(detailAlarm.severity)" size="small" effect="dark">
              {{ severityLabel(detailAlarm.severity) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="类型">{{ detailAlarm.type }}</el-descriptions-item>
          <el-descriptions-item label="设备">{{ detailAlarm.deviceName || detailAlarm.deviceId }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ formatTime(detailAlarm.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="置信度">
            <span :style="{ color: confidenceColor(detailAlarm.aiConfidence), fontWeight: 600 }">
              {{ Math.round((detailAlarm.aiConfidence ?? 0) * 100) }}%
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">
            {{ detailAlarm.description || detailAlarm.title }}
          </el-descriptions-item>
          <el-descriptions-item label="AI推理路径" :span="2">
            <div class="xai-detail">{{ detailAlarm.aiAnalysis || '无AI解释' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="关联记忆" :span="2">
            {{ detailAlarm.memoryRefs || '无关联记忆' }}
          </el-descriptions-item>
          <el-descriptions-item label="处理状态">
            <el-tag :type="statusTagType(detailAlarm.status)" size="small">
              {{ statusLabel(detailAlarm.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="处理人">
            {{ detailAlarm.handledBy || '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </el-dialog>

    <!-- ===== 证据链弹窗 ===== -->
    <el-dialog v-model="showEvidenceDialog" title="告警证据链" width="720px" destroy-on-close>
      <div v-loading="evidenceLoading">
        <template v-if="evidenceData">
          <el-row :gutter="16">
            <!-- 快照 -->
            <el-col :span="12">
              <div class="evidence-section">
                <div class="evidence-section-title">告警快照</div>
                <el-image
                  v-if="evidenceData.snapshotUrl"
                  :src="evidenceData.snapshotUrl"
                  fit="contain"
                  style="width:100%;max-height:300px;border-radius:8px;border:1px solid var(--app-border)"
                  :preview-src-list="[evidenceData.snapshotUrl]"
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
                  v-if="evidenceData.videoClipUrl"
                  :src="evidenceData.videoClipUrl"
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
          <!-- 关联录像 -->
          <div v-if="evidenceData.relatedRecordingId" class="evidence-section" style="margin-top:16px">
            <div class="evidence-section-title">关联录像</div>
            <el-button type="primary" size="small" @click="goToRecording(evidenceData.relatedRecordingId!)">
              跳转到录像回放 {{ evidenceData.relatedRecordingTime ? '(' + evidenceData.relatedRecordingTime + ')' : '' }}
            </el-button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Bell, Warning, CircleCheck, Clock,
  Search, Refresh, Download, WarningFilled,
} from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import { exportApi } from '@/api/export'
import type { AlarmHandleForm, AlarmEvidence } from '@/types/alarm'
import { useAuthStore } from '@/stores/auth'
import { useWebSocket } from '@/composables/useWebSocket'
import { useRouter } from 'vue-router'

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
const alarms = ref<any[]>([])
const totalAlarms = ref(0)

// ── 详情弹窗 ──
const showDetailDialog = ref(false)
const detailAlarm = ref<any>(null)

// ── 证据链弹窗 ──
const router = useRouter()
const showEvidenceDialog = ref(false)
const evidenceLoading = ref(false)
const evidenceData = ref<AlarmEvidence | null>(null)
const evidenceAlarmId = ref('')
const analyzeLoading = ref(false)

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

// ── 后端 level 整数 → 前端 severity 字符串映射 ──
function mapLevelToSeverity(level: any): string {
  if (typeof level === 'string') {
    const low = level.toLowerCase()
    if (['critical', 'high', 'medium', 'low', 'info'].includes(low)) return low
  }
  const n = Number(level)
  if (isNaN(n)) return 'low'
  if (n >= 4) return 'critical'
  if (n >= 3) return 'high'
  if (n >= 2) return 'medium'
  if (n >= 1) return 'low'
  return 'info'
}

// ── 后端 snake_case → 前端 camelCase 字段映射 ──
function normalizeAlarm(raw: any): any {
  const severity = mapLevelToSeverity(raw.severity ?? raw.level ?? 2)
  const timestamp = raw.timestamp || raw.timestamp_ms || raw.created_at || Date.now()
  return {
    id: raw.id || raw.alarm_id || '',
    type: raw.type || raw.alarm_type || 'other',
    severity,
    level: severity,
    description: raw.description || raw.title || '',
    title: raw.title || raw.description || '',
    channelId: String(raw.channel_id ?? raw.channelId ?? raw.channel ?? ''),
    channelName: raw.channel_name || raw.channelName || '',
    deviceId: raw.device_id || raw.deviceId || raw.channel_id || '',
    deviceName: raw.device_name || raw.deviceName || raw.zone || '',
    snapshotUrl: raw.snapshot_url || raw.snapshotUrl || raw.snapshot_path || '',
    videoClipUrl: raw.video_clip_url || raw.videoClipUrl || '',
    aiConclusion: raw.ai_conclusion || raw.aiConclusion || raw.ai_analysis || '',
    aiAnalysis: raw.ai_analysis || raw.aiAnalysis || raw.ai_conclusion || '',
    aiConfidence: raw.confidence ?? raw.ai_confidence ?? raw.aiConfidence ?? 0,
    confidence: raw.confidence ?? 0,
    status: raw.status || 'unhandled',
    location: raw.location || raw.zone || '',
    createdAt: raw.created_at || raw.createdAt || (timestamp ? new Date(typeof timestamp === 'number' ? timestamp : timestamp).toISOString() : new Date().toISOString()),
    updatedAt: raw.updated_at || raw.updatedAt || raw.created_at || raw.createdAt || new Date().toISOString(),
    handledBy: raw.handled_by || raw.handledBy || '',
    handleNote: raw.handle_note || raw.handleNote || '',
    metadata: raw.metadata || {},
  }
}

// ── 从真实API获取告警数据 ──
async function fetchAlarms() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: currentPage.value,
      pageSize: pageSize.value,
      count: pageSize.value * 5, // 后端用 count 参数
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
const { connected: wsConnected, subscribe: wsSubscribe } = useWebSocket('/ws/alarms')

const unsubscribeAlarm = wsSubscribe('alarm', (data: any) => {
  // 新告警推送到列表头部
  alarms.value.unshift(data)
  totalAlarms.value++
  ElMessage({
    type: data.severity === 'critical' ? 'error' : 'warning',
    message: `🚨 新告警: ${data.type || data.alarm_type} — ${data.location || data.device_name}`,
    duration: 5000,
  })
})

// ── 统计卡片数据 ──
const alarmStatCards = computed(() => {
  const total = totalAlarms.value || alarms.value.length
  const critical = alarms.value.filter(a => a.severity === 'critical' || a.level === 'critical').length
  const unhandled = alarms.value.filter(a => a.status === 'unhandled').length
  const falseAlarms = alarms.value.filter(a => a.status === 'false_alarm' || a.status === 'ignored').length
  return [
    { label: '总告警', value: total, color: '#6366F1', icon: Bell },
    { label: '严重', value: critical, color: '#DC2626', icon: Warning },
    { label: '未处理', value: unhandled, color: '#F59E0B', icon: Clock },
    { label: '误报', value: falseAlarms, color: '#22C55E', icon: CircleCheck },
  ]
})

// ── 筛选后的告警 ──
const filteredAlarms = computed(() => {
  let list = [...alarms.value]

  if (levelFilter.value) {
    list = list.filter(a => (a.severity || a.level) === levelFilter.value)
  }
  if (typeFilter.value) {
    list = list.filter(a => a.type === typeFilter.value)
  }
  if (statusFilter.value) {
    list = list.filter(a => a.status === statusFilter.value)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(a =>
      (a.description || '').toLowerCase().includes(q) ||
      (a.title || '').toLowerCase().includes(q) ||
      (a.deviceName || '').toLowerCase().includes(q)
    )
  }

  // 时间范围筛选
  if (dateRange.value && dateRange.value.length === 2 && dateRange.value[0] && dateRange.value[1]) {
    const [start, end] = dateRange.value
    list = list.filter(a => {
      const t = new Date(a.createdAt).getTime()
      return t >= start.getTime() && t <= end.getTime()
    })
  }

  return list
})

// ── 分页后的告警 ──
const paginatedAlarms = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredAlarms.value.slice(start, end)
})

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
  const map: Record<string, string> = { unhandled: '未处理', handling: '处理中', handled: '已处理', confirmed: '已确认', false_alarm: '误报', ignored: '已忽略' }
  return map[status] || status
}

function statusTagType(status: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = { unhandled: 'danger', handling: 'warning', handled: 'success', confirmed: 'success', false_alarm: 'warning', ignored: 'info' }
  return map[status] || 'info'
}

function confidenceColor(c: number | undefined) {
  if (!c) return '#9CA3AF'
  if (c >= 0.9) return '#10B981'
  if (c >= 0.7) return '#F59E0B'
  return '#EF4444'
}

function formatTime(isoString: string | undefined) {
  if (!isoString) return '-'
  try {
    return new Date(isoString).toLocaleString('zh-CN')
  } catch {
    return isoString
  }
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
  ElMessageBox.confirm(`确认告警：「${row.description || row.title}」?`, '确认告警', {
    confirmButtonText: '确认为真实告警',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    try {
      await alarmApi.handle(row.id, { status: 'confirmed', note: '' })
      row.status = 'handled'
      row.handledBy = useAuthStore().user?.name || '当前用户'
      ElMessage.success('已确认')
    } catch (err) {
      ElMessage.error('操作失败')
    }
  }).catch(() => {})
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
  detailAlarm.value = row
  showDetailDialog.value = true
}

// ── 证据链 ──
async function showEvidence(row: any) {
  evidenceAlarmId.value = row.id
  showEvidenceDialog.value = true
  evidenceLoading.value = true
  evidenceData.value = null
  try {
    const res = await alarmApi.getEvidence(row.id)
    const data = (res as any)?.data?.data ?? (res as any)?.data
    evidenceData.value = data || { snapshotUrl: row.snapshotUrl || '', videoClipUrl: row.videoClipUrl }
  } catch {
    evidenceData.value = { snapshotUrl: row.snapshotUrl || '', videoClipUrl: row.videoClipUrl }
  } finally {
    evidenceLoading.value = false
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
      const poll = setInterval(async () => {
        try {
          const detail = await exportApi.getTaskDetail(task.id)
          const t = detail.data?.data
          if (t?.status === 'completed' && t.fileUrl) {
            clearInterval(poll)
            const blob = await exportApi.downloadFile(task.id)
            const url = URL.createObjectURL(blob.data as any)
            const a = document.createElement('a')
            a.href = url
            a.download = t.fileName || `告警报表.xlsx`
            a.click()
            URL.revokeObjectURL(url)
            ElMessage.success('导出完成')
          } else if (t?.status === 'failed') {
            clearInterval(poll)
            ElMessage.error(t.errorMessage || '导出失败')
          }
        } catch { clearInterval(poll) }
      }, 2000)
    }
  } catch {
    ElMessage.error('导出请求失败')
  }
}

// 页面加载时获取数据
onMounted(() => {
  fetchAlarms()
})

onUnmounted(() => {
  unsubscribeAlarm?.()
})
</script>

<style scoped>
/* ============================================================
 * 告警中心 AlarmsView — v6.0 样式
 * ============================================================ */
.alarms-page {
  padding: 20px 24px;
  max-width: var(--content-max-width, 1440px);
  margin: 0 auto;
  animation: fadeIn 0.3s ease;
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
.device-status-dot.alarming { background: #DC2626; animation: pulse 1.5s ease-in-out infinite; }

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

/* ── 待处理状态动画 ── */
.status-pending {
  animation: pulse 2s ease-in-out infinite;
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
