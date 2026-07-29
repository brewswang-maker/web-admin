<script setup lang="ts">
/**
 * 华盾AI智能视频盒子 v7.0 - 零代码训练管理
 * views/TrainingView.vue — 数据飞轮: 标注 → 增量训练 → 影子验证 → 上线
 *
 * 集成:
 *   - AnnotationView 标注工具 (跳转)
 *   - ModelIterationManager API (迭代管理/训练触发)
 *   - 训练状态实时刷新
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '@/api/http'

const router = useRouter()

// ── 类型 ──
interface IterationStats {
  total_iterations: number
  collecting: number
  training: number
  shadow_mode: number
  canary: number
  production: number
  rolled_back: number
  failed: number
  total_samples: number
}

interface ModelIteration {
  iteration_id: string
  model_id: string
  base_model_id: string
  status: 'collecting' | 'training' | 'shadow' | 'canary' | 'production' | 'unknown'
  positive_samples: number
  negative_samples: number
  total_samples: number
}

// ── 状态 ──
const loading = ref(false)
const stats = ref<IterationStats | null>(null)
const iterations = ref<ModelIteration[]>([])
const filterModelId = ref('')
const autoRefresh = ref(true)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ── 计算属性 ──
const statusCounts = computed(() => {
  const map: Record<string, number> = {}
  for (const it of iterations.value) {
    map[it.status] = (map[it.status] || 0) + 1
  }
  return map
})

const STATUS_MAP: Record<string, { label: string; type: string; icon: string }> = {
  collecting: { label: '采集中', type: 'info', icon: '📥' },
  training: { label: '训练中', type: 'warning', icon: '🔄' },
  shadow: { label: '影子验证', type: '', icon: '👻' },
  canary: { label: '灰度发布', type: 'success', icon: '🐦' },
  production: { label: '已上线', type: 'success', icon: '✅' },
  unknown: { label: '未知', type: 'danger', icon: '❓' },
}

// ── API 调用 ──
async function fetchStats() {
  try {
    const { data } = await http.get('/api/v1/model-iteration/stats')
    stats.value = data?.data || null
  } catch { /* 静默 */ }
}

