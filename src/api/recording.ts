/**
 * 华盾AI智能视频盒子 v7.0 - 录像管理 API
 * api/recording.ts — 录像查询、回放、下载
 *
 * 🆕 优化：使用专用 recordingHttp 客户端，移除硬编码 URL
 */

import { recordingHttp, channelHttp } from './http'
import axios from 'axios'
import type { ApiResponse } from '@/types/common'

export interface RecordingSegment {
  id: string
  deviceId: string
  channelNo: number
  startTime: string
  endTime: string
  duration: number
  fileSize: number
  type: 'continuous' | 'event' | 'manual'
  status: 'available' | 'processing' | 'error'
}

/** 获取录像列表 */
export function getRecordings(params: {
  deviceId?: string
  channelNo?: number
  startTime?: string
  endTime?: string
  type?: string
  page?: number
  pageSize?: number
}) {
  return recordingHttp.get<ApiResponse<RecordingSegment[]>>('', { params })
}

/** 播放录像 */
export function playRecording(id: string, params?: { startTime?: string; speed?: number }) {
  return recordingHttp.post<ApiResponse<{ playUrl: string }>>(`/${id}/play`, params)
}

/** 停止播放 */
export function stopPlayback(id: string) {
  return recordingHttp.post<ApiResponse<void>>(`/${id}/stop`)
}

/**
 * /record/ 静态直链候选链 (按优先级)
 * [FIX rec-url 2026-09-11] 磁盘真实结构含 "record/record/" 双层 (ZLM rootPath 下
 *   多套一层 record/)，nginx (80/8088 实测) ^~ /record/ alias /data/shield/record/
 *   只有双层 URL 命中真实文件 (206 video/mp4)；单层 URL 两端口均 404。
 *   候选顺序: ① 当前 origin 同源双层 (nginx alias → 206);
 *             ② 8088 端口双层 (shieldbox-web nginx, 实测 206, LAN 兜底)。
 * [FIX rec-layer 2026-09-11] 兼容单层输入: 证据接口 (/alarms/:id/evidence)
 *   返回的 video_clip.url 是单层形态 (/record/rtp/...) → 自动补齐为双层作
 *   首选, 否则播放恒 404 (弹窗回放"已尝试全部格式"根因)。
 *   非 /record/ 形态 (绝对 URL / GB28181 回放流) 原样返回。
 * [FIX rec-layer2 2026-09-11] 兼容绝对 URL 输入: getEvidence / normalizeAlarm
 *   Payload (types/alarm.ts toAbsoluteUrl) 均把相对路径转成绝对 (http://
 *   host:port/record/rtp/...) → 旧判断只认 "/record/" 开头会漏掉补层, 直显
 *   回放仍单层 404 (b 场景实测: video currentSrc 归一化为单层 /record/rtp/
 *   ... 快速全败)。现先剥 scheme+host 提取 path 再判层, 两形态均正确补层。
 * [FIX rec-cand2 2026-09-11] 候选②由「18080 单层」修正为「8088 双层」:
 *   单层 URL 在 80/8088/18080 三端口实测恒 404 (nginx alias 需 record/record/
 *   双层), 原候选②在任何已知环境都是死链, 只会白耗一个 failNext 周期;
 *   8088 为设备 shieldbox-web 的 nginx 端口, 双层实测 206 可作 LAN 兜底,
 *   不可达时等价连接失败快速跳过, 无副作用。
 */
