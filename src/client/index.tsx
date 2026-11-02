import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  Dashboard,
  type DashboardProps,
  type DashboardExecutionPolicy,
  type DashboardModelSelection,
  type DashboardRuntime,
  type DashboardToolAvailability,
  type OperationMode,
  type TestingScopeRule,
} from './Dashboard.js'
import type {
  DashboardConversationSnapshot,
  DashboardConversationSource,
  ObservableSnapshot,
  SessionFaceLike,
  SessionId,
  SessionListStateLike,
} from './runtime-contract.js'
import { projectLoadPrompt, projectStartPrompt } from './prompts.js'
import { DASHBOARD_STYLES } from './styles.js'

export const inject = [
  'slots',
  'sessions',
  'workspaces',
  'layout',
  'connection',
  'remote',
  'remote.agentPresets',
  'remote.session',
  'uiConversation',
  'uiWorkspace',
]

type RemoteResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly error: { readonly message: string }; readonly ok: false }

interface SessionBindingLike {
  readonly session: SessionFaceLike
  readonly sessionId?: SessionId
}

interface SessionsLike {
  readonly list?: ObservableSnapshot<SessionListStateLike>
  binding(sessionId: SessionId): SessionBindingLike | undefined
  create(input: { readonly workspaceId: string }): Promise<SessionId>
  open(sessionId: SessionId): void
}

interface WorkspacesLike {
  create(input: { readonly path: string }): Promise<{ readonly workspaceId: string }>
}

interface LatestChatTarget {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
}

interface LatestUiConversation {
  binding(binding: SessionBindingLike): {
    target(name: 'chat'): LatestChatTarget
  }
}

interface LatestRemote {
  readonly agentPresets: {
    select(sessionId: SessionId, agentPreset: string): Promise<RemoteResult<string>>
  }
  readonly session: {
    modelCatalog(): Promise<
      RemoteResult<{
        readonly default: DashboardModelSelection
        readonly groups: readonly {
          readonly id: string
          readonly models: readonly { readonly id: string; readonly name: string }[]
          readonly name: string
        }[]
        readonly routableProviders: readonly string[]
      }>
    >
    selectModel(payload: {
      readonly model: string
      readonly provider: string
      readonly sessionId: SessionId
    }): Promise<RemoteResult<{ readonly selected: DashboardModelSelection }>>
  }
}

interface SlotsLike {
  inject(name: string, callback: () => unknown): unknown
  register(definition: Readonly<Record<string, unknown>>, component: unknown): () => void
}

type RedteamClientContext = Omit<
  Context,
  | 'connection'
  | 'layout'
  | 'remote'
  | 'sessions'
  | 'slots'
  | 'uiConversation'
  | 'uiWorkspace'
  | 'workspaces'
> & {
  readonly connection: RedteamConnection
  readonly layout: { closeDetails(): void }
  readonly remote: LatestRemote
  readonly sessions: SessionsLike
  readonly slots: SlotsLike
  readonly uiConversation: LatestUiConversation
  readonly uiWorkspace: { pickDirectory(): Promise<string | null> }
  readonly workspaces: WorkspacesLike
}

interface RedteamConnection {
  readonly rpc: {
    call(
      channel: string,
      endpoint: string,
      payload: unknown,
      signal?: AbortSignal,
    ): Promise<
      | { readonly ok: true; readonly value: unknown }
      | { readonly error: { readonly message: string }; readonly ok: false }
    >
  }
}

type ProjectSessionResult = { error?: string; ok: boolean }

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Readonly<Record<string, unknown>>
}

