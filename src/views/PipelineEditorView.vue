<template>
  <div class="pipeline-editor">
    <div class="pe-header">
      <div class="pe-title">
        <el-input v-model="pipelineName" size="small" style="width:240px" />
        <el-tag v-if="dirty" type="warning" size="small">未保存</el-tag>
      </div>
      <div class="pe-actions">
        <el-button size="small" @click="loadPipeline">加载</el-button>
        <el-button size="small" type="primary" @click="savePipeline" :disabled="!dirty">保存</el-button>
        <el-button size="small" @click="clearCanvas">清空</el-button>
      </div>
    </div>
    <div class="pe-body">
      <!-- 左侧组件面板 -->
      <div class="pe-palette">
        <div v-for="cat in categories" :key="cat.name" class="palette-group">
          <div class="palette-cat">{{ cat.icon }} {{ cat.name }}</div>
          <div v-for="comp in cat.items" :key="comp.type"
               class="palette-item"
               draggable="true"
               @dragstart="onDragStart($event, comp)">
            <span class="item-icon">{{ comp.icon }}</span>
            <span class="item-name">{{ comp.name }}</span>
          </div>
        </div>
      </div>

      <!-- 中间画布 -->
      <div class="pe-canvas" ref="canvasContainer"
           @dragover.prevent
           @drop="onCanvasDrop"
           @mousedown="onCanvasMouseDown"
           @mousemove="onCanvasMouseMove"
           @mouseup="onCanvasMouseUp">
        <svg class="pe-lines" :width="canvasW" :height="canvasH">
          <g v-for="(line, idx) in connections" :key="idx">
            <path :d="linePath(line)" stroke="#1A73E8" stroke-width="2" fill="none" />
            <circle :cx="portPos(line.toNode, line.toPort).x" :cy="portPos(line.toNode, line.toPort).y" r="4" fill="#0F9D58" />
          </g>
          <!-- 正在连线 -->
          <path v-if="drawingLine" :d="tempLinePath" stroke="#1A73E8" stroke-width="2" stroke-dasharray="6 3" fill="none" />
        </svg>
        <!-- 节点 -->
        <div v-for="node in nodes" :key="node.id"
             :class="['pe-node', { selected: selectedNode === node.id }]"
             :style="{ left: node.x + 'px', top: node.y + 'px' }"
             @mousedown.stop="onNodeMouseDown($event, node)">
          <div class="node-header">
            <span class="node-icon">{{ node.icon }}</span>
            <span class="node-title">{{ node.label }}</span>
            <el-button class="node-del" size="small" text @click.stop="removeNode(node.id)">✕</el-button>
          </div>
          <div class="node-ports">
            <div class="ports-in">
              <div v-for="p in node.inputs" :key="p" class="port in-port"
                   :data-node="node.id" :data-port="p" :data-dir="'in'"
                   @mousedown.stop="onPortMouseDown($event, node.id, p, 'in')">
                <span class="port-dot"></span>{{ p }}
              </div>
            </div>
            <div class="ports-out">
              <div v-for="p in node.outputs" :key="p" class="port out-port"
                   :data-node="node.id" :data-port="p" :data-dir="'out'"
                   @mousedown.stop="onPortMouseDown($event, node.id, p, 'out')">
                {{ p }}<span class="port-dot"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧属性面板 -->
      <div class="pe-props">
        <template v-if="selectedNodeData">
          <h4>{{ selectedNodeData.label }}</h4>
          <el-form label-position="top" size="small">
            <!-- 通用属性 -->
            <el-form-item v-for="prop in selectedNodeData.props" :key="prop.key" :label="prop.label">
              <!-- 滑块 -->
              <el-slider v-if="prop.type === 'slider'" v-model="prop.value" :min="prop.min" :max="prop.max" :step="prop.step" show-input />
              <!-- 数字输入 -->
              <el-input-number v-else-if="prop.type === 'number'" v-model="prop.value" :min="prop.min" :max="prop.max" />
              <!-- 选择 -->
              <el-select v-else-if="prop.type === 'select'" v-model="prop.value" style="width:100%">
                <el-option v-for="o in prop.options" :key="o" :label="o" :value="o" />
              </el-select>
              <!-- 开关 -->
              <el-switch v-else-if="prop.type === 'switch'" v-model="prop.value" />
              <!-- 文本 -->
              <el-input v-else v-model="prop.value" :type="prop.multiline ? 'textarea' : 'text'" />
            </el-form-item>

            <!-- ROI绘制 -->
            <el-form-item v-if="selectedNodeData.hasROI" label="ROI区域">
              <el-button size="small" @click="roiDrawing = !roiDrawing">
                {{ roiDrawing ? '完成绘制' : '绘制ROI' }}
              </el-button>
              <canvas v-if="roiDrawing" ref="roiCanvas" width="320" height="180"
                      style="border:1px solid #3C4043;border-radius:4px;margin-top:8px;background:#111;cursor:crosshair"
                      @mousedown="onRoiMouseDown" @mousemove="onRoiMouseMove" @mouseup="onRoiMouseUp" />
              <div v-if="roiPoints.length" style="margin-top:4px">
                <el-tag size="small">{{ roiPoints.length }}个点</el-tag>
                <el-button size="small" text @click="roiPoints = []">清除</el-button>
              </div>
            </el-form-item>

            <!-- 时间计划 -->
            <el-form-item v-if="selectedNodeData.hasSchedule" label="时间计划">
              <el-select v-model="selectedNodeData.scheduleType" style="width:100%;margin-bottom:8px">
                <el-option label="全天" value="all" />
                <el-option label="自定义" value="custom" />
              </el-select>
              <div v-if="selectedNodeData.scheduleType === 'custom'" style="display:flex;gap:8px">
                <el-time-picker v-model="selectedNodeData.scheduleStart" placeholder="开始" size="small" />
                <el-time-picker v-model="selectedNodeData.scheduleEnd" placeholder="结束" size="small" />
              </div>
            </el-form-item>

            <!-- 联动 -->
            <el-form-item v-if="selectedNodeData.hasActions" label="联动动作">
              <el-checkbox v-model="selectedNodeData.actionAlarm">🔔 告警通知</el-checkbox>
              <el-checkbox v-model="selectedNodeData.actionLight">💡 声光报警</el-checkbox>
              <el-checkbox v-model="selectedNodeData.actionGate">🚪 门禁联动</el-checkbox>
            </el-form-item>
          </el-form>
        </template>
        <div v-else class="props-empty">
          <el-icon :size="32"><Setting /></el-icon>
          <p>选择节点查看属性</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick, onMounted } from 'vue'
