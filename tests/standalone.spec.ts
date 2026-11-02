import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { startApplication } from '../src/server/app.js'
import { startHttp } from '../src/server/http.js'
import { PluginHost, type PrismPlugin } from '../src/server/plugins.js'
import { embeddedDatabase } from '../src/lib/embedded-database.js'
import { TeamStore } from '../src/lib/team-database.js'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
})
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'prism-standalone-test-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const db = embeddedDatabase('memory://')
  const app = await startApplication({
    database: db,
    projectRoot: root,
    client: 'console.log("fixture")',
    port: 0,
  })
  cleanups.push(() => app.close())
  const request = (
    path: string,
    input?: unknown,
    cookie = '',
    method = input === undefined ? 'GET' : 'POST',
  ) =>
    fetch(app.origin + path, {
      method,
      redirect: 'manual',
      headers: {
        origin: app.origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    })
  const login = await request('/prism-auth/login', { username: 'admin', password: 'admin' })
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!
  const api = (action: string, input: unknown = {}, auth = cookie) =>
    request('/prism-api/' + action, input, auth)
  return { db, app, request, cookie, api }
}
it('serves an independently authenticated application and rejects cross-origin and legacy requests', async () => {
  const { app, request, cookie, api } = await setup()
  expect((await request('/')).status).toBe(303)
  expect((await request('/assets/app.js')).status).toBe(401)
  expect((await request('/login')).headers.get('content-security-policy')).toContain('nonce-')
  expect((await request('/login', undefined, cookie)).status).toBe(303)
  expect((await request('/login?password=1', undefined, cookie)).status).toBe(200)
  expect(await (await request('/prism-auth/state', undefined, cookie)).json()).toMatchObject({
    authenticated: true,
    passwordChangeRecommended: true,
  })
  expect(await (await request('/', undefined, cookie)).text()).toContain('/assets/app.js')
  expect(await (await request('/assets/app.js', undefined, cookie)).text()).toContain('fixture')
  for (const path of ['/', '/assets/app.js'])
    expect(await (await request(path, undefined, cookie, 'HEAD')).text()).toBe('')
  expect((await request('/api/remote.mux', undefined, cookie)).status).toBe(404)
  expect((await request('/', {}, cookie)).status).toBe(405)
  expect((await request('/prism-api/scan-list', undefined, cookie)).status).toBe(405)
  expect((await api('unknown')).status).toBe(404)
  expect(
    (
      await fetch(app.origin + '/prism-auth/state', {
        headers: { origin: 'https://other.invalid' },
      })
    ).status,
  ).toBe(403)
  const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(
      app.origin + '/prism-auth/state',
      { headers: { host: 'other.invalid' } },
      (res) => {
        res.resume()
        resolve(res.statusCode)
      },
    )
    req.on('error', reject)
    req.end()
  })
  expect(wrongHost).toBe(403)
  expect(
    (await fetch(app.origin + '/prism-auth/login', { method: 'POST', body: '{}' })).status,
  ).toBe(403)
  for (const value of [null, [], {}, 'a'])
    expect((await request('/prism-auth/login', value)).status).toBe(400)
  expect(
    (
      await fetch(app.origin + '/prism-auth/login', {
        method: 'POST',
        headers: { origin: app.origin, 'content-type': 'text/plain' },
        body: '{}',
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await fetch(app.origin + '/prism-auth/login', {
        method: 'POST',
        headers: { origin: app.origin, 'content-type': 'application/json' },
        body: '{',
      })
    ).status,
  ).toBe(400)
  expect(
    (await request('/prism-auth/password', { oldPassword: 'admin', password: '12345678' })).status,
  ).toBe(401)
  expect((await request('/prism-auth/password', {}, cookie)).status).toBe(400)
  expect(
    (await request('/prism-auth/password', { oldPassword: 'admin', password: '1234567' }, cookie))
      .status,
  ).toBe(400)
  const changed = await request(
    '/prism-auth/password',
    { oldPassword: 'admin', password: '12345678' },
    cookie,
  )
  expect(changed.status).toBe(200)
  expect((await api('plugins-list', {}, cookie)).status).toBe(401)
  const newCookie = changed.headers.get('set-cookie')!.split(';')[0]!
  const loginAgain = await request(
    '/prism-auth/login',
    { username: 'admin', password: '12345678' },
    newCookie,
  )
  expect(loginAgain.status).toBe(200)
  const fresh = loginAgain.headers.get('set-cookie')!.split(';')[0]!
  expect((await request('/prism-auth/logout', {}, fresh)).status).toBe(200)
  expect((await request('/prism-auth/logout', {})).status).toBe(200)
}, 20000)

