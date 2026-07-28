import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CloudServiceStatus, FederationDashboardData, OpenPlatformStats, OTAStats, SecurityScore, AgentActivity, DeviceAnalytics, AlarmStats, AuditStats, AuditLogItem } from '@/types/analytics'
import { federationHttp, statsHttp, otaHttp, http } from '@/api/http'
import { federationApi } from '@/api/federation'
import type { FederationTask, CreateFederationTaskRequest } from '@/api/federation'
import { ElMessage } from 'element-plus'

export const useCloudStore = defineStore('cloud', () => {
  const cloudStatus = ref<CloudServiceStatus | null>(null)
  const federationData = ref<FederationDashboardData | null>(null)
  const federationTasks = ref<FederationTask[]>([])
  const federationRounds = ref<any[]>([])
  const federationNodes = ref<any[]>([])
  const platformStats = ref<OpenPlatformStats | null>(null)
  const otaStats = ref<OTAStats | null>(null)
  const loading = ref(false)
  const connected = computed(() => cloudStatus.value?.connected ?? false)

  // Statistics page data
  const securityScore = ref<SecurityScore | null>(null)
  const alarmStats = ref<AlarmStats | null>(null)
  const agentActivity = ref<AgentActivity | null>(null)
  const deviceAnalytics = ref<DeviceAnalytics | null>(null)

  // Audit center data
  const auditStats = ref<AuditStats | null>(null)
  const auditLogs = ref<AuditLogItem[]>([])
  const auditTotal = computed(() => auditStats.value?.total ?? 0)

  async function fetchCloudStatus() {
    loading.value = true
    try {
      const { data } = await http.get('/cloud/status')
      cloudStatus.value = data?.data ?? null
    } catch { /* API may not exist yet */ }
    finally { loading.value = false }
  }

  async function fetchFederationData() {
    loading.value = true
    try {
      const { data } = await federationHttp.get('/dashboard')
      federationData.value = data?.data ?? null
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function fetchPlatformStats() {
    loading.value = true
    try {
      const { data } = await http.get('/open-platform/stats')
      platformStats.value = data?.data ?? null
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function fetchOTAStats() {
    loading.value = true
    try {
      const { data } = await otaHttp.get('/stats')
      otaStats.value = data?.data ?? null
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function fetchSecurityScore() {
    loading.value = true
    try {
      const { data } = await statsHttp.get('/security-score')
      securityScore.value = data?.data ?? null
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function fetchAlarmStats() {
    loading.value = true
    try {
      const { data } = await statsHttp.get('/alarm-stats')
      alarmStats.value = data?.data ?? null
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function fetchDeviceAnalytics() {
    loading.value = true
    try {
      const { data } = await statsHttp.get('/device-analytics')
      deviceAnalytics.value = data?.data ?? null
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function fetchAgentActivity() {
    loading.value = true
    try {
      const { data } = await statsHttp.get('/agent-activity')
      agentActivity.value = data?.data ?? null
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function fetchAuditStats() {
    loading.value = true
    try {
      const { data } = await http.get('/audit/stats')
      auditStats.value = data?.data ?? null
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function fetchAuditLogs(params?: Record<string, unknown>) {
    loading.value = true
    try {
      const { data } = await http.get('/audit/logs', { params })
      if (data?.data?.items) auditLogs.value = data.data.items
      else if (Array.isArray(data?.data)) auditLogs.value = data.data
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function exportAuditReport(format: string = 'csv') {
    const { data } = await http.post('/logs/export', { format })
    return data?.data
  }

  // [FIX] 联邦学习任务管理
  async function fetchFederationTasks() {
    loading.value = true
    try {
      const { data } = await federationApi.getTasks({ page: 1, pageSize: 50 })
      federationTasks.value = (data?.data as any)?.tasks ?? (Array.isArray(data?.data) ? data.data : [])
    } catch { /* keep current */ }
    finally { loading.value = false }
  }

  async function createFederationTask(payload: CreateFederationTaskRequest) {
    loading.value = true
    try {
      await federationApi.createTask(payload)
      ElMessage.success('联邦训练任务已创建')
      await fetchFederationTasks()
    } catch { ElMessage.error('创建任务失败') }
    finally { loading.value = false }
  }

  async function controlFederation(taskId: string, action: 'pause' | 'resume' | 'stop') {
    try {
      if (action === 'pause') await federationApi.pauseTask(taskId)
      else if (action === 'resume') await federationApi.resumeTask(taskId)
      else if (action === 'stop') await federationApi.stopTask(taskId)
      await fetchFederationTasks()
    } catch { /* keep current */ }
  }

  // [P1-4] 联邦学习轮次历史 + 节点管理 + 删除任务
  async function fetchFederationRounds() {
    try {
      const { data } = await federationHttp.get('/rounds')
      federationRounds.value = (data?.data as any)?.items ?? []
    } catch { /* keep current */ }
  }

  async function fetchFederationNodes() {
    try {
      const { data } = await federationHttp.get('/nodes')
      federationNodes.value = data?.data ?? []
    } catch { /* keep current */ }
  }

  async function deleteFederationTask(taskId: string) {
    loading.value = true
    try {
      await federationApi.deleteTask(taskId)
      ElMessage.success('任务已删除')
      await fetchFederationTasks()
    } catch { ElMessage.error('删除任务失败') }
    finally { loading.value = false }
  }

  async function startFederationRound() {
    loading.value = true
    try {
      const { data } = await federationHttp.post('/rounds/start', {})
      ElMessage.success(`第 ${data?.data?.round ?? '?'} 轮训练完成 (精度: ${((data?.data?.accuracy ?? 0) * 100).toFixed(1)}%)`)
      await fetchFederationRounds()
      await fetchFederationData()
    } catch { ElMessage.error('训练轮次启动失败') }
    finally { loading.value = false }
  }

  return {
    cloudStatus, federationData, federationTasks, federationRounds, federationNodes,
    platformStats, otaStats, loading, connected,
    securityScore, alarmStats, agentActivity, deviceAnalytics,
    auditStats, auditLogs, auditTotal,
    fetchCloudStatus, fetchFederationData, fetchFederationTasks, createFederationTask, controlFederation,
    deleteFederationTask, startFederationRound, fetchFederationRounds, fetchFederationNodes,
    fetchPlatformStats, fetchOTAStats,
    fetchSecurityScore, fetchAlarmStats, fetchDeviceAnalytics, fetchAgentActivity,
    fetchAuditStats, fetchAuditLogs, exportAuditReport,
  }
})
