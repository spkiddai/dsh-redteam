import { isIP } from 'node:net'

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u

function normalizeDomain(value: string): string | undefined {
  const normalized = value.toLocaleLowerCase().replace(/\.$/u, '')
  if (normalized.length === 0 || normalized.length > 253) return undefined
  return normalized.split('.').every((label) => DOMAIN_LABEL.test(label)) ? normalized : undefined
}

export function normalizeHostTarget(value: string, allowCidr = true): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 512 || /\s/u.test(normalized)) {
    throw new Error('目标必须是有效的 IP、CIDR 或域名')
  }
  if (allowCidr && normalized.includes('/')) {
    const separator = normalized.lastIndexOf('/')
    const address = normalized.slice(0, separator)
    const prefixText = normalized.slice(separator + 1)
    const family = isIP(address)
    const prefix = Number(prefixText)
    const maximum = family === 4 ? 32 : family === 6 ? 128 : -1
    if (Number.isInteger(prefix) && prefix >= 0 && prefix <= maximum) return normalized
    throw new Error('CIDR 目标无效')
  }
  if (isIP(normalized) !== 0) return normalized
  const domain = normalizeDomain(normalized)
  if (domain !== undefined) return domain
  throw new Error('目标必须是有效的 IP、CIDR 或域名')
}

export function normalizeHttpUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('目标必须是有效的 HTTP(S) URL')
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    throw new Error('目标必须是无内嵌凭据的 HTTP(S) URL')
  }
  normalizeHostTarget(parsed.hostname, false)
  parsed.hash = ''
  return parsed.href
}

export function normalizePorts(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 160) throw new Error('端口范围无效')
  const ranges = normalized.split(',')
  for (const range of ranges) {
    const parts = range.split('-')
    if (parts.length > 2 || parts.some((part) => !/^\d{1,5}$/u.test(part))) {
      throw new Error('端口范围无效')
    }
    const start = Number(parts[0])
    const end = Number(parts[1] ?? parts[0])
    if (start < 1 || start > 65_535 || end < start || end > 65_535) {
      throw new Error('端口范围无效')
    }
  }
  return normalized
}

export function normalizeMetasploitModule(value: string): string {
  const normalized = value.trim().toLocaleLowerCase()
  if (!/^(?:auxiliary|exploit)\/[a-z0-9_./-]{1,180}$/u.test(normalized)) {
    throw new Error('Metasploit 模块名称无效')
  }
  return normalized
}

export function normalizeMetasploitQuery(value: string): string {
  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    normalized.length > 160 ||
    !/^[\p{L}\p{N}_:./ -]+$/u.test(normalized)
  ) {
    throw new Error('Metasploit 搜索条件包含不支持的字符')
  }
  return normalized
}

export function normalizeTargetUri(value: string): string {
  const normalized = value.trim()
  if (!/^\/(?:[^\s;\\]{0,511})$/u.test(normalized)) throw new Error('TARGETURI 无效')
  return normalized
}

export function normalizeNucleiTag(value: string): string {
  const normalized = value.trim().toLocaleLowerCase()
  if (!/^[a-z0-9_-]{1,40}$/u.test(normalized)) throw new Error('Nuclei 标签无效')
  return normalized
}
