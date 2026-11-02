const SECRET_ASSIGNMENT =
  /\b(api[_-]?key|authorization|cookie|credential|password|secret|token)\b(\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}\n]+)/giu
const AWS_ACCESS_KEY = /\bAKIA[0-9A-Z]{16}\b/gu
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/giu
const URL_CREDENTIALS = /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu

export function redactEvidence(value: string, maxChars = 512): string {
  const redacted = value
    .replace(AWS_ACCESS_KEY, '[redacted-aws-key]')
    .replace(BEARER_TOKEN, 'Bearer [redacted]')
    .replace(URL_CREDENTIALS, '$1[redacted]@')
    .replace(SECRET_ASSIGNMENT, '$1$2[redacted]')
  if (redacted.length <= maxChars) return redacted
  return `${redacted.slice(0, maxChars)}…[truncated]`
}
