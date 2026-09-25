<template>
  <div class="ai-chat-page">
    <el-card class="chat-shell" shadow="never">
      <div class="chat-layout">
      <!-- 左侧对话列表 -->
      <div class="chat-sidebar">
        <div class="sidebar-header">
          <h3>AI助手</h3>
          <el-button type="primary" size="small" @click="newConversation">
            <el-icon><Plus /></el-icon>新对话
          </el-button>
        </div>
        <div class="conv-list">
          <div v-for="conv in conversations" :key="conv.id"
               :class="['conv-item', { active: currentConvId === conv.id }]"
               @click="switchConversation(conv.id)">
            <el-icon><ChatDotRound /></el-icon>
            <span class="conv-title">{{ conv.title }}</span>
            <el-button class="conv-del" size="small" text @click.stop="deleteConversation(conv.id)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-empty v-if="!conversations.length" description="暂无对话" :image-size="40" />
        </div>
        <div class="sidebar-footer">
          <el-tag :type="agentOnline ? 'success' : 'info'" effect="dark" size="small">
            {{ agentOnline ? '🟢 Agent在线' : '⚫ Agent离线' }}
          </el-tag>
        </div>
      </div>

      <!-- 右侧主区域 -->
      <div class="chat-main">
        <div class="chat-toolbar">
          <span class="toolbar-label">
            <el-icon><ChatDotRound /></el-icon>
            华盾AI安全助手 · 灵犀Agent
          </span>
          <el-dropdown @command="onToolbarAction">
            <el-button size="small" text><el-icon><MoreFilled /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="clear">清空当前对话</el-dropdown-item>
                <el-dropdown-item command="export">导出对话记录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <!-- 消息区 -->
        <div class="chat-messages" ref="msgContainer">
          <!-- 欢迎区 -->
          <div v-if="messages.length === 0" class="welcome">
            <img class="welcome-icon" :src="aiWelcomeGif" alt="华盾AI安全助手" />
            <h2>华盾AI安全助手</h2>
            <p>基于MACSA五智能体架构，融合感知、研判、决策、执行、元认知五环认知</p>
            <div class="quick-actions">
              <el-button v-for="qa in quickActions" :key="qa.text" @click="onQuickAction(qa)">
                {{ qa.icon }} {{ qa.text }}
              </el-button>
            </div>
          </div>

          <!-- 消息列表 -->
          <div v-for="(msg, idx) in messages" :key="idx" :class="['msg-row', msg.role]">
            <!-- 用户消息 -->
            <div v-if="msg.role === 'user'" class="msg-bubble user-bubble">
              <img class="msg-avatar user-avatar" :src="userAvatarImage" alt="用户" />
              <div class="msg-content">{{ msg.content }}</div>
            </div>

            <!-- AI文本回复 -->
            <div v-else-if="msg.role === 'assistant'" class="msg-bubble ai-bubble">
              <img class="msg-avatar ai-avatar" :src="aiAvatarImage" alt="AI助手" />
              <div class="msg-content" v-html="renderMarkdown(msg.content)"></div>
            </div>

            <!-- Agent思考过程 -->
            <div v-else-if="msg.role === 'thinking'" class="msg-bubble think-bubble">
              <div class="msg-avatar think-avatar">🧠</div>
              <div class="think-block">
                <div class="think-header">
                  <span class="think-label">Agent 思考中</span>
                  <span class="think-dots" v-if="msg.running">
                    <span>.</span><span>.</span><span>.</span>
                  </span>
                </div>
                <div class="think-steps">
                  <div v-for="(step, si) in msg.steps" :key="si" :class="['think-step', step.status]">
                    <span class="step-icon">{{ step.status === 'done' ? '✅' : step.status === 'running' ? '🟡' : '⏳' }}</span>
                    <span class="step-text">{{ step.text }}</span>
                    <span v-if="step.duration" class="step-dur">{{ step.duration }}ms</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 工具调用 -->
            <div v-else-if="msg.role === 'tool'" class="msg-bubble tool-bubble">
              <div class="msg-avatar tool-avatar">🔧</div>
              <div class="tool-block">
                <div class="tool-header">
                  <span class="tool-name">{{ msg.toolName }}</span>
                  <el-tag :type="msg.status === 'success' ? 'success' : msg.status === 'running' ? 'warning' : 'danger'" size="small">
                    {{ msg.status === 'success' ? '完成' : msg.status === 'running' ? '执行中' : '失败' }}
                  </el-tag>
                  <span v-if="msg.duration" class="tool-dur">{{ msg.duration }}ms</span>
                </div>
                <div v-if="msg.args" class="tool-args">
                  <div class="tool-label">输入参数:</div>
                  <pre><code>{{ formatJson(msg.args) }}</code></pre>
                </div>
                <div v-if="msg.result" class="tool-result">
                  <div class="tool-label">执行结果:</div>
                  <pre><code>{{ formatJson(msg.result) }}</code></pre>
                </div>
              </div>
            </div>

            <!-- 截图动作 -->
            <div v-else-if="msg.role === 'action' && msg.actionType === 'snapshot'" class="msg-bubble ai-bubble">
              <img class="msg-avatar ai-avatar" :src="aiAvatarImage" alt="AI助手" />
              <div class="msg-content">
                <div v-if="msg.status === 'success' && msg.snapshotUrl" class="snapshot-result">
                  <img :src="msg.snapshotUrl" alt="实时截图" class="snapshot-img" @click="openSnapshot(msg.snapshotUrl)" />
                </div>
                <div v-else class="snapshot-error">截图不可用</div>
              </div>
            </div>

            <!-- [FEAT subscribe-v12 2026-09-25] 订阅预览确认卡: AI 对话直通创建 (M3 第二入口) -->
            <div v-else-if="msg.role === 'action' && msg.actionType === 'subscription_preview'" class="msg-bubble ai-bubble">
              <img class="msg-avatar ai-avatar" :src="aiAvatarImage" alt="AI助手" />
              <div v-if="msg.subPreview" class="sub-card">
                <div class="sub-card-head">
                  <el-tag :type="msg.subPreview.need_vlm ? 'warning' : 'primary'" size="small">
                    {{ msg.subPreview.need_vlm ? '语义视觉任务 (VLM 复核)' : '结构化联动规则' }}
                  </el-tag>
                  <span class="sub-card-nl">{{ msg.subPreview.nl_text }}</span>
                </div>
                <pre class="sub-card-json">{{ formatJson(msg.subPreview.preview) }}</pre>
                <template v-if="msg.subState === 'pending' || msg.subState === 'creating'">
                  <div class="sub-card-row">
                    <span class="sub-card-label">电话提醒</span>
                    <el-switch v-model="msg.subPhone" size="small" :disabled="msg.subState === 'creating'" />
                    <span class="sub-card-hint">命中后自动拨打，未接听将重试</span>
                  </div>
                  <div class="sub-card-actions">
                    <el-button type="primary" size="small" :loading="msg.subState === 'creating'"
                      @click="confirmSubscriptionCard(msg)">确认创建 (进入草稿)</el-button>
                    <el-button size="small" :disabled="msg.subState === 'creating'"
                      @click="msg.subState = 'cancelled'">取消</el-button>
                  </div>
                  <div class="sub-card-hint">创建后为草稿态, 需在订阅页「确认编译 → 影子观察 → 验证激活」</div>
                </template>
                <template v-else-if="msg.subState === 'created'">
                  <el-alert type="success" :closable="false" title="订阅已创建 (草稿)"
                    :description="`ID: ${msg.subSubId} — 请前往「智能订阅」页确认编译, 进入影子观察期`" />
                  <div class="sub-card-actions">
                    <el-button type="primary" size="small" @click="goSubscriptionPage">去订阅页管理</el-button>
                  </div>
                </template>
                <template v-else-if="msg.subState === 'error'">
                  <el-alert type="error" :closable="false" title="创建失败" :description="msg.subError" />
                  <div class="sub-card-actions">
                    <el-button size="small" @click="msg.subState = 'pending'">重试</el-button>
                  </div>
                </template>
                <div v-else class="sub-card-hint">已取消该订阅预览。</div>
              </div>
            </div>

            <!-- 系统消息 -->
            <div v-else-if="msg.role === 'system'" class="msg-system">
              <span>{{ msg.content }}</span>
            </div>
          </div>

          <!-- 正在输入指示 -->
          <div v-if="isStreaming" class="msg-row assistant">
            <div class="msg-bubble ai-bubble">
              <img class="msg-avatar ai-avatar" :src="aiAvatarImage" alt="AI助手" />
              <div class="msg-content streaming">
                <span v-html="renderMarkdown(streamingText)"></span>
                <span class="cursor-blink">▊</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 输入区 -->
        <div class="chat-input-area">
          <!-- [FEAT smart-sub 2026-09-25] 常用一键订阅面板: 「智能订阅」按钮就地展开 (不跳订阅页) -->
          <div v-if="smartPanelOpen" class="smart-sub-panel">
            <div class="smart-sub-head">
              <span class="smart-sub-title">🔔 常用一键订阅</span>
              <span class="smart-sub-sub">点击模板自动发送 (15 字内) · 经订阅编译预览后由你确认创建为草稿</span>
              <el-button size="small" text @click="smartPanelOpen = false">收起</el-button>
            </div>
            <div class="smart-sub-grid">
              <div v-for="tpl in oneClickTemplates" :key="tpl.label" class="smart-sub-item"
                :class="{ disabled: isStreaming }" @click="applySubTemplate(tpl)">
                <span class="tpl-icon">{{ tpl.icon }}</span>
                <div class="tpl-body">
                  <div class="tpl-label">{{ tpl.label }}</div>
                  <div class="tpl-nl">{{ tpl.nl }}</div>
                </div>
              </div>
              <div class="smart-sub-item is-custom" @click="onCustomSubscribe">
                <span class="tpl-icon">✏️</span>
                <div class="tpl-body">
                  <div class="tpl-label">自定义订阅</div>
                  <div class="tpl-nl">自行输入描述 (15 字内)</div>
                </div>
              </div>
            </div>
          </div>
          <!-- 图片预览 -->
          <div v-if="pendingImages.length" class="image-preview-bar">
            <div v-for="(img, idx) in pendingImages" :key="idx" class="preview-thumb-wrap">
              <img :src="img" class="preview-thumb" />
              <el-button class="thumb-remove" size="small" circle @click="pendingImages.splice(idx, 1)">x</el-button>
            </div>
          </div>
          <div class="input-wrapper">
            <el-upload
              :auto-upload="false"
              :show-file-list="false"
              accept="image/*"
              :on-change="onImageSelected"
            >
              <el-button size="small" :icon="Promotion" circle title="上传图片" />
            </el-upload>
            <!-- [P2-2] 语音输入按钮 -->
            <el-button size="small" circle
              :type="isRecording ? 'danger' : 'default'"
              @click="toggleVoiceInput"
              :title="isRecording ? '正在录音...点击停止' : '语音输入'">
              {{ isRecording ? '🔴' : '🎤' }}
            </el-button>
            <el-input ref="inputRef" v-model="inputText" type="textarea" :rows="2"
              placeholder="输入您的问题，如：帮我检查3号厂区的安全状况..."
              @keydown.enter.exact.prevent="sendMessage"
              :disabled="isStreaming" resize="none" />
            <el-button type="primary" :icon="Promotion" circle
              @click="sendMessage" :disabled="(!inputText.trim() && !pendingImages.length) || isStreaming" />
          </div>
          <div class="input-footer">
            <span class="input-hint">Enter发送 · Shift+Enter换行</span>
            <!-- [P2-2] TTS开关 -->
            <el-switch v-model="ttsEnabled" size="small" active-text="语音播报" inline-prompt
              style="margin: 0 8px" />
            <div class="input-shortcuts">
              <el-button size="small" text v-for="qa in quickActions" :key="qa.text"
                @click="onQuickAction(qa)">{{ qa.text }}</el-button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { aiHttp } from '@/api/http'
