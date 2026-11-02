import { createHash, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { getDomain } from 'tldts'
import { redactEvidence } from './redact.js'
import type {
  AssetConfidence,
  AssetGraph,
  AssetGraphFrontierResult,
  AssetGraphSummary,
  AssetNode,
  AssetObservation,
  AssetRef,
  AssetRelation,
  AssetSource,
  AssetType,
} from './types.js'

export interface AssetGraphLimits {
  readonly maxNodes: number
  readonly maxEdges: number
  readonly maxSources: number
}

const CONFIDENCE_RANK: Readonly<Record<AssetConfidence, number>> = { high: 3, medium: 2, low: 1 }
const DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u
const ASN = /^AS[0-9]{1,10}$/u
const SENSITIVE_QUERY_PARAMETER =
  /(?:authorization|auth|api[_-]?key|cookie|credential|password|secret|session|token)/iu

function normalizedNetwork(
  value: string,
): { readonly type: 4 | 6; readonly value: string } | undefined {
  const separator = value.lastIndexOf('/')
  if (separator <= 0 || separator === value.length - 1) return undefined
  const address = value.slice(0, separator)
  const type = isIP(address)
  if (type !== 4 && type !== 6) return undefined
  const prefixText = value.slice(separator + 1)
  if (!/^[0-9]{1,3}$/u.test(prefixText)) return undefined
  const prefix = Number(prefixText)
  if (prefix > (type === 4 ? 32 : 128)) return undefined
  return { type, value: `${address.toLowerCase()}/${String(prefix)}` }
}

function hash(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 20)}`
}

function bounded(name: string, value: string, maximum: number): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new Error(`${name} must contain between 1 and ${String(maximum)} characters`)
  }
  return normalized
}

function normalizedUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (error) {
    throw new Error(`invalid asset source URL: ${value}`, { cause: error })
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`asset source URL must use http or https: ${value}`)
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('asset source URL must not contain credentials')
  }
  for (const key of parsed.searchParams.keys()) {
    if (SENSITIVE_QUERY_PARAMETER.test(key)) parsed.searchParams.set(key, '[redacted]')
  }
  parsed.hash = ''
  return parsed.toString()
}

/** Infer a seed type without making a network request. */
export function inferAssetType(value: string): AssetType {
  const candidate = value.trim()
  if (normalizedNetwork(candidate) !== undefined) return 'network'
  if (isIP(candidate) !== 0) return 'ip'
  if (/^https?:\/\//iu.test(candidate)) return 'url'
  if (DOMAIN.test(candidate.toLowerCase().replace(/\.$/u, ''))) return 'domain'
  if (ASN.test(candidate.toUpperCase())) return 'asn'
  return 'organization'
}

function normalizeAssetValue(type: AssetType, value: string): string {
  const candidate = bounded('asset value', value, 500)
  if (type === 'ip') {
    if (isIP(candidate) === 0) throw new Error(`invalid IP asset: ${candidate}`)
    return candidate.toLowerCase()
  }
  if (type === 'network') {
    const network = normalizedNetwork(candidate)
    if (network === undefined) throw new Error(`invalid network asset: ${candidate}`)
    return network.value
  }
  if (type === 'domain') {
    const domain = candidate.toLowerCase().replace(/\.$/u, '')
    if (!DOMAIN.test(domain)) throw new Error(`invalid domain asset: ${candidate}`)
    return domain
  }
  if (type === 'url') return normalizedUrl(candidate)
  if (type === 'asn') {
    const asn = candidate.toUpperCase()
    if (!ASN.test(asn)) throw new Error(`invalid ASN asset: ${candidate}`)
    return asn
  }
  return candidate.replace(/\s+/gu, ' ')
}

function normalizedRef(ref: AssetRef): Required<AssetRef> {
  const value = normalizeAssetValue(ref.type, ref.value)
  return {
    label: bounded('asset label', ref.label ?? value, 200),
    type: ref.type,
    value,
  }
}

function nodeId(ref: AssetRef): string {
  const normalized = normalizedRef(ref)
  return hash('asset', `${normalized.type}\0${normalized.value.toLocaleLowerCase('en-US')}`)
}

function graphId(now: Date): string {
  return `asset-${now
    .toISOString()
    .replace(/[-:.TZ]/gu, '')
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`
}

function stronger(a: AssetConfidence, b: AssetConfidence): AssetConfidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b
}

function withSource(sourceIds: readonly string[], sourceId: string): string[] {
  return sourceIds.includes(sourceId) ? [...sourceIds] : [...sourceIds, sourceId]
}

function sourceFor(observation: AssetObservation): AssetSource {
  const url = normalizedUrl(observation.source.url)
  const rawObservedAt = observation.source.observedAt ?? new Date().toISOString()
  const observedAt = new Date(rawObservedAt)
  if (Number.isNaN(observedAt.valueOf())) {
    throw new Error(`invalid asset source observation time: ${rawObservedAt}`)
  }
  return {
    id: hash('source', url),
    observedAt: observedAt.toISOString(),
    url,
    ...(observation.source.title === undefined
      ? {}
      : { title: bounded('source title', observation.source.title, 300) }),
    ...(observation.source.excerpt === undefined
      ? {}
      : { excerpt: redactEvidence(observation.source.excerpt.trim(), 1_000) }),
  }
}

/** Create a graph with one unexpanded seed node. */
export function createAssetGraph(
  workspaceRoot: string,
  seed: AssetRef,
  maxDepth: number,
  now = new Date(),
): AssetGraph {
  const normalized = normalizedRef(seed)
  const id = nodeId(normalized)
  const timestamp = now.toISOString()
  return {
    createdAt: timestamp,
    edges: [],
    id: graphId(now),
    maxDepth,
    nodes: [
      {
        confidence: 'high',
        depth: 0,
        expanded: false,
        id,
        label: normalized.label,
        sourceIds: [],
        type: normalized.type,
        value: normalized.value,
      },
    ],
    schemaVersion: 1,
    seedNodeId: id,
    sources: [],
    updatedAt: timestamp,
    workspaceRoot,
  }
}

function upsertNode(
  nodes: Map<string, AssetNode>,
  ref: AssetRef,
  depth: number,
  confidence: AssetConfidence,
  sourceId: string,
  maxDepth: number,
): AssetNode {
  const normalized = normalizedRef(ref)
  const id = nodeId(normalized)
  const current = nodes.get(id)
  if (current === undefined && depth > maxDepth) {
    throw new Error(`asset observation exceeds graph max depth ${String(maxDepth)}`)
  }
  const next: AssetNode =
    current === undefined
      ? {
          confidence,
          depth,
          expanded: false,
          id,
          label: normalized.label,
          sourceIds: [sourceId],
          type: normalized.type,
          value: normalized.value,
        }
      : {
          ...current,
          confidence: stronger(current.confidence, confidence),
          depth: Math.min(current.depth, depth),
          label: current.label === current.value ? normalized.label : current.label,
          sourceIds: withSource(current.sourceIds, sourceId),
        }
  nodes.set(id, next)
  return next
}

function relationId(from: string, relation: AssetRelation, to: string): string {
  return hash('edge', `${from}\0${relation}\0${to}`)
}

/** Merge sourced observations and mark fully searched nodes as expanded. */
export function mergeAssetObservations(
  graph: AssetGraph,
  observations: readonly AssetObservation[],
  expanded: readonly AssetRef[],
  limits: AssetGraphLimits,
  now = new Date(),
): AssetGraph {
  if (observations.length > 100)
    throw new Error('at most 100 asset observations are allowed per call')
  if (expanded.length > 100) throw new Error('at most 100 expanded assets are allowed per call')
  const nodes = new Map(
    graph.nodes.map((node) => [node.id, { ...node, sourceIds: [...node.sourceIds] }]),
  )
  const edges = new Map(
    graph.edges.map((edge) => [edge.id, { ...edge, sourceIds: [...edge.sourceIds] }]),
  )
  const sources = new Map(graph.sources.map((source) => [source.id, source]))

  for (const observation of observations) {
    const source = sourceFor(observation)
    sources.set(source.id, sources.get(source.id) ?? source)
    const subjectId = nodeId(observation.subject)
    const knownSubject = nodes.get(subjectId)
    if (knownSubject === undefined) {
      throw new Error(`asset observation subject is not in the graph: ${observation.subject.value}`)
    }
    nodes.set(subjectId, {
      ...knownSubject,
      confidence: stronger(knownSubject.confidence, observation.confidence),
      sourceIds: withSource(knownSubject.sourceIds, source.id),
    })
    if (observation.object === undefined || observation.relation === undefined) {
      if (observation.object !== undefined || observation.relation !== undefined) {
        throw new Error('asset observation relation and object must be provided together')
      }
      continue
    }
    const object = upsertNode(
      nodes,
      observation.object,
      knownSubject.depth + 1,
      observation.confidence,
      source.id,
      graph.maxDepth,
    )
    const id = relationId(subjectId, observation.relation, object.id)
    const current = edges.get(id)
    edges.set(
      id,
      current === undefined
        ? {
            confidence: observation.confidence,
            from: subjectId,
            id,
            relation: observation.relation,
            sourceIds: [source.id],
            to: object.id,
          }
        : {
            ...current,
            confidence: stronger(current.confidence, observation.confidence),
            sourceIds: withSource(current.sourceIds, source.id),
          },
    )
  }

  for (const ref of expanded) {
    const id = nodeId(ref)
    const current = nodes.get(id)
    if (current === undefined) throw new Error(`expanded asset is not in the graph: ${ref.value}`)
    nodes.set(id, { ...current, expanded: true })
  }

  if (nodes.size > limits.maxNodes)
    throw new Error(`asset graph node limit exceeded: ${String(limits.maxNodes)}`)
  if (edges.size > limits.maxEdges)
    throw new Error(`asset graph edge limit exceeded: ${String(limits.maxEdges)}`)
  if (sources.size > limits.maxSources)
    throw new Error(`asset graph source limit exceeded: ${String(limits.maxSources)}`)
  return {
    ...graph,
    edges: [...edges.values()],
    nodes: [...nodes.values()],
    sources: [...sources.values()],
    updatedAt: now.toISOString(),
  }
}

export function assetGraphSummary(graph: AssetGraph): AssetGraphSummary {
  const seed = graph.nodes.find((node) => node.id === graph.seedNodeId)
  if (seed === undefined) throw new Error(`asset graph ${graph.id} has no seed node`)
  const typeCounts: Record<AssetType, number> = {
    asn: 0,
    certificate: 0,
    domain: 0,
    infrastructure: 0,
    ip: 0,
    network: 0,
    organization: 0,
    product: 0,
    supplier: 0,
    technology: 0,
    url: 0,
  }
  const domainCounts = { registrable: 0, subdomain: 0, unclassified: 0 }
  const ipCounts = { ipv4: 0, ipv6: 0 }
  for (const node of graph.nodes) {
    typeCounts[node.type] += 1
    if (node.type === 'domain') {
      const registrable = getDomain(node.value, { allowPrivateDomains: true })
      if (registrable === null) domainCounts.unclassified += 1
      else if (registrable.toLowerCase() === node.value.toLowerCase()) {
        domainCounts.registrable += 1
      } else domainCounts.subdomain += 1
    }
    if (node.type === 'ip') {
      const version = isIP(node.value)
      if (version === 4) ipCounts.ipv4 += 1
      if (version === 6) ipCounts.ipv6 += 1
    }
  }
  return {
    domainCounts,
    edgeCount: graph.edges.length,
    frontierCount: graph.nodes.filter((node) => !node.expanded && node.depth < graph.maxDepth)
      .length,
    graphId: graph.id,
    ipCounts,
    maxDepth: graph.maxDepth,
    nodeCount: graph.nodes.length,
    seed,
    sourceCount: graph.sources.length,
    typeCounts,
  }
}

/** Return the next bounded breadth-first expansion batch. */
export function assetGraphFrontier(graph: AssetGraph, limit: number): AssetGraphFrontierResult {
  return {
    ...assetGraphSummary(graph),
    frontier: graph.nodes
      .filter((node) => !node.expanded && node.depth < graph.maxDepth)
      .sort(
        (a, b) =>
          a.depth - b.depth || a.type.localeCompare(b.type) || a.value.localeCompare(b.value),
      )
      .slice(0, limit),
  }
}
