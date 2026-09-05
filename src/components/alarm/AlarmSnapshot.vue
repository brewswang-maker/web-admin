<template>
  <div class="alarm-snapshot" ref="containerRef">
    <!-- [fix 2026-09-01 vp6 收尾] contain → fill: canvas overlay inset:0 铺满容器,
         contain 留边 (容器宽高比≠图像比) 时归一化坐标画框必然偏移; fill 拉伸铺满
         与 canvas 同形变恒对齐 (对齐 SnapshotAnnotated/LiveView 标注语义) -->
    <el-image
      v-if="imageUrl"
      :src="imageUrl"
      fit="fill"
      class="alarm-snapshot__image"
      :preview-src-list="[imageUrl]"
      :preview-teleported="true"
      @load="onImageLoad"
      @error="onImageError"
    >
      <template #error>
        <div class="alarm-snapshot__empty">
          <span>快照加载失败</span>
        </div>
      </template>
    </el-image>
    <div v-else class="alarm-snapshot__empty">
      <span>📸 无快照</span>
    </div>
    <!-- Detection boxes + 原始几何形状 overlay
         [FEAT 2026-09-04] data-shapes/data-boxes 供 DOM 探针验证渲染计数 -->
    <canvas
      v-if="imageUrl && (normalizedBoxes.length || shapes.length)"
      ref="canvasRef"
      class="alarm-snapshot__canvas"
      :data-shapes="shapes.length"
      :data-boxes="normalizedBoxes.length"
    />
    <!-- [FEAT 2026-09-02] 下载标注图: 导出原始分辨率合成图 (快照+检测框标注) PNG -->
    <button
      v-if="imageUrl"
      class="alarm-snapshot__download"
      title="导出带检测框标注的快照原图 (PNG)"
      @click="downloadAnnotated"
    >
      ⬇ 下载标注图
    </button>
    <!-- [FEAT 2026-09-02] 全屏预览: 显式按钮触发 el-image-viewer (teleported 防
         报警弹窗 el-dialog z-index 遮挡), 左上角与下载按钮对称 -->
    <button
      v-if="imageUrl"
      class="alarm-snapshot__fullscreen"
      title="全屏预览"
      @click="viewerVisible = true"
    >
      ⛶ 全屏
    </button>
    <el-image-viewer
      v-if="viewerVisible"
      :url-list="[imageUrl]"
      teleported
      hide-on-click-modal
      @close="viewerVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * AlarmSnapshot.vue — 告警快照 + 检测框叠加
 *
 * 在告警快照图片上叠加 Canvas 绘制的 detection boxes。
 * 坐标从归一化 (0-1) 转为像素坐标。
 */
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  drawDetsOnCtx, drawShapesOnCtx, downloadPngWithFallback,
  markTriggerDet, parseDetections, useAlarmShapes, type ParsedDet,
} from '@/composables/useAlarmShapes'

/** [FEAT 2026-09-02] 全屏预览开关 (el-image-viewer v-if 挂载) */
const viewerVisible = ref(false)

interface DetectionBox {
  x: number; y: number; w: number; h: number
  label: string; confidence: number
}

const props = defineProps<{
  imageUrl: string
  detectionBoxes?: DetectionBox[]
  targetLabel?: string
  /** 原始 bbox 格式 [x1,y1,x2,y2] 归一化坐标 */
  bbox?: number[]
  /** [任务4] 告警 metadata.detections 完整数组: 支持多检测目标叠加红框,
   *   每项可为 {x1,y1,x2,y2} / {x,y,w,h} / [x1,y1,x2,y2] 三种形态 */
  detections?: any[]
  /** [任务4] 显式 true 时全部检测框强制告警红; 默认 (缺省) 触发目标红 +
   *   其余类别调色板 (与事件详情抽屉视觉一致) */
  dangerColor?: boolean
  /** [FEAT 2026-09-04] 触发源通道 (GB28181 编码, _ch0 后缀可):
   *  形状叠加 (检测区/绊线/方向线/计数区) 数据源定位 */
  channelId?: string
  /** [FEAT 2026-09-04] 触发算法 id (metadata.algo_id): 区域库回退链匹配 */
  algoId?: string
  /** [FEAT 2026-09-04 告警自包含] metadata.alarm_shapes: 插件上报时冻结的
   *  当时生效区域几何 (区域库后续增删不影响历史告警取证), 非空时最高
   *  优先级消费, 绕过规则链/区域库回退与共享缓存 */
  alarmShapes?: unknown[]
}>()

const containerRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
// 图像自然尺寸 (像素坐标 bbox 归一化基准)
const imageSize = ref<{ w: number; h: number }>({ w: 0, h: 0 })

/** [FEAT 2026-09-04] 原始几何形状叠加 (检测区/排除区/绊线/方向线/计数区):
 *  数据源两级链 (规则 roi_shapes_json → 区域库), 详见 useAlarmShapes.ts */
const { shapes, load: loadShapes } = useAlarmShapes()
watch(
  [() => props.channelId, () => props.algoId, () => props.alarmShapes],
  ([ch, algo, snap]) => {
    loadShapes(ch, algo, snap).then(() => nextTick(drawBoxes)).catch(() => {})
  },
  { immediate: true },
)

