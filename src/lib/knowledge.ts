import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { redactEvidence } from './redact.js'
import type {
  AssetConfidence,
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgeDocumentSummary,
  KnowledgeReadLevel,
  LongTermKnowledgeType,
  MemoryAuthority,
  MemorySensitivity,
  MemoryStatus,
  ProjectMemoryEvent,
  ProjectMemoryKind,
} from './types.js'

const PROJECT_ID = /^rtp-[0-9]{14}-[a-f0-9]{8}$/u
const KNOWLEDGE_ID = /^kb-[a-f0-9]{20}$/u
const EVENT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const EVENT_PREFIX = 'dsh-redteam-memory:'
const MAX_CONTENT_CHARS = 8_000
const MAX_SOURCE_URLS = 20
const MAX_TAGS = 20
const MAX_KNOWLEDGE_CONTENT_CHARS = 32_000
const MAX_KNOWLEDGE_ABSTRACT_CHARS = 500
const MAX_KNOWLEDGE_OVERVIEW_CHARS = 4_000
const MAX_METADATA_ITEMS = 30
const KNOWLEDGE_TYPES: readonly LongTermKnowledgeType[] = [
  'asset',
  'vulnerability',
  'technique',
  'src_case',
  'source',
]

export interface ProjectMemoryInput {
  readonly projectId: string
  readonly kind: ProjectMemoryKind
  readonly title: string
  readonly content: string
  readonly authority: MemoryAuthority
  readonly confidence: AssetConfidence
  readonly status: MemoryStatus
  readonly sensitivity: MemorySensitivity
  readonly promotable: boolean
  readonly tags?: readonly string[]
  readonly sourceUrls?: readonly string[]
  readonly occurredAt?: string
}

export function boundedKnowledgeText(name: string, value: string, maximum: number): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new Error(`${name} must contain between 1 and ${String(maximum)} characters`)
  }
  return normalized
}

