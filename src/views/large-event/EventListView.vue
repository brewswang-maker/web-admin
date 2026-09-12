<template>
  <div class="le-events-page">
   <!-- [P3 → 本轮 UI-4] 左侧设备树筛选面板 (统一规则: 设备列表居左/主内容居右) -->
   <AlarmDeviceTreePanel @selection-change="onTreeSelection" />

   <div class="le-events-main">
    <!-- ===== 场景事件类型筛选 (SSOT metadata?scene= 动态拉取) ===== -->
    <el-card shadow="never" class="filter-card">
      <div class="scene-bar">
        <span class="bar-label">场景</span>
        <el-radio-group v-model="sceneTag" size="small" @change="onSceneChange">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button v-for="s in sceneOptions" :key="s.tag" :label="s.tag">
            {{ s.label }}
          </el-radio-button>
        </el-radio-group>
        <span class="bar-count" v-if="activeTypeKeys.size > 0">
          SSOT 覆盖 {{ activeTypeKeys.size }} 事件类型
        </span>
      </div>
      <div class="type-chips">
        <el-check-tag :checked="!selectedType" @change="selectedType = ''">全部类型</el-check-tag>
        <el-tooltip v-for="t in typeChips" :key="t.alarm_type"
                    :content="`${t.alarm_type} · ${t.severity_cn}`" placement="top">
          <el-check-tag :checked="selectedType === t.alarm_type"
                        :class="chipClass(t.alarm_type)"
                        @change="onSelectType(t.alarm_type)">
            {{ t.display_name }}
          </el-check-tag>
        </el-tooltip>
      </div>
    </el-card>

    <!-- ===== [场景页对齐 2026-09-11] 事件列表统一 AlarmEventsPanel
         (表格/卡片/分页/处警·详情入口 与 AlarmsView 零分叉) ===== -->
    <AlarmEventsPanel
      :rows="pagedFinal" :total="finalEvents.length"
      v-model:page="page" v-model:page-size="pageSize"
      :loading="loading" :view-mode="viewMode"
      empty-text="暂无大型活动相关事件">
      <template #header>
        <div class="card-header">
          <span>事件告警列表</span>
          <div class="header-right">
            <AlarmViewToggle v-model="viewMode" page-key="largeevent" />
            <el-button size="small" :loading="loading" @click="refreshAll">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
          </div>
        </div>
      </template>
    </AlarmEventsPanel>
   </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 事件告警列表 — EventGuard T2.4 (方案任务 5.2) [场景页对齐 2026-09-11]
 *
 * 事件类型筛选 chips 从 /event-types/metadata?scene=<四场景> 动态拉取 (SSOT),
 * 场景 radio (体育场馆/户外演出/展会博览/马拉松) 切换重拉。
 * 列表主体统一 AlarmEventsPanel (表格 14 列/卡片栅格/分页/处警·详情入口,
 * 与平台告警中心 AlarmsView 逐列同构 — 展示口径零分叉)。
 * 数据源: alarmApi.getList 前端按场景事件键并集过滤 + normalizeAlarmCore 归一化。
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import { type AlarmEvent } from '@/types/alarm'
import { LARGE_EVENT_SCENES } from '@/types/largeEvent'
import { useRealtimeAlarmEvents } from '@/composables/useRealtimeAlarmEvents'
import { normalizeAlarmCompat } from '@/composables/useAlarmTableHelpers'
// [P3 2026-09-10] 右侧设备树筛选面板 (安保区域→子区域→设备 多选)
import AlarmDeviceTreePanel from '@/components/alarm/AlarmDeviceTreePanel.vue'
import type { AlarmTreeSelection } from '@/components/alarm/AlarmDeviceTreePanel.vue'
// [t3-tree-channel 2026-09-11] 三级树服务端下钻 (多值 fan-out 合并; 见 composable 头注)
import { fetchAlarmDrillFanout } from '@/composables/useAlarmTreeDrill'
// 卡片/列表切换 (持久化 key alarm_view_mode_largeevent)
import AlarmViewToggle from '@/components/alarm/AlarmViewToggle.vue'
// [场景页对齐 2026-09-11] 列表主体统一共享面板 (不复制 AlarmsView 表格)
import AlarmEventsPanel from '@/components/alarm/AlarmEventsPanel.vue'
// [FIX realtime-push 2026-09-06] 场景页实时刷新: WS 告警到达去抖重拉 (零新增连接)
useRealtimeAlarmEvents(() => fetchEvents())

const sceneOptions = [
  { tag: 'large_event_stadium', label: '体育场馆' },
  { tag: 'large_event_openair', label: '户外演出' },
  { tag: 'large_event_expo', label: '展会博览' },
  { tag: 'large_event_marathon', label: '马拉松' },
]

const loading = ref(false)
const sceneTag = ref('')
const selectedType = ref('')
const typeItems = ref<EventTypeMetadataItem[]>([])

const events = ref<AlarmEvent[]>([])
const page = ref(1)
const pageSize = ref(20)

// 卡片/列表视图 (持久化 key alarm_view_mode_largeevent, 与 AlarmViewToggle 同规范)
const viewMode = ref<'card' | 'table'>(
  localStorage.getItem('alarm_view_mode_largeevent') === 'card' ? 'card' : 'table'
)

