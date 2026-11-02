import { mkdir, mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createKnowledgeId, createProjectMemoryEvent } from '../src/lib/knowledge.js'
import { LocalKnowledgeStore } from '../src/lib/local-knowledge-store.js'
import type { KnowledgeDocumentInput } from '../src/lib/types.js'

const temporaryDirectories: string[] = []
const projectId = 'rtp-20260823010203-a1b2c3d4'

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true })
    }),
  )
})

async function fixture(maxDocuments = 100, maxProjectEvents = 100) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-redteam-local-kb-'))
  temporaryDirectories.push(root)
  return { root, store: new LocalKnowledgeStore(root, maxDocuments, maxProjectEvents) }
}

function vulnerability(overrides: Partial<KnowledgeDocumentInput> = {}): KnowledgeDocumentInput {
  return {
    authority: 'authoritative',
    confidence: 'high',
    content: `CVE-2026-12345 affects Example Gateway 4.2 on Linux.\n远程代码执行需要特定代理配置。\n${'Environment-specific validation notes. '.repeat(12)}\npassword=do-not-store`,
    environments: ['Linux', 'Reverse proxy'],
    identifiers: ['CVE-2026-12345', 'CWE-78'],
    key: 'CVE-2026-12345',
    products: ['Example Gateway'],
    sensitivity: 'reusable',
    sourceUrls: ['https://example.com/advisory?token=do-not-store'],
    status: 'confirmed',
    tags: ['RCE', 'Gateway'],
    title: 'Example Gateway remote code execution',
    type: 'vulnerability',
    versions: ['4.2'],
    ...overrides,
  }
}

