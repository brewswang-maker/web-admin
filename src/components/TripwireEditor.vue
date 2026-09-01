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
import type { TripwireDirection, TripwireDef } from '@/types/region'

const props = defineProps<{
  /** 背景图 URL (可选, 用相机快照) */
  imageUrl?: string
  /** 实际图像宽高 (用于归一化坐标反算) */
  imageWidth?: number
  imageHeight?: number
  /** [FIX 2026-08-28] 已保存绊线列表: 常驻回显到画布 (保存后不再"消失", 下次进入可见) */
  saved?: TripwireDef[]
  /** 载入一条绊线到编辑态 (替换式编辑: 外部记录旧条目, 确认时先删后建) */
  editing?: { point_a: [number, number]; point_b: [number, number]; direction: TripwireDirection; name?: string } | null
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
// [FIX 2026-08-28] 背景图缓存: 旧实现每次 draw 都 new Image() 异步加载,
// onload 的 drawImage 在点线绘制之后才执行 → 背景整幅覆盖刚画的点/线 (标点不显示)。
// 改为: imageUrl 变化时加载一次并缓存 bgImg, onload 后触发重绘; draw() 同步段
// 先垫背景再画点线, 绘制顺序永远正确。
const bgImg = ref<HTMLImageElement | null>(null)

const canConfirm = computed(() => points.value.length === 2)
const tip = computed(() => {
  if (props.editing?.name) return `正在编辑: ${props.editing.name} — 调整后确认替换 (取消可点重置)`
  if (points.value.length === 0) return '点击起点 A'
  if (points.value.length === 1) return '点击终点 B'
  return '已选 2 点, 可调整方向后确认'
})

watch(() => props.imageUrl, (url) => {
  bgImg.value = null
  if (!url) { draw(); return }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { bgImg.value = img; draw() }  // 加载完成重绘, 背景垫底
  img.src = url
}, { immediate: true })
watch(() => [props.imageWidth, props.imageHeight], draw)
watch(() => props.saved, draw)
// 载入编辑态: 沿用旧两点与方向, 用户可点击重画或微调后确认 (替换保存)
watch(() => props.editing, (v) => {
  if (v) {
    points.value = [[...v.point_a], [...v.point_b]]
    direction.value = v.direction
    draw()
  }
})

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
  // 背景图 (同步绘制, 永远垫在点线之下)
  if (bgImg.value) {
    ctx.drawImage(bgImg.value, 0, 0, c.width, c.height)
  } else if (!props.imageUrl) {
    ctx.fillStyle = '#1f1f1f'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#666'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('(无背景图, 直接画线)', c.width / 2, c.height / 2)
  } else {
    // 背景加载中: 铺深色底防白闪
    ctx.fillStyle = '#1f1f1f'
    ctx.fillRect(0, 0, c.width, c.height)
  }
  // [FIX 2026-08-28] 已保存绊线常驻回显: 绿色细实线 + 小圆端点 + 名字标签
  // (正在绘制的仍是蓝色 A/B 大点 + 橙色箭头, 视觉区分明确)
  for (const st of props.saved ?? []) {
    const ax = st.point_a[0] * c.width, ay = st.point_a[1] * c.height
    const bx = st.point_b[0] * c.width, by = st.point_b[1] * c.height
    ctx.strokeStyle = 'rgba(103,194,58,0.9)'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
    ctx.fillStyle = 'rgba(103,194,58,0.9)'
    for (const [px, py] of [[ax, ay], [bx, by]] as [number, number][]) {
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    const label = String(st.name ?? '').slice(0, 16)
    if (label) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2
      ctx.font = '11px sans-serif'
      const labelW = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(mx - labelW / 2 - 4, my - 22, labelW + 8, 16)
      ctx.fillStyle = '#a0ffc8'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, mx, my - 14)
    }
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
