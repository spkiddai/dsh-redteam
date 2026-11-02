import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { checkServerIdentity, type TLSSocket } from 'node:tls'
import { createHash } from 'node:crypto'
import { resolveScanAddress, type ScanNetworkDependencies } from './native-network.js'
export { addressAllowed } from './native-network.js'
import type { ScanCheck, ScanFinding, ScanJob, ScanMatch, ScanRule } from './native-scan-types.js'

export interface Probe {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
  truncated: boolean
  tls?: { valid: boolean; days?: number; keyBits?: number }
}
export interface ProbeOptions {
  timeoutMs: number
  allowInternal: boolean
  signal: AbortSignal
}
export type ScanProbe = (url: URL, options: ProbeOptions) => Promise<Probe>
export function normalizeScanTargets(input: unknown): string[] {
  if (!Array.isArray(input) || !input.length || input.length > 20)
    throw new Error('请输入 1–20 个 HTTP(S) 目标。')
  const targets = input.map((value: unknown) => {
    if (typeof value !== 'string' || value.length > 500) throw new Error('目标 URL 无效。')
    let url: URL
    try {
      url = new URL(value.trim())
    } catch {
      throw new Error('目标须包含 http:// 或 https://。')
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.hostname
    )
      throw new Error('仅支持不含账号、密码、查询参数或片段的 HTTP(S) URL。')
    if (url.pathname.includes('%') || url.pathname.includes('//'))
      throw new Error('目标路径须使用未编码的普通路径。')
    return url.href
  })
  return [...new Set(targets)]
}

/** Pin the validated DNS answer; never follow redirects or reuse authenticated connections. */
export function createHttpProbe(dependencies: ScanNetworkDependencies = {}): ScanProbe {
  return async (url, options) => {
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)])
    signal.throwIfAborted()
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const pinned = await resolveScanAddress(
      host,
      { allowInternal: options.allowInternal, signal },
      dependencies,
    )
    return await new Promise<Probe>((resolveProbe, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        url,
        {
          method: 'GET',
          agent: false,
          signal,
          maxHeaderSize: 16_384,
          // A scanner must inspect an invalid certificate; no credentials are sent.
          rejectUnauthorized: false,
          lookup: ((
            _host: unknown,
            _options: unknown,
            callback: (error: null, value: { address: string; family: number }[]) => void,
          ) => callback(null, [pinned])) as never,
          headers: {
            'User-Agent': 'Prism-Native-Scanner/1',
            Accept: '*/*',
            'Accept-Encoding': 'identity',
            Connection: 'close',
          },
        },
        (response) => {
          const chunks: Buffer[] = []
          let size = 0,
            settled = false
          const socket = response.socket as TLSSocket
          const cert = url.protocol === 'https:' ? socket.getPeerCertificate() : undefined
          const expires = cert?.valid_to ? Date.parse(cert.valid_to) : NaN
          const tls = cert
            ? {
                valid: socket.authorized && !checkServerIdentity(host, cert),
                ...(Number.isFinite(expires) ? { days: (expires - Date.now()) / 86_400_000 } : {}),
                ...(cert.modulus && cert.bits ? { keyBits: cert.bits } : {}),
              }
            : undefined
          const finish = (truncated: boolean) => {
            if (settled) return
            settled = true
            resolveProbe({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(chunks).toString('utf8'),
              truncated,
              ...(tls ? { tls } : {}),
            })
          }
          response.on('data', (chunk: Buffer) => {
            const remaining = 65_536 - size
            chunks.push(chunk.subarray(0, remaining))
            size += chunk.length
            if (size > 65_536) {
              finish(true)
              response.destroy()
            }
          })
          response.on('end', () => finish(false))
          response.on('error', (error) => {
            if (!settled) reject(error)
          })
        },
      )
      request.on('error', reject)
      request.end()
    })
  }
}

