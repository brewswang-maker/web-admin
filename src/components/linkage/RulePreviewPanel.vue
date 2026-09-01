<template>
  <div class="rpp-root">
    <!-- ═══ 触发条件可视化 (华为 iClient 条件树 / DeepStream 条件流感) ═══ -->
    <div class="rpp-block">
      <div class="rpp-block-title">触发条件可视化</div>
      <!-- 高级模式: 表达式树递归渲染 -->
      <div v-if="conditionTree" class="rpp-tree">
        <TreeNode :node="conditionTree" :depth="0" />
      </div>
      <!-- 普通模式: 条件摘要卡 -->
      <div v-else class="rpp-cond-grid">
        <div v-for="c in conditionSummary" :key="c.label" class="rpp-cond" :class="{ 'is-off': !c.enabled }">
          <span class="rpp-cond-name">{{ c.label }}</span>
          <span class="rpp-cond-desc">{{ c.desc }}</span>
          <el-tag :type="c.enabled ? 'success' : 'info'" size="small" effect="plain">{{ c.enabled ? '启用' : '未启用' }}</el-tag>
        </div>
      </div>
    </div>

    <!-- ═══ 动作执行时间线 (0-60s 水平轴, 按 delay_ms 定位) ═══ -->
    <div class="rpp-block">
      <div class="rpp-block-title">动作编排时间线</div>
      <div v-if="actions.length > 0" class="rpp-timeline">
        <div class="rpp-tl-axis">
          <span v-for="s in [0, 10, 20, 30, 40, 50, 60]" :key="s" class="rpp-tl-tick" :style="{ left: (s / 60) * 100 + '%' }">{{ s }}s</span>
        </div>
        <div v-for="(a, i) in actions" :key="a.type + i" class="rpp-tl-row">
          <span class="rpp-tl-name">{{ a.icon }} {{ a.label }}</span>
          <div class="rpp-tl-track">
            <div class="rpp-tl-dot" :class="{ 'is-now': a.delayMs === 0 }" :style="{ left: Math.min(100, (a.delayMs / 60000) * 100) + '%' }">
              <span class="rpp-tl-dot-label">{{ a.delayMs === 0 ? '立即' : (a.delayMs / 1000) + 's' }}</span>
            </div>
          </div>
        </div>
      </div>
      <el-empty v-else description="尚未选择联动动作" :image-size="44" />
    </div>

    <!-- ═══ 算力预估摘要 ═══ -->
    <div class="rpp-block">
      <div class="rpp-block-title">算力预估</div>
      <div class="rpp-est-row">
        <el-tag :type="computeEst.total > 80 ? 'danger' : computeEst.total > 50 ? 'warning' : 'success'" effect="dark">
          TPU ≈ {{ computeEst.total.toFixed(1) }}%
        </el-tag>
        <span class="rpp-est-hint">剩余容量可再挂 ≈{{ computeEst.headroom }} 路同类推理 (经验估算)</span>
      </div>
    </div>

    <!-- ═══ AI 实时校验: 5 类冲突检测 ═══ -->
    <div class="rpp-block">
      <div class="rpp-block-head">
        <span class="rpp-block-title">冲突检测 (5 类)</span>
        <el-button size="small" type="primary" plain :loading="conflictLoading" @click="runConflictCheck">立即检测</el-button>
      </div>
      <template v-if="conflicts.length > 0">
        <el-alert :type="hasWarningConflict ? 'warning' : 'info'" :closable="false" style="margin-bottom: 8px">
          检出 {{ conflicts.length }} 处既有规则间冲突 (重叠触发 / 动作冗余 / 通配遮蔽 / 冷却违反 / 时间窗冲突)
        </el-alert>
        <div v-for="(c, i) in conflicts" :key="i" class="rpp-conflict">
          <el-tag :type="c.severity === 'warning' ? 'danger' : 'info'" size="small">{{ CONFLICT_LABEL[c.type] || c.type }}</el-tag>
          <span class="rpp-conflict-msg">{{ c.message }}</span>
          <span class="rpp-conflict-fix">建议: {{ c.suggestion }}</span>
        </div>
      </template>
      <div v-else class="rpp-empty-hint">保存前建议执行一次检测, 识别与既有规则的 5 类冲突并给出处置建议</div>
    </div>

    <!-- ═══ Dry-Run 试运行 (NVIDIA VSS Blueprint 式验证) ═══ -->
    <div class="rpp-block">
      <div class="rpp-block-head">
        <span class="rpp-block-title">Dry-Run 试运行</span>
        <div class="rpp-dryrun-inputs">
          <el-select v-model="dryAlarmType" size="small" filterable allow-create placeholder="模拟事件类型" style="width: 200px">
            <el-option v-for="et in selectedEventTypes" :key="et" :label="et" :value="et" />
          </el-select>
          <el-input-number v-model="dryConfidence" :min="10" :max="100" size="small" style="width: 130px" />
          <el-button size="small" type="primary" :loading="dryLoading" @click="runDryRun">试运行</el-button>
        </div>
      </div>
      <template v-if="dryResult">
        <el-alert :type="localHit ? 'success' : 'info'" :closable="false" style="margin-bottom: 8px">
          {{ localHit ? '✓ 本规则将命中该模拟事件' : '本规则不命中该模拟事件 (检查事件类型/时间窗/通道范围)' }}
          ; 全库 {{ dryResult.rule_details.length }} 条已启用规则中 {{ dryResult.rule_details.filter(d => d.matched).length }} 条命中
        </el-alert>
        <div v-for="d in dryResult.rule_details.slice(0, 5)" :key="d.rule_id" class="rpp-dry-row">
          <el-tag :type="d.matched ? 'success' : 'info'" size="small">{{ d.matched ? '命中' : '未命中' }}</el-tag>
          <span class="rpp-dry-name">{{ d.rule_name }}</span>
          <span class="rpp-dry-reason">{{ d.match_reason }}</span>
        </div>
        <div v-if="dryResult.simulated_actions.length" class="rpp-dry-actions">
          将执行: <el-tag v-for="(a, i) in dryResult.simulated_actions.slice(0, 8)" :key="i" size="small" effect="plain" class="rpp-dry-action">{{ a }}</el-tag>
        </div>
      </template>
      <div v-else class="rpp-empty-hint">选择模拟事件类型后试运行, 预演触发链路 (不影响真实告警)</div>
    </div>

    <!-- ═══ 版本管理提示 (LinkageEngine v8.0 版本审计) ═══ -->
    <div class="rpp-block rpp-version">
      <el-icon><Clock /></el-icon>
      <span>保存后本规则自动登记版本审计 (LinkageEngine v8.0); 可在规则列表「历史」操作中查看与回滚任意历史版本</span>
    </div>
  </div>
