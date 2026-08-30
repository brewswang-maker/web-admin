<template>
  <div class="retrieval-view">
    <div class="page-header">
      <h2>智能检索</h2>
      <span class="sub">混合检索 (P4-E) / 以文搜图 / 以图搜图 [P0-B 2026-08-30]</span>
    </div>

    <el-tabs v-model="activeTab" class="retrieval-tabs">
      <!-- ════ Tab 1: P4-E 混合检索 ════ -->
      <el-tab-pane label="混合检索" name="hybrid">
        <el-form label-width="110px" class="query-form">
          <el-form-item label="检索模式">
            <el-radio-group v-model="hybridForm.mode">
              <el-radio-button value="hybrid">hybrid 三信号</el-radio-button>
              <el-radio-button value="face">face 人脸特征</el-radio-button>
              <el-radio-button value="attr">attr 结构化</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item v-if="hybridForm.mode !== 'attr'" label="人脸向量">
            <el-input
              v-model="hybridForm.embeddingText"
              type="textarea"
              :rows="3"
              placeholder="512 维向量, 逗号/空格分隔 (face/hybrid 模式必填)"
            />
          </el-form-item>

          <el-form-item v-if="hybridForm.mode !== 'face'" label="attr 条件">
            <div v-for="(c, i) in hybridForm.conditions" :key="i" class="cond-row">
              <el-select v-model="c.key" filterable placeholder="属性 key (白名单)" class="cond-key">
                <el-option v-for="o in attributeKeyOptions()" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-select v-model="c.op" class="cond-op">
                <el-option v-for="op in opsForKey(c.key)" :key="op" :label="op" :value="op" />
              </el-select>
              <el-input-number v-model="c.value" :precision="3" :step="0.1" class="cond-value" />
              <el-button text type="danger" @click="hybridForm.conditions.splice(i, 1)">删除</el-button>
            </div>
            <el-button size="small" @click="addCondition">+ 添加条件</el-button>
            <div class="hint">key 白名单与算子契约来自 docs/attribute-key-contract.md (P4-B/P4-D)</div>
          </el-form-item>

          <el-form-item label="通道">
            <el-input v-model="hybridForm.channel_id" placeholder="留空 = 全部通道" style="width: 240px" />
          </el-form-item>
          <el-form-item label="时间范围">
            <el-date-picker
              v-model="hybridForm.timeRange"
              type="datetimerange"
              value-format="x"
              start-placeholder="开始"
              end-placeholder="结束"
            />
          </el-form-item>
          <el-form-item v-if="hybridForm.mode === 'hybrid'" label="关联窗口(ms)">
            <el-input-number v-model="hybridForm.window_ms" :min="1000" :step="10000" />
          </el-form-item>
          <el-form-item label="Top-K / Limit">
            <el-input-number v-model="hybridForm.top_k" :min="1" :max="50" />
            <el-input-number v-model="hybridForm.limit" :min="1" :max="200" class="ml" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="runHybrid">检索</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ════ Tab 2: 以文搜图 ════ -->
      <el-tab-pane label="以文搜图" name="nl">
        <el-form label-width="110px" class="query-form">
          <el-form-item label="自然语言">
            <el-input v-model="nlForm.nl" placeholder="例: 昨天的火情 / 穿红色衣服的人在跑" @keyup.enter="runNL" />
          </el-form-item>
          <el-form-item label="Top-K">
            <el-input-number v-model="nlForm.top_k" :min="1" :max="100" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="runNL">搜索</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ════ Tab 3: 以图搜图 [P0-A] ════ -->
      <el-tab-pane label="以图搜图" name="image">
        <el-form label-width="110px" class="query-form">
          <el-form-item label="查询快照">
            <el-upload
              :auto-upload="false"
              :show-file-list="false"
              accept="image/jpeg,image/png"
              :on-change="onFilePicked"
            >
              <el-button>选择图片</el-button>
            </el-upload>
            <el-image
              v-if="imageForm.previewUrl"
              :src="imageForm.previewUrl"
              fit="contain"
              class="preview"
            />
          </el-form-item>
          <el-form-item label="相似度阈值">
            <el-slider v-model="imageForm.min_similarity" :min="0" :max="1" :step="0.05" style="width: 280px" show-input />
          </el-form-item>
          <el-form-item label="通道">
            <el-input v-model="imageForm.channel_id" placeholder="留空 = 全部通道" style="width: 240px" />
          </el-form-item>
          <el-form-item label="时间范围">
            <el-date-picker
              v-model="imageForm.timeRange"
              type="datetimerange"
              value-format="x"
              start-placeholder="开始"
              end-placeholder="结束"
            />
          </el-form-item>
          <el-form-item label="Top-K">
            <el-input-number v-model="imageForm.top_k" :min="1" :max="100" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" :disabled="!imageForm.base64" @click="runByImage">以图搜图</el-button>
          </el-form-item>
        </el-form>

        <!-- [P0-A] 501: 图像塔未就绪 → 显式激活指引 (不伪装空结果) -->
        <el-alert
          v-if="towerUnavailable"
          type="warning"
          :closable="false"
          class="tower-alert"
        >
          <template #title>图像塔未就绪 ({{ towerUnavailable.reason }}) — 以图搜图暂不可用</template>
          <div>{{ towerUnavailable.hint }}</div>
          <div class="hint">期望模型文件: {{ towerUnavailable.bmodel_expected }}</div>
          <div class="hint">配置项: 环境变量 SHIELD_SOPHON_BMODEL_BASE (TPU-MLIR 转换产物, 见 P1-A 批次)</div>
        </el-alert>
      </el-tab-pane>
    </el-tabs>

    <!-- ════ 结果栅格 (共用) ════ -->
    <template v-if="items.length">
      <el-divider content-position="left">
        检索结果 {{ items.length }} 条 ({{ resultModeText }})
      </el-divider>
      <el-row :gutter="12">
        <el-col v-for="(it, idx) in items" :key="idx" :xs="12" :sm="8" :md="6" :lg="4">
          <el-card shadow="hover" class="result-card" @click="openDetail(it)">
            <el-image
              v-if="thumbOf(it)"
              :src="thumbOf(it)"
              fit="cover"
              class="thumb"
            >
              <template #error><div class="thumb-fallback">无快照</div></template>
            </el-image>
            <div v-else class="thumb thumb-fallback">无快照</div>
            <div class="meta">
              <div class="sim">
                <span>相似度</span>
                <el-progress
                  :percentage="Math.round(((it.similarity ?? it.score ?? it.face_similarity ?? 0) as number) * 100)"
                  :stroke-width="8"
                />
              </div>
              <div class="line">通道: {{ it.channel_id_str || it.channel_id || '—' }}</div>
              <div class="line">时间: {{ formatTs(it.timestamp) }}</div>
              <div class="line id">{{ it.image_id || it.alarm_id || it.person_id || '—' }}</div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </template>
    <el-empty v-else-if="searched && !loading && !towerUnavailable" description="无匹配结果" />

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="结果详情" width="560">
      <pre class="detail-json">{{ detailJson }}</pre>
      <template #footer>
        <el-button @click="gotoAlarm">在告警中心打开</el-button>
        <el-button type="primary" @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * RetrievalView.vue — 智能检索前端 [P0-B 2026-08-30]
 *
 * 三 Tab (计划 P0-B): 混合检索 (P4-E) / 以文搜图 (P3-3) / 以图搜图 (P0-A)。
 * attr 条件编辑复用 P4-B 白名单契约 (api/attributeKeys) + P4-D key 类型分控件
 * 思路 (kind → 算子收敛); 结果栅格点击联动告警详情; 后端 501 时 UI 显式展示
 * CLIP 图像塔激活指引 (诚实降级口径)。
 */
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import {
  retrievalApi,
  attributeKeyOptions,
  validateConditions,
  extractTowerUnavailable,
  type AttrCondition,
  type RetrievalMode,
  type RetrievalItem,
  type ImageSearchItem,
  type ImageTowerUnavailable,
} from '@/api/retrieval'
import { allowedOps, getAttributeKeyDef, valueControlKind } from '@/api/attributeKeys'
import { ApiError } from '@/api/http'

