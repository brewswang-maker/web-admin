<template>
  <div class="screening-overview">
    <!-- ===== 顶部统计卡 ===== -->
    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" v-for="s in statCards" :key="s.label">
        <el-card shadow="never" class="stat-card" :body-style="{ padding: '18px' }">
          <div class="stat-label">{{ s.label }}</div>
          <div class="stat-value" :class="s.cls">{{ s.value }}</div>
          <div class="stat-sub">{{ s.sub }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 动线六分区卡 (方案 §4 矩阵) ===== -->
    <el-card shadow="never" class="zone-card">
      <template #header>
        <div class="card-header">
          <span>安检动线 × 算法覆盖</span>
          <el-button size="small" text @click="loadZoneCounts">
            <el-icon><Refresh /></el-icon>刷新计数
          </el-button>
        </div>
      </template>
      <el-row :gutter="14">
        <el-col :span="8" v-for="z in zones" :key="z.id">
          <div class="zone-tile" :class="`zone-${z.status}`">
            <div class="zone-head">
              <span class="zone-id">{{ z.id }}</span>
              <span class="zone-name">{{ z.name }}</span>
              <el-tag size="small" :type="z.statusTag" effect="light">{{ z.statusText }}</el-tag>
            </div>
            <div class="zone-algos">
              <span v-for="a in z.algos" :key="a.name" class="algo-chip" :class="`algo-${a.status}`">
                {{ a.name }}
                <el-tooltip :content="a.note || a.name" placement="top">
                  <el-icon class="algo-icon"><InfoFilled /></el-icon>
                </el-tooltip>
              </span>
            </div>
            <div class="zone-events">
              <el-icon><Bell /></el-icon>
              <span>今日事件: <strong>{{ z.eventCount }}</strong></span>
              <span class="zone-sub">· 最近: {{ z.lastEventTime }}</span>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- ===== 最近安检事件流 (复用 AlarmsView 表格模式) ===== -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>最近安检事件</span>
          <div class="header-right">
            <span class="hint">展示 security_screening 场景最近 {{ listLimit }} 条</span>
            <el-button size="small" :loading="loading" @click="loadEvents">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
          </div>
        </div>
      </template>
      <el-table :data="pagedEvents" v-loading="loading" size="small"
                :empty-text="loading ? '加载中…' : '暂无安检事件'">
        <el-table-column label="类型" min-width="180">
          <template #default="{ row }">
            <div class="type-cell">
              <span class="evt-key">{{ row.type }}</span>
              <span class="evt-name">{{ typeName(row.type) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="110">
          <template #default="{ row }">
            <span class="level-tag" :class="levelClass(row.level)">{{ levelText(row.level) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip />
        <el-table-column label="快照" width="80" align="center">
          <template #default="{ row }">
            <el-image v-if="row.snapshotUrl" :src="row.snapshotUrl"
                      :preview-src-list="[row.snapshotUrl]" fit="cover"
                      preview-teleported class="snap-thumb" />
            <template v-else><div class="snap-error">无快照</div></template>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager" v-if="events.length > listLimit">
        <el-button size="small" :disabled="listLimit >= events.length" @click="loadMore">
          加载更多 ({{ events.length - listLimit }})
        </el-button>
      </div>
    </el-card>

    <!-- ===== 详情抽屉 (复用 AlarmsView 风格) ===== -->
    <el-drawer v-model="detailVisible" :title="detailTitle" size="540px" direction="rtl">
      <div v-if="current" class="detail-body">
        <div class="kv-row"><span class="k">事件类型</span><span>{{ current.type }} · {{ typeName(current.type) }}</span></div>
        <div class="kv-row"><span class="k">级别</span><span :class="levelClass(current.level)">{{ levelText(current.level) }}</span></div>
        <div class="kv-row"><span class="k">通道</span><span>{{ current.channelId }}</span></div>
        <div class="kv-row"><span class="k">置信度</span><span>{{ current.confidence != null ? (current.confidence * 100).toFixed(0) + '%' : '-' }}</span></div>
        <div class="kv-row"><span class="k">描述</span><span>{{ current.description || '-' }}</span></div>
        <div class="kv-row"><span class="k">时间</span><span>{{ formatTime(current.createdAt) }}</span></div>
        <el-image v-if="current.snapshotUrl" :src="current.snapshotUrl"
                  :preview-src-list="[current.snapshotUrl]" fit="contain"
                  preview-teleported class="detail-snap" />
        <template v-else><div class="snap-error">快照已清理</div></template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 安检总览 — Screening Phase 2 S1-4
 * 方案: docs/security_screening_solution_plan.md §4 (动线六分区)
 * 数据: alarmApi.getList (按 scene=security_screening 事件键并集过滤)
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh, Bell, InfoFilled } from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'

// ── 动线六分区静态映射 (方案 §4 表) ──

interface ZoneAlgo {
  name: string
  status: 'green' | 'yellow' | 'red'
  note?: string
}

interface Zone {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  name: string
  status: 'ok' | 'partial' | 'gap'
  statusTag: 'success' | 'warning' | 'danger'
  statusText: string
  algos: ZoneAlgo[]
  eventCount: number
  lastEventTime: string
}

const zones = ref<Zone[]>([
  {
    id: 'A', name: '入口核验', status: 'ok', statusTag: 'success', statusText: '🟢 最强项',
    algos: [
      { name: '人证合一 1:1', status: 'green' },
      { name: '黑名单/VIP', status: 'green' },
    ],
    eventCount: 0, lastEventTime: '-'
  },
  {
    id: 'B', name: '候检排队区', status: 'partial', statusTag: 'warning', statusText: '🟡 部分',
    algos: [
      { name: '人群计数', status: 'green' },
      { name: '排队时长', status: 'yellow', note: 'stub 待真实化 (S3-6)' },
      { name: '奔跑/摔倒/打架', status: 'green' },
      { name: '插队检测', status: 'red', note: '🔴 缺 (S3-5)' },
    ],
    eventCount: 0, lastEventTime: '-'
  },
  {
    id: 'C', name: '通道/闸机', status: 'ok', statusTag: 'success', statusText: '🟢 已上线',
    algos: [
      { name: '尾随/翻越', status: 'green' },
      { name: '人包三态', status: 'yellow', note: 'S0 训练收口' },
      { name: '传递物品', status: 'red', note: '🔴 需骨架 (S3-1)' },
      { name: '闸机 IO 联动', status: 'yellow', note: 'S1-5 待接 IO' },
    ],
    eventCount: 0, lastEventTime: '-'
  },
  {
    id: 'D', name: '判图区', status: 'partial', statusTag: 'warning', statusText: '🟡 部分',
    algos: [
      { name: 'X 光判图', status: 'red', note: '🔴 S2 核心攻坚' },
      { name: '可见光外露违禁品', status: 'yellow', note: '.tmp/weapons 半成品' },
      { name: '判图员合规', status: 'yellow', note: 'symlink 真实化 S1-1' },
      { name: '复检开包溯源', status: 'yellow', note: 'personal_item + ReID 待串' },
    ],
    eventCount: 0, lastEventTime: '-'
  },
  {
    id: 'E', name: '通行拦截区', status: 'ok', statusTag: 'success', statusText: '🟢 已上线',
    algos: [
      { name: '车辆/车牌布控', status: 'green' },
      { name: '遗留物/移走物', status: 'green' },
    ],
    eventCount: 0, lastEventTime: '-'
  },
  {
    id: 'F', name: '事后追溯', status: 'partial', statusTag: 'warning', statusText: '🟡 部分',
    algos: [
      { name: '跨镜 ReID', status: 'yellow', note: 'deepsort + OSNet 待产品化 (S3-3)' },
      { name: '录像检索/轨迹回放', status: 'green' },
    ],
    eventCount: 0, lastEventTime: '-'
  },
])

// ── 安检场景事件类型 (来自 SSOT ?scene=security_screening) ──

const screeningEventTypes = ref<EventTypeMetadataItem[]>([])
const typeMap = computed(() => {
  const m: Record<string, string> = {}
  screeningEventTypes.value.forEach(t => { m[t.alarm_type] = t.display_name })
  return m
})
function typeName(key: string): string {
  return typeMap.value[key] || key
}

// ── 顶部统计卡 ──

const statCards = computed(() => {
  const total = events.value.length
  const todayEvents = events.value.filter(e => isToday(e.createdAt)).length
  const high = events.value.filter(e => e.level === 'high' || e.level === 'critical').length
  const unhandled = events.value.filter(e => e.status === 'unhandled' || e.status === 'acknowledged' || e.status === 'disposed').length
  return [
    { label: '今日安检事件', value: todayEvents, sub: `总 ${total} 条`, cls: 'val-blue' },
    { label: '高级别 (≥4)', value: high, sub: '含 critical/high', cls: 'val-red' },
    { label: '未处理', value: unhandled, sub: '需立即处置', cls: 'val-orange' },
    { label: '告警分区', value: zones.value.filter(z => z.eventCount > 0).length, sub: `共 ${zones.value.length} 个`, cls: 'val-green' },
  ]
})

function isToday(ts?: string): boolean {
  if (!ts) return false
  const d = new Date(ts)
  if (isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

// ── 事件流加载 ──

const events = ref<AlarmEvent[]>([])
const listLimit = ref(20)
const loading = ref(false)
const pagedEvents = computed(() => events.value.slice(0, listLimit.value))

async function loadEvents() {
  loading.value = true
  try {
    const resp = await alarmApi.getList({ page: 1, pageSize: 100 })
    const all = resp.data?.data?.items || []
    const screeningKeys = new Set(screeningEventTypes.value.map(t => t.alarm_type))
    events.value = all.filter((e: AlarmEvent) => screeningKeys.has(e.type))
  } catch (e) {
    console.error('[ScreeningOverview] load events failed', e)
    events.value = []
  } finally {
    loading.value = false
    loadZoneCounts()
  }
}

function loadZoneCounts() {
  // 按事件 key 前缀简单聚合 (实际生产可按 ui_group / severity 更精细)
  const zoneKeyMap: Record<string, string[]> = {
    A: ['face_blacklist', 'face_stranger', 'face_pass_vip', 'face_liveness_fail'],
    B: ['running', 'fall_detected', 'fighting', 'gathering', 'queue_length_abnormal', 'density_abnormal'],
    C: ['tailgate', 'climbing', 'intrusion', 'tripwire', 'person_with_backpack', 'unattended_baggage'],
    D: ['dangerous_item', 'weapon_detected', 'phone_call', 'smoking', 'sleep_on_duty', 'guard_absence'],
    E: ['abandoned', 'object_removal'],
    F: [],  // F 事后追溯不在事件流
  }
  zones.value.forEach(z => {
    const keys = zoneKeyMap[z.id] || []
    const count = events.value.filter(e => keys.includes(e.type)).length
    z.eventCount = count
    const latest = events.value
      .filter(e => keys.includes(e.type))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    z.lastEventTime = latest ? formatTime(latest.createdAt) : '-'
  })
}

function loadMore() {
  listLimit.value = Math.min(listLimit.value + 20, events.value.length)
}

// ── 详情抽屉 ──

const detailVisible = ref(false)
const current = ref<AlarmEvent | null>(null)
const detailTitle = computed(() => current.value ? `事件详情 · ${current.value.type}` : '事件详情')
function openDetail(row: AlarmEvent) {
  current.value = row
  detailVisible.value = true
}

// ── 工具 ──

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

// ── 初始化 ──

async function loadSceneTypes() {
  try {
    const resp = await eventTypesApi.metadata({ scene: 'security_screening' })
    const data = resp.data?.data
    if (data && data.groups) {
      const items: EventTypeMetadataItem[] = []
      Object.values(data.groups).forEach(g => g.items.forEach(i => items.push(i)))
      screeningEventTypes.value = items
    }
  } catch (e) {
    console.error('[ScreeningOverview] load scene types failed', e)
  }
}

onMounted(async () => {
  await loadSceneTypes()
  await loadEvents()
})
</script>

<style scoped>
.screening-overview { padding: 16px; }
.stat-row { margin-bottom: 16px; }
.stat-card .stat-label { color: #909399; font-size: 13px; }
.stat-card .stat-value { font-size: 28px; font-weight: 600; line-height: 36px; }
.stat-card .stat-value.val-blue { color: #1890ff; }
.stat-card .stat-value.val-red { color: #f56c6c; }
.stat-card .stat-value.val-orange { color: #e6a23c; }
.stat-card .stat-value.val-green { color: #67c23a; }
.stat-card .stat-sub { color: #909399; font-size: 12px; margin-top: 4px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header .header-right { display: flex; gap: 12px; align-items: center; }
.card-header .hint { color: #909399; font-size: 12px; }
.zone-card { margin-bottom: 16px; }
.zone-tile {
  background: #fafbfc;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid #ebeef5;
}
.zone-tile.zone-ok { border-left: 4px solid #67c23a; }
.zone-tile.zone-partial { border-left: 4px solid #e6a23c; }
.zone-tile.zone-gap { border-left: 4px solid #f56c6c; }
.zone-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.zone-id { background: #1890ff; color: #fff; border-radius: 4px; padding: 2px 8px; font-weight: 600; }
.zone-name { font-weight: 500; flex: 1; }
.zone-algos { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.algo-chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #e1f3d8;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.algo-chip.algo-yellow { background: #fdf6ec; color: #e6a23c; border-color: #faecd8; }
.algo-chip.algo-red { background: #fef0f0; color: #f56c6c; border-color: #fde2e2; }
.algo-icon { font-size: 10px; cursor: help; }
.zone-events { color: #606266; font-size: 12px; display: flex; align-items: center; gap: 6px; }
.zone-events .zone-sub { color: #909399; margin-left: 6px; }
.type-cell { display: flex; flex-direction: column; }
.evt-key { color: #909399; font-family: monospace; font-size: 12px; }
.evt-name { color: #303133; }
.level-tag { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.lv-crit { background: #fef0f0; color: #f56c6c; }
.lv-high { background: #fdf6ec; color: #e6a23c; }
.lv-med { background: #ecf5ff; color: #1890ff; }
.lv-low { background: #f0f9eb; color: #67c23a; }
.lv-info { background: #f4f4f5; color: #909399; }
.snap-thumb { width: 50px; height: 32px; border-radius: 4px; }
.snap-error { color: #c0c4cc; font-size: 12px; padding: 4px 8px; background: #f5f7fa; border-radius: 4px; }
.pager { text-align: center; padding: 12px 0 0; }
.detail-body { padding: 0 16px; }
.kv-row { display: flex; padding: 8px 0; border-bottom: 1px dashed #ebeef5; }
.kv-row .k { width: 90px; color: #909399; }
.detail-snap { width: 100%; margin-top: 12px; border-radius: 4px; }
</style>