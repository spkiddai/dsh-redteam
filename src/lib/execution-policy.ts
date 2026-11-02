import { isIP } from 'node:net'

export const REDTEAM_OPERATION_MODES = ['passive', 'active-scan', 'exploitation', 'full'] as const

export type RedTeamOperationMode = (typeof REDTEAM_OPERATION_MODES)[number]
export type TestingScopeMode = 'asset' | 'subdomains' | 'all-ports'

export interface TestingScopeRule {
  readonly mode: TestingScopeMode
  readonly targetId: string
  readonly targetLabel: string
  readonly targetType: string
}

export interface RedTeamExecutionPolicy {
  readonly enabledToolIds: readonly string[]
  readonly operationMode: RedTeamOperationMode
  readonly testingScope: readonly TestingScopeRule[]
}

export type RedTeamPolicyDecision =
  | { readonly kind: 'proceed' }
  | { readonly kind: 'ask'; readonly reason: string }
  | { readonly kind: 'deny'; readonly reason: string }

type TargetKind = 'host' | 'url'

interface ManagedToolCall {
  readonly requiredMode: RedTeamOperationMode
  readonly targets: readonly { readonly kind: TargetKind; readonly value: string }[]
  readonly toolId: 'burp-suite' | 'metasploit' | 'nmap' | 'nuclei'
}

const MODE_RANK: Readonly<Record<RedTeamOperationMode, number>> = {
  passive: 0,
  'active-scan': 1,
  exploitation: 2,
  full: 3,
}

const MODE_LABEL: Readonly<Record<RedTeamOperationMode, string>> = {
  passive: '信息收集',
  'active-scan': '主动扫描',
  exploitation: '漏洞验证',
  full: '全部允许',
}

const TOOL_IDS = new Set(['burp-suite', 'metasploit', 'nmap', 'nuclei'])
const SCOPE_MODES = new Set<TestingScopeMode>(['asset', 'subdomains', 'all-ports'])
const SCOPE_TYPES = new Set([
  'asn',
  'certificate',
  'domain',
  'infrastructure',
  'ip',
  'network',
  'organization',
  'product',
  'supplier',
  'technology',
  'url',
])

export const DEFAULT_REDTEAM_EXECUTION_POLICY: RedTeamExecutionPolicy = Object.freeze({
  enabledToolIds: Object.freeze([]),
  operationMode: 'passive',
  testingScope: Object.freeze([]),
})

function boundedString(value: unknown, name: string, maximum: number): string {
  if (typeof value !== 'string') throw new TypeError(`${name} 必须是字符串。`)
  const normalized = value.trim()
  if (normalized === '' || normalized.length > maximum) {
    throw new TypeError(`${name} 长度必须为 1-${String(maximum)} 个字符。`)
  }
  return normalized
}

function operationMode(value: unknown): RedTeamOperationMode {
  if (
    typeof value !== 'string' ||
    !REDTEAM_OPERATION_MODES.includes(value as RedTeamOperationMode)
  ) {
    throw new TypeError('operationMode 不是受支持的棱镜模式。')
  }
  return value as RedTeamOperationMode
}

