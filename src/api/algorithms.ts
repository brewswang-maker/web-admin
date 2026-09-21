/**
 * Algorithms API — 算法插件管理
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface AlgorithmInfo {
  id: string
  name: string
  name_zh?: string
  name_en?: string
  algo_id?: string
  type: string
  version: string
  description: string
  category: string
  accuracy: number
  fps: number
  enabled: boolean
  alarm_type?: string
  config?: Record<string, unknown>
}

/** [M2-1 2026-09-21] param_meta 参数元数据 (SSOT: 算法 YAML 顶层 param_meta 节;
 *  规格 docs/plans/算法参数元数据模型_规格_v1.0.md §3.2 十五字段) */
export interface ParamMeta {
  key: string
  name: string
  name_en?: string
  description?: string
  type: 'number' | 'boolean' | 'string' | 'enum'
  default?: unknown
  min?: number
  max?: number
  step?: number
  unit?: 's' | 'ms' | 'frame' | 'ratio' | 'percent' | 'degree'
  options?: { value: string; label: string }[]
  regexpr?: string
  dependsOn?: { key: string; equals?: unknown; in?: unknown[] }
  level: 'basic' | 'advanced'
  failedTip?: string
  scope: 'runtime' | 'calibration' | 'audit'
  tier_member?: boolean
  /** [M4-4 2026-09-21] 可选 UI 控件提示 (规格 §3.2 v1.1 增量):
   *  textarea = 多行文本域 (提示词/长文本); 缺省 = 单行输入框 */
  widget?: 'textarea'
}

/** GET /algorithms/:id/param-meta 响应体 data */
export interface ParamMetaData {
  algo_id: string
  /** [M4-4 2026-09-21] 算法中文名 — 卡片标题优先用它 (object_detected 映射到
   *  开放词汇检测时显示算法名而非事件类型显示名) */
  algo_name?: string
  params: ParamMeta[]
  tier?: { current: string; presets: Record<string, Record<string, unknown>> }
}

/** GET /algorithms/:id/config 响应体 data (有 param_meta 算法) */
export interface AlgoConfigData {
  algo_id: string
  values: Record<string, unknown>
  source?: Record<string, string>
  sensitivity_tier?: string
}

const algorithmsApi = {
  /** 算法列表 (分页, 默认 pageSize=50, 仅适合分页展示场景) */
  list(params?: { category?: string; enabled?: boolean }) {
    return http.get<ApiResponse<AlgorithmInfo[]>>('/algorithms', { params })
  },

  /**
   * 全量算法列表 (不分页)
   * [FIX 2026-08-15] /algorithms 默认只返回前 50 条, 需要完整算法清单的
   * 场景 (事件测试抽屉算法选择等) 必须用此接口, 否则睡岗/危险物品/OCR
   * 等后 15 个算法不可见。
   */
  listAll(params?: { category?: string; enabled?: boolean }) {
    return http.get<ApiResponse<AlgorithmInfo[]>>('/algorithms/all', { params })
  },

  /** 算法配置 */
  getConfig(id: string) {
    return http.get<ApiResponse<Record<string, unknown>>>(`/algorithms/${id}/config`)
  },

  /** 更新算法配置 */
  updateConfig(id: string, config: Record<string, unknown>) {
    return http.put<ApiResponse<void>>(`/algorithms/${id}/config`, config)
  },

  /**
   * [M2-1 2026-09-21] 参数元数据 + 档位预设 (含别名链解析)。
   * 无 param_meta 算法返回 params: [] (前端走存量分支; 双轨共存)。
   */
  getParamMeta(id: string) {
    return http.get<ApiResponse<ParamMetaData>>(`/algorithms/${id}/param-meta`)
  },

  /**
   * [M2-1 2026-09-21] 参数表单保存 (部分更新语义; 仅合并请求体中的键)。
   * 后端校验: 键∈param_meta & scope=runtime & 值域; 持久化 box_config,
   * 重启后生效 (restart_required)。
   */
  updateAlgoParams(id: string, values: Record<string, unknown>) {
    return http.put<ApiResponse<{ applied: string[]; restart_required: boolean; sensitivity_tier?: string }>>(
      `/algorithms/${id}/config`, values)
  },

  /**
   * [M2-1 2026-09-21] 灵敏度档位切换 (整组覆盖; 复用各算法 tier 端点骨架)。
   * algoKey = 节名尾段 (如 fall / personal-item)。
   */
  setAlgoTier(algoKey: string, tier: string) {
    return http.put<ApiResponse<{ tier: string; applied: Record<string, unknown>; restart_required?: boolean }>>(
      `/algo/${algoKey}/tier`, { tier })
  }
}

export default algorithmsApi
