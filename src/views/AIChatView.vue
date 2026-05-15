<template>
  <div class="ai-chat-page">
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
            <div class="welcome-icon">🛡️</div>
            <h2>华盾AI安全助手</h2>
            <p>基于MACSA五智能体架构，融合感知、研判、决策、执行、元认知五环认知</p>
            <div class="quick-actions">
              <el-button v-for="qa in quickActions" :key="qa.text" @click="sendQuickAction(qa.prompt)">
                {{ qa.icon }} {{ qa.text }}
              </el-button>
            </div>
          </div>

          <!-- 消息列表 -->
          <div v-for="(msg, idx) in messages" :key="idx" :class="['msg-row', msg.role]">
            <!-- 用户消息 -->
            <div v-if="msg.role === 'user'" class="msg-bubble user-bubble">
              <div class="msg-avatar user-avatar">👤</div>
              <div class="msg-content">{{ msg.content }}</div>
            </div>

            <!-- AI文本回复 -->
            <div v-else-if="msg.role === 'assistant'" class="msg-bubble ai-bubble">
              <div class="msg-avatar ai-avatar">🤖</div>
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

            <!-- 系统消息 -->
            <div v-else-if="msg.role === 'system'" class="msg-system">
              <span>{{ msg.content }}</span>
            </div>
          </div>

          <!-- 正在输入指示 -->
          <div v-if="isStreaming" class="msg-row assistant">
            <div class="msg-bubble ai-bubble">
              <div class="msg-avatar ai-avatar">🤖</div>
              <div class="msg-content streaming">
                <span v-html="renderMarkdown(streamingText)"></span>
                <span class="cursor-blink">▊</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 输入区 -->
        <div class="chat-input-area">
          <div class="input-wrapper">
            <el-input v-model="inputText" type="textarea" :rows="2"
              placeholder="输入您的问题，如：帮我检查3号厂区的安全状况..."
              @keydown.enter.exact.prevent="sendMessage"
              :disabled="isStreaming" resize="none" />
            <el-button type="primary" :icon="Promotion" circle
              @click="sendMessage" :disabled="!inputText.trim() || isStreaming" />
          </div>
          <div class="input-footer">
            <span class="input-hint">Enter发送 · Shift+Enter换行</span>
            <div class="input-shortcuts">
              <el-button size="small" text v-for="qa in quickActions.slice(0,3)" :key="qa.text"
                @click="sendQuickAction(qa.prompt)">{{ qa.text }}</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, onUnmounted } from 'vue'
import { http } from '@/api/http'
import { ElMessage } from 'element-plus'
import { Promotion } from '@element-plus/icons-vue'

