<template>
  <div ref="rootRef" class="snap-annotated">
    <!-- [fix 2026-09-01 真机探针] 融合告警等程序化链路 snapshot_url 为空但
         bbox/target_label 已落库: 空图时渲染网格占位底 + overlay 照常画框,
         标注可视化不再被无快照阻断 (src 由父组件判空传入) -->
    <!-- [fix 2026-09-02] 补 preview-teleported: 在 el-drawer 内点击放大时,
         预览层不 teleported 会被抽屉 z-index/裁剪遮挡 -->
    <el-image v-if="src" :src="src" :preview-src-list="[src]" fit="fill" preview-teleported class="snap-img" @load="onImgLoad" />
    <div v-else class="snap-placeholder">{{ t('perimeter.events.annotPlaceholder') }}</div>
    <!-- 检测框叠加: bbox 为归一化 [x1,y1,x2,y2], SVG viewBox 0-100 + none 保真映射;
         object-fit:fill 拉伸图像与 SVG 同步形变 → 坐标恒对齐 (标注精确性优先,
         轻度纵横比形变可接受, 对齐 LiveView 检测框叠加语义)
         [FEAT 2026-09-04] 双层扩展: 底层原始几何形状 (检测区/排除区/绊线/方向线/
         计数区, 规则 roi_shapes_json 优先→区域库回退) + 上层多目标全量标注
         (metadata.detections 遍历, 触发目标危险色高亮, 其余类别调色板);
         data-* 属性供 DOM 探针验证渲染计数 -->
    <svg v-if="shapes.length || detBoxes.length || box" class="ann-overlay" viewBox="0 0 100 100"
         preserveAspectRatio="none" aria-hidden="true"
         :data-shape-count="shapes.length" :data-det-count="detBoxes.length">
      <!-- 底层: 原始几何形状 (半透明, 不覆盖检测框) -->
      <template v-for="(s, i) in shapes" :key="`sh-${i}`">
        <polygon v-if="isAreaType(s.type)" :points="svgPoints(s.points)"
                 :data-shape-type="s.type" :data-shape-source="s.source"
                 :fill="shapeFill(s.type)" :stroke="SHAPE_STYLES[s.type]?.stroke"
                 :stroke-dasharray="SHAPE_STYLES[s.type]?.dashed ? '2 1.2' : 'none'"
                 class="ann-shape-poly" />
        <g v-else :data-shape-type="s.type" :data-shape-source="s.source">
          <polyline v-if="s.points.length >= 2" :points="svgPoints(s.points)"
                    :stroke="SHAPE_STYLES[s.type]?.stroke" class="ann-shape-line" />
          <circle v-for="(p, pi) in (s.type === 'point' ? s.points.slice(0, 1) : s.points)"
                  :key="`pt-${pi}`" :cx="p[0] * 100" :cy="p[1] * 100" r="0.7"
                  :fill="SHAPE_STYLES[s.type]?.stroke" />
          <path v-for="(ar, ai) in lineArrows(s)" :key="`ar-${ai}`" :d="arrowPath(ar)"
                :fill="SHAPE_STYLES[s.type]?.stroke" />
        </g>
        <text v-if="s.name" :x="s.points[0][0] * 100 + 0.8" :y="s.points[0][1] * 100 - 0.8"
              class="ann-shape-name">{{ s.name }}</text>
      </template>
      <!-- 上层: 多目标全量标注 (触发目标 danger 红, 其余类别色) -->
      <g v-for="(d, i) in detBoxes" :key="`det-${i}`" class="ann-det"
         :data-det-label="d.label" :data-det-danger="d.danger">
        <rect :x="d.x * 100" :y="d.y * 100" :width="d.w * 100" :height="d.h * 100"
              :stroke="detColor(d)" class="ann-det-rect" />
        <text :x="Math.max(1, d.x * 100)" :y="Math.max(2.5, d.y * 100 - 1)"
              class="ann-det-text" :fill="detColor(d)">{{ d.label }} {{ Math.round(d.confidence * 100) }}%</text>
      </g>
      <!-- 回退: 无 detections 数组的旧告警单 bbox 桓星红框 -->
      <g v-if="!detBoxes.length && box" class="ann-det" data-det-danger="true">
        <rect :x="box[0] * 100" :y="box[1] * 100"
              :width="(box[2] - box[0]) * 100" :height="(box[3] - box[1]) * 100"
              class="ann-det-rect" stroke="#f56c6c" />
        <text v-if="label" :x="Math.max(1, box[0] * 100)" :y="Math.max(2.5, box[1] * 100 - 1)"
              class="ann-det-text" fill="#f56c6c">{{ label }}</text>
      </g>
    </svg>
    <!-- [FEAT 2026-09-02] 下载标注图: 导出原始分辨率合成图 (快照+检测框标注) PNG,
         与报警弹窗 AlarmSnapshot 下载能力同构 -->
    <button v-if="src" class="ann-download" :title="t('perimeter.events.downloadAnnotated', '导出带检测框标注的快照原图 (PNG)')" @click="downloadAnnotated">
      {{ t('perimeter.events.downloadAnnotatedBtn', '⬇ 下载标注图') }}
    </button>
    <!-- [FEAT 2026-09-02] 全屏预览: 显式按钮触发 el-image-viewer (teleported 防
         详情抽屉 z-index 遮挡), 左上角与下载按钮对称 -->
    <button v-if="src" class="ann-fullscreen" :title="t('perimeter.events.fullscreen', '全屏预览')" @click="viewerVisible = true">
      {{ t('perimeter.events.fullscreenBtn', '⛶ 全屏') }}
    </button>
    <el-image-viewer
      v-if="viewerVisible"
      :url-list="[src]"
      teleported
      hide-on-click-modal
      @close="viewerVisible = false"
    />
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
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  CLASS_COLORS, SHAPE_STYLES, drawDetsOnCtx, drawShapesOnCtx, downloadPngWithFallback,
  markTriggerDet, parseDetections, useAlarmShapes,
  type OverlayShape, type OverlayShapeType, type ParsedDet,
} from '@/composables/useAlarmShapes'

