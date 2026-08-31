<template>
  <div class="gs-packs-page">
    <!-- ===== 页头 ===== -->
    <div class="packs-header">
      <div>
        <h2 class="packs-title">加油站场景包</h2>
        <div class="packs-sub">按加油站形态一键校验算法可用性, 输出三圈布防与联动预案部署清单 (对标极视角油站算法目录 + 海康/大华防爆适配)</div>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
    </div>

    <!-- ===== T6 硬红线提示卡 ===== -->
    <el-alert type="warning" :closable="false" show-icon class="t6-banner">
      <template #title>
        <strong>T6 硬红线 (不可绕过联锁)</strong> · 加油站打电话/吸烟 → 仅声光+TTS, <u>不联动工艺联锁</u>。
        视觉不可替代气体探测器/紧急切断阀/防雷防静电/操作规程; AI 联动停泵/开阀必经安全 PLC。
      </template>
    </el-alert>

    <!-- ===== 错误态 ===== -->
    <el-result v-if="loadError" icon="warning" title="场景包加载失败" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">重试</el-button>
        <div class="err-hint">若设备刚完成升级, 请尝试 Ctrl+F5 / Cmd+Shift+R 强制刷新页面缓存</div>
      </template>
    </el-result>

    <!-- ===== 骨架屏 ===== -->
    <el-row v-else-if="loading && gasPacks.length === 0" :gutter="16">
      <el-col :span="8" v-for="i in 3" :key="i">
        <el-card class="pack-card">
          <el-skeleton :rows="5" animated />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 空态 ===== -->
    <el-empty v-else-if="gasPacks.length === 0"
              description="无可用加油站场景包 (后端 ScenePackDefs gas_station tag 未返回数据)">
      <el-button @click="reload">重新加载</el-button>
    </el-empty>

    <!-- ===== 场景包卡片 ===== -->
    <el-row v-else :gutter="16">
      <el-col :span="8" v-for="p in gasPacks" :key="p.scene_pack_id">
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
                       @click.stop="confirmValidate(p)">
              仅校验
            </el-button>
            <el-button size="small" type="primary" :loading="applying === p.scene_pack_id"
                       @click.stop="openDeployDialog(p)">
              校验并布防
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 应用结果 ===== -->
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
            <el-table-column prop="template_id" label="GS 模板" min-width="170" />
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

    <!-- ===== [加油站三期] 布防通道勾选对话框 (§6.1 映射精度: 真实通道绑定) ===== -->
    <el-dialog v-model="deployDialog.visible"
               :title="`校验并布防 — ${deployDialog.pack?.display_name ?? ''}`" width="560px">
      <p class="deploy-hint">
        将实例化 {{ deployDialog.pack?.linkage_templates?.length ?? 0 }} 个 GS 联动模板为规则
        (幂等, 已存在跳过; T6 模板仅声光+TTS, 不联动工艺联锁)。
      </p>
      <div class="deploy-channels">
        <div class="deploy-channels-head">
          <span>绑定通道 (规则事件源 channel_ids)</span>
          <el-button size="small" link type="primary" :loading="deployDialog.loading"
                     @click="loadChannels">刷新</el-button>
        </div>
        <el-checkbox-group v-model="deployDialog.selected" :disabled="deployDialog.loading">
          <div v-for="c in deployDialog.channels" :key="c.id" class="deploy-channel-item">
            <el-checkbox :value="c.id">{{ c.label }}</el-checkbox>
          </div>
        </el-checkbox-group>
        <div v-if="!deployDialog.loading && deployDialog.channels.length === 0" class="deploy-hint">
          未获取到通道列表 — 布防将绑定全部通道
        </div>
        <div class="deploy-hint deploy-hint-sub">
          不勾选任何通道 = 绑定全部通道 (与后端 channel_ids 空数组语义一致)
        </div>
        <!-- [加油站三期 P1-6] 按 zones 圈层建议分组提示 (与详情抽屉「三圈布防 zones」同源) -->
        <div v-if="deployDialog.pack?.zones && Object.keys(deployDialog.pack.zones).length"
             class="deploy-circle-hints">
          <div v-for="(names, circle) in deployDialog.pack.zones" :key="circle" class="deploy-circle-hint">
            <span class="deploy-circle-label">{{ circleLabel(String(circle)) }}</span>
            <span>{{ (names as string[]).slice(0, 3).join(' / ') }}{{ (names as string[]).length > 3 ? ' 等' : '' }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="deployDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="applying === deployDialog.pack?.scene_pack_id"
                   @click="doDeploy">布防</el-button>
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
            <!-- [加油站 T6 红线] 显式标注 T6 类模板仅声光+TTS -->
            <el-tag v-if="isT6Template(tid)" type="warning" size="small">T6</el-tag>
          </div>
        </div>
        <div v-if="gsTemplateCount > 0" class="sc-count">
          LinkageEngine 加油站模板库共 <strong>{{ gsTemplateCount }}</strong> 个 GS-* 模板 (category=加油站)
        </div>

        <h4 class="sec-title">工程红线</h4>
        <div class="redlines">
          <div class="rl-item"><strong>T6 红线:</strong> 打电话/吸烟仅声光+TTS, 不联动工艺联锁</div>
          <div class="rl-item"><strong>视觉不可替代:</strong> 气体探测器/紧急切断阀/防雷防静电/操作规程</div>
          <div class="rl-item"><strong>安全 PLC 隔离:</strong> OPC UA 必经安全 PLC, RELAY 仅辅助设备</div>
          <div class="rl-item"><strong>EHS 闭环:</strong> 视频 + 可燃气体 + 液位 + 温度 + 门禁 + 工单</div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 加油站场景包 — [加油站方案 2026-08-30]
 *
 * 三个加油站场景包卡片 (中石化/中石油标准日常/卸油作业专项/EHS 闭环, 对齐 ScenePackDefs.h
 * gas_station tag) + el-drawer 详情 (algo_set / 三圈 zones / 阈值档位 / GS-* 模板) +
 * 应用: 双模式 (仅校验 = 缺口报告; 校验并布防 = 布防通道勾选对话框 → 实例化 GS 模板为
 *   联动规则 + 绑定勾选通道 channel_ids, 幂等, 机器 tag 为 scene_pack/gas_station;
 *   不勾选 = 全部通道, 与后端 channel_ids 空数组语义一致)。
 * 数据源复用 /large-event/scene-packs SSOT 端点 (后端全量返回, 本页按 tag 过滤)。
 *
 * 工程红线展示:
 *   T6 卡片顶部告警条 (T6 硬红线提示)
 *   抽屉内 GS 模板列表对 T6 类 (GS-fueling-phone/smoking) 显式 T6 标签
 *   抽屉内工程红线 4 条提示
 * 三态完整 (骨架屏/错误态/空态), 范式对齐 school/SchoolScenePacks.vue。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheckFilled, Link, Box, MagicStick, TakeawayBox, Refresh,
} from '@element-plus/icons-vue'
import { gasStationApi } from '@/api/gasStation'
import { channelApi } from '@/api/channel'
import type { ChannelItem } from '@/types/device'
import { linkageApi, unwrapRuleTemplates } from '@/api/linkage'
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

