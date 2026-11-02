const SESSION_MS = 8 * 60 * 60 * 1000

export const AUTH_COOKIE = 'prism_session'
export function authCookie(token: string, secure = false): string {
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_MS / 1000 : 0}${secure ? '; Secure' : ''}`
}
export function readAuthCookie(header: string | undefined): string | undefined {
  const values = (header ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${AUTH_COOKIE}=`))
  if (values.length !== 1) return undefined
  const value = values[0]!.slice(AUTH_COOKIE.length + 1)
  return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : undefined
}
