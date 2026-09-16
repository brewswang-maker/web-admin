<template>
  <div
    ref="wrapEl"
    class="fm-canvas"
    :class="{ 'fm-canvas--edit': editable, 'fm-canvas--pan': panEnabled, 'fm-canvas--tool': !!toolMode }"
    :tabindex="panEnabled ? 0 : -1"
    @click="onCanvasClick"
    @wheel.prevent="onWheel"
    @dblclick="resetView"
    @keydown="onKeyDown"
    @mousedown="startPan"
    @mousemove="onGhostMove"
    @mouseleave="ghostPos = null"
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
      <template v-for="b in visibleBindings" :key="`${b.map_id}-${b.channel_id}`">
        <!-- FOV 扇形 (conic-gradient 真·圆扇形; [P2-9] 布防态橙色 — 报警红环仍优先) -->
        <div
          v-if="fovRadius(b) > 0.02"
          class="fm-canvas__fov"
          :class="{
            'fm-canvas__fov--alarm': devStatus(b) === 'alarm',
            'fm-canvas__fov--defense': devStatus(b) !== 'alarm' && defenseRules(b).length > 0,
          }"
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
            /* [v4-B8] 摄像头明确离线 → 图标 dim (opacity+灰度); 非网络设备不 dim */
            'fm-canvas__cam--off': devStatus(b) === 'offline' && b.device_type === 'camera',
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
          <span v-if="showLabels && camLabel(b)" class="fm-canvas__cam-label">{{ camLabel(b) }}</span>
          <!-- 拖拽实时坐标 (图标上方; 归一化百分比, 宇视落点精调辅助对标) -->
          <span v-if="dragging === b && dragPos" class="fm-canvas__cam-coords">
            {{ Math.round(dragPos.x * 100) }}, {{ Math.round(dragPos.y * 100) }}
          </span>
          <!-- [P2-9] 布防角标: 绑定规则数 (右上金色; 与右下在线点错位; >9 折叠) -->
          <span v-if="defenseRules(b).length" class="fm-canvas__cam-def">
            {{ defenseRules(b).length > 9 ? '9+' : defenseRules(b).length }}
          </span>
        </div>
      </template>
      <!-- [P0-2] 栅格吸附对齐辅助线 (拖拽实时十字; Intel OpenVINO 对标) -->
      <template v-if="editable && snapToGrid && dragging && dragPos">
        <div class="fm-canvas__guide fm-canvas__guide--v" :style="{ left: `${dragPos.x * 100}%` }" />
        <div class="fm-canvas__guide fm-canvas__guide--h" :style="{ top: `${dragPos.y * 100}%` }" />
      </template>
      <!-- [v4-C10] 落点幽灵图标: 待落点时跟随光标 (类型色半透明 + 虚线环; snap 预览) -->
      <div
        v-if="ghostType && ghostPos"
        class="fm-canvas__ghost"
        :style="{ left: `${ghostPos.x * 100}%`, top: `${ghostPos.y * 100}%`, '--gc': iconMeta(ghostType).color }"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
          <circle cx="12" cy="12" r="10.4" :fill="iconMeta(ghostType).color" opacity="0.5" stroke-dasharray="0" />
          <path :d="iconMeta(ghostType).path" fill="#fff" opacity="0.8" />
        </svg>
      </div>
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

    <!-- ═══ [P2-11a iSC「标记」对标] 自定义标记层: 旗标 + 名称 (viewport 内跟随缩放;
         点击标记由宿主确认删除; --fmz 反向补偿视觉恒定) ═══ -->
    <div v-if="pins.length" class="fm-canvas__pins">
      <div
        v-for="pin in pins" :key="pin.id"
        class="fm-canvas__pin"
        :style="{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }"
        :title="`${pin.name}（点击可删除）`"
        @click.stop="emit('pin-click', pin)"
        @mousedown.stop
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path d="M7 21V3.6l12.5 3.8L7 11.4" fill="#F4B400" stroke="#B7860B" stroke-width="1.4" stroke-linejoin="round" />
        </svg>
        <span class="fm-canvas__pin-label">{{ pin.name }}</span>
      </div>
    </div>

    <!-- ═══ [P1-3 2026-09-16 iSC「测距」工具对标] 测距层: 两点端点 + 线段 + 中点距离标签
         (viewport 内跟随缩放平移; 线宽/字号经 --fmz 反向补偿视觉恒定) ═══ -->
    <div v-if="measurePts.length" class="fm-canvas__measure">
      <span
        v-for="(p, i) in measurePts" :key="i"
        class="fm-canvas__measure-pt"
        :style="{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }"
      />
      <span v-if="measurePts.length === 2" class="fm-canvas__measure-line" :style="measureLineStyle" />
      <span
        v-if="measurePts.length === 2 && measureText"
        class="fm-canvas__measure-dist"
        :style="measureLabelStyle"
      >{{ measureText }}</span>
    </div>

    <!-- ═══ [P1-4 大华 DSS 框选对标] 框选层: 拖拽蓝色半透明选框 (viewport 内跟随缩放) ═══ -->
    <div v-if="marqueeRect" class="fm-canvas__marquee" :style="marqueeStyle" />
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { CameraMapBinding, FloorMapDef, FloorMapDeviceType, MapPin } from '@/types/floorMap'
import { deviceTypeLabel, deviceIconMeta, parseMapViewport } from '@/types/floorMap'
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
  /** [v4-C10] 落点幽灵图标设备类型 (待落点选中通道/编号后跟随光标; '' = 关闭) */
  ghostType?: FloorMapDeviceType | ''
  /** [P0-1 2026-09-16 iSC 初始视野对标] 持久化初始视野: 载入时应用 map.viewport,
   *  缩放/平移/复位后 emit viewport-change 由宿主 PATCH 落库 (编辑模式不生效) */
  persistViewport?: boolean
  /** [P0-3 2026-09-16 iSC「快速定位」对标] 聚焦通道 → 定位居中 (金色光环走 highlightChannelId) */
  focusChannelId?: string
  /** [P0-4 2026-09-16 iSC「过滤资源点」对标] 隐藏的设备类型 (图层过滤; 告警层不受影响) */
  hiddenDeviceTypes?: string[]
  /** [P1-2 2026-09-16 iSC「名称显示」开关对标] 点位名称标签显隐 (default true) */
  showLabels?: boolean
  /** [P1-3/P1-4 2026-09-16 iSC 测距/框选对标] 工具态: ''=默认平移; 'measure'=测距 (点击取点);
   *  'marquee'=框选 (拖拽选点位); [P2-11a] 'pin'=标记 (点击放置)。非 '' 态空白拖拽平移短路,
   *  滚轮缩放/zoombar 保留 */
  toolMode?: string
  /** [P2-9 2026-09-16 iSC「虚拟防区上图」对标] 布防通道映射 (binding.channel_id → 绑定规则名
   *  列表; 宿主由联动规则 spatial_cond.bound_channel_ids 归一匹配后注入。规则 ROI 为画面
   *  坐标, 平面图无单应标定不可精确上图 → FOV 扇形橙色布防态 + 规则数角标即通道防区的
   *  平面表达) */
  defenseChannels?: Record<string, string[]>
  /** [P2-11a 2026-09-16 iSC「标记」对标] 自定义标记列表 (宿主 localStorage 按图持久化;
   *  纯显示层, 点击标记由宿主确认删除) */
  pins?: MapPin[]
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
  ghostType: '',
  persistViewport: false,
  focusChannelId: '',
  hiddenDeviceTypes: () => [],
  showLabels: true,
  toolMode: '',
  defenseChannels: () => ({}),
  pins: () => [],
})

