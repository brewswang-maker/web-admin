<template>
  <div class="gas-section">
   <div class="gas-section-main">
    <!-- T6 顶部告警条: 仅在加油区/卸油区展示 (其他区域不显示) -->
    <el-alert v-if="showT6Banner" type="warning" :closable="false" show-icon class="t6-banner">
      <template #title>
        <strong>T6 硬红线 (不可绕过联锁)</strong> ·
        加油站打电话/吸烟 → 仅声光+TTS, <u>不联动工艺联锁</u>。
        视觉不可替代气体探测器/紧急切断阀/防雷防静电/操作规程; AI 联动停泵/开阀必经安全 PLC。
      </template>
    </el-alert>

    <!-- KPI: 本段事件类型计数 tiles (近 7 天聚合, 真实事件流) -->
    <div class="tile-row">
      <div v-for="t in typeTiles" :key="t.key" class="tile" :class="{ zero: t.count === 0 }">
        <span class="tile-num" :class="`val-${t.tone}`">{{ t.count }}</span>
        <span class="tile-label">{{ t.label }}</span>
        <span class="tile-sub">近 7 天</span>
      </div>
      <el-empty v-if="!typeTiles.length" :image-size="40" description="无事件类型" class="tile-empty" />
    </div>

    <!-- [场景页对齐 2026-09-11] 事件列表统一 AlarmEventsPanel
         (表格 14 列/卡片栅格/分页/处警·详情入口 与 AlarmsView 零分叉;
          原「加载更多」换标准分页, 原 详情抽屉/轨迹/回放 收敛至 AlarmPopup/证据链) -->
    <AlarmEventsPanel
      :rows="pagedEvents" :total="filteredEvents.length"
      v-model:page="page" v-model:page-size="pageSize"
      :loading="loading" :view-mode="viewMode" table-height="auto"
      :empty-text="`暂无${title}相关事件`">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ title }}事件
            <span class="card-title-sub">共 {{ filteredEvents.length }} 条</span>
          </span>
          <span class="header-right">
            <AlarmViewToggle v-model="viewMode" page-key="gas" />
            <el-button size="small" :loading="loading" @click="load(true)">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
          </span>
        </div>
      </template>
    </AlarmEventsPanel>
   </div>

   <!-- [P3 2026-09-10] 设备树筛选 (区块内嵌; 默认折叠竖条不挤占卡内空间) -->
   <AlarmDeviceTreePanel default-collapsed @selection-change="onTreeSelection" />
  </div>
</template>

<script setup lang="ts">
/**
 * 加油站事件分段视图 (共享组件) — [加油站方案 2026-08-30] [场景页对齐 2026-09-11]
 * 加油区/卸油区/周界/油罐区/便利店 五个子页复用: 按 GAS_EVENT_SECTIONS 分组过滤真实事件流,
 * 类型计数 tiles + AlarmEventsPanel 列表, 三态完整 + 30s 自动刷新 (禁 mock)
 *
 * 工程红线:
 *   - 加油区 T6 顶部告警条 (showT6Banner=true)
 *   - 卸油区核心圈: 视频证据链入口 (close=manual, 需值守人员复核) — 收敛至行「更多→证据链」
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import { GAS_EVENT_SECTIONS, type GasSectionKey } from '@/api/gasStation'
import type { AlarmEvent } from '@/types/alarm'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import { useRealtimeAlarmEvents } from '@/composables/useRealtimeAlarmEvents'
import { normalizeAlarmCompat } from '@/composables/useAlarmTableHelpers'
// [P3 2026-09-10] 设备树筛选面板 (安保区域→子区域→设备 多选; 区块内嵌默认折叠)
import AlarmDeviceTreePanel from '@/components/alarm/AlarmDeviceTreePanel.vue'
import type { AlarmTreeSelection } from '@/components/alarm/AlarmDeviceTreePanel.vue'
// [P2 2026-09-10] 卡片/列表切换 (持久化 key alarm_view_mode_gas)
import AlarmViewToggle from '@/components/alarm/AlarmViewToggle.vue'
// [场景页对齐 2026-09-11] 列表主体统一共享面板 (不复制 AlarmsView 表格)
import AlarmEventsPanel from '@/components/alarm/AlarmEventsPanel.vue'
// [FIX realtime-push 2026-09-06] 场景页实时刷新: WS 告警到达去抖静默重拉 (无 loading 遮罩闪烁)
useRealtimeAlarmEvents(() => load(true))

const props = defineProps<{
  title: string
  sectionKey: GasSectionKey
  /** 是否显示 T6 顶部告警条 (加油区 true) */
  showT6Banner?: boolean
}>()

