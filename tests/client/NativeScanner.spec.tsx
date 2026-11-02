// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeScanner } from '../../src/client/NativeScanner.js'
import { teamApi } from '../../src/client/team-api.js'
import { teamFixture } from './team-fixture.js'
import type { ScanCatalog, ScanJob } from '../../src/lib/native-scan-types.js'
import { completedScanChecks, totalScanChecks } from '../../src/lib/native-scan-types.js'
vi.mock('../../src/client/team-api.js', () => ({ teamApi: vi.fn() }))
const api = vi.mocked(teamApi)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  api.mockReset()
})
function fixture(options: { readOnly?: boolean; empty?: boolean } = {}) {
  const team = teamFixture()
  const rule = {
    id: 'prism-mime-sniffing',
    version: 1,
    title: '缺少 MIME 嗅探防护',
    family: 'web' as const,
    severity: 'low' as const,
    path: '',
    match: { field: 'status' as const, op: 'equals' as const, value: 200 },
    evidence: 'HTML 响应缺少 X-Content-Type-Options。',
    remediation: '设置 nosniff。',
  }
  const job: ScanJob = {
    id: 'j1',
    ownerId: 'admin',
    projectId: null,
    name: '门户扫描',
    targets: ['https://example.com/'],
    policy: { id: 'custom', timeoutMs: 5000, delayMs: 500, ruleIds: [rule.id] },
    rules: [rule],
    ruleHash: 'hash',
    state: 'completed',
    createdAt: '2026-10-27T00:00:00Z',
    updatedAt: '2026-10-27T00:00:01Z',
    checks: [
      {
        target: 'https://example.com/',
        ruleId: rule.id,
        state: 'hit',
        detail: rule.evidence,
        at: '',
      },
    ],
    findings: [
      {
        id: 'f1',
        target: 'https://example.com/',
        ruleId: rule.id,
        title: rule.title,
        severity: 'low',
        evidence: rule.evidence,
        remediation: rule.remediation,
        state: 'open',
        note: '',
      },
    ],
    message: '扫描完成。',
  }
  const catalog: ScanCatalog = {
    serviceRules: [{ ...rule, id: 'prism-service-ssh-legacy', title: 'SSH 服务声明支持旧版协议' }],
    rules: [rule, { ...rule, id: 'exposure-check', family: 'exposure', title: '公开暴露检查' }],
    canRun: !options.readOnly,
    canScanInternal: !options.readOnly,
    canManageRules: !options.readOnly,
  }
  const jobs = options.empty
    ? []
    : [job, { ...job, id: 'j0', name: '历史扫描', createdAt: '2026-10-26T00:00:00Z' }]
  const summary = (j: ScanJob) => ({
    id: j.id,
    name: j.name,
    kind: j.kind ?? 'web',
    openPorts: j.portResults?.filter((r) => r.state === 'open').length ?? 0,
    ownerId: j.ownerId,
    projectId: j.projectId,
    state: j.state,
    targets: j.targets,
    ruleHash: j.ruleHash,
    createdAt: j.createdAt,
    completedChecks: completedScanChecks(j),
    totalChecks: totalScanChecks(j),
    findingsCount: j.findings.length,
  })
  api.mockImplementation(async (action, input) => {
    if (action === 'scan-catalog') return catalog
    if (action === 'scan-list') return { jobs: input?.projectId ? [] : jobs.map(summary) }
    if (action === 'scan-get') return { job: jobs.find((j) => j.id === input?.id) ?? job }
    if (action === 'scan-create') {
      job.state = 'running'
      const created: ScanJob = { ...job, id: 'j2', name: String(input?.name), state: 'running' }
      if (input?.kind === 'ports')
        Object.assign(created, {
          kind: 'ports',
          targets: ['fixture.test'],
          portScan: { ports: [22, 80], concurrency: 4 },
          portResults: [
            {
              target: 'fixture.test',
              address: '192.168.1.10',
              port: 22,
              state: 'open',
              serviceHint: 'SSH',
              detail: '连接成功',
              at: '',
            },
            {
              target: 'fixture.test',
              address: '192.168.1.10',
              port: 80,
              state: 'closed',
              serviceHint: 'HTTP',
              detail: '拒绝连接',
              at: '',
            },
          ],
          rules: [],
          findings: [],
          checks: [],
        })
      if (input?.kind === 'services')
        Object.assign(created, {
          kind: 'services',
          targets: ['fixture.test'],
          serviceScan: { ports: [2222], mode: input.serviceMode },
          serviceRules: catalog.serviceRules,
          rules: [],
          checks: [],
          findings: [],
          serviceResults: [
            {
              target: 'fixture.test',
              address: '192.168.1.10',
              port: 2222,
              state: 'identified',
              protocol: 'SSH',
              product: 'OpenSSH',
              version: '9.8p1',
              detail: '依据实际 SSH 问候语识别',
              at: '',
            },
          ],
        })
      jobs.unshift(created)
      return { job: jobs[0] }
    }
    if (action === 'scan-control') {
      const j = jobs.find((j) => j.id === input?.id)!
      j.state =
        input?.command === 'pause'
          ? 'paused'
          : input?.command === 'resume'
            ? 'running'
            : 'cancelled'
      return { job: { ...j } }
    }
    if (action === 'scan-finding') {
      job.findings[0]!.state = input?.state as 'accepted'
      job.findings[0]!.note = String(input?.note)
      return { job: { ...job } }
    }
    if (action === 'scan-compare')
      return { added: [], persistent: [], resolved: ['f1'], unverified: [] }
    if (action === 'scan-rule-save') return { ok: true }
    throw new Error('unexpected action')
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:report'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return { team, job, catalog, jobs }
}
describe('independent native scanner UI', () => {
  it('starts an independent service scan, displays fingerprints separately and restores its protocol settings', async () => {
    const { team } = fixture({ empty: true })
    render(<NativeScanner team={team} />)
    await waitFor(() =>
      expect((screen.getByText('开始扫描') as HTMLButtonElement).disabled).toBe(false),
    )
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    fireEvent.click(screen.getByLabelText('端口指纹漏洞扫描'))
    expect(screen.queryByLabelText('并发连接数')).toBeNull()
    expect(screen.queryByLabelText('检测策略')).toBeNull()
    fireEvent.change(screen.getByLabelText(/目标 IP \/ 域名/), {
      target: { value: 'fixture.test' },
    })
    fireEvent.change(screen.getByLabelText('端口列表或范围'), { target: { value: '2222' } })
    fireEvent.change(screen.getByLabelText('服务探测方式'), { target: { value: 'banner' } })
    fireEvent.click(screen.getByText('开始扫描'))
    await screen.findByRole('heading', { name: '端口指纹漏洞扫描' })
    expect(api).toHaveBeenCalledWith(
      'scan-create',
      expect.objectContaining({
        kind: 'services',
        projectId: null,
        targets: ['fixture.test'],
        ports: '2222',
        serviceMode: 'banner',
        profile: 'standard',
      }),
    )
    expect(screen.getByText('OpenSSH')).toBeTruthy()
    expect(screen.getByText('9.8p1')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '协议漏洞与配置风险' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('搜索服务指纹'), { target: { value: 'redis' } })
    expect(screen.getByText('暂无符合条件的服务指纹。')).toBeTruthy()
    fireEvent.click(screen.getByText('复测'))
    expect((screen.getByLabelText('端口指纹漏洞扫描') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('服务探测方式') as HTMLSelectElement).value).toBe('banner')
    expect((screen.getByLabelText('端口列表或范围') as HTMLInputElement).value).toBe('2222')
    fireEvent.click(screen.getByRole('tab', { name: '检测规则' }))
    expect(screen.getByRole('heading', { name: '端口协议规则' })).toBeTruthy()
    expect(screen.getByText(/SSH 服务声明支持旧版协议/)).toBeTruthy()
  })
  it('preserves separate Web and TCP drafts including settings and focuses prepared targets', async () => {
    const { team } = fixture()
    render(<NativeScanner team={team} />)
    await screen.findByText('门户扫描')
    fireEvent.change(screen.getByLabelText('扫描名称'), { target: { value: 'Web 草稿' } })
    fireEvent.change(screen.getByLabelText(/目标 URL/), {
      target: { value: 'https://example.test/app/' },
    })
    fireEvent.click(screen.getByText('请求设置'))
    fireEvent.change(screen.getByLabelText('请求超时（毫秒）'), { target: { value: '9000' } })
    fireEvent.click(screen.getByLabelText('网络端口扫描'))
    fireEvent.change(screen.getByLabelText('扫描名称'), { target: { value: 'TCP 草稿' } })
    fireEvent.change(screen.getByLabelText(/目标 IP \/ 域名/), { target: { value: 'host.test' } })
    fireEvent.change(screen.getByLabelText('请求超时（毫秒）'), { target: { value: '3000' } })
    fireEvent.click(screen.getByLabelText('Web 漏洞扫描'))
    expect((screen.getByLabelText('扫描名称') as HTMLInputElement).value).toBe('Web 草稿')
    expect((screen.getByLabelText(/目标 URL/) as HTMLInputElement).value).toBe(
      'https://example.test/app/',
    )
    expect((screen.getByLabelText('请求超时（毫秒）') as HTMLInputElement).value).toBe('9000')
    fireEvent.click(screen.getByLabelText('网络端口扫描'))
    expect((screen.getByLabelText('扫描名称') as HTMLInputElement).value).toBe('TCP 草稿')
    expect((screen.getByLabelText(/目标 IP \/ 域名/) as HTMLInputElement).value).toBe('host.test')
    expect((screen.getByLabelText('请求超时（毫秒）') as HTMLInputElement).value).toBe('3000')
    fireEvent.click(screen.getByText('收起'))
    fireEvent.click(screen.getByText('＋ 新建扫描'))
    expect(document.activeElement).toBe(screen.getByLabelText(/目标 IP \/ 域名/))
  })
  it('combines history search, protocol and lifecycle filters without changing selected details', async () => {
    const { team, jobs, job } = fixture()
    jobs.push({
      ...job,
      id: 'tcp',
      kind: 'ports',
      state: 'paused',
      name: '服务器端口',
      targets: ['host.test'],
    })
    render(<NativeScanner team={team} />)
    await screen.findByText('门户扫描')
    fireEvent.click(screen.getByText('门户扫描'))
    await screen.findByRole('heading', { name: '门户扫描' })
    fireEvent.change(screen.getByLabelText('搜索扫描记录'), { target: { value: ' HOST.TEST ' } })
    expect(screen.getByText('1 / 3 条记录')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '门户扫描' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('扫描记录类型'), { target: { value: 'web' } })
    expect(screen.getByText('没有符合筛选条件的扫描记录。')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('扫描记录类型'), { target: { value: 'ports' } })
    fireEvent.change(screen.getByLabelText('扫描记录状态'), { target: { value: 'running' } })
    expect(screen.queryByText('服务器端口')).toBeNull()
    fireEvent.change(screen.getByLabelText('扫描记录状态'), { target: { value: 'paused' } })
    expect(screen.getByText('服务器端口')).toBeTruthy()
  })
  it('polls idle jobs slowly, suspends background requests and refreshes on return', async () => {
    vi.useFakeTimers()
    const { team } = fixture()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    render(<NativeScanner team={team} />)
    await act(async () => {})
    const count = (action: string) => api.mock.calls.filter(([a]) => a === action).length
    expect(count('scan-list')).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(27500))
    expect(count('scan-list')).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(2500))
    expect(count('scan-list')).toBe(2)
    hidden.mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
    await act(() => vi.advanceTimersByTimeAsync(60000))
    expect(count('scan-list')).toBe(2)
    hidden.mockReturnValue(false)
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'))
    })
    expect(count('scan-list')).toBe(3)
    expect(count('scan-catalog')).toBe(3)
  })
  it('fetches the final results when a live job completes, without reloading rules each tick', async () => {
    vi.useFakeTimers()
    const { team, job } = fixture()
    job.state = 'running'
    const original = api.getMockImplementation()!
    api.mockImplementation(async (action, input) => structuredClone(await original(action, input)))
    render(<NativeScanner team={team} />)
    await act(async () => {})
    await act(async () => {
      fireEvent.click(screen.getByText('门户扫描'))
    })
    job.state = 'completed'
    job.message = '已完成最后一项检查。'
    await act(() => vi.advanceTimersByTimeAsync(2500))
    expect(screen.getByText('已完成最后一项检查。')).toBeTruthy()
    expect(screen.queryByText('暂停')).toBeNull()
    expect(api.mock.calls.filter(([a]) => a === 'scan-catalog')).toHaveLength(1)
  })
  it('does not let an in-flight poll overwrite a pause response', async () => {
    vi.useFakeTimers()
    const { team, job } = fixture()
    job.state = 'running'
    const original = api.getMockImplementation()!
    let hold = false
    let finish: ((value: unknown) => void) | undefined
    api.mockImplementation(async (action, input) => {
      const result = structuredClone(await original(action, input))
      if (action === 'scan-get' && hold) {
        hold = false
        return new Promise((resolve) => {
          finish = () => resolve(result)
        })
      }
      return result
    })
    render(<NativeScanner team={team} />)
    await act(async () => {})
    await act(async () => {
      fireEvent.click(screen.getByText('门户扫描'))
    })
    hold = true
    await act(() => vi.advanceTimersByTimeAsync(2500))
    expect(finish).toBeTypeOf('function')
    await act(async () => {
      fireEvent.click(screen.getByText('暂停'))
    })
    expect(screen.getByText('继续')).toBeTruthy()
    await act(async () => {
      finish!(undefined)
    })
    expect(screen.queryByText('暂停')).toBeNull()
    expect(screen.getByText('继续')).toBeTruthy()
  })
  it('starts a TCP scan, displays port states, restores its settings and prepares Web follow-up', async () => {
    const { team } = fixture({ empty: true })
    render(<NativeScanner team={team} />)
    await waitFor(() =>
      expect((screen.getByText('开始扫描') as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(screen.getByLabelText('网络端口扫描'))
    expect(screen.queryByLabelText('检测策略')).toBeNull()
    fireEvent.change(screen.getByLabelText(/目标 IP \/ 域名/), {
      target: { value: 'fixture.test' },
    })
    fireEvent.change(screen.getByLabelText('并发连接数'), { target: { value: '4' } })
    fireEvent.click(screen.getByText('1–1024'))
    expect((screen.getByLabelText('端口列表或范围') as HTMLInputElement).value).toBe('1-1024')
    fireEvent.click(screen.getByText('常用端口'))
    fireEvent.change(screen.getByLabelText('端口列表或范围'), { target: { value: '22,80' } })
    fireEvent.click(screen.getByText('开始扫描'))
    await screen.findByRole('heading', { name: '网络端口扫描' })
    expect(api).toHaveBeenCalledWith(
      'scan-create',
      expect.objectContaining({
        kind: 'ports',
        ports: '22,80',
        targets: ['fixture.test'],
        concurrency: 4,
        timeoutMs: 2000,
      }),
    )
    expect(screen.queryByLabelText('风险等级')).toBeNull()
    expect(screen.getByText('SSH')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('端口状态'), { target: { value: 'all' } })
    expect(screen.getByText('拒绝连接')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('搜索端口结果'), { target: { value: 'missing' } })
    expect(screen.getByText(/没有符合筛选条件的端口/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('搜索端口结果'), { target: { value: '' } })
    fireEvent.click(screen.getByText('导出报告'))
    expect(URL.createObjectURL).toHaveBeenCalled()
    fireEvent.click(screen.getByText('复测'))
    expect((screen.getByLabelText('端口列表或范围') as HTMLInputElement).value).toBe('22,80')
    expect((screen.getByLabelText('网络端口扫描') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByText('HTTP 检查'))
    expect((screen.getByLabelText(/目标 URL/) as HTMLTextAreaElement).value).toBe(
      'http://fixture.test:22/',
    )
    expect((screen.getByLabelText('Web 漏洞扫描') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByText('HTTPS 检查'))
    expect((screen.getByLabelText(/目标 URL/) as HTMLTextAreaElement).value).toBe(
      'https://fixture.test:22/',
    )
    fireEvent.click(screen.getByLabelText('选择 fixture.test:22'))
    fireEvent.change(screen.getByLabelText('批量 Web 检查协议'), { target: { value: 'http' } })
    fireEvent.click(screen.getByText('批量 Web 检查'))
    expect((screen.getByLabelText(/目标 URL/) as HTMLTextAreaElement).value).toBe(
      'http://fixture.test:22/',
    )
    expect(document.activeElement).toBe(screen.getByLabelText(/目标 URL/))
    expect(api.mock.calls.filter(([action]) => action === 'scan-create')).toHaveLength(1)
    fireEvent.click(screen.getByLabelText('网络端口扫描'))
    expect((screen.getByLabelText(/目标 IP \/ 域名/) as HTMLTextAreaElement).value).toBe(
      'fixture.test',
    )
    fireEvent.click(screen.getByText('指纹漏洞检查'))
    expect((screen.getByLabelText('端口指纹漏洞扫描') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('端口列表或范围') as HTMLInputElement).value).toBe('22')
    expect(api.mock.calls.filter(([action]) => action === 'scan-create')).toHaveLength(1)
  })
  it('creates without projects, selects policy rules and controls the job', async () => {
    const { team } = fixture({ empty: true })
    render(<NativeScanner team={team} />)
    await waitFor(() =>
      expect((screen.getByText('开始扫描') as HTMLButtonElement).disabled).toBe(false),
    )
    expect(screen.getByText(/暂无扫描记录/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('扫描名称'), { target: { value: '独立扫描' } })
    fireEvent.change(screen.getByLabelText(/目标 URL/), {
      target: { value: 'https://example.com/\n' },
    })
    fireEvent.change(screen.getByLabelText('检测策略'), { target: { value: 'quick' } })
    fireEvent.change(screen.getByLabelText('检测策略'), { target: { value: 'custom' } })
    fireEvent.click(screen.getByLabelText('缺少 MIME 嗅探防护'))
    fireEvent.click(screen.getByLabelText('公开暴露检查'))
    fireEvent.click(screen.getByLabelText('公开暴露检查'))
    fireEvent.click(screen.getByText('请求设置'))
    fireEvent.change(screen.getByLabelText('请求超时（毫秒）'), { target: { value: '6000' } })
    fireEvent.change(screen.getByLabelText('请求间隔（毫秒）'), { target: { value: '750' } })
    fireEvent.click(screen.getByText('开始扫描'))
    await screen.findByRole('heading', { name: '独立扫描' })
    expect(api).toHaveBeenCalledWith(
      'scan-create',
      expect.objectContaining({
        projectId: null,
        targets: ['https://example.com/'],
        profile: 'custom',
        ruleIds: ['prism-mime-sniffing'],
        timeoutMs: 6000,
        delayMs: 750,
      }),
    )
    fireEvent.click(screen.getByText('暂停'))
    await screen.findByText('继续')
    fireEvent.click(screen.getByText('继续'))
    await screen.findByText('暂停')
    fireEvent.click(screen.getByText('取消'))
    await waitFor(() => expect(screen.queryByText('暂停')).toBeNull())
    fireEvent.click(screen.getByText('复测'))
    expect((screen.getByLabelText('扫描名称') as HTMLInputElement).value).toBe('独立扫描 · 复测')
    fireEvent.click(screen.getByText('收起'))
    fireEvent.click(screen.getByText('＋ 新建扫描'))
    expect(screen.getByLabelText('扫描名称')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('扫描查看范围'), { target: { value: 'p1' } })
    await waitFor(() => expect(api).toHaveBeenCalledWith('scan-list', { projectId: 'p1' }))
    expect(screen.queryByRole('heading', { name: '独立扫描' })).toBeNull()
  })
  it('inspects and filters findings, persists dispositions, compares and exports real reports', async () => {
    const { team } = fixture()
    render(<NativeScanner team={team} />)
    await screen.findByText('门户扫描')
    fireEvent.click(screen.getByText('收起'))
    fireEvent.click(screen.getByText('门户扫描'))
    await screen.findByRole('heading', { name: '门户扫描' })
    fireEvent.change(screen.getByLabelText('风险等级'), { target: { value: 'high' } })
    expect(screen.getByText('没有符合筛选条件的发现。')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('风险等级'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('搜索漏洞'), { target: { value: '不存在' } })
    fireEvent.change(screen.getByLabelText('搜索漏洞'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '缺少 MIME 嗅探防护' }))
    const dialog = screen.getByRole('dialog', { name: '漏洞详情' })
    expect(within(dialog).getByText('设置 nosniff。')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('处置状态'), { target: { value: 'accepted' } })
    fireEvent.change(within(dialog).getByLabelText('处置说明'), {
      target: { value: '业务确认接受' },
    })
    fireEvent.click(within(dialog).getByText('保存处置'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api).toHaveBeenCalledWith(
      'scan-finding',
      expect.objectContaining({ state: 'accepted', note: '业务确认接受' }),
    )
    fireEvent.click(screen.getByRole('button', { name: '缺少 MIME 嗅探防护' }))
    fireEvent.click(screen.getByLabelText('关闭漏洞详情'))
    fireEvent.click(screen.getByText(/检查覆盖与未完成项/))
    expect(screen.getByText('prism-mime-sniffing · 命中')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('对比基线'), { target: { value: 'j0' } })
    await screen.findByText('新增 0 · 仍存在 0 · 复测未命中 1 · 未验证 0')
    fireEvent.click(screen.getByText('导出报告'))
    fireEvent.click(screen.getByText('JSON'))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2)
  })
  it('browses and imports versioned rules, displays errors and enforces read-only access', async () => {
    const { team } = fixture()
    const view = render(<NativeScanner team={team} />)
    await screen.findByText('门户扫描')
    fireEvent.click(screen.getByRole('tab', { name: '检测规则' }))
    fireEvent.change(screen.getByLabelText('搜索检测规则'), { target: { value: 'MIME' } })
    expect(screen.queryByText('公开暴露检查')).toBeNull()
    fireEvent.change(screen.getByLabelText('搜索检测规则'), { target: { value: '' } })
    fireEvent.click(screen.getByText('缺少 MIME 嗅探防护'))
    fireEvent.click(screen.getByText('添加或更新自定义规则'))
    fireEvent.change(screen.getByLabelText('自定义规则 JSON'), { target: { value: 'invalid' } })
    fireEvent.click(screen.getByText('保存规则'))
    await screen.findByRole('alert')
    expect(screen.getByText('JSON 格式无效。')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('关闭扫描提示'))
    fireEvent.change(screen.getByLabelText('自定义规则 JSON'), {
      target: { value: '{"id":"custom-rule"}' },
    })
    fireEvent.click(screen.getByText('保存规则'))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('scan-rule-save', { rule: { id: 'custom-rule' } }),
    )
    fireEvent.click(screen.getByRole('tab', { name: '扫描与发现' }))
    view.unmount()
    const readonly = fixture({ readOnly: true })
    readonly.team.user.role = 'member'
    render(<NativeScanner team={readonly.team} />)
    await screen.findByText('门户扫描')
    expect((screen.getByText('开始扫描') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: '检测规则' }))
    expect(screen.queryByText('添加或更新自定义规则')).toBeNull()
  })
  it('reports backend failures and ignores obsolete responses after changing scope', async () => {
    const { team } = fixture()
    api.mockRejectedValueOnce(new Error('数据库暂不可用'))
    render(<NativeScanner team={team} />)
    await screen.findByText('数据库暂不可用')
    fireEvent.click(screen.getByLabelText('关闭扫描提示'))
    fireEvent.change(screen.getByLabelText('扫描查看范围'), { target: { value: 'p1' } })
    await waitFor(() => expect(api).toHaveBeenCalledWith('scan-list', { projectId: 'p1' }))
    fireEvent.change(screen.getByLabelText('扫描查看范围'), { target: { value: '' } })
    await screen.findByText('门户扫描')
    api.mockRejectedValueOnce(new Error('没有访问权限'))
    fireEvent.click(screen.getByText('门户扫描'))
    await screen.findByText('没有访问权限')
  })
})
