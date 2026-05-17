<template>
  <div class="settings-page" v-loading="loading">
    <el-tabs tab-position="left">
      <el-tab-pane label="基本设置">
        <el-form :model="basic" label-width="120px">
          <el-form-item label="设备名称">
            <el-input v-model="basic.deviceName" style="width: 300px" />
          </el-form-item>
          <el-form-item label="日志级别">
            <el-select v-model="basic.logLevel" style="width: 200px">
              <el-option label="DEBUG" value="debug" />
              <el-option label="INFO" value="info" />
              <el-option label="WARN" value="warn" />
              <el-option label="ERROR" value="error" />
            </el-select>
          </el-form-item>
          <el-form-item label="最大通道数">
            <el-input-number v-model="basic.maxChannels" :min="1" :max="32" />
          </el-form-item>
          <el-form-item label="录像保留(天)">
            <el-input-number v-model="basic.recordRetentionDays" :min="1" :max="365" />
          </el-form-item>
          <el-form-item label="NTP时间服务器">
            <el-input v-model="basic.ntpServer" style="width: 300px" placeholder="ntp.aliyun.com" />
          </el-form-item>
          <el-form-item label="数据保留天数">
            <el-input-number v-model="basic.dataRetentionDays" :min="1" :max="365" />
          </el-form-item>
          <el-form-item label="异常自动重启">
            <el-switch v-model="basic.autoRestart" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveBasic" :loading="basicSaving">保存</el-button>
            <el-button @click="resetBasic">重置</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="网络 & 云端">
        <!-- 网络配置 -->
        <h4 style="margin-bottom:16px;color:#303133">网络配置</h4>
        <el-form :model="network" label-width="130px" style="max-width:680px;margin-bottom:24px">
          <el-form-item label="主机名">
            <el-input v-model="network.hostname" style="width:300px" />
          </el-form-item>
          <el-form-item label="IP 模式">
            <el-radio-group v-model="network.ipMode">
              <el-radio value="dhcp">DHCP</el-radio>
              <el-radio value="static">静态 IP</el-radio>
            </el-radio-group>
          </el-form-item>
          <template v-if="network.ipMode === 'static'">
            <el-form-item label="IP 地址">
              <el-input v-model="network.ipAddress" style="width:300px" />
            </el-form-item>
            <el-form-item label="子网掩码">
              <el-input v-model="network.subnetMask" style="width:300px" />
            </el-form-item>
            <el-form-item label="网关">
              <el-input v-model="network.gateway" style="width:300px" />
            </el-form-item>
          </template>
          <el-form-item label="DNS 服务器">
            <div v-for="(dns, idx) in network.dns" :key="idx" style="display:flex;gap:8px;margin-bottom:8px;width:100%">
              <el-input :model-value="dns" @update:model-value="(v: string) => network.dns[idx] = v" style="flex:1" />
              <el-button type="danger" circle size="small" @click="network.dns.splice(idx, 1)">-</el-button>
            </div>
            <el-button size="small" @click="network.dns.push('')">添加 DNS</el-button>
          </el-form-item>
        </el-form>

        <el-divider />

        <!-- MQTT & 云端 -->
        <h4 style="margin-bottom:16px;color:#303133">云端连接</h4>
        <el-form :model="cloud" label-width="130px">
          <el-form-item label="MQTT Broker">
            <el-input v-model="cloud.mqttBroker" style="width: 400px" />
          </el-form-item>
          <el-form-item label="MQTT 端口">
            <el-input-number v-model="cloud.mqttPort" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="心跳间隔(秒)">
            <el-input-number v-model="cloud.heartbeatInterval" :min="10" :max="300" />
          </el-form-item>
          <el-form-item label="TLS加密">
            <el-switch v-model="cloud.tlsEnabled" />
          </el-form-item>
          <el-form-item label="断网缓冲事件上限">
            <el-input-number v-model="cloud.maxOfflineEvents" :min="1000" :max="500000" :step="1000" />
          </el-form-item>
          <el-form-item label="云边同步模式">
            <el-radio-group v-model="cloud.syncMode">
              <el-radio label="auto">自动同步</el-radio>
              <el-radio label="manual">手动同步</el-radio>
              <el-radio label="scheduled">定时同步</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveCloud" :loading="cloudSaving">保存</el-button>
            <el-button @click="testConnection" :loading="testConnLoading">测试连接</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="告警策略">
        <el-form :model="alarm" label-width="150px">
          <el-divider content-position="left">告警规则</el-divider>
          <el-form-item label="告警去重窗口(秒)">
            <el-input-number v-model="alarm.dedupWindow" :min="1" :max="60" />
          </el-form-item>
          <el-form-item label="最低置信度阈值">
            <el-slider v-model="alarm.minConfidence" :min="0.3" :max="0.95" :step="0.05" show-input />
          </el-form-item>
          <el-form-item label="严重告警延迟(ms)">
            <el-input-number v-model="alarm.criticalMaxLatency" :min="100" :max="5000" :step="100" />
          </el-form-item>
          <el-form-item label="联动策略">
            <el-checkbox-group v-model="alarm.linkageActions">
              <el-checkbox label="ptz">PTZ联动</el-checkbox>
              <el-checkbox label="record">启动录像</el-checkbox>
              <el-checkbox label="audio">语音告警</el-checkbox>
              <el-checkbox label="light">灯光联动</el-checkbox>
              <el-checkbox label="sms">短信通知</el-checkbox>
              <el-checkbox label="push">APP推送</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveAlarm" :loading="alarmSaving">保存</el-button>
          </el-form-item>
        </el-form>

        <el-divider />

        <!-- 邮件/Webhook 告警通知（来自 web-console） -->
        <h4 style="margin-bottom:16px;color:#303133">告警通知</h4>
        <el-form :model="alertNotify" label-width="150px" style="max-width:680px">
          <el-form-item label="邮件告警">
            <el-switch v-model="alertNotify.emailEnabled" />
          </el-form-item>
          <el-form-item v-if="alertNotify.emailEnabled" label="收件人">
            <div v-for="(email, idx) in alertNotify.emailRecipients" :key="idx" style="display:flex;gap:8px;margin-bottom:8px;width:100%">
              <el-input :model-value="email" @update:model-value="(v: string) => alertNotify.emailRecipients[idx] = v" style="flex:1" />
              <el-button type="danger" circle size="small" @click="alertNotify.emailRecipients.splice(idx, 1)">-</el-button>
            </div>
            <el-button size="small" @click="alertNotify.emailRecipients.push('')">添加收件人</el-button>
          </el-form-item>
          <el-form-item label="Webhook 告警">
            <el-switch v-model="alertNotify.webhookEnabled" />
          </el-form-item>
          <el-form-item v-if="alertNotify.webhookEnabled" label="Webhook URL">
            <el-input v-model="alertNotify.webhookUrl" style="width:400px" placeholder="https://..." />
          </el-form-item>
          <el-divider content-position="left">资源阈值</el-divider>
          <el-form-item label="CPU 告警阈值 (%)">
            <el-slider v-model="alertNotify.cpuThreshold" :min="50" :max="100" show-input />
          </el-form-item>
          <el-form-item label="内存告警阈值 (%)">
            <el-slider v-model="alertNotify.memThreshold" :min="50" :max="100" show-input />
          </el-form-item>
          <el-form-item label="磁盘告警阈值 (%)">
            <el-slider v-model="alertNotify.diskThreshold" :min="50" :max="100" show-input />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="AI模型管理">
        <!-- AI Agent 开关与置信度（来自 web-console AgentPanel） -->
        <h4 style="margin-bottom:16px;color:#303133">AI Agent 配置</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-bottom:24px">
          <el-card v-for="agent in aiAgents" :key="agent.id" :class="{ 'opacity-60': !agent.enabled }" shadow="hover">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <span style="font-size:15px;font-weight:600">{{ agent.name }}</span>
              <el-switch :model-value="agent.enabled" @change="(v: string | number | boolean) => agent.enabled = !!v" active-text="启用" inactive-text="停用" />
            </div>
            <el-form label-width="80px" size="small">
              <el-form-item label="模型"><el-tag>{{ agent.model }}</el-tag></el-form-item>
              <el-form-item label="置信度">
                <el-slider :model-value="agent.confidence" :min="0" :max="1" :step="0.05" :format-tooltip="(v: number | number[]) => `${Math.round((Array.isArray(v) ? v[0] : v) * 100)}%`" @change="(v: number | number[]) => agent.confidence = Array.isArray(v) ? v[0] : v" :disabled="!agent.enabled" />
              </el-form-item>
              <el-form-item label="帧率"><el-tag type="info">{{ agent.fps }} FPS</el-tag></el-form-item>
            </el-form>
          </el-card>
        </div>

        <el-divider />

        <!-- 模型列表（原有） -->
        <h4 style="margin-bottom:16px;color:#303133">已部署模型</h4>
        <el-table :data="aiModels" stripe v-loading="modelsLoading">
          <el-table-column prop="name" label="模型名称" width="180" />
          <el-table-column prop="version" label="版本" width="80" />
          <el-table-column prop="precision" label="精度" width="80" />
          <el-table-column prop="sizeMB" label="大小(MB)" width="90">
            <template #default="{ row }">{{ (row.size / 1048576).toFixed(0) }}</template>
          </el-table-column>
          <el-table-column prop="inferTimeMs" label="推理(ms)" width="100" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                {{ row.status === 'active' ? '运行中' : row.status === 'loading' ? '加载中' : '已停止' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button v-if="row.status === 'active'" size="small" @click="handleModelAction(row, 'deactivate')">停用</el-button>
              <el-button v-else size="small" type="primary" @click="handleModelAction(row, 'activate')">激活</el-button>
              <el-button size="small" @click="handleModelReload(row)">重载</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="关于">
        <el-descriptions :column="1" border v-if="systemInfo">
          <el-descriptions-item label="产品名称">{{ systemInfo.productName }}</el-descriptions-item>
          <el-descriptions-item label="SDK版本">{{ systemInfo.sdkVersion }}</el-descriptions-item>
          <el-descriptions-item label="Hermes AgentOS">{{ systemInfo.hermesVersion }}</el-descriptions-item>
          <el-descriptions-item label="硬件平台">{{ systemInfo.hardware }}</el-descriptions-item>
          <el-descriptions-item label="架构">{{ systemInfo.architecture }}</el-descriptions-item>
          <el-descriptions-item label="算法插件">{{ systemInfo.algorithmPlugins }}个已部署</el-descriptions-item>
          <el-descriptions-item label="最大通道数">{{ systemInfo.maxChannels }}路 1080P @ 25fps</el-descriptions-item>
          <el-descriptions-item label="推理精度">{{ systemInfo.inferencePrecision }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="加载系统信息失败" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { settingsApi, type BasicSettings, type CloudSettings, type AlarmPolicySettings, type SystemInfo } from '@/api/settings'
import { getModels, activateModel, deactivateModel, type ModelInfo } from '@/api/model'

// ---- 基本设置 ----
const loading = ref(true)
const basicSaving = ref(false)
const basicDefaults: BasicSettings = {
  deviceName: '', logLevel: 'info', maxChannels: 16, recordRetentionDays: 30, ntpServer: 'ntp.aliyun.com',
  dataRetentionDays: 30, autoRestart: true
}
const basic = reactive<BasicSettings>({ ...basicDefaults })

async function saveBasic() {
  basicSaving.value = true
  try {
    await settingsApi.saveBasic({ ...basic })
    ElMessage.success('基本设置已保存')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    basicSaving.value = false
  }
}

function resetBasic() {
  ElMessageBox.confirm('确认重置为默认设置？', '提示', { type: 'warning' })
    .then(() => {
      Object.assign(basic, basicDefaults)
      ElMessage.success('已重置')
    })
}

// ---- 网络配置（来自 web-console ConfigPanel） ----
const network = reactive({
  hostname: 'SmartGateway-01',
  ipMode: 'static' as 'dhcp' | 'static',
  ipAddress: '192.168.1.1',
  subnetMask: '255.255.255.0',
  gateway: '192.168.1.254',
  dns: ['8.8.8.8', '114.114.114.114'],
})

// ---- 云端连接 ----
const cloudSaving = ref(false)
const testConnLoading = ref(false)
const cloudDefaults: CloudSettings = {
  mqttBroker: '', mqttPort: 1883, heartbeatInterval: 30,
  tlsEnabled: true, maxOfflineEvents: 100000, syncMode: 'auto'
}
const cloud = reactive<CloudSettings>({ ...cloudDefaults })

async function saveCloud() {
  cloudSaving.value = true
  try {
    await settingsApi.saveCloud({ ...cloud })
    ElMessage.success('云端连接设置已保存')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    cloudSaving.value = false
  }
}

async function testConnection() {
  testConnLoading.value = true
  try {
    const res = await settingsApi.testConnection({
      mqttBroker: cloud.mqttBroker, mqttPort: cloud.mqttPort, tlsEnabled: cloud.tlsEnabled
    })
    if (res.data.data?.success) {
      ElMessage.success(`连接成功 (${res.data.data.latency}ms)`)
    } else {
      ElMessage.error('连接失败')
    }
  } catch (e: any) {
    ElMessage.error('连接失败: ' + (e.message || '未知错误'))
  } finally {
    testConnLoading.value = false
  }
}

// ---- 告警策略 ----
const alarmSaving = ref(false)
const alarmDefaults: AlarmPolicySettings = {
  dedupWindow: 5, minConfidence: 0.5, criticalMaxLatency: 500, linkageActions: ['ptz', 'record', 'push']
}
const alarm = reactive<AlarmPolicySettings>({ ...alarmDefaults })

async function saveAlarm() {
  alarmSaving.value = true
  try {
    await settingsApi.saveAlarmPolicy({ ...alarm })
    ElMessage.success('告警策略已保存')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    alarmSaving.value = false
  }
}

// ---- 告警通知（来自 web-console ConfigPanel） ----
const alertNotify = reactive({
  emailEnabled: true,
  emailRecipients: ['admin@shieldbox.com'],
  webhookEnabled: false,
  webhookUrl: '',
  cpuThreshold: 90,
  memThreshold: 85,
  diskThreshold: 80,
})

// ---- AI Agent 配置（来自 web-console AgentPanel） ----
const aiAgents = reactive([
  { id: 'agent-detect', name: '目标检测', model: 'YOLOv8n', enabled: true, confidence: 0.75, fps: 15 },
  { id: 'agent-face', name: '人脸识别', model: 'ArcFace-R50', enabled: false, confidence: 0.85, fps: 10 },
  { id: 'agent-anomaly', name: '异常行为检测', model: 'ST-GCN', enabled: true, confidence: 0.70, fps: 12 },
])

// ---- AI模型 ----
const modelsLoading = ref(false)
const aiModels = ref<Array<ModelInfo & { inferTimeMs?: number; sizeMB?: number }>>([])

async function loadModels() {
  modelsLoading.value = true
  try {
    const res = await getModels()
    aiModels.value = (res.data.data || []).map(m => ({
      ...m,
      sizeMB: Math.round(m.size / 1048576),
      inferTimeMs: m.tpuUsage ? Math.round(m.tpuUsage * 100) / 10 : 0
    }))
  } catch { /* empty */ }
  modelsLoading.value = false
}

async function handleModelAction(row: any, action: 'activate' | 'deactivate') {
  try {
    if (action === 'activate') {
      await activateModel(row.id)
      ElMessage.success(`模型 ${row.name} 已激活`)
    } else {
      await deactivateModel(row.id)
      ElMessage.success(`模型 ${row.name} 已停用`)
    }
    loadModels()
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

function handleModelReload(row: any) {
  ElMessage.info(`正在重载模型: ${row.name}...`)
  deactivateModel(row.id).then(() => activateModel(row.id)).then(() => {
    ElMessage.success(`模型 ${row.name} 重载完成`)
    loadModels()
  }).catch(() => ElMessage.error('重载失败'))
}

// ---- 系统信息 ----
const systemInfo = ref<SystemInfo | null>(null)

// ---- 初始化加载 ----
onMounted(async () => {
  loading.value = true
  try {
    const [basicRes, cloudRes, alarmRes, infoRes] = await Promise.allSettled([
      settingsApi.getBasic(),
      settingsApi.getCloud(),
      settingsApi.getAlarmPolicy(),
      settingsApi.getSystemInfo(),
    ])
    if (basicRes.status === 'fulfilled') Object.assign(basic, basicRes.value.data.data)
    if (cloudRes.status === 'fulfilled') Object.assign(cloud, cloudRes.value.data.data)
    if (alarmRes.status === 'fulfilled') Object.assign(alarm, alarmRes.value.data.data)
    if (infoRes.status === 'fulfilled') systemInfo.value = infoRes.value.data.data
  } catch { /* individual errors handled above */ }
  loading.value = false
  loadModels()
})
</script>

<style scoped>
.settings-page { max-width: 900px; }
.opacity-60 { opacity: 0.6; }
</style>
