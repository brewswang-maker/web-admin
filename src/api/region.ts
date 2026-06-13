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
 *   GET    /api/v1/algos/regions/stats
 */

import { http } from './http'
import type { RegionDef, TripwireDef, CountingZoneDef } from '@/types/region'

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
