/**
 * [FIX stream-health 2026-09-28] 通道流健康聚合 Composable
 *
 * 背景: smartgateway 半年前的告警问题反复根因 = 通道媒体流不健康但 UI 不暴露
 *   - ch2001 媒体流 bitrate=0 持续 600+ 秒, NVR SIP online 但 GB28181 推流断
 *   - 仪表盘顶部「在线/总数」只看 GB28181 父设备, 不下钻到子通道
 *   - inference 端点 running=true 是用了 ZLM snapshot fallback 兜底在跑 (非真流)
 *
 * 设计: 聚合两个现成端点 (streams / inference channels), 不新增 REST,
 *   字段融合 → 健康度三色 (red/yellow/green) + 推荐处置。
 *
 * 判定规则 (按 device-tested 经验值):
 *   - red (offline):
 *       streams.status !== 'streaming' |
 *       (streams.bitrate === 0 && streams.aliveSecond > 30)
 *   - yellow (degraded):
 *       streams.bitrate < 200_000 (200Kbps) |
 *       inference.last_inference_ms age > 30s 但 channel 仍 enabled
 *   - green (healthy): 其余
 *
 * [NOTE naming] 之所以独立成 useChannelHealth 而非合并进 useStreamHealth:
 *   useStreamHealth 是 LiveView 多路播放器级别的 stall/卡顿监测 (startMonitoring
 *   /getHealth/stopMonitoring 等), 维度 = 多路播放槽位 (slotIdx)。
 *   useChannelHealth 是 Dashboard 后端链路级别的通道健康聚合, 维度 = 后端通道
 *   (channel_id_str)。两者粒度不同, 共用文件会变成 god-composable, 也不利于
 *   typecheck 收敛 — 现拆为两个文件, 互不依赖。
 *
 * [NOTE perf] 10s 轮询 (DashboardView 已有 5min 兜底轮询, 本卡额外加 10s 高频
 *   刷新确保告警入口出来后第一时间能见; 不挤压其他端点)。
 */
import { ref, computed, onUnmounted, type Ref } from 'vue'
import { getStreams } from '@/api/stream'
import { getInferenceChannels } from '@/api/inference'

export type StreamHealthLevel = 'red' | 'yellow' | 'green' | 'unknown'

export interface StreamHealthItem {
  channelId: string
  streamId?: string
  /** 当前码率 (bps) */
  bitrate: number
  /** 已存活秒数 */
  aliveSecond: number
  /** 上次推理时间 age (秒, 0=刚跑) */
  inferenceAgeSec: number
  inferenceRunning: boolean
  inferenceTotal: number
  algoPlugin?: string
  viewers: number
  level: StreamHealthLevel
  /** 建议处置文案 (中文) */
  remedy: string
}

export interface StreamHealthStats {
  total: number
  red: number
  yellow: number
  green: number
}

const RED_ALIVE_SEC_THRESHOLD = 30
const YELLOW_BITRATE = 200_000  // 200 Kbps
const YELLOW_INF_AGE_SEC = 30

function decideLevel(s: {
  bitrate: number
  aliveSecond: number
  streamsPresent: boolean
  inferenceRunning: boolean
  inferenceAgeSec: number
}): StreamHealthLevel {
  // red: streams 端点查不到 (非 active) 或码率 0 超时
  if (!s.streamsPresent) return 'red'
  if (s.bitrate <= 0 && s.aliveSecond > RED_ALIVE_SEC_THRESHOLD) return 'red'
  // yellow: 码率低 或 inference 卡死
  if (s.bitrate > 0 && s.bitrate < YELLOW_BITRATE) return 'yellow'
  if (s.inferenceAgeSec > YELLOW_INF_AGE_SEC && !s.inferenceRunning) return 'yellow'
  return 'green'
}

function decideRemedy(
  level: StreamHealthLevel,
  s: { bitrate: number; aliveSecond: number; inferenceAgeSec: number; inferenceRunning: boolean }
): string {
  switch (level) {
    case 'red':
      if (s.aliveSecond > RED_ALIVE_SEC_THRESHOLD)
        return `媒体流 ${Math.floor(s.aliveSecond)}s 无数据, 检查 NVR 推流/网络`
      return '通道未拉起, 检查联动规则 + 设备使能'
    case 'yellow':
      if (s.bitrate < YELLOW_BITRATE) return '码率偏低, 可能带宽抖动或编码降级'
      if (s.inferenceAgeSec > YELLOW_INF_AGE_SEC) return `推理 ${s.inferenceAgeSec}s 未更新, CDecode 可能降级`
      return ''
    case 'green':
      return '正常'
    default:
      return '未知'
  }
}

/**
 * [FIX stream-health 2026-09-28] 通道流健康聚合
 *
 * @param pollMs 轮询间隔 (ms), 默认 10000
 * @returns channels / stats / loading / refresh
 */
