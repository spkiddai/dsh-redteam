import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  commandToolResult,
  configuredBinary,
  jsonToolResult,
  resolveExecutable,
  runLocalCommand,
  unavailableToolResult,
} from '../../runtime.js'
import {
  normalizeHostTarget,
  normalizeMetasploitModule,
  normalizeMetasploitQuery,
  normalizeTargetUri,
} from '../../validation.js'

function binary(): string {
  return configuredBinary('PRISM_MSFCONSOLE_BIN', 'msfconsole')
}

async function runConsole(
  commands: readonly string[],
  timeoutSeconds: number,
  details: Readonly<Record<string, unknown>>,
) {
  const command = binary()
  const executable = await resolveExecutable(command)
  if (executable === undefined) return unavailableToolResult('Metasploit', command)
  const result = await runLocalCommand({
    args: ['-q', '-x', `${commands.join('; ')}; exit -y`],
    command: executable,
    timeoutMs: timeoutSeconds * 1_000,
  })
  return commandToolResult('metasploit', result, details)
}

export function registerMetasploitTools(server: McpServer): void {
  server.registerTool(
    'metasploit_status',
    {
      description: '检查本机 Metasploit msfconsole 是否已安装并返回版本。',
      annotations: { openWorldHint: false, readOnlyHint: true },
    },
    async () => {
      const command = binary()
      const executable = await resolveExecutable(command)
      if (executable === undefined) {
        return jsonToolResult({ available: false, command, tool: 'metasploit' })
      }
      const result = await runLocalCommand({ args: ['-v'], command: executable, timeoutMs: 20_000 })
      return commandToolResult('metasploit', result, { available: result.exitCode === 0 })
    },
  )

  server.registerTool(
    'metasploit_search',
    {
      description: '在本机 Metasploit 模块数据库中搜索模块，不连接目标。',
      inputSchema: z.object({ query: z.string() }),
      annotations: { openWorldHint: false, readOnlyHint: true },
    },
    async ({ query }) => {
      try {
        const normalized = normalizeMetasploitQuery(query)
        return await runConsole(['search ' + normalized], 60, { query: normalized })
      } catch (error) {
        return jsonToolResult(
          { error: error instanceof Error ? error.message : String(error), tool: 'metasploit' },
          true,
        )
      }
    },
  )

  server.registerTool(
    'metasploit_module_info',
    {
      description: '读取本机 Metasploit 模块说明，不连接目标。',
      inputSchema: z.object({ module: z.string() }),
      annotations: { openWorldHint: false, readOnlyHint: true },
    },
    async ({ module }) => {
      try {
        const normalized = normalizeMetasploitModule(module)
        return await runConsole(['info ' + normalized], 60, { module: normalized })
      } catch (error) {
        return jsonToolResult(
          { error: error instanceof Error ? error.message : String(error), tool: 'metasploit' },
          true,
        )
      }
    },
  )

  server.registerTool(
    'metasploit_check',
    {
      description: '仅执行 Metasploit 模块的 check 动作验证明确授权目标；不会调用 run 或 exploit。',
      inputSchema: z.object({
        authorizationConfirmed: z.literal(true).describe('仅当用户已明确授权该目标时传 true'),
        module: z.string(),
        rhost: z.string(),
        rport: z.number().int().min(1).max(65_535).optional(),
        ssl: z.boolean().optional(),
        targetUri: z.string().optional(),
        timeoutSeconds: z.number().int().min(30).max(300).default(180),
      }),
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
    },
    async ({ module, rhost, rport, ssl, targetUri, timeoutSeconds }) => {
      try {
        const normalizedModule = normalizeMetasploitModule(module)
        const normalizedHost = normalizeHostTarget(rhost, false)
        const commands = [`use ${normalizedModule}`, `set RHOSTS ${normalizedHost}`]
        if (rport !== undefined) commands.push(`set RPORT ${String(rport)}`)
        if (ssl !== undefined) commands.push(`set SSL ${ssl ? 'true' : 'false'}`)
        if (targetUri !== undefined) commands.push(`set TARGETURI ${normalizeTargetUri(targetUri)}`)
        commands.push('check')
        return await runConsole(commands, timeoutSeconds, {
          module: normalizedModule,
          rhost: normalizedHost,
        })
      } catch (error) {
        return jsonToolResult(
          { error: error instanceof Error ? error.message : String(error), tool: 'metasploit' },
          true,
        )
      }
    },
  )
}
