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
import { normalizeHttpUrl, normalizeNucleiTag } from './validation.js'

const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const

function binary(): string {
  return configuredBinary('PRISM_NUCLEI_BIN', 'nuclei')
}

export function registerNucleiTools(server: McpServer): void {
  server.registerTool(
    'nuclei_status',
    {
      description: '检查本机 Nuclei 是否已安装并返回版本。',
      annotations: { openWorldHint: false, readOnlyHint: true },
    },
    async () => {
      const command = binary()
      const executable = await resolveExecutable(command)
      if (executable === undefined) {
        return jsonToolResult({ available: false, command, tool: 'nuclei' })
      }
      const result = await runLocalCommand({
        args: ['-version'],
        command: executable,
        timeoutMs: 10_000,
      })
      return commandToolResult('nuclei', result, { available: result.exitCode === 0 })
    },
  )

  server.registerTool(
    'nuclei_scan',
    {
      description:
        '使用本机 Nuclei 对明确授权的 HTTP(S) URL 执行低并发模板扫描；禁用 unsigned、Interactsh、DoS 与 fuzz 模板。',
      inputSchema: z.object({
        authorizationConfirmed: z.literal(true).describe('仅当用户已明确授权这些 URL 时传 true'),
        rateLimit: z.number().int().min(1).max(50).default(10),
        severities: z
          .array(z.enum(SEVERITIES))
          .min(1)
          .max(SEVERITIES.length)
          .default(['medium', 'high', 'critical']),
        tags: z.array(z.string()).max(12).default([]),
        timeoutSeconds: z.number().int().min(30).max(600).default(300),
        urls: z.array(z.string()).min(1).max(16),
      }),
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
    },
    async ({ rateLimit, severities, tags, timeoutSeconds, urls }) => {
      const command = binary()
      const executable = await resolveExecutable(command)
      if (executable === undefined) return unavailableToolResult('Nuclei', command)
      let normalizedUrls: string[]
      let normalizedTags: string[]
      try {
        normalizedUrls = urls.map(normalizeHttpUrl)
        normalizedTags = [...new Set(tags.map(normalizeNucleiTag))]
      } catch (error) {
        return jsonToolResult(
          { error: error instanceof Error ? error.message : String(error), tool: 'nuclei' },
          true,
        )
      }
      const args = [
        '-silent',
        '-no-color',
        '-jsonl',
        '-disable-update-check',
        '-no-interactsh',
        '-disable-unsigned-templates',
        '-exclude-tags',
        'dos,fuzz',
        '-rate-limit',
        String(rateLimit),
        '-bulk-size',
        '10',
        '-concurrency',
        '5',
        '-timeout',
        '5',
        '-retries',
        '1',
        '-severity',
        [...new Set(severities)].join(','),
      ]
      if (normalizedTags.length > 0) args.push('-tags', normalizedTags.join(','))
      for (const url of normalizedUrls) args.push('-u', url)
      const result = await runLocalCommand({
        args,
        command: executable,
        timeoutMs: (timeoutSeconds + 15) * 1_000,
      })
      return commandToolResult('nuclei', result, {
        rateLimit,
        severities: [...new Set(severities)],
        tags: normalizedTags,
        urls: normalizedUrls,
      })
    },
  )
}
