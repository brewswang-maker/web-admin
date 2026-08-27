<template>
  <div class="screening-channels">
    <!-- ===== 事件类型筛选 chips ===== -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <span class="bar-label">事件类型</span>
        <el-radio-group v-model="selectedType" size="small" @change="resetList">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button v-for="t in orderTypes" :key="t.key" :label="t.key">
            {{ t.label }}
          </el-radio-button>
        </el-radio-group>
        <span class="bar-count" v-if="selectedEvents.length > 0">
          共 {{ selectedEvents.length }} 条 · 展示 {{ displayedEvents.length }}
        </span>
      </div>
    </el-card>

    <!-- ===== 事件表 (复用 AlarmsView 风格) ===== -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>通道事件 · 候检 + 闸机 + 秩序</span>
          <div class="header-right">
            <span class="hint">运行/摔倒/打架/聚集/尾随/翻越/越界/徘徊/排队/密度</span>
            <el-button size="small" :loading="loading" @click="loadEvents">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
          </div>
        </div>
      </template>
      <el-table :data="displayedEvents" v-loading="loading" size="small"
                :empty-text="loading ? '加载中…' : '暂无通道秩序事件'">
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
            <span class="level-tag" :class="levelClass(row.level)">{{ levelText(row.level) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="channelId" label="通道" width="80" align="center" />
        <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="快照" width="80" align="center">
          <template #default="{ row }">
            <el-image v-if="row.snapshotUrl" :src="row.snapshotUrl"
                      :preview-src-list="[row.snapshotUrl]" fit="cover"
                      preview-teleported class="snap-thumb" />
            <template v-else><div class="snap-error">无快照</div></template>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager" v-if="selectedEvents.length > listLimit">
        <el-button size="small" :disabled="listLimit >= selectedEvents.length" @click="loadMore">
          加载更多 ({{ selectedEvents.length - listLimit }})
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 通道秩序 — Screening Phase 2 S1-4
 * 候检区 + 通道闸机事件流, 事件类型 chips 筛选
 * 复用 AlarmsView 表格交互模式 (大型分类事件流展示)
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import type { AlarmEvent } from '@/types/alarm'

// ── 候检 + 通道秩序事件类型 (方案 §4 分区 B + C) ──

const orderTypes = [
  { key: 'running', label: '奔跑' },
  { key: 'fall_detected', label: '摔倒' },
  { key: 'fighting', label: '打架' },
  { key: 'gathering', label: '聚集' },
  { key: 'tailgate', label: '尾随' },
  { key: 'climbing', label: '翻越' },
  { key: 'intrusion', label: '越界' },
  { key: 'tripwire', label: '绊线' },
  { key: 'loitering', label: '徘徊' },
  { key: 'queue_length_abnormal', label: '排队异常' },
  { key: 'density_abnormal', label: '密度异常' },
]

const screeningEventTypes = ref<EventTypeMetadataItem[]>([])
const typeMap = computed(() => {
  const m: Record<string, string> = {}
  screeningEventTypes.value.forEach(t => { m[t.alarm_type] = t.display_name })
  return m
})
function typeName(key: string): string {
  return typeMap.value[key] || key
}

// ── 事件流 ──

const events = ref<AlarmEvent[]>([])
const selectedType = ref('')
const listLimit = ref(20)
const loading = ref(false)

const orderTypeKeys = new Set(orderTypes.map(t => t.key))
const filteredByScene = computed(() => {
  const screeningKeys = new Set(screeningEventTypes.value.map(t => t.alarm_type))
  return events.value.filter(e => screeningKeys.has(e.type) && orderTypeKeys.has(e.type))
})
const selectedEvents = computed(() =>
  selectedType.value
    ? filteredByScene.value.filter(e => e.type === selectedType.value)
    : filteredByScene.value
)
const displayedEvents = computed(() => selectedEvents.value.slice(0, listLimit.value))

async function loadEvents() {
  loading.value = true
  try {
    const resp = await alarmApi.getList({ page: 1, pageSize: 200 })
    const all = resp.data?.data?.items || []
    events.value = all
  } catch (e) {
    console.error('[ScreeningChannelOrder] load events failed', e)
    events.value = []
  } finally {
    loading.value = false
  }
}

async function loadSceneTypes() {
  try {
    const resp = await eventTypesApi.metadata({ scene: 'security_screening' })
    const data = resp.data?.data
    if (data && data.groups) {
      const items: EventTypeMetadataItem[] = []
      Object.values(data.groups).forEach(g => g.items.forEach(i => items.push(i)))
      screeningEventTypes.value = items
    }
  } catch (e) {
    console.error('[ScreeningChannelOrder] load scene types failed', e)
  }
}

function resetList() { listLimit.value = 20 }
function loadMore() { listLimit.value = Math.min(listLimit.value + 20, selectedEvents.value.length) }

// ── 工具 ──

function levelClass(level?: number): string {
  switch (level) {
    case 5: return 'lv-crit'
    case 4: return 'lv-high'
    case 3: return 'lv-med'
    case 2: return 'lv-low'
    default: return 'lv-info'
  }
}
function levelText(level?: number): string {
  return ['', 'INFO', 'LOW', 'MED', 'HIGH', 'CRITICAL'][level ?? 0] || '-'
}
function formatTime(ts?: number): string {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(async () => {
  await loadSceneTypes()
  await loadEvents()
})
</script>

<style scoped>
.screening-channels { padding: 16px; }
.filter-card { margin-bottom: 16px; }
.filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bar-label { color: #909399; font-size: 13px; flex-shrink: 0; }
.bar-count { color: #909399; font-size: 12px; margin-left: auto; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header .header-right { display: flex; gap: 12px; align-items: center; }
.card-header .hint { color: #909399; font-size: 12px; }
.type-cell { display: flex; flex-direction: column; }
.evt-key { color: #909399; font-family: monospace; font-size: 12px; }
.evt-name { color: #303133; }
.level-tag { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.lv-crit { background: #fef0f0; color: #f56c6c; }
.lv-high { background: #fdf6ec; color: #e6a23c; }
.lv-med { background: #ecf5ff; color: #1890ff; }
.lv-low { background: #f0f9eb; color: #67c23a; }
.lv-info { background: #f4f4f5; color: #909399; }
.snap-thumb { width: 50px; height: 32px; border-radius: 4px; }
.snap-error { color: #c0c4cc; font-size: 12px; padding: 4px 8px; background: #f5f7fa; border-radius: 4px; }
.pager { text-align: center; padding: 12px 0 0; }
</style>