import { http } from '@/api/http'
import { ElMessage } from 'element-plus'

interface PipelineNode {
  id: string
  type: string
  label: string
  icon: string
  x: number
  y: number
  inputs: string[]
  outputs: string[]
  hasROI?: boolean
  hasSchedule?: boolean
  hasActions?: boolean
  props: PropItem[]
  scheduleType?: string
  scheduleStart?: any
  scheduleEnd?: any
  actionAlarm?: boolean
  actionLight?: boolean
  actionGate?: boolean
}
interface PropItem { key: string; label: string; type: string; value: any; min?: number; max?: number; step?: number; options?: string[]; multiline?: boolean }
interface Connection { fromNode: string; fromPort: string; toNode: string; toPort: string }

const pipelineName = ref('新建Pipeline')
const dirty = ref(false)
const nodes = reactive<PipelineNode[]>([])
const connections = reactive<Connection[]>([])
const selectedNode = ref('')
const canvasContainer = ref<HTMLElement>()
const canvasW = ref(2000)
const canvasH = ref(1200)

// 拖拽
let dragComp: any = null
let dragNode: PipelineNode | null = null
let dragOffset = { x: 0, y: 0 }

// 连线
let drawingLine = ref(false)
let lineFrom = { node: '', port: '', dir: '' }
let lineTo = { x: 0, y: 0 }

// ROI
const roiDrawing = ref(false)
const roiCanvas = ref<HTMLCanvasElement>()
const roiPoints = reactive<{ x: number; y: number }[]>([])
let roiDragging = false

