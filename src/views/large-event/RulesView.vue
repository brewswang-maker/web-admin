<template>
  <div class="le-rules-page">
    <!-- ===== 页头 ===== -->
    <div class="rules-header">
      <div>
        <h2 class="rules-title">事件规则</h2>
        <div class="rules-sub">
          大型活动联动规则实例 — 启用状态 / 事件类型 / 监控点绑定 / 触发条件; 由场景包「校验并布防」实例化 LE 模板生成
        </div>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
    </div>

    <!-- ===== 错误态 ===== -->
    <el-result v-if="loadError" icon="warning" title="规则加载失败" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">重试</el-button>
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
            <div class="stat-label">规则实例</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num ok">{{ enabledCount }}</div>
            <div class="stat-label">启用中</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num">{{ totalTriggers }}</div>
            <div class="stat-label">累计触发</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-num" :class="landmarkedCount === leTemplates.length ? 'ok' : ''">
              {{ landmarkedCount }}/{{ leTemplates.length }}
            </div>
            <div class="stat-label">LE 模板落地</div>
          </div>
        </el-col>
      </el-row>

      <!-- ===== 场景过滤 ===== -->
      <el-card shadow="never" class="filter-card">
        <el-radio-group v-model="sceneFilter" size="small">
          <el-radio-button label="">全部场景</el-radio-button>
          <el-radio-button v-for="s in sceneOptions" :key="s.tag" :label="s.tag">
            {{ s.label }}
          </el-radio-button>
        </el-radio-group>
        <span class="filter-count" v-if="sceneFilter">
          {{ filteredRules.length }} 条规则
        </span>
      </el-card>

      <!-- ===== 规则实例表 ===== -->
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>规则实例 ({{ filteredRules.length }})</span>
            <el-button size="small" type="primary" plain @click="goPacks">
              <el-icon><Box /></el-icon>&nbsp;去场景包布防
            </el-button>
          </div>
        </template>
        <el-table :data="filteredRules" size="small"
                  :empty-text="rules.length === 0
                    ? '暂无大型活动规则 — 先在「场景包」页执行 校验并布防'
                    : '该场景下暂无规则'">
          <!-- [TRIGGER-DETAIL 2026-09-14] 列重排: 序号/报警级别/事件类型/联动规则名称/
               绑定设备通道/状态/触发条件/操作 (触发条件与平台联动规则页同款;
               操作新增「触发详情」→ 告警中心按本规则过滤事件) -->
          <el-table-column type="index" label="序号" width="60" align="center" />
          <el-table-column label="报警级别" width="90" align="center">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="ruleLevelInfo(row.source_cond?.min_severity).tagType">
                {{ ruleLevelInfo(row.source_cond?.min_severity).label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="事件类型" min-width="200">
            <template #default="{ row }">
              <!-- [UX-ZH 2026-09-16] 中文名展示 (SSOT canonical), tooltip 保留裸 key (对齐周界 RulesView) -->
              <el-tag v-for="t in (row.source_cond?.event_types ?? []).slice(0, 2)"
                      :key="t" size="small" effect="plain" class="evt-tag">
                <span :title="t">{{ zh(t) }}</span>
              </el-tag>
              <el-tooltip v-if="(row.source_cond?.event_types?.length ?? 0) > 2"
                          :content="zhAll(row.source_cond?.event_types ?? [])" placement="top">
                <el-tag size="small" type="info" effect="plain">
                  +{{ (row.source_cond?.event_types?.length ?? 0) - 2 }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="联动规则名称" min-width="240">
            <template #default="{ row }">
              <div class="rule-cell">
                <span class="rule-name">{{ row.name }}</span>
                <span class="rule-id mono">{{ row.id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="绑定设备监控点" width="200">
            <template #default="{ row }">
              <!-- [CH-BINDING-DISPLAY 2026-09-14] 真实绑定展示 (缺陷修复):
                   原只读 source_cond.channel_ids — 布防通道写在 bound_channel_ids /
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
              <el-tag v-else size="small" type="success" effect="plain">全部监控点</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <!-- [SCENE-RULE-TOGGLE 2026-09-08] 行内启停开关 (对齐 perimeter 范式:
                   PUT /linkage/rules/{id} 只传 enabled; loading 防连点, 失败不落库) -->
              <el-switch size="small" :model-value="row.enabled"
                :loading="togglingId === row.id" :disabled="togglingId === row.id"
                :style="togglingId === row.id ? 'opacity: 0.7' : ''"
                @change="toggleRule(row)" />
            </template>
          </el-table-column>
          <el-table-column label="触发条件" min-width="200">
            <template #default="{ row }">
              <!-- [TRIGGER-DETAIL 2026-09-14] 与平台联动规则页同款 (useRuleTriggerTags SSOT):
                   时间/空间/事件源/合并 四类标签; 全空 = 无条件 -->
              <div class="condition-tags">
                <el-tag v-for="tag in ruleTriggerTags(row)" :key="tag.key" size="small" effect="plain" class="cond-tag">{{ tag.label }}</el-tag>
                <span v-if="ruleTriggerTags(row).length === 0" class="text-secondary">无条件</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" align="center">
            <template #default="{ row }">
              <!-- [FEAT 2026-09-02] 单条就地编辑: 点哪条只编辑哪条 -->
              <el-button size="small" link type="primary" @click="openRuleEdit(row)">编辑</el-button>
              <!-- [TRIGGER-DETAIL 2026-09-14] 触发详情: 跳转告警中心按本规则过滤事件列表 -->
              <el-button size="small" link type="primary" @click="openTriggerDetail(row)">触发详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- ===== LE 模板落地对照 ===== -->
      <el-card shadow="never" class="tpl-card">
        <template #header>
          <div class="card-header">
            <span>LE 联动模板落地对照 ({{ landmarkedCount }}/{{ leTemplates.length }})</span>
            <span class="hint">未落地的模板可在场景包页「校验并布防」实例化</span>
          </div>
        </template>
        <div class="tpl-grid">
          <el-tooltip v-for="t in leTemplates" :key="t.template_id"
                      :content="`${t.template_id} · ${t.description ?? ''}`" placement="top">
            <div class="tpl-item" :class="{ landed: isLanded(t.template_id) }">
              <el-icon :size="13" :color="isLanded(t.template_id) ? '#67c23a' : '#c0c4cc'">
                <CircleCheckFilled />
              </el-icon>
              <span class="tpl-name">{{ t.name }}</span>
              <span v-if="isLanded(t.template_id)" class="landed-mark">已落地</span>
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
 * 事件规则 — EventGuard T2.5b (apply v2 配套视图, 2026-08-28)
 *
 * 大型活动联动规则聚合视图 (纯前端聚合, 零后端专用接口):
 *   - 规则实例: GET /linkage/rules?tag=large_event (apply v2 布防产物, 稳定 rule_id)
 *   - 触发统计: GET /linkage/rule-stats (trigger_count / last_trigger_ms)
 *   - LE 模板落地对照: GET /linkage/rule-templates 中 LE-* × 规则 tags 交叉
 *   - 通道绑定: bound_channel_ids ∪ device_ids ∪ channel_ids ∪ location_id (四源全空 = 全部通道)
 *     [CH-BINDING-DISPLAY 2026-09-14] 原只读 source_cond.channel_ids, 布防通道恒空误判全通道;
 *     现由 useRuleChannelDisplay 统一解析 (与 LinkageEngine 运行时收窄同口径)
 * 编辑跳转系统联动规则页 /linkage (不在本页重复实现编辑器)。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CircleCheckFilled, Refresh, Box } from '@element-plus/icons-vue'

import { linkageApi, unwrapRuleTemplates } from '@/api/linkage'
import type { LinkageRule, RuleTriggerStat, RuleTemplate } from '@/api/linkage'
// [CH-BINDING-DISPLAY 2026-09-14] 绑定通道真实展示 (四源综合 + 目录名称反查)
import { displayRuleBoundChannels, type BoundChannelDisplay } from '@/composables/useRuleChannelDisplay'
// [TRIGGER-DETAIL 2026-09-14] 触发条件标签 + 报警级别渲染 (平台页同款 SSOT)
import { ruleTriggerTags, ruleLevelInfo } from '@/composables/useRuleTriggerTags'
// [UX-ZH 2026-09-16] 事件类型中文名展示 (SSOT canonical 单例缓存; 对齐周界/酒店等场景页)
import { useEventTypeZh } from '@/composables/useEventTypeZh'
import { loadAlarmNameDirectory } from '@/composables/useAlarmDeviceLabel'
// [SCENE-EDIT-INPLACE 2026-09-03] 就地编辑: 内嵌平台编辑器 (嵌入模式, 编辑器单一来源)
import LinkageRuleView from '@/views/LinkageRuleView.vue'
import { largeEventApi } from '@/api/largeEvent'
import type { ScenePack } from '@/types/largeEvent'

const router = useRouter()
// [UX-ZH 2026-09-16] 事件类型中文名 (tooltip 保留裸 key 供排查)
const { zh, zhAll, ensure: ensureEventTypesZh } = useEventTypeZh()

const loading = ref(false)
const loadError = ref('')
const rules = ref<LinkageRule[]>([])
const stats = ref<RuleTriggerStat[]>([])
const leTemplates = ref<RuleTemplate[]>([])
const packs = ref<ScenePack[]>([])
const sceneFilter = ref('')

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

const sceneOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const p of packs.value) if (!seen.has(p.scene_tag)) seen.set(p.scene_tag, p.display_name)
  return [...seen.entries()].map(([tag, label]) => ({ tag, label }))
})

const filteredRules = computed(() =>
  sceneFilter.value ? rules.value.filter(r => r.tags?.includes(sceneFilter.value)) : rules.value)

const landmarkedCount = computed(() =>
  leTemplates.value.filter(t => isLanded(t.template_id)).length)

function statOf(rule: LinkageRule): RuleTriggerStat | undefined {
  return stats.value.find(s => s.rule_id === rule.id)
}

function isLanded(templateId: string): boolean {
  return rules.value.some(r => r.tags?.includes(templateId))
}

// ─── [SCENE-RULE-TOGGLE 2026-09-08] 行内启停 (对齐 perimeter/RulesView 范式) ───
//     PUT /linkage/rules/{id} 只传 enabled (后端 contains 守卫不丢绑定);
//     成功才落本地状态 (失败开关回弹), togglingId 全局单飞防连点。
const togglingId = ref('')
async function toggleRule(rule: LinkageRule) {
  if (togglingId.value) return
  const next = !rule.enabled
  togglingId.value = rule.id
  try {
    await linkageApi.updateRule(rule.id, { enabled: next } as Partial<LinkageRule>)
    rule.enabled = next
    ElMessage.success(`规则「${rule.name || rule.id}」已${next ? '启用' : '停用'}`)
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    ElMessage.error(`规则「${rule.name || rule.id}」启停失败: ${msg}`)
  } finally {
    togglingId.value = ''
  }
}

async function fetchAll() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await linkageApi.getRules({ tag: 'large_event' })
    rules.value = res.data?.data?.items ?? []
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    loadError.value = msg.includes('404')
      ? '接口 404: 页面脚本与后端版本不匹配, 请强制刷新 (Ctrl+F5) 后重试'
      : `请求异常: ${msg}`
    rules.value = []
    ElMessage.warning(`规则加载失败: ${msg}`)
  } finally {
    loading.value = false
  }
  // 统计与模板为增强信息, 失败静默降级 (不阻断主表)
  try {
    const res = await linkageApi.getRuleStats()
    stats.value = res.data?.data?.rules ?? []
  } catch { stats.value = [] }
  try {
    const res = await linkageApi.getRuleTemplates()
    const list = unwrapRuleTemplates(res.data?.data)
    leTemplates.value = list.filter(
      (t: RuleTemplate) => t.template_id?.startsWith('LE-'))
  } catch { leTemplates.value = [] }
  try {
    const res = await largeEventApi.listScenePacks()
    packs.value = res.data?.data?.scene_packs ?? []
  } catch { packs.value = [] }
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

function goPacks() { router.push('/large-event/scene-packs') }

onMounted(() => {
  fetchAll()
  ensureEventTypesZh() // [UX-ZH 2026-09-16] 事件类型中文名预热 (SSOT canonical)
  loadAlarmNameDirectory() // [CH-BINDING-DISPLAY] 通道/设备目录预热 (绑定通道列名称反查)
})
</script>

<style scoped>
.le-rules-page { padding: 4px 0; }
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
