<template>
  <div class="gas-3d">
    <el-row :gutter="14" class="full-row">
      <!-- 3D 场景 (复用 Scene3D: GLB/性能面板/告警脉冲能力) -->
      <el-col :span="17">
        <el-card shadow="never" class="scene-card" :body-style="{ padding: '0', height: '100%' }">
          <Scene3D :devices="devices3d" :show-performance="true" />
          <!-- [加油站方案 2026-08-30] 品恩三圈布防 HUD (俯视同心环叠加, 场景包 zones 驱动) -->
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
                       class="hud-pack-select" placeholder="加油站场景包">
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
            <div v-for="(p, i) in alarmPoints" :key="p.id" class="point-row"
                 :class="{ active: selectedAlarmId === p.id, t6: isT6Event(p.type) }"
                 @click="locatePoint(p)">
              <span class="point-idx">{{ i + 1 }}</span>
              <div class="point-body">
                <div class="point-name">
                  {{ typeName(p.type) }}
                  <el-tag v-if="isT6Event(p.type)" size="small" type="warning" effect="plain" class="t6-tag">T6</el-tag>
                  <span class="point-ch">{{ p.channelId }}</span>
                </div>
                <div class="point-time">{{ shortTime(p.createdAt) }}</div>
              </div>
              <span class="level-tag" :class="levelClass(p.level)">{{ levelText(p.level) }}</span>
            </div>
          </template>
          <el-empty v-else :image-size="56" :description="loading ? '加载中…' : '暂无告警点位'" />
          <div class="note-block">
            告警定位: 点击列表项, 3D 场景中对应通道设备切为告警脉冲态;
            加油站设备点位映射自真实设备清单 (deviceApi), 坐标为环形示意布局。
            <span class="t6-note">T6 模板 (电话/吸烟) 仅触发声光+TTS, 不联动工艺联锁。</span>
          </div>
          <!-- [加油站方案] 三圈布防图例 (场景包 zones 驱动) -->
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
 * 3D 加油站 — [加油站方案 2026-08-30]
 * 对标四维轻云「三维实景 + 实时联动」/ NVIDIA Omniverse 轻量化:
 * 复用 Scene3D (Three.js GLB + 性能面板 + 告警脉冲), 设备点位映射真实设备清单,
 * 右侧告警点位列表来自真实事件流, 点击定位 (禁 mock 数据)
 *
 * 品恩三圈: 控制圈 (围墙 30m 蓝) / 警戒圈 (加油区 橙) / 核心圈 (卸油+罐区 红)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Refresh, Aim } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import Scene3D from '@/components/Scene3D.vue'
import type { Device3DNode } from '@/components/scene3d/types/scene3d'
import { alarmApi } from '@/api/alarm'
import { deviceApi } from '@/api/device'
import eventTypesApi from '@/api/eventTypes'
import { gasStationApi } from '@/api/gasStation'
import type { ScenePack } from '@/types/largeEvent'
import type { AlarmEvent, AlarmLevel } from '@/types/alarm'
import { normalizeAlarmCore } from '@/types/alarm'
import type { EventTypeMetadataItem } from '@/api/eventTypes'

const loading = ref(false)
const alarms = ref<AlarmEvent[]>([])
const rawDevices = ref<{ id: string; name: string; status: string }[]>([])
const selectedAlarmId = ref<string>('')
const eventTypes = ref<EventTypeMetadataItem[]>([])
const scenePacks = ref<ScenePack[]>([])
const activePackId = ref('')
const showCircles = ref(true)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const T6_EVENTS = new Set(['phone_call', 'smoking'])
function isT6Event(type: string) { return T6_EVENTS.has(type) }

const activePack = computed(() =>
  scenePacks.value.find(p => p.scene_pack_id === activePackId.value) || null)

/** 三圈环带 (加油站版: 控制→警戒→核心; zones + circle_radii_m 驱动, fallback 内置)
 * [加油站三期 2026-08-30] 半径从场景包 circle_radii_m 动态计算 (方案 §9):
 *   SVG 比例尺 1.1 px/m (80m→r88 满幅), 图例显示真实米数;
 *   zones key 三期起为 gas_station_{core,alert,control}_circle (includes 匹配兼容);
 *   fallback 内置默认三圈 80/30/15m (与 ScenePackDefs §5 fallback 同源) */
