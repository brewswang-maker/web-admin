<template>
  <div class="le-events-page">
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

    <!-- ===== 事件表 ===== -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>事件告警列表</span>
          <div class="header-right">
            <span class="hint">黄色 / 橙色 / 红色分级 · stampede 深红</span>
            <el-button size="small" :loading="loading" @click="refreshAll">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
          </div>
        </div>
      </template>
      <el-table :data="pagedFinal" v-loading="loading" size="small"
                :empty-text="selectedType ? '该类型暂无事件' : '暂无大型活动相关事件'">
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
                      preview-teleported class="snap-thumb" />
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="165">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="finalEvents.length"
                       layout="total, prev, pager, next" background size="small" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 事件告警列表 — EventGuard T2.4 (方案任务 5.2)
 *
 * 事件类型筛选 chips 从 /event-types/metadata?scene=<四场景> 动态拉取 (SSOT),
 * 表格: 类型/级别/置信度/通道/描述/快照/时间, 级别色标 黄/橙/红 + stampede 深红。
 * 数据源: alarmApi.getList 前端按场景事件键并集过滤。
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import type { AlarmEvent } from '@/types/alarm'
import { LARGE_EVENT_SCENES, NEW_LARGE_EVENT_TYPES } from '@/types/largeEvent'

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
const pageSize = 20

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

function typeName(alarmType: string) {
  return activeItems.value.find(i => i.alarm_type === alarmType)?.display_name ?? ''
}

// ── 级别色标: 黄/橙/红/stampede 深红 ──
function levelClass(row: AlarmEvent) {
  const t = String(row.type)
  if (t === 'stampede_risk') return 'lv-stampede'
  if (t.endsWith('_red')) return 'lv-red'
  if (t.endsWith('_orange')) return 'lv-orange'
  if (t.endsWith('_yellow')) return 'lv-yellow'
  const lv = String(row.level).toLowerCase()
  if (lv === 'critical') return 'lv-red'
  if (lv === 'high') return 'lv-orange'
  if (lv === 'medium') return 'lv-yellow'
  return 'lv-info'
}

function levelText(row: AlarmEvent) {
  const t = String(row.type)
  if (t === 'stampede_risk') return '踩踏深红'
  if (t.endsWith('_red')) return '红色'
  if (t.endsWith('_orange')) return '橙色'
  if (t.endsWith('_yellow')) return '黄色'
  return String(row.level ?? '-')
}

const filteredEvents = computed(() => {
  const keys = activeTypeKeys.value
  const fallback = new Set<string>([...NEW_LARGE_EVENT_TYPES])
  const eff = keys.size > 0 ? keys : fallback
  return events.value.filter(a => eff.has(String(a.type)))
})

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
    const res = await alarmApi.getList({ page: 1, pageSize: 500 })
    events.value =
      (res.data?.data as unknown as { items?: AlarmEvent[] })?.items ?? []
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
.le-events-page { padding: 4px 0; }
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
.hint { font-size: 12px; color: var(--el-text-color-secondary); }
.type-cell { display: flex; flex-direction: column; line-height: 1.4; }
.evt-key { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; color: var(--el-text-color-secondary); }
.evt-name { font-size: 12px; }
.level-tag { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 12px; color: #fff; }
.lv-yellow { background: #e9b90b; }
.lv-orange { background: #e6770c; }
.lv-red { background: #d93636; }
.lv-stampede { background: #7f1d1d; font-weight: bold; }
.lv-info { background: #909399; }
.snap-thumb { width: 48px; height: 36px; border-radius: 3px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
