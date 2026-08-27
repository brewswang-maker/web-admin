<template>
  <div class="le-density-page">
    <!-- ===== 工具栏 ===== -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <span class="toolbar-label">通道</span>
          <el-select v-model="channelId" style="width: 220px" @change="onChannelChange"
                     placeholder="选择通道">
            <el-option v-for="c in channels" :key="c.id" :label="`${c.id} - ${c.name || c.channelName || ''}`"
                       :value="Number(c.id)" />
          </el-select>
          <el-select v-model="colorScheme" style="width: 130px" @change="drawHeatmap">
            <el-option label="Jet" value="jet" />
            <el-option label="Turbo" value="turbo" />
            <el-option label="灰度" value="grayscale" />
            <el-option label="Viridis" value="viridis" />
          </el-select>
          <el-switch v-model="showVectors" active-text="矢量叠加" />
        </div>
        <div class="toolbar-right">
          <span v-if="lastUpdated" class="updated-at">更新于 {{ lastUpdated }}</span>
          <el-button size="small" :loading="loading" @click="refreshAll">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- ===== 分级预警徽标条 ===== -->
    <div class="level-banner">
      <template v-if="profileBadges.length > 0">
        <div v-for="b in profileBadges" :key="b.region_id" class="badge"
             :class="badgeClass(b.level)" :title="b.title">
          <span class="badge-region">{{ b.region_id }}</span>
          <span class="badge-ratio">{{ (b.ratio * 100).toFixed(1) }}%</span>
          <span class="badge-level">{{ b.levelCn || '正常' }}</span>
        </div>
      </template>
      <div v-else class="badge none">暂无容量档案 — 未配置分级预警</div>
      <div v-if="flowAnomaly" class="badge flow-anomaly">
        ⚠ 方向紊乱持续 {{ (anomalySustainedMs / 1000).toFixed(0) }}s (熵 {{ maxEntropy.toFixed(2) }} &gt; 0.85)
      </div>
    </div>

    <el-row :gutter="16">
      <!-- ===== 热力网格 + 矢量叠加 ===== -->
      <el-col :span="14">
        <el-card shadow="never" class="canvas-card">
          <template #header>
            <div class="card-header">
              <span>密度热力网格 {{ heatmapMeta }}</span>
              <el-tag v-if="totalCount > 0" size="small">总人数 {{ totalCount }}</el-tag>
            </div>
          </template>
          <div class="canvas-wrap">
            <canvas ref="heatCanvas" width="480" height="480" class="heat-canvas" />
            <div v-if="!hasHeatmap" class="canvas-empty">
              暂无密度快照<br />
              <span class="hint">通道产生 density_heatmap 数据后自动展示</span>
            </div>
          </div>
          <div class="legend">
            <span class="legend-label">低</span>
            <div class="legend-bar" />
            <span class="legend-label">高 (max_cell={{ maxCell }})</span>
          </div>
        </el-card>
      </el-col>

      <!-- ===== 趋势 + 预测 ===== -->
      <el-col :span="10">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>密度趋势与 15min 预测</span>
              <el-tag v-if="predictInfo" size="small" type="warning">{{ predictInfo }}</el-tag>
            </div>
          </template>
          <LazyChart v-if="trendOption" :option="trendOption" height="300px" />
          <el-empty v-else description="暂无历史数据 (需 ≥5 个密度快照)" :image-size="70" />
          <div class="predict-meta" v-if="slopePerMin !== null">
            趋势斜率:
            <strong :style="{ color: slopePerMin > 0 ? '#f56c6c' : '#67c23a' }">
              {{ slopePerMin > 0 ? '+' : '' }}{{ slopePerMin.toFixed(1) }} 人/min
            </strong>
            <span class="hint"> (EMA α=0.3 + 线性外推, 置信区间 95%)</span>
          </div>
        </el-card>

        <el-card shadow="never" class="chart-card" style="margin-top: 16px">
          <template #header>
            <div class="card-header"><span>矢量场统计</span></div>
          </template>
          <el-descriptions :column="2" size="small" border>
            <el-descriptions-item label="移动样本">{{ flowData?.moving_samples ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="最大格熵">{{ flowData ? flowData.max_entropy.toFixed(3) : '-' }}</el-descriptions-item>
            <el-descriptions-item label="平均格熵">{{ flowData ? flowData.mean_entropy.toFixed(3) : '-' }}</el-descriptions-item>
            <el-descriptions-item label="紊乱判定阈值">{{ flowData?.entropy_threshold ?? 0.85 }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 密度热力大屏 — EventGuard T2.3 (方案任务 1.7)
 *
 * Canvas 网格分区着色 (heatmap rgba / jet-turbo-grayscale-viridis) +
 * 黄/橙/红分级预警徽标条 (容量档案 + 实时占用比) + 矢量叠加层
 * (flow-field mean_vx/mean_vy 箭头) + 密度趋势与 15-30min 预测曲线。
 */
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import LazyChart from '@/components/LazyChart.vue'
import type { EChartsOption } from 'echarts'
import { channelApi } from '@/api/channel'
import { largeEventApi } from '@/api/largeEvent'
import type {
  CapacityProfile,
  FlowFieldResponse,
  DensityHeatmapResponse,
} from '@/types/largeEvent'
import type { PageResponse } from '@/types/common'

interface ChannelRow { id: string | number; name?: string; channelName?: string }

const channelId = ref<number>(-1)
const channels = ref<ChannelRow[]>([])
const colorScheme = ref('jet')
const showVectors = ref(true)
const loading = ref(false)

const heatCanvas = ref<HTMLCanvasElement>()
const heatmap = ref<DensityHeatmapResponse | null>(null)
const flowData = ref<FlowFieldResponse | null>(null)
const profiles = ref<CapacityProfile[]>([])

const lastUpdated = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

// ── 派生状态 ──
const hasHeatmap = computed(() => !!heatmap.value?.found && (heatmap.value?.grid_w ?? 0) > 0)
const totalCount = computed(() => heatmap.value?.total_count ?? 0)
const maxCell = computed(() => heatmap.value?.max_cell ?? 0)
const maxEntropy = computed(() => flowData.value?.max_entropy ?? 0)
const flowAnomaly = computed(() => flowData.value?.anomaly ?? false)
const anomalySustainedMs = computed(() => flowData.value?.anomaly_sustained_ms ?? 0)
const heatmapMeta = computed(() =>
  hasHeatmap.value ? `(${heatmap.value!.grid_w}×${heatmap.value!.grid_h})` : '')

const slopePerMin = ref<number | null>(null)
const predictInfo = ref('')
// shallowRef 避免 UnwrapRef 深度展开 EChartsOption 联合 (graphic 类型变形)
const trendOption = shallowRef<EChartsOption | null>(null)

// ── 分级徽标 (容量档案 + 实时总人数对设计容量占用比) ──
const profileBadges = computed(() => {
  const total = totalCount.value
  return profiles.value
    .filter(p => p.enabled)
    .filter(p => p.channel_id === 0 || p.channel_id === channelId.value)
    .map(p => {
      const ratio = p.design_capacity > 0 ? total / p.design_capacity : 0
      let level = ''
      for (const lv of p.levels) if (ratio >= lv.capacity_ratio) level = lv.name
      const levelCn = level === 'yellow' ? '黄色' : level === 'orange' ? '橙色' : level === 'red' ? '红色' : ''
      return {
        region_id: p.region_id,
        ratio,
        level,
        levelCn,
        title: `${total}/${p.design_capacity} 人 · 滞回 Δ${p.hysteresis.release_ratio_delta}/${p.hysteresis.min_hold_sec}s`,
      }
    })
})

function badgeClass(level: string) {
  return level === 'red' ? 'red' : level === 'orange' ? 'orange' : level === 'yellow' ? 'yellow' : 'ok'
}

// ── 渲染 ──
function drawHeatmap() {
  const cvs = heatCanvas.value
  const hm = heatmap.value
  if (!cvs || !hm?.found || hm.grid_w <= 0) return
  const ctx = cvs.getContext('2d')
  if (!ctx) return

  const W = cvs.width, H = cvs.height
  const gw = hm.grid_w, gh = hm.grid_h
  const cw = W / gw, ch = H / gh
  ctx.clearRect(0, 0, W, H)

  // 底色 (rgba 网格)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const px = hm.rgba?.[y]?.[x]
      if (Array.isArray(px) && px.length >= 3) {
        ctx.fillStyle = `rgba(${px[0]},${px[1]},${px[2]},0.92)`
      } else {
        ctx.fillStyle = '#1a1a2e'
      }
      ctx.fillRect(x * cw, y * ch, cw - 1, ch - 1)
    }
  }

  // 矢量叠加 (flow-field mean_vx/mean_vy 箭头, 白色)
  if (showVectors.value && flowData.value?.found && Array.isArray(flowData.value.cells)) {
    const fg = flowData.value.grid || gw
    const fcw = W / fg, fch = H / fg
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    for (let y = 0; y < fg; y++) {
      for (let x = 0; x < fg; x++) {
        const cell = flowData.value.cells[y]?.[x]
        if (!cell || cell.count <= 0) continue
        const speed = Math.hypot(cell.mean_vx, cell.mean_vy)
        if (speed < 0.005) continue
        const cx0 = x * fcw + fcw / 2, cy0 = y * fch + fch / 2
        // 箭头长度随速度 (上限格宽 70%)
        const len = Math.min(fcw * 0.7, speed * 4000 + 6)
        const dx = cell.mean_vx / (speed || 1) * len
        const dy = cell.mean_vy / (speed || 1) * len
        ctx.beginPath()
        ctx.moveTo(cx0 - dx / 2, cy0 - dy / 2)
        ctx.lineTo(cx0 + dx / 2, cy0 + dy / 2)
        ctx.stroke()
        // 箭头头部
        const ang = Math.atan2(dy, dx)
        ctx.beginPath()
        ctx.moveTo(cx0 + dx / 2, cy0 + dy / 2)
        ctx.lineTo(cx0 + dx / 2 - 6 * Math.cos(ang - 0.45), cy0 + dy / 2 - 6 * Math.sin(ang - 0.45))
        ctx.lineTo(cx0 + dx / 2 - 6 * Math.cos(ang + 0.45), cy0 + dy / 2 - 6 * Math.sin(ang + 0.45))
        ctx.closePath()
        ctx.fill()
      }
    }
  }
}

watch([heatmap, flowData, showVectors], drawHeatmap, { deep: false })

// ── 数据拉取 ──
async function fetchChannels() {
  try {
    const res = await channelApi.getList({ pageSize: 200 } as never)
    const page = res.data?.data as unknown as PageResponse<ChannelRow> | undefined
    channels.value = (page?.items ?? []) as ChannelRow[]
    if (channelId.value === -1 && channels.value.length > 0) {
      const first = Number(channels.value[0].id)
      if (Number.isFinite(first)) channelId.value = first
    }
  } catch {
    channels.value = []
  }
}

async function fetchHeatmap() {
  try {
    const res = await largeEventApi.getDensityHeatmap(channelId.value, colorScheme.value)
    const d = res.data?.data
    heatmap.value = d?.found ? d : null
  } catch {
    heatmap.value = null
  }
}

async function fetchFlow() {
  try {
    const res = await largeEventApi.getFlowField(channelId.value)
    flowData.value = res.data?.data?.found ? (res.data.data as FlowFieldResponse) : null
  } catch {
    flowData.value = null
  }
}

async function fetchProfiles() {
  try {
    const res = await largeEventApi.listCapacityProfiles()
    profiles.value = res.data?.data?.profiles ?? []
  } catch {
    profiles.value = []
  }
}

async function fetchTrendAndPredict() {
  const ch = channelId.value
  const now = Date.now()
  try {
    const [histRes, predRes] = await Promise.allSettled([
      largeEventApi.getDensityHistory({ channel_id: ch, since_ms: now - 60 * 60000, limit: 200 }),
      largeEventApi.getDensityPredict(ch, 15),
    ])

    // 历史 → (t, 总人数)
    const series: Array<[number, number]> = []
    if (histRes.status === 'fulfilled') {
      const hist = histRes.value.data?.data?.history ?? []
      for (const e of hist) {
        let total = 0
        if (Array.isArray(e.counts)) {
          for (const row of e.counts) for (const c of row) total += Number(c) || 0
        }
        series.push([e.snapshot_ms, total])
      }
      series.sort((a, b) => a[0] - b[0])
    }

    // 预测
    const predPoints: Array<[number, number, number, number]> = []
    slopePerMin.value = null
    predictInfo.value = ''
    if (predRes.status === 'fulfilled') {
      const pd = predRes.value.data?.data
      if (pd?.found && Array.isArray(pd.points)) {
        for (const p of pd.points)
          predPoints.push([p.timestamp_ms, p.density, p.lower, p.upper])
        slopePerMin.value = pd.slope_per_min ?? null
        predictInfo.value = pd.history_samples
          ? `基于 ${pd.history_samples} 个历史点` : ''
      } else {
        predictInfo.value = pd?.reason ? `预测不可用: ${pd.reason}` : '预测不可用'
      }
    }

    if (series.length > 0) {
      trendOption.value = buildTrendOption(series, predPoints)
    } else {
      trendOption.value = predPoints.length > 0
        ? buildTrendOption([], predPoints)
        : null
    }
  } catch {
    trendOption.value = null
  }
}

function buildTrendOption(
  hist: Array<[number, number]>,
  pred: Array<[number, number, number, number]>
): EChartsOption {
  const histX = hist.map(p => p[0])
  const histY = hist.map(p => p[1])
  const predX = pred.map(p => p[0])
  const lower = pred.map(p => p[2])
  const upper = [...pred.map(p => p[3])].reverse()
  const upperX = [...predX].reverse()
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['历史密度', '预测', '置信区间'], top: 0 },
    grid: { left: 48, right: 16, top: 30, bottom: 40 },
    xAxis: {
      type: 'time',
      axisLabel: { formatter: '{HH}:{mm}' },
    },
    yAxis: { type: 'value', name: '人数', minInterval: 1 },
    series: [
      {
        name: '置信区间',
        type: 'line',
        data: [...predX.map((t, i) => [t, lower[i]] as [number, number]),
               ...upperX.map((t, i) => [t, upper[i]] as [number, number])],
        lineStyle: { opacity: 0 },
        areaStyle: { color: 'rgba(230,162,60,0.18)' },
        stack: 'confidence',
        symbol: 'none',
        silent: true,
      },
      {
        name: '历史密度',
        type: 'line',
        data: histX.map((t, i) => [t, histY[i]]),
        showSymbol: false,
        lineStyle: { color: '#409eff', width: 2 },
      },
      {
        name: '预测',
        type: 'line',
        data: predX.map((t, i) => [t, pred[i][1]]),
        showSymbol: false,
        lineStyle: { color: '#e6a23c', width: 2, type: 'dashed' },
      },
    ],
  }
}

