<template>
  <div class="hu-packs-page">
    <!-- ===== 页头 ===== -->
    <div class="packs-header">
      <div>
        <h2 class="packs-title">{{ t('hotel.packs.title') }}</h2>
        <div class="packs-sub">{{ t('hotel.packs.subtitle') }}</div>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">{{ t('common.refresh') }}</el-button>
    </div>

    <!-- ===== 错误态 (可恢复) ===== -->
    <el-result v-if="loadError" icon="warning" :title="t('hotel.packs.loadFailed')" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">{{ t('common.retry') }}</el-button>
        <div class="err-hint">{{ t('hotel.common.errHint') }}</div>
      </template>
    </el-result>

    <!-- ===== 骨架屏 ===== -->
    <el-row v-else-if="loading && packs.length === 0" :gutter="16">
      <el-col :span="8" v-for="i in 3" :key="i">
        <el-card class="pack-card"><el-skeleton :rows="5" animated /></el-card>
      </el-col>
    </el-row>

    <!-- ===== 空态 ===== -->
    <el-empty v-else-if="packs.length === 0" :description="t('hotel.packs.empty')">
      <el-button @click="reload">{{ t('common.reload') }}</el-button>
    </el-empty>

    <!-- ===== 6 包卡片 ([P1-2 v2.1] 恰 5→6, 字段全部防御式访问) ===== -->
    <el-row v-else :gutter="16">
      <el-col :span="8" v-for="p in packs" :key="p.scene_pack_id">
        <el-card shadow="hover" class="pack-card" @click="openDetail(p)">
          <div class="pack-head">
            <div class="pack-icon" :class="packClass(p.scene_pack_id)">
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
            <el-tag size="small" type="info">{{ t('hotel.packs.algoN', { n: p.algo_set?.length ?? 0 }) }}</el-tag>
            <el-tag size="small" type="info">{{ t('hotel.packs.tplN', { n: p.linkage_templates?.length ?? 0 }) }}</el-tag>
            <el-tag size="small" type="info">ETA ~{{ p.deploy_eta_min ?? '—' }}min</el-tag>
          </div>
          <div class="pack-actions">
            <el-button size="small" @click.stop="openDetail(p)">{{ t('hotel.packs.detail') }}</el-button>
            <el-button size="small" :loading="applying === p.scene_pack_id"
                       @click.stop="confirmApply(p, false)">
              {{ t('hotel.packs.checkOnly') }}
            </el-button>
            <el-button size="small" type="primary" :loading="applying === p.scene_pack_id"
                       @click.stop="confirmApply(p, true)">
              {{ t('hotel.packs.checkAndDeploy') }}
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 应用结果 (校验 + apply v2 布防报告) ===== -->
    <el-dialog v-model="resultVisible" :title="`${t('hotel.packs.applyResult')} — ${lastResult?.scene_pack_id ?? ''}`" width="620px">
      <template v-if="lastResult">
        <el-result :icon="lastResult.ready ? 'success' : 'warning'"
                   :title="lastResult.ready ? t('hotel.packs.ready') : t('hotel.packs.algoGap')">
          <template #sub-title>
            <span v-if="(lastResult.missing_algos?.length ?? 0) === 0">{{ t('hotel.packs.allRegistered') }}</span>
            <span v-else>{{ t('hotel.packs.missing') }}: {{ lastResult.missing_algos?.join(', ') }}</span>
          </template>
        </el-result>
        <el-table :data="lastResult?.algo_check ?? []" size="small" max-height="300">
          <el-table-column prop="algo_id" :label="t('hotel.packs.colAlgo')" min-width="220" />
          <el-table-column :label="t('hotel.packs.colStatus')" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.registered ? 'success' : 'danger'" size="small">
                {{ row.registered ? t('hotel.packs.registered') : t('hotel.packs.missingTag') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="display_name" :label="t('hotel.packs.colDisplayName')" min-width="140" />
        </el-table>

        <template v-if="lastResult.deployed">
          <el-divider />
          <div class="deploy-summary">
            <el-tag type="success">{{ t('hotel.packs.createdN', { n: lastResult.rules_created ?? 0 }) }}</el-tag>
            <el-tag type="info">{{ t('hotel.packs.skippedN', { n: lastResult.rules_skipped ?? 0 }) }}</el-tag>
            <el-tag v-if="(lastResult.rules_failed?.length ?? 0) > 0" type="danger">
              {{ t('hotel.packs.failedN', { n: lastResult.rules_failed?.length ?? 0 }) }}
            </el-tag>
            <el-button size="small" link type="primary" @click="goRules">{{ t('hotel.packs.goRules') }}</el-button>
          </div>
          <el-table v-if="(lastResult.instantiate_detail ?? []).length > 0"
                    :data="lastResult.instantiate_detail" size="small" max-height="200">
            <el-table-column prop="template_id" :label="t('hotel.packs.colTemplate')" min-width="200" />
            <el-table-column :label="t('hotel.packs.colStatus')" width="120" align="center">
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

        <h4 class="sec-title">{{ t('hotel.packs.algoSet', { n: activePack.algo_set?.length ?? 0 }) }}</h4>
        <div class="algo-list">
          <div v-for="a in activePack.algo_set ?? []" :key="a" class="algo-item">
            <el-icon :size="12" color="#67c23a"><CircleCheckFilled /></el-icon>
            <span class="mono">{{ a }}</span>
          </div>
        </div>

        <h4 class="sec-title">{{ t('hotel.packs.zones') }}</h4>
        <div v-for="(names, circle) in activePack.zones ?? {}" :key="circle" class="zone-group">
          <div class="zone-label">{{ circleLabel(String(circle)) }}</div>
          <el-tag v-for="n in names" :key="n" size="small" class="zone-tag">{{ n }}</el-tag>
        </div>

        <h4 class="sec-title">{{ t('hotel.packs.threshold') }}</h4>
        <el-tag type="warning" size="small" class="mono">{{ activePack.threshold_profile }}</el-tag>

        <h4 class="sec-title">{{ t('hotel.packs.templates', { n: activePack.linkage_templates?.length ?? 0 }) }}</h4>
        <div class="tpl-list">
          <div v-for="tid in activePack.linkage_templates ?? []" :key="tid" class="tpl-item">
            <el-icon :size="12" color="#409eff"><Link /></el-icon>
            <span class="mono">{{ tid }}</span>
            <span class="tpl-name">{{ templateName(tid) }}</span>
          </div>
        </div>
        <div v-if="htTemplateCount > 0" class="ht-count">
          LinkageEngine {{ t('hotel.packs.htLibCount', { n: htTemplateCount }) }}
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 场景包管理 — 酒店无人值守 t8f D3 (方案 §5.7 视图 3)
 *
 * 6 包卡片 (corridor/guestfloor/linen/night_patrol/contractor/receiving,
 * [P1-2 v2.1] 恰 5→6: +receiving §5.4-C 收货补包, 对齐
 * ScenePackDefs.h hotel_unattended 包组) + el-drawer 详情 (algo_set /
 * zones / 阈值档位 / HT-* linkage_templates 匹配) + apply: 双模式
 * (仅校验 = 可用性校验+缺口报告; 校验并布防 = apply v2 deploy=true
 * 幂等实例化 HT 模板为联动规则, 稳定 rule_id "le-{pack}-{tid}")。
 * 三态防御: 骨架屏 / 错误态可恢复 / 空态 (对齐 large-event ScenePacksView 规范)。
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  CircleCheckFilled, Link, Refresh, School, House, Brush, Moon, UserFilled, Van, Box,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import { hotelUnattendedApi, pickHotelPacks, pickHotelTemplates } from '@/api/hotelUnattended'
import type { ScenePack, ScenePackApplyResult } from '@/types/largeEvent'
import type { RuleTemplate } from '@/api/linkage'

const { t } = useI18n()
const router = useRouter()

const packs = ref<ScenePack[]>([])
const templates = ref<RuleTemplate[]>([])
const loading = ref(false)
const applying = ref('')
const loadError = ref('')

const drawerVisible = ref(false)
const activePack = ref<ScenePack | null>(null)
const resultVisible = ref(false)
const lastResult = ref<ScenePackApplyResult | null>(null)

const htTemplateCount = ref(0)

function packIcon(packId: string): Component {
  if (packId.includes('corridor')) return School
  if (packId.includes('guestfloor')) return House
  if (packId.includes('linen')) return Brush
  if (packId.includes('night')) return Moon
  if (packId.includes('contractor')) return UserFilled
  if (packId.includes('receiving')) return Van      // [P1-2 v2.1] 收货补包
  return Box
}

function packClass(packId: string) {
  if (packId.includes('corridor')) return 'pk-corridor'
  if (packId.includes('guestfloor')) return 'pk-guestfloor'
  if (packId.includes('linen')) return 'pk-linen'
  if (packId.includes('night')) return 'pk-night'
  if (packId.includes('receiving')) return 'pk-receiving'  // [P1-2 v2.1] 收货补包
  return 'pk-contractor'
}

function circleLabel(circle: string) {
  if (circle.includes('core')) return t('hotel.packs.circleCore')
  if (circle.includes('alert')) return t('hotel.packs.circleAlert')
  if (circle.includes('control')) return t('hotel.packs.circleControl')
  return circle
}

function templateName(templateId: string) {
  return templates.value.find(t => t.template_id === templateId)?.name ?? ''
}

async function fetchPacks() {
  const res = await hotelUnattendedApi.listScenePacks()
  const body = res?.data
  if (body && typeof body === 'object' && 'code' in body && (body as { code?: number }).code !== 0) {
    const b = body as { code?: number; msg?: string }
    throw new Error(`code=${b.code}${b.msg ? `: ${b.msg}` : ''}`)
  }
  packs.value = pickHotelPacks(body)
}

async function fetchTemplates() {
  try {
    const res = await hotelUnattendedApi.listRuleTemplates()
    const list = pickHotelTemplates(res.data?.data)
    templates.value = list
    htTemplateCount.value = list.length
  } catch { templates.value = [] }
}

function reload() {
  loading.value = true
  loadError.value = ''
  fetchTemplates()
  fetchPacks()
    .catch((e: unknown) => {
      const msg = (e as Error)?.message ?? String(e)
      loadError.value = msg.includes('404')
        ? t('hotel.common.err404')
        : `${t('hotel.common.reqError')}: ${msg}`
      packs.value = []
      ElMessage.warning(`${t('hotel.packs.loadFailed')}: ${msg}`)
    })
    .finally(() => { loading.value = false })
}

function openDetail(p: ScenePack) {
  activePack.value = p
  drawerVisible.value = true
}

async function confirmApply(p: ScenePack, deploy: boolean) {
  try {
    await ElMessageBox.confirm(
      deploy
        ? t('hotel.packs.confirmDeploy', { name: p.display_name, n: p.linkage_templates?.length ?? 0 })
        : t('hotel.packs.confirmCheck', { name: p.display_name }),
      deploy ? t('hotel.packs.checkAndDeploy') : t('hotel.packs.checkOnly'),
      { confirmButtonText: deploy ? t('hotel.packs.deploy') : t('hotel.packs.check'), cancelButtonText: t('common.cancel'), type: 'info' }
    )
  } catch { return }
  applying.value = p.scene_pack_id
  try {
    const res = await hotelUnattendedApi.applyScenePack(
      p.scene_pack_id, deploy ? { deploy: true } : undefined)
    lastResult.value = res.data?.data ?? null
    if (!lastResult.value) {
      ElMessage.error(t('hotel.packs.applyNoData'))
      return
    }
    resultVisible.value = true
    if (lastResult.value.ready) {
      ElMessage.success(t('hotel.packs.readyMsg', { name: p.display_name }))
    } else {
      ElMessage.warning(t('hotel.packs.gapMsg', { n: lastResult.value.missing_algos?.length ?? 0 }))
    }
    if (deploy) {
      ElMessage.success(t('hotel.packs.deployDone', {
        created: lastResult.value.rules_created ?? 0,
        skipped: lastResult.value.rules_skipped ?? 0,
      }))
    }
  } catch (e: unknown) {
    ElMessage.error(`${t('hotel.packs.applyFailed')}: ${(e as Error)?.message ?? e}`)
  } finally { applying.value = '' }
}

function statusText(s: string) {
  return s === 'created' ? t('hotel.packs.stCreated')
       : s === 'skipped_exists' ? t('hotel.packs.stSkipped')
       : s === 'template_missing' ? t('hotel.packs.stMissing')
       : s === 'add_failed' ? t('hotel.packs.stFailed') : s
}

function goRules() {
  resultVisible.value = false
  router.push('/hotel-unattended/rules')
}

onMounted(() => { reload() })
</script>

<style scoped>
.hu-packs-page { padding: 4px 0; }
.packs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.packs-title { margin: 0; font-size: 18px; font-weight: 600; }
.packs-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.err-hint { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
.deploy-summary { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.pack-card { margin-bottom: 16px; cursor: pointer; }
.pack-head { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
.pack-icon { width: 44px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.pk-corridor { background: #409eff; }
.pk-guestfloor { background: #67c23a; }
.pk-linen { background: #e6a23c; }
.pk-night { background: #626aef; }
.pk-contractor { background: #909399; }
.pk-receiving { background: #00b2a9; }
.pack-name { font-weight: 600; font-size: 15px; }
.pack-id { font-size: 12px; color: var(--el-text-color-secondary); font-family: 'JetBrains Mono', Consolas, monospace; }
.pack-desc { font-size: 13px; color: var(--el-text-color-regular); line-height: 1.5; min-height: 40px; }
.pack-highlights { margin: 10px 0; display: flex; flex-direction: column; gap: 4px; }
.hl-item { font-size: 12px; color: var(--el-text-color-secondary); display: flex; align-items: center; gap: 5px; }
.pack-meta { display: flex; gap: 8px; margin-bottom: 12px; }
.pack-actions { display: flex; justify-content: flex-end; gap: 8px; }
.drawer-desc { font-size: 13px; color: var(--el-text-color-regular); margin-bottom: 8px; }
.sec-title { margin: 18px 0 8px; font-size: 14px; }
.mono { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; }
.algo-list { display: flex; flex-direction: column; gap: 5px; }
.algo-item { display: flex; align-items: center; gap: 6px; }
.zone-group { margin-bottom: 10px; }
.zone-label { font-size: 13px; font-weight: 500; margin-bottom: 4px; }
.zone-tag { margin: 0 6px 4px 0; }
.tpl-list { display: flex; flex-direction: column; gap: 5px; }
.tpl-item { display: flex; align-items: center; gap: 6px; }
.tpl-name { font-size: 12px; color: var(--el-text-color-secondary); }
.ht-count { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
