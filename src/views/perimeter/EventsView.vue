<template>
  <div class="vp-events-page">
   <!-- [P3 → 本轮 UI-4] 左侧设备树筛选面板 (统一规则: 设备列表居左/主内容居右) -->
   <AlarmDeviceTreePanel @selection-change="onTreeSelection" />

   <div class="vp-events-main">
    <!-- ===== 错误态 ===== -->
    <el-result v-if="loadError" icon="warning" :title="t('perimeter.events.loadFailed')" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">{{ t('common.retry') }}</el-button>
      </template>
    </el-result>

    <!-- ===== 骨架屏 ===== -->
    <el-card v-else-if="loading && events.length === 0" shadow="hover">
      <el-skeleton :rows="8" animated />
    </el-card>

    <!-- ===== [场景页对齐 2026-09-11] 事件列表统一 AlarmEventsPanel
         (表格/卡片/分页/处警·详情入口 与 AlarmsView 零分叉) ===== -->
    <AlarmEventsPanel
      v-else
      :rows="paged" :total="filtered.length"
      v-model:page="page" v-model:page-size="pageSize"
      :loading="loading" :view-mode="viewMode"
      :empty-text="t('perimeter.events.empty')">
      <template #header>
        <!-- ===== 页头 + 过滤器 ===== -->
        <div class="events-header">
          <div>
            <h2 class="events-title">{{ t('perimeter.events.title') }}</h2>
            <div class="events-sub">{{ t('perimeter.events.subtitle', { n: filtered.length }) }}</div>
          </div>
          <div class="events-filter">
            <!-- [UX 2026-09-02 对齐效果图] 关键词搜索 (300ms 防抖) + 类型筛选中文下拉 -->
            <el-input v-model="keywordInput" size="default" clearable class="filter-kw"
              :placeholder="t('perimeter.events.searchHint', '搜索描述 / 设备 / 事件类型')"
              :prefix-icon="Search" @input="onKeywordInput" />
            <el-select v-model="typeFilter" size="default" class="filter-type" clearable filterable
                       :placeholder="t('perimeter.events.allTypes', '全部类型')" @change="page = 1">
              <el-option v-for="ty in typeOptions" :key="ty" :value="ty" :label="zh(ty)" />
            </el-select>
            <el-select v-model="levelFilter" size="default" class="filter-level" clearable
                       :placeholder="t('perimeter.events.allLevels')" @change="onLevelFilterChange">
              <el-option v-for="lv in LEVELS" :key="lv" :value="lv" :label="levelText(lv)" />
            </el-select>
            <el-select v-model="statusFilter" size="default" class="filter-status" clearable
                       :placeholder="t('perimeter.events.allStatus')" @change="page = 1">
              <el-option v-for="s in STATUSES" :key="s" :value="s" :label="statusText(s)" />
            </el-select>
            <!-- [vp3] AI 复核结论筛选 (《研究报告》§8 复核闭环运营口径) -->
            <el-select v-model="aiFilter" size="default" class="filter-ai" clearable
                       :placeholder="t('perimeter.events.colAiReview')" @change="page = 1">
              <el-option value="true" :label="t('perimeter.events.aiTrue')" />
              <el-option value="false" :label="t('perimeter.events.aiFalse')" />
              <el-option value="reviewed" :label="t('perimeter.events.aiReviewed')" />
              <el-option value="none" :label="t('perimeter.events.reviewNone')" />
            </el-select>
            <!-- [P2 2026-09-10] 卡片/列表切换 (选择持久化 localStorage) -->
            <AlarmViewToggle v-model="viewMode" page-key="perimeter" />
            <el-button :icon="Refresh" :loading="loading" @click="reload">{{ t('common.refresh') }}</el-button>
          </div>
        </div>
      </template>
    </AlarmEventsPanel>
   </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 视频周界 — 事件检索 (vp 轮 2026-08-31, 方案 docs/plans/video-perimeter-solution-v1.0.md §6)
 * [场景页对齐 2026-09-11] 列表主体统一 AlarmEventsPanel (表格 14 列/卡片栅格/
 *   分页/处警·详情入口, 与平台告警中心 AlarmsView 逐列同构 — 展示口径零分叉)。
 * /api/v1/alarms 拉取 → PERIMETER_EVENT_TYPES 并集过滤 → severity 分档。
 * 业务筛选保留: 关键词防抖/类型/级别(服务端下沉)/状态/AI 复核结论 + 设备树。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, Search } from '@element-plus/icons-vue'