</template>

<script setup lang="ts">
// [vp7 新建事件规则向导 2026-09-01] 确认步预览面板:
//   条件树可视化 (华为 iClient 条件树 + CASE 表达式节点) / 动作时间线 (DeepStream 条件流感) /
//   算力摘要 / 5 类冲突检测 (/linkage/rules/conflicts) / Dry-Run (/linkage/rules/dry-run) /
//   版本审计提示 (v8.0)。
import { ref, computed, h } from 'vue'
import { Clock } from '@element-plus/icons-vue'
import { linkageApi, type ConditionNode, type RuleConflict, type DryRunResult } from '@/api/linkage'

export interface ConditionSummaryItem { label: string; desc: string; enabled: boolean }
export interface PreviewAction { type: string; label: string; icon: string; delayMs: number }

const props = defineProps<{
  conditionTree?: ConditionNode
  conditionSummary: ConditionSummaryItem[]
  actions: PreviewAction[]
  selectedEventTypes: string[]
  computeEst: { total: number; headroom: number }
}>()

const CONFLICT_LABEL: Record<string, string> = {
  overlapping_trigger: '重叠触发',
  action_redundancy: '动作冗余',
  wildcard_shadowing: '通配遮蔽',
  cooldown_violation: '冷却违反',
  time_window_conflict: '时间窗冲突',
}

// ── 冲突检测 ──
const conflictLoading = ref(false)
const conflicts = ref<RuleConflict[]>([])
const hasWarningConflict = computed(() => conflicts.value.some(c => c.severity === 'warning'))
async function runConflictCheck() {
  conflictLoading.value = true
  try {
    const res = await linkageApi.detectConflicts()
    conflicts.value = res.data?.data?.conflicts || []
  } catch { conflicts.value = [] } finally { conflictLoading.value = false }
}

// ── Dry-Run ──
const dryLoading = ref(false)
const dryResult = ref<DryRunResult | null>(null)
const dryAlarmType = ref('')
const dryConfidence = ref(70)
/** 本地预判: 模拟事件类型是否在本规则已选事件集合内 (未选=全通配) */
const localHit = computed(() => {
  if (!dryResult.value) return false
  if (props.selectedEventTypes.length === 0) return true
  return props.selectedEventTypes.includes(dryAlarmType.value)
})
async function runDryRun() {
  if (!dryAlarmType.value) return
  dryLoading.value = true
  try {
    const res = await linkageApi.dryRun({ alarm_type: dryAlarmType.value, confidence: dryConfidence.value })
    dryResult.value = (res.data?.data as DryRunResult) || null
  } catch { dryResult.value = null } finally { dryLoading.value = false }
}

