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
        <el-form-item label="生效日">
          <el-checkbox-group v-model="form.schedule.weekdays">
            <el-checkbox :label="1">周一</el-checkbox>
            <el-checkbox :label="2">周二</el-checkbox>
            <el-checkbox :label="3">周三</el-checkbox>
            <el-checkbox :label="4">周四</el-checkbox>
            <el-checkbox :label="5">周五</el-checkbox>
            <el-checkbox :label="6">周六</el-checkbox>
            <el-checkbox :label="0">周日</el-checkbox>
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
import { linkageApi } from '@/api/linkage'
import type { LinkageRule, LinkagePlan } from '@/api/linkage'

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

watch(() => props.editPlan, (plan) => {
  if (plan) {
    isEdit.value = true
    form.value = {
      plan_id: plan.plan_id,
      name: plan.name,
      description: plan.description,
      icon: plan.icon,
      rule_ids: [...plan.rule_ids],
      schedule: { ...plan.schedule },
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
    const res = await linkageApi.getRules({ page: 1, page_size: 200 })
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
</script>

<style scoped>
.selected-rules {
  padding: 4px 0 8px 100px;
}
</style>
