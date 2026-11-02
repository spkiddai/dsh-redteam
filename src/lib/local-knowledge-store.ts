import { randomUUID } from 'node:crypto'
import { constants as fileConstants, type Dirent } from 'node:fs'
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises'
import { dirname, join, parse, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import {
  assertKnowledgeDocument,
  assertProjectEventId,
  assertProjectId,
  assertProjectMemoryEvent,
  boundedKnowledgeText,
  createKnowledgeDocument,
  createKnowledgeId,
  knowledgeDocumentSummary,
  knowledgeLevelContent,
  parseKnowledgeReference,
  renderKnowledgeDocument,
} from './knowledge.js'
import { redactEvidence } from './redact.js'
import { atomicWritePrivate } from './store.js'
import type {
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgeGrepResult,
  KnowledgeIndexState,
  KnowledgeReadLevel,
  KnowledgeReadResult,
  KnowledgeSearchResult,
  KnowledgeTreeNode,
  KnowledgeTreeResult,
  KnowledgeUpsertResult,
  LongTermKnowledgeChunk,
  LongTermKnowledgeType,
  ProjectMemoryEvent,
} from './types.js'

const INDEX_VERSION = 1
const KNOWLEDGE_ID = /^kb-[a-f0-9]{20}$/u
const EVENT_FILE =
  /^([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.json$/iu
const WRITE_LOCK_TIMEOUT_MS = 10_000
const ROOT_MARKER = '.dsh-redteam-knowledge'
const ROOT_MARKER_CONTENT = 'dsh-redteam built-in knowledge root v1\n'
const KNOWLEDGE_TYPES: readonly LongTermKnowledgeType[] = [
  'asset',
  'vulnerability',
  'technique',
  'src_case',
  'source',
]

interface LocalKnowledgeStatus {
  readonly available: boolean
  readonly documentCount: number
  readonly projectCount: number
  readonly eventCount: number
  readonly indexVersion: number
  readonly indexState: KnowledgeIndexState
}

interface IndexedRow {
  readonly id: string
  readonly type: string
  readonly rank?: number
}

function isMissing(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

function hasCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replaceAll(/\s+/gu, ' ').trim()
}

function normalizedColumn(value: string, needle: string): number {
  let text = ''
  const offsets: number[] = []
  let offset = 0
  for (const character of value) {
    const transformed = character.normalize('NFKC').toLowerCase()
    for (const normalizedCharacter of transformed) {
      if (/\s/u.test(normalizedCharacter)) {
        if (text === '' || text.endsWith(' ')) continue
        text += ' '
        offsets.push(offset)
      } else {
        text += normalizedCharacter
        offsets.push(offset)
      }
    }
    offset += character.length
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1)
    offsets.pop()
  }
  const found = text.indexOf(needle)
  return found < 0 ? -1 : (offsets[found] ?? -1)
}

function occurrences(haystack: string, needle: string): number {
  if (needle === '') return 0
  let count = 0
  let offset = 0
  while (count < 20) {
    const found = haystack.indexOf(needle, offset)
    if (found < 0) break
    count += 1
    offset = found + Math.max(1, needle.length)
  }
  return count
}

function queryTerms(query: string): string[] {
  const normalized = normalize(query)
  const terms: string[] = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}._:/@+-]*/gu) ?? []
  if (!normalized.includes(' ')) terms.push(normalized)
  return [...new Set(terms)].filter((term) => [...term].length >= 2).slice(0, 20)
}

function ftsQuery(query: string): string | undefined {
  const terms = queryTerms(query).filter((term) => [...term].length >= 3)
  if (terms.length === 0) return undefined
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ')
}

function documentScore(document: KnowledgeDocument, query: string, rank = 0): number {
  const normalizedQuery = normalize(query)
  const fields: ReadonlyArray<readonly [string, number]> = [
    [document.title, 14],
    [document.key, 13],
    [document.identifiers.join(' '), 16],
    [document.aliases.join(' '), 10],
    [document.tags.join(' '), 9],
    [document.products.join(' '), 8],
    [document.versions.join(' '), 8],
    [document.environments.join(' '), 7],
    [document.abstract, 6],
    [document.overview, 3],
    [document.content, 1],
  ]
  let score = Math.max(0, rank * 1_000)
  for (const [field, weight] of fields) {
    const normalizedField = normalize(field)
    if (normalizedField === normalizedQuery) score += weight * 12
    else if (normalizedField.includes(normalizedQuery)) score += weight * 5
    for (const term of queryTerms(normalizedQuery)) {
      score += Math.min(3, occurrences(normalizedField, term)) * weight
    }
  }
  return score
}

