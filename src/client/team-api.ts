import type { AccessRole, PermissionGrant, UserPermission } from '../lib/permissions.js'
export interface TeamView {
  user: { id: string; username: string; role: 'admin' | 'member' }
  capabilities: {
    useStandalone: boolean
    createProject: boolean
    manageUsers: boolean
    managePermissions: boolean
    manageTools: boolean
  }
  personalSessions: string[]
  projects: {
    id: string
    name: string
    role: 'manager' | 'editor' | 'viewer'
    sessions: string[]
    createdBy: string
  }[]
  users: {
    id: string
    username: string
    role: 'admin' | 'member'
    disabled: boolean
    must_change: boolean
    roleIds: string[]
  }[]
  roles: (AccessRole & { grants: PermissionGrant[] })[]
  permissions?: { resources: { id: string; name: string }[]; overrides: UserPermission[] }
}
export type TeamAccount = TeamView['users'][number]
export async function teamApi<T = unknown>(
  action: string,
  input?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `/prism-api/${action}`,
    input === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        },
  )
  const value = await response.json()
  if (!response.ok) {
    if (response.status === 401) window.location.assign('/login')
    throw new Error(value.error ?? '操作失败。')
  }
  return value as T
}
