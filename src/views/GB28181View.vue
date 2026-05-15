<template>
  <div class="gb28181-page">
    <!-- SIP 服务器配置 -->
    <el-card>
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <el-tag type="primary" size="small">GB/T 28181</el-tag>
            <span style="font-weight:600">SIP 服务器配置</span>
            <el-tag v-if="config.sipServerRunning" type="success" size="small" effect="dark">运行中</el-tag>
            <el-tag v-else type="danger" size="small" effect="dark">已停止</el-tag>
          </div>
          <el-button type="primary" :loading="saving" @click="saveConfig">
            <el-icon><Check /></el-icon>保存配置
          </el-button>
        </div>
      </template>

      <el-form :model="config" label-width="130px" v-loading="loading">
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="SIP 服务器 ID" required>
              <el-input v-model="config.sipServerId" placeholder="34020000002000000001" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="SIP 域名" required>
              <el-input v-model="config.sipServerDomain" placeholder="3402000000" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="SIP 服务器 IP" required>
              <el-input v-model="config.sipServerIp" placeholder="192.168.1.1" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="SIP 服务器端口" required>
              <el-input-number v-model="config.sipServerPort" :min="1" :max="65535" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="传输协议">
              <el-select v-model="config.transportProtocol" style="width:100%">
                <el-option label="UDP" value="UDP" />
                <el-option label="TCP" value="TCP" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="SIP 超时">
              <el-input-number v-model="config.sipTimeoutSec" :min="1" :max="300" style="width:100%" />
              <span style="margin-left:8px;color:#8c8c8c">秒</span>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="RTP 端口范围">
              <el-input v-model="config.rtpPortRange" placeholder="10000-20000" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="摘要认证">
              <el-switch v-model="config.authEnabled" active-text="启用" inactive-text="禁用" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <!-- 级联配置 -->
    <el-card style="margin-top:16px">
      <template #header>
        <div style="display:flex;align-items:center;gap:8px">
          <el-tag type="warning" size="small">级联</el-tag>
          <span style="font-weight:600">上级 SIP 服务器配置</span>
          <el-tag v-if="config.cascadeRegistered" type="success" size="small" effect="dark">已注册</el-tag>
        </div>
      </template>

      <el-form :model="cascade" label-width="130px">
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="上级 SIP IP">
              <el-input v-model="cascade.superiorSipServerIp" placeholder="10.0.0.1" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="上级 SIP 端口">
              <el-input-number v-model="cascade.superiorSipServerPort" :min="1" :max="65535" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="上级 SIP ID">
              <el-input v-model="cascade.superiorSipId" placeholder="34020000002000000001" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="上级 SIP 域">
              <el-input v-model="cascade.superiorSipDomain" placeholder="3402000000" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="本机 SIP ID">
              <el-input v-model="cascade.localSipId" placeholder="34020000001320000001" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <!-- 已注册设备列表 -->
    <el-card style="margin-top:16px">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:600">已注册设备</span>
            <el-tag size="small" type="info">{{ devices.length }} 台</el-tag>
          </div>
          <el-button @click="fetchDevices">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>

      <el-table :data="devices" stripe v-loading="devicesLoading">
        <el-table-column prop="deviceId" label="设备 ID" min-width="200" show-overflow-tooltip />
        <el-table-column prop="name" label="设备名称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP 地址" width="140" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'online' ? 'success' : row.status === 'offline' ? 'danger' : 'info'" size="small">
              {{ row.status === 'online' ? '在线' : row.status === 'offline' ? '离线' : row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="registerTime" label="注册时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.registerTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="expires" label="过期时间" width="100">
          <template #default="{ row }">
            {{ row.expires }}s
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="queryDeviceCatalog(row)">目录查询</el-button>
            <el-button size="small" link type="danger" @click="removeDevice(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '@/api/http'
import type { ApiResponse } from '@/types/common'

// ===== 类型定义 =====
interface GB28181ConfigForm {
  sipServerId: string
  sipServerDomain: string
  sipServerIp: string
  sipServerPort: number
  transportProtocol: string
  sipTimeoutSec: number
  rtpPortRange: string
  authEnabled: boolean
  sipServerRunning: boolean
  cascadeRegistered: boolean
}

interface CascadeConfig {
  superiorSipServerIp: string
  superiorSipServerPort: number
  superiorSipId: string
  superiorSipDomain: string
  localSipId: string
}

interface RegisteredDevice {
  deviceId: string
  name: string
  ip: string
  status: string
  registerTime: string
  expires: number
}

// ===== 状态 =====
const loading = ref(false)
const saving = ref(false)
const devicesLoading = ref(false)

const config = reactive<GB28181ConfigForm>({
  sipServerId: '',
  sipServerDomain: '',
  sipServerIp: '',
  sipServerPort: 5060,
  transportProtocol: 'UDP',
  sipTimeoutSec: 30,
  rtpPortRange: '10000-20000',
  authEnabled: false,
  sipServerRunning: false,
  cascadeRegistered: false,
})

const cascade = reactive<CascadeConfig>({
  superiorSipServerIp: '',
  superiorSipServerPort: 5060,
  superiorSipId: '',
  superiorSipDomain: '',
  localSipId: '',
})

const devices = ref<RegisteredDevice[]>([])

// ===== 数据请求 =====
async function fetchConfig() {
  loading.value = true
  try {
    const res = await http.get<ApiResponse<any>>('/system/gb28181/config')
    const data = res.data?.data
    if (data) {
      Object.assign(config, {
        sipServerId: data.sip_server_id ?? '',
        sipServerDomain: data.sip_server_domain ?? '',
        sipServerIp: data.sip_server_ip ?? '',
        sipServerPort: data.sip_server_port ?? 5060,
        transportProtocol: data.transport_protocol ?? 'UDP',
        sipTimeoutSec: data.sip_timeout_sec ?? 30,
        rtpPortRange: data.rtp_port_range ?? '',
        authEnabled: data.auth_enabled ?? false,
        sipServerRunning: data.sip_server_running ?? false,
        cascadeRegistered: data.cascade_registered ?? false,
      })
      if (data.cascade) {
        Object.assign(cascade, {
          superiorSipServerIp: data.cascade.superior_sip_server_ip ?? '',
          superiorSipServerPort: data.cascade.superior_sip_server_port ?? 5060,
          superiorSipId: data.cascade.superior_sip_id ?? '',
          superiorSipDomain: data.cascade.superior_sip_domain ?? '',
          localSipId: data.cascade.local_sip_id ?? '',
        })
      }
    }
  } catch {
    ElMessage.error('加载 GB28181 配置失败')
  } finally {
    loading.value = false
  }
}

async function fetchDevices() {
  devicesLoading.value = true
  try {
    const res = await http.get<ApiResponse<any>>('/system/gb28181/devices')
    devices.value = res.data?.data ?? []
  } catch {
    devices.value = []
  } finally {
    devicesLoading.value = false
  }
}

// ===== 保存配置 =====
async function saveConfig() {
  saving.value = true
  try {
    await http.put('/system/gb28181/config', {
      sip_server_id: config.sipServerId,
      sip_server_domain: config.sipServerDomain,
      sip_server_ip: config.sipServerIp,
      sip_server_port: config.sipServerPort,
      transport_protocol: config.transportProtocol,
      sip_timeout_sec: config.sipTimeoutSec,
      rtp_port_range: config.rtpPortRange,
      auth_enabled: config.authEnabled,
      cascade: {
        superior_sip_server_ip: cascade.superiorSipServerIp,
        superior_sip_server_port: cascade.superiorSipServerPort,
        superior_sip_id: cascade.superiorSipId,
        superior_sip_domain: cascade.superiorSipDomain,
        local_sip_id: cascade.localSipId,
      },
    })
    ElMessage.success('配置保存成功')
    fetchConfig()
  } catch {
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

// ===== 设备操作 =====
async function queryDeviceCatalog(row: RegisteredDevice) {
  try {
    await http.post(`/system/gb28181/devices/${row.deviceId}/catalog`)
    ElMessage.success('目录查询指令已发送')
  } catch {
    ElMessage.error('目录查询失败')
  }
}

async function removeDevice(row: RegisteredDevice) {
  try {
    await ElMessageBox.confirm(`确认移除设备 "${row.name || row.deviceId}" ？`, '移除确认', { type: 'warning' })
    await http.delete(`/system/gb28181/devices/${row.deviceId}`)
    ElMessage.success('已移除')
    fetchDevices()
  } catch { /* cancelled */ }
}

// ===== 工具函数 =====
function formatTime(ts: string): string {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleString('zh-CN')
  } catch {
    return ts
  }
}

onMounted(() => {
  fetchConfig()
  fetchDevices()
})
</script>

<style scoped>
.gb28181-page { padding: 0 4px; }
</style>