import { createSubscription, type CompilePreviewResult } from '@/api/agentSubscriptions'
import { ElMessage } from 'element-plus'
import { Promotion } from '@element-plus/icons-vue'
import type { ApiResponse } from '@/types/common'
import aiWelcomeGif from '@/assets/ai1.gif'
import aiAvatarImage from '@/assets/photo1.jpg'
import userAvatarImage from '@/assets/photo2.jpg'

interface ThinkStep { text: string; status: 'pending' | 'running' | 'done'; duration?: number }
interface ChatMessage {
  role: 'user' | 'assistant' | 'thinking' | 'tool' | 'system' | 'action'
  content: string
  toolName?: string
  args?: any
  result?: any
  status?: string
  duration?: number
  steps?: ThinkStep[]
  running?: boolean
  snapshotUrl?: string
  actionType?: string
  // [FEAT subscribe-v12 2026-09-25] AI 助手订阅预览卡状态机
  subPreview?: CompilePreviewResult
  subState?: 'pending' | 'creating' | 'created' | 'error' | 'cancelled'
  subPhone?: boolean
  subError?: string
  subSubId?: string
}
interface Conversation { id: string; title: string; created_at: string }

const conversations = ref<Conversation[]>([])
const currentConvId = ref('')
const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const isStreaming = ref(false)
const streamingText = ref('')
const agentOnline = ref(true)
const msgContainer = ref<HTMLElement>()
const pendingImages = ref<string[]>([])

