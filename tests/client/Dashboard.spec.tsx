// @vitest-environment jsdom

import type {
  ConversationNode,
  DashboardConversationSnapshot as ConversationSnapshot,
  DashboardConversationSource,
  SessionFaceLike as SessionFace,
  SessionId,
  SessionListStateLike as SessionListState,
  ToolResultNode,
} from '../../src/client/runtime-contract.js'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const Icon = (_props: unknown): null => null
  const Tooltip = ({ children }: { children: ReactNode }): ReactNode => children
  const MarkdownText = ({ text }: { text: string }): ReactNode => <div>{text}</div>
  return {
    IconAgentPresetOutline16: Icon,
    IconCodeOutline16: Icon,
    IconListPenOutline16: Icon,
    IconPanelLeftOutline16: Icon,
    IconPlusOutline16: Icon,
    IconSearchOutline16: Icon,
    IconSendOutline16: Icon,
    IconWarningOutline16: Icon,
    MarkdownText,
    Tooltip,
  } as unknown as ToolResultNode
})

import {
  Dashboard,
  type DashboardProps,
  type DashboardRuntime,
} from '../../src/client/Dashboard.js'

afterEach(() => {
  cleanup()
  delete document.body.dataset.dshRedteamDashboard
})

function result(name: string, value: unknown, seq: number): ToolResultNode {
  return {
    call: { argsRaw: '{}', name },
    callId: `call-${seq}`,
    callTime: seq,
    callView: null,
    content: [{ type: 'text', text: JSON.stringify(value) }],
    isError: false,
    kind: 'tool-result',
    resultView: null,
    seq,
    subCalls: [],
    time: seq,
  } as unknown as ToolResultNode
}

function userMessage(
  text: string,
  seq: number,
  kind: 'steering' | 'user' = 'user',
): ConversationNode {
  return {
    content: [{ type: 'text', text }],
    kind,
    ...(kind === 'steering' ? { messageId: `message-${String(seq)}` } : {}),
    seq,
    source: null,
    time: 1_700_000_000_000 + seq,
  } as unknown as ConversationNode
}

function assistantMessage(text: string, seq: number, usage: unknown = undefined): ConversationNode {
  return {
    blocks: [
      { kind: 'text', text },
      { kind: 'reasoning', text: '不应展示的推理内容' },
    ],
    kind: 'assistant',
    seq,
    step: 1,
    time: 1_700_000_000_000 + seq,
    turn: 1,
    usage,
  } as ConversationNode
}

function conversation(
  nodes: readonly ConversationNode[] = [],
  overrides: Partial<ConversationSnapshot> = {},
): ConversationSnapshot {
  return {
    hasMore: false,
    loadingOlder: false,
    nodes,
    partial: null,
    running: false,
    runningCalls: [],
    ...overrides,
  } as unknown as ConversationSnapshot
}

function session(snapshot: ConversationSnapshot, loadOlder: () => Promise<void>): SessionFace {
  return {
    getSnapshot: () => snapshot,
    loadOlder,
    sessionId: 'session-1' as SessionId,
    subscribe: () => () => undefined,
  } as unknown as SessionFace
}

function dashboardProps(
  snapshot: ConversationSnapshot,
  options: {
    readonly agentPreset?: string
    readonly createProjectSession?: DashboardRuntime['createProjectSession']
    readonly executionPolicy?: DashboardRuntime['executionPolicy']
    readonly loadProjectSession?: DashboardRuntime['loadProjectSession']
    readonly loadOlder?: () => Promise<void>
    readonly models?: DashboardRuntime['models']
    readonly pickDirectory?: DashboardRuntime['pickDirectory']
    readonly prompt?: DashboardRuntime['prompt']
    readonly selectModel?: DashboardRuntime['selectModel']
    readonly toolAvailability?: DashboardRuntime['toolAvailability']
    readonly updateExecutionPolicy?: DashboardRuntime['updateExecutionPolicy']
  } = {},
): { loadOlder: () => Promise<void>; props: DashboardProps; runtime: DashboardRuntime } {
  const id = 'session-1' as SessionId
  const list = {
    byId: {
      [id]: {
        blank: true,
        cwd: '/authorized/project',
        displayTitle: 'Security review',
        id,
        projectionValues: { agentPreset: options.agentPreset ?? 'redteam' },
        running: false,
        updatedAt: 1,
      },
    },
    current: id,
    ids: [id],
  } as unknown as SessionListState
  const loadOlder = options.loadOlder ?? vi.fn().mockResolvedValue(undefined)
  const face = session(snapshot, loadOlder)
  const runtime: DashboardRuntime = {
    closeNativeDetails: vi.fn(),
    createProjectSession: options.createProjectSession ?? vi.fn().mockResolvedValue({ ok: true }),
    executionPolicy:
      options.executionPolicy ??
      vi.fn().mockResolvedValue({
        ok: true,
        policy: { enabledToolIds: [], operationMode: 'passive', testingScope: [] },
      }),
    loadProjectSession: options.loadProjectSession ?? vi.fn().mockResolvedValue({ ok: true }),
    models:
      options.models ??
      vi.fn().mockResolvedValue({
        current: { model: 'deepseek-chat', provider: 'deepseek' },
        models: [
          {
            model: 'deepseek-chat',
            name: 'DeepSeek Chat',
            provider: 'deepseek',
            providerName: 'DeepSeek',
          },
          {
            model: 'deepseek-reasoner',
            name: 'DeepSeek Reasoner',
            provider: 'deepseek',
            providerName: 'DeepSeek',
          },
        ],
        ok: true,
        routable: true,
      }),
    pickDirectory: options.pickDirectory ?? vi.fn().mockResolvedValue('/authorized/new-project'),
    prompt: options.prompt ?? vi.fn().mockResolvedValue({ ok: true }),
    selectModel: options.selectModel ?? vi.fn().mockResolvedValue({ ok: true }),
    conversation: () => face as unknown as DashboardConversationSource,
    loadOlder,
    toolAvailability:
      options.toolAvailability ??
      vi.fn().mockResolvedValue({
        ok: true,
        tools: [
          { id: 'nmap', installed: true },
          { id: 'burp-suite', installed: true },
          { id: 'metasploit', installed: true },
          { id: 'nuclei', installed: true },
        ],
      }),
    updateExecutionPolicy:
      options.updateExecutionPolicy ??
      vi.fn().mockImplementation((_sessionId, policy) => Promise.resolve({ ok: true, policy })),
  }
  const props = {
    runtime,
    useSessions: (<T,>(selector: (state: SessionListState) => T) =>
      selector(list)) as DashboardProps['useSessions'],
    useWorkspaces: vi.fn(),
  } as unknown as DashboardProps
  return { loadOlder, props, runtime }
}

