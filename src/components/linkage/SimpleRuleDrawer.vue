<template>
  <!-- ═══ [vp8 双模式 2026-09-01] 简易创建抽屉: choice → template/tune/custom 状态机 ═══
       模板优先 (对标华为好望场景包 + 大华 DSS 模板三分法) + 极简字段 (NNG 渐进式披露):
       90% 日常规则 ≤3 步完成; 高级治理能力 (互斥/抑制/VLM/条件树) 全部留给高级模式。 -->
  <el-drawer
    :model-value="modelValue"
    :title="drawerTitle"
    size="520px"
    direction="rtl"
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="srd-body">
      <!-- 编辑含高级配置的规则时提示 (字段在简易视图不可见, 引导切高级) -->
      <el-alert v-if="advancedHints?.length" type="warning" :closable="false" style="margin-bottom: 12px">
        <template #title>
          此规则包含高级配置: {{ advancedHints!.join(' / ') }} — 建议切换到高级模式编辑
        </template>
      </el-alert>

      <!-- ── 视图 1: 入口选择 ── -->
      <template v-if="view === 'choice'">
        <div class="srd-hero">
          <div class="srd-card" @click="view = 'template'">
            <el-icon class="srd-card-icon"><CopyDocument /></el-icon>
            <div class="srd-card-main">
              <div class="srd-card-title">从模板库选择 <el-tag size="small" type="success" effect="dark">推荐</el-tag></div>
              <div class="srd-card-desc">行业 / 场景 / 事件分类模板, 选一条微调即可生效, 约 30 秒</div>
            </div>
            <el-icon class="srd-card-arrow"><ArrowRight /></el-icon>
          </div>
          <div class="srd-card" @click="view = 'custom'">
            <el-icon class="srd-card-icon"><EditPen /></el-icon>
            <div class="srd-card-main">
              <div class="srd-card-title">自定义创建</div>
              <div class="srd-card-desc">只保留高频字段: 名称 / 事件 / 动作 / 时间 / 通道</div>
            </div>
            <el-icon class="srd-card-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
        <el-divider />
        <div class="srd-foot-hint">
          需要互斥组 / 抑制链 / VLM 复核 / 条件树等治理能力?
          <el-button link type="primary" @click="emitSwitchAdvanced(null)">切换到高级模式 →</el-button>
        </div>
      </template>

      <!-- ── 视图 2: 模板选择 ── -->
      <template v-else-if="view === 'template'">
        <TemplateGallery :selected-tags="[]" @apply-template="onPickTemplate" />
      </template>

      <!-- ── 视图 3: 模板微调 (4 必填字段) ── -->
      <template v-else-if="view === 'tune' && picked">
        <el-alert type="success" :closable="false" style="margin-bottom: 12px">
          <template #title>
            模板「{{ picked.name }}」: {{ picked.actions?.length || 0 }} 个动作已带入{{ actionSummary }}
          </template>
        </el-alert>
        <el-form label-position="top" size="default">
          <el-form-item label="规则名称" required>
            <el-input v-model="tune.name" placeholder="例: 大门周界入侵-夜间联动" />
          </el-form-item>
          <el-form-item label="触发事件类型" required>
            <el-select v-model="tune.eventTypes" multiple filterable placeholder="选择触发事件" style="width: 100%">
              <el-option v-for="o in eventTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="设备与通道">
            <DeviceChannelPicker v-model="tuneScope" />
          </el-form-item>
          <el-form-item label="启用时间">
            <div class="srd-time">
              <el-radio-group v-model="tune.timePreset" size="small">
                <el-radio-button value="all">全天</el-radio-button>
                <el-radio-button value="day">白天</el-radio-button>
                <el-radio-button value="night">夜间</el-radio-button>
                <el-radio-button value="custom">自定义</el-radio-button>
              </el-radio-group>
              <div v-if="tune.timePreset !== 'all'" class="srd-time-detail">
                <template v-if="tune.timePreset === 'custom'">
                  <el-time-picker v-model="tune.timeStart" format="HH:mm" placeholder="开始" style="width: 110px" />
                  <span class="srd-time-sep">~</span>
                  <el-time-picker v-model="tune.timeEnd" format="HH:mm" placeholder="结束" style="width: 110px" />
                </template>
                <span v-else class="srd-time-hint">{{ timePresetHint(tune.timePreset) }}</span>
                <el-checkbox-group v-if="tune.timePreset === 'custom'" v-model="tune.weekdays">
                  <el-checkbox v-for="(d, i) in WEEK_LABELS" :key="d" :value="i + 1">{{ d }}</el-checkbox>
                </el-checkbox-group>
              </div>
            </div>
          </el-form-item>
        </el-form>
      </template>

      <!-- ── 视图 4: 自定义创建 (极简字段) ── -->
      <template v-else-if="view === 'custom'">
        <el-form label-position="top" size="default">
          <el-form-item label="规则名称" required>
            <el-input v-model="custom.name" placeholder="例: 消防通道占用联动" />
          </el-form-item>
          <el-form-item label="触发事件类型">
            <el-select v-model="custom.eventTypes" multiple filterable placeholder="不选 = 所有事件 (通配)" style="width: 100%">
              <el-option v-for="o in eventTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="联动动作 (可多选)" required>
            <div class="srd-actions">
              <el-checkbox
                v-for="a in COMMON_ACTIONS" :key="a.key"
                :model-value="custom.actions.includes(a.key)"
                @update:model-value="() => toggleAction(a.key)"
                border
              >{{ a.label }}</el-checkbox>
            </div>
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="优先级">
                <el-input-number v-model="custom.priority" :min="1" :max="100" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="冷却时间 (ms)">
                <el-input-number v-model="custom.cooldownMs" :min="1000" :step="1000" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="设备与通道">
            <DeviceChannelPicker v-model="customScope" />
          </el-form-item>
          <el-form-item label="启用时间">
            <div class="srd-time">
              <el-radio-group v-model="custom.timePreset" size="small">
                <el-radio-button value="all">全天</el-radio-button>
                <el-radio-button value="day">白天</el-radio-button>
                <el-radio-button value="night">夜间</el-radio-button>
                <el-radio-button value="custom">自定义</el-radio-button>
              </el-radio-group>
              <div v-if="custom.timePreset !== 'all'" class="srd-time-detail">
                <template v-if="custom.timePreset === 'custom'">
                  <el-time-picker v-model="custom.timeStart" format="HH:mm" placeholder="开始" style="width: 110px" />
                  <span class="srd-time-sep">~</span>
                  <el-time-picker v-model="custom.timeEnd" format="HH:mm" placeholder="结束" style="width: 110px" />
                </template>
                <span v-else class="srd-time-hint">{{ timePresetHint(custom.timePreset) }}</span>
                <el-checkbox-group v-if="custom.timePreset === 'custom'" v-model="custom.weekdays">
                  <el-checkbox v-for="(d, i) in WEEK_LABELS" :key="d" :value="i + 1">{{ d }}</el-checkbox>
                </el-checkbox-group>
              </div>
            </div>
          </el-form-item>
        </el-form>
      </template>
    </div>

    <template #footer>
      <div class="srd-footer">
        <template v-if="view === 'template'">
          <el-button @click="view = 'choice'">返回</el-button>
          <div style="flex: 1" />
          <el-button link type="primary" @click="emitSwitchAdvanced(null)">切换到高级模式 →</el-button>
        </template>
        <template v-else-if="view === 'tune'">
          <el-button @click="view = 'template'">重选模板</el-button>
          <div style="flex: 1" />
          <el-button type="primary" :loading="committing" @click="saveFromTemplate">保存并生效</el-button>
        </template>
        <template v-else-if="view === 'custom'">
          <el-button @click="view = 'choice'">返回</el-button>
          <div style="flex: 1" />
          <el-button link type="primary" @click="emitSwitchAdvanced(collectCustomPatch())">需要更多动作 / 高级配置? 切高级 →</el-button>
          <el-button type="primary" :loading="committing" @click="saveFromCustom">保存</el-button>
        </template>
        <template v-else>
          <div style="flex: 1" />
          <el-button @click="emit('update:modelValue', false)">关闭</el-button>
        </template>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
