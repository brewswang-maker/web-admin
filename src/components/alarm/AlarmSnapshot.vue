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
    <!-- Detection boxes overlay -->
    <canvas
      v-if="imageUrl && normalizedBoxes.length"
      ref="canvasRef"
      class="alarm-snapshot__canvas"
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
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'

/** [FEAT 2026-09-02] 全屏预览开关 (el-image-viewer v-if 挂载) */
const viewerVisible = ref(false)

interface DetectionBox {
  x: number; y: number; w: number; h: number
  label: string; confidence: number
}

const CLASS_COLORS: Record<string, string> = {
  person: '#FF3D71',
  car: '#00D4AA',
  truck: '#FFB800',
  bus: '#6C5CE7',
  fire: '#FF4444',
  smoke: '#888',
  face: '#3B82F6',
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
  /** [任务4] 是否强制使用告警红 (#f56c6c); 默认 true */
  dangerColor?: boolean
}>()

const containerRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
// 图像自然尺寸 (像素坐标 bbox 归一化基准)
const imageSize = ref<{ w: number; h: number }>({ w: 0, h: 0 })

const normalizedBoxes = computed<DetectionBox[]>(() => {
  if (props.detectionBoxes?.length) return props.detectionBoxes
  // [任务4] 多检测源链: detections 数组 > bbox 单框 > metadata 键兑底
  if (props.detections && props.detections.length) {
    const { w: iw, h: ih } = imageSize.value
    return props.detections
      .map((d: any): DetectionBox | null => {
        // 形态1: {x1,y1,x2,y2}
        let x1 = d?.x1, y1 = d?.y1, x2 = d?.x2, y2 = d?.y2
        // 形态2: {x,y,w,h}
        if (x1 === undefined && d?.x !== undefined && d?.w !== undefined) {
          x1 = d.x; y1 = d.y; x2 = d.x + d.w; y2 = d.y + d.h
        }
        // 形态3: [x1,y1,x2,y2]
        if (x1 === undefined && Array.isArray(d) && d.length >= 4) {
          x1 = d[0]; y1 = d[1]; x2 = d[2]; y2 = d[3]
        }
        if (typeof x1 !== 'number' || typeof y1 !== 'number'
          || typeof x2 !== 'number' || typeof y2 !== 'number') return null
        // 像素坐标 -> 归一化 (后续代码逻辑不变)
        if (x1 > 1 || y1 > 1 || x2 > 1 || y2 > 1) {
          if (!iw || !ih) return null
          x1 /= iw; y1 /= ih; x2 /= iw; y2 /= ih
        }
        return {
          x: x1, y: y1,
          w: x2 - x1, h: y2 - y1,
          label: d?.label || d?.class_name || d?.targetLabel || props.targetLabel || 'target',
          confidence: typeof d?.confidence === 'number' ? d.confidence : (typeof d?.score === 'number' ? d.score : 1),
        }
      })
      .filter((b): b is DetectionBox => b !== null)
  }
  if (!props.bbox || props.bbox.length < 4) return []
  let [x1, y1, x2, y2] = props.bbox
  // [vp6-P1.3 2026-09-01] 检测直报链兑底: metadata.detections 为原图像素坐标
  //   (真机 1920x1080 实证), 任一坐标 >1 判定为像素 → 按图像自然尺寸归一化;
  //   自然尺寸未就绪时先不出框, onImageLoad 后重算。
  if (props.bbox.some((v) => v > 1)) {
    const { w, h } = imageSize.value
    if (!w || !h) return []
    x1 /= w; y1 /= h; x2 /= w; y2 /= h
  }
  return [{
    x: x1, y: y1,
    w: x2 - x1, h: y2 - y1,
    label: props.targetLabel || 'target',
    confidence: 1,
  }]
})

function drawBoxes() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container || !normalizedBoxes.value.length) return

  const rect = container.getBoundingClientRect()
  canvas.width = rect.width
  canvas.height = rect.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (const box of normalizedBoxes.value) {
    const x = box.x * canvas.width
    const y = box.y * canvas.height
    const w = box.w * canvas.width
    const h = box.h * canvas.height
    // [任务4] 告警弹窗默认使用 Element Plus 危险色 #f56c6c (与 el-tag type=danger 一致);
    //   dangerColor=false 时仍走原 CLASS_COLORS 颜色分类 (person=红、car=绿等)
    const color = (props.dangerColor !== false)
      ? '#f56c6c'
      : (CLASS_COLORS[box.label] || '#FF3D71')

    // 矩形框
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, w, h)

    // 标签背景 (含置信度百分比, 例如 "person 95%")
    const label = `${box.label} ${Math.round(box.confidence * 100)}%`
    ctx.font = 'bold 11px sans-serif'
    const textWidth = ctx.measureText(label).width + 8
    ctx.fillStyle = color
    ctx.fillRect(x, y - 18, textWidth, 18)

    // 标签文字
    ctx.fillStyle = '#fff'
    ctx.fillText(label, x + 4, y - 5)
  }
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

/** [FEAT 2026-09-02] 下载标注图: 离屏 canvas 按快照原始分辨率合成 (背景+检测框),
 *  复用 normalizedBoxes 与屏幕绘制同款视觉 (色板/label+置信度), 线宽/字号随
 *  分辨率缩放 (屏幕 2px 在 1920 原图上过细)。跨域污染时降级下载原图 */
function downloadAnnotated() {
  const img = containerRef.value?.querySelector('img') as HTMLImageElement | null
  if (!img || !img.naturalWidth) {
    ElMessage.warning('快照尚未加载完成')
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(img, 0, 0)
  const scale = Math.max(1, canvas.width / 640)
  for (const box of normalizedBoxes.value) {
    const x = box.x * canvas.width
    const y = box.y * canvas.height
    const w = box.w * canvas.width
    const h = box.h * canvas.height
    const color = (props.dangerColor !== false)
      ? '#f56c6c'
      : (CLASS_COLORS[box.label] || '#FF3D71')
    ctx.strokeStyle = color
    ctx.lineWidth = 2 * scale
    ctx.strokeRect(x, y, w, h)
    const label = `${box.label} ${Math.round(box.confidence * 100)}%`
    ctx.font = `bold ${Math.round(11 * scale)}px sans-serif`
    const textWidth = ctx.measureText(label).width + 8 * scale
    const th = 18 * scale
    ctx.fillStyle = color
    ctx.fillRect(x, y - th, textWidth, th)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, x + 4 * scale, y - 5 * scale)
  }
  canvas.toBlob((blob) => {
    if (!blob) {
      ElMessage.error('标注图导出失败')
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    a.href = url
    a.download = `alarm-annotated-${ts}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
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
