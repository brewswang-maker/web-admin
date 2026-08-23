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
          <el-radio value="image">📷 图片推理</el-radio>
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
            <div class="el-upload__tip">支持 JPEG / PNG，最大 16MB</div>
          </template>
        </el-upload>
      </div>

      <!-- 算法选择 (仅 image 模式) -->
      <div v-if="testMode === 'image'" class="section">
        <div class="section-title">
          推理算法
          <span v-if="algoLoadingStatus" style="font-size: 12px; font-weight: normal; color: #909399; margin-left: 8px">{{ algoLoadingStatus }}</span>
          <el-button v-if="availableAlgorithms.length === 0 && !algoLoading" size="small" text type="primary" @click="loadAlgorithms(true)" style="margin-left: 8px">重新加载</el-button>
        </div>
        <el-select v-model="selectedAlgoId" placeholder="选择算法" style="width: 100%" :disabled="testing || algoLoading" filterable>
          <el-option
            v-for="algo in availableAlgorithms"
            :key="algo.algo_id || algo.id"
            :label="`${algo.name_zh || algo.name} (${algo.algo_id || algo.id})`"
            :value="algo.algo_id || algo.id"
          />
        </el-select>
        <div v-if="availableAlgorithms.length === 0 && !algoLoading && algoLoadError" class="mode-hint" style="color: #F56C6C">
          <el-icon><InfoFilled /></el-icon>
          算法列表加载失败: {{ algoLoadError }}
        </div>
        <div v-if="!selectedAlgoId && availableAlgorithms.length > 0" class="mode-hint" style="color: #E6A23C">
          <el-icon><InfoFilled /></el-icon>
          请选择推理算法，检测结果将触发事件弹窗
        </div>
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
          <!-- [FIX 2026-08-18] 严重度控件对 image 模式开放: infer-image 新增 severity 参数,
               用于 dryRun 规则匹配演练 (min_severity=5 的规则模板默认 severity=4 永不命中) -->
          <el-form-item label="严重度">
            <el-input-number v-model="severity" :min="1" :max="5" />
            <span v-if="testMode === 'image'" class="severity-hint">影响规则匹配演练</span>
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
            <el-tag v-if="inferResult.infer_backend" size="small" type="info" style="margin-left: 4px">{{ inferResult.infer_backend }}</el-tag>
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

        <!-- [FIX 2026-08-15] 0 检出根因说明 (后端 helper 层诊断透传) -->
        <div v-if="testMode === 'image' && inferResult?.zero_detection_reason" class="detection-viz">
          <span class="zero-reason">⚠️ {{ inferResult.zero_detection_reason }}</span>
        </div>

        <!-- 步骤 2: 规则匹配 -->
        <div class="result-step" :class="stepStatus('match')">
          <span class="step-icon">{{ stepIcon('match') }}</span>
          <span class="step-label">规则匹配</span>
          <span class="step-detail">{{ steps.match === 'skipped' ? '未执行 (推理 0 框)' : matchedRuleCount + ' 条规则命中' }}</span>
        </div>
        <div v-if="allMatchedRules.length > 0" class="matched-rules-list">
          <div v-for="r in allMatchedRules" :key="r.rule_id" class="matched-rule-item">
            <el-tag :type="r.matched ? 'success' : 'info'" size="small">{{ r.matched ? '✓' : '—' }}</el-tag>
            <span>{{ r.rule_name || r.rule_id }}</span>
            <el-tag v-if="r.cooldown_active" type="warning" size="small">冷却中</el-tag>
            <!-- [FIX 2026-08-18] 未命中具体原因直接展示 (如 "严重度 4 < 规则 min_severity 5"), 免去查日志 -->
            <span v-if="!r.matched && r.match_reason" class="match-reason">{{ r.match_reason }}</span>
          </div>
        </div>

        <!-- 步骤 3: 联动动作 -->
        <div class="result-step" :class="stepStatus('action')">
          <span class="step-icon">{{ stepIcon('action') }}</span>
          <span class="step-label">联动动作执行</span>
          <span v-if="steps.action === 'skipped'" class="step-detail">未执行 (推理 0 框)</span>
          <span v-else-if="triggerResult" class="step-detail">{{ triggerResult.simulated_actions.length }} 个动作</span>
        </div>

        <!-- 步骤 4: 告警落库 -->
        <div class="result-step" :class="stepStatus('alarm')">
          <span class="step-icon">{{ stepIcon('alarm') }}</span>
          <span class="step-label">告警落库</span>
          <span v-if="steps.alarm === 'skipped'" class="step-detail">未执行 (推理 0 框)</span>
          <span v-else-if="inferResult?.alarm_rejected" class="step-detail reject-detail">未触发 (图片与事件类型不符)</span>
          <span v-else-if="inferResult?.alarm_triggered" class="step-detail">alarm_type: {{ inferResult.alarm_type }}</span>
        </div>

        <!-- 步骤 5: WebSocket 弹窗 -->
        <div class="result-step" :class="stepStatus('ws')">
          <span class="step-icon">{{ stepIcon('ws') }}</span>
          <span class="step-label">WebSocket 推送</span>
          <span v-if="steps.ws === 'skipped'" class="step-detail">未执行 (推理 0 框)</span>
          <span v-else-if="inferResult?.ws_pushed" class="step-detail">linkage_alarm 已推送</span>
          <span v-else-if="inferResult?.alarm_triggered" class="step-detail">未推送 (规则未命中/冷却中/无 Web弹窗动作)</span>
        </div>
      </div>

      <!-- 语义校验拒绝说明 -->
      <el-alert
        v-if="inferResult?.alarm_rejected"
        type="warning"
        :title="inferResult.reject_reason || '图片内容与事件类型不一致，未触发告警'"
        :closable="false"
        style="margin-top: 12px"
      />

      <!-- 错误信息 -->
      <el-alert v-if="errorMsg" type="error" :title="errorMsg" :closable="true" @close="errorMsg = ''" style="margin-top: 12px" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, InfoFilled } from '@element-plus/icons-vue'
