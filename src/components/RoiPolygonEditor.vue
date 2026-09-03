<template>
  <div class="roi-editor">
    <!-- 工具栏: 形状切换 (白名单由 types prop 决定) + 编辑操作 + 底图 -->
    <div class="roi-toolbar">
      <el-radio-group v-model="currentType" size="small" :disabled="disabled">
        <el-radio-button v-for="t in availableTypes" :key="t" :value="t">{{ typeButtonLabel(t) }}</el-radio-button>
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

      <!-- [FIX 2026-09-02] 编辑操作: 撤销/重做/清空/吸附 (对标海康 iVMS 工具栏范式) -->
      <div class="roi-toolbar__edit">
        <el-button size="small" text :disabled="disabled || !canUndo" title="撤销 (栈深 ≤50)" @click="undo">↶ 撤销</el-button>
        <el-button size="small" text :disabled="disabled || !canRedo" title="重做" @click="redo">↷ 重做</el-button>
        <el-button size="small" text :disabled="disabled || rois.length === 0" title="清空全部 ROI (可撤销)" @click="clearAll">清空</el-button>
        <el-button
          size="small" text :type="snapEnabled ? 'primary' : undefined"
          :disabled="disabled"
          title="绘制落点/拖动顶点吸附栅格"
          @click="snapEnabled = !snapEnabled"
        >⊞ 吸附</el-button>
      </div>

      <div class="roi-toolbar__snapshot">
        <el-button v-if="deviceId" size="small" @click="fetchSnapshot" :loading="snapshotLoading" text>
          获取快照
        </el-button>
        <!-- [FIX 2026-09-02] 导入本地底图 (地图/平面图叠加 ROI, 对标海康电子地图) -->
        <el-button size="small" text title="导入本地图片作为绘制底图 (仅当前编辑会话)" @click="fileInputRef?.click()">
          导入底图
        </el-button>
        <el-button v-if="backgroundImageUrl" size="small" text title="清除底图" @click="emit('update:backgroundImageUrl', '')">
          清除底图
        </el-button>
        <!-- [FEAT 2026-09-01] 导出标注结果: canvas 已合成背景+标注, 直接 toBlob 下载 PNG -->
        <el-button size="small" @click="downloadAnnotated" text title="导出当前画面与标注为 PNG 图片">
          下载标注图
        </el-button>
        <input ref="fileInputRef" type="file" accept="image/*" style="display: none" @change="onImportBackground" />
      </div>

      <!-- 方向选择 (绊线/方向线: [FIX 2026-09-02] 绊线也支持 A→B/B→A/双向, 对标海康绊线方向范式) -->
      <div class="roi-toolbar__direction" v-if="currentType === 'directional_line' || currentType === 'tripwire'">
        <el-select v-model="currentDirection" size="small" style="width: 120px">
          <el-option label="双向" value="both" />
          <el-option label="A→B" value="a_to_b" />
          <el-option label="B→A" value="b_to_a" />
        </el-select>
      </div>
    </div>

    <!-- ROI列表 (多 ROI: 独立命名 / 启用开关 / 删除) -->
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
        <!-- [FIX 2026-09-02] 绊线/方向线: 每条 ROI 独立方向切换 (对标海康每绊线独立设向),
             入撤销栈, 保存时随 roi_shapes_json 快照 + 绊线镜像链路生效 -->
        <el-select
          v-if="roi.roi_type === 'tripwire' || roi.roi_type === 'directional_line'"
          :model-value="roi.direction || 'both'"
          @update:model-value="(v: any) => onRoiDirectionChange(index, v)"
          size="small"
          class="roi-list__dir"
          :disabled="disabled"
        >
          <el-option label="双向" value="both" />
          <el-option label="A→B" value="a_to_b" />
          <el-option label="B→A" value="b_to_a" />
        </el-select>
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

    <!-- Canvas 区域: [FIX 2026-09-02] 绘制提示文字全部移出本区域 (data-drawing-no-hint
         属性留痕便于回归断言); 画布 DOM 子树内只有图形本身 (边线/顶点/控制点)。 -->
    <div class="roi-canvas-wrap" ref="canvasWrapRef" data-drawing-no-hint>
      <canvas
        ref="canvasRef"
        :width="canvasWidth"
        :height="canvasHeight"
        :class="['roi-canvas', { 'roi-canvas--drawing': drawing }]"
        tabindex="0"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @dblclick="onDoubleClick"
        @contextmenu.prevent="onRightClick"
        @keydown.delete="deleteSelectedRoi"
      />
    </div>

    <!-- [FIX 2026-09-02] 绘制提示独立 hint 区域 (画布外部状态栏):
         绘制态显示当前形状操作提示, 非绘制态显示编辑操作说明, 不再叠在画布上。 -->
    <div class="roi-statusbar">
      <span class="roi-statusbar__hint">{{ drawing ? drawHint : idleHint }}</span>
      <span class="roi-statusbar__meta">
        <template v-if="rois.length > 0">{{ rois.length }} 个区域</template>
        <template v-if="selectedRoiIndex >= 0 && rois[selectedRoiIndex]">已选「{{ rois[selectedRoiIndex].roi_name }}」</template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  drawPolygon, drawTripwire, drawDirectionalLine, drawRectangle, drawPoint, rectFromDiagonal,
  normalizedToCanvas, canvasToNormalized, pointsToArray,
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
  /** 可用 ROI 类型过滤 (RoiType 字符串数组, 缺省=全部)
   *  [FIX 2026-08-28] 联动规则页只支持多边形 ROI (后端空间条件仅做 pointInPolygon),
   *  绊线/方向线/计数区类型在那边不可生效 → 调用方传 types 限制可选
   *  [FIX 2026-09-02] 新增 rectangle / point 可选类型 (联动规则页四形状范式);
   *  未传 types 的旧调用方工具栏不变 (白名单机制)。 */
  types?: string[]
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
const fileInputRef = ref<HTMLInputElement>()
const drawing = ref(false)
const dragging = ref(false)
const points = ref<Array<{ x: number; y: number }>>([])
const bgImage = ref<HTMLImageElement | null>(null)
const rois = ref<RoiData[]>([])
const selectedRoiIndex = ref(-1)
const currentType = ref<RoiType>(RoiType.DETECTION_ZONE)
const currentDirection = ref<RoiDirection>(RoiDirection.BOTH)
const snapshotLoading = ref(false)

