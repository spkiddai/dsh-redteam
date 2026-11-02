import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { TeamError, type TeamStore } from './team-database.js'
import { BUILTIN_SCAN_RULES, scanRuleSchema } from './native-rules.js'
import { redactEvidence } from './redact.js'
import {
  executeScan,
  findingFor,
  normalizeScanTargets,
  ruleDigest,
  scanCheckKey,
  type ScanProbe,
} from './native-engine.js'
import type { ScanComparison, ScanJob, ScanRule } from './native-scan-types.js'
import {
  completedScanChecks,
  totalScanChecks,
  MAX_PORT_CHECKS,
  MAX_SERVICE_CHECKS,
  portResultKey,
} from './native-scan-types.js'
import { executePortScan, normalizePortTargets, parsePorts, type TcpProbe } from './native-ports.js'
import type { ScanNetworkDependencies } from './native-network.js'
import { executeServiceScan, SERVICE_RULES, type ServiceProbe } from './native-services.js'

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(['web', 'ports', 'services']).default('web'),
    serviceMode: z.enum(['auto', 'banner', 'redis', 'http', 'tls']).optional(),
    ports: z.string().max(20000).optional(),
    concurrency: z.number().int().min(1).max(16).default(16),
    targets: z.array(z.string()).min(1).max(20),
    projectId: z.string().min(1).max(100).nullable().optional(),
    profile: z.enum(['quick', 'standard', 'custom']).default('standard'),
    ruleIds: z.array(z.string()).min(1).max(100).optional(),
    timeoutMs: z.number().int().min(1000).max(15000).default(5000),
    delayMs: z.number().int().min(250).max(5000).default(500),
  })
  .strict()
const ACTIVE = ['queued', 'running']
export function compareScans(before: ScanJob, after: ScanJob): ScanComparison {
  if (
    (!before.projectId && before.ownerId !== after.ownerId) ||
    (before.kind ?? 'web') !== (after.kind ?? 'web') ||
    before.projectId !== after.projectId ||
    before.ruleHash !== after.ruleHash ||
    JSON.stringify([...before.targets].sort()) !== JSON.stringify([...after.targets].sort())
  )
    throw new TeamError(400, '只能比较相同归属、目标和规则版本的扫描。')
  if (before.kind === 'ports') {
    const old = new Set(
      (before.portResults ?? []).filter((r) => r.state === 'open').map(portResultKey),
    )
    const current = new Set(
      (after.portResults ?? []).filter((r) => r.state === 'open').map(portResultKey),
    )
    const closed = new Set(
      (after.portResults ?? []).filter((r) => r.state === 'closed').map(portResultKey),
    )
    return {
      added: [...current].filter((k) => !old.has(k)),
      persistent: [...current].filter((k) => old.has(k)),
      resolved: [...old].filter((k) => closed.has(k)),
      unverified: [...old].filter((k) => !current.has(k) && !closed.has(k)),
    }
  }
  const old = new Set(before.findings.map((row) => row.id)),
    current = new Set(after.findings.map((row) => row.id))
  const passes = new Set(after.checks.filter((c) => c.state === 'pass').map(scanCheckKey))
  return {
    added: [...current].filter((id) => !old.has(id)),
    persistent: [...current].filter((id) => old.has(id)),
    resolved: before.findings
      .filter((f) => !current.has(f.id) && passes.has(scanCheckKey(f)))
      .map((f) => f.id),
    unverified: before.findings
      .filter((f) => !current.has(f.id) && !passes.has(scanCheckKey(f)))
      .map((f) => f.id),
  }
}