// [P2-2] 语音输入/TTS
const isRecording = ref(false)
const ttsEnabled = ref(false)
let recognition: any = null
let speechSynthesis: SpeechSynthesis | null = null

interface QuickAction { icon: string; text: string; prompt: string; special?: 'smart_subscribe' }
// [FEAT quick-cmd 2026-09-25] 快捷命令扩展: 用户点名 4 条 (今日报告/设备巡警/策略优化/
//   策略分析) + 趋势分析保留。
//   [FEAT smart-sub 2026-09-25] 订阅入口更名「智能订阅」: 旧引导消息行为已删除,
//   改为就地展开「常用一键订阅」面板 (见下定义), 不残留旧命名与旧点击路径。
//   设备巡警命中后端本地数据拦截 (不依赖 LLM); 订阅类经 IntentParser SUBSCRIBE 判定,
//   预览产物经 SSE action 下发确认卡。
const quickActions: QuickAction[] = [
  { icon: '📊', text: '今日报告', prompt: '帮我生成今日安全报告' },
  { icon: '🛡️', text: '设备巡警', prompt: '帮我做一次设备巡警，检查所有设备的在线状态和运行情况' },
  { icon: '⚡', text: '策略优化', prompt: '分析最近的告警数据，给出安全策略优化建议' },
  { icon: '🧭', text: '策略分析', prompt: '结合最近告警数据分析当前安全策略的覆盖情况，指出可能遗漏的风险场景' },
  { icon: '📈', text: '趋势分析', prompt: '分析最近7天的告警趋势，识别高风险时段' },
  { icon: '🔔', text: '智能订阅', prompt: '', special: 'smart_subscribe' },
]

// [FEAT smart-sub 2026-09-25] 常用一键订阅模板 (集中定义, 便于增删并与事件类型 SSOT 对齐):
//   每条 = 事件名 + ≤15 字 NL 话术 (IntentParser SUBSCRIBE 正则命中口径:
//   "有…就提醒我 / 发现…提醒我") + 对应 EventTypeAliases.h 注册表 canonical 事件。
//   清单经真机 TinyLLM 编译链 2 轮实证筛选 (全 2/2 稳定): 人员闯入/区域徘徊/越界/
//   摔倒 映射为结构化规则类 (intrusion/loitering/tripwire/fall_detected); 其余映射为
//   VLM 语义类 (need_vlm=true) — 均为合法产物, 由预览卡如实展示。
//   ⚠️ 修改 NL 文案前必须重跑真机编译链实测: 小模型对措辞敏感, 换词可能编造注册表
//   外的 key (实证: "发现明火/火灾就提醒我" 会编 fire_detected 被安全门拒)。
interface OneClickTemplate { icon: string; label: string; nl: string }
const oneClickTemplates: OneClickTemplate[] = [
  { icon: '🚶', label: '人员闯入', nl: '有人闯入就提醒我' },
  { icon: '🔁', label: '区域徘徊', nl: '有人在禁区徘徊就提醒我' },
  { icon: '⚠️', label: '越界检测', nl: '有人越界就提醒我' },
  { icon: '🧗', label: '攀爬检测', nl: '有人攀爬就提醒我' },
  { icon: '🤕', label: '人员摔倒', nl: '有人摔倒就提醒我' },
  { icon: '🥊', label: '打架斗殴', nl: '发现有人打架就提醒我' },
  { icon: '👥', label: '人群聚集', nl: '有人群聚集就提醒我' },
  { icon: '🔥', label: '烟火检测', nl: '发现着火就提醒我' },
  { icon: '💨', label: '烟雾检测', nl: '发现浓烟就提醒我' },
  { icon: '🎒', label: '物品遗留', nl: '发现物品遗落就提醒我' },
]
const smartPanelOpen = ref(false)
const inputRef = ref<{ focus: () => void }>()

