<script setup lang="ts">
/**
 * 录像分析页 — 上传历史录像 → 离线识别任务管理
 *
 * [FEAT offline-analysis 2026-09-21] v1.0 (设计稿: docs/plans/录像上传离线识别_v1.0.md)
 *   顶部: 拖拽上传区 (分片 4MB / 断点续传 / 扩展名前端预检, 后端 ffprobe 兜底)
 *   中部: 任务列表 (状态机 tag / 进度条 / 取消 / 删除), 活动任务存在时 5s 轮询
 *   抽屉: 任务详情 + 按虚拟通道聚合的关联告警 (evidence 快照可预览)
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile, UploadRawFile } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import {
  listTasks, cancelTask, deleteTask, createTask, uploadVideoFile,
  OFFLINE_ALLOWED_EXT,
  type OfflineTask, type OfflineTaskState, type UploadCompleteData,
  type UploadProgressInfo,
} from '@/api/recordAnalysis'
import eventTypesApi, { type CanonicalEventType } from '@/api/eventTypes'
import { alarmApi } from '@/api/alarm'
import { normalizeAlarmCore, type AlarmEvent } from '@/types/alarm'

// ============================================================
// 工具
// ============================================================

/** epoch ms → 本地时间串 */
function fmtMs(ms: number): string {
  if (!ms || ms <= 0) return '--'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 字节数 → 可读大小 */
function fmtSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '--'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

/** 秒 → mm:ss / h:mm:ss */
function fmtDur(sec: number): string {
  if (!sec || sec <= 0) return '--'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`
}

/** 事件类型 key → 中文名 (canonical SSOT 拉取一次) */
const eventTypeMap = ref<Map<string, CanonicalEventType>>(new Map())
function evName(key: string): string {
  return eventTypeMap.value.get(key)?.name_zh || key
}

/** 告警时间串容错格式化 */
function fmtAlarmTime(s: string): string {
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString('zh-CN', { hour12: false })
}

/** 置信度展示 (0-1 / 0-100 双口径容错) */
function confText(c: number): string {
  const v = Number(c) || 0
  return `${Math.round(v <= 1 ? v * 100 : v)}%`
}

/** 状态机展示元数据 (与后端 TaskState 枚举同构) */
const STATE_META: Record<OfflineTaskState, { label: string; type: 'info' | 'primary' | 'warning' | 'success' | 'danger' }> = {
  UPLOADED: { label: '已上传', type: 'info' },
  QUEUED: { label: '排队中', type: 'info' },
  PRECHECK: { label: '预检中', type: 'primary' },
  ANALYZING: { label: '分析中', type: 'warning' },
  FINALIZING: { label: '收尾中', type: 'warning' },
  COMPLETED: { label: '已完成', type: 'success' },
  FAILED: { label: '失败', type: 'danger' },
  CANCELLED: { label: '已取消', type: 'info' },
}
const ACTIVE_STATES: OfflineTaskState[] = ['QUEUED', 'PRECHECK', 'ANALYZING', 'FINALIZING']
const isTaskActive = (t: OfflineTask) => ACTIVE_STATES.includes(t.state)

// ============================================================
// 任务列表 + 轮询
// ============================================================

const tasks = ref<OfflineTask[]>([])
const listLoading = ref(false)
const hasActive = computed(() => tasks.value.some(isTaskActive))

async function refresh(): Promise<void> {
  listLoading.value = true
  try {
    const resp = await listTasks()
    tasks.value = resp.data.data?.tasks || []
  } catch (err) {
    console.error('[RecordAnalysis] 任务列表拉取失败:', err)
  } finally {
    listLoading.value = false
  }
  schedulePoll()
}

/** 活动任务存在时 5s 轮询 (否则停轮, 由操作动作触发刷新) */
let pollTimer: ReturnType<typeof setTimeout> | null = null
function schedulePoll(): void {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  if (hasActive.value) {
    pollTimer = setTimeout(async () => {
      pollTimer = null
      try {
        const resp = await listTasks()
        tasks.value = resp.data.data?.tasks || []
      } catch { /* 轮询失败静默, 下轮重试 */ }
      schedulePoll()
    }, 5000)
  }
}

// ============================================================
// 上传 (分片 + 断点续传 + 预检)
// ============================================================

const uploadState = ref<'idle' | 'uploading' | 'merging'>('idle')
const uploadInfo = ref<UploadProgressInfo>({ phase: 'uploading', uploadedChunks: 0, totalChunks: 0, percent: 0 })
/** 上传完成产物 (ffprobe 元数据), 创建任务对话框数据源 */
const lastComplete = ref<UploadCompleteData | null>(null)

function extAllowed(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return (OFFLINE_ALLOWED_EXT as readonly string[]).includes(ext)
}

async function handleFileChange(file: UploadFile): Promise<void> {
  const raw = file.raw as UploadRawFile | undefined
  if (!raw) return
  if (uploadState.value !== 'idle') {
    ElMessage.warning('已有上传任务进行中, 请等待完成')
    return
  }
  if (!extAllowed(raw.name)) {
    ElMessage.error(`不支持的文件类型, 仅允许: ${OFFLINE_ALLOWED_EXT.join(' / ')}`)
    return
  }
  uploadState.value = 'uploading'
  uploadInfo.value = { phase: 'uploading', uploadedChunks: 0, totalChunks: 0, percent: 0 }
  try {
    const complete = await uploadVideoFile(raw, {
      onProgress: (info: UploadProgressInfo) => {
        uploadInfo.value = info
        if (info.phase === 'merging') uploadState.value = 'merging'
      },
    })
    lastComplete.value = complete
    uploadState.value = 'idle'
    openTaskDialog(complete)
  } catch (err) {
    uploadState.value = 'idle'
    const msg = err instanceof Error ? err.message : '上传失败'
    ElMessage.error(`上传失败: ${msg}`)
  }
}

// ============================================================
// 创建任务对话框
// ============================================================

const taskDialogVisible = ref(false)
const taskSubmitting = ref(false)
const taskForm = ref({
  upload_id: '',
  name: '',
  event_types: [] as string[],
  target_fps: 5,
})

function openTaskDialog(complete: UploadCompleteData): void {
  taskForm.value = {
    upload_id: complete.upload_id,
    // 默认任务名 = 文件名去扩展名
    name: (complete.file_path.split('/').pop() || '录像分析任务').replace(/\.[^.]+$/, ''),
    event_types: [],
    target_fps: 5,
  }
  taskDialogVisible.value = true
}

async function submitTask(): Promise<void> {
  if (!taskForm.value.name.trim()) { ElMessage.warning('请填写任务名称'); return }
  if (taskForm.value.event_types.length === 0) { ElMessage.warning('请至少选择一种识别事件'); return }
  taskSubmitting.value = true
  try {
    await createTask({
      upload_id: taskForm.value.upload_id,
      name: taskForm.value.name.trim(),
      event_types: taskForm.value.event_types,
      target_fps: taskForm.value.target_fps,
    })
    ElMessage.success('任务已创建, 已加入分析队列')
    taskDialogVisible.value = false
    lastComplete.value = null
    await refresh()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '创建失败'
    ElMessage.error(`创建任务失败: ${msg}`)
  } finally {
    taskSubmitting.value = false
  }
}

// ============================================================
// 任务操作 (取消 / 删除 / 详情)
// ============================================================

async function onCancel(t: OfflineTask): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定取消任务「${t.name}」? 排队中将直接出队, 分析中将终止识别。`,
      '取消任务', { type: 'warning', confirmButtonText: '取消任务', cancelButtonText: '返回' },
    )
  } catch { return }
  try {
    await cancelTask(t.task_id)
    ElMessage.success('任务已取消')
    await refresh()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '取消失败')
  }
}

