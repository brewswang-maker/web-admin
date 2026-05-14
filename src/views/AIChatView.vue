<template>
  <div class="ai-chat-page">
    <div class="chat-layout">
      <!-- 左侧: 对话历史列表 -->
      <div class="session-sidebar" v-show="showSidebar">
        <div class="sidebar-header">
          <h3>💬 对话历史</h3>
          <el-button type="primary" size="small" @click="newSession" :icon="Plus">新对话</el-button>
        </div>
        <div class="session-list">
          <div
            v-for="s in sessions" :key="s.id"
            :class="['session-item', { active: currentSessionId === s.id }]"
            @click="switchSession(s.id)"
          >
            <div class="session-title">{{ s.title || '新对话' }}</div>
            <div class="session-meta">{{ formatTime(s.updatedAt) }}</div>
            <el-button class="session-del" link size="small" @click.stop="deleteSession(s.id)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div v-if="sessions.length === 0" class="empty-sessions">暂无对话记录</div>
        </div>
      </div>

      <!-- 右侧: 对话主区域 -->
      <div class="chat-main">
        <!-- 顶部工具栏 -->
        <div class="chat-toolbar">
          <el-button link @click="showSidebar = !showSidebar">
            <el-icon><ChatDotRound /></el-icon>
          </el-button>
          <span class="toolbar-title">华盾AI助手 · 灵犀Agent</span>
          <div class="toolbar-right">
            <el-tag v-if="agentStatus" :type="agentStatus === 'active' ? 'success' : 'info'" size="small" effect="plain">
              {{ agentStatus === 'active' ? 'Agent在线' : 'Agent离线' }}
            </el-tag>
            <el-dropdown trigger="click">
              <el-button link><el-icon><MoreFilled /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="clearCurrentChat">清空当前对话</el-dropdown-item>
                  <el-dropdown-item @click="exportChat">导出对话记录</el-dropdown-item>
                  <el-dropdown-item @click="toggleThinking" :divided="true">
                    {{ showThinking ? '隐藏思考过程' : '显示思考过程' }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <!-- 消息区域 -->
        <div class="chat-messages" ref="chatContainer">
          <!-- 欢迎区域 -->
          <div v-if="messages.length === 0" class="welcome-section">
            <div class="welcome-icon">🤖</div>
            <h2 class="welcome-title">华盾AI助手</h2>
            <p class="welcome-desc">基于灵犀Agent架构，融合感知、研判、决策、执行四环认知</p>
            <div class="capability-grid">
              <div class="cap-item" v-for="cap in capabilities" :key="cap.icon">
                <span class="cap-icon">{{ cap.icon }}</span>
                <span class="cap-label">{{ cap.label }}</span>
              </div>
            </div>
          </div>

          <!-- 消息列表 -->
          <div v-for="(msg, idx) in messages" :key="idx" :class="['message-row', msg.role]">
            <div class="avatar-wrap">
              <el-avatar :size="36" :style="{ background: msg.role === 'user' ? '#1890ff' : '#722ed1' }">
                {{ msg.role === 'user' ? '我' : 'AI' }}
              </el-avatar>
            </div>
            <div class="msg-body">
              <!-- 思考过程 (可折叠) -->
              <div v-if="msg.thinking && showThinking" class="thinking-block">
                <el-collapse>
                  <el-collapse-item title="💭 思考过程">
                    <div class="thinking-content" v-html="formatThinking(msg.thinking)"></div>
                  </el-collapse-item>
                </el-collapse>
              </div>
              <!-- 消息正文 -->
              <div class="msg-content" v-html="formatContent(msg.content)"></div>
              <!-- Agent Tool Calls -->
              <div v-if="msg.toolCalls && msg.toolCalls.length" class="tool-calls">
                <div class="tool-call-item" v-for="(tc, tIdx) in msg.toolCalls" :key="tIdx">
                  <el-tag type="warning" size="small" effect="plain">🔧 {{ tc.name }}</el-tag>
                  <span class="tool-result" v-if="tc.result">
                    → {{ typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result).slice(0, 100) }}
                  </span>
                </div>
              </div>
              <!-- 置信度 -->
              <div v-if="msg.confidence" class="confidence-bar">
                <el-progress
                  :percentage="Math.round(msg.confidence * 100)"
                  :stroke-width="4"
                  :color="msg.confidence > 0.8 ? '#52c41a' : msg.confidence > 0.5 ? '#faad14' : '#ff4d4f'"
                />
                <span class="confidence-label">置信度 {{ Math.round(msg.confidence * 100) }}%</span>
              </div>
              <div class="msg-time">{{ msg.time }}</div>
            </div>
          </div>

          <!-- 加载中 -->
          <div v-if="loading" class="message-row assistant">
            <div class="avatar-wrap">
              <el-avatar :size="36" :style="{ background: '#722ed1' }">AI</el-avatar>
            </div>
            <div class="msg-body">
              <div class="typing-indicator">
                <span></span><span></span><span></span>
              </div>
              <div v-if="loadingStep" class="loading-step">{{ loadingStep }}</div>
            </div>
          </div>
        </div>

        <!-- 推荐问题 -->
        <div v-if="messages.length === 0 && suggestions.length" class="suggestions-bar">
          <div
            v-for="q in suggestions" :key="q"
            class="suggestion-chip"
            @click="input = q; sendMessage()"
          >
            {{ q }}
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="chat-input-area">
          <div class="input-row">
            <el-input
              v-model="input"
              placeholder="询问华盾AI助手... (如：分析最近告警趋势、哪个设备离线了)"
              @keyup.enter.exact="sendMessage"
              :rows="2"
              type="textarea"
              resize="none"
              :disabled="loading"
            />
            <div class="input-actions">
              <el-tooltip content="语音输入" placement="top">
                <el-button :icon="Microphone" circle @click="voiceInput" />
              </el-tooltip>
              <el-button
                type="primary"
                @click="sendMessage"
                :loading="loading"
                :disabled="!input.trim()"
                size="large"
              >
                发送
              </el-button>
            </div>
          </div>
          <div class="input-tips">
            <span>提示: 可关联上下文 — 输入"查看设备xxx的告警"可自动调用感知Agent</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, ChatDotRound, MoreFilled, Microphone } from '@element-plus/icons-vue'
