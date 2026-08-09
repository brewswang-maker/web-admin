<template>
  <el-drawer
    v-model="visible"
    :title="`事件测试: ${eventName}`"
    size="520px"
    direction="rtl"
    destroy-on-close
  >
    <div class="test-drawer-body">
      <!-- 测试模式选择 -->
      <div class="section">
        <div class="section-title">测试模式</div>
        <el-radio-group v-model="testMode" :disabled="testing">
          <el-radio value="image" :disabled="!canImageTest">📷 图片推理</el-radio>
          <el-radio value="synthesis">⚡ 合成事件</el-radio>
        </el-radio-group>
        <div v-if="coverageInfo" class="mode-hint">
          <el-icon><InfoFilled /></el-icon>
          {{ coverageInfo.reason }}
          <span v-if="coverageInfo.algo_id">| 算法: {{ coverageInfo.algo_id }}</span>
        </div>
      </div>

      <!-- 图片上传区域 (仅 image 模式) -->
      <div v-if="testMode === 'image'" class="section">
        <div class="section-title">上传测试图片</div>
        <el-upload
          drag
          accept="image/jpeg,image/png"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="onImageChange"
          :disabled="testing"
        >
          <div v-if="previewUrl" class="upload-preview">
            <img :src="previewUrl" class="preview-img" />
            <div class="preview-change">点击更换图片</div>
          </div>
          <div v-else class="upload-placeholder">
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">拖拽图片到此处或 <em>点击上传</em></div>
          </div>
          <template #tip>
            <div class="el-upload__tip">支持 JPEG / PNG，最大 4MB</div>
          </template>
        </el-upload>
      </div>

      <!-- 参数配置 -->
      <div class="section">
        <div class="section-title">参数</div>
        <el-form label-width="100px" size="small">
          <el-form-item label="事件类型">
            <el-input v-model="alarmType" placeholder="如 fire, person_detected" />
          </el-form-item>
          <el-form-item v-if="testMode === 'image'" label="置信度阈值">
            <el-slider v-model="confidenceThreshold" :min="0" :max="1" :step="0.05" show-input />
          </el-form-item>
          <el-form-item v-if="testMode === 'synthesis'" label="严重度">
            <el-input-number v-model="severity" :min="1" :max="5" />
          </el-form-item>
        </el-form>
      </div>

      <!-- 执行测试 -->
      <div class="section">
        <el-button
          type="primary"
          @click="runTest"
          :loading="testing"
          :disabled="testMode === 'image' && !imageBase64"
          style="width: 100%"
        >
          {{ testing ? '测试中...' : '开始测试' }}
        </el-button>
      </div>

      <!-- 测试结果 -->
      <div v-if="result" class="section results-section">
        <div class="section-title">测试结果</div>

        <!-- 步骤 1: 推理/注入 -->
        <div class="result-step" :class="stepStatus('inject')">
          <span class="step-icon">{{ stepIcon('inject') }}</span>
          <span class="step-label">{{ testMode === 'image' ? '算法推理' : '事件注入' }}</span>
          <span v-if="testMode === 'image' && inferResult" class="step-detail">
            {{ inferResult.detection_count }} 个检测框 · {{ inferResult.inference_ms.toFixed(1) }}ms
          </span>
          <span v-if="testMode === 'synthesis' && triggerResult" class="step-detail">
            类型: {{ triggerResult.alarm_type }}
          </span>
        </div>

        <!-- 步骤 1b: 检测可视化 (仅 image 模式) -->
        <div v-if="testMode === 'image' && inferResult && inferResult.detections.length > 0" class="detection-viz">
          <div v-for="(det, i) in inferResult.detections" :key="i" class="det-item">
            <el-tag size="small">{{ det.class_name }}</el-tag>
            <span class="det-conf">{{ (det.confidence * 100).toFixed(1) }}%</span>
            <span class="det-box">[{{ det.x1.toFixed(2) }}, {{ det.y1.toFixed(2) }}, {{ det.x2.toFixed(2) }}, {{ det.y2.toFixed(2) }}]</span>
          </div>
        </div>

        <!-- 步骤 2: 规则匹配 -->
        <div class="result-step" :class="stepStatus('match')">
          <span class="step-icon">{{ stepIcon('match') }}</span>
          <span class="step-label">规则匹配</span>
          <span class="step-detail">{{ matchedRuleCount }} 条规则命中</span>
        </div>
        <div v-if="allMatchedRules.length > 0" class="matched-rules-list">
          <div v-for="r in allMatchedRules" :key="r.rule_id" class="matched-rule-item">
            <el-tag :type="r.matched ? 'success' : 'info'" size="small">{{ r.matched ? '✓' : '—' }}</el-tag>
            <span>{{ r.rule_name || r.rule_id }}</span>
          </div>
        </div>

        <!-- 步骤 3: 联动动作 -->
        <div class="result-step" :class="stepStatus('action')">
          <span class="step-icon">{{ stepIcon('action') }}</span>
          <span class="step-label">联动动作执行</span>
          <span v-if="triggerResult" class="step-detail">{{ triggerResult.simulated_actions.length }} 个动作</span>
        </div>

        <!-- 步骤 4: 告警落库 -->
        <div class="result-step" :class="stepStatus('alarm')">
          <span class="step-icon">{{ stepIcon('alarm') }}</span>
          <span class="step-label">告警落库</span>
          <span v-if="inferResult?.alarm_triggered" class="step-detail">alarm_type: {{ inferResult.alarm_type }}</span>
        </div>

        <!-- 步骤 5: WebSocket 弹窗 -->
        <div class="result-step" :class="stepStatus('ws')">
          <span class="step-icon">{{ stepIcon('ws') }}</span>
          <span class="step-label">WebSocket 推送</span>
          <span v-if="inferResult?.ws_pushed" class="step-detail">linkage_alarm 已推送</span>
        </div>
      </div>

      <!-- 错误信息 -->
      <el-alert v-if="errorMsg" type="error" :title="errorMsg" :closable="true" @close="errorMsg = ''" style="margin-top: 12px" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, InfoFilled } from '@element-plus/icons-vue'
