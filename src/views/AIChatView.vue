<template>
  <div class="ai-chat-page">
    <el-card class="chat-container">
      <div class="chat-messages" ref="chatContainer">
        <div v-for="(msg, idx) in messages" :key="idx" :class="['message', msg.role]">
          <el-avatar :icon="msg.role === 'user' ? 'UserFilled' : 'Cpu'" :size="32" />
          <div class="message-content">
            <div class="message-text">{{ msg.content }}</div>
            <div class="message-time">{{ msg.time }}</div>
          </div>
        </div>
      </div>
      <div class="chat-input">
        <el-input v-model="input" placeholder="询问华盾AI助手... (如：分析最近告警趋势)"
          @keyup.enter="sendMessage" :rows="2" type="textarea">
          <template #append>
            <el-button @click="sendMessage" type="primary" :disabled="!input.trim()">发送</el-button>
          </template>
        </el-input>
        <div class="quick-actions">
          <el-tag v-for="q in quickQuestions" :key="q" class="quick-tag" @click="input = q; sendMessage()">
            {{ q }}
          </el-tag>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
  time: string
}

const input = ref('')
const messages = ref<Message[]>([
  { role: 'assistant', content: '您好！我是华盾AI助手。我可以帮您：\n• 分析告警趋势\n• 查询设备状态\n• 推荐算法配置\n• 生成安全报告\n• 检索历史事件\n\n请问有什么可以帮您？', time: '14:00' }
])
const chatContainer = ref<HTMLElement>()

const quickQuestions = ['最近24小时告警统计', '哪些设备离线了？', '帮我优化周界检测策略']

function sendMessage() {
  const text = input.value.trim()
  if (!text) return

  const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  messages.value.push({ role: 'user', content: text, time: now })
  input.value = ''

  // 模拟AI回复
  setTimeout(() => {
    messages.value.push({
      role: 'assistant',
      content: `收到您的问题：「${text}」\n\n[记忆检索] 查询工作记忆(5min)→情景记忆(向量)→语义记忆(知识图谱)\n[推理] 基于Hermes Agent分析中...\n\n建议：查看详细报告请切换到相应页面。`,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    })
    nextTick(() => {
      if (chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight
      }
    })
  }, 1000)
}
</script>

<style scoped>
.ai-chat-page { max-width: 900px; height: calc(100vh - 140px); }
.chat-container { height: 100%; display: flex; flex-direction: column; }
.chat-messages { flex: 1; overflow-y: auto; padding: 16px; }
.message { display: flex; gap: 12px; margin-bottom: 20px; }
.message.user { flex-direction: row-reverse; }
.message-content { max-width: 70%; }
.message-text { padding: 12px 16px; border-radius: 12px; background: #f0f2f5; white-space: pre-wrap; line-height: 1.6; }
.message.user .message-text { background: #1890ff; color: #fff; }
.message-time { font-size: 12px; color: #8c8c8c; margin-top: 4px; }
.chat-input { padding: 16px; border-top: 1px solid #f0f0f0; }
.quick-actions { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
.quick-tag { cursor: pointer; }
</style>
