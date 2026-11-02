import { Socket } from 'node:net'
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
import { normalizeHttpUrl } from './validation.js'

function curlBinary(): string {
  return configuredBinary('PRISM_CURL_BIN', 'curl')
}

function proxyHost(): string {
  const configured = process.env.PRISM_BURP_PROXY_HOST?.trim()
  return configured === undefined || configured === '' ? '127.0.0.1' : configured
}

function proxyPort(): number {
  const configured = Number(process.env.PRISM_BURP_PROXY_PORT ?? '8080')
  return Number.isInteger(configured) && configured >= 1 && configured <= 65_535 ? configured : 8080
}

function isLoopback(value: string): boolean {
  return ['127.0.0.1', '::1', 'localhost'].includes(value.toLocaleLowerCase())
}

async function canConnect(host: string, port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    const finish = (connected: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(connected)
    }
    socket.setTimeout(2_000)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
    socket.connect(port, host)
  })
}

export function registerBurpTools(server: McpServer): void {
  server.registerTool(
    'burp_status',
    {
      description: '检查本机 Burp 代理监听器和 curl 是否可用。',
      annotations: { openWorldHint: false, readOnlyHint: true },
    },
    async () => {
      const host = proxyHost()
      const port = proxyPort()
      const command = curlBinary()
      const [curl, proxyReachable] = await Promise.all([
        resolveExecutable(command),
        canConnect(host, port),
      ])
      return jsonToolResult({
        available: curl !== undefined && proxyReachable,
        curl: curl ?? null,
        proxy: `http://${host}:${String(port)}`,
        proxyReachable,
        tool: 'burp',
      })
    },
  )

  server.registerTool(
    'burp_proxy_request',
    {
      description:
        '通过本机 Burp 代理发送一个明确授权的 GET、HEAD 或 OPTIONS 请求，以便在 Burp 中检查流量。',
      inputSchema: z.object({
        allowInsecureTls: z.boolean().default(false),
        authorizationConfirmed: z.literal(true).describe('仅当用户已明确授权该 URL 时传 true'),
        method: z.enum(['GET', 'HEAD', 'OPTIONS']).default('GET'),
        timeoutSeconds: z.number().int().min(5).max(60).default(20),
        url: z.string(),
      }),
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
    },
    async ({ allowInsecureTls, method, timeoutSeconds, url }) => {
      const host = proxyHost()
      const port = proxyPort()
      if (!isLoopback(host)) {
        return jsonToolResult(
          { error: 'Burp 代理必须监听在本机回环地址', proxyHost: host, tool: 'burp' },
          true,
        )
      }
      const command = curlBinary()
      const executable = await resolveExecutable(command)
      if (executable === undefined) return unavailableToolResult('curl（Burp 适配器依赖）', command)
      if (!(await canConnect(host, port))) {
        return jsonToolResult(
          {
            error: '无法连接本机 Burp 代理，请启动 Burp 并确认代理监听端口。',
            proxy: `http://${host}:${String(port)}`,
            tool: 'burp',
          },
          true,
        )
      }
      let normalizedUrl: string
      try {
        normalizedUrl = normalizeHttpUrl(url)
      } catch (error) {
        return jsonToolResult(
          { error: error instanceof Error ? error.message : String(error), tool: 'burp' },
          true,
        )
      }
      const args = [
        '--silent',
        '--show-error',
        '--include',
        '--max-time',
        String(timeoutSeconds),
        '--proxy',
        `http://${host}:${String(port)}`,
        '--request',
        method,
      ]
      if (allowInsecureTls) args.push('--insecure')
      args.push('--url', normalizedUrl)
      const result = await runLocalCommand({
        args,
        command: executable,
        timeoutMs: (timeoutSeconds + 5) * 1_000,
      })
      return commandToolResult('burp', result, {
        method,
        proxy: `http://${host}:${String(port)}`,
        url: normalizedUrl,
      })
    },
  )
}
