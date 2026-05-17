<template>
  <div class="openapi-page">
    <div class="page-title">
      <h2>🔌 开放平台</h2>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <!-- API Key 管理 -->
      <el-tab-pane label="API Keys" name="keys">
        <div class="tab-toolbar">
          <span class="tab-desc">管理 API 访问密钥，用于第三方系统集成</span>
          <el-button type="primary" size="small" @click="showCreateKeyDialog = true">
            <el-icon><Plus /></el-icon>创建 API Key
          </el-button>
        </div>
        <el-table :data="apiKeys" stripe>
          <el-table-column prop="name" label="名称" width="180" />
          <el-table-column prop="key" label="Key" min-width="280">
            <template #default="{ row }">
              <code class="api-key-text">{{ maskKey(row.key) }}</code>
              <el-button size="small" link @click="copyKey(row.key)">复制</el-button>
            </template>
          </el-table-column>
          <el-table-column prop="permissions" label="权限" width="200">
            <template #default="{ row }">
              <el-tag v-for="p in row.permissions" :key="p" size="small" style="margin: 2px">{{ p }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="rateLimit" label="速率限制" width="100">
            <template #default="{ row }">{{ row.rateLimit }}/s</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
                {{ row.status === 'active' ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="lastUsedAt" label="最后使用" width="170" />
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" type="danger" link @click="handleRevoke(row)">吊销</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Webhook 管理 -->
      <el-tab-pane label="Webhooks" name="webhooks">
        <div class="tab-toolbar">
          <span class="tab-desc">配置事件回调地址，实时接收告警和设备事件</span>
          <el-button type="primary" size="small" @click="showCreateWebhookDialog = true">
            <el-icon><Plus /></el-icon>添加 Webhook
          </el-button>
        </div>
        <el-table :data="webhooks" stripe>
          <el-table-column prop="name" label="名称" width="160" />
          <el-table-column prop="url" label="URL" min-width="280" />
          <el-table-column prop="events" label="订阅事件" width="240">
            <template #default="{ row }">
              <el-tag v-for="e in row.events" :key="e" size="small" style="margin: 2px">{{ eventLabel(e) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                {{ row.status === 'active' ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="lastDeliveryAt" label="最后投递" width="170" />
          <el-table-column prop="failureCount" label="失败次数" width="90">
            <template #default="{ row }">
              <span :style="{ color: row.failureCount > 0 ? '#f5222d' : '#52c41a' }">{{ row.failureCount }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140">
            <template #default="{ row }">
              <el-button size="small" link type="primary" @click="handleTestWebhook(row)">测试</el-button>
              <el-button size="small" link type="danger" @click="handleDeleteWebhook(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- API 文档 -->
      <el-tab-pane label="API 文档" name="docs">
        <div class="api-docs">
          <div class="doc-section">
            <h3>REST API v1</h3>
            <div class="endpoint-card">
              <span class="method get">GET</span>
              <code>/api/v1/devices</code>
              <span class="endpoint-desc">获取设备列表</span>
            </div>
            <div class="endpoint-card">
              <span class="method post">POST</span>
              <code>/api/v1/devices</code>
              <span class="endpoint-desc">注册新设备</span>
            </div>
            <div class="endpoint-card">
              <span class="method get">GET</span>
              <code>/api/v1/alarms</code>
              <span class="endpoint-desc">获取告警列表</span>
            </div>
            <div class="endpoint-card">
              <span class="method put">PUT</span>
              <code>/api/v1/alarms/:id/handle</code>
              <span class="endpoint-desc">处理告警</span>
            </div>
            <div class="endpoint-card">
              <span class="method get">GET</span>
              <code>/api/v1/stats/security-score</code>
              <span class="endpoint-desc">获取安全评分</span>
            </div>
          </div>
          <div class="doc-section">
            <h3>WebSocket 实时推送</h3>
            <div class="endpoint-card">
              <span class="method ws">WS</span>
              <code>wss://cloud.shieldai.com/ws/realtime</code>
              <span class="endpoint-desc">实时告警/设备状态/Agent 结论推送</span>
            </div>
          </div>
          <div class="doc-section">
            <h3>SDK 下载</h3>
            <el-row :gutter="16">
              <el-col :span="8" v-for="sdk in sdks" :key="sdk.name">
                <el-card shadow="hover" class="sdk-card">
                  <h4>{{ sdk.icon }} {{ sdk.name }}</h4>
                  <p>{{ sdk.desc }}</p>
                  <el-button size="small" type="primary" link>下载</el-button>
                  <el-button size="small" link>文档</el-button>
                </el-card>
              </el-col>
            </el-row>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 创建 API Key 弹窗 -->
    <el-dialog v-model="showCreateKeyDialog" title="创建 API Key" width="480px">
      <el-form label-width="100px">
        <el-form-item label="名称">
          <el-input v-model="newKey.name" placeholder="如：第三方安防平台集成" />
        </el-form-item>
        <el-form-item label="权限">
          <el-checkbox-group v-model="newKey.permissions">
            <el-checkbox label="read">读取</el-checkbox>
            <el-checkbox label="write">写入</el-checkbox>
            <el-checkbox label="alarm">告警</el-checkbox>
            <el-checkbox label="stream">视频流</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="速率限制(RPS)">
          <el-input-number v-model="newKey.rateLimit" :min="1" :max="1000" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker v-model="newKey.expiresAt" type="date" placeholder="永不过期" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateKeyDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCreateKey">创建</el-button>
      </template>
    </el-dialog>

    <!-- 创建 Webhook 弹窗 -->
    <el-dialog v-model="showCreateWebhookDialog" title="添加 Webhook" width="480px">
      <el-form label-width="100px">
        <el-form-item label="名称">
          <el-input v-model="newWebhook.name" placeholder="如：告警通知回调" />
        </el-form-item>
        <el-form-item label="URL">
          <el-input v-model="newWebhook.url" placeholder="https://your-server.com/webhook" />
        </el-form-item>
        <el-form-item label="事件">
          <el-checkbox-group v-model="newWebhook.events">
            <el-checkbox label="alarm.created">告警创建</el-checkbox>
            <el-checkbox label="alarm.handled">告警处理</el-checkbox>
            <el-checkbox label="device.online">设备上线</el-checkbox>
            <el-checkbox label="device.offline">设备离线</el-checkbox>
            <el-checkbox label="agent.conclusion">AI结论</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateWebhookDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCreateWebhook">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCloudStore } from '@/stores/cloud'
import { openPlatformApi, type APIKeyItem, type WebhookItem } from '@/api/open-platform'
import { ElMessage, ElMessageBox } from 'element-plus'

const cloudStore = useCloudStore()
const activeTab = ref('keys')
const showCreateKeyDialog = ref(false)
const showCreateWebhookDialog = ref(false)

const apiKeys = ref<APIKeyItem[]>([])
const webhooks = ref<WebhookItem[]>([])

const newKey = ref({ name: '', permissions: ['read'] as string[], rateLimit: 10, expiresAt: null as Date | null })
const newWebhook = ref({ name: '', url: '', events: ['alarm.created'] as string[] })

const sdks = [
  { icon: '🐍', name: 'Python SDK', desc: '适用于后端集成与数据分析' },
  { icon: '📱', name: 'JavaScript SDK', desc: '适用于Web前端与Node.js' },
  { icon: '☕', name: 'Java SDK', desc: '适用于企业级系统集成' }
]

function maskKey(key: string) {
  if (!key) return '***'
  return key.slice(0, 6) + '****' + key.slice(-4)
}

function eventLabel(e: string) {
  const m: Record<string, string> = {
    'alarm.created': '告警创建', 'alarm.handled': '告警处理',
    'device.online': '设备上线', 'device.offline': '设备离线',
    'agent.conclusion': 'AI结论'
  }
  return m[e] ?? e
}

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key)
    ElMessage.success('已复制到剪贴板')
  } catch { ElMessage.warning('复制失败') }
}

async function loadApiKeys() {
  try {
    const res = await openPlatformApi.getAPIKeys()
    const data = res.data?.data
    apiKeys.value = Array.isArray(data) ? data : data?.items ?? []
  } catch { apiKeys.value = [] }
}

async function loadWebhooks() {
  try {
    const res = await openPlatformApi.getWebhooks()
    const data = res.data?.data
    webhooks.value = Array.isArray(data) ? data : data?.items ?? []
  } catch { webhooks.value = [] }
}

async function handleRevoke(row: APIKeyItem) {
  try {
    await ElMessageBox.confirm(`确认吊销 API Key "${row.name}"？此操作不可恢复！`, '吊销确认', { type: 'error' })
    await openPlatformApi.revokeAPIKey(row.id)
    ElMessage.success('API Key 已吊销')
    loadApiKeys()
  } catch { /* cancelled */ }
}

async function handleTestWebhook(row: WebhookItem) {
  try {
    await openPlatformApi.testWebhook(row.id)
    ElMessage.success(`测试请求已发送至 ${row.url}`)
  } catch { ElMessage.error('测试请求失败') }
}

function handleDeleteWebhook(row: WebhookItem) {
  ElMessageBox.confirm(`确认删除 Webhook "${row.name}"？`, '删除确认', { type: 'warning' }).then(async () => {
    await openPlatformApi.deleteWebhook(row.id)
    ElMessage.success('已删除')
    loadWebhooks()
  }).catch(() => {})
}

async function confirmCreateKey() {
  try {
    await openPlatformApi.createAPIKey({
      name: newKey.value.name,
      permissions: newKey.value.permissions,
      rateLimit: newKey.value.rateLimit,
      expiresAt: newKey.value.expiresAt?.toISOString(),
    })
    ElMessage.success('API Key 创建成功')
    showCreateKeyDialog.value = false
    newKey.value = { name: '', permissions: ['read'], rateLimit: 10, expiresAt: null }
    loadApiKeys()
  } catch { ElMessage.error('创建失败') }
}

async function confirmCreateWebhook() {
  try {
    await openPlatformApi.createWebhook({
      name: newWebhook.value.name,
      url: newWebhook.value.url,
      events: newWebhook.value.events,
    })
    ElMessage.success('Webhook 添加成功')
    showCreateWebhookDialog.value = false
    newWebhook.value = { name: '', url: '', events: ['alarm.created'] }
    loadWebhooks()
  } catch { ElMessage.error('添加失败') }
}

onMounted(async () => {
  await Promise.all([
    cloudStore.fetchPlatformStats(),
    loadApiKeys(),
    loadWebhooks(),
  ])
})
</script>

<style scoped>
.openapi-page { padding: 0 4px; }
.page-title { margin-bottom: 16px; }
.page-title h2 { margin: 0; font-size: 20px; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tab-desc { color: #6b7280; font-size: 13px; }
.api-key-text { font-family: monospace; background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 12px; margin-right: 6px; }
.api-docs { padding: 8px 0; }
.doc-section { margin-bottom: 24px; }
.doc-section h3 { font-size: 16px; margin-bottom: 12px; color: #1f2937; }
.endpoint-card { display: flex; align-items: center; gap: 10px; padding: 8px 12px; margin-bottom: 6px; background: #fafafa; border-radius: 6px; font-size: 13px; }
.method { padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; color: #fff; min-width: 44px; text-align: center; }
.method.get { background: #52c41a; }
.method.post { background: #1890ff; }
.method.put { background: #fa8c16; }
.method.delete { background: #f5222d; }
.method.ws { background: #722ed1; }
.endpoint-desc { color: #6b7280; margin-left: auto; }
.sdk-card { text-align: center; }
.sdk-card h4 { margin: 0 0 8px; font-size: 14px; }
.sdk-card p { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
</style>
