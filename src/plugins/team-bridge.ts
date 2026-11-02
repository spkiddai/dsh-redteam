import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import { policyFetch } from './policy-rpc.js'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-api-workspace-controller'
import {
  REMOTE_ACCESS_SNAPSHOT_KEY,
  type RemoteAccessBinding,
  type RemoteAccessAction,
} from '@deepseek-ai/dsh-api-remote-access'
import { parseRemoteEventResult } from '@deepseek-ai/dsh-api-gateway/stream-protocol'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { TeamError, TeamStore } from '../lib/team-database.js'
import { PERMISSIONS, type PermissionGrant } from '../lib/permissions.js'
import type { NativeScans } from '../lib/native-scans.js'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    prism: { kind: 'prism'; userId: string }
  }
}
const GLOBAL: RemoteAccessAction[] = [
  'session/list',
  'session/search',
  'session/control',
  'session/modelCatalog',
  'workspace/follow',
]
const READ: RemoteAccessAction[] = [
  'session/list',
  'session/search',
  'session/control',
  'session/page',
  'session/follow',
  'session/projections',
  'workspace/follow',
]
const WRITE: RemoteAccessAction[] = [
  'session/prompt',
  'session/cancel',
  'session/rename',
  'session/updateQueue',
  'session/selectModel',
]

export function teamBindings(store: TeamStore, userId: string): RemoteAccessBinding[] {
  if (!store.user(userId)) return []
  const bindings: RemoteAccessBinding[] = [
    {
      resource: { kind: 'global' },
      role: { name: 'prism-global', resource: 'global', actions: GLOBAL },
    },
  ]
  for (const project of store.projects) {
    if (!store.allows(userId, project.id, 'read')) continue
    bindings.push({
      resource: {
        kind: 'workspace',
        id: project.workspace_id as Extract<
          RemoteAccessBinding,
          { resource: { kind: 'workspace' } }
        >['resource']['id'],
      },
      role: { name: 'prism-project', resource: 'workspace', actions: ['workspace/follow'] },
    })
    for (const session of store.sessions.filter((s) => s.project_id === project.id))
      bindings.push({
        resource: {
          kind: 'session',
          id: session.session_id as Extract<
            RemoteAccessBinding,
            { resource: { kind: 'session' } }
          >['resource']['id'],
        },
        role: {
          name: 'prism-session',
          resource: 'session',
          actions: [...READ, ...(store.allows(userId, project.id, 'write') ? WRITE : [])],
        },
      })
  }
  for (const session of store.personalSessions) {
    if (!store.allowsSession(userId, session.session_id, 'read')) continue
    bindings.push(
      {
        resource: {
          kind: 'workspace',
          id: session.workspace_id as Extract<
            RemoteAccessBinding,
            { resource: { kind: 'workspace' } }
          >['resource']['id'],
        },
        role: { name: 'prism-personal', resource: 'workspace', actions: ['workspace/follow'] },
      },
      {
        resource: {
          kind: 'session',
          id: session.session_id as Extract<
            RemoteAccessBinding,
            { resource: { kind: 'session' } }
          >['resource']['id'],
        },
        role: { name: 'prism-personal-session', resource: 'session', actions: [...READ, ...WRITE] },
      },
    )
  }
  return bindings
}
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

/** A narrow event carrier; only the native gateway consumes approval answers. */
export class TeamPeer {
  readonly peer: PeerScope
  private readonly eventPeer: PeerScope
  private clientId: string | undefined
  private readonly deliveries = new Map<string, string>()
  constructor(
    private readonly ctx: Context,
    private readonly store: TeamStore,
    readonly userId: string,
    private readonly policy: () => ConnectionRpcHandler | undefined = () => undefined,
  ) {
    this.peer = ctx.connection.createPeer({ principal: { kind: 'prism', userId } })
    // rc.2 only forwards approval waterfalls to owner peers. This private peer is
    // restricted to the event carrier below; no ordinary API call ever receives it.
    this.eventPeer = ctx.connection.createPeer({ principal: { kind: 'owner' } })
  }
  dispose() {
    this.deliveries.clear()
    this.peer.dispose()
    this.eventPeer.dispose()
  }
  async fetch(request: Request) {
    if (new URL(request.url).pathname.startsWith('/api/redteam-policy/')) {
      const handler = this.policy()
      return handler
        ? await policyFetch(handler, request, this.peer)
        : new Response('Unavailable', { status: 503 })
    }
    if (new URL(request.url).pathname === '/api/$events/result') {
      const body = record(await request.clone().json())
      const result = parseRemoteEventResult(record(body?.payload)?.args)
      const session = this.deliveries.get(result.eventId)
      if (
        result.clientId !== this.clientId ||
        !session ||
        !this.store.allowsSession(this.userId, session, 'write')
      )
        return new Response('Forbidden', { status: 403 })
      const reply = await this.ctx.connection
        .createSharedFetchHandler('/api')
        .fetch(request, this.eventPeer)
      this.deliveries.delete(result.eventId)
      return reply
    }
    return await this.ctx.connection.createSharedFetchHandler('/api').fetch(request, this.peer)
  }
  async *stream(
    endpoint: string,
    payload: unknown,
    uplink: AsyncIterable<unknown>,
    signal: AbortSignal,
  ) {
    if (endpoint !== '$events') {
      yield* await this.ctx.typertGateway.wireStream.open(
        endpoint,
        payload,
        uplink,
        this.peer,
        signal,
      )
      return
    }
    if (this.clientId) throw new TeamError(409, '审批连接已存在。')
    try {
      for await (const value of await this.ctx.typertGateway.wireStream.open(
        endpoint,
        payload,
        uplink,
        this.eventPeer,
        signal,
      )) {
        const frame = record(value)
        if (frame?.type === 'ready' && typeof frame.clientId === 'string') {
          this.clientId = frame.clientId
          yield { ...frame, host: { home: '' } }
        } else if (
          frame?.type === 'waterfall' &&
          typeof frame.agentId === 'string' &&
          typeof frame.eventId === 'string' &&
          ['approval/request', 'user-questions/request'].includes(String(frame.event)) &&
          this.store.allowsSession(this.userId, frame.agentId, 'write')
        ) {
          this.deliveries.set(frame.eventId, frame.agentId)
          yield value
        } else if (
          frame?.type === 'cancel' &&
          typeof frame.eventId === 'string' &&
          this.deliveries.delete(frame.eventId)
        )
          yield value
        else if (frame?.type === 'emit' && Array.isArray(frame.args)) {
          // Exhaustive allowlist from the rc.2 session event resource declarations.
          const event = frame.event,
            first = frame.args[0]
          const session = event === 'api-session/added' ? record(first)?.sessionId : first
          if (
            [
              'api-session/activity',
              'api-session/added',
              'api-session/error',
              'api-session/removed',
              'api-session/status',
            ].includes(String(event)) &&
            typeof session === 'string' &&
            this.store.allowsSession(this.userId, session, 'read')
          )
            yield value
        }
      }
    } finally {
      this.clientId = undefined
      this.deliveries.clear()
    }
  }
}

