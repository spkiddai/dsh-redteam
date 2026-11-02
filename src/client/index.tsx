import { PrismShell, type ShellNavigation } from './PrismShell.js'
import type { McpPermission } from '../lib/mcp-permission-types.js'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SessionFace, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import {
  type DashboardExecutionPolicy,
  type DashboardModelSelection,
  type DashboardRuntime,
  type OperationMode,
  type McpConnection,
  type TestingScopeRule,
} from './Dashboard.js'
import type {
  DashboardConversationSnapshot,
  DashboardConversationSource,
  SessionId,
} from './runtime-contract.js'
import { projectLoadPrompt, projectStartPrompt } from './prompts.js'
import { DASHBOARD_STYLES } from './styles.js'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    redteamDashboard: unknown
  }
}

export const inject = [
  'slots',
  'sessions',
  'workspaces',
  'connection',
  'remote',
  'remote.session',
  'uiConversation',
  'uiWorkspace',
]

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

function mcpPermission(value: unknown): McpPermission {
  const p = record(value)
  if (
    p === undefined ||
    typeof p.connectionId !== 'string' ||
    typeof p.toolName !== 'string' ||
    typeof p.schemaHash !== 'string' ||
    !['blocked', 'passive', 'active-scan', 'exploitation', 'full'].includes(p.mode as string) ||
    !['none', 'host', 'url'].includes(p.targetKind as string) ||
    typeof p.targetField !== 'string' ||
    typeof p.reason !== 'string' ||
    typeof p.confirmed !== 'boolean'
  )
    throw new Error('服务端返回了无效的 AI 权限建议。')
  return {
    connectionId: p.connectionId,
    toolName: p.toolName,
    schemaHash: p.schemaHash,
    mode: p.mode as McpPermission['mode'],
    targetKind: p.targetKind as McpPermission['targetKind'],
    targetField: p.targetField,
    reason: p.reason,
    confirmed: p.confirmed,
  }
}

function mcpConnection(value: unknown): McpConnection {
  const item = record(value)
  if (
    item === undefined ||
    typeof item.id !== 'string' ||
    typeof item.label !== 'string' ||
    typeof item.endpoint !== 'string' ||
    !['http', 'stdio'].includes(item.transport as string) ||
    typeof item.connected !== 'boolean' ||
    typeof item.executable !== 'boolean' ||
    typeof item.reviewId !== 'string' ||
    !Array.isArray(item.permissions) ||
    !Array.isArray(item.tools) ||
    item.tools.some((name) => typeof name !== 'string')
  ) {
    throw new Error('服务端返回了无效的 MCP 连接信息。')
  }
  return {
    id: item.id,
    label: item.label,
    endpoint: item.endpoint,
    transport: item.transport as 'http' | 'stdio',
    connected: item.connected,
    executable: item.executable,
    reviewId: item.reviewId,
    permissions: item.permissions.map(mcpPermission),
    tools: item.tools as string[],
  }
}

