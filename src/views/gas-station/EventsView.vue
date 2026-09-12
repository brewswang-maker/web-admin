<template>
  <div class="gas-events-page">
   <!-- [UI-4b 2026-09-10] 左侧设备树筛选面板 (统一规则: 设备列表居左/主内容居右) -->
   <AlarmDeviceTreePanel @selection-change="onTreeSelection" />

   <div class="gas-events-main">
    <!-- ===== 场景事件类型筛选 (SSOT metadata?scene=gas_station 动态拉取) ===== -->
    <el-card shadow="never" class="filter-card">
      <div class="scene-bar">
        <span class="bar-label">加油站事件</span>
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
      :empty-text="selectedType ? '该类型暂无事件' : '暂无加油站相关事件'">
      <template #header>
        <div class="card-header">
          <span>加油站事件列表</span>
          <div class="header-right">
            <AlarmViewToggle v-model="viewMode" page-key="gas" />
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
 * 加油站事件列表 — [UI-4b 2026-09-10] [场景页对齐 2026-09-11]
 *
 * 事件类型筛选 chips 从 /event-types/metadata?scene=gas_station 动态拉取 (SSOT);
 * 左侧 AlarmDeviceTreePanel (默认折叠)。
 * 列表主体统一 AlarmEventsPanel (表格 14 列/卡片栅格/分页/处警·详情入口,
 * 与平台告警中心 AlarmsView 逐列同构 — 展示口径零分叉)。
 * 数据源: alarmApi.getList scene 过滤下沉服务端 + normalizeAlarmCore 归一化。
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import { type AlarmEvent } from '@/types/alarm'
import { useRealtimeAlarmEvents } from '@/composables/useRealtimeAlarmEvents'
import { normalizeAlarmCompat } from '@/composables/useAlarmTableHelpers'
// 左侧设备树筛选面板 (安保区域→子区域→设备 多选)
import AlarmDeviceTreePanel from '@/components/alarm/AlarmDeviceTreePanel.vue'
import type { AlarmTreeSelection } from '@/components/alarm/AlarmDeviceTreePanel.vue'
// [t3-tree-channel 2026-09-11] 三级树服务端下钻 (多值 fan-out 合并; 见 composable 头注)
import { fetchAlarmDrillFanout } from '@/composables/useAlarmTreeDrill'
// 卡片/列表切换 (持久化 key alarm_view_mode_gas)
import AlarmViewToggle from '@/components/alarm/AlarmViewToggle.vue'
// [场景页对齐 2026-09-11] 列表主体统一共享面板 (不复制 AlarmsView 表格)
import AlarmEventsPanel from '@/components/alarm/AlarmEventsPanel.vue'
// [FIX realtime-push 2026-09-06] 场景页实时刷新: WS 告警到达去抖重拉 (零新增连接)
useRealtimeAlarmEvents(() => fetchEvents())

const SCENE_TAG = 'gas_station'

const loading = ref(false)
const selectedType = ref('')
const typeItems = ref<EventTypeMetadataItem[]>([])

const events = ref<AlarmEvent[]>([])
const page = ref(1)
const pageSize = ref(20)

// 卡片/列表视图 (持久化 key alarm_view_mode_gas, 与 AlarmViewToggle 同规范)
const viewMode = ref<'card' | 'table'>(
  localStorage.getItem('alarm_view_mode_gas') === 'card' ? 'card' : 'table'
)

const typeChips = computed(() => typeItems.value)
const activeTypeKeys = computed(() => new Set(typeItems.value.map(i => i.alarm_type)))

function chipClass(alarmType: string) {
  if (alarmType.includes('gas_leak') || alarmType.includes('smoke')) return 'chip-red'
  return ''
}

const filteredEvents = computed(() => {
  const keys = activeTypeKeys.value
  let base = events.value
  if (keys.size !== 0) base = base.filter(a => keys.has(String(a.type)))
  // 设备树筛选 (左侧面板勾选集合命中判定; 空集不筛)
  if (treeSel.value) base = base.filter(hitTree)
  return base
})

// 设备树筛选状态 (与 AlarmsView 同款命中判定)
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
    const res = await eventTypesApi.metadata({ scene: SCENE_TAG })
    const data = res.data?.data
    const items: EventTypeMetadataItem[] = []
    for (const g of Object.values(data?.groups ?? {})) items.push(...(g?.items ?? []))
    typeItems.value = items
  } catch {
    typeItems.value = []
  }
}

async function fetchEvents() {
  loading.value = true
  try {
    // [t3-tree-channel 2026-09-11] 三级树服务端下钻 (见 useAlarmTreeDrill 头注):
    //   勾选激活时 channel_id 服务端过滤 — 单值直传 / 多值 fan-out 合并
    //   (后端参数单值 + pageSize clamp 100; scene 与 channel_id 实测 AND 叠加有效)
    const drill = treeSel.value?.drillValues ?? []
    if (drill.length > 1) {
      events.value = await fetchAlarmDrillFanout(drill, async (v) => {
        const r = await alarmApi.getList({ page: 1, pageSize: 100, scene: SCENE_TAG, channel_id: v })
        return ((r.data?.data as unknown as { items?: unknown[] })?.items ?? []).map(e => normalizeAlarmCompat(e))
      })
      return
    }
    // 场景过滤下沉服务端 (scene=gas_station, 与 scene_tags 登记自动同步)
    const params: Record<string, unknown> = { page: 1, pageSize: 500, scene: SCENE_TAG }
    if (drill.length === 1) params.channel_id = drill[0]
    const res = await alarmApi.getList(params)
    events.value =
      ((res.data?.data as unknown as { items?: unknown[] })?.items ?? []).map(e => normalizeAlarmCompat(e))
  } catch {
    events.value = []
  } finally {
    loading.value = false
  }
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
.gas-events-page { padding: 4px 0; display: flex; gap: 12px; align-items: flex-start; }
.gas-events-main { flex: 1; min-width: 0; }
.filter-card { margin-bottom: 16px; }
.scene-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.bar-label { font-size: 13px; font-weight: 600; }
.bar-count { font-size: 12px; color: var(--el-color-success); margin-left: auto; }
.type-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.type-chips :deep(.el-check-tag) { height: 26px; padding: 0 10px; font-size: 12px; }
.type-chips :deep(.el-check-tag.is-checked.chip-red) { background: #f56c6c; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-right { display: flex; align-items: center; gap: 12px; }
</style>

<!-- [t3-tree-channel 2026-09-11 完成锚点] 三级树通道级服务端下钻(单值直传+多值 fan-out)批次 · 部署产物 entry=index-CvT0U9Nv4f.js tgz md5=07a2e26224ed93a40c47f987c04b7bb5 -->
