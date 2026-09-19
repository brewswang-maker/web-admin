<template>
  <el-drawer
    v-model="visible"
    class="metric-detail-drawer"
    size="480px"
    direction="rtl"
    :append-to-body="true"
    :with-header="false"
    @closed="emit('close')"
  >
    <div class="md-body">
      <!-- 标题栏 (自绘, 暗色主题) -->
      <div class="md-head">
        <span class="md-title">{{ state.title }}</span>
        <span class="md-close" @click="visible = false">✕</span>
      </div>

      <!-- ── 段 1: 实时值段 (大数字 + 副标题 + 构成分项) ── -->
      <section class="md-section">
        <div class="md-section-head">
          <span class="md-section-title">{{ t('metricDetail.section.live') }}</span>
        </div>
        <div v-if="state.loading.live" class="md-loading">
          <span class="md-spinner" />{{ t('metricDetail.loading') }}
        </div>
        <div v-else-if="state.error.live" class="md-error">
          <span>{{ state.error.live }}</span>
          <el-button size="small" text type="primary" @click="retrySection('live')">
            {{ t('metricDetail.retry') }}
          </el-button>
        </div>
        <template v-else>
          <div v-if="state.live" class="md-live">
            <span class="md-live-value">{{ state.live.value }}</span>
            <span class="md-live-sub">{{ state.live.subtitle }}</span>
          </div>
          <div v-if="state.composition.length" class="md-comp">
            <div class="md-comp-head">{{ t('metricDetail.composition') }}</div>
            <div
              v-for="(row, i) in state.composition"
              :key="i"
              class="md-comp-row"
              :class="{ clickable: !!row.action }"
              @click="onCompositionClick(row)"
            >
              <span class="md-comp-label">{{ row.label }}</span>
              <span class="md-comp-value">{{ row.value }}</span>
              <span v-if="row.action" class="md-comp-arrow">›</span>
            </div>
          </div>
        </template>
      </section>

      <!-- ── 段 2: 趋势段 (LazyChart 折线 / 空态) ── -->
      <section class="md-section">
        <div class="md-section-head">
          <span class="md-section-title">{{ t('metricDetail.section.trend') }}</span>
          <span v-if="state.trend?.unit" class="md-section-unit">{{ state.trend.unit }}</span>
        </div>
        <div v-if="state.loading.trend" class="md-loading">
          <span class="md-spinner" />{{ t('metricDetail.loading') }}
        </div>
        <div v-else-if="state.error.trend" class="md-error">
          <span>{{ state.error.trend }}</span>
          <el-button size="small" text type="primary" @click="retrySection('trend')">
            {{ t('metricDetail.retry') }}
          </el-button>
        </div>
        <template v-else-if="state.trend">
          <LazyChart :option="trendOption" height="180px" />
          <div v-if="state.trend.note" class="md-note">{{ state.trend.note }}</div>
        </template>
        <div v-else class="md-empty">{{ t('metricDetail.empty.noHistory') }}</div>
      </section>

      <!-- ── 段 3: 明细段 (最近 20 条; 行点击按深链契约跳转) ── -->
      <section class="md-section">
        <div class="md-section-head">
          <span class="md-section-title">{{ t('metricDetail.section.items') }}</span>
        </div>
        <div v-if="state.loading.items" class="md-loading">
          <span class="md-spinner" />{{ t('metricDetail.loading') }}
        </div>
        <div v-else-if="state.error.items" class="md-error">
          <span>{{ state.error.items }}</span>
          <el-button size="small" text type="primary" @click="retrySection('items')">
            {{ t('metricDetail.retry') }}
          </el-button>
        </div>
        <template v-else>
          <!-- 算法指标专用: status 筛选 chips (全部/normal/degraded/stub/routed) -->
          <div v-if="isAlgoMode && state.items.length" class="md-chips">
            <span
              v-for="c in algoChips"
              :key="c.value || 'all'"
              class="md-chip"
              :class="{ active: algoFilter === c.value }"
              @click="algoFilter = c.value"
            >{{ c.label }}</span>
          </div>

          <div v-if="displayItems.length" class="md-items">
            <template v-for="(it, i) in displayItems" :key="itemKey(it, i)">
              <!-- 告警行: 时间 + 描述 + 级别/状态角标 → /alarms 深链 -->
              <div v-if="it.kind === 'alarm'" class="md-item md-clickable" @click="onAlarmClick(it)">
                <span class="md-item-time">{{ fmtTime(it.tsMs) }}</span>
                <span class="md-item-main">
                  <span class="md-item-title">{{ it.description }}</span>
                  <span class="md-item-sub">{{ it.deviceName || it.alarmType }}</span>
                </span>
                <span class="md-badge" :class="'lv-' + it.level">{{ text('metricDetail.level.' + it.level) }}</span>
                <span class="md-badge" :class="it.status === 'unhandled' ? 'st-pending' : 'st-done'">{{ statusText(it.status) }}</span>
              </div>

              <!-- 设备行 → /devices/:id -->
              <div v-else-if="it.kind === 'device'" class="md-item md-clickable" @click="onDeviceClick(it)">
                <span class="md-item-main">
                  <span class="md-item-title">{{ it.name }}</span>
                  <span class="md-item-sub">{{ it.type || it.id }}</span>
                </span>
                <span class="md-badge" :class="it.online ? 'st-done' : 'st-off'">
                  {{ it.online ? t('metricDetail.deviceOnline') : t('metricDetail.deviceOffline') }}
                </span>
              </div>

              <!-- 算法行: 点击行内展开详情 (描述/精度/FPS/模型来源/告警类型/algo_id) -->
              <div v-else-if="it.kind === 'algo'" class="md-algo">
                <div class="md-item md-clickable" @click="toggleAlgo(it.id)">
                  <span class="md-item-main">
                    <span class="md-item-title">{{ it.name }}</span>
                    <span class="md-item-sub">{{ algoCategoryZh(it.category) }} · {{ it.version || '—' }}</span>
                  </span>
                  <span class="md-badge" :class="'alg-' + it.status">{{ text('metricDetail.algo.status' + cap(it.status)) }}</span>
                  <span class="md-badge" :class="it.available ? 'st-done' : 'st-off'">
                    {{ it.available ? t('metricDetail.algo.available') : t('metricDetail.algo.unavailable') }}
                  </span>
                </div>
                <div v-if="expandedAlgo === it.id" class="md-algo-detail">
                  <div v-if="it.description" class="md-kv">
                    <span class="md-k">{{ t('metricDetail.algo.description') }}</span>
                    <span class="md-v">{{ it.description }}</span>
                  </div>
                  <div class="md-kv">
                    <span class="md-k">{{ t('metricDetail.algo.accuracy') }}</span>
                    <span class="md-v">{{ it.accuracy ? it.accuracy.toFixed(2) : '—' }}</span>
                  </div>
                  <div class="md-kv">
                    <span class="md-k">{{ t('metricDetail.algo.fps') }}</span>
                    <span class="md-v">{{ it.fps || '—' }}</span>
                  </div>
                  <div class="md-kv">
                    <span class="md-k">{{ t('metricDetail.algo.modelSource') }}</span>
                    <span class="md-v">{{ modelSourceText(it.modelSource) }}</span>
                  </div>
                  <div class="md-kv">
                    <span class="md-k">{{ t('metricDetail.algo.alarmType') }}</span>
                    <span class="md-v">{{ it.alarmType || '—' }}</span>
                  </div>
                  <div class="md-kv">
                    <span class="md-k">{{ t('metricDetail.algo.algoId') }}</span>
                    <span class="md-v md-mono">{{ it.id }}</span>
                  </div>
                  <div class="md-algo-foot">
                    <el-link type="primary" :underline="false" @click="router.push('/algo-config')">
                      {{ t('metricDetail.algo.viewAlgoPage') }}
                    </el-link>
                  </div>
                </div>
              </div>

              <!-- Agent 行: 纯展示 (无详情页) -->
              <div v-else class="md-item">
                <span class="md-item-main">
                  <span class="md-item-title">{{ it.name }}</span>
                  <span class="md-item-sub">{{ t('metricDetail.comp.calls') }}: {{ it.calls }}</span>
                </span>
                <span class="md-badge st-done">{{ text('metricDetail.agentStatus.' + it.status) }}</span>
              </div>
            </template>
          </div>
          <div v-else class="md-empty">{{ state.itemsNote || t('metricDetail.empty.noItems') }}</div>
        </template>
      </section>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * MetricDetailDrawer — 态势大屏指标详情抽屉 (Task-99f, 计划 §3.2)
 *
 * 全局单例抽屉: 无 props, 读取 useMetricDetail 模块级状态渲染。
 * 三段式 (实时值 / 趋势 / 明细), 段级 loading/error/重试 互不阻塞。
 * totalAgents 专用: status 筛选 chips + 算法行内展开详情 + 前往算法查看。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { EChartsOption } from 'echarts'
