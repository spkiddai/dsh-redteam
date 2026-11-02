import {
  copyFile,
  mkdir,
  lstat,
  readlink,
  readFile,
  cp,
  mkdtemp,
  writeFile,
  rename,
  unlink,
  rm,
} from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

// The image owns the Web profile and code; the volume owns accounts and sessions.
const home = process.env.DSH_HOME ?? '/data'
const profile = join(home, 'profiles/web')
const seed = '/opt/prism-seed/profiles/web'
await mkdir(profile, { recursive: true, mode: 0o700 })
for (const name of ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml']) {
  await copyFile(join(seed, name), join(profile, name))
}
const modules = join(profile, 'node_modules')
const marker = '.prism-image-owned'
let existing
try {
  existing = await lstat(modules)
  if (existing.isSymbolicLink()) {
    if ((await readlink(modules)) !== join(seed, 'node_modules'))
      throw new Error('容器专用数据卷中存在其他 node_modules 链接，请使用独立数据卷。')
  } else if (!(await readFile(join(modules, marker), 'utf8').catch(() => '')).startsWith('prism:'))
    throw new Error('容器专用数据卷中存在其他 node_modules，请使用独立数据卷。')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
// DSH scopes runtime resolution to physical profile paths. A root symlink escapes
// that scope; --preserve-symlinks duplicates native modules and breaks Agent scopes.
// Replace only image-owned code. Accounts, sessions and projects remain untouched.
const staged = await mkdtemp(join(profile, '.prism-modules-'))
await cp(join(seed, 'node_modules'), staged, { recursive: true, dereference: true })
await writeFile(join(staged, marker), 'prism: image-managed runtime\n')
const previous = `${staged}-previous`
if (existing?.isSymbolicLink()) await unlink(modules)
else if (existing) await rename(modules, previous)
await rename(staged, modules)
if (existing && !existing.isSymbolicLink()) await rm(previous, { recursive: true })
const manifest = JSON.parse(
  await readFile('/opt/prism/node_modules/@deepseek-ai/dsh/package.json', 'utf8'),
)
const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.dsh
const child = spawn(
  process.execPath,
  [
    join('/opt/prism/node_modules/@deepseek-ai/dsh', bin),
    'web',
    '--patch',
    '/opt/prism/container.patch.yml',
    '--no-open',
  ],
  { stdio: 'inherit', env: process.env },
)
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal))
child.on('error', () => {
  console.error('棱镜内核启动失败。')
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
