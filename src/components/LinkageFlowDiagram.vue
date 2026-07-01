<template>
  <div class="flow-diagram-container">
    <div class="flow-header">
      <span class="flow-title">联动流程可视化</span>
      <div class="flow-controls">
        <el-switch v-model="liveMode" active-text="实时" inactive-text="历史" size="small" />
        <el-select v-model="selectedLogId" placeholder="选择触发记录" size="small" style="width: 200px" v-if="!liveMode" @change="loadHistoryFlow">
          <el-option v-for="log in recentLogs" :key="log.id" :label="`${log.rule_name} @ ${formatTime(log.trigger_at)}`" :value="log.id" />
        </el-select>
        <el-button @click="clearFlow" size="small" type="info" plain>清空</el-button>
      </div>
    </div>

    <!-- 流程画布 -->
    <div class="flow-canvas" ref="canvasRef">
      <!-- 空状态 -->
      <div v-if="flowSteps.length === 0" class="empty-state">
        <el-icon :size="48" color="#3a3f4b"><Connection /></el-icon>
        <p>等待联动事件触发...</p>
        <p class="hint">当告警事件匹配到规则时，流程将实时显示在此处</p>
      </div>

      <!-- 流程步骤 -->
      <div v-else class="flow-steps">
        <!-- Step 1: 事件接收 -->
        <div class="flow-node event-node" :class="{ active: currentStep >= 0 }">
          <div class="node-icon" style="background: linear-gradient(135deg, #FF6B35, #FF3D71)">
            <el-icon><Bell /></el-icon>
          </div>
          <div class="node-content">
            <div class="node-title">事件接收</div>
            <div class="node-detail">
              <span class="detail-label">类型:</span>
              <span class="detail-value">{{ flowData.event?.alarm_type || '-' }}</span>
            </div>
            <div class="node-detail">
              <span class="detail-label">通道:</span>
              <span class="detail-value">{{ flowData.event?.channel_id || '-' }}</span>
            </div>
            <div class="node-detail">
              <span class="detail-label">置信度:</span>
              <span class="detail-value">{{ flowData.event?.confidence?.toFixed(2) || '-' }}</span>
            </div>
            <div class="node-time" v-if="flowData.event?.timestamp_ms">
              {{ formatTime(flowData.event.timestamp_ms) }}
            </div>
          </div>
        </div>

        <!-- 连接箭头 -->
        <div class="flow-arrow" :class="{ active: currentStep >= 1 }">
          <div class="arrow-line"></div>
          <div class="arrow-label" v-if="flowData.candidateCount">
            {{ flowData.candidateCount }} 条候选规则
          </div>
          <div class="arrow-label" v-else>规则匹配中</div>
        </div>

        <!-- Step 2: 条件匹配 -->
        <div class="flow-node condition-node" :class="{ active: currentStep >= 1 }">
          <div class="node-icon" style="background: linear-gradient(135deg, #3B82F6, #8B5CF6)">
            <el-icon><Filter /></el-icon>
          </div>
          <div class="node-content">
            <div class="node-title">条件匹配</div>
            <div class="node-detail" v-if="flowData.matchedRule">
              <span class="detail-label">规则:</span>
              <span class="detail-value highlight">{{ flowData.matchedRule.rule_name }}</span>
            </div>
            <div class="node-detail" v-if="flowData.matchDetails">
              <span class="detail-label">耗时:</span>
              <span class="detail-value">{{ flowData.matchDetails.match_ms }}ms</span>
            </div>
            <div class="node-detail" v-if="flowData.matchDetails?.merged">
              <el-tag size="small" type="warning">合并去重</el-tag>
            </div>
            <div class="node-detail" v-if="flowData.matchDetails?.cooled_down">
              <el-tag size="small" type="info">冷却跳过</el-tag>
            </div>
            <div class="node-detail" v-if="flowData.matchDetails?.vlm_verified">
              <el-tag size="small" type="success">VLM验证通过</el-tag>
            </div>
          </div>
          <!-- 条件树可视化 -->
          <div class="condition-tree-preview" v-if="flowData.matchedRule?.condition_summary">
            <div class="tree-node" v-for="(cond, idx) in flowData.matchedRule.condition_summary" :key="idx">
              <span class="tree-icon" :style="{ color: cond.matched ? '#00D4AA' : '#FF3D71' }">
                {{ cond.matched ? '✓' : '✗' }}
              </span>
              <span class="tree-text">{{ cond.text }}</span>
            </div>
          </div>
        </div>

        <!-- 连接箭头 -->
        <div class="flow-arrow" :class="{ active: currentStep >= 2 }">
          <div class="arrow-line"></div>
          <div class="arrow-label">
            {{ flowData.actions?.length || 0 }} 个动作待执行
          </div>
        </div>

        <!-- Step 3: 动作执行管线 -->
        <div class="flow-node action-node" :class="{ active: currentStep >= 2 }">
          <div class="node-icon" style="background: linear-gradient(135deg, #00D4AA, #22C55E)">
            <el-icon><Operation /></el-icon>
          </div>
          <div class="node-content">
            <div class="node-title">动作执行管线</div>
          </div>

          <!-- 动作列表 -->
          <div class="action-list" v-if="flowData.actions && flowData.actions.length > 0">
            <div
              v-for="(action, idx) in flowData.actions"
              :key="idx"
              class="action-item"
              :class="actionStatusClass(action)"
            >
              <div class="action-info">
                <span class="action-level-badge" :class="`level-${action.level?.toLowerCase()}`">
                  {{ action.level || 'ASYNC' }}
                </span>
                <span class="action-name">{{ action.action_name }}</span>
              </div>
              <div class="action-meta">
                <span class="action-latency" v-if="action.latency_ms !== undefined">
                  {{ action.latency_ms }}ms
                </span>
                <el-icon v-if="action.error_code !== undefined && action.error_code === 0" color="#00D4AA"><CircleCheck /></el-icon>
                <el-icon v-else-if="action.error_code !== undefined && action.error_code > 0" color="#FF3D71"><CircleClose /></el-icon>
                <el-icon v-else color="#9AA0A6"><Loading /></el-icon>
              </div>
              <div class="action-error" v-if="action.error_message">
                {{ action.error_message }}
              </div>
            </div>
          </div>
        </div>

        <!-- 完成标记 -->
        <div class="flow-node result-node" :class="{ active: currentStep >= 3 }" v-if="currentStep >= 3">
          <div class="node-icon" :style="{ background: allActionsSuccess ? 'linear-gradient(135deg, #00D4AA, #22C55E)' : 'linear-gradient(135deg, #FF3D71, #FF6B35)' }">
            <el-icon><Finished /></el-icon>
          </div>
          <div class="node-content">
            <div class="node-title">{{ allActionsSuccess ? '流程完成' : '部分失败' }}</div>
            <div class="node-detail">
              <span class="detail-label">总耗时:</span>
              <span class="detail-value">{{ totalDuration }}ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { linkageApi } from '@/api/linkage'
