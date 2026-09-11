<template>
  <div class="sam-root">
    <el-card shadow="never">
    <!-- ── 顶部工具栏 ── -->
    <div class="sam-toolbar">
      <div class="sam-toolbar-left">
        <span class="sam-title">安保区域管理</span>
        <span class="sam-sub">区域即管理单位：多级区域树圈定通道范围，规则空间条件按区域触发</span>
      </div>
      <div class="sam-toolbar-right">
        <el-input v-model="keyword" placeholder="搜索区域名称" clearable :prefix-icon="Search" style="width: 200px" />
        <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 120px">
          <el-option label="按位置" value="LOCATION" />
          <el-option label="按用途" value="PURPOSE" />
          <el-option label="自定义" value="CUSTOM" />
        </el-select>
        <el-button type="primary" :icon="Plus" @click="openCreate()">新建区域</el-button>
        <el-button :icon="Refresh" @click="loadAreas" />
      </div>
    </div>

    <div class="sam-body">
      <!-- ── 左侧：安保区域树 (区域→子区域→挂载设备) ── -->
      <div class="sam-tree-panel">
        <div class="sam-tree-head">
          <span class="sam-tree-title">区域树</span>
          <el-button link size="small" @click="toggleExpandAll">
            {{ expandAll ? '折叠' : '展开' }}
          </el-button>
        </div>
        <el-tree
          :key="expandAll ? 'expanded' : 'collapsed'"
          ref="treeRef"
          :data="treeData"
          node-key="key"
          :props="{ label: 'label', children: 'children' }"
          :default-expand-all="expandAll"
          :filter-node-method="filterNode"
          :expand-on-click-node="false"
          highlight-current
          class="sam-tree"
        >
          <template #default="{ data }">
            <div
              class="sam-node"
              :class="{ 'is-active': data.type === 'area' && selectedId === data.key, 'is-archived': data.type === 'area' && data.area.status === 'archived' }"
              @click="onNodeClick(data)"
            >
              <template v-if="data.type === 'area'">
                <el-tag size="small" :type="typeTagOf(data.area.area_type)">{{ typeLabelOf(data.area.area_type) }}</el-tag>
                <span class="sam-node-name">{{ data.label }}</span>
                <span class="sam-node-meta">{{ data.area.device_count ?? (data.area.device_ids?.length || 0) }} 设备</span>
                <span class="sam-node-actions" @click.stop>
                  <el-button link type="primary" size="small" @click="openCreate(data.key)">加子区域</el-button>
                  <el-button link type="primary" size="small" @click="openEdit(data.area)">编辑</el-button>
                  <el-button link size="small" @click="toggleArchive(data.area)">{{ data.area.status === 'archived' ? '恢复' : '归档' }}</el-button>
                  <el-button link type="danger" size="small" @click="removeArea(data.area)">删除</el-button>
                </span>
              </template>
              <template v-else>
                <el-icon class="sam-node-dev-icon"><VideoCamera /></el-icon>
                <span class="sam-node-name sam-node-device">{{ data.label }}</span>
                <span class="sam-node-meta">{{ data.deviceIp }}</span>
              </template>
            </div>
          </template>
        </el-tree>
        <el-empty v-if="!loading && treeData.length === 0" description="暂无区域，点击右上角新建" :image-size="64" />
      </div>

      <!-- ── 右侧：区域详情 + 设备挂载绑定 ── -->
      <div class="sam-detail">
        <template v-if="current">
          <div class="sam-detail-head">
            <div>
              <div class="sam-detail-name">
                {{ current.name }}
                <el-tag size="small" :type="typeTagOf(current.area_type)">{{ typeLabelOf(current.area_type) }}</el-tag>
                <el-tag v-if="current.status === 'archived'" size="small" type="info">已归档</el-tag>
              </div>
              <div class="sam-detail-desc">
                {{ current.description || '暂无描述' }}
                <template v-if="parentOf(current)"> · 上级：{{ parentOf(current)!.name }}</template>
              </div>
            </div>
            <el-button type="primary" :loading="saving" :disabled="current.status === 'archived'" @click="saveMembers">
              保存成员绑定
            </el-button>
          </div>

          <!-- 成员绑定：设备/通道勾选（模糊搜索 + 通道级绑定，海康"通道分配到区域"语义） -->
          <div class="sam-bind">
            <div class="sam-bind-toolbar">
              <el-input v-model="devKeyword" placeholder="搜索设备名称 / IP / 位置" clearable :prefix-icon="Search" style="width: 240px" size="small" />
              <span class="sam-stats-hint">
                已选 <b>{{ draftDeviceIds.length }}</b> 台设备 ·
                生效通道 <b>{{ resolvedPreview.length }}</b> 路
                <template v-if="draftChannelIds.length">（含显式绑定 {{ draftChannelIds.length }} 路）</template>
              </span>
            </div>
            <div class="sam-dev-list">
              <div v-for="d in filteredDevices" :key="d.id" class="sam-dev">
                <div class="sam-dev-row">
                  <el-checkbox
                    :model-value="isDeviceChecked(d)"
                    :indeterminate="isDevicePartial(d)"
                    @change="toggleDevice(d, $event as boolean)"
                  >
                    <span class="sam-dev-name">{{ d.name }}</span>
                    <span class="sam-dev-ip">{{ d.ip }}</span>
                  </el-checkbox>
                  <el-button link size="small" @click="toggleExpand(d)">
                    {{ expanded.has(d.id) ? '收起' : `${channelsOf(d.id).length} 通道` }}
                  </el-button>
                </div>
                <div v-if="expanded.has(d.id)" class="sam-chs">
                  <el-checkbox
                    v-for="ch in channelsOf(d.id)" :key="ch.id"
                    :model-value="isChannelExplicit(ch)"
                    @change="toggleChannel(ch, $event as boolean)"
                  >
                    <span class="sam-ch-name">{{ ch.name }}</span>
                    <span class="sam-ch-meta">{{ ch.id }}</span>
                  </el-checkbox>
                </div>
              </div>
              <el-empty v-if="!loadingDevs && filteredDevices.length === 0" description="无匹配设备" :image-size="48" />
            </div>
          </div>

          <!-- 预览：resolved 快照（需求"按区域预览设备清单"） -->
          <div class="sam-preview">
            <div class="sam-preview-title">
              生效通道预览（resolved = 显式通道 ∪ 所选设备全部通道）
              <el-tag size="small" type="success">{{ resolvedPreview.length }} 路</el-tag>
            </div>
            <div class="sam-preview-list">
              <el-tag v-for="c in resolvedPreview.slice(0, 60)" :key="c" size="small" class="sam-preview-chip">{{ c }}</el-tag>
              <span v-if="resolvedPreview.length > 60" class="sam-stats-hint">…等 {{ resolvedPreview.length }} 路</span>
              <span v-if="resolvedPreview.length === 0" class="sam-stats-hint">空区域：引用该区域的规则将不触发（收窄语义）</span>
            </div>
          </div>
        </template>
        <el-empty v-else description="从左侧区域树选择一个区域，绑定设备与通道" />
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="dlgVisible" :title="editing ? '编辑安保区域' : '新建安保区域'" width="440px">
      <el-form label-position="top">
        <el-form-item label="区域名称" required>
          <el-input v-model="form.name" placeholder="如：东区周界 / 停车场出入口" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="区域类型">
          <el-radio-group v-model="form.area_type">
            <el-radio value="LOCATION">按位置</el-radio>
            <el-radio value="PURPOSE">按用途</el-radio>
            <el-radio value="CUSTOM">自定义</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
        <el-form-item label="上级区域（可选，多级树管理）">
          <el-select v-model="form.parent_id" placeholder="不选 = 顶级区域" clearable style="width: 100%">
            <el-option v-for="p in parentCandidates" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序值（越小越靠前）">
          <el-input-number v-model="form.sort_order" :min="0" :max="9999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="dlgSaving" @click="submitDlg">保存</el-button>
      </template>
    </el-dialog>
      </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * SecurityAreaManager.vue — 安保区域管理页 [P1.3 2026-09-10 全量更名]
 *   (原 DeviceGroupManager.vue "设备分组管理页"; 左侧升级为多级区域树)
 *
 * 对标落地: 海康 iSC"区域树+监控点分配到区域" / 华为"分组即管理单位"三步动线 /
 *   大华组织树 parent 层级 / 华为归档语义(归档不删数据)。
 * 左侧树: 区域→子区域→(挂载设备叶子, 只读反查); 节点上直接"加子区域/编辑/归档/删除"。
 * 右侧: 区域详情 + 设备/通道全量绑定 (setMembers, resolved 快照后端重算)。
 * 与联动规则的关系: 空间条件 area_id 引用本页区域 id (存量 device_group_id 双键兼容),
 *   LinkageEngine 匹配时按 resolved 通道快照展开 (任一命中即通过)。
 */
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Refresh, VideoCamera } from '@element-plus/icons-vue'
import { securityAreaApi, type SecurityArea } from '@/api/securityAreas'
import { buildAreaTree, areaTreeToElTreeData } from '@/utils/areaTree'
import { deviceApi } from '@/api/device'
import { channelApi } from '@/api/channel'
import type { DeviceItem, ChannelItem } from '@/types/device'

