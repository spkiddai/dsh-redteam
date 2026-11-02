import { join } from 'node:path'
import { renderReport } from './report.js'
import { scanWorkspace } from './scanner.js'
import { AssessmentStore } from './store.js'
import { changeFindingStatus } from './finding-status.js'
import { RULESET_VERSION, SCAN_RULES } from './rules.js'
import {
  assetGraphFrontier,
  assetGraphSummary,
  createAssetGraph,
  inferAssetType,
  mergeAssetObservations,
} from './asset-graph.js'
import { AssetGraphStore } from './asset-graph-store.js'
import { renderAssetGraph } from './asset-graph-report.js'
import { GraphitiClient, RagFlowClient } from './knowledge-clients.js'
import { assertPromotable, createProjectId, createProjectMemoryEvent } from './knowledge.js'
import { ProjectPointerStore } from './project-pointer-store.js'
import { LocalKnowledgeStore } from './local-knowledge-store.js'
import type {
  Assessment,
  AssetConfidence,
  AssetGraph,
  AssetGraphFrontierResult,
  AssetGraphReportFormat,
  AssetGraphReportResult,
  AssetGraphSummary,
  AssetObservation,
  AssetRef,
  AssetType,
  FindingCategory,
  FindingListResult,
  FindingSeverity,
  FindingStatus,
  FindingUpdateResult,
  KnowledgePromotionResult,
  KnowledgeDocumentInput,
  KnowledgeGrepResult,
  KnowledgeReadLevel,
  KnowledgeReadResult,
  KnowledgeSearchResult,
  KnowledgeStatus,
  KnowledgeTreeResult,
  KnowledgeUpsertResult,
  LongTermKnowledgeChunk,
  LongTermKnowledgeType,
  MemoryAuthority,
  MemorySensitivity,
  MemoryStatus,
  ProjectMemoryKind,
  ProjectRecallResult,
  ProjectRememberResult,
  ProjectStartResult,
  RedTeamOptions,
  RedTeamStatus,
  ReportFormat,
  ReportResult,
  ScanToolResult,
} from './types.js'

function mergeKnowledgeChunks(
  local: readonly LongTermKnowledgeChunk[],
  remote: readonly LongTermKnowledgeChunk[],
  limit: number,
): LongTermKnowledgeChunk[] {
  const chunks: LongTermKnowledgeChunk[] = []
  const known = new Set<string>()
  const length = Math.max(local.length, remote.length)
  for (let index = 0; index < length && chunks.length < limit; index += 1) {
    const candidates: ReadonlyArray<{
      readonly chunk: LongTermKnowledgeChunk | undefined
      readonly source: 'builtin' | 'ragflow'
    }> = [
      { chunk: local[index], source: 'builtin' },
      { chunk: remote[index], source: 'ragflow' },
    ]
    for (const { chunk: candidate, source } of candidates) {
      if (candidate === undefined) continue
      const key = `${source}:${candidate.id}`
      if (known.has(key)) continue
      known.add(key)
      chunks.push(source === candidate.source ? candidate : { ...candidate, source })
      if (chunks.length >= limit) break
    }
  }
  return chunks
}

export class RedTeamRuntime {
  readonly options: RedTeamOptions
  readonly store: AssessmentStore
  readonly assetGraphStore: AssetGraphStore
  readonly projectPointerStore: ProjectPointerStore
  readonly localKnowledge: LocalKnowledgeStore
  readonly graphiti: GraphitiClient | undefined
  readonly ragflow: RagFlowClient | undefined
  private current: Assessment | undefined
  private currentAssetGraph: AssetGraph | undefined
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(options: RedTeamOptions) {
    this.options = options
    this.store = new AssessmentStore(options.storageRoot)
    this.assetGraphStore = new AssetGraphStore(options.storageRoot)
    this.projectPointerStore = new ProjectPointerStore(options.storageRoot)
    this.localKnowledge = new LocalKnowledgeStore(
      options.knowledgeRoot ?? join(options.storageRoot, 'knowledge'),
      options.knowledgeMaxDocuments ?? 10_000,
      options.knowledgeMaxProjectEvents ?? 5_000,
    )
    this.graphiti =
      options.graphiti === undefined ? undefined : new GraphitiClient(options.graphiti)
    this.ragflow = options.ragflow === undefined ? undefined : new RagFlowClient(options.ragflow)
  }

