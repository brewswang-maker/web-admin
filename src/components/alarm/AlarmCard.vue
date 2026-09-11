<template>
  <div class="alarm-card" @click="emit('click', alarm)">
    <!-- 上部 16:9 快照 (无图占位); 级别 tag 左上覆盖 -->
    <div class="alarm-card__snap">
      <img v-if="snapUrl" :src="snapUrl" loading="lazy" alt="" />
      <div v-else class="alarm-card__snap-empty">
        <el-icon :size="28"><Picture /></el-icon>
        <span>无快照</span>
      </div>
      <span class="alarm-card__level" :class="`lv-${levelTone}`">{{ levelLabel }}</span>
    </div>

    <!-- 下部信息区 -->
    <div class="alarm-card__body">
      <div class="alarm-card__row alarm-card__row--main">
        <span class="alarm-card__type" :title="alarm.type">{{ typeZh }}</span>
        <el-tag class="alarm-card__status" size="small" :type="statusTone as any" effect="plain">{{ statusLabel }}</el-tag>
      </div>
      <div class="alarm-card__row alarm-card__row--meta">
        <span class="alarm-card__group" :title="groupName || '-'">{{ groupName || '未分组' }}</span>
        <span class="alarm-card__sep">·</span>
        <span class="alarm-card__device" :title="deviceName">{{ deviceName }}</span>
      </div>
      <div class="alarm-card__row alarm-card__row--time">{{ timeText }}</div>
      <!-- 行操作插槽 (详情/处理等, 由接入页决定) -->
      <div v-if="$slots.actions" class="alarm-card__actions" @click.stop>
        <slot name="actions" :alarm="alarm" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AlarmCard.vue — [P2 2026-09-10] 告警/事件卡片视图
 *
 * 对齐设计稿: 上部 16:9 快照缩略图 (无图占位), 下部 级别 tag + 事件类型 (中文 SSOT)
 * + 处理状态 + 所属分组 + 设备名 + 告警时间; actions 插槽放行操作 (详情/处理)。
 * 字段取值复用各页面现有行数据结构 (AlarmEvent 归一化形态),
 * 页面排序/筛选/分页逻辑零改动 — 仅模板层卡片栅格消费本组件。
 */
import { computed } from 'vue'
import { Picture } from '@element-plus/icons-vue'
import type { AlarmEvent } from '@/types/alarm'
import { useEventTypeZh } from '@/composables/useEventTypeZh'
// [FIX dev-name-num 2026-09-11] 设备名称数字形态治理 (共享目录反查)
import { resolveAlarmDeviceName } from '@/composables/useAlarmDeviceLabel'

const props = defineProps<{
  alarm: AlarmEvent
  /** 所属分组名 (各页反查口径不同, 由父级传入; 未传显示 未分组) */
  groupName?: string
}>()
const emit = defineEmits<{ (e: 'click', a: AlarmEvent): void }>()

const { zh } = useEventTypeZh()

const snapUrl = computed(() => props.alarm.snapshotUrl || '')

/** 事件类型中文 (canonical SSOT 优先, 未注册回原文 — 与各列表页同口径) */
const typeZh = computed(() => {
  const k = String(props.alarm.type || '')
  const z = zh(k)
  return z && z !== k ? z : k
})

// ── 级别 (severity/level 兜底链) ──
const levelTone = computed(() => {
  const lv = String((props.alarm as any).severity || props.alarm.level || '').toLowerCase()
  if (lv.includes('crit')) return 'crit'
  if (lv.includes('high')) return 'high'
  if (lv.includes('med') || lv.includes('warn')) return 'med'
  if (lv.includes('low')) return 'low'
  return 'info'
})
const levelLabel = computed(() => ({
  crit: '严重', high: '高', med: '中', low: '低', info: '提示',
}[levelTone.value]))

// ── 处理状态 ──
const STATUS_CN: Record<string, { label: string; tone: string }> = {
  unhandled: { label: '未处理', tone: 'warning' },
  acknowledged: { label: '已确认收到', tone: 'primary' },
  disposed: { label: '处置中', tone: 'primary' },
  escalated: { label: '已升级', tone: 'danger' },
  confirmed: { label: '已确认', tone: 'success' },
  true_positive: { label: '真实告警', tone: 'success' },
  false_alarm: { label: '误报', tone: 'info' },
  ignored: { label: '已忽略', tone: 'info' },
  unsure: { label: '存疑', tone: 'warning' },
  known: { label: '已知事件', tone: 'info' },
  closed: { label: '已关闭', tone: 'info' },
  resolved: { label: '已解决', tone: 'success' },
  new: { label: '新告警', tone: 'danger' },
}
const statusInfo = computed(() =>
  STATUS_CN[String(props.alarm.status || '')] || { label: String(props.alarm.status || '-'), tone: 'info' })
const statusLabel = computed(() => statusInfo.value.label)
const statusTone = computed(() => statusInfo.value.tone)

// [FIX dev-name-num 2026-09-11] 空名/纯数字形态 (face 插件截断 hash 等历史数据) → 目录反查;
//   反查不中兜底 location, 不再裸显 deviceId 数字串
const deviceName = computed(() =>
  resolveAlarmDeviceName(props.alarm.deviceName, props.alarm.deviceId, props.alarm.channelId)
  || (props.alarm as any).location || '-')

const timeText = computed(() => {
  const t = props.alarm.createdAt ? new Date(props.alarm.createdAt) : null
  if (!t || isNaN(t.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`
})
</script>

<style scoped>
.alarm-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
}
.alarm-card:hover {
  box-shadow: var(--el-box-shadow-light);
  transform: translateY(-2px);
}

/* 16:9 快照 */
.alarm-card__snap {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #0b0f14;
  display: flex;
  align-items: center;
  justify-content: center;
}
.alarm-card__snap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.alarm-card__snap-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #5a6b7d;
  font-size: 12px;
}
.alarm-card__level {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  color: #fff;
  background: #909399;
}
.alarm-card__level.lv-crit { background: #f56c6c; }
.alarm-card__level.lv-high { background: #e6a23c; }
.alarm-card__level.lv-med { background: #409eff; }
.alarm-card__level.lv-low { background: #67c23a; }

/* 信息区 */
.alarm-card__body { padding: 10px 12px 12px; }
.alarm-card__row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.alarm-card__row--main { justify-content: space-between; }
.alarm-card__type {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alarm-card__status { font-size: 14px; }
.alarm-card__row--meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.alarm-card__group {
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alarm-card__sep { flex-shrink: 0; }
.alarm-card__device {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alarm-card__row--time {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}
.alarm-card__actions {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
</style>