function populatedConversation(): ConversationSnapshot {
  return conversation([
    result(
      'redteam_knowledge_status',
      {
        currentProject: {
          name: 'Juice Shop Review',
          projectId: 'rtp-project',
          startedAt: '2026-08-31T01:02:03Z',
        },
        graphiti: { configured: false, reachable: false },
        local: {
          available: true,
          documentCount: 18,
          eventCount: 7,
          indexState: 'ready',
          indexVersion: 1,
          projectCount: 2,
        },
        ragflow: { configured: false, datasetTypes: [], reachable: false },
      },
      1,
    ),
    result(
      'redteam_project_recall',
      {
        events: [
          { kind: 'task', status: 'active' },
          { kind: 'vulnerability', status: 'confirmed' },
          { kind: 'asset', status: 'resolved' },
        ],
        facts: [],
        projectId: 'rtp-project',
      },
      2,
    ),
    result(
      'redteam_asset_map_frontier',
      {
        edgeCount: 5,
        frontier: [
          {
            depth: 1,
            expanded: false,
            id: 'technology-react',
            label: 'React 18',
            type: 'technology',
            value: 'React 18',
          },
          {
            depth: 1,
            expanded: false,
            id: 'url-local',
            label: 'http://127.0.0.1:3000',
            type: 'url',
            value: 'http://127.0.0.1:3000',
          },
          {
            depth: 1,
            expanded: false,
            id: 'domain-example',
            label: 'example.com',
            type: 'domain',
            value: 'example.com',
          },
          {
            depth: 2,
            expanded: false,
            id: 'domain-api-example',
            label: 'api.example.com',
            type: 'domain',
            value: 'api.example.com',
          },
          {
            depth: 1,
            expanded: false,
            id: 'ip-local',
            label: '127.0.0.1',
            type: 'ip',
            value: '127.0.0.1',
          },
        ],
        frontierCount: 5,
        graphId: 'asset-1',
        domainCounts: { registrable: 1, subdomain: 1, unclassified: 0 },
        ipCounts: { ipv4: 1, ipv6: 0 },
        maxDepth: 3,
        nodeCount: 6,
        seed: {
          depth: 0,
          expanded: true,
          id: 'product-juice-shop',
          label: 'OWASP Juice Shop',
          type: 'product',
          value: 'OWASP Juice Shop',
        },
        sourceCount: 6,
        typeCounts: {
          asn: 0,
          certificate: 0,
          domain: 2,
          infrastructure: 0,
          ip: 1,
          network: 0,
          organization: 0,
          product: 1,
          supplier: 0,
          technology: 1,
          url: 1,
        },
      },
      3,
    ),
    result(
      'redteam_scan',
      { assessmentId: 'a-1', filesScanned: 8, findingCount: 1, truncated: false },
      4,
    ),
    result(
      'redteam_findings',
      {
        findings: [
          {
            id: 'f-1',
            location: { line: 42, path: 'src/server.ts' },
            severity: 'critical',
            status: 'confirmed',
            title: 'Command injection candidate',
          },
        ],
        total: 1,
      },
      5,
    ),
    result(
      'redteam_report',
      { findingCount: 1, format: 'markdown', path: '.dsh-redteam/reports/a-1.md' },
      6,
    ),
    userMessage('请检查当前项目，token=should-not-render', 7),
    assistantMessage('已读取项目状态。', 8, {
      input_tokens: 120,
      input_tokens_details: { cached_tokens: 80 },
      output_tokens: 30,
      total_tokens: 150,
    }),
    userMessage('请刷新当前红队项目状态。先调用 redteam_status 核对授权边界和最近评估。', 9),
  ])
}

function manyAssetConversation(): ConversationSnapshot {
  const frontier = Array.from({ length: 12 }, (_, index) => ({
    depth: 1,
    expanded: false,
    id: `domain-${String(index + 1)}`,
    label: `service-${String(index + 1)}.example.com`,
    type: 'domain',
    value: `service-${String(index + 1)}.example.com`,
  }))
  return conversation([
    result(
      'redteam_asset_map_frontier',
      {
        edgeCount: 12,
        frontier,
        frontierCount: 12,
        graphId: 'asset-many',
        nodeCount: 13,
        seed: {
          depth: 0,
          expanded: true,
          id: 'product-redis',
          label: 'Redis 7.2',
          type: 'product',
          value: 'Redis 7.2',
        },
        sourceCount: 13,
      },
      1,
    ),
  ])
}