  async status(): Promise<RedTeamStatus> {
    await this.mutationTail
    const latest = this.current ?? (await this.store.latest())
    const latestAssetGraph = this.currentAssetGraph ?? (await this.assetGraphStore.latest())
    const currentProject = await this.projectPointerStore.current()
    return {
      activeVerification: false,
      categories: [...this.options.categories],
      latestAssessmentId: latest?.id ?? null,
      latestAssetGraphId: latestAssetGraph?.id ?? null,
      currentProjectId: currentProject?.projectId ?? null,
      mode: 'review',
      plugin: 'dsh-redteam',
      ruleCount: this.options.rules?.length ?? SCAN_RULES.length,
      rulesetVersion: RULESET_VERSION,
      storageRoot: this.options.storageRoot,
      version: '1.3.2',
      workspaceRoot: this.options.workspaceRoot,
    }
  }

  async knowledgeStatus(signal?: AbortSignal): Promise<KnowledgeStatus> {
    await this.mutationTail
    const currentProject = (await this.projectPointerStore.current()) ?? null
    const [local, graphitiReachable, ragflowReachable] = await Promise.all([
      this.localKnowledge.status(),
      this.graphiti === undefined ? false : this.graphiti.health(signal).catch(() => false),
      this.ragflow === undefined ? false : this.ragflow.health(signal).catch(() => false),
    ])
    const datasetTypes =
      this.options.ragflow === undefined
        ? []
        : (Object.keys(this.options.ragflow.datasets) as LongTermKnowledgeType[])
    return {
      currentProject,
      local,
      graphiti: { configured: this.graphiti !== undefined, reachable: graphitiReachable },
      ragflow: {
        configured: this.ragflow !== undefined,
        datasetTypes,
        reachable: ragflowReachable,
      },
    }
  }

  async startProject(
    name: string,
    objective: string | undefined,
    signal?: AbortSignal,
  ): Promise<ProjectStartResult> {
    return await this.serializeMutation(async () => {
      const projectId = createProjectId()
      const startedAt = new Date().toISOString()
      const event = createProjectMemoryEvent({
        authority: 'authoritative',
        confidence: 'high',
        content:
          objective?.trim() === '' || objective === undefined ? `项目 ${name} 已创建。` : objective,
        kind: 'project',
        occurredAt: startedAt,
        projectId,
        promotable: false,
        sensitivity: 'internal',
        status: 'active',
        tags: ['project-start'],
        title: name,
      })
      await this.localKnowledge.appendProjectEvent(event)
      let extensionWarnings: string[] | undefined
      if (this.graphiti !== undefined) {
        try {
          await this.graphiti.addEvent(event, signal)
        } catch {
          extensionWarnings = ['Graphiti mirror unavailable; the project was saved locally.']
        }
      }
      const episodeId = event.eventId
      const pointer = { name: event.title, projectId, startedAt }
      await this.projectPointerStore.save(pointer)
      return {
        ...pointer,
        episodeId,
        ...(extensionWarnings === undefined ? {} : { extensionWarnings }),
      }
    })
  }

  async rememberProject(
    projectId: string | undefined,
    kind: ProjectMemoryKind,
    title: string,
    content: string,
    authority: MemoryAuthority,
    confidence: AssetConfidence,
    status: MemoryStatus,
    sensitivity: MemorySensitivity,
    promotable: boolean,
    tags: readonly string[],
    sourceUrls: readonly string[],
    occurredAt: string | undefined,
    signal?: AbortSignal,
  ): Promise<ProjectRememberResult> {
    return await this.serializeMutation(async () => {
      const resolvedProjectId = await this.resolveProjectId(projectId)
      const event = createProjectMemoryEvent({
        authority,
        confidence,
        content,
        kind,
        projectId: resolvedProjectId,
        promotable,
        sensitivity,
        sourceUrls,
        status,
        tags,
        title,
        ...(occurredAt === undefined ? {} : { occurredAt }),
      })
      await this.localKnowledge.appendProjectEvent(event)
      let extensionWarnings: string[] | undefined
      if (this.graphiti !== undefined) {
        try {
          await this.graphiti.addEvent(event, signal)
        } catch {
          extensionWarnings = ['Graphiti mirror unavailable; the event was saved locally.']
        }
      }
      const episodeId = event.eventId
      return {
        episodeId,
        event,
        projectId: resolvedProjectId,
        ...(extensionWarnings === undefined ? {} : { extensionWarnings }),
      }
    })
  }