// 当前场景 (或全部=四场景并集) 的事件类型元数据
const activeItems = computed(() => {
  if (!sceneTag.value) return typeItems.value
  return typeItems.value.filter(i => i.aliases?.includes(sceneTag.value) || matchScene(i))
})
const typeChips = computed(() => activeItems.value)
const activeTypeKeys = computed(() => new Set(activeItems.value.map(i => i.alarm_type)))

/** metadata 响应按 scene 过滤后端已做, 前端按场景切换时重拉 */
function matchScene(_i: EventTypeMetadataItem) {
  return true // 场景过滤在后端 scene 参数完成, 此处保守放行
}

function chipClass(alarmType: string) {
  if (alarmType.includes('red')) return 'chip-red'
  if (alarmType.includes('orange')) return 'chip-orange'
  if (alarmType.includes('yellow')) return 'chip-yellow'
  if (alarmType === 'stampede_risk') return 'chip-stampede'
  return ''
}

const filteredEvents = computed(() => {
  // [SSOT 2026-09-07] 数据源已带 scene 过滤 (fetchEvents scene=四场景并集/选中场景,
  //   后端 isEventInScene → SQL IN, 与 scene_tags 登记自动同步) — 未选类型 chip 时
  //   显示场景全部事件。
  const keys = activeTypeKeys.value
  let base = events.value
  if (keys.size !== 0) base = base.filter(a => keys.has(String(a.type)))
  // [P3 2026-09-10] 设备树筛选 (右侧面板勾选集合命中判定; 空集不筛)
  if (treeSel.value) base = base.filter(hitTree)
  return base
})

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
async function fetchTypes() {
  try {
    const scene = sceneTag.value || LARGE_EVENT_SCENES.join(',')
    const res = await eventTypesApi.metadata({ scene })
    const data = res.data?.data
    const items: EventTypeMetadataItem[] = []
    for (const g of Object.values(data?.groups ?? {})) items.push(...(g?.items ?? []))
    // 去重 (多场景并集可能重复返回同类型)
    const seen = new Set<string>()
    typeItems.value = items.filter(i => {
      if (seen.has(i.alarm_type)) return false
      seen.add(i.alarm_type)
      return true
    })
  } catch {
    typeItems.value = []
  }
}

async function fetchEvents() {
  loading.value = true
  try {
    // [SSOT 2026-09-07] 场景过滤下沉服务端: scene=选中场景或四场景并集 (逗号多值)
    const scene = sceneTag.value
      || sceneOptions.map(s => s.tag).join(',')
    // [t3-tree-channel 2026-09-11] 三级树服务端下钻 (见 useAlarmTreeDrill 头注):
    //   勾选激活时 channel_id 服务端过滤 — 单值直传 / 多值 fan-out 合并
    //   (后端参数单值 + pageSize clamp 100; scene 与 channel_id 实测 AND 叠加有效)
    const drill = treeSel.value?.drillValues ?? []
    if (drill.length > 1) {
      events.value = await fetchAlarmDrillFanout(drill, async (v) => {
        const r = await alarmApi.getList({ page: 1, pageSize: 100, scene, channel_id: v })
        return ((r.data?.data as unknown as { items?: unknown[] })?.items ?? []).map(e => normalizeAlarmCompat(e))
      })
      return
    }
    const params: Record<string, unknown> = { page: 1, pageSize: 500, scene }
    if (drill.length === 1) params.channel_id = drill[0]
    const res = await alarmApi.getList(params)
    // [FIX scene-empty 2026-09-07] 统一走 normalizeAlarmCore (SSOT)
    events.value =
      ((res.data?.data as unknown as { items?: unknown[] })?.items ?? []).map(e => normalizeAlarmCompat(e))
  } catch {
    events.value = []
  } finally {
    loading.value = false
  }
}

function onSceneChange() {
  selectedType.value = ''
  page.value = 1
  fetchTypes()
  // [SSOT 2026-09-07] 场景切换同时重拉数据
  fetchEvents()
}

function refreshAll() {
  fetchTypes()
  fetchEvents()
}

onMounted(() => {
  refreshAll()
})
</script>

<style scoped>
.le-events-page { padding: 4px 0; display: flex; gap: 12px; align-items: flex-start; }
/* [P3 2026-09-10] 右侧设备树面板 → flex 双栏 */
.le-events-main { flex: 1; min-width: 0; }
.filter-card { margin-bottom: 16px; }
.scene-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.bar-label { font-size: 13px; color: var(--el-text-color-secondary); }
.bar-count { font-size: 12px; color: var(--el-color-success); margin-left: auto; }
.type-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.type-chips :deep(.el-check-tag) { height: 26px; padding: 0 10px; font-size: 12px; }
.type-chips :deep(.el-check-tag.is-checked.chip-red) { background: #f56c6c; }
.type-chips :deep(.el-check-tag.is-checked.chip-orange) { background: #e6a23c; }
.type-chips :deep(.el-check-tag.is-checked.chip-yellow) { background: #f7d43a; color: #333; }
.type-chips :deep(.el-check-tag.is-checked.chip-stampede) { background: #7f1d1d; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-right { display: flex; align-items: center; gap: 12px; }
</style>

<!-- [t3-tree-channel 2026-09-11 完成锚点] 三级树通道级服务端下钻(单值直传+多值 fan-out)批次 · 部署产物 entry=index-CvT0U9Nv4f.js tgz md5=07a2e26224ed93a40c47f987c04b7bb5 -->
