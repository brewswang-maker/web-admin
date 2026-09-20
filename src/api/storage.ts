/**
 * Storage API — 推理图片生命周期与存储治理
 * [FIX storage-gc 2026-09-20 P1] 对应后端 GET/PUT /api/v1/config/storage-gc;
 *   health 快照来自 GET /api/v1/health 的 storage_gc 子对象 (P0-3 合规监控)。
 *   配置侧后端为 ConfigManager 直读直写 (settings.storage_gc.*), PUT 后即时
 *   生效 — GC 触发点/锁 TTL/cron 渲染均每次直读, 无需重启。
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

/** 存储 GC 配置 (box_config_v6.json settings.storage_gc 段) */
export interface StorageGcConfig {
  /** GC 总开关 (false 时跳过快照目录清理, 仅告警统计) */
  enabled: boolean
  /** 预算模式: auto=max(2GB, min(maxChannels,cap)x2GB) | static=固定 budget_gb */
  budget_mode: 'auto' | 'static'
  /** auto 模式通道数上限 (防 N 路 x2GB 超过 /data 物理容量) */
  budget_channels_cap: number
  /** static 模式预算 (GB) */
  budget_gb: number
  /** 常规快照时长删阈值 (小时) */
  max_age_hours: number
  /** 满策略: overwrite=循环覆盖 | stop=满停止 (不删未锁文件, 仅告警) */
  full_policy: 'overwrite' | 'stop'
  /** rtp/live 预览快照留存 (小时) — cron 渲染 */
  rtp_retention_hours: number
  /** 连续录像留存 (小时) — cron 渲染 */
  record_retention_hours: number
  /** 告警证据锁 TTL-普通 (小时, 默认 7 天) */
  evidence_ttl_normal_hours: number
  /** 告警证据锁 TTL-案事件/high 级以上 (小时, 默认 90 天, 海康分级对标) */
  evidence_ttl_case_hours: number
  /** faces 人脸样本保护开关 (true=从不清理, 人脸信息最短必要原则) */
  faces_enabled: boolean
  /** faces 留存天数 (仅 faces_enabled=false 时生效, 0=从不删) */
  faces_max_days: number
}

/** GC 合规统计 (P0-3, /api/v1/health.storage_gc) */
export interface StorageGcHealth {
  last_run_ts: number
  removed_old24h: number
  removed_zero: number
  removed_budget: number
  remaining_gb: number
  budget_gb: number
  protected_locked: number
  orphan_locks: number
  retention_violated: boolean
  storage_pressure: boolean
  full_stop_active: boolean
  cron_self_heal: string
}

export interface StorageGcConfigResponse extends StorageGcConfig {
  health: StorageGcHealth | null
}

const storageApi = {
  /** 读取存储 GC 配置 + 最近一轮 GC 合规统计 */
  getConfig() {
    return http.get<ApiResponse<StorageGcConfigResponse>>('/config/storage-gc')
  },

  /** 部分更新存储 GC 配置 (白名单校验, 即时生效并重装 cron) */
  updateConfig(patch: Partial<StorageGcConfig>) {
    return http.put<ApiResponse<{ persisted: boolean; message: string }>>(
      '/config/storage-gc',
      patch
    )
  }
}

export default storageApi