const loading = ref(false)
const areas = ref<SecurityArea[]>([])
const selectedId = ref('')
const keyword = ref('')
const typeFilter = ref('')
const expandAll = ref(true)
const treeRef = ref()

// 成员绑定草稿 (全量覆盖语义: 勾选结果整体提交)
const draftDeviceIds = ref<string[]>([])
const draftChannelIds = ref<string[]>([])   // 国标字符串 (显式通道绑定)
const saving = ref(false)

const devices = ref<DeviceItem[]>([])
const channels = ref<ChannelItem[]>([])
const loadingDevs = ref(false)
const devKeyword = ref('')
const expanded = reactive(new Set<string>())

// 新建/编辑对话框
const dlgVisible = ref(false)
const editing = ref<SecurityArea | null>(null)
const dlgSaving = ref(false)
const form = reactive({ name: '', area_type: 'CUSTOM', description: '', parent_id: '', sort_order: 0 })

const current = computed(() => areas.value.find(g => g.id === selectedId.value) || null)

/** 可作为上级的候选: 编辑时排除自身与全部后代 (防环) */
const parentCandidates = computed(() => {
  if (!editing.value) return areas.value
  const banned = new Set<string>([editing.value.id])
  const collect = (pid: string) => {
    for (const g of areas.value) {
      if (g.parent_id === pid && !banned.has(g.id)) { banned.add(g.id); collect(g.id) }
    }
  }
  collect(editing.value.id)
  return areas.value.filter(g => !banned.has(g.id))
})

