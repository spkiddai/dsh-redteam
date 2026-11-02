import { describe, expect, it } from 'vitest'
import { changeFindingStatus } from '../src/lib/finding-status.js'
import type { Assessment } from '../src/lib/types.js'

function assessment(): Assessment {
  return {
    completedAt: '2026-08-22T00:00:01.000Z',
    filesScanned: 1,
    filesSkipped: 0,
    findings: [
      {
        category: 'source',
        confidence: 'medium',
        cwe: 'CWE-95',
        detectedAt: '2026-08-22T00:00:00.000Z',
        evidence: 'eval(input)',
        id: 'finding-one',
        location: { column: 1, line: 1, path: 'src/app.ts' },
        remediation: 'Use a parser.',
        ruleId: 'RT-SOURCE-001',
        severity: 'high',
        status: 'candidate',
        title: 'Dynamic code evaluation',
      },
    ],
    id: 'rt-20260822000000-a1b2c3d4',
    mode: 'review',
    scanRoot: '.',
    schemaVersion: 1,
    startedAt: '2026-08-22T00:00:00.000Z',
    truncated: false,
    workspaceRoot: '/workspace',
  }
}

describe('finding review workflow', () => {
  it('appends bounded, redacted decisions without mutating the source assessment', () => {
    const source = assessment()
    const confirmed = changeFindingStatus(
      source,
      'finding-one',
      'confirmed',
      'Reviewed token=top-secret-value against reachable input.',
      '2026-08-22T01:00:00.000Z',
    )
    expect(source.findings[0]?.status).toBe('candidate')
    expect(confirmed.finding).toMatchObject({
      status: 'confirmed',
      statusHistory: [
        {
          changedAt: '2026-08-22T01:00:00.000Z',
          from: 'candidate',
          reason: 'Reviewed token=[redacted] against reachable input.',
          to: 'confirmed',
        },
      ],
    })

    const fixed = changeFindingStatus(
      confirmed.assessment,
      'finding-one',
      'fixed',
      'Regression test passes.',
    )
    expect(fixed.finding.statusHistory).toHaveLength(2)
    expect(fixed.finding.statusHistory?.[1]?.changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  })

  it('rejects missing findings, empty reasons, and invalid transitions', () => {
    const source = assessment()
    expect(() => changeFindingStatus(source, 'missing', 'confirmed', 'Reviewed.')).toThrow(
      'finding not found',
    )
    expect(() => changeFindingStatus(source, 'finding-one', 'fixed', 'Reviewed.')).toThrow(
      'candidate -> fixed',
    )
    expect(() => changeFindingStatus(source, 'finding-one', 'confirmed', '   ')).toThrow(
      'reason must not be empty',
    )

    const history = Array.from({ length: 100 }, (_, index) => ({
      changedAt: `2026-08-22T01:00:${String(index).padStart(2, '0')}.000Z`,
      from: 'candidate' as const,
      reason: 'Reviewed.',
      to: 'confirmed' as const,
    }))
    const full = {
      ...source,
      findings: [{ ...source.findings[0]!, status: 'confirmed' as const, statusHistory: history }],
    }
    expect(() => changeFindingStatus(full, 'finding-one', 'fixed', 'Retested.')).toThrow(
      'history limit reached: 100',
    )
  })
})
