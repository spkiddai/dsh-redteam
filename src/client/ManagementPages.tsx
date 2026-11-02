import { useState, type ReactNode } from 'react'
import {
  IconFolderOpenOutlineMedium,
  IconPlusOutlineMedium,
  IconUsersOutlineMedium,
  IconShieldOutlineMedium,
  IconChevronRightOutlineMedium,
  IconSearchOutlineMedium,
} from './primitives.js'
import { teamApi, type TeamAccount, type TeamView } from './team-api.js'
export type PageId =
  | 'overview'
  | 'projects'
  | 'workspace'
  | 'discovery'
  | 'testing'
  | 'tools'
  | 'users'
  | 'permissions'
export const PROJECT_ROLE = { manager: '管理权限', editor: '执行权限', viewer: '查看权限' }
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="prism-page-heading">
      <div>
        <span className="prism-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="prism-heading-actions">{children}</div>
    </div>
  )
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="prism-empty-state">
      <IconFolderOpenOutlineMedium />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  )
}
export function AccountRoles({ user, state }: { user: TeamAccount; state: TeamView }) {
  return (
    <div className="prism-tags">
      {user.roleIds.map((id) => (
        <span className={'prism-tag ' + (id === 'admin' ? 'prism-tag-violet' : '')} key={id}>
          {state.roles.find((role) => role.id === id)?.name ?? id}
        </span>
      ))}
      {!user.roleIds.length && <span className="prism-muted">未分配角色</span>}
    </div>
  )
}
export function OverviewPage({
  state,
  navigate,
  openProject,
}: {
  state: TeamView
  navigate(page: PageId): void
  openProject(id: string): void
}) {
  const sessions = state.projects.reduce(
    (sum, project) => sum + project.sessions.length,
    state.personalSessions.length,
  )
  return (
    <div className="prism-page">
      <PageHeading
        eyebrow="WORKSPACE OVERVIEW"
        title="工作概览"
        description="项目、评估与团队权限，在这里有序开展。"
      >
        {state.capabilities.createProject && (
          <button className="prism-button primary" onClick={() => navigate('projects')}>
            <IconPlusOutlineMedium />
            创建项目
          </button>
        )}
      </PageHeading>
      <div className="prism-stats">
        <div className="prism-stat">
          <span>
            <IconFolderOpenOutlineMedium />
            可访问项目
          </span>
          <strong>
            {state.projects.length}
            <small>个</small>
          </strong>
          <p>按当前账号权限展示</p>
        </div>
        <div className="prism-stat">
          <span>
            <IconShieldOutlineMedium />
            任务记录
          </span>
          <strong>
            {sessions}
            <small>个</small>
          </strong>
          <p>独立任务与可访问项目的记录</p>
        </div>
        <div className="prism-stat">
          <span>
            <IconUsersOutlineMedium />
            {state.capabilities.manageUsers ? '团队用户' : '当前身份'}
          </span>
          <strong>
            {state.capabilities.manageUsers ? state.users.length : '普通用户'}
            {state.capabilities.manageUsers && <small>位</small>}
          </strong>
          <p>账号独立管理，权限按需分配</p>
        </div>
      </div>
      <div className="prism-overview-grid">
        <section className="prism-surface">
          <div className="prism-surface-heading">
            <div>
              <h2>项目空间</h2>
              <p>选择一个项目，继续安全评估。</p>
            </div>
            <button className="prism-text-button" onClick={() => navigate('projects')}>
              查看全部
              <IconChevronRightOutlineMedium />
            </button>
          </div>
          {state.projects.length ? (
            <div className="prism-project-list">
              {state.projects.slice(0, 6).map((project) => (
                <button key={project.id} onClick={() => openProject(project.id)}>
                  <span className="prism-resource-icon">
                    <IconFolderOpenOutlineMedium />
                  </span>
                  <span>
                    <strong>{project.name}</strong>
                    <small>
                      {project.sessions.length} 个会话 · {PROJECT_ROLE[project.role]}
                    </small>
                  </span>
                  <IconChevronRightOutlineMedium />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="按需创建项目"
              description={
                state.capabilities.createProject
                  ? '项目用于归档和协作；也可以直接从左侧使用功能，无需创建项目。'
                  : '暂无可访问项目，请联系管理员分配项目权限。'
              }
            >
              {state.capabilities.createProject && (
                <button className="prism-button" onClick={() => navigate('projects')}>
                  前往创建项目
                </button>
              )}
            </EmptyState>
          )}
        </section>
        <aside className="prism-surface prism-quick-panel">
          <h2>管理与协作</h2>
          <p>账号、角色和项目各自独立，通过权限连接。</p>
          {state.capabilities.manageUsers && (
            <button onClick={() => navigate('users')}>
              <IconUsersOutlineMedium />
              <span>
                <strong>用户管理</strong>
                <small>账号状态与密码管理</small>
              </span>
              <IconChevronRightOutlineMedium />
            </button>
          )}
          {state.capabilities.managePermissions && (
            <button onClick={() => navigate('permissions')}>
              <IconShieldOutlineMedium />
              <span>
                <strong>权限管理</strong>
                <small>角色授权与用户例外</small>
              </span>
              <IconChevronRightOutlineMedium />
            </button>
          )}
          <div className="prism-info-note">
            <strong>项目是一类资源</strong>
            <p>查看、执行与管理权限可独立授予。无需加入项目即可拥有账号。</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
export function ProjectsPage({
  state,
  refresh,
  openProject,
}: {
  state: TeamView
  refresh(): Promise<void>
  openProject(id: string): void
}) {
  const [search, setSearch] = useState(''),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const projects = state.projects.filter((project) =>
    project.name.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <div className="prism-page">
      <PageHeading
        eyebrow="PROJECT RESOURCES"
        title="项目空间"
        description="独立的评估资源。项目访问由角色权限和单独授权决定。"
      >
        {state.capabilities.createProject && (
          <button className="prism-button primary" onClick={() => setCreating(true)}>
            <IconPlusOutlineMedium />
            新建项目
          </button>
        )}
      </PageHeading>
      <div className="prism-list-toolbar">
        <label className="prism-search">
          <IconSearchOutlineMedium />
          <input
            aria-label="搜索项目"
            placeholder="搜索项目名称…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className="prism-muted">{projects.length} 个项目</span>
      </div>
      {projects.length ? (
        <div className="prism-project-grid">
          {projects.map((project) => (
            <article className="prism-project-card" key={project.id}>
              <div>
                <span className="prism-resource-icon">
                  <IconFolderOpenOutlineMedium />
                </span>
                <span className="prism-tag">{PROJECT_ROLE[project.role]}</span>
              </div>
              <h2>{project.name}</h2>
              <p>{project.sessions.length} 个评估会话</p>
              <footer>
                <span>创建人 {project.createdBy}</span>
                <button className="prism-text-button" onClick={() => openProject(project.id)}>
                  进入工作台
                  <IconChevronRightOutlineMedium />
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <section className="prism-surface">
          <EmptyState
            title={search ? '没有匹配的项目' : '暂无可访问项目'}
            description="可以创建新项目，或由管理员分配已有项目的访问权限。"
          />
        </section>
      )}
      {creating && (
        <div className="prism-dialog-backdrop">
          <section
            className="prism-dialog prism-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="新建项目"
          >
            <h2>新建项目</h2>
            <p>项目只包含评估资源，不需要绑定用户。</p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const name = String(new FormData(event.currentTarget).get('name'))
                setBusy(true)
                setError('')
                void teamApi<{ id: string }>('project-create', { name })
                  .then(async (created) => {
                    await refresh()
                    setCreating(false)
                    openProject(created.id)
                  })
                  .catch((cause) => setError(cause.message))
                  .finally(() => setBusy(false))
              }}
            >
              <label>
                项目名称
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="例如：官网安全评估"
                  autoFocus
                />
              </label>
              {error && (
                <p role="alert" className="prism-form-error">
                  {error}
                </p>
              )}
              <div className="prism-actions">
                <button
                  type="button"
                  className="prism-button"
                  disabled={busy}
                  onClick={() => setCreating(false)}
                >
                  取消
                </button>
                <button className="prism-button primary" disabled={busy}>
                  {busy ? '创建中…' : '创建项目'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
export function UsersPage({
  state,
  refresh,
  openPermissions,
}: {
  state: TeamView
  refresh(): Promise<void>
  openPermissions(id: string): void
}) {
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [editing, setEditing] = useState<TeamAccount | 'new'>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const users = state.users.filter(
    (user) =>
      user.username.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || (filter === 'disabled') === user.disabled),
  )
  return (
    <div className="prism-page">
      <PageHeading
        eyebrow="IDENTITY & ACCOUNTS"
        title="用户管理"
        description="管理独立账号、登录状态与密码。角色和资源授权在权限管理中配置。"
      >
        <button
          className="prism-button primary"
          onClick={() => {
            setEditing('new')
            setError('')
          }}
        >
          <IconPlusOutlineMedium />
          添加用户
        </button>
      </PageHeading>
      <section className="prism-surface">
        <div className="prism-list-toolbar">
          <label className="prism-search">
            <IconSearchOutlineMedium />
            <input
              aria-label="搜索用户"
              placeholder="搜索账号…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            className="prism-select"
            aria-label="账号状态"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已停用</option>
          </select>
          <span className="prism-muted">{users.length} 位用户</span>
        </div>
        <div className="prism-table-scroll">
          <table className="prism-table">
            <thead>
              <tr>
                <th>用户账号</th>
                <th>分配角色</th>
                <th>账号状态</th>
                <th>授权方式</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="prism-user-cell">
                      <span className="prism-avatar">
                        {user.username.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{user.username}</strong>
                        {user.id === state.user.id && <small>当前账号</small>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <AccountRoles user={user} state={state} />
                  </td>
                  <td>
                    <span className={'prism-status ' + (user.disabled ? 'muted' : 'positive')}>
                      {user.disabled ? '已停用' : '已启用'}
                    </span>
                  </td>
                  <td className="prism-muted">
                    {user.role === 'admin'
                      ? '系统完整权限'
                      : state.permissions?.overrides.some((row) => row.user_id === user.id)
                        ? '角色 + 用户例外'
                        : '角色继承'}
                  </td>
                  <td>
                    <div className="prism-row-actions">
                      <button
                        onClick={() => {
                          setEditing(user)
                          setError('')
                        }}
                      >
                        编辑账号
                      </button>
                      {state.capabilities.managePermissions && (
                        <button onClick={() => openPermissions(user.id)}>分配权限</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!users.length && (
          <EmptyState title="没有匹配的用户" description="调整搜索条件，或添加一个新账号。" />
        )}
      </section>
      {editing && (
        <div className="prism-dialog-backdrop">
          <section
            className="prism-dialog prism-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={editing === 'new' ? '添加用户' : '编辑账号'}
          >
            <h2>{editing === 'new' ? '添加用户' : '编辑账号'}</h2>
            <p>无需选择项目，账号创建后可单独分配权限。</p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                setBusy(true)
                setError('')
                const password = String(data.get('password'))
                void teamApi(
                  editing === 'new' ? 'user-create' : 'user-update',
                  editing === 'new'
                    ? { username: String(data.get('username')), password, role: 'member' }
                    : {
                        userId: editing.id,
                        role: editing.role,
                        disabled: data.has('disabled'),
                        ...(password ? { password } : {}),
                      },
                )
                  .then(async () => {
                    await refresh()
                    setEditing(undefined)
                  })
                  .catch((cause) => setError(cause.message))
                  .finally(() => setBusy(false))
              }}
            >
              <label>
                账号
                <input
                  name="username"
                  autoComplete="off"
                  defaultValue={editing === 'new' ? '' : editing.username}
                  disabled={editing !== 'new'}
                  required
                  minLength={2}
                  maxLength={64}
                  autoFocus
                />
              </label>
              <label>
                {editing === 'new' ? '初始密码' : '重置密码'}
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required={editing === 'new'}
                  minLength={8}
                  maxLength={128}
                  placeholder={editing === 'new' ? '至少 8 位' : '留空则保留原密码，至少 8 位'}
                />
              </label>
              {editing !== 'new' && (
                <label className="prism-check-label">
                  <input name="disabled" type="checkbox" defaultChecked={editing.disabled} />
                  停用账号
                </label>
              )}
              <div className="prism-info-note">
                新账号默认分配“普通用户”角色。可在权限管理中增加角色或配置例外权限。
              </div>
              {error && (
                <p role="alert" className="prism-form-error">
                  {error}
                </p>
              )}
              <div className="prism-actions">
                <button
                  type="button"
                  className="prism-button"
                  disabled={busy}
                  onClick={() => setEditing(undefined)}
                >
                  取消
                </button>
                <button className="prism-button primary" disabled={busy}>
                  {busy ? '保存中…' : '保存账号'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