const emit = defineEmits<{
  (e: 'canvas-click', x: number, y: number): void
  (e: 'binding-move', binding: CameraMapBinding, x: number, y: number): void
  /** [FLOOR-MAP 2026-09-05 v2] 只读模式点击设备点位 (海康通道点击预览对标; AlarmPopup 跳预览) */
  (e: 'device-click', binding: CameraMapBinding): void
  /** [P0-1 2026-09-16 iSC 初始视野对标] 视野变更 (缩放/平移/复位后防抖 emit; 宿主 PATCH 落库) */
  (e: 'viewport-change', v: { x: number; y: number; z: number }): void
  /** [P1-3] 工具态下按 ESC → 请求宿主退出工具态 (清当前测量/选框) */
  (e: 'tool-cancel'): void
  /** [P1-4] 框选态 mouseup → 命中点位列表 (可能为空数组, 由宿主提示) */
  (e: 'marquee-select', bindings: CameraMapBinding[]): void
  /** [P2-11a] 标记态点击底图 → 放置标记 (归一化坐标, 点位图标 @click.stop 不冒泡不误采) */
  (e: 'pin-add', x: number, y: number): void
  /** [P2-11a] 点击已有标记 → 宿主确认删除 */
  (e: 'pin-click', pin: MapPin): void
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
  scheduleViewportEmit()
}
// ═══ [P0-1 2026-09-16 iSC 初始视野对标] 初始视野应用 + 变更持久化 ═══
// 载入/换图时应用 map.viewport (z clamp 到 [1,4]); 缩放/平移/复位结束后防抖 emit
// (wheel 连续滚动/拖拽过程不发请求 — 500ms 静默后合一发)。persistViewport=false
// (默认) 行为与旧版完全一致: 视野不落库。
let viewportEmitTimer: ReturnType<typeof setTimeout> | undefined
function scheduleViewportEmit() {
  if (!props.persistViewport || props.editable) return
  clearTimeout(viewportEmitTimer)
  viewportEmitTimer = setTimeout(() => {
    emit('viewport-change', { x: view.x, y: view.y, z: view.z })
  }, 500)
}
function applyViewportFromMap() {
  const vp = parseMapViewport(props.map.viewport)
  if (!vp) {
    view.x = 0; view.y = 0; view.z = 1
    return
  }
  view.z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vp.z))
  view.x = vp.x
  view.y = vp.y
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
  scheduleViewportEmit()
}
function onKeyDown(ev: KeyboardEvent) {
  if (!panEnabled.value) return
  if (ev.key === '+' || ev.key === '=') zoomBy(1.25)
  else if (ev.key === '-') zoomBy(1 / 1.25)
  else if (ev.key === '0') resetView()
  else if (ev.key === 'Escape' && props.toolMode) {
    // [P1-3] 工具态 ESC: 清当前测量/选框并退出工具态 (宿主同步按钮高亮复位)
    measurePts.value = []
    emit('tool-cancel')
    ev.preventDefault()
  }
  else return
  ev.preventDefault()
}
// 空白区拖拽平移 (编辑模式禁用 — 与落点/图标拖拽语义冲突); 点位 mousedown 已 stop
const panning = ref<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
function startPan(ev: MouseEvent) {
  if (!panEnabled.value || ev.button !== 0) return
  if (props.toolMode === 'marquee') { startMarquee(ev); return } // [P1-4] 拖拽=选框
  if (props.toolMode) return // [P1-3] 测距态点击=取点 — 平移短路
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
  scheduleViewportEmit()
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
// [P0-4 2026-09-16 iSC「过滤资源点」对标] 图层过滤: 图钉/名称/FOV 按类型显隐;
//   编辑模式恒全量 (落点语义), 告警层 (L3 涟漪/色环) 不过滤 — 报警始终可见
const visibleBindings = computed(() => {
  const hidden = props.hiddenDeviceTypes
  if (!hidden?.length || props.editable) return props.bindings
  return props.bindings.filter((b) => !hidden.includes(b.device_type))
})
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
// ── [P2-9 2026-09-16 iSC「虚拟防区上图」对标] 布防通道: 绑定 enabled 规则的通道以 FOV
//    扇形橙色布防态 + 规则数角标呈现 (alarm 红色优先 — alarm > defense > 默认青;
//    数据源宿主 getAllRules(enabled_only) → spatial_cond.bound_channel_ids 归一匹配) ──
function defenseRules(b: CameraMapBinding): string[] {
  return props.defenseChannels[b.channel_id] || []
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
  // [P2-9] 布防信息: 规则数 + 前 3 条规则名 (tooltip 溯源「该防区由哪些规则看守」)
  const rules = defenseRules(b)
  const defInfo = rules.length
    ? ` · 布防: ${rules.length} 规则(${rules.slice(0, 3).join('、')}${rules.length > 3 ? ` 等${rules.length}条` : ''})`
    : ''
  return `${t}${label ? ' · ' + label : ''} · ${b.channel_id}${defInfo}${b.is_primary ? ' · 主图' : ''}`
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
  // [P2-9] 扇形布防态橙色; alarm 保持既有视觉 (青扇形 + 红色色环 + 加速脉动) 不变
  const isDef = devStatus(b) !== 'alarm' && defenseRules(b).length > 0
  const c1 = isDef ? 'rgba(244, 180, 0, 0.26)' : 'rgba(0, 229, 255, 0.30)'
  const c2 = isDef ? 'rgba(244, 180, 0, 0.08)' : 'rgba(0, 229, 255, 0.10)'
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${r * 200}%`,
    height: `${r * 200}%`,
    background:
      `conic-gradient(from ${from}deg, transparent 0deg, ` +
      `${c1} 2deg, ${c2} 88deg, transparent 90deg)`,
  }
}

// ── [P1-4 2026-09-16 大华 DSS 框选对标] 框选批量预览: 空白区拖拽蓝色选框,
// mouseup 计算归一化矩形命中的点位 (visibleBindings 内, 中心点入框) → emit;
// 框内 0 点也 emit 空数组由宿主提示 (值班快速开画面语义)。
const marqueeRect = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
const marqueeStyle = computed(() => {
  const r = marqueeRect.value
  if (!r) return {}
  return {
    left: `${Math.min(r.x0, r.x1) * 100}%`,
    top: `${Math.min(r.y0, r.y1) * 100}%`,
    width: `${Math.abs(r.x1 - r.x0) * 100}%`,
    height: `${Math.abs(r.y1 - r.y0) * 100}%`,
  }
})
function startMarquee(ev: MouseEvent) {
  if (!wrapEl.value) return
  const p = toLocalNorm(ev.clientX, ev.clientY)
  marqueeRect.value = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
  window.addEventListener('mousemove', onMarqueeMove)
  window.addEventListener('mouseup', onMarqueeUp)
}
function onMarqueeMove(ev: MouseEvent) {
  if (!marqueeRect.value || !wrapEl.value) return
  const p = toLocalNorm(ev.clientX, ev.clientY)
  marqueeRect.value = { ...marqueeRect.value, x1: p.x, y1: p.y }
}
function onMarqueeUp() {
  const r = marqueeRect.value
  marqueeRect.value = null
  window.removeEventListener('mousemove', onMarqueeMove)
  window.removeEventListener('mouseup', onMarqueeUp)
  if (!r) return
  const minX = Math.min(r.x0, r.x1); const maxX = Math.max(r.x0, r.x1)
  const minY = Math.min(r.y0, r.y1); const maxY = Math.max(r.y0, r.y1)
  // 拖拽距离过小 (<1% 画布) 视为误触丢弃; 点位中心入框即命中 (visibleBindings 同图层口径)
  if (maxX - minX < 0.01 && maxY - minY < 0.01) return
  const hits = visibleBindings.value.filter((b) =>
    b.pos_x >= minX && b.pos_x <= maxX && b.pos_y >= minY && b.pos_y <= maxY)
  emit('marquee-select', hits)
}

// ── [P1-3 2026-09-16 iSC「测距」工具对标] 底图测距: 两点取点 → 线段 + 距离标签 ──
// 归一化取点 (复用 toLocalNorm, 逆变换下任意缩放/平移态取点准确); 物理距离与
// fovRadiusNormalized 同口径: Δnorm × map.width_px/height_px × scale_m_per_px = 米
// (与画布显示尺寸/zoom 无关); 第三次点击重新起测 (新测量替换旧线段)。
const measurePts = ref<{ x: number; y: number }[]>([])
// 线段长度按容器宽百分比基准绘制 (dy 乘高宽比换算到宽基准), 测量开始时抓取一次
const measureAr = ref(1)
function onMeasureClick(ev: MouseEvent) {
  if (!wrapEl.value) return
  const rect = wrapEl.value.getBoundingClientRect()
  measureAr.value = rect.height / (rect.width || 1)
  const p = toLocalNorm(ev.clientX, ev.clientY)
  const pt = { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }
  measurePts.value = measurePts.value.length >= 2 ? [pt] : [...measurePts.value, pt]
}
const measureLineStyle = computed(() => {
  if (measurePts.value.length < 2) return {}
  const [a, b] = measurePts.value
  const dx = b.x - a.x
  const dy = (b.y - a.y) * measureAr.value
  return {
    left: `${a.x * 100}%`,
    top: `${a.y * 100}%`,
    width: `${Math.hypot(dx, dy) * 100}%`,
    transform: `rotate(${Math.atan2(dy, dx)}rad)`,
  }
})
const measureLabelStyle = computed(() => {
  if (measurePts.value.length < 2) return {}
  const [a, b] = measurePts.value
  return { left: `${((a.x + b.x) / 2) * 100}%`, top: `${((a.y + b.y) / 2) * 100}%` }
})
const measureText = computed(() => {
  if (measurePts.value.length < 2) return ''
  const [a, b] = measurePts.value
  const m = props.map
  if (!(m.width_px > 0) || !(m.scale_m_per_px > 0)) return ''
  const meters = Math.hypot(
    (b.x - a.x) * m.width_px * m.scale_m_per_px,
    (b.y - a.y) * (m.height_px || m.width_px) * m.scale_m_per_px,
  )
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`
})

