import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { defineTool, type PreToolDecision, type ToolExecution } from '@deepseek-ai/dsh-tools'
import { RedTeamRuntime } from '../lib/runtime.js'
import {
  DEFAULT_REDTEAM_EXECUTION_POLICY,
  evaluateRedTeamToolPolicy,
  parseRedTeamExecutionPolicy,
  snapshotRedTeamExecutionPolicy,
  type RedTeamExecutionPolicy,
} from '../lib/execution-policy.js'
import { normalizeKnowledgeBaseUrl } from '../lib/knowledge-clients.js'
import { SCAN_RULES } from '../lib/rules.js'
import { isPathWithin } from '../lib/scope.js'
import { detectBuiltInToolAvailability } from '../lib/tool-availability.js'
import type {
  FindingCategory,
  FindingConfidence,
  FindingSeverity,
  FindingStatus,
  AssetType,
  LongTermKnowledgeType,
  MemoryAuthority,
  MemorySensitivity,
  MemoryStatus,
  ProjectMemoryKind,
  RedTeamOptions,
  ScanRule,
} from '../lib/types.js'

const CATEGORIES: readonly FindingCategory[] = ['configuration', 'secret', 'source']
const FINDING_STATUSES: readonly FindingStatus[] = ['candidate', 'confirmed', 'fixed', 'accepted']
const ASSET_TYPES: readonly AssetType[] = [
  'organization',
  'product',
  'infrastructure',
  'supplier',
  'domain',
  'ip',
  'network',
  'url',
  'technology',
  'asn',
  'certificate',
]
const ASSET_RELATIONS = [
  'owns',
  'subsidiary_of',
  'invests_in',
  'partners_with',
  'produces',
  'operates',
  'uses_domain',
  'resolves_to',
  'hosted_on',
  'uses_technology',
  'belongs_to_asn',
  'certified_by',
  'related_to',
] as const
const ASSET_CONFIDENCE = ['high', 'medium', 'low'] as const
const MEMORY_KINDS: readonly ProjectMemoryKind[] = [
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
const MEMORY_AUTHORITY: readonly MemoryAuthority[] = ['authoritative', 'observed', 'inferred']
const MEMORY_STATUS: readonly MemoryStatus[] = [
  'active',
  'confirmed',
  'resolved',
  'dismissed',
  'archived',
]
const MEMORY_SENSITIVITY: readonly MemorySensitivity[] = ['internal', 'reusable', 'restricted']
const LONG_TERM_SENSITIVITY: readonly MemorySensitivity[] = ['internal', 'reusable']
const KNOWLEDGE_TYPES: readonly LongTermKnowledgeType[] = [
  'asset',
  'vulnerability',
  'technique',
  'src_case',
  'source',
]
const PATH_KEYS = new Set(['cwd', 'directory', 'file_path', 'path', 'root', 'workdir'])
const POLICY_RPC_CHANNEL = '/redteam-policy'
const TOOL_AVAILABILITY_RPC_CHANNEL = '/redteam-tool-availability'

type PluginRpcResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'internal'
        readonly details: Readonly<Record<string, unknown>>
        readonly message: string
      }
    }

interface HostConnectionHandle {
  readonly rpc: {
    handle(
      channel: string,
      handler: (
        endpoint: string,
        payload: unknown,
        signal: AbortSignal,
      ) => Promise<PluginRpcResult>,
    ): () => Promise<void>
  }
}

export interface CustomRuleConfig {
  id: string
  category: FindingCategory
  title: string
  severity: FindingSeverity
  confidence: FindingConfidence
  cwe: string
  pattern: string
  ignoreCase?: boolean
  pathPattern?: string
  pathIgnoreCase?: boolean
  remediation: string
  version?: string
}

export interface Config {
  workspaceRoot?: string
  storageRoot?: string
  categories?: FindingCategory[]
  ignoreDirectories?: string[]
  maxFiles?: number
  maxFileBytes?: number
  maxFindings?: number
  enforceWorkspaceScope?: boolean
  customRules?: CustomRuleConfig[]
  assetGraphMaxDepth?: number
  assetGraphMaxNodes?: number
  assetGraphMaxEdges?: number
  assetGraphMaxSources?: number
  knowledgeRoot?: string
  knowledgeMaxDocuments?: number
  knowledgeMaxProjectEvents?: number
  graphitiUrl?: string
  graphitiAuthTokenEnv?: string
  ragflowUrl?: string
  ragflowApiKeyEnv?: string
  ragflowAssetDatasetId?: string
  ragflowVulnerabilityDatasetId?: string
  ragflowTechniqueDatasetId?: string
  ragflowSrcCaseDatasetId?: string
  ragflowSourceDatasetId?: string
  knowledgeTimeoutMs?: number
  allowRemoteKnowledgeServices?: boolean
}

const CustomRuleConfig: Schema<CustomRuleConfig> = Schema.object({
  id: Schema.string().required(),
  category: Schema.union(CATEGORIES).required(),
  title: Schema.string().required(),
  severity: Schema.union(['critical', 'high', 'medium', 'low']).required(),
  confidence: Schema.union(['high', 'medium']).required(),
  cwe: Schema.string().required(),
  pattern: Schema.string().required(),
  ignoreCase: Schema.boolean().default(false),
  pathPattern: Schema.string(),
  pathIgnoreCase: Schema.boolean().default(false),
  remediation: Schema.string().required(),
  version: Schema.string().default('1'),
})

export const Config: Schema<Config> = Schema.object({
  workspaceRoot: Schema.string(),
  storageRoot: Schema.string(),
  categories: Schema.array(Schema.union(CATEGORIES)).default([...CATEGORIES]),
  ignoreDirectories: Schema.array(Schema.string()).default([]),
  maxFiles: Schema.number().default(2_000),
  maxFileBytes: Schema.number().default(1_000_000),
  maxFindings: Schema.number().default(500),
  enforceWorkspaceScope: Schema.boolean().default(true),
  customRules: Schema.array(CustomRuleConfig).default([]),
  assetGraphMaxDepth: Schema.number().default(3),
  assetGraphMaxNodes: Schema.number().default(2_000),
  assetGraphMaxEdges: Schema.number().default(5_000),
  assetGraphMaxSources: Schema.number().default(5_000),
  knowledgeRoot: Schema.string(),
  knowledgeMaxDocuments: Schema.number().default(10_000),
  knowledgeMaxProjectEvents: Schema.number().default(5_000),
  graphitiUrl: Schema.string(),
  graphitiAuthTokenEnv: Schema.string(),
  ragflowUrl: Schema.string(),
  ragflowApiKeyEnv: Schema.string().default('RAGFLOW_API_KEY'),
  ragflowAssetDatasetId: Schema.string(),
  ragflowVulnerabilityDatasetId: Schema.string(),
  ragflowTechniqueDatasetId: Schema.string(),
  ragflowSrcCaseDatasetId: Schema.string(),
  ragflowSourceDatasetId: Schema.string(),
  knowledgeTimeoutMs: Schema.number().default(15_000),
  allowRemoteKnowledgeServices: Schema.boolean().default(false),
})

