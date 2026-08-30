<template>
  <div class="gas-section">
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

    <!-- 事件表 -->
    <el-card shadow="never" class="block-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ title }}事件
            <span class="card-title-sub">共 {{ events.length }} 条 (最近 {{ listLimit }} 条显示)</span>
          </span>
          <el-button size="small" :loading="loading" @click="load(true)">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>
      <el-table :data="pagedEvents" v-loading="loading" size="small"
                :empty-text="loading ? '加载中…' : '暂无事件'" @row-click="openDetail">
        <el-table-column label="类型" min-width="170">
          <template #default="{ row }">
            <div class="type-cell">
              <span class="evt-name">{{ typeName(row.type) }}</span>
              <span class="evt-key">{{ row.type }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="92">
          <template #default="{ row }">
            <span class="level-tag" :class="levelClass(row.level)">{{ levelText(row.level) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="channelId" label="通道" width="92" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="快照" width="80" align="center">
          <template #default="{ row }">
            <el-image v-if="row.snapshotUrl" :src="row.snapshotUrl"
                      :preview-src-list="[row.snapshotUrl]" fit="cover"
                      preview-teleported class="snap-thumb" @click.stop />
            <div v-else class="snap-none">—</div>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ shortTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="" width="152" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click.stop="openDetail(row)">详情</el-button>
            <el-button size="small" type="success" link @click.stop="goTrajectory(row)">轨迹</el-button>
            <!-- [加油站三期 2026-08-30 §11.1C] 视频证据链: 跳转事件时刻录像回放 -->
            <el-button size="small" type="warning" link @click.stop="jumpToPlayback(row)">回放</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager" v-if="events.length > listLimit">
        <el-button size="small" :disabled="listLimit >= events.length" @click="listLimit += 20">
          加载更多 ({{ events.length - listLimit }})
        </el-button>
      </div>
    </el-card>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" :title="detailTitle" size="520px" direction="rtl">
      <div v-if="current" class="detail-body">
        <div class="kv-row"><span class="k">类型</span><span>{{ current.type }} · {{ typeName(current.type) }}</span></div>
        <div class="kv-row"><span class="k">级别</span><span :class="levelClass(current.level)">{{ levelText(current.level) }}</span></div>
        <div class="kv-row"><span class="k">通道</span><span>{{ current.channelId }}</span></div>
        <div class="kv-row"><span class="k">置信度</span><span>{{ current.confidence != null ? (current.confidence * 100).toFixed(0) + '%' : '-' }}</span></div>
        <div class="kv-row"><span class="k">描述</span><span>{{ current.description || '-' }}</span></div>
        <div class="kv-row"><span class="k">时间</span><span>{{ formatTime(current.createdAt) }}</span></div>
        <el-image v-if="current.snapshotUrl" :src="current.snapshotUrl"
                  :preview-src-list="[current.snapshotUrl]" fit="contain"
                  preview-teleported class="detail-snap" />
        <div v-else class="snap-error">快照已清理</div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 加油站事件分段视图 (共享组件) — [加油站方案 2026-08-30]
 * 加油区/卸油区/周界/油罐区/便利店 五个子页复用: 按 GAS_EVENT_SECTIONS 分组过滤真实事件流,
 * 类型计数 tiles + 事件表 + 详情抽屉, 三态完整 + 30s 自动刷新 (禁 mock)
 *
 * 工程红线:
 *   - 加油区 T6 顶部告警条 (showT6Banner=true)
 *   - 卸油区核心圈: 视频证据链入口 (close=manual, 需值守人员复核)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import { GAS_EVENT_SECTIONS, type GasSectionKey } from '@/api/gasStation'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'
import type { EventTypeMetadataItem } from '@/api/eventTypes'

const props = defineProps<{
  title: string
  sectionKey: GasSectionKey
  /** 是否显示 T6 顶部告警条 (加油区 true) */
  showT6Banner?: boolean
}>()

const loading = ref(false)
const events = ref<AlarmEvent[]>([])
const listLimit = ref(20)
const eventTypes = ref<EventTypeMetadataItem[]>([])
let refreshTimer: ReturnType<typeof setInterval> | null = null

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

const pagedEvents = computed(() => events.value.slice(0, listLimit.value))

const detailVisible = ref(false)
const current = ref<AlarmEvent | null>(null)
const detailTitle = computed(() => current.value ? `事件详情 · ${typeName(current.value.type)}` : '事件详情')
function openDetail(row: AlarmEvent) {
  current.value = row
  detailVisible.value = true
}

const router = useRouter()
// [加油站三期 2026-08-30 §11.1C] 视频证据链回放跳转
//   范式复用 AlarmPopup.jumpToPlayback: Recording 页带 channelId/时间参数
//   (回放页定位该时刻); 卸油事件 close=manual 需值守人员复核录像证据链
function jumpToPlayback(row: AlarmEvent) {
  const t = row.createdAt ? new Date(row.createdAt).getTime() : Date.now()
  router.push({
    name: 'Recording',
    query: {
      channelId: row.channelId || '',
      deviceId: row.deviceId || '',
      time: String(t),
      alarmId: row.id || '',
    },
  })
  ElMessage.success('正在跳转到录像回放…')
}
function goTrajectory(row: AlarmEvent) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  const trackId = Number(meta.track_id) || 0
  const camId = Number(meta.channel_id)
    || Number(String(row.channelId).replace(/\D/g, '')) || 0
  if (trackId && camId) {
    router.push({
      path: '/retrieval',
      query: { tab: 'trajectory', camera_id: String(camId), track_id: String(trackId) },
    })
    return
  }
  const ts = new Date(row.createdAt).getTime()
  const query: Record<string, string> = {
    nl: `${typeName(row.type)} ${row.channelName || row.deviceName || row.channelId}`,
    from: 'gas-event',
  }
  if (ts) {
    query.start = String(ts - 30 * 60_000)
    query.end = String(ts + 30 * 60_000)
  }
  router.push({ path: '/retrieval', query })
}

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const keys = [...sectionKeys.value]
    // 加油站事件流: scene=gas_station 过滤 (与后端 ScenePackDefs scene_tag 对齐)
    const lists = await Promise.all(
      keys.map(key =>
        alarmApi.getList({ page: 1, pageSize: 30, alarm_type: key }).catch(() => null))
    )
    const merged: AlarmEvent[] = []
    for (const r of lists) {
      if (!r) continue
      const items = (r.data?.data as any)?.items
      if (Array.isArray(items)) merged.push(...items.map((x: any) => normalizeAlarmCore(x)))
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

function levelClass(level: AlarmLevel): string {
  switch (level) {
    case 'critical': return 'lv-crit'
    case 'high': return 'lv-high'
    case 'medium': return 'lv-med'
    case 'low': return 'lv-low'
    default: return 'lv-info'
  }
}
function levelText(level: AlarmLevel): string {
  return level.toUpperCase()
}
function formatTime(ts?: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function shortTime(ts?: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
.gas-section { padding: 16px; }
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
.block-card { border-radius: 10px; }
.block-card :deep(.el-card__header) { padding: 12px 16px; border-bottom: 1px solid #f0f2f5; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-weight: 600; color: #303133; font-size: 14px; }
.card-title-sub { color: #909399; font-weight: 400; font-size: 12px; margin-left: 8px; }
.type-cell { display: flex; flex-direction: column; }
.evt-name { color: #303133; }
.evt-key { color: #909399; font-family: monospace; font-size: 11px; }
.level-tag { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.lv-crit { background: #fef0f0; color: #f56c6c; }
.lv-high { background: #fdf6ec; color: #e6a23c; }
.lv-med { background: #ecf5ff; color: #409eff; }
.lv-low { background: #f0f9eb; color: #67c23a; }
.lv-info { background: #f4f4f5; color: #909399; }
.snap-thumb { width: 50px; height: 32px; border-radius: 4px; }
.snap-none { color: #c0c4cc; }
.snap-error { color: #c0c4cc; font-size: 12px; padding: 4px 8px; background: #f5f7fa; border-radius: 4px; }
.pager { text-align: center; padding: 12px 0 0; }
.detail-body { padding: 0 16px; }
.kv-row { display: flex; padding: 8px 0; border-bottom: 1px dashed #ebeef5; }
.kv-row .k { width: 80px; color: #909399; }
.detail-snap { width: 100%; margin-top: 12px; border-radius: 4px; }
</style>