// ── 编辑交互: 画布点击落点 ──
// [P0-2] 栅格吸附 (0.02 步长 ≈ 画布 2%; 密集落点防重叠, Intel OpenVINO 对标)
const GRID_STEP = 0.02
function snap(v: number): number {
  if (!props.snapToGrid) return v
  return Math.round(v / GRID_STEP) * GRID_STEP
}
function onCanvasClick(ev: MouseEvent) {
  // [P1-3] 测距态: 点击底图取点 (点位图标 @click.stop 不冒泡, 不会误采图标坐标)
  if (props.toolMode === 'measure') { onMeasureClick(ev); return }
  // [P2-11a] 标记态: 点击底图放置标记 (宿主弹命名框后持久化)
  if (props.toolMode === 'pin') {
    if (!wrapEl.value) return
    const p = toLocalNorm(ev.clientX, ev.clientY)
    emit('pin-add', Math.min(1, Math.max(0, p.x)), Math.min(1, Math.max(0, p.y)))
    return
  }
  if (!props.editable || !wrapEl.value) return
  const p = toLocalNorm(ev.clientX, ev.clientY)
  const x = Math.min(1, Math.max(0, p.x))
  const y = Math.min(1, Math.max(0, p.y))
  ghostPos.value = null
  emit('canvas-click', snap(x), snap(y))
}

