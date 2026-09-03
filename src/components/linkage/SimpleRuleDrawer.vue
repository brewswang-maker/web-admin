<template>
  <!-- ═══ [vp8 双模式 2026-09-01] 简易创建抽屉: choice → template/tune 状态机 ═══
       [FINAL 2026-09-02] 按用户最终确认: choice 页三张并列卡片 (同一样式),
       「简易模式」与「高级模式」卡片均直开 vp8 之前的全功能表单抽屉 (switch-advanced),
       不再经过 custom 高频字段子表单中转。
       [UX-ALIGN 2026-09-03] 编辑与新建统一入口: 编辑态也从 choice 进 (顶部规则名提示条),
       「简易模式」卡片进 tune 预填编辑 /「高级模式」卡片携草稿转全功能 / 模板卡片禁用。
       [TPL-VP6 2026-09-03] 模板卡片: TemplateGallery 选中即携模板整包 switch-advanced,
       落地平台 vp6 全功能表单 (动作编排/互斥组/抑制链/VLM 复核/元数据齐备), 不再进
       tune 简化表单; tune 视图仅保留给编辑态高频微调 (无全功能宿主时的就地编辑)。
       事件类型选项由本实例 fetchOptions() 填充 (useLinkageOptions 非单例, 否则下拉恒空)。 -->
  <!-- append-to-body: [SCENE-EDIT-INPLACE] 嵌入模式下 LinkageRuleView 外壳 v-show 隐藏,
       本抽屉须 teleport 到 body 才可见 (平台正常模式行为不变) -->
  <el-drawer
    :model-value="modelValue"
    :title="drawerTitle"
    size="520px"
    direction="rtl"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="srd-body">
      <!-- ── 视图 1: 入口选择 (三卡片并列) [UX-ALIGN 2026-09-03] 新建/编辑统一入口 ── -->
      <template v-if="view === 'choice'">
        <!-- 编辑态预选提示: 用户清楚当前编辑对象 + 推荐路径 (规则名取 initialTune.name, 单一数据源) -->
        <el-alert v-if="isEdit" type="info" :closable="false" style="margin-bottom: 12px">
          <template #title>
            正在编辑规则「{{ initialTune?.name ?? '' }}」: 推荐选择「简易模式」快速修改高频字段 (名称 / 事件类型 / 设备通道 / 生效时段 / 弹窗自动关闭), 或选择「高级模式」调整完整治理配置
          </template>
        </el-alert>
        <div class="srd-hero">
          <div class="srd-card" :class="{ 'srd-card--disabled': isEdit }" @click="onTemplateCardClick">
            <el-icon class="srd-card-icon"><CopyDocument /></el-icon>
            <div class="srd-card-main">
              <div class="srd-card-title">从模板库选择 <el-tag v-if="!isEdit" size="small" type="success" effect="dark">推荐</el-tag></div>
              <div class="srd-card-desc">{{ isEdit ? '编辑态不支持更换模板, 请先删除规则后从模板重新创建' : '行业 / 场景 / 事件分类模板, 选一条微调即可生效, 约 30 秒' }}</div>
            </div>
            <el-icon class="srd-card-arrow"><ArrowRight /></el-icon>
          </div>
          <div class="srd-card" @click="onSimpleCardClick">
            <el-icon class="srd-card-icon"><EditPen /></el-icon>
            <div class="srd-card-main">
              <div class="srd-card-title">简易模式 <el-tag v-if="isEdit" size="small" type="success" effect="dark">推荐</el-tag></div>
              <div class="srd-card-desc">{{ isEdit ? (editSimpleAdvanced ? '与新建简易模式同一表单: 名称 / 事件 / 时间 / 通道 / 弹窗自动关闭' : '快速修改: 名称 / 事件类型 / 设备通道 / 生效时段 / 弹窗自动关闭, 动作编排保持不变') : '单页快速填写: 名称 / 事件 / 时间 / 通道 / 弹窗自动关闭 (vp6 经典表单)' }}</div>
            </div>
            <el-icon class="srd-card-arrow"><ArrowRight /></el-icon>
          </div>
          <div class="srd-card" @click="onAdvancedCardClick">
            <el-icon class="srd-card-icon"><Setting /></el-icon>
            <div class="srd-card-main">
              <div class="srd-card-title">高级模式</div>
              <div class="srd-card-desc">全功能一页览: 互斥组 / 抑制链 / VLM 复核 / 条件树等治理能力</div>
            </div>
            <el-icon class="srd-card-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
      </template>

      <!-- ── 视图 2: 模板选择 [TPL-VP6 2026-09-03] 选中即携整包切 vp6 全功能表单 ── -->
      <template v-else-if="view === 'template'">
        <TemplateGallery :selected-tags="[]" @apply-template="onPickTemplate" />
      </template>

      <!-- ── 视图 3: 高频微调表单 [TPL-VP6 2026-09-03] 仅编辑态可达 (模板创建已直落 vp6 全功能表单) /
           [SIMPLE-EDIT 2026-09-03] 编辑模式复用同表单 (picked 条件保留防御) ── -->
      <template v-else-if="view === 'tune' && (picked || isEdit)">
        <el-alert v-if="isEdit" type="info" :closable="false" style="margin-bottom: 12px">
          <template #title>
            编辑「{{ tune.name }}」: 仅更新 名称 / 事件类型 / 设备通道 / 生效时段 / 弹窗自动关闭, 动作编排与高级治理配置保持不变
          </template>
        </el-alert>
        <el-alert v-else type="success" :closable="false" style="margin-bottom: 12px">
          <template #title>
            模板「{{ picked?.name ?? '' }}」: {{ picked?.actions?.length || 0 }} 个动作已带入{{ actionSummary }}
          </template>
        </el-alert>
        <el-form label-position="top" size="default">
          <el-form-item label="规则名称" required>
            <el-input v-model="tune.name" placeholder="例: 大门周界入侵-夜间联动" />
          </el-form-item>
          <el-form-item label="触发事件类型" required>
            <el-select v-model="tune.eventTypes" multiple filterable placeholder="选择触发事件" style="width: 100%">
              <el-option v-for="o in eventTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="设备与通道">
            <DeviceChannelPicker v-model="tuneScope" />
          </el-form-item>
          <el-form-item label="启用时间">
            <div class="srd-time">
              <el-radio-group v-model="tune.timePreset" size="small">
                <el-radio-button value="all">全天</el-radio-button>
                <el-radio-button value="day">白天</el-radio-button>
                <el-radio-button value="night">夜间</el-radio-button>
                <el-radio-button value="custom">自定义</el-radio-button>
              </el-radio-group>
              <div v-if="tune.timePreset !== 'all'" class="srd-time-detail">
                <template v-if="tune.timePreset === 'custom'">
                  <el-time-picker v-model="tune.timeStart" format="HH:mm" placeholder="开始" style="width: 110px" />
                  <span class="srd-time-sep">~</span>
                  <el-time-picker v-model="tune.timeEnd" format="HH:mm" placeholder="结束" style="width: 110px" />
                </template>
                <span v-else class="srd-time-hint">{{ timePresetHint(tune.timePreset) }}</span>
                <el-checkbox-group v-if="tune.timePreset === 'custom'" v-model="tune.weekdays">
                  <el-checkbox v-for="(d, i) in WEEK_LABELS" :key="d" :value="i + 1">{{ d }}</el-checkbox>
                </el-checkbox-group>
              </div>
            </div>
          </el-form-item>
          <!-- [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭 (新建/编辑都可见):
               0 = 永不自动关闭 (默认, 对齐海康 iVMS / 大华 DSS 报警弹窗常驻语义);
               >0 = 打开 N 秒后自动关闭。仅作用于 WS 命中本规则的弹窗,
               详情入口弹窗不受此控制 (始终不自动关闭)。 -->
          <el-form-item label="弹窗自动关闭">
            <el-input-number
              v-model="tune.popupAutoCloseS"
              :min="0" :max="3600" :step="5"
              placeholder="0 = 永不自动关闭"
              style="width: 180px"
            />
            <span class="srd-popup-close-hint">秒 · 0=永不自动关闭 (推荐), &gt;0=N 秒后自动关闭</span>
          </el-form-item>
        </el-form>
      </template>

    </div>

    <template #footer>
      <div class="srd-footer">
        <template v-if="view === 'template'">
          <el-button @click="view = 'choice'">返回</el-button>
          <div style="flex: 1" />
          <el-button link type="primary" @click="emitSwitchAdvanced(null, 'full')">切换到高级模式 →</el-button>
        </template>
        <template v-else-if="view === 'tune'">
          <el-button v-if="isEdit" @click="view = 'choice'">返回</el-button>
          <el-button v-else @click="view = 'template'">重选模板</el-button>
          <div style="flex: 1" />
          <el-button type="primary" :loading="committing" @click="saveTune">
            {{ isEdit ? '保存修改' : '保存并生效' }}
          </el-button>
        </template>
        <template v-else>
          <div style="flex: 1" />
          <el-button @click="emit('update:modelValue', false)">关闭</el-button>
        </template>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
// [vp8 双模式 2026-09-01] 简易创建抽屉。数据层零变更: 全部字段经 commit 事件交由
// 父视图 (LinkageRuleView) 写入同一 LinkageRuleInfo payload, 保存链/校验唯一复用。
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight, CopyDocument, EditPen, Setting } from '@element-plus/icons-vue'
import type { RuleTemplate } from '@/api/linkage'
import { useLinkageOptions } from '@/composables/useLinkageOptions'
import TemplateGallery from './TemplateGallery.vue'
import DeviceChannelPicker from './DeviceChannelPicker.vue'

