<!--
  ConditionTreeEditor.vue — 可视化条件树编辑器 (AND/OR/NOT 拖拽组合)
  参考：海康 iSecure Center 条件配置面板
-->
<template>
  <div class="condition-tree-editor">
    <div class="tree-toolbar">
      <el-button size="small" type="primary" @click="addAndNode">+ AND</el-button>
      <el-button size="small" type="success" @click="addOrNode">+ OR</el-button>
      <el-button size="small" type="warning" @click="addNotNode">+ NOT</el-button>
      <el-button size="small" type="info" @click="addCaseNode">+ CASE</el-button>
      <el-button size="small" @click="addLeafNode('time')">+ 时间条件</el-button>
      <el-button size="small" @click="addLeafNode('spatial')">+ 空间条件</el-button>
      <el-button size="small" @click="addLeafNode('source')">+ 事件源</el-button>
      <el-button size="small" @click="addLeafNode('merge')">+ 合并条件</el-button>
      <el-button size="small" type="danger" plain @click="addSourceAttrLeaf">+ 属性条件</el-button>
      <el-divider direction="vertical" />
      <el-button size="small" :icon="Download" @click="exportJson" :disabled="!modelValue">导出 JSON</el-button>
      <el-button size="small" :icon="Upload" @click="triggerImport">导入 JSON</el-button>
      <input ref="fileInputRef" type="file" accept=".json" style="display:none" @change="importJson" />
    </div>
    <div class="tree-container" v-if="modelValue">
      <TreeNode :node="modelValue" :depth="0" @update="onNodeUpdate" @remove="onRootReset" />
    </div>
    <el-empty v-else description="点击工具栏按钮添加条件节点" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, h, FunctionalComponent, ref } from 'vue'
import { Download, Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { ConditionNode } from '@/api/linkage'
// [P4-D 2026-08-29] 属性键契约白名单 (P4-B SSOT 前端移植)
import {
  ATTRIBUTE_KEYS, ID_ENUM_OPTIONS, isRegisteredAttributeKey,
  getAttributeKeyDef, allowedOps, valueControlKind,
} from '@/api/attributeKeys'

const props = defineProps<{
  modelValue: ConditionNode | undefined
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ConditionNode | undefined): void
}>()

function createNode(type: string): ConditionNode {
  if (type === 'AND') return { type: 'AND', children: [] }
  if (type === 'OR') return { type: 'OR', children: [] }
  if (type === 'NOT') return { type: 'NOT', children: [{ type: 'LEAF', leaf_type: 'time' as any, condition: {} as any }] }
  if (type === 'CASE') return { type: 'CASE', case_field: 'alarm_type', case_branches: [], default_actions: [] } as any
  return { type: 'LEAF', leaf_type: 'time' as any, condition: {} as any }
}

function addAndNode() {
  if (!props.modelValue) {
    emit('update:modelValue', { type: 'AND', children: [] })
  } else if (props.modelValue.type === 'AND' || props.modelValue.type === 'OR') {
    const updated = { ...props.modelValue, children: [...props.modelValue.children, { type: 'AND' as const, children: [] }] }
    emit('update:modelValue', updated)
  } else {
    emit('update:modelValue', { type: 'AND', children: [props.modelValue] })
  }
}

function addOrNode() {
  if (!props.modelValue) {
    emit('update:modelValue', { type: 'OR', children: [] })
  } else if (props.modelValue.type === 'OR') {
    const updated = { ...props.modelValue, children: [...props.modelValue.children, { type: 'OR' as const, children: [] }] }
    emit('update:modelValue', updated)
  } else {
    emit('update:modelValue', { type: 'OR', children: [props.modelValue] })
  }
}

function addNotNode() {
  if (!props.modelValue) {
    emit('update:modelValue', { type: 'NOT', children: [{ type: 'LEAF', leaf_type: 'source' as any, condition: {} as any }] })
  }
}