import LazyChart from '@/components/LazyChart.vue'
import {
  useMetricDetail,
  alarmsDeepLink,
  deviceDeepLink,
  algoCategoryZh,
  type CompositionRow,
  type MetricItem,
} from '@/composables/useMetricDetail'

const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const router = useRouter()
const { state, openMetric, closeMetric, retrySection } = useMetricDetail()

/** 动态键 i18n 助手 (键为拼接形态, 走宽松转型) */
function text(key: string, named?: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (t as any)(key, named ?? {}) as string
}

/** el-drawer v-model 桥接 (关闭 → closeMetric 作废在途请求) */
const visible = computed({
  get: () => state.isOpen,
  set: (v: boolean) => {
    if (!v) closeMetric()
  },
})

const expandedAlgo = ref('')
const algoFilter = ref('')
watch(
  () => state.key,
  () => {
    expandedAlgo.value = ''
    algoFilter.value = ''
  },
)

const isAlgoMode = computed(() => state.key === 'totalAgents')

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function statusText(s: string): string {
  return s === 'unhandled' ? t('metricDetail.status.unhandled') : t('metricDetail.status.handled')
}

function modelSourceText(ms: string): string {
  if (ms === 'generic-coco80') return t('metricDetail.algo.modelSourceGeneric')
  if (ms === 'not-deployed') return t('metricDetail.algo.modelSourceNotDeployed')
  if (ms === 'dedicated') return t('metricDetail.algo.modelSourceDedicated')
  return ms || '—'
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  if (!Number.isFinite(d.getTime())) return '--'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function itemKey(it: MetricItem, i: number): string {
  if (it.kind === 'agent') return `agent-${it.name}-${i}`
  return `${it.kind}-${it.id}-${i}`
}

/** status 筛选 chips (全部/normal/degraded/stub/routed, 只展示存在的分组) */
const algoChips = computed(() => {
  const list = state.items.filter((i) => i.kind === 'algo')
  const chips: Array<{ value: string; label: string }> = [
    { value: '', label: `${t('metricDetail.algo.statusAll')} (${list.length})` },
  ]
  for (const st of ['normal', 'degraded', 'stub', 'routed'] as const) {
    const n = list.filter((i) => i.kind === 'algo' && i.status === st).length
    if (n > 0) chips.push({ value: st, label: `${text('metricDetail.algo.status' + cap(st))} (${n})` })
  }
  return chips
})

const displayItems = computed<MetricItem[]>(() => {
  if (!isAlgoMode.value || !algoFilter.value) return state.items
  return state.items.filter((i) => i.kind === 'algo' && i.status === algoFilter.value)
})

/** 趋势折线 option (暗色主题) */
const trendOption = computed<EChartsOption>(() => {
  const tr = state.trend
  if (!tr) return {}
  return {
    grid: { left: 44, right: 12, top: 14, bottom: 26 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: tr.labels,
      axisLabel: { fontSize: 10, color: '#7fb6d9' },
      axisLine: { lineStyle: { color: '#0079ab' } },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(0,121,171,0.25)' } },
      axisLabel: { fontSize: 10, color: '#7fb6d9' },
    },
    series: [
      {
        type: 'line',
        data: tr.values,
        smooth: true,
        symbolSize: 4,
        lineStyle: { color: '#00dffa', width: 2 },
        itemStyle: { color: '#00dffa' },
        areaStyle: { color: 'rgba(0,223,250,0.12)' },
      },
    ],
  }
})

function toggleAlgo(id: string): void {
  expandedAlgo.value = expandedAlgo.value === id ? '' : id
}

function onCompositionClick(row: CompositionRow): void {
  const a = row.action
  if (!a) return
  if (a.type === 'metric') openMetric(a.key, a.ctx)
  else if (a.type === 'route') router.push(a.to)
}

function onAlarmClick(it: MetricItem): void {
  if (it.kind !== 'alarm') return
  // 深链 ±5min 窗口 + 类型 + 级别 (status 为客户端口径, 不传防止漏查)
  router.push(alarmsDeepLink({ tsMs: it.tsMs, level: it.level, alarmType: it.alarmType }))
}

function onDeviceClick(it: MetricItem): void {
  if (it.kind !== 'device') return
  router.push(deviceDeepLink(it.id))
}
</script>

<!-- 非 scoped: el-drawer teleport 到 body, class 落在 overlay 根, 需全局选择器覆盖暗色主题 -->
<!-- [视觉对齐 2026-09-19] 标题背景/内容背景对齐首页态势大屏: 面板 #040C2B + 边框 #05357C + 内发光 #061E79,
     标题栏同 .panel-title 渐变 (90deg, #003076 → 透明) + #00B4FF 文字 -->
<style>
.metric-detail-drawer.el-drawer,
.metric-detail-drawer .el-drawer {
  background: #040c2b;
  box-shadow: inset 0 0 17px 0 #061e79;
}
.metric-detail-drawer .el-drawer__body {
  padding: 0;
  background: #040c2b;
}
.md-body {
  box-sizing: border-box;
  min-height: 100%;
  padding: 0 0 20px;
  background: #040c2b;
  color: #cfe9f7;
  font-size: 13px;
}
.md-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  line-height: 32px;
  padding: 0 10px;
  font-size: 14px;
  background: linear-gradient(90deg, #003076 0%, rgba(0, 48, 118, 0) 100%), #040c2b;
}
.md-title {
  font-size: 14px;
  font-weight: 600;
  color: #00b4ff;
}
.md-close {
  cursor: pointer;
  color: #7fb6d9;
  font-size: 14px;
  padding: 0 4px;
}
.md-close:hover {
  color: #00dffa;
}
.md-section {
  margin: 14px 16px 0;
  padding: 12px;
  border: 1px solid #05357c;
  border-radius: 8px;
  background: rgba(5, 53, 124, 0.18);
}
.md-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.md-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #00b4ff;
}
.md-section-unit {
  font-size: 11px;
  color: #7fb6d9;
}
.md-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 4px;
  color: #7fb6d9;
}
.md-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(0, 180, 255, 0.25);
  border-top-color: #00dffa;
  border-radius: 50%;
  animation: md-spin 0.8s linear infinite;
}
@keyframes md-spin {
  to { transform: rotate(360deg); }
}
.md-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 4px;
  color: #ff8f8f;
}
.md-empty {
  padding: 16px 4px;
  text-align: center;
  color: #6d9cba;
}
.md-note {
  margin-top: 6px;
  font-size: 11px;
  color: #7fb6d9;
}
.md-live {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 2px 2px 8px;
}
.md-live-value {
  font-size: 34px;
  font-weight: 700;
  color: #00dffa;
  line-height: 1;
}
.md-live-sub {
  font-size: 12px;
  color: #7fb6d9;
}
.md-comp-head {
  margin: 4px 0 6px;
  font-size: 11px;
  color: #6d9cba;
}
.md-comp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 5px;
}
.md-comp-row.clickable {
  cursor: pointer;
}
.md-comp-row.clickable:hover {
  background: rgba(0, 180, 255, 0.12);
}
.md-comp-label {
  flex: 1;
  color: #9fc9e2;
}
.md-comp-value {
  color: #00dffa;
  font-weight: 600;
}
.md-comp-arrow {
  color: #00b4ff;
}
.md-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.md-chip {
  padding: 2px 10px;
  border: 1px solid rgba(0, 121, 171, 0.7);
  border-radius: 10px;
  font-size: 11px;
  color: #9fc9e2;
  cursor: pointer;
}
.md-chip.active {
  border-color: #00dffa;
  color: #00dffa;
  background: rgba(0, 223, 250, 0.1);
}
.md-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.md-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  background: rgba(5, 53, 124, 0.32);
}
.md-item.md-clickable {
  cursor: pointer;
}
.md-item.md-clickable:hover {
  background: rgba(0, 180, 255, 0.16);
}
.md-item-time {
  font-size: 11px;
  color: #7fb6d9;
  flex-shrink: 0;
}
.md-item-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.md-item-title {
  color: #d8ecf8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.md-item-sub {
  font-size: 11px;
  color: #6d9cba;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.md-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 9px;
  font-size: 10px;
  border: 1px solid transparent;
}
.lv-critical { color: #ff6b6b; border-color: rgba(255, 107, 107, 0.6); }
.lv-high { color: #ffa94d; border-color: rgba(255, 169, 77, 0.6); }
.lv-medium { color: #ffe066; border-color: rgba(255, 224, 102, 0.55); }
.lv-low { color: #74c0fc; border-color: rgba(116, 192, 252, 0.55); }
.st-done { color: #63e6be; border-color: rgba(99, 230, 190, 0.55); }
.st-pending { color: #ff8787; border-color: rgba(255, 135, 135, 0.55); }
.st-off { color: #8a9db0; border-color: rgba(138, 157, 176, 0.55); }
.alg-normal { color: #63e6be; border-color: rgba(99, 230, 190, 0.55); }
.alg-degraded { color: #ffa94d; border-color: rgba(255, 169, 77, 0.55); }
.alg-stub { color: #ffe066; border-color: rgba(255, 224, 102, 0.5); }
.alg-routed { color: #74c0fc; border-color: rgba(116, 192, 252, 0.5); }
.md-algo-detail {
  margin: 4px 0 2px;
  padding: 8px 10px;
  border-left: 2px solid #0079ab;
  border-radius: 4px;
  background: rgba(5, 53, 124, 0.55);
}
.md-kv {
  display: flex;
  gap: 10px;
  padding: 3px 0;
  font-size: 12px;
}
.md-k {
  width: 72px;
  flex-shrink: 0;
  color: #6d9cba;
}
.md-v {
  flex: 1;
  color: #cfe9f7;
  word-break: break-all;
}
.md-mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
}
.md-algo-foot {
  margin-top: 6px;
  text-align: right;
}
</style>