describe('built-in OpenViking-style knowledge store', () => {
  it('persists L0/L1/L2 content separately from a rebuildable hybrid index', async () => {
    const { root, store } = await fixture()
    const inserted = await store.upsert(vulnerability({ expectedRevision: 0 }))
    expect(inserted).toMatchObject({
      created: true,
      document: {
        identifiers: ['cve-2026-12345', 'cwe-78'],
        revision: 1,
        type: 'vulnerability',
      },
    })
    expect(inserted.document.uri).toMatch(/^redteam:\/\/knowledge\/vulnerability\/kb-/u)

    const l0 = await store.read(inserted.document.uri, 0)
    const l1 = await store.read(inserted.document.id, 1)
    const l2 = await store.read(inserted.document.uri, 2)
    expect(l0.content.length).toBeLessThan(l2.content.length)
    expect(l1.content).toContain('CVE-2026-12345')
    expect(l2.content).toContain('password=[redacted]')
    expect(l2.content).not.toContain('do-not-store')
    expect(l2.sourceUrls[0]).toContain('token=%5Bredacted%5D')

    await expect(store.search('CVE-2026-12345', ['vulnerability'], 10)).resolves.toMatchObject({
      chunks: [
        {
          id: inserted.document.id,
          level: 1,
          source: 'builtin',
          type: 'vulnerability',
        },
      ],
    })
    await expect(store.search('远程代码执行', ['vulnerability'], 10)).resolves.toMatchObject({
      chunks: [{ id: inserted.document.id }],
    })
    await expect(store.search('代码', ['vulnerability'], 10)).resolves.toMatchObject({
      chunks: [{ id: inserted.document.id }],
    })
    await expect(
      store.search('" OR 1=1; DROP TABLE documents_fts; --', ['vulnerability'], 10),
    ).resolves.toMatchObject({ chunks: [] })
    await expect(store.search('   ', ['vulnerability'], 10)).rejects.toThrow('query')
    await expect(store.grep('CVE-2026-12345', ['vulnerability'], 10)).resolves.toMatchObject({
      matches: [{ line: 1, uri: inserted.document.uri }],
    })
    await expect(store.tree(undefined, 10)).resolves.toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({ childCount: 1, uri: 'redteam://knowledge/vulnerability' }),
      ]),
    })
    await expect(store.tree('redteam://knowledge/vulnerability', 10)).resolves.toMatchObject({
      nodes: [{ kind: 'document', uri: inserted.document.uri }],
    })

    const indexPath = join(root, 'index', 'knowledge.sqlite3')
    expect((await stat(root)).mode & 0o777).toBe(0o700)
    expect((await stat(join(root, '.dsh-redteam-knowledge'))).mode & 0o777).toBe(0o600)
    expect(
      (await stat(join(root, 'library', 'vulnerability', inserted.document.id))).mode & 0o777,
    ).toBe(0o700)
    expect(
      (await stat(join(root, 'library', 'vulnerability', inserted.document.id, 'entry.json')))
        .mode & 0o777,
    ).toBe(0o600)
    expect((await stat(indexPath)).mode & 0o777).toBe(0o600)
    await unlink(indexPath)
    await expect(store.search('Example Gateway', ['vulnerability'], 10)).resolves.toMatchObject({
      chunks: [{ id: inserted.document.id }],
    })
    expect((await store.status()).documentCount).toBe(1)
    const restarted = new LocalKnowledgeStore(root, 100, 100)
    await expect(restarted.read(inserted.document.id, 2)).resolves.toMatchObject({
      revision: 1,
      title: 'Example Gateway remote code execution',
    })
  })

  it('uses stable keys, optimistic revisions, validation, and hard document limits', async () => {
    const { root, store } = await fixture(1)
    const first = await store.upsert(vulnerability({ expectedRevision: 0 }))
    const updated = await store.upsert(
      vulnerability({ content: 'Updated CVE-2026-12345 guidance.', expectedRevision: 1 }),
    )
    expect(updated).toMatchObject({
      created: false,
      document: { id: first.document.id, revision: 2 },
    })
    await expect(
      readFile(
        join(root, 'library', 'vulnerability', first.document.id, 'revisions', '00000001.json'),
        'utf8',
      ),
    ).resolves.toContain('CVE-2026-12345')
    await expect(store.upsert(vulnerability({ expectedRevision: 1 }))).rejects.toThrow(
      'revision conflict',
    )
    await expect(
      store.upsert(vulnerability({ key: 'CVE-2026-99999', title: 'Another issue' })),
    ).rejects.toThrow('document limit')
    await expect(
      store.upsert(vulnerability({ sourceUrls: ['https://user:pass@example.com/advisory'] })),
    ).rejects.toThrow('must not contain credentials')
    await expect(
      store.upsert(vulnerability({ relatedUris: ['https://example.com/not-redteam'] })),
    ).rejects.toThrow('redteam URI')
    await expect(store.upsert(vulnerability({ sensitivity: 'restricted' }))).rejects.toThrow(
      'restricted project material',
    )
    await expect(
      store.read('redteam://knowledge/unknown/kb-deadbeefdeadbeefdead', 1),
    ).rejects.toThrow('knowledge reference')
  })

  it('derives lookup and persisted ids from the same redacted stable key', async () => {
    const { root, store } = await fixture()
    const first = await store.upsert(
      vulnerability({ expectedRevision: 0, key: 'gateway token=do-not-store' }),
    )
    await expect(
      store.upsert(vulnerability({ expectedRevision: 0, key: 'gateway token=do-not-store' })),
    ).rejects.toThrow('revision conflict')
    const second = await store.upsert(
      vulnerability({ expectedRevision: 1, key: 'gateway token=do-not-store' }),
    )
    expect(second).toMatchObject({
      created: false,
      document: { id: first.document.id, revision: 2 },
    })
    await expect(
      readFile(
        join(root, 'library', 'vulnerability', first.document.id, 'revisions', '00000001.json'),
        'utf8',
      ),
    ).resolves.not.toContain('do-not-store')
  })

  it('serializes optimistic revisions across store instances sharing one root', async () => {
    const { root, store } = await fixture()
    const other = new LocalKnowledgeStore(root, 100, 100)
    const first = await store.upsert(vulnerability({ expectedRevision: 0 }))
    const updates = await Promise.allSettled([
      store.upsert(vulnerability({ content: 'Update from workspace A.', expectedRevision: 1 })),
      other.upsert(vulnerability({ content: 'Update from workspace B.', expectedRevision: 1 })),
    ])
    expect(updates.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(updates.filter((result) => result.status === 'rejected')).toHaveLength(1)
    await expect(store.read(first.document.id, 2)).resolves.toMatchObject({ revision: 2 })
  })

  it('rejects pre-existing symlink paths and ignores unrelated directory entries', async () => {
    const { root, store } = await fixture()
    const external = await mkdtemp(join(tmpdir(), 'dsh-redteam-kb-outside-'))
    temporaryDirectories.push(external)
    const id = createKnowledgeId('vulnerability', 'CVE-2026-12345')
    await mkdir(join(root, 'library', 'vulnerability'), { recursive: true })
    await writeFile(join(root, 'library', 'vulnerability', '.DS_Store'), 'metadata')
    await symlink(external, join(root, 'library', 'vulnerability', id))
    await expect(store.upsert(vulnerability())).rejects.toThrow('symbolic links')
    await expect(readFile(join(external, 'entry.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await unlink(join(root, 'library', 'vulnerability', id))
    await expect(store.status()).resolves.toMatchObject({ available: true, documentCount: 0 })
  })

  it('rejects a symlinked knowledge root or missing root beneath a symlink', async () => {
    const container = await mkdtemp(join(tmpdir(), 'dsh-redteam-kb-root-'))
    const external = await mkdtemp(join(tmpdir(), 'dsh-redteam-kb-root-target-'))
    temporaryDirectories.push(container, external)
    const linkedRoot = join(container, 'knowledge-link')
    await symlink(external, linkedRoot)
    await expect(
      new LocalKnowledgeStore(linkedRoot, 100, 100).upsert(vulnerability()),
    ).rejects.toThrow('symbolic links')
    await expect(
      new LocalKnowledgeStore(join(linkedRoot, 'nested'), 100, 100).upsert(vulnerability()),
    ).rejects.toThrow('symbolic links')
    await expect(readFile(join(external, 'entry.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await expect(stat(join(external, 'nested'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not follow a final entry symlink during authoritative reads', async () => {
    const { root, store } = await fixture()
    await store.status()
    const externalDirectory = await mkdtemp(join(tmpdir(), 'dsh-redteam-kb-entry-target-'))
    temporaryDirectories.push(externalDirectory)
    const external = join(externalDirectory, 'entry.json')
    await writeFile(external, '{"outside":true}')
    const id = createKnowledgeId('vulnerability', 'CVE-2026-12345')
    const directory = join(root, 'library', 'vulnerability', id)
    await mkdir(directory, { recursive: true })
    await symlink(external, join(directory, 'entry.json'))
    await expect(store.read(id, 2)).rejects.toThrow()
    await expect(readFile(external, 'utf8')).resolves.toBe('{"outside":true}')
  })

  it('stores only explicit structured project events with isolation, idempotence, and limits', async () => {
    const { root, store } = await fixture(10, 1)
    const event = createProjectMemoryEvent({
      authority: 'observed',
      confidence: 'medium',
      content: 'Observed nginx 1.24. password=do-not-store',
      kind: 'asset',
      projectId,
      promotable: false,
      sensitivity: 'internal',
      status: 'active',
      tags: ['nginx'],
      title: 'Gateway fingerprint',
    })
    await store.appendProjectEvent(event)
    await store.appendProjectEvent(event)
    await expect(store.projectEvent(projectId, event.eventId)).resolves.toMatchObject({
      eventId: event.eventId,
      projectId,
    })
    await expect(store.projectEvents(projectId, 'nginx', 10)).resolves.toMatchObject([
      { eventId: event.eventId, projectId },
    ])
    await expect(
      store.projectEvents('rtp-20260823010203-deadbeef', undefined, 10),
    ).resolves.toEqual([])
    const second = createProjectMemoryEvent({
      authority: 'observed',
      confidence: 'low',
      content: 'Second observation.',
      kind: 'note',
      projectId,
      promotable: false,
      sensitivity: 'internal',
      status: 'active',
      title: 'Second',
    })
    await expect(store.appendProjectEvent(second)).rejects.toThrow('memory limit')
    const stored = await readFile(
      join(root, 'projects', projectId, 'events', `${event.eventId}.json`),
      'utf8',
    )
    expect(stored).toContain('password=[redacted]')
    expect(stored).not.toContain('do-not-store')
    await expect(store.status()).resolves.toMatchObject({
      available: true,
      eventCount: 1,
      projectCount: 1,
    })
  })

  it('rebuilds a corrupt derived index from authoritative JSON documents', async () => {
    const { root, store } = await fixture()
    const inserted = await store.upsert(vulnerability())
    await writeFile(join(root, 'index', 'knowledge.sqlite3'), 'not-a-database')
    await expect(store.search('gateway', ['vulnerability'], 10)).resolves.toMatchObject({
      chunks: [{ id: inserted.document.id }],
    })
    expect(['ready', 'rebuilt']).toContain((await store.status()).indexState)
  })

  it('reports grep columns against the original line after normalization', async () => {
    const { store } = await fixture()
    await store.upsert(vulnerability({ content: 'xx  ﬀoo   BAR' }))
    await expect(store.grep('ffoo bar', ['vulnerability'], 10)).resolves.toMatchObject({
      matches: [{ column: 5, line: 1, snippet: 'xx  ﬀoo   BAR' }],
    })
  })

  it('rejects tampered authoritative JSON that bypasses the write-time redactor', async () => {
    const { root, store } = await fixture()
    const inserted = await store.upsert(vulnerability())
    const path = join(root, 'library', 'vulnerability', inserted.document.id, 'entry.json')
    const document = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    document.content = 'password=plain-text-secret'
    await writeFile(path, JSON.stringify(document))
    await expect(store.read(inserted.document.id, 2)).rejects.toThrow('invalid schema')
    await expect(store.status()).resolves.toMatchObject({ available: false })
  })
})
