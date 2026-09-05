<template>
  <div class="vp-overview-page">
    <!-- ===== 页头 ===== -->
    <div class="ov-header">
      <div>
        <h2 class="ov-title">{{ t('perimeter.overview.title') }}</h2>
        <div class="ov-sub">{{ t('perimeter.overview.subtitle') }}</div>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">{{ t('common.refresh') }}</el-button>
    </div>

    <!-- ===== 错误态 ===== -->
    <el-result v-if="loadError" icon="warning" :title="t('perimeter.overview.loadFailed')" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">{{ t('common.retry') }}</el-button>
      </template>
    </el-result>

    <template v-else>
      <!-- ===== 骨架屏 ===== -->
      <template v-if="loading && firstLoad">
        <el-row :gutter="16" class="stat-row">
          <el-col :span="6" v-for="i in 4" :key="i"><el-card shadow="never"><el-skeleton :rows="2" animated /></el-card></el-col>
        </el-row>
        <el-card shadow="never"><el-skeleton :rows="6" animated /></el-card>
      </template>

      <template v-else>
        <!-- ===== KPI 指标卡 (对齐效果图: 数字+图标+色块+跳转+副文本; 处理率环形) ===== -->
        <el-row :gutter="16" class="stat-row">
          <el-col :xs="12" :sm="6">
            <el-card shadow="hover" class="kpi-card" @click="go('/video-perimeter/events')">
              <div class="kpi-body">
                <div class="kpi-icon" style="background: var(--el-color-primary-light-9); color: var(--el-color-primary)">
                  <el-icon :size="22"><Bell /></el-icon>
                </div>
                <div class="kpi-main">
                  <div class="kpi-value">{{ stats.today }}</div>
                  <div class="kpi-label">{{ t('perimeter.overview.todayAlarms') }}</div>
                </div>
              </div>
              <div class="kpi-sub">{{ t('perimeter.kpi.totalLoaded', `已加载 ${alarms.length} 条告警`) }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card shadow="hover" class="kpi-card" :class="{ 'kpi-alert': stats.unhandled > 0 }" @click="go('/video-perimeter/events')">
              <div class="kpi-body">
                <div class="kpi-icon" style="background: var(--el-color-danger-light-9); color: var(--el-color-danger)">
                  <el-icon :size="22"><Warning /></el-icon>
                </div>
                <div class="kpi-main">
                  <div class="kpi-value kpi-danger">{{ stats.unhandled }}</div>
                  <div class="kpi-label">{{ t('perimeter.overview.unhandled') }}</div>
                </div>
              </div>
              <div class="kpi-sub">{{ t('perimeter.kpi.falseLoaded', `人工确认误报 ${ops.humanFalse} 条`) }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card shadow="hover" class="kpi-card">
              <div class="kpi-body">
                <!-- 处理率环形 (CSS conic-gradient, 对齐效果图「处警统计」语义) -->
                <div class="ring" :style="ringStyle" role="img" :aria-label="`${t('perimeter.kpi.handledRate', '处理率')} ${handleRatePct}%`">
                  <div class="ring-inner">
                    <span class="ring-num">{{ handleRatePct }}<span class="ring-pct">%</span></span>
                  </div>
                </div>
                <div class="kpi-main">
                  <div class="kpi-label">{{ t('perimeter.kpi.handledRate', '处理率') }}</div>
                  <div class="kpi-sub kpi-sub-inline">{{ t('perimeter.kpi.handledN', `已处置 ${alarms.length - stats.unhandled} 条`) }}</div>
                </div>
              </div>
              <div class="kpi-sub">{{ t('perimeter.kpi.handledHint', '非未处理占比 · 误报亦属已处置') }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card shadow="hover" class="kpi-card" @click="go('/video-perimeter/rules')">
              <div class="kpi-body">
                <div class="kpi-icon" style="background: var(--el-color-success-light-9); color: var(--el-color-success)">
                  <el-icon :size="22"><List /></el-icon>
                </div>
                <div class="kpi-main">
                  <div class="kpi-value">
                    {{ enabledRuleCount }}<span class="kpi-unit">/ {{ rules.length }}</span>
                  </div>
                  <div class="kpi-label">{{ t('perimeter.kpi.enabledRules', '布防规则') }}</div>
                </div>
              </div>
              <div class="kpi-sub">{{ t('perimeter.kpi.packsReady', `场景包就绪 ${deployedPackIds.size}/${packs.length}`) }}</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- ===== 近 7 日告警趋势 + 通道统计 (对齐效果图「AI告警统计柱状图 / 设备统计」) ===== -->
        <el-row :gutter="16" class="stat-row">
          <el-col :xs="24" :sm="16">
            <el-card shadow="hover" class="trend-card">
              <template #header>
                <div class="card-head">
                  <span>{{ t('perimeter.kpi.trendTitle', '近 7 日告警趋势') }}</span>
                  <span class="card-hint">{{ t('perimeter.kpi.trendHint', '按日统计') }}</span>
                </div>
              </template>
              <LazyChart v-if="trendOption" :option="trendOption" height="220px" />
              <el-empty v-else :description="t('perimeter.overview.noEvents')" :image-size="64" />
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="8">
            <el-card shadow="hover" class="dev-card">
              <template #header>
                <div class="card-head">
                  <span>{{ t('perimeter.kpi.channelTitle', '通道统计') }}</span>
                  <el-button size="small" text type="primary" @click="go('/algo-config')">
                    {{ t('perimeter.kpi.gotoAlgo', '去配置') }}
                  </el-button>
                </div>
              </template>
              <div class="dev-grid">
                <div class="dev-item">
                  <div class="dev-num">{{ chStat.total }}</div>
                  <div class="dev-label">{{ t('perimeter.kpi.chTotal', '接入通道') }}</div>
                </div>
                <div class="dev-item">
                  <div class="dev-num dev-ok">{{ chStat.online }}</div>
                  <div class="dev-label">{{ t('perimeter.kpi.chOnline', '在线') }}</div>
                </div>
                <div class="dev-item">
                  <div class="dev-num" :class="{ 'kpi-danger': chStat.offline > 0 }">{{ chStat.offline }}</div>
                  <div class="dev-label">{{ t('perimeter.kpi.chOffline', '离线') }}</div>
                </div>
                <div class="dev-item">
                  <div class="dev-num">{{ chStat.algoOn }}</div>
                  <div class="dev-label">{{ t('perimeter.kpi.chAlgoOn', '算法启用') }}</div>
                </div>
              </div>
              <div class="dev-rate">
                <span class="dev-rate-label">{{ t('perimeter.kpi.onlineRate', '通道在线率') }}</span>
                <el-progress :percentage="chStat.onlinePct" :stroke-width="10"
                  :status="chStat.onlinePct >= 90 ? 'success' : chStat.onlinePct >= 60 ? undefined : 'exception'" />
              </div>
              <div v-if="!chStatLoaded" class="dev-fallback">{{ t('perimeter.kpi.chFallback', '通道统计暂不可用 (接口未就绪)') }}</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- ===== 最新预警抓拍 + 场景包布防状态 (对齐效果图「AI预警抓拍」) ===== -->
        <el-row :gutter="16" class="stat-row">
          <el-col :xs="24" :sm="14">
            <el-card shadow="hover" class="snap-card">
              <template #header>
                <div class="card-head">
                  <span>{{ t('perimeter.kpi.snapTitle', '最新预警抓拍') }}</span>
                  <el-button size="small" text type="primary" @click="go('/video-perimeter/events')">
                    {{ t('perimeter.kpi.snapMore', '更多') }}
                  </el-button>
                </div>
              </template>
              <el-empty v-if="latestSnaps.length === 0"
                :description="t('perimeter.kpi.snapEmpty', '暂无带抓拍的预警')" :image-size="64" />
              <div v-else class="snap-grid">
                <div v-for="a in latestSnaps" :key="a.id" class="snap-item" @click="openAlarmPopup(a)"
                  :title="t('perimeter.kpi.snapOpen', '点击查看大图')">
                  <div class="snap-img-wrap">
                    <img v-if="!snapBroken[a.id]" :src="a.snapshotUrl" loading="lazy" class="snap-img"
                      @error="snapBroken[a.id] = true" />
                    <div v-else class="snap-broken"><el-icon :size="20"><Picture /></el-icon></div>
                  </div>
                  <div class="snap-meta">
                    <el-tag size="small" type="danger" effect="dark" class="snap-type">{{ zh(a.type) }}</el-tag>
                    <span class="snap-dev" :title="a.channelName || a.channelId">{{ a.channelName || a.channelId }}</span>
                    <span class="snap-time">{{ fmtTime(a.createdAt) }}</span>
                  </div>
                </div>
              </div>
            </el-card>
          </el-col>

          <!-- ===== 场景包布防状态 (4 包) ===== -->
          <el-col :xs="24" :sm="10">
            <el-card shadow="hover" class="dist-card">
              <template #header>
                <div class="card-head">
                  <span>{{ t('perimeter.overview.packsStatus') }}</span>
                  <el-button size="small" text type="primary" @click="go('/video-perimeter/packs')">
                    {{ t('perimeter.overview.gotoPacks') }}
                  </el-button>
                </div>
              </template>
              <div v-for="p in packs" :key="p.scene_pack_id" class="pack-status-item">
                <el-icon :size="16" class="pack-status-icon"><component :is="packIcon(p.scene_pack_id)" /></el-icon>
                <div class="pack-status-main">
                  <div class="pack-status-name">{{ p.display_name }}</div>
                  <div class="pack-status-id mono">{{ p.scene_pack_id }}</div>
                </div>
                <el-tag :type="deployedPackIds.has(p.scene_pack_id) ? 'success' : 'info'" size="small">
                  {{ deployedPackIds.has(p.scene_pack_id)
                    ? t('perimeter.overview.deployed') : t('perimeter.overview.notDeployed') }}
                </el-tag>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <!-- ===== 事件类型分布 (19 键 vp5, 中文名对齐效果图; tooltip 保留裸 key) ===== -->
          <el-col :xs="24" :sm="14">
            <el-card shadow="hover" class="dist-card">
              <template #header>{{ t('perimeter.overview.typeDist') }}</template>
              <div v-if="typeDist.length === 0" class="dist-empty">
                <el-empty :description="t('perimeter.overview.noEvents')" :image-size="72" />
              </div>
              <div v-else class="dist-list">
                <div v-for="d in typeDist" :key="d.type" class="dist-item">
                  <span class="dist-name" :title="d.type">{{ zh(d.type) }}</span>
                  <el-progress :percentage="d.pct" :stroke-width="10" class="dist-bar"
                               :format="() => String(d.count)" />
                </div>
              </div>
            </el-card>
          </el-col>

          <!-- ===== 运营质量 + 多模态融合 (vp3/vp6 既有能力, 合并紧凑展示) ===== -->
          <el-col :xs="24" :sm="10">
            <el-card shadow="hover" class="dist-card">
              <template #header>
                <div class="card-head">
                  <span>{{ t('perimeter.overview.opsQuality') }}</span>
                  <span class="card-hint">{{ t('perimeter.overview.opsNote') }}</span>
                </div>
              </template>
              <div class="ops-row">
                <div class="ops-item">
                  <div class="stat-label">{{ t('perimeter.overview.aiReviewCoverage') }}</div>
                  <div class="stat-value">{{ ops.aiCoveragePct }}<span class="stat-unit">%</span></div>
                  <div class="ops-sub">{{ ops.reviewed }} / {{ ops.total }}</div>
                </div>
                <div class="ops-item">
                  <div class="stat-label">{{ t('perimeter.overview.aiFalseRatio') }}</div>
                  <div class="stat-value">{{ ops.aiFalsePct }}<span class="stat-unit">%</span></div>
                  <div class="ops-sub">{{ ops.aiFalse }} / {{ ops.reviewed }}</div>
                </div>
                <div class="ops-item">
                  <div class="stat-label">{{ t('perimeter.overview.humanFalseConfirmed') }}</div>
                  <div class="stat-value">{{ ops.humanFalse }}</div>
                  <div class="ops-sub">&nbsp;</div>
                </div>
              </div>
              <el-divider class="ops-divider" />
              <div class="card-head ops-fusion-head">
                <span>{{ t('perimeter.overview.fusionCard') }}</span>
                <span class="card-hint">{{ fusion.initialized ? t('perimeter.kpi.fusionOn', '融合引擎运行中') : t('perimeter.kpi.fusionOff', '融合引擎未启用') }}</span>
              </div>
              <div class="ops-row">
                <div class="ops-item">
                  <div class="stat-label">{{ t('perimeter.overview.fusionTotal') }}</div>
                  <div class="stat-value-sm">{{ fusion.total_fusions }}</div>
                </div>
                <div class="ops-item">
                  <div class="stat-label">{{ t('perimeter.overview.fusionAlerts') }}</div>
                  <div class="stat-value-sm">{{ fusion.alerts_generated }}</div>
                </div>
                <div class="ops-item">
                  <div class="stat-label">{{ t('perimeter.overview.fusionCross') }}</div>
                  <div class="stat-value-sm">{{ fusion.cross_validated_alerts }}</div>
                </div>
                <div class="ops-item">
                  <div class="stat-label">{{ t('perimeter.overview.fusionLatency') }}</div>
                  <div class="stat-value-sm">{{ fusion.avg_fusion_latency_ms.toFixed(1) }}<span class="stat-unit">ms</span></div>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 视频周界 — 总览态势 (vp 轮 2026-08-31, 方案 docs/plans/video-perimeter-solution-v1.0.md §6)
 * 今日告警/未处理指标 + 8 事件键分布 + 4 包布防状态 (按已布防规则 rule source/关联包判定)。
 * 数据源: /alarms + /large-event/scene-packs + /linkage/rules?tag=video_perimeter。
 *
 * [UX 改版 2026-09-02 对齐《一体化平台-周界算法首页》效果图]
 *  - KPI 卡升级: 图标/色块/环形处理率/整卡可点跳转/副文本 (替代纯数字卡)
 *  - +近 7 日告警趋势 (LazyChart bar, 对齐效果图「AI告警统计」柱状图)
 *  - +通道统计卡 (接入/在线/离线/算法启用 + 在线率, 对齐效果图「设备统计」;
 *    数据源 /channels + /inference/channels, 失败静默降级)
 *  - +最新预警抓拍 (最近 4 条含快照事件, 点击复用全局报警弹窗, 对齐效果图「AI预警抓拍」)
 *  - 事件类型分布中文化 (SSOT /event-types/canonical, useEventTypeZh 共享缓存;
 *    hover tooltip 保留裸 key 便于检索)
 *  - 运营质量 + 融合引擎合并为一张卡 (既有 vp3/vp6 能力保留, 布局紧凑)
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Refresh, Watch, Guide, Warning, UserFilled, Bell, List, Picture } from '@element-plus/icons-vue'
import type { Component } from 'vue'
import dayjs from 'dayjs'
import {
  videoPerimeterApi, pickPerimeterPacks, isPerimeterEvent, PERIMETER_EVENT_TYPES,
  type FusionStatus,
} from '@/api/videoPerimeter'
import { normalizeAlarmCore, type AlarmEvent } from '@/types/alarm'
import type { ScenePack } from '@/types/largeEvent'
import { channelApi } from '@/api/channel'
import { getInferenceChannels } from '@/api/inference'
import type { EChartsOption } from 'echarts'
import LazyChart from '@/components/LazyChart.vue'
import { useEventTypeZh } from '@/composables/useEventTypeZh'
import { useAlarmRowActions } from '@/composables/useAlarmRowActions'

const { t } = useI18n()
const router = useRouter()
const { openAlarmPopup } = useAlarmRowActions()
const { zh, ensure: ensureEventTypes } = useEventTypeZh()

interface RuleLite { rule_id?: string; scene_pack_id?: string; source_pack?: string; tags?: string[]; enabled?: boolean }

const alarms = ref<AlarmEvent[]>([])
const packs = ref<ScenePack[]>([])
const rules = ref<RuleLite[]>([])
const loading = ref(false)
const firstLoad = ref(true)
const loadError = ref('')

/** [vp6 P1-1] 多模态融合引擎状态 (拉取失败静默降级为零值, 不阻塞总览主指标) */
const fusion = ref<FusionStatus>({
  initialized: false,
  strategy: 'adaptive',
  total_fusions: 0,
  alerts_generated: 0,
  false_positives_filtered: 0,
  cross_validated_alerts: 0,
  avg_fusion_latency_ms: 0,
  video_reduction_pct: 0,
  weights: {},
})

// ── [UX 2026-09-02] 通道统计 (对齐效果图「设备统计」; 失败静默降级为展示占位) ──
const chStat = reactive({ total: 0, online: 0, offline: 0, algoOn: 0, onlinePct: 0 })
const chStatLoaded = ref(false)

async function loadChannelStat() {
  try {
    const [chRes, inferRes] = await Promise.allSettled([
      channelApi.getList({ pageSize: 500 }),
      getInferenceChannels(),
    ])
    // 通道列表解析 (防御式, 同 AlgoConfigView loadData 口径)
    let items: any[] = []
    if (chRes.status === 'fulfilled') {
      const raw = chRes.value?.data as any
      items = raw?.data?.items ?? raw?.data ?? raw?.items ?? []
    }
    // 算法启用通道数 (调度 enabled)
    let algoOn = 0
    if (inferRes.status === 'fulfilled') {
      const raw = inferRes.value?.data as any
      const list: any[] = raw?.data?.channels ?? raw?.channels ?? []
      algoOn = list.filter((c) => c.enabled).length
    }
    // 调度有数据而通道接口为空 → 用调度数据兜底计数 (对齐 AlgoConfigView 补充逻辑)
    const total = items.length
    const online = items.filter((c) => c.online !== false).length
    chStat.total = total > 0 ? total : algoOn
    chStat.online = total > 0 ? online : algoOn
    chStat.offline = Math.max(0, chStat.total - chStat.online)
    chStat.algoOn = algoOn
    chStat.onlinePct = chStat.total > 0 ? Math.round((chStat.online / chStat.total) * 100) : 0
    chStatLoaded.value = chStat.total > 0 || algoOn > 0
  } catch { /* 静默: 通道统计为增强信息 */ }
}

const stats = computed(() => {
  const todayPrefix = dayjs().format('YYYY-MM-DD')
  const today = alarms.value.filter(a => (a.createdAt ?? '').startsWith(todayPrefix))
  return {
    today: today.length,
    unhandled: alarms.value.filter(a => a.status === 'unhandled').length,
  }
})

/** 处理率 (非未处理占比; 误报亦属已处置 — 对齐效果图「处警统计」语义) */
const handleRatePct = computed(() => {
  const total = alarms.value.length
  if (total <= 0) return 0
  return Math.round(((total - stats.value.unhandled) / total) * 100)
})

/** 处理率环形样式 (CSS conic-gradient 双色环) */
const ringStyle = computed(() => ({
  background: `conic-gradient(var(--el-color-success) ${handleRatePct.value}%, var(--el-fill-color-darker) 0)`,
}))

/** 启用中规则数 */
const enabledRuleCount = computed(() => rules.value.filter(r => r.enabled !== false).length)

/** [UX 2026-09-02] 近 7 日告警趋势 (按日分桶; 无数据显示空态) */
const trendOption = computed<EChartsOption | null>(() => {
  if (alarms.value.length === 0) return null
  const days: string[] = []
  const counts: number[] = []
  for (let i = 6; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day')
    const key = d.format('YYYY-MM-DD')
    days.push(d.format('MM-DD'))
    counts.push(alarms.value.filter(a => (a.createdAt ?? '').startsWith(key)).length)
  }
  return {
    grid: { left: 8, right: 12, top: 28, bottom: 0, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: days, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: counts,
      barMaxWidth: 26,
      itemStyle: { color: '#409EFF', borderRadius: [3, 3, 0, 0] },
    }],
  }
})

/** [UX 2026-09-02] 最新预警抓拍 (最近 4 条含快照; 点击打开全局报警弹窗) */
const latestSnaps = computed(() =>
  alarms.value.filter(a => !!a.snapshotUrl).slice(0, 4))
const snapBroken = reactive<Record<string, boolean>>({})

/** [vp3] 运营质量代理指标 (AI 复核口径——《研究报告》§8 复核闭环/误报密度;
 *  真值库误报密度测量属 Roadmap R6, 此处为运营可视化代理口径) */
const ops = computed(() => {
  const total = alarms.value.length
  const reviewed = alarms.value.filter(e => !!(e.aiConclusion ?? '').trim()).length
  const aiFalse = alarms.value.filter(e => {
    const c = (e.aiConclusion || '').toLowerCase()
    return !!c && (c.includes('false_alarm') || c.includes('误报'))
  }).length
  const humanFalse = alarms.value.filter(e => e.status === 'false_alarm').length
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
  return {
    total,
    reviewed,
    aiFalse,
    humanFalse,
    aiCoveragePct: pct(reviewed, total),
    aiFalsePct: pct(aiFalse, reviewed),
  }
})

/** 19 事件键分布 (仅统计既有告警; pct 相对最大计数; 中文展示 key 兜底) */
const typeDist = computed(() => {
  const counts = new Map<string, number>()
  for (const e of alarms.value) {
    if (isPerimeterEvent(e?.type)) counts.set(String(e.type), (counts.get(String(e.type)) ?? 0) + 1)
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const max = entries.length > 0 ? entries[0][1] : 1
  return entries.map(([type, count]) => ({ type, count, pct: Math.round((count / max) * 100) }))
})

/** 已布防包判定: 规则字段防御式探测 (scene_pack_id / source_pack / tags)
 *  [修复 2026-09-01] 保留完整 pack id — 原 replace 剩前缀得 'wall_v1' 与
 *  模板比较用的完整 'video_perimeter_wall_v1' 永不匹配 → 全部误显示未布防 */
const deployedPackIds = computed(() => {
  const ids = new Set<string>()
  for (const r of rules.value) {
    const pid = r.scene_pack_id ?? r.source_pack
      ?? (r.tags ?? []).find(tg => String(tg).startsWith('video_perimeter_'))
    if (pid) ids.add(String(pid))
  }
  return ids
})

function packIcon(id: string): Component {
  if (id.includes('gate')) return Guide
  if (id.includes('forbidden')) return Warning
  if (id.includes('crowd')) return UserFilled
  return Watch
}

function fmtTime(s: string | undefined): string {
  if (!s) return '—'
  // [FIX 2026-09-05 时区] 原字符串截断 slice(5,16) 直显 UTC 数值 (差 8 小时);
  //   改为 Date 解析后按本地时区 (北京时间) 拼短格式 MM-DD HH:mm, 保持原列宽风格
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function go(path: string) {
  router.push(path)
}

async function reload() {
  loading.value = true
  loadError.value = ''
  try {
    const [alarmRes, packRes, ruleRes] = await Promise.all([
      videoPerimeterApi.listAlarms(),
      videoPerimeterApi.listScenePacks(),
      videoPerimeterApi.listRules(),
    ])
    const ad = (alarmRes.data as { data?: { items?: AlarmEvent[] } })?.data
    // [normalize 修复 2026-09-01] 原始响应字段是 alarm_type (无 type/createdAt/status),
    //   直接过滤/统计全落空 → 今日事件 0/分布空; 统一走 normalizeAlarmCore (SSOT)
    alarms.value = (Array.isArray(ad?.items) ? ad.items : [])
      .map(e => normalizeAlarmCore(e)).filter(e => isPerimeterEvent(e?.type))
    packs.value = pickPerimeterPacks(packRes.data)
    const rd = (ruleRes.data as { data?: { items?: RuleLite[] } })?.data
    rules.value = Array.isArray(rd?.items) ? rd.items : []
    // [vp6 P1-1] 融合状态独立拉取 (失败静默, 老固件无此端点时零值展示)
    try {
      const fs = await videoPerimeterApi.getFusionStatus()
      const fd = (fs.data as { data?: FusionStatus })?.data
      if (fd) fusion.value = fd
    } catch { /* 老固件降级 */ }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    firstLoad.value = false
  }
  // 通道统计为增强信息, 独立拉取不阻塞主指标
  loadChannelStat()
}

onMounted(() => {
  reload()
  ensureEventTypes() // 事件类型中文名预热 (非阻塞)
})
</script>

<style scoped>
.vp-overview-page { padding: 16px 20px; }
.ov-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.ov-title { margin: 0 0 4px; font-size: 20px; }
.ov-sub { color: var(--el-text-color-secondary); font-size: 13px; }
.stat-row { margin-bottom: 16px; }
.mono { font-family: Menlo, Consolas, monospace; }

/* ── KPI 卡 (图标+数字+跳转; hover 反馈) ── */
.kpi-card { cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; }
.kpi-card:hover { transform: translateY(-2px); box-shadow: var(--el-box-shadow-light); }
.kpi-card.kpi-alert { border-color: var(--el-color-danger-light-5); }
.kpi-body { display: flex; align-items: center; gap: 14px; }
.kpi-icon { width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-main { min-width: 0; }
.kpi-value { font-size: 28px; font-weight: 600; line-height: 1.1; font-family: var(--font-number); }
.kpi-unit { font-size: 13px; color: var(--el-text-color-secondary); font-weight: 400; margin-left: 2px; }
.kpi-danger { color: var(--el-color-danger); }
.kpi-label { font-size: 13px; color: var(--el-text-color-secondary); margin-top: 2px; }
.kpi-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--el-border-color-lighter); }
.kpi-sub-inline { margin-top: 2px; padding: 0; border: none; }
/* 处理率环形 */
.ring { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ring-inner { width: 40px; height: 40px; border-radius: 50%; background: var(--el-bg-color); display: flex; align-items: center; justify-content: center; }
.ring-num { font-size: 13px; font-weight: 600; color: var(--el-color-success); font-family: var(--font-number); }
.ring-pct { font-size: 9px; }

/* ── 卡片头部通用 ── */
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.card-hint { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 400; }

/* ── 通道统计 ── */
.dev-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
.dev-item { text-align: center; padding: 8px 0; background: var(--el-fill-color-light); border-radius: 6px; }
.dev-num { font-size: 20px; font-weight: 600; font-family: var(--font-number); }
.dev-num.dev-ok { color: var(--el-color-success); }
.dev-label { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.dev-rate { display: flex; align-items: center; gap: 10px; }
.dev-rate-label { font-size: 12px; color: var(--el-text-color-secondary); flex-shrink: 0; }
.dev-rate :deep(.el-progress) { flex: 1; }
.dev-fallback { font-size: 12px; color: var(--el-text-color-disabled); margin-top: 8px; }

/* ── 最新预警抓拍 ── */
.snap-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.snap-item { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; cursor: pointer;
             transition: box-shadow 0.15s ease, border-color 0.15s ease; }
.snap-item:hover { border-color: var(--el-color-primary-light-5); box-shadow: var(--el-box-shadow-light); }
.snap-img-wrap { height: 118px; background: var(--el-fill-color-light); display: flex; align-items: center; justify-content: center; }
.snap-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.snap-broken { color: var(--el-text-color-disabled); }
.snap-meta { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.snap-type { flex-shrink: 0; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snap-dev { flex: 1; min-width: 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snap-time { flex-shrink: 0; font-size: 11px; color: var(--el-text-color-secondary); font-family: var(--font-number); }

/* ── 事件类型分布 ── */
.dist-card { min-height: 320px; }
.dist-list { display: flex; flex-direction: column; gap: 12px; padding: 6px 0; }
.dist-item { display: flex; align-items: center; gap: 12px; }
.dist-name { width: 130px; flex-shrink: 0; font-size: 12px; text-align: right;
             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dist-bar { flex: 1; }
.dist-empty { display: flex; justify-content: center; align-items: center; min-height: 240px; }

/* ── 场景包布防 ── */
.pack-status-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.pack-status-item:last-child { border-bottom: none; }
.pack-status-icon { color: var(--el-color-primary); flex-shrink: 0; }
.pack-status-main { flex: 1; min-width: 0; }
.pack-status-name { font-size: 14px; }
.pack-status-id { font-size: 12px; color: var(--el-text-color-secondary); }

/* ── 运营质量 + 融合 (合并紧凑) ── */
.ops-row { display: flex; gap: 32px; padding: 4px 0; flex-wrap: wrap; }
.ops-item { min-width: 110px; }
.ops-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.ops-divider { margin: 12px 0; }
.ops-fusion-head { margin-bottom: 4px; }
.stat-label { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.stat-value { font-size: 28px; font-weight: 600; line-height: 1; }
.stat-value-sm { font-size: 20px; font-weight: 600; line-height: 1.2; font-family: var(--font-number); }
.stat-unit { font-size: 14px; color: var(--el-text-color-secondary); font-weight: 400; }

/* ── 窄屏 (≥1280px 为主目标, 兼顾平板/窄屏) ── */
@media (max-width: 1360px) {
  .ops-row { gap: 20px; }
  .snap-img-wrap { height: 100px; }
}
@media (max-width: 768px) {
  .snap-grid { grid-template-columns: 1fr; }
  .dev-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
