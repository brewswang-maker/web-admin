<template>
  <div class="onvif-page">
    <!-- 工具栏 -->
    <el-card>
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <el-tag type="primary" size="small">ONVIF</el-tag>
            <span style="font-weight:600">设备发现</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <el-switch v-model="autoRefresh" active-text="自动刷新" inactive-text="" @change="toggleAutoRefresh" />
            <el-button type="primary" :loading="scanning" @click="startDiscovery">
              <el-icon><Search /></el-icon>{{ scanning ? '扫描中...' : '发现设备' }}
            </el-button>
          </div>
        </div>
      </template>

      <!-- 扫描进度 -->
      <el-progress v-if="scanning" :percentage="scanProgress" :stroke-width="6" style="margin-bottom:12px" />

      <!-- 两栏布局：发现结果 + 已添加设备 -->
      <el-row :gutter="16">
        <!-- 发现结果 -->
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-weight:600">发现设备</span>
                <el-tag size="small" type="info">{{ discoveredDevices.length }} 台</el-tag>
              </div>
            </template>
            <el-table :data="discoveredDevices" stripe v-loading="scanning" max-height="500" empty-text="点击「发现设备」搜索网络中的 ONVIF 设备">
              <el-table-column prop="name" label="设备名称" min-width="120" show-overflow-tooltip />
              <el-table-column prop="ip" label="IP 地址" width="130" />
              <el-table-column prop="manufacturer" label="厂商" width="80" show-overflow-tooltip />
              <el-table-column prop="model" label="型号" width="80" show-overflow-tooltip />
              <el-table-column prop="profileCount" label="Profile" width="70" align="center" />
              <el-table-column label="操作" width="80" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" link type="primary" @click="openAddDialog(row)">添加</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <!-- 已添加设备 -->
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-weight:600">已添加设备</span>
                <div style="display:flex;align-items:center;gap:8px">
                  <el-tag size="small" type="info">{{ addedDevices.length }} 台</el-tag>
                  <el-button size="small" @click="fetchAddedDevices">
                    <el-icon><Refresh /></el-icon>刷新
                  </el-button>
                </div>
              </div>
            </template>
            <el-table :data="addedDevices" stripe v-loading="addedLoading" max-height="500">
              <el-table-column prop="name" label="设备名称" min-width="120" show-overflow-tooltip />
              <el-table-column prop="ip" label="IP 地址" width="130" />
              <el-table-column prop="status" label="状态" width="90">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'online' ? 'success' : row.status === 'offline' ? 'danger' : 'info'" size="small">
                    {{ row.status === 'online' ? '在线' : row.status === 'offline' ? '离线' : row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="profileCount" label="Profile" width="70" align="center" />
              <el-table-column label="操作" width="140" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" link type="primary" @click="openEditDialog(row)">编辑</el-button>
                  <el-button size="small" link type="danger" @click="handleDelete(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </el-card>

    <!-- 添加/编辑设备对话框 -->
    <el-dialog v-model="showDialog" :title="dialogMode === 'add' ? '添加 ONVIF 设备' : '编辑 ONVIF 设备'" width="540px" @closed="resetForm">
      <el-form :model="form" label-width="100px">
        <el-form-item label="设备名称" required>
          <el-input v-model="form.name" placeholder="如：大门摄像头" />
        </el-form-item>
        <el-form-item label="IP 地址" required>
          <el-input v-model="form.ip" placeholder="192.168.1.100" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="admin" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" placeholder="****" show-password />
        </el-form-item>
        <el-form-item label="选择 Profile">
          <el-select v-model="form.profileToken" style="width:100%" placeholder="请先填写 IP 和凭据后获取" :loading="profilesLoading">
            <el-option v-for="p in profiles" :key="p.token" :label="`${p.name} (${p.codec}/${p.resolution})`" :value="p.token" />
          </el-select>
          <el-button size="small" style="margin-top:8px" :loading="profilesLoading" @click="fetchProfiles">获取 Profiles</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitDevice">{{ dialogMode === 'add' ? '添加' : '保存' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '@/api/http'
import type { ApiResponse } from '@/types/common'

// ===== 类型 =====
interface OnvifDevice {
  name: string
  ip: string
  manufacturer: string
  model: string
  profileCount: number
  uuid?: string
}

interface AddedDevice {
  id: string
  name: string
  ip: string
  status: string
  profileCount: number
}

interface OnvifProfile {
  token: string
  name: string
  codec: string
  resolution: string
}

// ===== 状态 =====
const scanning = ref(false)
const scanProgress = ref(0)
const autoRefresh = ref(false)
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

const discoveredDevices = ref<OnvifDevice[]>([])
const addedDevices = ref<AddedDevice[]>([])
const addedLoading = ref(false)

const showDialog = ref(false)
const dialogMode = ref<'add' | 'edit'>('add')
const submitting = ref(false)
const editingId = ref('')

const profiles = ref<OnvifProfile[]>([])
const profilesLoading = ref(false)

const form = reactive({
  name: '',
  ip: '',
  username: '',
  password: '',
  profileToken: '',
})

// ===== 设备发现 =====
async function startDiscovery() {
  scanning.value = true
  scanProgress.value = 0
  discoveredDevices.value = []

  // 模拟进度
  const progressTimer = setInterval(() => {
    if (scanProgress.value < 90) scanProgress.value += Math.random() * 15
  }, 500)

  try {
    const res = await http.post<ApiResponse<OnvifDevice[]>>('/devices/discover', { method: 'onvif' })
    discoveredDevices.value = res.data?.data ?? []
    scanProgress.value = 100
    if (discoveredDevices.value.length) {
      ElMessage.success(`发现 ${discoveredDevices.value.length} 台设备`)
    } else {
      ElMessage.info('未发现设备')
    }
  } catch {
    ElMessage.error('设备发现失败')
  } finally {
    clearInterval(progressTimer)
    setTimeout(() => { scanning.value = false }, 600)
  }
}

// ===== 已添加设备 =====
async function fetchAddedDevices() {
  addedLoading.value = true
  try {
    const res = await http.get<ApiResponse<AddedDevice[]>>('/devices', { params: { protocol: 'onvif' } })
    addedDevices.value = (res.data?.data as any)?.items ?? res.data?.data ?? []
  } catch {
    addedDevices.value = []
  } finally {
    addedLoading.value = false
  }
}

// ===== Profiles =====
async function fetchProfiles() {
  if (!form.ip) {
    ElMessage.warning('请先填写 IP 地址')
    return
  }
  profilesLoading.value = true
  try {
    const res = await http.get<ApiResponse<OnvifProfile[]>>('/devices/onvif/profiles', {
      params: { ip: form.ip, username: form.username, password: form.password }
    })
    profiles.value = res.data?.data ?? []
  } catch {
    profiles.value = []
    ElMessage.error('获取 Profiles 失败')
  } finally {
    profilesLoading.value = false
  }
}

// ===== 添加/编辑 =====
function openAddDialog(row: OnvifDevice) {
  dialogMode.value = 'add'
  form.name = row.name || ''
  form.ip = row.ip || ''
  form.username = ''
  form.password = ''
  form.profileToken = ''
  profiles.value = []
  showDialog.value = true
}

function openEditDialog(row: AddedDevice) {
  dialogMode.value = 'edit'
  editingId.value = row.id
  form.name = row.name
  form.ip = row.ip
  form.username = ''
  form.password = ''
  form.profileToken = ''
  profiles.value = []
  showDialog.value = true
}

async function submitDevice() {
  if (!form.name || !form.ip) {
    ElMessage.warning('请填写设备名称和 IP 地址')
    return
  }
  submitting.value = true
  try {
    if (dialogMode.value === 'add') {
      await http.post('/devices', {
        device_name: form.name,
        ip_address: form.ip,
        protocol: 'ONVIF',
        config: {
          onvif_username: form.username,
          onvif_password: form.password,
          onvif_profile_token: form.profileToken,
        },
      })
      ElMessage.success('设备添加成功')
    } else {
      await http.put(`/devices/${editingId.value}`, {
        device_name: form.name,
        ip_address: form.ip,
        config: {
          onvif_username: form.username,
          onvif_password: form.password,
          onvif_profile_token: form.profileToken,
        },
      })
      ElMessage.success('设备更新成功')
    }
    showDialog.value = false
    fetchAddedDevices()
  } catch {
    ElMessage.error(dialogMode.value === 'add' ? '添加失败' : '更新失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: AddedDevice) {
  try {
    await ElMessageBox.confirm(`确认删除设备 "${row.name}" ？`, '删除确认', { type: 'warning' })
    await http.delete(`/devices/${row.id}`)
    ElMessage.success('已删除')
    fetchAddedDevices()
  } catch { /* cancelled */ }
}

function resetForm() {
  form.name = ''
  form.ip = ''
  form.username = ''
  form.password = ''
  form.profileToken = ''
  profiles.value = []
}

// ===== 自动刷新 =====
function toggleAutoRefresh(val: boolean | string | number) {
  if (val) {
    autoRefreshTimer = setInterval(() => {
      startDiscovery()
    }, 30000)
  } else {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer)
      autoRefreshTimer = null
    }
  }
}

onMounted(() => {
  fetchAddedDevices()
})

onUnmounted(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
})
</script>

<style scoped>
.onvif-page { padding: 0 4px; }
</style>
