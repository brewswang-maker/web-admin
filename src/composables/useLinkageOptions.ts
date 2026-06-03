/**
 * 联动规则选项 Composable — 动态加载事件类型和通道列表
 *
 * 从后端 /algorithms 和 /channels API 获取数据，
 * 转换为联动规则页面可用的下拉选项格式。
 */
import { ref, computed } from 'vue'
import algorithmsApi from '@/api/algorithms'
import { channelApi } from '@/api/channel'
import type { AlgorithmInfo } from '@/api/algorithms'
import type { ChannelItem } from '@/types/device'

/** 事件类型选项 */
export interface EventTypeOption {
  label: string
  value: string
  category: string
  alarmType: string
}

/** 通道选项 */
export interface ChannelOption {
  label: string
  value: string
}

// 不产生告警事件的算法分类，在联动规则中过滤掉
const EXCLUDED_CATEGORIES = ['tracking', 'attribute', 'image_enhance', 'enhance']

// 模块级缓存，防止重复请求
let algoCache: Promise<EventTypeOption[]> | null = null
let channelCache: Promise<ChannelOption[]> | null = null

function extractAlarmType(algoId: string): string {
  const parts = algoId.split('.')
  return parts.length > 0 ? parts[parts.length - 1] : algoId
}

function mapAlgoToOption(algo: AlgorithmInfo): EventTypeOption {
  const alarmType = algo.alarm_type || extractAlarmType(algo.algo_id || algo.id)
  return {
    label: algo.name_zh || algo.name,
    value: algo.algo_id || algo.id,
    category: algo.category,
    alarmType,
  }
}

async function fetchAlgorithmOptions(): Promise<EventTypeOption[]> {
  if (algoCache) return algoCache

  algoCache = (async () => {
    try {
      const res = await algorithmsApi.list()
      const raw = res.data as any
      const list: AlgorithmInfo[] = raw?.data?.algorithms ?? raw?.data ?? raw?.algorithms ?? []
      return list
        .filter(a => !EXCLUDED_CATEGORIES.includes(a.category))
        .map(mapAlgoToOption)
    } catch {
      return []
    }
  })()

  return algoCache
}

async function fetchChannelOptions(): Promise<ChannelOption[]> {
  if (channelCache) return channelCache

  channelCache = (async () => {
    try {
      const res = await channelApi.getList({ page: 1, pageSize: 200 })
      const raw = res.data as any
      const items: ChannelItem[] = raw?.data?.items ?? raw?.data ?? raw?.items ?? []
      return items.map(ch => ({
        label: ch.name || `通道 ${ch.channelNo}`,
        value: ch.id,
      }))
    } catch {
      return []
    }
  })()

  return channelCache
}

export function useLinkageOptions() {
  const eventTypeOptions = ref<EventTypeOption[]>([])
  const channelOptions = ref<ChannelOption[]>([])
  const loading = ref(false)

  async function fetchOptions() {
    loading.value = true
    try {
      const [algos, channels] = await Promise.all([
        fetchAlgorithmOptions(),
        fetchChannelOptions(),
      ])
      eventTypeOptions.value = algos
      channelOptions.value = channels
    } finally {
      loading.value = false
    }
  }

  // D5: 按算法分类分组
  const eventTypeGrouped = computed(() => {
    const groups: Record<string, EventTypeOption[]> = {}
    for (const opt of eventTypeOptions.value) {
      const cat = opt.category || '其他'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(opt)
    }
    return groups
  })

  return {
    eventTypeOptions,
    eventTypeGrouped,
    channelOptions,
    loading,
    fetchOptions,
  }
}
