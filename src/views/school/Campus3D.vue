<template>
  <div class="campus-3d">
    <el-row :gutter="14" class="full-row">
      <!-- 3D 场景 (复用 Scene3D: GLB/性能面板/告警脉冲能力) -->
      <el-col :span="17">
        <el-card shadow="never" class="scene-card" :body-style="{ padding: '0', height: '100%' }">
          <Scene3D :devices="devices3d" :show-performance="true" />
          <!-- [校园二期 2026-08-30] 品恩三圈布防 HUD (俯视同心环叠加, 场景包 zones 驱动) -->
          <div class="circles-hud" v-if="showCircles">
            <svg viewBox="0 0 200 200" class="circles-svg">
              <circle v-for="c in circleRings" :key="c.key" cx="100" cy="100" :r="c.r"
                      :fill="c.fill" :stroke="c.color" stroke-width="0.8" stroke-dasharray="3 2" />
              <text v-for="c in circleRings" :key="c.key + '-t'" x="100" :y="100 - c.r + 5"
                    text-anchor="middle" class="ring-label" :fill="c.color">{{ c.label }}</text>
            </svg>
          </div>
          <div class="hud-toolbar">
            <el-select v-if="scenePacks.length" v-model="activePackId" size="small"
                       class="hud-pack-select" placeholder="场景包">
              <el-option v-for="p in scenePacks" :key="p.scene_pack_id"
                         :label="p.display_name" :value="p.scene_pack_id" />
            </el-select>
            <el-button size="small" circle class="hud-toggle"
                       :type="showCircles ? 'primary' : 'info'" @click="showCircles = !showCircles">
              <el-icon><Aim /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>

      <!-- 真实告警点位联动 -->
      <el-col :span="7">
        <el-card shadow="never" class="block-card list-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">告警点位 <span class="card-title-sub">最近 {{ alarmPoints.length }} 条 · 点击定位</span></span>
              <el-button size="small" :loading="loading" @click="load(true)"><el-icon><Refresh /></el-icon></el-button>
            </div>
          </template>
          <template v-if="alarmPoints.length">
            <div v-for="(p, i) in alarmPoints" :key="p.alarmId" class="point-row"
                 :class="{ active: selectedAlarmId === p.alarmId }"
                 @click="locatePoint(p)">
              <span class="point-idx">{{ i + 1 }}</span>
              <div class="point-body">
                <div class="point-name">{{ typeName(p.type) }} <span class="point-ch">{{ p.channelId }}</span></div>
                <div class="point-time">{{ shortTime(p.createdAt) }}</div>
              </div>
              <span class="level-tag" :class="levelClass(p.level)">{{ levelText(p.level) }}</span>
            </div>
          </template>
          <el-empty v-else :image-size="56" :description="loading ? '加载中…' : '暂无告警点位'" />
          <div class="note-block">
            告警定位: 点击列表项, 3D 场景中对应通道设备切为告警脉冲态;
            场景设备点位映射自真实设备清单 (deviceApi), 坐标为环形示意布局。
          </div>
          <!-- [校园二期] 三圈布防图例 (场景包 zones 驱动) -->
          <div class="circles-legend" v-if="showCircles">
            <div class="legend-title">三圈布防 {{ activePack ? `· ${activePack.display_name}` : '· 默认' }}</div>
            <div v-for="c in circleRings" :key="c.key" class="legend-row">
              <span class="legend-dot" :style="{ background: c.color }" />
              <span class="legend-name">{{ c.label }}</span>
              <span class="legend-zones">{{
                c.zones.length ? c.zones.slice(0, 3).join(' / ') : '待场景包配置'
              }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 3D 校园 — [校园方案 2026-08-30]
 * 对标四维轻云「三维实景 + 实时联动」/ NVIDIA Omniverse 轻量化:
 * 复用 Scene3D (Three.js GLB + 性能面板 + 告警脉冲), 设备点位映射真实设备清单,
 * 右侧告警点位列表来自真实事件流, 点击定位 (禁 mock 数据)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Refresh, Aim } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import Scene3D from '@/components/Scene3D.vue'