async function onDelete(t: OfflineTask): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除任务「${t.name}」? 仅删除任务记录, 上传文件保留。`,
      '删除任务', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '返回' },
    )
  } catch { return }
  try {
    await deleteTask(t.task_id, false)
    ElMessage.success('任务已删除')
    await refresh()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}

// ─── 详情抽屉 ───

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailTask = ref<OfflineTask | null>(null)
const detailAlarms = ref<AlarmEvent[]>([])

async function openDetail(t: OfflineTask): Promise<void> {
  detailTask.value = t
  detailAlarms.value = []
  detailVisible.value = true
  detailLoading.value = true
  try {
    // 关联告警: 按虚拟通道 id 精确过滤 (后端 channel_id 归一过滤口径);
    // alarmApi 泛型为 ApiResponse<PageResponse>, axios 语义双层取 data;
    // [FIX offline-analysis 2026-09-21] alarms 端点实测返回 {alarms:[...]}
    //   键名 (AlarmsView 同口径两形态兼容), 纯数字 channel_id 曾触发
    //   后端 302 (已修) — 双保险取数
    const resp = await alarmApi.getList({ channel_id: String(t.channel_id), page: 1, pageSize: 50 })
    const respData: any = resp.data?.data ?? resp.data
    const rawList: any[] = respData?.alarms || respData?.items || []
    // [FIX offline-analysis 2026-09-21] REST 行为 snake_case 原始态
    //   (alarm_type/created_at/snapshot_*), 模板按 AlarmEvent 归一字段消费 —
    //   必须经项目标准 normalizeAlarmCore (AlarmsView 同源), 否则事件列
    //   恒 undefined / 时间串错位 (真机验收实证)
    detailAlarms.value = rawList.map((r) => normalizeAlarmCore(r))
  } catch (err) {
    console.error('[RecordAnalysis] 关联告警拉取失败:', err)
  } finally {
    detailLoading.value = false
  }
}

// ============================================================
// 生命周期
// ============================================================

onMounted(async () => {
  await refresh()
  try {
    // eventTypesApi 泛型为 ApiResponse<...>, axios 语义双层取 data
    const resp = await eventTypesApi.list()
    const map = new Map<string, CanonicalEventType>()
    for (const t of resp.data.data?.types || []) map.set(t.key, t)
    eventTypeMap.value = map
  } catch (err) {
    console.error('[RecordAnalysis] 事件类型拉取失败:', err)
  }
})
onUnmounted(() => {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
})
</script>

<template>
  <div class="record-analysis-page">
    <!-- ===== 顶部: 拖拽上传区 ===== -->
    <el-card shadow="never" class="upload-card">
      <template #header>
        <div class="card-header">
          <span>上传录像</span>
          <span class="header-hint">支持 mp4 / mov / avi / mkv / ts (H.264/H.265), 单文件 ≤ 2GB</span>
        </div>
      </template>

      <el-upload
        v-if="uploadState === 'idle'"
        drag
        accept=".mp4,.mov,.avi,.mkv,.ts"
        :show-file-list="false"
        :auto-upload="false"
        :on-change="handleFileChange"
        class="upload-drag"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽录像文件到此处, 或 <em>点击选择文件</em></div>
        <template #tip>
          <div class="el-upload__tip">上传后可勾选识别事件类型创建离线分析任务</div>
        </template>
      </el-upload>

      <div v-else class="upload-progress">
        <div class="progress-label">
          <template v-if="uploadState === 'uploading'">
            分片上传中: {{ uploadInfo.uploadedChunks }}/{{ uploadInfo.totalChunks }} 片
          </template>
          <template v-else>合并文件与完整性预检中, 请稍候…</template>
        </div>
        <el-progress
          :percentage="uploadInfo.percent"
          :status="uploadState === 'merging' ? 'warning' : undefined"
          :stroke-width="14"
        />
      </div>
    </el-card>

    <!-- ===== 中部: 任务列表 ===== -->
    <el-card shadow="never" class="tasks-card">
      <template #header>
        <div class="card-header">
          <span>分析任务</span>
          <el-button text type="primary" @click="refresh">刷新</el-button>
        </div>
      </template>

      <el-table :data="tasks" v-loading="listLoading" stripe>
        <el-table-column label="任务" min-width="220">
          <template #default="{ row }">
            <div class="task-name">{{ row.name }}</div>
            <div class="task-sub">{{ row.filename }} · {{ fmtSize(row.filesize) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="STATE_META[row.state as OfflineTaskState]?.type || 'info'" size="small">
              {{ STATE_META[row.state as OfflineTaskState]?.label || row.state }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" width="170">
          <template #default="{ row }">
            <el-progress
              v-if="row.progress >= 0"
              :percentage="Math.min(100, Math.round(row.progress))"
              :status="row.state === 'COMPLETED' ? 'success' : row.state === 'FAILED' ? 'exception' : undefined"
              :stroke-width="10"
            />
            <span v-else class="progress-unknown">--</span>
          </template>
        </el-table-column>
        <el-table-column label="视频" width="170">
          <template #default="{ row }">
            <span class="task-sub">
              {{ row.codec ? row.codec.toUpperCase() : '--' }} · {{ row.width }}×{{ row.height }} · {{ fmtDur(row.duration_s) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="识别事件" min-width="180">
          <template #default="{ row }">
            <el-tag
              v-for="et in (row.event_types || []).slice(0, 3)"
              :key="et" size="small" type="info" class="ev-tag"
            >{{ evName(et) }}</el-tag>
            <span v-if="(row.event_types || []).length > 3" class="task-sub">+{{ row.event_types.length - 3 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="165">
          <template #default="{ row }">{{ fmtMs(row.created_at_ms) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button
              v-if="isTaskActive(row)" text type="warning" size="small"
              @click="onCancel(row as OfflineTask)"
            >取消</el-button>
            <el-button
              v-if="row.state === 'COMPLETED' || row.state === 'FAILED' || row.state === 'CANCELLED'"
              text type="danger" size="small" @click="onDelete(row as OfflineTask)"
            >删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无分析任务, 请先上传录像" :image-size="80" />
        </template>
      </el-table>
    </el-card>

    <!-- ===== 创建任务对话框 ===== -->
    <el-dialog v-model="taskDialogVisible" title="创建离线分析任务" width="520px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="任务名称" required>
          <el-input v-model="taskForm.name" maxlength="64" placeholder="任务名称" />
        </el-form-item>
        <el-form-item v-if="lastComplete" label="视频信息">
          <span class="task-sub">
            {{ (lastComplete.codec || '').toUpperCase() }} · {{ lastComplete.width }}×{{ lastComplete.height }} ·
            时长 {{ fmtDur(lastComplete.duration_s) }}
          </span>
        </el-form-item>
        <el-form-item label="识别事件" required>
          <el-select
            v-model="taskForm.event_types" multiple filterable
            placeholder="选择要识别的事件类型 (可多选)" class="ev-select"
          >
            <el-option
              v-for="t in eventTypeMap.values()"
              :key="t.key" :label="t.name_zh" :value="t.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分析帧率">
          <el-input-number v-model="taskForm.target_fps" :min="1" :max="15" />
          <span class="task-sub fps-hint">fps, 越低越省算力 (默认 5, 设备负载高时任务会排队等待)</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="taskSubmitting" @click="submitTask">创建任务</el-button>
      </template>
    </el-dialog>

    <!-- ===== 详情抽屉 ===== -->
    <el-drawer v-model="detailVisible" :title="detailTask ? `任务详情 · ${detailTask.name}` : '任务详情'" size="560px">
      <template v-if="detailTask">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="状态">
            <el-tag :type="STATE_META[detailTask.state]?.type || 'info'" size="small">
              {{ STATE_META[detailTask.state]?.label || detailTask.state }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="进度">
            {{ detailTask.progress >= 0 ? `${Math.round(detailTask.progress)}%` : '--' }}
          </el-descriptions-item>
          <el-descriptions-item label="文件">{{ detailTask.filename }}</el-descriptions-item>
          <el-descriptions-item label="大小">{{ fmtSize(detailTask.filesize) }}</el-descriptions-item>
          <el-descriptions-item label="编码">{{ detailTask.codec ? detailTask.codec.toUpperCase() : '--' }}</el-descriptions-item>
          <el-descriptions-item label="分辨率">{{ detailTask.width }}×{{ detailTask.height }}</el-descriptions-item>
          <el-descriptions-item label="时长">{{ fmtDur(detailTask.duration_s) }}</el-descriptions-item>
          <el-descriptions-item label="分析帧率">{{ detailTask.target_fps }} fps</el-descriptions-item>
          <el-descriptions-item label="创建时间" :span="2">{{ fmtMs(detailTask.created_at_ms) }}</el-descriptions-item>
          <el-descriptions-item v-if="detailTask.message" label="说明" :span="2">{{ detailTask.message }}</el-descriptions-item>
          <el-descriptions-item label="识别事件" :span="2">
            <el-tag v-for="et in detailTask.event_types" :key="et" size="small" type="info" class="ev-tag">
              {{ evName(et) }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <div class="alarm-section-title">
          关联告警 <span class="task-sub">(虚拟通道 {{ detailTask.channel_id || '--' }})</span>
        </div>
        <el-table :data="detailAlarms" v-loading="detailLoading" size="small" stripe>
          <el-table-column label="快照" width="86">
            <template #default="{ row }">
              <el-image
                v-if="row.snapshotUrl"
                :src="row.snapshotUrl"
                :preview-src-list="[row.snapshotUrl]"
                preview-teleported
                fit="cover" class="alarm-snap"
              />
              <span v-else class="task-sub">--</span>
            </template>
          </el-table-column>
          <el-table-column label="事件" min-width="120">
            <template #default="{ row }">
              <div class="task-name">{{ evName(String(row.type)) }}</div>
              <div class="task-sub">{{ confText(row.confidence) }} · {{ fmtAlarmTime(row.createdAt) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="描述" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.description }}</template>
          </el-table-column>
          <template #empty>
            <el-empty description="任务运行中产生告警后将在此展示" :image-size="60" />
          </template>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.record-analysis-page {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}
.header-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.upload-drag :deep(.el-upload-dragger) {
  padding: 28px 0;
}
.upload-progress {
  padding: 8px 4px;
}
.progress-label {
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.task-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.task-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.progress-unknown {
  color: var(--el-text-color-secondary);
}
.ev-tag {
  margin-right: 4px;
}
.fps-hint {
  margin-left: 8px;
}
.ev-select {
  width: 100%;
}
.alarm-section-title {
  margin: 18px 0 10px;
  font-size: 14px;
  font-weight: 600;
}
.alarm-snap {
  width: 72px;
  height: 44px;
  border-radius: 4px;
  display: block;
}
</style>
