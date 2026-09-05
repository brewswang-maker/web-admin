<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div v-if="alarm" class="dispose-dialog">
      <!-- 告警概要 (两态共用, 只读) -->
      <div class="dispose-dialog__summary">
        <div class="dispose-dialog__row">
          <span class="dispose-dialog__label">告警类型</span>
          <span>{{ zh(alarm.type) }}</span>
        </div>
        <div class="dispose-dialog__row">
          <span class="dispose-dialog__label">设备</span>
          <span>{{ alarm.channelName || alarm.deviceName || alarm.deviceId }}</span>
        </div>
        <div class="dispose-dialog__row">
          <span class="dispose-dialog__label">时间</span>
          <span>{{ alarm.createdAt || '-' }}</span>
        </div>
        <div v-if="!editable" class="dispose-dialog__row">
          <span class="dispose-dialog__label">处置人</span>
          <span>{{ readonlyHandler || '-' }}</span>
        </div>
      </div>

      <!-- ── 只读态: 已处警回显 + 追加入口 [P0-10 华为清流程] ── -->
      <template v-if="!editable && !appending">
        <div class="dispose-dialog__readonly">
          <div class="dispose-dialog__row">
            <span class="dispose-dialog__label">处置说明</span>
            <span class="dispose-dialog__note">{{ readonlyNote || '(无记录)' }}</span>
          </div>
        </div>
        <el-button v-if="!appending" type="warning" plain @click="startAppend">追加处警</el-button>
        <!-- [docx#8 P0-8 2026-09-05] 处警详情直达告警全景 (AlarmPopup 含场景图/人脸比对卡/回放),
             人脸比对不再只能从「更多→详情」或行点击可达 -->
        <el-button v-if="!appending" type="primary" plain @click="openAlarmPopup">查看告警全景</el-button>
      </template>

      <!-- ── 编辑态: 未处警首次处警 / 已处警追加 ── -->
      <el-form v-if="editable || appending" ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="处置类型" prop="type">
          <el-select v-model="form.type" filterable placeholder="选择处置类型" style="width: 100%">
            <el-option v-for="t in typeOptions" :key="t.key" :label="t.zh" :value="t.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="处置说明" prop="note">
          <el-input
            v-model="form.note"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            :placeholder="appending ? '追加处置说明 (将附于原记录后)...' : '请填写处置结果说明...'"
          />
        </el-form-item>
        <el-form-item label="处置人">
          <el-input v-model="form.handler" placeholder="处理人" style="width: 220px" />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <template v-if="editable || appending">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">
          {{ appending ? '提交追加' : '提交处警' }}
        </el-button>
      </template>
      <template v-else>
        <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * DisposeDialog — 规范处警对话框 [P0-10 2026-09-04 华为清流程对标]
 *
 * 两态:
 *   可处警 (unhandled/acknowledged/escalated/reassigned/handling):
 *     处置类型可选 (canonical SSOT zh 名) + 处置说明必填 + 处置人 (默认当前登录用户)
 *   已处警 (disposed/confirmed/closed/resolved/false_alarm/ignored):
 *     只读回显当时处置说明/处置人 (metadata 治理字段 gov.disposition/handled_by),
 *     「追加处警」按钮 → 解锁输入 → 提交时追加于原记录之后 (不覆盖历史)
 *
 * 提交统一走 alarmApi.dispose (status=disposed + disposition),
 * 处置类型以【类型】前缀写入 disposition 文本 (后端零改动)。
 */
import { ref, computed, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { alarmApi } from '@/api/alarm'
import { useEventTypeZh } from '@/composables/useEventTypeZh'
import { useAuthStore } from '@/stores/auth'
import { showAlarmPopup } from '@/composables/useAlarmPopup'

const props = defineProps<{
  modelValue: boolean
  alarm: any | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'submitted'): void
}>()

const { ensure: ensureEventTypes, zh, canonicalTypes } = useEventTypeZh()
const auth = useAuthStore()

/** 可处警状态集 (未完结生命周期) */
const EDITABLE_STATUSES = ['unhandled', 'acknowledged', 'escalated', 'reassigned', 'handling']

const editable = computed(() => {
  if (!props.alarm) return false
  return EDITABLE_STATUSES.includes(String(props.alarm.status))
})

/** 追加模式 (只读态点「追加处警」后解锁) */
const appending = ref(false)

/** [docx#8 P0-8 2026-09-05] 关闭自身 → 打开全局 AlarmPopup (告警全景) */
function openAlarmPopup() {
  emit('update:modelValue', false)
  if (props.alarm) showAlarmPopup(props.alarm)
}

const dialogTitle = computed(() => {
  if (!props.alarm) return '处警'
  if (appending.value) return '追加处警'
  return editable.value ? '处警' : '处警详情'
})

/** 只读回显: 后端 handleAlarm 写 disposition/handled_by 列 → 列表 SELECT 回填 metadata 治理字段 */
const readonlyNote = computed(() => String(props.alarm?.metadata?.disposition || props.alarm?.handleNote || ''))
const readonlyHandler = computed(() => String(props.alarm?.metadata?.handled_by || props.alarm?.handledBy || ''))

/** 处置类型下拉: canonical SSOT 动态 (113 项全量 + zh 名), 默认预选当前告警类型 */
const typeOptions = computed(() =>
  canonicalTypes.value.map((t) => ({ key: t.key, zh: zh(t.key) }))
)

const formRef = ref<FormInstance>()
const form = ref({ type: '', note: '', handler: '' })
const rules: FormRules = {
  type: [{ required: true, message: '请选择处置类型', trigger: 'change' }],
  note: [
    { required: true, message: '请填写处置说明', trigger: 'blur' },
    { min: 2, max: 500, message: '2-500 字', trigger: 'blur' },
  ],
}

const submitting = ref(false)

watch(
  () => [props.modelValue, props.alarm] as const,
  ([visible]) => {
    if (!visible || !props.alarm) return
    appending.value = false
    ensureEventTypes()
    form.value = {
      type: String(props.alarm.type || ''),
      note: '',
      handler: auth.username || '',
    }
  },
  { immediate: true }
)

function startAppend() {
  appending.value = true
}

async function submit() {
  if (!props.alarm || !formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return
  submitting.value = true
  try {
    const typeZh = zh(form.value.type)
    let disposition = `【${typeZh}】${form.value.note}`
    if (appending.value) {
      const prev = readonlyNote.value
      const stamp = new Date().toLocaleString('zh-CN', { hour12: false })
      disposition = prev
        ? `${prev}\n[追加 ${stamp}] 【${typeZh}】${form.value.note}`
        : `[追加 ${stamp}] 【${typeZh}】${form.value.note}`
    }
    await alarmApi.dispose(String(props.alarm.id), disposition, form.value.handler || undefined)
    ElMessage.success(appending.value ? '已追加处警' : '已提交处警')
    emit('update:modelValue', false)
    emit('submitted')
  } catch (err) {
    ElMessage.error('提交失败, 请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.dispose-dialog__summary {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 16px;
}
.dispose-dialog__row {
  display: flex;
  gap: 12px;
  line-height: 24px;
  font-size: 13px;
}
.dispose-dialog__label {
  color: var(--el-text-color-secondary);
  flex: 0 0 60px;
}
.dispose-dialog__readonly {
  margin-bottom: 14px;
}
.dispose-dialog__note {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
