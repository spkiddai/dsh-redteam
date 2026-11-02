// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrismShell, type PrismShellProps } from '../../src/client/PrismShell.js'
import { teamFixture } from './team-fixture.js'
vi.mock('../../src/client/Dashboard.js', () => ({
  Dashboard: ({ activeModule }: { activeModule: string }) => (
    <div data-testid="module" data-module={activeModule}>
      棱镜四个模块
    </div>
  ),
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconFolderOpenOutlineMedium: () => null,
  IconPlusOutlineMedium: () => null,
  IconUsersOutlineMedium: () => null,
  IconShieldOutlineMedium: () => null,
  IconChevronRightOutlineMedium: () => null,
  IconSearchOutlineMedium: () => null,
  IconFlatListOutlineMedium: () => null,
  IconAgentPresetOutlineMedium: () => null,
}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function fixture(pending?: unknown, selected = true, passwordChangeRecommended = false) {
  window.history.replaceState({}, '', '/#workspace')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        url === '/prism-auth/state'
          ? { authenticated: true, username: 'tester', passwordChangeRecommended }
          : url.endsWith('session-open')
            ? { sessionId: 'session-new' }
            : {
                ...teamFixture(),
                user: { id: 'u1', username: 'tester', role: 'admin' },
                users: [],
                personalSessions: ['session-123'],
                projects: [
                  {
                    id: 'p1',
                    name: '项目一',
                    role: 'manager',
                    sessions: ['session-123'],
                    createdBy: 'tester',
                  },
                ],
              },
    })),
  )
  const navigation = {
    openSession: vi.fn(),
    startSession: vi.fn(),
    openDirectory: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
  }
  const row = {
    id: 'session-123',
    title: '授权项目',
    cwd: '/work/project',
    retainedBy: selected ? { mainView: 1 } : {},
    projectionValues: { agentPreset: 'redteam' },
  }
  const byId = {
    [row.id]: row,
    other: {
      ...row,
      id: 'other',
      title: 'DSH 旧会话',
      retainedBy: {},
      projectionValues: { agentPreset: 'standard' },
    },
  }
  const props = {
    navigation,
    runtime: {},
    useSessions: (selector: (state: unknown) => unknown) => selector({ byId }),
    useSessionStatus: (selector: (state: unknown) => unknown) =>
      selector(new Map([[row.id, { running: true, pendingInteraction: pending }]])),
  } as unknown as PrismShellProps
  return { props, navigation }
}

