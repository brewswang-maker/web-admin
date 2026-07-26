<template>
  <div class="projects-page">
    <!-- ===== 工具栏 ===== -->
    <el-card class="toolbar-card" shadow="never">
      <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索项目名称/负责人"
        style="width: 260px"
        clearable
        @clear="handleSearch"
        @keyup.enter="handleSearch"
      />
      <el-select v-model="statusFilter" placeholder="项目状态" style="width: 140px" clearable @change="handleSearch">
        <el-option label="全部" value="" />
        <el-option label="进行中" value="active" />
        <el-option label="已归档" value="archived" />
        <el-option label="草稿" value="draft" />
      </el-select>
      <el-select v-model="priorityFilter" placeholder="优先级" style="width: 120px" clearable @change="handleSearch">
        <el-option label="全部" value="" />
        <el-option label="高" value="high" />
        <el-option label="中" value="medium" />
        <el-option label="低" value="low" />
      </el-select>

      <!-- 权限控制：仅有 project:create 权限才显示新建按钮 -->
      <el-button
        v-if="auth.hasPermission('project:create')"
        type="primary"
        @click="openCreateDialog"
      >
        <el-icon><Plus /></el-icon>新建项目
      </el-button>
      <el-button @click="refreshProjects">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
      </div>
    </el-card>

    <!-- ===== 项目列表 ===== -->
    <el-card class="project-list-card" shadow="never">
    <el-table
      :data="filteredProjects"
      stripe
      style="margin-top: 16px"
      v-loading="projectStore.loading"
      @selection-change="(val: Project[]) => selectedProjects = val"
    >
      <el-table-column type="selection" width="50" />
      <el-table-column prop="name" label="项目名称" min-width="180">
        <template #default="{ row }">
          <el-link type="primary" @click="openDetail(row)">{{ row.name }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="项目描述" min-width="220" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="priority" label="优先级" width="90">
        <template #default="{ row }">
          <el-tag :type="priorityTagType(row.priority)" size="small" effect="dark">
            {{ priorityLabel(row.priority) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="owner" label="负责人" width="100" />
      <el-table-column prop="deviceCount" label="关联设备" width="90" align="center">
        <template #default="{ row }">
          <el-badge :value="row.deviceCount" type="primary" />
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" width="170" />
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <!-- 权限：编辑 -->
          <el-button
            v-if="auth.hasPermission('project:edit')"
            size="small"
            type="primary"
            link
            @click="openEditDialog(row)"
          >
            编辑
          </el-button>
          <!-- 权限：删除 -->
          <el-button
            v-if="auth.hasPermission('project:delete')"
            size="small"
            type="danger"
            link
            @click="handleDelete(row)"
          >
            删除
          </el-button>
          <!-- 无编辑/删除权限的 viewer 看到的是置灰按钮 -->
          <template v-if="!auth.hasPermission('projects:write') && !auth.hasPermission('projects:delete')">
            <el-button size="small" link disabled>编辑</el-button>
            <el-button size="small" link disabled>删除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <!-- ===== 分页 ===== -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="projectStore.currentPage"
        v-model:page-size="projectStore.pageSize"
        :total="filteredProjects.length"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>
    </el-card>

    <!-- ============================================================ -->
    <!-- 创建 / 编辑 弹窗                                              -->
    <!-- ============================================================ -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建项目' : '编辑项目'"
      width="560px"
      @closed="resetForm"
    >
      <el-form
        :model="formData"
        :rules="formRules"
        ref="formRef"
        label-width="100px"
      >
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入项目名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="项目描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入项目描述"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="项目状态" prop="status">
          <el-radio-group v-model="formData.status">
            <el-radio value="active">进行中</el-radio>
            <el-radio value="draft">草稿</el-radio>
            <el-radio value="archived">已归档</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="优先级" prop="priority">
          <el-select v-model="formData.priority" style="width: 100%">
            <el-option label="🔴 高" value="high" />
            <el-option label="🟡 中" value="medium" />
            <el-option label="🟢 低" value="low" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人" prop="owner">
          <el-input v-model="formData.owner" placeholder="请输入负责人姓名" />
        </el-form-item>
        <el-form-item label="关联设备数">
          <el-input-number v-model="formData.deviceCount" :min="0" :max="999" />
          <span style="margin-left: 8px; color: #8c8c8c">台</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ dialogMode === 'create' ? '立即创建' : '保存修改' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ============================================================ -->
    <!-- 详情弹窗                                                      -->
    <!-- ============================================================ -->
    <el-dialog
      v-model="detailVisible"
      title="项目详情"
      width="520px"
    >
      <el-descriptions v-if="detailProject" :column="2" border>
        <el-descriptions-item label="项目名称" :span="2">
          {{ detailProject.name }}
        </el-descriptions-item>
        <el-descriptions-item label="项目描述" :span="2">
          {{ detailProject.description }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusTagType(detailProject.status)" size="small">
            {{ statusLabel(detailProject.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="优先级">
          <el-tag :type="priorityTagType(detailProject.priority)" size="small" effect="dark">
            {{ priorityLabel(detailProject.priority) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="负责人">{{ detailProject.owner }}</el-descriptions-item>
        <el-descriptions-item label="关联设备">{{ detailProject.deviceCount }} 台</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detailProject.createdAt }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ detailProject.updatedAt }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          v-if="auth.hasPermission('project:edit') && detailProject"
          type="primary"
          @click="detailVisible = false; openEditDialog(detailProject)"
        >
          编辑
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useProjectStore, type Project, type ProjectFormData } from '@/stores/project'
import { useAuthStore } from '@/stores/auth'

// ---- Store ----
const projectStore = useProjectStore()
const auth = useAuthStore()

// ---- 搜索 & 过滤 ----
const searchKeyword = ref('')
const statusFilter = ref('')
const priorityFilter = ref('')
const selectedProjects = ref<Project[]>([])

const filteredProjects = computed(() => {
  let list = projectStore.projects
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      p.owner.toLowerCase().includes(kw) ||
      p.description.toLowerCase().includes(kw)
    )
  }
  if (statusFilter.value) {
    list = list.filter(p => p.status === statusFilter.value)
  }
  if (priorityFilter.value) {
    list = list.filter(p => p.priority === priorityFilter.value)
  }
  return list
})

function handleSearch() {
  projectStore.currentPage = 1
}

// ---- 标签映射 ----
function statusTagType(status: string): 'success' | 'info' | 'warning' {
  const m: Record<string, 'success' | 'info' | 'warning'> = {
    active: 'success', draft: 'info', archived: 'warning'
  }
  return m[status] ?? 'info'
}
function statusLabel(status: string): string {
  const m: Record<string, string> = {
    active: '进行中', draft: '草稿', archived: '已归档'
  }
  return m[status] ?? status
}
function priorityTagType(priority: string): 'danger' | 'warning' | 'success' {
  const m: Record<string, 'danger' | 'warning' | 'success'> = {
    high: 'danger', medium: 'warning', low: 'success'
  }
  return m[priority] ?? 'info'
}
function priorityLabel(priority: string): string {
  const m: Record<string, string> = { high: '高', medium: '中', low: '低' }
  return m[priority] ?? priority
}

// ---- 创建 / 编辑 ----
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref<string | null>(null)
const submitting = ref(false)
const formRef = ref<FormInstance>()

const defaultForm = (): ProjectFormData => ({
  name: '',
  description: '',
  status: 'active',
  priority: 'medium',
  owner: '',
  deviceCount: 0
})

const formData = reactive<ProjectFormData>(defaultForm())

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入项目名称', trigger: 'blur' },
    { min: 2, max: 50, message: '项目名称需 2~50 个字符', trigger: 'blur' }
  ],
  description: [
    { max: 200, message: '描述不可超过 200 字符', trigger: 'blur' }
  ],
  status: [
    { required: true, message: '请选择项目状态', trigger: 'change' }
  ],
  priority: [
    { required: true, message: '请选择优先级', trigger: 'change' }
  ],
  owner: [
    { required: true, message: '请输入负责人', trigger: 'blur' }
  ]
}

// ---- 权限校验包装 ----
/**
 * 在打开创建弹窗之前，二次校验权限。
 * 路由守卫已做第一层拦截，此处为按钮级别的补充保障。
 */
function openCreateDialog() {
  if (!auth.hasPermission('project:create')) {
    ElMessage.warning('您没有创建项目的权限，请联系管理员')
    return
  }
  dialogMode.value = 'create'
  editingId.value = null
  Object.assign(formData, defaultForm())
  dialogVisible.value = true
}

function openEditDialog(row: Project) {
  if (!auth.hasPermission('project:edit')) {
    ElMessage.warning('您没有编辑项目的权限')
    return
  }
  // 已归档项目不允许编辑
  if (row.status === 'archived') {
    ElMessage.warning('已归档的项目不可编辑，请先恢复为进行中状态')
    return
  }
  dialogMode.value = 'edit'
  editingId.value = row.id
  formData.name = row.name
  formData.description = row.description
  formData.status = row.status
  formData.priority = row.priority
  formData.owner = row.owner
  formData.deviceCount = row.deviceCount
  dialogVisible.value = true
}

function resetForm() {
  formRef.value?.resetFields()
  editingId.value = null
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (dialogMode.value === 'create') {
      // 创建前二次权限校验
      if (!auth.hasPermission('project:create')) {
        ElMessage.error('权限不足：无法创建项目')
        submitting.value = false
        return
      }
      const payload: ProjectFormData = { ...formData }
      await projectStore.createProject(payload)
      ElMessage.success(`项目「${formData.name}」创建成功`)
    } else {
      // 编辑前二次权限校验
      if (!auth.hasPermission('project:edit')) {
        ElMessage.error('权限不足：无法编辑项目')
        submitting.value = false
        return
      }
      await projectStore.updateProject(editingId.value!, { ...formData })
      ElMessage.success(`项目「${formData.name}」已更新`)
    }
    dialogVisible.value = false
  } catch (err: any) {
    ElMessage.error(err?.message ?? '操作失败')
  } finally {
    submitting.value = false
  }
}

// ---- 删除 ----
async function handleDelete(row: Project) {
  // 权限校验（虽然按钮已做 v-if 控制，此处为防护性二次校验）
  if (!auth.hasPermission('project:delete')) {
    ElMessage.error('权限不足：无法删除项目')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认删除项目「${row.name}」？此操作不可恢复，关联的设备配置将一并清理。`,
      '确认删除',
      { type: 'error', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
    await projectStore.deleteProject(row.id)
    ElMessage.success(`项目「${row.name}」已删除`)
  } catch {
    // 用户取消
  }
}

// ---- 详情 ----
const detailVisible = ref(false)
const detailProject = ref<Project | null>(null)

function openDetail(row: Project) {
  detailProject.value = row
  detailVisible.value = true
}

// ---- 刷新 ----
async function refreshProjects() {
  await projectStore.fetchProjects()
  ElMessage.success('项目列表已刷新')
}

// ---- 初始化 ----
onMounted(() => {
  projectStore.fetchProjects()
})
</script>

<style scoped>
.toolbar-card :deep(.el-card__body),
.project-list-card :deep(.el-card__body) {
  padding: 20px 24px;
}

.project-list-card {
  margin-top: 16px;
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 640px) {
  .projects-page {
    width: calc(100% - 16px);
    margin: 8px auto;
  }

  .toolbar-card :deep(.el-card__body),
  .project-list-card :deep(.el-card__body) {
    padding: 16px;
  }

  .toolbar {
    align-items: stretch;
  }

  .toolbar > * {
    width: 100% !important;
  }

  .pagination-wrapper {
    justify-content: center;
    overflow-x: auto;
  }
}
</style>
