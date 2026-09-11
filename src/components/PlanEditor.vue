<!--
  PlanEditor.vue — 预案编辑器 (规则选择 + 定时布撤防)
  参考：海康 iSecure Center 预案管理面板
-->
<template>
  <el-dialog v-model="visible" :title="isEdit ? '编辑预案' : '新建预案'" width="640px" @close="onClose">
    <el-form :model="form" label-width="100px">
      <el-form-item label="预案ID" required>
        <el-input v-model="form.plan_id" :disabled="isEdit" placeholder="唯一标识" />
      </el-form-item>
      <el-form-item label="名称" required>
        <el-input v-model="form.name" placeholder="预案名称" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="预案描述" />
      </el-form-item>
      <el-form-item label="图标">
        <el-input v-model="form.icon" placeholder="emoji或图标名" />
      </el-form-item>

      <el-divider>关联规则</el-divider>
      <el-form-item label="选择规则">
        <el-select v-model="form.rule_ids" multiple filterable placeholder="选择联动规则" style="width: 100%">
          <el-option v-for="r in allRules" :key="r.id" :label="r.name" :value="r.id">
            <span>{{ r.name }}</span>
            <el-tag size="small" :type="r.enabled ? 'success' : 'info'" style="margin-left: 8px">{{ r.enabled ? '启用' : '禁用' }}</el-tag>
          </el-option>
        </el-select>
      </el-form-item>
      <div v-if="form.rule_ids.length" class="selected-rules">
        <el-tag v-for="rid in form.rule_ids" :key="rid" closable @close="removeRule(rid)" style="margin: 2px">
          {{ getRuleName(rid) }}
        </el-tag>
      </div>

      <el-divider>定时布撤防</el-divider>
      <el-form-item label="启用定时">
        <el-switch v-model="form.schedule.enabled" />
      </el-form-item>
      <template v-if="form.schedule.enabled">
        <el-form-item label="布防时间">
          <el-time-picker v-model="form.schedule.arm_time" format="HH:mm" value-format="HH:mm" placeholder="开始布防" />
        </el-form-item>
        <el-form-item label="撤防时间">
          <el-time-picker v-model="form.schedule.disarm_time" format="HH:mm" value-format="HH:mm" placeholder="结束撤防" />
        </el-form-item>
        <!-- [STAGE1 P1-2 2026-09-10] 预案排程 4 模板 chip (与 LinkageRuleView
             时间条件同口径, 华为 ivm_02_0043); 点击仅改 draft, 不动保存。
             周日值由 0 → 7 与 LinkagePlan.weekdays 1..7 口径统一 (PlanEditor
             此前为 0 与 API 不一致, 此处同步修正并向下兼容显示)。 -->
        <el-form-item label="快速模板">
          <div class="schedule-preset-chips">
            <el-tooltip v-for="p in SCHEDULE_PRESETS" :key="p.id" :content="p.tooltip" placement="top" :show-after="200">
              <el-tag
                class="schedule-preset-chip"
                :class="{ 'is-active': isSchedulePresetActive(p) }"
                effect="plain"
                round
                size="small"
                @click="applySchedulePreset(p)"
              >{{ p.label }}</el-tag>
            </el-tooltip>
          </div>
        </el-form-item>
        <el-form-item label="生效日">
          <el-checkbox-group v-model="form.schedule.weekdays">
            <el-checkbox :label="1">周一</el-checkbox>
            <el-checkbox :label="2">周二</el-checkbox>
            <el-checkbox :label="3">周三</el-checkbox>
            <el-checkbox :label="4">周四</el-checkbox>
            <el-checkbox :label="5">周五</el-checkbox>
            <el-checkbox :label="6">周六</el-checkbox>
            <!-- [STAGE1 P1-2 2026-09-10] 口径修正: 0 → 7 (与 LinkageRule/
                 LinkagePlan weekdays 1..7 对齐; 后端 LinkageEngine 判定以
                 1..7 为准, 0 会与周一冲突导致全周全选时周日不生效)。 -->
            <el-checkbox :label="7">周日</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { linkageApi } from '@/api/linkage'
import type { LinkageRule, LinkagePlan } from '@/api/linkage'

// [STAGE1 P1-2 2026-09-10] 预案排程 4 模板 (与 LinkageRuleView.TIME_PRESETS 同口径);
//   华为 ivm_02_0043: 全天候=7×24, 工作日=周一-五, 周末=六-日, 工作时间=周一-五 09:00-18:00
const SCHEDULE_PRESETS = [
  { id: 'all_day',        label: '全天候',   start: '00:00', end: '23:59', weekdays: [1, 2, 3, 4, 5, 6, 7],
    tooltip: '7×24 生效: 周一至周日 00:00-23:59 全时段布防' },
  { id: 'workday',        label: '工作日',   start: '00:00', end: '23:59', weekdays: [1, 2, 3, 4, 5],
    tooltip: '周一至周五 00:00-23:59 (周末不布防)' },
  { id: 'weekend',        label: '周末',     start: '00:00', end: '23:59', weekdays: [6, 7],
    tooltip: '周六、周日 00:00-23:59 (工作日不布防)' },
  { id: 'business_hours', label: '工作时间', start: '09:00', end: '18:00', weekdays: [1, 2, 3, 4, 5],
    tooltip: '周一至周五 09:00-18:00 上班时段布防' },
] as const