export function recordUrlCandidates(url: string): string[] {
  if (!url) return []
  // 绝对 URL (scheme://host[:port]/...) → 提取 path+query; 相对路径原样
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)$/i)
  const path = m ? m[1] : url
  if (!path.startsWith('/record/')) return [url]
  // [P2-2 2026-09-12] export 裁剪产物磁盘在 /data/shield/record/export/ (无 record/
  //   嵌套), 后端 download_url 单层 /record/export/... 即磁盘真实结构 → 不补层
  //   (补层 /record/record/export/ 实测 404); 双层规则仅适用于录像原片 (rtp/live)。
  //   [FIX mark-dl 2026-09-21] mark 录制产物同构 (磁盘 /data/shield/record/mark/...,
  //   后端 download_url 单层 /record/mark/...) — 不补层名单漏掉它致候选①恒 404,
  //   blob 拿不到只能走无反馈 <a> 兑底 (REC-MARK「结束没下载」根因之一)。
  //   [FIX live-rec 2026-09-21] live 直播录像产物同构 (磁盘 /data/shield/record/live/...),
  //   同因同治: 漏配则 LiveView 录像下载候选①恒 404。
  const double = path.startsWith('/record/record/') || path.startsWith('/record/export/')
    || path.startsWith('/record/mark/') || path.startsWith('/record/live/')
    ? path
    : '/record/record/' + path.slice('/record/'.length)
  const cands = [`${window.location.origin}${double}`]
  const hn = window.location.hostname
  // [FIX rec-cand-lan 2026-09-12] 8088 兑底仅限 LAN 直连场景 (同源端口为空/80/8088):
  //   vite dev (3100) 下 hostname 是开发机而非设备, 8088 候选恒 ECONNREFUSED,
  //   且偶发首笔 404 回退后 video.src 停留在不可达地址致播放卡死 (实测), 故跳过。
  const port = window.location.port
  if (hn && (port === '' || port === '80' || port === '8088')) cands.push(`http://${hn}:8088${double}`)
  // [FIX rec-cand-dedup 2026-09-12] 去重: 8088 同源访问时两候选完全一致 (origin 即
  //   http://host:8088) → 原实现同一 URL 白重试一整个 mp4 超时周期 (实测「已尝试
  //   全部格式」需 40s 才报); 去重后候选链只留唯一项, 失败快速进入上层处理。
  return [...new Set(cands)]
}

// ╒═════════════════════════════════════════════════════
// [FIX rec-hevc 2026-09-15] 录像直链「浏览器兼容化」转码 (HEVC/PCMA mp4 → H264+AAC)
// ═════════════════════════════════════════════════════

/**
 * 录像转码产物内存缓存 (归一化 URL → H264 直链) + in-flight 去重。
 * 同源并发请求共享一次轮询; 成功结果永久缓存 (后端 24h 清理 + 源文件哈希缓存命中), 失败不缓存 (可重试)。
 */
const transcodeCache = new Map<string, string>()
const transcodeInflight = new Map<string, Promise<string>>()

/**
 * [FIX rec-hevc 2026-09-15 排查 R1/R10] 录像文件「浏览器兼容化」转码。
 *
 * 背景: ZLM 本地录像片为 HEVC + PCMA (真机实测), Chrome/Linux 原生 video 无法
 *   解码 → 联动回放 mp4 直链分支整段黑屏 / 20s 首帧超时 (黑屏问题主根因 R1)。
 *   后端 /api/v1/recordings/transcode 任务化转码为 H264+AAC mp4, 落盘
 *   /data/shield/record/export/tc/<hash>.mp4 并进程内缓存 (实测 1080p 60s 片 ≈12s,
 *   H264 copy 转封装 ≈6s)。
 *
 * 语义: 返回可直接播放的 H264 直链; 转码不可用/失败/超时 → 返回空串, 由调用
 *   方决定降级 (播原片或提示), 不抛异常不阻塞。归一化补层规则与 recordUrlCandidates
 *   完全一致 (原片双层 / export 单层); GB28181 回放流等非 /record/ 形态直接返回 ''。
 */
