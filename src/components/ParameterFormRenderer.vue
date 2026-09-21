<template>
  <el-form ref="formRef" :model="valuesModel" label-position="top" size="small" class="pfr">
    <!-- ===== 灵敏度档位卡 (tier_member=true 键聚合; 规格 §5.2) ===== -->
    <div v-if="tier && tierKeys.length" class="pfr-tier-card">
      <div class="pfr-tier-head">
        <span class="pfr-tier-title">{{ isStyleTier ? '生成风格' : '灵敏度档位' }}</span>
        <el-tag v-if="tier.current" size="small" type="warning" effect="dark">
          当前: {{ tierLabel(tier.current) }}
        </el-tag>
      </div>
      <el-radio-group :model-value="tier.current" :disabled="readonly" size="small"
        @change="(t: any) => onTierChange(String(t))">
        <el-radio-button v-for="t in tierNames" :key="t" :value="t">
          {{ tierLabel(t) }}
        </el-radio-button>
      </el-radio-group>
      <p class="pfr-tier-hint">
        {{ isStyleTier
          ? '风格切换整组覆盖检测阈值（严格=高门槛低误报 / 标准=默认 / 创意=低门槛高召回），写入设备配置, 重启服务后生效。'
          : '档位切换整组覆盖下方档位参数（写入设备配置, 重启服务后生效）；手动修改档位内参数后将标记为「自定义 (custom)」。' }}
      </p>
      <el-alert v-if="tierTouched" type="warning" :closable="false" show-icon class="pfr-tier-alert"
        title="已手动调整档位内参数 — 保存后将标记为自定义档位 (custom)" />
    </div>

    <!-- ===== basic 参数 (直出) ===== -->
    <template v-for="p in basicRows" :key="p.key">
      <el-form-item :label="p.name" :prop="p.key" :rules="rulesOf(p)" class="pfr-item">
        <template #label>
          <span class="pfr-label">
            {{ p.name }}
            <el-tooltip v-if="p.description" :content="p.description" placement="top">
              <el-icon class="pfr-label-help"><QuestionFilled /></el-icon>
            </el-tooltip>
            <span v-if="p.tier_member" class="pfr-tier-dot" title="档位矩阵键">档</span>
          </span>
        </template>
        <!-- number -->
        <div v-if="p.type === 'number'" class="pfr-ctl-row">
          <el-input-number :model-value="numOf(p.key)" :min="p.min" :max="p.max"
            :step="p.step ?? 1" :precision="precisionOf(p)" :disabled="readonly"
            controls-position="right" class="pfr-ctl" @update:model-value="(v) => setField(p.key, v ?? 0)" />
          <span v-if="unitText(p.unit)" class="pfr-unit">{{ unitText(p.unit) }}</span>
        </div>
        <!-- boolean -->
        <el-switch v-else-if="p.type === 'boolean'" :model-value="boolOf(p.key)"
          :disabled="readonly" @update:model-value="(v) => setField(p.key, !!v)" />
        <!-- enum -->
        <el-select v-else-if="p.type === 'enum'" :model-value="strOf(p.key)" :disabled="readonly"
          class="pfr-ctl" @update:model-value="(v) => setField(p.key, v)">
          <el-option v-for="o in (p.options || [])" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <!-- string (widget=textarea = 多行文本域; M4-4 提示词面板) -->
        <el-input v-else-if="p.type === 'string' && p.widget === 'textarea'"
          type="textarea" :rows="3" :model-value="strOf(p.key)" :disabled="readonly"
          class="pfr-ctl" @update:model-value="(v) => setField(p.key, v)" />
        <!-- string -->
        <el-input v-else :model-value="strOf(p.key)" :disabled="readonly" class="pfr-ctl"
          @update:model-value="(v) => setField(p.key, v)" />
      </el-form-item>
    </template>

    <!-- ===== advanced 参数 (折叠) ===== -->
    <el-collapse v-if="advancedRows.length" class="pfr-adv">
      <el-collapse-item title="高级参数" name="adv">
        <template v-for="p in advancedRows" :key="p.key">
          <el-form-item :label="p.name" :prop="p.key" :rules="rulesOf(p)" class="pfr-item">
            <template #label>
              <span class="pfr-label">
                {{ p.name }}
                <el-tooltip v-if="p.description" :content="p.description" placement="top">
                  <el-icon class="pfr-label-help"><QuestionFilled /></el-icon>
                </el-tooltip>
                <span v-if="p.tier_member" class="pfr-tier-dot" title="档位矩阵键">档</span>
              </span>
            </template>
            <div v-if="p.type === 'number'" class="pfr-ctl-row">
              <el-input-number :model-value="numOf(p.key)" :min="p.min" :max="p.max"
                :step="p.step ?? 1" :precision="precisionOf(p)" :disabled="readonly"
                controls-position="right" class="pfr-ctl" @update:model-value="(v) => setField(p.key, v ?? 0)" />
              <span v-if="unitText(p.unit)" class="pfr-unit">{{ unitText(p.unit) }}</span>
            </div>
            <el-switch v-else-if="p.type === 'boolean'" :model-value="boolOf(p.key)"
              :disabled="readonly" @update:model-value="(v) => setField(p.key, !!v)" />
            <el-select v-else-if="p.type === 'enum'" :model-value="strOf(p.key)" :disabled="readonly"
              class="pfr-ctl" @update:model-value="(v) => setField(p.key, v)">
              <el-option v-for="o in (p.options || [])" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <el-input v-else-if="p.type === 'string' && p.widget === 'textarea'"
              type="textarea" :rows="3" :model-value="strOf(p.key)" :disabled="readonly"
              class="pfr-ctl" @update:model-value="(v) => setField(p.key, v)" />
            <el-input v-else :model-value="strOf(p.key)" :disabled="readonly" class="pfr-ctl"
              @update:model-value="(v) => setField(p.key, v)" />
          </el-form-item>
        </template>
      </el-collapse-item>
    </el-collapse>

    <!-- ===== audit 口径 (只读灰显) ===== -->
    <div v-if="auditRows.length" class="pfr-audit">
      <div v-for="p in auditRows" :key="p.key" class="pfr-audit-row">
        <span class="pfr-audit-name">{{ p.name }}</span>
        <el-tag size="small" type="info" effect="plain" class="pfr-audit-tag">审计口径</el-tag>
        <span class="pfr-audit-val">{{ strOf(p.key) || '—' }}</span>
      </div>
    </div>

    <!-- ===== calibration 口径 (不进通用表单, 显示管理入口提示) ===== -->
    <div v-if="calibrationRows.length" class="pfr-calib">
      <div v-for="p in calibrationRows" :key="p.key" class="pfr-calib-row">
        <span>{{ p.name }}</span>
        <span class="pfr-calib-hint">由区域绘制 / 标定配置体系管理（非本表单）</span>
      </div>
    </div>

    <!-- ===== 提交 ===== -->
    <div v-if="!readonly" class="pfr-footer">
      <el-button type="primary" size="small" :loading="submitting" @click="onSubmit">保存参数</el-button>
      <span class="pfr-save-hint">写入设备配置（自动备份）; 推理插件在服务启动时加载 — 重启后生效</span>
    </div>
  </el-form>
