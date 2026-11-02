#!/usr/bin/env node

import { readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseDocument } from 'yaml'

const HELP = `Usage: dsh-redteam install [--home <DSH_HOME>] [--profile <name>]

Install the Red Team plugin and declarative preset into a DSH 0.2.1-rc.2 profile.
Existing unrelated profile configuration is preserved; changed plugin rows are never overwritten.`

export interface CliOptions {
  readonly command: 'install'
  readonly home: string
  readonly profile: string
}

function validateProfile(profile: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(profile)) {
    throw new Error('dsh-redteam: profile name contains unsupported characters')
  }
}

export function parseArguments(arguments_: readonly string[]): CliOptions {
  if (arguments_[0] !== 'install') throw new Error(HELP)
  let home = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'))
  let profile = 'web'
  for (let index = 1; index < arguments_.length; index += 2) {
    const flag = arguments_[index]
    const value = arguments_[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(HELP)
    if (flag === '--home') home = resolve(value)
    else if (flag === '--profile') profile = value
    else throw new Error(HELP)
  }
  validateProfile(profile)
  return { command: 'install', home, profile }
}

export interface ActivationResult {
  readonly state: 'activated' | 'already-active'
  readonly target: string
}

const BEGIN = '# BEGIN dsh-redteam managed preset'
const END = '# END dsh-redteam managed preset'
const MCP_SERVER_PLACEHOLDER = '__DSH_REDTEAM_MCP_SERVER__'

function patchWithPreset(source: string, preset: string): string | undefined {
  const block = `${BEGIN}\n${preset.trimEnd()}\n${END}`
  // Parse without executing Cordis expressions. Keep the original YAML text and comments.
  const document = parseDocument(source, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
  })
  if (document.errors.length > 0 || document.warnings.length > 0) {
    throw new Error('dsh-redteam: refusing to modify an invalid profile patch')
  }
  const entries: unknown = document.toJS({ maxAliasCount: 100 })
  if (entries !== null && !Array.isArray(entries)) {
    throw new Error('dsh-redteam: refusing to modify an unrecognized profile patch')
  }
  const withoutBlock = source.replace(block, '')
  const ownedRow = /^\s*-?\s*id:\s*['"]?(?:dsh-redteam|preset-redteam)['"]?\s*(?:#.*)?$/mu
  if (ownedRow.test(withoutBlock) || withoutBlock.includes(BEGIN) || withoutBlock.includes(END)) {
    throw new Error('dsh-redteam: refusing to overwrite existing or changed Red Team rows')
  }
  if (source.includes(block)) return undefined
  if (Array.isArray(entries) && entries.length === 0) {
    const comments = source.split(/\r?\n/u).filter((line) => line.trimStart().startsWith('#'))
    return [...comments, block, ''].join('\n')
  }
  return `${source.trimEnd()}\n\n${block}\n`.trimStart()
}

/** Install the host plugin and the current declarative preset in one atomic profile edit. */
export async function activateProfile(
  home: string,
  profile = 'web',
  presetPath = fileURLToPath(new URL('../preset/redteam/cordis.patch.yml', import.meta.url)),
  mcpServerPath = fileURLToPath(new URL('../tools/dist/server.js', import.meta.url)),
): Promise<ActivationResult> {
  validateProfile(profile)
  const target = join(home, 'profiles', profile, 'cordis.patch.yml')
  let source: string
  let mode: number
  try {
    ;[source, mode] = await Promise.all([
      readFile(target, 'utf8'),
      stat(target).then((entry) => entry.mode & 0o777),
    ])
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `dsh-redteam: DSH profile "${profile}" is not initialized; install the package into that profile first`,
      )
    }
    throw error
  }
  const template = await readFile(presetPath, 'utf8')
  if (template.split(MCP_SERVER_PLACEHOLDER).length !== 2) {
    throw new Error('dsh-redteam: preset must contain exactly one MCP server placeholder')
  }
  const preset = template.replace(MCP_SERVER_PLACEHOLDER, JSON.stringify(mcpServerPath))
  const next = patchWithPreset(source, preset)
  if (next === undefined) return { state: 'already-active', target }
  const temporary = `${target}.dsh-redteam-${process.pid}.tmp`
  await writeFile(temporary, next, { encoding: 'utf8', flag: 'wx', mode })
  await rename(temporary, target)
  return { state: 'activated', target }
}

export async function main(arguments_ = process.argv.slice(2)): Promise<void> {
  const options = parseArguments(arguments_)
  const activation = await activateProfile(options.home, options.profile)
  const action = activation.state === 'activated' ? 'activated' : 'is already active'
  console.log(
    `dsh-redteam: Red Team mode ${action} for profile "${options.profile}" at ${activation.target}`,
  )
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
