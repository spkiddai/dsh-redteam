import { describe, expect, it, vi } from 'vitest'
import { TeamPeer, TeamBridge, teamBindings } from '../src/plugins/team-bridge.js'
import { TeamStore } from '../src/lib/team-database.js'
import { embeddedDatabase } from '../src/lib/embedded-database.js'
import { Context } from '@deepseek-ai/cordis'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import { StreamInbox } from '../src/plugins/team-stream.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const empty = async function* () {}
function snapshot() {
  const store = new TeamStore({} as never)
  store.users = ['admin', 'alice', 'bob'].map((id) => ({
    id,
    username: id,
    role: id === 'admin' ? 'admin' : 'member',
    disabled: false,
    must_change: false,
  }))
  store.projects = [
    { id: 'pa', owner_id: 'alice', name: 'A', workspace_id: 'wa', root_path: '/a' },
    { id: 'pb', owner_id: 'bob', name: 'B', workspace_id: 'wb', root_path: '/b' },
  ]
  store.sessions = [
    { session_id: 'sa', project_id: 'pa' },
    { session_id: 'sb', project_id: 'pb' },
  ]
  store.userPermissions = [
    { user_id: 'alice', permission: 'project.manage', resource: 'pa', effect: 'allow' },
    { user_id: 'bob', permission: 'project.manage', resource: 'pb', effect: 'allow' },
  ]
  return store
}
describe('native project access and event bridge', () => {
  it('opens independent tasks without projects, isolates owners and applies revocation to native access', async () => {
    const db = embeddedDatabase('memory://'),
      store = new TeamStore(db)
    const root = await mkdtemp(join(tmpdir(), 'prism-tasks-'))
    const ctx = new Context()
    await ctx.plugin(RemoteAccess)
    let counter = 0
    const create = vi.fn(async () => ({ sessionId: `task-${++counter}` }))
    try {
      await store.initialize()
      const admin = store.users[0]!
      const alice = await store.createUser(admin.id, 'alice', '12345678', 'member')
      const bob = await store.createUser(admin.id, 'bob', '12345678', 'member')
      await store.setUserPermission(
        admin.id,
        alice.id,
        { permission: 'project.create', resource: '*' },
        'deny',
      )
      const bridge = new TeamBridge(
        {
          remoteAccess: ctx.remoteAccess,
          effect: vi.fn(),
          workspaceController: {
            create: async ({ path }: { path: string }) => ({ workspace: { workspaceId: path } }),
          },
          sessionController: { create },
        } as unknown as Context,
        store,
        root,
      )
      const [first, again] = (await Promise.all([
        bridge.api(alice.id, 'session-open', {}),
        bridge.api(alice.id, 'session-open', {}),
      ])) as { sessionId: string }[]
      expect(first).toEqual(again)
      expect(create).toHaveBeenCalledTimes(1)
      expect(store.projects).toHaveLength(0)
      expect(store.isManaged(first!.sessionId)).toBe(true)
      expect(store.restrictedSession(first!.sessionId)).toBe(true)
      const decide = (userId: string, action: string) =>
        ctx.remoteAccess.decide({
          principal: { kind: 'prism', userId },
          action: action as never,
          resources: [{ kind: 'session', id: first!.sessionId as never }],
        }).kind
      expect(decide(alice.id, 'session/page')).toBe('allow')
      expect(decide(alice.id, 'session/prompt')).toBe('allow')
      expect(decide(bob.id, 'session/page')).toBe('deny')
      expect(decide(admin.id, 'session/page')).toBe('allow')
      const bobState = (await bridge.api(bob.id, 'state', {})) as { personalSessions: string[] }
      expect(bobState.personalSessions).toEqual([])
      const fresh = await bridge.api(alice.id, 'session-open', { fresh: true })
      expect(fresh).not.toEqual(first)
      expect(await bridge.api(alice.id, 'session-open', {})).toEqual(fresh)
      await bridge.api(bob.id, 'session-open', { userId: alice.id })
      expect(store.personalSessions.at(-1)?.user_id).toBe(bob.id)
      await expect(bridge.api(bob.id, 'session-open', { fresh: 'true' })).rejects.toThrow('参数')
      await expect(bridge.api(bob.id, 'session-open', { projectId: 'missing' })).rejects.toThrow(
        '权限',
      )
      await store.setUserPermission(
        admin.id,
        alice.id,
        { permission: 'task.use', resource: '*' },
        'deny',
      )
      expect(decide(alice.id, 'session/page')).toBe('deny')
      await expect(bridge.api(alice.id, 'session-open', {})).rejects.toThrow('权限')
      await store.initialize()
      expect(store.allowsSession(alice.id, first!.sessionId, 'read')).toBe(false)
      expect(store.personalSessions).toHaveLength(3)
    } finally {
      await ctx.fiber.dispose()
      await db.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 20000)
  it('uses the real DSH access service to deny foreign sessions and unrelated host APIs', async () => {
    const ctx = new Context()
    await ctx.plugin(RemoteAccess)
    try {
      const store = snapshot()
      ctx.remoteAccess.registerPolicy('prism', { bindings: (p) => teamBindings(store, p.userId) })
      const decide = (userId: string, action: string, id: string) =>
        ctx.remoteAccess.decide({
          principal: { kind: 'prism', userId },
          action: action as never,
          resources: [{ kind: 'session', id: id as never }],
        })
      expect(decide('alice', 'session/page', 'sa').kind).toBe('allow')
      expect(decide('alice', 'session/page', 'sb').kind).toBe('deny')
      expect(decide('admin', 'session/page', 'sb').kind).toBe('allow')
      expect(decide('admin', 'session/page', 'unmanaged').kind).toBe('deny')
      store.userPermissions.push({
        user_id: 'bob',
        permission: 'project.read',
        resource: 'pa',
        effect: 'allow',
      })
      expect(decide('bob', 'session/page', 'sa').kind).toBe('allow')
      expect(decide('bob', 'session/prompt', 'sa').kind).toBe('deny')
      store.userPermissions.at(-1)!.permission = 'project.run'
      expect(decide('bob', 'session/prompt', 'sa').kind).toBe('allow')
      store.userPermissions.pop()
      expect(decide('bob', 'session/page', 'sa').kind).toBe('deny')
      for (const action of [
        'session/create',
        'workspace/create',
        'directoryPicker/list',
        'pluginManager/install',
        'session/initializeDefaultModel',
      ])
        expect(
          ctx.remoteAccess.decide({
            principal: { kind: 'prism', userId: 'alice' },
            action: action as never,
            resources: [{ kind: 'global' }],
          }).kind,
        ).toBe('deny')
      store.users[1]!.disabled = true
      expect(teamBindings(store, 'alice')).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })
  it('filters every event and binds approvals to the delivered session and peer', async () => {
    const store = snapshot(),
      peers: unknown[] = [],
      calls: unknown[] = []
    const nativeFetch = vi.fn(async (_req, peer) => {
      calls.push(peer)
      return Response.json({ ok: true })
    })
    let finish!: () => void
    const done = new Promise<void>((resolve) => {
      finish = resolve
    })
    const ctx = {
      connection: {
        createPeer: (options: unknown) => {
          const p = { ...(options as object), dispose: vi.fn() }
          peers.push(p)
          return p
        },
        createSharedFetchHandler: () => ({ fetch: nativeFetch }),
      },
      typertGateway: {
        wireStream: {
          open: vi.fn(async (endpoint: string) =>
            endpoint === '$events'
              ? (async function* () {
                  yield { type: 'ready', clientId: 'client-a', host: { home: '/private' } }
                  yield { type: 'emit', event: 'credentials/record-updated', args: ['SECRET'] }
                  yield { type: 'emit', event: 'api-session/added', args: [{ sessionId: 'sb' }] }
                  yield { type: 'emit', event: 'api-session/status', args: ['sa'] }
                  yield {
                    type: 'waterfall',
                    agentId: 'sb',
                    eventId: 'foreign',
                    event: 'approval/request',
                  }
                  yield {
                    type: 'waterfall',
                    agentId: 'sa',
                    eventId: 'own',
                    event: 'approval/request',
                  }
                  await done
                  yield { type: 'cancel', eventId: 'own' }
                })()
              : (async function* () {
                  yield 'native-result'
                })(),
          ),
        },
      },
    } as unknown as Context
    const peer = new TeamPeer(ctx, store, 'alice')
    const stream = peer.stream('$events', { args: {} }, empty(), new AbortController().signal)
    expect((await stream.next()).value).toMatchObject({ type: 'ready', host: { home: '' } })
    expect((await stream.next()).value).toMatchObject({ type: 'emit', event: 'api-session/status' })
    expect((await stream.next()).value).toMatchObject({ eventId: 'own' })
    const request = (eventId: string, clientId = 'client-a') =>
      new Request('http://127.0.0.1/api/$events/result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload: {
            args: { clientId, eventId, outcome: { kind: 'result', value: 'allowed-once' } },
          },
        }),
      })
    expect((await peer.fetch(request('foreign'))).status).toBe(403)
    expect((await peer.fetch(request('own', 'other-client'))).status).toBe(403)
    expect((await peer.fetch(request('own'))).status).toBe(200)
    expect(calls.at(-1)).toBe(peers[1])
    expect((await peer.fetch(request('own'))).status).toBe(403)
    await peer.fetch(new Request('http://127.0.0.1/api/session/list'))
    expect(calls.at(-1)).toBe(peers[0])
    finish()
    await stream.next()
    expect(
      (await peer.stream('session/follow', {}, empty(), new AbortController().signal).next()).value,
    ).toBe('native-result')
    peer.dispose()
  })
  it('manages only authorized projects and returns an access baseline before boot', async () => {
    const db = embeddedDatabase('memory://'),
      store = new TeamStore(db),
      root = await mkdtemp(join(tmpdir(), 'prism-bridge-'))
    try {
      await store.initialize()
      const admin = await store.login('admin', 'admin', 'admin')
      await store.changePassword(admin.user.id, 'admin', 'A-long-new-password')
      const ctx = {
        remoteAccess: {
          registerPolicy: vi.fn(),
          invalidate: vi.fn(),
          snapshotFor: () => ({ type: 'baseline', owner: false, grants: [] }),
        },
        effect: vi.fn(),
        workspaceController: {
          create: async () => ({ workspace: { workspaceId: 'workspace-one' } }),
        },
        sessionController: { create: async () => ({ sessionId: 'session-one' }) },
      } as unknown as Context
      const bridge = new TeamBridge(ctx, store, root),
        userId = admin.user.id
      const project = (await bridge.api(userId, 'project-create', { name: 'Private' })) as {
        id: string
      }
      await bridge.api(userId, 'session-create', { projectId: project.id })
      expect(await bridge.api(userId, 'session-open', { projectId: project.id })).toEqual({
        sessionId: 'session-one',
      })
      const user = (await bridge.api(userId, 'user-create', {
        username: 'member',
        password: 'A-temporary-password',
        role: 'member',
      })) as { id: string }
      const role = (await bridge.api(userId, 'role-save', {
        name: 'Reviewer',
        description: '',
        grants: [{ permission: 'project.read', resource: project.id }],
      })) as { id: string }
      await bridge.api(userId, 'user-roles', { userId: user.id, roleIds: [role.id] })
      expect(store.allows(user.id, project.id, 'read')).toBe(true)
      await bridge.api(userId, 'permission-set', {
        userId: user.id,
        permission: 'project.read',
        resource: project.id,
        effect: 'deny',
      })
      expect(store.allows(user.id, project.id, 'read')).toBe(false)
      await bridge.api(userId, 'permission-set', {
        userId: user.id,
        permission: 'project.read',
        resource: project.id,
        effect: null,
      })
      expect(store.allows(user.id, project.id, 'read')).toBe(true)
      await expect(
        bridge.api(user.id, 'permission-set', {
          userId: user.id,
          permission: 'project.manage',
          resource: project.id,
          effect: 'allow',
        }),
      ).rejects.toThrow('权限')
      await expect(bridge.api(userId, 'member-set', {})).rejects.toThrow('接口')
      await expect(bridge.api(userId, 'role-save', { grants: [null] })).rejects.toThrow('权限')
      await expect(bridge.api(userId, 'user-roles', { roleIds: [123] })).rejects.toThrow('角色')
      const state = (await bridge.api(userId, 'state', {})) as {
        projects: unknown[]
        users: unknown[]
      }
      expect(state.projects).toHaveLength(1)
      expect(state.users).toHaveLength(2)
      await bridge.api(userId, 'user-update', { userId: user.id, role: 'member', disabled: true })
      await expect(bridge.api(userId, 'missing', {})).rejects.toThrow('接口')
      await expect(bridge.api(userId, 'project-create', { name: ' ' })).rejects.toThrow('名称')
      await expect(bridge.api(userId, 'session-create', {})).rejects.toThrow('参数')
      const html = bridge.index(
        '<script>globalThis.old=true</script><script>(globalThis.__DSH_BOOT_READY__ ??= {}).resolve()</script>',
        userId,
      )
      expect(html).toContain('"owner":false')
      expect(html.indexOf('"owner":false')).toBeLessThan(html.indexOf('__DSH_BOOT_READY__'))
      expect(() => bridge.index('no marker', userId)).toThrow('Unsupported')
    } finally {
      await db.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 20000)
  it('bounds stream queues and drains them on end', async () => {
    const inbox = new StreamInbox(),
      iterator = inbox[Symbol.asyncIterator](),
      next = iterator.next()
    inbox.push({ value: 1 })
    expect((await next).value).toEqual({ value: 1 })
    for (let i = 0; i < 256; i++) inbox.push(i)
    expect(() => inbox.push(257)).toThrow('overflow')
    inbox.end()
    expect(() => inbox.push(1)).toThrow('ended')
    let count = 0
    for await (const _ of inbox) {
      count++
    }
    expect(count).toBe(256)
    expect(() => new StreamInbox().push('x'.repeat(262145))).toThrow('overflow')
  })
})
