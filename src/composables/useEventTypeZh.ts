/**
 * 事件类型中文名 Composable — SSOT /event-types/canonical 单例缓存
 *
 * 背景: 各视图 (周界总览/事件/规则、算法配置) 各自拉取 canonical 事件类型
 * 做中文名映射, 重复请求且实现分散; 统一为模块级缓存 — 首个调用方触发
 * 一次拉取, 后续共享。拉取失败不缓存 (下次调用自动重试), zh() 兜底返回原 key。
 *
 * 用法:
 *   const { ensure, zh, zhAll } = useEventTypeZh()
 *   onMounted(() => { ensure() })          // 预热 (非阻塞)
 *   zh('intrusion')                        // → '入侵检测' (未注册 → 'intrusion')
 */
import { ref } from 'vue'
import eventTypesApi, { type CanonicalEventType } from '@/api/eventTypes'

/** 模块级共享状态 (跨视图单例) */
const canonicalTypes = ref<CanonicalEventType[]>([])
let loaded = false
let inflight: Promise<void> | null = null

export function useEventTypeZh() {
  /** 确保拉取完成 (幂等; 失败静默, 不抛出) */
  async function ensure(): Promise<void> {
    if (loaded) return
    if (!inflight) {
      inflight = eventTypesApi
        .list()
        .then((r) => {
          canonicalTypes.value = r.data?.data?.types ?? (r.data as unknown as { types?: CanonicalEventType[] })?.types ?? []
          loaded = true
        })
        .catch((e) => {
          console.warn('[useEventTypeZh] 事件类型加载失败 (展示将回退裸 key)', e)
          inflight = null
        })
    }
    await inflight
  }

  /** 单事件键中文名 (未注册 → 原 key) */
  function zh(key: string): string {
    return canonicalTypes.value.find((t) => t.key === key)?.name_zh || key
  }

  /** 多事件键中文名拼接 (顿号分隔) */
  function zhAll(keys: string[]): string {
    return keys.map(zh).join('、')
  }

  return { canonicalTypes, ensure, zh, zhAll }
}