interface ResolvedConfig extends Omit<RedTeamOptions, 'storageRoot' | 'workspaceRoot'> {
  readonly storageRoot?: string
  readonly workspaceRoot?: string
}

function boundedInteger(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`dsh-redteam: ${name} must be an integer between ${minimum} and ${maximum}`)
  }
  return value
}

function boundedText(name: string, value: string, maximum: number): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new Error(`dsh-redteam: ${name} must contain between 1 and ${maximum} characters`)
  }
  return normalized
}

function compilePattern(name: string, source: string, ignoreCase: boolean): RegExp {
  const normalized = boundedText(name, source, 1_000)
  let pattern: RegExp
  try {
    pattern = new RegExp(normalized, ignoreCase ? 'iu' : 'u')
  } catch (error) {
    throw new Error(`dsh-redteam: ${name} is not a valid regular expression`, { cause: error })
  }
  if (pattern.test('')) throw new Error(`dsh-redteam: ${name} must not match empty text`)
  return pattern
}

function resolveCustomRules(configured: readonly CustomRuleConfig[]): ScanRule[] {
  const known = new Set(SCAN_RULES.map((rule) => rule.id))
  return configured.map((rule, index) => {
    const prefix = `customRules[${String(index)}]`
    const id = boundedText(`${prefix}.id`, rule.id, 80)
    if (!/^RT-CUSTOM-[A-Z0-9-]+$/u.test(id)) {
      throw new Error(`dsh-redteam: ${prefix}.id must match RT-CUSTOM-[A-Z0-9-]+`)
    }
    if (known.has(id)) throw new Error(`dsh-redteam: duplicate rule id: ${id}`)
    known.add(id)
    const pathPattern =
      rule.pathPattern === undefined
        ? undefined
        : compilePattern(`${prefix}.pathPattern`, rule.pathPattern, rule.pathIgnoreCase ?? false)
    return {
      category: rule.category,
      confidence: rule.confidence,
      cwe: boundedText(`${prefix}.cwe`, rule.cwe, 32),
      id,
      pattern: compilePattern(`${prefix}.pattern`, rule.pattern, rule.ignoreCase ?? false),
      remediation: boundedText(`${prefix}.remediation`, rule.remediation, 1_000),
      severity: rule.severity,
      title: boundedText(`${prefix}.title`, rule.title, 160),
      version: boundedText(`${prefix}.version`, rule.version ?? '1', 32),
      ...(pathPattern === undefined ? {} : { pathPattern }),
    }
  })
}

function resolveConfig(config: Config): ResolvedConfig {
  const workspaceRoot =
    config.workspaceRoot === undefined ? undefined : resolve(config.workspaceRoot)
  const storageRoot = config.storageRoot === undefined ? undefined : resolve(config.storageRoot)
  const knowledgeRoot =
    config.knowledgeRoot === undefined ? undefined : resolve(config.knowledgeRoot)
  if (workspaceRoot === undefined && storageRoot !== undefined) {
    throw new Error('dsh-redteam: storageRoot requires a fixed workspaceRoot')
  }
  const categories = [...new Set(config.categories ?? CATEGORIES)]
  if (categories.length === 0) throw new Error('dsh-redteam: categories must not be empty')
  const ignoreDirectories = [...new Set(config.ignoreDirectories ?? [])]
  if (ignoreDirectories.some((name) => name.length === 0 || /[/\\]/u.test(name))) {
    throw new Error('dsh-redteam: ignored directories must be simple directory names')
  }
  const rules = [...SCAN_RULES, ...resolveCustomRules(config.customRules ?? [])]
  const timeoutMs = boundedInteger(
    'knowledgeTimeoutMs',
    config.knowledgeTimeoutMs ?? 15_000,
    500,
    120_000,
  )
  const allowRemote = config.allowRemoteKnowledgeServices ?? false
  const envName = (name: string, value: string | undefined): string | undefined => {
    if (value === undefined) return undefined
    const normalized = boundedText(name, value, 128)
    if (!/^[A-Z_][A-Z0-9_]*$/u.test(normalized)) {
      throw new Error(`dsh-redteam: ${name} must be an uppercase environment variable name`)
    }
    return normalized
  }
  const datasetId = (name: string, value: string | undefined): string | undefined =>
    value === undefined ? undefined : boundedText(name, value, 128)
  const datasets: Partial<Record<LongTermKnowledgeType, string>> = {}
  const configuredDatasets: ReadonlyArray<
    readonly [LongTermKnowledgeType, string, string | undefined]
  > = [
    ['asset', 'ragflowAssetDatasetId', config.ragflowAssetDatasetId],
    ['vulnerability', 'ragflowVulnerabilityDatasetId', config.ragflowVulnerabilityDatasetId],
    ['technique', 'ragflowTechniqueDatasetId', config.ragflowTechniqueDatasetId],
    ['src_case', 'ragflowSrcCaseDatasetId', config.ragflowSrcCaseDatasetId],
    ['source', 'ragflowSourceDatasetId', config.ragflowSourceDatasetId],
  ]
  for (const [type, name, value] of configuredDatasets) {
    const id = datasetId(name, value)
    if (id !== undefined) datasets[type] = id
  }
  if (config.ragflowUrl === undefined && Object.keys(datasets).length > 0) {
    throw new Error('dsh-redteam: RAGFlow dataset ids require ragflowUrl')
  }
  const graphitiTokenEnv = envName('graphitiAuthTokenEnv', config.graphitiAuthTokenEnv)
  const graphiti =
    config.graphitiUrl === undefined
      ? undefined
      : {
          baseUrl: normalizeKnowledgeBaseUrl('graphitiUrl', config.graphitiUrl, allowRemote),
          timeoutMs,
          ...(graphitiTokenEnv === undefined ? {} : { authTokenEnv: graphitiTokenEnv }),
        }
  const ragflow =
    config.ragflowUrl === undefined
      ? undefined
      : {
          authTokenEnv:
            envName('ragflowApiKeyEnv', config.ragflowApiKeyEnv ?? 'RAGFLOW_API_KEY') ??
            'RAGFLOW_API_KEY',
          baseUrl: normalizeKnowledgeBaseUrl('ragflowUrl', config.ragflowUrl, allowRemote),
          datasets,
          timeoutMs,
        }
  return {
    assetGraphMaxDepth: boundedInteger('assetGraphMaxDepth', config.assetGraphMaxDepth ?? 3, 1, 5),
    assetGraphMaxNodes: boundedInteger(
      'assetGraphMaxNodes',
      config.assetGraphMaxNodes ?? 2_000,
      1,
      10_000,
    ),
    assetGraphMaxEdges: boundedInteger(
      'assetGraphMaxEdges',
      config.assetGraphMaxEdges ?? 5_000,
      1,
      30_000,
    ),
    assetGraphMaxSources: boundedInteger(
      'assetGraphMaxSources',
      config.assetGraphMaxSources ?? 5_000,
      1,
      30_000,
    ),
    categories,
    enforceWorkspaceScope: config.enforceWorkspaceScope ?? true,
    ignoreDirectories,
    maxFileBytes: boundedInteger(
      'maxFileBytes',
      config.maxFileBytes ?? 1_000_000,
      1_024,
      20_000_000,
    ),
    maxFiles: boundedInteger('maxFiles', config.maxFiles ?? 2_000, 1, 100_000),
    maxFindings: boundedInteger('maxFindings', config.maxFindings ?? 500, 1, 10_000),
    knowledgeMaxDocuments: boundedInteger(
      'knowledgeMaxDocuments',
      config.knowledgeMaxDocuments ?? 10_000,
      1,
      100_000,
    ),
    knowledgeMaxProjectEvents: boundedInteger(
      'knowledgeMaxProjectEvents',
      config.knowledgeMaxProjectEvents ?? 5_000,
      1,
      100_000,
    ),
    rules,
    ...(graphiti === undefined ? {} : { graphiti }),
    ...(ragflow === undefined ? {} : { ragflow }),
    ...(knowledgeRoot === undefined ? {} : { knowledgeRoot }),
    ...(storageRoot === undefined ? {} : { storageRoot }),
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function pathTargets(execution: ToolExecution): string[] {
  const argumentsRecord = record(execution.arguments)
  if (argumentsRecord === undefined) return []
  return Object.entries(argumentsRecord)
    .filter(([key, value]) => PATH_KEYS.has(key) && typeof value === 'string')
    .map(([, value]) => value as string)
}

function findingSchema() {
  return {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      category: {
        type: 'string' as const,
        enum: CATEGORIES,
        required: true as const,
      },
      confidence: {
        type: 'string' as const,
        enum: ['high', 'medium'] as const,
        required: true as const,
      },
      cwe: { type: 'string' as const, required: true as const },
      detectedAt: { type: 'string' as const, required: true as const },
      evidence: { type: 'string' as const, required: true as const },
      id: { type: 'string' as const, required: true as const },
      location: {
        type: 'object' as const,
        additionalProperties: false,
        required: true as const,
        properties: {
          column: { type: 'integer' as const, required: true as const },
          line: { type: 'integer' as const, required: true as const },
          path: { type: 'string' as const, required: true as const },
        },
      },
      remediation: { type: 'string' as const, required: true as const },
      ruleId: { type: 'string' as const, required: true as const },
      ruleVersion: { type: 'string' as const },
      severity: {
        type: 'string' as const,
        enum: ['critical', 'high', 'medium', 'low'] as const,
        required: true as const,
      },
      status: {
        type: 'string' as const,
        enum: ['candidate', 'confirmed', 'fixed', 'accepted'] as const,
        required: true as const,
      },
      statusHistory: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            changedAt: { type: 'string' as const, required: true as const },
            from: {
              type: 'string' as const,
              enum: FINDING_STATUSES,
              required: true as const,
            },
            reason: { type: 'string' as const, required: true as const },
            to: {
              type: 'string' as const,
              enum: FINDING_STATUSES,
              required: true as const,
            },
          },
        },
      },
      title: { type: 'string' as const, required: true as const },
    },
  }
}

