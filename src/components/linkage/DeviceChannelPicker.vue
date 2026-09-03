<template>
  <div class="dcp-root">
    <!-- 统计条 (跨设备规则统一预览: 命中设备 N / 覆盖通道 M) -->
    <div class="dcp-stats">
      <el-tag type="primary" effect="dark" size="small">设备 {{ value.deviceIds.length }}</el-tag>
      <el-tag type="success" effect="dark" size="small">通道 {{ selectedChannelCount }}</el-tag>
      <el-tag v-if="offlineSelected > 0" type="danger" effect="plain" size="small">离线 {{ offlineSelected }}</el-tag>
      <span class="dcp-stats-hint">全部设备 = 不限定范围 (规则对所有通道生效)</span>
    </div>

    <!-- 搜索 + 算法能力过滤 -->
    <div class="dcp-toolbar">
      <el-input v-model="keyword" placeholder="模糊搜索设备名 / IP / 位置" clearable size="small" style="width: 220px">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="algoFilter" placeholder="算法能力过滤" clearable filterable size="small" style="width: 200px">
        <el-option v-for="a in algoOptions" :key="a" :label="a" :value="a" />
      </el-select>
      <el-button size="small" text type="primary" @click="checkAllFiltered">全选过滤结果</el-button>
      <el-button size="small" text @click="clearAll">清空</el-button>
    </div>

    <!-- 设备分组列表 (自实现轻量列表: 100+ 设备勾选零卡顿, 避免 el-tree 大数据渲染开销) -->
    <div class="dcp-list" v-loading="loading">
      <div v-for="dev in filteredDevices" :key="dev.id" class="dcp-device" :class="{ 'is-checked': isDeviceChecked(dev) }">
        <div class="dcp-device-row">
          <el-checkbox
            :model-value="isDeviceChecked(dev)"
            :indeterminate="isDevicePartial(dev)"
            @change="(v: boolean | string | number) => toggleDevice(dev, !!v)"
          />
          <span class="dcp-device-name" @click="dev._expanded = !dev._expanded">{{ dev.name }}</span>
          <el-tag size="small" type="info" effect="plain" class="dcp-chip">{{ dev.hardwareModel || dev.protocol || 'IPC' }}</el-tag>
          <el-tag size="small" :type="isOnline(dev) ? 'success' : 'danger'" effect="plain">
            {{ isOnline(dev) ? '在线' : '离线' }}
          </el-tag>
          <el-tooltip :content="`已部署算法: ${(dev.algoPlugins || []).join('、') || '无'}`" placement="top">
            <el-tag size="small" effect="plain" type="warning">算法 ×{{ (dev.algoPlugins || []).length }}</el-tag>
          </el-tooltip>
          <span class="dcp-device-loc">{{ dev.location }}</span>
          <el-button size="small" text type="primary" @click="dev._expanded = !dev._expanded">
            {{ dev._expanded ? '收起通道' : `通道 ${channelsOf(dev.id).length}` }}
          </el-button>
        </div>
        <!-- 通道级多选继承: 勾选设备默认全通道, 展开手动剔除 -->
        <div v-if="dev._expanded" class="dcp-channels">
          <el-checkbox
            v-for="ch in channelsOf(dev.id)" :key="ch.id"
            :model-value="isChannelSelected(ch)"
            @change="(v: boolean | string | number) => toggleChannel(dev, ch, !!v)"
          >
            <span class="dcp-ch-name">CH{{ ch.channelNo }} {{ ch.name }}</span>
            <span class="dcp-ch-meta">{{ ch.resolution }} · {{ ch.fps }}fps</span>
            <el-tag v-if="ch.algoPlugin" size="small" effect="plain" style="margin-left: 6px">{{ ch.algoPlugin.split(',').length }}算法</el-tag>
          </el-checkbox>
        </div>
      </div>
      <el-empty v-if="!loading && filteredDevices.length === 0" description="无匹配设备" :image-size="48" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * DeviceChannelPicker.vue — 设备/通道多选选择器 (规则工坊步骤②)
 *
 * 对标落地: 华为好望 设备树多选+分组继承 / 海康 iVMS-8700 通道级勾选。
 * 数据契约: SourceCondition.device_ids: string[] + channel_ids: number[]。
 * 全部设备未勾选 = 不限定 (后端 channel_ids/device_ids 空数组语义)。
 * 性能: 自实现分组列表替代 el-tree, 100 设备 × N 通道勾选为 O(1) Set 操作。
 * [vp7 新建规则工坊 2026-09-01]
 */