/** Deterministic scan jobs, not Agent sessions. The model never reaches this HTTP control plane. */
export class NativeScans {
  private serial: Promise<unknown> = Promise.resolve()
  private worker: Promise<void> | undefined
  private active: { id: string; abort: AbortController } | undefined
  private closed = false
  private requested = 0
  constructor(
    private readonly team: TeamStore,
    private readonly probe?: ScanProbe,
    private readonly tcpDependencies?: { probe?: TcpProbe; network?: ScanNetworkDependencies },
    private readonly serviceDependencies?: {
      probe?: ServiceProbe
      network?: ScanNetworkDependencies
    },
  ) {}
  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const value = this.serial.catch(() => undefined).then(fn)
    this.serial = value
    return value
  }
  async initialize() {
    await this.team.db.query(`CREATE TABLE IF NOT EXISTS prism_scan_jobs (
      id text PRIMARY KEY, owner_id text NOT NULL REFERENCES prism_users(id),
      project_id text REFERENCES prism_projects(id), state text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL);
      CREATE INDEX IF NOT EXISTS prism_scan_owner ON prism_scan_jobs(owner_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS prism_scan_rules (id text PRIMARY KEY, data jsonb NOT NULL);`)
    // Restart is never an implicit authorization to continue sending traffic.
    await this.team.db.query(
      `UPDATE prism_scan_jobs SET state='interrupted', data=jsonb_set(jsonb_set(data,'{state}','"interrupted"'),'{message}','"服务重启，扫描已中断；可手动继续。"') WHERE state IN ('running','queued')`,
    )
  }
  async close() {
    this.closed = true
    this.active?.abort.abort()
    await this.worker
  }
  async idle() {
    while (this.worker) await this.worker
  }
  private async rules(): Promise<ScanRule[]> {
    const custom = await this.team.db.query<{ data: ScanRule }>(
      'SELECT data FROM prism_scan_rules ORDER BY id',
    )
    return [...BUILTIN_SCAN_RULES, ...custom.rows.map((row) => row.data)]
  }
  private async load(id: string): Promise<ScanJob> {
    const row = (
      await this.team.db.query<{ data: ScanJob }>('SELECT data FROM prism_scan_jobs WHERE id=$1', [
        id,
      ])
    ).rows[0]
    if (!row) throw new TeamError(404, '扫描任务不存在。')
    return row.data
  }
  private async save(job: ScanJob) {
    job.updatedAt = new Date().toISOString()
    await this.team.db.query('UPDATE prism_scan_jobs SET state=$2,data=$3::jsonb WHERE id=$1', [
      job.id,
      job.state,
      JSON.stringify(job),
    ])
  }
  private allowed(user: string, job: ScanJob, write: boolean) {
    if (!this.team.user(user)) return false
    if (job.projectId)
      return (
        this.team.allows(user, job.projectId, write ? 'write' : 'read') &&
        (!write || this.team.can(user, 'scan.run'))
      )
    return (
      this.team.user(user)?.role === 'admin' ||
      (job.ownerId === user &&
        this.team.can(user, 'task.use') &&
        (!write || this.team.can(user, 'scan.run')))
    )
  }
  private assertAccess(user: string, job: ScanJob, write: boolean) {
    if (!this.allowed(user, job, write)) throw new TeamError(403, '没有此扫描任务的访问权限。')
  }
  private async audit(user: string, action: string, subject: string) {
    await this.team.db.query(
      'INSERT INTO prism_audit(actor_id,action,subject_id) VALUES($1,$2,$3)',
      [user, action, subject],
    )
  }
  private async assertQueueCapacity(user: string) {
    const counts = await this.team.db.query<{ total: number; own: number }>(
      "SELECT count(*)::integer AS total, count(*) FILTER (WHERE owner_id=$1)::integer AS own FROM prism_scan_jobs WHERE state IN ('queued','running')",
      [user],
    )
    if (counts.rows[0]!.total >= 100 || counts.rows[0]!.own >= 3)
      throw new TeamError(429, '扫描队列已满；每位用户最多 3 个等待或运行中的任务。')
  }
  async api(user: string, action: string, body: Record<string, unknown>): Promise<unknown> {
    return await this.lock(async () => {
      await this.team.refresh()
      if (!this.team.user(user)) throw new TeamError(401, '请重新登录。')
      if (action === 'scan-catalog')
        return {
          rules: await this.rules(),
          serviceRules: SERVICE_RULES,
          canRun: this.team.can(user, 'scan.run'),
          canScanInternal: this.team.can(user, 'scan.internal'),
          canManageRules: this.team.can(user, 'scan.rules'),
        }
      if (action === 'scan-list') {
        const project = typeof body.projectId === 'string' && body.projectId ? body.projectId : null
        if (project) this.team.assertProject(user, project, 'read')
        else this.team.assertPermission(user, 'task.use')
        const rows = await this.team.db.query<{ data: ScanJob }>(
          'SELECT data FROM prism_scan_jobs WHERE project_id IS NOT DISTINCT FROM $1 AND ($2 OR owner_id=$3 OR project_id IS NOT NULL) ORDER BY created_at DESC, id DESC LIMIT 100',
          [project, this.team.user(user)?.role === 'admin', user],
        )
        return {
          jobs: rows.rows
            .map((r) => r.data)
            .filter((j) => this.allowed(user, j, false))
            .map((j) => ({
              id: j.id,
              name: j.name,
              kind: j.kind ?? 'web',
              openPorts: j.portResults?.filter((r) => r.state === 'open').length ?? 0,
              ownerId: j.ownerId,
              projectId: j.projectId,
              state: j.state,
              createdAt: j.createdAt,
              targets: j.targets,
              ruleHash: j.ruleHash,
              completedChecks: completedScanChecks(j),
              totalChecks: totalScanChecks(j),
              findingsCount: j.findings.length,
            })),
        }
      }
      if (action === 'scan-rule-save') {
        this.team.assertPermission(user, 'scan.rules')
        const parsed = scanRuleSchema.safeParse(body.rule)
        if (!parsed.success)
          throw new TeamError(400, '规则格式无效；只支持棱镜 JSON 规则及有限字面匹配。')
        const rule = parsed.data
        if (rule.id.startsWith('prism-')) throw new TeamError(400, 'prism- 前缀为内置规则保留。')
        const catalog = await this.rules(),
          previous = catalog.find((r) => r.id === rule.id)
        if (previous && rule.version <= previous.version)
          throw new TeamError(400, '更新规则必须增加版本号。')
        if (!previous && catalog.length >= 100)
          throw new TeamError(400, '规则数量已达到 100 条上限。')
        await this.team.db.query(
          'INSERT INTO prism_scan_rules VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
          [rule.id, JSON.stringify(rule)],
        )
        await this.audit(user, 'scan.rule.save', rule.id)
        return { ok: true }
      }
      if (action === 'scan-create') {
        this.team.assertPermission(user, 'scan.run')
        const parsed = createSchema.safeParse(body)
        if (!parsed.success)
          throw new TeamError(
            400,
            '扫描参数无效。目标最多 20 个，超时 1–15 秒，间隔 250–5000 毫秒。',
          )
        const input = parsed.data,
          project = input.projectId || null
        if (project) this.team.assertProject(user, project, 'write')
        else this.team.assertPermission(user, 'task.use')
        let targets: string[],
          ports: number[] = []
        try {
          targets =
            input.kind !== 'web'
              ? normalizePortTargets(input.targets)
              : normalizeScanTargets(input.targets)
          if (input.kind !== 'web') {
            ports = parsePorts(input.ports)
            const limit = input.kind === 'services' ? MAX_SERVICE_CHECKS : MAX_PORT_CHECKS
            if (ports.length * targets.length > limit)
              throw new Error(`每次最多 ${limit} 个目标与端口组合，请减少目标或端口数量。`)
            if (input.kind === 'ports' && input.timeoutMs > 5000)
              throw new Error('TCP 连接超时上限为 5000 毫秒。')
          } else if (input.ports !== undefined) throw new Error('Web 扫描不接受端口扫描参数。')
          if (input.kind !== 'services' && input.serviceMode !== undefined)
            throw new Error('只有指纹漏洞扫描接受服务探测模式。')
          if (input.kind === 'services' && (input.profile === 'custom' || input.ruleIds))
            throw new Error('指纹扫描使用独立协议规则，不接受 Web 规则。')
        } catch (e) {
          throw new TeamError(400, (e as Error).message)
        }
        const catalog = await this.rules()
        const rules =
          input.kind !== 'web'
            ? []
            : catalog.filter((r) =>
                input.profile === 'custom'
                  ? input.ruleIds?.includes(r.id)
                  : input.profile === 'quick'
                    ? r.family !== 'exposure'
                    : true,
              )
        if (
          input.kind === 'web' &&
          (!rules.length ||
            (input.profile === 'custom' &&
              input.ruleIds?.some((id) => !catalog.some((r) => r.id === id))))
        )
          throw new TeamError(400, '请选择有效规则。')
        await this.assertQueueCapacity(user)
        const now = new Date().toISOString()
        const job: ScanJob = {
          id: randomUUID(),
          kind: input.kind,
          ...(input.kind === 'services'
            ? {
                serviceScan: { ports, mode: input.serviceMode ?? 'auto' },
                serviceResults: [],
                serviceRules: SERVICE_RULES,
              }
            : {}),
          ...(input.kind === 'ports'
            ? { portScan: { ports, concurrency: input.concurrency }, portResults: [] }
            : {}),
          ownerId: user,
          projectId: project,
          name: redactEvidence(input.name, 100),
          targets,
          policy: {
            id: input.profile,
            timeoutMs: input.timeoutMs,
            delayMs: input.delayMs,
            ruleIds: rules.map((r) => r.id),
          },
          rules,
          ruleHash:
            input.kind !== 'web'
              ? createHash('sha256')
                  .update(
                    JSON.stringify(
                      input.kind === 'ports'
                        ? { engine: 'tcp-connect-v1', ports }
                        : {
                            engine: 'service-v1',
                            ports,
                            mode: input.serviceMode ?? 'auto',
                            rules: SERVICE_RULES,
                          },
                    ),
                  )
                  .digest('hex')
              : ruleDigest(rules),
          state: 'queued',
          createdAt: now,
          updatedAt: now,
          checks: [],
          findings: [],
          message: '等待扫描引擎执行。',
        }
        await this.team.db.query(
          'INSERT INTO prism_scan_jobs(id,owner_id,project_id,state,data) VALUES($1,$2,$3,$4,$5::jsonb)',
          [job.id, user, project, job.state, JSON.stringify(job)],
        )
        await this.audit(user, 'scan.create', job.id)
        this.schedule()
        return { job }
      }
      if (typeof body.id !== 'string') throw new TeamError(400, '缺少扫描任务编号。')
      const job = await this.load(body.id)
      this.assertAccess(user, job, action !== 'scan-get' && action !== 'scan-compare')
      if (action === 'scan-get') return { job }
      if (action === 'scan-compare') {
        if (typeof body.baselineId !== 'string') throw new TeamError(400, '缺少基线任务。')
        const baseline = await this.load(body.baselineId)
        this.assertAccess(user, baseline, false)
        return compareScans(baseline, job)
      }
      if (action === 'scan-control') {
        if (body.command === 'pause' && ACTIVE.includes(job.state)) job.state = 'paused'
        else if (
          body.command === 'cancel' &&
          ['queued', 'running', 'paused', 'interrupted'].includes(job.state)
        )
          job.state = 'cancelled'
        else if (body.command === 'resume' && ['paused', 'interrupted'].includes(job.state)) {
          if (this.active?.id === job.id) throw new TeamError(409, '正在停止当前请求，请稍后继续。')
          await this.assertQueueCapacity(job.ownerId)
          job.state = 'queued'
        } else throw new TeamError(409, '当前状态不支持此操作。')
        if (this.active?.id === job.id) this.active.abort.abort()
        job.message =
          job.state === 'queued'
            ? '等待继续执行未完成的检查。'
            : '已停止后续请求；未完成检查不会被标记为通过。'
        await this.save(job)
        await this.audit(user, `scan.${String(body.command)}`, job.id)
        this.schedule()
        return { job }
      }
      if (action === 'scan-finding') {
        const parsed = z
          .object({
            findingId: z.string(),
            state: z.enum(['open', 'accepted', 'false-positive']),
            note: z.string().trim().min(1).max(500),
          })
          .safeParse({ findingId: body.findingId, state: body.state, note: body.note })
        if (!parsed.success) throw new TeamError(400, '请填写 1–500 字的处置说明。')
        const finding = job.findings.find((f) => f.id === parsed.data.findingId)
        if (!finding) throw new TeamError(404, '未找到此漏洞。')
        finding.state = parsed.data.state
        finding.note = redactEvidence(parsed.data.note, 500)
        await this.save(job)
        await this.audit(user, `scan.finding.${finding.state}`, `${job.id}:${finding.id}`)
        return { job }
      }
      throw new TeamError(404, '未知的扫描操作。')
    })
  }
  private schedule() {
    this.requested++
    if (this.worker || this.closed) return
    const started = this.requested
    // The first lock waits until the request's transaction has returned.
    this.worker = this.drain()
      .catch(() => undefined)
      .finally(() => {
        this.worker = undefined
        if (this.requested !== started && !this.closed) this.schedule()
      })
  }
  private async drain() {
    while (!this.closed) {
      const job = await this.lock(async () => {
        if (this.closed) return undefined
        const row = (
          await this.team.db.query<{ data: ScanJob }>(
            "SELECT data FROM prism_scan_jobs WHERE state='queued' ORDER BY created_at,id LIMIT 1",
          )
        ).rows[0]
        if (!row) return undefined
        row.data.state = 'running'
        row.data.message =
          row.data.kind === 'ports'
            ? '执行原生 TCP 端口扫描。'
            : row.data.kind === 'services'
              ? '执行端口服务识别与协议漏洞检查。'
              : '执行原生 HTTP / TLS 检查。'
        this.active = { id: row.data.id, abort: new AbortController() }
        await this.save(row.data)
        return row.data
      })
      if (!job) return
      const signal = AbortSignal.any([this.active!.abort.signal, AbortSignal.timeout(600_000)])
      let failed = false
      const allowInternal = this.team.can(job.ownerId, 'scan.internal')
      try {
        const beforeProbe = async () => {
          await this.team.refresh()
          this.assertAccess(job.ownerId, job, true)
          if (allowInternal && !this.team.can(job.ownerId, 'scan.internal'))
            throw new Error('permission-revoked')
        }
        if (job.kind === 'ports')
          await executePortScan(job, {
            ...this.tcpDependencies,
            signal,
            allowInternal,
            beforeProbe,
            checkpoint: (results) =>
              this.lock(async () => {
                const current = await this.load(job.id)
                if (current.state !== 'running') return
                current.portResults = [...(current.portResults ?? []), ...results]
                await this.save(current)
              }),
          })
        else if (job.kind === 'services')
          await executeServiceScan(job, {
            ...this.serviceDependencies,
            signal,
            allowInternal,
            beforeProbe,
            checkpoint: (result, checks) =>
              this.lock(async () => {
                const current = await this.load(job.id)
                if (current.state !== 'running') return
                current.serviceResults = [...(current.serviceResults ?? []), result]
                current.checks.push(...checks)
                for (const check of checks)
                  if (check.state === 'hit')
                    current.findings.push(
                      findingFor(
                        check,
                        current.serviceRules!.find((rule) => rule.id === check.ruleId)!,
                      ),
                    )
                await this.save(current)
              }),
          })
        else
          await executeScan(job, {
            signal,
            allowInternal,
            beforeProbe,
            ...(this.probe ? { probe: this.probe } : {}),
            checkpoint: (checks) =>
              this.lock(async () => {
                const current = await this.load(job.id)
                if (current.state !== 'running') return
                current.checks.push(...checks)
                for (const check of checks)
                  if (check.state === 'hit')
                    current.findings.push(
                      findingFor(
                        check,
                        current.rules.find((r) => r.id === check.ruleId)!,
                      ),
                    )
                await this.save(current)
              }),
          })
      } catch {
        failed = true
      }
      await this.lock(async () => {
        const current = await this.load(job.id)
        if (current.state === 'running') {
          const errors =
            current.kind === 'ports'
              ? current.portResults?.some((r) => r.state === 'error' || r.state === 'filtered')
              : current.kind === 'services'
                ? current.serviceResults?.some((r) => r.state === 'unknown' || r.state === 'error')
                : current.checks.some(
                    (c) =>
                      c.state === 'error' ||
                      (c.state === 'skipped' && c.detail !== '目标为 HTTP，TLS 检查不适用。'),
                  )
          current.state =
            this.closed || signal.aborted
              ? 'interrupted'
              : failed
                ? 'failed'
                : errors
                  ? 'partial'
                  : 'completed'
          current.message =
            current.state === 'interrupted'
              ? '服务停止或本次执行达到十分钟时限；可手动继续未完成的检查。'
              : failed
                ? '扫描中断：权限变化、超时、停止服务或存储异常。已有结果已保留。'
                : errors
                  ? '部分检查未完成；请查看检查明细后复测。'
                  : current.kind === 'ports'
                    ? '端口扫描完成。开放端口仅表示可连接，服务用途按端口号推测，不代表已发现漏洞。'
                    : current.kind === 'services'
                      ? '服务识别完成。仅对有适用规则的服务执行协议检查；版本声明不等于漏洞确认。'
                      : '扫描完成；未命中只代表所选规则未发现问题。'
          await this.save(current)
        }
        this.active = undefined
      })
    }
  }
}
