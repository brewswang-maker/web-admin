<template>
  <div class="dgm-root">
    <!-- ── 顶部工具栏 ── -->
    <div class="dgm-toolbar">
      <div class="dgm-toolbar-left">
        <span class="dgm-title">设备分组管理</span>
        <span class="dgm-sub">分组即管理单位：规则的空间条件可按分组圈定通道范围</span>
      </div>
      <div class="dgm-toolbar-right">
        <el-input v-model="keyword" placeholder="搜索分组名称" clearable :prefix-icon="Search" style="width: 200px" />
        <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 120px">
          <el-option label="按位置" value="LOCATION" />
          <el-option label="按用途" value="PURPOSE" />
          <el-option label="自定义" value="CUSTOM" />
        </el-select>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建分组</el-button>
        <el-button :icon="Refresh" @click="loadGroups" />
      </div>
    </div>

    <div class="dgm-body">
      <!-- ── 左侧：分组列表 ── -->
      <div class="dgm-list">
        <div
          v-for="g in filteredGroups" :key="g.id"
          class="dgm-item" :class="{ 'is-active': selectedId === g.id, 'is-archived': g.status === 'archived' }"
          @click="selectGroup(g)"
        >
          <div class="dgm-item-head">
            <el-tag size="small" :type="typeTagOf(g.group_type)">{{ typeLabelOf(g.group_type) }}</el-tag>
            <span class="dgm-item-name">{{ g.name }}</span>
          </div>
          <div class="dgm-item-meta">
            <span>{{ g.device_count ?? g.device_ids.length }} 设备</span>
            <el-divider direction="vertical" />
            <span>{{ g.channel_count ?? g.resolved_channel_ids.length }} 通道</span>
            <el-tag v-if="g.status === 'archived'" size="small" type="info">已归档</el-tag>
          </div>
          <div class="dgm-item-actions" @click.stop>
            <el-button link type="primary" size="small" @click="openEdit(g)">编辑</el-button>
            <el-button link size="small" @click="toggleArchive(g)">{{ g.status === 'archived' ? '恢复' : '归档' }}</el-button>
            <el-button link type="danger" size="small" @click="removeGroup(g)">删除</el-button>
          </div>
        </div>
        <el-empty v-if="!loading && filteredGroups.length === 0" description="暂无分组，点击右上角新建" :image-size="64" />
      </div>

      <!-- ── 右侧：分组详情 + 成员绑定 ── -->
      <div class="dgm-detail">
        <template v-if="current">
          <div class="dgm-detail-head">
            <div>
              <div class="dgm-detail-name">{{ current.name }}</div>
              <div class="dgm-detail-desc">{{ current.description || '暂无描述' }}</div>
            </div>
            <el-button type="primary" :loading="saving" :disabled="current.status === 'archived'" @click="saveMembers">
              保存成员绑定
            </el-button>
          </div>

          <!-- 成员绑定：设备/通道勾选（模糊搜索 + 通道级绑定，海康"通道分配到区域"语义） -->
          <div class="dgm-bind">
            <div class="dgm-bind-toolbar">
              <el-input v-model="devKeyword" placeholder="搜索设备名称 / IP / 位置" clearable :prefix-icon="Search" style="width: 240px" size="small" />
              <span class="dcp-stats-hint">
                已选 <b>{{ draftDeviceIds.length }}</b> 台设备 ·
                生效通道 <b>{{ resolvedPreview.length }}</b> 路
                <template v-if="draftChannelIds.length">（含显式绑定 {{ draftChannelIds.length }} 路）</template>
              </span>
            </div>
            <div class="dgm-dev-list">
              <div v-for="d in filteredDevices" :key="d.id" class="dgm-dev">
                <div class="dgm-dev-row">
                  <el-checkbox
                    :model-value="isDeviceChecked(d)"
                    :indeterminate="isDevicePartial(d)"
                    @change="toggleDevice(d, $event as boolean)"
                  >
                    <span class="dgm-dev-name">{{ d.name }}</span>
                    <span class="dgm-dev-ip">{{ d.ip }}</span>
                  </el-checkbox>
                  <el-button link size="small" @click="toggleExpand(d)">
                    {{ expanded.has(d.id) ? '收起' : `${channelsOf(d.id).length} 通道` }}
                  </el-button>
                </div>
                <div v-if="expanded.has(d.id)" class="dgm-chs">
                  <el-checkbox
                    v-for="ch in channelsOf(d.id)" :key="ch.id"
                    :model-value="isChannelExplicit(ch)"
                    @change="toggleChannel(ch, $event as boolean)"
                  >
                    <span class="dgm-ch-name">{{ ch.name }}</span>
                    <span class="dgm-ch-meta">{{ ch.id }}</span>
                  </el-checkbox>
                </div>
              </div>
              <el-empty v-if="!loadingDevs && filteredDevices.length === 0" description="无匹配设备" :image-size="48" />
            </div>
          </div>

          <!-- 预览：resolved 快照（需求"按分组预览设备清单"） -->
          <div class="dgm-preview">
            <div class="dgm-preview-title">
              生效通道预览（resolved = 显式通道 ∪ 所选设备全部通道）
              <el-tag size="small" type="success">{{ resolvedPreview.length }} 路</el-tag>
            </div>
            <div class="dgm-preview-list">
              <el-tag v-for="c in resolvedPreview.slice(0, 60)" :key="c" size="small" class="dgm-preview-chip">{{ c }}</el-tag>
              <span v-if="resolvedPreview.length > 60" class="dcp-stats-hint">…等 {{ resolvedPreview.length }} 路</span>
              <span v-if="resolvedPreview.length === 0" class="dcp-stats-hint">空分组：引用该分组的规则将不触发（收窄语义）</span>
            </div>
          </div>
        </template>
        <el-empty v-else description="从左侧选择一个分组，绑定设备与通道" />
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="dlgVisible" :title="editing ? '编辑分组' : '新建分组'" width="440px">
      <el-form label-position="top">
        <el-form-item label="分组名称" required>
          <el-input v-model="form.name" placeholder="如：东区周界 / 停车场出入口" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="分组类型">
          <el-radio-group v-model="form.group_type">
            <el-radio value="LOCATION">按位置</el-radio>
            <el-radio value="PURPOSE">按用途</el-radio>
            <el-radio value="CUSTOM">自定义</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
        <el-form-item label="父分组（可选，层级管理）">
          <el-select v-model="form.parent_id" placeholder="不选 = 顶级分组" clearable style="width: 100%">
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
  </div>
