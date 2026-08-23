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
          <div style="display:flex;gap:8px">
            <el-button v-if="!config.sipServerRunning" type="success" :loading="toggleLoading" @click="toggleServer(true)">
              <el-icon><VideoPlay /></el-icon>启动服务
            </el-button>
            <el-button v-else type="danger" :loading="toggleLoading" @click="toggleServer(false)">
              <el-icon><VideoPause /></el-icon>停止服务
            </el-button>
            <el-button type="primary" :loading="saving" @click="saveConfig">
              <el-icon><Check /></el-icon>保存配置
            </el-button>
          </div>
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
              <el-input v-model="config.sipServerIp" placeholder="0.0.0.0（监听所有接口）" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="SIP 服务器端口" required>
              <el-input-number v-model="config.sipServerPort" :min="1" :max="65535" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <!-- [UI-IPCFG 2026-08-15] SDP 媒体地址：决定摄像头 RTP 推流目的 IP -->
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="SDP 媒体地址">
              <div style="width:100%">
                <el-radio-group v-model="sipAdvertiseMode">
                  <el-radio value="auto">自动获取本机 IP</el-radio>
                  <el-radio value="manual">手动指定</el-radio>
                </el-radio-group>
                <el-input
                  v-if="sipAdvertiseMode === 'manual'"
                  v-model="manualAdvertiseIp"
                  placeholder="192.168.0.108"
                  style="width:60%;margin-top:6px"
                />
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="当前生效 IP">
              <div style="display:flex;align-items:center;gap:8px">
                <el-tag type="success" effect="dark">{{ config.sdpIp || '未知' }}</el-tag>
                <span style="color:#8c8c8c;font-size:12px">摄像头 RTP 推流目的地址</span>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-alert
          type="info"
          :closable="false"
          style="margin-bottom:12px"
          title="SDP 媒体地址是告知摄像头的收流地址：推荐“自动获取本机 IP”（DHCP 环境自适应）；手动指定为本机不存在的 IP 会导致预览黑屏。仅改此项立即生效，无需重启。"
        />
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

    <!-- 设备发现/扫描 -->
    <el-card style="margin-top:16px">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <el-icon :size="20" style="color:#409EFF"><Search /></el-icon>
            <span style="font-weight:600">设备发现</span>
            <el-tag v-if="discoveredDevices.length > 0" size="small" type="success" effect="dark">
              发现 {{ discoveredDevices.length }} 台设备
            </el-tag>
          </div>
          <div style="display:flex;gap:8px">
            <el-button type="primary" :loading="scanning" @click="startScan('gb28181')">
              <el-icon><Search /></el-icon>GB28181 扫描
            </el-button>
            <el-button :loading="scanning" @click="startScan('onvif')">
              <el-icon><Search /></el-icon>ONVIF 扫描
            </el-button>
          </div>
        </div>
      </template>

      <!-- 扫描进度 -->
      <div v-if="scanning" style="padding:8px 0">
        <el-progress :percentage="scanProgress" :stroke-width="6" :format="() => scanStatusText" />
        <div style="margin-top:8px;font-size:12px;color:#8c8c8c">
          {{ scanStatusText }}
        </div>
      </div>

      <!-- 扫描结果 -->
      <el-table
        v-if="discoveredDevices.length > 0"
        :data="discoveredDevices"
        stripe
        style="margin-top:12px"
        empty-text="未发现新设备"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column prop="name" label="设备名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="id" label="设备 ID" min-width="180" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP 地址" width="140" />
        <el-table-column prop="port" label="端口" width="80" />
        <el-table-column prop="protocol" label="协议" width="100">
          <template #default="{ row }">
            <el-tag :type="row.protocol === 'GB28181' ? 'primary' : 'warning'" size="small">
              {{ row.protocol }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="vendor" label="厂商" width="100" show-overflow-tooltip />
        <el-table-column prop="model" label="型号" width="120" show-overflow-tooltip />
        <el-table-column prop="channels" label="通道数" width="80" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="addDiscoveredDevice(row)">接入</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 空状态 -->
      <el-empty
        v-if="!scanning && discoveredDevices.length === 0"
        description="点击上方按钮开始扫描局域网内的 GB28181 / ONVIF 设备"
        :image-size="80"
      />
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
import { Search, VideoPlay, VideoPause, Check, Refresh } from '@element-plus/icons-vue'
import { http } from '@/api/http'
import type { ApiResponse } from '@/types/common'

// ===== 类型定义 =====
interface DiscoveredDevice {
  id: string
  name: string
  ip: string
  port: number
  vendor: string
  model: string
  device_type: string
  protocol: string
  channels: number
}
interface GB28181ConfigForm {
  sipServerId: string
  sipServerDomain: string
  sipServerIp: string
  sipServerPort: number
  sipAdvertiseIp: string   // SDP 媒体广告 IP：'auto' = 自动探测本机 IP
  sdpIp: string            // 实际生效 IP（后端探测结果，只读展示）
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
const toggleLoading = ref(false)

// 设备发现
const scanning = ref(false)
const scanProgress = ref(0)
const scanStatusText = ref('准备扫描...')
const discoveredDevices = ref<DiscoveredDevice[]>([])

const config = reactive<GB28181ConfigForm>({
  sipServerId: '',
  sipServerDomain: '',
  sipServerIp: '',
  sipServerPort: 5060,
  sipAdvertiseIp: 'auto',
  sdpIp: '',
  transportProtocol: 'UDP',
  sipTimeoutSec: 30,
  rtpPortRange: '10000-20000',
  authEnabled: false,
  sipServerRunning: false,
  cascadeRegistered: false,
})

// SDP 媒体地址模式：auto = 自动获取本机 IP；manual = 手动指定
const sipAdvertiseMode = ref<'auto' | 'manual'>('auto')
const manualAdvertiseIp = ref('')
const IPV4_RE = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

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
        sipAdvertiseIp: data.sip_advertise_ip || 'auto',
        sdpIp: data.sdp_ip ?? '',
        transportProtocol: data.transport_protocol ?? 'UDP',
        sipTimeoutSec: data.sip_timeout_sec ?? 30,
        rtpPortRange: data.rtp_port_range ?? '',
        authEnabled: data.auth_enabled ?? false,
        sipServerRunning: data.sip_server_running ?? false,
        cascadeRegistered: data.cascade_registered ?? false,
      })
      // 派生媒体地址编辑状态
      if (config.sipAdvertiseIp && config.sipAdvertiseIp !== 'auto') {
        sipAdvertiseMode.value = 'manual'
        manualAdvertiseIp.value = config.sipAdvertiseIp
      } else {
        sipAdvertiseMode.value = 'auto'
        manualAdvertiseIp.value = ''
      }
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

