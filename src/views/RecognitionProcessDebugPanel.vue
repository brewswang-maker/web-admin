<!--
  华盾AI智能视频盒子 v7.0 - 识别过程调试面板 (C 形态)
  views/RecognitionProcessDebugPanel.vue — REST 拉取 GET /api/v1/face/recognition-process/latest,
    显示完整六阶段详情 + 命中结果 + 计数指标. 用于事后回看, 不依赖 WS.

  [FEAT face-recog-process 2026-09-28]
  - 数据源: useRecognitionProcessDebug 提供的 data (REST, 可选 2Hz 轮询)
  - 与实时面板 B (RecognitionProcessLivePanel) 的区别:
    B 走 WS face.recognition.process, 实时 + 节流, 适合 LiveView 侧边栏
    C 走 REST, 按需拉取, 适合 AlarmsView 顶部调试卡 (用户主动开启轮询)
-->
<template>
  <div class="recog-debug-panel">
    <!-- 顶部工具条 -->
    <div class="debug-toolbar">
      <span class="toolbar-title">
        <el-icon><DataBoard /></el-icon>
        识别过程 (REST 拉取)
      </span>
      <span class="state-badge" :class="stateClass">
        <template v-if="state === 'loading'"><el-icon class="spin"><Loading /></el-icon> 拉取中</template>
        <template v-else-if="state === 'success'"><el-icon><CircleCheckFilled /></el-icon> 已就绪</template>
        <template v-else-if="state === 'empty'"><el-icon><InfoFilled /></el-icon> 暂无</template>
        <template v-else-if="state === 'no_plugin'"><el-icon><Warning /></el-icon> 插件未启用</template>
        <template v-else-if="state === 'error'"><el-icon><CircleCloseFilled /></el-icon> 错误</template>
        <template v-else>未拉取</template>
      </span>
      <div class="toolbar-actions">
        <el-input-number
          v-if="showChannelFilter"
          v-model="channelIdInput"
          :min="0"
          :max="999999"
          size="small"
          controls-position="right"
          style="width: 120px"
          placeholder="通道 ID"
        />
        <el-button size="small" :loading="state === 'loading'" @click="refresh">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-switch
          v-model="autoPollOn"
          size="small"
          active-text="自动"
          inactive-text="手动"
          @change="onAutoPollChange"
        />
      </div>
    </div>

    <!-- 错误信息 -->
    <el-alert
      v-if="state === 'no_plugin' || state === 'error'"
      :title="errorMessage || '人脸识别插件未启用'"
      :type="state === 'error' ? 'error' : 'warning'"
      :closable="false"
      show-icon
      class="debug-alert"
    />

    <!-- 主体 -->
    <div v-if="data" class="debug-body">
      <!-- 顶部摘要 -->
      <div class="debug-summary">
        <div class="summary-item">
          <span class="summary-label">通道</span>
          <span class="summary-value">#{{ data.channel_id }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">帧号</span>
          <span class="summary-value">#{{ data.frame_id }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">总耗时</span>
          <span class="summary-value summary-total">{{ data.total_ms.toFixed(1) }} ms</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">状态</span>
          <el-tag :type="data.success ? 'success' : 'danger'" size="small" effect="dark">
            {{ data.success ? '成功' : '失败' }}
          </el-tag>
        </div>
        <div class="summary-item summary-time">
          <span class="summary-label">拉取于</span>
          <span class="summary-value-time">{{ formatTime(lastFetchedAt) }}</span>
        </div>
      </div>

      <!-- 计数指标 -->
      <div class="debug-metrics">
        <div class="metric-card">
          <div class="metric-num">{{ data.faces_detected }}</div>
          <div class="metric-label">检测</div>
        </div>
        <div class="metric-card">
          <div class="metric-num">{{ data.faces_after_nms }}</div>
          <div class="metric-label">NMS 后</div>
        </div>
        <div class="metric-card">
          <div class="metric-num">{{ data.faces_passed }}</div>
          <div class="metric-label">质量门通过</div>
        </div>
        <div class="metric-card metric-strong">
          <div class="metric-num">{{ data.faces_recognized }}</div>
          <div class="metric-label">识别命中</div>
        </div>
        <div class="metric-card" :class="{ 'metric-alarm': data.alarms_triggered > 0 }">
          <div class="metric-num">{{ data.alarms_triggered }}</div>
          <div class="metric-label">告警触发</div>
        </div>
      </div>

      <!-- 六阶段卡片 (grid 3 列 x 2 行) -->
      <div class="debug-stages">
        <div
          v-for="(stage, idx) in stages"
          :key="stage.key"
          class="stage-card"
          :style="{ borderLeftColor: stage.color }"
        >
          <div class="stage-card-head">
            <span class="stage-card-name">
              <span class="stage-num">{{ idx + 1 }}</span>
              {{ stage.name }}
            </span>
            <span class="stage-card-ms">{{ stage.ms.toFixed(2) }} ms</span>
          </div>
          <div class="stage-card-desc">{{ stage.desc }}</div>
          <div class="stage-card-bar">
            <div
              class="stage-card-bar-fill"
              :style="{ width: stage.pct + '%', background: stage.color }"
            />
            <span class="stage-card-pct">{{ stage.pct.toFixed(1) }}%</span>
          </div>
        </div>
      </div>

      <!-- 命中结果表 -->
      <div v-if="data.matched_person_ids.length > 0" class="debug-matches">
        <div class="section-title">命中结果 ({{ data.matched_person_ids.length }})</div>
        <el-table :data="matchRows" size="small" border>
          <el-table-column prop="person_id" label="person_id" width="160" />
          <el-table-column label="相似度">
            <template #default="{ row }">
              <div class="match-cell">
                <div class="match-cell-bar">
                  <div
                    class="match-cell-bar-fill"
                    :style="{
                      width: (row.similarity * 100) + '%',
                      background: similarityColor(row.similarity)
                    }"
                  />
                </div>
                <span class="match-cell-val">{{ (row.similarity * 100).toFixed(2) }}%</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="阈值评估" width="100">
            <template #default="{ row }">
              <el-tag
                :type="row.tagType"
                size="small"
                effect="plain"
              >{{ row.tagText }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div v-else class="debug-empty-matches">本帧无识别命中 (所有人脸未通过质量门或未匹配)</div>

      <!-- 告警类型 -->
      <div v-if="data.alarm_types.length > 0" class="debug-alarm-types">
        <div class="section-title">触发的告警类型</div>
        <el-tag
          v-for="at in data.alarm_types"
          :key="at"
          type="danger"
          size="small"
          effect="dark"
        >{{ at }}</el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  DataBoard,
  Loading,
  CircleCheckFilled,
  CircleCloseFilled,
  InfoFilled,
  Warning,
  Refresh,
} from '@element-plus/icons-vue'
import {
  useRecognitionProcessDebug,
} from '@/composables/useRecognitionProcessDebug'
import type { RecognitionProcessDebugData } from '@/api/face'

