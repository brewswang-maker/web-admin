<template>
  <!-- [FEAT 2026-09-02] 事件规则「单条」就地编辑抽屉 (完整版) — 五个场景 RulesView 共用
       (hotel-unattended / large-event / gas-station / school / perimeter)。
       覆盖平台联动规则页高频编辑字段: 基本信息 / 触发条件(事件类型·严重度·置信度·绑定通道·
       设备) / 生效时段(time_cond) / 防误检合并(merge_cond) / 动作启停(actions 轻量) /
       高级治理(互斥·抑制·VLM·关闭条件·响应时限)。动作参数编排仍到平台页。 -->
  <el-drawer :model-value="visible" direction="rtl" size="600px"
    :with-header="true" :show-close="true" :close-on-click-modal="false"
    class="rule-edit-drawer" :title="`事件规则编辑 — ${rule?.name ?? ''}`"
    @update:model-value="(v: boolean) => emit('update:visible', v)">
    <div class="red-body" v-if="rule">
      <div class="red-meta">
        <el-tag v-if="isSceneDefault" size="small" type="warning" effect="dark">场景默认</el-tag>
        <el-tag :type="rule.enabled ? 'success' : 'info'" size="small" effect="plain">
          {{ rule.enabled ? '已启用' : '已停用' }}
        </el-tag>
        <span class="red-sub mono">{{ rule.id }}</span>
      </div>

      <el-form :model="rule" label-width="92px" size="small" class="red-form" @submit.prevent>
        <!-- ═══ 基本信息 ═══ -->
        <div class="red-sec-title">基本信息</div>
        <el-form-item label="规则名称">
          <el-input v-model="rule.name" placeholder="规则显示名" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="rule.description" type="textarea" :rows="2"
            placeholder="规则用途说明 (选填)" />
        </el-form-item>
        <el-row :gutter="8">
          <el-col :span="8">
            <el-form-item label="启用">
              <el-switch v-model="rule.enabled" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="优先级">
              <el-input-number v-model="rule.priority" :min="1" :max="100" :step="5" size="small" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="冷却(ms)">
              <el-input-number v-model="rule.cooldown_ms" :min="1000" :max="60000" :step="1000" size="small" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- ═══ 触发条件 ═══ -->
        <div class="red-sec-title">触发条件</div>
        <el-form-item label="事件类型">
          <el-select v-model="rule.source_cond.event_types" multiple collapse-tags collapse-tags-tooltip
            placeholder="选择事件类型 (来自 /event-types/canonical SSOT)" style="width:100%">
            <el-option v-for="et in canonicalTypes" :key="et.key" :label="et.name_zh" :value="et.key" />
          </el-select>
        </el-form-item>
        <el-row :gutter="8">
          <el-col :span="12">
            <el-form-item label="最低严重度">
              <el-select v-model="rule.source_cond.min_severity" style="width:100%">
                <el-option label="0-不限" :value="0" /><el-option label="1-提示" :value="1" />
                <el-option label="2-低" :value="2" /><el-option label="3-中" :value="3" />
                <el-option label="4-高" :value="4" /><el-option label="5-紧急" :value="5" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最低置信度">
              <el-slider v-model="confidencePct" :min="0" :max="100" :step="5"
                :format-tooltip="(v: number) => `${v}%`" style="width:92%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="绑定通道">
          <el-select v-model="rule.source_cond.channel_ids" multiple filterable clearable collapse-tags
            collapse-tags-tooltip placeholder="不选 = 全部通道生效" style="width:100%" :loading="optionsLoading">
            <el-option v-for="ch in channelOptions" :key="ch.value" :label="ch.label" :value="ch.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="设备过滤">
          <el-select v-model="rule.source_cond.device_ids" multiple filterable allow-create
            placeholder="不选 = 全部设备生效" style="width:100%">
            <el-option v-for="d in deviceOptions" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>

        <!-- ═══ 生效时段 (time_cond) ═══ -->
        <div class="red-sec-title">生效时段 <span class="red-sec-hint">留空 = 全天候</span></div>
        <el-row :gutter="8">
          <el-col :span="12">
            <el-form-item label="开始时间">
              <el-time-picker v-model="timeStartValue" format="HH:mm" placeholder="起始"
                style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间">
              <el-time-picker v-model="timeEndValue" format="HH:mm" placeholder="结束"
                style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="生效日">
          <el-checkbox-group v-model="rule.time_cond.weekdays">
            <el-checkbox v-for="d in WEEKDAYS" :key="d.value" :label="d.label" :value="d.value" size="small" />
          </el-checkbox-group>
        </el-form-item>

        <!-- ═══ 防误检合并 (merge_cond) ═══ -->
        <div class="red-sec-title">防误检合并</div>
        <el-row :gutter="8">
          <el-col :span="6">
            <el-form-item label="启用">
              <el-switch v-model="rule.merge_cond.enabled" />
            </el-form-item>
          </el-col>
          <el-col :span="9">
            <el-form-item label="窗口(秒)">
              <el-input-number v-model="mergeWindowSec" :min="1" :max="300" :step="5"
                :disabled="!rule.merge_cond.enabled" size="small" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="9">
            <el-form-item label="最少次数">
              <el-input-number v-model="rule.merge_cond.max_merge_count" :min="1" :max="20" :step="1"
                :disabled="!rule.merge_cond.enabled" size="small" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- ═══ 动作列表 (actions 轻量: 启停 + 延迟; 参数编排到平台页) ═══ -->
        <div class="red-sec-title">动作列表 <span class="red-sec-hint">{{ enabledActionCount }}/{{ (rule.actions || []).length }} 项启用 · 参数编排请到平台页</span></div>
        <el-empty v-if="(rule.actions || []).length === 0" description="无动作" :image-size="40" />
        <div v-for="(a, i) in rule.actions" :key="i" class="red-action-item">
          <el-tag size="small" type="primary" effect="plain">{{ actionTypeName(a) }}</el-tag>
          <span class="red-action-name">{{ a.name || '-' }}</span>
          <span class="red-action-delay">
            延迟 <el-input-number v-model="a.delay_ms" :min="0" :max="60000" :step="500"
              size="small" style="width:104px" controls-position="right" /> ms
          </span>
          <el-switch v-model="a.enabled" size="small" />
        </div>

        <!-- ═══ 高级选项 ═══ -->
        <el-collapse class="red-collapse">
          <el-collapse-item title="高级选项 (冲突处理 / VLM 研判 / 治理)" name="adv">
            <el-form-item label="互斥组">
              <el-input v-model="rule.mutex_group" placeholder="同组规则同时刻仅触发最高优先级 (选填)" />
            </el-form-item>
            <el-row :gutter="8">
              <el-col :span="12">
                <el-form-item label="抑制低优先">
                  <el-switch v-model="rule.suppress_lower_priority" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="VLM 二次研判">
                  <el-switch v-model="rule.enable_vlm_verify" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="8">
              <el-col :span="12">
                <el-form-item label="关闭条件">
                  <el-select v-model="rule.close_condition" clearable placeholder="未设置" style="width:100%">
                    <el-option label="人工关闭" value="manual" />
                    <el-option label="事件自动关闭" value="auto_event_close" />
                    <el-option label="超时自动关闭" value="timeout" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="响应时限(秒)">
                  <el-input-number v-model="rule.response_deadline_s" :min="0" :max="86400" :step="30"
                    size="small" style="width:100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <div class="red-hint">被抑制于规则: {{ rule.suppress_after_rule || '—' }} · 标签: {{ (rule.tags || []).join(', ') || '—' }} (场景标签由布防维护, 此处不改)</div>
          </el-collapse-item>
        </el-collapse>

        <div class="red-actions">
          <el-button size="small" @click="resetRule">重置</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="saveRule">保存该规则</el-button>
        </div>
      </el-form>
    </div>
    <el-empty v-else description="未选中规则" :image-size="60" />
    <template #footer>
      <el-button size="small" link type="primary" @click="emit('goto-platform')">在平台联动规则页打开</el-button>
      <el-button size="small" type="danger" link @click="removeRule">删除该规则</el-button>
      <el-button @click="emit('update:visible', false)">关闭</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  linkageApi, ACTION_TYPE_REVERSE_MAP, type LinkageRule,
} from '@/api/linkage'
import eventTypesApi, { type CanonicalEventType } from '@/api/eventTypes'
import { useLinkageOptions } from '@/composables/useLinkageOptions'

