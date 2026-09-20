<template>
  <div class="storage-settings">
    <div class="page-header">
      <h2>存储管理</h2>
      <div>
        <el-button :loading="loading" @click="loadAll">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
        <el-button type="primary" :loading="saving" @click="save">
          <el-icon><Check /></el-icon> 保存配置
        </el-button>
      </div>
    </div>

    <!-- ── GC 合规指标卡 (P0-3 health.storage_gc, 30s 轮询) ── -->
    <el-row :gutter="12" class="ss-metrics">
      <el-col :span="6">
        <el-card shadow="never">
          <div class="ss-metric-label">最近 GC 轮次</div>
          <div class="ss-metric-value">{{ lastRunText }}</div>
          <div class="ss-metric-sub">
            删除 24h={{ health?.removed_old24h ?? 0 }} · 零字节={{
              health?.removed_zero ?? 0
            }} · 预算={{ health?.removed_budget ?? 0 }}
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="ss-metric-label">余量 / 预算</div>
          <div class="ss-metric-value">
            {{ (health?.remaining_gb ?? 0).toFixed(2) }} /
            {{ (health?.budget_gb ?? 0).toFixed(0) }} GB
          </div>
          <div class="ss-metric-sub">
            <el-tag v-if="health?.storage_pressure" type="warning" size="small"
              >存储压力</el-tag
            >
            <el-tag v-else type="success" size="small">正常</el-tag>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="ss-metric-label">孤儿锁 (证据被违规删除)</div>
          <div class="ss-metric-value">{{ health?.orphan_locks ?? 0 }}</div>
          <div class="ss-metric-sub">
            <el-tag v-if="health?.retention_violated" type="danger" size="small"
              >保留承诺已被打破</el-tag
            >
            <el-tag v-else type="success" size="small">合规</el-tag>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="ss-metric-label">锁保护图 / cron 自检</div>
          <div class="ss-metric-value">{{ health?.protected_locked ?? 0 }} 张</div>
          <div class="ss-metric-sub">
            <el-tag
              :type="cronHealTagType"
              size="small"
            >{{ cronHealText }}</el-tag>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ── 配置表单 ── -->
    <el-card shadow="never" class="ss-form-card">
      <template #header>
        <span>推理图片生命周期策略 (保存后即时生效, 自动重装清理 cron)</span>
      </template>
      <el-form label-width="220px" :model="form" v-if="form">
        <el-form-item label="快照 GC 总开关">
          <el-switch v-model="form.enabled" />
          <span class="ss-hint">关闭后仅保留合规统计, 不再删除任何快照文件</span>
        </el-form-item>
        <el-form-item label="空间预算模式">
          <el-radio-group v-model="form.budget_mode">
            <el-radio value="auto">自动 (路数 × 2GB)</el-radio>
            <el-radio value="static">固定预算</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.budget_mode === 'auto'" label="通道数上限">
          <el-input-number v-model="form.budget_channels_cap" :min="1" :max="16" />
          <span class="ss-hint">预算 = max(2GB, min(最大路数, 上限) × 2GB), 防超出 /data 物理容量</span>
        </el-form-item>
        <el-form-item v-if="form.budget_mode === 'static'" label="固定预算 (GB)">
          <el-input-number v-model="form.budget_gb" :min="1" :max="16" />
        </el-form-item>
        <el-form-item label="常规快照留存 (小时)">
          <el-input-number v-model="form.max_age_hours" :min="1" :max="8760" />
          <span class="ss-hint">进程内 GC 时长删阈值 (rtp/record 由下方 cron 策略分管)</span>
        </el-form-item>
        <el-form-item label="满盘策略">
          <el-radio-group v-model="form.full_policy">
            <el-radio value="overwrite">循环覆盖 (删最旧)</el-radio>
            <el-radio value="stop">满停止 (保历史, 告警提示)</el-radio>
          </el-radio-group>
          <span class="ss-hint">对齐华为/宇视 NVR 满覆盖/满停止二选一</span>
        </el-form-item>

        <el-divider content-position="left">分目录留存 (cron 策略)</el-divider>
        <el-form-item label="预览快照 rtp/live 留存 (小时)">
          <el-input-number v-model="form.rtp_retention_hours" :min="1" :max="720" />
        </el-form-item>
        <el-form-item label="连续录像 record 留存 (小时)">
          <el-input-number v-model="form.record_retention_hours" :min="1" :max="720" />
          <span class="ss-hint">带 .lock 的证据录像不受此时长限制 (7 天锁保护)</span>
        </el-form-item>

        <el-divider content-position="left">告警证据分级留存 (海康分级对标)</el-divider>
        <el-form-item label="证据锁 TTL-普通 (小时)">
          <el-input-number v-model="form.evidence_ttl_normal_hours" :min="1" :max="8760" />
          <span class="ss-hint">{{ (form.evidence_ttl_normal_hours / 24).toFixed(1) }} 天</span>
        </el-form-item>
        <el-form-item label="证据锁 TTL-案事件 (小时)">
          <el-input-number v-model="form.evidence_ttl_case_hours" :min="1" :max="87600" />
          <span class="ss-hint"
            >{{ (form.evidence_ttl_case_hours / 24).toFixed(0) }} 天, high 级以上告警适用</span
          >
        </el-form-item>

        <el-divider content-position="left">人脸样本 (《人脸识别办法》最短必要)</el-divider>
        <el-form-item label="faces 目录保护">
          <el-switch v-model="form.faces_enabled" />
          <span class="ss-hint">开启 = 从不清理 (现行为); 关闭 = 按下方期限删</span>
        </el-form-item>
        <el-form-item v-if="!form.faces_enabled" label="faces 留存 (天)">
          <el-input-number v-model="form.faces_max_days" :min="0" :max="365" />
          <span class="ss-hint">0 = 关闭清理 (从不删)</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * [FIX storage-gc 2026-09-20 P1] 存储管理页:
 *   推理图片生命周期策略可视化配置 (留存期/预算/满策略/证据分级/faces 保护)
 *   + P0-3 合规指标卡。数据源 /api/v1/config/storage-gc (配置+health 快照)。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Check } from '@element-plus/icons-vue'
