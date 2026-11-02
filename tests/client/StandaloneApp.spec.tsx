// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '../../src/client/standalone/App.js'
import { teamApi } from '../../src/client/team-api.js'
import { teamFixture } from './team-fixture.js'
vi.mock('../../src/client/team-api.js', () => ({ teamApi: vi.fn() }))
vi.mock('../../src/client/NativeScanner.js', () => ({ NativeScanner: () => <h1>扫描测试页面</h1> }))
let state = teamFixture()
let assets: Record<string, unknown>[] = []
beforeEach(() => {
  state = teamFixture()
  assets = []
  location.hash = 'workspace'
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ passwordChangeRecommended: true }) })),
  )
  vi.mocked(teamApi).mockImplementation(async (action, input) => {
    if (action === 'state') return state as never
    if (action === 'asset-list') return { assets } as never
    if (action === 'asset-create') {
      assets.push({ id: 'new', ...input })
      return { id: 'new' } as never
    }
    if (action === 'scan-list') return { jobs: [] } as never
    if (action === 'plugins-list')
      return {
        plugins: [
          {
            id: 'scanner',
            name: '内置扫描',
            version: '1',
            description: '原生扫描',
            status: 'ready',
          },
        ],
      } as never
    return {} as never
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('separates security tools from work modules, supports deep links and does not create a project', async () => {
  location.hash = 'testing'
  render(<App />)
  await screen.findByText('admin')
  const security = screen.getByRole('navigation', { name: '安全工具导航' })
  expect(
    within(security).getByRole('button', { name: '内置扫描' }).getAttribute('aria-current'),
  ).toBe('page')
  expect(
    within(screen.getByRole('navigation', { name: '棱镜功能导航' })).queryByText('内置扫描'),
  ).toBeNull()
  const group = within(security).getByRole('button', { name: '安全工具' })
  fireEvent.click(group)
  expect(screen.queryByRole('button', { name: '内置扫描' })).toBeNull()
  expect(screen.getByRole('heading', { name: '扫描测试页面' })).toBeTruthy()
  fireEvent.click(group)
  fireEvent.click(within(security).getByRole('button', { name: '工具集成' }))
  expect(await screen.findByText('原生扫描')).toBeTruthy()
  expect(screen.getByText(/外部工具暂不可连接或执行/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '打开内置扫描 →' }))
  expect(location.hash).toBe('#testing')
  fireEvent.click(screen.getByRole('button', { name: '稍后提醒' }))
  expect(screen.queryByText('稍后提醒')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '任务工作台' }))
  expect(await screen.findByText('暂无扫描任务')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('查看范围'), { target: { value: 'p1' } })
  await waitFor(() => expect(teamApi).toHaveBeenCalledWith('scan-list', { projectId: 'p1' }))
  fireEvent.click(screen.getByRole('button', { name: '新建扫描' }))
  expect(screen.getByRole('heading', { name: '扫描测试页面' })).toBeTruthy()
  expect(
    vi
      .mocked(teamApi)
      .mock.calls.some(([action]) => action === 'project-create' || action === 'session-open'),
  ).toBe(false)
})

it('registers sourced assets and filters them by project and text', async () => {
  assets = [
    {
      id: 'shared',
      projectId: 'p1',
      type: 'ip',
      value: '192.0.2.1',
      source: 'https://example.test',
      note: '共享',
    },
  ]
  location.hash = 'discovery'
  render(<App />)
  await screen.findByText('admin')
  expect(await screen.findByText('暂无资产记录')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '登记资产' }))
  fireEvent.change(screen.getByLabelText('资产类型'), { target: { value: 'domain' } })
  fireEvent.change(screen.getByLabelText('资产值'), { target: { value: 'example.test' } })
  fireEvent.change(screen.getByLabelText('来源链接'), {
    target: { value: 'https://example.test/source' },
  })
  fireEvent.change(screen.getByLabelText('说明'), { target: { value: '公开来源' } })
  fireEvent.click(screen.getByRole('button', { name: '保存资产' }))
  expect(await screen.findByText('example.test')).toBeTruthy()
  expect(teamApi).toHaveBeenCalledWith('asset-create', {
    projectId: null,
    type: 'domain',
    value: 'example.test',
    source: 'https://example.test/source',
    note: '公开来源',
  })
  fireEvent.change(screen.getByLabelText('搜索资产'), { target: { value: 'no-match' } })
  expect(screen.queryByText('example.test')).toBeNull()
  fireEvent.change(screen.getByLabelText('查看范围'), { target: { value: 'p1' } })
  expect(await screen.findByText('192.0.2.1')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('查看范围'), { target: { value: '' } })
  expect(await screen.findByText('example.test')).toBeTruthy()
})

it('shows task summaries and independent management pages', async () => {
  const original = vi.mocked(teamApi).getMockImplementation()!
  vi.mocked(teamApi).mockImplementation(async (action, input) =>
    action === 'scan-list'
      ? ({
          jobs: [
            {
              id: 'j1',
              name: '端口检查',
              kind: 'ports',
              targets: ['192.0.2.1'],
              state: 'completed',
              findingsCount: 0,
            },
          ],
        } as never)
      : original(action, input),
  )
  render(<App />)
  expect(await screen.findByText('端口检查')).toBeTruthy()
  expect(screen.getByText('已完成')).toBeTruthy()
  for (const name of ['工作概览', '项目空间', '用户管理', '权限管理']) {
    fireEvent.click(
      screen
        .getByRole('navigation', {
          name: name === '工作概览' || name === '项目空间' ? '工作空间导航' : '管理导航',
        })
        .querySelectorAll('button')[name === '工作概览' || name === '用户管理' ? 0 : 1]!,
    )
    expect(await screen.findByRole('heading', { name, level: 1 })).toBeTruthy()
  }
})

it('hides management from members and surfaces loading failures', async () => {
  state.capabilities.manageUsers = false
  state.capabilities.managePermissions = false
  state.user.role = 'member'
  location.hash = 'tools'
  const original = vi.mocked(teamApi).getMockImplementation()!
  vi.mocked(teamApi).mockImplementation(async (action, input) => {
    if (action === 'plugins-list') throw new Error('连接失败')
    return original(action, input)
  })
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', '连接失败')
  expect(screen.queryByRole('navigation', { name: '管理导航' })).toBeNull()
  expect(screen.getByText('团队账号')).toBeTruthy()
})
