export const PERMISSIONS = [
  { key: 'task.use', label: '使用独立任务', group: '功能使用', scope: 'system' },
  { key: 'scan.run', label: '执行原生漏洞扫描', group: '漏洞扫描', scope: 'system' },
  { key: 'scan.internal', label: '扫描内网地址', group: '漏洞扫描', scope: 'system' },
  { key: 'scan.rules', label: '管理自定义扫描规则', group: '漏洞扫描', scope: 'system' },
  { key: 'project.create', label: '创建项目', group: '项目资源', scope: 'system' },
  { key: 'project.read', label: '查看项目', group: '项目资源', scope: 'project' },
  { key: 'project.run', label: '执行评估', group: '项目资源', scope: 'project' },
  { key: 'project.manage', label: '管理项目', group: '项目资源', scope: 'project' },
  { key: 'users.manage', label: '管理用户', group: '系统管理', scope: 'system' },
  { key: 'permissions.manage', label: '管理角色与授权', group: '系统管理', scope: 'system' },
  { key: 'tools.manage', label: '配置工具连接', group: '系统管理', scope: 'system' },
] as const
export type PermissionKey = (typeof PERMISSIONS)[number]['key']
export interface PermissionGrant extends Record<string, unknown> {
  permission: PermissionKey
  resource: string
}
export interface AccessRole extends Record<string, unknown> {
  id: string
  name: string
  description: string
  builtin: boolean
}
export interface RolePermission extends PermissionGrant {
  role_id: string
}
export interface UserRoleBinding extends Record<string, unknown> {
  user_id: string
  role_id: string
}
export interface UserPermission extends PermissionGrant {
  user_id: string
  effect: 'allow' | 'deny'
}

/** A direct deny wins over inherited and direct allows. Project access is a resource grant. */
export function permitted(
  permission: PermissionKey,
  resource: string,
  roles: readonly PermissionGrant[],
  overrides: readonly Pick<UserPermission, 'permission' | 'resource' | 'effect'>[],
): boolean {
  const matches = (grant: PermissionGrant) => grant.resource === '*' || grant.resource === resource
  const exact = overrides.filter((grant) => grant.permission === permission && matches(grant))
  if (exact.some((grant) => grant.effect === 'deny')) return false
  const implies: PermissionKey[] =
    permission === 'project.read'
      ? ['project.read', 'project.run', 'project.manage']
      : permission === 'project.run'
        ? ['project.run', 'project.manage']
        : [permission]
  const allowed = [...roles, ...overrides.filter((grant) => grant.effect === 'allow')].some(
    (grant) => implies.includes(grant.permission) && matches(grant),
  )
  if (!allowed) return false
  if (permission === 'project.run' || permission === 'project.manage')
    return (
      permitted('project.read', resource, roles, overrides) &&
      (permission !== 'project.manage' || permitted('project.run', resource, roles, overrides))
    )
  return true
}
