import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { TeamError, TeamStore } from '../lib/team-database.js'
import { PERMISSIONS, type PermissionGrant } from '../lib/permissions.js'
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

/** Application identities and resource permissions, independent of any Agent host. */
export class TeamService {
  constructor(
    readonly store: TeamStore,
    readonly projectRoot: string,
  ) {}
  async api(userId: string, action: string, body: Record<string, unknown>) {
    const text = (key: string) => {
      if (typeof body[key] !== 'string') throw new TeamError(400, '参数无效。')
      return body[key] as string
    }
    await this.store.refresh()
    if (!this.store.user(userId)) throw new TeamError(401, '请重新登录。')
    if (action === 'state')
      return {
        user: this.store.user(userId),
        capabilities: {
          useStandalone: this.store.can(userId, 'task.use'),
          createProject: this.store.can(userId, 'project.create'),
          manageUsers: this.store.can(userId, 'users.manage'),
          managePermissions: this.store.can(userId, 'permissions.manage'),
          manageTools: this.store.can(userId, 'tools.manage'),
        },
        personalSessions: this.store.personalSessions
          .filter(
            (row) =>
              row.user_id === userId && this.store.allowsSession(userId, row.session_id, 'read'),
          )
          .map((row) => row.session_id),
        projects: this.store.projects
          .filter((p) => this.store.allows(userId, p.id, 'read'))
          .map((p) => ({
            id: p.id,
            name: p.name,
            role: this.store.projectRole(userId, p.id),
            sessions: this.store.sessions
              .filter((s) => s.project_id === p.id)
              .map((s) => s.session_id),
            createdBy: this.store.users.find((u) => u.id === p.owner_id)?.username ?? '',
          })),
        users:
          this.store.can(userId, 'users.manage') || this.store.can(userId, 'permissions.manage')
            ? this.store.users.map((user) => ({ ...user, roleIds: this.store.roleIds(user.id) }))
            : [],
        roles:
          this.store.can(userId, 'users.manage') || this.store.can(userId, 'permissions.manage')
            ? this.store.roles.map((role) => ({
                ...role,
                grants: this.store.rolePermissions
                  .filter((row) => row.role_id === role.id)
                  .map(({ permission, resource }) => ({ permission, resource })),
              }))
            : [],
        permissions: this.store.can(userId, 'permissions.manage')
          ? {
              catalog: PERMISSIONS,
              resources: this.store.projects.map((project) => ({
                id: project.id,
                name: project.name,
              })),
              overrides: this.store.userPermissions,
            }
          : undefined,
      }
    if (action === 'project-create') {
      this.store.assertPermission(userId, 'project.create')
      const name = text('name').trim()
      if (!name || name.length > 80) throw new TeamError(400, '项目名称须为 1–80 位。')
      const id = randomUUID(),
        path = resolve(this.projectRoot, id)
      await mkdir(path, { recursive: true, mode: 0o700 })
      const workspace = { workspaceId: randomUUID() }
      await this.store.addProject(userId, {
        id,
        name,
        owner_id: userId,
        workspace_id: workspace.workspaceId,
        root_path: path,
      })
      return { id }
    }
    if (action === 'role-save') {
      if (!Array.isArray(body.grants) || body.grants.some((row) => !record(row)))
        throw new TeamError(400, '角色权限无效。')
      return this.store.saveRole(userId, {
        ...(body.id === undefined ? {} : { id: text('id') }),
        name: text('name'),
        description: text('description'),
        grants: body.grants as PermissionGrant[],
      })
    }
    if (action === 'user-roles') {
      if (!Array.isArray(body.roleIds) || body.roleIds.some((row) => typeof row !== 'string'))
        throw new TeamError(400, '角色无效。')
      await this.store.setUserRoles(userId, text('userId'), body.roleIds as string[])
      return { ok: true }
    }
    if (action === 'permission-set') {
      await this.store.setUserPermission(
        userId,
        text('userId'),
        {
          permission: text('permission') as PermissionGrant['permission'],
          resource: text('resource'),
        },
        body.effect === null ? null : (text('effect') as 'allow' | 'deny'),
      )
      return { ok: true }
    }
    if (action === 'user-create')
      return await this.store.createUser(
        userId,
        text('username').trim(),
        text('password'),
        text('role') as 'admin' | 'member',
      )
    if (action === 'user-update') {
      if (typeof body.disabled !== 'boolean') throw new TeamError(400, '参数无效。')
      await this.store.updateUser(
        userId,
        text('userId'),
        text('role') as 'admin' | 'member',
        body.disabled,
        body.password === undefined ? undefined : text('password'),
      )
      return { ok: true }
    }
    throw new TeamError(404, '接口不存在。')
  }
}
