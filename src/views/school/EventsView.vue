<template>
  <div class="sch-events-page">
   <!-- [UI-4b 2026-09-10] 左侧设备树筛选面板 (统一规则: 设备列表居左/主内容居右) -->
   <AlarmDeviceTreePanel @selection-change="onTreeSelection" />

   <div class="sch-events-main">
    <!-- ===== 场景事件类型筛选 (SSOT metadata?scene=school_campus 动态拉取) ===== -->
    <el-card shadow="never" class="filter-card">
      <div class="scene-bar">
        <span class="bar-label">校园事件</span>
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

    <!-- ===== 事件表 ===== -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>校园事件列表</span>
          <div class="header-right">
            <span class="hint">critical 红 / high 橙 / medium 黄</span>
            <AlarmViewToggle v-model="viewMode" page-key="school" />
            <el-button size="small" :loading="loading" @click="refreshAll">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
          </div>
        </div>
      </template>
      <div v-if="viewMode === 'card'" class="events-card-grid">
        <AlarmCard v-for="e in pagedFinal" :key="e.id" :alarm="e" @click="openAlarmPopup(e)">
          <template #actions="{ alarm }">
            <el-button size="small" type="primary" link @click.stop="openAlarmPopup(alarm)">详情</el-button>
            <el-button size="small" type="success" link @click.stop="handleAlarmRow(alarm, 'confirmed', onHandled)">确认</el-button>
          </template>
        </AlarmCard>
      </div>
      <el-table v-else :data="pagedFinal" v-loading="loading" size="small"
                :empty-text="selectedType ? '该类型暂无事件' : '暂无校园相关事件'">
        <el-table-column label="类型" min-width="170">
          <template #default="{ row }">
            <div class="type-cell">
              <span class="evt-key">{{ row.type }}</span>
              <span class="evt-name">{{ typeName(row.type) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="110">
          <template #default="{ row }">
            <span class="level-tag" :class="levelClass(row)">{{ levelText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="置信度" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.confidence != null">{{ (row.confidence * 100).toFixed(0) }}%</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="channelId" label="通道" width="70" align="center" />
        <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="快照" width="70" align="center">
          <template #default="{ row }">
            <el-image v-if="row.snapshotUrl" :src="row.snapshotUrl"
                      :preview-src-list="[row.snapshotUrl]" fit="cover"
                      preview-teleported class="snap-thumb" @click.stop />
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="165">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click.stop="openAlarmPopup(row)">详情</el-button>
            <el-dropdown trigger="click" @command="(c: string) => handleAlarmRow(row, c as any, onHandled)">
              <el-button size="small" type="warning" link class="act-handle">
                处理<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="confirmed">确认告警</el-dropdown-item>
                  <el-dropdown-item command="false_alarm">标记误报</el-dropdown-item>
                  <el-dropdown-item command="ignored">忽略</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="finalEvents.length"
                       layout="total, prev, pager, next" background size="small" />
      </div>
    </el-card>
   </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 校园事件列表 — [UI-4b 2026-09-10]
 *
 * 事件类型筛选 chips 从 /event-types/metadata?scene=school_campus 动态拉取 (SSOT),
 * 表格: 类型/级别/置信度/通道/描述/快照/时间; 左侧 AlarmDeviceTreePanel (默认折叠)。
 * 数据源: alarmApi.getList scene 过滤下沉服务端 + normalizeAlarmCore 归一化。
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh, ArrowDown } from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import { normalizeAlarmCore, type AlarmEvent, type AlarmStatus } from '@/types/alarm'
import { useAlarmRowActions } from '@/composables/useAlarmRowActions'
import { useRealtimeAlarmEvents } from '@/composables/useRealtimeAlarmEvents'
// 左侧设备树筛选面板 (安保区域→子区域→设备 多选)
import AlarmDeviceTreePanel from '@/components/alarm/AlarmDeviceTreePanel.vue'
import type { AlarmTreeSelection } from '@/components/alarm/AlarmDeviceTreePanel.vue'
// 卡片/列表切换 + 告警卡片
import AlarmViewToggle from '@/components/alarm/AlarmViewToggle.vue'
import AlarmCard from '@/components/alarm/AlarmCard.vue'
// [FIX realtime-push 2026-09-06] 场景页实时刷新: WS 告警到达去抖重拉 (零新增连接)
useRealtimeAlarmEvents(() => fetchEvents())

const SCENE_TAG = 'school_campus'

const loading = ref(false)
const selectedType = ref('')
const typeItems = ref<EventTypeMetadataItem[]>([])

const events = ref<AlarmEvent[]>([])
const { openAlarmPopup, handleAlarmRow } = useAlarmRowActions()

/** 处理成功后行内回写状态 (与周界/安检同范式) */
function onHandled(id: string, status: string) {
  const row = events.value.find(e => e.id === id)
  if (row) row.status = status as AlarmStatus
}
const page = ref(1)
const pageSize = 20

// 卡片/列表视图 (持久化 key alarm_view_mode_school, 与 AlarmViewToggle 同规范)
const viewMode = ref<'card' | 'table'>(
  localStorage.getItem('alarm_view_mode_school') === 'card' ? 'card' : 'table'
)

const typeChips = computed(() => typeItems.value)
const activeTypeKeys = computed(() => new Set(typeItems.value.map(i => i.alarm_type)))

function chipClass(alarmType: string) {
  if (alarmType.includes('fire') || alarmType.includes('intrusion')) return 'chip-red'
  return ''
}

function typeName(alarmType: string) {
  return typeItems.value.find(i => i.alarm_type === alarmType)?.display_name ?? ''
}

// ── 级别色标: 通用 severity 映射 (critical 红 / high 橙 / medium 黄) ──
function levelClass(row: AlarmEvent) {
  const lv = String(row.level ?? '').toLowerCase()
  if (lv === 'critical') return 'lv-red'
  if (lv === 'high') return 'lv-orange'
  if (lv === 'medium') return 'lv-yellow'
  return 'lv-info'
}

function levelText(row: AlarmEvent) {
  const lv = String(row.level ?? '').toLowerCase()
  if (lv === 'critical') return '严重'
  if (lv === 'high') return '高'
  if (lv === 'medium') return '中'
  return String(row.level ?? '-')
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
  const start = (page.value - 1) * pageSize
  return finalEvents.value.slice(start, start + pageSize)
})

function formatTime(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

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
    // 场景过滤下沉服务端 (scene=school_campus, 与 scene_tags 登记自动同步)
    const res = await alarmApi.getList({ page: 1, pageSize: 500, scene: SCENE_TAG })
    events.value =
      ((res.data?.data as unknown as { items?: unknown[] })?.items ?? []).map(e => normalizeAlarmCore(e))
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
.sch-events-page { padding: 4px 0; display: flex; gap: 12px; align-items: flex-start; }
.sch-events-main { flex: 1; min-width: 0; }
.events-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.act-handle { margin-left: 8px; }
.filter-card { margin-bottom: 16px; }
.scene-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.bar-label { font-size: 13px; font-weight: 600; }
.bar-count { font-size: 12px; color: var(--el-color-success); margin-left: auto; }
.type-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.type-chips :deep(.el-check-tag) { height: 26px; padding: 0 10px; font-size: 12px; }
.type-chips :deep(.el-check-tag.is-checked.chip-red) { background: #f56c6c; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-right { display: flex; align-items: center; gap: 12px; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); }
.type-cell { display: flex; flex-direction: column; line-height: 1.4; }
.evt-key { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; color: var(--el-text-color-secondary); }
.evt-name { font-size: 12px; }
.level-tag { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 12px; color: #fff; }
.lv-yellow { background: #e9b90b; }
.lv-orange { background: #e6770c; }
.lv-red { background: #d93636; }
.lv-info { background: #909399; }
.snap-thumb { width: 48px; height: 36px; border-radius: 3px; cursor: pointer; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
