<template>
  <div class="vp-events-page">
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
                   :placeholder="t('perimeter.events.allLevels')" @change="page = 1">
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
        <el-button :icon="Refresh" :loading="loading" @click="reload">{{ t('common.refresh') }}</el-button>
      </div>
    </div>

    <!-- ===== 错误态 ===== -->
    <el-result v-if="loadError" icon="warning" :title="t('perimeter.events.loadFailed')" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">{{ t('common.retry') }}</el-button>
      </template>
    </el-result>

    <!-- ===== 骨架屏 ===== -->
    <el-card v-else-if="loading && events.length === 0">
      <el-skeleton :rows="8" animated />
    </el-card>

    <!-- ===== 空态 ===== -->
    <el-empty v-else-if="filtered.length === 0" :description="t('perimeter.events.empty')" />

    <!-- ===== 事件表格 (前端分页) ===== -->
    <el-table v-else :data="paged" size="default" @row-click="openDetail" class="events-table">
      <el-table-column :label="t('perimeter.events.colLevel')" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="levelTagType(row.level)" size="small" effect="dark">{{ levelText(row.level) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('perimeter.events.colType')" width="150">
        <template #default="{ row }">
          <!-- [UX 2026-09-02] 中文名展示 (SSOT canonical), tooltip 保留裸 key 便于检索 -->
          <el-tooltip :content="row.type" placement="top" :disabled="zh(row.type) === row.type">
            <span class="type-cell">{{ zh(row.type) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="description" :label="t('perimeter.events.colDesc')" min-width="240" show-overflow-tooltip />
      <el-table-column prop="channelName" :label="t('perimeter.events.colChannel')" width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.channelName || row.channelId }}</template>
      </el-table-column>
      <el-table-column :label="t('perimeter.events.colConfidence')" width="110" align="center">
        <template #default="{ row }">{{ pct(row.confidence) }}</template>
      </el-table-column>
      <el-table-column :label="t('perimeter.events.colAiReview')" width="120" align="center">
        <template #default="{ row }">
          <el-tooltip v-if="aiReviewOf(row)" :content="row.aiConclusion" placement="top">
            <el-tag :type="aiReviewTagType(row)" size="small" effect="plain">{{ aiReviewOf(row) }}</el-tag>
          </el-tooltip>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('perimeter.events.colStatus')" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" :label="t('perimeter.events.colTime')" width="170">
        <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
      </el-table-column>
      <!-- [行操作 2026-09-01] 详情=全局报警弹窗 (与告警中心/首页同一套), 处理=
        确认/误报/忽略 (对齐 AlarmsView handleFalse/handleIgnore 范式) —
        用户决策: 未处理入口与报警处置一体化, 其他场景事件列表同款 -->
      <el-table-column :label="t('perimeter.events.colActions')" width="150" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click.stop="openAlarmPopup(row)">{{ t('common.detail') }}</el-button>
          <el-dropdown trigger="click" @command="(c: string) => handleAlarmRow(row, c as any, onHandled)">
            <el-button size="small" type="warning" link class="act-handle">
              {{ t('perimeter.events.actHandle') }}<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="confirmed">{{ t('common.confirm') }}</el-dropdown-item>
                <el-dropdown-item command="false_alarm">{{ t('perimeter.events.actFalseAlarm') }}</el-dropdown-item>
                <el-dropdown-item command="ignored">{{ t('perimeter.events.actIgnore') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <!-- ===== 分页 (筛选/搜索变化自动重置页码) ===== -->
    <div v-if="filtered.length > 0" class="events-pager">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize"
        :total="filtered.length" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next"
        background size="small" />
    </div>

    <!-- ===== 详情抽屉 (抓拍 + 元数据) ===== -->
    <el-drawer v-model="drawerVisible" :title="t('perimeter.events.detailTitle')" size="480px">
      <template v-if="active">
        <!-- [fix 2026-09-01 真机探针] 渲染条件扩为 有快照 || 有 bbox: 融合等
             程序化告警无快照但标注数据在位, 占位底+overlay 仍可定位目标 -->
        <SnapshotAnnotated v-if="active.snapshotUrl || hasBox(active.metadata)"
                           :src="active.snapshotUrl ?? ''" :metadata="active.metadata" />
        <el-empty v-else :description="t('perimeter.events.noSnapshot')" :image-size="80" />

        <el-descriptions :column="1" border size="small" class="detail-desc">
          <el-descriptions-item :label="t('perimeter.events.colType')">
            <span :title="active.type">{{ zh(active.type) }}</span>
          </el-descriptions-item>
          <el-descriptions-item :label="t('perimeter.events.colDesc')">{{ active.description }}</el-descriptions-item>
          <el-descriptions-item :label="t('perimeter.events.colChannel')">
            {{ active.channelName || active.channelId }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('perimeter.events.colConfidence')">{{ pct(active.confidence) }}</el-descriptions-item>
          <el-descriptions-item :label="t('perimeter.events.colStatus')">{{ statusText(active.status) }}</el-descriptions-item>
          <el-descriptions-item v-if="active.aiConclusion" :label="t('perimeter.events.aiConclusion')">
            {{ active.aiConclusion }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('perimeter.events.colTime')">{{ fmtTime(active.createdAt) }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 视频周界 — 事件检索 (vp 轮 2026-08-31, 方案 docs/plans/video-perimeter-solution-v1.0.md §6)
 * /api/v1/alarms 拉取 → PERIMETER_EVENT_TYPES 并集过滤 → severity 分档 + 抓拍详情。
 * 范式对齐 hotel-unattended 视图 (防御式解包, i18n 三语言)。
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, ArrowDown, Search } from '@element-plus/icons-vue'
import { useDebounceFn } from '@vueuse/core'
import { videoPerimeterApi, isPerimeterEvent } from '@/api/videoPerimeter'
import { normalizeAlarmCore, type AlarmEvent, type AlarmLevel, type AlarmStatus } from '@/types/alarm'
import { useAlarmRowActions } from '@/composables/useAlarmRowActions'
import { useEventTypeZh } from '@/composables/useEventTypeZh'
import SnapshotAnnotated from './SnapshotAnnotated.vue'

const { t } = useI18n()
const { openAlarmPopup, handleAlarmRow } = useAlarmRowActions()
const { zh, ensure: ensureEventTypes } = useEventTypeZh()

/** 处理成功后行内回写状态 (避免整表刷新, 与 AlarmsView row.status 回写同范式) */
function onHandled(id: string, status: string) {
  const row = events.value.find(e => e.id === id)
  if (row) row.status = status as AlarmStatus
}

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
const drawerVisible = ref(false)
const active = ref<AlarmEvent | null>(null)

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

const filtered = computed(() => {
  const kw = keyword.value.toLowerCase()
  return events.value.filter(e => {
    if (levelFilter.value !== '' && e.level !== levelFilter.value) return false
    if (statusFilter.value !== '' && e.status !== statusFilter.value) return false
    if (typeFilter.value !== '' && e.type !== typeFilter.value) return false
    if (aiFilter.value !== '' && aiReviewKeyOf(e) !== aiFilter.value) return false
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

/** [vp3] AI 复核结论分类 (筛选与短标共用语义) */
function aiReviewKeyOf(e: AlarmEvent): 'true' | 'false' | 'reviewed' | 'none' {
  const c = (e.aiConclusion || '').toLowerCase()
  if (!c) return 'none'
  if (c.includes('false_alarm') || c.includes('误报')) return 'false'
  if (c.includes('true_alarm') || c.includes('真告警') || c.includes('真实')) return 'true'
  return 'reviewed'
}

/** [vp2] AI 复核结论短标 (aiConclusion 关键词判定, 与后端 parseVLMResponse 同语义:
 *  真告警/真实 → 真事件; 误报 → 误报; 其余非空 → 已复核) */
function aiReviewOf(e: AlarmEvent): string {
  const c = (e.aiConclusion || '').toLowerCase()
  if (!c) return ''
  if (c.includes('false_alarm') || c.includes('误报')) return t('perimeter.events.aiFalse')
  if (c.includes('true_alarm') || c.includes('真告警') || c.includes('真实')) return t('perimeter.events.aiTrue')
  return t('perimeter.events.aiReviewed')
}
function aiReviewTagType(e: AlarmEvent): 'danger' | 'success' | 'info' {
  const c = (e.aiConclusion || '').toLowerCase()
  if (c.includes('false_alarm') || c.includes('误报')) return 'info'
  if (c.includes('true_alarm') || c.includes('真告警') || c.includes('真实')) return 'danger'
  return 'info'
}

function levelText(lv: string): string {
  return t(`perimeter.events.level_${lv}`)
}
function levelTagType(lv: string): 'danger' | 'warning' | 'primary' | 'info' | 'success' {
  if (lv === 'critical' || lv === 'high') return 'danger'
  if (lv === 'medium') return 'warning'
  if (lv === 'low') return 'primary'
  return 'info'
}
function statusText(s: string): string {
  return t(`perimeter.events.status_${s}`)
}
function statusTagType(s: string): 'danger' | 'warning' | 'info' | 'success' {
  if (s === 'unhandled') return 'danger'
  if (s === 'acknowledged' || s === 'disposed') return 'warning'
  if (s === 'resolved' || s === 'closed') return 'success'
  return 'info'
}
function pct(c: number | undefined): string {
  return `${Math.round((c ?? 0) * 100)}%`
}

/** [vp6 P1-3] 合法 bbox 判定 (与 SnapshotAnnotated 内部校验同口径: 数组≥4) */
function hasBox(md?: Record<string, unknown>): boolean {
  return Array.isArray(md?.bbox) && (md.bbox as unknown[]).length >= 4
}
function fmtTime(s: string | undefined): string {
  if (!s) return '—'
  return s.replace('T', ' ').slice(0, 19)
}

async function reload() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await videoPerimeterApi.listAlarms()
    const d = (res.data as { data?: { items?: AlarmEvent[] } })?.data
    const list = Array.isArray(d?.items) ? d.items : []
    // [normalize 修复 2026-09-01] 原始响应字段是 alarm_type (无 type), 直接
    //   过滤 e?.type 全落空 → 事件列表恒空; 统一走 normalizeAlarmCore (SSOT
    //   归一化, alarm_type→type) 再过滤, 表格列 createdAt/snapshotUrl/status 同步受益
    // [vp6 P1-3 2026-09-01] 快照标注兜底合并: normalizeAlarmCore 的 metadata 是
    //   白名单重建结构, 不含后端新增的 bbox/target_label 等任意键; types/alarm.ts
    //   属用户红线零触碰 → 在此从原始行 metadata 展开 (normalize 白名单键优先,
    //   原始键兜底), SnapshotAnnotated 据此渲染检测框叠加
    events.value = list.map(e => {
      const n = normalizeAlarmCore(e)
      // [vp6 收尾补测 2026-09-01] metadata 三形态兼容: REST 端点不同分页下返回
      //   JSON 字符串或对象 (真机实测同端点两形态并存), 字符串先 parse 再合并
      let rawMeta = (e as { metadata?: unknown })?.metadata
      if (typeof rawMeta === 'string') {
        try { rawMeta = JSON.parse(rawMeta) } catch { rawMeta = undefined }
      }
      if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
        n.metadata = { ...(rawMeta as Record<string, unknown>), ...n.metadata }
      }
      return n
    }).filter(e => isPerimeterEvent(e?.type))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function openDetail(row: AlarmEvent) {
  active.value = row
  drawerVisible.value = true
}

onMounted(() => {
  reload()
  ensureEventTypes() // 事件类型中文名预热 (非阻塞)
})
</script>

<style scoped>
.vp-events-page { padding: 16px 20px; }
.events-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.events-title { margin: 0 0 4px; font-size: 20px; }
.events-sub { color: var(--el-text-color-secondary); font-size: 13px; }
.events-filter { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.filter-kw { width: 210px; }
.filter-type { width: 150px; }
.filter-level { width: 130px; }
.filter-status { width: 140px; }
.filter-ai { width: 120px; }
.events-table { cursor: pointer; }
.type-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; max-width: 100%; }
.events-pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.act-handle { margin-left: 8px; }
.mono { font-family: Menlo, Consolas, monospace; }
/* .snap-img 已由 SnapshotAnnotated.vue 自带样式接管 (vp6 P1-3) */
.detail-desc { margin-top: 4px; }
</style>