// ── [v4-C10] 落点幽灵图标: 跟随光标预览落点效果 (宇视拖拽预览对标) ──
// 与落点同口径 snap+clamp — 用户所见即落点真实位置 (栅格吸附预览)
const ghostPos = ref<{ x: number; y: number } | null>(null)
function onGhostMove(ev: MouseEvent) {
  if (!props.editable || !props.ghostType || !wrapEl.value) return
  const p = toLocalNorm(ev.clientX, ev.clientY)
  ghostPos.value = {
    x: snap(Math.min(1, Math.max(0, p.x))),
    y: snap(Math.min(1, Math.max(0, p.y))),
  }
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
  window.removeEventListener('mousemove', onMarqueeMove)
  window.removeEventListener('mouseup', onMarqueeUp)
  clearTimeout(viewportEmitTimer)
})
// [FLOOR-MAP 2026-09-05 v2] 换图复位视口 (多图/楼层切换后不应残留平移缩放态)
// [P0-1 2026-09-16 iSC 初始视野对标] 复位改为: 有已存初始视野则应用, 否则 identity
watch(() => props.map.id, () => {
  applyViewportFromMap()
})
// [P0-1] 首次挂载同样应用已存初始视野 (无 viewport → identity, 行为不变)
onMounted(applyViewportFromMap)
onBeforeUnmount(() => clearTimeout(viewportEmitTimer))

