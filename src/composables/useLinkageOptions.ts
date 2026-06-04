/**
 * 联动规则选项 Composable — 动态加载事件类型、通道列表和设备位置
 *
 * 从后端 /algorithms、/channels、/devices API 获取数据，
 * 转换为联动规则页面可用的下拉选项格式。
 */
import { ref, computed } from 'vue'
import algorithmsApi from '@/api/algorithms'
import { channelApi } from '@/api/channel'
import { deviceApi } from '@/api/device'
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

/** 位置选项（从设备数据提取） */
export interface LocationOption {
  label: string
  value: string
}

// 不产生告警事件的算法分类，在联动规则中过滤掉
const EXCLUDED_CATEGORIES = ['tracking', 'attribute', 'image_enhance', 'enhance']

// 模块级缓存，防止重复请求
let algoCache: Promise<EventTypeOption[]> | null = null
let channelCache: Promise<ChannelOption[]> | null = null
let locationCache: Promise<LocationOption[]> | null = null

/** 清除缓存（供 HMR 或手动刷新使用） */
export function invalidateCache() {
  algoCache = null
  channelCache = null
  locationCache = null
}

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
      // 后端 GET /api/v1/channels 返回格式: { data: { channels: [...], total: N } }
      // 通道字段: channel_id (int32), device_id, name, source_url, ...
      const items: any[] = raw?.data?.channels ?? raw?.data?.items ?? raw?.data ?? raw?.items ?? []
      return items.map((ch: any) => ({
        label: ch.name || `通道 ${ch.channel_id ?? ch.channelNo ?? ''}`,
        value: String(ch.channel_id ?? ch.id ?? ''),
      }))
    } catch {
      return []
    }
  })()

  return channelCache
}

async function fetchLocationOptions(): Promise<LocationOption[]> {
  if (locationCache) return locationCache

  locationCache = (async () => {
    try {
      const res = await deviceApi.getList()
      const raw = res.data as any
      // 后端 GET /api/v1/devices 返回格式: { data: { devices: [...], total: N } }
      const devices: any[] = raw?.data?.devices ?? raw?.data ?? raw?.devices ?? []
      const seen = new Set<string>()
      const options: LocationOption[] = []
      for (const dev of devices) {
        // 优先用设备的 location/config.location，其次用 name，最后用 id
        const loc = dev.location || dev.config?.location || dev.name || dev.id || ''
        if (loc && !seen.has(loc)) {
          seen.add(loc)
          options.push({ label: loc, value: dev.id || loc })
        }
      }
      return options
    } catch {
      return []
    }
  })()

  return locationCache
}

export function useLinkageOptions() {
  const eventTypeOptions = ref<EventTypeOption[]>([])
  const channelOptions = ref<ChannelOption[]>([])
  const locationOptions = ref<LocationOption[]>([])
  const loading = ref(false)

  async function fetchOptions() {
    loading.value = true
    // 清除模块级缓存，确保每次进入页面都获取最新数据
    channelCache = null
    locationCache = null
    try {
      const [algos, channels, locations] = await Promise.all([
        fetchAlgorithmOptions(),
        fetchChannelOptions(),
        fetchLocationOptions(),
      ])
      eventTypeOptions.value = algos
      channelOptions.value = channels
      locationOptions.value = locations
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
    locationOptions,
    loading,
    fetchOptions,
  }
}