let abortCtrl: AbortController | null = null

function scrollToBottom() {
  nextTick(() => {
    if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight
  })
}

// markdown 渲染器: 块级 (标题/表格/列表/引用/分隔线/代码块) + 行内 (code/bold)
//   [FEAT md-render 2026-09-25] 原实现仅 code/bold/换行 — 「策略优化/策略分析」等长回答的
//   # 标题与 | 表格裸显 markdown 符号. 本版补块级渲染, 并顺势补 HTML 转义: 原 v-html 直插
//   未转义文本, LLM 输出中的 <...> 会被浏览器当标签吞掉 (且属注入面). 实现为纯字符串
//   状态机 (零第三方依赖, 标签始终配对) — 流式增量下未成形的表格/列表退化为纯文本行,
//   不产生半截标签.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderInline(s: string): string { // 入参须已转义
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

function renderMarkdown(text: string): string {
  if (!text) return ''
  // ① 围栏代码块先抽离 (\u0000 占位 — 转义与行级规则都不触碰), 块内原样转义
  const fences: string[] = []
  let src = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m: string, lang: string, code: string) => {
    fences.push(`<pre><code${lang ? ` class="lang-${lang}"` : ''}>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`)
    return `\u0000f${fences.length - 1}\u0000`
  })
  src = escapeHtml(src)
  const lines = src.split('\n')
  const html: string[] = []
  let para: string[] = []
  let listTag: 'ul' | 'ol' | null = null
  const flushPara = () => { if (para.length) { html.push(para.join('<br>')); para = [] } }
  const closeList = () => { if (listTag) { html.push(`</${listTag}>`); listTag = null } }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 代码块占位行 — 按块处理 (避免前后多出 <br>)
    if (/^\s*\u0000f\d+\u0000\s*$/.test(line)) { flushPara(); closeList(); html.push(line.trim()); continue }
    // 表格: 本行含 | 且下一行为 |---| 分隔行 (含 :---: 对齐符)
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') &&
        /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      flushPara(); closeList()
      const cells = (l: string) =>
        l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => renderInline(c.trim()))
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i++ }
      i--
      html.push('<table><thead><tr>' + head.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>')
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.+)$/)
    if (h) { flushPara(); closeList(); html.push(`<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`); continue }
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); closeList(); html.push('<hr>'); continue }
    const bq = line.match(/^\s*&gt;\s?(.*)$/) // '>' 已被转义为 &gt;
    if (bq) { flushPara(); closeList(); html.push(`<blockquote>${renderInline(bq[1])}</blockquote>`); continue }
    const ul = line.match(/^\s*[-*]\s+(.+)$/)
    if (ul) { flushPara(); if (listTag !== 'ul') { closeList(); html.push('<ul>'); listTag = 'ul' } html.push(`<li>${renderInline(ul[1])}</li>`); continue }
    const ol = line.match(/^\s*(\d+)[.、]\s+(.+)$/) // 捕获序号: 子项打断后续排时用 start 属性对齐原始编号
    if (ol) { flushPara(); if (listTag !== 'ol') { closeList(); html.push(`<ol start="${ol[1]}">`); listTag = 'ol' } html.push(`<li>${renderInline(ol[2])}</li>`); continue }
    closeList()
    para.push(line.trim() ? renderInline(line) : '') // 空行贡献空段 — 保留原 \n→<br> 空行观感
  }
  flushPara(); closeList()
  return html.join('').replace(/\u0000f(\d+)\u0000/g, (_m, n: string) => fences[Number(n)])
}

function openSnapshot(url: string) {
  window.open(url, '_blank')
}

function formatJson(obj: any): string {
  try { return JSON.stringify(obj, null, 2) } catch { return String(obj) }
}

async function loadConversations() {
  try {
    // 后端响应是 {code, message, data:{sessions, total}} 嵌套结构
    const { data } = await aiHttp.get<ApiResponse<{ sessions: Conversation[]; total: number }>>('/sessions')
    const list = data?.data?.sessions
    conversations.value = Array.isArray(list) ? list : []
  } catch {
    conversations.value = [{ id: 'default', title: '新对话', created_at: new Date().toISOString() }]
  }
  if (conversations.value.length) currentConvId.value = conversations.value[0].id
}

function newConversation() {
  const id = 'conv_' + Date.now()
  conversations.value.unshift({ id, title: '新对话', created_at: new Date().toISOString() })
  currentConvId.value = id
  messages.value = []
}

function switchConversation(id: string) {
  currentConvId.value = id
  // Load chat history from backend
  aiHttp.get(`/sessions/${id}/messages`).then(res => {
    messages.value = res.data?.data ?? []
  }).catch(() => {
    messages.value = []
  })
}

async function deleteConversation(id: string) {
  try { await aiHttp.delete(`/sessions/${id}`) } catch { /* ignore */ }
  conversations.value = conversations.value.filter(c => c.id !== id)
  if (currentConvId.value === id && conversations.value.length) {
    currentConvId.value = conversations.value[0].id
    messages.value = []
  }
}

