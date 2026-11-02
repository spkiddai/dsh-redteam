import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionSettingsStore, parseMcpConnection } from '../src/lib/session-settings.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'redteam-settings-'))
  roots.push(root)
  return { root, store: new SessionSettingsStore(root, 'session-a') }
}

describe('durable session settings', () => {
  it('restores policy and connection definitions without crossing sessions', async () => {
    const { root, store } = await fixture()
    const defaults = await store.load()
    const connection = parseMcpConnection({
      label: ' Local ',
      endpoint: 'http://127.0.0.1:8080/mcp',
      transport: 'http',
    })
    const saved = {
      policy: { ...defaults.policy, operationMode: 'full' as const, enabledToolIds: ['nmap'] },
      connections: [connection],
    }
    await store.save(saved)
    expect(await new SessionSettingsStore(root, 'session-a').load()).toEqual(saved)
    expect(await new SessionSettingsStore(root, 'session-b').load()).toEqual(defaults)
    const key = createHash('sha256').update('session-a').digest('hex')
    const file = join(root, 'sessions', `${key}.json`)
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readFile(file, 'utf8')).not.toContain('session-a')
    await writeFile(file, '{"version":2,"connections":[]}')
    await expect(store.load()).rejects.toThrow('版本')
    await writeFile(file, 'not json')
    await expect(store.load()).rejects.toThrow()
  })

  it('rejects invalid, credential-bearing, and unsupported connection definitions', () => {
    for (const value of [
      null,
      {},
      { label: '', endpoint: 'x', transport: 'http' },
      { label: 'x', endpoint: 1, transport: 'http' },
      ...[
        'http://u:p@localhost/',
        'http://localhost/?token=x',
        'http://localhost/#secret',
        'file:///tmp/server',
      ].map((endpoint) => ({ label: 'x', endpoint, transport: 'http' })),
      { label: 'x', endpoint: 'node server.js', transport: 'stdio' },
      { label: 'x', endpoint: '/tmp/server\n', transport: 'stdio' },
      { label: 'x', endpoint: '/tmp/server', transport: 'sse' },
    ])
      expect(() => parseMcpConnection(value)).toThrow()
    expect(
      parseMcpConnection({
        label: 'local',
        endpoint: '/usr/local/bin/mcp-server',
        transport: 'stdio',
      }),
    ).toMatchObject({ transport: 'stdio' })
    expect(
      parseMcpConnection({ label: 'local', endpoint: 'C:\\tools\\mcp.exe', transport: 'stdio' }),
    ).toMatchObject({ transport: 'stdio' })
  })
})