// [FIX 2026-09-02] 绘制态一次性 toast 标记 (提示移出画布后, 首次绘制给一次
// el-message, 不再持续占据画布)
const drawToastShown = ref(false)

// ── [FIX 2026-09-02] 撤销/重做栈 (快照式, 上限 50 ≥ 业界 20 步基准) ──
const history = ref<string[]>([])
const histIdx = ref(-1)
let lastEmittedSnap = ''
const canUndo = computed(() => histIdx.value > 0)
const canRedo = computed(() => histIdx.value < history.value.length - 1)

function snapshotOf(list: RoiData[]): string { return JSON.stringify(list) }
function resetHistory() {
  history.value = [snapshotOf(rois.value)]
  histIdx.value = 0
}
function pushHistory() {
  const snap = snapshotOf(rois.value)
  if (history.value[histIdx.value] === snap) return
  history.value = history.value.slice(0, histIdx.value + 1)
  history.value.push(snap)
  if (history.value.length > 50) history.value.shift()
  histIdx.value = history.value.length - 1
}
function restoreSnapshot() {
  try { rois.value = JSON.parse(history.value[histIdx.value]) } catch { return }
  if (selectedRoiIndex.value >= rois.value.length) selectedRoiIndex.value = rois.value.length - 1
  emitRois()
  renderCanvas()
}
function undo() { if (canUndo.value) { histIdx.value--; restoreSnapshot() } }
function redo() { if (canRedo.value) { histIdx.value++; restoreSnapshot() } }

// ── [FIX 2026-09-02] 栅格吸附 (开启后绘制落点/顶点拖动对齐 normalize/96 栅格) ──
const snapEnabled = ref(false)
function snapPoint(p: { x: number; y: number }): { x: number; y: number } {
  if (!snapEnabled.value) return p
  const gx = props.normalizeWidth / 96
  const gy = props.normalizeHeight / 96
  return { x: Math.round(p.x / gx) * gx, y: Math.round(p.y / gy) * gy }
}

// ── [FIX 2026-09-02] 矩形拖拽绘制态 (anchor + mouseup 展开 4 顶点) ──
const rectAnchor = ref<{ x: number; y: number } | null>(null)

// ── [FIX 2026-09-02] 已确认 ROI 顶点拖动 (非绘制态编辑) ──
const vertexDrag = ref<{ roiIdx: number; vIdx: number } | null>(null)

