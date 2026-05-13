<template>
  <div class="device-detail-page">
    <!-- 返回栏 -->
    <div class="page-header">
      <el-button link @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>返回设备列表
      </el-button>
      <div class="header-actions">
        <el-button @click="handleSync" :loading="syncing">
          <el-icon><Refresh /></el-icon>同步
        </el-button>
        <el-button type="primary" @click="showConfigDrawer = true">
          <el-icon><Setting /></el-icon>配置
        </el-button>
      </div>
    </div>

    <!-- 设备概览卡片 -->
    <el-row :gutter="16" v-if="device">
      <el-col :span="6">
        <el-card shadow="hover" class="info-card">
          <div class="info-row">
            <span class="label">设备名称</span>
            <span class="value">{{ device.name }}</span>
          </div>
          <div class="info-row">
            <span class="label">设备类型</span>
            <el-tag size="small">{{ device.deviceType }}</el-tag>
          </div>
          <div class="info-row">
            <span class="label">接入协议</span>
            <el-tag size="small" effect="dark" type="primary">{{ protocolLabel }}</el-tag>
          </div>
          <div class="info-row">
            <span class="label">IP地址</span>
            <span class="value">{{ device.ip }}:{{ device.rtspPort }}</span>
          </div>
          <div class="info-row">
            <span class="label">运行状态</span>
            <el-tag :type="statusTagType(device.status)" size="small">{{ statusLabel(device.status) }}</el-tag>
          </div>
          <div class="info-row">
            <span class="label">所属项目</span>
            <span class="value">{{ device.projectName }}</span>
          </div>
          <div class="info-row">
            <span class="label">安装位置</span>
            <span class="value">{{ device.location || '-' }}</span>
          </div>
        </el-card>
      </el-col>

      <!-- 实时指标 -->
      <el-col :span="12">
        <el-card header="实时指标" class="metrics-card">
          <el-row :gutter="12">
            <el-col :span="8" v-for="m in metricItems" :key="m.label">
              <div class="metric-item">
                <div class="metric-value" :style="{ color: m.color }">{{ m.value }}</div>
                <div class="metric-label">{{ m.label }}</div>
                <el-progress
                  :percentage="m.percent"
                  :color="m.color"
                  :stroke-width="6"
                  :show-text="false"
                />
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>

      <!-- 同步状态 -->
      <el-col :span="6">
        <el-card header="云端同步" class="sync-card">
          <div class="sync-status">
            <el-tag :type="syncTagType" size="large">{{ syncLabel }}</el-tag>
          </div>
          <div class="sync-detail">
            <div class="info-row">
              <span class="label">上次同步</span>
              <span class="value">{{ device.lastSyncAt || '从未' }}</span>
            </div>
            <div class="info-row">
              <span class="label">固件版本</span>
              <span class="value">{{ device.firmwareVer }}</span>
            </div>
            <div class="info-row">
              <span class="label">硬件型号</span>
              <span class="value">{{ device.hardwareModel }}</span>
            </div>
            <div class="info-row">
              <span class="label">运行时间</span>
              <span class="value">{{ device.uptime }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 通道列表 -->
    <el-card style="margin-top: 16px" v-if="device?.channels">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>视频通道</span>
          <el-button size="small" type="primary" link @click="$router.push(`/devices/${device?.id}/channels`)">
            <el-icon><Grid /></el-icon>通道管理
          </el-button>
        </div>
      </template>
      <el-table :data="device.channels" stripe>
        <el-table-column prop="channelNo" label="通道号" width="80" />
        <el-table-column prop="name" label="通道名称" width="180" />
        <el-table-column prop="rtspUrl" label="RTSP地址" min-width="220" />
        <el-table-column prop="algoPlugin" label="算法插件" width="140">
          <template #default="{ row }">
            <el-tag v-if="row.algoPlugin !== '无'" type="info" size="small">{{ row.algoPlugin }}</el-tag>
            <span v-else style="color: #8c8c8c">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="fps" label="帧率" width="70" />
        <el-table-column prop="resolution" label="分辨率" width="100" />
        <el-table-column prop="bitrate" label="码率" width="80" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'streaming' ? 'success' : row.status === 'error' ? 'danger' : 'info'" size="small">
              {{ row.status === 'streaming' ? '推流中' : row.status === 'error' ? '异常' : '空闲' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="handlePreview(row)">预览</el-button>
            <el-button size="small" link @click="handleChannelConfig(row)">配置</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 指标趋势图 -->
    <el-row :gutter="16" style="margin-top: 16px" v-if="metricsHistory.length">
      <el-col :span="12">
        <el-card header="CPU / 内存 / GPU 趋势">
          <LazyChart :option="resourceChartOption" height="260px" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="网络延迟 & 温度">
          <LazyChart :option="networkChartOption" height="260px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 同步记录 -->
    <el-card header="同步记录" style="margin-top: 16px">
      <el-table :data="syncRecords" stripe>
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.type === 'alarm' ? 'danger' : row.type === 'model' ? 'warning' : 'info'" size="small">
              {{ syncTypeLabel(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="direction" label="方向" width="80">
          <template #default="{ row }">
            <span>{{ row.direction === 'upload' ? '⬆ 上传' : '⬇ 下发' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="progress" label="进度" width="150">
          <template #default="{ row }">
            <el-progress :percentage="row.progress" :status="row.status === 'failed' ? 'exception' : undefined" />
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'" size="small">
              {{ row.status === 'success' ? '成功' : row.status === 'failed' ? '失败' : '进行中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="startedAt" label="开始时间" width="170" />
        <el-table-column prop="details" label="详情" min-width="160" />
      </el-table>
    </el-card>

    <!-- 配置抽屉 -->
    <el-drawer v-model="showConfigDrawer" title="设备配置" size="480px">
      <el-form :model="configForm" label-width="110px">
        <el-form-item label="算法插件">
          <el-select v-model="configForm.algoPlugin" style="width:100%">
            <el-option label="入侵检测" value="入侵检测" />
            <el-option label="烟火检测" value="烟火检测" />
            <el-option label="安全帽检测" value="安全帽检测" />
            <el-option label="人脸检测" value="人脸检测" />
            <el-option label="徘徊检测" value="徘徊检测" />
            <el-option label="车牌识别" value="车牌识别" />
          </el-select>
        </el-form-item>
        <el-form-item label="录像留存天数">
          <el-input-number v-model="configForm.recordDays" :min="1" :max="90" />
        </el-form-item>
        <el-form-item label="告警灵敏度">
          <el-slider v-model="configForm.sensitivity" :min="1" :max="10" show-stops />
        </el-form-item>
        <el-form-item label="心跳间隔(秒)">
          <el-input-number v-model="configForm.heartbeatInterval" :min="10" :max="300" />
        </el-form-item>
        <el-form-item label="定时重启">
          <el-switch v-model="configForm.scheduledReboot" />
        </el-form-item>
        <el-form-item v-if="configForm.scheduledReboot" label="重启时间">
          <el-time-picker v-model="configForm.rebootTime" format="HH:mm" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
          <el-button @click="showConfigDrawer = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import { ElMessage, ElMessageBox } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import { PROTOCOL_OPTIONS } from '@/types/device'
import type { DeviceDetail, DeviceSyncRecord, DeviceMetrics } from '@/types/device'

const route = useRoute()
const router = useRouter()
const deviceStore = useDeviceStore()

const device = computed(() => deviceStore.currentDevice)
const syncRecords = ref<DeviceSyncRecord[]>([])
const metricsHistory = ref<DeviceMetrics[]>([])
const syncing = ref(false)
const saving = ref(false)
const showConfigDrawer = ref(false)

const configForm = ref({
  algoPlugin: '入侵检测',
  recordDays: 30,
  sensitivity: 5,
  heartbeatInterval: 30,
  scheduledReboot: false,
  rebootTime: new Date(2024, 0, 1, 3, 0)
})

// 协议标签
const protocolLabel = computed(() => {
  const proto = device.value?.protocol ?? device.value?.config?.protocol ?? 'RTSP'
  const opt = PROTOCOL_OPTIONS.find(o => o.value === proto)
  return opt?.label ?? proto
})

// ---- 实时指标 ----
const metricItems = computed(() => {
  const m = deviceStore.latestMetrics
  if (!m) return []
  return [
    { label: 'CPU', value: `${m.cpuUsage}%`, percent: m.cpuUsage, color: m.cpuUsage > 80 ? '#f5222d' : '#1890ff' },
    { label: '内存', value: `${m.memoryUsage}%`, percent: m.memoryUsage, color: m.memoryUsage > 80 ? '#f5222d' : '#52c41a' },
    { label: 'GPU', value: `${m.gpuUsage}%`, percent: m.gpuUsage, color: '#722ed1' },
    { label: '磁盘', value: `${m.diskUsage}%`, percent: m.diskUsage, color: m.diskUsage > 90 ? '#f5222d' : '#faad14' },
    { label: '温度', value: `${m.temperature}°C`, percent: Math.min(m.temperature * 1.2, 100), color: m.temperature > 75 ? '#f5222d' : '#52c41a' },
    { label: 'RTT', value: `${m.networkRtt}ms`, percent: Math.min(m.networkRtt / 5, 100), color: m.networkRtt < 50 ? '#52c41a' : '#faad14' }
  ]
})

// ---- 图表 ----
const resourceChartOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['CPU %', '内存 %', 'GPU %'] },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: { type: 'category' as const, data: metricsHistory.value.map(m => m.timestamp.slice(11, 16)) },
  yAxis: { type: 'value' as const, max: 100 },
  series: [
    { name: 'CPU %', type: 'line', smooth: true, data: metricsHistory.value.map(m => m.cpuUsage), itemStyle: { color: '#1890ff' } },
    { name: '内存 %', type: 'line', smooth: true, data: metricsHistory.value.map(m => m.memoryUsage), itemStyle: { color: '#52c41a' } },
    { name: 'GPU %', type: 'line', smooth: true, data: metricsHistory.value.map(m => m.gpuUsage), itemStyle: { color: '#722ed1' } }
  ]
}))

const networkChartOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['RTT (ms)', '温度 (°C)'] },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: { type: 'category' as const, data: metricsHistory.value.map(m => m.timestamp.slice(11, 16)) },
  yAxis: [
    { type: 'value' as const, name: 'ms' },
    { type: 'value' as const, name: '°C' }
  ],
  series: [
    { name: 'RTT (ms)', type: 'line', smooth: true, data: metricsHistory.value.map(m => m.networkRtt), itemStyle: { color: '#fa8c16' } },
    { name: '温度 (°C)', type: 'line', smooth: true, yAxisIndex: 1, data: metricsHistory.value.map(m => m.temperature), itemStyle: { color: '#f5222d' } }
  ]
}))

// ---- 辅助 ----
function statusTagType(s: string) {
  const m: Record<string, string> = { online: 'success', offline: 'danger', alarming: 'warning', maintenance: 'info' }
  return m[s] ?? 'info'
}

function statusLabel(s: string) {
  const m: Record<string, string> = { online: '在线', offline: '离线', alarming: '告警中', maintenance: '维护中' }
  return m[s] ?? s
}

const syncTagType = computed(() => {
  const m: Record<string, string> = { synced: 'success', syncing: 'warning', pending: 'info', conflict: 'danger', offline: 'info' }
  return m[device.value?.syncStatus ?? 'offline']
})

const syncLabel = computed(() => {
  const m: Record<string, string> = { synced: '已同步', syncing: '同步中', pending: '待同步', conflict: '冲突', offline: '离线' }
  return m[device.value?.syncStatus ?? 'offline']
})

function syncTypeLabel(t: string) {
  const m: Record<string, string> = { config: '配置', alarm: '告警', model: '模型', log: '日志' }
  return m[t] ?? t
}

// ---- 操作 ----
async function handleSync() {
  if (!device.value) return
  syncing.value = true
  try {
    await deviceStore.syncDevice(device.value.id)
    ElMessage.success('同步指令已发送')
    await loadData()
  } finally {
    syncing.value = false
  }
}

function handlePreview(channel: any) {
  router.push(`/live?deviceId=${device.value?.id}&channel=${channel.channelNo}`)
}

function handleChannelConfig(channel: any) {
  ElMessage.info(`配置通道 ${channel.name}`)
}

async function saveConfig() {
  saving.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 600))
    ElMessage.success('配置已保存')
    showConfigDrawer.value = false
  } finally {
    saving.value = false
  }
}

