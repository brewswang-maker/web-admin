<template>
  <!-- [FEAT rule-diagnose 2026-09-30] 规则失效徽章: enabled=true 但存在 critical/warning
       级诊断 → 状态开关右侧红色感叹号; hover 弹出结构化原因 (根因+受影响通道+修复建议)。
       诊断不可达 (旧固件 404/网络异常) → 灰色感叹号 + 占位文案 (零判空归一, 不阻塞列表)。
       健康规则 / 纯 info 级 / 已停用规则不渲染, 避免告警疲劳。 -->
  <el-tooltip v-if="visible" placement="top" effect="light" :show-after="150" :hide-after="0">
    <template #content>
      <div class="rhb-body">
        <template v-if="view">
          <div v-for="d in view.all" :key="d.code + d.message" class="rhb-item">
            <div class="rhb-head">
              <span class="rhb-code">{{ diagnoseCodeZh(d.code) }}</span>
              <span class="rhb-sev" :class="'sev-' + d.severity">{{ d.severity }}</span>
            </div>
            <!-- message 后端已兜底 (composable normalizeDiag 二次兜底空文案) -->
            <div class="rhb-msg">{{ d.message }}</div>
            <div v-if="d.affected_channels.length" class="rhb-chs">
              受影响通道:
              <code v-for="c in d.affected_channels.slice(0, 8)" :key="c">{{ c }}</code>
              <span v-if="d.affected_channels.length > 8" class="rhb-more">+{{ d.affected_channels.length - 8 }}</span>
            </div>
            <div v-if="d.fix_hint" class="rhb-hint">修复: {{ d.fix_hint }}</div>
          </div>
          <div v-if="view.all.length === 0" class="rhb-ok">规则可正常触发 (诊断无异常)</div>
        </template>
        <!-- 零判空归一: 诊断端点不可达/响应残缺 → 占位文案 (非笼统「配置异常」) -->
        <div v-else class="rhb-unknown">原因待诊断，请点击进入编辑器查看</div>
        <div class="rhb-link">点击图标直达编辑器 →</div>
      </div>
    </template>
    <span class="rhb-trigger" @click.stop="goEditor">
      <el-icon :size="15" :color="view ? '#f56c6c' : '#c0c4cc'"><WarningFilled /></el-icon>
    </span>
  </el-tooltip>
</template>

<script setup lang="ts">
/**
 * [FEAT rule-diagnose 2026-09-30] 规则失效红色感叹号徽章 (四类规则视图复用:
 * LinkageRuleView / 场景域 RulesView×5 / ScreeningRuleManager)。
 *
 * - 数据源: GET /linkage/rules/{id}/diagnose (经 useRuleDiagnose 归一, 5min 缓存)
 * - 点击行为: 跳平台联动规则页编辑器深链 /linkage?editRuleId={id}
 *   (LinkageRuleView onMounted 已有 editRuleId 深链消费, 自动打开该规则编辑)
 * - 展示口径: 仅 blocking (critical/warning) 渲染红色; 不可达渲染灰色占位
 */
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { WarningFilled } from '@element-plus/icons-vue'
import {
  fetchRuleDiagnose,
  diagnoseCodeZh,
  type RuleDiagnoseView
} from '@/composables/useRuleDiagnose'

const props = defineProps<{
  /** 规则 id (row.id) */
  ruleId: string
  /** 仅已启用规则显示徽章 (停用规则本身就不触发, 无需诊断) */
  enabled: boolean
}>()

const router = useRouter()
const view = ref<RuleDiagnoseView | null>(null)
const loaded = ref(false)

onMounted(async () => {
  if (!props.enabled) return
  const v = await fetchRuleDiagnose(props.ruleId)
  // v=null (端点不可达) 也要渲染灰色占位徽章 — 「原因待诊断」也是可见性
  view.value = v
  loaded.value = true
})

const visible = computed(() => {
  if (!props.enabled || !loaded.value) return false
  if (!view.value) return true // 待诊断占位 (灰色)
  return view.value.blocking.length > 0
})

function goEditor() {
  // 深链: LinkageRuleView onMounted 消费 ?editRuleId= 自动打开该规则编辑
  // (history.replaceState 清 query 防刷新重复打开, 见 LinkageRuleView L6054)
  router.push({ path: '/linkage', query: { editRuleId: props.ruleId } })
}
</script>

<style scoped>
.rhb-trigger {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  margin-left: 4px;
  vertical-align: middle;
  line-height: 1;
}
.rhb-body {
  max-width: 380px;
  font-size: 12px;
  line-height: 1.55;
}
.rhb-item {
  padding: 4px 0;
}
.rhb-item + .rhb-item {
  border-top: 1px dashed var(--el-border-color-lighter, #e4e7ed);
}
.rhb-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.rhb-code {
  font-weight: 600;
}
.rhb-sev {
  font-size: 10px;
  padding: 0 5px;
  border-radius: 3px;
  color: #fff;
}
.sev-critical { background: #f56c6c; }
.sev-warning { background: #e6a23c; }
.sev-info { background: #909399; }
.rhb-msg {
  color: var(--el-text-color-primary, #303133);
}
.rhb-chs {
  margin-top: 2px;
  color: var(--el-text-color-secondary, #606266);
  word-break: break-all;
}
.rhb-chs code {
  background: var(--el-fill-color-light, #f5f7fa);
  padding: 0 3px;
  margin-right: 3px;
  border-radius: 2px;
  font-size: 11px;
}
.rhb-more {
  color: var(--el-text-color-secondary, #909399);
}
.rhb-hint {
  margin-top: 2px;
  color: var(--el-color-primary, #409eff);
}
.rhb-ok {
  color: var(--el-color-success, #67c23a);
}
.rhb-unknown {
  color: var(--el-text-color-secondary, #909399);
}
.rhb-link {
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px solid var(--el-border-color-lighter, #e4e7ed);
  color: var(--el-color-primary, #409eff);
  font-size: 11px;
}
</style>
