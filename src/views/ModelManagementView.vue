<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getModels, uploadModel as apiUploadModel, activateModel as apiActivateModel, deactivateModel as apiDeactivateModel, deleteModel as apiDeleteModel, getTpuUsage } from '@/api/model'

interface ModelInfo {
  id: string
  model_id?: string
  name: string
  type: string
  precision: string
  status: 'loaded' | 'active' | 'error' | 'unloaded'
  tpu_usage: number
  inference_latency_ms: number
  description: string
  created_at: string
}

const models = ref<ModelInfo[]>([])
const loading = ref(false)
const activeTab = ref('all')
const uploadDialogVisible = ref(false)
const detailDrawerVisible = ref(false)
const selectedModel = ref<ModelInfo | null>(null)

const uploadForm = ref({
  name: '',
  type: 'YOLO',
  precision: 'INT8',
  description: '',
  file: null as File | null
})

const typeOptions = ['YOLO', 'ReID', 'Classify', 'TinyLLM', 'MultiModal']
const precisionOptions = ['INT8', 'FP16', 'FP32', 'MIXED']

const filteredModels = computed(() => {
  if (activeTab.value === 'all') return models.value
  return models.value.filter(m => m.type === activeTab.value)
})

const totalTpuUsage = computed(() => models.value.reduce((sum, m) => sum + m.tpu_usage, 0))

async function fetchModels() {
  loading.value = true
  try {
    const { data } = await getModels()
    const raw = (data as any)?.data || data || []
    models.value = Array.isArray(raw) ? raw : raw?.models || []
  } catch (e: any) {
    ElMessage.error('获取模型列表失败: ' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

async function activateModel(model: ModelInfo) {
  try {
    await apiActivateModel(model.id)
    ElMessage.success(`模型 ${model.name} 已激活`)
    fetchModels()
  } catch (e: any) {
    ElMessage.error('激活失败: ' + e.message)
  }
}

async function deactivateModel(model: ModelInfo) {
  try {
    await apiDeactivateModel(model.id)
    ElMessage.success(`模型 ${model.name} 已卸载`)
    fetchModels()
  } catch (e: any) {
    ElMessage.error('卸载失败: ' + e.message)
  }
}

async function deleteModel(model: ModelInfo) {
  try {
    await ElMessageBox.confirm(`确定删除模型 ${model.name}?`, '删除确认', { type: 'warning' })
    await apiDeleteModel(model.id)
    ElMessage.success('已删除')
    fetchModels()
  } catch { /* cancelled */ }
}

async function uploadModel() {
  if (!uploadForm.value.name || !uploadForm.value.file) {
    ElMessage.warning('请填写模型名称并选择文件')
    return
  }
  const formData = new FormData()
  formData.append('file', uploadForm.value.file)
  formData.append('name', uploadForm.value.name)
  formData.append('type', uploadForm.value.type)
  formData.append('precision', uploadForm.value.precision)
  formData.append('description', uploadForm.value.description)

  try {
    await apiUploadModel(formData)
    // headers handled by api module
    ElMessage.success('模型上传成功')
    uploadDialogVisible.value = false
    uploadForm.value = { name: '', type: 'YOLO', precision: 'INT8', description: '', file: null }
    fetchModels()
  } catch (e: any) {
    ElMessage.error('上传失败: ' + e.message)
  }
}

function handleFileChange(file: File) {
  uploadForm.value.file = file
}

function showDetail(model: ModelInfo) {
  selectedModel.value = model
  detailDrawerVisible.value = true
}

function statusTag(status: string) {
  const map: Record<string, string> = { loaded: 'info', active: 'success', error: 'danger', unloaded: 'warning' }
  return map[status] || 'info'
}
function statusLabel(status: string) {
  const map: Record<string, string> = { loaded: '已加载', active: '活跃', error: '错误', unloaded: '未加载' }
  return map[status] || status
}

onMounted(fetchModels)
</script>

<template>
  <div class="model-management">
    <el-card shadow="never">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:16px">
          <h3 style="margin:0">模型管理</h3>
          <el-tag>TPU使用: {{ totalTpuUsage.toFixed(1) }}% / 100%</el-tag>
        </div>
        <el-button type="primary" @click="uploadDialogVisible = true">上传模型</el-button>
      </div>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane v-for="t in typeOptions" :key="t" :label="t" :name="t" />
      </el-tabs>

      <el-table :data="filteredModels" v-loading="loading" stripe>
        <el-table-column prop="name" label="模型名称" min-width="150" />
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="precision" label="精度" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status) as any" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="TPU占用" width="150">
          <template #default="{ row }">
            <el-progress :percentage="row.tpu_usage" :stroke-width="10" :color="row.tpu_usage > 80 ? '#F56C6C' : '#409EFF'" />
          </template>
        </el-table-column>
        <el-table-column prop="inference_latency_ms" label="推理延迟(ms)" width="120" />
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status !== 'active'" type="success" size="small" @click="activateModel(row)">激活</el-button>
            <el-button v-if="row.status === 'active'" type="warning" size="small" @click="deactivateModel(row)">卸载</el-button>
            <el-button size="small" @click="showDetail(row)">详情</el-button>
            <el-button type="danger" size="small" @click="deleteModel(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 上传对话框 -->
    <el-dialog v-model="uploadDialogVisible" title="上传模型" width="500px">
      <el-form :model="uploadForm" label-width="100px">
        <el-form-item label="模型名称" required>
          <el-input v-model="uploadForm.name" placeholder="如: yolov8s-int8" />
        </el-form-item>
        <el-form-item label="模型类型">
          <el-select v-model="uploadForm.type">
            <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="精度">
          <el-select v-model="uploadForm.precision">
            <el-option v-for="p in precisionOptions" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="模型文件" required>
          <input type="file" accept=".bmodel,.onnx,.pt,.pth" @change="(e: any) => handleFileChange(e.target.files[0])" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="uploadForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="uploadModel">上传</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailDrawerVisible" title="模型详情" size="400px">
      <template v-if="selectedModel">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="名称">{{ selectedModel.name }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ selectedModel.type }}</el-descriptions-item>
          <el-descriptions-item label="精度">{{ selectedModel.precision }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTag(selectedModel.status) as any">{{ statusLabel(selectedModel.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="TPU占用">{{ selectedModel.tpu_usage }}%</el-descriptions-item>
          <el-descriptions-item label="推理延迟">{{ selectedModel.inference_latency_ms }}ms</el-descriptions-item>
          <el-descriptions-item label="描述">{{ selectedModel.description || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ selectedModel.created_at || '-' }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.model-management { padding: 20px; }
</style>
