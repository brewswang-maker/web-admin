import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CloudServiceStatus, FederationDashboardData, OpenPlatformStats, OTAStats, SecurityScore, AgentActivity, DeviceAnalytics, AlarmStats, AuditStats, AuditLogItem } from '@/types/analytics'
import { federationHttp } from '@/api/http'
import { statsHttp } from '@/api/http'
import { otaHttp } from '@/api/http'
import { http } from '@/api/http'

export const useCloudStore = defineStore('cloud', () => {
  const cloudStatus = ref<CloudServiceStatus | null>(null)
  const federationData = ref<FederationDashboardData | null>(null)
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

  return {
    cloudStatus, federationData, platformStats, otaStats, loading, connected,
    securityScore, alarmStats, agentActivity, deviceAnalytics,
    auditStats, auditLogs, auditTotal,
    fetchCloudStatus, fetchFederationData, fetchPlatformStats, fetchOTAStats,
    fetchSecurityScore, fetchAlarmStats, fetchDeviceAnalytics, fetchAgentActivity,
    fetchAuditStats, fetchAuditLogs,
  }
})