const { t } = useI18n()

// 图像自然尺寸 (检测直报链 detections 为原图像素坐标, 归一化基准;
// 真机 1920x1080 快照实证)
const rootRef = ref<HTMLElement>()
const imgNat = ref<{ w: number; h: number }>({ w: 0, h: 0 })
/** [FEAT 2026-09-02] 全屏预览开关 (el-image-viewer v-if 挂载) */
const viewerVisible = ref(false)
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
  /** normalize 后告警 metadata (bbox/target_label; 兑底合并在 EventsView 完成) */
  metadata?: Record<string, unknown>
  /** [FEAT 2026-09-04] 触发源通道 (GB28181 编码, _ch0 后缀可):
   *  形状叠加数据源定位; 缺省时兑底读 metadata.algo_id */
  channelId?: string
  /** [FEAT 2026-09-04] 触发算法 id (区域库回退链匹配) */
  algoId?: string
}>()

/** [FEAT 2026-09-04] 原始几何形状叠加: 两级数据源 + 30s 模块级缓存 */
const { shapes, load: loadShapes } = useAlarmShapes()
const effAlgoId = computed(() => props.algoId
  || String((props.metadata as Record<string, unknown>)?.algo_id ?? ''))
watch(
  [() => props.channelId, effAlgoId, () => (props.metadata as any)?.alarm_shapes],
  ([ch, algo, snap]) => {
    // ⓪ alarm_shapes: 告警自包含快照 (插件上报时冻结), 优先于规则链/区域库
    loadShapes(ch, algo, snap).catch(() => {})
  },
  { immediate: true },
)

/** 多目标全量标注: metadata.detections 遍历 (触发目标 danger 红, 其余类别色);
 *  像素坐标 (任一 >1) 按图像自然尺寸归一, 未加载完先不显示 (@load 后重算) */