import { testApi } from '@/api/test'
import { getAuthToken } from '@/utils/auth'
import algorithmsApi from '@/api/algorithms'
import type { AlgorithmInfo } from '@/api/algorithms'
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
const testMode = ref<'image' | 'synthesis'>('image')
const imageBase64 = ref('')
const previewUrl = ref('')
const alarmType = ref(props.eventType)
const confidenceThreshold = ref(0.4)
const severity = ref(4)
const testing = ref(false)
const errorMsg = ref('')

// 算法选择
const selectedAlgoId = ref('')
const availableAlgorithms = ref<AlgorithmInfo[]>([])
const algoLoading = ref(false)
const algoLoadError = ref('')
const algoLoadingStatus = computed(() => {
  if (algoLoading.value) return '(加载中...)'
  if (availableAlgorithms.value.length > 0) return `(${availableAlgorithms.value.length} 个算法)`
  return ''
})

// 结果
const inferResult = ref<InferImageResult | null>(null)
const triggerResult = ref<TestTriggerResult | null>(null)
const result = ref(false)

// 步骤状态: pending | success | fail | rejected (语义校验拒绝)
const steps = ref<Record<string, string>>({})

// ── 计算属性 ──
// 图片推理始终可用（去掉覆盖率矩阵限制，用户可手动选择算法）

const allMatchedRules = computed<MatchedRule[]>(() => {
  if (inferResult.value?.matched_rules) return inferResult.value.matched_rules
  if (triggerResult.value?.matched_rules) return triggerResult.value.matched_rules
  return []
})

const matchedRuleCount = computed(() => allMatchedRules.value.filter(r => r.matched).length)