export class TeamBridge {
  private readonly opening = new Map<string, Promise<{ sessionId: string }>>()
  constructor(
    readonly ctx: Context,
    readonly store: TeamStore,
    readonly projectRoot: string,
    private readonly policy: () => ConnectionRpcHandler | undefined = () => undefined,
    private readonly scans?: NativeScans,
  ) {
    ctx.remoteAccess.registerPolicy('prism', {
      bindings: (principal) => teamBindings(store, principal.userId),
    })
    ctx.effect(() => store.subscribe(() => ctx.remoteAccess.invalidate()), 'prism project access')
  }
  createPeer(userId: string) {
    return new TeamPeer(this.ctx, this.store, userId, this.policy)
  }
  private async openSession(
    userId: string,
    projectId: string | undefined,
    fresh: boolean,
  ): Promise<{ sessionId: string }> {
    const key = projectId ? `project:${projectId}` : `personal:${userId}`
    // Simultaneous module loads share one native session creation, never a hidden project.
    const pending = this.opening.get(key)
    if (pending) {
      await pending
      return this.openSession(userId, projectId, false)
    }
    const operation = (async () => {
      await this.store.refresh()
      const project = projectId ? this.store.assertProject(userId, projectId, 'read') : undefined
      if (!project) this.store.assertPermission(userId, 'task.use')
      const previous = project
        ? this.store.sessions.filter((row) => row.project_id === project.id).at(-1)
        : this.store.personalSessions.filter((row) => row.user_id === userId).at(-1)
      if (!fresh && previous) return { sessionId: previous.session_id }
      if (project) this.store.assertProject(userId, project.id, 'write')
      const path = project?.root_path ?? resolve(this.projectRoot, 'personal', userId)
      await mkdir(path, { recursive: true, mode: 0o700 })
      const workspaceId =
        project?.workspace_id ??
        (await this.ctx.workspaceController.create({ path })).workspace.workspaceId
      const created = await this.ctx.sessionController.create({ cwd: path, agentPreset: 'redteam' })
      if (project) await this.store.addSession(userId, project.id, created.sessionId)
      else
        await this.store.addPersonalSession(userId, {
          session_id: created.sessionId,
          workspace_id: workspaceId,
          root_path: path,
        })
      return { sessionId: created.sessionId }
    })()
    this.opening.set(key, operation)
    try {
      return await operation
    } finally {
      this.opening.delete(key)
    }
  }
  index(html: string, userId: string) {
    const value = JSON.stringify(
      this.ctx.remoteAccess.snapshotFor({ kind: 'prism', userId }),
    ).replaceAll('<', '\\u003c')
    // Native BOOT_READY is after all injection rows. Set the caller baseline before it resolves.
    const marker = '<script>(globalThis.__DSH_BOOT_READY__'
    if (!html.includes(marker)) throw new Error('Unsupported DSH index')
    return html.replace(
      marker,
      `<script>globalThis[${JSON.stringify(REMOTE_ACCESS_SNAPSHOT_KEY)}]=${value}</script>${marker}`,
    )
  }
  async api(userId: string, action: string, body: Record<string, unknown>) {
    const text = (key: string) => {
      if (typeof body[key] !== 'string') throw new TeamError(400, '参数无效。')
      return body[key] as string
    }
    await this.store.refresh()
    if (!this.store.user(userId)) throw new TeamError(401, '请重新登录。')
    if (action.startsWith('scan-')) {
      if (!this.scans) throw new TeamError(503, '原生扫描引擎尚未就绪。')
      return await this.scans.api(userId, action, body)
    }
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
      const { workspace } = await this.ctx.workspaceController.create({ path })
      await this.store.addProject(userId, {
        id,
        name,
        owner_id: userId,
        workspace_id: workspace.workspaceId,
        root_path: path,
      })
      return { id }
    }
    if (action === 'session-open') {
      if (body.fresh !== undefined && typeof body.fresh !== 'boolean')
        throw new TeamError(400, '参数无效。')
      return this.openSession(
        userId,
        body.projectId === undefined ? undefined : text('projectId'),
        body.fresh === true,
      )
    }
    if (action === 'session-create') {
      const project = this.store.assertProject(userId, text('projectId'), 'write')
      const created = await this.ctx.sessionController.create({
        cwd: project.root_path,
        agentPreset: 'redteam',
      })
      await this.store.addSession(userId, project.id, created.sessionId)
      return created
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
