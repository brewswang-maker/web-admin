import { defineStore } from 'pinia'
import { ref } from 'vue'
import { http } from '@/api/http'
import type { Team, TeamMember, TeamQuery } from '@/types/team'

export const useTeamStore = defineStore('team', () => {
  const teams = ref<Team[]>([])
  const currentTeam = ref<Team | null>(null)
  const members = ref<TeamMember[]>([])
  const teamStats = ref<{ memberCount: number; projectCount: number; deviceCount: number; alarmCount: number } | null>(null)
  const loading = ref(false)

  async function fetchTeams(query?: TeamQuery) {
    loading.value = true
    try {
      const { data } = await http.get('/api/v1/teams', { params: query })
      teams.value = data?.data || data || []
    } catch (e) {
      console.warn('[TeamStore] fetchTeams failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchTeamDetail(id: string) {
    loading.value = true
    try {
      const { data } = await http.get(`/api/v1/teams/${id}`)
      currentTeam.value = data?.data || data || null
    } catch (e) {
      console.warn('[TeamStore] fetchTeamDetail failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchMembers(teamId: string) {
    try {
      const { data } = await http.get(`/api/v1/teams/${teamId}/members`)
      members.value = data?.data || data || []
    } catch (e) {
      console.warn('[TeamStore] fetchMembers failed:', e)
    }
  }

  async function fetchTeamStats(teamId: string) {
    try {
      const { data } = await http.get(`/api/v1/teams/${teamId}/stats`)
      teamStats.value = data?.data || data || null
    } catch (e) {
      console.warn('[TeamStore] fetchTeamStats failed:', e)
    }
  }

  async function addMember(teamId: string, member: Partial<TeamMember>) {
    try {
      await http.post(`/api/v1/teams/${teamId}/members`, member)
      await fetchMembers(teamId)
    } catch (e) {
      console.warn('[TeamStore] addMember failed:', e)
    }
  }

  async function removeMember(teamId: string, memberId: string) {
    try {
      await http.delete(`/api/v1/teams/${teamId}/members/${memberId}`)
      await fetchMembers(teamId)
    } catch (e) {
      console.warn('[TeamStore] removeMember failed:', e)
    }
  }

  return {
    teams, currentTeam, members, teamStats, loading,
    fetchTeams, fetchTeamDetail, fetchMembers, fetchTeamStats,
    addMember, removeMember,
  }
})