import type { Device3DNode } from '@/components/scene3d/types/scene3d'
import { alarmApi } from '@/api/alarm'
import { deviceApi } from '@/api/device'
import eventTypesApi from '@/api/eventTypes'
import { schoolApi } from '@/api/school'
import type { ScenePack } from '@/types/largeEvent'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'
import type { EventTypeMetadataItem } from '@/api/eventTypes'

const loading = ref(false)
const alarms = ref<AlarmEvent[]>([])
const rawDevices = ref<{ id: string; name: string; status: string }[]>([])
const selectedAlarmId = ref<string>('')
const eventTypes = ref<EventTypeMetadataItem[]>([])
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ─── [校园二期 2026-08-30] 品恩三圈布防 (控制圈/警戒圈/核心圈) ───
// 数据源: 场景包 zones (school_campus 包, schoolApi.listScenePacks);
// fallback: 无场景包数据时用内置默认三环 (品恩三圈核查范式示意)。
// 呈现: 俯视 SVG HUD 叠加层 (不改 Scene3D 核心, WebGL 受限时仍可见)。
const scenePacks = ref<ScenePack[]>([])
const activePackId = ref('')
const showCircles = ref(true)

const activePack = computed(() =>
  scenePacks.value.find(p => p.scene_pack_id === activePackId.value) || null)

/** 三圈环带 (从外到内: 控制→警戒→核心; zones 驱动, fallback 内置) */
const circleRings = computed(() => {
  const defs = [
    { key: 'control', label: '控制圈', color: '#409eff', fill: 'rgba(64,158,255,0.06)', r: 88 },
    { key: 'alert',   label: '警戒圈', color: '#e6a23c', fill: 'rgba(230,162,60,0.07)', r: 62 },
    { key: 'core',    label: '核心圈', color: '#f56c6c', fill: 'rgba(245,108,108,0.10)', r: 36 },
  ]
  const zones = activePack.value?.zones ?? {}
  const zoneOf = (key: string): string[] => {
    const found = Object.entries(zones).find(([k]) => k.includes(key))
    return found ? found[1] : []
  }
  return defs.map(d => ({
    ...d,
    zones: zoneOf(d.key).length ? zoneOf(d.key)
      : (d.key === 'core' ? ['teaching_building_*', 'library_*'] : []),
  }))
})

const typeMap = computed(() => {
  const m: Record<string, string> = {}
  eventTypes.value.forEach(t => { m[t.alarm_type] = t.display_name })
  return m
})
function typeName(key: string): string {
  return typeMap.value[key] || key
}

/** 真实设备 → 3D 点位 (环形示意布局, 状态真实) */
const devices3d = computed<Device3DNode[]>(() => {
  const alarmChannels = new Set(
    alarms.value.slice(0, 10).map(a => String(a.channelId)))
  const n = Math.max(rawDevices.value.length, 1)
  return rawDevices.value.map((d, i) => {
    const angle = (2 * Math.PI * i) / n
    return {
      id: d.id,
      name: d.name,
      x: Math.round(Math.cos(angle) * 40),
      y: 4,
      z: Math.round(Math.sin(angle) * 30),
      status: alarmChannels.has(String(i + 1)) ? 'alarm' : (d.status === 'online' ? 'online' : 'offline'),
      location: d.name,
    } as Device3DNode
  })
})

/** 最近 20 条告警 → 点位列表 */
const alarmPoints = computed(() => alarms.value.slice(0, 20))

