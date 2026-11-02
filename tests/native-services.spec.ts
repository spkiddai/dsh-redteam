import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server, type Socket } from 'node:net'
import { createServer as createTls } from 'node:tls'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  identifyService,
  probeService,
  executeServiceScan,
  serviceChecks,
  SERVICE_RULES,
} from '../src/lib/native-services.js'
import { NativeScans, compareScans } from '../src/lib/native-scans.js'
import { TeamStore } from '../src/lib/team-database.js'
import { embeddedDatabase } from '../src/lib/embedded-database.js'
import {
  completedScanChecks,
  totalScanChecks,
  type ScanJob,
  type ScanSummary,
  type ServiceResult,
} from '../src/lib/native-scan-types.js'
import { scanReport } from '../src/lib/native-report.js'

const servers: Server[] = []
const sockets = new Set<Socket>()
async function listen(server: Server) {
  servers.push(server)
  server.on('connection', (socket: Socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as { port: number }).port
}
afterEach(async () => {
  for (const socket of sockets) socket.destroy()
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  )
  vi.restoreAllMocks()
})
const options = (extra = {}) => ({
  host: 'fixture.test',
  mode: 'banner' as const,
  timeoutMs: 1000,
  signal: new AbortController().signal,
  ...extra,
})
const network = {
  resolve: async () => [{ address: '127.0.0.1', family: 4 }],
  allowAddress: () => true,
}
const job = (ports = [22], extra: Partial<ScanJob> = {}): ScanJob => ({
  id: 'services',
  kind: 'services',
  name: '服务测试',
  ownerId: 'alice',
  projectId: null,
  serviceScan: { ports, mode: 'banner' },
  serviceRules: SERVICE_RULES,
  serviceResults: [],
  targets: ['fixture.test'],
  rules: [],
  ruleHash: 'services-v1',
  state: 'running',
  policy: { id: 'standard', timeoutMs: 1000, delayMs: 0, ruleIds: [] },
  checks: [],
  findings: [],
  createdAt: '',
  updatedAt: '',
  message: '',
  ...extra,
})
const bulk = (body: string) => Buffer.from(`$${Buffer.byteLength(body)}\r\n${body}\r\n`)
const redisBody = '# Server\r\nredis_version:7.2.4\r\nrun_id:private-value-never-store\r\n'