import type { LinkageLog } from '@/api/linkage'

interface FlowAction {
  action_name: string
  action_type: number
  level?: string
  latency_ms?: number
  error_code?: number
  error_message?: string
}

interface FlowData {
  event?: {
    alarm_type: string
    channel_id: string | number
    confidence?: number
    timestamp_ms?: number
    severity?: number
    snapshot_url?: string
  }
  candidateCount?: number
  matchedRule?: {
    rule_id: string
    rule_name: string
    condition_summary?: Array<{ text: string; matched: boolean }>
  }
  matchDetails?: {
    match_ms: number
    merged?: boolean
    cooled_down?: boolean
    vlm_verified?: boolean
  }
  actions?: FlowAction[]
}

const liveMode = ref(true)
const selectedLogId = ref<number>()
const recentLogs = ref<LinkageLog[]>([])
const canvasRef = ref<HTMLElement>()

const flowData = reactive<FlowData>({})
const flowSteps = ref<number[]>([])
const currentStep = ref(-1)
const totalDuration = ref(0)

let wsCleanup: (() => void) | null = null
let stepTimer: ReturnType<typeof setInterval> | null = null

const allActionsSuccess = computed(() => {
  if (!flowData.actions || flowData.actions.length === 0) return false
  return flowData.actions.every(a => a.error_code === 0)
})

function formatTime(ms?: number): string {
  if (!ms) return '-'
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })
}

function actionStatusClass(action: FlowAction): string {
  if (action.error_code === 0) return 'success'
  if (action.error_code && action.error_code > 0) return 'failed'
  return 'pending'
}

function startFlow(wsMsg: any) {
  clearFlow()

  flowData.event = {
    alarm_type: wsMsg.alarm_type || 'unknown',
    channel_id: wsMsg.channel_id ?? '-',
    confidence: wsMsg.confidence,
    timestamp_ms: wsMsg.timestamp_ms || Date.now(),
    severity: wsMsg.severity,
    snapshot_url: wsMsg.snapshot_url,
  }

  flowData.matchedRule = {
    rule_id: wsMsg.rule_id || '',
    rule_name: wsMsg.rule_name || wsMsg.alarm_type || '未知规则',
  }

  flowData.candidateCount = wsMsg.candidate_count
  flowData.matchDetails = wsMsg.match_details

  const actions: FlowAction[] = (wsMsg.actions || []).map((a: any) => ({
    action_name: a.action_name || a.name || `Action#${a.action_type}`,
    action_type: a.action_type || 0,
    level: a.level,
    latency_ms: a.latency_ms,
    error_code: a.error_code,
    error_message: a.error_message,
  }))

  flowData.actions = actions
  totalDuration.value = wsMsg.total_duration_ms || 0

  // Animate steps
  currentStep.value = 0
  let step = 1
  stepTimer = setInterval(() => {
    currentStep.value = step
    step++
    if (step > 3) {
      if (stepTimer) clearInterval(stepTimer)
      stepTimer = null
    }
  }, 600)
}

function clearFlow() {
  Object.keys(flowData).forEach(key => {
    delete (flowData as any)[key]
  })
  flowSteps.value = []
  currentStep.value = -1
  totalDuration.value = 0
  if (stepTimer) {
    clearInterval(stepTimer)
    stepTimer = null
  }
}