function onToolbarAction(cmd: string) {
  if (cmd === 'clear') messages.value = []
  if (cmd === 'export') {
    const text = messages.value.map(m => `[${m.role}] ${m.content}`).join('\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `chat_${currentConvId.value}_${Date.now()}.txt`
    a.click()
  }
}

function sendQuickAction(prompt: string) {
  inputText.value = prompt
  sendMessage()
}

// [FEAT quick-cmd 2026-09-25] 快捷命令统一入口: 其余 = prompt 直发 (今日报告/设备巡警
//   走后端本地数据拦截, 分析类走 LLM)。
// [FEAT smart-sub 2026-09-25] 智能订阅 = 就地展开/收起常用一键订阅面板 (不跳订阅页)。
function onQuickAction(qa: QuickAction) {
  if (qa.special === 'smart_subscribe') {
    smartPanelOpen.value = !smartPanelOpen.value
    return
  }
  sendQuickAction(qa.prompt)
}

// [FEAT smart-sub 2026-09-25] 模板项: 自动填入输入框并直接发送 (等效用户手输+回车),
//   随后复用既有订阅链路 — IntentParser SUBSCRIBE → subscriptionCompileChain 预览
//   → SSE action: subscription_preview → 用户预览卡「确认创建」为 DRAFT (同 15 字
//   上限/同安全门/同落库口径, 零后端新引擎)。
//   取舍口径: 全部模板统一"填即发"; 仅自定义项为"只聚焦不发送" — 行为一致可观。
function applySubTemplate(tpl: OneClickTemplate) {
  if (isStreaming.value) {
    ElMessage.warning('AI 正在回复中, 请稍候再试')
    return
  }
  inputText.value = tpl.nl
  sendMessage()
}

// [FEAT smart-sub 2026-09-25] 自定义项: 不预设话术 — 收起面板并聚焦输入框,
//   由用户自行输入 (仍受 15 字上限与编译安全门约束, 发送后链路同模板项)。
function onCustomSubscribe() {
  smartPanelOpen.value = false
  nextTick(() => inputRef.value?.focus())
}

// [FEAT subscribe-v12 2026-09-25] 订阅预览卡确认 → 复用既有创建端点 (同安全门同落库;
//   产物 = 用户确认件直喂, 不重调 LLM — 与订阅页「确认创建」完全同口径, DRAFT 初态)。
const router = useRouter()

async function confirmSubscriptionCard(msg: ChatMessage) {
  if (!msg.subPreview || msg.subState === 'creating') return
  msg.subState = 'creating'
  try {
    const res = await createSubscription({
      nl_text: msg.subPreview.nl_text,
      name: '', // 后端缺省取 NL (与订阅页自动生成口径一致)
      preview: msg.subPreview.preview,
      channels: [],
      phone_notify: !!msg.subPhone,
    })
    msg.subSubId = res.data?.data?.subscription?.id ?? ''
    msg.subState = 'created'
    messages.value.push({ role: 'system', content: '✅ 订阅已创建 (草稿) — 可前往「智能订阅」页确认编译' })
  } catch (e: unknown) {
    msg.subState = 'error'
    msg.subError = e instanceof Error && e.message ? e.message : '创建订阅失败, 请稍后重试'
  }
  scrollToBottom()
}

function goSubscriptionPage() {
  router.push({ name: 'AgentSubscription' })
}

// [P2-2] 语音输入 (Web Speech API SpeechRecognition)
function toggleVoiceInput() {
  const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRecognitionClass) {
    ElMessage.warning('当前浏览器不支持语音识别，请使用 Chrome/Edge')
    return
  }

  if (isRecording.value) {
    // 停止录音
    if (recognition) recognition.stop()
    isRecording.value = false
    return
  }

  recognition = new SpeechRecognitionClass()
  recognition.lang = 'zh-CN'
  recognition.continuous = false
  recognition.interimResults = true

  recognition.onresult = (event: any) => {
    let interim = ''
    let final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        final += transcript
      } else {
        interim += transcript
      }
    }
    if (final) {
      inputText.value += final
    } else if (interim) {
      inputText.value = interim
    }
  }

  recognition.onerror = (event: any) => {
    ElMessage.error('语音识别错误: ' + event.error)
    isRecording.value = false
  }

  recognition.onend = () => {
    isRecording.value = false
  }

  recognition.start()
  isRecording.value = true
  ElMessage.info('🎤 正在录音... 请说话')
}

