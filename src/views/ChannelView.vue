<template>
  <div class="channel-page">
    <!-- 返回栏 -->
    <div class="page-header">
      <div class="header-left">
        <el-button link @click="$router.push(`/devices/${deviceId}`)">
          <el-icon><ArrowLeft /></el-icon>返回设备详情
        </el-button>
        <el-divider direction="vertical" />
        <span class="device-label">
          <el-tag size="small" type="info">{{ device?.deviceType }}</el-tag>
          <strong>{{ device?.name }}</strong>
          <span class="ip">{{ device?.ip }}</span>
        </span>
      </div>
      <div class="header-right">
        <el-tag :type="deviceOnline ? 'success' : 'danger'" size="small" effect="dark">
          {{ deviceOnline ? '设备在线' : '设备离线' }}
        </el-tag>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" style="text-align:center;padding:80px 0">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <p style="color:#8c8c8c">加载通道信息...</p>
    </div>

    <!-- 空状态 -->
    <el-empty v-else-if="!channels.length" description="该设备暂无通道" />

    <!-- 通道卡片列表 -->
    <div v-else class="channel-grid">
      <el-card v-for="ch in channels" :key="ch.id" shadow="hover" class="channel-card">
        <!-- 卡片头部 -->
        <template #header>
          <div class="card-header">
            <div class="channel-identity">
              <span class="channel-no">CH{{ ch.channelNo }}</span>
              <span class="channel-name">{{ ch.name }}</span>
            </div>
            <div class="channel-status-badges">
              <el-tooltip :content="statusTooltip(ch.status)" placement="top">
                <el-tag :type="streamTagType(ch.status) as any" size="small" effect="dark">
                  {{ streamLabel(ch.status) }}
                </el-tag>
              </el-tooltip>
              <el-tooltip :content="ch.isRecording ? '录像中' : '未录像'" placement="top">
                <el-tag :type="ch.isRecording ? 'danger' : 'info'" size="small">
                  <el-icon style="margin-right:2px"><VideoCamera /></el-icon>{{ ch.isRecording ? 'REC' : '停止' }}
                </el-tag>
              </el-tooltip>
            </div>
          </div>
        </template>

        <!-- 卡片内容 -->
        <div class="card-body">
          <!-- 基本信息 -->
          <el-descriptions :column="2" border size="small" title="基本信息">
            <el-descriptions-item label="通道号">{{ ch.channelNo }}</el-descriptions-item>
            <el-descriptions-item label="通道名称">{{ ch.name }}</el-descriptions-item>
            <el-descriptions-item label="分辨率">{{ ch.resolution || '-' }}</el-descriptions-item>
            <el-descriptions-item label="编码格式">
              <el-tag size="small" type="primary">{{ ch.codec || 'Unknown' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="帧率">{{ ch.fps ? ch.fps + ' fps' : '-' }}</el-descriptions-item>
            <el-descriptions-item label="码率">{{ ch.bitrate || '-' }}</el-descriptions-item>
            <el-descriptions-item label="RTSP 地址" :span="2">
              <span class="rtsp-url">{{ ch.rtspUrl || '-' }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 性能指标 -->
          <el-descriptions :column="3" border size="small" title="性能指标" style="margin-top:12px">
            <el-descriptions-item label="码率">
              <span :class="['metric-value', bitrateClass(ch.bitrate)]">{{ ch.bitrate || '-' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="延迟">
              <span :class="['metric-value', ch.latency > 100 ? 'danger' : ch.latency > 50 ? 'warning' : '']">
                {{ ch.latency > 0 ? ch.latency + ' ms' : '-' }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="丢包率">
              <span :class="['metric-value', ch.packetLoss > 5 ? 'danger' : ch.packetLoss > 1 ? 'warning' : '']">
                {{ ch.packetLoss > 0 ? ch.packetLoss.toFixed(1) + '%' : '-' }}
              </span>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 算法插件 -->
          <el-descriptions :column="1" border size="small" title="算法配置" style="margin-top:12px">
            <el-descriptions-item label="当前算法">
              <el-tag v-if="ch.algoPlugin && ch.algoPlugin !== '无'" size="small" type="warning">
                {{ ch.algoPlugin }}
                <el-icon style="margin-left:4px"><Setting /></el-icon>
              </el-tag>
              <span v-else style="color:#8c8c8c">未配置</span>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 操作按钮 -->
          <div class="channel-actions">
            <el-button size="small" type="primary" @click="handlePreview(ch)">
              <el-icon><VideoPlay /></el-icon>实时预览
            </el-button>
            <el-button size="small" @click="handleSnapshot(ch)">
              <el-icon><Picture /></el-icon>截图
            </el-button>
            <el-button size="small" :type="ch.isRecording ? 'danger' : ''" @click="handleRecordToggle(ch)">
              <el-icon><VideoCamera /></el-icon>{{ ch.isRecording ? '停止录像' : '开始录像' }}
            </el-button>
            <el-dropdown trigger="click" @command="(cmd: string) => handleChannelCommand(cmd, ch)">
              <el-button size="small">
                更多<el-icon style="margin-left:4px"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="config">
                    <el-icon><Setting /></el-icon>参数配置
                  </el-dropdown-item>
                  <el-dropdown-item command="algo">
                    <el-icon><Cpu /></el-icon>算法插件
                  </el-dropdown-item>
                  <el-dropdown-item command="copyRtsp">
                    <el-icon><CopyDocument /></el-icon>复制 RTSP 地址
                  </el-dropdown-item>
                  <el-dropdown-item command="refresh">
                    <el-icon><Refresh /></el-icon>刷新通道信息
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 参数配置对话框 -->
    <el-dialog v-model="showConfigDialog" title="通道参数配置" width="480px">
      <el-form v-if="currentChannel" :model="configForm" label-width="100px">
        <el-form-item label="通道名称">
          <el-input v-model="configForm.name" />
        </el-form-item>
        <el-form-item label="分辨率">
          <el-select v-model="configForm.resolution" style="width:100%">
            <el-option label="1920×1080 (1080P)" value="1920x1080" />
            <el-option label="1280×720 (720P)" value="1280x720" />
            <el-option label="704×576 (D1)" value="704x576" />
            <el-option label="352×288 (CIF)" value="352x288" />
          </el-select>
        </el-form-item>
        <el-form-item label="帧率 (FPS)">
          <el-input-number v-model="configForm.fps" :min="1" :max="60" />
        </el-form-item>
        <el-form-item label="编码格式">
          <el-select v-model="configForm.codec" style="width:100%">
            <el-option label="H.264" value="H.264" />
            <el-option label="H.265" value="H.265" />
            <el-option label="MJPEG" value="MJPEG" />
          </el-select>
        </el-form-item>
        <el-form-item label="码率上限">
          <el-select v-model="configForm.bitrate" style="width:100%">
            <el-option label="512 Kbps" value="512 Kbps" />
            <el-option label="1 Mbps" value="1 Mbps" />
            <el-option label="2 Mbps" value="2 Mbps" />
            <el-option label="4 Mbps" value="4 Mbps" />
            <el-option label="8 Mbps" value="8 Mbps" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用通道">
          <el-switch v-model="configForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveChannelConfig">保存配置</el-button>
      </template>
    </el-dialog>

    <!-- 算法插件设置对话框 -->
    <el-dialog v-model="showAlgoDialog" title="算法插件设置" width="480px">
      <el-form v-if="currentChannel" label-width="100px">
        <el-form-item label="算法插件">
          <el-select v-model="algoForm.plugin" style="width:100%">
            <el-option label="无" value="无" />
            <el-option label="入侵检测" value="入侵检测" />
            <el-option label="烟火检测" value="烟火检测" />
            <el-option label="安全帽检测" value="安全帽检测" />
            <el-option label="人脸检测" value="人脸检测" />
            <el-option label="徘徊检测" value="徘徊检测" />
            <el-option label="车牌识别" value="车牌识别" />
          </el-select>
        </el-form-item>
        <el-form-item label="检测灵敏度">
          <el-slider v-model="algoForm.sensitivity" :min="1" :max="10" show-stops />
        </el-form-item>
        <el-form-item label="检测间隔(秒)">
          <el-input-number v-model="algoForm.interval" :min="1" :max="60" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAlgoDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAlgoConfig">应用插件</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import { getDeviceChannels, updateChannel } from '@/api/devices'
import { http } from '@/api/http'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Channel, DeviceDetail } from '@/types/device'

const route = useRoute()
const router = useRouter()
const deviceStore = useDeviceStore()

const deviceId = computed(() => route.params.deviceId as string)
const device = computed(() => deviceStore.currentDevice)
const deviceOnline = computed(() => device.value?.status === 'online')

const channels = ref<Channel[]>([])
const loading = ref(true)
const saving = ref(false)
const showConfigDialog = ref(false)
const showAlgoDialog = ref(false)
const currentChannel = ref<Channel | null>(null)

// ---- 配置表单 ----
const configForm = ref({ name: '', resolution: '1920x1080', fps: 25, codec: 'H.264' as Channel['codec'], bitrate: 0, enabled: true })
const algoForm = ref({ plugin: '无', sensitivity: 5, interval: 5 })

// ---- 状态标签 ----
function streamTagType(s: string) {
  return s === 'streaming' ? 'success' : s === 'error' ? 'danger' : 'info'
}
function streamLabel(s: string) {
  return s === 'streaming' ? '推流中' : s === 'error' ? '异常' : '空闲'
}
function statusTooltip(s: string) {
  return s === 'streaming' ? '通道正在推送视频流' : s === 'error' ? '通道发生错误，需检查' : '通道空闲，未推流'
}
function bitrateClass(bitrate: string | number) {
  if (!bitrate || bitrate === '-') return ''
  const val = parseFloat(String(bitrate))
  if (isNaN(val)) return ''
  return val > 4 ? 'warning' : ''
}

// ---- 数据加载 ----
async function loadChannels() {
  loading.value = true
  try {
    // 先加载设备详情
    await deviceStore.fetchDeviceDetail(deviceId.value)

    // 再加载通道列表
    const chRes = await getDeviceChannels(deviceId.value) as any
    const chs: any[] = chRes?.data?.data ?? chRes?.data ?? chRes
    channels.value = chs.length
      ? chs
      : (device.value as any)?.channels?.map((ch: any, idx: any) => ({
          ...ch,
          codec: (ch as any).codec || 'H.264',
          isRecording: (ch as any).isRecording ?? false,
          latency: (ch as any).latency ?? 0,
          packetLoss: (ch as any).packetLoss ?? 0,
          channelNo: ch.channelNo ?? idx + 1,
        })) ?? []
  } catch {
    ElMessage.error('加载通道信息失败')
  } finally {
    loading.value = false
  }
}

// ---- 操作 ----
function handlePreview(ch: Channel) {
  router.push(`/live?deviceId=${deviceId.value}&channel=${ch.channelNo}`)
}

function handleSnapshot(_ch: Channel) {
  ElMessage.info('截图功能开发中')
}

async function handleRecordToggle(ch: Channel) {
  const action = ch.isRecording ? '停止录像' : '开始录像'
  try {
    await ElMessageBox.confirm(`确认对通道 ${ch.name} ${action}？`, action)
    const endpoint = ch.isRecording ? `/api/v1/channels/${ch.id}/stop-record` : `/api/v1/channels/${ch.id}/start-record`
    await http.post(endpoint)
    ch.isRecording = !ch.isRecording
    ElMessage.success(`${action}指令已发送`)
  } catch { /* cancelled */ }
}

function handleChannelCommand(cmd: string, ch: Channel) {
  switch (cmd) {
    case 'config':
      currentChannel.value = ch
      configForm.value = {
        name: ch.name,
        resolution: ch.resolution || '1920x1080',
        fps: Number(ch.fps) || 25,
        codec: ch.codec || 'H.264',
        bitrate: Number(String(ch.bitrate).replace(/[^0-9.]/g, '')) || 2,
        enabled: (ch as any).enabled ?? true,
      }
      showConfigDialog.value = true
      break
    case 'algo':
      currentChannel.value = ch
      algoForm.value = {
        plugin: ch.algoPlugin || '无',
        sensitivity: 5,
        interval: 5,
      }
      showAlgoDialog.value = true
      break
    case 'copyRtsp':
      navigator.clipboard.writeText(ch.rtspUrl).then(() => ElMessage.success('RTSP 地址已复制'))
        .catch(() => ElMessage.warning('复制失败，请手动复制'))
      break
    case 'refresh':
      loadChannels()
      break
  }
}

async function saveChannelConfig() {
  if (!currentChannel.value) return
  saving.value = true
  try {
    await updateChannel(currentChannel.value.id, {
      name: configForm.value.name,
      resolution: configForm.value.resolution,
      fps: configForm.value.fps,
      codec: configForm.value.codec,
      bitrate: typeof configForm.value.bitrate === 'string' ? parseFloat(configForm.value.bitrate) : configForm.value.bitrate,
    } as any)
    ElMessage.success('通道配置已保存')
    showConfigDialog.value = false
    loadChannels()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function saveAlgoConfig() {
  if (!currentChannel.value) return
  saving.value = true
  try {
    await updateChannel(currentChannel.value.id, {
      algoPlugin: algoForm.value.plugin,
    })
    ElMessage.success('算法插件已应用')
    showAlgoDialog.value = false
    loadChannels()
  } catch {
    ElMessage.error('应用失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadChannels)
</script>

<style scoped>
.channel-page { padding: 0 4px; }

/* 头部 */
.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px; padding: 12px 16px;
  background: var(--el-bg-color); border-radius: 8px;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.device-label { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.device-label .ip { color: var(--el-text-color-secondary); font-size: 13px; font-family: monospace; }
.header-right { display: flex; gap: 8px; }

/* 通道卡片网格 */
.channel-grid { display: flex; flex-direction: column; gap: 16px; }
.channel-card { border-left: 3px solid var(--el-color-primary); }
.channel-card:hover { border-left-color: var(--el-color-success); }

/* 卡片头部 */
.card-header { display: flex; justify-content: space-between; align-items: center; }
.channel-identity { display: flex; align-items: center; gap: 10px; }
.channel-no {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 24px; border-radius: 4px;
  background: var(--el-color-primary-light-9); color: var(--el-color-primary);
  font-weight: 700; font-size: 12px; font-family: monospace;
}
.channel-name { font-weight: 600; font-size: 15px; }
.channel-status-badges { display: flex; gap: 6px; }

/* 卡片内容 */
.card-body { padding: 0 4px; }
.rtsp-url { font-family: monospace; font-size: 12px; color: var(--el-text-color-secondary); word-break: break-all; }

/* 性能指标 */
.metric-value { font-weight: 700; font-size: 14px; }
.metric-value.warning { color: var(--el-color-warning); }
.metric-value.danger { color: var(--el-color-danger); }

/* 操作按钮 */
.channel-actions { display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--el-border-color-lighter); }
</style>