interface Props {
  /** 仅拉取该 channel_id 的过程; undefined = 最新一帧 (不限通道) */
  channelId?: number
  /** 是否在顶部显示通道过滤输入框 (默认 false, 由 props.channelId 决定) */
  showChannelFilter?: boolean
  /** 自动开启轮询 (默认 false; 用户可用开关手动控制) */
  defaultAutoPoll?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  channelId: undefined,
  showChannelFilter: false,
  defaultAutoPoll: false,
})

// 通道过滤输入 (用于 showChannelFilter=true 的场景)
const channelIdInput = ref<number | undefined>(props.channelId)

// 传给 composable 的 channelId 响应式 (跟随 channelIdInput 或 props.channelId)
const effectiveChannelId = computed<number | undefined>(() => {
  if (props.showChannelFilter) return channelIdInput.value
  return props.channelId
})

const {
  data,
  state,
  errorMessage,
  lastFetchedAt,
  polling,
  refresh,
  startPolling,
  stopPolling,
} = useRecognitionProcessDebug({
  channelId: effectiveChannelId.value,
  autoPoll: props.defaultAutoPoll,
})

// 通道过滤变化时重新拉取
watch(effectiveChannelId, () => {
  refresh()
})

// 自动轮询开关
const autoPollOn = ref<boolean>(props.defaultAutoPoll)
function onAutoPollChange(v: boolean | string | number): void {
  if (v) startPolling()
  else stopPolling()
}

