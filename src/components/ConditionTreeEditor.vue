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

function addLeafNode(leafType: string) {
  const leaf: any = { type: 'LEAF', leaf_type: leafType, condition: {} }
  if (!props.modelValue) {
    emit('update:modelValue', { type: 'AND', children: [leaf] })
  } else if (props.modelValue.type === 'AND' || props.modelValue.type === 'OR') {
    const updated = { ...props.modelValue, children: [...props.modelValue.children, leaf] }
    emit('update:modelValue', updated)
  } else {
    emit('update:modelValue', { type: 'AND', children: [props.modelValue, leaf] })
  }
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

// 使用 render function 实现递归
const TreeNode: FunctionalComponent<{ node: ConditionNode; depth: number; onUpdate: (n: ConditionNode) => void; onRemove: () => void }> = (props, { emit }) => {
  const { node, depth } = props
  const indent = `${depth * 20}px`

  if (node.type === 'LEAF') {
    return h('div', { class: 'tree-node leaf', style: { marginLeft: indent } }, [
      h('span', { class: 'node-badge', style: { background: nodeColors.LEAF } }, leafLabels[(node as any).leaf_type] || '条件'),
      h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => emit('remove') }, () => '删除'),
    ])
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
