import { Socket, isIP } from 'node:net'
import { connect as tlsConnect, checkServerIdentity } from 'node:tls'
import { setTimeout as delay } from 'node:timers/promises'
import { resolveScanAddress, type ScanNetworkDependencies } from './native-network.js'
import {
  portResultKey,
  type ScanJob,
  type ScanCheck,
  type ServiceResult,
  type ServiceRule,
  type ServiceProbeMode,
} from './native-scan-types.js'

export const SERVICE_RULES: ServiceRule[] = [
  {
    id: 'prism-service-ssh-legacy',
    version: 1,
    title: 'SSH 服务声明支持旧版协议',
    severity: 'medium',
    evidence: 'SSH 问候语声明 SSH 1.x 或 1.99 兼容模式；未进行登录或利用验证。',
    remediation: '禁用 SSH 1 兼容模式，仅允许 SSH 2；核对服务端配置。',
  },
  {
    id: 'prism-service-redis-info',
    version: 1,
    title: 'Redis 服务信息无需认证可读',
    severity: 'medium',
    evidence: '未提供凭据的 INFO server 请求返回有效 Redis 服务信息；这不代表可读写数据库。',
    remediation: '限制网络访问并配置认证与最小 ACL；核对 INFO 是否应向匿名用户开放。',
  },
  {
    id: 'prism-service-tls-invalid',
    version: 1,
    title: '服务 TLS 证书验证失败',
    severity: 'medium',
    evidence: 'TLS 握手成功，但证书信任链或目标名称验证失败。',
    remediation: '部署受信任且名称匹配的证书及完整证书链。',
  },
  {
    id: 'prism-service-tls-expired',
    version: 1,
    title: '服务 TLS 证书已过期',
    severity: 'high',
    evidence: 'TLS 握手证书的有效期结束时间早于扫描时间。',
    remediation: '更新证书并设置续期监控。',
  },
  {
    id: 'prism-service-tls-rsa',
    version: 1,
    title: '服务 TLS RSA 公钥长度不足',
    severity: 'medium',
    evidence: '握手证书使用小于 2048 位的 RSA 公钥。',
    remediation: '使用至少 2048 位 RSA 公钥或适当的现代椭圆曲线证书。',
  },
]
type Observation = Pick<ServiceResult, 'state' | 'protocol' | 'product' | 'version' | 'detail'> & {
  sshLegacy?: boolean
  redisInfo?: boolean
  tlsInvalid?: boolean
  tlsExpired?: boolean
  tlsWeakRsa?: boolean
}
const unknown = (detail: string): Observation => ({
  state: 'unknown',
  protocol: '',
  product: '',
  version: '',
  detail,
})
const identified = (protocol: string, product = '', version = ''): Observation => ({
  state: 'identified',
  protocol,
  product,
  version: version.length <= 32 ? version : '',
  detail: '已从协议响应识别服务；产品与版本由对端声明，未确认 CVE。',
})

