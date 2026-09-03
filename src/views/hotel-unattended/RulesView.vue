<template>
  <div class="hu-rules-page">
    <!-- ===== 页头 ===== -->
    <div class="rules-header">
      <div>
        <h2 class="rules-title">{{ t('hotel.rules.title') }}</h2>
        <div class="rules-sub">{{ t('hotel.rules.subtitle') }}</div>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">{{ t('common.refresh') }}</el-button>
    </div>

    <!-- ===== 错误态 ===== -->
    <el-result v-if="loadError" icon="warning" :title="t('hotel.rules.loadFailed')" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">{{ t('common.retry') }}</el-button>
      </template>
    </el-result>

    <!-- ===== 骨架屏 ===== -->
    <el-card v-else-if="loading && rules.length === 0" shadow="never">
      <el-skeleton :rows="8" animated />
    </el-card>

    <template v-else>
      <!-- ===== 统计条 ===== -->
      <el-row :gutter="12" class="stat-row">
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num">{{ rules.length }}</div>
            <div class="stat-label">{{ t('hotel.rules.statRules') }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num ok">{{ enabledCount }}</div>
            <div class="stat-label">{{ t('hotel.rules.statEnabled') }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num">{{ totalTriggers }}</div>
            <div class="stat-label">{{ t('hotel.rules.statTriggers') }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num" :class="landmarkedCount === htTemplates.length ? 'ok' : ''">
              {{ landmarkedCount }}/{{ htTemplates.length }}
            </div>
            <div class="stat-label">{{ t('hotel.rules.statLanded') }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- ===== 包过滤 ===== -->
      <el-card shadow="never" class="filter-card">
        <el-radio-group v-model="packFilter" size="small">
          <el-radio-button label="">{{ t('hotel.rules.allPacks') }}</el-radio-button>
          <el-radio-button v-for="p in packs" :key="p.scene_pack_id" :label="p.scene_pack_id">
            {{ p.display_name }}
          </el-radio-button>
        </el-radio-group>
        <span class="filter-count" v-if="packFilter">
          {{ filteredRules.length }} {{ t('hotel.rules.rulesUnit') }}
        </span>
      </el-card>

      <!-- ===== 规则实例表 ===== -->
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>{{ t('hotel.rules.tableTitle', { n: filteredRules.length }) }}</span>
            <el-button size="small" type="primary" plain @click="goPacks">
              <el-icon><Box /></el-icon>&nbsp;{{ t('hotel.rules.goPacks') }}
            </el-button>
          </div>
        </template>
        <el-table :data="filteredRules" size="small"
                  :empty-text="rules.length === 0 ? t('hotel.rules.emptyAll') : t('hotel.rules.emptyPack')">
          <el-table-column :label="t('hotel.rules.colRule')" min-width="240">
            <template #default="{ row }">
              <div class="rule-cell">
                <span class="rule-name">{{ row.name }}</span>
                <span class="rule-id mono">{{ row.id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('hotel.rules.colEventTypes')" min-width="200">
            <template #default="{ row }">
              <el-tag v-for="et in (row.source_cond?.event_types ?? []).slice(0, 2)"
                      :key="et" size="small" effect="plain" class="evt-tag">{{ et }}</el-tag>
              <el-tooltip v-if="(row.source_cond?.event_types?.length ?? 0) > 2"
                          :content="(row.source_cond?.event_types ?? []).join(', ')" placement="top">
                <el-tag size="small" type="info" effect="plain">
                  +{{ (row.source_cond?.event_types?.length ?? 0) - 2 }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column :label="t('hotel.rules.colChannels')" width="150">
            <template #default="{ row }">
              <template v-if="(row.source_cond?.channel_ids?.length ?? 0) > 0">
                <el-tag v-for="c in row.source_cond.channel_ids.slice(0, 3)"
                        :key="c" size="small" type="warning" effect="plain" class="ch-tag">
                  ch{{ c }}
                </el-tag>
                <span v-if="row.source_cond.channel_ids.length > 3" class="more-ch">
                  +{{ row.source_cond.channel_ids.length - 3 }}
                </span>
              </template>
              <el-tag v-else size="small" type="success" effect="plain">{{ t('hotel.rules.allChannels') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('hotel.rules.colSource')" min-width="130">
            <template #default="{ row }">
              <span class="pack-name">{{ packNameOf(row) || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('hotel.rules.colStatus')" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                {{ row.enabled ? t('hotel.rules.enabled') : t('hotel.rules.disabled') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('hotel.rules.colTriggerStat')" width="170">
            <template #default="{ row }">
              <div class="stat-cell">
                <span class="trig-count">{{ statOf(row)?.trigger_count ?? 0 }} {{ t('hotel.rules.triggerUnit') }}</span>
                <span class="trig-last">{{ t('hotel.rules.lastTrigger') }} {{ fmtTime(statOf(row)?.last_trigger_ms) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('hotel.rules.colAction')" width="100" align="center">
            <template #default="{ row }">
              <!-- [FEAT 2026-09-02] 单条就地编辑: 点哪条只编辑哪条 -->
              <el-button size="small" link type="primary" @click="openRuleEdit(row)">{{ t('common.edit') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- ===== HT 模板落地对照 ===== -->
      <el-card shadow="never" class="tpl-card">
        <template #header>
          <div class="card-header">
            <span>{{ t('hotel.rules.tplMapping', { landed: landmarkedCount, total: htTemplates.length }) }}</span>
            <span class="hint">{{ t('hotel.rules.tplHint') }}</span>
          </div>
        </template>
        <el-empty v-if="htTemplates.length === 0" :description="t('hotel.rules.tplEmpty')" :image-size="60" />
        <div v-else class="tpl-grid">
          <el-tooltip v-for="tpl in htTemplates" :key="tpl.template_id"
                      :content="`${tpl.template_id} · ${tpl.description ?? ''}`" placement="top">
            <div class="tpl-item" :class="{ landed: isLanded(tpl.template_id) }">
              <el-icon :size="13" :color="isLanded(tpl.template_id) ? '#67c23a' : '#c0c4cc'">
                <CircleCheckFilled />
              </el-icon>
              <span class="tpl-name">{{ tpl.name }}</span>
              <span v-if="isLanded(tpl.template_id)" class="landed-mark">{{ t('hotel.rules.landed') }}</span>
            </div>
          </el-tooltip>
        </div>
      </el-card>

      <!-- [SCENE-EDIT-UNIFY 2026-09-03] 编辑跳转平台 /linkage?editRuleId= 自动打开该规则
           的 choice 编辑入口 (与平台行内编辑同链路同表单) — 场景页不再就地维护简化编辑器 -->
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 联动规则 — 酒店无人值守 t8f D3 (方案 §5.7 视图 4)
 *
 * 酒店联动规则聚合视图 (纯前端聚合, 零后端专用接口):
 *   - 规则实例: GET /linkage/rules?tag=hotel_unattended (apply v2 布防产物,
 *     稳定 rule_id "le-{pack}-{tid}"; tag=scene_tag 本身, RestApiHandlers L21399)
 *   - 触发统计: GET /linkage/rule-stats (trigger_count / last_trigger_ms)
 *   - HT 模板落地对照: GET /linkage/rule-templates 中 HT-* 21 条 × 规则 tags 交叉
 *     ([P1-2 v2.1] 18→21: +HT-receiving-* 收货通道 3 条 §5.4-C 补包)
 *   - 包过滤: 规则 tags 含 scene_pack_id (6 包 radio)
 * [SCENE-EDIT-UNIFY 2026-09-03] 编辑: 跳平台 /linkage?editRuleId= 自动打开该规则的
 *   choice 编辑入口, 与平台行内编辑同链路同表单 (编辑器单一来源)。
 * 三态防御: 骨架屏 / 错误态可恢复 / 空态。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { CircleCheckFilled, Refresh, Box } from '@element-plus/icons-vue'

import { hotelUnattendedApi, pickHotelPacks, pickHotelTemplates } from '@/api/hotelUnattended'
import type { LinkageRule, RuleTemplate, RuleTriggerStat } from '@/api/linkage'
import type { ScenePack } from '@/types/largeEvent'

const { t } = useI18n()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const rules = ref<LinkageRule[]>([])
const stats = ref<RuleTriggerStat[]>([])
const htTemplates = ref<RuleTemplate[]>([])
const packs = ref<ScenePack[]>([])
const packFilter = ref('')

const enabledCount = computed(() => rules.value.filter(r => r.enabled).length)
const totalTriggers = computed(() =>
  rules.value.reduce((sum, r) => sum + (statOf(r)?.trigger_count ?? 0), 0))

const filteredRules = computed(() =>
  packFilter.value
    ? rules.value.filter(r => r.tags?.includes(packFilter.value))
    : rules.value)

const landmarkedCount = computed(() =>
  htTemplates.value.filter(tpl => isLanded(tpl.template_id)).length)

function statOf(rule: LinkageRule): RuleTriggerStat | undefined {
  return stats.value.find(s => s.rule_id === rule.id)
}

/** 规则 tags 含 scene_pack_id (apply 合并 tags) → 反查包显示名 */
function packNameOf(rule: LinkageRule): string {
  const pid = (rule.tags ?? []).find(x => packs.value.some(p => p.scene_pack_id === x))
  return packs.value.find(p => p.scene_pack_id === pid)?.display_name ?? ''
}

function isLanded(templateId: string): boolean {
  return rules.value.some(r => r.tags?.includes(templateId))
}

function fmtTime(ms?: number): string {
  if (!ms || ms <= 0) return '—'
  const d = new Date(ms)
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return d.toDateString() === now.toDateString()
    ? hm
    : `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hm}`
}

async function fetchAll() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await hotelUnattendedApi.listRules()
    rules.value = res.data?.data?.items ?? []
    if (!res.data) throw new Error(t('hotel.common.emptyResp'))
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    loadError.value = msg.includes('404')
      ? t('hotel.common.err404')
      : `${t('hotel.common.reqError')}: ${msg}`
    rules.value = []
    ElMessage.warning(`${t('hotel.rules.loadFailed')}: ${msg}`)
  } finally { loading.value = false }
  // 统计与模板为增强信息, 失败静默降级 (不阻断主表)
  try {
    const res = await hotelUnattendedApi.listRuleStats()
    stats.value = res.data?.data?.rules ?? []
  } catch { stats.value = [] }
  try {
    const res = await hotelUnattendedApi.listRuleTemplates()
    htTemplates.value = pickHotelTemplates(res.data?.data)
  } catch { htTemplates.value = [] }
  try {
    const res = await hotelUnattendedApi.listScenePacks()
    packs.value = pickHotelPacks(res.data)
  } catch { packs.value = [] }
}

function reload() { fetchAll() }
function goPacks() { router.push('/hotel-unattended/scene-packs') }

// ─── [SCENE-EDIT-UNIFY 2026-09-03] 单条规则编辑: 跳平台 /linkage?editRuleId= 自动打开该
//     规则的 choice 编辑入口 (简易/高级卡片 → vp6 全功能表单), 与平台行内编辑同链路 —
//     编辑器单一来源, 场景页不再就地维护简化表单 (UX-ALIGN 时期的 tune 就地编辑已移除) ──
function openRuleEdit(row: LinkageRule) {
  router.push({ path: '/linkage', query: { editRuleId: row.id } })
}

onMounted(() => { fetchAll() })
</script>

<style scoped>
.hu-rules-page { padding: 4px 0; }
.rules-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.rules-title { margin: 0; font-size: 18px; font-weight: 600; }
.rules-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.stat-row { margin-bottom: 12px; }
.stat-card { background: var(--el-fill-color-light); border-radius: 6px; padding: 12px 16px; }
.stat-num { font-size: 22px; font-weight: 600; }
.stat-num.ok { color: var(--el-color-success); }
.stat-label { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.filter-card { margin-bottom: 12px; }
.filter-count { margin-left: 12px; font-size: 12px; color: var(--el-text-color-secondary); }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); font-weight: normal; }
.rule-cell { display: flex; flex-direction: column; }
.rule-name { font-weight: 500; }
.rule-id { font-size: 11px; color: var(--el-text-color-secondary); }
.mono { font-family: 'JetBrains Mono', Consolas, monospace; }
.evt-tag { margin: 0 4px 2px 0; }
.ch-tag { margin: 0 2px 2px 0; }
.more-ch { font-size: 11px; color: var(--el-text-color-secondary); }
.pack-name { font-size: 12px; }
.stat-cell { display: flex; flex-direction: column; }
.trig-count { font-size: 12px; }
.trig-last { font-size: 11px; color: var(--el-text-color-secondary); }
.tpl-card { margin-top: 12px; }
.tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 6px 14px; }
.tpl-item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px;
            font-size: 12px; color: var(--el-text-color-secondary); }
.tpl-item.landed { color: var(--el-text-color-primary); }
.tpl-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.landed-mark { font-size: 11px; color: var(--el-color-success); flex-shrink: 0; }
</style>
