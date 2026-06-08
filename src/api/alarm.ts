/**
 * 华盾AI智能视频盒子 v7.0 - 告警 API
 * api/alarm.ts — 告警事件、处理、统计相关接口
 */

import { alarmHttp, http } from './http'
import type { ApiResponse, PageResponse } from '@/types/common'
import type { AlarmEvent, AlarmStats, AlarmQuery, AlarmHandleForm, AlarmTrendItem, AlarmTypeDistribution, AlarmEvidence } from '@/types/alarm'

export const alarmApi = {
  /** 获取告警列表 */
  getList(params?: AlarmQuery) {
    return alarmHttp.get<ApiResponse<PageResponse<AlarmEvent>>>('', { params })
  },

  /** 获取告警详情 */
  getDetail(id: string) {
    return alarmHttp.get<ApiResponse<AlarmEvent>>(`/${id}`)
  },

  /** 处理告警 */
  handle(id: string, form: AlarmHandleForm) {
    return alarmHttp.post<ApiResponse<void>>(`/${id}/handle`, form)
  },

  /** 批量处理告警 */
  batchHandle(ids: string[], form: AlarmHandleForm) {
    return alarmHttp.post<ApiResponse<{ handled: number }>>('/batch-handle', { ids, ...form })
  },

  /** 批量确认 */
  batchConfirm(ids: string[], note?: string) {
    return alarmApi.batchHandle(ids, { status: 'confirmed', note })
  },

  /** 批量标记误报 */
  batchFalseAlarm(ids: string[], note?: string) {
    return alarmApi.batchHandle(ids, { status: 'false_alarm', note })
  },

  /** 获取告警统计 */
  getStats() {
    return alarmHttp.get<ApiResponse<AlarmStats>>('/stats')
  },

  /** 获取今日告警统计 */
  getTodayStats() {
    return alarmHttp.get<ApiResponse<AlarmStats>>('/stats/today')
  },

  /** 获取告警趋势 */
  getTrend(params: { period?: '7d' | '30d' | '90d'; startTime?: string; endTime?: string }) {
    return alarmHttp.get<ApiResponse<AlarmTrendItem[]>>('/trend', { params })
  },

  /** 获取告警类型分布 */
  getTypeDistribution(params?: { startTime?: string; endTime?: string }) {
    return alarmHttp.get<ApiResponse<AlarmTypeDistribution[]>>('/distribution', { params })
  },

  /** 获取未处理告警数量 */
  getUnhandledCount() {
    return alarmHttp.get<ApiResponse<{ count: number }>>('/unhandled-count')
  },

  /** 导出告警列表 */
  exportAlarms(params?: AlarmQuery) {
    return alarmHttp.get('/export', { params, responseType: 'blob' })
  },

  /** 获取告警快照 */
  getSnapshot(id: string) {
    return alarmHttp.get<ApiResponse<{ url: string }>>(`/${id}/snapshot`)
  },

  /** 获取告警视频片段 */
  getVideoClip(id: string) {
    return alarmHttp.get<ApiResponse<{ url: string }>>(`/${id}/video-clip`)
  },

  /** 转发告警 */
  forward(id: string, forwardTo: string, note?: string) {
    return alarmApi.handle(id, { status: 'forwarded', forwardTo, note })
  },

  /** 获取告警证据链(快照+视频+AI分析+关联录像) */
  // §13 Fix E: 后端实际响应是 ApiResponse<{snapshot:{url,available}, video_clip:{url,available}, ...}>,
  // 前端 AlarmEvidence 是扁平结构, 这里做映射 (nested → flat) 后再返回
  async getEvidence(id: string): Promise<AlarmEvidence | null> {
    try {
      const res: any = await alarmHttp.get<ApiResponse<any>>(`/${id}/evidence`)
      // axios response -> ApiResponse -> data
      const d = res?.data?.data ?? res?.data
      if (!d) return null
      return {
        snapshotUrl: d.snapshot?.url ?? '',
        videoClipUrl: d.video_clip?.url ?? '',
        detectionBoxes: d.metadata ?? [],
        aiAnalysis: '',
        relatedRecordingId: '',
        relatedRecordingTime: '',
      }
    } catch {
      return null
    }
  },

  /** AI二次分析告警图片 */
  analyzeAlarm(id: string) {
    return alarmHttp.post<ApiResponse<{ analysis: string }>>(`/${id}/analyze`)
  }
}
