import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GraphitiClient,
  normalizeKnowledgeBaseUrl,
  RagFlowClient,
} from '../src/lib/knowledge-clients.js'
import { createProjectMemoryEvent, serializeProjectMemoryEvent } from '../src/lib/knowledge.js'

const projectId = 'rtp-20260823010203-a1b2c3d4'
const otherProjectId = 'rtp-20260823010203-deadbeef'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

function event(resolvedProjectId = projectId) {
  return createProjectMemoryEvent({
    authority: 'authoritative',
    confidence: 'high',
    content: 'Confirmed reusable technique.',
    kind: 'technique',
    occurredAt: '2026-08-23T01:02:03Z',
    projectId: resolvedProjectId,
    promotable: true,
    sensitivity: 'reusable',
    status: 'resolved',
    tags: ['http'],
    title: 'Reusable validation technique',
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('knowledge service clients', () => {
  it('writes and recalls exact Graphiti events alongside derived facts', async () => {
    const memory = event()
    const foreignMemory = event(otherProjectId)
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.endsWith('/messages')) return jsonResponse({ success: true })
      if (url.includes('/episodes/')) {
        return jsonResponse([
          { content: `system(dsh-redteam): ${serializeProjectMemoryEvent(memory)}` },
          { content: `system(dsh-redteam): ${serializeProjectMemoryEvent(foreignMemory)}` },
        ])
      }
      if (url.endsWith('/search')) {
        return jsonResponse({
          facts: [
            {
              episodes: [memory.eventId],
              fact: 'Technique applies to HTTP stacks.',
              uuid: 'fact-1',
              valid_at: '2026-08-23T01:02:03Z',
            },
          ],
        })
      }
      return jsonResponse({ status: 'healthy' })
    })
    const client = new GraphitiClient(
      { baseUrl: 'http://127.0.0.1:8000/', timeoutMs: 1_000 },
      fetcher,
    )
    await expect(client.addEvent(memory)).resolves.toBe(memory.eventId)
    const recalled = await client.recall(projectId, 'HTTP', 10)
    expect(recalled).toMatchObject({
      events: [{ eventId: memory.eventId }],
      facts: [{ id: 'fact-1' }],
      projectId,
    })
    expect(recalled.events.map(({ eventId }) => eventId)).toEqual([memory.eventId])
  })

  it('promotes reviewed memory and searches configured RAGFlow datasets', async () => {
    vi.stubEnv('TEST_RAGFLOW_KEY', 'private-key')
    const requests: Array<{ authorization: string | null; body: string; url: string }> = []
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      const headers = new Headers(init?.headers)
      requests.push({
        authorization: headers.get('authorization'),
        body: typeof init?.body === 'string' ? init.body : '',
        url,
      })
      if (url.includes('documents?type=empty'))
        return jsonResponse({ code: 0, data: { id: 'doc-1' } })
      if (url.endsWith('/chunks'))
        return jsonResponse({ code: 0, data: { chunk: { id: 'chunk-1' } } })
      if (url.endsWith('/retrieval')) {
        return jsonResponse({
          code: 0,
          data: {
            chunks: [
              {
                content: 'Reusable validation technique.',
                doc_id: 'doc-1',
                docnm_kwd: 'technique.md',
                id: 'chunk-1',
                similarity: 0.91,
              },
            ],
          },
        })
      }
      return jsonResponse({ code: 0, data: [] })
    })
    const client = new RagFlowClient(
      {
        authTokenEnv: 'TEST_RAGFLOW_KEY',
        baseUrl: 'http://127.0.0.1:9380/',
        datasets: { technique: 'dataset-techniques' },
        timeoutMs: 1_000,
      },
      fetcher,
    )
    const memory = event()
    await expect(client.promote(projectId, memory.eventId, memory, 'technique')).resolves.toEqual({
      chunkId: 'chunk-1',
      datasetId: 'dataset-techniques',
      documentId: 'doc-1',
      episodeId: memory.eventId,
      knowledgeType: 'technique',
      projectId,
    })
    await expect(client.search('HTTP', ['technique'], 10)).resolves.toMatchObject({
      chunks: [{ documentId: 'doc-1', id: 'chunk-1', similarity: 0.91 }],
      datasetTypes: ['technique'],
    })
    expect(requests.every((request) => request.authorization === 'Bearer private-key')).toBe(true)
    expect(requests.map((request) => request.body).join('\n')).not.toContain('private-key')
  })

  it('allows loopback HTTP but requires explicit HTTPS for remote services', () => {
    expect(normalizeKnowledgeBaseUrl('graphitiUrl', 'http://127.0.0.1:8000', false)).toBe(
      'http://127.0.0.1:8000/',
    )
    expect(() =>
      normalizeKnowledgeBaseUrl('graphitiUrl', 'http://graphiti.internal', true),
    ).toThrow('must be loopback')
    expect(normalizeKnowledgeBaseUrl('ragflowUrl', 'https://kb.example.com', true)).toBe(
      'https://kb.example.com/',
    )
  })
})
