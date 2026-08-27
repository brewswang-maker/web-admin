<template>
  <div class="screening-rules">
    <!-- ===== 顶部说明 ===== -->
    <el-alert
      type="info"
      :title="'安检联动模板包 — 一键应用'" :closable="false" show-icon class="hint-alert"
      description="按方案 §5 S1, 内置 14 个安检分类模板 (通道秩序/判图员合规/人包核验)。点击卡片右侧 [应用] 将以所选名称创建规则并写入 DB, 重启后生效。" />

    <!-- ===== 模板卡列表 ===== -->
    <el-row :gutter="16" v-loading="loading">
      <el-col :span="8" v-for="t in templates" :key="t.template_id">
        <el-card shadow="hover" class="template-card">
          <template #header>
            <div class="card-header">
              <span class="t-name">
                <el-icon><Document /></el-icon>
                {{ t.name }}
              </span>
              <el-tag size="small" :type="priorityTag(t.priority)" effect="light">P{{ t.priority }}</el-tag>
            </div>
          </template>
          <div class="t-desc">{{ t.description }}</div>
          <div class="t-events">
            <el-tag v-for="e in t.event_types" :key="e" size="small" effect="plain" class="event-tag">{{ e }}</el-tag>
            <el-tooltip v-if="t.event_types.length > 3" :content="t.event_types.slice(3).join(', ')" placement="top">
              <el-tag size="small" type="info" effect="plain">+{{ t.event_types.length - 3 }}</el-tag>
            </el-tooltip>
          </div>
          <div class="t-actions">
            <span class="actions-label">动作: </span>
            <el-tag v-for="a in t.actions.slice(0, 3)" :key="a" size="small" type="warning" effect="plain">{{ a }}</el-tag>
            <el-tooltip v-if="t.actions.length > 3" :content="t.actions.slice(3).join(', ')" placement="top">
              <el-tag size="small" type="info" effect="plain">+{{ t.actions.length - 3 }}</el-tag>
            </el-tooltip>
          </div>
          <div class="t-meta">
            <span v-if="t.cooldown_ms">合并抑制: {{ t.cooldown_ms }}ms</span>
            <span class="t-id">id: {{ t.id || t.template_id }}</span>
          </div>
          <div class="t-footer">
            <el-button size="small" type="primary" :loading="applying[t.template_id]"
                       @click="applyTemplate(t)">
              <el-icon><Check /></el-icon>应用
            </el-button>
            <el-button size="small" text @click="showDetail(t)">
              <el-icon><InfoFilled /></el-icon>详情
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 详情抽屉 ===== -->
    <el-drawer v-model="detailVisible" :title="detailTitle" size="600px" direction="rtl">
      <div v-if="current" class="detail-body">
        <h3 class="d-title">{{ current.name }}</h3>
        <div class="d-section">
          <span class="d-label">描述:</span>
          <span>{{ current.description }}</span>
        </div>
        <div class="d-section">
          <span class="d-label">分类:</span>
          <el-tag size="small" effect="plain">{{ current.category }}</el-tag>
        </div>
        <div class="d-section">
          <span class="d-label">优先级:</span>
          <el-tag size="small" :type="priorityTag(current.priority)" effect="light">P{{ current.priority }}</el-tag>
        </div>
        <div class="d-section">
          <span class="d-label">触发事件 ({{ current.event_types.length }}):</span>
          <div class="d-tags">
            <el-tag v-for="e in current.event_types" :key="e" size="small" effect="plain">{{ e }}</el-tag>
          </div>
        </div>
        <div class="d-section">
          <span class="d-label">执行动作 ({{ current.actions.length }}):</span>
          <div class="d-tags">
            <el-tag v-for="a in current.actions" :key="a" size="small" type="warning" effect="plain">{{ a }}</el-tag>
          </div>
        </div>
        <div v-if="current.cooldown_ms" class="d-section">
          <span class="d-label">合并抑制:</span>
          <span>{{ current.cooldown_ms }} ms</span>
        </div>
        <div class="d-section">
          <span class="d-label">tags:</span>
          <div class="d-tags">
            <el-tag v-for="tag in current.tags" :key="tag" size="small" type="info" effect="plain">{{ tag }}</el-tag>
          </div>
        </div>
        <div class="d-section">
          <span class="d-label">is_builtin:</span>
          <span>{{ current.is_builtin ? '是' : '否' }}</span>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 安检模板 — Screening Phase 2 S1-3
 * 一键应用安检分类模板, 复用 linkage rule-templates API
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { Document, Check, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { screeningApi, type ScreeningRuleTemplate } from '@/api/screening'

const loading = ref(false)
const applying = reactive<Record<string, boolean>>({})
const templates = ref<ScreeningRuleTemplate[]>([])
const detailVisible = ref(false)
const current = ref<ScreeningRuleTemplate | null>(null)
const detailTitle = computed(() => current.value ? `模板详情 · ${current.value.name}` : '模板详情')

async function loadTemplates() {
  loading.value = true
  try {
    const resp = await screeningApi.listTemplates('安检')
    const list = resp.data?.data
    if (Array.isArray(list)) {
      templates.value = list
    } else {
      templates.value = []
    }
  } catch (e) {
    console.error('[ScreeningRules] load templates failed', e)
    templates.value = []
    ElMessage.error('加载安检模板失败, 请检查后端 /linkage/rule-templates 是否可用')
  } finally {
    loading.value = false
  }
}

async function applyTemplate(t: ScreeningRuleTemplate) {
  try {
    await ElMessageBox.confirm(
      `将以名称 "${t.name}" 创建规则。\n\n该操作会写入 DB, 重启后生效。是否继续?`,
      '应用安检模板',
      { confirmButtonText: '应用', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return  // 用户取消
  }
  applying[t.template_id] = true
  try {
    const resp = await screeningApi.applyTemplate({
      template_id: t.template_id,
      name: t.name,
    })
    const result = resp.data?.data
    if (result?.rule_id) {
      ElMessage.success(
        `已创建规则 #${result.rule_id}, 启用 ${result.enabled_actions}/${result.total_actions} 动作`
      )
    } else {
      ElMessage.warning('应用请求已发送, 但响应中无 rule_id')
    }
  } catch (e) {
    console.error('[ScreeningRules] apply failed', e)
    ElMessage.error(`应用失败: ${(e as Error).message || String(e)}`)
  } finally {
    applying[t.template_id] = false
  }
}

function showDetail(t: ScreeningRuleTemplate) {
  current.value = t
  detailVisible.value = true
}

function priorityTag(p: number): 'success' | 'warning' | 'info' | 'danger' {
  if (p >= 8) return 'danger'
  if (p >= 5) return 'warning'
  if (p >= 3) return 'success'
  return 'info'
}

onMounted(loadTemplates)
</script>

<style scoped>
.screening-rules { padding: 16px; }
.hint-alert { margin-bottom: 16px; }
.template-card { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.t-name { font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }
.t-desc { color: #606266; font-size: 13px; line-height: 1.5; margin-bottom: 10px; min-height: 40px; }
.t-events { margin-bottom: 8px; }
.event-tag { margin-right: 4px; margin-bottom: 4px; }
.t-actions { margin-bottom: 8px; }
.actions-label { color: #909399; font-size: 12px; margin-right: 4px; }
.t-meta { display: flex; justify-content: space-between; color: #909399; font-size: 12px; padding-top: 8px; border-top: 1px dashed #ebeef5; }
.t-id { font-family: monospace; }
.t-footer { display: flex; gap: 8px; margin-top: 12px; }

.detail-body { padding: 0 16px; }
.d-title { margin-top: 0; }
.d-section { display: flex; align-items: flex-start; padding: 8px 0; border-bottom: 1px dashed #ebeef5; }
.d-label { width: 110px; color: #909399; flex-shrink: 0; }
.d-tags { display: flex; flex-wrap: wrap; gap: 4px; }
</style>