<template>
  <div
    ref="wrapEl"
    class="fm-canvas"
    :class="{ 'fm-canvas--edit': editable }"
    @click="onCanvasClick"
  >
    <!-- ═══ Layer 1: 底图 (OpenVINO 三层 z-index 分离对标) ═══ -->
    <div class="fm-canvas__base">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        class="fm-canvas__img"
        draggable="false"
        alt=""
        @error="imgError = true"
        @load="imgError = false"
      >
      <div v-if="!imageUrl || imgError" class="fm-canvas__empty">
        <svg viewBox="0 0 48 48" width="44" height="44">
          <rect x="5" y="8" width="38" height="30" fill="none" stroke="#3A5A8C" stroke-width="2" />
          <path d="M5 18h38M17 18v20" stroke="#3A5A8C" stroke-width="2" />
        </svg>
        <span>{{ imageUrl ? '底图加载失败' : '未上传底图' }}</span>
      </div>
      <div class="fm-canvas__meta">
        <span>{{ map.floor || map.building || map.name }}</span>
        <span v-if="map.scale_m_per_px > 0" class="fm-canvas__meta-scale">
          比例尺 1px = {{ map.scale_m_per_px }}m
        </span>
      </div>
    </div>

    <!-- ═══ Layer 2: 摄像头层 (图标 + 在线状态点 + FOV 扇形; 宇视 SVG 落点对标) ═══ -->
    <div class="fm-canvas__cams">
      <template v-for="b in bindings" :key="`${b.map_id}-${b.channel_id}`">
        <!-- FOV 扇形 (conic-gradient 圆裁剪; 复用 AlarmPopup #00E5FF token) -->
        <div
          v-if="fovRadius(b) > 0.02"
          class="fm-canvas__fov"
          :class="{ 'fm-canvas__fov--alarm': b.channel_id === alarmChannelId }"
          :style="fovStyle(b)"
        />
        <div
          class="fm-canvas__cam"
          :class="{
            'fm-canvas__cam--alarm': b.channel_id === alarmChannelId,
            'fm-canvas__cam--drag': dragging === b,
            'fm-canvas__cam--primary': b.is_primary,
          }"
          :style="camStyle(b)"
          :title="camTitle(b)"
          @click.stop
          @mousedown.stop.prevent="startDrag(b, $event)"
        >
          <!-- 摄像头图标 (AlarmPopup L166-170 同款 SVG) -->
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
            <circle cx="12" cy="12" r="11" :fill="b.channel_id === alarmChannelId ? '#F93A55' : '#3294ED'" />
            <path d="M8 9.5 16.5 7v7L8 12.5z" fill="#fff" />
            <circle cx="12" cy="12" r="2.2" fill="#0a1a35" />
          </svg>
          <!-- 在线状态点 (海康图标闪烁对标; channelStore 在线态由调用方注入) -->
          <span
            class="fm-canvas__cam-dot"
            :class="isChannelOnline(b.channel_id) ? 'is-on' : 'is-off'"
          />
          <span v-if="camLabel(b)" class="fm-canvas__cam-label">{{ camLabel(b) }}</span>
          <!-- 拖拽实时坐标 (图标上方; 归一化百分比, 宇视落点精调辅助对标) -->
          <span v-if="dragging === b && dragPos" class="fm-canvas__cam-coords">
            {{ Math.round(dragPos.x * 100) }}, {{ Math.round(dragPos.y * 100) }}
          </span>
        </div>
      </template>
    </div>

    <!-- ═══ Layer 3: 告警层 (落点涟漪 + bbox 叠加; 极视角/Metropolis 对标) ═══ -->
    <div v-if="alarmPoint" class="fm-canvas__alarm">
      <div class="fm-canvas__ripple" :style="pointStyle(alarmPoint)">
        <span class="fm-canvas__ripple-ring" />
        <span class="fm-canvas__ripple-ring fm-canvas__ripple-ring--2" />
        <span class="fm-canvas__ripple-core" />
        <!-- bbox 叠加: 按告警 bbox 宽高比等比缩放 (Metropolis 对标) -->
        <div v-if="alarmBbox" class="fm-canvas__bbox" :style="bboxStyle" />
      </div>
      <div class="fm-canvas__approx-tip">近似定位 (无标定数据, FOV 扇形内投影)</div>
    </div>

    <div v-if="editable" class="fm-canvas__hint">
      {{ bindings.length ? '点击画布落点摄像头 · 拖拽图标微调' : '点击画布放置摄像头' }}
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * [FLOOR-MAP 2026-09-03] 平面图可复用渲染画布 — 编辑/只读双模式
 *
 * 三层 z-index 分离 (Intel OpenVINO 分层对标):
 *   L1 底图层 (image/占位) → L2 摄像头层 (图标+在线点+FOV 扇形) → L3 告警层 (涟漪+bbox)
 *
 * FOV 扇形: conic-gradient 真·圆扇形 (0deg=上, 顺时针), 复用 AlarmPopup
 *   #00E5FF token; 告警通道扇形转 #F93A55。
 * 告警落点: useFloorMap.projectAlarmPoint (bbox 画面 x → 扇形角度近似投影)。
 * 编辑交互: 画布点击落点 + 图标拖拽微调 (宇视 SVG 编辑器对标)。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import type { CameraMapBinding, FloorMapDef } from '@/types/floorMap'
