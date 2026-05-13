<template>
  <div class="permission-management">
    <div class="page-header">
      <h2>权限列表</h2>
      <el-button type="primary" @click="openCreateDialog" v-permission="['roles:manage']">
        <el-icon><Plus /></el-icon> 新增权限
      </el-button>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ permissions.length }}</div>
          <div class="stat-label">权限总数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ resourceCount }}</div>
          <div class="stat-label">覆盖模块</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ operationCount }}</div>
          <div class="stat-label">操作类型</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ systemPermCount }}</div>
          <div class="stat-label">系统级权限</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选栏 -->
    <el-card class="filter-bar" shadow="never">
      <el-form :inline="true" :model="filterForm">
        <el-form-item label="资源模块">
          <el-select v-model="filterForm.resource" placeholder="全部" clearable style="width: 160px">
            <el-option
              v-for="res in resourceOptions"
              :key="res.value"
              :label="res.label"
              :value="res.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="filterForm.operation" placeholder="全部" clearable style="width: 120px">
            <el-option
              v-for="op in operationOptions"
              :key="op.value"
              :label="op.label"
              :value="op.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="filterForm.keyword" placeholder="搜索权限ID或描述" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 权限表格 -->
    <el-card shadow="never">
      <el-table
        :data="filteredPermissions"
        border
        stripe
        v-loading="loading"
        style="width: 100%"
        row-key="id"
        :default-sort="{ prop: 'resource', order: 'ascending' }"
      >
        <el-table-column prop="id" label="权限标识" min-width="180" sortable>
          <template #default="{ row }">
            <el-tag effect="dark" size="small" class="perm-id-tag">{{ row.id }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="resource" label="资源模块" width="130" sortable>
          <template #default="{ row }">
            <el-tag :type="resourceTagType(row.resource)" size="small" effect="plain">
              {{ getResourceLabel(row.resource) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operation" label="操作类型" width="100" sortable>
          <template #default="{ row }">
            <el-tag :type="operationTagType(row.operation)" size="small" effect="plain">
              {{ getOperationLabel(row.operation) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="关联角色数" width="120" align="center">
          <template #default="{ row }">
            <el-tooltip :content="getRelatedRoleNames(row.id)" placement="top" :disabled="getRelatedRoleCount(row.id) === 0">
              <el-tag :type="getRelatedRoleCount(row.id) > 0 ? 'warning' : 'info'" size="small" effect="plain">
                {{ getRelatedRoleCount(row.id) }} 个角色
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEditDialog(row)" v-permission="['roles:manage']">
              编辑
            </el-button>
            <el-popconfirm
              :title="`确认删除权限「${row.id}」？关联角色将失去该权限`"
              @confirm="handleDelete(row.id)"
              v-permission="['roles:manage']"
            >
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑权限' : '新增权限'"
      width="520px"
      @close="resetForm"
    >
      <el-form :model="permForm" :rules="permRules" ref="formRef" label-width="100px">
        <el-form-item label="权限标识" prop="id">
          <el-input
            v-model="permForm.id"
            :disabled="isEditing"
            placeholder="如 devices:read"
            @blur="autoGenDescription"
          >
            <template #prefix>
              <el-icon><Key /></el-icon>
            </template>
          </el-input>
          <div class="form-hint">格式：{resource}:{operation}，如 devices:read</div>
        </el-form-item>
        <el-form-item label="资源模块" prop="resource">
          <el-select v-model="permForm.resource" placeholder="请选择资源模块" style="width: 100%" @change="autoGenDescription">
            <el-option
              v-for="res in resourceOptions"
              :key="res.value"
              :label="res.label"
              :value="res.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="操作类型" prop="operation">
          <el-select v-model="permForm.operation" placeholder="请选择操作类型" style="width: 100%" @change="autoGenDescription">
            <el-option
              v-for="op in operationOptions"
              :key="op.value"
              :label="op.label"
              :value="op.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="权限描述" prop="description">
          <el-input v-model="permForm.description" type="textarea" :rows="2" placeholder="请描述该权限的用途" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          {{ isEditing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 角色权限矩阵弹窗 -->
    <el-dialog
      v-model="matrixVisible"
      title="角色权限矩阵"
      width="900px"
    >
      <div class="perm-matrix">
        <el-table :data="matrixData" border stripe size="small" max-height="500">
          <el-table-column prop="permLabel" label="权限" width="200" fixed="left">
            <template #default="{ row }">
              <el-tooltip :content="row.permDesc" placement="right">
                <span class="matrix-perm-id">{{ row.permLabel }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column
            v-for="role in roles"
            :key="role.id"
            :label="role.name"
            width="100"
            align="center"
          >
            <template #default="{ row }">
              <el-icon v-if="row.roles.includes(role.id)" color="#67c23a" :size="18">
                <Check />
              </el-icon>
              <el-icon v-else color="#c0c4cc" :size="18">
                <Close />
              </el-icon>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Key, Check, Close } from '@element-plus/icons-vue'
import type { Permission, Role } from '@/types/rbac'
import { Resource, Operation, ResourceLabels, OperationLabels } from '@/types/rbac'
import {
  fetchAllPermissions,
  fetchCreatePermission,
  fetchUpdatePermission,
  fetchDeletePermission,
  fetchRoles
} from '@/api/rbac'
import dayjs from 'dayjs'

// ---- 状态 ----
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const matrixVisible = ref(false)
const isEditing = ref(false)
const editingPermId = ref<string | null>(null)
const formRef = ref<FormInstance>()
const permissions = ref<Permission[]>([])
const roles = ref<Role[]>([])

// ---- 筛选 ----
const filterForm = ref({
  resource: '' as string,
  operation: '' as string,
  keyword: ''
})

// ---- 表单 ----
const permForm = ref({
  id: '',
  resource: '' as string,
  operation: '' as string,
  description: ''
})

const permRules: FormRules = {
  id: [
    { required: true, message: '请输入权限标识', trigger: 'blur' },
    {
      pattern: /^[a-z_]+:[a-z_]+$/,
      message: '格式：resource:operation，如 devices:read',
      trigger: 'blur'
    },
    {
      validator: (_rule, value, callback) => {
        if (isEditing.value) return callback()
        const exists = permissions.value.some(p => p.id === value)
        if (exists) {
          callback(new Error('权限标识已存在'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ],
  resource: [{ required: true, message: '请选择资源模块', trigger: 'change' }],
  operation: [{ required: true, message: '请选择操作类型', trigger: 'change' }],
  description: [{ required: true, message: '请输入权限描述', trigger: 'blur' }]
}

// ---- 选项 ----
const resourceOptions = computed(() =>
  Object.entries(ResourceLabels).map(([value, label]) => ({ value, label }))
)

const operationOptions = computed(() =>
  Object.entries(OperationLabels).map(([value, label]) => ({ value, label }))
)

// ---- 统计 ----
const resourceCount = computed(() => {
  const set = new Set(permissions.value.map(p => p.resource))
  return set.size
})

const operationCount = computed(() => {
  const set = new Set(permissions.value.map(p => p.operation))
  return set.size
})

const systemPermCount = computed(() =>
  permissions.value.filter(p => p.resource === 'system').length
)

// ---- 过滤 ----
const filteredPermissions = computed(() => {
  let list = permissions.value
  if (filterForm.value.resource) {
    list = list.filter(p => p.resource === filterForm.value.resource)
  }
  if (filterForm.value.operation) {
    list = list.filter(p => p.operation === filterForm.value.operation)
  }
  if (filterForm.value.keyword) {
    const kw = filterForm.value.keyword.toLowerCase()
    list = list.filter(p => p.id.toLowerCase().includes(kw) || p.description.includes(kw))
  }
  return list
})

// ---- 角色矩阵 ----
const matrixData = computed(() => {
  return permissions.value.map(p => ({
    permLabel: p.id,
    permDesc: p.description,
    roles: roles.value.filter(r => r.permissions.includes(p.id)).map(r => r.id)
  }))
})

// ---- 生命周期 ----
onMounted(async () => {
  await Promise.all([fetchData(), fetchRoleData()])
})

async function fetchData() {
  loading.value = true
  try {
    permissions.value = await fetchAllPermissions()
  } catch (e: any) {
    ElMessage.error('获取权限列表失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

async function fetchRoleData() {
  try {
    roles.value = await fetchRoles()
  } catch (e: any) {
    console.warn('获取角色列表失败:', e.message)
  }
}

function resetFilter() {
  filterForm.value = { resource: '', operation: '', keyword: '' }
}

// ---- CRUD ----
function openCreateDialog() {
  isEditing.value = false
  editingPermId.value = null
  dialogVisible.value = true
}

function openEditDialog(row: Permission) {
  isEditing.value = true
  editingPermId.value = row.id
  permForm.value = {
    id: row.id,
    resource: row.resource,
    operation: row.operation,
    description: row.description
  }
  dialogVisible.value = true
}

function resetForm() {
  permForm.value = { id: '', resource: '', operation: '', description: '' }
  formRef.value?.resetFields()
}

function autoGenDescription() {
  if (isEditing.value) return
  const res = permForm.value.resource
  const op = permForm.value.operation
  if (res && op) {
    permForm.value.id = `${res}:${op}`
    const resLabel = getResourceLabel(res)
    const opLabel = getOperationLabel(op)
    if (!permForm.value.description) {
      permForm.value.description = `${opLabel}${resLabel}`
    }
  }
}

async function submitForm() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEditing.value && editingPermId.value) {
      await fetchUpdatePermission(editingPermId.value, {
        description: permForm.value.description
      })
      ElMessage.success('权限更新成功')
    } else {
      await fetchCreatePermission({
        id: permForm.value.id,
        resource: permForm.value.resource as Resource,
        operation: permForm.value.operation as Operation,
        description: permForm.value.description
      })
      ElMessage.success('权限创建成功')
    }
    dialogVisible.value = false
    await fetchData()
  } catch (e: any) {
    ElMessage.error('操作失败: ' + e.message)
  } finally {
    submitting.value = false
  }
}

async function handleDelete(permId: string) {
  try {
    await fetchDeletePermission(permId)
    ElMessage.success('权限已删除')
    await fetchData()
  } catch (e: any) {
    ElMessage.error('删除失败: ' + e.message)
  }
}

// ---- 工具函数 ----
function getResourceLabel(resource: string): string {
  return ResourceLabels[resource as Resource] || resource
}

function getOperationLabel(operation: string): string {
  return OperationLabels[operation as Operation] || operation
}

function resourceTagType(resource: string): string {
  const map: Record<string, string> = {
    dashboard: 'primary',
    devices: 'success',
    alarms: 'danger',
    live: 'warning',
    ai_chat: 'primary',
    statistics: 'info',
    federation: 'warning',
    audit: 'danger',
    open_api: 'info',
    ota: 'success',
    projects: 'primary',
    settings: 'info',
    users: 'warning',
    roles: 'danger',
    system: 'danger'
  }
  return map[resource] || 'info'
}

function operationTagType(operation: string): string {
  const map: Record<string, string> = {
    read: 'success',
    write: 'warning',
    delete: 'danger',
    manage: 'primary',
    export: 'info'
  }
  return map[operation] || 'info'
}

function getRelatedRoleCount(permId: string): number {
  return roles.value.filter(r => r.permissions.includes(permId)).length
}

function getRelatedRoleNames(permId: string): string {
  const names = roles.value
    .filter(r => r.permissions.includes(permId))
    .map(r => r.name)
  return names.length > 0 ? `关联角色：${names.join('、')}` : '暂未关联任何角色'
}

function formatTime(time: string): string {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style scoped>
.permission-management {
  max-width: 1400px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}

/* 统计卡片 */
.stats-row {
  margin-bottom: 16px;
}
.stat-card {
  text-align: center;
  cursor: default;
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}
.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

/* 筛选栏 */
.filter-bar {
  margin-bottom: 16px;
}

/* 权限ID标签 */
.perm-id-tag {
  font-family: 'SF Mono', Monaco, Menlo, monospace;
  font-size: 12px;
}

/* 表单提示 */
.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

/* 权限矩阵 */
.perm-matrix {
  overflow-x: auto;
}
.matrix-perm-id {
  font-family: 'SF Mono', Monaco, Menlo, monospace;
  font-size: 12px;
  color: #303133;
}
</style>