const parentOf = (a: SecurityArea) =>
  (a.parent_id ? areas.value.find(x => x.id === a.parent_id) : null) || null

const filteredAreas = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return areas.value.filter(g => {
    if (kw && !g.name.toLowerCase().includes(kw)) return false
    if (typeFilter.value && g.area_type !== typeFilter.value) return false
    return true
  })
})

/** 左侧树数据: 区域层级 (buildAreaTree) + 每区域下挂设备叶子 (只读反查) */
const treeData = computed(() =>
  areaTreeToElTreeData(buildAreaTree(filteredAreas.value), (n) =>
    (n.area.device_ids || []).map(id => {
      const d = devices.value.find(x => x.id === id)
      return { key: `dev:${id}`, label: d?.name || id, type: 'device', deviceIp: d?.ip || '', area: null as unknown as SecurityArea, children: [] }
    })))

function filterNode(value: string, data: any) {
  if (!value) return true
  return String(data?.label ?? '').toLowerCase().includes(String(value).toLowerCase())
}
watch(keyword, (v) => treeRef.value?.filter?.(v))

function onNodeClick(data: { type: string; key: string; area?: SecurityArea }) {
  if (data.type === 'area' && data.area) selectArea(data.area)
}

/** 展开/折叠: default-expand-all 为初始值, 改 :key 重建 el-tree 生效 */
function toggleExpandAll() {
  expandAll.value = !expandAll.value
}