// [P2-2] TTS 语音播报 (Web Speech API SpeechSynthesis)
function speakText(text: string) {
  if (!ttsEnabled.value) return
  if (!('speechSynthesis' in window)) return

  // 取消之前的播报
  window.speechSynthesis.cancel()

  // 清理HTML标签, 只播报纯文本
  const plainText = text.replace(/<[^>]+>/g, '').replace(/[#*`_~]/g, '').substring(0, 500)
  if (!plainText.trim()) return

  const utterance = new SpeechSynthesisUtterance(plainText)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.0
  utterance.pitch = 1.0

  // 尝试选择中文语音
  const voices = window.speechSynthesis.getVoices()
  const zhVoice = voices.find(v => v.lang.startsWith('zh'))
  if (zhVoice) utterance.voice = zhVoice

  window.speechSynthesis.speak(utterance)
}

function onImageSelected(file: any) {
  const raw = file.raw as File
  if (!raw || !raw.type.startsWith('image/')) return
  if (pendingImages.value.length >= 4) { ElMessage.warning('最多上传4张图片'); return }
  const reader = new FileReader()
  reader.onload = (e) => {
    if (e.target?.result) pendingImages.value.push(e.target.result as string)
  }
  reader.readAsDataURL(raw)
}

async function sendMessage() {
  const text = inputText.value.trim()
  const images = [...pendingImages.value]
  if ((!text && !images.length) || isStreaming.value) return

  const displayContent = images.length
    ? (text || '请分析这张图片') + `\n[附带${images.length}张图片]`
    : text
  messages.value.push({ role: 'user', content: displayContent })
  inputText.value = ''
  pendingImages.value = []
  scrollToBottom()

  isStreaming.value = true
  streamingText.value = ''
  abortCtrl = new AbortController()

  try {
    const endpoint = images.length ? '/api/v1/ai/chat/multimodal' : '/api/v1/ai/chat'

    // 查询真实系统状态注入 message (避免 LLM 编造假数据)
    let contextData = ''
    try {
      const now = new Date()
      const dateStr = now.toLocaleDateString('zh-CN') + ' ' + now.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})

      const [chRes, devRes, alarmRes] = await Promise.allSettled([
        fetch('/api/v1/channels').then(r => r.json()),
        fetch('/api/v1/devices').then(r => r.json()),
        fetch('/api/v1/alarms/history?limit=20').then(r => r.json()),
      ])

      const channels = chRes.status === 'fulfilled' ? (chRes.value.data?.channels || chRes.value.data || []) : []
      const devices = devRes.status === 'fulfilled' ? (devRes.value.data?.devices || devRes.value.data || []) : []
      const alarms = alarmRes.status === 'fulfilled'
        ? (alarmRes.value.data?.alarms || alarmRes.value.data?.items || alarmRes.value.data || [])
        : []

      if (channels.length > 0 || devices.length > 0 || alarms.length > 0) {
        contextData = `\n\n[当前系统真实数据 — 时间: ${dateStr}]\n`

        // 设备列表
        if (devices.length > 0) {
          const onlineDevs = devices.filter((d:any) => d.status === 'online').length
          contextData += `\n## 设备 (${devices.length}台, 在线${onlineDevs}台)\n`
          devices.forEach((dev:any) => {
            contextData += `- 设备名: ${dev.name || dev.id}, ID: ${dev.id}, 类型: ${dev.deviceType || '未知'}, 状态: ${dev.status || '未知'}, IP: ${dev.ip || '-'}, 厂商: ${dev.vendor || '-'}\n`
          })
        }

        // 通道列表
        if (channels.length > 0) {
          const onlineChs = channels.filter((c:any) => c.status === 'online' || c.enabled).length
          contextData += `\n## 视频监控点 (${channels.length}个, 在线${onlineChs}个)\n`
          channels.forEach((ch:any) => {
            contextData += `- 监控点名: ${ch.name || ch.channel_id}, ID: ${ch.channel_id}, 协议: ${ch.protocol || '-'}, 状态: ${ch.status || (ch.enabled ? '启用' : '禁用')}\n`
          })
        }

        // 告警统计
        if (alarms.length > 0) {
          contextData += `\n## 最近告警 (${alarms.length}条)\n`
          // 统计告警类型
          const typeCount: Record<string, number> = {}
          alarms.forEach((a:any) => {
            const t = a.alarm_type || a.type || 'unknown'
            typeCount[t] = (typeCount[t] || 0) + 1
          })
          contextData += '告警类型统计:\n'
          Object.entries(typeCount).forEach(([type, count]) => {
            contextData += `  - ${type}: ${count}次\n`
          })
          // 最近5条详情
          contextData += '最近5条:\n'
          alarms.slice(0, 5).forEach((a:any) => {
            contextData += `  - [级别${a.level || '?'}] ${a.alarm_type || a.type || '?'}: ${a.description || ''} (设备:${a.device_id || '-'})\n`
          })
        }

        contextData += '\n请严格基于以上真实数据回答用户问题。不要编造任何设备ID、设备名、数值或时间。'
      }
    } catch (e) {
      console.warn('Failed to fetch system context', e)
    }

    const body: Record<string, any> = {
      message: text + contextData,
      conversation_id: currentConvId.value,
      stream: true,
    }
    if (images.length) body.images = images

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
      body: JSON.stringify(body),
      signal: abortCtrl.signal,
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentThinkSteps: ThinkStep[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue
        try {
          const evt = JSON.parse(payload)
          handleSSEEvent(evt, currentThinkSteps)
        } catch { /* skip malformed */ }
      }
      scrollToBottom()
    }

    // 完成后，将streamingText推入messages
    if (streamingText.value) {
      messages.value.push({ role: 'assistant', content: streamingText.value })
      // [P2-2] TTS 语音播报 AI 回复
      speakText(streamingText.value)
    }
    // 更新对话标题
    if (!Array.isArray(conversations.value)) return
    const conv = conversations.value.find(c => c.id === currentConvId.value)
    if (conv && conv.title === '新对话') {
      conv.title = text.substring(0, 20) + (text.length > 20 ? '...' : '')
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      messages.value.push({ role: 'system', content: `❌ 连接失败: ${e.message}` })
    }
  } finally {
    isStreaming.value = false
    streamingText.value = ''
    abortCtrl = null
    scrollToBottom()
  }
}

