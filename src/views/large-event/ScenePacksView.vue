<template>
  <div class="le-packs-page">
    <!-- ===== 场景包卡片 ===== -->
    <el-row :gutter="16">
      <el-col :span="8" v-for="p in packs" :key="p.scene_pack_id">
        <el-card shadow="hover" class="pack-card" @click="openDetail(p)">
          <div class="pack-head">
            <div class="pack-icon" :class="sceneClass(p.scene_tag)">
              <el-icon :size="22"><component :is="sceneIcon(p.scene_tag)" /></el-icon>
            </div>
            <div class="pack-title">
              <div class="pack-name">{{ p.display_name }}</div>
              <div class="pack-id">{{ p.scene_pack_id }} · {{ p.scene_tag }}</div>
            </div>
          </div>
          <div class="pack-desc">{{ p.description }}</div>
          <div class="pack-highlights">
            <div v-for="h in p.highlights.slice(0, 3)" :key="h" class="hl-item">
              <el-icon :size="12"><CircleCheckFilled /></el-icon>{{ h }}
            </div>
          </div>
          <div class="pack-meta">
            <el-tag size="small" type="info">算法 {{ p.algo_set.length }}</el-tag>
            <el-tag size="small" type="info">联动 {{ p.linkage_templates.length }}</el-tag>
            <el-tag size="small" type="info">ETA ~{{ p.deploy_eta_min }}min</el-tag>
          </div>
          <div class="pack-actions">
            <el-button size="small" @click.stop="openDetail(p)">查看详情</el-button>
            <el-button size="small" type="primary" :loading="applying === p.scene_pack_id"
                       @click.stop="confirmApply(p)">
              应用场景包
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 应用结果 (缺口报告) ===== -->
    <el-dialog v-model="resultVisible" :title="`应用结果 — ${lastResult?.scene_pack_id ?? ''}`" width="620px">
      <template v-if="lastResult">
        <el-result :icon="lastResult.ready ? 'success' : 'warning'"
                   :title="lastResult.ready ? '场景包就绪' : '存在算法缺口 (v1 仅校验, 不阻塞)'">
          <template #sub-title>
            <span v-if="lastResult.missing_algos.length === 0">全部算法已注册, 可按 zones 清单布防</span>
            <span v-else>缺失: {{ lastResult.missing_algos.join(', ') }}</span>
          </template>
        </el-result>
        <el-table :data="lastResult.algo_check" size="small" max-height="300">
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
      </template>
    </el-dialog>

    <!-- ===== 详情抽屉 ===== -->
    <el-drawer v-model="drawerVisible" :title="activePack?.display_name ?? ''" size="520px">
      <template v-if="activePack">
        <p class="drawer-desc">{{ activePack.description }}</p>

        <h4 class="sec-title">算法集 ({{ activePack.algo_set.length }})</h4>
        <div class="algo-list">
          <div v-for="a in activePack.algo_set" :key="a" class="algo-item">
            <el-icon :size="12" color="#67c23a"><CircleCheckFilled /></el-icon>
            <span class="mono">{{ a }}</span>
          </div>
        </div>

        <h4 class="sec-title">三圈布防 zones</h4>
        <div v-for="(names, circle) in activePack.zones" :key="circle" class="zone-group">
          <div class="zone-label">{{ circleLabel(String(circle)) }}</div>
          <el-tag v-for="n in names" :key="n" size="small" class="zone-tag">{{ n }}</el-tag>
        </div>

        <h4 class="sec-title">阈值档位</h4>
        <el-tag type="warning" size="small" class="mono">{{ activePack.threshold_profile }}</el-tag>

        <h4 class="sec-title">联动预案模板 ({{ activePack.linkage_templates.length }})</h4>
        <div class="tpl-list">
          <div v-for="tid in activePack.linkage_templates" :key="tid" class="tpl-item">
            <el-icon :size="12" color="#409eff"><Link /></el-icon>
            <span class="mono">{{ tid }}</span>
            <span class="tpl-name">{{ templateName(tid) }}</span>
          </div>
        </div>
        <div v-if="leTemplateCount > 0" class="le-count">
          LinkageEngine 大型活动模板库共 <strong>{{ leTemplateCount }}</strong> 个 LE-* 模板 (category=大型活动)
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 场景包 — EventGuard T2.5 (方案任务 5.3)
 *
 * 五场景包卡片 (体育场馆/户外演出/展会博览/马拉松/通用) + el-drawer 详情
 * (algo_set / zones 三圈 / 阈值档位 / linkage_templates 与 LinkageEngine LE-* 名称匹配)
 * + 应用 (v1: 可用性校验 + 缺口报告)。
 */
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheckFilled, Link, Trophy, Mic, OfficeBuilding, Flag, Box,
} from '@element-plus/icons-vue'
import { largeEventApi } from '@/api/largeEvent'
import { linkageApi } from '@/api/linkage'
import type { RuleTemplate } from '@/api/linkage'
import type { ScenePack, ScenePackApplyResult } from '@/types/largeEvent'
import type { Component } from 'vue'

