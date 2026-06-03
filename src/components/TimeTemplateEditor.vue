<template>
  <div class="time-template-editor">
    <!-- 模板列表 -->
    <div class="tte-header">
      <span class="tte-title">布防时段模板</span>
      <el-button size="small" type="primary" @click="openCreate" :icon="Plus">新建模板</el-button>
    </div>

    <div v-loading="loading" class="tte-list">
      <div
        v-for="tmpl in templates"
        :key="tmpl.template_id"
        :class="['tte-item', { 'tte-item--selected': selectedId === tmpl.template_id }]"
        @click="selectTemplate(tmpl)"
      >
        <div class="tte-item__info">
          <div class="tte-item__name">{{ tmpl.name }}</div>
          <div class="tte-item__desc">
            <span class="tte-item__time">{{ tmpl.time_start || '00:00' }} - {{ tmpl.time_end || '23:59' }}</span>
            <span class="tte-item__days">{{ formatWeekdays(tmpl.weekdays) }}</span>
          </div>
        </div>
        <div class="tte-item__actions">
          <el-button size="small" text @click.stop="openEdit(tmpl)">编辑</el-button>
          <el-button size="small" text type="danger" @click.stop="handleDelete(tmpl)">删除</el-button>
        </div>
      </div>
      <el-empty v-if="!loading && templates.length === 0" description="暂无时段模板" :image-size="60" />
    </div>

    <!-- 快速选择应用 -->
    <div class="tte-apply" v-if="templates.length > 0">
      <el-select v-model="selectedId" placeholder="选择模板快速填充" size="small" clearable style="width: 100%">
        <el-option
          v-for="tmpl in templates"
          :key="tmpl.template_id"
          :label="`${tmpl.name} (${tmpl.time_start}-${tmpl.time_end})`"
          :value="tmpl.template_id"
        />
      </el-select>
      <el-button size="small" type="primary" :disabled="!selectedId" @click="applySelected" style="margin-top: 8px; width: 100%">
        应用到当前规则
      </el-button>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="showDialog" :title="isEditing ? '编辑时段模板' : '新建时段模板'" width="480px" destroy-on-close>
      <el-form :model="editForm" label-width="80px" :rules="formRules" ref="formRef">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="editForm.name" placeholder="如: 工作日白天、全天候" maxlength="30" show-word-limit />
        </el-form-item>

        <el-form-item label="时段范围" prop="timeRange">
          <el-row :gutter="8">
            <el-col :span="11">
              <el-time-select
                v-model="editForm.time_start"
                start="00:00" step="00:15" end="23:45"
                placeholder="开始时间"
                style="width: 100%"
              />
            </el-col>
            <el-col :span="2" class="text-center" style="line-height: 32px">至</el-col>
            <el-col :span="11">
              <el-time-select
                v-model="editForm.time_end"
                start="00:00" step="00:15" end="23:45"
                placeholder="结束时间"
                style="width: 100%"
              />
            </el-col>
          </el-row>
        </el-form-item>

        <el-form-item label="生效星期">
          <div class="tte-weekdays">
            <el-checkbox-group v-model="editForm.weekdays">
              <el-checkbox
                v-for="d in weekdayOptions"
                :key="d.value"
                :label="d.label"
                :value="d.value"
                size="small"
              />
            </el-checkbox-group>
          </div>
          <div class="tte-weekday-presets">
            <el-button size="small" text @click="setWeekdayPreset('workday')">工作日</el-button>
            <el-button size="small" text @click="setWeekdayPreset('weekend')">周末</el-button>
            <el-button size="small" text @click="setWeekdayPreset('all')">全选</el-button>
            <el-button size="small" text @click="setWeekdayPreset('none')">清空</el-button>
          </div>
        </el-form-item>

        <!-- 可视化时间轴 -->
        <el-form-item label="时段预览">
          <div class="tte-timeline">
            <div class="tte-timeline__bar">
              <div
                class="tte-timeline__range"
                :style="rangeStyle"
              />
            </div>
            <div class="tte-timeline__labels">
              <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
            </div>
          </div>
          <div class="tte-timeline__weekdays-preview">
            <span
              v-for="d in weekdayOptions"
              :key="d.value"
              :class="['tte-weekday-dot', { 'tte-weekday-dot--active': editForm.weekdays.includes(d.value) }]"
            >{{ d.label }}</span>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { linkageApi, type TimeTemplate } from '@/api/linkage'

const emit = defineEmits<{
  'apply': [template: TimeTemplate]
}>()

// ── State ──

const loading = ref(false)
const saving = ref(false)
const templates = ref<TimeTemplate[]>([])
const selectedId = ref('')
const showDialog = ref(false)
const isEditing = ref(false)
const formRef = ref<FormInstance>()

const editForm = reactive({
  template_id: '',
  name: '',
  time_start: '08:00',
  time_end: '20:00',
  weekdays: [1, 2, 3, 4, 5] as number[],
})

const weekdayOptions = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
]

const formRules: FormRules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
}

