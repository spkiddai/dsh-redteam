import { createHash } from 'node:crypto'
import { redactEvidence } from './redact.js'
import type { Assessment } from './types.js'

export const COVERAGE_OUTCOMES = [
  'planned',
  'reported',
  'no_issue_found',
  'ruled_out',
  'not_applicable',
  'needs_follow_up',
] as const
export type CoverageOutcome = (typeof COVERAGE_OUTCOMES)[number]
export interface CoverageEntry {
  readonly id: string
  readonly surface: string
  readonly riskArea: string
  readonly outcome: CoverageOutcome
  readonly evidence: string
  readonly findingIds: readonly string[]
  readonly provenance: 'agent-reported'
  readonly updatedAt: string
}
export interface CoverageInput {
  surface: string
  riskArea: string
  outcome: CoverageOutcome
  evidence: string
  findingIds?: readonly string[]
}
/** One bounded row per surface/risk pair. Self-reported coverage is never proof of absence. */
export function recordCoverage(assessment: Assessment, input: CoverageInput): Assessment {
  if (!COVERAGE_OUTCOMES.includes(input.outcome)) throw new Error('invalid coverage outcome')
  const surface = redactEvidence(input.surface.trim(), 240)
  const riskArea = redactEvidence(input.riskArea.trim(), 120)
  const evidence = redactEvidence(input.evidence.trim(), 512)
  if (!surface || !riskArea) throw new Error('surface and risk_area must not be empty')
  if (input.surface.length > 240 || input.riskArea.length > 120)
    throw new Error('coverage identifier too long')
  if (input.outcome !== 'planned' && !evidence)
    throw new Error('closed coverage requires an evidence summary')
  const findingIds = [...new Set(input.findingIds ?? [])]
  if (
    findingIds.length > 100 ||
    findingIds.some((id) => !assessment.findings.some((f) => f.id === id))
  )
    throw new Error('coverage references an unknown finding')
  if (input.outcome === 'reported' && !findingIds.length)
    throw new Error('reported coverage requires finding_ids')
  if (input.outcome !== 'reported' && findingIds.length)
    throw new Error('only reported coverage may reference findings')
  const id = createHash('sha256')
    .update(JSON.stringify([surface, riskArea]))
    .digest('hex')
    .slice(0, 24)
  const rows = [...(assessment.coverage ?? [])]
  const index = rows.findIndex((row) => row.id === id)
  if (index < 0 && rows.length >= 500) throw new Error('coverage limit reached: 500')
  const entry: CoverageEntry = {
    id,
    surface,
    riskArea,
    outcome: input.outcome,
    evidence,
    findingIds,
    provenance: 'agent-reported',
    updatedAt: new Date().toISOString(),
  }
  if (index < 0) rows.push(entry)
  else rows[index] = entry
  return { ...assessment, coverage: rows }
}

export function assessmentReadiness(assessment: Assessment) {
  const entries = assessment.coverage ?? []
  const unresolved = entries.filter(
    (row) => row.outcome === 'planned' || row.outcome === 'needs_follow_up',
  )
  const warnings: string[] = []
  if (!entries.length) warnings.push('未记录检查覆盖范围，不能据此宣称已完成全面检查。')
  if (unresolved.length)
    warnings.push(`${unresolved.length} 项检查尚未完成，需继续检查或注明限制。`)
  if (assessment.truncated) warnings.push('扫描达到数量限制，结果不完整。')
  if (assessment.filesSkipped) warnings.push(`${assessment.filesSkipped} 个文件未扫描。`)
  const candidates = assessment.findings.filter((f) => f.status === 'candidate').length
  if (candidates) warnings.push(`${candidates} 个候选问题尚未验证。`)
  const unverified = assessment.findings.filter(
    (f) => ['confirmed', 'fixed'].includes(f.status) && !f.validation,
  ).length
  if (unverified) warnings.push(`${unverified} 个历史确认/修复记录缺少结构化验证证据。`)
  return {
    assessmentId: assessment.id,
    ready: warnings.length === 0,
    warnings,
    coverageCount: entries.length,
    unresolved,
    provenance: 'agent-reported' as const,
  }
}