const detBoxes = computed<ParsedDet[]>(() => {
  const m = (props.metadata || {}) as Record<string, unknown>
  const dets = Array.isArray(m.detections) ? (m.detections as any[]) : []
  if (!dets.length) return []
  const parsed = parseDetections(dets, imgNat.value, label.value || 'target')
  return markTriggerDet(parsed, box.value, label.value)
})

/** 检测框颜色 (触发目标危险色 #f56c6c / 其余 CLASS_COLORS 类别色) */
function detColor(d: ParsedDet): string {
  return d.danger ? '#f56c6c' : (CLASS_COLORS[d.label] || '#FF3D71')
}

// ── SVG 形状层 helper (viewBox 0-100 归一化坐标映射) ──
const isAreaType = (t: OverlayShapeType) =>
  ['detection_zone', 'exclusion_zone', 'counting_zone', 'rectangle'].includes(t)
function shapeFill(t: OverlayShapeType): string {
  return SHAPE_STYLES[t]?.fill !== 'none' ? (SHAPE_STYLES[t]?.fill || 'transparent') : 'none'
}
function svgPoints(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(' ')
}
interface SvgArrow { x: number; y: number; angle: number }
/** 线类方向箭头 (tripwire: both=中点双向 / a_to_b=B 端 / b_to_a=A 端;
 *  directional_line 默认 B 端; 与 canvas 版 drawShapesOnCtx 同语义) */
function lineArrows(s: OverlayShape): SvgArrow[] {
  if (s.points.length < 2) return []
  const [a, b] = [s.points[0], s.points[s.points.length - 1]]
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
  const A = { x: a[0] * 100, y: a[1] * 100 }
  const B = { x: b[0] * 100, y: b[1] * 100 }
  const dir = s.direction || (s.type === 'directional_line' ? 'a_to_b' : '')
  if (dir === 'both') {
    const m = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
    return [
      { x: m.x + 1.6 * Math.cos(angle), y: m.y + 1.6 * Math.sin(angle), angle },
      { x: m.x - 1.6 * Math.cos(angle), y: m.y - 1.6 * Math.sin(angle), angle: angle + Math.PI },
    ]
  }
  if (dir === 'b_to_a') return [{ x: A.x, y: A.y, angle: angle + Math.PI }]
  if (dir) return [{ x: B.x, y: B.y, angle }]
  if (s.type === 'directional_line') return [{ x: B.x, y: B.y, angle }]
  return []
}
function arrowPath(ar: SvgArrow): string {
  const size = 2.2
  const p1 = { x: ar.x - size * Math.cos(ar.angle - 0.42), y: ar.y - size * Math.sin(ar.angle - 0.42) }
  const p2 = { x: ar.x - size * Math.cos(ar.angle + 0.42), y: ar.y - size * Math.sin(ar.angle + 0.42) }
  return `M ${ar.x.toFixed(2)} ${ar.y.toFixed(2)} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`
}

/** 归一化检测框 [x1,y1,x2,y2]; 防御式校验 (缺失/越界/退化一律不渲染)。
 *  [vp6 收尾补测 2026-09-01] 检测直报链兜底: metadata.bbox 缺失时回退
 *  detections[0] / 数组形态 metadata 首元素 (原图像素坐标 x1/y1/x2/y2),
 *  任一坐标 >1 判像素 → 按图像自然尺寸归一化 (未加载完先不出框, @load 后重算) */
