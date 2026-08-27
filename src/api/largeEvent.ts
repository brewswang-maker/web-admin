/**
 * @file largeEvent.ts
 * @brief 大型活动 EventGuard REST API 客户端 — Phase 0-1 (2026-08-27)
 *
 * 后端端点 (box-sdk/src/core/RestApiHandlers.cpp):
 *   GET    /api/v1/large-event/capacity-profiles         [T0.2] 容量档案列表
 *   POST   /api/v1/large-event/capacity-profiles         [T0.2] upsert
 *   DELETE /api/v1/large-event/capacity-profiles/:region_id [T0.2]
 *   GET    /api/v1/large-event/scene-packs               [T0.3] 五场景包
 *   POST   /api/v1/large-event/scene-packs/:id/apply     [T0.3] 应用 (v1 缺口报告)
 *   GET    /api/v1/metric/density/flow-field             [T1.2] 流速矢量场
 *   GET    /api/v1/metric/density/predict                [T1.4] 密度预测
 *   GET    /api/v1/metric/density/{latest,heatmap,history} [既有 v7.2]
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'
import type {
  CapacityProfile,
  ScenePack,
  ScenePackApplyResult,
  FlowFieldResponse,
  DensityPredictResponse,
  DensityLatestResponse,
  DensityHeatmapResponse,
  DensityHistoryEntry,
} from '@/types/largeEvent'

export const largeEventApi = {
  // ----- 容量档案 (§4.3.1) -----
  listCapacityProfiles(params: { scene_tag?: string } = {}) {
    return http.get<ApiResponse<{ profiles: CapacityProfile[]; count: number }>>(
      '/api/v1/large-event/capacity-profiles',
      { params }
    )
  },

  upsertCapacityProfile(
    body: Partial<CapacityProfile> & { region_id: string; design_capacity: number }
  ) {
    return http.post<ApiResponse<{ profile?: CapacityProfile; ok?: boolean }>>(
      '/api/v1/large-event/capacity-profiles',
      body
    )
  },

  deleteCapacityProfile(regionId: string) {
    return http.delete<ApiResponse<{ ok: boolean }>>(
      `/api/v1/large-event/capacity-profiles/${encodeURIComponent(regionId)}`
    )
  },

  // ----- 场景包 (§5) -----
  listScenePacks() {
    return http.get<ApiResponse<{ scene_packs: ScenePack[]; count: number }>>(
      '/api/v1/large-event/scene-packs'
    )
  },

  /** v1: 可用性校验 + 部署清单/缺口报告 (写侧配置下发留待 Phase 3) */
  applyScenePack(packId: string) {
    return http.post<ApiResponse<ScenePackApplyResult>>(
      `/api/v1/large-event/scene-packs/${encodeURIComponent(packId)}/apply`,
      {}
    )
  },

  // ----- 流速矢量场 (§4.3.2, 箭头叠加层数据源) -----
  getFlowField(channelId: number) {
    return http.get<ApiResponse<FlowFieldResponse>>(
      '/api/v1/metric/density/flow-field',
      { params: { channel_id: channelId } }
    )
  },

  // ----- 密度预测 (§4.3.4, 趋势曲线叠加) -----
  getDensityPredict(channelId: number, horizonMin = 15) {
    return http.get<ApiResponse<DensityPredictResponse>>(
      '/api/v1/metric/density/predict',
      { params: { channel_id: channelId, horizon_min: horizonMin } }
    )
  },

  // ----- 既有密度端点 (v7.2) -----
  getDensityLatest(channelId: number) {
    return http.get<ApiResponse<DensityLatestResponse>>(
      '/api/v1/metric/density/latest',
      { params: { channel_id: channelId } }
    )
  },

  getDensityHeatmap(channelId: number, colorScheme = 'jet') {
    return http.get<ApiResponse<DensityHeatmapResponse>>(
      '/api/v1/metric/density/heatmap',
      { params: { channel_id: channelId, color_scheme: colorScheme } }
    )
  },

  getDensityHistory(params: {
    channel_id?: number
    since_ms?: number
    until_ms?: number
    limit?: number
  }) {
    return http.get<
      ApiResponse<{ count: number; history: DensityHistoryEntry[] }>
    >('/api/v1/metric/density/history', { params })
  },
}
