<template>
  <div class="vp-events-page">
    <!-- ===== 页头 + 过滤器 ===== -->
    <div class="events-header">
      <div>
        <h2 class="events-title">{{ t('perimeter.events.title') }}</h2>
        <div class="events-sub">{{ t('perimeter.events.subtitle', { n: filtered.length }) }}</div>
      </div>
      <div class="events-filter">
        <el-select v-model="levelFilter" size="default" class="filter-level" clearable
                   :placeholder="t('perimeter.events.allLevels')">
          <el-option v-for="lv in LEVELS" :key="lv" :value="lv" :label="levelText(lv)" />
        </el-select>
        <el-select v-model="statusFilter" size="default" class="filter-status" clearable
                   :placeholder="t('perimeter.events.allStatus')">
          <el-option v-for="s in STATUSES" :key="s" :value="s" :label="statusText(s)" />
        </el-select>
        <!-- [vp3] AI 复核结论筛选 (《研究报告》§8 复核闭环运营口径) -->
        <el-select v-model="aiFilter" size="default" class="filter-ai" clearable
                   :placeholder="t('perimeter.events.colAiReview')">
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

    <!-- ===== 事件表格 ===== -->
    <el-table v-else :data="filtered" size="default" @row-click="openDetail" class="events-table">
      <el-table-column :label="t('perimeter.events.colLevel')" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="levelTagType(row.level)" size="small" effect="dark">{{ levelText(row.level) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('perimeter.events.colType')" width="150">
        <template #default="{ row }">
          <span class="mono">{{ row.type }}</span>
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

    <!-- ===== 详情抽屉 (抓拍 + 元数据) ===== -->
    <el-drawer v-model="drawerVisible" :title="t('perimeter.events.detailTitle')" size="480px">
      <template v-if="active">
        <el-image v-if="active.snapshotUrl" :src="active.snapshotUrl"
                  :preview-src-list="[active.snapshotUrl]" fit="contain" class="snap-img" />
        <el-empty v-else :description="t('perimeter.events.noSnapshot')" :image-size="80" />

        <el-descriptions :column="1" border size="small" class="detail-desc">
          <el-descriptions-item :label="t('perimeter.events.colType')">
            <span class="mono">{{ active.type }}</span>
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
import { Refresh, ArrowDown } from '@element-plus/icons-vue'
import { videoPerimeterApi, isPerimeterEvent } from '@/api/videoPerimeter'
import { normalizeAlarmCore, type AlarmEvent, type AlarmLevel, type AlarmStatus } from '@/types/alarm'
import { useAlarmRowActions } from '@/composables/useAlarmRowActions'

const { t } = useI18n()
const { openAlarmPopup, handleAlarmRow } = useAlarmRowActions()

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
const drawerVisible = ref(false)
const active = ref<AlarmEvent | null>(null)

const filtered = computed(() =>
  events.value.filter(e =>
    (levelFilter.value === '' || e.level === levelFilter.value) &&
    (statusFilter.value === '' || e.status === statusFilter.value) &&
    (aiFilter.value === '' || aiReviewKeyOf(e) === aiFilter.value)
  )
)

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
    events.value = list.map(e => normalizeAlarmCore(e)).filter(e => isPerimeterEvent(e?.type))
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

onMounted(reload)
</script>

<style scoped>
.vp-events-page { padding: 16px 20px; }
.events-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.events-title { margin: 0 0 4px; font-size: 20px; }
.events-sub { color: var(--el-text-color-secondary); font-size: 13px; }
.events-filter { display: flex; gap: 8px; align-items: center; }
.filter-level { width: 140px; }
.filter-status { width: 150px; }
.filter-ai { width: 130px; }
.events-table { cursor: pointer; }
.act-handle { margin-left: 8px; }
.mono { font-family: Menlo, Consolas, monospace; }
.snap-img { width: 100%; max-height: 260px; border-radius: 8px; margin-bottom: 14px; background: var(--el-fill-color-light); }
.detail-desc { margin-top: 4px; }
</style>
