<template>
  <div class="nlg-root">
    <el-alert type="info" :closable="false" style="margin-bottom: 10px">
      <template #title>
        自然语言建规则 — 例:"摄像头检测到人员闯入禁区并停留 30 秒以上时, 触发声光 + 工单 + APP 推送"
        (LLM 辅助解析, 服务不可用时自动本地解析, 均 ≤3s 出结构化预览)
      </template>
    </el-alert>
    <div class="nlg-input-row">
      <el-input
        v-model="text" type="textarea" :rows="2"
        placeholder="描述你的联动场景, 例如: 夜间围墙区域检测到翻越攀爬时, 声光警告 + 电视墙上墙 + 通知管理员"
        @keydown.enter.exact.prevent="parseLocal"
      />
      <div class="nlg-btns">
        <el-button type="primary" :loading="aiLoading" @click="parseWithAi">AI 解析</el-button>
        <el-button @click="parseLocal">本地解析 (即时)</el-button>
      </div>
    </div>
    <div class="nlg-examples">
      <el-tag v-for="ex in EXAMPLES" :key="ex" size="small" class="nlg-example" @click="text = ex">{{ ex }}</el-tag>
    </div>

    <!-- 结构化预览 -->
    <div v-if="preview" class="nlg-preview">
      <el-divider content-position="left">
        解析预览
        <el-tag size="small" :type="preview.source === 'ai' ? 'success' : 'info'" style="margin-left: 8px">
          {{ preview.source === 'ai' ? 'LLM 生成' : '本地解析' }}
        </el-tag>
      </el-divider>
      <div class="nlg-prev-sec">
        <span class="nlg-prev-label">触发事件 ({{ preview.eventTypes.length }})</span>
        <el-tag v-for="t in preview.eventTypes" :key="t" size="small" style="margin-right: 6px">{{ t }}</el-tag>
        <span v-if="!preview.eventTypes.length" class="nlg-miss">未识别 — 请在触发条件步骤手动选择</span>
      </div>
      <div class="nlg-prev-sec">
        <span class="nlg-prev-label">联动动作 ({{ preview.actions.length }})</span>
        <el-tag v-for="a in preview.actions" :key="a.type" size="small" type="warning" style="margin-right: 6px">
          {{ a.type }} <span v-if="a.name">· {{ a.name }}</span>
        </el-tag>
        <span v-if="!preview.actions.length" class="nlg-miss">未识别 — 请在动作编排步骤手动勾选</span>
      </div>
      <div class="nlg-prev-sec" v-if="preview.mergeWindowMs || preview.timeHint || preview.minConfidence != null">
        <span class="nlg-prev-label">参数</span>
        <el-tag v-if="preview.mergeWindowMs" size="small" type="info">持续确认窗口 {{ preview.mergeWindowMs / 1000 }}s</el-tag>
        <el-tag v-if="preview.timeHint" size="small" type="info">{{ preview.timeHint }}</el-tag>
        <el-tag v-if="preview.minConfidence != null" size="small" type="info">置信度 ≥{{ preview.minConfidence }}</el-tag>
      </div>
      <div class="nlg-apply-row">
        <el-button type="success" @click="apply">应用到规则草稿</el-button>
        <span class="text-secondary" style="font-size: 12px; margin-left: 10px">
          应用后仍可在各步骤微调; 设备/通道请在「设备与范围」步骤选择
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RuleNlgInput.vue — 自然语言→规则草稿 NLG 输入 (规则工坊 AI 增强步骤)
 *
 * 对标落地: 宇视梧桐 Copilot AI Agent 辅助配置 / NVIDIA Metropolis 自然语言
 * 生成 pipeline / LLM 辅助配置 (Qwen/DeepSeek 风格)。
 * 双引擎策略: ① 设备端 AI 服务 (POST /ai/chat) 生成 JSON, 3s 超时即降级;
 * ② 本地关键词/正则解析器 (同步 <100ms, 保证验收口径 ≤3s 必出预览)。
 * 输出契约: eventTypes(真实事件键) + actions(LinkageAction 形状) +
 * mergeWindowMs(MergeCondition.window_ms) + timeHint + minConfidence,
 * 由父视图写入规则草稿 — 全部落在 LinkageEngine 真实字段上, 零虚构协议。
 * [vp7 新建规则工坊 2026-09-01]
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { aiApi } from '@/api/ai'
// 动作 TYPE 数字常量 (与 api/linkage.ts ACTION_TYPE_MAP 对齐; 该文件未导出
// ACTION 具名对象, 本地常量避免幽灵 import)
const ACTION = {
  CLIENT_SHOW_LIVE: 100,
  CLIENT_TTS_BROADCAST: 105,
  CLIENT_TV_WALL: 110,
  CLIENT_RECORD_EVENT: 112,
  CLIENT_CAPTURE_IMAGE: 114,
  CLIENT_EXECUTE_PLAN: 109,
  WEB_POPUP: 200,
  WEB_SEND_SMS: 216,
  APP_PUSH_NOTIFY: 300,
  SYS_MQTT_PUBLISH: 500,
  SYS_RELAY_SWITCH: 503,
  SYS_HTTP_CALLBACK: 504,
} as const