import { floorMapApi } from '@/api/floorMap'
import { fovRadiusNormalized, projectAlarmPoint, type AlarmMapPoint } from '@/composables/useFloorMap'

const props = withDefaults(defineProps<{
  map: FloorMapDef
  bindings: CameraMapBinding[]
  /** 编辑模式: 点击落点 + 拖拽微调 */
  editable?: boolean
  /** 告警通道 (高亮 + 落点渲染; AlarmPopup 消费) */
  alarmChannelId?: string
  /** 告警 metadata (bbox 提取) */
  alarmMetadata?: Record<string, unknown>
  /** 通道名映射 (channelId → 显示名) */
  channelLabels?: Record<string, string>
  /** 通道在线态映射 (channelId → online) */
  channelOnline?: Record<string, boolean>
}>(), {
  editable: false,
  alarmChannelId: '',
  alarmMetadata: undefined,
  channelLabels: () => ({}),
  channelOnline: () => ({}),
})

const emit = defineEmits<{
  (e: 'canvas-click', x: number, y: number): void
  (e: 'binding-move', binding: CameraMapBinding, x: number, y: number): void
}>()

const wrapEl = ref<HTMLElement | null>(null)
const imgError = ref(false)
const imageUrl = computed(() => floorMapApi.getImageUrl(props.map))

