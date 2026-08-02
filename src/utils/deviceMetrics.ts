import type { DeviceMetrics } from '@/types/device'

type MetricRecord = Record<string, unknown>

function numberValue(record: MetricRecord, camel: string, snake: string): number {
  const value = record[camel] ?? record[snake]
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapMetric(record: MetricRecord): DeviceMetrics {
  return {
    timestamp: String(record.timestamp ?? record.time ?? record.created_at ?? new Date().toISOString()),
    cpuUsage: numberValue(record, 'cpuUsage', 'cpu_usage'),
    memUsage: numberValue(record, 'memUsage', 'mem_usage'),
    gpuUsage: numberValue(record, 'gpuUsage', 'gpu_usage'),
    diskUsage: numberValue(record, 'diskUsage', 'disk_usage'),
    temperature: numberValue(record, 'temperature', 'temp'),
    networkIn: numberValue(record, 'networkIn', 'network_in'),
    networkOut: numberValue(record, 'networkOut', 'network_out'),
    aiInferenceCount: numberValue(record, 'aiInferenceCount', 'ai_inference_count'),
    aiInferenceLatency: numberValue(record, 'aiInferenceLatency', 'ai_inference_latency'),
  }
}

export function normalizeDeviceMetrics(payload: unknown): DeviceMetrics[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as MetricRecord
  const candidate = root.latestMetrics ?? root.latest_metrics ?? root.metrics ?? root.metric_history ?? root.history ?? payload
  const records = Array.isArray(candidate) ? candidate : [candidate]
  return records.filter((item): item is MetricRecord => !!item && typeof item === 'object').map(mapMetric)
}