import { testApi } from '@/api/test'
import type { InferImageResult, TestTriggerResult, EventCoverageItem, MatchedRule } from '@/api/test'

const props = defineProps<{
  modelValue: boolean
  eventName: string
  eventType: string
  coverageInfo: EventCoverageItem | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

// ── 状态 ──
const testMode = ref<'image' | 'synthesis'>('synthesis')
const imageBase64 = ref('')
const previewUrl = ref('')
const alarmType = ref(props.eventType)
const confidenceThreshold = ref(0.4)
const severity = ref(4)
const testing = ref(false)
const errorMsg = ref('')

// 结果
const inferResult = ref<InferImageResult | null>(null)
const triggerResult = ref<TestTriggerResult | null>(null)
const result = ref(false)

// 步骤状态: pending | success | fail
const steps = ref<Record<string, string>>({})

// ── 计算属性 ──
const canImageTest = computed(() => props.coverageInfo?.test_mode === 'image')

const allMatchedRules = computed<MatchedRule[]>(() => {
  if (inferResult.value?.matched_rules) return inferResult.value.matched_rules
  if (triggerResult.value?.matched_rules) return triggerResult.value.matched_rules
  return []
})

const matchedRuleCount = computed(() => allMatchedRules.value.filter(r => r.matched).length)

// ── 事件处理 ──
watch(() => props.coverageInfo, (info) => {
  if (info) {
    testMode.value = info.test_mode === 'image' ? 'image' : 'synthesis'
  }
}, { immediate: true })

watch(() => props.eventType, (t) => {
  alarmType.value = t
})

function onImageChange(file: any) {
  const raw = file.raw || file
  if (!raw) return
  if (raw.size > 4 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 4MB')
    return
  }
  previewUrl.value = URL.createObjectURL(raw)
  testApi.fileToBase64(raw).then(b64 => {
    imageBase64.value = b64
  }).catch(() => {
    ElMessage.error('图片读取失败')
  })
}

async function runTest() {
  testing.value = true
  errorMsg.value = ''
  result.value = false
  inferResult.value = null
  triggerResult.value = null
  steps.value = { inject: 'pending', match: 'pending', action: 'pending', alarm: 'pending', ws: 'pending' }

  try {
    if (testMode.value === 'image') {
      // 通道 A: 图片推理
      const algoId = props.coverageInfo?.algo_id || ''
      if (!algoId) {
        throw new Error('未找到关联算法，请切换到合成事件模式')
      }
      if (!imageBase64.value) {
        throw new Error('请先上传测试图片')
      }

      const res = await testApi.inferImage({
        image_base64: imageBase64.value,
        algo_id: algoId,
        confidence_threshold: confidenceThreshold.value,
        trigger_alarm: true,
        alarm_type: alarmType.value,
      })

      const data = (res as any)?.data?.data ?? (res as any)?.data
      if (!data) throw new Error('API 返回空数据')

      inferResult.value = data

      // 步骤 1: 推理
      steps.value.inject = data.detection_count > 0 ? 'success' : 'fail'

      // 步骤 2: 规则匹配
      steps.value.match = (data.matched_rules || []).some((r: MatchedRule) => r.matched) ? 'success' : 'fail'

      // 步骤 3: 动作 (infer-image 不直接返回动作列表，通过 alarm_triggered 推断)
      steps.value.action = data.alarm_triggered ? 'success' : 'pending'

      // 步骤 4: 告警落库
      steps.value.alarm = data.alarm_triggered ? 'success' : 'fail'

      // 步骤 5: WS 推送
      steps.value.ws = data.ws_pushed ? 'success' : 'fail'

    } else {
      // 通道 B: 合成事件注入
      const res = await testApi.triggerEvent({
        alarm_type: alarmType.value,
        channel_id_str: 'test_channel',
        severity: severity.value,
        confidence: 0.9,
      })

      const data = (res as any)?.data?.data ?? (res as any)?.data
      if (!data) throw new Error('API 返回空数据')

      triggerResult.value = data

      // 步骤 1: 注入
      steps.value.inject = 'success'

      // 步骤 2: 规则匹配
      steps.value.match = data.matched ? 'success' : 'fail'

      // 步骤 3: 动作执行
      steps.value.action = (data.simulated_actions || []).length > 0 ? 'success' :
                           (data.triggered ? 'success' : 'fail')

      // 步骤 4: 告警落库 (trigger 内部走 AlarmDispatcher)
      steps.value.alarm = data.triggered ? 'success' : 'pending'

      // 步骤 5: WS (trigger 内部推送)
      steps.value.ws = data.triggered ? 'success' : 'pending'
    }

    result.value = true

    const allSuccess = Object.values(steps.value).every(s => s === 'success')
    ElMessage[allSuccess ? 'success' : 'warning'](
      allSuccess ? '测试通过 ✓' : '测试完成，部分步骤异常'
    )

  } catch (e: any) {
    errorMsg.value = e?.message || String(e)
    steps.value.inject = 'fail'
    result.value = true
  } finally {
    testing.value = false
  }
}

function stepStatus(key: string) {
  return steps.value[key] || 'pending'
}

function stepIcon(key: string) {
  const s = steps.value[key]
  if (s === 'success') return '✅'
  if (s === 'fail') return '❌'
  return '⏳'
}
</script>

<style scoped>
.test-drawer-body { padding: 0 20px 20px; }
.section { margin-bottom: 20px; }
.section-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.mode-hint { font-size: 12px; color: #909399; margin-top: 8px; display: flex; align-items: center; gap: 4px; }
.upload-preview { position: relative; width: 100%; }
.preview-img { max-width: 100%; max-height: 200px; border-radius: 8px; }
.preview-change { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.5); color: #fff; text-align: center; padding: 4px; border-radius: 0 0 8px 8px; font-size: 12px; }
.upload-placeholder { padding: 20px 0; }

.results-section { border-top: 1px solid #ebeef5; padding-top: 16px; }
.result-step { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 14px; }
.step-icon { font-size: 18px; }
.step-label { font-weight: 500; min-width: 100px; }
.step-detail { color: #606266; font-size: 12px; }
.detection-viz { background: #f5f7fa; border-radius: 8px; padding: 8px; margin-left: 26px; margin-bottom: 8px; }
.det-item { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-size: 12px; }
.det-conf { color: #67c23a; font-weight: 600; }
.det-box { color: #909399; font-family: monospace; }
.matched-rules-list { margin-left: 26px; margin-bottom: 8px; }
.matched-rule-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; font-size: 12px; }
</style>
