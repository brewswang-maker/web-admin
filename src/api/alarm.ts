/**
 * 华盾AI智能视频盒子 v7.0 - 告警 API
 * api/alarm.ts — 告警事件、处理、统计相关接口
 */

import { alarmHttp, http } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'
import type { AlarmEvent, AlarmStats, AlarmQuery, AlarmHandleForm, AlarmTrendItem, AlarmTypeDistribution, AlarmEvidence } from '@/types/alarm'

/** [AGG-DETAIL 2026-09-12] ×N 展开明细行 (GET /alarms/:id/occurrences 原始形态,
 *  snake_case 直读 — 与 RestApiHandlers 端点字段一一对应, 零映射漂移) */
export interface AlarmOccurrence {
  alarm_id: string
  /** 归属首行 id (非空 = 明细行) */
  merged_into: string
  alarm_type: string
  level: number
  /** 触发时刻 (epoch ms) — UPDATE-only 时代此字段整条丢失 */
  timestamp: number
  channel_id: string
  channel_name?: string
  device_id?: string
  /** 快照 (本地路径/URL, 展示时经同款绝对化处理) */
  snapshot_url?: string
  confidence: number
  zone?: string
  track_id?: number
  trace_id?: string
}

export const alarmApi = {
  /** 获取告警列表 */
  getList(params?: AlarmQuery) {
    return alarmHttp.get<ApiResponse<PageResponse<AlarmEvent>>>('', { params })
  },

  /** 获取告警详情 */
  getDetail(id: string) {
    return alarmHttp.get<ApiResponse<AlarmEvent>>(`/${id}`)
  },

  /** [AGG-DETAIL 2026-09-12] ×N 展开: 查同窗被合并事件明细 (后端逐条保留
   *  时间/置信度/快照/track — 弹窗可合并, 列表证据链不丢)。
   *  返回后端原始 snake_case 行 (轻量直读, 不经 normalizeAlarmCore) */
  getOccurrences(id: string, limit = 50) {
    return alarmHttp.get<ApiResponse<{ items: AlarmOccurrence[]; total: number }>>(
      `/${id}/occurrences`,
      { params: { limit } },
    )
  },

  /** 处理告警 — Phase 13 P0 #4: 后端注册的是 PUT,前端用 POST 会 405 */
  handle(id: string, form: AlarmHandleForm) {
    return alarmHttp.put<ApiResponse<void>>(`/${id}/handle`, form)
  },

  /** 批量处理告警 — Phase 13 P0 #5: 后端新增 /alarms/batch-handle 端点 */
  batchHandle(ids: string[], form: AlarmHandleForm) {
    return alarmHttp.post<ApiResponse<{ ok: number; fail: number }>>('/batch-handle', { ids, form })
  },

  /** 批量确认 */
  batchConfirm(ids: string[], note?: string) {
    return alarmApi.batchHandle(ids, { status: 'confirmed', note })
  },

  /** 批量标记误报 */
  batchFalseAlarm(ids: string[], note?: string) {
    return alarmApi.batchHandle(ids, { status: 'false_alarm', note })
  },

  /** 获取告警统计 */
  getStats() {
    return alarmHttp.get<ApiResponse<AlarmStats>>('/stats')
  },

  /** 获取今日告警统计 */
  getTodayStats() {
    return alarmHttp.get<ApiResponse<AlarmStats>>('/stats/today')
  },

  /** 获取告警趋势 */
  getTrend(params: { period?: '7d' | '30d' | '90d'; startTime?: string; endTime?: string }) {
    return alarmHttp.get<ApiResponse<AlarmTrendItem[]>>('/trend', { params })
  },

  /** 获取告警类型分布 */
  getTypeDistribution(params?: { startTime?: string; endTime?: string }) {
    return alarmHttp.get<ApiResponse<AlarmTypeDistribution[]>>('/distribution', { params })
  },

  /** 获取未处理告警数量 */
  getUnhandledCount() {
    return alarmHttp.get<ApiResponse<{ count: number }>>('/unhandled-count')
  },

  /** 导出告警列表 */
  exportAlarms(params?: AlarmQuery) {
    return alarmHttp.get('/export', { params, responseType: 'blob' })
  },

  /** 获取告警快照 */
  getSnapshot(id: string) {
    return alarmHttp.get<ApiResponse<{ url: string }>>(`/${id}/snapshot`)
  },

  /** 获取告警视频片段 */
  getVideoClip(id: string) {
    return alarmHttp.get<ApiResponse<{ url: string }>>(`/${id}/video-clip`)
  },

  /** 转发告警 */
  forward(id: string, forwardTo: string, note?: string) {
    return alarmApi.handle(id, { status: 'forwarded', forwardTo, note })
  },

  // [P0-3] 工单流转便捷方法
  /** 确认收到告警 (ack) */
  acknowledge(id: string, note?: string) {
    return alarmApi.handle(id, { status: 'acknowledged', note })
  },

  /** 处置告警 (dispose) */
  dispose(id: string, disposition: string, assignee?: string) {
    return alarmApi.handle(id, { status: 'disposed', disposition, assignee })
  },

  /** [追加信息 2026-09-09] 已处置告警追加信息 — status='append' 专用语义:
   *  复用 handle 端点, 后端分流在状态机前 (不改主状态/接警单号), 原子读-拼-写
   *  disposition ("[追加 时间] 内容") + 独立表 alarm_append_logs INSERT;
   *  响应回传合并全文 disposition + 结构化新记录 appended */
  appendNote(id: string, content: string, handler?: string) {
    return alarmApi.handle(id, { status: 'append', note: content, handler })
  },

  /** 关闭告警 (close) */
  close(id: string, disposition?: string) {
    return alarmApi.handle(id, { status: 'closed', disposition })
  },

  /** 升级告警 (escalate) */
  escalate(id: string, note?: string) {
    return alarmApi.handle(id, { status: 'escalated', note })
  },

  /** 转派告警 (reassign) */
  reassign(id: string, assignee: string, note?: string) {
    return alarmApi.handle(id, { status: 'reassigned', assignee, note })
  },

  /** 获取告警证据链(快照+视频+AI分析+关联录像) */
  // §13 Fix E: 后端实际响应是 ApiResponse<{snapshot:{url,available}, video_clip:{url,available}, ...}>,
  // 前端 AlarmEvidence 是扁平结构, 这里做映射 (nested → flat) 后再返回
  async getEvidence(id: string): Promise<AlarmEvidence | null> {
    try {
      const res: any = await alarmHttp.get<ApiResponse<any>>(`/${id}/evidence`)
      // axios response -> ApiResponse -> data
      const d = res?.data?.data ?? res?.data
      if (!d) return null
      
      // 修复：增强对 videoClipUrl 的处理（含 snake_case 扁平 fallback）
      let videoClipUrl = d.video_clip?.url ?? d.videoClipUrl ?? d.video_clip_url ?? ''
      // 如果是相对路径，转为绝对路径
      if (videoClipUrl && !videoClipUrl.startsWith('http') && !videoClipUrl.startsWith('data:')) {
        const base = window.location.origin
        videoClipUrl = videoClipUrl.startsWith('/') ? base + videoClipUrl : base + '/' + videoClipUrl
      }

      // 修复：确保 snapshotUrl 是绝对路径（含 snake_case 扁平 fallback）
      let snapshotUrl = d.snapshot?.url ?? d.snapshotUrl ?? d.snapshot_url ?? ''
      if (snapshotUrl && !snapshotUrl.startsWith('http') && !snapshotUrl.startsWith('data:')) {
        const base = window.location.origin
        snapshotUrl = snapshotUrl.startsWith('/') ? base + snapshotUrl : base + '/' + snapshotUrl
      }

      console.log('[alarmApi] getEvidence raw:', JSON.stringify(d).substring(0, 300))
      console.log('[alarmApi] getEvidence resolved snapshotUrl:', snapshotUrl, 'videoClipUrl:', videoClipUrl)
      
      // [FIX evidence-nan 2026-09-07] detectionBoxes 数据源修正: 后端 evidence
      //   响应的 d.metadata 是告警 metadata 整体 (数组首元素含 detections/bbox/
      //   class_name), 旧代码整对象直接塞表格 → label/confidence 列 undefined
      //   → 置信度 NaN% / 位置 [, , , ] (真机证据链弹窗实录)。正确链:
      //   metadata[0].detections (AlarmDispatcher 兜底产物, x1y1x2y2 像素坐标)
      //   → 归一为表格契约 x/y/w/h; 无 detections 时 bbox 单框合成;
      //   confidence 非有限数兑底 0 (防 NaN)。
      const mdRaw = d.metadata
      const md0: any = Array.isArray(mdRaw) && mdRaw.length && typeof mdRaw[0] === 'object'
        ? mdRaw[0]
        : (mdRaw && typeof mdRaw === 'object' ? mdRaw : {})
      const rawBoxes: any[] = Array.isArray(md0.detections) && md0.detections.length
        ? md0.detections
        : Array.isArray(d.detectionBoxes) ? d.detectionBoxes : []
      let detectionBoxes = rawBoxes.map((b: any) => {
        const x1 = Number(b.x1 ?? b.x ?? 0), y1 = Number(b.y1 ?? b.y ?? 0)
        const x2 = Number(b.x2 ?? (b.x ?? 0) + (b.w ?? 0)), y2 = Number(b.y2 ?? (b.y ?? 0) + (b.h ?? 0))
        const conf = Number(b.confidence)
        return {
          label: String(b.label ?? b.class_name ?? 'target'),
          confidence: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : 0,
          x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1),
        }
      })
      if (!detectionBoxes.length && Array.isArray(md0.bbox) && md0.bbox.length >= 4) {
        const [bx1, by1, bx2, by2] = md0.bbox.map(Number)
        const confTop = Number(d.confidence ?? md0.detect_confidence)
        detectionBoxes = [{
          label: String(md0.class_name ?? md0.class_name_zh ?? 'target'),
          confidence: Number.isFinite(confTop) && confTop >= 0 && confTop <= 1 ? confTop : 0,
          x: bx1, y: by1, w: Math.max(0, bx2 - bx1), h: Math.max(0, by2 - by1),
        }]
      }

      // [POPUP-GALLERY 2026-09-07] 取证帧提取: metadata[0] 的 pre/mid/post
      //   _snapshot_url (EvidenceFrameCache base64 直可用) — 证据链弹窗
      //   多图画廊数据源, 带语义角标; 无则空数组 (画廊退化单图)
      const evFrameDefs: Array<[string, string]> = [
        ['pre_snapshot_url', '事前'],
        ['mid_snapshot_url', '事中'],
        ['post_snapshot_url', '事后'],
      ]
      const evidenceFrames: Array<{ url: string; tag: string }> = []
      for (const [k, tag] of evFrameDefs) {
        const u = typeof md0[k] === 'string' ? md0[k] as string : ''
        if (u && !evidenceFrames.some(f => f.url === u)) evidenceFrames.push({ url: u, tag })
      }

      return {
        snapshotUrl,
        videoClipUrl,
        detectionBoxes,
        aiAnalysis: d.ai_analysis ?? d.aiAnalysis ?? '',
        relatedRecordingId: d.related_recording_id ?? d.relatedRecordingId ?? '',
        relatedRecordingTime: d.related_recording_time ?? d.relatedRecordingTime ?? '',
        evidenceFrames,
      }
    } catch {
      return null
    }
  },

  /** AI二次分析告警图片 */
  analyzeAlarm(id: string) {
    return alarmHttp.post<ApiResponse<{ analysis: string }>>(`/${id}/analyze`)
  }
}

