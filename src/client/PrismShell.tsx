import { teamApi, type TeamView } from './team-api.js'
import {
  OverviewPage,
  ProjectsPage,
  UsersPage,
  EmptyState,
  type PageId,
} from './ManagementPages.js'
import { PermissionsPage } from './PermissionsPage.js'
import { NativeScanner } from './NativeScanner.js'
import {
  IconFlatListOutlineMedium,
  IconFolderOpenOutlineMedium,
  IconAgentPresetOutlineMedium,
  IconUsersOutlineMedium,
  IconShieldOutlineMedium,
  IconPlusOutlineMedium,
  IconSearchOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PendingApproval } from '@deepseek-ai/dsh-client-ui-approval/client'
import type { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import { Dashboard, type DashboardRuntime, type ModuleId } from './Dashboard.js'
import { currentSession, isRedteamSession, type SessionId } from './runtime-contract.js'

export interface ShellNavigation {
  openSession(id: SessionId): void | Promise<void>
  startSession(): void
  openDirectory(path: string): Promise<void>
  cancel(id: SessionId): Promise<void>
}
export type PrismShellProps = PropsRuntime<'root'> & {
  runtime: DashboardRuntime
  navigation: ShellNavigation
}

function Questions({
  pending,
  onError,
}: {
  pending: PendingQuestion
  onError(message: string): void
}) {
  const state = useSyncExternalStore(pending.subscribe, pending.getSnapshot)
  const [answers, setAnswers] = useState<Record<string, { selected: string[]; custom: string }>>({})
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        void pending
          .answer({
            answers: pending.questions.map((q) => ({
              id: q.id,
              selected: answers[q.id]?.selected ?? [],
              custom: answers[q.id]?.custom ?? '',
            })),
          })
          .catch((error) => onError(error instanceof Error ? error.message : '提交失败。'))
          .finally(() => setBusy(false))
      }}
    >
      {pending.questions.map((q) => (
        <fieldset key={q.id} disabled={busy || state.closed || state.channel === 'none'}>
          <legend>{q.question}</legend>
          {q.detail && <pre>{q.detail}</pre>}
          {q.options?.map((option) => (
            <label className="prism-question-option" key={option.label}>
              <input
                type={q.multiSelect ? 'checkbox' : 'radio'}
                name={q.id}
                checked={answers[q.id]?.selected.includes(option.label) ?? false}
                onChange={(event) => {
                  pending.engage()
                  setAnswers((previous) => ({
                    ...previous,
                    [q.id]: {
                      custom: previous[q.id]?.custom ?? '',
                      selected: q.multiSelect
                        ? event.target.checked
                          ? [...(previous[q.id]?.selected ?? []), option.label]
                          : (previous[q.id]?.selected ?? []).filter(
                              (label) => label !== option.label,
                            )
                        : [option.label],
                    },
                  }))
                }}
              />
              <span>
                {option.label}
                {option.description && <small>{option.description}</small>}
              </span>
            </label>
          ))}
          <label>
            补充回答
            <textarea
              value={answers[q.id]?.custom ?? ''}
              onChange={(event) => {
                pending.engage()
                setAnswers((previous) => ({
                  ...previous,
                  [q.id]: { selected: previous[q.id]?.selected ?? [], custom: event.target.value },
                }))
              }}
            />
          </label>
        </fieldset>
      ))}
      <button
        type="submit"
        disabled={
          busy ||
          state.closed ||
          state.channel === 'none' ||
          pending.questions.some(
            (q) => !answers[q.id]?.selected.length && !answers[q.id]?.custom.trim(),
          )
        }
      >
        提交回答
      </button>
    </form>
  )
}

function Approval({
  pending,
  onError,
}: {
  pending: PendingApproval
  onError(message: string): void
}) {
  const [busy, setBusy] = useState(false)
  const answer = (decision: 'allowed-once' | 'rejected') => {
    setBusy(true)
    void pending.answer(decision).catch((error) => {
      onError(error instanceof Error ? error.message : '审批失败。')
      setBusy(false)
    })
  }
  return (
    <>
      <h2>工具执行审批</h2>
      <strong>{pending.toolName}</strong>
      <p>
        {pending.displayReason?.zh ??
          pending.reason ??
          pending.displayReason?.en ??
          '请确认本次工具操作。'}
      </p>
      <div className="prism-actions">
        <button disabled={busy || !pending.answerable} onClick={() => answer('rejected')}>
          拒绝
        </button>
        <button disabled={busy || !pending.answerable} onClick={() => answer('allowed-once')}>
          仅允许本次
        </button>
      </div>
    </>
  )
}

