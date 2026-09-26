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
 * [5] PUT /agent/subscriptions/:id 状态迁移 / 局部更新
 * action: confirm (DRAFT→SANDBOX, 需编译产物) | activate (SANDBOX→ACTIVE,
 * 需先 verify 达标否则 1409 SUB_VERIFY_NOT_PASSED) | pause | resume |
 * clear_error (清除 last_error, [P1-3 2026-09-25]); 缺省 = 局部更新
 * (name / notify_channels / channels / notify_user_ids)
 * [P1-2 2026-09-25 配置可改] 通知类字段变更由后端以现有 compiled_json 作草稿
 * 原地重建载体规则 (零 LLM); 激活态重建后自动恢复启用, 失败回 1500
 * SUB_RULE_REBUILD_FAILED 且行零变化
 */
export function updateSubscription(
  id: string,
  data: {
    action?: 'confirm' | 'activate' | 'pause' | 'resume' | 'clear_error'
    name?: string
    notify_channels?: string[]
    channels?: string[]
    notify_user_ids?: string[]
  }
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

/** [7] DELETE /agent/subscriptions/:id
 *  [P1-1 2026-09-25 删除死角] DRAFT/SANDBOX/PAUSED 可硬删 (后端级联清载体
 *  规则 agent-sub-<id>); ACTIVE 拒 → SUB_ACTIVE_DELETE_DENIED (先 pause
 *  两级确认防误删在线订阅) */
export function deleteSubscription(id: string) {
  return http.delete<ApiResponse<{ removed: string; rule_id: string }>>(
    `/agent/subscriptions/${id}`
  )
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
  /** [P2-2 B3] 超时重试消耗次数 (观测用) */
  timeout_retries?: number
  /** [P2-3 C1/C2] 异通道样本数: 订阅通道 24h 无样本时第二遍放开取证 —
   *  计入链路可执行性但命中不计 hits (场景无关噪声); 0 = 全部来自订阅通道 */
  off_channel_samples?: number
  /** 规则类: 24h 匹配事件记录数 */
  rule_events_24h: number
  evidence_frames: string[]
  evidence_summary: string
  elapsed_ms: number
  error_message: string
}

/** [8] POST /agent/subscriptions/:id/verify wait=true 同步模式 (仅 SANDBOX 态)
 *  next: confirm_activate = 达标可人工激活; shadow_observe = 继续影子观察
 *  [FIX verify-timeout 2026-09-25 真机] 历史回放 = 逐帧 VLM 云推理, 实测
 *  89.5s (8 帧 × 5~14s), 最坏 ~112s; 默认 30s 必超时 (nginx /api/ 已同步放宽
 *  300s)。POST 本不在重试白名单, skipRetry 显式声明防未来白名单变化导致
 *  超时后白跑第二轮 VLM 重放。
 *  [P2-3 C3 2026-09-26] 已非前端主路径 — 默认走 startVerifyTask 异步轮询;
 *  本函数保留为兼容口径 (后端默认 wait=true 同步响应, 设备二进制/前端
 *  非同批更新时旧页面仍可用)。 */
export function verifySubscription(id: string) {
  return http.post<ApiResponse<VerifyTaskDone>>(
    `/agent/subscriptions/${id}/verify`,
    {},
    { timeoutMs: 300_000, skipRetry: true }
  )
}

/** [P2-3 C3] verify 异步任务协议: done 态与同步响应同构
 *  (report/meets_threshold/next 三字段同一来源, 副作用已在后端完成回调发生) */
export interface VerifyTaskDone {
  report: VerifyReport
  meets_threshold: boolean
  next: 'confirm_activate' | 'shadow_observe'
}

export interface VerifyTaskPoll extends Partial<VerifyTaskDone> {
  status: 'running' | 'done'
  sub_id?: string
}

/** [P2-3 C3] POST /agent/subscriptions/:id/verify wait=false 异步启动 —
 *  立返 {task_id} 不占 REST 线程 90s+; 同订阅已有运行中任务 → 1409
 *  SUB_VERIFY_RUNNING (防重复点击重复烧 VLM) */
export function startVerifyTask(id: string) {
  return http.post<ApiResponse<{ task_id: string; status: string }>>(
    `/agent/subscriptions/${id}/verify`,
    { wait: false },
    { skipRetry: true }
  )
}

/** [P2-3 C3] GET /agent/verify-tasks/:task_id 轮询任务 — running → 状态;
 *  done → 同步响应同构协议; 任务内存态 (30min 过期/上限 32 条),
 *  不存在 → 1404 VERIFY_TASK_NOT_FOUND */
export function getVerifyTask(taskId: string) {
  return http.get<ApiResponse<VerifyTaskPoll>>(
    `/agent/verify-tasks/${taskId}`
  )
}
