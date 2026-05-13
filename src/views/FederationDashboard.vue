<template>
  <div class="federation-page">
    <div class="page-title">
      <h2>🧠 联邦学习中心</h2>
      <el-button @click="refreshAll"><el-icon><Refresh /></el-icon>刷新</el-button>
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
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value green">{{ aggregationAccuracy }}%</div>
          <div class="metric-label">聚合精度</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value orange">{{ privacyUsed }}%</div>
          <div class="metric-label">隐私预算已用</div>
          <div class="metric-sub">ε = {{ federationStatus?.privacyBudget?.toFixed(1) ?? '--' }} / {{ federationStatus?.privacyBudgetTotal ?? '--' }}</div>
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
              <el-tag :type="federationStatus?.secAggEnabled ? 'success' : 'info'" size="small">{{ federationStatus?.secAggEnabled ? '✅ 已启用' : '⏸ 未启用' }}</el-tag>
            </div>
            <div class="privacy-row">
              <span class="privacy-label">梯度加密</span>
              <el-tag :type="federationStatus?.gradientEncryptionEnabled ? 'success' : 'info'" size="small">{{ federationStatus?.gradientEncryptionEnabled ? '✅ 已启用' : '⏸ 未启用' }}</el-tag>
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
          <el-table :data="federationTasks" stripe size="small">
            <el-table-column prop="name" label="任务名称" width="140" />
            <el-table-column prop="modelType" label="类型" width="60">
              <template #default="{ row }"><el-tag size="small">{{ row.modelType }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="currentRound" label="轮次" width="80">
              <template #default="{ row }">R{{ row.currentRound }}/{{ row.totalRounds }}</template>
            </el-table-column>
            <el-table-column prop="accuracy" label="精度" width="80">
              <template #default="{ row }">{{ (row.accuracy * 100).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="taskStatusTag(row.status)" size="small">{{ taskStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button v-if="row.status === 'running'" size="small" link @click="handlePause(row)">暂停</el-button>
                <el-button v-if="row.status === 'paused'" size="small" link type="primary" @click="handleResume(row)">继续</el-button>
                <el-button v-if="row.status !== 'completed'" size="small" link type="danger" @click="handleStop(row)">停止</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCloudStore } from '@/stores/cloud'
import { ElMessage } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import type { FederationStatus, FederationTask } from '@/types/analytics'

const cloudStore = useCloudStore()

const federationStatus = computed(() => cloudStore.federationStatus)
const federationTasks = computed(() => cloudStore.federationTasks)
const boxContributions = computed(() => cloudStore.boxContributions)

const aggregationAccuracy = computed(() => {
  const v = federationStatus.value?.aggregationAccuracy
  return v !== undefined ? (v * 100).toFixed(1) : '--'
})

const privacyUsed = computed(() => {
  const used = federationStatus.value?.privacyBudget ?? 0
  const total = federationStatus.value?.privacyBudgetTotal ?? 1
  return Math.round((used / total) * 100)
})

const statusCardClass = computed(() => {
  const s = federationStatus.value?.status
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
const accuracyChartOption = computed(() => {
  const data = federationStatus.value?.accuracyTrend ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: data.map(d => `R${d.round}`) },
    yAxis: { type: 'value' as const, min: 80, max: 100 },
    series: [{
      name: '聚合精度', type: 'line', smooth: true, data: data.map(d => +(d.accuracy * 100).toFixed(1)),
      itemStyle: { color: '#722ed1' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(124,58,237,0.2)' }, { offset: 1, color: 'rgba(124,58,237,0)' }] } }
    }]
  }
})

const contributionChartOption = computed(() => {
  const data = boxContributions.value
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: '3%', right: '6%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value' as const, name: '%' },
    yAxis: { type: 'category' as const, data: data.map(d => d.boxName), inverse: true },
    series: [{
      name: '贡献度', type: 'bar',
      data: data.map((d, i) => ({
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

async function handlePause(task: FederationTask) {
  await cloudStore.controlFederation(task.id, 'pause')
  ElMessage.success(`任务 "${task.name}" 已暂停`)
}

async function handleResume(task: FederationTask) {
  await cloudStore.controlFederation(task.id, 'start')
  ElMessage.success(`任务 "${task.name}" 已恢复`)
}

async function handleStop(task: FederationTask) {
  await cloudStore.controlFederation(task.id, 'stop')
  ElMessage.success(`任务 "${task.name}" 已停止`)
}

async function refreshAll() {
  await Promise.all([
    cloudStore.fetchFederationStatus(),
    cloudStore.fetchFederationTasks()
  ])
  const tasks = cloudStore.federationTasks
  if (tasks.length > 0) {
    await cloudStore.fetchBoxContributions(tasks[0].id)
  }
}

onMounted(refreshAll)
</script>

<style scoped>
.federation-page { padding: 0 4px; }
.page-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title h2 { margin: 0; font-size: 20px; }
.status-card { text-align: center; padding: 8px 0; }
.status-card.running { border-color: #52c41a; }
.status-card.paused { border-color: #faad14; }
.status-card.error { border-color: #f5222d; }
.status-indicator { font-size: 32px; }
.status-text { font-size: 16px; font-weight: 600; margin-top: 4px; }
.status-sub { font-size: 12px; color: #8c8c8c; margin-top: 4px; }
.metric-card { text-align: center; padding: 8px 0; }
.metric-value { font-size: 28px; font-weight: 700; }
.metric-value.blue { color: #1890ff; }
.metric-value.green { color: #52c41a; }
.metric-value.orange { color: #fa8c16; }
.metric-label { font-size: 13px; color: #6b7280; margin-top: 2px; }
.metric-sub { font-size: 11px; color: #9ca3af; margin-top: 4px; }
.privacy-rows { display: flex; flex-direction: column; gap: 14px; }
.privacy-row { display: flex; align-items: center; }
.privacy-label { width: 120px; font-size: 13px; color: #6b7280; flex-shrink: 0; }
.privacy-value { width: 40px; font-size: 13px; font-weight: 600; text-align: right; flex-shrink: 0; }
</style>
