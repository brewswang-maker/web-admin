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
        <!-- [UX 2026-09-01 对齐效果图] 搜索框 + 设备分组折叠树 + 双行通道项 + ON 徽标 -->
        <div class="ch-toolbar">
          <el-input v-model="chSearch" size="small" clearable placeholder="输入设备名称搜索" class="ch-search">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button size="small" text @click="loadData" :loading="loading">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
        <div class="ch-group-list" v-loading="loading">
          <div v-for="g in channelGroups" :key="g.key" class="ch-group">
            <div class="ch-group-head" @click="toggleGroup(g.key)">
              <el-icon class="ch-group-arrow" :class="{ collapsed: collapsedGroups[g.key] }"><CaretBottom /></el-icon>
              <span>{{ g.label }}</span>
            </div>
            <template v-if="!collapsedGroups[g.key]">
              <div v-for="c in g.items" :key="c.channelId" class="ch-item"
                :class="{ active: selected?.channelId === c.channelId }" @click="onChannelSelect(c)">
                <div class="ch-item-info">
                  <div class="ch-item-name">{{ c.name }}</div>
                  <div class="ch-item-no">通道号: {{ c.channelId }}</div>
                </div>
                <el-tag v-if="c.inferenceEnabled" class="ch-item-on" size="small" effect="dark" type="success">ON</el-tag>
              </div>
            </template>
          </div>
          <el-empty v-if="!loading && channelGroups.length === 0" description="暂无通道" :image-size="60" />
        </div>
      </el-card>

      <!-- Middle: 已配置算法列表 (独立栏, 三栏布局: 通道列表 | 算法列表 | 编辑区;
          结构与左侧通道列表一致 — 表格化/可滚动/单行高亮; 数据源调度 algo_plugin 拆分) -->
      <el-card shadow="never" class="panel-mid algo-card">
        <template #header>
          <div class="algo-mid-head">
            <div class="algo-mid-head-left">
              <div>已配置算法</div>
              <div v-if="selected" class="algo-mid-channel">{{ selected.name }}</div>
            </div>
            <el-button type="primary" link size="small" :disabled="!selected" @click="addNewAlgo">+ 新增算法</el-button>
          </div>
        </template>
        <el-table v-if="selected" :data="algoRows" size="small" class="algo-table" height="100%"
          highlight-current-row :row-class-name="algoRowClassName"
          @row-click="selectAlgoRow"
          empty-text="该通道尚未配置算法 — 在右侧编辑区选择算法后点击「保存配置」">
          <el-table-column label="算法" min-width="110">
            <template #default="{ row }">
              <div class="algo-name-cell">
                <el-tag size="small" type="primary" :title="isAlgoFallback(row.algoId) ? '该算法未注册中文名' : ''">{{ row.algoName }}</el-tag>
                <!-- [UX 2026-09-01] 中文名与裸 id 混杂难辨识: 主名下附小字 algo_id (仅当两者不同) -->
                <span v-if="row.algoName !== row.algoId" class="algo-id-sub">{{ row.algoId }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="模式" width="62" align="center">
            <template #default="{ row }">{{ row.mode === 'streaming' ? '连续' : '抓拍' }}</template>
          </el-table-column>
          <el-table-column label="间隔" width="62" align="center" prop="interval" />
          <el-table-column label="启禁用" width="72" align="center">
            <template #default="{ row }">
              <el-switch size="small" :model-value="row.enabled" @change="toggleAlgoEnabled(row)" />
            </template>
          </el-table-column>
          <el-table-column label="事件规则" width="118" align="center">
            <template #default="{ row }">
              <el-badge :value="row.ruleCount" :hidden="!row.ruleCount" type="info">
                <el-button size="small" type="primary" link title="添加事件规则" @click.stop="openAddRuleDialog(row)">
                  <el-icon><Plus /></el-icon>
                </el-button>
              </el-badge>
                <el-button size="small" type="warning" link :disabled="!row.ruleCount" title="编辑事件规则" @click.stop="openRuleDrawer(row)">
                  <el-icon><Edit /></el-icon>
                </el-button>
              <el-button size="small" type="danger" link :disabled="!row.ruleCount" title="删除事件规则" @click.stop="removeAlgoRules(row)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center">
            <template #default="{ row }">
              <el-button size="small" type="primary" link title="编辑参数" @click.stop="selectAlgoRow(row)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button size="small" type="danger" link title="删除该算法" @click.stop="removeAlgo(row)">
                <el-icon><Delete /></el-icon>
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
                <el-tag v-if="editForm.algoId" size="small" type="primary" :title="isAlgoFallback(editForm.algoId) ? '该算法未注册中文名' : ''">{{ editForm.algoName }}</el-tag>
              </div>
            </template>
            <el-form :model="editForm" label-width="92px" size="default" class="edit-form" @submit.prevent>
              <el-form-item label="算法">
                <template v-if="editForm.algoId">
                  <el-tag type="primary" size="small" :title="isAlgoFallback(editForm.algoId) ? '该算法未注册中文名' : ''">{{ editForm.algoName }}</el-tag>
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
        算法 <el-tag size="small" type="primary" :title="isAlgoFallback(ruleTargetAlgo) ? '该算法未注册中文名' : ''">{{ ruleTargetAlgoName }}</el-tag>
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

    <!-- ③ 任务3: 事件规则编辑抽屉 (不走平台跳转, 在当前页右侧滑出完整表单) -->
    <el-drawer v-model="ruleDrawerVisible" direction="rtl" size="540px"
      :with-header="true" :show-close="true" :close-on-click-modal="false"
      class="rule-drawer" :title="`事件规则编辑 — ${ruleDrawerAlgoName}`">
      <div class="rule-drawer-body" v-loading="ruleDrawerLoading">
        <div class="rule-drawer-meta">
          <el-tag size="small" type="primary">{{ ruleDrawerAlgoName }}</el-tag>
          <span class="rule-drawer-sub">通道 {{ selected?.name ?? '-' }} · 设备 {{ selected?.deviceId || selected?.parentDeviceId || '-' }}</span>
        </div>

        <el-empty v-if="!ruleDrawerLoading && ruleDrawerItems.length === 0"
          description="该算法下暂无事件规则 — 请使用添加按钮新建" :image-size="60" />

        <div v-for="r in ruleDrawerItems" :key="r.id" class="rule-drawer-item">
          <div class="rule-drawer-item-head">
            <span class="rule-drawer-item-name">{{ r.name }}</span>
            <el-tag v-if="isSceneDefaultRule(r)" size="small" type="warning" effect="dark">场景默认</el-tag>
            <el-tag :type="r.enabled ? 'success' : 'info'" size="small" effect="plain">
              {{ r.enabled ? '已启用' : '已停用' }}
            </el-tag>
            <el-button size="small" type="danger" link title="删除该规则" @click="removeSingleRule(r)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-form :model="r" label-width="84px" size="small" class="rule-drawer-form">
            <el-form-item label="事件类型">
              <el-select v-model="r.source_cond.event_types" multiple collapse-tags
                placeholder="选择事件类型 (来自 /event-types/canonical SSOT)" style="width:100%">
                <el-option v-for="t in canonicalTypes" :key="t.key" :label="t.name_zh" :value="t.key" />
              </el-select>
            </el-form-item>
            <el-row :gutter="8">
              <el-col :span="8">
                <el-form-item label="启用">
                  <el-switch v-model="r.enabled" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="优先级">
                  <el-input-number v-model="r.priority" :min="1" :max="100" :step="5" size="small" style="width:100%" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="冷却(ms)">
                  <el-input-number v-model="r.cooldown_ms" :min="1000" :max="60000" :step="1000" size="small" style="width:100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="设备过滤">
              <el-select v-model="r.source_cond.device_ids" multiple filterable allow-create
                placeholder="不选=全部设备生效" style="width:100%">
                <el-option v-for="d in ruleDrawerDevices" :key="d.value" :label="d.label" :value="d.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="动作数">
              <span class="rule-drawer-sub">{{ (r.actions || []).filter((a: any) => a.enabled).length }} 项启用 · 共 {{ (r.actions || []).length }} 项</span>
            </el-form-item>
            <div class="rule-drawer-actions">
              <el-button size="small" @click="resetRuleForm(r)">重置</el-button>
              <el-button size="small" type="primary" :loading="ruleSaving" @click="saveSingleRule(r)">保存该规则</el-button>
            </div>
          </el-form>
        </div>
      </div>
      <template #footer>
        <el-button @click="ruleDrawerVisible = false">关闭</el-button>
        <el-button type="primary" :loading="ruleDrawerLoading" @click="reloadRuleDrawer">刷新</el-button>
      </template>
    </el-drawer>
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
import { Refresh, Plus, Delete, Edit, Search, CaretBottom } from '@element-plus/icons-vue'
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
// [FIX 2026-09-01] 全量 id→显示名映射 (不过滤 enabled): 算法列表显示名解析源
const algoNameMap = ref<Map<string, string>>(new Map())
// [FIX 2026-09-01] 目录缺失 id 的显示兜底: 设备 algo_plugin 实测 13 项中 5 项不在
//   /algorithms 目录 (事件型插件/模型型 id 未入目录) → 中文名对齐 EventTypeAliases SSOT
const FALLBACK_ALGO_NAMES: Record<string, string> = {
  object_removal: '物品移除',
  gathering: '人群聚集',
  queue_length: '排队长度',
  'shield.algo.object.per': '人员检测',
  yolo26s: '通用目标检测 (YOLO26s)',
}

/** [FIX 2026-09-01] 统一中文名解析函数: 目录全量映射 → SSOT 兑底表 → options (enabled) → 裸 id
 *  任务 1 要求: 所有算法名展示统一走该函数 */
function algoNameOf(id: string | null | undefined): string {
  if (!id) return ''
  return algoNameMap.value.get(id)
    || FALLBACK_ALGO_NAMES[id]
    || algorithmOptions.value.find((a) => a.value === id)?.label
    || id
}
/** 孤儿算法判断 (中文名解析等同于 id): 为 true 时需 tooltip 提示 */
function isAlgoFallback(id: string | null | undefined): boolean {
  return !!id && algoNameOf(id) === id
}
// [UX 2026-09-01 对齐效果图] 左栏: 搜索过滤 + 按设备分组折叠 (组名 分组0N) + 双行通道项
const chSearch = ref('')
const collapsedGroups = reactive<Record<string, boolean>>({})
const channelGroups = computed(() => {
  const kw = chSearch.value.trim().toLowerCase()
  const filtered = kw
    ? channels.value.filter((c) => c.name.toLowerCase().includes(kw) || c.channelId.toLowerCase().includes(kw))
    : channels.value
  const groups = new Map<string, ChannelItem[]>()
  for (const c of filtered) {
    const gkey = c.parentDeviceId || c.deviceId || 'default'
    if (!groups.has(gkey)) groups.set(gkey, [])
    groups.get(gkey)!.push(c)
  }
  return Array.from(groups.entries()).map(([key, items], i) => ({ key, label: `分组0${i + 1}`, items }))
})
function toggleGroup(key: string) {
  collapsedGroups[key] = !collapsedGroups[key]
}

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
    // [FIX 2026-09-01] 解析链: 统一走 algoNameOf (目录全量映射 → SSOT 兑底表 → options → 裸 id)
    algoName: algoNameOf(id),
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

/** [UX 对齐效果图] + 新增算法: 清空编辑区进入新增模式 (右侧下拉选算法后保存即追加) */
function addNewAlgo() {
  currentAlgoId.value = ''
  editForm.algoId = ''
  editForm.algoName = ''
  form.algorithm = ''
  formErrors.interval = ''; formErrors.confidence = ''; formErrors.nms = ''
  nextTick(() => editCardRef.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }))
}

