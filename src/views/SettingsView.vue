<template>
  <el-card class="settings-page" shadow="never" v-loading="loading">
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
              <el-input v-model="hybridConfig.text.model" placeholder="MiniMax-M3" style="width:250px" />
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
          <!-- [P3-2 2026-09-11] 告警冷却双开关 (spec §7 P3-2): 目标去重 / 去重时间窗;
               绑定 box_config alarm.dedup 节点 (重启生效, 纯配置呈现层) -->
          <el-form-item :label="$t('settings.dedupByTrack')">
            <el-switch v-model="alarm.dedupByTrackEnabled" />
            <span class="form-tip">{{ $t('settings.dedupByTrackTip') }}</span>
          </el-form-item>
          <el-form-item :label="$t('settings.dedupWindowSeconds')">
            <el-input-number v-model="alarm.dedupWindowSeconds" :min="5" :max="300" />
            <span class="form-tip">{{ $t('settings.dedupWindowSecondsTip') }}</span>
          </el-form-item>
          <!-- [P1-1 2026-09-13] 事件级尺寸过滤 (round2 P1-1): 全局统一门 —
               bbox 归一化面积 min/max (0=关) 覆盖所有事件类型; 即时生效+持久化 -->
          <el-divider content-position="left">{{ $t('settings.sizeFilter') }}</el-divider>
          <el-form-item :label="$t('settings.sizeFilterEnabled')">
            <el-switch v-model="sizeFilter.enabled" />
            <span class="form-tip">{{ $t('settings.sizeFilterEnabledTip') }}</span>
          </el-form-item>
          <template v-if="sizeFilter.enabled">
            <el-form-item :label="$t('settings.sizeFilterMin')">
              <el-input-number v-model="sizeFilter.default_min_area" :min="0" :max="1" :step="0.0005" :precision="4" />
            </el-form-item>
            <el-form-item :label="$t('settings.sizeFilterMax')">
              <el-input-number v-model="sizeFilter.default_max_area" :min="0" :max="1" :step="0.05" :precision="4" />
            </el-form-item>
            <el-form-item :label="$t('settings.sizeFilterOverrides')">
              <div style="width:100%">
                <div v-for="(row, idx) in sizeFilterOverrideRows" :key="idx" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
                  <el-input v-model="row.type" placeholder="intrusion" style="width:200px" />
                  <el-input-number v-model="row.min_area" :min="0" :max="1" :step="0.0005" :precision="4" />
                  <el-input-number v-model="row.max_area" :min="0" :max="1" :step="0.05" :precision="4" />
                  <el-button type="danger" circle size="small" @click="sizeFilterOverrideRows.splice(idx, 1)">-</el-button>
                </div>
                <el-button size="small" @click="sizeFilterOverrideRows.push({ type: '', min_area: 0, max_area: 0 })">{{ $t('settings.sizeFilterAddOverride') }}</el-button>
              </div>
            </el-form-item>
          </template>
          <el-form-item>
            <el-button type="primary" @click="saveSizeFilter" :loading="sizeFilterSaving">{{ $t('settings.save') }}</el-button>
            <span v-if="sizeFilterStats" class="form-tip">
              {{ $t('settings.sizeFilterStats', { filtered: sizeFilterStats.size_filtered, skipped: sizeFilterStats.size_filter_skipped }) }}
            </span>
          </el-form-item>
          <!-- [P1-2 2026-09-25 免打扰] 全局静默时段 (对标萤石「免打扰」): 静默时段内
               WS 实时推送整体抑制 (AlarmService 推送集成层), 告警仍落库列表可见;
               电话/语音播报走 executor 独立链路不受影响 (对标乐橙「电话不受免打扰限制」) -->
          <el-divider content-position="left">{{ $t('settings.quietHours') }}</el-divider>
          <el-form-item :label="$t('settings.quietHoursEnabled')">
            <el-switch v-model="quietHours.enabled" />
            <span class="form-tip">{{ $t('settings.quietHoursEnabledTip') }}</span>
          </el-form-item>
          <template v-if="quietHours.enabled">
            <el-form-item :label="$t('settings.quietHoursStart')">
              <el-time-select v-model="quietHours.start" start="00:00" step="00:30" end="23:30" style="width: 160px" />
            </el-form-item>
            <el-form-item :label="$t('settings.quietHoursEnd')">
              <el-time-select v-model="quietHours.end" start="00:00" step="00:30" end="23:30" style="width: 160px" />
              <span class="form-tip">{{ $t('settings.quietHoursCrossTip') }}</span>
            </el-form-item>
          </template>
          <el-form-item>
            <el-button type="primary" @click="saveQuietHours" :loading="quietHoursSaving">{{ $t('settings.save') }}</el-button>
            <span v-if="quietHoursSuppressed !== null" class="form-tip">
              {{ $t('settings.quietHoursStats', { suppressed: quietHoursSuppressed }) }}
            </span>
          </el-form-item>
          <!-- [P2 2026-09-25 短信通知] 腾讯云短信直连 (对标乐橙三渠道之短信):
               enabled 且五要素齐 (SecretId/SecretKey/SdkAppId/签名/模板) 时订阅「短信」
               通道直连腾讯云; SecretKey 脱敏回显 (掩码字段默认空, 留空 = 保留现值)。
               即时生效 + 持久化 box_config alarm.sms_notify -->
          <el-divider content-position="left">{{ $t('settings.smsNotify') }}</el-divider>
          <el-form-item :label="$t('settings.smsNotifyEnabled')">
            <el-switch v-model="smsNotify.enabled" />
            <span class="form-tip">{{ $t('settings.smsNotifyEnabledTip') }}</span>
          </el-form-item>
          <template v-if="smsNotify.enabled">
            <el-form-item :label="$t('settings.smsNotifySecretId')">
              <el-input v-model="smsNotify.secret_id" placeholder="AKID..." style="width: 320px" />
            </el-form-item>
            <el-form-item :label="$t('settings.smsNotifySecretKey')">
              <el-input
                v-model="smsNotify.secret_key" type="password" show-password
                :placeholder="smsSecretKeyPlaceholder" style="width: 320px"
              />
            </el-form-item>
            <el-form-item :label="$t('settings.smsNotifyAppId')">
              <el-input v-model="smsNotify.sdk_app_id" placeholder="1400xxxxxx" style="width: 320px" />
            </el-form-item>
            <el-form-item :label="$t('settings.smsNotifySign')">
              <el-input v-model="smsNotify.sign_name" style="width: 320px" />
            </el-form-item>
            <el-form-item :label="$t('settings.smsNotifyTemplate')">
              <el-input v-model="smsNotify.template_id" style="width: 320px" />
            </el-form-item>
            <el-form-item :label="$t('settings.smsNotifyRegion')">
              <el-input v-model="smsNotify.region" style="width: 320px" />
            </el-form-item>
            <el-form-item :label="$t('settings.smsNotifyParamOrder')">
              <el-input v-model="smsNotifyParamOrderText" :placeholder="$t('settings.smsNotifyParamOrderPh')" style="width: 480px" />
              <span class="form-tip">{{ $t('settings.smsNotifyParamOrderTip') }}</span>
            </el-form-item>
          </template>
          <el-form-item>
            <el-button type="primary" @click="saveSmsNotify" :loading="smsNotifySaving">{{ $t('settings.save') }}</el-button>
            <span v-if="smsNotifyConfigured !== null" class="form-tip">
              {{ smsNotifyConfigured ? $t('settings.smsNotifyReady') : $t('settings.smsNotifyNotReady') }}
            </span>
          </el-form-item>
          <!-- [P2 2026-09-25 订阅聚合摘要] 每日动态汇总 (对标萤石「今日动态」):
               每日 time 时刻汇总订阅近 24h 命中动态, 有动态才经 WS 推送
               subscription_digest 帧; 即时生效 + 持久化 box_config -->
          <el-divider content-position="left">{{ $t('settings.subscriptionDigest') }}</el-divider>
          <el-form-item :label="$t('settings.subscriptionDigestEnabled')">
            <el-switch v-model="subscriptionDigest.enabled" />
            <span class="form-tip">{{ $t('settings.subscriptionDigestEnabledTip') }}</span>
          </el-form-item>
          <template v-if="subscriptionDigest.enabled">
            <el-form-item :label="$t('settings.subscriptionDigestTime')">
              <el-time-select v-model="subscriptionDigest.time" start="00:00" step="00:30" end="23:30" style="width: 160px" />
            </el-form-item>
          </template>
          <el-form-item>
            <el-button type="primary" @click="saveSubscriptionDigest" :loading="digestSaving">{{ $t('settings.save') }}</el-button>
            <span v-if="digestPreviewTotal !== null" class="form-tip">
              {{ $t('settings.subscriptionDigestStats', { total: digestPreviewTotal }) }}
            </span>
          </el-form-item>
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

      <!-- [REC-SCHEDULE 2026-09-11] 录像计划 — 自录像回放页迁出, 独立 CRUD 子模块 -->
      <el-tab-pane :label="$t('settings.tabRecordSchedule', '录像计划')">
        <!-- [REC-ARCH 2026-09-17] 录像存储策略: 连续录像总闸 + 事件录像来源 (架构决策:
             设备端移除连续录像, 事件录像不本地落盘, 证据回放走 GB28181 回放流) -->
        <el-card shadow="never" style="margin-bottom:16px">
          <template #header><b>{{ $t('settings.recStoragePolicy', '录像存储策略') }}</b></template>
          <el-form label-width="130px" style="max-width:680px">
            <el-form-item :label="$t('settings.recContinuous', '设备连续录像')">
              <el-switch v-model="recPolicy.continuousEnabled" />
              <div v-if="!recPolicy.continuousEnabled" style="width:100%;margin-top:4px">
                <el-text type="warning" size="small">{{ $t('settings.recTotalGate', '总闸已关闭：所有监控点均不进行连续录像') }}</el-text>
              </div>
              <div style="width:100%;margin-top:4px">
                <el-text type="info" size="small">{{ $t('settings.recContinuousHint', '关闭后不再进行任何连续录像（设备存储有限，事件证据回放走 NVR 录像）') }}</el-text>
              </div>
            </el-form-item>
            <el-form-item :label="$t('settings.recEventSource', '事件录像来源')">
              <el-radio-group v-model="recPolicy.eventSource">
                <el-radio value="nvr">{{ $t('settings.recSourceNvr', 'NVR 录像（GB28181 回放流）') }}</el-radio>
                <el-radio value="device">{{ $t('settings.recSourceDevice', '设备录像（同款 GB28181）') }}</el-radio>
                <el-radio value="disabled">{{ $t('settings.recSourceDisabled', '禁用事件录像') }}</el-radio>
              </el-radio-group>
              <div style="width:100%;margin-top:4px">
                <el-text type="info" size="small">{{ $t('settings.recEventSourceHint', '事件录像不在盒子本地落盘，告警回放按需从来源设备拉取录像') }}</el-text>
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" size="small" :loading="recPolicySaving" @click="saveRecordingPolicy">
                {{ $t('settings.recSave', '保存') }}
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap">
          <span style="font-size:12px;color:#909399">按监控点/时段/事件触发自动启停录像，支持节假日排除</span>
          <div style="display:flex;gap:8px;align-items:center">
            <el-input v-model="scheduleChannelFilter" placeholder="按监控点ID过滤" size="small" clearable style="width:180px"
              @keyup.enter="fetchSchedules" @clear="fetchSchedules" />
            <el-button size="small" @click="fetchSchedules" :loading="scheduleLoading">{{ $t('settings.scheduleRefresh', '刷新') }}</el-button>
            <el-button type="primary" size="small" @click="openScheduleDialog()">+ {{ $t('settings.addSchedule', '新增计划') }}</el-button>
          </div>
        </div>
        <el-table :data="schedules" v-loading="scheduleLoading" stripe size="small" empty-text="暂无计划，点击「新增计划」创建">
          <el-table-column :label="$t('settings.scheduleName', '计划名称')" width="140">
            <template #default="{ row }">{{ row.schedule_name || `#${row.id}` }}</template>
          </el-table-column>
          <el-table-column :label="$t('settings.scheduleChannel', '监控点')" width="140">
            <template #default="{ row }">{{ row.channel_id }}</template>
          </el-table-column>
          <el-table-column :label="$t('settings.scheduleType', '类型')" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.schedule_type === 'continuous' ? 'success' : row.schedule_type === 'event' ? 'danger' : 'primary'">
                {{ row.schedule_type === 'continuous' ? '连续录像' : row.schedule_type === 'event' ? '事件触发' : '分时段' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('settings.scheduleSegments', '时间段')" min-width="220">
            <template #default="{ row }">
              <span v-if="row.schedule_type === 'continuous'">24小时不间断</span>
              <span v-else-if="row.schedule_type === 'event'">触发类型: {{ row.event_types || '(未设置)' }}</span>
              <div v-else>
                <el-tag v-for="(seg, i) in (row.time_segments || [])" :key="i" size="small" style="margin:2px">
                  {{ DAY_LABELS[seg.day] || `D${seg.day}` }} {{ seg.start }}-{{ seg.end }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="$t('settings.scheduleStream', '码流')" width="80">
            <template #default="{ row }">{{ row.stream_type === 'sub' ? '子码流' : '主码流' }}</template>
          </el-table-column>
          <el-table-column label="预录/延录" width="100">
            <template #default="{ row }">{{ row.pre_record_seconds }}s / {{ row.post_record_seconds }}s</template>
          </el-table-column>
          <el-table-column label="节假日排除" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.holiday_exclusion?.enabled" type="warning" size="small">{{ (row.holiday_exclusion.holiday_dates || []).length }} 天</el-tag>
              <span v-else style="color:#909399;font-size:12px">—</span>
            </template>
          </el-table-column>
          <el-table-column :label="$t('settings.scheduleEnabled', '启用')" width="80">
            <template #default="{ row }">
              <el-switch :model-value="row.enabled" @change="toggleScheduleEnabled(row)" />
            </template>
          </el-table-column>
          <el-table-column :label="$t('settings.actions', '操作')" width="130" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openScheduleDialog(row)">{{ $t('settings.edit', '编辑') }}</el-button>
              <el-button type="danger" size="small" @click="removeSchedule(row)">{{ $t('settings.delete', '删除') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- [REC-STORAGE 2026-09-11] 存储预估 — 自录像回放页迁出 -->
      <el-tab-pane :label="$t('settings.tabStorageEstimate', '存储预估')">
        <h4 style="margin-bottom:16px;color:#303133">存储容量预估计算器</h4>
        <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-start">
          <div style="display:flex;flex-direction:column;gap:16px">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="width:100px">监控点数量:</span>
              <el-input-number v-model="estParams.channel_count" :min="1" :max="256" />
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <span style="width:100px">每日录像时长:</span>
              <el-input-number v-model="estParams.hours_per_day" :min="1" :max="24" /> 小时
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <span style="width:100px">码率:</span>
              <el-input-number v-model="estParams.bitrate_kbps" :min="256" :max="16384" :step="512" /> kbps
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <span style="width:100px">保留天数:</span>
              <el-input-number v-model="estParams.retention_days" :min="1" :max="365" /> 天
            </div>
            <el-button type="primary" @click="calculateStorage">{{ $t('settings.calcEstimate', '计算预估') }}</el-button>
          </div>
          <div v-if="storageEstimate" class="storage-result">
            <div class="storage-row">
              <span class="storage-label">单监控点/天</span>
              <span class="storage-value">{{ storageEstimate.gb_per_channel_per_day }} GB</span>
            </div>
            <div class="storage-row highlight">
              <span class="storage-label">总容量需求</span>
              <span class="storage-value">{{ storageEstimate.total_tb }} TB</span>
            </div>
            <div class="storage-row">
              <span class="storage-label">含20%冗余</span>
              <span class="storage-value">{{ storageEstimate.recommended_disk_tb }} TB</span>
            </div>
            <div class="storage-formula">
              公式: 码率 ÷ 8 × 3600 × 小时/天 × 监控点数 × 天数
            </div>
          </div>
        </div>
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
          <!-- [M2-4 2026-09-21] 启动标识: 升级完成校验锚点 (bootId 变化=设备已重启) -->
          <el-descriptions-item label="启动标识 (bootId)">{{ systemInfo.bootId ? systemInfo.bootId.slice(0, 8) + '…' : '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else :description="$t('settings.loadSystemInfoFail')" />
        <el-divider />
        <div style="display:flex;gap:12px">
          <el-button @click="handleExportConfig">{{ $t('settings.exportConfig') }}</el-button>
          <el-button type="primary" @click="handleImportConfig">{{ $t('settings.importConfig') }}</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- [REC-SCHEDULE 2026-09-11] 录像计划编辑弹窗 (迁自录像回放页, 全字段保留) -->
    <el-dialog v-model="scheduleDialogVisible" :title="editingSchedule?.id ? $t('settings.editSchedule', '编辑录像计划') : $t('settings.addScheduleTitle', '新增录像计划')" width="640px">
      <el-form v-if="editingSchedule" label-width="100px" size="default">
        <el-form-item label="计划名称">
          <el-input v-model="editingSchedule.schedule_name" placeholder="如: 工作日白天录像" />
        </el-form-item>
        <el-form-item label="监控点">
          <el-input v-model="editingSchedule.channel_id" placeholder="监控点ID" :disabled="!!editingSchedule.id" />
        </el-form-item>
        <el-form-item label="录像类型">
          <el-radio-group v-model="editingSchedule.schedule_type">
            <el-radio value="continuous">24小时连续</el-radio>
            <el-radio value="time_segment">分时段</el-radio>
            <el-radio value="event">事件触发</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="editingSchedule.schedule_type === 'event'" label="触发类型">
          <el-input v-model="editingSchedule.event_types" placeholder="如: fire_smoke,perimeter_intrusion" />
        </el-form-item>
        <el-form-item v-if="editingSchedule.schedule_type === 'time_segment'" label="时间段">
          <div v-for="(seg, i) in editingSchedule.time_segments" :key="i" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <el-select v-model="seg.day" style="width:80px">
              <el-option v-for="(label, di) in DAY_LABELS" :key="di" :label="label" :value="di" />
            </el-select>
            <el-time-picker v-model="seg.start" value-format="HH:mm" format="HH:mm" placeholder="开始" style="width:120px" />
            <span>—</span>
            <el-time-picker v-model="seg.end" value-format="HH:mm" format="HH:mm" placeholder="结束" style="width:120px" />
            <el-button type="danger" size="small" circle @click="removeTimeSegment(i)">−</el-button>
          </div>
          <el-button size="small" @click="addTimeSegment">+ 添加时段</el-button>
        </el-form-item>
        <el-form-item label="码流类型">
          <el-radio-group v-model="editingSchedule.stream_type">
            <el-radio value="main">主码流</el-radio>
            <el-radio value="sub">子码流</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="预录时间">
          <el-input-number v-model="editingSchedule.pre_record_seconds" :min="0" :max="300" /> 秒
        </el-form-item>
        <el-form-item label="延录时间">
          <el-input-number v-model="editingSchedule.post_record_seconds" :min="0" :max="600" /> 秒
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editingSchedule.enabled" />
        </el-form-item>
        <!-- [P2-3] 节假日排除策略 (全字段保留) -->
        <el-form-item label="节假日排除">
          <el-switch v-model="editingSchedule.holiday_exclusion!.enabled" />
          <span style="margin-left:8px;color:#909399;font-size:12px">启用后指定日期不录像</span>
        </el-form-item>
        <el-form-item v-if="editingSchedule.holiday_exclusion?.enabled" label="排除日期">
          <el-input
            v-model="editingSchedule.holiday_exclusion.holiday_name"
            placeholder="节假日名称（如：春节）"
            style="margin-bottom:8px"
          />
          <el-select
            v-model="editingSchedule.holiday_exclusion.holiday_dates"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入日期 (YYYY-MM-DD)"
            style="width:100%"
          >
            <el-option label="元旦 01-01" value="2026-01-01" />
            <el-option label="春节 除夕" value="2026-02-09" />
            <el-option label="春节 初一" value="2026-02-10" />
            <el-option label="清明节" value="2026-04-04" />
            <el-option label="劳动节" value="2026-05-01" />
            <el-option label="端午节" value="2026-06-10" />
            <el-option label="中秋节" value="2026-09-17" />
            <el-option label="国庆节" value="2026-10-01" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scheduleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSchedule">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { settingsApi, type BasicSettings, type CloudSettings, type AlarmPolicySettings, type SystemInfo, type RecordingSettings } from '@/api/settings'
import { getModels, activateModel, deactivateModel, type ModelInfo } from '@/api/model'
import configApi from '@/api/config'
// [REC-SCHEDULE 2026-09-11] 录像计划 + 存储预估 (自录像回放页迁出, 复用现有 API 不重复建)
import {
  getRecordingSchedules, createRecordingSchedule, updateRecordingSchedule, deleteRecordingSchedule,
  getStorageEstimate,
  type RecordingSchedule, type StorageEstimate,
} from '@/api/recording'

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
  dedupWindow: 30, minConfidence: 0.5, criticalMaxLatency: 500, linkageActions: ['ptz', 'record', 'push'],
  dedupByTrackEnabled: true, dedupWindowSeconds: 30
}
const alarm = reactive<AlarmPolicySettings>({ ...alarmDefaults })

// ---- [P1-1 2026-09-13] 事件级尺寸过滤 (round2 P1-1): 全局统一门 bbox 归一化
//   面积 min/max (0=关) + 按 alarm_type 覆盖; 即时生效 + 持久化 box_config
const sizeFilterSaving = ref(false)
const sizeFilter = reactive({ enabled: false, default_min_area: 0, default_max_area: 0 })
const sizeFilterOverrideRows = ref<Array<{ type: string; min_area: number; max_area: number }>>([])
const sizeFilterStats = ref<{ size_filtered: number; size_filter_skipped: number } | null>(null)

async function loadSizeFilter() {
  try {
    const res = await settingsApi.getSizeFilter()
    const d = res.data.data
    sizeFilter.enabled = d.enabled
    sizeFilter.default_min_area = d.default_min_area
    sizeFilter.default_max_area = d.default_max_area
    sizeFilterOverrideRows.value = Object.entries(d.overrides || {}).map(
      ([type, v]: [string, any]) => ({ type, min_area: v.min_area, max_area: v.max_area }))
    sizeFilterStats.value = d.stats || null
  } catch (e) {
    console.error('loadSizeFilter failed', e)
  }
}

async function saveSizeFilter() {
  sizeFilterSaving.value = true
  try {
    const overrides: Record<string, { min_area: number; max_area: number }> = {}
    for (const r of sizeFilterOverrideRows.value) {
      const tk = (r.type || '').trim()
      if (tk) overrides[tk] = { min_area: r.min_area || 0, max_area: r.max_area || 0 }
    }
    await settingsApi.saveSizeFilter({
      enabled: sizeFilter.enabled,
      default_min_area: sizeFilter.default_min_area,
      default_max_area: sizeFilter.default_max_area,
      overrides,
    })
    ElMessage.success(t('settings.saveAlarmOk'))
    await loadSizeFilter()  // 回读生效配置 + 最新过滤计数 (REST 往返一致)
  } catch (e: any) {
    ElMessage.error(t('settings.saveFail') + ': ' + (e.message || t('settings.unknownError')))
  } finally {
    sizeFilterSaving.value = false
  }
}

// ---- [P1-2 2026-09-25 免打扰] 全局静默时段: 推送集成层过滤 WS 推送 ----
//   对标萤石「免打扰」; 电话/语音走 executor 独立链路豁免 (对标乐橙口径)。
//   即时生效 (三原子快照) + 持久化 box_config alarm.quiet_hours。
//   start > end = 跨天窗口; start == end 后端拒绝 (歧义, 用开关控制全静默)
const quietHoursSaving = ref(false)
const quietHours = reactive({ enabled: false, start: '22:00', end: '07:00' })
const quietHoursSuppressed = ref<number | null>(null)

async function loadQuietHours() {
  try {
    const res = await settingsApi.getQuietHours()
    const d = res.data.data
    quietHours.enabled = d.enabled
    quietHours.start = d.start || '22:00'
    quietHours.end = d.end || '07:00'
    quietHoursSuppressed.value = d.suppressed ?? null
  } catch (e) {
    console.error('loadQuietHours failed', e)
  }
}

async function saveQuietHours() {
  // 前端前置校验 (后端同样拒绝, 双保险)
  if (quietHours.enabled && quietHours.start === quietHours.end) {
    ElMessage.warning(t('settings.quietHoursSameTip'))
    return
  }
  quietHoursSaving.value = true
  try {
    await settingsApi.saveQuietHours({
      enabled: quietHours.enabled, start: quietHours.start, end: quietHours.end,
    })
    ElMessage.success(t('settings.saveAlarmOk'))
    await loadQuietHours()  // 回读生效配置 + 最新抑制计数 (REST 往返一致)
  } catch (e: any) {
    ElMessage.error(t('settings.saveFail') + ': ' + (e.message || t('settings.unknownError')))
  } finally {
    quietHoursSaving.value = false
  }
}

// ---- [P2 2026-09-25 短信通知] 腾讯云短信直连 (对标乐橙三渠道之短信) ----
//   enabled 且五要素齐时订阅「短信」通道直连腾讯云 (TC3 签名); SecretKey 明文
//   永不回显 (掩码字段默认空, 留空 = 保留现值); 即时生效 + 持久化 alarm.sms_notify。
const smsNotifySaving = ref(false)
const smsNotify = reactive({
  enabled: false, secret_id: '', secret_key: '', sdk_app_id: '',
  sign_name: '', template_id: '', region: 'ap-guangzhou',
})
const smsNotifyParamOrderText = ref('')
const smsNotifySecretKeySet = ref(false)
const smsNotifyConfigured = ref<boolean | null>(null)
const smsSecretKeyPlaceholder = computed(() =>
  smsNotifySecretKeySet.value ? t('settings.smsNotifyKeyKeep') : 'SecretKey')

async function loadSmsNotify() {
  try {
    const res = await settingsApi.getSmsNotify()
    const d = res.data.data
    smsNotify.enabled = d.enabled
    smsNotify.secret_id = d.secret_id ?? ''
    smsNotify.sdk_app_id = d.sdk_app_id ?? ''
    smsNotify.sign_name = d.sign_name ?? ''
    smsNotify.template_id = d.template_id ?? ''
    smsNotify.region = d.region || 'ap-guangzhou'
    smsNotifyParamOrderText.value = (d.param_order ?? []).join(',')
    smsNotifySecretKeySet.value = !!d.secret_key_set
    smsNotify.secret_key = ''  // 明文永不回显 (掩码字段默认空)
    smsNotifyConfigured.value = d.configured ?? null
  } catch (e) {
    console.error('loadSmsNotify failed', e)
  }
}

async function saveSmsNotify() {
  smsNotifySaving.value = true
  try {
    const order = smsNotifyParamOrderText.value.split(',').map(s => s.trim()).filter(Boolean)
    const res = await settingsApi.saveSmsNotify({
      enabled: smsNotify.enabled,
      secret_id: smsNotify.secret_id.trim(),
      secret_key: smsNotify.secret_key,  // 空串 = 保留现值 (掩码场景)
      sdk_app_id: smsNotify.sdk_app_id.trim(),
      sign_name: smsNotify.sign_name.trim(),
      template_id: smsNotify.template_id.trim(),
      region: smsNotify.region.trim() || 'ap-guangzhou',
      param_order: order,
    })
    smsNotifyConfigured.value = res.data.data?.configured ?? null
    ElMessage.success(t('settings.saveAlarmOk'))
    await loadSmsNotify()  // 回读生效配置 (REST 往返一致)
  } catch (e: any) {
    ElMessage.error(t('settings.saveFail') + ': ' + (e.message || t('settings.unknownError')))
  } finally {
    smsNotifySaving.value = false
  }
}

// ---- [P2 2026-09-25 聚合摘要] 每日动态汇总 (对标萤石「今日动态」) ----
//   定时线程到点推送 WS subscription_digest 帧 (近 24h 有动态的订阅);
//   无动态静默。重开 (false→true) 重置当日哨兵, 开启后当天即可收到补推。
const digestSaving = ref(false)
const subscriptionDigest = reactive({ enabled: false, time: '09:00' })
const digestPreviewTotal = ref<number | null>(null)

async function loadSubscriptionDigest() {
  try {
    const res = await settingsApi.getSubscriptionDigest()
    const d = res.data.data
    subscriptionDigest.enabled = d.enabled
    subscriptionDigest.time = d.time || '09:00'
    digestPreviewTotal.value = d.digest?.total ?? 0
  } catch (e) {
    console.error('loadSubscriptionDigest failed', e)
  }
}

async function saveSubscriptionDigest() {
  digestSaving.value = true
  try {
    await settingsApi.saveSubscriptionDigest({
      enabled: subscriptionDigest.enabled, time: subscriptionDigest.time,
    })
    ElMessage.success(t('settings.saveAlarmOk'))
    await loadSubscriptionDigest()  // 回读生效配置 + 最新摘要预览
  } catch (e: any) {
    ElMessage.error(t('settings.saveFail') + ': ' + (e.message || t('settings.unknownError')))
  } finally {
    digestSaving.value = false
  }
}

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
// P0 安全修复: 不再硬编码 API key. 后端优先从环境变量 EXTERNAL_API_KEY / DASHSCOPE_API_KEY 读,
// 字段保留为占位符 (空字符串) — 用户需在后端 .env 中配置 key, 然后从前端读取服务状态.
// 预填 baseUrl (不含敏感信息), 让用户看到默认 endpoint. apiKey 字段从后端 /api/v1/llm/status 获取状态.
const hybridConfig = reactive({
  text:   { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'MiniMax-M3' },
  vision: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', model: 'qwen-vl-plus' },
  video:  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', model: 'qwen-vl-max' },
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

// ---- [REC-SCHEDULE 2026-09-11] 录像计划 (自录像回放页迁出, 独立 CRUD 子模块) ----
const schedules = ref<RecordingSchedule[]>([])
const scheduleLoading = ref(false)
const scheduleDialogVisible = ref(false)
const editingSchedule = ref<RecordingSchedule | null>(null)
const scheduleChannelFilter = ref('')
const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六', '每天']
const defaultSchedule = (): RecordingSchedule => ({
  channel_id: '',
  schedule_name: '',
  schedule_type: 'time_segment',
  time_segments: [{ day: 7, start: '08:00', end: '18:00' }],
  stream_type: 'main',
  pre_record_seconds: 10,
  post_record_seconds: 60,
  enabled: true,
  // [P2-3] 节假日排除策略
  holiday_exclusion: {
    enabled: false,
    holiday_dates: [] as string[],
    holiday_name: '',
  },
})

async function fetchSchedules() {
  scheduleLoading.value = true
  try {
    schedules.value = await getRecordingSchedules(scheduleChannelFilter.value || undefined)
  } catch (e: any) {
    ElMessage.error('加载录像计划失败: ' + (e.message || ''))
  } finally {
    scheduleLoading.value = false
  }
}

function openScheduleDialog(schedule?: RecordingSchedule) {
  editingSchedule.value = schedule
    ? { ...schedule, time_segments: (schedule.time_segments || []).map(s => ({ ...s })) }
    : defaultSchedule()
  // 节假日排除深拷贝, 避免编辑时直接改动列表行对象
  if (schedule?.holiday_exclusion) {
    editingSchedule.value.holiday_exclusion = {
      ...schedule.holiday_exclusion,
      holiday_dates: [...(schedule.holiday_exclusion.holiday_dates || [])],
    }
  }
  scheduleDialogVisible.value = true
}

function addTimeSegment() {
  if (!editingSchedule.value) return
  editingSchedule.value.time_segments.push({ day: 7, start: '08:00', end: '18:00' })
}

function removeTimeSegment(idx: number) {
  if (!editingSchedule.value) return
  editingSchedule.value.time_segments.splice(idx, 1)
}

async function saveSchedule() {
  if (!editingSchedule.value) return
  if (!editingSchedule.value.channel_id) {
    ElMessage.warning('请选择监控点')
    return
  }
  try {
    if (editingSchedule.value.id) {
      await updateRecordingSchedule(editingSchedule.value.id, editingSchedule.value)
      ElMessage.success('录像计划已更新')
    } else {
      await createRecordingSchedule(editingSchedule.value)
      ElMessage.success('录像计划已创建')
    }
    scheduleDialogVisible.value = false
    await fetchSchedules()
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.message || ''))
  }
}

async function toggleScheduleEnabled(schedule: RecordingSchedule) {
  if (!schedule.id) return
  try {
    await updateRecordingSchedule(schedule.id, { enabled: !schedule.enabled })
    schedule.enabled = !schedule.enabled
    ElMessage.success(`计划已${schedule.enabled ? '启用' : '禁用'}`)
  } catch (e: any) {
    ElMessage.error('操作失败: ' + (e.message || ''))
  }
}

function removeSchedule(schedule: RecordingSchedule) {
  if (!schedule.id) return
  ElMessageBox.confirm('确定删除该录像计划？删除后不可恢复。', t('common.tip'), { type: 'warning' })
    .then(async () => {
      try {
        await deleteRecordingSchedule(schedule.id!)
        ElMessage.success('删除成功')
        await fetchSchedules()
      } catch (e: any) {
        ElMessage.error('删除失败: ' + (e.message || ''))
      }
    })
    .catch(() => { /* 用户取消 */ })
}

// ---- [REC-STORAGE 2026-09-11] 存储容量预估 (自录像回放页迁出) ----
const storageEstimate = ref<StorageEstimate | null>(null)
const estParams = ref({ channel_count: 8, hours_per_day: 24, bitrate_kbps: 2048, retention_days: 30 })

async function calculateStorage() {
  try {
    storageEstimate.value = await getStorageEstimate(estParams.value)
  } catch (e: any) {
    ElMessage.error('预估失败: ' + (e.message || ''))
  }
}

// ---- [REC-ARCH 2026-09-17] 录像存储策略 (连续录像总闸 + 事件录像来源) ----
const recPolicy = reactive<RecordingSettings>({ continuousEnabled: false, eventSource: 'nvr' })
const recPolicySaving = ref(false)
async function loadRecordingPolicy() {
  try {
    const res = await settingsApi.getRecording()
    const d = res.data.data
    if (d) {
      recPolicy.continuousEnabled = !!d.continuousEnabled
      recPolicy.eventSource = d.eventSource || 'nvr'
    }
  } catch { /* 后端旧版本无此端点, 静默用默认 (关/nvr) */ }
}
async function saveRecordingPolicy() {
  recPolicySaving.value = true
  try {
    await settingsApi.saveRecording({ ...recPolicy })
    ElMessage.success(t('settings.recSaveOk', '录像存储策略已保存并即时生效'))
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.message || ''))
  } finally {
    recPolicySaving.value = false
  }
}

// ---- 初始化加载 ----
onMounted(async () => {
  loading.value = true
  refreshLlmStatus()  // AI 模型状态 (异步, 不阻塞)
  loadSizeFilter()    // [P1-1 2026-09-13] 尺寸过滤配置 (异步, 不阻塞)
  loadQuietHours()    // [P1-2 2026-09-25] 免打扰配置 (异步, 不阻塞)
  loadSmsNotify()     // [P2 2026-09-25] 腾讯云短信配置 (异步, 不阻塞)
  loadSubscriptionDigest()  // [P2 2026-09-25] 聚合摘要配置 (异步, 不阻塞)
  loadRecordingPolicy()  // [REC-ARCH 2026-09-17] 录像存储策略 (异步, 不阻塞)
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
  fetchSchedules()  // [REC-SCHEDULE 2026-09-11] 录像计划迁入后预加载
})
</script>

<style scoped>

.settings-page :deep(.el-card__body) {
  padding: 20px 24px;
}
.opacity-60 { opacity: 0.6; }
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

/* [REC-STORAGE 2026-09-11] 存储预估结果 (自录像回放页迁出) */
.storage-result {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: linear-gradient(135deg, #e8f5e9, #f3e5f5);
  border-radius: 8px;
  min-width: 280px;
}
.storage-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}
.storage-row.highlight {
  font-size: 18px;
  font-weight: bold;
  color: #0066cc;
  border-top: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
  padding: 12px 0;
}
.storage-label { color: #606266; }
.storage-value { font-weight: bold; }
.storage-formula {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}
</style>