function onChannelChange() {
  refreshAll()
}

async function refreshAll() {
  loading.value = true
  try {
    await Promise.allSettled([fetchHeatmap(), fetchFlow(), fetchTrendAndPredict()])
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchChannels()
  await Promise.allSettled([fetchProfiles(), refreshAll()])
  // 10s 轮询 (节流: 与后端快照 5min 粒度相比已高频)
  pollTimer = setInterval(refreshAll, 10000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.le-density-page { padding: 16px; }
.toolbar-card { margin-bottom: 12px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; }
.toolbar-left { display: flex; align-items: center; gap: 12px; }
.toolbar-label { color: #606266; font-size: 13px; }
.updated-at { font-size: 12px; color: #909399; margin-right: 8px; }
.level-banner { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.badge {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 14px; border-radius: 6px; font-size: 13px;
  color: #fff; background: #909399;
}
.badge.yellow { background: #e6a23c; }
.badge.orange { background: #f56c6c; }
.badge.red { background: #c40000; box-shadow: 0 0 10px rgba(196, 0, 0, 0.5); }
.badge.ok { background: #67c23a; }
.badge.flow-anomaly { background: #7b1fa2; }
.badge-region { font-family: monospace; font-weight: 600; }
.badge-ratio { font-weight: 700; }
.canvas-card :deep(.el-card__header) { padding: 12px 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.canvas-wrap { position: relative; display: flex; justify-content: center; }
.heat-canvas {
  border-radius: 8px; background: #10101c;
  max-width: 100%; aspect-ratio: 1;
}
.canvas-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; color: #909399;
  background: rgba(16, 16, 28, 0.85); border-radius: 8px;
}
.canvas-empty .hint { font-size: 12px; margin-top: 6px; color: #c0c4cc; }
.legend { display: flex; align-items: center; gap: 8px; margin-top: 10px; justify-content: center; }
.legend-label { font-size: 12px; color: #909399; }
.legend-bar {
  width: 200px; height: 10px; border-radius: 5px;
  background: linear-gradient(90deg, #00007f, #009dff, #00ff90, #ffff00, #ff3000, #7f0000);
}
.predict-meta { margin-top: 10px; font-size: 13px; color: #606266; }
.predict-meta .hint { color: #909399; font-size: 12px; }
</style>