function sqliteText(value: readonly string[]): string {
  return value.join('\n')
}

function createIndexSchema(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      uri TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      abstract TEXT NOT NULL,
      overview TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS documents_type_updated
      ON documents(type, updated_at DESC, id ASC);
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      id UNINDEXED,
      title,
      key,
      aliases,
      identifiers,
      tags,
      products,
      versions,
      environments,
      abstract,
      overview,
      content,
      tokenize='trigram'
    );
  `)
  database
    .prepare('INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)')
    .run('schema_version', String(INDEX_VERSION))
}

function writeIndexedDocument(database: DatabaseSync, document: KnowledgeDocument): void {
  database
    .prepare(
      `INSERT INTO documents(id, uri, type, title, abstract, overview, updated_at, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           uri=excluded.uri,
           type=excluded.type,
           title=excluded.title,
           abstract=excluded.abstract,
           overview=excluded.overview,
           updated_at=excluded.updated_at,
           revision=excluded.revision`,
    )
    .run(
      document.id,
      document.uri,
      document.type,
      document.title,
      document.abstract,
      document.overview,
      document.updatedAt,
      document.revision,
    )
  database.prepare('DELETE FROM documents_fts WHERE id = ?').run(document.id)
  database
    .prepare(
      `INSERT INTO documents_fts(
          id, title, key, aliases, identifiers, tags, products, versions,
          environments, abstract, overview, content
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      document.id,
      document.title,
      document.key,
      sqliteText(document.aliases),
      sqliteText(document.identifiers),
      sqliteText(document.tags),
      sqliteText(document.products),
      sqliteText(document.versions),
      sqliteText(document.environments),
      document.abstract,
      document.overview,
      document.content,
    )
}

