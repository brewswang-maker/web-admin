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
  // [FIX tw-toggle 2026-09-08] + include_disabled: 同绊线开关先例。
  listRegions(params: { channel_id: number; algo_id?: string; channel_id_str?: string; include_disabled?: boolean } = { channel_id: 0 }) {
    return http.get<{ regions: RegionDef[] }>('/algos/regions', { params })
  },
  // [ROI-SYNC 2026-09-08] id 可选: 事件规则区域镜像 upsert 更新分支 (后端
  //   POST 读 req.value("id", 0), id>0 走 UPDATE) — 原 Omit<'id'> 无法传 id 更新。
  createRegion(body: Omit<RegionDef, 'id' | 'created_at' | 'updated_at'> & { id?: number }) {
    return http.post<{ id: number; region: RegionDef }>('/algos/regions', body)
  },
  deleteRegion(id: number) {
    return http.delete<{ ok: boolean }>(`/algos/regions/${id}`)
  },

  // ----- Tripwires -----
  // [FIX 2026-09-08 通道×算法一对一] + channel_id_str: GB 20 位编码 str 主查
  //   (后端已支持, 对齐 regions 演进), int32 仅老部署兼容。
  // [FIX tw-toggle 2026-09-08] + include_disabled: 算法配置页拉含停用线全量。
  // [FIX tw-route 2026-09-12] channel_id 改可选: 无参调用 = 全量 (后端无参
  //   getAllTripwires 语义) — 规则保存的残留绊线清理需跨通道全库扫描。
  //   显式传 channel_id 的老调用语义不变 (滤 str 已绑定记录)。
  listTripwires(params: { channel_id?: number; algo_id?: string; channel_id_str?: string; include_disabled?: boolean } = {}) {
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
    // [FIX tsc 2026-09-07] 泛型改为实际响应壳形态 (拦截器不剥业务壳, id 在
    //   res.data.data.id; 原单层 {id} 泛型使 .data?.data 访问报 TS2339)
    const res = await http.post<{ data?: { id?: number }; id?: number }>('/algos/tripwires', body)
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
  // [FIX tw-toggle 2026-09-08] 开关用 upsert 语义: POST 带 id 走后端 UPDATE
  //   分支 (RegionStore.upsertTripwire id≠0 即更新), 只翻 enabled 不动几何。
  upsertTripwire(body: TripwireDef) {
    return http.post<{ data?: { id?: number } }>('/algos/tripwires', body)
  },

  // ----- Counting zones -----
  // [FIX tw-toggle 2026-09-08] + include_disabled / id 可选 upsert 同绊线先例
  //   (后端 POST 读 req.value("id", 0), id>0 走 UPDATE, 只翻 enabled 不动几何)。
  listCountingZones(params: { channel_id: number; algo_id?: string; include_disabled?: boolean } = { channel_id: 0 }) {
    return http.get<{ counting_zones: CountingZoneDef[] }>(
      '/algos/counting-zones',
      { params }
    )
  },
  upsertCountingZone(body: Omit<CountingZoneDef, 'id' | 'created_at'> & { id?: number }) {
    return http.post<{ id: number; counting_zone: CountingZoneDef }>(
      '/algos/counting-zones',
      body
    )
  },
  deleteCountingZone(id: number) {
    return http.delete<{ ok: boolean }>(`/algos/counting-zones/${id}`)
  },

  // ----- 🆕 v5.0 [Tailgating 区域版]: Passageways (多边形通行区) -----
  // [FIX tw-toggle 2026-09-08] + include_disabled / id 可选 upsert 同绊线先例。
  listPassageways(
    params: { channel_id?: number; channel_id_str?: string; algo_id?: string; include_disabled?: boolean } = {}
  ) {
    return http.get<{ passageways: PassagewayDef[] }>(
      '/algos/passageways',
      { params }
    )
  },
  upsertPassageway(body: Omit<PassagewayDef, 'id' | 'created_at' | 'updated_at'> & { id?: number }) {
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
