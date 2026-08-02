import { describe, expect, it } from 'vitest'
import { normalizeDeviceMetrics } from '@/utils/deviceMetrics'

describe('normalizeDeviceMetrics', () => {
  it('将详情接口返回的单个 latestMetrics 转为实时指标数组', () => {
    const metrics = normalizeDeviceMetrics({
      latestMetrics: {
        timestamp: '2026-07-14T10:00:00Z',
        cpu_usage: 23,
        mem_usage: 41,
        gpu_usage: 12,
        disk_usage: 55,
        temperature: 48,
        network_in: 100,
        network_out: 80,
      },
    })

    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toMatchObject({
      timestamp: '2026-07-14T10:00:00Z',
      cpuUsage: 23,
      memUsage: 41,
      gpuUsage: 12,
      diskUsage: 55,
      temperature: 48,
      networkIn: 100,
      networkOut: 80,
    })
  })
})
