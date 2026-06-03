/**
 * useActionTypes — 动作类型描述符动态加载
 * 从后端 /linkage/action-types 加载 ActionDescriptor 列表，
 * 按 category + sub_category 分组，模块级缓存
 */

import { ref, computed, type Ref } from 'vue'
import { linkageApi, type ActionDescriptor, ACTION_TYPE_REVERSE_MAP } from '@/api/linkage'

export interface ActionGroup {
  category: string
  sub_category: string
  label: string
  items: ActionDescriptor[]
}

// 模块级缓存
let descriptorCache: Promise<ActionDescriptor[]> | null = null

export function useActionTypes() {
  const descriptors: Ref<ActionDescriptor[]> = ref([])
  const loading = ref(false)

  async function fetchDescriptors() {
    if (descriptorCache) {
      descriptors.value = await descriptorCache
      return
    }
    loading.value = true
    descriptorCache = linkageApi.getActionTypes()
      .then(res => {
        const data = (res as any)?.data?.data ?? (res as any)?.data ?? []
        return Array.isArray(data) ? data : []
      })
      .catch(() => [] as ActionDescriptor[])

    descriptors.value = await descriptorCache
    loading.value = false
  }

  /** 按 category 分组的动作类型 */
  const groupedByCategory = computed(() => {
    const map = new Map<string, ActionDescriptor[]>()
    for (const d of descriptors.value) {
      if (!map.has(d.category)) map.set(d.category, [])
      map.get(d.category)!.push(d)
    }
    return map
  })

  /** 按 category + sub_category 细分的动作组 */
  const actionGroups = computed<ActionGroup[]>(() => {
    const map = new Map<string, ActionDescriptor[]>()
    for (const d of descriptors.value) {
      const key = `${d.category}::${d.sub_category}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    const groups: ActionGroup[] = []
    for (const [key, items] of map) {
      const [category, sub_category] = key.split('::')
      groups.push({
        category,
        sub_category: sub_category || '',
        label: sub_category || category,
        items: items.sort((a, b) => a.type_id - b.type_id),
      })
    }
    return groups
  })

  /** 获取某个 category 下的所有动作 */
  function getByCategory(category: string): ActionDescriptor[] {
    return descriptors.value.filter(d => d.category === category)
  }

  /** 通过 type_id 获取描述符 */
  function getByTypeId(typeId: number): ActionDescriptor | undefined {
    return descriptors.value.find(d => d.type_id === typeId)
  }

  /** 通过 type_name 获取描述符 */
  function getByTypeName(typeName: string): ActionDescriptor | undefined {
    const numericId = parseInt(typeName)
    if (!isNaN(numericId) && ACTION_TYPE_REVERSE_MAP[numericId]) return getByTypeId(numericId)
    return descriptors.value.find(d => d.type_name === typeName)
  }

  return {
    descriptors,
    loading,
    groupedByCategory,
    actionGroups,
    getByCategory,
    getByTypeId,
    getByTypeName,
    fetchDescriptors,
  }
}