// 类型过滤: types prop 未传 = 默认 5 类 (旧调用方不变); 传入时取交集于
// RoiType 全集 ([FIX 2026-09-02] 原实现从 ALL_TYPES 过滤导致 rectangle/point
// 显式传入也永不可见 — 白名单应允许任何合法 RoiType)
const ALL_TYPES: RoiType[] = [
  RoiType.DETECTION_ZONE, RoiType.EXCLUSION_ZONE, RoiType.TRIPWIRE,
  RoiType.DIRECTIONAL_LINE, RoiType.COUNTING_ZONE,
]
const VALID_TYPES = Object.values(RoiType) as string[]
const availableTypes = computed<RoiType[]>(() => {
  if (!props.types || props.types.length === 0) return ALL_TYPES
  return props.types.filter(t => VALID_TYPES.includes(t)) as RoiType[]
})
watch(availableTypes, list => {
  if (list.length && !list.includes(currentType.value)) currentType.value = list[0]
}, { immediate: true })

// 各类型所需最少点数 ([2026-09-02] point=1 / rectangle=2 拖拽完成)
const minPoints = computed(() => {
  switch (currentType.value) {
    case RoiType.POINT:
      return 1
    case RoiType.TRIPWIRE:
    case RoiType.DIRECTIONAL_LINE:
    case RoiType.RECTANGLE:
    case RoiType.COUNTING_ZONE:
      return 2
    default: // 多边形类型
      return 3
  }
})

// 最多点数
const maxPoints = computed(() => {
  switch (currentType.value) {
    case RoiType.POINT:
      return 1
    case RoiType.TRIPWIRE:
    case RoiType.DIRECTIONAL_LINE:
    case RoiType.RECTANGLE:
    case RoiType.COUNTING_ZONE:
      return 2
    default:
      return 20
  }
})

const drawHint = computed(() => {
  switch (currentType.value) {
    case RoiType.TRIPWIRE:
      return '依次点击 A、B 两点完成绊线（右键回退）'
    case RoiType.DIRECTIONAL_LINE:
      return '依次点击 A、B 两点绘制方向线'
    case RoiType.COUNTING_ZONE:
      return '点击拖拽绘制矩形区域，松手自动完成'
    case RoiType.RECTANGLE:
      return '按住拖拽对角两点，松手完成矩形'
    case RoiType.POINT:
      return '单击放置关注点'
    default:
      return `单击绘制多边形顶点(${points.value.length}/${maxPoints.value})，双击闭合；右键回退一点`
  }
})

// 非绘制态状态栏提示 (画布外部)
const idleHint = computed(() => {
  if (rois.value.length === 0) return '点击画布任意位置开始绘制；可先「获取快照/导入底图」作参考'
  return '拖动顶点可微调（矩形拖角保持矩形）；右键顶点删除；Del 键删除选中区域；点画布空白处开始新绘制'
})

// 类型颜色映射
function typeButtonLabel(type: RoiType): string {
  const map: Record<string, string> = {
    [RoiType.DETECTION_ZONE]: '多边形',
    [RoiType.EXCLUSION_ZONE]: '排除区域',
    [RoiType.TRIPWIRE]: '绊线',
    [RoiType.DIRECTIONAL_LINE]: '方向线',
    [RoiType.COUNTING_ZONE]: '计数区域',
    [RoiType.RECTANGLE]: '矩形',
    [RoiType.POINT]: '关注点',
  }
  return map[type] || '未知'
}

function typeColor(type: RoiType): string {
  const map: Record<string, string> = {
    [RoiType.DETECTION_ZONE]: '#0F9D58',
    [RoiType.EXCLUSION_ZONE]: '#F44336',
    [RoiType.TRIPWIRE]: '#FF6D00',
    [RoiType.DIRECTIONAL_LINE]: '#2196F3',
    [RoiType.COUNTING_ZONE]: '#9C27B0',
    [RoiType.RECTANGLE]: '#00897B',
    [RoiType.POINT]: '#00BCD4',
  }
  return map[type] || '#666'
}

function typeLabel(type: RoiType): string {
  const map: Record<string, string> = {
    [RoiType.DETECTION_ZONE]: '多边形',
    [RoiType.EXCLUSION_ZONE]: '排除',
    [RoiType.TRIPWIRE]: '绊线',
    [RoiType.DIRECTIONAL_LINE]: '方向',
    [RoiType.COUNTING_ZONE]: '计数',
    [RoiType.RECTANGLE]: '矩形',
    [RoiType.POINT]: '点',
  }
  return map[type] || '未知'
}

