<template>
  <div class="le-packs-page">
    <!-- ===== 页头 ===== -->
    <div class="packs-header">
      <div>
        <h2 class="packs-title">场景包</h2>
        <div class="packs-sub">按活动类型一键校验算法可用性, 输出三圈布防与联动预案部署清单; 支持导出/分块导入跨设备迁移 (shield-scene-pack-v1)</div>
      </div>
      <div class="header-actions">
        <el-button :icon="Upload" @click="openImport">导入场景包</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
      </div>
    </div>

    <!-- ===== 错误态 (API 失败时给可见反馈, 不再呈现空白) ===== -->
    <el-result v-if="loadError" icon="warning" title="场景包加载失败" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="reload">重试</el-button>
        <div class="err-hint">若设备刚完成升级, 请尝试 Ctrl+F5 / Cmd+Shift+R 强制刷新页面缓存</div>
      </template>
    </el-result>

    <!-- ===== 骨架屏 (首次加载, 消除等待期空白) ===== -->
    <el-row v-else-if="loading && packs.length === 0" :gutter="16">
      <el-col :span="8" v-for="i in 3" :key="i">
        <el-card class="pack-card">
          <el-skeleton :rows="5" animated />
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 空态 ===== -->
    <el-empty v-else-if="packs.length === 0"
              description="无可用场景包 (后端 ScenePackDefs 未返回数据)">
      <el-button @click="reload">重新加载</el-button>
    </el-empty>

    <!-- ===== 场景包卡片 (字段全部防御式访问, 单卡数据缺失不阻断渲染) ===== -->
    <el-row v-else :gutter="16">
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
            <el-button size="small" :icon="Download" :loading="exporting === p.scene_pack_id"
                       @click.stop="exportPack(p)">
              导出
            </el-button>
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

    <!-- ===== 应用结果 (缺口报告) ===== -->
    <el-dialog v-model="resultVisible" :title="`应用结果 — ${lastResult?.scene_pack_id ?? ''}`" width="620px">
      <template v-if="lastResult">
        <el-result :icon="lastResult.ready ? 'success' : 'warning'"
                   :title="lastResult.ready ? '场景包就绪' : '存在算法缺口 (v1 仅校验, 不阻塞)'">
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

        <!-- apply v2 (2026-08-28): 布防结果 (deploy=true 时) -->
        <template v-if="lastResult.deployed">
          <el-divider />
          <div class="deploy-summary">
            <el-tag type="success">新建规则 {{ lastResult.rules_created ?? 0 }}</el-tag>
            <el-tag type="info">跳过已有 {{ lastResult.rules_skipped ?? 0 }}</el-tag>
            <el-tag v-if="(lastResult.rules_failed?.length ?? 0) > 0" type="danger">
              失败 {{ lastResult.rules_failed?.length }}
            </el-tag>
            <el-button size="small" link type="primary" @click="goRules">去事件规则页查看</el-button>
          </div>
          <el-table v-if="(lastResult.instantiate_detail ?? []).length > 0"
                    :data="lastResult.instantiate_detail" size="small" max-height="200">
            <el-table-column prop="template_id" label="LE 模板" min-width="170" />
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

    <!-- ===== [M3-1] 导入场景包 (分块协议 + 断点续传 + 幂等) ===== -->
    <el-dialog v-model="importVisible" title="导入场景包" width="580px"
               :close-on-click-modal="!importRunning" :close-on-press-escape="!importRunning">
      <!-- 导入完成: 校验 + 实例化结果 -->
      <template v-if="importResult">
        <el-result icon="success" :title="`导入成功 — ${importResult.scene_pack_id}`"
                   :sub-title="importResult.note">
          <template #sub-title>
            <span>{{ importResult.note }}</span>
            <div class="catalog-line">
              导出端 catalog {{ importResult.catalog_compat?.export_catalog_version }} · 本机 {{ importResult.catalog_compat?.local_catalog_version }} (兼容)
            </div>
          </template>
        </el-result>
        <div class="deploy-summary">
          <el-tag type="success">新建规则 {{ importResult.rules_created ?? 0 }}</el-tag>
          <el-tag type="info">跳过已有 {{ importResult.rules_skipped ?? 0 }}</el-tag>
          <el-tag v-if="(importResult.rules_legacy_purged ?? 0) > 0" type="warning">
            清理旧代 {{ importResult.rules_legacy_purged }}
          </el-tag>
          <el-tag v-if="(importResult.rules_failed?.length ?? 0) > 0" type="danger">
            失败 {{ importResult.rules_failed?.length }}
          </el-tag>
          <el-button size="small" link type="primary" @click="goRulesFromImport">去事件规则页查看</el-button>
        </div>
        <el-alert v-if="(importResult.capabilities?.missing_algos?.length ?? 0) > 0"
                  type="warning" :closable="false" class="import-alert"
                  :title="`算法缺口 (报告不阻断): ${importResult.capabilities.missing_algos.join(', ')}`" />
        <el-table v-if="(importResult.instantiate_detail ?? []).length > 0"
                  :data="importResult.instantiate_detail" size="small" max-height="220">
          <el-table-column prop="template_id" label="LE 模板" min-width="170" />
          <el-table-column label="状态" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'created' ? 'success'
                        : row.status === 'skipped_exists' ? 'info' : 'danger'" size="small">
                {{ statusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 选择文件 / 上传中 / 失败重试 -->
      <template v-else>
        <el-form label-width="90px">
          <el-form-item label="场景包文件">
            <input ref="importFileInput" type="file" accept=".json"
                   :disabled="importRunning" @change="onImportFileChange" />
          </el-form-item>
        </el-form>
        <div v-if="importFile" class="import-file-info">
          {{ importFile.name }} · {{ formatBytes(importFile.size) }} ·
          分块 {{ Math.max(1, Math.ceil(importFile.size / IMPORT_CHUNK_SIZE)) }} × {{ formatBytes(IMPORT_CHUNK_SIZE) }}
        </div>
        <el-checkbox v-model="importDeploy" :disabled="importRunning" class="import-deploy-check">
          导入后立即布防 (实例化 LE 联动规则, 幂等, 已存在跳过)
        </el-checkbox>
        <el-progress v-if="importStarted" :percentage="importProgress" class="import-progress" />
        <div v-if="importStatusText" class="import-status">{{ importStatusText }}</div>
        <el-alert v-if="importError" type="error" :closable="false" class="import-alert"
                  :title="importError" />
      </template>

      <template #footer>
        <el-button v-if="!importResult" :disabled="importRunning" @click="importVisible = false">关闭</el-button>
        <el-button v-if="importResult" type="primary" @click="finishImport">完成</el-button>
        <el-button v-if="!importResult" type="primary" :loading="importRunning"
                   :disabled="!importFile" @click="doImport">
          {{ importError ? '重试 (断点续传)' : '开始导入' }}
        </el-button>
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
 * 五场景包卡片 (体育赛事/演唱会/音乐节露天/展会/马拉松, 对齐 ScenePackDefs.h) + el-drawer 详情
 * (algo_set / zones 三圈 / 阈值档位 / linkage_templates 与 LinkageEngine LE-* 名称匹配)
 * + 应用: 双模式 (仅校验 = v1 可用性校验+缺口报告; 校验并布防 = apply v2
 *   deploy=true 实例化 LE 模板为联动规则, 幂等, 详情见「事件规则」页)。
 * [FIX 2026-08-28] 三态完善: 骨架屏/错误态(el-result+重试)/空态(el-empty),
 * 此前加载慢或失败时页面呈现空白; 卡片字段全部防御式访问。
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheckFilled, Link, Trophy, Mic, OfficeBuilding, Flag, Box, Refresh, Upload, Download,
} from '@element-plus/icons-vue'
import { largeEventApi } from '@/api/largeEvent'
import { linkageApi, unwrapRuleTemplates } from '@/api/linkage'
import type { RuleTemplate } from '@/api/linkage'
import type { ScenePack, ScenePackApplyResult, ScenePackImportResult } from '@/types/largeEvent'
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

const leTemplateCount = ref(0)

// ── [M3-1 2026-09-21] 导出/导入 (分块协议 + 断点续传 + client_request_id 幂等) ──
const exporting = ref('')
const importVisible = ref(false)
const importFileInput = ref<HTMLInputElement | null>(null)
const importFile = ref<File | null>(null)
const importDeploy = ref(true)
const importRunning = ref(false)
const importStarted = ref(false)
const importProgress = ref(0)
const importStatusText = ref('')
const importError = ref('')
const importResult = ref<ScenePackImportResult | null>(null)
const importReqId = ref('')
const importReceived = ref<Set<number>>(new Set())

/** 分块大小: 8MB (与后端 M3-1 协议约定; CosmoEdge chunk 口径) */
const IMPORT_CHUNK_SIZE = 8 * 1024 * 1024

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function downloadJson(doc: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

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
  loadError.value = ''
  try {
    const res = await largeEventApi.listScenePacks()
    const body = res?.data
    // 结构防御: 常规 {code,data:{scene_packs}}, 兼容 data 直为数组 / 顶层直为数组两种形态
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
    leTemplateCount.value = list.filter(t => t.template_id.startsWith('LE-')).length
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
        ? `将按场景包「${p.display_name}」校验算法可用性, 并把 ${p.linkage_templates?.length ?? 0} 个 LE 联动模板实例化为规则 (幂等, 已存在跳过; 可在「事件规则」页查看)。继续?`
        : `将按场景包「${p.display_name}」校验算法可用性并输出部署清单 (不写配置)。继续?`,
      deploy ? '校验并布防' : '仅校验',
      { confirmButtonText: deploy ? '布防' : '校验', cancelButtonText: '取消', type: 'info' }
    )
  } catch {
    return
  }
  applying.value = p.scene_pack_id
  try {
    const res = await largeEventApi.applyScenePack(
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
  router.push('/large-event/rules')
}

// ── [M3-1 2026-09-21] 导出: 完整定义 + 部署实例快照 → 浏览器下载 JSON ──
async function exportPack(p: ScenePack) {
  exporting.value = p.scene_pack_id
  try {
    const res = await largeEventApi.exportScenePack(p.scene_pack_id)
    const doc = res.data?.data
    if (!doc) {
      ElMessage.error('导出响应异常 (无 data)')
      return
    }
    downloadJson(doc, doc.suggested_filename || `${p.scene_pack_id}.shield-scene-pack.json`)
    ElMessage.success(
      `已导出 ${p.display_name} (含 ${doc.deployed_state?.length ?? 0} 条部署实例快照)`)
  } catch (e: unknown) {
    ElMessage.error(`导出失败: ${(e as Error)?.message ?? e}`)
  } finally {
    exporting.value = ''
  }
}

// ── [M3-1 2026-09-21] 分块导入: init (幂等/续传) → 跳过已收分片 → complete (布防) ──
function openImport() {
  importVisible.value = true
  resetImport()
}

function resetImport() {
  importFile.value = null
  importRunning.value = false
  importStarted.value = false
  importProgress.value = 0
  importStatusText.value = ''
  importError.value = ''
  importResult.value = null
  importReqId.value = ''
  importReceived.value = new Set()
  if (importFileInput.value) importFileInput.value.value = ''
}

function onImportFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  importFile.value = input.files?.[0] ?? null
  // 新文件 = 放弃旧幂等键 (旧 client_request_id 会命中旧会话文件规格冲突)
  importReqId.value = ''
  importReceived.value = new Set()
  importError.value = ''
  importStarted.value = false
  importProgress.value = 0
  importStatusText.value = ''
}

async function doImport() {
  const file = importFile.value
  if (!file) return
  if (file.size === 0) {
    importError.value = '文件为空, 无法导入'
    return
  }
  importRunning.value = true
  importError.value = ''
  importResult.value = null
  importStarted.value = true
  const totalChunks = Math.max(1, Math.ceil(file.size / IMPORT_CHUNK_SIZE))
  try {
    // client_request_id 重试时复用 → 后端命中会话返回已收分片 (断点续传起点)
    if (!importReqId.value) {
      importReqId.value = `spi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
    // capabilities 预检: JSON ≤ 16MB 时可解析 algo_set 随 init 上报 (解析失败跳过, complete 兜底)
    let requiredAlgos: string[] | undefined
    if (file.size <= 16 * 1024 * 1024) {
      try {
        const doc = JSON.parse(await file.text())
        const algos = doc?.scene_pack?.algo_set
        if (Array.isArray(algos)) requiredAlgos = algos.filter((a: unknown) => typeof a === 'string')
      } catch { /* 非 JSON → 跳过预检 */ }
    }
    const initRes = await largeEventApi.scenePackImportInit({
      filename: file.name,
      filesize: file.size,
      total_chunks: totalChunks,
      chunk_size: IMPORT_CHUNK_SIZE,
      client_request_id: importReqId.value,
      capabilities: requiredAlgos ? { required_algos: requiredAlgos } : undefined,
    })
    const session = initRes.data?.data
    if (!session?.upload_id) throw new Error('init 响应异常 (无 upload_id)')
    importReceived.value = new Set(session.received_chunks ?? [])
    if (session.resumed) {
      ElMessage.info(`断点续传: 已收 ${importReceived.value.size}/${totalChunks} 分片, 继续上传剩余`)
    }
    if (session.capabilities?.checked && (session.capabilities.missing_algos?.length ?? 0) > 0) {
      ElMessage.warning(`预检: 缺失算法 ${session.capabilities.missing_algos.join(', ')} (报告不阻断)`)
    }
    // 逐分片上传 (跳过已收 = 断点续传; 单分片覆盖写 = 重传幂等)
    const updateProgress = () => {
      const done = importReceived.value.size
      importProgress.value = Math.round((done / totalChunks) * 100)
      importStatusText.value =
        `已上传 ${done}/${totalChunks} 分片 (${formatBytes(Math.min(done * IMPORT_CHUNK_SIZE, file.size))} / ${formatBytes(file.size)})`
    }
    updateProgress()
    for (let i = 0; i < totalChunks; i++) {
      if (importReceived.value.has(i)) continue
      const blob = file.slice(i * IMPORT_CHUNK_SIZE, Math.min((i + 1) * IMPORT_CHUNK_SIZE, file.size))
      const chunkRes = await largeEventApi.scenePackImportChunk(session.upload_id, i, blob)
      const chunks = chunkRes.data?.data?.received_chunks
      if (Array.isArray(chunks)) importReceived.value = new Set(chunks)
      updateProgress()
    }
    // 合并 + 校验 (format/catalog_version) + 实例化 (复用 apply deploy 语义)
    importStatusText.value = '校验并布防中...'
    const compRes = await largeEventApi.scenePackImportComplete(session.upload_id, {
      deploy: importDeploy.value,
    })
    const result = compRes.data?.data
    if (!result) throw new Error('complete 响应异常 (无 data)')
    importResult.value = result
    importProgress.value = 100
    ElMessage.success(
      importDeploy.value
        ? `导入成功: 新建 ${result.rules_created} 条规则, 跳过 ${result.rules_skipped} 条`
        : `校验通过 (未布防): ${result.scene_pack_id}`)
  } catch (e: unknown) {
    importError.value = (e as Error)?.message ?? String(e)
    ElMessage.error(`导入失败: ${importError.value}`)
  } finally {
    importRunning.value = false
  }
}

function finishImport() {
  importVisible.value = false
  resetImport()
}

function goRulesFromImport() {
  importVisible.value = false
  resetImport()
  router.push('/large-event/rules')
}

onMounted(() => {
  reload()
})
</script>

<style scoped>
.le-packs-page { padding: 4px 0; }
.packs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.header-actions { display: flex; gap: 8px; }
.import-file-info { font-size: 12px; color: var(--el-text-color-secondary); margin: 4px 0 10px 90px; }
.import-deploy-check { margin-left: 90px; }
.import-progress { margin-top: 12px; }
.import-status { margin-top: 6px; font-size: 12px; color: var(--el-text-color-secondary); }
.import-alert { margin-top: 10px; }
.catalog-line { margin-top: 6px; font-size: 12px; color: var(--el-text-color-secondary); }
.packs-title { margin: 0; font-size: 18px; font-weight: 600; }
.packs-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.err-hint { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
.deploy-summary { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
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
