<template>
  <div class="team-detail-page">
    <div class="page-header">
      <el-button link @click="$router.push('/teams')"><el-icon><ArrowLeft /></el-icon>返回团队列表</el-button>
      <div class="header-actions">
        <el-button v-if="isAdmin" @click="showEditDialog = true"><el-icon><Edit /></el-icon>编辑</el-button>
        <el-button v-if="isOwner" type="danger" @click="handleDelete"><el-icon><Delete /></el-icon>解散团队</el-button>
      </div>
    </div>

    <!-- 团队信息卡片 -->
    <el-row :gutter="16" v-if="team">
      <el-col :span="16">
        <el-card>
          <div class="team-profile">
            <el-avatar :size="56" :src="team.avatar">{{ team.name.charAt(0) }}</el-avatar>
            <div class="team-profile-info">
              <h2>{{ team.name }}</h2>
              <p>{{ team.description || '暂无描述' }}</p>
              <div class="team-tags">
                <el-tag :type="team.status === 'active' ? 'success' : 'info'">{{ team.status === 'active' ? '活跃' : '已归档' }}</el-tag>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 成员列表 -->
        <el-card header="团队成员" style="margin-top: 16px">
          <template #header>
            <div class="card-header-row">
              <span>团队成员 ({{ teamStore.totalMembers }})</span>
              <el-button v-if="isAdmin" type="primary" size="small" @click="showInviteDialog = true">
                <el-icon><Plus /></el-icon>邀请成员
              </el-button>
            </div>
          </template>
          <el-table :data="teamStore.members" stripe v-loading="teamStore.membersLoading">
            <el-table-column label="成员" min-width="200">
              <template #default="{ row }">
                <div class="member-cell">
                  <el-avatar :size="32" :src="row.avatar">{{ row.displayName.charAt(0) }}</el-avatar>
                  <div>
                    <div class="member-name">{{ row.displayName }}</div>
                    <div class="member-email">{{ row.email }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="role" label="角色" width="120">
              <template #default="{ row }">
                <el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="joinedAt" label="加入时间" width="160" />
            <el-table-column prop="lastActiveAt" label="最近活跃" width="160">
              <template #default="{ row }">{{ row.lastActiveAt || '从未活跃' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="140" v-if="isAdmin">
              <template #default="{ row }">
                <el-dropdown trigger="click" v-if="row.role !== 'owner'">
                  <el-button size="small">管理<el-icon><ArrowDown /></el-icon></el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="changeRole(row, 'admin')">设为管理员</el-dropdown-item>
                      <el-dropdown-item @click="changeRole(row, 'member')">设为成员</el-dropdown-item>
                      <el-dropdown-item @click="changeRole(row, 'viewer')">设为观察者</el-dropdown-item>
                      <el-dropdown-item divided @click="handleRemoveMember(row)">移出团队</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- 侧边栏 -->
      <el-col :span="8">
        <el-card header="团队统计">
          <div class="stats-grid">
            <div class="stat-item"><span class="stat-num">{{ team?.memberCount ?? 0 }}</span><span class="stat-label">成员</span></div>
            <div class="stat-item"><span class="stat-num">{{ team?.projectCount ?? 0 }}</span><span class="stat-label">项目</span></div>
            <div class="stat-item"><span class="stat-num">{{ teamStore.onlineMembers.length }}</span><span class="stat-label">在线</span></div>
            <div class="stat-item"><span class="stat-num">{{ pendingInvites.length }}</span><span class="stat-label">待确认</span></div>
          </div>
        </el-card>

        <el-card header="活动日志" style="margin-top: 16px">
          <div class="activity-list">
            <div v-for="log in teamStore.activityLogs.slice(0, 10)" :key="log.id" class="activity-item">
              <el-icon :size="14"><Clock /></el-icon>
              <span class="activity-text">{{ log.username }} {{ actionLabel(log.action) }}</span>
              <span class="activity-time">{{ log.timestamp }}</span>
            </div>
          </div>
          <el-empty v-if="teamStore.activityLogs.length === 0" description="暂无活动" :image-size="40" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 邀请成员对话框 -->
    <el-dialog v-model="showInviteDialog" title="邀请成员" width="480px">
      <el-form :model="inviteForm" label-width="80px">
        <el-form-item label="邮箱地址">
          <el-input v-model="inviteForm.email" placeholder="输入成员邮箱" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="inviteForm.role">
            <el-option label="管理员" value="admin" />
            <el-option label="成员" value="member" />
            <el-option label="观察者" value="viewer" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInviteDialog = false">取消</el-button>
        <el-button type="primary" :loading="inviting" @click="handleInvite">发送邀请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTeamStore } from '@/stores/team'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TeamMember, TeamMemberRole } from '@/types/team'

