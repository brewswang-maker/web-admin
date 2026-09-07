<template>
  <el-dialog
    :model-value="!!binding"
    title=""
    width="760px"
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    class="ddd-dialog"
    @update:model-value="onVisibleChange"
  >
    <!-- :key 设备切换强制重建子树: 播放器/录像/告警全重置, 不残留上一设备数据 -->
    <div v-if="binding" :key="binding.channel_id" class="ddd" :data-ch="binding.channel_id">
      <!-- ═══ 头部: 图标 + 名称 + 类型 + 在线状态 + 平面图位置 (海康设备详情头卡对标) ═══ -->
      <div class="ddd-head">
        <svg class="ddd-head__icon" viewBox="0 0 24 24" width="38" height="38" aria-hidden="true">
          <circle cx="12" cy="12" r="11" :fill="deviceIconMeta(binding.device_type).color" />
          <path :d="deviceIconMeta(binding.device_type).path" fill="#fff" />
        </svg>
        <div class="ddd-head__main">
          <div class="ddd-head__name-line">
            <span class="ddd-head__name">{{ deviceName }}</span>
            <span v-if="binding.is_primary" class="ddd-head__primary" title="主平面图">★ 主图</span>
            <el-tag size="small" effect="dark" :color="deviceIconMeta(binding.device_type).color" style="border:none">{{ deviceTypeLabel(binding.device_type) }}</el-tag>
          </div>
          <div class="ddd-head__meta-line">
            <span class="ddd-head__ch" :title="binding.channel_id">{{ isCamera ? '通道' : '编号' }}: {{ binding.channel_id }}</span>
            <span class="ddd-head__sep">|</span>
            <span class="ddd-head__status" :class="isOnline === null ? 'is-unknown' : isOnline ? 'is-online' : 'is-offline'">
              <i />{{ isOnline === null ? '状态未知' : isOnline ? '在线' : '离线' }}
            </span>
            <span class="ddd-head__sep">|</span>
            <span class="ddd-head__pos" :title="`归一化 (${binding.pos_x.toFixed(3)}, ${binding.pos_y.toFixed(3)})`">
              位置: {{ mapLabel || '未命名平面图' }} ({{ Math.round(binding.pos_x * 100) }}%, {{ Math.round(binding.pos_y * 100) }}%)
            </span>
          </div>
        </div>
        <div v-if="isCamera" class="ddd-head__stream">
          <el-radio-group v-model="streamType" size="small" @change="onStreamTypeChange">
            <el-radio-button value="main">主码流</el-radio-button>
            <el-radio-button value="sub">子码流</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- ═══ 非视频设备: 暂不支持实时视频提示 + 控制能力缺口说明 (实事求是, 不放假按钮) ═══ -->
      <div v-if="!isCamera" class="ddd-novideo">
        <div class="ddd-novideo__banner">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 6l16 12M20 6L4 18" stroke="currentColor" stroke-width="2"/></svg>
          <span>该设备暂不支持实时视频</span>
        </div>
        <div class="ddd-novideo__ops">
          <div class="ddd-novideo__op">
            <span class="ddd-novideo__op-name">设备控制 (门禁开锁 / 广播触发等)</span>
            <el-tag size="small" type="info" effect="plain">当前版本暂不支持</el-tag>
          </div>
          <div class="ddd-novideo__op">
            <span class="ddd-novideo__op-name">状态刷新</span>
            <el-button size="small" :loading="metaLoading" @click="loadMeta(true)">刷新</el-button>
          </div>
        </div>
      </div>

      <!-- ═══ Tabs: 视频设备 (预览/录像/告警) · 非视频设备 (仅告警) ═══ -->
      <el-tabs v-model="activeTab" class="ddd-tabs">
        <el-tab-pane v-if="isCamera" label="实时预览" name="preview">
          <!-- 通道离线: 不拉流直接占位 (避免无效 INVITE); 未知状态照常拉流由播放器报错 -->
          <div v-if="isOnline === false" class="ddd-player-state ddd-player-state--offline">
            <svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="10" fill="none" stroke="#5F7699" stroke-width="2"/><path d="M8 8l8 8M16 8l-8 8" stroke="#5F7699" stroke-width="2" stroke-linecap="round"/></svg>
            <span>通道离线, 无法获取实时视频</span>
            <el-button size="small" :loading="metaLoading" @click="loadMeta(true)">刷新状态</el-button>
          </div>
          <template v-else>
            <!-- :key 含码流类型 → 切换码流重建播放器 (GB INVITE 换流) -->
            <MiniPlayer
              :key="binding.channel_id + ':' + streamType"
              :channel-id="bareChannelId"
              :stream-type="streamType"
              :visible="activeTab === 'preview'"
              aspect-ratio="16:9"
              @error="onPlayerError"
            />
            <div v-if="playerFatal" class="ddd-player-fatal">{{ playerFatal }}</div>
          </template>
        </el-tab-pane>

        <el-tab-pane v-if="isCamera" label="录像回放" name="playback">
          <div class="ddd-rec-toolbar">
            <el-date-picker v-model="recDate" type="date" value-format="YYYY-MM-DD" :clearable="false" size="small" style="width: 150px" />
            <el-button size="small" type="primary" :loading="recLoading" @click="queryRec">查询录像</el-button>
            <span class="ddd-rec-tip">按日查询 GB28181 设备录像</span>
          </div>
          <div v-if="!recDeviceId && !recLoading" class="ddd-rec-nodevice">未找到该通道归属设备 (device_id), 无法查询录像</div>
          <template v-else>
            <div v-if="recLoading" class="ddd-rec-state"><el-icon class="is-loading"><Loading /></el-icon> 正在查询录像…</div>
            <div v-else-if="recError" class="ddd-rec-state ddd-rec-state--error">
              <span>{{ recError }}</span>
              <el-button size="small" @click="queryRec">重试</el-button>
            </div>
            <div v-else-if="!recordings.length" class="ddd-rec-state">该日期暂无录像</div>
            <div v-else class="ddd-rec-list">
              <div
                v-for="r in recordings" :key="r.id"
                class="ddd-rec-item"
                :class="{ 'is-active': activeRec?.id === r.id }"
                @click="playRec(r)"
              >
                <span class="ddd-rec-item__time">{{ timeOf(r.start_time) }} - {{ timeOf(r.end_time) }}</span>
                <span class="ddd-rec-item__size">{{ r.file_size ? (r.file_size / 1048576).toFixed(1) + 'MB' : '' }}</span>
                <el-button size="small" :type="activeRec?.id === r.id ? 'primary' : ''" plain>播放</el-button>
              </div>
            </div>
          </template>
          <!-- 回放播放区: flv.js isLive:false 点播语义 (RecordingView 同款) -->
          <div v-if="playUrl" class="ddd-rec-player">
            <video ref="recVideoRef" muted autoplay playsinline controls class="ddd-rec-player__video" />
            <div class="ddd-rec-player__bar">
              <el-button size="small" @click="toggleRecPlay">{{ recPaused ? '▶ 继续' : '⏸ 暂停' }}</el-button>
              <el-button size="small" type="danger" plain @click="stopRec()">■ 停止</el-button>
              <span class="ddd-rec-player__hint">倍速 / 下载: 当前版本暂不支持</span>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="历史告警" name="alarms">
          <div class="ddd-alarm-toolbar">
            <el-date-picker
              v-model="alarmRange" type="datetimerange" size="small" range-separator="~"
              start-placeholder="开始时间" end-placeholder="结束时间" value-format="YYYY-MM-DD HH:mm:ss"
              style="width: 340px"
            />
            <el-select v-model="alarmLevel" size="small" clearable placeholder="级别" style="width: 110px">
              <el-option value="critical" label="严重" />
              <el-option value="high" label="高危" />
              <el-option value="medium" label="中危" />
              <el-option value="low" label="低危" />
            </el-select>
            <el-button size="small" type="primary" :loading="alarmLoading" @click="fetchAlarms(1)">查询</el-button>
            <span class="ddd-alarm-filter-hint">开始时间/通道为后端过滤 · 结束时间与级别为当前页内过滤</span>
          </div>
          <div v-if="alarmLoading" class="ddd-alarm-state"><el-icon class="is-loading"><Loading /></el-icon> 正在加载…</div>
          <div v-else-if="alarmError" class="ddd-alarm-state ddd-alarm-state--error">
            <span>{{ alarmError }}</span>
            <el-button size="small" @click="fetchAlarms(1)">重试</el-button>
          </div>
          <div v-else-if="!alarms.length" class="ddd-alarm-state">该设备暂无历史告警</div>
          <template v-else>
            <div class="ddd-alarm-list">
              <div v-for="a in alarms" :key="a.id" class="ddd-alarm-item" @click="openAlarmDetail(a)">
                <img v-if="a.snapshotUrl" class="ddd-alarm-item__snap" :src="a.snapshotUrl" alt="" loading="lazy" />
                <div v-else class="ddd-alarm-item__snap ddd-alarm-item__snap--empty">无图</div>
                <div class="ddd-alarm-item__body">
                  <div class="ddd-alarm-item__line1">
                    <span class="ddd-alarm-item__type">{{ typeNameOf(a) }}</span>
                    <span class="ddd-alarm-item__level" :class="`is-${a.level}`">{{ levelLabel(a.level) }}</span>
                    <span class="ddd-alarm-item__status" :class="`is-${a.status}`">{{ statusLabel(a.status) }}</span>
                  </div>
                  <div class="ddd-alarm-item__line2">{{ timeOf(a.createdAt) }}</div>
                </div>
              </div>
            </div>
            <div class="ddd-alarm-pager">
              <el-pagination
                small background layout="total, prev, pager, next"
                :total="alarmTotal" :page-size="ALARM_PAGE_SIZE"
                :current-page="alarmPage" @current-change="(p: number) => fetchAlarms(p)"
              />
            </div>
          </template>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * DeviceDetailDialog.vue — 平面图设备详情弹窗 (统一消费入口)
 *
 * [FLOOR-MAP 2026-09-05 v5] 首页态势屏 / 定位页室内平面图共用 (华为 iVMS 点位详情对标):
 *   - 视频设备 (camera): 实时预览 (MiniPlayer GB28181 主/子码流) + 录像查询回放
 *     (POST /recordings/query + /:id/play, flv.js isLive:false 点播 — RecordingView 同款)
 *     + 历史告警 (GET /alarms channelId+时间+分页, 点击行复用全局 AlarmPopup 详情)
 *   - 非视频设备 (门禁/烟感/雷达/紧急按钮/广播/RFID/温湿度): 基础信息 + 在线状态 +
 *     历史告警; 实时视频与设备控制显示「暂不支持」占位 — 后端无控制端点, 不放假按钮
 *   - 设备切换: :key=channel_id 强制重建子树, 播放器/录像/告警全重置不串设备
 *   - 资源释放: el-dialog destroy-on-close + MiniPlayer 自销毁 + 回放 flv/hls 实例
 *     onBeforeUnmount 销毁 — 关闭/切设备/离开页面即停流
 *
 * 数据契约 (全部真实接口, 零 mock):
 *   channelApi.getList  → 通道元数据 (name/deviceId/status) 模块级 60s 缓存双页共享
 *   queryRecordings     → {device_id, channel_id, start_time, end_time} → 段列表
 *   recordingHttp /play → urls {wsFlv, flv, hls} → flv.js / hls.js / 原生 video
 *   alarmApi.getList    → {channelId, start_ms, end_ms, level, page, pageSize}
 *   openAlarmDetailById → 全局告警详情弹窗 (复用, 不重复建设)
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import flvjs from 'flv.js'
import Hls from 'hls.js'
import MiniPlayer from '@/components/video/MiniPlayer.vue'
import type { CameraMapBinding } from '@/types/floorMap'
import { deviceTypeLabel, deviceIconMeta } from '@/types/floorMap'
import { channelIdVariants } from '@/composables/useFloorMap'
import { channelApi } from '@/api/channel'
import { queryRecordings, type DeviceRecording } from '@/api/recording'
import { recordingHttp } from '@/api/http'
import { alarmApi } from '@/api/alarm'
import { normalizeAlarmCore } from '@/types/alarm'
import { openAlarmDetailById } from '@/composables/useAlarmPopup'
import { useEventTypeNames } from '@/composables/useEventTypeNames'

