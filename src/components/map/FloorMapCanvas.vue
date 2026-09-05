<template>
  <div
    ref="wrapEl"
    class="fm-canvas"
    :class="{ 'fm-canvas--edit': editable, 'fm-canvas--pan': panEnabled }"
    :tabindex="panEnabled ? 0 : -1"
    @click="onCanvasClick"
    @wheel.prevent="onWheel"
    @dblclick="resetView"
    @keydown="onKeyDown"
    @mousedown="startPan"
  >
    <!-- ═══ [FLOOR-MAP 2026-09-05 v2] 视口层: 包住 L1/L2/L3 统一 transform 缩放平移
         (海康 iSecure 自由缩放 / 大华滚轮缩放对标); transform-origin 0 0 + 合成层,
         100 点位一次矩阵变换; --fmz 供子元素尺寸反向补偿 (图标/标签/涟漪环视觉恒定) ═══ -->
    <div
      class="fm-canvas__viewport"
      :style="viewportStyle"
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

    <!-- ═══ Layer 2: 设备层 (分类型图标 + 状态色环 + FOV 扇形; 宇视 SVG 落点对标) ═══ -->
    <div class="fm-canvas__cams">
      <template v-for="b in bindings" :key="`${b.map_id}-${b.channel_id}`">
        <!-- FOV 扇形 (conic-gradient 圆裁剪; 复用 AlarmPopup #00E5FF token; 仅 camera — 非摄像头 fov_radius_m=0) -->
        <div
          v-if="fovRadius(b) > 0.02"
          class="fm-canvas__fov"
          :class="{ 'fm-canvas__fov--alarm': devStatus(b) === 'alarm' }"
          :style="fovStyle(b)"
        />
        <div
          class="fm-canvas__cam"
          :class="{
            'fm-canvas__cam--alarm': devStatus(b) === 'alarm',
            'fm-canvas__cam--drag': dragging === b,
            'fm-canvas__cam--primary': b.is_primary,
            'fm-canvas__cam--hl': isHighlighted(b),
            'fm-canvas__cam--clickable': panEnabled,
          }"
          :style="camStyle(b)"
          :title="camTitle(b)"
          @click.stop="onCamClick(b)"
          @mousedown.stop.prevent="startDrag(b, $event)"
        >
          <!-- [P0-1] 分类型图标 (海康 iSecure 全量子系统分图标对标) +
               [P0-3] 状态色环 (绿=在线 灰=离线 红=告警闪烁; stroke 环绕底圆) -->
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
            <circle
              cx="12" cy="12" r="10.4"
              :fill="iconMeta(b.device_type).color"
              :stroke="STATUS_COLOR[devStatus(b)]"
              stroke-width="2"
            />
            <path :d="iconMeta(b.device_type).path" fill="#fff" />
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
      <!-- [P0-2] 栅格吸附对齐辅助线 (拖拽实时十字; Intel OpenVINO 对标) -->
      <template v-if="editable && snapToGrid && dragging && dragPos">
        <div class="fm-canvas__guide fm-canvas__guide--v" :style="{ left: `${dragPos.x * 100}%` }" />
        <div class="fm-canvas__guide fm-canvas__guide--h" :style="{ top: `${dragPos.y * 100}%` }" />
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
    </div><!-- /fm-canvas__viewport -->

    <!-- [FLOOR-MAP 2026-09-05 v2] 缩放控件 (海康/大宇对标; 只读缩放态显示) -->
    <div v-if="panEnabled" class="fm-canvas__zoombar">
      <button type="button" :disabled="view.z >= ZOOM_MAX" @click="zoomBy(1.25)">＋</button>
      <span class="fm-canvas__zoom-read">{{ Math.round(view.z * 100) }}%</span>
      <button type="button" :disabled="view.z <= ZOOM_MIN" @click="zoomBy(1 / 1.25)">−</button>
      <button type="button" class="fm-canvas__zoom-reset" title="复位 (0 / 双击)" @click="resetView">⤢</button>
    </div>

    <div v-if="editable" class="fm-canvas__hint">
      {{ bindings.length ? '点击画布落点摄像头 · 拖拽图标微调' : '点击画布放置摄像头' }}
    </div>
    <div v-else-if="panEnabled" class="fm-canvas__hint">
      滚轮缩放 · 拖拽平移 · 双击复位
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
 *
 * [FLOOR-MAP 2026-09-05 v2] 只读模式缩放平移 (海康 iSecure 自由缩放 / 大华滚轮缩放 /
 *   大宇 DSS 框选放大对标): 滚轮以光标为锚缩放 [1x,4x] + 空白区拖拽平移 + 键盘
 *   +/-/0 + 双击复位; L1/L2/L3 统一走 viewport transform (合成层, 100 点位一次矩阵),
 *   图标/标签/涟漪环尺寸经 --fmz 反向补偿保持视觉恒定 (FOV 扇形与底图等比跟随 —
 *   大华 FOV 实时预览的正确缩放语义); 编辑模式默认关闭 (与落点/拖拽语义冲突)。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { CameraMapBinding, FloorMapDef } from '@/types/floorMap'