export async function ensureRecordTranscoded(url: string, opts?: { timeoutMs?: number }): Promise<string> {
  if (!url) return ''
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)$/i)
  const path = m ? m[1] : url
  let filePath = ''
  let recordUrl = ''
  if (path.startsWith('/data/shield/record/')) {
    filePath = path  // 磁盘绝对路径 (GB28181 条目 id 形态) → 直传 file_path 最精确
  } else if (path.startsWith('/record/')) {
    recordUrl = path.startsWith('/record/record/') || path.startsWith('/record/export/')
      ? path
      : '/record/record/' + path.slice('/record/'.length)
  } else {
    return ''
  }
  const cacheKey = filePath || recordUrl
  const hit = transcodeCache.get(cacheKey)
  if (hit) return hit
  const existing = transcodeInflight.get(cacheKey)
  if (existing) return existing
  const task = (async (): Promise<string> => {
    try {
      const { data } = await recordingHttp.post('/transcode',
        filePath ? { file_path: filePath } : { url: recordUrl }, { timeout: 15000 })
      const d = data?.data ?? data
      const taskId = String(d?.task_id || '')
      if (!taskId) return ''
      const settle = (status: string, outUrl: string): string => {
        if (status === 'ready' && outUrl) { transcodeCache.set(cacheKey, outUrl); return outUrl }
        return ''
      }
      const first = settle(String(d?.status || ''), String(d?.url || ''))
      if (first) return first
      if (String(d?.status || '') === 'failed') return ''
      // 轮询: 800ms 间隔, 总预算默认 60s (实测 1080p 60s 片硬编 ≈12s; 连播队列预转下一段)
      const deadline = Date.now() + (opts?.timeoutMs ?? 60_000)
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 800))
        const g = await recordingHttp.get(`/transcode/${encodeURIComponent(taskId)}`)
        const t = g.data?.data ?? g.data
        const done = settle(String(t?.status || ''), String(t?.url || ''))
        if (done) return done
        if (String(t?.status || '') === 'failed') return ''
      }
      return ''
    } catch {
      // 网络/后端不可用 (如固件未含转码端点 404) → 静默降级, 调用方走原片兜底
      return ''
    }
  })()
  transcodeInflight.set(cacheKey, task)
  try { return await task } finally { transcodeInflight.delete(cacheKey) }
}

/** [P2-2] blob 下载公共体: 候选链 fetch→objectURL→<a download> 强制落盘 (downloadRecording 同源化逻辑抽出) */
export async function fetchAndDownload(url: string, filename: string): Promise<void> {
  if (!/^https?:\/\//.test(url) && !url.startsWith('/record/')) {
    throw new Error('后端未返回可用下载直链')
  }
  let blob: Blob | null = null
  for (const candidate of recordUrlCandidates(url)) {
    try {
      // [FIX mark-dl 2026-09-21] fetch 原无超时: 公网隧道断流时 promise 挂死,
      //   上层导出态 (markExporting) 永久 true → REC-MARK「再次点击无反应」
      //   主根因。每候选 90s AbortController 预算 (4MB 经 vicp 隧道实测 30-60s)。
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 90_000)
      try {
        const dl = await fetch(candidate, { signal: ac.signal })
        if (dl.ok) {
          blob = await dl.blob()
          break
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // 网络/CORS/超时 → 试下一候选
    }
  }
  const a = document.createElement('a')
  a.style.display = 'none'
  if (blob) {
    a.href = URL.createObjectURL(blob) // 同源 objectURL, download 属性强制落盘
  } else {
    a.href = url // 兜底: 原始相对路径 (同源 nginx 已配 /record/ 时可用)
  }
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  if (blob) {
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
  }
}

/**
 * 下载录像
 * Phase 14 P0 修复 14.3: BE 返回 JSON {download_url, recording_id},前端解析 URL 后触发浏览器下载
 * [REC-DL 2026-09-06] id 为 ZLM 磁盘绝对路径 (含 '/', 不能作 path 参数) →
 *   改走 download-file?path=; 返回的 download_url 是 /record/ 静态直链, filename 为真实文件名。
 * [FIX rec-dl 2026-09-11] ① download_url 相对路径在 nginx 未配 /record/ 时 404 →
 *   沿 recordUrlCandidates 候选链回退; ② 旧实现 <a download> 直接指向跨域地址时
 *   download 属性被浏览器忽略 (同源限制) → 改 fetch→blob→objectURL (同源化) 强制落盘。
 */
export async function downloadRecording(id: string): Promise<void> {
  const resp = await recordingHttp.get<
    ApiResponse<{ download_url: string; recording_id: string; filename?: string; file_size?: number }>
  >('/download-file', { params: { path: id } })
  const url = resp.data?.data?.download_url
  if (!url) {
    throw new Error('download_url not provided by backend')
  }
  const filename = resp.data?.data?.filename || `${Date.now()}.mp4`
  await fetchAndDownload(url, filename)
}

/**
 * [P2-2 2026-09-12] In/Out 区间裁剪导出: 后端按 [start_time, end_time] 扫描该通道覆盖的
 *   ZLM MP4 切片, ffmpeg -c copy 裁剪/拼接后返回静态直链; 前端拿 download_url 落盘。
 *   服务端执行 (同步, copy 级秒~十秒级), 区间上限由后端限制 (30 分钟)。
 */
export async function exportRangeRecording(params: {
  device_id?: string
  channel_id: string
  start_time: string
  end_time: string
}): Promise<{ download_url: string; filename: string; file_size?: number; segments_used?: number }> {
  const resp = await recordingHttp.post<
    ApiResponse<{ download_url: string; filename: string; file_size?: number; segments_used?: number }>
  >('/export-range', params)
  const out = resp.data?.data
  if (!out?.download_url) throw new Error(resp.data?.message || '后端未返回导出文件直链')
  return out
}

/**
 * [REC-EXPORT-ASYNC 2026-09-15] 异步区间导出: 远程访问链路 (花生壳映射) ~30s 响应截断,
 *   同步端点长窗 (实测 8min 窗 ≈131s) 必断; 此处提交后台任务后轮询状态直到完成。
 *   服务端 copy 级导出 30min 窗实测 <2min, 轮询上限 12min 已覆盖。
 */
export async function exportRangeRecordingAsync(params: {
  device_id?: string
  channel_id: string
  start_time: string
  end_time: string
}): Promise<{ download_url: string; filename: string; file_size?: number; segments_used?: number }> {
  const { data } = await recordingHttp.post('/export-range-async', params, { timeout: 15000 })
  const taskId = data?.data?.task_id
  if (!taskId) throw new Error(data?.message || '后端未返回导出任务 id')
  const deadline = Date.now() + 12 * 60_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500))
    const st = await recordingHttp.get('/export-range-status', { params: { task_id: taskId }, timeout: 15000 })
    const d = st.data?.data || {}
    if (d.status === 'done') {
      return { download_url: d.download_url, filename: d.filename, file_size: d.file_size, segments_used: d.segments_used }
    }
    if (d.status === 'failed') throw new Error(d.error || '导出任务失败')
  }
  throw new Error('导出超时 (超过 12 分钟), 请缩小时间范围')
}

