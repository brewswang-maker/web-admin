/**
 * 华盾AI智能视频盒子 v7.0 - 联邦学习 API
 * api/federation.ts — 联邦训练任务、隐私保护、贡献度相关接口
 */

import { federationHttp } from './http'
import type { ApiResponse } from '@/types/common'

/** 联邦任务状态 */
export type FederationTaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed'

/** 联邦学习状态 */
export interface FederationStatus {
  currentRound: number
  totalRounds: number
  participatingBoxes: number
  totalBoxes: number
  currentAccuracy: number
  bestAccuracy: number
  privacyBudget: number
  privacyBudgetTotal: number
  secAggEnabled: boolean
  gradientEncryptionEnabled: boolean
  status: FederationTaskStatus
}

/** 训练任务 */
export interface FederationTask {
  id: string
  name: string
  modelType: string
  currentRound: number
  totalRounds: number
  accuracy: number
  status: FederationTaskStatus
  createdAt: string
  startedAt: string
  completedAt: string
  participatingBoxes: number
  config: {
    learningRate: number
    batchSize: number
    minBoxes: number
    dpEpsilon: number
    dpDelta: number
  }
}

/** 精度曲线数据点 */
export interface AccuracyPoint {
  round: number
  accuracy: number
  loss: number
  timestamp: string
}

/** 盒子贡献度 */
export interface BoxContribution {
  boxId: string
  boxName: string
  dataVolume: number
  contribution: number
  accuracy: number
  lastActiveRound: number
}

/** 创建训练任务请求 */
export interface CreateFederationTaskRequest {
  name: string
  modelType: string
  totalRounds: number
  minBoxes: number
  learningRate: number
  batchSize: number
  dpEpsilon?: number
  dpDelta?: number
  secAggEnabled?: boolean
  gradientEncryptionEnabled?: boolean
}

export const federationApi = {
  /** 获取联邦学习状态 */
  getStatus() {
    return federationHttp.get<ApiResponse<FederationStatus>>('/status')
  },

  /** 获取训练任务列表 */
  getTasks(params?: { status?: FederationTaskStatus; page?: number; pageSize?: number }) {
    return federationHttp.get<ApiResponse<FederationTask[]>>('/tasks', { params })
  },

  /** 获取任务详情 */
  getTaskDetail(id: string) {
    return federationHttp.get<ApiResponse<FederationTask>>(`/tasks/${id}`)
  },

  /** 创建训练任务 */
  createTask(data: CreateFederationTaskRequest) {
    return federationHttp.post<ApiResponse<FederationTask>>('/tasks', data)
  },

  /** 暂停训练任务 */
  pauseTask(id: string) {
    return federationHttp.post<ApiResponse<void>>(`/tasks/${id}/pause`)
  },

  /** 继续训练任务 */
  resumeTask(id: string) {
    return federationHttp.post<ApiResponse<void>>(`/tasks/${id}/resume`)
  },

  /** 停止训练任务 */
  stopTask(id: string) {
    return federationHttp.post<ApiResponse<void>>(`/tasks/${id}/stop`)
  },

  /** 删除训练任务 */
  deleteTask(id: string) {
    return federationHttp.delete<ApiResponse<void>>(`/tasks/${id}`)
  },

  /** 获取精度曲线 */
  getAccuracyCurve(taskId: string) {
    return federationHttp.get<ApiResponse<AccuracyPoint[]>>(`/tasks/${taskId}/accuracy`)
  },

  /** 获取盒子贡献度 */
  getBoxContributions(taskId: string) {
    return federationHttp.get<ApiResponse<BoxContribution[]>>(`/tasks/${taskId}/contributions`)
  },

  /** 获取隐私预算使用情况 */
  getPrivacyBudget(taskId: string) {
    return federationHttp.get<ApiResponse<{
      usedBudget: number
      totalBudget: number
      usedPercentage: number
      perRoundConsumption: number[]
    }>>(`/tasks/${taskId}/privacy-budget`)
  },

  /** 更新隐私设置 */
  updatePrivacySettings(taskId: string, settings: {
    secAggEnabled?: boolean
    gradientEncryptionEnabled?: boolean
    dpEpsilon?: number
    dpDelta?: number
  }) {
    return federationHttp.put<ApiResponse<void>>(`/tasks/${taskId}/privacy-settings`, settings)
  },

  /** 获取参与盒子列表 */
  getParticipatingBoxes(taskId: string) {
    return federationHttp.get<ApiResponse<Array<{
      boxId: string
      boxName: string
      status: 'active' | 'idle' | 'offline'
      currentRound: number
      lastGradientAt: string
      dataVolume: number
    }>>>(`/tasks/${taskId}/boxes`)
  }
}