it('keeps independent assets private and enforces role grants, project permissions and revocation', async () => {
  const { api, request, cookie } = await setup()
  expect(await (await api('plugins-list')).json()).toMatchObject({
    runtime: 'prism',
    agent: { available: false },
    plugins: [{ id: 'identity' }, { id: 'scanner' }, { id: 'assets' }],
  })
  const state = await (await request('/prism-api/state', undefined, cookie)).json()
  expect(state.capabilities.manageUsers).toBe(true)
  const alice = await (
    await api('user-create', { username: 'alice', password: '12345678', role: 'member' })
  ).json()
  const bob = await (
    await api('user-create', { username: 'bob', password: '12345678', role: 'member' })
  ).json()
  const role = await (
    await api('role-save', {
      name: '独立工作',
      description: 'test',
      grants: [{ permission: 'task.use', resource: '*' }],
    })
  ).json()
  expect((await api('user-roles', { userId: alice.id, roleIds: ['member', role.id] })).status).toBe(
    200,
  )
  const aliceLogin = await request('/prism-auth/login', { username: 'alice', password: '12345678' })
  const aliceCookie = aliceLogin.headers.get('set-cookie')!.split(';')[0]!
  const bobLogin = await request('/prism-auth/login', { username: 'bob', password: '12345678' })
  const bobCookie = bobLogin.headers.get('set-cookie')!.split(';')[0]!
  const entry = {
    type: 'domain',
    value: 'example.test',
    source: 'https://example.test/source',
    note: 'observed',
  }
  await api('permission-set', {
    userId: bob.id,
    permission: 'task.use',
    resource: '*',
    effect: 'deny',
  })
  expect((await api('asset-create', entry, aliceCookie)).status).toBe(200)
  expect((await api('asset-create', entry, bobCookie)).status).toBe(403)
  expect((await (await api('asset-list', {}, bobCookie)).json()).assets).toEqual([])
  expect((await (await api('asset-list', {}, aliceCookie)).json()).assets).toHaveLength(1)
  expect((await (await api('asset-list')).json()).assets).toHaveLength(1)
  const project = await (await api('project-create', { name: '共享项目' }, aliceCookie)).json()
  expect((await api('asset-create', { ...entry, projectId: project.id }, aliceCookie)).status).toBe(
    200,
  )
  expect((await api('asset-create', { ...entry, projectId: project.id }, bobCookie)).status).toBe(
    403,
  )
  expect(
    (
      await api('permission-set', {
        userId: bob.id,
        permission: 'project.read',
        resource: project.id,
        effect: 'allow',
      })
    ).status,
  ).toBe(200)
  expect((await (await api('asset-list', {}, bobCookie)).json()).assets).toHaveLength(1)
  const bobState = await (await request('/prism-api/state', undefined, bobCookie)).json()
  expect(bobState.users).toEqual([])
  expect(bobState.projects[0]).toMatchObject({ id: project.id, role: 'viewer' })
  expect((await api('asset-create', { ...entry, source: 'javascript:alert(1)' })).status).toBe(400)
  expect(
    (await api('asset-create', { ...entry, source: 'https://user:secret@example.test' })).status,
  ).toBe(400)
  expect((await api('project-create', { name: '' })).status).toBe(400)
  expect((await api('project-create', { name: 7 })).status).toBe(400)
  expect((await api('role-save', { grants: [null] })).status).toBe(400)
  expect((await api('user-roles', { userId: bob.id, roleIds: [7] })).status).toBe(400)
  expect((await api('user-update', { userId: bob.id, disabled: 'no' })).status).toBe(400)
  expect(
    (await api('role-save', { id: role.id, name: '工作', description: 'updated', grants: [] }))
      .status,
  ).toBe(200)
  expect(
    (
      await api('permission-set', {
        userId: bob.id,
        permission: 'project.read',
        resource: project.id,
        effect: null,
      })
    ).status,
  ).toBe(200)
  expect((await (await api('asset-list', {}, bobCookie)).json()).assets).toEqual([])
  expect(
    (
      await api('user-update', {
        userId: bob.id,
        role: 'member',
        disabled: true,
        password: 'abcdefgh',
      })
    ).status,
  ).toBe(200)
  expect((await api('asset-list', {}, bobCookie)).status).toBe(401)
  expect((await api('scan-catalog')).status).toBe(200)
  expect((await api('scan-list')).status).toBe(200)
  expect((await api('scan-create', {})).status).toBe(400)
}, 20000)