interface NlgAction { type: number; name: string; params?: Record<string, unknown> }
interface NlgPreview {
  source: 'ai' | 'local'
  eventTypes: string[]
  actions: NlgAction[]
  mergeWindowMs?: number
  timeHint?: string
  minConfidence?: number
}

const emit = defineEmits<{
  (e: 'apply', p: { eventTypes: string[]; actions: NlgAction[]; mergeWindowMs?: number; timeStart?: string; timeEnd?: string; weekdays?: number[]; minConfidence?: number }): void
}>()

const text = ref('')
const aiLoading = ref(false)
const preview = ref<NlgPreview | null>(null)

const EXAMPLES = [
  '摄像头检测到人员闯入禁区并停留30秒以上时,触发光报警 + 工单 + APP推送',
  '夜间围墙区域翻越攀爬,声光警告 + 电视墙上墙 + 通知管理员',
  '消防通道出现车辆违停超过5分钟,抓图留档 + 短信通知 + 工单',
  '检测到烟雾火焰立即弹窗 + 语音播报疏散 + MQTT 通知消防主机',
]

// ── 本地解析器: 关键词/正则 → 真实事件键与动作枚举 (SyncAction TYPE 映射) ──
/** 事件关键词映射 (canonical 键, 与 LinkageEngine SSOT 对齐) */
const EVENT_LEXICON: Array<[RegExp, string[]]> = [
  [/闯入|入侵|禁区|越界|周界/, ['perimeter.intrusion']],
  [/翻越|攀爬|爬越/, ['perimeter.climbing']],
  [/徘徊|逗留|游荡/, ['loitering']],
  [/聚集|聚众|人群/, ['gathering']],
  [/烟雾|烟/, ['smoke']],
  [/火焰|明火|起火|火情/, ['fire']],
  [/遗留物|遗留物|遗留包裹|可疑物品/, ['abandoned']],
  [/违停|占道|乱停/, ['traffic.parking_violation']],
  [/逆行/, ['traffic.wrong_direction']],
  [/陌生人|陌生脸/, ['face_stranger']],
  [/打架|斗殴/, ['behavior.fighting']],
  [/抽烟|吸烟/, ['smoking']],
  [/摔倒|跌倒/, ['behavior.fall']],
]
/** 动作关键词映射 (TYPE 值与 api/linkage.ts SyncAction 对齐) */
const ACTION_LEXICON: Array<[RegExp, NlgAction]> = [
  [/声光|警笛|光报警|警报器/, { type: 630, name: '声光报警输出' }],
  [/工单|派单/, { type: ACTION.SYS_HTTP_CALLBACK, name: '工单系统回调' }],
  [/APP推送|推送|手机通知/, { type: ACTION.APP_PUSH_NOTIFY, name: 'APP 消息推送' }],
  [/短信/, { type: ACTION.WEB_SEND_SMS, name: '短信通知' }],
  [/弹窗/, { type: ACTION.WEB_POPUP, name: 'Web 弹窗告警' }],
  [/实时视频|看现场|打开画面/, { type: ACTION.CLIENT_SHOW_LIVE, name: '弹出实时视频' }],
  [/电视墙|上墙/, { type: ACTION.CLIENT_TV_WALL, name: '电视墙上墙' }],
  [/语音播报|广播喊话|TTS/, { type: ACTION.CLIENT_TTS_BROADCAST, name: 'TTS 语音播报' }],
  [/录像/, { type: ACTION.CLIENT_RECORD_EVENT, name: '事件录像' }],
  [/抓图|截图|留档/, { type: ACTION.CLIENT_CAPTURE_IMAGE, name: '抓图留档' }],
  [/MQTT|消防主机|物联网平台/, { type: ACTION.SYS_MQTT_PUBLISH, name: 'MQTT 发布' }],
  [/道闸|继电器|断电|闸机/, { type: ACTION.SYS_RELAY_SWITCH, name: '继电器开关' }],
  [/预案|处置流程/, { type: ACTION.CLIENT_EXECUTE_PLAN, name: '执行预案' }],
]
/** 时间段关键词 */
const TIME_LEXICON: Array<[RegExp, { hint: string; start: string; end: string; weekdays?: number[] }]> = [
  [/夜间|晚上|夜里/, { hint: '夜间 22:00-06:00', start: '22:00', end: '06:00' }],
  [/白天|日间|工作时间|上班/, { hint: '日间 08:00-20:00 (工作日)', start: '08:00', end: '20:00', weekdays: [1, 2, 3, 4, 5] }],
]

