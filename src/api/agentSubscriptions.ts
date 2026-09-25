/**
 * 华盾AI智能视频盒子 v7.0 - 智能订阅 API (NL 事件订阅)
 * api/agentSubscriptions.ts — 自然语言订阅编译预览/CRUD/手动采样/SANDBOX 验证
 * 与后端 RestApiHandlers.cpp /agent/subscriptions 八端点完全对齐
 * [SUBSCRIBE 2026-09-22 NL事件订阅 P2] 前端入口批次; 契约以规格说明书 v1.1 §3.8 为准
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'

// ── 订阅状态机 (§7.1): DRAFT →(confirm)→ SANDBOX →(verify 达标)→ ACTIVE ⇄ PAUSED ──
export type SubscriptionStatus = 'DRAFT' | 'SANDBOX' | 'ACTIVE' | 'PAUSED'

/** 编译产物 (后端 compiled_json 解析后的对象; 预览失败回退字符串, 前端只读展示) */
export interface CompiledArtifact {
  /** 语义类 = vlm_task; 规则类 = linkage_rule */
  kind?: string
  need_vlm?: boolean
  vlm_prompt?: string
  [key: string]: unknown
}

/** 订阅实体 — 字段与后端 subscriptionToJson 一一对应 */
export interface AgentSubscription {
  id: string
  name: string
  /** 自然语言描述 (创建输入, ≤15 字, 后端 subscriptionUtf8Len 校验) */
  nl_text: string
  compiled?: CompiledArtifact | string
  status: SubscriptionStatus
  /** 动作通知通道 (web_popup/email/phone/sms 等, 后端 notifyChannelToString) */
  notify_channels: string[]
  /** [P2 2026-09-25 多用户通知对象] 订阅通知接收人 user_id 列表 (空 = 仅创建者
   *  本人; PHONE/SMS/EMAIL 通道按此展开 user_ids, 多人值班场景对标萤石群组分享) */
  notify_user_ids?: string[]
  /** 监控通道 id 列表 (string; 空 = 全通道) */
  channels: string[]
  created_by?: string
  created_at?: string
  updated_at?: string
  last_error?: string
  /** 最近命中时间戳 ms (影子观察期也记账 — verify 达标判定输入) */
  last_hit_at?: number
  /** [P3 2026-09-24] 累计命中次数 (订阅级聚合: 冷却抑通知不丢计) */
  hit_count?: number
}

/** 编译预览响应 — kind/need_vlm 是确认弹层分流文案的依据 */
export interface CompilePreviewResult {
  preview: CompiledArtifact
  kind: string
  need_vlm: boolean
  nl_text: string
}

/** 手动采样响应 (POST :id/sample) — hit 已含 NO VIDEO 哨兵过滤 */
export interface SubscriptionSampleResult {
  hit: boolean
  confidence: number
  evidence: string
  /** ok=真实判定; disabled=VLM 后端未启用; timeout/error 如实透传 */
  status: string
  latency_ms: number
  /** 是否已注入 LinkageEngine (hit 且规则启用时 true) */
  injected: boolean
  snapshot_url?: string
}

export interface CreateSubscriptionReq {
  nl_text: string
  name: string
  /** 创建必须携带确认过的预览产物本体 (compile-preview 响应的 .preview 字段)。
   *  [FIX sub-preview 2026-09-24] 曾误传 CompilePreviewResult 整包装 — 后端
   *  RestApiHandlers L11328 req["preview"].dump() 直喂编译器, 顶层读不到
   *  target/action/mappable_event → 安全门 ContradictoryMapping 拒绝创建。 */
  preview: CompiledArtifact
  /** [P1-4 2026-09-25] 监控通道多选 (通道 id / 20 位国标码); 空 = 全通道
   *  (后端 SubscriptionVerifier 过滤含国标码兼容) */
  channels?: string[]
  /** [P1-1 2026-09-25] 通知方式多选 (canonical: ws/email/phone/tts_broadcast/sms;
   *  宽容别名 push/mail/call/tts 亦可; 空/缺失 → 后端兜底 WS) */
  notify_channels?: string[]
  /** [P2 2026-09-25 多用户通知对象] 通知接收人 user_id 列表 (多选; 空 = 仅创建者
   *  本人 — 后端 SubscriptionCompiler notifyRecipients 展开 PHONE/SMS/EMAIL user_ids) */
  notify_user_ids?: string[]
  /** [P3 2026-09-24] 电话提醒开关 (§4.3): true → notify_channels 含 phone */
  phone_notify?: boolean
}