/** 触发框归一化 [x1,y1,x2,y2] (像素坐标按图像自然尺寸归一; 未就绪返回 null) */
const normBBox = computed<number[] | null>(() => {
  const b = props.bbox
  if (!Array.isArray(b) || b.length < 4) return null
  let [x1, y1, x2, y2] = b
  // [vp6-P1.3 2026-09-01] 检测直报链兑底: metadata.detections 为原图像素坐标
  //   (真机 1920x1080 实证), 任一坐标 >1 判定为像素 → 按图像自然尺寸归一化;
  //   自然尺寸未就绪时先不出框, onImageLoad 后重算。
  if (b.some((v) => v > 1)) {
    const { w, h } = imageSize.value
    if (!w || !h) return null
    x1 /= w; y1 /= h; x2 /= w; y2 /= h
  }
  return [x1, y1, x2, y2]
})

const normalizedBoxes = computed<ParsedDet[]>(() => {
  // 形态0: 外部显式 detectionBoxes (整框视为触发目标)
  if (props.detectionBoxes?.length) {
    return props.detectionBoxes.map((b) => ({
      x: b.x, y: b.y, w: b.w, h: b.h,
      label: b.label, confidence: b.confidence, danger: true,
    }))
  }
  // 形态1: metadata.detections 多目标全量 (触发目标红 + 其余类别调色板)
  if (props.detections && props.detections.length) {
    const dets = parseDetections(props.detections, imageSize.value, props.targetLabel || 'target')
    return markTriggerDet(dets, normBBox.value, props.targetLabel)
  }
  // 形态2: bbox 单框回退
  const nb = normBBox.value
  if (!nb) return []
  return [{
    x: nb[0], y: nb[1],
    w: nb[2] - nb[0], h: nb[3] - nb[1],
    label: props.targetLabel || 'target',
    confidence: 1,
    danger: true,
  }]
})

function drawBoxes() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return
  if (!normalizedBoxes.value.length && !shapes.value.length) return

  const rect = container.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  canvas.width = rect.width
  canvas.height = rect.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // 底层: 原始检测区/绊线/方向线/计数区 (半透明, 不覆盖检测框标注)
  if (shapes.value.length) {
    drawShapesOnCtx(ctx, shapes.value, canvas.width, canvas.height, 1)
  }
  // 上层: 检测框 (触发目标危险色 #f56c6c + 其余 CLASS_COLORS 类别色;
  //   dangerColor 显式 true 时保持旧全红行为)
  drawDetsOnCtx(ctx, normalizedBoxes.value, canvas.width, canvas.height, 1, props.dangerColor === true)
}

// 图片加载/错误处理
function onImageLoad() {
  // el-image 内部真实 <img> 已挂载, 读自然尺寸供像素 bbox 归一化
  const img = containerRef.value?.querySelector('img') as HTMLImageElement | null
  if (img?.naturalWidth && img?.naturalHeight) {
    imageSize.value = { w: img.naturalWidth, h: img.naturalHeight }
  }
  nextTick(() => drawBoxes())
}

// [fix 2026-09-01 真机探针] 绘制时机兜底: 弹窗默认"实时视频" tab, 快照 pane
//   隐藏时容器 0×0 → @load 触发的 drawBoxes 画到 0 尺寸 canvas 上 (真机两次
//   弹窗 canvas width/height=0 实证); 容器获得非零尺寸 (切 tab 挂载/窗口缩放)
//   时 ResizeObserver 重绘。0 尺寸时跳过防空绘。
let boxResizeObserver: ResizeObserver | null = null
onMounted(() => {
  if (!containerRef.value || typeof ResizeObserver === 'undefined') return
  boxResizeObserver = new ResizeObserver(() => {
    const el = containerRef.value
    if (el && el.clientWidth > 0 && el.clientHeight > 0) drawBoxes()
  })
  boxResizeObserver.observe(containerRef.value)
})
onBeforeUnmount(() => {
  boxResizeObserver?.disconnect()
  boxResizeObserver = null
})

function onImageError() {
  console.warn('[AlarmSnapshot] Image failed to load:', props.imageUrl)
}

/** [FEAT 2026-09-02 → 2026-09-04 升级] 下载标注图: 离屏 canvas 按快照原始分辨率
 *  合成 (原图 + 原始几何形状 + 全部检测框), 与屏幕渲染同源同视觉
 *  (drawShapesOnCtx/drawDetsOnCtx 共用), 线宽/字号随分辨率缩放。
 *  跨域污染时降级为「标注层 + 原图」分别导出 */
function downloadAnnotated() {
  const img = containerRef.value?.querySelector('img') as HTMLImageElement | null
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
      drawDetsOnCtx(ctx, normalizedBoxes.value, canvas.width, canvas.height, scale, props.dangerColor === true)
    }
    return canvas
  }
  downloadPngWithFallback(() => build(true), () => build(false), props.imageUrl, 'alarm-annotated')
}
</script>

<style scoped>
.alarm-snapshot {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #262626;
}
.alarm-snapshot__image {
  width: 100%;
  height: 100%;
  border-radius: 0;
  background: #262626;
}
.alarm-snapshot__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
/* [FEAT 2026-09-02] 下载标注图悬浮按钮: 右上角常驻, 高于标注 canvas 与预览层 */
.alarm-snapshot__download {
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
.alarm-snapshot__download:hover {
  background: rgba(0, 0, 0, 0.78);
}
/* [FEAT 2026-09-02] 全屏预览悬浮按钮: 左上角与下载按钮对称, 同款悬浮风格 */
.alarm-snapshot__fullscreen {
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
.alarm-snapshot__fullscreen:hover {
  background: rgba(0, 0, 0, 0.78);
}
.alarm-snapshot__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: #AADDFF;
  font-size: 14px;
}
</style>