function isoTimestamp(name: string, value: string | undefined): string {
  const date = value === undefined ? new Date() : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} must be a valid timestamp`)
  return date.toISOString()
}

function compactTimestamp(date: Date): string {
  return date
    .toISOString()
    .replaceAll(/[-:TZ.]/gu, '')
    .slice(0, 14)
}

export function createProjectId(now = new Date()): string {
  return `rtp-${compactTimestamp(now)}-${randomBytes(4).toString('hex')}`
}

export function assertProjectId(projectId: string): void {
  if (!PROJECT_ID.test(projectId)) throw new Error(`invalid project id: ${projectId}`)
}

export function assertProjectEventId(eventId: string): void {
  if (!EVENT_ID.test(eventId)) throw new Error(`invalid project event id: ${eventId}`)
}

export function defaultProjectId(workspaceRoot: string, now = new Date()): string {
  const suffix = createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 8)
  return `rtp-${compactTimestamp(now)}-${suffix}`
}

export function sanitizeKnowledgeSourceUrl(value: string): string {
  const normalized = boundedKnowledgeText('source URL', value, 2_048)
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch (error) {
    throw new Error('source URL must be a valid HTTP(S) URL', { cause: error })
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    throw new Error('source URL must be HTTP(S) and must not contain credentials')
  }
  for (const key of parsed.searchParams.keys()) {
    if (/api[_-]?key|authorization|cookie|credential|password|secret|token/iu.test(key)) {
      parsed.searchParams.set(key, '[redacted]')
    }
  }
  parsed.hash = ''
  return parsed.toString()
}

function tags(values: readonly string[]): string[] {
  if (values.length > MAX_TAGS)
    throw new Error(`tags must contain at most ${String(MAX_TAGS)} items`)
  return [
    ...new Set(
      values.map((value) =>
        redactEvidence(boundedKnowledgeText('tag', value, 64), 64).toLowerCase(),
      ),
    ),
  ]
}

export function createProjectMemoryEvent(input: ProjectMemoryInput): ProjectMemoryEvent {
  assertProjectId(input.projectId)
  if ((input.sensitivity === 'restricted' || input.authority === 'inferred') && input.promotable) {
    throw new Error('restricted or inferred memory cannot be marked promotable')
  }
  const sourceUrls = input.sourceUrls ?? []
  if (sourceUrls.length > MAX_SOURCE_URLS) {
    throw new Error(`source URLs must contain at most ${String(MAX_SOURCE_URLS)} items`)
  }
  return {
    authority: input.authority,
    confidence: input.confidence,
    content: redactEvidence(
      boundedKnowledgeText('content', input.content, MAX_CONTENT_CHARS),
      MAX_CONTENT_CHARS,
    ),
    eventId: randomUUID(),
    kind: input.kind,
    occurredAt: isoTimestamp('occurredAt', input.occurredAt),
    projectId: input.projectId,
    promotable: input.promotable,
    recordedAt: new Date().toISOString(),
    schemaVersion: 1,
    sensitivity: input.sensitivity,
    sourceUrls: [...new Set(sourceUrls.map(sanitizeKnowledgeSourceUrl))],
    status: input.status,
    tags: tags(input.tags ?? []),
    title: redactEvidence(boundedKnowledgeText('title', input.title, 200), 200),
  }
}

function isProjectMemoryEvent(value: unknown): value is ProjectMemoryEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const memoryKinds: readonly string[] = [
    'project',
    'scope',
    'asset',
    'finding',
    'vulnerability',
    'technique',
    'src_case',
    'decision',
    'task',
    'note',
  ]
  const authorities: readonly string[] = ['authoritative', 'observed', 'inferred']
  const confidence: readonly string[] = ['high', 'medium', 'low']
  const statuses: readonly string[] = ['active', 'confirmed', 'resolved', 'dismissed', 'archived']
  const sensitivities: readonly string[] = ['internal', 'reusable', 'restricted']
  return (
    item.schemaVersion === 1 &&
    typeof item.eventId === 'string' &&
    EVENT_ID.test(item.eventId) &&
    typeof item.projectId === 'string' &&
    PROJECT_ID.test(item.projectId) &&
    typeof item.kind === 'string' &&
    memoryKinds.includes(item.kind) &&
    typeof item.title === 'string' &&
    item.title.length > 0 &&
    item.title.length <= 200 &&
    redactEvidence(item.title, 200) === item.title &&
    typeof item.content === 'string' &&
    item.content.length > 0 &&
    item.content.length <= MAX_CONTENT_CHARS &&
    redactEvidence(item.content, MAX_CONTENT_CHARS) === item.content &&
    typeof item.authority === 'string' &&
    authorities.includes(item.authority) &&
    typeof item.confidence === 'string' &&
    confidence.includes(item.confidence) &&
    typeof item.status === 'string' &&
    statuses.includes(item.status) &&
    typeof item.sensitivity === 'string' &&
    sensitivities.includes(item.sensitivity) &&
    typeof item.promotable === 'boolean' &&
    (!item.promotable || (item.sensitivity !== 'restricted' && item.authority !== 'inferred')) &&
    Array.isArray(item.tags) &&
    item.tags.length <= MAX_TAGS &&
    item.tags.every(
      (tag) =>
        typeof tag === 'string' &&
        tag.length > 0 &&
        tag.length <= 64 &&
        redactEvidence(tag, 64) === tag,
    ) &&
    Array.isArray(item.sourceUrls) &&
    item.sourceUrls.length <= MAX_SOURCE_URLS &&
    item.sourceUrls.every((url) => {
      if (typeof url !== 'string' || url.length > 2_048) return false
      try {
        return sanitizeKnowledgeSourceUrl(url) === url
      } catch {
        return false
      }
    }) &&
    typeof item.occurredAt === 'string' &&
    Number.isFinite(new Date(item.occurredAt).getTime()) &&
    typeof item.recordedAt === 'string' &&
    Number.isFinite(new Date(item.recordedAt).getTime())
  )
}

export function assertProjectMemoryEvent(value: unknown): asserts value is ProjectMemoryEvent {
  if (!isProjectMemoryEvent(value)) throw new Error('stored project memory has an invalid schema')
}

export function serializeProjectMemoryEvent(event: ProjectMemoryEvent): string {
  return `${EVENT_PREFIX}${JSON.stringify(event)}`
}

export function parseProjectMemoryEvent(value: string): ProjectMemoryEvent | undefined {
  const marker = value.indexOf(EVENT_PREFIX)
  if (marker < 0) return undefined
  const raw = value.slice(marker + EVENT_PREFIX.length).trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  return isProjectMemoryEvent(parsed) ? parsed : undefined
}

function boundedList(
  name: string,
  values: readonly string[],
  maximumLength: number,
  itemLength: number,
  lowercase = false,
): string[] {
  if (values.length > maximumLength) {
    throw new Error(`${name} must contain at most ${String(maximumLength)} items`)
  }
  return [
    ...new Set(
      values.map((value) => {
        const normalized = redactEvidence(boundedKnowledgeText(name, value, itemLength), itemLength)
        return lowercase ? normalized.toLowerCase() : normalized
      }),
    ),
  ]
}

function deterministicExcerpt(value: string, maximum: number): string {
  const compact = value.replaceAll(/\s+/gu, ' ').trim()
  if (compact.length <= maximum) return compact
  return `${compact.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`
}

function knowledgeUri(type: LongTermKnowledgeType, id: string): string {
  return `redteam://knowledge/${type}/${id}`
}

