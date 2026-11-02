import { redactEvidence } from './redact.js'
import {
  parseProjectMemoryEvent,
  renderKnowledgeDocument,
  serializeProjectMemoryEvent,
} from './knowledge.js'
import type {
  KnowledgePromotionResult,
  KnowledgeSearchResult,
  KnowledgeServiceOptions,
  LongTermKnowledgeChunk,
  LongTermKnowledgeType,
  ProjectMemoryEvent,
  ProjectMemoryFact,
  ProjectRecallResult,
  RagFlowOptions,
} from './types.js'

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const MAX_RESPONSE_CHARS = 5_000_000

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function authorization(options: KnowledgeServiceOptions): string | undefined {
  if (options.authTokenEnv === undefined) return undefined
  const token = process.env[options.authTokenEnv]?.trim()
  if (token === undefined || token === '') {
    throw new Error(`knowledge service credential is missing from ${options.authTokenEnv}`)
  }
  return `Bearer ${token}`
}

function joinedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

async function responseJson(response: Response, service: string): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_CHARS) {
    throw new Error(`${service} response exceeded the configured safety limit`)
  }
  const raw = await response.text()
  if (raw.length > MAX_RESPONSE_CHARS) {
    throw new Error(`${service} response exceeded the configured safety limit`)
  }
  if (!response.ok) {
    throw new Error(
      `${service} request failed with HTTP ${String(response.status)}: ${redactEvidence(raw, 300)}`,
    )
  }
  try {
    return raw === '' ? {} : JSON.parse(raw)
  } catch (error) {
    throw new Error(`${service} returned invalid JSON`, { cause: error })
  }
}

abstract class JsonServiceClient {
  protected readonly options: KnowledgeServiceOptions
  private readonly fetcher: Fetcher

  constructor(options: KnowledgeServiceOptions, fetcher: Fetcher = globalThis.fetch) {
    this.options = options
    this.fetcher = fetcher
  }

  protected async request(
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<unknown> {
    const auth = authorization(this.options)
    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    if (auth !== undefined) headers.set('authorization', auth)
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }
    const response = await this.fetcher(new URL(path, this.options.baseUrl), {
      ...init,
      headers,
      signal: joinedSignal(signal, this.options.timeoutMs),
    })
    return await responseJson(response, this.constructor.name)
  }
}

export function normalizeKnowledgeBaseUrl(
  name: string,
  value: string,
  allowRemote: boolean,
): string {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new Error(`dsh-redteam: ${name} must be a valid URL`, { cause: error })
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(`dsh-redteam: ${name} must be HTTP(S) and must not contain credentials`)
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error(`dsh-redteam: ${name} must not contain a query or fragment`)
  }
  const loopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (!loopback && (!allowRemote || url.protocol !== 'https:')) {
    throw new Error(
      `dsh-redteam: ${name} must be loopback, or an HTTPS URL with allowRemoteKnowledgeServices enabled`,
    )
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.toString()
}

export class GraphitiClient extends JsonServiceClient {
  async health(signal?: AbortSignal): Promise<boolean> {
    const value = record(await this.request('healthcheck', {}, signal))
    return value?.status === 'healthy'
  }

  async addEvent(event: ProjectMemoryEvent, signal?: AbortSignal): Promise<string> {
    const result = record(
      await this.request(
        'messages',
        {
          body: JSON.stringify({
            group_id: event.projectId,
            messages: [
              {
                content: serializeProjectMemoryEvent(event),
                name: event.title,
                role: 'dsh-redteam',
                role_type: 'system',
                source_description: 'dsh-redteam structured project memory',
                timestamp: event.occurredAt,
                uuid: event.eventId,
              },
            ],
          }),
          method: 'POST',
        },
        signal,
      ),
    )
    if (result?.success !== true) throw new Error('Graphiti did not accept the memory event')
    return event.eventId
  }

  async recall(
    projectId: string,
    query: string | undefined,
    limit: number,
    signal?: AbortSignal,
  ): Promise<ProjectRecallResult> {
    const episodeValue = await this.request(
      `episodes/${encodeURIComponent(projectId)}?last_n=${String(limit)}`,
      {},
      signal,
    )
    const episodes = Array.isArray(episodeValue) ? episodeValue : []
    const events = episodes
      .map((episode) => text(record(episode)?.content))
      .map((content) => (content === undefined ? undefined : parseProjectMemoryEvent(content)))
      .filter(
        (event): event is ProjectMemoryEvent =>
          event !== undefined && event.projectId === projectId,
      )
    let facts: ProjectMemoryFact[] = []
    if (query !== undefined) {
      const search = record(
        await this.request(
          'search',
          {
            body: JSON.stringify({ group_ids: [projectId], max_facts: limit, query }),
            method: 'POST',
          },
          signal,
        ),
      )
      facts = (Array.isArray(search?.facts) ? search.facts : [])
        .map((item): ProjectMemoryFact | undefined => {
          const value = record(item)
          const id = text(value?.uuid)
          const fact = text(value?.fact)
          if (id === undefined || fact === undefined) return undefined
          const episodeIds = Array.isArray(value?.episodes)
            ? value.episodes.filter((episode): episode is string => typeof episode === 'string')
            : []
          const validAt = text(value?.valid_at)
          const invalidAt = text(value?.invalid_at)
          return {
            episodeIds,
            fact: redactEvidence(fact, 1_000),
            id,
            ...(validAt === undefined ? {} : { validAt }),
            ...(invalidAt === undefined ? {} : { invalidAt }),
          }
        })
        .filter((fact): fact is ProjectMemoryFact => fact !== undefined)
    }
    return { events, facts, projectId }
  }
}

