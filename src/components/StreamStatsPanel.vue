<template>
  <!-- 触发按钮由父组件提供，面板作为 el-drawer 渲染 -->
  <el-drawer
    v-model="visible"
    title=""
    direction="rtl"
    size="420px"
    :append-to-body="true"
    :close-on-click-modal="true"
    class="stats-drawer"
  >
    <template #header>
      <div class="drawer-header">
        <el-icon :size="18" style="color:#1A73E8"><DataAnalysis /></el-icon>
        <span class="drawer-title">流媒体统计面板</span>
        <el-tag size="small" type="info" style="margin-left:auto">{{ refreshTick }}s 刷新</el-tag>
      </div>
    </template>

    <!-- 总览区 -->
    <div class="overview-bar">
      <div class="ov-item ov-good">
        <span class="ov-dot dot-good"></span>
        <span class="ov-num">{{ summary.good }}</span>
        <span class="ov-label">正常</span>
      </div>
      <div class="ov-divider"></div>
      <div class="ov-item ov-warning">
        <span class="ov-dot dot-warning"></span>
        <span class="ov-num">{{ summary.warning }}</span>
        <span class="ov-label">告警</span>
      </div>
      <div class="ov-divider"></div>
      <div class="ov-item ov-error">
        <span class="ov-dot dot-error"></span>
        <span class="ov-num">{{ summary.error }}</span>
        <span class="ov-label">异常</span>
      </div>
      <div class="ov-divider"></div>
      <div class="ov-item">
        <span class="ov-num ov-total">{{ summary.total }}</span>
        <span class="ov-label">总计</span>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-if="!rows.length" description="暂无活跃视频流" :image-size="60" style="margin-top:40px" />

    <!-- 统计表格 -->
    <div v-else class="stats-table-wrap">
      <table class="stats-table">
        <thead>
          <tr>
            <th>通道</th>
            <th>首帧(ms)</th>
            <th>格式</th>
            <th>RTT(ms)</th>
            <th>丢包率(%)</th>
            <th>码率(kbps)</th>
            <th>帧率(fps)</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.slotIdx" :class="`row-${row.status}`">
            <td class="td-name">
              <span class="ch-idx">{{ row.slotIdx + 1 }}</span>
              <span class="ch-name-text">{{ row.name }}</span>
            </td>
            <td :class="latencyClass(row.firstFrameLatencyMs)">{{ row.firstFrameLatencyMs > 0 ? row.firstFrameLatencyMs : '—' }}</td>
            <td><el-tag v-if="row.format" size="small" :type="formatTagType(row.format)">{{ FORMAT_LABELS[row.format] || row.format }}</el-tag><span v-else>—</span></td>
            <td :class="rttClass(row.rttMs)">{{ row.rttMs > 0 ? row.rttMs : '—' }}</td>
            <td :class="lossClass(row.lossRate)">{{ row.lossRate > 0 ? (row.lossRate * 100).toFixed(1) : '0.0' }}</td>
            <td>{{ row.bitrate > 0 ? (row.bitrate / 1000).toFixed(0) : '—' }}</td>
            <td>{{ row.fps > 0 ? row.fps : '—' }}</td>
            <td class="td-status">
              <span class="status-dot" :class="`dot-${row.status}`"></span>
              <span class="status-text" :class="`text-${row.status}`">{{ STATUS_LABELS[row.status] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 底部说明 -->
    <div class="stats-footer">
      <span class="footer-tip">数据每秒自动刷新 · 仅统计活跃视频格</span>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { DataAnalysis } from '@element-plus/icons-vue'
import type { StreamHealthState } from '@/composables/useStreamHealth'

interface SlotInfo {
  slotIdx: number
  channelId: string
  name: string
}

interface Props {
  /** 是否显示面板 */
  modelValue: boolean
  /** 所有视频格的基本信息（仅活跃格） */
  slots: SlotInfo[]
  /** 健康状态 Map: slotIdx → StreamHealthState */
  healthStates: Record<number, StreamHealthState>
}

interface Emits {
  (e: 'update:modelValue', val: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const STATUS_LABELS: Record<string, string> = {
  good: '正常',
  warning: '告警',
  error: '异常',
}

// 刷新计时器显示
const refreshTick = ref(1)
let tickTimer: ReturnType<typeof setInterval> | null = null

interface StatsRow {
  slotIdx: number
  name: string
  status: 'good' | 'warning' | 'error'
  rttMs: number
  lossRate: number
  bitrate: number   // bytes/s
  fps: number
  firstFrameLatencyMs: number  // [P3-2] 首帧延迟
  format: string               // [P3-2] 播放格式
}

const rows = computed<StatsRow[]>(() => {
  return props.slots.map(slot => {
    const h = props.healthStates[slot.slotIdx]
    return {
      slotIdx: slot.slotIdx,
      name: slot.name || `CH${slot.slotIdx + 1}`,
      status: h?.status ?? 'good',
      rttMs: h?.rttMs ?? 0,
      lossRate: h?.lossRate ?? 0,
      bitrate: h?.bytesPerSec ?? 0,
      fps: h?.fps ?? 0,
      firstFrameLatencyMs: h?.firstFrameLatencyMs ?? 0,
      format: h?.format ?? '',
    }
  })
})

const summary = computed(() => {
  const all = rows.value
  return {
    total: all.length,
    good: all.filter(r => r.status === 'good').length,
    warning: all.filter(r => r.status === 'warning').length,
    error: all.filter(r => r.status === 'error').length,
  }
})

function rttClass(rtt: number): string {
  if (rtt <= 0) return ''
  if (rtt > 500) return 'val-error'
  if (rtt > 200) return 'val-warning'
  return 'val-good'
}

function lossClass(loss: number): string {
  if (loss > 0.15) return 'val-error'
  if (loss > 0.05) return 'val-warning'
  return ''
}

// [P3-2] 首帧延迟颜色分级
const FORMAT_LABELS: Record<string, string> = {
  'webrtc': 'WebRTC',
  'flv': 'HTTP-FLV',
  'ws-flv': 'WS-FLV',
  'hls': 'HLS',
}

function latencyClass(ms: number): string {
  if (ms <= 0) return ''
  if (ms > 3000) return 'val-error'
  if (ms > 1000) return 'val-warning'
  return 'val-good'
}

function formatTagType(fmt: string): '' | 'success' | 'warning' | 'info' {
  if (fmt === 'webrtc') return 'success'
  if (fmt === 'flv' || fmt === 'ws-flv') return ''
  if (fmt === 'hls') return 'warning'
  return 'info'
}

onMounted(() => {
  tickTimer = setInterval(() => {
    refreshTick.value = refreshTick.value >= 99 ? 1 : refreshTick.value + 1
  }, 1000)
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
})
</script>

<style scoped>
/* Drawer header */
.drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  color: #E8EAED;
}
.drawer-title { color: #E8EAED; }

/* 总览条 */
.overview-bar {
  display: flex;
  align-items: center;
  gap: 0;
  background: #1E2028;
  border: 1px solid #3C4043;
  border-radius: 8px;
  padding: 14px 20px;
  margin-bottom: 16px;
}
.ov-item { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
.ov-num { font-size: 22px; font-weight: 700; color: #E8EAED; line-height: 1; }
.ov-total { color: #8AB4F8; }
.ov-label { font-size: 11px; color: #9AA0A6; }
.ov-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-bottom: 2px; }
.ov-divider { width: 1px; background: #3C4043; height: 40px; margin: 0 8px; }

/* 状态圆点颜色 */
.dot-good { background: #0F9D58; box-shadow: 0 0 5px #0F9D58; }
.dot-warning { background: #F9AB00; box-shadow: 0 0 5px #F9AB00; }
.dot-error { background: #DB4437; box-shadow: 0 0 5px #DB4437; animation: blink-dot 1s ease infinite; }
@keyframes blink-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

/* 表格 */
.stats-table-wrap {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #3C4043;
}
.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  color: #E8EAED;
}
.stats-table thead tr {
  background: #252830;
}
.stats-table th {
  padding: 9px 10px;
  text-align: center;
  font-weight: 600;
  color: #9AA0A6;
  border-bottom: 1px solid #3C4043;
  white-space: nowrap;
}
.stats-table th:first-child { text-align: left; padding-left: 14px; }
.stats-table tbody tr {
  border-bottom: 1px solid #2D3039;
  transition: background 0.15s;
}
.stats-table tbody tr:hover { background: #2D3039; }
.stats-table td {
  padding: 8px 10px;
  text-align: center;
  vertical-align: middle;
}
.stats-table td:first-child { text-align: left; padding-left: 14px; }

/* 行状态背景 */
.row-error td { background: rgba(219,68,55,0.05); }
.row-warning td { background: rgba(249,171,0,0.04); }

/* 通道名列 */
.td-name { display: flex; align-items: center; gap: 6px; }
.ch-idx {
  width: 20px; height: 20px; border-radius: 4px;
  background: rgba(26,115,232,0.2); color: #8AB4F8;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0;
}
.ch-name-text { max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 数值着色 */
.val-good  { color: #0F9D58; font-weight: 600; }
.val-warning { color: #F9AB00; font-weight: 600; }
.val-error { color: #DB4437; font-weight: 600; }

/* 状态列 */
.td-status { display: flex; align-items: center; justify-content: center; gap: 5px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.status-text { font-size: 11px; }
.text-good { color: #0F9D58; }
.text-warning { color: #F9AB00; }
.text-error { color: #DB4437; }

/* 底部 */
.stats-footer {
  margin-top: 16px;
  text-align: center;
}
.footer-tip { font-size: 11px; color: #5F6368; }

/* Drawer 暗色主题 */
:deep(.el-drawer) {
  background: #1A1D23;
  border-left: 1px solid #3C4043;
}
:deep(.el-drawer__header) {
  padding: 14px 20px 12px;
  border-bottom: 1px solid #3C4043;
  margin-bottom: 0;
}
:deep(.el-drawer__body) {
  padding: 16px 20px;
  overflow-y: auto;
}
:deep(.el-drawer__close-btn) { color: #9AA0A6; }
:deep(.el-drawer__close-btn:hover) { color: #E8EAED; }
</style>