export interface SimpleCommitPatch {
  name: string
  eventTypes: string[]
  channelIds: number[]
  deviceIds: string[]
  timePreset: 'all' | 'day' | 'night' | 'custom'
  timeStart: string
  timeEnd: string
  weekdays: number[]
  /** [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭秒: 0=永不自动关闭 (默认), >0=N 秒后自动关闭 */
  popup_auto_close_s?: number
  /** 可选: 动作 key 列表 (切高级携带草稿时用); 模板分支不传 (动作由模板带入) */
  actions?: string[]
  priority?: number
  cooldownMs?: number
  /** 模板分支: 整包模板 (父视图走 applyTemplateToForm 保动作参数) */
  template?: RuleTemplate | null
}

/** [SIMPLE-EDIT 2026-09-03] @commit 统一事件形态: mode=update 时 ruleId 必带,
    父视图分别走 linkageApi.createRule / linkageApi.updateRule */
export interface SimpleCommitEvent {
  mode: 'create' | 'update'
  payload: SimpleCommitPatch
  ruleId?: string
}

const props = defineProps<{
  modelValue: boolean
  committing?: boolean
  /** [SIMPLE-EDIT 2026-09-03] 编辑模式: 预填高频字段, [UX-ALIGN] 与新建同 choice 入口 */
  initialTune?: TuneForm
  editingRuleId?: string
  /** [UX-ALIGN] 编辑态「简易模式」卡片分流: true=switch-advanced 携草稿交父视图,
   *  复用新建简易模式同一表单回显编辑 (平台页 vp6 全功能抽屉); 缺省=组件内进 tune
   *  就地编辑 (无全功能表单宿主的场景页/算法页, tune 是其唯一就地编辑表单) */
  editSimpleAdvanced?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  /** [SIMPLE-EDIT 2026-09-03] 统一事件形态: mode=update 时 ruleId 必带, 父视图走 updateRule */
  (e: 'commit', p: SimpleCommitEvent): void
  (e: 'switch-advanced', p: SimpleCommitPatch | null, mode?: 'simple' | 'full'): void
}>()

