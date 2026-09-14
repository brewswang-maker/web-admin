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
    <!-- [P0-P2 v6] 判定参数行: 档位/近景档/同秒忽略/ΔT 配对窗 -->
    <div class="pw-v6-row">
      <span class="v6-label">判定档位</span>
      <el-select v-model="detectMode" size="small" style="width: 100px">
        <el-option label="快速" value="fast" />
        <el-option label="精确" value="precise" />
      </el-select>
      <el-select v-model="bboxMode" size="small" style="width: 110px">
        <el-option label="固定尺寸" value="fixed" />
        <el-option label="近景放宽" value="near_adaptive" />
      </el-select>
      <el-checkbox v-model="sameSecondIgnore" size="small">同秒忽略</el-checkbox>
      <el-checkbox v-model="dtAuto" size="small">ΔT 自动</el-checkbox>
      <el-slider
        v-if="!dtAuto"
        v-model="tailgateDt"
        :min="0"
        :max="20000"
        :step="500"
        style="flex: 1; min-width: 120px"
        :format-tooltip="(v: number) => v === 0 ? '0 (禁用配对)' : `${v}ms`"
      />
      <span class="v6-hint">Δt={{ dtHint }}</span>
    </div>
    <!-- [P1-4] 门线绘制行: 多边形 / 单门槛线 / 双线计数区 -->
    <div class="pw-line-row">
      <span class="v6-label">绘制</span>
      <el-radio-group v-model="mode" size="small">
        <el-radio-button value="poly">通道区</el-radio-button>
        <el-radio-button value="line1">门线1</el-radio-button>
        <el-radio-button value="line2">门线2</el-radio-button>
      </el-radio-group>
      <span class="v6-hint">{{ lineHint }}</span>
      <el-button size="small" text :disabled="line1Pts.length === 0 && line2Pts.length === 0" @click="clearLines">清除门线</el-button>
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
 *
 * [P0-P2 v6 2026-09-14] 新增: 判定档位 (fast/precise) / 近景放宽档 /
 * 同秒忽略 / ΔT 配对窗暴露 (P0-1/P1-6) / 门线绘制 (P1-4: 门线1 单门槛线,
 * 门线2 双线计数区)。自动门线预览与后端 autoGateLine 同算法
 * (多边形最优平行边对中点连线)——绘制区不选门线时也可见判定线位置。
 */
import { computed, onMounted, ref, watch } from 'vue'
import type { PassagewayDef, SuppressMode } from '@/types/region'

type DrawMode = 'poly' | 'line1' | 'line2'
type Pt = [number, number]

type ConfirmPayload = {
  transit_polygon: [number, number][]
  direction_in: boolean
  sensitivity: number
  suppress_mode: SuppressMode
  cooldown_sec: number
  // [P0-P2 v6]
  tailgate_dt_ms: number
  detect_mode: 'fast' | 'precise'
  bbox_size_mode: 'fixed' | 'near_adaptive'
  same_second_ignore: boolean
  gate_line?: [number, number, number, number]
  gate_line2?: [number, number, number, number]
}

const props = defineProps<{
  /** 背景图 URL (可选, 用相机快照) */
  imageUrl?: string
  /** [FIX 2026-09-03 问题2] 已保存通道列表: 常驻回显到画布 (对标 TripwireEditor 的
   *  saved 机制)。之前给 prop 都没有 → 确认添加后内部草稿 reset, 多边形从画布消失,
   *  仅剩文字列表 — 「创建成功但区域消失」现象的直接成因之一。 */
  saved?: PassagewayDef[]
}>()

const emit = defineEmits<{
  (e: 'confirm', payload: ConfirmPayload): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)