const loading = ref(false)
const events = ref<AlarmEvent[]>([])
const page = ref(1)
const pageSize = ref(20)
const eventTypes = ref<EventTypeMetadataItem[]>([])
let refreshTimer: ReturnType<typeof setInterval> | null = null

// [P2 2026-09-10] 卡片/列表视图 (持久化 key alarm_view_mode_gas, 与 AlarmViewToggle 同规范)
const viewMode = ref<'card' | 'table'>(
  localStorage.getItem('alarm_view_mode_gas') === 'card' ? 'card' : 'table'
)

const sectionKeys = computed(() => [...GAS_EVENT_SECTIONS[props.sectionKey]])

const typeMap = computed(() => {
  const m: Record<string, string> = {}
  eventTypes.value.forEach(t => { m[t.alarm_type] = t.display_name })
  return m
})
/** 易混淆类型名 fallback (eventTypes metadata 中关键字别名可能同名时以本表为准) */
const FALLBACK_NAMES: Record<string, string> = {
  intrusion: '周界入侵', tripwire: '绊线越界', climbing: '翻越攀爬',
  loitering: '徘徊逗留', phone_call: '打电话 (T6)', smoking: '吸烟 (T6)',
  fire: '火焰', smoke: '烟雾', smolder: '阴燃', fire_access: '明火作业',
  illegal_parking: '违规停车', vehicle_detected: '车辆检测',
  lpr_violation: '车牌异常', face_stranger: '陌生人识别',
  face_blacklist: '黑名单拦截', abandoned: '遗留物',
  unattended_baggage: '无人看管行李', fall_detected: '跌倒',
}
function typeName(key: string): string {
  return FALLBACK_NAMES[key] || typeMap.value[key] || key
}

const weekCounts = ref<Record<string, number>>({})
const typeTiles = computed(() => {
  const tones = ['red', 'orange', 'blue', 'green', 'purple', 'teal']
  return sectionKeys.value.map((key, i) => ({
    key, label: typeName(key), tone: tones[i % tones.length],
    count: weekCounts.value[key] ?? 0,
  }))
})

// [P3 2026-09-10] 设备树筛选 (右侧面板勾选集合命中判定; 空集不筛)
const treeSel = ref<AlarmTreeSelection | null>(null)
const treeChannelSet = computed(() => new Set(treeSel.value?.channelIds ?? []))
const treeDeviceSet = computed(() => new Set(treeSel.value?.deviceIds ?? []))
function onTreeSelection(sel: AlarmTreeSelection) {
  treeSel.value = sel.chips.length ? sel : null
  page.value = 1
  // [t3-tree-channel 2026-09-11] 勾选变化 → 下钻重拉 (单值通道服务端过滤下沉;
  //   多值保持 hitTree 前端收敛 — 本区块按 alarm_type 分路, fan-out 会放大请求数)
  load(true)
}
function hitTree(a: AlarmEvent): boolean {
  const ch = String(a.channelId || '')
  if (ch && treeChannelSet.value.has(ch)) return true
  const dev = String(a.deviceId || '').replace(/_ch\d+$/, '')
  return !!dev && treeDeviceSet.value.has(dev)
}
const filteredEvents = computed(() =>
  treeSel.value ? events.value.filter(hitTree) : events.value)

