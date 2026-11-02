// @vitest-environment jsdom

import type { Context } from '@deepseek-ai/cordis'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '../../src/client/runtime-contract.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const Icon = (_props: unknown): null => null
  const Tooltip = ({ children }: { children: ReactNode }): ReactNode => children
  return {
    IconAgentPresetOutline16: Icon,
    IconListPenOutline16: Icon,
    IconPanelLeftOutline16: Icon,
    IconSearchOutline16: Icon,
    IconWarningOutline16: Icon,
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
    open: vi.fn(),
  }
  const ctx = {
    connection: {
      rpc: { call: vi.fn() },
    },
    effect: (callback: () => () => void) => callback(),
    layout: { closeDetails: vi.fn() },
    sessions,
    remote: {
      agentPresets: {
        select: vi.fn(async (_sessionId: SessionId, agentPreset: string) => ({
          ok: true as const,
          value: agentPreset,
        })),
      },
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
    uiWorkspace: { pickDirectory: vi.fn().mockResolvedValue('/selected/project') },
  }
  apply(ctx as unknown as Context)
  if (DashboardEntry === undefined) throw new Error('dashboard entry was not registered')
  const element = DashboardEntry({} as DashboardProps) as ReactElement<DashboardProps>
  return {
    connection: ctx.connection,
    remote: ctx.remote,
    runtime: element.props.runtime,
    sessions,
    workspaces: ctx.workspaces,
  }
}

describe('Red Team dashboard client runtime', () => {
  it('declares every client service used by project session switching', () => {
    expect(inject).toEqual([
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
    ])
  })

  it('creates a fresh redteam session before starting or loading a project', async () => {
    const { remote, runtime, sessions, workspaces } = runtimeFromApply()

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
    })
    expect(sessions.create).toHaveBeenNthCalledWith(2, {
      workspaceId: 'workspace:/projects/previous',
    })
    expect(remote.agentPresets.select).toHaveBeenNthCalledWith(1, 'new-session-1', 'redteam')
    expect(remote.agentPresets.select).toHaveBeenNthCalledWith(2, 'new-session-2', 'redteam')
    expect(sessions.open).toHaveBeenNthCalledWith(1, 'new-session-1')
    expect(sessions.open).toHaveBeenNthCalledWith(2, 'new-session-2')
    expect(promptsFor(sessions, 'new-session-1')).toContain('redteam_project_start')
    expect(promptsFor(sessions, 'new-session-2')).toContain('不要创建新项目')
    expect(promptsFor(sessions, 'new-session-2')).toContain('不要运行 Shell')
  })

  it('surfaces preset selection failure without prompting or opening the new session', async () => {
    const { remote, runtime, sessions } = runtimeFromApply()
    remote.agentPresets.select.mockResolvedValueOnce({
      error: { message: 'redteam preset unavailable' },
      ok: false as const,
    } as never)

    await expect(
      runtime.createProjectSession({ name: 'Fresh project', path: '/projects/fresh' }),
    ).resolves.toEqual({ error: 'redteam preset unavailable', ok: false })
    expect(sessions.open).not.toHaveBeenCalled()
    expect(promptsFor(sessions, 'new-session-1')).toBeUndefined()
  })

  it('loads and validates built-in tool availability from the host', async () => {
    const { connection, runtime } = runtimeFromApply()
    connection.rpc.call.mockResolvedValueOnce({
      ok: true,
      value: {
        tools: [
          { id: 'nmap', installed: true },
          { id: 'nuclei', installed: false },
        ],
      },
    })

    await expect(runtime.toolAvailability()).resolves.toEqual({
      ok: true,
      tools: [
        { id: 'nmap', installed: true },
        { id: 'nuclei', installed: false },
      ],
    })
    expect(connection.rpc.call).toHaveBeenCalledWith('/redteam-tool-availability', 'list', {})

    connection.rpc.call.mockResolvedValueOnce({ ok: true, value: { tools: [{ id: 'nmap' }] } })
    await expect(runtime.toolAvailability()).resolves.toEqual({
      error: '服务端返回了无效的工具状态。',
      ok: false,
      tools: [],
    })
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