</template>

<script setup lang="ts">
/**
 * ParameterFormRenderer.vue — 参数元数据驱动表单渲染器 [M2-1 2026-09-21]
 *
 * 规格: docs/plans/算法参数元数据模型_规格_v1.0.md §5.1/§5.2
 *   - 零硬编码: 控件/校验/显隐/分组全部由 param_meta 十五字段驱动 —
 *     改 YAML param_meta（增删参数）→ 表单跟随变化, 前端零代码改动。
 *   - dependsOn 级联显隐: 隐藏不置空 (提交保留原值, 防「关开关丢配置」)。
 *   - scope 三分类: runtime 进表单 / audit 只读 / calibration 显示管理入口提示。
 *   - tier_member 聚合为灵敏度档位卡: 切换上抛 tier-change (父组件调 tier 端点
 *     整组覆盖); 手动改档位内键 → 本地提示 custom (后端 PUT config 同纪律标记)。
 *     [M4-4 2026-09-21] presets 键集 = strict/standard/creative 时卡切换为
 *     「生成风格」(严格/标准/创意, 开放词汇提示词面板); string 参数带
 *     widget=textarea 时渲染多行文本域。
 *   - 全受控组件 (无本地副本): 每次修改 emit 新对象, 与父 v-model 单向回流,
 *     规避 deep-watch 回写环。
 */