const gsTemplateCount = ref(0)

/** 只呈现加油站场景包 (gas_station tag) */
const gasPacks = computed(() =>
  packs.value.filter(p => p.scene_tag === 'gas_station'))

/** T6 红线模板: GS-fueling-phone / GS-fueling-smoking 仅声光+TTS */
const T6_TEMPLATES = new Set(['GS-fueling-phone', 'GS-fueling-smoking'])
function isT6Template(tid: string): boolean {
  return T6_TEMPLATES.has(tid)
}

function packIcon(packId: string): Component {
  if (packId.includes('unloading')) return TakeawayBox
  if (packId.includes('ehs')) return MagicStick
  return Box
}

function packClass(packId: string) {
  if (packId.includes('unloading')) return 'pk-unloading'
  if (packId.includes('ehs')) return 'pk-ehs'
  return 'pk-primary'
}

function circleLabel(circle: string) {
  if (circle.includes('core')) return '核心圈 (卸油区/油罐/加油机)'
  if (circle.includes('alert')) return '警戒圈 (加油区/便利店)'
  // [加油站三期 2026-08-31] 「管控圈」→「控制圈」: 与设计文档 §5 三圈术语及 Gas3D 图例统一
  if (circle.includes('control')) return '控制圈 (围墙/外围道路)'
  return circle
}

function templateName(templateId: string) {
  return templates.value.find(t => t.template_id === templateId)?.name ?? ''
}

async function fetchPacks() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await gasStationApi.listScenePacks()
    const body = res?.data
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
    const list = unwrapRuleTemplates(res.data?.data)
    templates.value = list
    gsTemplateCount.value = list.filter(t => t.template_id.startsWith('GS-')).length
  } catch {
    templates.value = []
  }
}

function openDetail(p: ScenePack) {
  activePack.value = p
  drawerVisible.value = true
}