function indexDocument(database: DatabaseSync, document: KnowledgeDocument): void {
  database.exec('BEGIN IMMEDIATE')
  try {
    writeIndexedDocument(database, document)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function toChunk(document: KnowledgeDocument, score: number): LongTermKnowledgeChunk {
  return {
    content: redactEvidence(document.overview, 2_000),
    documentId: document.id,
    documentName: document.title,
    id: document.id,
    level: 1,
    similarity: Math.min(1, score / (score + 25)),
    source: 'builtin',
    title: document.title,
    type: document.type,
    uri: document.uri,
  }
}

export class LocalKnowledgeStore {
  readonly root: string
  readonly maxDocuments: number
  readonly maxProjectEvents: number
  private lastIndexState: KnowledgeIndexState = 'ready'

  constructor(root: string, maxDocuments: number, maxProjectEvents: number) {
    this.root = resolve(root)
    this.maxDocuments = maxDocuments
    this.maxProjectEvents = maxProjectEvents
  }

  async appendProjectEvent(event: ProjectMemoryEvent): Promise<void> {
    await this.withWriteLock(async () => await this.appendProjectEventUnlocked(event))
  }

  async projectEvents(
    projectId: string,
    query: string | undefined,
    limit: number,
  ): Promise<ProjectMemoryEvent[]> {
    assertProjectId(projectId)
    const directory = join(this.root, 'projects', projectId, 'events')
    let entries: string[]
    try {
      entries = await this.projectEventEntries(directory)
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
    if (entries.length > this.maxProjectEvents) {
      throw new Error(
        `project memory limit exceeded: ${String(this.maxProjectEvents)} events per project`,
      )
    }
    const normalizedQuery = query === undefined ? undefined : normalize(query)
    const ranked: Array<{ event: ProjectMemoryEvent; score: number }> = []
    for (const entry of entries.slice(0, this.maxProjectEvents)) {
      const parsed = await this.readProjectEventFile(join(directory, entry), projectId, entry)
      const score =
        normalizedQuery === undefined
          ? 0
          : documentScore(
              createKnowledgeDocument(
                {
                  authority: parsed.authority,
                  confidence: parsed.confidence,
                  content: parsed.content,
                  key: parsed.eventId,
                  sensitivity: parsed.sensitivity,
                  status: parsed.status,
                  tags: parsed.tags,
                  title: parsed.title,
                  type: parsed.kind === 'asset' ? 'asset' : 'source',
                },
                undefined,
                new Date(parsed.recordedAt),
              ),
              normalizedQuery,
            )
      if (normalizedQuery === undefined || score > 0) ranked.push({ event: parsed, score })
      if (ranked.length > Math.max(limit * 2, 100)) {
        ranked.sort(
          (left, right) =>
            right.score - left.score ||
            right.event.occurredAt.localeCompare(left.event.occurredAt) ||
            left.event.eventId.localeCompare(right.event.eventId),
        )
        ranked.length = Math.max(limit, 1)
      }
    }
    return ranked
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.event.occurredAt.localeCompare(left.event.occurredAt) ||
          left.event.eventId.localeCompare(right.event.eventId),
      )
      .slice(0, limit)
      .map(({ event }) => event)
  }

  async projectEvent(projectId: string, eventId: string): Promise<ProjectMemoryEvent | undefined> {
    assertProjectId(projectId)
    assertProjectEventId(eventId)
    const target = join(this.root, 'projects', projectId, 'events', `${eventId}.json`)
    try {
      return await this.readProjectEventFile(target, projectId, `${eventId}.json`)
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async upsert(input: KnowledgeDocumentInput): Promise<KnowledgeUpsertResult> {
    return await this.withWriteLock(async () => await this.upsertUnlocked(input))
  }

  private async upsertUnlocked(input: KnowledgeDocumentInput): Promise<KnowledgeUpsertResult> {
    if (input.sensitivity === 'restricted') {
      throw new Error('restricted project material cannot be stored in the long-term library')
    }
    const key = input.key ?? input.title
    const id = createKnowledgeId(input.type, key)
    const existing = await this.loadByTypeAndId(input.type, id)
    if (existing === undefined && (await this.documentCount()) >= this.maxDocuments) {
      throw new Error(`knowledge document limit reached: ${String(this.maxDocuments)}`)
    }
    const document = createKnowledgeDocument(input, existing)
    let indexAvailable = true
    try {
      await this.ensureIndexReadyUnlocked()
    } catch {
      indexAvailable = false
      this.lastIndexState = 'degraded'
    }
    await this.markIndexDirty()
    if (existing !== undefined) {
      await this.writePrivate(
        this.revisionPath(existing.type, existing.id, existing.revision),
        `${JSON.stringify(existing, undefined, 2)}\n`,
      )
    }
    await this.writePrivate(
      this.documentPath(document.type, document.id),
      `${JSON.stringify(document, undefined, 2)}\n`,
    )
    try {
      if (!indexAvailable) throw new Error('knowledge index is unavailable')
      await this.assertSafeRegularFile(this.indexPath(), false)
      const database = new DatabaseSync(this.indexPath())
      try {
        indexDocument(database, document)
      } finally {
        database.close()
      }
      await this.clearIndexDirty()
      this.lastIndexState = 'ready'
    } catch {
      this.lastIndexState = 'degraded'
    }
    return { created: existing === undefined, document: knowledgeDocumentSummary(document) }
  }

  async promote(
    event: ProjectMemoryEvent,
    type: LongTermKnowledgeType,
  ): Promise<KnowledgeUpsertResult> {
    return await this.upsert({
      authority: event.authority,
      confidence: event.confidence,
      content: renderKnowledgeDocument(event),
      eventIds: [event.eventId],
      identifiers: event.tags.filter((tag) => /^(?:cve|cwe)-|^[a-z]+-\d/iu.test(tag)),
      key: `${event.projectId}:${event.eventId}`,
      projectIds: [event.projectId],
      sensitivity: event.sensitivity,
      sourceUrls: event.sourceUrls,
      status: event.status,
      tags: event.tags,
      title: event.title,
      type,
    })
  }

  async read(reference: string, level: KnowledgeReadLevel): Promise<KnowledgeReadResult> {
    const document = await this.load(reference)
    return {
      ...knowledgeDocumentSummary(document),
      aliases: [...document.aliases],
      authority: document.authority,
      confidence: document.confidence,
      content: knowledgeLevelContent(document, level),
      environments: [...document.environments],
      eventIds: [...document.eventIds],
      level,
      products: [...document.products],
      projectIds: [...document.projectIds],
      relatedUris: [...document.relatedUris],
      sensitivity: document.sensitivity,
      sourceUrls: [...document.sourceUrls],
      status: document.status,
      versions: [...document.versions],
    }
  }

  async search(
    query: string,
    types: readonly LongTermKnowledgeType[],
    limit: number,
  ): Promise<KnowledgeSearchResult> {
    const normalizedQuery = boundedKnowledgeText('query', query, 500)
    const selectedTypes = [...new Set(types)]
    if (selectedTypes.length === 0) throw new Error('knowledge types must not be empty')
    let candidates: KnowledgeDocument[] = []
    const ranks = new Map<string, number>()
    const expression = ftsQuery(normalizedQuery)
    let indexQueried = false
    if (expression !== undefined) {
      try {
        const database = await this.ensureIndexDatabase()
        try {
          const placeholders = selectedTypes.map(() => '?').join(', ')
          const rows = database
            .prepare(
              `SELECT d.id, d.type, -bm25(documents_fts) AS rank
               FROM documents_fts
               JOIN documents d ON d.id = documents_fts.id
               WHERE documents_fts MATCH ? AND d.type IN (${placeholders})
               ORDER BY rank DESC, d.updated_at DESC, d.id ASC
               LIMIT ?`,
            )
            .all(
              expression,
              ...selectedTypes,
              Math.min(this.maxDocuments, limit * 20),
            ) as unknown as IndexedRow[]
          indexQueried = true
          candidates = (
            await Promise.all(
              rows.map(async (row) => {
                if (!KNOWLEDGE_TYPES.includes(row.type as LongTermKnowledgeType)) return undefined
                return await this.loadByTypeAndId(row.type as LongTermKnowledgeType, row.id)
              }),
            )
          ).filter((item): item is KnowledgeDocument => item !== undefined)
          for (const row of rows) ranks.set(row.id, row.rank ?? 0)
        } finally {
          database.close()
        }
      } catch (error) {
        this.lastIndexState = 'degraded'
        if (indexQueried) throw error
      }
    }
    if (candidates.length === 0 && !indexQueried) {
      const fallback: Array<{ document: KnowledgeDocument; score: number }> = []
      const candidateLimit = Math.min(this.maxDocuments, Math.max(limit * 20, 100))
      for await (const document of this.iterateDocuments()) {
        if (!selectedTypes.includes(document.type)) continue
        const score = documentScore(document, normalizedQuery)
        if (score <= 0) continue
        fallback.push({ document, score })
        if (fallback.length > candidateLimit * 2) {
          fallback.sort(
            (left, right) =>
              right.score - left.score ||
              right.document.updatedAt.localeCompare(left.document.updatedAt) ||
              left.document.id.localeCompare(right.document.id),
          )
          fallback.length = candidateLimit
        }
      }
      fallback.sort(
        (left, right) =>
          right.score - left.score ||
          right.document.updatedAt.localeCompare(left.document.updatedAt) ||
          left.document.id.localeCompare(right.document.id),
      )
      candidates = fallback.slice(0, candidateLimit).map(({ document }) => document)
    }
    const scored = candidates
      .map((document) => ({
        document,
        score: documentScore(document, normalizedQuery, ranks.get(document.id) ?? 0),
      }))
      .filter(({ score }) => score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.document.updatedAt.localeCompare(left.document.updatedAt) ||
          left.document.id.localeCompare(right.document.id),
      )
      .slice(0, limit)
    return {
      chunks: scored.map(({ document, score }) => toChunk(document, score)),
      datasetTypes: selectedTypes,
    }
  }

  async grep(
    query: string,
    types: readonly LongTermKnowledgeType[],
    limit: number,
  ): Promise<KnowledgeGrepResult> {
    const boundedQuery = boundedKnowledgeText('query', query, 500)
    const needle = normalize(boundedQuery)
    const selectedTypes = [...new Set(types)]
    if (selectedTypes.length === 0) throw new Error('knowledge types must not be empty')
    const matches: KnowledgeGrepResult['matches'] = []
    for await (const document of this.iterateDocuments()) {
      if (!selectedTypes.includes(document.type)) continue
      const lines = document.content.split(/\r?\n/u)
      for (const [index, line] of lines.entries()) {
        const column = normalizedColumn(line, needle)
        if (column < 0) continue
        matches.push({
          column: column + 1,
          line: index + 1,
          snippet: redactEvidence(line.trim(), 300),
          title: document.title,
          type: document.type,
          uri: document.uri,
        })
        if (matches.length >= limit) return { matches, query: boundedQuery }
      }
    }
    return { matches, query: boundedQuery }
  }

  async tree(prefix: string | undefined, limit: number): Promise<KnowledgeTreeResult> {
    const normalizedPrefix =
      prefix?.trim() === '' || prefix === undefined ? 'redteam://knowledge' : prefix
    if (normalizedPrefix === 'redteam://knowledge' || normalizedPrefix === 'redteam://knowledge/') {
      const counts = new Map(KNOWLEDGE_TYPES.map((type) => [type, 0]))
      for await (const document of this.iterateDocuments()) {
        counts.set(document.type, (counts.get(document.type) ?? 0) + 1)
      }
      const nodes = KNOWLEDGE_TYPES.map((type): KnowledgeTreeNode => ({
        childCount: counts.get(type) ?? 0,
        kind: 'namespace',
        title: type,
        type,
        uri: `redteam://knowledge/${type}`,
      }))
      return { nodes: nodes.slice(0, limit), prefix: 'redteam://knowledge' }
    }
    const parsed = new URL(boundedKnowledgeText('prefix', normalizedPrefix, 512))
    if (
      parsed.protocol !== 'redteam:' ||
      parsed.hostname !== 'knowledge' ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      throw new Error('knowledge tree prefix must use redteam://knowledge')
    }
    const parts = parsed.pathname.split('/').filter(Boolean)
    const type = parts[0]
    if (type === undefined || !KNOWLEDGE_TYPES.includes(type as LongTermKnowledgeType)) {
      throw new Error('knowledge tree prefix has an unknown type')
    }
    if (parts.length === 2) {
      const document = await this.load(normalizedPrefix)
      return {
        nodes: [
          {
            childCount: 0,
            kind: 'document',
            title: document.title,
            type: document.type,
            uri: document.uri,
          },
        ],
        prefix: normalizedPrefix,
      }
    }
    if (parts.length !== 1 || parsed.search !== '' || parsed.hash !== '') {
      throw new Error('knowledge tree prefix is invalid')
    }
    const documents: KnowledgeDocument[] = []
    for await (const document of this.iterateDocuments()) {
      if (document.type !== type) continue
      documents.push(document)
      if (documents.length > Math.max(limit * 2, 100)) {
        documents.sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
        )
        documents.length = Math.max(limit, 1)
      }
    }
    documents.sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
    )
    return {
      nodes: documents.slice(0, limit).map((document) => ({
        childCount: 0,
        kind: 'document',
        title: document.title,
        type: document.type,
        uri: document.uri,
      })),
      prefix: `redteam://knowledge/${type}`,
    }
  }

  async status(): Promise<LocalKnowledgeStatus> {
    let indexState: KnowledgeIndexState = this.lastIndexState
    try {
      const database = await this.ensureIndexDatabase()
      database.close()
      indexState = this.lastIndexState
    } catch {
      indexState = 'degraded'
      this.lastIndexState = 'degraded'
    }
    let documentCount: number
    let projectStats: { projectCount: number; eventCount: number }
    try {
      const stats = await Promise.all([this.documentCount(), this.projectStats()])
      documentCount = stats[0]
      projectStats = stats[1]
    } catch {
      return {
        available: false,
        documentCount: 0,
        eventCount: 0,
        indexState: 'degraded',
        indexVersion: INDEX_VERSION,
        projectCount: 0,
      }
    }
    return {
      available: true,
      documentCount,
      eventCount: projectStats.eventCount,
      indexState,
      indexVersion: INDEX_VERSION,
      projectCount: projectStats.projectCount,
    }
  }

  async rebuildIndex(): Promise<void> {
    await this.withWriteLock(async () => await this.rebuildIndexUnlocked())
  }

  private async rebuildIndexUnlocked(): Promise<void> {
    await this.ensureSafeDirectory(this.indexDirectory(), true)
    await this.assertSafeRegularFile(this.indexPath(), true)
    const temporary = join(this.indexDirectory(), `.knowledge.${randomUUID()}.sqlite3.tmp`)
    let database: DatabaseSync | undefined
    try {
      const temporaryHandle = await open(temporary, 'wx', 0o600)
      await temporaryHandle.close()
      database = new DatabaseSync(temporary)
      createIndexSchema(database)
      database.exec('BEGIN IMMEDIATE')
      try {
        for await (const document of this.iterateDocuments()) {
          writeIndexedDocument(database, document)
        }
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
      const integrity = database.prepare('PRAGMA quick_check').get() as
        { readonly quick_check?: unknown } | undefined
      if (integrity?.quick_check !== 'ok')
        throw new Error('rebuilt knowledge index failed integrity check')
      database.close()
      database = undefined
      await chmod(temporary, 0o600)
      await rename(temporary, this.indexPath())
      await this.assertSafeRegularFile(this.indexPath(), false)
      await this.clearIndexDirty()
      this.lastIndexState = 'rebuilt'
    } catch (error) {
      database?.close()
      await unlink(temporary).catch(() => undefined)
      this.lastIndexState = 'degraded'
      throw error
    }
  }

  private documentPath(type: LongTermKnowledgeType, id: string): string {
    return join(this.root, 'library', type, id, 'entry.json')
  }

  private revisionPath(type: LongTermKnowledgeType, id: string, revision: number): string {
    return join(
      this.root,
      'library',
      type,
      id,
      'revisions',
      `${String(revision).padStart(8, '0')}.json`,
    )
  }

  private async load(reference: string): Promise<KnowledgeDocument> {
    const parsed = parseKnowledgeReference(reference)
    if (parsed.type !== undefined) {
      const document = await this.loadByTypeAndId(parsed.type, parsed.id)
      if (document !== undefined) return document
    } else {
      for (const type of KNOWLEDGE_TYPES) {
        const document = await this.loadByTypeAndId(type, parsed.id)
        if (document !== undefined) return document
      }
    }
    throw new Error(`knowledge document not found: ${parsed.id}`)
  }

  private async loadByTypeAndId(
    type: LongTermKnowledgeType,
    id: string,
  ): Promise<KnowledgeDocument | undefined> {
    try {
      const parsed: unknown = JSON.parse(await this.readPrivateText(this.documentPath(type, id)))
      assertKnowledgeDocument(parsed)
      if (parsed.type !== type || parsed.id !== id) {
        throw new Error('stored knowledge document path does not match its schema')
      }
      return parsed
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  private async *iterateDocuments(): AsyncGenerator<KnowledgeDocument> {
    let documentCount = 0
    for (const type of KNOWLEDGE_TYPES) {
      const directory = join(this.root, 'library', type)
      let entries: Dirent[]
      try {
        await this.ensureSafeDirectory(directory, false)
        entries = await readdir(directory, { withFileTypes: true })
      } catch (error) {
        if (isMissing(error)) continue
        throw error
      }
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!KNOWLEDGE_ID.test(entry.name)) continue
        if (entry.isSymbolicLink() || !entry.isDirectory()) {
          throw new Error('knowledge document directories must not be symbolic links')
        }
        const document = await this.loadByTypeAndId(type, entry.name)
        if (document === undefined) continue
        documentCount += 1
        if (documentCount > this.maxDocuments) {
          throw new Error(`knowledge document limit exceeded: ${String(this.maxDocuments)}`)
        }
        yield document
      }
    }
  }

  private async documentCount(): Promise<number> {
    let count = 0
    for await (const document of this.iterateDocuments()) count += document.schemaVersion
    return count
  }

  private async projectStats(): Promise<{ projectCount: number; eventCount: number }> {
    const projectsDirectory = join(this.root, 'projects')
    let projects: string[]
    try {
      await this.ensureSafeDirectory(projectsDirectory, false)
      projects = (await readdir(projectsDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .map((entry) => entry.name)
    } catch (error) {
      if (isMissing(error)) return { eventCount: 0, projectCount: 0 }
      throw error
    }
    let eventCount = 0
    let projectCount = 0
    for (const projectId of projects) {
      try {
        assertProjectId(projectId)
      } catch {
        continue
      }
      projectCount += 1
      const eventsDirectory = join(projectsDirectory, projectId, 'events')
      eventCount += await this.projectEventEntries(eventsDirectory)
        .then((entries) => entries.length)
        .catch((error: unknown) => {
          if (isMissing(error)) return 0
          throw error
        })
    }
    return { eventCount, projectCount }
  }

  private indexDirectory(): string {
    return join(this.root, 'index')
  }

  private indexPath(): string {
    return join(this.indexDirectory(), 'knowledge.sqlite3')
  }

  private dirtyPath(): string {
    return join(this.indexDirectory(), 'dirty')
  }

  private async markIndexDirty(): Promise<void> {
    await this.writePrivate(this.dirtyPath(), `${new Date().toISOString()}\n`)
  }

  private async clearIndexDirty(): Promise<void> {
    await this.assertSafeRegularFile(this.dirtyPath(), true)
    await unlink(this.dirtyPath()).catch((error: unknown) => {
      if (!isMissing(error)) throw error
    })
  }

  private async ensureIndexDatabase(): Promise<DatabaseSync> {
    const existing = await this.openReadyIndex()
    if (existing !== undefined) return existing
    await this.withWriteLock(async () => await this.ensureIndexReadyUnlocked())
    const rebuilt = await this.openReadyIndex()
    if (rebuilt === undefined) throw new Error('knowledge index is unavailable after rebuild')
    return rebuilt
  }

  private async ensureIndexReadyUnlocked(): Promise<void> {
    const existing = await this.openReadyIndex()
    if (existing !== undefined) {
      existing.close()
      return
    }
    await this.rebuildIndexUnlocked()
  }

  private async openReadyIndex(): Promise<DatabaseSync | undefined> {
    try {
      await this.assertSafeRegularFile(this.dirtyPath(), true)
      await access(this.dirtyPath())
      return undefined
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    let database: DatabaseSync | undefined
    try {
      await this.assertSafeRegularFile(this.indexPath(), false)
      database = new DatabaseSync(this.indexPath())
      const metadata = database
        .prepare("SELECT value FROM metadata WHERE key = 'schema_version'")
        .get() as { readonly value?: unknown } | undefined
      const integrity = database.prepare('PRAGMA quick_check').get() as
        { readonly quick_check?: unknown } | undefined
      if (metadata?.value === String(INDEX_VERSION) && integrity?.quick_check === 'ok') {
        await chmod(this.indexPath(), 0o600)
        this.lastIndexState = 'ready'
        return database
      }
    } catch (error) {
      if (!isMissing(error)) this.lastIndexState = 'degraded'
    }
    database?.close()
    return undefined
  }

  private async appendProjectEventUnlocked(event: ProjectMemoryEvent): Promise<void> {
    assertProjectMemoryEvent(event)
    const directory = join(this.root, 'projects', event.projectId, 'events')
    const target = join(directory, `${event.eventId}.json`)
    try {
      const parsed: unknown = JSON.parse(await this.readPrivateText(target))
      assertProjectMemoryEvent(parsed)
      if (JSON.stringify(parsed) !== JSON.stringify(event)) {
        throw new Error(`project memory event id already exists: ${event.eventId}`)
      }
      return
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    let eventCount = 0
    try {
      eventCount = (await this.projectEventEntries(directory)).length
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    if (eventCount >= this.maxProjectEvents) {
      throw new Error(
        `project memory limit reached: ${String(this.maxProjectEvents)} events per project`,
      )
    }
    await this.writePrivate(target, `${JSON.stringify(event, undefined, 2)}\n`)
  }

  private async readProjectEventFile(
    target: string,
    projectId: string,
    entry: string,
  ): Promise<ProjectMemoryEvent> {
    const parsed: unknown = JSON.parse(await this.readPrivateText(target))
    assertProjectMemoryEvent(parsed)
    if (parsed.projectId !== projectId || `${parsed.eventId}.json` !== entry) {
      throw new Error('stored project memory path does not match its schema')
    }
    return parsed
  }

  private async projectEventEntries(directory: string): Promise<string[]> {
    await this.ensureSafeDirectory(directory, false)
    const entries = await readdir(directory, { withFileTypes: true })
    const eventFiles: string[] = []
    for (const entry of entries) {
      if (!EVENT_FILE.test(entry.name)) continue
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new Error('project memory events must be regular files, not symbolic links')
      }
      eventFiles.push(entry.name)
    }
    return eventFiles
  }

  private async readPrivateText(target: string): Promise<string> {
    await this.ensureSafeDirectory(dirname(target), false)
    return await this.readRegularFileNoFollow(target)
  }

  private async writePrivate(target: string, content: string | Uint8Array): Promise<void> {
    await this.ensureSafeDirectory(dirname(target), true)
    await this.assertSafeRegularFile(target, true)
    await atomicWritePrivate(target, content)
    await this.assertSafeRegularFile(target, false)
  }

  private relativeSegments(target: string): string[] {
    const normalized = resolve(target)
    const remainder = relative(this.root, normalized)
    if (remainder === '') return []
    if (
      remainder === '..' ||
      remainder.startsWith(`..${sep}`) ||
      resolve(this.root, remainder) !== normalized
    ) {
      throw new Error('knowledge path escapes its configured root')
    }
    return remainder.split(sep).filter(Boolean)
  }

  private async ensureSafeDirectory(target: string, create: boolean): Promise<void> {
    const segments = this.relativeSegments(target)
    await this.ensureKnowledgeRoot(create)
    const canonicalRoot = await realpath(this.root)
    let current = this.root
    for (const segment of segments) {
      current = join(current, segment)
      let info
      try {
        info = await lstat(current)
      } catch (error) {
        if (!create || !isMissing(error)) throw error
        try {
          await mkdir(current, { mode: 0o700 })
        } catch (mkdirError) {
          if (!hasCode(mkdirError, 'EEXIST')) throw mkdirError
        }
        info = await lstat(current)
      }
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('knowledge directories must not be symbolic links')
      }
      await chmod(current, 0o700)
      const canonical = await realpath(current)
      if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}${sep}`)) {
        throw new Error('knowledge directory resolves outside its configured root')
      }
    }
  }

  private async ensureKnowledgeRoot(create: boolean): Promise<void> {
    if (this.root === parse(this.root).root) {
      throw new Error('knowledge root must be a dedicated directory, not the filesystem root')
    }
    const missing: string[] = []
    let current = this.root
    while (true) {
      try {
        const info = await lstat(current)
        if (info.isSymbolicLink() || !info.isDirectory()) {
          throw new Error('knowledge root path must not contain symbolic links')
        }
        break
      } catch (error) {
        if (!create || !isMissing(error)) throw error
        missing.push(current)
        const parent = dirname(current)
        if (parent === current) throw new Error('knowledge root cannot be created safely')
        current = parent
      }
    }
    for (const directory of missing.reverse()) {
      try {
        await mkdir(directory, { mode: 0o700 })
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error
      }
      const info = await lstat(directory)
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('knowledge root path must not contain symbolic links')
      }
    }
    const rootInfo = await lstat(this.root)
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      throw new Error('knowledge root must be a real directory, not a symbolic link')
    }
    await chmod(this.root, 0o700)
    await this.claimKnowledgeRoot()
  }

  private async claimKnowledgeRoot(): Promise<void> {
    const marker = join(this.root, ROOT_MARKER)
    try {
      const content = await this.readRegularFileNoFollow(marker)
      if (content !== ROOT_MARKER_CONTENT) throw new Error('knowledge root marker is invalid')
      await chmod(marker, 0o600)
      return
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    const allowed = new Set([
      '.DS_Store',
      '.write.lock',
      'current-project.json',
      'index',
      'library',
      'projects',
    ])
    const entries = await readdir(this.root)
    if (entries.some((entry) => !allowed.has(entry))) {
      throw new Error('knowledge root must be a dedicated directory')
    }
    try {
      const handle = await open(
        marker,
        fileConstants.O_CREAT |
          fileConstants.O_EXCL |
          fileConstants.O_WRONLY |
          fileConstants.O_NOFOLLOW,
        0o600,
      )
      try {
        await handle.writeFile(ROOT_MARKER_CONTENT)
        await handle.sync()
      } finally {
        await handle.close()
      }
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error
      const content = await this.readRegularFileNoFollow(marker)
      if (content !== ROOT_MARKER_CONTENT) throw new Error('knowledge root marker is invalid')
    }
  }

  private async readRegularFileNoFollow(target: string): Promise<string> {
    const handle = await open(target, fileConstants.O_RDONLY | fileConstants.O_NOFOLLOW)
    try {
      const info = await handle.stat()
      if (!info.isFile()) throw new Error('knowledge files must be regular files')
      return await handle.readFile('utf8')
    } finally {
      await handle.close()
    }
  }

  private async assertSafeRegularFile(target: string, allowMissing: boolean): Promise<void> {
    await this.ensureSafeDirectory(dirname(target), false)
    let info
    try {
      info = await lstat(target)
    } catch (error) {
      if (allowMissing && isMissing(error)) return
      throw error
    }
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error('knowledge files must be regular files, not symbolic links')
    }
    const [canonicalRoot, canonicalTarget] = await Promise.all([
      realpath(this.root),
      realpath(target),
    ])
    if (!canonicalTarget.startsWith(`${canonicalRoot}${sep}`)) {
      throw new Error('knowledge file resolves outside its configured root')
    }
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureSafeDirectory(this.root, true)
    const target = join(this.root, '.write.lock')
    const token = randomUUID()
    const deadline = Date.now() + WRITE_LOCK_TIMEOUT_MS
    let handle: Awaited<ReturnType<typeof open>> | undefined
    while (handle === undefined) {
      try {
        const candidate = await open(
          target,
          fileConstants.O_CREAT |
            fileConstants.O_EXCL |
            fileConstants.O_WRONLY |
            fileConstants.O_NOFOLLOW,
          0o600,
        )
        try {
          await candidate.writeFile(
            `${JSON.stringify({ createdAt: new Date().toISOString(), pid: process.pid, token })}\n`,
          )
          await candidate.sync()
          handle = candidate
        } catch (error) {
          await candidate.close().catch(() => undefined)
          await unlink(target).catch(() => undefined)
          throw error
        }
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error
        await this.assertSafeRegularFile(target, false).catch((lockError: unknown) => {
          if (!isMissing(lockError)) throw lockError
        })
        if (Date.now() >= deadline) throw new Error('knowledge store is busy; retry the operation')
        await delay(25)
      }
    }
    try {
      return await operation()
    } finally {
      await handle.close().catch(() => undefined)
      try {
        const parsed: unknown = JSON.parse(await this.readPrivateText(target))
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'token' in parsed &&
          parsed.token === token
        ) {
          await unlink(target)
        }
      } catch (error) {
        if (!isMissing(error)) this.lastIndexState = 'degraded'
      }
    }
  }
}
