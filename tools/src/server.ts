#!/usr/bin/env node

import { pathToFileURL } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerBurpTools } from './burp.js'
import { registerMetasploitTools } from './metasploit.js'
import { registerNmapTools } from './nmap.js'
import { registerNucleiTools } from './nuclei.js'

export function createRedTeamToolsServer(): McpServer {
  const server = new McpServer(
    { name: 'prism-redteam-tools', version: '1.0.0' },
    {
      instructions:
        'These adapters call locally installed security tools. Use network-facing tools only for targets the user explicitly authorized in the current project. Prefer status tools before scans, keep traffic bounded, and do not use the adapters for destructive actions, persistence, credential attacks, or denial of service.',
    },
  )
  registerNmapTools(server)
  registerBurpTools(server)
  registerMetasploitTools(server)
  registerNucleiTools(server)
  return server
}

export async function serveRedTeamTools(): Promise<void> {
  const server = createRedTeamToolsServer()
  await server.connect(new StdioServerTransport())
  console.error('Prism local security tools MCP server is ready')
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void serveRedTeamTools().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
