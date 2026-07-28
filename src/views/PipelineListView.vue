<template>
  <div class="pipeline-list" v-loading="loading">
    <!-- ============ 顶部工具栏 ============ -->
    <el-card shadow="never" class="toolbar">
      <div class="toolbar-row">
        <div class="toolbar-left">
          <h3 class="page-title">🧩 {{ $t('menu.pipeline') }}</h3>
          <el-tag size="small" type="info" effect="plain" class="count-tag">
            {{ filteredPipelines.length }} / {{ pipelines.length }}
          </el-tag>
        </div>
        <div class="toolbar-right">
          <el-input
            v-model="searchKeyword"
            :placeholder="$t('common.searchPlaceholder') || '搜索名称或 ID'"
            size="small"
            clearable
            style="width: 260px"
            :prefix-icon="Search"
          />
          <el-select
            v-model="stateFilter"
            size="small"
            style="width: 140px"
            :placeholder="$t('common.status')"
          >
            <el-option :label="$t('common.all')" value="" />
            <el-option :label="$t('pipelineList.state.running')" value="RUNNING" />
            <el-option :label="$t('pipelineList.state.deployed')" value="DEPLOYED" />
            <el-option :label="$t('pipelineList.state.stopped')" value="STOPPED" />
            <el-option :label="$t('pipelineList.state.error')" value="ERROR" />
            <el-option :label="$t('pipelineList.state.idle')" value="IDLE" />
          </el-select>
          <el-button size="small" :loading="loading" @click="loadAll">
            <el-icon><Refresh /></el-icon>{{ $t('common.refresh') }}
          </el-button>
          <el-button
            size="small"
            type="primary"
            @click="handleCreate"
            v-if="auth.can('pipelines', 'write')"
          >
            <el-icon><Plus /></el-icon>{{ $t('pipelineList.create') }}
          </el-button>
          <el-dropdown
            trigger="click"
            @command="handleBatchCmd"
            :disabled="selectedIds.length === 0"
          >
            <el-button size="small" :disabled="selectedIds.length === 0">
              {{ $t('pipelineList.batchActions') }}
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="delete">
                  <el-icon><Delete /></el-icon>{{ $t('pipelineList.batchDelete') }}
                </el-dropdown-item>
                <el-dropdown-item command="export">
                  <el-icon><Download /></el-icon>{{ $t('pipelineList.batchExport') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-card>

    <!-- ============ 流水线列表 ============ -->
    <el-card shadow="never" class="table-card">
      <el-empty
        v-if="!loading && pipelines.length === 0"
        :description="$t('pipelineList.empty')"
      >
        <el-button type="primary" @click="handleCreate">
          {{ $t('pipelineList.createFirst') }}
        </el-button>
      </el-empty>

      <el-empty
        v-else-if="!loading && filteredPipelines.length === 0"
        :description="$t('pipelineList.emptyFiltered')"
      />

      <el-table
        v-else
        ref="tableRef"
        :data="pagedPipelines"
        stripe
        size="small"
        row-key="id"
        @selection-change="onSelectionChange"
        :header-cell-style="{ background: '#f5f7fa', color: '#606266' }"
        class="pipeline-table"
      >
        <el-table-column type="selection" width="48" :selectable="row => !!row.id" />

        <el-table-column :label="$t('pipelineList.col.name')" min-width="220">
          <template #default="{ row }">
            <div class="name-cell">
              <span class="name-icon">🧩</span>
              <div class="name-stack">
                <el-link
                  type="primary"
                  :underline="false"
                  class="name-link"
                  @click="handleEdit(row.id)"
                >
                  {{ row.name || row.id }}
                </el-link>
                <span class="id-text" :title="row.id">{{ row.id }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="$t('pipelineList.col.structure')" width="180">
          <template #default="{ row }">
            <div class="structure-cell">
              <el-tag size="small" type="info" effect="plain">
                {{ $t('pipelineList.col.nodes', { n: (row.nodes || []).length }) }}
              </el-tag>
              <el-tag size="small" type="info" effect="plain">
                {{ $t('pipelineList.col.edges', { n: (row.connections || []).length }) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="$t('pipelineList.col.status')" width="110">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="stateTagType(row.deploy_state)"
              effect="dark"
            >
              {{ stateLabel(row.deploy_state) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 运行时迷你指标 -->
        <el-table-column :label="$t('pipelineList.col.runtime')" min-width="260">
          <template #default="{ row }">
            <div class="runtime-cell">
              <div class="runtime-row">
                <span class="rt-label">FPS</span>
                <span class="rt-value" :class="fpsClass(row.runtime?.total_fps)">
                  {{ formatNumber(row.runtime?.total_fps, 1) }}
                </span>
                <span class="rt-sep">·</span>
                <span class="rt-label">{{ $t('pipelineList.col.latency') }}</span>
                <span class="rt-value" :class="latencyClass(row.runtime?.avg_latency_ms)">
                  {{ formatNumber(row.runtime?.avg_latency_ms, 1) }}ms
                </span>
              </div>
              <div class="runtime-row secondary">
                <span class="rt-label">{{ $t('pipelineList.col.tpu') }}</span>
                <el-progress
                  :percentage="Math.round((row.runtime?.tpu_utilization || 0) * 100)"
                  :stroke-width="6"
                  :show-text="false"
                  :color="tpuColor"
                  style="flex: 1; min-width: 80px; max-width: 120px;"
                />
                <span class="rt-value small">
                  {{ Math.round((row.runtime?.tpu_utilization || 0) * 100) }}%
                </span>
                <span class="rt-sep">·</span>
                <span class="rt-label">{{ $t('pipelineList.col.channels') }}</span>
                <span class="rt-value small">{{ row.runtime?.active_channels || 0 }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="$t('pipelineList.col.frames')" width="110">
          <template #default="{ row }">
            <span class="frames-text">{{ row.runtime?.total_frames?.toLocaleString() || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="$t('pipelineList.col.actions')" width="240" fixed="right">
          <template #default="{ row }">
            <el-button-group>
              <el-button
                size="small"
                type="primary"
                link
                @click="handleEdit(row.id)"
                v-if="auth.can('pipelines', 'write')"
              >
                <el-icon><Edit /></el-icon>{{ $t('common.edit') }}
              </el-button>
              <el-button
                v-if="isDeployable(row.deploy_state) && auth.can('pipelines', 'write')"
                size="small"
                type="success"
                link
                :loading="rowActionLoading[`deploy-${row.id}`]"
                @click="handleDeploy(row)"
              >
                <el-icon><VideoPlay /></el-icon>{{ $t('pipelineList.action.deploy') }}
              </el-button>
              <el-button
                v-else-if="isStoppable(row.deploy_state) && auth.can('pipelines', 'write')"
                size="small"
                type="warning"
                link
                :loading="rowActionLoading[`stop-${row.id}`]"
                @click="handleStop(row)"
              >
                <el-icon><VideoPause /></el-icon>{{ $t('pipelineList.action.stop') }}
              </el-button>
              <el-dropdown trigger="click" @command="(cmd) => onRowCmd(cmd, row)">
                <el-button size="small" link>
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="clone">
                      <el-icon><CopyDocument /></el-icon>{{ $t('pipelineList.action.clone') }}
                    </el-dropdown-item>
                    <el-dropdown-item command="export">
                      <el-icon><Download /></el-icon>{{ $t('common.export') }}
                    </el-dropdown-item>
                    <el-dropdown-item command="duplicate-deploy" divided v-if="isDeployable(row.deploy_state) && auth.can('pipelines', 'write')">
                      <el-icon><Refresh /></el-icon>{{ $t('pipelineList.action.redeploy') }}
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" divided v-if="auth.can('pipelines', 'write')">
                      <el-icon style="color:#F56C6C"><Delete /></el-icon>
                      <span style="color:#F56C6C">{{ $t('common.delete') }}</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="filteredPipelines.length > pageSize"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="filteredPipelines.length"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, Plus, Edit, Delete, Download, ArrowDown,
  VideoPlay, VideoPause, CopyDocument, MoreFilled,
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import {
  getPipelines, deletePipeline, deployPipeline, undeployPipeline,
  savePipeline, getPipelineRuntime,
} from '@/api/pipeline'
import type { Pipeline, PipelineRuntimeStatus } from '@/api/pipeline'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const { t } = useI18n()
const auth = useAuthStore()

interface PipelineRow extends Pipeline {
  deploy_state?: string
  runtime?: PipelineRuntimeStatus | null
  runtimeError?: boolean
}

// ============ 状态 ============
const loading = ref(false)
const pipelines = ref<PipelineRow[]>([])
const searchKeyword = ref('')
const stateFilter = ref('')
const selectedIds = ref<string[]>([])
const currentPage = ref(1)
const pageSize = ref(20)
const rowActionLoading = reactive<Record<string, boolean>>({})
const tableRef = ref<any>(null)

let runtimeRefreshTimer: number | null = null

// ============ 计算属性 ============
const filteredPipelines = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  return pipelines.value.filter(p => {
    if (stateFilter.value && p.deploy_state !== stateFilter.value) return false
    if (!kw) return true
    return (p.name || '').toLowerCase().includes(kw)
      || (p.id || '').toLowerCase().includes(kw)
  })
})

const pagedPipelines = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredPipelines.value.slice(start, start + pageSize.value)
})

// ============ 状态显示 ============
function stateLabel(s?: string): string {
  switch ((s || '').toUpperCase()) {
    case 'RUNNING': return t('pipelineList.state.running')
    case 'DEPLOYED': return t('pipelineList.state.deployed')
    case 'STOPPED': return t('pipelineList.state.stopped')
    case 'IDLE': return t('pipelineList.state.idle')
    case 'ERROR': return t('pipelineList.state.error')
    case 'DEPLOYING': return t('pipelineList.state.deploying')
    case 'UNDEPLOYING': return t('pipelineList.state.undeploying')
    default: return s || t('pipelineList.state.idle')
  }
}
function stateTagType(s?: string): 'success' | 'warning' | 'danger' | 'info' {
  switch ((s || '').toUpperCase()) {
    case 'RUNNING': return 'success'
    case 'DEPLOYED': return 'success'
    case 'ERROR': return 'danger'
    case 'DEPLOYING':
    case 'UNDEPLOYING': return 'warning'
    case 'STOPPED':
    case 'IDLE':
    default: return 'info'
  }
}
function isDeployable(s?: string) {
  const v = (s || '').toUpperCase()
  return v === 'IDLE' || v === 'STOPPED' || v === 'ERROR' || !v
}
function isStoppable(s?: string) {
  const v = (s || '').toUpperCase()
  return v === 'RUNNING' || v === 'DEPLOYED' || v === 'DEPLOYING'
}

// 性能颜色
function fpsClass(fps?: number) {
  if (fps === undefined || fps === null) return ''
  if (fps >= 10) return 'rt-good'
  if (fps >= 5) return 'rt-warn'
  return 'rt-bad'
}
function latencyClass(ms?: number) {
  if (ms === undefined || ms === null) return ''
  if (ms <= 50) return 'rt-good'
  if (ms <= 100) return 'rt-warn'
  return 'rt-bad'
}
const tpuColor = [
  { color: '#67c23a', percentage: 60 },
  { color: '#e6a23c', percentage: 80 },
  { color: '#f56c6c', percentage: 100 },
]
function formatNumber(v?: number, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—'
  return Number(v).toFixed(digits)
}

// ============ 数据加载 ============
async function loadAll() {
  loading.value = true
  try {
    const { data: resp } = await getPipelines()
    const list = (resp?.data || resp || []) as PipelineRow[]
    // 保证每个 entry 有 id
    pipelines.value = list.map(p => ({
      ...p,
      id: p.id || '',
      runtime: null,
      runtimeError: false,
    }))
    await loadRuntimeMetrics()
  } catch (e: any) {
    console.error('[PipelineList] load failed:', e)
    ElMessage.error(t('pipelineList.loadFailed') + ': ' + (e?.message || ''))
    pipelines.value = []
  } finally {
    loading.value = false
  }
}

/**
 * 加载运行时指标：对已部署的流水线并发拉取 runtime
 *   - 未部署的 pipeline 跳过（runtime 字段保持 null，UI 显示 —）
 *   - 失败容错：单个失败不影响整体
 */
async function loadRuntimeMetrics() {
  const tasks = pipelines.value
    .filter((p): p is PipelineRow => !!p.id && isStoppable(p.deploy_state))
    .map(async (p) => {
      try {
        const { data: resp } = await getPipelineRuntime(p.id!)
        const runtime = (resp?.data || resp || null) as PipelineRuntimeStatus | null
        p.runtime = runtime
        p.runtimeError = false
      } catch {
        p.runtimeError = true
      }
    })
  await Promise.allSettled(tasks)
}

// ============ 操作 ============
function handleCreate() {
  router.push('/pipelines/editor')
}

function handleEdit(id: string) {
  if (!id) {
    ElMessage.warning(t('pipelineList.invalidId'))
    return
  }
  router.push(`/pipelines/editor/${encodeURIComponent(id)}`)
}

async function handleDeploy(row: PipelineRow) {
  if (!row.id) return
  const key = `deploy-${row.id}`
  rowActionLoading[key] = true
  try {
    await deployPipeline(row.id)
    ElMessage.success(t('pipelineList.action.deployOk', { name: row.name || row.id }))
    await loadAll()
  } catch (e: any) {
    ElMessage.error(t('pipelineList.action.deployFail') + ': ' + (e?.message || ''))
  } finally {
    rowActionLoading[key] = false
  }
}

async function handleStop(row: PipelineRow) {
  if (!row.id) return
  try {
    await ElMessageBox.confirm(
      t('pipelineList.action.stopConfirm', { name: row.name || row.id }),
      t('common.confirm'),
      { type: 'warning' }
    )
  } catch { return }
  const key = `stop-${row.id}`
  rowActionLoading[key] = true
  try {
    await undeployPipeline(row.id)
    ElMessage.success(t('pipelineList.action.stopOk', { name: row.name || row.id }))
    await loadAll()
  } catch (e: any) {
    ElMessage.error(t('pipelineList.action.stopFail') + ': ' + (e?.message || ''))
  } finally {
    rowActionLoading[key] = false
  }
}

async function handleDelete(row: PipelineRow) {
  if (!row.id) return
  try {
    await ElMessageBox.confirm(
      t('pipelineList.action.deleteConfirm', { name: row.name || row.id }),
      t('common.delete'),
      { type: 'warning' }
    )
  } catch { return }
  try {
    await deletePipeline(row.id)
    ElMessage.success(t('pipelineList.action.deleteOk', { name: row.name || row.id }))
    await loadAll()
  } catch (e: any) {
    ElMessage.error(t('pipelineList.action.deleteFail') + ': ' + (e?.message || ''))
  }
}

/**
 * 克隆：调用 savePipeline 创建一条新流水线，name 自动加 "副本"
 *   后端 POST /pipelines 无 ID 会自动生成（BUG 3 修复路径）
 */
async function handleClone(row: PipelineRow) {
  if (!row.nodes) return
  try {
    const cloneData: Pipeline = {
      name: `${row.name || row.id} ${t('pipelineList.cloneSuffix')}`,
      nodes: JSON.parse(JSON.stringify(row.nodes)),
      connections: JSON.parse(JSON.stringify(row.connections || [])),
    }
    const { data: resp } = await savePipeline(cloneData)
    const newId = (resp as any)?.data?.id || (resp as any)?.id
    ElMessage.success(t('pipelineList.action.cloneOk'))
    if (newId) {
      router.push(`/pipelines/editor/${encodeURIComponent(newId)}`)
    } else {
      await loadAll()
    }
  } catch (e: any) {
    ElMessage.error(t('pipelineList.action.cloneFail') + ': ' + (e?.message || ''))
  }
}

/**
 * 导出：把当前行序列化为 JSON 触发下载
 */
function handleExport(row: PipelineRow) {
  const data = {
    id: row.id,
    name: row.name,
    nodes: row.nodes,
    connections: row.connections,
    exported_at: new Date().toISOString(),
    exported_by: auth.username,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeName = row.name || row.id || 'pipeline'
  a.download = `pipeline_${safeName.replace(/[^\w\-]/g, '_')}_${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  ElMessage.success(t('pipelineList.action.exportOk'))
}

/** 行内更多菜单 */
function onRowCmd(cmd: string, row: PipelineRow) {
  switch (cmd) {
    case 'clone': handleClone(row); break
    case 'export': handleExport(row); break
    case 'delete': handleDelete(row); break
    case 'duplicate-deploy':
      handleDeploy(row)
      break
  }
}

// ============ 批量操作 ============
function onSelectionChange(rows: PipelineRow[]) {
  selectedIds.value = rows.map(r => r.id).filter((id): id is string => Boolean(id))
}

async function handleBatchCmd(cmd: string) {
  if (selectedIds.value.length === 0) return
  if (cmd === 'delete') {
    try {
      await ElMessageBox.confirm(
        t('pipelineList.batchDeleteConfirm', { n: selectedIds.value.length }),
        t('common.confirm'),
        { type: 'warning' }
      )
    } catch { return }
    let ok = 0, fail = 0
    for (const id of selectedIds.value) {
      try {
        await deletePipeline(id)
        ok++
      } catch { fail++ }
    }
    ElMessage.success(t('pipelineList.batchDeleteResult', { ok, fail }))
    await loadAll()
  } else if (cmd === 'export') {
    const selected = pipelines.value.filter(p => selectedIds.value.includes(p.id || ''))
    const data = {
      version: 1,
      exported_at: new Date().toISOString(),
      pipelines: selected.map(p => ({
        id: p.id,
        name: p.name,
        nodes: p.nodes,
        connections: p.connections,
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pipelines_batch_${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    ElMessage.success(t('pipelineList.batchExportOk', { n: selected.length }))
  }
}

// ============ 生命周期 ============
onMounted(() => {
  loadAll()
  // 运行时指标定时刷新（10s）
  runtimeRefreshTimer = window.setInterval(() => {
    if (!document.hidden) loadRuntimeMetrics()
  }, 10_000)
})

onUnmounted(() => {
  if (runtimeRefreshTimer) {
    clearInterval(runtimeRefreshTimer)
    runtimeRefreshTimer = null
  }
})
</script>

<style scoped>
.pipeline-list {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar { padding: 12px 16px; }
.toolbar-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.toolbar-left { display: flex; align-items: center; gap: 12px; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 18px; font-weight: 600; color: var(--app-text-primary); }
.count-tag { font-weight: 500; }

.table-card { padding: 0; }
.table-card :deep(.el-card__body) { padding: 0; }

.pipeline-table { width: 100%; }
.pipeline-table :deep(.el-table__cell) { padding: 8px 0; }

/* 名称列 */
.name-cell { display: flex; align-items: center; gap: 10px; }
.name-icon { font-size: 20px; }
.name-stack { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.name-link {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}
.id-text {
  font-size: 11px;
  color: var(--app-text-secondary);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}

/* 结构列 */
.structure-cell { display: flex; gap: 6px; align-items: center; }

/* 运行时列 */
.runtime-cell { display: flex; flex-direction: column; gap: 4px; min-width: 240px; }
.runtime-row { display: flex; align-items: center; gap: 6px; }
.runtime-row.secondary { font-size: 12px; }
.rt-label { color: var(--app-text-secondary); font-size: 12px; }
.rt-value { font-weight: 600; font-family: var(--font-mono); font-size: 13px; }
.rt-value.small { font-weight: 500; font-size: 12px; }
.rt-sep { color: var(--app-text-disabled); }
.rt-good { color: #67c23a; }
.rt-warn { color: #e6a23c; }
.rt-bad { color: #f56c6c; }

.frames-text { font-family: var(--font-mono); font-size: 13px; color: var(--app-text-secondary); }

.pagination { padding: 16px; justify-content: flex-end; }
</style>
