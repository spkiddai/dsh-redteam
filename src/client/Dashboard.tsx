import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DashboardConversationSnapshot,
  DashboardConversationSource,
  SessionId,
  UseSessionsLike,
} from './runtime-contract.js'
import { isRedteamSession } from './runtime-contract.js'
import {
  IconAgentPresetOutline16,
  IconListPenOutline16,
  IconPanelLeftOutline16,
  IconPlusOutline16,
  IconSearchOutline16,
  IconSendOutline16,
  IconWarningOutline16,
  MarkdownText,
  Tooltip,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  deriveDashboardState,
  type AssetMapSummary,
  type AssetNodePreview,
  type DashboardState,
  type FindingPreview,
  type Severity,
} from './dashboard-state.js'
import {
  assetMapPrompt,
  reportExportPrompt,
  vulnerabilityAnalysisPrompt,
  vulnerabilityValidationPrompt,
} from './prompts.js'

type ModuleId = 'project' | 'discovery' | 'testing' | 'tools'
export type OperationMode = 'passive' | 'active-scan' | 'exploitation' | 'full'
type ReportFormat = 'word' | 'html' | 'markdown'
type ReportTemplate = 'project' | 'vulnerability' | 'asset'
type TestingScopeMode = 'asset' | 'subdomains' | 'all-ports'

export interface TestingScopeRule {
  readonly mode: TestingScopeMode
  readonly targetId: string
  readonly targetLabel: string
  readonly targetType: string
}

export interface DashboardExecutionPolicy {
  readonly enabledToolIds: readonly string[]
  readonly operationMode: OperationMode
  readonly testingScope: readonly TestingScopeRule[]
}

export interface DashboardToolAvailability {
  readonly id: string
  readonly installed: boolean
}

export interface DashboardRuntime {
  closeNativeDetails(): void
  createProjectSession(input: {
    readonly name: string
    readonly path: string
  }): Promise<{ error?: string; ok: boolean }>
  loadProjectSession(input: { readonly path: string }): Promise<{ error?: string; ok: boolean }>
  executionPolicy(sessionId: SessionId): Promise<{
    readonly error?: string
    readonly ok: boolean
    readonly policy?: DashboardExecutionPolicy
  }>
  models(sessionId: SessionId): Promise<{
    readonly current?: DashboardModelSelection
    readonly error?: string
    readonly models: readonly DashboardModelOption[]
    readonly ok: boolean
    readonly routable?: boolean
  }>
  pickDirectory(): Promise<string | null>
  prompt(sessionId: SessionId, text: string): Promise<{ error?: string; ok: boolean }>
  selectModel(
    sessionId: SessionId,
    selection: DashboardModelSelection,
  ): Promise<{ error?: string; ok: boolean }>
  conversation(sessionId: SessionId): DashboardConversationSource | undefined
  loadOlder(sessionId: SessionId): Promise<void>
  toolAvailability(): Promise<{
    readonly error?: string
    readonly ok: boolean
    readonly tools: readonly DashboardToolAvailability[]
  }>
  updateExecutionPolicy(
    sessionId: SessionId,
    policy: DashboardExecutionPolicy,
  ): Promise<{
    readonly error?: string
    readonly ok: boolean
    readonly policy?: DashboardExecutionPolicy
  }>
}

export interface DashboardModelSelection {
  readonly model: string
  readonly provider: string
}

export interface DashboardModelOption extends DashboardModelSelection {
  readonly name: string
  readonly providerName: string
}

export interface DashboardProps extends Omit<PropsRuntime<'shell.overlay'>, 'useSessions'> {
  readonly runtime: DashboardRuntime
  readonly useSessions: UseSessionsLike
}

const MODULES: readonly { id: ModuleId; label: string }[] = [
  { id: 'project', label: '项目状态' },
  { id: 'discovery', label: '资产情况' },
  { id: 'testing', label: '漏洞汇总' },
  { id: 'tools', label: '工具集成' },
]

const OPERATION_MODES: readonly { id: OperationMode; label: string }[] = [
  { id: 'passive', label: '信息收集' },
  { id: 'active-scan', label: '主动扫描' },
  { id: 'exploitation', label: '漏洞验证' },
  { id: 'full', label: '全部允许' },
]

const MARKDOWN_LABELS: MarkdownLabels = {
  code: { copiedLabel: '已复制', copyLabel: '复制' },
  footnotes: '脚注',
}

const DISCOVERY_SCOPES = [
  { id: 'domain', label: '域名' },
  { id: 'ip', label: 'IP' },
  { id: 'port', label: '端口' },
  { id: 'service', label: '服务' },
] as const

const WEB_ANALYSIS_TYPES: readonly Choice[] = [
  { id: 'injection-execution', label: '注入与执行' },
  { id: 'identity-access', label: '身份与权限' },
  { id: 'file-data', label: '文件与数据' },
  { id: 'configuration-exposure', label: '配置与暴露' },
  { id: 'component-supply-chain', label: '组件与供应链' },
  { id: 'business-logic', label: '业务逻辑' },
]

const REDIS_ANALYSIS_TYPES: readonly Choice[] = [
  { id: 'redis-unauthorized-access', label: '未授权访问' },
  { id: 'redis-weak-authentication', label: '弱口令与鉴权' },
  { id: 'redis-dangerous-configuration', label: '危险配置' },
  { id: 'redis-data-exposure', label: '数据暴露' },
  { id: 'redis-command-execution', label: '命令执行' },
]

const NETWORK_ANALYSIS_TYPES: readonly Choice[] = [
  { id: 'network-service-exposure', label: '网络服务暴露' },
  { id: 'identity-access', label: '身份与权限' },
  { id: 'configuration-exposure', label: '配置与暴露' },
]

const COMPONENT_ANALYSIS_TYPES: readonly Choice[] = [
  { id: 'component-supply-chain', label: '组件与供应链' },
  { id: 'configuration-exposure', label: '配置与暴露' },
  { id: 'identity-access', label: '身份与权限' },
]

const CLOUD_ANALYSIS_TYPES: readonly Choice[] = [
  { id: 'cloud-container', label: '云与容器' },
  { id: 'identity-access', label: '身份与权限' },
  { id: 'configuration-exposure', label: '配置与暴露' },
  { id: 'file-data', label: '文件与数据' },
]

const DEFAULT_ANALYSIS_TYPES: readonly Choice[] = [
  { id: 'identity-access', label: '身份与权限' },
  { id: 'configuration-exposure', label: '配置与暴露' },
]

const TESTING_SCOPE_PREVIEW_LIMIT = 8

const EXPLOITATION_TYPES = [
  { id: 'command-execution', label: '命令执行' },
  { id: 'file-upload', label: '文件上传' },
  { id: 'data-access', label: '数据访问' },
  { id: 'credential-theft', label: '凭证窃取' },
] as const

function exploitationTypesForFinding(finding: FindingPreview): Choice[] {
  const text = `${finding.title} ${finding.location}`.toLocaleLowerCase()
  const choices: Choice[] = []
  const include = (id: (typeof EXPLOITATION_TYPES)[number]['id']): void => {
    const choice = EXPLOITATION_TYPES.find((candidate) => candidate.id === id)
    if (choice !== undefined && !choices.some((candidate) => candidate.id === id)) {
      choices.push(choice)
    }
  }
  if (/command|rce|exec|injection|deserialize|代码执行|命令执行/u.test(text)) {
    include('command-execution')
  }
  if (/upload|file write|arbitrary file|path traversal|文件上传|任意文件|目录穿越/u.test(text)) {
    include('file-upload')
  }
  if (/sql|database|data|read|exposure|idor|ssrf|数据|读取|越权/u.test(text)) {
    include('data-access')
  }
  if (/credential|secret|password|token|session|auth|凭证|密钥|口令/u.test(text)) {
    include('credential-theft')
  }
  if (finding.category === 'secret') include('credential-theft')
  if (finding.category === 'configuration') include('data-access')
  return choices
}

interface SecurityToolChoice {
  readonly category: string
  readonly endpoint?: string
  readonly id: string
  readonly label: string
  readonly source: 'built-in' | 'mcp'
  readonly transport?: McpTransport
}

type McpTransport = 'http' | 'sse' | 'stdio'

const MCP_TRANSPORTS: readonly Choice[] = [
  { id: 'http', label: 'HTTP' },
  { id: 'sse', label: 'SSE' },
  { id: 'stdio', label: 'STDIO' },
]

const BUILT_IN_SECURITY_TOOLS: readonly SecurityToolChoice[] = [
  { category: '网络发现', id: 'nmap', label: 'Nmap', source: 'built-in' },
  { category: 'Web 代理', id: 'burp-suite', label: 'Burp Suite', source: 'built-in' },
  { category: '验证框架', id: 'metasploit', label: 'Metasploit', source: 'built-in' },
  { category: 'Web扫描', id: 'nuclei', label: 'Nuclei', source: 'built-in' },
]

type Choice = { readonly id: string; readonly label: string }

function ChoiceGrid({
  choices,
  disabled = false,
  selected,
  setSelected,
}: {
  choices: readonly Choice[]
  disabled?: boolean
  selected: readonly string[]
  setSelected: (next: string[]) => void
}) {
  return (
    <div className="dsh-redteam-dashboard__choices">
      {choices.map((choice) => {
        const checked = selected.includes(choice.id)
        return (
          <label
            className="dsh-redteam-dashboard__choice"
            data-disabled={disabled || undefined}
            data-selected={checked || undefined}
            key={choice.id}
          >
            <input
              checked={checked}
              disabled={disabled}
              type="checkbox"
              onChange={() =>
                setSelected(
                  checked
                    ? selected.filter((current) => current !== choice.id)
                    : [...selected, choice.id],
                )
              }
            />
            <span>
              <strong>{choice.label}</strong>
            </span>
          </label>
        )
      })}
    </div>
  )
}