import { useDebounceFn } from '@vueuse/core'
import { videoPerimeterApi, isPerimeterEvent } from '@/api/videoPerimeter'
import { type AlarmEvent, type AlarmLevel, type AlarmStatus } from '@/types/alarm'
import { useRealtimeAlarmEvents } from '@/composables/useRealtimeAlarmEvents'
import { normalizeAlarmCompat } from '@/composables/useAlarmTableHelpers'
import { useEventTypeZh } from '@/composables/useEventTypeZh'
// [P3 2026-09-10] 右侧设备树筛选面板 (安保区域→子区域→设备 多选)
import AlarmDeviceTreePanel from '@/components/alarm/AlarmDeviceTreePanel.vue'
import type { AlarmTreeSelection } from '@/components/alarm/AlarmDeviceTreePanel.vue'
// [t3-tree-channel 2026-09-11] 三级树服务端下钻 (多值 fan-out 合并; 见 composable 头注)
import { fetchAlarmDrillFanout } from '@/composables/useAlarmTreeDrill'
// [P2 2026-09-10] 卡片/列表切换 (持久化 key alarm_view_mode_perimeter)
import AlarmViewToggle from '@/components/alarm/AlarmViewToggle.vue'
// [场景页对齐 2026-09-11] 列表主体统一共享面板 (不复制 AlarmsView 表格)
import AlarmEventsPanel from '@/components/alarm/AlarmEventsPanel.vue'

const { t } = useI18n()

// [P2 2026-09-10] 卡片/列表视图 (持久化 key alarm_view_mode_perimeter, 与 AlarmViewToggle 同规范)
const viewMode = ref<'card' | 'table'>(
  localStorage.getItem('alarm_view_mode_perimeter') === 'card' ? 'card' : 'table'
)
const { zh, ensure: ensureEventTypes } = useEventTypeZh()
// [FIX handle-refresh 2026-09-10] 处警后状态同步: 处置成功广播 'alarm-handled'
//   去抖重拉 (与 WS 实时插入 onWsAlarmEvent 互补 — 插入即时, 重拉对齐后端
//   回填的治理字段 status/disposition/ticket_id)。
useRealtimeAlarmEvents(() => reload())

const LEVELS: AlarmLevel[] = ['critical', 'high', 'medium', 'low', 'info']
const STATUSES: AlarmStatus[] = ['unhandled', 'acknowledged', 'disposed', 'resolved', 'closed', 'false_alarm']

const events = ref<AlarmEvent[]>([])
const loading = ref(false)
const loadError = ref('')
const levelFilter = ref<AlarmLevel | ''>('')
const statusFilter = ref<AlarmStatus | ''>('')
const aiFilter = ref<'' | 'true' | 'false' | 'reviewed' | 'none'>('')  // [vp3]
// [UX 2026-09-02] 关键词搜索 (300ms 防抖) + 类型筛选 + 前端分页
const keywordInput = ref('')
const keyword = ref('')
const typeFilter = ref<AlarmEvent['type'] | ''>('')
const page = ref(1)
const pageSize = ref(20)

const typeOptions = computed(() => {
  const set = new Set<string>()
  for (const e of events.value) if (e.type) set.add(String(e.type))
  return [...set].sort()
})

/** 搜索防抖 (300ms): 输入中不触发过滤计算, 提交后重置分页 */
const onKeywordInput = useDebounceFn(() => {
  keyword.value = keywordInput.value.trim()
  page.value = 1
}, 300)

