<template>
  <div class="ota-page">
    <div class="page-title">
      <h2>🔄 OTA 升级管理</h2>
    </div>

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
          <el-upload drag action="#" :auto-upload="false">
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
            <el-option label="东门主摄像机 (IPC-A1)" value="dev-001" />
            <el-option label="南门IPC-B1" value="dev-002" />
            <el-option label="停车场IPC-C1" value="dev-003" />
            <el-option label="工地边缘盒子" value="dev-004" />
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
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { otaApi, type FirmwareItem, type OTATask } from '@/api/ota'

const activeTab = ref('firmware')
const showUploadDialog = ref(false)
const showCreateTaskDialog = ref(false)
const uploading = ref(false)
const loading = ref(false)

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

async function confirmUpload() {
  if (!uploadForm.value.version) {
    ElMessage.warning('请输入版本号')
    return
  }
  uploading.value = true
  try {
    // In a real scenario, a file would be attached; here we send metadata only
    const dummyFile = new File([], 'firmware.bin')
    await otaApi.uploadFirmware(dummyFile, {
      version: uploadForm.value.version,
      description: uploadForm.value.description,
      targetHardware: uploadForm.value.targetHardware,
      isForce: uploadForm.value.isForce,
    })
    showUploadDialog.value = false
    ElMessage.success('固件上传成功')
    uploadForm.value = { version: '', description: '', targetHardware: ['BM1684X'], isForce: false, changelog: '' }
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

onMounted(async () => {
  await Promise.all([loadFirmwares(), loadTasks()])
})
</script>

<style scoped>
.ota-page { padding: 0 4px; }
.page-title { margin-bottom: 16px; }
.page-title h2 { margin: 0; font-size: 20px; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tab-desc { color: #6b7280; font-size: 13px; }
.task-progress { display: flex; align-items: center; }
.success-count { color: #52c41a; font-weight: 600; }
.failure-count { color: #f5222d; font-weight: 600; }
</style>
