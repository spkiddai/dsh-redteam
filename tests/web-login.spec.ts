import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { installLogin } from '../src/plugins/web-login.js'
afterEach(() => vi.restoreAllMocks())
it('mounts a persistent database login gateway through the DSH lifecycle and disposes it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prism-login-mount-')),
    disposers: (() => unknown)[] = []
  let setup: unknown
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const web = {
    webServer: { getOrigin: () => 'http://127.0.0.1:12345' },
    get: () => ({ port: 0 }),
    connection: {
      authenticatedUrl: (value: string) => value,
      authorizeIndex: (
        _request: unknown,
        response: { writeHead: (status: number, headers: Record<string, string>) => void },
      ) => response.writeHead(303, { 'set-cookie': 'private=kernel; Path=/' }),
    },
    remoteAccess: { registerPolicy: vi.fn(), invalidate: vi.fn() },
    effect: (operation: () => () => unknown) => {
      disposers.push(operation())
    },
  }
  const ctx = {
    inject: (_dependencies: unknown, callback: (value: unknown) => unknown) => {
      setup = callback(web)
    },
  } as unknown as Context
  try {
    const access = installLogin(ctx, {
      accountRoot: join(root, 'nested', 'auth'),
      projectRoot: join(root, 'projects'),
      loginPort: 0,
      loginHost: '127.0.0.1',
    })
    access.setPolicyHandler(async () => ({ ok: true, value: {} }))
    await setup
    const origin = String(info.mock.calls[0]![0]).match(/http:\/\/127\.0\.0\.1:\d+/u)![0]
    expect(await (await fetch(origin + '/prism-auth/state')).json()).toMatchObject({
      initialized: true,
      authenticated: false,
    })
    const login = await fetch(origin + '/prism-auth/login', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    })
    expect(await login.json()).toMatchObject({ passwordChangeRecommended: true })
    const peer = { principal: { kind: 'prism', userId: 'unknown' } } as never
    expect(access.allows(peer, 'unknown', 'read')).toBe(false)
    expect(access.admin(peer)).toBe(false)
    expect(access.managed('unknown')).toBe(false)
    expect(access.restricted('unknown')).toBe(false)
    expect(access.admin({ principal: { kind: 'owner' } } as never)).toBe(true)
  } finally {
    for (const dispose of disposers.reverse()) await dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 20000)