function assertRelatedUri(value: string): string {
  const normalized = boundedKnowledgeText('related URI', value, 512)
  let reference: ReturnType<typeof parseKnowledgeReference>
  try {
    reference = parseKnowledgeReference(normalized)
  } catch (error) {
    throw new Error(
      'related URI must be a canonical redteam URI: redteam://knowledge/<type>/<kb-id>',
      { cause: error },
    )
  }
  if (reference.type === undefined || normalized !== knowledgeUri(reference.type, reference.id)) {
    throw new Error(
      'related URI must be a canonical redteam URI: redteam://knowledge/<type>/<kb-id>',
    )
  }
  return normalized
}

export function createKnowledgeId(type: LongTermKnowledgeType, key: string): string {
  const normalized = redactEvidence(boundedKnowledgeText('knowledge key', key, 240), 240)
    .normalize('NFKC')
    .toLowerCase()
  return `kb-${createHash('sha256').update(`${type}\0${normalized}`).digest('hex').slice(0, 20)}`
}

export function createKnowledgeDocument(
  input: KnowledgeDocumentInput,
  existing?: KnowledgeDocument,
  now = new Date(),
): KnowledgeDocument {
  const title = redactEvidence(boundedKnowledgeText('title', input.title, 240), 240)
  const key = redactEvidence(boundedKnowledgeText('knowledge key', input.key ?? title, 240), 240)
  const id = createKnowledgeId(input.type, key)
  if (existing !== undefined && (existing.id !== id || existing.type !== input.type)) {
    throw new Error('knowledge key and type cannot change during an update')
  }
  if (input.expectedRevision !== undefined) {
    const expected = existing?.revision ?? 0
    if (input.expectedRevision !== expected) {
      throw new Error(
        `knowledge revision conflict: expected ${String(input.expectedRevision)}, current ${String(expected)}`,
      )
    }
  }
  const content = redactEvidence(
    boundedKnowledgeText('content', input.content, MAX_KNOWLEDGE_CONTENT_CHARS),
    MAX_KNOWLEDGE_CONTENT_CHARS,
  )
  const abstract = redactEvidence(
    input.abstract === undefined
      ? deterministicExcerpt(content, 240)
      : boundedKnowledgeText('abstract', input.abstract, MAX_KNOWLEDGE_ABSTRACT_CHARS),
    MAX_KNOWLEDGE_ABSTRACT_CHARS,
  )
  const overview = redactEvidence(
    input.overview === undefined
      ? deterministicExcerpt(content, 2_000)
      : boundedKnowledgeText('overview', input.overview, MAX_KNOWLEDGE_OVERVIEW_CHARS),
    MAX_KNOWLEDGE_OVERVIEW_CHARS,
  )
  const timestamp = isoTimestamp('updatedAt', now.toISOString())
  const projectIds = boundedList('project ID', input.projectIds ?? [], 50, 64)
  for (const projectId of projectIds) assertProjectId(projectId)
  const eventIds = boundedList('event ID', input.eventIds ?? [], 50, 64)
  if (eventIds.some((eventId) => !EVENT_ID.test(eventId))) {
    throw new Error('event ID has an invalid format')
  }
  const sourceUrls = input.sourceUrls ?? []
  if (sourceUrls.length > MAX_SOURCE_URLS) {
    throw new Error(`source URLs must contain at most ${String(MAX_SOURCE_URLS)} items`)
  }
  const relatedUris = input.relatedUris ?? []
  if (relatedUris.length > MAX_METADATA_ITEMS) {
    throw new Error(`related URIs must contain at most ${String(MAX_METADATA_ITEMS)} items`)
  }
  return {
    abstract,
    aliases: boundedList('alias', input.aliases ?? [], MAX_METADATA_ITEMS, 160),
    authority: input.authority,
    confidence: input.confidence,
    content,
    createdAt: existing?.createdAt ?? timestamp,
    environments: boundedList(
      'environment',
      input.environments ?? [],
      MAX_METADATA_ITEMS,
      160,
      true,
    ),
    eventIds,
    id,
    identifiers: boundedList('identifier', input.identifiers ?? [], MAX_METADATA_ITEMS, 160, true),
    key,
    overview,
    products: boundedList('product', input.products ?? [], MAX_METADATA_ITEMS, 160, true),
    projectIds,
    relatedUris: [...new Set(relatedUris.map((value) => assertRelatedUri(value)))],
    revision: (existing?.revision ?? 0) + 1,
    schemaVersion: 1,
    sensitivity: input.sensitivity,
    sourceUrls: [...new Set(sourceUrls.map(sanitizeKnowledgeSourceUrl))],
    status: input.status,
    tags: boundedList('tag', input.tags ?? [], MAX_METADATA_ITEMS, 64, true),
    title,
    type: input.type,
    updatedAt: timestamp,
    uri: knowledgeUri(input.type, id),
    versions: boundedList('version', input.versions ?? [], MAX_METADATA_ITEMS, 80, true),
  }
}

