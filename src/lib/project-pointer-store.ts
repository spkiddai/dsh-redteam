import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { assertProjectId } from './knowledge.js'
import { atomicWritePrivate } from './store.js'
import type { ProjectPointer } from './types.js'

function isMissing(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

function assertPointer(value: unknown): asserts value is ProjectPointer {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('projectId' in value) ||
    typeof value.projectId !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('startedAt' in value) ||
    typeof value.startedAt !== 'string'
  ) {
    throw new Error('current project pointer has an invalid schema')
  }
  assertProjectId(value.projectId)
}

export class ProjectPointerStore {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  async save(pointer: ProjectPointer): Promise<void> {
    assertPointer(pointer)
    await atomicWritePrivate(
      join(this.root, 'knowledge', 'current-project.json'),
      `${JSON.stringify(pointer, undefined, 2)}\n`,
    )
  }

  async current(): Promise<ProjectPointer | undefined> {
    try {
      const raw = await readFile(join(this.root, 'knowledge', 'current-project.json'), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      assertPointer(parsed)
      return parsed
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }
}
