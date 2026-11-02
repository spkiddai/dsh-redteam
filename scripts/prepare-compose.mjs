import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
try {
  await writeFile(
    new URL('../.env', import.meta.url),
    `PRISM_DB_PASSWORD=${randomBytes(32).toString('hex')}\nPRISM_ORIGIN=http://127.0.0.1:3080\nPRISM_PORT=3080\n`,
    { flag: 'wx', mode: 0o600 },
  )
  console.info('已生成 .env 数据库密码。启动：docker compose up -d --build')
} catch (error) {
  if (error.code === 'EEXIST') console.info('.env 已存在，未覆盖；请确认已设置 PRISM_DB_PASSWORD。')
  else throw error
}
