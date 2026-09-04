/**
 * [SIMPLE-EDIT 2026-09-03] 规则高频字段简易编辑 composable
 *
 * 五个场景 RulesView / 平台 LinkageRuleView 行内编辑 / AlgoConfigView 规则抽屉
 * 的「编辑」入口统一走 SimpleRuleDrawer, 替代各自维护的复杂编辑表单
 * (RuleEditDrawer / 平台大表单 / 算法页字段子集) — 对齐海康 iVMS
 * 一键编辑 / 大华 DSS 简易编辑语义。
 * [UX-ALIGN 2026-09-03] 编辑与新建统一 choice 入口: editRuleId 非空即编辑上下文
 * 标志 (SimpleRuleDrawer.isEdit 据此分流卡片行为); editingRule 暴露给父视图
 * 处理编辑态「高级模式」卡片 (覆盖式转全功能编辑 / 跳平台 /linkage)。
 *
 * PATCH 语义: 后端 PUT /linkage/rules/{id} 为字段级 merge — payload 以原
 * source_cond 浅拷贝起底, 仅覆盖 name/事件类型/通道/设备/时段 高频字段,
 * actions/VLM/互斥/抑制等治理配置原样保留。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { linkageApi, getTargetForActionType, type LinkageRule } from '@/api/linkage'
import type { SimpleCommitEvent, SimpleCommitPatch, TuneForm } from '@/components/linkage/SimpleRuleDrawer.vue'

/** 猜时间预设 (与 SimpleRuleDrawer.guessPreset 同规则: 全天/标准白天/标准夜间, 其余 custom) */
function guessPreset(s: string, e: string, wd: number[]): TuneForm['timePreset'] {
  if (!s && !e) return 'all'
  if (s === '08:00' && e === '20:00' && wd.length === 5 && wd.join() === '1,2,3,4,5') return 'day'
  if (s === '20:00' && e === '07:00' && wd.length === 7) return 'night'
  return 'custom'
}

/**
 * LinkageRule → TuneForm 高频字段抽取。
 * 事件类型双源读取 (algorithm_ids 优先 → event_types), 与 LinkageRuleView
 * resetEditorState / SimpleRuleDrawer.onPickTemplate 的既有口径一致。
 */
export function buildTuneForm(rule: LinkageRule): TuneForm {
  const src = (rule.source_cond || {}) as any
  const tc = (rule.time_cond || {}) as any
  const timeStart: string = tc.time_start || '08:00'
  const timeEnd: string = tc.time_end || '20:00'
  const weekdays: number[] = tc.weekdays?.length ? [...tc.weekdays] : [1, 2, 3, 4, 5]
  return {
    name: rule.name || '',
    eventTypes: [...(src.algorithm_ids?.length ? src.algorithm_ids : (src.event_types || []))],
    channelIds: [...(src.channel_ids || [])].map(Number).filter((n) => !Number.isNaN(n)),
    deviceIds: [...(src.device_ids || [])],
    // 预设判定用原始时段 (双空=全天); 显示值兜底默认时段, 选「全天」保存时整体清空
    timePreset: guessPreset(tc.time_start || '', tc.time_end || '', weekdays),
    timeStart, timeEnd, weekdays,
    // [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭秒 (新建/编辑都可见, 0=永不自动 关闭, >0=N 秒后关闭)
    popupAutoCloseS: Number(rule.popup_auto_close_s ?? 0),
    // [FLOOR-MAP 2026-09-04] 地图联动: 动作含 CLIENT_SHOW_MAP(107)=开, map_ids 预选
    mapLinked: (rule.actions || []).some((a: any) => Number(a?.type) === 107),
    mapIds: [...((src.map_ids as number[]) || [])],
  }
}

/**
 * 高频字段 PATCH payload 构造 (后端字段级 merge 安全):
 * - source_cond 以原值浅拷贝起底 (min_severity/min_confidence 等保留), 仅覆盖
 *   事件类型/通道/设备; 事件类型双轨写入与 LinkageRuleView.handleSave 同语义:
 *   event_types = 裸 key (id 末段), algorithm_ids = 完整形态。
 * - time_cond: all → 清空 (全天候); 其余 → 实际值, monthdays 原样保留。
 */
