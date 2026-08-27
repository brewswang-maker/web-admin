<template>
  <div class="screening-rules">
    <!-- ===== 顶部说明 ===== -->
    <el-alert
      type="info" :title="'安检联动模板包 — 一键应用'" :closable="false" show-icon class="hint-alert"
      :description="`内置 ${templates.length} 个安检分类模板 (通道秩序/判图员合规/人包核验)。点击卡片 [应用] 调 POST /linkage/rule-templates/:id/apply 以所选名称创建规则并写入 DB, 重启后生效。`" />

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
            <el-tag v-for="e in eventTypesOf(t).slice(0, 3)" :key="e" size="small" effect="plain" class="event-tag">{{ e }}</el-tag>
            <el-tooltip v-if="eventTypesOf(t).length > 3" :content="eventTypesOf(t).slice(3).join(', ')" placement="top">
              <el-tag size="small" type="info" effect="plain">+{{ eventTypesOf(t).length - 3 }}</el-tag>
            </el-tooltip>
          </div>
          <div class="t-actions">
            <span class="actions-label">动作: </span>
            <el-tag v-for="a in t.actions.slice(0, 3)" :key="a.name"
                    size="small" :type="a.enabled ? 'warning' : 'info'" effect="plain">{{ a.name }}</el-tag>
            <el-tooltip v-if="t.actions.length > 3" :content="t.actions.slice(3).map(a => a.name).join(', ')" placement="top">
              <el-tag size="small" type="info" effect="plain">+{{ t.actions.length - 3 }}</el-tag>
            </el-tooltip>
          </div>
          <div class="t-meta">
            <span v-if="t.cooldown_ms">合并抑制: {{ t.cooldown_ms }}ms</span>
            <span v-if="t.source_cond?.min_severity">min_severity: {{ t.source_cond.min_severity }}</span>
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

    <!-- ===== 空态 / 错误态 ===== -->
    <el-result v-if="!loading && loadError" icon="error" title="安检模板加载失败"
               :sub-title="loadError">
      <template #extra>
        <el-button type="primary" size="small" @click="loadTemplates">重试</el-button>
      </template>
    </el-result>
    <el-result v-else-if="!loading && templates.length === 0" icon="warning"
               title="未找到安检分类模板"
               sub-title="后端 /linkage/rule-templates 可达, 但 category=安检 的模板为 0 — 可能固件版本不含 [安检场景 2026-08-27] 模板包, 升级后端后重试。" />

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
          <span class="d-label">触发事件 ({{ eventTypesOf(current).length }}):</span>
          <div class="d-tags">
            <el-tag v-for="e in eventTypesOf(current)" :key="e" size="small" effect="plain">{{ e }}</el-tag>
          </div>
        </div>
        <div class="d-section">
          <span class="d-label">执行动作 ({{ current.actions.length }}):</span>
          <div class="d-tags">
            <el-tag v-for="a in current.actions" :key="a.name"
                    size="small" :type="a.enabled ? 'warning' : 'info'" effect="plain">
              {{ a.name }} · type {{ a.type }}
            </el-tag>
          </div>
        </div>
        <div v-if="current.source_cond?.min_severity" class="d-section">
          <span class="d-label">最低级别:</span>
          <span>{{ current.source_cond.min_severity }}</span>
        </div>
        <div v-if="current.cooldown_ms" class="d-section">
          <span class="d-label">合并抑制:</span>
          <span>{{ current.cooldown_ms }} ms</span>
        </div>
        <div v-if="current.time_cond" class="d-section">
          <span class="d-label">生效时段:</span>
          <span>{{ current.time_cond.time_start }} ~ {{ current.time_cond.time_end }} · 周 {{ current.time_cond.weekdays.join('/') }}</span>
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
 * 一键应用安检分类模板:
 *   GET  /linkage/rule-templates?scene=security_screening (后端仅支持 scene 过滤)
 *   POST /linkage/rule-templates/:id/apply (createRuleFromTemplate 写 DB)
 *
 * [FIX 2026-08-28]
 *   - URL 双前缀 404 修复 + category 后端不支持 → scene + 前端本地 category 双过滤
 *   - actions 实为 {enabled,name,type}[] 对象数组 (此前误当 string[] 渲染为空)
 *   - event_types 位于 source_cond.event_types (此前误读顶层 undefined)
 *   - apply 响应为创建后的完整规则 JSON (取 id 显示)
 *   - 加载失败/空态给出可诊断提示而非静默空列表
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { Document, Check, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { screeningApi, type ScreeningRuleTemplate } from '@/api/screening'

const loading = ref(false)
const loadError = ref('')
const applying = reactive<Record<string, boolean>>({})
const templates = ref<ScreeningRuleTemplate[]>([])
const detailVisible = ref(false)
const current = ref<ScreeningRuleTemplate | null>(null)
const detailTitle = computed(() => current.value ? `模板详情 · ${current.value.name}` : '模板详情')

/** 触发事件键 (兼容顶层字段缺失场景, SSOT 位置在 source_cond.event_types) */
function eventTypesOf(t: ScreeningRuleTemplate): string[] {
  return t.source_cond?.event_types || []
}

async function loadTemplates() {
  loading.value = true
  loadError.value = ''
  try {
    // 后端仅支持 scene 过滤 (RestApiHandlers L14387); category 前端本地过滤双保险
    const resp = await screeningApi.listTemplates({ scene: 'security_screening' })
    const all = resp.data?.data
    const list = Array.isArray(all) ? all : []
    templates.value = list.filter(t => t.category === '安检')
    if (templates.value.length === 0 && list.length > 0) {
      console.warn('[ScreeningRules] scene 过滤返回', list.length, '个模板但无 category=安检 项')
    }
  } catch (e: unknown) {
    console.error('[ScreeningRules] load templates failed', e)
    templates.value = []
    const err = e as { code?: number; message?: string; url?: string }
    if (err?.code === 404) {
      loadError.value = `GET ${err.url || '/api/v1/linkage/rule-templates'} 返回 404 — 当前固件暂不支持该端点, 需升级 smartgateway 后端。`
    } else {
      loadError.value = `${err?.message || String(e)} (code=${err?.code ?? 'network'}) — 请检查设备后端 18080 端口 /linkage/rule-templates 是否可用`
    }
  } finally {
    loading.value = false
  }
}

async function applyTemplate(t: ScreeningRuleTemplate) {
  try {
    await ElMessageBox.confirm(
      `将以名称 "${t.name}" 创建规则 (id: ${t.template_id})。\n\n该操作会写入 DB, 重启后生效。是否继续?`,
      '应用安检模板',
      { confirmButtonText: '应用', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return  // 用户取消
  }
  applying[t.template_id] = true
  try {
    const resp = await screeningApi.applyTemplate(t.template_id, t.name)
    const result = resp.data?.data
    if (result?.id) {
      ElMessage.success(
        `已创建规则 #${result.id}「${result.name}」, 启用动作 ${result.actions?.filter(a => a.enabled).length ?? '-'}/${result.actions?.length ?? '-'} · 重启后生效`
      )
    } else {
      ElMessage.warning('应用请求已发送, 但响应中无规则 id — 请到「联动规则」页核对')
    }
  } catch (e: unknown) {
    console.error('[ScreeningRules] apply failed', e)
    const err = e as { code?: number; message?: string }
    if (err?.code === 404) {
      ElMessage.error('当前固件暂不支持 /linkage/rule-templates/:id/apply (404) — 需升级后端')
    } else {
      ElMessage.error(`应用失败: ${err?.message || String(e)}`)
    }
  } finally {
    applying[t.template_id] = false
  }
}

function showDetail(t: ScreeningRuleTemplate) {
  current.value = t
  detailVisible.value = true
}

function priorityTag(p: number): 'success' | 'warning' | 'info' | 'danger' {
  if (p >= 80) return 'danger'
  if (p >= 50) return 'warning'
  if (p >= 30) return 'success'
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
.event-tag { margin-right: 4px; margin-bottom: 4px; font-family: monospace; }
.t-actions { margin-bottom: 8px; }
.actions-label { color: #909399; font-size: 12px; margin-right: 4px; }
.t-meta { display: flex; justify-content: space-between; gap: 8px; color: #909399; font-size: 12px; padding-top: 8px; border-top: 1px dashed #ebeef5; }
.t-id { font-family: monospace; }

.detail-body { padding: 0 16px; }
.d-title { margin-top: 0; }
.d-section { display: flex; align-items: flex-start; padding: 8px 0; border-bottom: 1px dashed #ebeef5; }
.d-label { width: 110px; color: #909399; flex-shrink: 0; }
.d-tags { display: flex; flex-wrap: wrap; gap: 4px; }
</style>
