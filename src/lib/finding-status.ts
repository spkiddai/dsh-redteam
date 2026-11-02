import { redactEvidence } from './redact.js'
import type { Assessment, Finding, FindingStatus } from './types.js'

const TRANSITIONS: Readonly<Record<FindingStatus, readonly FindingStatus[]>> = {
  accepted: ['candidate', 'confirmed', 'fixed'],
  candidate: ['accepted', 'confirmed'],
  confirmed: ['accepted', 'candidate', 'fixed'],
  fixed: ['candidate', 'confirmed'],
}
const MAX_STATUS_HISTORY = 100

/** Return a new assessment with one review decision appended to the finding audit trail. */
export function changeFindingStatus(
  assessment: Assessment,
  findingId: string,
  status: FindingStatus,
  reason: string,
  changedAt = new Date().toISOString(),
): { assessment: Assessment; finding: Finding } {
  const index = assessment.findings.findIndex((finding) => finding.id === findingId)
  const current = assessment.findings[index]
  if (current === undefined) {
    throw new Error(`finding not found in assessment ${assessment.id}: ${findingId}`)
  }
  if (!TRANSITIONS[current.status].includes(status)) {
    throw new Error(`invalid finding status transition: ${current.status} -> ${status}`)
  }
  const history = current.statusHistory ?? []
  if (history.length >= MAX_STATUS_HISTORY) {
    throw new Error(`finding status history limit reached: ${String(MAX_STATUS_HISTORY)}`)
  }
  const normalizedReason = redactEvidence(reason.trim())
  if (normalizedReason.length === 0) throw new Error('finding status reason must not be empty')
  const finding: Finding = {
    ...current,
    status,
    statusHistory: [
      ...history,
      { changedAt, from: current.status, reason: normalizedReason, to: status },
    ],
  }
  const findings = [...assessment.findings]
  findings[index] = finding
  return { assessment: { ...assessment, findings }, finding }
}