/** Only structured, allowlisted product names and numeric versions survive parsing. */
export function identifyService(data: Buffer, mode: ServiceProbeMode): Observation | undefined {
  const text = data.toString('latin1')
  if (mode === 'redis') {
    if (/^-(?:NOAUTH|NOPERM|DENIED) [^\r\n]*\r\n/.test(text))
      return {
        ...identified('Redis', 'Redis'),
        redisInfo: false,
        detail: 'Redis 拒绝匿名 INFO 请求；未测试其他命令或数据库访问。',
      }
    const header = /^\$(\d{1,5})\r\n/.exec(text)
    if (!header) return undefined
    const length = Number(header[1]),
      start = header[0].length
    if (
      data.length < start + length + 2 ||
      text.slice(start + length, start + length + 2) !== '\r\n'
    )
      return undefined
    const body = text.slice(start, start + length)
    const version = /^redis_version:(\d+(?:\.\d+){1,3})\r?$/m.exec(body)
    if (body.startsWith('# Server\r\n') && version)
      return { ...identified('Redis', 'Redis', version[1]), redisInfo: true }
    return undefined
  }
  if (mode === 'http') {
    if (!/^HTTP\/1\.[01] [1-5]\d\d[^\r\n]*\r\n/.test(text) || !text.includes('\r\n\r\n'))
      return undefined
    const server =
      /^server:\s*(nginx|Apache|Caddy|Microsoft-IIS)(?:\/(\d+(?:\.\d+){0,3}))?(?:\s|\r|$)/im.exec(
        text.split('\r\n\r\n')[0]!,
      )
    return identified('HTTP', server?.[1], server?.[2])
  }
  const ssh = /(?:^|\r?\n)SSH-(1\.\d+|2\.0)-([^\r\n ]{1,100})(?: [^\r\n]*)?\r?\n/.exec(text)
  if (ssh) {
    const product = /^(OpenSSH|dropbear|PuTTY)[_-](\d+(?:\.\d+){0,3}(?:p\d+)?)(?:$|[_-])/.exec(
      ssh[2]!,
    )
    return { ...identified('SSH', product?.[1], product?.[2]), sshLegacy: ssh[1] !== '2.0' }
  }
  if (/^220[ -][^\r\n]*\b(?:ESMTP|SMTP)\b[^\r\n]*\r\n/i.test(text)) return identified('SMTP')
  if (/^220[ -][^\r\n]*\b(?:FTP|vsFTPd|ProFTPD|Pure-FTPd)\b[^\r\n]*\r\n/i.test(text))
    return identified('FTP')
  if (data.length >= 5 && data[3] === 0 && data[4] === 10) {
    const size = data.readUIntLE(0, 3),
      end = data.indexOf(0, 5)
    if (size >= 10 && size <= 8192 && data.length >= size + 4 && end > 5 && end < 90) {
      const version = /^(\d+\.\d+\.\d+)(?:[-.a-zA-Z0-9]*)$/.exec(text.slice(5, end))
      if (version)
        return identified(
          'MySQL',
          text.slice(5, end).includes('MariaDB') ? 'MariaDB' : 'MySQL',
          version[1],
        )
    }
  }
  return undefined
}

function selectMode(mode: ServiceProbeMode, port: number): ServiceProbeMode {
  if (mode !== 'auto') return mode
  if ([443, 465, 636, 993, 995, 8443].includes(port)) return 'tls'
  if (port === 6379) return 'redis'
  if ([80, 8000, 8080, 8888, 9200].includes(port)) return 'http'
  return 'banner'
}
export type ServiceProbe = (
  address: string,
  port: number,
  options: {
    host: string
    mode: ServiceProbeMode
    timeoutMs: number
    signal: AbortSignal
  },
) => Promise<Observation>

/** Bounded anonymous handshakes only. No credentials, exploit payloads or raw response persistence. */
export const probeService: ServiceProbe = async (address, port, options) => {
  options.signal.throwIfAborted()
  const mode = selectMode(options.mode, port)
  return await new Promise<Observation>((resolve, reject) => {
    let result: Observation | undefined,
      connected = false,
      buffer = Buffer.alloc(0)
    const socket =
      mode === 'tls'
        ? tlsConnect({
            host: address,
            port,
            ...(isIP(options.host) ? {} : { servername: options.host }),
            rejectUnauthorized: false,
          })
        : new Socket()
    const finish = (value: Observation) => {
      if (!result) result = value
      socket.destroy()
    }
    const abort = () => socket.destroy()
    const timer = setTimeout(
      () =>
        finish({
          ...unknown('服务识别超时或响应不完整；未判定为安全。'),
          state: connected ? 'unknown' : 'error',
        }),
      options.timeoutMs,
    )
    socket.once('close', () => {
      clearTimeout(timer)
      options.signal.removeEventListener('abort', abort)
      if (options.signal.aborted) reject(options.signal.reason)
      else resolve(result ?? unknown('连接结束，未收到可识别的完整协议响应。'))
    })
    socket.once('connect', () => {
      connected = true
      if (mode === 'http') {
        const host = isIP(options.host) === 6 ? `[${options.host}]` : options.host
        socket.write(
          `HEAD / HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\nUser-Agent: Prism-Native-Scanner/1\r\n\r\n`,
        )
      } else if (mode === 'redis') socket.write('*2\r\n$4\r\nINFO\r\n$6\r\nserver\r\n')
    })
    if (mode === 'tls')
      socket.once('secureConnect', () => {
        const tls = socket as import('node:tls').TLSSocket
        const cert = tls.getPeerCertificate(),
          expires = Date.parse(cert.valid_to)
        finish({
          ...identified('TLS'),
          tlsInvalid: !tls.authorized || !!checkServerIdentity(options.host, cert),
          ...(Number.isFinite(expires) ? { tlsExpired: expires < Date.now() } : {}),
          ...(cert.modulus && cert.bits ? { tlsWeakRsa: cert.bits < 2048 } : {}),
        })
      })
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk.subarray(0, Math.max(0, 8192 - buffer.length))])
      const parsed = identifyService(buffer, mode)
      if (parsed) finish(parsed)
      else if (buffer.length >= 8192)
        finish(unknown('响应达到 8 KiB 上限，未识别；未保存响应正文。'))
    })
    socket.once('error', (error: NodeJS.ErrnoException) =>
      finish({
        ...unknown('连接或协议握手失败；未判定为安全。'),
        state: !connected && error.code === 'ECONNREFUSED' ? 'closed' : 'error',
      }),
    )
    options.signal.addEventListener('abort', abort, { once: true })
    if (options.signal.aborted) abort()
    else if (mode !== 'tls') socket.connect({ host: address, port, family: isIP(address) })
  })
}

