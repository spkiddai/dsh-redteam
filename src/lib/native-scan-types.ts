/** Prism's own rule and job format. No Nuclei templates or NASL are executed. */
export type ScanSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type ScanField =
  'status' | 'header' | 'body' | 'cookie' | 'tls.valid' | 'tls.days' | 'tls.keyBits'
export type ScanMatch =
  | { all: ScanMatch[] }
  | { any: ScanMatch[] }
  | {
      field: ScanField
      key?: string | undefined
      op: 'equals' | 'contains' | 'absent' | 'lt'
      value?: string | number | boolean | undefined
    }
export interface ScanRule {
  id: string
  version: number
  title: string
  family: 'web' | 'exposure' | 'tls'
  severity: ScanSeverity
  path: string
  match: ScanMatch
  evidence: string
  remediation: string
}
export interface ScanPolicy {
  id: 'quick' | 'standard' | 'custom'
  timeoutMs: number
  delayMs: number
  ruleIds: string[]
}
export interface ScanCheck {
  target: string
  ruleId: string
  state: 'hit' | 'pass' | 'error' | 'skipped'
  detail: string
  at: string
}
export interface ScanFinding {
  id: string
  target: string
  ruleId: string
  title: string
  severity: ScanSeverity
  evidence: string
  remediation: string
  state: 'open' | 'accepted' | 'false-positive'
  note: string
}
export type ScanState =
  'queued' | 'running' | 'paused' | 'completed' | 'partial' | 'cancelled' | 'failed' | 'interrupted'
export interface PortResult {
  target: string
  address: string
  port: number
  state: 'open' | 'closed' | 'filtered' | 'error'
  serviceHint: string
  detail: string
  at: string
}
export type ScanKind = 'web' | 'ports' | 'services'
export type ServiceProbeMode = 'auto' | 'banner' | 'redis' | 'http' | 'tls'
export interface ServiceResult {
  target: string
  address: string
  port: number
  state: 'identified' | 'unknown' | 'closed' | 'error'
  protocol: string
  product: string
  version: string
  detail: string
  at: string
}
export type ServiceRule = Pick<
  ScanRule,
  'id' | 'version' | 'title' | 'severity' | 'evidence' | 'remediation'
>
export interface ScanJob {
  kind?: ScanKind
  serviceScan?: { ports: number[]; mode: ServiceProbeMode }
  serviceResults?: ServiceResult[]
  serviceRules?: ServiceRule[]
  portScan?: { ports: number[]; concurrency: number }
  portResults?: PortResult[]
  id: string
  ownerId: string
  projectId: string | null
  name: string
  targets: string[]
  policy: ScanPolicy
  rules: ScanRule[]
  ruleHash: string
  state: ScanState
  createdAt: string
  updatedAt: string
  checks: ScanCheck[]
  findings: ScanFinding[]
  message: string
}
export interface ScanCatalog {
  rules: ScanRule[]
  serviceRules?: ServiceRule[]
  canRun: boolean
  canScanInternal: boolean
  canManageRules: boolean
}
export interface ScanSummary {
  kind?: ScanKind
  openPorts?: number
  id: string
  name: string
  ownerId: string
  projectId: string | null
  state: ScanState
  createdAt: string
  targets: string[]
  ruleHash: string
  completedChecks: number
  totalChecks: number
  findingsCount: number
}
export const totalScanChecks = (job: ScanJob) =>
  job.targets.length *
  (job.kind === 'ports'
    ? (job.portScan?.ports.length ?? 0)
    : job.kind === 'services'
      ? (job.serviceScan?.ports.length ?? 0)
      : job.rules.length)
export const completedScanChecks = (job: ScanJob) =>
  job.kind === 'ports'
    ? (job.portResults?.length ?? 0)
    : job.kind === 'services'
      ? (job.serviceResults?.length ?? 0)
      : job.checks.length
export const SCAN_KIND_LABEL = {
  ports: '网络端口扫描',
  services: '端口指纹漏洞扫描',
  web: 'Web 漏洞扫描',
}
export const SERVICE_MODE_LABEL = {
  auto: '自动 · 问候语与常用端口协议',
  banner: '被动问候语 · SSH / FTP / SMTP / MySQL',
  redis: 'Redis · INFO server',
  http: 'HTTP · HEAD /',
  tls: 'TLS · 握手与证书',
}
export const SERVICE_STATE_LABEL = {
  identified: '已识别',
  unknown: '未识别',
  closed: '连接被拒绝',
  error: '未完成',
}
export const MAX_SERVICE_CHECKS = 128
export const portResultKey = (result: Pick<PortResult, 'target' | 'port'>) =>
  `${result.target}:${result.port}`
export const COMMON_TCP_PORTS =
  '21,22,25,53,80,110,135,139,143,443,445,465,587,993,995,1433,1521,2049,2375,3000,3306,3389,5432,5672,5900,6379,6443,8000,8080,8443,9000,9200,11211,27017'
export const MAX_PORT_CHECKS = 4096
export interface ScanComparison {
  added: string[]
  persistent: string[]
  resolved: string[]
  unverified: string[]
}