// [vp8 双模式 2026-09-01] 简易创建抽屉。数据层零变更: 全部字段经 commit 事件交由
// 父视图 (LinkageRuleView) 写入同一 LinkageRuleInfo payload, 保存链/校验唯一复用。
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight, CopyDocument, EditPen } from '@element-plus/icons-vue'
import type { RuleTemplate } from '@/api/linkage'
import { useLinkageOptions } from '@/composables/useLinkageOptions'
import TemplateGallery from './TemplateGallery.vue'
import DeviceChannelPicker from './DeviceChannelPicker.vue'

export interface SimpleCommitPatch {
  name: string
  eventTypes: string[]
  channelIds: number[]
  deviceIds: string[]
  timePreset: 'all' | 'day' | 'night' | 'custom'
  timeStart: string
  timeEnd: string
  weekdays: number[]
  /** custom 分支: 动作 key 列表 (ACTION_TYPE_MAP 的 key); 模板分支不传 (动作由模板带入) */
  actions?: string[]
  priority?: number
  cooldownMs?: number
  /** 模板分支: 整包模板 (父视图走 applyTemplateToForm 保动作参数) */
  template?: RuleTemplate | null
}

const props = defineProps<{
  modelValue: boolean
  /** 编辑态检测到的高级配置提示 (互斥组/VLM/条件树…) */
  advancedHints?: string[]
  committing?: boolean
  /** 编辑态: 打开时携带规则回填草稿, 直接进自定义视图预填 */
  initialPatch?: SimpleCommitPatch | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'commit', p: SimpleCommitPatch): void
  (e: 'switch-advanced', p: SimpleCommitPatch | null): void
}>()