</template>

<script setup lang="ts">
/**
 * DeviceGroupManager.vue — 设备分组管理页 [vp9 2026-09-01]
 *
 * 对标落地: 华为"新增分组→添加分组设备→分组视图"三步动线 /
 *   海康 iSC"监控点分配到区域"通道级成员 / 大华组织树 parent 层级 /
 *   华为归档语义(归档不删数据)。
 * 与联动规则的关系: 空间条件 spatial_cond.device_group_id 引用本页分组 id,
 *   LinkageEngine 匹配时按 resolved 通道快照展开 (任一命中即通过)。
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Refresh } from '@element-plus/icons-vue'
import { deviceGroupApi, type DeviceGroup } from '@/api/deviceGroups'
import { deviceApi } from '@/api/device'
import { channelApi } from '@/api/channel'
import type { DeviceItem, ChannelItem } from '@/types/device'

const loading = ref(false)
const groups = ref<DeviceGroup[]>([])
const selectedId = ref('')
const keyword = ref('')
const typeFilter = ref('')

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
const editing = ref<DeviceGroup | null>(null)
const dlgSaving = ref(false)
const form = reactive({ name: '', group_type: 'CUSTOM', description: '', parent_id: '', sort_order: 0 })

const current = computed(() => groups.value.find(g => g.id === selectedId.value) || null)
const parentCandidates = computed(() => groups.value.filter(g => g.id !== editing.value?.id))

const filteredGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return groups.value.filter(g => {
    if (kw && !g.name.toLowerCase().includes(kw)) return false
    if (typeFilter.value && g.group_type !== typeFilter.value) return false
    return true
  })
})

const filteredDevices = computed(() => {
  const kw = devKeyword.value.trim().toLowerCase()
  if (!kw) return devices.value
  return devices.value.filter(d => `${d.name} ${d.ip} ${d.location || ''}`.toLowerCase().includes(kw))
})

/** resolved 预览 = 显式通道 ∪ 所选设备的全部通道 (与后端 setGroupMembers 同语义本地预演) */
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

async function loadGroups() {
  loading.value = true
  try {
    const res = await deviceGroupApi.listGroups({ include_archived: true })
    const data = (res as any)?.data?.data ?? (res as any)?.data
    groups.value = data?.items || []
    if (!groups.value.find(g => g.id === selectedId.value)) selectedId.value = ''
  } catch (e: any) {
    ElMessage.error(`加载分组失败: ${e?.message || e}`)
  } finally {
    loading.value = false
  }
}

function selectGroup(g: DeviceGroup) {
  selectedId.value = g.id
  // 从服务端成员态重建草稿 (全量覆盖语义)
  draftDeviceIds.value = [...(g.device_ids || [])]
  draftChannelIds.value = [...(g.channel_ids || [])]
}