const { eventTypeOptions, fetchOptions } = useLinkageOptions()

// ── 视图状态机 ──
type View = 'choice' | 'template' | 'tune'
const view = ref<View>('choice')
const picked = ref<RuleTemplate | null>(null)
const committing = computed(() => !!props.committing)

/** 编辑模式: editingRuleId + initialTune 同时给定时生效 (与新建共享同一挂载实例) */
const isEdit = computed(() => !!props.editingRuleId && !!props.initialTune)

const drawerTitle = computed(() => {
  // [UX-ALIGN 2026-09-03] 编辑态统一标题 (与「新建联动规则」对称), 规则名在 choice 提示条展示
  if (isEdit.value) return '编辑联动规则'
  const t: Record<View, string> = {
    choice: '新建联动规则',
    template: '从模板创建 · 选择模板',
    tune: '编辑联动规则 · 快速微调', // [TPL-VP6] tune 仅编辑态可达 (模板创建直落 vp6 全功能表单)
  }
  return t[view.value]
})

// 打开时重置状态机; 并拉取选项 (useLinkageOptions 非单例, 本组件实例的 eventTypeOptions
// 需自行 fetchOptions 填充, 模块级 Promise 缓存下复用拉取, 保证触发事件下拉有数据)
// [UX-ALIGN 2026-09-03] 编辑与新建统一从 choice 入口进: 编辑态仅预填 tune (点「简易模式」
// 卡片时即带出当前值), 不再直进 tune — 入口体验与新建完全一致, 仅初始态不同
watch(() => props.modelValue, (v) => {
  if (!v) return
  picked.value = null
  if (isEdit.value && props.initialTune) {
    Object.assign(tune, {
      name: props.initialTune.name,
      eventTypes: [...props.initialTune.eventTypes],
      channelIds: [...props.initialTune.channelIds],
      deviceIds: [...props.initialTune.deviceIds],
      timePreset: props.initialTune.timePreset,
      timeStart: props.initialTune.timeStart,
      timeEnd: props.initialTune.timeEnd,
      weekdays: [...props.initialTune.weekdays],
      // [POPUP-AUTOCLOSE 2026-09-03] 编辑态预填弹窗自动关闭秒
      popupAutoCloseS: props.initialTune.popupAutoCloseS ?? 0,
    })
  } else {
    resetTune()
  }
  view.value = 'choice'
  fetchOptions()
})

