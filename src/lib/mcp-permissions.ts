import { createHash } from 'node:crypto'
import { redactEvidence } from './redact.js'

import type { McpToolMetadata, McpPermission } from './mcp-permission-types.js'
export type { McpToolMetadata, McpPermission } from './mcp-permission-types.js'

/** Bind permissions to the exact tool description and argument schema reviewed. */
export function mcpToolHash(tool: McpToolMetadata): string {
  return createHash('sha256').update(JSON.stringify(tool)).digest('hex')
}

/** Validate persisted permissions without trusting model-controlled approval fields. */
export function parseStoredMcpPermissions(value: unknown): McpPermission[] {
  if (!Array.isArray(value) || value.length > 512) throw new Error('MCP 权限建议数量无效。')
  return value.map((item: unknown) => {
    if (item === null || typeof item !== 'object') throw new Error('MCP 权限建议无效。')
    const p = item as Record<string, unknown>
    if (
      typeof p.connectionId !== 'string' ||
      !/^mcp-[a-f0-9]{20}$/u.test(p.connectionId) ||
      typeof p.toolName !== 'string' ||
      p.toolName.length > 256 ||
      !p.toolName.startsWith('mcp__rt-') ||
      typeof p.schemaHash !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(p.schemaHash) ||
      !['blocked', 'passive', 'active-scan', 'exploitation', 'full'].includes(p.mode as string) ||
      !['none', 'host', 'url'].includes(p.targetKind as string) ||
      typeof p.targetField !== 'string' ||
      p.targetField.length > 128 ||
      typeof p.reason !== 'string' ||
      p.reason.trim() === '' ||
      p.reason.length > 512 ||
      typeof p.confirmed !== 'boolean'
    )
      throw new Error('MCP 权限建议字段无效。')
    if (
      p.targetKind === 'none'
        ? p.targetField !== '' || !['passive', 'blocked'].includes(p.mode as string)
        : !/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(p.targetField)
    ) {
      throw new Error('主动工具必须指定可校验的目标字段。')
    }
    return {
      connectionId: p.connectionId,
      toolName: p.toolName,
      schemaHash: p.schemaHash,
      mode: p.mode as McpPermission['mode'],
      targetKind: p.targetKind as McpPermission['targetKind'],
      targetField: p.targetField,
      reason: redactEvidence(p.reason),
      confirmed: p.confirmed,
    }
  })
}

/** Translate AI JSON into unconfirmed permissions tied to live discovered tools. */
export function proposeMcpPermissions(
  connectionId: string,
  json: string,
  tools: readonly McpToolMetadata[],
): McpPermission[] {
  if (json.length > 64_000) throw new Error('AI 权限建议过长。')
  const parsed: unknown = JSON.parse(json)
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 128)
    throw new Error('请逐项提交工具权限建议。')
  const seen = new Set<string>()
  const permissions = parsed.map((value: unknown) => {
    if (value === null || typeof value !== 'object') throw new Error('工具权限建议无效。')
    const p = value as Record<string, unknown>
    const tool = tools.find((item) => item.name === p.toolName)
    if (tool === undefined || seen.has(tool.name)) throw new Error('建议包含未知或重复工具。')
    seen.add(tool.name)
    if (p.targetKind !== 'none') {
      const properties = tool.parameters.properties as Record<string, unknown> | undefined
      const field = typeof p.targetField === 'string' ? properties?.[p.targetField] : undefined
      if (field === null || typeof field !== 'object') throw new Error('目标字段不在工具参数中。')
      const schema = field as Record<string, unknown>
      const items = schema.items as Record<string, unknown> | undefined
      if (schema.type !== 'string' && !(schema.type === 'array' && items?.type === 'string'))
        throw new Error('目标字段必须为字符串或字符串数组。')
    }
    return { ...p, connectionId, schemaHash: mcpToolHash(tool), confirmed: false }
  })
  return parseStoredMcpPermissions(permissions)
}

/** A revision prevents confirmation from approving suggestions replaced in another tab. */
export function mcpReviewId(permissions: readonly McpPermission[]): string {
  return createHash('sha256')
    .update(JSON.stringify(permissions.map(({ confirmed: _confirmed, ...p }) => p)))
    .digest('hex')
}
