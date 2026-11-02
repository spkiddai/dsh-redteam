import { useEffect, useRef, useState } from 'react'
import type {
  ScanCatalog,
  ScanComparison,
  ScanFinding,
  ScanJob,
  ScanSummary,
} from '../lib/native-scan-types.js'
import { scanReport, SCAN_STATE_LABEL, SCAN_SEVERITY_LABEL } from '../lib/native-report.js'
import { teamApi, type TeamView } from './team-api.js'
import { COMMON_TCP_PORTS, completedScanChecks, totalScanChecks } from '../lib/native-scan-types.js'
import { PortResults } from './PortResults.js'
import { ServiceResults } from './ServiceResults.js'
import {
  SCAN_KIND_LABEL,
  SERVICE_MODE_LABEL,
  type ScanKind,
  type ServiceProbeMode,
} from '../lib/native-scan-types.js'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const live = (job: Pick<ScanJob, 'state'>) => ['queued', 'running'].includes(job.state)

export function NativeScanner({ team }: { team: TeamView }) {
  const [catalog, setCatalog] = useState<ScanCatalog>()
  const [jobs, setJobs] = useState<ScanSummary[]>([])
  const [selected, setSelected] = useState('')
  const [job, setJob] = useState<ScanJob>()
  const [projectId, setProjectId] = useState('')
  const [tab, setTab] = useState<'jobs' | 'rules'>('jobs')
  const [creating, setCreating] = useState(true)
  const [kind, setKind] = useState<ScanKind>('web')
  const [serviceMode, setServiceMode] = useState<ServiceProbeMode>('auto')
  const [servicePorts, setServicePorts] = useState('21,22,25,80,443,3306,6379,8080,8443')
  const [drafts, setDrafts] = useState({
    web: { name: 'Web 安全检查', targets: '', timeoutMs: 5000, delayMs: 500 },
    ports: { name: '网络端口扫描', targets: '', timeoutMs: 2000, delayMs: 500 },
    services: { name: '端口指纹漏洞扫描', targets: '', timeoutMs: 3000, delayMs: 500 },
  })
  const { name, targets, timeoutMs, delayMs } = drafts[kind]
  const updateDraft = (patch: Partial<typeof drafts.web>) =>
    setDrafts((previous) => ({ ...previous, [kind]: { ...previous[kind], ...patch } }))
  const [ports, setPorts] = useState(COMMON_TCP_PORTS)
  const [concurrency, setConcurrency] = useState(16)
  const [profile, setProfile] = useState<'quick' | 'standard' | 'custom'>('standard')
  const [ruleIds, setRuleIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')
  const [severity, setSeverity] = useState('all')
  const [detail, setDetail] = useState<ScanFinding>()
  const [note, setNote] = useState('')
  const [disposition, setDisposition] = useState<ScanFinding['state']>('open')
  const [ruleText, setRuleText] = useState('')
  const [comparison, setComparison] = useState<ScanComparison>()
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyKind, setHistoryKind] = useState('all')
  const [historyState, setHistoryState] = useState('all')
  const [formFocus, setFormFocus] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const showForm = () => {
    setCreating(true)
    setTab('jobs')
    setFormFocus((value) => value + 1)
  }
  useEffect(() => {
    if (formFocus) {
      formRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
      formRef.current
        ?.querySelector<HTMLTextAreaElement>('textarea')
        ?.focus({ preventScroll: true })
    }
  }, [formFocus])
  const generation = useRef(0)
  const reads = useRef(0)
  const detailReads = useRef(0)
  const busyRef = useRef(false)
  const nextPoll = useRef(0)
  const catalogAt = useRef(0)
  const selectedRef = useRef(selected)
  const jobRef = useRef(job)
  jobRef.current = job
  selectedRef.current = selected
  const canRun =
    !!catalog?.canRun &&
    (!projectId
      ? team.capabilities.useStandalone
      : team.projects.find((p) => p.id === projectId)?.role !== 'viewer')
  const run = async (operation: () => Promise<void>) => {
    busyRef.current = true
    reads.current++
    detailReads.current++
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败。')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const refresh = async (epoch = generation.current, force = true) => {
    const read = ++reads.current
    const reloadRules = force || Date.now() - catalogAt.current >= 30000
    const [list, rules] = await Promise.all([
      teamApi<{ jobs: ScanSummary[] }>('scan-list', { projectId }),
      reloadRules ? teamApi<ScanCatalog>('scan-catalog', {}) : Promise.resolve(undefined),
    ])
    if (epoch !== generation.current || read !== reads.current) return
    setJobs(list.jobs)
    if (rules) {
      setCatalog(rules)
      catalogAt.current = Date.now()
    }
    nextPoll.current = Date.now() + (list.jobs.some(live) ? 2500 : 30000)
    const id = selectedRef.current
    if (
      id &&
      (force ||
        reloadRules ||
        (jobRef.current && live(jobRef.current)) ||
        list.jobs.some((row) => row.id === id && live(row)))
    ) {
      const detailRead = ++detailReads.current
      const result = await teamApi<{ job: ScanJob }>('scan-get', { id })
      if (
        epoch === generation.current &&
        id === selectedRef.current &&
        detailRead === detailReads.current
      )
        setJob(result.job)
    }
  }
  useEffect(() => {
    const epoch = ++generation.current
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>
    let pending = false
    catalogAt.current = 0
    nextPoll.current = 0
    const poll = async () => {
      if (pending || cancelled) return
      clearTimeout(timer)
      pending = true
      try {
        if (!document.hidden && !busyRef.current && Date.now() >= nextPoll.current)
          await refresh(epoch, false)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '读取失败。')
      }
      pending = false
      if (!cancelled) timer = setTimeout(() => void poll(), 2500)
    }
    const visible = () => {
      if (!document.hidden) {
        nextPoll.current = 0
        catalogAt.current = 0
        void poll()
      }
    }
    document.addEventListener('visibilitychange', visible)
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', visible)
      generation.current++
    }
  }, [projectId])
  const open = async (id: string) => {
    selectedRef.current = id
    setSelected(id)
    setJob(undefined)
    setComparison(undefined)
    setDetail(undefined)
    const epoch = generation.current
    const read = ++detailReads.current
    const result = await teamApi<{ job: ScanJob }>('scan-get', { id })
    if (epoch === generation.current && selectedRef.current === id && read === detailReads.current)
      setJob(result.job)
  }
  const control = (command: string) =>
    run(async () => {
      const result = await teamApi<{ job: ScanJob }>('scan-control', { id: job!.id, command })
      setJob(result.job)
      await refresh()
    })
  const findingRows = (job?.findings ?? []).filter(
    (f) =>
      (severity === 'all' || f.severity === severity) &&
      `${f.title} ${f.target} ${f.ruleId}`.toLowerCase().includes(filter.toLowerCase()),
  )
  const catalogRows = (catalog?.rules ?? []).filter((r) =>
    `${r.title} ${r.id} ${r.family}`.toLowerCase().includes(filter.toLowerCase()),
  )
  const activeRules =
    catalog?.rules.filter((r) =>
      profile === 'custom'
        ? ruleIds.includes(r.id)
        : profile === 'quick'
          ? r.family !== 'exposure'
          : true,
    ) ?? []
  const historyRows = jobs.filter(
    (row) =>
      (historyKind === 'all' || (row.kind ?? 'web') === historyKind) &&
      (historyState === 'all' || row.state === historyState) &&
      `${row.name} ${row.targets.join(' ')}`
        .toLowerCase()
        .includes(historyQuery.trim().toLowerCase()),
  )
  return (
    <div className="prism-page prism-scanner">
      <div className="prism-page-heading">
        <div>
          <span className="prism-eyebrow">VULNERABILITY SCANNER</span>
          <h1>内置扫描</h1>
          <p>直接输入目标，执行检测并跟踪修复。项目关联可选。</p>
        </div>
        <button className="prism-button primary" disabled={!canRun || busy} onClick={showForm}>
          ＋ 新建扫描
        </button>
      </div>
      {error && (
        <div role="alert" className="prism-error">
          {error}
          <button aria-label="关闭扫描提示" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      <div className="prism-scan-summary">
        <div>
          <small>当前任务</small>
          <strong>{jobs.length}</strong>
        </div>
        <div>
          <small>执行中</small>
          <strong>{jobs.filter(live).length}</strong>
        </div>
        <div>
          <small>原生检测规则</small>
          <strong>
            {catalog ? catalog.rules.length + (catalog.serviceRules?.length ?? 0) : '—'}
          </strong>
        </div>
        <div>
          <small>扫描协议</small>
          <strong className="protocol">TCP / HTTP / TLS</strong>
        </div>
      </div>
      <div className="prism-scan-toolbar">
        <div role="tablist" aria-label="扫描视图">
          <button
            role="tab"
            aria-selected={tab === 'jobs'}
            onClick={() => {
              setTab('jobs')
              setFilter('')
            }}
          >
            扫描与发现
          </button>
          <button
            role="tab"
            aria-selected={tab === 'rules'}
            onClick={() => {
              setTab('rules')
              setFilter('')
            }}
          >
            检测规则
          </button>
        </div>
        <label>
          查看范围{' '}
          <select
            aria-label="扫描查看范围"
            disabled={busy}
            value={projectId}
            onChange={(e) => {
              generation.current++
              selectedRef.current = ''
              setSelected('')
              setJob(undefined)
              setJobs([])
              setDetail(undefined)
              setComparison(undefined)
              setProjectId(e.target.value)
            }}
          >
            <option value="">{team.user.role === 'admin' ? '全部独立扫描' : '我的独立扫描'}</option>
            {team.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tab === 'jobs' && (
        <>
          {creating && (
            <form
              ref={formRef}
              className="prism-surface prism-scan-form"
              onSubmit={(event) => {
                event.preventDefault()
                void run(async () => {
                  const result = await teamApi<{ job: ScanJob }>('scan-create', {
                    name,
                    kind,
                    ...(kind === 'ports' ? { ports, concurrency } : {}),
                    ...(kind === 'services' ? { ports: servicePorts, serviceMode } : {}),
                    targets: targets
                      .split(/\r?\n/)
                      .map((v) => v.trim())
                      .filter(Boolean),
                    projectId: projectId || null,
                    profile: kind === 'services' ? 'standard' : profile,
                    ...(kind === 'web' && profile === 'custom' ? { ruleIds } : {}),
                    timeoutMs,
                    delayMs,
                  })
                  selectedRef.current = result.job.id
                  setSelected(result.job.id)
                  setJob(result.job)
                  setCreating(false)
                  setComparison(undefined)
                  await refresh()
                })
              }}
            >
              <div className="prism-scan-section-title">
                <h2>新建扫描</h2>
                <button
                  type="button"
                  className="prism-text-button"
                  onClick={() => setCreating(false)}
                >
                  收起
                </button>
              </div>
              <fieldset className="prism-scan-kind">
                <legend>扫描类型</legend>
                {Object.entries(SCAN_KIND_LABEL).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      aria-label={label}
                      name="scan-kind"
                      value={value}
                      checked={kind === value}
                      onChange={() => {
                        setKind(value as ScanKind)
                      }}
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {
                          {
                            ports: '发现开放端口，不发送应用层探测',
                            services: '识别服务指纹，检查协议与配置风险',
                            web: '检查 URL 路径、Web 暴露与证书',
                          }[value as ScanKind]
                        }
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="prism-scan-form-grid">
                <label>
                  扫描名称
                  <input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => updateDraft({ name: e.target.value })}
                  />
                </label>
                {kind === 'web' && (
                  <label>
                    检测策略
                    <select
                      value={profile}
                      onChange={(e) => setProfile(e.target.value as typeof profile)}
                    >
                      <option value="quick">快速基线 · 响应配置与证书</option>
                      <option value="standard">标准检查 · 基线与公开暴露</option>
                      <option value="custom">自定义 · 选择规则</option>
                    </select>
                  </label>
                )}
                {kind === 'ports' && (
                  <label>
                    并发连接数
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={concurrency}
                      onChange={(e) => setConcurrency(Number(e.target.value))}
                    />
                  </label>
                )}
                {kind === 'services' && (
                  <label>
                    服务探测方式
                    <select
                      value={serviceMode}
                      onChange={(e) => setServiceMode(e.target.value as ServiceProbeMode)}
                    >
                      {Object.entries(SERVICE_MODE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <label>
                {kind !== 'web' ? '目标 IP / 域名' : '目标 URL'}{' '}
                <span className="prism-muted">每行一个，最多 20 个</span>
                <textarea
                  required
                  rows={3}
                  placeholder={
                    kind !== 'web'
                      ? '192.168.1.10\nserver.example.com'
                      : 'https://example.com/\nhttps://example.com/app/'
                  }
                  value={targets}
                  onChange={(e) => updateDraft({ targets: e.target.value })}
                />
              </label>
              {kind !== 'web' && (
                <label>
                  端口列表或范围
                  <input
                    required
                    aria-label="端口列表或范围"
                    value={kind === 'services' ? servicePorts : ports}
                    onChange={(e) =>
                      kind === 'services'
                        ? setServicePorts(e.target.value)
                        : setPorts(e.target.value)
                    }
                    placeholder="22,80,443,8000-8100"
                  />
                  {kind === 'ports' && (
                    <span className="prism-port-presets">
                      <button type="button" onClick={() => setPorts(COMMON_TCP_PORTS)}>
                        常用端口
                      </button>
                      <button type="button" onClick={() => setPorts('1-1024')}>
                        1–1024
                      </button>
                    </span>
                  )}
                  <small>
                    {kind === 'services'
                      ? '每次最多 128 个目标 × 端口组合。自动模式对常用 HTTP、TLS、Redis 端口发送有限探测；其他端口读取问候语。非标准端口可指定协议。'
                      : '支持 1–65535 范围内的端口；每次最多 4096 个目标 × 端口组合。无需 Web 检测规则。'}
                  </small>
                </label>
              )}
              <p className="prism-muted">
                {kind === 'ports'
                  ? '执行 TCP 连接探测，不发送应用层请求。'
                  : kind === 'services'
                    ? '服务识别使用有界匿名请求；不尝试密码，不写入服务数据。'
                    : '只检查所填 URL 路径及其下级路径，不跟随重定向。'}
                {catalog?.canScanInternal ? '当前账号可扫描内网地址。' : '内网扫描需要单独授权。'}
                本机与保留地址不开放扫描。
              </p>
              {kind === 'services' && (
                <p className="prism-muted">
                  当前识别 SSH、FTP、SMTP、MySQL、Redis、HTTP 和 TLS；内置检查 SSH 旧协议、Redis
                  匿名服务信息暴露及 TLS 证书风险。未支持的服务显示为未识别。
                </p>
              )}
              {kind === 'web' && profile === 'custom' && (
                <div className="prism-rule-picker">
                  {catalog?.rules.map((r) => (
                    <label key={r.id}>
                      <input
                        type="checkbox"
                        checked={ruleIds.includes(r.id)}
                        onChange={(e) =>
                          setRuleIds((previous) =>
                            e.target.checked
                              ? [...previous, r.id]
                              : previous.filter((id) => id !== r.id),
                          )
                        }
                      />
                      {r.title}
                    </label>
                  ))}
                </div>
              )}
              <details>
                <summary>请求设置</summary>
                <div className="prism-scan-form-grid">
                  <label>
                    请求超时（毫秒）
                    <input
                      type="number"
                      min={1000}
                      max={kind === 'ports' ? 5000 : 15000}
                      value={timeoutMs}
                      onChange={(e) => updateDraft({ timeoutMs: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    {kind === 'ports' ? '批次间隔（毫秒）' : '请求间隔（毫秒）'}
                    <input
                      type="number"
                      min={250}
                      max={5000}
                      value={delayMs}
                      onChange={(e) => updateDraft({ delayMs: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </details>
              <div className="prism-scan-form-footer">
                <span>
                  {kind === 'ports'
                    ? `TCP Connect · 最多 ${concurrency} 个并发连接 · 原生引擎执行`
                    : kind === 'services'
                      ? `${catalog?.serviceRules?.length ?? 0} 条协议规则 · 顺序探测 · 指纹与发现分开显示`
                      : `${activeRules.length} 条规则 · 匿名 GET 请求 · 原生引擎执行`}
                </span>
                <button
                  className="prism-button primary"
                  disabled={busy || !canRun || (kind === 'web' && !activeRules.length)}
                  type="submit"
                >
                  {busy ? '正在提交…' : '开始扫描'}
                </button>
              </div>
              {!canRun && <p role="status">当前账号或项目没有执行扫描的权限。</p>}
            </form>
          )}
          <div className="prism-scan-layout">
            <section className="prism-surface prism-scan-history">
              <div className="prism-surface-heading">
                <h2>扫描记录</h2>
                <span className="prism-muted">最近 100 条</span>
              </div>
              <div className="prism-history-filters">
                <input
                  aria-label="搜索扫描记录"
                  placeholder="搜索名称或目标…"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                />
                <select
                  aria-label="扫描记录类型"
                  value={historyKind}
                  onChange={(e) => setHistoryKind(e.target.value)}
                >
                  <option value="all">全部类型</option>
                  <option value="web">Web 漏洞</option>
                  <option value="ports">TCP 端口</option>
                  <option value="services">端口指纹漏洞</option>
                </select>
                <select
                  aria-label="扫描记录状态"
                  value={historyState}
                  onChange={(e) => setHistoryState(e.target.value)}
                >
                  <option value="all">全部状态</option>
                  {Object.entries(SCAN_STATE_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <small>
                  {historyRows.length} / {jobs.length} 条记录
                </small>
              </div>
              {!jobs.length ? (
                <p className="prism-scan-empty">
                  暂无扫描记录
                  <br />
                  输入目标即可开始。
                </p>
              ) : (
                historyRows.map((row) => (
                  <button
                    key={row.id}
                    disabled={busy}
                    className={'prism-scan-history-row ' + (selected === row.id ? 'selected' : '')}
                    onClick={() => void run(() => open(row.id))}
                  >
                    <span>
                      <strong>{row.name}</strong>
                      <small>{new Date(row.createdAt).toLocaleString()}</small>
                    </span>
                    <span className={'prism-scan-status ' + row.state}>
                      {SCAN_STATE_LABEL[row.state]}
                    </span>
                    <small>
                      {row.kind === 'ports' ? 'TCP' : row.kind === 'services' ? '服务指纹' : 'Web'}{' '}
                      · {row.targets.length} 个目标 ·{' '}
                      {row.kind === 'ports'
                        ? `${row.openPorts ?? 0} 个开放端口`
                        : `${row.findingsCount} 项发现`}{' '}
                      · {row.completedChecks}/{row.totalChecks}
                    </small>
                  </button>
                ))
              )}
              {!!jobs.length && !historyRows.length && (
                <p className="prism-scan-empty">没有符合筛选条件的扫描记录。</p>
              )}
            </section>
            <section className="prism-surface prism-scan-results">
              {!job ? (
                <div className="prism-scan-empty">
                  <span className="prism-scan-empty-symbol">◎</span>
                  <h2>每项发现，都有检测依据</h2>
                  <p>选择扫描记录，查看漏洞、检查覆盖与修复建议。</p>
                  <p>未命中仅代表所选规则未发现问题。</p>
                </div>
              ) : (
                <>
                  <div className="prism-surface-heading">
                    <div>
                      <h2>{job.name}</h2>
                      <p>
                        {SCAN_STATE_LABEL[job.state]} · {completedScanChecks(job)}/
                        {totalScanChecks(job)} 项{job.kind === 'ports' ? '端口探测' : '检查'}
                      </p>
                    </div>
                    <div className="prism-scan-actions">
                      {live(job) && (
                        <button disabled={busy || !canRun} onClick={() => void control('pause')}>
                          暂停
                        </button>
                      )}
                      {['paused', 'interrupted'].includes(job.state) && (
                        <button disabled={busy || !canRun} onClick={() => void control('resume')}>
                          继续
                        </button>
                      )}
                      {['queued', 'running', 'paused', 'interrupted'].includes(job.state) && (
                        <button disabled={busy || !canRun} onClick={() => void control('cancel')}>
                          取消
                        </button>
                      )}
                      <button
                        disabled={busy || !canRun}
                        onClick={() => {
                          setDrafts((previous) => ({
                            ...previous,
                            [job.kind ?? 'web']: {
                              name: `${job.name.replace(/ · 复测$/, '')} · 复测`,
                              targets: job.targets.join('\n'),
                              timeoutMs: job.policy.timeoutMs,
                              delayMs: job.policy.delayMs,
                            },
                          }))
                          setKind(job.kind ?? 'web')
                          if (job.portScan) {
                            setPorts(job.portScan.ports.join(','))
                            setConcurrency(job.portScan.concurrency)
                          }
                          if (job.serviceScan) {
                            setServicePorts(job.serviceScan.ports.join(','))
                            setServiceMode(job.serviceScan.mode)
                          }
                          setProfile(job.kind === 'services' ? 'standard' : 'custom')
                          setRuleIds(job.policy.ruleIds)
                          showForm()
                        }}
                      >
                        复测
                      </button>
                      <button
                        onClick={() =>
                          download(
                            `prism-scan-${job.id}.html`,
                            scanReport(job),
                            'text/html;charset=utf-8',
                          )
                        }
                      >
                        导出报告
                      </button>
                      <button
                        onClick={() =>
                          download(
                            `prism-scan-${job.id}.json`,
                            JSON.stringify(job, null, 2),
                            'application/json',
                          )
                        }
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  <progress
                    aria-label="检查进度"
                    max={totalScanChecks(job)}
                    value={completedScanChecks(job)}
                  />
                  <p className="prism-scan-message">{job.message}</p>
                  {job.kind === 'ports' ? (
                    <PortResults
                      key={job.id}
                      job={job}
                      canRun={canRun && !busy}
                      onServices={(target, port) => {
                        setKind('services')
                        setDrafts((previous) => ({
                          ...previous,
                          services: {
                            name: '端口后续指纹漏洞检查',
                            targets: target,
                            timeoutMs: 3000,
                            delayMs: 500,
                          },
                        }))
                        setServicePorts(String(port))
                        setServiceMode('auto')
                        showForm()
                      }}
                      onWeb={(urls) => {
                        setKind('web')
                        setDrafts((previous) => ({
                          ...previous,
                          web: {
                            name: '端口后续 Web 检查',
                            targets: urls.join('\n'),
                            timeoutMs: 5000,
                            delayMs: 500,
                          },
                        }))
                        setProfile('standard')
                        showForm()
                      }}
                    />
                  ) : (
                    <>
                      {job.kind === 'services' && <ServiceResults job={job} />}
                      <div className="prism-scan-filters">
                        <input
                          aria-label="搜索漏洞"
                          placeholder="搜索漏洞、目标或规则…"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        />
                        <select
                          aria-label="风险等级"
                          value={severity}
                          onChange={(e) => setSeverity(e.target.value)}
                        >
                          <option value="all">全部风险等级</option>
                          {Object.entries(SCAN_SEVERITY_LABEL).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="prism-scan-table-wrap">
                        <table className="prism-scan-table">
                          <thead>
                            <tr>
                              <th>风险</th>
                              <th>发现 / 目标</th>
                              <th>处置</th>
                            </tr>
                          </thead>
                          <tbody>
                            {findingRows.map((f) => (
                              <tr key={f.id}>
                                <td>
                                  <span className={'prism-severity ' + f.severity}>
                                    {SCAN_SEVERITY_LABEL[f.severity]}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    className="prism-text-button"
                                    onClick={() => {
                                      setDetail(f)
                                      setNote(f.note)
                                      setDisposition(f.state)
                                    }}
                                  >
                                    {f.title}
                                  </button>
                                  <small>{f.target}</small>
                                </td>
                                <td>
                                  {
                                    {
                                      open: '待处理',
                                      accepted: '接受风险',
                                      'false-positive': '误报',
                                    }[f.state]
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!findingRows.length && (
                          <p className="prism-scan-empty">
                            {job.findings.length
                              ? '没有符合筛选条件的发现。'
                              : '当前暂无命中。请结合检查覆盖判断检测是否完整。'}
                          </p>
                        )}
                      </div>
                      <details className="prism-scan-coverage">
                        <summary>检查覆盖与未完成项 ({job.checks.length})</summary>
                        {job.checks.map((c) => (
                          <div key={`${c.target}:${c.ruleId}`}>
                            <strong>
                              {c.ruleId} ·{' '}
                              {
                                { hit: '命中', pass: '未命中', error: '错误', skipped: '跳过' }[
                                  c.state
                                ]
                              }
                            </strong>
                            <small>{c.target}</small>
                            <p>{c.detail}</p>
                          </div>
                        ))}
                      </details>
                    </>
                  )}
                  <div className="prism-scan-compare">
                    <label>
                      与历史扫描比较
                      <select
                        aria-label="对比基线"
                        defaultValue=""
                        disabled={busy}
                        onChange={(e) => {
                          const baselineId = e.target.value
                          if (baselineId)
                            void run(async () =>
                              setComparison(
                                await teamApi<ScanComparison>('scan-compare', {
                                  id: job.id,
                                  baselineId,
                                }),
                              ),
                            )
                        }}
                        key={job.id}
                      >
                        <option value="">
                          {job.kind === 'ports'
                            ? '选择相同主机与端口的记录'
                            : '选择相同目标与规则的记录'}
                        </option>
                        {jobs
                          .filter(
                            (j) =>
                              j.id !== job.id &&
                              j.ruleHash === job.ruleHash &&
                              (job.projectId || j.ownerId === job.ownerId) &&
                              JSON.stringify([...j.targets].sort()) ===
                                JSON.stringify([...job.targets].sort()),
                          )
                          .map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.name} · {new Date(j.createdAt).toLocaleString()}
                            </option>
                          ))}
                      </select>
                    </label>
                    {comparison && (
                      <p role="status">
                        {job.kind === 'ports'
                          ? `新增开放 ${comparison.added.length} · 仍开放 ${comparison.persistent.length} · 已关闭 ${comparison.resolved.length} · 未确定 ${comparison.unverified.length}`
                          : `新增 ${comparison.added.length} · 仍存在 ${comparison.persistent.length} · 复测未命中 ${comparison.resolved.length} · 未验证 ${comparison.unverified.length}`}
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
      {tab === 'rules' && (
        <section className="prism-surface prism-scan-rule-library">
          <div className="prism-surface-heading">
            <div>
              <h2>棱镜检测规则</h2>
              <p>
                独立 JSON 规则格式。支持条件组合、状态码、响应头、正文标记、Cookie 属性和 TLS 属性。
              </p>
            </div>
            <input
              aria-label="搜索检测规则"
              placeholder="搜索规则或分类…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="prism-scan-table-wrap">
            <table className="prism-scan-table">
              <thead>
                <tr>
                  <th>规则</th>
                  <th>分类</th>
                  <th>风险</th>
                  <th>版本</th>
                </tr>
              </thead>
              <tbody>
                {catalogRows.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <details>
                        <summary>{rule.title}</summary>
                        <small>{rule.id}</small>
                        <p>{rule.evidence}</p>
                        <p>{rule.remediation}</p>
                        <pre>{JSON.stringify(rule, null, 2)}</pre>
                      </details>
                    </td>
                    <td>
                      {{ web: 'Web 基线', exposure: '公开暴露', tls: 'TLS / HTTPS' }[rule.family]}
                    </td>
                    <td>
                      <span className={'prism-severity ' + rule.severity}>
                        {SCAN_SEVERITY_LABEL[rule.severity]}
                      </span>
                    </td>
                    <td>v{rule.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!catalog?.serviceRules?.length && (
            <section className="prism-service-rules">
              <div className="prism-surface-heading">
                <div>
                  <h3>端口协议规则</h3>
                  <p>由协议探测器执行，和 Web JSON 规则分开管理。</p>
                </div>
              </div>
              {catalog.serviceRules
                .filter((r) => `${r.title} ${r.id}`.toLowerCase().includes(filter.toLowerCase()))
                .map((rule) => (
                  <details key={rule.id} className="prism-scan-coverage">
                    <summary>
                      {rule.title} · {SCAN_SEVERITY_LABEL[rule.severity]} · v{rule.version}
                    </summary>
                    <p>{rule.evidence}</p>
                    <p>{rule.remediation}</p>
                  </details>
                ))}
            </section>
          )}
          {catalog?.canManageRules && (
            <details className="prism-scan-rule-import">
              <summary>添加或更新自定义规则</summary>
              <p>
                粘贴棱镜规则 JSON，可参考上方规则结构。自定义规则 ID 不使用 prism-
                前缀；更新时须增加版本号。已执行扫描保留原规则快照。
              </p>
              <textarea
                aria-label="自定义规则 JSON"
                rows={10}
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
              />
              <button
                className="prism-button primary"
                disabled={busy || !ruleText.trim()}
                onClick={() =>
                  void run(async () => {
                    let rule: unknown
                    try {
                      rule = JSON.parse(ruleText)
                    } catch {
                      throw new Error('JSON 格式无效。')
                    }
                    await teamApi('scan-rule-save', { rule })
                    setRuleText('')
                    await refresh()
                  })
                }
              >
                保存规则
              </button>
            </details>
          )}
        </section>
      )}
      {detail && (
        <div className="prism-dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="漏洞详情"
            className="prism-scan-detail"
          >
            <div className="prism-scan-section-title">
              <span className={'prism-severity ' + detail.severity}>
                {SCAN_SEVERITY_LABEL[detail.severity]}
              </span>
              <button aria-label="关闭漏洞详情" onClick={() => setDetail(undefined)}>
                ×
              </button>
            </div>
            <h2>{detail.title}</h2>
            <p className="prism-muted">{detail.target}</p>
            <h3>检测依据</h3>
            <p>{detail.evidence}</p>
            <h3>修复建议</h3>
            <p>{detail.remediation}</p>
            <label>
              处置状态
              <select
                value={disposition}
                onChange={(e) => setDisposition(e.target.value as typeof disposition)}
              >
                <option value="open">待处理</option>
                <option value="accepted">接受风险</option>
                <option value="false-positive">误报</option>
              </select>
            </label>
            <label>
              处置说明
              <textarea
                value={note}
                maxLength={500}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              className="prism-button primary"
              disabled={busy || !canRun || !note.trim()}
              onClick={() =>
                void run(async () => {
                  const result = await teamApi<{ job: ScanJob }>('scan-finding', {
                    id: job!.id,
                    findingId: detail.id,
                    state: disposition,
                    note,
                  })
                  setJob(result.job)
                  setDetail(undefined)
                })
              }
            >
              保存处置
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
