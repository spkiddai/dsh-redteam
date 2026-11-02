export type FindingCategory = 'configuration' | 'secret' | 'source'

export type FindingConfidence = 'high' | 'medium'

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low'

export type FindingStatus = 'candidate' | 'confirmed' | 'fixed' | 'accepted'

export interface ScanRule {
  readonly id: string
  readonly category: FindingCategory
  readonly title: string
  readonly severity: FindingSeverity
  readonly confidence: FindingConfidence
  readonly cwe: string
  readonly pattern: RegExp
  readonly remediation: string
  readonly pathPattern?: RegExp
  readonly version: string
}

export interface FindingStatusChange {
  readonly from: FindingStatus
  readonly to: FindingStatus
  readonly reason: string
  readonly changedAt: string
}

export type ReportFormat = 'html' | 'json' | 'markdown' | 'sarif' | 'word' | 'xml'

export type AssetType =
  | 'organization'
  | 'product'
  | 'infrastructure'
  | 'supplier'
  | 'domain'
  | 'ip'
  | 'network'
  | 'url'
  | 'technology'
  | 'asn'
  | 'certificate'

export type AssetRelation =
  | 'owns'
  | 'subsidiary_of'
  | 'invests_in'
  | 'partners_with'
  | 'produces'
  | 'operates'
  | 'uses_domain'
  | 'resolves_to'
  | 'hosted_on'
  | 'uses_technology'
  | 'belongs_to_asn'
  | 'certified_by'
  | 'related_to'

export type AssetConfidence = 'high' | 'medium' | 'low'

export interface AssetRef {
  readonly type: AssetType
  readonly value: string
  readonly label?: string
}

export interface AssetSourceInput {
  readonly url: string
  readonly title?: string
  readonly excerpt?: string
  readonly observedAt?: string
}

export interface AssetObservation {
  readonly subject: AssetRef
  readonly relation?: AssetRelation
  readonly object?: AssetRef
  readonly confidence: AssetConfidence
  readonly source: AssetSourceInput
}

export interface AssetSource {
  readonly id: string
  readonly url: string
  readonly title?: string
  readonly excerpt?: string
  readonly observedAt: string
}

export interface AssetNode {
  readonly id: string
  readonly type: AssetType
  readonly value: string
  readonly label: string
  readonly depth: number
  readonly confidence: AssetConfidence
  readonly expanded: boolean
  readonly sourceIds: string[]
}

export interface AssetEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly relation: AssetRelation
  readonly confidence: AssetConfidence
  readonly sourceIds: string[]
}

export interface AssetGraph {
  readonly schemaVersion: 1
  readonly id: string
  readonly workspaceRoot: string
  readonly seedNodeId: string
  readonly maxDepth: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly nodes: readonly AssetNode[]
  readonly edges: readonly AssetEdge[]
  readonly sources: readonly AssetSource[]
}

export type AssetGraphReportFormat = 'html' | 'json' | 'markdown' | 'graphml'

export type ProjectMemoryKind =
  | 'project'
  | 'scope'
  | 'asset'
  | 'finding'
  | 'vulnerability'
  | 'technique'
  | 'src_case'
  | 'decision'
  | 'task'
  | 'note'

export type MemoryAuthority = 'authoritative' | 'observed' | 'inferred'

export type MemoryStatus = 'active' | 'confirmed' | 'resolved' | 'dismissed' | 'archived'

export type MemorySensitivity = 'internal' | 'reusable' | 'restricted'

export type LongTermKnowledgeType = 'asset' | 'vulnerability' | 'technique' | 'src_case' | 'source'

export type KnowledgeReadLevel = 0 | 1 | 2

export type KnowledgeIndexState = 'ready' | 'rebuilt' | 'degraded'

export interface KnowledgeServiceOptions {
  readonly baseUrl: string
  readonly authTokenEnv?: string
  readonly timeoutMs: number
}

export interface RagFlowOptions extends KnowledgeServiceOptions {
  readonly datasets: Partial<Record<LongTermKnowledgeType, string>>
}

export interface ProjectMemoryEvent {
  readonly schemaVersion: 1
  readonly eventId: string
  readonly projectId: string
  readonly kind: ProjectMemoryKind
  readonly title: string
  readonly content: string
  readonly authority: MemoryAuthority
  readonly confidence: AssetConfidence
  readonly status: MemoryStatus
  readonly sensitivity: MemorySensitivity
  readonly promotable: boolean
  readonly tags: string[]
  readonly sourceUrls: string[]
  readonly occurredAt: string
  readonly recordedAt: string
}

