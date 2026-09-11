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
  // 双层为磁盘真实结构 (nginx 只有双层命中), 单层恒 404 已被实测排除
  const double = path.startsWith('/record/record/')
    ? path
    : '/record/record/' + path.slice('/record/'.length)
  const cands = [`${window.location.origin}${double}`]
  const hn = window.location.hostname
  if (hn) cands.push(`http://${hn}:8088${double}`)
  return cands
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
  // [FIX rec-dl 2026-09-11] 同 downloadSegment「合法直链才触发」校验: 仅 http(s):// 与
  //   /record/ 静态路径视为合法; 磁盘绝对路径 (如 /data/shield/record/...) 直接抛错,
  //   避免 a.href 被浏览器相对化 → 恒 404 且不弹新窗口验收项被破坏。
  if (!/^https?:\/\//.test(url) && !url.startsWith('/record/')) {
    throw new Error('后端未返回可用下载直链')
  }
  const filename = resp.data?.data?.filename || `${Date.now()}.mp4`
  // 候选链逐个尝试 fetch → blob (CORS: Drogon /record/ 返回 Access-Control-Allow-Origin: *)
  let blob: Blob | null = null
  for (const candidate of recordUrlCandidates(url)) {
    try {
      const dl = await fetch(candidate)
      if (dl.ok) {
        blob = await dl.blob()
        break
      }
    } catch {
      // 网络/CORS 失败 → 试下一候选
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

/** 删除录像 */
export function deleteRecording(id: string) {
  return recordingHttp.delete<ApiResponse<void>>(`/${id}`)
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
