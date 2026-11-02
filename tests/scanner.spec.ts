import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanWorkspace } from '../src/lib/scanner.js'
import { ScopeError } from '../src/lib/scope.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-redteam-scan-'))
  temporaryDirectories.push(root)
  await mkdir(join(root, 'src'))
  return root
}

describe('passive scanner', () => {
  it('finds structured candidates and redacts their evidence', async () => {
    const root = await workspace()
    await writeFile(
      join(root, 'src', 'unsafe.ts'),
      ['const password = "this-is-a-secret"', 'eval(userInput)', 'rejectUnauthorized: false'].join(
        '\n',
      ),
    )
    const assessment = await scanWorkspace({
      categories: ['secret', 'source', 'configuration'],
      ignoreDirectories: [],
      maxFileBytes: 100_000,
      maxFiles: 100,
      maxFindings: 100,
      workspaceRoot: root,
    })
    expect(assessment.filesScanned).toBe(1)
    expect(assessment.findings.map((finding) => finding.ruleId)).toEqual([
      'RT-SECRET-003',
      'RT-SOURCE-001',
      'RT-SOURCE-003',
    ])
    expect(assessment.findings[0]?.evidence).toContain('[redacted]')
    expect(assessment.findings[0]?.evidence).not.toContain('this-is-a-secret')
    expect(assessment.findings[0]?.ruleVersion).toBe('1')
  })

  it('assigns distinct stable ids to repeated identical findings', async () => {
    const root = await workspace()
    await writeFile(join(root, 'src', 'repeated.js'), 'eval(input)\neval(input)\n')
    const options = {
      categories: ['source'] as const,
      ignoreDirectories: [],
      maxFileBytes: 100_000,
      maxFiles: 100,
      maxFindings: 100,
      workspaceRoot: root,
    }
    const first = await scanWorkspace(options)
    const second = await scanWorkspace(options)
    expect(new Set(first.findings.map((finding) => finding.id)).size).toBe(2)
    expect(second.findings.map((finding) => finding.id)).toEqual(
      first.findings.map((finding) => finding.id),
    )
  })

  it('filters categories and skips ignored output directories', async () => {
    const root = await workspace()
    await writeFile(join(root, 'src', 'unsafe.js'), 'eval(input)')
    await mkdir(join(root, '.dsh-redteam'))
    await writeFile(join(root, '.dsh-redteam', 'ignored.js'), 'eval(input)')
    const assessment = await scanWorkspace({
      categories: ['secret'],
      ignoreDirectories: [],
      maxFileBytes: 100_000,
      maxFiles: 100,
      maxFindings: 100,
      workspaceRoot: root,
    })
    expect(assessment.findings).toEqual([])
    expect(assessment.filesScanned).toBe(1)
  })

  it('does not follow symlinks outside the workspace', async () => {
    const root = await workspace()
    const outside = await mkdtemp(join(tmpdir(), 'dsh-redteam-outside-'))
    temporaryDirectories.push(outside)
    await writeFile(join(outside, 'secret.ts'), 'const password = "outside-secret"')
    await symlink(outside, join(root, 'linked'))
    const assessment = await scanWorkspace({
      categories: ['secret'],
      ignoreDirectories: [],
      maxFileBytes: 100_000,
      maxFiles: 100,
      maxFindings: 100,
      workspaceRoot: root,
    })
    expect(assessment.findings).toEqual([])
    expect(assessment.filesSkipped).toBeGreaterThan(0)
  })

  it('rejects a scan root outside the workspace', async () => {
    const root = await workspace()
    await expect(
      scanWorkspace({
        categories: ['source'],
        ignoreDirectories: [],
        maxFileBytes: 100_000,
        maxFiles: 100,
        maxFindings: 100,
        scanPath: '..',
        workspaceRoot: root,
      }),
    ).rejects.toBeInstanceOf(ScopeError)
  })

  it('marks assessments truncated when the finding limit is reached', async () => {
    const root = await workspace()
    await writeFile(join(root, 'src', 'unsafe.js'), 'eval(a)\neval(b)')
    const assessment = await scanWorkspace({
      categories: ['source'],
      ignoreDirectories: [],
      maxFileBytes: 100_000,
      maxFiles: 100,
      maxFindings: 1,
      workspaceRoot: root,
    })
    expect(assessment.findings).toHaveLength(1)
    expect(assessment.truncated).toBe(true)
  })

  it('enforces file-count and file-size limits', async () => {
    const root = await workspace()
    await writeFile(join(root, 'src', 'a.js'), 'const safe = true')
    await writeFile(join(root, 'src', 'b.js'), 'const safe = true')
    await writeFile(join(root, 'src', 'large.js'), 'x'.repeat(2_000))
    const assessment = await scanWorkspace({
      categories: ['source'],
      ignoreDirectories: [],
      maxFileBytes: 1_024,
      maxFiles: 1,
      maxFindings: 100,
      workspaceRoot: root,
    })
    expect(assessment.filesScanned).toBe(1)
    expect(assessment.truncated).toBe(true)

    const sizeLimited = await scanWorkspace({
      categories: ['source'],
      ignoreDirectories: [],
      maxFileBytes: 1_024,
      maxFiles: 100,
      maxFindings: 100,
      workspaceRoot: root,
    })
    expect(sizeLimited.filesSkipped).toBeGreaterThan(0)
  })

  it('skips binary candidates, unknown files, and custom ignored directories', async () => {
    const root = await workspace()
    await writeFile(join(root, 'src', 'binary.js'), Buffer.from([0, 1, 2, 3]))
    await writeFile(join(root, 'src', 'image.bin'), Buffer.from([1, 2, 3]))
    await mkdir(join(root, 'generated'))
    await writeFile(join(root, 'generated', 'unsafe.js'), 'eval(input)')
    const assessment = await scanWorkspace({
      categories: ['source'],
      ignoreDirectories: ['generated'],
      maxFileBytes: 100_000,
      maxFiles: 100,
      maxFindings: 100,
      workspaceRoot: root,
    })
    expect(assessment.findings).toEqual([])
    expect(assessment.filesSkipped).toBeGreaterThan(0)
  })

  it('recognizes extensionless and environment configuration files', async () => {
    const root = await workspace()
    await writeFile(join(root, 'Dockerfile'), 'FROM scratch')
    await writeFile(
      join(root, '.env.local'),
      'PRIVATE_TOKEN="example-secret"\nAWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
    )
    await writeFile(join(root, 'app.yaml'), 'privileged: true')
    const assessment = await scanWorkspace({
      categories: ['secret', 'configuration'],
      ignoreDirectories: [],
      maxFileBytes: 100_000,
      maxFiles: 100,
      maxFindings: 100,
      workspaceRoot: root,
    })
    expect(assessment.filesScanned).toBe(3)
    expect(assessment.findings.map((finding) => finding.ruleId)).toContain('RT-CONFIG-001')
    expect(assessment.findings.map((finding) => finding.ruleId)).toContain('RT-SECRET-003')
    const awsFinding = assessment.findings.find((finding) => finding.ruleId === 'RT-SECRET-002')
    expect(awsFinding?.evidence).toContain('[redacted-aws-key]')
    expect(awsFinding?.evidence).not.toContain('AKIAIOSFODNN7EXAMPLE')
  })

  it('rejects a file as scan root and observes cancellation', async () => {
    const root = await workspace()
    await writeFile(join(root, 'src', 'file.js'), 'eval(input)')
    await expect(
      scanWorkspace({
        categories: ['source'],
        ignoreDirectories: [],
        maxFileBytes: 100_000,
        maxFiles: 100,
        maxFindings: 100,
        scanPath: 'src/file.js',
        workspaceRoot: root,
      }),
    ).rejects.toThrow('not a directory')

    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(
      scanWorkspace({
        categories: ['source'],
        ignoreDirectories: [],
        maxFileBytes: 100_000,
        maxFiles: 100,
        maxFindings: 100,
        signal: controller.signal,
        workspaceRoot: root,
      }),
    ).rejects.toThrow('cancelled')
  })

  it('rejects a symlinked scan root that resolves outside the workspace', async () => {
    const root = await workspace()
    const outside = await mkdtemp(join(tmpdir(), 'dsh-redteam-root-link-'))
    temporaryDirectories.push(outside)
    await symlink(outside, join(root, 'linked-root'))
    await expect(
      scanWorkspace({
        categories: ['source'],
        ignoreDirectories: [],
        maxFileBytes: 100_000,
        maxFiles: 100,
        maxFindings: 100,
        scanPath: 'linked-root',
        workspaceRoot: root,
      }),
    ).rejects.toBeInstanceOf(ScopeError)
  })
})