export function parseRedTeamExecutionPolicy(value: unknown): RedTeamExecutionPolicy {
  const input = record(value)
  if (input === undefined) throw new TypeError('执行策略必须是对象。')
  const rawTools = stringArray(input.enabledToolIds)
  if (rawTools === undefined || rawTools.length > 64) {
    throw new TypeError('enabledToolIds 必须是受支持的工具列表。')
  }
  const enabledToolIds = [...new Set(rawTools)]
  if (
    enabledToolIds.some(
      (id) =>
        !TOOL_IDS.has(id) && !/^mcp-[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,78}[\p{L}\p{N}])?$/u.test(id),
    )
  ) {
    throw new TypeError('enabledToolIds 包含不受支持的工具。')
  }
  if (!Array.isArray(input.testingScope) || input.testingScope.length > 256) {
    throw new TypeError('testingScope 必须是最多 256 条的目标范围列表。')
  }
  const testingScope = input.testingScope.map((candidate, index): TestingScopeRule => {
    const rule = record(candidate)
    if (rule === undefined) throw new TypeError(`testingScope[${String(index)}] 必须是对象。`)
    const mode = boundedString(rule.mode, `testingScope[${String(index)}].mode`, 32)
    const targetType = boundedString(
      rule.targetType,
      `testingScope[${String(index)}].targetType`,
      32,
    )
    if (!SCOPE_MODES.has(mode as TestingScopeMode)) {
      throw new TypeError(`testingScope[${String(index)}].mode 不受支持。`)
    }
    if (!SCOPE_TYPES.has(targetType)) {
      throw new TypeError(`testingScope[${String(index)}].targetType 不受支持。`)
    }
    if (mode === 'subdomains' && targetType !== 'domain') {
      throw new TypeError('只有域名范围可以包含全部子域名。')
    }
    if (mode === 'all-ports' && targetType !== 'ip') {
      throw new TypeError('只有 IP 范围可以包含全部端口。')
    }
    return {
      mode: mode as TestingScopeMode,
      targetId: boundedString(rule.targetId, `testingScope[${String(index)}].targetId`, 256),
      targetLabel: boundedString(
        rule.targetLabel,
        `testingScope[${String(index)}].targetLabel`,
        2_048,
      ),
      targetType,
    }
  })
  return snapshotRedTeamExecutionPolicy({
    enabledToolIds,
    operationMode: operationMode(input.operationMode),
    testingScope,
  })
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Readonly<Record<string, unknown>>
}

function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return undefined
  return value as readonly string[]
}

function leafToolName(name: string): string {
  const separator = name.lastIndexOf('__')
  return separator < 0 ? name : name.slice(separator + 2)
}

function managedCall(name: string, argumentsValue: unknown): ManagedToolCall | undefined {
  const args = record(argumentsValue)
  const leaf = leafToolName(name)
  switch (leaf) {
    case 'nmap_status':
      return { requiredMode: 'passive', targets: [], toolId: 'nmap' }
    case 'nmap_scan': {
      const targets = stringArray(args?.targets)
      return {
        requiredMode: 'active-scan',
        targets: (targets ?? []).map((value) => ({ kind: 'host', value })),
        toolId: 'nmap',
      }
    }
    case 'nuclei_status':
      return { requiredMode: 'passive', targets: [], toolId: 'nuclei' }
    case 'nuclei_scan': {
      const targets = stringArray(args?.urls)
      return {
        requiredMode: 'active-scan',
        targets: (targets ?? []).map((value) => ({ kind: 'url', value })),
        toolId: 'nuclei',
      }
    }
    case 'burp_status':
      return { requiredMode: 'passive', targets: [], toolId: 'burp-suite' }
    case 'burp_proxy_request':
      return {
        requiredMode: 'active-scan',
        targets: typeof args?.url === 'string' ? [{ kind: 'url', value: args.url }] : [],
        toolId: 'burp-suite',
      }
    case 'metasploit_status':
    case 'metasploit_search':
    case 'metasploit_module_info':
      return { requiredMode: 'passive', targets: [], toolId: 'metasploit' }
    case 'metasploit_check':
      return {
        requiredMode: 'exploitation',
        targets: typeof args?.rhost === 'string' ? [{ kind: 'host', value: args.rhost }] : [],
        toolId: 'metasploit',
      }
    default:
      return undefined
  }
}

function canonicalHost(value: string): string | undefined {
  let candidate = value.trim().toLocaleLowerCase()
  if (candidate.startsWith('[') && candidate.endsWith(']')) candidate = candidate.slice(1, -1)
  if (candidate.endsWith('.')) candidate = candidate.slice(0, -1)
  if (candidate === '' || /[\s/@?#]/u.test(candidate)) return undefined
  return candidate
}

function canonicalUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    if (url.username !== '' || url.password !== '') return undefined
    url.hash = ''
    return url
  } catch {
    return undefined
  }
}

function ipv4Number(value: string): number | undefined {
  if (isIP(value) !== 4) return undefined
  const octets = value.split('.').map(Number)
  if (octets.length !== 4) return undefined
  return (
    (((octets[0] ?? 0) << 24) |
      ((octets[1] ?? 0) << 16) |
      ((octets[2] ?? 0) << 8) |
      (octets[3] ?? 0)) >>>
    0
  )
}