// [加油站三期 2026-08-30 §6.1 映射精度] 布防通道勾选:
//   apply v2 channel_ids (int32 数组, 空=全部通道, LinkageRuleView 同源分类) →
//   规则 source_cond 绑定真实设备通道; 对话框替代原 ElMessageBox 确认
const deployDialog = reactive({
  visible: false,
  pack: null as ScenePack | null,
  channels: [] as { id: number; label: string }[],
  selected: [] as number[],
  loading: false,
})

async function loadChannels() {
  deployDialog.loading = true
  try {
    const res = await channelApi.getList({ page: 1, pageSize: 200 })
    const data = res.data?.data as unknown as { items?: ChannelItem[]; list?: ChannelItem[] } | undefined
    const rawList: ChannelItem[] = data?.items ?? data?.list ?? []
    deployDialog.channels = rawList
      .map((c) => {
        // 小整数 ID → int32 channel_ids (联动规则事件源语义)
        const numId = Number(c.channelNo) || Number(c.id) || 0
        return { id: numId, label: `${c.name || `通道${numId}`} (#${numId})` }
      })
      .filter(c => c.id > 0)
  } catch {
    deployDialog.channels = []
  } finally {
    deployDialog.loading = false
  }
}

function openDeployDialog(p: ScenePack) {
  deployDialog.pack = p
  deployDialog.selected = []
  deployDialog.visible = true
  if (deployDialog.channels.length === 0) void loadChannels()
}

async function doDeploy() {
  const p = deployDialog.pack
  if (!p) return
  applying.value = p.scene_pack_id
  try {
    // 勾选 → int32 channel_ids; 空 = 全部通道 (undefined 不序列化字段)
    const channelIds = deployDialog.selected.length ? deployDialog.selected : undefined
    const res = await gasStationApi.applyScenePack(p.scene_pack_id, { deploy: true, channel_ids: channelIds })
    lastResult.value = res.data?.data ?? null
    if (!lastResult.value) {
      ElMessage.error('应用响应异常 (无 data)')
      return
    }
    deployDialog.visible = false
    resultVisible.value = true
    ElMessage.success(
      `布防完成: 新建 ${lastResult.value.rules_created ?? 0} 条规则, 跳过已有 ${lastResult.value.rules_skipped ?? 0} 条`)
  } catch (e: unknown) {
    ElMessage.error(`布防失败: ${(e as Error)?.message ?? e}`)
  } finally {
    applying.value = ''
  }
}

/** 仅校验: 不写配置, 输出算法缺口报告 */
async function confirmValidate(p: ScenePack) {
  try {
    await ElMessageBox.confirm(
      `将按场景包「${p.display_name}」校验算法可用性并输出部署清单 (不写配置)。继续?`,
      '仅校验',
      { confirmButtonText: '校验', cancelButtonText: '取消', type: 'info' }
    )
  } catch {
    return
  }
  applying.value = p.scene_pack_id
  try {
    const res = await gasStationApi.applyScenePack(p.scene_pack_id)
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
  router.push({ path: '/linkage', query: { tag: 'scene_pack' } })
}

onMounted(() => {
  reload()
})
</script>

<style scoped>
.gs-packs-page { padding: 4px 0; }
.packs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.packs-title { margin: 0; font-size: 18px; font-weight: 600; }
.packs-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.err-hint { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
.t6-banner { margin-bottom: 16px; }
.deploy-summary { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.go-rules-row { margin-top: 10px; display: flex; justify-content: flex-end; }
.deploy-hint { font-size: 12px; color: var(--el-text-color-secondary); margin: 0 0 10px; }
.deploy-channels { margin: 4px 0 2px; }
.deploy-channels-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 500; margin-bottom: 8px; }
.deploy-channel-item { margin-bottom: 6px; }
.deploy-hint-sub { margin: 8px 0 0; }
.deploy-circle-hints { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--el-border-color-lighter); display: flex; flex-direction: column; gap: 4px; }
.deploy-circle-hint { font-size: 12px; color: var(--el-text-color-regular); line-height: 1.5; }
.deploy-circle-label { font-weight: 600; margin-right: 6px; color: var(--el-text-color-secondary); }
.pack-card { margin-bottom: 16px; cursor: pointer; }
.pack-head { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
.pack-icon { width: 44px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.pk-primary { background: #f56c6c; }   /* 红 = 高危场所 */
.pk-unloading { background: #e6a23c; } /* 黄 = 卸油核心 */
.pk-ehs { background: #67c23a; }      /* 绿 = EHS 闭环 */
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
.redlines { display: flex; flex-direction: column; gap: 6px; }
.rl-item { font-size: 12px; color: var(--el-text-color-regular); line-height: 1.6; padding: 6px 10px; background: #fdf6ec; border-radius: 4px; }
</style>