const props = defineProps<{
  binding: CameraMapBinding | null
  /** 当前平面图标签 (如 "办公楼 F1") */
  mapLabel?: string
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const isCamera = computed(() => !props.binding?.device_type || props.binding.device_type === 'camera')
/** GB 通道裸 20 位形态 (去 _ch0 后缀; ZLM stream_id=gb_<裸> — AlarmPopup override 同款) */
const bareChannelId = computed(() => String(props.binding?.channel_id || '').replace(/_ch\d+$/, ''))

// ═══ 通道元数据 (名称/在线/deviceId; 模块级 60s 缓存 — 首页/定位页弹窗共享不重复拉) ═══
interface ChMeta { name: string; deviceId: string; status: string }
let chMetaCache: { at: number; byKey: Map<string, ChMeta> } | null = null
const metaLoading = ref(false)
const chMeta = ref<ChMeta | null>(null)
const isOnline = computed<boolean | null>(() => {
  const s = chMeta.value?.status?.toLowerCase() || ''
  if (!s) return null
  return s === 'online' || s === 'active' || s === 'on' || s === '1' || s === 'true'
})
async function loadMeta(force = false) {
  if (!props.binding) return
  metaLoading.value = true
  try {
    if (force || !chMetaCache || Date.now() - chMetaCache.at > 60_000) {
      const res = await channelApi.getList({ pageSize: 200 })
      const raw = (res.data as any)?.data ?? res.data
      const channels = Array.isArray(raw) ? raw : (raw?.items || raw?.list || raw?.channels || [])
      const byKey = new Map<string, ChMeta>()
      for (const ch of channels) {
        const key = String(ch.id || ch.channel_id || ch.deviceId || '')
        if (!key) continue
        byKey.set(key, {
          name: String(ch.name || ch.channel_name || key),
          deviceId: String(ch.deviceId || ch.device_id || ''),
          status: String(ch.status || ''),
        })
      }
      chMetaCache = { at: Date.now(), byKey }
    }
    // 双形态匹配 (34020..._ch0 / 裸 20 位 — channelIdVariants 同口径)
    const variants = channelIdVariants(props.binding.channel_id)
    let hit: ChMeta | undefined
    for (const v of variants) { hit = chMetaCache.byKey.get(v); if (hit) break }
    chMeta.value = hit || null
  } catch {
    chMeta.value = null // 元数据失败不阻塞弹窗 — 状态显示未知, 预览交播放器报错
  } finally {
    metaLoading.value = false
  }
}

const deviceName = computed(() => {
  const b = props.binding
  if (!b) return ''
  if (!isCamera.value) return b.label || b.channel_id
  return b.label || chMeta.value?.name || b.channel_id
})

// ═══ Tab 状态 (设备切换由 :key 重建重置) ═══
const activeTab = ref<'preview' | 'playback' | 'alarms'>('preview')
watch(() => props.binding, (b) => {
  if (!b) return
  activeTab.value = isCamera.value ? 'preview' : 'alarms'
  chMeta.value = null
  playerFatal.value = ''
  loadMeta()
  // [FIX 2026-09-05] 非视频设备初始 tab 即 'alarms' (无变化) → 下方 watch(activeTab)
  //   不触发, 告警永远不查 → 设备切换时若已落在告警 tab 直接拉首屏
  if (activeTab.value === 'alarms') fetchAlarms(1)
})

// ═══ 实时预览 (MiniPlayer 全托管: 降级链/退避重试/fatal 离线判定) ═══
const streamType = ref<'main' | 'sub'>('main')
const playerFatal = ref('')
function onStreamTypeChange() { playerFatal.value = '' }
function onPlayerError(_msg: string, fatal?: boolean) {
  playerFatal.value = fatal ? '设备不可达 / 通道离线, 实时视频不可用' : ''
}

// ═══ 录像查询与回放 ═══
const recDate = ref(new Date().toISOString().slice(0, 10))
const recLoading = ref(false)
const recError = ref('')
const recordings = ref<DeviceRecording[]>([])
const activeRec = ref<DeviceRecording | null>(null)
const recDeviceId = computed(() => chMeta.value?.deviceId || '')
async function queryRec() {
  if (!props.binding || !recDeviceId.value) return
  recLoading.value = true
  recError.value = ''
  stopRec()
  try {
    recordings.value = await queryRecordings({
      device_id: recDeviceId.value,
      channel_id: props.binding.channel_id,
      start_time: `${recDate.value}T00:00:00`,
      end_time: `${recDate.value}T23:59:59`,
    })
  } catch (e: unknown) {
    recordings.value = []
    recError.value = '录像查询失败: ' + (e instanceof Error ? e.message : String(e))
  } finally {
    recLoading.value = false
  }
}

// ── 回放播放器 (flv.js isLive:false / hls.js / 原生 video 三级 — RecordingView 同款) ──
const recVideoRef = ref<HTMLVideoElement>()
const playUrl = ref('')
const recPaused = ref(false)
let flvPlayer: flvjs.Player | null = null
let hlsPlayer: Hls | null = null
async function playRec(r: DeviceRecording) {
  activeRec.value = r
  stopRec(false)
  try {
    const { data } = await recordingHttp.post(`/${r.id}/play`, {
      id: r.id,
      device_id: recDeviceId.value || r.device_id,
      channel_id: r.channel_id || props.binding?.channel_id,
      start_time: r.start_time,
      end_time: r.end_time,
    })
    const d = (data as any)?.data ?? data
    const urls = d?.urls || d || {}
    const url = String(urls.wsFlv || urls.ws_flv || urls.flv || urls['ws-flv'] || urls.hls || '')
    if (!url) { recError.value = '回放地址获取失败 (后端未返回播放地址)'; return }
    playUrl.value = url
    recPaused.value = false
    // 等 video 挂载后 attach (下一帧)
    requestAnimationFrame(() => attachRecPlayer(url, !!urls.hls && !urls.flv && !urls.wsFlv))
  } catch (e: unknown) {
    recError.value = '回放启动失败: ' + (e instanceof Error ? e.message : String(e))
  }
}
function attachRecPlayer(url: string, preferHls: boolean) {
  const video = recVideoRef.value
  if (!video) return
  if (!preferHls && url.includes('.flv') && flvjs.isSupported()) {
    const p = flvjs.createPlayer({ type: 'flv', url, isLive: false, hasAudio: true, hasVideo: true }, { enableStashBuffer: false })
    p.attachMediaElement(video)
    p.load()
    Promise.resolve(p.play()).catch(() => {})
    p.on(flvjs.Events.ERROR, () => { destroyRecPlayer() })
    flvPlayer = p
  } else if (url.includes('.m3u8') || url.includes('hls') || preferHls) {
    if (Hls.isSupported()) {
      const h = new Hls()
      h.loadSource(url)
      h.attachMedia(video)
      h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) destroyRecPlayer() })
      hlsPlayer = h
      video.play().catch(() => {})
    } else {
      video.src = url
      video.play().catch(() => {})
    }
  } else {
    video.src = url
    video.play().catch(() => {})
  }
}
function toggleRecPlay() {
  const video = recVideoRef.value
  if (!video) return
  if (video.paused) { video.play().catch(() => {}); recPaused.value = false }
  else { video.pause(); recPaused.value = true }
}
function destroyRecPlayer() {
  if (flvPlayer) { try { flvPlayer.destroy() } catch { /* 已销毁忽略 */ } flvPlayer = null }
  if (hlsPlayer) { try { hlsPlayer.destroy() } catch { /* 已销毁忽略 */ } hlsPlayer = null }
  const video = recVideoRef.value
  if (video) { video.pause(); video.removeAttribute('src'); video.load() }
}
function stopRec(clearActive = true) {
  destroyRecPlayer()
  playUrl.value = ''
  recPaused.value = false
  if (clearActive) activeRec.value = null
}
onBeforeUnmount(stopRec)

