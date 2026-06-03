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
    <el-card class="table-card">
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
        <el-table-column label="基准测试时间" width="170" align="center">
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
    </el-card>

    <!-- Benchmark history timeline -->
    <el-card class="timeline-card">
      <template #header><span>基准测试历史</span></template>
      <el-timeline>
        <el-timeline-item
          v-for="run in benchmarkHistory"
          :key="run.id"
          :timestamp="run.time"
          placement="top"
          :type="run.passed ? 'success' : 'danger'"
        >
          <el-card shadow="never" class="timeline-item-card">
            <div class="run-header">
              <strong>{{ run.title }}</strong>
              <el-tag :type="run.passed ? 'success' : 'danger'" size="small">
                {{ run.passed ? '通过' : '未通过' }}
              </el-tag>
            </div>
            <div class="run-detail">
              <span>算法: {{ run.algoCount }}</span>
              <span>均值mAP: {{ run.avgMAP }}%</span>
              <span>最大延迟: {{ run.maxLatencyMs }}ms</span>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface AlgoMetric {
  name: string
  precision: number
  recall: number
  f1_score: number
  mAP50: number
  avg_inference_ms: number
  last_benchmark_time: string
  status: 'active' | 'beta' | 'deprecated'
}

interface BenchmarkRun {
  id: number
  time: string
  title: string
  passed: boolean
  algoCount: number
  avgMAP: number
  maxLatencyMs: number
}

const keyword = ref('')
const lastUpdated = '2026-05-31 10:30'

const algorithms = ref<AlgoMetric[]>([
  { name: '行人检测 v3.2', precision: 94.5, recall: 91.2, f1_score: 0.93, mAP50: 93.8, avg_inference_ms: 32, last_benchmark_time: '2026-05-30 14:22', status: 'active' },
  { name: '车辆检测 v2.8', precision: 96.1, recall: 93.7, f1_score: 0.95, mAP50: 95.2, avg_inference_ms: 28, last_benchmark_time: '2026-05-30 14:22', status: 'active' },
  { name: '车牌识别 v4.1', precision: 97.3, recall: 95.8, f1_score: 0.97, mAP50: 96.9, avg_inference_ms: 45, last_benchmark_time: '2026-05-29 09:15', status: 'active' },
  { name: '人脸检测 v5.0', precision: 92.0, recall: 88.6, f1_score: 0.90, mAP50: 90.4, avg_inference_ms: 38, last_benchmark_time: '2026-05-28 16:40', status: 'active' },
  { name: '火焰烟雾检测 v1.3', precision: 89.4, recall: 85.1, f1_score: 0.87, mAP50: 87.0, avg_inference_ms: 55, last_benchmark_time: '2026-05-27 11:00', status: 'beta' },
  { name: '奔跑检测 v1.0', precision: 82.6, recall: 78.3, f1_score: 0.80, mAP50: 79.5, avg_inference_ms: 62, last_benchmark_time: '2026-05-25 08:30', status: 'beta' },
  { name: '越界检测 v2.1', precision: 91.0, recall: 87.5, f1_score: 0.89, mAP50: 88.7, avg_inference_ms: 41, last_benchmark_time: '2026-05-24 13:20', status: 'active' },
  { name: '遗留物检测 v0.9', precision: 75.2, recall: 70.8, f1_score: 0.73, mAP50: 72.1, avg_inference_ms: 88, last_benchmark_time: '2026-05-20 17:50', status: 'deprecated' },
])

const benchmarkHistory = ref<BenchmarkRun[]>([
  { id: 1, time: '2026-05-30 14:22', title: '全量回归测试 #38', passed: true, algoCount: 8, avgMAP: 88.2, maxLatencyMs: 88 },
  { id: 2, time: '2026-05-25 09:00', title: '新增算法准入测试 #37', passed: true, algoCount: 7, avgMAP: 86.5, maxLatencyMs: 65 },
  { id: 3, time: '2026-05-20 17:50', title: '遗留物检测模型迭代 #36', passed: false, algoCount: 7, avgMAP: 84.1, maxLatencyMs: 92 },
  { id: 4, time: '2026-05-15 10:10', title: '周度例行基准测试 #35', passed: true, algoCount: 6, avgMAP: 90.3, maxLatencyMs: 55 },
  { id: 5, time: '2026-05-10 08:30', title: '车牌识别升级验证 #34', passed: true, algoCount: 6, avgMAP: 89.8, maxLatencyMs: 60 },
])

const summary = computed(() => {
  const list = algorithms.value
  const active = list.filter(a => a.status === 'active')
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
