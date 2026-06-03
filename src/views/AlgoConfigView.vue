<template>
  <div class="algo-config-view">
    <div class="page-header">
      <h2 class="page-title">{{ $t('algoConfig', '算法配置') }}</h2>
      <span class="page-desc">{{ $t('algoConfigDesc', '为每个通道配置推理算法、参数及检测区域') }}</span>
    </div>

    <div class="layout-body">
      <!-- Left: Channel List -->
      <el-card class="panel-left" shadow="never">
        <template #header>
          <div class="panel-title">
            <span>{{ $t('channelList', '通道列表') }}</span>
            <el-button size="small" text @click="loadData" :loading="loading">
              <el-icon><Refresh /></el-icon>
            </el-button>
          </div>
        </template>
        <el-table
          :data="channels"
          highlight-current-row
          size="small"
          @current-change="onChannelSelect"
          :row-class-name="rowClassName"
          v-loading="loading"
        >
          <el-table-column prop="channelId" :label="$t('channelNo', '通道号')" width="80" />
          <el-table-column prop="name" :label="$t('channelName', '名称')" show-overflow-tooltip />
          <el-table-column :label="$t('algorithm', '算法')" width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <el-tag v-if="row.algoPlugin" size="small" type="primary">{{ row.algoPlugin }}</el-tag>
              <span v-else class="text-muted">{{ $t('notConfigured', '未配置') }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="$t('status', '状态')" width="68" align="center">
            <template #default="{ row }">
              <el-tag :type="row.inferenceEnabled ? 'success' : 'info'" size="small" effect="dark">
                {{ row.inferenceEnabled ? 'ON' : 'OFF' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- Right: Configuration Area -->
      <div class="panel-right">
        <el-card v-if="!selected" shadow="never" class="empty-state">
          <el-empty :description="$t('selectChannelHint', '请从左侧选择一个通道进行配置')" />
        </el-card>

        <template v-else>
          <el-card shadow="never" class="config-card">
            <template #header>
              <div class="config-header">
                <span>{{ selected.channelId }} - {{ selected.name }}</span>
                <el-switch v-model="form.enabled" :active-text="$t('enable', '启用')" :inactive-text="$t('disable', '停用')" />
              </div>
            </template>

            <el-form :model="form" label-width="110px" size="default" class="config-form">
              <el-row :gutter="24">
                <el-col :span="12">
                  <el-form-item :label="$t('inferenceAlgo', '推理算法')">
                    <el-select v-model="form.algorithm" :placeholder="$t('selectAlgo', '选择算法')" style="width:100%">
                      <el-option v-for="a in algorithmOptions" :key="a.value" :label="a.label" :value="a.value" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item :label="$t('inferenceMode', '推理模式')">
                    <el-radio-group v-model="form.inferenceMode">
                      <el-radio value="snapshot">Snapshot {{ $t('snapshotMode', '抓拍') }}</el-radio>
                      <el-radio value="streaming">Streaming {{ $t('streamingMode', '连续') }}</el-radio>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="24">
                <el-col :span="12">
                  <el-form-item :label="$t('confidenceThreshold', '置信度阈值')">
                    <el-slider v-model="form.confidence" :min="0.1" :max="1" :step="0.05" show-input input-size="small" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item :label="$t('nmsThreshold', 'NMS 阈值')">
                    <el-slider v-model="form.nmsThreshold" :min="0.1" :max="1" :step="0.05" show-input input-size="small" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-form-item :label="$t('inferenceInterval', '推理间隔')">
                <el-input-number v-model="form.interval" :min="50" :max="10000" :step="50" controls-position="right" />
                <span class="form-hint">ms ({{ $t('perFrameInterval', '每帧间隔') }})</span>
              </el-form-item>
            </el-form>
          </el-card>

          <el-card shadow="never" class="roi-card">
            <template #header>
              <div class="config-header">
                <span>ROI {{ $t('detectionZone', '检测区域') }}</span>
                <el-button type="primary" text size="small" @click="clearRoi">{{ $t('clearZone', '清除区域') }}</el-button>
              </div>
            </template>
            <div class="roi-placeholder">
              <div class="roi-message">{{ $t('roiEditorHint', 'ROI Editor - 选择通道配置检测区域') }}</div>
              <div class="roi-hint">{{ $t('roiDrawHint', '在画布上绘制多边形来定义检测区域，未绘制则默认全帧检测') }}</div>
            </div>
          </el-card>
        </template>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div class="bottom-bar">
      <el-button @click="resetForm">{{ $t('reset', '重置') }}</el-button>
      <el-button type="primary" @click="saveConfig" :loading="saving">{{ $t('save', '保存配置') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AlgoConfigView.vue — 算法配置页面
 *
 * 对接后端 API 实现：
 * 1. 从 GET /channels 加载通道列表
 * 2. 从 GET /inference/channels 加载已绑定算法的推理状态
 * 3. 保存时调用 POST /inference/schedule/start 或 /stop 控制后端推理调度
 */
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { channelApi } from '@/api/channel'
import { startSchedule, stopSchedule, getInferenceChannels } from '@/api/inference'
import type { ScheduledChannel } from '@/api/inference'
import algorithmsApi from '@/api/algorithms'
import type { AlgorithmInfo } from '@/api/algorithms'

/** 通道项（合并通道信息 + 推理调度状态） */
interface ChannelItem {
  channelId: string
  name: string
  deviceId: string
  parentDeviceId: string
  online: boolean
  algoPlugin: string
  inferenceEnabled: boolean
  confidence: number
  nmsThreshold: number
  interval: number
  inferenceMode: 'snapshot' | 'streaming'
  totalInferences: number
  totalDetections: number
  running: boolean
}

const channels = ref<ChannelItem[]>([])
const algorithmOptions = ref<{ label: string; value: string }[]>([])
const scheduledMap = ref<Map<string, ScheduledChannel>>(new Map())
const selected = ref<ChannelItem | null>(null)
const loading = ref(false)
const saving = ref(false)

const form = reactive({
  enabled: false,
  algorithm: '',
  confidence: 0.5,
  nmsThreshold: 0.45,
  interval: 3000,
  inferenceMode: 'snapshot' as 'snapshot' | 'streaming',
})

onMounted(() => {
  loadData()
})

/** 加载通道列表 + 推理状态 + 算法列表 */
async function loadData() {
  loading.value = true
  try {
    const [chRes, inferRes, algoRes] = await Promise.allSettled([
      channelApi.getList({ pageSize: 200 }),
      getInferenceChannels(),
      algorithmsApi.list(),
    ])

    // 解析推理调度通道（建立 channel_id → ScheduledChannel 映射）
    const sm = new Map<string, ScheduledChannel>()
    if (inferRes.status === 'fulfilled') {
      const raw = inferRes.value?.data
      const list: ScheduledChannel[] = raw?.data?.channels ?? raw?.channels ?? []
      for (const sc of list) {
        sm.set(sc.channel_id, sc)
      }
    }
    scheduledMap.value = sm

    // 解析通道列表
    const channelList: ChannelItem[] = []
    if (chRes.status === 'fulfilled') {
      const raw = chRes.value?.data
      const items = raw?.data?.items ?? raw?.data ?? raw?.items ?? []
      for (const ch of items) {
        const id = ch.channel_id ?? ch.channelId ?? ch.id ?? ''
        const scheduled = sm.get(id)
        channelList.push({
          channelId: id,
          name: ch.channel_name ?? ch.name ?? ch.channelName ?? id,
          deviceId: ch.device_id ?? ch.deviceId ?? '',
          parentDeviceId: ch.parent_device_id ?? ch.parentDeviceId ?? '',
          online: ch.online ?? true,
          algoPlugin: scheduled?.algo_plugin ?? '',
          inferenceEnabled: scheduled?.enabled ?? false,
          confidence: 0.5,
          nmsThreshold: 0.45,
          interval: scheduled?.interval_ms ?? 3000,
          inferenceMode: 'snapshot',
          totalInferences: scheduled?.total_inferences ?? 0,
          totalDetections: scheduled?.total_detections ?? 0,
          running: scheduled?.running ?? false,
        })
      }
    }
    // 如果通道列表为空但推理调度有数据，用调度数据补充
    if (channelList.length === 0 && sm.size > 0) {
      for (const [cid, sc] of sm) {
        channelList.push({
          channelId: cid,
          name: sc.channel_id,
          deviceId: sc.device_id,
          parentDeviceId: '',
          online: true,
          algoPlugin: sc.algo_plugin,
          inferenceEnabled: sc.enabled,
          confidence: 0.5,
          nmsThreshold: 0.45,
          interval: sc.interval_ms,
          inferenceMode: 'snapshot',
          totalInferences: sc.total_inferences,
          totalDetections: sc.total_detections,
          running: sc.running,
        })
      }
    }
    channels.value = channelList

    // 解析算法列表
    if (algoRes.status === 'fulfilled') {
      const raw = algoRes.value?.data
      const algos: AlgorithmInfo[] = raw?.data?.algorithms ?? raw?.data ?? raw?.algorithms ?? []
      algorithmOptions.value = algos
        .filter(a => a.enabled)
        .map(a => ({
          label: a.name_zh || a.name_en || a.name || a.algo_id || a.id,
          value: a.algo_id || a.id,
        }))
    }
    // 如果算法列表为空，提供默认选项
    if (algorithmOptions.value.length === 0) {
      algorithmOptions.value = [
        { label: 'YOLOv8-Nano (快速)', value: 'yolov8n' },
        { label: 'YOLOv8-Small (均衡)', value: 'yolov8s' },
      ]
    }
  } catch (e: any) {
    console.warn('[AlgoConfig] 数据加载失败:', e?.message || e)
  } finally {
    loading.value = false
  }
}

function onChannelSelect(row: ChannelItem | null) {
  selected.value = row
  if (row) {
    form.enabled = row.inferenceEnabled
    form.algorithm = row.algoPlugin || 'yolov8n'
    form.confidence = row.confidence
    form.nmsThreshold = row.nmsThreshold
    form.interval = row.interval
    form.inferenceMode = row.inferenceMode
  }
}

function rowClassName({ row }: { row: ChannelItem }) {
  return selected.value?.channelId === row.channelId ? 'current-row' : ''
}

function resetForm() {
  if (selected.value) onChannelSelect(selected.value)
  ElMessage.info('已重置为原始配置')
}

function clearRoi() {
  ElMessage.info('ROI 区域已清除，将使用全帧检测')
}

/** 保存配置：根据启用/停用调用后端推理调度 API */
async function saveConfig() {
  if (!selected.value) return
  saving.value = true

  const ch = selected.value
  try {
    if (form.enabled) {
      // 启用推理调度
      const deviceId = ch.deviceId || ch.parentDeviceId || ch.channelId
      await startSchedule(
        ch.channelId,
        deviceId,
        form.interval,
        form.algorithm || 'yolov8n',
      )
      ch.algoPlugin = form.algorithm
      ch.inferenceEnabled = true
      ch.interval = form.interval
      ch.inferenceMode = form.inferenceMode
      ElMessage.success(`通道 ${ch.name} 推理调度已启动 — 算法将在后台持续运行`)
    } else {
      // 停用推理调度
      await stopSchedule(ch.channelId)
      ch.inferenceEnabled = false
      ch.algoPlugin = ''
      ElMessage.success(`通道 ${ch.name} 推理调度已停止`)
    }
  } catch (e: any) {
    ElMessage.error(`配置保存失败: ${e?.message || e}`)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.algo-config-view {
  --bg-page: #f5f7fa; --bg-card: #fff; --border-light: #e8ecf1;
  --text-primary: #1d2129; --text-secondary: #6b7785; --panel-left-width: 380px;
  display: flex; flex-direction: column; height: 100%; background: var(--bg-page);
}
.page-header { padding: 16px 24px; background: var(--bg-card); border-bottom: 1px solid var(--border-light); }
.page-title { margin: 0 0 4px; font-size: 18px; color: var(--text-primary); }
.page-desc { font-size: 13px; color: var(--text-secondary); }
.layout-body { flex: 1; display: flex; gap: 16px; padding: 16px 24px; overflow: hidden; }
.panel-left { width: var(--panel-left-width); flex-shrink: 0; overflow-y: auto; }
.panel-left :deep(.el-card__body) { padding: 0; }
.panel-title { font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
.text-muted { color: var(--text-secondary); font-size: 12px; }
.panel-right { flex: 1; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; }
.config-card :deep(.el-card__body), .roi-card :deep(.el-card__body) { padding: 20px 24px; }
.config-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 14px; }
.config-form .form-hint { margin-left: 12px; color: var(--text-secondary); font-size: 12px; }
.roi-placeholder {
  height: 260px; background: var(--bg-page); border: 2px dashed var(--border-light);
  border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
}
.roi-message { font-size: 15px; color: var(--text-primary); font-weight: 500; }
.roi-hint { font-size: 12px; color: var(--text-secondary); }
.bottom-bar {
  padding: 12px 24px; background: var(--bg-card); border-top: 1px solid var(--border-light);
  display: flex; justify-content: flex-end; gap: 12px;
}
</style>