async function loadDevices() {
  loadingDevs.value = true
  try {
    const [devRes, chRes] = await Promise.all([
      deviceApi.getList({ page: 1, pageSize: 500 }),
      channelApi.getList({ page: 1, pageSize: 1000 }),
    ])
    const devData = (devRes as any)?.data
    devices.value = ((devData?.items ?? devData?.list ?? devData) || []) as DeviceItem[]
    const chData = (chRes as any)?.data
    channels.value = ((chData?.items ?? chData?.list ?? chData) || []) as ChannelItem[]
  } finally {
    loadingDevs.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, { name: '', group_type: 'CUSTOM', description: '', parent_id: '', sort_order: 0 })
  dlgVisible.value = true
}
function openEdit(g: DeviceGroup) {
  editing.value = g
  Object.assign(form, {
    name: g.name, group_type: g.group_type || 'CUSTOM', description: g.description || '',
    parent_id: g.parent_id || '', sort_order: g.sort_order || 0,
  })
  dlgVisible.value = true
}
async function submitDlg() {
  if (!form.name.trim()) { ElMessage.warning('请填写分组名称'); return }
  dlgSaving.value = true
  try {
    if (editing.value) {
      await deviceGroupApi.updateGroup(editing.value.id, { ...form })
      ElMessage.success('分组已更新')
    } else {
      const res = await deviceGroupApi.createGroup({ ...form })
      const data = (res as any)?.data?.data ?? (res as any)?.data
      if (data?.id) selectedId.value = data.id
      ElMessage.success('分组已创建')
    }
    dlgVisible.value = false
    await loadGroups()
  } catch (e: any) {
    ElMessage.error(`保存失败: ${e?.message || e}`)
  } finally {
    dlgSaving.value = false
  }
}

async function toggleArchive(g: DeviceGroup) {
  const to = g.status === 'archived' ? 'active' : 'archived'
  try {
    await deviceGroupApi.updateGroup(g.id, { status: to })
    ElMessage.success(to === 'archived' ? '已归档 (规则引用保留)' : '已恢复')
    await loadGroups()
  } catch (e: any) {
    ElMessage.error(`操作失败: ${e?.message || e}`)
  }
}

async function removeGroup(g: DeviceGroup) {
  try {
    await ElMessageBox.confirm(
      `确定删除分组「${g.name}」？子分组将提升为顶级；已引用该分组的规则按旧语义保留引用 (分组不存在时规则不再经该维度触发)。`,
      '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch { return }
  try {
    await deviceGroupApi.deleteGroup(g.id)
    ElMessage.success('已删除')
    if (selectedId.value === g.id) selectedId.value = ''
    await loadGroups()
  } catch (e: any) {
    ElMessage.error(`删除失败: ${e?.message || e}`)
  }
}

async function saveMembers() {
  if (!current.value) return
  saving.value = true
  try {
    const res = await deviceGroupApi.setMembers(current.value.id, {
      device_ids: draftDeviceIds.value,
      channel_ids: draftChannelIds.value,
    })
    const data = (res as any)?.data?.data ?? (res as any)?.data
    ElMessage.success(`成员已保存：生效 ${data?.channel_count ?? resolvedPreview.value.length} 路`)
    await loadGroups()
    // 刷新后保持选中并重建草稿
    if (current.value) selectGroup(current.value)
  } catch (e: any) {
    ElMessage.error(`保存失败: ${e?.message || e}`)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadGroups(), loadDevices()])
})
</script>

<style scoped>
.dgm-root { display: flex; flex-direction: column; gap: 12px; height: 100%; }
.dgm-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.dgm-toolbar-left { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.dgm-title { font-size: 16px; font-weight: 600; }
.dgm-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.dgm-toolbar-right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dgm-body { display: flex; gap: 12px; flex: 1; min-height: 0; }
.dgm-list { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; overflow: auto; }
.dgm-item { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 10px 12px; cursor: pointer; transition: border-color .15s; }
.dgm-item:hover { border-color: var(--el-color-primary-light-5); }
.dgm-item.is-active { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.dgm-item.is-archived { opacity: .55; }
.dgm-item-head { display: flex; align-items: center; gap: 6px; }
.dgm-item-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dgm-item-meta { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.dgm-item-actions { display: flex; gap: 0; margin-top: 4px; }
.dgm-detail { flex: 1; min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
.dgm-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.dgm-detail-name { font-size: 15px; font-weight: 600; }
.dgm-detail-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.dgm-bind { display: flex; flex-direction: column; gap: 8px; }
.dgm-bind-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dgm-dev-list { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; max-height: 360px; overflow: auto; }
.dgm-dev { border-bottom: 1px solid var(--el-border-color-extra-light); padding: 6px 10px; }
.dgm-dev:last-child { border-bottom: none; }
.dgm-dev-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dgm-dev-name { font-weight: 600; }
.dgm-dev-ip { font-family: monospace; font-size: 12px; color: var(--el-text-color-secondary); margin-left: 6px; }
.dgm-chs { display: flex; flex-direction: column; gap: 2px; padding: 6px 28px; background: var(--el-fill-color-extra-light); border-radius: 4px; margin-top: 4px; }
.dgm-ch-name { font-size: 13px; }
.dgm-ch-meta { font-size: 11px; color: var(--el-text-color-secondary); margin-left: 6px; font-family: monospace; }
.dgm-preview { display: flex; flex-direction: column; gap: 6px; }
.dgm-preview-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.dgm-preview-list { display: flex; flex-wrap: wrap; gap: 4px; }
.dgm-preview-chip { font-family: monospace; }
/* 平板 1024 适配 */
@media (max-width: 1024px) {
  .dgm-body { flex-direction: column; }
  .dgm-list { width: 100%; max-height: 240px; }
}
</style>
