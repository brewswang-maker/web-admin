<template>
  <div class="billing-view" v-loading="loading">
    <el-row :gutter="16" class="summary-row">
      <el-col :span="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-item">
            <el-icon :size="36" color="#409EFF"><Wallet /></el-icon>
            <div class="summary-text">
              <div class="value">¥{{ summary.totalSpent.toFixed(2) }}</div>
              <div class="label">累计费用</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-item">
            <el-icon :size="36" color="#67C23A"><Coin /></el-icon>
            <div class="summary-text">
              <div class="value">¥{{ summary.currentMonth.toFixed(2) }}</div>
              <div class="label">本月费用</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-item">
            <el-icon :size="36" color="#E6A23C"><Warning /></el-icon>
            <div class="summary-text">
              <div class="value">¥{{ summary.pendingAmount.toFixed(2) }}</div>
              <div class="label">待支付</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-item">
            <el-icon :size="36" color="#909399"><Tickets /></el-icon>
            <div class="summary-text">
              <div class="value">{{ totalRecords }}</div>
              <div class="label">账单总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="chart-card">
      <template #header><span>月度费用趋势</span></template>
      <div ref="chartRef" class="trend-chart"></div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <template #header>
        <el-row justify="space-between" align="middle">
          <span>账单列表</span>
          <el-button type="primary" size="small" :icon="DownloadIcon" :loading="exporting" @click="handleExport">导出账单</el-button>
        </el-row>
      </template>
      <el-table :data="records" stripe style="width:100%">
        <el-table-column prop="id" label="账单号" width="120" />
        <el-table-column prop="period" label="账期" width="100" />
        <el-table-column prop="deviceName" label="设备" min-width="120" />
        <el-table-column prop="planName" label="套餐" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="planTagType(row.planName)">{{ row.planName }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="baseFee" label="基础费" width="100">
          <template #default="{ row }">¥{{ row.baseFee.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="usageFee" label="用量费" width="100">
          <template #default="{ row }">¥{{ row.usageFee.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="totalFee" label="合计" width="120">
          <template #default="{ row }"><span style="font-weight:600;color:#303133">¥{{ row.totalFee.toFixed(2) }}</span></template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusMap[row.status]" size="small" effect="dark">{{ statusLabels[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrapper" v-if="totalRecords > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="totalRecords"
          layout="total, prev, pager, next"
          @current-change="fetchBillingRecords"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Wallet, Coin, Warning, Tickets, Download as DownloadIcon } from '@element-plus/icons-vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { BillingRecord, BillingSummary } from '@/types/billing'
import { fetchBillingSummary, fetchBillingList, exportBilling } from '@/api/billing'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const statusLabels: Record<string, string> = { paid: '已支付', pending: '待支付', overdue: '已逾期' }
const statusMap: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = { paid: 'success', pending: 'warning', overdue: 'danger' }

const loading = ref(false)
const exporting = ref(false)
const records = ref<BillingRecord[]>([])
const currentPage = ref(1)
const pageSize = 20
const totalRecords = ref(0)

const defaultSummary: BillingSummary = {
  totalSpent: 0, currentMonth: 0, lastMonth: 0, pendingAmount: 0, monthlyTrend: [],
}
const summary = reactive<BillingSummary>({ ...defaultSummary })

function planTagType(plan: string) {
  if (plan.includes('企业')) return 'danger'
  if (plan.includes('专业')) return 'primary'
  if (plan.includes('标准')) return 'warning'
  return 'info'
}

async function fetchBillingRecords() {
  try {
    const res = await fetchBillingList({ page: currentPage.value, pageSize })
    const d = res.data?.data
    records.value = d?.list ?? []
    totalRecords.value = d?.total ?? 0
  } catch (e) {
    console.warn('[BillingView] fetchBillingRecords failed:', e)
  }
}

async function fetchBillingData() {
  loading.value = true
  try {
    const [summaryRes, listRes] = await Promise.allSettled([
      fetchBillingSummary(),
      fetchBillingList({ page: currentPage.value, pageSize }),
    ])
    if (summaryRes.status === 'fulfilled') {
      const d = summaryRes.value.data?.data
      if (d) {
        summary.totalSpent = d.totalSpent ?? 0
        summary.currentMonth = d.currentMonth ?? 0
        summary.lastMonth = d.lastMonth ?? 0
        summary.pendingAmount = d.pendingAmount ?? 0
        summary.monthlyTrend = d.monthlyTrend ?? []
      }
    }
    if (listRes.status === 'fulfilled') {
      const d = listRes.value.data?.data
      records.value = d?.list ?? []
      totalRecords.value = d?.total ?? 0
    }
  } catch (e) {
    console.warn('[BillingView] fetchBillingData failed:', e)
  } finally {
    loading.value = false
  }
}

async function handleExport() {
  exporting.value = true
  try {
    const res = await exportBilling({ format: 'csv' })
    const blob = res.data
    if (blob) {
      const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]))
      const a = document.createElement('a')
      a.href = url
      a.download = `billing_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      ElMessage.success('账单导出成功')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

function initChart() {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  const trend = summary.monthlyTrend
  chart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: trend.map(t => t.month) },
    yAxis: { type: 'value', name: '费用 (¥)' },
    series: [{
      type: 'bar', data: trend.map(t => t.amount),
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#409EFF' }, { offset: 1, color: '#79bbff' }]), borderRadius: [4, 4, 0, 0] },
      barWidth: 36,
    }],
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
  })
}

onMounted(async () => {
  await fetchBillingData()
  await nextTick()
  initChart()
})

onBeforeUnmount(() => { chart?.dispose() })
</script>

<style scoped lang="scss">
.billing-view {
  .summary-row { margin-bottom: 16px; }
  .summary-card .summary-item { display: flex; align-items: center; gap: 16px;
    .summary-text { .value { font-size: 22px; font-weight: 700; color: #303133; } .label { font-size: 13px; color: #909399; margin-top: 4px; } }
  }
  .chart-card { margin-bottom: 16px; }
  .trend-chart { height: 260px; }
  .pagination-wrapper { display: flex; justify-content: flex-end; margin-top: 16px; }
}
</style>
