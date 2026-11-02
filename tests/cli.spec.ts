import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { scanRoot } from '@deepseek-ai/dsh-agent-presets'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { activateProfile, installPreset, main, parseArguments, parseHome } from '../src/cli.js'

const temporaryDirectories: string[] = []
const executeFile = promisify(execFile)

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

async function fixturePreset(): Promise<string> {
  const source = await temporaryDirectory('dsh-redteam-preset-source-')
  await writeFile(join(source, 'agent.cordis.yml'), '- id: dsh-redteam\n')
  await writeFile(join(source, 'preset.yml'), 'name: 红队模式\n')
  return source
}

describe('Red Team mode installer', () => {
  it('parses explicit and environment-backed DSH homes', () => {
    expect(parseHome(['install-preset', '--home', './fixture-home'])).toContain('fixture-home')
    vi.stubEnv('DSH_HOME', './environment-home')
    expect(parseHome(['install-preset'])).toContain('environment-home')
    expect(() => parseHome([])).toThrow('Usage: dsh-redteam install')
    expect(() => parseHome(['install-preset', '--unknown'])).toThrow('Usage:')
    expect(parseArguments(['install', '--profile', 'headless'])).toMatchObject({
      command: 'install',
      profile: 'headless',
    })
    expect(() => parseArguments(['install', '--profile', '../web'])).toThrow('profile name')
  })

  it('installs the preset with private permissions and is idempotent', async () => {
    const home = await temporaryDirectory('dsh-redteam-home-')
    const source = await fixturePreset()
    const installed = await installPreset(home, source)
    expect(installed.state).toBe('installed')
    expect(await readFile(join(installed.target, 'preset.yml'), 'utf8')).toContain('红队模式')
    if (process.platform !== 'win32') {
      expect((await stat(installed.target)).mode & 0o777).toBe(0o700)
      expect((await stat(join(installed.target, 'preset.yml'))).mode & 0o777).toBe(0o600)
    }
    expect((await installPreset(home, source)).state).toBe('already-installed')
  })

  it('renders the installed MCP server path without embedding a checkout-relative path', async () => {
    const home = await temporaryDirectory('dsh-redteam-mcp-preset-home-')
    const source = await fixturePreset()
    const mcpServerPath = '/Applications/Prism Tools/redteam-mcp.js'
    await writeFile(
      join(source, 'agent.cordis.yml'),
      '- id: local-tools\n  config:\n    args:\n      - __DSH_REDTEAM_MCP_SERVER__\n',
    )
    const installed = await installPreset(home, source, mcpServerPath)
    const config = await readFile(join(installed.target, 'agent.cordis.yml'), 'utf8')
    expect(config).toContain(JSON.stringify(mcpServerPath))
    expect(config).not.toContain('__DSH_REDTEAM_MCP_SERVER__')
    expect((await installPreset(home, source, mcpServerPath)).state).toBe('already-installed')
  })

  it('refuses to overwrite a changed preset', async () => {
    const home = await temporaryDirectory('dsh-redteam-home-')
    const source = await fixturePreset()
    const target = join(home, '.agent-presets', 'redteam')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'agent.cordis.yml'), 'user-owned: true\n')
    await writeFile(join(target, 'preset.yml'), 'name: 用户配置\n')
    await expect(installPreset(home, source)).rejects.toThrow('refusing to overwrite')
  })

  it('reports the command result without exposing preset contents', async () => {
    const home = await temporaryDirectory('dsh-redteam-home-')
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.stubEnv('DSH_HOME', home)
    await main(['install-preset'])
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Red Team mode installed'))
  })

  it('installs a healthy preset recognized by the DSH roster', async () => {
    const home = await temporaryDirectory('dsh-redteam-real-preset-home-')
    await installPreset(home)
    const presets = await scanRoot(
      { path: join(home, '.agent-presets'), trust: 'user' },
      new URL('.', import.meta.resolve('@deepseek-ai/dsh/package.json')).href,
    )
    expect(presets).toEqual([
      expect.objectContaining({
        description: expect.stringContaining('资产测绘'),
        id: 'redteam',
        name: '红队模式',
        order: 5,
      }),
    ])
    expect(presets[0]?.broken).toBeUndefined()
  })

  it('activates one host row without changing existing profile content', async () => {
    const home = await temporaryDirectory('dsh-redteam-profile-home-')
    const profile = join(home, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    await writeFile(
      join(profile, 'cordis.patch.yml'),
      '# user-owned settings\n- id: existing\n  config:\n    enabled: true\n',
    )
    const result = await activateProfile(home)
    expect(result.state).toBe('activated')
    const content = await readFile(result.target, 'utf8')
    expect(content).toContain('# user-owned settings')
    expect(content).toContain('id: existing')
    expect(content).toContain("name: '@prism-ai/dsh-redteam'")
    expect((await activateProfile(home)).state).toBe('already-active')
  })

  it('replaces only an empty profile patch and refuses a conflicting row', async () => {
    const home = await temporaryDirectory('dsh-redteam-empty-profile-home-')
    const profile = join(home, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    const patch = join(profile, 'cordis.patch.yml')
    await writeFile(patch, '# keep this comment\n[]\n')
    await activateProfile(home)
    expect(await readFile(patch, 'utf8')).toContain('# keep this comment')
    await writeFile(patch, '- insert:\n    - id: dsh-redteam\n      name: another-package\n')
    await expect(activateProfile(home)).rejects.toThrow('different dsh-redteam row')
  })

  it('runs through the executable symlink created by a package manager', async () => {
    const home = await temporaryDirectory('dsh-redteam-bin-home-')
    const binDirectory = await temporaryDirectory('dsh-redteam-bin-')
    const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts')
    const executable = join(binDirectory, 'dsh-redteam')
    await symlink(source, executable)
    const { stdout } = await executeFile(process.execPath, [
      executable,
      'install-preset',
      '--home',
      home,
    ])
    expect(stdout).toContain('Red Team mode installed')
    expect(await readFile(join(home, '.agent-presets', 'redteam', 'preset.yml'), 'utf8')).toContain(
      '红队模式',
    )
  })
})
