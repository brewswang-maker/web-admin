<template>
  <div class="vp-packs-page">
    <!-- ===== 页头 ===== -->
    <div class="packs-header">
      <div>
        <h2 class="packs-title">{{ t('perimeter.packs.title') }}</h2>
        <div class="packs-sub">{{ t('perimeter.packs.subtitle') }}</div>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">{{ t('common.refresh') }}</el-button>
    </div>

    <!-- ===== 错误态 (可恢复) ===== -->
    <el-result v-if="loadError" icon="warning" :title="t('perimeter.packs.loadFailed')" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">{{ t('common.retry') }}</el-button>
      </template>
    </el-result>

    <!-- ===== 骨架屏 ===== -->
    <el-row v-else-if="loading && packs.length === 0" :gutter="16">
      <el-col :span="12" v-for="i in 2" :key="i">
        <el-card class="pack-card"><el-skeleton :rows="5" animated /></el-card>
      </el-col>
    </el-row>

    <!-- ===== 空态 ===== -->
    <el-empty v-else-if="packs.length === 0" :description="t('perimeter.packs.empty')">
      <el-button @click="reload">{{ t('common.reload') }}</el-button>
    </el-empty>

    <!-- ===== 4 包卡片 (字段全部防御式访问) ===== -->
    <el-row v-else :gutter="16">
      <el-col :span="12" v-for="p in packs" :key="p.scene_pack_id">
        <el-card shadow="hover" class="pack-card" :class="{ 'pack-card--deployed': deployedCount(p.scene_pack_id) > 0 }" @click="openDetail(p)">
          <div class="pack-head">
            <div class="pack-icon">
              <el-icon :size="22"><component :is="packIcon(p.scene_pack_id)" /></el-icon>
            </div>
            <div class="pack-title">
              <div class="pack-name">{{ p.display_name }}</div>
              <div class="pack-id mono">{{ p.scene_pack_id }} · {{ p.scene_tag }}</div>
            </div>
          </div>
          <div class="pack-desc">{{ p.description }}</div>
          <div class="pack-highlights">
            <div v-for="h in (p.highlights ?? []).slice(0, 3)" :key="h" class="hl-item">
              <el-icon :size="12"><CircleCheckFilled /></el-icon>{{ h }}
            </div>
          </div>
          <div class="pack-meta">
            <!-- [UX 2026-09-02 对齐效果图状态色] 已布防/未布防徽标 (按规则 tags 反查, 同总览口径) -->
            <el-tag v-if="deployedCount(p.scene_pack_id) > 0" size="small" type="success" effect="light">
              {{ t('perimeter.packs.deployedN', `已布防 · ${deployedCount(p.scene_pack_id)} 条规则`) }}
            </el-tag>
            <el-tag v-else size="small" type="info" effect="plain">
              {{ t('perimeter.packs.notDeployed', '未布防') }}
            </el-tag>
            <el-tag size="small" type="info">{{ t('perimeter.packs.algoN', { n: p.algo_set?.length ?? 0 }) }}</el-tag>
            <el-tag size="small" type="info">{{ t('perimeter.packs.tplN', { n: p.linkage_templates?.length ?? 0 }) }}</el-tag>
            <el-tag size="small" type="info">ETA ~{{ p.deploy_eta_min ?? '—' }}min</el-tag>
          </div>
          <div class="pack-actions">
            <el-button size="small" @click.stop="openDetail(p)">{{ t('perimeter.packs.detail') }}</el-button>
            <el-button size="small" :loading="applying === p.scene_pack_id"
                       @click.stop="confirmApply(p, false)">
              {{ t('perimeter.packs.checkOnly') }}
            </el-button>
            <el-button size="small" type="primary" :loading="applying === p.scene_pack_id"
                       @click.stop="confirmApply(p, true)">
              {{ t('perimeter.packs.checkAndDeploy') }}
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 应用结果 (校验 + apply v2 布防报告) ===== -->
    <el-dialog v-model="resultVisible" :title="`${t('perimeter.packs.applyResult')} — ${lastResult?.scene_pack_id ?? ''}`" width="620px">
      <template v-if="lastResult">
        <el-result :icon="lastResult.ready ? 'success' : 'warning'"
                   :title="lastResult.ready ? t('perimeter.packs.ready') : t('perimeter.packs.algoGap')">
          <template #sub-title>
            <span v-if="(lastResult.missing_algos?.length ?? 0) === 0">{{ t('perimeter.packs.allRegistered') }}</span>
            <span v-else>{{ t('perimeter.packs.missing') }}: {{ lastResult.missing_algos?.join(', ') }}</span>
          </template>
        </el-result>
        <el-table :data="lastResult?.algo_check ?? []" size="small" max-height="300">
          <el-table-column prop="algo_id" :label="t('perimeter.packs.colAlgo')" min-width="220" />
          <el-table-column :label="t('perimeter.packs.colStatus')" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.registered ? 'success' : 'danger'" size="small">
                {{ row.registered ? t('perimeter.packs.registered') : t('perimeter.packs.missingTag') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="display_name" :label="t('perimeter.packs.colDisplayName')" min-width="140" />
        </el-table>

        <template v-if="lastResult.deployed">
          <el-divider />
          <div class="deploy-summary">
            <el-tag type="success">{{ t('perimeter.packs.createdN', { n: lastResult.rules_created ?? 0 }) }}</el-tag>
            <el-tag type="info">{{ t('perimeter.packs.skippedN', { n: lastResult.rules_skipped ?? 0 }) }}</el-tag>
            <el-tag v-if="(lastResult.rules_failed?.length ?? 0) > 0" type="danger">
              {{ t('perimeter.packs.failedN', { n: lastResult.rules_failed?.length ?? 0 }) }}
            </el-tag>
          </div>
          <el-table v-if="(lastResult.instantiate_detail ?? []).length > 0"
                    :data="lastResult.instantiate_detail" size="small" max-height="200">
            <el-table-column prop="template_id" :label="t('perimeter.packs.colTemplate')" min-width="200" />
            <el-table-column :label="t('perimeter.packs.colStatus')" width="120" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'created' ? 'success'
                          : row.status === 'skipped_exists' ? 'info' : 'danger'" size="small">
                  {{ statusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="rule_id" label="rule_id" min-width="260" />
          </el-table>
        </template>
      </template>
    </el-dialog>

    <!-- ===== 详情抽屉 ===== -->
    <el-drawer v-model="drawerVisible" :title="activePack?.display_name ?? ''" size="520px">
      <template v-if="activePack">
        <p class="drawer-desc">{{ activePack.description }}</p>

        <h4 class="sec-title">{{ t('perimeter.packs.algoSet', { n: activePack.algo_set?.length ?? 0 }) }}</h4>
        <div class="algo-list">
          <div v-for="a in activePack.algo_set ?? []" :key="a" class="algo-item">
            <el-icon :size="12" color="#67c23a"><CircleCheckFilled /></el-icon>
            <span class="mono">{{ a }}</span>
          </div>
        </div>

        <h4 class="sec-title">{{ t('perimeter.packs.zones') }}</h4>
        <div v-for="(names, circle) in activePack.zones ?? {}" :key="circle" class="zone-group">
          <div class="zone-label">{{ circleLabel(String(circle)) }}</div>
          <el-tag v-for="n in names" :key="n" size="small" class="zone-tag">{{ n }}</el-tag>
        </div>

        <h4 class="sec-title">{{ t('perimeter.packs.threshold') }}</h4>
        <el-tag type="warning" size="small" class="mono">{{ activePack.threshold_profile }}</el-tag>

        <h4 class="sec-title">{{ t('perimeter.packs.templates', { n: activePack.linkage_templates?.length ?? 0 }) }}</h4>
        <div class="tpl-list">
          <div v-for="tid in activePack.linkage_templates ?? []" :key="tid" class="tpl-item">
            <el-icon :size="12" color="#409eff"><Link /></el-icon>
            <span class="mono">{{ tid }}</span>
            <span class="tpl-name">{{ templateName(tid) }}</span>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 视频周界 — 布防管理 (vp 轮 2026-08-31, 方案 docs/plans/video-perimeter-solution-v1.0.md §6)
 * 4 场景包卡片 (围墙周界/出入口警戒/禁区防护/边界聚集) + apply v2 幂等布防。
 * 范式对齐 hotel-unattended/ScenePacksView.vue (SSOT 端点复用, 前端按 scene_tag 过滤)。
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import {
  Refresh, CircleCheckFilled, Link, Watch, Guide, Warning, UserFilled,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import { videoPerimeterApi, pickPerimeterPacks, pickPerimeterTemplates } from '@/api/videoPerimeter'
import type { ScenePack, ScenePackApplyResult } from '@/types/largeEvent'
import type { RuleTemplate } from '@/api/linkage'

const { t } = useI18n()

const packs = ref<ScenePack[]>([])
const templates = ref<RuleTemplate[]>([])
const loading = ref(false)
const loadError = ref('')
const applying = ref<string>('')
const resultVisible = ref(false)
const lastResult = ref<ScenePackApplyResult | null>(null)
const drawerVisible = ref(false)
const activePack = ref<ScenePack | null>(null)

/** [UX 2026-09-02] 已布防判定 (规则 tags 含 scene_pack_id, 同总览 deployedPackIds 口径);
 *  拉取失败静默 — 徽标退化为「未布防」不阻塞主卡片 */
const rules = ref<Array<{ tags?: string[]; scene_pack_id?: string; source_pack?: string }>>([])

function deployedCount(packId: string): number {
  return rules.value.filter(r =>
    (r.scene_pack_id ?? r.source_pack ?? (r.tags ?? []).find(tg => String(tg).startsWith('video_perimeter_'))) === packId
  ).length
}

function packIcon(id: string): Component {
  if (id.includes('gate')) return Guide
  if (id.includes('forbidden')) return Warning
  if (id.includes('crowd')) return UserFilled
  return Watch
}

function circleLabel(c: string): string {
  if (c.includes('core')) return t('perimeter.packs.circleCore')
  if (c.includes('alert')) return t('perimeter.packs.circleAlert')
  return t('perimeter.packs.circleControl')
}

function templateName(tid: string): string {
  return templates.value.find(x => x.template_id === tid)?.name ?? ''
}

function statusText(s: string): string {
  if (s === 'created') return t('perimeter.packs.stCreated')
  if (s === 'skipped_exists') return t('perimeter.packs.stSkipped')
  return t('perimeter.packs.stFailed')
}

async function reload() {
  loading.value = true
  loadError.value = ''
  try {
    const [packsRes, tplRes] = await Promise.all([
      videoPerimeterApi.listScenePacks(),
      videoPerimeterApi.listRuleTemplates(),
    ])
    packs.value = pickPerimeterPacks(packsRes.data)
    templates.value = pickPerimeterTemplates((tplRes.data as { data?: unknown })?.data ?? tplRes.data)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
  // 已布防徽标数据 (增强信息, 失败静默)
  try {
    const res = await videoPerimeterApi.listRules()
    rules.value = res.data?.data?.items ?? []
  } catch { rules.value = [] }
}

function openDetail(p: ScenePack) {
  activePack.value = p
  drawerVisible.value = true
}

async function confirmApply(p: ScenePack, deploy: boolean) {
  try {
    await ElMessageBox.confirm(
      deploy ? t('perimeter.packs.confirmDeploy', { name: p.display_name })
             : t('perimeter.packs.confirmCheck', { name: p.display_name }),
      t('perimeter.packs.confirmTitle'),
      { type: deploy ? 'warning' : 'info', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch {
    return
  }
  applying.value = p.scene_pack_id
  try {
    const res = await videoPerimeterApi.applyScenePack(p.scene_pack_id, { deploy })
    lastResult.value = ((res.data as { data?: ScenePackApplyResult })?.data) ?? null
    resultVisible.value = true
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    applying.value = ''
  }
}

onMounted(reload)
</script>

<style scoped>
.vp-packs-page { padding: 16px 20px; }
.packs-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.packs-title { margin: 0 0 4px; font-size: 20px; }
.packs-sub { color: var(--el-text-color-secondary); font-size: 13px; }
.pack-card { margin-bottom: 16px; cursor: pointer; }
.pack-card--deployed { border-color: var(--el-color-success-light-5); }
.pack-card--deployed .pack-icon { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.pack-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.pack-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--el-color-primary-light-9); color: var(--el-color-primary); flex-shrink: 0; }
.pack-name { font-size: 16px; font-weight: 600; }
.pack-id { font-size: 12px; color: var(--el-text-color-secondary); }
.mono { font-family: Menlo, Consolas, monospace; }
.pack-desc { font-size: 13px; color: var(--el-text-color-regular); line-height: 1.6; margin-bottom: 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pack-highlights { margin-bottom: 10px; }
.hl-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.8; color: #67c23a; }
.pack-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.pack-actions { display: flex; gap: 8px; }
.drawer-desc { font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); }
.sec-title { margin: 16px 0 8px; font-size: 13px; color: var(--el-text-color-secondary); }
.algo-list { display: flex; flex-direction: column; gap: 6px; }
.algo-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.zone-group { margin-bottom: 10px; }
.zone-label { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px; }
.zone-tag { margin: 0 6px 6px 0; }
.tpl-list { display: flex; flex-direction: column; gap: 8px; }
.tpl-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.tpl-name { color: var(--el-text-color-secondary); }
.deploy-summary { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
</style>
