/**
 * System API — 系统管理操作
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface SystemInfo {
  deviceId: string
  hardware: string
  firmwareVersion: string
  serialNumber: string
  uptime: number
  cpuUsage: number
  memTotal: number
  memUsed: number
  diskTotal: number
  diskUsed: number
  temperature: number
  npuUsage: number
  npuType: string
  /** [M2-4 2026-09-21] Linux 启动标识 (升级完成校验锚点) */
  boot_id?: string
  /** [M2-4 2026-09-21] 软件版本 */
  software_version?: string
}

export interface GB28181Config {
  enabled: boolean
  sipServerId: string
  sipServerDomain: string
  sipServerIp: string
  sipServerPort: number
  sipUsername: string
  expires: number
  heartbeatInterval: number
}

/** [M6-2 2026-09-21] 设备自检 — 资源诊断 (内存/进程/磁盘/NPU) */
export interface DiagnosticsMemory {
  system: { mem_total_bytes: number; mem_available_bytes: number; mem_used_percent: number }
  process: { pid: number; rss_bytes: number }
  disk: { data_dir: string; available_bytes: number }
  npu: { chip_model?: string; tpu_cores?: number; total_memory_mb?: number }
}

/** [M6-2 2026-09-21] 推理路由表条目 (算法→模型→后端) */
export interface InferenceRoute {
  algo_id: string
  name: string
  model_file: string
  chip_series?: string
  model_status: 'dedicated' | 'fallback' | 'missing'
  model_actual_file: string
  backend: 'sophon_tpu' | 'cpu_onnx' | 'none'
  effective_route: string
  algo_status: string
}

/** [M6-2 2026-09-21] 推理路由表响应 */
export interface DiagnosticsRoutes {
  routes: InferenceRoute[]
  summary: {
    total: number
    deployed: number
    fallback: number
    missing: number
    sophon_tpu: number
    cpu_onnx: number
    no_model: number
  }
  search_dirs: string[]
}

const systemApi = {
  /** 系统信息 (含 boot_id/software_version: 升级完成校验锚点 [M2-4]) */
  getInfo() {
    return http.get<ApiResponse<SystemInfo>>('/system/info')
  },

  /** GB28181配置 */
  getGB28181Config() {
    return http.get<ApiResponse<GB28181Config>>('/system/gb28181/config')
  },

  /** 系统重启 */
  reboot(delay?: number) {
    return http.post<ApiResponse<void>>('/system/reboot', { delay })
  },

  /** 系统重置 */
  reset() {
    return http.post<ApiResponse<void>>('/system/reset')
  },

  /** [M6-2 2026-09-21] 设备自检 — 资源诊断 (内存/进程/磁盘/NPU) */
  getDiagnosticsMemory() {
    return http.get<ApiResponse<DiagnosticsMemory>>('/system/diagnostics/memory')
  },

  /** [M6-2 2026-09-21] 设备自检 — 推理路由表 (算法→模型→后端) */
  getDiagnosticsRoutes() {
    return http.get<ApiResponse<DiagnosticsRoutes>>('/system/diagnostics/routes')
  }
}

export default systemApi
