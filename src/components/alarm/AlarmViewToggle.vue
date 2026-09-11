<template>
  <el-radio-group :model-value="modelValue" size="small" @update:model-value="onChange">
    <el-radio-button value="card"><el-icon><Grid /></el-icon> 卡片</el-radio-button>
    <el-radio-button value="table"><el-icon><List /></el-icon> 列表</el-radio-button>
  </el-radio-group>
</template>

<script setup lang="ts">
/**
 * AlarmViewToggle.vue — [P2 2026-09-10] 告警列表 卡片/列表 视图切换
 * (范式同 ChannelView el-radio-group; 选择持久化 localStorage,
 *  key `alarm_view_mode_<page>` — 各页独立记忆, 刷新保持)
 */
import { watch } from 'vue'
import { Grid, List } from '@element-plus/icons-vue'

const props = defineProps<{
  /** 页面标识 (localStorage key 后缀, 如 'alarms' / 'perimeter') */
  pageKey: string
  modelValue: 'card' | 'table'
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: 'card' | 'table'): void }>()

const storageKey = () => `alarm_view_mode_${props.pageKey}`

watch(() => props.modelValue, (v) => {
  try { localStorage.setItem(storageKey(), v) } catch { /* 隐私模式等写失败静默 */ }
}, { immediate: true })

function onChange(v: string | number | boolean | undefined) {
  emit('update:modelValue', v === 'card' ? 'card' : 'table')
}
</script>