describe('native service fingerprints and protocol findings', () => {
  it('parses complete bounded responses without storing arbitrary banners or secrets', () => {
    const ssh = identifyService(
      Buffer.from('notice secret\r\nSSH-2.0-OpenSSH_9.8p1 secret=value\r\n'),
      'banner',
    )!
    expect(ssh).toMatchObject({
      protocol: 'SSH',
      product: 'OpenSSH',
      version: '9.8p1',
      sshLegacy: false,
    })
    expect(JSON.stringify(ssh)).not.toContain('secret')
    expect(identifyService(Buffer.from('SSH-1.99-private-secret\r\n'), 'banner')).toMatchObject({
      sshLegacy: true,
      product: '',
      version: '',
    })
    for (const [banner, protocol] of [
      ['220 SMTP fixture\r\n', 'SMTP'],
      ['220 FTP fixture\r\n', 'FTP'],
    ])
      expect(identifyService(Buffer.from(banner!), 'banner')?.protocol).toBe(protocol)
    for (const version of ['8.0.36', '10.5.2-MariaDB']) {
      const body = Buffer.concat([Buffer.from([10]), Buffer.from(version + '\0'), Buffer.alloc(20)])
      const header = Buffer.alloc(4)
      header.writeUIntLE(body.length, 0, 3)
      const mysql = identifyService(Buffer.concat([header, body]), 'banner')!
      expect(mysql.protocol).toBe('MySQL')
      expect(mysql.product).toBe(version.includes('Maria') ? 'MariaDB' : 'MySQL')
    }
    const redis = identifyService(bulk(redisBody), 'redis')!
    expect(redis).toMatchObject({ protocol: 'Redis', version: '7.2.4', redisInfo: true })
    expect(JSON.stringify(redis)).not.toContain('private-value')
    expect(
      identifyService(bulk('# Server\r\nredis_version:' + '1'.repeat(60) + '.0\r\n'), 'redis')
        ?.version,
    ).toBe('')
    expect(
      identifyService(Buffer.from('-NOAUTH Authentication required.\r\n'), 'redis'),
    ).toMatchObject({ redisInfo: false })
    expect(
      identifyService(
        Buffer.from('HTTP/1.1 200 OK\r\nServer: nginx/1.26.2\r\nSet-Cookie: secret\r\n\r\n'),
        'http',
      ),
    ).toMatchObject({ protocol: 'HTTP', product: 'nginx', version: '1.26.2' })
    expect(
      identifyService(
        Buffer.from('HTTP/1.1 302 Found\r\nServer: arbitrary-secret\r\n\r\n'),
        'http',
      ),
    ).toMatchObject({ product: '', version: '' })
    for (const [data, mode] of [
      ['SSH-2.0-OpenSSH_9.8', 'banner'],
      ['$100\r\npartial', 'redis'],
      ['$0\r\n\r\n', 'redis'],
      ['+PONG\r\n', 'redis'],
      ['HTTP/1.1 200 OK\r\n', 'http'],
      ['random', 'banner'],
    ] as const)
      expect(identifyService(Buffer.from(data), mode)).toBeUndefined()
  })
  it('uses real sockets for anonymous Redis INFO and HTTP HEAD, and never sends login or write commands', async () => {
    let received = ''
    const redis = await listen(
      createServer((s) =>
        s.once('data', (b) => {
          received = b.toString()
          const response = bulk(redisBody)
          s.write(response.subarray(0, 8))
          setTimeout(() => s.end(response.subarray(8)), 10)
        }),
      ),
    )
    expect(await probeService('127.0.0.1', redis, options({ mode: 'redis' }))).toMatchObject({
      redisInfo: true,
    })
    expect(received).toBe('*2\r\n$4\r\nINFO\r\n$6\r\nserver\r\n')
    const http = await listen(
      createServer((s) =>
        s.once('data', (b) => {
          received = b.toString()
          s.end(
            'HTTP/1.1 302 Found\r\nServer: Apache/2.4.62\r\nLocation: http://other.test/\r\n\r\n',
          )
        }),
      ),
    )
    expect(
      await probeService('127.0.0.1', http, options({ mode: 'http', host: '::1' })),
    ).toMatchObject({ protocol: 'HTTP', product: 'Apache', version: '2.4.62' })
    expect(received).toContain('HEAD / HTTP/1.1\r\nHost: [::1]:')
    expect(received).not.toMatch(/Authorization|Cookie/)
  })
  it('inspects a real TLS certificate without credentials and separates certificate risks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'prism-service-tls-'))
    try {
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          join(directory, 'key.pem'),
          '-out',
          join(directory, 'cert.pem'),
          '-days',
          '1',
          '-subj',
          '/CN=fixture.test',
        ],
        { stdio: 'ignore' },
      )
      const port = await listen(
        createTls({
          key: await readFile(join(directory, 'key.pem')),
          cert: await readFile(join(directory, 'cert.pem')),
        }),
      )
      const result = await probeService('127.0.0.1', port, options({ mode: 'tls' }))
      expect(result).toMatchObject({
        protocol: 'TLS',
        tlsInvalid: true,
        tlsExpired: false,
        tlsWeakRsa: false,
      })
      expect(
        serviceChecks('tcp://fixture.test:443', result, SERVICE_RULES).map((c) => c.state),
      ).toEqual(['hit', 'pass', 'pass'])
      const expired = serviceChecks(
        'tcp://x:443',
        { ...result, tlsExpired: true, tlsWeakRsa: true },
        SERVICE_RULES,
      )
      expect(expired.every((c) => c.state === 'hit')).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('keeps unknown, refused, truncated, timed out and cancelled scans distinct', async () => {
    const silent = await listen(createServer())
    expect(
      await probeService('127.0.0.1', silent, options({ timeoutMs: 30, mode: 'auto' })),
    ).toMatchObject({ state: 'unknown' })
    const ended = await listen(createServer((s) => s.end('unrecognized')))
    expect(await probeService('127.0.0.1', ended, options())).toMatchObject({ state: 'unknown' })
    const flood = await listen(createServer((s) => s.end('x'.repeat(10000))))
    expect(await probeService('127.0.0.1', flood, options())).toMatchObject({
      state: 'unknown',
      detail: expect.stringContaining('8 KiB'),
    })
    const unused = createServer()
    const closed = await listen(unused)
    await new Promise<void>((r) => unused.close(() => r()))
    expect(await probeService('127.0.0.1', closed, options())).toMatchObject({ state: 'closed' })
    const abort = new AbortController()
    const work = probeService('127.0.0.1', silent, options({ signal: abort.signal }))
    abort.abort()
    await expect(work).rejects.toThrow()
    await expect(
      probeService('127.0.0.1', silent, options({ signal: abort.signal })),
    ).rejects.toThrow()
  })
  it('pins validated DNS, resumes checkpoints and does not probe blocked addresses', async () => {
    const port = await listen(createServer((s) => s.write('SSH-1.5-OpenSSH_3.0\r\n')))
    const current = job([port]),
      beforeProbe = vi.fn(async () => {})
    const execute = (j = current, dependencies = network) =>
      executeServiceScan(j, {
        signal: new AbortController().signal,
        allowInternal: true,
        network: dependencies,
        beforeProbe,
        checkpoint: async (r, checks) => {
          current.serviceResults!.push(r)
          current.checks.push(...checks)
        },
      })
    await execute()
    expect(current.serviceResults![0]).toMatchObject({
      protocol: 'SSH',
      product: 'OpenSSH',
      version: '3.0',
    })
    expect(current.checks[0]?.state).toBe('hit')
    expect(completedScanChecks(current)).toBe(1)
    expect(totalScanChecks(current)).toBe(1)
    const calls = beforeProbe.mock.calls.length
    await execute()
    expect(beforeProbe).toHaveBeenCalledTimes(calls)
    await execute(job([port + 1]), { ...network, allowAddress: () => false })
    expect(current.serviceResults!.at(-1)?.state).toBe('error')
    expect(current.checks).toHaveLength(1)
    await expect(
      execute({ ...current, serviceScan: undefined } as unknown as ScanJob),
    ).rejects.toThrow('缺少')
    const control = new AbortController()
    const rows: ServiceResult[] = []
    await expect(
      executeServiceScan(job([port, port + 1]), {
        signal: control.signal,
        allowInternal: true,
        network,
        beforeProbe: async () => {},
        checkpoint: async (row) => {
          rows.push(row)
          control.abort()
        },
      }),
    ).rejects.toThrow()
    expect(rows).toHaveLength(1)
  })
  it('persists independent service jobs with rules, findings, isolation, resume and honest comparisons', async () => {
    let legacy = true,
      holding = false
    const port = await listen(
      createServer((s) => {
        if (!holding) s.write(`SSH-${legacy ? '1.99' : '2.0'}-OpenSSH_8.0\r\n`)
      }),
    )
    const db = embeddedDatabase('memory://'),
      team = new TeamStore(db)
    await team.initialize()
    const admin = team.users[0]!.id,
      alice = (await team.createUser(admin, 'svc-alice', '12345678', 'member')).id,
      bob = (await team.createUser(admin, 'svc-bob', '12345678', 'member')).id
    const scans = new NativeScans(team, undefined, undefined, { network })
    try {
      await scans.initialize()
      const create = async (extra = {}) =>
        (
          (await scans.api(alice, 'scan-create', {
            name: '指纹测试',
            kind: 'services',
            targets: ['fixture.test'],
            ports: String(port),
            serviceMode: 'banner',
            timeoutMs: 1000,
            delayMs: 250,
            ...extra,
          })) as { job: ScanJob }
        ).job
      const get = async (id: string) =>
        ((await scans.api(alice, 'scan-get', { id })) as { job: ScanJob }).job
      const first = await create()
      await scans.idle()
      const result = await get(first.id)
      expect(result.state).toBe('completed')
      expect(result.findings).toHaveLength(1)
      expect(result.serviceRules).toHaveLength(5)
      expect(result.rules).toEqual([])
      const list = ((await scans.api(alice, 'scan-list', {})) as { jobs: ScanSummary[] }).jobs[0]
      expect(list).toMatchObject({
        kind: 'services',
        totalChecks: 1,
        completedChecks: 1,
        findingsCount: 1,
      })
      await expect(scans.api(bob, 'scan-get', { id: first.id })).rejects.toMatchObject({
        status: 403,
      })
      expect(
        ((await scans.api(admin, 'scan-get', { id: first.id })) as { job: ScanJob }).job.id,
      ).toBe(first.id)
      const report = scanReport({ ...result, name: '<script>test</script>' })
      expect(report).toContain('端口服务指纹')
      expect(report).toContain('OpenSSH')
      expect(report).not.toContain('<script>')
      legacy = false
      const second = await create()
      await scans.idle()
      const after = await get(second.id)
      expect(compareScans(result, after).resolved).toHaveLength(1)
      expect(compareScans(result, { ...after, checks: [] }).unverified).toHaveLength(1)
      holding = true
      const third = await create()
      await vi.waitFor(async () => expect((await get(third.id)).state).toBe('running'))
      await scans.api(alice, 'scan-control', { id: third.id, command: 'pause' })
      await scans.idle()
      expect((await get(third.id)).state).toBe('paused')
      holding = false
      await scans.api(alice, 'scan-control', { id: third.id, command: 'resume' })
      await scans.idle()
      expect((await get(third.id)).serviceResults).toHaveLength(1)
      for (const extra of [
        { ports: '1-129' },
        { serviceMode: 'invalid' },
        { profile: 'custom', ruleIds: ['prism-mime-sniffing'] },
        { kind: 'ports' },
        { kind: 'web', targets: ['https://x.test/'] },
      ])
        await expect(create(extra)).rejects.toMatchObject({ status: 400 })
      await team.setUserPermission(admin, alice, { permission: 'scan.run', resource: '*' }, 'deny')
      await expect(create()).rejects.toMatchObject({ status: 403 })
    } finally {
      await scans.close()
      await db.close()
    }
  }, 20000)
})
