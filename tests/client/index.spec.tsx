// @vitest-environment jsdom

import type { Context } from '@deepseek-ai/cordis'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '../../src/client/runtime-contract.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const Icon = (_props: unknown): null => null
  const Tooltip = ({ children }: { children: ReactNode }): ReactNode => children
  return {
    IconAgentPresetOutlineMedium: Icon,
    IconListPenOutlineMedium: Icon,
    IconPanelLeftOutlineMedium: Icon,
    IconSearchOutlineMedium: Icon,
    IconWarningOutlineMedium: Icon,
    Tooltip,
  }
})

import { apply, inject } from '../../src/client/index.js'
import type { DashboardProps } from '../../src/client/Dashboard.js'

afterEach(() => {
  document.head.querySelector('[data-plugin-css]')?.remove()
})

function runtimeFromApply() {
  const created = ['new-session-1', 'new-session-2'] as SessionId[]
  const prompts = new Map<SessionId, ReturnType<typeof vi.fn>>()
  let DashboardEntry: ((props: DashboardProps) => ReactElement) | undefined
  const release = vi.fn()
  const sessions = {
    binding: vi.fn((sessionId: SessionId) => {
      const prompt = prompts.get(sessionId)
      return prompt === undefined ? undefined : { session: { prompt } }
    }),
    create: vi.fn(async () => {
      const sessionId = created.shift()
      if (sessionId === undefined) throw new Error('missing test session id')
      prompts.set(sessionId, vi.fn().mockResolvedValue({ ok: true }))
      return sessionId
    }),
    using: vi.fn(
      async (
        sessionId: SessionId,
        _options: unknown,
        operation: (reference: unknown) => Promise<unknown>,
      ) => {
        try {
          return await operation({ ready: Promise.resolve(sessions.binding(sessionId)) })
        } finally {
          release()
        }
      },
    ),
  }
  const ctx = {
    connection: {
      rpc: { call: vi.fn() },
    },
    get: (name: string) => (name === 'connection' ? ctx.connection : undefined),
    effect: (callback: () => () => void) => callback(),
    sidebarRight: { isExpanded: vi.fn().mockReturnValue(true), toggleExpanded: vi.fn() },
    sessions,
    remote: {
      session: {
        modelCatalog: vi.fn(),
        selectModel: vi.fn(),
      },
    },
    slots: {
      inject: (_name: string, callback: () => unknown) => callback(),
      register: (_definition: unknown, component: unknown) => {
        DashboardEntry = component as (props: DashboardProps) => ReactElement
        return () => undefined
      },
    },
    workspaces: {
      create: vi.fn(async ({ path }: { path: string }) => ({
        path,
        workspaceId: `workspace:${path}`,
      })),
    },
    uiConversation: { binding: vi.fn() },
    uiWorkspace: {
      pickDirectory: vi.fn().mockResolvedValue('/selected/project'),
      openSession: vi.fn(),
    },
  }
  apply(ctx as unknown as Context)
  if (DashboardEntry === undefined) throw new Error('dashboard entry was not registered')
  const element = DashboardEntry({} as DashboardProps) as ReactElement<DashboardProps>
  return {
    remote: ctx.remote,
    release,
    uiWorkspace: ctx.uiWorkspace,
    sidebarRight: ctx.sidebarRight,
    uiConversation: ctx.uiConversation,
    rpc: ctx.connection.rpc,
    runtime: element.props.runtime,
    sessions,
    workspaces: ctx.workspaces,
  }
}

