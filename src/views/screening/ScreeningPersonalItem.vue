<template>
  <div class="screening-personal-item">
    <!-- ===== 模型部署状态卡 (personal-item/status) ===== -->
    <el-card shadow="never" class="status-card">
      <template #header>
        <div class="card-header">
          <span>personal_item 模型部署状态</span>
          <el-button size="small" :loading="statusLoading" @click="loadStatus">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>

      <!-- 正常展示: 平铺字段网格 -->
      <div v-if="status" class="status-grid">
        <div class="status-cell">
          <div class="cell-label">插件注册</div>
          <div class="cell-value">
            <el-tag :type="status.algo_registered ? 'success' : 'danger'" effect="light">
              {{ status.algo_registered ? '已注册' : '未注册' }}
            </el-tag>
          </div>
        </div>
        <div class="status-cell">
          <div class="cell-label">模型状态</div>
          <div class="cell-value">
            <el-tag :type="modelStatusTag" effect="dark">{{ modelStatusText }}</el-tag>
            <span v-if="status.model_is_fallback" class="cell-sub warn">(回退通用模型)</span>
          </div>
        </div>
        <div class="status-cell">
          <div class="cell-label">模型文件</div>
          <div class="cell-value file-cell">
            <span v-if="status.model_size_bytes > 0" class="val-blue">{{ formatBytes(status.model_size_bytes) }}</span>
            <el-tag v-else-if="status.model_size_bytes === 0" type="warning" effect="light">未部署</el-tag>
            <el-tag v-else type="danger" effect="light">stat 失败</el-tag>
            <span class="file-name" :title="status.model_path">{{ status.model_actual_file || '-' }}</span>
          </div>
        </div>
        <div class="status-cell">
          <div class="cell-label">采样时间</div>
          <div class="cell-value">
            <span :class="freshnessClass">{{ formatTime(status.checked_at) }}</span>
            <span class="cell-sub">{{ freshnessText }}</span>
          </div>
        </div>
      </div>

      <!-- 近 24h 三态事件计数 -->
      <div v-if="status && status.event_counts_24h" class="counts-row">
        <span class="counts-label">近 24h 事件:</span>
        <el-tag v-for="(v, k) in status.event_counts_24h" :key="k" size="small" effect="plain" class="count-tag">
          {{ typeName(String(k)) }} · {{ v }}
        </el-tag>
        <span v-if="Object.keys(status.event_counts_24h).length === 0" class="counts-empty">无</span>
      </div>

      <!-- 降级: 端点 404 (固件版本差异) -->
      <el-result v-else-if="statusNotFound" icon="info" title="当前固件暂不支持该端点"
                 sub-title="GET /api/v1/algo/personal-item/status 返回 404 — 设备后端版本落后于本地 box-sdk 代码, 升级 smartgateway 固件后此卡片自动恢复展示。" />
      <!-- 降级: 其他错误 -->
      <el-result v-else-if="statusError" icon="warning" title="模型状态 API 失败"
                 :sub-title="statusError">
        <template #extra>
          <el-button type="primary" size="small" @click="loadStatus">重试</el-button>
        </template>
      </el-result>
    </el-card>

    <!-- ===== 三态机制说明 (SSOT: personal_item_detector.h L18-21) ===== -->
    <el-card shadow="never" class="threestate-card">
      <template #header>
        <div class="card-header">
          <span>人包三态机制</span>
          <span class="hint">SSOT: person_with_backpack / unattended_baggage / abandoned</span>
        </div>
      </template>
      <el-row :gutter="14">
        <el-col :span="8" v-for="phase in phases" :key="phase.eventKey">
          <div class="phase-tile" :class="phase.cls">
            <div class="phase-head">
              <span class="phase-level">{{ phase.levelText }}</span>
              <el-tag size="small" :type="phase.tagType" effect="light">severity {{ phase.severity }}</el-tag>
            </div>
            <div class="phase-label">{{ phase.label }}</div>
            <div class="phase-event">
              <span class="evt-key">{{ phase.eventKey }}</span>
            </div>
            <div class="phase-time">
              <template v-if="phase.thresholdKey">
                ≥ {{ thresholdOf(phase.thresholdKey) }}s
                <span class="th-source">{{ thresholdSource(phase.thresholdKey) }}</span>
              </template>
              <template v-else>携带确认即通知</template>
            </div>
            <div class="phase-desc">{{ phase.desc }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- ===== 最近人包事件流 ===== -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>最近人包事件 (三态并集)</span>
          <div class="header-right">
            <span class="hint">{{ targetKeys.join(' / ') }}</span>
            <el-button size="small" :loading="loading" @click="loadEvents">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
          </div>
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
 * 模型部署状态卡 (personal-item/status 平铺结构) + 三态机制 + 事件流
 *
 * [FIX 2026-08-28]
 *   - URL 双前缀 404 修复 (screening.ts 已改为相对路径)
 *   - 响应结构对齐: data 直接为平铺 PersonalItemStatus (无 status 嵌套)
 *   - 三态阈值从后端 config 动态读取 (unattended_alarm_seconds /
 *     abandoned_alarm_seconds), 不再硬编码 30/70/90 (那是 severity 刻度)
 *   - 事件流筛选三态 SSOT 键: person_with_backpack / unattended_baggage / abandoned
 *   - 404 / 网络错误优雅降级, 不再裸报错
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import { screeningApi } from '@/api/screening'
import type { PersonalItemStatus, PersonalItemConfig } from '@/api/screening'
import eventTypesApi from '@/api/eventTypes'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'

// ── 三态 SSOT 定义 (personal_item_detector.h L18-21) ──
// severity 为告警级别刻度 (NOTIFICATION 30 / ALARM 70 / ALARM 90),
// 时间阈值从后端 config 动态读取, 缺省 30s / 120s。

interface PhaseDef {
  eventKey: string
  label: string
  levelText: string
  severity: number
  tagType: 'info' | 'warning' | 'danger'
  cls: string
  /** 对应 config 阈值键 (字面量联合, 避免 keyof 因索引签名拓宽为 string|number) */
  thresholdKey?: 'unattended_alarm_seconds' | 'abandoned_alarm_seconds' | 'owner_lost_seconds'
  desc: string
}

const phases: PhaseDef[] = [
  {
    eventKey: 'person_with_backpack', label: '携带确认', levelText: '态 1 · 信息',
    severity: 30, tagType: 'info', cls: 'phase-blue',
    desc: 'PERSON_WITH_BAGGAGE — 检测到人员携带背包/箱包时轻量通知 (防推送风暴, 不推 APP/不录像)',
  },
  {
    eventKey: 'unattended_baggage', label: '无人看管', levelText: '态 2 · 告警',
    severity: 70, tagType: 'warning', cls: 'phase-orange',
    thresholdKey: 'unattended_alarm_seconds',
    desc: 'UNATTENDED_BAGGAGE — 主人离开累计超过阈值, 告警 + 通知安保; 主人回归自动恢复携带态',
  },
  {
    eventKey: 'abandoned', label: '持续遗留', levelText: '态 3 · 告警',
    severity: 90, tagType: 'danger', cls: 'phase-red',
    thresholdKey: 'abandoned_alarm_seconds',
    desc: 'ABANDONED_OBJECT — 物品无主静止超过阈值 (复用存量事件键), 高级别告警 + 联动录像',
  },
]

/** 三态事件键并集 (事件流筛选) */
const targetKeys = phases.map(p => p.eventKey)

// ── 模型部署状态 (平铺解析 + 降级) ──

const status = ref<PersonalItemStatus | null>(null)
const statusLoading = ref(false)
const statusError = ref('')
const statusNotFound = ref(false)

async function loadStatus() {
  statusLoading.value = true
  statusError.value = ''
  statusNotFound.value = false
  try {
    const resp = await screeningApi.getPersonalItemStatus()
    const data = resp.data?.data
    if (data && typeof data === 'object' && 'algo_id' in data) {
      status.value = data
    } else {
      statusError.value = '响应格式异常: 未识别的 personal-item/status 数据结构'
    }
  } catch (e: unknown) {
    status.value = null
    const err = e as { code?: number; message?: string }
    if (err?.code === 404) {
      statusNotFound.value = true
    } else {
      statusError.value = `${err?.message || String(e)} (code=${err?.code ?? 'network'})`
    }
    console.error('[ScreeningPersonalItem] status failed', e)
  } finally {
    statusLoading.value = false
  }
}

const modelStatusTag = computed(() => {
  switch (status.value?.model_status) {
    case 'dedicated': return 'success'
    case 'fallback': return 'warning'
    case 'missing': return 'danger'
    default: return 'info'
  }
})
const modelStatusText = computed(() => {
  switch (status.value?.model_status) {
    case 'dedicated': return '✓ 专属模型'
    case 'fallback': return '⇄ 回退通用模型'
    case 'missing': return '✗ 未部署'
    default: return String(status.value?.model_status ?? '?')
  }
})

/** 从运行时 config 读三态阈值 (缺省用插件默认: unattended=30 / abandoned=120) */
const DEFAULT_THRESHOLDS: Record<string, number> = {
  unattended_alarm_seconds: 30,
  abandoned_alarm_seconds: 120,
}
function thresholdOf(key: string): number {
  const runtime = (status.value?.config as Record<string, unknown> | undefined)?.[key]
  if (typeof runtime === 'number') return runtime
  return DEFAULT_THRESHOLDS[key] ?? 0
}
/** 标注阈值来源: 运行时配置 / 插件默认 */
function thresholdSource(key: string): string {
  const runtime = (status.value?.config as Record<string, unknown> | undefined)?.[key]
  return typeof runtime === 'number' ? '(config)' : '(默认)'
}

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

// ── 事件类型名 (SSOT metadata) ──

const screeningEventTypes = ref<EventTypeMetadataItem[]>([])
const typeMap = computed(() => {
  const m: Record<string, string> = {}
  screeningEventTypes.value.forEach(t => { m[t.alarm_type] = t.display_name })
  return m
})
function typeName(key: string): string {
  return typeMap.value[key] || key
}

// ── 事件流 (三态键并集筛选) ──

const events = ref<AlarmEvent[]>([])
const listLimit = ref(20)
const loading = ref(false)
const displayedEvents = computed(() => events.value.slice(0, listLimit.value))

async function loadEvents() {
  loading.value = true
  try {
    const resp = await alarmApi.getList({ page: 1, pageSize: 100 })
    const all = resp.data?.data?.items || []
    const keys = new Set(targetKeys)
    events.value = all.filter((e: AlarmEvent) => keys.has(e.type))
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
function levelClass(level: AlarmLevel): string {
  switch (level) {
    case 'critical': return 'lv-crit'
    case 'high': return 'lv-high'
    case 'medium': return 'lv-med'
    case 'low': return 'lv-low'
    default: return 'lv-info'
  }
}
function levelText(level: AlarmLevel): string {
  return level.toUpperCase()
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
.cell-sub.warn { color: #e6a23c; }
.file-cell { display: flex; flex-direction: column; gap: 2px; }
.file-name { color: #909399; font-size: 12px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.val-green { color: #67c23a; }
.val-orange { color: #e6a23c; }
.val-gray { color: #909399; }
.counts-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px dashed #ebeef5; }
.counts-label { color: #909399; font-size: 13px; }
.count-tag { font-family: monospace; }
.counts-empty { color: #c0c4cc; font-size: 12px; }

.threestate-card { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header .header-right { display: flex; gap: 12px; align-items: center; }
.card-header .hint { color: #909399; font-size: 12px; }
.phase-tile { padding: 14px; border-radius: 6px; border: 1px solid; margin-bottom: 8px; }
.phase-tile.phase-blue { background: #ecf5ff; border-color: #d9ecff; }
.phase-tile.phase-orange { background: #fdf6ec; border-color: #faecd8; }
.phase-tile.phase-red { background: #fef0f0; border-color: #fde2e2; }
.phase-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.phase-level { color: #909399; font-size: 12px; }
.phase-label { font-weight: 500; margin: 2px 0; font-size: 15px; }
.phase-event { margin: 4px 0; }
.phase-event .evt-key { font-family: monospace; font-size: 12px; color: #606266; background: rgba(255,255,255,.6); padding: 1px 6px; border-radius: 3px; }
.phase-time { color: #f56c6c; font-size: 13px; margin: 6px 0; font-weight: 500; }
.th-source { color: #909399; font-size: 11px; font-weight: normal; margin-left: 4px; }
.phase-desc { font-size: 12px; color: #606266; line-height: 1.5; }

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
