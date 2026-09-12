<template>
  <div class="roi-viewer">
    <canvas ref="canvasRef" :width="canvasWidth" :height="canvasHeight" />
    <div v-if="shapes.length === 0" class="roi-viewer__empty">暂无 ROI 图形</div>
  </div>
</template>

<script setup lang="ts">
/**
 * RoiViewer.vue — ROI 只读查看画布 (算法查看页 / 查看 ROI 弹窗)
 *
 * [algo-view-readonly 2026-09-12] 配合「算法配置 → 算法查看」全面只读化:
 *   全部绘制入口已收敛到事件规则页 (区域/绊线/通道), 本组件只负责把
 *   已保存的 ROI 渲染到快照底图上供浏览 — 无任何编辑交互 (无工具条/
 *   无点击落点/无列表操作)。
 *   - 绘制函数复用 useRoiCanvas (与 RoiPolygonEditor/TripwireEditor
 *     同源, 颜色/线型/箭头观感一致)
 *   - 坐标域兼容: 检测区域库写 1920×1080 像素基准 (镜像直写实锚);
 *     绊线/通道写 [0,1] 归一化 (tw-coord-domain 双形态先例) —
 *     统一探测归一 (>1.5 视为像素域 → ÷1920/1080)。
 */
import { onMounted, ref, watch } from 'vue'
import {
  drawPolygon, drawTripwire,
  RoiDirection, type RoiDrawOptions,
} from '@/composables/useRoiCanvas'

const props = withDefaults(defineProps<{
  /** 背景图 URL (相机快照; 缺省深色底) */
  backgroundImageUrl?: string
  canvasWidth?: number
  canvasHeight?: number
  /** 只读图形列表: polygon=多边形区 / line=线段 (绊线) */
  shapes?: Array<{
    kind: 'polygon' | 'line'
    /** 扁平坐标 [x1,y1,x2,y2,...]; line 为 [ax,ay,bx,by] */
    points: number[]
    color?: string
    /** polygon 填充 (缺省 color+26 半透明) */
    fill?: string
    /** line 方向箭头 (both/a_to_b/b_to_a) */
    direction?: string
    label?: string
  }>
}>(), {
  canvasWidth: 720,
  canvasHeight: 405,
  shapes: () => [],
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
// 背景图缓存: 同 TripwireEditor 先例 — imageUrl 变化时加载一次并缓存,
// onload 后重绘 (绘制顺序恒定: 先底图再图形)
const bgImg = ref<HTMLImageElement | null>(null)

watch(() => props.backgroundImageUrl, (url) => {
  bgImg.value = null
  if (!url) { draw(); return }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { bgImg.value = img; draw() }
  img.src = url
}, { immediate: true })

watch(() => props.shapes, draw, { deep: true })

onMounted(draw)

/** 坐标域探测归一: >1.5 视为 1920×1080 像素域 → ÷base; 否则本身即 [0,1] */
function normCoord(v: number, base: number): number {
  return v > 1.5 ? v / base : v
}

function toCanvas(points: number[]): number[] {
  const canvas = canvasRef.value
  if (!canvas) return []
  const out: number[] = []
  for (let i = 0; i + 1 < points.length; i += 2) {
    out.push(
      normCoord(points[i], 1920) * canvas.width,
      normCoord(points[i + 1], 1080) * canvas.height,
    )
  }
  return out
}

const DIR_MAP: Record<string, RoiDirection> = {
  both: RoiDirection.BOTH,
  a_to_b: RoiDirection.A_TO_B,
  b_to_a: RoiDirection.B_TO_A,
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (bgImg.value) {
    ctx.drawImage(bgImg.value, 0, 0, canvas.width, canvas.height)
  } else {
    ctx.fillStyle = '#1c1c1e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  for (const s of props.shapes) {
    const pts = toCanvas(s.points)
    if (pts.length < 4) continue
    const color = s.color || '#0F9D58'
    const opts: RoiDrawOptions = {
      stroke: color,
      direction: s.direction ? DIR_MAP[s.direction] : undefined,
      label: s.label,
    }
    if (s.kind === 'line') {
      drawTripwire(ctx, pts, opts)
    } else {
      drawPolygon(ctx, pts, { ...opts, fill: s.fill || color + '26', pointRadius: 3 })
    }
  }
}
</script>

<style scoped>
.roi-viewer {
  position: relative;
  width: 100%;
  line-height: 0;
  background: #1c1c1e;
  border-radius: 4px;
  overflow: hidden;
}
.roi-viewer canvas {
  width: 100%;
  height: auto;
  display: block;
}
.roi-viewer__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  line-height: 1.4;
  pointer-events: none;
}
</style>
