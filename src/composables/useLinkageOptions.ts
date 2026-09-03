/**
 * 联动规则选项 Composable — 动态加载事件类型、通道列表和设备位置
 *
 * 从后端 /event-types/canonical (SSOT) 、/channels、/devices API 获取数据，
 * 转换为联动规则页面可用的下拉选项格式。
 *
 * v6.2 2026-06-21 修复: 之前只从 /algorithms 拉 31 个通用算法, 遗漏人脸细分事件
 * (face_blacklist / face_stranger / face_pass_vip / face_liveness_fail 等),
 * 导致前端联动规则页无法订阅这些事件. 现在优先从 SSOT /event-types/canonical 拉,
 * 补齐所有 30+ 事件类型, 与后端 EventTypeAliases.h 完全一致.
 */
import { ref, computed } from 'vue'
import algorithmsApi from '@/api/algorithms'
import eventTypesApi, { type CanonicalEventType, type EventTypeMetadataItem } from '@/api/eventTypes'
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
  /** 默认严重级别 */
  level?: number
  /** 厂商对标 */
  vendor?: string
  /** 别名列表 (供 CEP/Linkage 引擎使用) */
  aliases?: string[]
  // v7.6 SSOT 元数据扩展
  /** 事件大类: ALARM / NOTIFICATION / BUSINESS / STATE / PERCEPTION */
  eventCategory?: string
  /** 大类中文名 */
  eventCategoryCn?: string
  /** 严重等级: CRITICAL / HIGH / MEDIUM / LOW / INFO */
  severity?: string
  /** 严重等级数值 1-5 */
  severityLevel?: number
  /** 严重等级中文名 */
  severityCn?: string
  /** UI 分组: face / perimeter / behavior / fire / safety / traffic / device */
  uiGroup?: string
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

// [FIX] ui_group 英文 key → 中文分组标签映射
// 后端 /event-types/metadata 返回的 ui_group 是英文 key (face/perimeter/behavior/...),
// 前端显示时需映射为中文, 否则用户只看到英文分组名.
// [FIX 2026-09-02] 补齐 other/retail/facility/environment 四组 (此前英文直显),
//   分组键与后端 EventTypeAliases.h inferEventUiGroup (SSOT) 对齐
const GROUP_LABEL_MAP: Record<string, string> = {
  face: '人脸识别',
  perimeter: '周界安全',
  behavior: '行为分析',
  fire: '消防安全',
  safety: '安全合规',
  traffic: '交通管理',
  device: '设备状态',
  retail: '零售经营',
  facility: '设施建筑',
  environment: '环境异常',
  other: '其他',
  person: '人员检测',
  object: '物体检测',
  // event category (metadata groups 的 key 是小写 category)
  alarm: '报警事件',
  notification: '通行通知',
  business: '业务事件',
  state: '设备状态',
  perception: '感知事件',
}

// [FIX 2026-09-02] 分组显示顺序 (对标海康 iVMS/宇视 NVR 联动规则编辑器):
//   业务域分组按固定序排列, other 兜底组置末; 不依赖后端返回顺序。
//   未识别的组排在业务组之后、other 之前 (居中兜底, 不与 other 混杂)。
const GROUP_ORDER: Record<string, number> = {
  face: 0, perimeter: 1, behavior: 2, fire: 3, safety: 4, traffic: 5,
  device: 6, retail: 7, facility: 8, environment: 9,
}
function groupRank(g: string): number {
  if (g in GROUP_ORDER) return GROUP_ORDER[g]
  return g === 'other' ? 10000 : 500
}

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

function mapCanonicalToOption(t: CanonicalEventType): EventTypeOption {
  // value 使用 alarm_type (key), 供 LinkageRule source_cond.event_types 直接使用
  // 如果是 face_/intrusion/... 等细分事件, label 使用中文名
  return {
    label: `${t.name_zh} (${t.key})`,
    value: t.key,
    category: t.category,
    alarmType: t.key,
    level: t.level,
    vendor: t.vendor,
    aliases: t.aliases,
  }
}

/**
 * v7.6: 将 SSOT 元数据项映射为选项 (包含严重等级)
 * 对标海康/大华: 事件选择器显示分类 + 严重度标签
 */