import { deviceTypeLabel, deviceIconMeta } from '@/types/floorMap'
import { floorMapApi } from '@/api/floorMap'
import { fovRadiusNormalized, projectAlarmPoint, channelIdVariants, type AlarmMapPoint } from '@/composables/useFloorMap'

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
  /** [P0-2] 栅格吸附开关 (0.02 步长; 密集设备落点防重叠, Intel OpenVINO 对标) */
  snapToGrid?: boolean
  /** [P0-3] 告警中设备映射 (channelId → true; 多设备批量色环, 调用方轮询注入) */
  alarmChannels?: Record<string, boolean>
  /** [FLOOR-MAP 2026-09-05 v2] 缩放平移开关; 缺省 = !editable (只读自动启用, 编辑模式关) */
  panZoom?: boolean
  /** [FLOOR-MAP 2026-09-05 v2] 选中设备通道 (金色光环; 双形态匹配同 alarmChannelId) */
  highlightChannelId?: string
}>(), {
  editable: false,
  alarmChannelId: '',
  alarmMetadata: undefined,
  channelLabels: () => ({}),
  channelOnline: () => ({}),
  snapToGrid: false,
  alarmChannels: () => ({}),
  panZoom: undefined,
  highlightChannelId: '',
})

const emit = defineEmits<{
  (e: 'canvas-click', x: number, y: number): void
  (e: 'binding-move', binding: CameraMapBinding, x: number, y: number): void
  /** [FLOOR-MAP 2026-09-05 v2] 只读模式点击设备点位 (海康通道点击预览对标; AlarmPopup 跳预览) */
  (e: 'device-click', binding: CameraMapBinding): void
}>()

const wrapEl = ref<HTMLElement | null>(null)
const imgError = ref(false)
const imageUrl = computed(() => floorMapApi.getImageUrl(props.map))

// ═══ [FLOOR-MAP 2026-09-05 v2] 缩放平移 (海康自由缩放/大华滚轮缩放对标) ═══
const ZOOM_MIN = 1
const ZOOM_MAX = 4
const panEnabled = computed(() => (props.panZoom === undefined ? !props.editable : props.panZoom))
const view = reactive({ x: 0, y: 0, z: 1 })
// viewport style: 矩阵一次变换; --fmz 供子元素尺寸反向补偿 (图标/标签/涟漪环视觉恒定)
const viewportStyle = computed(() => ({
  transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
  '--fmz': String(view.z),
}))
function clampPan() {
  if (!wrapEl.value) return
  const w = wrapEl.value.clientWidth
  const h = wrapEl.value.clientHeight
  view.x = Math.min(0, Math.max(w * (1 - view.z), view.x))
  view.y = Math.min(0, Math.max(h * (1 - view.z), view.y))
}
// 以画布内坐标 (mx,my)px 为锚缩放: 保持锚点屏幕位置不动 (标准 zoom-at-cursor)
function zoomAt(nz: number, mx = wrapEl.value?.clientWidth ? wrapEl.value.clientWidth / 2 : 0, my = wrapEl.value?.clientHeight ? wrapEl.value.clientHeight / 2 : 0) {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nz))
  if (z === view.z) return
  const k = z / view.z
  view.x = mx - (mx - view.x) * k
  view.y = my - (my - view.y) * k
  view.z = z
  clampPan()
}
function zoomBy(k: number) {
  zoomAt(view.z * k)
}
function onWheel(ev: WheelEvent) {
  if (!panEnabled.value || !wrapEl.value) return
  const rect = wrapEl.value.getBoundingClientRect()
  zoomAt(view.z * Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top)
}
function resetView() {
  if (!panEnabled.value) return
  view.x = 0
  view.y = 0
  view.z = 1
}
function onKeyDown(ev: KeyboardEvent) {
  if (!panEnabled.value) return
  if (ev.key === '+' || ev.key === '=') zoomBy(1.25)
  else if (ev.key === '-') zoomBy(1 / 1.25)
  else if (ev.key === '0') resetView()
  else return
  ev.preventDefault()
}
// 空白区拖拽平移 (编辑模式禁用 — 与落点/图标拖拽语义冲突); 点位 mousedown 已 stop
const panning = ref<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
function startPan(ev: MouseEvent) {
  if (!panEnabled.value || ev.button !== 0) return
  panning.value = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }
  window.addEventListener('mousemove', onPanMove)
  window.addEventListener('mouseup', onPanEnd)
}
function onPanMove(ev: MouseEvent) {
  if (!panning.value) return
  view.x = panning.value.vx + (ev.clientX - panning.value.sx)
  view.y = panning.value.vy + (ev.clientY - panning.value.sy)
  clampPan()
}
function onPanEnd() {
  panning.value = null
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanEnd)
}
// 视口坐标 → 归一化坐标 (逆变换; 编辑模式 view 恒 {0,0,1} → 与旧版逐字节一致)
function toLocalNorm(clientX: number, clientY: number): { x: number; y: number } {
  const rect = wrapEl.value!.getBoundingClientRect()
  return {
    x: (clientX - rect.left - view.x) / (rect.width * view.z),
    y: (clientY - rect.top - view.y) / (rect.height * view.z),
  }
}
// 只读模式点位点击 → emit (海康通道点击展开预览对标); 编辑模式点击无语义
function onCamClick(b: CameraMapBinding) {
  if (!props.editable) emit('device-click', b)
}
// 选中设备金色光环 (双形态匹配, 同 alarmPoint 口径)
function isHighlighted(b: CameraMapBinding): boolean {
  if (!props.highlightChannelId) return false
  return channelIdVariants(props.highlightChannelId).includes(b.channel_id)
}

