#!/usr/bin/env node

import {
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HELP = `Usage: dsh-redteam install [--home <DSH_HOME>] [--profile <name>]
       dsh-redteam install-preset [--home <DSH_HOME>]

Install the Red Team mode and activate its single plugin in a DSH profile.
The compatibility install-preset command only copies the preset.
Neither command overwrites a changed preset or unrelated profile configuration.`

export interface CliOptions {
  readonly command: 'install' | 'install-preset'
  readonly home: string
  readonly profile: string
}

export function parseArguments(arguments_: readonly string[]): CliOptions {
  const command = arguments_[0]
  if (command !== 'install' && command !== 'install-preset') throw new Error(HELP)
  let home = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'))
  let profile = 'web'
  for (let index = 1; index < arguments_.length; index += 2) {
    const flag = arguments_[index]
    const value = arguments_[index + 1]
    if (value === undefined) throw new Error(HELP)
    if (flag === '--home') home = resolve(value)
    else if (flag === '--profile' && command === 'install') profile = value
    else throw new Error(HELP)
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(profile)) {
    throw new Error('dsh-redteam: profile name contains unsupported characters')
  }
  return { command, home, profile }
}

export function parseHome(arguments_: readonly string[]): string {
  return parseArguments(arguments_).home
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

const MCP_SERVER_PLACEHOLDER = '__DSH_REDTEAM_MCP_SERVER__'

function renderPreset(source: string, mcpServerPath: string): string {
  const occurrences = source.split(MCP_SERVER_PLACEHOLDER).length - 1
  if (occurrences === 0) return source
  if (occurrences !== 1) {
    throw new Error('dsh-redteam: preset must contain exactly one MCP server placeholder')
  }
  return source.replace(MCP_SERVER_PLACEHOLDER, JSON.stringify(mcpServerPath))
}

async function samePreset(source: string, target: string, mcpServerPath: string): Promise<boolean> {
  try {
    const names = ['agent.cordis.yml', 'preset.yml']
    const pairs = await Promise.all(
      names.map(async (name) => {
        const expected = await readFile(join(source, name), 'utf8')
        return [
          name === 'agent.cordis.yml' ? renderPreset(expected, mcpServerPath) : expected,
          await readFile(join(target, name), 'utf8'),
        ]
      }),
    )
    return pairs.every(([left, right]) => left === right)
  } catch {
    return false
  }
}

async function tighten(directory: string): Promise<void> {
  await chmod(directory, 0o700)
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await tighten(path)
      else await chmod(path, 0o600)
    }),
  )
}

export interface InstallResult {
  readonly state: 'already-installed' | 'installed'
  readonly target: string
}

export async function installPreset(
  home: string,
  source = fileURLToPath(new URL('../preset/redteam/', import.meta.url)),
  mcpServerPath = fileURLToPath(new URL('../tools/dist/server.js', import.meta.url)),
): Promise<InstallResult> {
  const parent = join(home, '.agent-presets')
  const target = join(parent, 'redteam')
  if (await exists(target)) {
    if (await samePreset(source, target, mcpServerPath)) {
      return { state: 'already-installed', target }
    }
    throw new Error(`dsh-redteam: refusing to overwrite the existing preset at ${target}`)
  }
  await mkdir(parent, { mode: 0o700, recursive: true })
  await cp(source, target, { errorOnExist: true, force: false, recursive: true })
  const agentConfigPath = join(target, 'agent.cordis.yml')
  const agentConfig = await readFile(agentConfigPath, 'utf8')
  await writeFile(agentConfigPath, renderPreset(agentConfig, mcpServerPath), 'utf8')
  await tighten(target)
  return { state: 'installed', target }
}

export interface ActivationResult {
  readonly state: 'activated' | 'already-active'
  readonly target: string
}

const PLUGIN_PATCH = `- insert:
    - id: dsh-redteam
      name: '@prism-ai/dsh-redteam'
`

function patchWithPlugin(source: string): string | undefined {
  const idPattern = /^\s*-?\s*id:\s*['"]?dsh-redteam['"]?\s*(?:#.*)?$/mu
  if (idPattern.test(source)) {
    if (/^\s*name:\s*['"]?@prism-ai\/dsh-redteam['"]?\s*(?:#.*)?$/mu.test(source)) {
      return undefined
    }
    throw new Error('dsh-redteam: profile already contains a different dsh-redteam row')
  }

  const material = source
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
  if (material.length === 0) return `${source.trimEnd()}\n${PLUGIN_PATCH}`.replace(/^\n/u, '')
  if (material.length === 1 && material[0]?.trim() === '[]') {
    return source.replace(/^\s*\[\]\s*$/mu, PLUGIN_PATCH.trimEnd())
  }
  if (!source.split(/\r?\n/u).some((line) => line.startsWith('- '))) {
    throw new Error('dsh-redteam: refusing to modify an unrecognized profile patch')
  }
  return `${source.trimEnd()}\n\n${PLUGIN_PATCH}`
}

/** Add the one host row needed to expose the client dashboard at browser boot. */
export async function activateProfile(home: string, profile = 'web'): Promise<ActivationResult> {
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(profile)) {
    throw new Error('dsh-redteam: profile name contains unsupported characters')
  }
  const target = join(home, 'profiles', profile, 'cordis.patch.yml')
  let source: string
  let mode: number
  try {
    ;[source, mode] = await Promise.all([
      readFile(target, 'utf8'),
      stat(target).then((entry) => entry.mode & 0o777),
    ])
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      throw new Error(
        `dsh-redteam: DSH profile "${profile}" is not initialized; install the package into that profile first`,
      )
    }
    throw error
  }
  const next = patchWithPlugin(source)
  if (next === undefined) return { state: 'already-active', target }
  const temporary = `${target}.dsh-redteam-${process.pid}.tmp`
  await writeFile(temporary, next, { encoding: 'utf8', flag: 'wx', mode })
  await rename(temporary, target)
  return { state: 'activated', target }
}

export async function main(arguments_ = process.argv.slice(2)): Promise<void> {
  const options = parseArguments(arguments_)
  const preset = await installPreset(options.home)
  const action = preset.state === 'installed' ? 'installed' : 'is already installed'
  console.log(`dsh-redteam: Red Team mode ${action} at ${preset.target}`)
  if (options.command === 'install') {
    const activation = await activateProfile(options.home, options.profile)
    const activationAction = activation.state === 'activated' ? 'activated' : 'is already active'
    console.log(
      `dsh-redteam: dashboard plugin ${activationAction} for profile "${options.profile}" at ${activation.target}`,
    )
  }
}

const entrypoint = process.argv[1]
const entrypointUrl =
  entrypoint === undefined
    ? undefined
    : pathToFileURL(await realpath(entrypoint).catch(() => resolve(entrypoint))).href
if (entrypointUrl === import.meta.url) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
