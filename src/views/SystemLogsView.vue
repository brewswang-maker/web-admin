<template>
  <div class="system-logs-page">
    <div class="page-header">
      <h2>系统日志</h2>
      <div class="header-actions">
        <el-select v-model="levelFilter" placeholder="日志级别" clearable size="small" style="width:120px">
          <el-option label="DEBUG" value="debug" />
          <el-option label="INFO" value="info" />
          <el-option label="WARN" value="warn" />
          <el-option label="ERROR" value="error" />
        </el-select>
        <el-select v-model="moduleFilter" placeholder="模块" clearable size="small" style="width:140px">
          <el-option v-for="m in modules" :key="m" :label="m" :value="m" />
        </el-select>
        <el-button size="small" @click="loadLogs"><el-icon><Refresh /></el-icon>刷新</el-button>
        <el-button size="small" @click="handleExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>
    </div>

    <el-table :data="logs" stripe v-loading="loading" size="small" style="width:100%">
      <el-table-column prop="timestamp" label="时间" width="170">
        <template #default="{ row }">
          <span style="font-family:monospace;font-size:12px">{{ formatTime(row.timestamp) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="level" label="级别" width="90">
        <template #default="{ row }">
          <el-tag :type="levelTagType(row.level)" size="small" effect="dark">{{ row.level.toUpperCase() }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="module" label="模块" width="140" />
      <el-table-column prop="message" label="消息" min-width="300" show-overflow-tooltip />
      <el-table-column label="详情" width="80">
        <template #default="{ row }">
          <el-button v-if="row.details" link size="small" @click="showDetail(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @change="loadLogs"
      />
    </div>

    <el-dialog v-model="detailVisible" title="日志详情" width="600px">
      <pre class="log-detail">{{ detailContent }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Download } from '@element-plus/icons-vue'
import logsApi from '@/api/logs'
import type { LogEntry } from '@/api/logs'

const loading = ref(false)
const logs = ref<LogEntry[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const levelFilter = ref('')
const moduleFilter = ref('')
const detailVisible = ref(false)
const detailContent = ref('')

const modules = ['system', 'device', 'alarm', 'agent', 'auth', 'ota', 'federation', 'marketplace', 'billing']

function levelTagType(level: string): 'success' | 'warning' | 'info' | 'danger' | 'primary' {
  const m: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = { debug: 'info', info: 'primary', warn: 'warning', error: 'danger' }
  return m[level] ?? 'info'
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function showDetail(row: LogEntry) {
  detailContent.value = row.details || ''
  detailVisible.value = true
}

async function loadLogs() {
  loading.value = true
  try {
    const res = await logsApi.list({
      level: levelFilter.value || undefined,
      module: moduleFilter.value || undefined,
      page: currentPage.value,
      pageSize: pageSize.value,
    })
    const d = res.data?.data
    if (d) {
      logs.value = d.items
      total.value = d.total
    }
  } catch {
    ElMessage.error('获取日志失败')
  } finally {
    loading.value = false
  }
}

async function handleExport() {
  try {
    const res = await logsApi.exportLogs({
      level: levelFilter.value || undefined,
      format: 'csv',
    })
    const url = res.data?.data?.url
    if (url) {
      const a = document.createElement('a')
      a.href = url
      a.download = `system_logs_${Date.now()}.csv`
      a.click()
      ElMessage.success('导出成功')
    }
  } catch {
    ElMessage.error('导出失败')
  }
}

onMounted(loadLogs)
</script>

<style scoped>
.system-logs-page {
  padding: 20px 24px;
  /* max-width: var(--content-max-width, 1440px); */
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h2 { margin: 0; font-size: 20px; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.pagination-bar { margin-top: 16px; display: flex; justify-content: flex-end; }
.log-detail {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'Roboto Mono', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
}
</style>
