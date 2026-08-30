<template>
  <div class="school-section">
    <!-- KPI: 本段事件类型计数 tiles (近 7 天 campus_dashboard 真实聚合; 事件流窗口可能全为高频类型, 不能代表分段长期水位) -->
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
        <el-table-column label="" width="112" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click.stop="openDetail(row)">详情</el-button>
            <el-button size="small" type="success" link @click.stop="goTrajectory(row)">轨迹</el-button>
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
 * 校园事件分段视图 (共享组件) — [校园方案 2026-08-30]
 * 门禁/周界/行为/访客 四个子页复用: 按 SCHOOL_EVENT_SECTIONS 分组过滤真实事件流,
 * 类型计数 tiles + 事件表 + 详情抽屉, 三态完整 + 30s 自动刷新 (禁 mock)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import { schoolApi, SCHOOL_EVENT_SECTIONS, type SchoolSectionKey } from '@/api/school'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'
import type { EventTypeMetadataItem } from '@/api/eventTypes'

const props = defineProps<{
  title: string
  sectionKey: SchoolSectionKey
}>()

const loading = ref(false)
const events = ref<AlarmEvent[]>([])
const listLimit = ref(20)
const eventTypes = ref<EventTypeMetadataItem[]>([])
let refreshTimer: ReturnType<typeof setInterval> | null = null

const sectionKeys = computed(() => [...SCHOOL_EVENT_SECTIONS[props.sectionKey]])

const typeMap = computed(() => {
  const m: Record<string, string> = {}
  eventTypes.value.forEach(t => { m[t.alarm_type] = t.display_name })
  return m
})
/** 易混淆类型名 fallback (eventTypes metadata 中 tailgate/face_tailgate 同名时以地图为准) */
const FALLBACK_NAMES: Record<string, string> = {
  tailgate: '尾随', face_tailgate: '人脸尾随', intrusion: '周界入侵',
  tripwire: '绊线越界', climbing: '翻越攀爬', loitering: '徘徊逗留',
  fight: '打架斗殴', gathering: '异常聚集', fall_detected: '跌倒',
  running: '奔跑', smoking: '吸烟', phone_call: '接打电话',
  field_intrusion: '场内入侵',
}
function typeName(key: string): string {
  return FALLBACK_NAMES[key] || typeMap.value[key] || key
}

/** 近 7 天类型计数 (campus_dashboard by_type 全量聚合, 与事件流窗口无关) */
const weekCounts = ref<Record<string, number>>({})

/** 类型计数 tiles (近 7 天聚合为准) */
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
/** [校园二期 2026-08-30] 跨镜追踪: 事件行 → 智能检索以文搜图预填
 *  (nl=类型名+通道, RetrievalView 带 nl query 即预填, from 仅区分提示文案) */
function goTrajectory(row: AlarmEvent) {
  router.push({
    path: '/retrieval',
    query: { nl: `${typeName(row.type)} ${row.channelId}`, from: 'campus-event' },
  })
}

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    // 事件表: 按段内类型并行查询 (后端 alarm_type 单值过滤, SQL 直查精准命中)
    //   → 合并按时间倒序; 计数 tiles: 7 天聚合并行
    //   注: 仅用 scene/首页窗口拉不到历史类型 (设备正持续产生高频类型), 故逐类型直查。
    //   [真机修复 2026-08-30] 用 Promise.all + 逐 promise catch (结果保证非 rejected),
    //     避免 allSettled 结果数组方法调用在真机 WebView 环境的兼容性问题
    const keys = [...sectionKeys.value]
    const [agg, ...lists] = await Promise.all([
      schoolApi.getCampusDashboard({ days: 7 }).catch(() => null),
      ...keys.map(key =>
        alarmApi.getList({ page: 1, pageSize: 30, alarm_type: key }).catch(() => null)),
    ])
    const merged: AlarmEvent[] = []
    for (const r of lists) {
      if (!r) continue
      const items = (r.data?.data as any)?.items
      // [真机修复 2026-08-30] 后端 snake_case (alarm_type/level 数字/created_at 毫秒),
      //   必须归一化成 camelCase AlarmEvent, 否则行渲染全空 (t.toUpperCase TypeError)
      if (Array.isArray(items)) merged.push(...items.map((x: any) => normalizeAlarmCore(x)))
    }
    merged.sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0))
    events.value = merged
    const aggTypes = (agg as any)?.data?.data?.by_type
    if (Array.isArray(aggTypes)) {
      const m: Record<string, number> = {}
      aggTypes.forEach((b: any) => { m[b.key] = b.total })
      weekCounts.value = m
    }
  } catch (e) {
    console.error('[SchoolEventSection] load failed', e)
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
    console.error('[SchoolEventSection] eventTypes failed', e)
  }
  await load()
  refreshTimer = setInterval(() => load(true), 30000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.school-section { padding: 16px; }
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
