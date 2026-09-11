/** RBAC 权限管理类型定义 */

export type Resource =
  | 'device' | 'channel' | 'alarm' | 'algorithm' | 'pipeline'
  | 'recording' | 'user' | 'role' | 'permission' | 'system'
  | 'log' | 'dashboard' | 'config' | 'ota' | 'agent'

export type Operation =
  | 'read' | 'create' | 'update' | 'delete'
  | 'execute' | 'export' | 'import' | 'manage'

export interface Permission {
  id: string
  resource: Resource
  operation: Operation
  name: string
  description: string
  roles?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  userCount?: number
  isSystem?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface User {
  id: string | number
  username: string
  displayName?: string
  email?: string
  phone?: string
  avatar?: string
  roleIds: string[]
  roles?: Role[]
  status: 'active' | 'disabled' | 'locked'
  lastLoginAt?: string
  lastLoginTime?: string
  createdAt?: string
  updatedAt?: string
  // ── [UI-9 2026-09-10] 对标安防平台人员档案扩展字段 (华为/海康/大华/宇视) ──
  /** 所属组织 id */
  orgId?: string
  /** 工号 [宇视/海康/大华/华为] */
  employeeId?: string
  /** 职位 [华为/宇视/大华] */
  jobTitle?: string
  /** 入职日期 YYYY-MM-DD [大华/华为] */
  hireDate?: string
  /** 离职日期 YYYY-MM-DD [大华] */
  leaveDate?: string
  /** 办公电话 [海康/大华] */
  officePhone?: string
  /** 性别 male/female，空=未知 [海康/大华/宇视] */
  gender?: 'male' | 'female' | ''
  /** 生日 YYYY-MM-DD [海康] */
  birthday?: string
  /** 证件类型 id_card/passport/officer/driver/other [海康/大华] */
  idType?: string
  /** 证件号码 [海康/大华] */
  idNumber?: string
  /** 地址 [海康/大华] */
  address?: string
  /** 紧急联系人 [大华] */
  emergencyContact?: string
  /** 紧急联系电话 [大华] */
  emergencyPhone?: string
  /** 标签 (逗号分隔) [华为/大华] */
  tags?: string
  /** 备注 */
  remark?: string
}

export const ResourceLabels: Record<Resource, string> = {
  device: '设备管理',
  channel: '通道管理',
  alarm: '告警管理',
  algorithm: '算法管理',
  pipeline: 'Pipeline',
  recording: '录像管理',
  user: '用户管理',
  role: '角色管理',
  permission: '权限管理',
  system: '系统设置',
  log: '日志审计',
  dashboard: '数据看板',
  config: '配置管理',
  ota: 'OTA升级',
  agent: '智能体',
}

export const OperationLabels: Record<Operation, string> = {
  read: '查看',
  create: '创建',
  update: '编辑',
  delete: '删除',
  execute: '执行',
  export: '导出',
  import: '导入',
  manage: '管理',
}
