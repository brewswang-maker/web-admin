<template>
  <div class="channel-detail-page">
    <!-- 返回栏 -->
    <div class="page-header">
      <el-button link @click="goBack">
        <el-icon><ArrowLeft /></el-icon>返回通道列表
      </el-button>
      <div class="header-actions">
        <el-button size="small" @click="loadDetail">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button size="small" type="primary" @click="showEditDrawer = true">
          <el-icon><Setting /></el-icon>编辑配置
        </el-button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" style="text-align:center;padding:80px 0">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <p style="color:#8c8c8c">加载通道详情...</p>
    </div>

    <template v-else-if="detail">
      <!-- 概览卡片 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-card shadow="hover" class="info-card">
            <div class="channel-title">
              <el-tag :type="statusTagType(detail.status) as any" size="default" effect="dark">
                {{ statusLabel(detail.status) }}
              </el-tag>
              <h3>{{ detail.name }}</h3>
            </div>
            <div class="info-row">
              <span class="label">通道 ID</span>
              <span class="value mono">{{ detail.id }}</span>
            </div>
            <div class="info-row">
              <span class="label">通道号</span>
              <span class="value">CH{{ detail.channelNo || 1 }}</span>
            </div>
            <div class="info-row">
              <span class="label">所属设备</span>
              <span class="value mono">{{ detail.deviceId || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="label">接入协议</span>
              <el-tag size="small" type="primary">{{ detail.protocol || 'GB28181' }}</el-tag>
            </div>
            <div class="info-row">
              <span class="label">启用状态</span>
              <el-tag :type="detail.enabled ? 'success' : 'info'" size="small">
                {{ detail.enabled ? '已启用' : '已禁用' }}
              </el-tag>
            </div>
          </el-card>
        </el-col>

        <!-- 音视频参数 -->
        <el-col :span="8">
          <el-card shadow="hover">
            <template #header><span>音视频参数</span></template>
            <div class="info-row">
              <span class="label">编码格式</span>
              <el-tag size="small" type="primary">{{ detail.codec || detail.encoding || 'H.264' }}</el-tag>
            </div>
            <div class="info-row">
              <span class="label">分辨率</span>
              <span class="value">{{ detail.resolution || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="label">帧率</span>
              <span class="value">{{ detail.fps ? detail.fps + ' fps' : '-' }}</span>
            </div>
            <div class="info-row">
              <span class="label">码率</span>
              <span class="value">{{ detail.bitrate ? detail.bitrate + ' Kbps' : '-' }}</span>
            </div>
            <div class="info-row">
              <span class="label">码流类型</span>
              <span class="value">{{ detail.streamType || '主码流' }}</span>
            </div>
          </el-card>
        </el-col>

        <!-- 网络信息 -->
        <el-col :span="8">
          <el-card shadow="hover">
            <template #header><span>网络与设备</span></template>
            <div class="info-row">
              <span class="label">设备类型</span>
              <span class="value">{{ detail.deviceType || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="label">厂商</span>
              <span class="value">{{ detail.vendor || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="label">型号</span>
              <span class="value">{{ detail.model || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="label">IP 地址</span>
              <span class="value mono">{{ detail.ipAddress || '-' }}{{ detail.port ? ':' + detail.port : '' }}</span>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- RTSP 地址 & 流地址 -->
      <el-card style="margin-top:16px" shadow="hover">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>流地址</span>
            <el-tag size="small" type="info">点击地址可复制</el-tag>
          </div>
        </template>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="RTSP 地址">
            <span class="url-cell" @click="copyText(detail.rtspUrl)">
              {{ detail.rtspUrl || '-' }}
              <el-icon v-if="detail.rtspUrl" style="margin-left:4px"><CopyDocument /></el-icon>
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="HLS 地址">
            <span class="url-cell" @click="copyText(detail.streamUrl)">
              {{ detail.streamUrl || '-' }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="GB28181 流 ID">
            <span class="url-cell mono">
              {{ detail.deviceId ? 'gb_' + detail.deviceId : '-' }}
            </span>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 算法插件 -->
      <el-card style="margin-top:16px" shadow="hover">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>算法配置</span>
            <el-button size="small" type="primary" link @click="showAlgoDialog = true">
              <el-icon><Cpu /></el-icon>配置算法
            </el-button>
          </div>
        </template>
        <div v-if="activeAlgos.length" class="algo-list">
          <el-tag
            v-for="algo in activeAlgos"
            :key="algo"
            type="warning"
            size="large"
            closable
            @close="removeAlgo(algo)"
          >
            <el-icon style="margin-right:4px"><Cpu /></el-icon>{{ algo }}
          </el-tag>
        </div>
        <el-empty v-else description="未配置算法" :image-size="60" />
      </el-card>

      <!-- 扩展属性 -->
      <el-card style="margin-top:16px" shadow="hover" v-if="detail.extra && Object.keys(detail.extra).length">
        <template #header><span>扩展属性 (Extra)</span></template>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item
            v-for="(val, key) in detail.extra"
            :key="key"
            :label="String(key)"
          >
            <span class="mono">{{ typeof val === 'object' ? JSON.stringify(val) : val }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 操作 -->
      <div class="action-bar">
        <el-button type="primary" @click="handlePreview">
          <el-icon><VideoPlay /></el-icon>实时预览
        </el-button>
        <el-button @click="handleSnapshot">
          <el-icon><Picture /></el-icon>截图
        </el-button>
        <el-button :type="detail.isRecording ? 'danger' : ''" @click="handleRecordToggle">
          <el-icon><VideoCamera /></el-icon>{{ detail.isRecording ? '停止录像' : '开始录像' }}
        </el-button>
      </div>
    </template>

    <!-- 未找到 -->
    <el-empty v-else description="未找到通道" />

    <!-- 编辑抽屉 -->
    <el-drawer v-model="showEditDrawer" title="编辑通道配置" size="460px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="通道名称">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="编码格式">
          <el-select v-model="editForm.codec" style="width:100%">
            <el-option label="H.264" value="H.264" />
            <el-option label="H.265" value="H.265" />
            <el-option label="MJPEG" value="MJPEG" />
          </el-select>
        </el-form-item>
        <el-form-item label="分辨率">
          <el-select v-model="editForm.resolution" style="width:100%">
            <el-option label="1920×1080 (1080P)" value="1920x1080" />
            <el-option label="1280×720 (720P)" value="1280x720" />
            <el-option label="704×576 (D1)" value="704x576" />
            <el-option label="352×288 (CIF)" value="352x288" />
          </el-select>
        </el-form-item>
        <el-form-item label="帧率 (FPS)">
          <el-input-number v-model="editForm.fps" :min="1" :max="60" />
        </el-form-item>
        <el-form-item label="码率上限">
          <el-select v-model="editForm.bitrate" style="width:100%">
            <el-option label="512 Kbps" :value="512" />
            <el-option label="1 Mbps" :value="1024" />
            <el-option label="2 Mbps" :value="2048" />
            <el-option label="4 Mbps" :value="4096" />
            <el-option label="8 Mbps" :value="8192" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用通道">
          <el-switch v-model="editForm.enabled" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveConfig">保存</el-button>
          <el-button @click="showEditDrawer = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 算法配置对话框 -->
    <el-dialog v-model="showAlgoDialog" title="配置算法插件" width="480px">
      <el-form label-width="100px">
        <el-form-item label="算法插件">
          <el-select v-model="algoPlugins" multiple placeholder="选择算法" style="width:100%">
            <el-option label="无（不启用算法）" value="无" />
            <el-option v-for="m in modelList" :key="m.id" :label="m.name_zh" :value="m.name_zh" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAlgoDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAlgos">应用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { channelApi } from '@/api/channel'
import { http } from '@/api/http'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()

const channelId = computed(() => {
  const id = route.params.id as string
  return id ? decodeURIComponent(id) : ''
})

const loading = ref(true)
const saving = ref(false)
const detail = ref<any>(null)
const showEditDrawer = ref(false)
const showAlgoDialog = ref(false)
const modelList = ref<any[]>([])
const algoPlugins = ref<string[]>([])

const editForm = ref({
  name: '',
  codec: 'H.264',
  resolution: '1920x1080',
  fps: 25,
  bitrate: 2048,
  enabled: true,
})

const activeAlgos = computed(() => {
  if (!detail.value?.algoPlugin) return []
  if (detail.value.algoPlugin === '无' || !detail.value.algoPlugin) return []
  return [detail.value.algoPlugin]
})

function statusTagType(s: string): any {
  if (s === 'online' || s === 'active' || s === 'streaming') return 'success'
  if (s === 'error') return 'danger'
  return 'info'
}

function statusLabel(s: string) {
  if (s === 'online' || s === 'active' || s === 'streaming') return '在线'
  if (s === 'error') return '异常'
  if (s === 'unknown') return '未知'
  return '离线'
}

function goBack() {
  router.back()
}

async function loadModelList() {
  try {
    const res = await fetch('/api/v1/models') as any
    const data = await res.json()
    modelList.value = data?.data?.models ?? []
  } catch { /* silent */ }
}

async function loadDetail() {
  if (!channelId.value) return
  loading.value = true
  try {
    const res = await channelApi.getDetail(channelId.value) as any
    const d = res?.data?.data ?? res?.data ?? {}
    detail.value = d
    // 同步编辑表单
    editForm.value = {
      name: d.name || '',
      codec: d.codec || d.encoding || 'H.264',
      resolution: d.resolution || '1920x1080',
      fps: d.fps || 25,
      bitrate: d.bitrate || 2048,
      enabled: d.enabled ?? true,
    }
    // 同步算法
    algoPlugins.value = d.algoPlugin && d.algoPlugin !== '无' ? [d.algoPlugin] : []
  } catch {
    ElMessage.error('加载通道详情失败')
  } finally {
    loading.value = false
  }
}

function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
    .then(() => ElMessage.success('已复制'))
    .catch(() => ElMessage.warning('复制失败'))
}

function handlePreview() {
  router.push(`/live?deviceId=${detail.value?.deviceId}&channel=${detail.value?.channelNo || 1}`)
}

async function handleSnapshot() {
  try {
    const res = await channelApi.captureSnapshot(channelId.value) as any
    const url = res?.data?.data?.url || res?.data?.data?.snapshot_url
    if (url) {
      ElMessage.success('截图成功')
      window.open(url, '_blank')
    } else {
      ElMessage.warning('截图返回空')
    }
  } catch {
    ElMessage.error('截图失败')
  }
}

async function handleRecordToggle() {
  if (!detail.value) return
  const isRec = detail.value.isRecording
  const action = isRec ? '停止录像' : '开始录像'
  try {
    await ElMessageBox.confirm(`确认${action}？`, action)
    const endpoint = isRec
      ? `/api/v1/channels/${channelId.value}/stop-record`
      : `/api/v1/channels/${channelId.value}/start-record`
    await http.post(endpoint)
    detail.value.isRecording = !isRec
    ElMessage.success(`${action}指令已发送`)
  } catch { /* cancelled */ }
}

async function saveConfig() {
  saving.value = true
  try {
    await channelApi.update(channelId.value, {
      name: editForm.value.name,
      codec: editForm.value.codec,
      resolution: editForm.value.resolution,
      fps: editForm.value.fps,
      bitrate: editForm.value.bitrate,
      enabled: editForm.value.enabled,
    } as any)
    ElMessage.success('配置已保存')
    showEditDrawer.value = false
    await loadDetail()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function saveAlgos() {
  saving.value = true
  try {
    const plugins = algoPlugins.value.filter(p => p !== '无')
    await channelApi.update(channelId.value, {
      algoPlugin: plugins[0] || '无',
    } as any)
    ElMessage.success('算法配置已应用')
    showAlgoDialog.value = false
    await loadDetail()
  } catch {
    ElMessage.error('应用失败')
  } finally {
    saving.value = false
  }
}

async function removeAlgo(_algo: string) {
  try {
    await channelApi.update(channelId.value, { algoPlugin: '无' } as any)
    ElMessage.success('算法已移除')
    await loadDetail()
  } catch {
    ElMessage.error('移除失败')
  }
}

onMounted(() => { loadModelList(); loadDetail() })
watch(channelId, loadDetail)
</script>

<style scoped>
.channel-detail-page { padding: 0 4px; }
.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.header-actions { display: flex; gap: 8px; }

.info-card .channel-title {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
}
.info-card .channel-title h3 {
  margin: 0; font-size: 18px; font-weight: 600;
}

.info-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0; border-bottom: 1px solid #f0f0f0;
}
.info-row:last-child { border-bottom: none; }
.info-row .label { color: #8c8c8c; font-size: 13px; }
.info-row .value { font-weight: 500; font-size: 13px; }
.info-row .value.mono, .mono { font-family: monospace; font-size: 12px; }

.url-cell {
  cursor: pointer; font-family: monospace; font-size: 12px;
  color: var(--el-text-color-secondary); word-break: break-all;
  display: inline-flex; align-items: center;
}
.url-cell:hover { color: var(--el-color-primary); }

.algo-list { display: flex; flex-wrap: wrap; gap: 10px; }

.action-bar {
  display: flex; gap: 10px; margin-top: 20px; padding: 16px 0;
}
</style>
