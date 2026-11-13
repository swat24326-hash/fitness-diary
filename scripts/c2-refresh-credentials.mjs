/**
 * Стенд: пароли c2-* заново + файл .c2-seed-credentials (0600).
 * Нужен, когда seed уже в базе, а файл паролей пропал (smoke ENOENT → аварийный r3-deploy).
 *
 * Usage (на стенде): sudo bash scripts/r2-vm-db-run.sh scripts/c2-refresh-credentials.mjs
 *   или: sudo -u osapp node --env-file=.env scripts/c2-refresh-credentials.mjs
 */
import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import pg from 'pg'
import { hashOwnPassword } from '../api/_lib/authOwnCore.js'
import { C2_SEED_STAFF, c2SeedCredentialsLines } from '../src/lib/c2SeedCore.js'
import { pgClientSslOption } from '../src/lib/pgMigrateOrderCore.js'

const CREDENTIALS_FILE = process.env.C2_SEED_CREDENTIALS_FILE || '/opt/fitness-diary/.c2-seed-credentials'

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!databaseUrl) {
    console.error('Задайте DATABASE_URL (Managed PG стенда).')
    process.exit(1)
  }
  const ssl = pgClientSslOption(databaseUrl)
  const client = new pg.Client({ connectionString: databaseUrl, ...(ssl !== undefined ? { ssl } : {}) })
  await client.connect()
  try {
    const passwords = {}
    const missing = []
    for (const s of C2_SEED_STAFF) {
      const found = await client.query(
        `SELECT id FROM public.users WHERE lower(login) = lower($1) LIMIT 1`,
        [s.login],
      )
      if (!found.rows[0]) {
        missing.push(s.login)
        continue
      }
      const password = randomBytes(12).toString('base64url')
      passwords[s.key] = password
      const hash = await hashOwnPassword(password)
      await client.query(`UPDATE public.users SET password_hash = $1 WHERE id = $2`, [hash, found.rows[0].id])
    }
    if (missing.length) {
      throw new Error(
        `Нет пользователей стенда: ${missing.join(', ')}. Сначала c2-seed-staging.mjs на пустой базе.`,
      )
    }
    const lines = c2SeedCredentialsLines(C2_SEED_STAFF, passwords)
    await writeFile(CREDENTIALS_FILE, `${lines.join('\n')}\n`, { mode: 0o600 })
    console.log(
      `credentials ok: ${C2_SEED_STAFF.map((s) => s.login).join(', ')}; пароли — в ${CREDENTIALS_FILE} (0600)`,
    )
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