const { eventTypeOptions } = useLinkageOptions()

// ── 视图状态机 ──
type View = 'choice' | 'template' | 'tune' | 'custom'
const view = ref<View>('choice')
const picked = ref<RuleTemplate | null>(null)
const committing = computed(() => !!props.committing)

const drawerTitle = computed(() => {
  const t: Record<View, string> = {
    choice: '新建联动规则 · 简易模式',
    template: '从模板创建 · 选择模板',
    tune: '从模板创建 · 微调并生效',
    custom: '自定义创建 · 简易模式',
  }
  return t[view.value]
})

// 打开时重置状态机 (编辑态: 携带 initialPatch 直接进自定义视图预填)
watch(() => props.modelValue, (v) => {
  if (!v) return
  picked.value = null
  resetTune()
  resetCustom()
  const p = props.initialPatch
  if (p) {
    Object.assign(custom, {
      name: p.name, eventTypes: [...(p.eventTypes || [])], channelIds: [...(p.channelIds || [])], deviceIds: [...(p.deviceIds || [])],
      timePreset: p.timePreset || 'all', timeStart: p.timeStart || '08:00', timeEnd: p.timeEnd || '20:00',
      weekdays: [...(p.weekdays?.length ? p.weekdays : [1, 2, 3, 4, 5])],
      actions: [...(p.actions || [])], priority: p.priority ?? 50, cooldownMs: p.cooldownMs ?? 5000,
    })
    view.value = 'custom'
  } else {
    view.value = 'choice'
  }
})

// ── 简易常用动作 (真机 24 条存量规则 top6, 占比 ~90%) ──
const COMMON_ACTIONS = [
  { key: 'WEB_POPUP', label: 'Web 弹窗' },
  { key: 'CLIENT_CAPTURE_IMAGE', label: '客户端抓图' },
  { key: 'SYS_HTTP_CALLBACK', label: 'HTTP 工单回调' },
  { key: 'APP_PUSH_NOTIFY', label: 'APP 推送' },
  { key: 'CLIENT_ALARM_OUTPUT', label: '声光报警输出' },
  { key: 'CLIENT_SHOW_LIVE', label: '客户端弹直播' },
] as const

