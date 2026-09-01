<template>
  <div class="aep-root">
    <!-- ═══ 块 1: 多模态证据源 + D-S 融合 (对齐 box-sdk P1-1 fusion/ingest 五模态) ═══ -->
    <div class="aep-block">
      <div class="aep-block-head">
        <span class="aep-block-title">多模态证据源与 D-S 融合</span>
        <span class="aep-block-hint">对齐 fusion/ingest 五模态 (video / radar / thermal / audio / iot); 证据源 ≥2 且融合置信度达阈值才触发 (D-S 证据理论)</span>
      </div>
      <div class="aep-modality-grid">
        <div
          v-for="m in MODALITIES" :key="m.key" class="aep-modality"
          :class="{ 'is-on': fusion.modalities.includes(m.key) }" @click="toggleModality(m.key)"
        >
          <span class="aep-modality-icon">{{ m.icon }}</span>
          <span class="aep-modality-name">{{ m.name }}</span>
          <span class="aep-modality-en">{{ m.key }}</span>
        </div>
      </div>
      <el-row :gutter="16" class="aep-slider-row">
        <el-col :span="14">
          <div class="aep-field-label">
            D-S 融合置信度阈值
            <el-tooltip content="多源证据经 Dempster-Shafer 融合后的决策线; 0.6 为 P1-1 真机标定值 (三模态 0.396→0.6132 实证)" placement="top">
              <el-icon class="aep-q"><QuestionFilled /></el-icon>
            </el-tooltip>
            <span class="aep-field-value">{{ fusion.threshold.toFixed(2) }}</span>
          </div>
          <el-slider v-model="thresholdProxy" :min="0.4" :max="0.9" :step="0.05" show-stops />
        </el-col>
        <el-col :span="10">
          <div class="aep-field-label">
            最少证据源数
            <el-tooltip content="独立证据源数下限; 后端裁决要求源数 ≥2 才回调告警" placement="top">
              <el-icon class="aep-q"><QuestionFilled /></el-icon>
            </el-tooltip>
            <span class="aep-field-value">{{ fusion.minSources }}</span>
          </div>
          <el-slider v-model="minSourcesProxy" :min="2" :max="5" :step="1" show-stops />
        </el-col>
      </el-row>
    </div>

    <!-- ═══ 块 2: VLM 二次验证 (enable_vlm_verify + vlm_suppress_threshold, LinkageEngine v8.0 字段) ═══ -->
    <div class="aep-block">
      <div class="aep-block-head">
        <span class="aep-block-title">VLM 视觉大模型二次验证</span>
        <span class="aep-block-hint">触发动作执行前用 VLM 复核画面, 判定置信度低于阈值的告警被抑制 (降误报)</span>
      </div>
      <el-row :gutter="16" align="middle">
        <el-col :span="8">
          <el-switch
            :model-value="enableVlmVerify" active-text="启用 VLM 验证"
            @update:model-value="(v: boolean | string | number) => emit('update:enableVlmVerify', !!v)"
          />
        </el-col>
        <el-col :span="16">
          <div class="aep-field-label">
            误报抑制阈值 (vlm_suppress_threshold)
            <span class="aep-field-value">{{ vlmSuppressThreshold.toFixed(2) }}</span>
          </div>
          <el-slider :model-value="vlmSuppressThreshold" :min="0.5" :max="0.99" :step="0.01" :disabled="!enableVlmVerify"
            @update:model-value="(v: number | number[]) => emit('update:vlmSuppressThreshold', Array.isArray(v) ? Number(v[0]) : v)" />
        </el-col>
      </el-row>
    </div>

    <!-- ═══ 块 3: 算力预估 (算能 AlgoCapability / 英特尔 Geti 能力反哺式) ═══ -->
    <div class="aep-block">
      <div class="aep-block-head">
        <span class="aep-block-title">算力预估 (BM1688 TPU)</span>
        <span class="aep-block-hint">基于触发事件类型映射算法的 fps / 精度实时估算 (经验模型, 供容量参考)</span>
      </div>
      <div v-if="matchedAlgos.length > 0" class="aep-algo-list">
        <div v-for="a in matchedAlgos" :key="a.id" class="aep-algo-row">
          <span class="aep-algo-name">{{ a.name_zh || a.name }}</span>
          <el-tag size="small" effect="plain">{{ a.accuracy ? (a.accuracy * 100).toFixed(1) + '%' : '—' }} 精度</el-tag>
          <el-tag size="small" effect="plain">{{ a.fps }} fps</el-tag>
          <el-tag size="small" type="warning" effect="plain">≈ {{ estPerAlgo(a).toFixed(1) }}% TPU/路</el-tag>
        </div>
        <div class="aep-tpu-bar">
          <div class="aep-tpu-label">
            已选 {{ selectedChannelCount || '全部' }} 通道预估总占用
            <span class="aep-field-value">{{ totalEst.toFixed(1) }}%</span>
          </div>
          <el-progress :percentage="Math.min(100, Math.round(totalEst))" :color="totalEst > 80 ? '#F56C6C' : totalEst > 50 ? '#E6A23C' : '#67C23A'" :stroke-width="10" />
          <div class="aep-tpu-hint">
            剩余容量约可再挂 <b>{{ headroom }}</b> 路同类推理; 数据为 BM1688 经验估算, 精确值以部署后 TPU 监控为准
          </div>
        </div>
      </div>
      <el-empty v-else description="先在「触发条件」步骤选择事件类型, 将映射算法并估算算力" :image-size="44" />
    </div>

    <!-- ═══ 块 4: 告警分级 (研华 DeviceOn 工业分级标准 → 自动联动响应时限) ═══ -->
    <div class="aep-block">
      <div class="aep-block-head">
        <span class="aep-block-title">告警分级 (工业级)</span>
        <span class="aep-block-hint">对标研华 DeviceOn 工单分级; 选择等级自动填入响应时限 (可在「确认」步修改)</span>
      </div>
      <div class="aep-grade-grid">
        <div
          v-for="g in GRADES" :key="g.level" class="aep-grade" :class="{ 'is-on': responseDeadlineS === g.deadline }"
          :style="{ '--grade-color': g.color }" @click="emit('update:responseDeadlineS', g.deadline)"
        >
          <div class="aep-grade-head"><b>{{ g.level }}</b><span>{{ g.name }}</span></div>
          <div class="aep-grade-desc">{{ g.desc }}</div>
          <div class="aep-grade-sla">响应时限 {{ g.deadline === 0 ? '未设置' : g.deadline >= 3600 ? (g.deadline / 3600) + 'h' : (g.deadline / 60) + 'min' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// [vp7 新建事件规则向导 2026-09-01] AI 增强面板:
//   ① 五模态证据源 + D-S 融合阈值可视化 (对齐 box-sdk P1-1 /fusion/ingest;
//      决策线 conf≥0.6 且源≥2 与 RestApiHandlers 裁决一致)
//   ② VLM 验证可视化 (LinkageEngine.h:477-478 enable_vlm_verify + vlm_suppress_threshold 真实字段)
//   ③ 算力预估: 事件类型→算法 (AlgorithmInfo fps/accuracy) → TPU% 经验估算 (算能/英特尔对标)
//   ④ 研华 DeviceOn 工业分级 P1-P4 → 自动联动响应时限
import { ref, computed, onMounted, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import algorithmsApi from '@/api/algorithms'
import type { AlgorithmInfo } from '@/api/algorithms'

export interface FusionConfig { modalities: string[]; threshold: number; minSources: number }

const props = defineProps<{
  fusion: FusionConfig
  vlmSuppressThreshold: number
  enableVlmVerify: boolean
  selectedEventTypes: string[]
  selectedChannelCount: number
  responseDeadlineS: number
}>()
const emit = defineEmits<{
  (e: 'update:fusion', v: FusionConfig): void
  (e: 'update:vlmSuppressThreshold', v: number): void
  (e: 'update:enableVlmVerify', v: boolean): void
  (e: 'update:responseDeadlineS', v: number): void
  (e: 'est', v: { total: number; headroom: number }): void
}>()

const MODALITIES = [
  { key: 'video', icon: '📹', name: '视频' },
  { key: 'radar', icon: '📡', name: '毫米波雷达' },
  { key: 'thermal', icon: '🌡️', name: '红外热成像' },
  { key: 'audio', icon: '🎤', name: '音频' },
  { key: 'iot', icon: '🔌', name: 'IoT 传感' },
] as const

const GRADES = [
  { level: 'P1', name: '紧急', color: '#F56C6C', desc: '火情/人员闯入等即时威胁', deadline: 900 },
  { level: 'P2', name: '重要', color: '#E6A23C', desc: '翻越/斗殴等治安事件', deadline: 1800 },
  { level: 'P3', name: '一般', color: '#409EFF', desc: '违停/遗留物等常规事件', deadline: 14400 },
  { level: 'P4', name: '提示', color: '#909399', desc: '巡检提醒/统计类', deadline: 86400 },
]

function toggleModality(key: string) {
  const set = new Set(props.fusion.modalities)
  if (set.has(key)) { if (set.size > 1) set.delete(key) } else set.add(key)
  emit('update:fusion', { ...props.fusion, modalities: [...set] })
}

// slider 代理 (v-model 语义转 update:fusion 合并 emit)
const thresholdProxy = computed({
  get: () => props.fusion.threshold,
  set: (v: number) => emit('update:fusion', { ...props.fusion, threshold: v }),
})
const minSourcesProxy = computed({
  get: () => props.fusion.minSources,
  set: (v: number) => emit('update:fusion', { ...props.fusion, minSources: v }),
})

// ── 算力预估: 事件类型 → 算法匹配 → TPU% 估算 ──
const allAlgos = ref<AlgorithmInfo[]>([])
onMounted(async () => {
  try {
    const res = await algorithmsApi.listAll({ enabled: true })
    allAlgos.value = (res.data?.data as AlgorithmInfo[]) || []
  } catch { allAlgos.value = [] }
})

/** 事件类型前缀 → 算法 alarm_type/名称 关键词映射 */
const EVENT_ALGO_HINTS: Array<[RegExp, string[]]> = [
  [/^perimeter|^intrusion|^climbing/, ['周界', 'intrusion', 'perimeter']],
  [/^smoke|^fire/, ['烟火', 'fire', 'smoke']],
  [/^face/, ['人脸', 'face']],
  [/^traffic|^vehicle|^parking/, ['车辆', 'vehicle', 'traffic']],
  [/^(loitering|gathering|behavior|fighting|fall)/, ['行为', 'behavior']],
  [/^abandoned/, ['遗留', 'abandoned']],
]
const matchedAlgos = computed(() => {
  if (props.selectedEventTypes.length === 0) return []
  const kws = new Set<string>()
  for (const et of props.selectedEventTypes) {
    for (const [re, ks] of EVENT_ALGO_HINTS) if (re.test(et)) ks.forEach(k => kws.add(k))
  }
  if (kws.size === 0) return []
  const hits: AlgorithmInfo[] = []
  const seen = new Set<string>()
  for (const a of allAlgos.value) {
    const hay = `${a.alarm_type || ''} ${a.name} ${a.name_zh || ''}`
    for (const kw of kws) {
      if (hay.toLowerCase().includes(kw.toLowerCase()) && !seen.has(a.id)) { hits.push(a); seen.add(a.id); break }
    }
  }
  return hits.slice(0, 6)
})

/** 单路 TPU 占用经验估算: (fps/25) × 6%, 分类/低帧率算法线性缩放 (BM1688 检测类 25fps 满帧基准 ≈6%) */
function estPerAlgo(a: AlgorithmInfo): number {
  return Math.min(30, ((a.fps || 10) / 25) * 6)
}
/** 去重算法族后的总占用 (同族事件映射同算法只计一次), 按已选通道数放大 */
const totalEst = computed(() => {
  const uniq = new Map<string, number>()
  for (const a of matchedAlgos.value) uniq.set(a.id, estPerAlgo(a))
  const perChannel = [...uniq.values()].reduce((s, v) => s + v, 0)
  const n = Math.max(1, props.selectedChannelCount || 1)
  return perChannel * n
})
const headroom = computed(() => {
  const perChannel = matchedAlgos.value.length ? estPerAlgo(matchedAlgos.value[0]) : 6
  return Math.max(0, Math.floor((100 - totalEst.value) / Math.max(perChannel, 0.5)))
})

watch(() => props.selectedEventTypes, () => { /* computed 自动跟随, 占位保持响应语义 */ })
// 算力估算结果上抛 (父视图转传「确认」步预览面板做摘要展示)
watch([totalEst, headroom], ([t, h]) => emit('est', { total: t, headroom: h }), { immediate: true })
</script>

<style scoped>
.aep-root { display: flex; flex-direction: column; gap: 12px; }
.aep-block { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 10px 12px; }
.aep-block-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.aep-block-title { font-size: 13px; font-weight: 600; }
.aep-block-hint { font-size: 11px; color: var(--el-text-color-secondary); }
.aep-modality-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 10px; }
.aep-modality { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px 4px; text-align: center; cursor: pointer; transition: all .15s; display: flex; flex-direction: column; gap: 2px; }
.aep-modality:hover { border-color: var(--el-color-primary-light-5); }
.aep-modality.is-on { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.aep-modality-icon { font-size: 18px; }
.aep-modality-name { font-size: 12px; font-weight: 600; }
.aep-modality-en { font-size: 10px; color: var(--el-text-color-placeholder); }
.aep-slider-row { margin-top: 2px; }
.aep-field-label { font-size: 12px; display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.aep-field-value { color: var(--el-color-primary); font-weight: 600; margin-left: auto; }
.aep-q { color: var(--el-text-color-placeholder); cursor: help; }
.aep-algo-list { display: flex; flex-direction: column; gap: 6px; }
.aep-algo-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.aep-algo-name { min-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aep-tpu-bar { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--el-border-color-lighter); }
.aep-tpu-label { font-size: 12px; display: flex; margin-bottom: 4px; }
.aep-tpu-hint { font-size: 11px; color: var(--el-text-color-secondary); margin-top: 4px; }
.aep-grade-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.aep-grade { border: 1px solid var(--el-border-color-lighter); border-top: 3px solid var(--grade-color); border-radius: 6px; padding: 8px 10px; cursor: pointer; transition: all .15s; }
.aep-grade:hover { border-color: var(--grade-color); }
.aep-grade.is-on { background: color-mix(in srgb, var(--grade-color) 8%, transparent); border-color: var(--grade-color); }
.aep-grade-head { display: flex; align-items: baseline; gap: 6px; font-size: 13px; }
.aep-grade-head b { color: var(--grade-color); }
.aep-grade-desc { font-size: 11px; color: var(--el-text-color-secondary); margin: 2px 0; min-height: 28px; }
.aep-grade-sla { font-size: 11px; font-weight: 600; }
@media (max-width: 1180px) {
  .aep-modality-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .aep-grade-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