function executionPolicy(value: unknown): DashboardExecutionPolicy | undefined {
  const policy = record(value)
  if (
    policy === undefined ||
    !Array.isArray(policy.enabledToolIds) ||
    policy.enabledToolIds.some((id) => typeof id !== 'string') ||
    !['passive', 'active-scan', 'exploitation', 'full'].includes(policy.operationMode as string) ||
    !Array.isArray(policy.testingScope)
  ) {
    return undefined
  }
  const testingScope: TestingScopeRule[] = []
  for (const value of policy.testingScope) {
    const rule = record(value)
    if (
      rule === undefined ||
      !['asset', 'subdomains', 'all-ports'].includes(rule.mode as string) ||
      typeof rule.targetId !== 'string' ||
      typeof rule.targetLabel !== 'string' ||
      typeof rule.targetType !== 'string'
    ) {
      return undefined
    }
    testingScope.push({
      mode: rule.mode as TestingScopeRule['mode'],
      targetId: rule.targetId,
      targetLabel: rule.targetLabel,
      targetType: rule.targetType,
    })
  }
  return {
    enabledToolIds: [...(policy.enabledToolIds as string[])],
    operationMode: policy.operationMode as OperationMode,
    testingScope,
  }
}

function toolAvailability(value: unknown): readonly DashboardToolAvailability[] | undefined {
  const response = record(value)
  if (!Array.isArray(response?.tools)) return undefined
  const tools: DashboardToolAvailability[] = []
  for (const value of response.tools) {
    const tool = record(value)
    if (tool === undefined || typeof tool.id !== 'string' || typeof tool.installed !== 'boolean') {
      return undefined
    }
    tools.push({ id: tool.id, installed: tool.installed })
  }
  return tools
}

async function openFreshRedteamSession(
  ctx: RedteamClientContext,
  path: string,
): Promise<{ sessionId: SessionId; session: SessionFaceLike }> {
  const workspace = await ctx.workspaces.create({ path })
  const sessions = ctx.sessions
  const sessionId = await sessions.create({ workspaceId: workspace.workspaceId })
  const selected = await ctx.remote.agentPresets.select(sessionId, 'redteam')
  if (!selected.ok) throw new Error(selected.error.message)
  const session = sessions.binding(sessionId)?.session
  if (session === undefined) throw new Error('新会话已创建，但暂时无法连接。')
  sessions.open(sessionId)
  return { session, sessionId }
}

async function promptFreshRedteamSession(
  ctx: RedteamClientContext,
  path: string,
  prompt: string,
): Promise<ProjectSessionResult> {
  try {
    const { session } = await openFreshRedteamSession(ctx, path)
    const result = await session.prompt([{ type: 'text', text: prompt }], 'queue')
    return result.ok ? { ok: true } : { error: result.error.message, ok: false }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false }
  }
}

function object(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined
}

function normalizeConversation(
  value: unknown,
  lifecycle?: unknown,
): DashboardConversationSnapshot | undefined {
  const source = object(value)
  const state = object(lifecycle)
  const legacy = object(source?.legacy)
  const nodes = Array.isArray(legacy?.nodes) ? legacy.nodes : undefined
  if (nodes === undefined) return undefined
  const runningCalls = Array.isArray(legacy?.runningCalls) ? legacy.runningCalls : []
  const partial = legacy?.partial
  return {
    hasMore: state?.hasMore === true,
    loadingOlder: state?.loadingOlder === true,
    nodes: nodes as DashboardConversationSnapshot['nodes'],
    partial:
      partial === null || partial === undefined
        ? null
        : (partial as DashboardConversationSnapshot['partial']),
    running: state?.running === true,
    runningCalls: runningCalls as DashboardConversationSnapshot['runningCalls'],
  }
}

function conversationSource(
  ctx: RedteamClientContext,
  sessionId: SessionId,
): DashboardConversationSource | undefined {
  const binding = ctx.sessions.binding(sessionId)
  if (binding === undefined) return undefined
  const session = binding.session
  const target = ctx.uiConversation.binding(binding).target('chat')
  let lastLifecycle: unknown
  let lastChat: unknown
  let lastValue: DashboardConversationSnapshot | undefined
  return {
    getSnapshot: () => {
      const lifecycle = session.getSnapshot()
      const chat = target.getSnapshot()
      if (lifecycle === lastLifecycle && chat === lastChat) return lastValue
      lastLifecycle = lifecycle
      lastChat = chat
      lastValue = normalizeConversation(chat, lifecycle)
      return lastValue
    },
    subscribe: (listener) => {
      const stopSession = session.subscribe(listener)
      const stopChat = target.subscribe(listener)
      return () => {
        stopChat()
        stopSession()
      }
    },
  }
}