export function buildRuleUpdatePatch(rule: LinkageRule, p: SimpleCommitPatch): Partial<LinkageRule> {
  const src: any = { ...((rule.source_cond || {}) as any) }
  src.event_types = p.eventTypes.map((id) => id.split('.').pop() || id)
  src.algorithm_ids = [...p.eventTypes]
  src.channel_ids = [...p.channelIds]
  src.device_ids = [...p.deviceIds]
  const monthdays: number[] = ((rule.time_cond || {}) as any).monthdays ?? []
  const time_cond = p.timePreset === 'all'
    ? { time_start: '', time_end: '', weekdays: [] as number[], monthdays: [] as number[] }
    : {
        time_start: p.timeStart || '08:00',
        time_end: p.timeEnd || '20:00',
        weekdays: p.weekdays?.length ? [...p.weekdays] : [1, 2, 3, 4, 5],
        monthdays,
      }
  // [POPUP-AUTOCLOSE 2026-09-03] 透传 popup_auto_close_s (0=不启用, >0=N 秒后自动关闭)
  //   后端 PUT 字段级 merge, 包含此字段才会更新 (contains 守卫)
  const out: Partial<LinkageRule> = { name: p.name.trim(), source_cond: src, time_cond }
  if (typeof p.popup_auto_close_s === 'number' && Number.isFinite(p.popup_auto_close_s)) {
    out.popup_auto_close_s = Math.max(0, Math.floor(p.popup_auto_close_s))
  }
  // [FLOOR-MAP 2026-09-04] 地图联动写回: map_ids 走 source_cond; CLIENT_SHOW_MAP(107)
  //   动作以原 actions 拷贝增删 (后端 PUT actions 为全量替换, 严禁裸传增删后子集);
  //   仅在 map_linked 字段显式传入时才动 actions (未传=保持原样 PATCH 语义)
  if (typeof p.map_linked === 'boolean') {
    src.map_ids = [...(p.map_ids || [])]
    const prev: any[] = ((rule.actions || []) as any[]).filter(
      (a) => Number(a?.type) !== 107,
    )
    if (p.map_linked) {
      prev.push({
        type: 107,
        target: getTargetForActionType('CLIENT_SHOW_MAP'),
        name: '联动地图位置',
        enabled: true,
      } as any)
    }
    out.actions = prev as any
  }
  return out
}

export interface UseSimpleRuleEditOptions {
  /** 保存成功回调 (父视图刷新列表/计数) */
  onSaved?: () => void | Promise<void>
}

export function useSimpleRuleEdit(opts: UseSimpleRuleEditOptions = {}) {
  const editVisible = ref(false)
  const editSaving = ref(false)
  const editRuleId = ref('')
  const editTune = ref<TuneForm | undefined>(undefined)
  // 原规则缓存 (PATCH 起底 + 保留字段来源; 编辑态 switch-advanced 转全功能编辑也用它),
  // 打开编辑时刷新; 暴露为 ref 供父视图读取 (LinkageRuleView 覆盖式 openEditor 等)
  const editingRule = ref<LinkageRule | null>(null)

  /** 行内「编辑」→ 简易抽屉 ([UX-ALIGN] 与新建同 choice 入口, 仅预填 tune 高频字段) */
  function openSimpleEdit(rule: LinkageRule) {
    editingRule.value = rule
    editRuleId.value = rule.id
    editTune.value = buildTuneForm(rule)
    editVisible.value = true
  }

  /** 退回新建形态 (与新建共享同一 SimpleRuleDrawer 挂载时, 新建入口需先清除编辑态) */
  function clearSimpleEdit() {
    editingRule.value = null
    editRuleId.value = ''
    editTune.value = undefined
  }

  /** SimpleRuleDrawer @commit 统一入口; 仅处理 mode='update' (必填校验已在组件内做) */
  async function commitSimpleEdit(e: SimpleCommitEvent): Promise<boolean> {
    if (e.mode !== 'update' || !e.ruleId) return false
    const raw = editingRule.value
    if (!raw || raw.id !== e.ruleId) {
      ElMessage.error('编辑状态失效, 请关闭后重新打开编辑抽屉')
      return false
    }
    editSaving.value = true
    try {
      const patch = buildRuleUpdatePatch(raw, e.payload)
      const resp = await linkageApi.updateRule(e.ruleId, patch)
      if (resp?.status >= 400 || (resp?.data && resp.data.code && resp.data.code !== 0 && resp.data.code !== 200)) {
        throw new Error(resp?.data?.message || `HTTP ${resp?.status}`)
      }
      ElMessage.success('规则已保存')
      editVisible.value = false
      await opts.onSaved?.()
      return true
    } catch (err: any) {
      ElMessage.error(`保存失败: ${err?.message ?? err}`)
      return false
    } finally {
      editSaving.value = false
    }
  }

  return { editVisible, editSaving, editRuleId, editTune, editingRule, openSimpleEdit, clearSimpleEdit, commitSimpleEdit }
}
