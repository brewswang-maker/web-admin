<template>
  <div class="pipeline-editor">
    <div class="pe-header">
      <div class="pe-title">
        <el-input v-model="pipelineName" size="small" style="width:240px" />
        <el-tag v-if="dirty" type="warning" size="small">未保存</el-tag>
      </div>
      <div class="pe-actions">
        <el-button size="small" @click="undo" :disabled="!canUndo" title="Ctrl+Z">↶ 撤销</el-button>
        <el-button size="small" @click="redo" :disabled="!canRedo" title="Ctrl+Y">↷ 重做</el-button>
        <el-divider direction="vertical" />
        <el-dropdown @command="applyTemplate" trigger="click">
          <el-button size="small">📋 场景模板 <el-icon><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu style="max-height: 480px; overflow-y: auto;">
              <!-- ═══ 智慧安防 ═══ -->
              <el-dropdown-item disabled class="tpl-cat">🏠 智慧安防</el-dropdown-item>
              <el-dropdown-item command="perimeter">🚧 周界入侵检测</el-dropdown-item>
              <el-dropdown-item command="tripwire">〰️ 绊线检测</el-dropdown-item>
              <el-dropdown-item command="fire_smoke">🔥 火灾烟雾检测</el-dropdown-item>
              <el-dropdown-item command="fighting">⚔️ 打架斗殴检测</el-dropdown-item>
              <el-dropdown-item command="loitering">🕐 区域徘徊检测</el-dropdown-item>
              <el-dropdown-item command="gathering">👥 人员聚集检测</el-dropdown-item>
              <el-dropdown-item command="fall_detection">🩹 跌倒检测</el-dropdown-item>
              <el-dropdown-item command="abandoned">📦 遗留物检测</el-dropdown-item>
              <el-dropdown-item command="tailgating">🚪 门禁尾随检测</el-dropdown-item>
              <el-dropdown-item command="climbing">🧗 翻越检测</el-dropdown-item>
              <el-dropdown-item command="running">🏃 异常奔跑检测</el-dropdown-item>
              <el-dropdown-item command="fire_lane">🚒 消防通道堵塞</el-dropdown-item>
              <!-- ═══ 智慧交通 ═══ -->
              <el-dropdown-item disabled divided class="tpl-cat">🚗 智慧交通</el-dropdown-item>
              <el-dropdown-item command="traffic_lpr">🔢 车牌识别记录</el-dropdown-item>
              <el-dropdown-item command="parking_violation">🅿️ 违停检测</el-dropdown-item>
              <el-dropdown-item command="wrong_direction">↩️ 逆行检测</el-dropdown-item>
              <el-dropdown-item command="traffic_flow">📊 车流量统计</el-dropdown-item>
              <!-- ═══ 生产安全 ═══ -->
              <el-dropdown-item disabled divided class="tpl-cat">🏭 生产安全</el-dropdown-item>
              <el-dropdown-item command="helmet">⛑️ 安全帽检测</el-dropdown-item>
              <el-dropdown-item command="ppe">🦺 PPE合规检测</el-dropdown-item>
              <el-dropdown-item command="smoking">🚬 吸烟检测</el-dropdown-item>
              <el-dropdown-item command="guard_absence">💤 离岗检测</el-dropdown-item>
              <el-dropdown-item command="phone_call">📱 打电话检测</el-dropdown-item>
              <el-dropdown-item command="vest">🦺 反光衣检测</el-dropdown-item>
              <!-- ═══ 智慧校园 ═══ -->
              <el-dropdown-item disabled divided class="tpl-cat">🏫 智慧校园</el-dropdown-item>
              <el-dropdown-item command="campus_safety">🛡️ 校园防霸凌</el-dropdown-item>
              <el-dropdown-item command="dangerous_item">🔪 危险物品检测</el-dropdown-item>
              <!-- ═══ 智慧养老 ═══ -->
              <el-dropdown-item disabled divided class="tpl-cat">👴 智慧养老</el-dropdown-item>
              <el-dropdown-item command="eldercare">🧓 养老看护(跌倒+滞留)</el-dropdown-item>
              <!-- ═══ 智慧城市 ═══ -->
              <el-dropdown-item disabled divided class="tpl-cat">🏙️ 智慧城市</el-dropdown-item>
              <el-dropdown-item command="high_altitude">📉 高空抛物检测</el-dropdown-item>
              <el-dropdown-item command="crowd_density">🌡️ 人群密度热图</el-dropdown-item>
              <!-- ═══ 商业运营 ═══ -->
              <el-dropdown-item disabled divided class="tpl-cat">💼 商业运营</el-dropdown-item>
              <el-dropdown-item command="face">👤 人脸识别门禁</el-dropdown-item>
              <el-dropdown-item command="face_attendance">📋 人脸考勤打卡</el-dropdown-item>
              <el-dropdown-item command="queue_length">🧍 排队长度检测</el-dropdown-item>
              <el-dropdown-item command="people_counting">🔢 人流计数</el-dropdown-item>
              <!-- ═══ 环境监测 ═══ -->
              <el-dropdown-item disabled divided class="tpl-cat">📷 环境监测</el-dropdown-item>
              <el-dropdown-item command="camera_health">🔧 摄像头健康检测</el-dropdown-item>
              <el-dropdown-item command="night_vision">🌙 夜间安防增强</el-dropdown-item>
              <el-dropdown-item command="animal">🐈 动物入侵检测</el-dropdown-item>
              <!-- ═══ 工具模板 ═══ -->
              <el-dropdown-item disabled divided class="tpl-cat">🔧 工具模板</el-dropdown-item>
              <el-dropdown-item command="pedestrian">🎯 人形检测+追踪</el-dropdown-item>
              <el-dropdown-item command="multi">📹 多通道并发检测</el-dropdown-item>
              <el-dropdown-item command="enhance">✨ 视频增强推流</el-dropdown-item>
              <el-dropdown-item command="privacy_mask">🙈 隐私遮罩合规</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button size="small" @click="zoomIn" title="放大">🔍+</el-button>
        <el-button size="small" @click="zoomOut" title="缩小">🔍-</el-button>
        <el-button size="small" @click="zoomReset" title="重置缩放">1:1</el-button>
        <el-button size="small" @click="fitView" title="适应窗口">⤢ 适应</el-button>
        <el-button size="small" @click="loadPipeline">加载</el-button>
        <el-button size="small" type="primary" @click="handleSavePipeline" :disabled="!dirty">保存</el-button>
        <el-button size="small" type="warning" @click="handleValidate" :loading="validating">验证</el-button>
        <el-button size="small" type="success" @click="handleDeploy" :loading="deploying">部署</el-button>
        <el-button size="small" type="danger" @click="handleUndeploy" :loading="undeploying">停止</el-button>
        <el-button size="small" type="danger" plain @click="handleDeletePipeline" :disabled="!pipelineId">删除</el-button>
        <!-- [P2-5] 导出/导入 Pipeline -->
        <el-divider direction="vertical" />
        <el-button size="small" @click="handleExportPipeline" :disabled="nodes.length === 0">⬇ 导出</el-button>
        <el-button size="small" @click="handleImportClick">⬆ 导入</el-button>
        <input ref="importFileInput" type="file" accept=".json" style="display:none" @change="handleImportFile" />
        <el-button size="small" @click="toggleMonitor">{{ showMonitor ? '关闭监控' : '运行时监控' }}</el-button>
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
           @mouseup="onCanvasMouseUp"
           @wheel="onCanvasWheel">
        <!-- [UX] 连线中的动画提示条 -->
        <div v-if="drawingLine && sourceNodeLabel" class="pe-draw-hint">
          <span>🎯 拖动到目标端口: {{ sourceNodeLabel }}.{{ lineFrom.port }}（{{ lineFrom.dir === 'out' ? '输出' : '输入' }}）</span>
          <span class="pe-hint-cancel" @click="cancelDrawing" title="取消">✕</span>
        </div>
        <div class="pe-canvas-inner" :style="{ transform: 'scale(' + canvasScale + ')', transformOrigin: '0 0' }">
        <svg ref="svgCanvas" class="pe-lines" :width="canvasW" :height="canvasH" style="overflow: visible; z-index: 0;">
          <g v-for="(line, idx) in connections" :key="idx" class="conn-group" @click="removeConnection(idx)">
            <path :d="linePath(line)" stroke="#1A73E8" stroke-width="2" fill="none" marker-end="url(#arrowhead)" class="conn-line" />
            <path :d="linePath(line)" stroke="transparent" stroke-width="12" fill="none" class="conn-hit" />
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
                   :class="portClass(node.id, p, 'in')"
                   :data-node="node.id" :data-port="p" :data-dir="'in'"
                   @mousedown.stop="onPortMouseDown($event, node.id, p, 'in')"
                   @mouseup.stop="onPortMouseUp($event, node.id, p, 'in')"
                   @click.stop="onPortClick($event, node.id, p, 'in')">
                <span class="port-dot"></span>{{ p }}
              </div>
            </div>
            <div class="ports-out">
              <div v-for="p in node.outputs" :key="p" class="port out-port"
                   :class="portClass(node.id, p, 'out')"
                   :data-node="node.id" :data-port="p" :data-dir="'out'"
                   @mousedown.stop="onPortMouseDown($event, node.id, p, 'out')"
                   @mouseup.stop="onPortMouseUp($event, node.id, p, 'out')"
                   @click.stop="onPortClick($event, node.id, p, 'out')">
                {{ p }}<span class="port-dot"></span>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      <!-- [P1-8] 小地图 minimap -->
      <div class="pe-minimap" v-if="nodes.length > 0">
        <div class="minimap-title">小地图</div>
        <svg class="minimap-svg" :width="minimapW" :height="minimapH">
          <!-- 节点缩略 -->
          <rect v-for="node in nodes" :key="node.id"
                :x="minimapScaleX(node.x)" :y="minimapScaleY(node.y)"
                :width="minimapNodeW" :height="minimapNodeH"
                :fill="selectedNode === node.id ? '#1A73E8' : '#909399'"
                rx="2" />
          <!-- 连线缩略 -->
          <line v-for="(line, idx) in connections" :key="'ml'+idx"
                :x1="minimapPortX(line.fromNode)" :y1="minimapPortY(line.fromNode)"
                :x2="minimapPortX(line.toNode)" :y2="minimapPortY(line.toNode)"
                stroke="#dcdfe6" stroke-width="0.5" />
        </svg>
      </div>
      <div class="pe-props">
        <template v-if="selectedNodeData">
          <div class="props-header">
            <h4>{{ selectedNodeData.label }} <el-tag size="small" type="info" effect="plain">v2.1</el-tag></h4>
            <!-- [P2-X] 通道/设备列表状态 + 手动刷新 -->
            <div class="props-meta">
              <el-tag size="small" :type="channelOptions.length > 0 ? 'success' : 'warning'" effect="plain">
                {{ channelOptions.length > 0 ? '✅' : '⚠️' }} {{ channelOptions.length }} 通道 / {{ deviceOptions.length }} 设备
              </el-tag>
              <el-button size="small" link type="primary" @click="reloadChannelsAndDevices" :loading="channelsLoading || devicesLoading" title="刷新通道与设备列表">
                🔄 刷新列表
              </el-button>
            </div>
          </div>
          <el-form label-position="top" size="small">
            <!-- 通用属性 -->
            <el-form-item v-for="prop in visibleProps" :key="prop.key" :label="prop.label">
              <!-- 滑块 -->
              <el-slider v-if="prop.type === 'slider'" v-model="prop.value" :min="prop.min" :max="prop.max" :step="prop.step" show-input />
              <!-- 数字输入 -->
              <el-input-number v-else-if="prop.type === 'number'" v-model="prop.value" :min="prop.min" :max="prop.max" />
              <!-- 选择 -->
              <el-select v-else-if="prop.type === 'select'" v-model="prop.value" style="width:100%">
                <el-option v-for="o in prop.options" :key="o" :label="o" :value="o" />
              </el-select>
              <!-- [P2-X] 设备选择器 (联动 channel-picker, 先选设备再选通道) -->
              <el-select v-else-if="prop.type === 'device-picker'" v-model="prop.value"
                         filterable clearable
                         :loading="devicesLoading"
                         :no-data-text="devicesLoading ? '加载设备中...' : '暂无设备'"
                         placeholder="选择所属设备" style="width:100%">
                <el-option v-for="d in deviceOptions" :key="d.value" :label="d.label" :value="d.value" />
              </el-select>
              <!-- [P2-X] 通道单选选择器 (按设备分组 el-option-group) -->
              <template v-else-if="prop.type === 'channel-picker'">
                <!-- 空数据警告条 -->
                <el-alert v-if="!channelsLoading && channelOptions.length === 0"
                          type="warning" :closable="false" show-icon
                          title="暂未加载到任何通道"
                          description="请确认后端已注册 GB28181/StreamService 通道,或点击右上角 🔄 刷新列表重试。"
                          style="margin-bottom: 8px;" />
                <el-select v-model="prop.value"
                           filterable allow-create default-first-option clearable
                           :loading="channelsLoading"
                           :no-data-text="channelsLoading ? '加载通道中...' : (channelOptions.length === 0 ? '暂无通道数据 - 请先注册设备/通道' : '无匹配项')"
                           :placeholder="channelOptions.length > 0 ? '🔽 点击此处选择通道 (输入可过滤)' : '点击加载通道或手动输入 ID'" style="width:100%">
                  <el-option-group v-for="grp in filteredChannelGroups" :key="grp.deviceId"
                                   :label="`📹 ${grp.deviceName} (${grp.channels.length} 个通道)`">
                    <el-option v-for="c in grp.channels" :key="c.value"
                               :label="c.label" :value="c.value">
                      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.label }}</span>
                        <span style="font-size:11px;color:#909399;flex-shrink:0">{{ c.subLabel }}</span>
                      </div>
                    </el-option>
                  </el-option-group>
                </el-select>
              </template>
              <!-- [P2-X] 通道多选选择器 (按设备分组) -->
              <template v-else-if="prop.type === 'channels-picker'">
                <el-alert v-if="!channelsLoading && channelOptions.length === 0"
                          type="warning" :closable="false" show-icon
                          title="暂未加载到任何通道"
                          description="请确认后端已注册 GB28181/StreamService 通道,或点击右上角 🔄 刷新列表。"
                          style="margin-bottom: 8px;" />
                <el-select v-model="prop.value"
                           multiple filterable allow-create default-first-option
                           :loading="channelsLoading"
                           :no-data-text="channelsLoading ? '加载通道中...' : '暂无通道数据'"
                           placeholder="🔽 点击选择多个通道 (回车确认)" style="width:100%">
                  <el-option-group v-for="grp in filteredChannelGroups" :key="grp.deviceId"
                                   :label="`📹 ${grp.deviceName} (${grp.channels.length} 个通道)`">
                    <el-option v-for="c in grp.channels" :key="c.value"
                               :label="c.label" :value="c.value" />
                  </el-option-group>
                </el-select>
              </template>
              <!-- 开关 -->
              <el-switch v-else-if="prop.type === 'switch'" v-model="prop.value" />
              <!-- 文本 -->
              <el-input v-else v-model="prop.value" :type="prop.multiline ? 'textarea' : 'text'" />
            </el-form-item>

            <!-- ROI绘制 -->
            <el-form-item v-if="selectedNodeData.hasROI" label="ROI区域">
              <RoiPolygonEditor v-model="roiFlatPoints" />
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

    <!-- v7.0: 运行时监控面板 -->
    <div v-if="showMonitor && runtimeStatus" class="pe-monitor">
      <div class="monitor-header">
        <span class="monitor-title">🚀 Pipeline运行时监控</span>
        <el-tag size="small" :type="runtimeStatus.deploy_state === 'RUNNING' ? 'success' : 'info'">{{ runtimeStatus.deploy_state }}</el-tag>
      </div>
      <div class="monitor-dashboard">
        <div class="metric-card">
          <div class="metric-label">Total FPS</div>
          <div class="metric-value">{{ runtimeStatus.total_fps?.toFixed(1) || '0' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Latency</div>
          <div class="metric-value">{{ runtimeStatus.avg_latency_ms?.toFixed(1) || '0' }}ms</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">TPU Util</div>
          <div class="metric-value">{{ (runtimeStatus.tpu_utilization || 0).toFixed(0) }}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Buffer Pool</div>
          <div class="metric-value">{{ (runtimeStatus.buffer_pool_utilization || 0).toFixed(0) }}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Channels</div>
          <div class="metric-value">{{ runtimeStatus.active_channels }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Total Frames</div>
          <div class="metric-value">{{ runtimeStatus.total_frames }}</div>
        </div>
      </div>
      <div class="monitor-nodes">
        <el-table :data="runtimeStatus.nodes" size="small" stripe :header-cell-style="{ background: '#f5f7fa', color: '#606266' }" class="monitor-table">
          <el-table-column prop="node_id" label="Node" width="120" />
          <el-table-column prop="type" label="Type" width="100" />
          <el-table-column prop="state" label="State" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.state === 'PLAYING' ? 'success' : row.state === 'ERROR' ? 'danger' : 'info'">{{ row.state }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="fps" label="FPS" width="80">
            <template #default="{ row }">{{ row.fps?.toFixed(1) }}</template>
          </el-table-column>
          <el-table-column prop="avg_latency_ms" label="Latency" width="90">
            <template #default="{ row }">{{ row.avg_latency_ms?.toFixed(1) }}ms</template>
          </el-table-column>
          <el-table-column prop="frame_count" label="Frames" width="90" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { savePipeline as apiSavePipeline, getPipeline, deletePipeline, validatePipeline, deployPipeline, undeployPipeline, getPipelineRuntime } from '@/api/pipeline'
import type { PipelineRuntimeStatus } from '@/api/pipeline'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import RoiPolygonEditor from '@/components/RoiPolygonEditor.vue'
import type { RoiData } from '@/composables/useRoiCanvas'
import { channelApi } from '@/api/channel'
import { deviceApi } from '@/api/device'
import type { ChannelItem } from '@/types/device'

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
  roiPolygon?: RoiData[]
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

// [P0-5] 端口语义类型定义与兼容矩阵
const PORT_SEMANTICS: Record<string, string> = {
  video_out: 'video', video_in: 'video',
  frame_out: 'frame', frame_in: 'frame',
  dets_out: 'detection', dets_in: 'detection',
  alarm_out: 'alarm', alarm_in: 'alarm',
  face_out: 'face',
  track_out: 'track',
}
const COMPATIBLE_TYPES: Record<string, string[]> = {
  video: ['video'],
  frame: ['frame', 'video'], // video 可以接受帧级输入
  detection: ['detection', 'frame'], // detection 端口可以接收帧
  alarm: ['alarm', 'detection'], // alarm 端口可以接收检测结果
  face: ['face', 'detection'],
  track: ['track', 'detection'],
}
function getPortType(portName: string): string {
  return PORT_SEMANTICS[portName] || 'any'
}
function isPortCompatible(fromPort: string, toPort: string): boolean {
  const fromType = getPortType(fromPort)
  const toType = getPortType(toPort)
  if (fromType === 'any' || toType === 'any') return true
  const compatible = COMPATIBLE_TYPES[toType] || []
  return compatible.includes(fromType)
}

// [P0-4] Undo/Redo 历史栈
interface HistorySnapshot { nodes: PipelineNode[]; connections: Connection[] }
const undoStack = ref<HistorySnapshot[]>([])
const redoStack = ref<HistorySnapshot[]>([])
const MAX_HISTORY = 50
let suppressHistory = false
function pushHistory() {
  if (suppressHistory) return
  const snapshot: HistorySnapshot = {
    nodes: JSON.parse(JSON.stringify(nodes)),
    connections: JSON.parse(JSON.stringify(connections)),
  }
  undoStack.value.push(snapshot)
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = [] // 新操作清空 redo
}
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)
function undo() {
  if (!canUndo.value) return
  const current: HistorySnapshot = {
    nodes: JSON.parse(JSON.stringify(nodes)),
    connections: JSON.parse(JSON.stringify(connections)),
  }
  redoStack.value.push(current)
  const prev = undoStack.value.pop()!
  suppressHistory = true
  const restoredNodes = JSON.parse(JSON.stringify(prev.nodes)) as PipelineNode[]
  const restoredConns = JSON.parse(JSON.stringify(prev.connections)) as Connection[]
  nodes.splice(0, nodes.length, ...restoredNodes)
  connections.splice(0, connections.length, ...restoredConns)
  suppressHistory = false
  dirty.value = true
}
function redo() {
  if (!canRedo.value) return
  const current: HistorySnapshot = {
    nodes: JSON.parse(JSON.stringify(nodes)),
    connections: JSON.parse(JSON.stringify(connections)),
  }
  undoStack.value.push(current)
  const next = redoStack.value.pop()!
  suppressHistory = true
  const restoredNodes = JSON.parse(JSON.stringify(next.nodes)) as PipelineNode[]
  const restoredConns = JSON.parse(JSON.stringify(next.connections)) as Connection[]
  nodes.splice(0, nodes.length, ...restoredNodes)
  connections.splice(0, connections.length, ...restoredConns)
  suppressHistory = false
  dirty.value = true
}
// 键盘快捷键
function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); undo()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault(); redo()
  }
}
// [P2-X] 通道选择器: 加载后端通道/设备列表供 GB28181 节点 channelId/deviceId 选择
interface ChannelOption { value: string; label: string; subLabel: string; status: string; deviceId: string; deviceName: string }
interface DeviceOption { value: string; label: string }
const channelOptions = ref<ChannelOption[]>([])
const deviceOptions = ref<DeviceOption[]>([])
const devicesLoading = ref(false)
const channelsLoading = ref(false)

