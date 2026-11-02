import type { DashboardConversationSnapshot, ToolResultNode } from './runtime-contract.js'

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type FindingStatus = 'candidate' | 'confirmed' | 'fixed' | 'accepted'

export interface FindingPreview {
  readonly category: string | undefined
  readonly id: string
  readonly location: string
  readonly severity: Severity
  readonly status: FindingStatus
  readonly title: string
}

export interface ScanSummary {
  readonly assessmentId: string
  readonly filesScanned: number
  readonly findingCount: number
  readonly truncated: boolean
}

export interface ReportSummary {
  readonly findingCount: number
  readonly format: string
  readonly path: string
}

export interface AssetMapSummary {
  readonly graphId: string
  readonly nodeCount: number
  readonly edgeCount: number
  readonly sourceCount: number
  readonly frontierCount: number
  readonly completedCount: number
  readonly seed: AssetNodePreview | undefined
  readonly frontier: readonly AssetNodePreview[]
  readonly inventory: AssetInventorySummary | undefined
}

export interface AssetInventorySummary {
  readonly typeCounts: {
    readonly organization: number
    readonly product: number
    readonly infrastructure: number
    readonly supplier: number
    readonly domain: number
    readonly ip: number
    readonly network: number
    readonly url: number
    readonly technology: number
    readonly asn: number
    readonly certificate: number
  }
  readonly domainCounts: {
    readonly registrable: number
    readonly subdomain: number
    readonly unclassified: number
  }
  readonly ipCounts: {
    readonly ipv4: number
    readonly ipv6: number
  }
}

export interface AssetNodePreview {
  readonly id: string
  readonly label: string
  readonly type: string
  readonly depth: number
  readonly expanded: boolean
}

export interface ProjectSummary {
  readonly currentProjectId: string | undefined
  readonly currentProjectName: string | undefined
  readonly startedAt: string | undefined
  readonly storageAvailable: boolean
  readonly eventCount: number
  readonly completedEventCount: number
  readonly pendingEventCount: number
  readonly vulnerabilityEventCount: number
}

export interface DashboardState {
  readonly assetMap: AssetMapSummary | undefined
  readonly findings: readonly FindingPreview[]
  readonly findingsTotal: number | undefined
  readonly project: ProjectSummary | undefined
  readonly report: ReportSummary | undefined
  readonly runningTool: string | undefined
  readonly scan: ScanSummary | undefined
}

