/**
 * 华盾AI智能视频盒子 v7.0 - 项目状态管理
 * stores/project.ts — 项目列表、CRUD操作
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { http } from '@/api/http'
import type { ApiResponse } from '@/types/common'
import { ElMessage } from 'element-plus'

/** 项目状态 */
export type ProjectStatus = 'active' | 'archived' | 'draft'

/** 项目优先级 */
export type ProjectPriority = 'high' | 'medium' | 'low'

/** 项目实体 */
export interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  priority: ProjectPriority
  owner: string
  deviceCount: number
  createdAt: string
  updatedAt: string
}

/** 项目表单数据 */
export interface ProjectFormData {
  name: string
  description: string
  status: ProjectStatus
  priority: ProjectPriority
  owner: string
  deviceCount: number
}

export const useProjectStore = defineStore('project', () => {
  // ===== 状态 =====
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const loading = ref(false)
  const total = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(20)

  // ===== Actions =====
  async function fetchProjects() {
    loading.value = true
    try {
      const res = await http.get<ApiResponse<{ items: Project[]; total: number }>>('/projects', {
        params: { page: currentPage.value, pageSize: pageSize.value }
      })
      const data = (res.data as any).data ?? res.data
      projects.value = data.items || []
      total.value = data.total || 0
    } catch (e: any) {
      ElMessage.error('加载项目列表失败: ' + (e.message || '未知错误'))
    } finally {
      loading.value = false
    }
  }

  async function createProject(data: ProjectFormData) {
    try {
      await http.post('/projects', data)
      await fetchProjects()
    } catch (e: any) {
      ElMessage.error('创建项目失败: ' + (e.message || '未知错误'))
      throw e
    }
  }

  async function updateProject(id: string, data: ProjectFormData) {
    try {
      await http.put(`/projects/${id}`, data)
      await fetchProjects()
    } catch (e: any) {
      ElMessage.error('更新项目失败: ' + (e.message || '未知错误'))
      throw e
    }
  }

  async function deleteProject(id: string) {
    try {
      await http.delete(`/projects/${id}`)
      await fetchProjects()
    } catch (e: any) {
      ElMessage.error('删除项目失败: ' + (e.message || '未知错误'))
      throw e
    }
  }

  return {
    projects,
    currentProject,
    loading,
    total,
    currentPage,
    pageSize,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject
  }
})