async function loadDevices() {
  devicesLoading.value = true
  try {
    const resp = await deviceApi.getList({ page: 1, pageSize: 200 })
    const data = resp?.data
    console.log('[Pipeline][调试] /devices 响应:', JSON.stringify(data)?.slice(0, 500))
    const rawList: any[] = (data?.data as any)?.items || (data?.data as any)?.list || []
    console.log('[Pipeline][调试] 解析后设备数:', rawList.length, '样例:', rawList[0])
    deviceOptions.value = rawList.map((d: any) => {
      const id = String(d.device_id ?? d.id ?? '')
      const name = d.device_name ?? d.deviceName ?? d.name ?? (id ? `设备${id}` : '(未命名)')
      return { value: id, label: id ? `${id} · ${name}` : name }
    }).filter((d: any) => d.value)
  } catch (err) {
    console.warn('[Pipeline] 设备列表加载失败:', err)
  } finally {
    devicesLoading.value = false
  }
}

async function loadChannels() {
  channelsLoading.value = true
  try {
    // 拉取前 200 条通道 (跨设备、跨状态)
    const resp = await channelApi.getList({ page: 1, pageSize: 200 })
    const data = resp?.data
    console.log('[Pipeline][调试] /channels 响应:', JSON.stringify(data)?.slice(0, 500))
    const rawList: any[] = (data?.data as any)?.items || (data?.data as any)?.list || []
    console.log('[Pipeline][调试] 解析后通道数:', rawList.length, '样例:', rawList[0])
    channelOptions.value = rawList.map((c: any) => {
      // 兼容后端多键名 (snake_case / camelCase / GB28181 数字 ID)
      const id = String(c.channel_id ?? c.channelId ?? c.id ?? c.channel ?? c.channelNo ?? '')
      const deviceId = String(c.device_id ?? c.deviceId ?? '')
      const deviceName = c.device_name ?? c.deviceName ?? (deviceId ? `设备${deviceId}` : '(未分组)')
      const name = c.channel_name ?? c.channelName ?? c.name ?? (id ? `通道${id}` : '(未命名)')
      const status = c.status ?? c.channel_status ?? 'unknown'
      const width = c.width ?? ''
      const height = c.height ?? ''
      const codec = c.codec ?? ''
      const fps = Number(c.fps ?? c.frame_rate ?? 0)
      const resolution = c.resolution ?? c.res ?? (width && height ? `${width}x${height}` : '?')
      return {
        value: id,
        label: id ? `${id} · ${name}` : `${deviceId} · ${name}`,
        subLabel: `${resolution} ${codec} · ${fps.toFixed(0)}fps · ${status}`,
        status,
        deviceId,
        deviceName,
      }
    }).filter((c: any) => c.value)
  } catch (err) {
    console.warn('[Pipeline] 通道列表加载失败:', err)
  } finally {
    channelsLoading.value = false
  }
}

