/**
 * [P3-3 FIX 2026-07-14] 事件类型名称缓存 composable
 *
 * 根因: 前端各 View 自行维护 alarmTypeCnMap 硬编码, 与后端 EventTypeAliases.h SSOT 脱节.
 * 修复: 启动时从 /api/v1/event-types/metadata 拉取完整元数据表并缓存,
 *       所有 View 统一使用 getAlarmTypeName() 获取中文名.
 */
import { ref, type Ref } from 'vue'
import eventTypesApi from '@/api/eventTypes'

/** alarm_type → display_name (中文) 缓存 */
const nameCache: Ref<Record<string, string>> = ref({})
let loaded = false
let loading: Promise<void> | null = null

async function ensureLoaded(): Promise<void> {
  if (loaded) return
  if (loading) return loading
  loading = (async () => {
    try {
      const resp = await eventTypesApi.metadata()
      const data = resp.data?.data
      if (data?.groups) {
        const map: Record<string, string> = {}
        for (const group of Object.values(data.groups)) {
          for (const item of group.items) {
            map[item.alarm_type] = item.display_name || item.alarm_type
            // 别名也映射到同一中文名
            for (const alias of item.aliases || []) {
              if (!map[alias]) map[alias] = item.display_name || item.alarm_type
            }
          }
        }
        nameCache.value = map
      }
      loaded = true
    } catch (e) {
      console.warn('[useEventTypeNames] Failed to load event type metadata, using fallback', e)
      // 降级: 保留空 map, getAlarmTypeName 会返回原始 alarm_type
      loaded = true
    } finally {
      loading = null
    }
  })()
  return loading
}

export function useEventTypeNames() {
  // 触发加载 (非阻塞)
  ensureLoaded()

  /** 获取 alarm_type 的中文显示名, 未找到则返回原始值 */
  function getAlarmTypeName(alarmType: string): string {
    return nameCache.value[alarmType] || alarmType
  }

  /** 获取完整的 alarm_type → 中文名 映射 (响应式) */
  function getNameMap(): Ref<Record<string, string>> {
    return nameCache
  }

  return { getAlarmTypeName, getNameMap, ensureLoaded }
}