/** [REC-MARK-STREAM 2026-09-20] 回放标记录像 (stream 模式): 录制当前 ZLM 回放流
 *  gb_playback_<chan> — [2026-09-12 存储治理] 关闭 ZLM 连录后中心存储切片不再
 *  产生, 设备存储 (GB28181 NVR) 回放的标记录像改走此链 (所见即所得, 与回放
 *  位置天然同相; 回放 BYE/切段时流注销, ZLM 自动 finalize 文件)。 */
export async function markRecordStart(channelId: string): Promise<void> {
  const { data } = await recordingHttp.post('/mark-record/start', { channel_id: channelId }, { timeout: 15000 })
  if (data?.code !== 0) throw new Error(data?.message || '录像启动失败')
}

/** 结束回放流录制: 后端 stopRecord + 回扫 mark 目录最新 mp4, 返回下载直链
 *  (回放已结束时 stopRecord 失败被后端宽容处理, 照常返回已 finalize 的产物)。 */
export async function markRecordStop(
  channelId: string,
): Promise<{ download_url: string; filename: string; file_size?: number }> {
  const { data } = await recordingHttp.post('/mark-record/stop', { channel_id: channelId }, { timeout: 20000 })
  if (data?.code !== 0) throw new Error(data?.message || '未捕获到录像')
  return {
    download_url: data.data?.download_url || '',
    filename: data.data?.filename || '',
    file_size: data.data?.file_size,
  }
}

/** 删除录像 */
export function deleteRecording(id: string) {
  return recordingHttp.delete<ApiResponse<void>>(`/${id}`)
}

// ════════════════════════════════════════════════
// [FIX live-rec 2026-09-21] 预览界面 (LiveView) 直播录像
//   语义: 录正在预览的直播流 (区别于 mark-record 录回放流)。
//   H265 直播流由后端起转码 gb_ltc_* 录 H264 (直录必出纯音频废文件, 同 mark 坑);
//   start 同步等转码就绪 (最长 ~10s, H264 直录则即时), timeout 放宽到 20s。
// ════════════════════════════════════════════════
export async function liveRecordStart(channelId: string): Promise<void> {
  const { data } = await recordingHttp.post('/live-record/start', { channel_id: channelId }, { timeout: 20000 })
  if (data?.code !== 0) throw new Error(data?.message || '录像启动失败')
}