/** [ALARMS-FILTER 2026-09-06] level 筛选下沉服务端: 原页内过滤 (filtered
 *  计算属性) 只能筛当次拉取的 500 条, 换级重新请求 — 由后端 alarm_level IN
 *  精确过滤; 页内过滤行保留 (服务端已滤恒真, 防其他路径改动回归) */
function onLevelFilterChange() {
  page.value = 1
  reload()
}

// [P3 2026-09-10] 右侧设备树筛选状态 (与 AlarmsView 同款命中判定)
const treeSel = ref<AlarmTreeSelection | null>(null)
const treeChannelSet = computed(() => new Set(treeSel.value?.channelIds ?? []))
const treeDeviceSet = computed(() => new Set(treeSel.value?.deviceIds ?? []))
function onTreeSelection(sel: AlarmTreeSelection) {
  treeSel.value = sel.chips.length ? sel : null
  page.value = 1
  // [t3-tree-channel 2026-09-11] 勾选变化 → 下钻重拉 (修复: 原只改过滤状态不重拉,
  //   服务端数据面不变 → 勾选无效果); 单值服务端过滤 / 多值 fan-out 合并
  reload()
}
function hitTree(a: AlarmEvent): boolean {
  const ch = String(a.channelId || '')
  if (ch && treeChannelSet.value.has(ch)) return true
  const dev = String(a.deviceId || '').replace(/_ch\d+$/, '')
  return !!dev && treeDeviceSet.value.has(dev)
}

