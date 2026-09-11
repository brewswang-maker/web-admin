<template>
  <aside v-if="!collapsed" class="alarm-tree-panel">
    <div class="alarm-tree-panel__head">
      <span class="alarm-tree-panel__title">设备列表</span>
      <div class="alarm-tree-panel__ops">
        <el-button link size="small" type="primary" :title="expanded ? '折叠' : '展开'" @click="toggleExpand"><el-icon><Sort /></el-icon></el-button>
        <el-button link size="small" type="primary" title="收起" @click="collapse"><el-icon><DArrowRight /></el-icon></el-button>
      </div>
    </div>

    <!-- 已选条件 chips (节点名可单个移除) -->
    <!-- <div v-if="chips.length" class="alarm-tree-panel__chips">
      <el-tag
        v-for="c in chips"
        :key="c.key"
        closable
        size="small"
        type="primary"
        @close="removeChip(c.key)"
      >{{ c.name }}</el-tag>
      <el-button link size="small" type="danger" @click="clearAll">一键清除</el-button>
    </div> -->

    <!-- 安保区域→子区域→设备 多选树 (show-checkbox 级联) -->
    <div class="alarm-tree-panel__body">
    <el-tree
      ref="treeRef"
      :key="treeKey"
      :data="treeData"
      node-key="key"
      :props="{ label: 'label', children: 'children' }"
      show-checkbox
      :default-expanded-keys="expanded ? undefined : []"
      :expand-on-click-node="false"
      :default-checked-keys="checkedKeys"
      empty-text="暂无安保区域, 请到「安保区域管理」创建"
      @check="emitSelection"
    />
    </div>
  </aside>

  <!-- 折叠态: 细竖条 (点击展开) -->
  <div v-else class="alarm-tree-panel alarm-tree-panel--collapsed" title="展开设备列表" @click="expand">
    <el-icon><DArrowLeft /></el-icon>
    <span class="alarm-tree-panel__collapsed-label">设备列表</span>
    <el-badge v-if="chips.length" :value="chips.length" class="alarm-tree-panel__badge" />
  </div>
</template>

<script setup lang="ts">
/**
 * AlarmDeviceTreePanel.vue — [P3 2026-09-10] 告警列表右侧设备树筛选面板
 *
 * 数据源: securityAreaApi (security_areas) → buildAreaTree 组树 →
 *         "安保区域→子区域→设备(device_ids 叶子)" el-tree (show-checkbox 多选级联)。
 * 契约:   emit selection-change({ channelIds, deviceIds, chips }) —
 *         勾选区域 = 其全子树并集 (collectAreaIdsFromRoots + expandAreaChannels);
 *         页面侧在现有前端过滤管线中追加 channelId/deviceId 命中判定 (零后端改动)。
 * 布局:   280px 右侧可折叠侧栏, 面板标题「设备列表」。
 */
import { ref, computed, onMounted } from 'vue'
import { securityAreaApi } from '@/api/securityAreas'
import type { SecurityArea } from '@/api/securityAreas'
import {
  buildAreaTree,
  areaTreeToElTreeData,
  collectAreaIdsFromRoots,
  expandAreaChannels,
} from '@/utils/areaTree'
import { DArrowLeft, DArrowRight, Sort } from '@element-plus/icons-vue'

/** 已选条件 chip (勾选节点粒度, 可单个移除) */
interface TreeChip { key: string; name: string }

/** 选择变更载荷: 页面过滤管线消费的展开集合 + chips 展示态 */
export interface AlarmTreeSelection {
  /** 区域勾选展开的全子树通道集合 (resolved_channel_ids ∪ channel_ids) */
  channelIds: string[]
  /** 设备集合 (勾选设备叶子 + 勾选区域子树 device_ids 并集) */
  deviceIds: string[]
  /** 已选条件 chips */
  chips: TreeChip[]
}

const emit = defineEmits<{ (e: 'selection-change', sel: AlarmTreeSelection): void }>()

const props = defineProps<{
  /** 区块内嵌入场景 (如加油站事件卡) 默认折叠成竖条, 点击展开 */
  defaultCollapsed?: boolean
}>()

const treeRef = ref()
const collapsed = ref(props.defaultCollapsed ?? false)
const expanded = ref(true)
const treeKey = ref(0)               // default-expand-all 非响应式 → key 重建切换展开态
const areas = ref<SecurityArea[]>([])
const areaRoots = ref<ReturnType<typeof buildAreaTree>>([])
const areaById = ref(new Map<string, SecurityArea>())
const checkedKeys = ref<string[]>([])
const chips = ref<TreeChip[]>([])