import storageApi, {
  type StorageGcConfig,
  type StorageGcHealth
} from '@/api/storage'

const loading = ref(false)
const saving = ref(false)
const form = ref<StorageGcConfig | null>(null)
const health = ref<StorageGcHealth | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const lastRunText = computed(() => {
  const ts = health.value?.last_run_ts ?? 0
  if (!ts) return '尚未运行'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

const cronHealText = computed(() => {
  switch (health.value?.cron_self_heal) {
    case 'ok':
      return 'cron 在位'
    case 'healed':
      return '已自愈重装'
    case 'failed:need-root':
      return '自愈失败 (需 root)'
    default:
      return '未知'
  }
})

const cronHealTagType = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  switch (health.value?.cron_self_heal) {
    case 'ok':
      return 'success'
    case 'healed':
      return 'warning'
    case 'failed:need-root':
      return 'danger'
    default:
      return 'info'
  }
})

async function loadAll() {
  loading.value = true
  try {
    const res = await storageApi.getConfig()
    const data = res.data?.data
    if (data) {
      form.value = {
        enabled: data.enabled,
        budget_mode: data.budget_mode,
        budget_channels_cap: data.budget_channels_cap,
        budget_gb: data.budget_gb,
        max_age_hours: data.max_age_hours,
        full_policy: data.full_policy,
        rtp_retention_hours: data.rtp_retention_hours,
        record_retention_hours: data.record_retention_hours,
        evidence_ttl_normal_hours: data.evidence_ttl_normal_hours,
        evidence_ttl_case_hours: data.evidence_ttl_case_hours,
        faces_enabled: data.faces_enabled,
        faces_max_days: data.faces_max_days
      }
      health.value = data.health ?? null
    }
  } catch {
    ElMessage.error('读取存储配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.value) return
  saving.value = true
  try {
    const res = await storageApi.updateConfig({ ...form.value })
    const bizCode = res.data?.code
    if (bizCode === 0 || bizCode === 200) {
      ElMessage.success(res.data?.data?.message || '存储策略已保存并即时生效')
    } else {
      ElMessage.error(res.data?.message || '保存失败')
    }
    await loadAll()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadAll()
  // 30s 轮询合规指标 (轻量 GET, 与告警列表轮询同量级)
  pollTimer = setInterval(() => {
    loadAll()
  }, 30_000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped>
.storage-settings {
  padding: 16px 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.page-header h2 {
  margin: 0;
  font-size: 18px;
}
.ss-metrics {
  margin-bottom: 14px;
}
.ss-metric-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-bottom: 6px;
}
.ss-metric-value {
  font-size: 18px;
  font-weight: 600;
}
.ss-metric-sub {
  margin-top: 6px;
  min-height: 22px;
}
.ss-form-card {
  max-width: 860px;
}
.ss-hint {
  margin-left: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
