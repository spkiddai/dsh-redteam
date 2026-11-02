import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DEFAULT_REDTEAM_EXECUTION_POLICY,
  parseRedTeamExecutionPolicy,
  type RedTeamExecutionPolicy,
} from './execution-policy.js'
import { parseStoredMcpPermissions, type McpPermission } from './mcp-permissions.js'
import { atomicWritePrivate } from './store.js'

/** Connection definitions contain no authentication data or shell arguments. */
export interface McpConnectionDefinition {
  readonly id: string
  readonly label: string
  readonly endpoint: string
  readonly transport: 'http' | 'stdio'
}

export interface SessionSettings {
  readonly mcpPermissions?: readonly McpPermission[]
  readonly policy: RedTeamExecutionPolicy
  readonly connections: readonly McpConnectionDefinition[]
}

/** Validate browser and durable connection definitions before invoking DSH. */
export function parseMcpConnection(value: unknown): McpConnectionDefinition {
  if (value === null || typeof value !== 'object') throw new Error('MCP 配置必须是对象。')
  const input = value as Record<string, unknown>
  if (typeof input.label !== 'string' || input.label.trim() === '' || input.label.length > 80) {
    throw new Error('工具名称长度必须为 1–80 个字符。')
  }
  if (typeof input.endpoint !== 'string' || input.endpoint.length > 2048) {
    throw new Error('接口地址无效。')
  }
  if (/[\r\n\0]/u.test(input.endpoint)) throw new Error('接口地址不能包含控制字符。')
  const endpoint = input.endpoint.trim()
  if (input.transport === 'http') {
    const url = new URL(endpoint)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('MCP 地址必须为 HTTP(S)，且不能包含凭证、查询参数或片段。')
    }
  } else if (input.transport === 'stdio') {
    if (!endpoint.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(endpoint)) {
      throw new Error('STDIO 请输入可执行文件的绝对路径，不支持 Shell 命令或参数。')
    }
  } else {
    throw new Error('DSH 当前支持 HTTP（Streamable HTTP）和 STDIO，不支持旧版 SSE。')
  }
  const label = input.label.trim()
  const id = `mcp-${createHash('sha256').update(`${label}\0${input.transport}\0${endpoint}`).digest('hex').slice(0, 20)}`
  return { id, label, endpoint, transport: input.transport }
}

/** Per-session settings, saved atomically with private permissions in the workspace. */
export class SessionSettingsStore {
  private readonly path: string

  constructor(root: string, sessionId: string) {
    const key = createHash('sha256').update(sessionId).digest('hex')
    this.path = join(root, 'sessions', `${key}.json`)
  }

  async load(): Promise<SessionSettings> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return { policy: DEFAULT_REDTEAM_EXECUTION_POLICY, connections: [] }
      }
      throw error
    }
    const value = JSON.parse(raw) as Record<string, unknown>
    if (
      value?.version !== 1 ||
      !Array.isArray(value.connections) ||
      value.connections.length > 16
    ) {
      throw new Error('会话设置版本或 MCP 列表无效。')
    }
    return {
      ...(value.mcpPermissions === undefined
        ? {}
        : { mcpPermissions: parseStoredMcpPermissions(value.mcpPermissions) }),
      policy: parseRedTeamExecutionPolicy(value.policy),
      connections: value.connections.map(parseMcpConnection),
    }
  }

  async save(settings: SessionSettings): Promise<void> {
    await atomicWritePrivate(
      this.path,
      `${JSON.stringify({ version: 1, ...settings }, undefined, 2)}\n`,
    )
  }
}
