<template>
  <div class="hu-events-page">
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

    <!-- ===== 事件表 ===== -->
    <el-card v-else shadow="never">
      <template #header>
        <div class="card-header">
          <span>{{ t('hotel.events.tableTitle', { n: finalEvents.length }) }}</span>
          <span class="hint">{{ t('hotel.events.tableHint') }}</span>
        </div>
      </template>
      <el-table :data="pagedFinal" v-loading="loading" size="small" @row-click="openDetail"
                :empty-text="selectedType ? t('hotel.events.emptyType') : t('hotel.events.emptyAll')"
                class="events-table">
        <el-table-column :label="t('hotel.events.colType')" min-width="150">
          <template #default="{ row }">
            <div class="type-cell">
              <span class="mono evt-key">{{ row.type }}</span>
              <span class="evt-name">{{ typeName(row.type) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('hotel.events.colLevel')" width="90">
          <template #default="{ row }">
            <el-tag :type="levelTagType(row.level)" size="small" effect="dark">{{ row.level || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('hotel.events.colConfidence')" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.confidence != null">{{ (Number(row.confidence) * 100).toFixed(0) }}%</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('hotel.person.colGroup')" width="84">
          <template #default="{ row }">
            <el-tag :type="groupTagOf(eventGroup(row)).type" size="small" effect="light">
              {{ groupTagOf(eventGroup(row)).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="channelId" :label="t('hotel.events.colChannel')" width="70" align="center" />
        <el-table-column prop="description" :label="t('hotel.events.colDesc')" min-width="200" show-overflow-tooltip />
        <el-table-column :label="t('hotel.events.colSnapshot')" width="70" align="center">
          <template #default="{ row }">
            <!-- [fix 2026-09-02] 缩略图点击只开图片全屏预览: @click.stop 阻断冒泡,
              否则 row-click=openDetail 同帧弹出详情抽屉盖住预览层 (与安检/态势同款) -->
            <el-image v-if="row.snapshotUrl" :src="row.snapshotUrl"
                      :preview-src-list="[row.snapshotUrl]" fit="cover"
                      preview-teleported class="snap-thumb" @click.stop />
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('hotel.events.colTime')" width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
        <!-- [行操作 2026-09-01] 详情=全局报警弹窗 + 处理下拉 (与周界/安检事件列表同款,
          useAlarmRowActions 共享); 行点击仍开 metadata 抽屉 -->
        <el-table-column :label="t('hotel.events.colActions')" width="150" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click.stop="openAlarmPopup(row)">{{ t('common.detail') }}</el-button>
            <el-dropdown trigger="click" @command="(c: string) => handleAlarmRow(row, c as any, onHandled)">
              <el-button size="small" type="warning" link class="act-handle">
                {{ t('hotel.events.actHandle') }}<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="confirmed">{{ t('common.confirm') }}</el-dropdown-item>
                  <el-dropdown-item command="false_alarm">{{ t('hotel.events.actFalseAlarm') }}</el-dropdown-item>
                  <el-dropdown-item command="ignored">{{ t('hotel.events.actIgnore') }}</el-dropdown-item>
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

    <!-- ===== metadata 明细 drawer (员工通道 fusion 拦截证据链) ===== -->
    <el-drawer v-model="drawerVisible" :title="t('hotel.events.drawerTitle')" size="480px">
      <template v-if="activeEvent">
        <div class="detail-head">
          <el-tag :type="levelTagType(activeEvent.level)" size="small" effect="dark">{{ activeEvent.level || '-' }}</el-tag>
          <span class="mono detail-type">{{ activeEvent.type }}</span>
          <span class="detail-time">{{ fmtTime(activeEvent.createdAt) }}</span>
        </div>
        <p class="detail-desc">{{ activeEvent.description }}</p>

        <!-- [FEAT 2026-09-02] 快照标注展示 (与周界 EventsView 详情同构):
          有快照或有 bbox 均渲染 (bbox 时不检出框, fusion 拦截证据链);
          内部含全屏/下载按钮 (上轮 FEAT), 无图时占位提示 -->
        <SnapshotAnnotated v-if="activeEvent.snapshotUrl || hasBox(activeEvent.metadata)"
                           :src="activeEvent.snapshotUrl ?? ''" :metadata="activeEvent.metadata" />
        <el-empty v-else :description="t('hotel.events.noSnapshot', '无快照')" :image-size="80" />

        <h4 class="sec-title">{{ t('hotel.events.metaSection') }}</h4>
        <el-table :data="metadataRows" size="small" max-height="420" class="meta-table">
          <el-table-column prop="key" label="key" min-width="150">
            <template #default="{ row }"><span class="mono">{{ row.key }}</span></template>
          </el-table-column>
          <el-table-column :label="t('hotel.events.metaValue')" min-width="180">
            <template #default="{ row }">
              <span class="mono meta-val">{{ row.value }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="metadataRows.length === 0" class="meta-empty">
          {{ t('hotel.events.metaEmpty') }}
        </div>
        <div class="meta-hint">{{ t('hotel.events.metaHint') }}</div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 通道事件列表 — 酒店无人值守 t8f D3 (方案 §5.7 视图 2)
 *
 * 员工通道拦截事件 (tailgate/intrusion, fusion 插件 canonical 归一) + hotel 场景
 * 16 键事件流。事件类型 chips 从 /event-types/metadata?scene=hotel_unattended
 * 动态拉取 (SSOT, EventTypeAliases.h scene_tags); 数据源 alarmApi 同源
 * /alarms 前端按场景键并集过滤 (对齐 large-event EventListView 范式)。
 * 行点击 → metadata 明细 drawer (fusion 插件拦截证据: person_ge2_ratio /
 * spoof_confidence / has_backpack / replay_attack 等, AlarmEvent.metadata 透传)。
 * 人员分类列/筛选: group_type 六分类 (黑名单/白名单/访客/VIP/员工/自定义,
 * hotel.person SSOT)。
 * 三态防御: 骨架屏 / 错误态可恢复 / 空态。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { hotelUnattendedApi, isHotelEvent, CORRIDOR_INTERCEPT_TYPES, CORRIDOR_METADATA_KEYS,
         PERSON_GROUPS } from '@/api/hotelUnattended'
import type { AlarmEvent, AlarmStatus } from '@/types/alarm'
import { useAlarmRowActions } from '@/composables/useAlarmRowActions'
import { ArrowDown } from '@element-plus/icons-vue'
// [FEAT 2026-09-02] 详情抽屉快照展示: 复用周界标注组件 (上轮已带全屏/下载按钮)
import SnapshotAnnotated from '../perimeter/SnapshotAnnotated.vue'

const { t } = useI18n()
const { openAlarmPopup, handleAlarmRow } = useAlarmRowActions()

/** 处理成功后行内回写状态 (与周界/安检/告警中心同范式) */
function onHandled(id: string, status: string) {
  const row = events.value.find(e => e.id === id)
  if (row) row.status = status as AlarmStatus
}
const route = useRoute()

const loading = ref(false)
const loadError = ref('')
const events = ref<AlarmEvent[]>([])
const typeItems = ref<Array<{ alarm_type: string; display_name: string; severity_cn: string }>>([])
const selectedType = ref('')
const interceptOnly = ref(false)
const selectedGroup = ref('')
const page = ref(1)
const pageSize = 20

const drawerVisible = ref(false)
const activeEvent = ref<AlarmEvent | null>(null)

const activeTypeKeys = computed(() => new Set(typeItems.value.map(i => i.alarm_type)))
const typeChips = computed(() => typeItems.value)

const filteredEvents = computed(() =>
  events.value.filter(isHotelEvent).filter(a =>
    (interceptOnly.value
      ? (CORRIDOR_INTERCEPT_TYPES as readonly string[]).includes(String(a.type))
      : true) &&
    (!selectedGroup.value || groupOf(eventGroup(a)) === selectedGroup.value)))

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

/** group_type → 分类 tag (unknown → '未知' 灰 tag, 不参与六分类) */
function groupTagOf(groupType: unknown) {
  const def = PERSON_GROUPS.find(g => g.key === groupOf(groupType))
  return def
    ? { label: t(def.i18nKey), type: def.tagType }
    : { label: t('hotel.person.unknown'), type: 'info' as const }
}

const finalEvents = computed(() =>
  selectedType.value
    ? filteredEvents.value.filter(a => String(a.type) === selectedType.value)
    : filteredEvents.value)
const pagedFinal = computed(() => {
  const start = (page.value - 1) * pageSize
  return finalEvents.value.slice(start, start + pageSize)
})

/** metadata drawer 行 (CORRIDOR_METADATA_KEYS 优先 + 其余键兜底, 全防御式) */
const metadataRows = computed(() => {
  const meta = (activeEvent.value?.metadata ?? {}) as Record<string, unknown>
  const rows: Array<{ key: string; value: string }> = []
  const seen = new Set<string>()
  const fmt = (v: unknown): string => {
    if (v == null) return '-'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
  for (const k of CORRIDOR_METADATA_KEYS) {
    if (meta[k] !== undefined) { rows.push({ key: k, value: fmt(meta[k]) }); seen.add(k) }
  }
  for (const [k, v] of Object.entries(meta)) {
    if (!seen.has(k)) rows.push({ key: k, value: fmt(v) })
  }
  return rows
})

function typeName(alarmType: string) {
  return typeItems.value.find(i => i.alarm_type === alarmType)?.display_name ?? ''
}

function onSelectType(alarmType: string) {
  selectedType.value = selectedType.value === alarmType ? '' : alarmType
  page.value = 1
}

/** [FEAT 2026-09-02] 合法 bbox 判定 (与 SnapshotAnnotated 内部校验同口径: 数组≥4,
  同周界 EventsView.hasBox); fusion 拦截证据链无快照时可凭 bbox 渲染占位底+检测框 */
function hasBox(md?: Record<string, unknown>): boolean {
  return Array.isArray(md?.bbox) && (md.bbox as unknown[]).length >= 4
}

function levelTagType(level: unknown) {
  const lv = String(level ?? '').toLowerCase()
  if (lv === 'critical' || lv === 'high') return 'danger'
  if (lv === 'medium') return 'warning'
  return 'info'
}

function fmtTime(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function openDetail(row: AlarmEvent) {
  activeEvent.value = row
  drawerVisible.value = true
}

// ── 数据拉取 ──
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
    const res = await hotelUnattendedApi.listAlarms()
    const list = res.data?.data?.items ?? []
    if (list.length === 0 && !res.data) throw new Error(t('hotel.common.emptyResp'))
    events.value = list
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
.hu-events-page { padding: 4px 0; }
.act-handle { margin-left: 8px; }  /* [行操作 2026-09-01] dropdown 包裹后相邻按钮间距失效 */
.filter-card { margin-bottom: 16px; }
.scene-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.bar-label { font-size: 13px; color: var(--el-text-color-secondary); }
.bar-count { font-size: 12px; color: var(--el-color-success); }
.bar-refresh { margin-left: auto; }
.type-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.type-chips :deep(.el-check-tag) { height: 26px; padding: 0 10px; font-size: 12px; }
.type-chips :deep(.el-check-tag.is-checked.chip-intercept) { background: #f56c6c; }
.group-select { width: 116px; align-self: center; }
.err-hint { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); font-weight: normal; }
.events-table :deep(tbody tr) { cursor: pointer; }
.type-cell { display: flex; flex-direction: column; line-height: 1.4; }
.mono { font-family: 'JetBrains Mono', Consolas, monospace; }
.evt-key { font-size: 12px; color: var(--el-text-color-secondary); }
.evt-name { font-size: 12px; }
.snap-thumb { width: 48px; height: 36px; border-radius: 3px; cursor: pointer; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.detail-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.detail-type { font-size: 14px; font-weight: 500; }
.detail-time { font-size: 12px; color: var(--el-text-color-secondary); margin-left: auto; }
.detail-desc { font-size: 13px; color: var(--el-text-color-regular); line-height: 1.5; }
.sec-title { margin: 16px 0 8px; font-size: 14px; }
.meta-table { margin-bottom: 8px; }
.meta-val { font-size: 12px; word-break: break-all; }
.meta-empty { font-size: 12px; color: var(--el-text-color-secondary); padding: 8px 0; }
.meta-hint { font-size: 11px; color: var(--el-text-color-secondary); }
</style>