/** 结束直播录像: 后端 stopRecord + 停转码 + 回扫 live 目录最新 mp4, 返回下载直链 */
export async function liveRecordStop(
  channelId: string,
): Promise<{ download_url: string; filename: string; file_size?: number }> {
  const { data } = await recordingHttp.post('/live-record/stop', { channel_id: channelId }, { timeout: 20000 })
  if (data?.code !== 0) throw new Error(data?.message || '未捕获到录像')
  return {
    download_url: data.data?.download_url || '',
    filename: data.data?.filename || '',
    file_size: data.data?.file_size,
  }
}

/** 回放控制(暂停/恢复/跳转/倍速) */
export function controlPlayback(id: string, action: 'pause' | 'resume' | 'seek' | 'speed', params?: { position?: number; speed?: number; scale?: number }) {
  return recordingHttp.post<ApiResponse<void>>(`/${id}/control`, { action, ...params })
}

// ── GB28181 设备录像查询 ──

/**
 * 将 Date 格式化为本地时间 ISO 字符串 (YYYY-MM-DDTHH:mm:ss)
 * 后端 mktime() 按本地时间解析，不能使用 toISOString() (会转 UTC 导致 8 小时偏差)
 */
export function toLocalISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** POST /recordings/query 返回的录像条目 */
export interface DeviceRecording {
  id: string
  device_id: string
  channel_id: string
  start_time: string
  end_time: string
  type: string
  file_size: number
  // [POPUP-3MIN 2026-09-11] 后端 (RestApiHandlers /recordings/query) 实际返回的扩展字段:
  //   url    — ZLM 本地录像双层静态直链 (/record/record/rtp/...; GB28181 条目缺省)
  //   duration — 片时长(秒); source — 'zlm' 盒子本地 / 'gb28181' NVR
  url?: string
  duration?: number
  source?: string
}

/** 按设备/通道/时间范围查询 GB28181 录像 */
export async function queryRecordings(params: {
  device_id: string
  channel_id?: string
  stream_name?: string
  start_time: string
  end_time: string
}): Promise<DeviceRecording[]> {
  const { data } = await recordingHttp.post('/query', params)
  const d = data?.data ?? data
  return d?.recordings ?? d ?? []
}

// ╒═════════════════════════════════════════════════════
// [P0-1] 录像计划表 (Recording Schedule) CRUD
// ═════════════════════════════════════════════════════

export interface TimeSegment {
  /** 0=周日, 1-6=周一~周六, 7=每天 */
  day: number
  /** "HH:mm" */
  start: string
  /** "HH:mm" */
  end: string
}

export interface RecordingSchedule {
  id?: number
  channel_id: string
  device_id?: string
  schedule_name?: string
  schedule_type: 'continuous' | 'time_segment' | 'event'
  time_segments: TimeSegment[]
  event_types?: string
  stream_type?: 'main' | 'sub'
  pre_record_seconds?: number
  post_record_seconds?: number
  enabled: boolean
  created_at?: string
  updated_at?: string
  // [P2-3] 节假日排除策略
  holiday_exclusion?: {
    enabled: boolean
    holiday_dates: string[]
    holiday_name?: string
  }
}

/** 查询录像计划列表 */
export async function getRecordingSchedules(channelId?: string): Promise<RecordingSchedule[]> {
  const { data } = await axios.get('/api/v1/recording-schedules', {
    params: channelId ? { channel_id: channelId } : {},
  })
  const d = data?.data ?? data
  if (!Array.isArray(d)) return []
  return d.map((s: any) => ({
    ...s,
    time_segments: typeof s.time_segments === 'string' ? JSON.parse(s.time_segments || '[]') : (s.time_segments || []),
    holiday_exclusion: typeof s.holiday_exclusion === 'string'
      ? JSON.parse(s.holiday_exclusion || '{"enabled":false,"holiday_dates":[]}')
      : (s.holiday_exclusion || { enabled: false, holiday_dates: [] }),
    enabled: s.enabled === 1 || s.enabled === true,
  }))
}

