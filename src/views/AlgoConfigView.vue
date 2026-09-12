<template>
  <div class="algo-config-view">
    <div class="page-header">
      <h2 class="page-title">{{ $t('algoConfig', '算法查看') }}</h2>
      <span class="page-desc">{{ $t('algoConfigDesc', '查看各通道已绑定的推理算法、调度状态与 ROI 资源 — 本页仅供查看, 全部配置与绘制请前往「事件规则」') }}</span>
    </div>

    <div class="layout-body">
      <!-- Left: 通道树 (区域 → 设备 → 通道三级, 对齐告警列表页 AlarmDeviceTreePanel 结构)
           [algo-view-readonly 2026-09-12] 原设备伪分组列表 (分组01/02) → 真实三级树:
           数据源 securityAreaApi.listAreas → buildAreaTree → areaTreeToElTreeData,
           点击通道叶子选中查看 (RecordingView recTree 同构: 单击选中+高亮+搜索过滤) -->
      <el-card class="panel-left" shadow="never">
        <template #header>
          <div class="panel-title">
            <span>{{ $t('channelList', '通道列表') }}</span>
            <el-button size="small" text @click="loadData" :loading="loading">
              <el-icon><Refresh /></el-icon>
            </el-button>
          </div>
        </template>
        <div class="ch-toolbar">
          <el-input v-model="treeFilter" size="small" clearable placeholder="搜索区域 / 设备 / 通道" class="ch-search">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
        <div class="ch-tree-wrap" v-loading="loading">
          <el-tree
            ref="treeRef"
            :key="treeKey"
            :data="channelTreeData"
            node-key="key"
            :props="{ label: 'label', children: 'children' }"
            :filter-node-method="filterTreeNode"
            default-expand-all
            highlight-current
            :expand-on-click-node="false"
            class="ch-tree"
            @node-click="onTreeNodeClick"
          >
            <template #default="{ data }">
              <span class="ch-tree-node" :class="`ch-tree-node--${data.type}`">
                <el-icon v-if="data.type === 'area' || data.type === 'ungrouped'" class="ch-tree-icon"><Location /></el-icon>
                <el-icon v-else-if="data.type === 'device'" class="ch-tree-icon"><Monitor /></el-icon>
                <el-icon v-else class="ch-tree-icon"><VideoCamera /></el-icon>
                <span class="ch-tree-label" :title="data.label">{{ data.label }}</span>
                <span v-if="data.type === 'channel'" class="ch-tree-no">#{{ data.channelId }}</span>
                <el-tag v-if="data.type === 'channel' && isChInferenceOn(data.channelId)" class="ch-item-on" size="small" effect="dark" type="success">ON</el-tag>
              </span>
            </template>
          </el-tree>
          <el-empty v-if="!loading && channelTreeData.length === 0" description="暂无通道" :image-size="60" />
        </div>
      </el-card>

      <!-- Middle: 已配置算法列表 (只读; [algo-view-readonly 2026-09-12] 行开关/快捷停用/
           删除/绑定按钮全部下线 — 调度真值唯一入口 = 事件规则, 本页只呈现绑定结果) -->
      <el-card shadow="never" class="panel-mid algo-card">
        <template #header>
          <div class="algo-mid-head">
            <div class="algo-mid-head-left">
              <div>已配置算法</div>
              <div v-if="selected" class="algo-mid-channel">{{ selected.name }}</div>
            </div>
          </div>
        </template>
        <el-table v-if="selected" :data="algoRows" size="small" class="algo-table" height="100%"
          row-key="algoId" empty-text="该通道尚未绑定算法 — 新建事件规则后将自动绑定">
          <el-table-column label="算法" min-width="110">
            <template #default="{ row }">
              <div class="algo-name-cell">
                <div class="algo-name-line">
                  <el-tag size="small" type="primary" :title="isAlgoFallback(row.algoId) ? '该算法未注册中文名' : ''">{{ row.algoName }}</el-tag>
                  <el-tooltip v-if="row.enabled && row.ruleCount === 0" placement="top"
                    content="未绑定事件规则: 告警不触发弹窗/联动 — 请在「事件规则」中新建或启用规则">
                    <el-icon class="algo-norule-warn"><WarningFilled /></el-icon>
                  </el-tooltip>
                  <el-tag v-else-if="row.ruleCount > 0" size="small" type="info" effect="plain" class="algo-rule-count">规则×{{ row.ruleCount }}</el-tag>
                </div>
                <span v-if="row.algoName !== row.algoId" class="algo-id-sub">{{ row.algoId }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="模式" width="62" align="center">
            <template #default="{ row }">{{ row.mode === 'streaming' ? '连续' : '抓拍' }}</template>
          </el-table-column>
          <el-table-column label="调度态" width="82" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.enabled ? 'success' : 'info'" effect="plain">
                {{ row.enabled ? '运行中' : '已停止' }}
              </el-tag>
            </template>
          </el-table-column>
          <!-- [algo-view-readonly 2026-09-12] 操作列 (停用/删除) 移除; 保留「查看 ROI」只读入口:
               仅有 ROI 资源的算法 (8 区域消费 + 4 绊线消费 + 尾随) 显示, 其余显示占位 -->
          <el-table-column label="ROI" width="76" align="center">
            <template #default="{ row }">
              <el-button v-if="algoHasRoi(row.algoId)" size="small" type="primary" link
                title="查看该算法已保存的 ROI (只读; 绘制请前往事件规则)" @click.stop="openRoiViewer(row)">查看</el-button>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else :description="$t('selectChannelHint', '请先从左侧通道树选择一个通道')" :image-size="80" />
      </el-card>
    </div>

    <!-- 查看 ROI 弹窗 (只读): [algo-view-readonly 2026-09-12] 右栏编辑区 (参数编辑卡 +
         检测区域/绊线/通道三编辑器) 整体移除, 只保留「查看已画 ROI」入口 — 全部绘制
         已收敛到事件规则页; 本弹窗按当前算法展示已保存的 ROI (只读画布 + 只读列表)。 -->
    <el-dialog v-model="roiViewerVisible" :title="roiViewerTitle" width="860px"
      class="roi-viewer-dialog" destroy-on-close>
      <div v-if="roiViewerRow" class="roi-viewer-body" v-loading="roiViewerLoading">
        <el-tabs v-model="roiViewerTab" class="roi-viewer-tabs">
          <el-tab-pane v-if="roiViewerIsRegionAlgo" name="roi" :label="$t('detectionZone', '检测区域')">
            <RoiViewer :background-image-url="roiBackgroundUrl" :shapes="regionViewShapes" />
            <div v-if="regions.length" class="tripwire-list">
              <div v-for="r in regions" :key="r.roi_id" class="tripwire-list__item">
                <span>
                  <el-tag :type="r.roi_type === 'exclusion_zone' ? 'danger' : 'success'" size="small" class="roi-type-tag">
                    {{ r.roi_type === 'exclusion_zone' ? '排除区' : '检测区' }}
                  </el-tag>
                  {{ r.roi_name || '未命名' }}
                  <span v-if="r.is_active === false" class="text-muted">（已停用）</span>
                </span>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane v-if="roiViewerRes?.tab === 'tripwire'" name="tripwire" :label="$t('tripwire', '绊线')">
            <p class="roi-viewer-desc">{{ roiViewerRes?.desc }}</p>
            <RoiViewer :background-image-url="roiBackgroundUrl" :shapes="tripwireViewShapes" />
            <div v-if="tripwires.length" class="tripwire-list">
              <div v-for="tw in tripwires" :key="tw.id" class="tripwire-list__item">
                <span>
                  <el-tag :type="tw.enabled === false ? 'info' : 'success'" size="small" class="roi-type-tag">
                    {{ tw.enabled === false ? '已停用' : '生效中' }}
                  </el-tag>
                  {{ tw.name }}{{ (tw.channel_id_str || '').endsWith('_ch0') ? ' (镜像)' : '' }} ({{ tw.direction }})
                </span>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane v-if="roiViewerRes?.tab === 'passageway'" name="passageway" :label="$t('passageway', '通道')">
            <p class="roi-viewer-desc">{{ roiViewerRes?.desc }}</p>
            <RoiViewer :background-image-url="roiBackgroundUrl" :shapes="passagewayViewShapes" />
            <div v-if="passageways.length" class="tripwire-list">
              <div v-for="pw in passageways" :key="pw.id" class="tripwire-list__item">
                <span>
                  <el-tag :type="pw.enabled === false ? 'info' : 'success'" size="small" class="roi-type-tag">
                    {{ pw.enabled === false ? '已停用' : '生效中' }}
                  </el-tag>
                  {{ pw.name }} (sens={{ pw.sensitivity }}, {{ pw.direction_in ? '进入' : '离开' }}
                  {{ pw.suppress_mode }}<template v-if="pw.migrated_from_tripwire">, 迁移自绊线#{{ pw.migrated_from_tripwire }}</template>)
                </span>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
      <template #footer>
        <span class="roi-viewer-hint">本页仅供查看 — ROI 绘制 / 修改请前往「事件规则」</span>
        <el-button size="small" @click="roiViewerVisible = false">关闭</el-button>
        <el-button size="small" type="primary" :loading="roiViewerLoading" @click="loadRoiViewerData">刷新</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * AlgoConfigView.vue — 算法查看页面 (原「算法配置」)
 *
 * [algo-view-readonly 2026-09-12] 全面只读化 (用户拍板, 方案 B 完成态):
 *   调度真值唯一入口 = 事件规则 — 页面仅保留「查看已绑定算法」展示能力:
 *   1. 不允许编辑 (参数编辑卡/保存/重置 已移除);
 *   2. 不允许开启/关闭 (启停开关/快捷停用 已移除, 调度态只读徽标);
 *   3. 不允许删除 (删除入口已移除);
 *   4. 全部绘制收敛到事件规则页 — 本页仅保留「查看 ROI」只读弹窗
 *      (RoiViewer 只读画布 + 只读列表);
 *   5. 通道列表改三级树 (区域 → 设备 → 通道, 对齐告警列表页结构)。
 *   接口保留: GET /channels、GET /inference/channels、GET /algorithms、
 *   GET /linkage/rules (规则计数徽标)、GET /algos/regions|tripwires|passageways。
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Search, WarningFilled, Location, Monitor, VideoCamera } from '@element-plus/icons-vue'
import { channelApi } from '@/api/channel'
import { getInferenceChannels } from '@/api/inference'
import type { ScheduledChannel } from '@/api/inference'
import algorithmsApi from '@/api/algorithms'
import { securityAreaApi } from '@/api/securityAreas'
import type { SecurityArea } from '@/api/securityAreas'
import { buildAreaTree, areaTreeToElTreeData } from '@/utils/areaTree'
import { devNameOf, alarmDirReady } from '@/composables/useAlarmDeviceLabel'
import { useEventTypeZh } from '@/composables/useEventTypeZh'
// [R6 P1-3 2026-09-12 算法页降视图] useAlgoRuleSync 已废除 (与规则页的双向联动链
//   及 localStorage 三键整体下线): safeChannelHash 契约迁 utils/channelHash;
//   algoIdMatches 收拢为本组件局部函数
import { safeChannelHash } from '@/utils/channelHash'
import { linkageApi, type LinkageRule } from '@/api/linkage'
import { regionApi } from '@/api/region'
import type { TripwireDef, PassagewayDef } from '@/types/region'
import RoiViewer from '@/components/RoiViewer.vue'

/** 通道项 (只读视图消费: 树分桶/选中展示; [algo-view-readonly 2026-09-12]
 *  原调度镜像字段 online/algoPlugin/confidence/interval 等全部删减 —
 *  调度态统一经 scheduledMap 现取, 不在通道对象上冗余快照) */
interface ChannelItem {
  channelId: string
  name: string
  deviceId: string
  parentDeviceId: string
}

/** 通道树节点 (区域 → 设备 → 通道 三级 + 未分组兜底; 索引签名兼容 areaTree 工具泛型) */
interface TreeNode {
  key: string
  label: string
  type: 'area' | 'device' | 'channel' | 'ungrouped'
  channelId?: string
  children?: TreeNode[]
  [k: string]: unknown
}

const channels = ref<ChannelItem[]>([])
const algorithmOptions = ref<{ label: string; value: string }[]>([])
// [FIX 2026-09-01] 全量 id→显示名映射 (不过滤 enabled): 算法列表显示名解析源
const algoNameMap = ref<Map<string, string>>(new Map())
// [FIX 2026-09-02f] 事件类型中文名 SSOT 单例 (目录外事件型插件 id 的算法名兜底数据源)
const { ensure: ensureEventTypeZh, zh: eventTypeZhSSOT } = useEventTypeZh()
ensureEventTypeZh()
// [FIX 2026-09-02d] 事件名 → 算法 alarm_type 的别名兑底 (对齐后端 EventTypeAliases.h SSOT
//   的关键别名对)。实锤: tailgate vs tailgating 第 8 字符 e/i 分叉, startsWith 恒 false
const EVENT_ALGO_TYPE_ALIASES: Record<string, string> = {
  tailgate: 'tailgating',
  face_tailgate: 'tailgating',
  fight: 'fighting',
  violence: 'fighting',
  fall_detected: 'fall',
  elderly_fall: 'fall',
}
/** [R6 P1-3 2026-09-12] 依赖 id ↔ 算法 id 匹配 (精确 → 双向尾段)。
 *  兼容短名 'intrusion' ↔ 全名 'shield.algo.perimeter.intrusion' 两种存量形态 */
function algoIdMatches(dep: string, algoId: string): boolean {
  return dep === algoId || dep.endsWith('.' + algoId) || algoId.endsWith('.' + dep)
}
// [FIX 2026-09-01] 目录缺失 id 的显示兜底: 设备 algo_plugin 实测 13 项中 5 项不在
//   /algorithms 目录 (事件型插件/模型型 id 未入目录) → 中文名对齐 EventTypeAliases SSOT
const FALLBACK_ALGO_NAMES: Record<string, string> = {
  object_removal: '物品移除',
  person_detected: '人员检测',
  gathering: '人群聚集',
  queue_length: '排队长度',
  'shield.algo.object.per': '人员检测',
  yolo26s: '通用目标检测 (YOLO26s)',
}

/** [FIX 2026-09-01] 统一中文名解析函数: 目录全量映射 → SSOT 兑底表 → 事件类型
 *  SSOT 中文名 → options (enabled) → 裸 id */
function algoNameOf(id: string | null | undefined): string {
  if (!id) return ''
  const hit = algoNameMap.value.get(id) || FALLBACK_ALGO_NAMES[id]
  if (hit) return hit
  const zhName = eventTypeZhSSOT(id)
  if (zhName && zhName !== id) return zhName
  return algorithmOptions.value.find((a) => a.value === id)?.label || id
}
/** 孤儿算法判断 (中文名解析等同于 id): 为 true 时需 tooltip 提示 */
function isAlgoFallback(id: string | null | undefined): boolean {
  return !!id && algoNameOf(id) === id
}

// ─── 通道树 (区域 → 设备 → 通道, 对齐告警列表页 AlarmDeviceTreePanel) ──────────
const treeRef = ref()
const treeFilter = ref('')
const treeKey = ref(0)
const areaRoots = ref<ReturnType<typeof buildAreaTree>>([])
// 设备名目录异步就绪 → key 重建刷新 label (AlarmDeviceTreePanel 同构)
const dirReady = alarmDirReady()
watch(dirReady, () => { treeKey.value++ })

async function loadAreaTree() {
  try {
    const res = await securityAreaApi.listAreas() as any
    // [FIX 2026-09-10 真机 同 AlarmDeviceTreePanel] 解包链补 .items 分支 + 数组守卫
    const rawList = res?.data?.data?.areas ?? res?.data?.data?.items ?? res?.data?.data ?? res?.data ?? []
    const list: SecurityArea[] = Array.isArray(rawList) ? rawList : []
    areaRoots.value = buildAreaTree(list)
    treeKey.value++
  } catch { console.error('[AlgoConfigView] 加载安保区域树失败') }
}

/** 设备 → 通道分桶 (parentDeviceId 优先, 与旧分组逻辑同源) */
const channelTreeData = computed<TreeNode[]>(() => {
  const byDev = new Map<string, ChannelItem[]>()
  const noDev: ChannelItem[] = []
  for (const c of channels.value) {
    const key = String(c.parentDeviceId || c.deviceId || '')
    if (!key) { noDev.push(c); continue }
    if (!byDev.has(key)) byDev.set(key, [])
    byDev.get(key)!.push(c)
  }
  const chanNode = (c: ChannelItem): TreeNode => ({
    key: `ch:${c.channelId}`, label: c.name, type: 'channel', channelId: c.channelId,
  })
  const claimed = new Set<string>()
  const roots = areaTreeToElTreeData(areaRoots.value, (n) =>
    (n.area.device_ids || []).map((d): TreeNode => {
      const dev = String(d)
      claimed.add(dev)
      return {
        key: `dev:${dev}`,
        label: devNameOf(dev) || dev,
        type: 'device',
        children: (byDev.get(dev) ?? []).map(chanNode),
      }
    })) as TreeNode[]
  // 未分组兜底: 无区域认领设备下的通道 + 无设备通道 (RecordingView __ungrouped__ 同构)
  const orphan: ChannelItem[] = [...noDev]
  for (const [dev, list] of byDev) if (!claimed.has(dev)) orphan.push(...list)
  if (orphan.length > 0) {
    roots.push({ key: '__ungrouped__', label: '未分组', type: 'ungrouped', children: orphan.map(chanNode) })
  }
  return roots
})

watch(treeFilter, (v) => { treeRef.value?.filter(v) })
function filterTreeNode(value: string, data: any): boolean {
  if (!value) return true
  const kw = value.toLowerCase()
  return String(data.label || '').toLowerCase().includes(kw)
    || String(data.channelId || '').toLowerCase().includes(kw)
}
function onTreeNodeClick(data: TreeNode) {
  if (data.type !== 'channel' || !data.channelId) return
  const hit = channels.value.find((c) => c.channelId === data.channelId)
  if (hit) onChannelSelect(hit)
}

// ─── 算法行数据 (调度串拆分 + 规则计数) ────────────────────────────────────────
const scheduledMap = ref<Map<string, ScheduledChannel>>(new Map())
const selected = ref<ChannelItem | null>(null)
const loading = ref(false)

// 选中通道变化 → 树节点高亮跟随 (树重建/程序化选中时恢复)
// [FIX 2026-09-12 TDZ] watch 建立即同步执行 source getter (经 baseWatchOptions.call
//   包装) — 此前置于 selected 声明之前, ReferenceError 被 Vue callWithErrorHandling
//   静默吞掉 (页面残存但初值失效; 控制台留红) — 移至声明后消除
watch(() => selected.value?.channelId, (id) => {
  nextTick(() => {
    if (id) treeRef.value?.setCurrentKey(`ch:${id}`)
    else treeRef.value?.setCurrentKey(null)
  })
})

// [FIX 2026-09-02 关闭最后算法不同步] 后端 /schedule/stop (disableChannel) 只置 enabled=false,
// algo_plugin 串保留作为重启调度记忆 → 串≠启用集合。通道停用时启用集合视为空,
// 否则最后一行算法仍显示开启 / 重开时串内残留算法被连带带起
function effectiveActiveIds(chId: string): string[] {
  const sc = scheduledMap.value.get(chId)
  if (!sc || sc.enabled === false) return []
  return String(sc.algo_plugin || '').split(',').map((s) => s.trim()).filter(Boolean)
}
// [algo-view-readonly 2026-09-12] 行序持久化 (algo_order_by_channel) 已随
//   只读化移除: 本页不再有启停操作触发串变化, 行序 = 调度串序 (后端持久,
//   规则页/reconciler 变更后自然反映); computed 中写 localStorage 的副作用
//   一并消除 (只读页零本地写)。

/** 已配置算法行 (只读): algo_plugin 串拆分逐行 + 调度态徽标 + 规则计数;
 *  通道停用时遗留串并入禁用行 (调度态只读徽标「已停止」) — 换浏览器/清缓存
 *  也能看到全部算法行, 不至于行消失无从查看 */
const algoRows = computed(() => {
  if (!selected.value) return []
  const sc = scheduledMap.value.get(selected.value.channelId)
  const activeIds = effectiveActiveIds(selected.value.channelId)
  const chDisabled = !sc || sc.enabled === false
  const all = chDisabled
    ? Array.from(new Set(String(sc?.algo_plugin || '').split(',').map((s) => s.trim()).filter(Boolean)))
    : activeIds
  type AlgoRow = { algoId: string; algoName: string; mode: 'snapshot' | 'streaming'; enabled: boolean; ruleCount: number }
  return all.map((id): AlgoRow => ({
    algoId: id,
    // 解析链: 统一走 algoNameOf (目录全量映射 → SSOT 兑底表 → options → 裸 id)
    algoName: algoNameOf(id),
    mode: (sc as any)?.inference_mode === 'streaming' ? 'streaming' : 'snapshot',
    enabled: activeIds.includes(id),
    ruleCount: algoRuleCounts.value.get(id) ?? 0,
  }))
})

/** [FIX 2026-09-02] 左侧 ON 徽标与算法行调度态同源: 直接判调度 enabled,
 *  避免 loadData 重建 channels 数组与 scheduledMap 更新时序差导致的双源不一致 */
function isChInferenceOn(chId: string): boolean {
  const sc = scheduledMap.value.get(chId)
  return !!sc && sc.enabled !== false
}

// ─── 事件规则计数 (算法行「规则×N」徽标, 只读) ──────────────────────────────────
const algoRuleCounts = ref<Map<string, number>>(new Map())
/** 拉取当前通道全部联动规则 → 按算法计数 */
async function loadRuleCounts() {
  if (!selected.value) return
  try {
    const res = await linkageApi.getAllRules()
    const items: LinkageRule[] = res.data?.data?.items ?? (res.data as any)?.items ?? []
    const chIdStr = selected.value.channelId
    const sc = scheduledMap.value.get(chIdStr)
    const algoIds = String(sc?.algo_plugin || '').split(',').map((s) => s.trim()).filter(Boolean)
    // [FIX 2026-09-05 两边没同步] 通道命中必须走 safeChannelHash 契约 (FNV-1a int32,
    //   LinkageEngine.cpp 同源): 原 Number(chIdStr) 对 GB 通道及数字通道均与规则库
    //   hash 形态 channel_ids 永不匹配 → 已启用规则全被跳过 → 计数恒 0。
    //   GB 双流 _ch0 双形态 hash 都参与命中 (与 LinkageRuleView 反解注册同构)
    const baseId = chIdStr.replace(/_ch\d+$/, '')
    const chHashes = new Set<number>([safeChannelHash(chIdStr)])
    if (baseId && baseId !== chIdStr) chHashes.add(safeChannelHash(baseId))
    const counts = new Map<string, number>()
    for (const r of items) {
      const src: any = (r as any).source_cond ?? {}
      const chList: number[] = src.channel_ids ?? []
      const chHit = chList.length === 0 || chList.some((h) => chHashes.has(h))
      if (!chHit) continue
      for (const a of (src.algorithm_ids ?? []) as string[]) {
        // [FIX 2026-09-05b 第三洞] 短名先过别名归一再双向尾段匹配: tailgate→tailgating
        const normA = EVENT_ALGO_TYPE_ALIASES[a] ?? a
        for (const id of algoIds) {
          if (algoIdMatches(a, id) || algoIdMatches(normA, id)) counts.set(id, (counts.get(id) ?? 0) + 1)
        }
      }
    }
    algoRuleCounts.value = counts
  } catch (e: any) {
    console.warn('[AlgoConfigView] 规则计数加载失败', e)
  }
}

// ─── 查看 ROI (只读弹窗) ──────────────────────────────────────────────────────
// [FIX algo-bind-roi2 2026-09-09] 绊线判定消费方全仓 4 插件 (grep 实锚) + 尾随通道
//   (tripwire/boundary/people_count 按己 id 查 + parking_violation 空 id 容差)
const ALGO_EXCLUSIVE_RES: Record<string, { tab: 'tripwire' | 'passageway'; key: string; fallback: string; desc: string }> = {
  'shield.algo.perimeter.tripwire': { tab: 'tripwire', key: 'tripwire', fallback: '绊线', desc: '绊线由本算法判定生效；在事件规则页画的越线绊线也会自动同步到这里。' },
  'shield.algo.perimeter.boundary': { tab: 'tripwire', key: 'tripwire', fallback: '绊线', desc: '绊线由本算法（边界判定）消费生效，独立于越线算法的绊线库。' },
  'shield.algo.metric.people_count': { tab: 'tripwire', key: 'tripwire', fallback: '绊线', desc: '绊线作为本算法的计数线（目标穿越即计数）。' },
  'shield.algo.traffic.parking_violation': { tab: 'tripwire', key: 'tripwire', fallback: '绊线', desc: '车辆停在通道内任意绊线附近即触发本算法；此处查看本算法的绊线 (绘制请前往事件规则页)。' },
  'shield.algo.perimeter.tailgating': { tab: 'passageway', key: 'passageway', fallback: '通道 (尾随 v5)', desc: '矩形通道由本算法（尾随判定）消费生效。' },
}
// [FIX algo-roi-effective 2026-09-09] 检测区域视图按算法能力门控: 仅 8 个
//   真正消费 getRegions 的算法显示 (绊线类 4 算法/尾随不消费区域 — 画了不起作用)。
const REGION_ALGOS = new Set([
  'shield.algo.perimeter.intrusion',         // getRegions + ByChannelStr
  'shield.algo.behavior.loitering',          // getRegionsByChannelStr
  'shield.algo.perimeter.climbing',          // getRegionsByChannelStr
  'shield.algo.perimeter.abandoned_luggage', // getRegionsByChannelStr
  'shield.algo.safety.sleep_on_duty',        // getRegions(int32)
  'shield.algo.crowd.capacity_guard',        // getRegions(int32)
  'shield.algo.fire.blocked_exit',           // getRegions(int32)
  'shield.algo.object.personal_item',        // getRegionsByChannelStr
])

/** 算法 id 首段归一 (行内 id 为单值, 兼容历史逗号串形态) */
function baseAlgoId(id: string | null | undefined): string {
  return String(id || '').split(',')[0].trim()
}
/** 该算法是否有可查看的 ROI 资源 (8 区域消费 + 4 绊线消费 + 尾随通道) */
function algoHasRoi(algoId: string | null | undefined): boolean {
  const base = baseAlgoId(algoId)
  return REGION_ALGOS.has(base) || !!ALGO_EXCLUSIVE_RES[base]
}

const roiViewerVisible = ref(false)
const roiViewerLoading = ref(false)
const roiViewerRow = ref<{ algoId: string; algoName: string } | null>(null)
const roiViewerTab = ref('roi')
const roiViewerRes = computed(() => ALGO_EXCLUSIVE_RES[baseAlgoId(roiViewerRow.value?.algoId)] ?? null)
const roiViewerIsRegionAlgo = computed(() => REGION_ALGOS.has(baseAlgoId(roiViewerRow.value?.algoId)))
const roiViewerTitle = computed(() => {
  const name = roiViewerRow.value?.algoName || baseAlgoId(roiViewerRow.value?.algoId)
  const ch = selected.value?.name ? ` · ${selected.value.name}` : ''
  return `查看 ROI — ${name}${ch}`
})

const regions = ref<any[]>([])
const tripwires = ref<TripwireDef[]>([])
const passageways = ref<PassagewayDef[]>([])

function openRoiViewer(row: { algoId: string; algoName: string }) {
  roiViewerRow.value = row
  const base = baseAlgoId(row.algoId)
  roiViewerTab.value = REGION_ALGOS.has(base) ? 'roi' : (ALGO_EXCLUSIVE_RES[base]?.tab ?? 'roi')
  roiViewerVisible.value = true
  void loadRoiViewerData()
}

/** 拉取当前算法已保存的 ROI (只读; 与旧编辑页 loadRegions 同查询口径:
 *  区域按 algo_id 隔离 + include_disabled, 绊线/通道按 channel_id_str 主键) */
async function loadRoiViewerData() {
  const ch = selected.value
  const row = roiViewerRow.value
  if (!ch || !row) return
  roiViewerLoading.value = true
  const chIdStr = ch.channelId
  const chIdNum = Number(chIdStr)
  const chId = Number.isFinite(chIdNum) && Number.isSafeInteger(chIdNum) ? chIdNum : 0
  const chStrNoSuffix = stripChSuffix(chIdStr)
  const curAlgo = baseAlgoId(row.algoId)
  try {
    const [rRes, tRes, pRes] = await Promise.all([
      regionApi.listRegions(curAlgo
        ? { channel_id: chId, algo_id: curAlgo, channel_id_str: chStrNoSuffix, include_disabled: true }
        : { channel_id: chId, channel_id_str: chStrNoSuffix, include_disabled: true }),
      regionApi.listTripwires({ channel_id: chId, channel_id_str: chStrNoSuffix, algo_id: curAlgo || 'shield.algo.perimeter.tripwire', include_disabled: true }),
      regionApi.listPassageways({ channel_id_str: chStrNoSuffix, algo_id: 'shield.algo.perimeter.tailgating', include_disabled: true }),
    ])
    const rawRegions: any[] = curAlgo ? ((rRes.data as any)?.data?.regions ?? (rRes.data as any)?.regions ?? []) : []
    // [region-delete-strict 2026-09-11 显示层] 同名堆积显示名追加 #id (历史残留同名多行可辨)
    const nameCount = new Map<string, number>()
    for (const r of rawRegions) nameCount.set(r.name ?? '', (nameCount.get(r.name ?? '') ?? 0) + 1)
    regions.value = rawRegions.map((r: any) => ({
      roi_id: `reg_${r.id}`,
      roi_name: (nameCount.get(r.name ?? '') ?? 0) > 1 ? `${r.name} #${r.id}` : r.name,
      // 后端序列化 region_type (detection_zone/exclusion_zone) — 查看层按真实类型着色
      roi_type: String(r.region_type || 'detection_zone'),
      polygon: (r.polygon ?? []).flat(),
      is_active: r.enabled,
      backend_id: r.id,
    }))
    // GET /algos/tripwires 后端仅支持 int32 channel_id (GB 超大数全部存 0),
    // 会混出其他通道的绊线 → 本地按 channel_id_str 过滤 (剥后缀双形态同命中)
    tripwires.value = ((tRes.data as any)?.data?.tripwires ?? (tRes.data as any)?.tripwires ?? []).filter(
      (t: any) => stripChSuffix(t.channel_id_str || '') === chStrNoSuffix
    )
    passageways.value = ((pRes.data as any)?.data?.passageways ?? (pRes.data as any)?.passageways ?? []).filter(
      (p: any) => stripChSuffix(p.channel_id_str || '') === chStrNoSuffix
    )
  } catch (e: any) {
    console.warn('[AlgoConfigView] ROI 查看数据加载失败', e)
    ElMessage.warning(`加载 ROI 失败: ${e?.message ?? e}`)
  } finally {
    roiViewerLoading.value = false
  }
}

/** 检测区域只读图形: 检测区绿 / 排除区红 (与 RoiPolygonEditor typeColor 同源) */
const regionViewShapes = computed(() =>
  regions.value
    .filter((r) => (r.polygon ?? []).length >= 6)
    .map((r) => ({
      kind: 'polygon' as const,
      points: r.polygon as number[],
      color: r.roi_type === 'exclusion_zone' ? '#F44336' : '#0F9D58',
      fill: r.roi_type === 'exclusion_zone' ? 'rgba(244,67,54,0.15)' : '#0F9D5826',
      label: r.roi_type === 'exclusion_zone' ? '排除区' : '检测区',
    }))
)

/** 绊线只读图形: 过滤 _ch0 镜像 (同几何双份), 只画主形态; 方向转小写 (后端大写下发) */
const tripwireViewShapes = computed(() =>
  tripwires.value
    .filter((t) => !String(t.channel_id_str || '').endsWith('_ch0'))
    .map((t) => ({
      kind: 'line' as const,
      points: [...(t.point_a ?? []), ...(t.point_b ?? [])],
      color: '#FF6D00',
      direction: String(t.direction || 'both').toLowerCase(),
      label: t.name,
    }))
)

/** 通道只读图形: 尾随通行区多边形 (transit_polygon 2D → 一维), 过滤 _ch0 镜像 */
const passagewayViewShapes = computed(() =>
  passageways.value
    .filter((p) => !String(p.channel_id_str || '').endsWith('_ch0'))
    .map((p) => ({
      kind: 'polygon' as const,
      points: ((p.transit_polygon ?? []) as any[]).flat(),
      color: '#00897B',
      fill: '#00897B26',
      label: p.name,
    }))
)

/** 剥离 GB28181 通道编码的 _ch0/_ch1 子码后缀 — 与后端插件查询串对齐
 *  (InferenceScheduler 传给插件的 channel_id_str 不带子码后缀) */
function stripChSuffix(chId: string): string {
  return chId.replace(/_ch\d+$/, '')
}

// ─── 数据加载 (通道列表 + 推理调度 + 算法目录) ──────────────────────────────────
/** 加载通道列表 + 推理状态 + 算法列表 */
async function loadData() {
  loading.value = true
  try {
    const [chRes, inferRes, algoRes] = await Promise.allSettled([
      channelApi.getList({ pageSize: 200 }),
      getInferenceChannels(),
      algorithmsApi.list(),
    ])

    // 解析推理调度通道 (建立 channel_id → ScheduledChannel 映射)
    const sm = new Map<string, ScheduledChannel>()
    if (inferRes.status === 'fulfilled') {
      const raw = inferRes.value?.data as any
      const list: ScheduledChannel[] = raw?.data?.channels ?? raw?.channels ?? []
      for (const sc of list) sm.set(sc.channel_id, sc)
    }
    scheduledMap.value = sm

    // 解析通道列表
    const channelList: ChannelItem[] = []
    if (chRes.status === 'fulfilled') {
      const raw = chRes.value?.data as any
      const items: any[] = raw?.data?.items ?? raw?.data ?? raw?.items ?? []
      for (const ch of items) {
        const id = String(ch.channel_id ?? ch.channelId ?? ch.id ?? '')
        channelList.push({
          channelId: id,
          name: ch.channel_name ?? ch.name ?? ch.channelName ?? id,
          deviceId: String(ch.device_id ?? ch.deviceId ?? ''),
          parentDeviceId: String(ch.parent_device_id ?? ch.parentDeviceId ?? ''),
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
    console.warn('[AlgoConfigView] 数据加载失败:', e?.message || e)
  } finally {
    loading.value = false
  }
}

function onChannelSelect(row: ChannelItem | null) {
  selected.value = row
  if (row) {
    // [FIX 2026-08-28] 加载通道快照作查看背景 (与联动规则页同链路)
    loadChannelSnapshot(row.channelId)
    // 事件规则计数 (算法行「规则×N」徽标)
    loadRuleCounts()
  } else {
    roiBackgroundUrl.value = ''
  }
}

// [FIX 2026-08-28] ROI 查看背景: 通道快照 — 与 LinkageRuleView 同链路。
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

onMounted(() => {
  loadData()
  loadAreaTree()
})
</script>

<style scoped>
.algo-config-view {
  --bg-page: #f5f7fa; --bg-card: #fff; --border-light: #e8ecf1;
  --text-primary: #1d2129; --text-secondary: #6b7785; --panel-left-width: 340px;
  display: flex; flex-direction: column; height: 100%; background: var(--bg-page);
}
.page-header { padding: 10px 24px; background: var(--bg-card); border-bottom: 1px solid var(--border-light); }
.page-title { margin: 0 0 2px; font-size: 17px; color: var(--text-primary); }
.page-desc { font-size: 12px; color: var(--text-secondary); }
/* [algo-view-readonly 2026-09-12] 两栏布局: 通道树(定宽) | 算法列表(自适应全宽);
   原第三栏编辑区整体移除 (全部绘制/配置收敛到事件规则页) */
.layout-body { flex: 1; display: flex; gap: 12px; padding: 12px 16px; overflow: hidden; }
.panel-left { width: var(--panel-left-width); flex-shrink: 0; overflow-y: auto; }
.panel-left :deep(.el-card__body) { padding: 0; }
.panel-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.panel-mid :deep(.el-card__body) { flex: 1; overflow: hidden; padding: 0; display: flex; flex-direction: column; }
.panel-mid .algo-table { flex: 1; }
.panel-title { font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
.text-muted { color: var(--text-secondary); font-size: 12px; }
/* [chan-tree 三级树] 搜索行 + 树节点 (区域/设备/通道 图标区分 + ON 徽标) */
.ch-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border-light); }
.ch-search { flex: 1; }
.ch-tree-wrap { position: relative; min-height: 200px; max-height: calc(100vh - 250px); overflow-y: auto; padding: 6px 8px 12px; }
.ch-tree { --el-tree-node-content-height: 30px; background: transparent; }
.ch-tree :deep(.el-tree-node__content) { border-radius: 6px; }
.ch-tree-node { display: flex; align-items: center; gap: 6px; width: 100%; overflow: hidden; }
.ch-tree-icon { font-size: 14px; color: var(--el-color-primary); flex-shrink: 0; }
.ch-tree-node--device .ch-tree-icon { color: var(--text-secondary); }
.ch-tree-node--channel .ch-tree-icon { color: var(--el-color-success); }
.ch-tree-node--area .ch-tree-label,
.ch-tree-node--ungrouped .ch-tree-label { font-weight: 600; }
.ch-tree-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; color: var(--text-primary); }
.ch-tree-no { flex-shrink: 0; font-size: 11px; color: var(--text-secondary); }
.ch-item-on { flex-shrink: 0; border-radius: 4px; }
/* 中栏 header: 标题+通道名两行左置 (只读页无右侧操作入口) */
.algo-mid-head { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.algo-mid-head-left { min-width: 0; }
.algo-mid-channel { font-size: 12px; font-weight: 400; color: var(--text-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.algo-table { width: 100%; }
/* [UX 2026-09-01] 算法名单元格: 主名 + 小字 id 双行 */
.algo-name-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; line-height: 1.2; }
/* [docx#5 P1-5] 规则订阅状态行内标识 */
.algo-name-line { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.algo-norule-warn { color: var(--el-color-warning); cursor: help; }
.algo-rule-count { flex-shrink: 0; }
.algo-id-sub { font-size: 11px; color: var(--text-secondary); word-break: break-all; }
/* 查看 ROI 弹窗 (只读): 画布限宽 720 (16:9) + 图形/列表说明 */
.roi-viewer-dialog :deep(.el-dialog__body) { padding-top: 8px; }
.roi-viewer-body { display: flex; flex-direction: column; gap: 8px; min-height: 320px; }
.roi-viewer-tabs :deep(.el-tabs__header) { margin-bottom: 8px; }
.roi-viewer-body :deep(.roi-viewer) { max-width: 720px; margin: 0 auto; }
.roi-viewer-desc { margin: 0 0 8px; font-size: 12px; color: var(--text-secondary); }
.roi-viewer-hint { float: left; line-height: 32px; font-size: 12px; color: var(--text-secondary); }
.roi-type-tag { margin-right: 6px; }
.tripwire-list { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto; }
.tripwire-list__item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; background: var(--bg-page); border-radius: 4px;
}
</style>