// ── 事件处理 ──
// 加载算法列表 — 使用原生 fetch 绕过 axios 拦截器可能的干扰
// [FIX 2026-08-15] 改用 /algorithms/all 全量接口:
//   原 /algorithms 默认 pageSize=50, 65 个算法只显示前 50 个
//   (睡岗/危险物品/OCR 等后 15 个不可见)
async function loadAlgorithms(force = false) {
  if (algoLoading.value && !force) return
  algoLoading.value = true
  algoLoadError.value = ''
  try {
    // 方案1: 优先用 algorithmsApi (axios) — 全量接口
    let list: any[] = []
    try {
      const res = await algorithmsApi.listAll()
      const raw = (res as any)?.data
      list = raw?.data?.algorithms ?? raw?.data?.items ?? raw?.algorithms ?? []
      console.log('[EventTestDrawer] algorithmsApi.listAll() raw keys:', Object.keys(raw || {}), 'data keys:', raw?.data ? Object.keys(raw.data) : 'N/A', 'list length:', Array.isArray(list) ? list.length : 'NOT_ARRAY')
    } catch (e1) {
      console.warn('[EventTestDrawer] algorithmsApi.listAll() failed, trying fetch fallback:', e1)
      // 方案2: fetch fallback — token 存在 Cookie 中 (shieldai_token)
      const token = getAuthToken() || ''
      const resp = await fetch('/api/v1/algorithms/all', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json()
      list = json?.data?.algorithms ?? json?.data?.items ?? json?.algorithms ?? []
      console.log('[EventTestDrawer] fetch fallback list length:', Array.isArray(list) ? list.length : 'NOT_ARRAY')
    }
    if (!Array.isArray(list)) list = []
    availableAlgorithms.value = list.filter((a: any) => a.enabled !== false)
    console.log('[EventTestDrawer] loaded algorithms:', availableAlgorithms.value.length, 'eventType:', props.eventType, 'covAlgoId:', props.coverageInfo?.algo_id)
    if (availableAlgorithms.value.length === 0) {
      algoLoadError.value = 'API 返回空列表'
    }
    // 算法列表加载后尝试自动选中
    autoSelectAlgorithm()
  } catch (e: any) {
    console.error('[EventTestDrawer] loadAlgorithms failed:', e)
    algoLoadError.value = e?.message || String(e)
    availableAlgorithms.value = []
  } finally {
    algoLoading.value = false
  }
}

// 智能匹配算法：按优先级尝试多种匹配策略
// 规则的 source_cond.algorithm_ids 存的是事件类型字符串（如 "intrusion"），不是插件 ID
// 需要通过事件类型反查到对应的算法插件
function autoSelectAlgorithm() {
  if (selectedAlgoId.value) return // 用户已手动选择
  const algos = availableAlgorithms.value
  if (algos.length === 0) return

  const evtType = (props.eventType || '').toLowerCase()
  const covAlgoId = props.coverageInfo?.algo_id || ''
  console.log('[EventTestDrawer] autoSelectAlgorithm: evtType=', evtType, 'covAlgoId=', covAlgoId, 'algos=', algos.length)

  // 策略1: coverageInfo.algo_id 直接匹配（覆盖率矩阵返回的是完整插件 ID）
  if (covAlgoId) {
    const match = algos.find(a => (a.algo_id || a.id) === covAlgoId)
    if (match) {
      selectedAlgoId.value = match.algo_id || match.id
      console.log('[EventTestDrawer] ✅ 策略1匹配(coverage):', selectedAlgoId.value)
      return
    }
  }

  // 策略2: 事件类型精确匹配算法的 alarm_type
  if (evtType) {
    const match = algos.find(a => (a.alarm_type || '').toLowerCase() === evtType)
    if (match) {
      selectedAlgoId.value = match.algo_id || match.id
      console.log('[EventTestDrawer] ✅ 策略2匹配(alarm_type):', selectedAlgoId.value)
      return
    }
  }

  // 策略3: 事件类型是插件 algo_id 的末尾段
  // 如 intrusion → shield.algo.perimeter.intrusion
  if (evtType) {
    const match = algos.find(a => {
      const aid = (a.algo_id || a.id || '').toLowerCase()
      return aid.endsWith('.' + evtType) || aid === evtType
    })
    if (match) {
      selectedAlgoId.value = match.algo_id || match.id
      console.log('[EventTestDrawer] ✅ 策略3匹配(algo_id后缀):', selectedAlgoId.value)
      return
    }
  }

  // 策略4: 反向匹配 — 算法 alarm_type 是事件类型的前缀或子串
  // 如 blacklist_person → 算法 alarm_type="face_detect" 不匹配，但可以用前缀 "face" 匹配
  if (evtType) {
    const prefix = evtType.split('_')[0] // blacklist_person → blacklist
    if (prefix.length >= 4) {
      const match = algos.find(a => {
        const atype = (a.alarm_type || '').toLowerCase()
        const aid = (a.algo_id || a.id || '').toLowerCase()
        return (atype && (atype.startsWith(prefix) || prefix.startsWith(atype))) ||
               aid.includes('.' + prefix + '.')
      })
      if (match) {
        selectedAlgoId.value = match.algo_id || match.id
        console.log('[EventTestDrawer] ✅ 策略4匹配(前缀):', selectedAlgoId.value)
        return
      }
    }
  }

  // 策略5: 按事件类型关键词模糊匹配算法名称/中文名
  if (evtType) {
    const keyword = evtType.replace(/[_-]/g, '').toLowerCase()
    const match = algos.find(a => {
      const nameZh = (a.name_zh || '').toLowerCase()
      const name = (a.name || '').toLowerCase()
      const aid = (a.algo_id || a.id || '').toLowerCase().replace(/[-.]/g, '')
      return nameZh.includes(keyword) || name.includes(keyword) || aid.includes(keyword)
    })
    if (match) {
      selectedAlgoId.value = match.algo_id || match.id
      console.log('[EventTestDrawer] ✅ 策略5匹配(模糊):', selectedAlgoId.value)
      return
    }
  }

  console.log('[EventTestDrawer] ⚠️ 未找到匹配算法，eventType=', evtType)
}

// 组件在 LinkageRuleView 中无 v-if，页面加载时就挂载
// onMounted 时 token 可能尚未就绪导致 API 失败
// 所以每次 drawer 打开时都要确保算法列表已加载
watch(visible, (v) => {
  if (v) {
    loadAlgorithms()
  }
})

watch(() => props.coverageInfo, (info) => {
  if (info) {
    // 始终默认图片推理模式
    testMode.value = 'image'
    // 重置已选算法，触发 autoSelectAlgorithm 重新匹配
    selectedAlgoId.value = ''
    // 如果算法列表已加载，立即尝试匹配；否则触发加载
    if (availableAlgorithms.value.length > 0) {
      autoSelectAlgorithm()
    } else {
      loadAlgorithms()
    }
  }
}, { immediate: true })

watch(() => props.eventType, (t) => {
  alarmType.value = t
})

function onImageChange(file: any) {
  const raw = file.raw || file
  if (!raw) return
  // [FIX 2026-08-18] 后端 infer-image 限制已由 4MB 放宽到 16MB (P2-Bug-5), 前端同步
  if (raw.size > 16 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 16MB')
    return
  }
  // 释放旧的 Object URL 避免内存泄漏
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = URL.createObjectURL(raw)
  testApi.fileToBase64(raw).then(b64 => {
    imageBase64.value = b64
  }).catch(() => {
    ElMessage.error('图片读取失败')
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = ''
    }
  })
}