function addCaseNode() {
  // P0-4: CASE 节点 (v8.0 后端支持)
  const caseNode: any = {
    type: 'CASE',
    case_field: 'alarm_type',
    case_branches: [
      { op: 'eq', value: 'face_blacklist', actions: [] },
    ],
    default_actions: [],
  }
  if (!props.modelValue) {
    emit('update:modelValue', caseNode)
  } else if (props.modelValue.type === 'AND' || props.modelValue.type === 'OR') {
    const updated = { ...props.modelValue, children: [...props.modelValue.children, caseNode] }
    emit('update:modelValue', updated as ConditionNode)
  } else {
    emit('update:modelValue', { type: 'AND' as const, children: [props.modelValue, caseNode] })
  }
}

function attachLeaf(leaf: any) {
  if (!props.modelValue) {
    emit('update:modelValue', { type: 'AND', children: [leaf] })
  } else if (props.modelValue.type === 'AND' || props.modelValue.type === 'OR') {
    const updated = { ...props.modelValue, children: [...props.modelValue.children, leaf] }
    emit('update:modelValue', updated)
  } else {
    emit('update:modelValue', { type: 'AND', children: [props.modelValue, leaf] })
  }
}

function addLeafNode(leafType: string) {
  attachLeaf({ type: 'LEAF', leaf_type: leafType, condition: {} })
}

// [P4-D] 快速入口: 事件源叶子 + 默认属性条件 (attr_Backpack_score >= 0.6)
function addSourceAttrLeaf() {
  attachLeaf({
    type: 'LEAF',
    leaf_type: 'source',
    condition: { attribute_conditions: [{ key: 'attr_Backpack_score', op: '>=', value: 0.6 }] },
  })
}

function onNodeUpdate(updated: ConditionNode) {
  emit('update:modelValue', updated)
}

function onRootReset() {
  emit('update:modelValue', undefined)
}

// [P1-5] JSON 导入/导出
const fileInputRef = ref<HTMLInputElement | null>(null)

