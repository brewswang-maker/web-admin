<template>
  <div class="agent-sub-page">
    <div class="page-title">
      <h2>智能订阅</h2>
    </div>

    <!-- 工具条: 状态过滤 + 刷新 + 新建 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <span class="page-desc">
          用一句自然语言订阅告警事件：AI 编译为结构化任务，先进入影子观察（不产生真实联动），验证达标后激活。
        </span>
        <div class="toolbar-actions">
          <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="load">
            <el-option v-for="(m, k) in STATUS_META" :key="k" :label="m.text" :value="k" />
          </el-select>
          <el-button :icon="Refresh" @click="load">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="openCreate">新建订阅</el-button>
        </div>
      </div>
    </el-card>

    <!-- 订阅列表 -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column label="订阅" min-width="260">
          <template #default="{ row }">
            <div class="sub-name">{{ row.name }}</div>
            <div class="sub-nl">"{{ row.nl_text }}"</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag v-if="kindOf(row) === 'vlm_task'" type="warning" size="small">语义视觉</el-tag>
            <el-tag v-else-if="kindOf(row) === 'linkage_rule'" size="small">规则</el-tag>
            <el-tag v-else type="info" size="small">未编译</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="监控通道" width="140">
          <template #default="{ row }">
            {{ (row.channels && row.channels.length) ? row.channels.join(', ') : '全通道' }}
          </template>
        </el-table-column>
        <el-table-column label="命中 (累计)" width="170">
          <template #default="{ row }">
            <div>{{ fmtTime(row.last_hit_at) }}</div>
            <!-- [P3 2026-09-24] 订阅级聚合计数: 冷却窗抑制重复通知但计数不丢 -->
            <div v-if="row.hit_count > 0" class="sub-hit-count">共 {{ row.hit_count }} 次</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'DRAFT'" type="primary" size="small" @click="onConfirm(row)">确认编译</el-button>
            <el-button v-if="canSample(row)" size="small" @click="openSample(row)">采样</el-button>
            <el-button v-if="row.status === 'SANDBOX'" size="small" @click="onVerify(row)">验证</el-button>
            <el-button v-if="row.status === 'ACTIVE'" size="small" @click="onAction(row, 'pause')">暂停</el-button>
            <el-button v-if="row.status === 'PAUSED'" type="success" size="small" @click="onAction(row, 'resume')">恢复</el-button>
            <el-button size="small" link @click="openDetail(row)">详情</el-button>
            <el-button v-if="row.status === 'DRAFT'" type="danger" size="small" link @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无订阅 — 点击右上角「新建订阅」用一句自然语言创建" />
        </template>
      </el-table>
    </el-card>

    <!-- 创建弹层: NL → 编译预览 → 确认创建 (规格 §4.3 步骤 1-3) -->
    <el-dialog v-model="createVisible" title="新建智能订阅" width="620px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="订阅描述">
          <el-input
            v-model="nlInput"
            type="textarea" :rows="2" maxlength="15" show-word-limit
            placeholder="例：发现孩子放学回家就提醒我（15 字以内）"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="previewing" :disabled="!nlInput.trim()" @click="onPreview">
            AI 编译预览
          </el-button>
          <span class="preview-hint">先预览确认 AI 理解，再创建</span>
        </el-form-item>
        <el-form-item v-if="previewRes" label="理解结果">
          <div class="preview-box">
            <div class="preview-kind">
              <el-tag :type="previewRes.need_vlm ? 'warning' : 'primary'" size="small">
                {{ previewRes.need_vlm ? '语义视觉任务 (VLM 复核)' : '结构化联动规则' }}
              </el-tag>
              <span class="preview-kind-text">{{ previewKindText }}</span>
            </div>
            <pre class="preview-json">{{ JSON.stringify(previewRes.preview, null, 2) }}</pre>
          </div>
        </el-form-item>
        <el-form-item label="订阅名称">
          <el-input v-model="nameInput" maxlength="30" placeholder="给订阅起个名字（默认自动生成）" />
        </el-form-item>
        <!-- [P1-1 2026-09-25 通知方式多选] 后端四通道白名单 (ws/email/phone/
             tts_broadcast) 全量开放; 站内推送恒选不可关 (规格 §3.4 空勾选兜底 WS)。
             电话/语音走 executor 独立链路, 不受免打扰 (静默时段) 限制 -->
        <el-form-item label="通知方式">
          <el-checkbox-group v-model="notifyChannels">
            <el-checkbox label="ws" disabled>站内推送</el-checkbox>
            <el-checkbox label="email">邮件</el-checkbox>
            <el-checkbox label="phone">电话提醒</el-checkbox>
            <el-checkbox label="tts_broadcast">语音播报</el-checkbox>
          </el-checkbox-group>
          <div class="notify-tip">电话命中后自动拨打，未接听将重试；电话/语音不受免打扰限制</div>
        </el-form-item>
        <!-- [P1-4 2026-09-25 通道范围] 订阅生效通道多选; 空 = 全部通道 (规格 §3.3)。
             后端 sub.channels 过滤含国标码兼容 (SubscriptionVerifier) -->
        <el-form-item label="监控通道">
          <el-select
            v-model="channelScope" multiple clearable collapse-tags
            :loading="channelOptsLoading" placeholder="默认全部通道" style="width: 100%"
          >
            <el-option v-for="c in channelOpts" :key="c.id" :label="`${c.id} · ${c.name}`" :value="c.id" />
          </el-select>
          <div class="notify-tip">不选 = 订阅全部通道；限定后仅所选通道的命中会通知</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!previewRes" @click="onCreate">
          确认创建 (进入影子观察)
        </el-button>
      </template>
    </el-dialog>

    <!-- 手动采样弹层: 选通道 → 单次判定 (P1.5 链路验证入口) -->
    <el-dialog v-model="sampleVisible" title="手动采样判定" width="560px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="采样通道">
          <el-select v-model="sampleChannel" style="width: 100%" placeholder="选择监控通道">
            <el-option v-for="c in channelOpts" :key="c.id" :label="`${c.id} · ${c.name}`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="sampling" :disabled="!sampleChannel" @click="onSample">
            立即抓帧判定
          </el-button>
          <span class="preview-hint">抓取当前画面交 VLM 判定一次 (hit 会注入联动引擎)</span>
        </el-form-item>
      </el-form>
      <div v-if="sampleRes" class="sample-result">
        <el-alert
          :type="sampleRes.hit ? 'success' : 'info'"
          :closable="false"
          :title="sampleRes.hit ? '命中 — 已按订阅规则注入联动引擎' : '未命中'"
          :description="sampleRes.evidence || '(无证据描述)'"
        />
        <div class="sample-meta">
          <span>置信度: {{ (sampleRes.confidence * 100).toFixed(0) }}%</span>
          <span>判定状态: {{ sampleRes.status }}</span>
          <span>耗时: {{ sampleRes.latency_ms }}ms</span>
          <span v-if="sampleRes.snapshot_url">
            <a :href="sampleRes.snapshot_url" target="_blank">查看抓帧</a>
          </span>
        </div>
      </div>
    </el-dialog>

    <!-- 验证报告弹层: 历史回放结果 + 达标人工确认激活 (规格红线 #2: 激活必须人工确认) -->
    <el-dialog v-model="verifyVisible" title="历史回放验证报告" width="640px" :close-on-click-modal="false">
      <div v-loading="verifying" element-loading-text="正在回放近 24h 样本并逐帧判定…" style="min-height: 120px">
      <template v-if="verifyRes">
        <el-alert
          :type="verifyMeets ? 'success' : 'warning'"
          :closable="false"
          :title="verifyMeets ? '回放验证达标 — 可人工确认激活' : '未达标 — 保持影子观察期继续积累样本'"
          :description="verifyMeets
            ? '激活后订阅进入真实联动 (命中将执行通知动作)。历史回放验证的是产物可执行与画面有效, 不代表未来必然命中。'
            : (verifyRes.report.error_message || '有效样本不足或画面无效占比过高, 建议稍后重新验证。')"
        />
        <el-descriptions :column="2" border size="small" class="verify-stats">
          <el-descriptions-item label="验证方式">
            {{ verifyRes.report.frames_scanned > 0 ? '快照帧逐帧判定' : (verifyRes.report.rule_events_24h > 0 ? '规则事件记录' : '样本不足') }}
          </el-descriptions-item>
          <el-descriptions-item label="耗时">{{ verifyRes.report.elapsed_ms }}ms</el-descriptions-item>
          <el-descriptions-item label="扫描样本">{{ verifyRes.report.frames_scanned }} 帧</el-descriptions-item>
          <el-descriptions-item label="24h 事件记录">{{ verifyRes.report.rule_events_24h }} 条</el-descriptions-item>
          <el-descriptions-item label="命中帧">{{ verifyRes.report.hits }}</el-descriptions-item>
          <el-descriptions-item label="无效画面 (拦截)">{{ verifyRes.report.invalid_frames }}</el-descriptions-item>
          <el-descriptions-item label="判定链跑通">{{ verifyRes.report.backend_ok_frames }} 帧</el-descriptions-item>
          <el-descriptions-item label="链路失败">{{ verifyRes.report.backend_failures }} 帧</el-descriptions-item>
        </el-descriptions>
        <div v-if="verifyRes.report.evidence_frames.length" class="verify-evidence">
          <div class="detail-json-title">证据帧 (近 24h 回放抽样)</div>
          <div class="verify-frames">
            <el-image
              v-for="f in verifyRes.report.evidence_frames" :key="f"
              :src="f" :preview-src-list="verifyRes.report.evidence_frames"
              fit="cover" class="verify-frame" hide-on-click-modal
            />
          </div>
        </div>
        <div v-if="verifyRes.report.evidence_summary" class="verify-summary">
          首个命中证据: {{ verifyRes.report.evidence_summary }}
        </div>
      </template>
      </div>
      <template #footer>
        <el-button @click="verifyVisible = false">关闭</el-button>
        <el-button
          v-if="verifyMeets && verifyTarget"
          type="primary" :loading="activating" @click="onActivate"
        >
          确认激活 (进入真实联动)
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉: 编译产物只读 + 错误信息 -->
    <el-drawer v-model="detailVisible" title="订阅详情" size="480px">
      <template v-if="detailRow">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="名称">{{ detailRow.name }}</el-descriptions-item>
          <el-descriptions-item label="描述">{{ detailRow.nl_text }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusText(detailRow.status) }}</el-descriptions-item>
          <el-descriptions-item label="监控通道">
            {{ (detailRow.channels && detailRow.channels.length) ? detailRow.channels.join(', ') : '全通道' }}
          </el-descriptions-item>
          <el-descriptions-item label="通知方式">{{ notifyText(detailRow.notify_channels) }}</el-descriptions-item>
          <el-descriptions-item label="订阅 ID">{{ detailRow.id }}</el-descriptions-item>
          <el-descriptions-item label="最近命中">{{ fmtTime(detailRow.last_hit_at) || '—' }}</el-descriptions-item>
          <el-descriptions-item v-if="detailRow.last_error" label="最近错误">
            <span class="sub-error">{{ detailRow.last_error }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <div class="detail-json-title">编译产物 (只读)</div>
        <pre class="preview-json">{{ detailCompiledText }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 智能订阅管理视图 (NL 事件订阅 P2 前端入口)
 * [SUBSCRIBE 2026-09-22] 规格 v1.1 §3.8/§4.3/§7.1:
 *   创建流 = NL 输入 → compile-preview (AI 编译) → 用户确认产物 → 创建 (DRAFT)
 *   → confirm (落动作载体规则, SANDBOX 影子观察) → verify 达标 → ACTIVE
 *   状态机操作按钮可见性与后端 SubscriptionStore 迁移表严格对齐
 *   (DRAFT 才 confirm/删除; SANDBOX/ACTIVE 才采样; pause 仅 ACTIVE —
 *    SANDBOX 态 pause 会被后端 1409 拒绝, 属设计行为)
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import {
  compilePreview, createSubscription, listSubscriptions,
  updateSubscription, sampleSubscription, deleteSubscription, verifySubscription,
  type AgentSubscription, type CompilePreviewResult, type SubscriptionSampleResult,
  type VerifyReport,
} from '@/api/agentSubscriptions'
import { channelApi } from '@/api/channel'

// ── 状态展示映射 (与后端 subscriptionStatusToString 对齐) ──
const STATUS_META: Record<string, { text: string; tag: 'info' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { text: '草稿', tag: 'info' },
  SANDBOX: { text: '影子观察', tag: 'warning' },
  ACTIVE: { text: '已激活', tag: 'success' },
  PAUSED: { text: '已暂停', tag: 'danger' },
}
const statusText = (s: string) => STATUS_META[s]?.text ?? s
const statusTag = (s: string) => STATUS_META[s]?.tag ?? 'info'

// ── 通知方式展示映射 (canonical 与后端 notifyChannelToString 对齐) ──
const NOTIFY_META: Record<string, string> = {
  ws: '站内推送', email: '邮件', phone: '电话提醒', tts_broadcast: '语音播报',
}
function notifyText(list?: string[]): string {
  if (!list || !list.length) return '站内推送'
  return list.map(k => NOTIFY_META[k] ?? k).join(' / ')
}

// ── 列表 ──
const list = ref<AgentSubscription[]>([])
const loading = ref(false)
const statusFilter = ref('')
async function load() {
  loading.value = true
  try {
    const res = await listSubscriptions(statusFilter.value ? { status: statusFilter.value } : undefined)
    list.value = res.data?.data?.subscriptions ?? []
  } catch (e) {
    handleErr(e, '加载订阅列表失败')
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** 编译产物 kind (compiled 可能是对象或解析失败回退的字符串) */
function kindOf(s: AgentSubscription): string {
  if (s.compiled && typeof s.compiled === 'object') return String(s.compiled.kind ?? '')
  return ''
}

// ── 创建 (两步: 预览 → 确认) ──
const createVisible = ref(false)
const nlInput = ref('')
const nameInput = ref('')
const previewing = ref(false)
const creating = ref(false)
const previewRes = ref<CompilePreviewResult | null>(null)
// [P1-1 2026-09-25 通知方式多选] 站内推送恒选不可关 (§3.4 兜底); email/phone/tts 可选
const notifyChannels = ref<string[]>(['ws'])
// [P1-4 2026-09-25 通道范围] 订阅生效通道; 空 = 全部通道 (§3.3)
const channelScope = ref<string[]>([])

function openCreate() {
  nlInput.value = ''
  nameInput.value = ''
  previewRes.value = null
  notifyChannels.value = ['ws']
  channelScope.value = []
  createVisible.value = true
  ensureChannelOpts()  // 通道下拉 (异步, 不阻塞弹层)
}

async function onPreview() {
  previewing.value = true
  previewRes.value = null
  try {
    const res = await compilePreview(nlInput.value.trim())
    previewRes.value = res.data?.data ?? null
  } catch (e) {
    // 1400 超字数 / SUB_LLM_NOT_READY (可稍后重试) / SUB_INTENT_UNCLEAR 等结构化错误
    handleErr(e, '编译预览失败')
  } finally {
    previewing.value = false
  }
}

const previewKindText = computed(() => {
  if (!previewRes.value) return ''
  return previewRes.value.need_vlm
    ? '订阅包含视觉语义判断, 命中由 VLM 抓帧复核后注入联动引擎'
    : '订阅已编译为可执行的联动规则, 命中走规则引擎判定'
})

async function onCreate() {
  if (!previewRes.value) return
  creating.value = true
  try {
    // 名称缺省自动生成 (后端 name 必填; 避免撞 SUB_DUPLICATE)
    const name = nameInput.value.trim() || `订阅-${new Date().toISOString().slice(5, 16).replace('T', ' ')}`
    await createSubscription({
      nl_text: previewRes.value.nl_text,
      name,
      // [FIX sub-preview 2026-09-24] 传产物本体 (preview 字段) 而非整包装 —
      //   后端 req["preview"].dump() 直喂编译器, 包装对象顶层无字段会被安全门拒
      preview: previewRes.value.preview,
      // [P1-4 2026-09-25] 通道范围: 空 = 全通道; 后端 sub.channels 过滤 (含国标码兼容)
      channels: channelScope.value,
      // [P1-1 2026-09-25] 通知方式多选 (canonical ws/email/phone/tts_broadcast)
      notify_channels: notifyChannels.value,
      // [P3 兼容] 电话布尔字段保留 (旧面板语义; 后端与数组合并去重)
      phone_notify: notifyChannels.value.includes('phone'),
    })
    ElMessage.success('订阅已创建 (草稿) — 点击「确认编译」进入影子观察')
    createVisible.value = false
    await load()
  } catch (e) {
    handleErr(e, '创建订阅失败')
  } finally {
    creating.value = false
  }
}

// ── 状态机操作 ──
async function onConfirm(row: AgentSubscription) {
  try {
    await updateSubscription(row.id, { action: 'confirm' })
    ElMessage.success('已确认 — 进入影子观察期 (规则已挂载但暂不真实联动)')
    await load()
  } catch (e) {
    handleErr(e, '确认失败')
  }
}

async function onAction(row: AgentSubscription, action: 'pause' | 'resume') {
  try {
    await updateSubscription(row.id, { action })
    ElMessage.success(action === 'pause' ? '已暂停 (联动规则同步禁用)' : '已恢复 (联动规则同步启用)')
    await load()
  } catch (e) {
    handleErr(e, '操作失败')
  }
}

async function onDelete(row: AgentSubscription) {
  try {
    await ElMessageBox.confirm(`确定删除订阅「${row.name}」吗？`, '删除订阅', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteSubscription(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    handleErr(e, '删除失败 (仅草稿态可删除)')
  }
}

// ── 验证报告 (SANDBOX 历史回放 → 达标人工激活) ──
// [subscribe-verify 2026-09-24] verify 端点已实现 (此前恒 1501 契约占位):
//   报告弹层展示回放统计 + 证据帧; meets_threshold 时人工点击激活 —
//   后端 PUT activate 会对存档报告二次校验, 双保险绕不过红线 #2
const verifyVisible = ref(false)
const verifying = ref(false)
const activating = ref(false)
const verifyRes = ref<{ report: VerifyReport; meets_threshold: boolean; next: string } | null>(null)
const verifyTarget = ref<AgentSubscription | null>(null)
const verifyMeets = computed(() => verifyRes.value?.meets_threshold ?? false)

async function onVerify(row: AgentSubscription) {
  verifyTarget.value = row
  verifyRes.value = null
  verifying.value = true
  verifyVisible.value = true
  try {
    const res = await verifySubscription(row.id)
    verifyRes.value = res.data?.data ?? null
  } catch (e) {
    verifyVisible.value = false
    handleErr(e, '验证未完成 (仅影子观察态可验证)')
  } finally {
    verifying.value = false
  }
}

async function onActivate() {
  if (!verifyTarget.value) return
  activating.value = true
  try {
    await updateSubscription(verifyTarget.value.id, { action: 'activate' })
    ElMessage.success('已激活 — 订阅进入真实联动 (命中将执行通知动作)')
    verifyVisible.value = false
    await load()
  } catch (e) {
    // 1409 SUB_VERIFY_NOT_PASSED (报告未达标/不存在) / SUB_INVALID_TRANSITION
    handleErr(e, '激活失败')
  } finally {
    activating.value = false
  }
}

const canSample = (row: AgentSubscription) => row.status === 'SANDBOX' || row.status === 'ACTIVE'

// ── 手动采样 ──
const sampleVisible = ref(false)
const sampling = ref(false)
const sampleRes = ref<SubscriptionSampleResult | null>(null)
const sampleChannel = ref('')
const channelOpts = ref<{ id: string; name: string }[]>([])
const channelOptsLoading = ref(false)
let sampleTarget: AgentSubscription | null = null

/** 通道下拉数据 (创建表单 + 采样弹层共用; 懒加载一次, 失败不阻塞弹层) */
async function ensureChannelOpts() {
  if (channelOpts.value.length > 0 || channelOptsLoading.value) return
  channelOptsLoading.value = true
  try {
    const res = await channelApi.getList({ pageSize: 100 })
    // [FIX 2026-09-24 真机] 后端通道实体的键是 channel_id (20 位国标码字符串),
    //   ChannelItem.id 在该响应中不存在 — 取值必须 channel_id 优先, 否则下拉空
    channelOpts.value = (res.data?.data?.items ?? []).map(c => ({
      id: (c as unknown as { channel_id?: string }).channel_id ?? c.id,
      name: c.name,
    }))
  } catch (e) {
    handleErr(e, '通道列表加载失败')
  } finally {
    channelOptsLoading.value = false
  }
}

async function openSample(row: AgentSubscription) {
  sampleTarget = row
  sampleRes.value = null
  sampleVisible.value = true
  await ensureChannelOpts()
  if (!sampleChannel.value) sampleChannel.value = channelOpts.value[0]?.id ?? ''
}

async function onSample() {
  if (!sampleTarget || !sampleChannel.value) return
  sampling.value = true
  sampleRes.value = null
  try {
    const res = await sampleSubscription(sampleTarget.id, sampleChannel.value)
    sampleRes.value = res.data?.data ?? null
  } catch (e) {
    handleErr(e, '采样失败')
  } finally {
    sampling.value = false
  }
}

// ── 详情 ──
const detailVisible = ref(false)
const detailRow = ref<AgentSubscription | null>(null)
const detailCompiledText = computed(() => {
  const c = detailRow.value?.compiled
  if (!c) return '(尚未编译)'
  return typeof c === 'string' ? c : JSON.stringify(c, null, 2)
})
function openDetail(row: AgentSubscription) {
  detailRow.value = row
  detailVisible.value = true
}

// ── 工具 ──
function fmtTime(ms?: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleString('zh-CN', { hour12: false })
}
function handleErr(e: unknown, fallback: string) {
  const msg = e instanceof Error && e.message ? e.message : fallback
  ElMessage.error(msg)
}
</script>

<style scoped>
.agent-sub-page { padding: 16px 20px; }
.page-title h2 { margin: 0 0 14px; font-size: 20px; }
.toolbar-card { margin-bottom: 14px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toolbar-actions { display: flex; gap: 10px; flex-shrink: 0; }
.page-desc { color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
.sub-name { font-weight: 600; }
.sub-nl { color: var(--el-text-color-secondary); font-size: 12px; margin-top: 2px; }
.sub-error { color: var(--el-color-danger); font-size: 12px; }
.preview-hint { margin-left: 10px; color: var(--el-text-color-secondary); font-size: 12px; }

/* [P3 2026-09-24] 订阅聚合命中计数; [P1-1 2026-09-25] 通知方式/通道副文案 */
.notify-tip { margin-top: 4px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
.sub-hit-count { margin-top: 2px; color: var(--el-text-color-secondary); font-size: 12px; }
.preview-box { width: 100%; }
.preview-kind { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.preview-kind-text { color: var(--el-text-color-secondary); font-size: 12px; }
.preview-json {
  margin: 0; padding: 10px; max-height: 220px; overflow: auto;
  background: var(--el-fill-color-light); border-radius: 6px;
  font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all;
}
.sample-result { margin-top: 4px; }
.sample-meta {
  display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px;
  color: var(--el-text-color-secondary); font-size: 13px;
}
.detail-json-title { margin: 14px 0 8px; font-weight: 600; font-size: 13px; }
/* 验证报告弹层 (subscribe-verify 2026-09-24) */
.verify-stats { margin-top: 14px; }
.verify-frames { display: flex; gap: 8px; flex-wrap: wrap; }
.verify-frame { width: 96px; height: 64px; border-radius: 4px; background: var(--el-fill-color-light); }
.verify-summary { margin-top: 10px; color: var(--el-text-color-secondary); font-size: 13px; }
</style>