import { computed, ref } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { FormInstance } from 'element-plus'
import type { ParamMeta } from '@/api/algorithms'

const props = withDefaults(defineProps<{
  params: ParamMeta[]
  modelValue: Record<string, any>
  tier?: { current: string; presets: Record<string, Record<string, any>> } | null
  readonly?: boolean
  submitting?: boolean
}>(), {
  tier: null,
  readonly: false,
  submitting: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: Record<string, any>): void
  (e: 'submit', values: Record<string, any>): void
  (e: 'tier-change', tier: string): void
}>()

/** el-form :model — 全受控: 直接引用父值对象 (控件经 setField 回流) */
const valuesModel = computed(() => props.modelValue)

const TAG = '[ParameterFormRenderer]'

// ── scope/level 分组 ─────────────────────────────────────────────────────────
const runtimeParams = computed(() => props.params.filter((p) => p.scope === 'runtime'))

/** dependsOn 判定 (兼容 equals / in 两种形态; 缺省可见) */
function isVisible(p: ParamMeta): boolean {
  const dep = p.dependsOn
  if (!dep || !dep.key) return true
  const cur = props.modelValue[dep.key]
  if (Array.isArray(dep.in)) return dep.in.some((v) => v === cur)
  if ('equals' in dep) return dep.equals === cur
  return true
}

const basicRows = computed(() =>
  runtimeParams.value.filter((p) => p.level === 'basic' && isVisible(p)))
const advancedRows = computed(() =>
  runtimeParams.value.filter((p) => p.level === 'advanced' && isVisible(p)))
const auditRows = computed(() => props.params.filter((p) => p.scope === 'audit'))
const calibrationRows = computed(() => props.params.filter((p) => p.scope === 'calibration'))

const tierKeys = computed(() =>
  runtimeParams.value.filter((p) => p.tier_member).map((p) => p.key))

// ── 档位卡 ───────────────────────────────────────────────────────────────────
const TIER_LABEL: Record<string, string> = { high: '高灵敏', balanced: '平衡', low: '低误报' }
// [M4-4 2026-09-21] 生成风格三档 (开放词汇): 键名 = CosmoEdge 对标计划原文,
//   卡片标题与按钮标签切换为「生成风格 / 严格·标准·创意」(presets 键集合判定)
const STYLE_TIERS = ['strict', 'standard', 'creative']
const STYLE_TIER_LABEL: Record<string, string> = { strict: '严格', standard: '标准', creative: '创意' }
const tierNames = computed(() => Object.keys(props.tier?.presets || {}))
const isStyleTier = computed(() =>
  tierNames.value.length > 0 && tierNames.value.every((t) => STYLE_TIERS.includes(t)))
function tierLabel(t: string): string { return TIER_LABEL[t] ?? STYLE_TIER_LABEL[t] ?? t }
const tierTouched = ref(false)
function onTierChange(t: string) {
  tierTouched.value = false
  emit('tier-change', t)
}

