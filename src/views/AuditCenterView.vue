<template>
  <div class="audit-page">
    <div class="page-title">
      <h2>🔍 审计中心</h2>
      <el-button type="primary" @click="handleExport" :loading="exporting">
        <el-icon><Download /></el-icon>导出报告
      </el-button>
    </div>

    <!-- 审计统计 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="6" v-for="s in auditStatCards" :key="s.label">
        <el-card shadow="hover" class="audit-stat-card">
          <div class="audit-stat-value" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="audit-stat-label">{{ s.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 操作分布 + 小时分布 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="12">
        <el-card header="操作类型分布">
          <LazyChart :option="actionDistributionOption" height="260px" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="24小时操作分布">
          <LazyChart :option="hourlyDistributionOption" height="260px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 审计日志表格 -->
    <el-card header="操作日志">
      <template #header>
        <div class="card-header">
          <span>操作日志</span>
          <div class="header-filters">
            <el-input v-model="searchUser" placeholder="搜索用户" style="width: 160px" size="small" clearable />
            <el-select v-model="actionFilter" placeholder="操作类型" style="width: 130px" size="small" clearable>
              <el-option label="全部" value="" />
              <el-option label="登录" value="login" />
              <el-option label="创建" value="create" />
              <el-option label="更新" value="update" />
              <el-option label="删除" value="delete" />
              <el-option label="导出" value="export" />
            </el-select>
            <el-select v-model="resultFilter" placeholder="结果" style="width: 100px" size="small" clearable>
              <el-option label="全部" value="" />
              <el-option label="成功" value="success" />
              <el-option label="失败" value="failure" />
            </el-select>
            <el-date-picker
              v-model="dateRange" type="datetimerange" range-separator="至"
              start-placeholder="开始" end-placeholder="结束"
              style="width: 340px" size="small"
              format="MM-DD HH:mm"
            />
          </div>
        </div>
      </template>
      <el-table :data="filteredLogs" stripe v-loading="cloudStore.loading" size="small">
        <el-table-column prop="timestamp" label="时间" width="170" />
        <el-table-column prop="username" label="用户" width="120" />
        <el-table-column prop="action" label="操作" width="100">
          <template #default="{ row }">
            <el-tag :type="actionTag(row.action)" size="small">{{ actionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="resource" label="资源" width="130" />
        <el-table-column prop="resourceId" label="资源ID" width="120" />
        <el-table-column prop="details" label="详情" min-width="200">
          <template #default="{ row }">
            <span class="log-detail">{{ row.details }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="result" label="结果" width="80">
          <template #default="{ row }">
            <el-tag :type="row.result === 'success' ? 'success' : 'danger'" size="small">
              {{ row.result === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="140" />
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="showDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top: 16px; text-align: right">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="cloudStore.auditTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="loadLogs"
        />
      </div>
    </el-card>

    <!-- 日志详情弹窗 -->
    <el-dialog v-model="detailVisible" title="日志详情" width="500px">
      <div v-if="currentLog" class="log-detail-dialog">
        <div class="detail-row"><span>时间：</span>{{ currentLog.timestamp }}</div>
        <div class="detail-row"><span>用户：</span>{{ currentLog.username }} ({{ currentLog.userId }})</div>
        <div class="detail-row"><span>操作：</span>{{ actionLabel(currentLog.action) }}</div>
        <div class="detail-row"><span>资源：</span>{{ currentLog.resource }} / {{ currentLog.resourceId }}</div>
        <div class="detail-row"><span>结果：</span>{{ currentLog.result === 'success' ? '成功' : '失败' }}</div>
        <div class="detail-row"><span>IP：</span>{{ currentLog.ip }}</div>
        <div class="detail-row"><span>User Agent：</span>{{ currentLog.userAgent }}</div>
        <div class="detail-row"><span>详情：</span>{{ currentLog.details }}</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCloudStore } from '@/stores/cloud'
import { ElMessage } from 'element-plus'
import LazyChart from '@/components/LazyChart.vue'
import type { AuditLog } from '@/types/analytics'

const cloudStore = useCloudStore()
const searchUser = ref('')
const actionFilter = ref('')
const resultFilter = ref('')
const dateRange = ref<[Date, Date] | null>(null)
const page = ref(1)
const pageSize = ref(20)
const exporting = ref(false)
const detailVisible = ref(false)
const currentLog = ref<AuditLog | null>(null)

const auditStatCards = computed(() => {
  const s = cloudStore.auditStats
  return [
    { label: '今日操作数', value: s?.todayOps?.toLocaleString() ?? '-', color: '#1890ff' },
    { label: '总操作数', value: s?.totalOps?.toLocaleString() ?? '-', color: '#52c41a' },
    { label: '失败率', value: s?.failureRate ? (s.failureRate * 100).toFixed(1) + '%' : '-', color: '#f5222d' },
    { label: '活跃用户', value: s?.topUsers?.length ?? '-', color: '#722ed1' }
  ]
})

const filteredLogs = computed(() => {
  let logs = cloudStore.auditLogs
  if (searchUser.value) {
    const kw = searchUser.value.toLowerCase()
    logs = logs.filter(l => l.username.toLowerCase().includes(kw))
  }
  if (actionFilter.value) logs = logs.filter(l => l.action === actionFilter.value)
  if (resultFilter.value) logs = logs.filter(l => l.result === resultFilter.value)
  return logs
})

function actionTag(action: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const m: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = { login: 'info', create: 'success', update: 'warning', delete: 'danger', export: 'primary' }
  return m[action] ?? 'primary'
}

function actionLabel(action: string) {
  const m: Record<string, string> = { login: '登录', create: '创建', update: '更新', delete: '删除', export: '导出', query: '查询', config: '配置' }
  return m[action] ?? action
}

// ---- 图表 ----
const actionDistributionOption = computed(() => {
  const data = cloudStore.auditStats?.topActions ?? []
  return {
    tooltip: { trigger: 'item' as const },
    series: [{
      name: '操作分布', type: 'pie' as const, radius: ['40%', '70%'], center: ['50%', '50%'],
      label: { formatter: '{b}: {c}' },
      data: data.map(d => ({ name: actionLabel(d.action), value: d.count })),
      itemStyle: { borderRadius: 4 }
    }]
  } as any
})

const hourlyDistributionOption = computed(() => {
  const data = cloudStore.auditStats?.hourlyDistribution ?? []
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category' as const, data: data.map(d => `${d.hour}:00`) },
    yAxis: { type: 'value' as const },
    series: [{
      name: '操作数', type: 'bar' as const,
      data: data.map(d => d.count),
      itemStyle: { color: '#1890ff', borderRadius: [4, 4, 0, 0] }
    }]
  } as any
})

function showDetail(log: AuditLog) {
  currentLog.value = log
  detailVisible.value = true
}

async function handleExport() {
  exporting.value = true
  try {
    // @ts-expect-error exportAuditReport 方法可能由插件注入
    await cloudStore.exportAuditReport()
    ElMessage.success('审计报告导出成功')
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

async function loadLogs() {
  await cloudStore.fetchAuditLogs({ page: page.value, pageSize: pageSize.value })
}

onMounted(async () => {
  await Promise.all([loadLogs(), cloudStore.fetchAuditStats()])
})
</script>

<style scoped>
.audit-page { padding: 0 4px; }
.page-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title h2 { margin: 0; font-size: 20px; }
.audit-stat-card { text-align: center; padding: 4px 0; }
.audit-stat-value { font-size: 28px; font-weight: 700; }
.audit-stat-label { font-size: 13px; color: #6b7280; margin-top: 4px; }
.card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.header-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.log-detail { color: #6b7280; font-size: 12px; }
.log-detail-dialog .detail-row { padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
.log-detail-dialog .detail-row span { font-weight: 600; color: #6b7280; }
</style>