const props = defineProps<{ visible: boolean; rule: LinkageRule | null }>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'saved'): void
  (e: 'deleted'): void
  (e: 'goto-platform'): void
}>()

const saving = ref(false)
const snapshot = ref('')
const deviceOptions = ref<string[]>([])
const canonicalTypes = ref<CanonicalEventType[]>([])
const { channelOptions, loading: optionsLoading, fetchOptions } = useLinkageOptions()

const WEEKDAYS = [
  { label: '一', value: 1 }, { label: '二', value: 2 }, { label: '三', value: 3 },
  { label: '四', value: 4 }, { label: '五', value: 5 }, { label: '六', value: 6 }, { label: '日', value: 7 },
]

const isSceneDefault = computed(() => {
  const tags = ((props.rule as any)?.tags || []) as string[]
  if (tags.includes('scene-default')) return true
  if (tags.includes('scene_template')) return true
  if ((props.rule as any)?.scene_tag || (props.rule as any)?.sceneTag) return true
  return false
})

const enabledActionCount = computed(() =>
  (props.rule?.actions || []).filter((a: any) => a.enabled).length)

function actionTypeName(a: { type: number; name?: string }): string {
  return ACTION_TYPE_REVERSE_MAP[a.type] ?? `type:${a.type}`
}

// ── 换算视图: 置信度 0~1 ↔ 百分比 / 合并窗口 ms ↔ 秒 / time_cond "HH:mm" ↔ Date ──
const confidencePct = computed({
  get: () => Math.round(((props.rule?.source_cond as any)?.min_confidence ?? 0) * 100),
  set: (v: number) => { if (props.rule) (props.rule.source_cond as any).min_confidence = v / 100 },
})
const mergeWindowSec = computed({
  get: () => Math.round((props.rule?.merge_cond?.window_ms ?? 30000) / 1000),
  set: (v: number) => { if (props.rule?.merge_cond) props.rule.merge_cond.window_ms = v * 1000 },
})
function hmToDate(hm?: string): Date | null {
  if (!hm) return null
  const [h, m] = hm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const d = new Date(2000, 0, 1, h, m, 0)
  return Number.isNaN(d.getTime()) ? null : d
}
function dateToHm(d: Date | null): string {
  if (!d) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const timeStartValue = computed({
  get: () => hmToDate(props.rule?.time_cond?.time_start),
  set: (v: Date | null) => { if (props.rule?.time_cond) props.rule.time_cond.time_start = dateToHm(v) },
})
const timeEndValue = computed({
  get: () => hmToDate(props.rule?.time_cond?.time_end),
  set: (v: Date | null) => { if (props.rule?.time_cond) props.rule.time_cond.time_end = dateToHm(v) },
})

// 打开/切换规则: 兜底嵌套字段 + 快照 (重置回滚) + 选项加载
watch(() => [props.visible, props.rule?.id], async ([vis]) => {
  const r = props.rule
  if (!vis || !r) return
  // 嵌套结构兜底 (老规则可能缺字段)
  const src = (r.source_cond = (r.source_cond || ({} as any))) as any
  src.channel_ids ??= []; src.device_ids ??= []; src.event_types ??= []
  src.min_severity ??= 0; src.min_confidence ??= 0; src.algorithm_ids ??= []
  r.time_cond = r.time_cond || ({ time_start: '', time_end: '', weekdays: [], monthdays: [] } as any)
  r.time_cond.weekdays ??= []; r.time_cond.monthdays ??= []
  r.merge_cond = r.merge_cond || ({ enabled: false, window_ms: 30000, max_merge_count: 2, merge_by: 'event_type' } as any)
  r.actions ??= []
  r.mutex_group ??= ''; r.suppress_after_rule ??= ''
  r.suppress_lower_priority ??= false; r.enable_vlm_verify ??= false
  r.close_condition ??= ''; r.response_deadline_s ??= 0
  snapshot.value = JSON.stringify(r)
  const devSet = new Set<string>((src.device_ids ?? []) as string[])
  deviceOptions.value = Array.from(devSet)
  // SSOT 事件类型 + 通道选项 (失败静默降级: 下拉空, 其余字段仍可编辑)
  if (canonicalTypes.value.length === 0) {
    eventTypesApi.list()
      .then((res: any) => { canonicalTypes.value = res.data?.data?.types ?? (res.data as any)?.types ?? [] })
      .catch(() => { /* 降级 */ })
  }
  if (channelOptions.value.length === 0) fetchOptions().catch(() => { /* 降级 */ })
}, { immediate: true })

/** 重置: 从打开时快照恢复 */
function resetRule() {
  const r = props.rule
  if (!r || !snapshot.value) return
  Object.assign(r, JSON.parse(snapshot.value))
  ElMessage.info('已重置为原始配置')
}

/** 保存单条: PUT /linkage/rules/{id} */
async function saveRule() {
  const r = props.rule
  if (!r) return
  saving.value = true
  try {
    const src = (r.source_cond || {}) as any
    if (!r.enabled) src.device_ids = []   // 停用时不限维度
    if (!src.event_types || src.event_types.length === 0) {
      ElMessage.warning('事件类型不能为空')
      return
    }
    const resp = await linkageApi.updateRule(r.id, { ...r, source_cond: src })
    if (resp?.status >= 400 || (resp?.data && resp.data.code && resp.data.code !== 0 && resp.data.code !== 200)) {
      throw new Error(resp?.data?.message || `HTTP ${resp?.status}`)
    }
    ElMessage.success(isSceneDefault.value ? '场景默认规则已更新 (模板同步)' : '规则已保存')
    snapshot.value = JSON.stringify(r)
    emit('saved')
  } catch (e: any) {
    ElMessage.error(`保存失败: ${e?.message ?? e}`)
  } finally {
    saving.value = false
  }
}

/** 删除单条 (二次确认) */
async function removeRule() {
  const r = props.rule
  if (!r) return
  try {
    await ElMessageBox.confirm(
      `将删除规则「${r.name}」, 删除后不可恢复。`, '删除规则',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch { return }
  try {
    await linkageApi.deleteRule(r.id)
    ElMessage.success('规则已删除')
    emit('update:visible', false)
    emit('deleted')
  } catch (e: any) {
    ElMessage.error(`删除失败: ${e?.message ?? e}`)
  }
}
</script>

<style scoped>
.red-body { padding: 0 4px; }
.red-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.red-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.mono { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 11px; }
.red-sec-title { font-size: 13px; font-weight: 600; margin: 14px 0 8px; padding-left: 8px;
                 border-left: 3px solid var(--el-color-primary); }
.red-sec-hint { font-size: 11px; font-weight: normal; color: var(--el-text-color-secondary); margin-left: 6px; }
.red-form :deep(.el-form-item) { margin-bottom: 10px; }
.red-action-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px;
                   border: 1px solid var(--el-border-color-lighter); border-radius: 6px; margin-bottom: 6px; }
.red-action-name { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.red-action-delay { font-size: 11px; color: var(--el-text-color-secondary); display: flex; align-items: center; gap: 4px; }
.red-collapse { margin-top: 14px; border: none; }
.red-hint { font-size: 11px; color: var(--el-text-color-secondary); line-height: 1.6; }
.red-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
