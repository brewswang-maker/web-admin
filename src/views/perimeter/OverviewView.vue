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
      <!-- ===== 指标卡 ===== -->
      <el-row :gutter="16" class="stat-row">
        <el-col :span="6">
          <el-card shadow="hover">
            <div class="stat-label">{{ t('perimeter.overview.todayAlarms') }}</div>
            <div class="stat-value">{{ stats.today }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover">
            <div class="stat-label">{{ t('perimeter.overview.unhandled') }}</div>
            <div class="stat-value stat-danger">{{ stats.unhandled }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover">
            <div class="stat-label">{{ t('perimeter.overview.packCount') }}</div>
            <div class="stat-value">{{ packs.length }}<span class="stat-unit">/ 4</span></div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover">
            <div class="stat-label">{{ t('perimeter.overview.ruleCount') }}</div>
            <div class="stat-value">{{ rules.length }}</div>
          </el-card>
        </el-col>
      </el-row>

      <!-- ===== 运营质量 (vp3: 《研究报告》§8 复核闭环运营口径, AI 复核代理指标) ===== -->
      <el-row :gutter="16" class="stat-row">
        <el-col :span="24">
          <el-card shadow="hover">
            <template #header>
              <div class="ops-head">
                <span>{{ t('perimeter.overview.opsQuality') }}</span>
                <span class="ops-note">{{ t('perimeter.overview.opsNote') }}</span>
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
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <!-- ===== 事件类型分布 (9 键, PERIMETER_EVENT_TYPES 顺序) ===== -->
        <el-col :span="14">
          <el-card shadow="hover" class="dist-card">
            <template #header>{{ t('perimeter.overview.typeDist') }}</template>
            <div v-if="typeDist.length === 0" class="dist-empty">
              <el-empty :description="t('perimeter.overview.noEvents')" :image-size="72" />
            </div>
            <div v-else class="dist-list">
              <div v-for="d in typeDist" :key="d.type" class="dist-item">
                <span class="dist-name mono">{{ d.type }}</span>
                <el-progress :percentage="d.pct" :stroke-width="10" class="dist-bar"
                             :format="() => String(d.count)" />
              </div>
            </div>
          </el-card>
        </el-col>

        <!-- ===== 场景包布防状态 (4 包) ===== -->
        <el-col :span="10">
          <el-card shadow="hover" class="dist-card">
            <template #header>
              <div class="packs-card-head">
                <span>{{ t('perimeter.overview.packsStatus') }}</span>
                <el-button size="small" text type="primary" @click="$router.push('/video-perimeter/packs')">
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
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 视频周界 — 总览态势 (vp 轮 2026-08-31, 方案 docs/plans/video-perimeter-solution-v1.0.md §6)
 * 今日告警/未处理指标 + 8 事件键分布 + 4 包布防状态 (按已布防规则 rule source/关联包判定)。
 * 数据源: /alarms + /large-event/scene-packs + /linkage/rules?tag=video_perimeter。
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, Watch, Guide, Warning, UserFilled } from '@element-plus/icons-vue'
import type { Component } from 'vue'
import {
  videoPerimeterApi, pickPerimeterPacks, isPerimeterEvent, PERIMETER_EVENT_TYPES,
} from '@/api/videoPerimeter'
import type { AlarmEvent } from '@/types/alarm'
import type { ScenePack } from '@/types/largeEvent'

const { t } = useI18n()

interface RuleLite { rule_id?: string; scene_pack_id?: string; source_pack?: string; tags?: string[] }

const alarms = ref<AlarmEvent[]>([])
const packs = ref<ScenePack[]>([])
const rules = ref<RuleLite[]>([])
const loading = ref(false)
const loadError = ref('')

const stats = computed(() => {
  const todayPrefix = new Date().toISOString().slice(0, 10)
  const today = alarms.value.filter(a => (a.createdAt ?? '').startsWith(todayPrefix))
  return {
    today: today.length,
    unhandled: alarms.value.filter(a => a.status === 'unhandled').length,
  }
})

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

/** 9 事件键分布 (仅统计既有告警; pct 相对最大计数) */
const typeDist = computed(() => {
  const counts = new Map<string, number>()
  for (const e of alarms.value) {
    if (isPerimeterEvent(e?.type)) counts.set(String(e.type), (counts.get(String(e.type)) ?? 0) + 1)
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const max = entries.length > 0 ? entries[0][1] : 1
  return entries.map(([type, count]) => ({ type, count, pct: Math.round((count / max) * 100) }))
})

/** 已布防包判定: 规则字段防御式探测 (scene_pack_id / source_pack / tags) */
const deployedPackIds = computed(() => {
  const ids = new Set<string>()
  for (const r of rules.value) {
    const pid = r.scene_pack_id ?? r.source_pack
      ?? (r.tags ?? []).find(tg => String(tg).startsWith('video_perimeter_'))
    if (pid) ids.add(String(pid).replace(/^video_perimeter_/, ''))
  }
  return ids
})

function packIcon(id: string): Component {
  if (id.includes('gate')) return Guide
  if (id.includes('forbidden')) return Warning
  if (id.includes('crowd')) return UserFilled
  return Watch
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
    alarms.value = (Array.isArray(ad?.items) ? ad.items : []).filter(e => isPerimeterEvent(e?.type))
    packs.value = pickPerimeterPacks(packRes.data)
    const rd = (ruleRes.data as { data?: { items?: RuleLite[] } })?.data
    rules.value = Array.isArray(rd?.items) ? rd.items : []
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(reload)
</script>

<style scoped>
.vp-overview-page { padding: 16px 20px; }
.ov-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.ov-title { margin: 0 0 4px; font-size: 20px; }
.ov-sub { color: var(--el-text-color-secondary); font-size: 13px; }
.stat-row { margin-bottom: 16px; }
.stat-label { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.stat-value { font-size: 28px; font-weight: 600; line-height: 1; }
.stat-unit { font-size: 14px; color: var(--el-text-color-secondary); font-weight: 400; }
.stat-danger { color: var(--el-color-danger); }
.dist-card { min-height: 320px; }
.packs-card-head { display: flex; justify-content: space-between; align-items: center; }
.dist-list { display: flex; flex-direction: column; gap: 12px; padding: 6px 0; }
.dist-item { display: flex; align-items: center; gap: 12px; }
.dist-name { width: 130px; flex-shrink: 0; font-size: 12px; text-align: right; }
.dist-bar { flex: 1; }
.dist-empty { display: flex; justify-content: center; align-items: center; min-height: 240px; }
.pack-status-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.pack-status-item:last-child { border-bottom: none; }
.pack-status-icon { color: var(--el-color-primary); flex-shrink: 0; }
.pack-status-main { flex: 1; min-width: 0; }
.pack-status-name { font-size: 14px; }
.pack-status-id { font-size: 12px; color: var(--el-text-color-secondary); }
.mono { font-family: Menlo, Consolas, monospace; }
.ops-head { display: flex; justify-content: space-between; align-items: center; }
.ops-note { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 400; }
.ops-row { display: flex; gap: 48px; padding: 4px 0; }
.ops-item { min-width: 140px; }
.ops-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
</style>
