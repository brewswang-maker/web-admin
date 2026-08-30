/**
 * retrieval.ts — 智能检索 API [P0-B 2026-08-30]
 *
 * 三模式封装 (实施计划 P0-B / 方案 v1.0 §4):
 *   1. P4-E 混合检索  GET /api/v1/retrieval/persons   (face|attr|hybrid)
 *   2. 以文搜图       GET /api/v1/images/search?nl=
 *   3. 以图搜图       POST /api/v1/images/search-by-image  [P0-A]
 *
 * 错误语义 (P0-A 口径): 501 = 图像塔未就绪 (响应 data.reason + bmodel_expected
 * 指引, UI 显式展示激活指引而非伪装空结果) / 400 参数非法 / 401|403 RBAC。
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'
import {
  isRegisteredAttributeKey,
  allowedOps,
  getAttributeKeyDef,
  ATTRIBUTE_KEYS,
  type AttributeKeyKind,
} from './attributeKeys'

// ── P4-E 混合检索 ────────────────────────────────────────────────

export type RetrievalMode = 'face' | 'attr' | 'hybrid'

/** attr 条件 (P4-B 白名单 key + 算子契约: == != > >= < <= exists not_exists) */
export interface AttrCondition {
  key: string
  op: string
  value: number
}

export interface RetrievalQuery {
  mode: RetrievalMode
  /** face/hybrid 必需 (512 维向量; 后端兼容逗号分隔字符串) */
  embedding?: number[]
  /** attr 条件数组 (op 值域由 attributeKeys.allowedOps 按 kind 收敛) */
  conditions?: AttrCondition[]
  channel_id?: string
  alarm_type?: string
  /** 毫秒时间戳 */
  start_time?: number
  end_time?: number
  /** ≤50 */
  top_k?: number
  /** ≤200 */
  limit?: number
  /** hybrid 时空关联窗口 (默认 60000) */
  window_ms?: number
}

export interface RetrievalItem {
  alarm_id?: string
  person_id?: string
  face_similarity?: number
  attr_score?: number
  score?: number
  channel_id?: string | number
  channel_id_str?: string
  timestamp?: number
  file_path?: string
  snapshot_base64?: string
  alarm_type?: string
  description?: string
  [k: string]: unknown
}

// ── 以文搜图 / 以图搜图 ──────────────────────────────────────────

export interface ImageSearchItem {
  image_id: string
  source_type: string
  channel_id: string
  timestamp: number
  file_path: string
  confidence: number
  tags: string[]
  similarity: number
  match_reason?: string
}

export interface ImageByImageQuery {
  /** jpeg base64 (不含 data: 前缀) */
  image_base64: string
  top_k?: number
  min_similarity?: number
  channel_id?: string
  start_time?: number
  end_time?: number
}

/** P0-A 501 响应体 (图像塔未就绪指引) */
export interface ImageTowerUnavailable {
  reason: 'image_tower_not_wired' | 'image_embed_failed'
  hint: string
  bmodel_expected: string
}

/** 条件白名单前端拦截 (计划 P0-B 验收: 非法 key 拦截) */
export function validateConditions(conds: AttrCondition[]): string | null {
  for (const c of conds) {
    if (!isRegisteredAttributeKey(c.key)) {
      return `未注册的属性 key: ${c.key} (P4-B 白名单拦截)`
    }
    if (!c.op) return `条件 ${c.key} 缺少算子`
    if (!allowedOps(kindOf(c.key)).includes(c.op)) {
      return `条件 ${c.key} 不允许算子 ${c.op}`
    }
    if (Number.isNaN(c.value)) return `条件 ${c.key} 的 value 非数值`
  }
  return null
}

function kindOf(key: string): AttributeKeyKind {
  return getAttributeKeyDef(key)?.kind ?? 'score'
}

const ATTRIBUTE_KEYS_OPTIONS = ATTRIBUTE_KEYS.map((d) => ({
  value: d.key,
  label: `${d.key} (${d.group})`,
}))

/** attr 条件 key 下拉选项 (P4-B 白名单, 供视图复用) */
export function attributeKeyOptions() {
  return ATTRIBUTE_KEYS_OPTIONS
}

