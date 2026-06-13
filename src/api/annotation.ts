/**
 * 华盾AI智能视频盒子 v7.0 - 标注项目 API
 * api/annotation.ts — 标注项目管理 + 样本 CRUD (P14 修复 14.10)
 *
 * 后端路由:
 *   GET    /api/v1/annotation/projects                       项目列表(含 sample_count)
 *   POST   /api/v1/annotation/projects                       新建项目
 *   DELETE /api/v1/annotation/projects/:id                   删除项目 (CASCADE 删样本)
 *   GET    /api/v1/annotation/projects/:id/samples           样本列表 (filter: category/labelFilter)
 *   POST   /api/v1/annotation/projects/:id/samples           上传样本 (multipart FormData)
 *   DELETE /api/v1/annotation/samples/:id                    删除样本
 *   PATCH  /api/v1/annotation/samples/:id                    更新标注 (boxes/label/category)
 */

import { http } from './http'
import type { ApiResponse } from '@/types/common'

// ── 类型定义 ──

export interface AnnotationProject {
  id: number
  name: string
  description: string
  categories: string[]
  sample_count: number
  labeled_count: number
  unlabeled_count: number
  created_by: string
  created_at: number
  updated_at: number
}

export interface AnnotationSample {
  id: number
  project_id: number
  filename: string
  category: string
  label: string
  boxes: BoundingBox[]
  labeled: boolean
  annotator: string
  annotated_at: number
  created_at: number
  file_url: string
}

export interface BoundingBox {
  x: number
  y: number
  w: number
  h: number
}

export interface CreateProjectReq {
  name: string
  description?: string
  categories?: string[]
  created_by?: string
}

export interface UpdateSampleReq {
  category?: string
  label?: string
  boxes?: BoundingBox[]
}

export interface ProjectListResp {
  items: AnnotationProject[]
  total: number
}

// ── API ──

export const annotationApi = {
  /** 列出所有项目(含 sample_count 统计) */
  listProjects() {
    return http.get<ApiResponse<ProjectListResp>>('/annotation/projects')
  },

  /** 新建项目 */
  createProject(data: CreateProjectReq) {
    return http.post<ApiResponse<{ id: number; name: string; created_at: number }>>(
      '/annotation/projects',
      data
    )
  },

  /** 删除项目 (级联删除所有样本) */
  deleteProject(id: number | string) {
    return http.delete<ApiResponse<void>>(`/annotation/projects/${id}`)
  },

  /** 列出项目的样本(支持筛选) */
  listSamples(
    projectId: number | string,
    params?: {
      category?: string
      labelFilter?: 'all' | 'labeled' | 'unlabeled'
      page?: number
      pageSize?: number
    }
  ) {
    return http.get<ApiResponse<{ items: AnnotationSample[]; total: number }>>(
      `/annotation/projects/${projectId}/samples`,
      { params }
    )
  },

  /** 上传样本(multipart) */
  addSample(
    projectId: number | string,
    formData: FormData
  ) {
    return http.post<ApiResponse<{ id: number; filename: string }>>(
      `/annotation/projects/${projectId}/samples`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      }
    )
  },

  /** 删除单个样本 */
  deleteSample(id: number | string) {
    return http.delete<ApiResponse<void>>(`/annotation/samples/${id}`)
  },

  /** 更新样本标注(boxes/label/category) */
  updateSample(id: number | string, data: UpdateSampleReq) {
    return http.patch<ApiResponse<void>>(`/annotation/samples/${id}`, data)
  },
}