/** 模板动作类型 → 中文名 (摘要展示用, 覆盖常用, 兜底显示编号) */
const ACTION_LABELS: Record<number, string> = {
  100: '客户端弹直播', 105: 'TTS 播报', 109: '执行预案', 112: '事件录像', 114: '客户端抓图',
  115: '声光报警输出', 116: '云台控制', 200: 'Web 弹窗', 201: '邮件', 212: 'Web 弹图',
  215: 'Web 抓图', 300: 'APP 推送', 304: 'APP 处置', 503: '继电器开关', 504: 'HTTP 工单回调',
}

// ── 时间四档 (真机 91% 使用率但均为简单时段; night 跨夜与高级表单同语义) ──
interface TuneForm {
  name: string; eventTypes: string[]; channelIds: number[]; deviceIds: string[]
  timePreset: 'all' | 'day' | 'night' | 'custom'; timeStart: string; timeEnd: string; weekdays: number[]
}
const tune = reactive<TuneForm>({ name: '', eventTypes: [], channelIds: [], deviceIds: [], timePreset: 'all', timeStart: '08:00', timeEnd: '20:00', weekdays: [1, 2, 3, 4, 5] })
const custom = reactive<TuneForm & { actions: string[]; priority: number; cooldownMs: number }>(
  { name: '', eventTypes: [], channelIds: [], deviceIds: [], timePreset: 'all', timeStart: '08:00', timeEnd: '20:00', weekdays: [1, 2, 3, 4, 5], actions: [], priority: 50, cooldownMs: 5000 })

function resetTune() { Object.assign(tune, { name: '', eventTypes: [], channelIds: [], deviceIds: [], timePreset: 'all', timeStart: '08:00', timeEnd: '20:00', weekdays: [1, 2, 3, 4, 5] }) }
function resetCustom() { Object.assign(custom, { name: '', eventTypes: [], channelIds: [], deviceIds: [], timePreset: 'all', timeStart: '08:00', timeEnd: '20:00', weekdays: [1, 2, 3, 4, 5], actions: [], priority: 50, cooldownMs: 5000 }) }

/** DeviceChannelPicker v-model 代理 (reactive 字段 → 对象) */
const tuneScope = computed({
  get: () => ({ deviceIds: tune.deviceIds, channelIds: tune.channelIds }),
  set: (v: { deviceIds: string[]; channelIds: number[] }) => { tune.deviceIds = v.deviceIds; tune.channelIds = v.channelIds },
})
const customScope = computed({
  get: () => ({ deviceIds: custom.deviceIds, channelIds: custom.channelIds }),
  set: (v: { deviceIds: string[]; channelIds: number[] }) => { custom.deviceIds = v.deviceIds; custom.channelIds = v.channelIds },
})

function toggleAction(key: string) {
  const i = custom.actions.indexOf(key)
  if (i >= 0) custom.actions.splice(i, 1)
  else custom.actions.push(key)
}

/** 模板动作摘要 (tune 提示条) */
const actionSummary = computed(() => {
  const list = (picked.value?.actions || []).slice(0, 4).map((a: any) => ACTION_LABELS[a.type] || `动作${a.type}`)
  const more = (picked.value?.actions?.length || 0) - list.length
  return list.length ? ` (${list.join('/')}${more > 0 ? ` 等 ${more + list.length} 项` : ''})` : ''
})