import { aiApi, type ChatMessage, type ChatSession, type AgentCallResult } from '@/api/ai'
import { useWebSocket } from '@/composables/useWebSocket'

// ===== 状态 =====
const input = ref('')
const messages = ref<Array<ChatMessage & { time: string; confidence?: number }>>([])
const sessions = ref<ChatSession[]>([])
const currentSessionId = ref('')
const loading = ref(false)
const loadingStep = ref('')
const showSidebar = ref(true)
const showThinking = ref(true)
const agentStatus = ref<'active' | 'idle' | 'offline'>('active')
const chatContainer = ref<HTMLElement>()

const suggestions = ref([
  '最近24小时告警统计',
  '哪些设备离线了？',
  '帮我优化周界检测策略',
  '安全评分最低的区域是哪个？',
  '分析本周入侵告警趋势',
  '推荐摄像头布防方案'
])

const capabilities = [
  { icon: '🛡️', label: '安全态势分析' },
  { icon: '📊', label: '告警趋势查询' },
  { icon: '📹', label: '设备状态监控' },
  { icon: '🧠', label: '算法策略优化' },
  { icon: '📋', label: '报告自动生成' },
  { icon: '🔗', label: 'IoT联动控制' },
]

let wsUnsubscribe: (() => void) | null = null

// ===== WebSocket 实时推送 =====
const { subscribe } = useWebSocket()

onMounted(async () => {
  await loadSessions()
  await loadSuggestions()

  // 订阅Agent状态更新
  wsUnsubscribe = subscribe('agent_status', (data: { status: string }) => {
    agentStatus.value = data.status as any
  })
})

onUnmounted(() => {
  wsUnsubscribe?.()
})

// ===== 对话管理 =====
async function loadSessions() {
  try {
    const res = await aiApi.getSessions({ page: 1, pageSize: 50 })
    sessions.value = res.data?.data || []
    // 自动选择最新的会话
    if (sessions.value.length > 0 && !currentSessionId.value) {
      await switchSession(sessions.value[0].id)
    }
  } catch (e) {
    console.warn('[AI] 加载会话列表失败:', e)
  }
}

async function newSession() {
  try {
    const res = await aiApi.chat({ message: '' })
    const sessionId = res.data?.data?.sessionId
    if (sessionId) {
      currentSessionId.value = sessionId
      messages.value = []
      await loadSessions()
    }
  } catch (e) {
    // 创建新对话失败时使用本地对话
    currentSessionId.value = `local_${Date.now()}`
    messages.value = []
  }
}

async function switchSession(sessionId: string) {
  currentSessionId.value = sessionId
  try {
    const res = await aiApi.getSession(sessionId)
    const session = res.data?.data
    if (session?.messages) {
      messages.value = session.messages.map(m => ({
        ...m,
        time: formatTime(m.timestamp)
      }))
    }
  } catch (e) {
    console.warn('[AI] 加载会话失败:', e)
    messages.value = []
  }
  nextTick(scrollToBottom)
}