// ── 时间四档 (真机 91% 使用率但均为简单时段; night 跨夜与高级表单同语义) ──
// [SIMPLE-EDIT 2026-09-03] export: 父视图/composable 构造编辑预填 (buildTuneForm) 需要
// [POPUP-AUTOCLOSE 2026-09-03] popupAutoCloseS: 弹窗自动关闭秒, 0=永不自动关闭 (默认), >0=N 秒后自动关闭
export interface TuneForm {
  name: string; eventTypes: string[]; channelIds: number[]; deviceIds: string[]
  timePreset: 'all' | 'day' | 'night' | 'custom'; timeStart: string; timeEnd: string; weekdays: number[]
  popupAutoCloseS: number
}
const tune = reactive<TuneForm>({ name: '', eventTypes: [], channelIds: [], deviceIds: [], timePreset: 'all', timeStart: '08:00', timeEnd: '20:00', weekdays: [1, 2, 3, 4, 5], popupAutoCloseS: 0 })

function resetTune() { Object.assign(tune, { name: '', eventTypes: [], channelIds: [], deviceIds: [], timePreset: 'all', timeStart: '08:00', timeEnd: '20:00', weekdays: [1, 2, 3, 4, 5], popupAutoCloseS: 0 }) }

/** DeviceChannelPicker v-model 代理 (reactive 字段 → 对象) */
const tuneScope = computed({
  get: () => ({ deviceIds: tune.deviceIds, channelIds: tune.channelIds }),
  set: (v: { deviceIds: string[]; channelIds: number[] }) => { tune.deviceIds = v.deviceIds; tune.channelIds = v.channelIds },
})

