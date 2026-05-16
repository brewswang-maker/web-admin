<template>
  <div class="devices-page">
    <!-- 工具栏 -->
    <el-card class="toolbar-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input v-model="search" placeholder="搜索设备名称 / IP" style="width:220px" clearable @clear="onSearch" @keyup.enter="onSearch">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="statusFilter" style="width:120px" clearable placeholder="状态" @change="onSearch">
            <el-option label="在线" value="online" />
            <el-option label="离线" value="offline" />
            <el-option label="告警中" value="alarming" />
            <el-option label="维护中" value="maintenance" />
          </el-select>
          <el-select v-model="typeFilter" style="width:120px" clearable placeholder="类型" @change="onSearch">
            <el-option label="IPCamera" value="IPCamera" />
            <el-option label="NVR" value="NVR" />
            <el-option label="DVR" value="DVR" />
            <el-option label="EdgeBox" value="EdgeBox" />
          </el-select>
          <el-select v-model="projectFilter" style="width:120px" clearable placeholder="项目" @change="onSearch">
            <el-option label="智慧园区" value="park" />
            <el-option label="智慧工地" value="site" />
            <el-option label="智慧社区" value="community" />
          </el-select>
        </div>
        <div class="toolbar-right">
          <el-dropdown trigger="click" @command="handleToolbarDiscover">
            <el-button type="success" plain>
              <el-icon><Search /></el-icon>发现设备<el-icon style="margin-left:4px"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="onvif">
                  <el-icon><Cpu /></el-icon>ONVIF 搜索
                </el-dropdown-item>
                <el-dropdown-item command="gb28181">
                  <el-icon><Connection /></el-icon>GB28181 查询
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>添加设备
          </el-button>
          <el-button :disabled="!selected.length" @click="batchReboot">
            <el-icon><RefreshRight /></el-icon>批量重启
          </el-button>
          <el-button :disabled="!selected.length" @click="batchSync">
            <el-icon><Refresh /></el-icon>批量同步
          </el-button>
          <el-button :disabled="!selected.length" type="danger" plain @click="batchDelete">批量删除</el-button>
        </div>
      </div>
    </el-card>

    <!-- 批量操作提示条 -->
    <div v-if="selected.length" class="batch-bar">
      <span>已选 <strong>{{ selected.length }}</strong> 台设备</span>
      <el-button size="small" link @click="selected = []">取消选择</el-button>
    </div>

    <!-- 设备表格 -->
    <el-card style="margin-top:12px">
      <el-table :data="deviceStore.devices" stripe @selection-change="(rows: DeviceItem[]) => selected = rows" v-loading="deviceStore.loading">
        <el-table-column type="selection" width="45" />
        <el-table-column prop="name" label="设备名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="deviceType" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.deviceType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP地址" width="140" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status) as any" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="channelCount" label="通道数" width="85">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="$router.push(`/devices/${row.id}/channels`)">
              {{ row.channelCount }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="algoPlugin" label="算法插件" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.algoPlugin !== '无'" size="small" type="warning">{{ row.algoPlugin }}</el-tag>
            <span v-else style="color:#8c8c8c">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="syncStatus" label="同步" width="90">
          <template #default="{ row }">
            <el-tag :type="syncTagType(row.syncStatus) as any" size="small">{{ syncLabel(row.syncStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置" width="100" show-overflow-tooltip />
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="$router.push(`/devices/${row.id}`)">详情</el-button>
            <el-button size="small" link type="success" @click="$router.push(`/devices/${row.id}/channels`)">通道</el-button>
            <el-button size="small" link type="success" @click="handleLive(row)">预览</el-button>
            <el-button size="small" link @click="handleSync(row)">同步</el-button>
            <el-button size="small" link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="deviceStore.total"
          :page-sizes="[10,20,50]"
          layout="total,sizes,prev,pager,next"
          @change="fetchData" />
      </div>
    </el-card>

    <!-- 设备统计 -->
    <el-row :gutter="16" style="margin-top:16px" v-if="deviceStore.stats">
      <el-col :span="4" v-for="s in statCards" :key="s.label">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- GB28181 SIP 服务器配置 -->
    <el-card v-if="sipConfig?.enabled" v-loading="sipConfigLoading" style="margin-top:16px">
      <template #header>
        <div style="display:flex;align-items:center;gap:8px">
          <el-tag type="primary" size="small">GB/T 28181</el-tag>
          <span style="font-weight:600">SIP 服务器配置</span>
          <el-tag v-if="(sipConfig as any).sip_server_running" type="success" size="small" effect="dark">运行中</el-tag>
          <el-tag v-else type="danger" size="small" effect="dark">已停止</el-tag>
        </div>
      </template>
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item label="SIP 服务器 ID">{{ sipConfig.sipServerId }}</el-descriptions-item>
        <el-descriptions-item label="SIP 服务器域">{{ sipConfig.sipServerDomain }}</el-descriptions-item>
        <el-descriptions-item label="SIP Realm">{{ sipConfig.sipRealm }}</el-descriptions-item>
        <el-descriptions-item label="监听地址">{{ sipConfig.sipServerIp }}:{{ sipConfig.sipServerPort }}</el-descriptions-item>
        <el-descriptions-item label="传输协议">{{ sipConfig.transportProtocol }}</el-descriptions-item>
        <el-descriptions-item label="RTP 端口范围">{{ sipConfig.rtpPortRange }}</el-descriptions-item>
        <el-descriptions-item label="Digest 鉴权">
          <el-tag :type="(sipConfig as any).auth_enabled ? 'success' : 'info'" size="small">
            {{ (sipConfig as any).auth_enabled ? '已启用' : '未启用' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="SIP 超时">{{ sipConfig.sipTimeoutSec }} 秒</el-descriptions-item>
        <el-descriptions-item label="已注册设备">{{ sipConfig.registeredDevices }} 台</el-descriptions-item>
        <el-descriptions-item label="活跃会话">{{ sipConfig.activeSessions }}</el-descriptions-item>
        <el-descriptions-item label="级联注册">
          <el-tag :type="sipConfig.cascadeRegistered ? 'success' : 'info'" size="small">
            {{ sipConfig.cascadeRegistered ? '已注册到上级' : '未级联' }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
      <!-- 级联详情 -->
      <template v-if="(sipConfig as any).cascade?.enabled">
        <el-divider content-position="left">级联配置</el-divider>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="上级 SIP IP">{{ (sipConfig.cascade as any)?.superior_sip_server_ip || '-' }}:{{ (sipConfig.cascade as any)?.superior_sip_server_port }}</el-descriptions-item>
          <el-descriptions-item label="上级 SIP ID">{{ (sipConfig.cascade as any)?.superior_sip_id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="上级 SIP 域">{{ (sipConfig.cascade as any)?.superior_sip_domain || '-' }}</el-descriptions-item>
          <el-descriptions-item label="本机 SIP ID">{{ (sipConfig.cascade as any)?.local_sip_id || '-' }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-card>

    <!-- 设备发现对话框 -->
    <el-dialog v-model="showDiscoverDialog" :title="`设备发现 - ${discoverMethodLabel}`" width="760px" @closed="discoveredDevices = []">
      <div v-loading="discoverLoading">
        <div v-if="!discoverLoading && discoveredDevices.length === 0" style="text-align:center;padding:40px;color:#8c8c8c">
          <el-empty v-if="discoverFinished" description="未发现设备" />
          <span v-else>点击「开始扫描」搜索网络中的设备</span>
        </div>
        <el-table v-if="discoveredDevices.length" :data="discoveredDevices" stripe max-height="400">
          <el-table-column prop="id" label="设备 ID" min-width="200" show-overflow-tooltip />
          <el-table-column prop="name" label="设备名称" min-width="120" show-overflow-tooltip />
          <el-table-column prop="ip" label="IP 地址" width="130" />
          <el-table-column prop="port" label="端口" width="70" />
          <el-table-column prop="vendor" label="厂商" width="80" />
          <el-table-column prop="model" label="型号" width="80" show-overflow-tooltip />
          <el-table-column prop="protocol" label="协议" width="90">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ row.protocol }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="channels" label="通道" width="60" />
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="quickAddFromDiscover(row)">添加</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="showDiscoverDialog = false">关闭</el-button>
        <el-button type="primary" :loading="discoverLoading" @click="runDiscoverScan">
          <el-icon><Search /></el-icon>{{ discoverLoading ? '扫描中...' : '开始扫描' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 添加设备对话框 -->
    <el-dialog v-model="showAddDialog" title="添加设备" width="640px" @closed="resetAddForm">
      <el-form :model="addForm" label-width="110px">
        <!-- 协议选择 -->
        <el-form-item label="接入协议">
          <el-select v-model="addForm.protocol" style="width:100%" @change="onProtocolChange">
            <el-option v-for="opt in PROTOCOL_OPTIONS" :key="opt.value"
              :label="opt.label" :value="opt.value">
              <span>{{ opt.label }}</span>
              <span style="float:right;color:#8c8c8c;font-size:12px">{{ opt.description }}</span>
            </el-option>
          </el-select>
        </el-form-item>

        <!-- 基本信息 -->
        <el-divider content-position="left">基本信息</el-divider>
        <el-form-item label="设备名称" required>
          <el-input v-model="addForm.name" placeholder="e.g. 大门入口摄像头" />
        </el-form-item>
        <el-form-item label="设备 ID" required>
          <el-input v-model="addForm.deviceId" :placeholder="addForm.protocol === 'GB28181' ? '20位国标编码，如 34020000001320000013' : '自动生成或手动输入'" />
        </el-form-item>
        <el-form-item label="设备类型">
          <el-select v-model="addForm.deviceType" style="width:100%">
            <el-option label="IPCamera" value="IPCamera" />
            <el-option label="NVR" value="NVR" />
            <el-option label="DVR" value="DVR" />
            <el-option label="EdgeBox" value="EdgeBox" />
          </el-select>
        </el-form-item>
        <el-form-item label="IP 地址">
          <el-input v-model="addForm.ip" placeholder="192.168.1.100" />
        </el-form-item>
        <el-form-item :label="portLabel">
          <el-input-number v-model="addForm.rtspPort" :min="1" :max="65535" />
        </el-form-item>

        <!-- RTSP 参数 -->
        <template v-if="addForm.protocol === 'RTSP'">
          <el-divider content-position="left">RTSP 流参数</el-divider>
          <el-form-item label="流地址">
            <el-input v-model="addForm.protocolConfig.streamUrl" placeholder="rtsp://192.168.1.100:554/stream1" />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input v-model="addForm.protocolConfig.rtspUsername" placeholder="admin" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="addForm.protocolConfig.rtspPassword" placeholder="****" show-password />
          </el-form-item>
          <el-form-item label="传输模式">
            <el-select v-model="addForm.protocolConfig.transportMode" style="width:100%">
              <el-option label="TCP" value="tcp" />
              <el-option label="UDP" value="udp" />
              <el-option label="组播" value="multicast" />
            </el-select>
          </el-form-item>
        </template>

        <!-- ONVIF 参数 -->
        <template v-if="addForm.protocol === 'ONVIF'">
          <el-divider content-position="left">ONVIF 参数</el-divider>
          <el-form-item label="ONVIF 用户名">
            <el-input v-model="addForm.protocolConfig.onvifUsername" placeholder="admin" />
          </el-form-item>
          <el-form-item label="ONVIF 密码">
            <el-input v-model="addForm.protocolConfig.onvifPassword" placeholder="****" show-password />
          </el-form-item>
          <el-form-item label="发现范围">
            <el-input v-model="addForm.protocolConfig.onvifDiscoveryRange" placeholder="192.168.1.0/24" />
          </el-form-item>
          <el-form-item>
            <el-button :loading="discovering" @click="handleDiscover('onvif')">
              <el-icon><Search /></el-icon>搜索ONVIF设备
            </el-button>
          </el-form-item>
          <el-form-item v-if="discoveredList.length" label="发现设备">
            <el-select v-model="selectedDiscovered" style="width:100%" placeholder="选择发现的设备" @change="onDiscoverSelect">
              <el-option v-for="d in discoveredList" :key="d.id" :label="`${d.name} (${d.ip}:${d.port})`" :value="d.id as any" />
            </el-select>
          </el-form-item>
        </template>

        <!-- GB28181 参数 -->
        <template v-if="addForm.protocol === 'GB28181'">
          <el-divider content-position="left">GB/T 28181 参数</el-divider>
          <el-form-item label="SIP 服务器ID">
            <el-input v-model="addForm.protocolConfig.sipServerId" placeholder="34020000002000000001" />
          </el-form-item>
          <el-form-item label="SIP 服务器域">
            <el-input v-model="addForm.protocolConfig.sipServerDomain" placeholder="3402000000" />
          </el-form-item>
          <el-form-item label="SIP 服务器IP">
            <el-input v-model="addForm.protocolConfig.sipServerIp" placeholder="192.168.1.1" />
          </el-form-item>
          <el-form-item label="SIP 服务器端口">
            <el-input-number v-model="addForm.protocolConfig.sipServerPort" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="SIP 密码">
            <el-input v-model="addForm.protocolConfig.sipPassword" placeholder="****" show-password />
          </el-form-item>
          <el-form-item label="设备国标ID">
            <el-input v-model="addForm.protocolConfig.gbDeviceId" placeholder="34020000001310000001" />
          </el-form-item>
          <el-form-item label="通道 ID">
            <el-input v-model="addForm.protocolConfig.gbChannelId" placeholder="34020000001310000001" />
          </el-form-item>
          <el-form-item>
            <el-button :loading="discovering" @click="handleDiscover('gb28181')">
              <el-icon><Search /></el-icon>查询设备目录
            </el-button>
          </el-form-item>
        </template>

        <!-- eHome 参数 -->
        <template v-if="addForm.protocol === 'EHOME'">
          <el-divider content-position="left">eHome 参数</el-divider>
          <el-form-item label="服务器地址">
            <el-input v-model="addForm.protocolConfig.ehomeServerAddr" placeholder="192.168.1.1" />
          </el-form-item>
          <el-form-item label="服务器端口">
            <el-input-number v-model="addForm.protocolConfig.ehomeServerPort" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="设备序列号">
            <el-input v-model="addForm.protocolConfig.ehomeDeviceSerial" placeholder="DS-2CD2T47G2-L20210601CCCH" />
          </el-form-item>
          <el-form-item label="认证密钥">
            <el-input v-model="addForm.protocolConfig.ehomeAuthKey" placeholder="****" show-password />
          </el-form-item>
        </template>

        <!-- 大华私有协议参数 -->
        <template v-if="addForm.protocol === 'DAHUA'">
          <el-divider content-position="left">大华私有协议参数</el-divider>
          <el-form-item label="厂商参数">
            <el-input v-model="addForm.protocolConfig.dahuaVendorParam" placeholder="特定厂商配置参数" />
          </el-form-item>
          <el-form-item label="连接模式">
            <el-select v-model="addForm.protocolConfig.dahuaConnectionMode" style="width:100%">
              <el-option label="TCP 直连" value="tcp" />
              <el-option label="平台接入" value="platform" />
              <el-option label="P2P" value="p2p" />
            </el-select>
          </el-form-item>
          <el-form-item label="用户名">
            <el-input v-model="addForm.protocolConfig.rtspUsername" placeholder="admin" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="addForm.protocolConfig.rtspPassword" placeholder="****" show-password />
          </el-form-item>
        </template>

        <!-- 通用配置 -->
        <el-divider content-position="left">通用配置</el-divider>
        <el-form-item label="所属项目">
          <el-select v-model="addForm.projectId" style="width:100%">
            <el-option label="智慧园区" value="park" />
            <el-option label="智慧工地" value="site" />
            <el-option label="智慧社区" value="community" />
          </el-select>
        </el-form-item>
        <el-form-item label="安装位置">
          <el-input v-model="addForm.location" placeholder="e.g. 南门岗亭" />
        </el-form-item>
        <el-form-item label="算法插件">
          <el-select v-model="addForm.algoPlugin" style="width:100%">
            <el-option label="无" value="无" />
            <el-option label="入侵检测" value="入侵检测" />
            <el-option label="烟火检测" value="烟火检测" />
            <el-option label="安全帽检测" value="安全帽检测" />
            <el-option label="人脸检测" value="人脸检测" />
            <el-option label="徘徊检测" value="徘徊检测" />
            <el-option label="车牌识别" value="车牌识别" />
          </el-select>
        </el-form-item>
        <el-form-item label="配置模板">
          <el-select v-model="addForm.templateId" style="width:100%" clearable placeholder="可选">
            <el-option v-for="t in deviceStore.templates" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="addLoading" @click="confirmAdd">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import { ElMessage, ElMessageBox } from 'element-plus'
import { discoverDevices, getGB28181Config } from '@/api/devices'
import type { DeviceItem, ProtocolType, DiscoveredDevice } from '@/types/device'
import type { GB28181Config } from '@/api/devices'
import { PROTOCOL_OPTIONS } from '@/types/device'

const router = useRouter()
const deviceStore = useDeviceStore()

// ---- 表格/筛选 ----
const search = ref('')
const statusFilter = ref('')
const typeFilter = ref('')
const projectFilter = ref('')
const page = ref(1)
const pageSize = ref(10)
const selected = ref<DeviceItem[]>([])

// ---- 添加对话框 ----
const showAddDialog = ref(false)
const addLoading = ref(false)
const discovering = ref(false)
const discoveredList = ref<DiscoveredDevice[]>([])
const selectedDiscovered = ref('')

const emptyProtocolConfig = () => ({
  streamUrl: '', rtspUsername: '', rtspPassword: '', transportMode: 'tcp' as const,
  onvifUsername: '', onvifPassword: '', onvifDiscoveryRange: '', onvifProfileToken: '',
  sipServerId: '', sipServerDomain: '', sipServerIp: '', sipServerPort: 5060, sipPassword: '',
  gbDeviceId: '', gbChannelId: '',
  ehomeServerAddr: '', ehomeServerPort: 15060, ehomeDeviceSerial: '', ehomeAuthKey: '',
  dahuaVendorParam: '', dahuaConnectionMode: 'tcp',
})

const addForm = ref({
  name: '', deviceId: '', deviceType: 'IPCamera' as string, projectId: 'park',
  ip: '', rtspPort: 554, location: '', algoPlugin: '无', templateId: '',
  protocol: 'RTSP' as ProtocolType,
  protocolConfig: emptyProtocolConfig(),
})

const portLabel = computed(() => {
  const opt = PROTOCOL_OPTIONS.find(o => o.value === addForm.value.protocol)
  return `端口 (默认:${opt?.defaultPort ?? 554})`
})

// ---- 设备发现对话框 ----
const showDiscoverDialog = ref(false)
const discoverLoading = ref(false)
const discoverFinished = ref(false)
const discoverMethod = ref<'onvif' | 'gb28181'>('onvif')
const discoveredDevices = ref<DiscoveredDevice[]>([])

const discoverMethodLabel = computed(() => {
  return discoverMethod.value === 'onvif' ? 'ONVIF' : 'GB/T 28181'
})

function handleToolbarDiscover(method: 'onvif' | 'gb28181') {
  discoverMethod.value = method
  discoveredDevices.value = []
  discoverFinished.value = false
  showDiscoverDialog.value = true
  // 自动开始扫描
  runDiscoverScan()
}

async function runDiscoverScan() {
  discoverLoading.value = true
  discoveredDevices.value = []
  try {
    const res = await discoverDevices(discoverMethod.value) as any
    const list: DiscoveredDevice[] = res?.data?.data ?? res?.data ?? res
    discoveredDevices.value = list
    discoverFinished.value = true
    if (list.length) ElMessage.success(`发现 ${list.length} 台设备`)
    else ElMessage.info('未发现设备')
  } catch {
    ElMessage.error('设备发现失败')
  } finally {
    discoverLoading.value = false
  }
}

function quickAddFromDiscover(d: DiscoveredDevice) {
  // 预填充添加对话框
  addForm.value.protocol = d.protocol as ProtocolType
  addForm.value.ip = d.ip ?? ''
  addForm.value.rtspPort = d.port ?? 554
  addForm.value.name = d.name || `${d.vendor || ''} ${d.model || ''}`.trim() || (d.id ?? '')
  addForm.value.deviceId = d.id ?? ''  // 预填设备 ID
  onProtocolChange(d.protocol as ProtocolType)
  // GB28181 设备预填国标ID
  if (d.protocol === 'GB28181') {
    addForm.value.protocolConfig.gbDeviceId = d.id ?? ''
    addForm.value.protocolConfig.gbChannelId = d.id ?? ''
  }
  showDiscoverDialog.value = false
  showAddDialog.value = true
}

// ---- 统计卡片 ----
const statCards = computed(() => {
  const s = deviceStore.stats
  if (!s) return []
  return [
    { label: '总设备', value: s.total, color: '#1890ff' },
    { label: '在线', value: s.online, color: '#52c41a' },
    { label: '离线', value: s.offline, color: '#d9d9d9' },
    { label: '告警中', value: s.alarming, color: '#f5222d' },
    { label: '维护中', value: s.maintenance, color: '#fa8c16' },
    { label: '在线率', value: s.onlineRate.toFixed(1) + '%', color: '#722ed1' },
  ]
})

// ---- SIP 配置 ----
const sipConfig = ref<GB28181Config | null>(null)
const sipConfigLoading = ref(false)

async function fetchSipConfig() {
  sipConfigLoading.value = true
  try {
    const res = await getGB28181Config() as any
    sipConfig.value = res?.data?.data ?? res?.data ?? res
  } catch { /* GB28181 未启用时忽略 */ }
  finally { sipConfigLoading.value = false }
}

// ---- 状态标签 ----
function statusTagType(s: string) {
  const m: Record<string, string> = { online: 'success', offline: 'danger', alarming: 'warning', maintenance: 'info' }
  return m[s] ?? 'info'
}
function statusLabel(s: string) {
  const m: Record<string, string> = { online: '在线', offline: '离线', alarming: '告警中', maintenance: '维护中' }
  return m[s] ?? s
}
function syncTagType(s: string) {
  const m: Record<string, string> = { synced: 'success', syncing: 'warning', pending: 'info', conflict: 'danger', offline: 'info' }
  return m[s] ?? 'info'
}
function syncLabel(s: string) {
  const m: Record<string, string> = { synced: '已同步', syncing: '同步中', pending: '待同步', conflict: '冲突', offline: '离线' }
  return m[s] ?? s
}

// ---- 协议切换 ----
function onProtocolChange(proto: ProtocolType) {
  discoveredList.value = []
  selectedDiscovered.value = ''
  addForm.value.protocolConfig = emptyProtocolConfig()
  const opt = PROTOCOL_OPTIONS.find(o => o.value === proto)
  if (opt) addForm.value.rtspPort = opt.defaultPort ?? 554
}

// ---- 设备发现 ----
async function handleDiscover(method: 'onvif' | 'gb28181') {
  discovering.value = true
  discoveredList.value = []
  try {
    const res = await discoverDevices(method) as any
    const list: DiscoveredDevice[] = res?.data?.data ?? res?.data ?? res
    discoveredList.value = list
    if (list.length) ElMessage.success(`发现 ${list.length} 台设备`)
    else ElMessage.info('未发现设备')
  } catch { ElMessage.error('设备发现失败') }
  finally { discovering.value = false }
}

function onDiscoverSelect(deviceId: string) {
  const d = discoveredList.value.find(d => d.id === deviceId)
  if (!d) return
  addForm.value.ip = d.ip ?? ''
  addForm.value.rtspPort = d.port ?? 554
  addForm.value.name = d.name ?? ''
}

// ---- 数据请求 ----
function fetchData() {
  deviceStore.fetchDevices({
    page: page.value, pageSize: pageSize.value,
    keyword: search.value, status: statusFilter.value as any,
    deviceType: typeFilter.value as any, projectId: projectFilter.value
  })
  deviceStore.fetchStats()
}

function onSearch() { page.value = 1; fetchData() }

// ---- 设备操作 ----
function handleLive(row: DeviceItem) {
  router.push(`/live?deviceId=${row.id}`)
}
async function handleSync(row: DeviceItem) {
  try { await deviceStore.syncDevice(row.id); ElMessage.success(`设备 ${row.name} 同步指令已发送`) }
  catch { ElMessage.error('同步失败') }
}
async function handleDelete(row: DeviceItem) {
  try {
    await ElMessageBox.confirm(`确认删除设备 "${row.name}" ？`, '删除确认', { type: 'warning' })
    await deviceStore.removeDevice(row.id)
    ElMessage.success('已删除')
  } catch { /* cancelled */ }
}

// ---- 批量操作 ----
async function batchReboot() {
  try {
    await ElMessageBox.confirm(`确认重启 ${selected.value.length} 台设备？`, '批量重启', { type: 'warning' })
    for (const d of selected.value) await deviceStore.reboot(d.id)
    ElMessage.success('批量重启指令已发送')
    selected.value = []
  } catch { /* cancelled */ }
}
async function batchSync() {
  for (const d of selected.value) await deviceStore.syncDevice(d.id)
  ElMessage.success(`已对 ${selected.value.length} 台设备发送同步指令`)
  selected.value = []
}
async function batchDelete() {
  try {
    await ElMessageBox.confirm(`确认删除 ${selected.value.length} 台设备？此操作不可恢复！`, '批量删除', { type: 'error' })
    for (const d of selected.value) await deviceStore.removeDevice(d.id)
    ElMessage.success('批量删除完成')
    selected.value = []
  } catch { /* cancelled */ }
}

// ---- 添加设备 ----
async function confirmAdd() {
  addLoading.value = true
  try {
    // 使用表单输入的 device_id，为空时自动生成
    let deviceId = addForm.value.deviceId.trim()
    if (!deviceId) {
      if (addForm.value.protocol === 'GB28181' && addForm.value.protocolConfig.gbDeviceId) {
        deviceId = addForm.value.protocolConfig.gbDeviceId
      } else {
        deviceId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      }
    }
    const data: any = {
      device_id: deviceId,
      device_name: addForm.value.name || deviceId,
      device_type: addForm.value.deviceType,
      vendor: '',
      model: '',
      ip_address: addForm.value.ip,
      port: addForm.value.rtspPort,
      channel_count: 1,
      config: {
        protocol: addForm.value.protocol,
        location: addForm.value.location,
        algo_plugin: addForm.value.algoPlugin,
        project_id: addForm.value.projectId,
        ...Object.fromEntries(
          Object.entries(addForm.value.protocolConfig).filter(([, v]) => v !== '' && v !== undefined)
        ),
      },
    }
    await deviceStore.addDevice(data as any)
    ElMessage.success('设备添加成功')
    showAddDialog.value = false
    fetchData()
  } catch { ElMessage.error('添加失败') }
  finally { addLoading.value = false }
}

function resetAddForm() {
  addForm.value = {
    name: '', deviceId: '', deviceType: 'IPCamera', projectId: 'park',
    ip: '', rtspPort: 554, location: '', algoPlugin: '无', templateId: '',
    protocol: 'RTSP',
    protocolConfig: emptyProtocolConfig(),
  }
  discoveredList.value = []
  selectedDiscovered.value = ''
}

onMounted(() => {
  fetchData()
  deviceStore.fetchTemplates()
  fetchSipConfig()
})
</script>

<style scoped>
.devices-page { padding: 0 4px; }
.toolbar-card { margin-bottom: 0; }
.toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.toolbar-left { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.toolbar-right { display: flex; gap: 8px; }
.batch-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; margin-top: 12px;
  background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 6px;
}
.stat-card { text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; }
.stat-label { font-size: 13px; color: #8c8c8c; margin-top: 4px; }
</style>
