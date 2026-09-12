<template>
  <div class="hu-events-page">
   <!-- [P3 → 本轮 UI-4] 左侧设备树筛选面板 (统一规则: 设备列表居左/主内容居右) -->
   <AlarmDeviceTreePanel @selection-change="onTreeSelection" />

   <div class="hu-events-main">
    <!-- ===== 场景事件类型筛选 (SSOT metadata?scene=hotel_unattended 动态拉取) ===== -->
    <el-card shadow="never" class="filter-card">
      <div class="scene-bar">
        <span class="bar-label">{{ t('hotel.common.scene') }}</span>
        <el-tag size="small" type="warning" effect="plain">hotel_unattended</el-tag>
        <span class="bar-count" v-if="activeTypeKeys.size > 0">
          {{ t('hotel.events.ssotCoverage') }} {{ activeTypeKeys.size }} {{ t('hotel.overview.eventTypesUnit') }}
        </span>
        <el-button size="small" :loading="loading" class="bar-refresh" @click="refreshAll">
          <el-icon><Refresh /></el-icon>{{ t('common.refresh') }}
        </el-button>
      </div>
      <div class="type-chips">
        <el-check-tag :checked="!selectedType" @change="selectedType = ''">{{ t('hotel.events.allTypes') }}</el-check-tag>
        <el-check-tag :checked="interceptOnly" @change="interceptOnly = !interceptOnly" class="chip-intercept">
          {{ t('hotel.events.interceptOnly') }}
        </el-check-tag>
        <el-select v-model="selectedGroup" size="small" class="group-select" clearable
                   :placeholder="t('hotel.person.groupFilterAll')">
          <el-option v-for="g in groupOptions" :key="g.value" :label="g.label" :value="g.value" />
        </el-select>
        <el-tooltip v-for="it in typeChips" :key="it.alarm_type"
                    :content="`${it.alarm_type} · ${it.severity_cn}`" placement="top">
          <el-check-tag :checked="selectedType === it.alarm_type"
                        @change="onSelectType(it.alarm_type)">
            {{ it.display_name }}
          </el-check-tag>
        </el-tooltip>
      </div>
    </el-card>

    <!-- ===== 错误态 ===== -->
    <el-result v-if="loadError && events.length === 0" icon="warning"
               :title="t('hotel.common.loadFailed')" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="refreshAll">{{ t('common.retry') }}</el-button>
        <div class="err-hint">{{ t('hotel.common.errHint') }}</div>
      </template>
    </el-result>

    <!-- ===== 骨架屏 ===== -->
    <el-card v-else-if="loading && events.length === 0" shadow="never">
      <el-skeleton :rows="8" animated />
    </el-card>

    <!-- ===== [场景页对齐 2026-09-11] 事件列表统一 AlarmEventsPanel
         (表格/卡片/分页/处警·详情入口 与 AlarmsView 零分叉) ===== -->
    <AlarmEventsPanel
      v-else
      :rows="pagedFinal" :total="finalEvents.length"
      v-model:page="page" v-model:page-size="pageSize"
      :loading="loading" :view-mode="viewMode"
      :empty-text="selectedType ? t('hotel.events.emptyType') : t('hotel.events.emptyAll')">
      <template #header>
        <div class="card-header">
          <span>{{ t('hotel.events.tableTitle', { n: finalEvents.length }) }}</span>
          <AlarmViewToggle v-model="viewMode" page-key="corridor" />
        </div>
      </template>
    </AlarmEventsPanel>
   </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 通道事件列表 — 酒店无人值守 t8f D3 (方案 §5.7 视图 2) [场景页对齐 2026-09-11]
 *
 * 员工通道拦截事件 (tailgate/intrusion, fusion 插件 canonical 归一) + hotel 场景
 * 事件流。事件类型 chips 从 /event-types/metadata?scene=hotel_unattended
 * 动态拉取 (SSOT); 数据源 alarmApi 同源 /alarms 前端按场景键并集过滤。
 * 列表主体统一 AlarmEventsPanel (表格 14 列/卡片栅格/分页/处警·详情入口,
 * 与平台告警中心 AlarmsView 逐列同构 — 展示口径零分叉)。
 * 人员分类筛选: group_type 六分类 (黑名单/白名单/访客/VIP/员工/自定义,
 * hotel.person SSOT), Overview 构成卡联动 ?group= 初始化。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { hotelUnattendedApi, isHotelEvent, CORRIDOR_INTERCEPT_TYPES,
         PERSON_GROUPS } from '@/api/hotelUnattended'
