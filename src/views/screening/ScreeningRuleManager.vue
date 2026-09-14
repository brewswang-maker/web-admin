<template>
  <div class="rule-manager">
    <!-- ===== 顶部说明 ===== -->
    <el-alert
      type="info" :title="'安检生效规则管理'" :closable="false" show-icon class="hint-alert"
      :description="`已生效联动规则 (区别于模板库): 启停/编辑/删除走 PUT/DELETE /linkage/rules/:id, 实时生效 (无需重启)。dry-run 为本地匹配预演 (对照规则 event_types/min_severity), 不触发真实联动。`" />

    <!-- ===== 筛选栏 + dry-run ===== -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-input v-model="filters.keyword" placeholder="按名称 / ID 搜索" clearable style="width: 200px">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="filters.eventType" placeholder="事件类型" clearable style="width: 190px">
          <el-option v-for="e in SCREENING_EVENTS" :key="e.key" :label="`${e.name} (${e.key})`" :value="e.key" />
        </el-select>
        <el-select v-model="filters.severity" placeholder="最低级别" clearable style="width: 130px">
          <el-option v-for="s in RULE_SEVERITY_LEVELS" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-select v-model="filters.state" placeholder="状态" clearable style="width: 110px">
          <el-option label="已启用" :value="1" />
          <el-option label="已停用" :value="0" />
        </el-select>
        <el-checkbox v-model="filters.screeningOnly">仅安检相关</el-checkbox>
        <div class="spacer" />
        <el-tag effect="plain" type="info">共 {{ filteredRules.length }} / {{ rules.length }} 条</el-tag>
        <el-button size="small" :loading="loading" @click="loadRules">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>

      <!-- dry-run 面板 -->
      <el-divider class="dry-divider" />
      <div class="dry-row">
        <span class="dry-label"><el-icon><Promotion /></el-icon> dry-run 模拟:</span>
        <el-select v-model="dry.eventType" placeholder="模拟事件" style="width: 190px">
          <el-option v-for="e in SCREENING_EVENTS" :key="e.key" :label="`${e.name} (${e.key})`" :value="e.key" />
        </el-select>
        <el-select v-model="dry.severity" placeholder="级别" style="width: 110px">
          <el-option v-for="s in RULE_SEVERITY_LEVELS" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-button size="small" type="warning" plain :disabled="!dry.eventType" @click="runDry">
          模拟匹配
        </el-button>
        <el-tag v-if="dry.hitIds !== null" :type="dry.hitIds.length ? 'success' : 'info'" effect="dark">
          命中 {{ dry.hitIds.length }} 条规则
        </el-tag>
        <el-button v-if="dry.hitIds !== null" size="small" text @click="dry.hitIds = null">清除</el-button>
      </div>
    </el-card>

    <!-- ===== 规则表 ===== -->
    <el-table :data="pagedRules" v-loading="loading" size="small" stripe
              :row-class-name="dryRowClass" data-test="rule-table">
      <!-- [TRIGGER-DETAIL 2026-09-14] 列重排: 序号/报警级别/事件类型/联动规则名称/
           绑定设备通道/状态/触发条件/操作 (触发条件与平台联动规则页同款;
           操作新增「触发详情」→ 告警中心按本规则过滤事件) -->
      <el-table-column type="index" label="序号" width="60" align="center"
                       :index="(i: number) => (page - 1) * pageSize + i + 1" />
      <el-table-column label="报警级别" width="90" align="center">
        <template #default="{ row }">
          <el-tag size="small" effect="plain" :type="ruleLevelInfo(row.source_cond?.min_severity).tagType">
            {{ ruleLevelInfo(row.source_cond?.min_severity).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="事件类型" min-width="200">
        <template #default="{ row }">
          <template v-if="(row.source_cond?.event_types || []).length">
            <el-tag v-for="e in (row.source_cond.event_types as string[]).slice(0, 2)" :key="e"
                    size="small" effect="plain" class="evt-tag">{{ e }}</el-tag>
            <el-tooltip v-if="(row.source_cond.event_types as string[]).length > 2"
                        :content="(row.source_cond.event_types as string[]).slice(2).join(', ')">
              <el-tag size="small" type="info" effect="plain">+{{ (row.source_cond.event_types as string[]).length - 2 }}</el-tag>
            </el-tooltip>
          </template>
          <el-tag v-else size="small" type="warning" effect="plain">通配 (全部事件)</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="联动规则名称" min-width="220">
        <template #default="{ row }">
          <div class="r-name">{{ row.name }}</div>
          <div class="r-id">{{ row.id }}</div>
        </template>
      </el-table-column>
      <el-table-column label="绑定设备通道" width="200">
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
          <el-tag v-else size="small" type="success" effect="plain">全部通道</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="70">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" :loading="toggling[row.id]"
                     @change="(v: any) => toggleRule(row, v)" />
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
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
          <!-- [TRIGGER-DETAIL 2026-09-14] 触发详情: 跳转告警中心按本规则过滤事件列表 -->
          <el-button size="small" text type="primary" @click="openTriggerDetail(row)">触发详情</el-button>
          <el-button size="small" text type="danger" @click="removeRule(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination v-if="filteredRules.length > pageSize" class="pager"
                   layout="prev, pager, next" :page-size="pageSize"
                   :total="filteredRules.length" v-model:current-page="page" />

    <!-- ===== 编辑抽屉 ===== -->
    <el-drawer v-model="editVisible" :title="`编辑规则 · ${editing?.name || ''}`" size="520px" direction="rtl">
      <div v-if="editing" class="edit-body">
        <el-form label-width="100px" label-position="left">
          <el-form-item label="规则名称">
            <el-input v-model="editForm.name" maxlength="60" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="editForm.enabled" />
          </el-form-item>
          <el-form-item label="优先级">
            <el-input-number v-model="editForm.priority" :min="1" :max="100" />
            <span class="form-hint">数值越大越优先 (80+ 高危)</span>
          </el-form-item>
          <el-form-item label="合并抑制">
            <el-input-number v-model="editForm.cooldown_ms" :min="0" :step="1000" />
            <span class="form-hint">ms, 同规则两次触发最小间隔</span>
          </el-form-item>
          <el-form-item label="最低级别">
            <el-select v-model="editForm.min_severity" style="width: 160px">
              <el-option v-for="s in RULE_SEVERITY_LEVELS" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
            <span class="form-hint">低于该级别的事件不触发</span>
          </el-form-item>
          <el-form-item label="触发事件">
            <el-select v-model="editForm.event_types" multiple filterable style="width: 100%"
                       placeholder="留空 = 通配全部事件">
              <el-option v-for="e in SCREENING_EVENTS" :key="e.key" :label="`${e.name} (${e.key})`" :value="e.key" />
            </el-select>
            <span class="form-hint">安检常用事件集; 其他事件类型暂不在列表 (不影响存量配置)</span>
          </el-form-item>
        </el-form>
        <div class="edit-footer">
          <el-button @click="editVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveEdit">保存 (PUT)</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 安检生效规则管理 — P2-1 (2026-08-29 gap audit)
 * 复用后端已就绪 API (RestApiHandlers L13872-14409, 前端此前未接):
 *   GET /linkage/rules/all  PUT/DELETE /linkage/rules/:id
 * 与 ScreeningRules.vue (模板库) 互补: 模板一键应用 → 本页管理生效规则。
 * dry-run 为本地匹配预演: 对照 event_types (含 SSOT 别名归一语义简化为
 * 精确/通配) 与 min_severity, 不发请求不触发联动。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Refresh, Promotion } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { screeningApi, type LinkageRuleInfo } from '@/api/screening'
// [TRIGGER-DETAIL 2026-09-14] 触发条件标签 + 报警级别渲染 (平台页同款 SSOT);
//   RULE_SEVERITY_LEVELS 为原本地 SEVERITY_LEVELS 的共享升级 (词汇同源, 删本地重复)
import { ruleTriggerTags, ruleLevelInfo, RULE_SEVERITY_LEVELS } from '@/composables/useRuleTriggerTags'
// [CH-BINDING-DISPLAY 2026-09-14] 绑定通道真实展示 (四源综合 + 目录名称反查)
import { displayRuleBoundChannels, type BoundChannelDisplay } from '@/composables/useRuleChannelDisplay'
import { loadAlarmNameDirectory } from '@/composables/useAlarmDeviceLabel'

/** 安检场景事件集 (与 EventTypeAliases.h scene_tags security_screening 对齐) */
const SCREENING_EVENTS: Array<{ key: string; name: string }> = [
  { key: 'face_blacklist', name: '黑名单拦截' },
  { key: 'face_stranger', name: '陌生人' },
  { key: 'face_verify_fail', name: '人证失败' },
  { key: 'face_liveness_fail', name: '活体失败' },
  { key: 'face_tailgate', name: '闸机尾随' },
  { key: 'tailgate', name: '尾随通行' },
  { key: 'face_visitor_expired', name: '访客过期' },
  { key: 'face_pass_whitelist', name: '白名单通行' },
  { key: 'face_pass_visitor', name: '访客通行' },
  { key: 'face_pass_vip', name: 'VIP通行' },
  { key: 'face_pass_staff', name: '员工通行' },
  { key: 'face_pass_custom', name: '自定义通行' },
  { key: 'body_temp_abnormal', name: '体温异常' },
  { key: 'mask_violation', name: '口罩违规' },
  { key: 'unattended_baggage', name: '行李无人看管' },
  { key: 'person_with_backpack', name: '人包绑定' },
  { key: 'abandoned', name: '遗留物' },
  { key: 'object_removal', name: '移走物' },
  { key: 'dangerous_item', name: '违禁品' },
  { key: 'weapon_detected', name: '武器' },
  { key: 'loitering', name: '徘徊' },
  { key: 'wrong_direction', name: '逆行' },
  { key: 'climbing', name: '翻越' },
  { key: 'intrusion', name: '入侵' },
  { key: 'tripwire', name: '越界' },
  { key: 'running', name: '奔跑' },
  { key: 'fight', name: '打架' },
  { key: 'crowd', name: '人群聚集' },
  { key: 'queue_length', name: '排队长度' },
  { key: 'guard_absence', name: '离岗' },
  { key: 'sleep_on_duty', name: '睡岗' },
  { key: 'phone_call', name: '打电话' },
  { key: 'smoking', name: '抽烟' },
  { key: 'lpr_pass', name: '车牌通行' },
  { key: 'lpr_violation', name: '车牌违规' },
]

const screeningKeys = new Set(SCREENING_EVENTS.map(e => e.key))
const router = useRouter()
const loading = ref(false)
const rules = ref<LinkageRuleInfo[]>([])
const toggling = reactive<Record<string, boolean>>({})
const saving = ref(false)
const page = ref(1)
const pageSize = 20

const filters = reactive({ keyword: '', eventType: '', severity: null as number | null, state: null as number | null, screeningOnly: true })
const dry = reactive({ eventType: '', severity: 3, hitIds: null as string[] | null })

const filteredRules = computed(() => {
  return rules.value.filter(r => {
    if (filters.keyword &&
        !r.name.toLowerCase().includes(filters.keyword.toLowerCase()) &&
        !r.id.toLowerCase().includes(filters.keyword.toLowerCase())) return false
    if (filters.state !== null && (r.enabled ? 1 : 0) !== filters.state) return false
    const evts = r.source_cond?.event_types || []
    if (filters.eventType && !evts.includes(filters.eventType)) return false
    if (filters.severity !== null && (r.source_cond?.min_severity ?? 0) !== filters.severity) return false
    if (filters.screeningOnly && evts.length > 0 && !evts.some(e => screeningKeys.has(e))) return false
    return true
  })
})
const pagedRules = computed(() =>
  filteredRules.value.slice((page.value - 1) * pageSize, page.value * pageSize))

function isWildcardHit(r: LinkageRuleInfo): boolean {
  return !(r.source_cond?.event_types || []).length
}

function runDry() {
  const hits: string[] = []
  for (const r of rules.value) {
    if (!r.enabled) continue
    const evts = r.source_cond?.event_types || []
    if (evts.length && !evts.includes(dry.eventType)) continue
    if ((r.source_cond?.min_severity ?? 0) > dry.severity) continue
    hits.push(r.id)
  }
  dry.hitIds = hits
  if (hits.length) {
    ElMessage.success(`模拟事件 ${dry.eventType}(级别${dry.severity}) 将命中 ${hits.length} 条规则`)
  } else {
    ElMessage.warning('无命中 — 该事件当前不会触发任何联动')
  }
}

function dryRowClass({ row }: { row: LinkageRuleInfo }): string {
  return dry.hitIds?.includes(row.id) ? 'dry-hit-row' : ''
}

async function loadRules() {
  loading.value = true
  try {
    const resp = await screeningApi.listAllRules()
    const data = resp.data?.data
    rules.value = Array.isArray(data?.items) ? data.items : []
  } catch (e) {
    console.error('[RuleManager] load failed', e)
    ElMessage.error(`规则加载失败: ${(e as Error)?.message || e}`)
  } finally {
    loading.value = false
  }
}

async function toggleRule(row: LinkageRuleInfo, v: boolean) {
  toggling[row.id] = true
  try {
    await screeningApi.updateRule(row.id, { enabled: v })
    row.enabled = v
    ElMessage.success(`规则「${row.name}」已${v ? '启用' : '停用'}`)
  } catch (e) {
    ElMessage.error(`启停失败: ${(e as Error)?.message || e}`)
  } finally {
    toggling[row.id] = false
  }
}

async function removeRule(row: LinkageRuleInfo) {
  try {
    await ElMessageBox.confirm(
      `确认删除规则「${row.name}」(${row.id})? 删除后该事件不再执行此联动。`,
      '删除规则', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch { return }
  try {
    await screeningApi.deleteRule(row.id)
    rules.value = rules.value.filter(r => r.id !== row.id)
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error(`删除失败: ${(e as Error)?.message || e}`)
  }
}

// ── 编辑 ──
const editVisible = ref(false)
const editing = ref<LinkageRuleInfo | null>(null)
const editForm = reactive({
  name: '', enabled: true, priority: 50, cooldown_ms: 5000,
  min_severity: 0, event_types: [] as string[],
})

function openEdit(row: LinkageRuleInfo) {
  editing.value = row
  editForm.name = row.name
  editForm.enabled = row.enabled
  editForm.priority = row.priority
  editForm.cooldown_ms = row.cooldown_ms
  editForm.min_severity = row.source_cond?.min_severity ?? 0
  editForm.event_types = [...(row.source_cond?.event_types || [])]
  editVisible.value = true
}

async function saveEdit() {
  if (!editing.value) return
  saving.value = true
  try {
    await screeningApi.updateRule(editing.value.id, {
      name: editForm.name,
      enabled: editForm.enabled,
      priority: editForm.priority,
      cooldown_ms: editForm.cooldown_ms,
      source_cond: {
        ...(editing.value.source_cond || {}),
        min_severity: editForm.min_severity,
        event_types: editForm.event_types,
      },
    })
    Object.assign(editing.value, {
      name: editForm.name, enabled: editForm.enabled,
      priority: editForm.priority, cooldown_ms: editForm.cooldown_ms,
    })
    if (editing.value.source_cond) {
      editing.value.source_cond.min_severity = editForm.min_severity
      editing.value.source_cond.event_types = [...editForm.event_types]
    }
    ElMessage.success('规则已更新')
    editVisible.value = false
  } catch (e) {
    ElMessage.error(`保存失败: ${(e as Error)?.message || e}`)
  } finally {
    saving.value = false
  }
}

// ── 展示辅助 ──
// [CH-BINDING-DISPLAY 2026-09-14] 绑定通道列展示映射 (按 rules 预计算; 目录异步就绪后
//   chNameById/devChsById ref 变更自动重算 — 未就绪窗口期内展示原始标识不误判全通道)
const boundMap = computed(() => {
  const m = new Map<string, BoundChannelDisplay>()
  for (const r of rules.value) m.set(r.id, displayRuleBoundChannels(r))
  return m
})
function boundInfoOf(row: LinkageRuleInfo): BoundChannelDisplay {
  return boundMap.value.get(row.id) ?? { allChannels: true, items: [], tooltip: '' }
}

// [TRIGGER-DETAIL 2026-09-14] 触发详情: 跳转告警中心 (事件报警列表),
//   按本规则 ID 过滤 — 告警中心读取 route.query.rule_id 服务端过滤
function openTriggerDetail(row: LinkageRuleInfo) {
  router.push({ path: '/alarms', query: { rule_id: row.id, rule_name: row.name || '' } })
}

onMounted(() => {
  loadRules()
  loadAlarmNameDirectory() // [CH-BINDING-DISPLAY] 通道/设备目录预热 (绑定通道列名称反查)
})
</script>

<style scoped>
/*.rule-manager { padding: 16px; }*/
.hint-alert { margin-bottom: 16px; }
.filter-card { margin-bottom: 16px; }
.filter-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.spacer { flex: 1; }
.dry-divider { margin: 12px 0; }
.dry-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dry-label { color: #909399; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }
.r-name { font-weight: 500; }
.r-id { font-family: monospace; font-size: 11px; color: #909399; }
.evt-tag { margin-right: 4px; font-family: monospace; }
/* [CH-BINDING-DISPLAY 2026-09-14] 绑定通道列: 长通道名截断 + 多 chip 换行 (tooltip 全名) */
.ch-bound-cell { display: inline-flex; flex-wrap: wrap; align-items: center; }
.ch-tag { margin: 0 2px 2px 0; }
.ch-tag-txt { display: inline-block; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.more-ch { font-size: 11px; color: #909399; }
/* [TRIGGER-DETAIL 2026-09-14] 触发条件列 (与平台联动规则页标签组同款) */
.condition-tags { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.cond-tag { font-size: 11px; }
.text-secondary { color: #909399; font-size: 12px; }
.pager { margin-top: 12px; justify-content: flex-end; }
.edit-body { padding: 0 8px; }
.edit-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.form-hint { margin-left: 8px; color: #909399; font-size: 12px; }
:deep(.dry-hit-row) { background: #fdf6ec !important; }
</style>
