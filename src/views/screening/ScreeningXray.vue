<template>
  <div class="screening-xray">
    <!-- ===== 合规声明 (民航 MH/T 红线) ===== -->
    <el-alert
      type="warning"
      :title="complianceTitle"
      :description="complianceDesc"
      :closable="false"
      show-icon
      class="compliance-alert"
    />

    <!-- ===== S2 路线进度卡 (9 步) ===== -->
    <el-card shadow="never" class="roadmap-card">
      <template #header>
        <div class="card-header">
          <span>X 光判图 v1 — S2 路线 (公开数据集先行)</span>
          <el-tag type="info" effect="light">{{ completedCount }} / 9 完成</el-tag>
        </div>
      </template>
      <el-steps :active="completedCount" finish-status="success" direction="horizontal" simple>
        <el-step v-for="(s, idx) in roadmap" :key="idx" :title="s.code" :description="s.title" />
      </el-steps>
      <el-collapse v-model="expandedSteps" class="roadmap-detail">
        <el-collapse-item v-for="(s, idx) in roadmap" :key="idx" :name="String(idx)">
          <template #title>
            <span class="step-code">{{ s.code }}</span>
            <span class="step-title">{{ s.title }}</span>
            <el-tag size="small" :type="s.statusTag" effect="light" class="step-status">{{ s.statusText }}</el-tag>
          </template>
          <div class="step-desc">{{ s.desc }}</div>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <!-- ===== 现有违禁品告警流 ===== -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>违禁品告警 (dangerous_item / weapon_detected)</span>
          <div class="header-right">
            <span class="hint">判图员需人工复核, AI 仅辅助</span>
            <el-button size="small" :loading="loading" @click="loadEvents">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
          </div>
        </div>
      </template>
      <el-table :data="displayedEvents" v-loading="loading" size="small"
                :empty-text="loading ? '加载中…' : '暂无违禁品告警'">
        <el-table-column label="类型" min-width="170">
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
        <el-table-column prop="channelId" label="通道" width="80" align="center" />
        <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip />
        <el-table-column label="快照" width="90" align="center">
          <template #default="{ row }">
            <el-image v-if="row.snapshotUrl" :src="row.snapshotUrl"
                      :preview-src-list="[row.snapshotUrl]" fit="cover"
                      preview-teleported class="snap-thumb" />
            <template v-else><div class="snap-error">快照已清理</div></template>
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
  </div>
</template>

