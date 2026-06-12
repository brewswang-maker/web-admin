/**
 * 华盾AI智能视频盒子 v7.0 - AI 对话 API
 * api/ai.ts — AI助手、对话、Agent调用相关接口
 */

import { aiHttp, BASE_URL } from './http'
import { getAuthToken } from '@/utils/auth'
import type { ApiResponse } from '@/types/common'

/** 对话消息 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }>
  thinking?: string
}

/** 对话请求 */
export interface ChatRequest {
  message: string
  sessionId?: string
  context?: {
    deviceId?: string
    alarmId?: string
    projectId?: string
  }
  stream?: boolean
}

/** 对话响应 */
export interface ChatResponse {
  sessionId: string
  message: ChatMessage
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/** 对话历史 */
export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

/** Agent 调用结果 */
export interface AgentCallResult {
  agentName: string
  agentType: string
  input: string
  output: string
  confidence: number
  latency: number
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }>
}

export const aiApi = {
  /** 发送对话消息 */
  chat(data: ChatRequest) {
    return aiHttp.post<ApiResponse<ChatResponse>>('/chat', data)
  },

  /**
   * 流式对话（SSE）— Phase 13 P0 #3 修复:
   * 用 fetch + ReadableStream 替代 EventSource,可附加 Authorization header
   * 返回 AbortController,调用方 .abort() 即可取消
   */
  chatStream(
    data: ChatRequest,
    onMessage: (payload: { type: string; content: string; [k: string]: unknown }) => void,
    onError?: (err: Error) => void,
    onOpen?: () => void
  ): AbortController {
    const controller = new AbortController()
    const token = getAuthToken()
    const baseURL = aiHttp.defaults.baseURL || `${BASE_URL}/ai`
    const url = typeof baseURL === 'string' ? `${baseURL}/chat` : `${BASE_URL}/ai/chat`

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...data, stream: true }),
      signal: controller.signal,
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(`SSE ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`)
        }
        if (!resp.body) {
          throw new Error('SSE response body is empty')
        }
        onOpen?.()
        const reader = resp.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buf = ''
        // 读取流直到关闭
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          // SSE event 边界: \n\n
          const blocks = buf.split('\n\n')
          buf = blocks.pop() ?? ''
          for (const block of blocks) {
            const dataLine = block
              .split('\n')
              .map((l) => l.trim())
              .find((l) => l.startsWith('data: '))
            if (!dataLine) continue
            const raw = dataLine.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const payload = JSON.parse(raw)
              onMessage(payload)
            } catch {
              // 跳过非 JSON 的 SSE 帧 (e.g. 心跳)
            }
          }
        }
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        onError?.(err instanceof Error ? err : new Error(String(err)))
      })

    return controller
  },

  /** 获取对话历史 */
  getSessions(params?: { page?: number; pageSize?: number }) {
    return aiHttp.get<ApiResponse<ChatSession[]>>('/sessions', { params })
  },

  /** 获取单个对话详情 */
  getSession(sessionId: string) {
    return aiHttp.get<ApiResponse<ChatSession>>(`/sessions/${sessionId}`)
  },

  /** 删除对话 */
  deleteSession(sessionId: string) {
    return aiHttp.delete<ApiResponse<void>>(`/sessions/${sessionId}`)
  },

  /** 获取推荐问题 */
  getSuggestions() {
    return aiHttp.get<ApiResponse<string[]>>('/suggestions')
  },

  /** 调用Agent */
  invokeAgent(agentName: string, input: string, context?: Record<string, unknown>) {
    return aiHttp.post<ApiResponse<AgentCallResult>>('/agent/invoke', { agentName, input, context })
  },

  /** 获取Agent列表 */
  getAgents() {
    return aiHttp.get<ApiResponse<Array<{ name: string; type: string; description: string; status: string }>>>('/agents')
  },

  /** 分析告警（快捷操作） */
  analyzeAlarm(alarmId: string) {
    return aiHttp.post<ApiResponse<AgentCallResult>>('/analyze/alarm', { alarmId })
  },

  /** 生成安全报告 */
  generateReport(params: { period: '7d' | '30d' | '90d'; projectId?: string }) {
    return aiHttp.post<ApiResponse<{ reportId: string; url: string }>>('/report/generate', params)
  },

  /** VLM 视觉大模型 - 图片分析 */
  analyzeImage(data: { imageBase64: string; prompt?: string; model?: string }) {
    return aiHttp.post<ApiResponse<ChatResponse>>('/vlm/analyze', data)
  },

  /** 多模态对话(文本+图片) */
  multimodalChat(data: ChatRequest & { images?: string[] }) {
    return aiHttp.post<ApiResponse<ChatResponse>>('/chat/multimodal', data)
  },

  /** 获取可用模型列表(TinyLLM / VLM / MultiModal) */
  getModels() {
    return aiHttp.get<ApiResponse<Array<{ id: string; name: string; type: string; status: string }>>>('/models')
  }
}
