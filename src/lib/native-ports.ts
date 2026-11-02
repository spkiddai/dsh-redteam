import { Socket, isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { resolveScanAddress, type ScanNetworkDependencies } from './native-network.js'
import {
  MAX_PORT_CHECKS,
  portResultKey,
  type PortResult,
  type ScanJob,
} from './native-scan-types.js'

export function parsePorts(input: unknown): number[] {
  if (typeof input !== 'string' || !input.trim() || input.length > 20_000)
    throw new Error('请输入端口列表或范围，例如 22,80,443,8000-8100。')
  const ports = new Set<number>()
  for (const part of input.trim().split(/[,，\s]+/)) {
    if (!/^\d{1,5}(?:-\d{1,5})?$/.test(part))
      throw new Error('端口格式无效，请使用数字、逗号和短横线。')
    const [first, last = first] = part.split('-').map(Number) as [number, number?]
    if (first < 1 || last > 65535 || first > last)
      throw new Error('端口范围必须在 1–65535 之间，起始值不能大于结束值。')
    if (last - first + 1 > MAX_PORT_CHECKS)
      throw new Error(`每次扫描最多 ${MAX_PORT_CHECKS} 个目标与端口组合，请分批扫描。`)
    for (let port = first; port <= last; port++) ports.add(port)
    if (ports.size > MAX_PORT_CHECKS)
      throw new Error(`每次扫描最多 ${MAX_PORT_CHECKS} 个目标与端口组合，请分批扫描。`)
  }
  return [...ports].sort((a, b) => a - b)
}
export function normalizePortTargets(input: unknown): string[] {
  if (!Array.isArray(input) || !input.length || input.length > 20)
    throw new Error('请输入 1–20 个 IP 地址或域名。')
  return [
    ...new Set(
      input.map((value: unknown) => {
        if (typeof value !== 'string' || value.length > 253) throw new Error('目标格式无效。')
        const host = value.trim().replace(/^\[([^\]]+)\]$/, '$1')
        if (isIP(host) === 6) return new URL(`http://[${host}]/`).hostname.slice(1, -1)
        if (isIP(host) === 4) return host
        if (!host || /^[\d.]+$/.test(host) || /[\s:/@?#%\\[\]]/.test(host))
          throw new Error('端口扫描目标只填写 IP 或域名，端口请在端口范围中填写。')
        const ascii = domainToASCII(host).toLowerCase().replace(/\.$/, '')
        if (
          !ascii ||
          ascii.length > 253 ||
          ascii.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
        )
          throw new Error('域名格式无效。')
        return ascii
      }),
    ),
  ]
}
const hints: Record<number, string> = {
  21: 'FTP',
  22: 'SSH',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  135: 'RPC',
  139: 'NetBIOS',
  143: 'IMAP',
  443: 'HTTPS',
  445: 'SMB',
  465: 'SMTPS',
  587: 'SMTP',
  993: 'IMAPS',
  995: 'POP3S',
  1433: 'SQL Server',
  1521: 'Oracle',
  2049: 'NFS',
  2375: 'Docker API',
  3306: 'MySQL',
  3389: 'RDP',
  5432: 'PostgreSQL',
  5672: 'AMQP',
  5900: 'VNC',
  6379: 'Redis',
  6443: 'Kubernetes API',
  8000: 'HTTP',
  8080: 'HTTP',
  8443: 'HTTPS',
  9200: 'Elasticsearch',
  11211: 'Memcached',
  27017: 'MongoDB',
}
export const portServiceHint = (port: number) => hints[port] ?? '未知'
export type TcpProbe = (
  address: string,
  port: number,
  options: { timeoutMs: number; signal: AbortSignal },
) => Promise<Pick<PortResult, 'state' | 'detail'>>

/** TCP connect only. No protocol payloads, login attempts or raw banner persistence. */
export const probeTcpPort: TcpProbe = async (address, port, options) => {
  options.signal.throwIfAborted()
  return await new Promise((resolve, reject) => {
    const socket = new Socket()
    let result: Pick<PortResult, 'state' | 'detail'> | undefined
    const abort = () => socket.destroy()
    const finish = (state: PortResult['state'], detail: string) => {
      if (result) return
      result = { state, detail }
      socket.destroy()
    }
    socket.once('close', () => {
      options.signal.removeEventListener('abort', abort)
      if (options.signal.aborted) reject(options.signal.reason)
      else resolve(result ?? { state: 'error', detail: '连接在确认端口状态前关闭。' })
    })
    socket.once('connect', () => finish('open', 'TCP 连接成功；端口开放不代表存在漏洞。'))
    socket.once('timeout', () =>
      finish('filtered', '连接超时，可能被过滤或目标无响应，未判定为关闭。'),
    )
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') finish('closed', '目标拒绝 TCP 连接。')
      else if (error.code === 'ETIMEDOUT') finish('filtered', '连接超时，端口状态未确定。')
      else finish('error', '连接失败或网络不可达，端口状态未确定。')
    })
    options.signal.addEventListener('abort', abort, { once: true })
    socket.setTimeout(options.timeoutMs)
    socket.connect({ host: address, port, family: isIP(address) })
  })
}
export async function executePortScan(
  job: ScanJob,
  options: {
    signal: AbortSignal
    allowInternal: boolean
    beforeProbe(): Promise<void>
    checkpoint(results: PortResult[]): Promise<void>
    probe?: TcpProbe
    network?: ScanNetworkDependencies
  },
): Promise<void> {
  if (!job.portScan) throw new Error('缺少端口扫描配置。')
  const done = new Set((job.portResults ?? []).map(portResultKey))
  for (const target of job.targets) {
    const remaining = job.portScan.ports.filter(
      (port) => !done.has(portResultKey({ target, port })),
    )
    if (!remaining.length) continue
    options.signal.throwIfAborted()
    await options.beforeProbe()
    let address: string
    try {
      address = (
        await resolveScanAddress(
          target,
          {
            allowInternal: options.allowInternal,
            signal: AbortSignal.any([options.signal, AbortSignal.timeout(job.policy.timeoutMs)]),
          },
          options.network,
        )
      ).address
    } catch (error) {
      options.signal.throwIfAborted()
      const detail =
        error instanceof Error && error.message === 'target-blocked'
          ? '地址被扫描策略禁止（本机、保留地址或未获内网权限）。'
          : '域名解析失败或超时，未发起 TCP 连接。'
      await options.checkpoint(
        remaining.map((port) => ({
          target,
          address: '',
          port,
          state: 'error',
          serviceHint: portServiceHint(port),
          detail,
          at: new Date().toISOString(),
        })),
      )
      continue
    }
    for (let offset = 0; offset < remaining.length; offset += job.portScan.concurrency) {
      options.signal.throwIfAborted()
      await options.beforeProbe()
      options.signal.throwIfAborted()
      const batch = remaining.slice(offset, offset + job.portScan.concurrency)
      const settled = await Promise.allSettled(
        batch.map(async (port) => {
          const result = await (options.probe ?? probeTcpPort)(address, port, {
            signal: options.signal,
            timeoutMs: job.policy.timeoutMs,
          })
          return {
            target,
            address,
            port,
            ...result,
            serviceHint: portServiceHint(port),
            at: new Date().toISOString(),
          }
        }),
      )
      // Wait for every socket to close even when one rejects or cancellation occurs.
      options.signal.throwIfAborted()
      await options.checkpoint(
        settled.map((value, index) =>
          value.status === 'fulfilled'
            ? value.value
            : {
                target,
                address,
                port: batch[index]!,
                state: 'error',
                serviceHint: portServiceHint(batch[index]!),
                detail: '探测失败，端口状态未确定。',
                at: new Date().toISOString(),
              },
        ),
      )
      if (offset + batch.length < remaining.length)
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer)
            reject(options.signal.reason)
          }
          const timer = setTimeout(() => {
            options.signal.removeEventListener('abort', abort)
            resolve()
          }, job.policy.delayMs)
          options.signal.addEventListener('abort', abort, { once: true })
          if (options.signal.aborted) {
            options.signal.removeEventListener('abort', abort)
            abort()
          }
        })
    }
  }
}