export function useChannelHealth(pollMs = 10000) {
  const channels = ref<StreamHealthItem[]>([]) as Ref<StreamHealthItem[]>
  const loading = ref(false)
  const lastUpdate = ref<number>(0)
  let timer: ReturnType<typeof setInterval> | null = null

  async function fetchOnce() {
    loading.value = true
    try {
      const [streamsRes, infRes] = await Promise.all([
        getStreams().catch((e) => {
          console.warn('[useChannelHealth] getStreams failed', e)
          return null
        }),
        getInferenceChannels().catch((e) => {
          console.warn('[useChannelHealth] getInferenceChannels failed', e)
          return null
        }),
      ])

      // [FIX stream-health 2026-09-28] 联合按 channel_id_str 聚合。后端 streams
      //   stream_id 形如 "gb_34020000001320002001", 尾数即是 channel_id_str;
      //   inference 端点直接给 channel_id 字段 (无 _ch0 后缀), 二者对齐键。
      // [NOTE 2026-09-28] 后端实际返回字段在 data.items / data.streams 同列表都常见,
      //   都接受 (以 any narrow 后按需取数据)。
      // [FIX stream-offline-filter 2026-09-28] 离线上传虚拟通道过滤:
      //   streams 端点同时列出了 "gb_offline_upload_ch98XX" 这一路 (属默认占位
      //   文件/录像上传通道, deviceId="offline_upload", enabled=false),
      //   本卡仅显示真实业务摄像头 (GB28181 推流通道)。判定:
      //     1) deviceId === 'offline_upload' → 虚拟占位, 跳过
      //     2) streamId 以 'gb_offline_upload_' 开头 → 虚拟占位, 兜底跳过
      //     3) streamId 不匹配 'gb_' GB28181 前缀但 len<18 → 不是真实摄像头, 跳过
      // [REF 2026-09-28] memory "离线任务与虚拟通道陷阱" — 虚拟通道应从业务看板排除,
      //   避免非实际部署项混于同一面板误导运维。
      const rawStreams: any = streamsRes?.data?.data
      const items: any[] = rawStreams?.items ?? rawStreams?.streams ?? []
      const streamMap = new Map<string, { bitrate: number; aliveSecond: number; viewers: number; status: string }>()
      let skippedOffline = 0
      for (const s of items) {
        // (1) deviceId 明确标记的虚拟通道
        if (s.deviceId === 'offline_upload') { skippedOffline += 1; continue }
        // (2) stream_id 前缀明示
        const sid: string = s.stream_id ?? s.streamId ?? ''
        if (sid.startsWith('gb_offline_upload_')) { skippedOffline += 1; continue }
        // (3) 非 GB28181 标准 + 短 id = 非业务摄像头 (如本机离线上传占位)
        if (!sid.startsWith('gb_')) { skippedOffline += 1; continue }
        const m = /_(\d{20})$/.exec(sid)
        if (!m) { skippedOffline += 1; continue }   // 20 位 GB28181 通道 id 才是真实摄像头

        const chKey = m[1]  // channel_id_str (20 位)
        streamMap.set(chKey, {
          bitrate: s.bitrate ?? 0,
          aliveSecond: s.aliveSecond ?? 0,
          viewers: s.viewerCount ?? 0,
          status: s.status ?? '',
        })
      }
      // 诊断上记: 被过滤的虚拟通道数, 可调试误过滤
      if (skippedOffline > 0) {
        // eslint-disable-next-line no-console
        console.debug(`[useChannelHealth] 过滤 ${skippedOffline} 路离线/虚拟通道 (offline_upload)`)
      }

      const infRaw: any = infRes?.data?.data
      const infList: any[] = infRaw?.channels ?? []
      const now = Date.now()
      const merged: StreamHealthItem[] = []

      // 先遍历 inference 列出的 (本机启用了推理的通道)
      for (const ch of infList) {
        const cid = ch.channel_id as string
        const s = streamMap.get(cid)
        const inferenceAgeSec = ch.last_inference_ms
          ? Math.max(0, Math.floor((now - ch.last_inference_ms) / 1000))
          : 0
        const bitrate = s?.bitrate ?? 0
        const aliveSecond = s?.aliveSecond ?? 0
        const inferenceRunning = !!ch.running
        const streamsPresent = !!s && s.status === 'streaming'
        const level = decideLevel({ bitrate, aliveSecond, streamsPresent, inferenceRunning, inferenceAgeSec })
        merged.push({
          channelId: cid,
          streamId: ch.stream_id,
          bitrate,
          aliveSecond,
          inferenceAgeSec,
          inferenceRunning,
          inferenceTotal: ch.total_inferences ?? 0,
          algoPlugin: ch.algo_plugin,
          viewers: s?.viewers ?? 0,
          level,
          remedy: decideRemedy(level, { bitrate, aliveSecond, inferenceAgeSec, inferenceRunning }),
        })
      }

      // 补 streams 里有但 inference 没启用的 (让用户看到流在跑但本机没拉推理)
      for (const [cid, s] of streamMap.entries()) {
        if (merged.some((m) => m.channelId === cid)) continue
        const level = decideLevel({
          bitrate: s.bitrate,
          aliveSecond: s.aliveSecond,
          streamsPresent: s.status === 'streaming',
          inferenceRunning: false,
          inferenceAgeSec: -1,
        })
        merged.push({
          channelId: cid,
          bitrate: s.bitrate,
          aliveSecond: s.aliveSecond,
          inferenceAgeSec: -1,
          inferenceRunning: false,
          inferenceTotal: 0,
          viewers: s.viewers,
          level,
          remedy: decideRemedy(level, { bitrate: s.bitrate, aliveSecond: s.aliveSecond, inferenceAgeSec: -1, inferenceRunning: false }),
        })
      }

      channels.value = merged.sort((a, b) => a.channelId.localeCompare(b.channelId))
      lastUpdate.value = Date.now()
    } finally {
      loading.value = false
    }
  }

  function start() {
    if (timer) return
    void fetchOnce()
    timer = setInterval(() => void fetchOnce(), pollMs)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const stats = computed<StreamHealthStats>(() => {
    const s: StreamHealthStats = { total: 0, red: 0, yellow: 0, green: 0 }
    for (const c of channels.value) {
      s.total += 1
      if (c.level === 'red') s.red += 1
      else if (c.level === 'yellow') s.yellow += 1
      else if (c.level === 'green') s.green += 1
    }
    return s
  })

  onUnmounted(stop)
  // 自动启动
  start()

  return { channels, stats, loading, lastUpdate, refresh: fetchOnce, start, stop }
}
