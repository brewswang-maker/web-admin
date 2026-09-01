<template>
  <div ref="rootRef" class="snap-annotated">
    <!-- [fix 2026-09-01 真机探针] 融合告警等程序化链路 snapshot_url 为空但
         bbox/target_label 已落库: 空图时渲染网格占位底 + overlay 照常画框,
         标注可视化不再被无快照阻断 (src 由父组件判空传入) -->
    <el-image v-if="src" :src="src" :preview-src-list="[src]" fit="fill" class="snap-img" @load="onImgLoad" />
    <div v-else class="snap-placeholder">{{ t('perimeter.events.annotPlaceholder') }}</div>
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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 图像自然尺寸 (检测直报链 detections 为原图像素坐标, 归一化基准;
// 真机 1920x1080 快照实证)
const rootRef = ref<HTMLElement>()
const imgNat = ref<{ w: number; h: number }>({ w: 0, h: 0 })
function onImgLoad() {
  // 容器内局部查询 (同页多实例时全局 querySelector 会取错图)
  const img = rootRef.value?.querySelector('img') as HTMLImageElement | null
  if (img?.naturalWidth && img?.naturalHeight) {
    imgNat.value = { w: img.naturalWidth, h: img.naturalHeight }
  }
}

const props = defineProps<{
  /** 快照图 URL (可空: 空串时渲染网格占位底, overlay 仍画框) */
  src: string
  /** normalize 后告警 metadata (bbox/target_label; 兜底合并在 EventsView 完成) */
  metadata?: Record<string, unknown>
}>()

/** 归一化检测框 [x1,y1,x2,y2]; 防御式校验 (缺失/越界/退化一律不渲染)。
 *  [vp6 收尾补测 2026-09-01] 检测直报链兜底: metadata.bbox 缺失时回退
 *  detections[0] / 数组形态 metadata 首元素 (原图像素坐标 x1/y1/x2/y2),
 *  任一坐标 >1 判像素 → 按图像自然尺寸归一化 (未加载完先不出框, @load 后重算) */
const box = computed<number[] | null>(() => {
  const m = (props.metadata || {}) as Record<string, unknown>
  let b = m.bbox as unknown
  if (!Array.isArray(b) || b.length < 4) {
    const det = Array.isArray(m.detections) ? m.detections[0] : null
    const cand = (det && typeof det === 'object' ? det : (typeof m.x1 === 'number' ? m : null)) as Record<string, unknown> | null
    if (cand && ['x1', 'y1', 'x2', 'y2'].every(k => typeof cand[k] === 'number')) {
      b = [cand.x1, cand.y1, cand.x2, cand.y2]
    }
  }
  if (!Array.isArray(b) || b.length < 4) return null
  let [x1, y1, x2, y2] = b.map(Number)
  if (![x1, y1, x2, y2].every(n => Number.isFinite(n))) return null
  if (x2 <= x1 || y2 <= y1) return null
  if ([x1, y1, x2, y2].some(v => v > 1)) {
    const { w, h } = imgNat.value
    if (!w || !h) return null
    x1 /= w; y1 /= h; x2 /= w; y2 /= h
  }
  if (![x1, y1, x2, y2].every(n => n >= 0 && n <= 1)) return null
  return [x1, y1, x2, y2]
})

/** 目标标签角标 (英文模型标签; target_label / targetLabel / class_name 三级回退) */
const label = computed(() => {
  const m = (props.metadata || {}) as Record<string, unknown>
  const v = m.target_label ?? m.targetLabel ?? m.class_name
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
/* [fix 2026-09-01] 无快照占位底: 网格线模拟取景坐标系, 保证框位置可读 */
.snap-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  background-color: var(--el-fill-color-darker);
  background-image:
    linear-gradient(var(--el-border-color-lighter) 1px, transparent 1px),
    linear-gradient(90deg, var(--el-border-color-lighter) 1px, transparent 1px);
  background-size: 12.5% 16.6%;
}
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
