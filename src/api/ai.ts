/**
 * 华盾AI智能视频盒子 v7.0 - AI 对话 API
 * api/ai.ts — AI助手、对话、Agent调用相关接口
 */

import { aiHttp } from './http'
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

  /** 流式对话（SSE） */
  chatStream(data: ChatRequest): EventSource {
    const url = `${aiHttp.defaults.baseURL}/chat/stream`
    const es = new EventSource(url)
    return es
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
  }
}
