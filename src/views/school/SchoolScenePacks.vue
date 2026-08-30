<template>
  <div class="sc-packs-page">
    <!-- ===== 页头 ===== -->
    <div class="packs-header">
      <div>
        <h2 class="packs-title">校园场景包</h2>
        <div class="packs-sub">按校园形态一键校验算法可用性, 输出三圈布防与联动预案部署清单 (对标海康/大华场景包订阅)</div>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
    </div>

    <!-- ===== 错误态 ===== -->
    <el-result v-if="loadError" icon="warning" title="场景包加载失败" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">重试</el-button>
        <div class="err-hint">若设备刚完成升级, 请尝试 Ctrl+F5 / Cmd+Shift+R 强制刷新页面缓存</div>
      </template>
    </el-result>

    <!-- ===== 骨架屏 ===== -->
    <el-row v-else-if="loading && campusPacks.length === 0" :gutter="16">
      <el-col :span="8" v-for="i in 3" :key="i">
        <el-card class="pack-card">
          <el-skeleton :rows="5" animated />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 空态 ===== -->
    <el-empty v-else-if="campusPacks.length === 0"
              description="无可用校园场景包 (后端 ScenePackDefs school_campus tag 未返回数据)">
      <el-button @click="reload">重新加载</el-button>
    </el-empty>

    <!-- ===== 场景包卡片 (防御式访问) ===== -->
    <el-row v-else :gutter="16">
      <el-col :span="8" v-for="p in campusPacks" :key="p.scene_pack_id">
        <el-card shadow="hover" class="pack-card" @click="openDetail(p)">
          <div class="pack-head">
            <div class="pack-icon" :class="packClass(p.scene_pack_id)">
              <el-icon :size="22"><component :is="packIcon(p.scene_pack_id)" /></el-icon>
            </div>
            <div class="pack-title">
              <div class="pack-name">{{ p.display_name }}</div>
              <div class="pack-id">{{ p.scene_pack_id }} · {{ p.scene_tag }}</div>
            </div>
          </div>
          <div class="pack-desc">{{ p.description }}</div>
          <div class="pack-highlights">
            <div v-for="h in (p.highlights ?? []).slice(0, 3)" :key="h" class="hl-item">
              <el-icon :size="12"><CircleCheckFilled /></el-icon>{{ h }}
            </div>
          </div>
          <div class="pack-meta">
            <el-tag size="small" type="info">算法 {{ p.algo_set?.length ?? 0 }}</el-tag>
            <el-tag size="small" type="info">联动 {{ p.linkage_templates?.length ?? 0 }}</el-tag>
            <el-tag size="small" type="info">ETA ~{{ p.deploy_eta_min ?? '—' }}min</el-tag>
          </div>
          <div class="pack-actions">
            <el-button size="small" @click.stop="openDetail(p)">查看详情</el-button>
            <el-button size="small" :loading="applying === p.scene_pack_id"
                       @click.stop="confirmApply(p, false)">
              仅校验
            </el-button>
            <el-button size="small" type="primary" :loading="applying === p.scene_pack_id"
                       @click.stop="confirmApply(p, true)">
              校验并布防
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 应用结果 (缺口报告 + 布防结果) ===== -->
    <el-dialog v-model="resultVisible" :title="`应用结果 — ${lastResult?.scene_pack_id ?? ''}`" width="620px">
      <template v-if="lastResult">
        <el-result :icon="lastResult.ready ? 'success' : 'warning'"
                   :title="lastResult.ready ? '场景包就绪' : '存在算法缺口 (不阻塞布防)'">
          <template #sub-title>
            <span v-if="(lastResult.missing_algos?.length ?? 0) === 0">全部算法已注册, 可按 zones 清单布防</span>
            <span v-else>缺失: {{ lastResult.missing_algos?.join(', ') }}</span>
          </template>
        </el-result>
        <el-table :data="lastResult?.algo_check ?? []" size="small" max-height="300">
          <el-table-column prop="algo_id" label="算法" min-width="220" />
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.registered ? 'success' : 'danger'" size="small">
                {{ row.registered ? '已注册' : '缺失' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="display_name" label="显示名" min-width="140" />
        </el-table>

        <!-- [校园二期增强] 无论是否布防均可跳规则页 (带 tag 过滤; 便于查看已布防的 SC 实例规则) -->
        <div class="go-rules-row">
          <el-button size="small" link type="primary" @click="goRules">去联动规则页查看 (标签 scene_pack) →</el-button>
        </div>

        <template v-if="lastResult.deployed">
          <el-divider />
          <div class="deploy-summary">
            <el-tag type="success">新建规则 {{ lastResult.rules_created ?? 0 }}</el-tag>
            <el-tag type="info">跳过已有 {{ lastResult.rules_skipped ?? 0 }}</el-tag>
            <el-tag v-if="(lastResult.rules_failed?.length ?? 0) > 0" type="danger">
              失败 {{ lastResult.rules_failed?.length }}
            </el-tag>
            <el-button size="small" link type="primary" @click="goRules">去联动规则页查看</el-button>
          </div>
          <el-table v-if="(lastResult.instantiate_detail ?? []).length > 0"
                    :data="lastResult.instantiate_detail" size="small" max-height="200">
            <el-table-column prop="template_id" label="SC 模板" min-width="170" />
            <el-table-column label="状态" width="120" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'created' ? 'success'
                          : row.status === 'skipped_exists' ? 'info' : 'danger'" size="small">
                  {{ statusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="rule_id" label="规则 ID" min-width="260" />
          </el-table>
        </template>
      </template>
    </el-dialog>

    <!-- ===== 详情抽屉 ===== -->
    <el-drawer v-model="drawerVisible" :title="activePack?.display_name ?? ''" size="520px">
      <template v-if="activePack">
        <p class="drawer-desc">{{ activePack.description }}</p>

        <h4 class="sec-title">算法集 ({{ activePack.algo_set?.length ?? 0 }})</h4>
        <div class="algo-list">
          <div v-for="a in activePack.algo_set ?? []" :key="a" class="algo-item">
            <el-icon :size="12" color="#67c23a"><CircleCheckFilled /></el-icon>
            <span class="mono">{{ a }}</span>
          </div>
        </div>

        <h4 class="sec-title">三圈布防 zones</h4>
        <div v-for="(names, circle) in activePack.zones ?? {}" :key="circle" class="zone-group">
          <div class="zone-label">{{ circleLabel(String(circle)) }}</div>
          <el-tag v-for="n in names" :key="n" size="small" class="zone-tag">{{ n }}</el-tag>
        </div>

        <h4 class="sec-title">阈值档位</h4>
        <el-tag type="warning" size="small" class="mono">{{ activePack.threshold_profile }}</el-tag>

        <h4 class="sec-title">联动预案模板 ({{ activePack.linkage_templates?.length ?? 0 }})</h4>
        <div class="tpl-list">
          <div v-for="tid in activePack.linkage_templates ?? []" :key="tid" class="tpl-item">
            <el-icon :size="12" color="#409eff"><Link /></el-icon>
            <span class="mono">{{ tid }}</span>
            <span class="tpl-name">{{ templateName(tid) }}</span>
          </div>
        </div>
        <div v-if="scTemplateCount > 0" class="sc-count">
          LinkageEngine 校园模板库共 <strong>{{ scTemplateCount }}</strong> 个 SC-* 模板 (category=校园)
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 校园场景包 — [校园二期 2026-08-30]
 *
 * 三个校园场景包卡片 (中小学校园日常/寄宿制校园/考试护考模式, 对齐 ScenePackDefs.h
 * school_campus tag) + el-drawer 详情 (algo_set / 三圈 zones / 阈值档位 / SC-* 模板)
 * + 应用: 双模式 (仅校验 = 缺口报告; 校验并布防 = deploy=true 实例化 SC 模板为联动规则,
 *   幂等, 机器 tag 为 scene_pack/school_campus)。
 * 数据源复用 /large-event/scene-packs SSOT 端点 (后端全量返回, 本页按 tag 过滤)。
 * 三态完整 (骨架屏/错误态/空态), 范式对齐 large-event/ScenePacksView.vue。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheckFilled, Link, Box, Moon, EditPen, Refresh,
} from '@element-plus/icons-vue'
import { schoolApi } from '@/api/school'
import { linkageApi } from '@/api/linkage'
import type { RuleTemplate } from '@/api/linkage'
import type { ScenePack, ScenePackApplyResult } from '@/types/largeEvent'
import type { Component } from 'vue'

const packs = ref<ScenePack[]>([])
const templates = ref<RuleTemplate[]>([])
const loading = ref(false)
const applying = ref('')
const loadError = ref('')
const router = useRouter()

const drawerVisible = ref(false)
const activePack = ref<ScenePack | null>(null)
const resultVisible = ref(false)
const lastResult = ref<ScenePackApplyResult | null>(null)

const scTemplateCount = ref(0)

/** 只呈现校园场景包 (school_campus tag); 大型活动包在 /large-event/scene-packs 页 */
const campusPacks = computed(() =>
  packs.value.filter(p => p.scene_tag === 'school_campus'))

function packIcon(packId: string): Component {
  if (packId.includes('boarding')) return Moon
  if (packId.includes('exam')) return EditPen
  return Box
}

function packClass(packId: string) {
  if (packId.includes('boarding')) return 'pk-boarding'
  if (packId.includes('exam')) return 'pk-exam'
  return 'pk-primary'
}

function circleLabel(circle: string) {
  if (circle.includes('core')) return '核心圈 (教学/宿舍/考场)'
  if (circle.includes('alert')) return '警戒圈 (校门/食堂/公共活动)'
  if (circle.includes('control')) return '管控圈 (围墙/外围道路)'
  return circle
}

function templateName(templateId: string) {
  return templates.value.find(t => t.template_id === templateId)?.name ?? ''
}

async function fetchPacks() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await schoolApi.listScenePacks()
    const body = res?.data
    // 结构防御: 常规 {code,data:{scene_packs}}, 兼容 data 直为数组 / 顶层直为数组
    const list: ScenePack[] = body?.data?.scene_packs
      ?? (Array.isArray(body?.data) ? body.data : [])
      ?? []
    if (body && typeof body === 'object' && 'code' in body && (body as { code?: number }).code !== 0) {
      const b = body as { code?: number; msg?: string }
      loadError.value = `后端返回 code=${b.code}${b.msg ? `: ${b.msg}` : ''}`
      packs.value = []
      return
    }
    packs.value = list
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    loadError.value = msg.includes('404')
      ? '接口 404: 页面脚本与后端版本不匹配, 请强制刷新 (Ctrl+F5) 后重试'
      : `请求异常: ${msg}`
    packs.value = []
    ElMessage.warning(`场景包加载失败: ${msg}`)
  } finally {
    loading.value = false
  }
}

function reload() {
  fetchPacks()
  fetchTemplates()
}

async function fetchTemplates() {
  try {
    const res = await linkageApi.getRuleTemplates()
    const list = res.data?.data ?? []
    templates.value = list
    scTemplateCount.value = list.filter(t => t.template_id.startsWith('SC-')).length
  } catch {
    templates.value = []
  }
}

function openDetail(p: ScenePack) {
  activePack.value = p
  drawerVisible.value = true
}

async function confirmApply(p: ScenePack, deploy: boolean) {
  try {
    await ElMessageBox.confirm(
      deploy
        ? `将按场景包「${p.display_name}」校验算法可用性, 并把 ${p.linkage_templates?.length ?? 0} 个 SC 联动模板实例化为规则 (幂等, 已存在跳过; 可在「联动规则」页查看)。继续?`
        : `将按场景包「${p.display_name}」校验算法可用性并输出部署清单 (不写配置)。继续?`,
      deploy ? '校验并布防' : '仅校验',
      { confirmButtonText: deploy ? '布防' : '校验', cancelButtonText: '取消', type: 'info' }
    )
  } catch {
    return
  }
  applying.value = p.scene_pack_id
  try {
    const res = await schoolApi.applyScenePack(
      p.scene_pack_id, deploy ? { deploy: true } : undefined)
    lastResult.value = res.data?.data ?? null
    if (!lastResult.value) {
      ElMessage.error('应用响应异常 (无 data)')
      return
    }
    resultVisible.value = true
    if (lastResult.value.ready) {
      ElMessage.success(`场景包 ${p.display_name} 就绪`)
    } else {
      ElMessage.warning(`存在 ${lastResult.value.missing_algos?.length ?? 0} 个算法缺口, 详见报告`)
    }
    if (deploy) {
      ElMessage.success(
        `布防完成: 新建 ${lastResult.value.rules_created ?? 0} 条规则, 跳过已有 ${lastResult.value.rules_skipped ?? 0} 条`)
    }
  } catch (e: unknown) {
    ElMessage.error(`应用失败: ${(e as Error)?.message ?? e}`)
  } finally {
    applying.value = ''
  }
}

function statusText(s: string) {
  return s === 'created' ? '已创建'
       : s === 'skipped_exists' ? '已存在跳过'
       : s === 'template_missing' ? '模板缺失'
       : s === 'add_failed' ? '创建失败' : s
}

function goRules() {
  resultVisible.value = false
  // [校园二期增强 2026-08-30] 带 tag 过滤跳转 (LinkageRuleView 读 ?tag 预填 tagFilter)
  router.push({ path: '/linkage', query: { tag: 'scene_pack' } })
}

onMounted(() => {
  reload()
})
</script>

<style scoped>
.sc-packs-page { padding: 4px 0; }
.packs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.packs-title { margin: 0; font-size: 18px; font-weight: 600; }
.packs-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.err-hint { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
.deploy-summary { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.go-rules-row { margin-top: 10px; display: flex; justify-content: flex-end; }
.pack-card { margin-bottom: 16px; cursor: pointer; }
.pack-head { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
.pack-icon { width: 44px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.pk-primary { background: #409eff; }
.pk-boarding { background: #a855f7; }
.pk-exam { background: #e6a23c; }
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
.sc-count { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