const router = useRouter()
const activeTab = ref<'hybrid' | 'nl' | 'image'>('hybrid')
const loading = ref(false)
const searched = ref(false)

// ── Tab 1 混合检索 ──────────────────────────────────────────────
const hybridForm = reactive({
  mode: 'hybrid' as RetrievalMode,
  embeddingText: '',
  conditions: [] as AttrCondition[],
  channel_id: '',
  timeRange: null as [string, string] | null,
  window_ms: 60000,
  top_k: 10,
  limit: 50,
})

function addCondition() {
  hybridForm.conditions.push({ key: '', op: '>=', value: 0.5 })
}

function opsForKey(key: string): string[] {
  return allowedOps(getAttributeKeyDef(key)?.kind ?? 'score')
}

function parseEmbedding(text: string): number[] | null {
  const tokens = text.trim().split(/[\s,]+/).filter(Boolean)
  if (!tokens.length) return null
  const vals = tokens.map(Number)
  if (vals.some((v) => Number.isNaN(v))) return null
  return vals
}

// ── Tab 2 以文搜图 ──────────────────────────────────────────────
const nlForm = reactive({ nl: '', top_k: 10 })

// [安检对标优化 2026-08-30] X 光判图"追溯"跳转预填 (from=screening-xray):
//   ScreeningXray 无快照时 router.push(/retrieval?nl=...&from=xray)
// [校园二期 2026-08-30] 放宽为带 nl 即预填 (校园事件"轨迹"按钮 from=campus-event)
const route = useRoute()
if (route.query.nl) {
  nlForm.nl = String(route.query.nl)
  activeTab.value = 'nl'
  ElMessage.info(route.query.from === 'xray'
    ? '已从 X 光判图跳转, 关键字已预填 (点击搜索或回车执行)'
    : '已从校园事件跳转, 轨迹检索关键字已预填 (点击搜索或回车执行)')
}