import { ref, computed, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { deviceApi } from '@/api/device'
import { channelApi } from '@/api/channel'
import type { DeviceItem, ChannelItem } from '@/types/device'

interface DeviceRow extends DeviceItem { _expanded?: boolean }

const props = defineProps<{
  /** v-model: { deviceIds, channelIds } (SourceCondition 双字段直映) */
  modelValue: { deviceIds: string[]; channelIds: number[] }
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: { deviceIds: string[]; channelIds: number[] }): void }>()

const loading = ref(false)
const keyword = ref('')
const algoFilter = ref('')
const devices = ref<DeviceRow[]>([])
const channels = ref<ChannelItem[]>([])

// [r27 修复] 后端响应多层剥壳：axios → ApiResponse{code,data} → 数组/分页对象
// 后端真实结构: /devices → {code:0,data:{devices:[...],items:[...]}}; /channels → {code:0,data:{channels:[...]}}
// 旧写法只剥一层导致 devices.value = {code,message,data} 非数组 → computed 崩溃 → 条件卡渲染中断
function toArr<T>(res: any, ...keys: string[]): T[] {
  const body = res?.data ?? res
  const inner = body?.data ?? body
  if (Array.isArray(inner)) return inner as T[]
  for (const k of keys) if (Array.isArray(inner?.[k])) return inner[k] as T[]
  return []
}

const value = computed(() => props.modelValue)
const deviceChannelMap = computed(() => {
  const m = new Map<string, ChannelItem[]>()
  // [r27 修复] 渲染链最上游，数组守卫
  const chList = Array.isArray(channels.value) ? channels.value : []
  for (const ch of chList) {
    const k = String(ch.deviceId)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(ch)
  }
  return m
})
function channelsOf(deviceId: string): ChannelItem[] {
  return deviceChannelMap.value.get(deviceId) || []
}

const isOnline = (d: DeviceItem) => String(d.status).toLowerCase() === 'online'

const algoOptions = computed(() => {
  const s = new Set<string>()
  // [r27 修复] 数组守卫：即使上游异常也不崩溃（防条件卡渲染中断）
  const list = Array.isArray(devices.value) ? devices.value : []
  for (const d of list) for (const p of (d as any).algoPlugins || []) if (p) s.add(p)
  return [...s].sort()
})

const filteredDevices = computed(() => {
  // [r27 修复] 数组守卫
  const list = Array.isArray(devices.value) ? devices.value : []
  const kw = keyword.value.trim().toLowerCase()
  return list.filter((d: any) => {
    if (kw && !(`${d.name} ${d.ip} ${d.location}`.toLowerCase().includes(kw))) return false
    if (algoFilter.value && !(d.algoPlugins || []).includes(algoFilter.value)) return false
    return true
  })
})

const selectedChannelCount = computed(() => {
  if (value.value.deviceIds.length === 0) return 0
  let n = 0
  for (const did of value.value.deviceIds) {
    const chs = channelsOf(did)
    // 全选语义: 该设备通道 id 都不在排除列表 → 全部计入; 简化: channelIds 为"显式选择集"
    n += chs.filter(ch => isChannelSelected(ch)).length
  }
  return n
})
const offlineSelected = computed(() =>
  value.value.deviceIds.filter(id => {
    // [r27 修复] 数组守卫
    const list = Array.isArray(devices.value) ? devices.value : []
    const d = list.find((x: any) => x.id === id)
    return d && !isOnline(d)
  }).length)

function isDeviceChecked(dev: DeviceItem): boolean {
  return value.value.deviceIds.includes(dev.id)
}
function isDevicePartial(dev: DeviceItem): boolean {
  const chs = channelsOf(dev.id)
  if (!chs.length) return false
  const sel = chs.filter(isChannelSelected).length
  return sel > 0 && sel < chs.length
}
function isChannelSelected(ch: ChannelItem): boolean {
  // 设备勾选 → 通道继承全选; 通道显式反选存排除集 (排除集存放于 metadata 外部状态)
  if (isDeviceChecked({ id: String(ch.deviceId) } as DeviceItem)) return !excludedChannels.value.has(ch.id)
  return selectedChannels.value.has(ch.id)
}

/** 通道显式选择集 (未勾选设备但勾了通道) 与继承排除集 */
const selectedChannels = ref(new Set<string>())
const excludedChannels = ref(new Set<string>())

function emitValue() {
  // channel_ids: number[] — 收集所有被选中通道的 channelNo
  const nums: number[] = []
  for (const ch of channels.value) {
    if (isChannelSelected(ch)) nums.push(ch.channelNo)
  }
  emit('update:modelValue', {
    deviceIds: [...value.value.deviceIds],
    channelIds: nums,
  })
}

