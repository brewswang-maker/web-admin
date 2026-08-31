<template>
  <div class="hu-overview-page">
    <!-- ===== 页头 ===== -->
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ t('hotel.overview.title') }}</h2>
        <div class="page-sub">{{ t('hotel.overview.subtitle') }}</div>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">{{ t('common.refresh') }}</el-button>
    </div>

    <!-- ===== 错误态 (可恢复: 重试入口) ===== -->
    <el-result v-if="loadError && packs.length === 0" icon="warning"
               :title="t('hotel.common.loadFailed')" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">{{ t('common.retry') }}</el-button>
        <div class="err-hint">{{ t('hotel.common.errHint') }}</div>
      </template>
    </el-result>

    <!-- ===== 骨架屏 (首次加载) ===== -->
    <template v-else-if="loading && packs.length === 0">
      <el-row :gutter="16" class="stat-row">
        <el-col :span="6" v-for="i in 4" :key="i">
          <el-card shadow="never"><el-skeleton :rows="2" animated /></el-card>
        </el-col>
      </el-row>
      <el-card shadow="never"><el-skeleton :rows="6" animated /></el-card>
    </template>

    <template v-else>
      <!-- ===== 4 KPI 统计卡 ===== -->
      <el-row :gutter="16" class="stat-row">
        <el-col :span="6" v-for="s in statCards" :key="s.label">
          <el-card shadow="hover" class="stat-card" :body-style="{ padding: '16px 20px' }">
            <div class="stat-content">
              <div class="stat-icon" :style="{ background: s.color }">
                <el-icon :size="20"><component :is="s.icon" /></el-icon>
              </div>
              <div class="stat-body">
                <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
                <div class="stat-label">{{ s.label }}</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <!-- ===== 5 包布防状态 ===== -->
        <el-col :span="10">
          <el-card shadow="never" class="section-card">
            <template #header>
              <div class="card-header">
                <span>{{ t('hotel.overview.packStatus') }}</span>
                <el-button size="small" text type="primary" @click="router.push('/hotel-unattended/scene-packs')">
                  {{ t('hotel.overview.goPacks') }} →
                </el-button>
              </div>
            </template>
            <el-empty v-if="packs.length === 0" :description="t('hotel.overview.noPacks')"
                      :image-size="60">
              <el-button size="small" @click="reload">{{ t('common.reload') }}</el-button>
            </el-empty>
            <div v-else class="pack-list">
              <div v-for="p in packs" :key="p.scene_pack_id" class="pack-item">
                <div class="pack-dot" :class="{ landed: packLanded(p) }" />
                <div class="pack-info">
                  <div class="pack-name">{{ p.display_name }}</div>
                  <div class="pack-id mono">{{ p.scene_pack_id }}</div>
                </div>
                <el-tag :type="packLanded(p) ? 'success' : 'info'" size="small">
                  {{ packLanded(p) ? t('hotel.overview.armed') : t('hotel.overview.notArmed') }}
                </el-tag>
                <span class="pack-count">{{ packRuleCount(p) }} {{ t('hotel.overview.rulesUnit') }}</span>
              </div>
            </div>
            <el-divider style="margin: 12px 0" />
            <div class="circle-footer">
              <span>{{ t('hotel.overview.ssotCoverage') }}
                <strong>{{ eventMetaCount }}</strong> {{ t('hotel.overview.eventTypesUnit') }}
              </span>
              <el-tag v-if="ssotError" size="small" type="warning">{{ t('hotel.overview.ssotFailed') }}</el-tag>
            </div>
          </el-card>
        </el-col>

        <!-- ===== 最近拦截记录 ===== -->
        <el-col :span="14">
          <el-card shadow="never" class="section-card">
            <template #header>
              <div class="card-header">
                <span>{{ t('hotel.overview.recentEvents') }}</span>
                <el-button size="small" text type="primary" @click="router.push('/hotel-unattended/corridor-events')">
                  {{ t('hotel.overview.viewAll') }} →
                </el-button>
              </div>
            </template>
            <el-table :data="recentEvents" v-loading="eventsLoading" size="small"
                      :empty-text="t('hotel.overview.noEvents')">
              <el-table-column prop="type" :label="t('hotel.events.colType')" min-width="130">
                <template #default="{ row }">
                  <span class="mono evt-key">{{ row.type }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t('hotel.events.colLevel')" width="90">
                <template #default="{ row }">
                  <el-tag :type="levelTagType(row.level)" size="small" effect="dark">
                    {{ row.level || '-' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="channelId" :label="t('hotel.events.colChannel')" width="70" align="center" />
              <el-table-column prop="description" :label="t('hotel.events.colDesc')" min-width="180" show-overflow-tooltip />
              <el-table-column :label="t('hotel.events.colTime')" width="150">
                <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <!-- ===== 人员分类构成 (六分类: 人脸库统计 × 24h 通行聚合) ===== -->
        <el-col :span="10">
          <el-card shadow="never" class="section-card">
            <template #header>
              <div class="card-header">
                <span>{{ t('hotel.person.composeTitle') }}</span>
              </div>
            </template>
            <el-table :data="groupRows" v-loading="passLoading" size="small"
                      show-summary :summary-method="groupSummary"
                      :empty-text="t('hotel.person.composeEmpty')">
              <el-table-column :label="t('hotel.person.colGroup')" min-width="100">
                <template #default="{ row }">
                  <div class="group-cell">
                    <span class="group-dot" :style="{ background: row.color }" />
                    <span>{{ row.label }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('hotel.person.composeInDb')" width="72" align="center">
                <template #default="{ row }"><span class="mono">{{ row.inDb }}</span></template>
              </el-table-column>
              <el-table-column :label="t('hotel.person.composePass24h')" width="84" align="center">
                <template #default="{ row }">
                  <strong :style="row.today > 0 ? { color: row.color } : undefined">{{ row.today }}</strong>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <!-- ===== 最近通行 (24h) ===== -->
        <el-col :span="14">
          <el-card shadow="never" class="section-card">
            <template #header>
              <div class="card-header">
                <span>{{ t('hotel.person.passTitle') }}</span>
              </div>
            </template>
            <el-table :data="recentPasses" v-loading="passLoading" size="small"
                      :empty-text="t('hotel.person.passEmpty')">
              <el-table-column :label="t('hotel.person.colName')" min-width="96" show-overflow-tooltip>
                <template #default="{ row }">{{ row.name || t('hotel.person.unknownName') }}</template>
              </el-table-column>
              <el-table-column :label="t('hotel.person.colGroup')" width="84">
                <template #default="{ row }">
                  <el-tag :type="groupTagOf(row.pass_type).type" size="small" effect="light">
                    {{ groupTagOf(row.pass_type).label }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="channel_id" :label="t('hotel.events.colChannel')" width="64" align="center" />
              <el-table-column :label="t('hotel.person.colLive')" width="70" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.is_live ? 'success' : 'danger'" size="small" effect="plain">
                    {{ row.is_live ? t('hotel.person.liveOk') : t('hotel.person.liveFail') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('hotel.person.colSimilarity')" width="76" align="center">
                <template #default="{ row }">
                  <span v-if="row.similarity != null">{{ (Number(row.similarity) * 100).toFixed(0) }}%</span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column :label="t('hotel.events.colTime')" width="150">
                <template #default="{ row }">{{ fmtTime(tsToIso(row.timestamp)) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 值守总览 — 酒店无人值守 t8f D3 (方案 §5.7 视图 1)
 *
 * 4 KPI (今日拦截 / 布防包数 / 启用规则 / SSOT 事件覆盖) + 5 包布防状态
 * + 最近拦截记录 + 人员六分类板块 (黑名单/白名单/访客/VIP/员工/自定义:
 * 人脸库统计 + 24h 通行记录, 酒店人员体系)。数据源全部复用既有端点
 * (large-event/scene-packs, linkage/rules?tag=hotel_unattended, /alarms,
 * event-types/metadata?scene=, face/database/stats|pass-records),
 * 零后端专用接口。三态防御: 骨架屏 / 错误态可恢复 / 空态
 * (对齐 t8b-⑥ 修复后的 large-event ScenePacksView 规范)。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Refresh, Warning, Box, Bell, Aim } from '@element-plus/icons-vue'
import type { Component } from 'vue'
import { hotelUnattendedApi, pickHotelPacks, isHotelEvent, CORRIDOR_INTERCEPT_TYPES,
         PERSON_GROUPS, passTypeToGroup } from '@/api/hotelUnattended'
import type { ScenePack } from '@/types/largeEvent'
import type { LinkageRule } from '@/api/linkage'
import type { AlarmEvent } from '@/types/alarm'
import type { FaceDatabaseStats, FacePassRecord } from '@/api/face'

const { t } = useI18n()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const packs = ref<ScenePack[]>([])
const rules = ref<LinkageRule[]>([])
const events = ref<AlarmEvent[]>([])
const eventMetaCount = ref(0)
const ssotError = ref(false)
const eventsLoading = ref(false)
const faceStats = ref<FaceDatabaseStats | null>(null)
const passRecords = ref<FacePassRecord[]>([])
const passLoading = ref(false)

// ── 派生统计 ──
const corridorEvents = computed(() =>
  events.value.filter(a => (CORRIDOR_INTERCEPT_TYPES as readonly string[]).includes(String(a.type))))
const armedPacks = computed(() => packs.value.filter(packLanded).length)
const enabledRules = computed(() => rules.value.filter(r => r.enabled).length)

const statCards = computed(() => [
  { label: t('hotel.overview.kpiIntercept'), value: corridorEvents.value.length, color: '#f56c6c', icon: Warning as Component },
  { label: t('hotel.overview.kpiPacks'), value: `${armedPacks.value}/${packs.value.length}`, color: '#409eff', icon: Box as Component },
  { label: t('hotel.overview.kpiRules'), value: enabledRules.value, color: '#67c23a', icon: Bell as Component },
  { label: t('hotel.overview.kpiSsot'), value: eventMetaCount.value, color: '#e6a23c', icon: Aim as Component },
])

const recentEvents = computed(() =>
  events.value.filter(isHotelEvent).slice(0, 8))

// ── 人员六分类派生 (库内人数 × 24h 通行聚合; pass_type 归并见 passTypeToGroup) ──
const passByGroup = computed(() => {
  const m: Record<string, number> = {}
  for (const r of passRecords.value) {
    const k = passTypeToGroup(r.pass_type)
    if (k !== 'unknown') m[k] = (m[k] ?? 0) + 1
  }
  return m
})
const groupRows = computed(() =>
  PERSON_GROUPS.map(g => ({
    ...g,
    label: t(g.i18nKey),
    inDb: faceStats.value?.[g.key] ?? 0,
    today: passByGroup.value[g.key] ?? 0,
  })))
const passTotal = computed(() =>
  Object.values(passByGroup.value).reduce((a, b) => a + b, 0))
const recentPasses = computed(() => passRecords.value.slice(0, 8))

/** 包是否已布防: 任一规则 tags 含 scene_pack_id (apply 合并 tags, RestApiHandlers L21399) */
function packLanded(p: ScenePack): boolean {
  return rules.value.some(r => r.tags?.includes(p.scene_pack_id))
}
function packRuleCount(p: ScenePack): number {
  return rules.value.filter(r => r.tags?.includes(p.scene_pack_id)).length
}

function levelTagType(level: unknown) {
  const lv = String(level ?? '').toLowerCase()
  if (lv === 'critical' || lv === 'high') return 'danger'
  if (lv === 'medium') return 'warning'
  if (lv === 'low') return 'info'
  return 'info'
}

function fmtTime(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** pass_type → 分类 tag (unknown/unknown_type → '未知' 灰 tag, 不参与六分类) */
function groupTagOf(passType: unknown) {
  const def = PERSON_GROUPS.find(g => g.key === passTypeToGroup(passType))
  return def
    ? { label: t(def.i18nKey), type: def.tagType }
    : { label: t('hotel.person.unknown'), type: 'info' as const }
}

/** 秒/毫秒时间戳容错 → ISO (FacePassRecord.timestamp 单位随固件版本) */
function tsToIso(ts: unknown): string {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return ''
  return new Date(n > 1e12 ? n : n * 1000).toISOString()
}

/** 六分类构成表合计行 (第一列为人脸库总人数 + 24h 通行合计) */
function groupSummary() {
  return [t('hotel.person.composeFooter', { n: faceStats.value?.total ?? 0, m: passTotal.value }), '', '']
}

// ── 数据拉取 (主链路失败 → 错误态; 增强信息失败静默降级) ──
async function fetchPacks() {
  const res = await hotelUnattendedApi.listScenePacks()
  const body = res?.data
  if (body && typeof body === 'object' && 'code' in body && (body as { code?: number }).code !== 0) {
    const b = body as { code?: number; msg?: string }
    throw new Error(`code=${b.code}${b.msg ? `: ${b.msg}` : ''}`)
  }
  packs.value = pickHotelPacks(body)
}

async function fetchRules() {
  try {
    const res = await hotelUnattendedApi.listRules()
    rules.value = res.data?.data?.items ?? []
  } catch { rules.value = [] }
}

async function fetchEvents() {
  eventsLoading.value = true
  try {
    const res = await hotelUnattendedApi.listAlarms()
    events.value = res.data?.data?.items ?? []
  } catch { events.value = [] } finally { eventsLoading.value = false }
}

async function fetchSsot() {
  try {
    const res = await hotelUnattendedApi.listEventMetadata()
    const groups = res.data?.data?.groups ?? {}
    let n = 0
    for (const g of Object.values(groups)) n += g?.items?.length ?? 0
    eventMetaCount.value = n
    ssotError.value = false
  } catch { ssotError.value = true }
}

/** 人脸库统计 + 24h 通行记录 (人员分类增强信息, 失败静默降级不阻塞值守主链路) */
async function fetchFace() {
  passLoading.value = true
  try {
    const [s, p] = await Promise.all([
      hotelUnattendedApi.listFaceStats(),
      hotelUnattendedApi.listPassRecords({ hours: 24, limit: 200 }),
    ])
    faceStats.value = s.data?.data ?? null
    // 实测后端 data 键为 records (face.ts 声明的 pass_records 与固件不符), 双键兼容
    const d = p.data?.data as { pass_records?: FacePassRecord[]; records?: FacePassRecord[] } | undefined
    passRecords.value = d?.pass_records ?? d?.records ?? []
  } catch { /* 静默降级 */ } finally { passLoading.value = false }
}

async function reload() {
  loading.value = true
  loadError.value = ''
  try {
    await fetchPacks()
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    loadError.value = msg.includes('404')
      ? t('hotel.common.err404')
      : `${t('hotel.common.reqError')}: ${msg}`
    packs.value = []
    ElMessage.warning(`${t('hotel.common.loadFailed')}: ${msg}`)
  } finally { loading.value = false }
  fetchRules()
  fetchEvents()
  fetchSsot()
  fetchFace()
}

onMounted(() => { reload() })
</script>

<style scoped>
.hu-overview-page { padding: 4px 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title { margin: 0; font-size: 18px; font-weight: 600; }
.page-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.err-hint { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
.stat-row { margin-bottom: 16px; }
.stat-card { margin-bottom: 8px; }
.stat-content { display: flex; gap: 14px; align-items: center; }
.stat-icon { width: 42px; height: 42px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.stat-value { font-size: 24px; font-weight: 600; line-height: 1.1; }
.stat-label { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.section-card { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.pack-list { display: flex; flex-direction: column; gap: 10px; }
.pack-item { display: flex; align-items: center; gap: 10px; }
.pack-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--el-fill-color-darker); flex-shrink: 0; }
.pack-dot.landed { background: var(--el-color-success); }
.pack-info { flex: 1; min-width: 0; }
.pack-name { font-size: 13px; font-weight: 500; }
.pack-id { font-size: 11px; color: var(--el-text-color-secondary); }
.pack-count { font-size: 12px; color: var(--el-text-color-secondary); width: 48px; text-align: right; }
.circle-footer { font-size: 12px; color: var(--el-text-color-secondary); }
.mono { font-family: 'JetBrains Mono', Consolas, monospace; }
.evt-key { font-size: 12px; color: var(--el-text-color-secondary); }
.group-cell { display: flex; align-items: center; gap: 8px; }
.group-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
</style>