const packs = ref<ScenePack[]>([])
const templates = ref<RuleTemplate[]>([])
const loading = ref(false)
const applying = ref('')

const drawerVisible = ref(false)
const activePack = ref<ScenePack | null>(null)
const resultVisible = ref(false)
const lastResult = ref<ScenePackApplyResult | null>(null)

const leTemplateCount = ref(0)

function sceneIcon(tag: string): Component {
  if (tag.includes('stadium')) return Trophy
  if (tag.includes('openair')) return Mic
  if (tag.includes('expo')) return OfficeBuilding
  if (tag.includes('marathon')) return Flag
  return Box
}

function sceneClass(tag: string) {
  if (tag.includes('stadium')) return 'sc-stadium'
  if (tag.includes('openair')) return 'sc-openair'
  if (tag.includes('expo')) return 'sc-expo'
  if (tag.includes('marathon')) return 'sc-marathon'
  return 'sc-generic'
}

function circleLabel(circle: string) {
  if (circle.includes('core')) return '核心圈 (赛场/舞台)'
  if (circle.includes('alert')) return '警戒圈 (看台/缓冲)'
  if (circle.includes('control')) return '管控圈 (外围道路)'
  return circle
}

function templateName(templateId: string) {
  return templates.value.find(t => t.template_id === templateId)?.name ?? ''
}

async function fetchPacks() {
  loading.value = true
  try {
    const res = await largeEventApi.listScenePacks()
    packs.value = res.data?.data?.scene_packs ?? []
  } catch (e: unknown) {
    ElMessage.warning(`场景包加载失败: ${(e as Error)?.message ?? e}`)
  } finally {
    loading.value = false
  }
}

async function fetchTemplates() {
  try {
    const res = await linkageApi.getRuleTemplates()
    const list = res.data?.data ?? []
    templates.value = list
    leTemplateCount.value = list.filter(t => t.template_id.startsWith('LE-')).length
  } catch {
    templates.value = []
  }
}

function openDetail(p: ScenePack) {
  activePack.value = p
  drawerVisible.value = true
}

async function confirmApply(p: ScenePack) {
  try {
    await ElMessageBox.confirm(
      `将按场景包「${p.display_name}」校验算法可用性并输出部署清单 (v1 不写配置), 预计 ~${p.deploy_eta_min} 分钟。继续?`,
      '应用场景包',
      { confirmButtonText: '应用', cancelButtonText: '取消', type: 'info' }
    )
  } catch {
    return
  }
  applying.value = p.scene_pack_id
  try {
    const res = await largeEventApi.applyScenePack(p.scene_pack_id)
    lastResult.value = res.data?.data ?? null
    if (!lastResult.value) {
      ElMessage.error('应用响应异常 (无 data)')
      return
    }
    resultVisible.value = true
    if (lastResult.value.ready) {
      ElMessage.success(`场景包 ${p.display_name} 就绪`)
    } else {
      ElMessage.warning(`存在 ${lastResult.value.missing_algos.length} 个算法缺口, 详见报告`)
    }
  } catch (e: unknown) {
    ElMessage.error(`应用失败: ${(e as Error)?.message ?? e}`)
  } finally {
    applying.value = ''
  }
}

onMounted(() => {
  fetchPacks()
  fetchTemplates()
})
</script>

<style scoped>
.le-packs-page { padding: 4px 0; }
.pack-card { margin-bottom: 16px; cursor: pointer; }
.pack-head { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
.pack-icon { width: 44px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.sc-stadium { background: #409eff; }
.sc-openair { background: #e6a23c; }
.sc-expo { background: #67c23a; }
.sc-marathon { background: #f56c6c; }
.sc-generic { background: #909399; }
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
.le-count { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