// ═══ 历史告警 (channelId + 时间范围 + 级别 + 分页) ═══
const ALARM_PAGE_SIZE = 10
const alarmRange = ref<[string, string]>([
  new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10) + ' 00:00:00',
  new Date().toISOString().slice(0, 10) + ' 23:59:59',
])
const alarmLevel = ref('')
const alarmLoading = ref(false)
const alarmError = ref('')
const alarms = ref<any[]>([])
const alarmTotal = ref(0)
const alarmPage = ref(1)
async function fetchAlarms(page = 1) {
  if (!props.binding) return
  alarmLoading.value = true
  alarmError.value = ''
  alarmPage.value = page
  const [s, e] = alarmRange.value || []
  try {
    // [FIX floorplan-ch 2026-09-06] channel_id 改传完整节点 ID (含 _chN 后缀):
    //   后端 channelFilterCond 按完整 ID 做 hash 投影候选集精确匹配
    //   (hash(完整ID)+hash(裸码) 归默认通道), 同 NVR 兄弟通道不再互串。
    //   旧传裸码 + 后端 OR device_id 宽匹配 → 同设备两摄像头返回相同列表。
    const params: Record<string, unknown> = {
      channel_id: props.binding.channel_id,
      page,
      pageSize: ALARM_PAGE_SIZE,
    }
    if (s) params.since = new Date(s.replace(' ', 'T')).getTime()
    const res = await alarmApi.getList(params as any)
    const d = (res.data as any)?.data ?? res.data
    const raw = d?.alarms || d?.items || []
    // SSOT 归一化 (level 数字刻度映射 / status new→unhandled / snapshotUrl 绝对化) —
    // 与 AlarmPopup / AlarmsView / stores/alarm 同口径, 不另造字段提取
    let norm = (Array.isArray(raw) ? raw : []).map((x: any) => normalizeAlarmCore(x))
    if (e) {
      const em = new Date(e.replace(' ', 'T')).getTime()
      norm = norm.filter(a => new Date(a.createdAt).getTime() <= em)
    }
    if (alarmLevel.value) norm = norm.filter(a => a.level === alarmLevel.value)
    alarms.value = norm
    alarmTotal.value = Number(d?.total ?? norm.length)
  } catch (err: unknown) {
    alarms.value = []
    alarmTotal.value = 0
    alarmError.value = '告警查询失败: ' + (err instanceof Error ? err.message : String(err))
  } finally {
    alarmLoading.value = false
  }
}
// 首次进入告警 tab 自动查一次 (懒加载, 不在弹窗打开时全量拉)
watch(activeTab, (t) => {
  if (t === 'alarms' && !alarms.value.length && !alarmLoading.value && !alarmError.value) fetchAlarms(1)
})

