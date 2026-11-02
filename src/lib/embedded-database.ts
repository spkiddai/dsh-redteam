/// <reference types="emscripten" />
import { PGlite } from '@electric-sql/pglite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TeamDatabase, SqlConnection } from './team-database.js'

/** Local Node preview uses the same PostgreSQL SQL through embedded PGlite. */
export function embeddedDatabase(path: string): TeamDatabase {
  if (!path.startsWith('memory://')) mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const database = new PGlite(path)
  const adapt = (db: Pick<PGlite, 'query' | 'exec'>): SqlConnection => ({
    query: async (sql, values) =>
      values === undefined && sql.includes(';')
        ? (await db.exec(sql), { rows: [] })
        : await db.query(sql, values),
  })
  return {
    ...adapt(database),
    transaction: (operation) => database.transaction((tx) => operation(adapt(tx))),
    close: () => database.close(),
  }
}
