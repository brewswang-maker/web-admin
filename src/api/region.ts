/**
 * @file region.ts
 * @brief 28 算法补齐 P0-A4 — 算法区域/绊线/计数区 REST API 客户端
 *
 * 后端端点 (box-sdk/src/core/RestApiHandlers.cpp):
 *   GET    /api/v1/algos/regions
 *   POST   /api/v1/algos/regions
 *   DELETE /api/v1/algos/regions/:id
 *   GET    /api/v1/algos/tripwires
 *   POST   /api/v1/algos/tripwires
 *   DELETE /api/v1/algos/tripwires/:id
 *   GET    /api/v1/algos/counting-zones
 *   POST   /api/v1/algos/counting-zones
 *   DELETE /api/v1/algos/counting-zones/:id
 *   GET    /api/v1/algos/passageways          🆕 v5.0 尾随区域版
 *   POST   /api/v1/algos/passageways          🆕 v5.0
 *   DELETE /api/v1/algos/passageways/:id      🆕 v5.0
 *   POST   /api/v1/algos/passageways/migrate  🆕 v5.0 老绊线迁移
 *   GET    /api/v1/algos/regions/stats
 */

import { http } from './http'
import type { RegionDef, TripwireDef, CountingZoneDef, PassagewayDef } from '@/types/region'

export const regionApi = {
  // ----- Regions -----
  listRegions(params: { channel_id: number; algo_id?: string } = { channel_id: 0 }) {
    return http.get<{ regions: RegionDef[] }>('/api/v1/algos/regions', { params })
  },
  createRegion(body: Omit<RegionDef, 'id' | 'created_at' | 'updated_at'>) {
    return http.post<{ id: number; region: RegionDef }>('/api/v1/algos/regions', body)
  },
  deleteRegion(id: number) {
    return http.delete<{ ok: boolean }>(`/api/v1/algos/regions/${id}`)
  },

  // ----- Tripwires -----
  listTripwires(params: { channel_id: number; algo_id?: string } = { channel_id: 0 }) {
    return http.get<{ tripwires: TripwireDef[] }>('/api/v1/algos/tripwires', { params })
  },
  createTripwire(body: Omit<TripwireDef, 'id' | 'created_at' | 'updated_at'>) {
    return http.post<{ id: number; tripwire: TripwireDef }>('/api/v1/algos/tripwires', body)
  },
  deleteTripwire(id: number) {
    return http.delete<{ ok: boolean }>(`/api/v1/algos/tripwires/${id}`)
  },

  // ----- Counting zones -----
  listCountingZones(params: { channel_id: number; algo_id?: string } = { channel_id: 0 }) {
    return http.get<{ counting_zones: CountingZoneDef[] }>(
      '/api/v1/algos/counting-zones',
      { params }
    )
  },
  createCountingZone(body: Omit<CountingZoneDef, 'id' | 'created_at'>) {
    return http.post<{ id: number; counting_zone: CountingZoneDef }>(
      '/api/v1/algos/counting-zones',
      body
    )
  },
  deleteCountingZone(id: number) {
    return http.delete<{ ok: boolean }>(`/api/v1/algos/counting-zones/${id}`)
  },

  // ----- 🆕 v5.0 [Tailgating 区域版]: Passageways (多边形通行区) -----
  listPassageways(
    params: { channel_id?: number; channel_id_str?: string; algo_id?: string } = {}
  ) {
    return http.get<{ passageways: PassagewayDef[] }>(
      '/api/v1/algos/passageways',
      { params }
    )
  },
  createPassageway(body: Omit<PassagewayDef, 'id' | 'created_at' | 'updated_at'>) {
    return http.post<PassagewayDef>('/api/v1/algos/passageways', body)
  },
  deletePassageway(id: number) {
    return http.delete<{ ok: boolean }>(`/api/v1/algos/passageways/${id}`)
  },
  /** 手动触发老绊线迁移 (幂等, detector 首帧也会自动触发) */
  migratePassageways(algoId: string) {
    return http.post<{ algo_id: string; migrated: number }>(
      '/api/v1/algos/passageways/migrate',
      { algo_id: algoId }
    )
  },

  // ----- 诊断 -----
  getStats() {
    return http.get<{
      regions: number
      tripwires: number
      counting_zones: number
      tracker: {
        active_tracks: number
        confirmed_tracks: number
        last_update_ms: number
      }
    }>('/api/v1/algos/regions/stats')
  }
}
