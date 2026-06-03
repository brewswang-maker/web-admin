<template>
  <div :class="['vlm-result-card', { 'vlm-compact': compact }]">
    <!-- Header row: badge + source tag + time -->
    <div class="vlm-header">
      <span :class="['vlm-badge', result.verified ? 'badge-verified' : 'badge-rejected']">
        <el-icon :size="14">
          <CircleCheckFilled v-if="result.verified" />
          <CircleCloseFilled v-else />
        </el-icon>
        {{ result.verified ? '已确认' : '未通过' }}
      </span>

      <el-tag size="small" :type="sourceTagType" effect="plain" class="source-tag">
        <el-icon :size="12" style="margin-right:3px">
          <component :is="sourceIcon" />
        </el-icon>
        {{ sourceLabel }}
      </el-tag>

      <span class="vlm-time">{{ result.verification_time_ms }}ms</span>
    </div>

    <!-- Confidence bar -->
    <div class="confidence-row">
      <span class="confidence-label">置信度</span>
      <el-progress
        :percentage="Math.round(confidence * 100)"
        :stroke-width="compact ? 6 : 10"
        :color="confidenceColor"
        :show-text="!compact"
        class="confidence-bar"
      />
    </div>

    <!-- Scene description -->
    <p v-if="result.scene_description" class="vlm-desc">{{ result.scene_description }}</p>

    <!-- Suggested action -->
    <p v-if="result.suggested_action" class="vlm-action">
      <el-icon :size="13" style="margin-right:3px;color:var(--el-color-primary)"><Warning /></el-icon>
      {{ result.suggested_action }}
    </p>

    <!-- Expandable raw response -->
    <el-collapse v-if="result.raw_response && !compact" class="raw-collapse">
      <el-collapse-item title="原始响应">
        <pre class="raw-content">{{ result.raw_response }}</pre>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheckFilled, CircleCloseFilled, Warning, Cloudy, Cpu, Setting } from '@element-plus/icons-vue'

export interface VlmResult {
  verified: boolean
  confidence: number
  source: 'cloud_vlm' | 'edge_tinyllm' | 'rule_based' | 'none'
  scene_description: string
  suggested_action: string
  verification_time_ms: number
  raw_response: string
}

const props = withDefaults(defineProps<{
  result: VlmResult
  compact?: boolean
}>(), {
  compact: false,
})

const confidence = computed(() =>
  Math.max(0, Math.min(1, props.result.confidence || 0)),
)

const confidenceColor = computed(() => {
  const c = confidence.value
  if (c >= 0.8) return '#0F9D58'
  if (c >= 0.5) return '#F9AB00'
  return '#DB4437'
})

const sourceIcon = computed(() => {
  const map: Record<string, typeof Cloudy> = {
    cloud_vlm: Cloudy,
    edge_tinyllm: Cpu,
    rule_based: Setting,
    none: Warning,
  }
  return map[props.result.source] ?? Warning
})

const sourceLabel = computed(() => {
  const map: Record<string, string> = {
    cloud_vlm: '云端VLM',
    edge_tinyllm: '边缘TinyLLM',
    rule_based: '规则引擎',
    none: '未验证',
  }
  return map[props.result.source] ?? '未知'
})

const sourceTagType = computed(() => {
  const map: Record<string, string> = {
    cloud_vlm: 'primary',
    edge_tinyllm: 'success',
    rule_based: 'warning',
    none: 'info',
  }
  return (map[props.result.source] ?? 'info') as 'primary' | 'success' | 'warning' | 'info'
})
</script>

<style scoped>
.vlm-result-card {
  background: var(--el-bg-color, #1e2028);
  border: 1px solid var(--el-border-color, #3c4043);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.vlm-compact { padding: 8px 10px; gap: 6px; }
.vlm-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.vlm-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 13px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
}
.badge-verified { color: #0F9D58; background: rgba(15,157,88,0.12); }
.badge-rejected { color: #DB4437; background: rgba(219,68,55,0.12); }
.source-tag { display: inline-flex; align-items: center; }
.vlm-time { margin-left: auto; font-size: 12px; color: var(--app-text-secondary, #9aa0a6); }
.confidence-row { display: flex; align-items: center; gap: 8px; }
.confidence-label {
  font-size: 12px; color: var(--app-text-secondary, #9aa0a6);
  white-space: nowrap; min-width: 42px;
}
.confidence-bar { flex: 1; }
.vlm-desc { margin: 0; font-size: 13px; line-height: 1.5; color: var(--el-text-color-primary, #e8eaed); }
.vlm-action {
  margin: 0; font-size: 13px; line-height: 1.5;
  color: var(--el-text-color-regular, #c4c7cc);
  display: flex; align-items: flex-start;
}
.raw-collapse { border: none; }
.raw-collapse :deep(.el-collapse-item__header) {
  font-size: 12px; color: var(--app-text-secondary, #9aa0a6);
  background: transparent; border-bottom: none; height: 28px; line-height: 28px;
}
.raw-collapse :deep(.el-collapse-item__wrap) { background: transparent; border-bottom: none; }
.raw-content {
  margin: 0; padding: 8px; font-size: 11px; line-height: 1.5;
  color: var(--app-text-secondary, #9aa0a6);
  background: rgba(0,0,0,0.2); border-radius: 4px;
  white-space: pre-wrap; word-break: break-all;
  max-height: 160px; overflow-y: auto;
}
</style>
