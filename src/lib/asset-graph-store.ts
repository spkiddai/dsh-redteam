import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { atomicWritePrivate } from './store.js'
import type { AssetGraph, AssetGraphReportFormat } from './types.js'

const GRAPH_ID = /^asset-[0-9]{14}-[a-f0-9]{8}$/u

function assertGraphId(id: string): void {
  if (!GRAPH_ID.test(id)) throw new Error(`invalid asset graph id: ${id}`)
}

function assertGraph(value: unknown): asserts value is AssetGraph {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !GRAPH_ID.test(value.id) ||
    !('nodes' in value) ||
    !Array.isArray(value.nodes) ||
    !('edges' in value) ||
    !Array.isArray(value.edges) ||
    !('sources' in value) ||
    !Array.isArray(value.sources)
  ) {
    throw new Error('stored asset graph has an invalid schema')
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

export class AssetGraphStore {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  async save(graph: AssetGraph): Promise<void> {
    assertGraphId(graph.id)
    await this.replace(graph)
    await atomicWritePrivate(
      join(this.root, 'latest-asset-graph.json'),
      `${JSON.stringify({ id: graph.id })}\n`,
    )
  }

  async replace(graph: AssetGraph): Promise<void> {
    assertGraphId(graph.id)
    await atomicWritePrivate(
      join(this.root, 'asset-graphs', graph.id, 'graph.json'),
      `${JSON.stringify(graph, undefined, 2)}\n`,
    )
  }

  async load(id: string): Promise<AssetGraph> {
    assertGraphId(id)
    const raw = await readFile(join(this.root, 'asset-graphs', id, 'graph.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    assertGraph(parsed)
    return parsed
  }

  async latest(): Promise<AssetGraph | undefined> {
    try {
      const raw = await readFile(join(this.root, 'latest-asset-graph.json'), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        !('id' in parsed) ||
        typeof parsed.id !== 'string'
      ) {
        throw new Error('latest asset graph pointer has an invalid schema')
      }
      return await this.load(parsed.id)
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async writeReport(id: string, format: AssetGraphReportFormat, content: string): Promise<string> {
    assertGraphId(id)
    const extension = format === 'markdown' ? 'md' : format
    const target = join(this.root, 'asset-graphs', id, 'reports', `asset-graph.${extension}`)
    await atomicWritePrivate(target, content)
    return target
  }
}
