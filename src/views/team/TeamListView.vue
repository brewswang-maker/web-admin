<template>
  <div class="team-list-page">
    <div class="page-header">
      <h1>👥 团队管理</h1>
      <el-button v-if="auth.can('teams', 'write')" type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>新建团队
      </el-button>
    </div>

    <!-- 邀请提示 -->
    <el-alert v-if="teamStore.pendingInvitationCount > 0" type="info" show-icon :closable="false" class="invite-alert">
      <template #title>
        您有 <strong>{{ teamStore.pendingInvitationCount }}</strong> 条待处理的团队邀请
        <el-button link type="primary" @click="showInvitations = true">查看</el-button>
      </template>
    </el-alert>

    <!-- 团队列表 -->
    <el-row :gutter="16">
      <el-col v-for="team in teamStore.teams" :key="team.id" :xs="24" :sm="12" :lg="8">
        <el-card shadow="hover" class="team-card" @click="enterTeam(team)">
          <template #header>
            <div class="team-card-header">
              <div class="team-info">
                <el-avatar :size="40" :src="team.avatar">{{ team.name.charAt(0) }}</el-avatar>
                <div class="team-name-wrap">
                  <span class="team-name">{{ team.name }}</span>
                  <el-tag :type="team.status === 'active' ? 'success' : 'info'" size="small">{{ team.status === 'active' ? '活跃' : '已归档' }}</el-tag>
                </div>
              </div>
            </div>
          </template>
          <p class="team-desc">{{ team.description || '暂无描述' }}</p>
          <div class="team-meta">
            <span><el-icon><User /></el-icon> {{ team.memberCount }} 成员</span>
            <span><el-icon><FolderOpened /></el-icon> {{ team.projectCount }} 项目</span>
          </div>
          <div class="team-footer">
            <span class="team-owner">负责人: {{ team.ownerName }}</span>
            <span class="team-time">更新于 {{ team.updatedAt }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-empty v-if="!teamStore.loading && teamStore.teams.length === 0" description="暂无团队，点击上方按钮创建" />

    <!-- 创建团队对话框 -->
    <el-dialog v-model="showCreateDialog" title="新建团队" width="480px" @close="resetForm">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="团队名称" prop="name">
          <el-input v-model="form.name" placeholder="输入团队名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="团队描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="描述团队的目的和职责" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 邀请列表对话框 -->
    <el-dialog v-model="showInvitations" title="我的邀请" width="560px">
      <el-table :data="myInvites" stripe>
        <el-table-column prop="teamName" label="团队" width="150" />
        <el-table-column prop="role" label="角色" width="90">
          <template #default="{ row }">{{ roleLabel(row.role) }}</template>
        </el-table-column>
        <el-table-column prop="invitedBy" label="邀请人" width="100" />
        <el-table-column prop="invitedAt" label="时间" width="160" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleAccept(row)">接受</el-button>
            <el-button size="small" @click="handleDecline(row)">拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="myInvites.length === 0" description="暂无待处理邀请" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import type { TeamMemberRole } from '@/types/team'

const router = useRouter()
const teamStore = useTeamStore()
const auth = useAuthStore()

const showCreateDialog = ref(false)
const showInvitations = ref(false)
const creating = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({ name: '', description: '' })
const rules: FormRules = {
  name: [{ required: true, message: '请输入团队名称', trigger: 'blur' }, { min: 2, max: 50, message: '2-50个字符', trigger: 'blur' }],
  description: [{ max: 200, message: '不超过200个字符', trigger: 'blur' }],
}

const myInvites = computed(() => teamStore.myInvitations.filter(i => i.status === 'pending'))

function roleLabel(role: TeamMemberRole) {
  const map: Record<TeamMemberRole, string> = { owner: '拥有者', admin: '管理员', member: '成员', viewer: '观察者' }
  return map[role] || role
}

function resetForm() {
  form.name = ''
  form.description = ''
  formRef.value?.resetFields()
}

async function handleCreate() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  creating.value = true
  try {
    await teamStore.createTeam({ name: form.name, description: form.description })
    ElMessage.success('团队创建成功')
    showCreateDialog.value = false
  } catch {
    ElMessage.error('创建失败，请重试')
  } finally {
    creating.value = false
  }
}

function enterTeam(team: { id: string }) {
  router.push(`/teams/${team.id}`)
}

async function handleAccept(inv: { id: string }) {
  try {
    await teamStore.acceptInvitation(inv.id)
    ElMessage.success('已接受邀请')
    teamStore.fetchTeams()
  } catch { ElMessage.error('操作失败') }
}

async function handleDecline(inv: { id: string }) {
  try {
    await teamStore.cancelInvitation(inv.id, inv.id)
    ElMessage.info('已拒绝邀请')
  } catch { ElMessage.error('操作失败') }
}

onMounted(() => {
  teamStore.fetchTeams()
  teamStore.fetchMyInvitations()
})
</script>

<style scoped>
.team-list-page { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h1 { margin: 0; font-size: 22px; }
.invite-alert { margin-bottom: 16px; }
.team-card { cursor: pointer; transition: transform .2s; margin-bottom: 16px; }
.team-card:hover { transform: translateY(-2px); }
.team-card-header { display: flex; align-items: center; }
.team-info { display: flex; align-items: center; gap: 12px; }
.team-name-wrap { display: flex; flex-direction: column; gap: 4px; }
.team-name { font-weight: 600; font-size: 15px; }
.team-desc { color: #666; font-size: 13px; margin: 0 0 12px; min-height: 36px; }
.team-meta { display: flex; gap: 20px; color: #8c8c8c; font-size: 13px; margin-bottom: 12px; }
.team-meta span { display: flex; align-items: center; gap: 4px; }
.team-footer { display: flex; justify-content: space-between; color: #aaa; font-size: 12px; }
</style>
