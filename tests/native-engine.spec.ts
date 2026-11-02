import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createServer as createHttps } from 'node:https'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addressAllowed,
  checkProbe,
  createHttpProbe,
  executeScan,
  findingFor,
  matchProbe,
  normalizeScanTargets,
  ruleDigest,
  type Probe,
} from '../src/lib/native-engine.js'
import { BUILTIN_SCAN_RULES, scanRuleSchema } from '../src/lib/native-rules.js'
import { scanReport } from '../src/lib/native-report.js'
import type { ScanCheck, ScanJob, ScanMatch } from '../src/lib/native-scan-types.js'

const base: Probe = {
  status: 200,
  headers: { 'content-type': 'text/html', 'set-cookie': ['session=never-persist-this; Path=/'] },
  body: '<h1>Index of /</h1>',
  truncated: false,
}
export const testScanJob = (overrides: Partial<ScanJob> = {}): ScanJob => ({
  id: 'job-1',
  ownerId: 'alice',
  projectId: null,
  name: '本地扫描',
  targets: ['https://scan.example/app/'],
  policy: {
    id: 'standard',
    timeoutMs: 1000,
    delayMs: 0,
    ruleIds: BUILTIN_SCAN_RULES.map((r) => r.id),
  },
  rules: BUILTIN_SCAN_RULES,
  ruleHash: ruleDigest(BUILTIN_SCAN_RULES),
  state: 'running',
  checks: [],
  findings: [],
  createdAt: '2026-10-27T00:00:00Z',
  updatedAt: '2026-10-27T00:00:00Z',
  message: '',
  ...overrides,
})
describe('native rule format and deterministic checks', () => {
  it('validates original rules and rejects executable/escaping definitions', () => {
    for (const rule of BUILTIN_SCAN_RULES)
      expect(scanRuleSchema.safeParse(rule).success, rule.id).toBe(true)
    const seed = BUILTIN_SCAN_RULES[0]!
    for (const bad of [
      { path: '../secret' },
      { path: 'https://evil.example/' },
      { path: '%2e%2e/' },
      { path: './' },
      { code: 'anything' },
      { match: { field: 'header', op: 'absent' } },
      { match: { field: 'status', op: 'equals' } },
      { match: { field: 'body', op: 'contains', value: 1 } },
      { match: { field: 'status', op: 'lt', value: 'abc' } },
      { match: { all: [] } },
      { match: { field: 'body', op: 'regex', value: '(a+)+' } },
    ])
      expect(scanRuleSchema.safeParse({ ...seed, ...bad }).success).toBe(false)
    let match: ScanMatch = { field: 'status', op: 'equals', value: 200 }
    for (let i = 0; i < 8; i++) match = { all: [match] }
    expect(scanRuleSchema.safeParse({ ...seed, match }).success).toBe(false)
  })
  it('uses boolean, status, header, cookie and TLS matchers without exposing values', () => {
    const check = (match: ScanMatch, probe = base) => matchProbe(match, probe)
    expect(
      check({
        all: [
          { field: 'status', op: 'equals', value: 200 },
          {
            any: [
              { field: 'header', key: 'foo', op: 'contains', value: 'x' },
              { field: 'body', op: 'contains', value: 'Index of' },
            ],
          },
        ],
      }),
    ).toBe(true)
    expect(
      check(
        { field: 'header', key: 'x-joined', op: 'contains', value: 'a, b' },
        { ...base, headers: { 'x-joined': ['a', 'b'] } },
      ),
    ).toBe(true)
    for (const value of [
      undefined,
      '',
      [],
      ['test=value; HttpOnly; Secure; SameSite=Lax'],
      'test=value; HttpOnly',
    ]) {
      const probe = { ...base, headers: { 'set-cookie': value } }
      expect(check({ field: 'cookie', key: 'httponly', op: 'absent' }, probe)).toBe(false)
    }
    expect(check({ field: 'cookie', key: 'secure', op: 'equals', value: false })).toBe(false)
    expect(check({ field: 'cookie', key: 'secure', op: 'absent' })).toBe(true)
    expect(check({ field: 'tls.days', op: 'lt', value: 30 })).toBe(false)
    const tls = { ...base, tls: { valid: false, days: -2, keyBits: 1024 } }
    for (const rule of BUILTIN_SCAN_RULES.filter((r) => r.id.startsWith('prism-tls-')))
      expect(matchProbe(rule.match, tls)).toBe(true)
    const good = { ...base, tls: { valid: true, days: 365, keyBits: 2048 } }
    for (const rule of BUILTIN_SCAN_RULES.filter((r) => r.id.startsWith('prism-tls-')))
      expect(matchProbe(rule.match, good)).toBe(false)
  })
  it('distinguishes positive matches, incomplete responses, redirects and failures', () => {
    const git = BUILTIN_SCAN_RULES.find((r) => r.id === 'prism-git-head')!
    expect(
      checkProbe('https://scan.example/', git, { ...base, body: 'ref: refs/heads/main' }).state,
    ).toBe('hit')
    expect(checkProbe('https://scan.example/', git, base).state).toBe('pass')
    expect(checkProbe('https://scan.example/', git, { ...base, truncated: true }).state).toBe(
      'skipped',
    )
    expect(
      checkProbe('https://scan.example/', git, { ...base, headers: { 'content-encoding': 'gzip' } })
        .state,
    ).toBe('skipped')
    expect(checkProbe('https://scan.example/', git, { ...base, status: 302 }).state).toBe('skipped')
    for (const status of [500, 503, 429])
      expect(checkProbe('https://scan.example/', git, { ...base, status }).state).toBe('error')
    const cookie = BUILTIN_SCAN_RULES.find((r) => r.id === 'prism-cookie-httponly')!
    const finding = findingFor(checkProbe('https://scan.example/', cookie, base), cookie)
    expect(JSON.stringify(finding)).not.toContain('never-persist-this')
    expect(findingFor(checkProbe('https://scan.example/', cookie, base), cookie).id).toBe(
      finding.id,
    )
  })
  it('accepts only bounded anonymous URL targets and normalizes duplicates', () => {
    expect(normalizeScanTargets(['https://EXAMPLE.com:443/', 'https://example.com/'])).toEqual([
      'https://example.com/',
    ])
    for (const value of [
      null,
      [],
      Array(21).fill('https://a.test'),
      [42],
      ['x'.repeat(501)],
      ['invalid'],
      ['file:///etc/passwd'],
      ['https://u:p@host.test'],
      ['https://host.test/?token=secret'],
      ['https://host.test/#frag'],
      ['https://host.test/%20'],
      ['https://host.test/a//b'],
    ])
      expect(() => normalizeScanTargets(value)).toThrow()
  })
  it('blocks reserved, local, mapped and mixed-private address destinations', () => {
    for (const address of [
      '127.0.0.1',
      '169.254.169.254',
      '0.0.0.0',
      '224.1.1.1',
      '198.18.0.1',
      '192.0.2.1',
      '::1',
      '::',
      '::ffff:127.0.0.1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      '2002:7f00:1::',
      'host',
      'fe80::1%eth0',
    ])
      expect(addressAllowed(address, true), address).toBe(false)
    for (const address of [
      '10.1.1.1',
      '172.20.1.1',
      '192.168.1.1',
      '100.64.1.1',
      'fd00::1',
      '::ffff:192.168.1.1',
    ]) {
      expect(addressAllowed(address, false)).toBe(false)
      expect(addressAllowed(address, true), address).toBe(true)
    }
    for (const address of ['8.8.8.8', '2606:4700:4700::1111'])
      expect(addressAllowed(address, false)).toBe(true)
  })
  it('checks real probe results, checkpoints, skips completed work and bounds path scope', async () => {
    const checks: ScanCheck[] = [],
      urls: string[] = []
    const job = testScanJob({ targets: ['http://scan.example/app/'] })
    job.checks = [
      { target: job.targets[0]!, ruleId: 'prism-mime-sniffing', state: 'pass', detail: '', at: '' },
    ]
    await executeScan(job, {
      signal: new AbortController().signal,
      allowInternal: false,
      beforeProbe: async () => {},
      checkpoint: async (rows) => {
        checks.push(...rows)
      },
      probe: async (url) => {
        urls.push(url.href)
        return base
      },
    })
    expect(urls).toContain('http://scan.example/app/.git/HEAD')
    expect(urls.every((u) => u.startsWith('http://scan.example/app/'))).toBe(true)
    expect(urls.filter((u) => u === 'http://scan.example/app/')).toHaveLength(1)
    expect(checks.some((c) => c.ruleId === 'prism-mime-sniffing')).toBe(false)
    expect(checks.filter((c) => c.detail.includes('不适用')).length).toBeGreaterThan(0)
  })
  it('does not turn blocked, failed or cancelled scans into clean results', async () => {
    for (const error of [new Error('target-blocked'), new Error('DNS failure')]) {
      const checks: ScanCheck[] = []
      await executeScan(testScanJob({ rules: [BUILTIN_SCAN_RULES[0]!] }), {
        signal: new AbortController().signal,
        allowInternal: false,
        beforeProbe: async () => {},
        checkpoint: async (rows) => {
          checks.push(...rows)
        },
        probe: async () => {
          throw error
        },
      })
      expect(checks[0]!.state).toBe('error')
    }
    const control = new AbortController()
    await expect(
      executeScan(testScanJob(), {
        signal: control.signal,
        allowInternal: false,
        beforeProbe: async () => control.abort(),
        checkpoint: async () => {},
        probe: vi.fn(),
      }),
    ).rejects.toThrow()
    const stop = new AbortController()
    await expect(
      executeScan(testScanJob(), {
        signal: stop.signal,
        allowInternal: false,
        beforeProbe: async () => {},
        checkpoint: async () => stop.abort(),
        probe: async () => base,
      }),
    ).rejects.toThrow()
  })
  it('exports escaped reports with evidence, coverage and no response secrets', () => {
    const rule = BUILTIN_SCAN_RULES[0]!,
      check = checkProbe('https://scan.example/', rule, base)
    const report = scanReport(
      testScanJob({
        name: '<script>alert(1)</script>',
        checks: [check],
        findings: [{ ...findingFor(check, rule), note: '<img src=x>' }],
      }),
    )
    expect(report).toContain('&lt;script&gt;')
    expect(report).not.toContain('<script>')
    expect(report).not.toContain('never-persist-this')
    expect(report).toContain('未命中不等于不存在漏洞')
  })
})