// ── 状态徽标 class ──
const stateClass = computed<string>(() => {
  switch (state.value) {
    case 'loading': return 'st-loading'
    case 'success': return 'st-ok'
    case 'empty': return 'st-empty'
    case 'no_plugin': return 'st-warn'
    case 'error': return 'st-err'
    default: return 'st-idle'
  }
})

// ── 六阶段卡片 ──
interface StageCard {
  key: string
  name: string
  ms: number
  pct: number
  color: string
  desc: string
}

const stages = computed<StageCard[]>(() => {
  const d = data.value
  // [FIX vuetsc-narrow 2026-09-28] data.value 类型被 vue-tsc 推断为 X | null | undefined (shallowRef
  //   ReturnType 推断问题), 这里 narrow 到 X | null 后 early-return, TS 才肯后续 d.xxx 安全。
  if (!d) return []
  const items = [
    { key: 'preprocess',    name: '预处理',     ms: d.preprocess_ms,   color: '#909399',
      desc: 'letterbox / resize / normalize' },
    { key: 'detection',     name: '人脸检测',   ms: d.detection_ms,    color: '#67c23a',
      desc: 'SCRFD TPU 前向推理 (NPU BM1688/CV1868)' },
    { key: 'nms',           name: 'NMS',        ms: d.nms_ms,          color: '#e6a23c',
      desc: '非极大值抑制, 合并重叠框' },
    { key: 'quality',       name: '质量门',     ms: d.quality_ms,      color: '#f56c6c',
      desc: 'face quality scoring + filter (清晰度/姿态/遮挡)' },
    { key: 'recognition',   name: '识别',       ms: d.recognition_ms,  color: '#409eff',
      desc: 'ArcFace embedding + cosine similarity 比对' },
    { key: 'alarm',         name: '告警',       ms: d.alarm_ms,        color: '#c45656',
      desc: '触发告警 / 通行记录 / 陌生人检测' },
  ]
  const total = d.total_ms || 1  // 防 /0
  // 用 stages_desc 覆盖默认 desc (后端补的元数据优先)
  const stageDescMap = new Map<string, string>()
  for (const s of d.stages_desc) {
    // s.name 形如 "1_preprocess", 拆出 key
    const m = /^(\d+)_(.+)$/.exec(s.name)
    if (m) stageDescMap.set(m[2], s.desc)
  }
  return items.map(s => ({
    ...s,
    pct: Math.min(100, (s.ms / total) * 100),
    desc: stageDescMap.get(s.key) ?? s.desc,
  }))
})

// ── 命中结果表行 ──
interface MatchRow {
  person_id: string
  similarity: number
  tagType: 'success' | 'warning' | 'danger'
  tagText: string
}

const matchRows = computed<MatchRow[]>(() => {
  const d = data.value
  if (!d) return []
  const rows: MatchRow[] = []
  for (let i = 0; i < d.matched_person_ids.length; i++) {
    const sim = d.similarities[i] ?? 0
    rows.push({
      person_id: d.matched_person_ids[i],
      similarity: sim,
      tagType: sim >= 0.85 ? 'success' : (sim >= 0.70 ? 'warning' : 'danger'),
      tagText: sim >= 0.85 ? '高置信' : (sim >= 0.70 ? '中等' : '低'),
    })
  }
  return rows
})

// ── 相似度配色 ──
function similarityColor(sim: number): string {
  if (sim >= 0.85) return '#67c23a'
  if (sim >= 0.70) return '#e6a23c'
  return '#f56c6c'
}

