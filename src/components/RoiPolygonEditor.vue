<template>
  <div class="roi-editor">
    <!-- 工具栏 -->
    <div class="roi-toolbar">
      <el-radio-group v-model="currentType" size="small" :disabled="disabled">
        <el-radio-button value="detection_zone">检测区域</el-radio-button>
        <el-radio-button value="exclusion_zone">排除区域</el-radio-button>
        <el-radio-button value="tripwire">绊线</el-radio-button>
        <el-radio-button value="directional_line">方向线</el-radio-button>
        <el-radio-button value="counting_zone">计数区域</el-radio-button>
      </el-radio-group>

      <div class="roi-toolbar__actions">
        <el-button size="small" @click="toggleDrawing" :disabled="disabled">
          {{ drawing ? '完成绘制' : '开始绘制' }}
        </el-button>
        <el-button size="small" text @click="clearCurrentPoints" :disabled="disabled || points.length === 0">
          清除当前
        </el-button>
        <el-button size="small" text @click="confirmAndAdd" :disabled="disabled || points.length < minPoints" type="primary">
          确认添加
        </el-button>
      </div>

      <div class="roi-toolbar__snapshot" v-if="deviceId">
        <el-button size="small" @click="fetchSnapshot" :loading="snapshotLoading" text>
          获取快照
        </el-button>
      </div>

      <!-- 方向选择 (仅方向线) -->
      <div class="roi-toolbar__direction" v-if="currentType === 'directional_line'">
        <el-select v-model="currentDirection" size="small" style="width: 120px">
          <el-option label="双向" value="both" />
          <el-option label="A→B" value="a_to_b" />
          <el-option label="B→A" value="b_to_a" />
        </el-select>
      </div>
    </div>

    <!-- ROI列表 -->
    <div class="roi-list" v-if="rois.length > 0">
      <div
        v-for="(roi, index) in rois"
        :key="roi.roi_id"
        :class="['roi-list__item', { 'roi-list__item--active': selectedRoiIndex === index }]"
        @click="selectRoi(index)"
      >
        <span class="roi-list__type-badge" :style="{ background: typeColor(roi.roi_type) }">
          {{ typeLabel(roi.roi_type) }}
        </span>
        <el-input
          v-model="roi.roi_name"
          size="small"
          class="roi-list__name"
          @click.stop
          :disabled="disabled"
        />
        <el-switch
          v-model="roi.is_active"
          size="small"
          @change="emitRois"
          :disabled="disabled"
        />
        <el-button size="small" text type="danger" @click.stop="removeRoi(index)" :disabled="disabled">
          删除
        </el-button>
      </div>
    </div>

    <!-- Canvas -->
    <div class="roi-canvas-wrap" ref="canvasWrapRef">
      <canvas
        ref="canvasRef"
        :width="canvasWidth"
        :height="canvasHeight"
        :class="['roi-canvas', { 'roi-canvas--drawing': drawing }]"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @dblclick="onDoubleClick"
        @contextmenu.prevent="onRightClick"
      />
      <div class="roi-canvas__hint" v-if="drawing">
        {{ drawHint }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import {
  drawPolygon, drawTripwire, drawDirectionalLine, drawRectangle,
  normalizedToCanvas, canvasToNormalized, arrayToPoints, pointsToArray,
  RoiType, RoiDirection, type RoiData, type RoiDrawOptions,
} from '@/composables/useRoiCanvas'

const props = withDefaults(defineProps<{
  modelValue: RoiData[]
  backgroundImageUrl?: string
  /** 设备ID — 用于获取设备实时快照作为背景 */
  deviceId?: string
  /** 快照获取回调 */
  snapshotFetcher?: (deviceId: string) => Promise<string>
  normalizeWidth?: number
  normalizeHeight?: number
  canvasWidth?: number
  canvasHeight?: number
  disabled?: boolean
}>(), {
  normalizeWidth: 1920,
  normalizeHeight: 1080,
  canvasWidth: 640,
  canvasHeight: 360,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: RoiData[]]
  'update:backgroundImageUrl': [value: string]
}>()

const canvasRef = ref<HTMLCanvasElement>()
const canvasWrapRef = ref<HTMLDivElement>()
const drawing = ref(false)
const dragging = ref(false)
const points = ref<Array<{ x: number; y: number }>>([])
const bgImage = ref<HTMLImageElement | null>(null)
const rois = ref<RoiData[]>([])
const selectedRoiIndex = ref(-1)
const currentType = ref<RoiType>(RoiType.DETECTION_ZONE)
const currentDirection = ref<RoiDirection>(RoiDirection.BOTH)
const snapshotLoading = ref(false)

// 各类型所需最少点数
const minPoints = computed(() => {
  switch (currentType.value) {
    case RoiType.TRIPWIRE:
    case RoiType.DIRECTIONAL_LINE:
      return 2
    case RoiType.COUNTING_ZONE:
      return 2
    default: // 多边形类型
      return 3
  }
})

// 最多点数
const maxPoints = computed(() => {
  switch (currentType.value) {
    case RoiType.TRIPWIRE:
    case RoiType.DIRECTIONAL_LINE:
    case RoiType.COUNTING_ZONE:
      return 2
    default:
      return 20
  }
})

const drawHint = computed(() => {
  switch (currentType.value) {
    case RoiType.TRIPWIRE:
      return '点击两点绘制绊线，双击完成'
    case RoiType.DIRECTIONAL_LINE:
      return '点击两点绘制方向线，双击完成'
    case RoiType.COUNTING_ZONE:
      return '点击拖拽绘制矩形区域'
    default:
      return `点击绘制多边形顶点(${points.value.length}/${maxPoints.value})，双击闭合`
  }
})

// 类型颜色映射
function typeColor(type: RoiType): string {
  const map: Record<string, string> = {
    [RoiType.DETECTION_ZONE]: '#0F9D58',
    [RoiType.EXCLUSION_ZONE]: '#F44336',
    [RoiType.TRIPWIRE]: '#FF6D00',
    [RoiType.DIRECTIONAL_LINE]: '#2196F3',
    [RoiType.COUNTING_ZONE]: '#9C27B0',
  }
  return map[type] || '#666'
}

function typeLabel(type: RoiType): string {
  const map: Record<string, string> = {
    [RoiType.DETECTION_ZONE]: '检测',
    [RoiType.EXCLUSION_ZONE]: '排除',
    [RoiType.TRIPWIRE]: '绊线',
    [RoiType.DIRECTIONAL_LINE]: '方向',
    [RoiType.COUNTING_ZONE]: '计数',
  }
  return map[type] || '未知'
}

// 从 modelValue 初始化
watch(() => props.modelValue, (val) => {
  rois.value = val ? [...val] : []
  renderCanvas()
}, { immediate: true })

// 加载背景图
watch(() => props.backgroundImageUrl, async (url) => {
  if (!url) { bgImage.value = null; return }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { bgImage.value = img; renderCanvas() }
  img.onerror = () => { bgImage.value = null }
  img.src = url
}, { immediate: true })

// 设备快照获取
async function fetchSnapshot() {
  if (!props.deviceId || !props.snapshotFetcher) return
  snapshotLoading.value = true
  try {
    const url = await props.snapshotFetcher(props.deviceId)
    if (url) {
      emit('update:backgroundImageUrl', url)
    }
  } catch (e) {
    console.error('Failed to fetch snapshot:', e)
  } finally {
    snapshotLoading.value = false
  }
}

function toggleDrawing() {
  drawing.value = !drawing.value
  if (drawing.value) {
    points.value = []
    selectedRoiIndex.value = -1
    nextTick(() => renderCanvas())
  }
}

function clearCurrentPoints() {
  points.value = []
  renderCanvas()
}

function confirmAndAdd() {
  if (points.value.length < minPoints.value) return

  const roiId = `roi_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  const newRoi: RoiData = {
    roi_id: roiId,
    roi_name: `${typeLabel(currentType.value)} ${rois.value.length + 1}`,
    roi_type: currentType.value,
    polygon: pointsToArray(points.value),
    is_active: true,
    direction: currentType.value === RoiType.DIRECTIONAL_LINE ? currentDirection.value : undefined,
  }

  rois.value.push(newRoi)
  points.value = []
  drawing.value = false
  emitRois()
  renderCanvas()
}

function selectRoi(index: number) {
  selectedRoiIndex.value = index
  renderCanvas()
}

function removeRoi(index: number) {
  rois.value.splice(index, 1)
  if (selectedRoiIndex.value === index) selectedRoiIndex.value = -1
  else if (selectedRoiIndex.value > index) selectedRoiIndex.value--
  emitRois()
  renderCanvas()
}

function emitRois() {
  emit('update:modelValue', [...rois.value])
}

function getCanvasPoint(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const px = (e.clientX - rect.left) * scaleX
  const py = (e.clientY - rect.top) * scaleY
  return canvasToNormalized(
    { x: px, y: py },
    canvas.width, canvas.height,
    props.normalizeWidth, props.normalizeHeight,
  )
}

function onMouseDown(e: MouseEvent) {
  if (props.disabled || !drawing.value) return
  dragging.value = true
  const p = getCanvasPoint(e)
  if (p && points.value.length < maxPoints.value) {
    points.value.push(p)

    // 矩形只需两个点（对角），自动完成
    if (currentType.value === RoiType.COUNTING_ZONE && points.value.length === 2) {
      confirmAndAdd()
      return
    }

    // 绊线/方向线两个点自动完成
    if ((currentType.value === RoiType.TRIPWIRE || currentType.value === RoiType.DIRECTIONAL_LINE)
        && points.value.length === 2) {
      confirmAndAdd()
      return
    }

    renderCanvas()
  }
}

function onMouseMove(e: MouseEvent) {
  if (!dragging.value || !drawing.value) return
  const p = getCanvasPoint(e)
  if (p && points.value.length > 0) {
    renderCanvas(p)
  }
}

function onMouseUp() {
  dragging.value = false
}

function onDoubleClick() {
  if (drawing.value && points.value.length >= minPoints.value) {
    // 多边形：双击闭合，移除最后一个重复点
    if (currentType.value === RoiType.DETECTION_ZONE || currentType.value === RoiType.EXCLUSION_ZONE) {
      if (points.value.length > 3) {
        points.value.pop()
      }
    }
    confirmAndAdd()
  }
}

function onRightClick() {
  if (points.value.length > 0) {
    points.value.pop()
    renderCanvas()
  }
}

function renderCanvas(previewPoint?: { x: number; y: number }) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 绘制背景图
  if (bgImage.value) {
    ctx.drawImage(bgImage.value, 0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  } else {
    // 无背景图时显示网格
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 0.5
    const gridSize = 40
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
    }
  }

  // 绘制已确认的 ROI 列表
  for (let i = 0; i < rois.value.length; i++) {
    const roi = rois.value[i]
    const isSelected = i === selectedRoiIndex.value
    renderRoi(ctx, roi, isSelected ? 1.0 : (roi.is_active ? 0.8 : 0.4))
  }

  // 绘制正在绘制的 ROI 预览
  if (points.value.length > 0) {
    const previewRoi: RoiData = {
      roi_id: '_preview',
      roi_name: '绘制中...',
      roi_type: currentType.value,
      polygon: pointsToArray(points.value),
      is_active: true,
      direction: currentDirection.value,
    }

    ctx.globalAlpha = 0.7
    renderRoi(ctx, previewRoi, 0.7)
    ctx.globalAlpha = 1.0

    // 橡皮筋预览线
    if (previewPoint && points.value.length > 0) {
      const canvasPts = points.value.map(p =>
        normalizedToCanvas(p, canvas.width, canvas.height, props.normalizeWidth, props.normalizeHeight)
      )
      const previewCanvas = normalizedToCanvas(
        previewPoint, canvas.width, canvas.height, props.normalizeWidth, props.normalizeHeight,
      )
      ctx.beginPath()
      ctx.moveTo(canvasPts[canvasPts.length - 1].x, canvasPts[canvasPts.length - 1].y)
      ctx.lineTo(previewCanvas.x, previewCanvas.y)
      ctx.strokeStyle = typeColor(currentType.value) + '80'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
}

function renderRoi(ctx: CanvasRenderingContext2D, roi: RoiData, alpha: number) {
  const canvas = canvasRef.value
  if (!canvas) return

  ctx.globalAlpha = alpha

  // 归一化坐标转canvas像素
  const pts: number[] = []
  for (let i = 0; i < roi.polygon.length - 1; i += 2) {
    pts.push((roi.polygon[i] / props.normalizeWidth) * canvas.width)
    pts.push((roi.polygon[i + 1] / props.normalizeHeight) * canvas.height)
  }

  const color = typeColor(roi.roi_type)
  const opts: RoiDrawOptions = {
    label: roi.roi_name,
    direction: roi.direction,
    stroke: color,
  }

  switch (roi.roi_type) {
    case RoiType.DETECTION_ZONE:
      drawPolygon(ctx, pts, { ...opts, fill: color + '26' })
      break
    case RoiType.EXCLUSION_ZONE:
      drawPolygon(ctx, pts, { ...opts, stroke: '#F44336', fill: 'rgba(244,67,54,0.15)' })
      break
    case RoiType.TRIPWIRE:
      drawTripwire(ctx, pts, opts)
      break
    case RoiType.DIRECTIONAL_LINE:
      drawDirectionalLine(ctx, pts, opts)
      break
    case RoiType.COUNTING_ZONE:
      drawRectangle(ctx, pts, { ...opts, fill: 'rgba(156,39,176,0.15)' })
      break
    default:
      drawPolygon(ctx, pts, opts)
  }

  ctx.globalAlpha = 1.0
}
</script>

<style scoped>
.roi-editor {
  width: 100%;
}
.roi-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.roi-toolbar__actions {
  display: flex;
  gap: 4px;
}
.roi-toolbar__snapshot {
  margin-left: auto;
}
.roi-toolbar__direction {
  margin-left: 4px;
}
.roi-list {
  max-height: 160px;
  overflow-y: auto;
  margin-bottom: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.roi-list__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.roi-list__item:hover {
  background: var(--el-fill-color-light);
}
.roi-list__item--active {
  background: var(--el-fill-color);
}
.roi-list__type-badge {
  display: inline-block;
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}
.roi-list__name {
  flex: 1;
  min-width: 80px;
}
.roi-list__name :deep(.el-input__wrapper) {
  padding: 0 6px;
  box-shadow: none;
  background: transparent;
}
.roi-canvas-wrap {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
}
.roi-canvas {
  display: block;
  background: #111;
  width: 100%;
  height: auto;
}
.roi-canvas--drawing {
  cursor: crosshair;
}
.roi-canvas__hint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
}
</style>
