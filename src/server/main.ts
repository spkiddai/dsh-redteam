import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { postgresDatabase } from '../lib/team-database.js'
import { embeddedDatabase } from '../lib/embedded-database.js'
import { startApplication } from './app.js'

const root = resolve(process.env.PRISM_HOME ?? resolve(homedir(), '.prism-app'))
const port = Number(process.env.PRISM_PORT ?? 3080)
if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
  throw new Error('PRISM_PORT must be 1–65535')
const host = process.env.PRISM_HOST ?? '127.0.0.1'
if (host !== '127.0.0.1' && host !== '0.0.0.0') throw new Error('Invalid PRISM_HOST')
const database = process.env.PRISM_DATABASE_URL
  ? postgresDatabase(process.env.PRISM_DATABASE_URL)
  : embeddedDatabase(resolve(root, 'database'))
const app = await startApplication({
  database,
  projectRoot: resolve(process.env.PRISM_PROJECT_ROOT ?? resolve(root, 'projects')),
  client: await readFile(new URL('./app.js', import.meta.url), 'utf8'),
  port,
  host,
  ...(process.env.PRISM_ORIGIN ? { publicOrigin: process.env.PRISM_ORIGIN } : {}),
})
console.info(`棱镜独立服务: ${app.origin}/`)
let stopping = false
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    if (!stopping) {
      stopping = true
      void app.close().catch(() => {
        process.exitCode = 1
      })
    }
  })