// 标准分页切片 (原「加载更多」listLimit → 与 AlarmsView 同参 el-pagination)
const pagedEvents = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredEvents.value.slice(start, start + pageSize.value)
})

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const keys = [...sectionKeys.value]
    // [t3-tree-channel 2026-09-11] 三级树单值下钻: 勾选单个通道/设备叶时
    //   channel_id 服务端过滤 (多值不放大 — 本区块按 alarm_type 分路, 宽谓词集
    //   仍由 hitTree 前端收敛; 详见 useAlarmTreeDrill 头注)
    const drill = treeSel.value?.drillValues ?? []
    const drillOne = drill.length === 1 ? drill[0] : undefined
    // 加油站事件流: scene=gas_station 过滤 (与后端 ScenePackDefs scene_tag 对齐)
    const lists = await Promise.all(
      keys.map(key =>
        alarmApi.getList({ page: 1, pageSize: 30, alarm_type: key,
          ...(drillOne ? { channel_id: drillOne } : {}) }).catch(() => null))
    )
    const merged: AlarmEvent[] = []
    for (const r of lists) {
      if (!r) continue
      const items = (r.data?.data as any)?.items
      if (Array.isArray(items)) merged.push(...items.map((x: any) => normalizeAlarmCompat(x)))
    }
    merged.sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0))
    events.value = merged

    // 近 7 天类型计数 (复用 alarmApi getList 全量拉取后聚合 — 复用后端 start_ms/end_ms 窗口;
    //   加油站场景包后续可单独上 /stats/gas_station_dashboard, 暂用 7d 全量 by_type)
    try {
      const endMs = Date.now()
      const startMs = endMs - 7 * 24 * 60 * 60 * 1000
      const agg = await alarmApi.getList({ page: 1, pageSize: 200, start_ms: startMs, end_ms: endMs }).catch(() => null)
      const items = (agg as any)?.data?.data?.items
      if (Array.isArray(items)) {
        const m: Record<string, number> = {}
        for (const it of items) {
          if (keys.includes(it.alarm_type ?? it.type)) {
            m[it.alarm_type ?? it.type] = (m[it.alarm_type ?? it.type] ?? 0) + 1
          }
        }
        weekCounts.value = m
      }
    } catch {
      // 静默降级 — tiles 显示 0
    }
  } catch (e) {
    console.error('[GasEventSection] load failed', e)
    if (!silent) ElMessage.error('事件加载失败, 请检查设备连接')
  }
  if (!silent) loading.value = false
}

onMounted(async () => {
  try {
    const resp = await eventTypesApi.metadata()
    const data = resp.data?.data
    if (data?.groups) {
      const items: EventTypeMetadataItem[] = []
      Object.values(data.groups).forEach((g: any) => (g.items || []).forEach((i: any) => items.push(i)))
      eventTypes.value = items
    }
  } catch (e) {
    console.error('[GasEventSection] eventTypes failed', e)
  }
  await load()
  refreshTimer = setInterval(() => load(true), 30000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
/*.gas-section { padding: 16px; }*/
.t6-banner { margin-bottom: 14px; }
.t6-banner :deep(.el-alert__title) { font-size: 13px; }
.tile-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 14px; }
.tile {
  background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 14px;
  display: flex; flex-direction: column; gap: 4px; transition: box-shadow 0.2s, transform 0.2s;
}
.tile:hover { box-shadow: 0 6px 18px rgba(31,45,61,0.10); transform: translateY(-2px); }
.tile.zero { opacity: 0.55; }
.tile-num { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
.val-red { color: #f56c6c; } .val-orange { color: #e6a23c; } .val-blue { color: #409eff; }
.val-green { color: #67c23a; } .val-purple { color: #8e6ce0; } .val-teal { color: #14b8b8; }
.tile-label { color: #606266; font-size: 12px; }
.tile-sub { color: #c0c4cc; font-size: 10px; margin-top: 1px; }
.tile-empty { grid-column: 1 / -1; }
/* [P3 2026-09-10] 区块内嵌设备树 → flex 双栏 (面板默认折叠竖条) */
.gas-section { display: flex; gap: 12px; align-items: flex-start; }
.gas-section-main { flex: 1; min-width: 0; }
/* Panel header slot (标题 + 视图切换 + 刷新) */
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-weight: 600; color: #303133; font-size: 14px; }
.card-title-sub { color: #909399; font-weight: 400; font-size: 12px; margin-left: 8px; }
.header-right { display: flex; align-items: center; gap: 12px; }
</style>

<!-- [t3-tree-channel 2026-09-11 完成锚点] 三级树通道级服务端下钻(单值直传+多值 fan-out)批次 · 部署产物 entry=index-CvT0U9Nv4f.js tgz md5=07a2e26224ed93a40c47f987c04b7bb5 -->
