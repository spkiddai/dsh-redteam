import { TeamError, type TeamStore } from '../lib/team-database.js'

export interface PluginContext {
  team: TeamStore
}
export interface PrismPlugin {
  id: string
  name: string
  version: string
  description: string
  dependencies?: readonly string[]
  setup(context: PluginContext): Promise<{
    actions: Readonly<
      Record<string, (userId: string, input: Record<string, unknown>) => Promise<unknown>>
    >
    dispose?(): Promise<void>
  }>
}

/** Trusted code registrations only. Remote payloads never become executable plugins. */
export class PluginHost {
  private readonly active: { plugin: PrismPlugin; dispose?: () => Promise<void> }[] = []
  private readonly actions = new Map<
    string,
    (userId: string, input: Record<string, unknown>) => Promise<unknown>
  >()
  constructor(private readonly context: PluginContext) {}
  async start(plugins: readonly PrismPlugin[]) {
    if (this.active.length) throw new Error('Plugins already started')
    const pending = [...plugins]
    if (new Set(pending.map((p) => p.id)).size !== pending.length)
      throw new Error('Duplicate plugin id')
    try {
      while (pending.length) {
        const index = pending.findIndex((p) =>
          (p.dependencies ?? []).every((id) => this.active.some((a) => a.plugin.id === id)),
        )
        if (index < 0) throw new Error('Missing or circular plugin dependency')
        const plugin = pending.splice(index, 1)[0]!
        const instance = await plugin.setup(this.context)
        this.active.push({ plugin, ...(instance.dispose ? { dispose: instance.dispose } : {}) })
        for (const [action, run] of Object.entries(instance.actions)) {
          if (!/^[a-z][a-z0-9-]*$/u.test(action) || this.actions.has(action))
            throw new Error('Duplicate or invalid plugin action')
          this.actions.set(action, run)
        }
      }
    } catch (error) {
      await this.close()
      throw error
    }
  }
  catalog() {
    return this.active.map(({ plugin }) => ({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      status: 'ready' as const,
    }))
  }
  async api(userId: string, action: string, input: Record<string, unknown>) {
    await this.context.team.refresh()
    if (!this.context.team.user(userId)) throw new TeamError(401, '请重新登录。')
    if (action === 'plugins-list')
      return {
        plugins: this.catalog(),
        runtime: 'prism',
        agent: {
          available: false,
          message: '原 DSH Agent 会话尚未迁移。内置扫描与资产管理可直接使用。',
        },
      }
    const run = this.actions.get(action)
    if (!run) throw new TeamError(404, '接口不存在。')
    return run(userId, input)
  }
  async close() {
    this.actions.clear()
    const failures: unknown[] = []
    for (const instance of this.active.splice(0).reverse()) {
      try {
        await instance.dispose?.()
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Plugin shutdown failed')
  }
}