function assetNodeSchema() {
  return {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      confidence: {
        type: 'string' as const,
        enum: ASSET_CONFIDENCE,
        required: true as const,
      },
      depth: { type: 'integer' as const, required: true as const },
      expanded: { type: 'boolean' as const, required: true as const },
      id: { type: 'string' as const, required: true as const },
      label: { type: 'string' as const, required: true as const },
      sourceIds: {
        type: 'array' as const,
        items: { type: 'string' as const },
        required: true as const,
      },
      type: { type: 'string' as const, enum: ASSET_TYPES, required: true as const },
      value: { type: 'string' as const, required: true as const },
    },
  }
}

function assetSummaryProperties() {
  return {
    domainCounts: {
      type: 'object' as const,
      additionalProperties: false,
      required: true as const,
      properties: {
        registrable: { type: 'integer' as const, required: true as const },
        subdomain: { type: 'integer' as const, required: true as const },
        unclassified: { type: 'integer' as const, required: true as const },
      },
    },
    edgeCount: { type: 'integer' as const, required: true as const },
    frontierCount: { type: 'integer' as const, required: true as const },
    graphId: { type: 'string' as const, required: true as const },
    maxDepth: { type: 'integer' as const, required: true as const },
    nodeCount: { type: 'integer' as const, required: true as const },
    seed: { ...assetNodeSchema(), required: true as const },
    sourceCount: { type: 'integer' as const, required: true as const },
    ipCounts: {
      type: 'object' as const,
      additionalProperties: false,
      required: true as const,
      properties: {
        ipv4: { type: 'integer' as const, required: true as const },
        ipv6: { type: 'integer' as const, required: true as const },
      },
    },
    typeCounts: {
      type: 'object' as const,
      additionalProperties: false,
      required: true as const,
      properties: Object.fromEntries(
        ASSET_TYPES.map((type) => [type, { type: 'integer' as const, required: true as const }]),
      ),
    },
  }
}

function assetRefSchema() {
  return {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      label: { type: 'string' as const },
      type: { type: 'string' as const, enum: ASSET_TYPES, required: true as const },
      value: { type: 'string' as const, required: true as const },
    },
  }
}

function registerAssetMapStartTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_asset_map_start',
      description:
        'Create a persistent passive-OSINT asset graph from a company, domain, IP, CIDR network, URL, ASN, product, infrastructure, supplier, technology, or certificate seed. This performs no network access.',
      parameters: {
        seed: { type: 'string', required: true },
        seed_type: { type: 'string', enum: ASSET_TYPES },
        max_depth: {
          type: 'integer',
          description: 'Recursive relationship depth; defaults to the deployment limit.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: assetSummaryProperties(),
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).startAssetGraph(
          args.seed,
          args.seed_type,
          args.max_depth,
        )
      },
    }),
  )
}

function registerAssetMapObserveTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_asset_map_observe',
      description:
        'Merge public-source asset observations into a graph. Every observation requires an HTTP(S) source URL; URL credentials are rejected, while sensitive query values and excerpts are redacted and bounded.',
      parameters: {
        graph_id: { type: 'string', description: 'Graph id; defaults to the latest graph.' },
        observations: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              confidence: {
                type: 'string',
                enum: ASSET_CONFIDENCE,
                required: true,
              },
              object: assetRefSchema(),
              relation: { type: 'string', enum: ASSET_RELATIONS },
              source: {
                type: 'object',
                additionalProperties: false,
                required: true,
                properties: {
                  excerpt: { type: 'string' },
                  observedAt: { type: 'string' },
                  title: { type: 'string' },
                  url: { type: 'string', required: true },
                },
              },
              subject: { ...assetRefSchema(), required: true },
            },
          },
        },
        expanded: {
          type: 'array',
          items: assetRefSchema(),
          description: 'Assets whose public-source expansion is complete for this pass.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: assetSummaryProperties(),
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).observeAssetGraph(
          args.graph_id,
          args.observations,
          args.expanded ?? [],
        )
      },
    }),
  )
}

function registerAssetMapFrontierTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_asset_map_frontier',
      description:
        'Read the next breadth-first batch of unexpanded asset nodes so an authorized OSINT workflow can continue recursively.',
      parameters: {
        graph_id: { type: 'string', description: 'Graph id; defaults to the latest graph.' },
        limit: { type: 'integer', description: 'Maximum frontier nodes, from 1 to 50.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ...assetSummaryProperties(),
            frontier: {
              type: 'array',
              items: assetNodeSchema(),
              required: true,
            },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        const limit = args.limit ?? 20
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
          throw new Error('limit must be an integer between 1 and 50')
        }
        return await runtimeFor(execution).assetGraphFrontier(args.graph_id, limit)
      },
      isConcurrencySafe: () => true,
    }),
  )
}

function registerAssetMapReportTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_asset_map_report',
      description: 'Export a sourced asset graph as HTML, Markdown with Mermaid, JSON, or GraphML.',
      parameters: {
        graph_id: { type: 'string', description: 'Graph id; defaults to the latest graph.' },
        format: {
          type: 'string',
          enum: ['html', 'markdown', 'json', 'graphml'],
          description: 'Export format; defaults to HTML.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ...assetSummaryProperties(),
            format: {
              type: 'string',
              enum: ['html', 'markdown', 'json', 'graphml'],
              required: true,
            },
            path: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).assetGraphReport(args.graph_id, args.format ?? 'html')
      },
      isConcurrencySafe: () => true,
    }),
  )
}

type RuntimeFor = (execution: ToolExecution) => RedTeamRuntime

function registerKnowledgeStatusTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_knowledge_status',
      description:
        'Check the built-in local knowledge library and optional Graphiti/RAGFlow extensions without exposing credentials.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            local: {
              type: 'object',
              additionalProperties: false,
              required: true,
              properties: {
                available: { type: 'boolean', required: true },
                documentCount: { type: 'integer', required: true },
                eventCount: { type: 'integer', required: true },
                indexState: {
                  type: 'string',
                  enum: ['ready', 'rebuilt', 'degraded'],
                  required: true,
                },
                indexVersion: { type: 'integer', required: true },
                projectCount: { type: 'integer', required: true },
              },
            },
            currentProject: {
              oneOf: [
                {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', required: true },
                    projectId: { type: 'string', required: true },
                    startedAt: { type: 'string', required: true },
                  },
                },
                { type: 'null' },
              ],
              required: true,
            },
            graphiti: {
              type: 'object',
              additionalProperties: false,
              required: true,
              properties: {
                configured: { type: 'boolean', required: true },
                reachable: { type: 'boolean', required: true },
              },
            },
            ragflow: {
              type: 'object',
              additionalProperties: false,
              required: true,
              properties: {
                configured: { type: 'boolean', required: true },
                datasetTypes: {
                  type: 'array',
                  items: { type: 'string', enum: KNOWLEDGE_TYPES },
                  required: true,
                },
                reachable: { type: 'boolean', required: true },
              },
            },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(_args, execution) {
        return await runtimeFor(execution).knowledgeStatus(execution.signal)
      },
      isConcurrencySafe: () => true,
    }),
  )
}

function registerProjectStartTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_project_start',
      description:
        'Create a new authorized engagement in the built-in project memory and make it current for this workspace. Graphiti is an optional mirror.',
      parameters: {
        name: { type: 'string', required: true },
        objective: { type: 'string' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            episodeId: { type: 'string', required: true },
            extensionWarnings: { type: 'array', items: { type: 'string' } },
            name: { type: 'string', required: true },
            projectId: { type: 'string', required: true },
            startedAt: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).startProject(args.name, args.objective, execution.signal)
      },
    }),
  )
}

function memoryEventSchema() {
  return {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      authority: { type: 'string' as const, enum: MEMORY_AUTHORITY, required: true as const },
      confidence: { type: 'string' as const, enum: ASSET_CONFIDENCE, required: true as const },
      content: { type: 'string' as const, required: true as const },
      eventId: { type: 'string' as const, required: true as const },
      kind: { type: 'string' as const, enum: MEMORY_KINDS, required: true as const },
      occurredAt: { type: 'string' as const, required: true as const },
      projectId: { type: 'string' as const, required: true as const },
      promotable: { type: 'boolean' as const, required: true as const },
      recordedAt: { type: 'string' as const, required: true as const },
      schemaVersion: { type: 'integer' as const, const: 1, required: true as const },
      sensitivity: {
        type: 'string' as const,
        enum: MEMORY_SENSITIVITY,
        required: true as const,
      },
      sourceUrls: {
        type: 'array' as const,
        items: { type: 'string' as const },
        required: true as const,
      },
      status: { type: 'string' as const, enum: MEMORY_STATUS, required: true as const },
      tags: {
        type: 'array' as const,
        items: { type: 'string' as const },
        required: true as const,
      },
      title: { type: 'string' as const, required: true as const },
    },
  }
}

function registerProjectRememberTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_project_remember',
      description:
        'Write one redacted structured project event to the built-in local store. Exact event JSON is authoritative; optional Graphiti facts are retrieval aids.',
      parameters: {
        project_id: { type: 'string', description: 'Project id; defaults to the current project.' },
        kind: { type: 'string', enum: MEMORY_KINDS, required: true },
        title: { type: 'string', required: true },
        content: { type: 'string', required: true },
        authority: { type: 'string', enum: MEMORY_AUTHORITY },
        confidence: { type: 'string', enum: ASSET_CONFIDENCE },
        status: { type: 'string', enum: MEMORY_STATUS },
        sensitivity: { type: 'string', enum: MEMORY_SENSITIVITY },
        promotable: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        source_urls: { type: 'array', items: { type: 'string' } },
        occurred_at: { type: 'string' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            episodeId: { type: 'string', required: true },
            event: { ...memoryEventSchema(), required: true },
            extensionWarnings: { type: 'array', items: { type: 'string' } },
            projectId: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).rememberProject(
          args.project_id,
          args.kind,
          args.title,
          args.content,
          args.authority ?? 'observed',
          args.confidence ?? 'medium',
          args.status ?? 'active',
          args.sensitivity ?? 'internal',
          args.promotable ?? false,
          args.tags ?? [],
          args.source_urls ?? [],
          args.occurred_at,
          execution.signal,
        )
      },
    }),
  )
}

function registerProjectRecallTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_project_recall',
      description:
        'Read recent exact local project events and, when configured, optional Graphiti-derived facts within the same project.',
      parameters: {
        project_id: { type: 'string', description: 'Project id; defaults to the current project.' },
        query: { type: 'string' },
        limit: { type: 'integer', description: 'Maximum exact events and facts, from 1 to 100.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            events: {
              type: 'array',
              items: memoryEventSchema(),
              required: true,
            },
            extensionWarnings: { type: 'array', items: { type: 'string' } },
            facts: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  episodeIds: {
                    type: 'array',
                    items: { type: 'string' },
                    required: true,
                  },
                  fact: { type: 'string', required: true },
                  id: { type: 'string', required: true },
                  invalidAt: { type: 'string' },
                  validAt: { type: 'string' },
                },
              },
            },
            projectId: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        const limit = args.limit ?? 20
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new Error('limit must be an integer between 1 and 100')
        }
        return await runtimeFor(execution).recallProject(
          args.project_id,
          args.query,
          limit,
          execution.signal,
        )
      },
      isConcurrencySafe: () => true,
    }),
  )
}

function registerKnowledgeSearchTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_knowledge_search',
      description:
        'Search the built-in long-term Red Team library with identifier-aware full-text retrieval; optionally merge configured RAGFlow results.',
      parameters: {
        query: { type: 'string', required: true },
        knowledge_types: {
          type: 'array',
          items: { type: 'string', enum: KNOWLEDGE_TYPES },
          description: 'Knowledge namespaces; defaults to all built-in types.',
        },
        limit: { type: 'integer', description: 'Maximum chunks, from 1 to 30.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chunks: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  content: { type: 'string', required: true },
                  documentId: { type: 'string' },
                  documentName: { type: 'string' },
                  id: { type: 'string', required: true },
                  level: { type: 'integer', enum: [0, 1, 2] },
                  similarity: { type: 'number' },
                  source: { type: 'string', enum: ['builtin', 'ragflow'] },
                  title: { type: 'string' },
                  type: { type: 'string', enum: KNOWLEDGE_TYPES },
                  uri: { type: 'string' },
                },
              },
            },
            datasetTypes: {
              type: 'array',
              items: { type: 'string', enum: KNOWLEDGE_TYPES },
              required: true,
            },
            extensionWarnings: { type: 'array', items: { type: 'string' } },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        const limit = args.limit ?? 10
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) {
          throw new Error('limit must be an integer between 1 and 30')
        }
        const knowledgeTypes = args.knowledge_types ?? [...KNOWLEDGE_TYPES]
        if (knowledgeTypes.length === 0) {
          throw new Error('knowledge_types must not be empty')
        }
        return await runtimeFor(execution).searchKnowledge(
          args.query,
          [...new Set(knowledgeTypes)],
          limit,
          execution.signal,
        )
      },
      isConcurrencySafe: () => true,
    }),
  )
}

function knowledgeDocumentSummarySchema() {
  return {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      abstract: { type: 'string' as const, required: true as const },
      id: { type: 'string' as const, required: true as const },
      identifiers: {
        type: 'array' as const,
        items: { type: 'string' as const },
        required: true as const,
      },
      revision: { type: 'integer' as const, required: true as const },
      tags: {
        type: 'array' as const,
        items: { type: 'string' as const },
        required: true as const,
      },
      title: { type: 'string' as const, required: true as const },
      type: { type: 'string' as const, enum: KNOWLEDGE_TYPES, required: true as const },
      updatedAt: { type: 'string' as const, required: true as const },
      uri: { type: 'string' as const, required: true as const },
    },
  }
}

function registerKnowledgeUpsertTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_knowledge_upsert',
      description:
        'Create or update one bounded, redacted L0/L1/L2 document in the built-in Red Team library. Do not store credentials, customer-confidential exploit output, or raw successful tool responses.',
      parameters: {
        knowledge_type: { type: 'string', enum: KNOWLEDGE_TYPES, required: true },
        title: { type: 'string', required: true },
        key: {
          type: 'string',
          description: 'Stable identity such as a CVE, product, or case key.',
        },
        abstract: {
          type: 'string',
          description: 'L0 routing abstract; generated deterministically if omitted.',
        },
        overview: {
          type: 'string',
          description: 'L1 overview; generated deterministically if omitted.',
        },
        content: { type: 'string', required: true, description: 'L2 full redacted content.' },
        aliases: { type: 'array', items: { type: 'string' } },
        identifiers: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        products: { type: 'array', items: { type: 'string' } },
        versions: { type: 'array', items: { type: 'string' } },
        environments: { type: 'array', items: { type: 'string' } },
        source_urls: { type: 'array', items: { type: 'string' } },
        related_uris: { type: 'array', items: { type: 'string' } },
        project_ids: { type: 'array', items: { type: 'string' } },
        event_ids: { type: 'array', items: { type: 'string' } },
        authority: { type: 'string', enum: MEMORY_AUTHORITY },
        confidence: { type: 'string', enum: ASSET_CONFIDENCE },
        status: { type: 'string', enum: MEMORY_STATUS },
        sensitivity: { type: 'string', enum: LONG_TERM_SENSITIVITY },
        expected_revision: {
          type: 'integer',
          description: 'Optional optimistic-lock revision; use 0 for a required create.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            created: { type: 'boolean', required: true },
            document: { ...knowledgeDocumentSummarySchema(), required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).upsertKnowledge({
          aliases: args.aliases ?? [],
          authority: args.authority ?? 'observed',
          confidence: args.confidence ?? 'medium',
          content: args.content,
          environments: args.environments ?? [],
          eventIds: args.event_ids ?? [],
          identifiers: args.identifiers ?? [],
          products: args.products ?? [],
          projectIds: args.project_ids ?? [],
          relatedUris: args.related_uris ?? [],
          sensitivity: args.sensitivity ?? 'internal',
          sourceUrls: args.source_urls ?? [],
          status: args.status ?? 'active',
          tags: args.tags ?? [],
          title: args.title,
          type: args.knowledge_type,
          versions: args.versions ?? [],
          ...(args.abstract === undefined ? {} : { abstract: args.abstract }),
          ...(args.expected_revision === undefined
            ? {}
            : { expectedRevision: args.expected_revision }),
          ...(args.key === undefined ? {} : { key: args.key }),
          ...(args.overview === undefined ? {} : { overview: args.overview }),
        })
      },
    }),
  )
}

function registerKnowledgeReadTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_knowledge_read',
      description:
        'Read one built-in knowledge document by id or redteam:// URI at L0 abstract, L1 overview, or L2 full-content level.',
      parameters: {
        reference: { type: 'string', required: true },
        level: { type: 'integer', enum: [0, 1, 2], description: 'Defaults to L1 (1).' },
      },
      output: {
        schema: {
          ...knowledgeDocumentSummarySchema(),
          properties: {
            ...knowledgeDocumentSummarySchema().properties,
            aliases: {
              type: 'array',
              items: { type: 'string' },
              required: true,
            },
            authority: { type: 'string', enum: MEMORY_AUTHORITY, required: true },
            confidence: { type: 'string', enum: ASSET_CONFIDENCE, required: true },
            content: { type: 'string', required: true },
            environments: {
              type: 'array',
              items: { type: 'string' },
              required: true,
            },
            eventIds: {
              type: 'array',
              items: { type: 'string' },
              required: true,
            },
            level: { type: 'integer', enum: [0, 1, 2], required: true },
            products: {
              type: 'array',
              items: { type: 'string' },
              required: true,
            },
            projectIds: {
              type: 'array',
              items: { type: 'string' },
              required: true,
            },
            relatedUris: {
              type: 'array',
              items: { type: 'string' },
              required: true,
            },
            sensitivity: { type: 'string', enum: MEMORY_SENSITIVITY, required: true },
            sourceUrls: {
              type: 'array',
              items: { type: 'string' },
              required: true,
            },
            status: { type: 'string', enum: MEMORY_STATUS, required: true },
            versions: {
              type: 'array',
              items: { type: 'string' },
              required: true,
            },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        const level = args.level ?? 1
        if (level !== 0 && level !== 1 && level !== 2) {
          throw new Error('level must be 0, 1, or 2')
        }
        return await runtimeFor(execution).readKnowledge(args.reference, level)
      },
      isConcurrencySafe: () => true,
    }),
  )
}

function registerKnowledgeTreeTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_knowledge_tree',
      description:
        'Browse the built-in redteam://knowledge namespace without loading full L2 document content.',
      parameters: {
        prefix: { type: 'string', description: 'Defaults to redteam://knowledge.' },
        limit: { type: 'integer', description: 'Maximum nodes, from 1 to 200.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            nodes: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  childCount: { type: 'integer', required: true },
                  kind: { type: 'string', enum: ['namespace', 'document'], required: true },
                  title: { type: 'string', required: true },
                  type: { type: 'string', enum: KNOWLEDGE_TYPES },
                  uri: { type: 'string', required: true },
                },
              },
            },
            prefix: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        const limit = args.limit ?? 100
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
          throw new Error('limit must be an integer between 1 and 200')
        }
        return await runtimeFor(execution).knowledgeTree(args.prefix, limit)
      },
      isConcurrencySafe: () => true,
    }),
  )
}

function registerKnowledgeGrepTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_knowledge_grep',
      description:
        'Find exact text such as CVE ids, versions, domains, IPs, paths, and commands in built-in L2 knowledge content.',
      parameters: {
        query: { type: 'string', required: true },
        knowledge_types: {
          type: 'array',
          items: { type: 'string', enum: KNOWLEDGE_TYPES },
          description: 'Defaults to all knowledge types.',
        },
        limit: { type: 'integer', description: 'Maximum matches, from 1 to 100.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            matches: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  column: { type: 'integer', required: true },
                  line: { type: 'integer', required: true },
                  snippet: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  type: { type: 'string', enum: KNOWLEDGE_TYPES, required: true },
                  uri: { type: 'string', required: true },
                },
              },
            },
            query: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        const limit = args.limit ?? 20
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new Error('limit must be an integer between 1 and 100')
        }
        const types = args.knowledge_types ?? [...KNOWLEDGE_TYPES]
        if (types.length === 0) throw new Error('knowledge_types must not be empty')
        return await runtimeFor(execution).grepKnowledge(args.query, [...new Set(types)], limit)
      },
      isConcurrencySafe: () => true,
    }),
  )
}

function registerProjectPromoteTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_project_promote',
      description:
        'Promote one explicitly reusable, non-inferred, reviewed project event into the built-in long-term library; RAGFlow is an optional mirror.',
      parameters: {
        project_id: { type: 'string', description: 'Project id; defaults to the current project.' },
        episode_id: { type: 'string', required: true },
        knowledge_type: { type: 'string', enum: KNOWLEDGE_TYPES, required: true },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chunkId: { type: 'string', required: true },
            datasetId: { type: 'string', required: true },
            documentId: { type: 'string', required: true },
            episodeId: { type: 'string', required: true },
            extensionWarnings: { type: 'array', items: { type: 'string' } },
            knowledgeType: {
              type: 'string',
              enum: KNOWLEDGE_TYPES,
              required: true,
            },
            projectId: { type: 'string', required: true },
            uri: { type: 'string' },
            ragflow: {
              type: 'object',
              additionalProperties: false,
              properties: {
                chunkId: { type: 'string', required: true },
                datasetId: { type: 'string', required: true },
                documentId: { type: 'string', required: true },
              },
            },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).promoteProjectMemory(
          args.project_id,
          args.episode_id,
          args.knowledge_type,
          execution.signal,
        )
      },
    }),
  )
}

function registerStatusTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_status',
      description: 'Show the authorized repository scope and current passive assessment state.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            activeVerification: { type: 'boolean', required: true },
            categories: {
              type: 'array',
              items: { type: 'string', enum: CATEGORIES },
              required: true,
            },
            latestAssessmentId: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
              required: true,
            },
            latestAssetGraphId: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
              required: true,
            },
            currentProjectId: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
              required: true,
            },
            mode: { type: 'string', const: 'review', required: true },
            plugin: { type: 'string', const: 'dsh-redteam', required: true },
            ruleCount: { type: 'integer', required: true },
            rulesetVersion: { type: 'string', required: true },
            storageRoot: { type: 'string', required: true },
            version: { type: 'string', const: '1.3.2', required: true },
            workspaceRoot: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(_args, execution) {
        return await runtimeFor(execution).status()
      },
      isConcurrencySafe: () => true,
    }),
  )
}

function registerScanTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_scan',
      description:
        'Passively scan the authorized workspace for secret, source-code, and configuration risks. It never makes network requests.',
      parameters: {
        path: {
          type: 'string',
          description: 'Workspace-relative directory to scan; defaults to the workspace root.',
        },
        categories: {
          type: 'array',
          items: { type: 'string', enum: CATEGORIES },
          description: 'Optional subset of finding categories.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            assessmentId: { type: 'string', required: true },
            filesScanned: { type: 'integer', required: true },
            filesSkipped: { type: 'integer', required: true },
            findingCount: { type: 'integer', required: true },
            findingIds: {
              type: 'array',
              items: { type: 'string' },
              required: true,
            },
            truncated: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).scan(args.path, args.categories, execution.signal)
      },
    }),
  )
}

function registerFindingsTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_findings',
      description: 'List bounded, redacted findings from a repository assessment.',
      parameters: {
        assessment_id: {
          type: 'string',
          description: 'Assessment id; defaults to the latest assessment.',
        },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Optional severity filter.',
        },
        status: {
          type: 'string',
          enum: FINDING_STATUSES,
          description: 'Optional workflow status filter.',
        },
        limit: { type: 'integer', description: 'Maximum findings to return, from 1 to 100.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            assessmentId: { type: 'string', required: true },
            findings: {
              type: 'array',
              items: findingSchema(),
              required: true,
            },
            total: { type: 'integer', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        const limit = args.limit ?? 20
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new Error('limit must be an integer between 1 and 100')
        }
        return await runtimeFor(execution).findings(
          args.assessment_id,
          args.severity,
          args.status,
          limit,
        )
      },
      isConcurrencySafe: () => true,
    }),
  )
}

function registerFindingUpdateTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_update_finding',
      description:
        'Record a reviewed finding status with a required redacted audit reason. This does not perform active verification.',
      parameters: {
        assessment_id: {
          type: 'string',
          description: 'Assessment id; defaults to the latest assessment.',
        },
        finding_id: { type: 'string', required: true },
        status: { type: 'string', enum: FINDING_STATUSES, required: true },
        reason: {
          type: 'string',
          required: true,
          description:
            'Review rationale. Credentials are redacted and the stored value is bounded.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            assessmentId: { type: 'string', required: true },
            finding: { ...findingSchema(), required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).updateFinding(
          args.assessment_id,
          args.finding_id,
          args.status,
          args.reason,
        )
      },
    }),
  )
}

function registerReportTool(ctx: Context, runtimeFor: RuntimeFor): () => void {
  return ctx.tools.register(
    defineTool({
      name: 'redteam_report',
      description:
        'Write a redacted HTML, Word, Markdown, JSON, XML, or SARIF report for an assessment.',
      parameters: {
        assessment_id: {
          type: 'string',
          description: 'Assessment id; defaults to the latest assessment.',
        },
        format: {
          type: 'string',
          enum: ['html', 'word', 'markdown', 'json', 'xml', 'sarif'],
          description: 'Report format; defaults to markdown.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            assessmentId: { type: 'string', required: true },
            findingCount: { type: 'integer', required: true },
            format: {
              type: 'string',
              enum: ['html', 'word', 'markdown', 'json', 'xml', 'sarif'],
              required: true,
            },
            path: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, undefined, 2) }],
      },
      async execute(args, execution) {
        return await runtimeFor(execution).report(args.assessment_id, args.format ?? 'markdown')
      },
    }),
  )
}

export const name = 'dsh-redteam'
export const inject = ['agents', 'agentPresets', 'tools', 'systemPrompt', 'sandboxPolicy']

function activeAgentPreset(ctx: Context, agent: Agent): string | undefined {
  return ctx.agentPresets.composedPreset(agent.ctx)
}