// ── 时间轴可视化 ──

const rangeStyle = computed(() => {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const total = 24 * 60
  const start = toMinutes(editForm.time_start)
  const end = toMinutes(editForm.time_end)
  const left = `${(start / total) * 100}%`
  const width = `${((end - start) / total) * 100}%`
  return { left, width }
})

// ── Methods ──

async function fetchTemplates() {
  loading.value = true
  try {
    const res = await linkageApi.getTimeTemplates()
    const data = (res as any)?.data?.data ?? (res as any)?.data ?? []
    templates.value = Array.isArray(data) ? data : []
  } catch {
    templates.value = []
  } finally {
    loading.value = false
  }
}

function formatWeekdays(weekdays: number[]): string {
  if (!weekdays || weekdays.length === 0) return '无'
  if (weekdays.length === 7) return '每天'
  if ([1, 2, 3, 4, 5].every(d => weekdays.includes(d)) && weekdays.length === 5) return '工作日'
  if ([6, 7].every(d => weekdays.includes(d)) && weekdays.length === 2) return '周末'
  return weekdayOptions
    .filter(d => weekdays.includes(d.value))
    .map(d => d.label)
    .join(', ')
}

function selectTemplate(tmpl: TimeTemplate) {
  selectedId.value = tmpl.template_id
}

function applySelected() {
  const tmpl = templates.value.find(t => t.template_id === selectedId.value)
  if (tmpl) {
    emit('apply', tmpl)
    ElMessage.success(`已应用模板: ${tmpl.name}`)
  }
}

function openCreate() {
  isEditing.value = false
  editForm.template_id = ''
  editForm.name = ''
  editForm.time_start = '08:00'
  editForm.time_end = '20:00'
  editForm.weekdays = [1, 2, 3, 4, 5]
  showDialog.value = true
}

function openEdit(tmpl: TimeTemplate) {
  isEditing.value = true
  editForm.template_id = tmpl.template_id
  editForm.name = tmpl.name
  editForm.time_start = tmpl.time_start || '08:00'
  editForm.time_end = tmpl.time_end || '20:00'
  editForm.weekdays = [...(tmpl.weekdays || [])]
  showDialog.value = true
}

function setWeekdayPreset(preset: string) {
  switch (preset) {
    case 'workday': editForm.weekdays = [1, 2, 3, 4, 5]; break
    case 'weekend': editForm.weekdays = [6, 7]; break
    case 'all': editForm.weekdays = [1, 2, 3, 4, 5, 6, 7]; break
    case 'none': editForm.weekdays = []; break
  }
}

async function handleSave() {
  const form = formRef.value
  if (!form) return
  await form.validate()

  saving.value = true
  try {
    const payload = {
      template_id: editForm.template_id || `tt_${Date.now()}`,
      name: editForm.name,
      time_start: editForm.time_start,
      time_end: editForm.time_end,
      weekdays: editForm.weekdays,
      monthdays: [] as number[],
    }

    if (isEditing.value) {
      await linkageApi.updateTimeTemplate(editForm.template_id, payload)
      ElMessage.success('模板已更新')
    } else {
      await linkageApi.createTimeTemplate(payload)
      ElMessage.success('模板已创建')
    }

    showDialog.value = false
    await fetchTemplates()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(tmpl: TimeTemplate) {
  try {
    await ElMessageBox.confirm(`确定删除时段模板"${tmpl.name}"?`, '确认删除', {
      type: 'warning',
    })
    await linkageApi.deleteTimeTemplate(tmpl.template_id)
    ElMessage.success('模板已删除')
    if (selectedId.value === tmpl.template_id) selectedId.value = ''
    await fetchTemplates()
  } catch { /* cancelled */ }
}

// 初始化加载
fetchTemplates()
</script>

<style scoped>
.time-template-editor {
  width: 100%;
}
.tte-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.tte-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.tte-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.tte-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.tte-item:last-child { border-bottom: none; }
.tte-item:hover { background: var(--el-fill-color-light); }
.tte-item--selected { background: var(--el-color-primary-light-9); }
.tte-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.tte-item__desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.tte-item__time {
  font-family: monospace;
  margin-right: 8px;
}
.tte-item__actions {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}
.tte-apply {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.tte-weekdays {
  margin-bottom: 6px;
}
.tte-weekday-presets {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
/* 时间轴 */
.tte-timeline {
  width: 100%;
}
.tte-timeline__bar {
  height: 20px;
  background: var(--el-fill-color);
  border-radius: 3px;
  position: relative;
  overflow: hidden;
}
.tte-timeline__range {
  position: absolute;
  top: 0;
  height: 100%;
  background: var(--el-color-primary);
  border-radius: 3px;
  opacity: 0.6;
  min-width: 2px;
}
.tte-timeline__labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  margin-top: 2px;
}
.tte-timeline__weekdays-preview {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.tte-weekday-dot {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--el-fill-color);
  color: var(--el-text-color-placeholder);
}
.tte-weekday-dot--active {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-weight: 500;
}
</style>