function isStringArray(value: unknown, maximum: number, itemMaximum: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= itemMaximum)
  )
}

function isRedactedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    redactEvidence(value, maximum) === value
  )
}

function isRedactedStringArray(
  value: unknown,
  maximum: number,
  itemMaximum: number,
): value is string[] {
  return (
    isStringArray(value, maximum, itemMaximum) &&
    value.every((item) => redactEvidence(item, itemMaximum) === item)
  )
}

export function assertKnowledgeDocument(value: unknown): asserts value is KnowledgeDocument {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('stored knowledge document has an invalid schema')
  }
  const item = value as Record<string, unknown>
  const type = item.type
  const valid =
    item.schemaVersion === 1 &&
    typeof item.id === 'string' &&
    KNOWLEDGE_ID.test(item.id) &&
    typeof type === 'string' &&
    KNOWLEDGE_TYPES.includes(type as LongTermKnowledgeType) &&
    item.uri === knowledgeUri(type as LongTermKnowledgeType, item.id) &&
    isRedactedText(item.key, 240) &&
    item.id === createKnowledgeId(type as LongTermKnowledgeType, item.key) &&
    isRedactedText(item.title, 240) &&
    isRedactedStringArray(item.aliases, MAX_METADATA_ITEMS, 160) &&
    isRedactedStringArray(item.identifiers, MAX_METADATA_ITEMS, 160) &&
    isRedactedStringArray(item.tags, MAX_METADATA_ITEMS, 64) &&
    isRedactedStringArray(item.products, MAX_METADATA_ITEMS, 160) &&
    isRedactedStringArray(item.versions, MAX_METADATA_ITEMS, 80) &&
    isRedactedStringArray(item.environments, MAX_METADATA_ITEMS, 160) &&
    isRedactedText(item.abstract, MAX_KNOWLEDGE_ABSTRACT_CHARS) &&
    isRedactedText(item.overview, MAX_KNOWLEDGE_OVERVIEW_CHARS) &&
    isRedactedText(item.content, MAX_KNOWLEDGE_CONTENT_CHARS) &&
    typeof item.authority === 'string' &&
    ['authoritative', 'observed', 'inferred'].includes(item.authority) &&
    typeof item.confidence === 'string' &&
    ['high', 'medium', 'low'].includes(item.confidence) &&
    typeof item.status === 'string' &&
    ['active', 'confirmed', 'resolved', 'dismissed', 'archived'].includes(item.status) &&
    typeof item.sensitivity === 'string' &&
    ['internal', 'reusable'].includes(item.sensitivity) &&
    isStringArray(item.sourceUrls, MAX_SOURCE_URLS, 2_048) &&
    item.sourceUrls.every((url) => {
      try {
        return sanitizeKnowledgeSourceUrl(url) === url
      } catch {
        return false
      }
    }) &&
    isStringArray(item.relatedUris, MAX_METADATA_ITEMS, 512) &&
    item.relatedUris.every((uri) => {
      try {
        return assertRelatedUri(uri) === uri
      } catch {
        return false
      }
    }) &&
    isStringArray(item.projectIds, 50, 64) &&
    item.projectIds.every((projectId) => PROJECT_ID.test(projectId)) &&
    isStringArray(item.eventIds, 50, 64) &&
    item.eventIds.every((eventId) => EVENT_ID.test(eventId)) &&
    typeof item.revision === 'number' &&
    Number.isSafeInteger(item.revision) &&
    item.revision >= 1 &&
    typeof item.createdAt === 'string' &&
    Number.isFinite(new Date(item.createdAt).getTime()) &&
    typeof item.updatedAt === 'string' &&
    Number.isFinite(new Date(item.updatedAt).getTime())
  if (!valid) throw new Error('stored knowledge document has an invalid schema')
}