// ── [AI-RQ 2026-09-20] VLM 审核队列快照 (GET /alarm/vlm/status 扩展的 queue 节) ──

/** 队列中一条待处理任务 (服务端 snake_case 原始形态直读) */
export interface VlmQueuePendingItem {
  alarm_id: string
  /** 入队时刻 (epoch ms) */
  enqueued_at: number
  /** 已等待时长 (ms) */
  age_ms: number
  /** 排序键 = 告警产生时间戳 (epoch ms) — 出队按此升序 */
  sort_key: number
  priority: number
  attempt: number
  source: string
}

/** [AI-RQ D9] 审核队列可观测快照 — /alarm/vlm/status 响应的 queue 节 */
export interface VlmQueueSnapshot {
  capacity: number
  /** 排队中条数 (不含正在处理) */
  depth: number
  concurrency: number
  /** 归序缓冲窗口 (ms) — 吸收多线程入队乱序 */
  sort_window_ms: number
  persist: boolean
  /** 当前正在复核的一条 (无则 null); snapshot_attached = 本次送审是否带快照图
   *  ([AI-RQ-SNAP 需求5 2026-09-20] 定位丢图事故) */
  current:
    | { alarm_id: string; elapsed_ms: number; attempt: number; snapshot_attached?: boolean }
    | null
  running_count: number
  /** 排队明细 (服务端封顶 32 条, 按 sort_key 升序) */
  pending: VlmQueuePendingItem[]
  /** 预计清空耗时 (ms) = depth × EMA 单条耗时; 无历史样本时不输出 */
  eta_ms_estimate?: number
  throughput?: { completed_last_60s: number; avg_verify_ms: number }
  /** 重启恢复累计条数 */
  recovered_count?: number
  /** [AI-RQ-SNAP 需求5] 排队中快照缺失条数 — 定位丢图事故 */
  snapshot_missing_count?: number
  /** [AI-RQ-SNAP 需求5] 最近 100 条送审带图比例 (0~1); 无样本时服务端不输出 */
  snapshot_attached_rate?: number
}