function ModuleIcon({ name, size = 18 }: { name: ModuleId; size?: number }) {
  if (name === 'discovery') return <IconSearchOutline16 size={size} />
  if (name === 'testing') return <IconWarningOutline16 size={size} />
  if (name === 'tools') return <IconPlusOutline16 size={size} />
  return <IconListPenOutline16 size={size} />
}

function useConversation(
  source: DashboardConversationSource | undefined,
): DashboardConversationSnapshot | undefined {
  const subscribe = useCallback(
    (listener: () => void) => source?.subscribe(listener) ?? (() => undefined),
    [source],
  )
  const getSnapshot = useCallback(() => source?.getSnapshot(), [source])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function ModuleHeader({ title }: { readonly title: string }) {
  return (
    <div className="dsh-redteam-dashboard__module-header">
      <h3 className="dsh-redteam-dashboard__module-title">{title}</h3>
    </div>
  )
}

function AssetGraph({
  assetMap,
  findingCount = 0,
  findings = [],
  projectName,
}: {
  readonly assetMap: AssetMapSummary | undefined
  readonly findingCount?: number
  readonly findings?: DashboardState['findings']
  readonly projectName: string
}) {
  const [zoom, setZoom] = useState(1)
  const preview =
    assetMap === undefined
      ? []
      : [assetMap.seed, ...assetMap.frontier].filter((node) => node !== undefined)
  const shown = preview
    .filter(
      (node, index, nodes) => nodes.findIndex((candidate) => candidate.id === node.id) === index,
    )
    .slice(0, 10)
  const center = { x: 440, y: 220 }
  const radius = 170
  const nodes = shown.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(shown.length, 1) - Math.PI / 2
    return {
      ...node,
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    }
  })
  const findingText = findings
    .map((finding) => `${finding.title} ${finding.location}`.toLocaleLowerCase())
    .join(' ')
  const directlyVulnerable = nodes
    .filter((node) => {
      const id = node.id.toLocaleLowerCase()
      const label = node.label.toLocaleLowerCase()
      return findingText.includes(id) || findingText.includes(label)
    })
    .map((node) => node.id)
  const fallbackVulnerableId =
    findingCount > 0 && directlyVulnerable.length === 0
      ? (assetMap?.seed?.id ?? nodes.find((node) => node.expanded)?.id)
      : undefined
  const vulnerableIds = new Set(
    fallbackVulnerableId === undefined
      ? directlyVulnerable
      : [...directlyVulnerable, fallbackVulnerableId],
  )
  return (
    <div className="dsh-redteam-dashboard__graph-wrap">
      <div className="dsh-redteam-dashboard__graph-toolbar" aria-label="资产详情缩放控制">
        <button
          type="button"
          aria-label="缩小资产详情"
          disabled={zoom <= 0.6}
          onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}
        >
          −
        </button>
        <button type="button" aria-label="重置资产详情缩放" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="放大资产详情"
          disabled={zoom >= 1.8}
          onClick={() => setZoom((value) => Math.min(1.8, value + 0.2))}
        >
          ＋
        </button>
      </div>
      <svg
        className="dsh-redteam-dashboard__graph"
        viewBox="0 0 880 440"
        role="img"
        aria-label="资产详情"
      >
        <defs>
          <linearGradient id="redteam-project-assets" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#526b8f" />
            <stop offset="1" stopColor="#273a57" />
          </linearGradient>
        </defs>
        <g
          data-graph-zoom={zoom.toFixed(1)}
          transform={`translate(${String(center.x)} ${String(center.y)}) scale(${String(zoom)}) translate(-${String(center.x)} -${String(center.y)})`}
        >
          {nodes.map((node) => (
            <line
              className="dsh-redteam-dashboard__graph-edge"
              key={`edge-${node.id}`}
              x1={center.x}
              y1={center.y}
              x2={node.x}
              y2={node.y}
            />
          ))}
          {nodes.map((node) => (
            <g
              className="dsh-redteam-dashboard__graph-node"
              data-status={
                vulnerableIds.has(node.id) ? 'vulnerable' : node.expanded ? 'complete' : 'pending'
              }
              key={node.id}
              transform={`translate(${String(node.x)} ${String(node.y)})`}
            >
              <circle r="36" />
              <text className="dsh-redteam-dashboard__graph-node-type" textAnchor="middle" y="-3">
                {node.type}
              </text>
              <text className="dsh-redteam-dashboard__graph-node-label" textAnchor="middle" y="15">
                {node.label.length > 16 ? `${node.label.slice(0, 14)}…` : node.label}
              </text>
            </g>
          ))}
          <g
            className="dsh-redteam-dashboard__graph-node dsh-redteam-dashboard__graph-node--project"
            transform={`translate(${String(center.x)} ${String(center.y)})`}
          >
            <circle r="50" fill="url(#redteam-project-assets)" />
            <text className="dsh-redteam-dashboard__graph-node-type" textAnchor="middle" y="-5">
              项目
            </text>
            <text className="dsh-redteam-dashboard__graph-node-label" textAnchor="middle" y="16">
              {projectName.length > 14 ? `${projectName.slice(0, 12)}…` : projectName}
            </text>
          </g>
        </g>
        {assetMap !== undefined &&
          assetMap.completedCount > shown.filter((node) => node.expanded).length && (
            <g className="dsh-redteam-dashboard__graph-aggregate" transform="translate(765 54)">
              <rect height="34" rx="17" width="98" />
              <text x="49" y="22" textAnchor="middle">
                已完成 {assetMap.completedCount}
              </text>
            </g>
          )}
        {assetMap !== undefined &&
          assetMap.frontierCount > shown.filter((node) => !node.expanded).length && (
            <g
              className="dsh-redteam-dashboard__graph-aggregate"
              data-status="pending"
              transform="translate(765 96)"
            >
              <rect height="34" rx="17" width="98" />
              <text x="49" y="22" textAnchor="middle">
                待测试 {assetMap.frontierCount}
              </text>
            </g>
          )}
      </svg>
      <div className="dsh-redteam-dashboard__legend">
        <span>
          <i data-kind="complete" />
          无漏洞节点
        </span>
        <span>
          <i data-kind="pending" />
          未开始节点
        </span>
        <span>
          <i data-kind="vulnerable" />
          有漏洞节点
        </span>
        {assetMap === undefined && <span>尚未采集资产，当前仅显示项目节点。</span>}
      </div>
    </div>
  )
}

function severityCounts(state: DashboardState): Record<Severity, number> {
  return state.findings.reduce<Record<Severity, number>>(
    (counts, finding) => ({ ...counts, [finding.severity]: counts[finding.severity] + 1 }),
    { critical: 0, high: 0, medium: 0, low: 0 },
  )
}

interface ConversationEntry {
  readonly key: string
  readonly live?: boolean
  readonly role: 'assistant' | 'user'
  readonly text: string
}

const CONVERSATION_SECRET_ASSIGNMENT =
  /\b(api[_-]?key|authorization|cookie|credential|password|secret|token)\b(\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}\n]+)/giu