export function apply(ctx: Context, config: Config): void {
  const options = resolveConfig(config)
  const runtimes = new Map<string, RedTeamRuntime>()
  const installed = new Map<Agent, () => void>()
  const policies = new Map<string, RedTeamExecutionPolicy>()
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as Context & { readonly connection: HostConnectionHandle })
      .connection
    connectionCtx.effect(
      () =>
        connection.rpc.handle(
          POLICY_RPC_CHANNEL,
          async (endpoint, payload, signal): Promise<PluginRpcResult> => {
            if (signal.aborted) {
              return {
                error: { code: 'internal', details: {}, message: '执行策略请求已取消。' },
                ok: false,
              }
            }
            const request = record(payload)
            const sessionId = request?.sessionId
            if (
              typeof sessionId !== 'string' ||
              sessionId.trim().length === 0 ||
              sessionId.length > 256
            ) {
              return {
                error: { code: 'internal', details: {}, message: '执行策略请求缺少会话标识。' },
                ok: false,
              }
            }
            if (endpoint === 'get') {
              return {
                ok: true,
                value: snapshotRedTeamExecutionPolicy(
                  policies.get(sessionId) ?? DEFAULT_REDTEAM_EXECUTION_POLICY,
                ),
              }
            }
            if (endpoint === 'update') {
              try {
                const policy = parseRedTeamExecutionPolicy(request?.policy)
                policies.set(sessionId, policy)
                return { ok: true, value: policy }
              } catch (error) {
                return {
                  error: {
                    code: 'internal',
                    details: {},
                    message: error instanceof Error ? error.message : String(error),
                  },
                  ok: false,
                }
              }
            }
            return {
              error: { code: 'internal', details: {}, message: '未知的执行策略操作。' },
              ok: false,
            }
          },
        ),
      'dsh-redteam: execution-policy rpc',
    )
    connectionCtx.effect(
      () =>
        connection.rpc.handle(
          TOOL_AVAILABILITY_RPC_CHANNEL,
          async (endpoint, _payload, signal): Promise<PluginRpcResult> => {
            if (signal.aborted) {
              return {
                error: { code: 'internal', details: {}, message: '工具状态请求已取消。' },
                ok: false,
              }
            }
            if (endpoint !== 'list') {
              return {
                error: { code: 'internal', details: {}, message: '未知的工具状态操作。' },
                ok: false,
              }
            }
            try {
              return { ok: true, value: { tools: await detectBuiltInToolAvailability() } }
            } catch (error) {
              return {
                error: {
                  code: 'internal',
                  details: {},
                  message: error instanceof Error ? error.message : String(error),
                },
                ok: false,
              }
            }
          },
        ),
      'dsh-redteam: tool-availability rpc',
    )
  })

  const workspaceFor = (execution: ToolExecution): string =>
    options.workspaceRoot ??
    ctx.sandboxPolicy.resolve(
      execution.agent === undefined ? {} : { session: execution.agent.session },
    ).workspaceRoot

  const runtimeFor = (execution: ToolExecution): RedTeamRuntime => {
    const workspaceRoot = workspaceFor(execution)
    const storageRoot = options.storageRoot ?? resolve(workspaceRoot, '.dsh-redteam')
    const knowledgeRoot = options.knowledgeRoot ?? resolve(storageRoot, 'knowledge')
    const key = `${workspaceRoot}\0${storageRoot}\0${knowledgeRoot}`
    const current = runtimes.get(key)
    if (current !== undefined) return current
    const runtime = new RedTeamRuntime({ ...options, knowledgeRoot, storageRoot, workspaceRoot })
    runtimes.set(key, runtime)
    return runtime
  }

  const uninstall = (agent: Agent): void => {
    installed.get(agent)?.()
    installed.delete(agent)
    policies.delete(String(agent.id))
  }

  const install = (agent: Agent): void => {
    if (installed.has(agent)) return
    const scoped = agent.ctx
    const disposers: Array<() => void> = []
    const extensionPrompt =
      options.graphiti === undefined && options.ragflow === undefined
        ? 'Graphiti and RAGFlow are not configured; this does not reduce built-in knowledge capabilities. '
        : 'Configured Graphiti or RAGFlow services are optional mirrors and retrieval extensions; local structured records remain available if either service is offline. '
    const knowledgePrompt =
      'The built-in Red Team knowledge library is always active. Use redteam_project_start, redteam_project_remember, and redteam_project_recall for explicit structured engagement events; this is domain evidence, never a copy of DSH chat or Agent state. Search reusable history with redteam_knowledge_search, browse redteam://knowledge with redteam_knowledge_tree, use redteam_knowledge_grep for exact identifiers, and read L0/L1/L2 content with redteam_knowledge_read. Add reviewed material with redteam_knowledge_upsert. Only after review, promote an explicitly reusable, non-inferred, confirmed event with redteam_project_promote. Built-in search returns bounded L1 previews; configured RAGFlow can add bounded external chunks. Load L2 only when needed. Never place credentials, customer-confidential successful exploit output, raw tool responses, prompts, or session state in project memory or long-term knowledge. ' +
      extensionPrompt
    disposers.push(
      scoped.systemPrompt.section({
        name: 'dsh-redteam',
        order: 25,
        text:
          'dsh-redteam keeps its own scanner and asset mapper in passive review mode for the current session workspace. ' +
          'The dashboard modes are real execution permissions: information collection, active scanning, vulnerability validation, and full access. A local security tool call below its required level must receive one-time approval on every step; an equal or higher level proceeds to the remaining Harness policies. The confirmed target checklist is a hard boundary and full access never authorizes an unchecked target. A tool must also be checked and confirmed in Tool Integration before use. ' +
          'Use redteam_scan to produce candidates, inspect them with redteam_findings, record evidence-backed review decisions with redteam_update_finding, and generate a report with redteam_report. ' +
          'For an authorized company, domain, IP, CIDR network, URL, ASN, product, infrastructure, supplier, technology, or certificate seed, create an asset graph with redteam_asset_map_start; use DSH public web search under its normal approval and network policy, record only sourced observations with redteam_asset_map_observe, and expand breadth-first with redteam_asset_map_frontier until the frontier is empty or the configured budget is reached. Export the result with redteam_asset_map_report. Every relationship requires a public HTTP(S) source; during asset discovery, do not log in, scan ports, enumerate non-public systems, use credentials, probe vulnerabilities, or treat inferred links as confirmed facts. When the user explicitly starts vulnerability testing, use only assets already recorded in the current project and DSH-provided tools under their normal sandbox and approval policy; keep checks bounded, low-impact, and non-destructive, and never perform denial of service, destructive writes, persistence, credential attacks, or actions affecting third parties. ' +
          knowledgePrompt +
          'Treat candidates as unconfirmed until evidence is reviewed. Never expand the authorized scope or claim a vulnerability is confirmed without reproducible evidence.',
      }),
    )

    disposers.push(
      scoped.on('tools/pre-execute', async (execution, next): Promise<PreToolDecision> => {
        if (options.enforceWorkspaceScope) {
          const outside = pathTargets(execution).find(
            (target) => !isPathWithin(workspaceFor(execution), target),
          )
          if (outside !== undefined) {
            const workspaceRoot = workspaceFor(execution)
            return {
              kind: 'deny',
              reason: `dsh-redteam scope denies path outside ${workspaceRoot}: ${outside}`,
            }
          }
        }
        const decision = evaluateRedTeamToolPolicy(
          policies.get(String(agent.id)) ?? DEFAULT_REDTEAM_EXECUTION_POLICY,
          execution.name,
          execution.arguments,
        )
        if (decision.kind === 'deny' || decision.kind === 'ask') return decision
        return await next()
      }),
    )

    disposers.push(
      registerStatusTool(scoped, runtimeFor),
      registerKnowledgeStatusTool(scoped, runtimeFor),
      registerProjectStartTool(scoped, runtimeFor),
      registerProjectRememberTool(scoped, runtimeFor),
      registerProjectRecallTool(scoped, runtimeFor),
      registerKnowledgeSearchTool(scoped, runtimeFor),
      registerKnowledgeUpsertTool(scoped, runtimeFor),
      registerKnowledgeReadTool(scoped, runtimeFor),
      registerKnowledgeTreeTool(scoped, runtimeFor),
      registerKnowledgeGrepTool(scoped, runtimeFor),
      registerProjectPromoteTool(scoped, runtimeFor),
      registerAssetMapStartTool(scoped, runtimeFor),
      registerAssetMapObserveTool(scoped, runtimeFor),
      registerAssetMapFrontierTool(scoped, runtimeFor),
      registerAssetMapReportTool(scoped, runtimeFor),
      registerScanTool(scoped, runtimeFor),
      registerFindingsTool(scoped, runtimeFor),
      registerFindingUpdateTool(scoped, runtimeFor),
      registerReportTool(scoped, runtimeFor),
    )
    let active = true
    installed.set(agent, () => {
      if (!active) return
      active = false
      for (const dispose of disposers.toReversed()) dispose()
    })
  }

  const reconcile = (agent: Agent, selected = activeAgentPreset(ctx, agent)): void => {
    if (selected === 'redteam') install(agent)
    else uninstall(agent)
  }

  for (const agent of ctx.agents.list()) reconcile(agent)
  ctx.on('agent/created', ({ agent }) => reconcile(agent))
  ctx.on('agent/disposed', ({ agent }) => uninstall(agent))
  ctx.on('agent-preset/selected', (sessionId, agentPreset) => {
    const agent = ctx.agents.get(sessionId)
    if (agent !== undefined) reconcile(agent, agentPreset)
  })
  ctx.effect(
    () => () => {
      for (const agent of installed.keys()) uninstall(agent)
      runtimes.clear()
    },
    'dsh-redteam: scoped mode contributions',
  )
}

const plugin = { Config, apply, inject, name }
export default plugin
