import { describe, expect, it } from 'vitest'
import {
  assertKnowledgeDocument,
  assertPromotable,
  assertProjectEventId,
  createKnowledgeDocument,
  createKnowledgeId,
  createProjectMemoryEvent,
  parseProjectMemoryEvent,
  renderKnowledgeDocument,
  serializeProjectMemoryEvent,
} from '../src/lib/knowledge.js'

const projectId = 'rtp-20260823010203-a1b2c3d4'

function reusableEvent() {
  return createProjectMemoryEvent({
    authority: 'observed',
    confidence: 'high',
    content: 'The framework version was confirmed. password=do-not-store',
    kind: 'vulnerability',
    occurredAt: '2026-08-23T01:02:03Z',
    projectId,
    promotable: true,
    sensitivity: 'reusable',
    sourceUrls: ['https://example.com/advisory?token=do-not-store#token=fragment-secret'],
    status: 'confirmed',
    tags: ['CVE', 'Framework', 'token=do-not-store'],
    title: 'Confirmed framework issue',
  })
}

describe('project knowledge events', () => {
  it('redacts credentials while preserving exact structured event fields', () => {
    const event = reusableEvent()
    expect(event.content).toContain('password=[redacted]')
    expect(event.content).not.toContain('do-not-store')
    expect(event.sourceUrls[0]).toContain('token=%5Bredacted%5D')
    expect(event.sourceUrls[0]).not.toContain('#')
    expect(event.sourceUrls[0]).not.toContain('fragment-secret')
    expect(event.tags).toEqual(['cve', 'framework', 'token=[redacted]'])
    expect(
      parseProjectMemoryEvent(`system(dsh-redteam): ${serializeProjectMemoryEvent(event)}`),
    ).toEqual(event)
  })

  it('rejects unsafe promotion flags and incompatible long-term types', () => {
    expect(() =>
      createProjectMemoryEvent({
        authority: 'inferred',
        confidence: 'low',
        content: 'Unverified hypothesis.',
        kind: 'finding',
        projectId,
        promotable: true,
        sensitivity: 'reusable',
        status: 'active',
        title: 'Hypothesis',
      }),
    ).toThrow('cannot be marked promotable')
    const event = reusableEvent()
    expect(
      parseProjectMemoryEvent(
        serializeProjectMemoryEvent({ ...event, authority: 'inferred', promotable: true }),
      ),
    ).toBeUndefined()
    expect(() => assertPromotable(reusableEvent(), 'asset')).toThrow('cannot be promoted as asset')
  })

  it('renders a source-bearing document for RAGFlow', () => {
    const document = renderKnowledgeDocument(reusableEvent())
    expect(document).toContain('# Confirmed framework issue')
    expect(document).toContain('https://example.com/advisory')
    expect(document).toContain('知识条目 ID')
  })

  it('rejects malformed project fields, timestamps, sources, and oversized tags', () => {
    const base = {
      authority: 'observed' as const,
      confidence: 'medium' as const,
      content: 'Observation.',
      kind: 'note' as const,
      projectId,
      promotable: false,
      sensitivity: 'internal' as const,
      status: 'active' as const,
      title: 'Observation',
    }
    expect(() => createProjectMemoryEvent({ ...base, projectId: 'invalid' })).toThrow(
      'invalid project id',
    )
    expect(() => createProjectMemoryEvent({ ...base, occurredAt: 'not-a-date' })).toThrow(
      'valid timestamp',
    )
    expect(() => createProjectMemoryEvent({ ...base, title: ' ' })).toThrow('between 1 and 200')
    expect(() =>
      createProjectMemoryEvent({ ...base, sourceUrls: ['ftp://example.com/reference'] }),
    ).toThrow('must be HTTP(S)')
    expect(() =>
      createProjectMemoryEvent({ ...base, sourceUrls: ['https://user:pass@example.com'] }),
    ).toThrow('must not contain credentials')
    expect(() => createProjectMemoryEvent({ ...base, tags: Array(21).fill('tag') })).toThrow(
      'at most 20',
    )
    expect(parseProjectMemoryEvent('not a dsh-redteam event')).toBeUndefined()
    expect(parseProjectMemoryEvent('dsh-redteam-memory:{broken')).toBeUndefined()
  })

  it('validates project event ids and canonical knowledge document identities', () => {
    const event = reusableEvent()
    expect(() => assertProjectEventId(event.eventId)).not.toThrow()
    expect(() => assertProjectEventId('../event')).toThrow('invalid project event id')

    const relatedId = createKnowledgeId('asset', 'example.com')
    const document = createKnowledgeDocument(
      {
        authority: 'authoritative',
        confidence: 'high',
        content: 'Reusable defensive validation guidance.',
        key: 'validation-guidance',
        relatedUris: [`redteam://knowledge/asset/${relatedId}`],
        sensitivity: 'reusable',
        status: 'confirmed',
        title: 'Validation guidance',
        type: 'technique',
      },
      undefined,
      new Date('2026-08-23T01:02:03Z'),
    )
    expect(() => assertKnowledgeDocument(document)).not.toThrow()

    const tamperedId = 'kb-00000000000000000000'
    expect(() =>
      assertKnowledgeDocument({
        ...document,
        id: tamperedId,
        uri: `redteam://knowledge/technique/${tamperedId}`,
      }),
    ).toThrow('invalid schema')
    expect(() =>
      assertKnowledgeDocument({
        ...document,
        relatedUris: [`redteam://assets/asset/${relatedId}`],
      }),
    ).toThrow('invalid schema')
    expect(() =>
      createKnowledgeDocument({
        authority: 'authoritative',
        confidence: 'high',
        content: 'Reusable defensive validation guidance.',
        relatedUris: [`redteam://knowledge/asset/${relatedId}/`],
        sensitivity: 'reusable',
        status: 'confirmed',
        title: 'Invalid related URI',
        type: 'technique',
      }),
    ).toThrow('canonical redteam URI')
  })
})
