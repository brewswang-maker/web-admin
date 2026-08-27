<template>
  <div class="screening-personal-item">
    <!-- ===== 模型部署状态卡 (新 API) ===== -->
    <el-card shadow="never" class="status-card">
      <template #header>
        <div class="card-header">
          <span>personal_item 模型部署状态</span>
          <el-button size="small" :loading="statusLoading" @click="loadStatus">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>
      <div v-if="status" class="status-grid">
        <div class="status-cell">
          <div class="cell-label">插件注册</div>
          <div class="cell-value">
            <el-tag :type="status.registered ? 'success' : 'danger'" effect="light">
              {{ status.registered ? '已注册' : '未注册' }}
            </el-tag>
          </div>
        </div>
        <div class="status-cell">
          <div class="cell-label">模型文件</div>
          <div class="cell-value">
            <span v-if="status.model_size_bytes > 0" class="val-blue">
              {{ formatBytes(status.model_size_bytes) }}
            </span>
            <el-tag v-else-if="status.model_size_bytes === 0" type="warning" effect="light">
              未部署
            </el-tag>
            <el-tag v-else type="danger" effect="light">stat 失败</el-tag>
          </div>
        </div>
        <div class="status-cell">
          <div class="cell-label">采样时间</div>
          <div class="cell-value">
            <span :class="freshnessClass">{{ formatTime(status.checked_at) }}</span>
            <span class="cell-sub">{{ freshnessText }}</span>
          </div>
        </div>
        <div class="status-cell">
          <div class="cell-label">当前状态</div>
          <div class="cell-value">
            <el-tag :type="stateTag" effect="dark">{{ stateText }}</el-tag>
          </div>
        </div>
      </div>
      <el-alert v-else-if="statusError" type="error" :title="statusError" :closable="false" />
    </el-card>

    <!-- ===== 三态机制说明 ===== -->
    <el-card shadow="never" class="threestate-card">
      <template #header>
        <div class="card-header">
          <span>人包三态机制</span>
          <span class="hint">Phase 2 personal_item 插件 · 30/70/90s</span>
        </div>
      </template>
      <el-row :gutter="14">
        <el-col :span="8" v-for="(phase, idx) in phases" :key="phase.label">
          <div class="phase-tile" :class="phase.cls">
            <div class="phase-num">阶段 {{ idx + 1 }}</div>
            <div class="phase-label">{{ phase.label }}</div>
            <div class="phase-time">≥ {{ phase.threshold }}s</div>
            <div class="phase-desc">{{ phase.desc }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- ===== 最近人包事件流 ===== -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>最近人包事件 (person_with_backpack / unattended_baggage)</span>
          <el-button size="small" :loading="loading" @click="loadEvents">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>
      <el-table :data="displayedEvents" v-loading="loading" size="small"
                :empty-text="loading ? '加载中…' : '暂无人包事件'">
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
        <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip />
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
      <div class="pager" v-if="events.length > listLimit">
        <el-button size="small" :disabled="listLimit >= events.length" @click="loadMore">
          加载更多 ({{ events.length - listLimit }})
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 人包核验 — Screening Phase 2 S1-3 + S1-4
 * 模型部署状态卡 (personal-item/status API) + 三态机制 + 事件流
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import { screeningApi } from '@/api/screening'
import eventTypesApi from '@/api/eventTypes'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import type { AlarmEvent } from '@/types/alarm'
import type { PersonalItemStatus } from '@/api/screening'

// ── 三态阶段说明 ──

const phases = [
  {
    label: 'missing 临时离开',
    threshold: 30,
    desc: '人/包分离 ≤30s 视为临时离开, 不告警',
    cls: 'phase-yellow',
  },
  {
    label: 'unattended 无人看管',
    threshold: 70,
    desc: '70s 内无人认领, 黄色告警 + 通知安保',
    cls: 'phase-orange',
  },
  {
    label: 'dedicated 持续遗留',
    threshold: 90,
    desc: '90s 仍未认领, 红色告警 + 联动闸机/录像',
    cls: 'phase-red',
  },
]

// ── 模型部署状态 ──

const status = ref<PersonalItemStatus | null>(null)
const statusLoading = ref(false)
const statusError = ref('')

async function loadStatus() {
  statusLoading.value = true
  statusError.value = ''
  try {
    const resp = await screeningApi.getPersonalItemStatus()
    const data = resp.data?.data?.status
    if (data) {
      status.value = data
    } else {
      statusError.value = '响应格式异常, 未拿到 status 字段'
    }
  } catch (e: unknown) {
    const err = e as { message?: string }
    statusError.value = `模型状态 API 失败: ${err.message || String(e)}`
    console.error('[ScreeningPersonalItem] status failed', e)
  } finally {
    statusLoading.value = false
  }
}

const stateTag = computed(() => {
  switch (status.value?.state) {
    case 'ok': return 'success'
    case 'missing': return 'info'
    case 'dedicated': return 'danger'
    case 'mixed': return 'warning'
    default: return 'info'
  }
})
const stateText = computed(() => {
  switch (status.value?.state) {
    case 'ok': return '✓ 正常'
    case 'missing': return '⏱ 临时离开'
    case 'dedicated': return '⚠ 持续遗留'
    case 'mixed': return '⇄ 多目标混合'
    default: return '? 未知'
  }
})
const freshnessClass = computed(() => {
  if (!status.value?.checked_at) return 'val-gray'
  const ageMin = (Date.now() - new Date(status.value.checked_at).getTime()) / 60000
  if (ageMin < 5) return 'val-green'
  if (ageMin < 60) return 'val-blue'
  return 'val-orange'
})
const freshnessText = computed(() => {
  if (!status.value?.checked_at) return ''
  const ageMin = (Date.now() - new Date(status.value.checked_at).getTime()) / 60000
  if (ageMin < 1) return '刚刚'
  if (ageMin < 60) return `${Math.round(ageMin)} 分钟前`
  return `${Math.round(ageMin / 60)} 小时前`
})

// ── 事件流 ──

const events = ref<AlarmEvent[]>([])
const listLimit = ref(20)
const loading = ref(false)
const displayedEvents = computed(() => events.value.slice(0, listLimit.value))

const screeningEventTypes = ref<EventTypeMetadataItem[]>([])
const typeMap = computed(() => {
  const m: Record<string, string> = {}
  screeningEventTypes.value.forEach(t => { m[t.alarm_type] = t.display_name })
  return m
})
function typeName(key: string): string {
  return typeMap.value[key] || key
}

async function loadEvents() {
  loading.value = true
  try {
    const resp = await alarmApi.getList({ page: 1, pageSize: 100 })
    const all = resp.data?.data?.items || []
    const targetKeys = new Set(['person_with_backpack', 'unattended_baggage'])
    const sceneKeys = new Set(screeningEventTypes.value.map(t => t.alarm_type))
    events.value = all.filter((e: AlarmEvent) =>
      sceneKeys.has(e.type) && targetKeys.has(e.type)
    )
  } catch (e) {
    console.error('[ScreeningPersonalItem] load events failed', e)
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
    console.error('[ScreeningPersonalItem] load scene types failed', e)
  }
}

function loadMore() { listLimit.value = Math.min(listLimit.value + 20, events.value.length) }

// ── 工具 ──

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
function formatTime(input: string | number | undefined): string {
  if (!input) return '-'
  const d = new Date(input)
  if (isNaN(d.getTime())) return String(input)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
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

onMounted(async () => {
  await Promise.all([loadSceneTypes(), loadStatus(), loadEvents()])
})
</script>

<style scoped>
.screening-personal-item { padding: 16px; }
.status-card { margin-bottom: 16px; }
.status-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.status-cell { background: #fafbfc; padding: 12px; border-radius: 6px; }
.cell-label { color: #909399; font-size: 12px; margin-bottom: 6px; }
.cell-value { font-size: 16px; font-weight: 500; }
.cell-value .val-blue { color: #1890ff; }
.cell-sub { color: #909399; font-size: 12px; margin-left: 8px; }
.val-green { color: #67c23a; }
.val-orange { color: #e6a23c; }
.val-gray { color: #909399; }

.threestate-card { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header .hint { color: #909399; font-size: 12px; }
.phase-tile { padding: 14px; border-radius: 6px; border: 1px solid; margin-bottom: 8px; }
.phase-tile.phase-yellow { background: #fdf6ec; border-color: #faecd8; }
.phase-tile.phase-orange { background: #fef0e6; border-color: #fbd9b3; }
.phase-tile.phase-red { background: #fef0f0; border-color: #fde2e2; }
.phase-num { font-size: 12px; color: #909399; }
.phase-label { font-weight: 500; margin: 4px 0; }
.phase-time { color: #f56c6c; font-size: 13px; margin-bottom: 6px; }
.phase-desc { font-size: 12px; color: #606266; }

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