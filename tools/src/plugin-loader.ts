import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineToolPlugin, type RedTeamToolPlugin } from './plugin.js'

export const TOOL_PLUGIN_PATHS_ENV = 'DSH_REDTEAM_TOOL_PLUGIN_PATHS'

interface ResolvedPluginModule {
  readonly enforceDirectoryName: boolean
  readonly modulePath: string
  readonly pluginDirectory: string
}

async function readable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function resolvePluginModule(path: string): Promise<ResolvedPluginModule> {
  const absolutePath = resolve(path)
  const metadata = await stat(absolutePath).catch(() => undefined)
  if (metadata?.isFile() === true) {
    return {
      enforceDirectoryName: false,
      modulePath: absolutePath,
      pluginDirectory: dirname(absolutePath),
    }
  }
  if (metadata?.isDirectory() !== true) throw new Error(`工具插件路径不存在：“${absolutePath}”`)

  for (const entry of ['index.js', 'index.mjs']) {
    const modulePath = join(absolutePath, entry)
    if (await readable(modulePath)) {
      return { enforceDirectoryName: true, modulePath, pluginDirectory: absolutePath }
    }
  }
  throw new Error(`工具插件目录“${absolutePath}”缺少 index.js 或 index.mjs`)
}

export async function loadExternalToolPlugins(
  paths: readonly string[],
): Promise<readonly RedTeamToolPlugin[]> {
  const plugins: RedTeamToolPlugin[] = []
  for (const path of paths) {
    const resolved = await resolvePluginModule(path)
    const module = (await import(pathToFileURL(resolved.modulePath).href)) as Record<
      string,
      unknown
    >
    const candidate = module.default ?? module.plugin
    if (typeof candidate !== 'object' || candidate === null) {
      throw new Error(`工具插件模块“${resolved.modulePath}”必须默认导出插件对象`)
    }
    const plugin = defineToolPlugin(candidate as unknown as RedTeamToolPlugin)
    if (resolved.enforceDirectoryName && basename(resolved.pluginDirectory) !== plugin.name) {
      throw new Error(
        `工具插件目录名“${basename(resolved.pluginDirectory)}”必须与插件名称“${plugin.name}”一致`,
      )
    }
    plugins.push(plugin)
  }
  return plugins
}

export async function loadExternalToolPluginsFromEnvironment(
  value = process.env[TOOL_PLUGIN_PATHS_ENV],
): Promise<readonly RedTeamToolPlugin[]> {
  const paths = (value ?? '')
    .split(delimiter)
    .map((path) => path.trim())
    .filter((path) => path !== '')
  return await loadExternalToolPlugins(paths)
}