// ===== 设备发现/扫描 =====
async function startScan(method: 'gb28181' | 'onvif') {
  scanning.value = true
  scanProgress.value = 0
  scanStatusText.value = method === 'gb28181' ? '正在发送 SIP SEARCH 广播...' : '正在发送 ONVIF Probe...'
  discoveredDevices.value = []

  const progressTimer = setInterval(() => {
    if (scanProgress.value < 90) {
      scanProgress.value += Math.random() * 15
      scanStatusText.value = `正在扫描子网 ${method === 'gb28181' ? 'SIP' : 'WS-Discovery'} 协议设备...`
    }
  }, 500)

  try {
    // 直接用 GET 端点（POST /devices/discover 不按method过滤）
    const res = await http.get(`/devices/discover/${method}`)
    const payload = res.data?.data ?? res.data
    discoveredDevices.value = payload?.devices ?? (Array.isArray(payload) ? payload : [])
    scanProgress.value = 100
    scanStatusText.value = `扫描完成，发现 ${discoveredDevices.value.length} 台设备`

    if (discoveredDevices.value.length === 0) {
      ElMessage.info('未发现新设备，请确认设备已通电并接入同一局域网')
    } else {
      ElMessage.success(`发现 ${discoveredDevices.value.length} 台设备`)
    }
  } catch {
    ElMessage.error('设备扫描失败，请检查 SIP 服务是否已启动')
    scanStatusText.value = '扫描失败'
  } finally {
    clearInterval(progressTimer)
    scanning.value = false
  }
}

async function addDiscoveredDevice(device: DiscoveredDevice) {
  try {
    await http.post('/devices', {
      name: device.name,
      ip: device.ip,
      port: device.port,
      protocol: device.protocol.toLowerCase(),
      device_id: device.id,
      channels: device.channels,
    })
    ElMessage.success(`设备 "${device.name}" 已接入`)
    // 从发现列表移除
    discoveredDevices.value = discoveredDevices.value.filter(d => d.id !== device.id)
    // 刷新已注册列表
    fetchDevices()
  } catch {
    ElMessage.error('设备接入失败')
  }
}

async function toggleServer(start: boolean) {
  toggleLoading.value = true
  try {
    await http.post('/system/gb28181/server', { action: start ? 'start' : 'stop' })
    config.sipServerRunning = start
    ElMessage.success(start ? 'SIP 服务已启动' : 'SIP 服务已停止')
  } catch {
    ElMessage.error(start ? '启动 SIP 服务失败' : '停止 SIP 服务失败')
  } finally {
    toggleLoading.value = false
  }
}

// ===== 保存配置 =====
async function saveConfig() {
  // SDP 媒体地址校验：手动模式下必须是合法 IPv4
  const advertiseIp = sipAdvertiseMode.value === 'auto' ? 'auto' : manualAdvertiseIp.value.trim()
  if (sipAdvertiseMode.value === 'manual' && !IPV4_RE.test(advertiseIp)) {
    ElMessage.error('SDP 媒体地址格式错误，请输入合法 IPv4（如 192.168.0.108）或改为自动获取')
    return
  }
  saving.value = true
  try {
    const res = await http.put('/system/gb28181/config', {
      sip_server_id: config.sipServerId,
      sip_server_domain: config.sipServerDomain,
      sip_server_ip: config.sipServerIp,
      sip_server_port: config.sipServerPort,
      sip_advertise_ip: advertiseIp,
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
    const saved = res.data?.data
    if (saved?.restart_required) {
      ElMessage.warning('配置已保存，但 SIP 监听地址/端口变更需重启盒子服务后生效')
    } else {
      ElMessage.success(`配置保存成功，实际生效媒体 IP：${saved?.sdp_ip ?? advertiseIp}`)
    }
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
/* .gb28181-page { padding: 0 4px; } */
</style>
