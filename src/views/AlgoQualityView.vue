<template>
  <div class="algo-quality-view">
    <div class="page-header">
      <h2>算法质量看板</h2>
      <el-tag effect="plain" type="info" size="large">
        最近更新: {{ lastUpdated }}
      </el-tag>
    </div>

    <!-- Top stat cards -->
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic title="算法总数" :value="summary.totalAlgos" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic title="平均精度" :value="summary.avgPrecision" suffix="%" :precision="1" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic title="平均召回率" :value="summary.avgRecall" suffix="%" :precision="1" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic title="活跃模型" :value="summary.activeModels" />
        </el-card>
      </el-col>
    </el-row>

    <!-- Quality table -->
    <el-card class="table-card" v-loading="loading">
      <template #header>
        <div class="card-header">
          <span>算法质量详情</span>
          <el-input
            v-model="keyword"
            placeholder="搜索算法名称..."
            clearable
            style="width: 220px"
            size="default"
          />
        </div>
      </template>
      <el-table :data="filteredAlgos" stripe style="width: 100%">
        <el-table-column prop="name" label="算法名称" min-width="160" />
        <el-table-column label="精度" width="100" align="center">
          <template #default="{ row }">
            <span :class="metricClass(row.precision)">{{ row.precision.toFixed(1) }}%</span>
          </template>
        </el-table-column>
        <el-table-column label="召回率" width="100" align="center">
          <template #default="{ row }">
            <span :class="metricClass(row.recall)">{{ row.recall.toFixed(1) }}%</span>
          </template>
        </el-table-column>
        <el-table-column label="F1分数" width="100" align="center">
          <template #default="{ row }">{{ row.f1_score.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="mAP@50" width="110" align="center">
          <template #default="{ row }">{{ row.mAP50.toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column label="推理耗时" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.avg_inference_ms > 80 ? 'danger' : row.avg_inference_ms > 50 ? 'warning' : 'success'" size="small" effect="plain">
              {{ row.avg_inference_ms.toFixed(0) }} ms
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="FPS" width="90" align="center">
          <template #default="{ row }">
            <span>{{ row.fps ? row.fps.toFixed(1) : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="最近运行" width="170" align="center">
          <template #default="{ row }">{{ row.last_benchmark_time }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="dark">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && filteredAlgos.length === 0" description="尚无算法性能数据,请先在系统中运行推理任务" />
    </el-card>

    <!-- Benchmark history timeline -->
    <el-card class="timeline-card" v-loading="loading">
      <template #header><span>最近 7 天运行趋势</span></template>
      <el-empty v-if="!loading && benchmarkHistory.length === 0" description="近 7 天无推理运行记录" :image-size="80" />
      <el-timeline v-else>
        <el-timeline-item
          v-for="run in benchmarkHistory"
          :key="run.id"
          :timestamp="run.time"
          placement="top"
          :type="run.run_count > 0 ? 'success' : 'info'"
        >
          <el-card shadow="never" class="timeline-item-card">
            <div class="run-header">
              <strong>{{ run.title }}</strong>
              <el-tag :type="run.run_count > 0 ? 'success' : 'info'" size="small">
                {{ run.run_count }} 次推理
              </el-tag>
            </div>
            <div class="run-detail">
              <span>平均耗时: {{ run.avgLatencyMs.toFixed(1) }} ms</span>
              <span>平均FPS: {{ run.avgFps.toFixed(1) }}</span>
              <span>运行次数: {{ run.run_count }}</span>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { statisticsApi, type AlgoPerformanceItem } from '@/api/statistics'

interface BenchmarkRun {
  id: number
  time: string
  title: string
  run_count: number
  avgLatencyMs: number
  avgFps: number
}

const keyword = ref('')
const lastUpdated = ref('加载中...')
const loading = ref(false)

const algorithms = ref<AlgoPerformanceItem[]>([])
const trend = ref<BenchmarkRun[]>([])

const summary = computed(() => {
  const list = algorithms.value
  const active = list.filter(a => a.status === 'active')
  if (list.length === 0) {
    return { totalAlgos: 0, avgPrecision: 0, avgRecall: 0, activeModels: 0 }
  }
  return {
    totalAlgos: list.length,
    avgPrecision: list.reduce((s, a) => s + a.precision, 0) / list.length,
    avgRecall: list.reduce((s, a) => s + a.recall, 0) / list.length,
    activeModels: active.length,
  }
})

const filteredAlgos = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return algorithms.value
  return algorithms.value.filter(a => a.name.toLowerCase().includes(kw))
})

const benchmarkHistory = computed<BenchmarkRun[]>(() => {
  return trend.value.map((t: any, idx: number) => ({
    id: idx + 1,
    time: t.time || t.date || '',
    title: `${t.date} 推理运行汇总`,
    run_count: t.run_count ?? 0,
    avgLatencyMs: t.avg_latency_ms ?? t.avgLatencyMs ?? 0,
    avgFps: t.avg_fps ?? t.avgFps ?? 0,
  }))
})

function metricClass(val: number): string {
  if (val >= 90) return 'metric-good'
  if (val >= 80) return 'metric-warn'
  return 'metric-bad'
}

function statusType(s: string): 'success' | 'warning' | 'info' {
  return s === 'active' ? 'success' : s === 'beta' ? 'warning' : 'info'
}

function statusLabel(s: string): string {
  const map: Record<string, string> = { active: '已上线', beta: '测试中', deprecated: '已下线' }
  return map[s] ?? s
}

async function load() {
  loading.value = true
  try {
    const { data } = await statisticsApi.getAlgorithmPerformance({ days: 7 })
    const payload = (data?.data ?? data) as any
    algorithms.value = payload?.items ?? []
    trend.value = (payload?.trend ?? []).map((t: any) => ({
      ...t,
      time: t.date,
      title: `${t.date} 推理运行汇总`,
    }))
    lastUpdated.value = payload?.last_updated ?? new Date().toISOString().slice(0, 16).replace('T', ' ')
    if (algorithms.value.length === 0 && (payload?.total ?? 0) === 0) {
      // 首次访问可能无 perf_logs 数据,这是正常的
      ElMessage.info('尚无算法性能数据,运行推理后将在此显示')
    }
  } catch (e: any) {
    ElMessage.error(`加载算法性能失败: ${e?.message ?? e}`)
    algorithms.value = []
    trend.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.algo-quality-view { padding: 0 4px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; color: #303133; }

.stat-row { margin-bottom: 16px; }
.stat-card { text-align: center; }
.stat-card :deep(.el-statistic__head) { font-size: 13px; color: #909399; }
.stat-card :deep(.el-statistic__content) { font-size: 28px; font-weight: 700; color: #303133; }

.table-card { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }

.metric-good { color: #67C23A; font-weight: 600; }
.metric-warn { color: #E6A23C; font-weight: 600; }
.metric-bad { color: #F56C6C; font-weight: 600; }

.timeline-card { margin-bottom: 16px; }
.timeline-item-card :deep(.el-card__body) { padding: 12px 16px; }
.run-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.run-header strong { font-size: 14px; color: #303133; }
.run-detail { display: flex; gap: 20px; font-size: 13px; color: #909399; }
</style>