async function deleteSession(sessionId: string) {
  try {
    await ElMessageBox.confirm('确认删除此对话？', '提示', { type: 'warning' })
    await aiApi.deleteSession(sessionId)
    sessions.value = sessions.value.filter(s => s.id !== sessionId)
    if (currentSessionId.value === sessionId) {
      currentSessionId.value = ''
      messages.value = []
    }
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

async function loadSuggestions() {
  try {
    const res = await aiApi.getSuggestions()
    const s = res.data?.data
    if (Array.isArray(s) && s.length > 0) {
      suggestions.value = s
    }
  } catch { /* 使用默认建议 */ }
}

// ===== 发送消息 =====
async function sendMessage() {
  const text = input.value.trim()
  if (!text || loading.value) return

  const now = formatTime(new Date().toISOString())

  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
    time: now
  })
  input.value = ''

  nextTick(scrollToBottom)

  loading.value = true
  loadingStep.value = '🧠 灵犀Agent思考中...'

  try {
    // 调用真实AI API
    const res = await aiApi.chat({
      message: text,
      sessionId: currentSessionId.value || undefined,
      stream: false,
      context: {
        projectId: '',
        deviceId: '',
        alarmId: ''
      }
    })

    const chatData = res.data?.data
    if (chatData) {
      currentSessionId.value = chatData.sessionId || currentSessionId.value

      // 添加AI回复
      const aiMsg: ChatMessage & { time: string; confidence?: number } = {
        role: 'assistant',
        content: chatData.message?.content || '暂无法回答',
        timestamp: chatData.message?.timestamp || new Date().toISOString(),
        time: formatTime(chatData.message?.timestamp || new Date().toISOString()),
        toolCalls: chatData.message?.toolCalls,
        thinking: chatData.message?.thinking,
        confidence: (chatData as any)?.confidence
      }
      messages.value.push(aiMsg)
    }

    // 刷新会话列表
    loadSessions()
  } catch (error: any) {
    // 降级处理: Agent离线时提供基础回复
    const errMsg = error?.response?.data?.message || error?.message || '未知错误'

    if (error?.response?.status === 503) {
      // 服务不可用 - Agent离线
      agentStatus.value = 'offline'
      messages.value.push({
        role: 'assistant',
        content: `⚠️ AI服务暂时不可用，请稍后重试。\n\n错误信息: ${errMsg}\n\n您可以先使用其他功能查看设备和告警信息。`,
        timestamp: new Date().toISOString(),
        time: formatTime(new Date().toISOString())
      })
    } else {
      messages.value.push({
        role: 'assistant',
        content: `❌ 请求失败: ${errMsg}`,
        timestamp: new Date().toISOString(),
        time: formatTime(new Date().toISOString())
      })
    }
  } finally {
    loading.value = false
    loadingStep.value = ''
    nextTick(scrollToBottom)
  }
}

// ===== 流式对话 (SSE) =====
function startStreamChat(text: string) {
  loadingStep.value = '📡 连接Agent...'

  const eventSource = aiApi.chatStream({
    message: text,
    sessionId: currentSessionId.value || undefined,
    stream: true
  })

  let fullContent = ''
  let thinkingContent = ''

  eventSource.addEventListener('message', (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.type === 'thinking') {
        thinkingContent += data.content
        loadingStep.value = `💭 ${data.content.slice(0, 50)}...`
      } else if (data.type === 'content') {
        fullContent += data.content
        // 实时更新最后一条消息
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg?.role === 'assistant') {
          lastMsg.content = fullContent
        } else {
          messages.value.push({
            role: 'assistant',
            content: fullContent,
            timestamp: new Date().toISOString(),
            time: formatTime(new Date().toISOString()),
            thinking: thinkingContent
          })
        }
      } else if (data.type === 'tool_call') {
        loadingStep.value = `🔧 调用 ${data.name}...`
      } else if (data.type === 'done') {
        eventSource.close()
        loading.value = false
        loadingStep.value = ''
      }
    } catch {
      // 忽略解析错误
    }
  })

  eventSource.addEventListener('error', () => {
    eventSource.close()
    loading.value = false
    loadingStep.value = ''
  })
}

// ===== 辅助方法 =====
function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

function formatTime(ts: string): string {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts
  }
}

function formatContent(content: string): string {
  if (!content) return ''
  // 简单的Markdown渲染
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>')
}

function formatThinking(thinking: string): string {
  if (!thinking) return ''
  return thinking.replace(/\n/g, '<br/>')
}