function mapMetadataToOption(m: EventTypeMetadataItem): EventTypeOption {
  return {
    label: `${m.display_name} (${m.alarm_type})`,
    value: m.alarm_type,
    category: m.ui_group || m.category,
    alarmType: m.alarm_type,
    level: m.severity_level,
    aliases: m.aliases,
    eventCategory: m.category,
    eventCategoryCn: m.category_cn,
    severity: m.severity,
    severityLevel: m.severity_level,
    severityCn: m.severity_cn,
    uiGroup: m.ui_group,
  }
}

async function fetchAlgorithmOptions(): Promise<EventTypeOption[]> {
  if (algoCache) return algoCache

  algoCache = (async () => {
    // v7.6: 优先用 SSOT metadata 端点 (含分类+严重等级), 回退到 canonical, 再回退到 /algorithms
    try {
      const res = await eventTypesApi.metadata()
      const raw = res.data as any
      const payload = raw?.data ?? raw
      const groups = payload?.groups ?? {}
      const options: EventTypeOption[] = []
      for (const cat of Object.keys(groups)) {
        const items: EventTypeMetadataItem[] = groups[cat]?.items ?? []
        for (const m of items) {
          if (!EXCLUDED_CATEGORIES.includes(m.ui_group)) {
            options.push(mapMetadataToOption(m))
          }
        }
      }
      console.log('[useLinkageOptions] metadata endpoint:', options.length, 'options,', Object.keys(groups).length, 'groups')
      if (options.length > 0) return options
    } catch (e) {
      console.warn('[useLinkageOptions] metadata endpoint unavailable, fallback to canonical', e)
    }

    // v6.2 回退: canonical 端点
    try {
      const res = await eventTypesApi.list()
      const raw = res.data as any
      const payload = raw?.data ?? raw
      const types: CanonicalEventType[] = payload?.types ?? []
      if (types.length > 0) {
        return types
          .filter(t => !EXCLUDED_CATEGORIES.includes(t.category))
          .map(mapCanonicalToOption)
      }
    } catch (e) {
      console.warn('[useLinkageOptions] canonical event-types unavailable, fallback to /algorithms', e)
    }

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
    // [FIX] 清除所有模块级缓存 (包括 algoCache), 确保每次进入页面都获取最新数据
    // 之前遗漏了 algoCache, 导致后端重启后页面仍显示旧的缓存数据
    algoCache = null
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

  // v7.6: 按 ui_group 分组 (比 category 更细粒度: face/perimeter/behavior/fire/safety/...)
  // 同时按 eventCategory 排序: ALARM → NOTIFICATION → BUSINESS → STATE → PERCEPTION
  const CATEGORY_ORDER: Record<string, number> = {
    ALARM: 0, NOTIFICATION: 1, BUSINESS: 2, STATE: 3, PERCEPTION: 4
  }
  const eventTypeGrouped = computed(() => {
    const groups: Record<string, EventTypeOption[]> = {}
    const ranks: Record<string, number> = {}
    for (const opt of eventTypeOptions.value) {
      // [FIX] 使用 ui_group 作为分组 key, 但显示时映射为中文
      const rawCat = opt.uiGroup || opt.category || 'other'
      const displayCat = GROUP_LABEL_MAP[rawCat] || rawCat
      if (!groups[displayCat]) { groups[displayCat] = []; ranks[displayCat] = groupRank(rawCat) }
      groups[displayCat].push(opt)
    }
    // 组内按严重等级降序排
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => (b.severityLevel ?? b.level ?? 0) - (a.severityLevel ?? a.level ?? 0))
    }
    // [FIX 2026-09-02] 分组按业务域固定序排列 (other 置末), 不再依赖后端返回顺序
    const sorted: Record<string, EventTypeOption[]> = {}
    Object.keys(groups)
      .sort((a, b) => ranks[a] - ranks[b] || a.localeCompare(b, 'zh'))
      .forEach(cat => { sorted[cat] = groups[cat] })
    return sorted
  })

  // v7.6: 严重等级颜色映射 (对标海康/大华告警级别颜色)
  const severityColors: Record<number, string> = {
    5: '#F56C6C', // CRITICAL - 红
    4: '#E6A23C', // HIGH - 橙
    3: '#409EFF', // MEDIUM - 蓝
    2: '#67C23A', // LOW - 绿
    1: '#909399', // INFO - 灰
  }
  function severityColor(level?: number): string {
    return severityColors[level ?? 3] || '#409EFF'
  }

  return {
    eventTypeOptions,
    eventTypeGrouped,
    severityColor,
    channelOptions,
    locationOptions,
    loading,
    fetchOptions,
  }
}
