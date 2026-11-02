import { describe, it, expect } from 'vitest'
import {
  recordCoverage,
  assessmentReadiness,
  type CoverageInput,
} from '../src/lib/assessment-coverage.js'
import { changeFindingStatus } from '../src/lib/finding-status.js'
import { renderReport } from '../src/lib/report.js'
import { unzipSync, strFromU8 } from 'fflate'
import type { Assessment } from '../src/lib/types.js'
const assessment: Assessment = {
  schemaVersion: 1,
  id: 'rt-20261026000000-abcdef12',
  mode: 'review',
  workspaceRoot: '/project',
  scanRoot: '.',
  startedAt: '2026-10-26T00:00:00Z',
  completedAt: '2026-10-26T00:00:01Z',
  filesScanned: 1,
  filesSkipped: 0,
  truncated: false,
  findings: [
    {
      id: 'f1',
      ruleId: 'r1',
      category: 'source',
      title: 'Untrusted input',
      severity: 'high',
      confidence: 'high',
      status: 'candidate',
      cwe: 'CWE-20',
      location: { path: 'src/main.ts', line: 1, column: 1 },
      evidence: 'input',
      remediation: 'Validate input',
      detectedAt: '2026-10-26T00:00:00Z',
    },
  ],
}
const planned: CoverageInput = {
  surface: 'src/main.ts',
  riskArea: 'input validation',
  outcome: 'planned',
  evidence: '',
}
describe('assessment coverage and evidence', () => {
  it('updates one stable surface/risk row, requires linked findings and redacts evidence', () => {
    const first = recordCoverage(assessment, planned)
    const closed = recordCoverage(first, {
      ...planned,
      outcome: 'reported',
      findingIds: ['f1', 'f1'],
      evidence: 'token=example-secret observed in source',
    })
    expect(closed.coverage).toHaveLength(1)
    expect(closed.coverage![0]).toMatchObject({ findingIds: ['f1'], provenance: 'agent-reported' })
    expect(JSON.stringify(closed)).not.toContain('example-secret')
    expect(first.coverage![0]!.outcome).toBe('planned')
    expect(() =>
      recordCoverage(first, { ...planned, outcome: 'reported', evidence: 'Observed' }),
    ).toThrow('finding_ids')
    expect(() =>
      recordCoverage(first, {
        ...planned,
        outcome: 'reported',
        findingIds: ['foreign'],
        evidence: 'Observed',
      }),
    ).toThrow('unknown finding')
    expect(() =>
      recordCoverage(first, {
        ...planned,
        outcome: 'no_issue_found',
        findingIds: ['f1'],
        evidence: 'Observed',
      }),
    ).toThrow('only reported')
    expect(() => recordCoverage(first, { ...planned, outcome: 'ruled_out' })).toThrow('evidence')
    expect(() => recordCoverage(first, { ...planned, surface: ' ' })).toThrow('empty')
    expect(() => recordCoverage(first, { ...planned, surface: 'x'.repeat(241) })).toThrow('long')
    expect(() => recordCoverage(first, { ...planned, outcome: 'invalid' as never })).toThrow(
      'outcome',
    )
    const full = {
      ...assessment,
      coverage: Array.from({ length: 500 }, (_, i) => ({ ...first.coverage![0]!, id: String(i) })),
    }
    expect(() => recordCoverage(full, planned)).toThrow('limit')
  })
  it('keeps unresolved work and scanner limits visible in every export format', () => {
    const source = recordCoverage(
      { ...assessment, truncated: true, filesSkipped: 2 },
      { ...planned, outcome: 'needs_follow_up', evidence: 'Review blocked by missing fixture' },
    )
    expect(assessmentReadiness(source)).toMatchObject({ ready: false, coverageCount: 1 })
    expect(assessmentReadiness(source).warnings).toHaveLength(4)
    for (const format of ['markdown', 'html', 'json', 'xml', 'sarif', 'word'] as const) {
      const output = renderReport(source, format)
      const text =
        typeof output === 'string' ? output : strFromU8(unzipSync(output)['word/document.xml']!)
      expect(text).toContain('needs_follow_up')
      expect(text).toContain('agent-reported')
      expect(text).toContain('Review blocked')
    }
    expect(assessmentReadiness(assessment).warnings.join()).toContain('未记录')
    expect(
      assessmentReadiness({
        ...assessment,
        findings: [{ ...assessment.findings[0]!, status: 'confirmed' }],
      }).warnings.join(),
    ).toContain('结构化')
  })
  it('requires verification for confirmation and regression evidence for fixes', () => {
    expect(() => changeFindingStatus(assessment, 'f1', 'confirmed', 'Reviewed')).toThrow(
      'validation',
    )
    const validation = {
      method: 'code-review' as const,
      procedure: 'Trace source to sink',
      observation: 'Untrusted value reaches sink; token=example-secret',
    }
    const confirmed = changeFindingStatus(
      assessment,
      'f1',
      'confirmed',
      'Reviewed',
      undefined,
      validation,
    )
    expect(JSON.stringify(confirmed)).not.toContain('example-secret')
    expect(() =>
      changeFindingStatus(confirmed.assessment, 'f1', 'fixed', 'Patched', undefined, validation),
    ).toThrow('regression-test')
    const fixed = changeFindingStatus(confirmed.assessment, 'f1', 'fixed', 'Retested', undefined, {
      ...validation,
      method: 'regression-test',
    })
    const ready = recordCoverage(fixed.assessment, {
      ...planned,
      outcome: 'reported',
      evidence: 'Regression reviewed',
      findingIds: ['f1'],
    })
    expect(assessmentReadiness(ready).ready).toBe(true)
    expect(renderReport(ready, 'markdown')).toContain('regression-test')
  })
})