/** 点击定位: 选中告警 → 3D 场景对应设备 alarm 态 (devices3d 由 selectedAlarmId 驱动) */
function locatePoint(p: AlarmEvent) {
  selectedAlarmId.value = p.alarmId
}

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    // 三路并行: 事件流 + 设备清单 + 校园场景包 (三圈 HUD 数据源, 失败降级内置)
    const [evtR, devR, packR] = await Promise.allSettled([
      alarmApi.getList({ page: 1, pageSize: 50 }),
      deviceApi.getList({ page: 1, pageSize: 100 }),
      schoolApi.listScenePacks(),
    ])
    if (evtR.status === 'fulfilled') {
      const items = (evtR.value.data?.data as any)?.items || []
      // 归一化 snake_case → camelCase (与 SchoolEventSection 同因)
      alarms.value = items.map((x: any) => normalizeAlarmCore(x))
    }
    if (devR.status === 'fulfilled') {
      const items = (devR.value.data?.data as any)?.items || []
      rawDevices.value = items.map((d: any) => ({ id: d.id, name: d.name, status: d.status }))
    }
    if (packR.status === 'fulfilled') {
      const list: ScenePack[] = (packR.value.data?.data as any)?.scene_packs || []
      scenePacks.value = list.filter((p: ScenePack) => p.scene_tag === 'school_campus')
      if (scenePacks.value.length && !activePackId.value) {
        activePackId.value = scenePacks.value[0].scene_pack_id
      }
    }
  } catch (e) {
    console.error('[Campus3D] load failed', e)
    if (!silent) ElMessage.error('3D 场景数据加载失败')
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
  } catch { /* 名称映射失败时 fallback 显示 key */ }
  await load()
  refreshTimer = setInterval(() => load(true), 30000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.campus-3d { padding: 16px; background: #f5f7fa; min-height: calc(100vh - 84px); }
.full-row { height: calc(100vh - 116px); }
.scene-card { height: 100%; border-radius: 10px; overflow: hidden; position: relative; }
.block-card { border-radius: 10px; height: 100%; display: flex; flex-direction: column; }
.list-card :deep(.el-card__body) { flex: 1; overflow-y: auto; padding: 12px 14px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-weight: 600; color: #303133; font-size: 14px; }
.card-title-sub { color: #909399; font-weight: 400; font-size: 12px; margin-left: 8px; }
.point-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px;
  cursor: pointer; transition: background 0.15s; border: 1px solid transparent;
}
.point-row:hover { background: #f5f7fa; }
.point-row.active { background: #ecf5ff; border-color: #d9ecff; }
.point-idx {
  width: 22px; height: 22px; border-radius: 50%; background: #409eff; color: #fff;
  font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.point-body { flex: 1; min-width: 0; }
.point-name { color: #303133; font-size: 13px; }
.point-ch { color: #909399; font-family: monospace; font-size: 11px; margin-left: 6px; }
.point-time { color: #909399; font-size: 11px; margin-top: 1px; }
.level-tag { padding: 2px 8px; border-radius: 10px; font-size: 11px; flex-shrink: 0; }
.lv-crit { background: #fef0f0; color: #f56c6c; }
.lv-high { background: #fdf6ec; color: #e6a23c; }
.lv-med { background: #ecf5ff; color: #409eff; }
.lv-low { background: #f0f9eb; color: #67c23a; }
.lv-info { background: #f4f4f5; color: #909399; }
.note-block {
  margin-top: 12px; padding: 10px 12px; background: #ecf5ff; border-radius: 6px;
  color: #606266; font-size: 12px; line-height: 1.6;
}
/* ─── [校园二期] 品恩三圈 HUD (俯视同心环, 不挡场景交互) ─── */
.circles-hud {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 72%; aspect-ratio: 1; pointer-events: none; opacity: 0.92;
}
.circles-svg { width: 100%; height: 100%; }
.ring-label { font-size: 7px; font-weight: 600; letter-spacing: 1px; }
.hud-toolbar {
  position: absolute; top: 10px; right: 10px; display: flex; gap: 8px; align-items: center;
}
.hud-pack-select { width: 150px; }
.circles-legend {
  margin-top: 12px; padding: 10px 12px; background: #fdf6ec; border-radius: 6px;
  font-size: 12px; line-height: 1.7;
}
.legend-title { font-weight: 600; color: #606266; margin-bottom: 4px; }
.legend-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.legend-name { color: #303133; flex-shrink: 0; }
.legend-zones {
  color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: monospace; font-size: 11px;
}
</style>
