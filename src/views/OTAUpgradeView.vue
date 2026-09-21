<template>
  <div class="ota-page">
    <div class="page-title">
      <h2>🔄 OTA 升级管理</h2>
    </div>

    <!-- [M2-4 2026-09-21] 升级完成校验: 以 bootId (Linux 启动标识) 变化判定升级完成,
         不得仅凭 HTTP 200 / 任务状态判定 (假成功拦截) -->
    <el-card shadow="never" class="boot-verify-card">
      <div class="boot-verify-row">
        <div>
          <span style="font-weight:600">升级完成校验</span>
          <el-tag size="small" style="margin-left:8px" :type="bootBaseline ? 'success' : 'info'">
            {{ bootBaseline ? '已记录升级基线' : '未记录基线' }}
          </el-tag>
          <div class="boot-verify-meta">
            当前 bootId: <code>{{ currentBootId ? currentBootId.slice(0, 8) + '…' : '读取中…' }}</code>
            <span v-if="currentVersion"> · 版本: {{ currentVersion }}</span>
            <span v-if="bootBaseline"> · 基线: <code>{{ bootBaseline.slice(0, 8) }}…</code></span>
          </div>
        </div>
        <div>
          <el-button size="small" @click="recordBootBaseline">记录升级基线</el-button>
          <el-button size="small" type="primary" :disabled="!bootBaseline" @click="verifyUpgradeComplete">验证升级完成</el-button>
        </div>
      </div>
      <el-alert v-if="verifyResult" :type="verifyResult.type" :title="verifyResult.title"
        :description="verifyResult.message" :closable="false" style="margin-top:10px" />
    </el-card>

    <el-tabs v-model="activeTab" type="border-card">
      <!-- 固件管理 -->
      <el-tab-pane label="固件管理" name="firmware">
        <div class="tab-toolbar">
          <span class="tab-desc">管理盒子固件版本，上传和发布升级包</span>
          <el-button type="primary" size="small" @click="showUploadDialog = true">
            <el-icon><Upload /></el-icon>上传固件
          </el-button>
        </div>
        <el-table :data="firmwares" stripe>
          <el-table-column prop="version" label="版本号" width="120">
            <template #default="{ row }">
              <el-tag size="small" effect="dark">v{{ row.version }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="200" />
          <el-table-column prop="fileSize" label="大小" width="100">
            <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
          </el-table-column>
          <el-table-column prop="targetHardware" label="适用硬件" width="180">
            <template #default="{ row }">
              <el-tag v-for="h in row.targetHardware" :key="h" size="small" style="margin: 2px">{{ h }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="isForce" label="强制" width="70">
            <template #default="{ row }">
              <el-tag :type="row.isForce ? 'danger' : 'info'" size="small">{{ row.isForce ? '是' : '否' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="fwStatusTag(row.status) as 'info' | 'success' | 'danger'" size="small">{{ fwStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="publishedAt" label="发布时间" width="170" />
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button v-if="row.status === 'draft'" size="small" type="success" link @click="handlePublish(row)">发布</el-button>
              <el-button size="small" link type="primary" @click="handleCreateTask(row)">创建任务</el-button>
              <el-button v-if="row.status !== 'deprecated'" size="small" link type="danger" @click="handleDeprecate(row)">废弃</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 升级任务 -->
      <el-tab-pane label="升级任务" name="tasks">
        <div class="tab-toolbar">
          <span class="tab-desc">管理设备和盒子的固件升级任务</span>
          <el-button type="primary" size="small" @click="showCreateTaskDialog = true">
            <el-icon><Plus /></el-icon>创建任务
          </el-button>
        </div>
        <el-table :data="otaTasks" stripe>
          <el-table-column prop="firmwareVer" label="目标版本" width="120">
            <template #default="{ row }">
              <el-tag size="small">v{{ row.firmwareVer }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="deviceCount" label="设备数" width="80" align="center" />
          <el-table-column prop="progress" label="进度" width="200">
            <template #default="{ row }">
              <div class="task-progress">
                <el-progress
                  :percentage="row.progress"
                  :status="row.status === 'failed' ? 'exception' : row.status === 'completed' ? 'success' : undefined"
                  :stroke-width="8"
                />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="成功/失败" width="120">
            <template #default="{ row }">
              <span class="success-count">{{ row.successCount }}</span>
              <span> / </span>
              <span class="failure-count">{{ row.failedCount }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="taskStatusTag(row.status) as 'info' | 'warning' | 'success' | 'danger'" size="small">{{ taskStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="startedAt" label="开始时间" width="170" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button v-if="row.status === 'running'" size="small" link type="danger" @click="handleCancelTask(row)">取消</el-button>
              <el-button v-if="row.status === 'failed'" size="small" link type="primary" @click="handleRetryTask(row)">重试</el-button>
              <span v-if="row.status === 'completed'" style="color:#52c41a;font-size:12px">已完成</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- [P2-1] 批量配置 -->
      <el-tab-pane label="批量配置" name="batch">
        <div class="tab-toolbar">
          <span class="tab-desc">批量下发设备配置参数（码流/系统/AI阈值）</span>
          <el-button type="primary" size="small" @click="executeBatchConfig" :loading="batchConfigLoading"
            :disabled="batchSelectedDevices.length === 0">
            <el-icon><Promotion /></el-icon>批量下发 ({{ batchSelectedDevices.length }}台)
          </el-button>
        </div>

        <el-row :gutter="16">
          <!-- 左: 设备选择 -->
          <el-col :span="8">
            <el-card shadow="never">
              <template #header>
                <span style="font-weight:600">选择设备</span>
                <el-button link size="small" @click="selectAllDevices" style="float:right">
                  {{ batchSelectedDevices.length === batchDeviceList.length ? '取消全选' : '全选' }}
                </el-button>
              </template>
              <el-table :data="batchDeviceList" height="420" @selection-change="onBatchSelectionChange"
                ref="batchDeviceTableRef" size="small" stripe>
                <el-table-column type="selection" width="40" />
                <el-table-column prop="name" label="设备名称" min-width="120" show-overflow-tooltip />
                <el-table-column prop="status" label="状态" width="70">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.status === 'online' ? 'success' : 'info'">
                      {{ row.status === 'online' ? '在线' : '离线' }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>

          <!-- 右: 配置参数 -->
          <el-col :span="16">
            <el-card shadow="never">
              <template #header><span style="font-weight:600">配置参数</span></template>
              <el-form label-width="120px" size="small">
                <!-- 码流参数 -->
                <el-divider content-position="left">码流参数</el-divider>
                <el-form-item label="启用码流配置">
                  <el-switch v-model="batchConfigGroups.stream" />
                </el-form-item>
                <template v-if="batchConfigGroups.stream">
                  <el-form-item label="编码格式">
                    <el-select v-model="batchConfig.videoCodec" style="width:160px">
                      <el-option label="H.264" value="H264" />
                      <el-option label="H.265" value="H265" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="分辨率">
                    <el-select v-model="batchConfig.resolution" style="width:160px">
                      <el-option label="4K (3840×2160)" value="3840x2160" />
                      <el-option label="1080P (1920×1080)" value="1920x1080" />
                      <el-option label="720P (1280×720)" value="1280x720" />
                      <el-option label="D1 (704×576)" value="704x576" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="帧率 (FPS)">
                    <el-input-number v-model="batchConfig.fps" :min="1" :max="60" />
                  </el-form-item>
                  <el-form-item label="码率 (Kbps)">
                    <el-input-number v-model="batchConfig.bitrate" :min="256" :max="8192" :step="256" />
                  </el-form-item>
                </template>

                <!-- 系统参数 -->
                <el-divider content-position="left">系统参数</el-divider>
                <el-form-item label="启用系统配置">
                  <el-switch v-model="batchConfigGroups.system" />
                </el-form-item>
                <template v-if="batchConfigGroups.system">
                  <el-form-item label="日志级别">
                    <el-select v-model="batchConfig.logLevel" style="width:120px">
                      <el-option label="Debug" value="debug" />
                      <el-option label="Info" value="info" />
                      <el-option label="Warn" value="warn" />
                      <el-option label="Error" value="error" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="录像保留(天)">
                    <el-input-number v-model="batchConfig.recordRetentionDays" :min="1" :max="365" />
                  </el-form-item>
                  <el-form-item label="NTP服务器">
                    <el-input v-model="batchConfig.ntpServer" placeholder="如 ntp.aliyun.com" style="width:240px" />
                  </el-form-item>
                  <el-form-item label="心跳间隔(s)">
                    <el-input-number v-model="batchConfig.heartbeatInterval" :min="10" :max="3600" />
                  </el-form-item>
                </template>

                <!-- AI参数 -->
                <el-divider content-position="left">AI 推理参数</el-divider>
                <el-form-item label="启用AI配置">
                  <el-switch v-model="batchConfigGroups.ai" />
                </el-form-item>
                <template v-if="batchConfigGroups.ai">
                  <el-form-item label="最小置信度">
                    <el-slider v-model="batchConfig.minConfidence" :min="0.1" :max="0.9" :step="0.05" show-input style="max-width:360px" />
                  </el-form-item>
                  <el-form-item label="抓拍间隔(s)">
                    <el-input-number v-model="batchConfig.snapshotInterval" :min="1" :max="60" />
                  </el-form-item>
                </template>

                <el-form-item v-if="!batchConfigGroups.stream && !batchConfigGroups.system && !batchConfigGroups.ai">
                  <el-alert type="warning" :closable="false" title="请至少启用一个参数组" />
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>

        <!-- 下发进度 -->
        <el-card v-if="batchProgress.visible" shadow="never" style="margin-top:16px">
          <template #header><span style="font-weight:600">下发进度</span></template>
          <el-progress :percentage="batchProgress.percent" :status="batchProgress.status" />
          <el-table :data="batchProgress.results" size="small" style="margin-top:12px">
            <el-table-column prop="deviceName" label="设备" min-width="120" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 'success' ? 'success' : 'danger'">
                  {{ row.status === 'success' ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="message" label="详情" min-width="200" show-overflow-tooltip />
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 上传固件弹窗 -->
    <el-dialog v-model="showUploadDialog" title="上传固件" width="480px">
      <el-form label-width="100px">
        <el-form-item label="版本号">
          <el-input v-model="uploadForm.version" placeholder="如：6.1.0" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="uploadForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="固件文件">
          <el-upload drag action="#" :auto-upload="false" :on-change="handleFileChange" :on-remove="() => selectedFirmwareFile = null" :limit="1">
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">拖拽或 <em>点击上传</em></div>
            <template #tip>
              <div class="el-upload__tip">支持 .bin / .img 格式，最大 2GB</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="适用硬件">
          <el-checkbox-group v-model="uploadForm.targetHardware">
            <el-checkbox label="BM1684X">BM1684X</el-checkbox>
            <el-checkbox label="BM1688">BM1688</el-checkbox>
            <el-checkbox label="CV1838">CV1838</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="强制升级">
          <el-switch v-model="uploadForm.isForce" />
        </el-form-item>
        <el-form-item label="更新日志">
          <el-input v-model="uploadForm.changelog" type="textarea" :rows="3" placeholder="本次更新内容..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUploadDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmUpload" :loading="uploading">上传</el-button>
      </template>
    </el-dialog>

    <!-- 创建升级任务弹窗 -->
    <el-dialog v-model="showCreateTaskDialog" title="创建升级任务" width="500px">
      <el-form label-width="100px">
        <el-form-item label="目标版本">
          <el-select v-model="taskForm.firmwareId" style="width:100%" placeholder="选择固件版本">
            <el-option v-for="f in firmwares.filter((fw: FirmwareItem) => fw.status === 'published')" :key="f.id" :label="`v${f.version} - ${f.description}`" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标设备">
          <el-select v-model="taskForm.deviceIds" style="width:100%" multiple placeholder="选择要升级的设备" filterable>
            <el-option v-for="d in batchDeviceList" :key="d.id" :label="`${d.name} (${d.id})`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="升级策略">
          <el-radio-group v-model="taskForm.strategy">
            <el-radio value="immediate">立即升级</el-radio>
            <el-radio value="scheduled">定时升级</el-radio>
            <el-radio value="gray">灰度发布 (10%)</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateTaskDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCreateTask">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { otaApi, type FirmwareItem, type OTATask } from '@/api/ota'
import { deviceApi } from '@/api/device'
import { settingsApi } from '@/api/settings'
import { UploadFilled } from '@element-plus/icons-vue'

const activeTab = ref('firmware')
const showUploadDialog = ref(false)
const showCreateTaskDialog = ref(false)
const uploading = ref(false)
const loading = ref(false)
const selectedFirmwareFile = ref<File | null>(null)

const firmwares = ref<FirmwareItem[]>([])
const otaTasks = ref<OTATask[]>([])

const uploadForm = ref({
  version: '', description: '', targetHardware: ['BM1684X'],
  isForce: false, changelog: ''
})

const taskForm = ref({
  firmwareId: '', deviceIds: [] as string[], strategy: 'immediate' as 'immediate' | 'scheduled' | 'gray'
})

function formatSize(bytes: number) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  return (bytes / 1e3).toFixed(0) + ' KB'
}

function fwStatusTag(s: string) {
  const m: Record<string, string> = { draft: 'info', published: 'success', deprecated: 'danger' }
  return m[s] ?? 'info'
}

function fwStatusLabel(s: string) {
  const m: Record<string, string> = { draft: '草稿', published: '已发布', deprecated: '已废弃' }
  return m[s] ?? s
}

function taskStatusTag(s: string) {
  const m: Record<string, string> = { pending: 'info', running: 'warning', completed: 'success', failed: 'danger', cancelled: 'info' }
  return m[s] ?? 'info'
}

function taskStatusLabel(s: string) {
  const m: Record<string, string> = { pending: '待执行', running: '进行中', completed: '已完成', failed: '失败', cancelled: '已取消' }
  return m[s] ?? s
}

async function handlePublish(row: FirmwareItem) {
  try {
    await ElMessageBox.confirm(`确认发布 v${row.version}？发布后设备可进行升级。`, '发布确认', { type: 'warning' })
    await otaApi.publishFirmware(row.id)
    const f = firmwares.value.find((fw: FirmwareItem) => fw.id === row.id)
    if (f) f.status = 'published'
    ElMessage.success('固件已发布')
  } catch { /* cancelled or error */ }
}

async function handleDeprecate(row: FirmwareItem) {
  try {
    await ElMessageBox.confirm(`确认废弃 v${row.version}？`, '废弃确认', { type: 'warning' })
    await otaApi.deprecateFirmware(row.id)
    const f = firmwares.value.find((fw: FirmwareItem) => fw.id === row.id)
    if (f) f.status = 'deprecated'
    ElMessage.success('固件已废弃')
  } catch { /* cancelled or error */ }
}

function handleCreateTask(row: FirmwareItem) {
  taskForm.value.firmwareId = row.id
  showCreateTaskDialog.value = true
}

async function handleCancelTask(row: OTATask) {
  try {
    await ElMessageBox.confirm('确认取消该升级任务？', '取消确认', { type: 'warning' })
    await otaApi.cancelTask(row.id)
    row.status = 'cancelled'
    ElMessage.success('任务已取消')
  } catch { /* cancelled or error */ }
}

async function handleRetryTask(row: OTATask) {
  try {
    await otaApi.retryTask(row.id)
    ElMessage.success('重试指令已发送')
  } catch {
    ElMessage.error('重试失败')
  }
}

function handleFileChange(file: any) {
  selectedFirmwareFile.value = file?.raw ?? null
}

async function confirmUpload() {
  if (!uploadForm.value.version) {
    ElMessage.warning('请输入版本号')
    return
  }
  if (!selectedFirmwareFile.value) {
    ElMessage.warning('请选择固件文件')
    return
  }
  uploading.value = true
  try {
    await otaApi.uploadFirmware(selectedFirmwareFile.value, {
      version: uploadForm.value.version,
      description: uploadForm.value.description,
      targetHardware: uploadForm.value.targetHardware,
      isForce: uploadForm.value.isForce,
    })
    showUploadDialog.value = false
    ElMessage.success('固件上传成功')
    uploadForm.value = { version: '', description: '', targetHardware: ['BM1684X'], isForce: false, changelog: '' }
    selectedFirmwareFile.value = null
    await loadFirmwares()
  } catch {
    ElMessage.error('固件上传失败')
  } finally {
    uploading.value = false
  }
}

async function confirmCreateTask() {
  if (!taskForm.value.firmwareId) { ElMessage.warning('请选择固件版本'); return }
  try {
    await otaApi.createTask({
      firmwareId: taskForm.value.firmwareId,
      targetDeviceIds: taskForm.value.deviceIds.length > 0 ? taskForm.value.deviceIds : [],
      strategy: taskForm.value.strategy,
      grayscalePercentage: taskForm.value.strategy === 'gray' ? 10 : undefined,
    })
    showCreateTaskDialog.value = false
    ElMessage.success('升级任务已创建')
    taskForm.value = { firmwareId: '', deviceIds: [], strategy: 'immediate' }
    await loadTasks()
  } catch {
    ElMessage.error('创建升级任务失败')
  }
}

async function loadFirmwares() {
  loading.value = true
  try {
    const { data: res } = await otaApi.getFirmwares()
    const d = (res as unknown as Record<string, unknown>).data ?? res
    firmwares.value = (d as { items: FirmwareItem[] }).items ?? []
  } catch {
    firmwares.value = []
  } finally {
    loading.value = false
  }
}

async function loadTasks() {
  try {
    const { data: res } = await otaApi.getTasks()
    const d = (res as unknown as Record<string, unknown>).data ?? res
    otaTasks.value = (d as { items: OTATask[] }).items ?? []
  } catch {
    otaTasks.value = []
  }
}

// ── [P2-1] 批量配置 ──
const batchDeviceList = ref<Array<{ id: string; name: string; status: string }>>([])
const batchSelectedDevices = ref<Array<{ id: string; name: string; status: string }>>([])
const batchDeviceTableRef = ref()
const batchConfigLoading = ref(false)

const batchConfigGroups = reactive({
  stream: true,
  system: false,
  ai: false,
})

const batchConfig = reactive({
  videoCodec: 'H264',
  resolution: '1920x1080',
  fps: 25,
  bitrate: 2048,
  logLevel: 'info' as string,
  recordRetentionDays: 30,
  ntpServer: '',
  heartbeatInterval: 60,
  minConfidence: 0.5,
  snapshotInterval: 5,
})

const batchProgress = reactive({
  visible: false,
  percent: 0,
  status: '' as '' | 'success' | 'exception',
  results: [] as Array<{ deviceName: string; status: string; message: string }>,
})

function onBatchSelectionChange(rows: Array<{ id: string; name: string; status: string }>) {
  batchSelectedDevices.value = rows
}

function selectAllDevices() {
  if (batchSelectedDevices.value.length === batchDeviceList.value.length) {
    batchDeviceTableRef.value?.clearSelection()
  } else {
    batchDeviceList.value.forEach((row) => {
      batchDeviceTableRef.value?.toggleRowSelection(row, true)
    })
  }
}

async function loadBatchDevices() {
  try {
    const { data: res } = await deviceApi.getList({ pageSize: 200 })
    const d = (res as unknown as Record<string, unknown>).data ?? res
    const items = (d as { items?: Array<{ id: string; name: string; status: string }> }).items ?? []
    batchDeviceList.value = items.map((item) => ({
      id: item.id,
      name: item.name || item.id,
      status: item.status || 'unknown',
    }))
  } catch {
    batchDeviceList.value = []
  }
}

async function executeBatchConfig() {
  if (batchSelectedDevices.value.length === 0) {
    ElMessage.warning('请先选择设备')
    return
  }
  if (!batchConfigGroups.stream && !batchConfigGroups.system && !batchConfigGroups.ai) {
    ElMessage.warning('请至少启用一个参数组')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确认向 ${batchSelectedDevices.value.length} 台设备批量下发配置？`,
      '批量配置确认',
      { type: 'warning' }
    )
  } catch {
    return
  }

  // 构建配置 payload
  const payload: Record<string, unknown> = {}
  if (batchConfigGroups.stream) {
    payload.videoCodec = batchConfig.videoCodec
    payload.resolution = batchConfig.resolution
    payload.fps = batchConfig.fps
    payload.bitrate = batchConfig.bitrate
  }
  if (batchConfigGroups.system) {
    payload.logLevel = batchConfig.logLevel
    payload.recordRetentionDays = batchConfig.recordRetentionDays
    if (batchConfig.ntpServer) payload.ntpServer = batchConfig.ntpServer
    payload.heartbeatInterval = batchConfig.heartbeatInterval
  }
  if (batchConfigGroups.ai) {
    payload.minConfidence = batchConfig.minConfidence
    payload.snapshotInterval = batchConfig.snapshotInterval
  }

  batchConfigLoading.value = true
  batchProgress.visible = true
  batchProgress.percent = 0
  batchProgress.status = ''
  batchProgress.results = []

  const total = batchSelectedDevices.value.length
  let successCount = 0

  for (let i = 0; i < total; i++) {
    const device = batchSelectedDevices.value[i]
    try {
      await deviceApi.updateConfig(device.id, payload)
      batchProgress.results.push({ deviceName: device.name, status: 'success', message: '配置下发成功' })
      successCount++
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '未知错误'
      batchProgress.results.push({ deviceName: device.name, status: 'failed', message: msg })
    }
    batchProgress.percent = Math.round(((i + 1) / total) * 100)
  }

  batchProgress.status = successCount === total ? 'success' : 'exception'
  batchConfigLoading.value = false
  ElMessage[successCount === total ? 'success' : 'warning'](
    `批量配置完成: ${successCount}/${total} 台设备成功`
  )
}

// ── [M2-4 2026-09-21] 升级完成校验 (bootId 变化判定) ──
//   校准锚点: 固件升级必然重启, 重启后 Linux boot_id 必变; 未变 = 假成功
const currentBootId = ref('')
const currentVersion = ref('')
const bootBaseline = ref(localStorage.getItem('ota_boot_baseline') || '')
const verifyResult = ref<{ type: 'success' | 'error' | 'warning'; title: string; message: string } | null>(null)

async function loadDeviceStatus() {
  try {
    const { data: res } = await settingsApi.getSystemInfo()
    const d = (res as unknown as Record<string, unknown>).data as Record<string, unknown> | undefined
    const payload = d ?? (res as unknown as Record<string, unknown>)
    currentBootId.value = String(payload.bootId || '')
    currentVersion.value = String(payload.softwareVersion || payload.version || '')
  } catch {
    currentBootId.value = ''
  }
}

function recordBootBaseline() {
  if (!currentBootId.value) { ElMessage.warning('未能读取当前 bootId, 无法记录基线'); return }
  bootBaseline.value = currentBootId.value
  verifyResult.value = null
  try { localStorage.setItem('ota_boot_baseline', bootBaseline.value) } catch { /* ignore */ }
  ElMessage.success('已记录升级基线, 完成升级重启后点击「验证升级完成」')
}

async function verifyUpgradeComplete() {
  if (!bootBaseline.value) { ElMessage.warning('请先记录升级基线'); return }
  await loadDeviceStatus()
  if (!currentBootId.value || currentBootId.value === 'unknown') {
    verifyResult.value = { type: 'warning', title: '无法判定', message: '设备未返回有效 bootId, 无法校验升级结果。' }
    return
  }
  if (currentBootId.value !== bootBaseline.value) {
    verifyResult.value = { type: 'success', title: '升级完成', message: `设备已重启 (bootId 已变化), 当前版本 ${currentVersion.value || '-'}。` }
    bootBaseline.value = ''
    try { localStorage.removeItem('ota_boot_baseline') } catch { /* ignore */ }
  } else {
    verifyResult.value = {
      type: 'error',
      title: '升级未生效 (假成功拦截)',
      message: 'bootId 未变化 — 设备未发生重启, 固件升级可能未真正生效。请核对升级任务是否已将固件写入并重启设备, 勿仅凭任务状态或 HTTP 200 判定成功。',
    }
  }
}

onMounted(async () => {
  await Promise.all([loadFirmwares(), loadTasks(), loadBatchDevices(), loadDeviceStatus()])
})
</script>

<style scoped>
/* .ota-page { padding: 0 4px; } */
.page-title { margin-bottom: 16px; }
.page-title h2 { margin: 0; font-size: 20px; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tab-desc { color: #6b7280; font-size: 13px; }
.task-progress { display: flex; align-items: center; }
.success-count { color: #52c41a; font-weight: 600; }
.failure-count { color: #f5222d; font-weight: 600; }
/* [M2-4 2026-09-21] 升级完成校验卡片 */
.boot-verify-card { margin-bottom: 16px; }
.boot-verify-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.boot-verify-meta { margin-top: 6px; color: #6b7280; font-size: 12px; }
.boot-verify-meta code { background: #f3f4f6; padding: 1px 6px; border-radius: 4px; }
</style>
