import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { TeamError, type TeamStore } from '../lib/team-database.js'
import { redactEvidence } from '../lib/redact.js'

const inputSchema = z
  .object({
    projectId: z.string().min(1).max(100).nullable().default(null),
    type: z.enum(['domain', 'ip', 'url', 'service', 'organization']),
    value: z.string().trim().min(1).max(512),
    source: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine(
        (v) =>
          ['http:', 'https:'].includes(new URL(v).protocol) &&
          !new URL(v).username &&
          !new URL(v).password,
      ),
    note: z.string().trim().max(1000).default(''),
  })
  .strict()
export class Assets {
  constructor(private readonly team: TeamStore) {}
  async initialize() {
    await this.team.db.query(`CREATE TABLE IF NOT EXISTS prism_assets (
      id text PRIMARY KEY, owner_id text NOT NULL REFERENCES prism_users(id),
      project_id text REFERENCES prism_projects(id), data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now());`)
  }
  async api(userId: string, action: string, body: Record<string, unknown>) {
    if (action === 'asset-list') {
      const result = await this.team.db.query<{
        id: string
        owner_id: string
        project_id: string | null
        data: Record<string, unknown>
      }>(
        'SELECT id,owner_id,project_id,data FROM prism_assets ORDER BY created_at DESC LIMIT 10000',
      )
      return {
        assets: result.rows
          .filter((row) =>
            row.project_id
              ? this.team.allows(userId, row.project_id, 'read')
              : this.team.user(userId)?.role === 'admin' ||
                (row.owner_id === userId && this.team.can(userId, 'task.use')),
          )
          .map((row) => ({ id: row.id, projectId: row.project_id, ...row.data })),
      }
    }
    const parsed = inputSchema.safeParse(body)
    if (!parsed.success)
      throw new TeamError(400, '请填写资产类型、资产值及有效的 HTTP(S) 来源链接。')
    const input = parsed.data
    if (input.projectId) this.team.assertProject(userId, input.projectId, 'write')
    else this.team.assertPermission(userId, 'task.use')
    const id = randomUUID()
    const data = {
      type: input.type,
      value: redactEvidence(input.value, 512),
      source: redactEvidence(input.source, 2048),
      note: redactEvidence(input.note, 1000),
    }
    await this.team.db.transaction(async (db) => {
      await db.query(
        'INSERT INTO prism_assets (id,owner_id,project_id,data) VALUES ($1,$2,$3,$4::jsonb)',
        [id, userId, input.projectId, JSON.stringify(data)],
      )
      await db.query('INSERT INTO prism_audit(actor_id,action,subject_id) VALUES($1,$2,$3)', [
        userId,
        'asset.create',
        id,
      ])
    })
    return { id }
  }
}