interface TreeRow { key: string; label: string; area?: SecurityArea; deviceId?: string; children: unknown[]; [k: string]: unknown }

const treeData = computed<TreeRow[]>(() =>
  areaTreeToElTreeData(areaRoots.value, (n) =>
    (n.area.device_ids || []).map((d) => ({
      key: `dev:${d}`,
      label: d,
      deviceId: d,
      children: [],
    })) as TreeRow[]
  ) as TreeRow[]
)

async function loadTree() {
  try {
    const res = await securityAreaApi.listAreas() as any
    // [FIX 2026-09-10 真机] 后端响应体为 {code,data:{items:[...]}} — 解包链补 .items 分支 +
    // 数组守卫 (原链终末 res.data.data 兑底拿到 items 包裹对象, list.map 抛错 → 树恒空)
    const rawList = res?.data?.data?.areas ?? res?.data?.data?.items ?? res?.data?.data ?? res?.data ?? []
    const list: SecurityArea[] = Array.isArray(rawList) ? rawList : []
    areas.value = list
    areaById.value = new Map(list.map(a => [a.id, a]))
    areaRoots.value = buildAreaTree(list)
    treeKey.value++
  } catch { console.error('加载安保区域树失败') }
}

/** 勾选变化 → 展开为通道/设备集合并 emit (区域勾选 = 全子树并集语义) */
function emitSelection() {
  const nodes = (treeRef.value?.getCheckedNodes() ?? []) as TreeRow[]
  const areaKeys: string[] = []
  const deviceIds = new Set<string>()
  const nextChips: TreeChip[] = []
  for (const n of nodes) {
    nextChips.push({ key: n.key, name: n.label })
    if (n.deviceId) {
      deviceIds.add(n.deviceId)
    } else {
      areaKeys.push(n.key)
    }
  }
  // 区域勾选 → 子树全量区域 → resolved 通道 + device_ids 并集
  if (areaKeys.length) {
    const subIds = collectAreaIdsFromRoots(areaRoots.value, areaKeys)
    const subAreas = subIds.map(id => areaById.value.get(id)).filter((a): a is SecurityArea => !!a)
    for (const a of subAreas) for (const d of a.device_ids || []) deviceIds.add(d)
    const channelSet = expandAreaChannels(subAreas)
    chips.value = nextChips
    emit('selection-change', {
      channelIds: Array.from(channelSet),
      deviceIds: Array.from(deviceIds),
      chips: nextChips,
    })
  } else {
    chips.value = nextChips
    emit('selection-change', { channelIds: [], deviceIds: Array.from(deviceIds), chips: nextChips })
  }
}

/** 移除单个 chip = 取消该节点勾选 (区域节点取消含其子树级联) */
function removeChip(key: string) {
  treeRef.value?.setChecked(key, false, true)
  emitSelection()
}

function clearAll() {
  treeRef.value?.setCheckedKeys([])
  emitSelection()
}

function toggleExpand() {
  expanded.value = !expanded.value
  const nodes = treeRef.value?.store?.nodesMap ?? {}
  Object.values(nodes).forEach((node: any) => { node.expanded = expanded.value })
}

function collapse() { collapsed.value = true }
function expand() { collapsed.value = false }

onMounted(loadTree)
</script>

<style scoped>
.alarm-tree-panel {
  width: 280px;
  flex-shrink: 0;
  background: var(--el-bg-color);
  border-radius: 8px;
  padding: 12px;
  height: calc(100vh - 110px);
  /*max-height: calc(100vh - 32px);*/
  min-height: 0;
  box-sizing: border-box;
  align-self: flex-start;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
}
.alarm-tree-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.alarm-tree-panel__title { font-weight: 600; font-size: 14px; }
.alarm-tree-panel__ops { display: flex; gap: 2px; }
.alarm-tree-panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.alarm-tree-panel :deep(.el-tree-node__content) { height: 28px; }
.alarm-tree-panel__body { flex: 1; min-height: 0; overflow: auto; }

/* 折叠态细竖条 */
.alarm-tree-panel--collapsed {
  width: 32px;
  padding: 12px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--el-color-primary);
}
.alarm-tree-panel__collapsed-label {
  writing-mode: vertical-lr;
  letter-spacing: 4px;
  font-size: 12px;
}
.alarm-tree-panel__badge :deep(.el-badge__content) { position: static; transform: none; }
</style>
