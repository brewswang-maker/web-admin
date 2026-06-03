<template>
  <div class="alarm-snapshot" ref="containerRef">
    <el-image
      v-if="imageUrl"
      :src="imageUrl"
      fit="contain"
      style="width:100%;height:100%;border-radius:6px;background:#0a0c10"
      :preview-src-list="[imageUrl]"
      :preview-teleported="true"
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
  </div>
</template>

<script setup lang="ts">
/**
 * AlarmSnapshot.vue — 告警快照 + 检测框叠加
 *
 * 在告警快照图片上叠加 Canvas 绘制的 detection boxes。
 * 坐标从归一化 (0-1) 转为像素坐标。
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue'

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
}>()

const containerRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()

const normalizedBoxes = computed<DetectionBox[]>(() => {
  if (props.detectionBoxes?.length) return props.detectionBoxes
  // 从原始 bbox 转换
  if (props.bbox && props.bbox.length >= 4) {
    const [x1, y1, x2, y2] = props.bbox
    return [{
      x: x1, y: y1,
      w: x2 - x1, h: y2 - y1,
      label: props.targetLabel || 'target',
      confidence: 1,
    }]
  }
  return []
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
    const color = CLASS_COLORS[box.label] || '#FF3D71'

    // 矩形框
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, w, h)

    // 标签背景
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

// 图片加载完成后绘制
watch(() => props.imageUrl, () => {
  nextTick(() => {
    setTimeout(drawBoxes, 200) // 等待图片渲染
  })
})

onMounted(() => {
  nextTick(() => setTimeout(drawBoxes, 300))
})
</script>

<style scoped>
.alarm-snapshot {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;
  background: #0a0c10;
  border-radius: 6px;
  overflow: hidden;
}
.alarm-snapshot__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.alarm-snapshot__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 200px;
  color: #4a4d58;
  font-size: 14px;
}
</style>
