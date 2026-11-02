import { currentSession } from '../../src/client/runtime-contract.js'
import type {
  DashboardConversationSnapshot as ConversationSnapshot,
  RunningToolCall,
  ToolResultNode,
} from '../../src/client/runtime-contract.js'
import { describe, expect, it } from 'vitest'
import { deriveDashboardState } from '../../src/client/dashboard-state.js'

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

function snapshot(
  nodes: readonly ToolResultNode[],
  runningCalls: readonly RunningToolCall[] = [],
): ConversationSnapshot {
  return { nodes, runningCalls } as ConversationSnapshot
}

describe('Red Team dashboard state', () => {
  it('applies the latest successful finding update only to its assessment and after its list', () => {
    const finding = {
      id: 'f1',
      title: 'SQL',
      location: { path: 'a.ts', line: 1 },
      severity: 'high',
      status: 'candidate',
    }
    const list = result(
      'redteam_findings',
      { assessmentId: 'a1', findings: [finding], total: 1 },
      2,
    )
    const updated = (assessmentId: string, status: string, seq: number) =>
      result('redteam_update_finding', { assessmentId, finding: { ...finding, status } }, seq)
    expect(
      deriveDashboardState(
        snapshot([list, updated('a1', 'confirmed', 3), updated('a1', 'fixed', 4)]),
      ).findings[0]?.status,
    ).toBe('fixed')
    expect(
      deriveDashboardState(snapshot([list, updated('a2', 'fixed', 3)])).findings[0]?.status,
    ).toBe('candidate')
    expect(
      deriveDashboardState(snapshot([updated('a1', 'fixed', 1), list])).findings[0]?.status,
    ).toBe('candidate')
    const failed = { ...updated('a1', 'fixed', 3), isError: true }
    expect(deriveDashboardState(snapshot([list, failed])).findings[0]?.status).toBe('candidate')
  })

  it('folds the latest scan, redacted findings, and report into bounded UI state', () => {
    const state = deriveDashboardState(
      snapshot([
        result(
          'redteam_scan',
          { assessmentId: 'a-1', filesScanned: 12, findingCount: 2, truncated: false },
          1,
        ),
        result(
          'redteam_findings',
          {
            findings: [
              {
                id: 'f-1',
                location: { line: 9, path: 'src/auth.ts' },
                severity: 'high',
                status: 'confirmed',
                title: 'Unsafe authorization boundary',
              },
            ],
            total: 2,
          },
          2,
        ),
        result(
          'redteam_report',
          { findingCount: 2, format: 'sarif', path: '.dsh-redteam/reports/a-1.sarif' },
          3,
        ),
        result(
          'redteam_asset_map_frontier',
          {
            frontier: [
              {
                depth: 1,
                expanded: false,
                id: 'node-react',
                label: 'React',
                type: 'technology',
              },
            ],
            graphId: 'asset-1',
            summary: {
              domainCounts: { registrable: 2, subdomain: 3, unclassified: 0 },
              edgeCount: 17,
              frontierCount: 4,
              ipCounts: { ipv4: 2, ipv6: 1 },
              maxDepth: 3,
              nodeCount: 12,
              seed: {
                depth: 0,
                expanded: true,
                id: 'node-project',
                label: 'Example',
                type: 'company',
              },
              sourceCount: 9,
              typeCounts: {
                asn: 0,
                certificate: 1,
                domain: 5,
                ip: 3,
                network: 1,
                organization: 1,
                product: 0,
                technology: 1,
                url: 0,
              },
            },
          },
          4,
        ),
        result(
          'redteam_knowledge_status',
          {
            currentProject: {
              name: 'SRC 2026',
              projectId: 'rtp-20260823010203-a1b2c3d4',
              startedAt: '2026-08-23T01:02:03Z',
            },
            graphiti: { configured: true, reachable: true },
            local: {
              available: true,
              documentCount: 24,
              eventCount: 31,
              indexState: 'ready',
              indexVersion: 3,
              projectCount: 4,
            },
            ragflow: { configured: true, datasetTypes: ['vulnerability'], reachable: true },
          },
          5,
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
            projectId: 'rtp-20260823010203-a1b2c3d4',
          },
          6,
        ),
      ]),
    )

    expect(state).toMatchObject({
      assetMap: {
        completedCount: 8,
        edgeCount: 17,
        frontier: [
          {
            depth: 1,
            expanded: false,
            id: 'node-react',
            label: 'React',
            type: 'technology',
          },
        ],
        frontierCount: 4,
        graphId: 'asset-1',
        inventory: {
          domainCounts: { registrable: 2, subdomain: 3, unclassified: 0 },
          ipCounts: { ipv4: 2, ipv6: 1 },
          typeCounts: {
            asn: 0,
            certificate: 1,
            domain: 5,
            ip: 3,
            network: 1,
            organization: 1,
            product: 0,
            technology: 1,
            url: 0,
          },
        },
        nodeCount: 12,
        seed: {
          depth: 0,
          expanded: true,
          id: 'node-project',
          label: 'Example',
          type: 'company',
        },
        sourceCount: 9,
      },
      findings: [
        {
          id: 'f-1',
          location: 'src/auth.ts:9',
          severity: 'high',
          status: 'confirmed',
          title: 'Unsafe authorization boundary',
        },
      ],
      findingsTotal: 2,
      project: {
        completedEventCount: 2,
        currentProjectId: 'rtp-20260823010203-a1b2c3d4',
        currentProjectName: 'SRC 2026',
        eventCount: 3,
        pendingEventCount: 1,
        startedAt: '2026-08-23T01:02:03Z',
        storageAvailable: true,
        vulnerabilityEventCount: 1,
      },
      report: { findingCount: 2, format: 'sarif' },
      scan: { assessmentId: 'a-1', filesScanned: 12, findingCount: 2, truncated: false },
    })
  })

  it('does not invent complete inventory counts from a bounded legacy frontier', () => {
    const state = deriveDashboardState(
      snapshot([
        result(
          'redteam_asset_map_frontier',
          {
            edgeCount: 1,
            frontier: [
              {
                depth: 1,
                expanded: false,
                id: 'visible-domain',
                label: 'api.example.com',
                type: 'domain',
              },
            ],
            frontierCount: 3,
            graphId: 'legacy-graph',
            nodeCount: 8,
            sourceCount: 2,
          },
          1,
        ),
      ]),
    )
    expect(state.assetMap?.inventory).toBeUndefined()
  })

  it('treats legacy findings without a workflow status as candidates', () => {
    const state = deriveDashboardState(
      snapshot([
        result(
          'redteam_findings',
          {
            findings: [
              {
                id: 'legacy-finding',
                location: { path: 'src/legacy.ts' },
                severity: 'medium',
                title: 'Legacy candidate',
              },
            ],
            total: 1,
          },
          1,
        ),
      ]),
    )
    expect(state.findings[0]?.status).toBe('candidate')
  })

  it('uses the newest valid result and ignores malformed or failed tool output', () => {
    const failed = { ...result('redteam_scan', {}, 3), isError: true }
    const malformed = {
      ...result('redteam_scan', {}, 4),
      content: [{ type: 'text' as const, text: 'not-json' }],
    }
    const state = deriveDashboardState(
      snapshot([
        result(
          'redteam_scan',
          { assessmentId: 'old', filesScanned: 1, findingCount: 1, truncated: false },
          1,
        ),
        result(
          'redteam_scan',
          { assessmentId: 'new', filesScanned: 7, findingCount: 3, truncated: true },
          2,
        ),
        failed,
        malformed,
      ]),
    )
    expect(state.scan).toMatchObject({ assessmentId: 'new', filesScanned: 7, truncated: true })
  })

  it('projects running Red Team work without retaining successful knowledge bodies', () => {
    const running = {
      argsRaw: '{}',
      callId: 'active',
      callView: null,
      name: 'redteam_knowledge_upsert',
      step: 1,
      subCalls: [],
      time: 1,
      turn: 1,
    } as unknown as RunningToolCall
    const state = deriveDashboardState(
      snapshot(
        [
          result(
            'redteam_knowledge_read',
            {
              content: 'password=must-not-enter-dashboard-state',
              title: 'Sensitive fixture',
              uri: 'knowledge://vulnerability/sensitive-fixture',
            },
            1,
          ),
        ],
        [running],
      ),
    )
    expect(state.runningTool).toBe('redteam_knowledge_upsert')
    expect(JSON.stringify(state)).not.toContain('must-not-enter-dashboard-state')
    expect(deriveDashboardState(undefined)).toEqual({
      assetMap: undefined,
      findings: [],
      findingsTotal: undefined,
      project: undefined,
      report: undefined,
      runningTool: undefined,
      scan: undefined,
    })
  })
})

describe('DSH main-view selection', () => {
  it('selects the retained main view instead of the first catalog or background session', () => {
    const background = {
      id: 'background',
      retainedBy: {},
      projectionValues: { agentPreset: 'redteam' },
    }
    const selected = { id: 'selected', retainedBy: { mainView: 1 } }
    expect(currentSession({ byId: { background, selected } })).toBe(selected)
    expect(currentSession({ byId: { background } })).toBeUndefined()
  })
})
