/**
 * 校园模块 API — [校园方案 2026-08-30]
 * 数据源: GET /stats/campus_dashboard (KPI/趋势/五级分卡/通行出入口/基线/时延)
 *        GET /vlm/stats (VLM 异步研判量, 真实 pipeline 统计)
 * 禁 mock: 全部字段与后端 RestApiHandlers GET /api/v1/stats/campus_dashboard 契约对齐
 *          (docs/plans/校园整体解决方案设计_v1.0.md §4)
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'
import type { ScenePack, ScenePackApplyResult } from '@/types/largeEvent'

/** campus_dashboard 响应 (与后端端点实测结构一致) */
export interface CampusDashBucket { hr: number; cnt: number }
export interface CampusChannelBucket { channel: string; cnt: number }
export interface CampusLevelBucket { level: number; cnt: number }
export interface CampusBaselineBucket { key: string; total: number; false_alarms: number; false_alarm_rate: number }

export interface CampusDashboard {
  hours: number
  days: number
  kpi: {
    today_alarms: number
    today_passages: number
    pending_review: number
    total_events: number
    review_rate: number
  }
  alarm_trend: CampusDashBucket[]
  passage_trend: CampusDashBucket[]
  key_trend: CampusDashBucket[]
  by_level: CampusLevelBucket[]
  passage_by_channel: CampusChannelBucket[]
  by_type: CampusBaselineBucket[]
  by_channel: CampusBaselineBucket[]
  overall_rate: number
  feedback: {
    total_feedback: number
    true_positives: number
    false_positives: number
    unsure: number
    annotated_false_rate: number
  }
  action_latency: { p50_ms: number; p90_ms: number; avg_ms: number; sample_count: number } | null
}

/** /vlm/stats 响应 (VlmPipeline::getStats 直出) */
export interface VlmStats {
  images_submitted: number
  images_encoded: number
  tokens_generated_total: number
  total_vision_ms: number
  total_llm_ms: number
  mount_count: number
  unmount_count: number
  queue_depth: number
  vision_mounted: boolean
  ready: boolean
}

/** [校园二期 2026-08-30] /stats/tpu 推理调度水位 (IRM + InferenceScheduler 真实统计) */
export interface TpuStats {
  irm: {
    active_channels: number
    queued_tasks: number
    worker_threads: number
    tpu_utilization_pct: number
    avg_inference_ms: number
    avg_batch_size: number
    throughput_fps: number
    total_submitted: number
    total_completed: number
    total_skipped: number
    infer_exceptions: number
    config?: {
      worker_thread_count: number
      max_batch_size: number
      batch_timeout_ms: number
      max_queue_depth: number
      tpu_overload_threshold: number
    }
  }
  scheduler?: {
    active_channels: number
    active_inferences: number
    pending_tasks: number
    worker_threads: number
    avg_inference_ms: number
    scheduler_utilization: number
    total_inferences: number
    total_detections: number
    motion_gate?: {
      total_skipped: number
      total_inferred: number
      skip_rate_pct: number
    }
  }
  timestamp: number
}

export const schoolApi = {
  /** 校园总览聚合 (KPI/24h 三路趋势/五级分卡/通行出入口/基线/联动时延) */
  getCampusDashboard(params?: { hours?: number; days?: number }) {
    return http.get<ApiResponse<CampusDashboard>>('/stats/campus_dashboard', { params })
  },

  /** VLM 异步研判统计 (端侧 Qwen3-VL pipeline 真实水位) */
  getVlmStats() {
    return http.get<ApiResponse<VlmStats>>('/vlm/stats')
  },

  /** [校园二期] 推理调度水位 (并发/队列/TPU 利用率/跳帧率, 大屏调度水位卡数据源) */
  getTpuStats() {
    return http.get<ApiResponse<TpuStats>>('/stats/tpu')
  },

  // ─── [校园二期 2026-08-30] 场景包 (复用 /large-event/scene-packs SSOT 端点,
  //       ScenePackDefs.h 三个校园包 scene_tag=school_campus, 前端按 tag 过滤) ───
  listScenePacks() {
    return http.get<ApiResponse<{ scene_packs: ScenePack[]; count: number }>>(
      '/large-event/scene-packs')
  },

  /** apply: 仅校验 (deploy 缺省) / 校验并布防 (deploy=true 实例化 SC 模板为规则, 幂等) */
  applyScenePack(packId: string, opts?: { deploy?: boolean; channel_ids?: number[] }) {
    return http.post<ApiResponse<ScenePackApplyResult>>(
      `/large-event/scene-packs/${encodeURIComponent(packId)}/apply`,
      opts ?? {})
  },
}

/** 校园事件分组 SSOT — 与设计文档 §4.2 对齐 (子页列表过滤共用)
 *  键均为后端 canonical alarm_type (fight 非别名 fighting; 无 face_pass_blacklist 幽灵类型) */
export const SCHOOL_EVENT_SECTIONS = {
  perimeter: ['intrusion', 'tripwire', 'climbing', 'loitering', 'tailgate', 'face_tailgate'],
  behavior: ['fight', 'gathering', 'fall_detected', 'running', 'smoking', 'phone_call', 'field_intrusion'],
  access: ['face_pass_whitelist', 'face_pass_vip', 'face_pass_visitor', 'face_pass_staff', 'face_pass_custom', 'face_blacklist', 'face_verify_fail', 'face_tailgate'],
  visitor: ['face_stranger', 'face_pass_visitor', 'face_visitor_expired', 'face_blacklist'],
  safety: ['unattended_baggage', 'abandoned', 'object_removal', 'person_with_backpack'],
} as const

export type SchoolSectionKey = keyof typeof SCHOOL_EVENT_SECTIONS
