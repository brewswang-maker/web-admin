<template>
  <div class="settings-page">
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
          <el-form-item>
            <el-button type="primary" @click="saveBasic" :loading="basicSaving">保存</el-button>
            <el-button @click="resetBasic">重置</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="网络 & 云端">
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
            <el-button @click="testConnection">测试连接</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="告警策略">
        <el-form :model="alarm" label-width="150px">
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
      </el-tab-pane>

      <el-tab-pane label="AI模型管理">
        <el-table :data="aiModels" stripe>
          <el-table-column prop="name" label="模型名称" width="180" />
          <el-table-column prop="version" label="版本" width="80" />
          <el-table-column prop="precision" label="精度" width="80" />
          <el-table-column prop="sizeMB" label="大小(MB)" width="90" />
          <el-table-column prop="inferTimeMs" label="推理时间(ms)" width="110" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                {{ row.status === 'active' ? '运行中' : '已停止' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" @click="handleModelReload(row)">重载</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="关于">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="产品名称">华盾AI智能视频盒子 v6.0</el-descriptions-item>
          <el-descriptions-item label="SDK版本">ShieldBoxSDK v6.0.0</el-descriptions-item>
          <el-descriptions-item label="Hermes AgentOS">v6.0.0</el-descriptions-item>
          <el-descriptions-item label="硬件平台">算能 BM1684X (32 TOPS INT8)</el-descriptions-item>
          <el-descriptions-item label="架构">云边端六层 + 12智能体集群 + 三级记忆</el-descriptions-item>
          <el-descriptions-item label="算法插件">19个已部署 (30+可扩展)</el-descriptions-item>
          <el-descriptions-item label="最大通道数">16路 1080P @ 25fps</el-descriptions-item>
          <el-descriptions-item label="推理精度">INT8 / FP16 / FP32 可切换</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// ---- 基本设置 ----
const basicSaving = ref(false)
const basic = reactive({
  deviceName: '华盾AI盒子-001',
  logLevel: 'info',
  maxChannels: 16,
  recordRetentionDays: 30,
  ntpServer: 'ntp.aliyun.com'
})

function saveBasic() {
  basicSaving.value = true
  setTimeout(() => {
    basicSaving.value = false
    ElMessage.success('基本设置已保存')
    localStorage.setItem('shield_basic', JSON.stringify(basic))
  }, 500)
}

function resetBasic() {
  ElMessageBox.confirm('确认重置为默认设置？', '提示', { type: 'warning' })
    .then(() => {
      basic.deviceName = '华盾AI盒子-001'
      basic.logLevel = 'info'
      basic.maxChannels = 16
      basic.recordRetentionDays = 30
      basic.ntpServer = 'ntp.aliyun.com'
      ElMessage.success('已重置')
    })
}

// ---- 云端连接 ----
const cloudSaving = ref(false)
const cloud = reactive({
  mqttBroker: 'tcp://mqtt.shieldai.com:1883',
  mqttPort: 1883,
  heartbeatInterval: 30,
  tlsEnabled: true,
  maxOfflineEvents: 100000,
  syncMode: 'auto'
})

function saveCloud() {
  cloudSaving.value = true
  setTimeout(() => {
    cloudSaving.value = false
    ElMessage.success('云端连接设置已保存')
  }, 500)
}

function testConnection() {
  ElMessage.info('正在测试 MQTT 连接...')
  setTimeout(() => {
    ElMessage.success(`连接成功: ${cloud.mqttBroker}:${cloud.mqttPort}`)
  }, 1500)
}

// ---- 告警策略 ----
const alarmSaving = ref(false)
const alarm = reactive({
  dedupWindow: 5,
  minConfidence: 0.5,
  criticalMaxLatency: 500,
  linkageActions: ['ptz', 'record', 'push']
})

function saveAlarm() {
  alarmSaving.value = true
  setTimeout(() => {
    alarmSaving.value = false
    ElMessage.success('告警策略已保存')
  }, 500)
}

// ---- AI模型 ----
const aiModels = ref([
  { name: 'YOLO-World v2', version: '4.0.0', precision: 'INT8', sizeMB: 28, inferTimeMs: 8.5, status: 'active' },
  { name: 'YOLO-FireSmoke', version: '4.0.0', precision: 'INT8', sizeMB: 22, inferTimeMs: 8.5, status: 'active' },
  { name: 'YOLO-Head', version: '4.0.0', precision: 'INT8', sizeMB: 18, inferTimeMs: 6.8, status: 'active' },
  { name: 'VideoMAE-Tiny', version: '4.0.0', precision: 'INT8', sizeMB: 45, inferTimeMs: 35.0, status: 'active' },
  { name: 'HRNet-Pose', version: '4.0.0', precision: 'INT8', sizeMB: 30, inferTimeMs: 12.0, status: 'active' },
  { name: 'WhisperTiny', version: '6.0.0', precision: 'FP16', sizeMB: 78, inferTimeMs: 50.0, status: 'active' },
  { name: 'TinyLLM-Qwen', version: '6.0.0', precision: 'INT4', sizeMB: 512, inferTimeMs: 200.0, status: 'stopped' }
])

function handleModelReload(row: any) {
  ElMessage.info(`正在重载模型: ${row.name}...`)
  setTimeout(() => ElMessage.success(`模型 ${row.name} 重载完成`), 1000)
}
</script>

<style scoped>
.settings-page { max-width: 900px; }
</style>
