import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parse } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { activateProfile, main, parseArguments } from '../src/cli.js'

const temporaryDirectories: string[] = []
const executeFile = promisify(execFile)

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-redteam-installer-'))
  temporaryDirectories.push(directory)
  return directory
}

async function profilePatch(source = '[]\n') {
  const home = await temporaryDirectory()
  const directory = join(home, 'profiles', 'web')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const target = join(directory, 'cordis.patch.yml')
  await writeFile(target, source, { mode: 0o600 })
  return { home, target }
}

describe('DSH 0.2.1 Red Team installer', () => {
  it('accepts only the current installer command and safe profile names', () => {
    expect(parseArguments(['install', '--home', './fixture-home']).home).toContain('fixture-home')
    vi.stubEnv('DSH_HOME', './environment-home')
    expect(parseArguments(['install']).home).toContain('environment-home')
    expect(parseArguments(['install', '--profile', 'headless']).profile).toBe('headless')
    for (const args of [
      [],
      ['install-preset'],
      ['install', '--unknown'],
      ['install', '--home', '--profile'],
      ['install', '--unknown', 'value'],
    ]) {
      expect(() => parseArguments(args)).toThrow('Usage:')
    }
    expect(() => parseArguments(['install', '--profile', '../web'])).toThrow('profile name')
  })

  it('installs one host plugin and a declarative preset, keeping unrelated YAML unchanged', async () => {
    const original =
      '# user configuration\n- id: existing\n  config:\n    enabled: !!js process.platform !== "win32"\n'
    const { home, target } = await profilePatch(original)
    expect((await activateProfile(home)).state).toBe('activated')
    const content = await readFile(target, 'utf8')
    expect(content.startsWith(original)).toBe(true)
    const rows = parse(content, {
      customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
    })[1].insert
    expect(rows.map((row: { id: string }) => row.id)).toEqual(['dsh-redteam', 'preset-redteam'])
    expect(rows[1]).toMatchObject({
      name: '@deepseek-ai/dsh-agent-preset',
      config: { id: 'redteam', name: '红队模式', order: 5 },
    })
    const plugins = rows[1].config.plugins
    expect(plugins.find((row: { id: string }) => row.id === 'persona').config.prefix).toContain(
      'authorized',
    )
    expect(plugins.find((row: { id: string }) => row.id === 'tool-web').config.fetch).toBe(false)
    expect(content).toContain('@deepseek-ai/dsh-workflow-ptc')
    expect(content).not.toContain('__DSH_REDTEAM_MCP_SERVER__')
    expect((await activateProfile(home)).state).toBe('already-active')
    expect(await readFile(target, 'utf8')).toBe(content)
    if (process.platform !== 'win32') expect((await stat(target)).mode & 0o777).toBe(0o600)
  })

  it('renders a quoted MCP path with spaces and preserves empty-profile comments', async () => {
    const { home, target } = await profilePatch('# keep\n[]\n')
    const mcp = '/Applications/Prism "Tools"/server.js'
    await activateProfile(home, 'web', undefined, mcp)
    const content = await readFile(target, 'utf8')
    expect(content).toContain('# keep')
    expect(content).toContain(JSON.stringify(mcp))
    expect((await activateProfile(home, 'web', undefined, mcp)).state).toBe('already-active')
  })

  it.each(['', '# empty\n'])('accepts an empty patch (%j)', async (source) => {
    const { home, target } = await profilePatch(source)
    await activateProfile(home)
    expect(await readFile(target, 'utf8')).toContain('id: preset-redteam')
  })

  it.each([
    '- insert:\n    - id: dsh-redteam\n      name: another-package\n',
    '- insert:\n    - id: preset-redteam\n      name: user-preset\n',
    'invalid: [',
    'userOwned: true\n',
  ])('refuses conflicting or malformed patches without changing them', async (source) => {
    const { home, target } = await profilePatch(source)
    await expect(activateProfile(home)).rejects.toThrow('refusing')
    expect(await readFile(target, 'utf8')).toBe(source)
  })

  it('refuses an edited managed preset or an uninitialized profile', async () => {
    const { home, target } = await profilePatch()
    await activateProfile(home)
    const edited = (await readFile(target, 'utf8')).replace('order: 5', 'order: 8')
    await writeFile(target, edited)
    await expect(activateProfile(home)).rejects.toThrow('refusing to overwrite')
    expect(await readFile(target, 'utf8')).toBe(edited)
    await expect(activateProfile(home, 'missing')).rejects.toThrow('not initialized')
    await expect(activateProfile(home, '../web')).rejects.toThrow('profile name')
  })

  it('rejects an invalid packaged template before modifying the profile', async () => {
    const { home, target } = await profilePatch()
    const template = join(home, 'template.yml')
    await writeFile(template, '- insert: []\n')
    await expect(activateProfile(home, 'web', template)).rejects.toThrow('exactly one')
    expect(await readFile(target, 'utf8')).toBe('[]\n')
  })

  it('reports installation through the command and package-manager symlink', async () => {
    const { home, target } = await profilePatch()
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await main(['install', '--home', home])
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Red Team mode activated'))
    const executable = join(home, 'dsh-redteam')
    const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts')
    await symlink(source, executable)
    const { stdout } = await executeFile(process.execPath, [executable, 'install', '--home', home])
    expect(stdout).toContain('is already active')
    expect(await readFile(target, 'utf8')).toContain('红队模式')
  })
})