async function promptFreshRedteamSession(
  ctx: Context,
  path: string,
  prompt: string,
): Promise<ProjectSessionResult> {
  try {
    const workspace = await ctx.workspaces.create({ path })
    const sessionId = await ctx.sessions.create({
      workspaceId: workspace.workspaceId,
      agentPreset: 'redteam',
    })
    return await ctx.sessions.using(
      sessionId,
      { source: 'redteamDashboard' },
      async (reference) => {
        const { session } = await reference.ready
        ctx.uiWorkspace.openSession(sessionId)
        const result = await session.prompt([{ type: 'text', text: prompt }], 'queue')
        return result.ok ? { ok: true } : { error: result.error.message, ok: false }
      },
    )
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
  chat: ChatSnapshot | undefined,
  lifecycle: SessionSnapshot,
): DashboardConversationSnapshot | undefined {
  if (chat === undefined) return undefined
  return {
    hasMore: lifecycle.hasMore,
    loadingOlder: lifecycle.loadingOlder,
    nodes: chat.legacy.nodes,
    partial: chat.legacy.partial,
    running: lifecycle.running,
    runningCalls: chat.legacy.runningCalls,
  }
}

function conversationSource(
  ctx: Context,
  sessionId: SessionId,
): DashboardConversationSource | undefined {
  const binding = ctx.sessions.binding(sessionId as Parameters<Context['sessions']['binding']>[0])
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

function projectedModel(session: SessionFace | undefined): DashboardModelSelection | undefined {
  const projection = session?.projections?.faceOf('modelSelection').getSnapshot()
  const state = object(projection)
  const selected = object(state?.next) ?? object(state?.lastUsed)
  return typeof selected?.provider === 'string' && typeof selected.model === 'string'
    ? { model: selected.model, provider: selected.provider }
    : undefined
}

export function apply(ctx: Context): void {
  const connection = ctx.get('connection') as ConnectionHandle
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pluginCss = '@prism-ai/dsh-redteam/dashboard'
    style.textContent = DASHBOARD_STYLES
    document.head.append(style)
    return () => style.remove()
  }, 'dsh-redteam: dashboard styles')

  const runtime: DashboardRuntime = {
    confirmMcpPermissions: async (sessionId, connectionId, reviewId) => {
      const result = await connection.rpc.call('/api', 'redteam-policy/confirm-permissions', {
        sessionId,
        connectionId,
        reviewId,
      })
      if (!result.ok) throw new Error(result.error.message)
      return mcpConnection(result.value)
    },
    mcpConnections: async (sessionId) => {
      const result = await connection.rpc.call('/api', 'redteam-policy/connections', { sessionId })
      if (!result.ok) throw new Error(result.error.message)
      if (!Array.isArray(result.value) || result.value.length > 16)
        throw new Error('服务端返回了无效的 MCP 连接列表。')
      return result.value.map(mcpConnection)
    },
    connectMcp: async (sessionId, definition) => {
      const result = await connection.rpc.call('/api', 'redteam-policy/connect', {
        sessionId,
        connection: definition,
      })
      if (!result.ok) throw new Error(result.error.message)
      return mcpConnection(result.value)
    },
    createProjectSession: async ({ name, path }) =>
      await promptFreshRedteamSession(ctx, path, projectStartPrompt(name)),
    loadProjectSession: async ({ path }) =>
      await promptFreshRedteamSession(ctx, path, projectLoadPrompt()),
    executionPolicy: async (sessionId) => {
      const result = await connection.rpc.call('/api', 'redteam-policy/get', { sessionId })
      if (!result.ok) return { error: result.error.message, ok: false }
      const policy = executionPolicy(result.value)
      return policy === undefined
        ? { error: '服务端返回了无效的执行权限。', ok: false }
        : { ok: true, policy }
    },
    models: async (sessionId) => {
      const result = await ctx.remote.session.modelCatalog()
      if (!result.ok) return { error: result.error.message, models: [], ok: false }
      const session = ctx.sessions.binding(
        sessionId as Parameters<Context['sessions']['binding']>[0],
      )?.session
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
      const session = ctx.sessions.binding(
        sessionId as Parameters<Context['sessions']['binding']>[0],
      )?.session
      if (session === undefined) return { error: '当前会话不可用。', ok: false }
      const result = await session.prompt([{ type: 'text', text }], 'queue')
      return result.ok ? { ok: true } : { error: result.error.message, ok: false }
    },
    selectModel: async (sessionId, selection) => {
      const result = await ctx.remote.session.selectModel({
        sessionId: sessionId as Parameters<Context['sessions']['binding']>[0],
        ...selection,
      })
      return result.ok ? { ok: true } : { error: result.error.message, ok: false }
    },
    conversation: (sessionId) => conversationSource(ctx, sessionId),
    loadOlder: async (sessionId) => {
      const session = ctx.sessions.binding(
        sessionId as Parameters<Context['sessions']['binding']>[0],
      )?.session
      if (session === undefined) throw new Error('当前会话不可用。')
      await session.loadOlder()
    },
    updateExecutionPolicy: async (sessionId, policy) => {
      const result = await connection.rpc.call('/api', 'redteam-policy/update', {
        policy,
        sessionId,
      })
      if (!result.ok) return { error: result.error.message, ok: false }
      const applied = executionPolicy(result.value)
      return applied === undefined
        ? { error: '服务端未确认执行权限更新。', ok: false }
        : { ok: true, policy: applied }
    },
  }

  const navigation: ShellNavigation = {
    openSession: async (id) => {
      await ctx.sessions.refresh()
      const nativeId = id as Parameters<Context['sessions']['binding']>[0]
      if (!ctx.sessions.list.getSnapshot().byId[nativeId])
        throw new Error('会话列表正在同步，请重试。')
      ctx.uiWorkspace.openSession(nativeId)
    },
    startSession: () => ctx.uiWorkspace.startSession(undefined, { agentPreset: 'redteam' }),
    openDirectory: async (path) => {
      const workspace = await ctx.workspaces.create({ path })
      await ctx.uiWorkspace.openWorkspace(workspace.workspaceId, undefined, {
        agentPreset: 'redteam',
      })
    },
    cancel: async (id) => {
      const session = ctx.sessions.binding(
        id as Parameters<Context['sessions']['binding']>[0],
      )?.session
      if (!session) throw new Error('当前会话不可用。')
      const result = await session.cancel()
      if (!result.ok) throw new Error(result.error.message)
    },
  }
  const PrismEntry = (props: PropsRuntime<'root'>) => (
    <PrismShell {...props} runtime={runtime} navigation={navigation} />
  )
  // This product intentionally replaces the stock shell; DSH still owns every session and tool.
  ctx.slots.register({ name: 'root', priority: -100, registrant: 'prism' }, PrismEntry)
}

const plugin = { apply, inject }
export default plugin