<script setup lang="ts">
/**
 * 判图辅助 — Screening Phase 2 S1-4 (S2 路线状态卡)
 * 方案: docs/security_screening_solution_plan.md §5 S2
 * 合规: AI 辅助提示, 决定权在判图员 (民航 MH/T 红线, 方案 §7)
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { alarmApi } from '@/api/alarm'
import eventTypesApi from '@/api/eventTypes'
import type { EventTypeMetadataItem } from '@/api/eventTypes'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'

// ── 合规声明 ──

const complianceTitle = 'AI 辅助提示, 决定权在判图员'
const complianceDesc = '本模块严格遵守民航 MH/T 等安检合规红线 — 所有 AI 输出仅为辅助提示, 最终处置权由现场判图员行使。判图员复核时须结合 X 光原图、热区置信度、上下文事件综合判断, 不得因 AI 高置信度结果跳过人工复核步骤。'

// ── S2 路线卡 (方案 §5 S2 段, 9 步) ──

interface RoadmapStep {
  code: string
  title: string
  desc: string
  status: 'done' | 'pending' | 'partial'
  statusText: string
  statusTag: 'success' | 'info' | 'warning'
}

const roadmap = ref<RoadmapStep[]>([
  { code: 'S2-1', title: '可见光数据集', desc: '合并 .tmp/weapons (OD-WeaponDetection Knife) + SIXray 可见光子集', status: 'partial', statusText: '🟡 部分', statusTag: 'warning' },
  { code: 'S2-2', title: 'YOLO26s 6 类训练', desc: '刀/枪/斧/剪刀/锤/棍, mAP50 ≥ 0.75', status: 'pending', statusText: '⚪ 待启动', statusTag: 'info' },
  { code: 'S2-3', title: 'INT8 + dangerous_item 真实化', desc: '复用 yolo26s 推理链, AlgoInferenceHelper 类名注入', status: 'pending', statusText: '⚪ 待启动', statusTag: 'info' },
  { code: 'S2-4', title: 'X 光数据集清洗', desc: 'SIXray 100 万张 + PIDray 细类全', status: 'pending', statusText: '⚪ 待启动', statusTag: 'info' },
  { code: 'S2-5', title: 'YOLO26s-Xray 8 类训练', desc: '枪/刀/钳/剪刀/锤/压力罐/液体/打火机, mAP50 ≥ 0.75', status: 'pending', statusText: '⚪ 待启动', statusTag: 'info' },
  { code: 'S2-6', title: 'shield.algo.security.xray_screening 插件', desc: 'AlgoRegistry + SSOT 双注册', status: 'pending', statusText: '⚪ 待启动', statusTag: 'info' },
  { code: 'S2-7', title: 'X 光机抓图接入', desc: '目录监视/SDK 适配层, 抓图→判图→WS ≤ 2s', status: 'pending', statusText: '⚪ 待启动', statusTag: 'info' },
  { code: 'S2-8', title: '判图辅助 UI 双屏', desc: '原图 + 热区 + 置信度, 判图员操作走查', status: 'pending', statusText: '⚪ 待启动', statusTag: 'info' },
  { code: 'S2-9', title: 'VLM 研判兜底', desc: 'conf 0.4-0.7 帧送 MiniCPM, 误报率下降 ≥ 30%', status: 'pending', statusText: '⚪ 待启动', statusTag: 'info' },
])

const completedCount = computed(() =>
  roadmap.value.filter(s => s.status === 'done').length
)

const expandedSteps = ref<string[]>([])

// ── 现有违禁品告警 ──

const events = ref<AlarmEvent[]>([])
const listLimit = ref(20)
const loading = ref(false)
const displayedEvents = computed(() => events.value.slice(0, listLimit.value))

const screeningEventTypes = ref<EventTypeMetadataItem[]>([])
const typeMap = computed(() => {
  const m: Record<string, string> = {}
  screeningEventTypes.value.forEach(t => { m[t.alarm_type] = t.display_name })
  return m
})
function typeName(key: string): string {
  return typeMap.value[key] || key
}

async function loadEvents() {
  loading.value = true
  try {
    const resp = await alarmApi.getList({ page: 1, pageSize: 100 })
    const all = resp.data?.data?.items || []
    const targetKeys = new Set(['dangerous_item', 'weapon_detected'])
    const sceneKeys = new Set(screeningEventTypes.value.map(t => t.alarm_type))
    events.value = all.filter((e: AlarmEvent) =>
      sceneKeys.has(e.type) && targetKeys.has(e.type)
    )
  } catch (e) {
    console.error('[ScreeningXray] load events failed', e)
    events.value = []
  } finally {
    loading.value = false
  }
}

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
    console.error('[ScreeningXray] load scene types failed', e)
  }
}

function loadMore() { listLimit.value = Math.min(listLimit.value + 20, events.value.length) }

// ── 工具 (对齐 AlarmEvent 类型: level 为 AlarmLevel 字符串枚举, createdAt 为 string) ──

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

onMounted(async () => {
  await loadSceneTypes()
  await loadEvents()
})
</script>

<style scoped>
.screening-xray { padding: 16px; }
.compliance-alert { margin-bottom: 16px; }
.roadmap-card { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header .header-right { display: flex; gap: 12px; align-items: center; }
.card-header .hint { color: #909399; font-size: 12px; }
.roadmap-detail { margin-top: 16px; }
.roadmap-detail :deep(.el-collapse-item__header) { padding-left: 12px; }
.step-code { font-family: monospace; color: #909399; margin-right: 12px; font-weight: 600; }
.step-title { font-weight: 500; margin-right: 12px; }
.step-status { margin-left: auto; }
.step-desc { color: #606266; font-size: 13px; line-height: 1.6; padding: 4px 12px 12px; }

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
</style>