import { type AlarmEvent, type AlarmStatus } from '@/types/alarm'
import { useRealtimeAlarmEvents } from '@/composables/useRealtimeAlarmEvents'
import { normalizeAlarmCompat } from '@/composables/useAlarmTableHelpers'
// [P3 2026-09-10] 右侧设备树筛选面板 (安保区域→子区域→设备 多选)
import AlarmDeviceTreePanel from '@/components/alarm/AlarmDeviceTreePanel.vue'
import type { AlarmTreeSelection } from '@/components/alarm/AlarmDeviceTreePanel.vue'
// [t3-tree-channel 2026-09-11] 三级树服务端下钻 (多值 fan-out 合并; 见 composable 头注)
import { fetchAlarmDrillFanout } from '@/composables/useAlarmTreeDrill'
// [P2 2026-09-10] 卡片/列表切换 (持久化 key alarm_view_mode_corridor)
import AlarmViewToggle from '@/components/alarm/AlarmViewToggle.vue'
// [场景页对齐 2026-09-11] 列表主体统一共享面板 (不复制 AlarmsView 表格)
import AlarmEventsPanel from '@/components/alarm/AlarmEventsPanel.vue'
// [FIX realtime-push 2026-09-06] 场景页实时刷新: WS 告警到达去抖重拉 (零新增连接)
useRealtimeAlarmEvents(() => fetchEvents())

const { t } = useI18n()
const route = useRoute()

const loading = ref(false)
const loadError = ref('')
const events = ref<AlarmEvent[]>([])
const typeItems = ref<Array<{ alarm_type: string; display_name: string; severity_cn: string }>>([])
const selectedType = ref('')
const interceptOnly = ref(false)
const selectedGroup = ref('')
const page = ref(1)
const pageSize = ref(20)

// [P2 2026-09-10] 卡片/列表视图 (持久化 key alarm_view_mode_corridor, 与 AlarmViewToggle 同规范)
const viewMode = ref<'card' | 'table'>(
  localStorage.getItem('alarm_view_mode_corridor') === 'card' ? 'card' : 'table'
)

const activeTypeKeys = computed(() => new Set(typeItems.value.map(i => i.alarm_type)))
const typeChips = computed(() => typeItems.value)

const filteredEvents = computed(() =>
  // [FIX scene-empty 2026-09-07] isHotelEvent 收到的是归一化后的 a.type 字段
  events.value.filter(a => isHotelEvent(a.type)).filter(a =>
    (interceptOnly.value
      ? (CORRIDOR_INTERCEPT_TYPES as readonly string[]).includes(String(a.type))
      : true) &&
    // [P3 2026-09-10] 设备树筛选 (右侧面板勾选集合命中判定; 空集不筛)
    (!treeSel.value || hitTree(a)) &&
    (!selectedGroup.value || groupOf(eventGroup(a)) === selectedGroup.value)))

// [P3 2026-09-10] 右侧设备树筛选状态 (与 AlarmsView 同款命中判定)
const treeSel = ref<AlarmTreeSelection | null>(null)
const treeChannelSet = computed(() => new Set(treeSel.value?.channelIds ?? []))
const treeDeviceSet = computed(() => new Set(treeSel.value?.deviceIds ?? []))
function onTreeSelection(sel: AlarmTreeSelection) {
  treeSel.value = sel.chips.length ? sel : null
  page.value = 1
  // [t3-tree-channel 2026-09-11] 勾选变化 → 下钻重拉 (修复: 原只改过滤状态不重拉,
  //   服务端数据面不变 → 勾选无效果); 单值服务端过滤 / 多值 fan-out 合并
  fetchEvents()
}
function hitTree(a: AlarmEvent): boolean {
  const ch = String(a.channelId || '')
  if (ch && treeChannelSet.value.has(ch)) return true
  const dev = String(a.deviceId || '').replace(/_ch\d+$/, '')
  return !!dev && treeDeviceSet.value.has(dev)
}

// ── 人员分类筛选 (group_type 来自事件 metadata, AlarmEvent 已归一透传) ──
const groupOptions = computed(() =>
  PERSON_GROUPS.map(g => ({ value: g.key, label: t(g.i18nKey) })))

/** AlarmEvent 人员分类读取: 归一化顶层字段 (若有) → metadata.group_type 兜底 */
function eventGroup(a: AlarmEvent): unknown {
  const top = (a as { group_type?: unknown }).group_type
  return top ?? (a.metadata as Record<string, unknown> | undefined)?.group_type
}

/** 事件 group_type → 六分类 key (未标注/非六分类值 → 'unknown') */
function groupOf(groupType: unknown): string {
  const g = String(groupType ?? '').toLowerCase()
  return PERSON_GROUPS.some(p => p.key === g) ? g : 'unknown'
}

function onSelectType(alarmType: string) {
  selectedType.value = selectedType.value === alarmType ? '' : alarmType
  page.value = 1
}