// ── 条件树递归渲染节点 (函数式组件, AND/OR/NOT/CASE/LEAF 分色) ──
const NODE_COLORS: Record<string, string> = { AND: '#409EFF', OR: '#67C23A', NOT: '#F56C6C', CASE: '#9B59E6' }
const TreeNode = (p: { node: ConditionNode; depth: number }) => {
  const n = p.node
  const isGate = n.type === 'AND' || n.type === 'OR' || n.type === 'NOT' || n.type === 'CASE'
  // 逐分支收窄 (布尔变量无法保留 narrow: CASE 无 children)
  const children: ConditionNode[] =
    n.type === 'AND' || n.type === 'OR' ? n.children
    : n.type === 'NOT' ? [n.children[0]]
    : []
  const label =
    n.type === 'LEAF' ? `条件: ${n.leaf_type}`
    : n.type === 'CASE' ? `CASE ${n.case_field}`
    : n.type
  return h('div', { class: 'rpp-node', style: { marginLeft: p.depth > 0 ? '16px' : '0' } }, [
    h('span', {
      class: 'rpp-node-tag',
      style: { background: NODE_COLORS[n.type] || '#909399' },
    }, label),
    n.type === 'CASE' && n.case_branches?.length
      ? h('span', { class: 'rpp-node-case' }, n.case_branches.map(b => `WHEN ${b.op} ${b.value} → ${b.actions.length}动作`).join(' ; ') + (n.default_actions.length ? ` ; ELSE → ${n.default_actions.length}动作` : ''))
      : null,
    ...children.map(c => h(TreeNode, { node: c, depth: p.depth + 1 })),
  ])
}
</script>

<style scoped>
.rpp-root { display: flex; flex-direction: column; gap: 12px; }
.rpp-block { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 10px 12px; }
.rpp-block-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.rpp-block-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.rpp-block-head .rpp-block-title { margin-bottom: 0; }
/* 条件树 */
.rpp-tree { font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.rpp-node { display: flex; flex-direction: column; gap: 2px; }
.rpp-node-tag { display: inline-block; color: #fff; border-radius: 3px; padding: 0 6px; font-size: 11px; width: fit-content; }
.rpp-node-case { font-size: 11px; color: var(--el-text-color-secondary); }
/* 条件摘要 */
.rpp-cond-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.rpp-cond { border: 1px solid var(--el-border-color-lighter); border-radius: 4px; padding: 6px 8px; display: flex; align-items: center; gap: 6px; font-size: 12px; }
.rpp-cond.is-off { opacity: 0.55; }
.rpp-cond-name { font-weight: 600; }
.rpp-cond-desc { flex: 1; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 时间线 */
.rpp-timeline { display: flex; flex-direction: column; gap: 6px; }
.rpp-tl-axis { position: relative; height: 14px; border-bottom: 1px solid var(--el-border-color); margin-left: 150px; }
.rpp-tl-tick { position: absolute; transform: translateX(-50%); font-size: 10px; color: var(--el-text-color-placeholder); bottom: -14px; }
.rpp-tl-row { display: flex; align-items: center; gap: 8px; }
.rpp-tl-name { width: 142px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
.rpp-tl-track { flex: 1; position: relative; height: 22px; background: var(--el-fill-color-extra-light); border-radius: 3px; }
.rpp-tl-dot { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 10px; height: 10px; border-radius: 50%; background: var(--el-color-primary); }
.rpp-tl-dot.is-now { background: var(--el-color-success); }
.rpp-tl-dot-label { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); font-size: 10px; color: var(--el-text-color-secondary); white-space: nowrap; }
/* 冲突 */
.rpp-conflict { display: flex; align-items: baseline; gap: 6px; font-size: 12px; padding: 4px 0; border-bottom: 1px dashed var(--el-border-color-lighter); flex-wrap: wrap; }
.rpp-conflict-msg { color: var(--el-text-color-primary); }
.rpp-conflict-fix { color: var(--el-text-color-secondary); font-size: 11px; }
.rpp-empty-hint { font-size: 12px; color: var(--el-text-color-placeholder); }
/* Dry-Run */
.rpp-dryrun-inputs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rpp-dry-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 0; }
.rpp-dry-name { font-weight: 600; min-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rpp-dry-reason { color: var(--el-text-color-secondary); font-size: 11px; }
.rpp-dry-actions { margin-top: 6px; font-size: 12px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.rpp-dry-action { font-size: 11px; }
/* 算力/版本 */
.rpp-est-row { display: flex; align-items: center; gap: 10px; }
.rpp-est-hint { font-size: 11px; color: var(--el-text-color-secondary); }
.rpp-version { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--el-text-color-secondary); background: var(--el-fill-color-extra-light); }
@media (max-width: 1180px) { .rpp-cond-grid { grid-template-columns: 1fr; } }
</style>