const REDTEAM_TOOLS = new Set([
  'redteam_status',
  'redteam_knowledge_status',
  'redteam_project_start',
  'redteam_project_remember',
  'redteam_project_recall',
  'redteam_knowledge_upsert',
  'redteam_knowledge_read',
  'redteam_knowledge_tree',
  'redteam_knowledge_grep',
  'redteam_knowledge_search',
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

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function textContent(node: ToolResultNode): string | undefined {
  const text = node.content
    .flatMap((block) =>
      block.type === 'text' && typeof block.text === 'string' ? [block.text] : [],
    )
    .join('\n')
    .trim()
  return text === '' ? undefined : text
}

function parseJson(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined
  const candidate = text.startsWith('```')
    ? text.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')
    : text
  try {
    return record(JSON.parse(candidate))
  } catch {
    return undefined
  }
}

function scanSummary(value: Record<string, unknown>): ScanSummary | undefined {
  const assessmentId = value.assessmentId
  const filesScanned = finiteNumber(value.filesScanned)
  const findingCount = finiteNumber(value.findingCount)
  if (
    typeof assessmentId !== 'string' ||
    filesScanned === undefined ||
    findingCount === undefined ||
    typeof value.truncated !== 'boolean'
  ) {
    return undefined
  }
  return { assessmentId, filesScanned, findingCount, truncated: value.truncated }
}

function reportSummary(value: Record<string, unknown>): ReportSummary | undefined {
  const findingCount = finiteNumber(value.findingCount)
  if (
    findingCount === undefined ||
    typeof value.format !== 'string' ||
    typeof value.path !== 'string'
  ) {
    return undefined
  }
  return { findingCount, format: value.format, path: value.path }
}

function assetNodePreview(value: unknown): AssetNodePreview | undefined {
  const node = record(value)
  if (
    node === undefined ||
    typeof node.id !== 'string' ||
    typeof node.label !== 'string' ||
    typeof node.type !== 'string' ||
    finiteNumber(node.depth) === undefined ||
    typeof node.expanded !== 'boolean'
  ) {
    return undefined
  }
  return {
    depth: node.depth as number,
    expanded: node.expanded,
    id: node.id,
    label: node.label,
    type: node.type,
  }
}

function nonNegativeCount(value: unknown): number | undefined {
  const count = finiteNumber(value)
  return count !== undefined && Number.isInteger(count) && count >= 0 ? count : undefined
}

function assetInventorySummary(
  value: unknown,
  nodeCount: number,
): AssetInventorySummary | undefined {
  const summary = record(value)
  const typeCounts = record(summary?.typeCounts)
  const domainCounts = record(summary?.domainCounts)
  const ipCounts = record(summary?.ipCounts)
  if (
    summary === undefined ||
    typeCounts === undefined ||
    domainCounts === undefined ||
    ipCounts === undefined
  ) {
    return undefined
  }
  const counts = {
    asn: nonNegativeCount(typeCounts.asn),
    certificate: nonNegativeCount(typeCounts.certificate),
    domain: nonNegativeCount(typeCounts.domain),
    infrastructure: nonNegativeCount(typeCounts.infrastructure) ?? 0,
    ip: nonNegativeCount(typeCounts.ip),
    network: nonNegativeCount(typeCounts.network),
    organization: nonNegativeCount(typeCounts.organization),
    product: nonNegativeCount(typeCounts.product),
    supplier: nonNegativeCount(typeCounts.supplier) ?? 0,
    technology: nonNegativeCount(typeCounts.technology),
    url: nonNegativeCount(typeCounts.url),
  }
  const domains = {
    registrable: nonNegativeCount(domainCounts.registrable),
    subdomain: nonNegativeCount(domainCounts.subdomain),
    unclassified: nonNegativeCount(domainCounts.unclassified),
  }
  const ips = {
    ipv4: nonNegativeCount(ipCounts.ipv4),
    ipv6: nonNegativeCount(ipCounts.ipv6),
  }
  if (
    Object.values(counts).some((count) => count === undefined) ||
    Object.values(domains).some((count) => count === undefined) ||
    Object.values(ips).some((count) => count === undefined) ||
    Object.values(counts).reduce<number>((total, count) => total + (count ?? 0), 0) !== nodeCount ||
    domains.registrable! + domains.subdomain! + domains.unclassified! !== counts.domain ||
    ips.ipv4! + ips.ipv6! !== counts.ip
  ) {
    return undefined
  }
  return {
    domainCounts: domains as AssetInventorySummary['domainCounts'],
    ipCounts: ips as AssetInventorySummary['ipCounts'],
    typeCounts: counts as AssetInventorySummary['typeCounts'],
  }
}

function assetMapSummary(value: Record<string, unknown>): AssetMapSummary | undefined {
  const summary = record(value.summary) ?? value
  const graphId = value.graphId ?? summary.graphId
  const nodeCount = finiteNumber(summary.nodeCount)
  const edgeCount = finiteNumber(summary.edgeCount)
  const sourceCount = finiteNumber(summary.sourceCount)
  const frontierCount = finiteNumber(summary.frontierCount)
  if (
    typeof graphId !== 'string' ||
    nodeCount === undefined ||
    edgeCount === undefined ||
    sourceCount === undefined ||
    frontierCount === undefined
  ) {
    return undefined
  }
  const seed = assetNodePreview(summary.seed)
  const frontier = Array.isArray(value.frontier)
    ? value.frontier
        .map(assetNodePreview)
        .filter((node) => node !== undefined)
        .slice(0, 20)
    : []
  return {
    completedCount: Math.max(0, nodeCount - frontierCount),
    edgeCount,
    frontier,
    frontierCount,
    graphId,
    inventory: assetInventorySummary(summary, nodeCount),
    nodeCount,
    seed,
    sourceCount,
  }
}

function projectSummary(value: Record<string, unknown>): ProjectSummary | undefined {
  const local = record(value.local)
  if (local === undefined || typeof local.available !== 'boolean') return undefined
  const project = record(value.currentProject)
  return {
    currentProjectId:
      project !== undefined && typeof project.projectId === 'string'
        ? project.projectId
        : undefined,
    currentProjectName:
      project !== undefined && typeof project.name === 'string' ? project.name : undefined,
    startedAt:
      project !== undefined && typeof project.startedAt === 'string'
        ? project.startedAt
        : undefined,
    storageAvailable: local.available,
    eventCount: 0,
    completedEventCount: 0,
    pendingEventCount: 0,
    vulnerabilityEventCount: 0,
  }
}

function startedProjectSummary(value: Record<string, unknown>): ProjectSummary | undefined {
  if (
    typeof value.projectId !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.startedAt !== 'string'
  ) {
    return undefined
  }
  return {
    completedEventCount: 0,
    currentProjectId: value.projectId,
    currentProjectName: value.name,
    eventCount: 0,
    pendingEventCount: 0,
    startedAt: value.startedAt,
    storageAvailable: true,
    vulnerabilityEventCount: 0,
  }
}

function withProjectEvents(
  project: ProjectSummary | undefined,
  value: Record<string, unknown>,
): ProjectSummary | undefined {
  if (typeof value.projectId !== 'string' || !Array.isArray(value.events)) return project
  const events = value.events.map(record).filter((event) => event !== undefined)
  const completedEventCount = events.filter(
    (event) =>
      event.status === 'confirmed' ||
      event.status === 'resolved' ||
      event.status === 'dismissed' ||
      event.status === 'archived',
  ).length
  return {
    completedEventCount,
    currentProjectId: project?.currentProjectId ?? value.projectId,
    currentProjectName: project?.currentProjectName,
    eventCount: events.length,
    pendingEventCount: events.filter((event) => event.status === 'active').length,
    startedAt: project?.startedAt,
    storageAvailable: project?.storageAvailable ?? true,
    vulnerabilityEventCount: events.filter((event) => event.kind === 'vulnerability').length,
  }
}

function severity(value: unknown): Severity | undefined {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low'
    ? value
    : undefined
}

function findingStatus(value: unknown): FindingStatus {
  return value === 'confirmed' || value === 'fixed' || value === 'accepted' ? value : 'candidate'
}

function findingPreview(value: unknown): FindingPreview | undefined {
  const item = record(value)
  if (item === undefined) return undefined
  const level = severity(item.severity)
  const location = record(item.location)
  if (
    level === undefined ||
    typeof item.id !== 'string' ||
    typeof item.title !== 'string' ||
    location === undefined ||
    typeof location.path !== 'string'
  ) {
    return undefined
  }
  const line = finiteNumber(location.line)
  return {
    category: typeof item.category === 'string' ? item.category : undefined,
    id: item.id,
    location: line === undefined ? location.path : `${location.path}:${line}`,
    severity: level,
    status: findingStatus(item.status),
    title: item.title,
  }
}

function resultNodes(snapshot: DashboardConversationSnapshot): ToolResultNode[] {
  return snapshot.nodes.filter(
    (node): node is ToolResultNode =>
      node.kind === 'tool-result' &&
      node.isError === false &&
      node.call !== null &&
      node.call !== undefined &&
      node.callId !== undefined &&
      node.content !== undefined &&
      REDTEAM_TOOLS.has(node.call.name),
  )
}

/** Fold the current conversation into the small, redacted state shown by the dashboard. */
export function deriveDashboardState(
  snapshot: DashboardConversationSnapshot | undefined,
): DashboardState {
  if (snapshot === undefined) {
    return {
      assetMap: undefined,
      findings: [],
      findingsTotal: undefined,
      project: undefined,
      report: undefined,
      runningTool: undefined,
      scan: undefined,
    }
  }

  let scan: ScanSummary | undefined
  let assetMap: AssetMapSummary | undefined
  let report: ReportSummary | undefined
  let findings: readonly FindingPreview[] = []
  let findingsTotal: number | undefined
  let project: ProjectSummary | undefined
  let projectRecall: Record<string, unknown> | undefined
  let frontierPreview: readonly AssetNodePreview[] | undefined
  let seedPreview: AssetNodePreview | undefined
  for (const node of resultNodes(snapshot).toReversed()) {
    const name = node.call?.name
    const value = parseJson(textContent(node))
    if (value === undefined) continue
    if (name === 'redteam_scan' && scan === undefined) scan = scanSummary(value)
    if (name?.startsWith('redteam_asset_map_') === true && assetMap === undefined) {
      assetMap = assetMapSummary(value)
    }
    if (name?.startsWith('redteam_asset_map_') === true) {
      const candidate = assetMapSummary(value)
      if (candidate !== undefined) {
        if (frontierPreview === undefined && candidate.frontier.length > 0) {
          frontierPreview = candidate.frontier
        }
        seedPreview ??= candidate.seed
      }
    }
    if (name === 'redteam_report' && report === undefined) report = reportSummary(value)
    if (name === 'redteam_knowledge_status' && project === undefined) {
      project = projectSummary(value)
    }
    if (name === 'redteam_project_start' && project === undefined) {
      project = startedProjectSummary(value)
    }
    if (name === 'redteam_project_recall' && projectRecall === undefined) projectRecall = value
    if (name === 'redteam_findings' && findingsTotal === undefined) {
      findingsTotal = finiteNumber(value.total)
      findings = Array.isArray(value.findings)
        ? value.findings
            .map(findingPreview)
            .filter((item) => item !== undefined)
            .slice(0, 20)
        : []
    }
  }

  if (assetMap !== undefined) {
    assetMap = {
      ...assetMap,
      frontier: frontierPreview ?? assetMap.frontier,
      seed: seedPreview ?? assetMap.seed,
    }
  }
  if (projectRecall !== undefined) project = withProjectEvents(project, projectRecall)

  const runningTool = snapshot.runningCalls.find((call) => REDTEAM_TOOLS.has(call.name))?.name
  return { assetMap, findings, findingsTotal, project, report, runningTool, scan }
}