describe('Red Team dashboard client runtime', () => {
  it('connects MCP through host RPC and validates returned connection data', async () => {
    const { runtime, rpc } = runtimeFromApply()
    const input = { label: 'local', endpoint: 'http://localhost/mcp', transport: 'http' as const }
    const connection = {
      ...input,
      id: 'mcp-local',
      connected: true,
      executable: false,
      permissions: [],
      reviewId: 'review-empty',
      tools: ['mcp__external__ping'],
    }
    rpc.call.mockResolvedValueOnce({ ok: true, value: connection })
    expect(await runtime.connectMcp('session-1', input)).toEqual(connection)
    expect(rpc.call).toHaveBeenCalledWith('/api', 'redteam-policy/connect', {
      sessionId: 'session-1',
      connection: input,
    })
    rpc.call.mockResolvedValueOnce({ ok: true, value: [connection] })
    expect(await runtime.mcpConnections('session-1')).toEqual([connection])
    rpc.call.mockResolvedValueOnce({ ok: true, value: { ...connection, executable: true } })
    expect(
      (await runtime.confirmMcpPermissions('session-1', connection.id, connection.reviewId))
        .executable,
    ).toBe(true)
    expect(rpc.call).toHaveBeenCalledWith('/api', 'redteam-policy/confirm-permissions', {
      sessionId: 'session-1',
      connectionId: connection.id,
      reviewId: connection.reviewId,
    })
    rpc.call.mockResolvedValueOnce({ ok: true, value: {} })
    await expect(runtime.mcpConnections('session-1')).rejects.toThrow('无效')
    rpc.call.mockResolvedValueOnce({ ok: true, value: { ...connection, executable: 'invalid' } })
    await expect(runtime.connectMcp('session-1', input)).rejects.toThrow('无效')
    rpc.call.mockResolvedValueOnce({ ok: false, error: { message: 'connection failed' } })
    await expect(runtime.connectMcp('session-1', input)).rejects.toThrow('connection failed')
  })

  it('declares every client service used by project session switching', () => {
    expect(inject).toEqual([
      'slots',
      'sessions',
      'workspaces',
      'connection',
      'remote',
      'remote.session',
      'uiConversation',
      'uiWorkspace',
    ])
  })

  it('creates a fresh redteam session before starting or loading a project', async () => {
    const { runtime, sessions, workspaces, uiWorkspace, release } = runtimeFromApply()

    await expect(
      runtime.createProjectSession({ name: 'Fresh project', path: '/projects/fresh' }),
    ).resolves.toEqual({ ok: true })
    await expect(runtime.loadProjectSession({ path: '/projects/previous' })).resolves.toEqual({
      ok: true,
    })

    expect(workspaces.create).toHaveBeenNthCalledWith(1, { path: '/projects/fresh' })
    expect(workspaces.create).toHaveBeenNthCalledWith(2, { path: '/projects/previous' })
    expect(sessions.create).toHaveBeenNthCalledWith(1, {
      workspaceId: 'workspace:/projects/fresh',
      agentPreset: 'redteam',
    })
    expect(sessions.create).toHaveBeenNthCalledWith(2, {
      workspaceId: 'workspace:/projects/previous',
      agentPreset: 'redteam',
    })
    expect(release).toHaveBeenCalledTimes(2)
    expect(uiWorkspace.openSession).toHaveBeenNthCalledWith(1, 'new-session-1')
    expect(uiWorkspace.openSession).toHaveBeenNthCalledWith(2, 'new-session-2')
    expect(promptsFor(sessions, 'new-session-1')).toContain('redteam_project_start')
    expect(promptsFor(sessions, 'new-session-2')).toContain('不要创建新项目')
    expect(promptsFor(sessions, 'new-session-2')).toContain('不要运行 Shell')
  })

  it('releases its session reference when prompting fails', async () => {
    const { runtime, sessions, release } = runtimeFromApply()
    sessions.binding.mockReturnValue({
      session: { prompt: vi.fn().mockRejectedValue(new Error('offline')) },
    })
    expect(await runtime.loadProjectSession({ path: '/project' })).toEqual({
      ok: false,
      error: 'offline',
    })
    expect(release).toHaveBeenCalledOnce()
  })

  it('subscribes to the Chat target and Session lifecycle and releases both subscriptions', () => {
    const { runtime, sessions, uiConversation } = runtimeFromApply()
    const stopChat = vi.fn()
    const stopSession = vi.fn()
    const lifecycle = { running: true, hasMore: true, loadingOlder: false }
    const chat = { legacy: { nodes: [{ kind: 'user', seq: 1 }], partial: null, runningCalls: [] } }
    const binding = {
      session: { getSnapshot: () => lifecycle, subscribe: vi.fn(() => stopSession) },
    }
    sessions.binding.mockReturnValue(binding as never)
    const target = { getSnapshot: () => chat, subscribe: vi.fn(() => stopChat) }
    uiConversation.binding.mockReturnValue({ target: vi.fn(() => target) })
    const source = runtime.conversation('session-1')!
    const first = source.getSnapshot()
    expect(first).toMatchObject({ ...lifecycle, ...chat.legacy })
    expect(source.getSnapshot()).toBe(first)
    const stop = source.subscribe(vi.fn())
    stop()
    expect(stopChat).toHaveBeenCalledOnce()
    expect(stopSession).toHaveBeenCalledOnce()
  })

  it('reads the current model projection and sends selection through the native remote', async () => {
    const { runtime, sessions, remote } = runtimeFromApply()
    const current = { provider: 'deepseek', model: 'reasoner' }
    sessions.binding.mockReturnValue({
      session: { projections: { faceOf: () => ({ getSnapshot: () => ({ next: current }) }) } },
    } as never)
    remote.session.modelCatalog.mockResolvedValue({
      ok: true,
      value: {
        default: { provider: 'deepseek', model: 'chat' },
        groups: [
          { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'reasoner', name: 'Reasoner' }] },
        ],
        routableProviders: ['deepseek'],
      },
    })
    expect(await runtime.models('session-1')).toMatchObject({ ok: true, current, routable: true })
    remote.session.selectModel.mockResolvedValue({ ok: true, value: { selected: current } })
    expect(await runtime.selectModel('session-1', current)).toEqual({ ok: true })
    expect(remote.session.selectModel).toHaveBeenCalledWith({ sessionId: 'session-1', ...current })
  })

  it('surfaces preset selection failure without prompting or opening the new session', async () => {
    const { runtime, sessions, uiWorkspace } = runtimeFromApply()
    sessions.create.mockRejectedValueOnce(new Error('redteam preset unavailable'))

    await expect(
      runtime.createProjectSession({ name: 'Fresh project', path: '/projects/fresh' }),
    ).resolves.toEqual({ error: 'redteam preset unavailable', ok: false })
    expect(uiWorkspace.openSession).not.toHaveBeenCalled()
    expect(promptsFor(sessions, 'new-session-1')).toBeUndefined()
  })
})

function promptsFor(
  sessions: ReturnType<typeof runtimeFromApply>['sessions'],
  sessionId: string,
): string | undefined {
  const binding = sessions.binding(sessionId as SessionId) as
    { session: { prompt: ReturnType<typeof vi.fn> } } | undefined
  const content = binding?.session.prompt.mock.calls[0]?.[0] as
    readonly { readonly text?: string }[] | undefined
  return content?.[0]?.text
}
