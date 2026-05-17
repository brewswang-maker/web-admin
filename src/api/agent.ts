/**
 * Agent API — MACSA智能体状态管理
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

export interface AgentInfo {
  id: string
  name: string
  type: string
  status: 'active' | 'idle' | 'error'
  lastActive: string
  metrics: {
    tasksCompleted: number
    avgResponseTime: number
    successRate: number
  }
}

export interface AgentStatus {
  orchestrator: string
  activeAgents: number
  totalTasks: number
  uptime: number
}

const agentApi = {
  /** 所有Agent列表 */
  getAgents() {
    return http.get<ApiResponse<AgentInfo[]>>('/agent/agents')
  },

  /** Agent系统状态 */
  getStatus() {
    return http.get<ApiResponse<AgentStatus>>('/agent/status')
  },

  /** Agent能力查询 */
  query(agentId: string, input: string, context?: Record<string, unknown>) {
    return http.post<ApiResponse<{ output: string; executionTime: number }>>('/agent/query', {
      agentId,
      input,
      context
    })
  }
}

export default agentApi