/** 模板动作类型 → 中文名 (摘要展示用, 覆盖常用, 兜底显示编号) */
const ACTION_LABELS: Record<number, string> = {
  100: '客户端弹直播', 105: 'TTS 播报', 109: '执行预案', 112: '事件录像', 114: '客户端抓图',
  115: '声光报警输出', 116: '云台控制', 200: 'Web 弹窗', 201: '邮件', 212: 'Web 弹图',
  215: 'Web 抓图', 300: 'APP 推送', 304: 'APP 处置', 503: '继电器开关', 504: 'HTTP 工单回调',
}

/** 模板动作摘要 (tune 提示条) */
const actionSummary = computed(() => {
  const list = (picked.value?.actions || []).slice(0, 4).map((a: any) => ACTION_LABELS[a.type] || `动作${a.type}`)
  const more = (picked.value?.actions?.length || 0) - list.length
  return list.length ? ` (${list.join('/')}${more > 0 ? ` 等 ${more + list.length} 项` : ''})` : ''
})

// ── [TPL-VP6 2026-09-03] 模板选择 → 直落平台 vp6 全功能表单 ──
// 原 view='tune' 就地 5 字段微调过于简陋 (缺动作编排/互斥组/抑制链/VLM 复核/优先级/
// 冷却/描述/标签), 无法支撑模板意图一键落地为完整可执行规则。改为携模板整包
// switch-advanced: 宿主 (LinkageRuleView) applyTemplateToForm (动作勾选+参数/元数据/
// 时间/事件/通道整包) + applySimplePatch (高频字段) 预填后打开 vp6 全功能抽屉, 用户在
// 完整表单检查/编排后手动保存 — 编辑器单一来源, 与平台行内编辑同链路同表单。
function onPickTemplate(t: RuleTemplate) {
  const src: any = (t as any).source_cond || {}
  const tc: any = (t as any).time_cond || {}
  const timeStart: string = tc.time_start || '08:00'
  const timeEnd: string = tc.time_end || '20:00'
  const weekdays: number[] = tc.weekdays?.length ? [...tc.weekdays] : [1, 2, 3, 4, 5]
  // [TPL-VP6] 预设档以模板原始 time_cond 判定 (无 time_start = 'all' 全天):
  // 原实现先兑底 '08:00' 再 guessPreset 会把无时间模板误判成「白天」档, 语义失真
  const timePreset = guessPreset(tc.time_start || '', tc.time_end || '', weekdays)
  emitSwitchAdvanced({
    name: t.name || '',
    eventTypes: [...(src.algorithm_ids?.length ? src.algorithm_ids : (src.event_types || []))],
    channelIds: [...(src.channel_ids || [])].map(Number).filter(n => !Number.isNaN(n)),
    deviceIds: [...(src.device_ids || [])],
    timePreset, timeStart, timeEnd, weekdays,
    // 模板不带弹窗自动关闭字段: 落地表单默认 0 (永不自动关闭), 与编辑态同字段同语义可在 vp6 表单调整
    popup_auto_close_s: 0,
    template: t,
  }, 'full')
}

function guessPreset(s: string, e: string, wd: number[]): 'all' | 'day' | 'night' | 'custom' {
  if (!s && !e) return 'all'
  if (s === '08:00' && e === '20:00' && wd.length === 5 && wd.join() === '1,2,3,4,5') return 'day'
  if (s === '20:00' && e === '07:00' && wd.length === 7) return 'night'
  return 'custom'
}

function validateCommon(f: TuneForm): boolean {
  if (!f.name.trim()) { ElMessage.warning('请输入规则名称'); return false }
  if (f.eventTypes.length === 0) { ElMessage.warning('请至少选择一个触发事件类型'); return false }
  return true
}

/** tune 当前值 → 高频字段 patch (tune 保存 / 编辑态切高级携带草稿 复用) */
function tunePatch(): SimpleCommitPatch {
  return {
    name: tune.name.trim(), eventTypes: [...tune.eventTypes], channelIds: [...tune.channelIds], deviceIds: [...tune.deviceIds],
    timePreset: tune.timePreset, timeStart: tune.timeStart, timeEnd: tune.timeEnd, weekdays: [...tune.weekdays],
    // [POPUP-AUTOCLOSE 2026-09-03] 透传弹窗自动关闭秒 (整数化兜底)
    popup_auto_close_s: Math.max(0, Math.floor(Number(tune.popupAutoCloseS) || 0)),
  }
}