function clearCurrentChat() {
  messages.value = []
  currentSessionId.value = ''
}

function exportChat() {
  const content = messages.value.map(m => `[${m.time}] ${m.role === 'user' ? '我' : 'AI'}: ${m.content}`).join('\n\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `华盾AI对话_${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function toggleThinking() {
  showThinking.value = !showThinking.value
}

function voiceInput() {
  // 语音输入预留接口 - 需要浏览器Web Speech API支持
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    ElMessage.info('语音输入功能开发中...')
  } else {
    ElMessage.warning('当前浏览器不支持语音输入')
  }
}
</script>

<style scoped>
.ai-chat-page {
  height: calc(100vh - 120px);
  overflow: hidden;
}

.chat-layout {
  display: flex;
  height: 100%;
  gap: 0;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}

/* 左侧会话列表 */
.session-sidebar {
  width: 260px;
  border-right: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
}
.sidebar-header h3 { margin: 0; font-size: 15px; }
.session-list { flex: 1; overflow-y: auto; }
.session-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #fafafa;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  transition: background 0.2s;
}
.session-item:hover { background: #f5f5f5; }
.session-item.active { background: #e6f7ff; border-left: 3px solid #1890ff; }
.session-title { flex: 1; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.session-meta { font-size: 12px; color: #999; }
.session-del { position: absolute; right: 8px; opacity: 0; transition: opacity 0.2s; }
.session-item:hover .session-del { opacity: 1; }
.empty-sessions { padding: 24px; text-align: center; color: #999; font-size: 13px; }

/* 右侧主区域 */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 顶部工具栏 */
.chat-toolbar {
  padding: 12px 20px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  gap: 12px;
}
.toolbar-title { font-weight: 600; font-size: 15px; }
.toolbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }

/* 消息区域 */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* 欢迎区域 */
.welcome-section {
  text-align: center;
  padding: 60px 40px;
}
.welcome-icon { font-size: 64px; margin-bottom: 16px; }
.welcome-title { font-size: 24px; font-weight: 700; margin: 0 0 8px; }
.welcome-desc { color: #666; margin-bottom: 32px; }
.capability-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  max-width: 480px;
  margin: 0 auto;
}
.cap-item {
  padding: 12px;
  background: #fafafa;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.cap-icon { font-size: 20px; }

/* 消息行 */
.message-row {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.message-row.user { flex-direction: row-reverse; }
.msg-body { max-width: 70%; min-width: 60px; }
.msg-content {
  padding: 12px 16px;
  border-radius: 12px;
  background: #f5f6f7;
  line-height: 1.7;
  font-size: 14px;
  word-break: break-word;
}
.message-row.user .msg-content {
  background: #1890ff;
  color: #fff;
}
.message-row.user .msg-content :deep(code) {
  background: rgba(255,255,255,0.2);
  padding: 2px 4px;
  border-radius: 3px;
}
.msg-time { font-size: 11px; color: #8c8c8c; margin-top: 4px; }

/* 思考过程 */
.thinking-block { margin-bottom: 8px; }
.thinking-block :deep(.el-collapse-item__header) { font-size: 13px; color: #999; }
.thinking-content { font-size: 13px; color: #666; line-height: 1.6; background: #fffbe6; padding: 8px 12px; border-radius: 6px; }

/* Tool Calls */
.tool-calls { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.tool-call-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.tool-result { color: #666; font-size: 12px; }

/* 置信度 */
.confidence-bar { margin-top: 8px; display: flex; align-items: center; gap: 8px; }
.confidence-bar :deep(.el-progress) { flex: 1; }
.confidence-label { font-size: 12px; color: #999; }

/* 加载动画 */
.typing-indicator {
  display: flex;
  gap: 6px;
  padding: 16px;
}
.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #722ed1;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}
.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}
.loading-step { font-size: 12px; color: #999; margin-top: 4px; }

/* 推荐问题 */
.suggestions-bar {
  padding: 8px 20px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px solid #f5f5f5;
}
.suggestion-chip {
  padding: 6px 14px;
  background: #f0f5ff;
  border: 1px solid #d6e4ff;
  border-radius: 16px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.suggestion-chip:hover {
  background: #e6f7ff;
  border-color: #91d5ff;
}

/* 输入区域 */
.chat-input-area {
  padding: 16px 20px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}
.input-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
.input-row :deep(.el-textarea) { flex: 1; }
.input-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.input-tips {
  margin-top: 6px;
  font-size: 12px;
  color: #bfbfbf;
}
</style>
