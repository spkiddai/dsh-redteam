import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { posix, win32 } from 'node:path'

export type BuiltInToolId = 'burp-suite' | 'metasploit' | 'nmap' | 'nuclei'

export interface BuiltInToolAvailability {
  readonly id: BuiltInToolId
  readonly installed: boolean
}

interface ToolDefinition {
  readonly commands: readonly string[]
  readonly environmentName: string
  readonly id: BuiltInToolId
  readonly macApplicationPaths?: readonly string[]
}

interface AvailabilityProbeOptions {
  readonly access?: (path: string, mode: number) => Promise<void>
  readonly environment?: Readonly<NodeJS.ProcessEnv>
  readonly platform?: NodeJS.Platform
}

const BUILT_IN_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    commands: ['nmap'],
    environmentName: 'PRISM_NMAP_BIN',
    id: 'nmap',
  },
  {
    commands: ['burpsuite', 'burp', 'burp-suite-professional', 'burp-suite-community'],
    environmentName: 'PRISM_BURP_BIN',
    id: 'burp-suite',
    macApplicationPaths: [
      '/Applications/Burp Suite Professional.app',
      '/Applications/Burp Suite Community Edition.app',
      '/Applications/Burp Suite.app',
    ],
  },
  {
    commands: ['msfconsole'],
    environmentName: 'PRISM_MSFCONSOLE_BIN',
    id: 'metasploit',
  },
  {
    commands: ['nuclei'],
    environmentName: 'PRISM_NUCLEI_BIN',
    id: 'nuclei',
  },
]

function executableCandidates(
  command: string,
  environment: Readonly<NodeJS.ProcessEnv>,
  platform: NodeJS.Platform,
): string[] {
  const path = platform === 'win32' ? win32 : posix
  if (path.isAbsolute(command)) return [command]
  if (command.includes('/') || command.includes('\\')) return []
  const pathEntries = (environment.PATH ?? '').split(path.delimiter).filter((entry) => entry !== '')
  if (platform !== 'win32') return pathEntries.map((entry) => path.join(entry, command))
  const extensions = (environment.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter((extension) => extension !== '')
  return pathEntries.flatMap((entry) =>
    extensions.map((extension) => path.join(entry, command + extension)),
  )
}

async function isAccessible(
  path: string,
  mode: number,
  checkAccess: (path: string, mode: number) => Promise<void>,
): Promise<boolean> {
  try {
    await checkAccess(path, mode)
    return true
  } catch {
    return false
  }
}

async function commandInstalled(
  command: string,
  options: Required<AvailabilityProbeOptions>,
): Promise<boolean> {
  for (const candidate of executableCandidates(command, options.environment, options.platform)) {
    if (await isAccessible(candidate, constants.X_OK, options.access)) return true
  }
  return false
}

async function toolInstalled(
  definition: ToolDefinition,
  options: Required<AvailabilityProbeOptions>,
): Promise<boolean> {
  const configured = options.environment[definition.environmentName]?.trim()
  if (configured !== undefined && configured !== '') {
    return await commandInstalled(configured, options)
  }
  for (const command of definition.commands) {
    if (await commandInstalled(command, options)) return true
  }
  if (options.platform === 'darwin') {
    for (const path of definition.macApplicationPaths ?? []) {
      if (await isAccessible(path, constants.F_OK, options.access)) return true
    }
  }
  return false
}

export async function detectBuiltInToolAvailability(
  probeOptions: AvailabilityProbeOptions = {},
): Promise<readonly BuiltInToolAvailability[]> {
  const options: Required<AvailabilityProbeOptions> = {
    access: probeOptions.access ?? access,
    environment: probeOptions.environment ?? process.env,
    platform: probeOptions.platform ?? process.platform,
  }
  return await Promise.all(
    BUILT_IN_TOOL_DEFINITIONS.map(async (definition) => ({
      id: definition.id,
      installed: await toolInstalled(definition, options),
    })),
  )
}
