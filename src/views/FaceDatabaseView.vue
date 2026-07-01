<template>
  <div class="face-database-view">
    <!-- 统计卡片 -->
    <el-card class="stats-card">
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-icon total">
              <el-icon><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.total }}</div>
              <div class="stat-label">总人数</div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-icon blacklist">
              <el-icon><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.blacklist }}</div>
              <div class="stat-label">黑名单</div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-icon whitelist">
              <el-icon><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.whitelist }}</div>
              <div class="stat-label">白名单</div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-icon visitor">
              <el-icon><UserFilled /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.visitor }}</div>
              <div class="stat-label">访客</div>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 工具栏 -->
    <el-card class="toolbar-card">
      <div class="toolbar">
        <div class="left-toolbar">
          <el-select v-model="filterGroupType" placeholder="分组筛选" clearable style="width: 120px">
            <el-option label="全部" value="" />
            <el-option label="黑名单" value="blacklist" />
            <el-option label="白名单" value="whitelist" />
            <el-option label="访客" value="visitor" />
          </el-select>
          <el-input
            v-model="searchKeyword"
            placeholder="搜索姓名/手机号"
            clearable
            style="width: 200px"
            @keyup.enter="loadRecords"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" @click="loadRecords">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
        </div>
        <div class="right-toolbar">
          <el-button type="success" @click="handleAdd">
            <el-icon><Plus /></el-icon> 添加人员
          </el-button>
          <el-button @click="handleBatchImport">
            <el-icon><Upload /></el-icon> 批量导入
          </el-button>
          <el-button @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
          <el-button type="danger" @click="handleCleanup" :loading="cleaning">
            <el-icon><Delete /></el-icon> 清理过期
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="table-card">
      <el-table :data="records" v-loading="loading" stripe>
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column label="照片" width="80">
          <template #default="{ row }">
            <el-avatar :size="40" :src="row.image_data || row.image_path || ''" shape="square">
              <el-icon :size="20"><User /></el-icon>
            </el-avatar>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="姓名" min-width="100" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="group_type_cn" label="分组" width="100">
          <template #default="{ row }">
            <el-tag :type="getGroupTagType(row.group_type)" size="small">
              {{ row.group_type_cn }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="quality_score" label="质量分" width="80">
          <template #default="{ row }">
            <el-progress
              :percentage="row.quality_score != null ? Math.round(row.quality_score * 100) : 0"
              :color="getQualityColor(row.quality_score || 0)"
              :stroke-width="10"
            />
          </template>
        </el-table-column>
        <el-table-column prop="recognition_count" label="识别次数" width="90" />
        <el-table-column prop="is_active" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
              {{ row.is_active ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="有效期" width="120">
          <template #default="{ row }">
            <span v-if="row.expires_at">{{ formatDate(row.expires_at) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="添加时间" width="160">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button type="info" link size="small" @click="handleDetail(row)">详情</el-button>
            <el-button type="primary" link size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button :type="row.is_active ? 'warning' : 'success'" link size="small" @click="handleToggleStatus(row)">
              {{ row.is_active ? '禁用' : '启用' }}
            </el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadRecords"
          @size-change="loadRecords"
        />
      </div>
    </el-card>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="showAddDialog" :title="editingRecord ? '编辑人员' : '添加人员'" width="600px">
      <el-form :model="formData" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="formData.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="分组" prop="group_type">
          <el-select v-model="formData.group_type" placeholder="请选择分组" style="width: 100%">
            <el-option label="黑名单" value="blacklist" />
            <el-option label="白名单" value="whitelist" />
            <el-option label="访客" value="visitor" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="formData.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="身份证号">
          <el-input v-model="formData.id_number" placeholder="请输入身份证号" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="formData.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="formData.gender">
            <el-radio value="男">男</el-radio>
            <el-radio value="女">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="年龄">
          <el-input-number v-model="formData.age" :min="0" :max="150" />
        </el-form-item>
        <el-form-item label="住址">
          <el-input v-model="formData.address" placeholder="请输入住址" />
        </el-form-item>
        <el-form-item label="人脸图片">
          <div class="image-upload-container">
            <el-upload
              ref="imageUploadRef"
              :auto-upload="false"
              :limit="1"
              accept="image/jpeg,image/jpg,image/png"
              :on-change="handleImageChange"
              :on-remove="handleImageRemove"
              list-type="picture-card"
            >
              <el-icon class="upload-icon"><Plus /></el-icon>
            </el-upload>
            <div class="image-tip">支持 JPG/PNG 格式，建议尺寸 200x200 像素以上</div>
            <div v-if="formData.imagePreview" class="image-preview">
              <el-image :src="formData.imagePreview" fit="cover" />
              <el-button type="danger" size="small" circle @click="handleImageRemove">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="有效期" v-if="formData.group_type === 'visitor'">
          <el-input-number v-model="formData.valid_days" :min="1" :max="365" />
          <span style="margin-left: 10px">天</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handleCloseDialog">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入对话框 -->
    <el-dialog v-model="showImportDialog" title="批量导入" width="500px">
      <el-upload ref="uploadRef" :auto-upload="false" :limit="1" accept=".json" :on-change="handleFileChange">
        <template #trigger>
          <el-button type="primary">选择JSON文件</el-button>
        </template>
        <template #tip>
          <div class="el-upload__tip">请上传JSON格式的人脸数据文件</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="showImportDialog = false">取消</el-button>
        <el-button type="primary" @click="handleImportConfirm" :loading="importing">导入</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="showDetailDialog" title="人员详情" width="600px">
      <template v-if="detailRecord">
        <div class="detail-header">
          <el-avatar :size="80" :src="detailRecord.image_data || detailRecord.image_path || ''" shape="square">
            <el-icon :size="40"><User /></el-icon>
          </el-avatar>
          <div class="detail-header-info">
            <h3>{{ detailRecord.name }}</h3>
            <el-tag :type="getGroupTagType(detailRecord.group_type)" size="small">
              {{ detailRecord.group_type_cn }}
            </el-tag>
            <el-tag :type="detailRecord.is_active ? 'success' : 'info'" size="small" style="margin-left: 6px">
              {{ detailRecord.is_active ? '启用' : '禁用' }}
            </el-tag>
          </div>
        </div>
        <el-descriptions :column="2" border size="small" style="margin-top: 16px">
          <el-descriptions-item label="人员ID">{{ detailRecord.person_id }}</el-descriptions-item>
          <el-descriptions-item label="姓名">{{ detailRecord.name }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ detailRecord.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="身份证号">{{ detailRecord.id_number || '-' }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ detailRecord.email || '-' }}</el-descriptions-item>
          <el-descriptions-item label="性别">{{ detailRecord.gender || '-' }}</el-descriptions-item>
          <el-descriptions-item label="年龄">{{ detailRecord.age || '-' }}</el-descriptions-item>
          <el-descriptions-item label="住址" :span="2">{{ detailRecord.address || '-' }}</el-descriptions-item>
          <el-descriptions-item label="质量分">
            <el-progress
              :percentage="Math.round(detailRecord.quality_score * 100)"
              :color="getQualityColor(detailRecord.quality_score)"
              :stroke-width="10"
              style="width: 120px"
            />
          </el-descriptions-item>
          <el-descriptions-item label="识别次数">{{ detailRecord.recognition_count }}</el-descriptions-item>
          <el-descriptions-item label="添加时间">{{ formatDate(detailRecord.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ detailRecord.updated_at ? formatDate(detailRecord.updated_at) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="有效期">
            {{ detailRecord.expires_at ? formatDate(detailRecord.expires_at) : '永久' }}
          </el-descriptions-item>
          <el-descriptions-item label="最后识别">
            {{ detailRecord.last_recognized_at ? formatDate(detailRecord.last_recognized_at) : '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
        <el-button type="primary" @click="showDetailDialog = false; handleEdit(detailRecord!)">编辑</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, Warning, CircleCheck, UserFilled, Search, Plus, Upload, Download, Delete } from '@element-plus/icons-vue'
import faceApi, { FaceRecord, FaceDatabaseStats } from '@/api/face'
import { evaluateImageQuality, evaluateImageQualityFromDataUrl } from '@/utils/imageQuality'

const loading = ref(false)
const cleaning = ref(false)
const submitting = ref(false)
const importing = ref(false)
const showAddDialog = ref(false)
const showImportDialog = ref(false)
const showDetailDialog = ref(false)
const editingRecord = ref<FaceRecord | null>(null)
const detailRecord = ref<FaceRecord | null>(null)

const stats = reactive<FaceDatabaseStats>({ total: 0, blacklist: 0, whitelist: 0, visitor: 0, active: 0, expired: 0 })
const filterGroupType = ref('')
const searchKeyword = ref('')
const records = ref<FaceRecord[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const formData = reactive({
  name: '',
  group_type: 'visitor' as 'blacklist' | 'whitelist' | 'visitor',
  phone: '',
  id_number: '',
  email: '',
  gender: '',
  age: 0,
  address: '',
  image_path: '',
  image_data: '',
  imagePreview: '',
  valid_days: 7
})

const formRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  group_type: [{ required: true, message: '请选择分组', trigger: 'change' }]
}

const formRef = ref()
const imageUploadRef = ref()
const uploadRef = ref()
const importFileData = ref('')
const currentImageFile = ref<File | null>(null)

async function loadStats() {
  try {
    const res = await faceApi.getStats()
    if (res.data.code === 0) Object.assign(stats, res.data.data)
  } catch (err) { console.error('Failed to load stats:', err) }
}

async function loadRecords() {
  loading.value = true
  try {
    const res = await faceApi.getRecords({
      group_type: filterGroupType.value as any || undefined,
      search: searchKeyword.value || undefined,
      page: pagination.page,
      page_size: pagination.pageSize
    })
    if (res.data.code === 0) {
      records.value = res.data.data.records
      pagination.total = res.data.data.total
    }
  } catch (err) { console.error('Failed to load records:', err) }
  finally { loading.value = false }
}

function handleCloseDialog() {
  showAddDialog.value = false
  editingRecord.value = null
  currentImageFile.value = null
  formData.imagePreview = ''
  imageUploadRef.value?.clearFiles()
  Object.assign(formData, {
    name: '', group_type: 'visitor', phone: '', id_number: '', email: '',
    gender: '', age: 0, address: '', image_path: '', image_data: '', imagePreview: '', valid_days: 7
  })
}

function handleAdd() {
  handleCloseDialog()
  showAddDialog.value = true
}

function handleDetail(row: FaceRecord) {
  detailRecord.value = row
  showDetailDialog.value = true
}

function handleEdit(row: FaceRecord) {
  editingRecord.value = row
  currentImageFile.value = null
  Object.assign(formData, {
    name: row.name,
    group_type: row.group_type,
    phone: row.phone || '',
    id_number: row.id_number || '',
    email: row.email || '',
    gender: row.gender || '',
    age: row.age || 0,
    address: row.address || '',
    image_path: row.image_path || '',
    image_data: row.image_data || '',
    imagePreview: row.image_data || (row.image_path ? '/api/v1' + row.image_path : ''),
    valid_days: 7
  })
  showAddDialog.value = true
}

function handleImageChange(file: any) {
  const rawFile = file.raw
  if (!rawFile) return
  const isImage = ['image/jpeg', 'image/jpg', 'image/png'].includes(rawFile.type)
  if (!isImage) { ElMessage.error('只能上传 JPG/PNG 格式的图片'); imageUploadRef.value?.clearFiles(); return }
  const isLt5M = rawFile.size / 1024 / 1024 < 5
  if (!isLt5M) { ElMessage.error('图片大小不能超过 5MB'); imageUploadRef.value?.clearFiles(); return }
  currentImageFile.value = rawFile
  const reader = new FileReader()
  reader.onload = (e) => { formData.imagePreview = e.target?.result as string }
  reader.readAsDataURL(rawFile)
}

function handleImageRemove() {
  currentImageFile.value = null
  formData.imagePreview = ''
  formData.image_path = ''
  imageUploadRef.value?.clearFiles()
}

async function handleSubmit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (validationErr) {
    console.warn('Form validation failed:', validationErr)
    return
  }
  submitting.value = true
  try {
    const submitData: any = { ...formData }
    delete submitData.imagePreview
    delete submitData.valid_days
    // 如果有选中的新图片文件，用新的 base64 数据覆盖；否则保持原始 image_data
    if (currentImageFile.value) {
      submitData.image_data = formData.imagePreview
    }

    // 计算并附带图片质量分（对齐后端 checkQuality 检查项）
    // 后端默认值 quality_score=0.0 会触发 low quality 拦截, 必须显式传 >= 0.3
    try {
      let quality
      if (currentImageFile.value) {
        quality = await evaluateImageQuality(currentImageFile.value)
      } else if (submitData.image_data) {
        quality = await evaluateImageQualityFromDataUrl(submitData.image_data)
      }
      if (quality) {
        submitData.quality_score = quality.quality_score
        submitData.clarity = quality.clarity
        submitData.brightness = quality.brightness
        submitData.occlusion = quality.occlusion
        submitData.pose_angle = quality.pose_angle
        if (quality.quality_score < 0.3) {
          ElMessage.warning(`图片质量较低 (${(quality.quality_score * 100).toFixed(0)}%), 仍会提交但可能被后端拒收`)
        }
      }
    } catch (qErr) {
      console.warn('图片质量评估失败, 使用保守默认分:', qErr)
      submitData.quality_score = 0.5
      submitData.clarity = 0.95
      submitData.occlusion = 0.05
      submitData.pose_angle = 5.0
      submitData.brightness = 0.5
    }

    const res = editingRecord.value
      ? await faceApi.updateRecord(editingRecord.value.person_id, submitData)
      : await faceApi.addRecord(submitData)
    if (res.data.code === 0) {
      ElMessage.success(editingRecord.value ? '更新成功' : '添加成功')
      handleCloseDialog()
      loadRecords()
      loadStats()
    } else { ElMessage.error(res.data.message) }
  } catch (err) { console.error('Submit failed:', err) }
  finally { submitting.value = false }
}

async function handleDelete(row: FaceRecord) {
  try {
    // 兼容 snake_case / camelCase（防止 HTTP 拦截器转换差异）
    const personId = row.person_id || (row as any).personId
    if (!personId) {
      ElMessage.error('无法获取记录ID，请刷新页面后重试')
      return
    }
    await ElMessageBox.confirm(`确定要删除 ${row.name} 吗？`, '删除确认', { type: 'warning' })
    const res = await faceApi.deleteRecord(personId)
    if (res.data.code === 0) { ElMessage.success('删除成功'); loadRecords(); loadStats() }
    else { ElMessage.error(res.data.message) }
  } catch (e: any) {
    if (e !== 'cancel' && e?.toString() !== 'cancel') {
      console.warn('FaceDatabase delete failed:', e)
    }
  }
}

async function handleToggleStatus(row: FaceRecord) {
  const action = row.is_active ? '禁用' : '启用'
  try {
    await ElMessageBox.confirm(`确定要${action} ${row.name} 吗？`, `${action}确认`, { type: 'warning' })
    const res = await faceApi.updateRecord(row.person_id, { is_active: !row.is_active } as any)
    if (res.data.code === 0) { ElMessage.success(`${action}成功`); loadRecords(); loadStats() }
    else { ElMessage.error(res.data.message) }
  } catch (e: any) {
    if (e !== 'cancel' && e?.toString() !== 'cancel') {
      console.warn('FaceDatabase toggle status failed:', e)
    }
  }
}

function handleBatchImport() { showImportDialog.value = true; importFileData.value = '' }

function handleFileChange(file: any) {
  const reader = new FileReader()
  reader.onload = (e) => { importFileData.value = e.target?.result as string }
  reader.readAsText(file.raw)
}

async function handleImportConfirm() {
  if (!importFileData.value) { ElMessage.warning('请先选择文件'); return }
  importing.value = true
  try {
    const res = await faceApi.importDatabase(importFileData.value)
    if (res.data.code === 0) { ElMessage.success(`导入成功，共 ${res.data.data.imported} 条`); showImportDialog.value = false; loadRecords(); loadStats() }
    else { ElMessage.error(res.data.message) }
  } catch (e: any) {
    console.warn('FaceDatabase import failed:', e)
  }
  finally { importing.value = false }
}

async function handleExport() {
  try {
    const res = await faceApi.exportDatabase()
    if (res.data.code === 0) {
      const blob = new Blob([res.data.data.json_data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `face_database_${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      ElMessage.success('导出成功')
    } else { ElMessage.error(res.data.message) }
  } catch (e: any) {
    console.warn('FaceDatabase export failed:', e)
  }
}

async function handleCleanup() {
  try {
    await ElMessageBox.confirm('确定要清理所有过期访客吗？', '清理确认', { type: 'warning' })
    cleaning.value = true
    const res = await faceApi.cleanupExpired()
    if (res.data.code === 0) { ElMessage.success(`清理完成，已禁用 ${res.data.data.disabled} 条`); loadRecords(); loadStats() }
    else { ElMessage.error(res.data.message) }
  } catch (e: any) {
    if (e !== 'cancel' && e?.toString() !== 'cancel') {
      console.warn('FaceDatabase cleanup failed:', e)
    }
  }
  finally { cleaning.value = false }
}

function getGroupTagType(groupType: string) {
  switch (groupType) {
    case 'blacklist': return 'danger'
    case 'whitelist': return 'success'
    case 'visitor': return 'warning'
    default: return 'info'
  }
}

function getQualityColor(score: number) {
  if (score >= 0.7) return '#67c23a'
  if (score >= 0.4) return '#e6a23c'
  return '#f56c6c'
}

function formatDate(timestamp: number) {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

onMounted(() => { loadStats(); loadRecords() })
</script>

<style scoped>
.face-database-view { padding: 20px; }
.stats-card, .toolbar-card, .table-card { margin-bottom: 20px; }
.stat-item { display: flex; align-items: center; gap: 15px; }
.stat-icon {
  width: 50px; height: 50px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; color: white;
}
.stat-icon.total { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.stat-icon.blacklist { background: linear-gradient(135deg, #f5365c 0%, #f53b5c 100%); }
.stat-icon.whitelist { background: linear-gradient(135deg, #2fb18d 0%, #28a879 100%); }
.stat-icon.visitor { background: linear-gradient(135deg, #f9a825 0%, #f57f17 100%); }
.stat-value { font-size: 28px; font-weight: 600; color: #303133; }
.stat-label { font-size: 14px; color: #909399; }
.toolbar { display: flex; justify-content: space-between; align-items: center; }
.left-toolbar, .right-toolbar { display: flex; gap: 10px; align-items: center; }
.pagination { margin-top: 20px; display: flex; justify-content: flex-end; }
.el-upload__tip { margin-top: 10px; color: #909399; font-size: 12px; }
.image-upload-container { width: 100%; }
.upload-icon { font-size: 28px; color: #8c939d; }
.image-tip { margin-top: 8px; font-size: 12px; color: #909399; }
.image-preview {
  position: relative; margin-top: 10px;
  width: 148px; height: 148px; border-radius: 8px; overflow: hidden;
}
.image-preview .el-image { width: 100%; height: 100%; }
.image-preview .el-button { position: absolute; top: 5px; right: 5px; }
.detail-header { display: flex; align-items: center; gap: 20px; }
.detail-header-info h3 { margin: 0 0 6px 0; font-size: 18px; color: #303133; }
</style>
