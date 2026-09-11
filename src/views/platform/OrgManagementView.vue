<template>
  <div class="org-management">
    <div class="page-header">
      <h2>组织架构管理</h2>
      <div>
        <el-button @click="refreshAll" :loading="loading">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
        <el-button type="primary" @click="openOrgCreate('')">
          <el-icon><Plus /></el-icon> 新增组织
        </el-button>
      </div>
    </div>

    <div class="om-body">
      <!-- ── 左侧：组织树 (任意多级, 增/删/改/加子级) ── -->
      <el-card class="om-tree-panel" shadow="never">
        <div class="om-tree-head">
          <span class="om-tree-title">组织树</span>
          <el-button link size="small" @click="expandAll = !expandAll">
            {{ expandAll ? '折叠' : '展开' }}
          </el-button>
        </div>
        <el-tree
          :key="expandAll ? 'expanded' : 'collapsed'"
          :data="orgTreeData"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          :default-expand-all="expandAll"
          :expand-on-click-node="false"
          highlight-current
          class="om-tree"
        >
          <template #default="{ data }">
            <div
              class="om-node"
              :class="{ 'is-active': selectedOrgId === data.id }"
              @click="selectOrg(data.id)"
            >
              <el-icon class="om-node-icon"><OfficeBuilding /></el-icon>
              <span class="om-node-name">{{ data.name }}</span>
              <span class="om-node-count">{{ userCountOf(data.id) }}</span>
              <span class="om-node-actions" @click.stop>
                <el-button link type="primary" size="small" @click="openOrgCreate(data.id)">加子级</el-button>
                <el-button link type="primary" size="small" @click="openOrgEdit(data.org)">编辑</el-button>
                <el-button link type="danger" size="small" @click="removeOrg(data.org)">删除</el-button>
              </span>
            </div>
          </template>
        </el-tree>
        <el-empty v-if="orgUnits.length === 0" description="暂无组织, 点击右上角新增" :image-size="56" />
      </el-card>

      <!-- ── 右侧：组织详情 + 成员管理 ── -->
      <div class="om-main">
        <el-card shadow="never" class="om-detail-card">
          <template #header>
            <div class="om-detail-head">
              <span>{{ selectedOrg ? `组织详情 — ${selectedOrg.name}` : '组织详情' }}</span>
              <el-button
                v-if="selectedOrg"
                type="primary"
                size="small"
                @click="openAssignDialog"
                v-permission="['users:write']"
              >
                <el-icon><Plus /></el-icon> 挂载员工
              </el-button>
            </div>
          </template>
          <template v-if="selectedOrg">
            <el-descriptions :column="3" size="small" border>
              <el-descriptions-item label="组织名称">{{ selectedOrg.name }}</el-descriptions-item>
              <el-descriptions-item label="上级组织">{{ orgNameOf(selectedOrg.parent_id) || '顶级组织' }}</el-descriptions-item>
              <el-descriptions-item label="排序值">{{ selectedOrg.sort_order ?? 0 }}</el-descriptions-item>
              <el-descriptions-item label="直接成员数">{{ directMembers.length }}</el-descriptions-item>
              <el-descriptions-item label="子树成员数">{{ userCountOf(selectedOrg.id) }}</el-descriptions-item>
              <el-descriptions-item label="描述">{{ selectedOrg.description || '—' }}</el-descriptions-item>
            </el-descriptions>

            <!-- 直接成员表 (orgId === 选中组织) -->
            <el-table :data="directMembers" border size="small" style="width: 100%; margin-top: 14px"
                      :empty-text="'该组织暂无直接成员'">
              <el-table-column prop="username" label="用户名" min-width="110" />
              <el-table-column label="显示名称" min-width="110">
                <template #default="{ row }">{{ (row as any).displayName || (row as any).name || '—' }}</template>
              </el-table-column>
              <el-table-column prop="email" label="邮箱" min-width="150" show-overflow-tooltip />
              <el-table-column label="类型" width="90">
                <template #default="{ row }">
                  <el-tag :type="isUserAdmin(row) ? 'danger' : 'info'" size="small">
                    {{ isUserAdmin(row) ? '管理员' : '员工' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="80">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
                    {{ row.status === 'active' ? '正常' : '禁用' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="130" fixed="right">
                <template #default="{ row }">
                  <el-button link type="warning" size="small" @click="unassignMember(row)" v-permission="['users:write']">
                    移出组织
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
          <el-empty v-else description="点击左侧组织节点查看详情与成员" :image-size="72" />
        </el-card>
      </div>
    </div>

    <!-- 新增/编辑组织对话框 (与人员管理页同款表单) -->
    <el-dialog v-model="orgDlgVisible" :title="orgEditing ? '编辑组织' : '新增组织'" width="440px">
      <el-form label-position="top">
        <el-form-item label="组织名称" required>
          <el-input v-model="orgForm.name" placeholder="如：华东区 / 安保部 / 东门班组" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="上级组织（可选, 任意多级）">
          <el-select v-model="orgForm.parent_id" placeholder="不选 = 顶级组织" clearable style="width: 100%">
            <el-option v-for="o in orgParentCandidates" :key="o.id" :label="o.label" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="orgForm.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
        <el-form-item label="排序值（越小越靠前）">
          <el-input-number v-model="orgForm.sort_order" :min="0" :max="9999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="orgDlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="orgSaving" @click="submitOrg">保存</el-button>
      </template>
    </el-dialog>

    <!-- 挂载员工对话框: 选择用户 → updateUser(orgId) (组织变更反向同步人员表) -->
    <el-dialog v-model="assignDlgVisible" title="挂载员工到组织" width="520px">
      <div class="assign-hint">
        将员工挂载到「<strong>{{ selectedOrg?.name }}</strong>」— 仅列未挂载或其他组织的用户。
      </div>
      <el-input v-model="assignKw" placeholder="搜索用户名/显示名" clearable size="small" style="margin-bottom: 10px" />
      <el-table :data="assignCandidates" border size="small" max-height="320"
                @selection-change="(rows: any[]) => (assignSelection = rows)"
                :empty-text="'无可挂载用户'">
        <el-table-column type="selection" width="44" />
        <el-table-column prop="username" label="用户名" min-width="110" />
        <el-table-column label="显示名称" min-width="110">
          <template #default="{ row }">{{ (row as any).displayName || (row as any).name || '—' }}</template>
        </el-table-column>
        <el-table-column label="当前组织" min-width="120">
          <template #default="{ row }">
            {{ orgNameOf((row as any).orgId) || '未挂载' }}
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="assignDlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="assignSaving" :disabled="assignSelection.length === 0" @click="submitAssign">
          挂载 ({{ assignSelection.length }})
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 组织架构管理 — [UI-5 2026-09-10]
 *
 * OrgStore (rbac.db org_units, P1.2 后端已建) 前端管理页:
 * 树形展示任意多级组织; 支持增/删/改/加子级; 右侧组织详情 + 成员管理
 * (挂载员工 = updateUser(orgId); 移出组织 = orgId 置空) — 组织变更后
 * 人员列表 (UserManagementView) 同源反向同步 (同库同域, 刷新即见)。
 * 员工↔人脸绑定 (metadata.rbac_user_id) 以 userId 为锚, 组织变更不影响。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, OfficeBuilding } from '@element-plus/icons-vue'
import { rbacApi } from '@/api/rbac'
import { orgUnitApi, type OrgUnit } from '@/api/org'

const loading = ref(false)

// ---- 组织数据 ----
const orgUnits = ref<OrgUnit[]>([])
const users = ref<any[]>([])
const selectedOrgId = ref('')
const expandAll = ref(true)

interface OrgNode { id: string; name: string; org: OrgUnit; children: OrgNode[] }

/** 平表→树 (悬垂/环引用容错提升为顶级, 与 areaTree.buildOrgTree 同款范式) */
function buildOrgTree(units: OrgUnit[]): OrgNode[] {
  const byId = new Map<string, OrgNode>()
  for (const u of units) byId.set(u.id, { id: u.id, name: u.name, org: u, children: [] })
  const roots: OrgNode[] = []
  for (const node of byId.values()) {
    const parent = node.org.parent_id ? byId.get(node.org.parent_id) : undefined
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (nodes: OrgNode[]) => {
    nodes.sort((x, y) =>
      (x.org.sort_order ?? 0) - (y.org.sort_order ?? 0)
      || (x.org.created_at ?? 0) - (y.org.created_at ?? 0)
      || x.id.localeCompare(y.id))
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

const orgTreeData = computed(() => buildOrgTree(orgUnits.value))

const selectedOrg = computed(() => orgUnits.value.find(u => u.id === selectedOrgId.value) || null)

function selectOrg(id: string) {
  selectedOrgId.value = id
}

function orgNameOf(id?: string): string {
  if (!id) return ''
  return orgUnits.value.find(u => u.id === id)?.name || ''
}

/** 节点→子树全量组织 id 集 (含自身) */
function orgSubtreeIds(id: string): string[] {
  const out: string[] = []
  const walk = (nodes: OrgNode[]) => {
    for (const n of nodes) {
      if (n.id === id) {
        const collect = (x: OrgNode) => { out.push(x.id); for (const c of x.children) collect(c) }
        collect(n)
        return true
      }
      if (walk(n.children)) return true
    }
    return false
  }
  walk(orgTreeData.value)
  return out
}

function userCountOf(id: string): number {
  const ids = new Set(orgSubtreeIds(id))
  return users.value.filter(u => ids.has(u.orgId || '')).length
}

/** 直接成员 (orgId 精确命中选中组织, 不含子树) */
const directMembers = computed(() =>
  users.value.filter(u => u.orgId === selectedOrgId.value))

/** 组织平表下拉选项 (层级缩进展示) */
function orgFlatOptionsWith(units: OrgUnit[]) {
  const opts: Array<{ id: string; label: string }> = []
  const walk = (nodes: OrgNode[], depth: number) => {
    for (const n of nodes) {
      opts.push({ id: n.id, label: `${depth > 0 ? '├ '.repeat(depth) : ''}${n.name}` })
      walk(n.children, depth + 1)
    }
  }
  walk(buildOrgTree(units), 0)
  return opts
}

/** 可作上级的候选: 编辑时排除自身与全部后代 (防环) */
const orgParentCandidates = computed(() => {
  if (!orgEditing.value) return orgFlatOptionsWith(orgUnits.value)
  const banned = new Set<string>([orgEditing.value.id])
  const collect = (pid: string) => {
    for (const u of orgUnits.value) {
      if (u.parent_id === pid && !banned.has(u.id)) { banned.add(u.id); collect(u.id) }
    }
  }
  collect(orgEditing.value.id)
  return orgFlatOptionsWith(orgUnits.value).filter(o => !banned.has(o.id))
})

// ---- 组织 CRUD ----
const orgDlgVisible = ref(false)
const orgEditing = ref<OrgUnit | null>(null)
const orgSaving = ref(false)
const orgForm = ref({ name: '', parent_id: '', sort_order: 0, description: '' })

function openOrgCreate(parentId: string) {
  orgEditing.value = null
  orgForm.value = { name: '', parent_id: parentId, sort_order: 0, description: '' }
  orgDlgVisible.value = true
}

function openOrgEdit(u: OrgUnit) {
  orgEditing.value = u
  orgForm.value = {
    name: u.name, parent_id: u.parent_id || '',
    sort_order: u.sort_order ?? 0, description: u.description || '',
  }
  orgDlgVisible.value = true
}

async function submitOrg() {
  if (!orgForm.value.name.trim()) { ElMessage.warning('请填写组织名称'); return }
  orgSaving.value = true
  try {
    if (orgEditing.value) {
      await orgUnitApi.update(orgEditing.value.id, { ...orgForm.value })
      ElMessage.success('组织已更新')
    } else {
      await orgUnitApi.create({ ...orgForm.value })
      ElMessage.success('组织已创建')
    }
    orgDlgVisible.value = false
    await fetchOrgUnits()
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.message || e))
  } finally {
    orgSaving.value = false
  }
}

async function removeOrg(u: OrgUnit) {
  try {
    await ElMessageBox.confirm(
      `确定删除组织「${u.name}」？下级组织将提升为顶级，已挂载人员将变为未分配。`,
      '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch { return }
  try {
    await orgUnitApi.remove(u.id)
    ElMessage.success('已删除')
    if (selectedOrgId.value === u.id) selectedOrgId.value = ''
    await Promise.all([fetchOrgUnits(), fetchUsers()])
  } catch (e: any) {
    ElMessage.error('删除失败: ' + (e?.message || e))
  }
}

// ---- 挂载员工 ----
const assignDlgVisible = ref(false)
const assignKw = ref('')
const assignSelection = ref<any[]>([])
const assignSaving = ref(false)

/** 可挂载候选: 未挂载或其他组织的用户 (排除本组织已有成员与管理员? 管理员亦可挂) */
const assignCandidates = computed(() => {
  const kw = assignKw.value.toLowerCase()
  return users.value.filter(u => {
    if (u.orgId === selectedOrgId.value) return false
    if (kw) {
      const dn = (u.displayName || u.name || '').toLowerCase()
      if (!u.username.toLowerCase().includes(kw) && !dn.includes(kw)) return false
    }
    return true
  })
})

function openAssignDialog() {
  assignKw.value = ''
  assignSelection.value = []
  assignDlgVisible.value = true
}

async function submitAssign() {
  if (!selectedOrgId.value || assignSelection.value.length === 0) return
  assignSaving.value = true
  try {
    for (const u of assignSelection.value) {
      await rbacApi.updateUser(String(u.id), { orgId: selectedOrgId.value })
    }
    ElMessage.success(`已挂载 ${assignSelection.value.length} 名员工`)
    assignDlgVisible.value = false
    await fetchUsers()
  } catch (e: any) {
    ElMessage.error('挂载失败: ' + (e?.message || e))
    await fetchUsers()
  } finally {
    assignSaving.value = false
  }
}

async function unassignMember(row: any) {
  try {
    await ElMessageBox.confirm(
      `将「${row.username}」移出组织「${selectedOrg.value?.name}」？`,
      '移出确认', { type: 'warning', confirmButtonText: '移出', cancelButtonText: '取消' })
  } catch { return }
  try {
    await rbacApi.updateUser(String(row.id), { orgId: '' })
    ElMessage.success('已移出组织')
    await fetchUsers()
  } catch (e: any) {
    ElMessage.error('移出失败: ' + (e?.message || e))
  }
}

/** 人员分类: 管理员 / 员工 (与人员管理页同判定) */
function isUserAdmin(row: any): boolean {
  const roles: string[] = row.roleIds || row.roles || []
  return roles.includes('admin') || roles.includes('super_admin')
}

// ---- 数据加载 ----
async function fetchOrgUnits() {
  try {
    const res = await orgUnitApi.list()
    const data = (res.data as any)?.data ?? (res.data as any)
    orgUnits.value = data?.items || []
  } catch { orgUnits.value = [] }
}

async function fetchUsers() {
  try {
    const res = await rbacApi.getUsers()
    const items = ((res.data as any)?.data?.items || (res.data as any)?.data || []) as any[]
    users.value = items.map((it: any) => ({
      ...it,
      roleIds: it.roleIds || it.roles || [],
      status: it.status || (it.isActive === false ? 'disabled' : 'active'),
    }))
  } catch { users.value = [] }
}

function refreshAll() {
  loading.value = true
  Promise.all([fetchOrgUnits(), fetchUsers()]).finally(() => { loading.value = false })
}

onMounted(() => {
  refreshAll()
})
</script>

<style scoped>
.org-management { height: 100%; display: flex; flex-direction: column; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h2 { margin: 0; font-size: 20px; }

/* ── 左右布局: 左组织树 / 右详情+成员 ── */
.om-body { display: flex; gap: 16px; flex: 1; min-height: 0; }
.om-tree-panel { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; }
.om-tree-panel :deep(.el-card__body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.om-tree-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.om-tree-title { font-size: 14px; font-weight: 600; }
.om-tree { flex: 1; min-height: 0; overflow: auto; }
.om-node { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; padding: 2px 4px; border-radius: 6px; }
.om-node.is-active { background: var(--el-color-primary-light-9); }
.om-node-icon { font-size: 14px; color: var(--el-color-primary); flex-shrink: 0; }
.om-node-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-node.is-active .om-node-name { font-weight: 600; }
.om-node-count { font-size: 11px; color: var(--el-text-color-secondary); margin-left: auto; }
.om-node-actions { display: none; align-items: center; margin-left: auto; flex-shrink: 0; }
.om-node:hover .om-node-actions { display: inline-flex; }
.om-node:hover .om-node-count { display: none; }

.om-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.om-detail-head { display: flex; align-items: center; justify-content: space-between; }
.assign-hint { margin-bottom: 10px; font-size: 13px; color: var(--el-text-color-regular); }

/* 平板 1024 适配 */
@media (max-width: 1024px) {
  .om-body { flex-direction: column; }
  .om-tree-panel { width: 100%; }
  .om-tree { max-height: 220px; }
}
</style>