// ── 时间格式化 ──
function formatTime(ms: number | undefined): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`
}
</script>

<style scoped>
.recog-debug-panel {
  display: flex; flex-direction: column; gap: 12px;
  padding: 12px;
  font-size: 13px;
}

.debug-toolbar {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.toolbar-title {
  font-weight: 600;
  display: flex; align-items: center; gap: 4px;
}
.state-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 10px;
  font-size: 11px; font-weight: 500;
}
.state-badge.st-idle { background: var(--el-fill-color-light, #f5f7fa); color: var(--el-text-color-secondary); }
.state-badge.st-loading { background: #ecf5ff; color: #409eff; }
.state-badge.st-ok { background: #f0f9eb; color: #67c23a; }
.state-badge.st-empty { background: #f4f4f5; color: #909399; }
.state-badge.st-warn { background: #fdf6ec; color: #e6a23c; }
.state-badge.st-err { background: #fef0f0; color: #f56c6c; }
.spin { animation: rotate 1s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.toolbar-actions {
  margin-left: auto;
  display: flex; align-items: center; gap: 8px;
}

.debug-alert { margin: 0; }

.debug-summary {
  display: flex; flex-wrap: wrap; gap: 16px;
  padding: 10px 14px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
}
.summary-item {
  display: flex; flex-direction: column; gap: 2px;
  min-width: 80px;
}
.summary-label { font-size: 11px; color: var(--el-text-color-secondary); }
.summary-value {
  font-family: ui-monospace, monospace;
  font-size: 14px; font-weight: 600;
}
.summary-total { color: var(--el-color-primary); font-size: 16px; }
.summary-value-time { font-family: ui-monospace, monospace; font-size: 12px; }
.summary-time { margin-left: auto; }

.debug-metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.metric-card {
  display: flex; flex-direction: column; align-items: center;
  padding: 8px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 4px;
}
.metric-card.metric-strong { background: var(--el-color-primary-light-9, #ecf5ff); }
.metric-card.metric-alarm { background: #fef0f0; }
.metric-num { font-size: 20px; font-weight: 600; line-height: 1.2; }
.metric-label { font-size: 11px; color: var(--el-text-color-secondary); }
.metric-card.metric-strong .metric-num { color: var(--el-color-primary); }
.metric-card.metric-alarm .metric-num { color: #f56c6c; }

.debug-stages {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}
.stage-card {
  border-left: 3px solid;
  background: var(--el-fill-color-light, #f5f7fa);
  padding: 8px 10px;
  border-radius: 0 4px 4px 0;
}
.stage-card-head {
  display: flex; justify-content: space-between; align-items: baseline;
}
.stage-card-name {
  font-weight: 600;
  display: flex; align-items: center; gap: 6px;
}
.stage-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary);
  font-size: 11px; font-weight: 700;
}
.stage-card-ms {
  font-family: ui-monospace, monospace;
  font-size: 14px; font-weight: 600;
  color: var(--el-color-primary);
}
.stage-card-desc {
  font-size: 11px; color: var(--el-text-color-secondary);
  margin: 4px 0 6px;
}
.stage-card-bar {
  position: relative; height: 5px;
  background: #fff; border-radius: 3px;
  overflow: hidden;
}
.stage-card-bar-fill {
  height: 100%; border-radius: 3px;
  transition: width 200ms ease-out;
}
.stage-card-pct {
  position: absolute; right: 4px; top: -16px;
  font-family: ui-monospace, monospace;
  font-size: 10px; color: var(--el-text-color-secondary);
}

.debug-matches { margin-top: 4px; }
.section-title {
  font-weight: 600; margin-bottom: 6px;
}
.debug-empty-matches {
  padding: 12px; text-align: center;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 4px;
}

.match-cell {
  display: flex; align-items: center; gap: 8px;
}
.match-cell-bar {
  flex: 1; height: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 3px; overflow: hidden;
}
.match-cell-bar-fill { height: 100%; border-radius: 3px; }
.match-cell-val {
  font-family: ui-monospace, monospace;
  font-size: 11px; min-width: 50px; text-align: right;
}

.debug-alarm-types {
  display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
}
</style>