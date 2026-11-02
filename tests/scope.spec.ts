import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathWithin, normalizeRelativePath, resolveWithin, ScopeError } from '../src/lib/scope.js'

describe('workspace scope', () => {
  const root = resolve('/tmp/dsh-redteam-workspace')

  it('accepts the root and descendants', () => {
    expect(isPathWithin(root, '.')).toBe(true)
    expect(isPathWithin(root, 'src/index.ts')).toBe(true)
    expect(resolveWithin(root, 'src')).toBe(resolve(root, 'src'))
  })

  it('rejects parent and absolute paths outside the root', () => {
    expect(isPathWithin(root, '../secrets')).toBe(false)
    expect(isPathWithin(root, '/etc/passwd')).toBe(false)
    expect(() => resolveWithin(root, '../secrets')).toThrow(ScopeError)
  })

  it('normalizes report paths to forward slashes', () => {
    expect(normalizeRelativePath(root, resolve(root, 'src', 'index.ts'))).toBe('src/index.ts')
    expect(normalizeRelativePath(root, root)).toBe('.')
  })
})
