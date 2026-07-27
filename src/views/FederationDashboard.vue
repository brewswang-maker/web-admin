<template>
  <div class="federation-page">
    <div class="page-title">
      <h2>🧠 联邦学习中心</h2>
      <div style="display:flex;gap:8px">
        <el-button type="primary" size="small" @click="showCreateDialog = true"><el-icon><Plus /></el-icon>新建训练任务</el-button>
        <el-button type="success" size="small" @click="handleStartRound" :loading="cloudStore.loading"><el-icon><VideoPlay /></el-icon>执行一轮训练</el-button>
        <el-button size="small" @click="refreshAll"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
    </div>

    <!-- 状态总览 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="6">
        <el-card shadow="hover" class="status-card" :class="statusCardClass">
          <div class="status-indicator">{{ statusIcon }}</div>
          <div class="status-text">{{ statusLabel }}</div>
          <div class="status-sub">当前轮次: R{{ federationStatus?.currentRound ?? '--' }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value blue">{{ federationStatus?.participatingBoxes ?? 0 }}/{{ federationStatus?.totalBoxes ?? 0 }}</div>
          <div class="metric-label">参与盒子</div>
          <div class="metric-sub metric-sub-placeholder" aria-hidden="true"></div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value green">{{ aggregationAccuracy }}%</div>
          <div class="metric-label">聚合精度</div>
          <div class="metric-sub metric-sub-placeholder" aria-hidden="true"></div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value orange">{{ privacyUsed }}%</div>
          <div class="metric-label">隐私预算已用</div>
          <div class="metric-sub">ε = {{ (federationStatus as any)?.privacyBudget?.toFixed(1) ?? '--' }} / {{ (federationStatus as any)?.privacyBudgetTotal ?? '--' }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 精度曲线 + 贡献度 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="12">
        <el-card header="📈 精度曲线">
          <LazyChart :option="accuracyChartOption" height="280px" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="📊 参与盒子贡献度">
          <LazyChart :option="contributionChartOption" height="280px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 隐私保护 + 安全设置 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="12">
        <el-card header="🛡️ 隐私保护状态">
          <div class="privacy-rows">
            <div class="privacy-row">
              <span class="privacy-label">差分隐私预算</span>
              <el-progress :percentage="privacyUsed" :color="privacyUsed > 80 ? '#f5222d' : '#1890ff'" :stroke-width="8" style="flex:1; margin: 0 12px;" />
              <span class="privacy-value">{{ privacyUsed }}%</span>
            </div>
            <div class="privacy-row">
              <span class="privacy-label">安全聚合 (SecAgg)</span>
              <el-tag :type="(federationStatus as any)?.secAggEnabled ? 'success' : 'info'" size="small">{{ (federationStatus as any)?.secAggEnabled ? '✅ 已启用' : '⏸ 未启用' }}</el-tag>
            </div>
            <div class="privacy-row">
              <span class="privacy-label">梯度加密</span>
              <el-tag :type="(federationStatus as any)?.gradientEncryptionEnabled ? 'success' : 'info'" size="small">{{ (federationStatus as any)?.gradientEncryptionEnabled ? '✅ 已启用' : '⏸ 未启用' }}</el-tag>
            </div>
            <div class="privacy-row">
              <span class="privacy-label">联邦蒸馏</span>
              <el-tag type="info" size="small">⏸ 待启动</el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="📋 训练任务列表">
          <el-table :data="federationTasks" stripe size="small" style="width:100%">
            <el-table-column prop="name" label="任务名称" min-width="120" />
            <el-table-column prop="modelType" label="类型" width="70">
              <template #default="{ row }"><el-tag size="small">{{ row.modelType }}</el-tag></template>
            </el-table-column>
            <el-table-column label="轮次" width="80">
              <template #default="{ row }">R{{ row.currentRound ?? 0 }}/{{ row.totalRounds ?? 10 }}</template>
            </el-table-column>
            <el-table-column label="精度" width="70">
              <template #default="{ row }">{{ ((row.accuracy ?? 0) * 100).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="taskStatusTag(row.status) as any" size="small">{{ taskStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button v-if="row.status === 'running'" size="small" link @click="handlePause(row)">暂停</el-button>
                <el-button v-if="row.status === 'paused'" size="small" link type="primary" @click="handleResume(row)">继续</el-button>
                <el-button v-if="row.status !== 'completed'" size="small" link type="danger" @click="handleStop(row)">停止</el-button>
                <el-button size="small" link type="danger" @click="handleDelete(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!federationTasks.length" description="暂无训练任务，点击右上角创建" :image-size="50" style="padding:20px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- [P1-4] 轮次历史 + 参与节点 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="14">
        <el-card header="📊 训练轮次历史">
          <el-table :data="federationRounds" stripe size="small" style="width:100%" max-height="240">
            <el-table-column prop="round" label="轮次" width="70">
              <template #default="{ row }">R{{ row.round }}</template>
            </el-table-column>
            <el-table-column label="精度" width="90">
              <template #default="{ row }">{{ ((row.accuracy ?? 0) * 100).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column label="Loss" width="90">
              <template #default="{ row }">{{ (row.loss ?? 0).toFixed(4) }}</template>
            </el-table-column>
            <el-table-column prop="participants" label="参与节点" width="90" />
            <el-table-column label="隐私预算" width="90">
              <template #default="{ row }">ε={{ (row.dpEpsilon ?? 0).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column prop="timestamp" label="时间" min-width="140" />
          </el-table>
          <el-empty v-if="!federationRounds.length" description="暂无训练记录，点击上方按钮执行训练" :image-size="40" style="padding:16px" />
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card header="🖥️ 参与节点">
          <el-table :data="federationNodes" stripe size="small" style="width:100%" max-height="240">
            <el-table-column prop="client_id" label="节点ID" min-width="100" />
            <el-table-column label="状态" width="70">
              <template #default="{ row }">
                <el-tag :type="row.is_online ? 'success' : 'info'" size="small">{{ row.is_online ? '在线' : '离线' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="rounds_participated" label="轮次" width="60" />
            <el-table-column label="精度" width="70">
              <template #default="{ row }">{{ ((row.local_accuracy ?? 0) * 100).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column prop="device_model" label="设备" width="80" />
          </el-table>
          <el-empty v-if="!federationNodes.length" description="暂无节点" :image-size="40" style="padding:16px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- [FIX] 新建任务弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建联邦训练任务" width="520px" :append-to-body="true">
      <el-form :model="createForm" label-width="110px" size="default">
        <el-form-item label="任务名称">
          <el-input v-model="createForm.name" placeholder="如: 人形检测误报优化" />
        </el-form-item>
        <el-form-item label="模型类型">
          <el-select v-model="createForm.modelType" style="width:100%">
            <el-option value="yolov8s" label="YOLOv8s (人形/车辆)" />
            <el-option value="yolov8n" label="YOLOv8n (轻量目标)" />
            <el-option value="resnet18" label="ResNet18 (图像分类)" />
            <el-option value="mobilenetv3" label="MobileNetV3 (边缘轻量)" />
          </el-select>
        </el-form-item>
        <el-form-item label="总轮次">
          <el-input-number v-model="createForm.totalRounds" :min="1" :max="100" />
        </el-form-item>
        <el-form-item label="最少节点数">
          <el-input-number v-model="createForm.minBoxes" :min="1" :max="10" />
          <span style="margin-left:8px;color:#909399;font-size:12px">单设备设为1</span>
        </el-form-item>
        <el-form-item label="学习率">
          <el-input-number v-model="createForm.learningRate" :min="0.00001" :max="0.01" :step="0.0001" :precision="5" />
        </el-form-item>
        <el-form-item label="批量大小">
          <el-input-number v-model="createForm.batchSize" :min="1" :max="128" />
        </el-form-item>
        <el-divider content-position="center">隐私保护</el-divider>
        <el-form-item label="DP Epsilon (ε)">
          <el-input-number v-model="createForm.dpEpsilon" :min="0.5" :max="10" :step="0.5" :precision="1" />
          <span style="margin-left:8px;color:#909399;font-size:12px">越小越隐私</span>
        </el-form-item>
        <el-form-item label="DP Delta (δ)">
          <el-input-number v-model="createForm.dpDelta" :min="1e-7" :max="1e-3" :step="1e-6" :precision="7" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="cloudStore.loading" @click="handleCreateTask">创建并启动</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useCloudStore } from '@/stores/cloud'
import { ElMessage } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import type { FederationDashboardData } from '@/types/analytics'
import { Plus, VideoPlay } from '@element-plus/icons-vue'

const cloudStore = useCloudStore()

const federationStatus = computed(() => cloudStore.federationData)
const federationTasks = computed(() => cloudStore.federationTasks)
const federationRounds = computed(() => cloudStore.federationRounds)
const federationNodes = computed(() => cloudStore.federationNodes)
const boxContributions = computed(() => cloudStore.federationData?.boxContributions ?? [])

// [FIX] 新建任务弹窗
const showCreateDialog = ref(false)
const createForm = reactive({
  name: '人形检测误报优化',
  modelType: 'yolov8s',
  totalRounds: 10,
  minBoxes: 1,
  learningRate: 0.0001,
  batchSize: 32,
  dpEpsilon: 4.0,
  dpDelta: 0.00001,
})

async function handleCreateTask() {
  if (!createForm.name.trim()) { ElMessage.warning('请输入任务名称'); return }
  await cloudStore.createFederationTask({ ...createForm })
  showCreateDialog.value = false
}

const aggregationAccuracy = computed(() => {
  const v = federationStatus.value?.accuracy
  return v !== undefined ? (v * 100).toFixed(1) : '--'
})

const privacyUsed = computed(() => {
  const used = (federationStatus.value as any)?.privacyBudget ?? 0
  const total = (federationStatus.value as any)?.privacyBudgetTotal ?? 1
  return Math.round((used / total) * 100)
})

const statusCardClass = computed(() => {
  const s = federationStatus.value?.status as string | undefined
  return s === 'running' ? 'running' : s === 'paused' ? 'paused' : s === 'error' ? 'error' : ''
})

const statusIcon = computed(() => {
  const m: Record<string, string> = { running: '🟢', paused: '⏸️', stopped: '⏹️', error: '🔴' }
  return m[federationStatus.value?.status ?? ''] ?? '⚪'
})

const statusLabel = computed(() => {
  const m: Record<string, string> = { running: '运行中', paused: '已暂停', stopped: '已停止', error: '异常' }
  return m[federationStatus.value?.status ?? ''] ?? '未知'
})

function taskStatusTag(s: string) {
  const m: Record<string, string> = { running: 'success', paused: 'warning', completed: 'info', failed: 'danger' }
  return m[s] ?? 'info'
}

function taskStatusLabel(s: string) {
  const m: Record<string, string> = { running: '运行中', paused: '已暂停', completed: '已完成', failed: '失败' }
  return m[s] ?? s
}

// ---- 图表 ----
const accuracyChartOption = computed<any>(() => {
  // [P1-4] 优先使用真实轮次历史数据
  const roundsData = federationRounds.value.length > 0 ? federationRounds.value : (federationStatus.value?.accuracyHistory ?? [])
  const hasRealData = federationRounds.value.length > 0
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: roundsData.map((d: any) => `R${d.round}`) },
    yAxis: { type: 'value' as const, min: 0, max: 100 },
    series: [{
      name: '聚合精度', type: 'line', smooth: true,
      data: roundsData.map((d: any) => +((d.accuracy ?? 0) * 100).toFixed(1)),
      itemStyle: { color: '#722ed1' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(124,58,237,0.2)' }, { offset: 1, color: 'rgba(124,58,237,0)' }] } },
      label: { show: hasRealData, position: 'top', formatter: '{c}%' }
    }, {
      name: 'Loss', type: 'line', smooth: true, yAxisIndex: 0,
      data: roundsData.map((d: any) => +((d.loss ?? 0)).toFixed(4)),
      itemStyle: { color: '#fa8c16' },
      lineStyle: { type: 'dashed' }
    }]
  }
})

const contributionChartOption = computed<any>(() => {
  const data = boxContributions.value
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: '3%', right: '6%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value' as const, name: '%' },
    yAxis: { type: 'category' as const, data: data.map((d: any) => d.name ?? d.boxName), inverse: true },
    series: [{
      name: '贡献度', type: 'bar',
      data: data.map((d: any, i: any) => ({
        value: +(d.contribution * 100).toFixed(1),
        itemStyle: {
          color: ['#722ed1', '#1890ff', '#52c41a', '#fa8c16', '#f5222d', '#13c2c2'][i % 6],
          borderRadius: [0, 4, 4, 0]
        }
      })),
      label: { show: true, position: 'right', formatter: '{c}%' }
    }]
  }
})