// ── Tab 3 以图搜图 ──────────────────────────────────────────────
const imageForm = reactive({
  base64: '',
  previewUrl: '',
  min_similarity: 0,
  channel_id: '',
  timeRange: null as [string, string] | null,
  top_k: 10,
})
const towerUnavailable = ref<ImageTowerUnavailable | null>(null)

function onFilePicked(file: UploadFile) {
  const raw = file.raw as File | undefined
  if (!raw) return
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = String(reader.result || '')
    imageForm.previewUrl = dataUrl
    // [P0-A] body 收纯 base64 (不含 data: 前缀)
    imageForm.base64 = dataUrl.split(',')[1] || ''
  }
  reader.readAsDataURL(raw)
}

// ── 结果集 ──────────────────────────────────────────────────────
type AnyItem = RetrievalItem & Partial<ImageSearchItem>
const items = ref<AnyItem[]>([])
const resultModeText = computed(() => {
  if (activeTab.value === 'hybrid') return hybridForm.mode
  if (activeTab.value === 'nl') return '以文搜图'
  return '以图搜图'
})

function thumbOf(it: AnyItem): string {
  const b64 = (it as { snapshot_base64?: string }).snapshot_base64
  if (b64) {
    if (b64.startsWith('data:')) return b64
    const padded = b64.replace(/[^A-Za-z0-9+/=]/g, '')
    return `data:image/jpeg;base64,${padded}`
  }
  return (it as { snapshot?: string }).snapshot || ''
}

function formatTs(ts?: number): string {
  if (!ts) return '—'
  const ms = ts > 1e12 ? ts : ts * 1000
  return new Date(ms).toLocaleString()
}

function handleError(err: unknown) {
  if (activeTab.value === 'image') {
    const t = extractTowerUnavailable(err)
    if (t) {
      towerUnavailable.value = t
      items.value = []
      return
    }
  }
  towerUnavailable.value = null
  const msg = err instanceof ApiError ? err.message : String(err)
  ElMessage.error(msg)
}