function ragFlowData(value: unknown): unknown {
  const response = record(value)
  if (response === undefined || response.code !== 0) {
    throw new Error(
      `RAGFlow request failed: ${redactEvidence(text(response?.message) ?? 'unknown error', 300)}`,
    )
  }
  return response.data
}

export class RagFlowClient extends JsonServiceClient {
  readonly ragflowOptions: RagFlowOptions

  constructor(options: RagFlowOptions, fetcher: Fetcher = globalThis.fetch) {
    super(options, fetcher)
    this.ragflowOptions = options
  }

  async health(signal?: AbortSignal): Promise<boolean> {
    const value = await this.request('api/v1/datasets?page=1&page_size=1', {}, signal)
    ragFlowData(value)
    return true
  }

  async promote(
    projectId: string,
    episodeId: string,
    event: ProjectMemoryEvent,
    knowledgeType: LongTermKnowledgeType,
    signal?: AbortSignal,
  ): Promise<KnowledgePromotionResult> {
    const datasetId = this.ragflowOptions.datasets[knowledgeType]
    if (datasetId === undefined)
      throw new Error(`no RAGFlow dataset is configured for ${knowledgeType}`)
    const filename = `dsh-${knowledgeType}-${event.eventId}.md`
    const created = ragFlowData(
      await this.request(
        `api/v1/datasets/${encodeURIComponent(datasetId)}/documents?type=empty`,
        { body: JSON.stringify({ name: filename }), method: 'POST' },
        signal,
      ),
    )
    const createdRecord = record(Array.isArray(created) ? created[0] : created)
    const documentId = text(createdRecord?.id)
    if (documentId === undefined) throw new Error('RAGFlow did not return a document id')
    const chunkData = record(
      ragFlowData(
        await this.request(
          `api/v1/datasets/${encodeURIComponent(datasetId)}/documents/${encodeURIComponent(documentId)}/chunks`,
          {
            body: JSON.stringify({
              content: renderKnowledgeDocument(event),
              important_keywords: [knowledgeType, event.kind, ...event.tags].slice(0, 20),
            }),
            method: 'POST',
          },
          signal,
        ),
      ),
    )
    const chunkId = text(record(chunkData?.chunk)?.id) ?? text(chunkData?.id)
    if (chunkId === undefined) throw new Error('RAGFlow did not return a chunk id')
    return { chunkId, datasetId, documentId, episodeId, knowledgeType, projectId }
  }

  async search(
    query: string,
    datasetTypes: readonly LongTermKnowledgeType[],
    limit: number,
    signal?: AbortSignal,
  ): Promise<KnowledgeSearchResult> {
    const datasetIds = datasetTypes.map((type) => {
      const datasetId = this.ragflowOptions.datasets[type]
      if (datasetId === undefined) throw new Error(`no RAGFlow dataset is configured for ${type}`)
      return datasetId
    })
    const data = record(
      ragFlowData(
        await this.request(
          'api/v1/retrieval',
          {
            body: JSON.stringify({
              dataset_ids: datasetIds,
              document_ids: [],
              keyword: true,
              page: 1,
              page_size: limit,
              question: query,
              similarity_threshold: 0.2,
              top_k: 128,
              use_kg: true,
              vector_similarity_weight: 0.3,
            }),
            method: 'POST',
          },
          signal,
        ),
      ),
    )
    const chunks = (Array.isArray(data?.chunks) ? data.chunks : [])
      .map((item): LongTermKnowledgeChunk | undefined => {
        const value = record(item)
        const id = text(value?.id) ?? text(value?.chunk_id)
        const content = text(value?.content) ?? text(value?.content_with_weight)
        if (id === undefined || content === undefined) return undefined
        const documentId = text(value?.document_id) ?? text(value?.doc_id)
        const documentName = text(value?.document_name) ?? text(value?.docnm_kwd)
        const similarity = number(value?.similarity)
        return {
          content: redactEvidence(content, 2_000),
          id,
          ...(documentId === undefined ? {} : { documentId }),
          ...(documentName === undefined ? {} : { documentName }),
          ...(similarity === undefined ? {} : { similarity }),
        }
      })
      .filter((chunk): chunk is LongTermKnowledgeChunk => chunk !== undefined)
    return { chunks, datasetTypes: [...datasetTypes] }
  }
}