// ═══ [P0-3 2026-09-16 iSC「快速定位」对标] 聚焦通道 → 定位居中 ═══
// 屏幕位置 = norm·size·z + view → 居中即 view = size/2 − norm·size·z;
// z 保持现有值, <1.5 时提升到 2 (拉近到可辨认图标层级, iSC 定位居中间义)
function focusOnChannel(ch: string) {
  if (!wrapEl.value || props.editable || !panEnabled.value) return
  const variants = channelIdVariants(ch)
  const b = props.bindings.find((x) => variants.includes(x.channel_id))
  if (!b) return
  const w = wrapEl.value.clientWidth
  const h = wrapEl.value.clientHeight
  if (view.z < 1.5) view.z = 2
  view.x = w / 2 - b.pos_x * w * view.z
  view.y = h / 2 - b.pos_y * h * view.z
  clampPan()
  scheduleViewportEmit()
}
watch(() => props.focusChannelId, (ch) => {
  if (ch) focusOnChannel(ch)
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
/* [P1-3/P1-4] 工具态: 十字光标提示取点/框选语义 */
.fm-canvas--tool { cursor: crosshair; }

/* ── [P2-11a] 标记层: 旗标 + 名称标签 (点击删除; pointer-events 子层放行) ── */
.fm-canvas__pins { position: absolute; inset: 0; z-index: 5; pointer-events: none; }
.fm-canvas__pin {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  pointer-events: auto;
  cursor: pointer;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
}
.fm-canvas__pin svg { transform: scale(calc(1 / var(--fmz, 1))); }
.fm-canvas__pin-label {
  padding: calc(1px / var(--fmz, 1)) calc(5px / var(--fmz, 1));
  margin-top: calc(1px / var(--fmz, 1));
  white-space: nowrap;
  background: rgba(5, 14, 48, 0.88);
  border: 1px solid rgba(244, 180, 0, 0.6);
  border-radius: calc(2px / var(--fmz, 1));
  color: #F4B400;
  font-size: calc(10px / var(--fmz, 1));
  pointer-events: none;
}

/* ── [P1-3] 测距层: 端点 + 线段 + 距离标签 (#00E5FF 同 FOV/选中 token) ── */
.fm-canvas__measure { position: absolute; inset: 0; z-index: 5; pointer-events: none; }
.fm-canvas__measure-pt {
  position: absolute;
  width: calc(8px / var(--fmz, 1));
  height: calc(8px / var(--fmz, 1));
  margin: calc(-4px / var(--fmz, 1)) 0 0 calc(-4px / var(--fmz, 1));
  border-radius: 50%;
  background: #00E5FF;
  box-shadow: 0 0 calc(6px / var(--fmz, 1)) rgba(0, 229, 255, 0.9);
}
.fm-canvas__measure-line {
  position: absolute;
  height: calc(2px / var(--fmz, 1));
  margin-top: calc(-1px / var(--fmz, 1));
  transform-origin: 0 0;
  background: linear-gradient(90deg, #00E5FF, rgba(0, 229, 255, 0.55));
}
.fm-canvas__measure-dist {
  position: absolute;
  transform: translate(-50%, calc(-100% - 6px / var(--fmz, 1)));
  padding: calc(2px / var(--fmz, 1)) calc(6px / var(--fmz, 1));
  border: 1px solid rgba(0, 229, 255, 0.6);
  border-radius: calc(3px / var(--fmz, 1));
  background: rgba(5, 14, 48, 0.88);
  color: #00E5FF;
  font-size: calc(11px / var(--fmz, 1));
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* ── [P1-4] 框选层: 蓝色半透明选框 (与测距层同 z-index 层级; pointer-events 放行拖拽) ── */
.fm-canvas__marquee {
  position: absolute;
  z-index: 5;
  border: 1px solid rgba(0, 229, 255, 0.8);
  background: rgba(0, 148, 255, 0.18);
  pointer-events: none;
}

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
/* [v4-B8] 摄像头明确离线 dim 化 (需求: opacity 0.5 + 灰度滤镜) */
.fm-canvas__cam.fm-canvas__cam--off {
  opacity: 0.55;
  filter: grayscale(0.6) drop-shadow(0 0 4px rgba(100, 116, 139, 0.35));
}
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

/* ── [P2-9] 布防角标: 规则数 (金色小圆右上; 与左下在线点错位; 尺寸 --fmz 反向补偿) ── */
.fm-canvas__cam-def {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: calc(14px / var(--fmz, 1));
  height: calc(14px / var(--fmz, 1));
  padding: 0 calc(3px / var(--fmz, 1));
  border-radius: calc(7px / var(--fmz, 1));
  background: #F4B400;
  color: #1F2D4A;
  font-size: calc(9px / var(--fmz, 1));
  font-weight: 700;
  line-height: calc(14px / var(--fmz, 1));
  text-align: center;
  box-shadow: 0 0 calc(5px / var(--fmz, 1)) rgba(244, 180, 0, 0.8);
  pointer-events: none;
}

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

/* ── [v4-C10] 落点幽灵图标 (待落点光标预览; 虚线环呼吸) ── */
.fm-canvas__ghost {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 4;
  opacity: 0.75;
}
.fm-canvas__ghost svg { transform: scale(calc(1 / var(--fmz, 1))); }
.fm-canvas__ghost::after {
  content: '';
  position: absolute;
  inset: -6px;
  border: 1.5px dashed var(--gc, #3294ED);
  border-radius: 50%;
  animation: fm-ghost-pulse 1.2s ease-in-out infinite;
}
@keyframes fm-ghost-pulse {
  0%, 100% { opacity: 0.9; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.18); }
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
