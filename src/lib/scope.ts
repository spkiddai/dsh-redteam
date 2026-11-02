import { isAbsolute, relative, resolve } from 'node:path'

export class ScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScopeError'
  }
}

export function isPathWithin(root: string, target: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(resolvedRoot, target)
  const relation = relative(resolvedRoot, resolvedTarget)
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

export function resolveWithin(root: string, target = '.'): string {
  if (!isPathWithin(root, target)) {
    throw new ScopeError(`path is outside the authorized workspace: ${target}`)
  }
  return resolve(root, target)
}

export function normalizeRelativePath(root: string, target: string): string {
  const relation = relative(resolve(root), resolve(target))
  return relation === '' ? '.' : relation.replaceAll('\\', '/')
}