const CONVERSATION_JSON_SECRET =
  /(["'](?:api[_-]?key|authorization|cookie|credential|password|secret|token)["']\s*:\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}\n]+)/giu
const CONVERSATION_AWS_ACCESS_KEY = /\bAKIA[0-9A-Z]{16}\b/gu
const CONVERSATION_BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/giu
const CONVERSATION_URL_CREDENTIALS = /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu

function boundedMessageText(value: string): string {
  const redacted = value
    .trim()
    .replace(CONVERSATION_AWS_ACCESS_KEY, '[redacted-aws-key]')
    .replace(CONVERSATION_BEARER_TOKEN, 'Bearer [redacted]')
    .replace(CONVERSATION_URL_CREDENTIALS, '$1[redacted]@')
    .replace(CONVERSATION_JSON_SECRET, '$1"[redacted]"')
    .replace(CONVERSATION_SECRET_ASSIGNMENT, '$1$2[redacted]')
  return redacted.length <= 1500 ? redacted : `${redacted.slice(0, 1500)}…[truncated]`
}

function isDashboardAutomationPrompt(text: string): boolean {
  return (
    [
      '请刷新当前红队项目状态。',
      '请针对用户明确授权的目标 ',
      '请对当前授权工作区执行有针对性的被动代码审计。',
      '请基于当前授权项目已采集的资产图',
      '请立即对当前授权项目已采集的资产执行一次完整漏洞测试。',
      '请基于当前项目已有资产与漏洞记录分析所选资产节点。',
      '请对当前项目中已记录的候选漏洞进行非破坏性的可利用性证据验证。',
      '请基于当前项目已有资产和漏洞证据，对所选资产节点进行 ',
      '请为当前授权工作创建新的项目记录',
      '请从当前工作目录读取之前保存的红队项目状态',
    ].some((prefix) => text.startsWith(prefix)) || /^请按 .* 模板导出当前项目/u.test(text)
  )
}

function contentBlockText(content: readonly unknown[]): string {
  return boundedMessageText(
    content
      .flatMap((block) => {
        if (block === null || typeof block !== 'object') return []
        if (!('type' in block) || block.type !== 'text') return []
        if (!('text' in block) || typeof block.text !== 'string') return []
        return [block.text]
      })
      .join('\n'),
  )
}

interface ToolActivity {
  readonly detail: string
  readonly key: string
  readonly name: string
  readonly status: 'error' | 'running' | 'success'
}

function recentToolActivity(
  snapshot: DashboardConversationSnapshot | undefined,
): readonly ToolActivity[] {
  if (snapshot === undefined) return []
  const completed = snapshot.nodes.flatMap<ToolActivity>((node) => {
    if (
      node.kind !== 'tool-result' ||
      node.call === null ||
      node.call === undefined ||
      node.callId === undefined ||
      node.content === undefined
    )
      return []
    const text = contentBlockText(node.content).replace(/\s+/gu, ' ')
    return [
      {
        detail:
          text === ''
            ? node.isError
              ? '工具返回错误。'
              : '工具执行完成。'
            : text.length <= 220
              ? text
              : `${text.slice(0, 220)}…`,
        key: `tool-${node.callId}-${String(node.seq)}`,
        name: node.call.name,
        status: node.isError ? 'error' : 'success',
      },
    ]
  })
  const running = snapshot.runningCalls.map<ToolActivity>((call, index) => ({
    detail: '正在当前棱镜会话中执行。',
    key: `running-${call.name}-${String(index)}`,
    name: call.name,
    status: 'running',
  }))
  return [...completed.slice(-7).toReversed(), ...running].slice(0, 8)
}

function conversationEntries(
  snapshot: DashboardConversationSnapshot | undefined,
): readonly ConversationEntry[] {
  if (snapshot === undefined) return []
  const entries = snapshot.nodes.flatMap<ConversationEntry>((node) => {
    if (node.kind === 'user' || node.kind === 'steering') {
      const text = contentBlockText(node.content ?? [])
      return text === '' || isDashboardAutomationPrompt(text)
        ? []
        : [{ key: `${node.kind}-${String(node.seq)}`, role: 'user', text }]
    }
    if (node.kind === 'assistant') {
      const text = boundedMessageText(
        (node.blocks ?? [])
          .flatMap((block) =>
            block.kind === 'text' && block.text !== undefined ? [block.text] : [],
          )
          .join('\n'),
      )
      return text === '' ? [] : [{ key: `assistant-${String(node.seq)}`, role: 'assistant', text }]
    }
    return []
  })
  if (snapshot.partial !== null) {
    const text = boundedMessageText(
      snapshot.partial.blocks
        .flatMap((block) => (block.kind === 'text' && block.text !== undefined ? [block.text] : []))
        .join('\n'),
    )
    if (text !== '') {
      entries.push({
        key: `partial-${String(snapshot.partial.turn)}-${String(snapshot.partial.step)}`,
        live: true,
        role: 'assistant',
        text,
      })
    }
  }
  return entries.slice(-20)
}

function SessionConversation({
  busy,
  loadOlder,
  run,
  snapshot,
}: {
  readonly busy: boolean
  readonly loadOlder: () => void
  readonly run: (text: string) => void
  readonly snapshot: DashboardConversationSnapshot | undefined
}) {
  const [message, setMessage] = useState('')
  const entries = useMemo(() => conversationEntries(snapshot), [snapshot])
  const send = (): void => {
    const text = message.trim()
    if (text === '' || busy) return
    run(text)
    setMessage('')
  }
  return (
    <section className="dsh-redteam-dashboard__conversation" data-project-conversation>
      <div className="dsh-redteam-dashboard__conversation-main">
        <div className="dsh-redteam-dashboard__card-heading">
          <h4 className="dsh-redteam-dashboard__card-title">会话对话</h4>
          <span className="dsh-redteam-dashboard__badge" data-kind="local">
            {snapshot?.running === true ? '进行中' : '当前会话'}
          </span>
        </div>
        <div className="dsh-redteam-dashboard__conversation-history-heading">
          <h5 className="dsh-redteam-dashboard__subheading">对话历史</h5>
          {snapshot?.hasMore === true && (
            <button
              className="dsh-redteam-dashboard__button"
              type="button"
              disabled={snapshot.loadingOlder}
              onClick={loadOlder}
            >
              {snapshot.loadingOlder ? '正在加载…' : '加载更早对话'}
            </button>
          )}
        </div>
        <div className="dsh-redteam-dashboard__conversation-history" aria-label="对话历史">
          {entries.length === 0 ? (
            <p className="dsh-redteam-dashboard__empty">当前会话还没有可展示的对话。</p>
          ) : (
            entries.map((entry) => (
              <article
                className="dsh-redteam-dashboard__message"
                data-live={entry.live || undefined}
                data-role={entry.role}
                key={entry.key}
                aria-label={entry.role === 'user' ? '你的消息' : '棱镜助手消息'}
              >
                {entry.role === 'assistant' ? (
                  <div className="dsh-redteam-dashboard__message-markdown">
                    <MarkdownText
                      labels={MARKDOWN_LABELS}
                      text={entry.text}
                      streaming={entry.live === true}
                    />
                  </div>
                ) : (
                  <p>{entry.text}</p>
                )}
              </article>
            ))
          )}
        </div>
        <form
          aria-label="会话输入"
          className="dsh-redteam-dashboard__conversation-composer"
          onSubmit={(event) => {
            event.preventDefault()
            send()
          }}
        >
          <textarea
            aria-label="会话消息"
            className="dsh-redteam-dashboard__conversation-input"
            placeholder="向棱镜发送消息"
            rows={2}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                event.nativeEvent.isComposing ||
                busy ||
                message.trim() === ''
              )
                return
              event.preventDefault()
              send()
            }}
          />
          <div className="dsh-redteam-dashboard__conversation-toolbar">
            <span className="dsh-redteam-dashboard__conversation-add" aria-hidden="true">
              <IconPlusOutline16 size={16} />
            </span>
            <Tooltip label="发送消息" side="top" delayMs={300}>
              <button
                aria-label="发送消息"
                className="dsh-redteam-dashboard__conversation-send"
                type="submit"
                disabled={busy || message.trim() === ''}
              >
                <IconSendOutline16 size={16} />
              </button>
            </Tooltip>
          </div>
        </form>
      </div>
    </section>
  )
}

function usageRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function usageNumber(...values: readonly unknown[]): number {
  return (
    values.find(
      (value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0,
    ) ?? 0
  )
}

function conversationUsage(snapshot: DashboardConversationSnapshot | undefined): {
  readonly cacheHitRate: number
  readonly cost: number | undefined
  readonly inputTokens: number
  readonly outputTokens: number
} {
  const assistants = snapshot?.nodes.filter((node) => node.kind === 'assistant') ?? []
  let cacheHit = 0
  let inputTokens = 0
  let outputTokens = 0
  let cost = 0
  let hasCost = false
  for (const assistant of assistants) {
    const usage = usageRecord(assistant.usage)
    if (usage === undefined) continue
    const input = usageNumber(
      usage.input_tokens,
      usage.inputTokens,
      usage.prompt_tokens,
      usage.promptTokens,
    )
    const output = usageNumber(
      usage.output_tokens,
      usage.outputTokens,
      usage.completion_tokens,
      usage.completionTokens,
    )
    const inputDetails = usageRecord(usage.input_tokens_details ?? usage.inputTokensDetails)
    const promptDetails = usageRecord(usage.prompt_tokens_details ?? usage.promptTokensDetails)
    const disjointCached = usageNumber(
      usage.cacheReadTokens,
      usage.cache_read_input_tokens,
      usage.cacheReadInputTokens,
    )
    const embeddedCached = usageNumber(
      usage.cached_tokens,
      usage.cachedTokens,
      inputDetails?.cached_tokens,
      inputDetails?.cachedTokens,
      promptDetails?.cached_tokens,
      promptDetails?.cachedTokens,
    )
    inputTokens += disjointCached > 0 ? input + disjointCached : Math.max(input, embeddedCached)
    cacheHit +=
      disjointCached > 0 ? disjointCached : Math.min(embeddedCached, input || embeddedCached)
    outputTokens += output
    const costRecord = usageRecord(usage.cost)
    const reportedCost = [
      usage.total_cost,
      usage.totalCost,
      typeof usage.cost === 'number' ? usage.cost : undefined,
      costRecord?.total,
    ].find(
      (value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0,
    )
    if (reportedCost !== undefined) {
      cost += reportedCost
      hasCost = true
    }
  }
  return {
    cacheHitRate: inputTokens === 0 ? 0 : (cacheHit / inputTokens) * 100,
    cost: hasCost ? cost : undefined,
    inputTokens,
    outputTokens,
  }
}

function ProjectModule({
  busy,
  cwd,
  loadOlder,
  modelBusy,
  modelCurrent,
  modelOptions,
  operationMode,
  run,
  selectModel,
  setTestingScope,
  snapshot,
  state,
  testingScope,
}: {
  busy: boolean
  cwd: string | undefined
  loadOlder: () => void
  modelBusy: boolean
  modelCurrent: DashboardModelSelection | undefined
  modelOptions: readonly DashboardModelOption[]
  operationMode: OperationMode
  run: (text: string) => void
  selectModel: (selection: DashboardModelSelection) => void
  setTestingScope: (next: TestingScopeRule[]) => void
  snapshot: DashboardConversationSnapshot | undefined
  state: DashboardState
  testingScope: readonly TestingScopeRule[]
}) {
  const project = state.project
  const projectWorkTotal = (state.assetMap?.nodeCount ?? 0) + (project?.eventCount ?? 0)
  const projectWorkCompleted =
    (state.assetMap?.completedCount ?? 0) + (project?.completedEventCount ?? 0)
  const projectProgress =
    projectWorkTotal === 0 ? 0 : Math.round((projectWorkCompleted / projectWorkTotal) * 100)
  const usage = conversationUsage(snapshot)
  const testTargets = useMemo(() => assetTestTargets(state.assetMap), [state.assetMap])
  const scopePreviewTargets = testTargets.slice(0, TESTING_SCOPE_PREVIEW_LIMIT)
  const scopedTargets = useMemo(
    () => assetsInTestingScope(testTargets, testingScope),
    [testTargets, testingScope],
  )
  const testingScopeLabels = useMemo(() => testingScopeDescriptions(testingScope), [testingScope])
  return (
    <>
      <ModuleHeader title="项目状态" />
      <div className="dsh-redteam-dashboard__project-primary-grid">
        <section className="dsh-redteam-dashboard__card" data-project-panel="project-overview">
          <div className="dsh-redteam-dashboard__card-heading dsh-redteam-dashboard__card-heading--status">
            <h4 className="dsh-redteam-dashboard__card-title">项目概览</h4>
            <span className="dsh-redteam-dashboard__badge" data-kind="local">
              {project?.currentProjectId === undefined ? '未创建' : '进行中'}
            </span>
          </div>
          <dl className="dsh-redteam-dashboard__definition-list">
            <div>
              <dt>名称</dt>
              <dd>{project?.currentProjectName ?? '尚未创建'}</dd>
            </div>
            <div>
              <dt>项目 ID</dt>
              <dd>{project?.currentProjectId ?? '—'}</dd>
            </div>
            <div>
              <dt>工作区</dt>
              <dd title={cwd}>{cwd ?? '正在解析…'}</dd>
            </div>
          </dl>
          <div className="dsh-redteam-dashboard__progress-overview">
            <strong>{projectProgress}%</strong>
            <span>总体完成度</span>
          </div>
          <div className="dsh-redteam-dashboard__progress-bar">
            <i style={{ width: `${String(projectProgress)}%` }} />
          </div>
          <ResultExportControls busy={busy} run={run} state={state} />
        </section>
        <section className="dsh-redteam-dashboard__card" data-project-panel="model-status">
          <h4 className="dsh-redteam-dashboard__card-title">模型情况</h4>
          <label className="dsh-redteam-dashboard__model-select-field">
            <span>当前模型</span>
            <select
              aria-label="模型选择"
              className="dsh-redteam-dashboard__select"
              disabled={modelBusy || modelOptions.length === 0}
              value={
                modelCurrent === undefined ? '' : `${modelCurrent.provider}::${modelCurrent.model}`
              }
              onChange={(event) => {
                const [provider, model] = event.target.value.split('::')
                if (provider !== undefined && model !== undefined) selectModel({ model, provider })
              }}
            >
              {modelOptions.length === 0 && <option value="">暂无可用模型</option>}
              {modelOptions.map((model) => (
                <option
                  key={`${model.provider}::${model.model}`}
                  value={`${model.provider}::${model.model}`}
                >
                  {model.name} · {model.providerName}
                </option>
              ))}
            </select>
          </label>
          <div className="dsh-redteam-dashboard__metrics dsh-redteam-dashboard__metrics--usage">
            {[
              ['输入 Token', usage.inputTokens.toLocaleString()],
              ['输出 Token', usage.outputTokens.toLocaleString()],
              ['缓存命中率', `${usage.cacheHitRate.toFixed(1)}%`],
              ['费用消耗', usage.cost === undefined ? '—' : `$${usage.cost.toFixed(4)}`],
            ].map(([label, value]) => (
              <div className="dsh-redteam-dashboard__metric" key={label}>
                <span className="dsh-redteam-dashboard__metric-value">{value}</span>
                <span className="dsh-redteam-dashboard__metric-label">{label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="dsh-redteam-dashboard__project-collection-grid">
        <AssetCollectionControls busy={busy} run={run} />
        <TestingScopePanel
          busy={busy}
          rules={testingScope}
          setRules={setTestingScope}
          targets={scopePreviewTargets}
          totalTargetCount={Math.max(testTargets.length, state.assetMap?.nodeCount ?? 0)}
        />
      </div>
      <div className="dsh-redteam-dashboard__project-action-grid">
        <VulnerabilityAnalysisControls
          assets={scopedTargets}
          busy={busy}
          run={run}
          testingScope={testingScopeLabels}
        />
        <VulnerabilityValidationControls
          busy={busy}
          operationMode={operationMode}
          run={run}
          state={state}
          testingScope={testingScopeLabels}
        />
      </div>
      <SessionConversation busy={busy} loadOlder={loadOlder} run={run} snapshot={snapshot} />
    </>
  )
}

function AssetCollectionControls({
  busy,
  run,
}: {
  readonly busy: boolean
  readonly run: (text: string) => void
}) {
  const [selected, setSelected] = useState<string[]>(DISCOVERY_SCOPES.map((scope) => scope.id))
  const [target, setTarget] = useState('')
  const labels = DISCOVERY_SCOPES.filter((scope) => selected.includes(scope.id)).map(
    (scope) => scope.label,
  )
  return (
    <section className="dsh-redteam-dashboard__card" data-project-action="asset-collection">
      <h4 className="dsh-redteam-dashboard__card-title">信息收集</h4>
      <h5 className="dsh-redteam-dashboard__subheading">采集目标</h5>
      <input
        aria-label="域名或 IP"
        className="dsh-redteam-dashboard__input"
        placeholder="例如：example.com、203.0.113.10"
        value={target}
        onChange={(event) => setTarget(event.target.value)}
      />
      <h5 className="dsh-redteam-dashboard__subheading">资产类型</h5>
      <ChoiceGrid choices={DISCOVERY_SCOPES} selected={selected} setSelected={setSelected} />
      <div className="dsh-redteam-dashboard__button-row">
        <button
          className="dsh-redteam-dashboard__button"
          type="button"
          disabled={busy}
          onClick={() => setSelected(DISCOVERY_SCOPES.map((scope) => scope.id))}
        >
          全选
        </button>
        <button
          className="dsh-redteam-dashboard__button"
          type="button"
          disabled={busy}
          onClick={() => setSelected([])}
        >
          清空
        </button>
        <button
          className="dsh-redteam-dashboard__button"
          type="button"
          disabled={busy || labels.length === 0 || target.trim() === ''}
          onClick={() => run(assetMapPrompt(target.trim(), labels))}
        >
          开始采集
        </button>
      </div>
    </section>
  )
}

function AssetOverviewModule({
  projectName,
  state,
}: {
  readonly projectName: string
  readonly state: DashboardState
}) {
  const findingCount = state.findingsTotal ?? state.scan?.findingCount ?? 0
  const inventory = state.assetMap?.inventory
  const visibleNodes =
    state.assetMap === undefined
      ? []
      : [state.assetMap.seed, ...state.assetMap.frontier]
          .filter((node) => node !== undefined)
          .filter(
            (node, index, nodes) =>
              nodes.findIndex((candidate) => candidate.id === node.id) === index,
          )
  const completeVisibleCounts =
    state.assetMap !== undefined && visibleNodes.length === state.assetMap.nodeCount
      ? visibleNodes.reduce<Record<string, number>>((counts, node) => {
          counts[node.type] = (counts[node.type] ?? 0) + 1
          return counts
        }, {})
      : undefined
  const completeVisibleCount = (type: string): number | undefined =>
    completeVisibleCounts === undefined ? undefined : (completeVisibleCounts[type] ?? 0)
  const metrics = [
    {
      label: '域名',
      value: inventory?.typeCounts.domain ?? completeVisibleCount('domain'),
    },
    {
      label: 'IP',
      value:
        inventory === undefined
          ? completeVisibleCounts === undefined
            ? undefined
            : (completeVisibleCount('ip') ?? 0) + (completeVisibleCount('network') ?? 0)
          : inventory.typeCounts.ip + inventory.typeCounts.network,
    },
    {
      label: '端口',
      value: inventory?.typeCounts.url ?? completeVisibleCount('url'),
    },
    {
      label: '服务',
      value:
        inventory === undefined
          ? completeVisibleCounts === undefined
            ? undefined
            : (completeVisibleCount('product') ?? 0) +
              (completeVisibleCount('technology') ?? 0) +
              (completeVisibleCount('infrastructure') ?? 0)
          : inventory.typeCounts.product +
            inventory.typeCounts.technology +
            inventory.typeCounts.infrastructure,
    },
  ] as const
  return (
    <>
      <ModuleHeader title="资产情况" />
      <section className="dsh-redteam-dashboard__card dsh-redteam-dashboard__card--wide">
        <div className="dsh-redteam-dashboard__card-heading">
          <h4 className="dsh-redteam-dashboard__card-title">资产概览</h4>
          <span className="dsh-redteam-dashboard__badge" data-kind="local">
            {state.assetMap === undefined
              ? '尚未采集'
              : `${String(state.assetMap.nodeCount)} 个资产`}
          </span>
        </div>
        <div className="dsh-redteam-dashboard__metrics dsh-redteam-dashboard__metrics--assets">
          {metrics.map((metric) => (
            <div className="dsh-redteam-dashboard__metric" key={metric.label}>
              <span className="dsh-redteam-dashboard__metric-value">
                {metric.value === undefined ? '—' : metric.value}
              </span>
              <span className="dsh-redteam-dashboard__metric-label">{metric.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="dsh-redteam-dashboard__card dsh-redteam-dashboard__card--wide">
        <div className="dsh-redteam-dashboard__card-heading">
          <h4 className="dsh-redteam-dashboard__card-title">资产详情</h4>
          <span className="dsh-redteam-dashboard__badge" data-kind="local">
            {state.assetMap === undefined
              ? '仅项目节点'
              : `${String(state.assetMap.nodeCount)} 个资产`}
          </span>
        </div>
        <AssetGraph
          assetMap={state.assetMap}
          findingCount={findingCount}
          findings={state.findings}
          projectName={projectName}
        />
      </section>
    </>
  )
}

function assetTestTargets(assetMap: AssetMapSummary | undefined): readonly AssetNodePreview[] {
  if (assetMap === undefined) return []
  const targets = new Map<string, AssetNodePreview>()
  for (const node of [assetMap.seed, ...assetMap.frontier]) {
    if (node !== undefined && !targets.has(node.id)) targets.set(node.id, node)
  }
  return [...targets.values()]
}

const ASSET_TYPE_LABELS: Readonly<Record<string, string>> = {
  asn: 'ASN',
  certificate: '证书',
  domain: '域名',
  infrastructure: '基础设施',
  ip: 'IP',
  network: '网段',
  organization: '组织架构',
  product: '产品服务',
  supplier: '供应商',
  technology: '开源组件',
  url: 'URL',
}

function scopeModeOptions(target: AssetNodePreview): readonly Choice[] {
  if (target.type === 'domain') {
    return [
      { id: 'asset', label: '仅当前域名' },
      { id: 'subdomains', label: '当前域名及全部子域名' },
    ]
  }
  if (target.type === 'ip') {
    return [
      { id: 'asset', label: '仅当前 IP' },
      { id: 'all-ports', label: '当前 IP 的全部端口' },
    ]
  }
  return [
    {
      id: 'asset',
      label: target.type === 'network' ? '整个网段' : '仅当前资产',
    },
  ]
}

function testingScopeDescriptions(rules: readonly TestingScopeRule[]): string[] {
  return rules.map((rule) => {
    const target: AssetNodePreview = {
      depth: 0,
      expanded: false,
      id: rule.targetId,
      label: rule.targetLabel,
      type: rule.targetType,
    }
    const mode = scopeModeOptions(target).find((candidate) => candidate.id === rule.mode)
    return `${rule.targetLabel}（${mode?.label ?? '仅当前资产'}）`
  })
}

function targetMatchesTestingScope(
  target: AssetNodePreview,
  rules: readonly TestingScopeRule[],
): boolean {
  return rules.some((rule) => {
    if (rule.targetId === target.id) return true
    return (
      rule.mode === 'subdomains' &&
      rule.targetType === 'domain' &&
      target.type === 'domain' &&
      target.label.toLocaleLowerCase().endsWith(`.${rule.targetLabel.toLocaleLowerCase()}`)
    )
  })
}

function assetsInTestingScope(
  targets: readonly AssetNodePreview[],
  rules: readonly TestingScopeRule[],
): AssetNodePreview[] {
  const selected = new Map(
    targets
      .filter((target) => targetMatchesTestingScope(target, rules))
      .map((target) => [target.id, target]),
  )
  for (const rule of rules) {
    if (!selected.has(rule.targetId)) {
      selected.set(rule.targetId, {
        depth: 0,
        expanded: false,
        id: rule.targetId,
        label: rule.targetLabel,
        type: rule.targetType,
      })
    }
  }
  return [...selected.values()]
}

function applicableAnalysisTypes(assets: readonly AssetNodePreview[]): Choice[] {
  const choices = new Map<string, Choice>()
  const include = (items: readonly Choice[]): void => {
    for (const item of items) choices.set(item.id, item)
  }
  for (const asset of assets) {
    const label = asset.label.toLocaleLowerCase()
    if (/\bredis\b|:6379\b/u.test(label)) {
      include(REDIS_ANALYSIS_TYPES)
      continue
    }
    let matched = false
    if (
      asset.type === 'domain' ||
      asset.type === 'url' ||
      asset.type === 'certificate' ||
      /\b(?:https?|web|nginx|apache|iis|tomcat|react|vue|angular|spring|django|flask|wordpress|portal|api|shop)\b/u.test(
        label,
      )
    ) {
      include(WEB_ANALYSIS_TYPES)
      matched = true
    }
    if (['asn', 'infrastructure', 'ip', 'network'].includes(asset.type)) {
      include(NETWORK_ANALYSIS_TYPES)
      matched = true
    }
    if (asset.type === 'product' || asset.type === 'technology') {
      include(COMPONENT_ANALYSIS_TYPES)
      matched = true
    }
    if (/\b(?:aws|azure|gcp|cloud|docker|container|kubernetes|k8s)\b/u.test(label)) {
      include(CLOUD_ANALYSIS_TYPES)
      matched = true
    }
    if (!matched) include(DEFAULT_ANALYSIS_TYPES)
  }
  return [...choices.values()]
}

function TestingScopePanel({
  busy,
  rules,
  setRules,
  targets,
  totalTargetCount,
}: {
  readonly busy: boolean
  readonly rules: readonly TestingScopeRule[]
  readonly setRules: (next: TestingScopeRule[]) => void
  readonly targets: readonly AssetNodePreview[]
  readonly totalTargetCount: number
}) {
  const [draftRules, setDraftRules] = useState<TestingScopeRule[]>([...rules])
  useEffect(() => setDraftRules([...rules]), [rules])
  const selectableTargets = [
    ...targets,
    ...draftRules.flatMap((rule) =>
      targets.some((target) => target.id === rule.targetId)
        ? []
        : [
            {
              depth: 0,
              expanded: false,
              id: rule.targetId,
              label: rule.targetLabel,
              type: rule.targetType,
            },
          ],
    ),
  ]
  const rulesByTarget = new Map(draftRules.map((rule) => [rule.targetId, rule]))
  const confirmedRulesByTarget = new Map(rules.map((rule) => [rule.targetId, rule]))
  const rangeConfirmed =
    draftRules.length === rules.length &&
    draftRules.every((draft) => {
      const confirmed = confirmedRulesByTarget.get(draft.targetId)
      return confirmed?.mode === draft.mode && confirmed.targetType === draft.targetType
    })
  const toggleTarget = (target: AssetNodePreview): void => {
    const current = rulesByTarget.get(target.id)
    setDraftRules(
      current === undefined
        ? [
            ...draftRules,
            {
              mode: 'asset',
              targetId: target.id,
              targetLabel: target.label,
              targetType: target.type,
            },
          ]
        : draftRules.filter((rule) => rule.targetId !== target.id),
    )
  }
  const updateMode = (targetId: string, mode: TestingScopeMode): void => {
    setDraftRules(draftRules.map((rule) => (rule.targetId === targetId ? { ...rule, mode } : rule)))
  }
  return (
    <section className="dsh-redteam-dashboard__card" data-project-panel="testing-scope">
      <div className="dsh-redteam-dashboard__card-heading">
        <h4 className="dsh-redteam-dashboard__card-title">目标范围</h4>
        <span className="dsh-redteam-dashboard__badge" data-kind="local">
          {totalTargetCount > targets.length
            ? `已选 ${String(draftRules.length)} · 展示 ${String(targets.length)} / ${String(totalTargetCount)}`
            : `已选 ${String(draftRules.length)} / ${String(selectableTargets.length)}`}
        </span>
      </div>
      <p className="dsh-redteam-dashboard__tool-description">
        只有勾选并确认的资产允许测试；全部允许模式也不能越过此范围。
      </p>
      {selectableTargets.length === 0 ? (
        <div className="dsh-redteam-dashboard__scope-empty">
          <IconSearchOutline16 size={20} />
          <p className="dsh-redteam-dashboard__empty">完成信息收集后选择授权目标。</p>
        </div>
      ) : (
        <div className="dsh-redteam-dashboard__scope-list" aria-label="目标范围资产">
          {selectableTargets.map((target) => {
            const rule = rulesByTarget.get(target.id)
            const options = scopeModeOptions(target)
            return (
              <article key={target.id} data-selected={rule !== undefined || undefined}>
                <input
                  aria-label={`将 ${target.label} 纳入目标范围`}
                  checked={rule !== undefined}
                  disabled={busy}
                  type="checkbox"
                  onChange={() => toggleTarget(target)}
                />
                <div>
                  <strong title={target.label}>{target.label}</strong>
                  <span>{ASSET_TYPE_LABELS[target.type] ?? target.type}</span>
                </div>
                <select
                  aria-label={`${target.label} 范围规则`}
                  disabled={busy || rule === undefined || options.length === 1}
                  value={rule?.mode ?? 'asset'}
                  onChange={(event) =>
                    updateMode(target.id, event.target.value as TestingScopeMode)
                  }
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </article>
            )
          })}
        </div>
      )}
      {totalTargetCount > targets.length && (
        <p className="dsh-redteam-dashboard__field-help">
          当前仅展示前 {targets.length} 个节点；域名和 IP 可用聚合规则确认整组范围。
        </p>
      )}
      {selectableTargets.length > 0 && (
        <div className="dsh-redteam-dashboard__button-row">
          <button
            className="dsh-redteam-dashboard__button"
            type="button"
            disabled={busy || draftRules.length === 0 || rangeConfirmed}
            onClick={() => setRules([...draftRules])}
          >
            确认范围
          </button>
          <button
            className="dsh-redteam-dashboard__button"
            type="button"
            disabled={busy || (draftRules.length === 0 && rules.length === 0)}
            onClick={() => {
              setDraftRules([])
              setRules([])
            }}
          >
            清空选择
          </button>
        </div>
      )}
    </section>
  )
}

function VulnerabilityAnalysisControls({
  assets,
  busy,
  run,
  testingScope,
}: {
  readonly assets: readonly AssetNodePreview[]
  readonly busy: boolean
  readonly run: (text: string) => void
  readonly testingScope: readonly string[]
}) {
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([])
  const analysisTypes = useMemo(() => applicableAnalysisTypes(assets), [assets])
  const analysisTypeIds = analysisTypes.map((type) => type.id).join('|')
  useEffect(() => {
    const applicableIds = new Set(analysisTypes.map((type) => type.id))
    setSelectedTypeIds((current) => current.filter((id) => applicableIds.has(id)))
  }, [analysisTypeIds])
  const selectedTypes = analysisTypes.filter((type) => selectedTypeIds.includes(type.id))
  return (
    <section className="dsh-redteam-dashboard__card" data-project-action="vulnerability-analysis">
      <div className="dsh-redteam-dashboard__card-heading">
        <h4 className="dsh-redteam-dashboard__card-title">漏洞扫描</h4>
        <span className="dsh-redteam-dashboard__badge" data-kind="local">
          {testingScope.length === 0
            ? '待确认范围'
            : `${String(assets.length)} 个资产 · ${String(analysisTypes.length)} 类`}
        </span>
      </div>
      <div aria-label="漏洞扫描类型" role="group">
        <ChoiceGrid
          choices={analysisTypes}
          disabled={busy || testingScope.length === 0}
          selected={selectedTypeIds}
          setSelected={setSelectedTypeIds}
        />
      </div>
      <div className="dsh-redteam-dashboard__button-row">
        <button
          className="dsh-redteam-dashboard__button"
          type="button"
          disabled={busy || selectedTypes.length === 0 || testingScope.length === 0}
          onClick={() => {
            if (selectedTypes.length > 0) {
              run(
                vulnerabilityAnalysisPrompt(
                  selectedTypes.map((type) => type.label),
                  testingScope,
                  assets,
                ),
              )
            }
          }}
        >
          开始扫描
        </button>
      </div>
    </section>
  )
}

function VulnerabilityValidationControls({
  busy,
  operationMode,
  run,
  state,
  testingScope,
}: {
  readonly busy: boolean
  readonly operationMode: OperationMode
  readonly run: (text: string) => void
  readonly state: DashboardState
  readonly testingScope: readonly string[]
}) {
  const [selectedFindingId, setSelectedFindingId] = useState('')
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([])
  const verifiedFindings = state.findings.filter((finding) => finding.status === 'confirmed')
  const selectedFinding = verifiedFindings.find((finding) => finding.id === selectedFindingId)
  const exploitationTypes =
    selectedFinding === undefined ? [] : exploitationTypesForFinding(selectedFinding)
  const selectedTypes = exploitationTypes.filter((type) => selectedTypeIds.includes(type.id))
  useEffect(() => setSelectedTypeIds([]), [selectedFindingId])
  return (
    <section className="dsh-redteam-dashboard__card" data-project-action="vulnerability-validation">
      <h4 className="dsh-redteam-dashboard__card-title">漏洞验证</h4>
      {verifiedFindings.length === 0 ? (
        <p className="dsh-redteam-dashboard__empty">暂无可验证漏洞</p>
      ) : (
        <>
          <select
            aria-label="漏洞选择"
            className="dsh-redteam-dashboard__select"
            disabled={busy}
            value={selectedFindingId}
            onChange={(event) => setSelectedFindingId(event.target.value)}
          >
            <option value="">选择已验证漏洞</option>
            {verifiedFindings.map((finding) => (
              <option key={finding.id} value={finding.id}>
                {finding.title} · {finding.severity}
              </option>
            ))}
          </select>
          {selectedFinding !== undefined && (
            <>
              {exploitationTypes.length === 0 ? (
                <p className="dsh-redteam-dashboard__empty">暂无适配验证项</p>
              ) : (
                <div aria-label="漏洞验证类型" role="group">
                  <ChoiceGrid
                    choices={exploitationTypes}
                    disabled={busy || testingScope.length === 0}
                    selected={selectedTypeIds}
                    setSelected={setSelectedTypeIds}
                  />
                </div>
              )}
              {exploitationTypes.length > 0 && (
                <div className="dsh-redteam-dashboard__button-row">
                  <button
                    className="dsh-redteam-dashboard__button"
                    type="button"
                    disabled={
                      busy ||
                      selectedTypes.length === 0 ||
                      testingScope.length === 0 ||
                      (operationMode !== 'exploitation' && operationMode !== 'full')
                    }
                    title={
                      operationMode === 'exploitation' || operationMode === 'full'
                        ? undefined
                        : '请先切换到漏洞验证或全部允许模式'
                    }
                    onClick={() => {
                      if (selectedTypes.length > 0) {
                        run(
                          vulnerabilityValidationPrompt(
                            selectedFinding,
                            selectedTypes.map((type) => type.label),
                            testingScope,
                          ),
                        )
                      }
                    }}
                  >
                    开始验证
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

function ResultExportControls({
  busy,
  run,
  state,
}: {
  readonly busy: boolean
  readonly run: (text: string) => void
  readonly state: DashboardState
}) {
  const [format, setFormat] = useState<ReportFormat>('word')
  const [template, setTemplate] = useState<ReportTemplate>('project')
  return (
    <div
      aria-label="结果导出"
      className="dsh-redteam-dashboard__project-export"
      data-project-action="report-export"
      role="group"
    >
      <h5 className="dsh-redteam-dashboard__subheading">结果导出</h5>
      <div className="dsh-redteam-dashboard__export-controls">
        <select
          aria-label="报告类型"
          className="dsh-redteam-dashboard__select"
          value={template}
          onChange={(event) => setTemplate(event.target.value as ReportTemplate)}
        >
          <option value="asset">资产数据</option>
          <option value="vulnerability">漏洞详情</option>
          <option value="project">项目报告</option>
        </select>
        <select
          aria-label="导出格式"
          className="dsh-redteam-dashboard__select"
          value={format}
          onChange={(event) => setFormat(event.target.value as ReportFormat)}
        >
          <option value="word">Word 文档</option>
          <option value="markdown">MD</option>
          <option value="html">HTML</option>
        </select>
        <button
          className="dsh-redteam-dashboard__button"
          type="button"
          disabled={busy || state.scan === undefined}
          onClick={() => run(reportExportPrompt(format, template))}
        >
          导出报告
        </button>
      </div>
      {state.report !== undefined && (
        <div className="dsh-redteam-dashboard__workspace" title={state.report.path}>
          最近导出：{state.report.format.toUpperCase()} · {state.report.path}
        </div>
      )}
    </div>
  )
}

function ToolIntegrationControls({
  busy,
  enabledToolIds,
  mcpTools,
  setEnabledToolIds,
  setMcpTools,
  snapshot,
  toolAvailability,
}: {
  readonly busy: boolean
  readonly enabledToolIds: readonly string[]
  readonly mcpTools: readonly SecurityToolChoice[]
  readonly setEnabledToolIds: (next: string[]) => void
  readonly setMcpTools: (next: SecurityToolChoice[]) => void
  readonly snapshot: DashboardConversationSnapshot | undefined
  readonly toolAvailability: Readonly<Record<string, boolean>>
}) {
  const [mcpName, setMcpName] = useState('')
  const [mcpEndpoint, setMcpEndpoint] = useState('')
  const [mcpTransport, setMcpTransport] = useState<McpTransport>('http')
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([...enabledToolIds])
  const tools = [...BUILT_IN_SECURITY_TOOLS, ...mcpTools]
  const activity = useMemo(() => recentToolActivity(snapshot), [snapshot])
  const selectionChanged =
    selectedToolIds.length !== enabledToolIds.length ||
    selectedToolIds.some((id) => !enabledToolIds.includes(id))

  useEffect(() => {
    setSelectedToolIds([...enabledToolIds])
  }, [enabledToolIds])

  const addMcpTool = (): void => {
    const label = mcpName.trim()
    const endpoint = mcpEndpoint.trim()
    if (label === '' || endpoint === '') return
    const normalized = label.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')
    const id = `mcp-${normalized || String(mcpTools.length + 1)}`
    if (
      tools.some(
        (tool) => tool.id === id || tool.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
      )
    ) {
      setMcpName('')
      return
    }
    setMcpTools([
      ...mcpTools,
      {
        category: '扩展工具',
        endpoint,
        id,
        label,
        source: 'mcp',
        transport: mcpTransport,
      },
    ])
    setMcpName('')
    setMcpEndpoint('')
    setMcpTransport('http')
  }
  return (
    <>
      <section className="dsh-redteam-dashboard__card dsh-redteam-dashboard__tool-integration">
        <div className="dsh-redteam-dashboard__card-heading">
          <h4 className="dsh-redteam-dashboard__card-title">工具集成</h4>
          <span className="dsh-redteam-dashboard__badge" data-kind="local">
            已开启 {enabledToolIds.length}
          </span>
        </div>
        <p className="dsh-redteam-dashboard__tool-description">
          勾选需要使用的安全工具，再点“确认选择”；未确认的工具会在服务端拒绝执行。
        </p>
        <div data-tool-section="configuration">
          <h5 className="dsh-redteam-dashboard__subheading">可用工具</h5>
          <div className="dsh-redteam-dashboard__tool-grid">
            {tools.map((tool) => {
              const checked = selectedToolIds.includes(tool.id)
              const missing = tool.source === 'built-in' && toolAvailability[tool.id] === false
              return (
                <label
                  className="dsh-redteam-dashboard__tool-choice"
                  data-selected={checked || undefined}
                  key={tool.id}
                >
                  <input
                    checked={checked}
                    disabled={busy}
                    type="checkbox"
                    onChange={() =>
                      setSelectedToolIds(
                        checked
                          ? selectedToolIds.filter((id) => id !== tool.id)
                          : [...selectedToolIds, tool.id],
                      )
                    }
                  />
                  <span>
                    <strong>{tool.label}</strong>
                    <small>
                      {tool.source === 'mcp'
                        ? `MCP · ${tool.transport?.toUpperCase() ?? '扩展工具'}`
                        : `内置 · ${tool.category}`}
                    </small>
                    {tool.source === 'mcp' && tool.endpoint !== undefined && (
                      <small title={tool.endpoint}>{tool.endpoint}</small>
                    )}
                    {missing && (
                      <small className="dsh-redteam-dashboard__tool-installation-warning">
                        工具未安装
                      </small>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
          <div className="dsh-redteam-dashboard__tool-selection-actions">
            <span>已选择 {selectedToolIds.length} 个工具</span>
            <button
              className="dsh-redteam-dashboard__button"
              disabled={busy || !selectionChanged}
              type="button"
              onClick={() => setEnabledToolIds([...selectedToolIds])}
            >
              确认选择
            </button>
          </div>
          <section className="dsh-redteam-dashboard__add-tool-panel">
            <h5 className="dsh-redteam-dashboard__subheading">添加工具</h5>
            <p className="dsh-redteam-dashboard__tool-description">
              接入新的 MCP 工具后，可在上方勾选并确认启用。
            </p>
            <form
              aria-label="添加工具"
              className="dsh-redteam-dashboard__mcp-tool-form"
              onSubmit={(event) => {
                event.preventDefault()
                addMcpTool()
              }}
            >
              <label className="dsh-redteam-dashboard__mcp-tool-field">
                <span>工具名称</span>
                <input
                  aria-label="工具名称"
                  className="dsh-redteam-dashboard__input"
                  placeholder="添加后的工具名称"
                  value={mcpName}
                  onChange={(event) => setMcpName(event.target.value)}
                />
              </label>
              <label className="dsh-redteam-dashboard__mcp-tool-field">
                <span>接口地址</span>
                <input
                  aria-label="接口地址"
                  className="dsh-redteam-dashboard__input"
                  placeholder={mcpTransport === 'stdio' ? '输入启动命令' : '输入 MCP 接口地址'}
                  value={mcpEndpoint}
                  onChange={(event) => setMcpEndpoint(event.target.value)}
                />
              </label>
              <label className="dsh-redteam-dashboard__mcp-tool-field">
                <span>MCP协议</span>
                <select
                  aria-label="MCP协议"
                  className="dsh-redteam-dashboard__select"
                  value={mcpTransport}
                  onChange={(event) => setMcpTransport(event.target.value as McpTransport)}
                >
                  {MCP_TRANSPORTS.map((transport) => (
                    <option key={transport.id} value={transport.id}>
                      {transport.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="dsh-redteam-dashboard__button"
                type="submit"
                disabled={busy || mcpName.trim() === '' || mcpEndpoint.trim() === ''}
              >
                添加工具
              </button>
            </form>
          </section>
        </div>
      </section>
      <section
        aria-label="执行详情"
        className="dsh-redteam-dashboard__card dsh-redteam-dashboard__tool-execution-details"
        data-tool-section="results"
      >
        <h4 className="dsh-redteam-dashboard__card-title">执行详情</h4>
        <div className="dsh-redteam-dashboard__tool-result-log">
          {activity.length === 0 ? (
            <p className="dsh-redteam-dashboard__empty">暂无工具执行结果。</p>
          ) : (
            activity.map((item) => (
              <article
                className="dsh-redteam-dashboard__tool-result"
                data-status={item.status}
                key={item.key}
              >
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.status === 'running'
                      ? '执行中'
                      : item.status === 'error'
                        ? '失败'
                        : '完成'}
                  </span>
                </div>
                <p>{item.detail}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  )
}

function VulnerabilitySummaryModule({ state }: { readonly state: DashboardState }) {
  const counts = severityCounts(state)
  const total = state.findingsTotal ?? state.scan?.findingCount ?? state.findings.length
  const highPriority = counts.critical + counts.high
  return (
    <>
      <ModuleHeader title="漏洞汇总" />
      <div className="dsh-redteam-dashboard__vulnerability-layout">
        <section className="dsh-redteam-dashboard__card">
          <div className="dsh-redteam-dashboard__card-heading">
            <h4 className="dsh-redteam-dashboard__card-title">漏洞概览</h4>
            <span className="dsh-redteam-dashboard__badge" data-kind="local">
              {total} 条
            </span>
          </div>
          <div className="dsh-redteam-dashboard__vulnerability-overview">
            <div className="dsh-redteam-dashboard__vulnerability-total">
              <span>漏洞总数</span>
              <strong>{total}</strong>
              <small>{total === 0 ? '当前未发现漏洞' : '需要进一步处置'}</small>
              <p>
                {total === 0
                  ? '完成漏洞扫描后，这里会汇总已识别漏洞。'
                  : `已载入 ${String(total)} 条漏洞，其中 ${String(highPriority)} 条为高优先级；详细证据按条目显示在下方。`}
              </p>
            </div>
            <div className="dsh-redteam-dashboard__severity-summary">
              {(['critical', 'high', 'medium', 'low'] as const).map((severity) => (
                <div key={severity} data-severity={severity}>
                  <strong>{counts[severity]}</strong>
                  <span>{severity}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="dsh-redteam-dashboard__card">
          <div className="dsh-redteam-dashboard__card-heading">
            <h4 className="dsh-redteam-dashboard__card-title">漏洞详情</h4>
            <span className="dsh-redteam-dashboard__badge" data-kind="local">
              {state.findings.length} 条
            </span>
          </div>
          {state.findings.length === 0 ? (
            <div className="dsh-redteam-dashboard__vulnerability-empty">
              <IconWarningOutline16 size={22} />
              <p className="dsh-redteam-dashboard__empty">暂无漏洞详情。</p>
            </div>
          ) : (
            <div className="dsh-redteam-dashboard__finding-list">
              {state.findings.map((finding) => (
                <article className="dsh-redteam-dashboard__finding" key={finding.id}>
                  <div className="dsh-redteam-dashboard__finding-head">
                    <span
                      className="dsh-redteam-dashboard__severity"
                      data-severity={finding.severity}
                    >
                      {finding.severity}
                    </span>
                    <strong className="dsh-redteam-dashboard__finding-title">
                      {finding.title}
                    </strong>
                  </div>
                  <div className="dsh-redteam-dashboard__finding-location">{finding.location}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

export function Dashboard({ runtime, useSessions }: DashboardProps) {
  const sessionId = useSessions((state) => state.current)
  const summary = useSessions((state) =>
    state.current === undefined ? undefined : state.byId[state.current],
  )
  const active = isRedteamSession(summary)
  const conversation = useMemo(
    () => (sessionId === undefined ? undefined : runtime.conversation(sessionId)),
    [runtime, sessionId],
  )
  const snapshot = useConversation(conversation)
  const state = useMemo(() => deriveDashboardState(snapshot), [snapshot])
  const [module, setModule] = useState<ModuleId>('project')
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [operationMode, setOperationMode] = useState<OperationMode>('passive')
  const [fullModeDialogOpen, setFullModeDialogOpen] = useState(false)
  const [enabledToolIds, setEnabledToolIds] = useState<string[]>([])
  const [mcpTools, setMcpTools] = useState<SecurityToolChoice[]>([])
  const [modelBusy, setModelBusy] = useState(false)
  const [modelCurrent, setModelCurrent] = useState<DashboardModelSelection>()
  const [modelOptions, setModelOptions] = useState<readonly DashboardModelOption[]>([])
  const [policyBusy, setPolicyBusy] = useState(false)
  const [testingScope, setTestingScope] = useState<TestingScopeRule[]>([])
  const [toolAvailability, setToolAvailability] = useState<Readonly<Record<string, boolean>>>({})
  const [notice, setNotice] = useState<{ error: boolean; text: string } | undefined>()
  const bodyRef = useRef<HTMLDivElement>(null)

  const showModule = (nextModule: ModuleId): void => {
    setModule(nextModule)
    if (bodyRef.current !== null) bodyRef.current.scrollTop = 0
  }

  useEffect(() => {
    if (active) setOpen(true)
  }, [active, sessionId])

  useEffect(() => {
    setEnabledToolIds([])
    setFullModeDialogOpen(false)
    setMcpTools([])
    setModelCurrent(undefined)
    setModelOptions([])
    setOperationMode('passive')
    setTestingScope([])
    setToolAvailability({})
  }, [sessionId])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    void runtime
      .toolAvailability()
      .then((result) => {
        if (cancelled || !result.ok) return
        setToolAvailability(
          Object.fromEntries(result.tools.map((tool) => [tool.id, tool.installed])),
        )
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [active, runtime, sessionId])

  useEffect(() => {
    if (!active || sessionId === undefined) return
    let cancelled = false
    setPolicyBusy(true)
    void runtime
      .executionPolicy(sessionId)
      .then((result) => {
        if (cancelled) return
        if (!result.ok || result.policy === undefined) {
          setNotice({ error: true, text: result.error ?? '执行权限加载失败。' })
          return
        }
        setEnabledToolIds([...result.policy.enabledToolIds])
        setOperationMode(result.policy.operationMode)
        setTestingScope([...result.policy.testingScope])
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice({ error: true, text: error instanceof Error ? error.message : String(error) })
        }
      })
      .finally(() => {
        if (!cancelled) setPolicyBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, runtime, sessionId])

  useEffect(() => {
    if (!active || sessionId === undefined) return
    let cancelled = false
    setModelBusy(true)
    void runtime
      .models(sessionId)
      .then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setNotice({ error: true, text: result.error ?? '模型列表加载失败。' })
          return
        }
        const models = [...result.models]
        if (
          result.current !== undefined &&
          !models.some(
            (model) =>
              model.provider === result.current?.provider && model.model === result.current.model,
          )
        ) {
          models.unshift({
            ...result.current,
            name: result.current.model,
            providerName: result.current.provider,
          })
        }
        setModelCurrent(result.current)
        setModelOptions(models)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice({ error: true, text: error instanceof Error ? error.message : String(error) })
        }
      })
      .finally(() => {
        if (!cancelled) setModelBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, runtime, sessionId])

  useEffect(() => {
    if (!active) return
    const overlay = document.querySelector<HTMLElement>('[data-shell-overlay]')
    const frame = overlay?.parentElement ?? null
    const nativeSidebar = frame?.firstElementChild
    const syncNativeSidebarWidth = (): void => {
      if (!(nativeSidebar instanceof HTMLElement) || frame === null) return
      const width = nativeSidebar.getBoundingClientRect().width
      if (width > 0) frame.style.setProperty('--dsh-redteam-native-sidebar-width', `${width}px`)
    }
    document.body.dataset.dshRedteamDashboard = open ? 'fullscreen' : 'collapsed'
    if (open) runtime.closeNativeDetails()
    if (frame !== null) {
      frame.dataset.dshRedteamSidebar = open ? 'fullscreen' : 'collapsed'
    }
    syncNativeSidebarWidth()
    const observer =
      nativeSidebar instanceof HTMLElement && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(syncNativeSidebarWidth)
        : undefined
    if (nativeSidebar instanceof HTMLElement) observer?.observe(nativeSidebar)
    return () => {
      delete document.body.dataset.dshRedteamDashboard
      observer?.disconnect()
      if (frame !== null) {
        delete frame.dataset.dshRedteamSidebar
        frame.style.removeProperty('--dsh-redteam-native-sidebar-width')
      }
    }
  }, [active, open, runtime])

  const run = useCallback(
    (text: string) => {
      if (sessionId === undefined || busy) return
      setBusy(true)
      setNotice(undefined)
      void runtime
        .prompt(sessionId, text)
        .then((result) => {
          setNotice(
            result.ok
              ? { error: false, text: '任务已加入当前棱镜会话。' }
              : { error: true, text: result.error ?? '任务提交失败。' },
          )
        })
        .catch((error: unknown) => {
          setNotice({ error: true, text: error instanceof Error ? error.message : String(error) })
        })
        .finally(() => setBusy(false))
    },
    [busy, runtime, sessionId],
  )

  const loadOlder = useCallback((): void => {
    if (sessionId === undefined || snapshot?.loadingOlder === true) return
    void runtime.loadOlder(sessionId).catch((error: unknown) => {
      setNotice({
        error: true,
        text: error instanceof Error ? error.message : '加载更早对话失败。',
      })
    })
  }, [runtime, sessionId, snapshot?.loadingOlder])

  const selectModel = useCallback(
    (selection: DashboardModelSelection): void => {
      if (sessionId === undefined || modelBusy) return
      setModelBusy(true)
      setNotice(undefined)
      void runtime
        .selectModel(sessionId, selection)
        .then((result) => {
          if (result.ok) {
            setModelCurrent(selection)
            setNotice({ error: false, text: '模型已切换。' })
          } else {
            setNotice({ error: true, text: result.error ?? '模型切换失败。' })
          }
        })
        .catch((error: unknown) => {
          setNotice({ error: true, text: error instanceof Error ? error.message : String(error) })
        })
        .finally(() => setModelBusy(false))
    },
    [modelBusy, runtime, sessionId],
  )

  const updatePolicy = useCallback(
    (
      next: Partial<DashboardExecutionPolicy>,
      successText: string,
      afterSuccess?: () => void,
    ): void => {
      if (sessionId === undefined || policyBusy) return
      const requested: DashboardExecutionPolicy = {
        enabledToolIds: next.enabledToolIds ?? enabledToolIds,
        operationMode: next.operationMode ?? operationMode,
        testingScope: next.testingScope ?? testingScope,
      }
      setPolicyBusy(true)
      setNotice(undefined)
      void runtime
        .updateExecutionPolicy(sessionId, requested)
        .then((result) => {
          if (!result.ok) {
            setNotice({ error: true, text: result.error ?? '执行权限更新失败。' })
            return
          }
          const applied = result.policy ?? requested
          setEnabledToolIds([...applied.enabledToolIds])
          setOperationMode(applied.operationMode)
          setTestingScope([...applied.testingScope])
          setNotice({ error: false, text: successText })
          afterSuccess?.()
        })
        .catch((error: unknown) => {
          setNotice({ error: true, text: error instanceof Error ? error.message : String(error) })
        })
        .finally(() => setPolicyBusy(false))
    },
    [enabledToolIds, operationMode, policyBusy, runtime, sessionId, testingScope],
  )

  if (!active) return null
  if (!open) {
    return (
      <aside
        className="dsh-redteam-dashboard__rail"
        aria-label="棱镜快捷栏"
        data-redteam-dashboard-rail
      >
        <div className="dsh-redteam-dashboard__rail-header">
          <Tooltip label="全屏展开棱镜看板" side="right" delayMs={300}>
            <button
              className="dsh-redteam-dashboard__rail-mark"
              type="button"
              onClick={() => setOpen(true)}
              aria-label="全屏展开棱镜看板"
            >
              <IconAgentPresetOutline16 size={20} />
            </button>
          </Tooltip>
        </div>
        <nav className="dsh-redteam-dashboard__rail-nav" aria-label="棱镜模块快捷入口">
          {MODULES.map((item) => (
            <Tooltip key={item.id} label={item.label} side="right" delayMs={300}>
              <button
                className="dsh-redteam-dashboard__rail-button"
                type="button"
                aria-label={item.label}
                aria-current={module === item.id ? 'page' : undefined}
                onClick={() => {
                  setModule(item.id)
                  setOpen(true)
                }}
              >
                <ModuleIcon name={item.id} size={20} />
              </button>
            </Tooltip>
          ))}
        </nav>
      </aside>
    )
  }

  return (
    <aside
      className="dsh-redteam-dashboard"
      aria-label="棱镜看板"
      data-fullscreen="true"
      data-redteam-dashboard
    >
      <header className="dsh-redteam-dashboard__header">
        <span className="dsh-redteam-dashboard__mark">
          <IconAgentPresetOutline16 size={19} />
        </span>
        <div className="dsh-redteam-dashboard__heading">
          <h2 className="dsh-redteam-dashboard__title">棱镜</h2>
          <span className="dsh-redteam-dashboard__brand-badge">PRISM</span>
        </div>
        <label
          className="dsh-redteam-dashboard__mode-control"
          data-risk={operationMode === 'full' || undefined}
        >
          <span>模式</span>
          <select
            aria-label="棱镜模式"
            disabled={policyBusy}
            value={operationMode}
            onChange={(event) => {
              const nextMode = event.target.value as OperationMode
              if (nextMode === 'full') {
                setFullModeDialogOpen(true)
              } else {
                setFullModeDialogOpen(false)
                updatePolicy({ operationMode: nextMode }, '执行权限模式已更新。')
              }
            }}
          >
            {OPERATION_MODES.map((item) => (
              <option key={item.id} value={item.id} data-risk={item.id === 'full' || undefined}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden="true" className="dsh-redteam-dashboard__header-spacer" />
        <Tooltip label="收起为图标栏" side="bottom" delayMs={300}>
          <button
            className="dsh-redteam-dashboard__icon-button"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="收起为图标栏"
          >
            <IconPanelLeftOutline16 size={18} />
          </button>
        </Tooltip>
      </header>
      <nav
        className="dsh-redteam-dashboard__tabs"
        aria-label="棱镜模块"
        role="tablist"
        aria-orientation="horizontal"
      >
        {MODULES.map((item) => (
          <button
            key={item.id}
            className="dsh-redteam-dashboard__tab"
            type="button"
            role="tab"
            aria-selected={module === item.id}
            onClick={() => showModule(item.id)}
          >
            <ModuleIcon name={item.id} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div ref={bodyRef} className="dsh-redteam-dashboard__body" role="tabpanel">
        {module === 'project' && (
          <ProjectModule
            busy={busy || policyBusy}
            cwd={summary?.cwd}
            loadOlder={loadOlder}
            modelBusy={modelBusy}
            modelCurrent={modelCurrent}
            modelOptions={modelOptions}
            operationMode={operationMode}
            run={run}
            selectModel={selectModel}
            setTestingScope={(next) =>
              updatePolicy({ testingScope: next }, '目标范围已确认并应用。')
            }
            snapshot={snapshot}
            state={state}
            testingScope={testingScope}
          />
        )}
        {module === 'discovery' && (
          <AssetOverviewModule
            projectName={state.project?.currentProjectName ?? '当前项目'}
            state={state}
          />
        )}
        {module === 'testing' && <VulnerabilitySummaryModule state={state} />}
        {module === 'tools' && (
          <ToolIntegrationControls
            busy={policyBusy}
            enabledToolIds={enabledToolIds}
            mcpTools={mcpTools}
            setEnabledToolIds={(next) => updatePolicy({ enabledToolIds: next }, '可用工具已更新。')}
            setMcpTools={setMcpTools}
            snapshot={snapshot}
            toolAvailability={toolAvailability}
          />
        )}
      </div>
      {fullModeDialogOpen && (
        <div className="dsh-redteam-dashboard__risk-dialog-backdrop">
          <section
            aria-describedby="dsh-redteam-full-mode-description"
            aria-labelledby="dsh-redteam-full-mode-title"
            aria-modal="true"
            className="dsh-redteam-dashboard__risk-dialog"
            role="dialog"
          >
            <span className="dsh-redteam-dashboard__risk-dialog-icon">
              <IconWarningOutline16 size={22} />
            </span>
            <h3 id="dsh-redteam-full-mode-title">启用全部允许模式？</h3>
            <p id="dsh-redteam-full-mode-description">
              此模式会放开主动扫描和漏洞验证入口。所有操作仍必须处于已确认的授权范围内，并继续受服务端权限、沙箱和审批限制。
            </p>
            <div className="dsh-redteam-dashboard__risk-dialog-actions">
              <button
                className="dsh-redteam-dashboard__button"
                type="button"
                onClick={() => setFullModeDialogOpen(false)}
              >
                取消
              </button>
              <button
                className="dsh-redteam-dashboard__button dsh-redteam-dashboard__button--danger"
                disabled={policyBusy}
                type="button"
                onClick={() => {
                  updatePolicy({ operationMode: 'full' }, '已启用全部允许模式。', () =>
                    setFullModeDialogOpen(false),
                  )
                }}
              >
                确认全部允许
              </button>
            </div>
          </section>
        </div>
      )}
      {notice !== undefined && (
        <div
          className="dsh-redteam-dashboard__notice"
          data-error={notice.error || undefined}
          role="status"
        >
          {notice.text}
        </div>
      )}
    </aside>
  )
}