async function loadRecentLogs() {
  try {
    const res = await linkageApi.getLogs({ page: 1, pageSize: 20 })
    recentLogs.value = res.data?.data?.items || []
  } catch {
    // silent
  }
}

async function loadHistoryFlow(logId: number) {
  try {
    const res = await linkageApi.getLogs({ page: 1, pageSize: 50 })
    const logs = res.data?.data?.items || []
    const log = logs.find((l: LinkageLog) => l.id === logId)
    if (!log) return

    clearFlow()
    flowData.event = {
      alarm_type: log.event_type,
      channel_id: log.channel_id,
      timestamp_ms: log.trigger_at,
    }
    flowData.matchedRule = {
      rule_id: log.rule_id,
      rule_name: log.rule_name,
    }
    flowData.actions = (log.actions_executed || []).map((name: string) => ({
      action_name: name,
      action_type: 0,
      error_code: 0,
    }))
    totalDuration.value = log.duration_ms
    currentStep.value = 3
  } catch {
    // silent
  }
}

function setupWebSocket() {
  // Hook into global WebSocket event bus (useGlobalAlarm 派发的 linkage-ws-event)
  const handler = (event: CustomEvent) => {
    if (!liveMode.value) return
    const wsMsg = event.detail
    // 匹配所有告警类型 payload (alarm_type 是后端事件的标准字段)
    if (wsMsg && (wsMsg.alarm_type || wsMsg.type === 'linkage_alarm' || wsMsg.action === 'linkage_trigger')) {
      startFlow(wsMsg)
    }
  }
  window.addEventListener('linkage-ws-event', handler as EventListener)
  wsCleanup = () => window.removeEventListener('linkage-ws-event', handler as EventListener)
}

onMounted(() => {
  setupWebSocket()
  loadRecentLogs()
})

onUnmounted(() => {
  if (wsCleanup) wsCleanup()
  if (stepTimer) clearInterval(stepTimer)
})
</script>

<style scoped>
.flow-diagram-container {
  background: #1a1d24;
  border-radius: 12px;
  padding: 16px;
  min-height: 400px;
}

.flow-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.flow-title {
  font-size: 15px;
  font-weight: 700;
  color: #E8E8E8;
}

.flow-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flow-canvas {
  position: relative;
  min-height: 350px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #6B7280;
}

.empty-state p {
  margin: 8px 0 0;
  font-size: 14px;
}

.empty-state .hint {
  font-size: 12px;
  color: #4a4f5b;
}

.flow-steps {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.flow-node {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.03);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.05);
  opacity: 0.4;
  transition: all 0.3s ease;
  flex-wrap: wrap;
}

.flow-node.active {
  opacity: 1;
  border-color: rgba(0,212,170,0.2);
  background: rgba(0,212,170,0.04);
}

.node-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
  color: #fff;
}

.node-content {
  flex: 1;
  min-width: 0;
}

.node-title {
  font-size: 13px;
  font-weight: 700;
  color: #E8E8E8;
  margin-bottom: 4px;
}

.node-detail {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  line-height: 1.6;
}

.detail-label {
  color: #9AA0A6;
}

.detail-value {
  color: #E8E8E8;
}

.detail-value.highlight {
  color: #00D4AA;
  font-weight: 600;
}

.node-time {
  font-size: 10px;
  color: #6B7280;
  margin-top: 4px;
}

.condition-tree-preview {
  width: 100%;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255,255,255,0.08);
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 2px 0;
}

.tree-icon {
  font-weight: 700;
}

.tree-text {
  color: #9AA0A6;
}

.flow-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  opacity: 0.3;
  transition: opacity 0.3s ease;
}

.flow-arrow.active {
  opacity: 1;
}

.arrow-line {
  width: 2px;
  height: 20px;
  background: linear-gradient(to bottom, #3B82F6, #8B5CF6);
  border-radius: 1px;
}

.arrow-label {
  font-size: 10px;
  color: #6B7280;
  margin-top: 2px;
}

.action-list {
  width: 100%;
  margin-top: 8px;
}

.action-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: 12px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.04);
}

.action-item.success {
  border-left: 3px solid #00D4AA;
}

.action-item.failed {
  border-left: 3px solid #FF3D71;
}

.action-item.pending {
  border-left: 3px solid #9AA0A6;
}

.action-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-level-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
  text-transform: uppercase;
}

.level-sync {
  background: rgba(0,212,170,0.15);
  color: #00D4AA;
}

.level-async {
  background: rgba(59,130,246,0.15);
  color: #3B82F6;
}

.level-delayed {
  background: rgba(255,184,0,0.15);
  color: #FFB800;
}

.action-name {
  color: #E8E8E8;
}

.action-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-latency {
  font-size: 11px;
  color: #9AA0A6;
}

.action-error {
  width: 100%;
  font-size: 10px;
  color: #FF3D71;
  margin-top: 2px;
}

.result-node {
  margin-top: 4px;
}
</style>