const filteredDevices = computed(() => {
  const kw = devKeyword.value.trim().toLowerCase()
  if (!kw) return devices.value
  return devices.value.filter(d => `${d.name} ${d.ip} ${d.location || ''}`.toLowerCase().includes(kw))
})

/** resolved 预览 = 显式通道 ∪ 所选设备的全部通道 (与后端 setMembers 同语义本地预演) */
const resolvedPreview = computed(() => {
  const set = new Set(draftChannelIds.value)
  for (const did of draftDeviceIds.value) {
    for (const ch of channelsOf(did)) set.add(ch.id)
  }
  return [...set].sort()
})

function channelsOf(deviceId: string): ChannelItem[] {
  return channels.value.filter(ch => String(ch.deviceId) === String(deviceId))
}
function isDeviceChecked(d: DeviceItem): boolean {
  return draftDeviceIds.value.includes(d.id)
}
function isDevicePartial(d: DeviceItem): boolean {
  const chs = channelsOf(d.id)
  if (!chs.length) return false
  const inherit = draftDeviceIds.value.includes(d.id)
  const explicit = chs.filter(isChannelExplicit).length
  if (inherit) return explicit > 0 && explicit < chs.length   // 继承 + 反选部分
  return explicit > 0 && explicit < chs.length
}
function isChannelExplicit(ch: ChannelItem): boolean {
  // 设备勾选 → 通道继承生效; 通道在显式集且其设备未勾选 → 独立绑定
  if (draftDeviceIds.value.includes(String(ch.deviceId))) return true
  return draftChannelIds.value.includes(ch.id)
}
function toggleDevice(d: DeviceItem, checked: boolean) {
  const s = new Set(draftDeviceIds.value)
  if (checked) s.add(d.id)
  else {
    s.delete(d.id)
    // 反勾设备: 移除其显式通道绑定 (继承态自动失效)
    draftChannelIds.value = draftChannelIds.value.filter(
      cid => !channelsOf(d.id).some(ch => ch.id === cid))
  }
  draftDeviceIds.value = [...s]
}
function toggleChannel(ch: ChannelItem, checked: boolean) {
  const s = new Set(draftChannelIds.value)
  const inherited = draftDeviceIds.value.includes(String(ch.deviceId))
  if (checked) s.add(ch.id)
  else {
    s.delete(ch.id)
    if (inherited) {
      // 继承态反选: 反勾设备 + 仅显式保留其余通道 (排除集语义)
      const others = new Set<string>()
      for (const did of draftDeviceIds.value) {
        if (did === String(ch.deviceId)) continue
        for (const c of channelsOf(did)) others.add(c.id)
      }
      for (const cid of draftChannelIds.value) others.add(cid)
      draftDeviceIds.value = draftDeviceIds.value.filter(did => did !== String(ch.deviceId))
      s.clear()
      for (const cid of others) s.add(cid)
    }
  }
  draftChannelIds.value = [...s]
}
function toggleExpand(d: DeviceItem) {
  if (expanded.has(d.id)) expanded.delete(d.id)
  else expanded.add(d.id)
}

const TYPE_LABELS: Record<string, string> = { LOCATION: '按位置', PURPOSE: '按用途', CUSTOM: '自定义' }
const typeLabelOf = (t: string) => TYPE_LABELS[t] || '自定义'
const typeTagOf = (t: string): 'success' | 'warning' | 'info' => (t === 'LOCATION' ? 'success' : t === 'PURPOSE' ? 'warning' : 'info')

