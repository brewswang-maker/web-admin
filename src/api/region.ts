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
    return http.get<{ regions: RegionDef[] }>('/algos/regions', { params })
  },
  createRegion(body: Omit<RegionDef, 'id' | 'created_at' | 'updated_at'>) {
    return http.post<{ id: number; region: RegionDef }>('/algos/regions', body)
  },
  deleteRegion(id: number) {
    return http.delete<{ ok: boolean }>(`/algos/regions/${id}`)
  },

  // ----- Tripwires -----
  listTripwires(params: { channel_id: number; algo_id?: string } = { channel_id: 0 }) {
    return http.get<{ tripwires: TripwireDef[] }>('/algos/tripwires', { params })
  },
  createTripwire(body: Omit<TripwireDef, 'id' | 'created_at' | 'updated_at'>) {
    return http.post<{ id: number; tripwire: TripwireDef }>('/algos/tripwires', body)
  },
  /** [FIX 2026-08-28] 双流实例适配: 同一绊线写主形态 + _ch0 镜像两条, 返回主形态 id。
   *  背景: GB28181 主/子码流是两个推理实例, 插件分别以不带/带 _ch0 的
   *  channel_id_str 精确查询绊线 (RegionStore 无后缀归一) → 单条记录必有一半
   *  实例 miss (日志表现 GATE-MISS)。镜像创建失败不阻塞 (主形态仍可用)。 */
  async createTripwireWithMirror(body: Omit<TripwireDef, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const res = await http.post<{ id: number }>('/algos/tripwires', body)
    // [FIX 2026-08-28] http 拦截器不剥业务壳: id 在 res.data.data.id
    const mainId = res.data?.data?.id ?? res.data?.id ?? 0
    if (body.channel_id_str) {
      try {
        await http.post('/algos/tripwires', { ...body, channel_id_str: `${body.channel_id_str}_ch0` })
      } catch { /* 镜像失败不阻塞 */ }
    }
    return mainId
  },
  deleteTripwire(id: number) {
    return http.delete<{ ok: boolean }>(`/algos/tripwires/${id}`)
  },

  // ----- Counting zones -----
  listCountingZones(params: { channel_id: number; algo_id?: string } = { channel_id: 0 }) {
    return http.get<{ counting_zones: CountingZoneDef[] }>(
      '/algos/counting-zones',
      { params }
    )
  },
  createCountingZone(body: Omit<CountingZoneDef, 'id' | 'created_at'>) {
    return http.post<{ id: number; counting_zone: CountingZoneDef }>(
      '/algos/counting-zones',
      body
    )
  },
  deleteCountingZone(id: number) {
    return http.delete<{ ok: boolean }>(`/algos/counting-zones/${id}`)
  },

  // ----- 🆕 v5.0 [Tailgating 区域版]: Passageways (多边形通行区) -----
  listPassageways(
    params: { channel_id?: number; channel_id_str?: string; algo_id?: string } = {}
  ) {
    return http.get<{ passageways: PassagewayDef[] }>(
      '/algos/passageways',
      { params }
    )
  },
  createPassageway(body: Omit<PassagewayDef, 'id' | 'created_at' | 'updated_at'>) {
    return http.post<PassagewayDef>('/algos/passageways', body)
  },
  deletePassageway(id: number) {
    return http.delete<{ ok: boolean }>(`/algos/passageways/${id}`)
  },
  /** 手动触发老绊线迁移 (幂等, detector 首帧也会自动触发) */
  migratePassageways(algoId: string) {
    return http.post<{ algo_id: string; migrated: number }>(
      '/algos/passageways/migrate',
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
    }>('/algos/regions/stats')
  }
}