// ── 告警行展示 (归一化 AlarmEvent 字段; 名称走 SSOT 事件类型缓存) ──
const { getAlarmTypeName } = useEventTypeNames()
function typeNameOf(a: any) { return getAlarmTypeName(String(a?.type || '')) || a?.description || '未知告警' }
function levelLabel(l: string) {
  return ({ critical: '严重', high: '高危', medium: '中危', low: '低危', info: '提示' } as Record<string, string>)[l] || l
}
function statusLabel(s: string) {
  return ({ unhandled: '未处理', confirmed: '已确认', handled: '已处理', false_alarm: '误报', ignored: '已忽略', forwarded: '已转发' } as Record<string, string>)[s] || s
}
function openAlarmDetail(a: any) {
  // 复用全局告警详情 (AlarmPopup) — 不重复建设不一致的详情页
  if (a?.id) openAlarmDetailById(String(a.id))
}

// ═══ 时间格式化 ═══
function timeOf(v: string | number) {
  if (!v) return '--'
  const d = new Date(typeof v === 'number' ? v : String(v).includes('T') ? v : String(v).replace(' ', 'T'))
  if (isNaN(d.getTime())) return String(v)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function onVisibleChange(v: boolean) {
  if (!v) {
    stopRec()
    emit('close')
  }
}
</script>

<style scoped>
/* ═══ 深色科技感主题 (对齐 AlarmPopup / FloorMapView 画布区 SSOT 色板) ═══ */
:global(.ddd-dialog) {
  background: rgba(10, 22, 40, 0.97);
  border: 1px solid #2A3F66;
  border-radius: 10px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
}
:global(.ddd-dialog .el-dialog__header) { padding: 8px 12px 0; margin-right: 0; }
:global(.ddd-dialog .el-dialog__headerbtn) { top: 8px; right: 10px; }
:global(.ddd-dialog .el-dialog__headerbtn .el-dialog__close) { color: #7A90B3; font-size: 18px; }
:global(.ddd-dialog .el-dialog__headerbtn:hover .el-dialog__close) { color: #4EA1F3; }
:global(.ddd-dialog .el-dialog__body) { padding: 0 14px 14px; }

.ddd { color: #DCE7F5; font-size: 13px; }

/* ── 头部 ── */
.ddd-head {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 6px 12px;
  border-bottom: 1px solid rgba(42, 63, 102, 0.6);
}
.ddd-head__icon { flex: none; filter: drop-shadow(0 0 6px rgba(50, 148, 237, 0.35)); }
.ddd-head__main { flex: 1; min-width: 0; }
.ddd-head__name-line { display: flex; align-items: center; gap: 8px; }
.ddd-head__name {
  font-size: 15px; font-weight: 600; color: #F2F8FF;
  max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ddd-head__primary { color: #F4B400; font-size: 11px; flex: none; }
.ddd-head__meta-line {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 5px; font-size: 12px; color: #7A90B3;
}
.ddd-head__ch { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ddd-head__sep { opacity: 0.4; }
.ddd-head__status { display: inline-flex; align-items: center; gap: 5px; }
.ddd-head__status i {
  width: 7px; height: 7px; border-radius: 50%; display: inline-block;
  background: #5F7699;
}
.ddd-head__status.is-online i { background: #22C55E; box-shadow: 0 0 6px rgba(34, 197, 94, 0.8); }
.ddd-head__status.is-online { color: #4ADE80; }
.ddd-head__status.is-offline i { background: #64748B; }
.ddd-head__status.is-offline { color: #94A3B8; }

/* ── 非视频设备区 ── */
.ddd-novideo__banner {
  display: flex; align-items: center; gap: 8px;
  margin: 10px 0; padding: 8px 12px;
  background: rgba(42, 63, 102, 0.25);
  border: 1px dashed #3A5480; border-radius: 6px;
  color: #9DB4D6; font-size: 12px;
}
.ddd-novideo__ops { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.ddd-novideo__op {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 12px; background: rgba(16, 30, 52, 0.6);
  border: 1px solid rgba(42, 63, 102, 0.6); border-radius: 6px;
}
.ddd-novideo__op-name { color: #B7C9E4; font-size: 12px; }

/* ── Tabs ── */
.ddd-tabs :deep(.el-tabs__header) { margin-bottom: 10px; }
.ddd-tabs :deep(.el-tabs__item) { color: #7A90B3; }
.ddd-tabs :deep(.el-tabs__item.is-active) { color: #4EA1F3; }
.ddd-tabs :deep(.el-tabs__nav-wrap::after) { background-color: rgba(42, 63, 102, 0.6); }

/* ── 预览 ── */
.ddd-player-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  aspect-ratio: 16/9; background: rgba(6, 14, 26, 0.8);
  border: 1px solid rgba(42, 63, 102, 0.6); border-radius: 8px;
  color: #7A90B3; font-size: 13px;
}
.ddd-player-fatal {
  margin-top: 6px; padding: 6px 10px;
  background: rgba(220, 68, 55, 0.12); border: 1px solid rgba(220, 68, 55, 0.4);
  border-radius: 6px; color: #F87171; font-size: 12px; text-align: center;
}

/* ── 录像 ── */
.ddd-rec-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ddd-rec-tip { color: #5F7699; font-size: 11px; }
.ddd-rec-nodevice {
  padding: 14px; text-align: center; color: #9DB4D6; font-size: 12px;
  background: rgba(42, 63, 102, 0.2); border-radius: 6px;
}
.ddd-rec-state {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 20px; color: #7A90B3; font-size: 12px;
  background: rgba(6, 14, 26, 0.5); border-radius: 6px;
}
.ddd-rec-state--error { color: #F87171; }
.ddd-rec-list {
  max-height: 180px; overflow-y: auto;
  border: 1px solid rgba(42, 63, 102, 0.6); border-radius: 6px;
}
.ddd-rec-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px; cursor: pointer;
  border-bottom: 1px solid rgba(42, 63, 102, 0.35);
  transition: background 0.2s ease;
}
.ddd-rec-item:last-child { border-bottom: none; }
.ddd-rec-item:hover { background: rgba(50, 148, 237, 0.08); }
.ddd-rec-item.is-active { background: rgba(50, 148, 237, 0.15); }
.ddd-rec-item__time { flex: 1; font-family: monospace; font-size: 12px; color: #B7C9E4; }
.ddd-rec-item__size { color: #5F7699; font-size: 11px; }
.ddd-rec-player { margin-top: 10px; }
.ddd-rec-player__video {
  width: 100%; aspect-ratio: 16/9; background: #000;
  border-radius: 8px; border: 1px solid rgba(42, 63, 102, 0.6);
}
.ddd-rec-player__bar {
  display: flex; align-items: center; gap: 8px; margin-top: 8px;
}
.ddd-rec-player__hint { margin-left: auto; color: #5F7699; font-size: 11px; }

/* ── 历史告警 ── */
.ddd-alarm-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.ddd-alarm-filter-hint { color: #5F7699; font-size: 11px; }
.ddd-alarm-state {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 20px; color: #7A90B3; font-size: 12px;
  background: rgba(6, 14, 26, 0.5); border-radius: 6px;
}
.ddd-alarm-state--error { color: #F87171; }
.ddd-alarm-list {
  max-height: 300px; overflow-y: auto;
  border: 1px solid rgba(42, 63, 102, 0.6); border-radius: 6px;
}
.ddd-alarm-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; cursor: pointer;
  border-bottom: 1px solid rgba(42, 63, 102, 0.35);
  transition: background 0.2s ease;
}
.ddd-alarm-item:last-child { border-bottom: none; }
.ddd-alarm-item:hover { background: rgba(50, 148, 237, 0.08); }
.ddd-alarm-item__snap {
  width: 64px; height: 40px; object-fit: cover; border-radius: 4px; flex: none;
  border: 1px solid rgba(42, 63, 102, 0.8); background: #0A1628;
}
.ddd-alarm-item__snap--empty {
  display: flex; align-items: center; justify-content: center;
  color: #3D527A; font-size: 10px;
}
.ddd-alarm-item__body { flex: 1; min-width: 0; }
.ddd-alarm-item__line1 { display: flex; align-items: center; gap: 8px; }
.ddd-alarm-item__type {
  font-size: 13px; color: #E5EEFA; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;
}
.ddd-alarm-item__level { font-size: 11px; padding: 1px 7px; border-radius: 3px; flex: none; }
.ddd-alarm-item__level.is-critical { color: #F87171; background: rgba(220, 38, 38, 0.15); }
.ddd-alarm-item__level.is-high { color: #FB923C; background: rgba(249, 115, 22, 0.15); }
.ddd-alarm-item__level.is-medium { color: #FACC15; background: rgba(250, 204, 21, 0.12); }
.ddd-alarm-item__level.is-low { color: #94A3B8; background: rgba(148, 163, 184, 0.15); }
.ddd-alarm-item__level.is-info { color: #60A5FA; background: rgba(96, 165, 250, 0.12); }
.ddd-alarm-item__status { font-size: 11px; color: #7A90B3; flex: none; margin-left: auto; }
.ddd-alarm-item__status.is-unhandled { color: #FB923C; }
.ddd-alarm-item__status.is-confirmed, .ddd-alarm-item__status.is-handled { color: #4ADE80; }
.ddd-alarm-item__status.is-false_alarm { color: #64748B; }
.ddd-alarm-item__line2 { margin-top: 3px; font-size: 11px; color: #5F7699; font-family: monospace; }
.ddd-alarm-pager { display: flex; justify-content: flex-end; margin-top: 8px; }

/* 滚动条 (深色统一) */
.ddd-rec-list::-webkit-scrollbar,
.ddd-alarm-list::-webkit-scrollbar { width: 6px; }
.ddd-rec-list::-webkit-scrollbar-thumb,
.ddd-alarm-list::-webkit-scrollbar-thumb { background: #2A3F66; border-radius: 3px; }
</style>