const filtered = computed(() => {
  const kw = keyword.value.toLowerCase()
  return events.value.filter(e => {
    if (levelFilter.value !== '' && e.level !== levelFilter.value) return false
    if (statusFilter.value !== '' && e.status !== statusFilter.value) return false
    if (typeFilter.value !== '' && e.type !== typeFilter.value) return false
    if (aiFilter.value !== '' && aiReviewKeyOf(e) !== aiFilter.value) return false
    // [P3 2026-09-10] 设备树筛选 (右侧面板勾选集合命中判定; 空集不筛)
    if (treeSel.value && !hitTree(e)) return false
    if (kw) {
      const hay = `${e.description ?? ''} ${e.channelName ?? ''} ${e.channelId ?? ''} ${e.type ?? ''} ${zh(String(e.type ?? ''))}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

/** 分页切片: 任一筛选变化 → filtered 变化 → 越界页码自动回收 */
const paged = computed(() => {
  const maxPage = Math.max(1, Math.ceil(filtered.value.length / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

/** [vp3] AI 复核结论分类 (筛选语义) */
function aiReviewKeyOf(e: AlarmEvent): 'true' | 'false' | 'reviewed' | 'none' {
  const c = (e.aiConclusion || '').toLowerCase()
  if (!c) return 'none'
  if (c.includes('false_alarm') || c.includes('误报')) return 'false'
  if (c.includes('true_alarm') || c.includes('真告警') || c.includes('真实')) return 'true'
  return 'reviewed'
}

function levelText(lv: string): string {
  return t(`perimeter.events.level_${lv}`)
}
function statusText(s: string): string {
  return t(`perimeter.events.status_${s}`)
}

/** [vp6 P1-3 2026-09-01] 单行归一化: normalizeAlarmCore (SSOT) + 原始 metadata
 *  展开 (三形态: 字符串/对象/数组), reload 与 WS 实时插入共用同一口径 */
function normalizeRow(e: unknown): AlarmEvent {
  const n = normalizeAlarmCompat(e)
  // [vp6 收尾补测 2026-09-01] metadata 三形态兼容: REST 端点不同分页下返回
  //   JSON 字符串或对象 (真机实测同端点两形态并存), 字符串先 parse 再合并
  let rawMeta = (e as { metadata?: unknown })?.metadata
  if (typeof rawMeta === 'string') {
    try { rawMeta = JSON.parse(rawMeta) } catch { rawMeta = undefined }
  }
  // [FIX 2026-09-04] AlarmDispatcher 直报链 (尾随/聚集/入侵等行为插件)
  //   metadata 为数组 [{bbox,...}] (真机 tailgate 实锚): 数组取首元素展开合并。
  if (Array.isArray(rawMeta)) {
    rawMeta = (rawMeta[0] && typeof rawMeta[0] === 'object') ? rawMeta[0] : undefined
  }
  if (rawMeta && typeof rawMeta === 'object') {
    n.metadata = { ...(rawMeta as Record<string, unknown>), ...n.metadata }
  }
  return n
}

async function reload() {
  loading.value = true
  loadError.value = ''
  try {
    // [ALARMS-FILTER 2026-09-06] level 透传服务端 (名称形态, 后端映射 1-5)
    // [t3-tree-channel 2026-09-11] 三级树服务端下钻 (见 useAlarmTreeDrill 头注):
    //   勾选激活时 channel_id 服务端过滤 — 单值直传 / 多值 fan-out 合并
    //   (后端参数单值 + pageSize clamp 100; level 与 channel_id 实测 AND 叠加有效)
    const level = levelFilter.value || undefined
    const drill = treeSel.value?.drillValues ?? []
    if (drill.length > 1) {
      events.value = await fetchAlarmDrillFanout(drill, async (v) => {
        const r = await videoPerimeterApi.listAlarms(level, v)
        const dd = (r.data as { data?: { items?: AlarmEvent[] } })?.data
        const l = Array.isArray(dd?.items) ? dd.items : []
        return l.map(e => normalizeRow(e)).filter(e => isPerimeterEvent(e?.type))
      })
      return
    }
    const res = await videoPerimeterApi.listAlarms(level, drill[0])
    const d = (res.data as { data?: { items?: AlarmEvent[] } })?.data
    const list = Array.isArray(d?.items) ? d.items : []
    // [normalize 修复 2026-09-01] 统一走 normalizeAlarmCore (SSOT 归一化)
    events.value = list.map(e => normalizeRow(e)).filter(e => isPerimeterEvent(e?.type))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

/** [FIX realtime-push 2026-09-06] WS 实时插入: useGlobalAlarm 单例 (App.vue
 *  启动, 无限重连+断线补拉) 对 alarm 类消息派发 linkage-ws-event — 零新增
 *  连接复用。同 id 去重 (alarm.new 全量链与 linkage_alarm 弹窗链可能双推)。 */
function onWsAlarmEvent(ev: Event) {
  const payload = (ev as CustomEvent).detail
  if (!payload || typeof payload !== 'object') return
  const row = normalizeRow(payload)
  if (!row.id || !isPerimeterEvent(row.type)) return
  const idx = events.value.findIndex(e => e.id === row.id)
  if (idx >= 0) {
    // 已存在 (双推/历史行): 保留处置状态, 只补齐标注/快照等富化字段
    events.value[idx] = { ...events.value[idx], ...row, status: events.value[idx].status }
    return
  }
  events.value.unshift(row)
}

onMounted(() => {
  reload()
  ensureEventTypes() // 事件类型中文名预热 (非阻塞)
  // [FIX realtime-push 2026-09-06] WS 实时插入 (见 onWsAlarmEvent)
  window.addEventListener('linkage-ws-event', onWsAlarmEvent as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('linkage-ws-event', onWsAlarmEvent as EventListener)
})
</script>

<style scoped>
/* [P3 2026-09-10] 右侧设备树面板 → flex 双栏 */
.vp-events-page { display: flex; gap: 12px; align-items: flex-start; }
.vp-events-main { flex: 1; min-width: 0; }
.events-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.events-title { margin: 0 0 4px; font-size: 20px; }
.events-sub { color: var(--el-text-color-secondary); font-size: 13px; }
.events-filter { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.filter-kw { width: 210px; }
.filter-type { width: 150px; }
.filter-level { width: 130px; }
.filter-status { width: 140px; }
.filter-ai { width: 120px; }
</style>

<!-- [t3-tree-channel 2026-09-11 完成锚点] 三级树通道级服务端下钻(单值直传+多值 fan-out)批次 · 部署产物 entry=index-CvT0U9Nv4f.js tgz md5=07a2e26224ed93a40c47f987c04b7bb5 -->