it('orders plugins, validates registrations, rolls back startup and disposes in reverse order', async () => {
  const events: string[] = []
  const context = {
    team: {
      refresh: vi.fn(),
      user: (id: string) => (id === 'user' ? {} : undefined),
    } as unknown as TeamStore,
  }
  const plugin = (id: string, dependencies?: string[]): PrismPlugin => ({
    id,
    name: id,
    version: '1',
    description: id,
    ...(dependencies ? { dependencies } : {}),
    async setup() {
      events.push('start ' + id)
      return {
        actions: { [id]: async () => id },
        dispose: async () => {
          events.push('stop ' + id)
        },
      }
    },
  })
  const host = new PluginHost(context)
  await host.start([plugin('second', ['first']), plugin('first')])
  expect(events).toEqual(['start first', 'start second'])
  expect(await host.api('user', 'second', {})).toBe('second')
  await expect(host.api('missing', 'first', {})).rejects.toMatchObject({ status: 401 })
  await expect(host.api('user', 'missing', {})).rejects.toMatchObject({ status: 404 })
  await expect(host.start([])).rejects.toThrow('already')
  await host.close()
  expect(events.slice(-2)).toEqual(['stop second', 'stop first'])
  await expect(host.start([plugin('a'), plugin('a')])).rejects.toThrow('Duplicate')
  await expect(host.start([plugin('a', ['b']), plugin('b', ['a'])])).rejects.toThrow('dependency')
  await expect(host.start([plugin('a', ['absent'])])).rejects.toThrow('dependency')
  await expect(
    host.start([
      plugin('a'),
      { ...plugin('b'), setup: async () => ({ actions: { a: async () => null } }) },
    ]),
  ).rejects.toThrow('Duplicate')
  await expect(
    host.start([
      { ...plugin('invalid'), setup: async () => ({ actions: { 'Not Valid': async () => null } }) },
    ]),
  ).rejects.toThrow('invalid')
  const dispose = vi.fn(async () => {
    throw new Error('dispose failure')
  })
  await host.start([
    { ...plugin('fail'), setup: async () => ({ actions: {}, dispose }) },
    plugin('last'),
  ])
  await expect(host.close()).rejects.toThrow('shutdown')
  expect(dispose).toHaveBeenCalledOnce()
  expect(host.catalog()).toEqual([])
})

it('rejects invalid public origins and cleans up a failed database startup', async () => {
  await expect(
    startHttp({
      auth: {} as TeamStore,
      api: async () => null,
      port: 0,
      client: '',
      publicOrigin: 'https://example.test/path',
    }),
  ).rejects.toThrow('源地址')
  const db = {
    transaction: vi.fn(async () => {
      throw new Error('offline')
    }),
    close: vi.fn(async () => {}),
    query: vi.fn(),
  }
  await expect(
    startApplication({ database: db, projectRoot: '/tmp', client: '', port: 0 }),
  ).rejects.toThrow('offline')
  expect(db.close).toHaveBeenCalledOnce()
})
