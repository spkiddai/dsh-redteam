import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphitiClient, RagFlowClient } from '../src/lib/knowledge-clients.js'
import { createProjectMemoryEvent } from '../src/lib/knowledge.js'
import { RedTeamRuntime } from '../src/lib/runtime.js'
import type { ProjectMemoryEvent, RedTeamOptions } from '../src/lib/types.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true })
    }),
  )
})

async function runtime(
  withServices = true,
  overrides: Partial<RedTeamOptions> = {},
): Promise<RedTeamRuntime> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-redteam-knowledge-'))
  temporaryDirectories.push(workspaceRoot)
  const options: RedTeamOptions = {
    assetGraphMaxDepth: 3,
    assetGraphMaxEdges: 100,
    assetGraphMaxNodes: 100,
    assetGraphMaxSources: 100,
    categories: ['configuration'],
    enforceWorkspaceScope: true,
    ignoreDirectories: [],
    maxFileBytes: 10_000,
    maxFiles: 10,
    maxFindings: 10,
    storageRoot: join(workspaceRoot, '.dsh-redteam'),
    workspaceRoot,
    ...(withServices
      ? {
          graphiti: { baseUrl: 'http://127.0.0.1:8000/', timeoutMs: 1_000 },
          ragflow: {
            authTokenEnv: 'TEST_RAGFLOW_KEY',
            baseUrl: 'http://127.0.0.1:9380/',
            datasets: { technique: 'technique-dataset' },
            timeoutMs: 1_000,
          },
        }
      : {}),
    ...overrides,
  }
  return new RedTeamRuntime(options)
}