async function fetchIterations() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (filterModelId.value) params.model_id = filterModelId.value
    const { data } = await http.get('/api/v1/model-iteration/iterations', { params })
    iterations.value = data?.data?.iterations || []
  } catch (e: any) {
    ElMessage.error('加载迭代列表失败: ' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

async function triggerTraining(iter: ModelIteration) {
  try {
    await ElMessageBox.confirm(
      `确认为迭代 ${iter.iteration_id} 触发增量训练？\n模型: ${iter.model_id}\n样本数: ${iter.total_samples}`,
      '触发训练',
      { type: 'info', confirmButtonText: '开始训练', cancelButtonText: '取消' }
    )
    const { data } = await http.post('/api/v1/model-iteration/trigger', {
      iteration_id: iter.iteration_id,
    })
    if (data?.data?.triggered) {
      ElMessage.success('训练已触发，请等待完成')
      await fetchIterations()
    } else {
      ElMessage.warning(data?.data?.message || '训练触发失败')
    }
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('操作失败: ' + (e.message || ''))
  }
}

async function requestRetrain() {
  const modelId = filterModelId.value || 'yolov8n'
  try {
    const { data } = await http.post('/api/v1/model-iteration/request-retrain', {
      model_id: modelId,
      fp_rate: 0.15,
      reason: '用户手动请求重训练 (误报率偏高)',
    })
    const newId = data?.data?.new_iteration_id
    if (newId) {
      ElMessage.success(`已创建新迭代: ${newId}`)
      await fetchIterations()
    } else {
      ElMessage.warning('重训练请求未成功')
    }
  } catch (e: any) {
    ElMessage.error('请求失败: ' + (e.message || ''))
  }
}

function goToAnnotation() {
  router.push('/annotation')
}

function toggleAutoRefresh() {
  if (autoRefresh.value) {
    refreshTimer = setInterval(() => {
      fetchStats()
      fetchIterations()
    }, 15000)
  } else {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  }
}

// ── 生命周期 ──
onMounted(async () => {
  await Promise.all([fetchStats(), fetchIterations()])
  toggleAutoRefresh()
})
</script>

<template>
  <div class="training-view">
    <!-- 顶部操作栏 -->
    <div class="toolbar">
      <h3 style="margin:0">🧠 零代码训练中心</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <el-input v-model="filterModelId" placeholder="按模型ID过滤" clearable style="width:180px" size="small"
          @clear="fetchIterations" @keyup.enter="fetchIterations" />
        <el-button size="small" type="primary" @click="fetchIterations">刷新</el-button>
        <el-button size="small" type="success" @click="goToAnnotation">📝 标注工具</el-button>
        <el-button size="small" type="warning" @click="requestRetrain">🔄 请求重训练</el-button>
        <el-switch v-model="autoRefresh" size="small" active-text="自动刷新" @change="toggleAutoRefresh" />
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="12" class="stats-row" v-if="stats">
      <el-col :span="3">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats.total_iterations }}</div>
          <div class="stat-label">总迭代</div>
        </el-card>
      </el-col>
      <el-col :span="3">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num" style="color:#909399">{{ stats.collecting }}</div>
          <div class="stat-label">📥 采集</div>
        </el-card>
      </el-col>
      <el-col :span="3">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num" style="color:#E6A23C">{{ stats.training }}</div>
          <div class="stat-label">🔄 训练</div>
        </el-card>
      </el-col>
      <el-col :span="3">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num" style="color:#409EFF">{{ stats.shadow_mode }}</div>
          <div class="stat-label">👻 影子</div>
        </el-card>
      </el-col>
      <el-col :span="3">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num" style="color:#67C23A">{{ stats.canary }}</div>
          <div class="stat-label">🐦 灰度</div>
        </el-card>
      </el-col>
      <el-col :span="3">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num" style="color:#67C23A">{{ stats.production }}</div>
          <div class="stat-label">✅ 上线</div>
        </el-card>
      </el-col>
      <el-col :span="3">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num" style="color:#F56C6C">{{ stats.failed }}</div>
          <div class="stat-label">❌ 失败</div>
        </el-card>
      </el-col>
      <el-col :span="3">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats.total_samples }}</div>
          <div class="stat-label">总样本</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 数据飞轮流程说明 -->
    <el-card shadow="never" class="flow-card">
      <div class="flow-steps">
        <div class="flow-step">
          <span class="flow-icon">📷</span>
          <span class="flow-text">采集样本</span>
          <span class="flow-arrow">→</span>
        </div>
        <div class="flow-step">
          <span class="flow-icon">📝</span>
          <span class="flow-text">标注数据</span>
          <span class="flow-arrow">→</span>
        </div>
        <div class="flow-step">
          <span class="flow-icon">🔄</span>
          <span class="flow-text">增量训练</span>
          <span class="flow-arrow">→</span>
        </div>
        <div class="flow-step">
          <span class="flow-icon">👻</span>
          <span class="flow-text">影子验证</span>
          <span class="flow-arrow">→</span>
        </div>
        <div class="flow-step">
          <span class="flow-icon">🐦</span>
          <span class="flow-text">灰度发布</span>
          <span class="flow-arrow">→</span>
        </div>
        <div class="flow-step">
          <span class="flow-icon">✅</span>
          <span class="flow-text">正式上线</span>
        </div>
      </div>
    </el-card>

    <!-- 迭代列表 -->
    <el-card shadow="never">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>训练迭代列表 ({{ iterations.length }})</span>
          <el-tag v-for="(count, status) in statusCounts" :key="status" size="small" style="margin-left:6px"
            :type="(STATUS_MAP[status as string]?.type as any) || 'info'">
            {{ STATUS_MAP[status as string]?.icon }} {{ STATUS_MAP[status as string]?.label }}: {{ count }}
          </el-tag>
        </div>
      </template>
      <el-table :data="iterations" v-loading="loading" stripe size="small" empty-text="暂无迭代记录">
        <el-table-column label="迭代ID" width="200">
          <template #default="{ row }">
            <code style="font-size:11px">{{ row.iteration_id }}</code>
          </template>
        </el-table-column>
        <el-table-column label="模型" width="140" prop="model_id" />
        <el-table-column label="基础模型" width="140" prop="base_model_id" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="(STATUS_MAP[row.status]?.type as any) || 'info'" size="small">
              {{ STATUS_MAP[row.status]?.icon }} {{ STATUS_MAP[row.status]?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="正样本" width="80" prop="positive_samples" />
        <el-table-column label="负样本" width="80" prop="negative_samples" />
        <el-table-column label="总样本" width="80" prop="total_samples" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button v-if="row.status === 'collecting'" type="primary" size="small"
              @click="triggerTraining(row)" :disabled="row.total_samples < 10">
              🚀 触发训练
            </el-button>
            <el-tooltip v-if="row.total_samples < 10 && row.status === 'collecting'"
              content="至少需要10个样本才能开始训练" placement="top">
              <el-icon style="color:#909399;margin-left:4px"><QuestionFilled /></el-icon>
            </el-tooltip>
            <span v-if="row.status === 'training'" style="color:#E6A23C;font-size:12px">⏳ 训练中...</span>
            <span v-if="row.status === 'production'" style="color:#67C23A;font-size:12px">✅ 已部署</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.training-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stats-row .stat-card {
  text-align: center;
  padding: 8px 0;
}
.stat-num {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}
.stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.flow-card {
  background: linear-gradient(135deg, #f5f7fa 0%, #e8f5e9 100%);
}
.flow-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 0;
}
.flow-step {
  display: flex;
  align-items: center;
  gap: 6px;
}
.flow-icon {
  font-size: 24px;
}
.flow-text {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}
.flow-arrow {
  font-size: 18px;
  color: #909399;
  margin: 0 4px;
}
</style>
