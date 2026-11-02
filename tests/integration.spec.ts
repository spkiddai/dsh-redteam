import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId as CallId } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import RedTeamPlugin from '../src/index.js'

const signal = new AbortController().signal
const contexts: Context[] = []
const temporaryDirectories: string[] = []
let agentSequence = 0
const presetByAgentContext = new WeakMap<Context, string | undefined>()

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((ctx) => ctx.fiber.dispose()))
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

async function mountServices(ctx: Context, workspaceRoot: string): Promise<void> {
  await ctx.plugin(SystemPrompt)
  ctx.provide('sandboxPolicy', {
    resolve: (request: { readonly session?: { readonly header?: { readonly cwd?: string } } }) => ({
      mode: 'read-only',
      workspaceRoot: realpathSync(request.session?.header?.cwd ?? workspaceRoot),
    }),
  } as never)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  ctx.provide('agentPresets', {
    composedPreset: (agentContext: Context) => presetByAgentContext.get(agentContext),
  } as never)
}

async function addAgent(
  ctx: Context,
  workspaceRoot: string,
  agentPreset: string | undefined = 'redteam',
): Promise<Agent> {
  agentSequence += 1
  const id = `redteam-test-${agentSequence}`
  const subject = {
    id,
    session: {
      events: [],
      header: { agentPreset, cwd: workspaceRoot },
      id,
    },
  } as unknown as Agent
  let agentContext!: Context
  await ctx.plugin(
    Object.assign(
      (inner: Context) => {
        agentContext = createScope(inner, subject).ctx
      },
      { inject: ['sandboxPolicy', 'systemPrompt', 'tools'] },
    ),
  )
  Object.defineProperty(subject, 'ctx', { configurable: false, value: agentContext })
  presetByAgentContext.set(agentContext, agentPreset)
  ctx.agents.register(subject)
  return subject
}

async function setup(
  config: Record<string, unknown> = {},
  fixedWorkspace = true,
  agentPreset: string | undefined = 'redteam',
) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-redteam-integration-'))
  temporaryDirectories.push(workspaceRoot)
  await mkdir(join(workspaceRoot, 'src'))
  await writeFile(
    join(workspaceRoot, 'src', 'unsafe.ts'),
    'const apiKey = "example-secret-value"\neval(userInput)\n',
  )
  const ctx = new Context()
  contexts.push(ctx)
  await mountServices(ctx, workspaceRoot)
  const fiber = await ctx.plugin(RedTeamPlugin, {
    ...(fixedWorkspace ? { workspaceRoot } : {}),
    ...config,
  })
  const agent = await addAgent(ctx, workspaceRoot, agentPreset)
  return { agent, ctx, fiber, workspaceRoot }
}

