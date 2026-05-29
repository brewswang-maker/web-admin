/**
 * 华盾AI智能视频盒子 v7.0 - 通道 API
 * api/channel.ts — 通道管理、流媒体控制相关接口
 */

import { channelHttp, http } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'
import type { ChannelItem } from '@/types/device'

export const channelApi = {
  /** 获取通道列表（全局） */
  getList(params?: { page?: number; pageSize?: number; keyword?: string; status?: string; deviceId?: string }) {
    return channelHttp.get<ApiResponse<PageResponse<ChannelItem>>>('', { params })
  },

  /** 获取通道详情 */
  getDetail(id: string) {
    return channelHttp.get<ApiResponse<ChannelItem>>(`/${id}`)
  },

  /** 获取设备下的通道列表 */
  getDeviceChannels(deviceId: string) {
    return http.get<ApiResponse<ChannelItem[]>>(`/devices/${deviceId}/channels`)
  },

  /** 更新通道信息 */
  update(id: string, data: Partial<ChannelItem>) {
    return channelHttp.put<ApiResponse<ChannelItem>>(`/${id}`, data)
  },

  /** 配置通道算法（单算法，已废弃） */
  setAlgo(id: string, algoPlugin: string) {
    return channelHttp.post<ApiResponse<void>>(`/${id}/algo`, { algoPlugin })
  },

  /** 配置通道算法列表（多算法） */
  setAlgos(id: string, algoPlugins: string[]) {
    return channelHttp.post<ApiResponse<void>>(`/${id}/algos`, { algoPlugins })
  },

  /** 批量配置算法（单算法，已废弃） */
  batchSetAlgo(ids: string[], algoPlugin: string) {
    return channelHttp.post<ApiResponse<void>>('/batch-algo', { ids, algoPlugin })
  },

  /** 批量配置算法列表（多算法） */
  batchSetAlgos(ids: string[], algoPlugins: string[]) {
    return channelHttp.post<ApiResponse<void>>('/batch-algos', { ids, algoPlugins })
  },

  /** 启动/停止录像 */
  toggleRecording(id: string, enable: boolean) {
    return channelHttp.post<ApiResponse<void>>(`/${id}/recording`, { enable })
  },

  /** 获取通道快照 */
  getSnapshot(id: string) {
    return channelHttp.get<ApiResponse<{ url: string }>>(`/${id}/snapshot`)
  },

  /** 手动抓拍 */
  captureSnapshot(id: string) {
    return channelHttp.post<ApiResponse<{ url: string }>>(`/${id}/snapshot`)
  },

  /** 获取流地址 */
  getStreamUrl(id: string, quality: 'main' | 'sub' = 'main') {
    return channelHttp.get<ApiResponse<{ rtspUrl: string; hlsUrl: string; flvUrl: string }>>(`/${id}/stream`, { params: { quality } })
  },

  /** 获取通道性能指标 */
  getMetrics(id: string) {
    return channelHttp.get<ApiResponse<{
      bitrate: number
      fps: number
      latency: number
      packetLoss: number
      resolution: string
    }>>(`/${id}/metrics`)
  }
}