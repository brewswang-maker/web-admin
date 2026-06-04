<!--
  CEPPatternEditor.vue — CEP模式步骤可视化编辑器
  参考：ONVIF Rule Engine + 海康复合告警配置
-->
<template>
  <el-dialog v-model="visible" :title="isEdit ? '编辑CEP模式' : '新建CEP模式'" width="720px" @close="onClose">
    <el-form :model="form" label-width="110px">
      <el-form-item label="模式ID" required>
        <el-input v-model="form.pattern_id" :disabled="isEdit" placeholder="唯一标识" />
      </el-form-item>
      <el-form-item label="名称" required>
        <el-input v-model="form.name" placeholder="模式名称" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="模式描述" />
      </el-form-item>
      <el-form-item label="启用">
        <el-switch v-model="form.enabled" />
      </el-form-item>

      <el-divider>匹配窗口</el-divider>
      <el-form-item label="窗口类型">
        <el-radio-group v-model="form.window_type">
          <el-radio label="sliding">滑动窗口</el-radio>
          <el-radio label="tumbling">滚动窗口</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="窗口时长">
        <el-input-number v-model="form.window_ms" :min="1000" :max="600000" :step="1000" /> ms
      </el-form-item>
      <el-form-item label="冷却时间">
        <el-input-number v-model="form.cooldown_ms" :min="0" :max="3600000" :step="1000" /> ms
      </el-form-item>
      <el-form-item label="输出事件类型">
        <el-input v-model="form.output_event_type" placeholder="复合事件类型名" />
      </el-form-item>
      <el-form-item label="分组维度">
        <el-select v-model="form.group_by" clearable placeholder="不分组">
          <el-option label="通道" value="channel" />
          <el-option label="设备" value="device" />
          <el-option label="区域" value="region" />
        </el-select>
      </el-form-item>

      <el-divider>模式步骤</el-divider>
      <div class="steps-list">
        <div v-for="(step, idx) in form.steps" :key="idx" class="step-item">
          <div class="step-header">
            <el-tag :type="opTagType(step.op)" effect="dark">{{ opLabel(step.op) }}</el-tag>
            <span class="step-title">步骤 {{ idx + 1 }}</span>
            <el-button size="small" type="danger" link @click="removeStep(idx)">删除</el-button>
          </div>
          <el-row :gutter="12" class="step-fields">
            <el-col :span="8">
              <el-form-item label="事件类型" label-width="70px">
                <el-input v-model="step.event_type" placeholder="intrusion/fire..." />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="最低置信" label-width="70px">
                <el-input-number v-model="step.min_confidence" :min="0" :max="1" :step="0.1" :precision="1" size="small" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item v-if="step.op === 4" label="计数阈值" label-width="70px">
                <el-input-number v-model="step.count_threshold" :min="1" :max="100" size="small" />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <el-button type="dashed" style="width: 100%; margin-top: 8px" @click="addStep">+ 添加步骤</el-button>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { linkageApi } from '@/api/linkage'
import type { CEPPattern, CEPPatternStep } from '@/api/linkage'

const OP_LABELS: Record<number, string> = {
  0: 'SEQUENCE',
  1: 'AND',
  2: 'OR',
  3: 'NOT',
  4: 'COUNT',
  5: 'ABSENCE',
}

const props = defineProps<{
  modelValue: boolean
  editPattern?: CEPPattern | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const visible = ref(false)
const saving = ref(false)
const isEdit = ref(false)

const form = ref({
  pattern_id: '',
  name: '',
  description: '',
  enabled: true,
  window_ms: 30000,
  window_type: 'sliding' as 'sliding' | 'tumbling',
  output_event_type: '',
  group_by: '',
  cooldown_ms: 60000,
  steps: [] as CEPPatternStep[],
})

watch(() => props.modelValue, (v) => { visible.value = v })
watch(visible, (v) => { emit('update:modelValue', v) })

watch(() => props.editPattern, (p) => {
  if (p) {
    isEdit.value = true
    form.value = {
      pattern_id: p.pattern_id,
      name: p.name,
      description: p.description,
      enabled: p.enabled,
      window_ms: p.window_ms,
      window_type: p.window_type,
      output_event_type: p.output_event_type,
      group_by: p.group_by,
      cooldown_ms: p.cooldown_ms,
      steps: p.steps.map(s => ({ ...s })),
    }
  } else {
    isEdit.value = false
    form.value = {
      pattern_id: '', name: '', description: '', enabled: true,
      window_ms: 30000, window_type: 'sliding', output_event_type: '',
      group_by: '', cooldown_ms: 60000, steps: [],
    }
  }
}, { immediate: true })

function opLabel(op: number): string { return OP_LABELS[op] || 'AND' }
function opTagType(op: number): string {
  if (op === 1) return 'success'
  if (op === 2) return 'warning'
  if (op === 3) return 'danger'
  if (op === 4) return ''
  if (op === 5) return 'info'
  return 'primary'
}

function addStep() {
  form.value.steps.push({
    step_id: `step_${form.value.steps.length + 1}`,
    op: 1,
    event_type: '',
    channel_ids: [],
    min_confidence: 0,
    count_threshold: 1,
  })
}

function removeStep(idx: number) {
  form.value.steps.splice(idx, 1)
}

async function onSave() {
  if (!form.value.pattern_id || !form.value.name) return
  if (form.value.steps.length === 0) return
  saving.value = true
  try {
    if (isEdit.value) {
      await linkageApi.updateCEPPattern(form.value.pattern_id, form.value as any)
    } else {
      await linkageApi.createCEPPattern(form.value as any)
    }
    visible.value = false
    emit('saved')
  } catch (e: any) {
    console.error('Save CEP pattern failed:', e)
  } finally {
    saving.value = false
  }
}

function onClose() {
  emit('update:modelValue', false)
}
</script>

<style scoped>
.steps-list {
  padding: 0 0 0 110px;
}
.step-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: var(--el-fill-color-lighter);
}
.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.step-title {
  font-weight: 600;
  font-size: 13px;
}
.step-fields .el-form-item {
  margin-bottom: 4px;
}
</style>
