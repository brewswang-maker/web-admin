<template>
  <div class="user-management">
    <div class="page-header">
      <h2>用户管理</h2>
      <el-button type="primary" @click="openCreateDialog" v-permission="['users:write']">
        <el-icon><Plus /></el-icon> 新增用户
      </el-button>
    </div>

    <!-- 搜索栏 -->
    <el-card class="search-bar" shadow="never">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="用户名">
          <el-input v-model="searchForm.username" placeholder="搜索用户名" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable>
            <el-option label="正常" value="active" />
            <el-option label="禁用" value="disabled" />
            <el-option label="锁定" value="locked" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchUsers">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 用户表格 -->
    <el-card shadow="never">
      <el-table :data="filteredUsers" border stripe v-loading="loading" style="width: 100%">
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="displayName" label="显示名称" min-width="120" />
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column label="角色" min-width="200">
          <template #default="{ row }">
            <el-tag
              v-for="roleId in row.roleIds"
              :key="roleId"
              :type="roleTagType(roleId)"
              size="small"
              style="margin-right: 4px"
            >
              {{ getRoleName(roleId) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastLoginAt" label="最后登录" min-width="160">
          <template #default="{ row }">
            {{ row.lastLoginAt ? formatTime(row.lastLoginAt) : '从未登录' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEditDialog(row)" v-permission="['users:write']">
              编辑
            </el-button>
            <el-button
              link
              type="warning"
              size="small"
              @click="toggleUserStatus(row)"
              v-permission="['users:manage']"
            >
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
            <el-popconfirm
              title="确认删除该用户？"
              @confirm="handleDelete(row.id)"
              v-permission="['users:delete']"
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
      :title="isEditing ? '编辑用户' : '新增用户'"
      width="550px"
      @close="resetForm"
    >
      <el-form :model="userForm" :rules="userRules" ref="formRef" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" :disabled="isEditing" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="显示名称" prop="displayName">
          <el-input v-model="userForm.displayName" placeholder="请输入显示名称" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item v-if="!isEditing" label="密码" prop="password">
          <el-input v-model="userForm.password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
        <el-form-item label="角色" prop="roleIds">
          <el-select v-model="userForm.roleIds" multiple placeholder="请选择角色" style="width: 100%">
            <el-option
              v-for="role in allRoles"
              :key="role.id"
              :label="role.name"
              :value="role.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="userForm.status">
            <el-radio value="active">正常</el-radio>
            <el-radio value="disabled">禁用</el-radio>
          </el-radio-group>
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
import type { User, Role } from '@/types/rbac'
import { rbacApi } from '@/api/rbac'
import { useAuthStore } from '@/stores/auth'
import dayjs from 'dayjs'

const auth = useAuthStore()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingUserId = ref<string | null>(null)
const formRef = ref<FormInstance>()
const users = ref<User[]>([])
const allRoles = ref<Role[]>([])

const searchForm = ref({
  username: '',
  status: ''
})

// ---- 表单 ----
const userForm = ref({
  username: '',
  displayName: '',
  email: '',
  password: '',
  roleIds: [] as string[],
  status: 'active' as 'active' | 'disabled'
})

const userRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 32, message: '用户名长度3-32个字符', trigger: 'blur' }
  ],
  displayName: [{ required: true, message: '请输入显示名称', trigger: 'blur' }],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  roleIds: [{ required: true, message: '请选择角色', trigger: 'change' }]
}

// ---- 过滤 ----
const filteredUsers = computed(() => {
  let list = users.value
  if (searchForm.value.username) {
    const kw = searchForm.value.username.toLowerCase()
    list = list.filter((u: any) => u.username.toLowerCase().includes(kw) || (u.displayName || u.name || '').includes(kw))
  }
  if (searchForm.value.status) {
    list = list.filter(u => u.status === searchForm.value.status)
  }
  return list
})

// ---- 生命周期 ----
onMounted(async () => {
  await Promise.all([fetchUsers(), fetchRoles()])
})

async function fetchUsers() {
  loading.value = true
  try {
    const res = await rbacApi.getUsers()
    users.value = ((res.data as any)?.data?.items || (res.data as any)?.data || []) as any[]
  } catch (e: any) {
    ElMessage.error('获取用户列表失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

async function fetchRoles() {
  try {
    const res = await rbacApi.getRoles()
    allRoles.value = (res.data as any)?.data?.items || (res.data as any)?.data || []
  } catch (e: any) {
    ElMessage.error('获取角色列表失败: ' + e.message)
  }
}

function resetSearch() {
  searchForm.value = { username: '', status: '' }
}

// ---- CRUD ----
function openCreateDialog() {
  isEditing.value = false
  editingUserId.value = null
  dialogVisible.value = true
}

function openEditDialog(row: User) {
  isEditing.value = true
  editingUserId.value = String(row.id)
  userForm.value = {
    username: (row as any).username,
    displayName: (row as any).displayName || (row as any).name || '',
    email: row.email || '',
    password: '',
    roleIds: [...(row.roleIds || [])],
    status: row.status === 'locked' ? 'disabled' : row.status
  }
  dialogVisible.value = true
}

function resetForm() {
  userForm.value = {
    username: '',
    displayName: '',
    email: '',
    password: '',
    roleIds: [],
    status: 'active'
  }
  formRef.value?.resetFields()
}

async function submitForm() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEditing.value && editingUserId.value) {
      const { password, ...data } = userForm.value
      await (rbacApi as any).updateUser(editingUserId.value, password ? userForm.value : data)
      ElMessage.success('用户更新成功')
    } else {
      await (rbacApi as any).createUser({
        username: userForm.value.username,
        displayName: userForm.value.displayName,
        email: userForm.value.email,
        roleIds: userForm.value.roleIds,
        status: userForm.value.status
      })
      ElMessage.success('用户创建成功')
    }
    dialogVisible.value = false
    await fetchUsers()
  } catch (e: any) {
    ElMessage.error('操作失败: ' + e.message)
  } finally {
    submitting.value = false
  }
}

async function toggleUserStatus(row: User) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active'
  try {
    await (rbacApi as any).updateUser(String(row.id), { status: newStatus }) as any
    ;(row as any).status = newStatus
    ElMessage.success(`用户已${newStatus === 'active' ? '启用' : '禁用'}`)
  } catch (e: any) {
    ElMessage.error('操作失败: ' + e.message)
  }
}

async function handleDelete(userId: string) {
  try {
    await (rbacApi as any).deleteUser(userId)
    ElMessage.success('用户已删除')
    await fetchUsers()
  } catch (e: any) {
    ElMessage.error('删除失败: ' + e.message)
  }
}

// ---- 工具函数 ----
function getRoleName(roleId: string): string {
  const role = allRoles.value.find(r => r.id === roleId)
  return role?.name || roleId
}

function roleTagType(roleId: string): 'danger' | 'warning' | 'success' | 'info' {
  const map: Record<string, string> = {
    super_admin: 'danger',
    admin: 'warning',
    operator: 'success',
    viewer: 'info'
  }
  return (map[roleId] || 'info') as any
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: '正常',
    disabled: '禁用',
    locked: '锁定'
  }
  return map[status] || status
}

function statusTagType(status: string): 'success' | 'danger' | 'warning' {
  const map: Record<string, string> = {
    active: 'success',
    disabled: 'danger',
    locked: 'warning'
  }
  return (map[status] || 'info') as any
}

function formatTime(time: string): string {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style scoped>
.user-management {
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
.search-bar {
  margin-bottom: 16px;
}
</style>
