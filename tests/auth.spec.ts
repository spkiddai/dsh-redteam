import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { embeddedDatabase } from '../src/lib/embedded-database.js'
import { TeamStore, type TeamDatabase } from '../src/lib/team-database.js'
import { authCookie, readAuthCookie } from '../src/lib/local-auth.js'
import { startAuthGateway } from '../src/plugins/auth-gateway.js'
import type { TeamBridge } from '../src/plugins/team-bridge.js'
import { WebSocket } from 'ws'
import { once } from 'node:events'
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
})
async function setup() {
  const db = embeddedDatabase('memory://')
  cleanups.push(() => db.close())
  const store = new TeamStore(db)
  await store.initialize()
  return { db, store }
}
async function administrator(store: TeamStore) {
  const login = await store.login('admin', 'admin', 'admin-ip')
  const token = await store.changePassword(login.user.id, 'admin', 'Changed-admin-password!')
  return { user: (await store.authenticate(token))!, token }
}
describe('database identities and project grants', () => {
  it('seeds once, allows initial login, accepts eight-character passwords, and persists revocation', async () => {
    const { db, store } = await setup()
    const seed = await store.login('admin', 'admin', 'one')
    expect(seed.user.must_change).toBe(true)
    expect(store.user(seed.user.id)).toMatchObject({ role: 'admin' })
    expect(await store.authenticate(seed.token)).toMatchObject({ role: 'admin' })
    await expect(store.changePassword(seed.user.id, 'admin', '1234567')).rejects.toThrow('8')
    await expect(
      store.changePassword(seed.user.id, 'wrong', 'Another-long-password'),
    ).rejects.toThrow('当前密码')
    const token = await store.changePassword(seed.user.id, 'admin', 'Abc12345')
    expect(await store.authenticate(seed.token)).toBeUndefined()
    const reboot = new TeamStore(db)
    await reboot.initialize()
    expect(await reboot.authenticate(token)).toMatchObject({ must_change: false })
    expect(
      (await db.query<{ hash: string }>('SELECT hash FROM prism_users')).rows[0]!.hash,
    ).toHaveLength(128)
    await expect(reboot.login('admin', 'admin', 'other')).rejects.toThrow('账号或密码')
    await reboot.logout(token)
    expect(await store.authenticate(token)).toBeUndefined()
    expect(authCookie(token, true)).toContain('HttpOnly; SameSite=Strict')
    expect(authCookie('', true)).toContain('Max-Age=0; Secure')
    expect(readAuthCookie(`prism_session=${token}`)).toBe(token)
    expect(readAuthCookie(`prism_session=${token}; prism_session=${token}`)).toBeUndefined()
    expect(readAuthCookie('prism_session=bad')).toBeUndefined()
  }, 20000)
  it('isolates projects, enforces roles, revokes grants, and protects the last administrator', async () => {
    const { store } = await setup()
    const admin = await administrator(store)
    const alice = await store.createUser(
      admin.user.id,
      'alice',
      'Alice-temporary-password',
      'member',
    )
    const bob = await store.createUser(admin.user.id, 'bob', 'Bob-temporary-password', 'member')
    const aliceToken = await store.changePassword(
      alice.id,
      'Alice-temporary-password',
      'Alice-changed-password',
    )
    await store.changePassword(bob.id, 'Bob-temporary-password', 'Bob-changed-password')
    await expect(
      store.createUser(alice.id, 'evil', 'Long-temporary-password', 'admin'),
    ).rejects.toThrow('权限')
    await store.addProject(alice.id, {
      id: 'p1',
      name: 'private',
      owner_id: alice.id,
      workspace_id: 'w1',
      root_path: '/projects/p1',
    })
    await store.addSession(alice.id, 'p1', 's1')
    expect(store.allowsSession(alice.id, 's1', 'manage')).toBe(true)
    expect(store.restrictedSession('s1')).toBe(true)
    expect(store.restrictedSession('unmanaged')).toBe(false)
    expect(store.allowsSession(bob.id, 's1', 'read')).toBe(false)
    expect(store.allowsSession(admin.user.id, 's1', 'manage')).toBe(true)
    const read = { permission: 'project.read' as const, resource: 'p1' }
    const run = { permission: 'project.run' as const, resource: 'p1' }
    await expect(store.setUserPermission(alice.id, bob.id, read, 'allow')).rejects.toThrow('权限')
    await store.setUserPermission(admin.user.id, bob.id, read, 'allow')
    expect(store.allowsSession(bob.id, 's1', 'read')).toBe(true)
    expect(store.allowsSession(bob.id, 's1', 'write')).toBe(false)
    await expect(store.addSession(bob.id, 'p1', 's2')).rejects.toThrow('权限')
    await store.setUserPermission(admin.user.id, bob.id, run, 'allow')
    expect(store.allowsSession(bob.id, 's1', 'write')).toBe(true)
    await expect(store.setUserPermission(bob.id, bob.id, run, 'allow')).rejects.toThrow('权限')
    await store.setUserPermission(admin.user.id, bob.id, read, null)
    await store.setUserPermission(admin.user.id, bob.id, run, null)
    expect(store.allowsSession(bob.id, 's1', 'read')).toBe(false)
    await expect(store.updateUser(admin.user.id, 'missing', 'member', false)).rejects.toThrow(
      '不存在',
    )
    await expect(
      store.updateUser(admin.user.id, bob.id, 'invalid' as never, false),
    ).rejects.toThrow('角色')
    await expect(store.updateUser(admin.user.id, admin.user.id, 'member', false)).rejects.toThrow(
      '至少',
    )
    await store.updateUser(admin.user.id, alice.id, 'member', true)
    expect(await store.authenticate(aliceToken)).toBeUndefined()
    expect(store.allowsSession(alice.id, 's1', 'read')).toBe(false)
    await store.updateUser(admin.user.id, alice.id, 'member', false, 'Reset-long-password')
    expect((await store.login('alice', 'Reset-long-password', 'reset')).user.must_change).toBe(true)
    await store.setUserPermission(
      admin.user.id,
      alice.id,
      { permission: 'project.manage', resource: 'p1' },
      null,
    )
    await store.setUserPermission(admin.user.id, alice.id, read, 'allow')
    expect(store.allowsSession(alice.id, 's1', 'manage')).toBe(false)
  }, 20000)
  it('rate-limits invalid credentials and fails closed on database failure', async () => {
    const { store, db } = await setup()
    for (let i = 0; i < 5; i++)
      await expect(store.login('unknown', 'wrong', 'same')).rejects.toThrow('账号或密码')
    await expect(store.login('unknown', 'wrong', 'same')).rejects.toThrow('频繁')
    const broken: TeamDatabase = {
      ...db,
      query: async () => {
        throw new Error('database offline')
      },
    }
    const instance = new TeamStore(broken)
    await expect(instance.refresh()).rejects.toThrow('offline')
    expect(instance.users).toEqual([])
    await expect(instance.authenticate('token')).rejects.toThrow('offline')
  })
})
describe('authenticated HTTP boundary', () => {
  it('permits initial passwords, rejects cross-origin and setup, and dispatches by user', async () => {
    const { store } = await setup()
    const upstream = createServer((_req, res) => {
      res.end('<script>(globalThis.__DSH_BOOT_READY__ ??= {}).resolve()</script>')
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          upstream.closeAllConnections()
          upstream.close(() => resolve())
        }),
    )
    const calls: string[] = []
    const bridge = {
      createPeer: (userId: string) => ({
        fetch: async () => {
          calls.push(userId)
          return Response.json({ ok: true })
        },
        dispose: vi.fn(),
      }),
      api: vi.fn(),
      index: (html: string) => html,
    } as unknown as TeamBridge
    const address = upstream.address() as { port: number }
    const gateway = await startAuthGateway({
      auth: store,
      bridge,
      port: 0,
      upstream: `http://127.0.0.1:${address.port}`,
      upstreamCookie: 'private=secret',
    })
    cleanups.push(gateway.close)
    const get = (path: string, cookie = '') =>
      fetch(gateway.origin + path, { headers: { cookie }, redirect: 'manual' })
    const post = (path: string, value: unknown, cookie = '', origin = gateway.origin) =>
      fetch(gateway.origin + path, {
        method: 'POST',
        headers: { origin, cookie, 'content-type': 'application/json' },
        body: JSON.stringify(value),
      })
    expect((await get('/')).status).toBe(303)
    expect((await get('/api/session/list')).status).toBe(401)
    expect((await get('/login')).status).toBe(200)
    expect((await post('/prism-auth/password', {})).status).toBe(401)
    expect((await post('/prism-auth/login', [])).status).toBe(400)
    expect((await post('/prism-auth/login', { username: 12 })).status).toBe(400)
    expect(
      (
        await fetch(gateway.origin + '/prism-auth/login', {
          method: 'POST',
          headers: { origin: gateway.origin },
          body: 'invalid',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await post(
          '/prism-auth/login',
          { username: 'admin', password: 'admin' },
          '',
          'http://evil.test',
        )
      ).status,
    ).toBe(403)
    const login = await post('/prism-auth/login', { username: 'admin', password: 'admin' })
    const initial = login.headers.get('set-cookie')!.split(';')[0]!
    expect((await get('/api/session/list', initial)).status).toBe(200)
    expect((await get('/', initial)).status).toBe(200)
    expect((await get('/login', initial)).status).toBe(303)
    const change = await post(
      '/prism-auth/password',
      { oldPassword: 'admin', password: 'Changed-admin-password!' },
      initial,
    )
    const cookie = change.headers.get('set-cookie')!.split(';')[0]!
    expect((await post('/api/session/list', {}, cookie)).status).toBe(200)
    expect(calls).toEqual([store.users[0]!.id, store.users[0]!.id])
    expect((await post('/prism-auth/setup', {}, cookie)).status).toBe(404)
    expect((await get('/connect', cookie)).status).toBe(404)
    expect((await get('/.env', cookie)).status).toBe(404)
    expect((await get('/', cookie)).status).toBe(200)
    expect((await get('/login', cookie)).status).toBe(303)
    expect((await get('/login?password', cookie)).status).toBe(200)
    expect((await get('/prism-api/user-create', cookie)).status).toBe(405)
    expect((await post('/prism-auth/password', {}, cookie)).status).toBe(400)
    const invalid = new WebSocket(gateway.origin.replace('http:', 'ws:') + '/api/remote.mux', {
      headers: { cookie },
      origin: 'http://evil.test',
    })
    expect(await once(invalid, 'error')).toHaveLength(1)
    const socket = new WebSocket(gateway.origin.replace('http:', 'ws:') + '/api/remote.mux', {
      headers: { cookie },
      origin: gateway.origin,
    })
    await once(socket, 'open')
    const closed = once(socket, 'close')
    await post('/prism-auth/logout', {}, cookie)
    await closed
    expect((await get('/api/session/list', cookie)).status).toBe(401)
  }, 20000)
})
