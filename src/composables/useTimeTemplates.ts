/**
 * useTimeTemplates — 时间段模板 composable
 * 加载/缓存时间段模板列表，供联动规则编辑器引用
 */

import { ref } from 'vue'
import { linkageApi, type TimeTemplate } from '@/api/linkage'

// 模块级缓存
let templateCache: Promise<TimeTemplate[]> | null = null

export function useTimeTemplates() {
  const templates = ref<TimeTemplate[]>([])
  const loading = ref(false)

  async function fetchTemplates(force = false) {
    if (!force && templateCache) {
      templates.value = await templateCache
      return
    }
    loading.value = true
    templateCache = linkageApi.getTimeTemplates()
      .then(res => {
        const data = (res as any)?.data?.data ?? (res as any)?.data ?? []
        return Array.isArray(data) ? data : []
      })
      .catch(() => [] as TimeTemplate[])

    templates.value = await templateCache
    loading.value = false
  }

  function getById(id: string): TimeTemplate | undefined {
    return templates.value.find(t => t.template_id === id)
  }

  function getWeekdayLabels(weekdays: number[]): string {
    const labels = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
    return weekdays.map(w => labels[w] || `${w}`).join(', ')
  }

  function formatTemplateDesc(t: TimeTemplate): string {
    const parts: string[] = []
    if (t.time_start && t.time_end) parts.push(`${t.time_start}-${t.time_end}`)
    if (t.weekdays.length) parts.push(getWeekdayLabels(t.weekdays))
    return parts.join(' | ') || '全天'
  }

  return {
    templates,
    loading,
    fetchTemplates,
    getById,
    getWeekdayLabels,
    formatTemplateDesc,
  }
}
