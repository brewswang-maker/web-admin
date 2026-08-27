<template>
  <div class="passageway-editor">
    <div class="pw-toolbar">
      <span class="tip">{{ tip }}</span>
      <el-radio-group v-model="directionIn" size="small">
        <el-radio-button :value="true">进入</el-radio-button>
        <el-radio-button :value="false">离开</el-radio-button>
      </el-radio-group>
      <el-select v-model="suppressMode" size="small" style="width: 120px">
        <el-option label="不抑制" value="off" />
        <el-option label="固定冷却" value="fixed" />
        <el-option label="递增冷却" value="escalating" />
      </el-select>
      <el-button size="small" :disabled="!canConfirm" type="primary" @click="confirm">
        确认添加
      </el-button>
      <el-button size="small" :disabled="points.length === 0" @click="undo">撤销</el-button>
      <el-button size="small" :disabled="points.length === 0" @click="reset">重置</el-button>
    </div>
    <div class="pw-sens-row">
      <span class="sens-label">灵敏度 {{ sensitivity }}</span>
      <el-slider
        v-model="sensitivity"
        :min="1"
        :max="100"
        :step="1"
        style="flex: 1"
        :format-tooltip="(v: number) => `${v} (${sensTier(v)})`"
      />
      <span class="sens-hint">{{ sensHint }}</span>
    </div>
    <div class="pw-canvas-wrap" ref="wrapRef">
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
/**
 * PassagewayEditor.vue — 🆕 v5.0 [Tailgating 区域版] 通道多边形绘制
 *
 * 对标 TripwireEditor 模式: 点击顶点 (≥3 点) 围成通行区多边形;
 * sensitivity 滑块是唯一推荐调参入口 (海康式), 派生映射同后端
 * RegionStore.h PassagewayDef 注释 / tailgating_detector deriveFromSensitivity。
 */
import { computed, onMounted, ref, watch } from 'vue'
import type { SuppressMode } from '@/types/region'

const props = defineProps<{
  /** 背景图 URL (可选, 用相机快照) */
  imageUrl?: string
}>()

const emit = defineEmits<{
  (e: 'confirm', payload: {
    transit_polygon: [number, number][]
    direction_in: boolean
    sensitivity: number
    suppress_mode: SuppressMode
    cooldown_sec: number
  }): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)
const points = ref<[number, number][]>([])  // 归一化坐标
const directionIn = ref(true)
const suppressMode = ref<SuppressMode>('off')
const sensitivity = ref(60)
const canvasW = ref(640)
const canvasH = ref(360)

const canConfirm = computed(() => points.value.length >= 3)
const tip = computed(() => {
  const n = points.value.length
  if (n === 0) return '点击画布标出通行区顶点 (至少 3 点)'
  if (n < 3) return `已选 ${n} 点, 还需 ${3 - n} 个顶点`
  return `已选 ${n} 点, 围成通道区域后确认`
})

/** sensitivity 档位名 (与后端派生映射一致) */
function sensTier(v: number): string {
  if (v >= 81) return '极灵敏'
  if (v >= 60) return '灵敏'
  if (v >= 41) return '均衡'
  if (v >= 21) return '保守'
  return '极保守'
}
const sensHint = computed(() => {
  const v = sensitivity.value
  if (v >= 81) return '超员≥1 · 投票 2/3 · 置信 0.40 · 窗 4s'
  if (v >= 60) return '超员≥1 · 投票 3/5 · 置信 0.45 · 窗 5s'
  if (v >= 41) return '超员≥1 · 投票 3/5 · 置信 0.50 · 窗 6s'
  if (v >= 21) return '超员≥2 · 投票 4/6 · 置信 0.50 · 窗 8s'
  return '超员≥2 · 投票 5/8 · 置信 0.55 · 窗 10s'
})

watch(() => props.imageUrl, draw)
watch([directionIn, suppressMode, sensitivity], draw)

onMounted(() => {
  if (wrapRef.value) {
    canvasW.value = wrapRef.value.clientWidth || 640
    canvasH.value = wrapRef.value.clientHeight || 360
  }
  draw()
})

function onClick(e: MouseEvent) {
  const rect = (canvasRef.value as HTMLCanvasElement).getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  points.value.push([x, y])
  draw()
}

let hover: [number, number] | null = null
function onMove(e: MouseEvent) {
  if (points.value.length === 0) return
  const rect = (canvasRef.value as HTMLCanvasElement).getBoundingClientRect()
  hover = [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
  draw()
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
  if (points.value.length < 3) return
  // fixed/escalating 冷却默认 60s (1-1800 可后调, off 不消费)
  const cd = suppressMode.value === 'off' ? 60 : 60
  emit('confirm', {
    transit_polygon: points.value.map((p) => [p[0], p[1]] as [number, number]),
    direction_in: directionIn.value,
    sensitivity: sensitivity.value,
    suppress_mode: suppressMode.value,
    cooldown_sec: cd
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
    ctx.fillText('(无背景图, 点击标出通道区域顶点)', c.width / 2, c.height / 2)
  }
  const pts = points.value
  if (pts.length === 0) return
  // 多边形填充 (≥3 点) / 折线预览 (<3 点)
  ctx.strokeStyle = '#67c23a'
  ctx.fillStyle = 'rgba(103, 194, 58, 0.25)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pts[0][0] * c.width, pts[0][1] * c.height)
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0] * c.width, pts[i][1] * c.height)
  }
  const tail = hover && pts.length < 3 ? hover : null
  if (tail) ctx.lineTo(tail[0] * c.width, tail[1] * c.height)
  if (pts.length >= 3) {
    ctx.closePath()
    ctx.fill()
  }
  ctx.stroke()
  // 顶点编号
  for (let i = 0; i < pts.length; i++) {
    drawVertex(ctx, pts[i][0] * c.width, pts[i][1] * c.height, String(i + 1))
  }
}

function drawVertex(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
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
</script>

<style scoped lang="scss">
.passageway-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pw-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  .tip { color: #909399; font-size: 13px; }
}
.pw-sens-row {
  display: flex;
  align-items: center;
  gap: 12px;
  .sens-label { font-size: 13px; color: #606266; white-space: nowrap; }
  .sens-hint { font-size: 12px; color: #909399; white-space: nowrap; }
}
.pw-canvas-wrap {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
}
</style>
