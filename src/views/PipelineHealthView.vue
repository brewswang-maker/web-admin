<template>
  <div class="pipeline-health">
    <el-row :gutter="16" class="overview-row">
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="Pipeline Status">
            <template #prefix>
              <el-tag :type="overview.running ? 'success' : 'danger'" effect="dark" size="small">
                {{ overview.running ? 'Running' : 'Stopped' }}
              </el-tag>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="Uptime" :value="overview.uptime" suffix="h" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="Total Frames Processed" :value="overview.totalFrames" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="Active Channels" :value="overview.activeChannels" :suffix="`/ ${overview.totalChannels}`" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="14">
        <el-card header="Worker Threads" shadow="never" class="mt-16">
          <el-table :data="workers" size="small" stripe>
            <el-table-column prop="worker_id" label="Worker ID" width="100" />
            <el-table-column label="Status" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'running' ? 'success' : 'info'" size="small">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="current_channel" label="Current Channel" width="140" />
            <el-table-column prop="frames_processed" label="Frames" width="100" />
            <el-table-column prop="avg_latency_ms" label="Avg Latency (ms)" width="140">
              <template #default="{ row }">
                <span :class="latencyClass(row.avg_latency_ms)">{{ row.avg_latency_ms.toFixed(1) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card header="Buffer Pool" shadow="never" class="mt-16">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="Pool Size">{{ bufferPool.poolSize }}</el-descriptions-item>
            <el-descriptions-item label="Used / Free">
              {{ bufferPool.usedBuffers }} / {{ bufferPool.freeBuffers }}
            </el-descriptions-item>
          </el-descriptions>
          <div class="buffer-bar">
            <span class="buffer-label">Buffer Usage</span>
            <el-progress
              :percentage="bufferUsagePct"
              :color="bufferColor"
              :stroke-width="18"
              :text-inside="true"
            />
          </div>
        </el-card>

        <el-card header="Performance Metrics" shadow="never" class="mt-16">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="Throughput (FPS)">
              <strong>{{ perf.throughput }}</strong>
            </el-descriptions-item>
            <el-descriptions-item label="Avg Latency">
              {{ perf.avgLatency }} ms
            </el-descriptions-item>
            <el-descriptions-item label="P99 Latency">
              <span :class="latencyClass(perf.p99Latency)">{{ perf.p99Latency }} ms</span>
            </el-descriptions-item>
            <el-descriptions-item label="Error Rate">
              <el-tag :type="perf.errorRate > 1 ? 'danger' : 'success'" size="small">
                {{ perf.errorRate }}%
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-card header="Channel Health" shadow="never" class="mt-16">
      <el-table :data="channels" size="small" stripe>
        <el-table-column prop="channel_id" label="Channel ID" width="120" />
        <el-table-column prop="mode" label="Mode" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="(row.mode === 'streaming' ? 'primary' : 'warning') as any">{{ row.mode }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="FPS (Actual / Target)" width="180">
          <template #default="{ row }">
            {{ row.fps_actual }} / {{ row.fps_target }}
          </template>
        </el-table-column>
        <el-table-column prop="latency_ms" label="Latency (ms)" width="130">
          <template #default="{ row }">
            <span :class="latencyClass(row.latency_ms)">{{ row.latency_ms.toFixed(1) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="error_count" label="Errors" width="100" />
        <el-table-column label="Health" width="100">
          <template #default="{ row }">
            <el-tag :type="healthTag(row.health)" effect="dark" size="small">{{ row.health }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const overview = {
  running: true,
  uptime: 72.4,
  totalFrames: 1_842_360,
  activeChannels: 6,
  totalChannels: 8,
}

const workers = [
  { worker_id: 0, status: 'running' as const, current_channel: 'CH-01', frames_processed: 312_540, avg_latency_ms: 12.3 },
  { worker_id: 1, status: 'running' as const, current_channel: 'CH-02', frames_processed: 298_710, avg_latency_ms: 14.8 },
  { worker_id: 2, status: 'running' as const, current_channel: 'CH-03', frames_processed: 287_920, avg_latency_ms: 11.6 },
  { worker_id: 3, status: 'idle' as const, current_channel: '-', frames_processed: 0, avg_latency_ms: 0 },
  { worker_id: 4, status: 'running' as const, current_channel: 'CH-04', frames_processed: 275_600, avg_latency_ms: 18.2 },
  { worker_id: 5, status: 'running' as const, current_channel: 'CH-05', frames_processed: 310_050, avg_latency_ms: 13.1 },
  { worker_id: 6, status: 'running' as const, current_channel: 'CH-06', frames_processed: 257_540, avg_latency_ms: 22.4 },
  { worker_id: 7, status: 'idle' as const, current_channel: '-', frames_processed: 0, avg_latency_ms: 0 },
]

const channels = [
  { channel_id: 'CH-01', mode: 'streaming', fps_actual: 15.2, fps_target: 16, latency_ms: 12.3, error_count: 2, health: 'green' },
  { channel_id: 'CH-02', mode: 'streaming', fps_actual: 14.8, fps_target: 16, latency_ms: 14.8, error_count: 5, health: 'green' },
  { channel_id: 'CH-03', mode: 'snapshot', fps_actual: 1.8, fps_target: 2, latency_ms: 11.6, error_count: 0, health: 'green' },
  { channel_id: 'CH-04', mode: 'streaming', fps_actual: 12.1, fps_target: 16, latency_ms: 28.5, error_count: 14, health: 'yellow' },
  { channel_id: 'CH-05', mode: 'streaming', fps_actual: 15.0, fps_target: 16, latency_ms: 13.1, error_count: 3, health: 'green' },
  { channel_id: 'CH-06', mode: 'streaming', fps_actual: 8.4, fps_target: 16, latency_ms: 45.2, error_count: 31, health: 'red' },
  { channel_id: 'CH-07', mode: 'snapshot', fps_actual: 0, fps_target: 2, latency_ms: 0, error_count: 89, health: 'red' },
  { channel_id: 'CH-08', mode: 'snapshot', fps_actual: 0, fps_target: 2, latency_ms: 0, error_count: 0, health: 'green' },
]

const bufferPool = { poolSize: 256, usedBuffers: 178, freeBuffers: 78 }

const perf = { throughput: 67.2, avgLatency: 15.4, p99Latency: 42.8, errorRate: 0.32 }

const bufferUsagePct = computed(() =>
  Math.round((bufferPool.usedBuffers / bufferPool.poolSize) * 100)
)

const bufferColor = computed(() =>
  bufferUsagePct.value > 85 ? '#F56C6C' : bufferUsagePct.value > 60 ? '#E6A23C' : '#67C23A'
)

function latencyClass(ms: number): string {
  if (ms > 35) return 'latency-danger'
  if (ms > 20) return 'latency-warn'
  return 'latency-ok'
}

function healthTag(h: string): 'success' | 'warning' | 'danger' | 'info' {
  return h === 'green' ? 'success' : h === 'yellow' ? 'warning' : 'danger'
}
</script>

<style scoped>
.pipeline-health {
  padding: 20px;
}
.mt-16 {
  margin-top: 16px;
}
.buffer-bar {
  margin-top: 12px;
}
.buffer-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}
.latency-ok {
  color: #67c23a;
  font-weight: 600;
}
.latency-warn {
  color: #e6a23c;
  font-weight: 600;
}
.latency-danger {
  color: #f56c6c;
  font-weight: 600;
}
</style>
