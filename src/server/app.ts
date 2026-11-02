import { PluginHost, type PrismPlugin } from './plugins.js'
import { TeamService } from './team-service.js'
import { Assets } from './assets.js'
import { NativeScans } from '../lib/native-scans.js'
import { TeamStore, type TeamDatabase } from '../lib/team-database.js'
import { startHttp } from './http.js'

const actions = (
  names: readonly string[],
  api: (userId: string, action: string, input: Record<string, unknown>) => Promise<unknown>,
) =>
  Object.fromEntries(
    names.map((name) => [
      name,
      (userId: string, input: Record<string, unknown>) => api(userId, name, input),
    ]),
  )
export async function startApplication(options: {
  database: TeamDatabase
  projectRoot: string
  client: string
  port: number
  host?: '127.0.0.1' | '0.0.0.0'
  publicOrigin?: string
}) {
  const team = new TeamStore(options.database)
  const host = new PluginHost({ team })
  const plugins: PrismPlugin[] = [
    {
      id: 'identity',
      name: '账号与权限',
      version: '1.0.0',
      description: '统一登录、角色授权、用户例外权限与项目资源授权。',
      async setup() {
        await team.initialize()
        const service = new TeamService(team, options.projectRoot)
        return {
          actions: actions(
            [
              'state',
              'project-create',
              'role-save',
              'user-roles',
              'permission-set',
              'user-create',
              'user-update',
            ],
            (user, action, input) => service.api(user, action, input),
          ),
        }
      },
    },
    {
      id: 'scanner',
      name: '内置扫描',
      version: '1.0.0',
      dependencies: ['identity'],
      description: '网络端口、端口指纹漏洞和 Web 扫描；独立队列、复测及报告。',
      async setup() {
        const scans = new NativeScans(team)
        await scans.initialize()
        return {
          actions: actions(
            [
              'scan-catalog',
              'scan-list',
              'scan-get',
              'scan-create',
              'scan-control',
              'scan-compare',
              'scan-finding',
              'scan-rule-save',
            ],
            (user, action, input) => scans.api(user, action, input),
          ),
          dispose: () => scans.close(),
        }
      },
    },
    {
      id: 'assets',
      name: '资产台账',
      version: '1.0.0',
      dependencies: ['identity'],
      description: '带来源记录的资产台账，可独立使用，也可按项目共享。',
      async setup() {
        const assets = new Assets(team)
        await assets.initialize()
        return {
          actions: actions(['asset-list', 'asset-create'], (user, action, input) =>
            assets.api(user, action, input),
          ),
        }
      },
    },
  ]
  try {
    await host.start(plugins)
    const http = await startHttp({
      ...options,
      auth: team,
      api: (user, action, input) => host.api(user, action, input),
    })
    return {
      origin: http.origin,
      plugins: host.catalog(),
      async close() {
        try {
          await http.close()
          await host.close()
        } finally {
          await options.database.close()
        }
      },
    }
  } catch (error) {
    try {
      await host.close()
    } finally {
      await options.database.close()
    }
    throw error
  }
}