async function loadAreas() {
  loading.value = true
  try {
    const res = await securityAreaApi.listAreas({ include_archived: true })
    const data = (res as any)?.data?.data ?? (res as any)?.data
    areas.value = data?.items || []
    if (!areas.value.find(g => g.id === selectedId.value)) selectedId.value = ''
  } catch (e: any) {
    ElMessage.error(`加载安保区域失败: ${e?.message || e}`)
  } finally {
    loading.value = false
  }
}

function selectArea(a: SecurityArea) {
  selectedId.value = a.id
  // 从服务端成员态重建草稿 (全量覆盖语义)
  draftDeviceIds.value = [...(a.device_ids || [])]
  draftChannelIds.value = [...(a.channel_ids || [])]
}

async function loadDevices() {
  loadingDevs.value = true
  try {
    const [devRes, chRes] = await Promise.all([
      deviceApi.getList({ page: 1, pageSize: 500 }),
      channelApi.getList({ page: 1, pageSize: 1000 }),
    ])
    // [FIX 2026-09-10 真机] axios 信封两层剥壳 (对照 DeviceChannelPicker/GasScenePacks 的
    // res.data.data 惯例): 原只剥一层拿到 {code,data:{items}} 信封, 兑底把信封赋给
    // channels.value (非数组) → 详情面板 channelsOf() .filter 渲染崩溃
    const unwrap = (r: any): any[] => {
      const d = r?.data?.data ?? r?.data
      return (Array.isArray(d) ? d : (d?.items ?? d?.list ?? [])) || []
    }
    devices.value = unwrap(devRes) as DeviceItem[]
    channels.value = unwrap(chRes) as ChannelItem[]
  } finally {
    loadingDevs.value = false
  }
}

/** 新建: parentId 传入时=树节点"加子区域"快捷入口 */
function openCreate(parentId = '') {
  editing.value = null
  Object.assign(form, { name: '', area_type: 'CUSTOM', description: '', parent_id: parentId, sort_order: 0 })
  dlgVisible.value = true
}
function openEdit(a: SecurityArea) {
  editing.value = a
  Object.assign(form, {
    name: a.name, area_type: a.area_type || 'CUSTOM', description: a.description || '',
    parent_id: a.parent_id || '', sort_order: a.sort_order || 0,
  })
  dlgVisible.value = true
}
async function submitDlg() {
  if (!form.name.trim()) { ElMessage.warning('请填写区域名称'); return }
  dlgSaving.value = true
  try {
    if (editing.value) {
      await securityAreaApi.updateArea(editing.value.id, { ...form })
      ElMessage.success('安保区域已更新')
    } else {
      const res = await securityAreaApi.createArea({ ...form })
      const data = (res as any)?.data?.data ?? (res as any)?.data
      if (data?.id) selectedId.value = data.id
      ElMessage.success('安保区域已创建')
    }
    dlgVisible.value = false
    await loadAreas()
  } catch (e: any) {
    ElMessage.error(`保存失败: ${e?.message || e}`)
  } finally {
    dlgSaving.value = false
  }
}

async function toggleArchive(a: SecurityArea) {
  const to = a.status === 'archived' ? 'active' : 'archived'
  try {
    await securityAreaApi.updateArea(a.id, { status: to })
    ElMessage.success(to === 'archived' ? '已归档 (规则引用保留)' : '已恢复')
    await loadAreas()
  } catch (e: any) {
    ElMessage.error(`操作失败: ${e?.message || e}`)
  }
}