describe('single DeepSeek Harness plugin', () => {
  it('registers core tools without requiring optional knowledge services', async () => {
    const { agent, ctx } = await setup()
    expect(ctx.tools.schemas()).toEqual([])
    expect(ctx.tools.schemas(agent).map((tool) => tool.name)).toEqual([
      'redteam_status',
      'redteam_knowledge_status',
      'redteam_project_start',
      'redteam_project_remember',
      'redteam_project_recall',
      'redteam_knowledge_search',
      'redteam_knowledge_upsert',
      'redteam_knowledge_read',
      'redteam_knowledge_tree',
      'redteam_knowledge_grep',
      'redteam_project_promote',
      'redteam_asset_map_start',
      'redteam_asset_map_observe',
      'redteam_asset_map_frontier',
      'redteam_asset_map_report',
      'redteam_scan',
      'redteam_findings',
      'redteam_update_finding',
      'redteam_report',
    ])
    const prompt = await ctx.systemPrompt.assemble({ agent, scope: agent })
    expect(prompt.sections.filter((section) => section.name === 'dsh-redteam')).toHaveLength(1)
    expect(prompt.sections.find((section) => section.name === 'dsh-redteam')?.text).toContain(
      'passive review mode',
    )
    expect(prompt.sections.find((section) => section.name === 'dsh-redteam')?.text).toContain(
      'built-in Red Team knowledge library is always active',
    )
    expect(prompt.sections.find((section) => section.name === 'dsh-redteam')?.text).toContain(
      'explicitly starts vulnerability testing',
    )
  })

  it('runs built-in project memory and layered knowledge tools without external services', async () => {
    const { agent, ctx } = await setup()
    const started = await ctx.tools.execute({
      agent,
      arguments: { name: 'Local SRC knowledge' },
      callId: CallId('local-project-start'),
      name: 'redteam_project_start',
      signal,
    })
    expect(started).toMatchObject({ isError: false, value: { name: 'Local SRC knowledge' } })
    if (started.isError) return
    const projectId = (started.value as { projectId: string }).projectId

    const remembered = await ctx.tools.execute({
      agent,
      arguments: {
        authority: 'authoritative',
        confidence: 'high',
        content: 'Confirmed reusable HTTP validation for Example Gateway.',
        kind: 'technique',
        promotable: true,
        sensitivity: 'reusable',
        source_urls: ['https://example.com/http-validation'],
        status: 'resolved',
        tags: ['http', 'gateway'],
        title: 'HTTP validation technique',
      },
      callId: CallId('local-project-remember'),
      name: 'redteam_project_remember',
      signal,
    })
    expect(remembered).toMatchObject({ isError: false, value: { projectId } })
    if (remembered.isError) return
    const episodeId = (remembered.value as { episodeId: string }).episodeId

    const recalled = await ctx.tools.execute({
      agent,
      arguments: { project_id: projectId, query: 'Gateway' },
      callId: CallId('local-project-recall'),
      name: 'redteam_project_recall',
      signal,
    })
    expect(recalled).toMatchObject({
      isError: false,
      value: { events: [{ eventId: episodeId }], facts: [] },
    })

    const upserted = await ctx.tools.execute({
      agent,
      arguments: {
        content: 'CVE-2026-56789 affects Example Gateway 4.2 on Linux.',
        identifiers: ['CVE-2026-56789'],
        knowledge_type: 'vulnerability',
        products: ['Example Gateway'],
        status: 'confirmed',
        tags: ['rce'],
        title: 'Example Gateway advisory',
        versions: ['4.2'],
      },
      callId: CallId('local-knowledge-upsert'),
      name: 'redteam_knowledge_upsert',
      signal,
    })
    expect(upserted).toMatchObject({
      isError: false,
      value: { created: true, document: { type: 'vulnerability' } },
    })
    if (upserted.isError) return
    const reference = (upserted.value as { document: { uri: string } }).document.uri

    await expect(
      ctx.tools.execute({
        agent,
        arguments: {},
        callId: CallId('local-knowledge-tree'),
        name: 'redteam_knowledge_tree',
        signal,
      }),
    ).resolves.toMatchObject({
      isError: false,
      value: {
        nodes: expect.arrayContaining([
          expect.objectContaining({ childCount: 1, uri: 'redteam://knowledge/vulnerability' }),
        ]),
      },
    })
    await expect(
      ctx.tools.execute({
        agent,
        arguments: { level: 2, reference },
        callId: CallId('local-knowledge-read'),
        name: 'redteam_knowledge_read',
        signal,
      }),
    ).resolves.toMatchObject({
      isError: false,
      value: { content: expect.stringContaining('CVE-2026-56789'), level: 2 },
    })
    await expect(
      ctx.tools.execute({
        agent,
        arguments: { query: 'CVE-2026-56789' },
        callId: CallId('local-knowledge-grep'),
        name: 'redteam_knowledge_grep',
        signal,
      }),
    ).resolves.toMatchObject({ isError: false, value: { matches: [{ uri: reference }] } })
    await expect(
      ctx.tools.execute({
        agent,
        arguments: { query: 'Example Gateway' },
        callId: CallId('local-knowledge-search'),
        name: 'redteam_knowledge_search',
        signal,
      }),
    ).resolves.toMatchObject({
      isError: false,
      value: { chunks: [expect.objectContaining({ source: 'builtin' })] },
    })
    await expect(
      ctx.tools.execute({
        agent,
        arguments: {
          episode_id: episodeId,
          knowledge_type: 'technique',
          project_id: projectId,
        },
        callId: CallId('local-project-promote'),
        name: 'redteam_project_promote',
        signal,
      }),
    ).resolves.toMatchObject({
      isError: false,
      value: { datasetId: 'builtin:technique', projectId },
    })
    await expect(
      ctx.tools.execute({
        agent,
        arguments: {},
        callId: CallId('local-knowledge-status-final'),
        name: 'redteam_knowledge_status',
        signal,
      }),
    ).resolves.toMatchObject({
      isError: false,
      value: { local: { documentCount: 2, eventCount: 2, projectCount: 1 } },
    })
  })

  it('runs the passive assessment, returns redacted findings, and writes a report', async () => {
    const { agent, ctx, workspaceRoot } = await setup()
    const initialStatus = await ctx.tools.execute({
      agent,
      arguments: {},
      callId: CallId('redteam-status-initial'),
      name: 'redteam_status',
      signal,
    })
    expect(initialStatus).toMatchObject({
      isError: false,
      value: {
        activeVerification: false,
        latestAssetGraphId: null,
        latestAssessmentId: null,
        mode: 'review',
        ruleCount: 9,
        rulesetVersion: '2026.08.1',
        version: '1.3.2',
      },
    })
    const knowledgeStatus = await ctx.tools.execute({
      agent,
      arguments: {},
      callId: CallId('redteam-knowledge-status'),
      name: 'redteam_knowledge_status',
      signal,
    })
    expect(knowledgeStatus).toMatchObject({
      isError: false,
      value: {
        currentProject: null,
        graphiti: { configured: false, reachable: false },
        local: {
          available: true,
          documentCount: 0,
          eventCount: 0,
          projectCount: 0,
        },
        ragflow: { configured: false, datasetTypes: [], reachable: false },
      },
    })
    const localProject = await ctx.tools.execute({
      agent,
      arguments: { name: 'Unconfigured project' },
      callId: CallId('redteam-project-start-local'),
      name: 'redteam_project_start',
      signal,
    })
    expect(localProject).toMatchObject({ isError: false, value: { name: 'Unconfigured project' } })
    const scan = await ctx.tools.execute({
      agent,
      arguments: { categories: ['secret', 'source'], path: 'src' },
      callId: CallId('redteam-scan'),
      name: 'redteam_scan',
      signal,
    })
    expect(scan.isError).toBe(false)
    if (scan.isError) return
    expect(scan.value).toMatchObject({ filesScanned: 1, findingCount: 2 })
    const assessmentId = (scan.value as { assessmentId: string }).assessmentId

    const currentStatus = await ctx.tools.execute({
      agent,
      arguments: {},
      callId: CallId('redteam-status-current'),
      name: 'redteam_status',
      signal,
    })
    expect(currentStatus).toMatchObject({
      isError: false,
      value: { latestAssessmentId: assessmentId },
    })

    const findings = await ctx.tools.execute({
      agent,
      arguments: { assessment_id: assessmentId, limit: 10, severity: 'high' },
      callId: CallId('redteam-findings'),
      name: 'redteam_findings',
      signal,
    })
    expect(findings.isError).toBe(false)
    if (findings.isError) return
    const serialized = JSON.stringify(findings.value)
    expect(serialized).toContain('[redacted]')
    expect(serialized).not.toContain('example-secret-value')
    const findingId = (findings.value as { findings: Array<{ id: string }> }).findings[0]?.id ?? ''
    expect(findingId).not.toBe('')

    const reviewed = await ctx.tools.execute({
      agent,
      arguments: {
        assessment_id: assessmentId,
        finding_id: findingId,
        reason: 'Reviewed password=example-secret-value against the source path.',
        status: 'confirmed',
      },
      callId: CallId('redteam-update-finding'),
      name: 'redteam_update_finding',
      signal,
    })
    expect(reviewed).toMatchObject({
      isError: false,
      value: {
        assessmentId,
        finding: {
          id: findingId,
          status: 'confirmed',
          statusHistory: [
            {
              from: 'candidate',
              reason: 'Reviewed password=[redacted] against the source path.',
              to: 'confirmed',
            },
          ],
        },
      },
    })

    const confirmed = await ctx.tools.execute({
      agent,
      arguments: { assessment_id: assessmentId, limit: 10, status: 'confirmed' },
      callId: CallId('redteam-findings-confirmed'),
      name: 'redteam_findings',
      signal,
    })
    expect(confirmed).toMatchObject({ isError: false, value: { total: 1 } })

    const invalidTransition = await ctx.tools.execute({
      agent,
      arguments: {
        assessment_id: assessmentId,
        finding_id: findingId,
        reason: 'Duplicate review.',
        status: 'confirmed',
      },
      callId: CallId('redteam-update-finding-invalid'),
      name: 'redteam_update_finding',
      signal,
    })
    expect(invalidTransition.isError).toBe(true)

    const invalidLimit = await ctx.tools.execute({
      agent,
      arguments: { limit: 0 },
      callId: CallId('redteam-findings-invalid-limit'),
      name: 'redteam_findings',
      signal,
    })
    expect(invalidLimit.isError).toBe(true)

    const report = await ctx.tools.execute({
      agent,
      arguments: { format: 'markdown' },
      callId: CallId('redteam-report'),
      name: 'redteam_report',
      signal,
    })
    expect(report.isError).toBe(false)
    if (report.isError) return
    const reportValue = report.value as { path: string }
    expect(reportValue.path.startsWith(join(workspaceRoot, '.dsh-redteam'))).toBe(true)
    const reportText = await readFile(reportValue.path, 'utf8')
    expect(reportText).toContain('dsh-redteam assessment report')
    expect(reportText).toContain('Latest review decision')

    const sarif = await ctx.tools.execute({
      agent,
      arguments: { assessment_id: assessmentId, format: 'sarif' },
      callId: CallId('redteam-report-sarif'),
      name: 'redteam_report',
      signal,
    })
    expect(sarif).toMatchObject({ isError: false, value: { format: 'sarif' } })

    const word = await ctx.tools.execute({
      agent,
      arguments: { assessment_id: assessmentId, format: 'word' },
      callId: CallId('redteam-report-word'),
      name: 'redteam_report',
      signal,
    })
    expect(word).toMatchObject({ isError: false, value: { format: 'word' } })
    if (!word.isError) {
      const wordPath = (word.value as { path: string }).path
      expect(wordPath).toMatch(/report\.docx$/u)
      expect((await readFile(wordPath)).subarray(0, 2).toString()).toBe('PK')
    }
  })

  it('builds, expands, reads, and exports a sourced passive asset graph', async () => {
    const { agent, ctx, workspaceRoot } = await setup()
    const started = await ctx.tools.execute({
      agent,
      arguments: { max_depth: 2, seed: 'Example Corp' },
      callId: CallId('asset-map-start'),
      name: 'redteam_asset_map_start',
      signal,
    })
    expect(started).toMatchObject({
      isError: false,
      value: {
        domainCounts: { registrable: 0, subdomain: 0, unclassified: 0 },
        edgeCount: 0,
        frontierCount: 1,
        ipCounts: { ipv4: 0, ipv6: 0 },
        maxDepth: 2,
        nodeCount: 1,
        seed: { type: 'organization', value: 'Example Corp' },
        sourceCount: 0,
        typeCounts: { organization: 1 },
      },
    })
    if (started.isError) return
    const graphId = (started.value as { graphId: string }).graphId

    const initialFrontier = await ctx.tools.execute({
      agent,
      arguments: { graph_id: graphId, limit: 10 },
      callId: CallId('asset-map-frontier-initial'),
      name: 'redteam_asset_map_frontier',
      signal,
    })
    expect(initialFrontier).toMatchObject({
      isError: false,
      value: { frontier: [{ type: 'organization', value: 'Example Corp' }] },
    })

    const observed = await ctx.tools.execute({
      agent,
      arguments: {
        expanded: [{ type: 'organization', value: 'Example Corp' }],
        graph_id: graphId,
        observations: [
          {
            confidence: 'high',
            object: { label: 'Example Cloud', type: 'product', value: 'Example Cloud' },
            relation: 'produces',
            source: {
              excerpt: 'Example Corp announced Example Cloud.',
              title: 'Example product announcement',
              url: 'https://example.com/news/cloud',
            },
            subject: { type: 'organization', value: 'Example Corp' },
          },
          {
            confidence: 'high',
            object: { type: 'domain', value: 'example.com' },
            relation: 'uses_domain',
            source: { url: 'https://example.com/assets/root-domain' },
            subject: { type: 'organization', value: 'Example Corp' },
          },
          {
            confidence: 'high',
            object: { type: 'domain', value: 'api.example.com' },
            relation: 'uses_domain',
            source: { url: 'https://example.com/assets/api-domain' },
            subject: { type: 'organization', value: 'Example Corp' },
          },
          {
            confidence: 'high',
            object: { type: 'ip', value: '203.0.113.10' },
            relation: 'resolves_to',
            source: { url: 'https://example.com/assets/ip' },
            subject: { type: 'organization', value: 'Example Corp' },
          },
          {
            confidence: 'high',
            object: { type: 'network', value: '203.0.113.0/24' },
            relation: 'hosted_on',
            source: { url: 'https://example.com/assets/network' },
            subject: { type: 'organization', value: 'Example Corp' },
          },
        ],
      },
      callId: CallId('asset-map-observe'),
      name: 'redteam_asset_map_observe',
      signal,
    })
    expect(observed).toMatchObject({
      isError: false,
      value: {
        domainCounts: { registrable: 1, subdomain: 1, unclassified: 0 },
        edgeCount: 5,
        frontierCount: 5,
        ipCounts: { ipv4: 1, ipv6: 0 },
        nodeCount: 6,
        sourceCount: 5,
        typeCounts: { domain: 2, ip: 1, network: 1, organization: 1, product: 1 },
      },
    })

    const report = await ctx.tools.execute({
      agent,
      arguments: { format: 'graphml', graph_id: graphId },
      callId: CallId('asset-map-report'),
      name: 'redteam_asset_map_report',
      signal,
    })
    expect(report).toMatchObject({
      isError: false,
      value: {
        domainCounts: { registrable: 1, subdomain: 1 },
        edgeCount: 5,
        format: 'graphml',
        nodeCount: 6,
        typeCounts: { domain: 2, network: 1 },
      },
    })
    if (!report.isError) {
      const path = (report.value as { path: string }).path
      expect(path.startsWith(join(workspaceRoot, '.dsh-redteam'))).toBe(true)
      expect(await readFile(path, 'utf8')).toContain('<graphml')
    }

    const status = await ctx.tools.execute({
      agent,
      arguments: {},
      callId: CallId('asset-map-status'),
      name: 'redteam_status',
      signal,
    })
    expect(status).toMatchObject({ isError: false, value: { latestAssetGraphId: graphId } })

    const invalidLimit = await ctx.tools.execute({
      agent,
      arguments: { limit: 0 },
      callId: CallId('asset-map-frontier-invalid-limit'),
      name: 'redteam_asset_map_frontier',
      signal,
    })
    expect(invalidLimit.isError).toBe(true)
  })

  it('derives isolated storage from each DSH session workspace in Red Team mode', async () => {
    const { ctx } = await setup({}, false)
    const sessionWorkspace = await mkdtemp(join(tmpdir(), 'dsh-redteam-session-workspace-'))
    temporaryDirectories.push(sessionWorkspace)
    const canonicalWorkspace = await realpath(sessionWorkspace)
    const agent = await addAgent(ctx, sessionWorkspace)
    const status = await ctx.tools.execute({
      agent,
      arguments: {},
      callId: CallId('redteam-session-status'),
      name: 'redteam_status',
      signal,
    })
    expect(status).toMatchObject({
      isError: false,
      value: {
        storageRoot: join(canonicalWorkspace, '.dsh-redteam'),
        workspaceRoot: canonicalWorkspace,
      },
    })
  })

  it('denies explicit paths outside the workspace and delegates in-scope calls', async () => {
    const { agent, ctx } = await setup()
    let calls = 0
    ctx.tools.register(
      defineTool({
        name: 'read_fixture',
        description: 'test tool',
        parameters: { path: { type: 'string', required: true } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute() {
          calls += 1
          return 'ok'
        },
      }),
    )
    const denied = await ctx.tools.execute({
      agent,
      arguments: { path: '../outside.txt' },
      callId: CallId('outside'),
      name: 'read_fixture',
      signal,
    })
    expect(denied.isError).toBe(true)
    expect(calls).toBe(0)

    const allowed = await ctx.tools.execute({
      agent,
      arguments: { path: 'src/unsafe.ts' },
      callId: CallId('inside'),
      name: 'read_fixture',
      signal,
    })
    expect(allowed).toMatchObject({ isError: false, value: 'ok' })
    expect(calls).toBe(1)
  })

  it('removes every red-team effect when its one fiber is unloaded', async () => {
    const { agent, ctx, fiber } = await setup()
    await fiber.dispose()
    expect(ctx.tools.schemas(agent)).toEqual([])
    const prompt = await ctx.systemPrompt.assemble({ agent, scope: agent })
    expect(prompt.sections.some((section) => section.name === 'dsh-redteam')).toBe(false)
  })

  it('fails closed on invalid plugin limits', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-redteam-config-'))
    temporaryDirectories.push(workspaceRoot)
    const ctx = new Context()
    contexts.push(ctx)
    await mountServices(ctx, workspaceRoot)
    await expect(ctx.plugin(RedTeamPlugin, { maxFiles: 0, workspaceRoot })).rejects.toThrow(
      'maxFiles',
    )
  })

  it('loads bounded custom rules through the same single plugin', async () => {
    const { agent, ctx } = await setup({
      customRules: [
        {
          category: 'source',
          confidence: 'high',
          cwe: 'CWE-95',
          id: 'RT-CUSTOM-EVAL',
          ignoreCase: true,
          pathIgnoreCase: true,
          pathPattern: '\\.TS$',
          pattern: 'EVAL\\(',
          remediation: 'Use a parser.',
          severity: 'high',
          title: 'Custom dynamic evaluation rule',
          version: '2026.08',
        },
      ],
    })
    const status = await ctx.tools.execute({
      agent,
      arguments: {},
      callId: CallId('redteam-custom-status'),
      name: 'redteam_status',
      signal,
    })
    expect(status).toMatchObject({ isError: false, value: { ruleCount: 10 } })
    const scan = await ctx.tools.execute({
      agent,
      arguments: { categories: ['source'], path: 'src' },
      callId: CallId('redteam-custom-scan'),
      name: 'redteam_scan',
      signal,
    })
    expect(scan).toMatchObject({ isError: false, value: { findingCount: 2 } })
    const findings = await ctx.tools.execute({
      agent,
      arguments: { limit: 10 },
      callId: CallId('redteam-custom-findings'),
      name: 'redteam_findings',
      signal,
    })
    expect(JSON.stringify(findings)).toContain('RT-CUSTOM-EVAL')
    expect(JSON.stringify(findings)).toContain('2026.08')
  })

  it('rejects invalid category and ignore-directory configuration', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-redteam-invalid-config-'))
    temporaryDirectories.push(workspaceRoot)
    const configurations: Array<Record<string, unknown>> = [
      { categories: [] },
      { ignoreDirectories: ['nested/path'] },
      { maxFileBytes: 10 },
      { maxFindings: 20_000 },
      { maxFiles: 1.5 },
      { assetGraphMaxDepth: 6 },
      { assetGraphMaxNodes: 0 },
      { assetGraphMaxEdges: 30_001 },
      { assetGraphMaxSources: 1.5 },
      { knowledgeMaxDocuments: 0 },
      { knowledgeMaxProjectEvents: 100_001 },
      { knowledgeTimeoutMs: 100 },
      { graphitiAuthTokenEnv: 'lowercase-token', graphitiUrl: 'http://127.0.0.1:8000' },
      { ragflowAssetDatasetId: 'assets-without-service' },
      { graphitiUrl: 'http://graphiti.internal:8000', allowRemoteKnowledgeServices: true },
      { graphitiUrl: 'https://graphiti.example.com' },
      { graphitiUrl: 'http://user:password@127.0.0.1:8000' },
      { graphitiUrl: 'http://127.0.0.1:8000?token=secret' },
      {
        customRules: [
          {
            category: 'source',
            confidence: 'high',
            cwe: 'CWE-95',
            id: 'INVALID',
            pattern: 'eval',
            remediation: 'Replace it.',
            severity: 'high',
            title: 'Invalid id',
          },
        ],
      },
      {
        customRules: [
          {
            category: 'source',
            confidence: 'high',
            cwe: 'CWE-95',
            id: 'RT-CUSTOM-BROKEN',
            pattern: '[',
            remediation: 'Replace it.',
            severity: 'high',
            title: 'Broken regex',
          },
        ],
      },
      {
        customRules: [
          {
            category: 'source',
            confidence: 'high',
            cwe: 'CWE-95',
            id: 'RT-CUSTOM-EMPTY',
            pattern: '.*',
            remediation: 'Replace it.',
            severity: 'high',
            title: 'Empty matcher',
          },
        ],
      },
      {
        customRules: [
          {
            category: 'source',
            confidence: 'high',
            cwe: 'CWE-95',
            id: 'RT-CUSTOM-DUPLICATE',
            pattern: 'eval',
            remediation: 'Replace it.',
            severity: 'high',
            title: 'First duplicate',
          },
          {
            category: 'source',
            confidence: 'high',
            cwe: 'CWE-95',
            id: 'RT-CUSTOM-DUPLICATE',
            pattern: 'Function',
            remediation: 'Replace it.',
            severity: 'high',
            title: 'Second duplicate',
          },
        ],
      },
    ]
    for (const config of configurations) {
      const ctx = new Context()
      contexts.push(ctx)
      await mountServices(ctx, workspaceRoot)
      await expect(ctx.plugin(RedTeamPlugin, { workspaceRoot, ...config })).rejects.toThrow()
    }
  })

  it('accepts local Graphiti and RAGFlow service configuration without storing tokens', async () => {
    const { agent, ctx } = await setup({
      graphitiAuthTokenEnv: 'GRAPHITI_AUTH_TOKEN',
      graphitiUrl: 'http://127.0.0.1:8000',
      knowledgeTimeoutMs: 30_000,
      ragflowApiKeyEnv: 'REDTEAM_RAGFLOW_API_KEY',
      ragflowAssetDatasetId: 'assets',
      ragflowSrcCaseDatasetId: 'src-cases',
      ragflowSourceDatasetId: 'sources',
      ragflowTechniqueDatasetId: 'techniques',
      ragflowUrl: 'http://127.0.0.1:9380',
      ragflowVulnerabilityDatasetId: 'vulnerabilities',
    })
    expect(ctx.tools.schemas(agent)).toHaveLength(19)
    const prompt = await ctx.systemPrompt.assemble({ agent, scope: agent })
    expect(JSON.stringify(prompt)).not.toContain('GRAPHITI_AUTH_TOKEN')
    expect(JSON.stringify(prompt)).not.toContain('REDTEAM_RAGFLOW_API_KEY')
  })

  it('allows explicitly enabled remote HTTPS knowledge services', async () => {
    const { agent, ctx } = await setup({
      allowRemoteKnowledgeServices: true,
      graphitiUrl: 'https://graphiti.example.com/base',
      ragflowUrl: 'https://ragflow.example.com',
    })
    expect(ctx.tools.schemas(agent)).toHaveLength(19)
  })

  it('enables each knowledge service independently', async () => {
    const graphitiSetup = await setup({ graphitiUrl: 'http://127.0.0.1:8000' })
    const graphitiTools = graphitiSetup.ctx.tools
      .schemas(graphitiSetup.agent)
      .map((tool) => tool.name)
    expect(graphitiTools).toHaveLength(19)
    expect(graphitiTools).toContain('redteam_project_recall')
    expect(graphitiTools).toContain('redteam_knowledge_search')
    expect(graphitiTools).toContain('redteam_project_promote')

    const ragflowSetup = await setup({ ragflowUrl: 'http://127.0.0.1:9380' })
    const ragflowTools = ragflowSetup.ctx.tools.schemas(ragflowSetup.agent).map((tool) => tool.name)
    expect(ragflowTools).toHaveLength(19)
    expect(ragflowTools).toContain('redteam_knowledge_search')
    expect(ragflowTools).toContain('redteam_project_start')
    expect(ragflowTools).toContain('redteam_project_promote')
  })

  it('requires a fixed workspace when storage is configured globally', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-redteam-storage-config-'))
    temporaryDirectories.push(workspaceRoot)
    const ctx = new Context()
    contexts.push(ctx)
    await mountServices(ctx, workspaceRoot)
    await expect(
      ctx.plugin(RedTeamPlugin, { storageRoot: join(workspaceRoot, 'custom-storage') }),
    ).rejects.toThrow('storageRoot requires a fixed workspaceRoot')
  })

  it('can place the long-term library in an explicit shared knowledge root', async () => {
    const sharedRoot = await mkdtemp(join(tmpdir(), 'dsh-redteam-shared-knowledge-'))
    temporaryDirectories.push(sharedRoot)
    const { agent, ctx } = await setup({ knowledgeRoot: sharedRoot })
    const written = await ctx.tools.execute({
      agent,
      arguments: {
        content: 'Shared internal source catalog.',
        knowledge_type: 'source',
        title: 'Shared source catalog',
      },
      callId: CallId('shared-knowledge-upsert'),
      name: 'redteam_knowledge_upsert',
      signal,
    })
    expect(written).toMatchObject({ isError: false, value: { created: true } })
    if (written.isError) return
    const id = (written.value as { document: { id: string } }).document.id
    await expect(
      readFile(join(sharedRoot, 'library', 'source', id, 'entry.json'), 'utf8'),
    ).resolves.toContain('Shared source catalog')
  })

  it('can disable the supplemental path guard while retaining DSH delegation', async () => {
    const { agent, ctx } = await setup({ enforceWorkspaceScope: false })
    ctx.tools.register(
      defineTool({
        name: 'unguarded_fixture',
        description: 'test tool',
        parameters: { path: { type: 'string', required: true } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute() {
          return 'delegated'
        },
      }),
    )
    const result = await ctx.tools.execute({
      agent,
      arguments: { path: '../outside.txt' },
      callId: CallId('guard-disabled'),
      name: 'unguarded_fixture',
      signal,
    })
    expect(result).toMatchObject({ isError: false, value: 'delegated' })
  })

  it('reports a clear error when findings are requested before any scan', async () => {
    const { agent, ctx } = await setup()
    const result = await ctx.tools.execute({
      agent,
      arguments: {},
      callId: CallId('findings-before-scan'),
      name: 'redteam_findings',
      signal,
    })
    expect(result.isError).toBe(true)
    if (result.isError) expect(result.error.message).toContain('run redteam_scan first')
  })

  it('keeps ordinary modes clean and follows blank-session mode switches', async () => {
    const { agent, ctx } = await setup({}, true, 'default')
    expect(ctx.tools.schemas(agent)).toEqual([])
    expect(
      (await ctx.systemPrompt.assemble({ agent, scope: agent })).sections.some(
        (section) => section.name === 'dsh-redteam',
      ),
    ).toBe(false)

    ctx.emit('agent-preset/selected', agent.id, 'redteam')
    expect(ctx.tools.schemas(agent)).toHaveLength(19)
    ctx.emit('agent-preset/selected', agent.id, 'default')
    expect(ctx.tools.schemas(agent)).toEqual([])
  })
})
