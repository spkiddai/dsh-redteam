import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  commandToolResult,
  configuredBinary,
  jsonToolResult,
  resolveExecutable,
  runLocalCommand,
  unavailableToolResult,
} from './runtime.js'
import { normalizeHostTarget, normalizePorts } from './validation.js'

const NETWORK_TOOL_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
  readOnlyHint: false,
} as const

function binary(): string {
  return configuredBinary('PRISM_NMAP_BIN', 'nmap')
}

export function registerNmapTools(server: McpServer): void {
  server.registerTool(
    'nmap_status',
    {
      description: '检查本机 Nmap 是否已安装并返回版本。',
      annotations: { openWorldHint: false, readOnlyHint: true },
    },
    async () => {
      const command = binary()
      const executable = await resolveExecutable(command)
      if (executable === undefined) {
        return jsonToolResult({ available: false, command, tool: 'nmap' })
      }
      const result = await runLocalCommand({
        args: ['--version'],
        command: executable,
        timeoutMs: 10_000,
      })
      return commandToolResult('nmap', result, { available: result.exitCode === 0 })
    },
  )

  server.registerTool(
    'nmap_scan',
    {
      description:
        '对明确授权的 IP、CIDR 或域名执行低速、有限重试的 Nmap TCP 连接扫描。仅用于当前项目已授权目标。',
      inputSchema: z.object({
        authorizationConfirmed: z.literal(true).describe('仅当用户已明确授权这些目标时传 true'),
        ports: z
          .string()
          .optional()
          .describe('例如 80,443,8000-8100；省略时扫描最常见的 100 个端口'),
        profile: z.enum(['connect', 'service']).default('connect'),
        targets: z.array(z.string()).min(1).max(16),
        timeoutSeconds: z.number().int().min(30).max(600).default(300),
      }),
      annotations: NETWORK_TOOL_ANNOTATIONS,
    },
    async ({ ports, profile, targets, timeoutSeconds }) => {
      const command = binary()
      const executable = await resolveExecutable(command)
      if (executable === undefined) return unavailableToolResult('Nmap', command)
      let normalizedTargets: string[]
      let normalizedPorts: string | undefined
      try {
        normalizedTargets = targets.map((target) => normalizeHostTarget(target))
        normalizedPorts = ports === undefined ? undefined : normalizePorts(ports)
      } catch (error) {
        return jsonToolResult(
          { error: error instanceof Error ? error.message : String(error), tool: 'nmap' },
          true,
        )
      }
      const args = [
        '-n',
        '-sT',
        '-T3',
        '--max-retries',
        '2',
        '--host-timeout',
        `${String(timeoutSeconds)}s`,
        '--open',
        '-oN',
        '-',
      ]
      if (profile === 'service') args.push('-sV', '--version-light')
      if (normalizedPorts === undefined) args.push('--top-ports', '100')
      else args.push('-p', normalizedPorts)
      args.push(...normalizedTargets)
      const result = await runLocalCommand({
        args,
        command: executable,
        timeoutMs: (timeoutSeconds + 15) * 1_000,
      })
      return commandToolResult('nmap', result, {
        ports: normalizedPorts ?? 'top-100',
        profile,
        targets: normalizedTargets,
      })
    },
  )
}
