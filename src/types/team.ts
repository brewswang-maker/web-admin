export interface TeamMember {
  id: string; username: string; name: string; email?: string; phone?: string
  avatar?: string; role: string; status: 'active' | 'inactive' | 'pending'
  joinedAt: string; department?: string
}

export interface Team {
  id: string; name: string; description: string; memberCount: number
  createdAt: string; updatedAt: string; owner: string; status: 'active' | 'archived'
  members: TeamMember[]
}

export interface TeamQuery {
  page?: number; pageSize?: number; keyword?: string; status?: string
}