// ── 值读写 (全受控回流) ───────────────────────────────────────────────────────
function setField(key: string, v: unknown) {
  if (props.readonly) return
  emit('update:modelValue', { ...props.modelValue, [key]: v })
  if (tierKeys.value.includes(key)) tierTouched.value = true
}
function numOf(key: string): number | undefined {
  const v = props.modelValue[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number(v)
  return v === '' || v == null || !Number.isFinite(n) ? undefined : n
}
function boolOf(key: string): boolean { return !!props.modelValue[key] }
function strOf(key: string): string {
  const v = props.modelValue[key]
  return v == null ? '' : String(v)
}
const UNIT_TEXT: Record<string, string> = { s: '秒', ms: '毫秒', frame: '帧', percent: '%', degree: '°' }
function unitText(u?: string): string { return u ? (UNIT_TEXT[u] ?? u) : '' }
/** 由 step 小数位推导 el-input-number precision (0.001 → 3) */
function precisionOf(p: ParamMeta): number {
  const s = String(p.step ?? 1)
  const dot = s.indexOf('.')
  return dot >= 0 ? s.length - dot - 1 : 0
}

// ── 校验规则 (schema → el-form rules) ────────────────────────────────────────
function rulesOf(p: ParamMeta): any[] {
  const rules: any[] = []
  if (p.type === 'number') {
    rules.push({ required: true, type: 'number', message: p.failedTip || `${p.name}需要数值`, trigger: 'blur' })
  } else if (p.type === 'enum') {
    rules.push({ required: true, message: p.failedTip || `请选择${p.name}`, trigger: 'change' })
  } else if (p.type === 'string' && p.regexpr) {
    try {
      rules.push({ pattern: new RegExp(p.regexpr), message: p.failedTip || '格式不正确', trigger: 'blur' })
    } catch (e) {
      console.warn(TAG, 'regexpr 非法, 跳过该规则', p.key, e)
    }
  }
  return rules
}

// ── 提交 (仅 runtime 键; 隐藏键保留原值 — §5.2「隐藏不置空」) ──────────────────
const formRef = ref<FormInstance>()
async function onSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return  // el-form 已就地提示; 不发起请求
  }
  const out: Record<string, unknown> = {}
  for (const p of runtimeParams.value) {
    if (p.key in props.modelValue) out[p.key] = props.modelValue[p.key]
  }
  emit('submit', out)
}
</script>

<style scoped>
.pfr { --pfr-border: #e8ecf1; }
.pfr-item { margin-bottom: 10px; }
.pfr-label { display: inline-flex; align-items: center; gap: 4px; }
.pfr-label-help { color: var(--el-text-color-placeholder); font-size: 13px; cursor: help; }
.pfr-tier-dot {
  font-size: 10px; line-height: 1; padding: 1px 3px; border-radius: 3px;
  color: var(--el-color-warning); border: 1px solid var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
}
.pfr-ctl-row { display: flex; align-items: center; gap: 6px; width: 100%; }
.pfr-ctl { width: 100%; }
.pfr-unit { flex-shrink: 0; font-size: 12px; color: var(--el-text-color-secondary); }
.pfr-tier-card {
  border: 1px solid var(--el-color-warning-light-5); border-radius: 6px;
  background: var(--el-color-warning-light-9); padding: 10px 12px; margin-bottom: 12px;
}
.pfr-tier-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.pfr-tier-title { font-weight: 600; font-size: 13px; }
.pfr-tier-hint { margin: 8px 0 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; }
.pfr-tier-alert { margin-top: 8px; }
.pfr-adv { border: none; margin-top: 4px; }
.pfr-adv :deep(.el-collapse-item__header) { font-size: 13px; color: var(--el-text-color-secondary); }
.pfr-adv :deep(.el-collapse-item__wrap) { border-bottom: none; }
.pfr-audit { margin-top: 6px; padding: 8px 10px; background: var(--el-fill-color-light); border-radius: 6px; }
.pfr-audit-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--el-text-color-secondary); padding: 3px 0; }
.pfr-audit-name { min-width: 96px; }
.pfr-audit-val { margin-left: auto; font-family: monospace; }
.pfr-calib { margin-top: 6px; }
.pfr-calib-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: 12px; color: var(--el-text-color-secondary); padding: 3px 0;
}
.pfr-calib-hint { color: var(--el-text-color-placeholder); font-size: 11px; }
.pfr-footer { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.pfr-save-hint { font-size: 11px; color: var(--el-text-color-placeholder); line-height: 1.4; }
</style>