describe('Red Team dashboard', () => {
  it('shows a small warning below each built-in tool that is not installed', async () => {
    const { props, runtime } = dashboardProps(conversation(), {
      toolAvailability: vi.fn().mockResolvedValue({
        ok: true,
        tools: [
          { id: 'nmap', installed: false },
          { id: 'burp-suite', installed: true },
          { id: 'metasploit', installed: false },
          { id: 'nuclei', installed: false },
        ],
      }),
    })
    render(<Dashboard {...props} />)

    await waitFor(() => expect(runtime.toolAvailability).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('tab', { name: '工具集成' }))
    await waitFor(() => expect(screen.getAllByText('工具未安装')).toHaveLength(3))

    const nmap = screen.getByRole('checkbox', { name: /Nmap/u }).closest('label')
    const burp = screen.getByRole('checkbox', { name: /Burp Suite/u }).closest('label')
    if (nmap === null || burp === null) throw new Error('missing built-in tool choices')
    expect(within(nmap).getByText('工具未安装').className).toContain(
      'dsh-redteam-dashboard__tool-installation-warning',
    )
    expect(within(burp).queryByText('工具未安装')).toBeNull()
  })

  it('renders all modules and switches directly between full-screen and icon rail', async () => {
    const { props, runtime } = dashboardProps(populatedConversation())
    render(<Dashboard {...props} />)

    expect(screen.getByRole('complementary', { name: '棱镜看板' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '棱镜' })).toBeTruthy()
    expect(screen.getByText('PRISM')).toBeTruthy()
    const operationMode = screen.getByRole('combobox', { name: '棱镜模式' }) as HTMLSelectElement
    await waitFor(() => expect(operationMode.disabled).toBe(false))
    expect(Array.from(operationMode.options, (option) => option.textContent)).toEqual([
      '信息收集',
      '主动扫描',
      '漏洞验证',
      '全部允许',
    ])
    expect(operationMode.value).toBe('passive')
    fireEvent.change(operationMode, { target: { value: 'full' } })
    expect(screen.getByRole('dialog', { name: '启用全部允许模式？' })).toBeTruthy()
    expect(operationMode.value).toBe('passive')
    const confirmFullMode = screen.getByRole('button', { name: '确认全部允许' })
    expect(confirmFullMode.className).toContain('dsh-redteam-dashboard__button--danger')
    fireEvent.click(confirmFullMode)
    await waitFor(() => expect(operationMode.value).toBe('full'))
    expect(operationMode.closest('label')?.dataset.risk).toBe('true')
    fireEvent.change(operationMode, { target: { value: 'passive' } })
    expect(screen.getByRole('tab', { name: '项目状态' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '资产情况' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '漏洞汇总' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '工具集成' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: '权限维持' })).toBeNull()
    expect(screen.queryByRole('tab', { name: '代码审计' })).toBeNull()
    expect(screen.queryByRole('tab', { name: '漏洞验证' })).toBeNull()
    expect(screen.queryByRole('tab', { name: '知识库' })).toBeNull()
    expect(screen.queryByRole('tab', { name: '横向攻击' })).toBeNull()
    expect(screen.queryByRole('tab', { name: '安全报告' })).toBeNull()
    expect(document.body.dataset.dshRedteamDashboard).toBe('fullscreen')
    expect(screen.queryByRole('button', { name: '全屏展开' })).toBeNull()
    expect(screen.queryByRole('button', { name: '退出全屏' })).toBeNull()

    expect(screen.queryByRole('img', { name: '资产详情' })).toBeNull()
    expect(screen.getAllByText('Juice Shop Review').length).toBeGreaterThan(0)
    const projectBody = screen.getByRole('tabpanel')
    const primaryCards = ['项目概览', '模型情况'].map((name) =>
      within(projectBody).getByRole('heading', { name }).closest('section'),
    )
    expect(primaryCards.every((card) => card !== null)).toBe(true)
    expect(primaryCards[1]?.parentElement).toBe(primaryCards[0]?.parentElement)
    expect(primaryCards[0]?.parentElement?.querySelectorAll(':scope > section')).toHaveLength(2)
    expect(within(projectBody).queryByRole('heading', { name: '项目进度' })).toBeNull()
    expect(within(projectBody).queryByRole('heading', { name: '漏洞汇总' })).toBeNull()
    const projectOverview = primaryCards[0]
    if (projectOverview === null || projectOverview === undefined)
      throw new Error('missing project overview')
    expect(within(projectOverview).queryByText('节点进度')).toBeNull()
    expect(within(projectOverview).queryByText('已完成节点')).toBeNull()
    expect(within(projectOverview).queryByText('未开始节点')).toBeNull()
    const collectionCards = ['信息收集', '目标范围'].map((name) =>
      within(projectBody).getByRole('heading', { name }).closest('section'),
    )
    expect(collectionCards.every((card) => card !== null)).toBe(true)
    expect(collectionCards[1]?.parentElement).toBe(collectionCards[0]?.parentElement)
    expect(collectionCards[0]?.parentElement?.className).toContain(
      'dsh-redteam-dashboard__project-collection-grid',
    )
    expect(collectionCards[0]?.parentElement?.querySelectorAll(':scope > section')).toHaveLength(2)
    const actionCards = ['漏洞扫描', '漏洞验证'].map((name) =>
      within(projectBody).getByRole('heading', { name }).closest('section'),
    )
    expect(actionCards.every((card) => card !== null)).toBe(true)
    const actionRow = projectBody.querySelector('.dsh-redteam-dashboard__project-action-grid')
    expect(actionRow).not.toBeNull()
    expect(actionCards.every((card) => card?.parentElement === actionRow)).toBe(true)
    expect(
      Array.from(
        actionRow?.querySelectorAll(':scope > section') ?? [],
        (section) => section.querySelector('.dsh-redteam-dashboard__card-title')?.textContent,
      ),
    ).toEqual(['漏洞扫描', '漏洞验证'])
    const exportGroup = within(projectOverview).getByRole('group', { name: '结果导出' })
    expect(exportGroup).toBeTruthy()
    expect(exportGroup.closest('[data-project-panel="project-overview"]')).toBe(projectOverview)
    expect(screen.getByText('总体完成度')).toBeTruthy()
    expect(screen.queryByText('项目事件')).toBeNull()
    expect(screen.getByText('输入 Token')).toBeTruthy()
    expect(screen.getByText('120')).toBeTruthy()
    expect(screen.getByText('输出 Token')).toBeTruthy()
    expect(screen.getByText('30')).toBeTruthy()
    expect(screen.getByText('缓存命中率')).toBeTruthy()
    expect(screen.getByText('66.7%')).toBeTruthy()
    expect(screen.getByText('费用消耗')).toBeTruthy()
    const modelSelect = await screen.findByRole('combobox', { name: '模型选择' })
    await waitFor(() => expect((modelSelect as HTMLSelectElement).options).toHaveLength(2))
    fireEvent.change(modelSelect, { target: { value: 'deepseek::deepseek-reasoner' } })
    await waitFor(() =>
      expect(runtime.selectModel).toHaveBeenCalledWith(expect.any(String), {
        model: 'deepseek-reasoner',
        provider: 'deepseek',
      }),
    )
    expect(screen.getByRole('heading', { name: '会话对话' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '对话历史' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: '项目状态' })).toHaveLength(1)
    expect(
      screen.queryByText('统一管理项目进度、信息收集、漏洞测试、结果导出和当前会话。'),
    ).toBeNull()
    expect(screen.queryByText('选择报告类型和文件格式后导出当前结果。')).toBeNull()
    expect(screen.queryByRole('button', { name: '刷新项目状态' })).toBeNull()
    expect(screen.queryByText('授权范围')).toBeNull()
    expect(screen.queryByText('人工审核')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '收起为图标栏' }))
    expect(document.body.dataset.dshRedteamDashboard).toBe('collapsed')
    expect(screen.getByRole('button', { name: '全屏展开棱镜看板' })).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: '棱镜看板' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '全屏展开棱镜看板' }))
    expect(document.body.dataset.dshRedteamDashboard).toBe('fullscreen')

    const reportType = screen.getByRole('combobox', { name: '报告类型' }) as HTMLSelectElement
    const reportFormat = screen.getByRole('combobox', { name: '导出格式' }) as HTMLSelectElement
    expect(reportType.options).toHaveLength(3)
    expect(reportFormat.options).toHaveLength(3)
    fireEvent.change(reportType, {
      target: { value: 'vulnerability' },
    })
    fireEvent.change(reportFormat, {
      target: { value: 'html' },
    })
    const exportButton = screen.getByRole('button', { name: '导出报告' })
    expect(exportButton.className).not.toContain('dsh-redteam-dashboard__button--primary')
    fireEvent.click(exportButton)
    await waitFor(() => expect(runtime.prompt).toHaveBeenCalledTimes(1))
    expect(runtime.prompt).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.stringMatching(/漏洞详情.*html.*redteam_report/u),
    )
  })

  it('runs collection and analysis from project status, then keeps result tabs read-only', async () => {
    const { props, runtime } = dashboardProps(populatedConversation(), {
      pickDirectory: vi.fn().mockResolvedValue('/authorized/review-source'),
    })
    render(<Dashboard {...props} />)

    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: '棱镜模式' }) as HTMLSelectElement).disabled,
      ).toBe(false),
    )

    const collection = screen.getByRole('heading', { name: '信息收集' }).closest('section')
    if (collection === null) throw new Error('missing collection controls')
    expect(
      within(collection)
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.parentElement?.querySelector('strong')?.textContent),
    ).toEqual(['域名', 'IP', '端口', '服务'])
    expect(screen.queryByText('主体、股东、子公司与关联组织')).toBeNull()
    expect(screen.queryByText('公开站点、接口、应用与服务入口')).toBeNull()
    fireEvent.change(within(collection).getByRole('textbox', { name: '域名或 IP' }), {
      target: { value: 'example.com' },
    })
    fireEvent.click(within(collection).getByRole('checkbox', { name: /服务/u }))
    const collectionButton = within(collection).getByRole('button', { name: '开始采集' })
    expect(collectionButton.className).not.toContain('dsh-redteam-dashboard__button--primary')
    fireEvent.click(collectionButton)
    await waitFor(() => expect(runtime.prompt).toHaveBeenCalledTimes(1))
    expect(runtime.prompt).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.stringMatching(
        /example\.com.*域名、IP、端口.*公开资料或当前项目已有证据.*不得.*主动扫描端口/u,
      ),
    )

    const testingScope = screen.getByRole('heading', { name: '目标范围' }).closest('section')
    if (testingScope === null) throw new Error('missing testing scope')
    expect(within(testingScope).getByText('已选 0 / 6')).toBeTruthy()
    const domainScope = within(testingScope).getByRole('checkbox', {
      name: '将 example.com 纳入目标范围',
    })
    const ipScope = within(testingScope).getByRole('checkbox', {
      name: '将 127.0.0.1 纳入目标范围',
    })
    fireEvent.click(domainScope)
    fireEvent.change(within(testingScope).getByRole('combobox', { name: 'example.com 范围规则' }), {
      target: { value: 'subdomains' },
    })
    fireEvent.click(ipScope)
    fireEvent.change(within(testingScope).getByRole('combobox', { name: '127.0.0.1 范围规则' }), {
      target: { value: 'all-ports' },
    })
    expect(within(testingScope).getByText('已选 2 / 6')).toBeTruthy()
    const confirmScopeButton = within(testingScope).getByRole('button', {
      name: '确认范围',
    }) as HTMLButtonElement
    expect(confirmScopeButton.disabled).toBe(false)
    expect(within(testingScope).getByRole('button', { name: '清空选择' })).toBeTruthy()

    const analysis = screen.getByRole('heading', { name: '漏洞扫描' }).closest('section')
    if (analysis === null) throw new Error('missing project action controls')
    expect(within(analysis).getAllByRole('button')).toHaveLength(1)
    expect(within(analysis).queryByText('开源组件')).toBeNull()
    expect(within(analysis).queryByRole('button', { name: '全选' })).toBeNull()
    expect(within(analysis).queryByRole('button', { name: '清空' })).toBeNull()
    expect(within(analysis).queryByRole('button', { name: /生成验证方案/u })).toBeNull()
    fireEvent.click(confirmScopeButton)
    await waitFor(() => expect(within(analysis).getAllByRole('checkbox').length).toBeGreaterThan(0))
    expect(within(analysis).queryByRole('combobox', { name: '分析目标' })).toBeNull()
    const analysisTypes = within(analysis).getByRole('group', { name: '漏洞扫描类型' })
    expect(
      within(analysisTypes)
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.parentElement?.querySelector('strong')?.textContent),
    ).toEqual([
      '注入与执行',
      '身份与权限',
      '文件与数据',
      '配置与暴露',
      '组件与供应链',
      '业务逻辑',
      '网络服务暴露',
    ])
    const analysisButton = within(analysis).getByRole('button', {
      name: '开始扫描',
    }) as HTMLButtonElement
    expect(analysisButton.disabled).toBe(true)
    fireEvent.click(within(analysisTypes).getByRole('checkbox', { name: '注入与执行' }))
    fireEvent.click(within(analysisTypes).getByRole('checkbox', { name: '身份与权限' }))
    expect(analysisButton.disabled).toBe(false)
    fireEvent.click(analysisButton)
    await waitFor(() => expect(runtime.prompt).toHaveBeenCalledTimes(2))
    expect(runtime.prompt).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.stringMatching(
        /注入与执行.*身份与权限.*example\.com.*domain.*127\.0\.0\.1.*ip.*全部子域名.*全部端口.*redteam_asset_map_frontier.*redteam_findings.*redteam_update_finding.*confirmed.*只分析已有数据/u,
      ),
    )
    const analysisPrompt = vi.mocked(runtime.prompt).mock.calls.at(-1)?.[1] ?? ''
    expect(analysisPrompt).toContain('不向目标发起请求')

    const validation = screen.getByRole('heading', { name: '漏洞验证' }).closest('section')
    if (validation === null) throw new Error('missing vulnerability validation controls')
    fireEvent.change(screen.getByRole('combobox', { name: '棱镜模式' }), {
      target: { value: 'exploitation' },
    })
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: '棱镜模式' }) as HTMLSelectElement).value).toBe(
        'exploitation',
      ),
    )
    expect(within(validation).queryByRole('group', { name: '漏洞验证类型' })).toBeNull()
    expect(within(validation).queryByRole('button', { name: '开始验证' })).toBeNull()
    const findingSelect = within(validation).getByRole('combobox', {
      name: '漏洞选择',
    }) as HTMLSelectElement
    expect(Array.from(findingSelect.options, (option) => option.textContent)).toEqual([
      '选择已验证漏洞',
      'Command injection candidate · critical',
    ])
    fireEvent.change(findingSelect, { target: { value: 'f-1' } })
    const exploitationTypes = within(validation).getByRole('group', { name: '漏洞验证类型' })
    expect(
      within(exploitationTypes)
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.parentElement?.querySelector('strong')?.textContent),
    ).toEqual(['命令执行'])
    const validationButton = within(validation).getByRole('button', {
      name: '开始验证',
    }) as HTMLButtonElement
    expect(validationButton.disabled).toBe(true)
    fireEvent.click(within(exploitationTypes).getByRole('checkbox', { name: '命令执行' }))
    fireEvent.click(validationButton)
    await waitFor(() => expect(runtime.prompt).toHaveBeenCalledTimes(3))
    expect(runtime.prompt).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.stringMatching(
        /非破坏性.*命令执行.*f-1.*Command injection candidate.*example\.com.*全部子域名.*不得向目标发送利用请求.*不得生成或执行 payload/u,
      ),
    )

    fireEvent.click(screen.getByRole('tab', { name: '工具集成' }))
    const toolIntegration = screen.getByRole('heading', { name: '工具集成' }).closest('section')
    if (toolIntegration === null) throw new Error('missing tool integration controls')
    const executionDetails = screen.getByLabelText('执行详情')
    expect(within(executionDetails).getByRole('heading', { name: '执行详情' })).toBeTruthy()
    expect(toolIntegration.contains(executionDetails)).toBe(false)
    expect(within(toolIntegration).getAllByRole('checkbox')).toHaveLength(4)
    expect(within(toolIntegration).queryByText(/Semgrep|Trivy|Gitleaks|OWASP ZAP/u)).toBeNull()
    expect(within(toolIntegration).getByText('内置 · Web扫描')).toBeTruthy()
    const confirmToolSelection = within(toolIntegration).getByRole('button', {
      name: '确认选择',
    }) as HTMLButtonElement
    expect(confirmToolSelection.disabled).toBe(true)
    const nmap = within(toolIntegration).getByRole('checkbox', { name: /Nmap/u })
    fireEvent.click(nmap)
    expect(within(toolIntegration).getByText('已开启 0')).toBeTruthy()
    expect(within(toolIntegration).getByText('已选择 1 个工具')).toBeTruthy()
    expect(confirmToolSelection.disabled).toBe(false)
    fireEvent.click(confirmToolSelection)
    await waitFor(() => expect(within(toolIntegration).getByText('已开启 1')).toBeTruthy())
    expect(confirmToolSelection.disabled).toBe(true)
    const addToolPanel = within(toolIntegration)
      .getByRole('heading', {
        name: '添加工具',
      })
      .closest('section')
    if (addToolPanel === null) throw new Error('missing add tool panel')
    expect(addToolPanel.classList.contains('dsh-redteam-dashboard__add-tool-panel')).toBe(true)
    fireEvent.change(within(toolIntegration).getByRole('textbox', { name: '工具名称' }), {
      target: { value: 'custom-passive-audit' },
    })
    const addMcpTool = within(toolIntegration).getByRole('button', {
      name: '添加工具',
    }) as HTMLButtonElement
    expect(addMcpTool.disabled).toBe(true)
    fireEvent.change(within(toolIntegration).getByRole('textbox', { name: '接口地址' }), {
      target: { value: 'http://127.0.0.1:7777/mcp' },
    })
    const mcpTransport = within(toolIntegration).getByRole('combobox', {
      name: 'MCP协议',
    }) as HTMLSelectElement
    expect(Array.from(mcpTransport.options, (option) => option.textContent)).toEqual([
      'HTTP',
      'SSE',
      'STDIO',
    ])
    fireEvent.change(mcpTransport, { target: { value: 'sse' } })
    fireEvent.click(addMcpTool)
    expect(within(toolIntegration).getByText('已开启 1')).toBeTruthy()
    const customTool = within(toolIntegration).getByRole('checkbox', {
      name: /custom-passive-audit.*MCP/u,
    }) as HTMLInputElement
    expect(customTool.checked).toBe(false)
    expect(within(toolIntegration).getByText('MCP · SSE')).toBeTruthy()
    expect(within(toolIntegration).getByText('http://127.0.0.1:7777/mcp')).toBeTruthy()
    fireEvent.click(customTool)
    expect(within(toolIntegration).getByText('已选择 2 个工具')).toBeTruthy()
    fireEvent.click(confirmToolSelection)
    await waitFor(() => expect(within(toolIntegration).getByText('已开启 2')).toBeTruthy())
    expect(customTool.checked).toBe(true)
    expect(
      Array.from(screen.getAllByLabelText(/执行详情/u), (section) =>
        section.getAttribute('data-tool-section'),
      ),
    ).toEqual(['results'])
    expect(within(executionDetails).getByText('redteam_report')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '资产情况' }))
    const assetOverview = screen.getByRole('heading', { name: '资产概览' }).closest('section')
    if (assetOverview === null) throw new Error('missing asset overview')
    expect(screen.getByRole('heading', { name: '资产详情' })).toBeTruthy()
    expect(
      Array.from(assetOverview.querySelectorAll('.dsh-redteam-dashboard__metric')).map(
        (metric) => ({
          label: metric.querySelector('.dsh-redteam-dashboard__metric-label')?.textContent,
          value: metric.querySelector('.dsh-redteam-dashboard__metric-value')?.textContent,
        }),
      ),
    ).toEqual([
      { label: '域名', value: '2' },
      { label: 'IP', value: '1' },
      { label: '端口', value: '1' },
      { label: '服务', value: '2' },
    ])
    expect(within(assetOverview).queryByText('公开来源')).toBeNull()
    expect(screen.getAllByText('OWASP Juice Shop').length).toBeGreaterThan(0)
    expect(screen.getAllByText('React 18').length).toBeGreaterThan(0)
    expect(screen.getAllByText('6 个资产')).toHaveLength(2)
    expect(screen.queryByRole('textbox', { name: '域名或 IP' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /开始采集/u })).toBeNull()

    const graph = screen.getByRole('img', { name: '资产详情' })
    expect(graph.querySelector('[data-status="vulnerable"]')).toBeTruthy()
    expect(graph.querySelectorAll('[data-status="pending"]')).toHaveLength(5)
    expect(graph.querySelector('[data-graph-zoom="1.0"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '放大资产详情' }))
    expect(graph.querySelector('[data-graph-zoom="1.2"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '缩小资产详情' }))
    expect(graph.querySelector('[data-graph-zoom="1.0"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '漏洞汇总' }))
    expect(screen.getByRole('heading', { name: '漏洞概览' })).toBeTruthy()
    const vulnerabilityOverview = screen
      .getByRole('heading', { name: '漏洞概览' })
      .closest('section')
    if (vulnerabilityOverview === null) throw new Error('missing vulnerability overview')
    expect(within(vulnerabilityOverview).getByText('漏洞总数')).toBeTruthy()
    expect(within(vulnerabilityOverview).getByText('需要进一步处置')).toBeTruthy()
    expect(
      within(vulnerabilityOverview).getByText(
        '已载入 1 条漏洞，其中 1 条为高优先级；详细证据按条目显示在下方。',
      ),
    ).toBeTruthy()
    expect(within(vulnerabilityOverview).queryByText(/已扫描文件|已载入详情/u)).toBeNull()
    expect(
      Array.from(
        vulnerabilityOverview.querySelectorAll(
          '.dsh-redteam-dashboard__severity-summary [data-severity]',
        ),
        (item) => item.textContent,
      ),
    ).toEqual(['1critical', '0high', '0medium', '0low'])
    const vulnerabilityDetails = screen
      .getByRole('heading', { name: '漏洞详情' })
      .closest('section')
    if (vulnerabilityDetails === null) throw new Error('missing vulnerability details')
    expect(
      vulnerabilityOverview.compareDocumentPosition(vulnerabilityDetails) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(screen.getByText('Command injection candidate')).toBeTruthy()
    expect(screen.getByText('src/server.ts:42')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '开始审计' })).toBeNull()
    expect(screen.queryByRole('button', { name: '开始扫描' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '审计目录' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: '分析目标' })).toBeNull()
  })

  it('shows a bounded testing-scope preview and derives Redis vulnerability types', async () => {
    const { props } = dashboardProps(manyAssetConversation())
    render(<Dashboard {...props} />)

    const testingScope = screen.getByRole('heading', { name: '目标范围' }).closest('section')
    if (testingScope === null) throw new Error('missing testing scope')
    await waitFor(() =>
      expect(
        (
          within(testingScope).getByRole('checkbox', {
            name: '将 Redis 7.2 纳入目标范围',
          }) as HTMLInputElement
        ).disabled,
      ).toBe(false),
    )
    expect(within(testingScope).getByText('已选 0 · 展示 8 / 13')).toBeTruthy()
    expect(within(testingScope).getAllByRole('checkbox')).toHaveLength(8)
    expect(within(testingScope).getByText(/当前仅展示前 8 个节点/u)).toBeTruthy()

    fireEvent.click(
      within(testingScope).getByRole('checkbox', { name: '将 Redis 7.2 纳入目标范围' }),
    )
    fireEvent.click(within(testingScope).getByRole('button', { name: '确认范围' }))

    const analysis = screen.getByRole('heading', { name: '漏洞扫描' }).closest('section')
    if (analysis === null) throw new Error('missing vulnerability analysis')
    await waitFor(() => expect(within(analysis).getByText('1 个资产 · 5 类')).toBeTruthy())
    expect(
      within(within(analysis).getByRole('group', { name: '漏洞扫描类型' }))
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.parentElement?.querySelector('strong')?.textContent),
    ).toEqual(['未授权访问', '弱口令与鉴权', '危险配置', '数据暴露', '命令执行'])
  })

  it('shows one project node and empty vulnerability details before collection', () => {
    const { props } = dashboardProps(conversation())
    render(<Dashboard {...props} />)

    expect(screen.queryByText('开源组件')).toBeNull()
    expect(screen.queryByRole('button', { name: /生成验证方案/u })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /注入类/u })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '审计目录' })).toBeNull()
    expect(screen.queryByRole('button', { name: '选择代码目录' })).toBeNull()
    expect(screen.getByText('完成信息收集后选择授权目标。')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: '分析目标' })).toBeNull()
    expect(
      within(screen.getByRole('group', { name: '漏洞扫描类型' })).queryAllByRole('checkbox'),
    ).toHaveLength(0)
    expect(screen.getByText('待确认范围')).toBeTruthy()
    expect((screen.getByRole('button', { name: '开始扫描' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.queryByRole('group', { name: '漏洞验证类型' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: '漏洞选择' })).toBeNull()
    expect(screen.getByText('暂无可验证漏洞')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '开始验证' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '工具集成' }))
    expect(screen.getByText('暂无工具执行结果。')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '资产情况' }))
    const emptyOverview = screen.getByRole('heading', { name: '资产概览' }).closest('section')
    if (emptyOverview === null) throw new Error('missing empty asset overview')
    expect(
      Array.from(
        emptyOverview.querySelectorAll('.dsh-redteam-dashboard__metric-value'),
        (metric) => metric.textContent,
      ),
    ).toEqual(Array.from({ length: 4 }, () => '—'))
    expect(within(emptyOverview).queryByText('公开来源')).toBeNull()
    expect(screen.getByRole('heading', { name: '资产详情' })).toBeTruthy()
    const graph = screen.getByRole('img', { name: '资产详情' })
    expect(graph.querySelectorAll('.dsh-redteam-dashboard__graph-node')).toHaveLength(1)
    expect(screen.getByText('尚未采集资产，当前仅显示项目节点。')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '漏洞汇总' }))
    expect(screen.getByRole('heading', { name: '漏洞概览' })).toBeTruthy()
    const emptyVulnerabilityOverview = screen
      .getByRole('heading', { name: '漏洞概览' })
      .closest('section')
    if (emptyVulnerabilityOverview === null) throw new Error('missing empty vulnerability overview')
    expect(within(emptyVulnerabilityOverview).getByText('漏洞总数')).toBeTruthy()
    expect(within(emptyVulnerabilityOverview).getByText('当前未发现漏洞')).toBeTruthy()
    expect(within(emptyVulnerabilityOverview).queryByText(/已扫描文件|已载入详情/u)).toBeNull()
    expect(
      Array.from(
        emptyVulnerabilityOverview.querySelectorAll(
          '.dsh-redteam-dashboard__severity-summary [data-severity]',
        ),
        (item) => item.textContent,
      ),
    ).toEqual(['0critical', '0high', '0medium', '0low'])
    expect(screen.getByRole('heading', { name: '漏洞详情' })).toBeTruthy()
    expect(screen.getByText('暂无漏洞详情。')).toBeTruthy()
    expect(
      within(emptyVulnerabilityOverview).getByText('完成漏洞扫描后，这里会汇总已识别漏洞。'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: '开始审计' })).toBeNull()
    expect(screen.queryByRole('button', { name: '开始扫描' })).toBeNull()
  })

  it('keeps project session management and hidden knowledge details out of the dashboard', () => {
    const { props } = dashboardProps(
      conversation([
        result(
          'redteam_knowledge_status',
          {
            currentProject: null,
            graphiti: { configured: true, reachable: false },
            local: {
              available: false,
              documentCount: 120,
              eventCount: 44,
              indexState: 'degraded',
              indexVersion: 9,
              projectCount: 8,
            },
            ragflow: { configured: true, datasetTypes: [], reachable: false },
          },
          1,
        ),
      ]),
    )
    render(<Dashboard {...props} />)
    expect(screen.queryByText(/知识库|Graphiti|RAGFlow|索引 v/u)).toBeNull()
    expect(screen.queryByRole('textbox', { name: '项目名称' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '项目路径' })).toBeNull()
    expect(screen.queryByRole('button', { name: '选择目录' })).toBeNull()
    expect(screen.queryByRole('button', { name: '创建项目' })).toBeNull()
    expect(screen.queryByRole('button', { name: '读取项目' })).toBeNull()
    expect(screen.queryByRole('button', { name: '刷新项目状态' })).toBeNull()
  })

  it('shows a redacted conversation history at the bottom and sends new messages', async () => {
    const loadOlder = vi.fn().mockResolvedValue(undefined)
    const snapshot = conversation(
      [
        userMessage('请保留这条消息，token=supersecretvalue', 1),
        userMessage('这是运行期间追加的问题', 2, 'steering'),
        assistantMessage('这是助手的可见回复。', 3),
        result('redteam_status', { token: 'tool-secret-string' }, 4),
        userMessage('请刷新当前红队项目状态。先调用 redteam_status 核对授权边界和最近评估。', 5),
      ],
      {
        hasMore: true,
        partial: {
          blocks: [
            { kind: 'text', text: '正在生成的回复' },
            { kind: 'reasoning', text: '流式推理不应展示' },
          ],
          step: 2,
          turn: 2,
        },
        running: true,
      },
    )
    const { props, runtime } = dashboardProps(snapshot, { loadOlder })
    render(<Dashboard {...props} />)

    const body = screen.getByRole('tabpanel')
    expect(body.lastElementChild?.hasAttribute('data-project-conversation')).toBe(true)
    const conversationPanel = body.querySelector('[data-project-conversation]')
    expect(conversationPanel?.parentElement).toBe(body)
    expect(
      conversationPanel?.closest(
        '.dsh-redteam-dashboard__project-primary-grid, .dsh-redteam-dashboard__project-action-grid',
      ),
    ).toBeNull()
    const history = screen.getByLabelText('对话历史')
    expect(screen.queryByRole('complementary', { name: '棱镜工作区' })).toBeNull()
    const composer = screen.getByRole('form', { name: '会话输入' })
    expect(history.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(composer.className).toContain('dsh-redteam-dashboard__conversation-composer')
    expect(screen.getByText('请保留这条消息，token=[redacted]')).toBeTruthy()
    expect(screen.queryByText(/supersecretvalue/u)).toBeNull()
    expect(screen.getByText('这是运行期间追加的问题')).toBeTruthy()
    expect(screen.getByText('这是助手的可见回复。')).toBeTruthy()
    expect(screen.getByText('正在生成的回复')).toBeTruthy()
    expect(screen.queryByText('不应展示的推理内容')).toBeNull()
    expect(screen.queryByText('流式推理不应展示')).toBeNull()
    expect(screen.queryByText(/tool-secret-string/u)).toBeNull()
    expect(screen.queryByText(/授权边界/u)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '加载更早对话' }))
    await waitFor(() => expect(loadOlder).toHaveBeenCalledTimes(1))

    const input = screen.getByRole('textbox', { name: '会话消息' })
    expect(input.className).toContain('dsh-redteam-dashboard__conversation-input')
    expect(screen.getByRole('button', { name: '发送消息' }).className).toContain(
      'dsh-redteam-dashboard__conversation-send',
    )
    fireEvent.change(input, {
      target: { value: '继续检查登录流程' },
    })
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter', shiftKey: true })
    expect(runtime.prompt).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' })
    await waitFor(() =>
      expect(runtime.prompt).toHaveBeenCalledWith(expect.any(String), '继续检查登录流程'),
    )
  })

  it('offers only a full-screen dashboard and the reduced collapsed rail', () => {
    const frame = document.createElement('div')
    const nativeSidebar = document.createElement('div')
    const center = document.createElement('div')
    const details = document.createElement('div')
    const overlay = document.createElement('div')
    overlay.dataset.shellOverlay = ''
    frame.append(nativeSidebar, center, details, overlay)
    document.body.append(frame)
    vi.spyOn(nativeSidebar, 'getBoundingClientRect').mockReturnValue({
      bottom: 0,
      height: 0,
      left: 0,
      right: 248,
      toJSON: () => ({}),
      top: 0,
      width: 248,
      x: 0,
      y: 0,
    })

    const { props } = dashboardProps(conversation())
    const view = render(<Dashboard {...props} />, { container: overlay })
    expect(frame.dataset.dshRedteamSidebar).toBe('fullscreen')
    expect(frame.style.getPropertyValue('--dsh-redteam-native-sidebar-width')).toBe('248px')
    fireEvent.click(screen.getByRole('button', { name: '收起为图标栏' }))
    expect(frame.dataset.dshRedteamSidebar).toBe('collapsed')
    expect(screen.getByRole('button', { name: '全屏展开棱镜看板' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '项目状态' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '资产情况' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '漏洞汇总' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '工具集成' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '权限维持' })).toBeNull()
    expect(screen.queryByRole('button', { name: '知识库' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '资产情况' }))
    expect(frame.dataset.dshRedteamSidebar).toBe('fullscreen')
    expect(screen.getByRole('tab', { name: '资产情况' }).getAttribute('aria-selected')).toBe('true')
    view.unmount()
    expect(frame.dataset.dshRedteamSidebar).toBeUndefined()
    expect(frame.style.getPropertyValue('--dsh-redteam-native-sidebar-width')).toBe('')
    frame.remove()
  })

  it('renders nothing outside Red Team mode', () => {
    const { props } = dashboardProps(conversation(), { agentPreset: 'default' })
    const view = render(<Dashboard {...props} />)
    expect(view.container.innerHTML).toBe('')
    expect(document.body.dataset.dshRedteamDashboard).toBeUndefined()
  })
})