/** 创建录像计划 */
export async function createRecordingSchedule(schedule: RecordingSchedule): Promise<RecordingSchedule> {
  const { data } = await axios.post('/api/v1/recording-schedules', {
    ...schedule,
    time_segments: JSON.stringify(schedule.time_segments || []),
    holiday_exclusion: JSON.stringify(schedule.holiday_exclusion || { enabled: false, holiday_dates: [] }),
    enabled: schedule.enabled ? 1 : 0,
  })
  return data?.data ?? data
}

/** 更新录像计划 */
export async function updateRecordingSchedule(id: number, updates: Partial<RecordingSchedule>): Promise<void> {
  const payload: any = { ...updates }
  if (updates.time_segments) {
    payload.time_segments = JSON.stringify(updates.time_segments)
  }
  if (updates.holiday_exclusion) {
    payload.holiday_exclusion = JSON.stringify(updates.holiday_exclusion)
  }
  if (updates.enabled !== undefined) {
    payload.enabled = updates.enabled ? 1 : 0
  }
  await axios.put(`/api/v1/recording-schedules/${id}`, payload)
}

/** 删除录像计划 */
export async function deleteRecordingSchedule(id: number): Promise<void> {
  await axios.delete(`/api/v1/recording-schedules/${id}`)
}

// ╒═════════════════════════════════════════════════════
// [P0-2] 录像水印配置
// ═════════════════════════════════════════════════════

export interface WatermarkConfig {
  channel_id: string
  enabled: boolean
  show_timestamp: boolean
  show_channel_name: boolean
  custom_text: string
  position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'
  font_size: number
  color: string
  bg_color: string
}

/** 获取通道水印配置 */
export async function getWatermark(channelId: string): Promise<WatermarkConfig> {
  const { data } = await channelHttp.get(`/${channelId}/watermark`)
  return data?.data ?? data
}

/** 设置通道水印配置 */
export async function updateWatermark(channelId: string, config: Partial<WatermarkConfig>): Promise<WatermarkConfig> {
  const { data } = await channelHttp.put(`/${channelId}/watermark`, config)
  return data?.data ?? data
}

// ╒═════════════════════════════════════════════════════
// [P1-2] 片段下载
// ═════════════════════════════════════════════════════

/** 下载指定时间范围的录像片段 */
export async function downloadSegment(params: {
  device_id: string
  channel_id?: string
  start_time: string
  end_time: string
}): Promise<void> {
  const { data } = await recordingHttp.post('/download-segment', params)
  const url = data?.data?.download_url
  if (!url) throw new Error('download_url not provided by backend')
  // [FIX rec-dl 2026-09-11] GB28181 downloadStart 空实现时, 后端 fallback 会把本地
  //   磁盘绝对路径 (如 /data/recordings/...) 当 download_url 返回——a.href 磁盘路径
  //   被浏览器当站内相对 URL → 恒 404。合法直链仅 http(s):// 与 nginx /record/ 静态路径。
  if (!/^https?:\/\//.test(url) && !url.startsWith('/record/')) {
    throw new Error('后端未返回可用下载直链，请改用列表中的「下载」按钮')
  }
  const a = document.createElement('a')
  a.href = url
  a.download = `segment_${params.start_time}_${params.end_time}.mp4`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ╒═════════════════════════════════════════════════════
// [P2-1] 存储容量预估
// ═════════════════════════════════════════════════════

export interface StorageEstimate {
  channels: number
  hours_per_day: number
  bitrate_kbps: number
  retention_days: number
  gb_per_channel_per_day: number
  total_gb: number
  total_tb: number
  recommended_disk_tb: number
}

/** 计算存储容量预估 */
export async function getStorageEstimate(params: {
  channel_count?: number
  hours_per_day?: number
  bitrate_kbps?: number
  retention_days?: number
}): Promise<StorageEstimate> {
  const { data } = await axios.get('/api/v1/recording/storage-estimate', { params })
  return data?.data?.estimation ?? data?.estimation
}
