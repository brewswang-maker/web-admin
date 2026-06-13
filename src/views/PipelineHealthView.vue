<template>
  <div class="pipeline-health" v-loading="loading">
    <el-row :gutter="16" class="overview-row">
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="SLM Active Streams">
            <template #prefix>
              <el-tag :type="slmStats.active_streams > 0 ? 'success' : 'info'" effect="dark" size="small">
                {{ slmStats.active_streams }} / {{ slmStats.total_streams }}
              </el-tag>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="IRM Throughput (FPS)" :value="irmStats.throughput_fps.toFixed(1)" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="IRM Tasks (completed/skipped)">
            <template #default>
              {{ irmStats.total_completed }} / <span class="text-warning">{{ irmStats.total_skipped }}</span>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="TPU Utilization">
            <template #default>
              <span :class="tpuClass">{{ (irmStats.tpu_utilization * 100).toFixed(0) }}%</span>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="14">
        <el-card header="IRM Worker Threads" shadow="never" class="mt-16">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="Worker Threads">{{ irmStats.worker_threads }}</el-descriptions-item>
            <el-descriptions-item label="Active Channels">{{ irmStats.active_channels }}</el-descriptions-item>
            <el-descriptions-item label="Queued Tasks">{{ irmStats.queued_tasks }}</el-descriptions-item>
            <el-descriptions-item label="Avg Batch Size">{{ irmStats.avg_batch_size.toFixed(1) }}</el-descriptions-item>
            <el-descriptions-item label="Avg Inference (ms)">
              <span :class="latencyClass(irmStats.avg_inference_ms)">{{ irmStats.avg_inference_ms.toFixed(1) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="Total Submitted">{{ irmStats.total_submitted }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card header="SLM Stream States" shadow="never" class="mt-16">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="Total Streams">{{ slmStats.total_streams }}</el-descriptions-item>
            <el-descriptions-item label="Active">
              <el-tag type="success" size="small">{{ slmStats.active_streams }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="Degraded">
              <el-tag :type="slmStats.degraded_streams > 0 ? 'warning' : 'info'" size="small">
                {{ slmStats.degraded_streams }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="Disconnected">
              <el-tag :type="slmStats.disconnected_streams > 0 ? 'danger' : 'info'" size="small">
                {{ slmStats.disconnected_streams }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="Frames Dispatched">{{ slmStats.total_frames_dispatched }}</el-descriptions-item>
            <el-descriptions-item label="Reconnect Attempts">{{ slmStats.total_reconnect_attempts }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card header="Registered Plugins" shadow="never" class="mt-16" v-if="plugins.length > 0">
          <el-tag v-for="p in plugins" :key="p.type" size="small" class="plugin-tag">
            {{ p.display_name || p.type }}
          </el-tag>
        </el-card>
      </el-col>
    </el-row>

    <el-card header="SLM Channel States" shadow="never" class="mt-16" v-if="slmStats.streams && slmStats.streams.length > 0">
      <el-table :data="slmStats.streams" size="small" stripe>
        <el-table-column prop="channel_id" label="Channel ID" width="140" />
        <el-table-column prop="state" label="State" width="160">
          <template #default="{ row }">
            <el-tag :type="stateTag(row.state)" effect="dark" size="small">{{ row.state }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-empty v-if="!loading && irmStats.active_channels === 0 && slmStats.total_streams === 0"
              description="No active pipelines. Deploy a pipeline to see runtime metrics." />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getIRMStats, getSLMStats, getPluginTypes,
         type IRMStats, type SLMStats, type PluginTypeInfo } from '@/api/pipeline'

const loading = ref(true)

const irmStats = ref<IRMStats>({
  active_channels: 0, queued_tasks: 0, worker_threads: 0,
  tpu_utilization: 0, avg_inference_ms: 0, avg_batch_size: 0,
  total_submitted: 0, total_completed: 0, total_skipped: 0,
  throughput_fps: 0,
})

const slmStats = ref<SLMStats>({
  total_streams: 0, active_streams: 0, degraded_streams: 0,
  disconnected_streams: 0, total_frames_dispatched: 0,
  total_reconnect_attempts: 0, streams: [],
})

const plugins = ref<PluginTypeInfo[]>([])

let refreshTimer: ReturnType<typeof setInterval> | null = null

async function fetchStats() {
  try {
    const [irmRes, slmRes, pluginRes] = await Promise.allSettled([
      getIRMStats(), getSLMStats(), getPluginTypes(),
    ])
    if (irmRes.status === 'fulfilled') {
      const d = irmRes.value.data?.data
      if (d) Object.assign(irmStats.value, d)
    }
    if (slmRes.status === 'fulfilled') {
      const d = slmRes.value.data?.data
      if (d) Object.assign(slmStats.value, d)
    }
    if (pluginRes.status === 'fulfilled') {
      const d = pluginRes.value.data?.data
      if (d?.plugins) plugins.value = d.plugins
    }
  } catch { /* ignore */ }
  loading.value = false
}

onMounted(async () => {
  await fetchStats()
  refreshTimer = setInterval(fetchStats, 10000)  // 10s 刷新
})

onUnmounted(() => {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
})

const tpuClass = computed(() => {
  const pct = irmStats.value.tpu_utilization * 100
  if (pct > 85) return 'latency-danger'
  if (pct > 60) return 'latency-warn'
  return 'latency-ok'
})

function latencyClass(ms: number): string {
  if (ms > 35) return 'latency-danger'
  if (ms > 20) return 'latency-warn'
  return 'latency-ok'
}

function stateTag(state: string): 'success' | 'warning' | 'danger' | 'info' {
  if (state === 'STREAMING') return 'success'
  if (state === 'DEGRADED' || state === 'RECONNECTING' || state === 'CONNECTING') return 'warning'
  if (state === 'DISCONNECTED' || state === 'ERROR') return 'danger'
  return 'info'
}
</script>

<style scoped>
.pipeline-health {
  padding: 20px;
}
.mt-16 {
  margin-top: 16px;
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
.text-warning {
  color: #e6a23c;
}
.plugin-tag {
  margin: 2px 4px;
}
</style>
