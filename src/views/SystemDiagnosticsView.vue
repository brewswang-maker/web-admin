<template>
  <div class="diagnostics-page">
    <div class="page-header">
      <h2>{{ $t('menu.diagnostics') }}</h2>
      <div class="header-actions">
        <el-button size="small" @click="loadAll" :loading="loading">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <!-- 资源诊断三卡 (对标 CosmoEdge GraphicsMemory) -->
    <el-row :gutter="16">
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="diag-card">
          <template #header><span class="card-title">系统内存</span></template>
          <el-progress
            :percentage="memUsedPercent"
            :status="memUsedPercent > 90 ? 'exception' : memUsedPercent > 75 ? 'warning' : 'success'"
            :stroke-width="12"
          />
          <div class="kv-line">总内存: {{ fmtBytes(memory?.system.mem_total_bytes) }}</div>
          <div class="kv-line">可用: {{ fmtBytes(memory?.system.mem_available_bytes) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="diag-card">
          <template #header><span class="card-title">服务进程</span></template>
          <div class="kv-big">{{ fmtBytes(memory?.process.rss_bytes) }}</div>
          <div class="kv-line">RSS 常驻内存 (自检服务自身占用)</div>
          <div class="kv-line">PID: {{ memory?.process.pid ?? '-' }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="diag-card">
          <template #header><span class="card-title">存储与 NPU</span></template>
          <div class="kv-line">数据盘可用: {{ fmtBytes(memory?.disk.available_bytes) }}</div>
          <div class="kv-line">路径: {{ memory?.disk.data_dir || '-' }}</div>
          <div class="kv-line">
            NPU: {{ memory?.npu.chip_model || '未检测' }}
            <template v-if="memory?.npu.tpu_cores">/ {{ memory.npu.tpu_cores }} 核</template>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 推理路由表 (对标 CosmoEdge ViewRoutes) -->
    <el-card shadow="never" class="diag-card route-card">
      <template #header>
        <div class="route-header">
          <span class="card-title">推理路由 (算法 → 模型 → 后端)</span>
          <div class="summary-tags" v-if="routesData">
            <el-tag size="small" type="info">共 {{ routesData.summary.total }}</el-tag>
            <el-tag size="small" type="success">专属 {{ routesData.summary.deployed }}</el-tag>
            <el-tag size="small" type="warning">兜底 {{ routesData.summary.fallback }}</el-tag>
            <el-tag size="small" type="danger">缺失 {{ routesData.summary.missing }}</el-tag>
            <el-tag size="small">TPU {{ routesData.summary.sophon_tpu }}</el-tag>
            <el-tag size="small">CPU {{ routesData.summary.cpu_onnx }}</el-tag>
          </div>
          <el-select v-model="statusFilter" placeholder="模型状态" clearable size="small" style="width: 130px">
            <el-option label="专属 (dedicated)" value="dedicated" />
            <el-option label="兜底 (fallback)" value="fallback" />
            <el-option label="缺失 (missing)" value="missing" />
          </el-select>
        </div>
      </template>
      <el-table :data="filteredRoutes" stripe size="small" v-loading="loading" max-height="520">
        <el-table-column prop="algo_id" label="算法 ID" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="font-family: monospace; font-size: 12px">{{ row.algo_id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" width="130" />
        <el-table-column prop="model_file" label="注册模型" min-width="180" show-overflow-tooltip />
        <el-table-column prop="model_actual_file" label="实际文件" min-width="180" show-overflow-tooltip />
        <el-table-column prop="backend" label="后端" width="110">
          <template #default="{ row }">
            <el-tag :type="backendTagType(row.backend)" size="small" effect="dark">{{ row.backend }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="model_status" label="模型状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.model_status)" size="small">{{ row.model_status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="effective_route" label="生效路由" width="130" show-overflow-tooltip />
        <el-table-column prop="algo_status" label="注册态" width="90" />
      </el-table>
    </el-card>

    <!-- 日志诊断 (QueryLogs 对标: 复用既有系统日志页 + 导出) -->
    <el-card shadow="never" class="diag-card">
      <template #header><span class="card-title">日志诊断</span></template>
      <div class="log-actions">
        <el-button size="small" @click="goSystemLogs">
          <el-icon><Document /></el-icon>打开系统日志
        </el-button>
        <span class="log-hint">日志查询/过滤/导出复用「系统日志」页 (QueryLogs 对标)；本页只做资源与路由自检。</span>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
// ============================================================================
// [M6-2 2026-09-21] 设备自检页 (P2-15) — 对标 CosmoEdge ViewRoutes(推理路由)/
//   GraphicsMemory(显存)/QueryLogs(日志) 三面板:
//     - 资源卡: /system/diagnostics/memory (系统内存/服务 RSS/磁盘/NPU)
//     - 路由表: /system/diagnostics/routes  (算法→模型→后端; 兜底/缺失可辨)
//     - 日志:   复用系统日志页 (不重复造)
//   只读诊断面, 不改任何被测对象。
// ============================================================================
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Document } from '@element-plus/icons-vue'
import systemApi from '@/api/system'
import type { DiagnosticsMemory, DiagnosticsRoutes, InferenceRoute } from '@/api/system'

const router = useRouter()
const loading = ref(false)
const memory = ref<DiagnosticsMemory | null>(null)
const routesData = ref<DiagnosticsRoutes | null>(null)
const statusFilter = ref('')

const memUsedPercent = computed(() => {
  const p = memory.value?.system.mem_used_percent ?? -1
  return p < 0 ? 0 : Math.min(Math.round(p), 100)
})

const filteredRoutes = computed<InferenceRoute[]>(() => {
  const all = routesData.value?.routes ?? []
  if (!statusFilter.value) return all
  return all.filter((r) => r.model_status === statusFilter.value)
})

function fmtBytes(v: number | undefined): string {
  if (v === undefined || v === null || v < 0) return '-'
  if (v >= 1024 ** 3) return (v / 1024 ** 3).toFixed(2) + ' GB'
  if (v >= 1024 ** 2) return (v / 1024 ** 2).toFixed(1) + ' MB'
  if (v >= 1024) return (v / 1024).toFixed(1) + ' KB'
  return v + ' B'
}

function backendTagType(b: string): 'success' | 'warning' | 'info' {
  if (b === 'sophon_tpu') return 'success'
  if (b === 'cpu_onnx') return 'warning'
  return 'info'
}

function statusTagType(s: string): 'success' | 'warning' | 'danger' {
  if (s === 'dedicated') return 'success'
  if (s === 'fallback') return 'warning'
  return 'danger'
}

function goSystemLogs() {
  router.push('/system-logs')
}

async function loadAll() {
  loading.value = true
  try {
    const [memRes, routeRes] = await Promise.all([
      systemApi.getDiagnosticsMemory(),
      systemApi.getDiagnosticsRoutes(),
    ])
    memory.value = memRes.data?.data ?? null
    routesData.value = routeRes.data?.data ?? null
  } catch {
    ElMessage.error('获取自检数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped>
.diagnostics-page {
  padding: 20px 24px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 18px;
}
.diag-card {
  margin-bottom: 16px;
}
.card-title {
  font-weight: 600;
}
.kv-line {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}
.kv-big {
  font-size: 26px;
  font-weight: 600;
  color: #303133;
}
.route-card :deep(.el-card__header) {
  padding: 12px 16px;
}
.route-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.summary-tags {
  display: flex;
  gap: 6px;
  flex: 1;
}
.log-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.log-hint {
  font-size: 12px;
  color: #909399;
}
</style>