const points = ref<[number, number][]>([])  // 归一化坐标
const directionIn = ref(true)
const suppressMode = ref<SuppressMode>('off')
const sensitivity = ref(60)
const canvasW = ref(640)
const canvasH = ref(360)
// [P0-P2 v6] 判定参数 (默认 = 后端派生口径: ΔT 自动 3000, fast, fixed, 同秒忽略开)
const detectMode = ref<'fast' | 'precise'>('fast')
const bboxMode = ref<'fixed' | 'near_adaptive'>('fixed')
const sameSecondIgnore = ref(true)
const dtAuto = ref(true)
const tailgateDt = ref(3000)
// [P1-4] 门线草稿 (每线最多 2 点; 满 2 点后再点 = 重新开始)
const mode = ref<DrawMode>('poly')
const line1Pts = ref<Pt[]>([])
const line2Pts = ref<Pt[]>([])
// [FIX 2026-08-28] 背景图缓存 (同 TripwireEditor): 异步 onload drawImage 会覆盖
// 刚绘制的多边形/顶点 → 改为缓存 bgImg 同步垫底绘制, 加载完成后重绘。
const bgImg = ref<HTMLImageElement | null>(null)

const canConfirm = computed(() => points.value.length >= 3)
const tip = computed(() => {
  if (mode.value === 'line1') return '点击两点画门线1 (单门槛线: 越线即判)'
  if (mode.value === 'line2') return '点击两点画门线2 (与门线1组成双线计数区)'
  const n = points.value.length
  if (n === 0) return '点击画布标出通行区顶点 (至少 3 点)'
  if (n < 3) return `已选 ${n} 点, 还需 ${3 - n} 个顶点`
  return `已选 ${n} 点, 围成通道区域后确认`
})
const dtHint = computed(() => dtAuto.value ? '3000ms (档位)' : (tailgateDt.value === 0 ? '禁用' : `${tailgateDt.value}ms`))
const lineHint = computed(() => {
  const l1 = line1Pts.value.length, l2 = line2Pts.value.length
  if (mode.value === 'line1') return l1 === 0 ? '未画 (自动最优平行边对)' : (l1 === 1 ? '再点一点完成' : '已完成')
  if (mode.value === 'line2') return l2 === 0 ? (l1 === 2 ? '未画 (单线模式)' : '先画门线1') : (l2 === 1 ? '再点一点完成' : '双线计数区')
  return '门线未画时自动生成 (橙虚线为自动预览)'
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

watch(() => props.imageUrl, (url) => {
  bgImg.value = null
  if (!url) { draw(); return }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { bgImg.value = img; draw() }  // 加载完成重绘, 背景垫底
  img.src = url
}, { immediate: true })
watch([directionIn, suppressMode, sensitivity, detectMode, bboxMode,
       sameSecondIgnore, dtAuto, tailgateDt, mode], draw)
// [FIX 2026-09-03 问题2] 后端回填 (loadRegions → passageways) 变化时重绘已保存通道
watch(() => props.saved, draw)

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
  if (mode.value === 'poly') {
    points.value.push([x, y])
  } else {
    // [P1-4] 门线模式: 每线 2 点; 满 2 点后再点 = 重新开始
    const arr = mode.value === 'line1' ? line1Pts : line2Pts
    if (arr.value.length >= 2) arr.value = []
    arr.value.push([x, y])
  }
  draw()
}

let hover: [number, number] | null = null
function onMove(e: MouseEvent) {
  const rect = (canvasRef.value as HTMLCanvasElement).getBoundingClientRect()
  hover = [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
  const polyPreview = points.value.length > 0 && points.value.length < 3
  const lineDraft = (mode.value === 'line1' && line1Pts.value.length === 1) ||
                    (mode.value === 'line2' && line2Pts.value.length === 1)
  if (!polyPreview && !lineDraft) return
  draw()
}

function undo() {
  if (mode.value === 'line1') line1Pts.value.pop()
  else if (mode.value === 'line2') line2Pts.value.pop()
  else points.value.pop()
  draw()
}

function reset() {
  points.value = []
  draw()
}

function clearLines() {
  line1Pts.value = []
  line2Pts.value = []
  draw()
}

function confirm() {
  if (points.value.length < 3) return
  // fixed/escalating 冷却默认 60s (1-1800 可后调, off 不消费)
  const cd = suppressMode.value === 'off' ? 60 : 60
  const payload: ConfirmPayload = {
    transit_polygon: points.value.map((p) => [p[0], p[1]] as [number, number]),
    direction_in: directionIn.value,
    sensitivity: sensitivity.value,
    suppress_mode: suppressMode.value,
    cooldown_sec: cd,
    tailgate_dt_ms: dtAuto.value ? -1 : tailgateDt.value,
    detect_mode: detectMode.value,
    bbox_size_mode: bboxMode.value,
    same_second_ignore: sameSecondIgnore.value
  }
  if (line1Pts.value.length === 2) {
    payload.gate_line = [line1Pts.value[0][0], line1Pts.value[0][1],
                         line1Pts.value[1][0], line1Pts.value[1][1]]
  }
  if (line2Pts.value.length === 2) {
    payload.gate_line2 = [line2Pts.value[0][0], line2Pts.value[0][1],
                          line2Pts.value[1][0], line2Pts.value[1][1]]
  }
  emit('confirm', payload)
  reset()
  clearLines()
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)
  // 背景图 (同步绘制, 永远垫在多边形/顶点之下)
  if (bgImg.value) {
    ctx.drawImage(bgImg.value, 0, 0, c.width, c.height)
  } else if (!props.imageUrl) {
    ctx.fillStyle = '#1f1f1f'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#666'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('(无背景图, 点击标出通道区域顶点)', c.width / 2, c.height / 2)
  } else {
    // 背景加载中: 铺深色底防白闪
    ctx.fillStyle = '#1f1f1f'
    ctx.fillRect(0, 0, c.width, c.height)
  }
  const pts = points.value
  // [FIX 2026-09-03 问题2] 已保存通道常驻回显: 绿色细实线 + 浅填充 + 顶点小圆 + 名字标签
  //   (正在绘制的仍是蓝色顶点 + 绿色草稿折线, 视觉区分同 TripwireEditor)
  for (const sp of props.saved ?? []) {
    const poly = (sp.transit_polygon ?? []) as [number, number][]
    if (poly.length < 3) continue
    // [FIX tw-toggle 2026-09-08] 停用通道半透明虚线回显 (同 RoiPolygonEditor
    //   is_active 0.4 语义): 保留空间参照, 与生效通道 (实线 0.9) 一眼可辨。
    const disabled = sp.enabled === false
    ctx.strokeStyle = disabled ? 'rgba(103,194,58,0.35)' : 'rgba(103,194,58,0.9)'
    ctx.fillStyle = disabled ? 'rgba(103,194,58,0.05)' : 'rgba(103,194,58,0.15)'
    ctx.lineWidth = 2
    ctx.setLineDash(disabled ? [6, 4] : [])
    ctx.beginPath()
    ctx.moveTo(poly[0][0] * c.width, poly[0][1] * c.height)
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(poly[i][0] * c.width, poly[i][1] * c.height)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgba(103,194,58,0.9)'
    for (const [px, py] of poly) {
      ctx.beginPath()
      ctx.arc(px * c.width, py * c.height, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    const label = String(sp.name ?? '').slice(0, 16)
    if (label) {
      let cx = 0, cy = 0
      for (const [px, py] of poly) { cx += px; cy += py }
      cx = (cx / poly.length) * c.width
      cy = (cy / poly.length) * c.height
      ctx.font = '11px sans-serif'
      const labelW = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(cx - labelW / 2 - 4, cy - 20, labelW + 8, 16)
      ctx.fillStyle = '#a0ffc8'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, cx, cy - 12)
    }
    // [P1-4] 已保存通道的门线回显: 显式门线实线橙; 未配置 → 自动预览橙虚线
    const gl1 = lineValid(sp.gate_line) ? lineToArr(sp.gate_line!) : autoGateLine(poly)
    if (gl1) {
      drawGateLine(ctx, c, gl1, lineValid(sp.gate_line as any)
        ? 'rgba(230,162,60,0.95)' : 'rgba(230,162,60,0.45)',
        !lineValid(sp.gate_line as any))
    }
    if (lineValid(sp.gate_line2)) {
      drawGateLine(ctx, c, lineToArr(sp.gate_line2!), 'rgba(230,162,60,0.95)', false)
    }
  }
  // [P1-4] 正在绘制的门线草稿 (橙实线 + 蓝顶点; 单点→跟鼠标预览)
  const drafts: { pts: Pt[]; color: string }[] = [
    { pts: line1Pts.value, color: '#e6a23c' },
    { pts: line2Pts.value, color: '#f56c6c' }
  ]
  for (const d of drafts) {
    if (d.pts.length === 0) continue
    ctx.strokeStyle = d.color
    ctx.lineWidth = 2
    ctx.setLineDash(d.pts.length === 1 ? [5, 5] : [])
    ctx.beginPath()
    ctx.moveTo(d.pts[0][0] * c.width, d.pts[0][1] * c.height)
    if (d.pts.length === 1 && hover) {
      ctx.lineTo(hover[0] * c.width, hover[1] * c.height)
    } else if (d.pts.length === 2) {
      ctx.lineTo(d.pts[1][0] * c.width, d.pts[1][1] * c.height)
    }
    ctx.stroke()
    ctx.setLineDash([])
    for (const [px, py] of d.pts) {
      ctx.fillStyle = d.color
      ctx.beginPath()
      ctx.arc(px * c.width, py * c.height, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
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

/** [P1-4] 门线有效性: 全 -1 / 缺省 = 未配置 (同后端 lineValid 口径) */
function lineValid(l?: number[] | null): boolean {
  if (!l || l.length < 4) return false
  return !(l[0] < 0 && l[1] < 0 && l[2] < 0 && l[3] < 0)
}

function lineToArr(l: number[]): [number, number, number, number] {
  return [l[0], l[1], l[2], l[3]]
}

/**
 * [P1-4] 自动门线预览 — 与后端 autoGateLine 同算法 (多边形最优平行边对
 * 中点连线; 评分 = |cos 夹角| × min/max 长度比; 相邻边跳过)。仅预览用,
 * 不参与提交 (未画门线时后端自行生成同一线)。
 */
function autoGateLine(poly: [number, number][]): [number, number, number, number] | null {
  const n = poly.length
  if (n < 3) return null
  if (n === 3) return [poly[0][0], poly[0][1], poly[1][0], poly[1][1]]
  let best = -1, bi = 0, bj = 1
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    const ax = poly[i2][0] - poly[i][0], ay = poly[i2][1] - poly[i][1]
    const la = Math.hypot(ax, ay)
    if (la < 1e-5) continue
    for (let j = i + 1; j < n; j++) {
      if ((j + 1) % n === i || (i + 1) % n === j) continue
      const j2 = (j + 1) % n
      const bx = poly[j2][0] - poly[j][0], by = poly[j2][1] - poly[j][1]
      const lb = Math.hypot(bx, by)
      if (lb < 1e-5) continue
      const cosab = Math.abs((ax * bx + ay * by) / (la * lb))
      const ratio = Math.min(la, lb) / Math.max(la, lb)
      const score = cosab * ratio
      if (score > best) { best = score; bi = i; bj = j }
    }
  }
  const bi2 = (bi + 1) % n, bj2 = (bj + 1) % n
  return [(poly[bi][0] + poly[bi2][0]) / 2, (poly[bi][1] + poly[bi2][1]) / 2,
          (poly[bj][0] + poly[bj2][0]) / 2, (poly[bj][1] + poly[bj2][1]) / 2]
}

function drawGateLine(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement,
                      l: [number, number, number, number],
                      color: string, dashed: boolean) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash(dashed ? [6, 4] : [])
  ctx.beginPath()
  ctx.moveTo(l[0] * c.width, l[1] * c.height)
  ctx.lineTo(l[2] * c.width, l[3] * c.height)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = color
  for (const [px, py] of [[l[0], l[1]], [l[2], l[3]]] as [number, number][]) {
    ctx.beginPath()
    ctx.arc(px * c.width, py * c.height, 4, 0, Math.PI * 2)
    ctx.fill()
  }
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
.pw-v6-row, .pw-line-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  .v6-label { font-size: 13px; color: #606266; white-space: nowrap; }
  .v6-hint { font-size: 12px; color: #909399; white-space: nowrap; }
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
