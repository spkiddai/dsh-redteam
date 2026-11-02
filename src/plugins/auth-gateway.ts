import { randomBytes } from 'node:crypto'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { WebSocketServer } from 'ws'
import { authCookie, readAuthCookie } from '../lib/local-auth.js'
import { TeamError, TeamStore, tokenKey } from '../lib/team-database.js'
import type { TeamBridge, TeamPeer } from './team-bridge.js'
import { connectTeamStream } from './team-stream.js'
import { loginPage } from './login-page.js'

export interface AuthGatewayOptions {
  auth: TeamStore
  bridge: TeamBridge
  port: number
  host?: '127.0.0.1' | '0.0.0.0'
  publicOrigin?: string
  upstream: string
  upstreamCookie: string
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
export async function startAuthGateway(options: AuthGatewayOptions) {
  const upstream = new URL(options.upstream),
    publicUrl = options.publicOrigin ? new URL(options.publicOrigin) : undefined
  if (upstream.protocol !== 'http:' || upstream.hostname !== '127.0.0.1')
    throw new Error('棱镜内核必须监听本机 127.0.0.1 HTTP 地址。')
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
  const { auth, bridge } = options
  let origin = '',
    pendingLogins = 0
  const peers = new Map<
    string,
    { token: string; peer: TeamPeer; sockets: Set<{ destroy(): unknown }> }
  >()
  const cookie = (token: string) => authCookie(token, publicUrl?.protocol === 'https:')
  const closePeers = () => {
    for (const entry of peers.values()) {
      entry.peer.dispose()
      for (const s of entry.sockets) s.destroy()
    }
    peers.clear()
  }
  const stopChanges = auth.subscribe(closePeers)
  const peerFor = (token: string, userId: string) => {
    const key = tokenKey(token)
    let value = peers.get(key)
    if (!value) {
      value = { token, peer: bridge.createPeer(userId), sockets: new Set() }
      peers.set(key, value)
    }
    return value
  }
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
          await bridge.api(user.id, action, req.method === 'GET' ? {} : await body(req)),
        )
      }
      if (url.pathname.startsWith('/api/')) {
        await auth.refresh()
        const entry = peerFor(token, user.id),
          control = new AbortController()
        const resource = {
          destroy: () => {
            control.abort()
            res.destroy()
          },
        }
        entry.sockets.add(resource)
        res.once('close', () => {
          entry.sockets.delete(resource)
          control.abort()
        })
        const raw = ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : await bytes(req)
        const headers = new Headers({
          'content-type': req.headers['content-type'] ?? 'application/json',
        })
        const response = await entry.peer.fetch(
          new Request(upstream.origin + url.pathname + url.search, {
            method: req.method ?? 'GET',
            headers,
            signal: control.signal,
            ...(raw ? { body: new Uint8Array(raw) } : {}),
          }),
        )
        res.writeHead(response.status, {
          'content-type': response.headers.get('content-type') ?? 'application/json',
          'cache-control': 'no-store',
        })
        if (response.body) for await (const chunk of response.body) res.write(chunk)
        return res.end()
      }
      // The owner cookie may fetch only immutable client assets and the sanitized index.
      if (
        !['GET', 'HEAD'].includes(req.method ?? '') ||
        !(
          url.pathname === '/' ||
          /^\/(?:assets|plugins|locales)\//u.test(url.pathname) ||
          /^\/(?:favicon\.ico|favicon\.svg|manifest\.webmanifest)$/u.test(url.pathname)
        )
      )
        throw new TeamError(404, '接口不存在。')
      if (url.searchParams.has('token')) url.searchParams.delete('token')
      const forwarded = httpRequest(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          method: req.method,
          path: url.pathname + url.search,
          headers: {
            host: upstream.host,
            cookie: options.upstreamCookie,
            'accept-encoding': 'identity',
          },
        },
        (reply) => {
          if (url.pathname === '/') {
            const chunks: Buffer[] = []
            let length = 0
            reply.on('data', (chunk: Buffer) => {
              length += chunk.length
              if (length > 4 * 1024 * 1024) reply.destroy()
              else chunks.push(chunk)
            })
            reply.on('end', () => {
              try {
                res.writeHead(reply.statusCode ?? 502, {
                  'content-type': 'text/html; charset=utf-8',
                  'cache-control': 'no-store',
                })
                res.end(bridge.index(Buffer.concat(chunks).toString(), user.id))
              } catch {
                res.destroy()
              }
            })
          } else {
            res.writeHead(reply.statusCode ?? 502, {
              'content-type': reply.headers['content-type'] ?? 'application/octet-stream',
              'cache-control': 'private, no-cache',
            })
            reply.pipe(res)
          }
          reply.on('error', () => res.destroy())
        },
      )
      forwarded.on('error', () => {
        if (!res.headersSent) json(res, 502, { error: '棱镜内核暂不可用。' })
        else res.destroy()
      })
      res.once('close', () => forwarded.destroy())
      forwarded.end()
    })().catch((error) => {
      if (!res.headersSent)
        json(res, error instanceof TeamError ? error.status : 503, {
          error: error instanceof TeamError ? error.message : '服务暂不可用。',
        })
      else res.destroy()
    })
  })
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
  })
  server.on('upgrade', (req, socket, head) => {
    void (async () => {
      const token = readAuthCookie(req.headers.cookie)
      if (
        !acceptable(req) ||
        req.headers.origin !== origin ||
        req.url !== '/api/remote.mux' ||
        !token
      )
        throw new Error('Unauthorized')
      const user = await auth.authenticate(token)
      if (!user) throw new Error('Unauthorized')
      await auth.refresh()
      const entry = peerFor(token, user.id)
      wss.handleUpgrade(req, socket, head, (ws) => {
        entry.sockets.add(socket)
        socket.once('close', () => entry.sockets.delete(socket))
        connectTeamStream(ws, entry.peer)
      })
    })().catch(() => socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'))
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
  const interval = setInterval(() => {
    void (async () => {
      for (const entry of peers.values())
        if (!(await auth.authenticate(entry.token))) {
          closePeers()
          break
        }
    })().catch(closePeers)
  }, 15000)
  interval.unref()
  return {
    origin,
    close: async () => {
      clearInterval(interval)
      stopChanges()
      closePeers()
      wss.close()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