const categories = [
  { name: '视频源', icon: '📹', items: [
    { type: 'rtsp', name: 'RTSP拉流', icon: '📡', inputs: [], outputs: ['video_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'url', label: 'RTSP地址', type: 'text', value: 'rtsp://' }] },
    { type: 'onvif', name: 'ONVIF', icon: '📷', inputs: [], outputs: ['video_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'ip', label: '设备IP', type: 'text', value: '' }] },
  ]},
  { name: '预处理', icon: '🔧', items: [
    { type: 'decode', name: '解码', icon: '🔓', inputs: ['video_in'], outputs: ['frame_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'format', label: '输出格式', type: 'select', value: 'BGR', options: ['BGR', 'RGB', 'NV12'] }] },
    { type: 'resize', name: 'Resize', icon: '📐', inputs: ['frame_in'], outputs: ['frame_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'width', label: '宽度', type: 'number', value: 1920, min: 64, max: 3840 }, { key: 'height', label: '高度', type: 'number', value: 1080, min: 64, max: 2160 }] },
  ]},
  { name: 'AI推理', icon: '🧠', items: [
    { type: 'yolo', name: 'YOLO检测', icon: '🎯', inputs: ['frame_in'], outputs: ['dets_out'], hasROI: true, hasSchedule: true, hasActions: false, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8s', options: ['yolov8n', 'yolov8s', 'yolov8m'] }, { key: 'conf', label: '置信度阈值', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] },
    { type: 'perimeter', name: '周界入侵', icon: '🚧', inputs: ['frame_in'], outputs: ['alarm_out'], hasROI: true, hasSchedule: true, hasActions: true, props: [{ key: 'sensitivity', label: '灵敏度', type: 'slider', value: 0.8, min: 0, max: 1, step: 0.05 }, { key: 'minSize', label: '最小目标(px)', type: 'number', value: 120, min: 10, max: 2000 }, { key: 'confirmFrames', label: '确认帧数', type: 'number', value: 3, min: 1, max: 30 }] },
    { type: 'tripwire', name: '绊线检测', icon: '〰️', inputs: ['frame_in'], outputs: ['alarm_out'], hasROI: true, hasSchedule: true, hasActions: true, props: [{ key: 'sensitivity', label: '灵敏度', type: 'slider', value: 0.7, min: 0, max: 1, step: 0.05 }] },
    { type: 'face', name: '人脸识别', icon: '👤', inputs: ['frame_in'], outputs: ['face_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'model', label: '模型', type: 'select', value: 'arcface', options: ['arcface', 'mobileface'] }] },
    { type: 'reid', name: 'ReID追踪', icon: '🔄', inputs: ['frame_in', 'dets_in'], outputs: ['track_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'maxTrackAge', label: '最大跟踪帧数', type: 'number', value: 60, min: 10, max: 300 }] },
  ]},
  { name: '输出', icon: '📤', items: [
    { type: 'osd', name: 'OSD叠加', icon: '🏷️', inputs: ['frame_in', 'dets_in'], outputs: ['frame_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'format', label: '叠加格式', type: 'text', value: '{label} {conf}%' }] },
    { type: 'rtsp_out', name: 'RTSP推流', icon: '📺', inputs: ['frame_in'], outputs: [], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'url', label: '推流地址', type: 'text', value: 'rtsp://localhost/live' }] },
    { type: 'mqtt_alarm', name: 'MQTT告警', icon: '📡', inputs: ['alarm_in'], outputs: [], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'topic', label: 'MQTT Topic', type: 'text', value: 'shield/alarm' }] },
  ]},
]

const selectedNodeData = computed(() => nodes.find(n => n.id === selectedNode.value))

let nodeIdCounter = 0
function genNodeId() { return 'node_' + (++nodeIdCounter) }

// 拖拽组件到画布
function onDragStart(e: DragEvent, comp: any) {
  dragComp = comp
  e.dataTransfer!.setData('text/plain', comp.type)
}
function onCanvasDrop(e: DragEvent) {
  if (!dragComp) return
  const rect = canvasContainer.value!.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const node: PipelineNode = {
    id: genNodeId(), type: dragComp.type, label: dragComp.name, icon: dragComp.icon,
    x, y, inputs: [...dragComp.inputs], outputs: [...dragComp.outputs],
    hasROI: dragComp.hasROI, hasSchedule: dragComp.hasSchedule, hasActions: dragComp.hasActions,
    props: dragComp.props.map((p: any) => ({ ...p })),
    scheduleType: 'all', actionAlarm: true, actionLight: false, actionGate: false,
  }
  nodes.push(node)
  dirty.value = true
  dragComp = null
}

// 节点拖动
function onNodeMouseDown(e: MouseEvent, node: PipelineNode) {
  selectedNode.value = node.id
  dragNode = node
  dragOffset = { x: e.clientX - node.x, y: e.clientY - node.y }
}
function onCanvasMouseDown(e: MouseEvent) {
  if (!dragNode) selectedNode.value = ''
}
function onCanvasMouseMove(e: MouseEvent) {
  if (dragNode) {
    dragNode.x = Math.max(0, e.clientX - dragOffset.x)
    dragNode.y = Math.max(0, e.clientY - dragOffset.y)
    dirty.value = true
  }
  if (drawingLine.value) {
    const rect = canvasContainer.value!.getBoundingClientRect()
    lineTo = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
}
function onCanvasMouseUp() {
  dragNode = null
  if (drawingLine.value) { drawingLine.value = false }
}

// 端口连线
function onPortMouseDown(e: MouseEvent, nodeId: string, port: string, dir: string) {
  if (dir === 'out') {
    drawingLine.value = true
    lineFrom = { node: nodeId, port, dir }
  } else {
    // 连入：找到最近的out连线
    const pp = portPos(nodeId, port)
    lineTo = { x: pp.x, y: pp.y }
  }
}

function portPos(nodeId: string, port: string): { x: number; y: number } {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return { x: 0, y: 0 }
  const idx = node.inputs.includes(port) ? node.inputs.indexOf(port) : node.outputs.indexOf(port) + node.inputs.length
  return { x: node.x + (node.inputs.includes(port) ? 0 : 180), y: node.y + 30 + idx * 22 + 10 }
}

function linePath(conn: Connection): string {
  const from = portPos(conn.fromNode, conn.fromPort)
  const to = portPos(conn.toNode, conn.toPort)
  const cx = Math.abs(to.x - from.x) * 0.5
  return `M${from.x},${from.y} C${from.x + cx},${from.y} ${to.x - cx},${to.y} ${to.x},${to.y}`
}

const tempLinePath = computed(() => {
  const from = portPos(lineFrom.node, lineFrom.port)
  const cx = Math.abs(lineTo.x - from.x) * 0.5
  return `M${from.x},${from.y} C${from.x + cx},${from.y} ${lineTo.x - cx},${lineTo.y} ${lineTo.x},${lineTo.y}`
})

function removeNode(id: string) {
  const idx = nodes.findIndex(n => n.id === id)
  if (idx >= 0) nodes.splice(idx, 1)
  // 删除关联连线
  for (let i = connections.length - 1; i >= 0; i--) {
    if (connections[i].fromNode === id || connections[i].toNode === id) connections.splice(i, 1)
  }
  if (selectedNode.value === id) selectedNode.value = ''
  dirty.value = true
}
function clearCanvas() { nodes.splice(0); connections.splice(0); selectedNode.value = ''; dirty.value = true }

// ROI绘制
function onRoiMouseDown(e: MouseEvent) {
  roiDragging = true
  addRoiPoint(e)
}
function onRoiMouseMove(e: MouseEvent) {
  if (roiDragging) addRoiPoint(e)
}
function onRoiMouseUp() { roiDragging = false }
function addRoiPoint(e: MouseEvent) {
  const canvas = roiCanvas.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  roiPoints.push({ x: Math.round((e.clientX - rect.left) / canvas.width * 1920), y: Math.round((e.clientY - rect.top) / canvas.height * 1080) })
  drawRoi()
}
function drawRoi() {
  const canvas = roiCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (roiPoints.length < 2) return
  ctx.beginPath()
  ctx.moveTo(roiPoints[0].x / 1920 * canvas.width, roiPoints[0].y / 1080 * canvas.height)
  for (let i = 1; i < roiPoints.length; i++) {
    ctx.lineTo(roiPoints[i].x / 1920 * canvas.width, roiPoints[i].y / 1080 * canvas.height)
  }
  ctx.strokeStyle = '#0F9D58'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = 'rgba(15,157,88,0.15)'
  ctx.fill()
}

// 保存/加载
async function savePipeline() {
  const payload = { name: pipelineName.value, nodes: nodes.map(n => ({ ...n })), connections: [...connections] }
  try {
    await http.post('/api/v1/pipelines', payload)
    ElMessage.success('Pipeline已保存')
    dirty.value = false
  } catch (e: any) {
    ElMessage.error('保存失败: ' + e.message)
  }
}
async function loadPipeline() {
  try {
    const { data } = await http.get('/api/v1/pipelines', { params: { name: pipelineName.value } })
    const pl = data?.data || data
    if (!pl) return ElMessage.info('未找到Pipeline')
    nodes.splice(0); connections.splice(0)
    nodes.push(...(pl.nodes || []))
    connections.push(...(pl.connections || []))
    dirty.value = false
  } catch { /* ignore */ }
}
</script>

<style scoped>
.pipeline-editor { height: calc(100vh - 80px); display: flex; flex-direction: column; background: #1A1D23; }
.pe-header { padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #3C4043; background: #252830; }
.pe-title { display: flex; align-items: center; gap: 8px; color: #E8EAED; }
.pe-body { flex: 1; display: flex; overflow: hidden; }

/* 组件面板 */
.pe-palette { width: 200px; background: #252830; border-right: 1px solid #3C4043; overflow-y: auto; padding: 8px; }
.palette-group { margin-bottom: 12px; }
.palette-cat { font-size: 12px; color: #9AA0A6; font-weight: 600; padding: 4px 8px; }
.palette-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; cursor: grab; color: #E8EAED; font-size: 13px; margin-bottom: 2px; background: #2D3039; }
.palette-item:hover { background: #1E3A5F; }

/* 画布 */
.pe-canvas { flex: 1; position: relative; overflow: hidden; cursor: default; }
.pe-lines { position: absolute; top: 0; left: 0; pointer-events: none; }

/* 节点 */
.pe-node { position: absolute; width: 180px; background: #252830; border: 2px solid #3C4043; border-radius: 8px; cursor: move; user-select: none; z-index: 1; }
.pe-node:hover { border-color: #1A73E8; }
.pe-node.selected { border-color: #1A73E8; box-shadow: 0 0 12px rgba(26,115,232,0.3); }
.node-header { padding: 6px 10px; background: #2D3039; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 6px; font-size: 13px; color: #E8EAED; }
.node-icon { font-size: 14px; }
.node-title { flex: 1; font-weight: 600; }
.node-del { color: #9AA0A6 !important; padding: 0 !important; }
.node-del:hover { color: #DB4437 !important; }

.node-ports { padding: 6px 0; }
.ports-in { padding-left: 8px; }
.ports-out { text-align: right; padding-right: 8px; }
.port { font-size: 11px; color: #9AA0A6; padding: 2px 0; cursor: crosshair; display: flex; align-items: center; gap: 4px; }
.out-port { justify-content: flex-end; }
.port-dot { width: 8px; height: 8px; border-radius: 50%; background: #1A73E8; flex-shrink: 0; }
.in-port .port-dot { background: #0F9D58; }

/* 属性面板 */
.pe-props { width: 280px; background: #252830; border-left: 1px solid #3C4043; overflow-y: auto; padding: 12px; }
.pe-props h4 { color: #E8EAED; margin: 0 0 12px; font-size: 14px; }
.props-empty { text-align: center; color: #666; padding: 40px 20px; }

/* 暗色表单 */
:deep(.el-form-item__label) { color: #9AA0A6; font-size: 12px; }
:deep(.el-input__inner) { background: #1A1D23; border-color: #3C4043; color: #E8EAED; }
:deep(.el-textarea__inner) { background: #1A1D23; border-color: #3C4043; color: #E8EAED; }
</style>