describe('knowledge runtime orchestration', () => {
  it('keeps local knowledge authoritative while using Graphiti and RAGFlow as extensions', async () => {
    const memories: ProjectMemoryEvent[] = []
    vi.spyOn(GraphitiClient.prototype, 'health').mockResolvedValue(true)
    vi.spyOn(RagFlowClient.prototype, 'health').mockResolvedValue(true)
    vi.spyOn(GraphitiClient.prototype, 'addEvent').mockImplementation(async (memory) => {
      memories.push(memory)
      return memory.eventId
    })
    vi.spyOn(GraphitiClient.prototype, 'recall').mockImplementation(async (projectId, query) => ({
      events: memories.filter((memory) => memory.projectId === projectId),
      facts:
        query === undefined ? [] : [{ episodeIds: [], fact: `matched ${query}`, id: 'fact-1' }],
      projectId,
    }))
    vi.spyOn(RagFlowClient.prototype, 'search').mockResolvedValue({
      chunks: [{ content: 'Historical technique', id: 'chunk-1' }],
      datasetTypes: ['technique'],
    })
    vi.spyOn(RagFlowClient.prototype, 'promote').mockImplementation(
      async (projectId, episodeId, _event, knowledgeType) => ({
        chunkId: 'chunk-1',
        datasetId: 'technique-dataset',
        documentId: 'doc-1',
        episodeId,
        knowledgeType,
        projectId,
      }),
    )

    const redteam = await runtime()
    await expect(redteam.knowledgeStatus()).resolves.toMatchObject({
      currentProject: null,
      graphiti: { configured: true, reachable: true },
      local: { available: true, documentCount: 0, projectCount: 0 },
      ragflow: { configured: true, datasetTypes: ['technique'], reachable: true },
    })
    const project = await redteam.startProject('SRC 2026', undefined)
    expect(project.projectId).toMatch(/^rtp-/u)
    await expect(redteam.status()).resolves.toMatchObject({ currentProjectId: project.projectId })

    const remembered = await redteam.rememberProject(
      undefined,
      'technique',
      'Reusable HTTP validation',
      'Confirmed without a destructive payload.',
      'authoritative',
      'high',
      'resolved',
      'reusable',
      true,
      ['http'],
      ['https://example.com/reference'],
      '2026-08-23T01:02:03Z',
    )
    await expect(redteam.recallProject(project.projectId, 'HTTP', 10)).resolves.toMatchObject({
      events: expect.arrayContaining([expect.objectContaining({ eventId: remembered.episodeId })]),
      facts: [{ id: 'fact-1' }],
    })
    await expect(redteam.searchKnowledge('HTTP', ['technique'], 5)).resolves.toMatchObject({
      chunks: [{ id: 'chunk-1' }],
    })
    await expect(
      redteam.promoteProjectMemory(undefined, remembered.episodeId, 'technique'),
    ).resolves.toMatchObject({
      datasetId: 'builtin:technique',
      projectId: project.projectId,
      ragflow: { chunkId: 'chunk-1', documentId: 'doc-1' },
      uri: expect.stringMatching(/^redteam:\/\/knowledge\/technique\/kb-/u),
    })
    await expect(redteam.knowledgeStatus()).resolves.toMatchObject({
      currentProject: { name: 'SRC 2026', projectId: project.projectId },
    })
  })

  it('runs the full project-to-library workflow with no external service', async () => {
    const redteam = await runtime(false)
    const project = await redteam.startProject('Local SRC', 'Authorized local review')
    const remembered = await redteam.rememberProject(
      project.projectId,
      'vulnerability',
      'CVE-2026-43210 validation',
      'Confirmed on Example Gateway 4.2 in a non-destructive test.',
      'authoritative',
      'high',
      'confirmed',
      'reusable',
      true,
      ['cve-2026-43210', 'example-gateway'],
      ['https://example.com/CVE-2026-43210'],
      undefined,
    )
    await expect(redteam.recallProject(undefined, 'Gateway', 10)).resolves.toMatchObject({
      events: [{ eventId: remembered.episodeId }],
      facts: [],
    })
    const promoted = await redteam.promoteProjectMemory(
      project.projectId,
      remembered.episodeId,
      'vulnerability',
    )
    await expect(
      redteam.searchKnowledge('CVE-2026-43210', ['vulnerability'], 5),
    ).resolves.toMatchObject({
      chunks: [{ id: promoted.documentId, source: 'builtin' }],
    })
    await expect(redteam.readKnowledge(promoted.documentId, 2)).resolves.toMatchObject({
      eventIds: [remembered.episodeId],
      type: 'vulnerability',
    })
    await expect(redteam.knowledgeStatus()).resolves.toMatchObject({
      graphiti: { configured: false },
      local: { documentCount: 1, eventCount: 2, projectCount: 1 },
      ragflow: { configured: false },
    })
  })

  it('keeps local project events authoritative and rejects cross-project Graphiti events', async () => {
    vi.spyOn(GraphitiClient.prototype, 'addEvent').mockImplementation(
      async (memory) => memory.eventId,
    )
    const redteam = await runtime()
    const project = await redteam.startProject('Isolated project', undefined)
    const remembered = await redteam.rememberProject(
      project.projectId,
      'note',
      'Local observation',
      'Locally persisted content.',
      'observed',
      'high',
      'confirmed',
      'internal',
      false,
      ['local'],
      [],
      undefined,
    )
    const foreign = createProjectMemoryEvent({
      authority: 'observed',
      confidence: 'high',
      content: 'Must not cross the project boundary.',
      kind: 'note',
      projectId: 'rtp-20260823010203-deadbeef',
      promotable: false,
      sensitivity: 'internal',
      status: 'confirmed',
      title: 'Foreign observation',
    })
    const remoteDuplicate = { ...remembered.event, title: 'Remote replacement attempt' }
    vi.spyOn(GraphitiClient.prototype, 'recall').mockResolvedValue({
      events: [remoteDuplicate, foreign],
      facts: [],
      projectId: project.projectId,
    })

    const recalled = await redteam.recallProject(project.projectId, undefined, 10)
    expect(recalled.events.some(({ eventId }) => eventId === foreign.eventId)).toBe(false)
    expect(recalled.events.find(({ eventId }) => eventId === remembered.episodeId)?.title).toBe(
      'Local observation',
    )
  })

  it('interleaves bounded local and RAGFlow search results', async () => {
    vi.spyOn(RagFlowClient.prototype, 'search').mockResolvedValue({
      chunks: [{ content: 'Remote HTTP technique.', id: 'remote-http', similarity: 0.99 }],
      datasetTypes: ['technique'],
    })
    const redteam = await runtime()
    for (const suffix of ['alpha', 'beta']) {
      await redteam.upsertKnowledge({
        authority: 'authoritative',
        confidence: 'high',
        content: `HTTP validation technique ${suffix}.`,
        key: `http-${suffix}`,
        sensitivity: 'reusable',
        status: 'confirmed',
        title: `HTTP ${suffix}`,
        type: 'technique',
      })
    }

    const result = await redteam.searchKnowledge('HTTP', ['technique'], 2)
    expect(result.chunks).toHaveLength(2)
    expect(result.chunks.map(({ source }) => source)).toEqual(['builtin', 'ragflow'])
    expect(result.chunks[1]).toMatchObject({ id: 'remote-http', source: 'ragflow' })
  })

  it('promotes by direct local event lookup instead of a bounded project scan', async () => {
    const redteam = await runtime(false)
    const project = await redteam.startProject('Direct lookup', undefined)
    const remembered = await redteam.rememberProject(
      project.projectId,
      'technique',
      'Directly addressable technique',
      'Confirmed reusable technique.',
      'authoritative',
      'high',
      'resolved',
      'reusable',
      true,
      [],
      [],
      undefined,
    )
    vi.spyOn(redteam.localKnowledge, 'projectEvents').mockResolvedValue([])

    await expect(
      redteam.promoteProjectMemory(project.projectId, remembered.episodeId, 'technique'),
    ).resolves.toMatchObject({ episodeId: remembered.episodeId })
  })

  it('bounds remote promotion fallback and rejects a mismatched project event', async () => {
    vi.spyOn(GraphitiClient.prototype, 'addEvent').mockImplementation(
      async (memory) => memory.eventId,
    )
    const redteam = await runtime(true, { knowledgeMaxProjectEvents: 37 })
    const project = await redteam.startProject('Remote fallback', undefined)
    const foreign = createProjectMemoryEvent({
      authority: 'authoritative',
      confidence: 'high',
      content: 'Confirmed reusable technique from another project.',
      kind: 'technique',
      projectId: 'rtp-20260823010203-deadbeef',
      promotable: true,
      sensitivity: 'reusable',
      status: 'resolved',
      title: 'Foreign technique',
    })
    const recall = vi.spyOn(GraphitiClient.prototype, 'recall').mockResolvedValue({
      events: [foreign],
      facts: [],
      projectId: project.projectId,
    })

    await expect(
      redteam.promoteProjectMemory(project.projectId, foreign.eventId, 'technique'),
    ).rejects.toThrow('episode not found')
    expect(recall).toHaveBeenCalledWith(project.projectId, undefined, 37, undefined)
  })

  it('reports failed service health without leaking or throwing', async () => {
    vi.spyOn(GraphitiClient.prototype, 'health').mockRejectedValue(new Error('offline'))
    vi.spyOn(RagFlowClient.prototype, 'health').mockRejectedValue(new Error('offline'))
    vi.spyOn(GraphitiClient.prototype, 'addEvent').mockRejectedValue(new Error('offline'))
    vi.spyOn(GraphitiClient.prototype, 'recall').mockRejectedValue(new Error('offline'))
    vi.spyOn(RagFlowClient.prototype, 'promote').mockRejectedValue(new Error('offline'))
    vi.spyOn(RagFlowClient.prototype, 'search').mockRejectedValue(new Error('offline'))
    const redteam = await runtime()
    await expect(redteam.knowledgeStatus()).resolves.toMatchObject({
      graphiti: { reachable: false },
      local: { available: true },
      ragflow: { reachable: false },
    })
    const project = await redteam.startProject('Offline extensions', undefined)
    expect(project.extensionWarnings).toEqual([
      'Graphiti mirror unavailable; the project was saved locally.',
    ])
    const remembered = await redteam.rememberProject(
      project.projectId,
      'technique',
      'Local technique',
      'Confirmed local-only technique.',
      'authoritative',
      'high',
      'resolved',
      'reusable',
      true,
      [],
      [],
      undefined,
    )
    expect(remembered.extensionWarnings).toEqual([
      'Graphiti mirror unavailable; the event was saved locally.',
    ])
    await expect(redteam.recallProject(project.projectId, undefined, 10)).resolves.toMatchObject({
      events: expect.arrayContaining([expect.objectContaining({ eventId: remembered.episodeId })]),
      extensionWarnings: ['Graphiti recall unavailable; returned local project events only.'],
      facts: [],
    })
    await expect(
      redteam.promoteProjectMemory(project.projectId, remembered.episodeId, 'technique'),
    ).resolves.toMatchObject({
      datasetId: 'builtin:technique',
      extensionWarnings: ['RAGFlow mirror unavailable; the knowledge document was saved locally.'],
    })
    await expect(redteam.searchKnowledge('technique', ['technique'], 5)).resolves.toMatchObject({
      extensionWarnings: ['RAGFlow search unavailable; returned built-in results only.'],
    })
  })
})
