<template>
  <div class="snap-annotated">
    <el-image :src="src" :preview-src-list="[src]" fit="fill" class="snap-img" />
    <!-- 检测框叠加: bbox 为归一化 [x1,y1,x2,y2], SVG viewBox 0-100 + none 保真映射;
         object-fit:fill 拉伸图像与 SVG 同步形变 → 坐标恒对齐 (标注精确性优先,
         轻度纵横比形变可接受, 对齐 LiveView 检测框叠加语义) -->
    <svg v-if="box" class="ann-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect :x="box[0] * 100" :y="box[1] * 100"
            :width="(box[2] - box[0]) * 100" :height="(box[3] - box[1]) * 100"
            class="ann-rect" />
    </svg>
    <span v-if="box && label" class="ann-label"
          :style="{ left: clampPct(box[0] * 100, 2, 86), top: clampPct(box[1] * 100, 2, 92) }">
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * SnapshotAnnotated — 事件快照检测框标注 (vp6 P1-3 2026-09-01)
 *
 * 链路: 算法 DetectionBox → AlarmDispatcher full_meta.bbox/target_label (vp6
 * 接通的唯一后端断点) → alarm_events.metadata → /alarms 透出 → 本组件 SVG overlay。
 * 快照查阅时直观定位触发目标 (人/车/遗留物/烟火), 支撑误报复盘与值守取证。
 *
 * 坐标范式: bbox 归一化 [0,1], 与 LiveView 检测框 (模型输入归一化) 同语义;
 * fill+preserveAspectRatio="none" 组合保证框与目标像素级对齐;
 * vector-effect: non-scaling-stroke 防非均匀缩放导致的描边粗细变形。
 */
import { computed } from 'vue'

const props = defineProps<{
  /** 快照图 URL (空串时由父组件渲染 el-empty, 不进本组件) */
  src: string
  /** normalize 后告警 metadata (bbox/target_label; 兜底合并在 EventsView 完成) */
  metadata?: Record<string, unknown>
}>()

/** 归一化检测框 [x1,y1,x2,y2]; 防御式校验 (缺失/越界/退化一律不渲染) */
const box = computed<number[] | null>(() => {
  const b = props.metadata?.bbox
  if (!Array.isArray(b) || b.length < 4) return null
  const [x1, y1, x2, y2] = b.map(Number)
  if (![x1, y1, x2, y2].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return null
  if (x2 <= x1 || y2 <= y1) return null
  return [x1, y1, x2, y2]
})

/** 目标标签角标 (英文模型标签, target_label / normalize 双键兼容) */
const label = computed(() => {
  const v = props.metadata?.target_label ?? props.metadata?.targetLabel
  return typeof v === 'string' && v.trim() ? v.trim() : ''
})

/** 角标位置钳位 (百分比字符串, 防标签溢出容器) */
function clampPct(v: number, min: number, max: number): string {
  return `${Math.min(max, Math.max(min, v))}%`
}
</script>

<style scoped>
.snap-annotated {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
  background: var(--el-fill-color-light);
}
.snap-img { width: 100%; height: 100%; display: block; }
.snap-img :deep(img) { width: 100%; height: 100%; object-fit: fill; }
.ann-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.ann-rect {
  fill: transparent;
  stroke: var(--el-color-danger);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.ann-label {
  position: absolute;
  transform: translateY(-100%);
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  pointer-events: none;
  max-width: 92%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
