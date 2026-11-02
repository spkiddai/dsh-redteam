import { describe, expect, it } from 'vitest'
import { redactEvidence } from '../src/lib/redact.js'

describe('evidence redaction', () => {
  it('removes common credential forms', () => {
    const value = redactEvidence(
      'password="super secret value" Authorization: Bearer abcdefghijklmnop https://user:pass@example.com AKIAIOSFODNN7EXAMPLE',
    )
    expect(value).toContain('password=[redacted]')
    expect(value).toContain('Authorization: [redacted]')
    expect(value).toContain('https://[redacted]@example.com')
    expect(value).not.toContain('super secret value')
    expect(value).not.toContain('abcdefghijklmnop')
    expect(value).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(value).toContain('[redacted-aws-key]')
  })

  it('bounds persisted evidence', () => {
    expect(redactEvidence('x'.repeat(1_000), 20)).toBe(`${'x'.repeat(20)}…[truncated]`)
  })
})