  async recallProject(
    projectId: string | undefined,
    query: string | undefined,
    limit: number,
    signal?: AbortSignal,
  ): Promise<ProjectRecallResult> {
    await this.mutationTail
    const resolvedProjectId = await this.resolveProjectId(projectId)
    const resolvedQuery = query?.trim() === '' ? undefined : query
    const localEvents = await this.localKnowledge.projectEvents(
      resolvedProjectId,
      resolvedQuery,
      limit,
    )
    let remote: ProjectRecallResult | undefined
    let extensionWarnings: string[] | undefined
    if (this.graphiti !== undefined) {
      try {
        remote = await this.graphiti.recall(resolvedProjectId, resolvedQuery, limit, signal)
      } catch {
        extensionWarnings = ['Graphiti recall unavailable; returned local project events only.']
      }
    }
    const events = new Map(localEvents.map((event) => [event.eventId, event]))
    for (const event of remote?.events ?? []) {
      if (event.projectId !== resolvedProjectId) continue
      if (events.has(event.eventId)) continue
      if (
        resolvedQuery === undefined ||
        `${event.title}\n${event.content}\n${event.tags.join(' ')}`
          .toLocaleLowerCase()
          .includes(resolvedQuery.toLocaleLowerCase())
      ) {
        events.set(event.eventId, event)
      }
    }
    return {
      events: [...events.values()]
        .sort(
          (left, right) =>
            right.occurredAt.localeCompare(left.occurredAt) ||
            left.eventId.localeCompare(right.eventId),
        )
        .slice(0, limit),
      facts: remote?.facts.slice(0, limit) ?? [],
      projectId: resolvedProjectId,
      ...(extensionWarnings === undefined ? {} : { extensionWarnings }),
    }
  }

  async searchKnowledge(
    query: string,
    datasetTypes: readonly LongTermKnowledgeType[],
    limit: number,
    signal?: AbortSignal,
  ): Promise<KnowledgeSearchResult> {
    await this.mutationTail
    const local = await this.localKnowledge.search(query, datasetTypes, limit)
    const externalTypes = datasetTypes.filter(
      (type) => this.options.ragflow?.datasets[type] !== undefined,
    )
    let remote: KnowledgeSearchResult | undefined
    let extensionWarnings: string[] | undefined
    if (this.ragflow !== undefined && externalTypes.length > 0) {
      try {
        remote = await this.ragflow.search(query, externalTypes, limit, signal)
      } catch {
        extensionWarnings = ['RAGFlow search unavailable; returned built-in results only.']
      }
    }
    return {
      chunks: mergeKnowledgeChunks(local.chunks, remote?.chunks ?? [], limit),
      datasetTypes: [...datasetTypes],
      ...(extensionWarnings === undefined ? {} : { extensionWarnings }),
    }
  }

