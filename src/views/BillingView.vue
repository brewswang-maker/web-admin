<template>
  <div class="billing-view">
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
              <div class="value">{{ records.length }}</div>
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
          <el-button type="primary" size="small" :icon="DownloadIcon" @click="handleExport">导出账单</el-button>
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
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Wallet, Coin, Warning, Tickets, Download as DownloadIcon } from '@element-plus/icons-vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { BillingRecord, BillingSummary } from '@/types/billing'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const statusLabels: Record<string, string> = { paid: '已支付', pending: '待支付', overdue: '已逾期' }
const statusMap: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = { paid: 'success', pending: 'warning', overdue: 'danger' }

const records = ref<BillingRecord[]>([
  { id: 'bill-001', period: '2025-06', deviceId: 'camera-01', deviceName: '摄像头-01', planName: '专业版', baseFee: 99, usageFee: 32.5, totalFee: 131.5, status: 'paid', createdAt: Date.now() - 86400000 * 5 },
  { id: 'bill-002', period: '2025-06', deviceId: 'camera-02', deviceName: '摄像头-02', planName: '标准版', baseFee: 49, usageFee: 12.0, totalFee: 61.0, status: 'pending', createdAt: Date.now() - 86400000 * 3 },
  { id: 'bill-003', period: '2025-06', deviceId: 'gateway-01', deviceName: '边缘网关', planName: '企业版', baseFee: 299, usageFee: 0, totalFee: 299, status: 'paid', createdAt: Date.now() - 86400000 * 7 },
  { id: 'bill-004', period: '2025-05', deviceId: 'sensor-01', deviceName: '温度传感器-01', planName: '基础版', baseFee: 19, usageFee: 5.5, totalFee: 24.5, status: 'paid', createdAt: Date.now() - 86400000 * 30 },
  { id: 'bill-005', period: '2025-05', deviceId: 'sensor-02', deviceName: '湿度传感器-01', planName: '基础版', baseFee: 19, usageFee: 3.2, totalFee: 22.2, status: 'overdue', createdAt: Date.now() - 86400000 * 35 },
])

const summary = reactive<BillingSummary>({
  totalSpent: 538.2, currentMonth: 491.5, lastMonth: 46.7, pendingAmount: 61.0,
  monthlyTrend: [
    { month: '2025-01', amount: 320 }, { month: '2025-02', amount: 385 },
    { month: '2025-03', amount: 410 }, { month: '2025-04', amount: 445 },
    { month: '2025-05', amount: 46.7 }, { month: '2025-06', amount: 491.5 },
  ],
})

function planTagType(plan: string) {
  if (plan.includes('企业')) return 'danger'
  if (plan.includes('专业')) return 'primary'
  if (plan.includes('标准')) return 'warning'
  return 'info'
}

function handleExport() { ElMessage.success('账单导出任务已创建') }

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

onMounted(() => {
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: summary.monthlyTrend.map(t => t.month) },
      yAxis: { type: 'value', name: '费用 (¥)' },
      series: [{
        type: 'bar', data: summary.monthlyTrend.map(t => t.amount),
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#409EFF' }, { offset: 1, color: '#79bbff' }]), borderRadius: [4, 4, 0, 0] },
        barWidth: 36,
      }],
      grid: { left: 60, right: 20, top: 30, bottom: 30 },
    })
  }
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
}
</style>
