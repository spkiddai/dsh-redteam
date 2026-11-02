import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import {
  renderHtml,
  renderJson,
  renderMarkdown,
  renderReport,
  renderSarif,
  renderWord,
  renderXml,
} from '../src/lib/report.js'
import { AssessmentStore } from '../src/lib/store.js'
import type { Assessment } from '../src/lib/types.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

function assessment(workspaceRoot: string): Assessment {
  return {
    completedAt: '2026-08-21T00:00:01.000Z',
    filesScanned: 1,
    filesSkipped: 0,
    findings: [
      {
        category: 'source',
        confidence: 'medium',
        cwe: 'CWE-95',
        detectedAt: '2026-08-21T00:00:00.000Z',
        evidence: 'eval(input)',
        id: 'finding-1234',
        location: { column: 1, line: 7, path: 'src/app.ts' },
        remediation: 'Use a parser.',
        ruleId: 'RT-SOURCE-001',
        ruleVersion: '1',
        severity: 'high',
        status: 'confirmed',
        statusHistory: [
          {
            changedAt: '2026-08-21T00:30:00.000Z',
            from: 'candidate',
            reason: 'Reviewed reachable input.',
            to: 'confirmed',
          },
        ],
        title: 'Dynamic code evaluation',
      },
      {
        category: 'secret',
        confidence: 'high',
        cwe: 'CWE-321',
        detectedAt: '2026-08-21T00:00:00.000Z',
        evidence: '```private key marker```',
        id: 'finding-critical',
        location: { column: 1, line: 1, path: 'secret|file.pem' },
        remediation: 'Rotate it.',
        ruleId: 'RT-SECRET-001',
        severity: 'critical',
        status: 'accepted',
        title: 'Private `key`',
      },
      {
        category: 'configuration',
        confidence: 'medium',
        cwe: 'CWE-942',
        detectedAt: '2026-08-21T00:00:00.000Z',
        evidence: 'origin: *',
        id: 'finding-medium',
        location: { column: 1, line: 3, path: 'config.yml' },
        remediation: 'Restrict origins.',
        ruleId: 'RT-CONFIG-002',
        severity: 'medium',
        status: 'fixed',
        title: 'Permissive CORS',
      },
      {
        category: 'configuration',
        confidence: 'medium',
        cwe: 'CWE-200',
        detectedAt: '2026-08-21T00:00:00.000Z',
        evidence: 'debug: true',
        id: 'finding-low',
        location: { column: 1, line: 4, path: 'config.yml' },
        remediation: 'Disable debug output.',
        ruleId: 'RT-CONFIG-TEST',
        severity: 'low',
        status: 'candidate',
        title: 'Debug output',
      },
    ],
    id: 'rt-20260821000000-a1b2c3d4',
    mode: 'review',
    scanRoot: '.',
    schemaVersion: 1,
    startedAt: '2026-08-21T00:00:00.000Z',
    truncated: false,
    workspaceRoot,
  }
}

describe('assessment reports and persistence', () => {
  it('renders HTML, Word, Markdown, JSON, XML, and SARIF from one canonical assessment', () => {
    const value = assessment('/workspace')
    expect(renderMarkdown(value)).toContain('## HIGH')
    expect(renderMarkdown(value)).toContain('Private \\`key\\`')
    expect(renderMarkdown(value)).toContain('secret\\|file.pem')
    expect(renderMarkdown(value)).not.toContain('```private key marker```')
    expect(renderMarkdown(value)).toContain('Latest review decision')
    expect(JSON.parse(renderJson(value))).toMatchObject({ id: value.id })
    expect(JSON.parse(renderSarif(value))).toMatchObject({ version: '2.1.0' })
    const renderedJson = renderReport(value, 'json')
    expect(typeof renderedJson).toBe('string')
    expect(JSON.parse(renderedJson as string)).toMatchObject({ id: value.id })
    expect(renderHtml(value)).toContain('<!doctype html>')
    expect(renderHtml(value)).toContain('Dynamic code evaluation')
    expect(renderHtml(value)).toContain('Reviewed reachable input.')
    expect(renderXml(value)).toContain('<assessment-report schema-version="1">')
    expect(renderXml(value)).toContain('path="secret|file.pem"')
    expect(renderXml(value)).toContain('<change from="candidate" to="confirmed"')
    const word = unzipSync(renderWord(value))
    expect(strFromU8(word['word/document.xml']!)).toContain('Dynamic code evaluation')
    expect(strFromU8(word['word/document.xml']!)).toContain('Latest review:')
    expect(strFromU8(word['[Content_Types].xml']!)).toContain('wordprocessingml.document')
  })

  it('round-trips an assessment and writes a report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-redteam-store-'))
    temporaryDirectories.push(root)
    const store = new AssessmentStore(join(root, 'state'))
    const value = assessment(root)
    await store.save(value)
    expect(await store.load(value.id)).toEqual(value)
    expect((await store.latest())?.id).toBe(value.id)

    const reportPath = await store.writeReport(value.id, 'markdown', renderMarkdown(value))
    expect(await readFile(reportPath, 'utf8')).toContain('Dynamic code evaluation')
    expect(await store.writeReport(value.id, 'json', renderJson(value))).toMatch(/report\.json$/u)
    expect(await store.writeReport(value.id, 'html', renderHtml(value))).toMatch(/report\.html$/u)
    expect(await store.writeReport(value.id, 'xml', renderXml(value))).toMatch(/report\.xml$/u)
    const wordPath = await store.writeReport(value.id, 'word', renderWord(value))
    expect(wordPath).toMatch(/report\.docx$/u)
    expect((await readFile(wordPath)).subarray(0, 2).toString()).toBe('PK')
  })

  it('returns no latest assessment for a new store and rejects unsafe ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-redteam-empty-'))
    temporaryDirectories.push(root)
    const store = new AssessmentStore(root)
    expect(await store.latest()).toBeUndefined()
    await expect(store.load('../escape')).rejects.toThrow('invalid assessment id')
  })

  it('rejects malformed stored assessments and latest pointers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-redteam-corrupt-'))
    temporaryDirectories.push(root)
    const id = 'rt-20260821000000-a1b2c3d4'
    await mkdir(join(root, 'assessments', id), { recursive: true })
    await writeFile(join(root, 'assessments', id, 'assessment.json'), '{"schemaVersion":2}')
    const store = new AssessmentStore(root)
    await expect(store.load(id)).rejects.toThrow('invalid schema')

    await writeFile(join(root, 'latest.json'), '{"unexpected":true}')
    await expect(store.latest()).rejects.toThrow('latest assessment pointer')
  })
})