export function PrismShell({
  runtime,
  navigation,
  useSessions,
  useSessionStatus,
}: PrismShellProps) {
  const sessions = useSessions((state) => state.byId)
  const selected = currentSession({ byId: sessions })
  const status = useSessionStatus((state) =>
    selected ? state.get(selected.id as Parameters<typeof state.get>[0]) : undefined,
  )
  const pending = status?.pendingInteraction
  const [team, setTeam] = useState<TeamView>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [passwordReminder, setPasswordReminder] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [loadingTask, setLoadingTask] = useState(false)
  const [retry, setRetry] = useState(0)
  const requestVersion = useRef(0)
  const readPage = (): PageId => {
    const value = window.location.hash.slice(1)
    return [
      'overview',
      'projects',
      'workspace',
      'discovery',
      'testing',
      'tools',
      'users',
      'permissions',
    ].includes(value)
      ? (value as PageId)
      : 'workspace'
  }
  const [page, setPage] = useState<PageId>(readPage)
  const [securityOpen, setSecurityOpen] = useState(() => ['testing', 'tools'].includes(readPage()))
  useEffect(() => {
    if (page === 'testing' || page === 'tools') setSecurityOpen(true)
  }, [page])
  const [permissionUser, setPermissionUser] = useState<string>()
  const project = team?.projects.find((row) => row.id === projectId)
  const isModule = ['workspace', 'discovery', 'tools'].includes(page)
  const module: ModuleId =
    page === 'discovery' || page === 'testing' || page === 'tools' ? page : 'project'
  const contextSessions = project ? project.sessions : (team?.personalSessions ?? [])
  const canUse = !!team && (project ? true : team.capabilities.useStandalone)
  const canRun = canUse && project?.role !== 'viewer'
  const currentInContext =
    !!selected && contextSessions.includes(selected.id) && isRedteamSession(selected)
  const go = (next: PageId) => {
    setPage(next)
    window.location.hash = next
  }
  const refreshTeam = async () => {
    const value = await teamApi<TeamView>('state')
    setTeam(value)
    setProjectId((previous) => (value.projects.some((row) => row.id === previous) ? previous : ''))
  }
  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败。')
    } finally {
      setBusy(false)
    }
  }
  const openProject = (id: string) => {
    setProjectId(id)
    go('workspace')
  }
  const startTask = async () => {
    const version = ++requestVersion.current
    const created = await teamApi<{ sessionId: string }>('session-open', {
      ...(projectId ? { projectId } : {}),
      fresh: true,
    })
    await refreshTeam()
    if (version === requestVersion.current) await navigation.openSession(created.sessionId)
  }
  useEffect(() => {
    document.title = '棱镜 · PRISM'
    void fetch('/prism-auth/state')
      .then((response) => response.json())
      .then(
        (state: {
          authenticated?: boolean
          username?: string
          passwordChangeRecommended?: boolean
        }) => {
          if (!state.authenticated) window.location.assign('/login')
          else {
            setUsername(state.username ?? '')
            setPasswordReminder(state.passwordChangeRecommended === true)
          }
        },
      )
      .then(refreshTeam)
      .catch(() => setError('无法读取登录状态，请刷新页面。'))
    const changed = () => setPage(readPage())
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  useEffect(() => {
    const version = ++requestVersion.current
    if (!isModule || !team || !canUse || (project?.role === 'viewer' && !project.sessions.length)) {
      setLoadingTask(false)
      return
    }
    if (currentInContext) {
      setLoadingTask(false)
      return
    }
    setLoadingTask(true)
    setError('')
    void (async () => {
      const opened = await teamApi<{ sessionId: string }>(
        'session-open',
        projectId ? { projectId } : {},
      )
      await refreshTeam()
      if (version === requestVersion.current) await navigation.openSession(opened.sessionId)
    })()
      .catch((cause) => {
        if (version === requestVersion.current)
          setError(cause instanceof Error ? cause.message : '任务打开失败。')
      })
      .finally(() => {
        if (version === requestVersion.current) setLoadingTask(false)
      })
    return () => {
      if (version === requestVersion.current) requestVersion.current++
    }
  }, [isModule, projectId, canUse, retry, navigation])
  const pages = [
    { id: 'overview' as const, label: '工作概览', icon: IconFlatListOutlineMedium },
    { id: 'projects' as const, label: '项目空间', icon: IconFolderOpenOutlineMedium },
  ]
  const modules = [
    { id: 'workspace' as const, label: '任务工作台', icon: IconAgentPresetOutlineMedium },
    { id: 'discovery' as const, label: '资产情况', icon: IconSearchOutlineMedium },
    { id: 'testing' as const, label: '内置扫描', icon: IconShieldOutlineMedium },
    { id: 'tools' as const, label: '工具集成', icon: IconPlusOutlineMedium },
  ]
  const adminPages = [
    ...(team?.capabilities.manageUsers
      ? [{ id: 'users' as const, label: '用户管理', icon: IconUsersOutlineMedium }]
      : []),
    ...(team?.capabilities.managePermissions
      ? [{ id: 'permissions' as const, label: '权限管理', icon: IconShieldOutlineMedium }]
      : []),
  ]
  const pageLabel =
    [...pages, ...modules, ...adminPages].find((row) => row.id === page)?.label ?? '棱镜'
  return (
    <div className="prism-app">
      <aside className="prism-sidebar">
        <a className="prism-brand" href="#workspace" onClick={() => go('workspace')}>
          <span className="prism-brand-icon">
            <IconAgentPresetOutlineMedium />
          </span>
          <span>
            棱镜 <small>PRISM</small>
          </span>
        </a>
        <div className="prism-nav-label">功能模块</div>
        <nav aria-label="棱镜功能导航">
          {modules
            .filter((item) => item.id === 'workspace' || item.id === 'discovery')
            .map((item) => (
              <button
                key={item.id}
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => go(item.id)}
              >
                <item.icon />
                <span>{item.label}</span>
              </button>
            ))}
        </nav>
        <nav aria-label="安全工具导航" className="prism-security-module">
          <button
            className={'prism-nav-group ' + (['testing', 'tools'].includes(page) ? 'active' : '')}
            aria-expanded={securityOpen}
            aria-controls="prism-security-navigation"
            onClick={() => setSecurityOpen((open) => !open)}
          >
            <IconShieldOutlineMedium />
            <span>安全工具</span>
            <span aria-hidden="true" className="prism-nav-chevron">
              ›
            </span>
          </button>
          <div id="prism-security-navigation" className="prism-subnav" hidden={!securityOpen}>
            {modules
              .filter((item) => item.id === 'testing' || item.id === 'tools')
              .map((item) => (
                <button
                  key={item.id}
                  aria-current={page === item.id ? 'page' : undefined}
                  onClick={() => go(item.id)}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </button>
              ))}
          </div>
        </nav>
        <div className="prism-nav-label">工作空间</div>
        <nav aria-label="工作空间导航">
          {pages.map((item) => (
            <button
              key={item.id}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => go(item.id)}
            >
              <item.icon />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {!!adminPages.length && (
          <>
            <div className="prism-nav-label">系统管理</div>
            <nav aria-label="管理导航">
              {adminPages.map((item) => (
                <button
                  key={item.id}
                  aria-current={page === item.id ? 'page' : undefined}
                  onClick={() => {
                    setPermissionUser(undefined)
                    go(item.id)
                  }}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="prism-sidebar-bottom">
          <div className="prism-sidebar-account">
            <span className="prism-avatar">{username.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{username || '加载中'}</strong>
              <small>{team?.user.role === 'admin' ? '系统管理员' : '团队账号'}</small>
            </div>
          </div>
          <div className="prism-account-actions">
            <a href="/login?password=1">修改密码</a>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const response = await fetch('/prism-auth/logout', { method: 'POST' })
                  if (!response.ok) throw new Error('退出失败，请重试。')
                  window.location.assign('/login')
                })
              }
            >
              退出登录
            </button>
          </div>
        </div>
      </aside>
      <main className="prism-main">
        <header className="prism-topbar">
          <span>
            {['testing', 'tools'].includes(page) ? '安全工具' : '棱镜控制台'} <span>/</span>
            <strong>{pageLabel}</strong>
          </span>
          <span className="prism-topbar-caption">安全评估与团队协作</span>
        </header>
        {passwordReminder && (
          <div className="prism-password-note" role="status">
            <span>你正在使用初始密码，建议修改。可以继续使用工作台。</span>
            <a href="/login?password=1">修改密码</a>
            <button onClick={() => setPasswordReminder(false)}>稍后提醒</button>
          </div>
        )}
        {error && (
          <div className="prism-error" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label="关闭提示">
              ×
            </button>
          </div>
        )}
        <div className={'prism-content ' + (isModule ? 'prism-content-workspace' : '')}>
          {!team ? (
            <div className="prism-loading" role="status">
              正在加载工作空间…
            </div>
          ) : (
            <>
              {page === 'overview' && (
                <OverviewPage state={team} navigate={go} openProject={openProject} />
              )}
              {page === 'projects' && (
                <ProjectsPage state={team} refresh={refreshTeam} openProject={openProject} />
              )}
              {page === 'testing' && <NativeScanner team={team} />}
              {page === 'users' &&
                (team.capabilities.manageUsers ? (
                  <UsersPage
                    state={team}
                    refresh={refreshTeam}
                    openPermissions={(id) => {
                      setPermissionUser(id)
                      go('permissions')
                    }}
                  />
                ) : (
                  <EmptyState title="没有用户管理权限" description="请联系管理员分配此功能权限。" />
                ))}
              {page === 'permissions' &&
                (team.capabilities.managePermissions ? (
                  <PermissionsPage
                    state={team}
                    refresh={refreshTeam}
                    {...(permissionUser ? { initialUser: permissionUser } : {})}
                  />
                ) : (
                  <EmptyState title="没有权限管理权限" description="请联系管理员分配此功能权限。" />
                ))}
              {isModule && (
                <>
                  <div className="prism-session-toolbar">
                    <div>
                      <label>
                        查看范围
                        <select
                          aria-label="查看范围"
                          value={projectId}
                          onChange={(event) => {
                            requestVersion.current++
                            setProjectId(event.target.value)
                          }}
                        >
                          <option value="">不关联项目 · 我的任务</option>
                          {team.projects.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        任务记录
                        <select
                          aria-label="任务记录"
                          value={currentInContext ? (selected?.id ?? '') : ''}
                          disabled={loadingTask || !contextSessions.length}
                          onChange={(event) =>
                            void run(async () => {
                              requestVersion.current++
                              await navigation.openSession(event.target.value)
                            })
                          }
                        >
                          <option value="" disabled>
                            {loadingTask ? '正在加载…' : '选择任务记录'}
                          </option>
                          {contextSessions.map((id) => (
                            <option key={id} value={id}>
                              {sessions[id as keyof typeof sessions]?.title || '任务'} ·{' '}
                              {id.slice(-6)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div>
                      <span className="prism-context-hint">
                        {project ? '仅显示所选项目的记录' : '直接使用功能，记录仅自己和管理员可见'}
                      </span>
                      <button
                        className="prism-button primary"
                        disabled={busy || loadingTask || !canRun}
                        onClick={() => void run(startTask)}
                      >
                        <IconPlusOutlineMedium />
                        新任务
                      </button>
                      {status?.running && currentInContext && selected && (
                        <button
                          className="prism-button"
                          disabled={busy || !canRun}
                          onClick={() => void run(() => navigation.cancel(selected.id))}
                        >
                          停止任务
                        </button>
                      )}
                    </div>
                  </div>
                  {loadingTask ? (
                    <div className="prism-loading" role="status">
                      正在打开{pageLabel}…
                    </div>
                  ) : currentInContext ? (
                    <div className="prism-workspace">
                      <fieldset disabled={!canRun} className="prism-reset-fieldset">
                        <Dashboard
                          runtime={runtime}
                          useSessions={useSessions}
                          activeModule={module}
                          showNavigation={false}
                          context={{ name: project?.name ?? '我的独立任务', project: !!project }}
                        />
                      </fieldset>
                    </div>
                  ) : (
                    <div className="prism-page">
                      <section className="prism-surface">
                        <EmptyState
                          title={canUse ? '暂无任务记录' : '暂无此功能使用权限'}
                          description={
                            project?.role === 'viewer'
                              ? '此项目尚无任务记录，你当前具有查看权限。'
                              : canUse
                                ? '任务会自动准备，无需创建项目。打开失败时可以重试。'
                                : '可选择已授权项目，或联系管理员授予独立任务权限。'
                          }
                        >
                          {canRun && (
                            <button
                              className="prism-button"
                              onClick={() => setRetry((value) => value + 1)}
                            >
                              重新打开
                            </button>
                          )}
                        </EmptyState>
                      </section>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
      {pending && currentInContext && (
        <div className="prism-dialog-backdrop">
          <section
            className="prism-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="棱镜待确认操作"
          >
            {pending.kind === 'approval' ? (
              <Approval key={pending.key} pending={pending} onError={setError} />
            ) : (
              <Questions key={pending.key} pending={pending} onError={setError} />
            )}
            {selected && (
              <button
                disabled={busy || !canRun}
                onClick={() => void run(() => navigation.cancel(selected.id))}
              >
                停止任务
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