// ── 摄像头层 ──
function isChannelOnline(ch: string): boolean {
  return !!props.channelOnline[ch]
}
function camLabel(b: CameraMapBinding): string {
  return props.channelLabels[b.channel_id] || ''
}
function camTitle(b: CameraMapBinding): string {
  const label = camLabel(b)
  return `${label ? label + ' · ' : ''}${b.channel_id}${b.is_primary ? ' · 主图' : ''}`
}
function camStyle(b: CameraMapBinding) {
  const pos = dragging.value === b ? dragPos.value : null
  const x = (pos?.x ?? b.pos_x) * 100
  const y = (pos?.y ?? b.pos_y) * 100
  return { left: `${x}%`, top: `${y}%` }
}
function fovRadius(b: CameraMapBinding): number {
  return fovRadiusNormalized(b, props.map)
}
function fovStyle(b: CameraMapBinding) {
  const r = fovRadius(b)
  // 拖拽跟随: 与 camStyle 同源取 dragPos — 图标与扇形同步移动 (宇视落点精调对标,
  //   否则拖拽中扇形留在原地造成视觉断裂)
  const pos = dragging.value === b ? dragPos.value : null
  const x = (pos?.x ?? b.pos_x) * 100
  const y = (pos?.y ?? b.pos_y) * 100
  const from = b.fov_yaw - 45
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${r * 200}%`,
    height: `${r * 200}%`,
    background:
      `conic-gradient(from ${from}deg, transparent 0deg, ` +
      `rgba(0, 229, 255, 0.30) 2deg, rgba(0, 229, 255, 0.10) 88deg, transparent 90deg)`,
  }
}

// ── 编辑交互: 画布点击落点 ──
function onCanvasClick(ev: MouseEvent) {
  if (!props.editable || !wrapEl.value) return
  const rect = wrapEl.value.getBoundingClientRect()
  const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
  const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height))
  emit('canvas-click', x, y)
}

// ── 编辑交互: 图标拖拽微调 (mousedown → window mousemove → mouseup) ──
const dragging = ref<CameraMapBinding | null>(null)
const dragPos = ref<{ x: number; y: number } | null>(null)
function startDrag(b: CameraMapBinding, _ev: MouseEvent) {
  if (!props.editable) return
  dragging.value = b
  dragPos.value = { x: b.pos_x, y: b.pos_y }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}
function onDragMove(ev: MouseEvent) {
  if (!dragging.value || !wrapEl.value) return
  const rect = wrapEl.value.getBoundingClientRect()
  dragPos.value = {
    x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
  }
}
function onDragEnd() {
  if (dragging.value && dragPos.value) {
    emit('binding-move', dragging.value, dragPos.value.x, dragPos.value.y)
  }
  dragging.value = null
  dragPos.value = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
})

// ── 告警层: 落点 + bbox ──
const alarmPoint = computed<AlarmMapPoint | null>(() => {
  if (!props.alarmChannelId) return null
  const b = props.bindings.find((x) => x.channel_id === props.alarmChannelId)
  if (!b) return null
  return projectAlarmPoint(b, props.map, props.alarmMetadata)
})
const alarmBbox = computed<[number, number, number, number] | null>(() => {
  const m = props.alarmMetadata
  if (!m) return null
  for (const k of ['bbox', 'box', 'target_bbox']) {
    const v = m[k]
    if (Array.isArray(v) && v.length >= 4 && v.every((n) => typeof n === 'number')) {
      return [v[0], v[1], v[2], v[3]] as [number, number, number, number]
    }
  }
  return null
})
function pointStyle(p: AlarmMapPoint) {
  return { left: `${p.x * 100}%`, top: `${p.y * 100}%` }
}
const bboxStyle = computed(() => {
  const bb = alarmBbox.value
  if (!bb) return {}
  // bbox 等比缩放: 宽取画布 8% × bbox 宽高比, 高联动 (示意目标尺寸)
  const w = Math.max(0.05, (bb[2] - bb[0]) * 0.12)
  const h = Math.max(0.05, (bb[3] - bb[1]) * 0.12)
  return {
    width: `${w * 100}%`,
    height: `${h * 100}%`,
    left: `${-w * 50}%`,
    top: `${-h * 50}%`,
  }
})
</script>

<style scoped>
/* ═══ 画布容器 (三层 z-index 分离) ═══ */
.fm-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  overflow: hidden;
  background: linear-gradient(135deg, #1F2D4A 0%, #2A3F66 50%, #1F2D4A 100%);
  border-radius: 4px;
  user-select: none;
}
.fm-canvas--edit { cursor: crosshair; }

/* ── L1 底图层 ── */
.fm-canvas__base { position: absolute; inset: 0; z-index: 1; }
.fm-canvas__img {
  width: 100%; height: 100%;
  object-fit: contain;
  display: block;
}
.fm-canvas__empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px;
  color: #4a5e80; font-size: 12px;
}
.fm-canvas__meta {
  position: absolute; left: 8px; top: 8px;
  display: flex; gap: 8px; align-items: center;
  padding: 3px 10px;
  background: rgba(5, 14, 48, 0.78);
  border: 1px solid #3A5A8C;
  border-radius: 3px;
  color: #B7CDE6; font-size: 11px;
  pointer-events: none;
}
.fm-canvas__meta-scale { color: #00E5FF; }

/* ── L2 摄像头层 ── */
.fm-canvas__cams {
  position: absolute; inset: 0; z-index: 2;
}
.fm-canvas__fov {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: none;
  animation: fm-fov-pulse 2.4s ease-in-out infinite;
}
.fm-canvas__fov--alarm { animation-duration: 1.2s; }
@keyframes fm-fov-pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
.fm-canvas__cam {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex; align-items: center; justify-content: center;
  filter: drop-shadow(0 0 6px rgba(50, 148, 237, 0.55));
  cursor: grab;
}
.fm-canvas--edit .fm-canvas__cam { cursor: move; }
.fm-canvas__cam--drag { cursor: grabbing; z-index: 5; }
.fm-canvas__cam--alarm {
  filter: drop-shadow(0 0 8px rgba(249, 58, 85, 0.8));
  animation: fm-cam-blink 1s ease-in-out infinite;
}
@keyframes fm-cam-blink {
  0%, 100% { opacity: 0.75; }
  50% { opacity: 1; }
}
.fm-canvas__cam-dot {
  position: absolute; right: -1px; bottom: -1px;
  width: 9px; height: 9px;
  border-radius: 50%;
  border: 1.5px solid #050E30;
}
.fm-canvas__cam-dot.is-on {
  background: #22C55E;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.8);
}
.fm-canvas__cam-dot.is-off { background: #64748B; }
.fm-canvas__cam-label {
  position: absolute; top: 100%;
  margin-top: 3px;
  padding: 1px 6px;
  white-space: nowrap;
  background: rgba(5, 14, 48, 0.85);
  border-radius: 2px;
  color: #B7CDE6; font-size: 10px;
  pointer-events: none;
}
.fm-canvas__cam--primary .fm-canvas__cam-label { color: #00E5FF; }
.fm-canvas__cam-coords {
  position: absolute; bottom: 100%;
  margin-bottom: 3px;
  padding: 1px 6px;
  white-space: nowrap;
  background: rgba(5, 14, 48, 0.9);
  border: 1px solid #3294ED;
  border-radius: 2px;
  color: #00E5FF; font-size: 10px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* ── L3 告警层 ── */
.fm-canvas__alarm {
  position: absolute; inset: 0; z-index: 3;
  pointer-events: none;
}
.fm-canvas__ripple {
  position: absolute;
  transform: translate(-50%, -50%);
}
.fm-canvas__ripple-core {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: 12px; height: 12px;
  background: #F93A55;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(249, 58, 85, 0.9);
}
.fm-canvas__ripple-ring {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: 14px; height: 14px;
  border: 2px solid rgba(249, 58, 85, 0.85);
  border-radius: 50%;
  animation: fm-ripple 1.6s ease-out infinite;
}
.fm-canvas__ripple-ring--2 { animation-delay: 0.8s; }
@keyframes fm-ripple {
  0% { width: 14px; height: 14px; opacity: 1; }
  100% { width: 64px; height: 64px; opacity: 0; }
}
.fm-canvas__bbox {
  position: absolute;
  border: 1.5px solid #F93A55;
  background: rgba(249, 58, 85, 0.12);
  border-radius: 2px;
}
.fm-canvas__approx-tip {
  position: absolute; right: 8px; bottom: 8px;
  padding: 2px 8px;
  background: rgba(5, 14, 48, 0.78);
  border: 1px solid #3A5A8C;
  border-radius: 3px;
  color: #8aa3c7; font-size: 10px;
}

/* ── 编辑提示 ── */
.fm-canvas__hint {
  position: absolute; left: 50%; bottom: 8px;
  transform: translateX(-50%);
  padding: 2px 10px;
  background: rgba(5, 14, 48, 0.78);
  border: 1px solid #3A5A8C;
  border-radius: 3px;
  color: #8aa3c7; font-size: 11px;
  pointer-events: none;
  z-index: 4;
}
</style>