export function serviceChecks(
  target: string,
  observation: Observation,
  rules: ServiceRule[],
): ScanCheck[] {
  const values: Record<string, boolean | undefined> = {
    'prism-service-ssh-legacy': observation.sshLegacy,
    'prism-service-redis-info': observation.redisInfo,
    'prism-service-tls-invalid': observation.tlsInvalid,
    'prism-service-tls-expired': observation.tlsExpired,
    'prism-service-tls-rsa': observation.tlsWeakRsa,
  }
  return rules
    .filter((rule) => values[rule.id] !== undefined)
    .map((rule) => ({
      target,
      ruleId: rule.id,
      state: values[rule.id] ? 'hit' : 'pass',
      detail: values[rule.id]
        ? rule.evidence
        : '此项协议检查已完成，未命中该规则；不代表其他漏洞不存在。',
      at: new Date().toISOString(),
    }))
}
export async function executeServiceScan(
  job: ScanJob,
  options: {
    signal: AbortSignal
    allowInternal: boolean
    beforeProbe(): Promise<void>
    checkpoint(result: ServiceResult, checks: ScanCheck[]): Promise<void>
    probe?: ServiceProbe
    network?: ScanNetworkDependencies
  },
) {
  if (!job.serviceScan) throw new Error('缺少指纹扫描配置。')
  const done = new Set((job.serviceResults ?? []).map(portResultKey))
  for (const host of job.targets) {
    const remaining = job.serviceScan.ports.filter(
      (port) => !done.has(portResultKey({ target: host, port })),
    )
    if (!remaining.length) continue
    options.signal.throwIfAborted()
    await options.beforeProbe()
    let address = ''
    try {
      address = (
        await resolveScanAddress(
          host,
          {
            allowInternal: options.allowInternal,
            signal: AbortSignal.any([options.signal, AbortSignal.timeout(job.policy.timeoutMs)]),
          },
          options.network,
        )
      ).address
    } catch {
      options.signal.throwIfAborted()
    }
    for (const port of remaining) {
      options.signal.throwIfAborted()
      await options.beforeProbe()
      let observation: Observation = {
        ...unknown('地址被策略阻止或解析失败，未发起服务探测。'),
        state: 'error',
      }
      if (address)
        observation = await (options.probe ?? probeService)(address, port, {
          host,
          mode: job.serviceScan.mode,
          timeoutMs: job.policy.timeoutMs,
          signal: options.signal,
        })
      options.signal.throwIfAborted()
      const { state, protocol, product, version, detail } = observation
      const target = `tcp://${isIP(host) === 6 ? `[${host}]` : host}:${port}`
      await options.checkpoint(
        {
          target: host,
          address,
          port,
          state,
          protocol,
          product,
          version,
          detail,
          at: new Date().toISOString(),
        },
        serviceChecks(target, observation, job.serviceRules ?? []),
      )
      if (address && port !== remaining.at(-1))
        await delay(job.policy.delayMs, undefined, { signal: options.signal })
    }
  }
}
