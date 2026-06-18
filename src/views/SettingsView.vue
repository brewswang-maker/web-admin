<template>
  <div class="settings-page" v-loading="loading">
    <el-tabs tab-position="left">
      <el-tab-pane :label="$t('settings.tabBasic')">
        <el-form :model="basic" label-width="120px">
          <el-form-item :label="$t('settings.deviceName')">
            <el-input v-model="basic.deviceName" style="width: 300px" />
          </el-form-item>
          <el-form-item :label="$t('settings.logLevel')">
            <el-select v-model="basic.logLevel" style="width: 200px">
              <el-option :label="$t('settings.logLevelDebug')" value="debug" />
              <el-option :label="$t('settings.logLevelInfo')" value="info" />
              <el-option :label="$t('settings.logLevelWarn')" value="warn" />
              <el-option :label="$t('settings.logLevelError')" value="error" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('settings.maxChannels')">
            <el-input-number v-model="basic.maxChannels" :min="1" :max="32" />
          </el-form-item>
          <el-form-item :label="$t('settings.recordRetentionDays')">
            <el-input-number v-model="basic.recordRetentionDays" :min="1" :max="365" />
          </el-form-item>
          <el-form-item :label="$t('settings.ntpServer')">
            <el-input v-model="basic.ntpServer" style="width: 300px" placeholder="ntp.aliyun.com" />
          </el-form-item>
          <el-form-item :label="$t('settings.dataRetentionDays')">
            <el-input-number v-model="basic.dataRetentionDays" :min="1" :max="365" />
          </el-form-item>
          <el-form-item :label="$t('settings.autoRestart')">
            <el-switch v-model="basic.autoRestart" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveBasic" :loading="basicSaving">{{ $t('settings.save') }}</el-button>
            <el-button @click="resetBasic">{{ $t('settings.reset') }}</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane :label="$t('settings.tabNetwork')">
        <!-- 网络配置 -->
        <h4 style="margin-bottom:16px;color:#303133">{{ $t('settings.networkConfig') }}</h4>
        <el-form :model="network" label-width="130px" style="max-width:680px;margin-bottom:24px">
          <el-form-item :label="$t('settings.hostname')">
            <el-input v-model="network.hostname" style="width:300px" />
          </el-form-item>
          <el-form-item :label="$t('settings.ipMode')">
            <el-radio-group v-model="network.ipMode">
              <el-radio value="dhcp">{{ $t('settings.dhcp') }}</el-radio>
              <el-radio value="static">{{ $t('settings.staticIp') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <template v-if="network.ipMode === 'static'">
            <el-form-item :label="$t('settings.ipAddress')">
              <el-input v-model="network.ipAddress" style="width:300px" />
            </el-form-item>
            <el-form-item :label="$t('settings.subnetMask')">
              <el-input v-model="network.subnetMask" style="width:300px" />
            </el-form-item>
            <el-form-item :label="$t('settings.gateway')">
              <el-input v-model="network.gateway" style="width:300px" />
            </el-form-item>
          </template>
          <el-form-item :label="$t('settings.dnsServer')">
            <div v-for="(dns, idx) in network.dns" :key="idx" style="display:flex;gap:8px;margin-bottom:8px;width:100%">
              <el-input :model-value="dns" @update:model-value="(v: string) => network.dns[idx] = v" style="flex:1" />
              <el-button type="danger" circle size="small" @click="network.dns.splice(idx, 1)">-</el-button>
            </div>
            <el-button size="small" @click="network.dns.push('')">{{ $t('settings.addDns') }}</el-button>
          </el-form-item>
        </el-form>

        <el-divider />

        <!-- MQTT & 云端 -->
        <h4 style="margin-bottom:16px;color:#303133">{{ $t('settings.cloudConnect') }}</h4>
        <el-form :model="cloud" label-width="130px">
          <el-form-item :label="$t('settings.mqttBroker')">
            <el-input v-model="cloud.mqttBroker" style="width: 400px" />
          </el-form-item>
          <el-form-item :label="$t('settings.mqttPort')">
            <el-input-number v-model="cloud.mqttPort" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item :label="$t('settings.heartbeatInterval')">
            <el-input-number v-model="cloud.heartbeatInterval" :min="10" :max="300" />
          </el-form-item>
          <el-form-item :label="$t('settings.tlsEnabled')">
            <el-switch v-model="cloud.tlsEnabled" />
          </el-form-item>
          <el-form-item :label="$t('settings.maxOfflineEvents')">
            <el-input-number v-model="cloud.maxOfflineEvents" :min="1000" :max="500000" :step="1000" />
          </el-form-item>
          <el-form-item :label="$t('settings.syncMode')">
            <el-radio-group v-model="cloud.syncMode">
              <el-radio label="auto">{{ $t('settings.syncAuto') }}</el-radio>
              <el-radio label="manual">{{ $t('settings.syncManual') }}</el-radio>
              <el-radio label="scheduled">{{ $t('settings.syncScheduled') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveCloud" :loading="cloudSaving">{{ $t('settings.save') }}</el-button>
            <el-button @click="testConnection" :loading="testConnLoading">{{ $t('settings.testConnection') }}</el-button>
          </el-form-item>
        </el-form>

        <el-divider />

        <!-- AI 模型配置 (本地/云端切换) -->
        <h4 style="margin-bottom:16px;color:#303133">🤖 AI 模型配置</h4>
        <el-form label-width="160px">
          <el-form-item label="当前后端">
            <el-tag :type="llmStatus.ready ? 'success' : 'danger'" size="large">
              {{ llmStatus.backend || '未加载' }}
            </el-tag>
            <el-tag v-if="llmStatus.multimodal_supported" type="warning" size="small" style="margin-left:8px">
              多模态
            </el-tag>
            <el-tag :type="llmStatus.backend_mode === 'real' ? 'success' : 'info'" size="small" style="margin-left:8px">
              {{ llmStatus.backend_mode === 'real' ? '真实推理' : 'Stub' }}
            </el-tag>
            <el-button size="small" style="margin-left:12px" @click="refreshLlmStatus" :loading="llmStatusLoading">
              刷新
            </el-button>
          </el-form-item>

          <el-form-item label="模型模式">
            <el-radio-group v-model="llmConfig.mode">
              <el-radio label="hybrid">混合三路 (文本/图像/视频分别路由)</el-radio>
              <el-radio label="external">单一云端</el-radio>
              <el-radio label="auto">自动 (TPU→云端→本地)</el-radio>
              <el-radio label="builtin">本地推理 (TPU/llama.cpp)</el-radio>
            </el-radio-group>
          </el-form-item>

          <!-- 本地模型配置 -->
          <template v-if="llmConfig.mode === 'builtin' || llmConfig.mode === 'auto'">
            <el-divider content-position="left">本地模型 (llama.cpp / SophonTpu)</el-divider>
            <el-form-item label="模型路径">
              <el-input v-model="llmConfig.localModelPath" placeholder="/path/to/model.gguf" style="width:400px" />
            </el-form-item>
            <el-form-item label="上下文窗口">
              <el-input-number v-model="llmConfig.localContextWindow" :min="512" :max="32768" :step="512" />
            </el-form-item>
            <el-form-item label="线程数">
              <el-input-number v-model="llmConfig.localThreads" :min="1" :max="16" />
            </el-form-item>
          </template>

          <!-- 单一云端模型配置 -->
          <template v-if="llmConfig.mode === 'external'">
            <el-divider content-position="left">云端模型 (HTTP / OneAPI / LiteLLM)</el-divider>
            <el-form-item label="API Base URL">
              <el-input v-model="llmConfig.cloudBaseUrl" placeholder="https://api.openai.com/v1" style="width:400px" />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="llmConfig.cloudApiKey" type="password" show-password placeholder="sk-..." style="width:400px" />
            </el-form-item>
            <el-form-item label="模型名称">
              <el-input v-model="llmConfig.cloudModel" placeholder="gpt-4o / qwen-plus / ..." style="width:300px" />
            </el-form-item>
            <el-form-item label="超时(秒)">
              <el-input-number v-model="llmConfig.cloudTimeout" :min="5" :max="120" />
            </el-form-item>
          </template>

          <!-- 混合三路云端配置 (文本/图像/视频分别路由) -->
          <template v-if="llmConfig.mode === 'hybrid'">
            <el-alert type="info" :closable="false" style="margin-bottom:16px">
              💡 系统按请求内容自动路由：纯文本→DeepSeek，图像→Qwen-VL-Plus，视频审核→Qwen-VL-Max
            </el-alert>

            <!-- 文本路由 → DeepSeek -->
            <el-divider content-position="left">📝 文本路由 → DeepSeek (对话/NL搜索/告警描述)</el-divider>
            <el-form-item label="Base URL">
              <el-input v-model="hybridConfig.text.baseUrl" placeholder="https://api.deepseek.com/v1" style="width:400px" />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="hybridConfig.text.apiKey" type="password" show-password placeholder="sk-..." style="width:400px" />
            </el-form-item>
            <el-form-item label="模型">
              <el-input v-model="hybridConfig.text.model" placeholder="deepseek-chat" style="width:250px" />
            </el-form-item>

            <!-- 视觉路由 → Qwen-VL-Plus -->
            <el-divider content-position="left">👁️ 视觉路由 → Qwen-VL-Plus (告警验证/OCR/场景理解)</el-divider>
            <el-form-item label="Base URL">
              <el-input v-model="hybridConfig.vision.baseUrl" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" style="width:400px" />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="hybridConfig.vision.apiKey" type="password" show-password placeholder="sk-..." style="width:400px" />
            </el-form-item>
            <el-form-item label="模型">
              <el-input v-model="hybridConfig.vision.model" placeholder="qwen-vl-plus" style="width:250px" />
            </el-form-item>

            <!-- 视频路由 → Qwen-VL-Max -->
            <el-divider content-position="left">🎬 视频路由 → Qwen-VL-Max (视频审核/录像回放分析)</el-divider>
            <el-form-item label="Base URL">
              <el-input v-model="hybridConfig.video.baseUrl" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" style="width:400px" />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="hybridConfig.video.apiKey" type="password" show-password placeholder="sk-..." style="width:400px" />
            </el-form-item>
            <el-form-item label="模型">
              <el-input v-model="hybridConfig.video.model" placeholder="qwen-vl-max" style="width:250px" />
            </el-form-item>
          </template>

          <el-form-item label="温度">
            <el-slider v-model="llmConfig.temperature" :min="0" :max="2" :step="0.1" show-input style="width:300px" />
          </el-form-item>
          <el-form-item label="最大 Token">
            <el-input-number v-model="llmConfig.maxTokens" :min="64" :max="4096" :step="64" />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="switchLlmBackend" :loading="llmSwitching">
              应用切换
            </el-button>
            <el-button @click="testLlm" :loading="llmTesting">测试对话</el-button>
          </el-form-item>

          <!-- 测试结果 -->
          <el-form-item v-if="llmTestResult" label="测试结果">
            <el-alert :title="llmTestResult" :type="llmTestSuccess ? 'success' : 'error'" :closable="true" />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane :label="$t('settings.tabAlarm')">
        <el-form :model="alarm" label-width="150px">
          <el-divider content-position="left">{{ $t('settings.alarmRule') }}</el-divider>
          <el-form-item :label="$t('settings.dedupWindow')">
            <el-input-number v-model="alarm.dedupWindow" :min="5" :max="300" />
          </el-form-item>
          <el-form-item :label="$t('settings.minConfidence')">
            <el-slider v-model="alarm.minConfidence" :min="0.3" :max="0.95" :step="0.05" show-input />
          </el-form-item>
          <el-form-item :label="$t('settings.criticalMaxLatency')">
            <el-input-number v-model="alarm.criticalMaxLatency" :min="100" :max="5000" :step="100" />
          </el-form-item>
          <el-form-item :label="$t('settings.linkageActions')">
            <el-checkbox-group v-model="alarm.linkageActions">
              <el-checkbox label="ptz">{{ $t('settings.linkagePtz') }}</el-checkbox>
              <el-checkbox label="record">{{ $t('settings.linkageRecord') }}</el-checkbox>
              <el-checkbox label="audio">{{ $t('settings.linkageAudio') }}</el-checkbox>
              <el-checkbox label="light">{{ $t('settings.linkageLight') }}</el-checkbox>
              <el-checkbox label="sms">{{ $t('settings.linkageSms') }}</el-checkbox>
              <el-checkbox label="push">{{ $t('settings.linkagePush') }}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveAlarm" :loading="alarmSaving">{{ $t('settings.save') }}</el-button>
          </el-form-item>
        </el-form>

        <el-divider />

        <!-- 邮件/Webhook 告警通知（来自 web-console） -->
        <h4 style="margin-bottom:16px;color:#303133">{{ $t('settings.alertNotify') }}</h4>
        <el-form :model="alertNotify" label-width="150px" style="max-width:680px">
          <el-form-item :label="$t('settings.emailAlertEnabled')">
            <el-switch v-model="alertNotify.emailEnabled" />
          </el-form-item>
          <el-form-item v-if="alertNotify.emailEnabled" :label="$t('settings.recipient')">
            <div v-for="(email, idx) in alertNotify.emailRecipients" :key="idx" style="display:flex;gap:8px;margin-bottom:8px;width:100%">
              <el-input :model-value="email" @update:model-value="(v: string) => alertNotify.emailRecipients[idx] = v" style="flex:1" />
              <el-button type="danger" circle size="small" @click="alertNotify.emailRecipients.splice(idx, 1)">-</el-button>
            </div>
            <el-button size="small" @click="alertNotify.emailRecipients.push('')">{{ $t('settings.addRecipient') }}</el-button>
          </el-form-item>
          <el-form-item :label="$t('settings.webhookAlert')">
            <el-switch v-model="alertNotify.webhookEnabled" />
          </el-form-item>
          <el-form-item v-if="alertNotify.webhookEnabled" :label="$t('settings.webhookUrl')">
            <el-input v-model="alertNotify.webhookUrl" style="width:400px" placeholder="https://..." />
          </el-form-item>
          <el-divider content-position="left">{{ $t('settings.resourceThreshold') }}</el-divider>
          <el-form-item :label="$t('settings.cpuThreshold')">
            <el-slider v-model="alertNotify.cpuThreshold" :min="50" :max="100" show-input />
          </el-form-item>
          <el-form-item :label="$t('settings.memThreshold')">
            <el-slider v-model="alertNotify.memThreshold" :min="50" :max="100" show-input />
          </el-form-item>
          <el-form-item :label="$t('settings.diskThreshold')">
            <el-slider v-model="alertNotify.diskThreshold" :min="50" :max="100" show-input />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane :label="$t('settings.tabAiModel')">
        <!-- AI Agent 开关与置信度（来自 web-console AgentPanel） -->
        <h4 style="margin-bottom:16px;color:#303133">{{ $t('settings.aiAgentConfig') }}</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-bottom:24px">
          <el-card v-for="agent in aiAgents" :key="agent.id" :class="{ 'opacity-60': !agent.enabled }" shadow="hover">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <span style="font-size:15px;font-weight:600">{{ t(`settings.${agent.nameKey}`) }}</span>
              <el-switch :model-value="agent.enabled" @change="(v: string | number | boolean) => agent.enabled = !!v" :active-text="$t('settings.enable')" :inactive-text="$t('settings.disable')" />
            </div>
            <el-form label-width="80px" size="small">
              <el-form-item :label="$t('settings.agentModel')"><el-tag>{{ agent.model }}</el-tag></el-form-item>
              <el-form-item :label="$t('settings.agentConfidence')">
                <el-slider :model-value="agent.confidence" :min="0" :max="1" :step="0.05" :format-tooltip="(v: number | number[]) => `${Math.round((Array.isArray(v) ? v[0] : v) * 100)}%`" @change="(v: number | number[]) => agent.confidence = Array.isArray(v) ? v[0] : v" :disabled="!agent.enabled" />
              </el-form-item>
              <el-form-item :label="$t('settings.agentFps')"><el-tag type="info">{{ agent.fps }} {{ $t('settings.fpsUnit') }}</el-tag></el-form-item>
            </el-form>
          </el-card>
        </div>
        <el-button type="primary" size="small" @click="saveAiAgents" style="margin-bottom:16px">{{ $t('settings.save') }}</el-button>

        <el-divider />

        <!-- 模型列表（原有） -->
        <h4 style="margin-bottom:16px;color:#303133">{{ $t('settings.deployedModels') }}</h4>
        <el-table :data="aiModels" stripe v-loading="modelsLoading">
          <el-table-column prop="name" :label="$t('settings.modelName')" width="180" />
          <el-table-column prop="version" :label="$t('settings.version')" width="80" />
          <el-table-column prop="precision" :label="$t('settings.precision')" width="80" />
          <el-table-column prop="sizeMB" :label="$t('settings.sizeMB')" width="90">
            <template #default="{ row }">{{ (row.size / 1048576).toFixed(0) }}</template>
          </el-table-column>
          <el-table-column prop="inferTimeMs" :label="$t('settings.inferMs')" width="100" />
          <el-table-column prop="status" :label="$t('settings.modelStatus')" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                {{ row.status === 'active' ? $t('settings.modelActive') : row.status === 'loading' ? $t('settings.modelLoading') : $t('settings.modelStopped') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('settings.actionCol')" width="150">
            <template #default="{ row }">
              <el-button v-if="row.status === 'active'" size="small" @click="handleModelAction(row, 'deactivate')">{{ $t('settings.deactivate') }}</el-button>
              <el-button v-else size="small" type="primary" @click="handleModelAction(row, 'activate')">{{ $t('settings.activate') }}</el-button>
              <el-button size="small" @click="handleModelReload(row)">{{ $t('settings.reload') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="$t('settings.tabAbout')">
        <el-descriptions :column="1" border v-if="systemInfo">
          <el-descriptions-item :label="$t('settings.productName')">{{ systemInfo.productName }}</el-descriptions-item>
          <el-descriptions-item :label="$t('settings.sdkVersion')">{{ systemInfo.sdkVersion }}</el-descriptions-item>
          <el-descriptions-item :label="$t('settings.hermesAgentOs')">{{ systemInfo.hermesVersion }}</el-descriptions-item>
          <el-descriptions-item :label="$t('settings.hardware')">{{ systemInfo.hardware }}</el-descriptions-item>
          <el-descriptions-item :label="$t('settings.architecture')">{{ systemInfo.architecture }}</el-descriptions-item>
          <el-descriptions-item :label="$t('settings.algorithmPlugins')">{{ systemInfo.algorithmPlugins }} {{ $t('settings.algorithmPluginsUnit') }}</el-descriptions-item>
          <el-descriptions-item :label="$t('settings.maxChannels')">{{ systemInfo.maxChannels }} {{ $t('settings.maxChannelsUnit') }}</el-descriptions-item>
          <el-descriptions-item :label="$t('settings.inferencePrecision')">{{ systemInfo.inferencePrecision }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else :description="$t('settings.loadSystemInfoFail')" />
        <el-divider />
        <div style="display:flex;gap:12px">
          <el-button @click="handleExportConfig">{{ $t('settings.exportConfig') }}</el-button>
          <el-button type="primary" @click="handleImportConfig">{{ $t('settings.importConfig') }}</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { settingsApi, type BasicSettings, type CloudSettings, type AlarmPolicySettings, type SystemInfo } from '@/api/settings'
import { getModels, activateModel, deactivateModel, type ModelInfo } from '@/api/model'
import configApi from '@/api/config'

const { t } = useI18n()

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
    ElMessage.success(t('settings.saveBasicOk'))
  } catch (e: any) {
    ElMessage.error(t('settings.saveFail') + ': ' + (e.message || t('settings.unknownError')))
  } finally {
    basicSaving.value = false
  }
}

function resetBasic() {
  ElMessageBox.confirm(t('settings.resetConfirm'), t('common.tip'), { type: 'warning' })
    .then(() => {
      Object.assign(basic, basicDefaults)
      ElMessage.success(t('settings.resetOk'))
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
    ElMessage.success(t('settings.saveCloudOk'))
  } catch (e: any) {
    ElMessage.error(t('settings.saveFail') + ': ' + (e.message || t('settings.unknownError')))
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
      ElMessage.success(t('settings.connectResult', { ms: res.data.data.latency }))
    } else {
      ElMessage.error(t('settings.connectFail'))
    }
  } catch (e: any) {
    ElMessage.error(t('settings.connectFail') + ': ' + (e.message || t('settings.unknownError')))
  } finally {
    testConnLoading.value = false
  }
}

// ---- 告警策略 ----
const alarmSaving = ref(false)
const alarmDefaults: AlarmPolicySettings = {
  dedupWindow: 30, minConfidence: 0.5, criticalMaxLatency: 500, linkageActions: ['ptz', 'record', 'push']
}
const alarm = reactive<AlarmPolicySettings>({ ...alarmDefaults })

// ---- AI 模型配置 (本地/云端切换) ----
const llmStatusLoading = ref(false)
const llmSwitching = ref(false)
const llmTesting = ref(false)
const llmTestResult = ref('')
const llmTestSuccess = ref(false)
const llmStatus = reactive({
  backend: '', ready: false, multimodal_supported: false,
  backend_mode: '', model_loaded: false
})
const llmConfig = reactive({
  mode: 'hybrid' as 'auto' | 'builtin' | 'external' | 'hybrid',
  localModelPath: '',
  localContextWindow: 4096,
  localThreads: 4,
  cloudBaseUrl: '',
  cloudApiKey: '',
  cloudModel: 'gpt-4o',
  cloudTimeout: 30,
  temperature: 0.7,
  maxTokens: 256,
})

// 混合三路云端配置 (文本/图像/视频分别路由)
// 预填已验证的 API key, 用户打开面板即可直接应用
const hybridConfig = reactive({
  text:   { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-d1949b36d20e40539b5b7d86d4751a94', model: 'deepseek-chat' },
  vision: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'sk-bce6fd95df544fbba09f82409596fa0a', model: 'qwen-vl-plus' },
  video:  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'sk-bce6fd95df544fbba09f82409596fa0a', model: 'qwen-vl-max' },
})

async function refreshLlmStatus() {
  llmStatusLoading.value = true
  try {
    const resp = await fetch('/api/v1/llm/status')
    const data = await resp.json()
    llmStatus.backend = data.backend || ''
    llmStatus.ready = data.ready || false
    llmStatus.multimodal_supported = data.multimodal_supported || false
    llmStatus.backend_mode = data.backend_mode || ''
    llmStatus.model_loaded = data.model_loaded || false
  } catch (e) {
    console.error('refreshLlmStatus failed', e)
  } finally {
    llmStatusLoading.value = false
  }
}

async function switchLlmBackend() {
  llmSwitching.value = true
  llmTestResult.value = ''
  try {
    let body: any

    if (llmConfig.mode === 'hybrid') {
      // 三路云端路由
      body = {
        backend: 'hybrid',
        backends: {
          hybrid: {
            text:   { base_url: hybridConfig.text.baseUrl, api_key: hybridConfig.text.apiKey, model: hybridConfig.text.model },
            vision: { base_url: hybridConfig.vision.baseUrl, api_key: hybridConfig.vision.apiKey, model: hybridConfig.vision.model },
            video:  { base_url: hybridConfig.video.baseUrl, api_key: hybridConfig.video.apiKey, model: hybridConfig.video.model },
          }
        }
      }
    } else {
      // 单 backend 模式
      const backends: Record<string, any> = {}
      if (llmConfig.localModelPath) {
        backends.llama_cpp = {
          model_path: llmConfig.localModelPath,
          context_window: llmConfig.localContextWindow,
          threads: llmConfig.localThreads,
          temperature: llmConfig.temperature,
          max_tokens: llmConfig.maxTokens,
        }
      }
      if (llmConfig.cloudBaseUrl) {
        backends.http = {
          base_url: llmConfig.cloudBaseUrl,
          api_key: llmConfig.cloudApiKey,
          model: llmConfig.cloudModel,
          timeout_sec: llmConfig.cloudTimeout,
          temperature: llmConfig.temperature,
          max_tokens: llmConfig.maxTokens,
        }
      }
      body = { backend: llmConfig.mode, backends }
    }

    const resp = await fetch('/api/v1/llm/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json()
    if (data.code === 200) {
      llmTestResult.value = `切换成功: ${data.new_backend}`
      llmTestSuccess.value = true
      await refreshLlmStatus()
    } else {
      llmTestResult.value = `切换失败: ${data.message}`
      llmTestSuccess.value = false
    }
  } catch (e: any) {
    llmTestResult.value = `请求失败: ${e.message}`
    llmTestSuccess.value = false
  } finally {
    llmSwitching.value = false
  }
}

async function testLlm() {
  llmTesting.value = true
  llmTestResult.value = ''
  try {
    const resp = await fetch('/api/v1/llm/chat/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '你好，请用一句话介绍你自己', max_tokens: 64 }),
    })
    const data = await resp.json()
    if (data.code === 200 && data.response) {
      llmTestResult.value = `回复: ${data.response.substring(0, 100)}`
      llmTestSuccess.value = true
    } else {
      llmTestResult.value = `对话失败: ${data.error || data.message || '未知错误'}`
      llmTestSuccess.value = false
    }
  } catch (e: any) {
    llmTestResult.value = `请求失败: ${e.message}`
    llmTestSuccess.value = false
  } finally {
    llmTesting.value = false
  }
}

async function saveAlarm() {
  alarmSaving.value = true
  try {
    await settingsApi.saveAlarmPolicy({ ...alarm })
    ElMessage.success(t('settings.saveAlarmOk'))
  } catch (e: any) {
    ElMessage.error(t('settings.saveFail') + ': ' + (e.message || t('settings.unknownError')))
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

// ---- AI Agent 配置 ----
const aiAgentDefaults = [
  { id: 'agent-detect', nameKey: 'agentDetect', model: 'YOLOv8n', enabled: true, confidence: 0.75, fps: 15 },
  { id: 'agent-face', nameKey: 'agentFace', model: 'ArcFace-R50', enabled: false, confidence: 0.85, fps: 10 },
  { id: 'agent-anomaly', nameKey: 'agentAnomaly', model: 'ST-GCN', enabled: true, confidence: 0.70, fps: 12 },
]
const aiAgents = reactive(aiAgentDefaults.map(a => ({ ...a })))

async function saveAiAgents() {
  try {
    const agents = aiAgents.map(({ id, enabled, confidence }) => ({ id, enabled, confidence }))
    await configApi.update({ ai_agents: agents })
    ElMessage.success(t('settings.saveOk'))
  } catch (e: any) {
    ElMessage.error(t('settings.saveFail') + ': ' + (e.message || t('settings.unknownError')))
  }
}

function loadAiAgents(config: any) {
  if (!config?.ai_agents || !Array.isArray(config.ai_agents)) return
  for (const saved of config.ai_agents) {
    const agent = aiAgents.find(a => a.id === saved.id)
    if (agent) {
      if (saved.enabled != null) agent.enabled = saved.enabled
      if (saved.confidence != null) agent.confidence = saved.confidence
    }
  }
}

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
      ElMessage.success(t('settings.activateOk', { name: row.name }))
    } else {
      await deactivateModel(row.id)
      ElMessage.success(t('settings.deactivateOk', { name: row.name }))
    }
    loadModels()
  } catch (e: any) {
    ElMessage.error(e.message || t('settings.actionFailed'))
  }
}

function handleModelReload(row: any) {
  ElMessage.info(t('settings.reloadIng', { name: row.name }))
  deactivateModel(row.id).then(() => activateModel(row.id)).then(() => {
    ElMessage.success(t('settings.reloadOk', { name: row.name }))
    loadModels()
  }).catch(() => ElMessage.error(t('settings.reloadFail')))
}

// ---- 系统信息 ----
const systemInfo = ref<SystemInfo | null>(null)

// ---- 配置导入/导出 ----
async function handleExportConfig() {
  try {
    const res = await configApi.exportConfig()
    const url = res.data?.data?.url
    if (url) {
      const a = document.createElement('a')
      a.href = url
      a.download = `system_config_${Date.now()}.json`
      a.click()
      ElMessage.success(t('settings.exportOk'))
    }
  } catch {
    ElMessage.error(t('settings.exportFail'))
  }
}

async function handleImportConfig() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      await configApi.importConfig(text)
      ElMessage.success(t('settings.importOk'))
      setTimeout(() => location.reload(), 1500)
    } catch {
      ElMessage.error(t('settings.importFail'))
    }
  }
  input.click()
}

// ---- 初始化加载 ----
onMounted(async () => {
  loading.value = true
  refreshLlmStatus()  // AI 模型状态 (异步, 不阻塞)
  try {
    const [basicRes, cloudRes, alarmRes, infoRes, netRes] = await Promise.allSettled([
      settingsApi.getBasic(),
      settingsApi.getCloud(),
      settingsApi.getAlarmPolicy(),
      settingsApi.getSystemInfo(),
      configApi.getNetwork(),
    ])
    if (basicRes.status === 'fulfilled') Object.assign(basic, basicRes.value.data.data)
    if (cloudRes.status === 'fulfilled') Object.assign(cloud, cloudRes.value.data.data)
    if (alarmRes.status === 'fulfilled') Object.assign(alarm, alarmRes.value.data.data)
    if (infoRes.status === 'fulfilled') systemInfo.value = infoRes.value.data.data
    // 加载 AI Agent 配置
    try {
      const { data: cfgRes } = await configApi.get()
      loadAiAgents(cfgRes?.data)
    } catch { /* 使用默认值 */ }
    if (netRes.status === 'fulfilled') {
      const n = netRes.value.data.data
      if (n) {
        network.ipMode = (n.mode || 'static') as 'dhcp' | 'static'
        network.ipAddress = n.ip || network.ipAddress
        network.subnetMask = n.mask || network.subnetMask
        network.gateway = n.gateway || network.gateway
        if (n.dns) network.dns = Array.isArray(n.dns) ? n.dns : [n.dns]
      }
    }
  } catch { /* individual errors handled above */ }
  loading.value = false
  loadModels()
})
</script>

<style scoped>
.settings-page { max-width: 900px; }
.opacity-60 { opacity: 0.6; }
</style>