// ── 模板选择 → 微调视图预填 ──
function onPickTemplate(t: RuleTemplate) {
  picked.value = t
  const src: any = (t as any).source_cond || {}
  tune.name = t.name || ''
  tune.eventTypes = [...(src.algorithm_ids?.length ? src.algorithm_ids : (src.event_types || []))]
  tune.channelIds = [...(src.channel_ids || [])].map(Number).filter(n => !Number.isNaN(n))
  tune.deviceIds = [...(src.device_ids || [])]
  const tc: any = (t as any).time_cond || {}
  tune.timeStart = tc.time_start || '08:00'
  tune.timeEnd = tc.time_end || '20:00'
  tune.weekdays = tc.weekdays?.length ? [...tc.weekdays] : [1, 2, 3, 4, 5]
  tune.timePreset = guessPreset(tune.timeStart, tune.timeEnd, tune.weekdays)
  view.value = 'tune'
}

function guessPreset(s: string, e: string, wd: number[]): 'all' | 'day' | 'night' | 'custom' {
  if (!s && !e) return 'all'
  if (s === '08:00' && e === '20:00' && wd.length === 5 && wd.join() === '1,2,3,4,5') return 'day'
  if (s === '20:00' && e === '07:00' && wd.length === 7) return 'night'
  return 'custom'
}

function validateCommon(f: TuneForm): boolean {
  if (!f.name.trim()) { ElMessage.warning('请输入规则名称'); return false }
  if (f.eventTypes.length === 0) {
    ElMessage.warning('请至少选择一个触发事件类型 (通配规则请用高级模式)')
    return false
  }
  return true
}

function saveFromTemplate() {
  if (!validateCommon(tune)) return
  emit('commit', {
    name: tune.name.trim(), eventTypes: [...tune.eventTypes], channelIds: [...tune.channelIds], deviceIds: [...tune.deviceIds],
    timePreset: tune.timePreset, timeStart: tune.timeStart, timeEnd: tune.timeEnd, weekdays: [...tune.weekdays],
    template: picked.value,
  })
}

function collectCustomPatch(): SimpleCommitPatch {
  return {
    name: custom.name.trim(), eventTypes: [...custom.eventTypes], channelIds: [...custom.channelIds], deviceIds: [...custom.deviceIds],
    timePreset: custom.timePreset, timeStart: custom.timeStart, timeEnd: custom.timeEnd, weekdays: [...custom.weekdays],
    actions: [...custom.actions], priority: custom.priority, cooldownMs: custom.cooldownMs, template: null,
  }
}

function saveFromCustom() {
  if (!validateCommon(custom)) return
  if (custom.actions.length === 0) { ElMessage.warning('请至少选择一个联动动作'); return }
  emit('commit', collectCustomPatch())
}

/** 切换高级模式: 携带当前草稿 (choice 视图传 null) */
function emitSwitchAdvanced(p: SimpleCommitPatch | null) {
  emit('switch-advanced', p)
}

// ── 时间四档展示辅助 ──
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']
function timePresetHint(p: 'day' | 'night'): string {
  return p === 'day' ? '工作日 08:00 ~ 20:00' : '每日 20:00 ~ 次日 07:00'
}
</script>

<style scoped>
.srd-body { padding: 0 2px; }
.srd-hero { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.srd-card { display: flex; align-items: center; gap: 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 18px 16px; cursor: pointer; transition: box-shadow .15s, border-color .15s; }
.srd-card:hover { border-color: var(--el-color-primary); box-shadow: var(--el-box-shadow-light); }
.srd-card-icon { font-size: 28px; color: var(--el-color-primary); }
.srd-card-main { flex: 1; min-width: 0; }
.srd-card-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.srd-card-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.srd-card-arrow { color: var(--el-text-color-placeholder); }
.srd-foot-hint { font-size: 12px; color: var(--el-text-color-secondary); text-align: center; }
.srd-actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; width: 100%; }
.srd-footer { display: flex; align-items: center; gap: 8px; }
.srd-time { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.srd-time-detail { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.srd-time-sep { color: var(--el-text-color-secondary); }
.srd-time-hint { font-size: 12px; color: var(--el-text-color-secondary); }
/* 平板 1024px 适配 */
@media (max-width: 1180px) { .srd-actions { grid-template-columns: 1fr; } }
</style>