// ── 设备层 ──
// [P0-1] 分类型图标元数据已提升至 types/floorMap.ts (SSOT; 添加工具箱共用)
const iconMeta = deviceIconMeta
// [P0-3] 设备状态色环: alarm > online > offline (告警最高优先; 红/绿/灰)
type DevStatus = 'alarm' | 'online' | 'offline'
const STATUS_COLOR: Record<DevStatus, string> = {
  alarm: '#F93A55', online: '#22C55E', offline: '#64748B',
}
function devStatus(b: CameraMapBinding): DevStatus {
  if (props.alarmChannels[b.channel_id]) return 'alarm'
  return props.channelOnline[b.channel_id] ? 'online' : 'offline'
}
function isChannelOnline(ch: string): boolean {
  return !!props.channelOnline[ch]
}
// [P0-1] 显示名: 非摄像头用 label, 摄像头走 channelLabels 动态解析
function camLabel(b: CameraMapBinding): string {
  if (b.device_type && b.device_type !== 'camera') return b.label || ''
  return props.channelLabels[b.channel_id] || ''
}
function camTitle(b: CameraMapBinding): string {
  const t = deviceTypeLabel(b.device_type || 'camera')
  const label = camLabel(b)
  return `${t}${label ? ' · ' + label : ''} · ${b.channel_id}${b.is_primary ? ' · 主图' : ''}`
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
// [P0-2] 栅格吸附 (0.02 步长 ≈ 画布 2%; 密集落点防重叠, Intel OpenVINO 对标)
const GRID_STEP = 0.02
function snap(v: number): number {
  if (!props.snapToGrid) return v
  return Math.round(v / GRID_STEP) * GRID_STEP
}
function onCanvasClick(ev: MouseEvent) {
  if (!props.editable || !wrapEl.value) return
  const p = toLocalNorm(ev.clientX, ev.clientY)
  const x = Math.min(1, Math.max(0, p.x))
  const y = Math.min(1, Math.max(0, p.y))
  emit('canvas-click', snap(x), snap(y))
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
  const p = toLocalNorm(ev.clientX, ev.clientY)
  // [P0-2] 拖拽实时吸附 + 越界 clamp (辅助线随吸附点移动)
  dragPos.value = {
    x: snap(Math.min(1, Math.max(0, p.x))),
    y: snap(Math.min(1, Math.max(0, p.y))),
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
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanEnd)
})
// [FLOOR-MAP 2026-09-05 v2] 换图复位视口 (多图/楼层切换后不应残留平移缩放态)
watch(() => props.map.id, () => {
  view.x = 0
  view.y = 0
  view.z = 1
})

