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
    </div>
    <div class="tree-container" v-if="modelValue">
      <TreeNode :node="modelValue" :depth="0" @update="onNodeUpdate" @remove="onRootReset" />
    </div>
    <el-empty v-else description="点击工具栏按钮添加条件节点" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, h, FunctionalComponent } from 'vue'
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

  // P0-4: CASE 节点渲染 (v8.0)
  if (node.type === 'CASE') {
    const caseNode = node as any
    const branches = caseNode.case_branches || []
    return h('div', { class: 'tree-node branch case-node', style: { marginLeft: indent } }, [
      h('div', { class: 'branch-header' }, [
        h('span', { class: 'node-badge', style: { background: nodeColors.CASE } }, `CASE: ${caseNode.case_field || 'field'}`),
        h('span', { class: 'child-count' }, `(${branches.length} branches)`),
        depth === 0
          ? h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => emit('remove') }, () => '清空')
          : h('el-button', { size: 'small', type: 'danger', link: true, onClick: () => emit('remove') }, () => '删除'),
      ]),
      ...branches.map((branch: any, i: number) =>
        h('div', { class: 'case-branch', style: { marginLeft: '20px' } }, [
          h('span', { class: 'node-badge', style: { background: '#8B5CF6', opacity: 0.7 } }, `${branch.op || 'eq'}: ${branch.value || ''}`),
        ])
      ),
      caseNode.default_actions && caseNode.default_actions.length > 0
        ? h('div', { class: 'case-default', style: { marginLeft: '20px' } }, [
            h('span', { class: 'node-badge', style: { background: '#6B7280' } }, 'default'),
          ])
        : null,
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
</style>