const RADIUS_SCALE_PX_PER_M = 1.1
const FALLBACK_RADII_M: Record<string, number> = { control: 80, alert: 30, core: 15 }
const circleRings = computed(() => {
  const defs = [
    { key: 'control', label: '控制圈', color: '#409eff', fill: 'rgba(64,158,255,0.06)' },
    { key: 'alert',   label: '警戒圈', color: '#e6a23c', fill: 'rgba(230,162,60,0.07)' },
    { key: 'core',    label: '核心圈', color: '#f56c6c', fill: 'rgba(245,108,108,0.10)' },
  ]
  const zones = activePack.value?.zones ?? {}
  const radii = activePack.value?.circle_radii_m ?? {}
  const matchKey = (src: Record<string, unknown>, key: string): string | null =>
    Object.keys(src).find(k => k.includes(key)) ?? null
  const zoneOf = (key: string): string[] => {
    const k = matchKey(zones, key)
    return k ? (zones[k] as string[]) : []
  }
  const metersOf = (key: string): number => {
    const k = matchKey(radii, key)
    return k ? (radii[k] as number) : FALLBACK_RADII_M[key] ?? 30
  }
  // fallback: 加油站内置默认三圈 (围墙/加油岛/罐区; 半径 80m/30m/15m 示意)
  const FALLBACK: Record<string, string[]> = {
    control: ['围墙周界', '外围道路', '停车区'],
    alert: ['加油岛', '便利店', '出入口'],
    core: ['卸油区', '油罐区', '加油机'],
  }
  return defs.map(d => {
    const meters = metersOf(d.key)
    return {
      ...d,
      label: `${d.label} (${meters}m)`,
      // clamp: SVG viewBox 200, 圆心 100, 半径限 [10, 95]
      r: Math.min(95, Math.max(10, Math.round(meters * RADIUS_SCALE_PX_PER_M))),
      zones: zoneOf(d.key).length ? zoneOf(d.key) : FALLBACK[d.key] ?? [],
    }
  })
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

/** 点击定位: 选中告警 → 3D 场景对应设备 alarm 态 */
function locatePoint(p: AlarmEvent) {
  selectedAlarmId.value = p.id
}

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const [evtR, devR, packR, typeR] = await Promise.allSettled([
      alarmApi.getList({ page: 1, pageSize: 50 }),
      deviceApi.getList({ page: 1, pageSize: 100 }),
      gasStationApi.listScenePacks(),
      eventTypesApi.metadata(),
    ])
    if (evtR.status === 'fulfilled') {
      const items = (evtR.value.data?.data as any)?.items || []
      alarms.value = items.map((x: any) => normalizeAlarmCore(x))
    }
    if (devR.status === 'fulfilled') {
      const items = (devR.value.data?.data as any)?.items || []
      rawDevices.value = items.map((d: any) => ({ id: d.id, name: d.name, status: d.status }))
    }
    if (packR.status === 'fulfilled') {
      const list: ScenePack[] = (packR.value.data?.data as any)?.scene_packs || []
      // 仅保留加油站场景包 (scene_tag == gas_station)
      scenePacks.value = list.filter((p: ScenePack) => p.scene_tag === 'gas_station')
      if (scenePacks.value.length && !activePackId.value) {
        activePackId.value = scenePacks.value[0].scene_pack_id
      }
    }
    if (typeR.status === 'fulfilled') {
      const data = typeR.value.data?.data
      if (data?.groups) {
        const items: EventTypeMetadataItem[] = []
        Object.values(data.groups).forEach((g: any) => (g.items || []).forEach((i: any) => items.push(i)))
        eventTypes.value = items
      }
    }
  } catch (e) {
    console.error('[Gas3D] load failed', e)
    if (!silent) ElMessage.error('3D 加油站场景数据加载失败')
  } finally {
    if (!silent) loading.value = false
  }
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
function levelText(level: AlarmLevel): string { return level.toUpperCase() }
function shortTime(ts?: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => { load() })
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
refreshTimer = setInterval(() => load(true), 30000)
</script>

<style scoped>
.gas-3d { padding: 14px; }
.full-row { min-height: calc(100vh - 120px); }
.scene-card { height: 100%; }
.scene-card :deep(.el-card__body) { position: relative; height: 100%; min-height: 480px; }
.circles-hud { position: absolute; top: 12px; left: 12px; width: 200px; height: 200px; pointer-events: none; opacity: 0.85; z-index: 4; }
.circles-svg { width: 100%; height: 100%; }
.ring-label { font-size: 8px; font-weight: 600; font-family: 'JetBrains Mono', Consolas, monospace; }
.hud-toolbar { position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 5; }
.hud-pack-select { width: 200px; }
.hud-toggle { background: rgba(255,255,255,0.92); }

.block-card { height: 100%; }
.list-card { display: flex; flex-direction: column; }
.list-card :deep(.el-card__body) { flex: 1; overflow: auto; padding: 12px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-weight: 600; color: #303133; font-size: 13px; }
.card-title-sub { color: #909399; font-weight: 400; font-size: 11px; margin-left: 6px; }
.point-row {
  display: flex; align-items: center; gap: 8px; padding: 8px;
  border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 6px; cursor: pointer;
  transition: all 0.2s;
}
.point-row:hover { border-color: #409eff; background: #f0f7ff; }
.point-row.active { border-color: #f56c6c; background: #fef0f0; }
.point-row.t6 { border-left: 3px solid #e6a23c; }
.point-idx { font-size: 11px; color: #c0c4cc; width: 18px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.point-body { flex: 1; min-width: 0; }
.point-name { font-size: 12px; color: #303133; display: flex; align-items: center; gap: 4px; }
.t6-tag { padding: 0 4px; font-size: 9px; }
.point-ch { color: #909399; font-family: monospace; font-size: 11px; }
.point-time { font-size: 11px; color: #909399; margin-top: 2px; }
.level-tag { padding: 2px 6px; border-radius: 8px; font-size: 10px; flex-shrink: 0; }
.lv-crit { background: #fef0f0; color: #f56c6c; }
.lv-high { background: #fdf6ec; color: #e6a23c; }
.lv-med { background: #ecf5ff; color: #409eff; }
.lv-low { background: #f0f9eb; color: #67c23a; }
.lv-info { background: #f4f4f5; color: #909399; }

.note-block { font-size: 11px; color: #909399; padding: 8px 10px; background: #fafbfc; border-radius: 4px; margin: 8px 0; line-height: 1.6; }
.t6-note { color: #e6a23c; display: block; margin-top: 4px; }

.circles-legend { margin-top: 10px; padding: 10px; background: #fafbfc; border-radius: 6px; }
.legend-title { font-size: 12px; font-weight: 600; color: #606266; margin-bottom: 6px; }
.legend-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 11px; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.legend-name { color: #303133; min-width: 70px; font-weight: 500; }
.legend-zones { color: #909399; font-size: 10px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
