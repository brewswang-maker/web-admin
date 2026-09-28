<!--
  华盾AI智能视频盒子 v7.0 - 实时识别过程面板 (B 形态)
  views/RecognitionProcessLivePanel.vue — 订阅 WS_TOPICS.RECOGNITION_PROCESS,
    显示当前通道最近 ~2s 推理的六段时间折线 + 命中结果列表.

  [FEAT face-recog-process 2026-09-28]
  - 数据源: useRealtimeRecognitionProcess 提供的 history (环形缓冲, 200ms 节流)
  - 渲染: 纯 SVG mini sparkline + div 进度条, 零图表库依赖, 不增 LiveView bundle size
  - 集成: 嵌入 LiveView.vue 右侧栏 (与设备列表并列) 或作为可折叠抽屉
-->
<template>
  <div class="recog-process-panel" :class="{ collapsed }">
    <!-- 顶部状态条 -->
    <div class="panel-header" @click="collapsed = !collapsed">
      <el-icon class="header-icon"><DataAnalysis /></el-icon>
      <span class="header-title">识别过程</span>
      <span class="status-dot" :class="connected ? 'ok' : 'off'" :title="connected ? 'WS 已连接' : 'WS 断开'" />
      <span class="header-stat">
        <template v-if="currentFrame">
          <span class="ms">{{ currentFrame.total_ms.toFixed(1) }}</span>ms
        </template>
        <template v-else>—</template>
      </span>
      <el-icon class="collapse-arrow"><ArrowUp v-if="!collapsed" /><ArrowDown v-else /></el-icon>
    </div>

    <!-- 主体 (折叠时隐藏) -->
    <div v-show="!collapsed" class="panel-body">
      <!-- 空态 -->
      <div v-if="!currentFrame" class="empty-state">
        <el-icon class="empty-icon"><Loading /></el-icon>
        <span>等待识别过程数据…</span>
        <small v-if="!connected">WS 未连接, 请检查智能盒子状态</small>
        <small v-else-if="totalReceived === 0">已连接, 但人脸识别插件未启用或 show_recognition_process 关闭</small>
      </div>

      <!-- 计数指标徽标 -->
      <div v-else class="metrics-row">
        <div class="metric" :title="'检测到人脸 ' + currentFrame.faces_detected">
          <span class="metric-num">{{ currentFrame.faces_detected }}</span>
          <span class="metric-label">检测</span>
        </div>
        <div class="metric" :title="'NMS 后 ' + currentFrame.faces_after_nms">
          <span class="metric-num">{{ currentFrame.faces_after_nms }}</span>
          <span class="metric-label">NMS</span>
        </div>
        <div class="metric" :title="'质量门通过 ' + currentFrame.faces_passed">
          <span class="metric-num">{{ currentFrame.faces_passed }}</span>
          <span class="metric-label">通过</span>
        </div>
        <div class="metric metric-strong" :title="'识别到 ' + currentFrame.faces_recognized">
          <span class="metric-num">{{ currentFrame.faces_recognized }}</span>
          <span class="metric-label">识别</span>
        </div>
        <div class="metric" :class="{ 'metric-alarm': currentFrame.alarms_triggered > 0 }" :title="'触发告警 ' + currentFrame.alarms_triggered">
          <span class="metric-num">{{ currentFrame.alarms_triggered }}</span>
          <span class="metric-label">告警</span>
        </div>
      </div>

      <!-- 六段时间折线 (sparkline) -->
      <div v-if="currentFrame" class="stages">
        <div class="stage-row" v-for="(stage, idx) in stages" :key="stage.key">
          <span class="stage-name">{{ stage.name }}</span>
          <div class="stage-bar">
            <div class="stage-bar-fill" :style="{ width: stage.pct + '%', background: stage.color }" />
          </div>
          <span class="stage-ms">{{ stage.ms.toFixed(1) }}ms</span>
        </div>
        <!-- 总耗时趋势 (最近 N 帧) -->
        <div class="trend-row" :title="'最近 ' + history.length + ' 帧总耗时趋势'">
          <span class="trend-label">趋势</span>
          <svg class="trend-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none">
            <polyline
              v-if="trendPoints"
              :points="trendPoints"
              fill="none"
              stroke="#409eff"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
          <span class="trend-stat">{{ trendStats }}</span>
        </div>
      </div>

      <!-- 命中结果列表 -->
      <div v-if="currentFrame && currentFrame.matched_person_ids.length > 0" class="matches">
        <div class="matches-title">命中 ({{ currentFrame.matched_person_ids.length }})</div>
        <div
          v-for="(pid, idx) in currentFrame.matched_person_ids"
          :key="pid"
          class="match-row"
        >
          <span class="match-pid">{{ pid }}</span>
          <div class="match-bar">
            <div
              class="match-bar-fill"
              :style="{
                width: ((currentFrame.similarities[idx] ?? 0) * 100) + '%',
                background: similarityColor(currentFrame.similarities[idx] ?? 0)
              }"
            />
          </div>
          <span class="match-sim">{{ ((currentFrame.similarities[idx] ?? 0) * 100).toFixed(1) }}%</span>
        </div>
      </div>

      <!-- 告警类型 -->
      <div v-if="currentFrame && currentFrame.alarm_types.length > 0" class="alarm-types">
        <el-tag
          v-for="at in currentFrame.alarm_types"
          :key="at"
          type="danger"
          size="small"
          effect="dark"
        >{{ at }}</el-tag>
      </div>

      <!-- 帧信息条 -->
      <div v-if="currentFrame" class="frame-meta">
        <span>通道 #{{ currentFrame.channel_id }}</span>
        <span>帧 #{{ currentFrame.frame_id }}</span>
        <span>累计 {{ totalReceived }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowUp, ArrowDown, DataAnalysis, Loading } from '@element-plus/icons-vue'