function exportJson() {
  if (!props.modelValue) return
  const blob = new Blob([JSON.stringify(props.modelValue, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `condition_tree_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('条件树已导出')
}

function triggerImport() {
  fileInputRef.value?.click()
}

function importJson(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string)
      if (!data.type) throw new Error('缺少 type 字段')
      emit('update:modelValue', data as ConditionNode)
      ElMessage.success('条件树已导入')
    } catch (err: any) {
      ElMessage.error('导入失败: ' + (err.message || '无效的 JSON 格式'))
    }
  }
  reader.readAsText(file)
  input.value = ''  // 重置以支持重复导入同一文件
}

// 内联递归节点组件
const leafLabels: Record<string, string> = {
  time: '时间条件',
  spatial: '空间条件',
  source: '事件源条件',
  merge: '合并条件',
}

const nodeColors: Record<string, string> = {
  AND: '#409eff',
  OR: '#67c23a',
  NOT: '#e6a23c',
  CASE: '#8B5CF6',
  LEAF: '#909399',
}

// ── [P4-D] 属性条件编辑区 (LEAF:SOURCE 同步) ──────────────────────────

/** 全量白名单按键分组 (下拉分组展示) */
const GROUPED_KEYS: Record<string, typeof ATTRIBUTE_KEYS> = {}
for (const d of ATTRIBUTE_KEYS) {
  (GROUPED_KEYS[d.group] ||= []).push(d)
}

/** 后端协议全集 op (key 未注册时兜底展示, 便于导入数据修正) */
const ALL_OPS = ['==', '!=', '>', '>=', '<', '<=', 'exists', 'not_exists']

/** 单行属性条件渲染: key 分组下拉 + kind 约束算子 + value 分控件 + 非法拦截标记 */
function renderAttrCondRow(
  ac: any,
  idx: number,
  updateAc: (idx: number, patch: Record<string, any>) => void,
  removeAc: (idx: number) => void
) {
  const def = getAttributeKeyDef(String(ac.key || ''))
  const keyInvalid = !!ac.key && !isRegisteredAttributeKey(String(ac.key))
  const opInvalid = !!def && !allowedOps(def.kind).includes(String(ac.op))
  const ctl = valueControlKind(String(ac.key || ''), def)
  const isExistOp = ac.op === 'exists' || ac.op === 'not_exists'

  // value 控件分型 (docs/attribute-key-contract.md §1):
  //   标签/置信类→0-1 滑条; 枚举 id/状态→下拉(色系带色板); 布尔证据→开关; EXISTS→隐藏
  const valueNode = isExistOp
    ? h('span', { class: 'child-count' }, '—')
    : ctl === 'enum'
      ? h('el-select', {
          modelValue: ac.value,
          size: 'small',
          style: { width: '150px' },
          'onUpdate:modelValue': (v: number) => updateAc(idx, { value: v }),
        }, () => (ID_ENUM_OPTIONS[String(ac.key)] || []).map((o) =>
          h('el-option', { key: o.value, value: o.value, label: o.label }, () => [
            o.hex
              ? h('span', {
                  style: {
                    display: 'inline-block', width: '10px', height: '10px',
                    borderRadius: '2px', background: o.hex, marginRight: '6px',
                    verticalAlign: 'middle', border: '1px solid #ddd',
                  },
                })
              : null,
            o.label,
          ])
        ))
      : ctl === 'slider'
        ? h('el-slider', {
            modelValue: ac.value,
            min: 0, max: 1, step: 0.05,
            style: { width: '130px' },
            'onUpdate:modelValue': (v: number | number[]) =>
              updateAc(idx, { value: Array.isArray(v) ? v[0] : v }),
          })
        : ctl === 'bool'
          ? h('el-switch', {
              modelValue: Number(ac.value) >= 0.5 ? 1 : 0,
              activeValue: 1, inactiveValue: 0,
              'onUpdate:modelValue': (v: number | string | boolean) =>
                updateAc(idx, { value: Number(v) }),
            })
          : h('el-input-number', {
              modelValue: ac.value,
              size: 'small', step: 0.1,
              style: { width: '120px' },
              'onUpdate:modelValue': (v: number | undefined) => updateAc(idx, { value: v ?? 0 }),
            })

  const hint = keyInvalid
    ? `未注册属性 key: ${ac.key} (合法域见属性键契约, 后端评估不会命中)`
    : opInvalid
      ? `算子 ${ac.op} 与键类型 ${def?.kind} 不匹配, 请重新选择`
      : def?.desc || ''

  return h('div', {
    class: ['attr-cond-row', keyInvalid || opInvalid ? 'invalid' : ''],
    title: hint,
  }, [
    // key 下拉 (白名单分组 + 可搜索)
    h('el-select', {
      class: 'attr-cond-key',
      modelValue: ac.key,
      size: 'small',
      filterable: true,
      'onUpdate:modelValue': (v: string) => {
        const patch: Record<string, any> = { key: v }
        const d = getAttributeKeyDef(v)
        // 非法算子拦截: 换 key 后算子与新 kind 不兼容时自动改推荐首项
        if (d && !allowedOps(d.kind).includes(String(ac.op))) {
          patch.op = allowedOps(d.kind)[0]
        }
        updateAc(idx, patch)
      },
    }, () => Object.entries(GROUPED_KEYS).map(([g, defs]) =>
      h('el-option-group', { key: g, label: g }, () => defs.map((d) =>
        h('el-option', { key: d.key, value: d.key, label: d.key }, () => [
          h('span', null, d.key),
          h('span', { class: 'attr-opt-desc' }, d.desc),
        ])
      ))
    )),
    // op 下拉 (按 kind 强约束; key 非法时放开全集便于修正导入数据)
    h('el-select', {
      class: 'attr-cond-op',
      modelValue: ac.op,
      size: 'small',
      'onUpdate:modelValue': (v: string) => updateAc(idx, { op: v }),
    }, () => (def ? allowedOps(def.kind) : ALL_OPS).map((o) =>
      h('el-option', { key: o, value: o, label: o })
    )),
    valueNode,
    h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => removeAc(idx) }, () => '×'),
  ])
}

// 使用 render function 实现递归
const TreeNode: FunctionalComponent<{ node: ConditionNode; depth: number; onUpdate: (n: ConditionNode) => void; onRemove: () => void }> = (props, { emit }) => {
  const { node, depth } = props
  const indent = `${depth * 20}px`

  if (node.type === 'LEAF') {
    const leafType = (node as any).leaf_type as string
    const cond: any = (node as any).condition || {}
    const acs: any[] = Array.isArray(cond.attribute_conditions) ? cond.attribute_conditions : []

    // [P4-D] LEAF:SOURCE 属性条件编辑区 — 与后端 source_cond.attribute_conditions 同步
    const kids: any[] = [
      h('span', { class: 'node-badge', style: { background: nodeColors.LEAF } }, leafLabels[leafType] || '条件'),
    ]
    if (leafType === 'source') {
      const updateCond = (patch: Record<string, any>) => {
        emit('update', { ...node, condition: { ...cond, ...patch } } as ConditionNode)
      }
      const updateAc = (idx: number, patch: Record<string, any>) => {
        updateCond({ attribute_conditions: acs.map((a, i) => (i === idx ? { ...a, ...patch } : a)) })
      }
      const removeAc = (idx: number) => {
        updateCond({ attribute_conditions: acs.filter((_, i) => i !== idx) })
      }
      kids.push(h('span', { class: 'child-count' }, acs.length ? `属性×${acs.length}` : '无属性条件'))
      if (acs.length) {
        kids.push(
          h('div', { class: 'attr-cond-list' },
            acs.map((ac, idx) => renderAttrCondRow(ac, idx, updateAc, removeAc))
          )
        )
      }
      kids.push(
        h('el-button', {
          size: 'small', type: 'primary', link: true,
          onClick: () => updateCond({ attribute_conditions: [...acs, { key: 'attr_Backpack_score', op: '>=', value: 0.6 }] }),
        }, () => '+ 属性条件')
      )
    }
    kids.push(h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => emit('remove') }, () => '删除'))

    return h('div', { class: 'tree-node leaf', style: { marginLeft: indent } }, kids)
  }

  // P0-4 + P2-5: CASE 节点渲染 (v8.0) — 含分支编辑功能
  if (node.type === 'CASE') {
    const caseNode = node as any
    const branches: any[] = caseNode.case_branches || []
    const caseFieldOptions = ['alarm_type', 'severity', 'region_id', 'device_id', 'confidence']
    const opOptions = ['eq', 'neq', 'contains', 'gt', 'lt']

    const updateCase = (patch: Record<string, any>) => {
      emit('update', { ...caseNode, ...patch } as ConditionNode)
    }
    const updateBranch = (idx: number, patch: Record<string, any>) => {
      const newBranches = branches.map((b: any, i: number) => i === idx ? { ...b, ...patch } : b)
      updateCase({ case_branches: newBranches })
    }
    const removeBranch = (idx: number) => {
      updateCase({ case_branches: branches.filter((_: any, i: number) => i !== idx) })
    }
    const addBranch = () => {
      updateCase({ case_branches: [...branches, { op: 'eq', value: '', actions: [] }] })
    }

    return h('div', { class: 'tree-node branch case-node', style: { marginLeft: indent } }, [
      h('div', { class: 'branch-header' }, [
        h('span', { class: 'node-badge', style: { background: nodeColors.CASE } }, 'CASE'),
        // [P2-5] case_field 可编辑下拉
        h('select', {
          class: 'case-field-select',
          value: caseNode.case_field || 'alarm_type',
          onChange: (e: Event) => updateCase({ case_field: (e.target as HTMLSelectElement).value }),
        }, caseFieldOptions.map(f => h('option', { value: f, selected: f === caseNode.case_field }, f))),
        h('span', { class: 'child-count' }, `(${branches.length} 分支)`),
        h('el-button', { size: 'small', type: 'primary', link: true, onClick: addBranch }, () => '+ 分支'),
        depth === 0
          ? h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => emit('remove') }, () => '清空')
          : h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => emit('remove') }, () => '删除'),
      ]),
      // [P2-5] 每个分支: op 下拉 + value 输入 + 删除按钮
      ...branches.map((branch: any, i: number) =>
        h('div', { class: 'case-branch', style: { marginLeft: '20px', display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' } }, [
          h('span', { style: { fontSize: '12px', color: '#8B5CF6', fontWeight: 600 } }, `IF ${caseNode.case_field || 'field'}`),
          h('select', {
            class: 'case-op-select',
            value: branch.op || 'eq',
            onChange: (e: Event) => updateBranch(i, { op: (e.target as HTMLSelectElement).value }),
          }, opOptions.map(op => h('option', { value: op, selected: op === branch.op }, op))),
          h('input', {
            class: 'case-value-input',
            value: branch.value || '',
            placeholder: '匹配值 (e.g. intrusion)',
            onInput: (e: Event) => updateBranch(i, { value: (e.target as HTMLInputElement).value }),
          }),
          h('span', { style: { fontSize: '11px', color: '#909399' } }, `→ ${(branch.actions || []).length} 动作`),
          h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => removeBranch(i) }, () => '×'),
        ])
      ),
      // [P2-5] default 分支
      h('div', { class: 'case-default', style: { marginLeft: '20px', display: 'flex', alignItems: 'center', gap: '6px' } }, [
        h('span', { class: 'node-badge', style: { background: '#6B7280', fontSize: '11px' } }, 'DEFAULT'),
        h('span', { style: { fontSize: '11px', color: '#909399' } }, `→ ${(caseNode.default_actions || []).length} 动作`),
      ]),
    ])
  }

  const label = node.type === 'NOT' ? 'NOT' : node.type
  const childNodes = (node as any).children || []

  return h('div', { class: 'tree-node branch', style: { marginLeft: indent } }, [
    h('div', { class: 'branch-header' }, [
      h('span', { class: 'node-badge', style: { background: nodeColors[node.type] || '#909399' } }, label),
      h('span', { class: 'child-count' }, `(${childNodes.length})`),
      depth === 0
        ? h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => emit('remove') }, () => '清空')
        : h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => emit('remove') }, () => '删除'),
    ]),
    ...childNodes.map((child: ConditionNode, i: number) =>
      h(TreeNode, {
        node: child,
        depth: depth + 1,
        onUpdate: (updated: ConditionNode) => {
          const newChildren = [...childNodes]
          newChildren[i] = updated
          emit('update', { ...node, children: newChildren } as ConditionNode)
        },
        onRemove: () => {
          const newChildren = childNodes.filter((_: any, idx: number) => idx !== i)
          if (newChildren.length === 0 && depth > 0) {
            emit('remove')
          } else {
            emit('update', { ...node, children: newChildren } as ConditionNode)
          }
        },
      })
    ),
  ])
}
</script>

<style scoped>
.condition-tree-editor {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
}
.tree-toolbar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.tree-container {
  min-height: 60px;
}
.tree-node {
  padding: 4px 0;
}
.branch-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.node-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}
.child-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.leaf {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
/* [P4-D] 属性条件编辑区 */
.attr-cond-list {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 24px;
}
.attr-cond-row {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 4px;
}
.attr-cond-row.invalid {
  outline: 1px solid var(--el-color-danger);
  padding: 0 2px;
}
.attr-cond-key {
  width: 230px;
}
.attr-cond-op {
  width: 86px;
}
:deep(.attr-opt-desc) {
  float: right;
  margin-left: 12px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
/* [P2-5] CASE 节点编辑器样式 */
.case-field-select,
.case-op-select {
  padding: 1px 4px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-size: 12px;
  background: #fff;
}
.case-value-input {
  padding: 1px 6px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-size: 12px;
  width: 160px;
}
.case-branch {
  border-left: 2px solid #8B5CF6;
  padding-left: 8px;
  margin-top: 2px;
}
.case-default {
  border-left: 2px solid #6B7280;
  padding-left: 8px;
  margin-top: 2px;
}
</style>