async function handlePause(task: any) {
  await cloudStore.controlFederation(task.id, 'pause')
  ElMessage.success(`任务 "${task.name}" 已暂停`)
}

async function handleResume(task: any) {
  await cloudStore.controlFederation(task.id, 'start' as 'resume')
  ElMessage.success(`任务 "${task.name}" 已恢复`)
}

async function handleStop(task: any) {
  await cloudStore.controlFederation(task.id, 'stop')
  ElMessage.success(`任务 "${task.name}" 已停止`)
}

async function handleDelete(task: any) {
  await cloudStore.deleteFederationTask(task.id)
}

async function handleStartRound() {
  await cloudStore.startFederationRound()
}

async function refreshAll() {
  await Promise.all([
    cloudStore.fetchFederationData(),
    cloudStore.fetchFederationTasks(),
    cloudStore.fetchFederationRounds(),
    cloudStore.fetchFederationNodes(),
  ])
}

onMounted(refreshAll)
</script>

<style scoped>
/* .federation-page { padding: 0 4px; } */
.page-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title h2 { margin: 0; font-size: 20px; }
.status-card,
.metric-card {
  min-height: 128px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
  padding: 16px 12px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text-primary);
  box-shadow: var(--shadow-card);
}

.status-card.running { border-color: #52c41a; }
.status-card.paused { border-color: #faad14; }
.status-card.error { border-color: #f5222d; }
.status-indicator { font-size: 32px; line-height: 1; }
.status-text { font-size: 16px; font-weight: 600; margin-top: 8px; }
.status-sub { font-size: 12px; color: var(--app-text-secondary); margin-top: 6px; }
.metric-value { font-size: 28px; font-weight: 700; line-height: 1.2; }
.metric-value.blue { color: #1890ff; }
.metric-value.green { color: #52c41a; }
.metric-value.orange { color: #fa8c16; }
.metric-label { font-size: 13px; color: var(--app-text-secondary); margin-top: 6px; }
.metric-sub {
  min-height: 15px;
  font-size: 11px;
  color: var(--app-text-disabled);
  margin-top: 5px;
}

@media (max-width: 900px) {
  .federation-page :deep(.el-col) {
    margin-bottom: 16px;
  }
}

@media (max-width: 600px) {
  .federation-page :deep(.el-row) {
    row-gap: 16px;
  }
}
.privacy-rows { display: flex; flex-direction: column; gap: 14px; }
.privacy-row { display: flex; align-items: center; }
.privacy-label { width: 120px; font-size: 13px; color: #6b7280; flex-shrink: 0; }
.privacy-value { width: 40px; font-size: 13px; font-weight: 600; text-align: right; flex-shrink: 0; }
</style>
