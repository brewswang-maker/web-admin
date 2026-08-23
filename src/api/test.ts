/**
 * 事件模板全链路测试 API
 * api/test.ts — 图片推理 + 事件注入测试接口
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

/** 图片推理检测结果项 */
export interface DetectionResult {
  class_name: string
  confidence: number
  x1: number
  y1: number
  x2: number
  y2: number
}

/** 匹配规则详情 */
export interface MatchedRule {
  rule_id: string
  rule_name: string
  matched: boolean
  /** 规则冷却中 (cooldown_ms 内重复触发被抑制) */
  cooldown_active?: boolean
  /** [FIX 2026-08-18] 未命中具体原因 (细分到 事件类型/通道/设备/严重度/置信度; 命中时为"全部条件匹配") */
  match_reason?: string
}

/** 图片推理响应 */
export interface InferImageResult {
  detections: DetectionResult[]
  detection_count: number
  inference_ms: number
  algo_id: string
  image_width: number
  image_height: number
  alarm_triggered: boolean
  /** 语义校验拒绝: 图片检出类别与事件类型不一致, 后端拒绝触发告警 */
  alarm_rejected?: boolean
  /** 拒绝原因说明 */
  reject_reason?: string
  alarm_type?: string
  matched_rules: MatchedRule[]
  ws_pushed: boolean
  /** [FIX 2026-08-15] 实际推理后端: tpu/onnx/opencv_dnn/cpu_fallback/
   *  quality_skip/not_found; 空字符串 = 插件未执行推理 */
  infer_backend?: string
  /** [FIX 2026-08-15] 0 检测框根因说明 (仅 detection_count=0 时返回) */
  zero_detection_reason?: string
}

/** 事件可测性分类项 */
export interface EventCoverageItem {
  test_mode: 'image' | 'synthesis'
  algo_id: string | null
  reason: string
}

/** 事件可测性矩阵 */
export interface EventCoverage {
  coverage: Record<string, EventCoverageItem>
  image_drivable_count: number
  synthesis_only_count: number
  total_events: number
  coverage_percent: number
}

/** 合成事件触发结果 */
export interface TestTriggerResult {
  matched: boolean
  alarm_type: string
  channel_id_str: string
  matched_rules: MatchedRule[]
  simulated_actions: string[]
  triggered: boolean
}

export const testApi = {
  /** 图片推理测试 */
  inferImage(data: {
    image_base64: string
    algo_id: string
    confidence_threshold?: number
    trigger_alarm?: boolean
    alarm_type?: string
    /** [FIX 2026-08-18] 演练事件严重度 1-5, 默认 4 (=真实链路 reportSimple 0.7f 换算值), 影响 dryRun 规则匹配 */
    severity?: number
  }) {
    return http.post<ApiResponse<InferImageResult>>('/test/infer-image', data)
  },

  /** 获取事件可测性矩阵 */
  getEventCoverage() {
    return http.get<ApiResponse<EventCoverage>>('/test/event-coverage')
  },

  /** 合成事件触发 (复用已有 test-trigger 端点) */
  triggerEvent(data: {
    alarm_type: string
    channel_id_str?: string
    severity?: number
    confidence?: number
  }) {
    return http.post<ApiResponse<TestTriggerResult>>(
      '/linkage/engines/test-trigger', data
    )
  },

  /** 将 File 转为 base64 (去除 data:image/xxx;base64, 前缀) */
  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.includes(',') ? result.split(',')[1] : result
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  },
}
