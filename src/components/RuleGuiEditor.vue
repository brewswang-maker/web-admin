<!--
  RuleGuiEditor.vue — P3-5: 规则GUI编辑器 (Wizard Style)
  参考: 海康 iVMS 联动配置 / 商汤 SenseFoundry 规则向导

  四步向导:
  Step 1: 基本信息 — 名称/描述/优先级/冷却
  Step 2: 触发条件 — 事件类型/通道/时间/区域
  Step 3: 联动动作 — 拖拽排序动作列表
  Step 4: 预览确认 — 实时校验 + 保存/存为模板
-->
<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑规则' : '新建规则'"
    width="800px"
    :close-on-click-modal="false"
    destroy-on-close
    @close="onClose"
  >
    <el-steps :active="currentStep" align-center class="wizard-steps">
      <el-step title="基本信息" description="名称和优先级" />
      <el-step title="触发条件" description="事件/通道/时间" />
      <el-step title="联动动作" description="告警响应" />
      <el-step title="预览确认" description="校验并保存" />
    </el-steps>

    <div class="wizard-content">
      <!-- ===== Step 1: 基本信息 ===== -->
      <div v-show="currentStep === 0" class="step-pane">
        <el-form :model="ruleForm" label-width="100px">
          <el-form-item label="规则名称" required>
            <el-input v-model="ruleForm.name" placeholder="如: 周界入侵告警" maxlength="100" show-word-limit />
          </el-form-item>
          <el-form-item label="规则描述">
            <el-input v-model="ruleForm.description" type="textarea" :rows="2" placeholder="规则用途说明" />
          </el-form-item>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="优先级">
                <el-slider v-model="ruleForm.priority" :min="0" :max="100" :step="10" show-input style="padding-right: 16px" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="冷却时间">
                <el-input-number v-model="cooldownSeconds" :min="1" :max="3600" :step="5" />
                <span class="form-hint">秒</span>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="启用">
            <el-switch v-model="ruleForm.enabled" />
          </el-form-item>
          <el-form-item label="标签">
            <el-select v-model="ruleForm.tags" multiple filterable allow-create default-first-option
              placeholder="添加标签便于分类" style="width: 100%">
              <el-option v-for="t in suggestedTags" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <!-- ===== Step 2: 触发条件 ===== -->
      <div v-show="currentStep === 1" class="step-pane">
        <!-- 事件类型 -->
        <div class="cond-section">
          <div class="cond-header">
            <el-checkbox v-model="conditions.eventType.enabled">事件类型</el-checkbox>
            <span class="cond-hint">选择要响应的告警类型</span>
          </div>
          <div v-if="conditions.eventType.enabled" class="cond-body">
            <el-checkbox-group v-model="conditions.eventType.config.types">
              <el-checkbox v-for="et in eventTypeOptions" :key="et.value" :label="et.value">{{ et.label }}</el-checkbox>
            </el-checkbox-group>
            <div class="cond-sub">
              <span>最小严重度:</span>
              <el-radio-group v-model="conditions.eventType.config.minSeverity" size="small">
                <el-radio-button :label="1">信息</el-radio-button>
                <el-radio-button :label="2">低危</el-radio-button>
                <el-radio-button :label="3">中危</el-radio-button>
                <el-radio-button :label="4">高危</el-radio-button>
                <el-radio-button :label="5">严重</el-radio-button>
              </el-radio-group>
            </div>
            <div class="cond-sub">
              <span>最小置信度:</span>
              <el-slider v-model="conditions.eventType.config.minConfidence" :min="0" :max="100" :step="5"
                style="width: 200px; display: inline-block; margin-left: 12px" show-input />
              <span class="form-hint">%</span>
            </div>
          </div>
        </div>

        <!-- 触发源 -->
        <div class="cond-section">
          <div class="cond-header">
            <el-checkbox v-model="conditions.eventSource.enabled">触发通道</el-checkbox>
            <span class="cond-hint">限定哪些通道的告警会触发此规则</span>
          </div>
          <div v-if="conditions.eventSource.enabled" class="cond-body">
            <el-select v-model="conditions.eventSource.config.channels" multiple filterable
              placeholder="不选则全部通道" style="width: 100%">
              <el-option v-for="ch in channelOptions" :key="ch.value" :label="ch.label" :value="ch.value" />
            </el-select>
          </div>
        </div>

        <!-- 时间条件 -->
        <div class="cond-section">
          <div class="cond-header">
            <el-checkbox v-model="conditions.time.enabled">生效时段</el-checkbox>
            <span class="cond-hint">规则仅在指定时间段生效</span>
          </div>
          <div v-if="conditions.time.enabled" class="cond-body">
            <el-row :gutter="12">
              <el-col :span="8">
                <span>开始:</span>
                <el-time-picker v-model="conditions.time.config.startTime" format="HH:mm" value-format="HH:mm"
                  placeholder="08:00" style="width: 120px" />
              </el-col>
              <el-col :span="8">
                <span>结束:</span>
                <el-time-picker v-model="conditions.time.config.endTime" format="HH:mm" value-format="HH:mm"
                  placeholder="20:00" style="width: 120px" />
              </el-col>
            </el-row>
            <div class="cond-sub">
              <span>生效日期:</span>
              <el-checkbox-group v-model="conditions.time.config.weekdays" size="small">
                <el-checkbox-button v-for="d in weekdayOptions" :key="d.value" :label="d.value">{{ d.label }}</el-checkbox-button>
              </el-checkbox-group>
              <el-button size="small" link @click="setWeekdayPreset('workday')">工作日</el-button>
              <el-button size="small" link @click="setWeekdayPreset('all')">每天</el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Step 3: 联动动作 ===== -->
      <div v-show="currentStep === 2" class="step-pane">
        <div class="action-toolbar">
          <el-button type="primary" size="small" @click="showActionPicker = true">
            <el-icon><Plus /></el-icon> 添加动作
          </el-button>
          <span class="form-hint" v-if="actions.length === 0">至少添加一个联动动作</span>
        </div>

        <div v-if="actions.length > 0" class="action-list">
          <div v-for="(action, idx) in actions" :key="idx" class="action-item">
            <div class="action-drag">
              <el-icon><Rank /></el-icon>
            </div>
            <div class="action-info">
              <el-tag size="small" :type="getActionTagType(action.type)">{{ getActionLabel(action.type) }}</el-tag>
              <span class="action-name">{{ action.name || getActionLabel(action.type) }}</span>
            </div>
            <div class="action-controls">
              <el-switch v-model="action.enabled" size="small" />
              <el-button size="small" link type="danger" @click="removeAction(idx)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </div>

        <el-dialog v-model="showActionPicker" title="选择动作" width="500px" append-to-body>
          <el-input v-model="actionSearch" placeholder="搜索动作..." clearable style="margin-bottom: 12px" />
          <div class="action-picker-list">
            <div v-for="at in filteredActionTypes" :key="at.value" class="action-pick-item"
              @click="addAction(at.value)">
              <el-icon><Plus /></el-icon>
              <span>{{ at.label }}</span>
            </div>
          </div>
        </el-dialog>
      </div>

      <!-- ===== Step 4: 预览确认 ===== -->
      <div v-show="currentStep === 3" class="step-pane">
        <!-- 实时校验 -->
        <el-alert v-if="validation.errors.length > 0" type="error" :closable="false" class="validate-alert">
          <template #title>校验失败 ({{ validation.errors.length }} 个错误)</template>
          <ul><li v-for="(e, i) in validation.errors" :key="i">{{ e }}</li></ul>
        </el-alert>
        <el-alert v-if="validation.warnings.length > 0" type="warning" :closable="false" class="validate-alert">
          <template #title>注意事项 ({{ validation.warnings.length }} 个警告)</template>
          <ul><li v-for="(w, i) in validation.warnings" :key="i">{{ w }}</li></ul>
        </el-alert>
        <el-alert v-if="validation.errors.length === 0 && validation.warnings.length === 0"
          type="success" :closable="false" title="规则配置验证通过" />

        <!-- 规则摘要 -->
        <el-descriptions title="规则摘要" :column="2" border class="rule-summary">
          <el-descriptions-item label="名称">{{ ruleForm.name || '(未设置)' }}</el-descriptions-item>
          <el-descriptions-item label="优先级">{{ ruleForm.priority }}</el-descriptions-item>
          <el-descriptions-item label="冷却">{{ cooldownSeconds }}秒</el-descriptions-item>
          <el-descriptions-item label="启用">{{ ruleForm.enabled ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="事件类型">
            {{ conditions.eventType.enabled ? conditions.eventType.config.types.join(', ') || '(全部)' : '(全部)' }}
          </el-descriptions-item>
          <el-descriptions-item label="通道">
            {{ conditions.eventSource.enabled ? conditions.eventSource.config.channels.join(', ') || '(全部)' : '(全部)' }}
          </el-descriptions-item>
          <el-descriptions-item label="时段" v-if="conditions.time.enabled">
            {{ conditions.time.config.startTime }}-{{ conditions.time.config.endTime }}
          </el-descriptions-item>
          <el-descriptions-item label="动作数">{{ actions.filter(a => a.enabled).length }} 个 (共 {{ actions.length }} 个)</el-descriptions-item>
        </el-descriptions>

        <!-- 存为模板 -->
        <div class="save-template-section">
          <el-checkbox v-model="saveAsTemplate">同时保存为模板</el-checkbox>
          <div v-if="saveAsTemplate">
            <el-input v-model="templateName" placeholder="模板名称" style="margin-top: 8px" />
            <el-select v-model="templateCategory" placeholder="选择分类" style="margin-top: 8px; width: 100%">
              <el-option label="安全防范" value="安全防范" />
              <el-option label="消防安全" value="消防安全" />
              <el-option label="生产安全" value="生产安全" />
              <el-option label="人员管理" value="人员管理" />
              <el-option label="自定义" value="自定义" />
            </el-select>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 底部导航 ===== -->
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button v-if="currentStep > 0" @click="prevStep">上一步</el-button>
        <el-button v-if="currentStep < 3" type="primary" @click="nextStep">下一步</el-button>
        <el-button v-if="currentStep === 3" type="success" :loading="saving" :disabled="validation.errors.length > 0"
          @click="handleSave">
          {{ isEdit ? '保存修改' : '创建规则' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete, Rank } from '@element-plus/icons-vue'
import { http } from '@/api/http'
import { linkageApi, ACTION_TYPE_REVERSE_MAP } from '@/api/linkage'
import type { LinkageRule } from '@/api/linkage'

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': []
}>()

const props = defineProps<{
  modelValue: boolean
  editRule?: LinkageRule | null
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const isEdit = computed(() => !!props.editRule)
const currentStep = ref(0)
const saving = ref(false)
const showActionPicker = ref(false)
const actionSearch = ref('')
const saveAsTemplate = ref(false)
const templateName = ref('')
const templateCategory = ref('')

// ---- 表单数据 ----
const ruleForm = reactive({
  name: '',
  description: '',
  priority: 50,
  enabled: true,
  tags: [] as string[],
})

const cooldownSeconds = ref(5)

const conditions = reactive({
  eventType: {
    enabled: false,
    config: { types: [] as string[], minSeverity: 1, minConfidence: 30 }
  },
  eventSource: {
    enabled: false,
    config: { channels: [] as string[] }
  },
  time: {
    enabled: false,
    config: { startTime: '08:00', endTime: '20:00', weekdays: [1, 2, 3, 4, 5] as number[] }
  },
})

const actions = ref<Array<{ type: number; name: string; enabled: boolean }>>([])
const validation = reactive({ errors: [] as string[], warnings: [] as string[] })

// ---- 选项 ----
const suggestedTags = ['高危', '监控', '安防', '消防', '周界', '人流', '生产安全']
// [P1-1 v7.8 2026-08-09] 事件类型由硬编码静态列表改为动态从 SSOT API 加载.
//   后端: GET /api/v1/event-types/canonical (RestApiHandlers.cpp kCanonical SSOT, 与 P0-2 扩展同步)
//   加载失败时回退到 fallback 静态列表, 保证离线/网络异常下可用.
//   升级路径: 增删事件类型只需改后端 kCanonical, 前端自动同步.
const FALLBACK_EVENT_TYPE_OPTIONS = [
  { value: 'intrusion', label: '入侵检测' },
  { value: 'fire', label: '火灾/烟雾' },
  { value: 'fighting', label: '打架斗殴' },
  { value: 'fall', label: '跌倒检测' },
  { value: 'gathering', label: '人员聚集' },
  { value: 'running', label: '奔跑检测' },
  { value: 'loitering', label: '徘徊' },
  { value: 'tailgating', label: '尾随' },
  { value: 'no_helmet', label: '未戴安全帽' },
  { value: 'no_mask', label: '未戴口罩' },
  { value: 'smoking', label: '抽烟检测' },
  { value: 'phone', label: '打电话' },
  { value: 'illegal_parking', label: '违停' },
  { value: 'face', label: '人脸识别' },
  { value: 'vehicle', label: '车辆检测' },
]
const eventTypeOptions = ref<Array<{ value: string; label: string }>>([...FALLBACK_EVENT_TYPE_OPTIONS])
const eventTypesLoading = ref(false)

async function loadEventTypes() {
  eventTypesLoading.value = true
  try {
    const resp = await http.get<{ code: number; data: { types: Array<{ key: string; name_zh: string }>; count: number }; message?: string }>('/api/v1/event-types/canonical')
    if (resp?.code === 0 && resp.data?.types?.length) {
      eventTypeOptions.value = resp.data.types.map(t => ({ value: t.key, label: t.name_zh }))
      console.info(`[RuleGuiEditor] 动态加载 ${resp.data.count} 个事件类型`)
    } else {
      console.warn('[RuleGuiEditor] SSOT 返回为空, 使用 fallback 静态列表')
    }
  } catch (err) {
    console.warn('[RuleGuiEditor] 加载事件类型失败, 使用 fallback:', err)
  } finally {
    eventTypesLoading.value = false
  }
}

onMounted(() => {
  loadEventTypes()
})
const weekdayOptions = [
  { value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' },
  { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' },
  { value: 7, label: '日' },
]
const channelOptions = ref<Array<{ value: string; label: string }>>([])

// ---- 计算属性 ----
const filteredActionTypes = computed(() => {
  // [TS 修复] ACTION_TYPE_REVERSE_MAP: Record<number, string>
  //   Object.entries 返回 [string, string][]，需要将 key 解析为 number
  const all = Object.entries(ACTION_TYPE_REVERSE_MAP || {})
    .map(([k, label]) => ({ value: Number(k), label: String(label) }))
  if (!actionSearch.value) return all
  return all.filter(a => a.label.toLowerCase().includes(actionSearch.value.toLowerCase()))
})

const cooldownMs = computed(() => cooldownSeconds.value * 1000)

// ---- 方法 ----
function getActionLabel(typeNum: number): string {
  for (const [k, label] of Object.entries(ACTION_TYPE_REVERSE_MAP || {})) {
    if (Number(k) === typeNum) return String(label)
  }
  return `Action(${typeNum})`
}

function getActionTagType(typeNum: number): 'success' | 'warning' | 'info' | 'danger' {
  if (typeNum >= 100 && typeNum < 200) return 'success'
  if (typeNum >= 300 && typeNum < 400) return 'warning'
  if (typeNum >= 500) return 'danger'
  return 'info'
}

function addAction(typeNum: number) {
  actions.value.push({ type: typeNum, name: getActionLabel(typeNum), enabled: true })
  showActionPicker.value = false
}

function removeAction(idx: number) {
  actions.value.splice(idx, 1)
}

function setWeekdayPreset(preset: string) {
  if (preset === 'workday') conditions.time.config.weekdays = [1, 2, 3, 4, 5]
  else if (preset === 'all') conditions.time.config.weekdays = [1, 2, 3, 4, 5, 6, 7]
}

function prevStep() {
  if (currentStep.value > 0) currentStep.value--
}

async function nextStep() {
  // 步骤内校验
  if (currentStep.value === 0 && !ruleForm.name) {
    ElMessage.warning('请填写规则名称')
    return
  }
  if (currentStep.value === 2 && actions.value.length === 0) {
    ElMessage.warning('请至少添加一个联动动作')
    return
  }
  currentStep.value++
  // 到第4步时自动校验
  if (currentStep.value === 3) {
    await runValidation()
  }
}

async function runValidation() {
  try {
    const payload = buildPayload()
    const res = await linkageApi.validateRule(payload as any)
    const data = (res as any)?.data?.data ?? (res as any)?.data
    validation.errors = data?.errors || []
    validation.warnings = data?.warnings || []
  } catch {
    validation.errors = ['校验请求失败']
    validation.warnings = []
  }
}

function buildPayload(): Record<string, any> {
  return {
    name: ruleForm.name,
    description: ruleForm.description,
    priority: ruleForm.priority,
    cooldown_ms: cooldownMs.value,
    enabled: ruleForm.enabled,
    tags: ruleForm.tags,
    source_cond: {
      event_types: conditions.eventType.enabled ? conditions.eventType.config.types : [],
      channel_ids: conditions.eventSource.enabled ? conditions.eventSource.config.channels : [],
      min_severity: conditions.eventType.config.minSeverity,
      min_confidence: conditions.eventType.config.minConfidence,
    },
    time_cond: conditions.time.enabled ? {
      time_start: conditions.time.config.startTime,
      time_end: conditions.time.config.endTime,
      weekdays: conditions.time.config.weekdays,
    } : undefined,
    actions: actions.value.map(a => ({ type: a.type, name: a.name, enabled: a.enabled })),
  }
}

async function handleSave() {
  saving.value = true
  try {
    const payload = buildPayload()
    if (isEdit.value && props.editRule) {
      await linkageApi.updateRule(props.editRule.id, payload as any)
    } else {
      const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      await linkageApi.createRule({ id, ...payload } as any)
    }

    // 存为模板
    if (saveAsTemplate.value && templateName.value) {
      try {
        await linkageApi.saveAsTemplate({
          name: templateName.value,
          description: ruleForm.description,
          category: templateCategory.value || '自定义',
          priority: ruleForm.priority,
          cooldown_ms: cooldownMs.value,
          tags: ruleForm.tags,
        })
        ElMessage.success('规则已保存且模板已创建')
      } catch {
        ElMessage.warning('规则已保存，但模板创建失败')
      }
    } else {
      ElMessage.success(isEdit.value ? '规则已更新' : '规则已创建')
    }

    visible.value = false
    emit('saved')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ---- 初始化 ----
watch(() => props.modelValue, (v) => {
  if (v) {
    currentStep.value = 0
    // 重置或恢复
    if (props.editRule) {
      ruleForm.name = props.editRule.name || ''
      ruleForm.description = props.editRule.description || ''
      ruleForm.priority = props.editRule.priority ?? 50
      ruleForm.enabled = props.editRule.enabled ?? true
      ruleForm.tags = props.editRule.tags ? [...props.editRule.tags] : []
      cooldownSeconds.value = Math.round((props.editRule.cooldown_ms ?? 5000) / 1000)
      // 恢复条件
      const sc = props.editRule.source_cond as any || {}
      conditions.eventType.enabled = !!(sc.event_types?.length)
      conditions.eventType.config.types = sc.event_types || []
      conditions.eventType.config.minSeverity = sc.min_severity || 1
      conditions.eventType.config.minConfidence = Math.round((sc.min_confidence || 0) * 100)
      conditions.eventSource.enabled = !!(sc.channel_ids?.length)
      conditions.eventSource.config.channels = sc.channel_ids || []
      const tc = props.editRule.time_cond as any || {}
      conditions.time.enabled = !!(tc.time_start || tc.weekdays?.length)
      conditions.time.config.startTime = tc.time_start || '08:00'
      conditions.time.config.endTime = tc.time_end || '20:00'
      conditions.time.config.weekdays = tc.weekdays || [1, 2, 3, 4, 5]
      // 恢复动作
      actions.value = (props.editRule.actions || []).map((a: any) => ({
        type: a.type,
        name: a.name || '',
        enabled: a.enabled ?? true,
      }))
    } else {
      resetForm()
    }
    saveAsTemplate.value = false
    templateName.value = ''
    validation.errors = []
    validation.warnings = []
  }
})

function resetForm() {
  ruleForm.name = ''
  ruleForm.description = ''
  ruleForm.priority = 50
  ruleForm.enabled = true
  ruleForm.tags = []
  cooldownSeconds.value = 5
  conditions.eventType.enabled = false
  conditions.eventType.config.types = []
  conditions.eventType.config.minSeverity = 1
  conditions.eventType.config.minConfidence = 30
  conditions.eventSource.enabled = false
  conditions.eventSource.config.channels = []
  conditions.time.enabled = false
  conditions.time.config.startTime = '08:00'
  conditions.time.config.endTime = '20:00'
  conditions.time.config.weekdays = [1, 2, 3, 4, 5]
  actions.value = []
}

function onClose() {
  resetForm()
  currentStep.value = 0
}
</script>

<style scoped>
.wizard-steps { margin-bottom: 24px; }
.wizard-content { min-height: 300px; }
.step-pane { padding: 0 8px; }
.form-hint { color: #909399; font-size: 12px; margin-left: 8px; }

.cond-section {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 12px;
}
.cond-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cond-hint { color: #909399; font-size: 13px; }
.cond-body { margin-top: 12px; padding-left: 24px; }
.cond-sub {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.action-toolbar { margin-bottom: 12px; }
.action-list { display: flex; flex-direction: column; gap: 8px; }
.action-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
}
.action-drag { color: #c0c4cc; cursor: move; }
.action-info { flex: 1; display: flex; align-items: center; gap: 8px; }
.action-name { font-size: 14px; }
.action-controls { display: flex; align-items: center; gap: 8px; }

.action-picker-list {
  max-height: 400px;
  overflow-y: auto;
}
.action-pick-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
}
.action-pick-item:hover { background: #f5f7fa; }

.validate-alert { margin-bottom: 12px; }
.rule-summary { margin-top: 16px; }
.save-template-section { margin-top: 16px; padding: 12px; background: #f5f7fa; border-radius: 4px; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