function fieldValue(
  match: Extract<ScanMatch, { field: unknown }>,
  probe: Probe,
): string | number | boolean | undefined {
  if (match.field === 'status') return probe.status
  if (match.field === 'body') return probe.body
  if (match.field === 'header') {
    const value = probe.headers[match.key!]
    return Array.isArray(value) ? value.join(', ') : value
  }
  if (match.field === 'tls.valid') return probe.tls?.valid
  if (match.field === 'tls.days') return probe.tls?.days
  if (match.field === 'tls.keyBits') return probe.tls?.keyBits
  return undefined
}
export function matchProbe(match: ScanMatch, probe: Probe): boolean {
  if ('all' in match) return match.all.every((m) => matchProbe(m, probe))
  if ('any' in match) return match.any.some((m) => matchProbe(m, probe))
  if (match.field === 'cookie') {
    const values = probe.headers['set-cookie']
    const cookies = Array.isArray(values) ? values : values ? [values] : []
    return (
      match.op === 'absent' &&
      cookies.some(
        (cookie) =>
          !cookie
            .split(';')
            .slice(1)
            .some((part) => part.trim().split('=')[0]?.toLowerCase() === match.key),
      )
    )
  }
  const value = fieldValue(match, probe)
  if (match.op === 'absent') return value === undefined || value === ''
  if (match.op === 'equals') return value === match.value
  if (match.op === 'lt') return typeof value === 'number' && value < (match.value as number)
  return typeof value === 'string' && value.includes(String(match.value))
}
function hasBodyMatch(match: ScanMatch): boolean {
  if ('all' in match) return match.all.some(hasBodyMatch)
  if ('any' in match) return match.any.some(hasBodyMatch)
  return match.field === 'body'
}
export function checkProbe(target: string, rule: ScanRule, probe: Probe): ScanCheck {
  const hit = matchProbe(rule.match, probe)
  const unsupported =
    !hit && (probe.truncated || !!probe.headers['content-encoding']) && hasBodyMatch(rule.match)
  const redirect = probe.status >= 300 && probe.status < 400
  const failed = probe.status >= 500 || probe.status === 429
  const state = redirect || unsupported ? 'skipped' : failed ? 'error' : hit ? 'hit' : 'pass'
  return {
    target,
    ruleId: rule.id,
    state,
    detail:
      hit && state === 'hit'
        ? rule.evidence
        : redirect
          ? '目标发生重定向，未跨出授权 URL；请直接扫描最终 URL。'
          : unsupported
            ? '响应超出大小限制或使用压缩，未将未匹配判定为通过。'
            : failed
              ? '目标返回服务错误或请求限流。'
              : `HTTP ${probe.status}；未命中此规则。`,
    at: new Date().toISOString(),
  }
}
export function findingFor(
  check: ScanCheck,
  rule: Pick<ScanRule, 'id' | 'title' | 'severity' | 'remediation'>,
): ScanFinding {
  return {
    id: createHash('sha256').update(`${check.target}\0${rule.id}`).digest('hex').slice(0, 24),
    target: check.target,
    ruleId: rule.id,
    title: rule.title,
    severity: rule.severity,
    evidence: check.detail,
    remediation: rule.remediation,
    state: 'open',
    note: '',
  }
}
export const ruleDigest = (rules: ScanRule[]) =>
  createHash('sha256').update(JSON.stringify(rules)).digest('hex')
export const scanCheckKey = (check: Pick<ScanCheck, 'target' | 'ruleId'>) =>
  `${check.target}\0${check.ruleId}`
export async function executeScan(
  job: ScanJob,
  options: {
    signal: AbortSignal
    allowInternal: boolean
    probe?: ScanProbe
    beforeProbe(): Promise<void>
    checkpoint(checks: ScanCheck[]): Promise<void>
  },
): Promise<void> {
  const done = new Set(job.checks.map(scanCheckKey))
  const probe = options.probe ?? createHttpProbe()
  for (const target of job.targets) {
    const groups = new Map<string, ScanRule[]>()
    for (const rule of job.rules) {
      if (done.has(scanCheckKey({ target, ruleId: rule.id }))) continue
      if (rule.family === 'tls' && new URL(target).protocol !== 'https:') {
        await options.checkpoint([
          {
            target,
            ruleId: rule.id,
            state: 'skipped',
            detail: '目标为 HTTP，TLS 检查不适用。',
            at: new Date().toISOString(),
          },
        ])
        continue
      }
      groups.set(rule.path, [...(groups.get(rule.path) ?? []), rule])
    }
    for (const [path, rules] of groups) {
      options.signal.throwIfAborted()
      await options.beforeProbe()
      options.signal.throwIfAborted()
      const url = new URL(target)
      if (path) url.pathname = `${url.pathname.replace(/\/$/, '')}/${path}`
      let checks: ScanCheck[]
      try {
        const response = await probe(url, {
          signal: options.signal,
          timeoutMs: job.policy.timeoutMs,
          allowInternal: options.allowInternal,
        })
        checks = rules.map((rule) => checkProbe(target, rule, response))
      } catch (error) {
        options.signal.throwIfAborted()
        checks = rules.map((rule) => ({
          target,
          ruleId: rule.id,
          state: 'error',
          detail:
            error instanceof Error && error.message === 'target-blocked'
              ? '地址被扫描策略禁止（本机、保留地址或未获内网权限）。'
              : '连接失败、DNS 失败或超时；未判定为无漏洞。',
          at: new Date().toISOString(),
        }))
      }
      await options.checkpoint(checks)
      await new Promise<void>((resolve, reject) => {
        const stop = () => {
          options.signal.removeEventListener('abort', stop)
          clearTimeout(timer)
          reject(new Error('cancelled'))
        }
        const timer = setTimeout(() => {
          options.signal.removeEventListener('abort', stop)
          resolve()
        }, job.policy.delayMs)
        options.signal.addEventListener('abort', stop, { once: true })
        if (options.signal.aborted) stop()
      })
    }
  }
}