import {
  useRealtimeRecognitionProcess,
  type RecognitionProcessFrame,
} from '@/composables/useRealtimeRecognitionProcess'

interface Props {
  /** 可选: 仅显示该 channel_id 的过程; 不传=显示当前 WS 推送的任意通道 */
  channelId?: number
  /** 折叠状态 (默认 false 展开) */
  defaultCollapsed?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  channelId: undefined,
  defaultCollapsed: false,
})

const collapsed = ref(props.defaultCollapsed)

// ── 订阅 WS ──
const {
  currentFrame,
  history,
  connected,
  totalReceived,
} = useRealtimeRecognitionProcess({
  channelId: props.channelId,
})

// channelId 变化时不需要 reset: composable 已经按 channelId 过滤 history

// ── 六段时间折线数据 ──
interface StageRow {
  key: string
  name: string
  ms: number
  pct: number
  color: string
}

const stages = computed<StageRow[]>(() => {
  const f = currentFrame.value
  if (!f) return []
  // 找出 6 段时间的最大值用于比例尺 (但 total_ms 用真实值作分母)
  const items = [
    { key: 'preprocess',    name: '1.预处理',   ms: f.preprocess_ms,   color: '#909399' },
    { key: 'detection',     name: '2.检测',     ms: f.detection_ms,    color: '#67c23a' },
    { key: 'nms',           name: '3.NMS',      ms: f.nms_ms,          color: '#e6a23c' },
    { key: 'quality',       name: '4.质量门',   ms: f.quality_ms,      color: '#f56c6c' },
    { key: 'recognition',   name: '5.识别',     ms: f.recognition_ms,  color: '#409eff' },
    { key: 'alarm',         name: '6.告警',     ms: f.alarm_ms,        color: '#c45656' },
  ]
  const total = f.total_ms || 1  // 防 /0
  return items.map(s => ({ ...s, pct: Math.min(100, (s.ms / total) * 100) }))
})

// ── 总耗时趋势折线 ──
const TREND_WIDTH = 100
const TREND_HEIGHT = 24