export function knowledgeDocumentSummary(document: KnowledgeDocument): KnowledgeDocumentSummary {
  return {
    abstract: document.abstract,
    id: document.id,
    identifiers: [...document.identifiers],
    revision: document.revision,
    tags: [...document.tags],
    title: document.title,
    type: document.type,
    updatedAt: document.updatedAt,
    uri: document.uri,
  }
}

export function knowledgeLevelContent(
  document: KnowledgeDocument,
  level: KnowledgeReadLevel,
): string {
  if (level === 0) return document.abstract
  if (level === 1) return document.overview
  return document.content
}

export function parseKnowledgeReference(value: string): {
  readonly id: string
  readonly type?: LongTermKnowledgeType
} {
  const normalized = boundedKnowledgeText('knowledge reference', value, 512)
  if (KNOWLEDGE_ID.test(normalized)) return { id: normalized }
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch (error) {
    throw new Error('knowledge reference must be a document id or redteam knowledge URI', {
      cause: error,
    })
  }
  const parts = parsed.pathname.split('/').filter(Boolean)
  const type = parts[0]
  const id = parts[1]
  if (
    parsed.protocol !== 'redteam:' ||
    parsed.hostname !== 'knowledge' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parts.length !== 2 ||
    type === undefined ||
    id === undefined ||
    !KNOWLEDGE_TYPES.includes(type as LongTermKnowledgeType) ||
    !KNOWLEDGE_ID.test(id)
  ) {
    throw new Error('knowledge reference must be a document id or redteam knowledge URI')
  }
  return { id, type: type as LongTermKnowledgeType }
}

export function assertPromotable(event: ProjectMemoryEvent, type: LongTermKnowledgeType): void {
  if (!event.promotable || event.sensitivity !== 'reusable') {
    throw new Error('memory must be explicitly marked reusable and promotable')
  }
  if (event.authority === 'inferred') throw new Error('inferred memory cannot be promoted')
  if (event.status !== 'confirmed' && event.status !== 'resolved' && event.status !== 'archived') {
    throw new Error('memory must be confirmed, resolved, or archived before promotion')
  }
  const compatible: Record<LongTermKnowledgeType, readonly ProjectMemoryKind[]> = {
    asset: ['asset'],
    source: ['note', 'decision'],
    src_case: ['src_case', 'project'],
    technique: ['technique'],
    vulnerability: ['finding', 'vulnerability'],
  }
  if (!compatible[type].includes(event.kind)) {
    throw new Error(`memory kind ${event.kind} cannot be promoted as ${type}`)
  }
}

export function renderKnowledgeDocument(event: ProjectMemoryEvent): string {
  const lines = [
    `# ${event.title}`,
    '',
    `- 类型：${event.kind}`,
    `- 状态：${event.status}`,
    `- 依据：${event.authority}`,
    `- 置信度：${event.confidence}`,
    `- 项目：${event.projectId}`,
    `- 发生时间：${event.occurredAt}`,
  ]
  if (event.tags.length > 0) lines.push(`- 标签：${event.tags.join('、')}`)
  lines.push('', '## 内容', '', event.content)
  if (event.sourceUrls.length > 0) {
    lines.push('', '## 来源', '', ...event.sourceUrls.map((url) => `- ${url}`))
  }
  lines.push('', `知识条目 ID：${event.eventId}`)
  return `${lines.join('\n')}\n`
}