/** [UX 对齐效果图] 行内启禁用: 切换整通道推理调度 (后端 ScheduledChannel 为通道级模型, 无 per-algo 开关) */
async function toggleAlgoEnabled(row: { enabled: boolean }) {
  const ch = selected.value
  if (!ch) return
  const sc = scheduledMap.value.get(ch.channelId)
  const next = !row.enabled
  try {
    if (next) {
      const deviceId = ch.deviceId || ch.parentDeviceId || ch.channelId
      await startSchedule(ch.channelId, deviceId, sc?.interval_ms ?? editForm.interval,
        sc?.algo_plugin || 'yolov8n',
        { confidence: editForm.confidence, nmsThreshold: editForm.nms, inferenceMode: editForm.mode })
    } else {
      await stopSchedule(ch.channelId)
    }
    ElMessage.success(next ? '推理调度已启用' : '推理调度已停用')
    await loadData()
    await loadRuleCounts()
  } catch (e: any) {
    ElMessage.error(`切换失败: ${e?.message || e}`)
    await loadData()
  }
}

/** [UX 对齐效果图] 删除单算法: 从调度 algo_plugin 串移除该 id 后重启 (串空 → 停调度) */
async function removeAlgo(row: { algoId: string; algoName: string }) {
  const ch = selected.value
  if (!ch) return
  try {
    await ElMessageBox.confirm(
      `将从通道「${ch.name}」移除算法「${row.algoName}」。`,
      '删除算法',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch { return }
  const sc = scheduledMap.value.get(ch.channelId)
  const ids = String(sc?.algo_plugin || '').split(',').map((s) => s.trim()).filter(Boolean)
  const next = ids.filter((id) => id !== row.algoId)
  try {
    if (next.length === 0) {
      await stopSchedule(ch.channelId)
      ElMessage.success('算法已移除, 通道推理调度已停止')
    } else {
      const deviceId = ch.deviceId || ch.parentDeviceId || ch.channelId
      await startSchedule(ch.channelId, deviceId, sc?.interval_ms ?? editForm.interval, next.join(','),
        { confidence: editForm.confidence, nmsThreshold: editForm.nms, inferenceMode: editForm.mode })
      ElMessage.success(`已移除「${row.algoName}」`)
    }
    if (currentAlgoId.value === row.algoId) {
      currentAlgoId.value = ''
      editForm.algoId = ''
      editForm.algoName = ''
    }
    await loadData()
    await loadRuleCounts()
  } catch (e: any) {
    ElMessage.error(`删除失败: ${e?.message || e}`)
    await loadData()
  }
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

// ─── 任务3: 事件规则编辑抽屉 (不走平台跳转) ─────────────────────────────
// drawer 状态: 当前算法 / 规则列表 / 加载中
const ruleDrawerVisible = ref(false)
const ruleDrawerLoading = ref(false)
const ruleDrawerAlgo = ref('')
const ruleDrawerAlgoName = computed(() => algoNameOf(ruleDrawerAlgo.value) || ruleDrawerAlgo.value)
const ruleDrawerItems = ref<LinkageRule[]>([])
const ruleDrawerDevices = ref<{ value: string; label: string }[]>([])
// 保存原始快照用于重置
const ruleDrawerSnapshots = ref<Map<string, string>>(new Map())

/** [任务3] 打开规则编辑抽屉: 在当前页右侧滑出完整表单,
 *  不跳转到「联动规则管理」页 */
async function openRuleDrawer(row: { algoId: string; algoName: string; ruleCount: number }) {
  ruleDrawerAlgo.value = row.algoId
  ruleDrawerVisible.value = true
  await reloadRuleDrawer()
}

/** [任务3] 刷新抽屉内的规则列表: 按当前选中算法过滤 channelRules */
async function reloadRuleDrawer() {
  if (!selected.value || !ruleDrawerAlgo.value) return
  ruleDrawerLoading.value = true
  try {
    // 确保 channelRules 最新
    if (channelRules.value.length === 0) await loadRuleCounts()
    // 过滤: 算法命中
    const algoId = ruleDrawerAlgo.value
    ruleDrawerItems.value = channelRules.value
      .filter((r) => ((r as any).source_cond?.algorithm_ids ?? []).includes(algoId))
      .map((r) => {
        const src = (r.source_cond || {}) as any
        if (!src.event_types) src.event_types = []
        if (!src.device_ids) src.device_ids = []
        if (!src.algorithm_ids) src.algorithm_ids = [algoId]
        return r
      })
    // 保存原始 JSON 用于 reset
    const map = new Map<string, string>()
    for (const r of ruleDrawerItems.value) map.set(r.id, JSON.stringify(r))
    ruleDrawerSnapshots.value = map
    // 设备列表: 当前选中通道的 deviceId + 父设备 id
    const dId = selected.value.deviceId || selected.value.parentDeviceId
    ruleDrawerDevices.value = dId ? [{ value: dId, label: `${dId} (当前)` }] : []
    // 加载 SSOT 事件类型 (用于 select 选项)
    if (canonicalTypes.value.length === 0) {
      try {
        const r = await eventTypesApi.list()
        canonicalTypes.value = r.data?.data?.types ?? (r.data as any)?.types ?? []
      } catch (e) { console.warn('[AlgoConfigView] 抽屉事件类型加载失败', e) }
    }
  } finally {
    ruleDrawerLoading.value = false
  }
}

/** [任务3] 判断是否为场景默认规则: tags 含 'scene-default' 或 'scene' + 'default' */
function isSceneDefaultRule(r: LinkageRule): boolean {
  const tags = ((r as any).tags || []) as string[]
  if (tags.includes('scene-default')) return true
  if (tags.includes('scene_template')) return true
  if ((r as any).scene_tag || (r as any).sceneTag) return true
  return false
}

/** [任务3] 保存单条规则: PUT /linkage/rules/{id} (若无 updateRule 则回退 PATCH/POST) */
async function saveSingleRule(r: LinkageRule) {
  ruleSaving.value = true
  try {
    const src = (r.source_cond || {}) as any
    // 关闭时清空 device_ids (任务5 协议: 不限维度 → 空数组)
    if (!r.enabled) src.device_ids = []
    if (!src.algorithm_ids || src.algorithm_ids.length === 0) src.algorithm_ids = [ruleDrawerAlgo.value]
    if (!src.event_types || src.event_types.length === 0) {
      ElMessage.warning('事件类型不能为空')
      return
    }
    // 优先尝试 updateRule (PUT), 不存在则回退
    const apiAny = linkageApi as any
    let resp
    if (typeof apiAny.updateRule === 'function') {
      resp = await apiAny.updateRule(r.id, { ...r, source_cond: src })
    } else if (typeof apiAny.putRule === 'function') {
      resp = await apiAny.putRule(r.id, { ...r, source_cond: src })
    } else {
      // 回退: 删除后重建
      await linkageApi.deleteRule(r.id)
      resp = await linkageApi.createRule({ ...r, id: undefined, source_cond: src })
    }
    if (resp?.status >= 400 || (resp?.data && resp.data.code && resp.data.code !== 0 && resp.data.code !== 200)) {
      throw new Error(resp?.data?.message || `HTTP ${resp?.status}`)
    }
    ElMessage.success(isSceneDefaultRule(r) ? '场景默认规则已更新 (模板同步)' : '规则已保存')
    ruleDrawerSnapshots.value.set(r.id, JSON.stringify(r))
    await loadRuleCounts()
  } catch (e: any) {
    console.warn('[AlgoConfigView] 保存规则失败', e)
    ElMessage.error(`保存失败: ${e?.message ?? e}`)
  } finally {
    ruleSaving.value = false
  }
}

/** [任务3] 重置规则表单: 从快照恢复 */
function resetRuleForm(r: LinkageRule) {
  const snap = ruleDrawerSnapshots.value.get(r.id)
  if (!snap) return
  const obj = JSON.parse(snap)
  Object.assign(r, obj)
  ElMessage.info('已重置为原始配置')
}

/** [任务3] 删除单条规则 (二次确认) */
async function removeSingleRule(r: LinkageRule) {
  try {
    await ElMessageBox.confirm(
      `将删除规则「${r.name}」, 删除后不可恢复。`,
      '删除规则',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch { return }
  try {
    await linkageApi.deleteRule(r.id)
    ElMessage.success('规则已删除')
    await reloadRuleDrawer()
    await loadRuleCounts()
  } catch (e: any) {
    ElMessage.error(`删除失败: ${e?.message ?? e}`)
  }
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
      // [FIX 2026-09-01] 全量映射 (含 enabled=false): 显示层不丢名字
      algoNameMap.value = new Map(
        algos.map((a: any) => [
          String(a.algo_id ?? a.id ?? ''),
          String(a.name_zh || a.name_en || a.name || a.algo_id || a.id || ''),
        ])
      )
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

/** 保存配置: 校验 → 启用推理调度 (编辑保留原算法串 / 新增追加; 停用走列表行内启禁用) */
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
    // [UX 对齐效果图] 保存即启用: 编辑模式保留原多算法串; 新增模式 (下拉新选) 追加进串
    let algoPluginStr = sc?.algo_plugin || ''
    if (form.algorithm) {
      const ids = algoPluginStr ? algoPluginStr.split(',').map((s) => s.trim()).filter(Boolean) : []
      if (!ids.includes(form.algorithm)) ids.push(form.algorithm)
      algoPluginStr = ids.join(',')
    }
    if (!algoPluginStr) algoPluginStr = 'yolov8n'
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
    ElMessage.success(`通道 ${ch.name} 配置已保存, 推理调度已启动`)
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
/* [UX 2026-09-01 对齐效果图] 左栏: 搜索工具行 + 分组折叠 + 双行通道项 + ON 徽标 */
.ch-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border-light); }
.ch-search { flex: 1; }
.ch-group-list { padding: 6px 8px 12px; overflow-y: auto; }
.ch-group-head { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-primary); padding: 8px 6px; cursor: pointer; user-select: none; }
.ch-group-arrow { transition: transform 0.2s; font-size: 12px; color: var(--text-secondary); }
.ch-group-arrow.collapsed { transform: rotate(-90deg); }
.ch-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
.ch-item:hover { background: var(--bg-page); }
.ch-item.active { background: var(--el-color-primary-light-9); }
.ch-item.active .ch-item-name { color: var(--el-color-primary); }
.ch-item-info { min-width: 0; }
.ch-item-name { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ch-item-no { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
.ch-item-on { flex-shrink: 0; border-radius: 4px; }
/* 中栏 header: 标题+通道名两行左置, 右侧「+ 新增算法」链接 */
.algo-mid-head { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.algo-mid-head-left { min-width: 0; }
.algo-mid-channel { font-size: 12px; font-weight: 400; color: var(--text-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.algo-table { width: 100%; }
.algo-table :deep(.current-algo-row) td { background: var(--el-color-primary-light-9) !important; }
.algo-table :deep(.el-table__row) { cursor: pointer; }
/* [UX 2026-09-01] 算法名单元格: 主名 + 小字 id 双行 */
.algo-name-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; line-height: 1.2; }
.algo-id-sub { font-size: 11px; color: var(--text-secondary); word-break: break-all; }
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
/* [任务3] 事件规则编辑抽屉: 右侧滑出全量表单, 不跳平台 */
.rule-drawer-body { display: flex; flex-direction: column; gap: 14px; padding: 0 4px; }
.rule-drawer-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid var(--border-light); }
.rule-drawer-sub { font-size: 12px; color: var(--text-secondary); }
.rule-drawer-item { border: 1px solid var(--border-light); border-radius: 8px; padding: 12px 14px; background: var(--bg-card, #fafafa); }
.rule-drawer-item-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.rule-drawer-item-name { font-weight: 600; font-size: 13px; flex: 1; min-width: 0; }
.rule-drawer-form :deep(.el-form-item) { margin-bottom: 10px; }
.rule-drawer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
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