// ── 告警层: 落点 + bbox ──
// [FIX 2026-09-05 平面图未关联] 告警 channel_id (裸 20 位) 与绑定库 channel_id
//   (..._ch0 双流形态) 精确匹配失配 → 涟漪不渲染; 双形态变体集合匹配 (同 mapsByChannel)。
const alarmPoint = computed<AlarmMapPoint | null>(() => {
  if (!props.alarmChannelId) return null
  const chSet = new Set(channelIdVariants(props.alarmChannelId))
  const b = props.bindings.find((x) => chSet.has(x.channel_id))
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
/* [FLOOR-MAP 2026-09-05 v2] 只读缩放态: 平移手型 + 聚焦可见 */
.fm-canvas--pan { cursor: grab; outline: none; }
.fm-canvas--pan:active { cursor: grabbing; }
.fm-canvas--pan:focus-visible { box-shadow: 0 0 0 1px rgba(0, 229, 255, 0.45) inset; }

/* ── [FLOOR-MAP 2026-09-05 v2] 视口层: 统一矩阵变换 (合成层, 100 点位一次变换) ── */
.fm-canvas__viewport {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
  will-change: transform;
}

/* ── [FLOOR-MAP 2026-09-05 v2] 缩放控件 (海康/大宇对标) ── */
.fm-canvas__zoombar {
  position: absolute;
  right: 8px;
  top: 8px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  background: rgba(5, 14, 48, 0.82);
  border: 1px solid #3A5A8C;
  border-radius: 4px;
}
.fm-canvas__zoombar button {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #3294ED;
  border-radius: 3px;
  background: rgba(50, 148, 237, 0.12);
  color: #B7CDE6;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.fm-canvas__zoombar button:hover:not(:disabled) { background: rgba(50, 148, 237, 0.35); }
.fm-canvas__zoombar button:disabled { opacity: 0.35; cursor: default; }
.fm-canvas__zoom-read {
  min-width: 38px;
  text-align: center;
  color: #00E5FF;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.fm-canvas__zoom-reset { font-size: 12px; }

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
/* [FLOOR-MAP 2026-09-05 v2] 尺寸反向补偿: viewport 缩放后图标/标签/状态点/坐标读数
   保持视觉恒定 (--fmz 继承自 viewport); FOV 扇形不补偿 — 与底图等比跟随才是正确语义 */
.fm-canvas__cam svg,
.fm-canvas__cam-dot,
.fm-canvas__cam-label,
.fm-canvas__cam-coords {
  transform: scale(calc(1 / var(--fmz, 1)));
}
/* [FLOOR-MAP 2026-09-05 v2] 只读态点位可点击 (跳实时预览) + 选中金色光环 (大华室内外联动对标) */
.fm-canvas__cam--clickable { cursor: pointer; }
.fm-canvas__cam--hl {
  z-index: 6;
  filter: drop-shadow(0 0 10px rgba(244, 180, 0, 0.95));
}
.fm-canvas__cam--hl::after {
  content: '';
  position: absolute;
  inset: -5px;
  border: 1.5px dashed rgba(244, 180, 0, 0.9);
  border-radius: 50%;
  animation: fm-hl-pulse 1.2s ease-in-out infinite;
}
@keyframes fm-hl-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.25); opacity: 0.55; }
}
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

/* ── [P0-2] 栅格吸附对齐辅助线 (拖拽十字虚线) ── */
.fm-canvas__guide {
  position: absolute;
  z-index: 4;
  pointer-events: none;
}
.fm-canvas__guide--v {
  top: 0; bottom: 0; width: 0;
  border-left: 1px dashed rgba(0, 229, 255, 0.55);
}
.fm-canvas__guide--h {
  left: 0; right: 0; height: 0;
  border-top: 1px dashed rgba(0, 229, 255, 0.55);
}
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
  transform: translate(-50%, -50%) scale(calc(1 / var(--fmz, 1)));
  width: 12px; height: 12px;
  background: #F93A55;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(249, 58, 85, 0.9);
}
.fm-canvas__ripple-ring {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%) scale(calc(1 / var(--fmz, 1)));
  width: 14px; height: 14px;
  border: 2px solid rgba(249, 58, 85, 0.85);
  border-radius: 50%;
  /* [FLOOR-MAP 2026-09-04] 涟漪 0.4s 半径扩散 (英伟达 Metropolis 对标,
     原 1.6s 偏缓; 双环 0.2s 交错保持连续告警节奏) */
  animation: fm-ripple 0.4s ease-out infinite;
}
.fm-canvas__ripple-ring--2 { animation-delay: 0.2s; }
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
