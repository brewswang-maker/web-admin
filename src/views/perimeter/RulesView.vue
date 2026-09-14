<template>
  <div class="vp-rules-page">
    <!-- ===== 页头 ===== -->
    <div class="rules-header">
      <div>
        <h2 class="rules-title">{{ t('perimeter.rules.title') }}</h2>
        <div class="rules-sub">{{ t('perimeter.rules.subtitle') }}</div>
      </div>
      <div class="rules-toolbar">
        <!-- [UX 2026-09-02 对齐效果图] 规则搜索 (300ms 防抖, 规则名/ID/事件类型) -->
        <el-input v-model="kwInput" size="default" clearable class="rules-kw"
          :placeholder="t('perimeter.rules.searchHint', '搜索规则名 / 事件类型')"
          :prefix-icon="Search" @input="onKwInput" />
        <el-button :icon="Refresh" :loading="loading" @click="reload">{{ t('common.refresh') }}</el-button>
      </div>
    </div>

    <!-- ===== 错误态 ===== -->
    <el-result v-if="loadError" icon="warning" :title="t('perimeter.rules.loadFailed')" :sub-title="loadError">
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
            <div class="stat-label">{{ t('perimeter.rules.statRules') }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num ok">{{ enabledCount }}</div>
            <div class="stat-label">{{ t('perimeter.rules.statEnabled') }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num">{{ totalTriggers }}</div>
            <div class="stat-label">{{ t('perimeter.rules.statTriggers') }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num" :class="landmarkedCount === vpTemplates.length && vpTemplates.length > 0 ? 'ok' : ''">
              {{ landmarkedCount }}/{{ vpTemplates.length }}
            </div>
            <div class="stat-label">{{ t('perimeter.rules.statLanded') }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- ===== 包过滤 ===== -->
      <el-card shadow="never" class="filter-card">
        <el-radio-group v-model="packFilter" size="small">
          <el-radio-button label="">{{ t('perimeter.rules.allPacks') }}</el-radio-button>
          <el-radio-button v-for="p in packs" :key="p.scene_pack_id" :label="p.scene_pack_id">
            {{ p.display_name }}
          </el-radio-button>
        </el-radio-group>
        <span class="filter-count" v-if="packFilter">
          {{ filteredRules.length }} {{ t('perimeter.rules.rulesUnit') }}
        </span>
      </el-card>

      <!-- ===== 规则实例表 ===== -->
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>{{ t('perimeter.rules.tableTitle', { n: filteredRules.length }) }}</span>
            <el-button size="small" type="primary" plain @click="goPacks">
              <el-icon><Box /></el-icon>&nbsp;{{ t('perimeter.rules.goPacks') }}
            </el-button>
          </div>
        </template>
        <el-table :data="filteredRules" size="small"
                  :empty-text="rules.length === 0 ? t('perimeter.rules.emptyAll') : t('perimeter.rules.emptyPack')">
          <!-- [TRIGGER-DETAIL 2026-09-14] 列重排: 序号/报警级别/事件类型/联动规则名称/
               绑定设备通道/状态/触发条件/操作 (触发条件与平台联动规则页同款;
               操作新增「触发详情」→ 告警中心按本规则过滤事件) -->
          <el-table-column type="index" :label="t('perimeter.rules.colIndex')" width="60" align="center" />
          <el-table-column :label="t('perimeter.rules.colLevel')" width="90" align="center">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="ruleLevelInfo(row.source_cond?.min_severity).tagType">
                {{ ruleLevelInfo(row.source_cond?.min_severity).label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('perimeter.rules.colEventTypes')" min-width="200">
            <template #default="{ row }">
              <!-- [UX 2026-09-02] 中文名展示 (SSOT canonical), tooltip 保留裸 key -->
              <el-tag v-for="et in (row.source_cond?.event_types ?? []).slice(0, 2)"
                      :key="et" size="small" effect="plain" class="evt-tag">
                <span :title="et">{{ zh(et) }}</span>
              </el-tag>
              <el-tooltip v-if="(row.source_cond?.event_types?.length ?? 0) > 2"
                          :content="zhAll(row.source_cond?.event_types ?? [])" placement="top">
                <el-tag size="small" type="info" effect="plain">
                  +{{ (row.source_cond?.event_types?.length ?? 0) - 2 }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column :label="t('perimeter.rules.colRule')" min-width="240">
            <template #default="{ row }">
              <div class="rule-cell">
                <span class="rule-name">{{ row.name }}</span>
                <span class="rule-id mono">{{ row.id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('perimeter.rules.colChannels')" width="200">
            <template #default="{ row }">
              <!-- [CH-BINDING-DISPLAY 2026-09-14] 真实绑定展示 (缺陷修复):
                   原只读 source_cond.channel_ids — 周界布防通道写在 bound_channel_ids /
                   device_ids / location_id, channel_ids 恒空 ⇒ 一律误判「全部通道」。
                   现综合四源 (useRuleChannelDisplay, 与 LinkageEngine 运行时收窄同口径)。 -->
              <template v-if="!boundInfoOf(row).allChannels">
                <el-tooltip :content="boundInfoOf(row).tooltip" placement="top">
                  <span class="ch-bound-cell">
                    <el-tag v-for="it in boundInfoOf(row).items.slice(0, 3)"
                            :key="it.raw" size="small" type="warning" effect="plain" class="ch-tag">
                      <span class="ch-tag-txt">{{ it.label }}</span>
                    </el-tag>
                    <span v-if="boundInfoOf(row).items.length > 3" class="more-ch">
                      +{{ boundInfoOf(row).items.length - 3 }}
                    </span>
                  </span>
                </el-tooltip>
              </template>
              <el-tag v-else size="small" type="success" effect="plain">{{ t('perimeter.rules.allChannels') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('perimeter.rules.colStatus')" width="90" align="center">
            <template #default="{ row }">
              <!-- [UX 2026-09-02 对齐效果图] 行内启停开关 (PUT /linkage/rules/{id}; loading 防连点, 失败回滚) -->
              <el-switch size="small" :model-value="row.enabled"
                :loading="togglingId === row.id" :disabled="togglingId === row.id"
                :style="togglingId === row.id ? 'opacity: 0.7' : ''"
                @change="toggleRule(row)" />
            </template>
          </el-table-column>
          <el-table-column :label="t('perimeter.rules.colTriggerCond')" min-width="200">
            <template #default="{ row }">
              <!-- [TRIGGER-DETAIL 2026-09-14] 与平台联动规则页同款 (useRuleTriggerTags SSOT):
                   时间/空间/事件源/合并 四类标签; 全空 = 无条件 -->
              <div class="condition-tags">
                <el-tag v-for="tag in ruleTriggerTags(row)" :key="tag.key" size="small" effect="plain" class="cond-tag">{{ tag.label }}</el-tag>
                <span v-if="ruleTriggerTags(row).length === 0" class="text-secondary">{{ t('perimeter.rules.noCondition') }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('perimeter.rules.colAction')" width="150" align="center">
            <template #default="{ row }">
              <!-- [FEAT 2026-09-02] 单条就地编辑: 点哪条只编辑哪条 -->
              <el-button size="small" link type="primary" @click="openRuleEdit(row)">{{ t('common.edit') }}</el-button>
              <!-- [TRIGGER-DETAIL 2026-09-14] 触发详情: 跳告警中心按本规则过滤事件列表 -->
              <el-button size="small" link type="primary" @click="openTriggerDetail(row)">{{ t('perimeter.rules.triggerDetail') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- ===== VP 模板落地对照 ===== -->
      <el-card shadow="never" class="tpl-card">
        <template #header>
          <div class="card-header">
            <span>{{ t('perimeter.rules.tplMapping', { landed: landmarkedCount, total: vpTemplates.length }) }}</span>
            <span class="hint">{{ t('perimeter.rules.tplHint') }}</span>
          </div>
        </template>
        <el-empty v-if="vpTemplates.length === 0" :description="t('perimeter.rules.tplEmpty')" :image-size="60" />
        <div v-else class="tpl-grid">
          <el-tooltip v-for="tpl in vpTemplates" :key="tpl.template_id"
                      :content="`${tpl.template_id} · ${tpl.description ?? ''}`" placement="top">
            <div class="tpl-item" :class="{ landed: isLanded(tpl.template_id) }">
              <el-icon :size="13" :color="isLanded(tpl.template_id) ? '#67c23a' : '#c0c4cc'">
                <CircleCheckFilled />
              </el-icon>
              <span class="tpl-name">{{ tpl.name }}</span>
              <span v-if="isLanded(tpl.template_id)" class="landed-mark">{{ t('perimeter.rules.landed') }}</span>
            </div>
          </el-tooltip>
        </div>
      </el-card>

      <!-- [SCENE-EDIT-INPLACE 2026-09-03] 就地编辑: 内嵌平台 LinkageRuleView 嵌入模式
           (embedEditRuleId, 同一编辑器单一来源: [EDIT-DIRECT 2026-09-14] 编辑直入
           简易模式 → vp6 编辑表单, 原 choice 选择页已下线), 不再跳转
           /linkage; 编辑抽屉链关闭 (edit-closed) 后卸载并刷新本页列表 -->
      <LinkageRuleView v-if="editEmbedVisible" :embed-edit-rule-id="editEmbedRuleId" @edit-closed="onEditEmbedClosed" />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 事件规则 — 视频周界 [vp4 2026-09-01]
 *
 * 周界联动规则聚合视图 (纯前端聚合, 零后端专用接口, 范式对齐
 * hotel-unattended/RulesView.vue):
 *   - 规则实例: GET /linkage/rules?tag=video_perimeter (apply v2 布防产物,
 *     稳定 rule_id "le-{pack}-{tid}"; tag=scene_tag 本身)
 *   - 触发统计: GET /linkage/rule-stats (trigger_count / last_trigger_ms)
 *   - VP 模板落地对照: GET /linkage/rule-templates 中 VP-* 6 条 × 规则 tags 交叉
 *   - 包过滤: 规则 tags 含 scene_pack_id (4 包 radio)
 * [SCENE-EDIT-INPLACE 2026-09-03] 编辑就地内嵌 LinkageRuleView 嵌入模式 (不跳转 /linkage,
 *   同一编辑器单一来源); 三态防御: 骨架屏 / 错误态可恢复 / 空态。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useDebounceFn } from '@vueuse/core'
import { CircleCheckFilled, Refresh, Box, Search } from '@element-plus/icons-vue'
import { videoPerimeterApi, pickPerimeterPacks, pickPerimeterTemplates } from '@/api/videoPerimeter'

import { linkageApi, type LinkageRule, type RuleTemplate, type RuleTriggerStat } from '@/api/linkage'
import { useEventTypeZh } from '@/composables/useEventTypeZh'
// [CH-BINDING-DISPLAY 2026-09-14] 绑定通道真实展示 (四源综合 + 目录名称反查)
import { displayRuleBoundChannels, type BoundChannelDisplay } from '@/composables/useRuleChannelDisplay'
// [TRIGGER-DETAIL 2026-09-14] 触发条件标签 + 报警级别渲染 (平台页同款 SSOT)
import { ruleTriggerTags, ruleLevelInfo } from '@/composables/useRuleTriggerTags'
import { loadAlarmNameDirectory } from '@/composables/useAlarmDeviceLabel'
import type { ScenePack } from '@/types/largeEvent'
// [SCENE-EDIT-INPLACE 2026-09-03] 就地编辑: 内嵌平台编辑器 (嵌入模式, 编辑器单一来源)
import LinkageRuleView from '@/views/LinkageRuleView.vue'

const { t } = useI18n()
const router = useRouter()
const { zh, zhAll, ensure: ensureEventTypes } = useEventTypeZh()

const loading = ref(false)
const loadError = ref('')
const rules = ref<LinkageRule[]>([])
const stats = ref<RuleTriggerStat[]>([])
const vpTemplates = ref<RuleTemplate[]>([])
const packs = ref<ScenePack[]>([])
const packFilter = ref('')
// [UX 2026-09-02] 规则搜索 (300ms 防抖) + 行内启停开关状态
const kwInput = ref('')
const keyword = ref('')
const togglingId = ref('')

const enabledCount = computed(() => rules.value.filter(r => r.enabled).length)
const totalTriggers = computed(() =>
  rules.value.reduce((sum, r) => sum + (statOf(r)?.trigger_count ?? 0), 0))

// [CH-BINDING-DISPLAY 2026-09-14] 绑定通道列展示映射 (按 rules 预计算; 目录异步就绪后
//   chNameById/devChsById ref 变更自动重算 — 未就绪窗口期内展示原始标识不误判全通道)
const boundMap = computed(() => {
  const m = new Map<string, BoundChannelDisplay>()
  for (const r of rules.value) m.set(r.id, displayRuleBoundChannels(r))
  return m
})
function boundInfoOf(row: LinkageRule): BoundChannelDisplay {
  return boundMap.value.get(row.id) ?? { allChannels: true, items: [], tooltip: '' }
}

/** 搜索防抖 (300ms) */
const onKwInput = useDebounceFn(() => {
  keyword.value = kwInput.value.trim().toLowerCase()
}, 300)

const filteredRules = computed(() => {
  let list = packFilter.value
    ? rules.value.filter(r => r.tags?.includes(packFilter.value))
    : rules.value
  const kw = keyword.value
  if (kw) {
    list = list.filter(r => {
      const types = ((r.source_cond?.event_types ?? []) as string[]).map(zh).join(' ')
      return `${r.name ?? ''} ${r.id ?? ''} ${types}`.toLowerCase().includes(kw)
    })
  }
  return list
})

const landmarkedCount = computed(() =>
  vpTemplates.value.filter(tpl => isLanded(tpl.template_id)).length)

function statOf(rule: LinkageRule): RuleTriggerStat | undefined {
  return stats.value.find(s => s.rule_id === rule.id)
}

function isLanded(templateId: string): boolean {
  return rules.value.some(r => r.tags?.includes(templateId))
}

async function fetchAll() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await videoPerimeterApi.listRules()
    rules.value = res.data?.data?.items ?? []
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    loadError.value = `${t('perimeter.rules.loadFailed')}: ${msg}`
    rules.value = []
  } finally { loading.value = false }
  // 统计与模板为增强信息, 失败静默降级 (不阻断主表)
  try {
    const res = await videoPerimeterApi.listRuleStats()
    stats.value = res.data?.data?.rules ?? []
  } catch { stats.value = [] }
  try {
    const res = await videoPerimeterApi.listRuleTemplates()
    vpTemplates.value = pickPerimeterTemplates(res.data?.data)
  } catch { vpTemplates.value = [] }
  try {
    const res = await videoPerimeterApi.listScenePacks()
    packs.value = pickPerimeterPacks(res.data)
  } catch { packs.value = [] }
}

/** [UX 2026-09-02] 行内启停: PUT /linkage/rules/{id}; 失败回滚 + error toast (loading 防连点) */
async function toggleRule(rule: LinkageRule) {
  if (togglingId.value) return
  const next = !rule.enabled
  togglingId.value = rule.id
  try {
    await linkageApi.updateRule(rule.id, { enabled: next } as Partial<LinkageRule>)
    rule.enabled = next
    const stateTxt = next ? t('perimeter.rules.stateOn', '启用') : t('perimeter.rules.stateOff', '停用')
    ElMessage.success(t('perimeter.rules.toggleOk', `规则「${rule.name || rule.id}」已${stateTxt}`))
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    ElMessage.error(t('perimeter.rules.toggleFail', `规则「${rule.name || rule.id}」启停失败: ${msg}`))
  } finally {
    togglingId.value = ''
  }
}

function reload() { fetchAll() }
// ─── [SCENE-EDIT-INPLACE 2026-09-03] 单条规则就地编辑: 内嵌平台 LinkageRuleView 嵌入模式
//     (embedEditRuleId → [EDIT-DIRECT 2026-09-14] 直入简易模式 → vp6 编辑表单;
//     原 choice 三卡片链已下线), 与平台行内编辑
//     同组件同表单同链路 — 编辑器单一来源且不跳转 (用户停留在本场景页) ──
const editEmbedVisible = ref(false)
const editEmbedRuleId = ref('')
function openRuleEdit(row: LinkageRule) {
  editEmbedRuleId.value = row.id
  editEmbedVisible.value = true
}
function onEditEmbedClosed() {
  editEmbedVisible.value = false
  fetchAll()
}

/** [TRIGGER-DETAIL 2026-09-14] 触发详情: 跳转告警中心 (事件报警列表),
 *  按本规则 ID 过滤 — 告警中心读取 route.query.rule_id 服务端过滤 */
function openTriggerDetail(row: LinkageRule) {
  router.push({ path: '/alarms', query: { rule_id: row.id, rule_name: row.name || '' } })
}

function goPacks() { router.push('/video-perimeter/packs') }

onMounted(() => {
  fetchAll()
  ensureEventTypes() // 事件类型中文名预热 (非阻塞)
  loadAlarmNameDirectory() // [CH-BINDING-DISPLAY] 通道/设备目录预热 (绑定通道列名称反查)
})
</script>

<style scoped>
.vp-rules-page { padding: 4px 0; }
.rules-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.rules-toolbar { display: flex; gap: 8px; align-items: center; }
.rules-kw { width: 220px; }
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
/* [CH-BINDING-DISPLAY 2026-09-14] 绑定通道列: 长通道名截断 + 多 chip 换行 (tooltip 全名) */
.ch-bound-cell { display: inline-flex; flex-wrap: wrap; align-items: center; }
.ch-tag-txt { display: inline-block; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.more-ch { font-size: 11px; color: var(--el-text-color-secondary); }
/* [TRIGGER-DETAIL 2026-09-14] 触发条件列 (与平台联动规则页标签组同款) */
.condition-tags { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.cond-tag { font-size: 11px; }
.text-secondary { color: var(--el-text-color-secondary); font-size: 12px; }
.tpl-card { margin-top: 12px; }
.tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 6px 14px; }
.tpl-item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px;
            font-size: 12px; color: var(--el-text-color-secondary); }
.tpl-item.landed { color: var(--el-text-color-primary); }
.tpl-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.landed-mark { font-size: 11px; color: var(--el-color-success); flex-shrink: 0; }
</style>
