import { useEffect, useState } from 'react'
import { teamApi, type TeamView } from '../team-api.js'
import { NativeScanner } from '../NativeScanner.js'
import {
  OverviewPage,
  ProjectsPage,
  UsersPage,
  PageHeading,
  EmptyState,
  type PageId,
} from '../ManagementPages.js'
import { PermissionsPage } from '../PermissionsPage.js'
import {
  IconAgentPresetOutlineMedium,
  IconShieldOutlineMedium,
  IconPlusOutlineMedium,
  IconSearchOutlineMedium,
  IconFolderOpenOutlineMedium,
  IconFlatListOutlineMedium,
  IconUsersOutlineMedium,
} from '../primitives.js'

const modules = [
  { id: 'workspace', label: '任务工作台', icon: IconAgentPresetOutlineMedium },
  { id: 'discovery', label: '资产情况', icon: IconSearchOutlineMedium },
  { id: 'testing', label: '内置扫描', icon: IconShieldOutlineMedium },
  { id: 'tools', label: '工具集成', icon: IconPlusOutlineMedium },
  { id: 'overview', label: '工作概览', icon: IconFlatListOutlineMedium },
  { id: 'projects', label: '项目空间', icon: IconFolderOpenOutlineMedium },
  { id: 'users', label: '用户管理', icon: IconUsersOutlineMedium },
  { id: 'permissions', label: '权限管理', icon: IconShieldOutlineMedium },
] as const
const readPage = (): PageId =>
  modules.find((m) => m.id === location.hash.slice(1))?.id ?? 'workspace'
type PluginInfo = { id: string; name: string; version: string; description: string; status: string }
type Job = {
  id: string
  name: string
  state: string
  kind: string
  targets: string[]
  findingsCount: number
}
type Asset = {
  id: string
  projectId: string | null
  type: string
  value: string
  source: string
  note: string
}

function ToolIntegrations({ onScan }: { onScan(): void }) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void teamApi<{ plugins: PluginInfo[] }>('plugins-list', {})
      .then((v) => {
        if (active) setPlugins(v.plugins)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [])
  return (
    <div className="prism-page">
      <PageHeading
        eyebrow="SECURITY TOOLS / INTEGRATIONS"
        title="工具集成"
        description="查看当前启用的功能插件及其提供的能力。"
      />
      {error && <p role="alert">{error}</p>}
      <div className="prism-project-grid">
        {plugins.map((plugin) => (
          <section className="prism-project-card" key={plugin.id}>
            <div>
              <IconPlusOutlineMedium />
              <span className="prism-tag prism-tag-violet">已启用</span>
            </div>
            <h2>{plugin.name}</h2>
            <p>{plugin.description}</p>
            <footer>
              <span>版本 {plugin.version}</span>
              {plugin.id === 'scanner' && (
                <button className="prism-text-button" onClick={onScan}>
                  打开内置扫描 →
                </button>
              )}
            </footer>
          </section>
        ))}
      </div>
      <section className="prism-surface" style={{ marginTop: 24, padding: 24 }}>
        <h2>外部工具接入</h2>
        <p className="prism-muted">
          原 DSH 的 MCP 连接与 Agent
          工具审批尚未迁移。这里当前展示棱镜已启用的内置插件，外部工具暂不可连接或执行。
        </p>
      </section>
    </div>
  )
}

function Workbench({ projectId, onScan }: { projectId: string; onScan(): void }) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = () => {
      void teamApi<{ jobs: Job[] }>('scan-list', { projectId: projectId || null })
        .then((v) => {
          if (active) {
            setJobs(v.jobs)
            setError('')
          }
        })
        .catch((e) => {
          if (active) setError(e.message)
        })
    }
    load()
    const timer = setInterval(load, 10000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [projectId])
  const labels: Record<string, string> = {
    queued: '排队中',
    running: '执行中',
    completed: '已完成',
    paused: '已暂停',
    cancelled: '已取消',
    interrupted: '已中断',
    failed: '失败',
  }
  return (
    <div className="prism-page">
      <PageHeading
        eyebrow="TASK WORKSPACE"
        title="任务工作台"
        description="查看当前范围的扫描任务；无需创建项目即可开始。"
      >
        <button className="prism-button primary" onClick={onScan}>
          新建扫描
        </button>
      </PageHeading>
      <section className="prism-surface" style={{ padding: 20, marginBottom: 24 }}>
        <strong>Agent 会话迁移中</strong>
        <p className="prism-muted">
          原有 DSH 会话数据已保留，独立版暂不提供 AI 对话、自动资产发现和 MCP
          工具执行。下方为可直接使用的内置扫描任务。
        </p>
      </section>
      {error && <p role="alert">{error}</p>}
      <section className="prism-surface">
        {jobs.length ? (
          <div className="prism-table-scroll">
            <table className="prism-table">
              <thead>
                <tr>
                  <th>任务</th>
                  <th>类型</th>
                  <th>目标</th>
                  <th>状态</th>
                  <th>漏洞</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.name}</td>
                    <td>
                      {{ ports: '网络端口', services: '指纹漏洞', web: 'Web' }[j.kind] ?? j.kind}
                    </td>
                    <td>{j.targets.join(', ')}</td>
                    <td>{labels[j.state] ?? j.state}</td>
                    <td>{j.findingsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="暂无扫描任务"
            description="从内置扫描开始，选择网络端口、端口指纹漏洞或 Web 扫描。"
          >
            <button className="prism-button" onClick={onScan}>
              打开内置扫描
            </button>
          </EmptyState>
        )}
      </section>
    </div>
  )
}