const props = defineProps<{
  modelValue: boolean
  editPlan?: LinkagePlan | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const visible = ref(false)
const saving = ref(false)
const isEdit = ref(false)
const allRules = ref<LinkageRule[]>([])

const form = ref({
  plan_id: '',
  name: '',
  description: '',
  icon: '',
  rule_ids: [] as string[],
  schedule: {
    enabled: false,
    arm_time: '08:00',
    disarm_time: '18:00',
    weekdays: [1, 2, 3, 4, 5] as number[],
  },
})

watch(() => props.modelValue, (v) => { visible.value = v })
watch(visible, (v) => { emit('update:modelValue', v) })

// [STAGE1 P1-2 2026-09-10] 旧版 plan.schedule.weekdays 可能含 0 (旧口径),
//   归一为 7 与 LinkagePlan / LinkageEngine 1..7 对齐 (0/7 二选一, 7=周日)。
function normalizeWeekdays(raw: number[] | undefined | null): number[] {
  if (!Array.isArray(raw)) return [1, 2, 3, 4, 5]
  const out = new Set<number>()
  for (const v of raw) {
    if (!Number.isFinite(v)) continue
    const n = Math.trunc(v)
    if (n === 0) out.add(7)
    else if (n >= 1 && n <= 7) out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}

watch(() => props.editPlan, (plan) => {
  if (plan) {
    isEdit.value = true
    form.value = {
      plan_id: plan.plan_id,
      name: plan.name,
      description: plan.description,
      icon: plan.icon,
      rule_ids: [...plan.rule_ids],
      schedule: {
        ...plan.schedule,
        weekdays: normalizeWeekdays(plan.schedule?.weekdays),
      },
    }
  } else {
    isEdit.value = false
    form.value = {
      plan_id: '',
      name: '',
      description: '',
      icon: '',
      rule_ids: [],
      schedule: { enabled: false, arm_time: '08:00', disarm_time: '18:00', weekdays: [1, 2, 3, 4, 5] },
    }
  }
}, { immediate: true })

onMounted(async () => {
  try {
    const res = await linkageApi.getRules({ page: 1, pageSize: 200 })
    allRules.value = (res.data as any)?.items || []
  } catch { /* ignore */ }
})

function removeRule(rid: string) {
  form.value.rule_ids = form.value.rule_ids.filter(id => id !== rid)
}

function getRuleName(rid: string): string {
  const r = allRules.value.find(r => r.id === rid)
  return r ? r.name : rid
}

async function onSave() {
  if (!form.value.plan_id || !form.value.name) return
  saving.value = true
  try {
    if (isEdit.value) {
      await linkageApi.updatePlan(form.value.plan_id, form.value)
    } else {
      await linkageApi.createPlan(form.value as any)
    }
    visible.value = false
    emit('saved')
  } catch (e: any) {
    console.error('Save plan failed:', e)
  } finally {
    saving.value = false
  }
}

function onClose() {
  emit('update:modelValue', false)
}

// [STAGE1 P1-2 2026-09-10] 排程 4 模板应用: 仅改 draft (arm_time/disarm_time/weekdays),
//   不触发保存, 沿用 LinkageRuleView 同口径。
function applySchedulePreset(p: typeof SCHEDULE_PRESETS[number]) {
  form.value.schedule.arm_time = p.start
  form.value.schedule.disarm_time = p.end
  form.value.schedule.weekdays = [...p.weekdays]
  ElMessage.success(`已应用「${p.label}」排程模板 (草稿已更新, 点击「保存」后生效)`)
}

// [STAGE1 P1-2 2026-09-10] 当前 draft 是否与某排程预设一致 (chip 高亮)
function isSchedulePresetActive(p: typeof SCHEDULE_PRESETS[number]): boolean {
  const s = form.value.schedule
  if (s.arm_time !== p.start || s.disarm_time !== p.end) return false
  const a = [...s.weekdays].sort((x, y) => x - y)
  const b = [...p.weekdays].sort((x, y) => x - y)
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}
</script>

<style scoped>
.selected-rules {
  padding: 4px 0 8px 100px;
}

/* ── [STAGE1 P1-2 2026-09-10] 排程快速模板 chip ── */
.schedule-preset-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.schedule-preset-chip {
  cursor: pointer;
  user-select: none;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
.schedule-preset-chip:hover { background-color: var(--el-color-primary-light-9, #ecf5ff); }
.schedule-preset-chip.is-active {
  background-color: var(--el-color-primary-light-8, #d9ecff);
  color: var(--el-color-primary, #409eff);
  border-color: var(--el-color-primary-light-5, #a0cfff);
}
</style>
