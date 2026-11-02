// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { OverviewPage, ProjectsPage, UsersPage } from '../../src/client/ManagementPages.js'
import { PermissionsPage } from '../../src/client/PermissionsPage.js'
import { teamApi } from '../../src/client/team-api.js'
import { teamFixture } from './team-fixture.js'

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
const setup = () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'new-resource' }) }))
  vi.stubGlobal('fetch', fetcher)
  return { fetcher, refresh: vi.fn(async () => {}) }
}
describe('independent console pages', () => {
  it('shows actual counts and navigates without tying users to a project', () => {
    const state = teamFixture(),
      navigate = vi.fn(),
      open = vi.fn()
    render(<OverviewPage state={state} navigate={navigate} openProject={open} />)
    fireEvent.click(screen.getByRole('button', { name: /用户管理/ }))
    expect(navigate).toHaveBeenLastCalledWith('users')
    fireEvent.click(screen.getByRole('button', { name: /权限管理/ }))
    expect(navigate).toHaveBeenLastCalledWith('permissions')
    fireEvent.click(screen.getByRole('button', { name: /门户评估/ }))
    expect(open).toHaveBeenCalledWith('p1')
    fireEvent.click(screen.getByText('查看全部'))
    expect(navigate).toHaveBeenLastCalledWith('projects')
  })
  it('creates and filters independent project resources, with recoverable errors', async () => {
    const { fetcher, refresh } = setup(),
      open = vi.fn()
    render(<ProjectsPage state={teamFixture()} refresh={refresh} openProject={open} />)
    fireEvent.change(screen.getByLabelText('搜索项目'), { target: { value: 'missing' } })
    expect(screen.getByText('没有匹配的项目')).toBeTruthy()
    fireEvent.click(screen.getByText('新建项目'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('项目名称'), {
      target: { value: 'New project' },
    })
    fireEvent.click(within(dialog).getByText('创建项目'))
    await waitFor(() => expect(open).toHaveBeenCalledWith('new-resource'))
    expect(fetcher).toHaveBeenCalledWith(
      '/prism-api/project-create',
      expect.objectContaining({ body: JSON.stringify({ name: 'New project' }) }),
    )
    fireEvent.click(screen.getByText('新建项目'))
    fireEvent.click(screen.getByText('取消'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('creates users without projects and edits account status with an eight-character password', async () => {
    const { fetcher, refresh } = setup(),
      permissions = vi.fn(),
      state = teamFixture()
    state.projects = []
    render(<UsersPage state={state} refresh={refresh} openPermissions={permissions} />)
    fireEvent.click(screen.getByText('添加用户'))
    expect(screen.queryByLabelText('项目')).toBeNull()
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'carol' } })
    const password = screen.getByLabelText('初始密码') as HTMLInputElement
    expect(password.minLength).toBe(8)
    fireEvent.change(password, { target: { value: '12345678' } })
    fireEvent.click(screen.getByText('保存账号'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(fetcher).toHaveBeenLastCalledWith(
      '/prism-api/user-create',
      expect.objectContaining({
        body: JSON.stringify({ username: 'carol', password: '12345678', role: 'member' }),
      }),
    )
    fireEvent.click(screen.getAllByText('编辑账号')[0]!)
    fireEvent.change(screen.getByLabelText('重置密码'), { target: { value: '87654321' } })
    fireEvent.click(screen.getByLabelText('停用账号'))
    fireEvent.click(screen.getByText('保存账号'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    expect(fetcher).toHaveBeenLastCalledWith(
      '/prism-api/user-update',
      expect.objectContaining({
        body: JSON.stringify({
          userId: 'alice',
          role: 'member',
          disabled: true,
          password: '87654321',
        }),
      }),
    )
    fireEvent.click(screen.getAllByText('分配权限')[0]!)
    expect(permissions).toHaveBeenCalledWith('alice')
    fireEvent.change(screen.getByLabelText('账号状态'), { target: { value: 'disabled' } })
    expect(screen.getByText('没有匹配的用户')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('账号状态'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('搜索用户'), { target: { value: 'no-such-user' } })
    expect(screen.getByText('没有匹配的用户')).toBeTruthy()
  })
  it('edits roles with functional and project permissions, while protecting built-in admin', async () => {
    const { fetcher, refresh } = setup()
    render(<PermissionsPage state={teamFixture()} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: /系统管理员/ }))
    expect(screen.getByText('保存角色权限').matches(':disabled')).toBe(true)
    fireEvent.click(screen.getByText('新建角色'))
    fireEvent.change(screen.getByLabelText('角色名称'), { target: { value: '分析师' } })
    fireEvent.change(screen.getByLabelText('角色说明'), { target: { value: '审核门户' } })
    fireEvent.click(screen.getByLabelText('管理用户'))
    fireEvent.click(screen.getByLabelText('门户评估 查看项目'))
    fireEvent.click(screen.getByText('保存角色权限'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(fetcher).toHaveBeenCalledWith(
      '/prism-api/role-save',
      expect.objectContaining({
        body: JSON.stringify({
          name: '分析师',
          description: '审核门户',
          grants: [
            { permission: 'users.manage', resource: '*' },
            { permission: 'project.read', resource: 'p1' },
          ],
        }),
      }),
    )
  })
  it('assigns roles, adds explicit denies and restores inherited user permissions', async () => {
    const { fetcher, refresh } = setup(),
      state = teamFixture()
    state.permissions!.overrides = [
      { user_id: 'alice', permission: 'project.read', resource: 'p1', effect: 'allow' },
    ]
    render(<PermissionsPage state={state} refresh={refresh} initialUser="alice" />)
    fireEvent.click(screen.getByRole('checkbox', { name: /普通用户/ }))
    fireEvent.click(screen.getByText('保存角色分配'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(fetcher).toHaveBeenLastCalledWith(
      '/prism-api/user-roles',
      expect.objectContaining({ body: JSON.stringify({ userId: 'alice', roleIds: [] }) }),
    )
    fireEvent.change(screen.getByLabelText('权限项'), { target: { value: 'project.run' } })
    fireEvent.change(screen.getByLabelText('资源范围'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText('授权方式'), { target: { value: 'deny' } })
    fireEvent.click(screen.getByText('保存例外'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    expect(fetcher).toHaveBeenLastCalledWith(
      '/prism-api/permission-set',
      expect.objectContaining({
        body: JSON.stringify({
          userId: 'alice',
          permission: 'project.run',
          resource: 'p1',
          effect: 'deny',
        }),
      }),
    )
    fireEvent.click(screen.getByText('恢复继承'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3))
    fireEvent.change(screen.getByLabelText('权限项'), { target: { value: 'tools.manage' } })
    expect((screen.getByLabelText('资源范围') as HTMLSelectElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('授权方式'), { target: { value: 'inherit' } })
    fireEvent.click(screen.getByText('保存例外'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(4))
    fireEvent.change(screen.getByLabelText('选择用户'), { target: { value: 'admin' } })
    expect(screen.getByText('保存例外').matches(':disabled')).toBe(true)
  })
  it('surfaces server errors without closing the account editor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: '没有操作权限' }),
      })),
    )
    render(<UsersPage state={teamFixture()} refresh={async () => {}} openPermissions={() => {}} />)
    fireEvent.click(screen.getAllByText('编辑账号')[0]!)
    fireEvent.click(screen.getByText('保存账号'))
    await screen.findByRole('alert')
    expect(screen.getByText('没有操作权限')).toBeTruthy()
    fireEvent.click(screen.getByText('取消'))
    await expect(teamApi('missing')).rejects.toThrow('没有操作权限')
  })
})
