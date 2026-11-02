import { describe, expect, it } from 'vitest'
import {
  mcpReviewId,
  mcpToolHash,
  parseStoredMcpPermissions,
  proposeMcpPermissions,
  type McpPermission,
} from '../src/lib/mcp-permissions.js'
import {
  evaluateRedTeamToolPolicy,
  type RedTeamExecutionPolicy,
} from '../src/lib/execution-policy.js'

const connectionId = 'mcp-0123456789abcdef0123'
const tool = {
  name: 'mcp__rt-test__scan',
  description: 'Scans a URL',
  parameters: {
    type: 'object',
    properties: { urls: { type: 'array', items: { type: 'string' } }, count: { type: 'integer' } },
  },
}
const proposal = {
  toolName: tool.name,
  mode: 'active-scan',
  targetKind: 'url',
  targetField: 'urls',
  reason: '仅扫描所选 URL，需要主动扫描权限。',
  confirmed: true,
}
const policy: RedTeamExecutionPolicy = {
  operationMode: 'active-scan',
  enabledToolIds: [connectionId],
  testingScope: [
    { mode: 'asset', targetId: 'url', targetType: 'url', targetLabel: 'https://example.com/v1' },
  ],
}

describe('AI MCP permission recommendations', () => {
  it('binds an unconfirmed recommendation to exact metadata and redacts its reason', () => {
    const [p] = proposeMcpPermissions(
      connectionId,
      JSON.stringify([{ ...proposal, reason: 'Authorization: Bearer secret-token-value' }]),
      [tool],
    )
    expect(p).toMatchObject({ schemaHash: mcpToolHash(tool), confirmed: false })
    expect(p?.reason).not.toContain('secret-token-value')
    expect(mcpToolHash({ ...tool, description: 'Changed behavior' })).not.toBe(mcpToolHash(tool))
    expect(mcpReviewId([p!])).toBe(mcpReviewId([{ ...p!, confirmed: true }]))
    expect(mcpReviewId([p!])).not.toBe(mcpReviewId([{ ...p!, mode: 'blocked' }]))
  })

  it('keeps confirmation, enablement, targets, and execution mode independent', () => {
    const [p] = proposeMcpPermissions(connectionId, JSON.stringify([proposal]), [tool])
    const args = { urls: ['https://example.com/v1/items'] }
    const confirmed = { ...p!, confirmed: true }
    expect(evaluateRedTeamToolPolicy(policy, tool.name, args, [p!])).toMatchObject({ kind: 'deny' })
    expect(
      evaluateRedTeamToolPolicy({ ...policy, enabledToolIds: [] }, tool.name, args, [confirmed]),
    ).toMatchObject({ kind: 'deny' })
    expect(evaluateRedTeamToolPolicy(policy, tool.name, args, [confirmed])).toEqual({
      kind: 'proceed',
    })
    expect(
      evaluateRedTeamToolPolicy({ ...policy, operationMode: 'passive' }, tool.name, args, [
        confirmed,
      ]),
    ).toMatchObject({ kind: 'ask' })
    for (const value of [
      {},
      { urls: [] },
      { urls: [42] },
      { urls: ['https://example.com/admin'] },
      { urls: ['https://example.com/v1', 'https://outside.example/'] },
    ]) {
      expect(evaluateRedTeamToolPolicy(policy, tool.name, value, [confirmed])).toMatchObject({
        kind: 'deny',
      })
    }
    expect(
      evaluateRedTeamToolPolicy({ ...policy, operationMode: 'full' }, tool.name, args, [
        { ...confirmed, mode: 'blocked' },
      ]),
    ).toMatchObject({ kind: 'deny' })
  })

  it('validates schema target fields and rejects unscopable active recommendations', () => {
    for (const p of [
      { ...proposal, toolName: 'mcp__other__unknown' },
      { ...proposal, targetField: 'missing' },
      { ...proposal, targetField: 'count' },
      { ...proposal, targetKind: 'none', targetField: '' },
      { ...proposal, reason: '' },
      { ...proposal, mode: 'anything' },
    ])
      expect(() => proposeMcpPermissions(connectionId, JSON.stringify([p]), [tool])).toThrow()
    expect(() =>
      proposeMcpPermissions(connectionId, JSON.stringify([proposal, proposal]), [tool]),
    ).toThrow('重复')
    expect(() => proposeMcpPermissions(connectionId, '[]', [tool])).toThrow()
    expect(() => proposeMcpPermissions(connectionId, '[null]', [tool])).toThrow()
    expect(() => proposeMcpPermissions(connectionId, 'not json', [tool])).toThrow()
    expect(() => proposeMcpPermissions(connectionId, ' '.repeat(64_001), [tool])).toThrow('过长')
    expect(() => parseStoredMcpPermissions([null])).toThrow()
    expect(() => parseStoredMcpPermissions({})).toThrow()
    expect(() => parseStoredMcpPermissions(Array(513))).toThrow()
  })

  it('supports bounded offline introspection and host targets while preserving denial for unknown tools', () => {
    const status = { ...tool, name: 'mcp__rt-test__status' }
    const [permission] = proposeMcpPermissions(
      connectionId,
      JSON.stringify([
        {
          ...proposal,
          toolName: status.name,
          mode: 'passive',
          targetKind: 'none',
          targetField: '',
        },
      ]),
      [status],
    )
    expect(
      evaluateRedTeamToolPolicy(policy, status.name, {}, [{ ...permission!, confirmed: true }]),
    ).toEqual({ kind: 'proceed' })
    const host: McpPermission = {
      ...permission!,
      confirmed: true,
      toolName: tool.name,
      mode: 'active-scan',
      targetKind: 'host',
      targetField: 'host',
    }
    const domainPolicy: RedTeamExecutionPolicy = {
      ...policy,
      testingScope: [
        {
          mode: 'subdomains',
          targetId: 'domain',
          targetType: 'domain',
          targetLabel: 'example.com',
        },
      ],
    }
    for (const target of [
      'evil.test,sub.example.com',
      'evil.test;sub.example.com',
      'evil.test sub.example.com',
    ]) {
      expect(
        evaluateRedTeamToolPolicy(domainPolicy, tool.name, { host: target }, [host]),
      ).toMatchObject({ kind: 'deny' })
    }
    const hostPolicy: RedTeamExecutionPolicy = {
      ...policy,
      testingScope: [
        { mode: 'all-ports', targetId: 'ip', targetType: 'ip', targetLabel: '127.0.0.1' },
      ],
    }
    expect(evaluateRedTeamToolPolicy(hostPolicy, tool.name, { host: '127.0.0.1' }, [host])).toEqual(
      { kind: 'proceed' },
    )
    expect(evaluateRedTeamToolPolicy(policy, 'mcp__other__scan', {}, [host])).toMatchObject({
      kind: 'deny',
    })
  })
})
