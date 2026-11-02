import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { Assessment, ReportFormat } from './types.js'

const ASSESSMENT_ID = /^rt-[0-9]{14}-[a-f0-9]{8}$/u

function assertAssessment(value: unknown): asserts value is Assessment {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !ASSESSMENT_ID.test(value.id) ||
    !('findings' in value) ||
    !Array.isArray(value.findings)
  ) {
    throw new Error('stored assessment has an invalid schema')
  }
}

function isMissing(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

export async function atomicWritePrivate(
  path: string,
  content: string | Uint8Array,
): Promise<void> {
  await mkdir(dirname(path), { mode: 0o700, recursive: true })
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(content)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, path)
    try {
      const directory = await open(dirname(path), 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    } catch {
      // Some platforms cannot fsync directories; the file itself is already synced and renamed.
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

function assertAssessmentId(id: string): void {
  if (!ASSESSMENT_ID.test(id)) throw new Error(`invalid assessment id: ${id}`)
}

export class AssessmentStore {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  async save(assessment: Assessment): Promise<void> {
    assertAssessmentId(assessment.id)
    const target = join(this.root, 'assessments', assessment.id, 'assessment.json')
    await atomicWritePrivate(target, `${JSON.stringify(assessment, undefined, 2)}\n`)
    await atomicWritePrivate(
      join(this.root, 'latest.json'),
      `${JSON.stringify({ id: assessment.id })}\n`,
    )
  }

  async replace(assessment: Assessment): Promise<void> {
    assertAssessmentId(assessment.id)
    const target = join(this.root, 'assessments', assessment.id, 'assessment.json')
    await atomicWritePrivate(target, `${JSON.stringify(assessment, undefined, 2)}\n`)
  }

  async load(id: string): Promise<Assessment> {
    assertAssessmentId(id)
    const raw = await readFile(join(this.root, 'assessments', id, 'assessment.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    assertAssessment(parsed)
    return parsed
  }

  async latest(): Promise<Assessment | undefined> {
    try {
      const raw = await readFile(join(this.root, 'latest.json'), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        !('id' in parsed) ||
        typeof parsed.id !== 'string'
      ) {
        throw new Error('latest assessment pointer has an invalid schema')
      }
      return await this.load(parsed.id)
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async writeReport(
    id: string,
    format: ReportFormat,
    content: string | Uint8Array,
  ): Promise<string> {
    assertAssessmentId(id)
    const extension = format === 'markdown' ? 'md' : format === 'word' ? 'docx' : format
    const target = join(this.root, 'assessments', id, 'reports', `report.${extension}`)
    await atomicWritePrivate(target, content)
    return target
  }
}