function AssetInventory({ team, projectId }: { team: TeamView; projectId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false)
  const [type, setType] = useState('domain'),
    [value, setValue] = useState(''),
    [source, setSource] = useState(''),
    [note, setNote] = useState(''),
    [query, setQuery] = useState('')
  const canEdit = projectId
    ? ['manager', 'editor'].includes(team.projects.find((p) => p.id === projectId)?.role ?? '')
    : team.capabilities.useStandalone
  useEffect(() => {
    let active = true
    void teamApi<{ assets: Asset[] }>('asset-list', {})
      .then((v) => {
        if (active) setAssets(v.assets)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [])
  const visible = assets.filter(
    (a) =>
      (projectId ? a.projectId === projectId : !a.projectId) &&
      `${a.value} ${a.note}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <div className="prism-page">
      <PageHeading
        eyebrow="ASSET INVENTORY"
        title="资产情况"
        description="保存有来源的资产信息，独立管理或关联项目。"
      >
        <button
          className="prism-button primary"
          disabled={!canEdit}
          onClick={() => setAdding(!adding)}
        >
          登记资产
        </button>
      </PageHeading>
      {error && <p role="alert">{error}</p>}
      {adding && (
        <form
          className="prism-surface prism-scan-form"
          style={{ padding: 24, marginBottom: 24 }}
          onSubmit={(e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            void teamApi('asset-create', {
              projectId: projectId || null,
              type,
              value,
              source,
              note,
            })
              .then(() => teamApi<{ assets: Asset[] }>('asset-list', {}))
              .then((v) => {
                setAssets(v.assets)
                setAdding(false)
                setValue('')
                setSource('')
                setNote('')
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false))
          }}
        >
          <div className="prism-scan-form-grid">
            <label>
              资产类型
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries({
                  domain: '域名',
                  ip: 'IP 地址',
                  url: 'URL',
                  service: '服务',
                  organization: '组织',
                }).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              资产值
              <input
                required
                maxLength={512}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <label>
              来源链接
              <input
                type="url"
                required
                maxLength={2048}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </label>
            <label>
              说明
              <input maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <button className="prism-button primary" disabled={busy || !canEdit}>
            保存资产
          </button>
        </form>
      )}
      <div className="prism-list-toolbar">
        <label className="prism-search">
          <IconSearchOutlineMedium />
          <input
            aria-label="搜索资产"
            placeholder="搜索资产或说明"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="prism-muted">{visible.length} 项资产</span>
      </div>
      <section className="prism-surface">
        {visible.length ? (
          <div className="prism-table-scroll">
            <table className="prism-table">
              <thead>
                <tr>
                  <th>资产</th>
                  <th>类型</th>
                  <th>来源</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id}>
                    <td>{a.value}</td>
                    <td>{a.type}</td>
                    <td>
                      <a href={a.source} target="_blank" rel="noreferrer">
                        查看来源
                      </a>
                    </td>
                    <td>{a.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="暂无资产记录"
            description="可以直接登记资产，无需先创建项目。旧 Agent 资产图保留在原数据目录中，尚未导入此台账。"
          />
        )}
      </section>
    </div>
  )
}

export function App() {
  const [page, setPage] = useState<PageId>(readPage),
    [securityOpen, setSecurityOpen] = useState(() => ['testing', 'tools'].includes(readPage())),
    [team, setTeam] = useState<TeamView>(),
    [error, setError] = useState(''),
    [reminder, setReminder] = useState(false),
    [projectId, setProjectId] = useState(''),
    [permissionUser, setPermissionUser] = useState<string>()
  const refresh = async () => {
    setTeam(await teamApi<TeamView>('state'))
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message))
    void fetch('/prism-auth/state')
      .then((r) => r.json())
      .then((v) => setReminder(v.passwordChangeRecommended === true))
      .catch(() => {})
    const handler = () => setPage(readPage())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  useEffect(() => {
    if (page === 'testing' || page === 'tools') setSecurityOpen(true)
  }, [page])
  const go = (id: PageId) => {
    setPage(id)
    location.hash = id
  }
  const button = (id: PageId) => {
    const item = modules.find((m) => m.id === id)!
    return (
      <button key={id} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
        <item.icon />
        <span>{item.label}</span>
      </button>
    )
  }
  const openProject = (id: string) => {
    setProjectId(id)
    go('workspace')
  }
  return (
    <div className="prism-app">
      <aside className="prism-sidebar">
        <a className="prism-brand" href="#workspace">
          <span className="prism-brand-icon">
            <IconAgentPresetOutlineMedium />
          </span>
          <span>
            棱镜<small>PRISM</small>
          </span>
        </a>
        <div className="prism-nav-label">功能模块</div>
        <nav aria-label="棱镜功能导航">
          {button('workspace')}
          {button('discovery')}
        </nav>
        <nav aria-label="安全工具导航" className="prism-security-module">
          <button
            className={'prism-nav-group ' + (['testing', 'tools'].includes(page) ? 'active' : '')}
            aria-expanded={securityOpen}
            aria-controls="prism-security-navigation"
            onClick={() => setSecurityOpen(!securityOpen)}
          >
            <IconShieldOutlineMedium />
            <span>安全工具</span>
            <span aria-hidden="true" className="prism-nav-chevron">
              ›
            </span>
          </button>
          <div className="prism-subnav" id="prism-security-navigation" hidden={!securityOpen}>
            {button('testing')}
            {button('tools')}
          </div>
        </nav>
        <div className="prism-nav-label">工作空间</div>
        <nav aria-label="工作空间导航">
          {button('overview')}
          {button('projects')}
        </nav>
        {(team?.capabilities.manageUsers || team?.capabilities.managePermissions) && (
          <>
            <div className="prism-nav-label">系统管理</div>
            <nav aria-label="管理导航">
              {team.capabilities.manageUsers && button('users')}
              {team.capabilities.managePermissions && button('permissions')}
            </nav>
          </>
        )}
        <div className="prism-sidebar-bottom">
          <div className="prism-sidebar-account">
            <span className="prism-avatar">{team?.user.username[0]?.toUpperCase()}</span>
            <div>
              <strong>{team?.user.username ?? '加载中'}</strong>
              <small>{team?.user.role === 'admin' ? '系统管理员' : '团队账号'}</small>
            </div>
          </div>
          <div className="prism-account-actions">
            <a href="/login?password=1">修改密码</a>
            <button
              onClick={() => {
                void fetch('/prism-auth/logout', { method: 'POST' })
                  .then((r) => {
                    if (!r.ok) throw new Error('退出失败')
                    location.assign('/login')
                  })
                  .catch((e) => setError(e.message))
              }}
            >
              退出登录
            </button>
          </div>
        </div>
      </aside>
      <main className="prism-main">
        <header className="prism-topbar">
          <span>
            {['testing', 'tools'].includes(page) ? '安全工具' : '棱镜控制台'}
            <span>/</span>
            <strong>{modules.find((m) => m.id === page)?.label}</strong>
          </span>
          <span className="prism-topbar-caption">独立运行 · PRISM</span>
        </header>
        {reminder && (
          <div className="prism-password-note" role="status">
            <span>你正在使用初始密码，建议修改。可以继续使用工作台。</span>
            <a href="/login?password=1">修改密码</a>
            <button onClick={() => setReminder(false)}>稍后提醒</button>
          </div>
        )}
        {error && (
          <div role="alert" className="prism-error">
            {error}
            <button onClick={() => setError('')}>关闭</button>
          </div>
        )}
        {team && ['workspace', 'discovery'].includes(page) && (
          <div className="prism-session-toolbar">
            <label>
              查看范围{' '}
              <select
                className="prism-select"
                aria-label="查看范围"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">我的独立工作</option>
                {team.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="prism-content">
          {!team ? (
            <div className="prism-loading">正在加载…</div>
          ) : (
            <>
              {page === 'testing' && <NativeScanner team={team} />}
              {page === 'tools' && <ToolIntegrations onScan={() => go('testing')} />}
              {page === 'workspace' && (
                <Workbench key={projectId} projectId={projectId} onScan={() => go('testing')} />
              )}
              {page === 'discovery' && (
                <AssetInventory key={projectId} team={team} projectId={projectId} />
              )}
              {page === 'overview' && (
                <OverviewPage state={team} navigate={go} openProject={openProject} />
              )}
              {page === 'projects' && (
                <ProjectsPage state={team} refresh={refresh} openProject={openProject} />
              )}
              {page === 'users' && team.capabilities.manageUsers && (
                <UsersPage
                  state={team}
                  refresh={refresh}
                  openPermissions={(id) => {
                    setPermissionUser(id)
                    go('permissions')
                  }}
                />
              )}
              {page === 'permissions' && team.capabilities.managePermissions && (
                <PermissionsPage
                  state={team}
                  refresh={refresh}
                  {...(permissionUser ? { initialUser: permissionUser } : {})}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