function handleSSEEvent(evt: any, thinkSteps: ThinkStep[]) {
  switch (evt.type) {
    case 'thinking':
      thinkSteps.push({ text: evt.content, status: 'running' })
      messages.value.push({ role: 'thinking', content: '', steps: [...thinkSteps], running: true })
      break
    case 'thinking_done':
      if (thinkSteps.length) thinkSteps[thinkSteps.length - 1].status = 'done'
      if (thinkSteps.length) thinkSteps[thinkSteps.length - 1].duration = evt.duration
      // 更新最后的thinking消息
      const lastThink = [...messages.value].reverse().find(m => m.role === 'thinking')
      if (lastThink) { lastThink.steps = [...thinkSteps]; lastThink.running = false }
      break
    case 'tool_call':
      messages.value.push({ role: 'tool', content: '', toolName: evt.tool, args: evt.args, status: 'running' })
      break
    case 'tool_result':
      const lastTool = [...messages.value].reverse().find(m => m.role === 'tool')
      if (lastTool) { lastTool.result = evt.result; lastTool.status = evt.success ? 'success' : 'error'; lastTool.duration = evt.duration }
      break
    case 'action':
      if (evt.action_type === 'snapshot') {
        messages.value.push({
          role: 'action',
          content: '',
          actionType: 'snapshot',
          snapshotUrl: evt.snapshot_url || '',
          status: evt.success ? 'success' : 'error'
        })
        if (!evt.success && evt.error) {
          messages.value.push({ role: 'system', content: `⚠️ 截图失败: ${evt.error}` })
        }
      } else if (evt.action_type === 'subscription_preview') {
        // [FEAT subscribe-v12 2026-09-25] 后端订阅编译预览 (compile-preview 同源产物)
        messages.value.push({
          role: 'action',
          content: '',
          actionType: 'subscription_preview',
          status: 'success',
          subPreview: {
            preview: evt.preview,
            kind: evt.kind ?? '',
            need_vlm: !!evt.need_vlm,
            nl_text: evt.nl_text ?? '',
          } as CompilePreviewResult,
          subState: 'pending',
          subPhone: false,
        })
      }
      break
    case 'text':
      streamingText.value += evt.content
      break
    case 'done':
      break
  }
}

onMounted(loadConversations)
onUnmounted(() => {
  if (abortCtrl) abortCtrl.abort()
  // [P2-2] 清理语音资源
  if (recognition) { try { recognition.stop() } catch {} }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
})
</script>

<style scoped>
.ai-chat-page {
  height: calc(100vh - 80px);

  box-sizing: border-box;
}
.chat-shell {
  height: 100%;
}
.chat-shell :deep(.el-card__body) {
  height: 100%;
  padding: 0;
  box-sizing: border-box;
}
.chat-layout { display: flex; height: 100%; gap: 0; }

