import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { authCookie, readAuthCookie } from '../lib/local-auth.js'
import { TeamError, type TeamStore } from '../lib/team-database.js'
import { loginPage } from '../plugins/login-page.js'
export interface HttpOptions {
  auth: TeamStore
  api(userId: string, action: string, input: Record<string, unknown>): Promise<unknown>
  client: string
  port: number
  host?: '127.0.0.1' | '0.0.0.0'
  publicOrigin?: string
}
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}
async function bytes(req: IncomingMessage, max = 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk)
    if (size > max) throw new TeamError(413, '请求过大。')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
async function body(req: IncomingMessage) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new TeamError(400, '请求格式无效。')
  let parsed: unknown
  try {
    parsed = JSON.parse((await bytes(req, 16384)).toString())
  } catch {
    throw new TeamError(400, '请求格式无效。')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TeamError(400, '请求格式无效。')
  return parsed as Record<string, unknown>
}
export async function startHttp(options: HttpOptions) {
  const publicUrl = options.publicOrigin ? new URL(options.publicOrigin) : undefined
  if (
    publicUrl &&
    (!['http:', 'https:'].includes(publicUrl.protocol) ||
      publicUrl.pathname !== '/' ||
      publicUrl.search ||
      publicUrl.hash ||
      publicUrl.username ||
      publicUrl.password)
  )
    throw new Error('棱镜访问地址必须为完整的 HTTP(S) 源地址。')
  const { auth } = options
  let origin = '',
    pendingLogins = 0
  const cookie = (token: string) => authCookie(token, publicUrl?.protocol === 'https:')
  const acceptable = (req: IncomingMessage) =>
    req.headers.host === new URL(origin).host &&
    (!req.headers.origin || req.headers.origin === origin)
  const server = createServer((req, res) => {
    void (async () => {
      if (!acceptable(req)) throw new TeamError(403, '请求来源无效。')
      const url = new URL(req.url ?? '/', origin)
      if (url.origin !== origin) throw new TeamError(403, '请求来源无效。')
      if (!['GET', 'HEAD'].includes(req.method ?? '') && req.headers.origin !== origin)
        throw new TeamError(403, '请求来源无效。')
      const token = readAuthCookie(req.headers.cookie),
        user = await auth.authenticate(token)
      if (url.pathname === '/prism-auth/state' && req.method === 'GET') {
        await auth.db.query('SELECT 1')
        return json(res, 200, {
          initialized: true,
          authenticated: !!user,
          ...(user
            ? {
                username: user.username,
                passwordChangeRecommended: user.must_change,
                role: user.role,
              }
            : {}),
        })
      }
      if (url.pathname === '/prism-auth/logout' && req.method === 'POST') {
        if (token) await auth.logout(token)
        res.setHeader('set-cookie', cookie(''))
        return json(res, 200, { ok: true })
      }
      if (url.pathname === '/prism-auth/login' && req.method === 'POST') {
        if (pendingLogins >= 4) throw new TeamError(429, '尝试过于频繁，请稍后再试。')
        pendingLogins++
        try {
          const input = await body(req)
          if (typeof input.username !== 'string' || typeof input.password !== 'string')
            throw new TeamError(400, '请输入账号和密码。')
          const result = await auth.login(
            input.username,
            input.password,
            req.socket.remoteAddress ?? 'local',
          )
          if (token) await auth.logout(token)
          res.setHeader('set-cookie', cookie(result.token))
          return json(res, 200, { ok: true, passwordChangeRecommended: result.user.must_change })
        } finally {
          pendingLogins--
        }
      }
      if (url.pathname === '/prism-auth/password' && req.method === 'POST') {
        if (!user) throw new TeamError(401, '请先登录。')
        const input = await body(req)
        if (typeof input.oldPassword !== 'string' || typeof input.password !== 'string')
          throw new TeamError(400, '参数无效。')
        const fresh = await auth.changePassword(user.id, input.oldPassword, input.password)
        res.setHeader('set-cookie', cookie(fresh))
        return json(res, 200, { ok: true })
      }
      if (url.pathname === '/login' && req.method === 'GET') {
        if (user && !url.searchParams.has('password')) {
          res.writeHead(303, { location: '/', 'cache-control': 'no-store' })
          return res.end()
        }
        const nonce = randomBytes(16).toString('base64')
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
          'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
        })
        return res.end(loginPage(nonce))
      }
      if (!user || !token) {
        if (
          req.method === 'GET' &&
          (url.pathname === '/' || req.headers.accept?.includes('text/html'))
        ) {
          res.writeHead(303, { location: '/login', 'cache-control': 'no-store' })
          return res.end()
        }
        throw new TeamError(401, '请先登录棱镜。')
      }
      if (url.pathname.startsWith('/prism-api/')) {
        const action = url.pathname.slice('/prism-api/'.length)
        if (req.method !== 'POST' && !(req.method === 'GET' && action === 'state'))
          throw new TeamError(405, '请求方式无效。')
        return json(
          res,
          200,
          await options.api(user.id, action, req.method === 'GET' ? {} : await body(req)),
        )
      }
      if (!['GET', 'HEAD'].includes(req.method ?? '')) throw new TeamError(405, '请求方式无效。')
      res.setHeader('x-content-type-options', 'nosniff')
      res.setHeader('referrer-policy', 'no-referrer')
      res.setHeader('cache-control', 'private, no-cache')
      if (url.pathname === '/assets/app.js') {
        res.setHeader('content-type', 'text/javascript; charset=utf-8')
        return res.end(req.method === 'HEAD' ? undefined : options.client)
      }
      if (url.pathname !== '/') throw new TeamError(404, '接口不存在。')
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader(
        'content-security-policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      )
      return res.end(
        req.method === 'HEAD'
          ? undefined
          : '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>棱镜 · PRISM</title></head><body style="margin:0"><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>',
      )
    })().catch((error) => {
      if (!res.headersSent)
        json(res, error instanceof TeamError ? error.status : 503, {
          error: error instanceof TeamError ? error.message : '服务暂不可用。',
        })
      else res.destroy()
    })
  })
  server.requestTimeout = 30000
  server.headersTimeout = 15000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host ?? '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('棱镜登录服务启动失败。')
  origin = publicUrl?.origin ?? `http://127.0.0.1:${address.port}`
  return {
    origin,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
