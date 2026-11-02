import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const PLUGIN_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u

export interface RedTeamToolPlugin {
  readonly name: string
  readonly register: (server: McpServer) => void
}

export function defineToolPlugin(plugin: RedTeamToolPlugin): RedTeamToolPlugin {
  if (!PLUGIN_NAME_PATTERN.test(plugin.name)) {
    throw new Error(`工具插件名称“${plugin.name}”无效；仅支持小写字母、数字、连字符和下划线。`)
  }
  if (typeof plugin.register !== 'function')
    throw new Error(`工具插件“${plugin.name}”缺少 register()`)
  return plugin
}

export function registerToolPlugins(
  server: McpServer,
  plugins: readonly RedTeamToolPlugin[],
): void {
  const names = new Set<string>()
  for (const candidate of plugins) {
    const plugin = defineToolPlugin(candidate)
    if (names.has(plugin.name)) throw new Error(`工具插件名称重复：“${plugin.name}”`)
    names.add(plugin.name)
    plugin.register(server)
  }
}