async function removeArea(a: SecurityArea) {
  try {
    await ElMessageBox.confirm(
      `确定删除区域「${a.name}」？子区域将提升为顶级；已引用该区域的规则按旧语义保留引用 (区域不存在时规则不再经该维度触发)。`,
      '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch { return }
  try {
    await securityAreaApi.deleteArea(a.id)
    ElMessage.success('已删除')
    if (selectedId.value === a.id) selectedId.value = ''
    await loadAreas()
  } catch (e: any) {
    ElMessage.error(`删除失败: ${e?.message || e}`)
  }
}

async function saveMembers() {
  if (!current.value) return
  saving.value = true
  try {
    const res = await securityAreaApi.setMembers(current.value.id, {
      device_ids: draftDeviceIds.value,
      channel_ids: draftChannelIds.value,
    })
    const data = (res as any)?.data?.data ?? (res as any)?.data
    ElMessage.success(`成员已保存：生效 ${data?.channel_count ?? resolvedPreview.value.length} 路`)
    await loadAreas()
    // 刷新后保持选中并重建草稿
    if (current.value) selectArea(current.value)
  } catch (e: any) {
    ElMessage.error(`保存失败: ${e?.message || e}`)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadAreas(), loadDevices()])
})
</script>

<style scoped>
.sam-root { display: flex; flex-direction: column; gap: 12px; height: 100%; }
.sam-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom:14px;}
.sam-toolbar-left { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.sam-title { font-size: 16px; font-weight: 600; }
.sam-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.sam-toolbar-right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.sam-body { display: flex; gap: 12px; flex: 1; min-height: 0; }
/* ── 左侧区域树 ── */
.sam-tree-panel { width: 360px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.sam-tree-head { display: flex; align-items: center; justify-content: space-between; }
.sam-tree-title { font-size: 13px; font-weight: 600; color: var(--el-text-color-regular); }
.sam-tree { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 6px; }
.sam-node { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; padding: 2px 4px; border-radius: 6px; }
.sam-node.is-active { background: var(--el-color-primary-light-9); }
.sam-node.is-archived { opacity: .55; }
.sam-node-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sam-node.is-active .sam-node-name { font-weight: 600; }
.sam-node-device { color: var(--el-text-color-secondary); }
.sam-node-dev-icon { font-size: 13px; color: var(--el-text-color-secondary); flex-shrink: 0; }
.sam-node-meta { font-size: 11px; color: var(--el-text-color-secondary); margin-left: auto; flex-shrink: 0; }
.sam-node-actions { display: none; align-items: center; margin-left: auto; flex-shrink: 0; }
.sam-node:hover .sam-node-actions { display: inline-flex; }
.sam-node:hover .sam-node-meta { display: none; }
/* ── 右侧详情/绑定 ── */
.sam-detail { flex: 1; min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
.sam-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.sam-detail-name { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.sam-detail-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.sam-bind { display: flex; flex-direction: column; gap: 8px; }
.sam-bind-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sam-stats-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.sam-dev-list { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; max-height: 360px; overflow: auto; }
.sam-dev { border-bottom: 1px solid var(--el-border-color-extra-light); padding: 6px 10px; }
.sam-dev:last-child { border-bottom: none; }
.sam-dev-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sam-dev-name { font-weight: 600; }
.sam-dev-ip { font-family: monospace; font-size: 12px; color: var(--el-text-color-secondary); margin-left: 6px; }
.sam-chs { display: flex; flex-direction: column; gap: 2px; padding: 6px 28px; background: var(--el-fill-color-extra-light); border-radius: 4px; margin-top: 4px; }
.sam-ch-name { font-size: 13px; }
.sam-ch-meta { font-size: 11px; color: var(--el-text-color-secondary); margin-left: 6px; font-family: monospace; }
.sam-preview { display: flex; flex-direction: column; gap: 6px; }
.sam-preview-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.sam-preview-list { display: flex; flex-wrap: wrap; gap: 4px; }
.sam-preview-chip { font-family: monospace; }
/* 平板 1024 适配 */
@media (max-width: 1024px) {
  .sam-body { flex-direction: column; }
  .sam-tree-panel { width: 100%; max-height: 280px; }
}
</style>
