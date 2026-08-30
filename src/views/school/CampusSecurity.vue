<template>
  <div class="campus-security">
    <div class="sec-head">
      <div>
        <span class="sec-title">校园安检</span>
        <span class="sec-sub">复用安检模块 22 类模板 + X 光判图 + 复核闭环 (全真机已验证)</span>
      </div>
    </div>

    <!-- 安检 KPI (screening_dashboard 真实聚合) -->
    <el-row :gutter="14" class="kpi-row">
      <el-col :span="4" v-for="k in secKpis" :key="k.label">
        <div class="kpi-card">
          <div class="kpi-badge" :class="`badge-${k.tone}`">
            <el-icon :size="20"><component :is="k.icon" /></el-icon>
          </div>
          <div class="kpi-main">
            <div class="kpi-value" :class="`val-${k.tone}`">{{ k.value }}</div>
            <div class="kpi-label">{{ k.label }}</div>
            <div class="kpi-sub">{{ k.sub }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 三大入口卡 (复用安检模块能力) -->
    <el-row :gutter="14">
      <el-col :span="8" v-for="e in entries" :key="e.path">
        <div class="entry-card" role="button" @click="$router.push(e.path)">
          <div class="entry-icon" :class="`eicon-${e.tone}`">
            <el-icon :size="26"><component :is="e.icon" /></el-icon>
          </div>
          <div class="entry-body">
            <div class="entry-name">{{ e.name }}</div>
            <div class="entry-desc">{{ e.desc }}</div>
          </div>
          <el-icon class="entry-arrow"><ArrowRight /></el-icon>
        </div>
      </el-col>
    </el-row>

    <!-- 能力清单说明 -->
    <el-card shadow="never" class="block-card">
      <template #header><span class="card-title">校园安检能力清单 <span class="card-title-sub">与安检模块同源, 一次部署双场景复用</span></span></template>
      <div class="cap-grid">
        <div v-for="c in capabilities" :key="c.name" class="cap-item">
          <i class="dot" :class="c.status === 'green' ? 'dot-green' : c.status === 'yellow' ? 'dot-yellow' : 'dot-red'" />
          <span class="cap-name">{{ c.name }}</span>
          <span class="cap-note">{{ c.note }}</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 校园安检 — [校园方案 2026-08-30]
 * 复用安检模块 (ScreeningOverview/Xray/Rules) 的 22 模板 + X 光判图 + 复核闭环,
 * KPI 来自 screening_dashboard 真实聚合 (与 /school/overview 的 campus 端点区分场景)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowRight, User, Bell, Tickets, Aim, DocumentChecked, DataAnalysis } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { screeningApi } from '@/api/screening'

const loading = ref(false)
const dash = ref<any>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const secKpis = computed(() => {
  const d = dash.value
  return [
    { label: '今日安检告警', value: String(d?.kpi.today_alarms ?? 0), tone: 'red', icon: Bell,
      sub: `事件总量 ${d?.kpi.total_events ?? 0}` },
    { label: '今日通行', value: String(d?.kpi.today_passages ?? 0), tone: 'blue', icon: User,
      sub: 'face_pass 刷脸' },
    { label: '待复核', value: String(d?.kpi.pending_review ?? 0), tone: 'orange', icon: Tickets,
      sub: `复核率 ${d ? ((d.kpi.review_rate || 0) * 100).toFixed(2) : '0.00'}%` },
    { label: '标注误报率', value: d?.feedback?.total_feedback ? `${((d.feedback.annotated_false_rate || 0) * 100).toFixed(1)}%` : '—',
      tone: 'purple', icon: Tickets, sub: `已标注 ${d?.feedback?.total_feedback ?? 0} 条` },
    { label: '联动时延', value: d?.action_latency?.sample_count ? `${d.action_latency.p50_ms.toFixed(1)} ms` : '—',
      tone: 'teal', icon: Aim, sub: d?.action_latency?.sample_count ? `p90 ${d.action_latency.p90_ms.toFixed(0)} ms` : '暂无样本' },
  ]
})

const entries = [
  { path: '/screening/overview', name: '安检总览', tone: 'blue', icon: DataAnalysis,
    desc: '6 KPI 真实聚合 / 24h 态势 / 通道排行 / 门面工程' },
  { path: '/screening/xray', name: 'X 光判图辅助', tone: 'purple', icon: Aim,
    desc: '包裹快照判图 + 人包追溯 (以图搜图同通道 ±10min)' },
  { path: '/screening/rule-manager', name: '安检规则管理', tone: 'green', icon: DocumentChecked,
    desc: '35 类安检事件过滤 / 启停 / dry-run 模拟 / 63 条生效规则' },
]