function parseLocal(): NlgPreview {
  const t = text.value || ''
  const eventTypes: string[] = []
  for (const [re, keys] of EVENT_LEXICON) {
    if (re.test(t)) for (const k of keys) if (!eventTypes.includes(k)) eventTypes.push(k)
  }
  const actions: NlgAction[] = []
  for (const [re, act] of ACTION_LEXICON) {
    if (re.test(t) && !actions.some(a => a.type === act.type)) actions.push({ ...act })
  }
  const out: NlgPreview = { source: 'local', eventTypes, actions }
  // 停留/持续 N 秒/分钟 → 多事件合并确认窗口 (MergeCondition.window_ms)
  const dur = t.match(/(?:停留|持续|超过)\s*(\d+)\s*(秒|分钟)/)
  if (dur) out.mergeWindowMs = Number(dur[1]) * (dur[2] === '分钟' ? 60000 : 1000)
  // 时间段
  for (const [re, tm] of TIME_LEXICON) {
    if (re.test(t)) { out.timeHint = tm.hint; (out as any)._time = tm; break }
  }
  // "立即/紧急" → 提高置信度门槛缺失语义, 反向: 立即 = 不等合并
  if (/立即|马上/.test(t)) out.mergeWindowMs = undefined
  preview.value = out
  return out
}

async function parseWithAi() {
  if (!text.value.trim()) { ElMessage.warning('请先输入场景描述'); return }
  aiLoading.value = true
  try {
    // 设备端 AI 服务 (/ai/chat): 提示词内嵌枚举, 要求仅输出 JSON; 3s 超时降级本地
    const prompt = [
      '你是视频安防平台的规则配置助手。把用户描述解析为 JSON, 仅输出 JSON 不要多余文本。',
      '事件类型可选: perimeter.intrusion/perimeter.climbing/loitering/gathering/fire/smoke/abandoned/traffic.parking_violation/traffic.wrong_direction/face_stranger/behavior.fighting/smoking/behavior.fall',
      '动作可选(数字编码): 630声光报警/504工单回调/300APP推送/216短信/200Web弹窗/100实时视频/110电视墙/105TTS播报/112事件录像/114抓图/500MQTT/503继电器/109预案',
      '输出格式: {"event_types":[],"actions":[{"type":0,"name":""}],"merge_window_ms":0,"time_start":"","time_end":""}',
      `用户描述: ${text.value}`,
    ].join('\n')
    const res = await Promise.race([
      aiApi.chat({ message: prompt } as any),
      new Promise((_, rej) => setTimeout(() => rej(new Error('ai_timeout_3s')), 3000)),
    ])
    const raw = String((res as any)?.data?.content ?? (res as any)?.data?.reply ?? (res as any)?.data ?? '')
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no_json_in_reply')
    const j = JSON.parse(m[0])
    preview.value = {
      source: 'ai',
      eventTypes: Array.isArray(j.event_types) ? j.event_types.filter((x: unknown) => typeof x === 'string') : [],
      actions: Array.isArray(j.actions) ? j.actions.filter((a: any) => a && typeof a.type === 'number') : [],
      mergeWindowMs: Number(j.merge_window_ms) > 0 ? Number(j.merge_window_ms) : undefined,
      timeHint: j.time_start && j.time_end ? `${j.time_start}-${j.time_end}` : undefined,
      minConfidence: undefined,
    }
  } catch {
    ElMessage.info('AI 服务不可用, 已用本地解析')
    parseLocal()
  } finally {
    aiLoading.value = false
  }
}

function apply() {
  if (!preview.value) return
  const p = preview.value
  const tm = (p as any)._time
  emit('apply', {
    eventTypes: p.eventTypes,
    actions: p.actions,
    mergeWindowMs: p.mergeWindowMs,
    timeStart: tm?.start,
    timeEnd: tm?.end,
    weekdays: tm?.weekdays,
    minConfidence: p.minConfidence,
  })
  ElMessage.success('已应用到规则草稿')
}
</script>

<style scoped>
.nlg-input-row { display: flex; gap: 10px; align-items: stretch; }
.nlg-btns { display: flex; flex-direction: column; justify-content: space-between; }
.nlg-examples { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.nlg-example { cursor: pointer; }
.nlg-preview { border: 1px dashed var(--el-border-color); border-radius: 6px; padding: 4px 12px 12px; }
.nlg-prev-sec { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
.nlg-prev-label { font-size: 12px; color: var(--el-text-color-secondary); width: 110px; flex-shrink: 0; }
.nlg-miss { font-size: 12px; color: var(--el-text-color-placeholder); }
.nlg-apply-row { margin-top: 12px; }
</style>