/** 按设备分组的通道 (供 el-option-group 使用) */
const channelGroups = computed(() => {
  const map = new Map<string, { deviceId: string; deviceName: string; channels: ChannelOption[] }>()
  for (const c of channelOptions.value) {
    const key = c.deviceId || '__nogroup__'
    if (!map.has(key)) {
      map.set(key, { deviceId: c.deviceId, deviceName: c.deviceName || '(未分组)', channels: [] })
    }
    map.get(key)!.channels.push(c)
  }
  return Array.from(map.values()).sort((a, b) => a.deviceName.localeCompare(b.deviceName))
})

/** 过滤当前 deviceId 下的通道 (用于 channel-picker 联动 device-picker) */
const filteredChannelOptions = computed(() => {
  if (!selectedNodeData.value) return channelOptions.value
  const devProp = selectedNodeData.value.props?.find((p: any) => p.key === 'deviceId')
  if (devProp?.value) return channelOptions.value.filter(c => c.deviceId === devProp.value)
  return channelOptions.value
})

const filteredChannelGroups = computed(() => {
  const opts = filteredChannelOptions.value
  const map = new Map<string, { deviceId: string; deviceName: string; channels: ChannelOption[] }>()
  for (const c of opts) {
    const key = c.deviceId || '__nogroup__'
    if (!map.has(key)) {
      map.set(key, { deviceId: c.deviceId, deviceName: c.deviceName || '(未分组)', channels: [] })
    }
    map.get(key)!.channels.push(c)
  }
  return Array.from(map.values()).sort((a, b) => a.deviceName.localeCompare(b.deviceName))
})

/** 手动刷新通道 + 设备列表 */
async function reloadChannelsAndDevices() {
  await Promise.all([loadChannels(), loadDevices()])
  ElMessage.success(`通道列表已刷新：${channelOptions.value.length} 个通道 / ${deviceOptions.value.length} 个设备`)
}

/** 过滤显示属性: channelIds 仅在 multiChannel=true 时可见 */
const visibleProps = computed(() => {
  if (!selectedNodeData.value) return []
  const multiSwitch = selectedNodeData.value.props.find((p: any) => p.key === 'multiChannel')
  const isMulti = multiSwitch?.value === true
  return selectedNodeData.value.props.filter((p: any) => {
    if (p.key === 'channelIds') return isMulti
    return true
  })
})

onMounted(() => { loadChannels(); loadDevices(); window.addEventListener('keydown', onKeydown) })
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const pipelineId = ref('')
const pipelineName = ref('新建Pipeline')
const dirty = ref(false)

// [BUG 6 修复 + P2-2 修复] pipeline_id 规范化：分离 ASCII ID 和中文显示名
//   原因：后端在 SLM/IRM 注册等多处使用 pipeline_id 作为标识符，
//         中文字符可能导致 SQLite key 异常或 URL 编码问题
//   [P2-2 修复] 原 4 位随机字符碰撞概率高 (36^4 ≈ 170 万)，改用 crypto.randomUUID
function generatePipelineId(): string {
  // crypto.randomUUID() 生成 RFC 4122 v4 UUID，碰撞概率几乎为零
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'pipeline-' + crypto.randomUUID()
  }
  // Fallback: 浏览器不支持 crypto.randomUUID 时，使用更高熵的随机生成
  return 'pipeline-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
}
// 组件初始化时生成 ID
pipelineId.value = generatePipelineId()
const nodes = reactive<PipelineNode[]>([])
const connections = reactive<Connection[]>([])
const selectedNode = ref('')
const canvasContainer = ref<HTMLElement>()
const canvasW = ref(2000)
const canvasH = ref(1200)

// v7.0: 验证/部署/监控状态
const validating = ref(false)
const deploying = ref(false)
const undeploying = ref(false)
const showMonitor = ref(false)
const runtimeStatus = ref<PipelineRuntimeStatus | null>(null)
let monitorTimer: ReturnType<typeof setInterval> | null = null

// 拖拽
let dragComp: any = null
let dragNode: PipelineNode | null = null
let dragOffset = { x: 0, y: 0 }

// 连线 — 使用 reactive 确保拖拽时虚线能响应式更新
const drawingLine = ref(false)
const lineFrom = reactive({ node: '', port: '', dir: '' })
const lineTo = reactive({ x: 0, y: 0 })

// ROI - computed bridge for RoiPolygonEditor v-model
const roiFlatPoints = computed({
  get: (): RoiData[] => selectedNodeData.value?.roiPolygon || [],
  set: (val: RoiData[]) => {
    const node = nodes.find(n => n.id === selectedNode.value)
    if (node) { node.roiPolygon = val; dirty.value = true }
  }
})

