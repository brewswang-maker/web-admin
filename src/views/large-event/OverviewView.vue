<template>
  <div class="le-overview-page">
    <!-- ===== 统计卡 (4 KPI) ===== -->
    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" v-for="s in statCards" :key="s.label">
        <el-card shadow="hover" class="stat-card" :body-style="{ padding: '16px 20px' }">
          <div class="stat-content">
            <div class="stat-icon" :style="{ background: s.color }">
              <el-icon :size="20"><component :is="s.icon" /></el-icon>
            </div>
            <div class="stat-body">
              <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
          <div class="stat-sub">{{ s.sub }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- ===== 三圈布防状态 ===== -->
      <el-col :span="10">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-header">
              <span>三圈布防状态</span>
              <el-tag size="small" type="info">场景标签覆盖</el-tag>
            </div>
          </template>
          <div class="circle-list">
            <div v-for="c in circleStats" :key="c.tag" class="circle-item">
              <div class="circle-dot" :class="c.css" />
              <div class="circle-info">
                <div class="circle-name">{{ c.label }}
                  <span class="circle-tag">{{ c.tag }}</span>
                </div>
                <div class="circle-desc">{{ c.desc }}</div>
              </div>
              <div class="circle-count">
                <span class="num">{{ c.events }}</span>
                <span class="unit">事件</span>
              </div>
            </div>
          </div>
          <el-divider style="margin: 12px 0" />
          <div class="circle-footer">
            <span>四场景 SSOT 覆盖: <strong>{{ ssotCoverage }}</strong> 事件类型</span>
            <el-tag v-if="ssotError" size="small" type="warning">SSOT 查询失败</el-tag>
          </div>
        </el-card>
      </el-col>

      <!-- ===== 最近大型活动事件 ===== -->
      <el-col :span="14">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-header">
              <span>最近事件</span>
              <el-button size="small" text type="primary" @click="router.push('/large-event/events')">
                查看全部 →
              </el-button>
            </div>
          </template>
          <el-table :data="recentEvents" v-loading="eventsLoading" size="small"
                    :empty-text="'暂无大型活动相关事件'">
            <el-table-column prop="type" label="类型" min-width="150">
              <template #default="{ row }">
                <span class="evt-key">{{ row.type }}</span>
              </template>
            </el-table-column>
            <el-table-column label="级别" width="90">
              <template #default="{ row }">
                <el-tag :type="levelTagType(row.level)" size="small" effect="dark">
                  {{ row.level }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="channelId" label="通道" width="80" />
            <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 活跃防区容量状态 ===== -->
    <el-card shadow="never" class="section-card" style="margin-top: 16px">
      <template #header>
        <div class="card-header">
          <span>容量档案 (活跃防区)</span>
          <el-button size="small" :loading="loading" @click="refreshAll">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>
      <el-table :data="profiles" v-loading="loading" size="small"
                :empty-text="'暂无容量档案 — 可在场景包页应用后配置'">
        <el-table-column prop="region_id" label="防区" min-width="160" />
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column prop="scene_tag" label="场景" min-width="150" />
        <el-table-column prop="design_capacity" label="设计容量" width="90" />
        <el-table-column label="分级阈值 (黄/橙/红)" min-width="180">
          <template #default="{ row }">
            <span v-for="(lv, i) in row.levels" :key="lv.name" class="level-chip" :class="lv.name">
              {{ (lv.capacity_ratio * 100).toFixed(0) }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column label="滞回" width="120">
          <template #default="{ row }">
            Δ{{ row.hysteresis.release_ratio_delta }} / {{ row.hysteresis.min_hold_sec }}s
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 大型活动总览 — EventGuard T2.2 (2026-08-27)
 *
 * KPI 仪表盘: 4 统计卡 (当前峰值密度 / 活跃防区 / 24h 事件 / SSOT 覆盖) +
 * 三圈布防状态卡 + 最近事件表 + 容量档案状态表。
 * 数据源: density/latest + capacity-profiles + event-types/metadata?scene= + alarms
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Odometer, Warning, Bell, CollectionTag, Refresh } from '@element-plus/icons-vue'
import { largeEventApi } from '@/api/largeEvent'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import type { CapacityProfile } from '@/types/largeEvent'
import { LARGE_EVENT_SCENES, LARGE_EVENT_CIRCLES, NEW_LARGE_EVENT_TYPES } from '@/types/largeEvent'
import type { AlarmEvent } from '@/types/alarm'
import type { EventTypeMetadataItem } from '@/api/eventTypes'

const router = useRouter()

// ── 状态 ──
const loading = ref(false)
const eventsLoading = ref(false)
const peakDensity = ref(0)
const peakChannel = ref<number | null>(null)
const profiles = ref<CapacityProfile[]>([])
const recentEvents = ref<AlarmEvent[]>([])
const circleEvents = ref<Record<string, number>>({})
const ssotCoverage = ref(0)
const ssotError = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null

// ── 统计卡 ──
const activeZones = computed(() => profiles.value.filter(p => p.enabled).length)
const eventCount24h = computed(() => recentEvents.value.length)

const statCards = computed(() => [
  {
    label: '当前峰值密度 (人)',
    value: peakDensity.value,
    sub: peakChannel.value != null ? `通道 ${peakChannel.value} 实时网格求和` : '暂无密度快照',
    color: '#e6a23c', icon: Odometer,
  },
  {
    label: '活跃防区数',
    value: activeZones.value,
    sub: `容量档案共 ${profiles.value.length} 份`,
    color: '#409eff', icon: CollectionTag,
  },
  {
    label: '24h 大型活动事件',
    value: eventCount24h.value,
    sub: '含 9 新事件 + 场景标签事件',
    color: '#f56c6c', icon: Warning,
  },
  {
    label: '场景 SSOT 覆盖数',
    value: ssotCoverage.value,
    sub: `四场景 (stadium/openair/expo/marathon)`,
    color: '#67c23a', icon: Bell,
  },
])

const circleStats = computed(() =>
  LARGE_EVENT_CIRCLES.map(c => ({
    ...c,
    events: circleEvents.value[c.tag] ?? 0,
    css: c.tag.includes('core') ? 'core' : c.tag.includes('alert') ? 'alert' : 'control',
    desc:
      c.tag.includes('core') ? '赛场/舞台核心, 冲场与红色密度直接布防'
      : c.tag.includes('alert') ? '看台/外围缓冲, 密度系 + 周界系事件'
      : '外围道路管控, 车辆系 + LPR 事件',
  }))
)

// ── 数据拉取 ──
async function fetchPeakDensity() {
  try {
    // 全通道最新一条 (channel_id=-1)
    const res = await largeEventApi.getDensityLatest(-1)
    const d = res.data?.data
    if (d?.found && Array.isArray(d.counts)) {
      let total = 0
      for (const row of d.counts)
        for (const c of row) total += Number(c) || 0
      peakDensity.value = total
      peakChannel.value = d.channel_id ?? null
    }
  } catch {
    /* 空态保留上次值 */
  }
}

async function fetchProfiles() {
  try {
    const res = await largeEventApi.listCapacityProfiles()
    profiles.value = res.data?.data?.profiles ?? []
  } catch (e: unknown) {
    ElMessage.warning(`容量档案加载失败: ${(e as Error)?.message ?? e}`)
  }
}

/** 大型活动事件判定: 9 新 canonical + 场景标签事件 (以 metadata 场景并集为准) */
let sceneEventKeys = new Set<string>([...NEW_LARGE_EVENT_TYPES])

async function fetchSceneMetadata() {
  try {
    const res = await eventTypesApi.metadata({ scene: LARGE_EVENT_SCENES.join(',') })
    const data = res.data?.data as unknown as {
      groups?: Record<string, { items: EventTypeMetadataItem[] }>
      total?: number
    } | undefined
    const items: EventTypeMetadataItem[] = []
    for (const g of Object.values(data?.groups ?? {})) items.push(...(g?.items ?? []))
    if (items.length > 0) {
      sceneEventKeys = new Set(items.map(i => i.alarm_type))
      ssotCoverage.value = new Set(items.map(i => i.alarm_type)).size
    } else {
      ssotCoverage.value = sceneEventKeys.size
    }
    // 三圈覆盖
    for (const c of LARGE_EVENT_CIRCLES) {
      try {
        const cr = await eventTypesApi.metadata({ scene: c.tag })
        const cd = cr.data?.data as unknown as {
          groups?: Record<string, { items: EventTypeMetadataItem[] }>
        } | undefined
        let n = 0
        for (const g of Object.values(cd?.groups ?? {})) n += g?.items?.length ?? 0
        circleEvents.value[c.tag] = n
      } catch {
        circleEvents.value[c.tag] = 0
      }
    }
  } catch {
    ssotError.value = true
    ssotCoverage.value = sceneEventKeys.size
  }
}

async function fetchRecentEvents() {
  eventsLoading.value = true
  try {
    const res = await alarmApi.getList({ page: 1, pageSize: 100 })
    const items: AlarmEvent[] =
      (res.data?.data as unknown as { items?: AlarmEvent[] })?.items ?? []
    recentEvents.value = items
      .filter(a => sceneEventKeys.has(String(a.type)))
      .slice(0, 10)
  } catch {
    recentEvents.value = []
  } finally {
    eventsLoading.value = false
  }
}

async function refreshAll() {
  loading.value = true
  try {
    await Promise.allSettled([
      fetchPeakDensity(),
      fetchProfiles(),
      fetchRecentEvents(),
    ])
  } finally {
    loading.value = false
  }
}

// ── 工具 ──
function levelTagType(level: string) {
  if (['critical', 'high'].includes(level)) return 'danger'
  if (level === 'medium') return 'warning'
  return 'info'
}

function formatTime(t?: string) {
  if (!t) return '-'
  try {
    return new Date(t).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return t
  }
}

// ── 生命周期 (10s 轮询, 慢数据 60s) ──
onMounted(async () => {
  await Promise.allSettled([fetchSceneMetadata(), refreshAll()])
  pollTimer = setInterval(refreshAll, 10000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.le-overview-page { padding: 16px; }
.stat-row { margin-bottom: 16px; }
.stat-card .stat-content { display: flex; align-items: center; gap: 12px; }
.stat-icon {
  width: 42px; height: 42px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; flex-shrink: 0;
}
.stat-value { font-size: 24px; font-weight: 700; line-height: 1.2; }
.stat-label { font-size: 12px; color: #909399; }
.stat-sub { margin-top: 8px; font-size: 12px; color: #c0c4cc; }
.section-card :deep(.el-card__header) { padding: 12px 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.circle-list { display: flex; flex-direction: column; gap: 14px; }
.circle-item { display: flex; align-items: center; gap: 12px; }
.circle-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
.circle-dot.core { background: #f56c6c; box-shadow: 0 0 8px rgba(245, 108, 108, 0.6); }
.circle-dot.alert { background: #e6a23c; }
.circle-dot.control { background: #409eff; }
.circle-info { flex: 1; }
.circle-name { font-size: 14px; font-weight: 600; }
.circle-tag { font-size: 11px; color: #909399; margin-left: 6px; font-family: monospace; }
.circle-desc { font-size: 12px; color: #909399; margin-top: 2px; }
.circle-count { text-align: right; }
.circle-count .num { font-size: 20px; font-weight: 700; }
.circle-count .unit { font-size: 12px; color: #909399; margin-left: 4px; }
.circle-footer { font-size: 13px; color: #606266; display: flex; align-items: center; gap: 10px; }
.evt-key { font-family: monospace; font-size: 12px; }
.level-chip {
  display: inline-block; padding: 1px 8px; border-radius: 4px;
  font-size: 12px; margin-right: 6px; color: #fff;
}
.level-chip.yellow { background: #e6a23c; }
.level-chip.orange { background: #f56c6c; opacity: 0.85; }
.level-chip.red { background: #c40000; }
</style>