/** [SIMPLE-EDIT 2026-09-03] tune 保存: 编辑分支=update (仅高频字段, ruleId 随行)
 *  [TPL-VP6 2026-09-03] 模板 create 分支保留防御: onPickTemplate 已改携整包切 vp6 全功能
 *  表单, 新建态 tune 不可达; 若未来恢复就地创建入口, 此分支仍走 commitSimple 模板链 */
function saveTune() {
  if (!validateCommon(tune)) return
  const payload = tunePatch()
  if (isEdit.value) {
    emit('commit', { mode: 'update', payload, ruleId: props.editingRuleId })
  } else {
    emit('commit', { mode: 'create', payload: { ...payload, template: picked.value } })
  }
}

/** 切换表单: mode='simple' vp6 纯净单页 (简易卡片) / 'full' 全功能全览 (高级卡片/模板页) */
function emitSwitchAdvanced(p: SimpleCommitPatch | null, mode?: 'simple' | 'full') {
  emit('switch-advanced', p, mode)
}

/** ── [UX-ALIGN 2026-09-03] choice 卡片路由: 编辑/新建同一入口, 行为按态分流 ── */

/** 模板卡片: 编辑态禁用 (换模板=重建语义, desc 已说明), 新建态进模板选择 */
function onTemplateCardClick() {
  if (isEdit.value) return
  view.value = 'template'
}

/** 简易卡片: 新建态沿用 [FINAL 2026-09-02] 直开全功能表单 simple 形态; 编辑态默认进
 *  tune 就地编辑; 平台页 (editSimpleAdvanced) 同新建走 switch-advanced 携草稿,
 *  复用同一 vp6 表单回显编辑 — 新建/编辑同一卡片同一表单 */
function onSimpleCardClick() {
  if (isEdit.value && !props.editSimpleAdvanced) { view.value = 'tune'; return }
  emitSwitchAdvanced(isEdit.value ? tunePatch() : null, 'simple')
}

/** 高级卡片: 编辑态携带当前高频字段草稿交父视图 (覆盖式开全功能编辑 / 跳平台 /linkage); 新建态直开全功能新建 */
function onAdvancedCardClick() {
  if (isEdit.value) { emitSwitchAdvanced(tunePatch(), 'full'); return }
  emitSwitchAdvanced(null, 'full')
}

// ── 时间四档展示辅助 ──
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']
function timePresetHint(p: 'day' | 'night'): string {
  return p === 'day' ? '工作日 08:00 ~ 20:00' : '每日 20:00 ~ 次日 07:00'
}
</script>

<style scoped>
.srd-body { padding: 0 2px; }
.srd-hero { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.srd-card { display: flex; align-items: center; gap: 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 18px 16px; cursor: pointer; transition: box-shadow .15s, border-color .15s; }
.srd-card:hover { border-color: var(--el-color-primary); box-shadow: var(--el-box-shadow-light); }
/* [UX-ALIGN 2026-09-03] 编辑态禁用卡片 (模板库): 视觉弱化 + 悬停失效 */
.srd-card--disabled { cursor: not-allowed; opacity: .55; }
.srd-card--disabled:hover { border-color: var(--el-border-color-lighter); box-shadow: none; }
.srd-card--disabled .srd-card-icon { color: var(--el-text-color-placeholder); }
.srd-card-icon { font-size: 28px; color: var(--el-color-primary); }
.srd-card-main { flex: 1; min-width: 0; }
.srd-card-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.srd-card-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.srd-card-arrow { color: var(--el-text-color-placeholder); }
.srd-footer { display: flex; align-items: center; gap: 8px; }
.srd-time { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.srd-time-detail { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.srd-time-sep { color: var(--el-text-color-secondary); }
.srd-time-hint { font-size: 12px; color: var(--el-text-color-secondary); }
/* [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭输入提示 */
.srd-popup-close-hint { margin-left: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
/* 平板 1024px 适配 */
</style>
