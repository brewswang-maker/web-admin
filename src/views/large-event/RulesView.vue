<template>
  <div class="le-rules-page">
    <!-- ===== 页头 ===== -->
    <div class="rules-header">
      <div>
        <h2 class="rules-title">事件规则</h2>
        <div class="rules-sub">
          大型活动联动规则实例 — 启用状态 / 事件类型 / 通道绑定 / 触发统计; 由场景包「校验并布防」实例化 LE 模板生成
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
          <el-table-column label="规则" min-width="240">
            <template #default="{ row }">
              <div class="rule-cell">
                <span class="rule-name">{{ row.name }}</span>
                <span class="rule-id mono">{{ row.id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="事件类型" min-width="200">
            <template #default="{ row }">
              <el-tag v-for="t in (row.source_cond?.event_types ?? []).slice(0, 2)"
                      :key="t" size="small" effect="plain" class="evt-tag">{{ t }}</el-tag>
              <el-tooltip v-if="(row.source_cond?.event_types?.length ?? 0) > 2"
                          :content="(row.source_cond?.event_types ?? []).join(', ')" placement="top">
                <el-tag size="small" type="info" effect="plain">
                  +{{ (row.source_cond?.event_types?.length ?? 0) - 2 }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="绑定通道" width="150">
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
              <el-tag v-else size="small" type="success" effect="plain">全部通道</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="来源" min-width="130">
            <template #default="{ row }">
              <span class="pack-name">{{ packNameOf(row) || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="触发统计" width="170">
            <template #default="{ row }">
              <div class="stat-cell">
                <span class="trig-count">{{ statOf(row)?.trigger_count ?? 0 }} 次触发</span>
                <span class="trig-last">最近 {{ fmtTime(statOf(row)?.last_trigger_ms) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center">
            <template #default>
              <el-button size="small" link type="primary" @click="goLinkage">去编辑</el-button>
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
 *   - 通道绑定: source_cond.channel_ids (空 = 全部通道)
 * 编辑跳转系统联动规则页 /linkage (不在本页重复实现编辑器)。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CircleCheckFilled, Refresh, Box } from '@element-plus/icons-vue'
import { linkageApi, unwrapRuleTemplates } from '@/api/linkage'
import type { LinkageRule, RuleTriggerStat, RuleTemplate } from '@/api/linkage'
import { largeEventApi } from '@/api/largeEvent'
import type { ScenePack } from '@/types/largeEvent'

const router = useRouter()

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

function packNameOf(rule: LinkageRule): string {
  const pid = (rule.tags ?? []).find(t => t.startsWith('large_event_') && t.endsWith('_v1'))
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
function goLinkage() { router.push('/linkage') }
function goPacks() { router.push('/large-event/scene-packs') }

onMounted(() => { fetchAll() })
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