describe('native network transport on local fixtures only', () => {
  let server: Server, origin: string
  const visited: string[] = []
  beforeAll(async () => {
    server = createServer((req, res) => {
      visited.push(req.url!)
      if (req.url === '/wait') return
      if (req.url === '/reset') {
        req.socket.destroy()
        return
      }
      if (req.url === '/redirect') {
        res.writeHead(302, { location: 'http://169.254.169.254/' })
        res.end()
        return
      }
      res.setHeader('content-type', 'text/html')
      res.setHeader('set-cookie', 'session=never-persist-this; Path=/')
      res.end(req.url === '/large' ? 'a'.repeat(100_000) : 'ref: refs/heads/main')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const options = () => ({
    signal: new AbortController().signal,
    timeoutMs: 1000,
    allowInternal: true,
  })
  it('makes bounded real HTTP requests without following redirects', async () => {
    const probe = createHttpProbe({ allowAddress: () => true })
    expect((await probe(new URL(origin), options())).body).toBe('ref: refs/heads/main')
    const large = await probe(new URL(origin + '/large'), options())
    expect(large.truncated).toBe(true)
    expect(large.body.length).toBe(65536)
    expect((await probe(new URL(origin + '/redirect'), options())).status).toBe(302)
    expect(visited).not.toContain('http://169.254.169.254/')
    await expect(probe(new URL(origin + '/reset'), options())).rejects.toThrow()
    await expect(
      probe(new URL(origin + '/wait'), { ...options(), timeoutMs: 30 }),
    ).rejects.toThrow()
  })
  it('pins one DNS answer and rejects every request if any address is disallowed', async () => {
    const resolver = vi.fn(async () => [{ address: '127.0.0.1', family: 4 }])
    const url = new URL(origin.replace('127.0.0.1', 'fixture.test'))
    expect(
      (await createHttpProbe({ resolve: resolver, allowAddress: () => true })(url, options()))
        .status,
    ).toBe(200)
    expect(resolver).toHaveBeenCalledTimes(1)
    for (const addresses of [
      [],
      [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    ])
      await expect(
        createHttpProbe({ resolve: async () => addresses })(url, options()),
      ).rejects.toThrow('target-blocked')
    await expect(createHttpProbe()(new URL(origin), options())).rejects.toThrow('target-blocked')
    const control = new AbortController()
    control.abort()
    await expect(createHttpProbe()(url, { ...options(), signal: control.signal })).rejects.toThrow()
    await expect(
      createHttpProbe({ resolve: async () => await new Promise(() => {}) })(url, {
        ...options(),
        timeoutMs: 20,
      }),
    ).rejects.toThrow()
  })
  it('inspects a real self-signed TLS certificate without sending credentials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'prism-scan-tls-'))
    let tlsServer: ReturnType<typeof createHttps> | undefined
    try {
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '2',
          '-keyout',
          join(root, 'key.pem'),
          '-out',
          join(root, 'cert.pem'),
          '-subj',
          '/CN=localhost',
        ],
        { stdio: 'ignore' },
      )
      tlsServer = createHttps(
        {
          key: await readFile(join(root, 'key.pem')),
          cert: await readFile(join(root, 'cert.pem')),
        },
        (req, res) => {
          expect(req.headers.authorization).toBeUndefined()
          expect(req.headers.cookie).toBeUndefined()
          res.end('fixture')
        },
      )
      await new Promise<void>((resolve) => tlsServer!.listen(0, '127.0.0.1', resolve))
      const response = await createHttpProbe({ allowAddress: () => true })(
        new URL(`https://127.0.0.1:${(tlsServer.address() as { port: number }).port}`),
        options(),
      )
      expect(response.tls?.valid).toBe(false)
      expect(response.tls?.keyBits).toBe(2048)
      expect(response.tls!.days).toBeLessThan(3)
    } finally {
      if (tlsServer) await new Promise<void>((resolve) => tlsServer!.close(() => resolve()))
      await rm(root, { recursive: true, force: true })
    }
  })
})
