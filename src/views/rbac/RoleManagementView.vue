<template>
  <div class="role-management">
    <div class="page-header">
      <h2>角色管理</h2>
      <el-button type="primary" @click="openCreateDialog" v-permission="['roles:write']">
        <el-icon><Plus /></el-icon> 新增角色
      </el-button>
    </div>

    <!-- 角色卡片列表 -->
    <el-row :gutter="16">
      <el-col v-for="role in roles" :key="role.id" :xs="24" :sm="12" :lg="8" style="margin-bottom: 16px">
        <el-card class="role-card" shadow="hover">
          <template #header>
            <div class="role-card-header">
              <div class="role-info">
                <el-tag :type="roleTagType(role.id)" size="small" effect="dark">
                  {{ role.name }}
                </el-tag>
                <el-tag v-if="role.isSystem" type="info" size="small" effect="plain">系统内置</el-tag>
              </div>
              <div class="role-actions">
                <el-button link type="primary" size="small" @click="openEditDialog(role)" v-permission="['roles:write']">
                  编辑
                </el-button>
                <el-popconfirm
                  v-if="!role.isSystem"
                  title="确认删除该角色？关联用户将失去对应权限"
                  @confirm="handleDelete(role.id)"
                  v-permission="['roles:delete']"
                >
                  <template #reference>
                    <el-button link type="danger" size="small">删除</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </template>
          <p class="role-desc">{{ role.description }}</p>
          <div class="role-permissions">
            <div class="perm-label">拥有权限 ({{ role.permissions.length }})：</div>
            <div class="perm-tags">
              <el-tooltip
                v-for="permId in role.permissions.slice(0, 8)"
                :key="permId"
                :content="getPermDescription(permId)"
                placement="top"
              >
                <el-tag size="small" class="perm-tag" effect="plain">
                  {{ formatPermId(permId) }}
                </el-tag>
              </el-tooltip>
              <el-tag v-if="role.permissions.length > 8" size="small" type="info" effect="plain">
                +{{ role.permissions.length - 8 }} 更多
              </el-tag>
              <span v-if="role.permissions.length === 0" class="no-perm">暂无权限</span>
            </div>
          </div>
          <div class="role-footer">
            <span class="update-time">更新于 {{ formatTime(role.updatedAt) }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑角色' : '新增角色'"
      width="650px"
      @close="resetForm"
    >
      <el-form :model="roleForm" :rules="roleRules" ref="formRef" label-width="100px">
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="roleForm.name" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="角色描述" prop="description">
          <el-input v-model="roleForm.description" type="textarea" :rows="2" placeholder="请输入角色描述" />
        </el-form-item>
        <el-form-item label="权限分配" prop="permissions">
          <div class="perm-allocation">
            <!-- 快捷操作 -->
            <div class="perm-quick-actions">
              <el-button size="small" @click="selectAll">全选</el-button>
              <el-button size="small" @click="deselectAll">清空</el-button>
            </div>
            <!-- 按资源分组 -->
            <div v-for="group in permissionGroups" :key="group.resource" class="perm-group">
              <div class="perm-group-header">
                <el-checkbox
                  :model-value="isGroupFullySelected(group)"
                  :indeterminate="isGroupIndeterminate(group)"
                  @change="toggleGroup(group, $event)"
                >
                  <strong>{{ group.label }}</strong>
                </el-checkbox>
              </div>
              <div class="perm-group-items">
                <el-checkbox
                  v-for="perm in group.permissions"
                  :key="perm.id"
                  :model-value="roleForm.permissions.includes(perm.id)"
                  @change="togglePermission(perm.id)"
                  size="small"
                >
                  {{ perm.description }}
                </el-checkbox>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          {{ isEditing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { Role, Permission } from '@/types/rbac'
import { ResourceLabels } from '@/types/rbac'
import { getRoles, createRole, updateRole, deleteRole, getAllPermissions } from '@/api/rbac'
import { ALL_PERMISSIONS } from '@/core/rbac'
import dayjs from 'dayjs'

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingRoleId = ref<string | null>(null)
const formRef = ref<FormInstance>()
const roles = ref<Role[]>([])
const allPermissions = ref<Permission[]>([])

const roleForm = ref({
  name: '',
  description: '',
  permissions: [] as string[]
})

const roleRules: FormRules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  description: [{ required: true, message: '请输入角色描述', trigger: 'blur' }]
}

// ---- 权限分组（按资源） ----
interface PermGroup {
  resource: string
  label: string
  permissions: Permission[]
}

const permissionGroups = computed<PermGroup[]>(() => {
  const map = new Map<string, Permission[]>()
  ALL_PERMISSIONS.forEach(p => {
    const list = map.get(p.resource) || []
    list.push(p)
    map.set(p.resource, list)
  })
  return Array.from(map.entries()).map(([resource, permissions]) => ({
    resource,
    label: ResourceLabels[resource as any] || resource,
    permissions
  }))
})

// ---- 生命周期 ----
onMounted(async () => {
  await Promise.all([fetchRoles(), fetchPermissions()])
})

async function fetchRoles() {
  loading.value = true
  try {
    roles.value = await getRoles()
  } catch (e: any) {
    ElMessage.error('获取角色列表失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

async function fetchPermissions() {
  try {
    allPermissions.value = await getAllPermissions()
  } catch (e: any) {
    ElMessage.error('获取权限列表失败: ' + e.message)
  }
}

// ---- 权限组操作 ----
function isGroupFullySelected(group: PermGroup): boolean {
  return group.permissions.every(p => roleForm.permissions.includes(p.id))
}

function isGroupIndeterminate(group: PermGroup): boolean {
  const selected = group.permissions.filter(p => roleForm.permissions.includes(p.id)).length
  return selected > 0 && selected < group.permissions.length
}

function toggleGroup(group: PermGroup, checked: any) {
  if (checked) {
    group.permissions.forEach(p => {
      if (!roleForm.permissions.includes(p.id)) {
        roleForm.permissions.push(p.id)
      }
    })
  } else {
    roleForm.permissions = roleForm.permissions.filter(
      id => !group.permissions.some(p => p.id === id)
    )
  }
}

function togglePermission(permId: string) {
  const idx = roleForm.permissions.indexOf(permId)
  if (idx >= 0) {
    roleForm.permissions.splice(idx, 1)
  } else {
    roleForm.permissions.push(permId)
  }
}

function selectAll() {
  roleForm.permissions = ALL_PERMISSIONS.map(p => p.id)
}

function deselectAll() {
  roleForm.permissions = []
}

// ---- CRUD ----
function openCreateDialog() {
  isEditing.value = false
  editingRoleId.value = null
  dialogVisible.value = true
}

function openEditDialog(role: Role) {
  isEditing.value = true
  editingRoleId.value = role.id
  roleForm.value = {
    name: role.name,
    description: role.description,
    permissions: [...role.permissions]
  }
  dialogVisible.value = true
}

function resetForm() {
  roleForm.value = { name: '', description: '', permissions: [] }
  formRef.value?.resetFields()
}

async function submitForm() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEditing.value && editingRoleId.value) {
      await updateRole(editingRoleId.value, roleForm.value)
      ElMessage.success('角色更新成功')
    } else {
      await createRole(roleForm.value)
      ElMessage.success('角色创建成功')
    }
    dialogVisible.value = false
    await fetchRoles()
  } catch (e: any) {
    ElMessage.error('操作失败: ' + e.message)
  } finally {
    submitting.value = false
  }
}

async function handleDelete(roleId: string) {
  try {
    await deleteRole(roleId)
    ElMessage.success('角色已删除')
    await fetchRoles()
  } catch (e: any) {
    ElMessage.error('删除失败: ' + e.message)
  }
}

// ---- 工具函数 ----
function getPermDescription(permId: string): string {
  const perm = ALL_PERMISSIONS.find(p => p.id === permId)
  return perm ? `${perm.description} (${permId})` : permId
}

function formatPermId(permId: string): string {
  const perm = ALL_PERMISSIONS.find(p => p.id === permId)
  return perm?.description || permId
}

function roleTagType(roleId: string): 'danger' | 'warning' | 'success' | 'info' {
  const map: Record<string, string> = {
    super_admin: 'danger',
    admin: 'warning',
    operator: 'success',
    viewer: 'info'
  }
  return (map[roleId] || '') as any
}

function formatTime(time: string): string {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style scoped>
.role-management {
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
.role-card {
  height: 100%;
  transition: transform 0.2s;
}
.role-card:hover {
  transform: translateY(-2px);
}
.role-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.role-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.role-actions {
  display: flex;
  gap: 4px;
}
.role-desc {
  color: #666;
  font-size: 13px;
  margin: 0 0 12px;
  line-height: 1.5;
}
.role-permissions {
  border-top: 1px solid #f0f0f0;
  padding-top: 12px;
}
.perm-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}
.perm-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.perm-tag {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.no-perm {
  color: #ccc;
  font-size: 12px;
}
.role-footer {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}
.update-time {
  font-size: 11px;
  color: #bbb;
}

/* 权限分配区域 */
.perm-allocation {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  width: 100%;
}
.perm-quick-actions {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}
.perm-group {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #f0f0f0;
}
.perm-group:last-child {
  border-bottom: none;
  margin-bottom: 0;
}
.perm-group-header {
  margin-bottom: 6px;
}
.perm-group-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding-left: 24px;
}
</style>
