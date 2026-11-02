import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()

for (const name of ['coverage', 'dist', 'tools/dist']) {
  const target = resolve(root, name)
  if (target === root) throw new Error('refusing to remove the project root')
  await rm(target, { force: true, recursive: true })
}