function ipv4InCidr(host: string, cidr: string): boolean {
  const [network, prefixText, extra] = cidr.split('/')
  if (network === undefined || prefixText === undefined || extra !== undefined) return false
  const addressNumber = ipv4Number(host)
  const networkNumber = ipv4Number(network)
  const prefix = Number(prefixText)
  if (
    addressNumber === undefined ||
    networkNumber === undefined ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  ) {
    return false
  }
  const mask = prefix === 0 ? 0 : (0xffff_ffff << (32 - prefix)) >>> 0
  return (addressNumber & mask) === (networkNumber & mask)
}

function urlWithinUrl(candidate: URL, authorized: URL): boolean {
  if (candidate.protocol !== authorized.protocol || candidate.host !== authorized.host) return false
  const basePath = authorized.pathname.endsWith('/')
    ? authorized.pathname
    : `${authorized.pathname}/`
  return candidate.pathname === authorized.pathname || candidate.pathname.startsWith(basePath)
}

function hostAllowed(host: string, rule: TestingScopeRule): boolean {
  if (rule.targetType === 'network') {
    const authorizedNetwork = rule.targetLabel.trim().toLocaleLowerCase()
    return host === authorizedNetwork || ipv4InCidr(host, authorizedNetwork)
  }
  const authorized = canonicalHost(rule.targetLabel)
  if (authorized === undefined) return false
  switch (rule.targetType) {
    case 'domain':
      return host === authorized || (rule.mode === 'subdomains' && host.endsWith(`.${authorized}`))
    case 'ip':
      return host === authorized
    default:
      return false
  }
}

function targetAllowed(
  target: { readonly kind: TargetKind; readonly value: string },
  rules: readonly TestingScopeRule[],
): boolean {
  if (target.kind === 'url') {
    const candidate = canonicalUrl(target.value)
    if (candidate === undefined) return false
    const host = canonicalHost(candidate.hostname)
    if (host === undefined) return false
    return rules.some((rule) => {
      if (rule.targetType === 'url') {
        const authorized = canonicalUrl(rule.targetLabel)
        return authorized !== undefined && urlWithinUrl(candidate, authorized)
      }
      return hostAllowed(host, rule)
    })
  }
  const host = canonicalHost(target.value)
  return host !== undefined && rules.some((rule) => hostAllowed(host, rule))
}

export function evaluateRedTeamToolPolicy(
  policy: RedTeamExecutionPolicy,
  toolName: string,
  argumentsValue: unknown,
): RedTeamPolicyDecision {
  const call = managedCall(toolName, argumentsValue)
  if (call === undefined) {
    return toolName.startsWith('mcp__redteam-tools__')
      ? { kind: 'deny', reason: `棱镜拒绝未定义权限规则的本地安全工具：${toolName}` }
      : { kind: 'proceed' }
  }
  if (!policy.enabledToolIds.includes(call.toolId)) {
    return { kind: 'deny', reason: `工具“${call.toolId}”尚未在工具集成中勾选并确认。` }
  }
  const requiresTarget = call.requiredMode !== 'passive'
  if (requiresTarget && call.targets.length === 0) {
    return { kind: 'deny', reason: `工具“${toolName}”缺少可校验的目标，已拒绝执行。` }
  }
  const outside = call.targets.find((target) => !targetAllowed(target, policy.testingScope))
  if (outside !== undefined) {
    return {
      kind: 'deny',
      reason: `目标“${outside.value}”不在当前任务已勾选并确认的目标范围内。`,
    }
  }
  if (MODE_RANK[policy.operationMode] < MODE_RANK[call.requiredMode]) {
    return {
      kind: 'ask',
      reason: `当前为“${MODE_LABEL[policy.operationMode]}”模式；此步骤需要“${MODE_LABEL[call.requiredMode]}”权限，请逐步审批。`,
    }
  }
  return { kind: 'proceed' }
}

export function snapshotRedTeamExecutionPolicy(
  policy: RedTeamExecutionPolicy,
): RedTeamExecutionPolicy {
  return Object.freeze({
    enabledToolIds: Object.freeze([...policy.enabledToolIds]),
    operationMode: policy.operationMode,
    testingScope: Object.freeze(policy.testingScope.map((rule) => Object.freeze({ ...rule }))),
  })
}
