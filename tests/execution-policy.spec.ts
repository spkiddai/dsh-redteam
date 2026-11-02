import { describe, expect, it } from 'vitest'
import {
  evaluateRedTeamToolPolicy,
  parseRedTeamExecutionPolicy,
  type RedTeamExecutionPolicy,
} from '../src/lib/execution-policy.js'

function policy(overrides: Partial<RedTeamExecutionPolicy> = {}): RedTeamExecutionPolicy {
  return {
    enabledToolIds: ['nmap', 'nuclei', 'burp-suite', 'metasploit'],
    operationMode: 'active-scan',
    testingScope: [
      {
        mode: 'subdomains',
        targetId: 'domain-example',
        targetLabel: 'example.com',
        targetType: 'domain',
      },
      {
        mode: 'asset',
        targetId: 'url-api',
        targetLabel: 'https://api.test.local/v1',
        targetType: 'url',
      },
      {
        mode: 'all-ports',
        targetId: 'ip-local',
        targetLabel: '127.0.0.1',
        targetType: 'ip',
      },
      {
        mode: 'asset',
        targetId: 'network-lab',
        targetLabel: '10.20.0.0/16',
        targetType: 'network',
      },
    ],
    ...overrides,
  }
}

describe('red-team execution policy', () => {
  it('requires an explicitly enabled tool', () => {
    expect(
      evaluateRedTeamToolPolicy(
        policy({ enabledToolIds: [] }),
        'mcp__redteam-tools__nmap_status',
        {},
      ),
    ).toMatchObject({ kind: 'deny' })
  })

  it('hard-denies targets outside the confirmed scope even in full mode', () => {
    expect(
      evaluateRedTeamToolPolicy(
        policy({ operationMode: 'full' }),
        'mcp__redteam-tools__nmap_scan',
        { targets: ['outside.example.net'] },
      ),
    ).toMatchObject({ kind: 'deny', reason: expect.stringContaining('不在') })
  })

  it('asks on every call below the tool permission level', () => {
    const current = policy({ operationMode: 'passive' })
    const first = evaluateRedTeamToolPolicy(current, 'mcp__redteam-tools__nuclei_scan', {
      urls: ['https://app.example.com/login'],
    })
    const second = evaluateRedTeamToolPolicy(current, 'mcp__redteam-tools__nuclei_scan', {
      urls: ['https://app.example.com/account'],
    })
    expect(first).toMatchObject({ kind: 'ask', reason: expect.stringContaining('逐步审批') })
    expect(second).toMatchObject({ kind: 'ask' })
  })

  it('proceeds when the selected mode equals or exceeds the required level', () => {
    expect(
      evaluateRedTeamToolPolicy(policy(), 'mcp__redteam-tools__nmap_scan', {
        targets: ['api.example.com', '10.20.7.8'],
      }),
    ).toEqual({ kind: 'proceed' })
    expect(
      evaluateRedTeamToolPolicy(
        policy({ operationMode: 'full' }),
        'mcp__redteam-tools__metasploit_check',
        { rhost: '127.0.0.1' },
      ),
    ).toEqual({ kind: 'proceed' })
  })

  it('does not let one URL authorize a different path or host-level scan', () => {
    const current = policy({
      testingScope: [
        {
          mode: 'asset',
          targetId: 'url-api',
          targetLabel: 'https://api.test.local/v1',
          targetType: 'url',
        },
      ],
    })
    expect(
      evaluateRedTeamToolPolicy(current, 'mcp__redteam-tools__burp_proxy_request', {
        url: 'https://api.test.local/v1/users',
      }),
    ).toEqual({ kind: 'proceed' })
    expect(
      evaluateRedTeamToolPolicy(current, 'mcp__redteam-tools__burp_proxy_request', {
        url: 'https://api.test.local/admin',
      }),
    ).toMatchObject({ kind: 'deny' })
    expect(
      evaluateRedTeamToolPolicy(current, 'mcp__redteam-tools__nmap_scan', {
        targets: ['api.test.local'],
      }),
    ).toMatchObject({ kind: 'deny' })
  })

  it('denies every unknown MCP namespace and does not trust matching leaf names', () => {
    for (const name of [
      'mcp__external__scan',
      'mcp__external__nmap_scan',
      'mcp__redteam-tools__unknown',
    ]) {
      expect(
        evaluateRedTeamToolPolicy(policy({ operationMode: 'full' }), name, {
          targets: ['example.com'],
        }),
      ).toMatchObject({ kind: 'deny' })
    }
    expect(evaluateRedTeamToolPolicy(policy(), 'read_file', {})).toEqual({ kind: 'proceed' })
  })

  it('requires all-ports authorization for IP-based active operations', () => {
    const ip = {
      mode: 'asset' as const,
      targetId: 'ip',
      targetLabel: '127.0.0.1',
      targetType: 'ip',
    }
    const current = policy({ operationMode: 'full', testingScope: [ip] })
    for (const [name, args] of [
      ['nmap_scan', { targets: ['127.0.0.1'], ports: '1-65535' }],
      ['burp_proxy_request', { url: 'http://127.0.0.1:8080/' }],
      ['metasploit_check', { rhost: '127.0.0.1', rport: 8080 }],
    ] as const) {
      expect(evaluateRedTeamToolPolicy(current, `mcp__redteam-tools__${name}`, args)).toMatchObject(
        { kind: 'deny' },
      )
      expect(
        evaluateRedTeamToolPolicy(
          { ...current, testingScope: [{ ...ip, mode: 'all-ports' }] },
          `mcp__redteam-tools__${name}`,
          args,
        ),
      ).toEqual({ kind: 'proceed' })
    }
  })

  it('validates policies at the browser-to-host boundary', () => {
    expect(
      parseRedTeamExecutionPolicy({
        enabledToolIds: ['nmap', 'nmap'],
        operationMode: 'active-scan',
        testingScope: [
          {
            mode: 'asset',
            targetId: 'domain-example',
            targetLabel: 'example.com',
            targetType: 'domain',
          },
        ],
      }),
    ).toMatchObject({ enabledToolIds: ['nmap'], operationMode: 'active-scan' })
    expect(() =>
      parseRedTeamExecutionPolicy({
        enabledToolIds: ['nmap'],
        operationMode: 'full',
        testingScope: [
          {
            mode: 'subdomains',
            targetId: 'ip-local',
            targetLabel: '127.0.0.1',
            targetType: 'ip',
          },
        ],
      }),
    ).toThrow('只有域名')
  })
})
