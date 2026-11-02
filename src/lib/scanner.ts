import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { redactEvidence } from './redact.js'
import { SCAN_RULES } from './rules.js'
import { isPathWithin, normalizeRelativePath, resolveWithin, ScopeError } from './scope.js'
import type { Assessment, Finding, ScanOptions, ScanRule } from './types.js'

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  '.dsh-redteam',
  '.git',
  '.hg',
  '.svn',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'vendor',
])

const TEXT_EXTENSIONS = new Set([
  '.c',
  '.conf',
  '.cpp',
  '.cs',
  '.css',
  '.env',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.mjs',
  '.php',
  '.properties',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.xml',
  '.yaml',
  '.yml',
])

function isTextCandidate(path: string): boolean {
  const name = basename(path).toLowerCase()
  return (
    TEXT_EXTENSIONS.has(extname(name)) ||
    name === 'dockerfile' ||
    name.startsWith('.env') ||
    name.endsWith('rc')
  )
}

function fingerprint(rule: ScanRule, path: string, line: string, occurrence: number): string {
  return createHash('sha256')
    .update(`${rule.id}\0${path}\0${line.trim()}\0${String(occurrence)}`)
    .digest('hex')
    .slice(0, 20)
}

function findingFor(
  rule: ScanRule,
  relativePath: string,
  line: string,
  lineNumber: number,
  detectedAt: string,
  occurrence: number,
): Finding | undefined {
  if (rule.pathPattern !== undefined && !rule.pathPattern.test(relativePath)) return undefined
  const match = rule.pattern.exec(line)
  if (match === null) return undefined
  return {
    category: rule.category,
    confidence: rule.confidence,
    cwe: rule.cwe,
    detectedAt,
    evidence: redactEvidence(line.trim()),
    id: `finding-${fingerprint(rule, relativePath, line, occurrence)}`,
    location: { column: match.index + 1, line: lineNumber, path: relativePath },
    remediation: rule.remediation,
    ruleId: rule.id,
    ruleVersion: rule.version,
    severity: rule.severity,
    status: 'candidate',
    title: rule.title,
  }
}

async function scanFile(
  absolutePath: string,
  relativePath: string,
  rules: readonly ScanRule[],
  detectedAt: string,
  remaining: number,
): Promise<Finding[]> {
  const content = await readFile(absolutePath, 'utf8')
  if (content.includes('\0')) return []
  const findings: Finding[] = []
  const occurrences = new Map<string, number>()
  const lines = content.split(/\r?\n/u)
  for (const [index, line] of lines.entries()) {
    for (const rule of rules) {
      const occurrenceKey = `${rule.id}\0${line.trim()}`
      const occurrence = occurrences.get(occurrenceKey) ?? 0
      const finding = findingFor(rule, relativePath, line, index + 1, detectedAt, occurrence)
      if (finding !== undefined) findings.push(finding)
      if (finding !== undefined) occurrences.set(occurrenceKey, occurrence + 1)
      if (findings.length >= remaining) return findings
    }
  }
  return findings
}

function assessmentId(now: Date): string {
  return `rt-${now
    .toISOString()
    .replace(/[-:.TZ]/gu, '')
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`
}

export async function scanWorkspace(options: ScanOptions): Promise<Assessment> {
  const started = new Date()
  const requestedWorkspace = resolve(options.workspaceRoot)
  const workspaceRoot = await realpath(requestedWorkspace)
  const requestedScanRoot = resolveWithin(workspaceRoot, options.scanPath ?? '.')
  const scanRoot = await realpath(requestedScanRoot)
  if (!isPathWithin(workspaceRoot, scanRoot)) {
    throw new ScopeError(`scan path resolves outside the authorized workspace: ${options.scanPath}`)
  }
  if (!(await stat(scanRoot)).isDirectory())
    throw new Error(`scan path is not a directory: ${scanRoot}`)

  const rules = (options.rules ?? SCAN_RULES).filter((rule) =>
    options.categories.includes(rule.category),
  )
  const ignored = new Set([...DEFAULT_IGNORED_DIRECTORIES, ...options.ignoreDirectories])
  const pending = [scanRoot]
  const findings: Finding[] = []
  let filesScanned = 0
  let filesSkipped = 0
  let truncated = false

  while (pending.length > 0) {
    options.signal?.throwIfAborted()
    const directory = pending.pop()
    if (directory === undefined) break
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    for (const entry of entries) {
      options.signal?.throwIfAborted()
      const absolutePath = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        filesSkipped += 1
        continue
      }
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) pending.push(absolutePath)
        continue
      }
      if (!entry.isFile() || !isTextCandidate(absolutePath)) {
        filesSkipped += 1
        continue
      }
      if (filesScanned >= options.maxFiles) {
        truncated = true
        break
      }
      const fileStat = await stat(absolutePath)
      if (fileStat.size > options.maxFileBytes) {
        filesSkipped += 1
        continue
      }
      const relativePath = normalizeRelativePath(workspaceRoot, absolutePath)
      const remaining = options.maxFindings - findings.length
      const fileFindings = await scanFile(
        absolutePath,
        relativePath,
        rules,
        started.toISOString(),
        remaining,
      )
      filesScanned += 1
      findings.push(...fileFindings)
      if (findings.length >= options.maxFindings) {
        truncated = true
        break
      }
    }
    if (truncated) break
  }

  return {
    completedAt: new Date().toISOString(),
    filesScanned,
    filesSkipped,
    findings,
    id: assessmentId(started),
    mode: 'review',
    scanRoot: normalizeRelativePath(workspaceRoot, scanRoot),
    schemaVersion: 1,
    startedAt: started.toISOString(),
    truncated,
    workspaceRoot,
  }
}