const finalEvents = computed(() =>
  selectedType.value
    ? filteredEvents.value.filter(a => String(a.type) === selectedType.value)
    : filteredEvents.value)
const pagedFinal = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return finalEvents.value.slice(start, start + pageSize.value)
})

// ── 数据拉取 ──
/** [FIX scene-empty 2026-09-07] 单行归一化: normalizeAlarmCore (SSOT) + 原始
 *  metadata 展开 (三形态: 字符串/对象/数组, 与周界 EventsView normalizeRow 同口径) */
function normalizeRow(e: unknown): AlarmEvent {
  const n = normalizeAlarmCompat(e)
  let rawMeta = (e as { metadata?: unknown })?.metadata
  if (typeof rawMeta === 'string') {
    try { rawMeta = JSON.parse(rawMeta) } catch { rawMeta = undefined }
  }
  if (Array.isArray(rawMeta)) {
    rawMeta = (rawMeta[0] && typeof rawMeta[0] === 'object') ? rawMeta[0] : undefined
  }
  if (rawMeta && typeof rawMeta === 'object') {
    n.metadata = { ...(rawMeta as Record<string, unknown>), ...n.metadata }
  }
  return n
}

async function fetchTypes() {
  try {
    const res = await hotelUnattendedApi.listEventMetadata()
    const data = res.data?.data
    const items: Array<{ alarm_type: string; display_name: string; severity_cn: string }> = []
    for (const g of Object.values(data?.groups ?? {})) items.push(...(g?.items ?? []))
    const seen = new Set<string>()
    typeItems.value = items.filter(i => {
      if (seen.has(i.alarm_type)) return false
      seen.add(i.alarm_type)
      return true
    })
  } catch { typeItems.value = [] }
}

async function fetchEvents() {
  loading.value = true
  loadError.value = ''
  try {
    // [t3-tree-channel 2026-09-11] 三级树服务端下钻 (见 useAlarmTreeDrill 头注):
    //   勾选激活时 channel_id 服务端过滤 — 单值直传 / 多值 fan-out 合并
    //   (后端参数单值 + pageSize clamp 100; API 层 listAlarms(channelId?) 透传)
    const drill = treeSel.value?.drillValues ?? []
    if (drill.length > 1) {
      events.value = await fetchAlarmDrillFanout(drill, async (v) => {
        const r = await hotelUnattendedApi.listAlarms(v)
        return (r.data?.data?.items ?? []).map(e => normalizeRow(e))
      })
    } else {
      const res = await hotelUnattendedApi.listAlarms(drill[0])
      const list = res.data?.data?.items ?? []
      if (list.length === 0 && !res.data) throw new Error(t('hotel.common.emptyResp'))
      events.value = list.map(e => normalizeRow(e))
    }
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    loadError.value = msg.includes('404')
      ? t('hotel.common.err404')
      : `${t('hotel.common.reqError')}: ${msg}`
    events.value = []
    ElMessage.warning(`${t('hotel.common.loadFailed')}: ${msg}`)
  } finally { loading.value = false }
}

function refreshAll() {
  page.value = 1
  selectedType.value = ''
  selectedGroup.value = ''
  fetchTypes()
  fetchEvents()
}

onMounted(() => {
  refreshAll()
  // [P1-1 v2.1] Overview 构成卡联动入口: ?group=<六分类 key> 初始化人员分类筛选
  // (refreshAll 会清空筛选, 故在之后应用; 口径同 PERSON_GROUPS SSOT)
  const qg = String(route.query.group ?? '')
  if (PERSON_GROUPS.some(p => p.key === qg)) selectedGroup.value = qg
})
</script>

<style scoped>
/* [P3 2026-09-10] 右侧设备树面板 → flex 双栏 */
.hu-events-page { display: flex; gap: 12px; align-items: flex-start; }
.hu-events-main { flex: 1; min-width: 0; }
.filter-card { margin-bottom: 16px; }
.scene-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.bar-label { font-size: 13px; color: var(--el-text-color-secondary); }
.bar-count { font-size: 12px; color: var(--el-color-success); }
.bar-refresh { margin-left: auto; }
.type-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.type-chips :deep(.el-check-tag) { height: 26px; line-height: 26px; padding: 0 10px; font-size: 12px; }
.type-chips :deep(.el-check-tag.is-checked.chip-intercept) { background: #f56c6c; }
.group-select { width: 116px; align-self: center; }
.err-hint { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>

<!-- [t3-tree-channel 2026-09-11 完成锚点] 三级树通道级服务端下钻(单值直传+多值 fan-out)批次 · 部署产物 entry=index-CvT0U9Nv4f.js tgz md5=07a2e26224ed93a40c47f987c04b7bb5 -->
