/** A DSH-discovered tool description; content is untrusted server-provided data. */
export interface McpToolMetadata {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
}

/** An AI recommendation becomes usable only after browser confirmation. */
export interface McpPermission {
  readonly connectionId: string
  readonly toolName: string
  readonly schemaHash: string
  readonly mode: 'passive' | 'active-scan' | 'exploitation' | 'full' | 'blocked'
  readonly targetKind: 'none' | 'host' | 'url'
  readonly targetField: string
  readonly reason: string
  readonly confirmed: boolean
}