interface ThinkStep { text: string; status: 'pending' | 'running' | 'done'; duration?: number }
interface ChatMessage {
  role: 'user' | 'assistant' | 'thinking' | 'tool' | 'system'
  content: string
  toolName?: string
  args?: any
  result?: any
  status?: string
  duration?: number
  steps?: ThinkStep[]
  running?: boolean
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

const quickActions = [
  { icon: '📊', text: '今日报告', prompt: '帮我生成今日安全报告' },
  { icon: '🔍', text: '设备巡检', prompt: '帮我检查所有设备的在线状态和运行情况' },
  { icon: '⚡', text: '策略优化', prompt: '分析最近的告警数据，给出安全策略优化建议' },
  { icon: '📈', text: '趋势分析', prompt: '分析最近7天的告警趋势，识别高风险时段' },
]

let abortCtrl: AbortController | null = null

function scrollToBottom() {
  nextTick(() => {
    if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight
  })
}

function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

function formatJson(obj: any): string {
  try { return JSON.stringify(obj, null, 2) } catch { return String(obj) }
}

async function loadConversations() {
  try {
    const { data } = await http.get('/api/v1/ai/conversations')
    conversations.value = data?.data || data || []
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
  // TODO: 从后端加载历史消息
  messages.value = []
}

async function deleteConversation(id: string) {
  try { await http.delete(`/api/v1/ai/conversations/${id}`) } catch { /* ignore */ }
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

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  scrollToBottom()

  isStreaming.value = true
  streamingText.value = ''
  abortCtrl = new AbortController()

  try {
    const response = await fetch('/api/v1/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
      body: JSON.stringify({ message: text, conversation_id: currentConvId.value, stream: true }),
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
    }
    // 更新对话标题
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
    case 'text':
      streamingText.value += evt.content
      break
    case 'done':
      break
  }
}

onMounted(loadConversations)
onUnmounted(() => { if (abortCtrl) abortCtrl.abort() })
</script>

<style scoped>
.ai-chat-page { height: calc(100vh - 80px); }
.chat-layout { display: flex; height: 100%; gap: 0; }

/* 左侧对话列表 */
.chat-sidebar { width: 240px; background: #252830; border-right: 1px solid #3C4043; display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-header { padding: 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #3C4043; }
.sidebar-header h3 { margin: 0; color: #E8EAED; font-size: 16px; }
.conv-list { flex: 1; overflow-y: auto; padding: 8px; }
.conv-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; cursor: pointer; color: #9AA0A6; transition: all 0.15s; margin-bottom: 2px; }
.conv-item:hover { background: #2D3039; color: #E8EAED; }
.conv-item.active { background: #1E3A5F; color: #E8EAED; }
.conv-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
.conv-del { opacity: 0; }
.conv-item:hover .conv-del { opacity: 1; }
.sidebar-footer { padding: 12px 16px; border-top: 1px solid #3C4043; text-align: center; }

/* 右侧主区域 */
.chat-main { flex: 1; display: flex; flex-direction: column; background: #1A1D23; min-width: 0; }
.chat-toolbar { padding: 12px 20px; border-bottom: 1px solid #3C4043; display: flex; justify-content: space-between; align-items: center; }
.toolbar-label { display: flex; align-items: center; gap: 8px; color: #E8EAED; font-weight: 600; }

/* 消息区 */
.chat-messages { flex: 1; overflow-y: auto; padding: 20px; scroll-behavior: smooth; }

/* 欢迎区 */
.welcome { text-align: center; padding: 60px 20px; }
.welcome-icon { font-size: 48px; margin-bottom: 16px; }
.welcome h2 { color: #E8EAED; margin: 0 0 8px; }
.welcome p { color: #9AA0A6; max-width: 500px; margin: 0 auto 24px; }
.quick-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }

/* 消息气泡 */
.msg-row { margin-bottom: 16px; }
.msg-bubble { display: flex; gap: 10px; max-width: 80%; }
.msg-bubble.user-bubble { margin-left: auto; flex-direction: row-reverse; }
.msg-bubble.ai-bubble { margin-right: auto; }
.msg-bubble.think-bubble { margin-right: auto; max-width: 70%; }
.msg-bubble.tool-bubble { margin-right: auto; max-width: 70%; }

.msg-avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.user-avatar { background: #0D47A1; }
.ai-avatar { background: #1E3A5F; }
.think-avatar { background: #3C4043; }
.tool-avatar { background: #2D3039; }

.msg-content { background: #1E3A5F; color: #E8EAED; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.6; }
.user-bubble .msg-content { background: #0D47A1; }
.msg-content :deep(pre) { background: #1A1D23; border-radius: 6px; padding: 8px 12px; overflow-x: auto; font-size: 13px; margin: 8px 0; }
.msg-content :deep(code) { font-family: 'Roboto Mono', monospace; font-size: 13px; }
.msg-content :deep(strong) { color: #1A73E8; }

.msg-system { text-align: center; color: #9AA0A6; font-size: 12px; padding: 4px; }

/* 思考块 */
.think-block { background: #2D3039; border-radius: 12px; padding: 10px 14px; width: 100%; }
.think-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.think-label { color: #F4B400; font-weight: 600; font-size: 13px; }
.think-dots span { animation: blink 1.4s infinite both; color: #F4B400; }
.think-dots span:nth-child(2) { animation-delay: 0.2s; }
.think-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0; } 40% { opacity: 1; } }

.think-steps { display: flex; flex-direction: column; gap: 4px; }
.think-step { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #9AA0A6; }
.think-step.done { color: #0F9D58; }
.think-step.running { color: #F4B400; }
.step-icon { width: 20px; text-align: center; }
.step-text { flex: 1; }
.step-dur { color: #666; font-family: monospace; font-size: 11px; }

/* 工具块 */
.tool-block { background: #2D3039; border-radius: 12px; padding: 10px 14px; width: 100%; }
.tool-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.tool-name { color: #0F9D58; font-weight: 600; font-size: 13px; font-family: monospace; }
.tool-dur { color: #666; font-size: 11px; font-family: monospace; }
.tool-args, .tool-result { margin-top: 6px; }
.tool-label { font-size: 11px; color: #9AA0A6; margin-bottom: 2px; }
.tool-args pre, .tool-result pre { background: #1A1D23; border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #E8EAED; overflow-x: auto; margin: 0; max-height: 120px; overflow-y: auto; }

/* 流式光标 */
.cursor-blink { animation: cursorBlink 1s step-end infinite; color: #1A73E8; }
@keyframes cursorBlink { 50% { opacity: 0; } }

/* 输入区 */
.chat-input-area { padding: 12px 20px; border-top: 1px solid #3C4043; background: #252830; }
.input-wrapper { display: flex; gap: 8px; align-items: flex-end; }
.input-wrapper :deep(.el-textarea__inner) { background: #1A1D23; border-color: #3C4043; color: #E8EAED; border-radius: 12px; }
.input-wrapper :deep(.el-button.is-circle) { margin-bottom: 4px; }
.input-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.input-hint { color: #666; font-size: 11px; }
.input-shortcuts { display: flex; gap: 4px; }
.input-shortcuts .el-button { color: #9AA0A6; font-size: 12px; }

/* 全局暗色覆盖 */
:deep(.el-card) { background: #252830; border-color: #3C4043; color: #E8EAED; }
</style>
