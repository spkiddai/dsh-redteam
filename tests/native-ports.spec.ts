import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, Socket, type Server } from 'node:net'
import {
  executePortScan,
  normalizePortTargets,
  parsePorts,
  portServiceHint,
  probeTcpPort,
} from '../src/lib/native-ports.js'
import { compareScans, NativeScans } from '../src/lib/native-scans.js'
import {
  completedScanChecks,
  totalScanChecks,
  type ScanJob,
  type PortResult,
  type ScanSummary,
} from '../src/lib/native-scan-types.js'
import { TeamStore } from '../src/lib/team-database.js'
import { embeddedDatabase } from '../src/lib/embedded-database.js'
import { scanReport } from '../src/lib/native-report.js'

const makeJob = (ports: number[], extra: Partial<ScanJob> = {}): ScanJob => ({
  id: 'tcp-job',
  kind: 'ports',
  ownerId: 'alice',
  projectId: null,
  name: '本地端口测试',
  targets: ['fixture.test'],
  portScan: { ports, concurrency: 2 },
  portResults: [],
  policy: { id: 'custom', timeoutMs: 1000, delayMs: 0, ruleIds: [] },
  rules: [],
  ruleHash: 'tcp-test',
  state: 'running',
  createdAt: '2026-10-27T00:00:00Z',
  updatedAt: '2026-10-27T00:00:00Z',
  checks: [],
  findings: [],
  message: '',
  ...extra,
})
const outcome = (port: number, state: PortResult['state']): PortResult => ({
  target: 'fixture.test',
  address: '127.0.0.1',
  port,
  state,
  serviceHint: portServiceHint(port),
  detail: 'local fixture',
  at: '',
})
afterEach(() => vi.restoreAllMocks())
describe('native TCP scanning', () => {
  let server: Server,
    open: number,
    closed: number,
    received = 0
  beforeAll(async () => {
    server = createServer((socket) => {
      socket.on('error', () => {})
      socket.on('data', (b) => {
        received += b.length
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    open = (server.address() as { port: number }).port
    const unused = createServer()
    await new Promise<void>((r) => unused.listen(0, '127.0.0.1', r))
    closed = (unused.address() as { port: number }).port
    await new Promise<void>((r) => unused.close(() => r()))
  })
  afterAll(async () => await new Promise<void>((r) => server.close(() => r())))
  it('normalizes host targets and bounds port ranges before network access', () => {
    expect(
      normalizePortTargets([
        'HOST.example.',
        'host.example',
        '192.168.1.2',
        '[2001:4860:4860:0:0:0:0:8888]',
      ]),
    ).toEqual(['host.example', '192.168.1.2', '2001:4860:4860::8888'])
    expect(parsePorts('22,80 443，8000-8002,80')).toEqual([22, 80, 443, 8000, 8001, 8002])
    expect(parsePorts('65535')).toEqual([65535])
    expect(portServiceHint(22)).toBe('SSH')
    expect(portServiceHint(54321)).toBe('未知')
    for (const input of [
      undefined,
      '',
      '0',
      '65536',
      '90-80',
      '-1',
      '22;80',
      '22,',
      '1-65535',
      '1-4096,5000',
      'a'.repeat(20001),
    ])
      expect(() => parsePorts(input)).toThrow()
    for (const input of [
      null,
      [],
      Array(21).fill('host'),
      [42],
      ['a'.repeat(254)],
      ['http://host'],
      ['user@host'],
      ['127.1'],
      ['0127.0.0.1'],
      ['host/path'],
      ['host:80'],
      ['host..test'],
      ['-host.test'],
      [''],
      ['a'.repeat(64) + '.com'],
    ])
      expect(() => normalizePortTargets(input)).toThrow()
  })
  it('probes real open and closed sockets without sending application data', async () => {
    expect(
      await probeTcpPort('127.0.0.1', open, {
        timeoutMs: 1000,
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ state: 'open' })
    expect(
      await probeTcpPort('127.0.0.1', closed, {
        timeoutMs: 1000,
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ state: 'closed' })
    expect(received).toBe(0)
    const results: PortResult[] = []
    const resolve = vi.fn(async () => [{ address: '127.0.0.1', family: 4 }])
    const job = makeJob([open, closed])
    await executePortScan(job, {
      signal: new AbortController().signal,
      allowInternal: true,
      network: { resolve, allowAddress: () => true },
      beforeProbe: async () => {},
      checkpoint: async (rows) => {
        results.push(...rows)
      },
    })
    expect(results.map((r) => r.state)).toEqual(['open', 'closed'])
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(results.every((r) => r.address === '127.0.0.1')).toBe(true)
    expect(totalScanChecks(job)).toBe(2)
    expect(completedScanChecks({ ...job, portResults: results })).toBe(2)
  })
  it('keeps timeout and unreachable results distinct from refused connections and closes on abort', async () => {
    for (const [event, code, state] of [
      ['timeout', null, 'filtered'],
      ['error', 'ETIMEDOUT', 'filtered'],
      ['error', 'EHOSTUNREACH', 'error'],
      ['close', null, 'error'],
    ] as const) {
      const stub = vi.spyOn(Socket.prototype, 'connect').mockImplementation(function (
        this: Socket,
      ) {
        queueMicrotask(() =>
          event === 'close'
            ? this.destroy()
            : this.emit(
                event,
                code ? Object.assign(new Error('private-error'), { code }) : undefined,
              ),
        )
        return this
      })
      expect(
        await probeTcpPort('127.0.0.1', 12345, {
          timeoutMs: 1000,
          signal: new AbortController().signal,
        }),
      ).toMatchObject({ state })
      stub.mockRestore()
    }
    const control = new AbortController()
    const stub = vi.spyOn(Socket.prototype, 'connect').mockImplementation(function (this: Socket) {
      queueMicrotask(() => control.abort())
      return this
    })
    await expect(
      probeTcpPort('127.0.0.1', 12345, { timeoutMs: 1000, signal: control.signal }),
    ).rejects.toThrow()
    stub.mockRestore()
    await expect(
      probeTcpPort('127.0.0.1', open, { timeoutMs: 1000, signal: control.signal }),
    ).rejects.toThrow()
  })
  it('blocks forbidden addresses before connecting and reports DNS errors', async () => {
    for (const network of [
      { resolve: async () => [{ address: '127.0.0.1', family: 4 }] },
      {
        resolve: async () => {
          throw new Error('dns-private-message')
        },
      },
    ]) {
      const probe = vi.fn(),
        results: PortResult[] = []
      await executePortScan(makeJob([22, 80]), {
        signal: new AbortController().signal,
        allowInternal: false,
        network,
        probe,
        beforeProbe: async () => {},
        checkpoint: async (rows) => {
          results.push(...rows)
        },
      })
      expect(probe).not.toHaveBeenCalled()
      expect(results).toHaveLength(2)
      expect(results.every((r) => r.state === 'error')).toBe(true)
      expect(JSON.stringify(results)).not.toContain('dns-private-message')
    }
    await expect(
      executePortScan({ ...makeJob([22]), portScan: undefined } as unknown as ScanJob, {
        signal: new AbortController().signal,
        allowInternal: false,
        beforeProbe: async () => {},
        checkpoint: async () => {},
      }),
    ).rejects.toThrow('缺少')
  })
  it('bounds concurrency, resumes completed ports and drains all probes on cancellation', async () => {
    const network = {
      resolve: async () => [{ address: '127.0.0.1', family: 4 }],
      allowAddress: () => true,
    }
    let active = 0,
      peak = 0
    const results: PortResult[] = []
    const job = makeJob([1, 2, 3, 4, 5], { portResults: [outcome(1, 'open')] })
    const probe = vi.fn(async (_address: string, port: number) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 3))
      active--
      if (port === 5) throw new Error('private')
      return { state: 'open' as const, detail: 'connected' }
    })
    await executePortScan(job, {
      signal: new AbortController().signal,
      allowInternal: true,
      network,
      probe,
      beforeProbe: async () => {},
      checkpoint: async (rows) => {
        results.push(...rows)
      },
    })
    expect(peak).toBe(2)
    expect(results.map((r) => r.port)).toEqual([2, 3, 4, 5])
    expect(results.at(-1)!.state).toBe('error')
    const empty = vi.fn()
    await executePortScan(makeJob([1], { portResults: [outcome(1, 'open')] }), {
      signal: new AbortController().signal,
      allowInternal: true,
      network,
      probe: empty,
      beforeProbe: async () => {},
      checkpoint: async () => {},
    })
    expect(empty).not.toHaveBeenCalled()
    const control = new AbortController()
    let pending = 0
    const work = executePortScan(makeJob([1, 2, 3]), {
      signal: control.signal,
      allowInternal: true,
      network,
      beforeProbe: async () => {},
      checkpoint: async () => {},
      probe: async (_a, _p, options) => {
        pending++
        return await new Promise((_resolve, reject) =>
          options.signal.addEventListener(
            'abort',
            () => {
              pending--
              reject(new Error('aborted'))
            },
            { once: true },
          ),
        )
      },
    })
    await vi.waitFor(() => expect(pending).toBe(2))
    control.abort()
    await expect(work).rejects.toThrow()
    expect(pending).toBe(0)
    const stop = new AbortController()
    await expect(
      executePortScan(makeJob([1, 2, 3]), {
        signal: stop.signal,
        allowInternal: true,
        network,
        probe: async () => ({ state: 'open', detail: '' }),
        beforeProbe: async () => {},
        checkpoint: async () => stop.abort(),
      }),
    ).rejects.toThrow()
  })
  it('compares only explicit closures and exports escaped port reports', () => {
    const before = makeJob([22, 80, 443], {
      portResults: [outcome(22, 'open'), outcome(80, 'open'), outcome(443, 'open')],
    })
    const after = {
      ...before,
      portResults: [
        outcome(22, 'open'),
        outcome(80, 'closed'),
        outcome(443, 'filtered'),
        outcome(8080, 'open'),
      ],
    }
    expect(compareScans(before, after)).toEqual({
      added: ['fixture.test:8080'],
      persistent: ['fixture.test:22'],
      resolved: ['fixture.test:80'],
      unverified: ['fixture.test:443'],
    })
    const report = scanReport({ ...after, name: '<script>bad</script>' })
    expect(report).toContain('22/tcp')
    expect(report).toContain('超时 / 未确定')
    expect(report).not.toContain('<script>')
    expect(report).toContain('开放端口不代表存在漏洞')
    expect(() => compareScans(before, { ...after, kind: 'web' })).toThrow()
  })
  it('persists port jobs with permissions, progress and resumable cancellation', async () => {
    const db = embeddedDatabase('memory://'),
      team = new TeamStore(db)
    await team.initialize()
    const admin = team.users[0]!.id,
      alice = (await team.createUser(admin, 'tcp-alice', '12345678', 'member')).id,
      bob = (await team.createUser(admin, 'tcp-bob', '12345678', 'member')).id
    let delayed = false
    const service = new NativeScans(team, undefined, {
      network: {
        resolve: async () => [{ address: '127.0.0.1', family: 4 }],
        allowAddress: () => true,
      },
      probe: async (address, port, options) =>
        delayed
          ? await new Promise((_r, reject) =>
              options.signal.addEventListener('abort', () => reject(new Error('stopped')), {
                once: true,
              }),
            )
          : await probeTcpPort(address, port, options),
    })
    try {
      await service.initialize()
      const create = async (extra: Record<string, unknown> = {}) =>
        (
          (await service.api(alice, 'scan-create', {
            name: 'TCP fixture',
            kind: 'ports',
            targets: ['fixture.test'],
            ports: `${open},${closed}`,
            delayMs: 250,
            timeoutMs: 1000,
            ...extra,
          })) as { job: ScanJob }
        ).job
      const get = async (id: string) =>
        ((await service.api(alice, 'scan-get', { id })) as { job: ScanJob }).job
      const job = await create()
      await service.idle()
      const result = await get(job.id)
      expect(result.state).toBe('completed')
      expect(result.findings).toHaveLength(0)
      expect(result.portResults!.find((r) => r.port === open)!.state).toBe('open')
      const list = ((await service.api(alice, 'scan-list', {})) as { jobs: ScanSummary[] }).jobs[0]!
      expect(list).toMatchObject({
        kind: 'ports',
        openPorts: 1,
        completedChecks: 2,
        totalChecks: 2,
      })
      await expect(service.api(bob, 'scan-get', { id: job.id })).rejects.toMatchObject({
        status: 403,
      })
      expect(
        ((await service.api(admin, 'scan-get', { id: job.id })) as { job: ScanJob }).job.id,
      ).toBe(job.id)
      for (const extra of [
        { ports: '' },
        { ports: '1-4096', targets: ['one.test', 'two.test'] },
        { timeoutMs: 6000 },
        { kind: 'web', targets: ['https://fixture.test'], ports: '80' },
        { concurrency: 17 },
        { targets: ['http://fixture.test'] },
      ])
        await expect(create(extra)).rejects.toMatchObject({ status: 400 })
      delayed = true
      const paused = await create()
      await vi.waitFor(async () => expect((await get(paused.id)).state).toBe('running'))
      await service.api(alice, 'scan-control', { id: paused.id, command: 'pause' })
      await service.idle()
      expect((await get(paused.id)).state).toBe('paused')
      expect((await get(paused.id)).portResults).toHaveLength(0)
      delayed = false
      await service.api(alice, 'scan-control', { id: paused.id, command: 'resume' })
      await service.idle()
      expect((await get(paused.id)).portResults).toHaveLength(2)
      await team.setUserPermission(admin, alice, { permission: 'scan.run', resource: '*' }, 'deny')
      await expect(create()).rejects.toMatchObject({ status: 403 })
    } finally {
      await service.close()
      await db.close()
    }
  }, 20000)
})