function projectedModel(session: SessionFaceLike | undefined): DashboardModelSelection | undefined {
  const projection = session?.projections?.faceOf('modelSelection').getSnapshot()
  const state = object(projection)
  const selected = object(state?.next) ?? object(state?.lastUsed)
  return typeof selected?.provider === 'string' && typeof selected.model === 'string'
    ? { model: selected.model, provider: selected.provider }
    : undefined
}

export function apply(baseContext: Context): void {
  const ctx = baseContext as unknown as RedteamClientContext
  const connection = ctx.connection
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pluginCss = '@prism-ai/dsh-redteam/dashboard'
    style.textContent = DASHBOARD_STYLES
    document.head.append(style)
    return () => style.remove()
  }, 'dsh-redteam: dashboard styles')

  const runtime: DashboardRuntime = {
    closeNativeDetails: () => ctx.layout.closeDetails(),
    createProjectSession: async ({ name, path }) =>
      await promptFreshRedteamSession(ctx, path, projectStartPrompt(name)),
    loadProjectSession: async ({ path }) =>
      await promptFreshRedteamSession(ctx, path, projectLoadPrompt()),
    executionPolicy: async (sessionId) => {
      const result = await connection.rpc.call('/redteam-policy', 'get', { sessionId })
      if (!result.ok) return { error: result.error.message, ok: false }
      const policy = executionPolicy(result.value)
      return policy === undefined
        ? { error: '服务端返回了无效的执行权限。', ok: false }
        : { ok: true, policy }
    },
    models: async (sessionId) => {
      const result = await ctx.remote.session.modelCatalog()
      if (!result.ok) return { error: result.error.message, models: [], ok: false }
      const session = ctx.sessions.binding(sessionId)?.session
      const current = projectedModel(session) ?? result.value.default
      return {
        current,
        models: result.value.groups.flatMap((provider) =>
          provider.models.map((model) => ({
            model: model.id,
            name: model.name,
            provider: provider.id,
            providerName: provider.name,
          })),
        ),
        ok: true,
        routable: result.value.routableProviders.includes(current.provider),
      }
    },
    pickDirectory: async () => await ctx.uiWorkspace.pickDirectory(),
    prompt: async (sessionId, text) => {
      const session = ctx.sessions.binding(sessionId)?.session
      if (session === undefined) return { error: '当前会话不可用。', ok: false }
      const result = await session.prompt([{ type: 'text', text }], 'queue')
      return result.ok ? { ok: true } : { error: result.error.message, ok: false }
    },
    selectModel: async (sessionId, selection) => {
      const result = await ctx.remote.session.selectModel({ sessionId, ...selection })
      return result.ok ? { ok: true } : { error: result.error.message, ok: false }
    },
    conversation: (sessionId) => conversationSource(ctx, sessionId),
    loadOlder: async (sessionId) => {
      const session = ctx.sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error('当前会话不可用。')
      await session.loadOlder()
    },
    toolAvailability: async () => {
      const result = await connection.rpc.call('/redteam-tool-availability', 'list', {})
      if (!result.ok) return { error: result.error.message, ok: false, tools: [] }
      const tools = toolAvailability(result.value)
      return tools === undefined
        ? { error: '服务端返回了无效的工具状态。', ok: false, tools: [] }
        : { ok: true, tools }
    },
    updateExecutionPolicy: async (sessionId, policy) => {
      const result = await connection.rpc.call('/redteam-policy', 'update', { policy, sessionId })
      if (!result.ok) return { error: result.error.message, ok: false }
      const applied = executionPolicy(result.value)
      return applied === undefined
        ? { error: '服务端未确认执行权限更新。', ok: false }
        : { ok: true, policy: applied }
    },
  }

  const DashboardEntry = (props: PropsRuntime<'shell.overlay'>) => (
    <Dashboard {...(props as DashboardProps)} runtime={runtime} />
  )
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'dsh-redteam-dashboard',
        order: 80,
        label: '棱镜',
      },
      DashboardEntry,
    ),
  )
}

const plugin = { apply, inject }
export default plugin