async function loadData() {
  const deviceId = route.params.id as string
  if (!deviceId) return
  try {
    await Promise.all([
      deviceStore.fetchDeviceDetail(deviceId),
      deviceStore.fetchDeviceMetrics(deviceId, '1h'),
      deviceStore.fetchLatestMetrics(deviceId),
      deviceStore.fetchSyncRecords({ deviceId })
    ])
    metricsHistory.value = deviceStore.deviceMetrics
    syncRecords.value = deviceStore.syncRecords
  } catch {
    ElMessage.error('加载设备信息失败')
  }
}

onMounted(loadData)
watch(() => route.params.id, loadData)
</script>

<style scoped>
.device-detail-page { padding: 0 4px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.header-actions { display: flex; gap: 8px; }
.info-card .info-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
.info-card .info-row:last-child { border-bottom: none; }
.info-row .label { color: #8c8c8c; font-size: 13px; }
.info-row .value { font-weight: 500; font-size: 13px; }
.metric-item { text-align: center; padding: 8px 4px; }
.metric-value { font-size: 22px; font-weight: 700; }
.metric-label { font-size: 12px; color: #8c8c8c; margin: 4px 0; }
.sync-status { text-align: center; padding: 12px 0; }
.sync-detail { margin-top: 12px; }
</style>