// 从 modelValue 初始化 ([FIX 2026-09-02] 外部真值回填时重置撤销栈;
// emit 回环 (同值) 不重置, 避免编辑过程中栈被冲掉)
watch(() => props.modelValue, (val) => {
  const snap = snapshotOf(val || [])
  if (snap !== lastEmittedSnap) {
    rois.value = val ? [...val] : []
    resetHistory()
  }
  renderCanvas()
}, { immediate: true })

// 加载背景图
watch(() => props.backgroundImageUrl, async (url) => {
  if (!url) { bgImage.value = null; renderCanvas(); return }
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

/** [FIX 2026-09-02] 导入本地底图: objectURL 直接作背景 (仅当前编辑会话, 不入规则数据) */
function onImportBackground(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  emit('update:backgroundImageUrl', url)
  ElMessage.success('底图已加载（仅当前编辑会话，不随规则保存）')
  input.value = ''
}

/** [FEAT 2026-09-01] 下载标注图: canvas 即所见即所得的合成结果 (背景+遮罩+标注),
 *  背景图以 crossOrigin=anonymous 加载同源快照 → canvas 未被污染, toBlob 可用 */
function downloadAnnotated() {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    a.href = url
    a.download = `roi-annotated-${ts}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

/** 进入绘制态统一入口: [FIX 2026-09-02] 首次进入给一次性 el-message 提示
 *  (提示文字不再画布内常驻, 详见画布下方状态栏) */
function enterDrawingMode() {
  drawing.value = true
  points.value = []
  rectAnchor.value = null
  selectedRoiIndex.value = -1
  if (!drawToastShown.value) {
    drawToastShown.value = true
    ElMessage.info({ message: drawHint.value, duration: 3000, showClose: true })
  }
  nextTick(() => renderCanvas())
}

function toggleDrawing() {
  if (!drawing.value) {
    enterDrawingMode()
  } else {
    drawing.value = false
    points.value = []
    rectAnchor.value = null
    renderCanvas()
  }
}

function clearCurrentPoints() {
  points.value = []
  rectAnchor.value = null
  renderCanvas()
}

/** [FIX 2026-09-02] 清空全部 ROI (快照入撤销栈, 可一键撤销) */
function clearAll() {
  if (rois.value.length === 0) return
  rois.value = []
  selectedRoiIndex.value = -1
  pushHistory()
  emitRois()
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
    direction: currentType.value === RoiType.DIRECTIONAL_LINE || currentType.value === RoiType.TRIPWIRE ? currentDirection.value : undefined,
  }

  rois.value.push(newRoi)
  points.value = []
  rectAnchor.value = null
  drawing.value = false
  pushHistory()
  emitRois()
  renderCanvas()
}

function selectRoi(index: number) {
  selectedRoiIndex.value = index
  renderCanvas()
}

// [FIX 2026-09-02] 绊线/方向线独立方向切换 (ROI 列表内联 el-select):
//   写回 roi.direction + 入撤销栈 + 重画箭头; 保存链随 roi_shapes_json 快照
//   及绊线镜像 direction 生效。
function onRoiDirectionChange(index: number, v: RoiDirection) {
  const roi = rois.value[index]
  if (!roi) return
  roi.direction = v
  pushHistory()
  emitRois()
  renderCanvas()
}

function removeRoi(index: number) {
  rois.value.splice(index, 1)
  if (selectedRoiIndex.value === index) selectedRoiIndex.value = -1
  else if (selectedRoiIndex.value > index) selectedRoiIndex.value--
  pushHistory()
  emitRois()
  renderCanvas()
}

/** [FIX 2026-09-02] Del 键删除选中 ROI (canvas tabindex=0 聚焦后生效) */
function deleteSelectedRoi() {
  if (selectedRoiIndex.value >= 0 && selectedRoiIndex.value < rois.value.length) {
    removeRoi(selectedRoiIndex.value)
  }
}

function emitRois() {
  const arr = [...rois.value]
  lastEmittedSnap = snapshotOf(arr)
  emit('update:modelValue', arr)
}

function getCanvasPoint(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const px = (e.clientX - rect.left) * scaleX
  const py = (e.clientY - rect.top) * scaleY
  return snapPoint(canvasToNormalized(
    { x: px, y: py },
    canvas.width, canvas.height,
    props.normalizeWidth, props.normalizeHeight,
  ))
}

/** canvas 像素坐标 (顶点命中检测用, 不做吸附/归一化) */
function getCanvasPixel(e: MouseEvent): { x: number; y: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  }
}

/** [FIX 2026-09-02] 顶点命中检测: 遍历已确认 ROI 顶点, 8px 半径命中
 *  返回 {roiIdx, vIdx}; 未命中返回 null */
function hitVertex(px: number, py: number): { roiIdx: number; vIdx: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const R = 8
  for (let i = 0; i < rois.value.length; i++) {
    const poly = rois.value[i].polygon
    for (let v = 0; v * 2 + 1 < poly.length; v++) {
      const c = normalizedToCanvas(
        { x: poly[v * 2], y: poly[v * 2 + 1] },
        canvas.width, canvas.height, props.normalizeWidth, props.normalizeHeight,
      )
      if (Math.hypot(c.x - px, c.y - py) <= R) return { roiIdx: i, vIdx: v }
    }
  }
  return null
}

function onMouseDown(e: MouseEvent) {
  if (props.disabled) return
  const px = getCanvasPixel(e)
  if (!px) return

  // [FIX 2026-09-02] 顶点编辑优先于绘制: 非绘制态命中已确认 ROI 顶点 → 拖动
  if (!drawing.value) {
    const hit = hitVertex(px.x, px.y)
    if (hit) {
      vertexDrag.value = hit
      selectedRoiIndex.value = hit.roiIdx
      dragging.value = true
      canvasRef.value?.focus()
      renderCanvas()
      return
    }
  }

  // [FIX 2026-08-28] 未点"开始绘制"时点击画布自动进入绘制模式 —
  //   与算法配置页 TripwireEditor 交互对齐 (直接落点), 避免用户直接点画布
  //   无反应、"确认添加"按钮永远灰的困惑。
  if (!drawing.value) enterDrawingMode()

  dragging.value = true
  const p = getCanvasPoint(e)
  if (!p) return

  // [FIX 2026-09-02] 关注点: 单击即完成
  if (currentType.value === RoiType.POINT) {
    points.value = [p]
    confirmAndAdd()
    return
  }

  // [FIX 2026-09-02] 矩形: 按下记锚点, mousemove 橡皮筋, mouseup 展开 4 顶点完成
  if (currentType.value === RoiType.RECTANGLE) {
    rectAnchor.value = p
    points.value = []
    renderCanvas()
    return
  }

  if (points.value.length < maxPoints.value) {
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
  const canvas = canvasRef.value
  const px = getCanvasPixel(e)
  if (!canvas || !px) return

  // [FIX 2026-09-02] 顶点拖动: 更新顶点坐标 (矩形拖角保持矩形)
  if (vertexDrag.value && dragging.value) {
    const p = snapPoint(canvasToNormalized(
      px, canvas.width, canvas.height, props.normalizeWidth, props.normalizeHeight,
    ))
    const roi = rois.value[vertexDrag.value.roiIdx]
    if (roi) {
      const { vIdx } = vertexDrag.value
      if (roi.roi_type === RoiType.RECTANGLE && roi.polygon.length === 8) {
        // 矩形: 拖角点 + 对面顶点重新展开 4 顶点 (0↔2 / 1↔3 对角)
        const opposite = (vIdx + 2) % 4
        roi.polygon = rectFromDiagonal(
          p.x, p.y,
          roi.polygon[opposite * 2], roi.polygon[opposite * 2 + 1],
        )
      } else {
        roi.polygon[vIdx * 2] = p.x
        roi.polygon[vIdx * 2 + 1] = p.y
      }
      renderCanvas()
    }
    return
  }

  // cursor 反馈: 非绘制态悬停顶点 → move
  if (!drawing.value && !props.disabled) {
    canvas.style.cursor = hitVertex(px.x, px.y) ? 'move' : ''
  }

  if (!dragging.value || !drawing.value) return
  const p = getCanvasPoint(e)
  if (!p) return

  // 矩形橡皮筋: anchor → 当前点
  if (rectAnchor.value) {
    renderCanvas(p)
    return
  }
  if (points.value.length > 0) {
    renderCanvas(p)
  }
}

function onMouseUp(e: MouseEvent) {
  // [FIX 2026-09-02] 顶点拖动结束 → 入撤销栈 + 上抛
  if (vertexDrag.value) {
    vertexDrag.value = null
    dragging.value = false
    pushHistory()
    emitRois()
    renderCanvas()
    return
  }

  // [FIX 2026-09-02] 矩形拖拽完成: anchor + 当前点展开 4 顶点
  if (rectAnchor.value && dragging.value && drawing.value) {
    const p = getCanvasPoint(e)
    if (p) {
      // 拖拽距离过小视为误触 (归一化坐标系 < 8 单位)
      if (Math.abs(p.x - rectAnchor.value.x) >= 8 && Math.abs(p.y - rectAnchor.value.y) >= 8) {
        points.value = []
        const poly = rectFromDiagonal(rectAnchor.value.x, rectAnchor.value.y, p.x, p.y)
        for (let i = 0; i < poly.length; i += 2) {
          points.value.push({ x: poly[i], y: poly[i + 1] })
        }
        rectAnchor.value = null
        confirmAndAdd()
        return
      }
    }
    rectAnchor.value = null
    renderCanvas()
  }
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

function onRightClick(e: MouseEvent) {
  // 绘制态: 回退一个顶点 (现状交互)
  if (points.value.length > 0) {
    points.value.pop()
    renderCanvas()
    return
  }
  // [FIX 2026-09-02] 非绘制态: 命中多边形顶点 → 删除该顶点 (≥4 点才允许,
  // 删后仍 ≥3 顶点; 矩形/绊线/点形状顶点有结构约束, 不支持单点删除)
  const px = getCanvasPixel(e)
  if (!px || drawing.value) return
  const hit = hitVertex(px.x, px.y)
  if (!hit) return
  const roi = rois.value[hit.roiIdx]
  const polyType = roi.roi_type === RoiType.DETECTION_ZONE || roi.roi_type === RoiType.EXCLUSION_ZONE
  if (!polyType || roi.polygon.length < 8) return
  roi.polygon.splice(hit.vIdx * 2, 2)
  selectedRoiIndex.value = hit.roiIdx
  pushHistory()
  emitRois()
  renderCanvas()
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
    // [FIX 2026-09-02] 选中态叠加顶点控制点 (白心描边圆, 提示可拖动/右键删)
    if (isSelected) drawVertexHandles(ctx, roi)
  }

  // 绘制正在绘制的 ROI 预览
  if (rectAnchor.value) {
    // [FIX 2026-09-02] 矩形拖拽橡皮筋 (anchor → 鼠标当前点)
    const a = normalizedToCanvas(rectAnchor.value, canvas.width, canvas.height, props.normalizeWidth, props.normalizeHeight)
    if (previewPoint) {
      const b = normalizedToCanvas(previewPoint, canvas.width, canvas.height, props.normalizeWidth, props.normalizeHeight)
      ctx.save()
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = typeColor(RoiType.RECTANGLE)
      ctx.lineWidth = 2
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      ctx.restore()
    }
    return
  }

  if (points.value.length > 0) {
    const previewRoi: RoiData = {
      roi_id: '_preview',
      roi_name: '',
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

/** [FIX 2026-09-02] 选中 ROI 顶点控制点 (统一叠画, 不依赖各 draw 函数) */
function drawVertexHandles(ctx: CanvasRenderingContext2D, roi: RoiData) {
  const canvas = canvasRef.value
  if (!canvas) return
  for (let v = 0; v * 2 + 1 < roi.polygon.length; v++) {
    const c = normalizedToCanvas(
      { x: roi.polygon[v * 2], y: roi.polygon[v * 2 + 1] },
      canvas.width, canvas.height, props.normalizeWidth, props.normalizeHeight,
    )
    ctx.beginPath()
    ctx.arc(c.x, c.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = typeColor(roi.roi_type)
    ctx.stroke()
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
    case RoiType.RECTANGLE:
      drawRectangle(ctx, pts, { ...opts, fill: 'rgba(0,137,123,0.15)' })
      break
    case RoiType.POINT:
      drawPoint(ctx, pts, opts)
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
.roi-toolbar__edit {
  display: flex;
  gap: 4px;
}
.roi-toolbar__snapshot {
  margin-left: auto;
  display: flex;
  gap: 4px;
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
/* [FIX 2026-09-02] 绊线/方向线列表内联方向切换 */
.roi-list__dir {
  width: 86px;
  flex-shrink: 0;
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
  outline: none;
}
.roi-canvas--drawing {
  cursor: crosshair;
}
/* [FIX 2026-09-02] 绘制提示独立 hint 区域: 画布下方状态栏 (原画布内浮动
   .roi-canvas__hint 已移除 — 画布 DOM 内不再有任何提示文案节点) */
.roi-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 10px;
  margin-top: 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.roi-statusbar__hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.roi-statusbar__meta {
  white-space: nowrap;
  color: var(--el-text-color-placeholder);
}
</style>
