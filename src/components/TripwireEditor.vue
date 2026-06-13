<template>
  <div class="tripwire-editor">
    <div class="tripwire-toolbar">
      <span class="tip">{{ tip }}</span>
      <el-radio-group v-model="direction" size="small">
        <el-radio-button value="both">双向</el-radio-button>
        <el-radio-button value="a_to_b">A→B</el-radio-button>
        <el-radio-button value="b_to_a">B→A</el-radio-button>
      </el-radio-group>
      <el-button size="small" :disabled="!canConfirm" type="primary" @click="confirm">
        确认添加
      </el-button>
      <el-button size="small" :disabled="points.length === 0" @click="undo">撤销</el-button>
      <el-button size="small" :disabled="points.length === 0" @click="reset">重置</el-button>
    </div>
    <div class="tripwire-canvas-wrap" ref="wrapRef">
      <canvas
        ref="canvasRef"
        :width="canvasW"
        :height="canvasH"
        @click="onClick"
        @mousemove="onMove"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { TripwireDirection } from '@/types/region'

const props = defineProps<{
  /** 背景图 URL (可选, 用相机快照) */
  imageUrl?: string
  /** 实际图像宽高 (用于归一化坐标反算) */
  imageWidth?: number
  imageHeight?: number
}>()

const emit = defineEmits<{
  (e: 'confirm', payload: {
    point_a: [number, number]
    point_b: [number, number]
    direction: TripwireDirection
  }): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)
const points = ref<[number, number][]>([])  // 归一化坐标
const direction = ref<TripwireDirection>('both')
const canvasW = ref(640)
const canvasH = ref(360)

const canConfirm = computed(() => points.value.length === 2)
const tip = computed(() => {
  if (points.value.length === 0) return '点击起点 A'
  if (points.value.length === 1) return '点击终点 B'
  return '已选 2 点, 可调整方向后确认'
})

watch(() => [props.imageUrl, props.imageWidth, props.imageHeight], draw)

onMounted(() => {
  if (wrapRef.value) {
    canvasW.value = wrapRef.value.clientWidth || 640
    canvasH.value = wrapRef.value.clientHeight || 360
  }
  draw()
})

function onClick(e: MouseEvent) {
  if (points.value.length >= 2) return
  const rect = (canvasRef.value as HTMLCanvasElement).getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  points.value.push([x, y])
  draw()
}

function onMove(e: MouseEvent) {
  if (points.value.length === 0 || points.value.length === 2) return
  const rect = (canvasRef.value as HTMLCanvasElement).getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  // 临时绘制虚线到鼠标位置
  draw()
  drawDashedLine(points.value[0], [x, y])
}

function undo() {
  points.value.pop()
  draw()
}

function reset() {
  points.value = []
  draw()
}

function confirm() {
  if (points.value.length !== 2) return
  emit('confirm', {
    point_a: points.value[0],
    point_b: points.value[1],
    direction: direction.value
  })
  reset()
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)
  // 背景图
  if (props.imageUrl) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height)
    img.src = props.imageUrl
  } else {
    ctx.fillStyle = '#1f1f1f'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#666'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('(无背景图, 直接画线)', c.width / 2, c.height / 2)
  }
  // 画已有点
  for (let i = 0; i < points.value.length; i++) {
    const [x, y] = points.value[i]
    drawCircle(ctx, x * c.width, y * c.height, i === 0 ? 'A' : 'B')
  }
  // 画连线
  if (points.value.length === 2) {
    drawArrow(ctx, points.value[0], points.value[1], direction.value)
  }
}

function drawDashedLine(a: [number, number], b: [number, number]) {
  const c = canvasRef.value!
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = '#67c23a'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(a[0] * c.width, a[1] * c.height)
  ctx.lineTo(b[0] * c.width, b[1] * c.height)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  ctx.fillStyle = '#409eff'
  ctx.beginPath()
  ctx.arc(x, y, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y)
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  a: [number, number],
  b: [number, number],
  dir: TripwireDirection
) {
  const c = canvasRef.value!
  const ax = a[0] * c.width, ay = a[1] * c.height
  const bx = b[0] * c.width, by = b[1] * c.height
  ctx.strokeStyle = '#e6a23c'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.stroke()
  if (dir === 'a_to_b' || dir === 'both') {
    drawArrowHead(ctx, ax, ay, bx, by)
  }
  if (dir === 'b_to_a' || dir === 'both') {
    drawArrowHead(ctx, bx, by, ax, ay)
  }
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number
) {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  const head = 12
  ctx.fillStyle = '#e6a23c'
  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - head * Math.cos(angle - Math.PI / 6), toY - head * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(toX - head * Math.cos(angle + Math.PI / 6), toY - head * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}
</script>

<style scoped lang="scss">
.tripwire-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tripwire-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  .tip { color: #909399; font-size: 13px; }
}
.tripwire-canvas-wrap {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
}
</style>