  async promoteProjectMemory(
    projectId: string | undefined,
    episodeId: string,
    knowledgeType: LongTermKnowledgeType,
    signal?: AbortSignal,
  ): Promise<KnowledgePromotionResult> {
    return await this.serializeMutation(async () => {
      const resolvedProjectId = await this.resolveProjectId(projectId)
      let event = await this.localKnowledge.projectEvent(resolvedProjectId, episodeId)
      if (event === undefined && this.graphiti !== undefined) {
        const recalled = await this.graphiti
          .recall(
            resolvedProjectId,
            undefined,
            this.options.knowledgeMaxProjectEvents ?? 5_000,
            signal,
          )
          .catch(() => undefined)
        event = recalled?.events.find(
          (candidate) =>
            candidate.projectId === resolvedProjectId && candidate.eventId === episodeId,
        )
      }
      if (event === undefined) throw new Error(`project memory episode not found: ${episodeId}`)
      assertPromotable(event, knowledgeType)
      const local = await this.localKnowledge.promote(event, knowledgeType)
      let remote: Awaited<ReturnType<RagFlowClient['promote']>> | undefined
      let extensionWarnings: string[] | undefined
      if (
        this.ragflow !== undefined &&
        this.options.ragflow?.datasets[knowledgeType] !== undefined
      ) {
        try {
          remote = await this.ragflow.promote(
            resolvedProjectId,
            episodeId,
            event,
            knowledgeType,
            signal,
          )
        } catch {
          extensionWarnings = [
            'RAGFlow mirror unavailable; the knowledge document was saved locally.',
          ]
        }
      }
      return {
        chunkId: local.document.id,
        datasetId: `builtin:${knowledgeType}`,
        documentId: local.document.id,
        episodeId,
        knowledgeType,
        projectId: resolvedProjectId,
        ...(extensionWarnings === undefined ? {} : { extensionWarnings }),
        ...(remote === undefined
          ? {}
          : {
              ragflow: {
                chunkId: remote.chunkId,
                datasetId: remote.datasetId,
                documentId: remote.documentId,
              },
            }),
        uri: local.document.uri,
      }
    })
  }

  async upsertKnowledge(input: KnowledgeDocumentInput): Promise<KnowledgeUpsertResult> {
    return await this.serializeMutation(async () => await this.localKnowledge.upsert(input))
  }

  async readKnowledge(reference: string, level: KnowledgeReadLevel): Promise<KnowledgeReadResult> {
    await this.mutationTail
    return await this.localKnowledge.read(reference, level)
  }

  async knowledgeTree(prefix: string | undefined, limit: number): Promise<KnowledgeTreeResult> {
    await this.mutationTail
    return await this.localKnowledge.tree(prefix, limit)
  }

  async grepKnowledge(
    query: string,
    types: readonly LongTermKnowledgeType[],
    limit: number,
  ): Promise<KnowledgeGrepResult> {
    await this.mutationTail
    return await this.localKnowledge.grep(query, types, limit)
  }

  async scan(
    scanPath: string | undefined,
    categories: readonly FindingCategory[] | undefined,
    signal: AbortSignal,
  ): Promise<ScanToolResult> {
    return await this.serializeMutation(async () => {
      const assessment = await scanWorkspace({
        categories: categories ?? this.options.categories,
        ignoreDirectories: this.options.ignoreDirectories,
        maxFileBytes: this.options.maxFileBytes,
        maxFiles: this.options.maxFiles,
        maxFindings: this.options.maxFindings,
        ...(this.options.rules === undefined ? {} : { rules: this.options.rules }),
        ...(scanPath === undefined ? {} : { scanPath }),
        signal,
        workspaceRoot: this.options.workspaceRoot,
      })
      await this.store.save(assessment)
      this.current = assessment
      return {
        assessmentId: assessment.id,
        filesScanned: assessment.filesScanned,
        filesSkipped: assessment.filesSkipped,
        findingCount: assessment.findings.length,
        findingIds: assessment.findings.slice(0, 100).map((finding) => finding.id),
        truncated: assessment.truncated,
      }
    })
  }

  async findings(
    assessmentId: string | undefined,
    severity: FindingSeverity | undefined,
    status: FindingStatus | undefined,
    limit: number,
  ): Promise<FindingListResult> {
    await this.mutationTail
    const assessment = await this.resolveAssessment(assessmentId)
    const selected = assessment.findings.filter(
      (finding) =>
        (severity === undefined || finding.severity === severity) &&
        (status === undefined || finding.status === status),
    )
    return {
      assessmentId: assessment.id,
      findings: selected.slice(0, limit),
      total: selected.length,
    }
  }

  async report(assessmentId: string | undefined, format: ReportFormat): Promise<ReportResult> {
    await this.mutationTail
    const assessment = await this.resolveAssessment(assessmentId)
    const path = await this.store.writeReport(
      assessment.id,
      format,
      renderReport(assessment, format),
    )
    return {
      assessmentId: assessment.id,
      findingCount: assessment.findings.length,
      format,
      path,
    }
  }