const capabilities = [
  { name: '22 类安检规则模板', status: 'green', note: '14 旧 + 8 新 (face/mask/body_temp/lpr 等)' },
  { name: '复核质控闭环', status: 'green', note: 'verdict 标注 → status 同步 → 误报基线' },
  { name: '误报率基线', status: 'green', note: 'by_channel/by_type/overall 真实聚合' },
  { name: 'X 光判图 (S2)', status: 'red', note: '核心攻坚中 — 以图搜图追溯已可用' },
  { name: '人包三态关联', status: 'yellow', note: 'S0 训练收口' },
  { name: '液体/爆炸物探测', status: 'red', note: '依赖专用传感器, 二期' },
]

async function loadAll(silent = false) {
  if (!silent) loading.value = true
  try {
    const resp = await screeningApi.getScreeningDashboard({ hours: 24, days: 7 })
    dash.value = (resp.data?.data as any) || null
  } catch (e) {
    console.error('[CampusSecurity] load failed', e)
    if (!silent) ElMessage.error('安检 KPI 加载失败')
  }
  if (!silent) loading.value = false
}

onMounted(async () => {
  await loadAll()
  refreshTimer = setInterval(() => loadAll(true), 30000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.campus-security { padding: 16px; background: #f5f7fa; min-height: calc(100vh - 84px); }
.sec-head { margin-bottom: 14px; }
.sec-title { font-size: 20px; font-weight: 700; color: #1f2d3d; margin-right: 12px; }
.sec-sub { color: #909399; font-size: 12px; }
.kpi-row { margin-bottom: 14px; }
.kpi-card {
  background: #fff; border-radius: 10px; padding: 15px 13px; display: flex; gap: 11px;
  border: 1px solid #ebeef5; transition: box-shadow 0.2s, transform 0.2s;
}
.kpi-card:hover { box-shadow: 0 6px 18px rgba(31,45,61,0.10); transform: translateY(-2px); }
.kpi-badge { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; }
.badge-blue { background: linear-gradient(135deg, #409eff, #79bbff); }
.badge-red { background: linear-gradient(135deg, #f56c6c, #fab6b6); }
.badge-orange { background: linear-gradient(135deg, #e6a23c, #f3d19e); }
.badge-purple { background: linear-gradient(135deg, #8e6ce0, #c0a3f2); }
.badge-teal { background: linear-gradient(135deg, #14b8b8, #82dcdc); }
.kpi-value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.val-blue { color: #409eff; } .val-red { color: #f56c6c; } .val-orange { color: #e6a23c; }
.val-purple { color: #8e6ce0; } .val-teal { color: #14b8b8; }
.kpi-label { color: #606266; font-size: 13px; margin-top: 2px; }
.kpi-sub { color: #909399; font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.entry-card {
  background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 18px;
  display: flex; align-items: center; gap: 14px; cursor: pointer; margin-bottom: 14px;
  transition: box-shadow 0.2s, transform 0.2s;
}
.entry-card:hover { box-shadow: 0 8px 22px rgba(31,45,61,0.12); transform: translateY(-2px); }
.entry-icon { width: 52px; height: 52px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.eicon-blue { background: linear-gradient(135deg, #409eff, #79bbff); }
.eicon-purple { background: linear-gradient(135deg, #8e6ce0, #c0a3f2); }
.eicon-green { background: linear-gradient(135deg, #67c23a, #b3e19d); }
.entry-body { flex: 1; min-width: 0; }
.entry-name { font-weight: 700; color: #303133; font-size: 15px; }
.entry-desc { color: #909399; font-size: 12px; margin-top: 4px; }
.entry-arrow { color: #c0c4cc; }
.block-card { border-radius: 10px; }
.block-card :deep(.el-card__header) { padding: 12px 16px; }
.card-title { font-weight: 600; color: #303133; font-size: 14px; }
.card-title-sub { color: #909399; font-weight: 400; font-size: 12px; margin-left: 8px; }
.cap-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; }
.cap-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-green { background: #67c23a; } .dot-yellow { background: #e6a23c; } .dot-red { background: #f56c6c; }
.cap-name { color: #303133; font-size: 13px; font-weight: 500; }
.cap-note { color: #909399; font-size: 12px; }
</style>