async function runHybrid() {
  const err = validateConditions(hybridForm.conditions)
  if (err) {
    ElMessage.error(err)
    return
  }
  let embedding: number[] | undefined
  if (hybridForm.mode !== 'attr') {
    embedding = parseEmbedding(hybridForm.embeddingText) ?? undefined
    if (!embedding) {
      ElMessage.warning('face/hybrid 模式需粘贴 512 维人脸向量 (逗号分隔)')
      return
    }
  }
  if (hybridForm.mode !== 'face' && !hybridForm.conditions.length) {
    ElMessage.warning('attr/hybrid 模式至少需要一个 attr 条件')
    return
  }
  await doSearch(() =>
    retrievalApi.searchPersons({
      mode: hybridForm.mode,
      embedding,
      conditions: hybridForm.conditions.length ? hybridForm.conditions : undefined,
      channel_id: hybridForm.channel_id || undefined,
      start_time: hybridForm.timeRange ? Number(hybridForm.timeRange[0]) : undefined,
      end_time: hybridForm.timeRange ? Number(hybridForm.timeRange[1]) : undefined,
      window_ms: hybridForm.window_ms,
      top_k: hybridForm.top_k,
      limit: hybridForm.limit,
    })
  )
}

async function runNL() {
  if (!nlForm.nl.trim()) {
    ElMessage.warning('请输入自然语言查询')
    return
  }
  await doSearch(() => retrievalApi.searchByNL(nlForm.nl.trim(), nlForm.top_k))
}

async function runByImage() {
  if (!imageForm.base64) {
    ElMessage.warning('请先选择查询图片')
    return
  }
  towerUnavailable.value = null
  await doSearch(() =>
    retrievalApi.searchByImage({
      image_base64: imageForm.base64,
      top_k: imageForm.top_k,
      min_similarity: imageForm.min_similarity,
      channel_id: imageForm.channel_id || undefined,
      start_time: imageForm.timeRange ? Number(imageForm.timeRange[0]) : undefined,
      end_time: imageForm.timeRange ? Number(imageForm.timeRange[1]) : undefined,
    })
  )
}

async function doSearch(fn: () => Promise<{ data?: { items?: AnyItem[] } }>) {
  loading.value = true
  searched.value = true
  towerUnavailable.value = null
  try {
    const resp = await fn()
    items.value = (resp.data?.items as AnyItem[]) || []
  } catch (err) {
    items.value = []
    handleError(err)
  } finally {
    loading.value = false
  }
}

// ── 详情联动 ────────────────────────────────────────────────────
const detailVisible = ref(false)
const detailJson = ref('')
const detailAlarmId = ref('')

function openDetail(it: AnyItem) {
  detailJson.value = JSON.stringify(it, null, 2)
  detailAlarmId.value = String(it.alarm_id || '')
  detailVisible.value = true
}

function gotoAlarm() {
  detailVisible.value = false
  router.push({ path: '/alarms', query: detailAlarmId.value ? { alarm_id: detailAlarmId.value } : {} })
}

// valueControlKind 保留给后续按 key 分型渲染 value 控件 (P4-D 对齐扩展点)
void valueControlKind
</script>

<style scoped>
.retrieval-view { padding: 16px; }
.page-header { margin-bottom: 12px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header .sub { color: var(--el-text-color-secondary); font-size: 12px; }
.query-form { max-width: 760px; }
.cond-row { display: flex; gap: 8px; margin-bottom: 8px; }
.cond-key { width: 320px; }
.cond-op { width: 110px; }
.cond-value { width: 160px; }
.hint { color: var(--el-text-color-secondary); font-size: 12px; }
.ml { margin-left: 8px; }
.preview { width: 160px; height: 120px; margin-left: 12px; border-radius: 4px; }
.tower-alert { margin: 12px 0; }
.result-card { cursor: pointer; margin-bottom: 12px; }
.thumb { width: 100%; height: 110px; border-radius: 4px; background: var(--el-fill-color-light); }
.thumb-fallback { display: flex; align-items: center; justify-content: center; color: var(--el-text-color-secondary); font-size: 12px; }
.meta { font-size: 12px; }
.meta .sim { display: flex; align-items: center; gap: 6px; }
.meta .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-json { max-height: 380px; overflow: auto; background: var(--el-fill-color-light); padding: 8px; border-radius: 4px; }
</style>