export interface VlmQueueStatus {
  effectiveEnabled: boolean | null
  queue: VlmQueueSnapshot | null
  /** [AI-RQ-SNAP 需求4] 拒绝无图送审累计数 (快照全缺失拦截); 端点不可用时 null */
  noSnapshotCount: number | null
}

/** [AI-RQ D9] 拉取审核队列快照 (随 /alarm/vlm/status 一起返回)。
 *  失败静默返回 null — 队列状态卡与弹窗位次文案均须容忍端点不可用,
 *  字段沿用拦截器 snake→camel 双键兼容读法 */
export async function fetchVlmQueueSnapshot(): Promise<VlmQueueStatus | null> {
  try {
    const r = await http.get<{ data?: Record<string, unknown> }>('/alarm/vlm/status')
    const d = r.data?.data
    if (!d) return null
    const rawEnabled = d.effective_enabled ?? d.effectiveEnabled
    const rawQueue = d.queue as VlmQueueSnapshot | undefined
    // [AI-RQ-SNAP 需求4] no_snapshot_count: 拦截计数顶层别名 (worker 未注入时为 null)
    const rawNoSnap = d.no_snapshot_count ?? d.noSnapshotCount
    return {
      effectiveEnabled: typeof rawEnabled === 'boolean' ? rawEnabled : null,
      queue: rawQueue ?? null,
      noSnapshotCount: typeof rawNoSnap === 'number' ? rawNoSnap : null,
    }
  } catch {
    return null
  }
}