  async updateFinding(
    assessmentId: string | undefined,
    findingId: string,
    status: FindingStatus,
    reason: string,
  ): Promise<FindingUpdateResult> {
    return await this.serializeMutation(async () => {
      const current = await this.resolveAssessment(assessmentId)
      const updated = changeFindingStatus(current, findingId, status, reason)
      await this.store.replace(updated.assessment)
      if (this.current?.id === updated.assessment.id) this.current = updated.assessment
      return { assessmentId: updated.assessment.id, finding: updated.finding }
    })
  }

  async startAssetGraph(
    seedValue: string,
    seedType: AssetType | undefined,
    maxDepth: number | undefined,
  ): Promise<AssetGraphSummary> {
    return await this.serializeMutation(async () => {
      const depth = maxDepth ?? this.options.assetGraphMaxDepth
      if (!Number.isSafeInteger(depth) || depth < 1 || depth > this.options.assetGraphMaxDepth) {
        throw new Error(
          `asset graph max_depth must be an integer between 1 and ${String(this.options.assetGraphMaxDepth)}`,
        )
      }
      const graph = createAssetGraph(
        this.options.workspaceRoot,
        { type: seedType ?? inferAssetType(seedValue), value: seedValue },
        depth,
      )
      await this.assetGraphStore.save(graph)
      this.currentAssetGraph = graph
      return assetGraphSummary(graph)
    })
  }

  async observeAssetGraph(
    graphId: string | undefined,
    observations: readonly AssetObservation[],
    expanded: readonly AssetRef[],
  ): Promise<AssetGraphSummary> {
    return await this.serializeMutation(async () => {
      const graph = await this.resolveAssetGraph(graphId)
      const updated = mergeAssetObservations(graph, observations, expanded, {
        maxEdges: this.options.assetGraphMaxEdges,
        maxNodes: this.options.assetGraphMaxNodes,
        maxSources: this.options.assetGraphMaxSources,
      })
      await this.assetGraphStore.replace(updated)
      if (this.currentAssetGraph === undefined || this.currentAssetGraph.id === updated.id) {
        this.currentAssetGraph = updated
      }
      return assetGraphSummary(updated)
    })
  }

  async assetGraphFrontier(
    graphId: string | undefined,
    limit: number,
  ): Promise<AssetGraphFrontierResult> {
    await this.mutationTail
    return assetGraphFrontier(await this.resolveAssetGraph(graphId), limit)
  }

  async assetGraphReport(
    graphId: string | undefined,
    format: AssetGraphReportFormat,
  ): Promise<AssetGraphReportResult> {
    await this.mutationTail
    const graph = await this.resolveAssetGraph(graphId)
    const path = await this.assetGraphStore.writeReport(
      graph.id,
      format,
      renderAssetGraph(graph, format),
    )
    return { ...assetGraphSummary(graph), format, path }
  }

  private serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation)
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async resolveAssessment(id: string | undefined): Promise<Assessment> {
    if (id !== undefined) {
      if (this.current?.id === id) return this.current
      return await this.store.load(id)
    }
    if (this.current !== undefined) return this.current
    const latest = await this.store.latest()
    if (latest === undefined)
      throw new Error('no red-team assessment exists; run redteam_scan first')
    return latest
  }

  private async resolveAssetGraph(id: string | undefined): Promise<AssetGraph> {
    if (id !== undefined) {
      if (this.currentAssetGraph?.id === id) return this.currentAssetGraph
      return await this.assetGraphStore.load(id)
    }
    if (this.currentAssetGraph !== undefined) return this.currentAssetGraph
    const latest = await this.assetGraphStore.latest()
    if (latest === undefined) {
      throw new Error('no asset graph exists; run redteam_asset_map_start first')
    }
    return latest
  }

  private async resolveProjectId(projectId: string | undefined): Promise<string> {
    if (projectId !== undefined) return projectId
    const pointer = await this.projectPointerStore.current()
    if (pointer === undefined) {
      throw new Error('no current red-team project exists; run redteam_project_start first')
    }
    return pointer.projectId
  }
}