// ── 八端点封装 (与 RestApiHandlers.cpp L11233-11610 一一对应) ──

/** [1] POST /agent/subscriptions/compile-preview 编译预览 (≤15 字 NL → 结构化产物) */
export function compilePreview(nlText: string) {
  return http.post<ApiResponse<CompilePreviewResult>>(
    '/agent/subscriptions/compile-preview',
    { nl_text: nlText }
  )
}

/** [2] POST /agent/subscriptions 创建 (确认后携带 preview 落库; 同 NL 重复 → SUB_DUPLICATE) */
export function createSubscription(data: CreateSubscriptionReq) {
  return http.post<ApiResponse<{ subscription: AgentSubscription }>>(
    '/agent/subscriptions',
    data
  )
}

/** [3] GET /agent/subscriptions 列表 (chip 卡片; status/channel 过滤) */
export function listSubscriptions(params?: { status?: string; channel?: string }) {
  return http.get<ApiResponse<{ subscriptions: AgentSubscription[] }>>(
    '/agent/subscriptions',
    { params }
  )
}

/** [4] GET /agent/subscriptions/:id 详情 */
export function getSubscription(id: string) {
  return http.get<ApiResponse<{ subscription: AgentSubscription }>>(
    `/agent/subscriptions/${id}`
  )
}

/**
 * [5] PUT /agent/subscriptions/:id 状态迁移/改名
 * action: confirm (DRAFT→SANDBOX, 需编译产物) | activate (SANDBOX→ACTIVE,
 * 需先 verify 达标否则 1409 SUB_VERIFY_NOT_PASSED) | pause | resume; 缺省 = 改名
 */
export function updateSubscription(
  id: string,
  data: { action?: 'confirm' | 'activate' | 'pause' | 'resume'; name?: string }
) {
  return http.put<ApiResponse<{ subscription: AgentSubscription }>>(
    `/agent/subscriptions/${id}`,
    data
  )
}

/** [6] POST /agent/subscriptions/:id/sample 手动采样 (仅 SANDBOX/ACTIVE; 全通道订阅须传 channel)
 *  channel 传通道标识字符串 (20 位国标码如 34020000001320002001 或数字 id), 后端原样映射 stream_id —
 *  不可转 Number (国标码超 2^53 会精度丢失) */
export function sampleSubscription(id: string, channel?: string) {
  return http.post<ApiResponse<SubscriptionSampleResult>>(
    `/agent/subscriptions/${id}/sample`,
    channel ? { channel } : {}
  )
}

/** [7] DELETE /agent/subscriptions/:id (MVP 仅 DRAFT 可硬删) */
export function deleteSubscription(id: string) {
  return http.delete<ApiResponse<{ message: string }>>(`/agent/subscriptions/${id}`)
}

/** SANDBOX 历史回放验证报告 — 字段与后端 SubscriptionVerifyReport 一一对应
 *  (口径: 验证「产物可执行 + 画面有效 + 无误报风暴」, 非命中竞赛 — 头文件注释) */
export interface VerifyReport {
  /** 有效样本充足 (语义类快照帧 ≥3 / 规则类 24h 事件记录 ≥1) */
  feasible: boolean
  /** 实际扫描帧数 (读文件失败不计; 规则类恒 0) */
  frames_scanned: number
  hits: number
  /** 无效画面帧 (NO VIDEO 哨兵拦截) */
  invalid_frames: number
  /** 真实跑通判定链的帧 (status=ok) */
  backend_ok_frames: number
  backend_failures: number
  /** 规则类: 24h 匹配事件记录数 */
  rule_events_24h: number
  evidence_frames: string[]
  evidence_summary: string
  elapsed_ms: number
  error_message: string
}

/** [8] POST /agent/subscriptions/:id/verify SANDBOX 历史回放验证 (仅 SANDBOX 态)
 *  next: confirm_activate = 达标可人工激活; shadow_observe = 继续影子观察 */
export function verifySubscription(id: string) {
  return http.post<ApiResponse<{
    report: VerifyReport
    meets_threshold: boolean
    next: 'confirm_activate' | 'shadow_observe'
  }>>(
    `/agent/subscriptions/${id}/verify`,
    {}
  )
}