describe('PRISM-only shell', () => {
  it('shows a dismissible password suggestion without blocking the workspace', async () => {
    const { props } = fixture(undefined, true, true)
    render(<PrismShell {...props} />)
    await screen.findByText('你正在使用初始密码，建议修改。可以继续使用工作台。')
    expect(screen.getByText('棱镜四个模块')).toBeTruthy()
    expect(
      within(screen.getByRole('status'))
        .getByRole('link', { name: '修改密码' })
        .getAttribute('href'),
    ).toBe('/login?password=1')
    fireEvent.click(screen.getByText('稍后提醒'))
    expect(screen.queryByRole('status')).toBeNull()
    expect((screen.getByText('新任务') as HTMLButtonElement).disabled).toBe(false)
  })
  it('renders only PRISM navigation, switches native sessions and stops native work', async () => {
    const { props, navigation } = fixture()
    render(<PrismShell {...props} />)
    await screen.findByText('tester')
    expect(screen.queryByText('DSH 旧会话')).toBeNull()
    expect(screen.getByText('棱镜四个模块')).toBeTruthy()
    expect(navigation.startSession).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('任务记录'), { target: { value: 'session-123' } })
    expect(navigation.openSession).toHaveBeenCalledWith('session-123')
    await waitFor(() =>
      expect((screen.getByText('新任务') as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(screen.getByText('新任务'))
    await waitFor(() => expect(navigation.openSession).toHaveBeenCalledWith('session-new'))
    fireEvent.click(screen.getByText('停止任务'))
    await waitFor(() => expect(navigation.cancel).toHaveBeenCalledWith('session-123'))
  })
  it('restores an authorized session and creates projects without arbitrary host paths', async () => {
    const { props, navigation } = fixture(undefined, false)
    render(<PrismShell {...props} />)
    await waitFor(() => expect(navigation.openSession).toHaveBeenCalledWith('session-new'))
    fireEvent.click(screen.getByRole('button', { name: '项目空间' }))
    fireEvent.click(screen.getByRole('button', { name: '新建项目' }))
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '协作项目' } })
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/prism-api/project-create',
        expect.objectContaining({ body: JSON.stringify({ name: '协作项目' }) }),
      ),
    )
    expect(screen.queryByLabelText('项目路径')).toBeNull()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('automatically prepares an owned standalone task without creating a project', async () => {
    const { props, navigation } = fixture(undefined, false)
    props.useSessions = (selector) =>
      selector({ byId: {}, ids: [], phase: 'ready', projectionsBySession: {} })
    render(<PrismShell {...props} />)
    await screen.findByText('tester')
    expect(navigation.startSession).not.toHaveBeenCalled()
    await waitFor(() => expect(navigation.openSession).toHaveBeenCalledWith('session-new'))
    expect(fetch).toHaveBeenCalledWith(
      '/prism-api/session-open',
      expect.objectContaining({ body: '{}' }),
    )
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('project-create')),
    ).toBe(false)
    expect((screen.getByLabelText('查看范围') as HTMLSelectElement).value).toBe('')
    expect(screen.queryByRole('button', { name: '内置扫描' })).toBeNull()
    const group = screen.getByRole('button', { name: '安全工具' })
    expect(group.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(group)
    expect(group.getAttribute('aria-expanded')).toBe('true')
    for (const name of ['任务工作台', '资产情况', '内置扫描', '工具集成'])
      expect(screen.getByRole('button', { name })).toBeTruthy()
    fireEvent.click(group)
    expect(screen.queryByRole('button', { name: '工具集成' })).toBeNull()
  })
  it('switches modules directly and changes project scope without navigating through a project page', async () => {
    const { props, navigation } = fixture()
    render(<PrismShell {...props} />)
    await screen.findByText('tester')
    fireEvent.click(screen.getByRole('button', { name: '资产情况' }))
    expect(screen.getByTestId('module').getAttribute('data-module')).toBe('discovery')
    expect(window.location.hash).toBe('#discovery')
    fireEvent.click(screen.getByRole('button', { name: '安全工具' }))
    fireEvent.click(screen.getByRole('button', { name: '工具集成' }))
    expect(screen.getByTestId('module').getAttribute('data-module')).toBe('tools')
    fireEvent.change(screen.getByLabelText('查看范围'), { target: { value: 'p1' } })
    expect(screen.getByTestId('module').getAttribute('data-module')).toBe('tools')
    expect(navigation.startSession).not.toHaveBeenCalled()
  })
  it.each(['仅允许本次', '拒绝'])(
    'passes the explicit %s decision to the native approval',
    async (label) => {
      const answer = vi.fn().mockResolvedValue(undefined)
      const { props } = fixture({
        kind: 'approval',
        key: 'approval-1',
        toolName: 'bash',
        reason: '访问受保护目录',
        answerable: true,
        answer,
      })
      render(<PrismShell {...props} />)
      expect(answer).not.toHaveBeenCalled()
      expect(await screen.findByText('访问受保护目录')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: label }))
      await waitFor(() =>
        expect(answer).toHaveBeenCalledWith(label === '拒绝' ? 'rejected' : 'allowed-once'),
      )
    },
  )
  it('shows plan details and sends only the user-selected native question answer', async () => {
    const answer = vi.fn().mockResolvedValue(undefined),
      engage = vi.fn()
    const state = { closed: false, channel: 'waterfall' }
    const { props } = fixture({
      kind: 'plan-review',
      key: 'plan-1',
      questions: [
        {
          id: 'review',
          question: '批准计划？',
          detail: '先检查登录，再修复问题。',
          options: [{ label: '批准', description: '开始执行' }, { label: '修改' }],
        },
      ],
      answer,
      engage,
      subscribe: () => () => undefined,
      getSnapshot: () => state,
    })
    render(<PrismShell {...props} />)
    expect(await screen.findByText('先检查登录，再修复问题。')).toBeTruthy()
    expect((screen.getByText('提交回答') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: '批准 开始执行' }))
    fireEvent.change(screen.getByLabelText('补充回答'), { target: { value: '仅检查本项目' } })
    fireEvent.click(screen.getByText('提交回答'))
    await waitFor(() =>
      expect(answer).toHaveBeenCalledWith({
        answers: [{ id: 'review', selected: ['批准'], custom: '仅检查本项目' }],
      }),
    )
    expect(engage).toHaveBeenCalled()
  })
})
