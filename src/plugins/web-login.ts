import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { WebStartupValues } from '@deepseek-ai/dsh-web-app/startup'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { startAuthGateway } from './auth-gateway.js'
import { TeamStore, postgresDatabase } from '../lib/team-database.js'
import { NativeScans } from '../lib/native-scans.js'
import { embeddedDatabase } from '../lib/embedded-database.js'
import { TeamBridge } from './team-bridge.js'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'

/** Attach one local authentication gateway to the existing DSH Web lifetime. */
export function installLogin(
  ctx: Context,
  config: {
    loginPort?: number
    accountRoot?: string
    loginHost?: '127.0.0.1' | '0.0.0.0'
    loginOrigin?: string
    projectRoot?: string
  },
) {
  let team: TeamStore | undefined
  let policyHandler: ConnectionRpcHandler | undefined
  ctx.inject(
    [
      'connection',
      'webServer',
      'webStartup',
      'remoteAccess',
      'typertGateway',
      'sessionController',
      'workspaceController',
    ],
    async (web) => {
      const upstream = web.webServer.getOrigin()
      const startup = web.get('webStartup') as WebStartupValues
      let upstreamCookie = ''
      web.connection.authorizeIndex(
        {
          method: 'GET',
          url: web.connection.authenticatedUrl(upstream),
          headers: { host: new URL(upstream).host },
        },
        {
          writeHead: (_status, headers) => {
            upstreamCookie = headers?.['set-cookie']?.split(';')[0] ?? ''
          },
          end: () => undefined,
        },
      )
      if (!upstreamCookie) throw new Error('无法初始化棱镜内核连接。')
      const root =
        config.accountRoot ??
        resolve(process.env.DSH_HOME ?? resolve(homedir(), '.dsh'), 'prism-auth')
      const database = process.env.PRISM_DATABASE_URL
        ? postgresDatabase(process.env.PRISM_DATABASE_URL)
        : embeddedDatabase(resolve(root, 'database'))
      web.effect(() => () => database.close(), 'prism database')
      team = new TeamStore(database)
      await team.initialize()
      const scans = new NativeScans(team)
      await scans.initialize()
      web.effect(() => () => scans.close(), 'prism native scanner')
      const bridge = new TeamBridge(
        web,
        team,
        config.projectRoot ?? resolve(root, 'projects'),
        () => policyHandler,
        scans,
      )
      const gateway = await startAuthGateway({
        auth: team,
        bridge,
        port: startup.port ?? config.loginPort ?? 3080,
        upstream,
        upstreamCookie,
        ...(config.loginHost ? { host: config.loginHost } : {}),
        ...(config.loginOrigin ? { publicOrigin: config.loginOrigin } : {}),
      })
      web.effect(() => () => gateway.close(), 'prism: local login gateway')
      console.info(`棱镜: ${gateway.origin}/`)
    },
  )
  return {
    setPolicyHandler: (handler: ConnectionRpcHandler) => {
      policyHandler = handler
    },
    allows: (peer: PeerScope, sessionId: string, action: 'read' | 'write' | 'manage') =>
      peer.principal.kind === 'owner' ||
      (peer.principal.kind === 'prism' &&
        !!team?.allowsSession(peer.principal.userId, sessionId, action)),
    admin: (peer: PeerScope) =>
      peer.principal.kind === 'owner' ||
      (peer.principal.kind === 'prism' && !!team?.can(peer.principal.userId, 'tools.manage')),
    managed: (sessionId: string) => !!team?.isManaged(sessionId),
    restricted: (sessionId: string) => !!team?.restrictedSession(sessionId),
  }
}