function toggleDevice(dev: DeviceRow, checked: boolean) {
  const ids = new Set(value.value.deviceIds)
  if (checked) {
    ids.add(dev.id)
    // 勾选设备 → 清除该设备的通道排除 (继承全通道)
    for (const ch of channelsOf(dev.id)) excludedChannels.value.delete(ch.id)
  } else {
    ids.delete(dev.id)
    // 取消设备 → 其通道的显式选择也移除
    for (const ch of channelsOf(dev.id)) selectedChannels.value.delete(ch.id)
  }
  emit('update:modelValue', { deviceIds: [...ids], channelIds: [...collectChannelNums(ids)] })
}
function toggleChannel(dev: DeviceRow, ch: ChannelItem, checked: boolean) {
  if (isDeviceChecked(dev)) {
    // 设备已勾选 → 通道切换走排除集
    if (checked) excludedChannels.value.delete(ch.id)
    else excludedChannels.value.add(ch.id)
  } else {
    if (checked) selectedChannels.value.add(ch.id)
    else selectedChannels.value.delete(ch.id)
  }
  emitValue()
}
function collectChannelNums(ids: Set<string>): Set<number> {
  const s = new Set<number>()
  for (const ch of channels.value) {
    const did = String(ch.deviceId)
    if (ids.has(did) ? !excludedChannels.value.has(ch.id) : selectedChannels.value.has(ch.id)) {
      s.add(ch.channelNo)
    }
  }
  return s
}
function checkAllFiltered() {
  const ids = new Set(value.value.deviceIds)
  for (const d of filteredDevices.value) ids.add(d.id)
  emit('update:modelValue', { deviceIds: [...ids], channelIds: [...collectChannelNums(ids)] })
}
function clearAll() {
  selectedChannels.value.clear()
  excludedChannels.value.clear()
  emit('update:modelValue', { deviceIds: [], channelIds: [] })
}

/** 外部回填 (编辑规则): deviceIds + channelIds 反推勾选态 */
function hydrate(deviceIds: string[], channelNums: number[]) {
  selectedChannels.value.clear()
  excludedChannels.value.clear()
  const want = new Set(channelNums)
  for (const did of deviceIds) {
    const chs = channelsOf(did)
    if (!chs.length) continue
    const allSel = chs.every(ch => want.has(ch.channelNo))
    if (!allSel) {
      // 部分通道 → 勾设备 + 排除未选中通道
      for (const ch of chs) if (!want.has(ch.channelNo)) excludedChannels.value.add(ch.id)
    }
  }
  // 孤立通道 (设备未选但通道在选集): 反查归属
  for (const ch of channels.value) {
    if (want.has(ch.channelNo) && !deviceIds.includes(String(ch.deviceId))) {
      selectedChannels.value.add(ch.id)
    }
  }
}
defineExpose({ hydrate })

onMounted(async () => {
  loading.value = true
  try {
    const [devRes, chRes] = await Promise.all([
      deviceApi.getList({ page: 1, pageSize: 500 }),
      channelApi.getList({ page: 1, pageSize: 1000 }),
    ])
    // [r27 修复] 多层剥壳 + 多键兑底 (devices/items/list)
    devices.value = toArr<DeviceRow>(devRes, 'devices', 'items', 'list')
    channels.value = toArr<ChannelItem>(chRes, 'channels', 'items', 'list')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.dcp-root { display: flex; flex-direction: column; gap: 10px; }
.dcp-stats { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dcp-stats-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.dcp-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dcp-list { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; max-height: 380px; overflow: auto; }
.dcp-device { border-bottom: 1px solid var(--el-border-color-extra-light); padding: 6px 10px; }
.dcp-device:last-child { border-bottom: none; }
.dcp-device.is-checked { background: var(--el-color-primary-light-9); }
.dcp-device-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dcp-device-name { font-weight: 600; cursor: pointer; min-width: 120px; }
.dcp-chip { font-family: monospace; }
.dcp-device-loc { font-size: 12px; color: var(--el-text-color-secondary); flex: 1; text-align: right; }
.dcp-channels { display: flex; flex-direction: column; gap: 2px; padding: 6px 28px; background: var(--el-fill-color-extra-light); border-radius: 4px; margin-top: 4px; }
.dcp-ch-name { font-size: 13px; }
.dcp-ch-meta { font-size: 11px; color: var(--el-text-color-secondary); margin-left: 6px; }
</style>
