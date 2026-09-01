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

      <!-- Right: Configuration Area -->
      <div class="panel-right">
        <el-card v-if="!selected" shadow="never" class="empty-state">
          <el-empty :description="$t('selectChannelHint', '请从左侧选择一个通道进行配置')" />
        </el-card>

        <template v-else>
          <el-card shadow="never" class="config-card">
            <template #header>
              <div class="config-header">
                <span>{{ selected.channelId }} - {{ selected.name }}</span>
                <el-switch v-model="form.enabled" :active-text="$t('enable', '启用')" :inactive-text="$t('disable', '停用')" />
              </div>
            </template>

            <!-- [FIX 2026-09-01] 已配置算法列表: 选择通道即列出当前摄像头使用的
                 算法 (数据源 /inference/channels 调度记录), 点编辑定位到下方表单 -->
            <div class="algo-list-block">
              <div class="algo-list-title">已配置算法</div>
              <el-table :data="algoList" size="small" class="algo-list-table"
                empty-text="该通道尚未配置算法 — 在下方选择算法后点击「保存配置」">
                <el-table-column label="算法" min-width="150">
                  <template #default="{ row }">
                    <el-tag v-for="a in row.algoNames" :key="a" size="small" type="primary" class="algo-name-tag">{{ a }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="推理模式" width="90" align="center">
                  <template #default="{ row }">{{ row.mode === 'streaming' ? '连续' : '抓拍' }}</template>
                </el-table-column>
                <el-table-column label="间隔(ms)" width="90" align="center" prop="interval" />
                <el-table-column label="状态" width="76" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="dark">
                      {{ row.enabled ? 'ON' : 'OFF' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="70" align="center">
                  <template #default="{ row }">
                    <el-button size="small" type="primary" link @click="editAlgoRow">编辑</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <el-form ref="formRef" :model="form" label-width="86px" size="default" class="config-form">
              <!-- [FIX 2026-08-28 1080P 单屏] 3 行表单压缩为 2 行, 减少纵向占用 -->
              <el-row :gutter="16">
                <el-col :span="10">
                  <el-form-item :label="$t('inferenceAlgo', '推理算法')">
                    <el-select v-model="form.algorithm" :placeholder="$t('selectAlgo', '选择算法')" style="width:100%">
                      <el-option v-for="a in algorithmOptions" :key="a.value" :label="a.label" :value="a.value" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="7">
                  <el-form-item :label="$t('inferenceMode', '推理模式')">
                    <el-radio-group v-model="form.inferenceMode" size="small">
                      <el-radio value="snapshot">抓拍</el-radio>
                      <el-radio value="streaming">连续</el-radio>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
                <el-col :span="7">
                  <el-form-item :label="$t('inferenceInterval', '推理间隔')">
                    <el-input-number v-model="form.interval" :min="50" :max="10000" :step="50" size="small" controls-position="right" style="width: 100%" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="16">
                <el-col :span="12">
                  <el-form-item :label="$t('confidenceThreshold', '置信度阈值')">
                    <el-slider v-model="form.confidence" :min="0.1" :max="1" :step="0.05" show-input input-size="small" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item :label="$t('nmsThreshold', 'NMS 阈值')">
                    <el-slider v-model="form.nmsThreshold" :min="0.1" :max="1" :step="0.05" show-input input-size="small" />
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
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
                  :canvas-width="620" :canvas-height="310"
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
                  :canvas-width="620" :canvas-height="310"
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

    <!-- Bottom Actions -->
    <div class="bottom-bar">
      <el-button @click="resetForm">{{ $t('reset', '重置') }}</el-button>
      <el-button type="primary" @click="saveConfig" :loading="saving">{{ $t('save', '保存配置') }}</el-button>
    </div>
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
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { channelApi } from '@/api/channel'
import { startSchedule, stopSchedule, getInferenceChannels } from '@/api/inference'
import type { ScheduledChannel } from '@/api/inference'
import algorithmsApi from '@/api/algorithms'
import type { AlgorithmInfo } from '@/api/algorithms'
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
const formRef = ref()

// [FIX 2026-09-01] 已配置算法列表: 当前通道的调度记录映射为可编辑列表项
// (后端调度模型为一通道一算法, 列表最多 1 条; 空态提示去下方表单配置)
const algoList = computed(() => {
  if (!selected.value) return []
  const sc = scheduledMap.value.get(selected.value.channelId)
  if (!sc) return []
  return [{
    algoPlugin: sc.algo_plugin,
    // [FIX 2026-09-01] 调度 algo_plugin 支持逗号分隔多算法串 (实测 intrusion,yolo26s)
    // → 拆开逐个映射中文名, 独立 tag 展示
    algoNames: String(sc.algo_plugin || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((id) => algorithmOptions.value.find((a) => a.value === id)?.label || id),
    mode: (sc as any).inference_mode === 'streaming' ? 'streaming' : 'snapshot',
    interval: sc.interval_ms,
    enabled: sc.enabled,
    running: sc.running,
  }]
})

function editAlgoRow() {
  // 表单已由 onChannelSelect 用调度记录填充, 编辑仅定位聚焦
  nextTick(() => formRef.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }))
  ElMessage.info('已在下方表单中编辑该算法参数')
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
    const [rRes, tRes, pRes, czRes] = await Promise.all([
      regionApi.listRegions({ channel_id: chId }),
      regionApi.listTripwires({ channel_id: chId }),
      // 🆕 v5.0: 通道主路径 channel_id_str (GB28181 完整编码)
      regionApi.listPassageways({
        channel_id_str: chStrNoSuffix,
        algo_id: form.algorithm || 'shield.algo.perimeter.tailgating'
      }),
      regionApi.listCountingZones({ channel_id: chId })
    ])
    // [FIX 2026-09-01] http 封装不剥业务壳 (拦截器 return response):
    // res.data = {code, data:{...}, message} → 必须取 res.data.data.xxx
    // 载入映射: 后端 RegionDef {id,name,polygon:[[x,y]...],enabled} →
    // 编辑器 RoiData {roi_id,roi_name,roi_type,polygon:number[]一维,is_active} —
    // 之前直接透传二维结构, 编辑器按一维消费 → 已保存区域渲染错乱/不显示,
    // 且 roi_id undefined → 新画区域与存量无法区分。
    const rawRegions: any[] = rRes.data?.data?.regions ?? rRes.data?.regions ?? []
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
  // algo_id 跟随当前调度算法 (检测区域语义: 该算法的检测过滤范围)
  const algoId = form.algorithm || 'yolov8n'
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
  if (row) {
    form.enabled = row.inferenceEnabled
    form.algorithm = row.algoPlugin || 'yolov8n'
    form.confidence = row.confidence
    form.nmsThreshold = row.nmsThreshold
    form.interval = row.interval
    form.inferenceMode = row.inferenceMode
    // 🆕 v7.1: 加载该通道的 ROI/绊线/计数区
    loadRegions()
    // [FIX 2026-08-28] 加载通道快照作绘制背景 (与联动规则页同链路)
    loadChannelSnapshot(row.channelId)
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

function resetForm() {
  if (selected.value) onChannelSelect(selected.value)
  ElMessage.info('已重置为原始配置')
}

function clearRoi() {
  ElMessage.info('ROI 区域已清除，将使用全帧检测')
}

/** 保存配置：根据启用/停用调用后端推理调度 API */
async function saveConfig() {
  if (!selected.value) return
  saving.value = true

  const ch = selected.value
  try {
    if (form.enabled) {
      // 启用推理调度
      const deviceId = ch.deviceId || ch.parentDeviceId || ch.channelId
      await startSchedule(
        ch.channelId,
        deviceId,
        form.interval,
        form.algorithm || 'yolov8n',
        { confidence: form.confidence, nmsThreshold: form.nmsThreshold, inferenceMode: form.inferenceMode }
      )
      ch.algoPlugin = form.algorithm
      ch.inferenceEnabled = true
      ch.interval = form.interval
      ch.inferenceMode = form.inferenceMode
      ElMessage.success(`通道 ${ch.name} 推理调度已启动 — 算法将在后台持续运行`)
    } else {
      // 停用推理调度
      await stopSchedule(ch.channelId)
      ch.inferenceEnabled = false
      ch.algoPlugin = ''
      ElMessage.success(`通道 ${ch.name} 推理调度已停止`)
    }
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
.panel-title { font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
.text-muted { color: var(--text-secondary); font-size: 12px; }
.panel-right { flex: 1; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; }
.config-card :deep(.el-card__body), .roi-card :deep(.el-card__body) { padding: 12px 20px; }
.config-card :deep(.el-card__header), .roi-card :deep(.el-card__header) { padding: 10px 20px; }
.config-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 14px; }
.config-form .form-hint { margin-left: 12px; color: var(--text-secondary); font-size: 12px; }
/* [FIX 2026-09-01] 已配置算法列表块 */
.algo-list-block { margin-bottom: 12px; }
.algo-list-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.algo-list-table { width: 100%; }
.algo-list-table .algo-name-tag { margin-right: 6px; margin-bottom: 2px; }
/* [FIX 2026-08-28 1080P 单屏] 画布 wrap 默认 aspect-ratio 16/9 撑满整行宽 →
   画布高达 600+px 必滚动; 限宽居中后高度可控 (~405px)。
   !important: 实测 scoped 后代选择器在设备端被组件自身规则压过, 直接加保险。 */
.roi-card :deep(.tripwire-canvas-wrap),
.roi-card :deep(.pw-canvas-wrap) { max-width: 720px !important; margin: 0 auto !important; }
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
.bottom-bar {
  padding: 8px 24px; background: var(--bg-card); border-top: 1px solid var(--border-light);
  display: flex; justify-content: flex-end; gap: 12px;
}
</style>
