import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { embeddedDatabase } from '../src/lib/embedded-database.js'
import { TeamStore } from '../src/lib/team-database.js'
import { NativeScans, compareScans } from '../src/lib/native-scans.js'
import { BUILTIN_SCAN_RULES } from '../src/lib/native-rules.js'
import type { Probe, ScanProbe } from '../src/lib/native-engine.js'
import type { ScanCatalog, ScanJob, ScanSummary } from '../src/lib/native-scan-types.js'

describe('database-backed native scanning, isolation and task lifecycle', () => {
  const db = embeddedDatabase('memory://'),
    team = new TeamStore(db)
  let service: NativeScans, admin: string, alice: string, bob: string
  const response: Probe = {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '',
    truncated: false,
    tls: { valid: true, days: 90, keyBits: 2048 },
  }
  let probe: ScanProbe = async () => response
  const create = async (user = alice, extra: Record<string, unknown> = {}) =>
    (
      (await service.api(user, 'scan-create', {
        name: '本地验证',
        targets: ['https://fixture.example/'],
        profile: 'custom',
        ruleIds: ['prism-mime-sniffing'],
        ...extra,
      })) as { job: ScanJob }
    ).job
  const get = async (id: string, user = alice) =>
    ((await service.api(user, 'scan-get', { id })) as { job: ScanJob }).job
  const wait = async (id: string, state: string) => {
    await vi.waitFor(async () => expect((await get(id)).state).toBe(state), {
      timeout: 5000,
      interval: 20,
    })
  }
  beforeAll(async () => {
    await team.initialize()
    admin = team.users[0]!.id
    alice = (await team.createUser(admin, 'alice-scan', '12345678', 'member')).id
    bob = (await team.createUser(admin, 'bob-scan', '12345678', 'member')).id
    service = new NativeScans(team, (url, options) => probe(url, options))
    await service.initialize()
  }, 20000)
  afterAll(async () => {
    await service.close()
    await db.close()
  })

  it('persists a real rule snapshot, redacted evidence and owner/project permissions', async () => {
    expect(((await service.api(alice, 'scan-catalog', {})) as ScanCatalog).canScanInternal).toBe(
      false,
    )
    expect(((await service.api(admin, 'scan-catalog', {})) as ScanCatalog).canManageRules).toBe(
      true,
    )
    const job = await create()
    await service.idle()
    const completed = await get(job.id)
    expect(completed.state).toBe('completed')
    expect(completed.findings).toHaveLength(1)
    expect(completed.checks).toHaveLength(1)
    expect(completed.rules[0]!.version).toBe(1)
    expect(
      ((await service.api(bob, 'scan-list', {})) as { jobs: ScanSummary[] }).jobs,
    ).toHaveLength(0)
    await expect(get(job.id, bob)).rejects.toMatchObject({ status: 403 })
    expect((await get(job.id, admin)).id).toBe(job.id)
    expect(
      ((await service.api(admin, 'scan-list', {})) as { jobs: ScanSummary[] }).jobs.some(
        (j) => j.id === job.id,
      ),
    ).toBe(true)
    const project = {
      id: 'scan-project',
      owner_id: alice,
      name: '协作扫描',
      workspace_id: 'workspace-scan',
      root_path: '/tmp/prism-scan-project',
    }
    await team.addProject(alice, project)
    const projectJob = await create(alice, { projectId: project.id })
    await service.idle()
    await team.setUserPermission(
      admin,
      bob,
      { permission: 'project.read', resource: project.id },
      'allow',
    )
    expect(
      ((await service.api(bob, 'scan-list', { projectId: project.id })) as { jobs: ScanSummary[] })
        .jobs,
    ).toHaveLength(1)
    await expect(
      service.api(bob, 'scan-control', { id: projectJob.id, command: 'cancel' }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(create(bob, { projectId: project.id })).rejects.toMatchObject({ status: 403 })
    await team.setUserPermission(
      admin,
      bob,
      { permission: 'project.run', resource: project.id },
      'allow',
    )
    const shared = await create(bob, { projectId: project.id })
    await service.idle()
    expect(compareScans(await get(projectJob.id), await get(shared.id)).persistent).toHaveLength(1)
    await team.setUserPermission(
      admin,
      bob,
      { permission: 'project.read', resource: project.id },
      'deny',
    )
    await expect(get(projectJob.id, bob)).rejects.toMatchObject({ status: 403 })
  })
  it('validates input, native rule imports and rule version history', async () => {
    for (const bad of [
      { targets: [] },
      { targets: ['https://u:p@fixture.example/'] },
      { profile: 'custom', ruleIds: [] },
      { ruleIds: ['does-not-exist'] },
      { delayMs: 1 },
    ])
      await expect(create(alice, bad)).rejects.toMatchObject({ status: 400 })
    const native = { ...BUILTIN_SCAN_RULES[0]!, id: 'company-check' }
    await expect(service.api(alice, 'scan-rule-save', { rule: native })).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      service.api(admin, 'scan-rule-save', { rule: { ...native, path: '../x' } }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      service.api(admin, 'scan-rule-save', { rule: BUILTIN_SCAN_RULES[0] }),
    ).rejects.toMatchObject({ status: 400 })
    await service.api(admin, 'scan-rule-save', { rule: native })
    const job = await create(alice, { ruleIds: ['company-check'] })
    await service.idle()
    await expect(service.api(admin, 'scan-rule-save', { rule: native })).rejects.toMatchObject({
      status: 400,
    })
    await service.api(admin, 'scan-rule-save', { rule: { ...native, version: 2 } })
    expect((await get(job.id)).rules[0]!.version).toBe(1)
    await expect(service.api(alice, 'scan-control', {})).rejects.toMatchObject({ status: 400 })
    await expect(service.api(alice, 'scan-get', { id: 'absent' })).rejects.toMatchObject({
      status: 404,
    })
    await expect(service.api('nobody', 'scan-catalog', {})).rejects.toMatchObject({ status: 401 })
    await expect(service.api(alice, 'scan-unknown', { id: job.id })).rejects.toMatchObject({
      status: 404,
    })
    await expect(service.api(alice, 'scan-compare', { id: job.id })).rejects.toMatchObject({
      status: 400,
    })
  })
  it('stores disposition notes and compares remediation only against successful checks', async () => {
    const first = await create()
    await service.idle()
    const baseline = await get(first.id)
    const findingId = baseline.findings[0]!.id
    await expect(
      service.api(alice, 'scan-finding', { id: first.id, findingId, state: 'accepted', note: '' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      service.api(alice, 'scan-finding', {
        id: first.id,
        findingId: 'missing',
        state: 'accepted',
        note: 'reason',
      }),
    ).rejects.toMatchObject({ status: 404 })
    await service.api(alice, 'scan-finding', {
      id: first.id,
      findingId,
      state: 'accepted',
      note: 'password=never-save-this',
    })
    expect((await get(first.id)).findings[0]!.note).not.toContain('never-save-this')
    probe = async () => ({
      ...response,
      headers: { 'content-type': 'text/html', 'x-content-type-options': 'nosniff' },
    })
    const second = await create()
    await service.idle()
    const compared = await service.api(alice, 'scan-compare', {
      id: second.id,
      baselineId: first.id,
    })
    expect(compared).toMatchObject({
      resolved: [findingId],
      added: [],
      persistent: [],
      unverified: [],
    })
    probe = async () => {
      throw new Error('failure with response secret')
    }
    const third = await create()
    await service.idle()
    expect((await get(third.id)).state).toBe('partial')
    expect(
      await service.api(alice, 'scan-compare', { id: third.id, baselineId: first.id }),
    ).toMatchObject({ unverified: [findingId], resolved: [] })
    expect(JSON.stringify(await get(third.id))).not.toContain('failure with response secret')
    const after = await get(second.id)
    expect(compareScans(after, baseline).added).toEqual([findingId])
    for (const changes of [
      { ownerId: bob },
      { projectId: 'other' },
      { ruleHash: 'different' },
      { targets: ['https://other.example/'] },
    ])
      expect(() => compareScans(baseline, { ...after, ...changes })).toThrow()
    probe = async () => response
  })
  it('pauses and cancels in-flight probes, resumes only remaining checks and revalidates permissions', async () => {
    let called = 0
    probe = async (_url, options) => {
      called++
      return await new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true })
      })
    }
    const job = await create()
    await vi.waitFor(() => expect(called).toBe(1))
    await service.api(alice, 'scan-control', { id: job.id, command: 'pause' })
    await service.idle()
    expect((await get(job.id)).state).toBe('paused')
    expect((await get(job.id)).checks).toHaveLength(0)
    probe = async () => response
    await service.api(alice, 'scan-control', { id: job.id, command: 'resume' })
    await service.idle()
    expect((await get(job.id)).state).toBe('completed')
    await expect(
      service.api(alice, 'scan-control', { id: job.id, command: 'resume' }),
    ).rejects.toMatchObject({ status: 409 })
    probe = async (_url, options) =>
      await new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true })
      })
    const cancel = await create()
    await wait(cancel.id, 'running')
    await service.api(alice, 'scan-control', { id: cancel.id, command: 'cancel' })
    await service.idle()
    expect((await get(cancel.id)).state).toBe('cancelled')
    await team.setUserPermission(admin, alice, { permission: 'scan.run', resource: '*' }, 'deny')
    await expect(create()).rejects.toMatchObject({ status: 403 })
    await team.setUserPermission(admin, alice, { permission: 'scan.run', resource: '*' }, 'allow')
    probe = async () => {
      await team.setUserPermission(admin, alice, { permission: 'scan.run', resource: '*' }, 'deny')
      return response
    }
    const revoked = await create(alice, { profile: 'standard' })
    await service.idle()
    expect((await get(revoked.id)).state).toBe('failed')
    await team.setUserPermission(admin, alice, { permission: 'scan.run', resource: '*' }, 'allow')
    probe = async () => response
  })
  it('bounds the queue, pauses queued work and marks restart interruptions without automatic traffic', async () => {
    let calls = 0
    probe = async (_url, options) => {
      calls++
      return await new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('stopped')), {
          once: true,
        }),
      )
    }
    const a = await create()
    await vi.waitFor(() => expect(calls).toBe(1))
    const b = await create(),
      c = await create()
    await expect(create()).rejects.toMatchObject({ status: 429 })
    await service.api(alice, 'scan-control', { id: b.id, command: 'pause' })
    await service.api(alice, 'scan-control', { id: c.id, command: 'cancel' })
    await service.close()
    expect((await get(a.id)).state).toBe('interrupted')
    await db.query("UPDATE prism_scan_jobs SET state='running' WHERE id=$1", [a.id])
    service = new NativeScans(team, (url, options) => probe(url, options))
    await service.initialize()
    expect((await get(a.id)).state).toBe('interrupted')
    expect(calls).toBe(1)
    probe = async () => response
    await service.api(alice, 'scan-control', { id: a.id, command: 'resume' })
    await service.idle()
    expect((await get(a.id)).state).toBe('completed')
    await service.api(alice, 'scan-control', { id: b.id, command: 'cancel' })
  })
})