/* 截图样式 */
.snapshot-result { max-width: 480px; border-radius: 8px; overflow: hidden; cursor: pointer; }
.snapshot-img { width: 100%; height: auto; display: block; border-radius: 8px; border: 1px solid #dcdfe6; transition: opacity 0.2s; }
.snapshot-img:hover { opacity: 0.85; }
.snapshot-error { color: #909399; font-size: 14px; padding: 12px; }

/* [FEAT subscribe-v12 2026-09-25] 订阅预览确认卡 */
.sub-card { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 10px 14px; width: 100%; max-width: 560px; }
.sub-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.sub-card-nl { font-weight: 600; font-size: 13px; color: #1e40af; }
.sub-card-json { background: #ffffff; border: 1px solid #dcdfe6; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #303133; overflow: auto; margin: 0 0 8px; max-height: 160px; }
.sub-card-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.sub-card-label { font-size: 13px; color: #303133; }
.sub-card-hint { color: #909399; font-size: 12px; }
.sub-card-actions { display: flex; gap: 8px; margin: 8px 0 6px; }

/* 左侧对话列表 */
.chat-sidebar { width: 240px; background: #f7f8fa; border-right: 1px solid #e4e7ed; display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-header { padding: 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e4e7ed; }
.sidebar-header h3 { margin: 0; color: #303133; font-size: 16px; }
.conv-list { flex: 1; overflow-y: auto; padding: 8px; }
.conv-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; cursor: pointer; color: #606266; transition: all 0.15s; margin-bottom: 2px; }
.conv-item:hover { background: #ecf5ff; color: #303133; }
.conv-item.active { background: #d9ecff; color: #1d4ed8; }
.conv-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
.conv-del { opacity: 0; }
.conv-item:hover .conv-del { opacity: 1; }
.sidebar-footer { padding: 12px 16px; border-top: 1px solid #e4e7ed; text-align: center; }

/* 右侧主区域 */
.chat-main { flex: 1; display: flex; flex-direction: column; background: #ffffff; min-width: 0; }
.chat-toolbar { padding: 12px 20px; border-bottom: 1px solid #e4e7ed; display: flex; justify-content: space-between; align-items: center; }
.toolbar-label { display: flex; align-items: center; gap: 8px; color: #303133; font-weight: 600; }

/* 消息区 */
.chat-messages { flex: 1; overflow-y: auto; padding: 20px; scroll-behavior: smooth; }

/* 欢迎区 */
.welcome { text-align: center; padding: 60px 20px; }
.welcome-icon { display: block; width: 100px; height: 100px; margin: 0 auto 0px; object-fit: contain; }
.welcome h2 { color: #303133; margin: 0 0 8px; }
.welcome p { color: #606266; max-width: 500px; margin: 0 auto 24px; }
.quick-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }

/* 消息气泡 */
.msg-row { margin-bottom: 16px; }
.msg-bubble { display: flex; gap: 10px; max-width: 80%; }
.msg-bubble.user-bubble { margin-left: auto; flex-direction: row-reverse; }
.msg-bubble.ai-bubble { margin-right: auto; }
.msg-bubble.think-bubble { margin-right: auto; max-width: 70%; }
.msg-bubble.tool-bubble { margin-right: auto; max-width: 70%; }

.msg-avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.user-avatar { background: #dbeafe; }
.ai-avatar { background: #e0f2fe; }
.user-avatar,
.ai-avatar { border-radius: 50%; object-fit: cover; }
.think-avatar { background: #fef3c7; }
.tool-avatar { background: #dcfce7; }

.msg-content { background: #eff6ff; color: #303133; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.6; }
.user-bubble .msg-content { background: #dbeafe; }
.msg-content :deep(pre) { background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 6px; padding: 8px 12px; overflow-x: auto; font-size: 13px; margin: 8px 0; }
.msg-content :deep(code) { font-family: 'Roboto Mono', monospace; font-size: 13px; }
.msg-content :deep(strong) { color: #1A73E8; }
/* [FEAT md-render 2026-09-25] 块级渲染配套样式: 标题/表格/列表/引用/分隔线 */
.msg-content :deep(h1), .msg-content :deep(h2), .msg-content :deep(h3) { font-size: 15px; font-weight: 600; margin: 10px 0 6px; color: #1e3a8a; }
.msg-content :deep(h4), .msg-content :deep(h5), .msg-content :deep(h6) { font-size: 14px; font-weight: 600; margin: 8px 0 4px; color: #1e3a8a; }
.msg-content :deep(table) { border-collapse: collapse; margin: 8px 0; font-size: 13px; width: 100%; }
.msg-content :deep(th), .msg-content :deep(td) { border: 1px solid #dbe4f0; padding: 4px 8px; text-align: left; }
.msg-content :deep(th) { background: #eaf1fb; font-weight: 600; }
.msg-content :deep(ul), .msg-content :deep(ol) { margin: 6px 0; padding-left: 20px; }
.msg-content :deep(li) { margin: 2px 0; }
.msg-content :deep(blockquote) { margin: 6px 0; padding: 4px 10px; border-left: 3px solid #93c5fd; background: #f0f6ff; color: #475569; }
.msg-content :deep(hr) { border: none; border-top: 1px solid #dbe4f0; margin: 10px 0; }

.msg-system { text-align: center; color: #909399; font-size: 12px; padding: 4px; }

/* 思考块 */
.think-block { background: #fffbeb; border: 1px solid #f3e8a1; border-radius: 12px; padding: 10px 14px; width: 100%; }
.think-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.think-label { color: #F4B400; font-weight: 600; font-size: 13px; }
.think-dots span { animation: blink 1.4s infinite both; color: #F4B400; }
.think-dots span:nth-child(2) { animation-delay: 0.2s; }
.think-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0; } 40% { opacity: 1; } }

.think-steps { display: flex; flex-direction: column; gap: 4px; }
.think-step { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #606266; }
.think-step.done { color: #0F9D58; }
.think-step.running { color: #F4B400; }
.step-icon { width: 20px; text-align: center; }
.step-text { flex: 1; }
.step-dur { color: #666; font-family: monospace; font-size: 11px; }

/* 工具块 */
.tool-block { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 10px 14px; width: 100%; }
.tool-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.tool-name { color: #0F9D58; font-weight: 600; font-size: 13px; font-family: monospace; }
.tool-dur { color: #666; font-size: 11px; font-family: monospace; }
.tool-args, .tool-result { margin-top: 6px; }
.tool-label { font-size: 11px; color: #606266; margin-bottom: 2px; }
.tool-args pre, .tool-result pre { background: #ffffff; border: 1px solid #dcdfe6; border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #303133; overflow-x: auto; margin: 0; max-height: 120px; overflow-y: auto; }

/* 流式光标 */
.cursor-blink { animation: cursorBlink 1s step-end infinite; color: #1A73E8; }
@keyframes cursorBlink { 50% { opacity: 0; } }

/* 输入区 */
.chat-input-area { padding: 12px 20px; border-top: 1px solid #e4e7ed; background: #f7f8fa; }
.input-wrapper { display: flex; gap: 8px; align-items: flex-end; }
.input-wrapper :deep(.el-textarea__inner) { background: #ffffff; border-color: #dcdfe6; color: #303133; border-radius: 12px; }
.input-wrapper :deep(.el-button.is-circle) { margin-bottom: 4px; }
.input-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.input-hint { color: #909399; font-size: 11px; }
.input-shortcuts { display: flex; gap: 4px; flex-wrap: wrap; }

/* [FEAT smart-sub 2026-09-25] 常用一键订阅面板 */
.smart-sub-panel { background: #ffffff; border: 1px solid #dbe4f0; border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; box-shadow: 0 2px 10px rgba(26,115,230,.06); }
.smart-sub-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.smart-sub-title { font-weight: 600; font-size: 13px; color: #1e3a8a; }
.smart-sub-sub { flex: 1; color: #909399; font-size: 11px; }
.smart-sub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 6px; max-height: 200px; overflow-y: auto; }
.smart-sub-item { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border: 1px solid #e4e7ed; border-radius: 8px; cursor: pointer; background: #fafbfd; transition: border-color .15s, background .15s; }
.smart-sub-item:hover { border-color: #1A73E8; background: #f0f6ff; }
.smart-sub-item.disabled { opacity: .55; cursor: not-allowed; }
.smart-sub-item.disabled:hover { border-color: #e4e7ed; background: #fafbfd; }
.smart-sub-item.is-custom { border-style: dashed; }
.tpl-icon { font-size: 16px; flex-shrink: 0; }
.tpl-body { min-width: 0; }
.tpl-label { font-size: 13px; color: #303133; font-weight: 500; line-height: 1.3; }
.tpl-nl { font-size: 11px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 图片预览 */
.image-preview-bar { display: flex; gap: 8px; padding: 6px 0; overflow-x: auto; }
.preview-thumb-wrap { position: relative; flex-shrink: 0; }
.preview-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid #dcdfe6; }
.thumb-remove { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; min-width: 0; font-size: 10px; padding: 0; }
</style>