const categories = [
  { name: '视频源', icon: '📹', items: [
    { type: 'rtsp', name: 'RTSP拉流', icon: '📡', inputs: [], outputs: ['video_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'url', label: 'RTSP地址', type: 'text', value: 'rtsp://' }] },
    { type: 'onvif', name: 'ONVIF', icon: '📷', inputs: [], outputs: ['video_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [{ key: 'ip', label: '设备IP', type: 'text', value: '' }] },
    // [P1-6] GB28181通道节点 + [P1-9] 多通道配置 + [P2-X] 设备联动 + GB28181专属属性
    { type: 'gb28181', name: 'GB28181通道', icon: '📹', inputs: [], outputs: ['video_out'], hasROI: false, hasSchedule: false, hasActions: false, props: [
      { key: 'deviceId', label: '所属设备', type: 'device-picker', value: '' },
      { key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' },
      { key: 'multiChannel', label: '多通道模式', type: 'switch', value: false },
      { key: 'channelIds', label: '多通道选择', type: 'channels-picker', value: '', multiline: true },
      { key: 'streamMode', label: '码流', type: 'select', value: 'main', options: ['main', 'sub'] },
      { key: 'transport', label: 'RTP传输模式', type: 'select', value: 'UDP', options: ['UDP', 'TCP-PASSIVE', 'TCP-ACTIVE'] },
      { key: 'resolution', label: '分辨率', type: 'select', value: '1080p', options: ['720p', '1080p', '4K'] }
    ] },
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
  pushHistory()
  const rect = canvasContainer.value!.getBoundingClientRect()
  // 除以缩放比例，确保缩放后拖放位置准确
  const x = (e.clientX - rect.left) / canvasScale.value
  const y = (e.clientY - rect.top) / canvasScale.value
  const node: PipelineNode = {
    id: genNodeId(), type: dragComp.type, label: dragComp.name, icon: dragComp.icon,
    x, y, inputs: [...dragComp.inputs], outputs: [...dragComp.outputs],
    hasROI: dragComp.hasROI, hasSchedule: dragComp.hasSchedule, hasActions: dragComp.hasActions,
    roiPolygon: [],
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
  // 考虑缩放比例：屏幕偏移 / scale = 画布偏移
  dragOffset = { x: (e.clientX - node.x) / canvasScale.value, y: (e.clientY - node.y) / canvasScale.value }
}
function onCanvasMouseDown(e: MouseEvent) {
  if (!dragNode) selectedNode.value = ''
}
function onCanvasMouseMove(e: MouseEvent) {
  if (dragNode) {
    // 考虑缩放比例
    dragNode.x = Math.max(0, (e.clientX - dragOffset.x) / canvasScale.value)
    dragNode.y = Math.max(0, (e.clientY - dragOffset.y) / canvasScale.value)
    dirty.value = true
  }
  if (drawingLine.value) {
    const rect = canvasContainer.value!.getBoundingClientRect()
    // 除以缩放比例，将屏幕坐标转换为画布坐标
    lineTo.x = (e.clientX - rect.left) / canvasScale.value
    lineTo.y = (e.clientY - rect.top) / canvasScale.value
  }
}
// onCanvasMouseUp: 鼠标释放在画布空白处时取消连线
// 端口上的释放由 onPortMouseUp 处理（通过 @mouseup.stop 拦截）
function onCanvasMouseUp(_e: MouseEvent) {
  dragNode = null
  if (drawingLine.value) {
    drawingLine.value = false
    lineFrom.node = ''
    lineFrom.port = ''
    lineFrom.dir = ''
  }
}
// [P0-5] 辅助函数：添加连线（防重复 + 语义校验）
function addConnection(fromNode: string, fromPort: string, toNode: string, toPort: string) {
  const exists = connections.some(c =>
    c.fromNode === fromNode && c.fromPort === fromPort &&
    c.toNode === toNode && c.toPort === toPort
  )
  if (exists) return
  // 端口语义兼容性检查
  if (!isPortCompatible(fromPort, toPort)) {
    ElMessage.warning(`端口不兼容: ${fromPort}(${getPortType(fromPort)}) → ${toPort}(${getPortType(toPort)})`)
    return
  }
  pushHistory()
  connections.push({ fromNode, fromPort, toNode, toPort })
  dirty.value = true
}

// 端口连线起点（支持双向：out→in 和 in→out）
function onPortMouseDown(e: MouseEvent, nodeId: string, port: string, dir: string) {
  drawingLine.value = true
  lineFrom.node = nodeId
  lineFrom.port = port
  lineFrom.dir = dir
}
// 端口连线终点 — 鼠标在目标端口上释放时创建连线
function onPortMouseUp(e: MouseEvent, nodeId: string, port: string, dir: string) {
  if (!drawingLine.value) return
  drawingLine.value = false
  if (lineFrom.node && lineFrom.node !== nodeId) {
    // 正向连线: out → in
    if (lineFrom.dir === 'out' && dir === 'in') {
      addConnection(lineFrom.node, lineFrom.port, nodeId, port)
    }
    // 反向连线: in → out
    else if (lineFrom.dir === 'in' && dir === 'out') {
      addConnection(nodeId, port, lineFrom.node, lineFrom.port)
    }
  }
  lineFrom.node = ''
  lineFrom.port = ''
  lineFrom.dir = ''
}

// [UX] 点击端口也可连线：首次点击作为起点（高亮），再次点击同向或目标端口连线
function onPortClick(e: MouseEvent, nodeId: string, port: string, dir: string) {
  // 如果当前未在连线：把这个端口当起点
  if (!drawingLine.value) {
    drawingLine.value = true
    lineFrom.node = nodeId
    lineFrom.port = port
    lineFrom.dir = dir
    return
  }
  // 已经在连线中：点击同一端点 → 取消
  if (lineFrom.node === nodeId && lineFrom.port === port && lineFrom.dir === dir) {
    cancelDrawing()
    return
  }
  // 点击同节点的其他端口：换个方向/起点
  if (lineFrom.node === nodeId) {
    lineFrom.port = port
    lineFrom.dir = dir
    return
  }
  // 点击另一个节点的端口：创建连线
  if (lineFrom.dir === 'out' && dir === 'in') {
    addConnection(lineFrom.node, lineFrom.port, nodeId, port)
    cancelDrawing()
  }
  else if (lineFrom.dir === 'in' && dir === 'out') {
    addConnection(nodeId, port, lineFrom.node, lineFrom.port)
    cancelDrawing()
  }
  else {
    ElMessage.warning('请从输出端口连到输入端口（绿色为输入、蓝色为输出）')
  }
}

function cancelDrawing() {
  drawingLine.value = false
  lineFrom.node = ''
  lineFrom.port = ''
  lineFrom.dir = ''
}

// 计算属性：起点节点名称（用于画线提示条）
const sourceNodeLabel = computed(() => {
  if (!lineFrom.node) return ''
  const n = nodes.find(nd => nd.id === lineFrom.node)
  return n?.label || lineFrom.node
})

// [UX] 端口状态 class：起点黄色高亮，目标蓝色高亮，提示中间状态
function portClass(nodeId: string, port: string, dir: string): string {
  if (!drawingLine.value) return ''
  if (lineFrom.node === nodeId && lineFrom.port === port && lineFrom.dir === dir) {
    return 'port-drawing-source'
  }
  // 反向端口灰变蓝高亮（提示可连接）
  if (lineFrom.node !== nodeId && ((lineFrom.dir === 'out' && dir === 'in') || (lineFrom.dir === 'in' && dir === 'out'))) {
    const compatible = isPortCompatible(lineFrom.port, port)
    return compatible ? 'port-drawing-target' : ''
  }
  return ''
}

function portPos(nodeId: string, port: string): { x: number; y: number } {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return { x: 0, y: 0 }
  const isInput = node.inputs.includes(port)
  let portIndex: number
  if (isInput) {
    portIndex = node.inputs.indexOf(port)
  } else {
    portIndex = node.inputs.length + Math.max(0, node.outputs.indexOf(port))
  }
  // CSS 实际渲染: header padding 6px + 内容 ~22px + padding 6px ≈ 34px
  // node-ports padding-top 6px, 每个 port 行高 ≈ 20px, port-dot 中心偏移 ≈ 10px
  return {
    x: node.x + (isInput ? 0 : 180),
    y: node.y + 50 + portIndex * 20,
  }
}

function linePath(conn: Connection): string {
  const from = portPos(conn.fromNode, conn.fromPort)
  const to = portPos(conn.toNode, conn.toPort)
  const dx = Math.abs(to.x - from.x)
  // 最小控制点距离 30px，确保短连线也有平滑曲线
  const cx = Math.max(30, dx * 0.5)
  return `M${from.x},${from.y} C${from.x + cx},${from.y} ${to.x - cx},${to.y} ${to.x},${to.y}`
}

const tempLinePath = computed(() => {
  const from = portPos(lineFrom.node, lineFrom.port)
  const dx = Math.abs(lineTo.x - from.x)
  const cx = Math.max(30, dx * 0.5)
  return `M${from.x},${from.y} C${from.x + cx},${from.y} ${lineTo.x - cx},${lineTo.y} ${lineTo.x},${lineTo.y}`
})

// SVG canvas ref + 动态创建 marker (避免 Vue 模板编译 SVG defs/marker 命名空间丢失)
const svgCanvas = ref<SVGSVGElement | null>(null)
function ensureArrowMarker() {
  const svg = svgCanvas.value
  if (!svg) return
  if (svg.querySelector('#arrowhead')) return  // 已存在
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const defs = document.createElementNS(SVG_NS, 'defs')
  const marker = document.createElementNS(SVG_NS, 'marker')
  marker.setAttribute('id', 'arrowhead')
  marker.setAttribute('markerWidth', '10')
  marker.setAttribute('markerHeight', '7')
  marker.setAttribute('refX', '8')
  marker.setAttribute('refY', '3.5')
  marker.setAttribute('orient', 'auto')
  marker.setAttribute('markerUnits', 'strokeWidth')
  const polygon = document.createElementNS(SVG_NS, 'polygon')
  polygon.setAttribute('points', '0 0, 10 3.5, 0 7')
  polygon.setAttribute('fill', '#1A73E8')
  marker.appendChild(polygon)
  defs.appendChild(marker)
  svg.insertBefore(defs, svg.firstChild)
}
// 监听 svgCanvas ref，挂载后注入 marker
watch(svgCanvas, (el) => { if (el) ensureArrowMarker() }, { flush: 'post' })
// 点击连线删除
function removeConnection(idx: number) {
  pushHistory()
  connections.splice(idx, 1)
  dirty.value = true
}
function removeNode(id: string) {
  pushHistory()
  const idx = nodes.findIndex(n => n.id === id)
  if (idx >= 0) nodes.splice(idx, 1)
  // 删除关联连线
  for (let i = connections.length - 1; i >= 0; i--) {
    if (connections[i].fromNode === id || connections[i].toNode === id) connections.splice(i, 1)
  }
  if (selectedNode.value === id) selectedNode.value = ''
  dirty.value = true
}
function clearCanvas() {
  if (nodes.length > 0 || connections.length > 0) pushHistory()
  nodes.splice(0); connections.splice(0); selectedNode.value = ''; dirty.value = true
}

// 保存/加载 [BUG 6 修复: 使用 pipelineId 而非 pipelineName 作为标识符]
async function handleSavePipeline() {
  const payload = {
    id: pipelineId.value,
    name: pipelineName.value,
    nodes: nodes.map(n => ({ ...n })),
    connections: [...connections],
  }
  try {
    const { data: resp } = await apiSavePipeline(payload as any)
    // 从响应中获取后端分配的 ID（如果是新建）
    const returnedId = (resp as any)?.data?.pipeline_id || (resp as any)?.data?.id
    if (returnedId) pipelineId.value = returnedId
    ElMessage.success('Pipeline已保存')
    dirty.value = false
  } catch (e: any) {
    ElMessage.error('保存失败: ' + e.message)
  }
}
async function loadPipeline() {
  // [P2-7 修复] 不再盲匹配当前 id/name，直接跳到列表页让用户挑选。
  //   原因：原实现使用 find(p => p.id === pipelineId || p.name === pipelineName)，
  //         新建流水线的 pipelineId 是随机生成的 UUID，名称也常为默认值，
  //         导致创建后永远「未找到Pipeline」。现统一改为路由驱动加载。
  router.push('/pipelines')
}

// [P2-7] 路由参数 :id 变化时自动加载对应流水线
const route = useRoute()
const router = useRouter()
watch(
  () => route.params.id,
  async (id) => {
    const sid = Array.isArray(id) ? id[0] : (id || '')
    if (sid && pipelineId.value !== sid) {
      try {
        const { data: resp } = await getPipeline(sid)
        const pl = (resp as any)?.data || resp
        if (!pl || !pl.id) {
          ElMessage.warning('未找到 id=' + sid + ' 的流水线')
          return
        }
        if (pl.id) pipelineId.value = pl.id
        if (pl.name) pipelineName.value = pl.name
        nodes.splice(0); connections.splice(0)
        const rawNodes = (pl.nodes || []) as any[]
        for (const rn of rawNodes) {
          nodes.push({
            id: rn.id || '', type: rn.type || '', label: rn.label || rn.id || '',
            icon: rn.icon || '🔧',
            x: typeof rn.x === 'number' ? rn.x : 100,
            y: typeof rn.y === 'number' ? rn.y : 100,
            inputs: Array.isArray(rn.inputs) ? rn.inputs : [],
            outputs: Array.isArray(rn.outputs) ? rn.outputs : [],
            hasROI: typeof rn.hasROI === 'boolean' ? rn.hasROI : (typeof rn.has_roi === 'boolean' ? rn.has_roi : false),
            hasSchedule: typeof rn.hasSchedule === 'boolean' ? rn.hasSchedule : (typeof rn.has_schedule === 'boolean' ? rn.has_schedule : false),
            hasActions: typeof rn.hasActions === 'boolean' ? rn.hasActions : (typeof rn.has_actions === 'boolean' ? rn.has_actions : false),
            roiPolygon: Array.isArray(rn.roiPolygon) ? rn.roiPolygon : (Array.isArray(rn.roi_polygon) ? rn.roi_polygon : []),
            props: Array.isArray(rn.props) ? rn.props.map((p: any) => ({ ...p })) : [],
            scheduleType: rn.scheduleType || rn.schedule_type || 'all',
            actionAlarm: typeof rn.actionAlarm === 'boolean' ? rn.actionAlarm : (typeof rn.action_alarm === 'boolean' ? rn.action_alarm : false),
            actionLight: typeof rn.actionLight === 'boolean' ? rn.actionLight : (typeof rn.action_light === 'boolean' ? rn.action_light : false),
            actionGate: typeof rn.actionGate === 'boolean' ? rn.actionGate : (typeof rn.action_gate === 'boolean' ? rn.action_gate : false),
          })
        }
        const rawConns = (pl.connections || []) as any[]
        for (const rc of rawConns) {
          connections.push({
            fromNode: rc.fromNode || rc.from_node || '',
            fromPort: rc.fromPort || rc.from_port || 'output',
            toNode: rc.toNode || rc.to_node || '',
            toPort: rc.toPort || rc.to_port || 'input',
          })
        }
        dirty.value = false
        ElMessage.success('已加载: ' + (pl.name || sid))
      } catch (e: any) {
        console.error('[PipelineEditor] load by id failed:', e)
        ElMessage.error('加载失败: ' + (e?.message || sid))
      }
    }
  },
  { immediate: true }
)

// v7.0: 验证Pipeline
async function handleValidate() {
  validating.value = true
  try {
    const payload = { name: pipelineName.value, nodes: nodes.map(n => ({ ...n })), connections: [...connections] }
    const { data: resp } = await validatePipeline(pipelineId.value, payload)
    const result = (resp as any)?.data || resp
    if (result.valid) {
      ElMessage.success(`验证通过: ${result.node_count}个节点, ${result.edge_count}条边`)
    } else {
      ElMessage.error(`验证失败: ${(result.errors || []).join('; ')}`)
    }
    if (result.warnings?.length) {
      ElMessage.warning(`警告: ${(result.warnings as string[]).join('; ')}`)
    }
  } catch (e: any) {
    ElMessage.error('验证请求失败: ' + e.message)
  } finally {
    validating.value = false
  }
}

// v7.0: 部署Pipeline
async function handleDeploy() {
  deploying.value = true
  try {
    const payload = { name: pipelineName.value, nodes: nodes.map(n => ({ ...n })), connections: [...connections] }
    const { data: resp } = await deployPipeline(pipelineId.value, payload)
    dirty.value = false
    if (showMonitor.value) startMonitor()
    // 部署成功弹框提示
    ElMessageBox.alert(
      `流水线「${pipelineName.value}」已成功部署并启动运行`,
      '部署成功',
      { confirmButtonText: '确定', type: 'success' }
    )
  } catch (e: any) {
    // 部署失败弹框提示
    ElMessageBox.alert(
      `部署失败：${e.message || '未知错误'}`,
      '部署失败',
      { confirmButtonText: '确定', type: 'error' }
    )
  } finally {
    deploying.value = false
  }
}

// v7.0: 停止Pipeline
async function handleUndeploy() {
  undeploying.value = true
  try {
    await undeployPipeline(pipelineId.value)
    stopMonitor()
    // 停止成功弹框提示
    ElMessageBox.alert(
      `流水线「${pipelineName.value}」已停止运行`,
      '停止成功',
      { confirmButtonText: '确定', type: 'success' }
    )
  } catch (e: any) {
    // 停止失败弹框提示
    ElMessageBox.alert(
      `停止失败：${e.message || '未知错误'}`,
      '停止失败',
      { confirmButtonText: '确定', type: 'error' }
    )
  } finally {
    undeploying.value = false
  }
}

// [P0-3 + DELETE-FIX 2026-07-14] 删除Pipeline — 成功后跳转列表页自动刷新
async function handleDeletePipeline() {
  if (!pipelineId.value) {
    ElMessage.warning('请先加载或选择一个 Pipeline')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除Pipeline "${pipelineName.value}" 吗？此操作不可撤销。`,
      '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch { return } // 用户取消
  try {
    const resp = await deletePipeline(pipelineId.value)
    const deleted = (resp?.data as any)?.deleted ?? true
    if (deleted === false) {
      ElMessage.warning('Pipeline 不存在或已被删除 (idempotent)')
    } else {
      ElMessage.success('Pipeline已删除')
    }
    clearCanvas()
    pipelineId.value = generatePipelineId()
    pipelineName.value = '新建Pipeline'
    dirty.value = false
    undoStack.value = []
    redoStack.value = []
    // 跳转列表页：列表页 onMounted 会自动调 loadAll() 刷新列表
    router.push('/pipelines')
  } catch (e: any) {
    ElMessage.error('删除失败: ' + e.message)
  }
}

// v7.0: 运行时监控
function toggleMonitor() {
  showMonitor.value = !showMonitor.value
  if (showMonitor.value) {
    startMonitor()
  } else {
    stopMonitor()
  }
}

function startMonitor() {
  stopMonitor()
  fetchRuntime()
  monitorTimer = setInterval(fetchRuntime, 3000)
}

function stopMonitor() {
  if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null }
  runtimeStatus.value = null
}

async function fetchRuntime() {
  try {
    const { data: resp } = await getPipelineRuntime(pipelineId.value)
    runtimeStatus.value = ((resp as any)?.data || resp) as PipelineRuntimeStatus
    // [P1-10] 节点异常告警
    if (runtimeStatus.value?.nodes) {
      for (const n of runtimeStatus.value.nodes) {
        if (n.state === 'ERROR') {
          ElNotification({ title: '节点异常', message: `节点 ${n.node_id} (${n.type}) 状态异常`, type: 'error', duration: 5000 })
        }
      }
    }
    // [P1-10] TPU 过载告警
    if ((runtimeStatus.value as any)?.tpu_utilization > 85) {
      ElNotification({ title: 'TPU过载', message: `TPU利用率 ${(runtimeStatus.value as any).tpu_utilization.toFixed(0)}% 超过阈值`, type: 'warning', duration: 4000 })
    }
  } catch { /* ignore */ }
}

// [P1-8] 画布缩放
const canvasScale = ref(1)

// [P1-8] 小地图计算
const minimapW = 148
const minimapH = 80
const minimapNodeW = 8
const minimapNodeH = 5
const minimapScaleX = (x: number) => {
  if (nodes.length === 0) return 0
  const minX = Math.min(...nodes.map(n => n.x), 0)
  const maxX = Math.max(...nodes.map(n => n.x + 180), 200)
  const range = Math.max(1, maxX - minX)
  return ((x - minX) / range) * (minimapW - minimapNodeW) + 1
}
const minimapScaleY = (y: number) => {
  if (nodes.length === 0) return 0
  const minY = Math.min(...nodes.map(n => n.y), 0)
  const maxY = Math.max(...nodes.map(n => n.y + 80), 100)
  const range = Math.max(1, maxY - minY)
  return ((y - minY) / range) * (minimapH - minimapNodeH) + 1
}
const minimapPortX = (nodeId: string) => {
  const node = nodes.find(n => n.id === nodeId)
  return node ? minimapScaleX(node.x) + minimapNodeW / 2 : 0
}
const minimapPortY = (nodeId: string) => {
  const node = nodes.find(n => n.id === nodeId)
  return node ? minimapScaleY(node.y) + minimapNodeH / 2 : 0
}
function zoomIn() { canvasScale.value = Math.min(2, +(canvasScale.value + 0.1).toFixed(1)) }
function zoomOut() { canvasScale.value = Math.max(0.5, +(canvasScale.value - 0.1).toFixed(1)) }
function zoomReset() { canvasScale.value = 1 }
// [P1-8] 适应窗口 — 自动计算缩放比例使所有节点可见
function fitView() {
  if (nodes.length === 0) { canvasScale.value = 1; return }
  const minX = Math.min(...nodes.map(n => n.x), 0)
  const maxX = Math.max(...nodes.map(n => n.x + 200), 400)
  const minY = Math.min(...nodes.map(n => n.y), 0)
  const maxY = Math.max(...nodes.map(n => n.y + 100), 200)
  const contentW = maxX - minX
  const contentH = maxY - minY
  const canvas = document.querySelector('.pe-canvas') as HTMLElement
  if (!canvas) return
  const availW = canvas.clientWidth - 80
  const availH = canvas.clientHeight - 80
  const scaleX = availW / contentW
  const scaleY = availH / contentH
  canvasScale.value = Math.min(2, Math.max(0.5, Math.min(scaleX, scaleY)))
}
function onCanvasWheel(e: WheelEvent) {
  if (!e.ctrlKey) return
  e.preventDefault()
  if (e.deltaY < 0) { zoomIn() } else { zoomOut() }
}

// [P2-5] 导入文件 input ref
const importFileInput = ref<HTMLElement>()

// [P2-5] Pipeline 导出为 JSON 文件下载
function handleExportPipeline() {
  const exportData = {
    version: '2.0',
    exported_at: new Date().toISOString(),
    pipeline_id: pipelineId.value,
    name: pipelineName.value,
    nodes: JSON.parse(JSON.stringify(nodes)),
    connections: JSON.parse(JSON.stringify(connections)),
  }
  const jsonStr = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeName = pipelineName.value.replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, '_')
  a.download = `pipeline_${safeName}_${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  ElMessage.success('Pipeline已导出为JSON文件')
}

// [P2-5] 触发文件选择
function handleImportClick() {
  importFileInput.value?.click()
}

// [P2-5] 导入 JSON 文件还原到画布
async function handleImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (!data.nodes || !Array.isArray(data.nodes)) {
      ElMessage.error('无效的Pipeline JSON: 缺少nodes字段')
      return
    }
    pushHistory()
    nodes.splice(0); connections.splice(0); selectedNode.value = ''
    // 恢复名称
    if (data.name) pipelineName.value = data.name
    if (data.pipeline_id) pipelineId.value = data.pipeline_id
    else pipelineId.value = generatePipelineId()
    // 恢复节点
    for (const rn of data.nodes) {
      const node: PipelineNode = {
        id: rn.id || genNodeId(),
        type: rn.type || '',
        label: rn.label || rn.type || '',
        icon: rn.icon || '🔧',
        x: typeof rn.x === 'number' ? rn.x : 100,
        y: typeof rn.y === 'number' ? rn.y : 100,
        inputs: Array.isArray(rn.inputs) ? rn.inputs : [],
        outputs: Array.isArray(rn.outputs) ? rn.outputs : [],
        hasROI: !!rn.hasROI,
        hasSchedule: !!rn.hasSchedule,
        hasActions: !!rn.hasActions,
        roiPolygon: Array.isArray(rn.roiPolygon) ? rn.roiPolygon : [],
        props: Array.isArray(rn.props) ? rn.props.map((p: any) => ({ ...p })) : [],
        scheduleType: rn.scheduleType || 'all',
        actionAlarm: !!rn.actionAlarm,
        actionLight: !!rn.actionLight,
        actionGate: !!rn.actionGate,
      }
      nodes.push(node)
    }
    // 恢复连线
    if (Array.isArray(data.connections)) {
      for (const rc of data.connections) {
        connections.push({
          fromNode: rc.fromNode || rc.from_node || '',
          fromPort: rc.fromPort || rc.from_port || '',
          toNode: rc.toNode || rc.to_node || '',
          toPort: rc.toPort || rc.to_port || '',
        })
      }
    }
    dirty.value = true
    ElMessage.success(`导入成功: ${nodes.length}个节点, ${connections.length}条连线`)
  } catch (err: any) {
    ElMessage.error('导入失败: ' + (err.message || 'JSON解析错误'))
  } finally {
    // 清空 input 以便重复导入同一文件
    input.value = ''
  }
}

// [P1-7] 流水线模板库
function applyTemplate(cmd: string) {
  pushHistory()
  nodes.splice(0); connections.splice(0); selectedNode.value = ''
  // [P2-X] GB28181 节点标准 props（包含设备选择器 + 通道下拉选择器 + GB28181专属属性）
  //   模板生成 GB28181 节点时自动注入，省去每处模板重复书写
  const GB28181_PROPS: PropItem[] = [
    { key: 'deviceId', label: '所属设备', type: 'device-picker', value: '' },
    { key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' },
    { key: 'multiChannel', label: '多通道模式', type: 'switch', value: false },
    { key: 'channelIds', label: '多通道选择', type: 'channels-picker', value: '', multiline: true },
    { key: 'streamMode', label: '码流', type: 'select', value: 'main', options: ['main', 'sub'] },
    { key: 'transport', label: 'RTP传输模式', type: 'select', value: 'UDP', options: ['UDP', 'TCP-PASSIVE', 'TCP-ACTIVE'] },
    { key: 'resolution', label: '分辨率', type: 'select', value: '1080p', options: ['720p', '1080p', '4K'] }
  ]
  const makeNode = (type: string, label: string, icon: string, x: number, y: number, inputs: string[], outputs: string[], extra: any = {}): PipelineNode => ({
    id: genNodeId(), type, label, icon, x, y, inputs, outputs, roiPolygon: [],
    props: type === 'gb28181' ? GB28181_PROPS.map(p => ({ ...p })) : ([] as PropItem[]),
    scheduleType: 'all', actionAlarm: false, actionLight: false, actionGate: false, ...extra
  })
  const connect = (fn: number, fp: string, tn: number, tp: string) => {
    connections.push({ fromNode: nodes[fn].id, fromPort: fp, toNode: nodes[tn].id, toPort: tp })
  }

  if (cmd === 'perimeter') {
    pipelineName.value = '周界入侵检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('perimeter', '周界入侵', '🚧', 510, 100, ['frame_in'], ['alarm_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'sensitivity', label: '灵敏度', type: 'slider', value: 0.8, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in')
    connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in')
    connect(2, 'alarm_out', 3, 'dets_in')
    connect(2, 'alarm_out', 4, 'alarm_in')
  } else if (cmd === 'pedestrian') {
    pipelineName.value = '人形检测+追踪'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out']))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', 'YOLO检测', '🎯', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8s', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('reid', 'ReID追踪', '🔄', 740, 100, ['frame_in', 'dets_in'], ['track_out']))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 100, ['frame_in', 'dets_in'], ['frame_out']))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(1, 'frame_out', 4, 'frame_in'); connect(3, 'track_out', 4, 'dets_in')
  } else if (cmd === 'face') {
    pipelineName.value = '人脸识别门禁'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out']))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('face', '人脸识别', '👤', 510, 100, ['frame_in'], ['face_out'], { props: [{ key: 'model', label: '模型', type: 'select', value: 'arcface', options: ['arcface', 'mobileface'] }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'HTTP Webhook', '📡', 740, 200, ['alarm_in'], [], { props: [{ key: 'topic', label: 'Webhook URL', type: 'text', value: 'http://localhost/webhook' }] }))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'face_out', 3, 'dets_in')
  } else if (cmd === 'tripwire') {
    pipelineName.value = '绊线检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out']))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('tripwire', '绊线检测', '〰️', 510, 100, ['frame_in'], ['alarm_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'alarm_out', 3, 'dets_in')
    connect(2, 'alarm_out', 4, 'alarm_in')
  } else if (cmd === 'multi') {
    pipelineName.value = '多通道并发检测'
    nodes.push(makeNode('gb28181', '通道1', '📹', 50, 60, [], ['video_out']))
    nodes.push(makeNode('gb28181', '通道2', '📹', 50, 200, [], ['video_out']))
    nodes.push(makeNode('decode', '解码1', '🔓', 280, 60, ['video_in'], ['frame_out']))
    nodes.push(makeNode('decode', '解码2', '🔓', 280, 200, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', 'YOLO检测', '🎯', 510, 130, ['frame_in'], ['dets_out'], { hasROI: true }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 130, ['frame_in', 'dets_in'], ['frame_out']))
    connect(0, 'video_out', 2, 'video_in'); connect(1, 'video_out', 3, 'video_in')
    connect(2, 'frame_out', 4, 'frame_in'); connect(3, 'frame_out', 4, 'frame_in')
    connect(4, 'dets_out', 5, 'dets_in'); connect(2, 'frame_out', 5, 'frame_in')
  } else if (cmd === 'enhance') {
    pipelineName.value = '视频增强推流'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out']))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('resize', 'Resize', '📐', 510, 100, ['frame_in'], ['frame_out'], { props: [{ key: 'width', label: '宽度', type: 'number', value: 1920, min: 64, max: 3840 }, { key: 'height', label: '高度', type: 'number', value: 1080, min: 64, max: 2160 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 100, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('rtsp_out', 'RTSP推流', '📺', 970, 100, ['frame_in'], [], { props: [{ key: 'url', label: '推流地址', type: 'text', value: 'rtsp://localhost/live' }] }))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(2, 'frame_out', 3, 'frame_in'); connect(3, 'frame_out', 4, 'frame_in')
  } else if (cmd === 'privacy_mask') {
    pipelineName.value = '隐私遮罩合规'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 510, 100, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('privacy_mask', '隐私遮罩', '🙈', 740, 100, ['frame_in'], ['frame_out'], { props: [{ key: 'mode', label: '遮罩模式', type: 'select', value: 'solid_black', options: ['solid_black', 'solid_white', 'blur', 'mosaic'] }, { key: 'regions', label: '遮罩区域', type: 'text', value: '[]', description: 'JSON数组: [{"x":0.1,"y":0.1,"width":0.2,"height":0.2}]' }] }))
    nodes.push(makeNode('rtsp_out', 'RTSP推流', '📺', 970, 100, ['frame_in'], [], { props: [{ key: 'url', label: '推流地址', type: 'text', value: 'rtsp://localhost/live' }] }))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(2, 'frame_out', 3, 'frame_in'); connect(3, 'frame_out', 4, 'frame_in')
  } else if (cmd === 'fire_smoke') {
    pipelineName.value = '火灾烟雾检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '烟火检测', '🔥', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'fire_smoke_v2', options: ['fire_smoke_v2', 'smoke_v4', 'flame_v4'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'fighting') {
    pipelineName.value = '打架斗殴检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '打架检测', '⚔️', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'fighting_v3', options: ['fighting_v3'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'loitering') {
    pipelineName.value = '区域徘徊检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '人形检测', '🎯', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('reid', '徘徊追踪', '🔄', 740, 100, ['frame_in', 'dets_in'], ['track_out'], { props: [{ key: 'maxTrackAge', label: '追踪帧数', type: 'number', value: 300, min: 30, max: 900 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 970, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(1, 'frame_out', 4, 'frame_in'); connect(3, 'track_out', 4, 'dets_in')
    connect(3, 'track_out', 5, 'alarm_in')
  } else if (cmd === 'gathering') {
    pipelineName.value = '人员聚集检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '聚集检测', '👥', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'gathering_v3', options: ['gathering_v3', 'crowd_count_v1'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'fall_detection') {
    pipelineName.value = '跌倒检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '摔倒检测', '🩹', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'fall_v3', options: ['fall_v3'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'abandoned') {
    pipelineName.value = '遗留物检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '遗留物检测', '📦', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'abandoned_v1', options: ['abandoned_v1'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('reid', 'ReID追踪', '🔄', 740, 100, ['frame_in', 'dets_in'], ['track_out'], { props: [{ key: 'maxTrackAge', label: '追踪帧数', type: 'number', value: 180, min: 30, max: 600 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 970, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(1, 'frame_out', 4, 'frame_in'); connect(3, 'track_out', 4, 'dets_in')
    connect(3, 'track_out', 5, 'alarm_in')
  } else if (cmd === 'tailgating') {
    pipelineName.value = '门禁尾随检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '人形检测', '🎯', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('reid', '尾随追踪', '🔄', 740, 100, ['frame_in', 'dets_in'], ['track_out'], { props: [{ key: 'maxTrackAge', label: '追踪帧数', type: 'number', value: 120, min: 30, max: 600 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 970, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(1, 'frame_out', 4, 'frame_in'); connect(3, 'track_out', 4, 'dets_in')
    connect(3, 'track_out', 5, 'alarm_in')
  } else if (cmd === 'climbing') {
    pipelineName.value = '翻越检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('perimeter', '翻越检测', '🧗', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'climbing_v4', options: ['climbing_v4'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'running') {
    pipelineName.value = '异常奔跑检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '人形检测', '🎯', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('reid', '速度追踪', '🔄', 740, 100, ['frame_in', 'dets_in'], ['track_out'], { props: [{ key: 'maxTrackAge', label: '追踪帧数', type: 'number', value: 90, min: 15, max: 300 }, { key: 'speedThreshold', label: '速度阈值(m/s)', type: 'number', value: 3, min: 1, max: 10 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 970, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(1, 'frame_out', 4, 'frame_in'); connect(3, 'track_out', 4, 'dets_in')
    connect(3, 'track_out', 5, 'alarm_in')
  } else if (cmd === 'fire_lane') {
    pipelineName.value = '消防通道堵塞'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '障碍物检测', '🚒', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'blocked_exit_v1', options: ['blocked_exit_v1'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }, { key: 'dwellTime', label: '持续阈值(秒)', type: 'number', value: 30, min: 5, max: 300 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'traffic_lpr') {
    pipelineName.value = '车牌识别记录'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '车牌识别', '🔢', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'lpr_v1', options: ['lpr_v1'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'parking_violation') {
    pipelineName.value = '违停检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '车辆检测', '🚗', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('reid', '违停追踪', '🔄', 740, 100, ['frame_in', 'dets_in'], ['track_out'], { props: [{ key: 'maxTrackAge', label: '追踪帧数', type: 'number', value: 600, min: 60, max: 1800 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 970, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(1, 'frame_out', 4, 'frame_in'); connect(3, 'track_out', 4, 'dets_in')
    connect(3, 'track_out', 5, 'alarm_in')
  } else if (cmd === 'wrong_direction') {
    pipelineName.value = '逆行检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '车辆检测', '🚗', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('reid', '轨迹分析', '🔄', 740, 100, ['frame_in', 'dets_in'], ['track_out'], { props: [{ key: 'maxTrackAge', label: '追踪帧数', type: 'number', value: 180, min: 30, max: 600 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 970, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(1, 'frame_out', 4, 'frame_in'); connect(3, 'track_out', 4, 'dets_in')
    connect(3, 'track_out', 5, 'alarm_in')
  } else if (cmd === 'traffic_flow') {
    pipelineName.value = '车流量统计'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '车辆检测', '🚗', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: false, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('reid', '车流追踪', '🔄', 740, 100, ['frame_in', 'dets_in'], ['track_out'], { props: [{ key: 'maxTrackAge', label: '追踪帧数', type: 'number', value: 120, min: 30, max: 600 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 970, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(1, 'frame_out', 4, 'frame_in'); connect(3, 'track_out', 4, 'dets_in')
    connect(3, 'track_out', 5, 'alarm_in')
  } else if (cmd === 'helmet') {
    pipelineName.value = '安全帽检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '安全帽检测', '⛑️', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'helmet_v4', options: ['helmet_v4'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'ppe') {
    pipelineName.value = 'PPE合规检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', 'PPE检测', '🦺', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'ppe_v1', options: ['ppe_v1', 'helmet_v4', 'uniform_v3'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'smoking') {
    pipelineName.value = '吸烟检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '吸烟检测', '🚬', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'smoking_v1', options: ['smoking_v1'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'guard_absence') {
    pipelineName.value = '离岗检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '人形检测', '🎯', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('reid', '离岗追踪', '🔄', 740, 100, ['frame_in', 'dets_in'], ['track_out'], { props: [{ key: 'maxTrackAge', label: '追踪帧数', type: 'number', value: 600, min: 60, max: 1800 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 970, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(1, 'frame_out', 4, 'frame_in'); connect(3, 'track_out', 4, 'dets_in')
    connect(3, 'track_out', 5, 'alarm_in')
  } else if (cmd === 'phone_call') {
    pipelineName.value = '打电话检测'
    // [FIX v7.3 PhoneCall] 必传 algo_id='shield.algo.safety.phone_call'
    //   让后端 InferencePlugin 识别为 AlgoPluginBase;不带 algo_id 时将退回通用
    //   yolov8n.bmodel,反而走不到 phone_call_detector 专有代码路径(五帧投票/ROI/告警)。
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '打电话检测', '📱', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [
      { key: 'algo_id', label: '算法ID(AlgoPluginBase)', type: 'select', value: 'shield.algo.safety.phone_call', options: ['shield.algo.safety.phone_call'], description: '必填:其后端将调用 phone_call_detector.so 专有算法逻辑' },
      { key: 'model', label: '模型(bmodel 名)', type: 'select', value: 'phone_call_v1', options: ['phone_call_v1'], description: 'phone_call_v1.bmodel (设备若无将 symlink 到 yolov8n)' },
      { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }
    ] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'vest') {
    pipelineName.value = '反光衣检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '反光衣检测', '🦺', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'uniform_v3', options: ['uniform_v3', 'helmet_v4'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'campus_safety') {
    pipelineName.value = '校园防霸凌'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '打架检测', '⚔️', 510, 50, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'fighting_v3', options: ['fighting_v3'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('yolo', '危险物品', '🔪', 510, 200, ['frame_in'], ['dets_out'], { hasROI: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'knife_detect', options: ['knife_detect'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 50, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 260, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in')
    connect(1, 'frame_out', 2, 'frame_in'); connect(1, 'frame_out', 3, 'frame_in')
    connect(1, 'frame_out', 4, 'frame_in')
    connect(2, 'dets_out', 4, 'dets_in'); connect(3, 'dets_out', 4, 'dets_in')
    connect(2, 'dets_out', 5, 'alarm_in'); connect(3, 'dets_out', 5, 'alarm_in')
  } else if (cmd === 'dangerous_item') {
    pipelineName.value = '危险物品检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '危险物品', '🔪', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'knife_detect', options: ['knife_detect'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'eldercare') {
    pipelineName.value = '养老看护(跌倒+滞留)'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '跌倒检测', '🩹', 510, 50, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'fall_v3', options: ['fall_v3'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('yolo', '滞留检测', '🕐', 510, 200, ['frame_in'], ['dets_out'], { hasROI: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.4, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 120, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 260, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in')
    connect(1, 'frame_out', 2, 'frame_in'); connect(1, 'frame_out', 3, 'frame_in')
    connect(1, 'frame_out', 4, 'frame_in')
    connect(2, 'dets_out', 4, 'dets_in'); connect(3, 'dets_out', 4, 'dets_in')
    connect(2, 'dets_out', 5, 'alarm_in'); connect(3, 'dets_out', 5, 'alarm_in')
  } else if (cmd === 'high_altitude') {
    pipelineName.value = '高空抛物检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '抛物检测', '📉', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'abandoned_v1', options: ['abandoned_v1'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.4, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'crowd_density') {
    pipelineName.value = '人群密度热图'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '密度统计', '🌡️', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'crowd_count_v1', options: ['crowd_count_v1'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.3, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'face_attendance') {
    pipelineName.value = '人脸考勤打卡'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('face', '人脸识别', '👤', 510, 100, ['frame_in'], ['face_out'], { props: [{ key: 'model', label: '模型', type: 'select', value: 'arcface', options: ['arcface', 'mobileface'] }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', '考勤推送', '📋', 740, 200, ['alarm_in'], [], { props: [{ key: 'topic', label: 'Webhook URL', type: 'text', value: 'http://localhost/attendance' }] }))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'face_out', 3, 'dets_in')
    connect(2, 'face_out', 4, 'alarm_in')
  } else if (cmd === 'queue_length') {
    pipelineName.value = '排队长度检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '排队检测', '🧍', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.4, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'people_counting') {
    pipelineName.value = '人流计数'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '人流检测', '🔢', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.4, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'camera_health') {
    pipelineName.value = '摄像头健康检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '摄像头异常', '🔧', 510, 100, ['frame_in'], ['dets_out'], { hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '检测类型', type: 'select', value: 'camera_tamper', options: ['camera_tamper', 'brightness_abnormal', 'image_freeze', 'glare'] }, { key: 'conf', label: '灵敏度', type: 'slider', value: 0.5, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  } else if (cmd === 'night_vision') {
    pipelineName.value = '夜间安防增强'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('resize', '暗光增强', '🌙', 510, 100, ['frame_in'], ['frame_out'], { props: [{ key: 'width', label: '宽度', type: 'number', value: 1920, min: 64, max: 3840 }, { key: 'height', label: '高度', type: 'number', value: 1080, min: 64, max: 2160 }, { key: 'enhance', label: '暗光增强', type: 'switch', value: true }] }))
    nodes.push(makeNode('yolo', '人形检测', '🎯', 740, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'yolov8n', options: ['yolov8n', 'yolov8s'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.4, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 970, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 970, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(2, 'frame_out', 3, 'frame_in'); connect(2, 'frame_out', 4, 'frame_in')
    connect(3, 'dets_out', 4, 'dets_in'); connect(3, 'dets_out', 5, 'alarm_in')
  } else if (cmd === 'animal') {
    pipelineName.value = '动物入侵检测'
    nodes.push(makeNode('gb28181', 'GB28181通道', '📹', 50, 100, [], ['video_out'], { props: [{ key: 'channelId', label: '通道ID', type: 'channel-picker', value: '' }] }))
    nodes.push(makeNode('decode', '解码', '🔓', 280, 100, ['video_in'], ['frame_out']))
    nodes.push(makeNode('yolo', '动物检测', '🐈', 510, 100, ['frame_in'], ['dets_out'], { hasROI: true, hasSchedule: true, hasActions: true, actionAlarm: true, props: [{ key: 'model', label: '模型', type: 'select', value: 'animal_filter_v1', options: ['animal_filter_v1'] }, { key: 'conf', label: '置信度', type: 'slider', value: 0.4, min: 0, max: 1, step: 0.05 }] }))
    nodes.push(makeNode('osd', 'OSD叠加', '🏷️', 740, 80, ['frame_in', 'dets_in'], ['frame_out']))
    nodes.push(makeNode('mqtt_alarm', 'MQTT告警', '📡', 740, 200, ['alarm_in'], []))
    connect(0, 'video_out', 1, 'video_in'); connect(1, 'frame_out', 2, 'frame_in')
    connect(1, 'frame_out', 3, 'frame_in'); connect(2, 'dets_out', 3, 'dets_in')
    connect(2, 'dets_out', 4, 'alarm_in')
  }
  dirty.value = true
  ElMessage.success(`模板 "${pipelineName.value}" 已加载，请配置通道ID和参数`)
}
</script>

<style scoped>
.pipeline-editor { height: calc(100vh - 80px); display: flex; flex-direction: column; background: #f5f7fa; box-sizing: border-box; }
.pe-header { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e4e7ed; background: #ffffff; }
.pe-title { display: flex; align-items: center; gap: 8px; color: #303133; }
.pe-body { flex: 1; display: flex; overflow: hidden; }

/* 组件面板 */
.pe-palette { width: 200px; background: #ffffff; border: 1px solid #e4e7ed; border-top: none; overflow-y: auto; padding: 12px; }
.palette-group { margin-bottom: 12px; }
.palette-cat { font-size: 12px; color: #606266; font-weight: 600; padding: 4px 8px; }
.palette-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; cursor: grab; color: #303133; font-size: 13px; margin-bottom: 2px; background: #f5f7fa; }
.palette-item:hover { background: #ecf5ff; }

/* 画布 */
.pe-canvas { flex: 1; position: relative; overflow: hidden; cursor: default; background: #ffffff; border: 1px solid #e4e7ed; border-top: none; }
.pe-canvas-inner { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }

/* [P1-8] 小地图 */
.pe-minimap { position: absolute; right: 12px; bottom: 12px; width: 160px; height: 100px; background: rgba(255,255,255,0.95); border: 1px solid #dcdfe6; border-radius: 6px; z-index: 10; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.minimap-title { font-size: 10px; color: #909399; padding: 2px 6px; border-bottom: 1px solid #f0f0f0; }
.minimap-svg { display: block; }
.pe-lines { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 0; overflow: visible; }
.conn-group { pointer-events: all; cursor: pointer; }
.conn-line { transition: stroke 0.15s; }
.conn-group:hover .conn-line { stroke: #DB4437 !important; }
.conn-hit { pointer-events: stroke; }

/* 节点 */
.pe-node { position: absolute; width: 180px; background: #ffffff; border: 2px solid #dcdfe6; border-radius: 8px; cursor: move; user-select: none; z-index: 1; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.pe-node:hover { border-color: #1A73E8; }
.pe-node.selected { border-color: #1A73E8; box-shadow: 0 0 12px rgba(26,115,232,0.3); }
.node-header { padding: 6px 10px; background: #f5f7fa; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 6px; font-size: 13px; color: #303133; }
.node-icon { font-size: 14px; }
.node-title { flex: 1; font-weight: 600; }
.node-del { color: #909399 !important; padding: 0 !important; }
.node-del:hover { color: #DB4437 !important; }

.node-ports { padding: 6px 0; }
.ports-in { padding-left: 8px; }
.ports-out { text-align: right; padding-right: 8px; }
.port { font-size: 11px; color: #606266; padding: 5px 6px; cursor: crosshair; display: flex; align-items: center; gap: 5px; transition: color 0.15s, background-color 0.15s; border-radius: 4px; margin: 1px 2px; min-height: 18px; }
.out-port { justify-content: flex-end; }
.port:hover { color: #1A73E8; background: rgba(26,115,232,0.08); }
.port-drawing-source { color: #F9AB00 !important; background: rgba(249,171,0,0.12) !important; box-shadow: inset 0 0 0 1px rgba(249,171,0,0.5); }
.port-drawing-target { color: #1A73E8 !important; background: rgba(26,115,232,0.12) !important; box-shadow: inset 0 0 0 1px rgba(26,115,232,0.6); }
.port-dot { width: 12px; height: 12px; border-radius: 50%; background: #1A73E8; flex-shrink: 0; transition: transform 0.15s, box-shadow 0.15s; box-shadow: 0 0 0 0 rgba(26,115,232,0); }
/* [UX] 扩大点击热区，不影响布局 */
.port::before { content: ''; position: absolute; left: -6px; right: -6px; top: -2px; bottom: -2px; }
.ports-in .port, .ports-out .port { position: relative; }
.port:hover .port-dot { transform: scale(1.4); box-shadow: 0 0 8px rgba(26,115,232,0.7); }
.in-port .port-dot { background: #0F9D58; }
.port-drawing-source .port-dot { background: #F9AB00; box-shadow: 0 0 10px rgba(249,171,0,0.7); transform: scale(1.3); }
.port-drawing-target .port-dot { transform: scale(1.5); box-shadow: 0 0 12px rgba(26,115,232,0.8); }
.in-port:hover .port-dot { box-shadow: 0 0 6px rgba(15,157,88,0.7); }

/* [UX] 连线中的顶部提示条 */
.pe-draw-hint { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 5; background: #1A73E8; color: #fff; padding: 6px 14px; border-radius: 18px; font-size: 12px; font-weight: 500; box-shadow: 0 4px 12px rgba(26,115,232,0.4); pointer-events: none; animation: peHintPulse 1.2s ease-in-out infinite; }
.pe-draw-hint .pe-hint-cancel { margin-left: 10px; padding: 0 6px; cursor: pointer; pointer-events: auto; opacity: 0.85; font-size: 14px; line-height: 1; }
.pe-draw-hint .pe-hint-cancel:hover { opacity: 1; }
@keyframes peHintPulse { 0%, 100% { box-shadow: 0 4px 12px rgba(26,115,232,0.4); } 50% { box-shadow: 0 4px 18px rgba(26,115,232,0.7); } }

/* 属性面板 */
.pe-props { width: 280px; background: #ffffff; border: 1px solid #e4e7ed; border-top: none; overflow-y: auto; padding: 16px; }
.pe-props h4 { color: #303133; margin: 0 0 12px; font-size: 14px; }
.props-header { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px dashed #ebeef5; }
.props-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; }
.props-meta .el-tag { font-size: 11px; }
.props-empty { text-align: center; color: #909399; padding: 40px 20px; }

/* 浅色表单 */
:deep(.el-form-item__label) { color: #606266; font-size: 12px; }
:deep(.el-input__inner) { background: #ffffff; border-color: #dcdfe6; color: #303133; }
:deep(.el-textarea__inner) { background: #ffffff; border-color: #dcdfe6; color: #303133; }

/* v7.0: 运行时监控面板 */
.pe-monitor { height: 220px; background: #ffffff; border: 1px solid #e4e7ed; border-top: 2px solid #1A73E8; overflow-y: auto; }
.monitor-header { padding: 8px 16px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #e4e7ed; }
.monitor-title { font-size: 13px; font-weight: 600; color: #303133; }
.monitor-dashboard { display: flex; gap: 12px; padding: 10px 16px; }
.metric-card { flex: 1; background: #f5f7fa; border: 1px solid #e4e7ed; padding: 10px 12px; text-align: center; }
.metric-label { font-size: 11px; color: #606266; margin-bottom: 4px; }
.metric-value { font-size: 18px; font-weight: 700; color: #1A73E8; }
.monitor-nodes { padding: 0 16px 10px; }
:deep(.monitor-table .el-table__row) { background: #ffffff; }
:deep(.monitor-table .el-table__row--striped) { background: #f5f7fa; }
:deep(.monitor-table td) { color: #303133; border-color: #e4e7ed; }

/* 场景模板分类标题 */
:deep(.tpl-cat) { font-size: 11px; font-weight: 700; color: #909399; padding: 4px 16px; cursor: default; text-transform: uppercase; letter-spacing: 0.5px; }
</style>