export interface KnowledgeDocument {
  readonly schemaVersion: 1
  readonly id: string
  readonly uri: string
  readonly key: string
  readonly type: LongTermKnowledgeType
  readonly title: string
  readonly aliases: string[]
  readonly identifiers: string[]
  readonly tags: string[]
  readonly products: string[]
  readonly versions: string[]
  readonly environments: string[]
  readonly abstract: string
  readonly overview: string
  readonly content: string
  readonly authority: MemoryAuthority
  readonly confidence: AssetConfidence
  readonly status: MemoryStatus
  readonly sensitivity: MemorySensitivity
  readonly sourceUrls: string[]
  readonly relatedUris: string[]
  readonly projectIds: string[]
  readonly eventIds: string[]
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface KnowledgeDocumentInput {
  readonly type: LongTermKnowledgeType
  readonly title: string
  readonly key?: string
  readonly aliases?: readonly string[]
  readonly identifiers?: readonly string[]
  readonly tags?: readonly string[]
  readonly products?: readonly string[]
  readonly versions?: readonly string[]
  readonly environments?: readonly string[]
  readonly abstract?: string
  readonly overview?: string
  readonly content: string
  readonly authority: MemoryAuthority
  readonly confidence: AssetConfidence
  readonly status: MemoryStatus
  readonly sensitivity: MemorySensitivity
  readonly sourceUrls?: readonly string[]
  readonly relatedUris?: readonly string[]
  readonly projectIds?: readonly string[]
  readonly eventIds?: readonly string[]
  readonly expectedRevision?: number
}

export interface KnowledgeDocumentSummary {
  readonly id: string
  readonly uri: string
  readonly type: LongTermKnowledgeType
  readonly title: string
  readonly abstract: string
  readonly tags: string[]
  readonly identifiers: string[]
  readonly revision: number
  readonly updatedAt: string
}

export interface KnowledgeUpsertResult {
  readonly created: boolean
  readonly document: KnowledgeDocumentSummary
}

export interface KnowledgeReadResult extends KnowledgeDocumentSummary {
  readonly level: KnowledgeReadLevel
  readonly content: string
  readonly aliases: string[]
  readonly products: string[]
  readonly versions: string[]
  readonly environments: string[]
  readonly authority: MemoryAuthority
  readonly confidence: AssetConfidence
  readonly status: MemoryStatus
  readonly sensitivity: MemorySensitivity
  readonly sourceUrls: string[]
  readonly relatedUris: string[]
  readonly projectIds: string[]
  readonly eventIds: string[]
}

export interface KnowledgeTreeNode {
  readonly uri: string
  readonly kind: 'namespace' | 'document'
  readonly title: string
  readonly type?: LongTermKnowledgeType
  readonly childCount: number
}

export interface KnowledgeTreeResult {
  readonly prefix: string
  readonly nodes: KnowledgeTreeNode[]
}

export interface KnowledgeGrepMatch {
  readonly uri: string
  readonly type: LongTermKnowledgeType
  readonly title: string
  readonly line: number
  readonly column: number
  readonly snippet: string
}

export interface KnowledgeGrepResult {
  readonly query: string
  readonly matches: KnowledgeGrepMatch[]
}

export interface ProjectPointer {
  readonly projectId: string
  readonly name: string
  readonly startedAt: string
}

export interface KnowledgeStatus {
  readonly local: {
    readonly available: boolean
    readonly documentCount: number
    readonly projectCount: number
    readonly eventCount: number
    readonly indexVersion: number
    readonly indexState: KnowledgeIndexState
  }
  readonly graphiti: {
    readonly configured: boolean
    readonly reachable: boolean
  }
  readonly ragflow: {
    readonly configured: boolean
    readonly reachable: boolean
    readonly datasetTypes: LongTermKnowledgeType[]
  }
  readonly currentProject: ProjectPointer | null
}

export interface ProjectStartResult extends ProjectPointer {
  readonly episodeId: string
  readonly extensionWarnings?: string[]
}

export interface ProjectRememberResult {
  readonly projectId: string
  readonly episodeId: string
  readonly event: ProjectMemoryEvent
  readonly extensionWarnings?: string[]
}

export interface ProjectMemoryFact {
  readonly id: string
  readonly fact: string
  readonly validAt?: string
  readonly invalidAt?: string
  readonly episodeIds: string[]
}

export interface ProjectRecallResult {
  readonly projectId: string
  readonly events: ProjectMemoryEvent[]
  readonly facts: ProjectMemoryFact[]
  readonly extensionWarnings?: string[]
}

export interface LongTermKnowledgeChunk {
  readonly id: string
  readonly uri?: string
  readonly type?: LongTermKnowledgeType
  readonly title?: string
  readonly level?: KnowledgeReadLevel
  readonly source?: 'builtin' | 'ragflow'
  readonly documentId?: string
  readonly documentName?: string
  readonly content: string
  readonly similarity?: number
}

export interface KnowledgeSearchResult {
  readonly datasetTypes: LongTermKnowledgeType[]
  readonly chunks: LongTermKnowledgeChunk[]
  readonly extensionWarnings?: string[]
}

export interface KnowledgePromotionResult {
  readonly projectId: string
  readonly episodeId: string
  readonly knowledgeType: LongTermKnowledgeType
  readonly datasetId: string
  readonly documentId: string
  readonly chunkId: string
  readonly uri?: string
  readonly extensionWarnings?: string[]
  readonly ragflow?: {
    readonly datasetId: string
    readonly documentId: string
    readonly chunkId: string
  }
}

export interface SourceLocation {
  readonly path: string
  readonly line: number
  readonly column: number
}

export interface Finding {
  readonly id: string
  readonly ruleId: string
  readonly category: FindingCategory
  readonly title: string
  readonly severity: FindingSeverity
  readonly confidence: FindingConfidence
  readonly status: FindingStatus
  readonly cwe: string
  readonly location: SourceLocation
  readonly evidence: string
  readonly remediation: string
  readonly detectedAt: string
  readonly ruleVersion?: string
  readonly statusHistory?: FindingStatusChange[]
}

export interface Assessment {
  readonly schemaVersion: 1
  readonly id: string
  readonly mode: 'review'
  readonly workspaceRoot: string
  readonly scanRoot: string
  readonly startedAt: string
  readonly completedAt: string
  readonly filesScanned: number
  readonly filesSkipped: number
  readonly truncated: boolean
  readonly findings: readonly Finding[]
}

export interface ScanOptions {
  readonly workspaceRoot: string
  readonly scanPath?: string
  readonly categories: readonly FindingCategory[]
  readonly ignoreDirectories: readonly string[]
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly maxFindings: number
  readonly rules?: readonly ScanRule[]
  readonly signal?: AbortSignal
}

export interface RedTeamOptions extends Omit<ScanOptions, 'scanPath'> {
  readonly storageRoot: string
  readonly knowledgeRoot?: string
  readonly knowledgeMaxDocuments?: number
  readonly knowledgeMaxProjectEvents?: number
  readonly enforceWorkspaceScope: boolean
  readonly assetGraphMaxDepth: number
  readonly assetGraphMaxNodes: number
  readonly assetGraphMaxEdges: number
  readonly assetGraphMaxSources: number
  readonly graphiti?: KnowledgeServiceOptions
  readonly ragflow?: RagFlowOptions
}

export interface AssetGraphSummary {
  readonly graphId: string
  readonly seed: AssetNode
  readonly nodeCount: number
  readonly edgeCount: number
  readonly sourceCount: number
  readonly frontierCount: number
  readonly maxDepth: number
  readonly typeCounts: Readonly<Record<AssetType, number>>
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

export interface AssetGraphFrontierResult extends AssetGraphSummary {
  readonly frontier: AssetNode[]
}

export interface AssetGraphReportResult extends AssetGraphSummary {
  readonly format: AssetGraphReportFormat
  readonly path: string
}

export interface FindingUpdateResult {
  readonly assessmentId: string
  readonly finding: Finding
}

export interface ScanToolResult {
  readonly assessmentId: string
  readonly filesScanned: number
  readonly filesSkipped: number
  readonly findingCount: number
  readonly findingIds: string[]
  readonly truncated: boolean
}

export interface FindingListResult {
  readonly assessmentId: string
  readonly total: number
  readonly findings: Finding[]
}

export interface ReportResult {
  readonly assessmentId: string
  readonly findingCount: number
  readonly format: ReportFormat
  readonly path: string
}

export interface RedTeamStatus {
  readonly plugin: 'dsh-redteam'
  readonly version: '1.3.2'
  readonly mode: 'review'
  readonly workspaceRoot: string
  readonly storageRoot: string
  readonly activeVerification: false
  readonly categories: FindingCategory[]
  readonly latestAssessmentId: string | null
  readonly latestAssetGraphId: string | null
  readonly currentProjectId: string | null
  readonly ruleCount: number
  readonly rulesetVersion: string
}