const box = computed<number[] | null>(() => {
  // [FIX 2026-09-04] 真正实现注释声称的「数组形态 metadata 首元素」兑底:
  //   AlarmDispatcher 直报链 (尾随/聚集/入侵等) metadata 为数组 [{bbox,...}],
  //   此前仅 detections[0]/m.x1 两级兑底取不到 → 标注恒空 (各调用方已修,
  //   此处终端兑底保证未来新链路不再断)。
  let m = (props.metadata || {}) as Record<string, unknown>
  if (Array.isArray(m) || (m[0] && typeof m[0] === 'object' && !('bbox' in m))) {
    m = m[0] as Record<string, unknown>
  }
  if (!m || typeof m !== 'object') return null
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
  let m = (props.metadata || {}) as Record<string, unknown>
  if (Array.isArray(m)) m = (m[0] ?? {}) as Record<string, unknown>
  const v = m.target_label ?? m.targetLabel ?? m.class_name
  return typeof v === 'string' && v.trim() ? v.trim() : ''
})


/** [FEAT 2026-09-02 → 2026-09-04 升级] 下载标注图: 离屏 canvas 按快照原始分辨率
 *  合成 (原图 + 原始几何形状 + 全部目标检测框), 屏幕渲染同源同视觉
 *  (drawShapesOnCtx/drawDetsOnCtx 共用)。无 detections 回退单框。
 *  跨域污染时降级为「标注层 + 原图」分别导出 */
function downloadAnnotated() {
  const img = rootRef.value?.querySelector('img') as HTMLImageElement | null
  if (!img || !img.naturalWidth) {
    ElMessage.warning('快照尚未加载完成')
    return
  }
  const build = (withImage: boolean) => {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (ctx) {
      if (withImage) ctx.drawImage(img, 0, 0)
      const scale = Math.max(1, canvas.width / 640)
      if (shapes.value.length) drawShapesOnCtx(ctx, shapes.value, canvas.width, canvas.height, scale)
      if (detBoxes.value.length) {
        drawDetsOnCtx(ctx, detBoxes.value, canvas.width, canvas.height, scale)
      } else {
        const b = box.value
        if (b) {
          const x = b[0] * canvas.width
          const y = b[1] * canvas.height
          const w = (b[2] - b[0]) * canvas.width
          const h = (b[3] - b[1]) * canvas.height
          ctx.strokeStyle = '#f56c6c'
          ctx.lineWidth = 2 * scale
          ctx.strokeRect(x, y, w, h)
          const text = label.value
          if (text) {
            ctx.font = `bold ${Math.round(12 * scale)}px sans-serif`
            const tw = ctx.measureText(text).width + 12 * scale
            const th = 20 * scale
            ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'
            ctx.fillRect(x, y - th, tw, th)
            ctx.fillStyle = '#fff'
            ctx.fillText(text, x + 6 * scale, y - 5 * scale)
          }
        }
      }
    }
    return canvas
  }
  downloadPngWithFallback(() => build(true), () => build(false), props.src, 'event-annotated')
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
/* [FEAT 2026-09-04] 形状层: 半透明填充+描边 (排除区/计数区虚线区分),
   vector-effect 防非均匀缩放描边变形 (对齐 ann-rect 语义) */
.ann-shape-poly {
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
  fill-opacity: 1;
}
.ann-shape-line {
  fill: none;
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}
.ann-shape-name {
  font-size: 2.8px;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.75);
  stroke-width: 0.7px;
  fill: #fff;
  pointer-events: none;
}
/* [FEAT 2026-09-04] 多目标层: 触发目标 danger 红, 其余类别色; 文字黑描边白填 */
.ann-det-rect {
  fill: transparent;
  stroke-width: 1.6;
  vector-effect: non-scaling-stroke;
}
.ann-det-text {
  font-size: 3.2px;
  font-weight: bold;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.65);
  stroke-width: 0.6px;
  pointer-events: none;
}
/* [FEAT 2026-09-02] 下载标注图悬浮按钮 */
.ann-download {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
  transition: background 0.2s;
}
/* [FEAT 2026-09-02] 全屏预览悬浮按钮: 左上角与下载按钮对称, 同款悬浮风格 */
.ann-fullscreen {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
  transition: background 0.2s;
}
.ann-fullscreen:hover {
  background: rgba(0, 0, 0, 0.78);
}
.ann-download:hover {
  background: rgba(0, 0, 0, 0.78);
}
</style>
