<template>
  <div class="analytics-page">
    <el-card shadow="never" class="header-card">
      <div class="page-header">
        <h2>联动引擎效能分析</h2>
        <el-button @click="refresh" :loading="loading"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
    </el-card>

    <!-- 延迟指标卡片 -->
    <el-row :gutter="16" class="stat-row" v-loading="loading">
      <el-col :span="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value" style="color: #00D4AA">{{ latency.p50?.toFixed(1) ?? '-' }}<span class="unit">ms</span></div>
          <div class="metric-label">P50 延迟</div>
          <div class="metric-sub">中位数匹配速度</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value" style="color: #3B82F6">{{ latency.p90?.toFixed(1) ?? '-' }}<span class="unit">ms</span></div>
          <div class="metric-label">P90 延迟</div>
          <div class="metric-sub">90% 事件在此延迟内</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value" style="color: #FFB800">{{ latency.p99?.toFixed(1) ?? '-' }}<span class="unit">ms</span></div>
          <div class="metric-label">P99 延迟</div>
          <div class="metric-sub">长尾延迟监控</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value" style="color: #8B5CF6">{{ latency.samples ?? 0 }}</div>
          <div class="metric-label">采样总数</div>
          <div class="metric-sub">环形缓冲样本量</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- [P1-2 2026-08-28] 运营指标: 每相机日误报 + 规则成功率 Top/Bottom -->
    <el-row :gutter="16" class="stat-row" v-loading="loading">
      <el-col :span="8">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-value" style="color: #FF6B35">{{ camDayFalseAlarms.toFixed(2) }}</div>
          <div class="metric-label">每相机日误报</div>
          <div class="metric-sub">近 {{ baselineDays }} 天 · 误报 {{ baselineTotalFalse }} / {{ activeCameras }} 台相机</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="metric-card">
          <template #header><span>成功率 TOP3</span></template>
          <div v-if="topSuccess.length > 0">
            <div v-for="s in topSuccess" :key="s.rule_id" class="rate-item">
              <span class="rate-name" :title="s.rule_name">{{ s.rule_name }}</span>
              <span class="rate-num" style="color: #00D4AA">{{ ((s.success_rate ?? 0) * 100).toFixed(0) }}%</span>
            </div>
          </div>
          <div v-else class="empty-hint">样本不足 (需≥3次动作)</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="metric-card">
          <template #header><span>成功率 BOTTOM3</span></template>
          <div v-if="bottomSuccess.length > 0">
            <div v-for="s in bottomSuccess" :key="s.rule_id" class="rate-item">
              <span class="rate-name" :title="s.rule_name">{{ s.rule_name }}</span>
              <span class="rate-num" style="color: #FF3D71">{{ ((s.success_rate ?? 0) * 100).toFixed(0) }}%</span>
            </div>
          </div>
          <div v-else class="empty-hint">样本不足 (需≥3次动作)</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 动作执行统计 -->
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span>动作执行统计</span></template>
          <div class="action-stats" v-if="actionStats">
            <div class="stat-item">
              <span class="stat-dot" style="background: #00D4AA"></span>
              <span class="stat-label">成功执行</span>
              <span class="stat-num">{{ actionStats.total_executed }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-dot" style="background: #FF3D71"></span>
              <span class="stat-label">执行失败</span>
              <span class="stat-num">{{ actionStats.total_failed }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-dot" style="background: #FFB800"></span>
              <span class="stat-label">冷却跳过</span>
              <span class="stat-num">{{ actionStats.cooldown_skips }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-dot" style="background: #3B82F6"></span>
              <span class="stat-label">合并事件</span>
              <span class="stat-num">{{ actionStats.merge_count }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-dot" style="background: #8B5CF6"></span>
              <span class="stat-label">VLM抑制</span>
              <span class="stat-num">{{ actionStats.vlm_suppressed }}</span>
            </div>
          </div>
          <div v-else style="text-align:center;padding:40px;color:#9AA0A6">暂无数据</div>
          <!-- 成功率环形进度 -->
          <div class="success-rate" v-if="actionStats && actionStats.total_executed > 0">
            <el-progress type="dashboard" :percentage="successRate" :color="successRate > 95 ? '#00D4AA' : successRate > 80 ? '#FFB800' : '#FF3D71'" :width="100" />
            <p>动作执行成功率</p>
          </div>
        </el-card>
      </el-col>

      <!-- TOP10 触发规则 -->
      <el-col :span="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span>触发次数 TOP10</span></template>
          <div v-if="topTriggered.length > 0">
            <div v-for="(item, idx) in topTriggered.slice(0, 10)" :key="item.rule_id" class="top-item">
              <span class="top-rank" :class="{ 'rank-top': idx < 3 }">{{ idx + 1 }}</span>
              <span class="top-name">{{ item.rule_name }}</span>
              <el-progress :percentage="getPercentage(item.trigger_count)" :stroke-width="14" :show-text="false" :color="barColor(idx)" style="flex:1" />
              <span class="top-count">{{ item.trigger_count }}</span>
              <span class="top-latency">{{ item.avg_latency_ms?.toFixed(1) }}ms</span>
            </div>
          </div>
          <div v-else style="text-align:center;padding:40px;color:#9AA0A6">暂无触发记录</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { linkageApi, type RuleTriggerStat } from '@/api/linkage'
import { statisticsApi } from '@/api/statistics'

const loading = ref(false)
const latency = ref<{ p50: number; p90: number; p99: number; samples: number }>({ p50: 0, p90: 0, p99: 0, samples: 0 })
const topTriggered = ref<Array<{ rule_id: string; rule_name: string; trigger_count: number; avg_latency_ms: number }>>([])
const actionStats = ref<{ total_executed: number; total_failed: number; cooldown_skips: number; merge_count: number; vlm_suppressed: number } | null>(null)

// [P1-2] 运营指标: 每相机日误报 + 规则成功率 Top/Bottom
const camDayFalseAlarms = ref(0)
const baselineDays = ref(30)
const baselineTotalFalse = ref(0)
const activeCameras = ref(0)
const ruleStats = ref<RuleTriggerStat[]>([])

const MIN_ACTION_SAMPLES = 3
const topSuccess = computed(() =>
  ruleStats.value
    .filter(s => s.action_success + s.action_failed >= MIN_ACTION_SAMPLES)
    .sort((a, b) => (b.success_rate ?? 0) - (a.success_rate ?? 0))
    .slice(0, 3))
const bottomSuccess = computed(() =>
  ruleStats.value
    .filter(s => s.action_success + s.action_failed >= MIN_ACTION_SAMPLES)
    .sort((a, b) => (a.success_rate ?? 0) - (b.success_rate ?? 0))
    .slice(0, 3))

const successRate = computed(() => {
  if (!actionStats.value || actionStats.value.total_executed === 0) return 0
  const total = actionStats.value.total_executed + actionStats.value.total_failed
  if (total === 0) return 0
  return Math.round((actionStats.value.total_executed / total) * 100)
})

const maxTrigger = computed(() => topTriggered.value[0]?.trigger_count ?? 1)

function getPercentage(count: number) {
  return Math.round((count / maxTrigger.value) * 100)
}

function barColor(idx: number) {
  const colors = ['#FF3D71', '#FF6B35', '#FFB800', '#00D4AA', '#3B82F6', '#8B5CF6', '#06B6D4', '#22C55E', '#F59E0B', '#6B7280']
  return colors[idx] || '#3B82F6'
}

async function refresh() {
  loading.value = true
  try {
    // [P1-2] 三路并行: 引擎分析 + 按规则统计 + 误报基线 (每相机日误报)
    const [analyticsRes, statsRes, baselineRes] = await Promise.allSettled([
      linkageApi.getAnalytics(),
      linkageApi.getRuleStatsReport(),
      statisticsApi.getFalseAlarmBaseline({ days: 30, include_feedback: false }),
    ])
    if (analyticsRes.status === 'fulfilled') {
      const data = analyticsRes.value.data?.data
      if (data) {
        latency.value = data.latency
        topTriggered.value = data.topTriggered || []
        actionStats.value = data.actionStats
      }
    }
    if (statsRes.status === 'fulfilled') {
      ruleStats.value = statsRes.value.data?.data || []
    }
    if (baselineRes.status === 'fulfilled') {
      const b = baselineRes.value.data?.data
      if (b) {
        camDayFalseAlarms.value = b.false_alarms_per_camera_day ?? 0
        baselineDays.value = b.days ?? 30
        baselineTotalFalse.value = b.total_false_alarms ?? 0
        activeCameras.value = b.by_channel?.length ?? 0
      }
    }
  } catch (e) {
    console.error('[LinkageAnalytics] fetch error:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => refresh())
</script>

<style scoped>
.analytics-page { padding: 16px; }
.header-card { margin-bottom: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h2 { margin: 0; font-size: 18px; }
.stat-row { margin-bottom: 16px; }
.metric-card { text-align: center; padding: 8px; }
.metric-value { font-size: 32px; font-weight: 700; }
.metric-value .unit { font-size: 14px; margin-left: 4px; }
.metric-label { font-size: 14px; color: #E8E8E8; margin-top: 4px; }
.metric-sub { font-size: 11px; color: #9AA0A6; margin-top: 2px; }
.chart-card { min-height: 400px; }
.action-stats { padding: 12px 0; }
.stat-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.stat-dot { width: 8px; height: 8px; border-radius: 4px; }
.stat-label { width: 100px; color: #9AA0A6; font-size: 13px; }
.stat-num { font-weight: 700; color: #E8E8E8; font-size: 16px; }
.success-rate { text-align: center; margin-top: 20px; }
.success-rate p { font-size: 12px; color: #9AA0A6; margin-top: 8px; }
.top-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.top-rank { width: 20px; text-align: center; font-size: 12px; color: #9AA0A6; font-weight: 700; }
.rank-top { color: #FFB800; font-size: 14px; }
.top-name { width: 140px; font-size: 12px; color: #E8E8E8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.top-count { font-size: 12px; font-weight: 700; color: #00D4AA; min-width: 40px; text-align: right; }
.top-latency { font-size: 10px; color: #9AA0A6; min-width: 50px; text-align: right; }
.rate-item { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.rate-name { font-size: 12px; color: #E8E8E8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
.rate-num { font-size: 13px; font-weight: 700; }
.empty-hint { text-align: center; padding: 18px 0; color: #9AA0A6; font-size: 12px; }
</style>
