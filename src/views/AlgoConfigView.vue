<template>
  <div class="algo-config-view">
    <div class="page-header">
      <h2 class="page-title">{{ $t('algoConfig', '算法配置') }}</h2>
      <span class="page-desc">{{ $t('algoConfigDesc', '为每个通道配置推理算法、参数及检测区域') }}</span>
    </div>

    <div class="layout-body">
      <!-- Left: Channel List -->
      <el-card class="panel-left" shadow="never">
        <template #header>
          <div class="panel-title">
            <span>{{ $t('channelList', '通道列表') }}</span>
            <el-button size="small" text @click="loadData" :loading="loading">
              <el-icon><Refresh /></el-icon>
            </el-button>
          </div>
        </template>
        <el-table
          :data="channels"
          highlight-current-row
          size="small"
          @current-change="onChannelSelect"
          :row-class-name="rowClassName"
          v-loading="loading"
        >
          <el-table-column prop="channelId" :label="$t('channelNo', '通道号')" width="80" />
          <el-table-column prop="name" :label="$t('channelName', '名称')" show-overflow-tooltip />
          <el-table-column :label="$t('algorithm', '算法')" width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <el-tag v-if="row.algoPlugin" size="small" type="primary">{{ row.algoPlugin }}</el-tag>
              <span v-else class="text-muted">{{ $t('notConfigured', '未配置') }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="$t('status', '状态')" width="68" align="center">
            <template #default="{ row }">
              <el-tag :type="row.inferenceEnabled ? 'success' : 'info'" size="small" effect="dark">
                {{ row.inferenceEnabled ? 'ON' : 'OFF' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- Middle: 已配置算法列表 (独立栏, 三栏布局: 通道列表 | 算法列表 | 编辑区;
          结构与左侧通道列表一致 — 表格化/可滚动/单行高亮; 数据源调度 algo_plugin 拆分) -->
      <el-card shadow="never" class="panel-mid algo-card">
        <template #header>
          <div class="config-header">
            <span>已配置算法</span>
            <span v-if="selected" class="algo-card-sub">{{ selected.name }}</span>
            <el-switch v-if="selected" v-model="form.enabled" :active-text="$t('enable', '启用')" :inactive-text="$t('disable', '停用')" />
          </div>
        </template>
        <el-table v-if="selected" :data="algoRows" size="small" class="algo-table" height="100%"
          highlight-current-row :row-class-name="algoRowClassName"
          @row-click="selectAlgoRow"
          empty-text="该通道尚未配置算法 — 在右侧编辑区选择算法后点击「保存配置」">
          <el-table-column label="算法" min-width="110">
            <template #default="{ row }">
              <el-tag size="small" type="primary">{{ row.algoName }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="模式" width="62" align="center">
            <template #default="{ row }">{{ row.mode === 'streaming' ? '连续' : '抓拍' }}</template>
          </el-table-column>
          <el-table-column label="间隔" width="62" align="center" prop="interval" />
          <el-table-column label="状态" width="56" align="center">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="dark">
                {{ row.enabled ? 'ON' : 'OFF' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="事件规则" width="118" align="center">
            <template #default="{ row }">
              <el-badge :value="row.ruleCount" :hidden="!row.ruleCount" type="info">
                <el-button size="small" type="primary" link title="添加事件规则" @click.stop="openAddRuleDialog(row)">
                  <el-icon><Plus /></el-icon>
                </el-button>
              </el-badge>
              <el-button size="small" type="danger" link :disabled="!row.ruleCount" title="删除事件规则" @click.stop="removeAlgoRules(row)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="52" align="center">
            <template #default="{ row }">
              <el-button size="small" type="primary" link title="编辑参数" @click.stop="selectAlgoRow(row)">
                <el-icon><Edit /></el-icon>
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else :description="$t('selectChannelHint', '请先选择通道查看已配置算法')" :image-size="80" />
      </el-card>

      <!-- Right: 编辑区 (算法参数编辑 + ROI 绘制区, 与算法列表分栏) -->
      <div class="panel-right">
        <el-card v-if="!selected" shadow="never" class="empty-state">
          <el-empty :description="$t('selectChannelHint', '请从左侧选择一个通道进行配置')" />
        </el-card>

        <template v-else>
          <!-- ② 算法参数编辑 (仅当前选中算法; 字段序: 算法→模式→间隔→置信度→NMS;
              校验: 置信度/NMS 0~1, 间隔 ≥100ms, 未通过字段下红提示且不触发保存) -->
          <el-card ref="editCardRef" shadow="never" class="edit-card">
            <template #header>
              <div class="config-header">
                <span>算法参数编辑</span>
                <el-tag v-if="editForm.algoId" size="small" type="primary">{{ editForm.algoName }}</el-tag>
              </div>
            </template>
            <el-form :model="editForm" label-width="92px" size="default" class="edit-form" @submit.prevent>
              <el-form-item label="算法">
                <template v-if="editForm.algoId">
                  <el-tag type="primary" size="small">{{ editForm.algoName }}</el-tag>
                  <span class="algo-id-text">{{ editForm.algoId }}</span>
                </template>
                <el-select v-else v-model="form.algorithm" :placeholder="$t('selectAlgo', '选择算法 (新配置)')" style="width:100%">
                  <el-option v-for="a in algorithmOptions" :key="a.value" :label="a.label" :value="a.value" />
                </el-select>
              </el-form-item>
              <el-row :gutter="16">
                <el-col :span="9">
                  <el-form-item :label="$t('inferenceMode', '推理模式')">
                    <el-radio-group v-model="editForm.mode" size="small">
                      <el-radio value="snapshot">抓拍</el-radio>
                      <el-radio value="streaming">连续</el-radio>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
                <el-col :span="9">
                  <el-form-item :label="$t('inferenceInterval', '检测间隔')" :error="formErrors.interval">
                    <el-input-number v-model="editForm.interval" :min="100" :max="10000" :step="100" size="small"
                      controls-position="right" style="width: 100%" @change="validateEditField('interval')" />
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="16">
                <el-col :span="12">
                  <!-- [2026-09-01] 滑块+数字输入并排 (替代 show-input): 行高 56→38, 单屏预算关键项 -->
                  <el-form-item :label="$t('confidenceThreshold', '置信度阈值')" :error="formErrors.confidence">
                    <div class="slider-row">
                      <el-slider v-model="editForm.confidence" :min="0" :max="1" :step="0.05" class="slider-main"
                        @input="validateEditField('confidence')" />
                      <el-input-number v-model="editForm.confidence" :min="0" :max="1" :step="0.05" size="small"
                        controls-position="right" class="slider-num" @change="validateEditField('confidence')" />
                    </div>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item :label="$t('nmsThreshold', 'NMS 阈值')" :error="formErrors.nms">
                    <div class="slider-row">
                      <el-slider v-model="editForm.nms" :min="0" :max="1" :step="0.05" class="slider-main"
                        @input="validateEditField('nms')" />
                      <el-input-number v-model="editForm.nms" :min="0" :max="1" :step="0.05" size="small"
                        controls-position="right" class="slider-num" @change="validateEditField('nms')" />
                    </div>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
            <div class="edit-actions">
              <el-button @click="resetEditForm">{{ $t('reset', '重置') }}</el-button>
              <el-button type="primary" :loading="saving" :disabled="!editForm.algoId && !form.algorithm" @click="saveConfig">{{ $t('save', '保存配置') }}</el-button>
            </div>
          </el-card>

          <el-card shadow="never" class="roi-card">
            <template #header>
              <div class="config-header">
                <span>ROI {{ $t('detectionZone', '检测区域') }} / {{ $t('tripwire', '绊线') }} / {{ $t('passageway', '通道') }} / {{ $t('countingZone', '计数区') }}</span>
                <el-button type="primary" text size="small" @click="loadRegions">{{ $t('refresh', '刷新') }}</el-button>
              </div>
            </template>
            <el-tabs v-model="roiTab">
              <el-tab-pane :label="$t('detectionZone', '检测区域')" name="region">
                <RoiPolygonEditor
                  v-if="selected"
                  :model-value="regions"
                  :background-image-url="roiBackgroundUrl"
                  :canvas-width="720" :canvas-height="405"
                  :types="['detection_zone', 'exclusion_zone']"
                  @update:model-value="onRegionsChange"
                />
              </el-tab-pane>
              <el-tab-pane :label="$t('tripwire', '绊线')" name="tripwire">
                <TripwireEditor
                  v-if="selected"
                  :image-url="roiBackgroundUrl"
                  :saved="tripwires.filter(t => !(t.channel_id_str || '').endsWith('_ch0'))"
                  :editing="editingTripwire ? { point_a: editingTripwire.point_a, point_b: editingTripwire.point_b, direction: editingTripwire.direction, name: editingTripwire.name } : null"
                  @confirm="onTripwireConfirm"
                />
                <div v-if="editingTripwire" class="pw-mig-hint" style="margin-top: 4px">
                  正在编辑「{{ editingTripwire.name }}」— 画布已载入旧线，确认后替换保存；
                  <el-button text size="small" @click="editingTripwire = null">取消编辑</el-button>
                </div>
                <div v-if="tripwires.length" class="tripwire-list">
                  <div v-for="tw in tripwires" :key="tw.id" class="tripwire-list__item">
                    <span>{{ tw.name }}{{ (tw.channel_id_str || '').endsWith('_ch0') ? ' (镜像)' : '' }} ({{ tw.direction }})</span>
                    <span v-if="!(tw.channel_id_str || '').endsWith('_ch0')">
                      <el-button text size="small" type="primary" @click="editingTripwire = tw">
                        {{ $t('edit', '编辑') }}
                      </el-button>
                      <el-button text size="small" type="danger" @click="deleteTripwire(tw.id)">
                        {{ $t('delete', '删除') }}
                      </el-button>
                    </span>
                  </div>
                </div>
              </el-tab-pane>
              <el-tab-pane :label="$t('passageway', '通道 (尾随 v5)')" name="passageway">
                <div class="pw-toolbar-row">
                  <el-button size="small" @click="migrateTripwires">老绊线迁移</el-button>
                  <span class="pw-mig-hint">绊线→矩形通道 (幂等, detector 首帧自动执行)</span>
                </div>
                <PassagewayEditor
                  v-if="selected"
                  :image-url="roiBackgroundUrl"
                  @confirm="onPassagewayConfirm"
                />
                <div v-if="passageways.length" class="tripwire-list">
                  <div v-for="pw in passageways" :key="pw.id" class="tripwire-list__item">
                    <span>
                      {{ pw.name }}
                      (sens={{ pw.sensitivity }}, {{ pw.direction_in ? '进入' : '离开' }}
                      {{ pw.suppress_mode }}
                      <template v-if="pw.migrated_from_tripwire">, 迁移自绊线#{{ pw.migrated_from_tripwire }}</template>)
                    </span>
                    <el-button text size="small" type="danger" @click="deletePassageway(pw.id)">
                      {{ $t('delete', '删除') }}
                    </el-button>
                  </div>
                </div>
              </el-tab-pane>
              <el-tab-pane :label="$t('countingZone', '计数区')" name="counting">
                <!-- [FIX 2026-08-28] 计数区实装: 矩形拖拽绘制 + target_class 配置
                     (后端 CountingZoneDef: polygon + target_class; 通道维度按 int32
                      channel_id, GB 场景统一 0, 列表为全部通道计数区) -->
                <div class="counting-config-row">
                  <span class="counting-label">目标类别</span>
                  <el-select v-model="countingTargetClass" size="small" style="width: 140px">
                    <el-option v-for="c in countingTargetOptions" :key="c.value" :label="c.label" :value="c.value" />
                  </el-select>
                  <span class="pw-mig-hint">在画面上拖拽对角两点绘制矩形，松手自动创建</span>
                </div>
                <RoiPolygonEditor
                  v-if="selected"
                  :model-value="countingZoneRois"
                  :background-image-url="roiBackgroundUrl"
                  :canvas-width="720" :canvas-height="405"
                  :types="['counting_zone']"
                  @update:model-value="onCountingZonesChange"
                />
                <div v-if="countingZoneList.length" class="tripwire-list">
                  <div v-for="cz in countingZoneList" :key="cz.id" class="tripwire-list__item">
                    <span>{{ cz.name }} ({{ cz.target_class }})</span>
                    <el-button text size="small" type="danger" @click="deleteCountingZoneById(cz.id)">
                      {{ $t('delete', '删除') }}
                    </el-button>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </el-card>
        </template>
      </div>
    </div>

    <!-- ④ 单设备算法事件规则: 添加 dialog (事件类型 SSOT /event-types/canonical 多选,
        逐条 POST /linkage/rules, payload 含 channel_id/device_id/algo_id/event_type) -->
    <el-dialog v-model="ruleDialogVisible" title="添加事件规则" width="560px" class="rule-dialog">
      <div class="rule-dialog-target">
        算法 <el-tag size="small" type="primary">{{ ruleTargetAlgoName }}</el-tag>
        <span class="rule-dialog-sub">通道: {{ selected?.name ?? '-' }} (device_id: {{ selected?.deviceId || selected?.parentDeviceId || '-' }})</span>
      </div>
      <el-input v-model="ruleFilter" placeholder="搜索事件类型 (中文名 / key)" clearable size="small" class="rule-filter" />
      <div class="rule-check-wrap" v-loading="ruleTypesLoading">
        <el-checkbox-group v-model="ruleSelected">
          <el-checkbox v-for="t in filteredEventTypes" :key="t.key" :value="t.key" :label="t.key" class="rule-check-item">
            {{ t.name_zh }}
            <span class="rule-check-key">{{ t.key }}</span>
          </el-checkbox>
        </el-checkbox-group>
        <el-empty v-if="!ruleTypesLoading && filteredEventTypes.length === 0" description="无匹配事件类型" :image-size="60" />
      </div>
      <template #footer>
        <span class="rule-dialog-count">已勾选 {{ ruleSelected.length }} 项</span>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="ruleSelected.length === 0" :loading="ruleSaving" @click="confirmAddRules">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * AlgoConfigView.vue — 算法配置页面
 *
 * 对接后端 API 实现：
 * 1. 从 GET /channels 加载通道列表
 * 2. 从 GET /inference/channels 加载已绑定算法的推理状态
 * 3. 保存时调用 POST /inference/schedule/start 或 /stop 控制后端推理调度
 */
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, Delete, Edit } from '@element-plus/icons-vue'
import { channelApi } from '@/api/channel'
import { startSchedule, stopSchedule, getInferenceChannels } from '@/api/inference'
import type { ScheduledChannel } from '@/api/inference'
import algorithmsApi from '@/api/algorithms'
import type { AlgorithmInfo } from '@/api/algorithms'
import eventTypesApi, { type CanonicalEventType } from '@/api/eventTypes'
import { linkageApi, type LinkageRule } from '@/api/linkage'
import { regionApi } from '@/api/region'
import type { TripwireDef, PassagewayDef, SuppressMode, CountingZoneDef } from '@/types/region'
import RoiPolygonEditor from '@/components/RoiPolygonEditor.vue'
import TripwireEditor from '@/components/TripwireEditor.vue'
import PassagewayEditor from '@/components/PassagewayEditor.vue'

/** 通道项（合并通道信息 + 推理调度状态） */
interface ChannelItem {
  channelId: string
  name: string
  deviceId: string
  parentDeviceId: string
  online: boolean
  algoPlugin: string
  inferenceEnabled: boolean
  confidence: number
  nmsThreshold: number
  interval: number
  inferenceMode: 'snapshot' | 'streaming'
  totalInferences: number
  totalDetections: number
  running: boolean
}

const channels = ref<ChannelItem[]>([])
const algorithmOptions = ref<{ label: string; value: string }[]>([])
const scheduledMap = ref<Map<string, ScheduledChannel>>(new Map())
const selected = ref<ChannelItem | null>(null)
const loading = ref(false)
const saving = ref(false)
const editCardRef = ref()
const currentAlgoId = ref('')

// [2026-09-01] 编辑区模型: 仅当前选中算法; 参数为通道级调度共享
// (后端 ScheduledChannel 无独立 per-algo 参数; 保存时 algo_plugin 保留原完整串不破坏多算法配置)
const editForm = reactive({
  algoId: '',
  algoName: '',
  mode: 'snapshot' as 'snapshot' | 'streaming',
  interval: 1000,
  confidence: 0.5,
  nms: 0.45,
})
const formErrors = reactive({ interval: '', confidence: '', nms: '' })

function validateEditField(field: 'interval' | 'confidence' | 'nms') {
  if (field === 'interval') {
    formErrors.interval = !(editForm.interval >= 100 && editForm.interval <= 100000)
      ? '检测间隔必须 ≥ 100ms' : ''
  } else if (field === 'confidence') {
    const v = Number(editForm.confidence)
    formErrors.confidence = !(v >= 0 && v <= 1) ? '置信度必须在 0 ~ 1 之间' : ''
  } else {
    const v = Number(editForm.nms)
    formErrors.nms = !(v >= 0 && v <= 1) ? 'NMS 阈值必须在 0 ~ 1 之间' : ''
  }
}
function validateAll(): boolean {
  validateEditField('interval'); validateEditField('confidence'); validateEditField('nms')
  return !formErrors.interval && !formErrors.confidence && !formErrors.nms
}

// ① 已配置算法行: algo_plugin 逗号分隔串拆分逐行 + 事件规则计数
const algoRows = computed(() => {
  if (!selected.value) return []
  const sc = scheduledMap.value.get(selected.value.channelId)
  if (!sc) return []
  return String(sc.algo_plugin || '').split(',').map((s) => s.trim()).filter(Boolean).map((id) => ({
    algoId: id,
    algoName: algorithmOptions.value.find((a) => a.value === id)?.label || id,
    mode: (sc as any).inference_mode === 'streaming' ? 'streaming' : 'snapshot',
    interval: sc.interval_ms,
    enabled: sc.enabled,
    running: sc.running,
    ruleCount: algoRuleCounts.value.get(id) ?? 0,
  }))
})

function algoRowClassName({ row }: { row: { algoId: string } }) {
  return currentAlgoId.value === row.algoId ? 'current-algo-row' : ''
}

/** 点击列表行/编辑 → 高亮 + 填充编辑表单 + 滚动定位到编辑卡 */
function selectAlgoRow(row: { algoId: string; algoName: string; mode: 'snapshot' | 'streaming'; interval: number }) {
  currentAlgoId.value = row.algoId
  editForm.algoId = row.algoId
  editForm.algoName = row.algoName
  editForm.mode = row.mode
  editForm.interval = row.interval
  formErrors.interval = ''; formErrors.confidence = ''; formErrors.nms = ''
  // [FIX 2026-09-01] 切换算法行 → 重载该算法的检测区域 (按 algo_id 隔离展示)
  loadRegions()
  nextTick(() => editCardRef.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }))
}

function resetEditForm() {
  if (currentAlgoId.value) {
    const row = algoRows.value.find((r) => r.algoId === currentAlgoId.value)
    if (row) { selectAlgoRow(row); ElMessage.info('已重置为当前配置'); return }
  }
  formErrors.interval = ''; formErrors.confidence = ''; formErrors.nms = ''
  ElMessage.info('已重置')
}

// ④ 单设备算法事件规则: badge 计数 + 添加 dialog + 删除二次确认
const algoRuleCounts = ref<Map<string, number>>(new Map())
const channelRules = ref<LinkageRule[]>([])
const canonicalTypes = ref<CanonicalEventType[]>([])
const ruleTypesLoading = ref(false)
const ruleDialogVisible = ref(false)
const ruleTargetAlgo = ref('')
const ruleFilter = ref('')
const ruleSelected = ref<string[]>([])
const ruleSaving = ref(false)

const ruleTargetAlgoName = computed(() =>
  algoRows.value.find((r) => r.algoId === ruleTargetAlgo.value)?.algoName || ruleTargetAlgo.value)
const filteredEventTypes = computed(() => {
  const kw = ruleFilter.value.trim().toLowerCase()
  if (!kw) return canonicalTypes.value
  return canonicalTypes.value.filter((t) =>
    t.name_zh.toLowerCase().includes(kw) || t.key.toLowerCase().includes(kw))
})

/** 拉取当前通道全部联动规则 → 按算法计数 (badge) 并缓存规则列表供删除用 */
async function loadRuleCounts() {
  if (!selected.value) return
  try {
    const res = await linkageApi.getAllRules()
    const items: LinkageRule[] = res.data?.data?.items ?? (res.data as any)?.items ?? []
    channelRules.value = items
    const chIdStr = selected.value.channelId
    const chNum = Number(chIdStr)
    const chId = Number.isFinite(chNum) && Number.isSafeInteger(chNum) ? chNum : 0
    const sc = scheduledMap.value.get(chIdStr)
    const algoIds = String(sc?.algo_plugin || '').split(',').map((s) => s.trim()).filter(Boolean)
    const counts = new Map<string, number>()
    for (const r of items) {
      const src: any = (r as any).source_cond ?? {}
      const chList: number[] = src.channel_ids ?? []
      // GB 通道 int32 降 0 与其他通道规则可能同 0 → 算法 id 是主匹配键, 通道命中宽松处理
      const chHit = chList.length === 0 || chList.includes(chId)
      if (!chHit) continue
      for (const a of (src.algorithm_ids ?? []) as string[]) {
        if (algoIds.includes(a)) counts.set(a, (counts.get(a) ?? 0) + 1)
      }
    }
    algoRuleCounts.value = counts
  } catch (e: any) {
    console.warn('[AlgoConfigView] 规则计数加载失败', e)
  }
}

async function openAddRuleDialog(row: { algoId: string }) {
  ruleTargetAlgo.value = row.algoId
  ruleSelected.value = []
  ruleFilter.value = ''
  ruleDialogVisible.value = true
  if (canonicalTypes.value.length === 0) {
    ruleTypesLoading.value = true
    try {
      const r = await eventTypesApi.list()
      canonicalTypes.value = r.data?.data?.types ?? (r.data as any)?.types ?? []
    } catch (e: any) {
      ElMessage.error(`事件类型加载失败: ${e?.message ?? e}`)
    } finally {
      ruleTypesLoading.value = false
    }
  }
}

async function confirmAddRules() {
  if (!selected.value || ruleSelected.value.length === 0) return
  ruleSaving.value = true
  try {
    const chIdStr = selected.value.channelId
    const chNum = Number(chIdStr)
    const chId = Number.isFinite(chNum) && Number.isSafeInteger(chNum) ? chNum : 0
    const deviceId = selected.value.deviceId || selected.value.parentDeviceId || ''
    let ok = 0
    for (const key of ruleSelected.value) {
      const typeName = canonicalTypes.value.find((t) => t.key === key)?.name_zh || key
      try {
        await linkageApi.createRule({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: `${typeName}_${chIdStr.slice(-4)}`,
          description: `算法配置页单设备事件规则: 通道 ${selected.value.name} × 算法 ${ruleTargetAlgo.value}`,
          enabled: true,
          priority: 50,
          cooldown_ms: 5000,
          source_cond: {
            channel_ids: [chId],
            device_ids: deviceId ? [deviceId] : [],
            event_types: [key],
            algorithm_ids: [ruleTargetAlgo.value],
            min_severity: 0,
            min_confidence: 0,
          },
          actions: [{
            // 后端 LinkageEngine 要求 actions 非空 (empty → 业务码 1001 拒绝):
            // 默认挂 CLIENT_SHOW_LIVE 弹出实时视频 (告警弹窗标准动作)
            type: 100, target: 0, name: '弹出实时视频', enabled: true,
            channel_id: chIdStr, device_id: deviceId, delay_ms: 0,
          }],
          tags: ['algo-config'],
          created_by: 'admin',
        } as any)
        ok++
      } catch (e: any) {
        console.warn('[AlgoConfigView] 创建事件规则失败', key, e)
      }
    }
    if (ok > 0) ElMessage.success(`已添加 ${ok} 条事件规则 (设备 ${deviceId || '-'})`)
    if (ok < ruleSelected.value.length) ElMessage.warning(`${ruleSelected.value.length - ok} 条添加失败, 详见控制台`)
    ruleDialogVisible.value = false
    await loadRuleCounts()
  } finally {
    ruleSaving.value = false
  }
}

async function removeAlgoRules(row: { algoId: string; algoName: string; ruleCount: number }) {
  if (!row.ruleCount) return
  const ids = channelRules.value
    .filter((r) => ((r as any).source_cond?.algorithm_ids ?? []).includes(row.algoId))
    .map((r) => r.id)
  if (ids.length === 0) { await loadRuleCounts(); return }
  try {
    await ElMessageBox.confirm(
      `将删除算法「${row.algoName}」绑定的 ${ids.length} 条事件规则, 删除后不可恢复。`,
      '删除事件规则',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch { return } // 用户取消
  let ok = 0
  for (const id of ids) {
    try { await linkageApi.deleteRule(id); ok++ } catch (e) { console.warn('[AlgoConfigView] 删除规则失败', id, e) }
  }
  ElMessage.success(ok > 0 ? `已删除 ${ok} 条事件规则` : '删除失败, 详见控制台')
  await loadRuleCounts()
}

const form = reactive({
  enabled: false,
  algorithm: '',
  confidence: 0.5,
  nmsThreshold: 0.45,
  interval: 3000,
  inferenceMode: 'snapshot' as 'snapshot' | 'streaming',
})

// 🆕 v7.1 (28 算法补齐 P0-A5): 区域/绊线/计数区持久化
// 🆕 v5.0 (尾随区域版): + 通道 (passageway)
const roiTab = ref<'region' | 'tripwire' | 'passageway' | 'counting'>('region')
// [FIX 2026-09-01] 存编辑器 RoiData 映射 (含 roi_id/backend_id), 非后端 RegionDef 原始结构
const regions = ref<any[]>([])
// [FIX 2026-09-01] 载入快照: 编辑器 emit 的是全量列表, 需与最近一次后端载入
// 结果 diff (新增 → create / 被移除 → delete)
const lastLoadedRegions = ref<any[]>([])
const tripwires = ref<TripwireDef[]>([])
const passageways = ref<PassagewayDef[]>([])

// [FIX 2026-08-28] 计数区实装: 编辑器状态 (RoiData[]) + 后端列表
const countingZoneRois = ref<any[]>([])
const countingZoneList = ref<CountingZoneDef[]>([])
const countingTargetClass = ref('person')
const countingTargetOptions = [
  { label: '行人', value: 'person' },
  { label: '汽车', value: 'car' },
  { label: '公车', value: 'bus' },
  { label: '卡车', value: 'truck' },
  { label: '摩托', value: 'motorbike' },
  { label: '自行车', value: 'bicycle' },
]

async function loadRegions() {
  if (!selected.value) return
  // GB28181 完整编码可能是超大数, int32 查询降级为 0 (passageway 走 string 主路径)
  const chIdStr = selected.value.channelId
  const chIdNum = Number(chIdStr)
  const chId = Number.isFinite(chIdNum) && Number.isSafeInteger(chIdNum) ? chIdNum : 0
  // 插件侧 (AlgoConfig.channel_id_str) 用不带 _ch0 子码的 GB 完整编码查询
  // (getTripwiresByChannelStr 精确匹配), 前后端统一在此对齐。
  const chStrNoSuffix = stripChSuffix(chIdStr)
  try {
    // [FIX 2026-09-01] 检测区域按当前选中算法隔离 (后端 getRegions(ch, algo_id) 支持,
    // 插件消费即按单 ID 精确查询): 未选中算法时载入空列表, 杜绝 "画一个区域所有算法都有" 观感
    const curAlgo = (editForm.algoId || '').split(',')[0].trim()
    const [rRes, tRes, pRes, czRes] = await Promise.all([
      regionApi.listRegions(curAlgo ? { channel_id: chId, algo_id: curAlgo } : { channel_id: chId }),
      regionApi.listTripwires({ channel_id: chId }),
      // 🆕 v5.0: 通道主路径 channel_id_str (GB28181 完整编码)
      regionApi.listPassageways({
        channel_id_str: chStrNoSuffix,
        algo_id: (editForm.algoId || form.algorithm || 'shield.algo.perimeter.tailgating').split(',')[0].trim()
      }),
      regionApi.listCountingZones({ channel_id: chId })
    ])
    // [FIX 2026-09-01] http 封装不剥业务壳 (拦截器 return response):
    // res.data = {code, data:{...}, message} → 必须取 res.data.data.xxx
    // 载入映射: 后端 RegionDef {id,name,polygon:[[x,y]...],enabled} →
    // 编辑器 RoiData {roi_id,roi_name,roi_type,polygon:number[]一维,is_active} —
    // 之前直接透传二维结构, 编辑器按一维消费 → 已保存区域渲染错乱/不显示,
    // 且 roi_id undefined → 新画区域与存量无法区分。
    const rawRegions: any[] = curAlgo ? (rRes.data?.data?.regions ?? rRes.data?.regions ?? []) : []
    regions.value = rawRegions.map((r: any) => ({
      roi_id: `reg_${r.id}`,
      roi_name: r.name,
      roi_type: 'detection_zone',
      polygon: (r.polygon ?? []).flat(),
      is_active: r.enabled,
      backend_id: r.id,
    }))
    lastLoadedRegions.value = regions.value.map((r: any) => ({ ...r }))
    // GET /algos/tripwires 后端仅支持 int32 channel_id (GB 超大数全部存 0),
    // 会混出其他通道的绊线 → 本地按 channel_id_str 过滤
    tripwires.value = (tRes.data?.data?.tripwires ?? tRes.data?.tripwires ?? []).filter(
      (t) => stripChSuffix(t.channel_id_str || '') === chStrNoSuffix
    )
    passageways.value = (pRes.data?.data?.passageways ?? pRes.data?.passageways ?? []).filter(
      (p) => stripChSuffix(p.channel_id_str || '') === chStrNoSuffix
    )
    // 计数区 (int32 维度, GB 场景全 0 → 列表为全部; 名称带通道尾 4 位便于区分)
    countingZoneList.value = czRes.data?.data?.counting_zones ?? czRes.data?.counting_zones ?? []
    countingZoneRois.value = countingZoneList.value.map((cz) => ({
      roi_id: `cz_${cz.id}`,
      roi_name: cz.name,
      roi_type: 'counting_zone',
      polygon: (cz.polygon ?? []).flat(),
      is_active: cz.enabled,
    }))
  } catch (e: any) {
    ElMessage.warning(`加载区域失败: ${e?.message ?? e}`)
  }
}

/** 计数区: 编辑器确认新矩形后自动创建 (roi_id 不带 cz_ 前缀 = 本次新建) */
async function onCountingZonesChange(updated: any[]) {
  if (!selected.value) return
  const chIdStr = selected.value.channelId
  const chIdNum = Number(chIdStr)
  const chId = Number.isFinite(chIdNum) && Number.isSafeInteger(chIdNum) ? chIdNum : 0
  for (const r of updated) {
    if (String(r.roi_id || '').startsWith('cz_')) continue  // 已有后端记录
    const pts = r.polygon ?? []
    if (pts.length < 4) continue
    const polygon: [number, number][] = []
    for (let i = 0; i + 1 < pts.length; i += 2) polygon.push([pts[i], pts[i + 1]])
    try {
      await regionApi.createCountingZone({
        channel_id: chId,
        algo_id: 'shield.algo.perimeter.counting',
        name: `${countingTargetClass.value}_${chIdStr.slice(-4)}`,
        polygon,
        target_class: countingTargetClass.value,
        enabled: true,
      })
      ElMessage.success('计数区已添加')
    } catch (e: any) {
      ElMessage.error(`计数区创建失败: ${e?.message ?? e}`)
    }
  }
  await loadRegions()
}

async function deleteCountingZoneById(id: number) {
  try {
    await regionApi.deleteCountingZone(id)
    ElMessage.success('已删除')
    await loadRegions()
  } catch (e: any) {
    ElMessage.error(`删除失败: ${e?.message ?? e}`)
  }
}

async function onRegionsChange(updated: any[]) {
  // [FIX 2026-09-01] 保存链路重写 — 之前三重断裂导致画完区域无法保存:
  //   ① 条件 `if (!r.id && r.algo_id)` 恒 false: 编辑器 RoiData 无 id/algo_id
  //      字段 → createRegion 从未被调用 (保存无效根因);
  //   ② polygon 格式: 编辑器产一维 [x1,y1,...], 后端要二维 [[x,y]...],
  //      旧代码 map(p => [p[0],p[1]]) 对 number 取下标 → 全 undefined → 400;
  //   ③ 删除未同步: 编辑器 removeRoi 也走本回调, 旧代码无 delete 分支。
  // 坐标系: 编辑器 canvasToNormalized 输出 1920×1080 尺度, 与计数区同链路
  // (createCountingZone 真机验证一致), 后端 RegionStore 原样存储。
  if (!selected.value) return
  const chIdStr = selected.value.channelId
  const chIdNum = Number(chIdStr)
  const chId = Number.isFinite(chIdNum) && Number.isSafeInteger(chIdNum) ? chIdNum : 0
  // [FIX 2026-09-01] algo_id 必须是当前选中算法的单个 ID:
  // 之前 form.algorithm 是调度完整串 (onChannelSelect 赋值 algo_plugin 整串),
  // 整串写入 region.algo_id → 插件按单 ID 精确匹配永远失败 (区域对所有算法无效)
  const algoId = (editForm.algoId || form.algorithm || 'yolov8n').split(',')[0].trim()
  const prevIds = new Set(lastLoadedRegions.value.map((r) => r.roi_id))
  const nextIds = new Set(updated.map((r) => String(r.roi_id || '')))
  let changed = 0
  // ① 删除: 载入快照中有、新列表没有 → deleteRegion
  for (const prev of lastLoadedRegions.value) {
    if (!nextIds.has(prev.roi_id) && prev.backend_id) {
      try {
        await regionApi.deleteRegion(prev.backend_id)
        changed++
      } catch (e: any) {
        console.warn('[AlgoConfigView] deleteRegion failed', e)
        ElMessage.error(`删除区域失败: ${e?.message ?? e}`)
      }
    }
  }
  // ② 新建: roi_id 非 reg_ 前缀 (编辑器新生成 roi_<ts>) → createRegion
  for (const r of updated) {
    const rid = String(r.roi_id || '')
    if (rid.startsWith('reg_') || prevIds.has(rid)) continue
    const pts = r.polygon ?? []
    if (pts.length < 6) continue // 至少 3 点 (一维 6 个数)
    const polygon: [number, number][] = []
    for (let i = 0; i + 1 < pts.length; i += 2) polygon.push([pts[i], pts[i + 1]])
    try {
      await regionApi.createRegion({
        channel_id: chId,
        algo_id: algoId,
        name: r.roi_name ?? '检测区域',
        region_type: r.roi_type === 'exclusion_zone' ? 'exclusion_zone' : 'detection_zone',
        polygon,
        enabled: r.is_active ?? true,
      })
      changed++
    } catch (e: any) {
      console.warn('[AlgoConfigView] createRegion failed', e)
      ElMessage.error(`保存检测区域失败: ${e?.message ?? e}`)
    }
  }
  if (changed > 0) {
    ElMessage.success(changed === 1 ? '检测区域已保存' : `已保存 ${changed} 处检测区域变更`)
  }
  await loadRegions()
}

/** 剥离 GB28181 通道编码的 _ch0/_ch1 子码后缀 — 与后端插件查询串对齐
 *  (InferenceScheduler 传给插件的 channel_id_str 不带子码后缀) */
function stripChSuffix(chId: string): string {
  return chId.replace(/_ch\d+$/, '')
}

// [FIX 2026-08-28] 替换式编辑: 编辑按钮只载入画布, 确认时先删旧 (主+镜像) 再建新
const editingTripwire = ref<TripwireDef | null>(null)

async function onTripwireConfirm(payload: {
  point_a: [number, number]
  point_b: [number, number]
  direction: 'both' | 'a_to_b' | 'b_to_a'
}) {
  if (!selected.value) return
  const chIdStr = selected.value.channelId
  const chIdNum = Number(chIdStr)
  const chId = Number.isFinite(chIdNum) && Number.isSafeInteger(chIdNum) ? chIdNum : 0
  // [FIX 2026-08-28] algo_id 固定为绊线判定插件 id — 用户所选算法(form.algorithm)
  // 存进去会与 tripwire_detector.getAlgoId() 不一致 → 插件按算法精确查库恒空
  // → 判定退回内置默认线 (绊线加了不弹窗根因之一)。存量错 algo_id 数据由
  // 插件端空 algo 查询兼容 (validateRegionStore [FIX 2026-08-28])。
  const algoId = 'shield.algo.perimeter.tripwire'
  const isReplace = !!editingTripwire.value
  try {
    // 替换式编辑: 先删旧绊线 (主形态 + _ch0 镜像), 确保不残留旧线
    if (editingTripwire.value) {
      const old = editingTripwire.value
      const mirror = tripwires.value.find(
        (t) => (t.channel_id_str || '') === `${old.channel_id_str || ''}_ch0`
      )
      const ids = [old.id, ...(mirror ? [mirror.id] : [])]
      await Promise.all(ids.map((id) => regionApi.deleteTripwire(id).catch(() => null)))
      editingTripwire.value = null
    }
    // [FIX 2026-08-28] 双镜像创建: 主形态 + _ch0 镜像各一条 —
    //   只建主形态时子码流实例永远查不到 (GATE-MISS 半失效)
    await regionApi.createTripwireWithMirror({
      channel_id: chId,
      // [FIX 2026-08-28] 补传 channel_id_str (GB 完整编码, 剥 _ch0 后缀):
      //   后端 upsert 原样落库, 插件 getTripwiresByChannelStr 精确匹配此键;
      //   之前没传 → 落库空串 → 插件永远查不到 (GATE-MISS 静默失效)。
      channel_id_str: stripChSuffix(chIdStr),
      algo_id: algoId,
      name: `${algoId.split('.').pop()}_${Date.now() % 10000}`,
      point_a: payload.point_a,
      point_b: payload.point_b,
      direction: payload.direction,
      enabled: true
    })
    ElMessage.success(isReplace ? '绊线已更新' : '绊线已添加')
    await loadRegions()
  } catch (e: any) {
    ElMessage.error(`保存绊线失败: ${e?.message ?? e}`)
  }
}

async function deleteTripwire(id: number) {
  try {
    await regionApi.deleteTripwire(id)
    ElMessage.success('已删除')
    await loadRegions()
  } catch (e: any) {
    ElMessage.error(`删除失败: ${e?.message ?? e}`)
  }
}

// 🆕 v5.0: 通道 (多边形通行区) 添加/删除/老绊线迁移
async function onPassagewayConfirm(payload: {
  transit_polygon: [number, number][]
  direction_in: boolean
  sensitivity: number
  suppress_mode: SuppressMode
  cooldown_sec: number
}) {
  if (!selected.value) return
  const chIdStr = selected.value.channelId
  const chIdNum = Number(chIdStr)
  // [FIX 2026-08-28] algo_id 固定为尾随判定插件 id — 用户所选算法(form.algorithm)
  // 存进去会与 tailgating_detector.getAlgoId() 不一致 → 插件按算法精确查库恒空
  // → 永远 fallback 预置闸机线 (通道多边形从不生效根因)。存量错 algo_id
  // 数据由插件端空 algo 查询兼容 (refreshPassageways [FIX 2026-08-28])。
  const algoId = 'shield.algo.perimeter.tailgating'
  try {
    await regionApi.createPassageway({
      channel_id: Number.isFinite(chIdNum) && Number.isSafeInteger(chIdNum) ? chIdNum : 0,
      // [FIX 2026-08-28] 剥 _ch0 后缀: 插件 getPassagewaysByChannelStr 精确匹配
      channel_id_str: stripChSuffix(chIdStr),
      algo_id: algoId,
      name: `pw_${Date.now() % 10000}`,
      transit_polygon: payload.transit_polygon,
      direction_in: payload.direction_in,
      sensitivity: payload.sensitivity,
      suppress_mode: payload.suppress_mode,
      cooldown_sec: payload.cooldown_sec,
      enabled: true
    })
    ElMessage.success('通道已添加')
    await loadRegions()
  } catch (e: any) {
    ElMessage.error(`添加通道失败: ${e?.message ?? e}`)
  }
}

async function deletePassageway(id: number) {
  try {
    await regionApi.deletePassageway(id)
    ElMessage.success('已删除')
    await loadRegions()
  } catch (e: any) {
    ElMessage.error(`删除失败: ${e?.message ?? e}`)
  }
}

async function migrateTripwires() {
  // [FIX 2026-08-28] 同 createPassageway: 迁移目标算法固定为尾随插件 id
  const algoId = 'shield.algo.perimeter.tailgating'
  try {
    const res = await regionApi.migratePassageways(algoId)
    const n = res.data?.data?.migrated ?? res.data?.migrated ?? 0
    ElMessage.success(n > 0 ? `已迁移 ${n} 条老绊线为通道` : '无可迁移的老绊线 (或已全部迁移)')
    await loadRegions()
  } catch (e: any) {
    ElMessage.error(`迁移失败: ${e?.message ?? e}`)
  }
}

onMounted(() => {
  loadData()
})

/** 加载通道列表 + 推理状态 + 算法列表 */
async function loadData() {
  loading.value = true
  try {
    const [chRes, inferRes, algoRes] = await Promise.allSettled([
      channelApi.getList({ pageSize: 200 }),
      getInferenceChannels(),
      algorithmsApi.list(),
    ])

    // 解析推理调度通道（建立 channel_id → ScheduledChannel 映射）
    const sm = new Map<string, ScheduledChannel>()
    if (inferRes.status === 'fulfilled') {
      const raw = inferRes.value?.data as any
      const list: ScheduledChannel[] = raw?.data?.channels ?? raw?.channels ?? []
      for (const sc of list) {
        sm.set(sc.channel_id, sc)
      }
    }
    scheduledMap.value = sm

    // 解析通道列表
    const channelList: ChannelItem[] = []
    if (chRes.status === 'fulfilled') {
      const raw = chRes.value?.data as any
      const items: any[] = raw?.data?.items ?? raw?.data ?? raw?.items ?? []
      for (const ch of items) {
        const id = String(ch.channel_id ?? ch.channelId ?? ch.id ?? '')
        const scheduled = sm.get(id)
        channelList.push({
          channelId: id,
          name: ch.channel_name ?? ch.name ?? ch.channelName ?? id,
          deviceId: String(ch.device_id ?? ch.deviceId ?? ''),
          parentDeviceId: String(ch.parent_device_id ?? ch.parentDeviceId ?? ''),
          online: ch.online ?? true,
          algoPlugin: scheduled?.algo_plugin ?? '',
          inferenceEnabled: scheduled?.enabled ?? false,
          confidence: 0.5,
          nmsThreshold: 0.45,
          interval: scheduled?.interval_ms ?? 3000,
          inferenceMode: 'snapshot',
          totalInferences: scheduled?.total_inferences ?? 0,
          totalDetections: scheduled?.total_detections ?? 0,
          running: scheduled?.running ?? false,
        })
      }
    }
    // 如果通道列表为空但推理调度有数据，用调度数据补充
    if (channelList.length === 0 && sm.size > 0) {
      for (const [cid, sc] of sm) {
        channelList.push({
          channelId: cid,
          name: sc.channel_id,
          deviceId: sc.device_id,
          parentDeviceId: '',
          online: true,
          algoPlugin: sc.algo_plugin,
          inferenceEnabled: sc.enabled,
          confidence: 0.5,
          nmsThreshold: 0.45,
          interval: sc.interval_ms,
          inferenceMode: 'snapshot',
          totalInferences: sc.total_inferences,
          totalDetections: sc.total_detections,
          running: sc.running,
        })
      }
    }
    channels.value = channelList

    // 解析算法列表
    if (algoRes.status === 'fulfilled') {
      const raw = algoRes.value?.data as any
      const algos: any[] = raw?.data?.algorithms ?? raw?.data ?? raw?.algorithms ?? []
      algorithmOptions.value = algos
        .filter((a: any) => a.enabled)
        .map((a: any) => ({
          label: a.name_zh || a.name_en || a.name || a.algo_id || a.id,
          value: a.algo_id || a.id,
        }))
    }
    // 如果算法列表为空，提供默认选项
    if (algorithmOptions.value.length === 0) {
      algorithmOptions.value = [
        { label: 'YOLOv8-Nano (快速)', value: 'yolov8n' },
        { label: 'YOLOv8-Small (均衡)', value: 'yolov8s' },
      ]
    }
  } catch (e: any) {
    console.warn('[AlgoConfig] 数据加载失败:', e?.message || e)
  } finally {
    loading.value = false
  }
}

function onChannelSelect(row: ChannelItem | null) {
  selected.value = row
  currentAlgoId.value = ''
  editForm.algoId = ''; editForm.algoName = ''
  if (row) {
    form.enabled = row.inferenceEnabled
    form.algorithm = row.algoPlugin || ''
    form.confidence = row.confidence
    form.nmsThreshold = row.nmsThreshold
    form.interval = row.interval
    // 编辑区默认首行算法 (无调度记录则保持空 → 下拉新配置)
    const first = algoRows.value[0]
    if (first) {
      currentAlgoId.value = first.algoId
      editForm.algoId = first.algoId
      editForm.algoName = first.algoName
      editForm.mode = first.mode
      editForm.interval = first.interval
    }
    // 🆕 v7.1: 加载该通道的 ROI/绊线/计数区
    loadRegions()
    // [FIX 2026-08-28] 加载通道快照作绘制背景 (与联动规则页同链路)
    loadChannelSnapshot(row.channelId)
    // ④ 事件规则计数 (badge)
    loadRuleCounts()
  } else {
    roiBackgroundUrl.value = ''
  }
}

// [FIX 2026-08-28] ROI/绊线/通行区绘制背景: 通道快照 — 与 LinkageRuleView 同链路。
// 后端 /snapshot 返回 JSON {data:{url}} (nginx alias /snapshots/);
// ZLM 偶发 0 字节 JPEG, preload 校验失败重试一次。
const roiBackgroundUrl = ref('')
async function fetchSnapshotUrl(channelId: string): Promise<string> {
  const res = await fetch(`/api/v1/channels/${channelId}/snapshot`, { credentials: 'include' })
  if (!res.ok) return ''
  const j = await res.json().catch(() => null)
  const url = j?.data?.url || j?.url || ''
  return url ? String(url) : ''
}
function preloadSnapshot(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}
async function loadChannelSnapshot(channelId: string) {
  if (!channelId) { roiBackgroundUrl.value = ''; return }
  try {
    let url = await fetchSnapshotUrl(channelId)
    if (url && !(await preloadSnapshot(url))) {
      const retryUrl = await fetchSnapshotUrl(channelId)
      if (retryUrl && (await preloadSnapshot(retryUrl))) url = retryUrl
    }
    roiBackgroundUrl.value = url
  } catch { roiBackgroundUrl.value = '' }
}

function rowClassName({ row }: { row: ChannelItem }) {
  return selected.value?.channelId === row.channelId ? 'current-row' : ''
}

/** 保存配置: 校验 → start/stop 推理调度 (algo_plugin 保留原完整串, 不破坏多算法配置) */
async function saveConfig() {
  if (!selected.value) return
  if (!validateAll()) {
    ElMessage.warning('参数校验未通过, 请修正红色提示项')
    return
  }
  saving.value = true

  const ch = selected.value
  try {
    const sc = scheduledMap.value.get(ch.channelId)
    // 保存时保留调度原多算法串 (编辑表单仅改参数, 不改算法集合; 新配置走下拉 form.algorithm)
    const algoPluginStr = sc?.algo_plugin || form.algorithm || 'yolov8n'
    if (form.enabled) {
      // 启用推理调度
      const deviceId = ch.deviceId || ch.parentDeviceId || ch.channelId
      await startSchedule(
        ch.channelId,
        deviceId,
        editForm.interval,
        algoPluginStr,
        { confidence: editForm.confidence, nmsThreshold: editForm.nms, inferenceMode: editForm.mode }
      )
      ch.algoPlugin = algoPluginStr
      ch.inferenceEnabled = true
      ch.interval = editForm.interval
      ElMessage.success(`通道 ${ch.name} 推理调度已启动 — 参数已保存`)
    } else {
      // 停用推理调度
      await stopSchedule(ch.channelId)
      ch.inferenceEnabled = false
      ElMessage.success(`通道 ${ch.name} 推理调度已停止`)
    }
    await loadData() // 刷新调度记录 → 算法列表/间隔/模式同步
  } catch (e: any) {
    ElMessage.error(`配置保存失败: ${e?.message || e}`)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.algo-config-view {
  --bg-page: #f5f7fa; --bg-card: #fff; --border-light: #e8ecf1;
  --text-primary: #1d2129; --text-secondary: #6b7785; --panel-left-width: 380px;
  display: flex; flex-direction: column; height: 100%; background: var(--bg-page);
}
.page-header { padding: 10px 24px; background: var(--bg-card); border-bottom: 1px solid var(--border-light); }
.page-title { margin: 0 0 2px; font-size: 17px; color: var(--text-primary); }
.page-desc { font-size: 12px; color: var(--text-secondary); }
.layout-body { flex: 1; display: flex; gap: 12px; padding: 12px 24px; overflow: hidden; }
.panel-left { width: var(--panel-left-width); flex-shrink: 0; overflow-y: auto; }
.panel-left :deep(.el-card__body) { padding: 0; }
/* [2026-09-01] 三栏布局: 通道列表 | 算法列表 | 编辑区; 中列全高表格内滚动,
   右列(编辑+ROI 两卡)定高无滚动; 画布 720x405 (16:9 上限) */
.panel-mid { width: 480px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; }
.panel-mid :deep(.el-card__body) { flex: 1; overflow: hidden; padding: 0; display: flex; flex-direction: column; }
.panel-mid .algo-table { flex: 1; }
.panel-title { font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
.text-muted { color: var(--text-secondary); font-size: 12px; }
.panel-right { flex: 1; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; }
.edit-card :deep(.el-card__body), .roi-card :deep(.el-card__body) { padding: 10px 20px; }
.edit-card :deep(.el-card__header), .roi-card :deep(.el-card__header) { padding: 6px 20px; }
/* [2026-09-01] 右列高度预算: 编辑卡(~200) + ROI 卡(header+tabs+画布 405+列表) ≈ 800 ≤ 883 可视 → 无滚动 */
.edit-card, .roi-card { flex-shrink: 0; }
.algo-card-sub { flex: 1; text-align: right; margin-right: 12px; font-weight: 400; font-size: 12px; color: var(--text-secondary); }
.algo-table { width: 100%; }
.algo-table :deep(.current-algo-row) td { background: var(--el-color-primary-light-9) !important; }
.algo-table :deep(.el-table__row) { cursor: pointer; }
.edit-card .algo-id-text { margin-left: 10px; font-size: 12px; color: var(--text-secondary); }
.edit-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 2px; padding-top: 8px; border-top: 1px solid var(--border-light); }
/* 事件规则添加 dialog */
.rule-dialog-target { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.rule-dialog-sub { font-size: 12px; color: var(--text-secondary); }
.rule-filter { margin-bottom: 8px; }
.rule-check-wrap { max-height: 320px; overflow-y: auto; border: 1px solid var(--border-light); border-radius: 6px; padding: 8px; }
.rule-check-wrap :deep(.el-checkbox-group) { display: flex; flex-wrap: wrap; gap: 2px 12px; }
.rule-check-item { margin-right: 8px; }
.rule-check-key { font-size: 11px; color: var(--text-secondary); margin-left: 4px; }
.rule-dialog-count { float: left; line-height: 32px; font-size: 12px; color: var(--text-secondary); }
.config-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 14px; }
.edit-form :deep(.el-form-item) { margin-bottom: 8px; }
.edit-form :deep(.el-form-item__error) { padding-top: 1px; }
/* 滑块+数字输入并排行 (替代 show-input 省行高) */
.slider-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.slider-row .slider-main { flex: 1; }
.slider-row .slider-num { width: 96px; flex-shrink: 0; }
/* [FIX 2026-08-28 1080P 单屏] 画布 wrap 默认 aspect-ratio 16/9 撑满整行宽 →
   画布高达 600+px 必滚动; 限宽居中后高度可控 (~405px)。
   !important: 实测 scoped 后代选择器在设备端被组件自身规则压过, 直接加保险。 */
.roi-card :deep(.tripwire-canvas-wrap),
.roi-card :deep(.pw-canvas-wrap),
.roi-card :deep(.roi-canvas-wrap) { max-width: 720px !important; margin: 0 auto !important; overflow: hidden; }
/* [2026-09-01] 绘制区单屏无滚动: ROI 卡自身内容定高 (tabs+画布 240+列表限高),
   卡内不产生滚动; 右栏仅在低于 1080P 视口时兜底滚动 */
.roi-card :deep(.el-tabs__content) { overflow: visible; }
.roi-card :deep(.el-tabs__header) { margin-bottom: 8px; }
.counting-config-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.counting-config-row .counting-label { font-size: 13px; color: var(--text-secondary); }
.tripwire-list { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; max-height: 108px; overflow-y: auto; }
.roi-placeholder {
  height: 260px; background: var(--bg-page); border: 2px dashed var(--border-light);
  border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
}
.roi-message { font-size: 15px; color: var(--text-primary); font-weight: 500; }
.roi-hint { font-size: 12px; color: var(--text-secondary); }
.tripwire-list__item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; background: var(--bg-page); border-radius: 4px;
}
.pw-toolbar-row {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  .pw-mig-hint { font-size: 12px; color: #909399; }
}
</style>
