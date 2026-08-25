/**
 * @file face.ts
 * @brief 人脸库管理 API
 */

import { http } from './http'

/** 人脸分组类型 (后端 FaceGroupType 枚举, FaceDatabase.h; 6 种业务分组) */
export type FaceGroupTypeStr = 'blacklist' | 'whitelist' | 'visitor' | 'vip' | 'staff' | 'custom'

export interface FaceRecord {
  person_id: string
  name: string
  id_number?: string
  phone?: string
  email?: string
  group_type: FaceGroupTypeStr
  group_type_cn: string
  group_id?: string
  quality_score: number
  clarity?: number
  brightness?: number
  pose_angle?: number
  occlusion?: number
  gender?: string
  age?: number
  address?: string
  is_active: boolean
  is_verified: boolean
  recognition_count: number
  created_at: number
  updated_at?: number
  expires_at?: number
  last_recognized_at?: number
  image_path?: string
  image_data?: string
  thumbnail_path?: string
  metadata?: Record<string, string>
}

export interface FaceDatabaseStats {
  total: number
  blacklist: number
  whitelist: number
  visitor: number
  vip: number      // [扩展分组 2026-08-25]
  staff: number    // [扩展分组 2026-08-25]
  custom: number   // [扩展分组 2026-08-25]
  active: number
  expired: number
}

export interface FaceMatchResult {
  person_id: string
  name: string
  group_type: string
  similarity: number
  distance: number
}

export interface FaceAlarmEvent {
  alarm_type: number
  timestamp: number
  channel_id: number
  person_id: string
  name: string
  group_type: string
  similarity: number
  severity: number
  description: string
  snapshot_base64?: string
}

/** 通行记录类型（后端 FacePassRecord） */
export interface FacePassRecord {
  pass_type: 'whitelist' | 'visitor' | 'vip' | 'staff' | 'custom' | 'blacklist_hit' | 'unknown' | 'unknown_type'
  timestamp: number
  channel_id: number
  device_id: string
  person_id: string
  name: string
  group_type: string
  similarity: number
  liveness_score: number
  is_live: boolean
  description: string
}

export interface FaceDatabaseResponse<T> {
  code: number
  message: string
  data: T
  timestamp: number
}

export interface PaginatedRecords {
  records: FaceRecord[]
  total: number
  page: number
  page_size: number
}

const faceApi = {
  /**
   * 上传人脸图片
   * Phase 13 P0 #14: 后端期望 multipart/form-data (file + groupId),
   * 原实现走 JSON + base64,改为走 http 实例以继承 Authorization 注入。
   */
  uploadImage(file: File, groupId?: string) {
    const fd = new FormData()
    fd.append('file', file)
    if (groupId) fd.append('groupId', groupId)
    // request 拦截器会跳过 FormData 的 body 转换,Content-Type 由浏览器自动加 boundary
    return http.post<FaceDatabaseResponse<{ person_id: string; message: string }>>(
      '/face/database/upload',
      fd
    )
  },

  /**
   * 获取人脸库统计
   */
  getStats() {
    return http.get<FaceDatabaseResponse<FaceDatabaseStats>>('/face/database/stats')
  },

  /**
   * 获取人脸记录列表
   */
  getRecords(params: {
    group_type?: FaceGroupTypeStr
    search?: string
    page?: number
    page_size?: number
  }) {
    return http.get<FaceDatabaseResponse<PaginatedRecords>>('/face/database/records', { params })
  },

  /**
   * 获取单条人脸记录
   */
  getRecord(personId: string) {
    return http.get<FaceDatabaseResponse<FaceRecord>>(`/face/database/records/${personId}`)
  },

  /**
   * 添加人脸记录
   */
  addRecord(data: {
    name: string
    id_number?: string
    phone?: string
    email?: string
    group_type: FaceGroupTypeStr
    group_id?: string
    gender?: string
    age?: number
    address?: string
    image_path?: string
    image_data?: string
    embedding?: number[]
    quality_score?: number
    valid_days?: number
  }) {
    return http.post<FaceDatabaseResponse<{ person_id: string; message: string; auto_cropped?: boolean }>>('/face/database/records', data)
  },

  /**
   * 更新人脸记录
   */
  updateRecord(personId: string, data: Partial<FaceRecord>) {
    return http.put<FaceDatabaseResponse<{ message: string; auto_cropped?: boolean }>>(`/face/database/records/${personId}`, data)
  },

  /**
   * 删除人脸记录
   */
  deleteRecord(personId: string) {
    return http.delete<FaceDatabaseResponse<{ message: string }>>(`/face/database/records/${personId}`)
  },

  /**
   * 批量添加人脸记录
   */
  batchAdd(records: Array<{
    name: string
    id_number?: string
    phone?: string
    email?: string
    group_type?: FaceGroupTypeStr
    gender?: string
    age?: number
    address?: string
    image_path?: string
    embedding?: number[]
  }>) {
    return http.post<FaceDatabaseResponse<{ added: number; total: number; message: string }>>(
      '/face/database/records/batch',
      { records }
    )
  },

  /**
   * 清空指定分组
   */
  clearGroup(groupType: FaceGroupTypeStr) {
    return http.delete<FaceDatabaseResponse<{ deleted: number; message: string }>>(
      `/face/database/groups/${groupType}`
    )
  },

  /**
   * 人脸比对
   */
  matchFace(embedding: number[], topK: number = 5) {
    return http.post<FaceDatabaseResponse<{ matches: FaceMatchResult[]; total: number }>>(
      '/face/database/match',
      { embedding, top_k: topK }
    )
  },

  /**
   * 获取人脸告警记录
   */
  getAlarms(params: { since?: number; limit?: number } = {}) {
    return http.get<FaceDatabaseResponse<{ alarms: FaceAlarmEvent[]; total: number }>>(
      '/face/database/alarms',
      { params }
    )
  },

  /**
   * 获取通行记录
   */
  getPassRecords(params: { hours?: number; limit?: number } = {}) {
    return http.get<FaceDatabaseResponse<{ pass_records: FacePassRecord[]; total: number }>>(
      '/face/database/pass-records',
      { params }
    )
  },

  /**
   * 导出人脸库
   */
  exportDatabase() {
    return http.get<FaceDatabaseResponse<{ json_data: string }>>('/face/database/export')
  },

  /**
   * 导入人脸库
   */
  importDatabase(jsonData: string) {
    return http.post<FaceDatabaseResponse<{ imported: number; message: string }>>(
      '/face/database/import',
      { json_data: jsonData }
    )
  },

  /**
   * 清理过期访客
   */
  cleanupExpired() {
    return http.post<FaceDatabaseResponse<{ disabled: number; message: string }>>(
      '/face/database/cleanup'
    )
  }
}

export default faceApi