export const retrievalApi = {
  /** P4-E 混合检索 (face 需检索权限; 后端 403 时 UI 提示申请 retrieval:face) */
  async searchPersons(q: RetrievalQuery): Promise<ApiResponse<{ items: RetrievalItem[]; total?: number; mode?: string }>> {
    const params: Record<string, unknown> = { mode: q.mode }
    if (q.embedding && q.embedding.length) params.embedding = q.embedding.join(',')
    if (q.conditions && q.conditions.length) params.conditions = JSON.stringify(q.conditions)
    if (q.channel_id) params.channel_id = q.channel_id
    if (q.alarm_type) params.alarm_type = q.alarm_type
    if (q.start_time) params.start_time = q.start_time
    if (q.end_time) params.end_time = q.end_time
    if (q.top_k) params.top_k = q.top_k
    if (q.limit) params.limit = q.limit
    if (q.window_ms) params.window_ms = q.window_ms
    const r = await http.get<ApiResponse<{ items: RetrievalItem[]; total?: number; mode?: string }>>(
      '/retrieval/persons', { params }
    )
    return r.data
  },

  /** 以文搜图 (P3-3 端点; [校园二期增强] 可选 startMs/endMs 毫秒时间窗, 后端 searchWithFilter 窗口裁剪) */
  async searchByNL(
    nl: string,
    topK = 10,
    opts?: { startMs?: number; endMs?: number },
  ): Promise<ApiResponse<{ items: ImageSearchItem[]; total?: number }>> {
    const params: Record<string, unknown> = { nl, top_k: topK }
    if (opts?.startMs) params.start_ms = opts.startMs
    if (opts?.endMs) params.end_ms = opts.endMs
    const r = await http.get<ApiResponse<{ items: ImageSearchItem[]; total?: number }>>(
      '/images/search', { params }
    )
    return r.data
  },

  /** 以图搜图 [P0-A]。501 时抛出携带 ImageTowerUnavailable 信息的 ApiError */
  async searchByImage(q: ImageByImageQuery): Promise<ApiResponse<{ items: ImageSearchItem[]; total?: number }>> {
    const body: Record<string, unknown> = { image_base64: q.image_base64 }
    if (q.top_k) body.top_k = q.top_k
    if (q.min_similarity) body.min_similarity = q.min_similarity
    if (q.channel_id) body.channel_id = q.channel_id
    if (q.start_time) body.start_time = q.start_time
    if (q.end_time) body.end_time = q.end_time
    const r = await http.post<ApiResponse<{ items: ImageSearchItem[]; total?: number }>>(
      '/images/search-by-image', body, { skipRetry: true }
    )
    return r.data
  },

  /** [校园二期增强 2026-08-30] 跨镜轨迹 (GET /retrieval/trajectory, P1-B 端点):
   *  global_id 或 (camera_id+track_id) 二选一; 节点 = ReIDGallery 内存库 entries
   *  × alarm_events 时空关联。诚实口径: gallery 内存态 LRU (默认 5min), 重启即失。 */
  async getTrajectory(
    q: { global_id?: number; camera_id?: number; track_id?: number; window_ms?: number },
  ): Promise<ApiResponse<TrajectoryResult>> {
    const params: Record<string, unknown> = {}
    if (q.global_id) params.global_id = q.global_id
    if (q.camera_id) params.camera_id = q.camera_id
    if (q.track_id) params.track_id = q.track_id
    if (q.window_ms) params.window_ms = q.window_ms
    const r = await http.get<ApiResponse<TrajectoryResult>>('/retrieval/trajectory', { params })
    return r.data
  },
}

/** 跨镜轨迹节点 (后端 GET /retrieval/trajectory nodes[], ts 升序) */
export interface TrajectoryNode {
  camera_id: number
  track_id: number
  ts_ms: number
  hit_count?: number
  class_name?: string
  /** 时空关联命中的告警 (±window_ms 内最近一条, 可能缺省) */
  alarm_id?: string
  alarm_type?: string
  snapshot_path?: string
  channel_id_str?: string
  channel_name?: string
  delta_ms?: number
}

export interface TrajectoryResult {
  global_id: number
  total: number
  channel_count: number
  nodes: TrajectoryNode[]
  reason?: string
  retention?: {
    storage: string
    window_ms: number
    note: string
  }
}

/** 从 ApiError/响应中提取 P0-A 501 指引 (供 UI 展示 CLIP 激活指引) */
export function extractTowerUnavailable(err: unknown): ImageTowerUnavailable | null {
  const e = err as { response?: { status?: number; data?: { data?: ImageTowerUnavailable } }, code?: number }
  const status = e?.response?.status
  const data = e?.response?.data?.data
  if ((status === 501 || e?.code === 501) && data) return data
  return null
}