// 组件卸载时释放 Object URL
onBeforeUnmount(() => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
})

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
      const algoId = selectedAlgoId.value || props.coverageInfo?.algo_id || ''
      if (!algoId) {
        throw new Error('请选择推理算法')
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
        severity: severity.value,
      })

      const data = (res as any)?.data?.data ?? (res as any)?.data
      if (!data) throw new Error('API 返回空数据')

      inferResult.value = data

      // 步骤 1: 推理
      // [FIX 2026-08-15] 0 框不再笼统 'fail': 后端透传 zero_detection_reason
      //   区分真实路径 (质量快检跳过/TPU 无检出/白名单过滤/CPU 回退),
      //   推理已执行但无目标属 'skipped' 警告态, 非链路故障。
      const zeroDetected = data.detection_count === 0
      steps.value.inject = data.detection_count > 0 ? 'success'
        : (data.zero_detection_reason ? 'skipped' : 'fail')

      if (data.alarm_rejected) {
        // 语义校验拒绝: 图片检出类别与事件类型不一致, 后端已拒绝触发告警
        steps.value.match = 'rejected'
        steps.value.action = 'rejected'
        steps.value.alarm = 'rejected'
        steps.value.ws = 'rejected'
      } else if (zeroDetected) {
        // [FIX 2026-08-15] 推理 0 框: 告警链入口条件不满足, 后续步骤
        //   属"未执行"而非连锁失败
        steps.value.match = 'skipped'
        steps.value.action = 'skipped'
        steps.value.alarm = 'skipped'
        steps.value.ws = 'skipped'
      } else {
        // 步骤 2: 规则匹配
        steps.value.match = (data.matched_rules || []).some((r: MatchedRule) => r.matched) ? 'success' : 'fail'

        // 步骤 3: 动作 (infer-image 不直接返回动作列表，通过 alarm_triggered 推断)
        steps.value.action = data.alarm_triggered ? 'success' : 'pending'

        // 步骤 4: 告警落库
        steps.value.alarm = data.alarm_triggered ? 'success' : 'fail'

        // 步骤 5: WS 推送
        steps.value.ws = data.ws_pushed ? 'success' : 'fail'
      }

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

    if (inferResult.value?.alarm_rejected) {
      ElMessage.warning('图片内容与事件类型不一致，已拒绝触发告警')
    } else {
      const statuses = Object.values(steps.value)
      const allSuccess = statuses.every(s => s === 'success')
      // [FIX 2026-08-15] skipped (0 框未检出) 与真实失败提示区分
      const hasSkipped = statuses.some(s => s === 'skipped')
      ElMessage[allSuccess ? 'success' : 'warning'](
        allSuccess ? '测试通过 ✓'
          : hasSkipped ? '推理完成但未检出目标，后续链路未执行'
          : '测试完成，部分步骤异常'
      )
    }

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
  if (s === 'rejected') return '⛔'
  if (s === 'skipped') return '⚠️'
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
.reject-detail { color: #e6a23c; }
.detection-viz { background: #f5f7fa; border-radius: 8px; padding: 8px; margin-left: 26px; margin-bottom: 8px; }
.det-item { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-size: 12px; }
.det-conf { color: #67c23a; font-weight: 600; }
.det-box { color: #909399; font-family: monospace; }
.matched-rules-list { margin-left: 26px; margin-bottom: 8px; }
.matched-rule-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; font-size: 12px; }
.match-reason { color: #909399; font-size: 12px; }
.severity-hint { color: #909399; font-size: 12px; margin-left: 8px; }
.zero-reason { color: #e6a23c; font-size: 12px; }
</style>