const route = useRoute()
const router = useRouter()
const teamStore = useTeamStore()

const teamId = computed(() => route.params.id as string)
const team = computed(() => teamStore.currentTeam)
const myMembership = computed(() => teamStore.members.find(m => m.userId === 'current'))
const isOwner = computed(() => myMembership.value?.role === 'owner')
const isAdmin = computed(() => myMembership.value?.role === 'owner' || myMembership.value?.role === 'admin')
const pendingInvites = computed(() => teamStore.invitations.filter(i => i.status === 'pending'))

const showEditDialog = ref(false)
const showInviteDialog = ref(false)
const inviting = ref(false)
const inviteForm = reactive({ email: '', role: 'member' as TeamMemberRole })

function roleLabel(role: TeamMemberRole) {
  const map: Record<TeamMemberRole, string> = { owner: '拥有者', admin: '管理员', member: '成员', viewer: '观察者' }
  return map[role] || role
}

function roleTagType(role: TeamMemberRole) {
  return role === 'owner' ? 'danger' : role === 'admin' ? 'warning' : role === 'member' ? 'success' : 'info'
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    create_team: '创建了团队', update_team: '更新了团队信息', delete_team: '解散了团队',
    invite_member: '邀请了新成员', remove_member: '移出了成员', update_role: '修改了成员角色',
    accept_invite: '接受了邀请', decline_invite: '拒绝了邀请', transfer_ownership: '转让了所有权'
  }
  return map[action] || action
}

async function changeRole(member: TeamMember, role: TeamMemberRole) {
  try {
    await teamStore.updateMemberRole(teamId.value, member.id, { role })
    ElMessage.success(`已将 ${member.displayName} 的角色更新为 ${roleLabel(role)}`)
  } catch { ElMessage.error('操作失败') }
}

async function handleRemoveMember(member: TeamMember) {
  try {
    await ElMessageBox.confirm(`确认将 ${member.displayName} 移出团队？`, '确认操作', { type: 'warning' })
    await teamStore.removeMemberFromTeam(teamId.value, member.id)
    ElMessage.success('已移出团队')
  } catch { /* cancelled */ }
}

async function handleInvite() {
  if (!inviteForm.email) { ElMessage.warning('请输入邮箱'); return }
  inviting.value = true
  try {
    await teamStore.inviteMember(teamId.value, { email: inviteForm.email, role: inviteForm.role })
    ElMessage.success('邀请已发送')
    showInviteDialog.value = false
    inviteForm.email = ''
    inviteForm.role = 'member'
  } catch { ElMessage.error('邀请发送失败') }
  finally { inviting.value = false }
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm('解散团队后所有数据将被清除，不可恢复。确认继续？', '危险操作', { type: 'error', confirmButtonText: '确认解散' })
    await teamStore.removeTeam(teamId.value)
    ElMessage.success('团队已解散')
    router.push('/teams')
  } catch { /* cancelled */ }
}

onMounted(() => {
  teamStore.fetchTeamDetail(teamId.value)
  teamStore.fetchMembers(teamId.value)
  teamStore.fetchInvitations(teamId.value)
  teamStore.fetchActivityLogs(teamId.value)
  teamStore.fetchTeamStats(teamId.value)
})
</script>

<style scoped>
.team-detail-page { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.header-actions { display: flex; gap: 8px; }
.team-profile { display: flex; align-items: center; gap: 16px; }
.team-profile-info h2 { margin: 0 0 4px; font-size: 20px; }
.team-profile-info p { color: #666; margin: 0 0 8px; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.member-cell { display: flex; align-items: center; gap: 10px; }
.member-name { font-weight: 500; }
.member-email { font-size: 12px; color: #999; }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.stat-item { text-align: center; }
.stat-num { display: block; font-size: 24px; font-weight: 700; color: #1890ff; }
.stat-label { font-size: 12px; color: #8c8c8c; }
.activity-list { max-height: 300px; overflow-y: auto; }
.activity-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f5f5f5; }
.activity-text { flex: 1; }
.activity-time { color: #bbb; font-size: 11px; }
</style>