const trendPoints = computed<string | null>(() => {
  const h = history
  if (h.length < 2) return null
  const ms = h.map(f => f.total_ms)
  const max = Math.max(...ms, 1)
  const min = Math.min(...ms, 0)
  const span = max - min || 1
  return h
    .map((f, i) => {
      const x = (i / (h.length - 1)) * TREND_WIDTH
      const y = TREND_HEIGHT - ((f.total_ms - min) / span) * TREND_HEIGHT
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
})

const trendStats = computed<string>(() => {
  const h = history
  if (h.length === 0) return '—'
  const ms = h.map(f => f.total_ms)
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length
  const max = Math.max(...ms)
  const min = Math.min(...ms)
  return `avg ${avg.toFixed(1)} / max ${max.toFixed(1)} / min ${min.toFixed(1)} ms`
})

// ── 相似度配色 ──
function similarityColor(sim: number): string {
  // 阈值参考: ≥0.85 高置信 (绿), 0.7-0.85 中 (黄), <0.7 低 (红)
  if (sim >= 0.85) return '#67c23a'
  if (sim >= 0.70) return '#e6a23c'
  return '#f56c6c'
}
</script>

<style scoped>
.recog-process-panel {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 4px;
  background: var(--el-bg-color, #fff);
  font-size: 12px;
  user-select: none;
}
.recog-process-panel.collapsed .panel-header { border-bottom: none; }

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.header-icon { color: var(--el-color-primary); }
.header-title { font-weight: 600; flex: 1; }
.status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  display: inline-block;
}
.status-dot.ok { background: #67c23a; box-shadow: 0 0 4px #67c23a; }
.status-dot.off { background: #f56c6c; }
.header-stat { font-family: ui-monospace, monospace; color: var(--el-text-color-secondary); }
.header-stat .ms { font-weight: 600; color: var(--el-color-primary); font-size: 14px; }
.collapse-arrow { color: var(--el-text-color-secondary); }

.panel-body { padding: 8px 10px 10px; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 16px 8px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
.empty-icon { font-size: 18px; }
.empty-state small { font-size: 11px; opacity: 0.7; }

.metrics-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  margin-bottom: 10px;
}
.metric {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px 0;
  border-radius: 4px;
  background: var(--el-fill-color-light, #f5f7fa);
}
.metric-strong { background: var(--el-color-primary-light-9, #ecf5ff); }
.metric-alarm { background: #fef0f0; }
.metric-num { font-size: 16px; font-weight: 600; line-height: 1.2; }
.metric-label { font-size: 11px; color: var(--el-text-color-secondary); }
.metric-strong .metric-num { color: var(--el-color-primary); }
.metric-alarm .metric-num { color: #f56c6c; }

.stages { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.stage-row {
  display: grid;
  grid-template-columns: 56px 1fr 56px;
  align-items: center;
  gap: 6px;
}
.stage-name { font-size: 11px; color: var(--el-text-color-regular); }
.stage-bar {
  height: 6px; background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 3px; overflow: hidden;
}
.stage-bar-fill {
  height: 100%; border-radius: 3px;
  transition: width 200ms ease-out;
}
.stage-ms {
  font-family: ui-monospace, monospace; font-size: 11px;
  color: var(--el-text-color-secondary); text-align: right;
}

.trend-row {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: 6px;
  margin-top: 4px; padding-top: 4px;
  border-top: 1px dashed var(--el-border-color-lighter, #ebeef5);
}
.trend-label { font-size: 11px; color: var(--el-text-color-secondary); }
.trend-sparkline {
  width: 100%; height: 24px; display: block;
}
.trend-stat { font-family: ui-monospace, monospace; font-size: 10px; color: var(--el-text-color-secondary); }

.matches {
  margin-top: 8px;
  display: flex; flex-direction: column; gap: 3px;
}
.matches-title { font-weight: 600; margin-bottom: 2px; }
.match-row {
  display: grid;
  grid-template-columns: 1fr 80px 48px;
  gap: 4px; align-items: center;
}
.match-pid {
  font-family: ui-monospace, monospace; font-size: 11px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.match-bar {
  height: 5px; background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 3px; overflow: hidden;
}
.match-bar-fill { height: 100%; border-radius: 3px; }
.match-sim { font-family: ui-monospace, monospace; font-size: 11px; text-align: right; }

.alarm-types {
  margin-top: 6px;
  display: flex; gap: 4px; flex-wrap: wrap;
}

.frame-meta {
  margin-top: 8px; padding-top: 6px;
  border-top: 1px dashed var(--el-border-color-lighter, #ebeef5);
  display: flex; justify-content: space-between;
  font-size: 10px; color: var(--el-text-color-placeholder, #c0c4cc);
}
</style>